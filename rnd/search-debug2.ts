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

// Check ui-theory specifically
const uiTheory = allDocs.find(d => d.id === "ui-theory");
if (uiTheory) {
  console.log(`ui-theory title: "${uiTheory.title}"`);
  console.log(`ui-theory content length: ${uiTheory.content.length}`);
  // count key terms
  const lc = uiTheory.content.toLowerCase();
  for (const term of ["health", "bar", "hud", "display", "player", "stat"]) {
    const count = (lc.match(new RegExp(term, "g")) || []).length;
    console.log(`  "${term}" appears ${count} times`);
  }
} else {
  console.log("ui-theory NOT FOUND");
}

// Check G5 UI Framework
const g5ui = allDocs.find(d => d.id === "G5");
if (g5ui) {
  console.log(`\nG5 title: "${g5ui.title}"`);
  console.log(`G5 content length: ${g5ui.content.length}`);
  const lc = g5ui.content.toLowerCase();
  for (const term of ["health", "bar", "hud", "display", "player", "stat"]) {
    const count = (lc.match(new RegExp(term, "g")) || []).length;
    console.log(`  "${term}" appears ${count} times`);
  }
}

// Check G_stitch
const stitch = allDocs.find(d => d.id === "G_stitch_ui_workflow");
if (stitch) {
  console.log(`\nG_stitch title: "${stitch.title}"`);
  console.log(`G_stitch content length: ${stitch.content.length}`);
  const lc = stitch.content.toLowerCase();
  for (const term of ["health", "bar", "hud", "display", "player", "stat"]) {
    const count = (lc.match(new RegExp(term, "g")) || []).length;
    console.log(`  "${term}" appears ${count} times`);
  }
}

// What does "health bar" return?
console.log("\n=== 'health bar' ===");
for (const r of engine.search("health bar", allDocs, 5)) {
  console.log(`  ${r.doc.id} (${r.score.toFixed(2)}) — ${r.doc.title.slice(0, 60)}`);
}

// What does "HUD" return?
console.log("\n=== 'HUD' ===");
for (const r of engine.search("HUD", allDocs, 5)) {
  console.log(`  ${r.doc.id} (${r.score.toFixed(2)}) — ${r.doc.title.slice(0, 60)}`);
}

// Check the "godot start" problem  
console.log("\n=== 'getting started godot' ===");
for (const r of engine.search("getting started godot", allDocs, 5)) {
  console.log(`  ${r.doc.id} (${r.score.toFixed(2)}) — ${r.doc.title.slice(0, 60)}`);
}

console.log("\n=== 'godot beginner tutorial' ===");
for (const r of engine.search("godot beginner tutorial", allDocs, 5)) {
  console.log(`  ${r.doc.id} (${r.score.toFixed(2)}) — ${r.doc.title.slice(0, 60)}`);
}
