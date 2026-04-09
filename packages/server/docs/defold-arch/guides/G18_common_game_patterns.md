# G18 — Common Game Patterns

> **Category:** guide · **Engine:** Defold · **Related:** [E1 Architecture Overview](../architecture/E1_architecture_overview.md) · [G1 Message Passing](G1_message_passing.md) · [G2 Game Objects & Collections](G2_game_objects_and_collections.md) · [G4 Physics & Collisions](G4_physics_and_collisions.md) · [G5 Input & Properties](G5_input_and_properties.md)

---

## Overview

Defold provides game objects, message passing, collections, and a component-based architecture, but it doesn't prescribe how to build a platformer, a top-down RPG, or a tower defense game. This guide covers proven architectural patterns for common 2D genres, using Defold idioms: message passing for communication, `go.property` for tuning, factories for spawning, and collection proxies for scene boundaries.

---

## Finite State Machines

State machines are the most common pattern in Defold game logic. Since Defold scripts already have a message-based architecture, FSMs fit naturally.

### Table-Driven FSM

```lua
-- player.script

local STATES = {
    idle = {
        enter = function(self)
            msg.post("#sprite", "play_animation", { id = hash("idle") })
        end,
        update = function(self, dt)
            if self.input_move ~= 0 then
                return "run"
            end
            if self.input_jump then
                return "jump"
            end
        end,
    },
    run = {
        enter = function(self)
            msg.post("#sprite", "play_animation", { id = hash("run") })
        end,
        update = function(self, dt)
            local pos = go.get_position()
            pos.x = pos.x + self.input_move * self.speed * dt
            go.set_position(pos)
            if self.input_move == 0 then
                return "idle"
            end
            if self.input_jump then
                return "jump"
            end
        end,
    },
    jump = {
        enter = function(self)
            msg.post("#sprite", "play_animation", { id = hash("jump") })
            self.velocity_y = self.jump_force
        end,
        update = function(self, dt)
            self.velocity_y = self.velocity_y + self.gravity * dt
            local pos = go.get_position()
            pos.x = pos.x + self.input_move * self.speed * dt
            pos.y = pos.y + self.velocity_y * dt
            go.set_position(pos)
            if self.grounded then
                return self.input_move ~= 0 and "run" or "idle"
            end
        end,
    },
}

local function change_state(self, new_state)
    if new_state and new_state ~= self.state then
        self.state = new_state
        local s = STATES[new_state]
        if s and s.enter then s.enter(self) end
    end
end

function init(self)
    msg.post(".", "acquire_input_focus")
    self.input_move = 0
    self.input_jump = false
    self.velocity_y = 0
    self.grounded = false
    self.state = "idle"
    STATES.idle.enter(self)
end

function update(self, dt)
    local s = STATES[self.state]
    if s and s.update then
        local next_state = s.update(self, dt)
        change_state(self, next_state)
    end
    -- Reset one-shot inputs
    self.input_jump = false
end

function on_input(self, action_id, action)
    if action_id == hash("move_left") then
        self.input_move = action.released and 0 or -1
    elseif action_id == hash("move_right") then
        self.input_move = action.released and 0 or 1
    elseif action_id == hash("jump") and action.pressed then
        self.input_jump = true
    end
end
```

**Why table-driven?** Adding a new state (e.g., `dash`, `wall_slide`) means adding a table entry, not rewriting `if/elseif` chains. States are self-contained and testable as plain Lua tables.

---

## Platformer Pattern

### Architecture

```
level.collection
├── player.go          (player.script, sprite, collision object)
├── tilemap.go         (tilemap component, collision object)
├── camera.go          (camera script — follows player)
├── enemies.go         (collection of enemy game objects via factory)
└── hud.go             (gui component for score/health)
```

### Kinematic Platformer (No Physics Engine)

For tight platformer controls, many developers skip Box2D and use raycast-based ground detection with manual velocity:

