import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { getBreadcrumb, getNextSteps, formatNextSteps, enhanceResponse } from "../core/response-enhancer.js";

describe("response-enhancer", () => {
  describe("getBreadcrumb()", () => {
    it("should format breadcrumb with full data", () => {
      const result = getBreadcrumb({
        name: "FireStarter",
        engine: "monogame",
        genre: "roguelike",
        phase: "prototype",
        goalCount: 3,
        featureCount: 5,
      });
      assert.ok(result.includes("FireStarter"));
      assert.ok(result.includes("monogame"));
      assert.ok(result.includes("prototype"));
      assert.ok(result.includes("3 goals"));
    });

    it("should handle singular goal count", () => {
      const result = getBreadcrumb({
        name: "Test",
        engine: "godot",
        genre: "platformer",
        phase: "planning",
        goalCount: 1,
        featureCount: 0,
      });
      assert.ok(result.includes("1 goal"));
      assert.ok(!result.includes("1 goals"));
    });

    it("should return empty string for null", () => {
      assert.equal(getBreadcrumb(null), "");
    });
  });

  describe("getNextSteps()", () => {
    it("should return steps for project hello", () => {
      const steps = getNextSteps("project", "hello");
      assert.ok(steps.length > 0);
      assert.ok(steps.some((s) => s.tool === "project" && s.action === "set"));
    });

    it("should return steps for build scaffold", () => {
      const steps = getNextSteps("build", "scaffold");
      assert.ok(steps.length > 0);
    });

    it("should return steps for design gdd", () => {
      const steps = getNextSteps("design", "gdd");
      assert.ok(steps.length > 0);
      assert.ok(steps.some((s) => s.action === "phase"));
    });

    it("should return empty for unknown tool/action", () => {
      const steps = getNextSteps("nonexistent", "foo");
      assert.equal(steps.length, 0);
    });

    it("should return empty for suggest (avoids recursion)", () => {
      const steps = getNextSteps("project", "suggest");
      assert.equal(steps.length, 0);
    });
  });

  describe("formatNextSteps()", () => {
    it("should format steps as markdown", () => {
      const result = formatNextSteps([
        { tool: "project", action: "set", description: "Configure project" },
        { tool: "docs", action: "browse", description: "Browse docs" },
      ]);
      assert.ok(result.includes("Next steps:"));
      assert.ok(result.includes("`project set`"));
      assert.ok(result.includes("`docs browse`"));
    });

    it("should return empty string for no steps", () => {
      assert.equal(formatNextSteps([]), "");
    });
  });

  describe("enhanceResponse()", () => {
    const mockDeps = {
      projectStore: {
        get: (name: string) => ({
          name: "TestGame",
          engine: "godot",
          genre: "platformer",
          phase: "prototype",
          goals: [{ text: "test", completed: false }],
          featureCount: 3,
        }),
      },
    } as any;

    it("should add breadcrumb and next steps", () => {
      const result = enhanceResponse(
        { content: [{ type: "text", text: "Hello world" }] },
        "project",
        "hello",
        mockDeps,
      );
      const text = result.content[0].text;
      assert.ok(text.includes("TestGame"));
      assert.ok(text.includes("Hello world"));
      assert.ok(text.includes("Next steps:"));
    });

    it("should skip enhancement for help action", () => {
      const original = { content: [{ type: "text" as const, text: "Help output" }] };
      const result = enhanceResponse(original, "project", "help", mockDeps);
      assert.equal(result.content[0].text, "Help output");
    });

    it("should handle missing project gracefully", () => {
      const brokenDeps = {
        projectStore: {
          get: () => { throw new Error("not found"); },
        },
      } as any;
      const result = enhanceResponse(
        { content: [{ type: "text", text: "Hello" }] },
        "meta",
        "about",
        brokenDeps,
      );
      assert.ok(result.content[0].text.includes("Hello"));
    });
  });
});
