#!/usr/bin/env npx ts-node
/**
 * Generate a test license key for local development.
 *
 * Usage:
 *   npx ts-node scripts/generate-test-key.ts
 *
 * The generated key can be used with GAMEDEV_MCP_DEV=true to skip
 * LemonSqueezy validation and run in Pro tier locally.
 */

import * as crypto from "crypto";
import * as fs from "fs";
import * as path from "path";

const key = `GAMEDEV-DEV-${crypto.randomBytes(16).toString("hex").toUpperCase()}`;

const configDir = path.join(
  process.env.HOME ?? process.env.USERPROFILE ?? "~",
  ".gamedev-mcp"
);

if (!fs.existsSync(configDir)) {
  fs.mkdirSync(configDir, { recursive: true });
}

const configPath = path.join(configDir, "license.json");
fs.writeFileSync(configPath, JSON.stringify({ key }, null, 2));

console.log("Generated test license key:");
console.log(`  Key: ${key}`);
console.log(`  Saved to: ${configPath}`);
console.log();
console.log("To use it, set these environment variables:");
console.log(`  GAMEDEV_MCP_DEV=true`);
console.log(`  GAMEDEV_MCP_LICENSE=${key}`);
console.log();
console.log("Or just set GAMEDEV_MCP_DEV=true (the key will be read from the config file).");
