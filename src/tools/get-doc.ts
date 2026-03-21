import { DocStore } from "../core/docs.js";
import { HybridProvider } from "../core/hybrid-provider.js";

interface GetDocArgs {
  id: string;
  section?: string;
  maxLength?: number;
}

interface Doc {
  id: string;
  title: string;
  module: string;
  category: string;
  content: string;
}

type ToolResult = { content: Array<{ type: "text"; text: string }> };

/**
 * Extract a section from markdown content by heading.
 * Matches ## or ### headings containing the query string (case-insensitive).
 * Returns the heading and all content until the next heading of equal or higher level.
 */
function extractSection(content: string, sectionQuery: string): { found: boolean; section: string; heading: string; availableSections: string[] } {
  const lines = content.split("\n");
  const headingRegex = /^(#{1,6})\s+(.+)$/;
  const allHeadings: { level: number; title: string; lineIndex: number }[] = [];

  // Parse all headings
  for (let i = 0; i < lines.length; i++) {
    const match = lines[i].match(headingRegex);
    if (match) {
      allHeadings.push({
        level: match[1].length,
        title: match[2].trim(),
        lineIndex: i,
      });
    }
  }

  const queryLower = sectionQuery.toLowerCase();

  // Find the matching heading (case-insensitive substring match)
  const matchIndex = allHeadings.findIndex(
    (h) => h.title.toLowerCase().includes(queryLower)
  );

  const availableSections = allHeadings
    .filter((h) => h.level <= 3) // Only show ## and ### in the list
    .map((h) => `${"#".repeat(h.level)} ${h.title}`);

  if (matchIndex === -1) {
    return { found: false, section: "", heading: "", availableSections };
  }

  const matchedHeading = allHeadings[matchIndex];
  const startLine = matchedHeading.lineIndex;

  // Find the end: next heading of equal or higher (lower number) level
  let endLine = lines.length;
  for (let i = matchIndex + 1; i < allHeadings.length; i++) {
    if (allHeadings[i].level <= matchedHeading.level) {
      endLine = allHeadings[i].lineIndex;
      break;
    }
  }

  const sectionContent = lines.slice(startLine, endLine).join("\n").trim();
  return { found: true, section: sectionContent, heading: matchedHeading.title, availableSections };
}

/**
 * Truncate content to maxLength chars, breaking at the last paragraph/line boundary.
 */
function truncateContent(content: string, maxLength: number): { text: string; truncated: boolean; originalLength: number } {
  if (content.length <= maxLength) {
    return { text: content, truncated: false, originalLength: content.length };
  }

  // Try to break at a paragraph boundary (double newline)
  const cutPoint = content.lastIndexOf("\n\n", maxLength);
  const breakAt = cutPoint > maxLength * 0.5 ? cutPoint : content.lastIndexOf("\n", maxLength);
  const finalBreak = breakAt > maxLength * 0.3 ? breakAt : maxLength;

  return {
    text: content.slice(0, finalBreak),
    truncated: true,
    originalLength: content.length,
  };
}

export function handleGetDoc(
  args: GetDocArgs,
  docStore: DocStore
): ToolResult {
  // 1. Try exact match (case-sensitive, includes prefixed IDs like "monogame-arch/E1")
  const exactDoc = docStore.getDoc(args.id);
  if (exactDoc) {
    return formatDocResult(exactDoc, args);
  }

  // 2. Try case-insensitive exact match, plus suffix match for unprefixed queries
  const allDocs = docStore.getAllDocs();
  const lowerQuery = args.id.toLowerCase();
  const matches = allDocs.filter(
    (d) =>
      d.id.toLowerCase() === lowerQuery ||
      d.id.toLowerCase().endsWith("/" + lowerQuery)
  );

  if (matches.length === 1) {
    return formatDocResult(matches[0], args);
  }

  if (matches.length > 1) {
    // Prefer exact ID match over suffix match
    const exact = matches.find((d) => d.id.toLowerCase() === lowerQuery);
    if (exact) {
      const others = matches.filter((d) => d !== exact);
      const note = `\n\n---\n_Note: Multiple docs match "${args.id}". Also available: ${others.map((d) => `\`${d.id}\``).join(", ")}_`;
      const result = formatDocResult(exact, args);
      result.content[0].text += note;
      return result;
    }

    // No exact — list all matches so user can disambiguate
    const list = matches.map((d) => `- \`${d.id}\` — ${d.title} [${d.module}/${d.category}]`).join("\n");
    return {
      content: [{
        type: "text",
        text: `Multiple docs match "${args.id}":\n\n${list}\n\nPlease use the full ID (e.g. \`${matches[0].id}\`) to fetch a specific doc.`,
      }],
    };
  }

  return {
    content: [{
      type: "text",
      text: `Doc "${args.id}" not found. Use list_docs to see available docs.`,
    }],
  };
}

