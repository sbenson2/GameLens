/**
 * GameCodex MCP Server — refactored with tool registry pattern.
 *
 * ARCHITECTURE SOURCES:
 *
 * Claude Code (cc referance/):
 * - Tool interface with metadata (isReadOnly, isConcurrencySafe, isDestructive)
 * - Centralized tool registry: getAllBaseTools() → getTools() → assembleToolPool()
 * - Fail-closed defaults on all tool properties
 * - Lazy schema construction via lazySchema()
 * - Consistent error handling wrapping every tool call
 * - Analytics instrumentation at every step
 *
 * MooBot (moobot/):
 * - UUID-based persistent sessions with metadata tracking
 * - Persistent memory.md injected into every conversation
 * - Context % tracking with warnings at 75% and 90%
 * - Stats footer on every response (timing, context %)
 * - Concurrency control (MAX_CONCURRENT with rejection)
 * - Security deny patterns in system prompt
 * - /status, /agents diagnostic commands
 * - Auto-recovery on session errors
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
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

// Tool handlers
import { handleSearchDocs } from "./tools/search-docs.js";
import { handleGetDoc, handleGetDocHybrid } from "./tools/get-doc.js";
import { handleListDocs } from "./tools/list-docs.js";
import { handleSession } from "./tools/session.js";
import { handleGenreLookup, formatGenreResult } from "./tools/genre-lookup.js";
import { handleRandomDoc } from "./tools/random-doc.js";
import { handleCompareEngines } from "./tools/compare-engines.js";
import { handleMigrationGuide } from "./tools/migration-guide.js";
import { handleExplainConcept } from "./tools/explain-concept.js";
import { handleScaffoldProject } from "./tools/scaffold-project.js";
import { handleGenerateGDD } from "./tools/generate-gdd.js";
import { handleReviewArchitecture } from "./tools/review-architecture.js";
import { handleProjectContext } from "./tools/project-context.js";
import { handleTeach } from "./tools/teach.js";
import { handleMemory } from "./tools/memory.js";
import { handleDiagnostics, DiagnosticsContext } from "./tools/diagnostics.js";
import { handleDebugGuide } from "./tools/debug-guide.js";
import { handleGenerateStarter } from "./tools/generate-starter.js";
import { handlePhaseChecklist } from "./tools/phase-checklist.js";
import { handleAssetGuide } from "./tools/asset-guide.js";

// Infrastructure
import { validateLicense, getLicenseKey } from "./license.js";
import { getAnalytics } from "./analytics.js";
import {
  isToolAllowed,
  isModuleAllowed,
  getTierFeatures,
  PRO_GATE_MESSAGE,
  UPGRADE_URL,
} from "./tiers.js";

// Registry (CC-inspired)
import { getToolRegistry } from "./tool-registry.js";
import { ToolDependencies } from "./tool-definition.js";

const SERVER_VERSION = "2.1.0";

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

const CATEGORIES = [
  "reference", "explanation", "guide", "catalog",
  "playbook", "concept", "architecture",
] as const;

const SESSION_ACTIONS = [
  "start", "menu", "plan", "decide",
  "feature", "debug", "scope", "status",
] as const;

// ---- Tool Registration ----

/**
 * Register all tools with the registry.
 *
 * Each tool uses the GameCodexToolDef interface (from CC patterns):
 * - name, description, inputSchema, handler
 * - isReadOnly, isConcurrencySafe (fail-closed defaults)
 * - freeTierRestriction
 * - category, activityDescription
 *
 * The registry auto-wires: tier checks, concurrency control,
 * analytics, and error handling.
 */
