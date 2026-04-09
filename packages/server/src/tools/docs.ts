/**
 * docs — Unified knowledge base tool (consolidates search_docs + get_doc + list_docs + list_modules).
 *
 * Context7-inspired: one tool, multiple actions. The AI model calls `docs` with
 * an action param to search, fetch, browse, or list modules.
 */

import { z } from "zod";
import { GameCodexToolDef, ToolResult, ToolDependencies } from "../tool-definition.js";
import { miss, unknownAction } from "../core/error-helpers.js";
import { getToolHelp } from "../core/help-generator.js";
import { handleSearchDocs } from "./search-docs.js";
import { handleGetDoc, handleGetDocHybrid } from "./get-doc.js";
import { handleListDocs } from "./list-docs.js";
import { isToolAllowed, isModuleAllowed, PRO_GATE_MESSAGE, UPGRADE_URL } from "../tiers.js";

const CATEGORIES = [
  "reference", "explanation", "guide", "catalog",
  "playbook", "concept", "architecture",
] as const;

export const docsToolDef: GameCodexToolDef = {
  name: "docs",
  description: "Use when: looking up how to do something, finding engine-specific patterns, searching best practices, browsing available knowledge. 950+ curated game dev docs on design, architecture, debugging, and engine patterns. Actions: search, get, browse, modules.",
  inputSchema: {
    action: z.enum(["help", "search", "get", "browse", "modules"]).describe(
      "search: keyword query (use when user asks 'how do I...' or needs to find a pattern) | get: fetch full doc by ID (use after search to read a specific doc) | browse: list/filter all docs | modules: list available engines and doc counts"
    ),
    query: z.string().optional().describe("Search query (for 'search' action)"),
    id: z.string().optional().describe("Doc ID to fetch (for 'get' action, e.g. 'G52', 'E6', 'P0')"),
    section: z.string().optional().describe("Extract specific section by heading (for 'get' action)"),
    maxLength: z.number().optional().describe("Max chars to return (for 'get' action)"),
    category: z.enum(CATEGORIES).optional().describe("Filter by category"),
    module: z.string().optional().describe("Filter by module ID (e.g. 'core', 'godot-arch', 'unity-arch', 'bevy-arch')"),
    engine: z.string().optional().describe("Filter by engine name (e.g. 'Godot', 'Unity', 'Bevy', 'Phaser')"),
    crossEngine: z.boolean().optional().describe("Group search results by engine"),
    summary: z.boolean().optional().describe("Compact output for browse"),
  },
  handler: async (args: Record<string, unknown>, deps: ToolDependencies): Promise<ToolResult> => {
    const action = args.action as string;

    switch (action) {
      case "help":
        return getToolHelp("docs");

      case "search": {
        if (!args.query) return miss("query", "docs", "search");
        const result = await handleSearchDocs(
          {
            query: args.query as string,
            category: args.category as string | undefined,
            module: args.module as string | undefined,
            engine: args.engine as string | undefined,
            crossEngine: args.crossEngine as boolean | undefined,
          },
          deps.docStore,
          deps.searchEngine,
          deps.discoveredModules,
          deps.hybridSearch,
        );
        deps.analytics.recordSearch({
          module: args.module,
          category: args.category,
          resultCount: result.content[0].text.includes("No results") ? 0 : 10,
        });
        return result;
      }

      case "get": {
        if (!args.id) return miss("id", "docs", "get");
        // Module check for free tier
        if (isToolAllowed(deps.tier, "docs") === "limited") {
          const doc =
            deps.docStore.getDoc(args.id as string) ??
            deps.docStore.getAllDocs().find(
              (d: any) => d.id.toLowerCase() === (args.id as string).toLowerCase()
            );
          if (doc && !isModuleAllowed(deps.tier, doc.module)) {
            return {
              content: [{
                type: "text",
                text: `The doc "${args.id}" is part of the ${doc.module} module, which requires a Pro license. ${PRO_GATE_MESSAGE}`,
              }],
            };
          }
        }

        const getArgs = {
          id: args.id as string,
          section: args.section as string | undefined,
          maxLength: args.maxLength as number | undefined,
        };

        let docResult;
        if (deps.hybridProvider.isHybridEnabled) {
          docResult = await handleGetDocHybrid(getArgs, deps.docStore, deps.hybridProvider);
        } else {
          docResult = handleGetDoc(getArgs, deps.docStore);
        }

        // Analytics
        const docForAnalytics = deps.docStore.getDoc(args.id as string) ??
          deps.docStore.getAllDocs().find((d: any) => d.id.toLowerCase() === (args.id as string).toLowerCase());
        if (docForAnalytics) {
          deps.analytics.recordDocAccess({
            docId: docForAnalytics.id,
            module: docForAnalytics.module,
            usedSection: !!args.section,
            usedMaxLength: !!args.maxLength,
          });
        }

        return docResult;
      }

      case "browse": {
        return handleListDocs(
          {
            category: args.category as string | undefined,
            module: args.module as string | undefined,
            summary: args.summary as boolean | undefined,
          },
          deps.docStore,
        );
      }

      case "modules": {
        let modules = [...deps.discoveredModules];

        if (args.engine) {
          const lowerEngine = (args.engine as string).toLowerCase();
          modules = modules.filter((m: any) =>
            m.engine.toLowerCase().includes(lowerEngine) ||
            m.id.toLowerCase().includes(lowerEngine)
          );
        }

        if (modules.length === 0) {
          const available = deps.discoveredModules.map((m: any) => m.engine).join(", ");
          return {
            content: [{
              type: "text",
              text: args.engine
                ? `No modules found for engine "${args.engine}".\n\nAvailable engines: ${available}`
                : "No modules discovered.",
            }],
          };
        }

        let output = `# Available Modules (${modules.length})\n\n`;
        for (const mod of modules) {
          const accessNote = deps.tier === "free" && mod.id !== "core" ? " _(Pro)_" : "";
          output += `- **${mod.label}**${accessNote} — \`${mod.id}\` (${mod.docCount} docs)\n`;
        }

        const coreCount = deps.allDocs.filter((d: any) => d.module === "core").length;
        output += `- **Core** — \`core\` (${coreCount} docs, always available)\n\n`;
        output += `**Total:** ${deps.allDocs.length} docs across ${deps.activeModules.length + 1} modules\n`;

        return { content: [{ type: "text", text: output }] };
      }

      default:
        return unknownAction(action, ["help", "search", "get", "browse", "modules"], "docs");
    }
  },
  isReadOnly: true,
  isConcurrencySafe: true,
  freeTierRestriction: "core-only",
  category: "docs",
  activityDescription: "Querying knowledge base",
};
