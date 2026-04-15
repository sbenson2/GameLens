import { spawn, ChildProcess } from "child_process";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import fs from "fs";
import path from "path";
import { loadConfig } from "../config-loader.js";

export interface MCPTool {
  name: string;
  description: string;
  inputSchema: {
    type: "object";
    properties?: Record<string, unknown>;
    required?: string[];
    additionalProperties?: boolean;
  };
}

export type ToolExecutor = (
  toolName: string,
  action?: string,
  args?: Record<string, unknown>
) => Promise<unknown>;

export class GameCodexMCPClient {
  private client: Client | null = null;
  private serverProcess: ChildProcess | null = null;
  private tools: MCPTool[] = [];
  private isConnected: boolean = false;
  private serverPath: string | null = null;

  async connect(serverPath?: string): Promise<void> {
    const config = loadConfig();
    this.serverPath = serverPath || config.tui.serverPath || this.findServerPath();

    if (!this.serverPath) {
      throw new Error(
        "GameCodex server not found. Set serverPath in config or ensure packages/server/dist/server.js exists."
      );
    }

    this.serverProcess = spawn("node", [this.serverPath], {
      stdio: ["pipe", "pipe", "pipe"],
      env: { ...process.env },
    });

    const transport = new StdioClientTransport({
      command: "node",
      args: [this.serverPath!],
    });

    this.client = new Client(
      {
        name: "gamecodex-tui",
        version: "0.1.0",
      },
      {
        capabilities: {},
      }
    );

    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error("Connection timeout"));
      }, 10000);

      this.client!.connect(transport).then(() => {
        clearTimeout(timeout);
        resolve();
      }).catch(reject);
    });

    this.isConnected = true;
    await this.loadTools();
  }

  async disconnect(): Promise<void> {
    if (this.serverProcess) {
      this.serverProcess.kill();
      this.serverProcess = null;
    }
    if (this.client) {
      await this.client.close();
      this.client = null;
    }
    this.isConnected = false;
    this.tools = [];
  }

  private findServerPath(): string | null {
    const possiblePaths = [
      "../server/dist/index.js",
      "../../packages/server/dist/index.js",
      path.join(process.cwd(), "../../packages/server/dist/index.js"),
    ];

    for (const p of possiblePaths) {
      const absPath = path.resolve(p);
      if (fs.existsSync(absPath)) {
        return absPath;
      }
    }

    return null;
  }

  private async loadTools(): Promise<void> {
    if (!this.client) {
      throw new Error("Client not connected");
    }

    const response = await (this.client as any).request(
      { method: "tools/list", params: {} }
    );

    this.tools = response.tools.map((tool: any) => ({
      name: tool.name as string,
      description: tool.description as string,
      inputSchema: tool.inputSchema as MCPTool["inputSchema"],
    }));
  }

  getTools(): MCPTool[] {
    return this.tools;
  }

  getToolNames(): string[] {
    return this.tools.map((t) => t.name);
  }

  isToolAvailable(name: string): boolean {
    return this.tools.some((t) => t.name === name);
  }

  async executeTool(
    toolName: string,
    action?: string,
    args: Record<string, unknown> = {}
  ): Promise<unknown> {
    if (!this.client) {
      throw new Error("Client not connected");
    }

    const toolInput: Record<string, unknown> = { ...args };
    if (action) {
      toolInput.action = action;
    }

    const response = await (this.client as any).request(
      {
        method: "tools/call",
        params: {
          name: toolName,
          arguments: toolInput,
        },
      }
    );

    if (response.isError) {
      const errorText =
        typeof response.content === "string"
          ? response.content
          : JSON.stringify(response.content);
      throw new Error(errorText);
    }

    const content = response.content;
    if (Array.isArray(content) && content.length > 0) {
      const first = content[0];
      if (typeof first === "object" && first !== null && "text" in first) {
        return (first as { text: string }).text;
      }
    }

    return content;
  }

  getExecutor(): ToolExecutor {
    return (toolName: string, action?: string, args?: Record<string, unknown>) =>
      this.executeTool(toolName, action, args);
  }

  getStatus(): {
    connected: boolean;
    toolCount: number;
    serverPath: string | null;
  } {
    return {
      connected: this.isConnected,
      toolCount: this.tools.length,
      serverPath: this.serverPath,
    };
  }
}
