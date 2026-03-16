import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import * as path from "path";
import * as fs from "fs";
import { DocStore } from "./core/docs.js";
import { SearchEngine } from "./core/search.js";
import { handleSearchDocs } from "./tools/search-docs.js";
import { handleGetDoc } from "./tools/get-doc.js";
import { handleListDocs } from "./tools/list-docs.js";
import { handleSession } from "./tools/session.js";
import { handleGenreLookup } from "./tools/genre-lookup.js";

function findDocsRoot(): string {
  // Try to find docs relative to __dirname (works in CJS)
  const distDir = __dirname;
  const projectRoot = path.dirname(distDir);
  const docsPath = path.join(projectRoot, "docs");
  if (fs.existsSync(docsPath)) return docsPath;

  // Fallback: current working directory
  const cwdDocs = path.join(process.cwd(), "docs");
  if (fs.existsSync(cwdDocs)) return cwdDocs;

  throw new Error(
    `Could not find docs directory. Looked in: ${docsPath}, ${cwdDocs}`
  );
}

const CATEGORIES = [
  "reference", "explanation", "guide", "catalog",
  "playbook", "concept", "architecture",
] as const;

const SESSION_ACTIONS = [
  "start", "menu", "plan", "decide",
  "feature", "debug", "scope", "status",
] as const;

export async function createServer() {
  const activeModules = (process.env.GAMEDEV_MODULES ?? "monogame-arch")
    .split(",")
    .map((m) => m.trim())
    .filter(Boolean);

  const docsRoot = findDocsRoot();
  const docStore = new DocStore(docsRoot);
  docStore.load(activeModules);

  const searchEngine = new SearchEngine();
  searchEngine.index(docStore.getAllDocs());

  const allDocs = docStore.getAllDocs();
  console.error(
    `[gamedev-mcp] Loaded ${allDocs.length} docs from ${docsRoot} (modules: ${activeModules.join(", ")})`
  );

  const server = new McpServer({
    name: "gamedev-mcp-server",
    version: "1.0.0",
  });

  // --- Tools ---

  server.tool(
    "search_docs",
    "Search across all game development docs (core + active engine modules). Returns matching doc snippets with IDs and relevance scores.",
    {
      query: z.string().describe("Search query (e.g. 'camera follow', 'A* pathfinding', 'ECS architecture')"),
      category: z.enum(CATEGORIES).optional().describe("Filter by category"),
      module: z.string().optional().describe("Filter by module (e.g. 'core', 'monogame-arch')"),
    },
    async (args) => handleSearchDocs(args, docStore, searchEngine)
  );

  server.tool(
    "get_doc",
    "Fetch a specific game development doc by ID. Use list_docs or search_docs to find IDs.",
    {
      id: z.string().describe("Doc ID (e.g. 'G52', 'E6', 'P0', 'camera-theory')"),
    },
    async (args) => handleGetDoc(args, docStore)
  );

  server.tool(
    "list_docs",
    "Browse available game development docs. Filter by category and/or module.",
    {
      category: z.enum(CATEGORIES).optional().describe("Filter by category"),
      module: z.string().optional().describe("Filter by module (e.g. 'core', 'monogame-arch')"),
    },
    async (args) => handleListDocs(args, docStore)
  );

  server.tool(
    "session",
    "Dev session co-pilot — structured workflows for game development planning, decisions, feature design, debugging, and scope management.",
    {
      action: z.enum(SESSION_ACTIONS).describe("Session action to perform"),
    },
    async (args) => handleSession(args)
  );

  server.tool(
    "genre_lookup",
    "Quick genre → required systems mapping. Returns required systems, recommended docs, and a starter checklist for a given game genre.",
    {
      genre: z.string().describe("Game genre (e.g. 'platformer', 'roguelike', 'metroidvania', 'tower-defense', 'rpg')"),
    },
    async (args) => handleGenreLookup(args)
  );

  // --- Resources ---

  // Doc resources
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

  // Prompt resources
  const sessionPromptPath = path.join(docsRoot, "core", "session", "session-prompt.md");
  if (fs.existsSync(sessionPromptPath)) {
    server.resource(
      "prompt-session",
      "gamedev://prompts/session",
      { mimeType: "text/markdown", description: "Session co-pilot system prompt" },
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

  // Module-specific prompt resources
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
      console.error("[gamedev-mcp] Server started on stdio");
    },
  };
}
