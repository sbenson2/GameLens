# G11 — Resource Management

> **Category:** guide · **Engine:** Defold · **Related:** [E1 Architecture Overview](../architecture/E1_architecture_overview.md) · [G2 Game Objects & Collections](G2_game_objects_and_collections.md) · [G8 Hot Reload & Live Update](G8_hot_reload_and_live_update.md)

---

## The Static Resource Tree

Defold determines which resources to include in your game bundle by walking the **static resource tree**: everything referenced from the bootstrap collection is traced through its dependencies (game objects → components → atlases → images, etc.) and bundled automatically.

If a resource is not referenced anywhere in this tree, it is excluded from the bundle. This means you can have files in your project directory that never ship — only what the engine can trace from the bootstrap root gets included.

**Implication:** You don't write code to register or pre-load most assets. Defold handles this at build time. The flipside is that you cannot arbitrarily load a file by string path at runtime unless you plan for it with the mechanisms described below.

---

## Automatic vs. Manual Loading

| Mechanism | Loading | Unloading | Use Case |
|-----------|---------|-----------|----------|
| Static references (sprites, tilemaps, sounds) | Automatic at collection load | Automatic at collection unload | Fixed-level assets |
| Collection proxy | Manual via `msg.post(proxy, "load")` | Manual via `msg.post(proxy, "unload")` | Level streaming, game modes |
| Factory / Collection factory | Automatic (default) or manual (`Load Dynamically`) | Manual via `factory.unload()` | Spawning enemies, bullets, pickups |
| `sys.load_resource()` | Manual — returns raw bytes | Garbage collected | Custom binary data, JSON configs |

---

## Factories: Spawning Game Objects

A **Factory** component spawns copies of a single game object prototype. A **Collection Factory** spawns an entire collection hierarchy (a "prefab" of multiple objects).

### Basic Factory Usage

1. Add a Factory component to a game object in the editor.
2. Set its **Prototype** to the `.go` file you want to spawn.
3. From a script, call `factory.create`:

```lua
function on_input(self, action_id, action)
    if action_id == hash("fire") and action.pressed then
        local pos = go.get_position()
        local props = { speed = 600, damage = 10 }
        factory.create("#bullet_factory", pos, nil, props)
    end
end
```

`factory.create(url, [position], [rotation], [properties], [scale])` returns the id of the spawned game object.

### Collection Factory Usage

Collection factories work the same way but spawn a hierarchy. The return value is a **table** mapping collection-local ids to runtime instance ids:

```lua
local ids = collectionfactory.create("#enemy_squad_factory", pos)

-- ids maps hash("/leader") => the runtime id of the leader object
-- ids maps hash("/follower1") => the runtime id of follower1, etc.
local leader_id = ids[hash("/leader")]
go.set_position(vmath.vector3(100, 200, 0), leader_id)
```

### Passing Properties at Spawn Time

Define script properties with `go.property()`, then override them from the factory call:

```lua
-- enemy.script
go.property("health", 100)
go.property("speed", 50)

function init(self)
    self.hp = self.health  -- Use the (possibly overridden) value
end
```

```lua
-- spawner.script
local props = {}
props[hash("/enemy")] = { health = 200, speed = 80 }  -- Collection factory
-- or for a regular factory:
factory.create("#enemy_factory", pos, nil, { health = 200, speed = 80 })
```

---

## Dynamic Loading

By default, factory resources are loaded when the owning collection loads. For large games, this means everything referenced by every factory in the level loads upfront — which can spike memory and load times.

Enable **Load Dynamically** in the factory component's properties to defer loading.

### Synchronous (Simple but Blocking)

If you call `factory.create()` on a dynamically-loaded factory that hasn't been loaded yet, Defold loads the resources **synchronously** on that frame. This works but can cause a hitch:

```lua
-- Resources load NOW, may cause a frame spike
factory.create("#big_boss_factory", pos)
```

### Asynchronous (Recommended)

Pre-load resources with a callback, then spawn when ready:

