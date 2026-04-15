/**
 * Tool definition interface — inspired by Claude Code's tool architecture.
 *
 * SOURCE: Claude Code source analysis (cc referance/)
 * - Tools have metadata: isReadOnly, isConcurrencySafe, isDestructive
 * - Fail-closed defaults: assume writes, assume not concurrent-safe
 * - Lazy schema construction via lazySchema()
 * - Centralized validation and permission checking
 *
 * SOURCE: MooBot archive (moobot/)
 * - Tool allowlists per agent context
 * - Security deny patterns for dangerous operations
 * - Stats/timing on every tool call
 */

import { z } from "zod";

import type { DocStore, Doc } from "./core/docs.js";
import type { SearchEngine } from "./core/search.js";
import type { HybridSearchEngine } from "./core/hybrid-search.js";
import type { HybridProvider } from "./core/hybrid-provider.js";
import type { ModuleMetadata } from "./core/modules.js";
import type { SessionManager } from "./core/session-manager.js";
import type { MemoryStore } from "./core/memory.js";
import type { Analytics } from "./analytics.js";
import type { ProjectStore } from "./core/project-store.js";
import type { PersonalityEngine } from "./core/personality.js";
import type { HealthTracker } from "./core/health-tracker.js";

// ---- Lazy schema helper (from CC patterns) ----

/**
 * Defer Zod schema construction to first access.
 * Breaks circular dependencies and improves module load time.
 */
export function lazySchema<T>(factory: () => T): () => T {
  let cached: T | undefined;
  return () => (cached ??= factory());
}

// ---- Tool result type ----

export type ToolResult = {
  content: Array<{ type: "text"; text: string }>;
};

// ---- Tool definition ----

export interface GameCodexToolDef<TInput extends z.ZodRawShape = z.ZodRawShape> {
  /** Unique tool name (used in MCP registration and tier checks) */
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

  // ---- CC-inspired metadata (fail-closed defaults) ----

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

  // ---- Tier gating ----

  /** Module restriction mode for free tier: "core-only" forces module=core */
  freeTierRestriction?: "core-only" | "engine-gate" | "none";

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
  hybridSearch: HybridSearchEngine;
  hybridProvider: HybridProvider;
  discoveredModules: ModuleMetadata[];
  sessionManager: SessionManager;
  memory: MemoryStore;         // Freeform project notes (~/.gamecodex/memory/)
  analytics: Analytics;
  tier: "free" | "pro";
  serverVersion: string;
  activeModules: string[];
  allDocs: Doc[];
  projectStore: ProjectStore;  // Structured project data (~/.gamecodex/projects/)
  personality: PersonalityEngine;
  healthTracker: HealthTracker;
  licenseInfo?: {
    expiresAt?: string;
    activationLimit?: number;
    activationsUsed?: number;
  };
}

// ---- Built tool (with defaults applied) ----

export interface GameCodexTool<TInput extends z.ZodRawShape = z.ZodRawShape>
  extends Required<Pick<GameCodexToolDef<TInput>,
    "isReadOnly" | "isConcurrencySafe" | "isDestructive" | "isEnabled"
  >> {
  name: string;
  description: string;
  inputSchema: TInput;
  handler: GameCodexToolDef<TInput>["handler"];
  freeTierRestriction: "core-only" | "engine-gate" | "none";
  category: string;
  activityDescription: string;
}

/**
 * Build a tool definition with fail-closed defaults applied.
 * Mirrors CC's buildTool() pattern.
 */
export function buildTool<TInput extends z.ZodRawShape>(
  def: GameCodexToolDef<TInput>
): GameCodexTool<TInput> {
  return {
    // Fail-closed defaults (from CC)
    isReadOnly: false,
    isConcurrencySafe: false,
    isDestructive: false,
    isEnabled: true,
    freeTierRestriction: "none",
    category: "system",
    activityDescription: def.name,
    // User overrides
    ...def,
  };
}
