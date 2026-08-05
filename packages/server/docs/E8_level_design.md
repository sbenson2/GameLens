# E8 — Level Design

> **Category:** Explanation · **Related:** [C2 Game Feel & Genre Craft](C2_game_feel_and_genre_craft.md) · [E7 Emergent Puzzle Design](E7_emergent_puzzle_design.md) · [Camera Theory](../concepts/camera-theory.md) · [Tilemap Theory](../concepts/tilemap-theory.md) · [P4 Playtesting](../project-management/P4_playtesting.md)

---

Level design theory for programmers: levels as gameplay delivery systems, the teach–test–twist structure, wordless guidance through composition, intentionality and player plans, pacing curves, and the metrics-first blockout workflow. Distilled from the free level-design canon — Dan Taylor's GDC 2013 principles, Steve Lee's GDC 2017 holistic approach, and Maddy Thorson's GDC 2017 Celeste talk — all watchable for free.

---

## Levels Are Gameplay Delivery Systems

The framing that unlocks everything else (Dan Taylor, "Ten Principles for Good Level Design," GDC 2013): a level is not scenery with challenges sprinkled in — it is the **delivery mechanism for your mechanics**. Every question about a level reduces to "what does this space make the player *do*, and is that thing your game's core verb?"

Practical consequences:

- **Design levels after mechanics are stable.** If the jump arc, dash distance, or weapon range changes, every level authored against the old values silently breaks. Lock movement metrics first.
- **A level should be playable in your head.** If you can't narrate what the player does moment-to-moment ("lands here, sees the gap, dashes, grabs the ledge"), the space isn't designed yet — it's decorated.
- **The level answers "why this game?"** A great level is one that could only exist in *your* game, because it's built from your specific mechanics interacting. If the level would work identically in any platformer, it isn't using your design.

---

## Teach, Test, Twist

The structure underneath almost every well-reviewed level in mechanics-driven games, and the explicit method behind Celeste's chapters (Maddy Thorson, "Level Design Workshop: Designing Celeste," GDC 2017):

1. **Teach** — introduce one new mechanic in a safe context where experimentation can't kill the player. The environment is the tutorial: the first dash crystal in Celeste sits above flat ground, not a pit.
2. **Test** — the same mechanic with real stakes. Failure costs something, but the challenge is recognizably the thing just taught.
3. **Twist** — combine the mechanic with previously learned ones, or invert an assumption about it. This is where depth lives; it's also the moment players describe as "clever."

Rules that keep the structure honest:

- **One new idea per chunk.** Celeste dedicates each world to one mechanic and exhausts it. When two new ideas arrive together, players can't attribute failure to either one, and learning stalls.
- **Teach by consequence, not text.** A popup that says "press X to dash" is a patch over a level that failed to teach. If playtesters read a tutorial box and still don't understand, the level needs redesign, not more text.
- **Retire mechanics gracefully.** A mechanic that appears once and vanishes reads as a gimmick. If it can't sustain a teach–test–twist arc, it may not deserve to ship.

