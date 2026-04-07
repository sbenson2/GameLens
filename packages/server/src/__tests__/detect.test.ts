import { describe, it } from "node:test";
import assert from "node:assert/strict";
import * as path from "path";
import * as fs from "fs";
import * as os from "os";
import { detectEngine, writeMcpConfig } from "../cli/detect.js";

describe("detect", () => {
  describe("detectEngine()", () => {
    it("should detect Godot from project.godot", () => {
      const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "gc-test-"));
      fs.writeFileSync(path.join(tmp, "project.godot"), "[gd_scene]");
      try {
        const result = detectEngine(tmp);
        assert.ok(result);
        assert.equal(result.engine, "godot");
        assert.equal(result.confidence, "high");
      } finally {
        fs.rmSync(tmp, { recursive: true });
      }
    });

    it("should detect MonoGame from .csproj", () => {
      const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "gc-test-"));
      fs.writeFileSync(path.join(tmp, "Game.csproj"), '<PackageReference Include="MonoGame.Framework" />');
      try {
        const result = detectEngine(tmp);
        assert.ok(result);
        assert.equal(result.engine, "monogame");
        assert.equal(result.confidence, "high");
      } finally {
        fs.rmSync(tmp, { recursive: true });
      }
    });

    it("should detect Phaser from package.json", () => {
      const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "gc-test-"));
      fs.writeFileSync(path.join(tmp, "package.json"), JSON.stringify({ dependencies: { phaser: "^3.60" } }));
      try {
        const result = detectEngine(tmp);
        assert.ok(result);
        assert.equal(result.engine, "phaser");
        assert.equal(result.confidence, "high");
      } finally {
        fs.rmSync(tmp, { recursive: true });
      }
    });

    it("should return null for empty directory", () => {
      const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "gc-test-"));
      try {
        const result = detectEngine(tmp);
        assert.equal(result, null);
      } finally {
        fs.rmSync(tmp, { recursive: true });
      }
    });
  });

  describe("writeMcpConfig()", () => {
    it("should create config file with gamecodex entry", () => {
      const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "gc-test-"));
      const configPath = path.join(tmp, "config.json");
      try {
        const result = writeMcpConfig(configPath);
        assert.ok(result.success);
        const config = JSON.parse(fs.readFileSync(configPath, "utf-8"));
        assert.ok(config.mcpServers.gamecodex);
        assert.equal(config.mcpServers.gamecodex.command, "npx");
      } finally {
        fs.rmSync(tmp, { recursive: true });
      }
    });

    it("should merge into existing config", () => {
      const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "gc-test-"));
      const configPath = path.join(tmp, "config.json");
      fs.writeFileSync(configPath, JSON.stringify({ mcpServers: { other: { command: "node" } } }));
      try {
        const result = writeMcpConfig(configPath);
        assert.ok(result.success);
        const config = JSON.parse(fs.readFileSync(configPath, "utf-8"));
        assert.ok(config.mcpServers.gamecodex);
        assert.ok(config.mcpServers.other);
      } finally {
        fs.rmSync(tmp, { recursive: true });
      }
    });

    it("should create parent directories", () => {
      const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "gc-test-"));
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
