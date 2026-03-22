# Doc Quality Audit Log

## Core Docs Rotation Log

| Date | Rotation | Action |
|------|----------|--------|
| 2026-03-20 | A (New concept) | Created `networking-theory.md` (~21KB) |
| 2026-03-21 | B (Strategic — Feature Roadmap) | Created `rnd/marketing/feature-roadmap.md` — v1.1/v1.2/v2.0/v3.0 roadmap |
| 2026-03-21 | C (Improve PM doc) | Expanded E4_project_management.md (12.9KB → 43.5KB) — added 6 new sections |
| 2026-03-22 | A (New concept) | Created `combat-theory.md` (~34KB) — highest-priority gap, referenced by 8/11 genres |

---

## 2026-03-22 (2am — Core Docs Cron)

### Rotation A: New Concept Theory Doc

**Created: `docs/core/concepts/combat-theory.md`** (~34KB)

Combat was the highest-priority missing concept doc — referenced by 8/11 genre guides (tower defense, survival, action, platformer, RPG, roguelike, ARPG, fighting) and had a full MonoGame implementation guide (G64) but no engine-agnostic theory foundation. Godot/Bevy developers had no conceptual grounding before diving into engine-specific combat code.

**Covers 19 sections:**
- Damage pipeline architecture (canonical 10-stage pipeline, event-driven vs direct call trade-offs)
- Health & resource pools (integer HP rationale, segmented health, shield/overshield with overflow options, resource pool comparison table — mana/stamina/energy/rage/ammo)
- Damage types & resistances (type system, resistance matrix with 3 formulas, diminishing returns formula with math breakdown, effectiveness triangles)
- Hitbox/hurtbox model (separation rationale, collision layer setup, activation patterns with already-hit tracking, shape comparison)
- Invincibility frames (implementation, tuning table by genre, dodge i-frames vs damage i-frames)
- Knockback & hit reactions (impulse model, curve-based knockback with shape comparison, weight classes, hit stun)
- Hit stop & screen shake (selective freeze, Perlin noise trauma system, directional shake, tuning tables)
- Projectile systems (6 types with movement/detection characteristics, homing steering with turn rate tuning, lifetime/cleanup, pooling notes)
- Melee attack design (frame data model, telegraph hierarchy by attack tier, cancel windows for combo chains)
- Critical hits & damage variance (PRD pseudo-random distribution to prevent streaks, variance guidelines)
- Armor & defense models (5 models compared — flat/percentage/diminishing/threshold/layered, armor penetration)
- Status effects & DoT (9 common effects, stacking rules with 4 policies, tick-based DoT with framerate independence)
- Combo systems (input combo detection, chain combo with cancel windows, combo counter with proration)
- Turn-based combat (5 turn order systems, timeline/CTB pseudocode, action economy)
- Difficulty scaling & damage curves (3 stat growth models, 3 damage formulas, stealth difficulty techniques)
- Death, respawn & recovery (state machine, consequence severity table by genre)
- Combat feel & feedback (6 channels, white flash technique, 10-step layered feedback)
- Anti-patterns (5 common mistakes with fixes)
- Decision framework (real-time vs turn-based decision tree with sub-branches)

All pseudocode, fully engine-agnostic. Cross-references to 8 related docs (G64, G4 AI, physics-theory, camera-theory, animation-theory, input-handling-theory, character-controller-theory, Godot G5).

Added 12 new TOPIC_DOC_MAP keywords: combat-theory, damage pipeline, hurtbox, invincibility, i-frames, hit stop, critical hit, armor, status effect, turn-based, melee, projectile.

**Next rotation:** B (Expand thin core doc) — candidates: `ui-theory.md` (5KB), `lighting-2d-theory.md` (6KB), `camera-theory.md` (6KB), `tilemap-theory.md` (6KB), `particles-theory.md` (6KB).

---

## 2026-03-20 (2am — Core Docs Cron)

### Rotation A: New Concept Theory Doc

**Created: `docs/core/concepts/networking-theory.md`** (~21KB)

