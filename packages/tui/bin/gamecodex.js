#!/usr/bin/env node

import { spawn } from "child_process";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));

const args = process.argv.slice(2);

if (args.includes("--help") || args.includes("-h")) {
  console.log(`
GameCodex TUI — AI-powered game development assistant

Usage:
  gamecodex           Start the TUI
  gamecodex --model    Specify model (anthropic, openai, google, ollama)
  gamecodex --setup    Configure providers
  gamecodex --help     Show this help

Examples:
  gamecodex
  gamecodex --model ollama
  gamecodex --setup

Configuration:
  Edit ~/.gamecodex/config.json to configure LLM providers and settings.
`);
  process.exit(0);
}

if (args.includes("--setup")) {
  console.log("Opening setup wizard...");

  const configPath = `${process.env.HOME || process.env.USERPROFILE}/.gamecodex/config.json`;
  const fs = await import("fs");

  if (!fs.existsSync(dirname(configPath))) {
    fs.mkdirSync(dirname(configPath), { recursive: true });
  }

  const exampleConfig = {
    providers: {
      anthropic: {
        apiKey: "env:ANTHROPIC_API_KEY",
      },
      ollama: {
        baseURL: "http://localhost:11434/v1",
        defaultModel: "llama3.2",
      },
    },
    tui: {
      defaultProvider: "anthropic",
      showToolCalls: true,
      autoRecover: true,
      maxIterations: 50,
    },
  };

  console.log(`Example config at ${configPath}:`);
  console.log(JSON.stringify(exampleConfig, null, 2));

  const readline = await import("readline");
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  const question = (q: string): Promise<string> =>
    new Promise((res) => rl.question(q, res));

  const provider = await question("Default provider (anthropic/ollama/openai/google): ");
  const model = await question("Default model (optional): ");

  const config = {
    providers: exampleConfig.providers,
    tui: {
      ...exampleConfig.tui,
      defaultProvider: provider || "anthropic",
      defaultModel: model || undefined,
    },
  };

  fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
  console.log(`\nConfig saved to ${configPath}`);
  rl.close();
  process.exit(0);
}

const tsxPath = join(__dirname, "../node_modules/.bin/tsx");

const child = spawn(tsxPath, [join(__dirname, "../dist/index.js"), ...args], {
  stdio: "inherit",
  env: { ...process.env },
});

child.on("exit", (code) => {
  process.exit(code || 0);
});
