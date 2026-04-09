# Love2D — AI Rules

Engine-specific rules for projects using LÖVE (Love2D). These supplement the engine-agnostic rules in `docs/core/ai-workflow/gamedev-rules.md`.

---

## Architecture Context

### Tech Stack

- **Framework:** LÖVE (Love2D) — lightweight 2D game framework
- **Language:** Lua (LuaJIT on desktop)
- **Physics:** Box2D (via `love.physics`)
- **Rendering:** OpenGL / OpenGL ES (via `love.graphics`)
- **Audio:** OpenAL (via `love.audio`)
- **Key Libraries:** Commonly used alongside LÖVE:
  - hump (gamestate, camera, vector, timer)
  - anim8 (spritesheet animation)
  - STI / Simple Tiled Implementation (Tiled map loader)
  - tiny-ecs / concord (Entity Component Systems)
  - suit / gooi (immediate/retained mode UI)
  - bump.lua (AABB collision detection)
  - windfield (physics wrapper)
  - push (resolution handling)

### Project Structure Conventions

```
{ProjectName}/
├── main.lua             # Entry point (love.load, love.update, love.draw)
├── conf.lua             # Engine configuration
├── src/
│   ├── states/          # Game states (menu, play, pause, gameover)
│   ├── entities/        # Entity definitions or factories
│   ├── systems/         # ECS systems or update/draw logic
│   ├── ui/              # HUD, menus, dialogs
│   └── utils/           # Math helpers, pooling, data structures
├── assets/
│   ├── sprites/         # Images and spritesheets
│   ├── audio/           # Music and sound effects
│   ├── fonts/           # Custom fonts
│   └── maps/            # Tiled or custom level data
└── lib/                 # Third-party Lua libraries
```

---

## Code Generation Rules

### Game Loop: Never Fight the Callbacks

- All initialization goes in `love.load()`. Never load assets in `update` or `draw`.
- All game logic goes in `love.update(dt)`. Always multiply movement by `dt`.
- All rendering goes in `love.draw()`. Never modify game state in draw.
- Use `love.keypressed` / `love.mousepressed` for discrete input events.
- Use `love.keyboard.isDown()` / `love.mouse.isDown()` for continuous input polling.

### Lua Style

- Use `local` for all variables and functions unless they must be global.
- Prefer `require()` for module loading — avoid polluting the global namespace.
- Use metatables and closures for OOP patterns, not class libraries (unless the project already uses one).
- String keys in tables for readability: `{ x = 10, y = 20 }` not `{ 10, 20 }` for positions.

### Physics (love.physics)

- Create one `love.physics.newWorld()` in `love.load()`.
- Call `world:update(dt)` in `love.update(dt)` — exactly once per frame.
- Use meters, not pixels, for physics units. Set a pixel-per-meter scale (e.g., 64).
- Attach collision callbacks via `world:setCallbacks(beginContact, endContact, preSolve, postSolve)`.
- Clean up bodies with `body:destroy()` — don't let them accumulate.

### Graphics

- Batch draw calls when possible: use SpriteBatches for tilemaps and particle-heavy scenes.
- Use Canvases (render targets) for post-processing, minimaps, and lighting.
- Shaders are written in GLSL (LÖVE's subset). Send uniforms via `shader:send()`.
- Always `love.graphics.push()` / `pop()` when applying transforms to avoid leaking state.

### Audio

- Load music as `"stream"` and sound effects as `"static"`:
  ```lua
  music = love.audio.newSource("music.ogg", "stream")
  sfx = love.audio.newSource("hit.wav", "static")
  ```
- Clone static sources for overlapping SFX: `sfx:clone():play()`.

### Filesystem

- LÖVE sandboxes file I/O. `love.filesystem.write()` writes to the save directory, not the game directory.
- Set `t.identity` in `conf.lua` to name the save directory.
- Use `love.filesystem.getInfo()` to check if a file exists before reading.

### Threading

- `love.thread` creates real OS threads, but they cannot share Lua state.
- Communicate between threads via `love.thread.Channel` (push/pop/peek).
- Use threads for asset loading, pathfinding, or network I/O — never for rendering.

---

## Common Patterns

### State Management

Use a state table or library (`hump.gamestate`) to separate menu, gameplay, pause, and game-over logic. Each state implements `update(dt)`, `draw()`, and input callbacks.

### Entity Management

For simple games, use a table of entity tables. For complex games, use an ECS library (`tiny-ecs`, `concord`). Avoid deep class hierarchies — Lua's tables and duck typing favor composition.

### Resolution Independence

Use `push` or a manual canvas-based approach to render at a fixed internal resolution and scale to the window. This avoids layout bugs across different screen sizes.

---

## Anti-Patterns to Avoid

1. **Loading assets every frame** — always cache in `love.load()`.
2. **Forgetting `dt`** — raw `player.x = player.x + 5` runs at different speeds on different machines.
3. **Global state everywhere** — use `local` and pass dependencies explicitly.
4. **Drawing in update** — `love.graphics` calls outside `love.draw()` are silently ignored.
5. **Blocking the main thread** — use `love.thread` for heavy computation or network calls.
6. **Hardcoding pixel coordinates** — use a camera and virtual resolution for any game that scrolls or scales.

---

## Documentation Index

- [E1 Architecture Overview](architecture/E1_architecture_overview.md)
- [G1 Game Loop & Callbacks](guides/G1_game_loop_and_callbacks.md)
- [G2 Graphics & Rendering](guides/G2_graphics_and_rendering.md)
- [G3 Physics & Box2D](guides/G3_physics_and_box2d.md)
- [G4 Audio](guides/G4_audio.md)
- [G5 Input Handling](guides/G5_input_handling.md)
- [G6 Shaders & GLSL](guides/G6_shaders_and_glsl.md)
- [G7 Scene Management & ECS](guides/G7_scene_management_and_ecs.md)
- [G8 Filesystem & Save Data](guides/G8_filesystem_and_save_data.md)
- [G9 Threading & Channels](guides/G9_threading_and_channels.md)
- [G10 Distribution & Packaging](guides/G10_distribution_and_packaging.md)
- [G11 Cameras & Tilemaps](guides/G11_cameras_and_tilemaps.md)
- [G12 UI Patterns](guides/G12_ui_patterns.md)
- [G13 Particles & Effects](guides/G13_particles_and_effects.md)
- [G14 Networking & Multiplayer](guides/G14_networking_and_multiplayer.md)
- [G15 Debugging & Profiling](guides/G15_debugging_and_profiling.md)
- [R1 Module Reference](reference/R1_module_reference.md)
- [G16 Mobile & Touch](guides/G16_mobile_and_touch.md)
- [G17 Testing & CI](guides/G17_testing_and_ci.md)
- [G18 Common Game Patterns](guides/G18_common_game_patterns.md)
- [R1 Module Reference](reference/R1_module_reference.md)
- [R2 Common Libraries & Ecosystem](reference/R2_common_libraries.md)
- [G19 Accessibility & Localization](guides/G19_accessibility_and_localization.md)
- [R3 Performance Optimization](reference/R3_performance_optimization.md)
- [G20 Error Handling & Resilience](guides/G20_error_handling_and_resilience.md)
- [G21 Animation & Spritesheets](guides/G21_animation_and_spritesheets.md)
- [R4 Migrating to LÖVE 12](reference/R4_migrating_to_love_12.md)
