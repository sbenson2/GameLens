/**
 * Tool definition interface — metadata-carrying tool defs with fail-closed
 * defaults, validated via Zod at the MCP boundary.
 *
 * The server exposes a single tool (`lens`); the registry and this
 * interface stay because they keep registration, analytics, concurrency,
 * and error handling in one tested path.
 */

import { z } from "zod";

import type { DocStore, Doc } from "./core/docs.js";
import type { SearchEngine } from "./core/search.js";
import type { Analytics } from "./analytics.js";

// ---- Tool result type ----

export type ToolResult = {
  content: Array<{ type: "text"; text: string }>;
  /** MCP error flag — set on failures so callers can branch programmatically
   *  instead of pattern-matching error prose */
  isError?: boolean;
};

// ---- Tool definition ----

export interface GameLensToolDef<TInput extends z.ZodRawShape = z.ZodRawShape> {
  /** Unique tool name (used in MCP registration) */
  name: string;

  /** Human-readable description shown to the AI model */
  description: string;

  /** Zod schema shape for input validation */
  inputSchema: TInput;

  /**
   * Tool handler — receives validated args + injected dependencies.
   * Must return ToolResult ({ content: [{ type: "text", text: string }] }).
   */
  handler: (args: z.infer<z.ZodObject<TInput>>, deps: ToolDependencies) => Promise<ToolResult>;

  // ---- Metadata (fail-closed defaults) ----

  /**
   * Does this tool only read data (no side effects)?
   * Default: false (fail-closed — assume writes)
   */
  isReadOnly?: boolean;

  /**
   * Is this tool safe to run concurrently with other tools?
   * Default: false (fail-closed — assume not safe)
   */
  isConcurrencySafe?: boolean;

  /**
   * Can this tool cause irreversible changes?
   * Default: false
   */
  isDestructive?: boolean;

  /**
   * Is this tool currently enabled?
   * Default: true
   */
  isEnabled?: boolean;

  // ---- Categorization ----

  /** Tool category for grouping in diagnostics */
  category?: "search" | "docs" | "learning" | "generation" | "session" | "system";

  /** Short activity description for progress/logging (e.g. "Searching docs") */
  activityDescription?: string;
}

// ---- Dependencies injected into tool handlers ----

export interface ToolDependencies {
  docStore: DocStore;
  searchEngine: SearchEngine;
  analytics: Analytics;
  serverVersion: string;
  allDocs: Doc[];
}

// ---- Built tool (with defaults applied) ----

export interface GameLensTool<TInput extends z.ZodRawShape = z.ZodRawShape>
  extends Required<Pick<GameLensToolDef<TInput>,
    "isReadOnly" | "isConcurrencySafe" | "isDestructive" | "isEnabled"
  >> {
  name: string;
  description: string;
  inputSchema: TInput;
  handler: GameLensToolDef<TInput>["handler"];
  category: string;
  activityDescription: string;
}

/**
 * Build a tool definition with fail-closed defaults applied.
 */
export function buildTool<TInput extends z.ZodRawShape>(
  def: GameLensToolDef<TInput>
): GameLensTool<TInput> {
  return {
    // Fail-closed defaults
    isReadOnly: false,
    isConcurrencySafe: false,
    isDestructive: false,
    isEnabled: true,
    category: "system",
    activityDescription: def.name,
    // User overrides
    ...def,
  };
}
