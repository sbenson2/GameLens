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

### Fixed (2026-03-19 evening — Phase 1 complete)
- ~~**Search P1-P3**~~: FIXED — Hyphen tokenization, stop words, C# token
- ~~**Genre filter bug**~~: FIXED — Structured data filtering, no more Pro content leak
- ~~**ID collision**~~: FIXED — get-doc handles prefixed IDs
- ~~**Try/catch all handlers**~~: FIXED — All 6 tools wrapped
- ~~**TOPIC_DOC_MAP**~~: FIXED — G64-G66 + Godot docs added
- ~~**Doc length normalization + title scoring**~~: FIXED

### Open
- **P-file title numbering mismatch** — Cosmetic only, low priority
- **Remaining code improvements (from audit)**: Cache shape validation, section extraction for large docs, summary mode for list_docs, random_doc tool, richer tool descriptions. See `rnd/code-improvements.md`.
- **Search P4 (stemming)** — Not yet implemented. Medium impact, needs careful testing.
- **npm v1.0.0 published** — need to set up GitHub Actions OIDC trusted publishing for future releases
- **MCP registry submissions pending** — mcp.so, mcpmarket.com, smithery.ai, Cline marketplace

## Competitive Landscape (updated 2026-03-20)

- Space dominated by engine integration tools (Godot-MCP 2.5K⭐, Unreal-MCP 1.6K⭐, Unity-MCP 1.4K⭐, IvanMurzak Unity-MCP 1.4K⭐)
- Only one docs competitor: `godot-mcp-docs` (51⭐) — **effectively dead** (no updates since July 2025)
- **THREE paid/freemium Godot MCP servers now**: Godot MCP Pro ($5, 162 tools), GDAI MCP ($19, 76⭐), GodotIQ (8⭐, 35 tools, 22 free + 13 paid intelligence layer). All editor integration, not knowledge.
- **GodotIQ (NEW)** — most interesting new competitor. Freemium model with "spatial intelligence" paid tier. Pip-installable. Promoted on Godot Forum + DEV Community viral article. Watch closely.
- **Roblox going official with MCP** — first major engine company to build native MCP support + 3 community forks
- **Godot MCP namespace now has 7+ servers** — extreme fragmentation benefits our "one knowledge server" positioning.
- **Ref** (ref.tools) remains closest analog — $9/mo credit-based docs MCP. Proves paid docs-MCP works.
- **Context window backlash + MCP security crisis** — tool-heavy MCPs getting pushback (55K+ tokens for schemas). Meanwhile, 7,000 exposed MCP servers catalogued, CVEs being assigned (AWS MCP, Azure MCP RCE at RSAC). Our minimal-tools model + stdio architecture (no network exposure) = double advantage.
- **14,274 registered MCP servers** (up from ~11,400 on 3/19) — market in explosive growth phase.
- **DEV Community article (today)**: "Why AI Writes Better Game Code in Godot Than in Unity" — validates our Godot-first strategy. AI + Godot growing faster than AI + Unity due to text-based file formats.

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

_(empty — nothing urgent pending)_

### Resolved
- ~~**Git push overdue**~~: ✅ DONE 2026-03-19 — multiple commits pushed
- ~~**npm 404**~~: ✅ DONE 2026-03-19 — `gamedev-mcp-server@1.0.0` published to npm (177 files, 992KB)
- ~~**Search bugs P1-P3**~~: ✅ DONE 2026-03-19 — Hyphen tokenization, stop words, C# token all fixed
- ~~**Genre filter Pro content leak**~~: ✅ DONE 2026-03-19 — Refactored to structured data filtering
- ~~**ID collision bug**~~: ✅ DONE 2026-03-19 — get-doc now handles prefixed IDs
- ~~**No try/catch in handlers**~~: ✅ DONE 2026-03-19 — All 6 tool handlers wrapped
- ~~**TOPIC_DOC_MAP stale**~~: ✅ DONE 2026-03-19 — G64-G66 + Godot docs added
- ~~**Doc length normalization**~~: ✅ DONE 2026-03-19 — sqrt(unique terms) normalization
- ~~**Title scoring**~~: ✅ DONE 2026-03-19 — Per-token +5 boost

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
- **2026-03-19 evening**: Phase 1 COMPLETE. Phase 2 COMPLETE (npm published). Expanded to 24-hour cron schedule (every hour, every day). Wes wants maximum autonomous progress.

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

