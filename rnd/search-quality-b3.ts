import { SearchEngine } from '../src/core/search.ts';
import { DocStore } from '../src/core/docs.ts';
import { discoverModules } from '../src/core/modules.ts';
import * as fs from 'fs';
import * as path from 'path';

const docsDir = path.join(process.cwd(), 'docs');
const modules = discoverModules(docsDir);
const moduleIds = modules.map(m => m.id);

const store = new DocStore(docsDir);
store.load(moduleIds);
const allDocs = store.getAllDocs();

const engine = new SearchEngine();
engine.index(allDocs);

console.log(`Total docs indexed: ${allDocs.length}`);
console.log(`Modules: ${modules.map(m => `${m.id}(${m.docCount})`).join(', ')}`);
console.log('');

// 20 queries for search quality rotation B round 4
const queries = [
  // Core mechanics
  { q: 'how to implement health and damage', expect: ['combat'], desc: 'Combat/damage systems' },
  { q: 'camera follow player smoothly', expect: ['camera'], desc: 'Camera follow' },
  { q: 'tilemap procedural generation', expect: ['tilemap', 'G7', 'G37'], desc: 'Tilemap procgen' },
  { q: 'state machine for character', expect: ['state_machine', 'G2', 'G52'], desc: 'State machines' },
  { q: 'input buffering coyote time', expect: ['input', 'G4'], desc: 'Input buffering' },
  
  // Godot specific
  { q: 'godot signals architecture', expect: ['signal', 'G3'], desc: 'Godot signals' },
  { q: 'godot physics collision layers', expect: ['physics', 'collision', 'G5'], desc: 'Godot physics' },
  { q: 'gdscript vs csharp performance', expect: ['gdscript', 'E2', 'csharp'], desc: 'GDScript vs C#' },
  { q: 'godot animation tree blend', expect: ['animation', 'G8'], desc: 'Godot animation' },
  { q: 'godot tilemap terrain autotile', expect: ['tilemap', 'terrain', 'G7'], desc: 'Godot tilemap' },
  
  // Cross-cutting concepts
  { q: 'object pooling recycling', expect: ['pool', 'G67'], desc: 'Object pooling' },
  { q: 'save load serialization', expect: ['save', 'serializ', 'G69'], desc: 'Save/load' },
  { q: 'economy shop currency', expect: ['economy', 'shop', 'G65'], desc: 'Economy systems' },
  { q: 'building placement grid system', expect: ['building', 'placement', 'G66'], desc: 'Building/placement' },
  { q: 'networking multiplayer prediction', expect: ['network', 'multiplayer'], desc: 'Networking' },
  
  // Natural language (harder)
  { q: 'how do I make enemies chase the player', expect: ['ai', 'pathfind', 'steer'], desc: 'Enemy AI chase' },
  { q: 'my character feels floaty and unresponsive', expect: ['character', 'controller', 'platform'], desc: 'Character feel' },
  { q: 'best way to organize game scenes', expect: ['scene', 'composition', 'G1', 'project'], desc: 'Scene organization' },
  { q: 'inventory drag and drop system', expect: ['inventory', 'ui', 'G10'], desc: 'Inventory UI' },
  { q: 'tower defense path blocking enemies', expect: ['tower', 'defense', 'pathfind'], desc: 'Tower defense' },
];

let pass = 0, acceptable = 0, fail = 0;
const lines: string[] = [];

for (const test of queries) {
  const results = engine.search(test.q, allDocs, 5);
  const top5ids = results.map(r => r.doc.id.toLowerCase());
  const top5str = top5ids.join(' ');
  
  const top1match = test.expect.some(e => top5ids[0]?.includes(e.toLowerCase()));
  const hasExpected = test.expect.some(e => top5str.includes(e.toLowerCase()));
  
  let grade: string;
  if (top1match) { grade = 'PASS'; pass++; }
  else if (hasExpected) { grade = 'ACCEPTABLE'; acceptable++; }
  else { grade = 'FAIL'; fail++; }
  
  const line = `${grade.padEnd(10)} | ${test.desc.padEnd(22)} | q="${test.q}" | top3: ${top5ids.slice(0,3).join(', ')}`;
  lines.push(line);
  console.log(line);
}

console.log('');
console.log('=== SUMMARY ===');
console.log(`PASS: ${pass} | ACCEPTABLE: ${acceptable} | FAIL: ${fail} | Total: ${queries.length}`);
console.log(`Score: ${((pass + acceptable * 0.5) / queries.length * 100).toFixed(1)}%`);

// Write results
const now = new Date().toISOString().slice(0, 10);
const report = `## Search Quality — Rotation B Round 4 (${now})

**Corpus:** ${allDocs.length} docs | **Engine:** TF-IDF with title boost + length normalization + stemming + synonyms

### Results

| Grade | Query | Top 3 |
|-------|-------|-------|
${lines.map(l => {
  const parts = l.split(' | ');
  return `| ${parts[0].trim()} | ${parts[1].trim()}: ${parts[2].trim()} | ${parts[3].trim()} |`;
}).join('\n')}

### Summary
- **PASS:** ${pass} (top-1 hit)
- **ACCEPTABLE:** ${acceptable} (in top-5)
- **FAIL:** ${fail} (not found)
- **Score:** ${((pass + acceptable * 0.5) / queries.length * 100).toFixed(1)}%

### Notes
- Corpus grew from 138 (round 3) to ${allDocs.length} docs
- New docs since last round: G8 Animation, ui-theory expansion, cache shape validation
- Testing Godot animation (G8), tilemap (G7) queries specifically
`;

fs.writeFileSync(path.join(process.cwd(), 'rnd', 'search-quality-b4.md'), report);
console.log('\nReport written to rnd/search-quality-b4.md');
