# PROJECT MEMORY — ⚠️ NEVER DELETE THIS FILE ⚠️

This is the persistent project memory for gamedev-mcp-server R&D.
Append-only. Lessons, decisions, direction shifts, and feedback go here.
Every task should read this before starting and append learnings when done.

## 🚫 HARD RULES — DO NOT VIOLATE
- **NEVER delete this file (PROJECT_MEMORY.md)**
- **NEVER delete the repo** (`gamedev-mcp-server/` directory or the GitHub repo `sbenson2/gamedev-mcp-server`)
- **NEVER run `rm -rf`, `gh repo delete`, or any destructive command against the project**

## ✅ PERMISSIONS
- You may do ANYTHING else needed to advance the project
- Edit files, create files, move files, refactor code, fix bugs, write docs, run builds, push commits — all allowed
- Install dependencies, update packages, restructure directories — all allowed
- The only hard limit is: don't delete the repo or this file

---

## Project Direction

- **Core thesis**: Cross-engine gamedev knowledge MCP server — no direct competition exists
- **Revenue model**: LemonSqueezy subscription ($8-12/mo or $49-79/yr), Pro content server-side gated
- **Engine priority**: Godot → Unity → Bevy (in that order)
- **Differentiation**: Curated knowledge + structured AI delivery, NOT engine integration

## Known Issues

### Fixed (2026-03-17)
- ~~**Broken relative links (systemic)**~~: FIXED — 908 links across 46 files corrected via `rnd/fix_links.py`. All `../G/`, `../R/`, `../E/`, `../C/` single-letter dir refs now point to correct paths.

### Fixed (2026-03-18)
- ~~**E8_monogamestudio_postmortem.md missing**~~: FIXED — Created the doc at `docs/monogame-arch/architecture/E8_monogamestudio_postmortem.md` + fixed all 9 broken links across 7 files.
- ~~**Missing images (79 broken refs)**~~: FIXED — Removed all 79 `![](../img/*.png)` decorative header refs (no img/ dirs existed).
- ~~**G3 API contradiction**~~: FIXED — Updated Aether.Physics2D code to use fixture-level properties instead of removed `Body.SetRestitution()`/`SetFriction()`.
- ~~**P12 misplacement**~~: FIXED — Moved to `docs/monogame-arch/guides/P12_performance_budget.md`, fixed internal links, left redirect stub at old location.

### Fixed (2026-03-18, 3pm)
- ~~**DEV MODE BUG**: `GAMEDEV_MCP_DEV=true` didn't work without a license key~~: FIXED — Moved dev mode check before `getLicenseKey()` in `src/license.ts`. Dev mode now correctly enables Pro tier without any key.

### Fixed (2026-03-19)
- ~~**Broken E5_ai_workflow.md links (7 files)**~~: FIXED — 7 files across `core/project-management/`, `core/programming/`, and `monogame-arch/guides/` had `./E5_ai_workflow.md` links but the file lives in `core/ai-workflow/`. All corrected.
- ~~**Invalid C# syntax in G39_2d_lighting.md**~~: FIXED — ECS Components section used invalid `public Radius = 200f;` syntax in record structs. Corrected to proper C# primary constructor defaults.

### Open
- **Search quality issues (6 total)** — Hyphen tokenization bug (critical), no stop words, no stemming, C# token destruction, no doc length normalization, title scoring weakness. See `rnd/search-quality.md`. Top 3 fixes = ~30 min.
- **P-file title numbering mismatch** — All P-series files have old chapter numbers in titles (e.g., `P4_playtesting.md` titled `# 08 — Playtesting Guide`). Cosmetic only, links use filenames not titles.
- **17 code improvements identified (2026-03-19)** — Full codebase audit found 2 bugs (ID collision hiding module docs, fragile genre free-tier filter), 5 robustness issues (no try/catch in handlers, cache shape validation, etc.), and 5 MCP tool improvements (section extraction for large docs, richer descriptions, summary mode). See `rnd/code-improvements.md`. Quick wins: ~30 min. Full list: ~3 hours.

