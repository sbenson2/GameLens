/**
 * Search Quality Round 3 — 10 NEW natural-language queries (2026-03-22)
 * Focus: realistic user phrasing, new Godot docs (G4/G5), cross-engine, content gaps
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
  description: string;
  category: string;
}

const queries: QueryTest[] = [
  // 1. Real user phrasing — vague "how do I" style
  { query: "how do I save my game progress", description: "Save/load — known content gap", category: "content-gap" },
  
  // 2. Godot-specific query for new G5 physics doc
  { query: "godot rigidbody2d vs characterbody2d", description: "Should hit G5 physics doc", category: "godot-new" },
  
  // 3. Animation — common topic, natural phrasing
  { query: "sprite animation state transitions", description: "Animation + state machine intersection", category: "cross-system" },
  
  // 4. UI/UX — real user concern
  { query: "how to build inventory screen UI", description: "UI + inventory intersection", category: "natural-lang" },
  
  // 5. Godot input — new G4 doc
  { query: "godot coyote time jump buffering", description: "Should hit G4 input handling", category: "godot-new" },
  
  // 6. Debugging/profiling — common dev need
  { query: "my game is running slow how to profile", description: "Performance profiling", category: "natural-lang" },
  
  // 7. Design patterns — abstract query
  { query: "when to use singleton vs dependency injection", description: "Design patterns/architecture", category: "architecture" },
  
  // 8. Audio — potentially underserved
  { query: "sound effects music audio manager", description: "Audio system", category: "system" },
  
  // 9. Cross-engine comparison
  { query: "gdscript vs csharp which is better", description: "Should hit E2 language choice doc", category: "godot-new" },
  
  // 10. Dialogue/narrative — potential content gap
  { query: "dialogue system branching conversations", description: "Dialogue/narrative system", category: "content-gap" },
];

console.log(`\n=== Search Quality Round 3 — ${new Date().toISOString()} ===`);
console.log(`Corpus: ${allDocs.length} docs across ${modules.length + 1} modules\n`);

for (const test of queries) {
  const results = engine.search(test.query, allDocs, 5);
  const top3 = results.slice(0, 3);
  const top5 = results.slice(0, 5);
  
  console.log(`[${test.category}] "${test.query}"`);
  console.log(`  Description: ${test.description}`);
  
  if (results.length === 0) {
    console.log(`  ❌ ZERO RESULTS`);
  } else {
    console.log(`  Top 3:`);
    for (const r of top3) {
      console.log(`    ${r.doc.id} (${r.score.toFixed(2)}) — ${r.doc.title}`);
    }
    if (top5.length > 3) {
      console.log(`  Also (4-5): ${top5.slice(3).map(r => `${r.doc.id}(${r.score.toFixed(2)})`).join(", ")}`);
    }
  }
  console.log("");
}
