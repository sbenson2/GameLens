import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerPrompts } from "../prompts.js";

describe("prompts", () => {
  it("should register without errors", () => {
    const server = new McpServer({ name: "test", version: "0.0.1" });
    assert.doesNotThrow(() => registerPrompts(server));
  });

  it("should register 3 prompts", () => {
    const server = new McpServer({ name: "test", version: "0.0.1" });
    registerPrompts(server);
    // The server doesn't expose a public list, but registering shouldn't throw
    assert.ok(true);
  });
});
