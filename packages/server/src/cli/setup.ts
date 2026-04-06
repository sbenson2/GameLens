/**
 * Interactive setup CLI — `gamecodex setup`
 *
 * Walks a new user through license activation in a friendly,
 * non-pushy way. Also serves as the upgrade path from free tier.
 */

import * as fs from "fs";
import * as path from "path";
import * as readline from "readline";
import {
  isValidKeyFormat,
  activateLicense,
  getLicenseKey,
  validateLicense,
} from "../license.js";

const CONFIG_DIR = path.join(
  process.env.HOME ?? process.env.USERPROFILE ?? "~",
  ".gamecodex"
);
const LICENSE_CONFIG_PATH = path.join(CONFIG_DIR, "license.json");

function ensureConfigDir(): void {
  if (!fs.existsSync(CONFIG_DIR)) {
    fs.mkdirSync(CONFIG_DIR, { recursive: true, mode: 0o700 });
  }
}

function prompt(rl: readline.Interface, question: string): Promise<string> {
  return new Promise((resolve) => {
    rl.question(question, (answer) => resolve(answer.trim()));
  });
}

function print(msg: string): void {
  process.stdout.write(msg + "\n");
}

function saveLicenseKey(key: string): void {
  ensureConfigDir();
  fs.writeFileSync(
    LICENSE_CONFIG_PATH,
    JSON.stringify({ key }, null, 2),
    { mode: 0o600 }
  );
}

function removeLicenseKey(): void {
  try {
    if (fs.existsSync(LICENSE_CONFIG_PATH)) {
      fs.unlinkSync(LICENSE_CONFIG_PATH);
    }
  } catch {
    // non-fatal
  }
}

export async function runSetup(): Promise<void> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  print("");
  print("  GameCodex Setup");
  print("  ───────────────");
  print("");

  // Check current state
  const existingKey = getLicenseKey();
  if (existingKey) {
    print("  You already have a license key configured.");
    print("");
    const { tier, message } = await validateLicense();
    if (tier === "pro") {
      print("  Status: Pro (active)");
      print("");
      const action = await prompt(rl, "  What would you like to do? [k]eep / [c]hange key / [r]emove: ");
      const choice = action.toLowerCase();

      if (choice === "r" || choice === "remove") {
        removeLicenseKey();
        print("");
        print("  License removed. You're now on the free tier.");
        print("");
      } else if (choice === "c" || choice === "change") {
        await activateFlow(rl);
      } else {
        print("");
        print("  Keeping current license. You're all set!");
        print("");
      }
    } else {
      print(`  Status: ${message}`);
      print("");
      const action = await prompt(rl, "  Enter a new key? [y]es / [n]o: ");
      if (action.toLowerCase() === "y" || action.toLowerCase() === "yes") {
        await activateFlow(rl);
      }
    }
  } else {
    // No key — fresh setup
    print("  You're currently on the free tier.");
    print("  Free gets you 18 tools + core docs (52 docs).");
    print("  Pro ($5/mo) unlocks all 22 tools + all engine modules (150+ docs).");
    print("");
    print("  Get a license key at: https://gamecodex.dev/pro");
    print("");

    const hasKey = await prompt(rl, "  Have a license key? [y]es / [n]o: ");

    if (hasKey.toLowerCase() === "y" || hasKey.toLowerCase() === "yes") {
      await activateFlow(rl);
    } else {
      print("");
      print("  No problem! The free tier is fully functional.");
      print("  Run `gamecodex setup` any time to activate a key.");
      print("");
    }
  }

  rl.close();
}

async function activateFlow(rl: readline.Interface): Promise<void> {
  print("");
  const key = await prompt(rl, "  License key: ");

  if (!key) {
    print("  No key entered. Setup cancelled.");
    print("");
    return;
  }

  if (!isValidKeyFormat(key)) {
    print("");
    print("  Invalid key format. License keys look like:");
    print("  xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx");
    print("");
    return;
  }

  print("");
  print("  Activating...");

  const result = await activateLicense(key);

  if (result.valid) {
    saveLicenseKey(key);
    print("");
    print("  Pro activated! All 22 tools and 150+ docs are now unlocked.");
    print("  Key saved to ~/.gamecodex/license.json");
    print("");
  } else {
    print("");
    print(`  Activation failed: ${result.error ?? "unknown error"}`);
    print("  Check your key and try again, or contact support.");
    print("");
  }
}
