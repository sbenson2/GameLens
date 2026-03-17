# Doc Quality Audit Log

Daily audit of 3-5 random docs for: outdated API references, broken internal doc links, consistency with current engine versions, formatting issues.

---

## 2026-03-17

**BULK FIX: Broken relative links (908 links across 46 files)**

The systemic `../G/`, `../R/`, `../E/`, `../C/` broken link pattern identified on 2026-03-16 has been fixed. Wrote a Python script (`rnd/fix_links.py`) that:
1. Built a map of all `.md` files by basename
2. Found all `../X/filename.md` single-letter directory references
3. Computed correct relative paths from each source file to the actual target
4. Rewrote all 908 broken links in 46 files

**Files changed (55 total, 697 lines):**
- `docs/core/project-management/`: P0, P1, P2, P3, P4, P5, P6, P7, P8, P9, P10, P11, P12, P13, E4
- `docs/core/game-design/`: C1, C2, E6, E7, R4
- `docs/core/ai-workflow/`: E5
- `docs/core/programming/`: G11
- `docs/monogame-arch/architecture/`: E1, E2, E3
- `docs/monogame-arch/guides/`: G1, G2, G3, G4, G5, G6, G7, G8, G9, G10, G11, G13, G15, G16, G24, G26, G29, G30, G31, G32, G36, G44, G52, G53, G59, G61, G62
- `docs/monogame-arch/reference/`: R1, R2, R3

