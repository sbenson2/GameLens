import { VectorSearch } from "./src/core/vector-search.js";

async function main() {
  const vs = new VectorSearch();
  const fakeDocs = [
    { id: "test1", title: "Camera Follow Systems", description: "How to make a camera follow the player", category: "guide", module: "core", content: "A camera follow system tracks the player character and keeps them visible on screen. Common approaches include lerp-based smoothing, dead zones, and look-ahead.", filePath: "" },
    { id: "test2", title: "A* Pathfinding", description: "Grid-based pathfinding algorithm", category: "guide", module: "core", content: "A* is a graph traversal algorithm used for finding the shortest path between nodes. In games, it is commonly used for enemy AI navigation on grid or navmesh maps.", filePath: "" },
    { id: "test3", title: "Entity Component System", description: "ECS architecture pattern", category: "architecture", module: "core", content: "ECS separates data (components) from behavior (systems). Entities are just IDs. Components hold data. Systems process entities that match their required component signature.", filePath: "" },
  ];

  console.log("Initializing vector search with 3 test docs...");
  await vs.init(fakeDocs);
  console.log("Ready:", vs.isReady());

  if (vs.isReady()) {
    const results = await vs.search("how do I make enemies chase the player", fakeDocs, 3);
    console.log('\nQuery: "how do I make enemies chase the player"');
    for (const r of results) {
      console.log(`  ${r.doc.id} (${r.doc.title}): ${r.similarity.toFixed(4)}`);
    }

    const results2 = await vs.search("camera smoothing deadzone", fakeDocs, 3);
    console.log('\nQuery: "camera smoothing deadzone"');
    for (const r of results2) {
      console.log(`  ${r.doc.id} (${r.doc.title}): ${r.similarity.toFixed(4)}`);
    }

    const results3 = await vs.search("how to organize game code", fakeDocs, 3);
    console.log('\nQuery: "how to organize game code"');
    for (const r of results3) {
      console.log(`  ${r.doc.id} (${r.doc.title}): ${r.similarity.toFixed(4)}`);
    }
  } else {
    console.log("Vector search failed to initialize");
  }
}

main().catch(console.error);