function formatDocResult(doc: Doc, args: GetDocArgs): ToolResult {
  let content = doc.content;
  const meta = `**ID:** ${doc.id} | **Module:** ${doc.module} | **Category:** ${doc.category}`;
  const sizeKB = Math.round(doc.content.length / 1024);
  const notes: string[] = [];

  // Section extraction
  if (args.section) {
    const result = extractSection(content, args.section);
    if (result.found) {
      content = result.section;
      notes.push(`📌 Showing section: "${result.heading}" (${content.length} chars of ${doc.content.length} total)`);
    } else {
      const sectionList = result.availableSections.slice(0, 20).map((s) => `  ${s}`).join("\n");
      const moreNote = result.availableSections.length > 20 ? `\n  ... and ${result.availableSections.length - 20} more` : "";
      return {
        content: [{
          type: "text",
          text: `Section "${args.section}" not found in doc "${doc.id}".\n\nAvailable sections:\n${sectionList}${moreNote}\n\n_Tip: Use a substring of the heading, e.g. section: "Combat" to match "## Combat System"._`,
        }],
      };
    }
  }

  // MaxLength truncation
  if (args.maxLength && args.maxLength > 0) {
    const result = truncateContent(content, args.maxLength);
    content = result.text;
    if (result.truncated) {
      notes.push(`✂️ Truncated to ${args.maxLength} chars (full ${args.section ? "section" : "doc"}: ${result.originalLength} chars). Use a larger maxLength or section parameter to get more.`);
    }
  } else if (sizeKB > 20 && !args.section) {
    // Warn about large docs when no section/maxLength was specified
    notes.push(`⚠️ Large doc (${sizeKB}KB). Consider using \`section\` to extract specific headings or \`maxLength\` to limit size.`);
  }

  const notesBlock = notes.length > 0 ? `\n\n${notes.join("\n")}` : "";

  return {
    content: [{
      type: "text",
      text: `# ${doc.title}\n\n${meta}${notesBlock}\n\n---\n\n${content}`,
    }],
  };
}

/**
 * Hybrid get_doc handler — uses HybridProvider for remote Pro doc fetching
 * with local caching and fallback chain.
 */
export async function handleGetDocHybrid(
  args: GetDocArgs,
  docStore: DocStore,
  hybridProvider: HybridProvider
): Promise<ToolResult> {
  // Try hybrid provider first
  const result = await hybridProvider.getDoc(args.id, {
    section: args.section,
    maxLength: args.maxLength,
  });

  if (!result) {
    // Fall back to pure local (handles disambiguation, error messages)
    return handleGetDoc(args, docStore);
  }

  // Format using the standard formatter
  const formatted = formatDocResult(result.doc, args);

  // Add source annotation
  const sourceLabels: Record<string, string> = {
    local: "",
    cache: "📦 _Served from local cache_",
    remote: "🌐 _Fetched from remote API_",
    "stale-cache": "⚠️ _Served from stale cache (API unreachable). Content may be outdated._",
  };

  const sourceNote = sourceLabels[result.source];
  if (sourceNote) {
    formatted.content[0].text += `\n\n${sourceNote}`;
  }

  return formatted;
}
