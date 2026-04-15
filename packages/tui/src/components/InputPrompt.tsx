import React from "react";
import { Box, Text } from "ink";

export interface InputPromptProps {
  value: string;
  disabled?: boolean;
  placeholder?: string;
}

const MAX_WIDTH = 60;

export function InputPrompt({
  value,
  disabled = false,
  placeholder = "> ",
}: InputPromptProps): React.ReactElement {
  const displayValue = value || placeholder;
  const cursor = !disabled && value === "" ? "█" : "";

  const truncatedValue =
    displayValue.length > MAX_WIDTH
      ? "..." + displayValue.slice(-(MAX_WIDTH - 3))
      : displayValue;

  return (
    <Box borderStyle="single" padding={1}>
      <Text bold color={disabled ? "gray" : "green"}>
        {"> "}
      </Text>
      <Text color={disabled ? "gray" : "white"}>
        {truncatedValue}
      </Text>
      {!disabled && <Text color="cyan">{cursor}</Text>}
      {disabled && (
        <Text dimColor italic>
          {" "}(waiting for agent to finish)
        </Text>
      )}
    </Box>
  );
}
