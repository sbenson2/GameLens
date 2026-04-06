import { handleTeach } from "./src/tools/teach.js";
import { DocStore } from "./src/core/docs.js";
import { SearchEngine } from "./src/core/search.js";
import * as path from "path";

async function main() {
  // Set up real doc store
  const docsRoot = path.join(process.cwd(), "docs");
  const docStore = new DocStore(docsRoot);
  docStore.load(["monogame-arch", "godot-arch"]);

  const searchEngine = new SearchEngine();
  searchEngine.index(docStore.getAllDocs());

  console.log(`Loaded ${docStore.getAllDocs().length} docs\n`);

  // Test 1: List paths
  console.log("=== list_paths ===");
  const list = await handleTeach({ action: "list_paths" }, docStore, searchEngine);
  console.log(list.content[0].text.slice(0, 500));
  console.log("...\n");

  // Test 2: Start a path
  console.log("=== start_path: first-game ===");
  const start = await handleTeach({ action: "start_path", pathId: "first-game" }, docStore, searchEngine);
  console.log(start.content[0].text.slice(0, 600));
  console.log("...\n");

  // Test 3: Get next lesson
  console.log("=== next_lesson: first-game ===");
  const next = await handleTeach({ action: "next_lesson", pathId: "first-game" }, docStore, searchEngine);
  console.log(next.content[0].text.slice(0, 800));
  console.log("...\n");

  // Test 4: Complete lesson
  console.log("=== complete_lesson: first-game, lesson 1 ===");
  const complete = await handleTeach(
    { action: "complete_lesson", pathId: "first-game", lessonIndex: 1, notes: "Game loop makes sense now!" },
    docStore, searchEngine
  );
  console.log(complete.content[0].text);

  // Test 5: Progress
  console.log("\n=== progress ===");
  const prog = await handleTeach({ action: "progress" }, docStore, searchEngine);
  console.log(prog.content[0].text);
}

main().catch(console.error);
