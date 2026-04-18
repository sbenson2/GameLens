/**
 * Centralized configuration constants — values extracted from across the codebase.
 *
 * Rate limit constants stay in rate-limit.ts (grouped with rate limit logic).
 * License constants stay in license.ts (security-sensitive, co-located).
 */

import path from "node:path";

/** User config/data dir (~/.gamecodex). Canonical home for all persisted state. */
export const CONFIG_DIR = path.join(
  process.env.HOME ?? process.env.USERPROFILE ?? "~",
  ".gamecodex",
);

export const CONFIG = {
  /** Max concurrent tool calls allowed (tool-registry.ts) */
  MAX_CONCURRENT_TOOLS: 8,

  /** Max cached search result entries (search.ts) */
  SEARCH_RESULT_CACHE_SIZE: 100,

  /** Embedding batch size for vector search (vector-search.ts) */
  EMBEDDING_BATCH_SIZE: 8,

  /** Default context window limit in tokens (session-manager.ts) */
  DEFAULT_CONTEXT_LIMIT: 1_000_000,
} as const;
