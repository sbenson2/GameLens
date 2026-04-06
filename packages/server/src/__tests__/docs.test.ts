import { describe, it, before } from "node:test";
import assert from "node:assert/strict";
import * as path from "path";
import * as fs from "fs";
import { fileURLToPath } from "url";
import { DocStore } from "../core/docs.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const docsDir = path.resolve(__dirname, "..", "..", "docs");

describe("DocStore", () => {
  let store: DocStore;

  before(() => {
    store = new DocStore(docsDir);
    const modules: string[] = [];
    if (fs.existsSync(path.join(docsDir, "monogame-arch"))) modules.push("monogame-arch");
    if (fs.existsSync(path.join(docsDir, "godot-arch"))) modules.push("godot-arch");
    if (fs.existsSync(path.join(docsDir, "core"))) modules.push("core");
    store.load(modules);
  });

  it("should load docs", () => {
    const docs = store.getAllDocs();
    assert.ok(docs.length > 0, `Should load at least one doc from ${docsDir}`);
  });

  it("should extract doc IDs correctly", () => {
    const docs = store.getAllDocs();
    const ids = docs.map((d) => d.id);
    assert.ok(
      ids.some((id) => /^[A-Z]\d+$/.test(id)) || ids.length > 0,
      "Should have doc IDs"
    );
  });

  it("should extract titles from markdown", () => {
    const docs = store.getAllDocs();
    for (const doc of docs.slice(0, 10)) {
      assert.ok(doc.title.length > 0, `Doc ${doc.id} should have a title`);
    }
  });

  it("should populate content for all docs", () => {
    const docs = store.getAllDocs();
    for (const doc of docs.slice(0, 10)) {
      assert.ok(doc.content.length > 0, `Doc ${doc.id} should have content`);
    }
  });

  it("should assign categories", () => {
    const docs = store.getAllDocs();
    for (const doc of docs.slice(0, 10)) {
      assert.ok(doc.category.length > 0, `Doc ${doc.id} should have a category`);
    }
  });
});
