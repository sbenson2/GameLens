/**
 * Centralized configuration constants — values extracted from across the codebase.
 */

import path from "node:path";

/** User config/data dir (~/.gamelens). Canonical home for all persisted state. */
export const CONFIG_DIR = path.join(
  process.env.HOME ?? process.env.USERPROFILE ?? "~",
  ".gamelens",
);

export const CONFIG = {
  /** Max concurrent tool calls allowed (tool-registry.ts) */
  MAX_CONCURRENT_TOOLS: 8,
} as const;
