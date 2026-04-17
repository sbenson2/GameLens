/**
 * Deactivate CLI — `gamecodex deactivate`
 *
 * Removes the license from this machine and frees the activation
 * slot on LemonSqueezy so it can be used elsewhere.
 */

import * as fs from "fs";
import * as path from "path";
import * as readline from "readline";
import {
  getLicenseKey,
  getMachineId,
  deactivateLicense,
} from "../license.js";
import { CONFIG_DIR } from "../config.js";

const LICENSE_CONFIG_PATH = path.join(CONFIG_DIR, "license.json");
const CACHE_PATH = path.join(CONFIG_DIR, "cache.json");

function prompt(rl: readline.Interface, question: string): Promise<string> {
  return new Promise((resolve) => {
    rl.question(question, (answer) => resolve(answer.trim()));
  });
}

function print(msg: string): void {
  process.stdout.write(msg + "\n");
}

export async function runDeactivate(): Promise<void> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  print("");
  print("  GameCodex Deactivate");
  print("  ────────────────────");
  print("");

  const key = getLicenseKey();

  if (!key) {
    print("  No license key found. Nothing to deactivate.");
    print("");
    rl.close();
    return;
  }

  const machineId = getMachineId();
  print(`  Machine: ${machineId}`);
  print("");

  const confirm = await prompt(rl, "  Deactivate this machine and remove the license? [y/n]: ");

  if (confirm.toLowerCase() !== "y" && confirm.toLowerCase() !== "yes") {
    print("");
    print("  Cancelled. License unchanged.");
    print("");
    rl.close();
    return;
  }

  print("");
  print("  Deactivating...");

  const result = await deactivateLicense(key, machineId);

  if (result.valid) {
    // Clean up local files
    try { if (fs.existsSync(LICENSE_CONFIG_PATH)) fs.unlinkSync(LICENSE_CONFIG_PATH); } catch { /* non-fatal */ }
    try { if (fs.existsSync(CACHE_PATH)) fs.unlinkSync(CACHE_PATH); } catch { /* non-fatal */ }

    print("");
    print("  License deactivated and removed from this machine.");
    print("  You can re-activate on another machine with `gamecodex setup`.");
    print("");
  } else {
    // Still remove local files — user wants to deactivate regardless
    try { if (fs.existsSync(LICENSE_CONFIG_PATH)) fs.unlinkSync(LICENSE_CONFIG_PATH); } catch { /* non-fatal */ }
    try { if (fs.existsSync(CACHE_PATH)) fs.unlinkSync(CACHE_PATH); } catch { /* non-fatal */ }

    print("");
    print(`  Warning: Remote deactivation failed (${result.error ?? "unknown error"}).`);
    print("  Local license files removed. The activation slot may still be used.");
    print("  Need help? support@gamecodex.dev");
    print("");
  }

  rl.close();
}
