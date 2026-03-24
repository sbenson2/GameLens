# Content Gap Analysis

Weekly comparison of genre-lookup system requirements vs available guides.
Last updated: 2026-03-24 (10am content gap cron)

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
| godot-arch | guides | 8 | — |
| godot-arch | root (rules) | 1 | — |
| **godot-arch total** | | **11** | **388K** |
| monogame-arch | architecture | 4 | — |
| monogame-arch | guides | 70 | — |
| monogame-arch | reference | 3 | — |
| monogame-arch | root (rules) | 1 | — |
| **monogame-arch total** | | **78** | **2.7M** |
| **GRAND TOTAL** | | **140** | **~4.1M** |

### Changes Since Last Update (2026-03-23)
- **No new docs created** since last analysis (Day 8-9 focused on standups + publish workflow)
- Doc count unchanged at 140
- Godot module unchanged at 55% (11/20)
- Core theory unchanged at ~79%
- **Day 9 with no content velocity** — first zero-doc day since project started
- npm v1.2.0 publish is now **Day 7 overdue** 🔴🔴

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

| Planned Doc | Status | Priority | Genre Need (genres requiring this) |
|-------------|--------|----------|-----|
| E1 Architecture Overview | ✅ Done | — | 16KB |
| E2 GDScript vs C# | ✅ Done | — | 34KB |
| godot-rules.md | ✅ Done | — | 14KB |
| G1 Scene Composition | ✅ Done | — | 15KB |
| G2 State Machine | ✅ Done | — | 38KB |
| G3 Signal Architecture | ✅ Done | — | 20KB |
| G4 Input Handling | ✅ Done | — | 43KB |
| G5 Physics & Collision | ✅ Done | — | 33KB |
| G6 Camera Systems | ✅ Done | — | 53KB |
| G7 TileMap & Terrain | ✅ Done | — | 80KB |
| G8 Animation Systems | ✅ Done | — | 51KB |
| **G9 UI/Control nodes** | ❌ Missing | **HIGH** | RPG, strategy, TD, puzzle, VN (5 genres) — Container system, themes, responsive layouts |
| **G10 Audio** | ❌ Missing | MEDIUM | VN + all genres indirectly — AudioStreamPlayer, bus layout, positional |
| **G11 Save/Load** | ❌ Missing | **HIGH** | roguelike, metroidvania, RPG, survival, VN (5 genres) — Resource serialization, ConfigFile, JSON. Confirmed community demand (Godot Forum Mar 18) |
| **G12 Shaders** | ❌ Missing | MEDIUM | Cross-cutting visual — CanvasItem shaders, visual shader editor |
| **G13 Particles** | ❌ Missing | LOW | bullet-hell, TD (2 genres) — GPUParticles2D, sub-emitters |
| **G14 Navigation** | ❌ Missing | MEDIUM | roguelike, TD, strategy (3 genres) — NavigationServer2D, avoidance |
| **G15 Networking** | ❌ Missing | LOW | (core need) — MultiplayerAPI, RPCs, authority |
| **G16 Autoloads/Singletons** | ❌ Missing | MEDIUM | Godot-specific architecture pattern, needed by every game |
| **G17 Export/Deploy** | ❌ Missing | LOW | Export templates, platform-specific settings |

**Godot completion: 11/20 (55%) — 9 docs remaining**
- 50% milestone reached 2026-03-22
- **No new Godot docs in 2 days** (Mar 23-24) — velocity stalled
- At prior pace (~1 Godot doc/day), 65% target was March 25 — now likely March 26-27
- Next HIGH priority: G9 UI/Control and G11 Save/Load

### Godot Genre Coverage Matrix

How well does the current Godot module serve each genre?

| Genre | Core Systems Covered by Godot Docs | Missing Godot-Specific | Coverage |
|-------|-----------------------------------|----------------------|----------|
| Platformer | Physics, Input, Camera, TileMap, Animation, State Machine | — | **95%** ✅ |
| Roguelike | TileMap (procgen), State Machine | UI, Save/Load, Navigation | 50% |
| Metroidvania | Physics, Input, Camera, Animation, State Machine | Save/Load, Scene transitions | 60% |
| Top-Down RPG | Input, Camera, TileMap | UI, Save/Load, Dialogue | 40% |
| Tower Defense | TileMap, Camera | UI, Navigation, Particles | 35% |
| Bullet Hell | Physics, Input, Camera, Animation | Particles, Pooling patterns | 50% |
| Puzzle | Input, State Machine | UI, Save/Load, Tweens | 30% |
| Survival | Physics, Input, TileMap, Camera | UI, Save/Load, Audio | 40% |
| Strategy | TileMap, Camera | UI, Navigation, Fog of War | 30% |
| Visual Novel | State Machine | UI, Save/Load, Audio, Dialogue | 15% |
| Fighting | Physics, Input, Animation, State Machine | — (mostly covered by core) | 70% |

