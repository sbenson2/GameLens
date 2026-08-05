/**
 * Environment detection — find installed AI tools.
 *
 * Used by `gamelens init` to auto-configure MCP connections.
 */

import * as fs from "fs";
import * as path from "path";

// ---- Types ----

export interface AIToolInfo {
  name: string;
  label: string;
  configPath: string;
  exists: boolean;
  hasGameLens: boolean;
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

function configHasGameLens(configPath: string): boolean {
  try {
    const content = fs.readFileSync(configPath, "utf-8");
    const config = JSON.parse(content);
    return !!(config?.mcpServers?.gamelens);
  } catch {
    return false;
  }
}

export function detectAITools(): AIToolInfo[] {
  return getAIToolPaths().map((tool) => ({
    ...tool,
    exists: fs.existsSync(tool.configPath),
    hasGameLens: configHasGameLens(tool.configPath),
  }));
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

    // Add gamelens server
    (config.mcpServers as Record<string, unknown>).gamelens = {
      command: "npx",
      args: ["-y", "gamelens"],
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