```lua
-- player.script
go.property("speed", 200)
go.property("jump_force", 400)
go.property("gravity", -900)

function init(self)
    msg.post(".", "acquire_input_focus")
    self.velocity = vmath.vector3()
    self.grounded = false
    self.input_x = 0
    self.jump_pressed = false
end

function update(self, dt)
    -- Horizontal movement
    self.velocity.x = self.input_x * self.speed

    -- Gravity
    self.velocity.y = self.velocity.y + self.gravity * dt

    -- Apply velocity
    local pos = go.get_position()
    pos.x = pos.x + self.velocity.x * dt
    pos.y = pos.y + self.velocity.y * dt
    go.set_position(pos)

    -- Jump (only when grounded)
    if self.jump_pressed and self.grounded then
        self.velocity.y = self.jump_force
        self.grounded = false
    end

    -- Reset per-frame input
    self.jump_pressed = false
end

function on_message(self, message_id, message, sender)
    if message_id == hash("contact_point_response") then
        -- Resolve collision: push out of solid surfaces
        if message.normal.y > 0.7 then
            self.grounded = true
            self.velocity.y = 0
        end
        -- Separate from the colliding surface
        go.set_position(go.get_position() + message.normal * message.distance)
    end
end

function on_input(self, action_id, action)
    if action_id == hash("move_left") then
        self.input_x = action.released and 0 or -1
    elseif action_id == hash("move_right") then
        self.input_x = action.released and 0 or 1
    elseif action_id == hash("jump") and action.pressed then
        self.jump_pressed = true
    end
end
```

### One-Way Platforms

Use collision groups and check the normal direction:

```lua
function on_message(self, message_id, message, sender)
    if message_id == hash("contact_point_response") then
        -- Only collide if player is above the platform (falling down onto it)
        if message.group == hash("one_way") then
            if message.normal.y > 0.7 and self.velocity.y <= 0 then
                self.grounded = true
                self.velocity.y = 0
                go.set_position(go.get_position() + message.normal * message.distance)
            end
            -- Ignore collisions from below or the side
        else
            -- Normal solid collision
            handle_solid_collision(self, message)
        end
    end
end
```

---

## Top-Down RPG Pattern

### Architecture

```
overworld.collection
├── player.go           (player.script, sprite, collision)
├── npc_factory.go      (factory for spawning NPCs)
├── tilemap.go          (tilemap, collision for walls)
├── trigger_zones/      (invisible collision objects for area triggers)
│   ├── door_zone.go
│   └── dialog_zone.go
├── dialog_manager.go   (handles dialog display via messages)
└── camera.go           (smooth follow camera)
```

### Four-Directional Movement

```lua
-- player.script
go.property("speed", 120)

function init(self)
    msg.post(".", "acquire_input_focus")
    self.direction = vmath.vector3()
    self.facing = hash("down")
end

function update(self, dt)
    if vmath.length(self.direction) > 0 then
        local move = vmath.normalize(self.direction) * self.speed * dt
        go.set_position(go.get_position() + move)
        -- Update facing for animation
        if math.abs(self.direction.x) > math.abs(self.direction.y) then
            self.facing = self.direction.x > 0 and hash("right") or hash("left")
        else
            self.facing = self.direction.y > 0 and hash("up") or hash("down")
        end
        msg.post("#sprite", "play_animation", { id = hash("walk_" .. self.facing) })
    else
        msg.post("#sprite", "play_animation", { id = hash("idle_" .. self.facing) })
    end
end

function on_input(self, action_id, action)
    if action_id == hash("move_up") then
        self.direction.y = action.released and 0 or 1
    elseif action_id == hash("move_down") then
        self.direction.y = action.released and 0 or -1
    elseif action_id == hash("move_left") then
        self.direction.x = action.released and 0 or -1
    elseif action_id == hash("move_right") then
        self.direction.x = action.released and 0 or 1
    elseif action_id == hash("interact") and action.pressed then
        msg.post("/dialog_manager", "try_interact", {
            position = go.get_position(),
            facing = self.facing,
        })
    end
end
```

### Trigger Zones via Message Passing

```lua
-- trigger_zone.script (attached to an invisible collision object)
go.property("target_collection", hash("level2"))
go.property("message_name", hash("enter_door"))

function on_message(self, message_id, message, sender)
    if message_id == hash("trigger_response") then
        if message.enter and message.other_group == hash("player") then
            msg.post("/level_manager", self.message_name, {
                target = self.target_collection,
            })
        end
    end
end
```

---

## Spawning and Object Pooling

### Factory Spawning with Tracking

