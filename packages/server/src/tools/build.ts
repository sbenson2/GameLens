/**
 * build — Everything about writing code and building your game.
 *
 * Consolidates: scaffold, code generation, asset pipeline, debugging, architecture review.
 * Routes via `action` param to existing handler functions.
 */

import { z } from "zod";
import { GameCodexToolDef, ToolResult, ToolDependencies } from "../tool-definition.js";
import { handleScaffoldProject } from "./scaffold-project.js";
import { handleGenerateStarter } from "./generate-starter.js";
import { handleAssetGuide } from "./asset-guide.js";
import { handleDebugGuide } from "./debug-guide.js";
import { handleReviewArchitecture } from "./review-architecture.js";

export const buildToolDef: GameCodexToolDef = {
  name: "build",
  description: "Build your game — scaffold projects, generate feature code, get asset pipeline help, diagnose errors, or review architecture. Actions: scaffold, code, assets, debug, review.",
  inputSchema: {
    action: z.enum(["scaffold", "code", "assets", "debug", "review"]).describe(
      "scaffold: create project structure | code: generate feature code | assets: art/audio pipeline | debug: diagnose errors | review: architecture check"
    ),
    engine: z.string().optional().describe("Engine: 'monogame', 'godot', or 'phaser'"),
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
      case "scaffold": {
        if (!args.engine) return miss("engine", "scaffold");
        if (!args.name) return miss("name", "scaffold");
        return handleScaffoldProject({
          engine: args.engine as string,
          name: args.name as string,
          genre: args.genre as string | undefined,
        });
      }

      case "code": {
        if (!args.engine) return miss("engine", "code");
        if (!args.feature) return miss("feature", "code");
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
        if (!args.assetType) return miss("assetType", "assets");
        if (!args.engine) return miss("engine", "assets");
        return handleAssetGuide({
          assetType: args.assetType as string,
          engine: args.engine as string,
          sourceTool: args.sourceTool as string | undefined,
        });
      }

      case "debug": {
        if (!args.error) return miss("error", "debug");
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
        if (!args.structure) return miss("structure", "review");
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
        return { content: [{ type: "text", text: `Unknown action "${action}". Use: scaffold, code, assets, debug, review` }] };
    }
  },
  isReadOnly: true,
  isConcurrencySafe: true,
  category: "generation",
  activityDescription: "Building",
};

function miss(param: string, action: string): ToolResult {
  return { content: [{ type: "text", text: `Please provide \`${param}\` for the "${action}" action.` }] };
}
