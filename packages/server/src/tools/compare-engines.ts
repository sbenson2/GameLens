import { DocStore, Doc } from "../core/docs.js";
import { SearchEngine } from "../core/search.js";
import { ModuleMetadata } from "../core/modules.js";

export interface CompareEnginesArgs {
  topic: string;
  engines?: string[];
  maxDocsPerEngine?: number;
}

/**
 * Topic synonyms/aliases to improve matching.
 * Maps common alternative terms to canonical search terms.
 */
const TOPIC_SYNONYMS: Record<string, string[]> = {
  "state machine": ["fsm", "finite state", "state pattern"],
  "fsm": ["state machine", "finite state"],
  "input": ["input handling", "controls", "keyboard", "gamepad"],
  "camera": ["camera system", "camera follow", "screen shake"],
  "physics": ["collision", "rigidbody", "physics body"],
  "collision": ["physics", "hitbox", "hurtbox"],
  "tilemap": ["tile map", "tiles", "tile system"],
  "ui": ["user interface", "gui", "hud", "menu"],
  "save": ["save load", "serialization", "persistence"],
  "animation": ["sprite animation", "animated sprite"],
  "pathfinding": ["navigation", "a star", "nav mesh"],
  "signals": ["events", "event system", "observer"],
  "ecs": ["entity component system", "entities"],
  "scene": ["scene management", "scene composition", "scene tree"],
  "networking": ["multiplayer", "netcode", "online"],
  "audio": ["sound", "music", "sfx"],
  "particles": ["particle system", "vfx", "effects"],
  "combat": ["damage", "health", "attack", "fighting"],
  "ai": ["artificial intelligence", "enemy ai", "behavior tree", "steering"],
  "pooling": ["object pool", "recycling"],
};

/**
 * Known topic→concept mappings for finding theory docs.
 */
const TOPIC_TO_CONCEPT: Record<string, string> = {
  "camera": "camera-theory",
  "physics": "physics-theory",
  "collision": "physics-theory",
  "animation": "animation-theory",
  "audio": "audio-theory",
  "sound": "audio-theory",
  "ai": "ai-theory",
  "pathfinding": "pathfinding-theory",
  "navigation": "pathfinding-theory",
  "tilemap": "tilemap-theory",
  "particles": "particles-theory",
  "vfx": "particles-theory",
  "input": "input-handling-theory",
  "controls": "input-handling-theory",
  "ui": "ui-theory",
  "hud": "ui-theory",
  "networking": "networking-theory",
  "multiplayer": "networking-theory",
  "lighting": "lighting-2d-theory",
  "procedural": "procedural-generation-theory",
  "fog of war": "fog-of-war-theory",
  "scene": "scene-management-theory",
  "tweening": "tweening-theory",
  "tween": "tweening-theory",
  "combat": "combat-theory",
  "damage": "combat-theory",
  "character": "character-controller-theory",
  "movement": "character-controller-theory",
  "game loop": "game-loop-theory",
};

interface EngineResult {
  engine: string;
  moduleId: string;
  docs: Array<{
    id: string;
    title: string;
    category: string;
    relevance: number;
    preview: string;
  }>;
}

interface CompareResult {
  topic: string;
  theoryDoc: { id: string; title: string; preview: string } | null;
  engines: EngineResult[];
  summary: string;
}

/**
 * Extract a preview from doc content — first meaningful paragraph, up to 300 chars.
 */
function extractPreview(content: string, maxLen: number = 300): string {
  const lines = content.split("\n");
  let pastTitle = false;
  const paragraphLines: string[] = [];

  for (const line of lines) {
    if (line.startsWith("# ")) {
      pastTitle = true;
      continue;
    }
    if (!pastTitle) continue;

    const trimmed = line.trim();
    if (trimmed === "" && paragraphLines.length > 0) break;
    if (trimmed === "") continue;
    if (trimmed.startsWith("![")) continue; // skip images
    if (trimmed.startsWith("---")) continue;
    if (trimmed.startsWith("```")) break; // stop at code blocks
    if (trimmed.startsWith("## ") && paragraphLines.length > 0) break;

    // Clean markdown
    const clean = trimmed
      .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
      .replace(/[*_`]/g, "")
      .replace(/^>\s*/, "");
    paragraphLines.push(clean);
  }

  const preview = paragraphLines.join(" ");
  if (preview.length > maxLen) {
    const truncated = preview.slice(0, maxLen);
    const lastSpace = truncated.lastIndexOf(" ");
    return (lastSpace > maxLen * 0.5 ? truncated.slice(0, lastSpace) : truncated) + "…";
  }
  return preview || "(No preview available)";
}

/**
 * Extract section headings from a doc to show what it covers.
 */
function extractSections(content: string, maxSections: number = 8): string[] {
  const sections: string[] = [];
  for (const line of content.split("\n")) {
    if (line.startsWith("## ") && !line.startsWith("### ")) {
      const heading = line
        .replace(/^##\s+/, "")
        .replace(/\d+\.\s*/, "") // strip numbering
        .replace(/[*_`]/g, "")
        .trim();
      if (heading && !heading.startsWith("Table of") && !heading.startsWith("References")) {
        sections.push(heading);
      }
    }
    if (sections.length >= maxSections) break;
  }
  return sections;
}

