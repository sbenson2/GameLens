# Code Improvement Proposals

Specific code suggestions from the 2pm Code & Search Quality reviews.

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

#### 6. License Validation Network Error Leaks to stderr (license.ts)

**Problem:** The `validateRemote` function handles errors internally (returns `{ valid: false, error: "Network error" }`), but the caller doesn't log the error type. If a user is offline and has no cache, they silently drop to free tier with no explanation beyond "could not validate."

**Suggestion:** Log the specific error in `validateLicense`:
```typescript
if (result.error) {
  console.error(`[gamedev-mcp] License validation failed: ${result.error}`);
}
```

#### 7. `readCache` Doesn't Validate JSON Shape (license.ts:72-80)

**Problem:** `JSON.parse` succeeds but the result might not have the expected fields. If `cache.json` is corrupted or from an older version, `data.key` or `data.validatedAt` could be undefined, causing subtle runtime errors.

**Fix:**
```typescript
function readCache(key: string): CacheEntry | null {
  try {
    if (!fs.existsSync(CACHE_PATH)) return null;
    const data = JSON.parse(fs.readFileSync(CACHE_PATH, "utf-8"));
    if (typeof data.key !== 'string' || typeof data.valid !== 'boolean' || typeof data.validatedAt !== 'number') {
      return null; // Invalid cache shape
    }
    if (data.key !== key) return null;
    return data as CacheEntry;
  } catch {
    return null;
  }
}
```

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

#### 14. `get_doc` Should Truncate Large Docs with a Warning (get-doc.ts)

**Problem:** Some docs are 50-85KB. When an AI agent fetches one, it consumes a massive chunk of context window. The MCP tool should warn about size and optionally support section extraction.

**Suggestion:** Add `section` parameter:
```typescript
{
  id: z.string().describe("Doc ID"),
  section: z.string().optional().describe("Optional heading to extract (e.g. '## Combat System')"),
  maxLength: z.number().optional().describe("Max chars to return (default: full doc)"),
}
```

This directly addresses the "context window backlash" from market research — be the MCP that's *efficient* with context.

#### 15. `list_docs` Should Include Doc Count Per Category (list-docs.ts)

**Problem:** `list_docs` returns every doc with full descriptions. With 120+ docs, this is a lot of tokens. Add summary counts and support pagination.

**Suggestion:**
```typescript
{
  category: z.enum(CATEGORIES).optional(),
  module: z.string().optional(),
  summary: z.boolean().optional().describe("If true, return counts only instead of full list"),
}
```

#### 16. Add a `random_doc` Tool for Discovery

**Problem:** AI agents only access docs they know about. A "random doc" or "featured doc" tool would help agents (and users) discover content they didn't know existed.

```typescript
server.tool(
  "random_doc",
  "Get a random game development doc for discovery/learning. Optionally filter by category or module.",
  { category: ..., module: ... },
  async (args) => { /* pick random from filtered list */ }
);
```

Low-effort, high-delight feature. Also helps demonstrate breadth during demos.

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
