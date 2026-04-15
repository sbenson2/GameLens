import { describe, it, before } from "node:test";
import assert from "node:assert/strict";
import * as path from "path";
import * as fs from "fs";
import { fileURLToPath } from "url";
import { DocStore } from "../core/docs.js";
import { handleRandomDoc } from "../tools/random-doc.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const docsDir = path.resolve(__dirname, "..", "..", "docs");

const mockModulesMeta = [
  { id: "monogame-arch", label: "MonoGame Architecture", engine: "MonoGame", docCount: 70, sections: ["guides", "architecture"], hasRules: true },
  { id: "godot-arch", label: "Godot Architecture", engine: "Godot", docCount: 9, sections: ["guides", "architecture"], hasRules: true },
];

describe("random_doc tool", () => {
  let store: DocStore;

  before(async () => {
    store = new DocStore(docsDir);
    const modules: string[] = [];
    if (fs.existsSync(path.join(docsDir, "monogame-arch"))) modules.push("monogame-arch");
    if (fs.existsSync(path.join(docsDir, "godot-arch"))) modules.push("godot-arch");
    if (fs.existsSync(path.join(docsDir, "core"))) modules.push("core");
    await store.load(modules);
  });

  it("should return a random doc with no filters", () => {
    const result = handleRandomDoc({}, store, mockModulesMeta);
    const text = result.content[0].text;
    assert.ok(text.includes("# 🎲 Random Doc:"), "Should have random doc header");
    assert.ok(text.includes("**ID:**"), "Should show doc ID");
    assert.ok(text.includes("**Module:**"), "Should show module");
    assert.ok(text.includes("**Category:**"), "Should show category");
    assert.ok(text.includes("get_doc("), "Should include get_doc tip");
  });

  it("should filter by category", () => {
    const result = handleRandomDoc({ category: "guide" }, store, mockModulesMeta);
    const text = result.content[0].text;
    assert.ok(text.includes("# 🎲 Random Doc:"), "Should return a doc");
    assert.ok(text.includes("guide"), "Result should be from guide category");
  });

  it("should filter by module", () => {
    const result = handleRandomDoc({ module: "core" }, store, mockModulesMeta);
    const text = result.content[0].text;
    assert.ok(text.includes("# 🎲 Random Doc:"), "Should return a doc");
    assert.ok(text.includes("core"), "Result should be from core module");
  });

  it("should filter by engine", () => {
    const result = handleRandomDoc({ engine: "Godot" }, store, mockModulesMeta);
    const text = result.content[0].text;
    assert.ok(text.includes("# 🎲 Random Doc:"), "Should return a doc");
    // Should be godot-arch or core
    const isGodotOrCore = text.includes("godot-arch") || text.includes("core");
    assert.ok(isGodotOrCore, "Result should be from godot-arch or core module");
  });

  it("should return error for non-matching filters", () => {
    const result = handleRandomDoc({ module: "nonexistent" }, store, mockModulesMeta);
    const text = result.content[0].text;
    assert.ok(text.includes("No docs found"), "Should show no-docs message");
    assert.ok(text.includes("list_docs"), "Should suggest list_docs");
  });

  it("should return error for unknown engine", () => {
    const result = handleRandomDoc({ engine: "Unreal" }, store, mockModulesMeta);
    const text = result.content[0].text;
    assert.ok(text.includes("No modules found"), "Should show no-modules message");
    assert.ok(text.includes("Available engines"), "Should list available engines");
  });

  it("should include preview content", () => {
    const result = handleRandomDoc({}, store, mockModulesMeta);
    const text = result.content[0].text;
    // Content between the two --- markers should be non-trivial
    const parts = text.split("---");
    assert.ok(parts.length >= 3, "Should have metadata, preview, and footer separated by ---");
    const preview = parts[1];
    assert.ok(preview.trim().length > 50, "Preview should have substantial content");
  });

  it("should show doc count in footer", () => {
    const result = handleRandomDoc({}, store, mockModulesMeta);
    const text = result.content[0].text;
    assert.ok(text.includes("matching docs"), "Should show count of matching docs");
  });
});
