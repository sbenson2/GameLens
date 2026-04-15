import type { MCPTool } from "../mcp/client.js";

export interface ToolCall {
  id: string;
  tool: string;
  action?: string;
  arguments: Record<string, unknown>;
  result?: unknown;
  error?: string;
  timestamp: number;
  duration?: number;
}

export interface Observation {
  success: boolean;
  message: string;
  hasOutput: boolean;
  outputTruncated?: boolean;
}

export interface SubTask {
  id: string;
  description: string;
  toolCalls: ToolCall[];
  status: "pending" | "in_progress" | "completed" | "failed";
  result?: unknown;
  error?: string;
}

export interface ExecutionContext {
  id: string;
  userGoal: string;
  task: string;
  subTasks: SubTask[];
  completedToolCalls: ToolCall[];
  pendingToolCalls: ToolCall[];
  currentPlan: string[];
  observations: Observation[];
  iterations: number;
  maxIterations: number;
  createdAt: number;
  updatedAt: number;
  metadata: Record<string, unknown>;
}

export interface AgentState {
  isRunning: boolean;
  isPaused: boolean;
  context: ExecutionContext | null;
  messages: AgentMessage[];
  errors: AgentError[];
}

export interface AgentMessage {
  id: string;
  role: "user" | "assistant" | "system" | "tool";
  content: string;
  toolCalls?: ToolCall[];
  timestamp: number;
}

export interface AgentError {
  id: string;
  message: string;
  context?: string;
  recoverable: boolean;
  timestamp: number;
}

export function createExecutionContext(
  userGoal: string,
  maxIterations: number = 50
): ExecutionContext {
  return {
    id: generateId(),
    userGoal,
    task: userGoal,
    subTasks: [],
    completedToolCalls: [],
    pendingToolCalls: [],
    currentPlan: [],
    observations: [],
    iterations: 0,
    maxIterations,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    metadata: {},
  };
}

export function createToolCall(
  tool: string,
  arguments_: Record<string, unknown>,
  action?: string
): ToolCall {
  return {
    id: generateId(),
    tool,
    action,
    arguments: arguments_,
    timestamp: Date.now(),
  };
}

export function observeResult(call: ToolCall): Observation {
  const success = !call.error && call.result !== undefined;
  const hasOutput =
    success &&
    call.result !== null &&
    (typeof call.result === "string"
      ? call.result.length > 0
      : typeof call.result === "object");

  let message = "";
  if (call.error) {
    message = `Error: ${call.error}`;
  } else if (success) {
    const resultStr =
      typeof call.result === "string"
        ? call.result
        : JSON.stringify(call.result);
    message = resultStr.slice(0, 500) + (resultStr.length > 500 ? "..." : "");
  } else {
    message = "No output produced";
  }

  return {
    success,
    message,
    hasOutput: hasOutput ?? false,
    outputTruncated: message.length >= 500,
  };
}

export function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export function estimateTokenCount(text: string): number {
  return Math.ceil(text.length / 4);
}
