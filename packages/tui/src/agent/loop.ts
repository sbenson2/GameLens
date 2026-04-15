import type { LanguageModel } from "ai";
import { streamText, generateText, type CoreMessage } from "ai";
import type { ExecutionContext, ToolCall, Observation, AgentMessage, SubTask } from "./context.js";
import { createExecutionContext, createToolCall, observeResult, generateId } from "./context.js";
import {
  SYSTEM_PROMPT,
  PLANNING_PROMPT,
  REFLECTION_PROMPT,
  RECOVERY_PROMPT,
  formatToolsForPrompt,
  formatObservations,
  formatToolCalls,
} from "./prompts.js";
import type { MCPTool } from "../mcp/client.js";
import type { ToolExecutor } from "../mcp/client.js";

export interface AgentLoopConfig {
  maxIterations: number;
  autoRecover: boolean;
  streamCallback?: (message: AgentMessage) => void;
  toolCallCallback?: (call: ToolCall) => void;
}

export interface PlanStep {
  tool: string;
  action?: string;
  arguments: Record<string, unknown>;
}

export interface Plan {
  steps: string[];
  firstStep: PlanStep;
}

export interface ReflectionResult {
  nextAction: PlanStep | null;
  reasoning: string;
  shouldContinue: boolean;
}

export interface RecoveryResult {
  alternativeAction: PlanStep | null;
  strategy: string;
  abandonTask: boolean;
}

export class AgentLoop {
  private model: LanguageModel;
  private executor: ToolExecutor;
  private config: AgentLoopConfig;
  private tools: MCPTool[] = [];
  private abortController: AbortController | null = null;

  constructor(
    model: LanguageModel,
    executor: ToolExecutor,
    config: Partial<AgentLoopConfig> = {}
  ) {
    this.model = model;
    this.executor = executor;
    this.config = {
      maxIterations: config.maxIterations ?? 50,
      autoRecover: config.autoRecover ?? true,
      streamCallback: config.streamCallback,
      toolCallCallback: config.toolCallCallback,
    };
  }

  setTools(tools: MCPTool[]): void {
    this.tools = tools;
  }

  async start(goal: string): Promise<ExecutionContext> {
    const context = createExecutionContext(goal, this.config.maxIterations);
    this.abortController = new AbortController();

    this.emitMessage({
      id: generateId(),
      role: "system",
      content: `Starting agent for goal: ${goal}`,
      timestamp: Date.now(),
    });

    try {
      await this.runLoop(context);
    } catch (error) {
      context.metadata["error"] = error instanceof Error ? error.message : String(error);
    }

    return context;
  }

