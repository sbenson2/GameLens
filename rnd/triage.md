# Issue & PR Triage

Daily summary of new GitHub issues and PRs.

---

## 2026-03-24 — 9 AM Standup (Day 9, Tuesday)

### GitHub Status
- **Open Issues:** 0
- **Open PRs:** 0 (all 4 Dependabot PRs merged)
- **Stars:** 0 | **Forks:** 0 | **Watchers:** 0
- Still zero external engagement. Distribution crisis continues.

### npm Status
- **Published:** `gamedev-mcp-server@1.0.0` — **5 DAYS OLD** (published 2026-03-19)
- **Local version:** `1.2.0` (tagged, ready to publish)
- **Downloads (last 7 days):** 93 total — down to 0 today so far
- **93 downloaders stuck on v1.0.0.** v1.2.0 has 40+ commits of improvements they can't access.

### Git Status
- **Last commit:** `063f708` — CI/CD audit lesson
- **Uncommitted:** 2 modified (`server.ts`, `tiers.ts`) + 2 new (`migration-guide.ts`, `migration-guide.test.ts`)
- **Build:** ✅ Clean (`tsc --noEmit`)
- **Tests:** ✅ 175/175 pass
- **Tags:** v1.2.0 (latest), v1.1.0

### Content Stats
- **140 docs** across `docs/` (~4.5 MB)
- **Godot module:** 11 docs (55%) — past the 50% viability threshold
- **MonoGame:** 78 docs, 100% genre coverage
- **Core:** 20 concept/theory docs
- **9 MCP tools** (10th — `migration_guide` — in progress, uncommitted)

### Overnight Work
- **New `migration_guide` tool** — in progress (2 new files + 2 modified). Cross-engine migration guide generation with concept mappings (Architecture, Physics, Input, Camera, Animation, UI, State Mgmt, Audio, Networking, Save/Load). Supports `from`/`to` engine params with topic filtering.
- Doc polishing continued on pathfinding-theory, G41 tweening, G59 skeletal animation
- Bevy research rotation 2 completed, CI/CD audit completed

### Open Items (Priority-Sorted)
| Item | Priority | Days Open | Notes |
|---|---|---|---|
| **npm v1.2.0 publish** | 🔴🔴 CRITICAL | **7** | `publish-manual.yml` exists. Or just run `npm publish`. **Non-negotiable today.** |
| **MCP registry submissions** | 🔴 Critical | **7** | mcp.so, smithery, mcpservers.org, LobeHub, claudefa.st. Drafts ready. |
| **Commit overnight work** | 🔴 Hygiene | 1 | migration-guide tool + modified files |
| **0 stars / 0 forks** | 🔴 Strategic | **9** | Zero visibility. STS2 Godot hype window narrowing. |
| Launch post polish | 🟡 Medium | 4 | DEV Community + r/aigamedev. Target Thursday. |
| Godot G9-G12 | 🟡 Medium | — | UI, Audio, Save/Load, Shaders — breadth push |
| Workers API deploy | 🟡 Medium | 4 | Needs Wes for Cloudflare account |
| Search synonyms | 🟡 Medium | 7 | 10-15 entries for remaining gaps |
| Bulk cross-reference pass | 🟢 Low | — | Systemic backlink issue (5 audits confirm) |

### Key Observations

**Critical reality check:**
- **Day 9. Zero stars. Zero forks. 93 total downloads trending to zero.** The product is excellent — 140 docs, 175 tests, 9 (soon 10) tools, cross-engine search. But none of that matters without distribution. We've been building in a vacuum.
- npm v1.2.0 publish has been the #1 priority for a full week. The `publish-manual.yml` workflow exists. `npm publish` takes 10 seconds. This must happen today.

**What's working:**
- Build & tests rock solid (175/175)
- Content quality is genuinely best-in-class for this niche
- Overnight sessions keep shipping (migration-guide tool, doc polish, research)
- Zero regressions across 9 days of continuous development

