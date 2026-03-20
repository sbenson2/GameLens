import { Doc } from "./docs.js";

interface SearchResult {
  doc: Doc;
  score: number;
  snippet: string;
}

/** Simple TF-IDF search engine — no external dependencies */
export class SearchEngine {
  private idfCache: Map<string, number> = new Map();
  private docTermFreqs: Map<string, Map<string, number>> = new Map();
  private totalDocs: number = 0;

  private static STOP_WORDS = new Set([
    "the", "is", "at", "which", "on", "an", "and", "or", "but",
    "in", "with", "to", "for", "of", "by", "from", "how", "what",
    "when", "where", "why", "do", "does", "did", "will", "would",
    "should", "could", "can", "my", "your", "its", "this", "that",
    "it", "be", "have", "has", "had", "was", "were", "are", "am",
    "been", "being", "not", "no", "if", "then", "than", "so", "very",
    "just", "about", "also", "way", "best", "make", "use",
  ]);

  /** Lightweight stemmer — strips common English suffixes for better recall */
  private stem(word: string): string {
    if (word.length < 5) return word;
    // Order: longest suffix first to avoid partial matches
    if (word.endsWith("ation") && word.length > 6) return word.slice(0, -5);
    if (word.endsWith("ment") && word.length > 6) return word.slice(0, -4);
    if (word.endsWith("ness") && word.length > 6) return word.slice(0, -4);
    if (word.endsWith("able") && word.length > 6) return word.slice(0, -4);
    if (word.endsWith("ible") && word.length > 6) return word.slice(0, -4);
    if (word.endsWith("ying")) return word.slice(0, -4) + "y"; // applying → apply
    if (word.endsWith("ling") && word.length > 5) return word.slice(0, -3); // handling → handl
    if (word.endsWith("ning") && word.length > 5) return word.slice(0, -4) + "n"; // running → runn... just strip ing
    if (word.endsWith("ting") && word.length > 5) return word.slice(0, -4) + "t"; // setting → sett... strip ing
    if (word.endsWith("ing") && word.length > 5) return word.slice(0, -3);
    if (word.endsWith("ies") && word.length > 4) return word.slice(0, -3) + "y";
    if (word.endsWith("tion") && word.length > 5) return word.slice(0, -4);
    if (word.endsWith("sion") && word.length > 5) return word.slice(0, -4);
    if (word.endsWith("ally") && word.length > 5) return word.slice(0, -4);
    if (word.endsWith("ful") && word.length > 5) return word.slice(0, -3);
    if (word.endsWith("ous") && word.length > 5) return word.slice(0, -3);
    if (word.endsWith("ive") && word.length > 5) return word.slice(0, -3);
    if (word.endsWith("ed") && word.length > 4) return word.slice(0, -2);
    if (word.endsWith("er") && word.length > 4) return word.slice(0, -2);
    if (word.endsWith("es") && word.length > 4) return word.slice(0, -2);
    if (word.endsWith("ly") && word.length > 4) return word.slice(0, -2);
    if (word.endsWith("s") && !word.endsWith("ss") && word.length > 3) return word.slice(0, -1);
    return word;
  }

