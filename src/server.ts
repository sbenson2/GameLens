import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import * as path from "path";
import * as fs from "fs";
import { DocStore } from "./core/docs.js";
import { SearchEngine } from "./core/search.js";
import { discoverModules, resolveActiveModules, ModuleMetadata } from "./core/modules.js";
import { HybridProvider } from "./core/hybrid-provider.js";
import { handleSearchDocs } from "./tools/search-docs.js";
import { handleGetDoc, handleGetDocHybrid } from "./tools/get-doc.js";
import { handleListDocs } from "./tools/list-docs.js";
import { handleSession } from "./tools/session.js";
import { handleGenreLookup, formatGenreResult } from "./tools/genre-lookup.js";
import { validateLicense, getLicenseKey } from "./license.js";
import { checkSearchLimit, checkGetDocLimit, getUsageStats } from "./rate-limit.js";
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
  const docsRoot = findDocsRoot();

  // Auto-discover modules from docs directory
  const discoveredModules = discoverModules(docsRoot);
  const activeModuleMeta = resolveActiveModules(
    discoveredModules,
    process.env.GAMEDEV_MODULES
  );
  const activeModules = activeModuleMeta.map((m) => m.id);

  const docStore = new DocStore(docsRoot);
  docStore.load(activeModules);

  const searchEngine = new SearchEngine();
  searchEngine.index(docStore.getAllDocs());

  const allDocs = docStore.getAllDocs();

  // Validate license
  const { tier, message: licenseMessage } = await validateLicense();

  // Initialize hybrid provider for remote Pro content
  const apiUrl = process.env.GAMEDEV_MCP_API_URL || null;
  const licenseKey = getLicenseKey();
  const hybridProvider = new HybridProvider(docStore, {
    apiUrl,
    licenseKey,
  });

  const discoveredNames = discoveredModules.map((m) => `${m.id} (${m.label}, ${m.docCount} docs)`);
  const activeNames = activeModuleMeta.map((m) => m.id);
  console.error(
    `[gamedev-mcp] Discovered ${discoveredModules.length} modules: ${discoveredNames.join(", ")}`
  );
  console.error(
    `[gamedev-mcp] Active modules: ${activeNames.join(", ")} (${allDocs.length} docs from ${docsRoot})`
  );
  console.error(licenseMessage);
  if (hybridProvider.isHybridEnabled) {
    console.error(`[gamedev-mcp] Hybrid mode: enabled (API: ${apiUrl})`);
  }

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

        // Daily rate limit for free tier
        const rateLimit = checkSearchLimit(tier);
        if (!rateLimit.allowed) {
          return {
            content: [{
              type: "text",
              text: `Daily search limit reached (${rateLimit.limit}/day). Resets at ${rateLimit.resetsAt}.\n\nUpgrade to Pro for unlimited searches: ${UPGRADE_URL}`,
            }],
          };
        }

        const result = handleSearchDocs(args, docStore, searchEngine);

        // Append usage info for free tier when getting low
        if (tier === "free" && rateLimit.remaining <= 10 && rateLimit.remaining > 0) {
          const text = result.content[0].text;
          result.content[0].text = text + `\n\n---\n_${rateLimit.remaining} searches remaining today (resets at midnight). Upgrade to Pro for unlimited: ${UPGRADE_URL}_`;
        }

        return result;
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

        // Daily rate limit for free tier
        const docRateLimit = checkGetDocLimit(tier);
        if (!docRateLimit.allowed) {
          return {
            content: [{
              type: "text",
              text: `Daily doc fetch limit reached (${docRateLimit.limit}/day). Resets at ${docRateLimit.resetsAt}.\n\nUpgrade to Pro for unlimited access: ${UPGRADE_URL}`,
            }],
          };
        }

        // Use hybrid provider if enabled, otherwise pure local
        if (hybridProvider.isHybridEnabled) {
          return await handleGetDocHybrid(args, docStore, hybridProvider);
        }
        return handleGetDoc(args, docStore);
      } catch (err) {
        return { content: [{ type: "text", text: `Error fetching doc: ${err instanceof Error ? err.message : String(err)}` }] };
      }
    }
  );

  server.tool(
    "list_docs",
    "Browse available game development docs. Filter by category and/or module. Use summary=true to get compact counts and IDs only (saves tokens). Use full mode (default) for titles and descriptions.",
    {
      category: z.enum(CATEGORIES).optional().describe("Filter by category"),
      module: z.string().optional().describe("Filter by module (e.g. 'core', 'monogame-arch')"),
      summary: z.boolean().optional().describe("If true, return compact counts and IDs only instead of full titles and descriptions. Recommended for initial discovery."),
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
      const usage = getUsageStats(tier);

      let output = `# License Info\n\n`;
      output += `**Current tier:** ${tier === "pro" ? "Pro ✅" : "Free"}\n`;
      output += `**Description:** ${features.description}\n\n`;

      // Usage stats
      if (tier === "free") {
        output += `## Today's Usage\n\n`;
        output += `- **Searches:** ${usage.searches.used}/${usage.searches.limit} (resets at midnight)\n`;
        output += `- **Doc fetches:** ${usage.getDocs.used}/${usage.getDocs.limit} (resets at midnight)\n\n`;
      }

      output += `## Tool Access\n\n`;
      for (const [tool, status] of Object.entries(features.tools)) {
        output += `- **${tool}**: ${status}\n`;
      }
      output += `\n## Accessible Modules\n\n`;
      for (const mod of features.modules) {
        output += `- ${mod}\n`;
      }

      // Hybrid/cache info
      if (hybridProvider.isHybridEnabled) {
        const cacheStats = hybridProvider.getCacheStats();
        output += `\n## Remote API\n\n`;
        output += `- **API URL:** ${cacheStats.apiUrl}\n`;
        output += `- **Status:** ${cacheStats.apiAvailable === null ? "Unknown" : cacheStats.apiAvailable ? "Reachable ✅" : "Unreachable ⚠️"}\n`;
        output += `- **Cached docs:** ${cacheStats.cache.docCount}\n`;
        if (cacheStats.cache.totalSizeBytes > 0) {
          output += `- **Cache size:** ${Math.round(cacheStats.cache.totalSizeBytes / 1024)}KB\n`;
        }
      }

      if (tier === "free") {
        output += `\n---\n\n**Upgrade to Pro for unlimited access:** ${UPGRADE_URL}\n`;
        output += `Set your license key via \`GAMEDEV_MCP_LICENSE\` env var or \`~/.gamedev-mcp/license.json\`\n`;
      }

      return { content: [{ type: "text", text: output }] };
      } catch (err) {
        return { content: [{ type: "text", text: `License info error: ${err instanceof Error ? err.message : String(err)}` }] };
      }
    }
  );

  server.tool(
    "list_modules",
    "List all discovered engine modules with metadata — labels, doc counts, engines, and sections. Use to understand what knowledge is available across engines and find the right module for a project.",
    {
      engine: z.string().optional().describe("Filter by engine name (e.g. 'Godot', 'MonoGame', 'Unity')"),
    },
    async (args) => {
      try {
        let modules = discoveredModules;

        if (args.engine) {
          const lowerEngine = args.engine.toLowerCase();
          modules = modules.filter((m) =>
            m.engine.toLowerCase().includes(lowerEngine) ||
            m.id.toLowerCase().includes(lowerEngine)
          );
        }

        if (modules.length === 0) {
          const available = discoveredModules.map((m) => m.engine).join(", ");
          return {
            content: [{
              type: "text",
              text: args.engine
                ? `No modules found for engine "${args.engine}".\n\nAvailable engines: ${available}`
                : "No modules discovered. Ensure docs/ directory contains engine module subdirectories.",
            }],
          };
        }

        let output = `# Discovered Modules (${modules.length})\n\n`;

        for (const mod of modules) {
          const active = activeModules.includes(mod.id);
          const statusIcon = active ? "✅" : "⬚";
          const accessNote = tier === "free" && mod.id !== "core"
            ? " _(Pro required)_"
            : "";

          output += `## ${statusIcon} ${mod.label}${accessNote}\n\n`;
          output += `- **Module ID:** \`${mod.id}\`\n`;
          output += `- **Engine:** ${mod.engine}\n`;
          output += `- **Docs:** ${mod.docCount} documents\n`;
          if (mod.sections.length > 0) {
            output += `- **Sections:** ${mod.sections.join(", ")}\n`;
          }
          if (mod.description) {
            output += `- **Description:** ${mod.description}\n`;
          }
          if (mod.hasRules) {
            output += `- **AI Rules:** Available (engine-specific code generation rules)\n`;
          }
          output += "\n";
        }

        // Always show core module info
        output += `## ✅ Core (engine-agnostic)\n\n`;
        output += `- **Module ID:** \`core\`\n`;
        const corePath = path.join(docsRoot, "core");
        const coreCount = allDocs.filter((d) => d.module === "core").length;
        output += `- **Docs:** ${coreCount} documents\n`;
        output += `- **Description:** Engine-agnostic game development concepts, patterns, and workflows\n`;
        output += `- **Always active:** Core docs are available on all tiers\n\n`;

        output += `---\n\n`;
        output += `**Total:** ${allDocs.length} docs loaded across ${activeModules.length + 1} active modules (core + ${activeModules.length} engine modules)\n`;

        if (tier === "free") {
          output += `\n_Free tier: core module only. Upgrade to Pro for engine-specific modules: ${UPGRADE_URL}_\n`;
        }

        return { content: [{ type: "text", text: output }] };
      } catch (err) {
        return { content: [{ type: "text", text: `Module listing error: ${err instanceof Error ? err.message : String(err)}` }] };
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
