import { Doc } from "./docs.js";
import { SearchEngine } from "./search.js";
import { VectorSearch } from "./vector-search.js";

/**
 * Hybrid search engine that combines TF-IDF keyword search with
 * vector-based semantic search for best-of-both-worlds retrieval.
 *
 * - TF-IDF excels at exact keyword matches, doc IDs, specific terms
 * - Vector search excels at "how do I make enemies chase the player"
 *   even if the docs never use the word "chase"
 *
 * Scores are normalized and blended with configurable weights.
 * Falls back to TF-IDF only if vector search isn't available.
 */

export interface HybridResult {
  doc: Doc;
  score: number;
  tfidfScore: number;
  vectorScore: number;
  snippet: string;
}

export interface HybridSearchOptions {
  /** Weight for TF-IDF score (0-1). Default: 0.4 */
  tfidfWeight?: number;
  /** Weight for vector similarity score (0-1). Default: 0.6 */
  vectorWeight?: number;
  /** Minimum score threshold to include in results. Default: 0.01 */
  minScore?: number;
}

const DEFAULT_OPTIONS: Required<HybridSearchOptions> = {
  tfidfWeight: 0.4,
  vectorWeight: 0.6,
  minScore: 0.01,
};

export class HybridSearchEngine {
  private tfidf: SearchEngine;
  private vector: VectorSearch;
  private initialized: boolean = false;

  constructor(tfidf: SearchEngine, vector: VectorSearch) {
    this.tfidf = tfidf;
    this.vector = vector;
  }

  /** Initialize — indexes TF-IDF and loads/computes vector embeddings */
  async init(docs: Doc[]): Promise<void> {
    // TF-IDF index is synchronous
    this.tfidf.index(docs);

    // Vector search is async (model loading + embedding)
    // Don't block startup — start in background
    this.vector.init(docs).catch((err) => {
      console.error(`[gamecodex] Vector search background init failed: ${err}`);
    });

    this.initialized = true;
  }

  /** Search with hybrid scoring */
  async search(
    query: string,
    docs: Doc[],
    limit: number = 10,
    options?: HybridSearchOptions
  ): Promise<HybridResult[]> {
    const opts = { ...DEFAULT_OPTIONS, ...options };

    // Always get TF-IDF results (fast, synchronous)
    const tfidfResults = this.tfidf.search(query, docs, Math.min(limit * 3, 50));

    // If vector search isn't ready, return TF-IDF only
    if (!this.vector.isReady()) {
      return tfidfResults.map((r) => ({
        doc: r.doc,
        score: r.score,
        tfidfScore: r.score,
        vectorScore: 0,
        snippet: r.snippet,
      }));
    }

    // Get vector results (wider net for recall)
    const vectorResults = await this.vector.search(query, docs, Math.min(limit * 3, 50));

    // Build maps for merging
    const tfidfMap = new Map<string, { score: number; snippet: string }>();
    const vectorMap = new Map<string, number>();
    const docMap = new Map<string, Doc>();

    // Normalize TF-IDF scores to [0, 1]
    const maxTfidf = tfidfResults.length > 0 ? tfidfResults[0].score : 1;
    for (const r of tfidfResults) {
      const normalized = maxTfidf > 0 ? r.score / maxTfidf : 0;
      tfidfMap.set(r.doc.id, { score: normalized, snippet: r.snippet });
      docMap.set(r.doc.id, r.doc);
    }

    // Vector scores are already in [0, 1] (cosine similarity)
    for (const r of vectorResults) {
      vectorMap.set(r.doc.id, r.similarity);
      docMap.set(r.doc.id, r.doc);
    }

    // Merge: union of all doc IDs from both result sets
    const allIds = new Set([...tfidfMap.keys(), ...vectorMap.keys()]);
    const merged: HybridResult[] = [];

    for (const id of allIds) {
      const doc = docMap.get(id)!;
      const tfidfEntry = tfidfMap.get(id);
      const tfidfNorm = tfidfEntry?.score ?? 0;
      const vectorSim = vectorMap.get(id) ?? 0;

      // Weighted combination
      const score =
        opts.tfidfWeight * tfidfNorm + opts.vectorWeight * vectorSim;

      if (score < opts.minScore) continue;

      merged.push({
        doc,
        score,
        tfidfScore: tfidfNorm,
        vectorScore: vectorSim,
        snippet: tfidfEntry?.snippet ?? doc.description ?? "",
      });
    }

    merged.sort((a, b) => b.score - a.score);
    return merged.slice(0, limit);
  }

  /** Check if vector search component is active */
  hasVectorSearch(): boolean {
    return this.vector.isReady();
  }
}
