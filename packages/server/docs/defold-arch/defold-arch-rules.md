# Defold — AI Rules

Engine-specific rules for projects using the Defold game engine. These supplement the engine-agnostic rules in `docs/core/ai-workflow/gamedev-rules.md`.

---

## Architecture Context

### Tech Stack

- **Engine:** Defold (free, source-available game engine by the Defold Foundation)
- **Language:** Lua (via Defold's Lua runtime, not LuaJIT on all platforms)
- **Physics:** Box2D (2D) and Bullet (3D) — integrated, configured via editor
- **Rendering:** OpenGL / OpenGL ES / Vulkan / Metal (engine-managed)
- **Build:** Cloud builder or local `bob.jar`; zero local SDK setup for cross-platform
- **Key Libraries / Extensions:**
  - Orthographic Camera (camera system)
  - Monarch (screen management)
  - DefOS (OS-level window control)
  - Druid (UI component library)
  - Gooey (declarative GUI)
  - Defold-Input (enhanced input handling)
  - RenderCam (3D camera)

### Project Structure Conventions

```
{ProjectName}/
├── game.project            # Engine config (INI format)
├── game.input_binding      # Input mappings
├── main/
│   ├── main.collection     # Bootstrap collection (entry point)
│   ├── main.script         # Root-level game logic
│   ├── main.gui            # HUD/menu GUI
│   └── main.gui_script     # GUI logic
├── player/
│   ├── player.go           # Reusable game object
│   ├── player.script       # Player logic
│   └── player.atlas        # Player sprite atlas
├── enemies/
│   ├── enemies.collection  # Enemy prefab collection
│   └── enemy.script        # Enemy behavior
├── levels/
│   ├── level1.collection   # Level data
│   └── level2.collection
├── shared/
│   ├── modules/            # Shared Lua modules
│   └── materials/          # Custom materials/shaders
└── _build/                 # Auto-generated build output (gitignored)
```

---

## Code Generation Rules

### Message Passing: The Communication Law

- **Never** call functions directly on other game objects. Use `msg.post()`.
- Always handle messages in `on_message(self, message_id, message, sender)`.
- Compare `message_id` against `hash("name")` — messages use hashed string IDs.
- Use `sender` to reply to messages (request-response pattern).
- For broadcast, implement a manager script that tracks registered listeners.

### Script Lifecycle

- `init(self)` — initialize state, acquire input focus if needed.
- `final(self)` — clean up, release input focus.
- `update(self, dt)` — per-frame logic. Multiply movement by `dt`.
- `on_message(self, message_id, message, sender)` — handle incoming messages.
- `on_input(self, action_id, action)` — handle input (only if input focus acquired).
- `on_reload(self)` — editor hot-reload hook (development only).

### Properties (go.property)

- Declare script-level properties with `go.property("name", default_value)` at the **top** of the script, outside any function.
- Supported types: `number`, `hash`, `url`, `vmath.vector3`, `vmath.vector4`, `vmath.quaternion`, `resource.*`, `bool`.
- Read at runtime: `go.get("#script", "speed")` or `self.speed` inside the owning script.
- Write at runtime: `go.set("#script", "speed", 300)`.
- Animate: `go.animate("#script", "speed", go.PLAYBACK_ONCE_FORWARD, 500, go.EASING_LINEAR, 1.0)`.
- **Never** use `go.property` inside a function — it must be at file scope.

### Addressing

- Use `#component` for same-object references.
- Use `/object#component` for same-collection references.
- Use `collection:/object#component` for cross-collection references (rare — prefer message passing through proxies).
- Game object IDs are set in the editor or via `factory.create()` — they are **not** Lua variable names.

### GUI Scripts

- GUI components have their own script type (`.gui_script`) with a separate lifecycle.
- GUI nodes are addressed by ID, not URL: `gui.get_node("button")`.
- GUI coordinates are in the GUI scene's coordinate space, not the game world.
- Use `gui.pick_node(node, x, y)` for hit testing.
- GUI rendering is on top of the game world by default (controlled by render script).

### Factories

- Use `factory.create("#factory_id", position, rotation, properties, scale)` to spawn game objects.
- Use `collectionfactory.create("#collection_factory_id", ...)` to spawn entire collections.
- Spawned objects get auto-generated IDs. Store the returned ID if you need to address them later.
- Set properties on spawned objects via the properties table parameter.

### Physics

- Collision objects are components, not standalone objects. Add them to game objects in the editor.
- Define collision groups and masks in `game.project`.
- Collision callbacks arrive as messages: `collision_response`, `contact_point_response`, `trigger_response`.
- Use `ray_cast_response` for raycasts (via `physics.raycast()`).
- Physics runs in world space — transform the game object, not the collision shape.

### Input

- Always acquire input focus in `init()`: `msg.post(".", "acquire_input_focus")`.
- Always release in `final()`: `msg.post(".", "release_input_focus")`.
- Input bindings map device inputs (key, mouse, gamepad) to action names in `game.input_binding`.
- `action.pressed`, `action.released`, and `action.repeated` are booleans — check them explicitly.
- For multi-touch, each touch point has a unique `action.touch` table.

---

## Common Patterns

### Screen/Scene Management

Use collection proxies for loading/unloading screens (levels, menus). The Monarch library provides a battle-tested screen manager with transitions.

```lua
-- Load a collection proxy
msg.post("#level_proxy", "load")

-- When loaded, enable it
function on_message(self, message_id, message, sender)
    if message_id == hash("proxy_loaded") then
        msg.post(sender, "enable")
    end
end
```

### Shared Lua Modules

For pure logic (math utils, constants, data tables), use standard Lua modules:
```lua
-- modules/constants.lua
local M = {}
M.GRAVITY = -9.8
M.MAX_SPEED = 400
return M

-- player.script
local constants = require("shared.modules.constants")
```

Modules are the right place for shared data and utility functions. Message passing is for game object communication.

### Object Pooling

Use factories with pre-created objects. Disable/enable instead of create/delete:
```lua
msg.post(bullet_id, "disable")  -- "return" to pool
msg.post(bullet_id, "enable")   -- reuse from pool
```

---

## Anti-Patterns to Avoid

1. **Direct function calls between game objects** — always use `msg.post()`.
2. **Forgetting `hash()`** — comparing `message_id == "my_message"` always fails; use `hash("my_message")`.
3. **`go.property` inside functions** — it must be at file scope.
4. **Hardcoding addresses** — use `msg.url()` or relative addressing. Absolute paths break when collections are nested.
5. **Ignoring the console** — Defold silently drops messages to invalid addresses. Check the console for warnings.
6. **Mutating `self` in `on_input` for physics** — apply forces in `update()`, set flags in `on_input()`.
7. **Creating deep collection hierarchies** — keep nesting shallow (2-3 levels max) for debuggability.

---

## Documentation Index

- [E1 Architecture Overview](architecture/E1_architecture_overview.md)
- [G1 Message Passing](guides/G1_message_passing.md)
- [G2 Game Objects & Collections](guides/G2_game_objects_and_collections.md)
- [G3 GUI System](guides/G3_gui_system.md)
- [G4 Physics & Collisions](guides/G4_physics_and_collisions.md)
- [G5 Input & Properties](guides/G5_input_and_properties.md)
- [G6 Native Extensions & Build](guides/G6_native_extensions_and_build.md)
- [G7 Animation & Audio](guides/G7_animation_and_audio.md)
- [G8 Hot Reload & Live Update](guides/G8_hot_reload_and_live_update.md)
- [G9 Render Pipeline & Materials](guides/G9_render_pipeline_and_materials.md)
- [G10 Networking & Multiplayer](guides/G10_networking_and_multiplayer.md)
- [G11 Resource Management](guides/G11_resource_management.md)
- [G12 Distribution & Publishing](guides/G12_distribution_and_publishing.md)
- [G13 Debugging & Profiling](guides/G13_debugging_and_profiling.md)
- [G14 Camera Systems & Tilemaps](guides/G14_camera_and_tilemaps.md)
- [G15 Lua Scripting Patterns](guides/G15_lua_scripting_patterns.md)
- [G16 Teal Type-Safe Scripting](guides/G16_teal_type_safe_scripting.md)
- [G17 Testing & Quality Assurance](guides/G17_testing_and_quality_assurance.md)
- [R1 API Reference](reference/R1_api_reference.md)
- [R2 Community Libraries](reference/R2_community_libraries.md)
- [G18 Common Game Patterns](guides/G18_common_game_patterns.md)
- [R3 Performance Optimization](reference/R3_performance_optimization.md)
- [R4 3D Development](reference/R4_3d_development.md)
- [G19 Accessibility & Localization](guides/G19_accessibility_and_localization.md)
- [G20 Particles & Visual Effects](guides/G20_particles_and_visual_effects.md)
- [G21 Save Data & Persistence](guides/G21_save_data_and_persistence.md)
- [R5 Defold 1.12 Changes](reference/R5_defold_1_12_changes.md)
