import { describe, it, before } from "node:test";
import assert from "node:assert/strict";
import * as path from "path";
import * as fs from "fs";
import { fileURLToPath } from "url";
import { DocStore } from "../core/docs.js";
import { HybridProvider } from "../core/hybrid-provider.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const docsDir = path.resolve(__dirname, "..", "..", "docs");

describe("HybridProvider", () => {
  let docStore: DocStore;

  before(() => {
    docStore = new DocStore(docsDir);
    const modules: string[] = [];
    if (fs.existsSync(path.join(docsDir, "monogame-arch"))) modules.push("monogame-arch");
    if (fs.existsSync(path.join(docsDir, "godot-arch"))) modules.push("godot-arch");
    store_load(docStore, modules);
  });

  it("should serve local docs when hybrid mode is disabled", async () => {
    const provider = new HybridProvider(docStore); // no apiUrl
    assert.equal(provider.isHybridEnabled, false);

    const result = await provider.getDoc("camera-theory");
    assert.ok(result, "Should find local doc");
    assert.equal(result.source, "local");
    assert.ok(result.doc.content.length > 0);
  });

  it("should return null for nonexistent docs", async () => {
    const provider = new HybridProvider(docStore);
    const result = await provider.getDoc("TOTALLY_FAKE_DOC_999");
    assert.equal(result, null);
  });

  it("should always serve core docs locally even in hybrid mode", async () => {
    const provider = new HybridProvider(docStore, {
      apiUrl: "https://fake-api.example.com", // unreachable
    });
    assert.equal(provider.isHybridEnabled, true);

    // Core docs should be served locally, no API call
    const coreDocs = docStore.getAllDocs().filter((d) => d.module === "core");
    if (coreDocs.length > 0) {
      const result = await provider.getDoc(coreDocs[0].id);
      assert.ok(result, "Should find core doc locally");
      assert.equal(result.source, "local");
    }
  });

  it("should return all local docs from getAllDocs", () => {
    const provider = new HybridProvider(docStore);
    const docs = provider.getAllDocs();
    assert.ok(docs.length > 0);
    assert.equal(docs.length, docStore.getAllDocs().length);
  });

  it("should report cache stats", () => {
    const provider = new HybridProvider(docStore);
    const stats = provider.getCacheStats();
    assert.equal(stats.enabled, false);
    assert.equal(stats.apiUrl, null);
    assert.equal(stats.apiAvailable, null);
  });

  it("should report hybrid enabled when API URL is set", () => {
    const provider = new HybridProvider(docStore, {
      apiUrl: "https://api.example.com",
    });
    const stats = provider.getCacheStats();
    assert.equal(stats.enabled, true);
    assert.equal(stats.apiUrl, "https://api.example.com");
  });

  it("should fall back to local for non-core docs when API is unreachable", async () => {
    const provider = new HybridProvider(docStore, {
      apiUrl: "https://definitely-not-real-12345.example.com",
      timeoutMs: 1000,
    });

    // Find a non-core doc
    const nonCoreDocs = docStore.getAllDocs().filter((d) => d.module !== "core");
    if (nonCoreDocs.length > 0) {
      const result = await provider.getDoc(nonCoreDocs[0].id);
      assert.ok(result, "Should fall back to local doc");
      assert.equal(result.source, "local");
    }
  });
});

function store_load(store: DocStore, modules: string[]) {
  store.load(modules);
}
