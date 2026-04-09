# R1 — API Quick Reference

> **Category:** reference · **Engine:** Defold · **Related:** [E1 Architecture Overview](../architecture/E1_architecture_overview.md) · [G1 Message Passing](../guides/G1_message_passing.md) · [G2 Game Objects & Collections](../guides/G2_game_objects_and_collections.md)

---

Defold's Lua API is organized into namespaces that mirror the engine's component-based architecture. Most functions operate on URLs (`"#component"`, `"/go_id#component"`) or the current game object (`"."`).

---

## Core Namespaces

| Namespace | Domain | Key Guide |
|-----------|--------|-----------|
| `go` | Game objects — properties, animation, lifecycle | [G2](../guides/G2_game_objects_and_collections.md) |
| `msg` | Message passing between scripts | [G1](../guides/G1_message_passing.md) |
| `sprite` | Sprite components — flipbook playback | [G7](../guides/G7_animation_and_audio.md) |
| `sound` | Sound components — playback and mixing | [G7](../guides/G7_animation_and_audio.md) |
| `gui` | GUI nodes — layout, animation, input | [G3](../guides/G3_gui_system.md) |
| `physics` | Collision objects, ray casts | [G4](../guides/G4_physics_and_collisions.md) |
| `factory` | Spawning game objects at runtime | [G2](../guides/G2_game_objects_and_collections.md) |
| `collectionfactory` | Spawning entire collections at runtime | [G2](../guides/G2_game_objects_and_collections.md) |
| `vmath` | Vectors, matrices, quaternions | — |
| `sys` | System info, save/load, app lifecycle | — |
| `http` | HTTP requests | — |
| `timer` | Delayed and repeating callbacks | — |
| `crash` | Crash reporting | — |
| `profiler` | Runtime profiler control | — |

---

## go — Game Objects

The `go` namespace controls game object lifecycle, properties, and animation.

### Properties

```lua
-- Get/set built-in properties
local pos = go.get_position()               -- returns vmath.vector3
local pos = go.get_position("/enemy")       -- specific game object
go.set_position(vmath.vector3(100, 200, 0))

local rot = go.get_rotation()               -- returns vmath.quat
go.set_rotation(rot)

local scale = go.get_scale()                -- returns vmath.vector3
go.set_scale(2.0)                           -- uniform scale
go.set_scale(vmath.vector3(2, 1, 1))        -- non-uniform

-- Generic get/set (works for component properties too)
go.get(".", "position.x")                   -- single component
go.set(".", "position.x", 100)
go.get("#sprite", "tint")                   -- component property
go.set("#sprite", "tint", vmath.vector4(1, 0, 0, 1))
```

### Script Properties (go.property)

Declare editable properties that appear in the Defold editor:

```lua
go.property("speed", 200)                    -- number
go.property("health", 100)                   -- number
go.property("target", msg.url())             -- url
go.property("color", vmath.vector4(1,1,1,1)) -- color
go.property("material", resource.material()) -- resource reference
```

Access in the same script via `self.speed`, `self.health`, etc.

### Animation

```lua
go.animate(url, property, playback, to, easing, duration, [delay], [complete_function])
go.cancel_animations(url, [property])

-- Playback constants
go.PLAYBACK_ONCE_FORWARD
go.PLAYBACK_ONCE_BACKWARD
go.PLAYBACK_ONCE_PINGPONG
go.PLAYBACK_LOOP_FORWARD
go.PLAYBACK_LOOP_BACKWARD
go.PLAYBACK_LOOP_PINGPONG
```

### Lifecycle

```lua
go.delete()                    -- delete self
go.delete("/enemy")            -- delete by id
go.delete({ "/a", "/b" })     -- batch delete
go.exists("/enemy")            -- returns bool (Defold 1.6.2+)
```

---

## msg — Messages

```lua
msg.post(receiver, message_id, [message_table])
msg.url([socket], [path], [fragment])
```

Common built-in messages:

| Message | Receiver | Purpose |
|---------|----------|---------|
| `"enable"` | component | Enable a component |
| `"disable"` | component | Disable a component |
| `"acquire_input_focus"` | game object | Start receiving input |
| `"release_input_focus"` | game object | Stop receiving input |
| `"set_parent"` | game object | Re-parent game object, `{ parent_id = id, keep_world_transform = 0 }` |

---

## sprite

```lua
sprite.play_flipbook(url, id, [complete_function], [play_properties])
sprite.set_hflip(url, flip)        -- horizontal flip (bool)
sprite.set_vflip(url, flip)        -- vertical flip (bool)
```

