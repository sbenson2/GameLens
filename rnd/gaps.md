# Content Gap Analysis

Weekly comparison of genre-lookup system requirements vs available guides.
Last updated: 2026-03-25 (10am content gap cron)

---

## Methodology

Cross-referenced all `requiredSystems` from `src/core/genre.ts` (11 genres) against existing docs in `docs/monogame-arch/guides/`, `docs/core/concepts/`, and `docs/godot-arch/`.

## 📊 Doc Count by Module (147 total)

| Module | Category | Count | Size |
|--------|----------|-------|------|
| core | ai-workflow | 2 | — |
| core | concepts | 19 | — |
| core | game-design | 6 | — |
| core | programming | 4 | — |
| core | project-management | 18 | — |
| core | session | 2 | — |
| **core total** | | **51** | **~1.1M** |
| godot-arch | architecture | 2 | — |
| godot-arch | guides | 13 | — |
| godot-arch | root (rules) | 1 | — |
| **godot-arch total** | | **16** | **~661K** |
| monogame-arch | architecture | 4 | — |
| monogame-arch | guides | 72 | — |
| monogame-arch | reference | 3 | — |
| monogame-arch | root (rules) | 1 | — |
| **monogame-arch total** | | **80** | **~3.1M** |
| **GRAND TOTAL** | | **147** | **~4.8M** |

### Changes Since Last Update (2026-03-24)
- **+7 new docs** since last analysis (Day 9 → Day 10)
- **Godot: 11 → 16 docs (55% → 80%)** — massive leap
  - G9 UI/Control Systems (55KB) ✅ — was #1 priority, boosts 5 genres
  - G10 Audio Systems (43KB) ✅
  - G11 Save/Load Systems (50KB) ✅ — was #2 priority, boosts 5 genres
  - G12 Shaders & Visual Effects (68KB) ✅
  - G13 Networking & Multiplayer (47KB) ✅
- **MonoGame: 78 → 80 docs** — G70 Replay Recording, G71 Spatial Partitioning added
- **Core: unchanged at 51 docs** (19 concepts)
- **Total content size: 4.1M → 4.8M** (+700K)
- **🔴🔴🔴 GitHub account SUSPENDED** — cannot push. All work local only.
- **npm still v1.0.0** — Day 9 overdue

## ✅ Filled Gaps

| System | Referenced By (genres) | Guide |
|--------|----------------------|-------|
| Combat & Damage (hitbox/hurtbox, health, knockback, projectiles) | roguelike, metroidvania, top-down-rpg, bullet-hell, survival, fighting, tower-defense, strategy (8/11) | **G64** + **combat-theory.md** |
| Economy/Currency + Shop System | tower-defense, survival (2/11) | **G65** |
| Building/Placement System | survival, strategy (2/11) | **G66** |
| Object Pooling & Recycling (general) | bullet-hell, tower-defense (2/11) | **G67** |
| Puzzle Game Systems (undo/redo, level loading, scoring) | puzzle (1/11) | **G68** |
| Save/Load & Serialization | roguelike, metroidvania, top-down-rpg, survival, visual-novel (5/11) | **G69** |
| Character Controller | platformer, metroidvania, fighting | G52 |
| Physics & Collision | platformer, bullet-hell, fighting | G3 |
| Camera Systems | platformer, metroidvania, top-down-rpg, strategy, bullet-hell | G20 |
| Tilemap | platformer, top-down-rpg, tower-defense | G37 |
| Animation State Machines | platformer, metroidvania, fighting | G31 |
| Pathfinding | roguelike, tower-defense, strategy | G40 |
| Procedural Generation | roguelike, survival | G53 |
| Fog of War | roguelike, strategy | G54 |
| Minimap | metroidvania, strategy | G58 |
| Scene Management | metroidvania, puzzle | G38 |
| UI Framework | top-down-rpg, tower-defense, strategy, puzzle, visual-novel | G5 |
| Particles | bullet-hell, tower-defense | G23 |
| Parallax/Scrolling | bullet-hell, platformer | G22, G56 |
| Narrative/Dialogue | top-down-rpg, visual-novel | G62 |
| Game Feel | platformer, bullet-hell, fighting | G30 |
| Inventory | roguelike, top-down-rpg, survival | G10 §1 |
| Crafting | survival | G10 §5 |
| Quest System | top-down-rpg | G10 §6 |
| Status Effects | roguelike, top-down-rpg | G10 §7 |
| Wave/Spawn System | tower-defense, bullet-hell | G10 §9 |
| Day/Night Cycle | survival | G10 §10 |
| Input Handling | platformer, puzzle, fighting | G7 |
| Audio | visual-novel | G6 |
| Tutorial/Onboarding | puzzle | G61 |
| Tweening | puzzle | G41 |
| Side Scrolling | platformer | G56 |
| AI Systems | roguelike, metroidvania, survival, strategy, tower-defense | G4 (polished Day 7: 30→89KB) |
| 2D Lighting | survival | G39 |
| Weather Effects | survival | G57 |
| Networking | (core) | networking-theory.md + G9 |
| Spatial Partitioning | (performance) | **G71** (NEW) |
| Replay/Recording | (feature) | **G70** (NEW) |