function registerAllTools(
  docStore: DocStore,
  searchEngine: SearchEngine,
  hybridSearch: HybridSearchEngine,
  hybridProvider: HybridProvider,
  discoveredModules: ReturnType<typeof discoverModules>,
  activeModules: string[],
  allDocs: ReturnType<DocStore["getAllDocs"]>,
  tier: "free" | "pro",
  diagnosticsCtx: DiagnosticsContext
): void {
  const registry = getToolRegistry();

  // ---- Search & Documentation tools ----

  registry.register({
    name: "search_docs",
    description: "Search gamedev docs by keyword. Returns ranked results with IDs and snippets. Use `engine` to filter by engine. Cross-engine results auto-grouped. Follow up with get_doc for full content.",
    inputSchema: {
      query: z.string().describe("Search query (e.g. 'camera follow', 'A* pathfinding', 'ECS architecture')"),
      category: z.enum(CATEGORIES).optional().describe("Filter by category"),
      module: z.string().optional().describe("Filter by module ID (e.g. 'core', 'monogame-arch', 'godot-arch')"),
      engine: z.string().optional().describe("Filter by engine name (e.g. 'Godot', 'MonoGame', 'Unity'). Also includes core docs. Use list_modules to see available engines."),
      crossEngine: z.boolean().optional().describe("When true, always group results by engine even if only one engine matches."),
    },
    handler: async (args, deps) => {
      const result = await handleSearchDocs(args, deps.docStore, deps.searchEngine, deps.discoveredModules, deps.hybridSearch);
      deps.analytics.recordSearch({
        module: args.module,
        category: args.category,
        resultCount: result.content[0].text.includes("No results") ? 0 : 10,
      });
      return result;
    },
    isReadOnly: true,
    isConcurrencySafe: true,
    freeTierRestriction: "core-only",
    category: "search",
    activityDescription: "Searching docs",
  });

  registry.register({
    name: "get_doc",
    description: "Fetch a gamedev doc by ID. For large docs, use `section` to extract a heading or `maxLength` to limit size. Use list_docs or search_docs to find IDs.",
    inputSchema: {
      id: z.string().describe("Doc ID (e.g. 'G52', 'E6', 'P0', 'camera-theory')"),
      section: z.string().optional().describe("Extract a specific section by heading substring. Case-insensitive."),
      maxLength: z.number().optional().describe("Maximum characters to return. Content is truncated at the nearest paragraph boundary."),
    },
    handler: async (args, deps) => {
      // Module check for free tier
      if (isToolAllowed(deps.tier, "get_doc") === "limited") {
        const doc =
          deps.docStore.getDoc(args.id) ??
          deps.docStore.getAllDocs().find(
            (d: any) => d.id.toLowerCase() === args.id.toLowerCase()
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

      let docResult;
      if (deps.hybridProvider.isHybridEnabled) {
        docResult = await handleGetDocHybrid(args, deps.docStore, deps.hybridProvider);
      } else {
        docResult = handleGetDoc(args, deps.docStore);
      }

      // Analytics
      const docForAnalytics = deps.docStore.getDoc(args.id) ??
        deps.docStore.getAllDocs().find((d: any) => d.id.toLowerCase() === args.id.toLowerCase());
      if (docForAnalytics) {
        deps.analytics.recordDocAccess({
          docId: docForAnalytics.id,
          module: docForAnalytics.module,
          usedSection: !!args.section,
          usedMaxLength: !!args.maxLength,
        });
      }

      return docResult;
    },
    isReadOnly: true,
    isConcurrencySafe: true,
    freeTierRestriction: "none", // custom module check in handler
    category: "docs",
    activityDescription: "Fetching doc",
  });

  registry.register({
    name: "list_docs",
    description: "Browse available gamedev docs. Filter by category/module. Use summary=true for compact counts and IDs (saves tokens).",
    inputSchema: {
      category: z.enum(CATEGORIES).optional().describe("Filter by category"),
      module: z.string().optional().describe("Filter by module (e.g. 'core', 'monogame-arch')"),
      summary: z.boolean().optional().describe("If true, return compact counts and IDs only."),
    },
    handler: async (args, deps) => handleListDocs(args, deps.docStore),
    isReadOnly: true,
    isConcurrencySafe: true,
    category: "docs",
    activityDescription: "Listing docs",
  });

  registry.register({
    name: "session",
    description: "Dev session co-pilot — planning, decisions, feature design, debugging, and scope workflows.",
    inputSchema: {
      action: z.enum(SESSION_ACTIONS).describe("Session action to perform"),
    },
    handler: async (args) => handleSession(args),
    isReadOnly: false,
    isConcurrencySafe: false,
    category: "session",
    activityDescription: "Running session workflow",
  });

  registry.register({
    name: "genre_lookup",
    description: "Genre -> required systems mapping. Returns systems, recommended docs, and starter checklist for any game genre.",
    inputSchema: {
      genre: z.string().describe("Game genre (e.g. 'platformer', 'roguelike', 'metroidvania', 'tower-defense', 'rpg')"),
    },
    handler: async (args, deps) => {
      const result = handleGenreLookup(args);
      if (!result.found) {
        return {
          content: [{
            type: "text",
            text: `Genre "${args.genre}" not found.\n\nAvailable genres: ${result.availableGenres.join(", ")}`,
          }],
        };
      }
      const access = isToolAllowed(deps.tier, "genre_lookup");
      const text = access === "limited"
        ? formatGenreResult(result.info, {
            excludeSections: ["requiredSystems", "recommendedDocs"],
            gateMessage: PRO_GATE_MESSAGE,
          })
        : formatGenreResult(result.info);
      return { content: [{ type: "text", text }] };
    },
    isReadOnly: true,
    isConcurrencySafe: true,
    category: "docs",
    activityDescription: "Looking up genre",
  });

  registry.register({
    name: "random_doc",
    description: "Get a random gamedev doc for discovery. Returns preview + metadata. Filter by category, module, or engine.",
    inputSchema: {
      category: z.enum(CATEGORIES).optional().describe("Filter by category"),
      module: z.string().optional().describe("Filter by module ID"),
      engine: z.string().optional().describe("Filter by engine name"),
    },
    handler: async (args, deps) => handleRandomDoc(args, deps.docStore, deps.discoveredModules),
    isReadOnly: true,
    isConcurrencySafe: true,
    freeTierRestriction: "core-only",
    category: "docs",
    activityDescription: "Finding random doc",
  });

  registry.register({
    name: "compare_engines",
    description: "Compare how engines handle the same topic. Shows theory foundation, engine-specific docs, and comparison table.",
    inputSchema: {
      topic: z.string().describe("Topic to compare across engines"),
      engines: z.array(z.string()).optional().describe("Specific engines to compare"),
      maxDocsPerEngine: z.number().optional().describe("Maximum docs per engine (default: 3)"),
    },
    handler: async (args, deps) => handleCompareEngines(args, deps.docStore, deps.searchEngine, deps.discoveredModules),
    isReadOnly: true,
    isConcurrencySafe: true,
    freeTierRestriction: "engine-gate",
    category: "docs",
    activityDescription: "Comparing engines",
  });

  registry.register({
    name: "migration_guide",
    description: "Engine migration guidance — concept mappings, gotchas, relevant docs, and migration strategy between two engines.",
    inputSchema: {
      from: z.string().describe("Source engine to migrate FROM"),
      to: z.string().describe("Target engine to migrate TO"),
      topic: z.string().optional().describe("Focus on a specific topic"),
      maxDocs: z.number().optional().describe("Maximum docs per engine (default: 3)"),
    },
    handler: async (args, deps) => handleMigrationGuide(args, deps.docStore, deps.searchEngine, deps.discoveredModules),
    isReadOnly: true,
    isConcurrencySafe: true,
    freeTierRestriction: "engine-gate",
    category: "docs",
    activityDescription: "Generating migration guide",
  });

  // ---- Phase 1 Tools: Planning, Teaching, Context ----

  registry.register({
    name: "explain_concept",
    description: "Teach any game dev concept at your skill level. Returns adapted explanation + related docs. Set level to beginner/intermediate/advanced.",
    inputSchema: {
      concept: z.string().describe("Game dev concept to explain"),
      level: z.enum(["beginner", "intermediate", "advanced"]).optional().describe("Explanation depth (default: intermediate)"),
      engine: z.string().optional().describe("Focus on a specific engine"),
    },
    handler: async (args, deps) => handleExplainConcept(args, deps.docStore, deps.searchEngine, deps.hybridSearch),
    isReadOnly: true,
    isConcurrencySafe: true,
    category: "learning",
    activityDescription: "Explaining concept",
  });

  registry.register({
    name: "scaffold_project",
    description: "Generate directory structure, setup commands, and starter files for a new game project. Supports MonoGame, Godot, and Phaser.",
    inputSchema: {
      engine: z.string().describe("Target engine: 'monogame', 'godot', or 'phaser'"),
      name: z.string().describe("Project name (used for folder and namespace)"),
      genre: z.string().optional().describe("Game genre for tailored recommendations"),
    },
    handler: async (args) => handleScaffoldProject(args),
    isReadOnly: true, // generates text output, doesn't write files
    isConcurrencySafe: true,
    category: "generation",
    activityDescription: "Scaffolding project",
  });

  registry.register({
    name: "generate_gdd",
    description: "Create a structured Game Design Document from a description. Returns fillable GDD with vision, mechanics, content scope, milestones, and risk plan.",
    inputSchema: {
      description: z.string().describe("Describe your game idea in 1-3 sentences"),
      genre: z.string().optional().describe("Game genre"),
      engine: z.string().optional().describe("Target engine"),
      scope: z.enum(["jam", "demo", "small", "full"]).optional().describe("Project scope (default: small)"),
    },
    handler: async (args) => handleGenerateGDD(args),
    isReadOnly: true,
    isConcurrencySafe: true,
    category: "generation",
    activityDescription: "Generating GDD",
  });

  registry.register({
    name: "review_architecture",
    description: "Analyze a project's file structure and suggest improvements. Engine-aware checks for MonoGame/Godot/Phaser.",
    inputSchema: {
      structure: z.string().describe("Project file/folder structure (paste output of `tree` or describe your layout)"),
      engine: z.string().optional().describe("Engine being used for engine-specific checks"),
      concerns: z.string().optional().describe("Specific concerns to address"),
    },
    handler: async (args, deps) => handleReviewArchitecture(args, deps.docStore, deps.searchEngine),
    isReadOnly: true,
    isConcurrencySafe: true,
    category: "generation",
    activityDescription: "Reviewing architecture",
  });

  registry.register({
    name: "project_context",
    description: "Read or update per-project context (engine, genre, skill level, phase, decisions, goals). Persists as JSON you can save to .gamedev-context.json.",
    inputSchema: {
      action: z.enum(["get", "set", "add_decision", "add_goal", "clear_goals"]).describe("Action to perform"),
      project: z.string().optional().describe("Project name (default: 'default')"),
      engine: z.string().optional().describe("Set engine (for 'set' action)"),
      genre: z.string().optional().describe("Set genre (for 'set' action)"),
      skillLevel: z.enum(["beginner", "intermediate", "advanced"]).optional().describe("Set skill level"),
      phase: z.enum(["planning", "prototype", "production", "polish", "release"]).optional().describe("Set project phase"),
      decision: z.string().optional().describe("Decision text (for 'add_decision')"),
      goal: z.string().optional().describe("Goal text (for 'add_goal')"),
      context: z.string().optional().describe("Full JSON context to restore"),
    },
    handler: async (args) => handleProjectContext(args),
    isReadOnly: false,
    isConcurrencySafe: false,
    category: "session",
    activityDescription: "Managing project context",
  });

  // ---- Phase 2: Teaching Mode ----

  registry.register({
    name: "teach",
    description: "Interactive learning paths with curated lessons, exercises, and progress tracking. Browse paths, start learning, complete lessons.",
    inputSchema: {
      action: z.enum(["list_paths", "start_path", "next_lesson", "lesson", "complete_lesson", "progress"]).describe(
        "list_paths: browse | start_path: begin/resume | next_lesson: next uncompleted | lesson: specific | complete_lesson: mark done | progress: stats"
      ),
      pathId: z.string().optional().describe("Learning path ID"),
      lessonIndex: z.number().optional().describe("Lesson number (1-based)"),
      notes: z.string().optional().describe("Personal notes when completing a lesson"),
      level: z.string().optional().describe("Filter paths by level"),
      engine: z.string().optional().describe("Filter paths by engine"),
    },
    handler: async (args, deps) => handleTeach(args, deps.docStore, deps.searchEngine, deps.hybridSearch),
    isReadOnly: false, // tracks progress
    isConcurrencySafe: false,
    category: "learning",
    activityDescription: "Teaching",
  });

  // ---- New tools from MooBot + CC patterns ----

  registry.register({
    name: "memory",
    description: "Persistent project memory — read, write, or append notes, decisions, and context that survive across sessions. Like a shared notebook for your game project.",
    inputSchema: {
      action: z.enum(["read", "write", "append", "clear", "list_projects"]).describe(
        "read: view memory | write: replace section/all | append: add to section | clear: reset | list_projects: show all"
      ),
      project: z.string().optional().describe("Project name (default: 'default')"),
      section: z.string().optional().describe("Section name (e.g. 'Decisions', 'Architecture Decisions', 'Notes', 'Ongoing')"),
      content: z.string().optional().describe("Content to write or append"),
    },
    handler: async (args, deps) => handleMemory(args, deps.memory),
    isReadOnly: false,
    isConcurrencySafe: false,
    category: "session",
    activityDescription: "Managing memory",
  });

  registry.register({
    name: "diagnostics",
    description: "Server health, session stats, module info, and usage analytics. Use for troubleshooting or understanding your GameCodex setup.",
    inputSchema: {
      action: z.enum(["status", "session", "modules", "analytics", "health"]).describe(
        "status: overview | session: list sessions | modules: module info | analytics: usage stats | health: quick check"
      ),
      project: z.string().optional().describe("Project name for session-related queries"),
    },
    handler: async (args, deps) => {
      return handleDiagnostics(
        args,
        deps.sessionManager,
        deps.memory,
        deps.analytics,
        diagnosticsCtx
      );
    },
    isReadOnly: true,
    isConcurrencySafe: true,
    category: "system",
    activityDescription: "Running diagnostics",
  });

  // ---- License info (inline, lightweight) ----

  registry.register({
    name: "license_info",
    description: "Show license tier, unlocked tools/modules, and usage stats.",
    inputSchema: {},
    handler: async (_args, deps) => {
      const features = getTierFeatures(deps.tier);

      let output = `# License Info\n\n`;
      output += `**Current tier:** ${deps.tier === "pro" ? "Pro" : "Free"}\n`;
      output += `**Description:** ${features.description}\n\n`;

      output += `## Tool Access\n\n`;
      for (const [tool, status] of Object.entries(features.tools)) {
        output += `- **${tool}**: ${status}\n`;
      }
      output += `\n## Accessible Modules\n\n`;
      for (const mod of features.modules) {
        output += `- ${mod}\n`;
      }

      // Vector search status
      output += `\n## Search Engine\n\n`;
      output += `- **Mode:** ${deps.hybridSearch.hasVectorSearch() ? "Hybrid (TF-IDF + vector)" : "Keyword (TF-IDF only)"}\n`;
      if (deps.hybridSearch.hasVectorSearch()) {
        output += `- **Model:** all-MiniLM-L6-v2 (local, 384-dim)\n`;
        output += `- **Embeddings:** cached at \`~/.gamecodex/embeddings/\`\n`;
      }

      // Hybrid/cache info
      if (deps.hybridProvider.isHybridEnabled) {
        const cacheStats = deps.hybridProvider.getCacheStats();
        output += `\n## Remote API\n\n`;
        output += `- **API URL:** ${cacheStats.apiUrl}\n`;
        output += `- **Status:** ${cacheStats.apiAvailable === null ? "Unknown" : cacheStats.apiAvailable ? "Reachable" : "Unreachable"}\n`;
        output += `- **Cached docs:** ${cacheStats.cache.docCount}\n`;
        if (cacheStats.cache.totalSizeBytes > 0) {
          output += `- **Cache size:** ${Math.round(cacheStats.cache.totalSizeBytes / 1024)}KB\n`;
        }
      }

      if (deps.tier === "free") {
        output += `\n---\n\n**Upgrade to Pro for full access:** ${UPGRADE_URL}\n`;
        output += `Run \`gamecodex setup\` to activate your license key.\n`;
      }

      return { content: [{ type: "text", text: output }] };
    },
    isReadOnly: true,
    isConcurrencySafe: true,
    category: "system",
    activityDescription: "Showing license info",
  });

  // ---- List modules (inline) ----

  registry.register({
    name: "list_modules",
    description: "List available engine modules with doc counts, engines, and access info.",
    inputSchema: {
      engine: z.string().optional().describe("Filter by engine name"),
    },
    handler: async (args, deps) => {
      let modules = [...deps.discoveredModules];

      if (args.engine) {
        const lowerEngine = args.engine.toLowerCase();
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

      let output = `# Discovered Modules (${modules.length})\n\n`;

      for (const mod of modules) {
        const active = deps.activeModules.includes(mod.id);
        const statusIcon = active ? "+" : "-";
        const accessNote = deps.tier === "free" && mod.id !== "core"
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

      const coreCount = deps.allDocs.filter((d: any) => d.module === "core").length;
      output += `## + Core (engine-agnostic)\n\n`;
      output += `- **Module ID:** \`core\`\n`;
      output += `- **Docs:** ${coreCount} documents\n`;
      output += `- **Description:** Engine-agnostic game development concepts, patterns, and workflows\n`;
      output += `- **Always active:** Core docs are available on all tiers\n\n`;

      output += `---\n\n`;
      output += `**Total:** ${deps.allDocs.length} docs loaded across ${deps.activeModules.length + 1} active modules\n`;

      if (deps.tier === "free") {
        output += `\n_Free tier: core module only. Upgrade to Pro for engine-specific modules: ${UPGRADE_URL}_\n`;
      }

      return { content: [{ type: "text", text: output }] };
    },
    isReadOnly: true,
    isConcurrencySafe: true,
    category: "docs",
    activityDescription: "Listing modules",
  });

  // ---- Phase 3 tools ----

  registry.register({
    name: "debug_guide",
    description: "Debug helper — takes error/symptom + engine, returns ranked causes, diagnostic checklist, and engine-specific debugging tips. Searches knowledge base for additional context.",
    inputSchema: {
      error: z.string().describe("Error message, exception text, or symptom description (e.g. 'NullReferenceException', 'camera jitters when player moves')"),
      engine: z.string().optional().describe("Engine context: 'monogame', 'godot', or 'phaser'"),
      context: z.string().optional().describe("What you were doing when the error occurred"),
    },
    handler: async (args, deps) => handleDebugGuide(args, deps.docStore, deps.searchEngine, deps.hybridSearch),
    isReadOnly: true,
    isConcurrencySafe: true,
    category: "learning",
    activityDescription: "Generating debug guide",
  });

  registry.register({
    name: "generate_starter",
    description: "Generate feature-specific starter code with educational comments. Goes beyond scaffold_project — gives you working code for a specific feature (movement, combat, inventory, state machine, save/load, UI).",
    inputSchema: {
      engine: z.string().describe("Engine: 'monogame', 'godot', or 'phaser'"),
      feature: z.string().describe("Feature to generate (e.g. 'player movement', 'inventory', 'combat', 'state machine', 'save/load', 'ui')"),
      genre: z.string().optional().describe("Game genre for context (e.g. 'platformer', 'roguelike')"),
      skillLevel: z.enum(["beginner", "intermediate", "advanced"]).optional().describe("Skill level for code complexity"),
    },
    handler: async (args, deps) => handleGenerateStarter(args, deps.docStore, deps.searchEngine, deps.hybridSearch),
    isReadOnly: true,
    isConcurrencySafe: true,
    category: "generation",
    activityDescription: "Generating starter code",
  });

  registry.register({
    name: "phase_checklist",
    description: "Project phase tracker — shows where you are (planning/prototype/production/polish/release) with engine and genre-aware checklists. Prevents scope creep.",
    inputSchema: {
      phase: z.string().optional().describe("Phase: 'planning', 'prototype', 'production', 'polish', 'release'. Omit for overview."),
      engine: z.string().optional().describe("Engine for engine-specific checklist items"),
      genre: z.string().optional().describe("Genre for genre-specific checklist items"),
      completedItems: z.array(z.string()).optional().describe("List of completed checklist item texts (for progress tracking)"),
    },
    handler: async (args) => handlePhaseChecklist(args),
    isReadOnly: true,
    isConcurrencySafe: true,
    category: "session",
    activityDescription: "Generating phase checklist",
  });

  registry.register({
    name: "asset_guide",
    description: "Asset pipeline helper — naming conventions, export settings, engine import steps, and gotchas for sprites, spritesheets, audio, tilemaps, fonts, and particles.",
    inputSchema: {
      assetType: z.string().describe("Asset type: 'sprite', 'spritesheet', 'audio', 'tilemap', 'font', 'particle'"),
      engine: z.string().describe("Target engine: 'monogame', 'godot', or 'phaser'"),
      sourceTool: z.string().optional().describe("Source tool for export tips: 'aseprite', 'photoshop', 'gimp', 'audacity', 'tiled', 'blender'"),
    },
    handler: async (args) => handleAssetGuide(args),
    isReadOnly: true,
    isConcurrencySafe: true,
    category: "docs",
    activityDescription: "Generating asset guide",
  });
}

// ---- Server creation ----

export async function createServer() {
  const startTime = Date.now();
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
  const vectorSearch = new VectorSearch();
  const hybridSearch = new HybridSearchEngine(searchEngine, vectorSearch);

  const allDocs = [...docStore.getAllDocs()];

  // Initialize hybrid search
  await hybridSearch.init(allDocs);

  // Validate license
  const { tier, message: licenseMessage } = await validateLicense();

  // Initialize hybrid provider for remote Pro content
  const apiUrl = process.env.GAMECODEX_API_URL || null;
  const licenseKey = getLicenseKey();
  const hybridProvider = new HybridProvider(docStore, {
    apiUrl,
    licenseKey,
  });

  // Initialize analytics
  const analytics = getAnalytics();

  // Initialize session manager (from MooBot patterns)
  const sessionManager = getSessionManager();

  // Initialize memory store (from MooBot patterns)
  const memory = getMemoryStore();

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

  // Record startup metrics
  analytics.recordStartup({
    version: SERVER_VERSION,
    tier: process.env.GAMECODEX_DEV === "true" ? "dev" : tier,
    startupTimeMs: Date.now() - startTime,
    discoveredModules: discoveredModules.length,
    activeModules: activeModuleMeta.length,
    totalDocs: allDocs.length,
  });

  // ---- Registry setup (CC-inspired tool assembly pipeline) ----

  const registry = getToolRegistry();

  // Set shared dependencies (injected into every tool handler)
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
  };
  registry.setDependencies(deps);

  // Diagnostics context (for /status, /health tools)
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

  // Register all tools
  registerAllTools(
    docStore, searchEngine, hybridSearch, hybridProvider,
    discoveredModules, activeModules, allDocs, tier,
    diagnosticsCtx
  );

  // Create MCP server and wire tools
  const server = new McpServer({
    name: "gamecodex",
    version: SERVER_VERSION,
  });

  registry.wireToServer(server);

  // ---- Resources (unchanged from original) ----

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

      // Graceful shutdown — flush analytics (from MooBot's shutdown pattern)
      const shutdown = () => {
        analytics.shutdown();
        process.exit(0);
      };
      process.on("SIGINT", shutdown);
      process.on("SIGTERM", shutdown);
    },
  };
}
