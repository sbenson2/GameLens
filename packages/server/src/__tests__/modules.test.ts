import { describe, it } from "node:test";
import * as assert from "node:assert/strict";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { fileURLToPath } from "url";
import { discoverModules, resolveActiveModules } from "../core/modules.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Resolve the real docs root (handles spaces in path)
const projectRoot = path.resolve(__dirname, "../..");
const docsRoot = path.join(projectRoot, "docs");

describe("Module Auto-Discovery", () => {
  it("discovers modules from real docs directory", () => {
    const modules = discoverModules(docsRoot);

    assert.ok(modules.length >= 2, `Expected at least 2 modules, got ${modules.length}`);

    const ids = modules.map((m) => m.id);
    assert.ok(ids.includes("monogame-arch"), "Should discover monogame-arch");
    assert.ok(ids.includes("godot-arch"), "Should discover godot-arch");
  });

  it("does NOT include 'core' as a module", () => {
    const modules = discoverModules(docsRoot);
    const ids = modules.map((m) => m.id);
    assert.ok(!ids.includes("core"), "core should not be listed as a module");
  });

  it("extracts correct engine names", () => {
    const modules = discoverModules(docsRoot);
    const mono = modules.find((m) => m.id === "monogame-arch");
    const godot = modules.find((m) => m.id === "godot-arch");

    assert.ok(mono, "monogame-arch module should exist");
    assert.equal(mono.engine, "MonoGame");

    assert.ok(godot, "godot-arch module should exist");
    assert.equal(godot.engine, "Godot");
  });

  it("extracts labels from rules files", () => {
    const modules = discoverModules(docsRoot);
    const mono = modules.find((m) => m.id === "monogame-arch");
    const godot = modules.find((m) => m.id === "godot-arch");

    assert.ok(mono);
    assert.ok(mono.label.includes("MonoGame"), `Label should include MonoGame, got: ${mono.label}`);

    assert.ok(godot);
    assert.ok(godot.label.includes("Godot"), `Label should include Godot, got: ${godot.label}`);
  });

  it("finds rules files", () => {
    const modules = discoverModules(docsRoot);
    for (const mod of modules) {
      assert.ok(mod.hasRules, `${mod.id} should have a rules file`);
      assert.ok(mod.rulesPath, `${mod.id} should have rulesPath set`);
      assert.ok(fs.existsSync(mod.rulesPath!), `${mod.id} rules file should exist at ${mod.rulesPath}`);
    }
  });

  it("counts docs correctly (non-zero)", () => {
    const modules = discoverModules(docsRoot);
    for (const mod of modules) {
      assert.ok(mod.docCount > 0, `${mod.id} should have docs, got ${mod.docCount}`);
    }

    const mono = modules.find((m) => m.id === "monogame-arch");
    assert.ok(mono!.docCount > 50, `monogame-arch should have 50+ docs, got ${mono!.docCount}`);

    const godot = modules.find((m) => m.id === "godot-arch");
    assert.ok(godot!.docCount >= 4, `godot-arch should have 4+ docs, got ${godot!.docCount}`);
  });

  it("detects sections (architecture, guides, reference)", () => {
    const modules = discoverModules(docsRoot);
    const mono = modules.find((m) => m.id === "monogame-arch");
    assert.ok(mono);
    assert.ok(mono.sections.includes("architecture"), "monogame-arch should have architecture section");
    assert.ok(mono.sections.includes("guides"), "monogame-arch should have guides section");
    assert.ok(mono.sections.includes("reference"), "monogame-arch should have reference section");
  });

  it("sorts by doc count (most complete first)", () => {
    const modules = discoverModules(docsRoot);
    for (let i = 1; i < modules.length; i++) {
      assert.ok(
        modules[i - 1].docCount >= modules[i].docCount,
        `${modules[i - 1].id} (${modules[i - 1].docCount}) should be >= ${modules[i].id} (${modules[i].docCount})`
      );
    }
  });

  it("returns empty for non-existent directory", () => {
    const modules = discoverModules("/tmp/nonexistent-docs-path-12345");
    assert.equal(modules.length, 0);
  });
});

describe("Module Resolution (GAMEDEV_MODULES)", () => {
  it("activates all modules when env is undefined", () => {
    const discovered = discoverModules(docsRoot);
    const active = resolveActiveModules(discovered, undefined);
    assert.equal(active.length, discovered.length);
  });

  it("filters to specific modules when env is set", () => {
    const discovered = discoverModules(docsRoot);
    const active = resolveActiveModules(discovered, "monogame-arch");
    assert.equal(active.length, 1);
    assert.equal(active[0].id, "monogame-arch");
  });

  it("supports comma-separated module list", () => {
    const discovered = discoverModules(docsRoot);
    const active = resolveActiveModules(discovered, "monogame-arch,godot-arch");
    assert.equal(active.length, 2);
  });

  it("matches by engine name (case-insensitive)", () => {
    const discovered = discoverModules(docsRoot);
    const active = resolveActiveModules(discovered, "godot");
    assert.equal(active.length, 1);
    assert.equal(active[0].engine, "Godot");
  });

  it("returns empty for unknown module", () => {
    const discovered = discoverModules(docsRoot);
    const active = resolveActiveModules(discovered, "fake-engine-xyz");
    assert.equal(active.length, 0);
  });
});

describe("Synthetic Module Discovery", () => {
  it("discovers a dynamically created module", () => {
    const tmpDocs = fs.mkdtempSync(path.join(os.tmpdir(), "gamedev-test-"));
    try {
      // Create a fake module
      const fakeModule = path.join(tmpDocs, "bevy-arch");
      fs.mkdirSync(path.join(fakeModule, "guides"), { recursive: true });
      fs.writeFileSync(
        path.join(fakeModule, "bevy-arch-rules.md"),
        "# Bevy 0.15 — AI Rules\n\nRust-based ECS game engine rules.\n"
      );
      fs.writeFileSync(
        path.join(fakeModule, "guides", "G1_ecs_basics.md"),
        "# ECS Basics\n\nEntity-Component-System fundamentals in Bevy.\n"
      );

      const modules = discoverModules(tmpDocs);
      assert.equal(modules.length, 1);
      assert.equal(modules[0].id, "bevy-arch");
      assert.equal(modules[0].engine, "Bevy");
      assert.equal(modules[0].label, "Bevy 0.15");
      assert.equal(modules[0].docCount, 2); // rules + guide
      assert.ok(modules[0].hasRules);
      assert.ok(modules[0].sections.includes("guides"));
    } finally {
      fs.rmSync(tmpDocs, { recursive: true });
    }
  });

  it("skips empty directories", () => {
    const tmpDocs = fs.mkdtempSync(path.join(os.tmpdir(), "gamedev-test-"));
    try {
      fs.mkdirSync(path.join(tmpDocs, "empty-engine"));
      const modules = discoverModules(tmpDocs);
      assert.equal(modules.length, 0);
    } finally {
      fs.rmSync(tmpDocs, { recursive: true });
    }
  });

  it("skips core directory", () => {
    const tmpDocs = fs.mkdtempSync(path.join(os.tmpdir(), "gamedev-test-"));
    try {
      fs.mkdirSync(path.join(tmpDocs, "core", "concepts"), { recursive: true });
      fs.writeFileSync(path.join(tmpDocs, "core", "concepts", "test.md"), "# Test\n");
      const modules = discoverModules(tmpDocs);
      assert.equal(modules.length, 0);
    } finally {
      fs.rmSync(tmpDocs, { recursive: true });
    }
  });
});
