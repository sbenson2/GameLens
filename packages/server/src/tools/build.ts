/**
 * build — Everything about writing code and building your game.
 *
 * Consolidates: scaffold, code generation, asset pipeline, debugging, architecture review.
 * Routes via `action` param to existing handler functions.
 */

import { z } from "zod";
import { GameCodexToolDef, ToolResult, ToolDependencies } from "../tool-definition.js";
import { miss, unknownAction } from "../core/error-helpers.js";
import { getToolHelp } from "../core/help-generator.js";
import { handleScaffoldProject } from "./scaffold-project.js";
import { handleGenerateStarter } from "./generate-starter.js";
import { handleAssetGuide } from "./asset-guide.js";
import { handleDebugGuide } from "./debug-guide.js";
import { handleReviewArchitecture } from "./review-architecture.js";

export const buildToolDef: GameCodexToolDef = {
  name: "build",
  description: "Use when: starting a new project, writing game code, setting up art/audio pipelines, fixing errors, reviewing architecture. Build your game. Actions: scaffold, code, assets, debug, review.",
  inputSchema: {
    action: z.enum(["help", "scaffold", "code", "assets", "debug", "review"]).describe(
      "scaffold: create project structure (use when user says 'new project' or 'start a game') | code: generate feature starter code (use when user wants to implement a feature) | assets: art/audio pipeline guide | debug: diagnose errors (use when user shares an error message) | review: architecture check (use when user shares project structure)"
    ),
    engine: z.string().optional().describe("Engine: 'monogame', 'godot', 'unity', 'bevy', or any supported engine"),
    // scaffold
    name: z.string().optional().describe("Project name (for scaffold)"),
    // code
    feature: z.string().optional().describe("Feature to generate: 'player movement', 'inventory', 'combat', 'state machine', 'save/load', 'ui'"),
    genre: z.string().optional().describe("Game genre for context"),
    skillLevel: z.enum(["beginner", "intermediate", "advanced"]).optional().describe("Code complexity level"),
    // assets
    assetType: z.string().optional().describe("Asset type: 'sprite', 'spritesheet', 'audio', 'tilemap', 'font', 'particle'"),
    sourceTool: z.string().optional().describe("Source tool: 'aseprite', 'photoshop', 'gimp', 'audacity', 'tiled', 'blender'"),
    // debug
    error: z.string().optional().describe("Error message or symptom description"),
    context: z.string().optional().describe("What you were doing when the error occurred"),
    // review
    structure: z.string().optional().describe("Project file/folder structure (paste `tree` output)"),
    concerns: z.string().optional().describe("Specific concerns to address"),
  },
  handler: async (args: Record<string, unknown>, deps: ToolDependencies): Promise<ToolResult> => {
    const action = args.action as string;

    switch (action) {
      case "help":
        return getToolHelp("build");

      case "scaffold": {
        if (!args.engine) return miss("engine", "build", "scaffold");
        if (!args.name) return miss("name", "build", "scaffold");
        return handleScaffoldProject({
          engine: args.engine as string,
          name: args.name as string,
          genre: args.genre as string | undefined,
        });
      }

      case "code": {
        if (!args.engine) return miss("engine", "build", "code");
        if (!args.feature) return miss("feature", "build", "code");
        return handleGenerateStarter(
          {
            engine: args.engine as string,
            feature: args.feature as string,
            genre: args.genre as string | undefined,
            skillLevel: args.skillLevel as any,
          },
          deps.docStore, deps.searchEngine, deps.hybridSearch,
        );
      }

      case "assets": {
        if (!args.assetType) return miss("assetType", "build", "assets");
        if (!args.engine) return miss("engine", "build", "assets");
        return handleAssetGuide({
          assetType: args.assetType as string,
          engine: args.engine as string,
          sourceTool: args.sourceTool as string | undefined,
        });
      }

      case "debug": {
        if (!args.error) return miss("error", "build", "debug");
        return handleDebugGuide(
          {
            error: args.error as string,
            engine: args.engine as string | undefined,
            context: args.context as string | undefined,
          },
          deps.docStore, deps.searchEngine, deps.hybridSearch,
        );
      }

      case "review": {
        if (!args.structure) return miss("structure", "build", "review");
        return handleReviewArchitecture(
          {
            structure: args.structure as string,
            engine: args.engine as string | undefined,
            concerns: args.concerns as string | undefined,
          },
          deps.docStore, deps.searchEngine,
        );
      }

      default:
        return unknownAction(action, ["help", "scaffold", "code", "assets", "debug", "review"], "build");
    }
  },
  isReadOnly: true,
  isConcurrencySafe: true,
  category: "generation",
  activityDescription: "Building",
};

