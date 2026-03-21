# Metrics

## Git Stats — 2026-03-21 (4:00 PM)

| Metric | Value |
|---|---|
| Last commit | `ff2898e` — release: finalize v1.1.0 |
| Total commits | 55+ (since v1.0.0: 31) |
| Files tracked | 216 |
| Repo size (.git) | 6.3M |
| Branch | main |
| Build (tsc) | ✅ Clean |
| Tests | ✅ 84/84 pass |
| npm (published) | v1.0.0 (v1.1.0 prepped, NOT published) |
| npm pack | 225 files verified |

## Content Stats — 2026-03-21 (10:00 AM)

| Module | Category | Count | Size |
|--------|----------|-------|------|
| core | ai-workflow | 2 | — |
| core | concepts | 18 | — |
| core | game-design | 6 | +1 (Stitch UI) |
| core | programming | 4 | — |
| core | project-management | 18 | — |
| core | session | 2 | — |
| **core total** | | **50** | **1.0M** |
| godot-arch | architecture | 2 | +1 (E2 GDScript vs C#) |
| godot-arch | guides | 4 | +1 (G4 Input) |
| godot-arch | root (rules) | 1 | — |
| **godot-arch total** | | **7** | **188K** |
| monogame-arch | architecture | 4 | — |
| monogame-arch | guides | 69 | +1 (G68 Puzzle) |
| monogame-arch | reference | 3 | — |
| monogame-arch | root (rules) | 1 | — |
| **monogame-arch total** | | **77** | **2.6M** |
| **GRAND TOTAL** | | **134** | **~3.8M** |

## Coverage Stats — 2026-03-21

| Metric | Value | Change |
|---|---|---|
| MonoGame genre coverage | **100%** (11/11 genres fully covered) | ↑ from 95% |
| Godot module completion | **35%** (7/20 planned docs) | ↑ from 25% |
| Core theory coverage | 75% (18/24 identified topics) | unchanged |
| Missing core theory | combat, inventory, save-system, economy, state-machine, narrative | unchanged |
| Missing Godot (HIGH priority) | Physics, Camera, TileMap | E2 + G4 filled |
| Missing MonoGame | **NONE** ✅ | G68 closed last gaps |

## Growth Trajectory

| Date | Total Docs | Godot Docs | Godot % | MonoGame Genre % | Key Additions |
|------|-----------|------------|---------|------------------|---------------|
| 2026-03-17 (Day 2) | ~120 | 0 | 0% | ~75% | G64 Combat, link fixes |
| 2026-03-18 (Day 3) | ~122 | 0 | 0% | ~90% | G65 Economy, E8, image fix |
| 2026-03-19 (Day 4) | ~126 | 3 | 15% | ~93% | G66 Building, Godot E1/rules/G1 |
| 2026-03-20 (Day 5) | 130 | 5 | 25% | ~95% | G67 Pooling, G2/G3, networking, Workers, CI/CD |
| **2026-03-21 (Day 6)** | **134** | **7** | **35%** | **100%** | **G4 Input, E2 GDScript, G68 Puzzle, Stitch, caching** |

## Velocity

| Period | Docs Created | Avg/Day |
|--------|-------------|---------|
| Days 2-3 (Mar 17-18) | 4 | 2.0 |
| Day 4 (Mar 19) | 4 | 4.0 |
| Day 5 (Mar 20) | 4 | 4.0 |
| Day 6 (Mar 21) | 4 | 4.0 |
| **Week 1 total** | **16** | **3.2** |

## Key Milestones

- ✅ 2026-03-17: First content doc (G64 Combat)
- ✅ 2026-03-19: Godot module started (3 docs)
- ✅ 2026-03-19: npm v1.0.0 published
- ✅ 2026-03-20: v1.1.0 prepped (not published)
- ✅ 2026-03-21: **MonoGame 100% genre coverage** (G68 closed last gaps)
- ✅ 2026-03-21: **Godot module at 35%** (7/20 docs)
- ⏳ Next: Godot 50% (needs G5 Physics, G6 Camera, G7 TileMap)
- ⏳ Next: npm v1.1.0 publish (Day 3 of being blocked)
- ⏳ Next: MCP registry submissions

---

## Previous Snapshots

### Git Stats — 2026-03-20 (4:00 PM)

| Metric | Value |
|---|---|
| Last commit | `6448449` — docs: README overhaul + CHANGELOG update + registry drafts |
| Total commits | 24 |
| Files tracked | 190+ |
| Repo size (.git) | 4.7M |
| Working tree (docs/) | 3.5M |
| Build (tsc) | ✅ Clean |
| Tests | ✅ 36/36 pass |

---

# Publish Metrics

## v1.0.0 — Published to npm (2026-03-19)

- **Version:** 1.0.0
- **Package size:** 992.4 kB (compressed tarball)
- **Unpacked size:** 3.3 MB
- **Total files:** 177
- **Build:** ✅ Clean

## v1.1.0 — Prepped (2026-03-20)

- **Version:** 1.1.0
- **Status:** Version bumped, CHANGELOG dated, build + tests pass. Ready for `npm publish`.
- **Build:** ✅ Clean
- **Tests:** ✅ 58/58 pass (36→58 with new module/cache tests)
- **Smoke test:** ✅ Server starts, discovers 2 modules (134 docs)
- **CI:** 3 GitHub Actions workflows (ci.yml, publish.yml, release.yml)
- **Release method:** Use `release.yml` workflow dispatch → creates GitHub Release → triggers `publish.yml` → npm publish with OIDC provenance

### What's in v1.1.0
- Module auto-discovery + `list_modules` tool
- Section extraction + `maxLength` for `get_doc`
- `list_docs` summary mode
- Client-side caching for remote Pro content
- `docs/godot-arch/` — 7 Godot 4.4+ docs (E1-E2, rules, G1-G4)
- MonoGame G64-G68 (Combat, Economy, Building, Object Pooling, Puzzle Systems)
- Core: networking-theory, Stitch UI workflow
- 58/58 tests (up from 0 at v1.0.0)
- CI/CD infrastructure (3 workflows)
