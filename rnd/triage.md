# Issue & PR Triage

Daily summary of new GitHub issues and PRs.

---

## 2026-03-22 — Morning Standup (Day 7, Sunday)

### GitHub Status
- **Open Issues:** 4 (all Dependabot)
- **Open PRs:** 4 (all Dependabot)
  - #4: `@types/node` 22.19.15 → 25.5.0
  - #3: `github/codeql-action` 3 → 4
  - #2: `actions/checkout` 4 → 6
  - #1: `actions/setup-node` 4 → 6
- **Stars:** 0 | **Forks:** 0 | **Watchers:** 0
- No external engagement after 7 days. Distribution remains THE blocker.

### npm Status
- **Published:** `gamedev-mcp-server@1.0.0` — **8 DAYS STALE**
- **Local version:** `1.1.0` (ready to publish)
- **Downloads:** 86 total (82 on 3/20, 4 on 3/21, 0 since)
- **⚠️ v1.1.0 NOT published — Day 4 of being #1 priority.** 86 downloaders are on stale version missing Godot module, 8 tools, section extraction, cross-engine search, caching, and 15+ new docs.

### Git Status
- **Last commit:** `42c13c5` — rnd: audit #4 lessons learned
- **77 total commits, 228 tracked files**
- **Modified (uncommitted):** `rnd/PROJECT_MEMORY.md`, `rnd/competitor-log.md`
- **Build:** ✅ Clean (`tsc --noEmit`)
- **Tests:** ✅ 152/152 pass (1.0s, 25 suites)

### Content Stats
- **138 docs** across `docs/` (4.1 MB) — up from 134 yesterday
- **Godot module:** 9 docs (E1, E2, godot-rules, G1-G6) — **45% of planned 20** (up from 35%)
- **MonoGame:** 77 docs, 100% genre coverage
- **Core:** 19 concept/theory docs (combat-theory added)
- **8 MCP tools** (search_docs, get_doc, list_docs, list_modules, random_doc, genre_lookup, get_rules, license_info)
- **152 tests**, all passing

