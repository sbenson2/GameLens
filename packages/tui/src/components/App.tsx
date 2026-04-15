import React, { useState, useEffect } from "react";
import { Box, Text, useInput, useStdout } from "ink";
import { StatusBar } from "./StatusBar.js";
import { ChatPanel } from "./ChatPanel.js";
import { InputPrompt } from "./InputPrompt.js";
import { ProgressIndicator } from "./ProgressIndicator.js";
import type { AgentMessage } from "../agent/context.js";
import type { ProviderId } from "../providers/manager.js";

export interface AppState {
  messages: AgentMessage[];
  isAgentRunning: boolean;
  isConnected: boolean;
  provider: ProviderId;
  model: string;
  toolCount: number;
  error: string | null;
}

export interface AppProps {
  onSubmit: (input: string) => void;
  onInterrupt: () => void;
  state: AppState;
}

export function App({ onSubmit, onInterrupt, state }: AppProps): React.ReactElement {
  const [inputValue, setInputValue] = useState("");
  const { stdout } = useStdout();
  const [dimensions, setDimensions] = useState({ width: stdout.columns || 80, height: stdout.rows || 24 });

  useEffect(() => {
    const handleResize = () => {
      setDimensions({ width: stdout.columns || 80, height: stdout.rows || 24 });
    };

    handleResize();

    stdout.on("resize", handleResize);
    return () => {
      stdout.off("resize", handleResize);
    };
  }, [stdout]);

  useInput((input, key) => {
    if (key.return) {
      if (inputValue.trim()) {
        onSubmit(inputValue.trim());
        setInputValue("");
      }
    } else if (key.backspace || key.delete) {
      setInputValue((prev) => prev.slice(0, -1));
    } else if (key.escape) {
      if (state.isAgentRunning) {
        onInterrupt();
      }
    } else if (input && !key.ctrl && !key.meta) {
      setInputValue((prev) => prev + input);
    }
  });

  return (
    <Box flexDirection="column" height={dimensions.height} width={dimensions.width}>
      <Box borderStyle="round" padding={0}>
        <Text bold color="cyan">⚡ GameCodex</Text>
        <Text dimColor> — AI Game Dev Assistant</Text>
      </Box>

      <StatusBar
        provider={state.provider}
        model={state.model}
        isConnected={state.isConnected}
        toolCount={state.toolCount}
        isRunning={state.isAgentRunning}
      />

      <Box flexDirection="column" flexGrow={1} borderStyle="single">
        <ChatPanel messages={state.messages} />
      </Box>

      {state.isAgentRunning && (
        <Box paddingLeft={1}>
          <ProgressIndicator />
          <Text dimColor> Press </Text>
          <Text bold inverse> Esc </Text>
          <Text dimColor> to interrupt</Text>
        </Box>
      )}

      <InputPrompt
        value={inputValue}
        disabled={state.isAgentRunning}
        placeholder="Ask about your game project..."
      />

      {state.error && (
        <Box padding={1}>
          <Text bold color="red">Error: </Text>
          <Text color="red">{state.error}</Text>
        </Box>
      )}
    </Box>
  );
}

export default App;
