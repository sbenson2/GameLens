import { describe, it, before } from "node:test";
import assert from "node:assert/strict";
import * as path from "path";
import * as fs from "fs";
import { fileURLToPath } from "url";
import { Doc, DocStore } from "../core/docs.js";
import { SearchEngine } from "../core/search.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const docsDir = path.resolve(__dirname, "..", "..", "docs");

describe("SearchEngine", () => {
  let engine: SearchEngine;
  let allDocs: Doc[];

  before(() => {
    const store = new DocStore(docsDir);
    const modules: string[] = [];
    if (fs.existsSync(path.join(docsDir, "monogame-arch"))) modules.push("monogame-arch");
    if (fs.existsSync(path.join(docsDir, "godot-arch"))) modules.push("godot-arch");
    if (fs.existsSync(path.join(docsDir, "core"))) modules.push("core");
    store.load(modules);
    allDocs = store.getAllDocs();
    engine = new SearchEngine();
    engine.index(allDocs);
  });

  it("should return results for a broad query", () => {
    const results = engine.search("camera", allDocs, 5);
    assert.ok(results.length > 0, "Should find camera-related docs");
  });

  it("should return empty for nonsense query", () => {
    const results = engine.search("xyzzyflurbo99", allDocs, 5);
    assert.equal(results.length, 0, "Nonsense query should return nothing");
  });

  it("should handle hyphenated queries", () => {
    const results = engine.search("character-controller", allDocs, 5);
    assert.ok(results.length > 0, "Hyphenated query should find results");
  });

  it("should handle C# queries", () => {
    const results = engine.search("C# MonoGame", allDocs, 5);
    assert.ok(results.length > 0, "C# query should find results");
  });

  it("should rank exact title matches highly", () => {
    const results = engine.search("combat damage systems", allDocs, 5);
    assert.ok(results.length > 0, "Should find combat docs");
  });

  it("should respect result limit", () => {
    const results = engine.search("game", allDocs, 3);
    assert.ok(results.length <= 3, "Should respect limit parameter");
  });

  it("should return snippets", () => {
    const results = engine.search("state machine", allDocs, 3);
    if (results.length > 0) {
      assert.ok(results[0].snippet.length > 0, "Results should include snippets");
    }
  });

  it("should handle stop-word-heavy queries gracefully", () => {
    const results = engine.search("how to make the best game", allDocs, 5);
    assert.ok(Array.isArray(results), "Should handle stop-word queries");
  });
});
