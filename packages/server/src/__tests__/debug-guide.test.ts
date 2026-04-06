import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { handleDebugGuide } from "../tools/debug-guide.js";
import { DocStore } from "../core/docs.js";
import { SearchEngine } from "../core/search.js";
import * as path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const docsRoot = path.resolve(__dirname, "../../docs");

const docStore = new DocStore(docsRoot);
docStore.load(["core"]);
const searchEngine = new SearchEngine();
searchEngine.index(docStore.getAllDocs());

describe("debug_guide", () => {
  it("should return results for known MonoGame error pattern", async () => {
    const result = await handleDebugGuide(
      { error: "NullReferenceException in Draw", engine: "monogame" },
      docStore, searchEngine
    );
    const text = result.content[0].text;
    assert.ok(text.includes("NullReferenceException"), "Should match NullRef pattern");
    assert.ok(text.includes("Likely Causes"), "Should have causes section");
    assert.ok(text.includes("Diagnostic Steps"), "Should have diagnostic steps");
  });

  it("should return results for known Godot error pattern", async () => {
    const result = await handleDebugGuide(
      { error: "Invalid instance, node was freed", engine: "godot" },
      docStore, searchEngine
    );
    const text = result.content[0].text;
    assert.ok(text.includes("Invalid Instance"), "Should match freed object pattern");
    assert.ok(text.includes("Godot"), "Should be Godot-specific");
  });

  it("should return results for known Phaser error pattern", async () => {
    const result = await handleDebugGuide(
      { error: "Cannot read properties of undefined", engine: "phaser" },
      docStore, searchEngine
    );
    const text = result.content[0].text;
    assert.ok(text.includes("Null"), "Should match null/undefined pattern");
    assert.ok(text.includes("Phaser"), "Should be Phaser-specific");
  });

  it("should search knowledge base when no pattern matches", async () => {
    const result = await handleDebugGuide(
      { error: "extremely obscure unique error xyz123" },
      docStore, searchEngine
    );
    const text = result.content[0].text;
    assert.ok(text.includes("General Debugging Approach"), "Should show general tips");
  });

  it("should search across all engines when no engine specified", async () => {
    const result = await handleDebugGuide(
      { error: "collision not working" },
      docStore, searchEngine
    );
    const text = result.content[0].text;
    assert.ok(text.includes("Collision") || text.includes("Physics"), "Should match collision pattern");
  });

  it("should reject empty error string", async () => {
    const result = await handleDebugGuide(
      { error: "   " },
      docStore, searchEngine
    );
    const text = result.content[0].text;
    assert.ok(text.includes("Please describe"), "Should ask for error description");
  });
});
