import { DocStore } from "../core/docs.js";
import { SearchEngine } from "../core/search.js";
import { ModuleMetadata } from "../core/modules.js";

export interface SearchDocsArgs {
  query: string;
  category?: string;
  module?: string;
  engine?: string;
  crossEngine?: boolean;
}

/**
 * Handle search_docs with cross-engine awareness.
 * 
 * When `engine` is specified, results are filtered to that engine's module(s).
 * When `crossEngine` is true (or no module/engine filter), results from ALL
 * modules are returned with engine labels for easy comparison.
 * 
 * Module metadata is used to resolve engine names → module IDs and to
 * label results with human-readable engine names.
 */
export function handleSearchDocs(
  args: SearchDocsArgs,
  docStore: DocStore,
  searchEngine: SearchEngine,
  modulesMeta?: ModuleMetadata[]
): { content: Array<{ type: "text"; text: string }> } {
  let docs = docStore.getAllDocs();

  // Build engine→module mapping from metadata
  const engineToModules = new Map<string, string[]>();
  const moduleToEngine = new Map<string, string>();
  const moduleToLabel = new Map<string, string>();
  if (modulesMeta) {
    for (const mod of modulesMeta) {
      const lowerEngine = mod.engine.toLowerCase();
      const existing = engineToModules.get(lowerEngine) ?? [];
      existing.push(mod.id);
      engineToModules.set(lowerEngine, existing);
      moduleToEngine.set(mod.id, mod.engine);
      moduleToLabel.set(mod.id, mod.label);
    }
  }
  // Core is always "Core"
  moduleToEngine.set("core", "Core");
  moduleToLabel.set("core", "Core (engine-agnostic)");

  // Apply filters
  if (args.category) {
    docs = docs.filter((d) => d.category === args.category);
  }

  if (args.engine) {
    // Resolve engine name to module IDs
    const lowerEngine = args.engine.toLowerCase();
    const matchingModules = engineToModules.get(lowerEngine);
    if (matchingModules && matchingModules.length > 0) {
      // Include core docs too when filtering by engine (they're always relevant)
      docs = docs.filter(
        (d) => matchingModules.includes(d.module) || d.module === "core"
      );
    } else {
      // Try partial match
      const partialMatch = Array.from(engineToModules.entries()).find(
        ([eng]) => eng.includes(lowerEngine) || lowerEngine.includes(eng)
      );
      if (partialMatch) {
        docs = docs.filter(
          (d) => partialMatch[1].includes(d.module) || d.module === "core"
        );
      } else {
        const availableEngines = Array.from(engineToModules.keys())
          .map((e) => e.charAt(0).toUpperCase() + e.slice(1))
          .join(", ");
        return {
          content: [{
            type: "text",
            text: `No modules found for engine "${args.engine}".\n\nAvailable engines: ${availableEngines || "none"}\n\nTip: Use \`list_modules\` to see all available engine modules.`,
          }],
        };
      }
    }
  } else if (args.module) {
    docs = docs.filter((d) => d.module === args.module);
  }

  const results = searchEngine.search(args.query, docs, 10);

  if (results.length === 0) {
    return {
      content: [{ type: "text", text: `No docs found matching "${args.query}".` }],
    };
  }

  // Determine if this is a cross-engine result set
  const resultModules = new Set(results.map((r) => r.doc.module));
  const isCrossEngine = resultModules.size > 1 || args.crossEngine;

  // Format results with engine labels when cross-engine
  const lines = results.map((r, i) => {
    const scoreStr = r.score.toFixed(1);
    const engineLabel = moduleToEngine.get(r.doc.module) ?? r.doc.module;
    const engineTag = isCrossEngine ? ` [${engineLabel}]` : "";
    const desc = r.doc.description ? `\n   _${r.doc.description}_` : "";
    return `${i + 1}. **${r.doc.id}** — ${r.doc.title}${engineTag} [${r.doc.module}/${r.doc.category}] (score: ${scoreStr})${desc}\n   ${r.snippet.split("\n")[0]}\n`;
  });

  // Add cross-engine summary header when results span multiple engines
  let header = `Found ${results.length} results for "${args.query}"`;
  if (isCrossEngine && resultModules.size > 1) {
    const engines = Array.from(resultModules)
      .map((m) => moduleToEngine.get(m) ?? m)
      .filter((v, i, a) => a.indexOf(v) === i); // unique
    header += ` across ${engines.length} engines (${engines.join(", ")})`;
  }
  header += ":\n\n";

  // Group by engine when cross-engine and enough results
  if (isCrossEngine && resultModules.size > 1 && results.length >= 4) {
    const grouped = new Map<string, typeof results>();
    for (const r of results) {
      const eng = moduleToEngine.get(r.doc.module) ?? r.doc.module;
      const arr = grouped.get(eng) ?? [];
      arr.push(r);
      grouped.set(eng, arr);
    }

    const groupedLines: string[] = [];
    let rank = 1;
    for (const [eng, groupResults] of grouped) {
      groupedLines.push(`### ${eng}\n`);
      for (const r of groupResults) {
        const scoreStr = r.score.toFixed(1);
        groupedLines.push(
          `${rank}. **${r.doc.id}** — ${r.doc.title} [${r.doc.category}] (score: ${scoreStr})${r.doc.description ? `\n   _${r.doc.description}_` : ""}\n   ${r.snippet.split("\n")[0]}\n`
        );
        rank++;
      }
      groupedLines.push("");
    }

    return {
      content: [{
        type: "text",
        text: header + groupedLines.join("\n"),
      }],
    };
  }

  return {
    content: [
      {
        type: "text",
        text: header + lines.join("\n"),
      },
    ],
  };
}