### Overnight Progress (Day 6 → Day 7 cron sessions)
1. ✅ G5 Physics & Collision (33KB) — body types, collision layers, raycasting, platforms
2. ✅ G6 Camera Systems (50KB) — follow, deadzone, shake, multi-target, cinematic, pixel-perfect
3. ✅ combat-theory.md (34KB) — 19-section engine-agnostic combat foundation
4. ✅ random_doc tool implemented (#16 code improvement)
5. ✅ G4 AI Systems deep polish (30KB → 89KB) — squad tactics, DDA, debugging
6. ✅ Phase 5 integration testing COMPLETE — 60 new tests (152 total)
7. ✅ Search quality round 3 — 30 queries, 0 failures
8. ✅ Distribution strategy created (rnd/marketing/distribution-strategy.md)
9. ✅ Functional testing rotation — all 8 tools verified, tier gating correct
10. ✅ Doc audit #4 — 5 issues fixed across 5 docs
11. ✅ Competitor scan — RSAC MCPwned, Godogen 1,699⭐, Roblox MCP expansion

### Open Items
| Item | Priority | Days Open | Notes |
|---|---|---|---|
| **npm v1.1.0 publish** | 🔴 Critical | **4** | 86 users on stale v1.0.0. MUST publish today. |
| **MCP registry submissions** | 🔴 Critical | **4** | mcp.so (PR-based), smithery (auto-indexes npm). Needs Wes for accounts. |
| **Merge 4 Dependabot PRs** | 🟡 Medium | 1 | actions/checkout@v6, setup-node@v6, codeql-action@v4, @types/node@25.5.0 |
| GitHub Actions OIDC publishing | 🟡 Medium | 4 | Trusted publishing for npm |
| Workers API deploy | 🟡 Medium | 2 | Scaffolded + cached client + tested, needs wrangler deploy |
| Godot G7 TileMap | 🟡 Medium | — | Would reach 50% Godot milestone (10/20) |
| Search P4 (stemming) | 🟡 Medium | 5 | Defer until post-launch |
| claudefa.st submission | 🟢 Low | 3 | "50+ Best MCP Servers" list |
| P-file title numbering mismatch | 🟢 Low | 7 | Cosmetic, P3 still shows "# 07" |
| **0 stars / 0 forks** | 🔴 Strategic | **7** | No distribution = no users = no feedback |

### Key Observations — Day 7

**The good:**
- Overnight sessions continue to be extremely productive. 11 items completed autonomously.
- Godot module jumped from 35% → 45% in one day (G5 Physics + G6 Camera — both foundational).
- combat-theory.md fills the biggest cross-cutting gap (referenced by 8/11 genres).
- 152 tests, all passing. Test count grew from 36 (Day 4) → 152 (Day 7) with no degradation.
- Distribution strategy document now exists — clear launch sequence defined.
- Content quality is strong: 138 docs, 4.1 MB, 100% MonoGame genre coverage, 45% Godot.

**The bad:**
- **npm v1.1.0 is Day 4 of "must publish today."** This is the single biggest failure of the week. 86 downloaders are on stale v1.0.0 missing Godot, cross-engine search, section extraction, caching, random_doc, and 15+ new docs. Every day unpublished = users judging us on 8-day-old code.
- **Zero stars, zero forks, zero engagement after 7 full days.** Without registry listings, the only discovery path is "stumble on npm" which got us 86 downloads and nothing else.
- **4 Dependabot PRs sitting unmerged** — easy wins that keep dependencies current.

**Week 1 Summary:**
- Built: 138 docs (4.1 MB), 8 tools, 152 tests, CI/CD, Workers API scaffold, caching layer, cross-engine search, 3 modules (core/MonoGame/Godot)
- Shipped: v1.0.0 to npm on Day 4. That's it. Everything since is local.
- Missing: v1.1.0 publish, registry submissions, launch post, any marketing whatsoever
- **The product is excellent. The distribution is nonexistent.**

### Today's Priorities (2026-03-22, Sunday)
1. **🔴 npm v1.1.0 publish** — `npm publish` or trigger release workflow. NO MORE DEFERRAL.
2. **🔴 Merge Dependabot PRs** — 4 easy merges, keeps deps current
3. **🔴 Flag for Wes:** Registry submissions need accounts (mcp.so PR can be prepped autonomously)
4. **🟡 Godot G7 TileMap** — Would hit 50% milestone (10/20 docs)
5. **🟡 Workers API local testing** — 2 days since scaffold, needs validation before deploy
6. **🟢 Continue content creation** — Godot save/load guide (confirmed community demand)

---

## 2026-03-21 — Morning Standup (Day 6, Saturday)

### GitHub Status
- **Open Issues:** 0
- **Open PRs:** 0
- **Stars:** 0 | **Forks:** 0 | **Watchers:** 0
- Still zero external engagement after 6 days. Distribution is THE blocker.

### npm Status
- **Published on registry:** `gamedev-mcp-server@1.0.0` (stale — missing 6 days of work)
- **Local version:** `1.1.0` (prepped but NOT published)
- **Downloads (past week):** 82 total (all on 3/20), 0 today
- **Action needed:** v1.1.0 STILL not published. Day 2 of "publish v1.1.0" being the #1 priority.

### Git Status
- **Last commit:** `55af9dd` — competitor scan 2026-03-21
- **Working tree:** Clean (no uncommitted changes)
- **Total commits:** ~30+

### Content Stats
- **134 docs** across `docs/` (3.8 MB)
- **Godot module:** 7 docs (E1, E2, godot-rules, G1-G4) — 35% of planned 20
- **MonoGame:** ~76 docs, ~95% genre coverage
- **Core:** 18 concept/theory docs including networking-theory
- **58 tests, all passing**

### Overnight Progress (Day 5 → Day 6 cron sessions)
1. ✅ G4 Input Handling (43KB) — comprehensive, 4 movement patterns, input buffering, accessibility
2. ✅ E2 GDScript vs C# (33KB) — architecture decision doc, Unity migration tables
3. ✅ list_docs summary mode implemented (#15 code improvement)
4. ✅ Client-side caching for remote Pro content (Phase 4)
5. ✅ Content validation — broken G4 link fixed
6. ✅ Doc audit #3 — 6 issues fixed across 5 docs (Steamworks API, P12 title, etc.)
7. ✅ Feature roadmap created (rnd/marketing/feature-roadmap.md)
8. ✅ Google Stitch UI workflow guide (52KB)
9. ✅ E4 Solo Project Management expanded (12.9KB → 43.5KB)
10. ✅ Competitor scan — MCP existential debate, Godogen breakout, Claude Code Channels

### Open Items
| Item | Priority | Days Open | Notes |
|---|---|---|---|
| **npm v1.1.0 publish** | 🔴 Critical | **2** | v1.0.0 is 6 days stale. Blocks all discovery. |
| **MCP registry submissions** | 🔴 Critical | **2** | mcp.so, smithery, mcpmarket, Cline. Needs Wes for accounts. |
| GitHub Actions OIDC publishing | 🟡 Medium | 2 | Trusted publishing for npm |
| Workers API deploy | 🟡 Medium | 1 | Scaffolded + cached client ready, needs wrangler deploy |
| Godot Phase 2 continue | 🟡 Medium | 2 | G5 Physics, G6 Camera, G7 TileMap next |
| Search P4 (stemming) | 🟡 Medium | 3 | Medium impact, needs testing |
| claudefa.st submission | 🟢 Low | 1 | "50+ Best MCP Servers" list |
| P-file title numbering mismatch | 🟢 Low | 6 | Cosmetic, P3 still shows "# 07" |
| 0 stars / 0 downloads | 🔴 Strategic | **6** | No distribution = no users = no feedback |

### Today's Priorities (2026-03-21, Saturday)
1. **🔴 npm v1.1.0 publish** — Manual `npm publish` or trigger release workflow. Cannot wait another day.
2. **🔴 MCP registry submissions** — Flag for Wes. At minimum: mcp.so (PR-based, can prep), smithery.ai
3. **🟡 Godot G5 Physics** — Next most-needed guide (referenced by platformer, top-down, puzzle)
4. **🟡 Workers API local testing** — Validate before deploy
5. **🟢 Content creation** — Continue filling Godot gaps
6. **🟢 claudefa.st submission** — Low effort, potential discovery

---

## 2026-03-20 — Morning Standup (Day 5)

### GitHub Status
- **Open Issues:** 0
- **Open PRs:** 0
- **Stars:** 0 | **Forks:** 0 | **Watchers:** 0
- No external activity yet. Package is published but no community engagement.

### npm Status
- **Published:** `gamedev-mcp-server@1.0.0` (3.3 MB unpacked, 1 dep)
- **Downloads API:** Returns "not found" — likely too new or zero downloads recorded for this period
- **Registry page live:** https://www.npmjs.com/package/gamedev-mcp-server
- **Action needed:** v1.1.0 publish with all the work since 3/19 (section extraction, Godot module, new docs, Workers scaffold)

### Git Status
- **Last commit:** `9055ce1` — docs: audit #6 — fix 6 issues across 5 docs
- **19 total commits, 186 tracked files**
- **Modified (uncommitted):** `rnd/PROJECT_MEMORY.md`, `rnd/competitor-log.md`
- **Clean otherwise** — yesterday's cron sessions kept commits flowing

### Content Stats
- **130 docs** across `docs/` (3.5 MB)
- **Godot module:** 5 docs completed (E1, godot-rules, G1-G3)
- **MonoGame:** G64-G67 + full architecture suite
- **Core:** networking-theory.md added
- **Genre coverage:** ~95%

### Today's Priorities (2026-03-20)
1. **🔴 npm v1.1.0 publish** — Include everything since 1.0.0
2. **🔴 MCP registry submissions** — At least mcp.so and smithery.ai
3. **🟡 README overhaul** — Marketing-ready with badges, examples, feature list
4. **🟡 Godot Phase 2** — E2, G4 next
5. **🟢 Workers API testing** — Validate locally before deploy
6. **🟢 Commit uncommitted files** — PROJECT_MEMORY.md, competitor-log.md
