#!/usr/bin/env node

import { createServer } from "./server.js";
import { runSetup } from "./cli/setup.js";
import { runInit } from "./cli/init.js";

const command = process.argv[2];

async function main() {
  if (command === "setup") {
    await runSetup();
  } else if (command === "init") {
    await runInit();
  } else {
    const server = await createServer();
    await server.start();
  }
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
