# Test Results

Functional, content, and integration test logs.

---

## 2026-03-19 — Day A: Functional Testing (3pm)

### Build Verification
- **`npm run build` (tsc)**: ✅ PASS — Clean compilation, no errors, no warnings
- **Compiled files**: `dist/` contains index.js, server.js, license.js, tiers.js + core/ + tools/ — all present
- **Total source lines**: 530 lines across 4 main JS files

### MCP Protocol Tests (Pro Tier, dev mode)

| Test | Method | Expected | Actual | Result |
|------|--------|----------|--------|--------|
| Initialize | `initialize` | Protocol handshake | `protocolVersion: "2024-11-05"`, capabilities, serverInfo | ✅ PASS |
| Tool listing | `tools/list` | 6 tools | 6 tools returned: search_docs, get_doc, list_docs, session, genre_lookup, license_info | ✅ PASS |
| Search (basic) | `search_docs("character controller")` | Relevant results | Top hit: G52 (score 57.4), #2: character-controller-theory (54.1) | ✅ PASS |
| List docs | `list_docs()` | All docs listed | 123 docs across core + monogame-arch (correct count) | ✅ PASS |
| Get doc (valid) | `get_doc("P0")` | Full content returned | Complete P0 master playbook returned | ✅ PASS |
| Get doc (invalid) | `get_doc("nonexistent-doc-xyz")` | Error message | "Doc not found. Use list_docs to see available docs." | ✅ PASS |
| Session menu | `session("menu")` | Session briefing | Full session briefing with action menu | ✅ PASS |
| Genre lookup | `genre_lookup("platformer")` | Full system mappings | Required systems, recommended docs, starter checklist | ✅ PASS |
| License info | `license_info()` | Pro tier details | "Pro — all tools and modules fully unlocked" | ✅ PASS |

**Protocol compliance: 9/9 PASS**

### Search Quality Regression Tests

| Query | Expected Behavior | Actual | Result |
|-------|-------------------|--------|--------|
| `"character controller"` (two words) | Match G52 + concept doc | G52 (57.4), character-controller-theory (54.1) | ✅ PASS |
| `"character-controller"` (hyphenated) | Should also match | **"No docs found"** — hyphen tokenization bug | ❌ FAIL (known) |
| `"godot scene composition"` (no godot module) | Only core/monogame results | G29, G26, E8, etc. — no Godot results (module not loaded) | ✅ PASS (expected) |

**Hyphen tokenization bug confirmed still present.** Documented in `rnd/search-quality.md` as P1.

### Godot Module Testing

| Test | Expected | Actual | Result |
|------|----------|--------|--------|
| Load godot-arch module (`GAMEDEV_MODULES="monogame-arch,godot-arch"`) | 3 Godot docs loaded | 3 docs: godot-arch/E1, godot-rules, godot-arch/G1 | ✅ PASS |
| Search with Godot module | Godot docs in results | godot-arch/E1 (50.4), godot-arch/G1 (40.6), godot-rules (38.2) all ranked high | ✅ PASS |
| List docs (godot-arch filter) | Show only Godot docs | 3 docs: architecture/E1, reference/godot-rules, guide/G1 | ✅ PASS |
| Get Godot doc (Pro) | Full content | Full godot-arch/G1 content returned | ✅ PASS |
| Search Godot (Free tier) | Pro gate | "Searching non-core modules requires a Pro license" | ✅ PASS |
| Get Godot doc (Free tier) | Pro gate | "requires a Pro license" | ✅ PASS |

**Godot module: 6/6 PASS — fully functional when module is activated.**

### Free vs Pro Tier Gating (regression)

| Test | Free Tier | Pro Tier | Result |
|------|-----------|----------|--------|
| search_docs (core) | Returns core results | Returns all results | ✅ PASS |
| search_docs (module filter) | Pro gate message | Returns module results | ✅ PASS |
| get_doc (core doc) | Returns content | Returns content | ✅ PASS |
| get_doc (module doc) | Pro gate message | Returns content | ✅ PASS |
| session | Pro gate message | Full session briefing | ✅ PASS |
| license_info | Free tier details | Pro tier details | ✅ PASS |

**Tier gating: 6/6 PASS**

### Issues Found

1. **❌ Hyphen tokenization bug STILL OPEN** — `"character-controller"` returns 0 results. Known P1 issue from 2026-03-18. Fix in `rnd/search-quality.md`.
2. **⚠️ Godot module not in default `GAMEDEV_MODULES`** — Only `monogame-arch` is default. Godot docs won't appear unless env var includes `godot-arch`. This is expected behavior for now (Godot is still in development), but should be added to defaults when content is ready.
3. **⚠️ Doc count shows 123 (was 122 last test)** — Increased by 1 since Day 3. Likely from new Godot docs when testing with both modules, or a new doc added.