Networking was the biggest gap in the concepts library — referenced by genre docs, project management, and programming patterns but had no dedicated theory doc. The 17 existing concept docs covered rendering, physics, animation, audio, etc. but nothing on multiplayer.

**Covers:**
- Network architectures (client-server, P2P, relay)
- Latency fundamentals with real-world numbers
- State synchronization (full state, delta compression, quantization, interest management)
- Client-side prediction and server reconciliation
- Entity interpolation and extrapolation (dead reckoning)
- Lag compensation with server-side rewind
- Rollback netcode (full loop, state save/load, input delay trade-offs)
- Tick rate and deterministic simulation
- Transport protocols (UDP vs TCP, reliable UDP, channel multiplexing)
- Connection management (handshake, heartbeat, reconnection)
- Matchmaking (Elo, match quality scoring, lobby vs queue)
- Security (validation, common cheats, rate limiting)
- Bandwidth optimization (bit packing, priority accumulator)
- Clock synchronization (NTP-style)
- Architecture decision tree

All pseudocode, fully engine-agnostic. Follows the established concept doc format.

**Next rotation:** B (Expand thin core doc) — candidates: `ui-theory.md` (5KB), `lighting-2d-theory.md` (6KB), `camera-theory.md` (6KB), `tilemap-theory.md` (6KB).

---

## 2026-03-18

**FIXED: All 4 open doc issues from PROJECT_MEMORY.md**

### 1. E8_monogamestudio_postmortem.md — CREATED + 9 links fixed

Created `docs/monogame-arch/architecture/E8_monogamestudio_postmortem.md` (~6.4KB) — a comprehensive post-mortem covering:
- What MonoGameStudio was (134-file 2D editor, v0.1–v0.9)
- What went right (ImGui + docking, ECS scene model, knowledge extraction)
- What went wrong (tool-building trap, invisible scope creep, no shipping pressure)
- Decision to delete the source (sunk cost, knowledge > code)
- Lessons applied to current project philosophy

Fixed all 9 broken E8 links across these files:
- `docs/core/project-management/P10_integration_map.md` — `../E/` → `../../monogame-arch/architecture/`
- `docs/core/project-management/E9_solo_dev_playbook.md` — `./` → `../../monogame-arch/architecture/`
- `docs/core/project-management/E4_project_management.md` — `./` → `../../monogame-arch/architecture/`
- `docs/core/project-management/P0_master_playbook.md` — `../E/` → `../../monogame-arch/architecture/`
- `docs/core/ai-workflow/E5_ai_workflow.md` — `./` → `../../monogame-arch/architecture/`
- `docs/monogame-arch/guides/G29_game_editor.md` — `../E/` → `../architecture/`
- `docs/monogame-arch/guides/G30_game_feel_tooling.md` — `../E/` → `../architecture/`
- `docs/monogame-arch/architecture/E2_nez_dropped.md` — `./` already correct ✅
- `docs/monogame-arch/architecture/E3_engine_alternatives.md` — `./` already correct ✅

### 2. Missing images — REMOVED 79 broken refs across all docs

No `img/` directories exist anywhere in the project. All 79 `![](../img/*.png)` references were decorative header images with no actual files. Removed all broken image lines from all 79 affected docs. Images referenced: `topdown.png` (24), `physics.png` (12), `tilemap.png` (10), `networking.png` (10), `ui-rpg.png` (7), `roguelike.png` (5), `camera.png` (4), `space.png` (3), `nature.png` (3), `rpg.png` (1).

### 3. G3 API contradiction — FIXED

`docs/monogame-arch/guides/G3_physics_and_collision.md` — updated the Aether.Physics2D code example in Section 4 (World Setup) to use fixture-level properties (`fixture.Restitution`, `fixture.Friction`) instead of the removed `Body.SetRestitution()`/`Body.SetFriction()` methods. The gotcha note at line 577 already documented the removal; now the code examples match.

### 4. P12 misplacement — MOVED to monogame-arch