## Competitive Landscape (updated 2026-03-19)

- Space dominated by engine integration tools (Godot-MCP 2.5K⭐, Unreal-MCP 1.6K⭐, Unity-MCP 1.4K⭐, IvanMurzak Unity-MCP 1.4K⭐)
- Only one docs competitor: `godot-mcp-docs` (51⭐) — **effectively dead** (no updates since July 2025)
- **TWO paid Godot MCP servers now**: Godot MCP Pro ($5, 162 tools) + GDAI MCP ($19, 76⭐, ~30 tools). Both editor integration, not knowledge.
- **Roblox going official with MCP** — first major engine company to build native MCP support + 3 community forks
- **Godot MCP namespace getting crowded** — 5+ servers now. Differentiation via cross-engine knowledge is critical.
- **Ref** (ref.tools) remains closest analog — $9/mo credit-based docs MCP. Proves paid docs-MCP works.
- **Context window backlash is a marketing opportunity** — tool-heavy MCPs getting pushback (55K+ tokens for schemas). Our minimal-tools, rich-content model is the antidote.

## Market Sentiment (2026-03-17)

- **#1 pain point across all communities: AI context loss** — devs describe a universal cycle where AI starts great then "becomes painfully stupid" mid-project. This is THE problem a knowledge MCP solves.
- **Vibe coding backlash growing** — "500 Hours of Vibe Coding Broke Me" trending on r/gamedev. Structured knowledge = antidote to chaos.
- **MCP fatigue emerging** — users complaining about too many servers degrading agent performance. Position as "the ONE knowledge server" not "another MCP."
- **r/aigamedev** is a new active subreddit — potential community for launch promotion
- **Marketing angle**: "Your AI forgets everything mid-project? Give it permanent gamedev knowledge." Focus on the context-loss problem.

## Monetization Landscape (updated 2026-03-18)

- **11,400+ MCP servers exist, less than 5% monetized** — massive whitespace for paid servers
- **6+ payment platforms** now compete for MCP monetization: MCPize (85/15 split, 350+ servers), xpay.sh (per-tool proxy), MCP Billing Spec (open standard), Stripe+Cloudflare (native), Masumi, x402/Coinbase
- **Ref (ref.tools) = best pricing template**: $9/mo, credit-based, docs-focused, usage-limited free tier (200 credits, never expire). Our $8-12/mo plan validated.
- **LemonSqueezy acquired by Stripe (Oct 2024)** — still works but indie spirit concerns growing. Alternatives: Creem.io, Polar.sh, direct Stripe.
- **Dual distribution viable**: Sell direct (LemonSqueezy/Stripe) + list on MCPize marketplace for discovery
- **xpay.sh zero-code overlay**: Can add pay-per-tool-call billing with zero changes to our server — potential "pay as you go" tier
- **Agent-native payments (x402, Google UCP) emerging** — not ready for primetime but architect for it
- **Stripe tutorial literally describes our use case**: "Developers who own open-source projects can monetize their documentation by turning it into MCP servers"

## 🚨 Needs Owner Attention
_Cron agents: add urgent items here. Heartbeat will check and alert Wes. Clear items after acknowledged._

- **2026-03-19**: 12+ files uncommitted from today's work (G66, godot-arch/, audit fixes, rnd/). Need git commit & push.
- **2026-03-17**: npm still returns 404 — package not published. Day 4. No external feedback loop.
- **2026-03-19**: Search hyphen bug (P1) known for 2 days, ~15 min fix, still not done. Blocks `"character-controller"`, `"top-down"`, etc. — affects real user queries.

## Feedback & Direction Shifts

_Append Wes's feedback and direction changes here._

