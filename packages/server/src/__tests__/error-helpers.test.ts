import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { miss, fuzzyMatch, unknownAction } from "../core/error-helpers.js";

describe("error-helpers", () => {
  describe("miss()", () => {
    it("should return enriched error for known param", () => {
      const result = miss("engine", "build", "scaffold");
      const text = result.content[0].text;
      assert.ok(text.includes('Missing `engine`'));
      assert.ok(text.includes("scaffold"));
      assert.ok(text.includes("monogame"));
      assert.ok(text.includes("godot"));
      assert.ok(text.includes("phaser"));
      assert.ok(text.includes("Example:"));
    });

    it("should return basic error for unknown param", () => {
      const result = miss("unknownParam", "build", "scaffold");
      const text = result.content[0].text;
      assert.ok(text.includes('Missing `unknownParam`'));
      assert.ok(text.includes("scaffold"));
    });

    it("should work without action context", () => {
      const result = miss("query", "docs");
      const text = result.content[0].text;
      assert.ok(text.includes('Missing `query`'));
      assert.ok(!text.includes('for "'));
    });

    it("should show valid values for feature param", () => {
      const result = miss("feature", "build", "code");
      const text = result.content[0].text;
      assert.ok(text.includes("player movement"));
      assert.ok(text.includes("combat"));
    });

    it("should show valid values for assetType", () => {
      const result = miss("assetType", "build", "assets");
      const text = result.content[0].text;
      assert.ok(text.includes("sprite"));
      assert.ok(text.includes("tilemap"));
    });
  });

  describe("fuzzyMatch()", () => {
    const actions = ["scaffold", "code", "assets", "debug", "review"];

    it("should match close typos", () => {
      assert.equal(fuzzyMatch("scaffol", actions), "scaffold");
      assert.equal(fuzzyMatch("scaffoldd", actions), "scaffold");
      assert.equal(fuzzyMatch("deubg", actions), "debug");
    });

    it("should return null for distant strings", () => {
      assert.equal(fuzzyMatch("xyz", actions), null);
      assert.equal(fuzzyMatch("completely_wrong", actions), null);
    });

    it("should return null for exact matches (distance 0)", () => {
      assert.equal(fuzzyMatch("scaffold", actions), null);
    });

    it("should handle empty candidates", () => {
      assert.equal(fuzzyMatch("test", []), null);
    });
  });

  describe("unknownAction()", () => {
    const actions = ["scaffold", "code", "assets", "debug", "review"];

    it("should suggest close match", () => {
      const result = unknownAction("scaffol", actions, "build");
      const text = result.content[0].text;
      assert.ok(text.includes('"scaffol"'));
      assert.ok(text.includes('Did you mean "scaffold"'));
      assert.ok(text.includes("Available:"));
    });

    it("should list available actions without suggestion for distant input", () => {
      const result = unknownAction("xyz", actions, "build");
      const text = result.content[0].text;
      assert.ok(text.includes('"xyz"'));
      assert.ok(!text.includes("Did you mean"));
      assert.ok(text.includes("Available:"));
    });
  });
});
