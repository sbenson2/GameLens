/** API route handlers */

import type { Env, DocMeta, SearchIndexEntry } from "./types.js";
import { validateLicense, extractBearerToken } from "./license.js";
import { checkRateLimit, addRateLimitHeaders } from "./rate-limit.js";
import {
  jsonResponse,
  errorResponse,
  extractSection,
  truncateAtParagraph,
} from "./helpers.js";
import { tokenize, scoreDocument, buildDocFrequencies } from "./search.js";

// --- Helpers ---

async function resolveAuth(
  request: Request,
  env: Env
): Promise<{ tier: "free" | "pro"; licenseKey: string | null }> {
  const key = extractBearerToken(request);
  if (!key) return { tier: "free", licenseKey: null };

  const result = await validateLicense(key, env);
  return { tier: result.tier, licenseKey: key };
}

function getClientIp(request: Request): string {
  return (
    request.headers.get("CF-Connecting-IP") ??
    request.headers.get("X-Forwarded-For")?.split(",")[0]?.trim() ??
    "unknown"
  );
}

// --- Handlers ---

/** GET /v1/health */
export async function handleHealth(
  request: Request,
  _params: Record<string, string>,
  env: Env
): Promise<Response> {
  // Count docs in KV (stored as metadata on the index key)
  let docsCount = 0;
  try {
    const indexRaw = await env.DOCS_KV.get("index:manifest", "json");
    if (Array.isArray(indexRaw)) {
      docsCount = indexRaw.length;
    }
  } catch {
    // ignore
  }

  return jsonResponse({
    ok: true,
    data: {
      status: "ok",
      version: env.API_VERSION,
      docsCount,
    },
  });
}

/** GET /v1/docs — list docs with optional filters */
export async function handleListDocs(
  request: Request,
  _params: Record<string, string>,
  env: Env
): Promise<Response> {
  const { tier, licenseKey } = await resolveAuth(request, env);
  const clientIp = getClientIp(request);
  const rateResult = await checkRateLimit(licenseKey ?? clientIp, tier, env);

  if (!rateResult.allowed) {
    return addRateLimitHeaders(
      errorResponse("Rate limit exceeded", 429),
      rateResult
    );
  }

  const url = new URL(request.url);
  const moduleFilter = url.searchParams.get("module");
  const categoryFilter = url.searchParams.get("category");

  // Load manifest from KV
  let manifest: DocMeta[] = [];
  try {
    const raw = await env.DOCS_KV.get("index:manifest", "json");
    if (Array.isArray(raw)) {
      manifest = raw as DocMeta[];
    }
  } catch {
    return addRateLimitHeaders(
      errorResponse("Failed to load doc index", 500),
      rateResult
    );
  }

  // Apply filters
  let filtered = manifest;
  if (moduleFilter) {
    filtered = filtered.filter((d) => d.module === moduleFilter);
  }
  if (categoryFilter) {
    filtered = filtered.filter((d) => d.category === categoryFilter);
  }

  const response = jsonResponse({
    ok: true,
    data: {
      docs: filtered.map((d) => ({
        id: d.id,
        title: d.title,
        description: d.description,
        module: d.module,
        category: d.category,
        tier: d.tier,
        sizeBytes: d.sizeBytes,
      })),
      total: filtered.length,
      tier,
    },
  });

  return addRateLimitHeaders(response, rateResult);
}

/** GET /v1/docs/:id — fetch a specific doc */
export async function handleGetDoc(
  request: Request,
  params: Record<string, string>,
  env: Env
): Promise<Response> {
  const { tier, licenseKey } = await resolveAuth(request, env);
  const clientIp = getClientIp(request);
  const rateResult = await checkRateLimit(licenseKey ?? clientIp, tier, env);

  if (!rateResult.allowed) {
    return addRateLimitHeaders(
      errorResponse("Rate limit exceeded", 429),
      rateResult
    );
  }

  const docId = params.id;
  const url = new URL(request.url);
  const sectionQuery = url.searchParams.get("section");
  const maxLengthStr = url.searchParams.get("maxLength");
  const maxLength = maxLengthStr ? parseInt(maxLengthStr, 10) : null;

  // Get doc metadata from manifest
  let manifest: DocMeta[] = [];
  try {
    const raw = await env.DOCS_KV.get("index:manifest", "json");
    if (Array.isArray(raw)) manifest = raw as DocMeta[];
  } catch {
    return addRateLimitHeaders(
      errorResponse("Failed to load doc index", 500),
      rateResult
    );
  }

  // Find doc — case-insensitive, support prefixed IDs
  const meta = manifest.find(
    (d) =>
      d.id.toLowerCase() === docId.toLowerCase() ||
      d.id.toLowerCase().endsWith(`/${docId.toLowerCase()}`)
  );

  if (!meta) {
    return addRateLimitHeaders(
      errorResponse(`Doc "${docId}" not found`, 404),
      rateResult
    );
  }

  // Tier check: Pro docs require Pro tier
  if (meta.tier === "pro" && tier !== "pro") {
    const response = jsonResponse(
      {
        ok: true,
        data: {
          id: meta.id,
          title: meta.title,
          module: meta.module,
          category: meta.category,
          tier: meta.tier,
          sections: meta.sections,
          content: null,
          gated: true,
          message:
            "This doc requires a Pro license. Get one at https://gamedev-mcp.lemonsqueezy.com",
        },
      },
      200
    );
    return addRateLimitHeaders(response, rateResult);
  }

  // Fetch full content from KV
  const content = await env.DOCS_KV.get(`doc:${meta.id}`);
  if (!content) {
    return addRateLimitHeaders(
      errorResponse(`Doc content not found for "${docId}"`, 500),
      rateResult
    );
  }

  let finalContent = content;
  let sections = meta.sections;

  // Section extraction
  if (sectionQuery) {
    const result = extractSection(content, sectionQuery);
    sections = result.sections;
    if (result.found) {
      finalContent = result.content;
    } else {
      const response = jsonResponse({
        ok: true,
        data: {
          id: meta.id,
          title: meta.title,
          sectionNotFound: sectionQuery,
          availableSections: result.sections,
          message: `Section "${sectionQuery}" not found. Available sections listed above.`,
        },
      });
      return addRateLimitHeaders(response, rateResult);
    }
  }

  // Max length truncation
  if (maxLength && maxLength > 0) {
    const result = truncateAtParagraph(finalContent, maxLength);
    finalContent = result.content;
  }

  const response = jsonResponse({
    ok: true,
    data: {
      id: meta.id,
      title: meta.title,
      module: meta.module,
      category: meta.category,
      tier: meta.tier,
      content: finalContent,
      sections,
    },
  });

  // Cache-Control for free docs
  if (meta.tier === "free") {
    const headers = new Headers(response.headers);
    headers.set("Cache-Control", "public, max-age=3600");
    return addRateLimitHeaders(
      new Response(response.body, { status: 200, headers }),
      rateResult
    );
  }

  return addRateLimitHeaders(response, rateResult);
}

