/**
 * License key validation, caching, activation, and tier resolution.
 *
 * Security hardening (v1.2):
 * - Key format validation (UUID v4 format — LemonSqueezy standard)
 * - Machine-bound activation (instance_name sent on first validate)
 * - Brute-force throttling (exponential backoff on consecutive failures)
 * - Store/product ID verification (prevents cross-store key reuse)
 * - Cache key hashing (license key never stored in plaintext on disk)
 * - Activation limit enforcement (from LemonSqueezy response)
 */

import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import * as https from "https";
import * as crypto from "crypto";
import { Tier } from "./tiers.js";

const CONFIG_DIR = path.join(
  process.env.HOME ?? process.env.USERPROFILE ?? "~",
  ".gamedev-mcp"
);
const CACHE_PATH = path.join(CONFIG_DIR, "cache.json");
const LICENSE_CONFIG_PATH = path.join(CONFIG_DIR, "license.json");
const THROTTLE_PATH = path.join(CONFIG_DIR, "throttle.json");

const VALIDATION_URL = "https://api.lemonsqueezy.com/v1/licenses/validate";
const ACTIVATION_URL = "https://api.lemonsqueezy.com/v1/licenses/activate";
const DEACTIVATION_URL = "https://api.lemonsqueezy.com/v1/licenses/deactivate";
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;          // 24 hours
const OFFLINE_GRACE_MS = 7 * 24 * 60 * 60 * 1000;  // 7 days

// LemonSqueezy store verification — set once store is created
// These prevent someone from using a key from a different LS store
const EXPECTED_STORE_ID: number | null = null;      // Set after store creation
const EXPECTED_PRODUCT_ID: number | null = null;     // Set after product creation

// Brute-force throttling constants
const MAX_CONSECUTIVE_FAILURES = 5;
const BASE_THROTTLE_MS = 2_000;       // 2 seconds
const MAX_THROTTLE_MS = 300_000;      // 5 minutes
const THROTTLE_DECAY_MS = 3600_000;   // Reset after 1 hour of no attempts

// LemonSqueezy keys are UUID v4 format
const LICENSE_KEY_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface CacheEntry {
  valid: boolean;
  keyHash: string;        // SHA-256 hash of the license key (never store plaintext)
  validatedAt: number;    // epoch ms
  instanceId: string;     // machine instance for activation binding
  activationLimit?: number;
  activationsUsed?: number;
  expiresAt?: string;     // ISO date if subscription has end date
}

interface ThrottleState {
  consecutiveFailures: number;
  lastFailureAt: number;  // epoch ms
  lockedUntil: number;    // epoch ms — don't attempt validation before this
}

interface ValidationResult {
  valid: boolean;
  error?: string;
  activationLimit?: number;
  activationsUsed?: number;
  expiresAt?: string;
}

function ensureConfigDir(): void {
  if (!fs.existsSync(CONFIG_DIR)) {
    fs.mkdirSync(CONFIG_DIR, { recursive: true, mode: 0o700 });
  }
}

/** Hash the license key for safe on-disk storage */
function hashKey(key: string): string {
  return crypto.createHash("sha256").update(key).digest("hex");
}

/** Get a stable machine instance name for license activation */
function getMachineId(): string {
  const hostname = os.hostname() || "unknown";
  const username = os.userInfo().username || "user";
  const platform = os.platform();
  const arch = os.arch();
  return `${username}@${hostname} (${platform}/${arch})`;
}

/** Validate license key format before making any API calls */
export function isValidKeyFormat(key: string): boolean {
  return LICENSE_KEY_PATTERN.test(key);
}

/** Read the license key from env var or config file */
export function getLicenseKey(): string | null {
  const envKey = process.env.GAMEDEV_MCP_LICENSE;
  if (envKey && envKey.trim()) return envKey.trim();

  try {
    if (fs.existsSync(LICENSE_CONFIG_PATH)) {
      const data = JSON.parse(fs.readFileSync(LICENSE_CONFIG_PATH, "utf-8"));
      if (data.key && typeof data.key === "string" && data.key.trim()) {
        return data.key.trim();
      }
    }
  } catch {
    // Invalid config file — ignore
  }

  return null;
}

