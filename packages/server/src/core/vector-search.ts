import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { Doc } from "./docs.js";

/**
 * Vector search engine using local embeddings via @huggingface/transformers.
 *
 * Uses all-MiniLM-L6-v2 (~22MB ONNX model, 384-dim embeddings) for semantic search.
 * Embeddings are cached to ~/.gamecodex/embeddings/ so they only need to be computed once.
 * The cache is invalidated when document content changes (via content hash).
 */

interface EmbeddingCache {
  modelId: string;
  version: number;
  docs: Record<string, { hash: string; embedding: number[] }>;
}

interface VectorResult {
  doc: Doc;
  similarity: number;
}

const CACHE_VERSION = 1;
const MODEL_ID = "Xenova/all-MiniLM-L6-v2";
const CONFIG_DIR = path.join(os.homedir(), ".gamecodex");
const CACHE_PATH = path.join(CONFIG_DIR, "embeddings", "vectors.json");

/** Simple content hash — fast, deterministic, no crypto dependency */
function hashContent(content: string): string {
  let h = 0;
  for (let i = 0; i < content.length; i++) {
    h = ((h << 5) - h + content.charCodeAt(i)) | 0;
  }
  // Include length for extra collision resistance
  return `${h.toString(36)}_${content.length}`;
}

/** Cosine similarity between two vectors */
function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom === 0 ? 0 : dot / denom;
}

export class VectorSearch {
  private embeddings: Map<string, number[]> = new Map();
  private pipeline: any = null;
  private ready: boolean = false;
  private loading: Promise<void> | null = null;

  /** Initialize the embedding pipeline (lazy — only loads model on first use) */
  async init(docs: Doc[]): Promise<void> {
    if (this.loading) return this.loading;
    this.loading = this._init(docs);
    return this.loading;
  }

  private async _init(docs: Doc[]): Promise<void> {
    try {
      console.error("[gamecodex] Loading embedding model...");
      const startTime = Date.now();

      // Dynamic import to avoid issues if package isn't installed
      const { pipeline, env } = await import("@huggingface/transformers");

      // Disable remote model fetching attempts if offline
      env.allowRemoteModels = true;
      // Cache models in our config dir
      env.cacheDir = path.join(CONFIG_DIR, "models");

      this.pipeline = await pipeline("feature-extraction", MODEL_ID, {
        dtype: "fp32",
      });

      console.error(
        `[gamecodex] Embedding model loaded in ${Date.now() - startTime}ms`
      );

      // Load cached embeddings and compute missing ones
      await this.syncEmbeddings(docs);
      this.ready = true;
    } catch (err) {
      console.error(
        `[gamecodex] Vector search init failed (falling back to TF-IDF only): ${err}`
      );
      this.ready = false;
    }
  }

  /** Check if vector search is available */
  isReady(): boolean {
    return this.ready;
  }

  /** Sync embeddings: load cache, compute missing, save updated cache */
  private async syncEmbeddings(docs: Doc[]): Promise<void> {
    const cache = this.loadCache();
    const needsEmbed: Doc[] = [];
    let cacheHits = 0;

    for (const doc of docs) {
      const hash = hashContent(doc.content);
      const cached = cache.docs[doc.id];

      if (cached && cached.hash === hash) {
        // Cache hit — use stored embedding
        this.embeddings.set(doc.id, cached.embedding);
        cacheHits++;
      } else {
        needsEmbed.push(doc);
      }
    }

    console.error(
      `[gamecodex] Embeddings: ${cacheHits} cached, ${needsEmbed.length} to compute`
    );

    if (needsEmbed.length > 0) {
      const startTime = Date.now();
      const BATCH_SIZE = 8;

      for (let i = 0; i < needsEmbed.length; i += BATCH_SIZE) {
        const batch = needsEmbed.slice(i, i + BATCH_SIZE);
        const texts = batch.map((doc) => this.prepareDocText(doc));
        const results = await this.embedBatch(texts);

        for (let j = 0; j < batch.length; j++) {
          const doc = batch[j];
          const embedding = results[j];
          this.embeddings.set(doc.id, embedding);
          cache.docs[doc.id] = {
            hash: hashContent(doc.content),
            embedding,
          };
        }

        // Progress log every 50 docs
        if ((i + BATCH_SIZE) % 50 < BATCH_SIZE && i + BATCH_SIZE < needsEmbed.length) {
          console.error(
            `[gamecodex] Embedded ${Math.min(i + BATCH_SIZE, needsEmbed.length)}/${needsEmbed.length} docs...`
          );
        }
      }

      const elapsed = Date.now() - startTime;
      console.error(
        `[gamecodex] Computed ${needsEmbed.length} embeddings in ${elapsed}ms (${Math.round(elapsed / needsEmbed.length)}ms/doc)`
      );

      // Save updated cache
      this.saveCache(cache);
    }
  }

  /** Prepare doc text for embedding — title-weighted, truncated for model limits */
  private prepareDocText(doc: Doc): string {
    // Title gets extra weight by appearing twice
    // Truncate to ~512 tokens (~2048 chars) — MiniLM has 256 token limit but
    // title + description + beginning of content covers the semantic core
    const text = `${doc.title}. ${doc.title}. ${doc.description}. ${doc.content}`;
    return text.slice(0, 2048);
  }

  /** Embed a batch of texts */
  private async embedBatch(texts: string[]): Promise<number[][]> {
    const results: number[][] = [];
    for (const text of texts) {
      const output = await this.pipeline(text, {
        pooling: "mean",
        normalize: true,
      });
      results.push(Array.from(output.data as Float32Array));
    }
    return results;
  }

  /** Embed a single query string */
  async embedQuery(query: string): Promise<number[]> {
    if (!this.pipeline) throw new Error("Vector search not initialized");
    const output = await this.pipeline(query, {
      pooling: "mean",
      normalize: true,
    });
    return Array.from(output.data as Float32Array);
  }

  /** Search docs by vector similarity */
  async search(query: string, docs: Doc[], limit: number = 10): Promise<VectorResult[]> {
    if (!this.ready) return [];

    const queryEmbedding = await this.embedQuery(query);
    const results: VectorResult[] = [];

    for (const doc of docs) {
      const docEmbedding = this.embeddings.get(doc.id);
      if (!docEmbedding) continue;

      const similarity = cosineSimilarity(queryEmbedding, docEmbedding);
      results.push({ doc, similarity });
    }

    results.sort((a, b) => b.similarity - a.similarity);
    return results.slice(0, limit);
  }

  /** Load embedding cache from disk */
  private loadCache(): EmbeddingCache {
    try {
      if (fs.existsSync(CACHE_PATH)) {
        const raw = fs.readFileSync(CACHE_PATH, "utf-8");
        const cache: EmbeddingCache = JSON.parse(raw);
        if (cache.version === CACHE_VERSION && cache.modelId === MODEL_ID) {
          return cache;
        }
        console.error("[gamecodex] Embedding cache version mismatch, rebuilding");
      }
    } catch {
      console.error("[gamecodex] Failed to load embedding cache, starting fresh");
    }
    return { modelId: MODEL_ID, version: CACHE_VERSION, docs: {} };
  }

  /** Save embedding cache to disk */
  private saveCache(cache: EmbeddingCache): void {
    try {
      const dir = path.dirname(CACHE_PATH);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.writeFileSync(CACHE_PATH, JSON.stringify(cache));
      console.error(`[gamecodex] Saved embedding cache (${Object.keys(cache.docs).length} docs)`);
    } catch (err) {
      console.error(`[gamecodex] Failed to save embedding cache: ${err}`);
    }
  }
}
