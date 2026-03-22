# Content Gap Analysis

Weekly comparison of genre-lookup system requirements vs available guides.
Last updated: 2026-03-22 (10am content gap cron)

---

## Methodology

Cross-referenced all `requiredSystems` from `src/core/genre.ts` (11 genres) against existing docs in `docs/monogame-arch/guides/`, `docs/core/concepts/`, and `docs/godot-arch/`.

## 📊 Doc Count by Module (138 total)

| Module | Category | Count | Size |
|--------|----------|-------|------|
| core | ai-workflow | 2 | — |
| core | concepts | 19 | +1 (combat-theory) |
| core | game-design | 6 | — |
| core | programming | 4 | — |
| core | project-management | 18 | — |
| core | session | 2 | — |
| **core total** | | **51** | **1.1M** |
| godot-arch | architecture | 2 | — |
| godot-arch | guides | 6 | +2 (G5 Physics, G6 Camera) |
| godot-arch | root (rules) | 1 | — |
| **godot-arch total** | | **9** | **276K** |
| monogame-arch | architecture | 4 | — |
| monogame-arch | guides | 70 | +1 (G69 Save/Load) |
| monogame-arch | reference | 3 | — |
| monogame-arch | root (rules) | 1 | — |
| **monogame-arch total** | | **78** | **2.7M** |
| **GRAND TOTAL** | | **138** | **~4.1M** |

### Changes Since Last Update (2026-03-21)
- +4 docs total (134 → 138)
- +2 Godot docs: G5 Physics & Collision (33KB), G6 Camera Systems (50KB)
- +1 Core doc: combat-theory.md (34KB) — was the #1 missing concept (8/11 genres)
- +1 MonoGame doc: G69 Save/Load Serialization (113KB) — fills save system content gap
- Deep polish: G4 AI Systems (30KB → 89KB), fog-of-war-theory, G17 Testing, G56 Side-Scrolling, R2 Capability Matrix
- Godot module size: 188K → 276K (+47%)
- Total size: 3.8M → 4.1M

## ✅ Filled Gaps

| System | Referenced By (genres) | Guide |
|--------|----------------------|-------|
| Combat & Damage (hitbox/hurtbox, health, knockback, projectiles) | roguelike, metroidvania, top-down-rpg, bullet-hell, survival, fighting, tower-defense, strategy (8/11) | **G64** + **combat-theory.md** ← theory added 2026-03-22 |
| Economy/Currency + Shop System | tower-defense, survival (2/11) | **G65** (created 2026-03-18) |
| Building/Placement System | survival, strategy (2/11) | **G66** (created 2026-03-19) |
| Object Pooling & Recycling (general) | bullet-hell, tower-defense (2/11) | **G67** (created 2026-03-20) |
| Puzzle Game Systems (undo/redo, level loading, scoring) | puzzle (1/11) | **G68** (created 2026-03-21) |
| Save/Load & Serialization | roguelike, metroidvania, top-down-rpg, survival, visual-novel (5/11) | **G69** (created 2026-03-22) ← NEW — was previously only in G10 §3 |
| Character Controller | platformer, metroidvania, fighting | G52 |
| Physics & Collision | platformer, bullet-hell, fighting | G3 |
| Camera Systems | platformer, metroidvania, top-down-rpg, strategy, bullet-hell | G20 (polished Day 5) |
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

**MonoGame genre coverage: 100%** — all 11 genres fully covered. G69 Save/Load now provides a dedicated standalone guide (was previously only covered in G10 §3).

## 🔵 Godot Module Gaps (9 of ~20 planned = 45%)

Godot Phase 2 started 2026-03-19. Up from 35% last update.

| Planned Doc | Status | Priority | Notes |
|-------------|--------|----------|-------|
| E1 Architecture Overview | ✅ Done | — | 16KB |
| E2 GDScript vs C# | ✅ Done | — | 34KB |
| godot-rules.md | ✅ Done | — | 14KB |
| G1 Scene Composition | ✅ Done | — | 15KB |
| G2 State Machine | ✅ Done | — | 38KB |
| G3 Signal Architecture | ✅ Done | — | 20KB |
| G4 Input Handling | ✅ Done | — | 43KB |
| G5 Physics & Collision | ✅ Done | — | 33KB ← NEW |
| G6 Camera Systems | ✅ Done | — | 50KB ← NEW |
| **G7 TileMap** | ❌ Missing | **HIGH** | TileMapLayer (4.3+), terrain system, autotiling — most genres need this. **50% milestone doc** |
| **G8 Animation** | ❌ Missing | MEDIUM | AnimationPlayer, AnimationTree, blend spaces |
| **G9 UI/Control nodes** | ❌ Missing | MEDIUM | Container system, themes, responsive layouts |
| **G10 Audio** | ❌ Missing | MEDIUM | AudioStreamPlayer, bus layout, positional audio |
| **G11 Save/Load** | ❌ Missing | MEDIUM | Resource serialization, ConfigFile, JSON patterns — confirmed community gap |
| **G12 Shaders** | ❌ Missing | MEDIUM | CanvasItem shaders, visual shader editor |
| **G13 Particles** | ❌ Missing | LOW | GPUParticles2D, sub-emitters |
| **G14 Navigation** | ❌ Missing | MEDIUM | NavigationServer2D, avoidance |
| **G15 Networking** | ❌ Missing | LOW | MultiplayerAPI, RPCs, authority |
| **G16 Autoloads/Singletons** | ❌ Missing | MEDIUM | Global state, service pattern |
| **G17 Export/Deploy** | ❌ Missing | LOW | Export templates, platform-specific settings |

