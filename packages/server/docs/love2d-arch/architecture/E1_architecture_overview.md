# E1 — Architecture Overview

> **Category:** explanation · **Engine:** Love2D · **Related:** [G1 Game Loop & Callbacks](../guides/G1_game_loop_and_callbacks.md) · [R1 Module Reference](../reference/R1_module_reference.md)

---

## Core Philosophy: A Framework, Not an Engine

LÖVE (Love2D) is a **2D game framework**, not a full game engine. It provides the building blocks — window management, rendering, audio, physics, input, filesystem — and leaves architecture decisions to you. There is no scene graph, no built-in ECS, no visual editor. You write Lua, and LÖVE runs it.

This minimalism is the point. LÖVE gives you a fast, portable C++ runtime with a clean Lua API, and you compose your game from whatever patterns fit your project. It is ideal for game jams, prototypes, learning game dev, and small-to-medium indie games.

---

## Runtime Model

LÖVE runs a **single-threaded game loop** defined in `love.run()`. The default loop calls your callback functions each frame:

1. **`love.load()`** — called once at startup. Load assets, initialize state.
2. **`love.update(dt)`** — called every frame with delta time. Update game logic.
3. **`love.draw()`** — called every frame after update. Render everything.

Additional callbacks handle input (`love.keypressed`, `love.mousepressed`, `love.touchpressed`), window events (`love.focus`, `love.resize`), and lifecycle (`love.quit`).

You can replace `love.run()` entirely if you need a custom loop (fixed timestep, frame skipping, etc.), but the default is solid for most games.

---

## Module System

LÖVE organizes its API into modules, each handling a domain:

| Module | Purpose |
|--------|---------|
| `love.graphics` | Drawing sprites, shapes, text, shaders, canvases, render targets |
| `love.physics` | 2D rigid-body physics via Box2D (worlds, bodies, shapes, joints) |
| `love.audio` | Play, pause, stop sounds; positional audio; effects |
| `love.keyboard` | Keyboard state polling and callbacks |
| `love.mouse` | Mouse position, button state, cursor management |
| `love.touch` | Multi-touch input (mobile) |
| `love.joystick` | Gamepad/joystick support |
| `love.filesystem` | Sandboxed file I/O (save directory + game directory) |
| `love.window` | Window creation, display modes, fullscreen |
| `love.timer` | Delta time, FPS, sleep |
| `love.math` | Random numbers, noise, triangulation, Bézier curves |
| `love.data` | Data encoding/decoding (compress, hash, pack/unpack) |
| `love.thread` | OS-level threads with channel-based communication |
| `love.system` | OS info, clipboard, power state |
| `love.event` | Event queue (push/poll/pump) |

You configure which modules are loaded via `conf.lua`. Disable unused modules to reduce startup time and memory.

---

## What LÖVE Does NOT Provide

Because LÖVE is a framework, you must build or import these yourself:

- **Entity/Component System** — Use libraries like `tiny-ecs`, `concord`, `lovetoys`, or roll your own.
- **Scene/State Management** — Use `hump.gamestate`, `roomy`, or a simple state-machine table.
- **UI/HUD System** — Use libraries like `suit`, `gooi`, or draw manually with `love.graphics`.
- **Tilemap Rendering** — Use `STI` (Simple Tiled Implementation) for Tiled maps, or parse your own.
- **Animation** — Use `anim8` for spritesheet animation.
- **Camera** — Use `hump.camera`, `gamera`, or a simple transform wrapper.

The Lua ecosystem for LÖVE is rich — the [awesome-love2d](https://github.com/love2d-community/awesome-love2d) list catalogs hundreds of libraries.

---

## Project Structure Conventions

LÖVE has no enforced structure, but a clean layout looks like this:

```
my-game/
├── main.lua            # Entry point (love.load, love.update, love.draw)
├── conf.lua            # Engine configuration (window size, modules, identity)
├── src/
│   ├── states/         # Game states (menu, play, pause, gameover)
│   ├── entities/       # Entity definitions or factories
│   ├── systems/        # ECS systems or update/draw logic
│   ├── ui/             # HUD, menus, dialogs
│   └── utils/          # Math helpers, pooling, data structures
├── assets/
│   ├── sprites/        # Images and spritesheets
│   ├── audio/          # Music and sound effects
│   ├── fonts/          # Custom fonts
│   └── maps/           # Tiled or custom level data
└── lib/                # Third-party Lua libraries
```

---

## Configuration: conf.lua

`conf.lua` runs before `main.lua` and defines a `love.conf(t)` function:

```lua
function love.conf(t)
    t.identity = "my-game"          -- Save directory name
    t.version = "11.5"              -- Target LÖVE version
    t.window.title = "My Game"
    t.window.width = 1280
    t.window.height = 720
    t.window.vsync = 1
    t.modules.physics = false       -- Disable Box2D if unused
    t.modules.joystick = false      -- Disable joystick if unused
end
```

---

## Distribution

LÖVE games ship as `.love` files (renamed ZIP archives containing your Lua source + assets). Players need LÖVE installed, or you fuse the `.love` file with the LÖVE executable to create standalone binaries.

Tools like `love-release` and `makelove` automate cross-platform builds for Windows, macOS, Linux, and Android.

---

## When to Choose LÖVE

- **Game jams** — zero boilerplate, instant iteration
- **Learning game dev** — the simplest path from "hello world" to a working game
- **2D indie games** — performant enough for bullet-hells, platformers, roguelikes, puzzle games
- **Prototyping** — test mechanics fast before porting to a bigger engine

LÖVE is not ideal for 3D, large team projects, or games that need a visual scene editor out of the box.
