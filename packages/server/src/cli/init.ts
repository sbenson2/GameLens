/**
 * Interactive init CLI — `gamecodex init`
 *
 * Auto-detects AI tools and game engine, writes MCP config files.
 * Follows the same readline-based pattern as setup.ts.
 */

import * as readline from "readline";
import { detectAITools, detectEngine, writeMcpConfig, AIToolInfo } from "./detect.js";

function print(msg: string): void {
  process.stdout.write(msg + "\n");
}

function prompt(rl: readline.Interface, question: string): Promise<string> {
  return new Promise((resolve) => {
    rl.question(question, (answer) => resolve(answer.trim()));
  });
}

export async function runInit(): Promise<void> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  print("");
  print("  GameCodex Init");
  print("  ──────────────");
  print("");

  // ---- Detect AI tools ----

  const aiTools = detectAITools();
  const detected = aiTools.filter((t) => t.exists);
  const alreadyConfigured = aiTools.filter((t) => t.hasGameCodex);
  const configurable = aiTools.filter((t) => !t.hasGameCodex);

  if (alreadyConfigured.length > 0) {
    print(`  Already configured: ${alreadyConfigured.map((t) => t.label).join(", ")}`);
  }

  if (detected.length === 0 && configurable.length === 0) {
    print("  No AI tools detected.");
    print("");
    print("  Supported: Claude Desktop, Claude Code, Cursor, Windsurf");
    print("  Install one, then run `gamecodex init` again.");
    print("");
    print("  Or manually add to your MCP config:");
    print('  { "mcpServers": { "gamecodex": { "command": "npx", "args": ["-y", "gamecodex"] } } }');
    print("");
    rl.close();
    return;
  }

  if (detected.length > 0) {
    print(`  Detected: ${detected.map((t) => t.label).join(", ")}`);
  }

  // ---- Detect engine ----

  const engine = detectEngine();
  if (engine) {
    print(`  Detected: ${engine.engine} project (${engine.evidence})`);
  }

  print("");

  // ---- Configure each tool ----

  let configured = 0;

  for (const tool of configurable) {
    const answer = await prompt(rl, `  Configure for ${tool.label}? [Y/n] `);
    const skip = answer.toLowerCase() === "n" || answer.toLowerCase() === "no";

    if (skip) {
      print(`  Skipped ${tool.label}.`);
      continue;
    }

    const result = writeMcpConfig(tool.configPath);
    if (result.success) {
      print(`  ✓ Wrote ${tool.label} config`);
      configured++;
    } else {
      print(`  ✗ Failed to write ${tool.label} config: ${result.error}`);
    }
  }

  // ---- Summary ----

  print("");
  if (configured > 0) {
    print(`  Configured ${configured} tool${configured > 1 ? "s" : ""}.`);
    if (engine) {
      print(`  Detected engine: ${engine.engine}`);
    }
    print("");
    print("  Your AI assistant now has GameCodex — free and open source.");
  } else if (alreadyConfigured.length > 0 && configurable.length === 0) {
    print("  Everything is already configured. You're good to go!");
  } else {
    print("  No changes made.");
  }
  print("");

  rl.close();
}
