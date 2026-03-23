# Code Improvement Proposals

Specific code suggestions from the 2pm Code & Search Quality reviews.

---

## ✅ Fixes Applied — 2026-03-19 (bugfix sprint)

**Commit:** 8f6c63a — pushed to origin/main

### 1. Genre free-tier filter refactored (Bug #3 — P0)
- `handleGenreLookup` now returns structured `GenreLookupResult` (discriminated union with `found: boolean`)
- New `formatGenreResult()` accepts `excludeSections` array for tier gating
- server.ts filters on structured data THEN formats — no more fragile line-by-line text parsing
- **Pro content leak risk eliminated**

### 2. Search quality P1-P3 (from search-quality.md §5)
- **P1 Hyphen tokenization**: `tokenize()` now splits hyphens into parts while keeping compound as bonus token. `"character-controller"` → `["character-controller", "character", "controller"]`. Queries like `"character controller"` now match hyphenated content.
- **P2 Stop words**: Added 50+ stop words (the, is, how, what, should, my, etc.) filtered during tokenization. Reduces noise in natural language queries.
- **P3 C# token**: `c#` replaced with `csharp` before tokenization. `"C# performance"` now properly matches G13.

### 3. ID collision fix (Bug #1)
- `handleGetDoc` now: (1) exact match first, (2) case-insensitive + suffix match, (3) if multiple matches and one is exact, return it with a note about alternatives, (4) if ambiguous, list all matches for disambiguation.
- Extracted `formatDocResult()` helper to reduce duplication.

### 4. try/catch on all tool handlers (Bug #4)
- All 6 tool handlers (`search_docs`, `get_doc`, `list_docs`, `session`, `genre_lookup`, `license_info`) wrapped in try/catch
- Errors return `{ content: [{ type: "text", text: "... error message" }] }` instead of crashing

### 5. TOPIC_DOC_MAP updated (Bug #12)
- Added: combat/G64, damage system/G64, hitbox/G64, knockback/G64, economy/G65, shop/G65, currency/G65, loot/G65, building/G66, placement/G66, construction/G66, tower placement/G66
- Added Godot docs: godot/E1+G1, gdscript/E1, scene composition/G1, node tree/E1+G1, signals/E1

### 6. Doc length normalization (P5 from search-quality.md)
- After TF-IDF scoring, score divided by `Math.sqrt(termFreq.size)` (unique term count)
- Prevents 50-85KB docs from dominating just by having more terms

### 7. Per-token title boost (P6 from search-quality.md)
- Each query token matching in the doc title gets +5 boost
- Stacks with existing +20 full-query substring boost
- `"camera shake"` now boosts "Camera Systems" (+5 for "camera") even without full substring match

**Build:** Clean (`npx tsc` — no errors)
**Smoke test:** MCP initialize responds correctly
**All changes in single commit, pushed to origin/main**

---

## Review 1 — Full Codebase Audit (2026-03-19)

**Files reviewed:** All 13 TypeScript source files  
**Focus:** Bugs, performance, error handling, TypeScript practices, MCP tool improvements

---

### 🔴 P0 — Bugs & Correctness

#### 1. Doc ID Collision Silently Overwrites (docs.ts:102-109)

**Problem:** When two modules have docs with the same ID (e.g., `E1` in both `core/` and `monogame-arch/`), the second one gets prefixed (`monogame-arch/E1`), but this only happens for the *second* module loaded. If `godot-arch` also has `E1`, the collision check against the Map works, but **the `allDocs` array still contains all three** while the Map only has two entries (the first `E1` gets overwritten by the logic flow).

Actually, re-reading: the Map check is correct — it checks `this.docs.has(doc.id)` before deciding the key. But there's a subtle issue: the **allDocs array stores docs with their original IDs**, then they get mutated via `doc.id = key`. This means the first `E1` in the array has `id: "E1"` and a later one from a module has `id: "monogame-arch/E1"`. This is actually fine for the array, but...

**Real bug:** The search engine indexes docs by `doc.id` (`this.docTermFreqs.set(doc.id, termFreq)`). If `get_doc` does a case-insensitive fallback search through `allDocs`, it finds the **first** match, which is always the `core` module version. A user can never retrieve a collision-prefixed doc via the case-insensitive path if the core doc also matches.

**Fix:**
```typescript
// In handleGetDoc — use exact match on prefixed ID first
const match = allDocs.find(
  (d) => d.id.toLowerCase() === args.id.toLowerCase()
);
```
This works, but if someone types `e1` they always get core's E1. Add a note in the response:
```typescript
// If there are multiple matches, list them
const matches = allDocs.filter(
  (d) => d.id.toLowerCase() === args.id.toLowerCase() ||
         d.id.toLowerCase().endsWith('/' + args.id.toLowerCase())
);
```

#### 2. `godot-arch` Module Not in GAMEDEV_MODULES Default (server.ts:59)

**Problem:** Default is `"monogame-arch"`. The new `docs/godot-arch/` directory was just created but won't load unless `GAMEDEV_MODULES` is set to include it. This isn't a bug per se, but when Godot content is ready, users need to know to set `GAMEDEV_MODULES=monogame-arch,godot-arch`.

