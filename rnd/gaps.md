# Content Gap Analysis

Weekly comparison of genre-lookup system requirements vs available guides.
Last updated: 2026-03-20 (10am content gap cron)

---

## Methodology

Cross-referenced all `requiredSystems` from `src/core/genre.ts` (11 genres) against existing docs in `docs/monogame-arch/guides/`, `docs/core/concepts/`, and `docs/godot-arch/`.

## 📊 Doc Count by Module (130 total)

| Module | Category | Count | Size |
|--------|----------|-------|------|
| core | ai-workflow | 2 | — |
| core | concepts | 18 | — |
| core | game-design | 5 | — |
| core | programming | 4 | — |
| core | project-management | 18 | — |
| core | session | 2 | — |
| **core total** | | **49** | **972K** |
| godot-arch | architecture | 1 | — |
| godot-arch | guides | 3 | — |
| godot-arch | root (rules) | 1 | — |
| **godot-arch total** | | **5** | **108K** |
| monogame-arch | architecture | 4 | — |
| monogame-arch | guides | 68 | — |
| monogame-arch | reference | 3 | — |
| monogame-arch | root (rules) | 1 | — |
| **monogame-arch total** | | **76** | **2.4M** |
| **GRAND TOTAL** | | **130** | **~3.5M** |

## ✅ Filled Gaps

| System | Referenced By (genres) | Guide |
|--------|----------------------|-------|
| Combat & Damage (hitbox/hurtbox, health, knockback, projectiles) | roguelike, metroidvania, top-down-rpg, bullet-hell, survival, fighting, tower-defense, strategy (8/11) | **G64** (created 2026-03-17) |
| Economy/Currency + Shop System | tower-defense, survival (2/11) | **G65** (created 2026-03-18) |
| Building/Placement System | survival, strategy (2/11) | **G66** (created 2026-03-19) |
| Object Pooling & Recycling (general) | bullet-hell, tower-defense (2/11) | **G67** (created 2026-03-20) |
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
| Save/Load | roguelike, metroidvania, top-down-rpg, survival, visual-novel | G10 §3 |
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
| AI Systems | roguelike, metroidvania, survival, strategy, tower-defense | G4 |
| 2D Lighting | survival | G39 |
| Weather Effects | survival | G57 |
| Networking | (core) | networking-theory.md + G9 |

## 🔴 Remaining MonoGame Gaps — No Dedicated Guide

| System | Referenced By | Priority | Notes |
|--------|-------------|----------|-------|
| **Undo/Redo (puzzle-focused)** | puzzle | MEDIUM | G10 §8 covers command pattern. Could use a puzzle-specific extension with state snapshots. |
| **Level Editor / Level Loading** | puzzle | LOW | G29 (Game Editor) exists but is for dev tools. Puzzle games need runtime level select + loading. |

## 🔵 Godot Module Gaps (5 of ~20 planned = 25%)

Godot Phase 2 started 2026-03-19. Current docs cover foundational architecture only.

| Planned Doc | Status | Priority | Notes |
|-------------|--------|----------|-------|
| E1 Architecture Overview | ✅ Done | — | 15.6KB |
| godot-rules.md | ✅ Done | — | 13.6KB |
| G1 Scene Composition | ✅ Done | — | 14.4KB |
| G2 State Machine | ✅ Done | — | 38KB |
| G3 Signal Architecture | ✅ Done | — | 19KB |
| **E2 GDScript vs C#** | ❌ Missing | HIGH | Key decision doc for Godot users — language choice affects everything |
| **G4 Input Handling** | ❌ Missing | HIGH | InputMap, action system, buffering — every game needs this |
| **G5 Physics** | ❌ Missing | HIGH | RigidBody2D, CharacterBody2D, Area2D, collision layers — critical for all genres |
| **G6 Camera** | ❌ Missing | HIGH | Camera2D limits, smoothing, zoom, screen shake — platformer/RPG essential |
| **G7 TileMap** | ❌ Missing | HIGH | TileMapLayer (4.3+), terrain system, autotiling — most genres need this |
| **G8 Animation** | ❌ Missing | MEDIUM | AnimationPlayer, AnimationTree, blend spaces |
| **G9 UI/Control nodes** | ❌ Missing | MEDIUM | Container system, themes, responsive layouts |
| **G10 Audio** | ❌ Missing | MEDIUM | AudioStreamPlayer, bus layout, positional audio |
| **G11 Save/Load** | ❌ Missing | MEDIUM | Resource serialization, ConfigFile, JSON patterns |
| **G12 Shaders** | ❌ Missing | MEDIUM | CanvasItem shaders, visual shader editor |
| **G13 Particles** | ❌ Missing | LOW | GPUParticles2D, sub-emitters |
| **G14 Navigation** | ❌ Missing | MEDIUM | NavigationServer2D, avoidance |
| **G15 Networking** | ❌ Missing | LOW | MultiplayerAPI, RPCs, authority |
| **G16 Autoloads/Singletons** | ❌ Missing | MEDIUM | Global state, service pattern |
| **G17 Export/Deploy** | ❌ Missing | LOW | Export templates, platform-specific settings |