**Today's battle plan:**
1. 🔴 **npm v1.2.0 publish** — THE priority. Wes needs to run this or configure NPM_TOKEN.
2. 🔴 **Registry submissions** — at least mcp.so + smithery + mcpservers.org
3. 🟡 **Commit migration-guide WIP** + push
4. 🟡 **Launch post polish** for Thursday
5. 🟢 **Godot G9 UI** if time

---

## 2026-03-24 — Earlier Standup (Day 9, Tuesday)

### GitHub Status
- **Open Issues:** 0
- **Open PRs:** 0 (4 Dependabot PRs merged previously)
- **Stars:** 0 | **Forks:** 0 | **Watchers:** 0
- No external engagement. Zero visibility = zero users.

### npm Status
- **Published:** `gamedev-mcp-server@1.0.0` — **10 DAYS STALE** (published 2026-03-20)
- **Local version:** `1.2.0` (tagged, ready to publish)
- **Downloads (last 7 days):** 93 total — 82 on launch day (3/20), then 4, 3, 4, 0 on 3/24 so far
- **⚠️ npm publish is now DAY 7 of being #1 priority.** 93 downloaders stuck on v1.0.0 with none of the last 8 days of work.

### Git Status
- **Last commit:** `9ec2193` — standup: Day 8 Monday triage + priorities
- **Uncommitted:** 9 files modified + 1 new (publish-manual.yml)
- **Build:** ✅ Clean (`tsc --noEmit`)
- **Tests:** ✅ 175/175 pass (1.3s, 27 suites)
- **Tags:** v1.2.0 (latest), v1.1.0

### Content Stats
- **140 docs** across `docs/` (~4.5 MB)
- **Godot module:** 11 docs (55% of planned 20) — viable for marketing
- **MonoGame:** 78 docs, 100% genre coverage
- **Core:** 20 concept/theory docs
- **9 MCP tools**, **175 tests** all passing

### Overnight Progress (Day 8 → Day 9)
- Cron sessions ran overnight: doc polishing, competitive research, engine research
- Modified files: pathfinding-theory.md, G41_tweening.md, G59_skeletal_animation.md, competitor-log.md, unity.md, gaps.md, metrics.md
- New file: `.github/workflows/publish-manual.yml` — manual npm publish workflow (addressing the OIDC publishing blocker!)

### Open Items (Priority-Sorted)
| Item | Priority | Days Open | Notes |
|---|---|---|---|
| **npm v1.2.0 publish** | 🔴🔴 CRITICAL | **7** | v1.2.0 tagged. `publish-manual.yml` created overnight — try manual workflow dispatch or just `npm publish`. **THIS IS THE ONLY THING THAT MATTERS TODAY.** |
| **MCP registry submissions** | 🔴 Critical | **7** | mcp.so, smithery, mcpservers.org, LobeHub, claudefa.st. Drafts ready since Day 5. |
| **0 stars / 0 forks** | 🔴 Strategic | **9** | No distribution = no users = no feedback. STS2 window closing. |
| Launch post drafts | 🟡 Medium | 4 | DEV Community + r/aigamedev. Ready to polish and publish. |
| Workers API deploy | 🟡 Medium | 4 | Needs Wes for Cloudflare account. Tested locally. |
| Search synonyms | 🟡 Medium | 7 | 10-15 entries would fix remaining gaps. |
| Godot G9-G12 | 🟡 Medium | — | UI, Audio, Save/Load, Shaders — breadth push |
| Bulk cross-reference pass | 🟢 Low | — | 4 consecutive audits found same systemic issue |

### Key Observations — Day 9 (Tuesday)

**The critical:**
- **npm publish is 7 DAYS overdue.** The `publish-manual.yml` workflow was created overnight — this may finally unblock the automated path. But honestly, `cd /path && npm publish` takes 10 seconds. This has become the project's biggest failure: building an incredible product that nobody can install.
- **93 total downloads, trending to zero.** Launch day spike of 82 faded to single digits. Without v1.2.0 + registry submissions + community posts, this flatlines.

**The good:**
- Overnight work polished existing docs (pathfinding-theory, G41 tweening, G59 skeletal animation) and created the manual publish workflow.
- Build and tests remain rock solid: 175/175 pass.
- Content quality at this point is genuinely exceptional: 140 docs, 9 tools, cross-engine search, section extraction.