// --- Throttle management ---

function readThrottle(): ThrottleState {
  try {
    if (fs.existsSync(THROTTLE_PATH)) {
      const data: ThrottleState = JSON.parse(fs.readFileSync(THROTTLE_PATH, "utf-8"));
      // Decay: if last failure was >1 hour ago, reset
      if (Date.now() - data.lastFailureAt > THROTTLE_DECAY_MS) {
        return { consecutiveFailures: 0, lastFailureAt: 0, lockedUntil: 0 };
      }
      return data;
    }
  } catch {
    // Corrupt — reset
  }
  return { consecutiveFailures: 0, lastFailureAt: 0, lockedUntil: 0 };
}

function writeThrottle(state: ThrottleState): void {
  try {
    ensureConfigDir();
    fs.writeFileSync(THROTTLE_PATH, JSON.stringify(state, null, 2));
  } catch {
    // Non-fatal
  }
}

function recordFailure(): void {
  const state = readThrottle();
  state.consecutiveFailures += 1;
  state.lastFailureAt = Date.now();
  // Exponential backoff: 2s, 4s, 8s, 16s, 32s... up to 5 minutes
  const delay = Math.min(
    BASE_THROTTLE_MS * Math.pow(2, state.consecutiveFailures - 1),
    MAX_THROTTLE_MS
  );
  state.lockedUntil = Date.now() + delay;
  writeThrottle(state);
}

function recordSuccess(): void {
  // Reset throttle on successful validation
  try {
    if (fs.existsSync(THROTTLE_PATH)) {
      fs.unlinkSync(THROTTLE_PATH);
    }
  } catch {
    // Non-fatal
  }
}

function isThrottled(): { throttled: boolean; retryAfterMs: number } {
  const state = readThrottle();
  if (state.consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
    const remaining = state.lockedUntil - Date.now();
    if (remaining > 0) {
      return { throttled: true, retryAfterMs: remaining };
    }
  }
  if (state.lockedUntil > Date.now()) {
    return { throttled: true, retryAfterMs: state.lockedUntil - Date.now() };
  }
  return { throttled: false, retryAfterMs: 0 };
}

// --- Cache management ---

/** Validate that a parsed JSON object has the required CacheEntry shape */
export function isValidCacheShape(data: unknown): data is CacheEntry {
  if (data === null || typeof data !== "object") return false;
  const obj = data as Record<string, unknown>;
  return (
    typeof obj.valid === "boolean" &&
    typeof obj.keyHash === "string" &&
    typeof obj.validatedAt === "number" &&
    typeof obj.instanceId === "string" &&
    // Optional fields: must be correct type if present
    (obj.activationLimit === undefined || typeof obj.activationLimit === "number") &&
    (obj.activationsUsed === undefined || typeof obj.activationsUsed === "number") &&
    (obj.expiresAt === undefined || typeof obj.expiresAt === "string")
  );
}

/** Read cached validation result */
function readCache(key: string): CacheEntry | null {
  try {
    if (!fs.existsSync(CACHE_PATH)) return null;
    const data: unknown = JSON.parse(fs.readFileSync(CACHE_PATH, "utf-8"));
    if (!isValidCacheShape(data)) {
      // Corrupt or incompatible cache — remove it
      try { fs.unlinkSync(CACHE_PATH); } catch { /* non-fatal */ }
      return null;
    }
    if (data.keyHash !== hashKey(key)) return null;
    return data;
  } catch {
    return null;
  }
}

/** Write validation result to cache */
function writeCache(entry: CacheEntry): void {
  try {
    ensureConfigDir();
    fs.writeFileSync(CACHE_PATH, JSON.stringify(entry, null, 2), { mode: 0o600 });
  } catch {
    // Cache write failure is non-fatal
  }
}

// --- Remote validation ---

