import { DocStore } from "../core/docs.js";
import { SearchEngine } from "../core/search.js";
import { HybridSearchEngine } from "../core/hybrid-search.js";

type SkillLevel = "beginner" | "intermediate" | "advanced";

type ToolResult = { content: Array<{ type: "text"; text: string }> };

/**
 * explain_concept — Teach any game dev concept at the user's skill level.
 *
 * Searches the knowledge base for relevant docs, then returns a structured
 * explanation adapted to beginner/intermediate/advanced level.
 */
export async function handleExplainConcept(
  args: { concept: string; level?: string; engine?: string },
  docStore: DocStore,
  searchEngine: SearchEngine,
  hybridSearch?: HybridSearchEngine,
): Promise<ToolResult> {
  const level: SkillLevel = validateLevel(args.level);
  const concept = args.concept.trim();

  if (!concept) {
    return { content: [{ type: "text", text: "Please provide a concept to explain." }] };
  }

  // Search knowledge base — use hybrid (semantic + keyword) when available
  const allDocs = docStore.getAllDocs();
  const rawResults = hybridSearch
    ? await hybridSearch.search(concept, allDocs, 5)
    : searchEngine.search(concept, allDocs, 5).map((r) => ({
        doc: r.doc,
        score: r.score,
        snippet: r.snippet,
        tfidfScore: r.score,
        vectorScore: 0,
      }));
  const results = rawResults.map((r) => ({ doc: r.doc, score: r.score, snippet: r.snippet }));

  // Filter by engine if specified
  const filtered = args.engine
    ? results.filter(
        (r) =>
          r.doc.module === "core" ||
          r.doc.module.toLowerCase().includes(args.engine!.toLowerCase()),
      )
    : results;

  // Build the explanation structure
  let output = `# ${concept}\n\n`;
  output += `**Skill level:** ${level}\n\n`;

  // Level-specific framing
  switch (level) {
    case "beginner":
      output += `## What Is It?\n\n`;
      output += `_A plain-English explanation of "${concept}" for someone new to game development._\n\n`;
      output += getBeginnerContext(concept, filtered);
      break;
    case "intermediate":
      output += `## How It Works\n\n`;
      output += `_Implementation details and patterns for "${concept}"._\n\n`;
      output += getIntermediateContext(concept, filtered);
      break;
    case "advanced":
      output += `## Deep Dive\n\n`;
      output += `_Advanced patterns, performance considerations, and edge cases for "${concept}"._\n\n`;
      output += getAdvancedContext(concept, filtered);
      break;
  }

  // Append related docs
  if (filtered.length > 0) {
    output += `\n## Related Docs\n\n`;
    for (const r of filtered.slice(0, 5)) {
      output += `- \`${r.doc.id}\` — ${r.doc.title} (${r.doc.category}, score: ${r.score.toFixed(2)})\n`;
    }
    output += `\n_Use \`get_doc\` with these IDs for full implementation guides._\n`;
  } else {
    output += `\n_No docs found for "${concept}". Try a different term or use \`search_docs\` with broader keywords._\n`;
  }

  return { content: [{ type: "text", text: output }] };
}

function validateLevel(level?: string): SkillLevel {
  if (level === "beginner" || level === "intermediate" || level === "advanced") {
    return level;
  }
  return "intermediate"; // default
}

function getBeginnerContext(
  concept: string,
  results: Array<{ doc: { id: string; title: string; content: string }; score: number }>,
): string {
  let context = "";

  if (results.length > 0) {
    // Extract first paragraph from top result as a starting point
    const topDoc = results[0].doc;
    const firstParagraph = extractFirstParagraph(topDoc.content);
    if (firstParagraph) {
      context += `${firstParagraph}\n\n`;
    }
  }

  context += `### Why It Matters\n\n`;
  context += `Understanding "${concept}" will help you build better games. `;
  context += `Start by reading the related docs below — they include code examples you can copy and adapt.\n\n`;

  context += `### Next Steps\n\n`;
  context += `1. Read the top related doc with \`get_doc\`\n`;
  context += `2. Try the simplest example in your own project\n`;
  context += `3. Experiment and iterate\n`;

  return context;
}

function getIntermediateContext(
  concept: string,
  results: Array<{ doc: { id: string; title: string; content: string }; score: number }>,
): string {
  let context = "";

  if (results.length > 0) {
    const topDoc = results[0].doc;
    // Extract headings to show structure
    const headings = extractHeadings(topDoc.content);
    if (headings.length > 0) {
      context += `### Key Topics in \`${topDoc.id}\`\n\n`;
      for (const h of headings.slice(0, 8)) {
        context += `- ${h}\n`;
      }
      context += `\n`;
    }

    const firstParagraph = extractFirstParagraph(topDoc.content);
    if (firstParagraph) {
      context += `${firstParagraph}\n\n`;
    }
  }

  context += `### Implementation Notes\n\n`;
  context += `Use \`get_doc\` with the \`section\` parameter to extract specific implementation details. `;
  context += `For example: \`get_doc("${results[0]?.doc.id ?? "G1"}", section: "${concept}")\`\n`;

  return context;
}

function getAdvancedContext(
  concept: string,
  results: Array<{ doc: { id: string; title: string; content: string }; score: number }>,
): string {
  let context = "";

  if (results.length > 0) {
    // Show all relevant docs with their key sections
    for (const r of results.slice(0, 3)) {
      const headings = extractHeadings(r.doc.content);
      context += `### \`${r.doc.id}\` — ${r.doc.title}\n\n`;
      if (headings.length > 0) {
        context += `Sections: ${headings.slice(0, 6).join(" · ")}\n\n`;
      }
    }
  }

  context += `### Performance & Edge Cases\n\n`;
  context += `For performance-critical implementations, also check:\n`;
  context += `- \`G13\` — C# Performance (zero-alloc, Span, SIMD)\n`;
  context += `- \`G33\` — Profiling & Optimization\n`;
  context += `- \`G15\` — Game Loop (fixed timestep, interpolation)\n`;

  return context;
}

function extractFirstParagraph(content: string): string | null {
  const lines = content.split("\n");
  let paragraph = "";
  let foundStart = false;

  for (const line of lines) {
    const trimmed = line.trim();
    // Skip frontmatter, headings, empty lines at the start
    if (!foundStart) {
      if (trimmed === "---" || trimmed.startsWith("#") || trimmed === "" || trimmed.startsWith(">")) {
        continue;
      }
      foundStart = true;
    }

    if (foundStart) {
      if (trimmed === "") {
        if (paragraph.length > 0) break;
        continue;
      }
      paragraph += (paragraph ? " " : "") + trimmed;
    }
  }

  return paragraph.length > 20 ? paragraph.slice(0, 500) : null;
}

function extractHeadings(content: string): string[] {
  const headings: string[] = [];
  for (const line of content.split("\n")) {
    const match = line.match(/^#{2,3}\s+(.+)/);
    if (match) {
      headings.push(match[1].trim());
    }
  }
  return headings;
}
