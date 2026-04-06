import { DocStore } from "../core/docs.js";
import { SearchEngine } from "../core/search.js";

type ToolResult = { content: Array<{ type: "text"; text: string }> };

interface FileInfo {
  path: string;
  type: "directory" | "file";
  extension?: string;
}

/**
 * review_architecture — Analyze a project structure description and suggest improvements.
 *
 * Accepts a file/folder listing (as text) and the engine being used.
 * Returns architecture feedback based on the knowledge base best practices.
 */
export function handleReviewArchitecture(
  args: {
    structure: string;
    engine?: string;
    concerns?: string;
  },
  docStore: DocStore,
  searchEngine: SearchEngine,
): ToolResult {
  const structure = args.structure.trim();
  if (!structure) {
    return {
      content: [{
        type: "text",
        text: "Please provide your project structure. You can paste the output of `tree`, `ls -R`, or just describe your folder layout.",
      }],
    };
  }

  const engine = args.engine?.toLowerCase() ?? "unknown";

  // Parse the structure to identify patterns
  const files = parseStructure(structure);
  const issues: string[] = [];
  const suggestions: string[] = [];
  const goodPatterns: string[] = [];

  // --- Engine-agnostic checks ---

  // Check for separation of concerns
  const hasScenesDir = files.some((f) => f.path.toLowerCase().includes("scene"));
  const hasSystemsDir = files.some((f) => f.path.toLowerCase().includes("system"));
  const hasComponentsDir = files.some((f) => f.path.toLowerCase().includes("component"));
  const hasEntitiesDir = files.some((f) => f.path.toLowerCase().includes("entit"));
  const hasScriptsDir = files.some((f) => f.path.toLowerCase().includes("script"));
  const hasAssetsDir = files.some(
    (f) =>
      f.path.toLowerCase().includes("asset") ||
      f.path.toLowerCase().includes("content") ||
      f.path.toLowerCase().includes("public"),
  );

  if (hasScenesDir) goodPatterns.push("Scenes/levels separated into their own directory");
  if (hasAssetsDir) goodPatterns.push("Assets/content in dedicated directory");

  // Check for common anti-patterns
  const rootFiles = files.filter((f) => !f.path.includes("/") || f.path.split("/").length <= 2);
  const rootCodeFiles = rootFiles.filter(
    (f) =>
      f.extension &&
      ["cs", "gd", "ts", "js", "py"].includes(f.extension) &&
      !["Program.cs", "main.ts", "main.gd", "Game1.cs", "index.ts"].includes(f.path.split("/").pop() ?? ""),
  );
  if (rootCodeFiles.length > 5) {
    issues.push(
      `${rootCodeFiles.length} code files in root/top-level directory. Consider organizing into subdirectories by concern (Systems/, Components/, Scenes/, etc.)`,
    );
  }

  // Check for test infrastructure
  const hasTests = files.some(
    (f) =>
      f.path.toLowerCase().includes("test") ||
      f.path.toLowerCase().includes("spec"),
  );
  if (hasTests) {
    goodPatterns.push("Test directory present");
  } else {
    suggestions.push(
      "No test directory found. Consider adding tests for core game logic (see docs G17 — Testing)",
    );
  }

  // Check for config/data separation
  const hasDataDir = files.some(
    (f) =>
      f.path.toLowerCase().includes("/data/") ||
      f.path.toLowerCase().includes("/config/"),
  );
  if (!hasDataDir) {
    suggestions.push(
      "Consider a data/ or config/ directory for game balance values, entity definitions, and level data. Data-driven design makes tuning easier (see docs G43 — Entity Prefabs)",
    );
  }

  // --- Engine-specific checks ---

  if (engine.includes("monogame") || engine.includes("arch")) {
    if (hasComponentsDir && hasSystemsDir) {
      goodPatterns.push("ECS pattern: Components/ and Systems/ directories properly separated");
    } else if (!hasComponentsDir || !hasSystemsDir) {
      issues.push(
        "MonoGame + Arch ECS projects should have separate Components/ and Systems/ directories. Components are pure data structs, Systems contain all logic (see docs E1 — Architecture Overview)",
      );
    }

    const hasContentMgcb = files.some((f) => f.path.includes("Content.mgcb"));
    if (!hasContentMgcb) {
      suggestions.push("No Content.mgcb found. MonoGame projects need the MGCB content pipeline (see docs G8 — Content Pipeline)");
    }
  }

  if (engine.includes("godot")) {
    const hasAutoload = files.some((f) => f.path.toLowerCase().includes("autoload"));
    if (hasAutoload) {
      goodPatterns.push("Autoload directory for global singletons (GameManager, SignalBus, etc.)");
    } else {
      suggestions.push(
        "Consider an autoload/ directory for global singletons like GameManager and SignalBus. Register them in Project Settings > Autoload",
      );
    }

    const hasResources = files.some((f) => f.path.toLowerCase().includes("resource"));
    if (!hasResources) {
      suggestions.push("Consider a resources/ directory for custom Resource types (stats, configs, item definitions)");
    }
  }

  if (engine.includes("phaser")) {
    const hasScenesTypescript = files.some(
      (f) => f.path.toLowerCase().includes("scene") && f.extension === "ts",
    );
    if (hasScenesTypescript) {
      goodPatterns.push("Scenes as TypeScript classes (type-safe scene management)");
    }
  }

  // Handle specific user concerns
  if (args.concerns) {
    const concernResults = searchEngine.search(args.concerns, docStore.getAllDocs(), 3);
    if (concernResults.length > 0) {
      suggestions.push(
        `For your concern about "${args.concerns}", check these docs: ${concernResults.map((r) => `\`${r.doc.id}\` (${r.doc.title})`).join(", ")}`,
      );
    }
  }

  // Build output
  let output = `# Architecture Review\n\n`;
  output += `**Engine:** ${args.engine ?? "Not specified"}\n`;
  output += `**Files analyzed:** ${files.length}\n\n`;

  if (goodPatterns.length > 0) {
    output += `## Good Patterns Found\n\n`;
    for (const p of goodPatterns) {
      output += `- ✅ ${p}\n`;
    }
    output += `\n`;
  }

  if (issues.length > 0) {
    output += `## Issues\n\n`;
    for (const issue of issues) {
      output += `- ⚠️ ${issue}\n`;
    }
    output += `\n`;
  }

  if (suggestions.length > 0) {
    output += `## Suggestions\n\n`;
    for (const s of suggestions) {
      output += `- 💡 ${s}\n`;
    }
    output += `\n`;
  }

  // Recommend relevant docs
  output += `## Recommended Reading\n\n`;
  output += `- \`R3\` — Project Structure (folder layout, solution organization)\n`;
  output += `- \`E1\` — Architecture Overview (composed library philosophy)\n`;
  output += `- \`G11\` — Programming Principles (SOLID, composition over inheritance)\n`;
  output += `- \`G12\` — Design Patterns (Observer, Command, State Machine, etc.)\n`;
  if (engine.includes("monogame") || engine.includes("arch")) {
    output += `- \`G1\` — Custom Code Recipes (SceneManager, SpatialHash, glue code)\n`;
  }

  return { content: [{ type: "text", text: output }] };
}

function parseStructure(structure: string): FileInfo[] {
  const files: FileInfo[] = [];
  const lines = structure.split("\n");

  for (const line of lines) {
    // Strip tree-drawing characters (├── └── │ etc.)
    const cleaned = line
      .replace(/[│├└─┬┤┘┐┌┼]/g, "")
      .replace(/\|/g, "")
      .replace(/`--/g, "")
      .replace(/\+--/g, "")
      .trim();

    if (!cleaned || cleaned.startsWith("#")) continue;

    const isDir = cleaned.endsWith("/") || !cleaned.includes(".");
    const extension = isDir ? undefined : cleaned.split(".").pop()?.toLowerCase();

    files.push({
      path: cleaned.replace(/\/$/, ""),
      type: isDir ? "directory" : "file",
      extension,
    });
  }

  return files;
}
