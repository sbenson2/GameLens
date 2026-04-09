# G2 — Game Objects & Collections

> **Category:** guide · **Engine:** Defold · **Related:** [E1 Architecture Overview](../architecture/E1_architecture_overview.md) · [G1 Message Passing](G1_message_passing.md) · [R1 Component Reference](../reference/R1_component_reference.md)

---

## The Mental Model

Defold organizes your game into three nested layers:

```
Collection
  └─ Game Object
       └─ Component
```

Think of it like a physical stage play: a **Collection** is a scene, **Game Objects** are actors on stage, and **Components** are the props, costumes, and scripts each actor carries. This hierarchy is the backbone of every Defold project.

---

## Game Objects

A game object is a container with an identity, a transform (position, rotation, scale), and zero or more components. It has no behavior on its own — behavior comes entirely from attached components.

### Creating Game Objects in the Editor

In the Defold editor, game objects live inside `.collection` files. You can:

1. **Add inline** — right-click in the Outline → Add Game Object. The object is defined directly inside the collection.
2. **Add from file** — create a `.go` file, then reference it from the collection. This lets you reuse the same game object definition across multiple collections.

### Game Object Properties

Every game object has:

| Property | Type | Notes |
|----------|------|-------|
| Id | `string` | Unique within the collection. Used for addressing. |
| Position | `vector3` | World position (or relative to parent if nested). |
| Rotation | `quat` | Quaternion rotation. |
| Scale | `vector3` | Uniform or non-uniform scale. |

### Manipulating Game Objects at Runtime

```lua
-- Get/set position
local pos = go.get_position()           -- this object
local pos = go.get_position("/enemy")   -- another object
go.set_position(vmath.vector3(100, 200, 0))

-- Get/set rotation
local rot = go.get_rotation()
go.set_rotation(vmath.quat_rotation_z(math.rad(45)))

-- Get/set scale
go.set_scale(vmath.vector3(2, 2, 1))
go.set_scale(2)  -- uniform scale shorthand

-- Delete a game object
go.delete()          -- delete this object
go.delete("/enemy")  -- delete another object
```

### Parent-Child Relationships

Game objects can be parented at runtime. Children inherit their parent's transform:

```lua
-- Make "weapon" follow "player"
go.set_parent("/weapon", "/player")

-- Detach from parent (back to world space)
go.set_parent("/weapon", nil)
```

**Important:** parenting only affects transform inheritance. Messages, lifecycle, and deletion are independent — deleting a parent does **not** automatically delete its children unless you handle that explicitly.

---

## Components

Components give game objects their capabilities. You add components in the editor by right-clicking a game object → Add Component.

### Core Component Types

| Component | File | Purpose |
|-----------|------|---------|
| Script | `.script` | Game logic (Lua). Has `init`, `update`, `on_message`, `on_input`, `final`. |
| Sprite | `.sprite` (inline) | 2D image rendering with animations. |
| Collection Factory | `.collectionfactory` | Spawns entire collections at runtime. |
| Factory | `.factory` | Spawns individual game objects at runtime. |
| Collision Object | `.collisionobject` (inline) | Physics body with shapes. |
| Sound | `.sound` (inline) | Audio playback. |
| Tilemap | `.tilemap` | Tile-based level rendering. |
| Particle FX | `.particlefx` | Particle systems. |
| GUI | `.gui` | Screen-space UI (separate coordinate system). |
| Label | `.label` (inline) | Simple text rendering in world space. |
| Spine Model | `.spinemodel` | Spine skeletal animation. |
| Model | `.model` | 3D model rendering. |

A game object can have **multiple components** of the same type (e.g., two sprites for layered visuals), each with a unique component id.

---

## Collections

A collection is a tree of game objects and nested sub-collections, saved as a `.collection` file. Collections are Defold's primary organizational unit.

### The Bootstrap Collection

Every Defold project has a bootstrap collection defined in `game.project`:

```ini
[bootstrap]
main_collection = /main/main.collection
```

