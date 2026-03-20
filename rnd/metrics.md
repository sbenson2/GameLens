# Metrics

## Git Stats — 2026-03-20 (10:00 AM)

| Metric | Value |
|---|---|
| Last commit | `9055ce1` — docs: audit #6 — fix 6 issues across 5 docs |
| Total commits | 20 |
| Files tracked | 186+ |
| Repo size (.git) | 4.5M |
| Working tree (docs/) | 3.5M |
| Uncommitted changes | 4 files (PROJECT_MEMORY.md, competitor-log.md, gaps.md, triage.md) |
| Branch | main |
| Build (tsc --noEmit) | ✅ Clean |

## Content Stats — 2026-03-20 (10:00 AM)

| Module | Docs | Size | Notes |
|--------|------|------|-------|
| core/ai-workflow | 2 | — | E5 + gamedev-rules |
| core/concepts | 18 | — | Theory docs (incl. networking-theory added 3/20) |
| core/game-design | 5 | — | C1, C2, E6, E7, R4 |
| core/programming | 4 | — | G11, G12, G14, G18 |
| core/project-management | 18 | — | P0-P15, E4, E9 |
| core/session | 2 | — | formatting, session-prompt |
| **core total** | **49** | **972K** | |
| godot-arch/architecture | 1 | — | E1 overview |
| godot-arch/guides | 3 | — | G1-G3 (scene, state machine, signals) |
| godot-arch/root | 1 | — | godot-rules.md |
| **godot-arch total** | **5** | **108K** | **25% of ~20 planned** |
| monogame-arch/architecture | 4 | — | E1-E3, E8 |
| monogame-arch/guides | 68 | — | G1-G67 + P12 |
| monogame-arch/reference | 3 | — | R1-R3 |
| monogame-arch/root | 1 | — | monogame-arch-rules |
| **monogame-arch total** | **76** | **2.4M** | |
| **GRAND TOTAL** | **130** | **~3.5M** | |

## Coverage Stats — 2026-03-20

| Metric | Value |
|---|---|
| MonoGame genre coverage | ~95% (10/11 genres fully covered, puzzle has 2 minor gaps) |
| Godot module completion | 25% (5/20 planned docs) |
| Core theory coverage | 75% (18/24 identified topics) |
| Missing core theory | combat, inventory, save-system, economy, state-machine, narrative |
| Missing Godot (HIGH priority) | Input, Physics, GDScript vs C#, Camera, TileMap |
| Missing MonoGame | Undo/Redo (puzzle), Level Loading (puzzle) |

## Growth Trajectory

| Date | Total Docs | Godot Docs | Key Additions |
|------|-----------|------------|---------------|
| 2026-03-17 (Day 2) | ~120 | 0 | G64 Combat, link fixes |
| 2026-03-18 (Day 3) | ~122 | 0 | G65 Economy, E8, image fix |
| 2026-03-19 (Day 4) | ~126 | 3 | G66 Building, Godot E1/rules/G1 |
| 2026-03-20 (Day 5 AM) | 130 | 5 | G67 Pooling, Godot G2/G3, networking-theory, Workers scaffold |

---

# Publish Metrics

## v1.0.0 — Published to npm (2026-03-19)

- **Version:** 1.0.0
- **Package size:** 992.4 kB (compressed tarball)
- **Unpacked size:** 3.3 MB
- **Total files:** 177
- **Build:** ✅ Clean

### Blocker for v1.1.0
- Need to publish updated version with Godot module, section extraction, G64-G67, Workers
- npm auth status: needs verification

### v1.1.0 would include
- `docs/godot-arch/` — 5 Godot docs (E1, rules, G1-G3)
- Section extraction + maxLength for get_doc
- G64-G67 MonoGame guides
- networking-theory.md
- All search quality fixes (P1-P3)