/**
 * Handle compare_engines tool — compares how different engines approach a topic.
 */
export function handleCompareEngines(
  args: CompareEnginesArgs,
  docStore: DocStore,
  searchEngine: SearchEngine,
  modulesMeta: ModuleMetadata[]
): { content: Array<{ type: "text"; text: string }> } {
  const topic = args.topic.trim().toLowerCase();
  const maxDocsPerEngine = args.maxDocsPerEngine ?? 3;

  // Build engine→module mapping
  const engineToModules = new Map<string, ModuleMetadata[]>();
  for (const mod of modulesMeta) {
    const eng = mod.engine.toLowerCase();
    const existing = engineToModules.get(eng) ?? [];
    existing.push(mod);
    engineToModules.set(eng, existing);
  }

  // Determine which engines to compare
  let targetEngines: string[];
  if (args.engines && args.engines.length > 0) {
    // Validate and resolve engine names
    targetEngines = [];
    for (const reqEngine of args.engines) {
      const lower = reqEngine.toLowerCase();
      // Exact match
      if (engineToModules.has(lower)) {
        targetEngines.push(lower);
        continue;
      }
      // Partial match
      const partial = Array.from(engineToModules.keys()).find(
        (e) => e.includes(lower) || lower.includes(e)
      );
      if (partial) {
        targetEngines.push(partial);
        continue;
      }
      // Unknown engine — skip with note
    }

    if (targetEngines.length === 0) {
      const available = Array.from(engineToModules.keys())
        .map((e) => e.charAt(0).toUpperCase() + e.slice(1));
      return {
        content: [{
          type: "text",
          text: `No matching engines found for: ${args.engines.join(", ")}.\n\nAvailable engines: ${available.join(", ")}\n\nTip: Use \`list_modules\` to see all engine modules.`,
        }],
      };
    }
  } else {
    // Compare all available engines
    targetEngines = Array.from(engineToModules.keys());
  }

  // Build expanded search query using synonyms
  let searchQuery = topic;
  const topicLower = topic.toLowerCase();
  for (const [key, synonyms] of Object.entries(TOPIC_SYNONYMS)) {
    if (topicLower.includes(key) || synonyms.some((s) => topicLower.includes(s))) {
      // Add the canonical term if we matched a synonym
      if (!topicLower.includes(key)) {
        searchQuery = `${key} ${searchQuery}`;
      }
      break;
    }
  }

  // Find the core theory doc for this topic
  let theoryDoc: CompareResult["theoryDoc"] = null;
  const conceptId = findConceptDoc(topicLower);
  if (conceptId) {
    const doc = docStore.getDoc(conceptId);
    if (doc) {
      theoryDoc = {
        id: doc.id,
        title: doc.title,
        preview: extractPreview(doc.content, 200),
      };
    }
  }

  // Search each engine's docs
  const engineResults: EngineResult[] = [];

  for (const eng of targetEngines) {
    const mods = engineToModules.get(eng);
    if (!mods) continue;

    const moduleIds = mods.map((m) => m.id);
    const engineDocs = docStore.getAllDocs().filter((d) => moduleIds.includes(d.module));

    if (engineDocs.length === 0) continue;

    // Search within this engine's docs
    const results = searchEngine.search(searchQuery, engineDocs, maxDocsPerEngine * 2);

    // Take top N results with a minimum relevance threshold
    const topResults = results
      .filter((r) => r.score > 0.5)
      .slice(0, maxDocsPerEngine);

    if (topResults.length === 0) continue;

    const engineLabel = mods[0].engine;
    engineResults.push({
      engine: engineLabel,
      moduleId: moduleIds[0],
      docs: topResults.map((r) => ({
        id: r.doc.id,
        title: r.doc.title,
        category: r.doc.category,
        relevance: r.score,
        preview: extractPreview(r.doc.content, 250),
      })),
    });
  }

  // Also search core docs for engine-agnostic content
  const coreDocs = docStore.getAllDocs().filter((d) => d.module === "core");
  const coreResults = searchEngine.search(searchQuery, coreDocs, 3);
  const relevantCore = coreResults
    .filter((r) => r.score > 1.0 && r.doc.id !== conceptId) // exclude the theory doc we already found
    .slice(0, 2);

  // Format output
  return formatComparison(topic, theoryDoc, engineResults, relevantCore, docStore);
}