**Godot completion: 9/20 (45%) — 11 docs remaining**
- Reaching 50% (10 docs) requires just **G7 TileMap** — single doc away
- At current pace (~1 Godot doc/day), 50% by ~March 23

## 🟡 Core Concept Gaps

19 concept theory docs exist (was 18). combat-theory.md filled the #1 gap.

| Missing Concept | Relevant Guides | Priority | Notes |
|-----------------|----------------|----------|-------|
| **inventory-theory.md** | G10 §1 (MonoGame) | MEDIUM | Inventory/item systems referenced by 4 genres. Patterns are engine-agnostic |
| **save-system-theory.md** | G10 §3, G69 (MonoGame) | MEDIUM | Save/load referenced by 5 genres. G69 now exists as MonoGame guide; theory doc would be engine-agnostic |
| **economy-theory.md** | G65 (MonoGame) | LOW | Sink/faucet balance, dynamic pricing, currency design |
| **state-machine-theory.md** | G2 (Godot), G31 (MonoGame) | MEDIUM | FSM/HSM/pushdown theory — cross-engine fundamental |
| **narrative-theory.md** | G62 (MonoGame) | LOW | Branching story structures, dialogue tree patterns |

Core theory coverage: 19/24 identified topics (~79%) — up from 75%.

## 📊 Coverage Summary

### Genre Coverage (MonoGame)
- **Fully covered** (all required systems have guides): ALL 11 genres ✅
  - platformer, metroidvania, roguelike, top-down-rpg, visual-novel, fighting, bullet-hell, tower-defense, survival, strategy, puzzle
- **Overall**: **100%** of genre-referenced systems have MonoGame documentation

### Godot Coverage
- **Architecture**: 2/2 planned overview docs (100%)
- **Guides**: 6/~17 planned (35%)
- **Rules**: 1/1 (100%)
- **Overall**: **45%** of planned Godot module complete (up from 35%)
- **Critical missing**: TileMap — the only HIGH-priority gap remaining (Physics + Camera now done)
- **Velocity**: +2 docs since last update (G5 + G6)
- **50% milestone**: 1 doc away (G7 TileMap)

### Core Theory Coverage
- **Existing**: 19 concept docs covering physics, camera, animation, AI, audio, pathfinding, particles, procedural gen, networking, combat, fog of war, etc.
- **Missing**: 5 topics (inventory, save systems, economy, state machines, narrative)
- **Overall**: 19/24 identified topics (~79%)
- **Key fill**: combat-theory.md was the #1 priority gap (8/11 genres reference combat)

## 🎯 Next Priority (ranked)

### Godot (biggest gap — 45% done, target 50%)
1. **G7 TileMap** — TileMapLayer (4.3+), terrain system, autotiling. **50% milestone doc — single doc to hit target**

### Core Theory
2. **state-machine-theory.md** — cross-engine fundamental, both Godot G2 and MonoGame G31 exist as impl guides
3. **save-system-theory.md** — 5 genres reference save/load, G69 MonoGame guide now exists, theory would help Godot/Bevy
4. **inventory-theory.md** — 4 genres reference inventory, engine-agnostic patterns

### Godot (continued, MEDIUM priority)
5. **G8 Animation** — AnimationPlayer/AnimationTree, referenced by all action genres
6. **G11 Save/Load** — confirmed community demand from Godot Forum
7. **G16 Autoloads/Singletons** — global patterns, frequently asked
8. **G9 UI/Control nodes** — Container system, themes
9. **G14 Navigation** — NavigationServer2D

### MonoGame (COMPLETE ✅)
- No remaining gaps. All 11 genres fully covered. G69 elevated save/load from a G10 subsection to a full 113KB guide.

## 📈 Progress Tracking

| Date | Total | Core | MonoGame | Godot | Godot % | MonoGame Genre % | Core Theory % |
|------|-------|------|----------|-------|---------|------------------|---------------|
| 2026-03-17 | ~120 | 49 | 71 | 0 | 0% | ~75% | — |
| 2026-03-18 | ~122 | 49 | 73 | 0 | 0% | ~90% | — |
| 2026-03-19 | ~126 | 49 | 74 | 3 | 15% | ~93% | — |
| 2026-03-20 | 130 | 49 | 76 | 5 | 25% | ~95% | 75% |
| 2026-03-21 | 134 | 50 | 77 | 7 | 35% | 100% | 75% |
| **2026-03-22** | **138** | **51** | **78** | **9** | **45%** | **100%** | **~79%** |
