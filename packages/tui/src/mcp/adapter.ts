import { z } from "zod";
import type { MCPTool } from "./client.js";

export interface ToolAdapterConfig {
  mcpTool: MCPTool;
  executor: (args: Record<string, unknown>) => Promise<unknown>;
}

const TOOL_ACTION_MAP: Record<string, Record<string, string[]>> = {
  project: {
    help: [],
    hello: [],
    get: ["key"],
    set: ["key", "value"],
    suggest: ["query"],
    decide: ["topic", "options"],
    goal: ["description"],
    complete_goal: ["goalId"],
    clear_goals: [],
    milestone: ["title", "description"],
    note: ["content"],
    recall: ["query"],
    clear_notes: [],
    health: [],
    scope: [],
    add_feature: ["name", "description", "priority"],
    list: [],
    session: ["type"],
  },
  design: {
    help: [],
    gdd: ["action", "content"],
    phase: ["name"],
    scope_check: [],
    launch: ["platforms"],
    store_page: ["action", "content"],
    pricing: ["action", "content"],
    marketing: ["action", "content"],
    trailer: ["action", "content"],
    patterns: ["pattern"],
  },
  docs: {
    help: [],
    search: ["query", "engine"],
    get: ["path"],
    browse: ["engine", "category"],
    modules: ["action"],
  },
  build: {
    help: [],
    scaffold: ["engine", "projectType", "name"],
    code: ["action", "content"],
    assets: ["action", "content"],
    debug: ["error", "context"],
    review: ["type"],
  },
  meta: {
    help: [],
    status: [],
    analytics: ["timeframe"],
    license: ["action"],
    modules: ["action"],
    health: [],
    about: [],
  },
};

export function adaptMCPToTools(
  mcpTools: MCPTool[],
  executor: (toolName: string, action: string | undefined, args: Record<string, unknown>) => Promise<unknown>
): any[] {
  const adaptedTools: any[] = [];

  for (const mcpTool of mcpTools) {
    const toolDef = TOOL_ACTION_MAP[mcpTool.name];

    if (toolDef) {
      for (const [action, requiredFields] of Object.entries(toolDef)) {
        const toolName = action === "default" ? mcpTool.name : `${mcpTool.name}.${action}`;

        const schema = buildZodSchema(mcpTool.inputSchema, requiredFields);

        adaptedTools.push({
          name: toolName,
          description: `${mcpTool.description} (action: ${action})`,
          parameters: schema,
          execute: async (args: Record<string, unknown>) => {
            const fullArgs = { ...args };
            if (action !== "default") {
              fullArgs.action = action;
            }
            const result = await executor(mcpTool.name, action === "default" ? undefined : action, fullArgs);
            return typeof result === "string" ? result : JSON.stringify(result, null, 2);
          },
        });
      }
    } else {
      const schema = buildZodSchema(mcpTool.inputSchema, []);

      adaptedTools.push({
        name: mcpTool.name,
        description: mcpTool.description,
        parameters: schema,
        execute: async (args: Record<string, unknown>) => {
          const result = await executor(mcpTool.name, undefined, args);
          return typeof result === "string" ? result : JSON.stringify(result, null, 2);
        },
      });
    }
  }

  return adaptedTools;
}

function buildZodSchema(
  inputSchema: MCPTool["inputSchema"],
  requiredFields: string[]
): z.ZodObject<any> {
  const properties: Record<string, z.ZodTypeAny> = {};

  if (inputSchema.properties) {
    for (const [key, value] of Object.entries(inputSchema.properties)) {
      const prop = value as { type: string; description?: string; default?: unknown };
      let schema: z.ZodTypeAny;

      switch (prop.type) {
        case "string":
          schema = z.string().describe(prop.description || key);
          break;
        case "number":
        case "integer":
          schema = z.number().describe(prop.description || key);
          break;
        case "boolean":
          schema = z.boolean().describe(prop.description || key);
          break;
        case "array":
          schema = z.array(z.any()).describe(prop.description || key);
          break;
        case "object":
          schema = z.record(z.any()).describe(prop.description || key);
          break;
        default:
          schema = z.any().describe(prop.description || key);
      }

      if (prop.default !== undefined) {
        schema = schema.optional().default(prop.default as any);
      }

      properties[key] = schema;
    }
  }

  const required = inputSchema.required || requiredFields.filter((f) => properties[f]);

  const shape: Record<string, z.ZodTypeAny> = {};
  for (const key of required) {
    if (properties[key]) {
      shape[key] = properties[key];
    }
  }
  for (const [key, val] of Object.entries(properties)) {
    if (!shape[key]) {
      shape[key] = val.optional();
    }
  }

  return z.object(shape);
}

export function createDirectExecutor(
  executor: (toolName: string, action: string | undefined, args: Record<string, unknown>) => Promise<unknown>
): (toolName: string, args: Record<string, unknown>) => Promise<unknown> {
  return async (toolName: string, args: Record<string, unknown>) => {
    const action = args.action as string | undefined;
    const cleanArgs = { ...args };
    delete cleanArgs.action;
    return executor(toolName, action, cleanArgs);
  };
}
