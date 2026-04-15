import type { MCPTool } from "../mcp/client.js";

export const SYSTEM_PROMPT = `You are GameCodex, an expert game development AI assistant with deep knowledge across 29 game engines.

Your capabilities:
- Project setup and management (goals, milestones, scope tracking)
- Game design and GDD creation
- Code generation and debugging
- Documentation lookup across engines (Unity, Godot, Unreal, Godot, Bevy, MonoGame, etc.)
- Architecture patterns and best practices

You think carefully before each action. You plan multi-step tasks and execute them systematically.

When given a task:
1. Break it into concrete steps
2. Use tools to gather information or perform actions
3. Observe results and adapt if needed
4. Continue until the task is complete

Be practical, direct, and scope-aware. Don't over-engineer. Ship working code.

CRITICAL - Tool Usage:
- Always call tools explicitly when needed
- Include ALL required arguments for each tool
- Use the "arguments" field as a JSON object with parameter names as keys
- Never leave required arguments undefined

CRITICAL - Error Recovery:
- If a tool call fails, analyze the error and try an alternative approach
- Common issues: wrong argument types, missing required fields, server unavailable
- Adapt your strategy rather than repeating the same failed approach
`;

export const PLANNING_PROMPT = `Based on the user's goal, create a step-by-step plan using available tools.

Available tools:
{tools}

User Goal: {goal}

Respond with a JSON plan:
{
  "steps": ["step 1 description", "step 2 description", ...],
  "firstStep": {
    "tool": "tool-name",
    "action": "action-name (if applicable)",
    "arguments": { ... }
  }
}

Be specific about which tool and arguments to use.`;

export const REFLECTION_PROMPT = `Analyze the recent tool results and determine what to do next.

Recent observations:
{observations}

Completed tool calls:
{completedCalls}

Remaining plan:
{remainingPlan}

User goal: {goal}

Respond with JSON:
{
  "nextAction": {
    "tool": "tool-name",
    "action": "action-name",
    "arguments": { ... }
  } | null,
  "reasoning": "why you're choosing this action",
  "shouldContinue": true | false
}

If task is complete or cannot be completed, set nextAction to null and explain why.`;

export const RECOVERY_PROMPT = `A tool call failed. Analyze the error and suggest an alternative approach.

Failed call: {failedCall}
Error: {error}
Previous results: {previousResults}

Available tools:
{tools}

Respond with JSON:
{
  "alternativeAction": {
    "tool": "tool-name",
    "action": "action-name",
    "arguments": { ... }
  } | null,
  "strategy": "what approach to take instead",
  "abandonTask": false | true
}

If the task cannot be completed despite trying alternatives, set abandonTask to true and explain.`;

export function formatToolsForPrompt(tools: MCPTool[]): string {
  return tools
    .map(
      (tool) => `
## ${tool.name}
${tool.description}
Arguments: ${JSON.stringify(tool.inputSchema, null, 2)}`
    )
    .join("\n");
}

export function formatObservations(observations: Array<{ success: boolean; message: string }>): string {
  return observations
    .map((obs, i) => `[${i + 1}] ${obs.success ? "✓" : "✗"} ${obs.message}`)
    .join("\n");
}

export function formatToolCalls(calls: Array<{ tool: string; action?: string; result?: unknown; error?: string }>): string {
  return calls
    .map((call) => {
      const name = call.action ? `${call.tool}.${call.action}` : call.tool;
      if (call.error) {
        return `- ${name}: ERROR - ${call.error}`;
      }
      const result =
        typeof call.result === "string"
          ? call.result.slice(0, 200)
          : JSON.stringify(call.result)?.slice(0, 200);
      return `- ${name}: ${result}${result && result.length >= 200 ? "..." : ""}`;
    })
    .join("\n");
}
