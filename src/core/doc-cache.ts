/**
 * Local disk cache for remotely fetched docs.
 *
 * Stores Pro doc content on disk with TTL-based expiry.
 * Cache structure:
 *   ~/.gamedev-mcp/cache/
 *     manifest.json     — cached doc manifest with timestamps
 *     docs/
 *       {id}.md         — cached doc content
 *       {id}.meta.json  — per-doc metadata (fetchedAt, tier, module, etc.)
 */

import * as fs from "fs";
import * as path from "path";

export interface CachedDocMeta {
  id: string;
  title: string;
  description: string;
  module: string;
  category: string;
  tier: "free" | "pro";
  sizeBytes: number;
  fetchedAt: number; // epoch ms
  sections: string[];
}

export interface CachedManifest {
  docs: CachedDocMeta[];
  fetchedAt: number;
  apiVersion?: string;
}

export interface DocCacheOptions {
  /** Base cache directory. Default: ~/.gamedev-mcp/cache */
  cacheDir?: string;
  /** TTL for cached doc content in ms. Default: 6 hours */
  docTtlMs?: number;
  /** TTL for cached manifest in ms. Default: 1 hour */
  manifestTtlMs?: number;
}

const DEFAULT_DOC_TTL_MS = 6 * 60 * 60 * 1000;       // 6 hours
const DEFAULT_MANIFEST_TTL_MS = 60 * 60 * 1000;      // 1 hour

const CONFIG_DIR = path.join(
  process.env.HOME ?? process.env.USERPROFILE ?? "~",
  ".gamedev-mcp"
);

export class DocCache {
  private cacheDir: string;
  private docsDir: string;
  private docTtlMs: number;
  private manifestTtlMs: number;

  constructor(options?: DocCacheOptions) {
    this.cacheDir = options?.cacheDir ?? path.join(CONFIG_DIR, "cache");
    this.docsDir = path.join(this.cacheDir, "docs");
    this.docTtlMs = options?.docTtlMs ?? DEFAULT_DOC_TTL_MS;
    this.manifestTtlMs = options?.manifestTtlMs ?? DEFAULT_MANIFEST_TTL_MS;

    this.ensureDirs();
  }

  private ensureDirs(): void {
    try {
      if (!fs.existsSync(this.docsDir)) {
        fs.mkdirSync(this.docsDir, { recursive: true });
      }
    } catch {
      // Non-fatal — cache operations will just fail gracefully
    }
  }

  // --- Manifest ---

  /** Get cached manifest if still fresh */
  getManifest(): CachedManifest | null {
    try {
      const manifestPath = path.join(this.cacheDir, "manifest.json");
      if (!fs.existsSync(manifestPath)) return null;

      const raw = fs.readFileSync(manifestPath, "utf-8");
      const manifest: CachedManifest = JSON.parse(raw);

      if (Date.now() - manifest.fetchedAt > this.manifestTtlMs) {
        return null; // expired
      }

      return manifest;
    } catch {
      return null;
    }
  }

  /** Store manifest */
  setManifest(manifest: CachedManifest): void {
    try {
      this.ensureDirs();
      const manifestPath = path.join(this.cacheDir, "manifest.json");
      fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
    } catch {
      // Non-fatal
    }
  }

  // --- Doc Content ---

  /** Get cached doc content if still fresh. Returns null if expired or missing. */
  getDoc(id: string): { content: string; meta: CachedDocMeta } | null {
    try {
      const safeId = this.sanitizeId(id);
      const contentPath = path.join(this.docsDir, `${safeId}.md`);
      const metaPath = path.join(this.docsDir, `${safeId}.meta.json`);

      if (!fs.existsSync(contentPath) || !fs.existsSync(metaPath)) return null;

      const meta: CachedDocMeta = JSON.parse(fs.readFileSync(metaPath, "utf-8"));

      if (Date.now() - meta.fetchedAt > this.docTtlMs) {
        return null; // expired
      }

      const content = fs.readFileSync(contentPath, "utf-8");
      return { content, meta };
    } catch {
      return null;
    }
  }

  /** Store doc content and metadata */
  setDoc(
    id: string,
    content: string,
    meta: Omit<CachedDocMeta, "fetchedAt">
  ): void {
    try {
      this.ensureDirs();
      const safeId = this.sanitizeId(id);
      const contentPath = path.join(this.docsDir, `${safeId}.md`);
      const metaPath = path.join(this.docsDir, `${safeId}.meta.json`);

      const fullMeta: CachedDocMeta = { ...meta, fetchedAt: Date.now() };

      fs.writeFileSync(contentPath, content);
      fs.writeFileSync(metaPath, JSON.stringify(fullMeta, null, 2));
    } catch {
      // Non-fatal
    }
  }

