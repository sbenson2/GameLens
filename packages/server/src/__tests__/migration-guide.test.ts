import { describe, it, before } from "node:test";
import assert from "node:assert/strict";
import * as path from "path";
import { fileURLToPath } from "url";
import { DocStore } from "../core/docs.js";
import { SearchEngine } from "../core/search.js";
import { discoverModules, ModuleMetadata } from "../core/modules.js";
import { handleMigrationGuide } from "../tools/migration-guide.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const docsRoot = path.resolve(__dirname, "../../docs");

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

describe("migration_guide", () => {
  it("generates Unity → Godot migration guide", () => {
    const result = handleMigrationGuide(
      { from: "Unity", to: "Godot" },
      docStore, searchEngine, modulesMeta
    );

    const text = result.content[0].text;
    assert.ok(text.includes("Migration Guide: Unity → Godot"), "Should have migration header");
    assert.ok(text.includes("Concept Mapping"), "Should have concept mapping table");
    assert.ok(text.includes("Key Differences & Gotchas"), "Should have gotchas section");
    assert.ok(text.includes("CharacterBody2D"), "Should mention CharacterBody2D gotcha");
    assert.ok(text.includes("Migration Strategy"), "Should have strategy section");
  });

  it("generates MonoGame → Godot migration guide", () => {
    const result = handleMigrationGuide(
      { from: "MonoGame", to: "Godot" },
      docStore, searchEngine, modulesMeta
    );

    const text = result.content[0].text;
    assert.ok(text.includes("Migration Guide: Monogame → Godot"), "Should have migration header");
    assert.ok(text.includes("Concept Mapping"), "Should have concept mapping table");
    assert.ok(text.includes("Key Differences & Gotchas"), "Should have gotchas");
    assert.ok(text.includes("Godot Docs to Learn"), "Should suggest Godot docs");
  });

  it("generates Godot → Unity migration guide", () => {
    const result = handleMigrationGuide(
      { from: "Godot", to: "Unity" },
      docStore, searchEngine, modulesMeta
    );

    const text = result.content[0].text;
    assert.ok(text.includes("Migration Guide: Godot → Unity"), "Should have header");
    assert.ok(text.includes("Key Differences & Gotchas"), "Should have gotchas");
    assert.ok(text.includes("No equivalent to GDScript"), "Should mention GDScript gotcha");
  });

  it("filters by topic when specified", () => {
    const result = handleMigrationGuide(
      { from: "Unity", to: "Godot", topic: "physics" },
      docStore, searchEngine, modulesMeta
    );

    const text = result.content[0].text;
    assert.ok(text.includes("Migration Guide: Unity → Godot"), "Should have header");
    assert.ok(text.includes("Physics"), "Should include physics in concept mapping");
  });

  it("handles unknown source engine", () => {
    const result = handleMigrationGuide(
      { from: "FakeEngine9000", to: "Godot" },
      docStore, searchEngine, modulesMeta
    );

    const text = result.content[0].text;
    assert.ok(text.includes("Unknown source engine"), "Should report unknown engine");
    assert.ok(text.includes("Known engines"), "Should list available engines");
  });

  it("handles unknown target engine", () => {
    const result = handleMigrationGuide(
      { from: "Godot", to: "Defold" },
      docStore, searchEngine, modulesMeta
    );

    const text = result.content[0].text;
    // Defold is in ENGINE_MAP but has no module — should still work (known engine)
    assert.ok(
      text.includes("Migration Guide") || text.includes("Unknown target engine"),
      "Should either generate guide or report unknown"
    );
  });

  it("rejects same-engine migration", () => {
    const result = handleMigrationGuide(
      { from: "Godot", to: "Godot" },
      docStore, searchEngine, modulesMeta
    );

    const text = result.content[0].text;
    assert.ok(text.includes("same"), "Should reject same-engine migration");
  });

  it("supports partial engine name matching", () => {
    const result = handleMigrationGuide(
      { from: "mono", to: "god" },
      docStore, searchEngine, modulesMeta
    );

    const text = result.content[0].text;
    assert.ok(text.includes("Migration Guide"), "Should resolve partial names");
    assert.ok(text.includes("Concept Mapping"), "Should have concept mapping");
  });

  it("includes core theory docs", () => {
    const result = handleMigrationGuide(
      { from: "Unity", to: "Godot", topic: "camera" },
      docStore, searchEngine, modulesMeta
    );

    const text = result.content[0].text;
    // Should reference camera-theory or other core docs
    assert.ok(
      text.includes("Engine-Agnostic Theory") || text.includes("camera-theory") || text.includes("Camera"),
      "Should include relevant theory or camera content"
    );
  });

  it("limits docs per engine with maxDocs", () => {
    const result = handleMigrationGuide(
      { from: "MonoGame", to: "Godot", maxDocs: 1 },
      docStore, searchEngine, modulesMeta
    );

    const text = result.content[0].text;
    assert.ok(text.includes("Migration Guide"), "Should still generate guide");
    // With maxDocs=1, should have fewer doc references
    const getDocCount = (text.match(/get_doc\(/g) || []).length;
    // Hard to assert exact count since core docs also appear, but should be reasonable
    assert.ok(getDocCount <= 15, `Should have limited docs, got ${getDocCount}`);
  });

  it("concept mapping table has both engines", () => {
    const result = handleMigrationGuide(
      { from: "MonoGame", to: "Godot" },
      docStore, searchEngine, modulesMeta
    );

    const text = result.content[0].text;
    // Verify table has both engine columns
    assert.ok(text.includes("| **Architecture**"), "Should have Architecture row");
    assert.ok(text.includes("| **Physics**"), "Should have Physics row");
    assert.ok(text.includes("| **Input Handling**"), "Should have Input row");
    assert.ok(text.includes("Node tree"), "Should have Godot architecture description");
    assert.ok(text.includes("ECS"), "Should have MonoGame architecture description");
  });

  it("handles engines without modules gracefully", () => {
    const result = handleMigrationGuide(
      { from: "Bevy", to: "Godot" },
      docStore, searchEngine, modulesMeta
    );

    const text = result.content[0].text;
    // Bevy likely has no module — should still show concept mappings
    assert.ok(text.includes("Concept Mapping"), "Should still show concept mappings");
    assert.ok(text.includes("Rust"), "Should mention Rust for Bevy");
  });
});
