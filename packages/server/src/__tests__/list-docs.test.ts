import { describe, it, before } from "node:test";
import assert from "node:assert/strict";
import * as path from "path";
import * as fs from "fs";
import { fileURLToPath } from "url";
import { DocStore } from "../core/docs.js";
import { handleListDocs } from "../tools/list-docs.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const docsDir = path.resolve(__dirname, "..", "..", "docs");

describe("list_docs summary mode", () => {
  let store: DocStore;

  before(async () => {
    store = new DocStore(docsDir);
    const modules: string[] = [];
    if (fs.existsSync(path.join(docsDir, "monogame-arch"))) modules.push("monogame-arch");
    if (fs.existsSync(path.join(docsDir, "godot-arch"))) modules.push("godot-arch");
    if (fs.existsSync(path.join(docsDir, "core"))) modules.push("core");
    await store.load(modules);
  });

  it("should return full list by default", () => {
    const result = handleListDocs({}, store);
    const text = result.content[0].text;
    assert.ok(text.includes("# Available Docs"), "Should have full header");
    assert.ok(text.includes("**"), "Should contain bold doc IDs");
  });

  it("should return compact summary when summary=true", () => {
    const result = handleListDocs({ summary: true }, store);
    const text = result.content[0].text;
    assert.ok(text.includes("# Doc Summary"), "Should have summary header");
    assert.ok(text.includes("docs)"), "Should show doc counts per module");
    assert.ok(text.includes("docs —"), "Should show category counts with IDs");
    assert.ok(!text.includes("# Available Docs"), "Should NOT have full list header");
  });

  it("summary mode should be shorter than full mode", () => {
    const full = handleListDocs({}, store);
    const summary = handleListDocs({ summary: true }, store);
    const fullLen = full.content[0].text.length;
    const summaryLen = summary.content[0].text.length;
    assert.ok(
      summaryLen < fullLen,
      `Summary (${summaryLen} chars) should be shorter than full (${fullLen} chars)`
    );
  });

  it("summary mode should work with category filter", () => {
    const result = handleListDocs({ summary: true, category: "guide" }, store);
    const text = result.content[0].text;
    assert.ok(text.includes("# Doc Summary"), "Should have summary header");
    assert.ok(text.includes("guide"), "Should mention the guide category");
  });

  it("summary mode should work with module filter", () => {
    const result = handleListDocs({ summary: true, module: "core" }, store);
    const text = result.content[0].text;
    assert.ok(text.includes("# Doc Summary"), "Should have summary header");
    assert.ok(text.includes("core"), "Should mention the core module");
  });

  it("should return no-docs message for empty filter", () => {
    const result = handleListDocs({ module: "nonexistent-module" }, store);
    const text = result.content[0].text;
    assert.ok(text.includes("No docs found"), "Should show no-docs message");
  });
});
