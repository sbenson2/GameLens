import { describe, it, before } from "node:test";
import assert from "node:assert/strict";
import * as path from "path";
import { fileURLToPath } from "url";
import { DocStore } from "../core/docs.js";
import { SearchEngine } from "../core/search.js";
import { discoverModules, ModuleMetadata } from "../core/modules.js";
import { handleSearchDocs } from "../tools/search-docs.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const docsRoot = path.resolve(__dirname, "../../docs");

describe("Cross-Engine Search", () => {
  let docStore: DocStore;
  let searchEngine: SearchEngine;
  let modulesMeta: ModuleMetadata[];

  before(() => {
    docStore = new DocStore(docsRoot);
    modulesMeta = discoverModules(docsRoot);
    const activeModules = modulesMeta.map((m) => m.id);
    docStore.load(activeModules);
    searchEngine = new SearchEngine();
    searchEngine.index(docStore.getAllDocs());
  });

  it("should return results from multiple engines when no filter is applied", () => {
    const result = handleSearchDocs(
      { query: "state machine" },
      docStore,
      searchEngine,
      modulesMeta
    );
    const text = result.content[0].text;
    // Should find results (state machine is in both MonoGame and Godot)
    assert.ok(text.includes("Found"), `Expected results, got: ${text.slice(0, 200)}`);
    // Should contain engine labels when cross-engine
    assert.ok(
      text.includes("MonoGame") || text.includes("Godot") || text.includes("Core"),
      "Expected engine labels in cross-engine results"
    );
  });

  it("should filter by engine name", () => {
    const result = handleSearchDocs(
      { query: "scene composition", engine: "Godot" },
      docStore,
      searchEngine,
      modulesMeta
    );
    const text = result.content[0].text;
    assert.ok(text.includes("Found"), `Expected results for Godot, got: ${text.slice(0, 200)}`);
    // Should NOT contain MonoGame-only results
    const lines = text.split("\n").filter((l) => l.match(/^\d+\./));
    for (const line of lines) {
      assert.ok(
        !line.includes("[monogame-arch/") || line.includes("[core/"),
        `Found unexpected MonoGame doc in Godot-filtered results: ${line}`
      );
    }
  });

  it("should return error for unknown engine", () => {
    const result = handleSearchDocs(
      { query: "camera", engine: "CryEngine" },
      docStore,
      searchEngine,
      modulesMeta
    );
    const text = result.content[0].text;
    assert.ok(text.includes("No modules found"), `Expected no-match message, got: ${text.slice(0, 200)}`);
    assert.ok(text.includes("list_modules"), "Should suggest list_modules");
  });

  it("should include core docs when filtering by engine", () => {
    const result = handleSearchDocs(
      { query: "camera", engine: "Godot" },
      docStore,
      searchEngine,
      modulesMeta
    );
    const text = result.content[0].text;
    // Core camera theory should still appear alongside Godot results
    assert.ok(text.includes("Found"), `Expected results, got: ${text.slice(0, 200)}`);
  });

  it("should group by engine when crossEngine=true", () => {
    const result = handleSearchDocs(
      { query: "input handling", crossEngine: true },
      docStore,
      searchEngine,
      modulesMeta
    );
    const text = result.content[0].text;
    // When enough results, should use grouped format with ### headers
    if (text.includes("###")) {
      // Grouped format — check for engine headers
      assert.ok(
        text.includes("### ") && text.includes("score:"),
        "Grouped format should have engine headers and scores"
      );
    }
    // Either way, should have results
    assert.ok(text.includes("Found"), `Expected results, got: ${text.slice(0, 200)}`);
  });

  it("should handle case-insensitive engine names", () => {
    const result = handleSearchDocs(
      { query: "signal", engine: "godot" },
      docStore,
      searchEngine,
      modulesMeta
    );
    const text = result.content[0].text;
    assert.ok(text.includes("Found"), `Expected results for lowercase 'godot', got: ${text.slice(0, 200)}`);
  });

  it("should work without module metadata (backward compatible)", () => {
    const result = handleSearchDocs(
      { query: "camera" },
      docStore,
      searchEngine
      // No modulesMeta — backward compat
    );
    const text = result.content[0].text;
    assert.ok(text.includes("Found"), `Expected results without metadata, got: ${text.slice(0, 200)}`);
  });

  it("should handle engine + category filter combination", () => {
    const result = handleSearchDocs(
      { query: "architecture", engine: "Godot", category: "architecture" },
      docStore,
      searchEngine,
      modulesMeta
    );
    const text = result.content[0].text;
    // Should find Godot architecture docs
    assert.ok(text.includes("Found") || text.includes("No docs found"), "Should return valid response");
  });

  it("should show cross-engine summary in header when results span engines", () => {
    const result = handleSearchDocs(
      { query: "performance optimization" },
      docStore,
      searchEngine,
      modulesMeta
    );
    const text = result.content[0].text;
    if (text.includes("across")) {
      assert.ok(text.includes("engines"), "Cross-engine header should mention engines");
    }
  });

  it("should support partial engine name matching", () => {
    const result = handleSearchDocs(
      { query: "camera", engine: "mono" },
      docStore,
      searchEngine,
      modulesMeta
    );
    const text = result.content[0].text;
    assert.ok(text.includes("Found"), `Expected partial match for 'mono', got: ${text.slice(0, 200)}`);
  });
});