```lua
-- enemy_spawner.script
go.property("spawn_interval", 2.0)
go.property("max_enemies", 10)

function init(self)
    self.enemies = {}
    self.timer = 0
end

function update(self, dt)
    self.timer = self.timer + dt
    if self.timer >= self.spawn_interval and #self.enemies < self.max_enemies then
        self.timer = 0
        local pos = get_random_spawn_position()
        local id = factory.create("#enemy_factory", pos, nil, {
            speed = 80 + math.random(40),
        })
        table.insert(self.enemies, id)
    end
end

function on_message(self, message_id, message, sender)
    if message_id == hash("enemy_died") then
        -- Remove from tracking table
        for i, id in ipairs(self.enemies) do
            if id == message.id then
                table.remove(self.enemies, i)
                go.delete(message.id)
                break
            end
        end
    end
end
```

### Object Pool (Disable/Enable)

For bullets, particles, or other high-frequency objects, pooling avoids allocation overhead:

```lua
-- bullet_pool.script
go.property("pool_size", 50)

function init(self)
    self.pool = {}
    self.active = {}
    for i = 1, self.pool_size do
        local id = factory.create("#bullet_factory", vmath.vector3(0, -1000, 0))
        msg.post(id, "disable")
        table.insert(self.pool, id)
    end
end

function on_message(self, message_id, message, sender)
    if message_id == hash("fire") then
        if #self.pool > 0 then
            local id = table.remove(self.pool)
            go.set_position(message.position, id)
            go.set_rotation(message.rotation, id)
            msg.post(id, "enable")
            msg.post(id .. "#bullet", "activate", {
                direction = message.direction,
                speed = message.speed,
            })
            table.insert(self.active, id)
        end
    elseif message_id == hash("return_to_pool") then
        for i, id in ipairs(self.active) do
            if id == message.id then
                table.remove(self.active, i)
                msg.post(id, "disable")
                go.set_position(vmath.vector3(0, -1000, 0), id)
                table.insert(self.pool, id)
                break
            end
        end
    end
end
```

---

## Scene / Level Transitions

Use collection proxies for clean level loading and unloading:

```lua
-- level_manager.script

function init(self)
    self.current_proxy = nil
end

function on_message(self, message_id, message, sender)
    if message_id == hash("load_level") then
        -- Unload current level if one is loaded
        if self.current_proxy then
            msg.post(self.current_proxy, "disable")
            msg.post(self.current_proxy, "final")
            msg.post(self.current_proxy, "unload")
        end
        -- Load the new level
        self.current_proxy = msg.url(nil, nil, message.proxy_id)
        msg.post(self.current_proxy, "load")

    elseif message_id == hash("proxy_loaded") then
        msg.post(sender, "init")
        msg.post(sender, "enable")
    end
end
```

For smoother transitions, insert a fade-to-black GUI between the unload and load steps using `go.animate` on a GUI node's alpha.

---

## Manager Pattern (Singleton via Shared Module)

When you need a single source of truth (inventory, quest state, save data), use a shared Lua module — not a game object:

```lua
-- modules/inventory.lua
local M = {}

local items = {}

function M.add(item_id, count)
    items[item_id] = (items[item_id] or 0) + (count or 1)
end

function M.remove(item_id, count)
    local current = items[item_id] or 0
    items[item_id] = math.max(0, current - (count or 1))
    if items[item_id] == 0 then items[item_id] = nil end
end

function M.get_count(item_id)
    return items[item_id] or 0
end

function M.get_all()
    return items
end

function M.serialize()
    return items  -- ready for sys.save()
end

function M.deserialize(data)
    items = data or {}
end

return M
```

**Why a module instead of a game object?** Modules are synchronous (no message round-trip), persist across collection proxy loads/unloads, and are easy to unit test. Use message passing for game object communication; use modules for shared data and logic.

---

## Checklist: Choosing the Right Pattern

| Genre | Movement | Collision | Scene Management | Key Pattern |
|-------|----------|-----------|-----------------|-------------|
| Platformer | Kinematic velocity | `contact_point_response` + normals | Collection proxies per level | Table-driven FSM for player states |
| Top-Down RPG | 4/8-dir normalized | Tilemap collision + trigger zones | Proxies for overworld/dungeons | Shared module for inventory/quest state |
| Shoot-'em-up | Constant scroll + offset | Group-based (bullet vs enemy) | Single collection, factory waves | Object pooling for bullets |
| Puzzle | Grid-snapped or tween | Logical (grid checks, not physics) | Single collection, state in module | State machine for puzzle rules |
| Tower Defense | Pathfinding (waypoints) | Range checks (distance, not physics) | Factory for towers and enemies | Shared module for economy/wave data |
