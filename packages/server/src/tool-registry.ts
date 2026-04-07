/**
 * Tool registry — centralized tool registration with auto-wiring.
 *
 * SOURCE: Claude Code source analysis (cc referance/)
 * - assembleToolPool(): getAllBaseTools() → getTools() → assembleToolPool()
 * - filterToolsByDenyRules(): removes blanket-denied tools
 * - Each tool call goes through: validate → checkPermissions → call → mapResult
 * - Consistent error handling wraps every tool execution
 * - Analytics instrumentation at every step
 *
 * SOURCE: MooBot archive (moobot/)
 * - Stats footer on every response (timing, context %)
 * - Concurrency counter (MAX_CONCURRENT) with rejection
 * - Session-aware tool execution
 * - Tier/access checks before every call
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import {
  GameCodexTool,
  GameCodexToolDef,
  ToolDependencies,
  ToolResult,
  buildTool,
} from "./tool-definition.js";
import { isToolAllowed, PRO_GATE_MESSAGE, UPGRADE_URL } from "./tiers.js";
import { enhanceResponse } from "./core/response-enhancer.js";

// ---- Concurrency control (from MooBot's MAX_CONCURRENT pattern) ----

const MAX_CONCURRENT = 8; // MooBot used 4, but MCP tools are lighter
let activeToolCalls = 0;

// ---- Pro gate response ----

function proGateResponse(): ToolResult {
  return { content: [{ type: "text", text: PRO_GATE_MESSAGE }] };
}

// ---- Registry ----

export class ToolRegistry {
  private tools: Map<string, GameCodexTool> = new Map();
  private deps!: ToolDependencies;

  /** Register a tool definition (applies fail-closed defaults) */
  register<TInput extends z.ZodRawShape>(def: GameCodexToolDef<TInput>): void {
    const tool = buildTool(def);
    if (this.tools.has(tool.name)) {
      console.error(`[gamecodex] Warning: duplicate tool registration "${tool.name}", overwriting`);
    }
    // Cast is safe: the registry stores tools with erased input types
    // and validates via Zod at runtime (CC pattern: inputSchema as passthrough)
    this.tools.set(tool.name, tool as unknown as GameCodexTool);
  }

  /** Set shared dependencies (called once during server init) */
  setDependencies(deps: ToolDependencies): void {
    this.deps = deps;
  }

  /** Get all registered tools */
  getAllTools(): GameCodexTool[] {
    return [...this.tools.values()];
  }

  /** Get tools filtered by tier (CC's getTools pattern) */
  getToolsForTier(tier: "free" | "pro"): GameCodexTool[] {
    return this.getAllTools().filter((tool) => {
      if (!tool.isEnabled) return false;
      const access = isToolAllowed(tier, tool.name);
      return access !== "denied";
    });
  }

  /**
   * Wire all registered tools into an MCP server instance.
   *
   * This replaces the repetitive inline server.tool() calls with a single
   * loop that handles:
   * 1. Tier/access checks (from tiers.ts)
   * 2. Free-tier module restrictions
   * 3. Concurrency control (from MooBot's MAX_CONCURRENT)
   * 4. Analytics instrumentation
   * 5. Error handling (never throws, always returns user-friendly text)
   */
  wireToServer(server: McpServer): void {
    if (!this.deps) {
      throw new Error("ToolRegistry.setDependencies() must be called before wireToServer()");
    }

    for (const tool of this.tools.values()) {
      if (!tool.isEnabled) continue;

      server.registerTool(tool.name, {
        description: tool.description,
        inputSchema: tool.inputSchema,
        annotations: {
          title: tool.activityDescription,
          readOnlyHint: tool.isReadOnly,
          destructiveHint: tool.isDestructive,
          idempotentHint: tool.isConcurrencySafe,
        },
      }, async (args: Record<string, unknown>) => {
        return this.executeTool(tool, args);
      });
    }
  }

  /**
   * Execute a tool with all middleware applied.
   * Mirrors CC's tool execution flow: validate → permissions → call → result
   */
  private async executeTool(
    tool: GameCodexTool,
    args: Record<string, unknown>
  ): Promise<ToolResult> {
    const { analytics, tier } = this.deps;

    try {
      // 1. Tier/access check
      const access = isToolAllowed(tier, tool.name);
      if (access === "denied") {
        analytics.recordProGate(tool.name);
        return proGateResponse();
      }

      // 2. Free-tier module restrictions
      if (access === "limited" && tool.freeTierRestriction === "core-only") {
        const moduleArg = args.module as string | undefined;
        const engineArg = args.engine as string | undefined;

        if (moduleArg && moduleArg !== "core") {
          return {
            content: [{
              type: "text",
              text: `Searching non-core modules requires a Pro license. ${PRO_GATE_MESSAGE}`,
            }],
          };
        }
        if (engineArg) {
          return {
            content: [{
              type: "text",
              text: `Engine-specific access requires a Pro license. Free tier accesses core docs only. ${PRO_GATE_MESSAGE}`,
            }],
          };
        }
        // Force module to core for free tier
        (args as Record<string, unknown>).module = "core";
      }

      if (access === "limited" && tool.freeTierRestriction === "engine-gate") {
        return {
          content: [{
            type: "text",
            text: `This feature requires a Pro license (it accesses engine-specific modules). ${PRO_GATE_MESSAGE}`,
          }],
        };
      }

      // 3. Concurrency control (from MooBot's MAX_CONCURRENT pattern)
      if (activeToolCalls >= MAX_CONCURRENT) {
        return {
          content: [{
            type: "text",
            text: `Server busy (${MAX_CONCURRENT} concurrent tool calls). Try again in a moment.`,
          }],
        };
      }

      activeToolCalls++;

      try {
        // 5. Execute handler with timing (MooBot's stats pattern)
        const start = Date.now();
        const result = await tool.handler(args, this.deps);
        const durationMs = Date.now() - start;

        // 6. Record analytics
        analytics.recordToolCall(tool.name, durationMs);

        // 7. Enhance response with breadcrumb + next steps
        const enhanced = enhanceResponse(
          result,
          tool.name,
          args.action as string ?? "",
          this.deps,
          args.project as string | undefined,
        );

        return enhanced;
      } finally {
        activeToolCalls--;
      }
    } catch (err) {
      // Never throw — always return user-friendly error (CC pattern)
      analytics.recordToolCall(tool.name, 0, true);
      return {
        content: [{
          type: "text",
          text: `${tool.name} error: ${err instanceof Error ? err.message : String(err)}`,
        }],
      };
    }
  }
}

/** Singleton registry */
let _registry: ToolRegistry | null = null;

export function getToolRegistry(): ToolRegistry {
  if (!_registry) {
    _registry = new ToolRegistry();
  }
  return _registry;
}
