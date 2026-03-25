# Metrics

## Git Stats — 2026-03-25 (6:00 AM)

| Metric | Value |
|---|---|
| Total commits | 129 |
| Tracked files | 258 |
| Docs | 147 |
| Tests | 190/190 pass (1.50s, 28 suites) |
| Build | ✅ Clean (`tsc --noEmit`) |
| .git size | 12M |
| Branch | main |
| Package version | v1.3.0 |
| npm published | v1.0.0 (Day 9 overdue) |
| Working tree | Clean after commit (31e04cc) |
| Remote sync | ⛔ **GitHub account suspended** — `git push` returns 403. All work committed locally. |

## Content Stats — 2026-03-24 (10:00 AM)

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

## Coverage Stats — 2026-03-24

| Metric | Value | Change |
|---|---|---|
| MonoGame genre coverage | **100%** (11/11 genres fully covered) | unchanged |
| Godot module completion | **55%** (11/20 planned docs) | unchanged (stalled 2 days) |
| Core theory coverage | **~79%** (19/24 identified topics) | unchanged |
| Missing core theory | state-machine, inventory, save-system, economy, narrative | unchanged |
| Missing Godot (HIGH priority) | **G9 UI/Control, G11 Save/Load** (both serve 5 genres) | unchanged |
| Missing MonoGame | **NONE** ✅ | unchanged |
| 50% Godot milestone | ✅ REACHED (2026-03-22) | — |

## Godot Genre Coverage Heat Map (NEW)

| Genre | Godot Coverage | Key Missing Godot Doc |
|-------|---------------|----------------------|
| Platformer | **95%** ✅ | — |
| Fighting | **70%** | — (core covers most) |
| Metroidvania | 60% | Save/Load |
| Roguelike | 50% | UI, Save/Load, Navigation |
| Bullet Hell | 50% | Particles |
| Top-Down RPG | 40% | **UI**, Save/Load |
| Survival | 40% | **UI**, Save/Load |
| Tower Defense | 35% | **UI**, Navigation |
| Puzzle | 30% | **UI**, Save/Load |
| Strategy | 30% | **UI**, Navigation |
| Visual Novel | 15% | **UI**, Save/Load, Audio |

**G9 UI/Control is the single highest-leverage missing doc** — would immediately boost 5 genre coverages by 20-30% each.

## Growth Trajectory

| Date | Total Docs | Godot Docs | Godot % | MonoGame Genre % | Key Additions |
|------|-----------|------------|---------|------------------|---------------|
| 2026-03-17 (Day 2) | ~120 | 0 | 0% | ~75% | G64 Combat, link fixes |
| 2026-03-18 (Day 3) | ~122 | 0 | 0% | ~90% | G65 Economy, E8, image fix |
| 2026-03-19 (Day 4) | ~126 | 3 | 15% | ~93% | G66 Building, Godot E1/rules/G1 |
| 2026-03-20 (Day 5) | 130 | 5 | 25% | ~95% | G67 Pooling, G2/G3, networking, Workers, CI/CD |
| 2026-03-21 (Day 6) | 134 | 7 | 35% | 100% | G4 Input, E2 GDScript, G68 Puzzle, Stitch, caching |
| 2026-03-22 (Day 7) | 138 | 9 | 45% | 100% | G5 Physics, G6 Camera, combat-theory, G69 Save/Load |
| 2026-03-23 (Day 8) | 140 | 11 | 55% | 100% | G7 TileMap (80KB), G8 Animation (51KB), ui-theory 8× |
| **2026-03-24 (Day 9)** | **140** | **11** | **55%** | **100%** | **No new docs (standups + publish workflow only)** ⚠️ |

## Velocity