**Observation**: Platformer and Fighting genres are well-served by current Godot docs. UI-heavy genres (RPG, Strategy, Puzzle, VN) are poorly served — G9 UI/Control would immediately boost 5 genre coverages. Save/Load (G11) would boost another 5.

## 🟡 Core Concept Gaps

19 concept theory docs exist. ui-theory.md expanded 8× on Day 8 (5KB → 41KB).

| Missing Concept | Relevant Guides | Priority | Notes |
|-----------------|----------------|----------|-------|
| **state-machine-theory.md** | G2 (Godot), G31 (MonoGame) | MEDIUM | FSM/HSM/pushdown theory — cross-engine fundamental |
| **inventory-theory.md** | G10 §1 (MonoGame) | MEDIUM | Inventory/item systems referenced by 4 genres |
| **save-system-theory.md** | G10 §3, G69 (MonoGame) | MEDIUM | Save/load referenced by 5 genres |
| **economy-theory.md** | G65 (MonoGame) | LOW | Sink/faucet balance, dynamic pricing |
| **narrative-theory.md** | G62 (MonoGame) | LOW | Branching story structures, dialogue tree patterns |

Core theory coverage: 19/24 identified topics (~79%) — unchanged since March 22.

## 📊 Coverage Summary

### Genre Coverage (MonoGame)
- **Fully covered**: ALL 11 genres ✅
- **Overall**: **100%** of genre-referenced systems have MonoGame documentation

### Godot Coverage
- **Architecture**: 2/2 planned overview docs (100%)
- **Guides**: 8/~17 planned (47%)
- **Rules**: 1/1 (100%)
- **Overall**: **55%** of planned Godot module complete (unchanged)
- **Critical missing**: G9 UI/Control (5 genres), G11 Save/Load (5 genres)
- **Velocity**: 0 new docs in 2 days (stalled)
- **50% milestone**: ✅ REACHED (2026-03-22)

### Core Theory Coverage
- **Existing**: 19 concept docs
- **Missing**: 5 topics (state-machine, inventory, save-system, economy, narrative)
- **Overall**: 19/24 identified topics (~79%)

## 🎯 Next Priority (ranked by genre impact)

### Godot (target 65% by March 26-27)
1. **G9 UI/Control nodes** — Unlocks 5 genre coverages (RPG +30%, Strategy +25%, TD +20%, Puzzle +25%, VN +30%). **Single highest-impact missing doc.**
2. **G11 Save/Load** — Unlocks 5 genre coverages (roguelike +15%, metroidvania +15%, RPG +20%, survival +15%, VN +25%). Confirmed community demand.
3. **G14 Navigation** — Unlocks 3 genre coverages (roguelike +10%, TD +15%, strategy +15%).
4. **G10 Audio** — Universal need, VN-critical.
5. **G16 Autoloads/Singletons** — Architecture pattern used by every game.
6. **G12 Shaders** — Visual polish, cross-genre.

### Core Theory
7. **state-machine-theory.md** — Cross-engine fundamental, complements G2 (Godot) + G31 (MonoGame)
8. **save-system-theory.md** — 5 genres reference save/load
9. **inventory-theory.md** — 4 genres reference inventory

### MonoGame (COMPLETE ✅)
- No remaining gaps.

## ⚠️ Velocity & Distribution Concerns

| Metric | Status | Concern Level |
|--------|--------|---------------|
| Content velocity | 0 docs/day (last 2 days) | 🟡 Stalled — was averaging 3.1/day |
| npm publish | v1.0.0 (Day 7 overdue for v1.2.0) | 🔴🔴 Critical blocker |
| MCP registries | 0 submitted (Day 7 overdue) | 🔴 No external discovery |
| Godot 65% target | Was March 25, now likely March 26-27 | 🟡 Slipping |
| Total docs since Day 7 | 0 new (only standups) | 🔴 Two lost production days |

**Assessment**: Content creation has paused while publish/distribution issues compound. The product is strong (140 docs, 175 tests, 4.2M content) but invisible to the market. Every day without npm v1.2.0 wastes the STS2 marketing window.

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
| **2026-03-24** | **140** | **51** | **78** | **11** | **55%** | **100%** | **~79%** | **0** ⚠️ |
