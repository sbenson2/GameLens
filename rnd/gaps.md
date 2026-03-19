# Content Gap Analysis

Weekly comparison of genre-lookup system requirements vs available guides.
Last updated: 2026-03-19

---

## Methodology

Cross-referenced all `requiredSystems` from `src/core/genre.ts` (11 genres) against existing docs in `docs/monogame-arch/guides/` and `docs/core/concepts/`.

## ✅ Filled Gaps

| System | Referenced By (genres) | Guide |
|--------|----------------------|-------|
| Combat & Damage (hitbox/hurtbox, health, knockback, projectiles) | roguelike, metroidvania, top-down-rpg, bullet-hell, survival, fighting, tower-defense, strategy (8/11) | **G64** (created 2026-03-17) |
| Economy/Currency + Shop System | tower-defense, survival (2/11) | **G65** (created 2026-03-18) |
| Building/Placement System | survival, strategy (2/11) | **G66** (created 2026-03-19) |
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

## 🔴 Remaining Gaps — No Dedicated Guide

| System | Referenced By | Priority | Notes |
|--------|-------------|----------|-------|
| **Object Pooling (dedicated)** | bullet-hell, tower-defense | HIGH | G64 §9 covers combat pooling; G23 has particle pooling. No standalone guide for general pooling patterns (audio, spawn, VFX). |
| ~~**Economy/Currency System**~~ | ~~tower-defense, survival~~ | ~~MEDIUM~~ | ✅ FILLED → G65 (2026-03-18) |
| ~~**Building/Placement System**~~ | ~~survival, strategy~~ | ~~MEDIUM~~ | ✅ FILLED → G66 (2026-03-19) |
| **Undo/Redo (puzzle-focused)** | puzzle | MEDIUM | G10 §8 covers command pattern. Could use a puzzle-specific extension with state snapshots. |
| **Level Editor / Level Loading** | puzzle | LOW | G29 (Game Editor) exists but is for dev tools. Puzzle games need runtime level select + loading. |

## 📊 Coverage Summary

- **Genres fully covered** (all required systems have guides): platformer, metroidvania, roguelike, top-down-rpg, visual-novel, fighting
- **Genres mostly covered** (1-2 gaps): bullet-hell, puzzle
- **Overall**: ~93% of genre-referenced systems have dedicated documentation

## 🎯 Next Priority

1. **General Object Pooling guide** — Consolidate patterns from G23 and G64 into a reusable reference. Key for bullet-hell and tower-defense.
2. **Undo/Redo (puzzle-focused)** — Extend G10 §8 command pattern with state snapshots for puzzle games
3. **Level Editor / Level Loading (puzzle)** — Runtime level select + loading for puzzle games
