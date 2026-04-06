# Metrics

## Git Stats — 2026-03-25 (10:00 AM)

| Metric | Value |
|---|---|
| Total commits | ~130 |
| Tracked files | 258 |
| Docs | 147 |
| Tests | 190/190 pass (1.50s, 28 suites) |
| Build | ✅ Clean (`tsc --noEmit`) |
| .git size | 12M |
| Branch | main |
| Package version | v1.3.0 |
| npm published | v1.0.0 (Day 9 overdue) |
| Remote sync | ⛔ **GitHub account suspended** — all work committed locally, cannot push |

## Content Stats — 2026-03-25 (10:00 AM)

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

## Coverage Stats — 2026-03-25

| Metric | Value | Change (from Mar 24) |
|---|---|---|
| MonoGame genre coverage | **100%** (11/11) | unchanged |
| Godot module completion | **80%** (16/20 planned docs) | ⬆️ from 55% (+25 points!) |
| Core theory coverage | **~79%** (19/24) | unchanged |
| Missing core theory | state-machine, inventory, save-system, economy, narrative | unchanged |
| Missing Godot (HIGH priority) | **G14 Navigation** (3 genres) | ⬇️ down from 2 HIGH gaps |
| Missing Godot (remaining) | G14 Navigation, G15 Particles, G16 Autoloads, G17 Export | 4 remaining |
| Missing MonoGame | **NONE** ✅ | unchanged |
| 50% Godot milestone | ✅ REACHED (2026-03-22) | — |
| **80% Godot milestone** | **✅ REACHED (2026-03-25)** | **NEW** |

## Godot Genre Coverage Heat Map (Updated 2026-03-25)

| Genre | Godot Coverage | Key Missing Godot Doc | Change |
|-------|---------------|----------------------|--------|
| Platformer | **98%** ✅ | — | ⬆️ from 95% |
| Fighting | **90%** ✅ | — | ⬆️ from 70% |
| Metroidvania | **80%** | Navigation | ⬆️ from 60% |
| Roguelike | **70%** | Navigation | ⬆️ from 50% |
| Bullet Hell | **70%** | Particles | ⬆️ from 50% |
| Puzzle | **70%** ✅ | — | ⬆️ from 30% |
| Top-Down RPG | **65%** | Navigation, Dialogue | ⬆️ from 40% |
| Survival | **65%** | Navigation | ⬆️ from 40% |
| Visual Novel | **60%** | Dialogue | ⬆️ from 15% |
| Tower Defense | **55%** | Navigation | ⬆️ from 35% |
| Strategy | **55%** | Navigation | ⬆️ from 30% |
| **Average** | **~71%** | | ⬆️ from ~47% |

**G9 UI + G11 Save/Load impact confirmed**: Visual Novel jumped +45 points, Puzzle +40, Strategy +25. Navigation (G14) is the single remaining high-impact gap.

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
| 2026-03-24 (Day 9) | 140 | 11 | 55% | 100% | No new docs (standups + publish workflow only) ⚠️ |
| **2026-03-25 (Day 10)** | **147** | **16** | **80%** | **100%** | **G9 UI, G10 Audio, G11 Save/Load, G12 Shaders, G13 Networking, G70, G71** |

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
| **Day 10 (Mar 25)** | **7** | **7.0** ✅ |
| **Overall (10 days)** | **29** | **2.9** |

## Distribution Blockers — 🔴🔴🔴 CRITICAL

| Blocker | Days Overdue | Impact |
|---------|-------------|--------|
| **GitHub account SUSPENDED** | Active | Blocks ALL external operations (push, CI/CD, npm OIDC, registry) |
| npm v1.2.0+ publish | **9 days** | 147 docs locally, only 120~ on npm |
| MCP registry submissions | **9 days** | Zero discovery surface outside GitHub |
| STS2 marketing window | Fading | Godot hype cycle narrowing |

## Key Milestones

- ✅ 2026-03-17: First content doc (G64 Combat)
- ✅ 2026-03-19: Godot module started (3 docs)
- ✅ 2026-03-19: npm v1.0.0 published
- ✅ 2026-03-21: **MonoGame 100% genre coverage** (G68 closed last gaps)
- ✅ 2026-03-22: **50% Godot milestone** (G7 TileMap)
- ✅ 2026-03-22: Core theory at ~79% (combat-theory)
- ✅ 2026-03-23: Godot 55% (G8 Animation) + ui-theory 8× expansion
- ✅ **2026-03-25: 80% Godot milestone** (G9-G13, +5 Godot docs)
- ⏳ Next: **Resolve GitHub suspension** — 🔴🔴🔴
- ⏳ Next: **npm publish** — immediately when unblocked
- ⏳ Next: **Godot 90%** — G14 Navigation + G16 Autoloads (target Mar 27)
- ⏳ Next: MCP registry submissions + launch post

---

## Previous Snapshots

### Git Stats — 2026-03-25 (6:00 AM)

| Metric | Value |
|---|---|
| Total commits | 129 |
| Tracked files | 258 |
| Docs | 147 |
| Tests | 190/190 pass |
| npm published | v1.0.0 (Day 9 overdue) |
| Remote sync | ⛔ GitHub suspended |

### Content Stats — 2026-03-24 (10:00 AM)

| Module | Count | Size |
|--------|-------|------|
| core total | 51 | 1.0M |
| godot-arch total | 11 | 388K |
| monogame-arch total | 78 | 2.7M |
| **GRAND TOTAL** | **140** | **~4.1M** |

### Content Stats — 2026-03-23 (10:00 AM)

| GRAND TOTAL | 140 | ~4.2M |

### Content Stats — 2026-03-22 (10:00 AM)

| GRAND TOTAL | 138 | ~4.1M |

---

# Publish Metrics

## v1.0.0 — Published to npm (2026-03-19)

- **Version:** 1.0.0
- **Package size:** 992.4 kB (compressed tarball)
- **Unpacked size:** 3.3 MB
- **Total files:** 177
- **Build:** ✅ Clean

## v1.3.0 — Local Only (GitHub SUSPENDED)

- **Version:** 1.3.0
- **Status:** Committed locally. Cannot push or publish.
- **Build:** ✅ Clean
- **Tests:** ✅ 190/190 pass
- **Content since v1.0.0:** 10 tools, 27+ new docs, 16 Godot docs (from 0), 190 tests (from 0), CI/CD, Workers API, analytics
- **What's blocked:** GitHub account suspension prevents push, CI/CD, npm OIDC publish, registry submissions
