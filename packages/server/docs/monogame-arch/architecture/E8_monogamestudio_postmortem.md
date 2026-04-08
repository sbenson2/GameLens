# E8 — MonoGameStudio Post-Mortem

> **Category:** Explanation · **Related:** [G29 Game Editor](../guides/G29_game_editor.md) · [G30 Game Feel Tooling](../guides/G30_game_feel_tooling.md) · [E1 Architecture Overview](./E1_architecture_overview.md) · [E2 Nez Dropped](./E2_nez_dropped.md)

---

## What Was MonoGameStudio?

MonoGameStudio was a 2D game editor built on **MonoGame + Arch ECS + Hexa.NET.ImGui**. It grew from v0.1 to v0.9 across ~134 source files, attempting to replicate a Godot-class 2D editing experience inside a custom MonoGame/C# stack. The editor was built, the knowledge captured, and the source was intentionally deleted.

This post-mortem documents what went right, what went wrong, and the hard lessons that shaped the project's architecture philosophy going forward.

---

## Timeline

| Version | Focus | Outcome |
|---------|-------|---------|
| v0.1–v0.3 | Core ImGui docking, scene tree, basic inspector | Promising — fast iteration |
| v0.4–v0.5 | Tilemap editor, asset browser | Scope creep began |
| v0.6–v0.7 | Undo/redo, animation timeline | Complexity snowballed |
| v0.8–v0.9 | Polish, stability, edge cases | Diminishing returns |

Total effort: roughly 8–10 weeks of focused development.

---

## What Went Right

### 1. ImGui + Docking Is the Right Foundation

Hexa.NET.ImGui with docking support proved the correct choice for a MonoGame editor UI. The retained-mode mental model takes adjustment, but once understood, iteration speed is excellent. Key wins:

- **Dockable panels** worked out of the box with `ImGui.DockSpaceOverViewport()`
- **Property editors** for common types (int, float, bool, Vector2, Color) were fast to build
- **Debug overlays** transferred directly into the game runtime

### 2. ECS as the Scene Model

Using Arch ECS as both the game runtime and the editor's scene model meant zero serialization mismatch. Entities in the editor were the same entities in the game. This eliminated an entire class of "it works in editor but not in game" bugs.

### 3. Knowledge Extraction Was the Real Value

The most valuable output wasn't the editor itself — it was understanding what Godot's editor actually does under the hood. Rebuilding the inspector, scene tree, and tilemap editor forced deep understanding of:

- Reflection-driven property editing
- Scene composition vs inheritance
- Undo/redo architecture (command pattern with entity snapshots)
- Tilemap autotiling algorithms

This knowledge directly informed [G29 — Game Editor](../guides/G29_game_editor.md).

---

## What Went Wrong

### 1. The Tool-Building Trap

The editor became the project. What started as "I need a level editor" turned into "I'm building a game engine IDE." The 134-file codebase was mostly editor code, not game code. **No game was ever made with it.**

This is the most important lesson: **tools exist to serve the game, not to become the game.** If your tooling budget exceeds your game budget, you've lost the plot.

### 2. Scope Escalation Was Invisible

Each feature seemed small in isolation:
- "Just add undo/redo" → command pattern + entity snapshotting + UI state management
- "Just add a tilemap editor" → tile painting + autotile rules + multi-layer + physics shape editing
- "Just add animation preview" → timeline UI + keyframe interpolation + sprite sheet integration

The compounding complexity was only visible in retrospect. By v0.6, more time went to maintaining existing features than building new ones.

### 3. No Shipping Pressure

Without a game depending on the editor, there was no forcing function to stop adding features and start using it. A real game would have said "this is good enough, ship levels." The editor never heard "good enough."

### 4. Reimplementing Solved Problems

Many features being built already existed in mature tools:
- **Tiled** handles tilemap editing better than a custom solution ever will
- **Aseprite** handles sprite/animation editing
- **ImGui debug overlays** handle 90% of in-game editing needs

The remaining 10% (scene composition, custom inspector) rarely justifies a full editor.

---

## The Decision to Delete

The source was deleted intentionally, not lost. Reasons:

1. **Sunk cost trap** — keeping the code around created pressure to "finish" it
2. **Knowledge > code** — everything worth preserving was captured in documentation
3. **Clean break** — the project philosophy shifted to "compose existing tools" rather than "build a monolithic editor"

The documentation (this file, G29, G30) preserves the architectural knowledge. The code was the scaffolding; the understanding is the building.

---

## Lessons Applied

These lessons directly shaped the project's current approach:

| Lesson | Applied As |
|--------|-----------|
| Tools serve the game | [G30](../guides/G30_game_feel_tooling.md) budgets tooling at 500–800 lines, 1–2 days |
| Compose, don't rebuild | Stack uses Tiled + Aseprite + ImGui overlays instead of custom editor |
| Knowledge > code | Documentation-first approach; guides capture the *why* not just the *how* |
| Ship pressure matters | [P2 Production Milestones](../../core/project-management/P2_production_milestones.md) enforces milestone deadlines |
| Scope creep is invisible | [P1 Pre-Production](../../core/project-management/P1_pre_production.md) requires scope lock before production |

---

## When TO Build a Custom Editor

Despite this post-mortem's cautionary tone, there are legitimate cases:

1. **Your game's core mechanic IS the editor** (level-building games like Mario Maker)
2. **You need runtime editing** that Tiled/Aseprite can't provide (live-tuning physics, AI behavior trees)
3. **Your team has dedicated tools programmers** (not game dev wearing all hats)
4. **ImGui overlays aren't enough** — you need persistent UI state, complex layouts, or non-developer users

If none of these apply, use existing tools. The MonoGame ecosystem is small enough that time spent building editors is time not spent making games.

---

## Summary

MonoGameStudio was a successful failure. It produced no game but generated deep architectural understanding that made everything after it better. The key takeaway: **build the minimum tooling that lets you ship a game, then stop.** Every hour spent on editor chrome is an hour not spent on gameplay.

The tool-building trap is the game developer's most seductive pitfall. Recognize it early.
