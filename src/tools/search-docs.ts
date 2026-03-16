import { DocStore } from "../core/docs.js";
import { SearchEngine } from "../core/search.js";

export function handleSearchDocs(
  args: { query: string; category?: string; module?: string },
  docStore: DocStore,
  searchEngine: SearchEngine
): { content: Array<{ type: "text"; text: string }> } {
  let docs = docStore.getAllDocs();

  if (args.category) {
    docs = docs.filter((d) => d.category === args.category);
  }
  if (args.module) {
    docs = docs.filter((d) => d.module === args.module);
  }

  const results = searchEngine.search(args.query, docs, 10);

  if (results.length === 0) {
    return {
      content: [{ type: "text", text: `No docs found matching "${args.query}".` }],
    };
  }

  const lines = results.map((r, i) => {
    const scoreStr = r.score.toFixed(1);
    return `${i + 1}. **${r.doc.id}** — ${r.doc.title} [${r.doc.module}/${r.doc.category}] (score: ${scoreStr})\n   ${r.snippet.split("\n")[0]}\n`;
  });

  return {
    content: [
      {
        type: "text",
        text: `Found ${results.length} results for "${args.query}":\n\n${lines.join("\n")}`,
      },
    ],
  };
}