- **2026-03-16**: Initial R&D pipeline established. Wes wants full daily workday (9-5, hourly tasks). Be adaptive, reach further, identify new work streams.
- **2026-03-19**: Alignment decisions:
  - Fix genre filter bug BEFORE npm publish (don't ship leaky Pro content)
  - Godot content stays in the 1pm hour only; 11am continues filling MonoGame gaps
  - Server-side API: Cloudflare Workers (cheapest, easiest, comprehensive free tier)
  - Pricing: $9/month
  - npm package name: `gamedev-mcp-server` (confirmed)
  - Phase 1 (code quality) before Phase 2 (ship) before Phase 3 (Godot expansion)

## Two Days Ago (2026-03-18) — Day 3

1. ✅ Fixed ALL 4 open doc issues — E8 created, 79 dead image refs removed, G3 API fixed, P12 moved
2. ✅ Created G65 — Economy & Shop Systems (~54KB)
3. ✅ Pricing research, Godot deep research, search quality deep-dive all complete
4. ✅ Integration testing COMPLETE — 14/15 PASS, found & fixed dev mode bug
5. ✅ Git push DONE (6fcab58, 104 files committed)

## Yesterday's Progress (2026-03-19) — Day 4

1. ✅ **Godot Module Phase 2 STARTED** — Created `docs/godot-arch/` with 3 docs (~43.6KB): E1 Architecture Overview, godot-rules.md, G1 Scene Composition. Module functional and tested.
2. ✅ **G66 Building & Placement Systems created** (~85KB) — Largest doc. Fills survival + strategy gaps → genre coverage now ~93%.
3. ✅ **Functional testing COMPLETE** — 21 tests, 20 PASS, 1 FAIL (known hyphen bug). Godot module 6/6 pass. No new bugs.
4. ✅ **Full codebase audit** — 17 improvements identified (2 bugs, 5 robustness, 5 MCP tool, 5 DX). See `rnd/code-improvements.md`.
5. ✅ **Doc fixes** — 7 broken E5 links fixed, G39 invalid C# syntax fixed, 5 docs audited.
6. ✅ **Competitive intel** — "Context Window Tax" going mainstream, star tracking updated.
7. ❌ **Search bug fixes NOT done** — Day 2 of knowing about P1-P3. ~30 min total.
8. ❌ **Git push NOT done** — New work not committed (G66, godot-arch/, fixes, rnd/).
9. ❌ **npm still 404** — Day 4 with no external feedback.

## Today's Priorities (2026-03-20) — Day 5

1. **🔴🔴 GIT COMMIT & PUSH** — G66, godot-arch/ (3 docs), 8 audit fixes, rnd/ updates. Do this FIRST.
2. **🔴 Search bug fixes (P1-P3)** — Hyphen tokenization, stop words, C# token. Day 3 of knowing. ~30 min. No more excuses.
3. **🟡 Code quick wins (~30 min)** — #5 better error msg, #6 log network errors, #12 update TOPIC_DOC_MAP for G64/G65/G66/Godot, #13 show descriptions in search results.
4. **🟡 Godot Phase 2 continue** — G2 State Machine, G3 Signal Architecture, E2 GDScript vs C#.
5. **🟢 npm publish assessment** — Day 5. At minimum document blockers.
6. **🟢 Commit & push at EOD** — Pattern: commit at start AND end of day.

## Godot Module Progress (Phase 2 — Prototyping)

- **Started:** 2026-03-19
- **Directory:** `docs/godot-arch/` (architecture/, guides/, reference/)
- **Docs completed:** 3 of ~20 planned
  - ✅ `architecture/E1_architecture_overview.md` (15.6KB) — Node tree, scenes, signals philosophy, comparison with MonoGame/ECS, when-to-use assessment
  - ✅ `godot-rules.md` (13.6KB) — AI code generation rules, Godot 3→4 migration table, movement patterns, naming conventions, resource patterns, performance rules
  - ✅ `guides/G1_scene_composition.md` (14.4KB) — Component scenes pattern, hitbox/hurtbox/health composition, instancing, file organization, composition vs inheritance
- **Next up:** G2 State Machine, G3 Signal Architecture, E2 GDScript vs C#
- **Validated:** Module loads, indexes, searches, gates by tier. 6/6 functional tests PASS.

## Content Created

- **2026-03-19 (1pm)**: Started **Godot Module Phase 2** — Created `docs/godot-arch/` skeleton + 3 docs: E1 Architecture Overview (15.6KB, covers node tree/scenes/signals/autoloads/resources/state machines/2D vs 3D/engine comparison), godot-rules.md (13.6KB, AI code gen rules with Godot 3→4 migration, typed GDScript standards, movement patterns, resource patterns), G1 Scene Composition (14.4KB, component scenes with health/hitbox/hurtbox examples, instancing patterns, file organization, composition vs inheritance guide). Total: ~43.6KB of Godot content.
- **2026-03-18 (11am)**: Created **G65 — Economy & Shop Systems** (`docs/monogame-arch/guides/G65_economy_shop_systems.md`, ~54KB). Full implementation guide covering: currency definitions & registry, wallet & currency manager, transaction pipeline with modifiers, item pricing with dynamic modifiers (supply/demand, time-of-day, reputation), shop system with stock management & restocking, tower defense economy (bounties, interest, tower cost/upgrade/sell), survival barter system, reputation & unlock system, loot & drop tables (weighted random), economy sinks & faucets monitoring, save/load integration, UI integration (animated HUD counters, shop display helpers), and comprehensive tuning reference tables for TD/survival/RPG. Fills the #1 priority gap — economy was referenced by tower-defense and survival genres.
- **2026-03-19 (11am)**: Created **G66 — Building & Placement Systems** (`docs/monogame-arch/guides/G66_building_placement_systems.md`, ~85KB). Full implementation guide covering: building definition registry with costs/rules/tags, grid system with occupancy tracking and terrain layers, ghost preview with green/red validity tinting, placement validation pipeline (terrain rules, occupied check, path-blocking prevention, tech requirements, max count, adjacency), placement execution with resource deduction and ECS entity creation, free-form radius-based placement, construction system with build timers and worker assignment, construction queues, building upgrades with tier progression, building health/damage/destruction with combat system integration, repair system with cost scaling, wall auto-connect using 4-bit bitmask (16 sprite variants), pathfinding integration (nav grid updates + TD path preview), save/load serialization, build menu UI and building info panels, health bars and construction progress bars, and genre-specific patterns for survival (base building, campfires, doors), tower defense (tower placement with path-block prevention), and strategy/RTS (tech tree requirements, worker construction). Includes tuning reference tables for all three genres.
- **2026-03-17 (11am)**: Created **G64 — Combat & Damage Systems** (`docs/monogame-arch/guides/G64_combat_damage_systems.md`, ~52KB). Full implementation guide covering: health/armor components, hitbox/hurtbox system, damage pipeline, i-frames, knockback (impulse + curve-based), hitstop & screen shake, projectile system, object pooling (generic + ECS entity pool), melee attack system with frame data, damage types & resistances, critical hits & variance, turn-based combat adapter, death & respawn, damage numbers, and tuning reference tables. This was the highest-priority gap — combat systems were referenced by 8/11 genres but had no guide. Updated `rnd/gaps.md` with full coverage analysis (~90% genre system coverage now).

## Lessons Learned

_Append operational lessons here._

- **2026-03-16**: First audit found systemic broken link pattern — likely applies to many more docs than the 5 sampled.
- **2026-03-16**: Day 1 was mostly setup + audit + competitive intel. Many rnd/ files are still stubs. Tomorrow should focus on *doing* (fixing, building, testing) rather than more scaffolding.
- **2026-03-16**: The broken link pattern (`../G/` vs `../guides/`) suggests docs were originally in a flat structure with single-letter dirs that got renamed. A bulk sed fix should handle most of it.
- **2026-03-17**: Bulk sed wouldn't have worked — different source files need different relative paths (e.g., `core/project-management/` → `../../monogame-arch/guides/` but `monogame-arch/architecture/` → `../guides/`). Python script with file-map + os.path.relpath was the right approach. Fixed 908 links cleanly.
- **2026-03-17**: Day 2 shipped real fixes + content but still no build verification or git commits. Pattern: producing good work but not closing the loop (commit, test, publish). Tomorrow MUST start with git + build.
- **2026-03-17**: Combat guide (G64) was the highest-leverage content creation — single doc boosted genre coverage from ~75% to ~90%. Lesson: target gaps referenced by the most genres for maximum impact.
- **2026-03-17**: Market validation: Godot MCP Pro at $5 proves devs pay for gamedev MCP tools. "Context loss" is the #1 AI gamedev pain point — our thesis is correct. Marketing should lead with "your AI forgets everything mid-project."
- **2026-03-18**: Godot's #1 pain point is **outdated resources** — Godot 3→4 broke everything, most tutorials/SO answers/AI outputs still use Godot 3 syntax. Our Godot module providing *correct 4.x patterns* is extremely high-value. Key differences to enforce: `CharacterBody2D` not `KinematicBody2D`, `await` not `yield`, `@export`/`@onready` not `export`/`onready`, `move_and_slide()` with no args, `TileMapLayer` not `TileMap`.
- **2026-03-18**: Godot architecture is fundamentally different from MonoGame — node tree + signals + scenes vs ECS + library composition. MCP docs must think in nodes/signals, not entities/systems. Can't just port MonoGame patterns — need Godot-native thinking.
- **2026-03-18**: **CRITICAL SEARCH BUG**: Hyphen tokenization in `search.ts` silently breaks queries for ~17 concept docs. `"character-controller"` is indexed as ONE token, but users query `"character controller"` (two tokens) → no match. Fix: split hyphens into parts while keeping compound. ~30 min for top 3 fixes (hyphens, stop words, C# token) = major quality improvement.
- **2026-03-18**: TF-IDF is adequate for 122-doc corpus but has structural weaknesses: no stop words (natural language queries are noisy), no stemming ("animations" ≠ "animation"), no doc length normalization (52KB docs dominate), `"C#"` → `"c"` → filtered out. The search works for power users who know doc IDs but struggles with how real MCP users actually phrase queries.
- **2026-03-18**: **Integration testing validates the full product flow**: MCP protocol compliance (initialize → tools/list → tools/call), free/pro tier gating, license validation with LemonSqueezy API, dev mode, and graceful degradation. The server is production-ready from a protocol standpoint.
- **2026-03-18**: **Dev mode bug pattern**: Guard clauses that return early can skip later conditional branches. When adding bypass/override flags (like `GAMEDEV_MCP_DEV`), always put them FIRST in the function — before any early returns. Caught because integration tests covered this flow.
- **2026-03-19**: **Full codebase audit completed** (13 files, all of `src/`). Key findings: (1) `boolean | "limited"` return type from `isToolAllowed` is error-prone — should be a proper `'full' | 'limited' | 'denied'` enum. (2) Genre free-tier filtering parses formatted output text by line — extremely fragile, will break silently if output format changes. Should filter structured data before formatting. (3) No error handling in any tool handler — a single throw crashes the MCP response. (4) `TOPIC_DOC_MAP` in session.ts is stale — doesn't reference G64/G65/G66 or any Godot docs. (5) Large docs (50-85KB) consume massive context windows — `get_doc` should support section extraction and `maxLength` to be context-efficient. This directly supports the "minimal tokens" competitive advantage.
- **2026-03-19**: **Most impactful improvement for competitive positioning**: Adding `section` and `maxLength` params to `get_doc`. The market research shows "context window backlash" against tool-heavy MCPs. Our advantage should be delivering *precise* knowledge, not dumping 85KB into context. This is a real differentiator vs Ref and other docs-MCPs.
