/**
 * Help generator — self-documenting help output for every tool.
 *
 * Each tool's "help" action returns a formatted listing of all its actions
 * with required/optional params and example calls.
 */

import { ToolResult } from "../tool-definition.js";

// ---- Types ----

interface ActionHelp {
  name: string;
  description: string;
  required: string[];
  optional: string[];
  example: string;
}

interface ToolHelpDef {
  description: string;
  actions: ActionHelp[];
}

// ---- Help data ----

const TOOL_HELP: Record<string, ToolHelpDef> = {
  project: {
    description: "Your game dev AI assistant — project state, decisions, goals, scope health",
    actions: [
      { name: "hello", description: "Start here — onboarding or welcome back", required: [], optional: ["project"], example: 'project(action: "hello")' },
      { name: "get", description: "View full project state", required: [], optional: ["project"], example: 'project(action: "get")' },
      { name: "set", description: "Configure engine, genre, phase, skill level", required: [], optional: ["project", "engine", "genre", "skillLevel", "phase"], example: 'project(action: "set", engine: "godot", genre: "roguelike", phase: "prototype")' },
      { name: "suggest", description: "Get suggestion for what to work on next", required: [], optional: ["project"], example: 'project(action: "suggest")' },
      { name: "decide", description: "Log a design decision", required: ["content"], optional: ["project"], example: 'project(action: "decide", content: "Using ECS for entity management")' },
      { name: "goal", description: "Add a goal to track", required: ["content"], optional: ["project"], example: 'project(action: "goal", content: "Get player movement working")' },
      { name: "complete_goal", description: "Mark a goal as done", required: ["content"], optional: ["project"], example: 'project(action: "complete_goal", content: "Get player movement working")' },
      { name: "clear_goals", description: "Clear all goals", required: [], optional: ["project"], example: 'project(action: "clear_goals")' },
      { name: "milestone", description: "Celebrate a milestone", required: ["content"], optional: ["project"], example: 'project(action: "milestone", content: "First playable build!")' },
      { name: "note", description: "Save a note to a section", required: ["section", "content"], optional: ["project"], example: 'project(action: "note", section: "combat", content: "Hitbox-based collision")' },
      { name: "recall", description: "Retrieve notes (or list all sections)", required: [], optional: ["project", "section"], example: 'project(action: "recall", section: "combat")' },
      { name: "health", description: "Check scope health and get warnings", required: [], optional: ["project"], example: 'project(action: "health")' },
      { name: "scope", description: "Evaluate whether a feature fits your scope", required: ["feature"], optional: ["project"], example: 'project(action: "scope", feature: "multiplayer")' },
      { name: "add_feature", description: "Log a new feature (increments count)", required: ["feature"], optional: ["project"], example: 'project(action: "add_feature", feature: "inventory system")' },
      { name: "list", description: "Show all projects", required: [], optional: [], example: 'project(action: "list")' },
      { name: "session", description: "Start, continue, or advance a structured work session (Plan/Decide/Feature/Debug/Scope paths)", required: [], optional: ["project", "content", "advance", "focus"], example: 'project(action: "session", content: "I need to debug a collision issue")' },
    ],
  },
  design: {
    description: "Plan and ship — GDD, phases, scope, marketing, launch, architecture",
    actions: [
      { name: "gdd", description: "Create a Game Design Document", required: ["description"], optional: ["project", "genre", "engine", "scope"], example: 'design(action: "gdd", description: "A roguelike deckbuilder with cooking mechanics")' },
      { name: "phase", description: "Get checklist for a development phase", required: [], optional: ["project", "phase", "engine", "genre", "completedItems"], example: 'design(action: "phase", phase: "prototype")' },
      { name: "scope_check", description: "Evaluate if a feature fits your project", required: ["feature"], optional: ["project"], example: 'design(action: "scope_check", feature: "multiplayer")' },
      { name: "launch", description: "Pre-launch checklist", required: [], optional: ["platform", "engine"], example: 'design(action: "launch", platform: "steam")' },
      { name: "store_page", description: "Store page writing guide", required: [], optional: ["platform", "genre", "gameDescription"], example: 'design(action: "store_page", platform: "itch")' },
      { name: "pricing", description: "Pricing strategy advice", required: [], optional: ["platform"], example: 'design(action: "pricing", platform: "steam")' },
      { name: "marketing", description: "Marketing timeline", required: [], optional: ["platform"], example: 'design(action: "marketing")' },
      { name: "trailer", description: "Trailer creation guide", required: [], optional: ["genre"], example: 'design(action: "trailer", genre: "horror")' },
      { name: "patterns", description: "Architecture pattern advice", required: ["topic"], optional: ["engine"], example: 'design(action: "patterns", topic: "ECS")' },
    ],
  },
  build: {
    description: "Build your game — scaffold, code, assets, debug, review",
    actions: [
      { name: "scaffold", description: "Create project structure for an engine", required: ["engine", "name"], optional: ["genre"], example: 'build(action: "scaffold", engine: "godot", name: "my-rpg")' },
      { name: "code", description: "Generate feature starter code", required: ["engine", "feature"], optional: ["genre", "skillLevel"], example: 'build(action: "code", engine: "monogame", feature: "player movement")' },
      { name: "assets", description: "Art/audio pipeline guide", required: ["assetType", "engine"], optional: ["sourceTool"], example: 'build(action: "assets", assetType: "sprite", engine: "godot")' },
      { name: "debug", description: "Diagnose an error or bug", required: ["error"], optional: ["engine", "context"], example: 'build(action: "debug", error: "NullReferenceException in Update()")' },
      { name: "review", description: "Review project architecture", required: ["structure"], optional: ["engine", "concerns"], example: 'build(action: "review", structure: "<paste tree output>")' },
    ],
  },
  docs: {
    description: "950+ curated game dev docs — search, read, browse",
    actions: [
      { name: "search", description: "Search the knowledge base", required: ["query"], optional: ["category", "module", "engine", "crossEngine"], example: 'docs(action: "search", query: "collision detection")' },
      { name: "get", description: "Fetch a full doc by ID", required: ["id"], optional: ["section", "maxLength"], example: 'docs(action: "get", id: "G52")' },
      { name: "browse", description: "List and filter available docs", required: [], optional: ["category", "module", "summary"], example: 'docs(action: "browse", module: "core")' },
      { name: "modules", description: "List available engines and doc counts", required: [], optional: ["engine"], example: 'docs(action: "modules")' },
    ],
  },
  meta: {
    description: "Server diagnostics — health, stats, license, info",
    actions: [
      { name: "status", description: "Server overview and uptime", required: [], optional: [], example: 'meta(action: "status")' },
      { name: "analytics", description: "Usage statistics", required: [], optional: [], example: 'meta(action: "analytics")' },
      { name: "license", description: "License tier and access details", required: [], optional: [], example: 'meta(action: "license")' },
      { name: "modules", description: "List available engine modules", required: [], optional: [], example: 'meta(action: "modules")' },
      { name: "health", description: "Quick server health check", required: [], optional: [], example: 'meta(action: "health")' },
      { name: "about", description: "What is GameCodex", required: [], optional: [], example: 'meta(action: "about")' },
    ],
  },
};

// ---- Generator ----

export function getToolHelp(toolName: string): ToolResult {
  const help = TOOL_HELP[toolName];
  if (!help) {
    return { content: [{ type: "text", text: `No help available for "${toolName}".` }] };
  }

  let out = `# ${toolName} — ${help.description}\n\n`;

  for (const a of help.actions) {
    out += `## ${a.name}\n`;
    out += `${a.description}\n`;
    if (a.required.length > 0) {
      out += `**Required:** ${a.required.join(", ")}`;
    }
    if (a.optional.length > 0) {
      out += a.required.length > 0 ? ` | ` : ``;
      out += `**Optional:** ${a.optional.join(", ")}`;
    }
    out += `\n**Example:** \`${a.example}\`\n\n`;
  }

  return { content: [{ type: "text", text: out }] };
}
