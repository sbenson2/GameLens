# RPG Maker (MZ/MV) — AI Rules

Engine-specific rules for projects using RPG Maker MZ or MV. These supplement the engine-agnostic rules in `docs/core/ai-workflow/gamedev-rules.md`.

---

## Architecture Context

### Tech Stack

- **Engine:** RPG Maker MZ (latest) / MV (legacy, widely modded)
- **Language:** JavaScript (plugins), PIXI.js v5 (rendering layer in MZ, v4 in MV)
- **Editor:** Database-driven (actors, classes, items, skills, enemies, tilesets, maps)
- **Plugin System:** JS plugins loaded via Plugin Manager, `PluginManager.registerCommand()` for MZ commands
- **Platforms:** Windows, macOS, HTML5, iOS, Android (via deployment tools)

### Key Concepts

- **Database** — central configuration for all game entities (actors, items, skills, enemies, states, tilesets)
- **Event System** — per-map event triggers with conditional branches, variables, switches
- **Plugin Architecture** — JS files that hook into the engine's update loop and override core classes via aliasing
- **Tileset System** — autotile-based map painting (A1–A5 autotiles, B–E normal tiles)
- **Scene System** — SceneManager stack: Scene_Title → Scene_Map ↔ Scene_Battle → Scene_Menu
- **Game Objects** — `Game_*` classes hold all mutable state (serialized into save files)

---

## Conventions

- Plugins should use the `PluginManager.registerCommand()` API (MZ) for custom commands.
- Always alias existing methods rather than overwriting them to maintain plugin compatibility.
- Use the `$gameVariables` / `$gameSwitches` API for event ↔ plugin communication.