  /** Check if a doc is cached (regardless of freshness) */
  hasDoc(id: string): boolean {
    const safeId = this.sanitizeId(id);
    return fs.existsSync(path.join(this.docsDir, `${safeId}.md`));
  }

  /** Get a stale doc (expired but still on disk) for offline fallback */
  getStaleDoc(id: string): { content: string; meta: CachedDocMeta } | null {
    try {
      const safeId = this.sanitizeId(id);
      const contentPath = path.join(this.docsDir, `${safeId}.md`);
      const metaPath = path.join(this.docsDir, `${safeId}.meta.json`);

      if (!fs.existsSync(contentPath) || !fs.existsSync(metaPath)) return null;

      const meta: CachedDocMeta = JSON.parse(fs.readFileSync(metaPath, "utf-8"));
      const content = fs.readFileSync(contentPath, "utf-8");
      return { content, meta };
    } catch {
      return null;
    }
  }

  // --- Cache Management ---

  /** Invalidate a specific doc */
  invalidateDoc(id: string): void {
    try {
      const safeId = this.sanitizeId(id);
      const contentPath = path.join(this.docsDir, `${safeId}.md`);
      const metaPath = path.join(this.docsDir, `${safeId}.meta.json`);

      if (fs.existsSync(contentPath)) fs.unlinkSync(contentPath);
      if (fs.existsSync(metaPath)) fs.unlinkSync(metaPath);
    } catch {
      // Non-fatal
    }
  }

  /** Invalidate manifest (forces refetch on next list/search) */
  invalidateManifest(): void {
    try {
      const manifestPath = path.join(this.cacheDir, "manifest.json");
      if (fs.existsSync(manifestPath)) fs.unlinkSync(manifestPath);
    } catch {
      // Non-fatal
    }
  }

  /** Clear entire cache */
  clear(): void {
    try {
      if (fs.existsSync(this.cacheDir)) {
        fs.rmSync(this.cacheDir, { recursive: true, force: true });
      }
      this.ensureDirs();
    } catch {
      // Non-fatal
    }
  }

  /** Get cache stats */
  stats(): { docCount: number; totalSizeBytes: number; oldestFetchMs: number | null } {
    try {
      if (!fs.existsSync(this.docsDir)) {
        return { docCount: 0, totalSizeBytes: 0, oldestFetchMs: null };
      }

      const files = fs.readdirSync(this.docsDir);
      const mdFiles = files.filter((f) => f.endsWith(".md"));
      let totalSize = 0;
      let oldest: number | null = null;

      for (const f of mdFiles) {
        const stat = fs.statSync(path.join(this.docsDir, f));
        totalSize += stat.size;

        const metaFile = f.replace(/\.md$/, ".meta.json");
        const metaPath = path.join(this.docsDir, metaFile);
        if (fs.existsSync(metaPath)) {
          try {
            const meta: CachedDocMeta = JSON.parse(
              fs.readFileSync(metaPath, "utf-8")
            );
            if (oldest === null || meta.fetchedAt < oldest) {
              oldest = meta.fetchedAt;
            }
          } catch {
            // skip
          }
        }
      }

      return { docCount: mdFiles.length, totalSizeBytes: totalSize, oldestFetchMs: oldest };
    } catch {
      return { docCount: 0, totalSizeBytes: 0, oldestFetchMs: null };
    }
  }

  /** Evict expired entries */
  evictExpired(): number {
    let evicted = 0;
    try {
      if (!fs.existsSync(this.docsDir)) return 0;

      const files = fs.readdirSync(this.docsDir);
      const metaFiles = files.filter((f) => f.endsWith(".meta.json"));

      for (const metaFile of metaFiles) {
        const metaPath = path.join(this.docsDir, metaFile);
        try {
          const meta: CachedDocMeta = JSON.parse(
            fs.readFileSync(metaPath, "utf-8")
          );
          if (Date.now() - meta.fetchedAt > this.docTtlMs) {
            const contentFile = metaFile.replace(/\.meta\.json$/, ".md");
            const contentPath = path.join(this.docsDir, contentFile);
            if (fs.existsSync(contentPath)) fs.unlinkSync(contentPath);
            fs.unlinkSync(metaPath);
            evicted++;
          }
        } catch {
          // Corrupt meta file — remove both
          fs.unlinkSync(metaPath);
          const contentFile = metaFile.replace(/\.meta\.json$/, ".md");
          const contentPath = path.join(this.docsDir, contentFile);
          if (fs.existsSync(contentPath)) fs.unlinkSync(contentPath);
          evicted++;
        }
      }
    } catch {
      // Non-fatal
    }
    return evicted;
  }

  /** Make an ID filesystem-safe */
  private sanitizeId(id: string): string {
    // Replace / with __ for prefixed IDs like godot-arch/G1
    return id.replace(/[/\\:*?"<>|]/g, "__");
  }
}
