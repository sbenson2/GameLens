#!/usr/bin/env node
/**
 * Search Quality Test Harness
 * Runs natural language queries against the search engine and evaluates top-3 relevance.
 */

import { SearchEngine } from "../dist/core/search.js";
import { DocStore } from "../dist/core/docs.js";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const docsRoot = path.join(__dirname, "..", "docs");

// Load docs
const store = new DocStore(docsRoot);
store.load(["monogame-arch", "godot-arch"]);
const allDocs = store.getAllDocs();

// Build search index
const engine = new SearchEngine();
engine.index(allDocs);

console.log(`Indexed ${allDocs.length} docs\n`);

// 10 natural language queries a real user would type
const queries = [
  {
    query: "how do I make my character jump and move",
    expectTopIds: ["character-controller-theory", "G52"],
    description: "Character movement/platformer basics"
  },
  {
    query: "camera follow player smoothly",
    expectTopIds: ["G20", "camera-theory"],
    description: "Camera follow/smoothing"
  },
  {
    query: "save game data to file",
    expectTopIds: ["G10"],
    description: "Save/load systems"
  },
  {
    query: "C# performance optimization tips",
    expectTopIds: ["G13", "G33"],
    description: "C# perf (tests C# token handling)"
  },
  {
    query: "enemy AI pathfinding behavior tree",
    expectTopIds: ["G4", "ai-theory", "pathfinding-theory"],
    description: "AI + pathfinding combined query"
  },
  {
    query: "how to add multiplayer networking",
    expectTopIds: ["G9"],
    description: "Networking/multiplayer"
  },
  {
    query: "tilemap collision layers",
    expectTopIds: ["G37", "tilemap-theory", "G3"],
    description: "Tilemap + collision crossover"
  },
  {
    query: "particle effects explosions",
    expectTopIds: ["particles-theory", "G23"],
    description: "Particle systems"
  },
  {
    query: "state machine animation player",
    expectTopIds: ["G31", "animation-theory", "godot-arch/G2"],
    description: "Animation state machines"
  },
  {
    query: "building placement grid system",
    expectTopIds: ["G66"],
    description: "Building/placement (recent content)"
  },
];

let totalScore = 0;
let maxScore = 0;
const failures = [];
const zeroResults = [];

for (const test of queries) {
  const results = engine.search(test.query, allDocs, 10);
  const top3 = results.slice(0, 3);
  const top3Ids = top3.map(r => r.doc.id);
  const top10Ids = results.slice(0, 10).map(r => r.doc.id);
  
  // Score: 3 points if expected doc is #1, 2 if #2, 1 if #3, 0.5 if in top 10
  let queryScore = 0;
  let queryMax = 0;
  const details = [];
  
  for (const expectedId of test.expectTopIds.slice(0, 3)) {
    queryMax += 3;
    const pos = top3Ids.indexOf(expectedId);
    const pos10 = top10Ids.indexOf(expectedId);
    if (pos === 0) {
      queryScore += 3;
      details.push(`  ✅ ${expectedId} at #1`);
    } else if (pos === 1) {
      queryScore += 2;
      details.push(`  ✅ ${expectedId} at #2`);
    } else if (pos === 2) {
      queryScore += 1;
      details.push(`  ⚠️ ${expectedId} at #3`);
    } else if (pos10 >= 0) {
      queryScore += 0.5;
      details.push(`  ⚠️ ${expectedId} at #${pos10 + 1} (outside top 3)`);
    } else {
      details.push(`  ❌ ${expectedId} NOT in top 10`);
    }
  }
  
  totalScore += queryScore;
  maxScore += queryMax;
  
  const pct = Math.round((queryScore / queryMax) * 100);
  const icon = pct >= 80 ? "✅" : pct >= 50 ? "⚠️" : "❌";
  
  console.log(`${icon} "${test.query}" — ${test.description}`);
  console.log(`   Score: ${queryScore}/${queryMax} (${pct}%)`);
  console.log(`   Top 3: ${top3Ids.join(", ") || "(no results)"}`);
  if (top3.length > 0) {
    console.log(`   Scores: ${top3.map(r => `${r.doc.id}(${r.score.toFixed(2)})`).join(", ")}`);
  }
  for (const d of details) console.log(d);
  
  if (results.length === 0) {
    zeroResults.push(test);
  }
  if (pct < 50) {
    failures.push({ ...test, actualTop3: top3Ids, score: pct });
  }
  
  console.log();
}

console.log("═".repeat(60));
console.log(`OVERALL SCORE: ${totalScore}/${maxScore} (${Math.round((totalScore / maxScore) * 100)}%)`);
console.log(`Queries: ${queries.length} | Zero-result: ${zeroResults.length} | Failures (<50%): ${failures.length}`);

if (failures.length > 0) {
  console.log(`\n🔴 FAILURES:`);
  for (const f of failures) {
    console.log(`  - "${f.query}" → got [${f.actualTop3.join(", ")}], wanted [${f.expectTopIds.join(", ")}]`);
  }
}

if (zeroResults.length > 0) {
  console.log(`\n🔴 ZERO RESULTS:`);
  for (const z of zeroResults) {
    console.log(`  - "${z.query}"`);
  }
}

// Additional: check for content gaps — queries that SHOULD have docs but don't
console.log(`\n${"═".repeat(60)}`);
console.log("CONTENT GAP CHECK — queries with weak coverage:");
const gapQueries = [
  "dialogue system branching",
  "inventory crafting recipe",
  "procedural dungeon generation",
  "water shader reflection",
  "mobile touch controls gestures",
];

for (const q of gapQueries) {
  const results = engine.search(q, allDocs, 3);
  if (results.length === 0) {
    console.log(`  🔴 "${q}" → NO RESULTS`);
  } else {
    const topScore = results[0].score;
    const icon = topScore < 1.0 ? "⚠️" : "✅";
    console.log(`  ${icon} "${q}" → ${results.map(r => `${r.doc.id}(${r.score.toFixed(2)})`).join(", ")}`);
  }
}