This structure is the level-scale version of kishōtenketsu (see the lens library's four-act structure lens) — introduction, development, twist, resolution, no antagonist required.

---

## Guiding Without Words

Players should navigate by reading the space, never by reading UI. The toolkit, in rough order of subtlety:

| Technique | How it works |
|-----------|--------------|
| **Light** | Players move toward brighter areas. The cheapest, strongest magnet in the kit. |
| **Leading lines** | Platform edges, pipes, rails, and terrain seams point where attention should go. |
| **Landmarks** | One tall, unique, always-visible structure ("the mountain," "the citadel") lets players self-orient without a map. Disney's Imagineers called this the "weenie"; open-world games live on it. |
| **Denial and reveal** | Show the goal, then take it away; the route becomes the promise of getting back to it. Showing a locked door before its key makes the key meaningful. |
| **Breadcrumbs** | Collectibles and pickups trace the intended path. Players trust that coins never lie. |
| **Contrast and color** | Interactable things share a visual grammar (Mirror's Edge red, Celeste's crystal palette). Once established, never violate it. |
| **Motion** | Anything that moves draws the eye — a fluttering flag at the exit outperforms an arrow. |

The failure mode is **visual grammar violations**: a climbable ledge that looks identical to a decorative one, or decoration that looks interactable. Every playtester who walks into a wall "that looked like a door" is reporting a grammar bug, not being dumb.

---

## Intentionality: Let Players Form Plans

Steve Lee's core idea ("An Approach to Holistic Level Design," GDC 2017, drawing on Dishonored 2 and BioShock Infinite): good levels let players **form an intention and execute it**. The loop is:

1. The space shows the player information (a patrol route, a vent, a ledge, a guard's back).
2. The player forms a plan ("I'll cross the roof while he faces away").
3. The game lets the plan succeed or fail *for legible reasons*.

Agency isn't the number of paths — it's whether the player chose a path **on purpose**. A level with three corridors the player wanders at random has less agency than one corridor the player deliberately chose over a vent.

Programmer-facing implications:

- **Information before options.** A stealth game that hides patrol routes until the player is inside them can't produce plans, only reactions. Sight lines, audio cues, and preview vantage points are level design features, not polish.
- **Holism is the multiplier.** Gameplay, art, and story pulling together compound; pulling apart, they cancel. A space that plays as a combat arena but reads as a throne room and narrates as a refuge confuses on three channels at once.
- **Failed plans must debug themselves.** When a plan fails, the player should be able to trace why ("he turned early because I knocked over the bottle"). Failure with no visible cause reads as randomness and kills planning.

---

## Pacing: Intensity Is a Curve You Author

Levels have a rhythm: challenge spikes, then valleys for recovery. Author it deliberately.

- **Saw-tooth, not staircase.** Intensity ramps then briefly drops below the previous peak — rest beats after climaxes. An unbroken ramp exhausts; players report "it just got grindy" without knowing why.
- **Valleys do work.** Rest beats are where players save, absorb story, notice the vista, and consolidate what the last challenge taught. Cutting them to "tighten pacing" usually loosens it.
- **Chart it.** A simple beat chart — x-axis: level progress, y-axis: expected intensity — exposes accidental double-spikes and dead stretches before playtesters do. It's the level-design equivalent of a profiler flame graph.
- **End chapters above the median, start below it.** Peaks are remembered; entrances are forgiven.

---

## Metrics First, Then Blockout, Then Art

The production workflow that prevents the most expensive level-design failures:

1. **Lock metrics.** Jump height/distance (min and max), dash length, walk/run speeds, camera frame, enemy engagement ranges. Build a "metrics gym" — a test level of calibrated gaps, steps, and corridors — and keep it updated. Every level inherits these numbers.
2. **Blockout (greybox).** Untextured primitives, correct scale, full playthrough possible. All layout iteration happens here, where a change costs minutes.
3. **Playtest the blockout.** If the greybox isn't fun, art will not save it. Watch where testers hesitate, backtrack, or die repeatedly (see [P4 Playtesting](../project-management/P4_playtesting.md)).
4. **Art pass last.** Art locks geometry. Once meshes and lighting are placed, moving a platform costs hours and someone will argue against fixing a layout bug because of it.

Red flags, in programmer terms:

- Level geometry authored before movement constants are locked — every tuning change now invalidates content.
- Gaps sized by eye instead of against the metrics gym — "possible but unpleasant" jumps everywhere.
- Art assets imported into a layout that has never been playtested greybox.
- The camera system fights the geometry (ceilings clip the camera, corridors narrower than the frame) — see [Camera Theory](../concepts/camera-theory.md).
- Difficulty scaled by adding more enemies to the same room instead of recomposing the space.

---

## Watching List (All Free)

- **Dan Taylor — "Ten Principles for Good Level Design" (GDC 2013)** — the mechanics-first framing; free on the GDC YouTube channel.
- **Steve Lee — "An Approach to Holistic Level Design" (GDC 2017)** — intentionality and discipline-holism; free on YouTube.
- **Maddy Thorson — "Level Design Workshop: Designing Celeste" (GDC 2017)** — teach–test–twist at production scale; free on YouTube.
- **Itay Keren — "Scroll Back: The Theory and Practice of Cameras in Side-Scrollers" (GDC 2015)** — the camera half of level readability (see [R4 Resources](R4_game_design_resources.md)).
- **Christopher Totten — *An Architectural Approach to Level Design*** — book-length treatment of spatial composition (paid, but the deepest reference).
