import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { isToolAllowed, isModuleAllowed, getTierFeatures, Tier } from "../tiers.js";

describe("Tier System", () => {
  it("should allow search_docs for free tier", () => {
    const result = isToolAllowed("free" as Tier, "search_docs");
    assert.ok(result !== false, "search_docs should be allowed for free tier");
  });

  it("should allow all tools for pro tier", () => {
    const tools = ["search_docs", "get_doc", "list_docs", "genre_lookup"];
    for (const tool of tools) {
      const result = isToolAllowed("pro" as Tier, tool);
      assert.ok(result !== false, `${tool} should be allowed for pro tier`);
    }
  });

  it("should allow core module for free tier", () => {
    const result = isModuleAllowed("free" as Tier, "core");
    assert.ok(result, "core module should be accessible at free tier");
  });

  it("should restrict monogame-arch for free tier", () => {
    const result = isModuleAllowed("free" as Tier, "monogame-arch");
    assert.equal(result, false, "monogame-arch should NOT be accessible at free tier");
  });

  it("should allow monogame-arch for pro tier", () => {
    const result = isModuleAllowed("pro" as Tier, "monogame-arch");
    assert.ok(result, "monogame-arch should be accessible at pro tier");
  });

  it("should return features for each tier", () => {
    const free = getTierFeatures("free" as Tier);
    const pro = getTierFeatures("pro" as Tier);
    assert.ok(free, "Free tier should have features");
    assert.ok(pro, "Pro tier should have features");
  });
});
