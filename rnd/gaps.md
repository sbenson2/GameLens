# Content Gap Analysis

Weekly comparison of genre-lookup system requirements vs available guides.
Last updated: 2026-03-23 (10am content gap cron)

---

## Methodology

Cross-referenced all `requiredSystems` from `src/core/genre.ts` (11 genres) against existing docs in `docs/monogame-arch/guides/`, `docs/core/concepts/`, and `docs/godot-arch/`.

## 📊 Doc Count by Module (140 total)

| Module | Category | Count | Size |
|--------|----------|-------|------|
| core | ai-workflow | 2 | — |
| core | concepts | 19 | — |
| core | game-design | 6 | — |
| core | programming | 4 | — |
| core | project-management | 18 | — |
| core | session | 2 | — |
| **core total** | | **51** | **1.0M** |
| godot-arch | architecture | 2 | — |
| godot-arch | guides | 8 | +2 (G7 TileMap, G8 Animation) |
| godot-arch | root (rules) | 1 | — |
| **godot-arch total** | | **11** | **397K** |
| monogame-arch | architecture | 4 | — |
| monogame-arch | guides | 70 | — |
| monogame-arch | reference | 3 | — |
| monogame-arch | root (rules) | 1 | — |
| **monogame-arch total** | | **78** | **2.7M** |
| **GRAND TOTAL** | | **140** | **~4.2M** |

### Changes Since Last Update (2026-03-22)
- +2 docs total (138 → 140)
- +2 Godot docs: G7 TileMap & Terrain (80KB), G8 Animation Systems (51KB)
- **🎉 Godot 50% milestone PASSED** — now at 55% (11/20)
- Core expansion: ui-theory.md 8× expansion (5KB → 41KB) — now the definitive engine-agnostic UI reference
- Godot module size: 276K → 397K (+44%)
- Total size: 4.1M → 4.2M

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

## 🔴 Remaining MonoGame Gaps — NONE

**MonoGame genre coverage: 100%** — all 11 genres fully covered.

## 🔵 Godot Module Gaps (11 of ~20 planned = 55%)

Godot Phase 2 started 2026-03-19. **50% milestone passed on 2026-03-22 (G7 TileMap).**

| Planned Doc | Status | Priority | Notes |
|-------------|--------|----------|-------|
| E1 Architecture Overview | ✅ Done | — | 16KB |
| E2 GDScript vs C# | ✅ Done | — | 34KB |
| godot-rules.md | ✅ Done | — | 14KB |
| G1 Scene Composition | ✅ Done | — | 15KB |
| G2 State Machine | ✅ Done | — | 38KB |
| G3 Signal Architecture | ✅ Done | — | 20KB |
| G4 Input Handling | ✅ Done | — | 43KB |
| G5 Physics & Collision | ✅ Done | — | 33KB |
| G6 Camera Systems | ✅ Done | — | 53KB |
| G7 TileMap & Terrain | ✅ Done | — | 80KB ← NEW (50% milestone) |
| G8 Animation Systems | ✅ Done | — | 51KB ← NEW |
| **G9 UI/Control nodes** | ❌ Missing | **HIGH** | Container system, themes, responsive layouts — needed by RPG/strategy/puzzle/VN genres |
| **G10 Audio** | ❌ Missing | MEDIUM | AudioStreamPlayer, bus layout, positional audio |
| **G11 Save/Load** | ❌ Missing | **HIGH** | Resource serialization, ConfigFile, JSON patterns — confirmed community demand (Godot Forum) |
| **G12 Shaders** | ❌ Missing | MEDIUM | CanvasItem shaders, visual shader editor |
| **G13 Particles** | ❌ Missing | LOW | GPUParticles2D, sub-emitters |
| **G14 Navigation** | ❌ Missing | MEDIUM | NavigationServer2D, avoidance |
| **G15 Networking** | ❌ Missing | LOW | MultiplayerAPI, RPCs, authority |
| **G16 Autoloads/Singletons** | ❌ Missing | MEDIUM | Global state, service pattern |
| **G17 Export/Deploy** | ❌ Missing | LOW | Export templates, platform-specific settings |

