# G15 — Lua Scripting Patterns

> **Category:** guide · **Engine:** Defold · **Related:** [G1 Message Passing](G1_message_passing.md) · [G2 Game Objects & Collections](G2_game_objects_and_collections.md) · [G5 Input & Properties](G5_input_and_properties.md) · [R1 API Reference](../reference/R1_api_reference.md)

---

Defold scripts are Lua files attached to game objects as script components. The engine calls a fixed set of lifecycle callbacks on each script, and communication between scripts happens via message passing — not direct function calls. This guide covers idiomatic patterns for writing clean, performant Defold Lua.

---

## Script Lifecycle

Every `.script` file can define these callbacks. You only need to include the ones you use — omitting a callback tells the engine to skip it entirely, which is a free performance win.

```lua
function init(self)
    -- Called once when the game object is created.
    -- Initialize state on self.
    self.speed = 200
    self.health = 100
    self.direction = vmath.vector3(0, 0, 0)
end

function final(self)
    -- Called when the game object is deleted.
    -- Clean up timers, release resources, unsubscribe.
end

function fixed_update(self, dt)
    -- Called 0–N times per frame at a fixed rate.
    -- Use for physics manipulation and deterministic simulation.
    -- Requires: game.project → Physics → Use Fixed Timestep = true
end

function update(self, dt)
    -- Called once per frame after all fixed_update calls.
    -- Use for rendering-related movement and non-physics logic.
end

function late_update(self, dt)
    -- Called after all update() calls, before rendering.
    -- Ideal for camera follow (ensures it sees final positions).
end

function on_message(self, message_id, message, sender)
    -- Called when this script receives a message via msg.post().
end

function on_input(self, action_id, action)
    -- Called when input is received (requires acquire_input_focus).
    -- Return true to consume the input, false/nil to pass it on.
end

function on_reload(self)
    -- Called on hot-reload (Editor → Reload Resource).
    -- Useful for re-reading properties during development.
end
```

---

## The `self` Table

`self` is a plain Lua table unique to each script component instance. The engine provides it — you never create it. Store all per-instance state on `self`:

```lua
function init(self)
    self.velocity = vmath.vector3(0, 0, 0)
    self.coins = 0
    self.is_grounded = false
end
```

**Rules:**

- `self` is private to each instance. Two copies of the same game object each get their own `self`.
- Never store `self` in a global or module table — the reference becomes stale if the game object is deleted.
- Avoid adding fields to `self` outside `init()` unless the field is explicitly optional. This keeps the instance shape predictable.

---

## Reactive vs. Polling

Defold's architecture strongly favors reactive design — responding to messages and events rather than polling every frame.

### Polling (expensive, avoid when possible)

```lua
function update(self, dt)
    -- Runs every frame even when nothing is happening
    local pos = go.get_position("/door")
    if vmath.length(pos - go.get_position()) < 50 then
        msg.post("/door", "open")
    end
end
```

### Reactive (preferred)

```lua
-- The trigger zone sends a message on collision
function on_message(self, message_id, message, sender)
    if message_id == hash("trigger_response") then
        if message.enter then
            msg.post("/door", "open")
        end
    end
end
-- No update() needed at all — the engine skips this script each frame
```

**Guideline:** If your `update()` function is just checking a condition and acting on it, ask whether a collision trigger, a timer, or an incoming message could replace the check. Removing `update()` entirely is a measurable performance improvement when many game objects are involved.

### Timers Instead of Counters

```lua
-- Instead of counting frames in update()...
function init(self)
    self.timer = 0
end
function update(self, dt)
    self.timer = self.timer + dt
    if self.timer >= 2.0 then
        self.timer = 0
        spawn_enemy()
    end
end

-- ...use timer.delay() and remove update()
function init(self)
    timer.delay(2.0, true, function(self)
        spawn_enemy()
    end)
end
-- No update() function needed
```

---

## go.property() — Exposable Configuration

