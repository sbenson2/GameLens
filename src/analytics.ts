/**
 * Local analytics — privacy-respecting, offline-first usage telemetry.
 *
 * DESIGN PRINCIPLES:
 * 1. All data stays local by default (no phoning home without opt-in)
 * 2. No PII collected — only anonymous usage patterns
 * 3. Aggregated daily summaries, not individual request logs
 * 4. Users can disable entirely via GAMEDEV_MCP_ANALYTICS=false
 * 5. Data is human-readable JSON for transparency
 *
 * WHAT WE TRACK:
 * - Tool usage counts (which tools are most popular)
 * - Search query patterns (categories, modules — NOT query text)
 * - Doc access patterns (which docs are most read)
 * - Session duration and startup time
 * - Tier distribution (free vs pro usage patterns)
 * - Error rates by tool
 * - Cache hit rates (hybrid mode)
 *
 * WHAT WE NEVER TRACK:
 * - License keys or key hashes
 * - Search query text (only counts)
 * - Machine identifiers or usernames
 * - IP addresses or geo data
 * - File paths or system info
 *
 * FUTURE (opt-in only):
 * - Anonymous aggregate upload to Cloudflare Workers analytics endpoint
 * - Helps prioritize content creation (which docs are most read)
 * - Controlled by GAMEDEV_MCP_ANALYTICS=upload
 */

import * as fs from "fs";
import * as path from "path";

const CONFIG_DIR = path.join(
  process.env.HOME ?? process.env.USERPROFILE ?? "~",
  ".gamedev-mcp"
);
const ANALYTICS_DIR = path.join(CONFIG_DIR, "analytics");

/** Check if analytics is enabled */
function isEnabled(): boolean {
  const env = process.env.GAMEDEV_MCP_ANALYTICS;
  if (env === "false" || env === "0" || env === "off") return false;
  return true; // enabled by default (local-only is safe)
}

/** Today's date key for daily aggregation */
function todayKey(): string {
  return new Date().toISOString().slice(0, 10); // YYYY-MM-DD
}

// --- Daily summary structure ---

interface ToolUsage {
  calls: number;
  errors: number;
  avgDurationMs: number;
  totalDurationMs: number;
}

interface SearchStats {
  totalQueries: number;
  byModule: Record<string, number>;    // module → count
  byCategory: Record<string, number>;  // category → count
  avgResultCount: number;
  zeroResultQueries: number;
}

interface DocAccessStats {
  totalFetches: number;
  byDoc: Record<string, number>;       // doc ID → count
  byModule: Record<string, number>;    // module → count
  sectionExtractions: number;
  maxLengthTruncations: number;
}

interface CacheStats {
  hits: number;
  misses: number;
  staleFallbacks: number;
  remoteFetches: number;
}

export interface DailySummary {
  date: string;
  version: string;                     // server version
  tier: "free" | "pro" | "dev";
  sessionStartedAt: number;            // epoch ms
  startupTimeMs: number;               // cold start duration
  tools: Record<string, ToolUsage>;
  search: SearchStats;
  docs: DocAccessStats;
  cache: CacheStats;
  rateLimits: {
    searchLimitHits: number;           // times daily search limit was reached
    docLimitHits: number;              // times daily doc limit was reached
  };
  conversion: {
    proGateImpressions: number;        // times a Pro gate message was shown
    proGateByTool: Record<string, number>; // which tools triggered Pro gates
    upgradeUrlShown: number;           // times upgrade URL was displayed
  };
  modules: {
    discovered: number;
    active: number;
    totalDocs: number;
  };
}

function emptyDailySummary(date: string): DailySummary {
  return {
    date,
    version: "",
    tier: "free",
    sessionStartedAt: Date.now(),
    startupTimeMs: 0,
    tools: {},
    search: {
      totalQueries: 0,
      byModule: {},
      byCategory: {},
      avgResultCount: 0,
      zeroResultQueries: 0,
    },
    docs: {
      totalFetches: 0,
      byDoc: {},
      byModule: {},
      sectionExtractions: 0,
      maxLengthTruncations: 0,
    },
    cache: {
      hits: 0,
      misses: 0,
      staleFallbacks: 0,
      remoteFetches: 0,
    },
    rateLimits: {
      searchLimitHits: 0,
      docLimitHits: 0,
    },
    modules: {
      discovered: 0,
      active: 0,
      totalDocs: 0,
    },
    conversion: {
      proGateImpressions: 0,
      proGateByTool: {},
      upgradeUrlShown: 0,
    },
  };
}

