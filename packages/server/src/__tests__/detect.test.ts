import { describe, it } from "node:test";
import assert from "node:assert/strict";
import * as path from "path";
import * as fs from "fs";
import * as os from "os";
import { writeMcpConfig } from "../cli/detect.js";

describe("detect", () => {
  describe("writeMcpConfig()", () => {
    it("should create config file with gamelens entry", () => {
      const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "gl-test-"));
      const configPath = path.join(tmp, "config.json");
      try {
        const result = writeMcpConfig(configPath);
        assert.ok(result.success);
        const config = JSON.parse(fs.readFileSync(configPath, "utf-8"));
        assert.ok(config.mcpServers.gamelens);
        assert.equal(config.mcpServers.gamelens.command, "npx");
      } finally {
        fs.rmSync(tmp, { recursive: true });
      }
    });

    it("should merge into existing config", () => {
      const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "gl-test-"));
      const configPath = path.join(tmp, "config.json");
      fs.writeFileSync(configPath, JSON.stringify({ mcpServers: { other: { command: "node" } } }));
      try {
        const result = writeMcpConfig(configPath);
        assert.ok(result.success);
        const config = JSON.parse(fs.readFileSync(configPath, "utf-8"));
        assert.ok(config.mcpServers.gamelens);
        assert.ok(config.mcpServers.other);
      } finally {
        fs.rmSync(tmp, { recursive: true });
      }
    });

    it("should create parent directories", () => {
      const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "gl-test-"));
      const configPath = path.join(tmp, "nested", "dir", "config.json");
      try {
        const result = writeMcpConfig(configPath);
        assert.ok(result.success);
        assert.ok(fs.existsSync(configPath));
      } finally {
        fs.rmSync(tmp, { recursive: true });
      }
    });
  });
});
