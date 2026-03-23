/**
 * Round 4: 10 new natural-language queries — real user phrasing
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

console.log(`=== Round 4: Natural Language Deep Dive — ${new Date().toISOString()} ===`);
console.log(`Corpus: ${allDocs.length} docs\n`);

const queries = [
  { q: "godot camera smooth follow deadzone", expect: "godot-arch/G6", why: "G6 Camera Systems covers smoothing + deadzone" },
  { q: "procedural dungeon tilemap godot", expect: "godot-arch/G7", why: "G7 has BSP dungeon generator, cellular automata" },
  { q: "damage types armor resistance formula", expect: "combat-theory", why: "combat-theory has armor models and diminishing returns formula" },
  { q: "physics body types rigid kinematic static", expect: "physics-theory or godot-arch/G5 or G3", why: "Should surface physics docs from multiple modules" },
  { q: "save game progress serialization json", expect: "G69", why: "G69 Save/Load Serialization is a 113KB dedicated doc" },
  { q: "how do I start making a game in godot", expect: "godot-arch/E1 or godot-rules", why: "Architecture overview or rules doc for beginners" },
  { q: "screen shake trauma system implementation", expect: "camera docs or combat-theory", why: "Screen shake covered in camera + combat feel" },
  { q: "my character clips through walls", expect: "physics or character-controller", why: "Collision bug = physics doc" },
  { q: "turn based combat initiative speed system", expect: "combat-theory", why: "combat-theory has 5 turn order systems" },
  { q: "health bar HUD display player stats", expect: "ui-theory or G5 UI", why: "HUD/health bar is UI territory" },
];

for (const { q, expect, why } of queries) {
  const results = engine.search(q, allDocs, 10);
  const top3 = results.slice(0, 3);
  const top5 = results.slice(0, 5);
  
  console.log(`Query: "${q}"`);
  console.log(`  Expected: ${expect} — ${why}`);
  console.log(`  Top 3:`);
  for (const r of top3) {
    console.log(`    ${r.doc.id} (${r.score.toFixed(2)}) — ${r.doc.title.slice(0, 60)}`);
  }
  if (top5.length > 3) {
    console.log(`  #4-5:`);
    for (const r of top5.slice(3)) {
      console.log(`    ${r.doc.id} (${r.score.toFixed(2)}) — ${r.doc.title.slice(0, 60)}`);
    }
  }
  console.log("");
}
