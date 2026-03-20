/** License validation with KV caching */

import type { Env, LicenseCacheEntry } from "./types.js";

const LEMONSQUEEZY_VALIDATE_URL =
  "https://api.lemonsqueezy.com/v1/licenses/validate";
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
const CACHE_KEY_PREFIX = "license:";

/** Validate a license key, using KV cache when possible */
export async function validateLicense(
  key: string,
  env: Env
): Promise<{ valid: boolean; tier: "free" | "pro" }> {
  // Check KV cache first
  const cacheKey = `${CACHE_KEY_PREFIX}${key}`;
  try {
    const cached = await env.CACHE_KV.get<LicenseCacheEntry>(cacheKey, "json");
    if (cached && Date.now() - cached.validatedAt < CACHE_TTL_MS) {
      return { valid: cached.valid, tier: cached.valid ? "pro" : "free" };
    }
  } catch {
    // Cache miss or parse error — continue to remote validation
  }

  // Remote validation
  try {
    const resp = await fetch(LEMONSQUEEZY_VALIDATE_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({ license_key: key }),
    });

    const json = (await resp.json()) as { valid?: boolean };
    const valid = json.valid === true;

    // Cache the result
    const entry: LicenseCacheEntry = {
      valid,
      key,
      validatedAt: Date.now(),
      tier: valid ? "pro" : "free",
    };
    await env.CACHE_KV.put(cacheKey, JSON.stringify(entry), {
      expirationTtl: Math.ceil(CACHE_TTL_MS / 1000),
    });

    return { valid, tier: valid ? "pro" : "free" };
  } catch {
    // Network error — check if we have a stale cache entry
    try {
      const stale = await env.CACHE_KV.get<LicenseCacheEntry>(cacheKey, "json");
      if (stale && stale.valid) {
        // Offline grace: trust stale cache for up to 7 days
        const OFFLINE_GRACE_MS = 7 * 24 * 60 * 60 * 1000;
        if (Date.now() - stale.validatedAt < OFFLINE_GRACE_MS) {
          return { valid: true, tier: "pro" };
        }
      }
    } catch {
      // Can't read cache either
    }

    return { valid: false, tier: "free" };
  }
}

/** Extract Bearer token from Authorization header */
export function extractBearerToken(request: Request): string | null {
  const auth = request.headers.get("Authorization");
  if (!auth) return null;
  const match = auth.match(/^Bearer\s+(.+)$/i);
  return match ? match[1].trim() : null;
}