// --- Analytics collector singleton ---

export class Analytics {
  private summary: DailySummary;
  private dirty = false;
  private flushTimer: ReturnType<typeof setInterval> | null = null;
  private enabled: boolean;

  constructor() {
    this.enabled = isEnabled();
    this.summary = this.loadOrCreate();

    // Auto-flush every 5 minutes
    if (this.enabled) {
      this.flushTimer = setInterval(() => this.flush(), 5 * 60 * 1000);
      // Don't prevent process exit
      if (this.flushTimer.unref) this.flushTimer.unref();
    }
  }

  /** Record server startup */
  recordStartup(options: {
    version: string;
    tier: "free" | "pro" | "dev";
    startupTimeMs: number;
    discoveredModules: number;
    activeModules: number;
    totalDocs: number;
  }): void {
    if (!this.enabled) return;
    this.summary.version = options.version;
    this.summary.tier = options.tier;
    this.summary.startupTimeMs = options.startupTimeMs;
    this.summary.modules = {
      discovered: options.discoveredModules,
      active: options.activeModules,
      totalDocs: options.totalDocs,
    };
    this.dirty = true;
  }

  /** Record a tool call */
  recordToolCall(tool: string, durationMs: number, error: boolean = false): void {
    if (!this.enabled) return;
    this.ensureToday();

    if (!this.summary.tools[tool]) {
      this.summary.tools[tool] = {
        calls: 0,
        errors: 0,
        avgDurationMs: 0,
        totalDurationMs: 0,
      };
    }

    const t = this.summary.tools[tool];
    t.calls += 1;
    if (error) t.errors += 1;
    t.totalDurationMs += durationMs;
    t.avgDurationMs = Math.round(t.totalDurationMs / t.calls);
    this.dirty = true;
  }

  /** Record a search query */
  recordSearch(options: {
    module?: string;
    category?: string;
    resultCount: number;
  }): void {
    if (!this.enabled) return;
    this.ensureToday();

    const s = this.summary.search;
    s.totalQueries += 1;

    if (options.module) {
      s.byModule[options.module] = (s.byModule[options.module] ?? 0) + 1;
    }
    if (options.category) {
      s.byCategory[options.category] = (s.byCategory[options.category] ?? 0) + 1;
    }
    if (options.resultCount === 0) {
      s.zeroResultQueries += 1;
    }

    // Running average
    s.avgResultCount = Math.round(
      ((s.avgResultCount * (s.totalQueries - 1)) + options.resultCount) / s.totalQueries
    );

    this.dirty = true;
  }

  /** Record a doc access */
  recordDocAccess(options: {
    docId: string;
    module: string;
    usedSection?: boolean;
    usedMaxLength?: boolean;
  }): void {
    if (!this.enabled) return;
    this.ensureToday();

    const d = this.summary.docs;
    d.totalFetches += 1;
    d.byDoc[options.docId] = (d.byDoc[options.docId] ?? 0) + 1;
    d.byModule[options.module] = (d.byModule[options.module] ?? 0) + 1;
    if (options.usedSection) d.sectionExtractions += 1;
    if (options.usedMaxLength) d.maxLengthTruncations += 1;
    this.dirty = true;
  }

  /** Record a cache event */
  recordCacheEvent(event: "hit" | "miss" | "stale" | "remote"): void {
    if (!this.enabled) return;
    this.ensureToday();

    switch (event) {
      case "hit":
        this.summary.cache.hits += 1;
        break;
      case "miss":
        this.summary.cache.misses += 1;
        break;
      case "stale":
        this.summary.cache.staleFallbacks += 1;
        break;
      case "remote":
        this.summary.cache.remoteFetches += 1;
        break;
    }
    this.dirty = true;
  }