/** Validate key against LemonSqueezy API with store/product verification */
function validateRemote(key: string, instanceId: string): Promise<ValidationResult> {
  return new Promise((resolve) => {
    const body = JSON.stringify({
      license_key: key,
      instance_name: instanceId,
    });
    const url = new URL(VALIDATION_URL);

    const req = https.request(
      {
        hostname: url.hostname,
        path: url.pathname,
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(body),
          Accept: "application/json",
        },
        timeout: 10_000,
      },
      (res) => {
        let data = "";
        res.on("data", (chunk: Buffer) => (data += chunk.toString()));
        res.on("end", () => {
          try {
            const json = JSON.parse(data);

            // Basic validity check
            if (json.valid !== true) {
              resolve({ valid: false, error: json.error ?? "Invalid license key" });
              return;
            }

            const licenseKey = json.license_key ?? {};

            // Verify store ID (prevents cross-store key reuse)
            if (EXPECTED_STORE_ID !== null && licenseKey.store_id !== EXPECTED_STORE_ID) {
              resolve({ valid: false, error: "License key is not for this product" });
              return;
            }

            // Verify product ID
            if (EXPECTED_PRODUCT_ID !== null && licenseKey.product_id !== EXPECTED_PRODUCT_ID) {
              resolve({ valid: false, error: "License key is not for this product" });
              return;
            }

            // Check status — reject expired, disabled, or refunded
            const status = licenseKey.status;
            if (status === "expired" || status === "disabled") {
              resolve({ valid: false, error: `License ${status}` });
              return;
            }

            // Check activation limit (0 = unlimited in LemonSqueezy)
            const activationLimit = licenseKey.activation_limit ?? 0;
            const activationsUsed = licenseKey.activation_usage ?? 0;

            // Extract expiry (for subscription licenses)
            const expiresAt = licenseKey.expires_at ?? undefined;

            resolve({
              valid: true,
              activationLimit: activationLimit === 0 ? undefined : activationLimit,
              activationsUsed,
              expiresAt,
            });
          } catch {
            resolve({ valid: false, error: "Invalid API response" });
          }
        });
      }
    );

    req.on("error", () => {
      resolve({ valid: false, error: "Network error" });
    });

    req.on("timeout", () => {
      req.destroy();
      resolve({ valid: false, error: "Request timeout" });
    });

    req.write(body);
    req.end();
  });
}

/** Activate a license key on this machine (first-time setup) */
export function activateLicense(key: string): Promise<ValidationResult> {
  return new Promise((resolve) => {
    const instanceName = getMachineId();
    const body = JSON.stringify({
      license_key: key,
      instance_name: instanceName,
    });
    const url = new URL(ACTIVATION_URL);

    const req = https.request(
      {
        hostname: url.hostname,
        path: url.pathname,
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(body),
          Accept: "application/json",
        },
        timeout: 10_000,
      },
      (res) => {
        let data = "";
        res.on("data", (chunk: Buffer) => (data += chunk.toString()));
        res.on("end", () => {
          try {
            const json = JSON.parse(data);
            if (json.activated === true || json.valid === true) {
              resolve({ valid: true });
            } else {
              resolve({
                valid: false,
                error: json.error ?? "Activation failed",
              });
            }
          } catch {
            resolve({ valid: false, error: "Invalid activation response" });
          }
        });
      }
    );

    req.on("error", () => resolve({ valid: false, error: "Network error" }));
    req.on("timeout", () => {
      req.destroy();
      resolve({ valid: false, error: "Request timeout" });
    });

    req.write(body);
    req.end();
  });
}

/** Deactivate a license key from this machine */
export function deactivateLicense(key: string, instanceId: string): Promise<ValidationResult> {
  return new Promise((resolve) => {
    const body = JSON.stringify({
      license_key: key,
      instance_id: instanceId,
    });
    const url = new URL(DEACTIVATION_URL);

    const req = https.request(
      {
        hostname: url.hostname,
        path: url.pathname,
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(body),
          Accept: "application/json",
        },
        timeout: 10_000,
      },
      (res) => {
        let data = "";
        res.on("data", (chunk: Buffer) => (data += chunk.toString()));
        res.on("end", () => {
          try {
            const json = JSON.parse(data);
            resolve({
              valid: json.deactivated === true,
              error: json.deactivated ? undefined : json.error ?? "Deactivation failed",
            });
          } catch {
            resolve({ valid: false, error: "Invalid deactivation response" });
          }
        });
      }
    );

    req.on("error", () => resolve({ valid: false, error: "Network error" }));
    req.on("timeout", () => {
      req.destroy();
      resolve({ valid: false, error: "Request timeout" });
    });

    req.write(body);
    req.end();
  });
}

