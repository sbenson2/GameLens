/**
 * Round 5: Search Quality — 10 natural language queries a real user would type
 * Focus: queries phrased as real MCP users think, not as devs who know the corpus
 */
import { DocStore } from "../src/core/docs.js";
import { SearchEngine } from "../src/core/search.js";
import * as path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const docsDir = path.join(__dirname, "..", "docs");
const modules = ["monogame-arch", "godot-arch"];
const store = new DocStore(docsDir);
store.load(modules);
const allDocs = store.getAllDocs();

const engine = new SearchEngine();
engine.index(allDocs);

console.log(`=== Round 5: Search Quality Deep Dive — ${new Date().toISOString()} ===`);
console.log(`Corpus: ${allDocs.length} docs\n`);

// 10 queries a real user would actually type into an MCP-connected AI assistant
const queries = [
  {
    q: "how to make enemies patrol and chase player",
    expect: ["G4", "ai-theory", "pathfinding-theory"],
    category: "AI/behavioral",
    why: "Classic AI question — patrol + chase = state machine + steering/pathfinding"
  },
  {
    q: "godot pixel art camera jitter fix",
    expect: ["godot-arch/G6", "camera-theory"],
    category: "Godot-specific bug fix",
    why: "Common Godot issue — pixel snap + camera smoothing interaction"
  },
  {
    q: "best practices for organizing game code",
    expect: ["G12", "G18", "E1", "godot-arch/E1"],
    category: "Architecture/patterns",
    why: "Vague architecture question — design patterns, architecture overview"
  },
  {
    q: "weapon upgrade system with stats",
    expect: ["G10", "G65", "combat-theory"],
    category: "Game system design",
    why: "Touches inventory (G10), economy (G65), and combat stats"
  },
  {
    q: "my game stutters when spawning lots of bullets",
    expect: ["G67", "G33", "particles-theory"],
    category: "Performance debugging",
    why: "Object pooling (G67) is THE answer, plus profiling (G33)"
  },
  {
    q: "how to make a minimap",
    expect: ["G20", "camera-theory", "fog-of-war-theory"],
    category: "UI/rendering feature",
    why: "Minimap = camera subsystem, may touch fog of war"
  },
  {
    q: "godot export variable inspector custom resource",
    expect: ["godot-arch/G1", "godot-arch/E1", "godot-rules"],
    category: "Godot editor workflow",
    why: "@export + custom resources = scene composition (G1)"
  },
  {
    q: "making a card game deck shuffling hand management",
    expect: ["C1", "G10", "G68"],
    category: "Genre-specific",
    why: "Card game = genre ref (C1), inventory-like (G10), puzzle systems (G68)"
  },
  {
    q: "why does my character slide on slopes",
    expect: ["G52", "character-controller-theory", "physics-theory", "godot-arch/G5"],
    category: "Physics bug fix",
    why: "Slope handling is a character controller + physics problem"
  },
  {
    q: "how to add controller vibration gamepad rumble",
    expect: ["godot-arch/G4", "G7", "input-handling-theory"],
    category: "Input/haptics",
    why: "Gamepad vibration covered in input handling docs"
  },
];

let totalScore = 0;
let passCount = 0;
let acceptableCount = 0;
let failCount = 0;

for (const { q, expect, category, why } of queries) {
  const results = engine.search(q, allDocs, 10);
  const top3 = results.slice(0, 3);
  const top5 = results.slice(0, 5);
  
  // Check if any expected doc appears in top 3 (PASS) or top 5 (ACCEPTABLE)
  const top3Ids = top3.map(r => r.doc.id.toLowerCase());
  const top5Ids = top5.map(r => r.doc.id.toLowerCase());
  const expectLower = expect.map(e => e.toLowerCase());
  
  const inTop3 = expectLower.some(e => top3Ids.some(id => id.includes(e) || e.includes(id)));
  const inTop5 = expectLower.some(e => top5Ids.some(id => id.includes(e) || e.includes(id)));
  
  let grade: string;
  if (inTop3) {
    grade = "PASS";
    passCount++;
    totalScore += 3;
  } else if (inTop5) {
    grade = "ACCEPTABLE";
    acceptableCount++;
    totalScore += 1.5;
  } else {
    grade = "FAIL";
    failCount++;
  }
  
  console.log(`[${grade}] ${category}: q="${q}"`);
  console.log(`  Expected: ${expect.join(" | ")}`);
  console.log(`  Top 3:`);
  for (const r of top3) {
    console.log(`    ${r.doc.id} (${r.score.toFixed(2)}) — ${r.doc.title.slice(0, 60)}`);
  }
  if (!inTop3 && top5.length > 3) {
    console.log(`  #4-5:`);
    for (const r of top5.slice(3)) {
      console.log(`    ${r.doc.id} (${r.score.toFixed(2)}) — ${r.doc.title.slice(0, 60)}`);
    }
  }
  console.log("");
}

const maxScore = queries.length * 3;
const pct = ((totalScore / maxScore) * 100).toFixed(1);
console.log(`\n=== SUMMARY ===`);
console.log(`PASS: ${passCount}  |  ACCEPTABLE: ${acceptableCount}  |  FAIL: ${failCount}`);
console.log(`Score: ${totalScore}/${maxScore} (${pct}%)`);
console.log(`Corpus: ${allDocs.length} docs`);

// Also test for zero-result queries (content gaps)
console.log(`\n=== ZERO-RESULT QUERIES (Content Gap Check) ===`);
const gapQueries = [
  "dialogue branching tree visual novel",
  "water shader reflection godot",
  "leaderboard achievement online",
  "accessibility colorblind mode options menu",
  "level editor runtime user-created content",
];

for (const q of gapQueries) {
  const results = engine.search(q, allDocs, 5);
  const hasResults = results.length > 0 && results[0].score > 0.3;
  console.log(`${hasResults ? "✅" : "⚠️ GAP"} "${q}" → ${results.length > 0 ? `${results[0].doc.id} (${results[0].score.toFixed(2)})` : "NO RESULTS"}`);
}
