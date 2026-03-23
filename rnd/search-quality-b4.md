## Search Quality — Rotation B Round 4 (2026-03-23)

**Corpus:** 140 docs | **Engine:** TF-IDF with title boost + length normalization + stemming + synonyms

### Results

| Grade | Query | Top 3 |
|-------|-------|-------|
| ACCEPTABLE | Combat/damage systems: q="how to implement health and damage" | top3: g11, monogame-arch/g11, combat-theory |
| ACCEPTABLE | Camera follow: q="camera follow player smoothly" | top3: g20, godot-arch/g6, camera-theory |
| ACCEPTABLE | Tilemap procgen: q="tilemap procedural generation" | top3: g53, procedural-generation-theory, godot-rules |
| PASS | State machines: q="state machine for character" | top3: godot-arch/g2, g31, g52 |
| PASS | Input buffering: q="input buffering coyote time" | top3: godot-arch/g4, character-controller-theory, g52 |
| PASS | Godot signals: q="godot signals architecture" | top3: godot-arch/g3, godot-arch/e1, godot-rules |
| PASS | Godot physics: q="godot physics collision layers" | top3: godot-arch/g5, physics-theory, godot-arch/g7 |
| PASS | GDScript vs C#: q="gdscript vs csharp performance" | top3: godot-arch/e2, godot-arch/e1, godot-arch/g7 |
| PASS | Godot animation: q="godot animation tree blend" | top3: godot-arch/g8, godot-arch/g2, animation-theory |
| PASS | Godot tilemap: q="godot tilemap terrain autotile" | top3: godot-arch/g7, g29, g37 |
| PASS | Object pooling: q="object pooling recycling" | top3: g67, g14, monogame-arch/g14 |
| PASS | Save/load: q="save load serialization" | top3: g69, r1, g30 |
| PASS | Economy systems: q="economy shop currency" | top3: g65, c1, g69 |
| PASS | Building/placement: q="building placement grid system" | top3: g66, godot-arch/g7, g58 |
| PASS | Networking: q="networking multiplayer prediction" | top3: networking-theory, g9, p10 |
| FAIL | Enemy AI chase: q="how do I make enemies chase the player" | top3: godot-arch/g2, godot-arch/g1, godot-rules |
| PASS | Character feel: q="my character feels floaty and unresponsive" | top3: character-controller-theory, g52, g30 |
| PASS | Scene organization: q="best way to organize game scenes" | top3: scene-management-theory, g38, godot-arch/g1 |
| PASS | Inventory UI: q="inventory drag and drop system" | top3: g10, g_stitch_ui_workflow, c1 |
| FAIL | Tower defense: q="tower defense path blocking enemies" | top3: g66, c2, g65 |

### Summary
- **PASS:** 15 (top-1 hit)
- **ACCEPTABLE:** 3 (in top-5)
- **FAIL:** 2 (not found)
- **Score:** 82.5%

### Analysis

**Improvements since Round 3 (135 docs → 140 docs):**
- All 6 new Godot docs (G5-G8) rank correctly for targeted queries — TOPIC_DOC_MAP keywords working well
- `combat-theory` now ranks in top-3 for damage queries (was a gap last round)
- `godot-arch/g8` ranks #1 for animation queries on first test — new doc integrated cleanly
- Stemming is helping: "serialization" matches "serializ*" variants

**Persistent weaknesses:**
1. **"enemies chase player" → FAIL** — synonym map has enemy→ai but "chase" has no mapping to pathfinding/steering. G4 AI Systems (the correct doc) doesn't appear because query terms don't match its title or prominent terms. Fix: add `["chase", ["pathfind", "steering", "pursue"]]` to QUERY_SYNONYMS.
2. **"tower defense path blocking" → FAIL** — returns G66 (Building/Placement) instead of G40 (Pathfinding) or C2 (Tower Defense genre). The query bridges two concepts (TD genre + pathfinding mechanic) which TF-IDF handles poorly. The genre_lookup tool is the correct tool for genre-specific queries.
3. **combat/camera/tilemap as ACCEPTABLE not PASS** — these are multi-engine queries where the correct doc depends on which engine the user wants. The top-1 is a valid result (G11/G20/G53) but not the "expected" doc because our expectations assumed core theory docs. Actually reasonable behavior.

**Score trend:** Round 1: 100% (20 easy queries) → Round 3: 100% (20) + 70% (10 hard) → Round 4: 82.5% (20 mixed). The scoring criteria are stricter now (top-1 for PASS vs top-5 previously).

**Actionable fixes (low effort, high impact):**
- Add 3-4 synonym entries: chase→[pathfind,steering,pursue], follow→[pathfind,ai,steering], spawn→[instantiate,pool]
- These would likely convert both FAILs to ACCEPTABLE or PASS

### Notes
- Corpus grew from 138 (round 3) to 140 docs
- New docs since last round: G8 Animation, ui-theory expansion, cache shape validation
- Build clean, 175/175 tests pass in 1.2s
- Testing Godot animation (G8), tilemap (G7) queries specifically
