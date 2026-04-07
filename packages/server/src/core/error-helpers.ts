/**
 * Error helpers — enriched error messages with valid values, examples, and fuzzy matching.
 *
 * Replaces bare "Please provide `param`." messages across all tools with
 * context-rich responses that help the AI (and user) self-correct.
 */

import { closest, distance } from "fastest-levenshtein";

// ---- Types ----

export type ToolResult = {
  content: Array<{ type: "text"; text: string }>;
};

// ---- Param registry ----

interface ParamInfo {
  validValues?: string[];
  example?: string;
}

const PARAM_REGISTRY: Record<string, Record<string, ParamInfo>> = {
  build: {
    engine: {
      validValues: ["monogame", "godot", "phaser"],
      example: 'build(action: "scaffold", engine: "godot", name: "my-game")',
    },
    name: {
      example: 'build(action: "scaffold", engine: "godot", name: "my-game")',
    },
    feature: {
      validValues: ["player movement", "inventory", "combat", "state machine", "save/load", "ui"],
      example: 'build(action: "code", engine: "monogame", feature: "player movement")',
    },
    assetType: {
      validValues: ["sprite", "spritesheet", "audio", "tilemap", "font", "particle"],
      example: 'build(action: "assets", engine: "godot", assetType: "sprite")',
    },
    error: {
      example: 'build(action: "debug", error: "NullReferenceException in Update()")',
    },
    structure: {
      example: 'build(action: "review", structure: "<paste tree output>")',
    },
  },
  project: {
    content: {
      example: 'project(action: "goal", content: "Get player movement working")',
    },
    section: {
      example: 'project(action: "note", section: "combat", content: "Use hitboxes")',
    },
    feature: {
      example: 'project(action: "scope", feature: "multiplayer support")',
    },
  },
  design: {
    description: {
      example: 'design(action: "gdd", description: "A roguelike deckbuilder with cooking mechanics")',
    },
    feature: {
      example: 'design(action: "scope_check", feature: "multiplayer")',
    },
    topic: {
      example: 'design(action: "patterns", topic: "ECS")',
    },
  },
  docs: {
    query: {
      example: 'docs(action: "search", query: "collision detection")',
    },
    id: {
      example: 'docs(action: "get", id: "G52")',
    },
  },
};

/**
 * Enriched "missing parameter" error.
 * Shows valid values (if known) and an example call.
 */
export function miss(param: string, toolName: string, action?: string): ToolResult {
  const info = PARAM_REGISTRY[toolName]?.[param];

  let text = `Missing \`${param}\``;
  if (action) text += ` for "${action}"`;
  text += ".";

  if (info?.validValues) {
    text += `\nValid values: ${info.validValues.join(", ")}`;
  }
  if (info?.example) {
    text += `\nExample: ${info.example}`;
  }

  return { content: [{ type: "text", text }] };
}

/**
 * Fuzzy-match an input string against a list of valid candidates.
 * Returns the closest match if within threshold, or null.
 */
export function fuzzyMatch(
  input: string,
  candidates: string[],
  maxDistance: number = 2,
): string | null {
  if (candidates.length === 0) return null;
  const best = closest(input, candidates);
  const d = distance(input, best);
  // Allow match if within maxDistance or within 30% of input length
  const threshold = Math.max(maxDistance, Math.ceil(input.length * 0.3));
  return d <= threshold && d > 0 ? best : null;
}

/**
 * "Unknown action" error with fuzzy-match suggestion.
 */
export function unknownAction(
  input: string,
  validActions: string[],
  toolName: string,
): ToolResult {
  const suggestion = fuzzyMatch(input, validActions);

  let text = `Unknown action "${input}" for ${toolName}.`;
  if (suggestion) {
    text += `\nDid you mean "${suggestion}"?`;
  }
  text += `\nAvailable: ${validActions.join(", ")}`;

  return { content: [{ type: "text", text }] };
}
