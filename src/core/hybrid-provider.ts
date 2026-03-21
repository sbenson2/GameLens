/**
 * Hybrid doc provider: serves free docs from the local bundle and
 * Pro docs from the remote API with local disk caching.
 *
 * Fallback chain for Pro docs:
 *   1. Local disk cache (if fresh)
 *   2. Remote API fetch → cache → serve
 *   3. Stale disk cache (if API unreachable)
 *   4. Bundled local docs (always available as final fallback)
 *
 * Free docs always come from the local bundle (no API call needed).
 */

import { Doc, DocStore } from "./docs.js";
import { RemoteClient, RemoteDocMeta } from "./remote-client.js";
import { DocCache, CachedDocMeta } from "./doc-cache.js";

export type DocSource = "local" | "cache" | "remote" | "stale-cache";

export interface HybridDocResult {
  doc: Doc;
  source: DocSource;
  stale?: boolean;
}

export interface HybridProviderOptions {
  /** Remote API base URL. If not set, hybrid mode is disabled. */
  apiUrl?: string | null;
  /** License key for Pro content access */
  licenseKey?: string | null;
  /** API request timeout in ms. Default: 10000 */
  timeoutMs?: number;
  /** Doc cache TTL in ms. Default: 6 hours */
  docTtlMs?: number;
  /** Manifest cache TTL in ms. Default: 1 hour */
  manifestTtlMs?: number;
}

export class HybridProvider {
  private docStore: DocStore;
  private remoteClient: RemoteClient | null = null;
  private cache: DocCache;
  private apiAvailable: boolean | null = null; // null = unknown
  private lastHealthCheck: number = 0;
  private readonly HEALTH_CHECK_INTERVAL_MS = 5 * 60 * 1000; // 5 min

  constructor(docStore: DocStore, options?: HybridProviderOptions) {
    this.docStore = docStore;
    this.cache = new DocCache({
      docTtlMs: options?.docTtlMs,
      manifestTtlMs: options?.manifestTtlMs,
    });

    if (options?.apiUrl) {
      this.remoteClient = new RemoteClient({
        baseUrl: options.apiUrl,
        licenseKey: options.licenseKey,
        timeoutMs: options.timeoutMs,
      });
    }
  }

  /** Check if hybrid mode is enabled (API URL configured) */
  get isHybridEnabled(): boolean {
    return this.remoteClient !== null;
  }

  /** Update license key on the remote client */
  setLicenseKey(key: string | null): void {
    this.remoteClient?.setLicenseKey(key);
  }

  /**
   * Get a doc by ID using the hybrid fallback chain.
   *
   * Free docs → always local.
   * Pro docs → cache → remote → stale cache → local bundle.
   */
  async getDoc(
    id: string,
    options?: { section?: string; maxLength?: number }
  ): Promise<HybridDocResult | null> {
    // Always try local first — covers free docs and bundled Pro docs
    const localDoc = this.findLocalDoc(id);

    // If no remote client, pure local mode
    if (!this.remoteClient) {
      return localDoc ? { doc: localDoc, source: "local" } : null;
    }

    // For free-tier docs (core module), always serve locally
    if (localDoc && localDoc.module === "core") {
      return { doc: localDoc, source: "local" };
    }

    // Try cache first (fast path)
    const cached = this.cache.getDoc(id);
    if (cached) {
      // Build a Doc object from cached content
      const doc = this.cachedToDoc(cached.meta, cached.content);
      return { doc, source: "cache" };
    }

    // Try remote fetch
    if (await this.isApiReachable()) {
      try {
        const remoteDoc = await this.remoteClient.getDoc(id, options);
        if (remoteDoc.content) {
          // Cache the fetched content
          this.cache.setDoc(id, remoteDoc.content, {
            id: remoteDoc.id,
            title: remoteDoc.title,
            description: "",
            module: remoteDoc.module,
            category: remoteDoc.category,
            tier: remoteDoc.tier,
            sizeBytes: Buffer.byteLength(remoteDoc.content),
            sections: remoteDoc.sections ?? [],
          });

          const doc: Doc = {
            id: remoteDoc.id,
            title: remoteDoc.title,
            description: "",
            category: remoteDoc.category,
            module: remoteDoc.module,
            content: remoteDoc.content,
            filePath: `[remote:${remoteDoc.id}]`,
          };

          return { doc, source: "remote" };
        }

        // Content was null — likely gated (not Pro tier)
        // Fall through to local
      } catch {
        // API error — mark as unavailable temporarily
        this.apiAvailable = false;
        this.lastHealthCheck = Date.now();
      }
    }

    // Try stale cache (offline fallback)
    const stale = this.cache.getStaleDoc(id);
    if (stale) {
      const doc = this.cachedToDoc(stale.meta, stale.content);
      return { doc, source: "stale-cache", stale: true };
    }

    // Final fallback: bundled local doc
    if (localDoc) {
      return { doc: localDoc, source: "local" };
    }

    return null;
  }

  /**
   * Get all docs — merges local and remote manifests.
   * Used for indexing and listing.
   */
  getAllDocs(): Doc[] {
    // In hybrid mode, local docs are always the base.
    // Remote-only docs would be added if we pre-fetch manifests,
    // but for now local is the truth — remote supplements on-demand.
    return this.docStore.getAllDocs();
  }

  /** Get cache statistics */
  getCacheStats(): {
    enabled: boolean;
    apiUrl: string | null;
    apiAvailable: boolean | null;
    cache: { docCount: number; totalSizeBytes: number; oldestFetchMs: number | null };
  } {
    return {
      enabled: this.isHybridEnabled,
      apiUrl: this.remoteClient ? (this.remoteClient as any).baseUrl : null,
      apiAvailable: this.apiAvailable,
      cache: this.cache.stats(),
    };
  }

  /** Evict expired cache entries */
  evictExpired(): number {
    return this.cache.evictExpired();
  }

  /** Clear all cached docs */
  clearCache(): void {
    this.cache.clear();
  }

  // --- Private helpers ---

  private findLocalDoc(id: string): Doc | null {
    // Direct lookup
    const doc = this.docStore.getDoc(id);
    if (doc) return doc;

    // Case-insensitive fallback
    const allDocs = this.docStore.getAllDocs();
    return (
      allDocs.find((d) => d.id.toLowerCase() === id.toLowerCase()) ??
      allDocs.find((d) => d.id.toLowerCase().endsWith(`/${id.toLowerCase()}`)) ??
      null
    );
  }

  private cachedToDoc(meta: CachedDocMeta, content: string): Doc {
    return {
      id: meta.id,
      title: meta.title,
      description: meta.description,
      category: meta.category,
      module: meta.module,
      content,
      filePath: `[cached:${meta.id}]`,
    };
  }

  private async isApiReachable(): Promise<boolean> {
    if (!this.remoteClient) return false;

    const now = Date.now();

    // Use cached health status if recent
    if (
      this.apiAvailable !== null &&
      now - this.lastHealthCheck < this.HEALTH_CHECK_INTERVAL_MS
    ) {
      return this.apiAvailable;
    }

    // Perform health check
    try {
      const health = await this.remoteClient.healthCheck();
      this.apiAvailable = health.ok;
      this.lastHealthCheck = now;
      return health.ok;
    } catch {
      this.apiAvailable = false;
      this.lastHealthCheck = now;
      return false;
    }
  }
}