  /** Record a Pro gate impression (conversion funnel tracking) */
  recordProGate(tool: string): void {
    if (!this.enabled) return;
    this.ensureToday();

    this.summary.conversion.proGateImpressions += 1;
    this.summary.conversion.proGateByTool[tool] =
      (this.summary.conversion.proGateByTool[tool] ?? 0) + 1;
    this.summary.conversion.upgradeUrlShown += 1;
    this.dirty = true;
  }

  /** Record a rate limit hit */
  recordRateLimit(type: "search" | "doc"): void {
    if (!this.enabled) return;
    this.ensureToday();

    if (type === "search") {
      this.summary.rateLimits.searchLimitHits += 1;
    } else {
      this.summary.rateLimits.docLimitHits += 1;
    }
    this.dirty = true;
  }

  /** Get current summary (for diagnostics or future upload) */
  getSummary(): Readonly<DailySummary> {
    return { ...this.summary };
  }

  /** Get recent daily summaries for trend analysis */
  getRecentSummaries(days: number = 7): DailySummary[] {
    const summaries: DailySummary[] = [];
    const today = new Date();

    for (let i = 0; i < days; i++) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      const dateKey = d.toISOString().slice(0, 10);
      const filePath = this.getFilePath(dateKey);

      try {
        if (fs.existsSync(filePath)) {
          const data = JSON.parse(fs.readFileSync(filePath, "utf-8"));
          summaries.push(data);
        }
      } catch {
        // Skip corrupt files
      }
    }

    return summaries;
  }

  /** Flush current summary to disk */
  flush(): void {
    if (!this.enabled || !this.dirty) return;

    try {
      if (!fs.existsSync(ANALYTICS_DIR)) {
        fs.mkdirSync(ANALYTICS_DIR, { recursive: true, mode: 0o700 });
      }

      const filePath = this.getFilePath(this.summary.date);
      fs.writeFileSync(filePath, JSON.stringify(this.summary, null, 2), { mode: 0o600 });
      this.dirty = false;
    } catch {
      // Analytics write failure is strictly non-fatal
    }
  }

  /** Clean up old analytics files (keep last 30 days) */
  cleanup(keepDays: number = 30): number {
    let removed = 0;
    try {
      if (!fs.existsSync(ANALYTICS_DIR)) return 0;

      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - keepDays);
      const cutoffStr = cutoff.toISOString().slice(0, 10);

      const files = fs.readdirSync(ANALYTICS_DIR);
      for (const file of files) {
        if (file.endsWith(".json")) {
          const dateStr = file.replace(".json", "");
          if (dateStr < cutoffStr) {
            fs.unlinkSync(path.join(ANALYTICS_DIR, file));
            removed += 1;
          }
        }
      }
    } catch {
      // Non-fatal
    }
    return removed;
  }

  /** Shutdown — flush and stop timer */
  shutdown(): void {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = null;
    }
    this.flush();
  }

  // --- Private helpers ---

  private getFilePath(dateKey: string): string {
    return path.join(ANALYTICS_DIR, `${dateKey}.json`);
  }

  private loadOrCreate(): DailySummary {
    const date = todayKey();

    if (!this.enabled) return emptyDailySummary(date);

    const filePath = this.getFilePath(date);
    try {
      if (fs.existsSync(filePath)) {
        const data = JSON.parse(fs.readFileSync(filePath, "utf-8"));
        if (data.date === date) return data;
      }
    } catch {
      // Corrupt — start fresh
    }
    return emptyDailySummary(date);
  }

  /** Ensure we're still writing to today's file (handles midnight rollover) */
  private ensureToday(): void {
    const today = todayKey();
    if (this.summary.date !== today) {
      this.flush(); // Save yesterday's data
      this.summary = this.loadOrCreate();
    }
  }
}

// --- Singleton instance ---
let _instance: Analytics | null = null;

export function getAnalytics(): Analytics {
  if (!_instance) {
    _instance = new Analytics();
  }
  return _instance;
}
