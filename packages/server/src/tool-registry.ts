/**
 * Tool registry — centralized registration with concurrency control,
 * analytics, and never-throw error handling.
 *
 * v2 exposes a single tool; the registry stays because it is the one
 * tested path between the MCP SDK and tool handlers.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import {
  GameLensTool,
  GameLensToolDef,
  ToolDependencies,
  ToolResult,
  buildTool,
} from "./tool-definition.js";
import { CONFIG } from "./config.js";

// ---- Concurrency control ----
let activeToolCalls = 0;

// ---- Registry ----

export class ToolRegistry {
  private tools: Map<string, GameLensTool> = new Map();
  private deps!: ToolDependencies;

  /** Register a tool definition (applies fail-closed defaults) */
  register<TInput extends z.ZodRawShape>(def: GameLensToolDef<TInput>): void {
    const tool = buildTool(def);
    if (this.tools.has(tool.name)) {
      console.error(`[gamelens] Warning: duplicate tool registration "${tool.name}", overwriting`);
    }
    // Cast is safe: the registry stores tools with erased input types
    // and validates via Zod at runtime
    this.tools.set(tool.name, tool as unknown as GameLensTool);
  }

  /** Set shared dependencies (called once during server init) */
  setDependencies(deps: ToolDependencies): void {
    this.deps = deps;
  }

  /** Get all registered tools */
  getAllTools(): GameLensTool[] {
    return [...this.tools.values()];
  }

  /**
   * Wire all registered tools into an MCP server instance:
   * concurrency control → handler → analytics → error mapping.
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

  /** Execute a tool with concurrency, analytics, and error handling applied */
  private async executeTool(
    tool: GameLensTool,
    args: Record<string, unknown>
  ): Promise<ToolResult> {
    const { analytics } = this.deps;

    try {
      if (activeToolCalls >= CONFIG.MAX_CONCURRENT_TOOLS) {
        return {
          content: [{
            type: "text",
            text: `Server busy (${CONFIG.MAX_CONCURRENT_TOOLS} concurrent tool calls). Try again in a moment.`,
          }],
          isError: true,
        };
      }

      activeToolCalls++;

      try {
        const start = Date.now();
        const result = await tool.handler(args, this.deps);
        analytics.recordToolCall(tool.name, Date.now() - start);
        return result;
      } finally {
        activeToolCalls--;
      }
    } catch (err) {
      // Never throw — always return a user-friendly error
      analytics.recordToolCall(tool.name, 0, true);
      return {
        content: [{
          type: "text",
          text: `${tool.name} error: ${err instanceof Error ? err.message : String(err)}`,
        }],
        isError: true,
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
