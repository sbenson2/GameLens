import React, { useState, useCallback } from "react";
import { render } from "ink";
import { App, type AppState } from "./components/App.js";
import { AgentLoop } from "./agent/loop.js";
import { GameCodexMCPClient } from "./mcp/client.js";
import { ProviderManager } from "./providers/manager.js";
import { loadConfig } from "./config-loader.js";
import type { AgentMessage } from "./agent/context.js";

async function main() {
  console.log("⚡ GameCodex TUI starting...");

  const config = loadConfig();
  const providerManager = new ProviderManager(config);

  let providerId = config.tui.defaultProvider;
  if (!providerManager.isProviderAvailable(providerId)) {
    const available = providerManager.availableProviders;
    if (available.length > 0) {
      providerId = available[0];
      console.log(`Provider ${config.tui.defaultProvider} not configured, using ${providerId}`);
    } else {
      console.error("No LLM providers configured. Please set up your config at ~/.gamecodex/config.json");
      console.error("Example:");
      console.error(JSON.stringify({
        providers: {
          anthropic: { apiKey: "env:ANTHROPIC_API_KEY" },
          ollama: { baseURL: "http://localhost:11434/v1" }
        }
      }, null, 2));
      process.exit(1);
    }
  }

  const model = providerManager.getModel(providerId);
  const modelId = config.tui.defaultModel || "default";

  const mcpClient = new GameCodexMCPClient();

  try {
    await mcpClient.connect();
  } catch (error) {
    console.warn(`MCP connection failed: ${error instanceof Error ? error.message : String(error)}`);
    console.warn("Continuing without MCP tools...");
  }

  const status = mcpClient.getStatus();
  const executor = mcpClient.getExecutor();

  const agentLoop = new AgentLoop(model, async (toolName, action, args) => {
    try {
      return await executor(toolName, action, args);
    } catch (error) {
      return { error: error instanceof Error ? error.message : String(error) };
    }
  }, {
    maxIterations: config.tui.maxIterations,
    autoRecover: config.tui.autoRecover,
    toolCallCallback: (call) => {
      if (config.tui.showToolCalls) {
        const name = call.action ? `${call.tool}.${call.action}` : call.tool;
        console.log(`  → ${name}`);
      }
    },
  });

  if (status.connected) {
    agentLoop.setTools(mcpClient.getTools());
  }

  const initialState: AppState = {
    messages: [{
      id: "welcome",
      role: "system",
      content: `Welcome to GameCodex! I'm your AI game development assistant.\n\nI can help you with:\n• Project setup and management\n• Game design and architecture\n• Code generation and debugging\n• Documentation across 29 game engines\n\n${status.connected ? `Connected to GameCodex with ${status.toolCount} tools.` : "Running in standalone mode."}\n\nWhat would you like to build?`,
      timestamp: Date.now(),
    }],
    isAgentRunning: false,
    isConnected: status.connected,
    provider: providerId,
    model: modelId,
    toolCount: status.toolCount,
    error: null,
  };

  function AppWrapper(): React.ReactElement {
    const [state, setState] = useState<AppState>(initialState);

    const handleSubmit = useCallback(async (input: string) => {
      if (state.isAgentRunning) return;

      const userMessage: AgentMessage = {
        id: `user-${Date.now()}`,
        role: "user",
        content: input,
        timestamp: Date.now(),
      };

      setState(prev => ({
        ...prev,
        isAgentRunning: true,
        messages: [...prev.messages, userMessage],
        error: null,
      }));

      try {
        const context = await agentLoop.start(input);

        const finalMessage: AgentMessage = {
          id: `final-${Date.now()}`,
          role: "assistant",
          content: context.metadata["completed"]
            ? `Task ${context.metadata["completionReason"] === "task_complete" ? "completed" : "finished"} after ${context.iterations} iterations.`
            : `Stopped after ${context.iterations} iterations.`,
          timestamp: Date.now(),
        };

        setState(prev => ({
          ...prev,
          isAgentRunning: false,
          messages: [...prev.messages, finalMessage],
        }));
      } catch (error) {
        setState(prev => ({
          ...prev,
          isAgentRunning: false,
          error: error instanceof Error ? error.message : String(error),
        }));
      }
    }, [state.isAgentRunning]);

    const handleInterrupt = useCallback(() => {
      agentLoop.stop();
      setState(prev => ({
        ...prev,
        isAgentRunning: false,
        messages: [...prev.messages, {
          id: `interrupt-${Date.now()}`,
          role: "system",
          content: "Agent interrupted by user.",
          timestamp: Date.now(),
        }],
      }));
    }, []);

    return (
      <App
        onSubmit={handleSubmit}
        onInterrupt={handleInterrupt}
        state={state}
      />
    );
  }

  const { unmount } = render(<AppWrapper />, {
    patchConsole: false,
  });

  process.on("SIGINT", async () => {
    agentLoop.stop();
    await mcpClient.disconnect();
    unmount();
    process.exit(0);
  });
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
