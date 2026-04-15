import React, { useEffect, useRef } from "react";
import { Box, Text } from "ink";
import type { AgentMessage } from "../agent/context.js";

export interface ChatPanelProps {
  messages: AgentMessage[];
}

const MAX_VISIBLE_MESSAGES = 50;

export function ChatPanel({ messages }: ChatPanelProps): React.ReactElement {
  const scrollRef = useRef<number>(messages.length);

  useEffect(() => {
    if (messages.length > scrollRef.current) {
      scrollRef.current = messages.length;
    }
  }, [messages.length]);

  const visibleMessages = messages.slice(-MAX_VISIBLE_MESSAGES);

  const roleColors: Record<string, string> = {
    user: "cyan",
    assistant: "green",
    system: "yellow",
    tool: "magenta",
  };

  const roleLabels: Record<string, string> = {
    user: "You",
    assistant: "Assistant",
    system: "System",
    tool: "Tool",
  };

  return (
    <Box flexDirection="column" overflow="hidden">
      {visibleMessages.length === 0 ? (
        <Box justifyContent="center" alignItems="center" flexGrow={1}>
          <Text dimColor italic>
            Start a conversation about your game project...
          </Text>
        </Box>
      ) : (
        visibleMessages.map((message) => (
          <MessageBlock
            key={message.id}
            message={message}
            roleColor={roleColors[message.role] || "white"}
            roleLabel={roleLabels[message.role] || message.role}
          />
        ))
      )}
    </Box>
  );
}

interface MessageBlockProps {
  message: AgentMessage;
  roleColor: string;
  roleLabel: string;
}

function MessageBlock({ message, roleColor, roleLabel }: MessageBlockProps): React.ReactElement {
  const lines = message.content.split("\n");

  return (
    <Box flexDirection="column" padding={1}>
      <Box>
        <Text bold color={roleColor}>
          {roleLabel}
        </Text>
        <Text dimColor> — {new Date(message.timestamp).toLocaleTimeString()}</Text>
      </Box>
      {lines.map((line, i) => (
        <Text key={i}>{line}</Text>
      ))}
    </Box>
  );
}
