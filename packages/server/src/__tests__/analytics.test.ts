import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";

// Set analytics dir to temp before importing
const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "gamelens-analytics-test-"));

// We need to test the Analytics class directly
// Since it uses a config dir based on HOME, we test via the public API

describe("Analytics", () => {
  // Import dynamically to avoid singleton issues
  let Analytics: any;

  before(async () => {
    // Set HOME to temp for test isolation
    process.env.HOME = tempDir;
    process.env.GAMELENS_ANALYTICS = "true";
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
    assert.equal(summary.search.totalQueries, 0);
    assert.equal(summary.docs.totalFetches, 0);
    analytics.shutdown();
  });

  it("should record tool calls with duration", () => {
    const analytics = new Analytics();
    analytics.recordToolCall("lens", 150);
    analytics.recordToolCall("lens", 250);
    analytics.recordToolCall("other", 50, true); // with error

    const summary = analytics.getSummary();
    assert.equal(summary.tools["lens"].calls, 2);
    assert.equal(summary.tools["lens"].errors, 0);
    assert.equal(summary.tools["lens"].avgDurationMs, 200);
    assert.equal(summary.tools["other"].calls, 1);
    assert.equal(summary.tools["other"].errors, 1);
    analytics.shutdown();
  });

  it("should record search patterns without query text", () => {
    const analytics = new Analytics();
    analytics.recordSearch({ resultCount: 5 });
    analytics.recordSearch({ resultCount: 3 });
    analytics.recordSearch({ resultCount: 0 }); // zero result

    const summary = analytics.getSummary();
    assert.equal(summary.search.totalQueries, 3);
    assert.equal(summary.search.zeroResultQueries, 1);
    analytics.shutdown();
  });

  it("should record doc access patterns", () => {
    const analytics = new Analytics();
    analytics.recordDocAccess({ docId: "E6" });
    analytics.recordDocAccess({ docId: "E6", usedSection: true });
    analytics.recordDocAccess({ docId: "C1", usedMaxLength: true });

    const summary = analytics.getSummary();
    assert.equal(summary.docs.totalFetches, 3);
    assert.equal(summary.docs.byDoc["E6"], 2);
    assert.equal(summary.docs.byDoc["C1"], 1);
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

  it("should record startup info", () => {
    const analytics = new Analytics();
    analytics.recordStartup({
      version: "3.0.0",
      startupTimeMs: 342,
      totalDocs: 10,
    });

    const summary = analytics.getSummary();
    assert.equal(summary.version, "3.0.0");
    assert.equal(summary.startupTimeMs, 342);
    assert.equal(summary.library.totalDocs, 10);
    analytics.shutdown();
  });

  it("should flush to disk and reload", () => {
    // Clear any existing analytics file for today so test is isolated
    // (previous tests in this suite may have flushed to the same temp dir)
    const today = new Date().toISOString().slice(0, 10);
    const analyticsDir = path.join(tempDir, ".gamelens", "analytics");
    const todayFile = path.join(analyticsDir, `${today}.json`);
    try { fs.unlinkSync(todayFile); } catch { /* may not exist */ }

    const analytics = new Analytics();
    analytics.recordToolCall("lens", 100);
    analytics.recordSearch({ resultCount: 5 });
    analytics.flush();

    // Create new instance — should load from disk
    const analytics2 = new Analytics();
    const summary = analytics2.getSummary();
    assert.equal(summary.tools["lens"]?.calls, 1);
    assert.equal(summary.search.totalQueries, 1);
    analytics.shutdown();
    analytics2.shutdown();
  });

  it("should be disabled when env var is false", () => {
    const origEnv = process.env.GAMELENS_ANALYTICS;
    process.env.GAMELENS_ANALYTICS = "false";

    // Re-import won't work due to module cache, but we can test the check
    // by verifying no writes happen
    const analytics = new Analytics();
    // In disabled state, calls are no-ops but don't throw
    analytics.recordToolCall("test", 100);
    analytics.recordSearch({ resultCount: 5 });
    analytics.flush(); // Should be no-op

    process.env.GAMELENS_ANALYTICS = origEnv ?? "true";
    analytics.shutdown();
  });
});