Moved `docs/core/project-management/P12_performance_budget.md` → `docs/monogame-arch/guides/P12_performance_budget.md`. The doc is heavily MonoGame/C#-specific (SpriteBatch, Arch ECS, .NET GC, Content.Load). Fixed all internal links in the moved file (6× `../../monogame-arch/guides/G33` → `./G33`, plus G16, G3, G32 refs). Left a redirect stub at the old location.

**Files changed: ~90 files total** (79 image removals + 7 E8 link fixes + 2 P12 files + 1 G3 fix + 1 new E8 doc)

---

Daily audit of 3-5 random docs for: outdated API references, broken internal doc links, consistency with current engine versions, formatting issues.

## 2026-03-19

### FIXED: Broken E5_ai_workflow.md links (7 files)

`docs/core/ai-workflow/E5_ai_workflow.md` exists, but 7 files linked to it as `./E5_ai_workflow.md` (wrong directory). Fixed all:

- `docs/core/project-management/P10_integration_map.md` — `./` → `../ai-workflow/`
- `docs/core/project-management/E9_solo_dev_playbook.md` — `./` → `../ai-workflow/`
- `docs/core/project-management/E4_project_management.md` — `./` → `../ai-workflow/`
- `docs/core/project-management/P0_master_playbook.md` — `./` → `../ai-workflow/`
- `docs/core/programming/G11_programming_principles.md` — `./` → `../ai-workflow/`
- `docs/monogame-arch/guides/G30_game_feel_tooling.md` — `./` → `../../core/ai-workflow/`
- `docs/monogame-arch/guides/G11_programming_principles.md` — `./` → `../../core/ai-workflow/`

### FIXED: Invalid C# record struct syntax in G39 (1 file)

`docs/monogame-arch/guides/G39_2d_lighting.md` — The ECS Components section had invalid C# syntax for record struct default values. `public Radius = 200f;` is not valid C#. Fixed `PointLight`, `SpotLight`, `AmbientLight`, and `LightFlickerEffect` to use proper primary constructor defaults and nullable `Color` pattern.

### Audited 5 docs (3 core, 2 monogame-arch)

**1. `core/project-management/E9_solo_dev_playbook.md`**
- ✅ Content: Excellent quality, well-researched (Stardew/Balatro/Vampire Survivors case studies)
- 🔴 FIXED: 2 broken E5_ai_workflow.md links (see above)
- ✅ E4, E8 links verified correct
- ✅ Formatting: Clean, good tables, consistent headers

**2. `core/project-management/P4_playtesting.md`**
- ✅ Content: Comprehensive playtesting guide with usability scale, templates, OBS setup
- ✅ All 3 monogame-arch cross-links verified (G61, G35, G30)
- ℹ️ NOTE: Title says `# 08 — Playtesting Guide` but filename is `P4_*`. This is systemic across all P-files (old chapter numbering vs new P-numbering). Not changing — would require coordinated update across all docs.
- ✅ Formatting: Excellent — TOC, tables, checklists, form templates

**3. `core/game-design/C1_genre_reference.md`**
- ✅ Content: Thorough genre→system mapping for 17 genres
- ✅ All internal links verified (R2, G10, E1, G1-G10 all exist)
- ✅ API references: Arch ECS, Aether.Physics2D, MonoGame.Extended, FontStashSharp, BrainAI, FmodForFoxes — all valid
- ✅ Formatting: Clean, consistent per-genre sections

**4. `monogame-arch/guides/G39_2d_lighting.md`**
- ✅ Content: Production-quality lighting guide (lightmap, point/spot, shadows, normal maps, cookies, ECS)
- ✅ All links verified (G2, G27, G23, G22, G10)
- 🔴 FIXED: Invalid C# record struct syntax in ECS Components section (see above)
- ✅ HLSL shaders: Well-structured, correct cross-platform `#if OPENGL` guards
- ✅ Formatting: Excellent — complete code examples, performance section, summary checklist