`go.property()` declares a property that is visible and editable in the Defold editor. It must be called at the **top level** of the script — outside any function.

```lua
-- Top-level declarations
go.property("speed", 200)
go.property("health", 100)
go.property("target", msg.url())       -- URL property (link to another object)
go.property("color", vmath.vector4(1, 1, 1, 1))
go.property("material", resource.material("/materials/sprite.material"))

function init(self)
    -- self.speed, self.health, self.target, self.color are set
    -- from the editor values (or the defaults above)
    print("Speed:", self.speed)
end
```

**Supported types:** `number`, `hash`, `msg.url()`, `vmath.vector3()`, `vmath.vector4()`, `vmath.quat()`, `resource.*` (atlas, material, font, texture, tile_source).

### Behavior Object Pattern

Use a `go.property("target", msg.url())` to create reusable behavior scripts that act on arbitrary targets:

```lua
-- follow.script — attach to any game object
go.property("target", msg.url())
go.property("speed", 100)
go.property("min_distance", 16)

function update(self, dt)
    if self.target == msg.url() then return end  -- no target set
    local my_pos = go.get_position()
    local target_pos = go.get_position(self.target)
    local diff = target_pos - my_pos
    local dist = vmath.length(diff)
    if dist > self.min_distance then
        local dir = vmath.normalize(diff)
        go.set_position(my_pos + dir * self.speed * dt)
    end
end
```

In the editor, drag the target game object onto the `target` property to wire up the reference. This avoids hard-coding paths and makes the behavior reusable across collections.

---

## Message Passing Patterns

### Direct Messaging

```lua
-- Send to a specific game object's script
msg.post("/enemy#script", "take_damage", { amount = 25 })

-- Send to a component on the same game object
msg.post("#sprite", "play_animation", { id = hash("walk") })

-- Send to self
msg.post(".", "reset")
```

### Broadcast via a Manager

Defold has no built-in broadcast. A common pattern is a manager script that tracks subscribers:

```lua
-- event_manager.lua (Lua module, not a script component)
local M = {}
local listeners = {}

function M.subscribe(url, event)
    listeners[event] = listeners[event] or {}
    table.insert(listeners[event], url)
end

function M.broadcast(event, message)
    local subs = listeners[event]
    if subs then
        for i = #subs, 1, -1 do
            msg.post(subs[i], event, message or {})
        end
    end
end

function M.unsubscribe(url, event)
    local subs = listeners[event]
    if subs then
        for i = #subs, 1, -1 do
            if subs[i] == url then
                table.remove(subs, i)
            end
        end
    end
end

return M
```

```lua
-- In subscriber scripts:
local events = require("main.events.event_manager")

function init(self)
    events.subscribe(msg.url(), "enemy_defeated")
end

function on_message(self, message_id, message, sender)
    if message_id == hash("enemy_defeated") then
        self.score = self.score + message.points
    end
end

function final(self)
    events.unsubscribe(msg.url(), "enemy_defeated")
end
```

### Request–Response

When one script needs data from another, send a message and have the receiver reply to `sender`:

```lua
-- requester.script
function init(self)
    msg.post("/inventory#script", "get_item_count", { item = hash("potion") })
end

function on_message(self, message_id, message, sender)
    if message_id == hash("item_count_response") then
        print("Potions:", message.count)
    end
end

-- inventory.script
function on_message(self, message_id, message, sender)
    if message_id == hash("get_item_count") then
        local count = self.items[message.item] or 0
        msg.post(sender, "item_count_response", { count = count })
    end
end
```

---

## Lua Modules for Shared Logic

Reusable logic that is not tied to a game object belongs in a Lua module — a plain `.lua` file that returns a table. Modules are loaded with `require()` and cached by the engine.

```lua
-- utils/math_utils.lua
local M = {}

function M.lerp(a, b, t)
    return a + (b - a) * t
end

function M.clamp(value, min, max)
    return math.max(min, math.min(max, value))
end

function M.angle_between(x1, y1, x2, y2)
    return math.atan2(y2 - y1, x2 - x1)
end

return M
```

