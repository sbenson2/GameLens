import { describe, it, before } from "node:test";
import assert from "node:assert/strict";
import { handleGenerateStarter } from "../tools/generate-starter.js";
import { DocStore } from "../core/docs.js";
import { SearchEngine } from "../core/search.js";
import * as path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const docsRoot = path.resolve(__dirname, "../../docs");

const docStore = new DocStore(docsRoot);
const searchEngine = new SearchEngine();

describe("generate_starter", () => {
  before(async () => {
    await docStore.load(["core"]);
    searchEngine.index(docStore.getAllDocs());
  });
  it("should generate MonoGame movement starter", async () => {
    const result = await handleGenerateStarter(
      { engine: "monogame", feature: "player movement" },
      docStore, searchEngine
    );
    const text = result.content[0].text;
    assert.ok(text.includes("Player Movement"), "Should have title");
    assert.ok(text.includes("```csharp"), "Should have C# code block");
    assert.ok(text.includes("Common Gotchas"), "Should have gotchas");
    assert.ok(text.includes("Related Docs"), "Should have related docs");
  });

  it("should generate Godot combat starter", async () => {
    const result = await handleGenerateStarter(
      { engine: "godot", feature: "combat" },
      docStore, searchEngine
    );
    const text = result.content[0].text;
    assert.ok(text.includes("Combat"), "Should have combat title");
    assert.ok(text.includes("```gdscript"), "Should have GDScript code block");
  });

  it("should generate Phaser state machine starter", async () => {
    const result = await handleGenerateStarter(
      { engine: "phaser", feature: "state machine" },
      docStore, searchEngine
    );
    const text = result.content[0].text;
    assert.ok(text.includes("State Machine"), "Should have FSM title");
    assert.ok(text.includes("```typescript"), "Should have TypeScript code block");
  });

  it("should reject unknown engine", async () => {
    const result = await handleGenerateStarter(
      { engine: "unity", feature: "movement" },
      docStore, searchEngine
    );
    const text = result.content[0].text;
    assert.ok(text.includes("Unknown engine"), "Should reject Unity");
  });

  it("should reject unknown feature", async () => {
    const result = await handleGenerateStarter(
      { engine: "godot", feature: "blockchain integration" },
      docStore, searchEngine
    );
    const text = result.content[0].text;
    assert.ok(text.includes("No starter template"), "Should reject unknown feature");
    assert.ok(text.includes("Available features"), "Should list available features");
  });

  it("should include genre context when specified", async () => {
    const result = await handleGenerateStarter(
      { engine: "godot", feature: "movement", genre: "platformer" },
      docStore, searchEngine
    );
    const text = result.content[0].text;
    assert.ok(text.includes("platformer"), "Should mention genre");
  });

  it("should handle all supported features for each engine", async () => {
    const features = ["movement", "combat", "inventory", "state machine", "save/load", "ui"];
    const engines = ["monogame", "godot", "phaser"];
    for (const engine of engines) {
      for (const feature of features) {
        const result = await handleGenerateStarter(
          { engine, feature },
          docStore, searchEngine
        );
        const text = result.content[0].text;
        assert.ok(text.includes("Starter Code"), `${engine}/${feature} should have Starter Code section`);
      }
    }
  });
});
