#!/usr/bin/env node

import { createServer } from "./server.js";
import { runInit } from "./cli/init.js";

const SERVER_VERSION = "1.0.0";
const command = process.argv[2];

async function main() {
  if (command === "init") {
    await runInit();
  } else if (command === "status") {
    console.log(`GameCodex v${SERVER_VERSION} — free & open source`);
  } else {
    const server = await createServer();
    await server.start();
  }
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