/**
 * Find the concept theory doc for a topic.
 */
function findConceptDoc(topic: string): string | null {
  // Direct lookup
  if (TOPIC_TO_CONCEPT[topic]) return TOPIC_TO_CONCEPT[topic];

  // Check if any key is contained in the topic
  for (const [key, conceptId] of Object.entries(TOPIC_TO_CONCEPT)) {
    if (topic.includes(key)) return conceptId;
  }

  // Check if topic matches a concept doc ID pattern
  const possibleId = `${topic.replace(/\s+/g, "-")}-theory`;
  return null; // Don't guess — only return known mappings
}

/**
 * Format the comparison output.
 */
function formatComparison(
  topic: string,
  theoryDoc: CompareResult["theoryDoc"],
  engineResults: EngineResult[],
  coreResults: Array<{ doc: Doc; score: number }>,
  docStore: DocStore
): { content: Array<{ type: "text"; text: string }> } {
  const lines: string[] = [];
  const topicTitle = topic.charAt(0).toUpperCase() + topic.slice(1);

  lines.push(`# Engine Comparison: ${topicTitle}\n`);

  // No results at all
  if (engineResults.length === 0 && !theoryDoc && coreResults.length === 0) {
    lines.push(`No docs found for "${topic}" across any engine.\n`);
    lines.push(`**Suggestions:**`);
    lines.push(`- Try a broader term (e.g. "physics" instead of "rigidbody velocity")`);
    lines.push(`- Use \`search_docs\` for a general search`);
    lines.push(`- Use \`list_modules\` to see available engines\n`);
    return { content: [{ type: "text", text: lines.join("\n") }] };
  }

  // Theory foundation
  if (theoryDoc) {
    lines.push(`## 📚 Core Theory\n`);
    lines.push(`**${theoryDoc.id}** — ${theoryDoc.title}`);
    lines.push(`${theoryDoc.preview}\n`);
    lines.push(`_Use \`get_doc("${theoryDoc.id}")\` for the full engine-agnostic theory._\n`);
  }

  // Engine-by-engine comparison
  if (engineResults.length > 0) {
    lines.push(`## 🔄 Engine Implementations\n`);

    for (const result of engineResults) {
      lines.push(`### ${result.engine}\n`);

      for (const doc of result.docs) {
        const scoreStr = doc.relevance.toFixed(1);
        lines.push(`**${doc.id}** — ${doc.title} _(${doc.category}, relevance: ${scoreStr})_`);
        lines.push(`${doc.preview}`);

        // Show key sections for the top doc
        if (doc === result.docs[0]) {
          const fullDoc = docStore.getDoc(doc.id);
          if (fullDoc) {
            const sections = extractSections(fullDoc.content);
            if (sections.length > 0) {
              lines.push(`Key sections: ${sections.join(" · ")}`);
            }
          }
        }
        lines.push(`→ \`get_doc("${doc.id}")\`\n`);
      }
    }
  }

  // Additional core docs
  if (coreResults.length > 0) {
    lines.push(`## 🧩 Also Relevant (Core)\n`);
    for (const r of coreResults) {
      lines.push(`- **${r.doc.id}** — ${r.doc.title} _(${r.doc.category})_ → \`get_doc("${r.doc.id}")\``);
    }
    lines.push("");
  }

  // Comparison summary
  if (engineResults.length >= 2) {
    lines.push(`## 📊 Quick Comparison\n`);
    lines.push(`| Aspect | ${engineResults.map((r) => r.engine).join(" | ")} |`);
    lines.push(`|--------|${engineResults.map(() => "-----").join("|")}|`);

    // Docs available
    lines.push(`| Docs on topic | ${engineResults.map((r) => `${r.docs.length} doc${r.docs.length !== 1 ? "s" : ""}`).join(" | ")} |`);

    // Top doc
    lines.push(`| Best match | ${engineResults.map((r) => `${r.docs[0].id}`).join(" | ")} |`);

    // Top relevance
    lines.push(`| Relevance | ${engineResults.map((r) => r.docs[0].relevance.toFixed(1)).join(" | ")} |`);

    lines.push("");
    lines.push(`_For detailed implementation differences, use \`get_doc\` on the specific docs listed above._`);
    if (theoryDoc) {
      lines.push(`_Start with the theory doc (\`${theoryDoc.id}\`) for engine-agnostic fundamentals, then dive into engine-specific guides._`);
    }
    lines.push("");
  }

  // Single engine — suggest comparing
  if (engineResults.length === 1) {
    lines.push(`\n_Only **${engineResults[0].engine}** has docs on this topic. Other engine modules may not cover "${topic}" yet._\n`);
  }

  return { content: [{ type: "text", text: lines.join("\n") }] };
}