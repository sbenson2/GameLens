/**
 * MCP Prompts — guided workflow entry points.
 *
 * These appear as slash commands in MCP clients (e.g., Claude Desktop).
 * Each prompt returns a message sequence that guides the AI to use
 * GameCodex tools in the right order for a common workflow.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

export function registerPrompts(server: McpServer): void {
  // ---- /start-project ----
  server.prompt(
    "start-project",
    "Start a new game project — engine selection, GDD, goals, and first steps",
    {
      engine: z.string().optional().describe("Engine: any supported engine (godot, unity, bevy, monogame, etc.)"),
      genre: z.string().optional().describe("Game genre (e.g., roguelike, platformer, RPG)"),
      name: z.string().optional().describe("Project name"),
    },
    async (args) => {
      const engine = args.engine || "[ask the user which engine they want to use]";
      const genre = args.genre || "[ask the user what genre]";
      const name = args.name || "[ask the user for a project name]";

      return {
        messages: [
          {
            role: "user" as const,
            content: {
              type: "text" as const,
              text: [
                `I want to start a new game project.`,
                ``,
                `Engine: ${engine}`,
                `Genre: ${genre}`,
                `Name: ${name}`,
                ``,
                `Please help me set up by doing these steps in order:`,
                `1. Call \`project\` with action \`set\` to configure my engine, genre, and phase "planning"`,
                `2. Call \`design\` with action \`gdd\` to create an initial Game Design Document`,
                `3. Call \`project\` with action \`goal\` to set 3 starter goals for the planning phase`,
                `4. Call \`project\` with action \`suggest\` to show me what to work on first`,
              ].join("\n"),
            },
          },
        ],
      };
    },
  );

  // ---- /debug-error ----
  server.prompt(
    "debug-error",
    "Diagnose a game dev error — analyze, search docs, suggest a fix",
    {
      error: z.string().describe("The error message or symptom"),
      engine: z.string().optional().describe("Engine: any supported engine (godot, unity, bevy, monogame, etc.)"),
      context: z.string().optional().describe("What you were doing when the error occurred"),
    },
    async (args) => {
      const parts = [`I'm getting this error in my game:`, ``, `\`\`\``, args.error, `\`\`\``];
      if (args.engine) parts.push(``, `Engine: ${args.engine}`);
      if (args.context) parts.push(``, `Context: ${args.context}`);
      parts.push(
        ``,
        `Please help me fix this:`,
        `1. Call \`build\` with action \`debug\` to diagnose the error`,
        `2. Call \`docs\` with action \`search\` to find related patterns and solutions`,
        `3. Based on the findings, explain the root cause and suggest a fix`,
      );

      return {
        messages: [
          {
            role: "user" as const,
            content: { type: "text" as const, text: parts.join("\n") },
          },
        ],
      };
    },
  );

  // ---- /ship-game ----
  server.prompt(
    "ship-game",
    "Prepare to launch your game — checklists, store page, marketing, pricing",
    {
      platform: z.string().optional().describe("Platform: steam, itch, google-play, or app-store"),
    },
    async (args) => {
      const platform = args.platform || "itch";

      return {
        messages: [
          {
            role: "user" as const,
            content: {
              type: "text" as const,
              text: [
                `I'm ready to ship my game on ${platform}.`,
                ``,
                `Please walk me through everything I need:`,
                `1. Call \`design\` with action \`launch\` and platform \`${platform}\` for the pre-launch checklist`,
                `2. Call \`design\` with action \`store_page\` for store page writing guidance`,
                `3. Call \`design\` with action \`marketing\` for the marketing timeline`,
                `4. Call \`design\` with action \`pricing\` for pricing strategy`,
                `5. Summarize the key deadlines and action items`,
              ].join("\n"),
            },
          },
        ],
      };
    },
  );

  // ---- /session ----
  server.prompt(
    "session",
    "Start a structured dev session — plan, decide, build features, debug, or manage scope",
    {
      intent: z.string().optional().describe("What you want to work on (e.g., 'debug collision issue', 'plan my next sprint', 'add inventory system')"),
      project: z.string().optional().describe("Project name (default: 'default')"),
    },
    async (args) => {
      const intent = args.intent || "[ask the user what they want to work on today]";
      const project = args.project || "default";

      return {
        messages: [
          {
            role: "user" as const,
            content: {
              type: "text" as const,
              text: [
                `I want to start a structured dev session.`,
                ``,
                `What I'm working on: ${intent}`,
                `Project: ${project}`,
                ``,
                `Please start by calling \`project\` with action \`session\` and pass my intent as \`content\`. If I described a focus area, pass it as \`focus\` too.`,
                ``,
                `The session tool will return structured JSON with:`,
                `- The workflow path and current step`,
                `- Specific tool calls to make next`,
                `- Relevant docs for my topic`,
                ``,
                `Follow the tool recommendations step by step. After completing each step, call \`project\` with action \`session\` and \`advance: true\` to move to the next step. Continue until the path is complete.`,
              ].join("\n"),
            },
          },
        ],
      };
    },
  );
}