## Yesterday (2026-03-20) — Day 5 Recap

18 commits, 77 files changed, +11,964/-446 lines. Most productive day yet.
✅ Section extraction + maxLength (competitive differentiator)
✅ Module auto-discovery + list_modules tool
✅ CI/CD infrastructure (3 workflows, 36 tests)
✅ Cloudflare Workers API scaffold (5 endpoints)
✅ G67 Object Pooling (87KB), G3 Signal Architecture (19KB), networking-theory (21KB)
✅ G20 Camera deep polish (17KB → 46KB)
✅ README overhaul, CHANGELOG, registry submission drafts
✅ v1.1.0 prepped (not published)
❌ npm v1.1.0 NOT published, MCP registries NOT submitted, Godot E2-G7 NOT started

## Today's Priorities (2026-03-21) — Day 6 (Saturday)

1. **🔴 npm v1.1.0 publish** — v1.0.0 is stale. Trigger release workflow or manual publish.
2. **🔴 MCP registry submissions** — mcp.so, smithery.ai, mcpmarket.com, Cline. Needs Wes for accounts.
3. **🟡 Godot E2 GDScript vs C#** — critical for Unity devs exploring Godot
4. **🟡 Godot G4 Input Handling** — universally needed, high search volume
5. **🟡 Workers API deploy to Cloudflare** — get Pro content API live
6. **🟢 Save/load guide** — confirmed community gap (Godot Forum thread, 2 days old)
7. **🟢 claudefa.st "50+ Best MCP Servers" submission** — discovery opportunity

## Godot Module Progress (Phase 2 — Prototyping)

- **Started:** 2026-03-19
- **Directory:** `docs/godot-arch/` (architecture/, guides/, reference/)
- **Docs completed:** 5 of ~20 planned
  - ✅ `architecture/E1_architecture_overview.md` (15.6KB) — Node tree, scenes, signals philosophy, comparison with MonoGame/ECS, when-to-use assessment
  - ✅ `godot-rules.md` (13.6KB) — AI code generation rules, Godot 3→4 migration table, movement patterns, naming conventions, resource patterns, performance rules
  - ✅ `guides/G1_scene_composition.md` (14.4KB) — Component scenes pattern, hitbox/hurtbox/health composition, instancing, file organization, composition vs inheritance
  - ✅ `guides/G2_state_machine.md` (38KB) — 4 patterns (enum FSM, node-based FSM, HSM, pushdown automaton), animation integration, debug tools, enemy AI, anti-patterns
  - ✅ `guides/G3_signal_architecture.md` (19KB) — Signal fundamentals, connection patterns, signal bus, groups, advanced patterns (relay, typed events, reactive data, async chains), anti-patterns, architecture decision guide