  stop(): void {
    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
    }
  }

  private async runLoop(context: ExecutionContext): Promise<void> {
    while (context.iterations < context.maxIterations) {
      if (this.abortController?.signal.aborted) {
        break;
      }

      context.iterations++;
      context.updatedAt = Date.now();

      if (context.iterations === 1) {
        await this.planPhase(context);
      } else {
        await this.reflectPhase(context);
      }

      if (context.pendingToolCalls.length === 0) {
        break;
      }

      await this.actPhase(context);

      if (context.pendingToolCalls.length === 0) {
        break;
      }
    }
  }

  private async planPhase(context: ExecutionContext): Promise<void> {
    const planningPrompt = PLANNING_PROMPT.replace(
      "{goal}",
      context.userGoal
    ).replace("{tools}", formatToolsForPrompt(this.tools));

    const messages: CoreMessage[] = [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: planningPrompt },
    ];

    const { text } = await generateText({
      model: this.model,
      messages,
      temperature: 0.3,
    });

    try {
      const plan = this.parseJSON<Plan>(text);
      context.currentPlan = plan.steps;

      const firstCall = createToolCall(
        plan.firstStep.tool,
        plan.firstStep.arguments,
        plan.firstStep.action
      );
      context.pendingToolCalls.push(firstCall);

      this.emitMessage({
        id: generateId(),
        role: "assistant",
        content: `Plan created with ${plan.steps.length} steps:\n${plan.steps.map((s, i) => `${i + 1}. ${s}`).join("\n")}`,
        timestamp: Date.now(),
      });
    } catch (error) {
      this.emitMessage({
        id: generateId(),
        role: "system",
        content: `Failed to parse plan: ${error instanceof Error ? error.message : String(error)}. Trying direct execution.`,
        timestamp: Date.now(),
      });

      const fallbackCall = createToolCall("docs", { query: context.userGoal }, "search");
      context.pendingToolCalls.push(fallbackCall);
    }
  }

  private async reflectPhase(context: ExecutionContext): Promise<void> {
    const observations = context.observations.slice(-5);
    const completedCalls = context.completedToolCalls.slice(-3);

    const reflectionPrompt = REFLECTION_PROMPT.replace("{observations}", formatObservations(observations))
      .replace("{completedCalls}", formatToolCalls(completedCalls))
      .replace("{remainingPlan}", context.currentPlan.slice(context.completedToolCalls.length).join("\n") || "None")
      .replace("{goal}", context.userGoal);

    const messages: CoreMessage[] = [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: reflectionPrompt },
    ];

    const { text } = await generateText({
      model: this.model,
      messages,
      temperature: 0.3,
    });

    try {
      const result = this.parseJSON<ReflectionResult>(text);

      this.emitMessage({
        id: generateId(),
        role: "assistant",
        content: result.reasoning,
        timestamp: Date.now(),
      });

      if (!result.shouldContinue || !result.nextAction) {
        context.metadata["completed"] = true;
        context.metadata["completionReason"] = result.shouldContinue ? "task_complete" : "no_next_action";
        return;
      }

      const nextCall = createToolCall(
        result.nextAction.tool,
        result.nextAction.arguments,
        result.nextAction.action
      );
      context.pendingToolCalls.push(nextCall);
    } catch (error) {
      this.emitMessage({
        id: generateId(),
        role: "system",
        content: `Failed to parse reflection: ${error instanceof Error ? error.message : String(error)}`,
        timestamp: Date.now(),
      });

      if (context.pendingToolCalls.length === 0) {
        context.metadata["completed"] = true;
        context.metadata["completionReason"] = "reflection_failed";
      }
    }
  }

  private async actPhase(context: ExecutionContext): Promise<void> {
    const call = context.pendingToolCalls.shift();
    if (!call) return;

    const startTime = Date.now();

    this.emitMessage({
      id: generateId(),
      role: "system",
      content: `Executing: ${call.action ? `${call.tool}.${call.action}` : call.tool}`,
      timestamp: Date.now(),
    });

    try {
      const result = await this.executeTool(call);
      call.result = result;
      call.duration = Date.now() - startTime;

      context.completedToolCalls.push(call);

      const observation = observeResult(call);
      context.observations.push(observation);

      this.emitMessage({
        id: generateId(),
        role: "tool",
        content: observation.message,
        toolCalls: [call],
        timestamp: Date.now(),
      });

      if (this.config.toolCallCallback) {
        this.config.toolCallCallback(call);
      }

      if (!observation.success && this.config.autoRecover) {
        await this.recoverPhase(context, call);
      }
    } catch (error) {
      call.error = error instanceof Error ? error.message : String(error);
      call.duration = Date.now() - startTime;
      context.completedToolCalls.push(call);
      context.observations.push(observeResult(call));

      this.emitMessage({
        id: generateId(),
        role: "system",
        content: `Error: ${call.error}`,
        toolCalls: [call],
        timestamp: Date.now(),
      });

      if (this.config.autoRecover) {
        await this.recoverPhase(context, call);
      }
    }
  }

  private async executeTool(call: ToolCall): Promise<unknown> {
    return this.executor(call.tool, call.action, call.arguments);
  }

  private async recoverPhase(context: ExecutionContext, failedCall: ToolCall): Promise<void> {
    const previousResults = context.completedToolCalls
      .slice(-3)
      .map((c) => c.result)
      .join("\n");

    const recoveryPrompt = RECOVERY_PROMPT.replace("{failedCall}", `${failedCall.tool}.${failedCall.action || "default"}`)
      .replace("{error}", failedCall.error || "Unknown error")
      .replace("{previousResults}", previousResults || "None")
      .replace("{tools}", formatToolsForPrompt(this.tools));

    const messages: CoreMessage[] = [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: recoveryPrompt },
    ];

    try {
      const { text } = await generateText({
        model: this.model,
        messages,
        temperature: 0.5,
      });

      const result = this.parseJSON<RecoveryResult>(text);

      if (result.abandonTask) {
        context.metadata["completed"] = true;
        context.metadata["completionReason"] = "task_abandoned";
        context.metadata["abandonReason"] = result.strategy;
        this.emitMessage({
          id: generateId(),
          role: "system",
          content: `Task abandoned: ${result.strategy}`,
          timestamp: Date.now(),
        });
        return;
      }

      if (result.alternativeAction) {
        const recoveryCall = createToolCall(
          result.alternativeAction.tool,
          result.alternativeAction.arguments,
          result.alternativeAction.action
        );
        context.pendingToolCalls.unshift(recoveryCall);

        this.emitMessage({
          id: generateId(),
          role: "system",
          content: `Recovery strategy: ${result.strategy}`,
          timestamp: Date.now(),
        });
      }
    } catch (error) {
      this.emitMessage({
        id: generateId(),
        role: "system",
        content: `Recovery failed: ${error instanceof Error ? error.message : String(error)}`,
        timestamp: Date.now(),
      });
    }
  }

  private parseJSON<T>(text: string): T {
    const jsonMatch = text.match(/```json\n([\s\S]*?)\n```/) || text.match(/```\n([\s\S]*?)\n```/);
    const jsonStr = jsonMatch ? jsonMatch[1] : text;
    return JSON.parse(jsonStr.trim()) as T;
  }

  private emitMessage(message: AgentMessage): void {
    if (this.config.streamCallback) {
      this.config.streamCallback(message);
    }
  }
}