This is the first collection loaded when the game starts. All other content is either placed inside it or spawned dynamically via factories.

### Sub-Collections

You can nest collections inside other collections to organize your game:

```
main.collection
  ├─ level.collection (sub-collection reference)
  │    ├─ ground (game object)
  │    ├─ enemies.collection (sub-collection reference)
  │    │    ├─ goblin (game object)
  │    │    └─ orc (game object)
  │    └─ pickups (game object)
  └─ hud (game object with GUI component)
```

Sub-collections are **references** to `.collection` files. Changes to the source file are reflected everywhere it's used.

### Addressing Across Collections

Objects in sub-collections are addressed by path:

```lua
-- From main.collection, address an object in a sub-collection
msg.post("/level/enemies/goblin#script", "take_damage", { amount = 10 })
```

The path segments correspond to the collection/object hierarchy in the Outline.

---

## Script Properties (go.property)

Script properties expose values to the editor, allowing per-instance customization without changing code.

### Defining Properties

```lua
-- enemy.script
go.property("health", 100)
go.property("speed", 150.0)
go.property("patrol_target", vmath.vector3(0, 0, 0))
go.property("color", vmath.vector4(1, 0, 0, 1))
go.property("sprite_url", msg.url("#sprite"))
go.property("atlas_anim", hash("idle"))

function init(self)
    -- Access as self.<property_name>
    self.current_health = self.health
    go.animate(".", "position.x", go.PLAYBACK_LOOP_PINGPONG,
        self.patrol_target.x, go.EASING_INOUTSINE, 2)
end
```

### Supported Types

| Type | Example | Notes |
|------|---------|-------|
| `number` | `go.property("speed", 100)` | Integer or float |
| `hash` | `go.property("state", hash("idle"))` | Enum-like values |
| `msg.url` | `go.property("target", msg.url())` | Component reference |
| `vmath.vector3` | `go.property("offset", vmath.vector3())` | Position, direction |
| `vmath.vector4` | `go.property("color", vmath.vector4())` | Color, RGBA |
| `vmath.quaternion` | `go.property("rot", vmath.quat())` | Rotation |
| `resource.*` | `go.property("img", resource.atlas())` | Dynamic resource swap |
| `bool` | `go.property("active", true)` | Boolean toggle |

### Overriding at Spawn Time

When spawning via factory, you can override script properties:

```lua
-- Override health and speed for this specific instance
local props = { [hash("/enemy")] = { health = 200, speed = 50 } }
local ids = collectionfactory.create("#enemy_factory", pos, rot, props, scale)
```

---

## Factories (Dynamic Spawning)

Factories create game objects or collections at runtime. This is how you spawn bullets, enemies, pickups, and anything not placed in the editor.

### Factory (Single Game Object)

```lua
-- In the editor: add a Factory component pointing to a .go file
-- At runtime:
function on_message(self, message_id, message, sender)
    if message_id == hash("spawn_bullet") then
        local pos = go.get_position()
        local rot = go.get_rotation()
        local props = { speed = 500, damage = 10 }
        local id = factory.create("#bullet_factory", pos, rot, props)
        -- id is the new game object's instance id
    end
end
```

### Collection Factory (Hierarchy of Objects)

For spawning complex entities made of multiple game objects:

```lua
function spawn_enemy_group(self, pos)
    local props = {
        [hash("/leader")] = { health = 200 },
        [hash("/minion1")] = { health = 50 },
        [hash("/minion2")] = { health = 50 },
    }
    local ids = collectionfactory.create("#group_factory", pos, nil, props)
    -- ids is a table mapping original ids to spawned instance ids
    -- e.g., ids[hash("/leader")] = hash("/collection0/leader")
end
```

### Dynamic Loading

By default, factory resources are loaded with the collection. For large games, enable **dynamic loading** on the factory component to load resources on demand:

