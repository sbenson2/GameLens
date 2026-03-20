#!/usr/bin/env tsx
/**
 * Upload docs to Cloudflare KV for the Workers API.
 *
 * Usage:
 *   npx tsx scripts/upload-docs.ts                    # dry run (prints manifest)
 *   npx tsx scripts/upload-docs.ts --write            # write KV JSON files for wrangler bulk upload
 *   npx wrangler kv bulk put --binding DOCS_KV < kv-bulk.json  # upload to KV
 *
 * This script:
 * 1. Scans the docs/ directory (same as DocStore.load)
 * 2. Builds a manifest (doc metadata + sections) and search index
 * 3. Outputs JSON files for wrangler kv bulk put
 */

import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DOCS_ROOT = path.resolve(__dirname, "../../docs");
const FREE_MODULES = ["core"];
const ACTIVE_MODULES = ["core", "monogame-arch", "godot-arch"];

interface DocEntry {
  id: string;
  title: string;
  description: string;
  category: string;
  module: string;
  tier: "free" | "pro";
  sizeBytes: number;
  sections: string[];
  content: string;
  tokens: string[];
}

// --- Tokenizer (mirrors search.ts) ---

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

function tokenize(text: string): string[] {
  let processed = text.replace(/C#/gi, "csharp");
  const raw = processed.toLowerCase().match(/[\w-]+/g) ?? [];
  const tokens: string[] = [];
  for (const token of raw) {
    if (token.includes("-")) {
      tokens.push(token);
      for (const part of token.split("-")) {
        if (part.length > 1 && !STOP_WORDS.has(part)) tokens.push(part);
      }
    } else if (token.length > 1 && !STOP_WORDS.has(token)) {
      tokens.push(token);
    }
  }
  return tokens; // keep duplicates for TF scoring
}

// --- Doc loading (mirrors core/docs.ts) ---

function extractTitle(content: string, filename: string): string {
  const match = content.match(/^#\s+(.+)/m);
  if (match) {
    return match[1].replace(/\[([^\]]+)\]\([^)]+\)/g, "$1").replace(/[*_`]/g, "").trim();
  }
  return filename.replace(/\.md$/, "").replace(/[_-]/g, " ");
}

function extractDescription(content: string): string {
  const lines = content.split("\n");
  let pastTitle = false;
  for (const line of lines) {
    if (line.startsWith("# ")) { pastTitle = true; continue; }
    if (!pastTitle) continue;
    const trimmed = line.trim();
    if (trimmed === "" || trimmed.startsWith("!") || trimmed.startsWith(">")) continue;
    if (trimmed.startsWith("#")) break;
    if (trimmed.startsWith("---")) continue;
    const clean = trimmed.replace(/\[([^\]]+)\]\([^)]+\)/g, "$1").replace(/[*_`]/g, "");
    return clean.length > 120 ? clean.slice(0, 117) + "..." : clean;
  }
  return "";
}

