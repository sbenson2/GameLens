/**
 * Environment detection — find AI tools and game engines.
 *
 * Used by `gamecodex init` to auto-configure MCP connections.
 */

import * as fs from "fs";
import * as path from "path";

// ---- Types ----

export interface AIToolInfo {
  name: string;
  label: string;
  configPath: string;
  exists: boolean;
  hasGameCodex: boolean;
}

export interface EngineInfo {
  engine: "godot" | "monogame" | "phaser";
  confidence: "high" | "medium";
  evidence: string;
}

export interface EnvironmentInfo {
  aiTools: AIToolInfo[];
  engine: EngineInfo | null;
}

// ---- AI tool detection ----

function home(): string {
  return process.env.HOME ?? process.env.USERPROFILE ?? "~";
}

function getAIToolPaths(): Array<{ name: string; label: string; configPath: string }> {
  const isMac = process.platform === "darwin";
  const isWin = process.platform === "win32";

  const tools: Array<{ name: string; label: string; configPath: string }> = [];

  // Claude Desktop
  if (isMac) {
    tools.push({
      name: "claude-desktop",
      label: "Claude Desktop",
      configPath: path.join(home(), "Library", "Application Support", "Claude", "claude_desktop_config.json"),
    });
  } else if (isWin) {
    tools.push({
      name: "claude-desktop",
      label: "Claude Desktop",
      configPath: path.join(process.env.APPDATA ?? "", "Claude", "claude_desktop_config.json"),
    });
  }

  // Claude Code (project-level)
  tools.push({
    name: "claude-code",
    label: "Claude Code",
    configPath: path.join(process.cwd(), ".mcp.json"),
  });

  // Cursor
  tools.push({
    name: "cursor",
    label: "Cursor",
    configPath: path.join(home(), ".cursor", "mcp.json"),
  });

  // Windsurf
  tools.push({
    name: "windsurf",
    label: "Windsurf",
    configPath: path.join(home(), ".codeium", "windsurf", "mcp_config.json"),
  });

  return tools;
}

function configHasGameCodex(configPath: string): boolean {
  try {
    const content = fs.readFileSync(configPath, "utf-8");
    const config = JSON.parse(content);
    return !!(config?.mcpServers?.gamecodex);
  } catch {
    return false;
  }
}

export function detectAITools(): AIToolInfo[] {
  return getAIToolPaths().map((tool) => ({
    ...tool,
    exists: fs.existsSync(tool.configPath),
    hasGameCodex: configHasGameCodex(tool.configPath),
  }));
}

// ---- Engine detection ----

export function detectEngine(dir?: string): EngineInfo | null {
  const cwd = dir ?? process.cwd();

  // Godot: project.godot file
  if (fs.existsSync(path.join(cwd, "project.godot"))) {
    return { engine: "godot", confidence: "high", evidence: "Found project.godot" };
  }

  // Godot: any .godot file
  try {
    const files = fs.readdirSync(cwd);
    const godotFile = files.find((f) => f.endsWith(".godot"));
    if (godotFile) {
      return { engine: "godot", confidence: "medium", evidence: `Found ${godotFile}` };
    }
  } catch { /* ignore */ }

  // MonoGame: .csproj with MonoGame reference
  try {
    const files = fs.readdirSync(cwd);
    for (const f of files) {
      if (f.endsWith(".csproj")) {
        try {
          const content = fs.readFileSync(path.join(cwd, f), "utf-8");
          if (content.includes("MonoGame")) {
            return { engine: "monogame", confidence: "high", evidence: `Found ${f} with MonoGame reference` };
          }
        } catch { /* ignore */ }
      }
    }
  } catch { /* ignore */ }

  // MonoGame: Content.mgcb
  if (fs.existsSync(path.join(cwd, "Content", "Content.mgcb")) || fs.existsSync(path.join(cwd, "Content.mgcb"))) {
    return { engine: "monogame", confidence: "medium", evidence: "Found Content.mgcb" };
  }

  // Phaser: package.json with phaser
  const pkgPath = path.join(cwd, "package.json");
  if (fs.existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf-8"));
      const deps = { ...pkg.dependencies, ...pkg.devDependencies };
      if (deps.phaser) {
        return { engine: "phaser", confidence: "high", evidence: "Found phaser in package.json" };
      }
    } catch { /* ignore */ }
  }

  return null;
}

// ---- MCP config writing ----

interface McpConfig {
  mcpServers?: Record<string, unknown>;
  [key: string]: unknown;
}

export function writeMcpConfig(configPath: string): { success: boolean; error?: string } {
  try {
    // Read existing config or start fresh
    let config: McpConfig = {};
    if (fs.existsSync(configPath)) {
      try {
        config = JSON.parse(fs.readFileSync(configPath, "utf-8"));
      } catch {
        // Corrupt JSON — back it up and start fresh
        fs.copyFileSync(configPath, configPath + ".bak");
      }
    }

    // Ensure mcpServers key exists
    if (!config.mcpServers) {
      config.mcpServers = {};
    }

    // Add gamecodex server
    (config.mcpServers as Record<string, unknown>).gamecodex = {
      command: "npx",
      args: ["-y", "gamecodex"],
    };

    // Ensure parent directory exists
    const dir = path.dirname(configPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    fs.writeFileSync(configPath, JSON.stringify(config, null, 2) + "\n");
    return { success: true };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
}