| Period | Docs Created | Avg/Day |
|--------|-------------|---------|
| Days 2-3 (Mar 17-18) | 4 | 2.0 |
| Day 4 (Mar 19) | 4 | 4.0 |
| Day 5 (Mar 20) | 4 | 4.0 |
| Day 6 (Mar 21) | 4 | 4.0 |
| Day 7 (Mar 22) | 4 | 4.0 |
| Day 8 (Mar 23) | 2 (+major expansion) | 2.0 |
| Day 9 (Mar 24) | 0 | 0.0 ⚠️ |
| **Week 1 total (9 days)** | **22** | **2.4** |

## Distribution Blockers — 🔴 CRITICAL

| Blocker | Days Overdue | Impact |
|---------|-------------|--------|
| npm v1.2.0 publish | **7 days** | No external users can access Day 5-9 improvements |
| MCP registry submissions | **7 days** | Zero discovery surface outside GitHub |
| Launch blog post | **4 days** (was target Thursday Mar 20) | No community awareness |
| STS2 marketing window | Fading | Godot hype cycle from STS2 $92M won't last forever |

## Key Milestones

- ✅ 2026-03-17: First content doc (G64 Combat)
- ✅ 2026-03-19: Godot module started (3 docs)
- ✅ 2026-03-19: npm v1.0.0 published
- ✅ 2026-03-20: v1.1.0 prepped (not published)
- ✅ 2026-03-21: **MonoGame 100% genre coverage** (G68 closed last gaps)
- ✅ 2026-03-22: Godot 45% (9/20 docs)
- ✅ 2026-03-22: **50% Godot milestone REACHED** (G7 TileMap)
- ✅ 2026-03-22: Core theory at ~79% (combat-theory)
- ✅ 2026-03-23: Godot 55% (G8 Animation) + ui-theory 8× expansion
- ⏳ Next: **npm v1.2.0 publish** — 🔴🔴 Day 7 overdue
- ⏳ Next: **Godot 65%** — G9 UI/Control + G11 Save/Load (slipped to ~Mar 26-27)
- ⏳ Next: MCP registry submissions + launch post

---

## Git Stats — 2026-03-24 (10:00 AM)

| Metric | Value |
|---|---|
| Last commit | `7f16d8e` — standup: Day 9 Tuesday |
| Total commits | ~103 |
| Files tracked | ~241 |
| Branch | main |
| Build (tsc) | ✅ Clean |
| Tests | ✅ 175/175 pass (1.3s, 27 suites) |
| npm (published) | v1.0.0 (v1.2.0 tagged, NOT published — **Day 7**) |

---

## Previous Snapshots

### Content Stats — 2026-03-23 (10:00 AM)

| Module | Category | Count | Size |
|--------|----------|-------|------|
| core total | | 51 | 1.0M |
| godot-arch total | | 11 | 397K |
| monogame-arch total | | 78 | 2.7M |
| **GRAND TOTAL** | | **140** | **~4.2M** |

### Git Stats — 2026-03-23 (6:00 AM)

| Metric | Value |
|---|---|
| Total commits | 101 |
| Tests | 175/175 pass |
| npm | v1.0.0 (Day 6 overdue) |

### Content Stats — 2026-03-22 (10:00 AM)

| GRAND TOTAL | 138 | ~4.1M |

### Git Stats — 2026-03-22 (4:00 PM)

| Total commits | 86 |
| Tests | 164/164 pass |

---

# Publish Metrics

## v1.0.0 — Published to npm (2026-03-19)

- **Version:** 1.0.0
- **Package size:** 992.4 kB (compressed tarball)
- **Unpacked size:** 3.3 MB
- **Total files:** 177
- **Build:** ✅ Clean

## v1.2.0 — Tagged, NOT Published (Day 7 overdue)

- **Version:** 1.2.0
- **Status:** Tagged and pushed. NOT on npm.
- **Build:** ✅ Clean
- **Tests:** ✅ 175/175 pass
- **What's blocked:** GitHub Release creation needed to trigger publish.yml, OR manual `npm publish`.
- **Content since v1.0.0:** 8 new tools, 20+ new docs, 11 Godot docs, 175 tests (from 0), CI/CD, Workers API scaffold
