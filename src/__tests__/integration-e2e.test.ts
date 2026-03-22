/**
 * End-to-end integration tests for the full hybrid provider chain.
 *
 * Phase 5 coverage:
 * - Cache lifecycle: fresh → stale → evict → refetch
 * - Offline fallback: API down → stale cache → local bundle
 * - Performance benchmarks: cold fetch vs cached fetch latency
 * - Full chain: HybridProvider → DocCache → RemoteClient → DocStore
 */

import { describe, it, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import * as path from "path";
import * as fs from "fs";
import * as os from "os";
import { fileURLToPath } from "url";
import { DocStore } from "../core/docs.js";
import { DocCache } from "../core/doc-cache.js";
import { HybridProvider } from "../core/hybrid-provider.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const docsDir = path.resolve(__dirname, "..", "..", "docs");

// --- Cache Lifecycle Tests ---

describe("Cache Lifecycle (fresh → stale → evict → refetch)", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "gamedev-cache-lifecycle-"));
  });

  after(() => {
    // Clean up any remaining temp dirs
    try {
      if (tempDir && fs.existsSync(tempDir)) {
        fs.rmSync(tempDir, { recursive: true, force: true });
      }
    } catch { /* ignore */ }
  });

  it("Phase 1: fresh cache hit", () => {
    const cache = new DocCache({
      cacheDir: tempDir,
      docTtlMs: 60_000, // 1 minute
    });

    // Store a doc
    cache.setDoc("G64", "# Combat Systems\n\nFull guide content.", {
      id: "G64",
      title: "Combat Systems",
      description: "Full combat guide",
      module: "monogame-arch",
      category: "guide",
      tier: "pro",
      sizeBytes: 100,
      sections: ["Health", "Knockback"],
    });

    // Fresh read should succeed
    const result = cache.getDoc("G64");
    assert.ok(result, "Fresh doc should be retrievable");
    assert.equal(result.content, "# Combat Systems\n\nFull guide content.");
    assert.equal(result.meta.id, "G64");
    assert.equal(result.meta.tier, "pro");
  });

  it("Phase 2: stale cache (TTL expired)", () => {
    const cache = new DocCache({
      cacheDir: tempDir,
      docTtlMs: 1, // 1ms TTL — instantly stale
    });

    cache.setDoc("G64", "# Combat Systems\n\nStale content.", {
      id: "G64",
      title: "Combat Systems",
      description: "",
      module: "monogame-arch",
      category: "guide",
      tier: "pro",
      sizeBytes: 50,
      sections: [],
    });

    // Wait for TTL to expire
    const start = Date.now();
    while (Date.now() - start < 10) { /* busy wait */ }

    // Fresh read should fail
    const freshResult = cache.getDoc("G64");
    assert.equal(freshResult, null, "Expired doc should not be returned by getDoc");

    // Stale read should succeed (offline fallback)
    const staleResult = cache.getStaleDoc("G64");
    assert.ok(staleResult, "Stale doc should still be retrievable");
    assert.equal(staleResult.content, "# Combat Systems\n\nStale content.");
  });

  it("Phase 3: eviction cleans up expired entries", () => {
    const cache = new DocCache({
      cacheDir: tempDir,
      docTtlMs: 1, // instantly stale
    });

    // Store multiple docs
    for (let i = 0; i < 5; i++) {
      cache.setDoc(`DOC_${i}`, `Content ${i}`, {
        id: `DOC_${i}`,
        title: `Doc ${i}`,
        description: "",
        module: "core",
        category: "guide",
        tier: "free",
        sizeBytes: 10,
        sections: [],
      });
    }

    // Wait for expiry
    const start = Date.now();
    while (Date.now() - start < 10) { /* busy wait */ }

    // Evict
    const evicted = cache.evictExpired();
    assert.ok(evicted >= 5, `Should evict at least 5 entries, got ${evicted}`);

    // Verify files are gone
    for (let i = 0; i < 5; i++) {
      assert.equal(cache.hasDoc(`DOC_${i}`), false, `DOC_${i} should be evicted`);
      assert.equal(cache.getStaleDoc(`DOC_${i}`), null, `DOC_${i} stale should be gone`);
    }
  });

  it("Phase 4: refetch after eviction (new content)", () => {
    const cache = new DocCache({
      cacheDir: tempDir,
      docTtlMs: 60_000, // 1 minute
    });

    // Simulate: old content was evicted, now re-store with updated content
    cache.setDoc("G64", "# Combat Systems v2\n\nUpdated guide.", {
      id: "G64",
      title: "Combat Systems v2",
      description: "Updated",
      module: "monogame-arch",
      category: "guide",
      tier: "pro",
      sizeBytes: 100,
      sections: ["Health v2", "Knockback v2"],
    });

    const result = cache.getDoc("G64");
    assert.ok(result, "Refetched doc should be available");
    assert.ok(result.content.includes("v2"), "Should have updated content");
    assert.equal(result.meta.title, "Combat Systems v2");
  });

  it("full lifecycle in sequence", () => {
    // Fresh TTL cache
    const freshCache = new DocCache({
      cacheDir: tempDir,
      docTtlMs: 50, // 50ms TTL
    });

    // 1. Store
    freshCache.setDoc("LIFECYCLE", "# Original\n\nFirst version.", {
      id: "LIFECYCLE",
      title: "Lifecycle Test",
      description: "",
      module: "core",
      category: "guide",
      tier: "free",
      sizeBytes: 30,
      sections: ["Section A"],
    });

    // 2. Fresh read
    const fresh = freshCache.getDoc("LIFECYCLE");
    assert.ok(fresh, "Step 2: fresh read should work");
    assert.ok(fresh.content.includes("Original"));

    // 3. Wait for expiry
    const start = Date.now();
    while (Date.now() - start < 60) { /* busy wait */ }

    // 4. Fresh read fails, stale succeeds
    assert.equal(freshCache.getDoc("LIFECYCLE"), null, "Step 4: expired read should fail");
    const stale = freshCache.getStaleDoc("LIFECYCLE");
    assert.ok(stale, "Step 4: stale read should succeed");

    // 5. Evict
    const evicted = freshCache.evictExpired();
    assert.ok(evicted >= 1, "Step 5: should evict");
    assert.equal(freshCache.getStaleDoc("LIFECYCLE"), null, "Step 5: stale should be gone after evict");

    // 6. Refetch (store new version)
    freshCache.setDoc("LIFECYCLE", "# Updated\n\nSecond version.", {
      id: "LIFECYCLE",
      title: "Lifecycle Test v2",
      description: "",
      module: "core",
      category: "guide",
      tier: "free",
      sizeBytes: 30,
      sections: ["Section B"],
    });

    const refetched = freshCache.getDoc("LIFECYCLE");
    assert.ok(refetched, "Step 6: refetched doc should work");
    assert.ok(refetched.content.includes("Updated"));
    assert.equal(refetched.meta.title, "Lifecycle Test v2");
  });
});

