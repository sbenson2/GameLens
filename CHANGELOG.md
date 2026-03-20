# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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
