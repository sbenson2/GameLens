import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { isToolAllowed, isModuleAllowed, getTierFeatures, Tier, ToolAccess } from "../tiers.js";

describe("Tier System", () => {
  it("should return 'limited' for search_docs on free tier", () => {
    const result = isToolAllowed("free" as Tier, "search_docs");
    assert.equal(result, "limited", "search_docs should be limited for free tier");
  });

  it("should return 'full' for all tools on pro tier", () => {
    const tools = ["search_docs", "get_doc", "list_docs", "genre_lookup", "session", "compare_engines"];
    for (const tool of tools) {
      const result = isToolAllowed("pro" as Tier, tool);
      assert.equal(result, "full", `${tool} should be full for pro tier`);
    }
  });

  it("should return 'denied' for session on free tier", () => {
    const result = isToolAllowed("free" as Tier, "session");
    assert.equal(result, "denied", "session should be denied for free tier");
  });

  it("should return 'denied' for unknown tools on free tier", () => {
    const result = isToolAllowed("free" as Tier, "unknown_tool");
    assert.equal(result, "denied", "unknown tools should be denied for free tier");
  });

  it("should return 'full' for unknown tools on pro tier", () => {
    const result = isToolAllowed("pro" as Tier, "unknown_tool");
    assert.equal(result, "full", "unknown tools should be full for pro tier");
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
