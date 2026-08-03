/**
 * GameCodex MCP Server — the game designer AI lens for programmers.
 *
 * One tool: `lens`. The knowledge base (957 docs, 29 engine modules)
 * ships as passive MCP resources — zero tool-schema cost, browsable by
 * clients that support resources.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import * as path from "path";
import * as fs from "fs";

import { DocStore } from "./core/docs.js";
import { SearchEngine } from "./core/search.js";
import { discoverModules, resolveActiveModules } from "./core/modules.js";
import { lensToolDef } from "./tools/lens.js";
import { getAnalytics } from "./analytics.js";
import { getToolRegistry } from "./tool-registry.js";
import { ToolDependencies } from "./tool-definition.js";

const SERVER_VERSION = "2.0.1";

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

  // Auto-discover knowledge base modules (served as resources)
  const discoveredModules = await discoverModules(docsRoot);
  const activeModuleMeta = resolveActiveModules(
    discoveredModules,
    process.env.GAMEDEV_MODULES
  );
  const activeModules = activeModuleMeta.map((m) => m.id);

  const docStore = new DocStore(docsRoot);
  await docStore.load(activeModules);
  const allDocs = [...docStore.getAllDocs()];

  // The knowledge base is reachable through the lens: situation text is
  // also searched against the docs, and `doc` fetches one by id.
  const searchEngine = new SearchEngine();
  searchEngine.index(allDocs);

  const analytics = getAnalytics();

  console.error(
    `[gamecodex] v${SERVER_VERSION} | 1 tool (lens) | ${allDocs.length} docs as resources ` +
    `(${activeModules.length + 1} modules active of ${discoveredModules.length + 1} discovered)`
  );

  analytics.recordStartup({
    version: SERVER_VERSION,
    startupTimeMs: Date.now() - startTime,
    discoveredModules: discoveredModules.length,
    activeModules: activeModuleMeta.length,
    totalDocs: allDocs.length,
  });

  // ---- The one tool ----

  const registry = getToolRegistry();
  const deps: ToolDependencies = {
    docStore,
    searchEngine,
    discoveredModules,
    analytics,
    serverVersion: SERVER_VERSION,
    activeModules,
    allDocs,
  };
  registry.setDependencies(deps);
  registry.register(lensToolDef);

  const server = new McpServer({
    name: "gamecodex",
    version: SERVER_VERSION,
  });

  registry.wireToServer(server);

  // ---- Resources: the knowledge base ----

  for (const doc of allDocs) {
    const uri = `gamedev://docs/${doc.module}/${doc.id}`;
    server.resource(
      `doc-${doc.module}-${doc.id}`,
      uri,
      { mimeType: "text/markdown", description: `${doc.title} [${doc.category}]` },
      async () => ({
        contents: [{ uri, mimeType: "text/markdown" as const, text: doc.content }],
      })
    );
  }

  const codeRulesPath = path.join(docsRoot, "core", "ai-workflow", "gamedev-rules.md");
  if (fs.existsSync(codeRulesPath)) {
    server.resource(
      "prompt-code-rules",
      "gamedev://prompts/code-rules",
      { mimeType: "text/markdown", description: "AI code generation rules for game dev" },
      async () => ({
        contents: [{
          uri: "gamedev://prompts/code-rules",
          mimeType: "text/markdown" as const,
          text: fs.readFileSync(codeRulesPath, "utf-8"),
        }],
      })
    );
  }

  for (const mod of activeModules) {
    const rulesPath = path.join(docsRoot, mod, `${mod}-rules.md`);
    if (fs.existsSync(rulesPath)) {
      server.resource(
        `prompt-${mod}`,
        `gamedev://prompts/${mod}`,
        { mimeType: "text/markdown", description: `${mod} specific rules` },
        async () => ({
          contents: [{
            uri: `gamedev://prompts/${mod}`,
            mimeType: "text/markdown" as const,
            text: fs.readFileSync(rulesPath, "utf-8"),
          }],
        })
      );
    }
  }

  return {
    start: async () => {
      const transport = new StdioServerTransport();
      await server.connect(transport);
      console.error(`[gamecodex] Server started on stdio (v${SERVER_VERSION})`);

      const shutdown = () => {
        analytics.shutdown();
        process.exit(0);
      };
      process.on("SIGINT", shutdown);
      process.on("SIGTERM", shutdown);
    },
  };
}