**Remaining unresolvable links (E8_monogamestudio_postmortem.md — file doesn't exist):**
- `docs/core/project-management/P10_integration_map.md` (1 ref)
- `docs/core/project-management/P0_master_playbook.md` (1 ref)
- `docs/core/project-management/E4_project_management.md` (1 ref)
- `docs/core/project-management/E9_solo_dev_playbook.md` (1 ref)
- `docs/core/ai-workflow/E5_ai_workflow.md` (1 ref)
- `docs/monogame-arch/architecture/E2_nez_dropped.md` (1 ref)
- `docs/monogame-arch/architecture/E3_engine_alternatives.md` (1 ref)
- `docs/monogame-arch/guides/G29_game_editor.md` (1 ref)
- `docs/monogame-arch/guides/G30_game_feel_tooling.md` (1 ref)

These 9 references point to `E8_monogamestudio_postmortem.md` which was never created. Either the doc needs to be written or the references removed.

**Other known issues NOT fixed this run:**
- Missing images (`roguelike.png`, `physics.png`, `tilemap.png`) — `img/` dir doesn't exist
- G3 API contradiction (Aether `SetRestitution`/`SetFriction`)
- P12 in `core/` but is MonoGame-specific

---

## 2026-03-16

**Audited 5 docs** (2 core, 3 monogame-arch):

---

### 1. `core/concepts/camera-theory.md`

**Status: ✅ Clean**

- No API references (engine-agnostic theory doc) — nothing to go stale
- No internal doc links (only a vague "see the relevant engine module" at the end)
- Markdown formatting is solid; consistent header hierarchy, clean code blocks
- **Minor:** No front-matter/category line like other docs use (e.g., `> **Category:** Concept`). Low priority.

---

### 2. `core/project-management/P12_performance_budget.md`

**Status: 🔴 Broken links + misplaced content**

**Broken internal doc links (CRITICAL):**
All relative links use `../G/G33_profiling_optimization.md` style paths, but `core/` has no `G/` subdirectory. The `G*` guides live under `monogame-arch/guides/`. These links are dead:
- `../G/G33_profiling_optimization.md` (referenced 6 times)
- `../G/G16_debugging.md` (referenced 2 times)
- `../G/G3_physics_and_collision.md` (referenced 2 times)
- `../G/G32_deployment_platform_builds.md` (referenced 2 times)

**Broken image:**
- `![](../img/roguelike.png)` — no `img/` directory exists anywhere under `docs/`

**Module placement issue:**
- This doc lives in `core/` but is heavily MonoGame-specific (SpriteBatch, MonoGame.Extended, Arch ECS, .NET GC, Content.Load\<Texture2D\>). Should either be in `monogame-arch/` or split into engine-agnostic theory (core) + MonoGame-specific budgets (monogame-arch).

**Formatting:** Excellent overall — well-structured TOC, tables, code blocks.

---

### 3. `monogame-arch/architecture/E1_architecture_overview.md`

**Status: ⚠️ Broken relative links + version notes**

**Broken internal doc links:**
Uses `../R/R1_library_stack.md` and `../G/G1_custom_code_recipes.md` patterns. From `architecture/`, `../R/` resolves to `monogame-arch/R/` which doesn't exist — the actual paths are `../reference/R1_library_stack.md` and `../guides/G1_custom_code_recipes.md`.
- `../R/R1_library_stack.md` → should be `../reference/R1_library_stack.md`
- `../G/G1_custom_code_recipes.md` → should be `../guides/G1_custom_code_recipes.md`
- `../R/R3_project_structure.md` → should be `../reference/R3_project_structure.md`
- `./E2_nez_dropped.md` ✅ (correct — same directory)

**Version references to verify:**
- Arch ECS v2.1.0 — listed as current. Arch v2.x is the latest stable line as of early 2026. ✅
- MonoGame 3.8.5+ — current MonoGame stable is 3.8.2/3.8.3, with 3.8.6 in development. The doc says "nothing blocks .NET 10 or MonoGame 3.8.5+" which references a version that hasn't shipped yet. ⚠️ Aspirational, but could confuse readers.
- .NET 10 — mentioned as the runtime target. .NET 10 is the current preview/RC for 2025. May need updating once it's officially released. Minor.

**Formatting:** Clean, good use of Mermaid diagram, tables.

---

### 4. `monogame-arch/guides/G3_physics_and_collision.md`

**Status: ⚠️ Minor issues**

**Broken image:**
- `![](../img/physics.png)` — `img/` directory doesn't exist under `monogame-arch/`

**Internal links:** OK (uses `./G1_custom_code_recipes.md` and `../R/R2_capability_matrix.md` — wait, `../R/` is the same broken pattern as E1). But checking: from `guides/`, `../R/` would be `monogame-arch/R/` which doesn't exist.
- `../R/R2_capability_matrix.md` → should be `../reference/R2_capability_matrix.md` **(BROKEN)**

**API accuracy:**
- Aether.Physics2D v2.2.0: namespace `nkast.Aether.Physics2D` is correct ✅
- Section 4 "Common Gotchas" #4 says `Body.SetRestitution(float)` etc. are "Removed obsolete methods in v2.2.0" but the code examples in the same section use `ground.SetRestitution(0.3f)` and `ground.SetFriction(0.5f)`. **Contradicts itself** — either the methods exist or they were removed. **(API inconsistency)**
- MonoGame.Extended v5.3.1 referenced — plausible for the project's timeline. ✅
- `Position` component defined differently in Section 1 (`record struct Position(float X, float Y)`) vs Section 8 ECS integration further down. Not in this doc but could conflict with G37. Minor.

**Formatting:** Solid. Good code examples, tables, section numbering.

---

### 5. `monogame-arch/guides/G37_tilemap_systems.md`

**Status: ⚠️ Minor issues**

**Broken image:**
- `![](../img/tilemap.png)` — same missing `img/` directory

**Internal links:**
- `./G2_rendering_and_graphics.md` ✅
- `./G8_content_pipeline.md` ✅
- `./G3_physics_and_collision.md` ✅
- `./G28_top_down_perspective.md` ✅
- All footer links are also relative `./` within `guides/` — correct.

**API notes:**
- `MonoGame.Extended.Tiled` usage looks correct for Extended v5.x
- `TiledMapRenderer` constructor takes `(GraphicsDevice, TiledMap)` — correct
- LINQ usage in `ExtractObjectShapes` and `BuildFlagGrid` (`.FirstOrDefault()`, `.Select().ToArray()`) — works but contradicts the project's own performance advice (P12 says "never use LINQ in per-frame code"). These are load-time calls so technically fine, but worth a note.

**Formatting:** Excellent — comprehensive TOC, well-structured sections, performance checklist at end.

---

### Summary of Critical Issues

| Priority | Issue | Affected Docs | Fix |
|----------|-------|---------------|-----|
| 🔴 **Critical** | All `../G/`, `../R/` relative links broken — wrong subdirectory names | P12, E1, G3 | Change `../G/` → `../guides/`, `../R/` → `../reference/` |
| 🔴 **Critical** | `img/` directory missing — all image refs broken | P12, G3, G37 | Create `monogame-arch/img/` and `core/img/`, add images; or remove image refs |
| ⚠️ **Medium** | G3 contradicts itself on Aether `SetRestitution`/`SetFriction` — says removed but uses them in examples | G3 | Either use fixture-level properties in examples, or correct the gotcha text |
| ⚠️ **Medium** | P12 is MonoGame-specific but lives in `core/` | P12 | Move to `monogame-arch/guides/` or split into theory + engine-specific |
| ℹ️ **Low** | MonoGame 3.8.5+ referenced in E1 but hasn't shipped | E1 | Note as target/planned version |
| ℹ️ **Low** | camera-theory.md missing category front-matter | camera-theory | Add `> **Category:** Concept` line for consistency |
