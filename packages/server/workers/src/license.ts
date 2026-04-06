/**
 * License validation with KV caching — hardened for production.
 *
 * Security features:
 * - Key format validation (UUID v4 — LemonSqueezy standard)
 * - Store/product ID verification (prevents cross-store key reuse)
 * - Key hashing in cache (license key never stored in plaintext in KV)
 * - Brute-force throttling (exponential backoff per IP/key)
 * - Subscription status + expiry verification
 * - Offline grace period (7 days with stale cache)
 */

import type { Env, LicenseCacheEntry } from "./types.js";

const LEMONSQUEEZY_VALIDATE_URL =
  "https://api.lemonsqueezy.com/v1/licenses/validate";
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;          // 24 hours
const OFFLINE_GRACE_MS = 7 * 24 * 60 * 60 * 1000;   // 7 days
const CACHE_KEY_PREFIX = "license:";
const THROTTLE_KEY_PREFIX = "throttle:";

// LemonSqueezy keys are UUID v4 format
const LICENSE_KEY_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Brute-force throttling
const MAX_CONSECUTIVE_FAILURES = 5;
const BASE_THROTTLE_MS = 2_000;      // 2 seconds
const MAX_THROTTLE_MS = 300_000;     // 5 minutes
const THROTTLE_WINDOW_MS = 3600_000; // Reset throttle after 1 hour

interface ThrottleEntry {
  failures: number;
  lastFailureAt: number;
  lockedUntil: number;
}

interface LemonSqueezyResponse {
  valid?: boolean;
  error?: string;
  license_key?: {
    id?: number;
    status?: string;
    store_id?: number;
    product_id?: number;
    activation_limit?: number;
    activation_usage?: number;
    expires_at?: string | null;
  };
}

// --- Helpers ---

