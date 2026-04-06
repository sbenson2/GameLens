import { DocStore } from "../core/docs.js";

export function handleListDocs(
  args: { category?: string; module?: string; summary?: boolean },
  docStore: DocStore
): { content: Array<{ type: "text"; text: string }> } {
  const docs = docStore.listDocs(args.category, args.module);

  if (docs.length === 0) {
    return {
      content: [{ type: "text", text: "No docs found with the given filters." }],
    };
  }

  // Group by module then category
  const grouped: Record<string, Record<string, typeof docs>> = {};
  for (const doc of docs) {
    if (!grouped[doc.module]) grouped[doc.module] = {};
    if (!grouped[doc.module][doc.category]) grouped[doc.module][doc.category] = [];
    grouped[doc.module][doc.category].push(doc);
  }

  // Summary mode: counts only, minimal tokens
  if (args.summary) {
    let output = `# Doc Summary (${docs.length} total)\n\n`;

    for (const [mod, categories] of Object.entries(grouped)) {
      const modTotal = Object.values(categories).reduce((sum, catDocs) => sum + catDocs.length, 0);
      output += `## ${mod} (${modTotal} docs)\n\n`;
      for (const [cat, catDocs] of Object.entries(categories)) {
        output += `- **${cat}**: ${catDocs.length} docs`;
        // Show IDs in a compact list
        const ids = catDocs.map((d) => d.id);
        if (ids.length <= 10) {
          output += ` — ${ids.join(", ")}`;
        } else {
          output += ` — ${ids.slice(0, 10).join(", ")} (+${ids.length - 10} more)`;
        }
        output += "\n";
      }
      output += "\n";
    }

    output += `_Use \`list_docs\` without summary for full titles and descriptions. Use \`get_doc\` with an ID to read a specific doc._\n`;

    return {
      content: [{ type: "text", text: output }],
    };
  }

  // Full mode: titles and descriptions
  let output = `# Available Docs (${docs.length} total)\n\n`;

  for (const [mod, categories] of Object.entries(grouped)) {
    output += `## Module: ${mod}\n\n`;
    for (const [cat, catDocs] of Object.entries(categories)) {
      output += `### ${cat}\n`;
      for (const doc of catDocs) {
        const desc = doc.description ? ` — ${doc.description}` : "";
        output += `- **${doc.id}**: ${doc.title}${desc}\n`;
      }
      output += "\n";
    }
  }

  return {
    content: [{ type: "text", text: output }],
  };
}