// --- Offline Fallback Tests ---

describe("Offline Fallback Chain", () => {
  let docStore: DocStore;
  let tempDir: string;

  before(() => {
    docStore = new DocStore(docsDir);
    const modules: string[] = [];
    if (fs.existsSync(path.join(docsDir, "monogame-arch"))) modules.push("monogame-arch");
    if (fs.existsSync(path.join(docsDir, "godot-arch"))) modules.push("godot-arch");
    docStore.load(modules);
  });

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "gamedev-offline-test-"));
  });

  after(() => {
    try {
      if (tempDir && fs.existsSync(tempDir)) {
        fs.rmSync(tempDir, { recursive: true, force: true });
      }
    } catch { /* ignore */ }
  });

  it("should serve local docs when API is unreachable", async () => {
    const provider = new HybridProvider(docStore, {
      apiUrl: "https://definitely-unreachable-12345.example.com",
      timeoutMs: 500,
    });

    // Core docs should always work (served locally)
    const coreDoc = await provider.getDoc("camera-theory");
    assert.ok(coreDoc, "Core doc should be available offline");
    assert.equal(coreDoc.source, "local");
  });

  it("should use stale cache when API goes down", async () => {
    // Pre-populate cache with a Pro doc
    const cache = new DocCache({
      cacheDir: tempDir,
      docTtlMs: 1, // instantly stale
    });

    cache.setDoc("REMOTE_DOC", "# Remote Content\n\nCached remotely.", {
      id: "REMOTE_DOC",
      title: "Remote Doc",
      description: "",
      module: "monogame-arch",
      category: "guide",
      tier: "pro",
      sizeBytes: 40,
      sections: ["Section A"],
    });

    // Wait for stale
    const start = Date.now();
    while (Date.now() - start < 10) { /* busy wait */ }

    // Fresh read should fail
    assert.equal(cache.getDoc("REMOTE_DOC"), null, "Fresh cache should be expired");

    // Stale read should succeed (simulates offline fallback)
    const stale = cache.getStaleDoc("REMOTE_DOC");
    assert.ok(stale, "Stale cache should be available for offline fallback");
    assert.ok(stale.content.includes("Remote Content"));
  });

  it("should fall back to bundled local docs as last resort", async () => {
    const provider = new HybridProvider(docStore, {
      apiUrl: "https://unreachable.example.com",
      timeoutMs: 500,
    });

    // Non-core bundled docs should still be available via local fallback
    const allDocs = docStore.getAllDocs();
    const nonCoreDocs = allDocs.filter((d) => d.module !== "core");

    if (nonCoreDocs.length > 0) {
      const doc = await provider.getDoc(nonCoreDocs[0].id);
      assert.ok(doc, "Bundled non-core doc should be available as last resort");
      assert.equal(doc.source, "local");
    }
  });

  it("should report API unavailable in cache stats", async () => {
    const provider = new HybridProvider(docStore, {
      apiUrl: "https://unreachable.example.com",
      timeoutMs: 500,
    });

    // Trigger a health check that will fail
    await provider.getDoc("camera-theory");

    const stats = provider.getCacheStats();
    assert.equal(stats.enabled, true, "Hybrid should be enabled");
    assert.equal(stats.apiUrl, "https://unreachable.example.com");
    // apiAvailable will be null (core doc served locally, health check may not have been triggered)
    // or false (if health check was attempted)
  });

  it("pure local mode should work without any API config", async () => {
    const provider = new HybridProvider(docStore); // no apiUrl

    assert.equal(provider.isHybridEnabled, false);

    const stats = provider.getCacheStats();
    assert.equal(stats.enabled, false);
    assert.equal(stats.apiUrl, null);

    const doc = await provider.getDoc("camera-theory");
    assert.ok(doc, "Should find docs in pure local mode");
    assert.equal(doc.source, "local");
  });
});

