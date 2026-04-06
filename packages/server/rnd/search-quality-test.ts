/**
 * Search Quality Test — 20 queries scored for relevance
 * Run: npx tsx rnd/search-quality-test.ts
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

interface QueryTest {
  query: string;
  expectedTopIds: string[];   // doc IDs that SHOULD appear in top 5
  acceptableIds?: string[];   // IDs that are also acceptable (partial credit)
  category: string;
}

// Tests based on ACTUAL doc titles/content verified against the corpus
const tests: QueryTest[] = [
  // Basic concept lookups
  { query: "character controller", expectedTopIds: ["character-controller-theory", "G52"], category: "core" },
  { query: "character-controller", expectedTopIds: ["character-controller-theory", "G52"], category: "hyphen" },
  { query: "C# game architecture", expectedTopIds: ["E1"], acceptableIds: ["monogame-arch-rules", "E8"], category: "special-token" },
  { query: "how to make a platformer", expectedTopIds: ["G52"], acceptableIds: ["character-controller-theory"], category: "natural-language" },
  { query: "camera systems follow player", expectedTopIds: ["G20", "camera-theory"], category: "core" },

  // Genre queries — C1 is the genre reference, C2 is game feel  
  { query: "tower defense game", expectedTopIds: ["C1"], acceptableIds: ["C2", "G65", "G66", "G40"], category: "genre" },
  { query: "roguelike dungeon generation", expectedTopIds: ["procedural-generation-theory"], acceptableIds: ["C1", "G53"], category: "genre" },
  { query: "survival crafting game", expectedTopIds: ["C1"], acceptableIds: ["G65", "G10"], category: "genre" },
  { query: "bullet hell patterns", expectedTopIds: ["G67"], acceptableIds: ["C1", "G3"], category: "genre" },
  
  // System queries — verified against actual doc titles
  { query: "collision detection physics", expectedTopIds: ["G3", "physics-theory"], category: "system" },
  { query: "game loop update draw", expectedTopIds: ["G15"], acceptableIds: ["E1"], category: "system" },
  { query: "object pooling performance", expectedTopIds: ["G67"], acceptableIds: ["monogame-arch/P12", "G43"], category: "system" },
  { query: "combat damage health", expectedTopIds: ["G64"], category: "system" },
  { query: "building placement grid", expectedTopIds: ["G66"], category: "system" },
  { query: "economy shop currency", expectedTopIds: ["G65"], category: "system" },
  
  // Godot-specific
  { query: "godot scene composition nodes", expectedTopIds: ["godot-arch/G1"], acceptableIds: ["godot-arch/E1"], category: "godot" },
  { query: "godot state machine", expectedTopIds: ["godot-arch/G2"], acceptableIds: ["godot-rules", "godot-arch/E1"], category: "godot" },
  { query: "godot signals architecture", expectedTopIds: ["godot-arch/G3"], acceptableIds: ["godot-arch/E1"], category: "godot" },
  
  // Cross-cutting concepts  
  { query: "networking multiplayer", expectedTopIds: ["networking-theory"], acceptableIds: ["G9"], category: "concept" },
  { query: "tilemap systems tiled", expectedTopIds: ["G37"], acceptableIds: ["tilemap-theory"], category: "system" },
];

console.log(`\n=== Search Quality Test — ${new Date().toISOString()} ===`);
console.log(`Corpus: ${allDocs.length} docs across ${modules.length + 1} modules\n`);

let totalScore = 0;
let maxScore = 0;
const results: string[] = [];
const failures: string[] = [];

for (const test of tests) {
  const searchResults = engine.search(test.query, allDocs, 10);
  const top5Ids = searchResults.slice(0, 5).map(r => r.doc.id);
  
  // Score: 2 points per expected ID in top 3, 1 point in top 5
  // Acceptable IDs: 1 point in top 3, 0.5 in top 5 (partial credit)
  let queryScore = 0;
  let queryMax = test.expectedTopIds.length * 2;
  maxScore += queryMax;
  
  const hits: string[] = [];
  const misses: string[] = [];
  
  for (const expectedId of test.expectedTopIds) {
    const top3Match = searchResults.slice(0, 3).some(r => r.doc.id === expectedId);
    const top5Match = searchResults.slice(0, 5).some(r => r.doc.id === expectedId);
    
    if (top3Match) {
      queryScore += 2;
      hits.push(`${expectedId} ✅(top3)`);
    } else if (top5Match) {
      queryScore += 1;
      hits.push(`${expectedId} ⚠️(top5)`);
    } else {
      misses.push(expectedId);
    }
  }
  
  // Check acceptable IDs (bonus, capped at filling remaining expected slots)
  if (test.acceptableIds && misses.length > 0) {
    for (const accId of test.acceptableIds) {
      if (misses.length === 0) break;
      const top3Match = searchResults.slice(0, 3).some(r => r.doc.id === accId);
      const top5Match = searchResults.slice(0, 5).some(r => r.doc.id === accId);
      if (top3Match) {
        queryScore += 1; // half credit for acceptable in top 3
        hits.push(`${accId} 🔄(top3,acceptable)`);
        misses.shift();
      } else if (top5Match) {
        queryScore += 0.5;
        hits.push(`${accId} 🔄(top5,acceptable)`);
        misses.shift();
      }
    }
  }
  
  totalScore += queryScore;
  const pct = queryMax > 0 ? Math.round((queryScore / queryMax) * 100) : 0;
  const status = pct >= 80 ? "✅" : pct >= 50 ? "⚠️" : "❌";
  
  const line = `${status} [${test.category}] "${test.query}" — ${pct}% (${queryScore}/${queryMax})`;
  results.push(line);
  
  // Always show top 3 scores for analysis
  const debugLine = `  Top 5: ${top5Ids.join(", ")} | Top3 scores: ${searchResults.slice(0, 3).map(r => `${r.doc.id}(${r.score.toFixed(1)})`).join(", ")}`;
  results.push(debugLine);
  
  if (misses.length > 0) {
    results.push(`  Missing: ${misses.join(", ")}`);
  }
  if (hits.length > 0 && pct < 100) {
    results.push(`  Found: ${hits.join(", ")}`);
  }
  
  if (pct < 50) {
    failures.push(`"${test.query}" — expected ${test.expectedTopIds.join("/")} in top 5, got ${top5Ids.join(", ")}`);
  }
  
  results.push("");
}

const overallPct = Math.round((totalScore / maxScore) * 100);
console.log(results.join("\n"));
console.log(`\n=== OVERALL: ${totalScore}/${maxScore} (${overallPct}%) ===`);
if (failures.length > 0) {
  console.log(`\n❌ FAILURES (${failures.length}):`);
  failures.forEach(f => console.log(`  - ${f}`));
} else {
  console.log("\n✅ All queries passed!");
}
console.log("");
