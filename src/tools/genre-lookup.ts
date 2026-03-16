import { lookupGenre, listGenres } from "../core/genre.js";

export function handleGenreLookup(args: {
  genre: string;
}): { content: Array<{ type: "text"; text: string }> } {
  const info = lookupGenre(args.genre);

  if (!info) {
    const available = listGenres().join(", ");
    return {
      content: [
        { type: "text", text: `Genre "${args.genre}" not found.\n\nAvailable genres: ${available}` },
      ],
    };
  }

  let output = `# ${info.genre}\n\n`;
  output += `${info.description}\n\n`;
  output += `## Required Systems\n\n`;
  for (const sys of info.requiredSystems) {
    output += `- ${sys}\n`;
  }
  output += `\n## Recommended Docs\n\n`;
  output += info.recommendedDocs.map((d) => `\`${d}\``).join(", ");
  output += `\n\n## Starter Checklist\n\n`;
  for (const item of info.starterChecklist) {
    output += `- [ ] ${item}\n`;
  }
  output += `\n---\n_Use \`get_doc\` with the doc IDs above to read full guides._`;

  return {
    content: [{ type: "text", text: output }],
  };
}