**Suggestion:** Consider defaulting to auto-discovery:
```typescript
// Auto-discover modules: any top-level dir in docs/ that isn't "core"
const discovered = fs.readdirSync(docsRoot, { withFileTypes: true })
  .filter(d => d.isDirectory() && d.name !== 'core')
  .map(d => d.name);
const activeModules = (process.env.GAMEDEV_MODULES ?? discovered.join(','))
  .split(',').map(m => m.trim()).filter(Boolean);
```

#### 3. `genre_lookup` Free Tier Filtering is Fragile (server.ts:133-157)

**Problem:** The free-tier content stripping parses the output text by line, looking for `## Required Systems` and `## Recommended Docs` headers. If `handleGenreLookup` ever changes its output format (adds a header, changes spelling), the filter silently breaks and leaks Pro content.

**Fix:** Return structured data from `handleGenreLookup`, apply tier filtering on the structure, *then* format to text:
```typescript
// genre-lookup.ts should return GenreInfo, not formatted text
// server.ts should format after filtering
```

---

### 🟡 P1 — Error Handling & Robustness

#### 4. No Error Handling in Tool Handlers (all tool files)

**Problem:** None of the tool handlers have try/catch. If `searchEngine.search()` throws (e.g., due to a corrupt index or regex issue in tokenization), the MCP server returns an unhandled error to the client. The MCP SDK may or may not handle this gracefully.

**Fix:** Wrap each handler:
```typescript
export function handleSearchDocs(...): ToolResult {
  try {
    // ... existing logic
  } catch (err) {
    return {
      content: [{ type: "text", text: `Search error: ${err instanceof Error ? err.message : String(err)}` }],
    };
  }
}
```

#### 5. `findDocsRoot()` Throws on Missing Docs (server.ts:25-34)

**Problem:** If `docs/` doesn't exist, the server crashes on startup with an unhelpful error. This is the first thing a new user hits if they install the npm package but `docs/` isn't bundled correctly.

**Fix:** Add context to the error:
```typescript
throw new Error(
  `Could not find docs directory.\n` +
  `Looked in:\n  - ${docsPath}\n  - ${cwdDocs}\n\n` +
  `If installed via npm, ensure the package includes the docs/ directory.\n` +
  `If running from source, run from the project root.`
);
```

#### ✅ 6. License Validation Network Error Logging — DONE 2026-03-23

**Implemented:** Added `console.error` logging of specific network error in `validateLicense()` when remote validation fails. Users now see the reason (Network error, Request timeout, etc.) in stderr. Commit: 2a1a5a4.

#### ✅ 7. Cache Shape Validation — DONE 2026-03-23

**Implemented:** Added `isValidCacheShape()` type guard that validates all required fields (`valid: boolean`, `keyHash: string`, `validatedAt: number`, `instanceId: string`) and optional fields (`activationLimit`, `activationsUsed`, `expiresAt`) have correct types when present. `readCache()` now validates shape before trusting parsed JSON — corrupt or incompatible cache files are auto-deleted. 11 new tests, 175/175 total pass. Commit: 2a1a5a4.

---

### 🟢 P2 — Performance & TypeScript Best Practices

#### 8. Docs Loaded Synchronously at Startup (docs.ts, server.ts)

**Problem:** `fs.readFileSync` for every `.md` file blocks the event loop during startup. With 122+ docs (some 50-80KB), this is noticeable. Not critical for a stdio MCP server (startup is a one-time cost), but worth noting.

**Not urgent** — stdio servers only start once per session. Would matter if the server were ever HTTP-based.

#### 9. Resource Registration Loop Creates Closures Over Mutable State (server.ts:166-177)

**Problem:** The `for (const doc of allDocs)` loop creates resource handlers that close over `doc` and `uri`. Since `const` is used in the loop, this is actually fine in modern JS. But `allDocs` is a reference to `docStore.getAllDocs()` which returns the internal array — if the array were ever mutated, all resource handlers would see the mutation.

**Minor risk.** Could be hardened by spreading: `const allDocs = [...docStore.getAllDocs()]`.

#### 10. `isToolAllowed` Returns `boolean | "limited"` — Awkward Union Type (tiers.ts:29)

**Problem:** Using `boolean | "limited"` as a return type forces callers to do `=== false`, `=== "limited"`, and `=== true` checks, which is error-prone. A simple `if (!access)` would incorrectly treat `"limited"` as truthy.

**Suggestion:** Use a proper enum:
```typescript
type ToolAccess = 'full' | 'limited' | 'denied';

export function isToolAllowed(tier: Tier, tool: string): ToolAccess {
  // ...
}
```

This makes caller code much clearer:
```typescript
switch (isToolAllowed(tier, 'search_docs')) {
  case 'denied': return proGateResponse();
  case 'limited': /* restrict */ break;
  case 'full': /* allow */ break;
}
```

#### 11. Session State is Global Singleton (tools/session.ts:8)

**Problem:** `let currentState: SessionState = createDefaultState()` is module-level. If two MCP clients connect (unlikely with stdio, but possible with future SSE/HTTP transport), they'd share session state.

