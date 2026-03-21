/**
 * HTTP client for the remote Pro content API (Cloudflare Workers).
 *
 * Fetches doc metadata, content, and search results from the server-side API.
 * Used in hybrid mode: free docs bundled locally, Pro docs fetched remotely.
 */

import * as https from "https";
import * as http from "http";

export interface RemoteDocMeta {
  id: string;
  title: string;
  description: string;
  module: string;
  category: string;
  tier: "free" | "pro";
  sizeBytes: number;
}

export interface RemoteDocResult {
  id: string;
  title: string;
  module: string;
  category: string;
  tier: "free" | "pro";
  content: string | null;
  sections: string[];
  gated?: boolean;
  message?: string;
}

export interface RemoteSearchResult {
  id: string;
  title: string;
  description: string;
  module: string;
  category: string;
  tier: "free" | "pro";
  score: number;
  snippet: string | null;
}

export interface RemoteSearchResponse {
  results: RemoteSearchResult[];
  query: string;
  tier: "free" | "pro";
  total: number;
}

interface ApiResponse<T> {
  ok: boolean;
  data: T;
}

export interface RemoteClientOptions {
  baseUrl: string;
  licenseKey?: string | null;
  timeoutMs?: number;
}

export class RemoteClient {
  private baseUrl: string;
  private licenseKey: string | null;
  private timeoutMs: number;

  constructor(options: RemoteClientOptions) {
    // Strip trailing slash
    this.baseUrl = options.baseUrl.replace(/\/$/, "");
    this.licenseKey = options.licenseKey ?? null;
    this.timeoutMs = options.timeoutMs ?? 10_000;
  }

  /** Update the license key (e.g., after validation) */
  setLicenseKey(key: string | null): void {
    this.licenseKey = key;
  }

  /** Health check — verify API is reachable */
  async healthCheck(): Promise<{
    ok: boolean;
    version?: string;
    docsCount?: number;
  }> {
    try {
      const resp = await this.get<{ status: string; version: string; docsCount: number }>(
        "/v1/health"
      );
      return {
        ok: resp.status === "ok",
        version: resp.version,
        docsCount: resp.docsCount,
      };
    } catch {
      return { ok: false };
    }
  }

  /** List docs from the remote API */
  async listDocs(filters?: {
    module?: string;
    category?: string;
  }): Promise<{ docs: RemoteDocMeta[]; total: number; tier: "free" | "pro" }> {
    const params = new URLSearchParams();
    if (filters?.module) params.set("module", filters.module);
    if (filters?.category) params.set("category", filters.category);

    const qs = params.toString();
    const path = `/v1/docs${qs ? `?${qs}` : ""}`;

    return this.get(path);
  }

  /** Fetch a single doc by ID */
  async getDoc(
    id: string,
    options?: { section?: string; maxLength?: number }
  ): Promise<RemoteDocResult> {
    const params = new URLSearchParams();
    if (options?.section) params.set("section", options.section);
    if (options?.maxLength) params.set("maxLength", String(options.maxLength));

    const qs = params.toString();
    const path = `/v1/docs/${encodeURIComponent(id)}${qs ? `?${qs}` : ""}`;

    return this.get(path);
  }

  /** Search docs */
  async search(
    query: string,
    filters?: { module?: string; category?: string; limit?: number }
  ): Promise<RemoteSearchResponse> {
    const params = new URLSearchParams({ q: query });
    if (filters?.module) params.set("module", filters.module);
    if (filters?.category) params.set("category", filters.category);
    if (filters?.limit) params.set("limit", String(filters.limit));

    return this.get(`/v1/search?${params.toString()}`);
  }

  /** Generic GET request */
  private get<T>(urlPath: string): Promise<T> {
    return new Promise((resolve, reject) => {
      const fullUrl = `${this.baseUrl}${urlPath}`;
      const parsed = new URL(fullUrl);
      const isHttps = parsed.protocol === "https:";
      const transport = isHttps ? https : http;

      const headers: Record<string, string> = {
        Accept: "application/json",
        "User-Agent": "gamedev-mcp-server/1.1.0",
      };

      if (this.licenseKey) {
        headers["Authorization"] = `Bearer ${this.licenseKey}`;
      }

      const req = transport.request(
        {
          hostname: parsed.hostname,
          port: parsed.port || (isHttps ? 443 : 80),
          path: parsed.pathname + parsed.search,
          method: "GET",
          headers,
          timeout: this.timeoutMs,
        },
        (res) => {
          let data = "";
          res.on("data", (chunk: Buffer) => (data += chunk.toString()));
          res.on("end", () => {
            try {
              const json: ApiResponse<T> = JSON.parse(data);
              if (json.ok) {
                resolve(json.data);
              } else {
                reject(new Error(`API error (${res.statusCode}): ${data}`));
              }
            } catch {
              reject(new Error(`Invalid JSON from API: ${data.slice(0, 200)}`));
            }
          });
        }
      );

      req.on("error", (err) => reject(err));
      req.on("timeout", () => {
        req.destroy();
        reject(new Error(`API request timeout (${this.timeoutMs}ms)`));
      });

      req.end();
    });
  }
}
