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
 * - Concurrency counter (CONFIG.MAX_CONCURRENT_TOOLS) with rejection
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
import { enhanceResponse } from "./core/response-enhancer.js";
import { CONFIG } from "./config.js";

// ---- Concurrency control (from MooBot's CONFIG.MAX_CONCURRENT_TOOLS pattern) ----
let activeToolCalls = 0;

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

  /**
   * Wire all registered tools into an MCP server instance.
   *
   * This replaces the repetitive inline server.tool() calls with a single
   * loop that handles:
   * 1. Concurrency control (from MooBot's CONFIG.MAX_CONCURRENT_TOOLS)
   * 2. Analytics instrumentation
   * 3. Error handling (never throws, always returns user-friendly text)
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
    const { analytics } = this.deps;

    try {
      // Concurrency control (from MooBot's CONFIG.MAX_CONCURRENT_TOOLS pattern)
      if (activeToolCalls >= CONFIG.MAX_CONCURRENT_TOOLS) {
        return {
          content: [{
            type: "text",
            text: `Server busy (${CONFIG.MAX_CONCURRENT_TOOLS} concurrent tool calls). Try again in a moment.`,
          }],
        };
      }

      activeToolCalls++;

      try {
        // Execute handler with timing (MooBot's stats pattern)
        const start = Date.now();
        const result = await tool.handler(args, this.deps);
        const durationMs = Date.now() - start;

        // Record analytics
        analytics.recordToolCall(tool.name, durationMs);

        // Record activity in session (non-critical)
        try {
          const projectName = (args.project as string) || "default";
          this.deps.sessionManager.recordToolCall(projectName);

          if (tool.name === "docs" && args.action === "get" && args.id) {
            this.deps.sessionManager.recordDocConsulted(projectName, args.id as string);
          }
          if (tool.name === "project" && args.action === "decide" && args.content) {
            this.deps.sessionManager.logDecision(projectName, args.content as string);
          }
        } catch {
          // Session tracking is non-critical — never fail the response
        }

        // Enhance response with breadcrumb + next steps
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