/** GET /v1/search — search docs */
export async function handleSearch(
  request: Request,
  _params: Record<string, string>,
  env: Env
): Promise<Response> {
  const { tier, licenseKey } = await resolveAuth(request, env);
  const clientIp = getClientIp(request);
  const rateResult = await checkRateLimit(licenseKey ?? clientIp, tier, env);

  if (!rateResult.allowed) {
    return addRateLimitHeaders(
      errorResponse("Rate limit exceeded", 429),
      rateResult
    );
  }

  const url = new URL(request.url);
  const query = url.searchParams.get("q");
  const moduleFilter = url.searchParams.get("module");
  const categoryFilter = url.searchParams.get("category");
  const limitStr = url.searchParams.get("limit");
  const limit = limitStr ? Math.min(parseInt(limitStr, 10), 20) : 10;

  if (!query) {
    return addRateLimitHeaders(
      errorResponse("Missing required query param: q", 400),
      rateResult
    );
  }

  // Load search index from KV
  let searchIndex: SearchIndexEntry[] = [];
  try {
    const raw = await env.DOCS_KV.get("index:search", "json");
    if (Array.isArray(raw)) {
      searchIndex = raw as SearchIndexEntry[];
    }
  } catch {
    return addRateLimitHeaders(
      errorResponse("Failed to load search index", 500),
      rateResult
    );
  }

  // Free tier: force core module
  let filteredIndex = searchIndex;
  if (tier === "free") {
    if (moduleFilter && moduleFilter !== "core") {
      return addRateLimitHeaders(
        errorResponse(
          "Searching non-core modules requires a Pro license. Get one at https://gamedev-mcp.lemonsqueezy.com",
          403
        ),
        rateResult
      );
    }
    // Still include pro results in listing but without snippets
  }

  // Apply filters
  if (moduleFilter) {
    filteredIndex = filteredIndex.filter((d) => d.module === moduleFilter);
  }
  if (categoryFilter) {
    filteredIndex = filteredIndex.filter((d) => d.category === categoryFilter);
  }

  // Score and rank
  const queryTokens = tokenize(query);
  const docFrequencies = buildDocFrequencies(filteredIndex);

  const scored = filteredIndex
    .map((entry) => ({
      entry,
      score: scoreDocument(
        entry,
        queryTokens,
        filteredIndex.length,
        docFrequencies
      ),
    }))
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);

  // Build results — snippets only for accessible docs
  const results = await Promise.all(
    scored.map(async ({ entry, score }) => {
      const isAccessible = tier === "pro" || entry.module === "core";
      let snippet: string | null = null;

      if (isAccessible) {
        // Fetch first ~500 chars of content for snippet
        const content = await env.DOCS_KV.get(`doc:${entry.id}`);
        if (content) {
          // Find first paragraph after title
          const lines = content.split("\n");
          let snippetLines: string[] = [];
          let pastTitle = false;
          for (const line of lines) {
            if (line.startsWith("# ")) {
              pastTitle = true;
              continue;
            }
            if (!pastTitle) continue;
            const trimmed = line.trim();
            if (trimmed === "" && snippetLines.length > 0) break;
            if (trimmed && !trimmed.startsWith("#") && !trimmed.startsWith("---")) {
              snippetLines.push(trimmed);
            }
            if (snippetLines.join(" ").length > 300) break;
          }
          snippet = snippetLines.join(" ").slice(0, 300);
        }
      }

      return {
        id: entry.id,
        title: entry.title,
        description: entry.description,
        module: entry.module,
        category: entry.category,
        tier: entry.tier,
        score: Math.round(score * 100) / 100,
        snippet,
      };
    })
  );

  const response = jsonResponse({
    ok: true,
    data: {
      results,
      query,
      tier,
      total: results.length,
    },
  });

  return addRateLimitHeaders(response, rateResult);
}

/** POST /v1/license/validate */
export async function handleLicenseValidate(
  request: Request,
  _params: Record<string, string>,
  env: Env
): Promise<Response> {
  let body: { license_key?: string };
  try {
    body = (await request.json()) as { license_key?: string };
  } catch {
    return errorResponse("Invalid JSON body", 400);
  }

  const key = body.license_key;
  if (!key || typeof key !== "string") {
    return errorResponse("Missing license_key in body", 400);
  }

  const result = await validateLicense(key, env);

  return jsonResponse({
    ok: true,
    data: {
      valid: result.valid,
      tier: result.tier,
    },
  });
}
