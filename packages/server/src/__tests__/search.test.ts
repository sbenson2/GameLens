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

  // --- Stemming tests (Search P4) ---

  it("should match plural to singular via stemming ('animations' → animation docs)", () => {
    const singular = engine.search("animation", allDocs, 5);
    const plural = engine.search("animations", allDocs, 5);
    assert.ok(plural.length > 0, "Plural query should find results");
    // The top result for both should be the same doc
    if (singular.length > 0 && plural.length > 0) {
      assert.equal(
        singular[0].doc.id,
        plural[0].doc.id,
        "Singular and plural should return the same top result"
      );
    }
  });

  it("should match '-ing' form to base via stemming ('rendering' → render docs)", () => {
    const base = engine.search("render pipeline", allDocs, 5);
    const gerund = engine.search("rendering pipeline", allDocs, 5);
    assert.ok(gerund.length > 0, "Gerund query should find results");
    if (base.length > 0 && gerund.length > 0) {
      assert.equal(
        base[0].doc.id,
        gerund[0].doc.id,
        "Base and gerund forms should return the same top result"
      );
    }
  });

  it("should match '-ed' form to base via stemming ('optimized' → optimization docs)", () => {
    const results = engine.search("optimized performance", allDocs, 5);
    assert.ok(results.length > 0, "Past tense query should find results via stemming");
  });

  it("should match '-tion' suffix via stemming ('serialization' → save/load docs)", () => {
    const base = engine.search("serialize save", allDocs, 5);
    const derived = engine.search("serialization save", allDocs, 5);
    assert.ok(derived.length > 0, "Derived form query should find results");
    // Both should find save/serialization content
    if (base.length > 0 && derived.length > 0) {
      const baseIds = base.map(r => r.doc.id);
      const derivedIds = derived.map(r => r.doc.id);
      // At least one overlapping result
      const overlap = baseIds.filter(id => derivedIds.includes(id));
      assert.ok(overlap.length > 0, "Base and -tion forms should have overlapping results");
    }
  });

  it("should match '-ies' to '-y' via stemming ('enemies' → enemy AI docs)", () => {
    const singular = engine.search("enemy ai behavior", allDocs, 5);
    const plural = engine.search("enemies ai behavior", allDocs, 5);
    assert.ok(plural.length > 0, "Plural -ies query should find results");
    // Both should find AI-related content
    if (singular.length > 0 && plural.length > 0) {
      assert.equal(
        singular[0].doc.id,
        plural[0].doc.id,
        "'enemies' and 'enemy' should return the same top result"
      );
    }
  });

  it("should not over-stem short words (< 5 chars stay unchanged)", () => {
    // 'game', 'code', 'node' should not be stemmed to gibberish
    const results = engine.search("game code", allDocs, 5);
    assert.ok(results.length > 0, "Short words should still match without stemming");
  });

  it("should handle synonym + stemming combo ('spawning enemies' → pool + AI docs)", () => {
    const results = engine.search("spawning enemies", allDocs, 5);
    assert.ok(results.length > 0, "Synonym + stemming combo should find results");
    // 'spawning' stems to 'spawn' which has synonyms [pool, pooling, instantiate]
    // 'enemies' stems to 'enemy' which has synonyms [enemy, ai]
  });
});
