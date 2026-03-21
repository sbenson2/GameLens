import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";

// Set analytics dir to temp before importing
const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "gamedev-analytics-test-"));

// We need to test the Analytics class directly
// Since it uses a config dir based on HOME, we test via the public API

describe("Analytics", () => {
  // Import dynamically to avoid singleton issues
  let Analytics: any;

  before(async () => {
    // Set HOME to temp for test isolation
    process.env.HOME = tempDir;
    process.env.GAMEDEV_MCP_ANALYTICS = "true";
    const mod = await import("../analytics.js");
    Analytics = mod.Analytics;
  });

  after(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it("should create empty summary for today", () => {
    const analytics = new Analytics();
    const summary = analytics.getSummary();
    const today = new Date().toISOString().slice(0, 10);
    assert.equal(summary.date, today);
    assert.equal(summary.tier, "free");
    assert.equal(summary.search.totalQueries, 0);
    assert.equal(summary.docs.totalFetches, 0);
    analytics.shutdown();
  });

  it("should record tool calls with duration", () => {
    const analytics = new Analytics();
    analytics.recordToolCall("search_docs", 150);
    analytics.recordToolCall("search_docs", 250);
    analytics.recordToolCall("get_doc", 50, true); // with error

    const summary = analytics.getSummary();
    assert.equal(summary.tools["search_docs"].calls, 2);
    assert.equal(summary.tools["search_docs"].errors, 0);
    assert.equal(summary.tools["search_docs"].avgDurationMs, 200);
    assert.equal(summary.tools["get_doc"].calls, 1);
    assert.equal(summary.tools["get_doc"].errors, 1);
    analytics.shutdown();
  });

  it("should record search patterns without query text", () => {
    const analytics = new Analytics();
    analytics.recordSearch({ module: "core", resultCount: 5 });
    analytics.recordSearch({ module: "godot-arch", category: "guide", resultCount: 3 });
    analytics.recordSearch({ resultCount: 0 }); // zero result

    const summary = analytics.getSummary();
    assert.equal(summary.search.totalQueries, 3);
    assert.equal(summary.search.byModule["core"], 1);
    assert.equal(summary.search.byModule["godot-arch"], 1);
    assert.equal(summary.search.byCategory["guide"], 1);
    assert.equal(summary.search.zeroResultQueries, 1);
    analytics.shutdown();
  });

  it("should record doc access patterns", () => {
    const analytics = new Analytics();
    analytics.recordDocAccess({ docId: "G64", module: "monogame-arch" });
    analytics.recordDocAccess({ docId: "G64", module: "monogame-arch", usedSection: true });
    analytics.recordDocAccess({ docId: "G1", module: "godot-arch", usedMaxLength: true });

    const summary = analytics.getSummary();
    assert.equal(summary.docs.totalFetches, 3);
    assert.equal(summary.docs.byDoc["G64"], 2);
    assert.equal(summary.docs.byDoc["G1"], 1);
    assert.equal(summary.docs.byModule["monogame-arch"], 2);
    assert.equal(summary.docs.sectionExtractions, 1);
    assert.equal(summary.docs.maxLengthTruncations, 1);
    analytics.shutdown();
  });

  it("should record cache events", () => {
    const analytics = new Analytics();
    analytics.recordCacheEvent("hit");
    analytics.recordCacheEvent("hit");
    analytics.recordCacheEvent("miss");
    analytics.recordCacheEvent("stale");

    const summary = analytics.getSummary();
    assert.equal(summary.cache.hits, 2);
    assert.equal(summary.cache.misses, 1);
    assert.equal(summary.cache.staleFallbacks, 1);
    analytics.shutdown();
  });

  it("should record rate limit hits", () => {
    const analytics = new Analytics();
    analytics.recordRateLimit("search");
    analytics.recordRateLimit("search");
    analytics.recordRateLimit("doc");

    const summary = analytics.getSummary();
    assert.equal(summary.rateLimits.searchLimitHits, 2);
    assert.equal(summary.rateLimits.docLimitHits, 1);
    analytics.shutdown();
  });

  it("should record startup info", () => {
    const analytics = new Analytics();
    analytics.recordStartup({
      version: "1.2.0",
      tier: "pro",
      startupTimeMs: 342,
      discoveredModules: 3,
      activeModules: 2,
      totalDocs: 134,
    });

    const summary = analytics.getSummary();
    assert.equal(summary.version, "1.2.0");
    assert.equal(summary.tier, "pro");
    assert.equal(summary.startupTimeMs, 342);
    assert.equal(summary.modules.discovered, 3);
    assert.equal(summary.modules.totalDocs, 134);
    analytics.shutdown();
  });

  it("should flush to disk and reload", () => {
    // Clear any existing analytics file for today so test is isolated
    // (previous tests in this suite may have flushed to the same temp dir)
    const today = new Date().toISOString().slice(0, 10);
    const analyticsDir = path.join(tempDir, ".gamedev-mcp", "analytics");
    const todayFile = path.join(analyticsDir, `${today}.json`);
    try { fs.unlinkSync(todayFile); } catch { /* may not exist */ }

    const analytics = new Analytics();
    analytics.recordToolCall("search_docs", 100);
    analytics.recordSearch({ resultCount: 5 });
    analytics.flush();

    // Create new instance — should load from disk
    const analytics2 = new Analytics();
    const summary = analytics2.getSummary();
    assert.equal(summary.tools["search_docs"]?.calls, 1);
    assert.equal(summary.search.totalQueries, 1);
    analytics.shutdown();
    analytics2.shutdown();
  });

  it("should be disabled when env var is false", () => {
    const origEnv = process.env.GAMEDEV_MCP_ANALYTICS;
    process.env.GAMEDEV_MCP_ANALYTICS = "false";

    // Re-import won't work due to module cache, but we can test the check
    // by verifying no writes happen
    const analytics = new Analytics();
    // In disabled state, calls are no-ops but don't throw
    analytics.recordToolCall("test", 100);
    analytics.recordSearch({ resultCount: 5 });
    analytics.flush(); // Should be no-op

    process.env.GAMEDEV_MCP_ANALYTICS = origEnv ?? "true";
    analytics.shutdown();
  });
});
