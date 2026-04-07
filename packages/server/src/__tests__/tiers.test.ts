import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { isToolAllowed, isModuleAllowed, getTierFeatures, Tier, ToolAccess } from "../tiers.js";

describe("Tier System", () => {
  // v0.2.0 — 5 tools
  it("should return 'limited' for docs on free tier", () => {
    const result = isToolAllowed("free" as Tier, "docs");
    assert.equal(result, "limited", "docs should be limited for free tier");
  });

  it("should return 'full' for all tools on pro tier", () => {
    const tools = ["project", "design", "docs", "build", "meta"];
    for (const tool of tools) {
      const result = isToolAllowed("pro" as Tier, tool);
      assert.equal(result, "full", `${tool} should be full for pro tier`);
    }
  });

  it("should return 'full' for project on free tier", () => {
    const result = isToolAllowed("free" as Tier, "project");
    assert.equal(result, "full", "project should be full for free tier");
  });

  it("should return 'limited' for build on free tier", () => {
    const result = isToolAllowed("free" as Tier, "build");
    assert.equal(result, "limited", "build should be limited for free tier");
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
    assert.equal(Object.keys(pro.tools).length, 5, "Pro should have 5 tools");
    assert.equal(Object.keys(free.tools).length, 5, "Free should have 5 tools");
  });
});
