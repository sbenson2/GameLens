# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- **Cross-engine search** — New `engine` param on `search_docs` filters results by engine name (e.g., `engine: "Godot"`). Results spanning multiple engines auto-group with engine headers. Core docs always included for context.
- **`crossEngine` param** — Force engine-grouped output format for explicit comparison queries.
- **`list_docs` summary mode** — New `summary` boolean param returns compact per-module/category counts with doc IDs (up to 10 per category), dramatically reducing token usage for discovery queries.
- **Client-side caching (Phase 4)** — Three new modules: `remote-client.ts`, `doc-cache.ts`, `hybrid-provider.ts`. Fallback chain: fresh cache → remote API → stale cache → bundled local. MCP server never fails to serve content, even offline.
- **Godot docs (2 new, 7 total):**
  - `E2` GDScript vs C# (~33KB) — Side-by-side syntax, performance benchmarks, platform matrix, Unity migration tables, decision tree
  - `G4` Input Handling (~43KB) — Polling vs events, 4 movement patterns, input buffering, coyote time, rebindable controls, gamepad, touch, local multiplayer, combo detection, accessibility
- **MonoGame guide G68:**
  - `G68` Puzzle Game Systems — Undo/redo, level loading (100% genre coverage achieved)
- **Dependabot** — Automated dependency updates for npm packages and GitHub Actions (weekly, Mondays)
- **CodeQL security scanning** — Weekly static analysis for JavaScript/TypeScript vulnerabilities
- **Branch protection on `main`** — Required status checks (CI build matrix + lint), no force pushes, no deletions
- **Security audit job** in CI — `npm audit` runs on every push/PR
- **Concurrency control** in CI — Duplicate runs auto-cancel on the same branch
- **`npm pack --dry-run` verification** in CI — Ensures package is publishable on every build
- **README badges** — Added CodeQL status and npm monthly downloads badges
- **Feature roadmap** — Strategic plan through v2.0 with anti-roadmap (rnd/marketing/)
- **Engine research docs** — Deep analysis of Unity 6 and Bevy 0.18 landscapes for future modules

### Fixed
- Content validation: broken G1→G4 cross-reference (G4 slot changed from planned Custom Resources to Input Handling)
- 6 issues across 5 docs (audit #3): E4 broken E6 link, G48 broken G12 link, G48 outdated Steamworks.NET API, P12 title mismatch, G13 missing cross-references

### Changed
- CI matrix now uses `fail-fast: false` — all Node versions test even if one fails
- E4 Solo Project Management expanded (12.9KB → 43.5KB) with risk management, burnout prevention, project health metrics, pivot decisions, financial planning
- G20 Camera Systems deep polished (17KB → 46KB) with multi-target, cinematic, transitions, priority stack, camera zones
- 58 tests total (up from 36), all passing

## [1.1.0] - 2026-03-20

### Added
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
- **MonoGame guides G64–G67:**
  - `G64` Combat & Damage Systems (~52KB) — health, hitbox/hurtbox, damage pipeline, knockback, projectiles, melee, death/respawn
  - `G65` Economy & Shop Systems (~54KB) — currency, transactions, dynamic pricing, shop stock, loot tables, economy sinks/faucets
  - `G66` Building & Placement Systems (~85KB) — grid placement, ghost preview, wall auto-connect, construction, repair, pathfinding integration
  - `G67` Object Pooling & Recycling (~87KB) — generic pools, ECS entity recycling, VFX/audio pooling, adaptive sizing, thread-safe variants
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
- Multiple missing cross-references between theory and implementation docs

### Changed
- **README overhauled** — Marketing-focused with problem/solution framing, quick start for all major MCP clients, engine module table, context-efficiency positioning
- `GAMEDEV_MODULES` is now optional (defaults to loading all discovered modules)

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
- Landing page at sbenson2.github.io/gamedev-mcp-server