## 🔴 Remaining MonoGame Gaps — NONE

**MonoGame genre coverage: 100%** — all 11 genres fully covered.

## 🔵 Godot Module Gaps (16 of ~20 planned = 80%)

Godot Phase 2 started 2026-03-19. **80% milestone reached 2026-03-25.**

| Planned Doc | Status | Priority | Details |
|-------------|--------|----------|---------|
| E1 Architecture Overview | ✅ Done | — | 16KB |
| E2 GDScript vs C# | ✅ Done | — | 34KB |
| godot-rules.md | ✅ Done | — | 15KB |
| G1 Scene Composition | ✅ Done | — | 15KB |
| G2 State Machine | ✅ Done | — | 38KB |
| G3 Signal Architecture | ✅ Done | — | 20KB |
| G4 Input Handling | ✅ Done | — | 43KB |
| G5 Physics & Collision | ✅ Done | — | 33KB |
| G6 Camera Systems | ✅ Done | — | 53KB |
| G7 TileMap & Terrain | ✅ Done | — | 80KB |
| G8 Animation Systems | ✅ Done | — | 51KB |
| G9 UI/Control Systems | ✅ Done (Day 9) | — | 55KB |
| G10 Audio Systems | ✅ Done | — | 43KB |
| G11 Save/Load Systems | ✅ Done | — | 50KB |
| G12 Shaders & VFX | ✅ Done | — | 68KB |
| G13 Networking & Multiplayer | ✅ Done | — | 47KB |
| **G14 Navigation** | ❌ Missing | **HIGH** | roguelike, TD, strategy (3 genres) — NavigationServer2D, avoidance agents, nav mesh baking |
| **G16 Autoloads/Singletons** | ❌ Missing | MEDIUM | Godot-specific architecture pattern, used by every game |
| **G17 Export/Deploy** | ❌ Missing | LOW | Export templates, platform-specific settings, CI/CD for Godot |
| **G15 Particles** | ❌ Missing | LOW | GPUParticles2D, sub-emitters, trails — but G13 exists as networking, so "G15" slot was repurposed |

**Godot completion: 16/20 (80%) — 4 docs remaining**
- 50% milestone reached 2026-03-22
- **80% milestone reached 2026-03-25** (G9, G10, G11, G12, G13 all landed)
- Godot content grew from 388K → 661K (+273K) since last analysis
- Velocity recovered: 5 new Godot docs after 2-day stall

### Godot Genre Coverage Matrix (Updated)

| Genre | Core Systems Covered by Godot Docs | Missing Godot-Specific | Coverage |
|-------|-----------------------------------|----------------------|----------|
| Platformer | Physics, Input, Camera, TileMap, Animation, State Machine, Audio, Shaders | — | **98%** ✅ |
| Fighting | Physics, Input, Animation, State Machine, Audio, Shaders, Networking | — | **90%** ✅ |
| Metroidvania | Physics, Input, Camera, Animation, State Machine, Save/Load, Audio | Navigation (for AI) | **80%** |
| Roguelike | TileMap (procgen), State Machine, UI, Save/Load, Audio | Navigation | **70%** |
| Bullet Hell | Physics, Input, Camera, Animation, Shaders | Particles (GPUParticles2D guide) | **70%** |
| Top-Down RPG | Input, Camera, TileMap, UI, Save/Load, Audio | Navigation, Dialogue (Godot-specific) | **65%** |
| Survival | Physics, Input, TileMap, Camera, UI, Save/Load, Audio, Shaders | Navigation | **65%** |
| Tower Defense | TileMap, Camera, UI, Audio | Navigation | **55%** |
| Puzzle | Input, State Machine, UI, Save/Load, Audio, Shaders | — | **70%** ✅ |
| Strategy | TileMap, Camera, UI, Audio, Shaders, Networking | Navigation | **55%** |
| Visual Novel | State Machine, UI, Save/Load, Audio, Shaders | Dialogue (Godot-specific) | **60%** |

**Average Godot genre coverage: ~71%** (up from ~47% at last analysis)

**Key observation**: G9 UI/Control and G11 Save/Load together boosted 7 genres by 20-30% each as predicted. G14 Navigation is now the single remaining HIGH-priority gap — it would boost roguelike, TD, strategy, survival, and metroidvania by 10-15% each. After Navigation, the Godot module is essentially feature-complete for all 11 genres at the guide level.

## 🟡 Core Concept Gaps

19 concept theory docs exist. No change since last analysis.

