#!/usr/bin/env node

import { createServer } from "./server.js";
import { runSetup } from "./cli/setup.js";
import { runInit } from "./cli/init.js";
import { validateLicense } from "./license.js";

const SERVER_VERSION = "0.4.0";
const command = process.argv[2];

async function main() {
  if (command === "setup") {
    await runSetup();
  } else if (command === "init") {
    await runInit();
  } else if (command === "deactivate") {
    const { runDeactivate } = await import("./cli/deactivate.js");
    await runDeactivate();
  } else if (command === "status") {
    const { tier, message, expiresAt, activationLimit, activationsUsed } = await validateLicense();
    console.log(`GameCodex v${SERVER_VERSION}`);
    console.log(message);
    if (tier === "pro" && activationLimit) {
      console.log(`[gamecodex] Activations: ${activationsUsed ?? 0}/${activationLimit}`);
    }
  } else {
    const server = await createServer();
    await server.start();
  }
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
