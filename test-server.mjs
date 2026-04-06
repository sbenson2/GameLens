#!/usr/bin/env node
/**
 * GameCodex MCP Server — Smoke Test
 * Spawns the server, sends JSON-RPC messages, validates responses.
 * Run: node test-server.mjs
 */

import { spawn } from "child_process";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SERVER_PATH = join(__dirname, "packages/server/dist/index.js");

let pass = 0;
let fail = 0;

function ok(label) {
  pass++;
  console.log(`  \x1b[32mPASS\x1b[0m  ${label}`);
}
function bad(label, expected, got) {
  fail++;
  console.log(`  \x1b[31mFAIL\x1b[0m  ${label}`);
  if (expected) console.log(`        expected: ${expected}`);
  if (got) console.log(`        got: ${String(got).slice(0, 200)}`);
}

function check(label, response, pattern) {
  if (typeof pattern === "string" ? response.includes(pattern) : pattern.test(response)) {
    ok(label);
  } else {
    bad(label, String(pattern), response);
  }
}

/** Send messages to a fresh server instance, collect all stdout, kill after timeout */
function runServer(messages, timeoutMs = 12000) {
  return new Promise((resolve) => {
    const proc = spawn("node", [SERVER_PATH], {
      stdio: ["pipe", "pipe", "pipe"],
    });

    let stdout = "";
    proc.stdout.on("data", (d) => (stdout += d.toString()));
    proc.stderr.on("data", () => {}); // discard

    const timer = setTimeout(() => {
      proc.kill();
    }, timeoutMs);

    proc.on("close", () => {
      clearTimeout(timer);
      resolve(stdout);
    });

    // Send messages with small delays so server can process each
    const msgs = Array.isArray(messages) ? messages : [messages];
    let i = 0;
    function sendNext() {
      if (i < msgs.length) {
        proc.stdin.write(msgs[i] + "\n");
        i++;
        setTimeout(sendNext, 300);
      } else {
        // Give server time to respond, then close stdin
        setTimeout(() => proc.stdin.end(), 2000);
      }
    }
    sendNext();
  });
}

const INIT = JSON.stringify({
  jsonrpc: "2.0",
  id: 1,
  method: "initialize",
  params: {
    protocolVersion: "2024-11-05",
    capabilities: {},
    clientInfo: { name: "smoke-test", version: "0.1.0" },
  },
});
const INITIALIZED = JSON.stringify({
  jsonrpc: "2.0",
  method: "notifications/initialized",
});

console.log("=== GameCodex MCP Server Smoke Test ===\n");

// --- Test 1: Initialize ---
console.log("[1/3] Initialize handshake");
const r1 = await runServer([INIT]);
check("Server responds with result", r1, '"result"');
check('Server name is "gamecodex"', r1, '"gamecodex"');
check("Returns protocol version", r1, '"protocolVersion"');

// --- Test 2: List tools ---
console.log("[2/3] List tools");
const listTools = JSON.stringify({
  jsonrpc: "2.0",
  id: 2,
  method: "tools/list",
  params: {},
});
const r2 = await runServer([INIT, INITIALIZED, listTools]);
check("Returns tool list", r2, '"tools"');
check("Has search_docs", r2, "search_docs");
check("Has teach tool", r2, '"teach"');
check("Has memory tool", r2, '"memory"');

// --- Test 3: Call search_docs ---
console.log("[3/3] Call search_docs");
const callSearch = JSON.stringify({
  jsonrpc: "2.0",
  id: 3,
  method: "tools/call",
  params: { name: "search_docs", arguments: { query: "ECS" } },
});
const r3 = await runServer([INIT, INITIALIZED, callSearch], 15000);
check("search_docs returns content", r3, '"content"');

// --- Summary ---
console.log("");
if (fail === 0) {
  console.log(`=== \x1b[32mAll ${pass} tests passed\x1b[0m ===`);
} else {
  console.log(`=== \x1b[31m${pass} passed, ${fail} failed\x1b[0m ===`);
}
process.exit(fail > 0 ? 1 : 0);
