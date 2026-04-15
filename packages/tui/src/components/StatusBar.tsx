import React from "react";
import { Box, Text } from "ink";
import type { ProviderId } from "../providers/manager.js";

export interface StatusBarProps {
  provider: ProviderId;
  model: string;
  isConnected: boolean;
  toolCount: number;
  isRunning: boolean;
}

export function StatusBar({
  provider,
  model,
  isConnected,
  toolCount,
  isRunning,
}: StatusBarProps): React.ReactElement {
  const providerColors: Record<ProviderId, string> = {
    anthropic: "cyan",
    openai: "green",
    google: "blue",
    ollama: "yellow",
  };

  const providerLabels: Record<ProviderId, string> = {
    anthropic: "Claude",
    openai: "GPT",
    google: "Gemini",
    ollama: "Ollama",
  };

  return (
    <Box borderStyle="single" padding={1} justifyContent="space-between">
      <Box gap={2}>
        <Box>
          <Text dimColor>Provider: </Text>
          <Text color={providerColors[provider] || "white"}>
            {providerLabels[provider] || provider}
          </Text>
        </Box>
        <Box>
          <Text dimColor>Model: </Text>
          <Text>{model}</Text>
        </Box>
      </Box>

      <Box gap={2}>
        <Box>
          <Text dimColor>Tools: </Text>
          <Text bold color={toolCount > 0 ? "green" : "red"}>
            {toolCount}
          </Text>
        </Box>
        <Box>
          <Text dimColor>MCP: </Text>
          <Text color={isConnected ? "green" : "red"}>
            {isConnected ? "✓" : "✗"}
          </Text>
        </Box>
        {isRunning && (
          <Box>
            <Text bold color="yellow">● RUNNING</Text>
          </Box>
        )}
      </Box>
    </Box>
  );
}