**Godot completion: 5/20 (25%) — 15 docs remaining**

## 🟡 Core Concept Gaps

18 concept theory docs exist. Missing topics that have MonoGame guides but no engine-agnostic theory:

| Missing Concept | Relevant Guides | Priority | Notes |
|-----------------|----------------|----------|-------|
| **combat-theory.md** | G64 (MonoGame) | HIGH | Combat referenced by 8/11 genres. No engine-agnostic theory for hitbox/hurtbox, damage pipelines, i-frames |
| **inventory-theory.md** | G10 §1 (MonoGame) | MEDIUM | Inventory/item systems referenced by 4 genres. Patterns are engine-agnostic |
| **save-system-theory.md** | G10 §3 (MonoGame) | MEDIUM | Save/load referenced by 5 genres. Serialization patterns, slot systems, versioning |
| **economy-theory.md** | G65 (MonoGame) | LOW | Sink/faucet balance, dynamic pricing, currency design |
| **state-machine-theory.md** | G2 (Godot), G31 (MonoGame) | MEDIUM | FSM/HSM/pushdown theory — cross-engine fundamental |
| **narrative-theory.md** | G62 (MonoGame) | LOW | Branching story structures, dialogue tree patterns |

## 📊 Coverage Summary

### Genre Coverage (MonoGame)
- **Fully covered** (all required systems have guides): platformer, metroidvania, roguelike, top-down-rpg, visual-novel, fighting, bullet-hell, tower-defense, survival, strategy
- **Mostly covered** (1-2 minor gaps): puzzle (undo/redo, level loading)
- **Overall**: ~95% of genre-referenced systems have dedicated MonoGame documentation

### Godot Coverage
- **Architecture**: 1/1 overview docs (100%)
- **Guides**: 3/~17 planned (18%)
- **Rules**: 1/1 (100%)
- **Overall**: 25% of planned Godot module complete
- **Critical missing**: Physics, Input, Camera, TileMap — foundational docs needed before genre-specific Godot content

### Core Theory Coverage
- **Existing**: 18 concept docs covering physics, camera, animation, AI, audio, pathfinding, particles, procedural gen, networking, etc.
- **Missing**: 6 topics (combat, inventory, save systems, economy, state machines, narrative)
- **Overall**: 18/24 identified topics (75%)

## 🎯 Next Priority (ranked)

### Godot (biggest gap — only 25% done)
1. **G4 Input Handling** — every Godot game needs InputMap + action system
2. **G5 Physics** — CharacterBody2D/RigidBody2D/Area2D is Godot's core
3. **E2 GDScript vs C#** — first decision every new Godot user makes
4. **G6 Camera** — Camera2D is fundamentally different from MonoGame approach
5. **G7 TileMap** — TileMapLayer (4.3+) breaking changes make this urgent

### Core Theory
6. **combat-theory.md** — 8/11 genres reference combat, no theory doc exists
7. **state-machine-theory.md** — cross-engine fundamental, both Godot and MonoGame have guides

### MonoGame (nearly complete)
8. **Undo/Redo (puzzle)** — extend G10 §8 command pattern
9. **Level Loading (puzzle)** — runtime level select