**Today's mandate:**
1. 🔴 **Publish npm v1.2.0** — manual workflow or direct `npm publish`. No more delays.
2. 🔴 **Submit to 3+ MCP registries** — mcp.so, smithery, mcpservers.org minimum.
3. 🔴 **Commit uncommitted work** — 9 modified files sitting uncommitted.
4. 🟡 **Polish launch blog post** — target Thursday publish on DEV Community.
5. 🟡 **Continue Godot breadth** — G9 UI/Control if time permits.

---

## 2026-03-23 — Morning Standup (Day 8, Monday)

### GitHub Status
- **Open Issues:** 0
- **Open PRs:** 0 (Dependabot PRs merged during Day 6)
- **Stars:** 0 | **Forks:** 0 | **Watchers:** 0
- No external engagement after 8 days. Distribution remains THE blocker.

### npm Status
- **Published:** `gamedev-mcp-server@1.0.0` — **9 DAYS STALE**
- **Local version:** `1.2.0` (tagged, ready to publish)
- **Downloads last week:** 89 (mostly from 3/20 spike)
- **⚠️ npm publish is now DAY 6 of being #1 priority.** 89 downloaders stuck on v1.0.0 missing: Godot module (11 docs), 3 new tools (compare_engines, random_doc, list_modules), section extraction, cross-engine search, caching layer, 17+ new docs, and 175 tests.

### Git Status
- **Last commit:** `36080e1` — audit log + lessons from doc audit #5
- **101 total commits, 241 tracked files**
- **Build:** ✅ Clean (`tsc --noEmit`)
- **Tests:** ✅ 175/175 pass (1.2s, 27 suites)
- **Tags:** v1.2.0 (latest), v1.1.0

### Content Stats
- **140 docs** across `docs/` (~4.5 MB) — up from 138 yesterday
- **Godot module:** 11 docs (E1, E2, godot-rules, G1-G8) — **55% of planned 20** (passed 50% milestone!)
- **MonoGame:** 78 docs, 100% genre coverage
- **Core:** 20 concept/theory docs (combat-theory + ui-theory expanded 5→40KB)
- **9 MCP tools** (search_docs, get_doc, list_docs, list_modules, random_doc, genre_lookup, get_rules, license_info, compare_engines)
- **175 tests**, all passing

