import { DocStore } from "../core/docs.js";

export function handleGetDoc(
  args: { id: string },
  docStore: DocStore
): { content: Array<{ type: "text"; text: string }> } {
  // 1. Try exact match (case-sensitive, includes prefixed IDs like "monogame-arch/E1")
  const exactDoc = docStore.getDoc(args.id);
  if (exactDoc) {
    return formatDocResult(exactDoc);
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
    return formatDocResult(matches[0]);
  }

  if (matches.length > 1) {
    // Prefer exact ID match over suffix match
    const exact = matches.find((d) => d.id.toLowerCase() === lowerQuery);
    if (exact) {
      const others = matches.filter((d) => d !== exact);
      const note = `\n\n---\n_Note: Multiple docs match "${args.id}". Also available: ${others.map((d) => `\`${d.id}\``).join(", ")}_`;
      return {
        content: [{
          type: "text",
          text: `# ${exact.title}\n\n**ID:** ${exact.id} | **Module:** ${exact.module} | **Category:** ${exact.category}\n\n---\n\n${exact.content}${note}`,
        }],
      };
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

function formatDocResult(doc: { id: string; title: string; module: string; category: string; content: string }): { content: Array<{ type: "text"; text: string }> } {
  return {
    content: [{
      type: "text",
      text: `# ${doc.title}\n\n**ID:** ${doc.id} | **Module:** ${doc.module} | **Category:** ${doc.category}\n\n---\n\n${doc.content}`,
    }],
  };
}
