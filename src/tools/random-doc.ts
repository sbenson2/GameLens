import { DocStore } from "../core/docs.js";

interface RandomDocArgs {
  category?: string;
  module?: string;
  engine?: string;
}

interface Doc {
  id: string;
  title: string;
  module: string;
  category: string;
  content: string;
  description?: string;
}

interface ModuleMetadata {
  id: string;
  label: string;
  engine: string;
  docCount: number;
  sections: string[];
  description?: string;
  hasRules: boolean;
}

type ToolResult = { content: Array<{ type: "text"; text: string }> };

/**
 * Pick a random doc from the available docs, optionally filtered by category, module, or engine.
 * Returns the doc's metadata and a preview (first ~500 chars) to encourage discovery
 * without dumping full content into context.
 */
export function handleRandomDoc(
  args: RandomDocArgs,
  docStore: DocStore,
  modulesMeta?: ModuleMetadata[]
): ToolResult {
  let docs = docStore.getAllDocs();

  // Filter by module
  if (args.module) {
    const lowerMod = args.module.toLowerCase();
    docs = docs.filter((d) => d.module.toLowerCase() === lowerMod);
  }

  // Filter by engine (resolve engine name to module IDs)
  if (args.engine && modulesMeta) {
    const lowerEngine = args.engine.toLowerCase();
    const matchingModuleIds = modulesMeta
      .filter(
        (m) =>
          m.engine.toLowerCase().includes(lowerEngine) ||
          m.id.toLowerCase().includes(lowerEngine)
      )
      .map((m) => m.id);

    if (matchingModuleIds.length === 0) {
      const available = modulesMeta.map((m) => m.engine).join(", ");
      return {
        content: [
          {
            type: "text",
            text: `No modules found for engine "${args.engine}".\n\nAvailable engines: ${available}`,
          },
        ],
      };
    }

    // Include core docs alongside engine-specific docs
    docs = docs.filter(
      (d) => matchingModuleIds.includes(d.module) || d.module === "core"
    );
  }

  // Filter by category
  if (args.category) {
    const lowerCat = args.category.toLowerCase();
    docs = docs.filter((d) => d.category.toLowerCase() === lowerCat);
  }

  if (docs.length === 0) {
    const filters: string[] = [];
    if (args.category) filters.push(`category="${args.category}"`);
    if (args.module) filters.push(`module="${args.module}"`);
    if (args.engine) filters.push(`engine="${args.engine}"`);
    return {
      content: [
        {
          type: "text",
          text: `No docs found matching filters: ${filters.join(", ")}.\n\nTry list_docs to see available docs, or remove filters for a random pick from all docs.`,
        },
      ],
    };
  }

  // Pick a random doc
  const randomIndex = Math.floor(Math.random() * docs.length);
  const doc = docs[randomIndex];

  // Build preview — first ~500 chars of content, breaking at paragraph boundary
  const contentPreview = buildPreview(doc.content, 500);
  const sizeKB = Math.round(doc.content.length / 1024);

  let output = `# 🎲 Random Doc: ${doc.title}\n\n`;
  output += `**ID:** \`${doc.id}\` | **Module:** ${doc.module} | **Category:** ${doc.category} | **Size:** ${sizeKB}KB\n`;
  if (doc.description) {
    output += `**Description:** ${doc.description}\n`;
  }
  output += `\n---\n\n`;
  output += `${contentPreview}\n\n`;
  output += `---\n\n`;
  output += `_Use \`get_doc("${doc.id}")\` to read the full document._\n`;
  output += `_Picked from ${docs.length} matching docs._`;

  return { content: [{ type: "text", text: output }] };
}

/**
 * Build a preview of markdown content, truncating at a paragraph boundary.
 * Skips the title heading (first # line) since we show it separately.
 */
function buildPreview(content: string, maxChars: number): string {
  const lines = content.split("\n");

  // Skip the first heading if it's a title (# ...)
  let startLine = 0;
  if (lines.length > 0 && /^#\s+/.test(lines[0])) {
    startLine = 1;
    // Also skip any blank lines after the title
    while (startLine < lines.length && lines[startLine].trim() === "") {
      startLine++;
    }
  }

  const body = lines.slice(startLine).join("\n");

  if (body.length <= maxChars) {
    return body;
  }

  // Try to break at a paragraph boundary
  const cutPoint = body.lastIndexOf("\n\n", maxChars);
  const breakAt =
    cutPoint > maxChars * 0.4
      ? cutPoint
      : body.lastIndexOf("\n", maxChars);
  const finalBreak = breakAt > maxChars * 0.3 ? breakAt : maxChars;

  return body.slice(0, finalBreak).trimEnd() + "\n\n**...**";
}