```lua
function init(self)
    factory.load("#big_boss_factory", function(self, url, result)
        if result then
            self.boss_ready = true
        end
    end)
end

function spawn_boss(self, pos)
    if self.boss_ready then
        factory.create("#big_boss_factory", pos)
    end
end
```

The equivalent for collection factories:

```lua
collectionfactory.load("#level_factory", function(self, url, result)
    if result then
        self.level_ids = collectionfactory.create("#level_factory")
    end
end)
```

### Checking Load Status

```lua
local status = factory.get_status("#big_boss_factory")
-- Returns: factory.STATUS_UNLOADED, factory.STATUS_LOADING, or factory.STATUS_LOADED
```

### Unloading

When you're done with a factory's resources (e.g., the player left the area), release them:

```lua
factory.unload("#big_boss_factory")
```

Defold uses **reference counting**. Unloading a factory decrements the reference count on its resources. The actual memory is freed only when no other component references those resources.

---

## Dynamic Prototypes

Enable **Dynamic Prototype** on a factory to swap what it spawns at runtime:

```lua
-- Change a factory to spawn a different prototype
collectionfactory.set_prototype("#factory", "/levels/level_02.collectionc")

-- Must load after changing prototype
collectionfactory.load("#factory", function(self, url, result)
    if result then
        self.level_ids = collectionfactory.create("#factory")
    end
end)
```

**Note the `.collectionc` / `.goc` suffix** — at runtime, Defold uses compiled resource paths (with a `c` suffix), not the editor file extensions.

---

## Collection Proxies: Level Streaming

Collection proxies are the primary mechanism for loading and unloading entire game worlds. Unlike factories (which spawn objects into the current collection), proxies load a separate collection as an independent world with its own physics and update loop.

```lua
-- Load a level
msg.post("#level_proxy", "load")

-- In on_message, wait for it to finish
function on_message(self, message_id, message, sender)
    if message_id == hash("proxy_loaded") then
        msg.post(sender, "init")    -- Initialize scripts
        msg.post(sender, "enable")  -- Start updating
    end
end

-- Later, unload
msg.post("#level_proxy", "disable")
msg.post("#level_proxy", "final")
msg.post("#level_proxy", "unload")
```

### Memory Management With Proxies

Proxies own their resources. When you unload a proxy, all resources unique to that collection are freed. Resources shared with the main collection (common atlases, shared sounds) remain loaded through the main collection's reference.

**Common pattern for level transitions:**

```lua
function load_level(self, level_name)
    -- Unload current level
    if self.current_proxy then
        msg.post(self.current_proxy, "disable")
        msg.post(self.current_proxy, "final")
        msg.post(self.current_proxy, "unload")
    end
    -- Load new level
    self.current_proxy = "#" .. level_name .. "_proxy"
    msg.post(self.current_proxy, "load")
end
```

---

## sys.load_resource — Custom Files

For custom data files (JSON configs, binary data, CSV level data), use `sys.load_resource()`:

```lua
local json_str = sys.load_resource("/data/enemy_config.json")
local config = json.decode(json_str)
```

The path must be relative to the project root and the file must be included via **Custom Resources** in `game.project`:

```ini
[project]
custom_resources = /data/enemy_config.json,/data/dialogue/
```

Files listed here are bundled even though they aren't part of the normal resource tree.

---

## Memory Budget Tips

| Strategy | How |
|----------|-----|
| Profile with the built-in profiler | `Ctrl+P` in debug builds shows resource memory by type |
| Use `Load Dynamically` on large factories | Prevents loading assets for enemies/bosses the player may never encounter |
| Share atlases across objects | Multiple sprites referencing the same atlas = one copy in memory |
| Unload proxy collections when leaving areas | Don't keep three levels loaded if the player is in one |
| Prefer collection proxies over huge single collections | Splitting your game into proxy-loaded sections keeps peak memory lower |
| Use `profiler.get_memory_usage()` | Returns resident memory bytes used by the app (not available on HTML5) |
