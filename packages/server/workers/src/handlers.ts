/** API route handlers */

import type { Env, DocMeta, SearchIndexEntry } from "./types.js";
import { validateLicense, extractBearerToken } from "./license.js";
import { checkRateLimit, addRateLimitHeaders } from "./rate-limit.js";
import {
  jsonResponse,
  errorResponse,
  restrictedJsonResponse,
  restrictedErrorResponse,
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

/** Resolve engine name to matching modules (case-insensitive, partial match) */
function resolveEngine(
  engineQuery: string,
  manifest: DocMeta[]
): { modules: string[]; engineLabel: string | null } {
  const q = engineQuery.toLowerCase();
  const engineModules = new Map<string, string>(); // module → engine label

  for (const doc of manifest) {
    if (doc.engine && !engineModules.has(doc.module)) {
      engineModules.set(doc.module, doc.engine);
    }
  }

  // Find matching engine(s)
  const matched: string[] = [];
  let matchedLabel: string | null = null;
  for (const [mod, engine] of engineModules) {
    if (engine.toLowerCase().includes(q) || mod.toLowerCase().includes(q)) {
      matched.push(mod);
      matchedLabel = engine;
    }
  }

  return { modules: matched, engineLabel: matchedLabel };
}

// --- Handlers ---

/** GET /v1/health */
export async function handleHealth(
  _request: Request,
  _params: Record<string, string>,
  env: Env
): Promise<Response> {
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
  const engineFilter = url.searchParams.get("engine");
  const summary = url.searchParams.get("summary") === "true";

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

  if (engineFilter) {
    // Engine filter requires Pro for non-core
    if (tier === "free") {
      return addRateLimitHeaders(
        errorResponse(
          "Filtering by engine requires a Pro license. Get one at https://gamecodex.lemonsqueezy.com",
          403
        ),
        rateResult
      );
    }
    const { modules } = resolveEngine(engineFilter, manifest);
    if (modules.length === 0) {
      return addRateLimitHeaders(
        errorResponse("Unknown engine filter", 400),
        rateResult
      );
    }
    // Include matching engine modules + always include core
    filtered = filtered.filter(
      (d) => modules.includes(d.module) || d.module === "core"
    );
  }

  if (moduleFilter) {
    filtered = filtered.filter((d) => d.module === moduleFilter);
  }
  if (categoryFilter) {
    filtered = filtered.filter((d) => d.category === categoryFilter);
  }

  // Summary mode — compact counts per module/category
  if (summary) {
    const groups: Record<
      string,
      Record<string, { count: number; ids: string[] }>
    > = {};

    for (const d of filtered) {
      if (!groups[d.module]) groups[d.module] = {};
      if (!groups[d.module][d.category]) {
        groups[d.module][d.category] = { count: 0, ids: [] };
      }
      groups[d.module][d.category].count++;
      if (groups[d.module][d.category].ids.length < 10) {
        groups[d.module][d.category].ids.push(d.id);
      }
    }

    const summaryData: Record<
      string,
      {
        total: number;
        categories: Record<
          string,
          { count: number; ids: string[]; hasMore: boolean }
        >;
      }
    > = {};

    for (const [mod, cats] of Object.entries(groups)) {
      let modTotal = 0;
      const catData: Record<
        string,
        { count: number; ids: string[]; hasMore: boolean }
      > = {};
      for (const [cat, info] of Object.entries(cats)) {
        modTotal += info.count;
        catData[cat] = {
          count: info.count,
          ids: info.ids,
          hasMore: info.count > 10,
        };
      }
      summaryData[mod] = { total: modTotal, categories: catData };
    }

    const response = jsonResponse({
      ok: true,
      data: { summary: summaryData, total: filtered.length, tier },
    });
    return addRateLimitHeaders(response, rateResult);
  }

  const response = jsonResponse({
    ok: true,
    data: {
      docs: filtered.map((d) => ({
        id: d.id,
        title: d.title,
        description: d.description,
        module: d.module,
        engine: d.engine,
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

/** GET /v1/docs/random — get a random doc */
export async function handleRandomDoc(
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
  const engineFilter = url.searchParams.get("engine");

  // Load manifest
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

  let filtered = manifest;

  // Engine filter
  if (engineFilter) {
    if (tier === "free") {
      return addRateLimitHeaders(
        errorResponse("Engine filter requires Pro", 403),
        rateResult
      );
    }
    const { modules } = resolveEngine(engineFilter, manifest);
    if (modules.length === 0) {
      return addRateLimitHeaders(
        errorResponse("Unknown engine filter", 400),
        rateResult
      );
    }
    filtered = filtered.filter(
      (d) => modules.includes(d.module) || d.module === "core"
    );
  }

  // Free tier: core only
  if (tier === "free") {
    filtered = filtered.filter((d) => d.module === "core");
  }

  if (moduleFilter) filtered = filtered.filter((d) => d.module === moduleFilter);
  if (categoryFilter) filtered = filtered.filter((d) => d.category === categoryFilter);

  if (filtered.length === 0) {
    return addRateLimitHeaders(
      errorResponse("No docs match the given filters", 404),
      rateResult
    );
  }

  // Pick random doc
  const meta = filtered[Math.floor(Math.random() * filtered.length)];

  // Get preview (first ~500 chars)
  let preview: string | null = null;
  try {
    const content = await env.DOCS_KV.get(`doc:${meta.id}`);
    if (content) {
      const lines = content.split("\n");
      const previewLines: string[] = [];
      let pastTitle = false;
      for (const line of lines) {
        if (line.startsWith("# ")) { pastTitle = true; continue; }
        if (!pastTitle) continue;
        const trimmed = line.trim();
        if (trimmed === "" && previewLines.length > 0) break;
        if (trimmed && !trimmed.startsWith("#") && !trimmed.startsWith("---")) {
          previewLines.push(trimmed);
        }
        if (previewLines.join(" ").length > 500) break;
      }
      preview = previewLines.join(" ").slice(0, 500);
    }
  } catch {
    // Preview is best-effort
  }

  const response = jsonResponse({
    ok: true,
    data: {
      id: meta.id,
      title: meta.title,
      description: meta.description,
      module: meta.module,
      engine: meta.engine,
      category: meta.category,
      tier: meta.tier,
      sizeBytes: meta.sizeBytes,
      sections: meta.sections,
      preview,
      message: `Use GET /v1/docs/${meta.id} for full content.`,
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
      errorResponse("Document not found", 404),
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
          engine: meta.engine,
          category: meta.category,
          tier: meta.tier,
          sections: meta.sections,
          content: null,
          gated: true,
          message:
            "This doc requires a Pro license. Get one at https://gamecodex.lemonsqueezy.com",
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
      errorResponse("Document content unavailable", 500),
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
      engine: meta.engine,
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
  const engineFilter = url.searchParams.get("engine");
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

  let filteredIndex = searchIndex;

  // Engine filter
  if (engineFilter) {
    if (tier === "free") {
      return addRateLimitHeaders(
        errorResponse(
          "Engine-filtered search requires a Pro license. Get one at https://gamecodex.lemonsqueezy.com",
          403
        ),
        rateResult
      );
    }
    // Build engine→module map from search index
    const engineModules = new Map<string, string>();
    for (const entry of searchIndex) {
      if (entry.engine && !engineModules.has(entry.module)) {
        engineModules.set(entry.module, entry.engine);
      }
    }
    const q = engineFilter.toLowerCase();
    const matchedModules: string[] = [];
    for (const [mod, engine] of engineModules) {
      if (engine.toLowerCase().includes(q) || mod.toLowerCase().includes(q)) {
        matchedModules.push(mod);
      }
    }
    if (matchedModules.length === 0) {
      return addRateLimitHeaders(
        errorResponse("Unknown engine filter", 400),
        rateResult
      );
    }
    // Include matched + always include core
    filteredIndex = filteredIndex.filter(
      (d) => matchedModules.includes(d.module) || d.module === "core"
    );
  }

  // Free tier: restrict non-core module searches
  if (tier === "free") {
    if (moduleFilter && moduleFilter !== "core") {
      return addRateLimitHeaders(
        errorResponse(
          "Searching non-core modules requires a Pro license. Get one at https://gamecodex.lemonsqueezy.com",
          403
        ),
        rateResult
      );
    }
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

  // Build results — use description as snippet (avoids N+1 KV reads)
  const results = scored.map(({ entry, score }) => {
    const isAccessible = tier === "pro" || entry.module === "core";
    return {
      id: entry.id,
      title: entry.title,
      description: entry.description,
      module: entry.module,
      engine: entry.engine,
      category: entry.category,
      tier: entry.tier,
      score: Math.round(score * 100) / 100,
      snippet: isAccessible ? entry.description : null,
    };
  });

  // Auto-group by engine when results span multiple engines
  const uniqueEngines = new Set(
    results.filter((r) => r.engine).map((r) => r.engine)
  );
  const grouped = uniqueEngines.size > 1 && results.length >= 4;

  const response = jsonResponse({
    ok: true,
    data: {
      results,
      query,
      tier,
      total: results.length,
      grouped,
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
  // Rate limit by IP (always "free" tier — key not yet validated)
  const clientIp = getClientIp(request);
  const rateResult = await checkRateLimit(clientIp, "free", env);

  if (!rateResult.allowed) {
    return addRateLimitHeaders(
      restrictedErrorResponse("Rate limit exceeded", 429),
      rateResult
    );
  }

  let body: { license_key?: string };
  try {
    body = (await request.json()) as { license_key?: string };
  } catch {
    return addRateLimitHeaders(
      restrictedErrorResponse("Invalid JSON body", 400),
      rateResult
    );
  }

  const key = body.license_key;
  if (!key || typeof key !== "string") {
    return addRateLimitHeaders(
      restrictedErrorResponse("Missing license_key in body", 400),
      rateResult
    );
  }

  const result = await validateLicense(key, env, clientIp);

  return addRateLimitHeaders(
    restrictedJsonResponse({
      ok: true,
      data: {
        valid: result.valid,
        tier: result.tier,
      },
    }),
    rateResult
  );
}