**Godot completion: 11/20 (55%) — 9 docs remaining**
- **50% milestone REACHED** on 2026-03-22 (G7 TileMap)
- Now at 55% with G8 Animation
- Next HIGH priority: G9 UI/Control and G11 Save/Load
- At current pace (~1 Godot doc/day), 65% by ~March 25

## 🟡 Core Concept Gaps

19 concept theory docs exist. ui-theory.md expanded 8× (5KB → 41KB) but was already counted.

| Missing Concept | Relevant Guides | Priority | Notes |
|-----------------|----------------|----------|-------|
| **inventory-theory.md** | G10 §1 (MonoGame) | MEDIUM | Inventory/item systems referenced by 4 genres |
| **save-system-theory.md** | G10 §3, G69 (MonoGame) | MEDIUM | Save/load referenced by 5 genres |
| **economy-theory.md** | G65 (MonoGame) | LOW | Sink/faucet balance, dynamic pricing |
| **state-machine-theory.md** | G2 (Godot), G31 (MonoGame) | MEDIUM | FSM/HSM/pushdown theory — cross-engine fundamental |
| **narrative-theory.md** | G62 (MonoGame) | LOW | Branching story structures, dialogue tree patterns |

Core theory coverage: 19/24 identified topics (~79%) — unchanged from last update.

## 📊 Coverage Summary

### Genre Coverage (MonoGame)
- **Fully covered**: ALL 11 genres ✅
- **Overall**: **100%** of genre-referenced systems have MonoGame documentation

### Godot Coverage
- **Architecture**: 2/2 planned overview docs (100%)
- **Guides**: 8/~17 planned (47%)
- **Rules**: 1/1 (100%)
- **Overall**: **55%** of planned Godot module complete (up from 45%)
- **Critical missing**: G9 UI/Control, G11 Save/Load (both HIGH priority)
- **Velocity**: +2 docs since last update (G7 + G8)
- **50% milestone**: ✅ REACHED (2026-03-22)

### Core Theory Coverage
- **Existing**: 19 concept docs (ui-theory.md massively expanded: 5→41KB)
- **Missing**: 5 topics (inventory, save systems, economy, state machines, narrative)
- **Overall**: 19/24 identified topics (~79%)

## 🎯 Next Priority (ranked)

### Godot (target 65% by March 25)
1. **G9 UI/Control nodes** — Container system, themes, responsive layouts. HIGH — needed by 5 genres (RPG, strategy, tower-defense, puzzle, visual-novel)
2. **G11 Save/Load** — Resource serialization, ConfigFile, JSON. HIGH — confirmed community demand, 5 genres need it
3. **G10 Audio** — AudioStreamPlayer, buses, positional. MEDIUM
4. **G14 Navigation** — NavigationServer2D, avoidance agents. MEDIUM
5. **G16 Autoloads/Singletons** — global patterns. MEDIUM

### Core Theory
6. **state-machine-theory.md** — cross-engine fundamental
7. **save-system-theory.md** — 5 genres reference save/load
8. **inventory-theory.md** — 4 genres reference inventory

### MonoGame (COMPLETE ✅)
- No remaining gaps.

## 📈 Progress Tracking

| Date | Total | Core | MonoGame | Godot | Godot % | MonoGame Genre % | Core Theory % |
|------|-------|------|----------|-------|---------|------------------|---------------|
| 2026-03-17 | ~120 | 49 | 71 | 0 | 0% | ~75% | — |
| 2026-03-18 | ~122 | 49 | 73 | 0 | 0% | ~90% | — |
| 2026-03-19 | ~126 | 49 | 74 | 3 | 15% | ~93% | — |
| 2026-03-20 | 130 | 49 | 76 | 5 | 25% | ~95% | 75% |
| 2026-03-21 | 134 | 50 | 77 | 7 | 35% | 100% | 75% |
| 2026-03-22 | 138 | 51 | 78 | 9 | 45% | 100% | ~79% |
| **2026-03-23** | **140** | **51** | **78** | **11** | **55%** | **100%** | **~79%** |
