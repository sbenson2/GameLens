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
import { handleGenreLookup, formatGenreResult } from "./tools/genre-lookup.js";
import { validateLicense } from "./license.js";
import {
  Tier,
  isToolAllowed,
  isModuleAllowed,
  getTierFeatures,
  PRO_GATE_MESSAGE,
  UPGRADE_URL,
} from "./tiers.js";

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

type ToolResult = { content: Array<{ type: "text"; text: string }> };

function proGateResponse(): ToolResult {
  return { content: [{ type: "text", text: PRO_GATE_MESSAGE }] };
}

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

  // Validate license
  const { tier, message: licenseMessage } = await validateLicense();

  console.error(
    `[gamedev-mcp] Loaded ${allDocs.length} docs from ${docsRoot} (modules: ${activeModules.join(", ")})`
  );
  console.error(licenseMessage);

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
    async (args) => {
      try {
        const access = isToolAllowed(tier, "search_docs");
        if (access === false) return proGateResponse();

        // Free tier: force module to 'core'
        if (access === "limited") {
          if (args.module && args.module !== "core") {
            return {
              content: [{
                type: "text",
                text: `Searching non-core modules requires a Pro license. ${PRO_GATE_MESSAGE}`,
              }],
            };
          }
          args.module = "core";
        }

        return handleSearchDocs(args, docStore, searchEngine);
      } catch (err) {
        return { content: [{ type: "text", text: `Search error: ${err instanceof Error ? err.message : String(err)}` }] };
      }
    }
  );

  server.tool(
    "get_doc",
    "Fetch a specific game development doc by ID. Returns the full document content. For large docs (50KB+), use `section` to extract a specific heading or `maxLength` to limit output size — this keeps your context window efficient. Use list_docs or search_docs to find IDs.",
    {
      id: z.string().describe("Doc ID (e.g. 'G52', 'E6', 'P0', 'camera-theory')"),
      section: z.string().optional().describe("Extract a specific section by heading substring (e.g. 'Combat System', 'Knockback', 'Save/Load'). Case-insensitive. Returns the matched heading and all content until the next heading of equal or higher level."),
      maxLength: z.number().optional().describe("Maximum characters to return. Content is truncated at the nearest paragraph boundary. Useful for previewing large docs without consuming full context window."),
    },
    async (args) => {
      try {
        const access = isToolAllowed(tier, "get_doc");
        if (access === false) return proGateResponse();

        if (access === "limited") {
          // Check if doc belongs to a non-core module
          const doc =
            docStore.getDoc(args.id) ??
            docStore.getAllDocs().find(
              (d) => d.id.toLowerCase() === args.id.toLowerCase()
            );
          if (doc && !isModuleAllowed(tier, doc.module)) {
            return {
              content: [{
                type: "text",
                text: `The doc "${args.id}" is part of the ${doc.module} module, which requires a Pro license. ${PRO_GATE_MESSAGE}`,
              }],
            };
          }
        }

        return handleGetDoc(args, docStore);
      } catch (err) {
        return { content: [{ type: "text", text: `Error fetching doc: ${err instanceof Error ? err.message : String(err)}` }] };
      }
    }
  );

  server.tool(
    "list_docs",
    "Browse available game development docs. Filter by category and/or module.",
    {
      category: z.enum(CATEGORIES).optional().describe("Filter by category"),
      module: z.string().optional().describe("Filter by module (e.g. 'core', 'monogame-arch')"),
    },
    async (args) => {
      try {
        return handleListDocs(args, docStore);
      } catch (err) {
        return { content: [{ type: "text", text: `Error listing docs: ${err instanceof Error ? err.message : String(err)}` }] };
      }
    }
  );

  server.tool(
    "session",
    "Dev session co-pilot — structured workflows for game development planning, decisions, feature design, debugging, and scope management.",
    {
      action: z.enum(SESSION_ACTIONS).describe("Session action to perform"),
    },
    async (args) => {
      try {
        if (!isToolAllowed(tier, "session")) return proGateResponse();
        return handleSession(args);
      } catch (err) {
        return { content: [{ type: "text", text: `Session error: ${err instanceof Error ? err.message : String(err)}` }] };
      }
    }
  );

  server.tool(
    "genre_lookup",
    "Quick genre → required systems mapping. Returns required systems, recommended docs, and a starter checklist for a given game genre.",
    {
      genre: z.string().describe("Game genre (e.g. 'platformer', 'roguelike', 'metroidvania', 'tower-defense', 'rpg')"),
    },
    async (args) => {
      try {
        const access = isToolAllowed(tier, "genre_lookup");
        if (access === false) return proGateResponse();

        const result = handleGenreLookup(args);

        if (!result.found) {
          return {
            content: [{
              type: "text",
              text: `Genre "${args.genre}" not found.\n\nAvailable genres: ${result.availableGenres.join(", ")}`,
            }],
          };
        }

        // Free tier: exclude Pro-only sections using structured data
        const text = access === "limited"
          ? formatGenreResult(result.info, {
              excludeSections: ["requiredSystems", "recommendedDocs"],
              gateMessage: PRO_GATE_MESSAGE,
            })
          : formatGenreResult(result.info);

        return { content: [{ type: "text", text }] };
      } catch (err) {
        return { content: [{ type: "text", text: `Genre lookup error: ${err instanceof Error ? err.message : String(err)}` }] };
      }
    }
  );

  server.tool(
    "license_info",
    "Show current license tier, what tools and modules are unlocked, and upgrade URL.",
    {},
    async () => {
      try {
      const features = getTierFeatures(tier);

      let output = `# License Info\n\n`;
      output += `**Current tier:** ${tier === "pro" ? "Pro" : "Free"}\n`;
      output += `**Description:** ${features.description}\n\n`;
      output += `## Tool Access\n\n`;
      for (const [tool, status] of Object.entries(features.tools)) {
        output += `- **${tool}**: ${status}\n`;
      }
      output += `\n## Accessible Modules\n\n`;
      for (const mod of features.modules) {
        output += `- ${mod}\n`;
      }

      if (tier === "free") {
        output += `\n---\n\n**Upgrade to Pro:** ${UPGRADE_URL}\n`;
        output += `Set your license key via \`GAMEDEV_MCP_LICENSE\` env var or \`~/.gamedev-mcp/license.json\`\n`;
      }

      return { content: [{ type: "text", text: output }] };
      } catch (err) {
        return { content: [{ type: "text", text: `License info error: ${err instanceof Error ? err.message : String(err)}` }] };
      }
    }
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