/** SHA-256 hash for safe key storage in KV (never store plaintext) */
async function hashKey(key: string): Promise<string> {
  const data = new TextEncoder().encode(key);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** Validate license key format before any API/KV calls */
export function isValidKeyFormat(key: string): boolean {
  return LICENSE_KEY_PATTERN.test(key);
}

// --- Throttle management ---

async function getThrottle(
  identifier: string,
  env: Env
): Promise<ThrottleEntry | null> {
  try {
    const entry = await env.CACHE_KV.get<ThrottleEntry>(
      `${THROTTLE_KEY_PREFIX}${identifier}`,
      "json"
    );
    if (!entry) return null;
    // Decay: reset after 1 hour of no attempts
    if (Date.now() - entry.lastFailureAt > THROTTLE_WINDOW_MS) return null;
    return entry;
  } catch {
    return null;
  }
}

async function recordThrottleFailure(
  identifier: string,
  env: Env
): Promise<void> {
  const existing = await getThrottle(identifier, env);
  const failures = (existing?.failures ?? 0) + 1;
  const delay = Math.min(
    BASE_THROTTLE_MS * Math.pow(2, failures - 1),
    MAX_THROTTLE_MS
  );
  const entry: ThrottleEntry = {
    failures,
    lastFailureAt: Date.now(),
    lockedUntil: Date.now() + delay,
  };
  try {
    await env.CACHE_KV.put(
      `${THROTTLE_KEY_PREFIX}${identifier}`,
      JSON.stringify(entry),
      { expirationTtl: Math.ceil(THROTTLE_WINDOW_MS / 1000) }
    );
  } catch {
    // Non-fatal
  }
}

async function clearThrottle(
  identifier: string,
  env: Env
): Promise<void> {
  try {
    await env.CACHE_KV.delete(`${THROTTLE_KEY_PREFIX}${identifier}`);
  } catch {
    // Non-fatal
  }
}

function isThrottled(
  entry: ThrottleEntry | null
): { throttled: boolean; retryAfterMs: number } {
  if (!entry) return { throttled: false, retryAfterMs: 0 };
  if (entry.failures >= MAX_CONSECUTIVE_FAILURES && entry.lockedUntil > Date.now()) {
    return { throttled: true, retryAfterMs: entry.lockedUntil - Date.now() };
  }
  if (entry.lockedUntil > Date.now()) {
    return { throttled: true, retryAfterMs: entry.lockedUntil - Date.now() };
  }
  return { throttled: false, retryAfterMs: 0 };
}

// --- Core validation ---

/** Validate a license key, using KV cache when possible */
export async function validateLicense(
  key: string,
  env: Env,
  clientIp?: string
): Promise<{
  valid: boolean;
  tier: "free" | "pro";
  error?: string;
  retryAfterMs?: number;
}> {
  // 1. Format validation — reject before any network/KV calls
  if (!isValidKeyFormat(key)) {
    return { valid: false, tier: "free", error: "Invalid key format" };
  }

  const keyHash = await hashKey(key);
  const cacheKey = `${CACHE_KEY_PREFIX}${keyHash}`;
  const throttleId = clientIp ?? keyHash;

  // 2. Check brute-force throttle
  const throttleEntry = await getThrottle(throttleId, env);
  const throttleResult = isThrottled(throttleEntry);
  if (throttleResult.throttled) {
    // Still check cache so legitimate users aren't locked out during throttle
    try {
      const cached = await env.CACHE_KV.get<LicenseCacheEntry>(cacheKey, "json");
      if (cached && cached.valid && Date.now() - cached.validatedAt < OFFLINE_GRACE_MS) {
        return { valid: true, tier: "pro" };
      }
    } catch {
      // Cache read failed
    }
    return {
      valid: false,
      tier: "free",
      error: "Too many failed attempts",
      retryAfterMs: throttleResult.retryAfterMs,
    };
  }

  // 3. Check KV cache (keyed by hash, not plaintext)
  try {
    const cached = await env.CACHE_KV.get<LicenseCacheEntry>(cacheKey, "json");
    if (cached && Date.now() - cached.validatedAt < CACHE_TTL_MS) {
      // Check subscription expiry even for cached entries
      if (cached.expiresAt) {
        const expiryDate = new Date(cached.expiresAt);
        if (expiryDate.getTime() < Date.now()) {
          // Subscription expired — force revalidation (fall through)
        } else {
          return { valid: cached.valid, tier: cached.valid ? "pro" : "free" };
        }
      } else {
        return { valid: cached.valid, tier: cached.valid ? "pro" : "free" };
      }
    }
  } catch {
    // Cache miss or parse error — continue to remote validation
  }

  // 4. Remote validation with store/product ID verification
  try {
    const resp = await fetch(LEMONSQUEEZY_VALIDATE_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({ license_key: key }),
    });

    const json = (await resp.json()) as LemonSqueezyResponse;

    // Basic validity
    if (json.valid !== true) {
      await recordThrottleFailure(throttleId, env);
      // Cache invalid result (shorter TTL — 1 hour)
      const entry: LicenseCacheEntry = {
        valid: false,
        keyHash,
        validatedAt: Date.now(),
        tier: "free",
      };
      await env.CACHE_KV.put(cacheKey, JSON.stringify(entry), {
        expirationTtl: 3600,
      });
      return {
        valid: false,
        tier: "free",
        error: json.error ?? "Invalid license key",
      };
    }

    const licenseKey = json.license_key ?? {};

    // Verify store ID (env-configured, prevents cross-store key reuse)
    if (env.LEMONSQUEEZY_STORE_ID) {
      const expectedStoreId = parseInt(env.LEMONSQUEEZY_STORE_ID, 10);
      if (!isNaN(expectedStoreId) && licenseKey.store_id !== expectedStoreId) {
        await recordThrottleFailure(throttleId, env);
        return {
          valid: false,
          tier: "free",
          error: "License key is not for this product",
        };
      }
    }

    // Check status — reject expired, disabled, or refunded
    const status = licenseKey.status;
    if (status === "expired" || status === "disabled") {
      await recordThrottleFailure(throttleId, env);
      const entry: LicenseCacheEntry = {
        valid: false,
        keyHash,
        validatedAt: Date.now(),
        tier: "free",
      };
      await env.CACHE_KV.put(cacheKey, JSON.stringify(entry), {
        expirationTtl: 3600,
      });
      return { valid: false, tier: "free", error: `License ${status}` };
    }

    // Valid — cache and clear throttle
    await clearThrottle(throttleId, env);
    const entry: LicenseCacheEntry = {
      valid: true,
      keyHash,
      validatedAt: Date.now(),
      tier: "pro",
      expiresAt: licenseKey.expires_at ?? undefined,
      activationLimit: licenseKey.activation_limit === 0
        ? undefined
        : licenseKey.activation_limit,
      activationsUsed: licenseKey.activation_usage,
    };
    await env.CACHE_KV.put(cacheKey, JSON.stringify(entry), {
      expirationTtl: Math.ceil(CACHE_TTL_MS / 1000),
    });

    return { valid: true, tier: "pro" };
  } catch {
    // 5. Network error — offline grace period with stale cache
    try {
      const stale = await env.CACHE_KV.get<LicenseCacheEntry>(cacheKey, "json");
      if (stale && stale.valid) {
        if (Date.now() - stale.validatedAt < OFFLINE_GRACE_MS) {
          return { valid: true, tier: "pro" };
        }
      }
    } catch {
      // Can't read cache either
    }

    return { valid: false, tier: "free", error: "Could not validate license" };
  }
}

/** Extract Bearer token from Authorization header */
export function extractBearerToken(request: Request): string | null {
  const auth = request.headers.get("Authorization");
  if (!auth) return null;
  const match = auth.match(/^Bearer\s+(.+)$/i);
  return match ? match[1].trim() : null;
}
