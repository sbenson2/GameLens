# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

> **Version history note.** GameCodex has two version eras. Entries dated
> March 2026 (from [1.3.0] down) describe the *original* npm package, whose
> distribution died with a GitHub account suspension on 2026-03-25. The npm
> package that exists today was re-created on 2026-04-06 starting at 0.1.0 and
> reached 1.0.0 on 2026-04-17 as the free & open source release. March-era
> "1.x" numbers are **not** the same releases as the current 1.x series.

## [Unreleased]

## [2.0.0] - 2026-08-03

**The lens rewrite.** GameCodex is now a game designer AI lens for
programmers — one MCP tool, applied design judgment, nothing else.

### Added
- **The `lens` tool** — the entire tool surface, and the one door to
  everything. Describe a `situation` ("my jump feels floaty", "should I add
  crafting?", "players quit at the first boss") and get the matching
  industry-proven design lenses — the questions a designer would ask, red
  flags phrased in code terms, concrete prescriptions — plus the top
  matching knowledge-base docs. Pass `lens` for a specific lens; pass
  `doc` (+ optional `section`) to read a knowledge-base doc (docs over 25KB
  return a table of contents so large guides never flood context); pass
  nothing for the catalog.
- **The lens library** (`src/core/lenses.ts`) — 15 lenses with real,
  checkable provenance: Mark Cerny's Method, MDA (Hunicke/LeBlanc/Zubek),
  Sid Meier's interesting decisions, Steve Swink's game feel, juice
  (Jonasson/Purho, Nijman), flow & difficulty (Csikszentmihalyi, Jenova
  Chen, Celeste's Assist Mode), invisible onboarding (George Fan, Nintendo),
  kishōtenketsu level design (Hayashida), core loops (Dormans), scope &
  finishing (Derek Yu), playtest reality (Valve, RITE), player motivation
  (Self-Determination Theory, Bartle, Quantic Foundry), balance & economy
  (Sirlin, Schreiber), fun-is-learning (Koster), and emergence (BotW's GDC
  2017 talk, immersive sims). Original distillations; sources cited in
  every lens.
- SPEC.md rewritten as the v2 specification (product, tool contract, lens
  data model, content rules, non-goals).

### Removed (BREAKING)
- The five-tool surface: `project`, `design`, `docs`, `build`, `meta` — and
  their subsystems (session manager, project store, scope tracker,
  personality engine, GDD/scaffold/debug generators, TF-IDF/vector/hybrid
  search, MCP prompts). The lens is the product; 1.0.1 is the final release
  of the old surface, and the code remains in git history.
- `@huggingface/transformers` optional peer dependency (vector search was
  part of the removed docs tool). Runtime deps are now just
  `@modelcontextprotocol/sdk` + `zod`.

### Unchanged
- The 957-doc knowledge base still ships — now reachable *through the lens*
  (situation search + `doc`/`section` fetch, powered by the tuned v1 TF-IDF
  engine) and additionally served as passive MCP resources
  (`gamedev://docs/{module}/{id}`), scoped by `GAMEDEV_MODULES`.
- stdio-only transport, local-only analytics, MIT license.

## [1.0.1] - 2026-08-03

### Fixed
- **Search results no longer leak across engine filters.** The TF-IDF engine
  cached results keyed only by query+limit while callers passed filtered doc
  subsets, so `engine: "Godot"` results could be served for a later Unity or
  unfiltered search of the same query. The cache is removed outright (the full
  scan is sub-millisecond). Regression tests added.
- `meta status` / `meta health` now report the live vector-search state — it
  was snapshotted before background embedding init finished, so hybrid mode
  was reported as "Keyword (TF-IDF)" forever.
- Vector search init failures are actually surfaced (`getVectorInitError()`
  was dead code); `meta health` now includes the failure reason.
- Search analytics record real result counts (was hardcoded to 10 with a
  sentinel string that never matched the actual no-results message).
- Tool failures and concurrency rejections now set the MCP `isError` flag so
  clients can branch on failure programmatically.
- The published artifact no longer contains stale compiled files from the
  pre-1.0 monetization era (`license.js`, `tiers.js`, `rate-limit.js`, …) —
  the build now cleans `dist/` first.

### Changed
- `@huggingface/transformers` is now a true opt-in peer dependency. A default
  install no longer pulls ~210MB of onnxruntime; install it alongside
  gamecodex to enable semantic (hybrid) search. TF-IDF fallback is unchanged.
- `zod` is declared as a direct dependency (was silently inherited through
  the MCP SDK's dependency tree).
- Canonical repository is GitHub (`sbenson2/GameCodex`); GitLab is a
  mirror. package.json repository/homepage/bugs updated to match.
- Removed orphaned `test-teach.ts` and `scripts/generate-test-key.ts`.

## [1.0.0] - 2026-04-17

Free & open source release.

### Changed
- **All tools free for everyone** — removed Pro tier gating, license keys,
  rate limiting, and the LemonSqueezy integration.
- Removed `packages/tui` (not part of the MCP product direction).
- Removed Cloudflare Workers remote-docs/hybrid infrastructure.
- Relicensed under MIT.
- 164 tests passing (tier/license/Workers suites removed with their features;
  earlier "303 tests" counts included them).

## [0.4.0] - 2026-04-09

### Added
- **Monetization launch** — $7/mo Pro tier via LemonSqueezy, license activation via `gamecodex setup`
- **Security hardening** — SECURITY.md, stdio-only architecture documentation

### Changed
- Pro price set to $7/mo (up from $5, due to payment processor fee analysis)
- License UX improvements — clearer activation flow, cached validation
- 303 tests, all passing

## [0.3.9] - 2026-04-09

### Changed
- **Tier gating overhaul** — docs tool is now fully free (all 950+ docs, all 29 engines, no restrictions). Project, design, and build tools are now Pro-only. Free tier is the knowledge base hook, Pro unlocks workflow tools.
- All modules accessible on free tier (was core-only)
- 301 tests, all passing

## [0.3.8] - 2026-04-09

### Added
- **Session workflow orchestrator** — `project` tool gains `session` action for structured dev sessions (plan, build, debug, scope)
- **`session` MCP prompt** — Guided entry point for structured dev sessions
- **`clear_notes` action** on `project` tool — Clear saved notes
- **29 new engine architecture modules** — babylonjs, bevy, construct, defold, excalibur, fna, gamemaker, gdevelop, godot, haxeflixel, heaps, kaplay, libgdx, love2d, macroquad, monogame, phaser, pixijs, playcanvas, pygame, raylib, renpy, rpgmaker, sdl3, sfml, stride, threejs, unity, unreal
- **957 total knowledge base docs** (up from 147+), 52 core + 905 engine-specific
- **Godot docs:**
  - `G12` Shaders & Visual Effects (~68KB) — Shader language fundamentals, 2D shaders (dissolve, outline, water, CRT), VisualShaders, particles (GPU/CPU), screen-space effects, shader parameters, performance optimization
  - `G13` Networking & Multiplayer (~47KB) — High-level multiplayer API, RPCs, spawner/synchronizer nodes, lobby system, client-side prediction, state sync, dedicated servers, WebSocket fallback
- **MonoGame docs:**
  - `G71` Spatial Partitioning (~32KB) — Quadtree, spatial hash, grid, sweep-and-prune, BVH, broad/narrow phase collision, dynamic insertion/removal
- **Core docs:**
  - `E9` Solo Dev Playbook expanded (15KB → 49KB) — 20 sections, AI-assisted workflows, testing strategies, version control, health/burnout, community building, launch timing

### Changed
- Guidance-first personality, all-game-devs positioning
- 300 tests, all passing (up from 190)
- Godot module at 80% completion (16/20 planned docs) — up from 60%
- Average Godot genre coverage now ~71% (up from ~47%)
- Consolidated from 22 tools to 5 power tools with action routing
- Migrated from GitHub to GitLab (`sbenson2/GameCodex`)

### Fixed
- Documentation drift: `project` tool actions, MCP prompts, and test counts now match codebase
- Doc audit #6: 7 issues across 5 docs — broken E3 links in Godot E1, P13/P1 title numbering, 8 outdated GitHub Actions versions, godot-rules.md missing cross-references, E2 Nez Dropped missing theory links

## [1.3.0] - 2026-03-24

### Added
- **SECURITY.md** — Security policy documenting stdio-only architecture, read-only design, zero runtime deps, and vulnerability reporting process. Addresses RSAC 2026 MCP security concerns.
- **Schema quality optimization** — All 10 tool descriptions compressed for minimal token cost (avg 60% shorter) while preserving discoverability. Targets A-grade agent-friendliness per MCP schema quality benchmarks.
- **CI dependency review** — New `dependency-review-action` job on PRs blocks high-severity vulns and GPL-3.0/AGPL-3.0 licenses.
- **`.nvmrc`** — Pins Node.js 22 for consistent developer environments.
- **Analytics & conversion tracking** — Pro gate impression recording, tool call timing, search/doc access metrics, startup metrics, graceful shutdown flush
- **Godot docs:**
  - `G7` TileMap & Terrain Systems (~80KB) — TileMapLayer migration, auto-tiling, custom data layers, procedural generation (BSP, cellular automata, WFC), chunk-based infinite worlds, isometric/hex tilemaps, fog of war, destructible terrain, A* pathfinding integration. **Godot module hits 50% milestone (10/20 docs).**
  - `G8` Animation Systems (~49KB) — AnimationPlayer, AnimatedSprite2D, AnimationTree (blend trees, state machines, blend spaces), root motion, tween system, hit effects (white flash shader, hit freeze, knockback combo), sprite sheet pipeline, state machine integration, animation layers, cutscene direction
- **Core concepts:**
  - `combat-theory.md` (~34KB) — Engine-agnostic combat foundation: 10-stage damage pipeline, hitbox/hurtbox model, i-frames, knockback, projectiles, melee frame data, critical hits (PRD), 5 armor models, status effects, combo systems, turn-based combat, difficulty scaling, combat feel, decision framework
  - `ui-theory.md` expanded 8× (5KB → 40KB) — Rendering paradigms, layout architecture, screen/layer management, HUD design, inventory UI, dialogue systems, data binding, input navigation, tooltips, animation, localization, accessibility, resolution scaling, anti-patterns, decision framework
- **Cache shape validation** — `isValidCacheShape()` type guard validates all required CacheEntry fields; corrupt/incompatible cache files auto-deleted instead of causing runtime errors
- **Network error logging** — `validateLicense()` now logs specific error reason (timeout, network error) instead of generic failure
- **Workers API deploy workflow** — Auto-deploys on push to main when `workers/` or `docs/` change, supports manual dispatch
- **Manual publish workflow** — `publish-manual.yml` workflow_dispatch escape hatch with dry-run option and version check against npm registry
- **Improved tool descriptions** — search_docs, get_doc, list_docs now have richer MCP manifest descriptions
- **Docs-not-found error improvement** — Better error message when doc ID doesn't match, suggests using list_docs

### Changed
- 187 tests, all passing (up from 164)
- README updated: 144+ docs, 14 Godot docs (60% milestone), 187 tests, context-efficiency positioning sharpened
- TOPIC_DOC_MAP expanded with 37 new keywords (G7 tilemaps, G8 animation, combat-theory, ui-theory)
- Tool descriptions optimized for schema token efficiency — avg 60% shorter while preserving clarity

### Fixed
- Doc audit #5: E6 broken E4 link, P11 title "# 15" → "# P11", G63 missing cross-references to G67/G64, G7 missing G52/G15/G30 links, E7 missing combat-theory/G68 links
- Doc fixes: procedural-generation-theory, C2 game feel, P4 playtesting, G48 online services, G58 minimap cross-references and content corrections
- Search quality round 4: identified synonym gaps (chase→pathfind, follow→ai) — fixes pending

## [1.2.0] - 2026-03-22

### Added
- **`compare_engines` tool** — Compare how different engines approach the same topic (e.g., camera, physics, input). Auto-links engine-agnostic theory docs, shows per-engine results with previews, and generates quick comparison tables. Includes topic synonym expansion and partial engine name matching. Pro-only.
- **`random_doc` tool** — Serendipitous doc discovery with category/module/engine filters. Returns metadata + 500-char preview. Free tier restricted to core module.
- **Phase 5 integration testing** — 60 new tests covering Workers API logic, caching, rate limiting, and end-to-end flows. 164 total tests.
- **Godot docs:**
  - `G5` Physics & Collision (~33KB) — Body type decision tree, collision layers/masks, CharacterBody2D platformer + top-down, RigidBody2D, Area2D patterns, raycasting, one-way/moving platforms
  - `G6` Camera Systems (~50KB) — Follow modes, deadzone, look-ahead, Perlin shake, zoom, multi-target, cinematic, transitions, camera zones, pixel-perfect, split screen, camera state machine
- **Core concept:**
  - `combat-theory.md` (~34KB) — Engine-agnostic combat & damage theory: 10-stage damage pipeline, hitbox/hurtbox model, knockback, projectiles, melee frame data, critical hits (PRD), armor models, status effects, combo systems, turn-based combat, difficulty scaling, combat feel
- **MonoGame:**
  - `G69` Save/Load Serialization (~113KB) — Comprehensive save system guide elevated from G10 subsection

### Changed
- G4 AI Systems deep polished (30KB → 89KB) — Added squad tactics, DDA, AI debugging, pushdown automaton, expanded steering/perception/influence maps, 7 common mistakes
- README updated: 138+ docs, 9 Godot docs, 9 tools (added compare_engines + random_doc), security positioning
- CI matrix includes Node 24; all workflows updated to actions/checkout@v6, setup-node@v6, codeql-action@v4
- 164 tests, all passing

### Fixed
- G56 broken link to G22 (renamed file), R2 outdated Apos.Input version, G17 missing cross-references, G17 outdated CI action versions, fog-of-war-theory missing engine guide links
- Dependabot PRs merged: checkout@v6, setup-node@v6, codeql-action@v4, @types/node@25.5.0

## [1.1.0] - 2026-03-21

### Added
- **Cross-engine search** — New `engine` param on `search_docs` filters results by engine name (e.g., `engine: "Godot"`). Results spanning multiple engines auto-group with engine headers. Core docs always included for context.
- **`crossEngine` param** — Force engine-grouped output format for explicit comparison queries.
- **`list_docs` summary mode** — New `summary` boolean param returns compact per-module/category counts with doc IDs (up to 10 per category), dramatically reducing token usage for discovery queries.
- **Client-side caching (Phase 4)** — Three new modules: `remote-client.ts`, `doc-cache.ts`, `hybrid-provider.ts`. Fallback chain: fresh cache → remote API → stale cache → bundled local. MCP server never fails to serve content, even offline.
- **Dependabot** — Automated dependency updates for npm packages and GitHub Actions (weekly, Mondays).
- **CodeQL security scanning** — Weekly static analysis for JavaScript/TypeScript vulnerabilities.
- **Branch protection on `main`** — Required status checks, no force pushes, no deletions.
- **Security audit job** in CI — `npm audit` runs on every push/PR.
- **Concurrency control** in CI — Duplicate runs auto-cancel on the same branch.
- **`npm pack --dry-run` verification** in CI — Ensures package is publishable on every build.
- **Module auto-discovery** — Engine modules are now auto-detected from `docs/` subdirectories. Adding a new engine is zero-config: just create the directory with docs. `GAMEDEV_MODULES` env var is now optional (all modules load by default).
- **`list_modules` tool** — Discover available engine modules, their doc counts, and tier access info.
- **Section extraction for `get_doc`** — New `section` param extracts content by heading substring match (e.g., `section: "Knockback"` on a 52KB doc returns just that section). Falls back to listing available sections on no match.
- **`maxLength` param for `get_doc`** — Cap response size at nearest paragraph boundary. Large docs (>20KB) now suggest using section/maxLength for context efficiency.
- **CI/CD pipeline** — GitHub Actions: CI (build + test matrix on Node 18/20/22), npm publish with OIDC provenance, release workflow with automatic changelog and GitHub releases.
- **36 tests** — Node.js built-in test runner (`node:test`), zero framework dependencies.
- **Godot module (Phase 2)** — 5 new Godot 4.4+ docs:
  - `E1` Architecture Overview — node tree, scenes, signals, engine comparison
  - `godot-rules.md` — AI code generation rules, Godot 3→4 migration table
  - `G1` Scene Composition — component scenes, hitbox/hurtbox, instancing
  - `G2` State Machines — enum FSM, node-based FSM, HSM, pushdown automaton
  - `G3` Signal Architecture — signal bus, groups, typed events, async chains
  - `G4` Input Handling (~43KB) — Polling vs events, 4 movement patterns, input buffering, coyote time, rebindable controls, gamepad, touch, local multiplayer, combo detection, accessibility
  - `E2` GDScript vs C# (~33KB) — Side-by-side syntax, performance benchmarks, platform matrix, Unity migration tables, decision tree
- **MonoGame guides G64–G68:**
  - `G64` Combat & Damage Systems (~52KB) — health, hitbox/hurtbox, damage pipeline, knockback, projectiles, melee, death/respawn
  - `G65` Economy & Shop Systems (~54KB) — currency, transactions, dynamic pricing, shop stock, loot tables, economy sinks/faucets
  - `G66` Building & Placement Systems (~85KB) — grid placement, ghost preview, wall auto-connect, construction, repair, pathfinding integration
  - `G67` Object Pooling & Recycling (~87KB) — generic pools, ECS entity recycling, VFX/audio pooling, adaptive sizing, thread-safe variants
  - `G68` Puzzle Game Systems — Undo/redo, level loading (100% MonoGame genre coverage)
- **Core concept: Networking Theory** (~21KB) — client-server, P2P, state sync, prediction, rollback, lag compensation, matchmaking
- **Cloudflare Workers API scaffold** — Server-side API for Pro content delivery (5 endpoints, rate limiting, KV storage)
- README badges (CI status, npm version, Node.js, license)

### Fixed
- **Search quality (P1–P3):** Hyphen tokenization (character-controller now matches "character controller"), stop word filtering, C# token handling (`"C#"` no longer silently drops)
- **Genre filter Pro content leak:** Refactored from regex text parsing to structured data filtering
- **ID collision bug:** `get_doc` now correctly handles prefixed IDs
- **Error handling:** All 6 tool handlers wrapped in try/catch (previously a throw would crash the MCP response)
- **`TOPIC_DOC_MAP` stale entries:** Added G64–G67 and all Godot docs
- **Doc length normalization:** sqrt(unique terms) prevents large docs from dominating search
- **Title scoring:** Per-token +5 boost for title matches
- **Dev mode bug:** `GAMEDEV_MCP_DEV=true` now correctly enables Pro tier without requiring a license key
- 908 broken relative links across 46 files
- 79 dead image references removed
- G3 Aether.Physics2D API corrected (fixture-level properties)
- P12 moved to correct directory with redirect stub
- 7 broken E5_ai_workflow.md cross-references fixed
- G39 invalid C# syntax in record structs fixed
- P5 outdated MonoGame.Aseprite API updated to v6.x
- G18 pattern count corrected (19, not 20)
- G1→G4 cross-reference corrected (G4 slot changed from planned Custom Resources to Input Handling)
- E4 broken E6 link, G48 broken G12 link, G48 outdated Steamworks.NET API, P12 title mismatch, G13 missing cross-references
- Analytics test isolation fix (flush/reload test no longer accumulates across runs)
- Multiple missing cross-references between theory and implementation docs

### Changed
- **README overhauled** — Marketing-focused with problem/solution framing, quick start for all major MCP clients, engine module table, context-efficiency positioning
- `GAMEDEV_MODULES` is now optional (defaults to loading all discovered modules)
- CI matrix now uses `fail-fast: false` — all Node versions test even if one fails
- E4 Solo Project Management expanded (12.9KB → 43.5KB) with risk management, burnout prevention, project health metrics, pivot decisions, financial planning
- G20 Camera Systems deep polished (17KB → 46KB) with multi-target, cinematic, transitions, priority stack, camera zones
- 134+ docs, 84 tests, all passing

## [1.0.0] - 2026-03-19

### Added
- Initial release on npm
- 120+ curated game dev docs (core + MonoGame/Arch ECS)
- TF-IDF search engine with category and module filters
- Genre lookup tool with 11 genre profiles
- Session co-pilot (plan, decide, feature, debug, scope workflows)
- Free/Pro tier system with LemonSqueezy license validation
- Rate limiting for free tier
- MCP resources for docs and prompts
- Landing page at sbenson2.github.io/gamecodex