- **Next up:** E2 GDScript vs C#, G4 Input Handling, G5 Physics, G6 Camera, G7 TileMap
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
- **2026-03-20**: State machines are the highest-leverage Godot guide after scene composition — they're referenced by every genre and every character system. Writing it second (G2) was the right call. The 4-pattern structure (enum → node-based → HSM → pushdown) gives AI agents a clear "use this when" decision tree instead of just dumping one pattern.
- **2026-03-20**: HSM and Pushdown Automaton are rarely covered well in Godot tutorials — most stop at basic node-based FSM. These advanced patterns are high-value differentiators for Pro content.
- **2026-03-19**: **Most impactful improvement for competitive positioning**: Adding `section` and `maxLength` params to `get_doc`. The market research shows "context window backlash" against tool-heavy MCPs. Our advantage should be delivering *precise* knowledge, not dumping 85KB into context. This is a real differentiator vs Ref and other docs-MCPs.
- **2026-03-20 (10pm)**: Created **G2 State Machines** (`docs/godot-arch/guides/G2_state_machine.md`, ~38KB). Covers 4 patterns: Enum FSM (simple objects), Node-Based FSM (full platformer with Idle/Run/Jump/Fall/WallSlide/Attack states), Hierarchical State Machine (Grounded/Airborne parent states with shared behavior), and Pushdown Automaton (game flow state stack with pause/resume). Includes animation integration, debug overlay + transition history, enemy AI FSM example, common mistakes/anti-patterns, and performance considerations. All typed GDScript for Godot 4.4+. Committed and pushed.
- **2026-03-20 (12am)**: Created **G67 — Object Pooling & Recycling** (`docs/monogame-arch/guides/G67_object_pooling.md`, ~87KB). The #1 remaining gap from gaps.md. Comprehensive guide covering: generic ObjectPool<T>, keyed multi-type pools, ECS entity recycling with Pooled tag, struct pools for high-count value types, audio source pooling with spatial audio, VFX/particle burst integration, wave-aware spawn pooling with staggered pre-warming, UI element pooling (virtualized lists, inventory slots), pool warming strategies, diagnostics overlay + GC monitor, adaptive auto-sizing pools, thread-safe variants, and genre-specific patterns (bullet hell, tower defense, survival, roguelike). Includes anti-patterns section and tuning reference tables. Genre coverage now ~95% (bullet-hell fully covered). Committed and pushed (805b4b5).
- **2026-03-20 (12am lesson)**: Object pooling is a cross-cutting concern that touches nearly every system. Writing it as a standalone guide rather than leaving it scattered across G64 §9 and G23 was the right call — it allows each genre section (bullet hell, TD, survival) to link back to the same reference rather than duplicating pool code. The keyed pool pattern (one API, multiple sub-pools) is particularly reusable and wasn't covered anywhere in existing docs.
- **2026-03-20 (1am)**: Created **G3 Signal Architecture** (`docs/godot-arch/guides/G3_signal_architecture.md`, ~19KB). Covers signal fundamentals, connection patterns (lambda/one-shot/deferred/bind/await), signal bus architecture with scaling recommendations, groups for broadcasting, advanced patterns (relay facades, typed event objects, reactive data models, async chains), anti-patterns (spaghetti, ping-pong, god bus), performance characteristics, debug overlay, and architecture decision guide. First draft was 50KB — trimmed to 19KB by cutting redundancy and merging sections. Lesson: write the full version first, then ruthlessly trim. The "call DOWN, signal UP, bus ACROSS, group BROADCAST" flow rules summary is a high-value quick reference that should appear in other guides.
- **2026-03-20 (2am)**: Created **networking-theory.md** (`docs/core/concepts/networking-theory.md`, ~21KB). First core docs cron rotation (A = new concept). Networking was the biggest gap — 17 concept docs existed but none on multiplayer. Covers client-server/P2P/relay architectures, state sync (delta compression, quantization, interest management), client prediction + reconciliation, interpolation/extrapolation, lag compensation (server rewind), rollback netcode, tick rate + determinism, UDP/TCP + reliable UDP, connection management, matchmaking (Elo + quality scoring), security, bandwidth optimization (bit packing, priority accumulator), clock sync. Added rotation log to audit-log.md for tracking. Committed and pushed (df7a22d).
- **2026-03-20 (2am lesson)**: Networking theory is a special case among concept docs — it's more of an "architecture guide" than a single-system theory doc like camera or particles. The decision tree at the end (competitive? → client-server; frame-perfect? → rollback; etc.) is the highest-value section because it's the first question every dev asks. Future concept docs for complex topics should include a decision tree or "choosing your approach" section.
- **2026-03-20**: **Pricing analysis completed**. $9/mo confirmed as the convergence point across MCP docs servers, indie dev tools, and competitive benchmarks. Key decisions: (1) Hybrid free tier (daily search limit + module gating) beats credit ledger for simplicity. (2) Annual pricing at $79/yr (27% savings) is industry standard. (3) LemonSqueezy remains primary payment platform despite Stripe acquisition — Creem.io as backup. (4) MCP-Hive is a new monetization marketplace (per-call pricing) launched Feb 2026 — worth monitoring. (5) Ludo.ai entered gamedev MCP space with credit-based subscription, further validating the model. (6) We're the ONLY subscription-priced gamedev MCP server — editor integration tools are one-time purchases because their value is static; our value grows (new docs, engines, search improvements), justifying recurring pricing.
- **2026-03-20 (3am)**: Implemented **section extraction + maxLength for `get_doc`** (code-improvements.md #14). Added `section` param (heading substring match, case-insensitive — extracts content until next equal/higher-level heading) and `maxLength` param (truncates at nearest paragraph boundary with warning). Large docs (>20KB) now show a tip suggesting these params. When section isn't found, returns a list of available sections — this turns a failed query into a discovery opportunity. Both params are composable (extract section, then truncate). 7/7 tests pass. This is the most strategically important code improvement — it directly supports the "context window efficient" competitive positioning against tool-heavy MCPs.
- **2026-03-20 (3am lesson)**: Section extraction by heading substring is more user-friendly than requiring exact heading text. Users/agents can type `"Knockback"` to match `"## Knockback System"`. The fallback showing available sections is critical UX — without it, agents would have to fetch the full doc just to discover what sections exist.
- **2026-03-20 (4am)**: Scaffolded **Cloudflare Workers API** (`workers/` directory). Phases 1-3 complete in one session: API spec, project scaffold, all 5 endpoints (health, list, get, search, license validate), rate limiting, CORS, and KV upload script. Key architecture decisions: (1) Store doc content individually in KV (`doc:{id}`) but manifest and search index as single JSON blobs (`index:manifest`, `index:search`) — this avoids N+1 KV reads for list/search operations. (2) Mirror the existing `src/core/search.ts` TF-IDF logic server-side rather than inventing a new algorithm — consistency means search results match between local and API modes. (3) The upload script (`scripts/upload-docs.ts`) pre-tokenizes all docs at upload time so the search index includes tokens — this avoids re-tokenizing on every search request. (4) Rate limiting uses KV counters with TTL-based window expiry — simpler than Durable Objects and sufficient for early scale.
- **2026-03-20 (4am lesson)**: Wrangler requires non-empty KV namespace IDs even for local dev. Using `"placeholder-xxx"` strings works — wrangler creates local SQLite-backed namespaces. The `kv bulk put` command with `--local --preview` flag is the correct path for loading data into dev KV. Also: `__dirname` doesn't exist in ESM modules — need `fileURLToPath(import.meta.url)` pattern.
- **2026-03-20 (4am lesson)**: The Workers router pattern (regex-based path matching with param extraction) is simpler and lighter than importing itty-router or hono for a 5-endpoint API. Zero dependencies beyond `@cloudflare/workers-types`. The handler signature `(request, params, env)` keeps things clean.
- **2026-03-20 (4am lesson)**: Pro content gating on the API returns metadata + section list but NO content for unauthorized requests. This is intentionally generous — it lets free users discover what Pro offers (sections visible = they can see the value) while protecting the actual content. This is better UX than a flat "403 Forbidden" which gives no information.
- **2026-03-20 (5am)**: **Search quality test (Rotation B)** — 20 queries, 20/20 PASS (100%). P1-P3 fixes (hyphen tokenization, stop words, C# token) are all verified working. Key findings: (1) Genre queries are the weakest category — no dedicated genre guide docs exist, so "tower defense game" lands on C1/G65/G66 which mention TD in subsections. The `genre_lookup` tool is the correct tool for genre queries, not `search_docs`. (2) Save/load is a content gap — no dedicated serialization guide. (3) Godot search is excellent — all 5 Godot docs rank correctly. (4) Doc length normalization prevents large docs from dominating. Created reusable test script at `rnd/search-quality-test.ts`.
- **2026-03-20 (5am lesson)**: When writing search quality tests, verify expected doc IDs against actual file names first. Initial test had 6 false failures because I assumed G56=Tower Defense when it's actually Side-Scrolling Perspective. Always `head -3` the file to confirm title before writing expectations. The reusable test script eliminates this problem for future runs.
- **2026-03-20 (7am doc audit)**: Audited 5 random docs, found and fixed 6 issues. Most common issue type: missing cross-references between theory docs (core/concepts/) and their MonoGame implementation guides. The concept docs all end with a generic "see engine-specific modules" but don't link to the actual guides. This is a systemic pattern worth fixing across all concept docs. Also caught an outdated MonoGame.Aseprite API in P5 (pre-v6 `Content.Load<AsepriteFile>` → v6.x `AsepriteFile.Load()` + processors). Lesson: third-party library APIs in docs should note the version they target — libraries evolve and examples silently become wrong.
- **2026-03-20 (8am competitor scan)**: GodotIQ is the first Godot MCP to use a freemium model (22 free tools + 13 paid "intelligence layer" — spatial analysis, dependency graphs, signal flow tracing). This is the closest pricing model to ours in the gamedev MCP space. MCP security crisis emerging (7K exposed servers, CVEs on AWS/Azure MCP, RSAC talk). Our stdio-only architecture is a security advantage worth highlighting in marketing. Also: "Why AI Writes Better Game Code in Godot Than in Unity" published today on DEV Community — argues Godot's text-based formats make it fundamentally more AI-readable, validates our Godot-first strategy.
- **2026-03-20 (10am content gap audit)**: Full content gap analysis completed. 130 total docs across 3 modules. MonoGame is nearly complete (~95% genre coverage, only puzzle undo/redo + level loading missing). **Godot is the biggest gap at 25% (5/20 planned)**. Core theory has 6 missing topics — combat-theory is highest priority (referenced by 8/11 genres). The content imbalance is stark: MonoGame has 76 docs (2.4M), Godot has 5 docs (108K) — 15:1 ratio. Reaching even 50% Godot completion (10 docs) should be the near-term goal. Also identified that 6 core theory topics lack engine-agnostic docs despite having MonoGame implementation guides — these theory gaps mean Godot/Bevy users get no conceptual foundation before diving into engine-specific content.
- **2026-03-20 (6am git sync)**: Repo clean. 3 uncommitted files found (search-quality-test.ts, search-quality.md update, PROJECT_MEMORY.md update) — committed and pushed. Build passes (tsc --noEmit clean). 19 total commits, 186 tracked files, 4.4M .git size. All 8 commits from today's cron sessions pushed successfully. No merge conflicts. Metrics logged to rnd/metrics.md.
- **2026-03-20 (11am engine research — Unity rotation)**: Deep research on Unity's current state. Key findings: (1) **HDRP declared "no new features"** — BIRP deprecated in 6.5, URP is the only future. Hottest topic in r/Unity3D right now. (2) **Unity MCP space has 6+ editor-integration servers** but ZERO knowledge-layer MCPs — `unity-api-mcp` is closest but still API reference, not curated guides. Our niche is wide open. (3) **"Why AI Writes Better Game Code in Godot Than in Unity"** viral DEV Community article — argues C#'s breadth + binary scene files = AI confusion. This means Unity devs need our knowledge MCP MORE than Godot devs (higher pain = higher value). (4) **Unity AI Beta 2026** at GDC — "prompt-to-game", mixed reception. Complementary to us. (5) **ECS becoming core in 6.4** but community frustrated, docs incomplete. (6) **unity-rules.md should be #1 priority** when starting Unity module — constraining AI to Unity 6 patterns is highest-value doc. (7) C# overlap with MonoGame = faster content creation. Created comprehensive `rnd/engine-research/unity.md` (17KB) with pain points, competitive landscape, community resources, and 12-doc module plan across 3 phases.
- **2026-03-20 (1pm CI/CD)**: Built complete CI/CD infrastructure in one session. Key decisions: (1) **Node's built-in test runner** (`node:test`) + `tsx` loader instead of vitest/jest — zero config, no extra framework deps, 19 tests run in <600ms. This keeps the "zero external deps" philosophy consistent. (2) **Three-workflow pattern**: `ci.yml` (push/PR → build + test matrix Node 18/20/22), `publish.yml` (release event → npm publish with OIDC provenance), `release.yml` (manual trigger → version bump + changelog + GitHub release). The release creates a tag which triggers publish — clean separation. (3) **`import.meta.url` + `fileURLToPath`** is mandatory for ESM path resolution in tests because spaces in directory names (`Game Dev`) get URL-encoded by `import.meta.url` → `new URL().pathname` returns `Game%20Dev` which breaks `fs.existsSync`. Always use `fileURLToPath()`. (4) Tests excluded from `tsconfig.json` build (`"exclude": ["src/__tests__"]`) because they use `import.meta` which errors in CJS output — tsx handles them directly at runtime. (5) README badges added: CI status, npm version, Node.js version, MIT license.
- **2026-03-20 (2pm cross-engine: module auto-discovery)**: Implemented **module auto-discovery** (`src/core/modules.ts`) + **`list_modules` tool**. Key decisions: (1) Convention over configuration — any subdirectory of `docs/` (except `core`) with at least one `.md` file is auto-detected as a module. Adding a new engine is now zero-config: just create `docs/unity-arch/` with docs and it's discovered. (2) Engine detection uses a known-engine map (`ENGINE_MAP`) plus fallback name cleaning for unknown engines. (3) Labels are extracted from `*-rules.md` heading text with automatic cleanup (strips " — AI Rules" suffix). (4) `GAMEDEV_MODULES` env var is now optional — without it, ALL discovered modules are active. When set, it acts as a filter (supports both module IDs and engine names, case-insensitive). This is backward compatible: existing configs with `GAMEDEV_MODULES=monogame-arch` still work identically. (5) `resolveActiveModules()` matches by both module ID (`monogame-arch`) and engine name (`godot`), making the env var more user-friendly. (6) Modules are sorted by doc count (most complete first) in discovery output — this naturally surfaces the most developed modules. (7) The `list_modules` tool shows tier access info, so free-tier users can see what Pro unlocks without guessing. 17 new tests, 36/36 total pass. This is the foundation for cross-engine search (priority #2) and engine comparison (priority #3).
- **2026-03-20 (2pm lesson)**: Module auto-discovery is the right foundation to build BEFORE cross-engine search. Without module metadata (labels, engine names, doc counts), search results across engines would be unlabeled and confusing. The `list_modules` tool also serves as a discovery mechanism — agents can ask "what engines are available?" before searching. Building features in dependency order (discovery → search → comparison → migration) prevents rework.
- **2026-03-20 (3pm marketing)**: README overhaul — the old README was developer-focused (install, config, env vars). New README leads with the problem ("your AI forgets everything mid-project"), shows the solution, and positions competitively. Key structural changes: (1) Quick Start is ONE command (`npx gamedev-mcp-server`), not a wall of JSON. (2) Engine module table shows status at a glance (✅ Stable / 🚧 Active / 📋 Planned). (3) "What Makes This Different" section explicitly contrasts with editor-integration MCPs. (4) Context-efficiency is a headline feature, not buried in tool docs. (5) Free vs Pro is a clean table, not paragraph text. Marketing-facing READMEs should answer "why should I care?" before "how do I install?"
- **2026-03-20 (3pm marketing)**: CHANGELOG — the existing one was just a 1.0.0 stub. Built a comprehensive [Unreleased] section covering all Day 4-5 work. This is critical for the v1.1.0 release — the CHANGELOG IS the release notes. Structured by Added/Fixed/Changed following Keep a Changelog format. Lesson: maintain the CHANGELOG incrementally (each commit session should add its changes) rather than reconstructing history from git log.
- **2026-03-20 (3pm marketing)**: Registry submission drafts created for mcp.so, smithery.ai, mcpmarket.com, and Cline marketplace. Key insight: each registry has slightly different requirements (some are PR-based, some form-based, some auto-index from GitHub) but they all need the same core info: name, description, install command, tags, and tool list. Having pre-written drafts means Wes can submit to all 4 in one sitting without context-switching. The submission checklist also flags pre-requisites (npm keywords, GitHub repo description, MCP topic tag) that should be set before submitting.
- **2026-03-20 (6pm community research)**: Deep dive across r/gamedev, r/godot, r/vibecoding, Godot Forum, HN. Key findings: (1) **Godogen** (htdt/godogen) hit HN front page — Claude Code skills that generate complete Godot 4 games. Creator spent a year building custom GDScript docs because nothing adequate existed. Validates our Godot module approach; we're building the reusable MCP version of what Godogen had to create from scratch. (2) **GDC 2026 attendance down 30%**, anti-AI sentiment at record high (>50% of devs say AI harms industry per State of Game Industry report). But the backlash is about replacement, not assistance — our "knowledge infrastructure" positioning sidesteps it. (3) **Save/load systems confirmed as top content gap** — Godot Forum thread from 2 DAYS AGO asking how to save complex levels, JSON limitations with Godot types (Vector2, Color etc.) is a constant confusion point. No save/load guide exists in our Godot module. (4) **"Architecture docs make AI coding work" narrative going mainstream** — Forbes TODAY, r/vibecoding, DEV Community all converging on: devs who write requirements + architecture docs succeed with AI, those who don't fail. This is literally our value prop. (5) **Claude Code Godot skills proliferating** on LobeHub — two separate "GDScript Patterns" listings covering exactly what our Godot module covers. Demand proven; our MCP is the scalable searchable version. (6) **claudefa.st "50+ Best MCP Servers" list** published yesterday — we're not on it. Submission opportunity. Written to competitor-log.md.
- **2026-03-20 (6pm lesson)**: The HN Godogen discussion reveals a critical insight: developers building AI+Godot workflows are independently recreating the same documents we're building (GDScript rules, API references, pattern guides). The fact that multiple people are solving the same problem independently proves strong demand. Our advantage: they build one-off files for their own use; we build a searchable, versioned, cross-engine MCP server. The next marketing angle should be: "Stop writing your own CLAUDE.md for Godot — install the MCP server that already has it."
- **2026-03-20 (7pm doc polish)**: Deep polished **G20 Camera Systems** (17KB → 46KB, 481 → 1323 lines). Added 8 new sections: multi-target camera (co-op/boss framing), cinematic camera (waypoint sequences with easing), camera transitions (fade + smooth cut), camera priority stack (behavior blending), platformer vertical snap, Perlin noise shake, directional shake, camera zones (ECS trigger regions). Added pipeline overview diagram, deadzone/zoom/shake tuning tables by genre, combining patterns example, dynamic split/merge, small-map centering, comprehensive troubleshooting (7 common issues with fixes), and cross-references to 11 related guides. The camera guide was the smallest of the high-traffic docs (17KB vs 30-87KB for the others) and had the most room for production-quality additions.
- **2026-03-20 (7pm lesson)**: When deep-polishing docs, the highest-value additions are: (1) pipeline diagrams showing execution order (prevents the #1 class of bugs), (2) troubleshooting sections (directly answers the questions devs actually Google), (3) tuning tables by genre (saves hours of experimentation), and (4) combining patterns examples (real games never use one pattern in isolation). Pure code additions are good but the meta-knowledge around WHEN and WHY to use each pattern is what makes a doc truly production-grade.
- **2026-03-20 (5pm EOD git sync)**: Clean EOD sync. Only uncommitted change was `package-lock.json` (minor version bump, 4 lines). Committed, pushed, verified remote matches local (0a85733). Build clean (`tsc --noEmit` passes), 36/36 tests pass in 558ms, no temp files to clean. No merge conflicts. Day 5 total: 21 commits, repo in excellent shape for v1.1.0 publish.
- **2026-03-20 (4pm version prep)**: v1.1.0 prepped successfully. 17 commits since v1.0.0, all meaningful: new features (module auto-discovery, section extraction, list_modules), content (5 Godot docs, 4 MonoGame guides, networking theory), infrastructure (CI/CD, Workers scaffold, 36 tests), and quality fixes (search P1-P3, genre filter, error handling). Build clean, 36/36 tests pass, server smoke test passes (discovers 2 modules, 130 docs). CHANGELOG dated, version bumped in package.json, metrics updated. Did NOT run `npm publish` — release.yml workflow dispatch is the intended publish path (creates GitHub Release → triggers publish.yml → npm publish with OIDC provenance). Lesson: having a release workflow means version prep is just bump + changelog + commit — the actual publish is a one-click GitHub action.
- **2026-03-21 (9pm strategic — Week B: Feature Roadmap)**: Created comprehensive feature roadmap at `rnd/marketing/feature-roadmap.md`. Key strategic decisions: (1) **v1.1 = pure distribution, zero new features** — we've been building for 6 days with no real users. Ship before adding more. (2) **v1.2 = cross-engine search + Workers API deploy + Godot to 50%** — these three create the product moat. Cross-engine is our unique differentiator; API deploy enables real monetization; 10 Godot docs is the minimum viable module. (3) **v2.0 = Unity module launch** — biggest untapped market, ZERO knowledge-layer competitors, C# overlap with MonoGame accelerates creation. (4) **Anti-roadmap defined** — explicitly won't build editor integration, codegen, asset generation, or scaffolding. Knowledge layer is the niche. (5) **MCP 2026 spec alignment** — streamable HTTP transport should wait for spec stability (Working Groups still iterating); .well-known/mcp.json is low-effort early win. (6) **Semantic search deferred to v2.0** — TF-IDF adequate at 130 docs, invest when 200+ docs demand it. (7) **Agent-native billing (x402/UCP) is v2.0+** — protocols aren't ready for primetime yet but architecture should not preclude it.
- **2026-03-21 (9pm lesson)**: Feature roadmaps for developer tools should include an "anti-roadmap" (things you explicitly won't build). This prevents scope creep from "wouldn't it be cool if..." suggestions and keeps the team focused on the niche. Every feature rejected should have a one-sentence reason. Also: MCP spec alignment section is worth maintaining — the protocol is evolving fast and building on unstable SEPs wastes effort. Wait for Working Groups to land changes, then adopt quickly.
