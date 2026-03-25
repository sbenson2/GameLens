/**
 * Search Quality Round 5 — 10 new natural language queries (2026-03-25)
 * Focus: Real user phrasing, new Godot docs (G8 Animation, G9 UI, G7 TileMap),
 *        semantic gaps, cross-engine, content discovery
 * Run: npx tsx rnd/search-quality-round5.ts
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

interface QueryTest {
  query: string;
  /** IDs that should appear in top 3 (at least one must hit) */
  expectedTop3: string[];
  /** IDs that are acceptable in top 3 (don't penalize) */
  acceptable?: string[];
  category: string;
  notes?: string;
}

const tests: QueryTest[] = [
  // 1. New user asking about UI in Godot
  {
    query: "how to create health bar in godot",
    expectedTop3: ["godot-arch/G9"],
    acceptable: ["ui-theory", "godot-rules"],
    category: "godot-ui",
    notes: "G9 has full HUD health bar implementation"
  },
  // 2. Animation blend tree — new G8 doc
  {
    query: "animation blend tree state machine godot",
    expectedTop3: ["godot-arch/G8"],
    acceptable: ["godot-arch/G2", "animation-theory"],
    category: "godot-animation",
    notes: "G8 covers AnimationTree blend trees and state machines"
  },
  // 3. Procedural dungeon generation with tilemaps
  {
    query: "procedural dungeon generation tilemap",
    expectedTop3: ["godot-arch/G7", "procedural-generation-theory"],
    acceptable: ["tilemap-theory", "G53", "G37"],
    category: "procgen",
    notes: "G7 has BSP dungeon + cellular automata + WFC"
  },
  // 4. Vague new-user question about game architecture
  {
    query: "how should I structure my game code",
    expectedTop3: ["E1"],
    acceptable: ["godot-arch/E1", "monogame-arch-rules", "G12"],
    category: "architecture",
    notes: "E1 architecture overview is the canonical starting point"
  },
  // 5. Real question from r/godot about settings menus
  {
    query: "settings menu audio volume slider save",
    expectedTop3: ["godot-arch/G9"],
    acceptable: ["audio-theory", "G6", "ui-theory"],
    category: "ui-settings",
    notes: "G9 has full settings screen with audio bus + ConfigFile"
  },
  // 6. Cross-engine concept — testing combat theory
  {
    query: "damage types armor resistance calculation",
    expectedTop3: ["combat-theory", "G64"],
    acceptable: [],
    category: "combat-math",
    notes: "combat-theory has armor models + diminishing returns formula"
  },
  // 7. Semantic gap test — user means screen transitions
  {
    query: "fade to black between scenes",
    expectedTop3: ["godot-arch/G9", "scene-management-theory"],
    acceptable: ["G38", "godot-arch/G6", "ui-theory"],
    category: "transitions",
    notes: "G9 has screen transition autoload with fade"
  },
  // 8. Common indie dev question about save systems
  {
    query: "how to save player inventory and progress",
    expectedTop3: ["G69"],
    acceptable: ["G10", "godot-arch/G9"],
    category: "save-system",
    notes: "G69 is the 113KB save/load serialization guide"
  },
  // 9. Steering/flocking AI (tests synonym expansion)
  {
    query: "boids flocking steering behavior",
    expectedTop3: ["G4", "ai-theory"],
    acceptable: ["pathfinding-theory", "godot-arch/G2"],
    category: "ai-steering",
    notes: "G4 AI Systems has steering behaviors section"
  },
  // 10. GDScript-specific question — language choice
  {
    query: "should I use gdscript or csharp for my godot game",
    expectedTop3: ["godot-arch/E2"],
    acceptable: ["godot-arch/E1", "godot-rules"],
    category: "language-choice",
    notes: "E2 is the definitive GDScript vs C# decision doc"
  },
];

console.log(`\n=== Search Quality Round 5 — ${new Date().toISOString()} ===`);
console.log(`Corpus: ${allDocs.length} docs\n`);

let totalPass = 0;
let totalTests = 0;
const failures: { query: string; expected: string[]; actual: string[]; scores: string[] }[] = [];
const details: string[] = [];

for (const test of tests) {
  totalTests++;
  const results = engine.search(test.query, allDocs, 10);
  const top3 = results.slice(0, 3);
  const top3Ids = top3.map(r => r.doc.id);
  const top5Ids = results.slice(0, 5).map(r => r.doc.id);

  // Check if any expected ID appears in top 3
  const expectedHit = test.expectedTop3.some(id => top3Ids.includes(id));
  // Check if top 3 has at least expected or acceptable
  const allTop3Valid = top3Ids.every(id =>
    test.expectedTop3.includes(id) ||
    (test.acceptable ?? []).includes(id) ||
    true // we don't penalize unexpected results, only check expected hit
  );

  const pass = expectedHit;
  if (pass) totalPass++;

  const scoreStr = top3.map(r => `${r.doc.id}(${r.score.toFixed(2)})`).join(", ");
  const verdict = pass ? "✅" : "❌";
  console.log(`${verdict} [${test.category}] "${test.query}"`);
  console.log(`  Top 3: ${scoreStr}`);
  console.log(`  Top 5: ${top5Ids.join(", ")}`);
  if (test.notes) console.log(`  Notes: ${test.notes}`);

  if (!pass) {
    failures.push({
      query: test.query,
      expected: test.expectedTop3,
      actual: top3Ids,
      scores: top3.map(r => `${r.doc.id}(${r.score.toFixed(2)})`)
    });
  }
  console.log();

  details.push(`| ${test.category} | "${test.query}" | ${scoreStr} | ${verdict} ${pass ? "PASS" : "FAIL"} |`);
}

console.log(`\n=== RESULTS: ${totalPass}/${totalTests} passed (${((totalPass/totalTests)*100).toFixed(0)}%) ===\n`);

if (failures.length > 0) {
  console.log("FAILURES:");
  for (const f of failures) {
    console.log(`  ❌ "${f.query}"`);
    console.log(`     Expected one of: ${f.expected.join(", ")}`);
    console.log(`     Got top 3: ${f.scores.join(", ")}`);
  }
}

// Print markdown table
console.log("\n### Markdown Table\n");
console.log("| Category | Query | Top 3 (scores) | Verdict |");
console.log("|----------|-------|-----------------|---------|");
for (const d of details) console.log(d);
