import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { handlePhaseChecklist } from "../tools/phase-checklist.js";

describe("phase_checklist", () => {
  it("should show phase overview when no phase specified", () => {
    const result = handlePhaseChecklist({});
    const text = result.content[0].text;
    assert.ok(text.includes("Project Phases"), "Should show overview");
    assert.ok(text.includes("Planning"), "Should list planning phase");
    assert.ok(text.includes("Release"), "Should list release phase");
  });

  it("should show planning checklist", () => {
    const result = handlePhaseChecklist({ phase: "planning" });
    const text = result.content[0].text;
    assert.ok(text.includes("Phase: Planning"), "Should show phase name");
    assert.ok(text.includes("Checklist"), "Should have checklist");
    assert.ok(text.includes("[ ]"), "Should have unchecked items");
  });

  it("should filter by engine", () => {
    const result = handlePhaseChecklist({ phase: "prototype", engine: "godot" });
    const text = result.content[0].text;
    assert.ok(text.includes("Autoloads"), "Should include Godot-specific items");
    assert.ok(!text.includes("Content Pipeline configured"), "Should not include MonoGame items");
  });

  it("should filter by genre", () => {
    const result = handlePhaseChecklist({ phase: "prototype", genre: "platformer" });
    const text = result.content[0].text;
    assert.ok(text.includes("coyote time") || text.includes("Character controller"), "Should include platformer items");
  });

  it("should track completed items", () => {
    const result = handlePhaseChecklist({
      phase: "planning",
      completedItems: ["Game concept written in 1-2 sentences", "Core mechanic identified (the ONE thing that must be fun)"],
    });
    const text = result.content[0].text;
    assert.ok(text.includes("[x]"), "Should mark items as completed");
    assert.ok(text.includes("Progress:"), "Should show progress");
  });

  it("should reject unknown phase", () => {
    const result = handlePhaseChecklist({ phase: "nonexistent" });
    const text = result.content[0].text;
    assert.ok(text.includes("Unknown phase"), "Should reject unknown phase");
    assert.ok(text.includes("Valid phases"), "Should list valid phases");
  });

  it("should accept phase aliases", () => {
    const result = handlePhaseChecklist({ phase: "proto" });
    const text = result.content[0].text;
    assert.ok(text.includes("Phase: Prototype"), "Should resolve 'proto' alias");
  });

  it("should show recommendation based on progress", () => {
    const result = handlePhaseChecklist({ phase: "planning" });
    const text = result.content[0].text;
    assert.ok(text.includes("Recommendation"), "Should have recommendation section");
  });

  it("should show all five phases", () => {
    const phases = ["planning", "prototype", "production", "polish", "release"];
    for (const phase of phases) {
      const result = handlePhaseChecklist({ phase });
      const text = result.content[0].text;
      assert.ok(text.includes("Checklist"), `${phase} should have a checklist`);
      assert.ok(text.includes("Tips"), `${phase} should have tips`);
    }
  });
});