```lua
-- Load resources asynchronously
collectionfactory.load("#enemy_factory", function(self, url, result)
    if result then
        -- Resources ready, safe to spawn
        collectionfactory.create(url, pos)
    end
end)

-- Unload when no longer needed
collectionfactory.unload("#enemy_factory")
```

---

## Lifecycle Callbacks

Every script component receives these callbacks in order:

```lua
function init(self)
    -- Called once when the game object is created.
    -- Use for setup: acquire input, set initial state, start animations.
    msg.post(".", "acquire_input_focus")
    self.speed = 200
end

function update(self, dt)
    -- Called every frame. dt is seconds since last frame.
    -- Use for continuous logic: movement, AI, timers.
end

function fixed_update(self, dt)
    -- Called at a fixed rate (set in game.project).
    -- Use for physics and deterministic simulation.
    -- As of Defold 1.12+, called BEFORE update().
end

function on_message(self, message_id, message, sender)
    -- Called when a message is received.
end

function on_input(self, action_id, action)
    -- Called when input is received (requires acquire_input_focus).
    -- Return true to consume the input, false/nil to pass it along.
end

function on_reload(self)
    -- Called on hot reload in the editor. Use for dev-time reinitialization.
end

function final(self)
    -- Called when the game object is deleted.
    -- Use for cleanup: release input, cancel timers.
    msg.post(".", "release_input_focus")
end
```

### Call Order Within a Frame

As of Defold 1.12+:

1. `fixed_update(dt)` — fixed timestep, may run 0 or more times
2. `update(dt)` — once per frame
3. Message dispatch — `on_message` callbacks fire
4. `late_update(dt)` — runs after messages, before rendering
5. Render script executes

---

## Common Patterns

### Object Pooling

Instead of creating and deleting objects constantly (which can cause allocation overhead), reuse them:

```lua
-- pool_manager.script
go.property("pool_size", 20)

function init(self)
    self.pool = {}
    self.active = {}
    for i = 1, self.pool_size do
        local id = factory.create("#bullet_factory")
        msg.post(id, "disable")  -- hide and deactivate
        table.insert(self.pool, id)
    end
end

function on_message(self, message_id, message, sender)
    if message_id == hash("get_from_pool") then
        if #self.pool > 0 then
            local id = table.remove(self.pool)
            go.set_position(message.pos, id)
            msg.post(id, "enable")
            table.insert(self.active, id)
            msg.post(sender, "pool_object", { id = id })
        end
    elseif message_id == hash("return_to_pool") then
        msg.post(message.id, "disable")
        table.insert(self.pool, message.id)
    end
end
```

### Collection Proxies (Level Loading)

For loading entire levels or screens dynamically:

```lua
-- Add a Collection Proxy component pointing to "level2.collection"
-- Load and enable it:
msg.post("#level_proxy", "load")

function on_message(self, message_id, message, sender)
    if message_id == hash("proxy_loaded") then
        msg.post(sender, "enable")   -- start the collection
    end
end

-- Later, to unload:
msg.post("#level_proxy", "disable")
msg.post("#level_proxy", "final")
msg.post("#level_proxy", "unload")
```

---

## Common Pitfalls

1. **IDs must be unique within a collection.** Two game objects in the same collection cannot share an id. Sub-collections are namespaced, so `/enemies/orc` and `/allies/orc` are distinct.

2. **Deleting a parent doesn't delete children** (runtime parenting via `go.set_parent`). You must track and clean up children yourself.

3. **Factory-spawned objects get generated IDs** like `/collection0/enemy`. Store the returned IDs if you need to reference them later.

4. **Script properties are per-instance.** Changing `self.health` on one enemy doesn't affect another, even if they share the same `.script` file.

5. **Collection proxy worlds are isolated.** Objects in a proxy-loaded collection cannot directly address objects in the main collection by path. Use `msg.post` with the full URL including the collection name.

6. **Memory limits are pre-allocated.** If you hit "max instances" errors, increase the limits in `game.project` under the relevant section (e.g., `sprite.max_count`, `factory.max_count`).
