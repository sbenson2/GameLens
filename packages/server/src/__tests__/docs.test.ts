import { describe, it, before } from "node:test";
import assert from "node:assert/strict";
import * as path from "path";
import { fileURLToPath } from "url";
import { DocStore } from "../core/docs.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const docsDir = path.resolve(__dirname, "..", "..", "docs");

describe("DocStore", () => {
  let store: DocStore;

  before(async () => {
    store = new DocStore(docsDir);
    await store.load();
  });

  it("should load docs", () => {
    const docs = store.getAllDocs();
    assert.ok(docs.length > 0, `Should load at least one doc from ${docsDir}`);
  });

  it("should extract doc IDs correctly", () => {
    const docs = store.getAllDocs();
    const ids = docs.map((d) => d.id);
    assert.ok(
      ids.some((id) => /^[A-Z]\d+$/.test(id)),
      "Should derive prefix-style doc IDs (e.g. E6, C1)"
    );
    assert.equal(new Set(ids).size, ids.length, "doc IDs should be unique");
  });

  it("should extract titles from markdown", () => {
    for (const doc of store.getAllDocs()) {
      assert.ok(doc.title.length > 0, `Doc ${doc.id} should have a title`);
    }
  });

  it("should populate content for all docs", () => {
    for (const doc of store.getAllDocs()) {
      assert.ok(doc.content.length > 0, `Doc ${doc.id} should have content`);
    }
  });

  it("should fetch docs by id", () => {
    const first = store.getAllDocs()[0];
    assert.equal(store.getDoc(first.id)?.filePath, first.filePath);
  });
});
