import { DocStore } from "../core/docs.js";

export function handleGetDoc(
  args: { id: string },
  docStore: DocStore
): { content: Array<{ type: "text"; text: string }> } {
  const doc = docStore.getDoc(args.id);

  if (!doc) {
    // Try case-insensitive lookup
    const allDocs = docStore.getAllDocs();
    const match = allDocs.find(
      (d) => d.id.toLowerCase() === args.id.toLowerCase()
    );
    if (match) {
      return {
        content: [
          {
            type: "text",
            text: `# ${match.title}\n\n**ID:** ${match.id} | **Module:** ${match.module} | **Category:** ${match.category}\n\n---\n\n${match.content}`,
          },
        ],
      };
    }

    return {
      content: [
        {
          type: "text",
          text: `Doc "${args.id}" not found. Use list_docs to see available docs.`,
        },
      ],
    };
  }

  return {
    content: [
      {
        type: "text",
        text: `# ${doc.title}\n\n**ID:** ${doc.id} | **Module:** ${doc.module} | **Category:** ${doc.category}\n\n---\n\n${doc.content}`,
      },
    ],
  };
}