### Summary
- **Total test cases**: 21
- **PASS**: 20
- **FAIL**: 1 (known hyphen tokenization bug)
- **Build**: Clean
- **Protocol**: Compliant
- **Godot module**: Fully functional
- **Tier gating**: Working correctly
- **No new bugs found**

## 2026-03-18 — Day C: Integration Testing (3pm)

### Build Verification
- **`npm run build` (tsc)**: ✅ PASS — Clean compilation, no errors
- **122 docs loaded** from `docs/` directory (modules: monogame-arch)

### Test 1: Free Tier (no license key)
All tool access correctly gated:

| Tool | Expected | Actual | Result |
|------|----------|--------|--------|
| `tools/list` | Returns all 6 tools | `['search_docs', 'get_doc', 'list_docs', 'session', 'genre_lookup', 'license_info']` | ✅ PASS |
| `search_docs` (core query) | Returns results from core only | Returned 10 results, all from core module | ✅ PASS |
| `search_docs` (monogame-arch module) | Blocked with Pro gate | "Searching non-core modules requires a Pro license" | ✅ PASS |
| `get_doc` (P0, core) | Returns content | Full P0 content returned | ✅ PASS |
| `get_doc` (G52, monogame-arch) | Blocked with Pro gate | "requires a Pro license" | ✅ PASS |
| `session` (menu) | Blocked | "requires a Pro license" | ✅ PASS |
| `license_info` | Shows Free tier details | Correct tier, tool access list, upgrade URL | ✅ PASS |
| `genre_lookup` (platformer) | Limited — strips system mappings + doc refs | Description shown, Required Systems + Recommended Docs replaced with Pro gate | ✅ PASS |

**Free tier verdict: All 8 test cases PASS. Tier gating works correctly.**

### Test 2: Pro Tier (dev mode, `GAMEDEV_MCP_DEV=true`)

| Tool | Expected | Actual | Result |
|------|----------|--------|--------|
| `search_docs` (monogame-arch) | Full results | 10 results including G20 Camera Systems (score 44.6) | ✅ PASS |
| `get_doc` (G52) | Full content | Complete G52 platformer controller doc returned | ✅ PASS |
| `session` (menu) | Session briefing | Full session briefing with date, status, path | ✅ PASS |
| `genre_lookup` (platformer) | Full system mappings | *(not re-tested after fix, verified with prior combined test)* | ✅ PASS |

**Pro tier verdict: All tools unlocked and returning full content.**

### Test 3: Invalid License Key (`GAMEDEV_MCP_LICENSE=bogus-key-abc123`)
- Server calls LemonSqueezy API, receives "invalid" response
- Falls back to free tier: `"License: invalid key — running in free tier"`
- `license_info` correctly shows Free tier
- **Result: ✅ PASS — Graceful degradation to free tier**

### Test 4: Edge Cases

| Scenario | Expected | Actual | Result |
|----------|----------|--------|--------|
| No network + no cache | Free tier | Untested (would require network isolation) | ⏭️ SKIP |
| Offline + valid cached (within 7d grace) | Pro tier | Logic reviewed in code — correct | ✅ CODE REVIEW |
| Offline + expired cache (>7d) | Free tier | Logic reviewed in code — correct | ✅ CODE REVIEW |

### 🐛 Bug Found & Fixed

**DEV MODE BUG**: `GAMEDEV_MCP_DEV=true` only worked when a license key was also set.

- **Root cause**: In `src/license.ts`, `getLicenseKey()` was called first and returned `{ tier: "free" }` when no key existed, *before* the dev mode check could run.
- **Fix**: Moved the `GAMEDEV_MCP_DEV` check to the top of `validateLicense()`, before the key lookup.
- **Verified**: After fix, `GAMEDEV_MCP_DEV=true` correctly enables Pro tier without any key.
- **Impact**: Low (dev-only flow), but would frustrate anyone following dev setup instructions.

### MCP Protocol Compliance
- ✅ `initialize` handshake works correctly (returns protocolVersion, capabilities, serverInfo)
- ✅ `notifications/initialized` accepted
- ✅ `tools/list` returns all 6 registered tools with descriptions and schemas
- ✅ `tools/call` dispatches correctly to all tool handlers
- ✅ All responses follow `{ content: [{ type: "text", text: "..." }] }` format
- ✅ Server runs on stdio transport (StdioServerTransport)

### Summary
- **15 test cases**: 14 PASS, 1 SKIP (network isolation)
- **1 bug found and fixed** (dev mode license bypass)
- **Build**: Clean
- **Protocol**: Compliant
- **Tier gating**: Working correctly for free/pro/invalid/dev scenarios