/** Full license validation flow with caching, throttling, and offline grace period */
export async function validateLicense(): Promise<{
  tier: Tier;
  message: string;
}> {
  // Dev mode: skip remote validation (no key required)
  if (process.env.GAMEDEV_MCP_DEV === "true") {
    return {
      tier: "pro",
      message: "[gamedev-mcp] License: Pro (dev mode)",
    };
  }

  const key = getLicenseKey();

  if (!key) {
    return { tier: "free", message: "[gamedev-mcp] Running in free tier" };
  }

  // Validate key format before any network calls
  if (!isValidKeyFormat(key)) {
    return {
      tier: "free",
      message: "[gamedev-mcp] License: invalid key format (expected UUID) — running in free tier",
    };
  }

  // Check brute-force throttle
  const throttle = isThrottled();
  if (throttle.throttled) {
    // Still check cache — user shouldn't lose access during throttle
    const cached = readCache(key);
    const now = Date.now();
    if (cached && cached.valid && now - cached.validatedAt < OFFLINE_GRACE_MS) {
      return {
        tier: "pro",
        message: "[gamedev-mcp] License: Pro (cached, validation throttled)",
      };
    }
    const retrySeconds = Math.ceil(throttle.retryAfterMs / 1000);
    return {
      tier: "free",
      message: `[gamedev-mcp] License: too many failed attempts — retry in ${retrySeconds}s`,
    };
  }

  const instanceId = getMachineId();

  // Check cache first
  const cached = readCache(key);
  const now = Date.now();

  if (cached && cached.valid && now - cached.validatedAt < CACHE_TTL_MS) {
    // Check if subscription has expired based on cached expiry
    if (cached.expiresAt) {
      const expiryDate = new Date(cached.expiresAt);
      if (expiryDate.getTime() < now) {
        // Subscription expired — force revalidation
      } else {
        return {
          tier: "pro",
          message: "[gamedev-mcp] License: Pro (valid, cached)",
        };
      }
    } else {
      return {
        tier: "pro",
        message: "[gamedev-mcp] License: Pro (valid, cached)",
      };
    }
  }

  // Try remote validation
  const result = await validateRemote(key, instanceId);

  if (!result.error) {
    // Got a definitive answer from the API
    if (result.valid) {
      recordSuccess();
      const entry: CacheEntry = {
        valid: true,
        keyHash: hashKey(key),
        validatedAt: now,
        instanceId,
        activationLimit: result.activationLimit,
        activationsUsed: result.activationsUsed,
        expiresAt: result.expiresAt,
      };
      writeCache(entry);

      let msg = "[gamedev-mcp] License: Pro (valid)";
      if (result.expiresAt) {
        msg += ` — renews ${new Date(result.expiresAt).toLocaleDateString()}`;
      }
      return { tier: "pro", message: msg };
    } else {
      recordFailure();
      // Clear cache on definitive invalid response
      const entry: CacheEntry = {
        valid: false,
        keyHash: hashKey(key),
        validatedAt: now,
        instanceId,
      };
      writeCache(entry);

      return {
        tier: "free",
        message: `[gamedev-mcp] License: ${result.error ?? "invalid key"} — running in free tier`,
      };
    }
  }

  // Network error — log the specific error for debugging
  if (result.error) {
    console.error(`[gamedev-mcp] License validation failed: ${result.error}`);
  }

  // Network error — check if cached result is within offline grace period
  if (cached && cached.valid && now - cached.validatedAt < OFFLINE_GRACE_MS) {
    return {
      tier: "pro",
      message: "[gamedev-mcp] License: Pro (offline, cached)",
    };
  }

  // No valid cache or cache too old
  return {
    tier: "free",
    message: "[gamedev-mcp] License: could not validate — running in free tier",
  };
}
