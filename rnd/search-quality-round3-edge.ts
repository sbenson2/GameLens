/**
 * Search Quality Round 3 — Edge cases & stress test (2026-03-22)
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

const edgeQueries = [
  "save load serialization",
  "profiling optimization fps",
  "how to make enemies follow player",
  "particle effects explosion",
  "level editor procedural",
  "shader rendering post processing",
  "game feel screen shake",
  "pathfinding A* navigation",
  "inventory drag and drop",
  "multiplayer sync latency",
];

console.log("=== Edge Case & Stress Queries ===\n");
for (const q of edgeQueries) {
  const results = engine.search(q, allDocs, 3);
  if (results.length === 0) {
    console.log(`❌ ZERO: "${q}"`);
  } else {
    const top = results.map(r => `${r.doc.id}(${r.score.toFixed(2)})`).join(", ");
    console.log(`"${q}" → ${top}`);
  }
}

// Check G_stitch_ui_workflow appearing in unexpected places
console.log("\n=== G_stitch ranking investigation ===");
for (const q of ["gdscript vs csharp", "building placement grid", "survival crafting game"]) {
  const results = engine.search(q, allDocs, 8);
  const stitchResult = results.find(r => r.doc.id === "G_stitch_ui_workflow");
  if (stitchResult) {
    const rank = results.indexOf(stitchResult) + 1;
    console.log(`"${q}" → G_stitch at rank ${rank} (score ${stitchResult.score.toFixed(2)})`);
  }
}
