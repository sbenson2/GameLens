import React, { useState, useEffect } from "react";
import { Text, Box } from "ink";

const SPINNER_FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠿"];

export function ProgressIndicator(): React.ReactElement {
  const [frame, setFrame] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setFrame((prev) => (prev + 1) % SPINNER_FRAMES.length);
    }, 80);

    return () => clearInterval(interval);
  }, []);

  return (
    <Box>
      <Text color="cyan">{SPINNER_FRAMES[frame]}</Text>
      <Text dimColor> </Text>
    </Box>
  );
}