**Suggestion for future:** Pass state through a session manager keyed by connection/client ID. Fine for now with stdio.

#### 12. `TOPIC_DOC_MAP` Doesn't Include New Docs (core/session.ts)

**Problem:** The hardcoded `TOPIC_DOC_MAP` references docs up to ~G54 but doesn't include G64 (Combat), G65 (Economy), G66 (Building), or any Godot docs. The session co-pilot can't recommend these new docs.

**Fix:** Add entries:
```typescript
combat: ["G64", "character-controller-theory"],
"damage system": ["G64"],
economy: ["G65"],
shop: ["G65"],
currency: ["G65"],
building: ["G66"],
placement: ["G66"],
construction: ["G66"],
```

---

### 🔵 P3 — MCP Tool Improvements

#### 13. `search_docs` Should Return Doc Descriptions (search-docs.ts)

**Problem:** Search results only show `doc.id`, `doc.title`, and the first line of the snippet. The `doc.description` field is extracted but never shown in search results. Descriptions would help AI agents decide which doc to fetch.

**Fix:**
```typescript
const lines = results.map((r, i) => {
  const scoreStr = r.score.toFixed(1);
  const desc = r.doc.description ? `\n   _${r.doc.description}_` : '';
  return `${i + 1}. **${r.doc.id}** — ${r.doc.title} [${r.doc.module}/${r.doc.category}] (score: ${scoreStr})${desc}\n   ${r.snippet.split("\n")[0]}\n`;
});
```

#### ✅ 14. `get_doc` Section Extraction + maxLength (get-doc.ts) — DONE 2026-03-20

**Implemented:** `section` param (heading substring match, case-insensitive, extracts until next equal/higher heading) + `maxLength` param (truncates at paragraph boundary). Large docs (>20KB) show warning tip. Section not found returns available sections list. Both params composable. Tool description updated with usage guidance. 7/7 tests pass. Commit: cbd15eb.

#### ✅ 15. `list_docs` Summary Mode (list-docs.ts) — DONE 2026-03-21

**Implemented:** `summary` boolean param. When true, returns compact counts per module/category with doc IDs (up to 10 per category, then "+N more"). Full mode unchanged (default). Updated tool description with usage guidance. 6 new tests, 42/42 total pass. Commit: b722f52.

#### ✅ 16. `random_doc` Tool for Discovery — DONE 2026-03-22

**Implemented:** `random_doc` tool with `category`, `module`, and `engine` filter params. Returns doc metadata + 500-char preview (skips title heading, breaks at paragraph boundary). Free tier restricted to core module. Engine filter resolves via module metadata and always includes core docs. Error messages guide users to `list_docs` or available engines. 8 new tests, 92/92 total pass. Commit: 9815d43.

#### 17. Tool Descriptions Could Be More AI-Agent-Friendly

**Current:** `"Search across all game development docs"`  
**Better:** `"Search game development documentation by keyword. Returns up to 10 results ranked by relevance. Use this when you need to find guides, references, or explanations for a specific game dev topic. Follow up with get_doc to read the full document."`

Longer descriptions help AI agents understand *when* and *how* to use each tool. The MCP spec encourages descriptive tool descriptions.

---

### Summary Table

| # | Severity | File | Issue | Effort |
|---|----------|------|-------|--------|
| 1 | 🔴 Bug | docs.ts / get-doc.ts | ID collision hides module docs | 15 min |
| 2 | 🟡 Config | server.ts | No module auto-discovery | 10 min |
| 3 | 🔴 Bug | server.ts | Genre free-tier filter is fragile | 30 min |
| 4 | 🟡 Robustness | all tools | No try/catch in handlers | 20 min |
| 5 | 🟡 UX | server.ts | Unhelpful docs-not-found error | 5 min |
| 6 | 🟢 Logging | license.ts | Silent network error drop | 5 min |
| 7 | 🟡 Robustness | license.ts | No cache shape validation | 10 min |
| 8 | ⚪ Info | docs.ts | Sync file loading | n/a |
| 9 | ⚪ Info | server.ts | Closure over mutable array | 2 min |
| 10 | 🟡 DX | tiers.ts | Awkward boolean \| "limited" type | 20 min |
| 11 | ⚪ Info | tools/session.ts | Global singleton state | n/a |
| 12 | 🟡 Gap | core/session.ts | Missing new docs in topic map | 5 min |
| 13 | 🟢 Feature | search-docs.ts | Show descriptions in results | 5 min |
| 14 | 🟡 Feature | get-doc.ts | Truncation + section extraction | 30 min |
| 15 | 🟢 Feature | list-docs.ts | Summary mode + pagination | 20 min |
| 16 | 🟢 Feature | new tool | random_doc for discovery | 15 min |
| 17 | 🟢 Polish | server.ts | Richer tool descriptions | 10 min |

**Quick wins (< 30 min total):** #5, #6, #12, #13 — immediate quality improvements  
**High-impact (< 1 hour):** #4, #10, #14 — robustness + context efficiency  
**Strategic:** #3, #14, #17 — differentiation and AI-agent UX
