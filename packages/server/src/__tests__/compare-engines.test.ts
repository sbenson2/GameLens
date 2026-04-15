import { describe, it, before } from "node:test";
import assert from "node:assert/strict";
import * as path from "path";
import { fileURLToPath } from "url";
import { DocStore } from "../core/docs.js";
import { SearchEngine } from "../core/search.js";
import { discoverModules, ModuleMetadata } from "../core/modules.js";
import { handleCompareEngines } from "../tools/compare-engines.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const docsRoot = path.resolve(__dirname, "../../docs");

let docStore: DocStore;
let searchEngine: SearchEngine;
let modulesMeta: ModuleMetadata[];

before(async () => {
  docStore = new DocStore(docsRoot);
  modulesMeta = await discoverModules(docsRoot);
  const activeModules = modulesMeta.map((m) => m.id);
  await docStore.load(activeModules);

  searchEngine = new SearchEngine();
  searchEngine.index(docStore.getAllDocs());
});

describe("compare_engines", () => {
  it("returns comparison for 'camera' topic across all engines", () => {
    const result = handleCompareEngines(
      { topic: "camera" },
      docStore,
      searchEngine,
      modulesMeta
    );

    const text = result.content[0].text;
    assert.ok(text.includes("Engine Comparison: Camera"), "Should have comparison header");
    assert.ok(text.includes("Core Theory"), "Should find camera theory doc");
    assert.ok(text.includes("camera-theory"), "Should reference camera-theory doc");
    assert.ok(text.includes("Engine Implementations"), "Should have engine section");
  });

  it("returns comparison for 'physics' topic", () => {
    const result = handleCompareEngines(
      { topic: "physics" },
      docStore,
      searchEngine,
      modulesMeta
    );

    const text = result.content[0].text;
    assert.ok(text.includes("Engine Comparison: Physics"), "Should have physics header");
    assert.ok(text.includes("physics-theory"), "Should find physics theory doc");
  });

  it("returns comparison for 'state machine' topic", () => {
    const result = handleCompareEngines(
      { topic: "state machine" },
      docStore,
      searchEngine,
      modulesMeta
    );

    const text = result.content[0].text;
    assert.ok(text.includes("Engine Comparison: State machine"), "Should have state machine header");
    assert.ok(text.includes("Engine Implementations"), "Should find engine docs");
  });

  it("filters to specific engines when requested", () => {
    const result = handleCompareEngines(
      { topic: "camera", engines: ["Godot"] },
      docStore,
      searchEngine,
      modulesMeta
    );

    const text = result.content[0].text;
    assert.ok(text.includes("Godot"), "Should include Godot results");
    // Should not have comparison table with only 1 engine
    assert.ok(!text.includes("Quick Comparison"), "Should not show comparison table for single engine");
  });

  it("handles unknown engine gracefully", () => {
    const result = handleCompareEngines(
      { topic: "camera", engines: ["Unreal", "CryEngine"] },
      docStore,
      searchEngine,
      modulesMeta
    );

    const text = result.content[0].text;
    assert.ok(
      text.includes("No matching engines") || text.includes("Engine Comparison"),
      "Should handle gracefully"
    );
  });

  it("finds theory doc for combat topic", () => {
    const result = handleCompareEngines(
      { topic: "combat" },
      docStore,
      searchEngine,
      modulesMeta
    );

    const text = result.content[0].text;
    assert.ok(text.includes("combat-theory"), "Should find combat-theory doc");
    assert.ok(text.includes("Core Theory"), "Should have theory section");
  });

  it("respects maxDocsPerEngine", () => {
    const result1 = handleCompareEngines(
      { topic: "camera", maxDocsPerEngine: 1 },
      docStore,
      searchEngine,
      modulesMeta
    );

    const result3 = handleCompareEngines(
      { topic: "camera", maxDocsPerEngine: 3 },
      docStore,
      searchEngine,
      modulesMeta
    );

    // Result with max 1 should be shorter
    assert.ok(
      result1.content[0].text.length <= result3.content[0].text.length,
      "maxDocsPerEngine=1 should produce shorter or equal output"
    );
  });

  it("handles topic with no matches", () => {
    const result = handleCompareEngines(
      { topic: "quantum entanglement blockchain" },
      docStore,
      searchEngine,
      modulesMeta
    );

    const text = result.content[0].text;
    // With TF-IDF, even obscure queries may return low-relevance results,
    // but the output should still be a valid comparison format
    assert.ok(
      text.includes("Engine Comparison") || text.includes("No docs found"),
      "Should produce valid comparison output"
    );
  });

  it("includes get_doc hints for easy follow-up", () => {
    const result = handleCompareEngines(
      { topic: "input handling" },
      docStore,
      searchEngine,
      modulesMeta
    );

    const text = result.content[0].text;
    assert.ok(text.includes("get_doc("), "Should include get_doc follow-up hints");
  });

  it("shows quick comparison table when multiple engines have results", () => {
    const result = handleCompareEngines(
      { topic: "camera" },
      docStore,
      searchEngine,
      modulesMeta
    );

    const text = result.content[0].text;
    // If both Godot and MonoGame have camera docs, should show table
    if (text.includes("Godot") && text.includes("MonoGame")) {
      assert.ok(text.includes("Quick Comparison"), "Should show comparison table for multiple engines");
      assert.ok(text.includes("| Aspect"), "Table should have headers");
    }
  });

  it("supports partial engine name matching", () => {
    const result = handleCompareEngines(
      { topic: "camera", engines: ["god"] },
      docStore,
      searchEngine,
      modulesMeta
    );

    const text = result.content[0].text;
    assert.ok(text.includes("Godot"), "Should match 'god' to 'Godot'");
  });

  it("shows key sections for top doc per engine", () => {
    const result = handleCompareEngines(
      { topic: "camera" },
      docStore,
      searchEngine,
      modulesMeta
    );

    const text = result.content[0].text;
    assert.ok(text.includes("Key sections:"), "Should show key sections for top doc");
  });
});
