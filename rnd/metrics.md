# Metrics

## Git Stats — 2026-03-21 (6:00 AM)

| Metric | Value |
|---|---|
| Last commit | `db858c6` — docs: content validation results + lesson learned (5am cron) |
| Total commits | 43 |
| Files tracked | 209 |
| Repo size (.git) | 5.7M |
| Uncommitted changes | None |
| Branch | main |
| Build (tsc) | ✅ Clean |
| Tests | ✅ 58/58 pass |

## Git Stats — 2026-03-20 (4:00 PM)

| Metric | Value |
|---|---|
| Last commit | `6448449` — docs: README overhaul + CHANGELOG update + registry drafts |
| Total commits | 24 |
| Files tracked | 190+ |
| Repo size (.git) | 4.7M |
| Working tree (docs/) | 3.5M |
| Uncommitted changes | version bump (1.1.0) + CHANGELOG date + metrics + PROJECT_MEMORY |
| Branch | main |
| Build (tsc) | ✅ Clean |
| Tests | ✅ 36/36 pass |

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
| 2026-03-20 (Day 5 PM) | 130 | 5 | v1.1.0 prepped, module auto-discovery, CI/CD, README overhaul |
| 2026-03-21 (Day 6 AM) | 209 files | 7 | G4 Input, E2 GDScript vs C#, Stitch guide, E4 expansion, list_docs summary, client caching |

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
- **Tests:** ✅ 36/36 pass (0 fail)
- **Smoke test:** ✅ Server starts, discovers 2 modules (130 docs)
- **CI:** 3 GitHub Actions workflows (ci.yml, publish.yml, release.yml)
- **Release method:** Use `release.yml` workflow dispatch → creates GitHub Release → triggers `publish.yml` → npm publish with OIDC provenance

### What's in v1.1.0
- Module auto-discovery + `list_modules` tool
- Section extraction + `maxLength` for `get_doc`
- `docs/godot-arch/` — 5 Godot 4.4+ docs (E1, rules, G1-G3)
- MonoGame G64-G67 (Combat, Economy, Building, Object Pooling)
- Core networking-theory.md
- Cloudflare Workers API scaffold
- CI/CD pipeline (GitHub Actions)
- 36 tests (node:test)
- All search quality fixes (P1-P3)
- README overhaul (marketing-ready)
- 908 broken links fixed, dev mode bug fixed, error handling for all tool handlers