function extractSections(content: string): string[] {
  const headings: string[] = [];
  for (const line of content.split("\n")) {
    const match = line.match(/^#{2,3}\s+(.+)/);
    if (match) headings.push(match[1].trim());
  }
  return headings;
}

function deriveId(filename: string): string {
  const base = filename.replace(/\.md$/, "");
  const prefixMatch = base.match(/^([A-Z]\d+)/);
  if (prefixMatch) return prefixMatch[1];
  return base;
}

function dirToCategory(dirPath: string): string {
  const parts = dirPath.split(path.sep);
  for (const part of parts) {
    switch (part) {
      case "reference": return "reference";
      case "architecture": return "architecture";
      case "guides": return "guide";
      case "game-design": return "catalog";
      case "project-management": return "playbook";
      case "programming": return "guide";
      case "ai-workflow": return "explanation";
      case "concepts": return "concept";
      case "session": return "explanation";
    }
  }
  return "reference";
}

function loadDocsFromDir(dirPath: string, module: string, existingIds: Set<string>): DocEntry[] {
  const docs: DocEntry[] = [];
  if (!fs.existsSync(dirPath)) return docs;

  const entries = fs.readdirSync(dirPath, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      docs.push(...loadDocsFromDir(fullPath, module, existingIds));
    } else if (entry.name.endsWith(".md")) {
      const content = fs.readFileSync(fullPath, "utf-8");
      let id = deriveId(entry.name);
      if (existingIds.has(id)) id = `${module}/${id}`;
      existingIds.add(id);

      const tier = FREE_MODULES.includes(module) ? "free" : "pro";
      const category = dirToCategory(fullPath);

      docs.push({
        id,
        title: extractTitle(content, entry.name),
        description: extractDescription(content),
        category,
        module,
        tier,
        sizeBytes: Buffer.byteLength(content, "utf-8"),
        sections: extractSections(content),
        content,
        tokens: tokenize(content),
      });
    }
  }
  return docs;
}

// --- Main ---

function main() {
  const writeMode = process.argv.includes("--write");
  const existingIds = new Set<string>();
  const allDocs: DocEntry[] = [];

  for (const mod of ACTIVE_MODULES) {
    const modPath = path.join(DOCS_ROOT, mod);
    allDocs.push(...loadDocsFromDir(modPath, mod, existingIds));
  }

  console.log(`Loaded ${allDocs.length} docs from ${ACTIVE_MODULES.join(", ")}`);
  console.log(`  Free: ${allDocs.filter(d => d.tier === "free").length}`);
  console.log(`  Pro: ${allDocs.filter(d => d.tier === "pro").length}`);

  // Build manifest (metadata only, no content/tokens)
  const manifest = allDocs.map(d => ({
    id: d.id,
    title: d.title,
    description: d.description,
    category: d.category,
    module: d.module,
    tier: d.tier,
    sizeBytes: d.sizeBytes,
    sections: d.sections,
  }));

  // Build search index (tokens, no content)
  const searchIndex = allDocs.map(d => ({
    id: d.id,
    title: d.title,
    description: d.description,
    category: d.category,
    module: d.module,
    tier: d.tier,
    tokens: d.tokens,
  }));

  if (!writeMode) {
    console.log("\nManifest preview (first 5):");
    for (const doc of manifest.slice(0, 5)) {
      console.log(`  ${doc.id}: ${doc.title} [${doc.module}/${doc.category}] (${doc.tier}, ${doc.sizeBytes}B, ${doc.sections.length} sections)`);
    }
    console.log("\nRun with --write to generate KV bulk upload files.");
    return;
  }

  // Generate wrangler kv bulk put JSON
  // Each entry: { key: string, value: string }
  const bulkEntries: { key: string; value: string }[] = [];

  // Manifest
  bulkEntries.push({
    key: "index:manifest",
    value: JSON.stringify(manifest),
  });

  // Search index
  bulkEntries.push({
    key: "index:search",
    value: JSON.stringify(searchIndex),
  });

  // Individual doc content
  for (const doc of allDocs) {
    bulkEntries.push({
      key: `doc:${doc.id}`,
      value: doc.content,
    });
  }

  const outPath = path.resolve(__dirname, "../kv-bulk.json");
  fs.writeFileSync(outPath, JSON.stringify(bulkEntries, null, 2));
  console.log(`\nWrote ${bulkEntries.length} KV entries to ${outPath}`);
  console.log(`  Manifest: 1 entry (${JSON.stringify(manifest).length} bytes)`);
  console.log(`  Search index: 1 entry (${JSON.stringify(searchIndex).length} bytes)`);
  console.log(`  Doc content: ${allDocs.length} entries`);
  console.log(`\nUpload with:`);
  console.log(`  cd workers && npx wrangler kv bulk put --binding DOCS_KV kv-bulk.json`);
}

main();
