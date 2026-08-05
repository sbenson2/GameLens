/**
 * GameLens MCP Server — the game designer AI lens for programmers.
 *
 * One tool: `lens`. The design knowledge base ships as passive MCP
 * resources — zero tool-schema cost, browsable by clients that support
 * resources.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import * as path from "path";
import * as fs from "fs";

import { DocStore } from "./core/docs.js";
import { SearchEngine } from "./core/search.js";
import { lensToolDef } from "./tools/lens.js";
import { getAnalytics } from "./analytics.js";
import { getToolRegistry } from "./tool-registry.js";
import { ToolDependencies } from "./tool-definition.js";

const SERVER_VERSION = "3.0.0";

// ---- Helpers ----

function findDocsRoot(): string {
  const distDir = __dirname;
  const projectRoot = path.dirname(distDir);
  const docsPath = path.join(projectRoot, "docs");
  if (fs.existsSync(docsPath)) return docsPath;

  const cwdDocs = path.join(process.cwd(), "docs");
  if (fs.existsSync(cwdDocs)) return cwdDocs;

  throw new Error(
    `Could not find docs directory.\n` +
    `Looked in:\n  - ${docsPath}\n  - ${cwdDocs}\n\n` +
    `If installed via npm, ensure the package includes the docs/ directory.\n` +
    `If running from source, run from the project root.`
  );
}

// ---- Server creation ----

export async function createServer() {
  const startTime = Date.now();
  const docsRoot = findDocsRoot();

  const docStore = new DocStore(docsRoot);
  await docStore.load();
  const allDocs = [...docStore.getAllDocs()];

  // The knowledge base is reachable through the lens: situation text is
  // also searched against the docs, and `doc` fetches one by id.
  const searchEngine = new SearchEngine();
  searchEngine.index(allDocs);

  const analytics = getAnalytics();

  console.error(
    `[gamelens] v${SERVER_VERSION} | 1 tool (lens) | ${allDocs.length} design docs as resources`
  );

  analytics.recordStartup({
    version: SERVER_VERSION,
    startupTimeMs: Date.now() - startTime,
    totalDocs: allDocs.length,
  });

  // ---- The one tool ----

  const registry = getToolRegistry();
  const deps: ToolDependencies = {
    docStore,
    searchEngine,
    analytics,
    serverVersion: SERVER_VERSION,
    allDocs,
  };
  registry.setDependencies(deps);
  registry.register(lensToolDef);

  const server = new McpServer({
    name: "gamelens",
    version: SERVER_VERSION,
  });

  registry.wireToServer(server);

  // ---- Resources: the design knowledge base ----

  for (const doc of allDocs) {
    const uri = `gamelens://docs/${doc.id}`;
    server.resource(
      `doc-${doc.id}`,
      uri,
      { mimeType: "text/markdown", description: doc.title },
      async () => ({
        contents: [{ uri, mimeType: "text/markdown" as const, text: doc.content }],
      })
    );
  }

  return {
    start: async () => {
      const transport = new StdioServerTransport();
      await server.connect(transport);
      console.error(`[gamelens] Server started on stdio (v${SERVER_VERSION})`);

      const shutdown = () => {
        analytics.shutdown();
        process.exit(0);
      };
      process.on("SIGINT", shutdown);
      process.on("SIGTERM", shutdown);
    },
  };
}
