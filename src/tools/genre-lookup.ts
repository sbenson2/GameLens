import { lookupGenre, listGenres, GenreInfo } from "../core/genre.js";

export type GenreLookupResult = {
  found: false;
  availableGenres: string[];
} | {
  found: true;
  info: GenreInfo;
}

/** Returns structured genre data. Caller is responsible for tier filtering and formatting. */
export function handleGenreLookup(args: {
  genre: string;
}): GenreLookupResult {
  const info = lookupGenre(args.genre);

  if (!info) {
    return { found: false, availableGenres: listGenres() };
  }

  return { found: true, info };
}

/** Format a GenreInfo into display text. Supports optional section exclusions for tier gating. */
export function formatGenreResult(
  info: GenreInfo,
  options?: { excludeSections?: Array<"requiredSystems" | "recommendedDocs">; gateMessage?: string }
): string {
  let output = `# ${info.genre}\n\n`;
  output += `${info.description}\n\n`;

  output += `## Required Systems\n\n`;
  if (options?.excludeSections?.includes("requiredSystems")) {
    output += `_Full system mappings require a Pro license. ${options.gateMessage ?? ""}_\n`;
  } else {
    for (const sys of info.requiredSystems) {
      output += `- ${sys}\n`;
    }
  }

  output += `\n## Recommended Docs\n\n`;
  if (options?.excludeSections?.includes("recommendedDocs")) {
    output += `_Doc recommendations require a Pro license. ${options.gateMessage ?? ""}_\n`;
  } else {
    output += info.recommendedDocs.map((d) => `\`${d}\``).join(", ");
  }

  output += `\n\n## Starter Checklist\n\n`;
  for (const item of info.starterChecklist) {
    output += `- [ ] ${item}\n`;
  }
  output += `\n---\n_Use \`get_doc\` with the doc IDs above to read full guides._`;

  return output;
}