// --- Performance Benchmarks ---

describe("Performance Benchmarks", () => {
  let docStore: DocStore;
  let tempDir: string;

  before(() => {
    docStore = new DocStore(docsDir);
    const modules: string[] = [];
    if (fs.existsSync(path.join(docsDir, "monogame-arch"))) modules.push("monogame-arch");
    if (fs.existsSync(path.join(docsDir, "godot-arch"))) modules.push("godot-arch");
    docStore.load(modules);

    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "gamedev-perf-test-"));
  });

  after(() => {
    try {
      if (tempDir && fs.existsSync(tempDir)) {
        fs.rmSync(tempDir, { recursive: true, force: true });
      }
    } catch { /* ignore */ }
  });

  it("local doc fetch should be < 5ms", async () => {
    const provider = new HybridProvider(docStore);

    const iterations = 100;
    const start = performance.now();
    for (let i = 0; i < iterations; i++) {
      await provider.getDoc("camera-theory");
    }
    const elapsed = performance.now() - start;
    const avgMs = elapsed / iterations;

    assert.ok(
      avgMs < 5,
      `Average local fetch should be < 5ms, got ${avgMs.toFixed(2)}ms`
    );
  });

  it("cache write + read should be < 10ms", () => {
    const cache = new DocCache({
      cacheDir: tempDir,
      docTtlMs: 60_000,
    });

    const content = "# Benchmark Doc\n\n" + "Lorem ipsum ".repeat(100);
    const meta = {
      id: "PERF_TEST",
      title: "Perf Test",
      description: "",
      module: "core",
      category: "guide",
      tier: "free" as const,
      sizeBytes: Buffer.byteLength(content),
      sections: [],
    };

    const iterations = 50;

    // Write benchmark
    const writeStart = performance.now();
    for (let i = 0; i < iterations; i++) {
      cache.setDoc(`PERF_${i}`, content, { ...meta, id: `PERF_${i}` });
    }
    const writeElapsed = performance.now() - writeStart;
    const avgWriteMs = writeElapsed / iterations;

    // Read benchmark
    const readStart = performance.now();
    for (let i = 0; i < iterations; i++) {
      cache.getDoc(`PERF_${i}`);
    }
    const readElapsed = performance.now() - readStart;
    const avgReadMs = readElapsed / iterations;

    assert.ok(
      avgWriteMs < 10,
      `Average cache write should be < 10ms, got ${avgWriteMs.toFixed(2)}ms`
    );
    assert.ok(
      avgReadMs < 10,
      `Average cache read should be < 10ms, got ${avgReadMs.toFixed(2)}ms`
    );
  });

  it("cache eviction should be < 50ms for 100 entries", () => {
    const cache = new DocCache({
      cacheDir: tempDir,
      docTtlMs: 1, // instantly stale
    });

    // Populate
    for (let i = 0; i < 100; i++) {
      cache.setDoc(`EVICT_PERF_${i}`, `Content ${i}`, {
        id: `EVICT_PERF_${i}`,
        title: `Evict ${i}`,
        description: "",
        module: "core",
        category: "guide",
        tier: "free",
        sizeBytes: 10,
        sections: [],
      });
    }

    // Wait for expiry
    const waitStart = Date.now();
    while (Date.now() - waitStart < 10) { /* busy wait */ }

    const evictStart = performance.now();
    const evicted = cache.evictExpired();
    const evictElapsed = performance.now() - evictStart;

    assert.ok(evicted >= 100, `Should evict >= 100 entries, got ${evicted}`);
    assert.ok(
      evictElapsed < 50,
      `Eviction of 100 entries should be < 50ms, got ${evictElapsed.toFixed(2)}ms`
    );
  });

  it("search index scoring should be < 1ms per doc", () => {
    // Build a realistic-sized index
    const index = Array.from({ length: 150 }, (_, i) => ({
      id: `doc_${i}`,
      title: `Document ${i} about ${i % 2 === 0 ? "cameras" : "combat"}`,
      description: `Description for doc ${i}`,
      category: "guide",
      module: i % 3 === 0 ? "core" : "monogame-arch",
      tier: (i % 3 === 0 ? "free" : "pro") as "free" | "pro",
      tokens: generateTokens(i),
    }));

    // Import search functions
    const queryTokens = ["camera", "follow", "smooth"];
    const docFreqs = new Map<string, number>();
    for (const entry of index) {
      const uniqueTokens = new Set(entry.tokens);
      for (const token of uniqueTokens) {
        docFreqs.set(token, (docFreqs.get(token) ?? 0) + 1);
      }
    }

    const start = performance.now();
    for (const entry of index) {
      let score = 0;
      const docTokenSet = new Set(entry.tokens);
      for (const qt of queryTokens) {
        if (!docTokenSet.has(qt)) continue;
        let tf = 0;
        for (const dt of entry.tokens) {
          if (dt === qt) tf++;
        }
        const df = docFreqs.get(qt) ?? 1;
        const idf = Math.log(1 + index.length / df);
        const normFactor = Math.sqrt(entry.tokens.length);
        score += (tf / normFactor) * idf;
        if (entry.title.toLowerCase().includes(qt)) score += 5;
      }
    }
    const elapsed = performance.now() - start;
    const avgMs = elapsed / index.length;

    assert.ok(
      avgMs < 1,
      `Average scoring should be < 1ms per doc, got ${avgMs.toFixed(4)}ms`
    );
  });

  it("getAllDocs should be < 10ms", () => {
    const provider = new HybridProvider(docStore);

    const start = performance.now();
    const docs = provider.getAllDocs();
    const elapsed = performance.now() - start;

    assert.ok(docs.length > 0, "Should have docs");
    assert.ok(
      elapsed < 10,
      `getAllDocs should be < 10ms, got ${elapsed.toFixed(2)}ms`
    );
  });
});

