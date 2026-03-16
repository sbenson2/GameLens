import { DocStore } from "../core/docs.js";

export function handleListDocs(
  args: { category?: string; module?: string },
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