Properties accessible via `go.get/go.set`: `tint` (vector4), `cursor` (0–1 normalized playback position), `playback_rate`, `scale`, `size`.

---

## sound

```lua
sound.play(url, [play_properties], [complete_function])
sound.stop(url)
sound.pause(url, pause)            -- pause=true/false
sound.set_gain(url, gain)
sound.set_pan(url, pan)

-- Mixer group functions
sound.get_groups()                 -- returns table of group hashes
sound.get_group_gain(group_hash)
sound.set_group_gain(group_hash, gain)
sound.get_group_name(group_hash)   -- returns string
sound.get_rms(group_hash, window)  -- returns left, right RMS
sound.get_peak(group_hash, window) -- returns left, right peak
sound.is_phone_call_active()       -- iOS: check if call is active
```

---

## factory / collectionfactory

```lua
-- Spawn a single game object
local id = factory.create("#enemy_factory", [position], [rotation], [properties], [scale])

-- Spawn an entire collection
local ids = collectionfactory.create("#level_factory", [position], [rotation], [properties], [scale])

-- Get/set factory status
factory.get_status("#enemy_factory")  -- factory.STATUS_UNLOADED / LOADING / LOADED
factory.load("#enemy_factory", [complete_function])
factory.unload("#enemy_factory")
```

---

## gui

```lua
-- Node access
local node = gui.get_node("button")
gui.set_position(node, vmath.vector3(x, y, 0))
gui.set_text(node, "Hello")
gui.set_color(node, vmath.vector4(1, 0, 0, 1))
gui.set_enabled(node, true)

-- Flipbook on GUI
gui.play_flipbook(node, hash("anim_name"))

-- Property animation on GUI nodes
gui.animate(node, property, to, easing, duration, [delay], [complete_function], [playback])
gui.cancel_animation(node, property)

-- Picking (hit test)
gui.pick_node(node, x, y)  -- returns bool
```

---

## vmath

```lua
vmath.vector3(x, y, z)
vmath.vector4(x, y, z, w)
vmath.quat()                            -- identity quaternion
vmath.quat_from_to(v1, v2)
vmath.quat_rotation_z(angle_radians)

vmath.length(v)
vmath.length_sqr(v)
vmath.normalize(v)
vmath.dot(v1, v2)
vmath.cross(v1, v2)
vmath.lerp(t, v1, v2)                   -- linear interpolation
vmath.slerp(t, q1, q2)                  -- spherical lerp for quats

vmath.matrix4()
vmath.matrix4_from_quat(q)
vmath.inv(m)                            -- matrix inverse
```

---

## sys

```lua
-- Save/load (binary, stored in app-specific location)
sys.save(filename, table)        -- e.g., sys.save("save.dat", { level = 3 })
sys.load(filename)               -- returns table or empty table

-- System info
sys.get_sys_info()               -- returns table: device_model, system_name, system_version, language, etc.
sys.get_engine_info()            -- returns table: version, version_sha1, is_debug
sys.get_application_info(id)     -- check if app is installed (mobile)

-- Lifecycle
sys.exit(code)                   -- exit application
sys.reboot(arg1, ...)            -- relaunch engine with args
sys.open_url(url)                -- open URL in default browser
sys.set_error_handler(handler)   -- custom error handler
```

---

## timer

```lua
-- One-shot timer (delay in seconds)
local handle = timer.delay(2.0, false, function(self, handle, time_elapsed)
    print("2 seconds passed")
end)

-- Repeating timer
local handle = timer.delay(1.0, true, function(self, handle, time_elapsed)
    print("tick")
end)

-- Cancel a timer
timer.cancel(handle)

-- Get remaining time info
local info = timer.get_info(handle)  -- returns { time_remaining, delay, repeating }
```

---

## http

```lua
http.request(url, method, callback, [headers], [post_data], [options])

-- Example: GET request
http.request("https://api.example.com/data", "GET", function(self, id, response)
    if response.status == 200 then
        local data = json.decode(response.response)
    end
end)
```

---

## Script Lifecycle Callbacks

Every Defold script (`.script`, `.gui_script`, `.render_script`) can implement these functions:

| Callback | When it runs |
|----------|-------------|
| `init(self)` | Once when the component is created |
| `final(self)` | Once when the component is destroyed |
| `update(self, dt)` | Every frame (dt = delta time in seconds) |
| `fixed_update(self, dt)` | Fixed timestep update (for physics) |
| `on_message(self, message_id, message, sender)` | When a message is received |
| `on_input(self, action_id, action)` | When input is received (requires input focus) |
| `on_reload(self)` | When the script is hot-reloaded in the editor |
