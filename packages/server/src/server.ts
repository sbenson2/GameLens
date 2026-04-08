/**
 * GameCodex MCP Server v0.3.7 — 5 power tools for game developers.
 *
 * Tools: project (brain), design (plan+ship), docs (knowledge), build (make), meta (internals)
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import * as path from "path";
import * as fs from "fs";

// Core
import { DocStore } from "./core/docs.js";
import { SearchEngine } from "./core/search.js";
import { VectorSearch } from "./core/vector-search.js";
import { HybridSearchEngine } from "./core/hybrid-search.js";
import { discoverModules, resolveActiveModules } from "./core/modules.js";
import { HybridProvider } from "./core/hybrid-provider.js";
import { getSessionManager } from "./core/session-manager.js";
import { getMemoryStore } from "./core/memory.js";
import { getProjectStore } from "./core/project-store.js";
import { getPersonalityEngine } from "./core/personality.js";
import { getHealthTracker } from "./core/health-tracker.js";

// 5 tool definitions
import { projectToolDef } from "./tools/project.js";
import { designToolDef } from "./tools/design.js";
import { docsToolDef } from "./tools/docs.js";
import { buildToolDef } from "./tools/build.js";
import { metaToolDef, setDiagnosticsContext } from "./tools/meta.js";

// Infrastructure
import { DiagnosticsContext } from "./tools/diagnostics.js";
import { validateLicense, getLicenseKey } from "./license.js";
import { getAnalytics } from "./analytics.js";

// Registry
import { getToolRegistry } from "./tool-registry.js";
import { ToolDependencies } from "./tool-definition.js";

// Prompts
import { registerPrompts } from "./prompts.js";

const SERVER_VERSION = "0.3.7";

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

// ---- Tool Registration (5 tools) ----

function registerAllTools(): void {
  const registry = getToolRegistry();
  registry.register(projectToolDef);
  registry.register(designToolDef);
  registry.register(docsToolDef);
  registry.register(buildToolDef);
  registry.register(metaToolDef);
}

// ---- Server creation ----

export async function createServer() {
  const startTime = Date.now();
  const docsRoot = findDocsRoot();

  // Auto-discover modules
  const discoveredModules = discoverModules(docsRoot);
  const activeModuleMeta = resolveActiveModules(
    discoveredModules,
    process.env.GAMEDEV_MODULES
  );
  const activeModules = activeModuleMeta.map((m) => m.id);

  const docStore = new DocStore(docsRoot);
  docStore.load(activeModules);

  const searchEngine = new SearchEngine();
  const vectorSearch = new VectorSearch();
  const hybridSearch = new HybridSearchEngine(searchEngine, vectorSearch);
  const allDocs = [...docStore.getAllDocs()];
  await hybridSearch.init(allDocs);

  // License
  const { tier, message: licenseMessage } = await validateLicense();

  // Hybrid provider
  const apiUrl = process.env.GAMECODEX_API_URL || null;
  const licenseKey = getLicenseKey();
  const hybridProvider = new HybridProvider(docStore, { apiUrl, licenseKey });

  // Infrastructure
  const analytics = getAnalytics();
  const sessionManager = getSessionManager();
  const memory = getMemoryStore();

  // Core modules
  const projectStore = getProjectStore();
  const personality = getPersonalityEngine();
  const healthTracker = getHealthTracker();

  // Logging
  const discoveredNames = discoveredModules.map((m) => `${m.id} (${m.label}, ${m.docCount} docs)`);
  const activeNames = activeModuleMeta.map((m) => m.id);
  console.error(
    `[gamecodex] v${SERVER_VERSION} | Discovered ${discoveredModules.length} modules: ${discoveredNames.join(", ")}`
  );
  console.error(
    `[gamecodex] Active modules: ${activeNames.join(", ")} (${allDocs.length} docs from ${docsRoot})`
  );
  console.error(licenseMessage);
  if (hybridProvider.isHybridEnabled) {
    console.error(`[gamecodex] Hybrid mode: enabled (API: ${apiUrl})`);
  }

  // Record startup
  analytics.recordStartup({
    version: SERVER_VERSION,
    tier: process.env.GAMECODEX_DEV === "true" ? "dev" : tier,
    startupTimeMs: Date.now() - startTime,
    discoveredModules: discoveredModules.length,
    activeModules: activeModuleMeta.length,
    totalDocs: allDocs.length,
  });

  // ---- Registry setup ----

  const registry = getToolRegistry();

  const deps: ToolDependencies = {
    docStore,
    searchEngine,
    hybridSearch,
    hybridProvider,
    discoveredModules,
    sessionManager,
    memory,
    analytics,
    tier,
    serverVersion: SERVER_VERSION,
    activeModules,
    allDocs,
    projectStore,
    personality,
    healthTracker,
  };
  registry.setDependencies(deps);

  const diagnosticsCtx: DiagnosticsContext = {
    serverVersion: SERVER_VERSION,
    tier,
    activeModules,
    totalDocs: allDocs.length,
    discoveredModules: discoveredModules.map((m) => ({
      id: m.id,
      label: m.label,
      docCount: m.docCount,
    })),
    hasVectorSearch: hybridSearch.hasVectorSearch(),
    hasHybridProvider: hybridProvider.isHybridEnabled,
    startTime,
  };
  setDiagnosticsContext(diagnosticsCtx);

  // Register 5 tools
  registerAllTools();

  // Create MCP server
  const server = new McpServer({
    name: "gamecodex",
    version: SERVER_VERSION,
  });

  registry.wireToServer(server);

  // ---- Prompts (workflow entry points) ----
  registerPrompts(server);

  // ---- Resources ----

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

  const sessionPromptPath = path.join(docsRoot, "core", "session", "session-prompt.md");
  if (fs.existsSync(sessionPromptPath)) {
    server.resource(
      "prompt-session",
      "gamedev://prompts/session",
      { mimeType: "text/markdown", description: "Session AI assistant system prompt" },
      async () => ({
        contents: [{
          uri: "gamedev://prompts/session",
          mimeType: "text/markdown" as const,
          text: fs.readFileSync(sessionPromptPath, "utf-8"),
        }],
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