```lua
-- In any script:
local math_utils = require("utils.math_utils")

function update(self, dt)
    self.health_display = math_utils.lerp(self.health_display, self.health, dt * 5)
end
```

**Important:** Modules are singletons — `require()` returns the same cached table. If you store mutable state in a module, it is shared across all scripts that require it. This is useful for global game state (score, settings) but dangerous if you expect per-instance isolation.

---

## State Machines

Many game objects cycle through discrete states (idle → walk → attack → hurt). A table-based state machine keeps `update()` and `on_message()` clean:

```lua
local states = {}

states.idle = {
    enter = function(self)
        msg.post("#sprite", "play_animation", { id = hash("idle") })
    end,
    update = function(self, dt)
        if self.input_move ~= 0 then
            change_state(self, "walk")
        end
    end,
}

states.walk = {
    enter = function(self)
        msg.post("#sprite", "play_animation", { id = hash("walk") })
    end,
    update = function(self, dt)
        local pos = go.get_position()
        pos.x = pos.x + self.input_move * self.speed * dt
        go.set_position(pos)
        if self.input_move == 0 then
            change_state(self, "idle")
        end
    end,
}

function change_state(self, name)
    local new_state = states[name]
    if new_state and new_state ~= self.state then
        self.state = new_state
        self.state_name = name
        if new_state.enter then new_state.enter(self) end
    end
end

function init(self)
    self.speed = 200
    self.input_move = 0
    change_state(self, "idle")
end

function update(self, dt)
    if self.state and self.state.update then
        self.state.update(self, dt)
    end
end
```

---

## Performance Patterns

### Localize Globals

Lua looks up global variables through a table chain. Localizing frequently used functions avoids repeated lookups:

```lua
local vmath_length = vmath.length
local vmath_normalize = vmath.normalize
local go_get_position = go.get_position
local go_set_position = go.set_position

function update(self, dt)
    local pos = go_get_position()
    -- ...
end
```

### Avoid Table Creation in Hot Paths

```lua
-- Bad: creates a new vector3 every frame
function update(self, dt)
    go.set_position(go.get_position() + vmath.vector3(self.speed * dt, 0, 0))
end

-- Better: reuse a scratch vector
function init(self)
    self.move_vec = vmath.vector3()
end

function update(self, dt)
    self.move_vec.x = self.speed * dt
    self.move_vec.y = 0
    self.move_vec.z = 0
    go.set_position(go.get_position() + self.move_vec)
end
```

### Use `hash()` Constants

Hashing a string is not free. Hash your message IDs and animation names once:

```lua
local MSG_TAKE_DAMAGE = hash("take_damage")
local MSG_DIE = hash("die")
local ANIM_HURT = hash("hurt")

function on_message(self, message_id, message, sender)
    if message_id == MSG_TAKE_DAMAGE then
        self.health = self.health - message.amount
        if self.health <= 0 then
            msg.post(".", MSG_DIE)
        end
    end
end
```

---

## Common Pitfalls

| Pitfall | What happens | Fix |
|---|---|---|
| Storing `self` in a module | Reference becomes stale on delete → crash or silent corruption | Pass `msg.url()` and communicate via messages |
| Forgetting `final()` cleanup | Timers fire on deleted objects, listeners accumulate | Always cancel timers and unsubscribe in `final()` |
| Calling `go.delete()` in `update()` while iterating | Deletion is deferred — safe, but the object still processes the rest of this frame | Send a `"die"` message and delete in `on_message()` for clarity |
| Using `==` to compare hashes with strings | Always false — `hash("foo") ~= "foo"` | Compare hash to hash, or pre-hash constants |
| Modifying `go.property` values at top level with runtime data | `go.property()` runs at parse time, not runtime | Set defaults only; modify via `self.prop = value` in `init()` |