  /** Tokenize text into lowercase terms, splitting hyphens and handling special tokens */
  private tokenize(text: string): string[] {
    // Handle special tokens before stripping symbols
    let processed = text.replace(/c#/gi, "csharp");
    processed = processed.toLowerCase().replace(/[^a-z0-9\s-]/g, " ");

    const tokens: string[] = [];
    for (const word of processed.split(/\s+/)) {
      if (word.length < 2) continue;
      if (SearchEngine.STOP_WORDS.has(word)) continue;

      // Add both original and stemmed form for better recall
      tokens.push(word); // keep compound: "character-controller"
      const stemmed = this.stem(word);
      if (stemmed !== word && stemmed.length > 1) {
        tokens.push(stemmed);
      }

      if (word.includes("-")) {
        for (const part of word.split("-")) {
          if (part.length > 1 && !SearchEngine.STOP_WORDS.has(part)) {
            tokens.push(part); // also index individual parts
            const partStemmed = this.stem(part);
            if (partStemmed !== part && partStemmed.length > 1) {
              tokens.push(partStemmed);
            }
          }
        }
      }
    }
    return tokens;
  }

  /** Build the index from a list of docs */
  index(docs: Doc[]): void {
    this.idfCache.clear();
    this.docTermFreqs.clear();
    this.totalDocs = docs.length;

    // Document frequency for each term
    const docFreq: Map<string, number> = new Map();

    for (const doc of docs) {
      const text = `${doc.title} ${doc.title} ${doc.description} ${doc.content}`;
      const tokens = this.tokenize(text);
      const termFreq: Map<string, number> = new Map();
      const seen = new Set<string>();

      for (const token of tokens) {
        termFreq.set(token, (termFreq.get(token) ?? 0) + 1);
        if (!seen.has(token)) {
          seen.add(token);
          docFreq.set(token, (docFreq.get(token) ?? 0) + 1);
        }
      }

      this.docTermFreqs.set(doc.id, termFreq);
    }

    // Compute IDF
    for (const [term, df] of docFreq) {
      this.idfCache.set(term, Math.log((this.totalDocs + 1) / (df + 1)) + 1);
    }
  }

  /** Search docs, return sorted by relevance */
  search(query: string, docs: Doc[], limit: number = 10): SearchResult[] {
    const queryTokens = this.tokenize(query);
    if (queryTokens.length === 0) return [];

    const results: SearchResult[] = [];

    for (const doc of docs) {
      const termFreq = this.docTermFreqs.get(doc.id);
      if (!termFreq) continue;

      let score = 0;

      // TF-IDF scoring
      for (const token of queryTokens) {
        const tf = termFreq.get(token) ?? 0;
        if (tf === 0) continue;
        const idf = this.idfCache.get(token) ?? 0;
        score += (1 + Math.log(tf)) * idf;
      }

      // Boost: exact ID match
      if (doc.id.toLowerCase() === query.toLowerCase()) {
        score += 100;
      }

      // Boost: per-token title matching (more granular than single substring check)
      const lowerTitle = doc.title.toLowerCase();
      const lowerQuery = query.toLowerCase();
      if (lowerTitle.includes(lowerQuery)) {
        score += 20; // full query in title — strong signal
      }
      for (const token of queryTokens) {
        if (lowerTitle.includes(token)) {
          score += 8; // per-token title boost
        }
      }

      // Boost: all query tokens present
      const allPresent = queryTokens.every((t) => termFreq.has(t));
      if (allPresent) {
        score *= 1.5;
      }

      // Penalize redirect stubs / very short docs (< 500 chars content)
      if (doc.content.length < 500) {
        score *= 0.3;
      }

      // Normalize by document length to prevent long docs from dominating
      // Floor at 50 unique terms to prevent tiny docs from getting inflated scores
      const docUniqueTerms = Math.max(termFreq.size, 50);
      score /= Math.sqrt(docUniqueTerms);

      if (score > 0) {
        results.push({
          doc,
          score,
          snippet: this.extractSnippet(doc.content, queryTokens),
        });
      }
    }

    results.sort((a, b) => b.score - a.score);
    return results.slice(0, limit);
  }

  /** Extract a relevant snippet containing query terms */
  private extractSnippet(content: string, queryTokens: string[]): string {
    const lines = content.split("\n");
    const lowerTokens = queryTokens.map((t) => t.toLowerCase());

    // Find the first line containing a query token
    let bestLine = -1;
    let bestScore = 0;
    for (let i = 0; i < lines.length; i++) {
      const lower = lines[i].toLowerCase();
      let lineScore = 0;
      for (const token of lowerTokens) {
        if (lower.includes(token)) lineScore++;
      }
      if (lineScore > bestScore) {
        bestScore = lineScore;
        bestLine = i;
      }
    }

    if (bestLine === -1) {
      // Return first non-empty, non-heading lines
      const start = lines.findIndex(
        (l) => l.trim() !== "" && !l.startsWith("#") && !l.startsWith("!")
      );
      if (start === -1) return content.slice(0, 200);
      return lines
        .slice(start, start + 3)
        .join("\n")
        .slice(0, 300);
    }

    // Return a window around the best line
    const start = Math.max(0, bestLine - 1);
    const end = Math.min(lines.length, bestLine + 3);
    return lines
      .slice(start, end)
      .join("\n")
      .slice(0, 300);
  }
}
