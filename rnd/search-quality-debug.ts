/**
 * Debug specific search failures
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

// Debug: Check what docs contain "inventory" prominently
console.log("=== Docs mentioning 'inventory' (checking title/description) ===");
for (const doc of allDocs) {
  const title = doc.title.toLowerCase();
  const desc = (doc.description || "").toLowerCase();
  if (title.includes("inventory") || desc.includes("inventory")) {
    console.log(`  ${doc.id} — ${doc.title}`);
  }
}

// Full search for "inventory" alone
console.log("\n=== Search: 'inventory' ===");
const invResults = engine.search("inventory", allDocs, 5);
for (const r of invResults) {
  console.log(`  ${r.doc.id}(${r.score.toFixed(2)}) — ${r.doc.title}`);
}

// Debug: G30 game feel
console.log("\n=== Search: 'game feel' ===");
const gfResults = engine.search("game feel", allDocs, 5);
for (const r of gfResults) {
  console.log(`  ${r.doc.id}(${r.score.toFixed(2)}) — ${r.doc.title}`);
}

// Debug: screen shake
console.log("\n=== Search: 'screen shake' ===");
const ssResults = engine.search("screen shake", allDocs, 5);
for (const r of ssResults) {
  console.log(`  ${r.doc.id}(${r.score.toFixed(2)}) — ${r.doc.title}`);
}

// Debug: enemy AI follow
console.log("\n=== Search: 'enemy AI pathfinding' ===");
const aiResults = engine.search("enemy AI pathfinding", allDocs, 5);
for (const r of aiResults) {
  console.log(`  ${r.doc.id}(${r.score.toFixed(2)}) — ${r.doc.title}`);
}

// Debug: check G_stitch doc size vs score contribution
console.log("\n=== G_stitch doc info ===");
const stitchDoc = allDocs.find(d => d.id === "G_stitch_ui_workflow");
if (stitchDoc) {
  console.log(`  ID: ${stitchDoc.id}`);
  console.log(`  Title: ${stitchDoc.title}`);
  console.log(`  Content length: ${stitchDoc.content.length} chars`);
  console.log(`  Description: ${(stitchDoc.description || "").slice(0, 100)}`);
}

// Check G10 for inventory
console.log("\n=== G10 doc info ===");
const g10 = allDocs.find(d => d.id === "G10");
if (g10) {
  console.log(`  ID: ${g10.id}`);
  console.log(`  Title: ${g10.title}`);
  console.log(`  Content length: ${g10.content.length} chars`);
  // Check if "inventory" appears
  const invCount = (g10.content.match(/inventory/gi) || []).length;
  console.log(`  "inventory" mentions: ${invCount}`);
}