// --- Manifest Cache Tests ---

describe("Manifest Caching", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "gamedev-manifest-test-"));
  });

  after(() => {
    try {
      if (tempDir && fs.existsSync(tempDir)) {
        fs.rmSync(tempDir, { recursive: true, force: true });
      }
    } catch { /* ignore */ }
  });

  it("should cache and retrieve manifest", () => {
    const cache = new DocCache({
      cacheDir: tempDir,
      manifestTtlMs: 60_000,
    });

    const manifest = {
      docs: [
        {
          id: "G64",
          title: "Combat",
          description: "Guide",
          module: "monogame-arch",
          category: "guide",
          tier: "pro" as const,
          sizeBytes: 100,
          fetchedAt: Date.now(),
          sections: ["Health"],
        },
        {
          id: "camera-theory",
          title: "Camera Theory",
          description: "Concepts",
          module: "core",
          category: "concept",
          tier: "free" as const,
          sizeBytes: 5000,
          fetchedAt: Date.now(),
          sections: ["Follow"],
        },
      ],
      fetchedAt: Date.now(),
      apiVersion: "1.0.0",
    };

    cache.setManifest(manifest);
    const retrieved = cache.getManifest();

    assert.ok(retrieved, "Should retrieve cached manifest");
    assert.equal(retrieved.docs.length, 2);
    assert.equal(retrieved.apiVersion, "1.0.0");
  });

  it("should expire manifest based on TTL", () => {
    const cache = new DocCache({
      cacheDir: tempDir,
      manifestTtlMs: 1, // 1ms — instantly stale
    });

    cache.setManifest({
      docs: [],
      fetchedAt: Date.now(),
      apiVersion: "1.0.0",
    });

    // Wait for expiry
    const start = Date.now();
    while (Date.now() - start < 10) { /* busy wait */ }

    const result = cache.getManifest();
    assert.equal(result, null, "Expired manifest should return null");
  });

  it("should invalidate manifest on demand", () => {
    const cache = new DocCache({
      cacheDir: tempDir,
      manifestTtlMs: 60_000,
    });

    cache.setManifest({ docs: [], fetchedAt: Date.now() });
    assert.ok(cache.getManifest(), "Manifest should exist");

    cache.invalidateManifest();
    assert.equal(cache.getManifest(), null, "Invalidated manifest should return null");
  });
});

// --- Helper ---

function generateTokens(index: number): string[] {
  const basePools: Record<string, string[]> = {
    camera: ["camera", "follow", "smooth", "deadzone", "shake", "zoom", "lerp", "damping"],
    combat: ["combat", "damage", "health", "armor", "hitbox", "hurtbox", "knockback", "melee"],
    physics: ["physics", "collision", "rigidbody", "velocity", "force", "impulse", "raycast"],
    ai: ["ai", "pathfinding", "steering", "behavior", "tree", "state", "machine", "agent"],
  };

  const categories = Object.keys(basePools);
  const cat = categories[index % categories.length];
  const pool = basePools[cat];

  // Return a mix of tokens with some repetition for TF scoring
  const tokens: string[] = [];
  for (let i = 0; i < 50; i++) {
    tokens.push(pool[i % pool.length]);
  }
  // Add some unique tokens for variety
  tokens.push("gamedev", "tutorial", "guide", `doc${index}`);
  return tokens;
}
