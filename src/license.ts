/** License key validation, caching, and tier resolution */

import * as fs from "fs";
import * as path from "path";
import * as https from "https";
import { Tier } from "./tiers.js";

const CONFIG_DIR = path.join(
  process.env.HOME ?? process.env.USERPROFILE ?? "~",
  ".gamedev-mcp"
);
const CACHE_PATH = path.join(CONFIG_DIR, "cache.json");
const LICENSE_CONFIG_PATH = path.join(CONFIG_DIR, "license.json");

const VALIDATION_URL = "https://api.lemonsqueezy.com/v1/licenses/validate";
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;          // 24 hours
const OFFLINE_GRACE_MS = 7 * 24 * 60 * 60 * 1000;  // 7 days

interface CacheEntry {
  valid: boolean;
  key: string;
  validatedAt: number; // epoch ms
}

interface ValidationResult {
  valid: boolean;
  error?: string;
}

function ensureConfigDir(): void {
  if (!fs.existsSync(CONFIG_DIR)) {
    fs.mkdirSync(CONFIG_DIR, { recursive: true });
  }
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

/** Read cached validation result */
function readCache(key: string): CacheEntry | null {
  try {
    if (!fs.existsSync(CACHE_PATH)) return null;
    const data: CacheEntry = JSON.parse(fs.readFileSync(CACHE_PATH, "utf-8"));
    if (data.key !== key) return null;
    return data;
  } catch {
    return null;
  }
}

/** Write validation result to cache */
function writeCache(entry: CacheEntry): void {
  try {
    ensureConfigDir();
    fs.writeFileSync(CACHE_PATH, JSON.stringify(entry, null, 2));
  } catch {
    // Cache write failure is non-fatal
  }
}

/** Validate key against LemonSqueezy API */
function validateRemote(key: string): Promise<ValidationResult> {
  return new Promise((resolve) => {
    const body = JSON.stringify({ license_key: key });
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
            resolve({ valid: json.valid === true });
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

/** Full license validation flow with caching and offline grace period */
export async function validateLicense(): Promise<{
  tier: Tier;
  message: string;
}> {
  const key = getLicenseKey();

  if (!key) {
    return { tier: "free", message: "[gamedev-mcp] Running in free tier" };
  }

  // Dev mode: skip remote validation
  if (process.env.GAMEDEV_MCP_DEV === "true") {
    return {
      tier: "pro",
      message: "[gamedev-mcp] License: Pro (dev mode)",
    };
  }

  // Check cache first
  const cached = readCache(key);
  const now = Date.now();

  if (cached && cached.valid && now - cached.validatedAt < CACHE_TTL_MS) {
    return {
      tier: "pro",
      message: "[gamedev-mcp] License: Pro (valid, cached)",
    };
  }

  // Try remote validation
  const result = await validateRemote(key);

  if (!result.error) {
    // Got a definitive answer from the API
    const entry: CacheEntry = { valid: result.valid, key, validatedAt: now };
    writeCache(entry);

    if (result.valid) {
      return {
        tier: "pro",
        message: "[gamedev-mcp] License: Pro (valid)",
      };
    } else {
      return {
        tier: "free",
        message: "[gamedev-mcp] License: invalid key — running in free tier",
      };
    }
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
