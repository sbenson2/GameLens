/** Server-side search engine (mirrors src/core/search.ts logic) */

import type { SearchIndexEntry } from "./types.js";

const STOP_WORDS = new Set([
  "a", "an", "the", "and", "or", "but", "in", "on", "at", "to", "for",
  "of", "with", "by", "from", "is", "are", "was", "were", "be", "been",
  "has", "have", "had", "do", "does", "did", "will", "would", "could",
  "should", "may", "might", "can", "this", "that", "these", "those",
  "it", "its", "i", "you", "he", "she", "we", "they", "my", "your",
  "his", "her", "our", "their", "what", "which", "who", "whom", "how",
  "when", "where", "why", "not", "no", "so", "if", "then", "than",
  "too", "very", "just", "about", "up", "out", "into", "over",
]);

/** Tokenize a query string into searchable terms */
export function tokenize(text: string): string[] {
  // Handle C# special case
  let processed = text.replace(/C#/gi, "csharp");

  // Split on whitespace and punctuation, but keep hyphens as compounds
  const raw = processed.toLowerCase().match(/[\w-]+/g) ?? [];

  const tokens: string[] = [];
  for (const token of raw) {
    // Split hyphenated tokens into parts AND keep compound
    if (token.includes("-")) {
      tokens.push(token); // keep "character-controller"
      for (const part of token.split("-")) {
        if (part.length > 1 && !STOP_WORDS.has(part)) {
          tokens.push(part);
        }
      }
    } else if (token.length > 1 && !STOP_WORDS.has(token)) {
      tokens.push(token);
    }
  }

  return [...new Set(tokens)];
}

/** Score a document against query tokens using TF-IDF-like scoring */
export function scoreDocument(
  entry: SearchIndexEntry,
  queryTokens: string[],
  totalDocs: number,
  docFrequencies: Map<string, number>
): number {
  if (queryTokens.length === 0) return 0;

  let score = 0;
  const docTokenSet = new Set(entry.tokens);

  for (const qt of queryTokens) {
    if (!docTokenSet.has(qt)) continue;

    // TF: count in doc tokens
    let tf = 0;
    for (const dt of entry.tokens) {
      if (dt === qt) tf++;
    }

    // IDF
    const df = docFrequencies.get(qt) ?? 1;
    const idf = Math.log(1 + totalDocs / df);

    // Length normalization
    const normFactor = Math.sqrt(entry.tokens.length);

    score += (tf / normFactor) * idf;

    // Title boost: +5 per token match in title
    if (entry.title.toLowerCase().includes(qt)) {
      score += 5;
    }
  }

  return score;
}

/** Build document frequency map from index */
export function buildDocFrequencies(
  index: SearchIndexEntry[]
): Map<string, number> {
  const df = new Map<string, number>();
  for (const entry of index) {
    const uniqueTokens = new Set(entry.tokens);
    for (const token of uniqueTokens) {
      df.set(token, (df.get(token) ?? 0) + 1);
    }
  }
  return df;
}