**5. `monogame-arch/guides/G54_fog_of_war.md`**
- ✅ Content: Complete fog of war implementation (visibility grid, shadowcasting, rendering, ECS)
- ✅ All links verified (G39, G37, G2, G27, G40)
- ✅ API: Arch ECS query patterns correct, shader code valid
- ✅ Formatting: Clean, good performance budget section, strategy game patterns

### Summary

| Action | Files Changed |
|--------|---------------|
| Fixed broken E5 links | 7 files |
| Fixed C# syntax in G39 | 1 file |
| **Total files changed** | **8** |

### Noted (not fixed)
- P-file title numbering mismatch (systemic, cosmetic only)

---

## 2026-03-17

**BULK FIX: Broken relative links (908 links across 46 files)**

The systemic `../G/`, `../R/`, `../E/`, `../C/` broken link pattern identified on 2026-03-16 has been fixed. Wrote a Python script (`rnd/fix_links.py`) that:
1. Built a map of all `.md` files by basename
2. Found all `../X/filename.md` single-letter directory references
3. Computed correct relative paths from each source file to the actual target
4. Rewrote all 908 broken links in 46 files

**Files changed (55 total, 697 lines):**
- `docs/core/project-management/`: P0, P1, P2, P3, P4, P5, P6, P7, P8, P9, P10, P11, P12, P13, E4
- `docs/core/game-design/`: C1, C2, E6, E7, R4
- `docs/core/ai-workflow/`: E5
- `docs/core/programming/`: G11
- `docs/monogame-arch/architecture/`: E1, E2, E3
- `docs/monogame-arch/guides/`: G1, G2, G3, G4, G5, G6, G7, G8, G9, G10, G11, G13, G15, G16, G24, G26, G29, G30, G31, G32, G36, G44, G52, G53, G59, G61, G62
- `docs/monogame-arch/reference/`: R1, R2, R3

