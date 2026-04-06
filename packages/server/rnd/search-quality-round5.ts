/**
 * Search Quality Round 5 — 2026-03-25 11pm
 * 10 natural language queries a real user would type.
 * Evaluate top-3 relevance. Identify failures and zero-result queries.
 * Run: npx tsx rnd/search-quality-round5.ts
 */
import { DocStore } from "../src/core/docs.js";
import { SearchEngine } from "../src/core/search.js";
import * as path from "path";
import * as fs from "fs";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const docsDir = path.join(__dirname, "..", "docs");
const modules = ["monogame-arch", "godot-arch"];
const store = new DocStore(docsDir);
store.load(modules);
const allDocs = store.getAllDocs();

const engine = new SearchEngine();
engine.index(allDocs);

console.log(`\n📚 Loaded ${allDocs.length} docs\n`);

interface TestQuery {
  query: string;
  description: string;
  expectedTopics: string[]; // keywords that SHOULD appear in top-3 doc IDs or titles
}

const queries: TestQuery[] = [
  {
    query: "how do I add a health bar to my game",
    description: "Beginner asking about HUD/health display",
    expectedTopics: ["ui", "hud", "health", "combat"],
  },
  {
    query: "my character keeps sliding on slopes",
    description: "Physics debugging — slopes + CharacterBody",
    expectedTopics: ["physics", "character", "collision", "controller"],
  },
  {
    query: "best way to handle different weapons",
    description: "Combat architecture — weapon variety",
    expectedTopics: ["combat", "damage", "weapon", "pattern"],
  },
  {
    query: "godot autoload vs dependency injection",
    description: "Godot architecture decision",
    expectedTopics: ["godot", "autoload", "architecture", "signal", "scene"],
  },
  {
    query: "how to make smooth camera transitions between rooms",
    description: "Camera + room transitions",
    expectedTopics: ["camera", "transition", "scene"],
  },
  {
    query: "procedural dungeon generation roguelike",
    description: "PCG for roguelike genre",
    expectedTopics: ["procedural", "generation", "dungeon", "tilemap"],
  },
  {
    query: "networking predict client movement lag compensation",
    description: "Advanced multiplayer networking",
    expectedTopics: ["network", "multiplayer", "predict", "lag"],
  },
  {
    query: "pixel art animation import workflow",
    description: "Art pipeline for pixel games",
    expectedTopics: ["animation", "sprite", "art", "pixel"],
  },
  {
    query: "entity component system vs object oriented",
    description: "Architecture — ECS vs OOP",
    expectedTopics: ["ecs", "entity", "component", "architecture"],
  },
  {
    query: "how to make a dialog tree with choices",
    description: "Dialogue/narrative system",
    expectedTopics: ["dialogue", "dialog", "narrative", "ui"],
  },
];

console.log("=".repeat(80));
console.log("SEARCH QUALITY ROUND 5 — 10 Natural Language Queries");
console.log("Corpus: " + allDocs.length + " docs");
console.log("=".repeat(80));

interface QueryResult {
  query: string;
  description: string;
  top3: Array<{ id: string; title: string; score: number }>;
  top5: Array<{ id: string; title: string; score: number }>;
  verdict: "PASS" | "ACCEPTABLE" | "FAIL";
  notes: string;
}

const queryResults: QueryResult[] = [];

for (const tq of queries) {
  const results = engine.search(tq.query, allDocs, 5);
  const top3 = results.slice(0, 3);

  console.log(`\n${"─".repeat(70)}`);
  console.log(`Query: "${tq.query}"`);
  console.log(`  ${tq.description}`);
  console.log(`  Expected topics: ${tq.expectedTopics.join(", ")}`);

  for (let i = 0; i < results.length; i++) {
    const r = results[i];
    const marker = i < 3 ? "→" : " ";
    console.log(`  ${marker} ${i + 1}. [${r.score.toFixed(2)}] ${r.doc.id} — "${r.doc.title}"`);
  }

  if (results.length === 0) {
    console.log(`  ❌ ZERO RESULTS`);
  }

  // Evaluate relevance
  const top3Text = top3.map(r => `${r.doc.id} ${r.doc.title} ${r.doc.description || ""}`.toLowerCase()).join(" ");
  const matchedTopics = tq.expectedTopics.filter(t => top3Text.includes(t.toLowerCase()));
  const matchRatio = matchedTopics.length / tq.expectedTopics.length;

  let verdict: "PASS" | "ACCEPTABLE" | "FAIL";
  let notes = "";

  if (results.length === 0) {
    verdict = "FAIL";
    notes = "Zero results returned";
  } else if (matchRatio >= 0.4 && top3[0].score > 0.5) {
    verdict = "PASS";
    notes = `Matched topics: ${matchedTopics.join(", ")} (${matchedTopics.length}/${tq.expectedTopics.length})`;
  } else if (matchRatio >= 0.2 || top3[0].score > 0.3) {
    verdict = "ACCEPTABLE";
    notes = `Partial: ${matchedTopics.join(", ") || "none"} (${matchedTopics.length}/${tq.expectedTopics.length}). Score: ${top3[0].score.toFixed(2)}`;
  } else {
    verdict = "FAIL";
    notes = `Poor: ${matchedTopics.join(", ") || "none"} (${matchedTopics.length}/${tq.expectedTopics.length}). Score: ${top3[0]?.score.toFixed(2) ?? "N/A"}`;
  }

  const icon = verdict === "PASS" ? "✅" : verdict === "ACCEPTABLE" ? "⚠️" : "❌";
  console.log(`  ${icon} ${verdict}: ${notes}`);

  queryResults.push({
    query: tq.query,
    description: tq.description,
    top3: top3.map(r => ({ id: r.doc.id, title: r.doc.title, score: r.score })),
    top5: results.map(r => ({ id: r.doc.id, title: r.doc.title, score: r.score })),
    verdict,
    notes,
  });
}

// Summary
console.log(`\n${"=".repeat(80)}`);
console.log("SUMMARY");
console.log(`${"=".repeat(80)}`);
const pass = queryResults.filter(r => r.verdict === "PASS").length;
const acceptable = queryResults.filter(r => r.verdict === "ACCEPTABLE").length;
const fail = queryResults.filter(r => r.verdict === "FAIL").length;
const zeroResults = queryResults.filter(r => r.top3.length === 0).length;

console.log(`✅ PASS: ${pass}/10  |  ⚠️ ACCEPTABLE: ${acceptable}/10  |  ❌ FAIL: ${fail}/10`);
console.log(`Zero-result queries: ${zeroResults}`);
console.log(`Weighted score: ${((pass * 3 + acceptable * 1.5) / 30 * 100).toFixed(1)}%`);

// Write results JSON
const outputPath = path.join(__dirname, "search-quality-round5-results.json");
fs.writeFileSync(outputPath, JSON.stringify({
  timestamp: new Date().toISOString(),
  corpus: allDocs.length,
  queries: queryResults,
  summary: { pass, acceptable, fail, zeroResults }
}, null, 2));
console.log(`\nResults → ${outputPath}`);