### Overnight Progress (Day 7 → Day 8 cron sessions)
1. ✅ **G7 TileMap & Terrain** (80KB) — Hit 50% Godot milestone! Procgen, WFC, chunk streaming, A* pathfinding
2. ✅ **G8 Animation Systems** (49KB) — AnimationTree, blend spaces, hit effects, tween system, state machine integration
3. ✅ **ui-theory.md expanded** (5KB → 40KB, 8× growth) — Now definitive engine-agnostic UI reference
4. ✅ **Cache shape validation** (#7) + network error logging (#6)
5. ✅ **Workers API local smoke test COMPLETE** — All 5 endpoints verified with 140 docs
6. ✅ **Deploy CI workflow** created (deploy-workers.yml)
7. ✅ **Code improvements #5, #13, #17** — docs-not-found error, search descriptions, tool descriptions
8. ✅ **Search quality round 4** — 82.5% on 140 docs, synonym gaps identified
9. ✅ **Doc audit #5** — 5 issues fixed across 5 docs
10. ✅ **Competitor scan** — Godogen 1,849⭐, STS2 $92M, StraySpark 207-tool Unreal MCP

### Milestones Hit
- 🎯 **Godot 50% milestone passed** (now at 55% = 11/20 docs)
- 🎯 **175 tests, zero failures**
- 🎯 **Workers API verified locally** — ready for real deployment
- 🎯 **v1.2.0 tagged** — 70 files changed, +21,915/-1,092 lines since v1.1.0

### Open Items
| Item | Priority | Days Open | Notes |
|---|---|---|---|
| **npm v1.2.0 publish** | 🔴 Critical | **6** | v1.2.0 tagged. Need GitHub Release or manual `npm publish`. 89 users on stale v1.0.0. |
| **MCP registry submissions** | 🔴 Critical | **6** | mcp.so (PR-based), smithery (auto-indexes npm), mcpservers.org (form), LobeHub, claudefa.st |
| **GitHub Release creation** | 🔴 Critical | **4** | Create release from v1.2.0 tag → triggers publish.yml → npm with OIDC provenance |
| Workers API deploy (Cloudflare) | 🟡 Medium | 3 | Scaffolded + tested locally. Needs Wes for Cloudflare account setup + KV namespaces |
| Search P4 (synonyms > stemming) | 🟡 Medium | 6 | 10-15 synonym entries would fix remaining search gaps |
| Godot G9-G12 | 🟡 Medium | — | UI, Audio, Save/Load, Shaders — breadth over depth now |
| GitHub Actions OIDC publishing | 🟡 Medium | 6 | Untested pipeline. Manual publish as fallback. |
| Bulk cross-reference pass | 🟢 Low | — | Systemic issue: older docs lack backlinks to newer docs (caught in 4 consecutive audits) |
| P-file title numbering | 🟢 Low | 8 | Cosmetic. P3 still shows "# 07" |
| **0 stars / 0 forks** | 🔴 Strategic | **8** | No distribution = no users = no feedback. STS2 marketing window closing. |

### Key Observations — Day 8 (Monday)

**The good:**
- Overnight sessions hit the biggest milestone yet: **Godot at 55%** with G7 TileMap (80KB!) and G8 Animation (49KB). The module is now genuinely viable for marketing.
- ui-theory 8× expansion means core theory docs are nearly complete.
- Workers API smoke-tested with all 140 docs. Infrastructure is ready for real deployment.
- Cache shape validation + network error logging close the last two reliability code improvements.
- Week 1 velocity: 140 docs, 9 tools, 175 tests, 101 commits, Workers API, CI/CD, caching layer, cross-engine search. Incredible build pace.

**The bad:**
- **npm publish is now 6 days overdue.** This is embarrassing. v1.2.0 is tagged. The actual command is `npm publish`. Every day of delay wastes the STS2 $92M Godot marketing window.
- **Zero community engagement after 8 full days.** No stars, forks, issues, or PRs from non-Dependabot sources. The product is invisible.
- **89 npm downloads with zero follow-up.** These users got v1.0.0 (no Godot, no cross-engine, no section extraction, 6 tools instead of 9). They may have already dismissed the product.

**Week 2 North Star: SHIP.**
- Monday: npm v1.2.0 publish + GitHub Release
- Tuesday: MCP registry submissions (all 5+)
- Wednesday: claudefa.st + AGENTS.md to repo root
- Thursday: Launch post (DEV Community + r/aigamedev)
- Friday: r/gamedev + r/godot posts (carefully framed)

### Blockers Needing Wes
1. **npm publish** — Either `npm publish` manually or create a GitHub Release from v1.2.0 tag (triggers automated pipeline). 2 minutes.
2. **Cloudflare Workers** — Need account setup, KV namespace creation, API token as GitHub secret. ~15 min.
3. **Registry accounts** — mcp.so, mcpservers.org, claudefa.st all need human sign-up.

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

### Today's Priorities (2026-03-22, Sunday)
1. **🔴 npm v1.1.0 publish** — `npm publish` or trigger release workflow. NO MORE DEFERRAL.
2. **🔴 Merge Dependabot PRs** — 4 easy merges, keeps deps current
3. **🔴 Flag for Wes:** Registry submissions need accounts (mcp.so PR can be prepped autonomously)
4. **🟡 Godot G7 TileMap** — Would hit 50% Godot milestone (10/20 docs)
5. **🟡 Workers API local testing** — 2 days since scaffold, needs validation before deploy
6. **🟢 Continue content creation** — Godot save/load guide (confirmed community demand)

---

## 2026-03-21 — Morning Standup (Day 6, Saturday)

_(preserved for history — see above)_

---

## 2026-03-20 — Morning Standup (Day 5)

_(preserved for history — see above)_
