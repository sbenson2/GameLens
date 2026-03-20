/** Local rate limiting for free tier — daily search counter with filesystem persistence */

import * as fs from "fs";
import * as path from "path";

const CONFIG_DIR = path.join(
  process.env.HOME ?? process.env.USERPROFILE ?? "~",
  ".gamedev-mcp"
);
const USAGE_PATH = path.join(CONFIG_DIR, "usage.json");

const FREE_DAILY_SEARCH_LIMIT = 50;
const FREE_DAILY_GETDOC_LIMIT = 30;

interface DailyUsage {
  date: string; // YYYY-MM-DD
  searches: number;
  getDocs: number;
}

function todayKey(): string {
  return new Date().toISOString().slice(0, 10);
}

function ensureConfigDir(): void {
  if (!fs.existsSync(CONFIG_DIR)) {
    fs.mkdirSync(CONFIG_DIR, { recursive: true });
  }
}

function readUsage(): DailyUsage {
  const today = todayKey();
  try {
    if (fs.existsSync(USAGE_PATH)) {
      const data: DailyUsage = JSON.parse(
        fs.readFileSync(USAGE_PATH, "utf-8")
      );
      if (data.date === today) return data;
    }
  } catch {
    // Corrupt file — reset
  }
  return { date: today, searches: 0, getDocs: 0 };
}

function writeUsage(usage: DailyUsage): void {
  try {
    ensureConfigDir();
    fs.writeFileSync(USAGE_PATH, JSON.stringify(usage, null, 2));
  } catch {
    // Non-fatal — usage tracking failure doesn't block the user
  }
}

export interface RateLimitResult {
  allowed: boolean;
  used: number;
  limit: number;
  remaining: number;
  resetsAt: string; // human-readable "tomorrow" or ISO date
}

/** Check and increment daily search counter. Returns remaining budget. */
export function checkSearchLimit(tier: "free" | "pro"): RateLimitResult {
  if (tier === "pro") {
    return {
      allowed: true,
      used: 0,
      limit: Infinity,
      remaining: Infinity,
      resetsAt: "unlimited",
    };
  }

  const usage = readUsage();
  const limit = FREE_DAILY_SEARCH_LIMIT;

  if (usage.searches >= limit) {
    return {
      allowed: false,
      used: usage.searches,
      limit,
      remaining: 0,
      resetsAt: "midnight (local time)",
    };
  }

  // Increment
  usage.searches += 1;
  writeUsage(usage);

  return {
    allowed: true,
    used: usage.searches,
    limit,
    remaining: limit - usage.searches,
    resetsAt: "midnight (local time)",
  };
}

/** Check and increment daily get_doc counter for free tier. */
export function checkGetDocLimit(tier: "free" | "pro"): RateLimitResult {
  if (tier === "pro") {
    return {
      allowed: true,
      used: 0,
      limit: Infinity,
      remaining: Infinity,
      resetsAt: "unlimited",
    };
  }

  const usage = readUsage();
  const limit = FREE_DAILY_GETDOC_LIMIT;

  if (usage.getDocs >= limit) {
    return {
      allowed: false,
      used: usage.getDocs,
      limit,
      remaining: 0,
      resetsAt: "midnight (local time)",
    };
  }

  usage.getDocs += 1;
  writeUsage(usage);

  return {
    allowed: true,
    used: usage.getDocs,
    limit,
    remaining: limit - usage.getDocs,
    resetsAt: "midnight (local time)",
  };
}

/** Get current usage stats without incrementing (for license_info display). */
export function getUsageStats(tier: "free" | "pro"): {
  searches: { used: number; limit: number | "unlimited" };
  getDocs: { used: number; limit: number | "unlimited" };
} {
  if (tier === "pro") {
    return {
      searches: { used: 0, limit: "unlimited" },
      getDocs: { used: 0, limit: "unlimited" },
    };
  }

  const usage = readUsage();
  return {
    searches: { used: usage.searches, limit: FREE_DAILY_SEARCH_LIMIT },
    getDocs: { used: usage.getDocs, limit: FREE_DAILY_GETDOC_LIMIT },
  };
}
