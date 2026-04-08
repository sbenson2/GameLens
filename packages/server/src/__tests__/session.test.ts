import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  createDefaultState,
  resolvePathFromContent,
  advanceStep,
  getWorkflowState,
  getRelevantDocs,
  getStepToolRecommendations,
  startPath,
  PATH_STEPS,
  STEP_TOOL_MAP,
  SessionState,
} from "../core/session.js";

describe("session orchestrator", () => {
  // ---- resolvePathFromContent ----

  describe("resolvePathFromContent()", () => {
    it("should resolve planning keywords to plan", () => {
      assert.equal(resolvePathFromContent("I want to plan my next sprint"), "plan");
      assert.equal(resolvePathFromContent("roadmap for the game"), "plan");
      assert.equal(resolvePathFromContent("let me plan the priorities"), "plan");
    });

    it("should resolve decision keywords to decide", () => {
      assert.equal(resolvePathFromContent("which should I use, ECS or components?"), "decide");
      assert.equal(resolvePathFromContent("I need to decide on the architecture"), "decide");
      assert.equal(resolvePathFromContent("which approach is better?"), "decide");
    });

    it("should resolve feature keywords to feature", () => {
      assert.equal(resolvePathFromContent("I want to add an inventory system"), "feature");
      assert.equal(resolvePathFromContent("implement player movement"), "feature");
      assert.equal(resolvePathFromContent("continue working on this feature"), "feature");
      assert.equal(resolvePathFromContent("create a save system"), "feature");
    });

    it("should resolve debug keywords to debug", () => {
      assert.equal(resolvePathFromContent("I'm getting a null reference error"), "debug");
      assert.equal(resolvePathFromContent("something is broken"), "debug");
      assert.equal(resolvePathFromContent("fix the collision crash"), "debug");
      assert.equal(resolvePathFromContent("there's a bug in the movement"), "debug");
    });

    it("should resolve scope keywords to scope", () => {
      assert.equal(resolvePathFromContent("what should I cut?"), "scope");
      assert.equal(resolvePathFromContent("is this timeline feasible?"), "scope");
      assert.equal(resolvePathFromContent("I need to triage my scope"), "scope");
    });

    it("should return none for unrecognized content", () => {
      assert.equal(resolvePathFromContent("hello"), "none");
      assert.equal(resolvePathFromContent(""), "none");
      assert.equal(resolvePathFromContent("just chatting"), "none");
    });

    it("should pick the highest-scoring path on ambiguous input", () => {
      // "fix and build" has 1 debug keyword (fix) and 1 feature keyword (build)
      // Tie-breaking: first match wins (debug comes before feature in iteration)
      const result = resolvePathFromContent("fix this bug and build");
      assert.ok(result === "debug" || result === "feature");
    });
  });

  // ---- advanceStep ----

  describe("advanceStep()", () => {
    it("should advance step from 1 to 2", () => {
      const state = createDefaultState();
      const { state: started } = startPath(state, "plan");
      assert.equal(started.step, 1);
      advanceStep(started);
      assert.equal(started.step, 2);
    });

    it("should reset to briefing when path completes", () => {
      const state = createDefaultState();
      const { state: started } = startPath(state, "decide");
      // Advance through all 5 steps
      started.step = started.totalSteps; // at last step
      advanceStep(started);
      assert.equal(started.phase, "briefing");
      assert.equal(started.path, "none");
      assert.equal(started.step, 0);
    });

    it("should no-op when path is none", () => {
      const state = createDefaultState();
      advanceStep(state);
      assert.equal(state.path, "none");
      assert.equal(state.step, 0);
    });

    it("should no-op when phase is briefing", () => {
      const state = createDefaultState();
      state.path = "plan"; // inconsistent but tests the guard
      advanceStep(state);
      assert.equal(state.step, 0); // unchanged
    });
  });

  // ---- getWorkflowState ----

  describe("getWorkflowState()", () => {
    it("should return correct structure for active path", () => {
      const state = createDefaultState();
      const { state: started } = startPath(state, "feature");
      const response = getWorkflowState(started);

      assert.equal(response.session.phase, "working");
      assert.equal(response.session.path, "feature");
      assert.equal(response.session.step, 1);
      assert.equal(response.session.totalSteps, 5);
      assert.equal(response.session.stepName, "Read Docs");
      assert.equal(response.session.pathName, "Feature");

      assert.equal(response.workflow.steps.length, 5);
      assert.equal(response.workflow.steps[0].name, "Read Docs");
      assert.equal(response.workflow.steps[0].completed, false);

      assert.ok(response.toolCalls.length > 0);
      assert.ok(response.toolCalls.some(t => t.tool === "docs" && t.action === "search"));
    });

    it("should return empty toolCalls when no path active", () => {
      const state = createDefaultState();
      const response = getWorkflowState(state);

      assert.equal(response.session.path, "none");
      assert.equal(response.toolCalls.length, 0);
      assert.equal(response.workflow.steps.length, 0);
      assert.equal(response.workflow.currentStep, null);
    });

    it("should include relevant docs when focus is set", () => {
      const state = createDefaultState();
      const { state: started } = startPath(state, "feature");
      started.currentFocus = "collision detection";
      const response = getWorkflowState(started);

      assert.ok(response.relevantDocs.length > 0);
      assert.ok(response.relevantDocs.includes("G3"));
    });

    it("should mark earlier steps as completed", () => {
      const state = createDefaultState();
      const { state: started } = startPath(state, "plan");
      started.step = 3; // on step 3
      const response = getWorkflowState(started);

      assert.equal(response.workflow.steps[0].completed, true);  // step 1
      assert.equal(response.workflow.steps[1].completed, true);  // step 2
      assert.equal(response.workflow.steps[2].completed, false); // step 3 (current)
      assert.equal(response.workflow.steps[3].completed, false); // step 4
    });
  });

  // ---- getStepToolRecommendations ----

  describe("getStepToolRecommendations()", () => {
    it("should return tools for valid path and step", () => {
      const tools = getStepToolRecommendations("debug", 1);
      assert.ok(tools.length > 0);
      assert.ok(tools.some(t => t.tool === "build" && t.action === "debug"));
    });

    it("should return empty for invalid path", () => {
      assert.equal(getStepToolRecommendations("nonexistent", 1).length, 0);
    });

    it("should return empty for out-of-range step", () => {
      assert.equal(getStepToolRecommendations("debug", 0).length, 0);
      assert.equal(getStepToolRecommendations("debug", 99).length, 0);
    });
  });

  // ---- getRelevantDocs ----

  describe("getRelevantDocs()", () => {
    it("should find docs for collision", () => {
      const docs = getRelevantDocs("collision detection");
      assert.ok(docs.includes("G3"));
      assert.ok(docs.includes("physics-theory"));
    });

    it("should find docs for UI", () => {
      const docs = getRelevantDocs("ui architecture");
      assert.ok(docs.includes("ui-theory"));
    });

    it("should return empty for unknown topic", () => {
      const docs = getRelevantDocs("xyzzy nonsense topic");
      assert.equal(docs.length, 0);
    });
  });

  // ---- STEP_TOOL_MAP consistency ----

  describe("STEP_TOOL_MAP consistency", () => {
    it("should have entries for every path in PATH_STEPS", () => {
      for (const path of Object.keys(PATH_STEPS)) {
        assert.ok(STEP_TOOL_MAP[path], `Missing STEP_TOOL_MAP entry for path: ${path}`);
      }
    });

    it("should have matching step counts with PATH_STEPS", () => {
      for (const [path, def] of Object.entries(PATH_STEPS)) {
        const stepMap = STEP_TOOL_MAP[path];
        assert.equal(
          stepMap.length,
          def.steps.length,
          `Step count mismatch for ${path}: STEP_TOOL_MAP has ${stepMap.length}, PATH_STEPS has ${def.steps.length}`,
        );
      }
    });

    it("should have at least one tool recommendation per step", () => {
      for (const [path, steps] of Object.entries(STEP_TOOL_MAP)) {
        for (let i = 0; i < steps.length; i++) {
          assert.ok(
            steps[i].tools.length > 0,
            `${path} step ${i + 1} (${steps[i].name}) has no tool recommendations`,
          );
        }
      }
    });

    it("should only reference valid tool names", () => {
      const validTools = new Set(["project", "design", "docs", "build", "meta"]);
      for (const [path, steps] of Object.entries(STEP_TOOL_MAP)) {
        for (const step of steps) {
          for (const tool of step.tools) {
            assert.ok(
              validTools.has(tool.tool),
              `${path}/${step.name} references invalid tool: ${tool.tool}`,
            );
          }
        }
      }
    });
  });

  // ---- Integration: full session flow ----

  describe("full session flow", () => {
    it("should complete a debug path end-to-end", () => {
      // 1. Start fresh
      const state = createDefaultState();
      assert.equal(state.phase, "briefing");
      assert.equal(state.path, "none");

      // 2. Resolve intent
      const path = resolvePathFromContent("I'm getting a null reference error in my player controller");
      assert.equal(path, "debug");

      // 3. Start the path
      const { state: ws } = startPath(state, "debug");
      assert.equal(ws.phase, "working");
      assert.equal(ws.path, "debug");
      assert.equal(ws.step, 1);
      assert.equal(ws.totalSteps, 5);

      // 4. Get workflow state at step 1
      ws.currentFocus = "null reference player controller";
      let response = getWorkflowState(ws);
      assert.equal(response.session.stepName, "Reproduce");
      assert.ok(response.toolCalls.some(t => t.tool === "build" && t.action === "debug"));

      // 5. Advance through all steps
      for (let i = 2; i <= 5; i++) {
        advanceStep(ws);
        assert.equal(ws.step, i);
        response = getWorkflowState(ws);
        assert.ok(response.toolCalls.length > 0, `Step ${i} should have tool recommendations`);
      }

      // 6. Advance past last step — resets to briefing
      advanceStep(ws);
      assert.equal(ws.phase, "briefing");
      assert.equal(ws.path, "none");
      assert.equal(ws.step, 0);
    });
  });
});
