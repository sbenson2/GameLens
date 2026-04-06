/** Rate limiting via KV counters */

import type { Env, RateLimitEntry } from "./types.js";

const WINDOW_MS = 60 * 60 * 1000; // 1 hour
const FREE_LIMIT = 100;
const PRO_LIMIT = 1000;

const RATE_KEY_PREFIX = "rate:";

interface RateLimitResult {
  allowed: boolean;
  limit: number;
  remaining: number;
  resetAt: number; // epoch ms
}

/** Check and increment rate limit counter */
export async function checkRateLimit(
  identifier: string, // IP for free, license key for pro
  tier: "free" | "pro",
  env: Env
): Promise<RateLimitResult> {
  const limit = tier === "pro" ? PRO_LIMIT : FREE_LIMIT;
  const key = `${RATE_KEY_PREFIX}${identifier}`;
  const now = Date.now();

  try {
    const entry = await env.CACHE_KV.get<RateLimitEntry>(key, "json");

    if (entry && now - entry.windowStart < WINDOW_MS) {
      // Within current window
      const newCount = entry.count + 1;
      const resetAt = entry.windowStart + WINDOW_MS;

      if (newCount > limit) {
        return { allowed: false, limit, remaining: 0, resetAt };
      }

      // Increment counter
      await env.CACHE_KV.put(
        key,
        JSON.stringify({ count: newCount, windowStart: entry.windowStart }),
        { expirationTtl: Math.ceil(WINDOW_MS / 1000) }
      );

      return {
        allowed: true,
        limit,
        remaining: limit - newCount,
        resetAt,
      };
    }

    // New window
    const windowStart = now;
    await env.CACHE_KV.put(
      key,
      JSON.stringify({ count: 1, windowStart }),
      { expirationTtl: Math.ceil(WINDOW_MS / 1000) }
    );

    return {
      allowed: true,
      limit,
      remaining: limit - 1,
      resetAt: windowStart + WINDOW_MS,
    };
  } catch {
    // KV error — allow the request (fail open)
    return { allowed: true, limit, remaining: limit, resetAt: now + WINDOW_MS };
  }
}

/** Add rate limit headers to a response */
export function addRateLimitHeaders(
  response: Response,
  result: RateLimitResult
): Response {
  const headers = new Headers(response.headers);
  headers.set("X-RateLimit-Limit", String(result.limit));
  headers.set("X-RateLimit-Remaining", String(Math.max(0, result.remaining)));
  headers.set(
    "X-RateLimit-Reset",
    String(Math.ceil(result.resetAt / 1000))
  );

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}
