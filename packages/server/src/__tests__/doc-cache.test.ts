import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import * as path from "path";
import * as fs from "fs";
import * as os from "os";
import { DocCache } from "../core/doc-cache.js";

describe("DocCache", () => {
  let cache: DocCache;
  let tempDir: string;

  before(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "gamedev-cache-test-"));
    cache = new DocCache({
      cacheDir: tempDir,
      docTtlMs: 60_000, // 1 minute for tests
      manifestTtlMs: 30_000,
    });
  });

  after(() => {
    // Clean up temp dir
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it("should store and retrieve doc content", () => {
    const content = "# Test Doc\n\nSome content here.";
    cache.setDoc("G64", content, {
      id: "G64",
      title: "Combat Systems",
      description: "Full combat guide",
      module: "monogame-arch",
      category: "guide",
      tier: "pro",
      sizeBytes: Buffer.byteLength(content),
      sections: ["Health", "Knockback"],
    });

    const result = cache.getDoc("G64");
    assert.ok(result, "Should retrieve cached doc");
    assert.equal(result.content, content);
    assert.equal(result.meta.id, "G64");
    assert.equal(result.meta.title, "Combat Systems");
    assert.equal(result.meta.tier, "pro");
    assert.deepEqual(result.meta.sections, ["Health", "Knockback"]);
  });

  it("should return null for missing docs", () => {
    const result = cache.getDoc("NONEXISTENT");
    assert.equal(result, null);
  });

  it("should store and retrieve manifest", () => {
    const manifest = {
      docs: [
        {
          id: "G64",
          title: "Combat",
          description: "test",
          module: "monogame-arch",
          category: "guide",
          tier: "pro" as const,
          sizeBytes: 100,
          fetchedAt: Date.now(),
          sections: [],
        },
      ],
      fetchedAt: Date.now(),
      apiVersion: "1.0.0",
    };

    cache.setManifest(manifest);
    const result = cache.getManifest();
    assert.ok(result, "Should retrieve cached manifest");
    assert.equal(result.docs.length, 1);
    assert.equal(result.docs[0].id, "G64");
    assert.equal(result.apiVersion, "1.0.0");
  });

  it("should handle prefixed IDs with slashes", () => {
    const content = "# Godot G1\n\nScene composition.";
    cache.setDoc("godot-arch/G1", content, {
      id: "godot-arch/G1",
      title: "Scene Composition",
      description: "",
      module: "godot-arch",
      category: "guide",
      tier: "pro",
      sizeBytes: Buffer.byteLength(content),
      sections: [],
    });

    const result = cache.getDoc("godot-arch/G1");
    assert.ok(result, "Should retrieve doc with slashes in ID");
    assert.equal(result.meta.id, "godot-arch/G1");
  });

  it("should invalidate specific docs", () => {
    cache.setDoc("TO_DELETE", "content", {
      id: "TO_DELETE",
      title: "Delete Me",
      description: "",
      module: "core",
      category: "concept",
      tier: "free",
      sizeBytes: 7,
      sections: [],
    });

    assert.ok(cache.getDoc("TO_DELETE"), "Doc should exist before invalidation");
    cache.invalidateDoc("TO_DELETE");
    assert.equal(cache.getDoc("TO_DELETE"), null, "Doc should be gone after invalidation");
  });

  it("should return stale docs for offline fallback", () => {
    // Create a cache with very short TTL
    const shortCache = new DocCache({
      cacheDir: tempDir,
      docTtlMs: 1, // 1ms TTL — instantly stale
    });

    shortCache.setDoc("STALE_TEST", "stale content", {
      id: "STALE_TEST",
      title: "Stale",
      description: "",
      module: "core",
      category: "guide",
      tier: "pro",
      sizeBytes: 13,
      sections: [],
    });

    // Wait for TTL to expire
    const start = Date.now();
    while (Date.now() - start < 5) {
      // busy wait 5ms
    }

    // Fresh get should return null (expired)
    assert.equal(shortCache.getDoc("STALE_TEST"), null, "Should be expired");

    // Stale get should still work
    const stale = shortCache.getStaleDoc("STALE_TEST");
    assert.ok(stale, "Should return stale doc");
    assert.equal(stale.content, "stale content");
  });

  it("should report cache stats", () => {
    const stats = cache.stats();
    assert.ok(stats.docCount >= 0, "Should have non-negative doc count");
    assert.ok(stats.totalSizeBytes >= 0, "Should have non-negative size");
  });

  it("should clear the entire cache", () => {
    cache.setDoc("CLEAR_TEST", "data", {
      id: "CLEAR_TEST",
      title: "Clear",
      description: "",
      module: "core",
      category: "guide",
      tier: "free",
      sizeBytes: 4,
      sections: [],
    });

    cache.clear();
    assert.equal(cache.getDoc("CLEAR_TEST"), null, "Should be gone after clear");
    assert.equal(cache.getManifest(), null, "Manifest should be gone after clear");
  });

  it("should evict expired entries", () => {
    const shortCache = new DocCache({
      cacheDir: tempDir,
      docTtlMs: 1,
    });

    shortCache.setDoc("EVICT1", "data1", {
      id: "EVICT1",
      title: "Evict 1",
      description: "",
      module: "core",
      category: "guide",
      tier: "free",
      sizeBytes: 5,
      sections: [],
    });

    // Wait for expiry
    const start = Date.now();
    while (Date.now() - start < 5) {}

    const evicted = shortCache.evictExpired();
    assert.ok(evicted >= 1, "Should evict at least one entry");
    assert.equal(shortCache.hasDoc("EVICT1"), false, "Evicted doc should be gone");
  });
});
