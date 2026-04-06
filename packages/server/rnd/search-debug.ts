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

// Debug: check what tokens the queries produce and what's in the engine
const debugQueries = [
  "how do I start making a game in godot",
  "health bar HUD display player stats",
  "my character clips through walls",
];

for (const q of debugQueries) {
  console.log(`\n=== Debug: "${q}" ===`);
  const results = engine.search(q, allDocs, 10);
  console.log("Top 10:");
  for (const r of results) {
    console.log(`  ${r.doc.id} (${r.score.toFixed(2)}) — ${r.doc.title.slice(0, 70)}`);
  }
}

// Check if ui-theory exists
const uiDocs = allDocs.filter(d => d.id.includes("ui") || d.title.toLowerCase().includes("ui"));
console.log("\n=== UI-related docs ===");
for (const d of uiDocs) {
  console.log(`  ${d.id} — ${d.title}`);
}

// Check godot docs ranking for "godot"
console.log("\n=== 'godot' query ===");
const godotResults = engine.search("godot", allDocs, 10);
for (const r of godotResults) {
  console.log(`  ${r.doc.id} (${r.score.toFixed(2)}) — ${r.doc.title.slice(0, 70)}`);
}