**Remaining unresolvable links (E8_monogamestudio_postmortem.md — file doesn't exist):**
- `docs/core/project-management/P10_integration_map.md` (1 ref)
- `docs/core/project-management/P0_master_playbook.md` (1 ref)
- `docs/core/project-management/E4_project_management.md` (1 ref)
- `docs/core/project-management/E9_solo_dev_playbook.md` (1 ref)
- `docs/core/ai-workflow/E5_ai_workflow.md` (1 ref)
- `docs/monogame-arch/architecture/E2_nez_dropped.md` (1 ref)
- `docs/monogame-arch/architecture/E3_engine_alternatives.md` (1 ref)
- `docs/monogame-arch/guides/G29_game_editor.md` (1 ref)
- `docs/monogame-arch/guides/G30_game_feel_tooling.md` (1 ref)

These 9 references point to `E8_monogamestudio_postmortem.md` which was never created. Either the doc needs to be written or the references removed.

**Other known issues NOT fixed this run:**
- Missing images (`roguelike.png`, `physics.png`, `tilemap.png`) — `img/` dir doesn't exist
- G3 API contradiction (Aether `SetRestitution`/`SetFriction`)
- P12 in `core/` but is MonoGame-specific

---

## 2026-03-16

**Audited 5 docs** (2 core, 3 monogame-arch):

---

### 1. `core/concepts/camera-theory.md`

**Status: ✅ Clean**

- No API references (engine-agnostic theory doc) — nothing to go stale
- No internal doc links (only a vague "see the relevant engine module" at the end)
- Markdown formatting is solid; consistent header hierarchy, clean code blocks
- **Minor:** No front-matter/category line like other docs use (e.g., `> **Category:** Concept`). Low priority.

---

### 2. `core/project-management/P12_performance_budget.md`

**Status: 🔴 Broken links + misplaced content**

**Broken internal doc links (CRITICAL):**
All relative links use `../G/G33_profiling_optimization.md` style paths, but `core/` has no `G/` subdirectory. The `G*` guides live under `monogame-arch/guides/`. These links are dead:
- `../G/G33_profiling_optimization.md` (referenced 6 times)
- `../G/G16_debugging.md` (referenced 2 times)
- `../G/G3_physics_and_collision.md` (referenced 2 times)
- `../G/G32_deployment_platform_builds.md` (referenced 2 times)

**Broken image:**
- `![](../img/roguelike.png)` — no `img/` directory exists anywhere under `docs/`

**Module placement issue:**
- This doc lives in `core/` but is heavily MonoGame-specific (SpriteBatch, MonoGame.Extended, Arch ECS, .NET GC, Content.Load\<Texture2D\>). Should either be in `monogame-arch/` or split into engine-agnostic theory (core) + MonoGame-specific budgets (monogame-arch).

**Formatting:** Excellent overall — well-structured TOC, tables, code blocks.

---

### 3. `monogame-arch/architecture/E1_architecture_overview.md`

**Status: ⚠️ Broken relative links + version notes**

**Broken internal doc links:**
Uses `../R/R1_library_stack.md` and `../G/G1_custom_code_recipes.md` patterns. From `architecture/`, `../R/` resolves to `monogame-arch/R/` which doesn't exist — the actual paths are `../reference/R1_library_stack.md` and `../guides/G1_custom_code_recipes.md`.
- `../R/R1_library_stack.md` → should be `../reference/R1_library_stack.md`
- `../G/G1_custom_code_recipes.md` → should be `../guides/G1_custom_code_recipes.md`
- `../R/R3_project_structure.md` → should be `../reference/R3_project_structure.md`
- `./E2_nez_dropped.md` ✅ (correct — same directory)

**Version references to verify:**
- Arch ECS v2.1.0 — listed as current. Arch v2.x is the latest stable line as of early 2026. ✅
- MonoGame 3.8.5+ — current MonoGame stable is 3.8.2/3.8.3, with 3.8.6 in development. The doc says "nothing blocks .NET 10 or MonoGame 3.8.5+" which references a version that hasn't shipped yet. ⚠️ Aspirational, but could confuse readers.
- .NET 10 — mentioned as the runtime target. .NET 10 is the current preview/RC for 2025. May need updating once it's officially released. Minor.

**Formatting:** Clean, good use of Mermaid diagram, tables.

---

### 4. `monogame-arch/guides/G3_physics_and_collision.md`

**Status: ⚠️ Minor issues**

**Broken image:**
- `![](../img/physics.png)` — `img/` directory doesn't exist under `monogame-arch/`

**Internal links:** OK (uses `./G1_custom_code_recipes.md` and `../R/R2_capability_matrix.md` — wait, `../R/` is the same broken pattern as E1). But checking: from `guides/`, `../R/` would be `monogame-arch/R/` which doesn't exist.
- `../R/R2_capability_matrix.md` → should be `../reference/R2_capability_matrix.md` **(BROKEN)**

**API accuracy:**
- Aether.Physics2D v2.2.0: namespace `nkast.Aether.Physics2D` is correct ✅
- Section 4 "Common Gotchas" #4 says `Body.SetRestitution(float)` etc. are "Removed obsolete methods in v2.2.0" but the code examples in the same section use `ground.SetRestitution(0.3f)` and `ground.SetFriction(0.5f)`. **Contradicts itself** — either the methods exist or they were removed. **(API inconsistency)**
- MonoGame.Extended v5.3.1 referenced — plausible for the project's timeline. ✅
- `Position` component defined differently in Section 1 (`record struct Position(float X, float Y)`) vs Section 8 ECS integration further down. Not in this doc but could conflict with G37. Minor.

**Formatting:** Solid. Good code examples, tables, section numbering.

---

### 5. `monogame-arch/guides/G37_tilemap_systems.md`

**Status: ⚠️ Minor issues**

**Broken image:**
- `![](../img/tilemap.png)` — same missing `img/` directory

**Internal links:**
- `./G2_rendering_and_graphics.md` ✅
- `./G8_content_pipeline.md` ✅
- `./G3_physics_and_collision.md` ✅
- `./G28_top_down_perspective.md` ✅
- All footer links are also relative `./` within `guides/` — correct.

**API notes:**
- `MonoGame.Extended.Tiled` usage looks correct for Extended v5.x
- `TiledMapRenderer` constructor takes `(GraphicsDevice, TiledMap)` — correct
- LINQ usage in `ExtractObjectShapes` and `BuildFlagGrid` (`.FirstOrDefault()`, `.Select().ToArray()`) — works but contradicts the project's own performance advice (P12 says "never use LINQ in per-frame code"). These are load-time calls so technically fine, but worth a note.

**Formatting:** Excellent — comprehensive TOC, well-structured sections, performance checklist at end.

---

### Summary of Critical Issues

| Priority | Issue | Affected Docs | Fix |
|----------|-------|---------------|-----|
| 🔴 **Critical** | All `../G/`, `../R/` relative links broken — wrong subdirectory names | P12, E1, G3 | Change `../G/` → `../guides/`, `../R/` → `../reference/` |
| 🔴 **Critical** | `img/` directory missing — all image refs broken | P12, G3, G37 | Create `monogame-arch/img/` and `core/img/`, add images; or remove image refs |
| ⚠️ **Medium** | G3 contradicts itself on Aether `SetRestitution`/`SetFriction` — says removed but uses them in examples | G3 | Either use fixture-level properties in examples, or correct the gotcha text |
| ⚠️ **Medium** | P12 is MonoGame-specific but lives in `core/` | P12 | Move to `monogame-arch/guides/` or split into theory + engine-specific |
| ℹ️ **Low** | MonoGame 3.8.5+ referenced in E1 but hasn't shipped | E1 | Note as target/planned version |
| ℹ️ **Low** | camera-theory.md missing category front-matter | camera-theory | Add `> **Category:** Concept` line for consistency |

---

## Audit #6 — 2026-03-20 (7am cron)

**Docs audited:** 5 random docs

### 1. `docs/core/concepts/tilemap-theory.md`
- **Issue (link):** Plain-text reference `See physics-theory.md` instead of clickable markdown link
- **Fix:** Changed to `[physics-theory.md](./physics-theory.md)`
- **Issue (cross-ref):** No link to MonoGame implementation guide at bottom
- **Fix:** Added link to G37 Tilemap Systems in footer
- **Code/content:** Solid — pseudocode is correct, autotiling bitmask explanation is accurate, chunk-based loading is well-covered

### 2. `docs/monogame-arch/guides/G22_parallax_depth_layers.md`
- **Status:** ✅ Clean — all 4 internal links verified (G2, G1, G20, G19, G15). Code examples are correct MonoGame C#. Y-sort + Z-index + parallax combination guide is well-structured. No issues found.

### 3. `docs/core/concepts/scene-management-theory.md`
- **Issue (cross-ref):** No link to MonoGame implementation guide at bottom — just generic "see engine-specific modules"
- **Fix:** Added link to G38 Scene Management in footer
- **Content:** Clean — scene stack model, lifecycle, transitions, pause system all well-covered

### 4. `docs/core/project-management/P5_art_pipeline.md`
- **Issue (outdated API):** MonoGame.Aseprite integration described `Content.Load<AsepriteFile>()` which is the pre-v6 API. Current v6.x uses `AsepriteFile.Load()` + `CreateSpriteSheet()` pattern (no content pipeline step needed).
- **Fix:** Updated Setup section with correct v6.x API including code sample
- **Links:** All 7 cross-references to MonoGame guides verified (G8, G31, G37, G5, G23, G22, G33) — all resolve correctly via `../../monogame-arch/guides/`
- **Note:** Title says "09" but filename is P5 — known cosmetic issue (PROJECT_MEMORY acknowledges this)

### 5. `docs/core/programming/G18_game_programming_patterns.md`
- **Issue (count error):** Intro text says "20 game programming patterns" but only 19 are listed in the overview table and documented
- **Fix:** Changed to "19 game programming patterns"
- **Issue (link):** Source attribution `gameprogrammingpatterns.com` was plain text, not a clickable link
- **Fix:** Changed to `[Game Programming Patterns](https://gameprogrammingpatterns.com)`
- **Content:** Excellent — all 19 patterns have correct ECS/MonoGame context. Mermaid diagram is valid. Priority matrix is useful.

### Summary

| Doc | Issues Found | Issues Fixed |
|-----|-------------|-------------|
| tilemap-theory.md | 2 (plain-text link, missing cross-ref) | 2 |
| G22_parallax_depth_layers.md | 0 | 0 |
| scene-management-theory.md | 1 (missing cross-ref) | 1 |
| P5_art_pipeline.md | 1 (outdated API) | 1 |
| G18_game_programming_patterns.md | 2 (wrong count, plain-text link) | 2 |
| **Total** | **6** | **6** |

---

## Audit 3 — 2026-03-21 (7am cron)

**5 random docs audited. 6 issues found, 6 fixed.**

### 1. `docs/core/project-management/E4_project_management.md`
- **Issue (broken link):** Header Related section linked `[E6 Game Design Fundamentals](./E6_game_design_fundamentals.md)` — E6 lives in `../game-design/`, not in the same PM directory.
- **Fix:** Changed to `(../game-design/E6_game_design_fundamentals.md)`. Other PM files (P1, P0, P9, P10) already had the correct path.
- **Content:** Excellent — recently expanded to 43.5KB. All 14 other cross-references verified. Code-free doc, no API concerns.

### 2. `docs/monogame-arch/guides/G13_csharp_performance.md`
- **Issue (missing cross-ref):** No link to P12 Performance Budget or G33 Profiling & Optimization — natural pairings for a C# performance guide.
- **Fix:** Added P12 and G33 to the Related header.
- **Content:** All code examples use correct modern C# (readonly structs, Span<T>, stackalloc, CollectionsMarshal, FrozenDictionary .NET 8+, record structs C# 10+). No API issues.

### 3. `docs/monogame-arch/guides/G19_display_resolution_viewports.md`
- **Status:** ✅ Clean — all 6 internal links verified (G2, G15, G20, G24, G21, G25). VirtualResolution expand-mode implementation is correct. iOS device table is current (iPhone 15 Pro series). Aspect ratio decision tree is well-structured. No issues found.

### 4. `docs/monogame-arch/guides/G48_online_services.md`
- **Issue (broken link):** Section 10 referenced `[G12 Service Locator](./G12_service_locator.md)` — no such file. The file is `G12_design_patterns.md` which covers service locator among other patterns.
- **Fix:** Changed to `[G12 Design Patterns § Service Locator](./G12_design_patterns.md)`.
- **Issue (outdated API):** `SteamUser.GetAuthSessionTicket()` in Section 7 used the pre-SDK 1.55 signature (3 params). Steamworks SDK 1.55+ (Dec 2023) added a required `SteamNetworkingIdentity` parameter.
- **Fix:** Updated to 4-param signature with `SteamNetworkingIdentity`, added XML doc comment explaining the change. Backward-compatible default parameter for Web API usage.
- **Content:** All other Steamworks.NET APIs (leaderboards, cloud saves, lobbies, rich presence) verified as current.

### 5. `docs/monogame-arch/guides/P12_performance_budget.md`
- **Issue (wrong title):** Heading was `# 16 — Performance Budget Template` instead of `# P12 — Performance Budget Template`. This is the known P-file title numbering mismatch from PROJECT_MEMORY, now fixed for P12.
- **Fix:** Changed to `# P12 — Performance Budget Template`.
- **Content:** All 4 internal links verified (G33, G16, G3, G32). Frame budget diagrams, entity guidelines, and platform-specific budgets (Steam Deck, mobile, web) are comprehensive and current.

### Summary

| Doc | Issues Found | Issues Fixed |
|-----|-------------|-------------|
| E4_project_management.md | 1 (broken link to E6) | 1 |
| G13_csharp_performance.md | 1 (missing cross-refs) | 1 |
| G19_display_resolution_viewports.md | 0 | 0 |
| G48_online_services.md | 2 (broken link, outdated API) | 2 |
| P12_performance_budget.md | 1 (wrong title) | 1 |
| **Total** | **6** | **6** |