| Missing Concept | Relevant Guides | Priority | Notes |
|-----------------|----------------|----------|-------|
| **state-machine-theory.md** | G2 (Godot), G31 (MonoGame) | MEDIUM | FSM/HSM/pushdown theory — cross-engine fundamental |
| **inventory-theory.md** | G10 §1 (MonoGame) | MEDIUM | Inventory/item systems referenced by 4 genres |
| **save-system-theory.md** | G10 §3, G69 (MonoGame), G11 (Godot) | MEDIUM | Save/load referenced by 5 genres |
| **economy-theory.md** | G65 (MonoGame) | LOW | Sink/faucet balance, dynamic pricing |
| **narrative-theory.md** | G62 (MonoGame) | LOW | Branching story structures, dialogue tree patterns |

Core theory coverage: 19/24 identified topics (~79%) — unchanged.

## 📊 Coverage Summary

### Genre Coverage (MonoGame)
- **Fully covered**: ALL 11 genres ✅
- **Overall**: **100%** of genre-referenced systems have MonoGame documentation

### Godot Coverage
- **Architecture**: 2/2 planned overview docs (100%)
- **Guides**: 13/~17 planned (76%)
- **Rules**: 1/1 (100%)
- **Overall**: **80%** of planned Godot module complete
- **Critical remaining**: G14 Navigation (3 genres)
- **Velocity**: Recovered — 5 new docs since last analysis
- **50% milestone**: ✅ REACHED (2026-03-22)
- **80% milestone**: ✅ REACHED (2026-03-25)

### Core Theory Coverage
- **Existing**: 19 concept docs
- **Missing**: 5 topics (state-machine, inventory, save-system, economy, narrative)
- **Overall**: 19/24 identified topics (~79%)

## 🎯 Next Priority (ranked by genre impact)

### Godot (target 90% by March 28)
1. **G14 Navigation** — Unlocks 5 genre coverages (roguelike +10%, TD +15%, strategy +15%, survival +10%, metroidvania +10%). **Single highest-impact remaining doc.**
2. **G16 Autoloads/Singletons** — Architecture pattern used by every game. Referenced by other Godot guides but never explained standalone.
3. **G15 Particles (GPUParticles2D)** — Bullet-hell coverage gap, also useful for VFX polish in all genres.
4. **G17 Export/Deploy** — Lowest priority but completes the "ship your game" story.

### Core Theory
5. **state-machine-theory.md** — Cross-engine fundamental, complements G2 (Godot) + G31 (MonoGame)
6. **save-system-theory.md** — 5 genres reference save/load, now has both engine implementations (G69 + G11)
7. **inventory-theory.md** — 4 genres reference inventory

### MonoGame (COMPLETE ✅)
- No remaining gaps.

## ⚠️ Velocity & Distribution Status

| Metric | Status | Concern Level |
|--------|--------|---------------|
| Content velocity | ~5 docs since last analysis | ✅ Recovered |
| npm publish | v1.0.0 (Day 9 overdue for v1.2.0+) | 🔴🔴🔴 Critical |
| GitHub account | **SUSPENDED** | 🔴🔴🔴 Blocks everything external |
| MCP registries | 0 submitted (Day 9 overdue) | 🔴 No external discovery |
| Godot 80% target | ✅ REACHED today | ✅ Ahead of projection |
| Total docs | 147 (was 140) | ✅ Growing |

**Assessment**: Content velocity recovered strongly. Godot module jumped from 55% to 80% — the two highest-priority gaps (UI and Save/Load) are filled plus Audio, Shaders, and Networking. The product is stronger than ever (147 docs, 190 tests, 4.8M content) but completely blocked from external distribution by GitHub suspension. Once suspension is resolved, the publish and registry submission backlog should be cleared same-day.

## 📈 Progress Tracking

| Date | Total | Core | MonoGame | Godot | Godot % | MonoGame Genre % | Core Theory % | New Docs |
|------|-------|------|----------|-------|---------|------------------|---------------|----------|
| 2026-03-17 | ~120 | 49 | 71 | 0 | 0% | ~75% | — | 1 |
| 2026-03-18 | ~122 | 49 | 73 | 0 | 0% | ~90% | — | 2 |
| 2026-03-19 | ~126 | 49 | 74 | 3 | 15% | ~93% | — | 4 |
| 2026-03-20 | 130 | 49 | 76 | 5 | 25% | ~95% | 75% | 4 |
| 2026-03-21 | 134 | 50 | 77 | 7 | 35% | 100% | 75% | 4 |
| 2026-03-22 | 138 | 51 | 78 | 9 | 45% | 100% | ~79% | 4 |
| 2026-03-23 | 140 | 51 | 78 | 11 | 55% | 100% | ~79% | 2 |
| 2026-03-24 | 140 | 51 | 78 | 11 | 55% | 100% | ~79% | 0 ⚠️ |
| **2026-03-25** | **147** | **51** | **80** | **16** | **80%** | **100%** | **~79%** | **7** ✅ |
