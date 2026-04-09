# G5 — Input Handling & Script Properties

> **Category:** guide · **Engine:** Defold · **Related:** [G1 Message Passing](G1_message_passing.md) · [G2 Game Objects & Collections](G2_game_objects_and_collections.md) · [E1 Architecture Overview](../architecture/E1_architecture_overview.md)

---

## Input System Overview

Defold's input system has three layers:

1. **Input Bindings** — a `.input_binding` file that maps hardware events (keys, mouse buttons, touch, gamepad) to named **actions** (hashed strings).
2. **Input Focus** — a game object must **acquire input focus** before it receives input.
3. **`on_input` callback** — the script function that handles each action.

This design decouples your game logic from specific hardware. The same action (`"jump"`) can be bound to spacebar, gamepad A, and touch simultaneously — your script only sees `"jump"`.

---

## Input Bindings File

The default file is `/input/game.input_binding` in your project. It defines trigger types:

| Trigger Type | Use Case | Example |
|-------------|----------|---------|
| **Key Triggers** | Keyboard keys → actions | `KEY_SPACE` → `"jump"` |
| **Mouse Triggers** | Mouse buttons → actions | `MOUSE_BUTTON_LEFT` → `"shoot"` |
| **Touch Triggers** | Single or multi-touch | `TOUCH_MULTI` → `"touch"` |
| **Gamepad Triggers** | Buttons and sticks | `GAMEPAD_LSTICK_UP` → `"move_up"` |
| **Text Triggers** | Raw text input (typing) | Used for chat/name entry |

**Important:** Mouse movement events are only sent if at least one mouse trigger exists in the bindings file. A `MOUSE_MOVEMENT` binding with no action is enough to enable movement tracking.

---

## Acquiring Input Focus

A game object does **not** receive input by default. You must explicitly acquire focus:

```lua
function init(self)
    msg.post(".", "acquire_input_focus")
end

function final(self)
    msg.post(".", "release_input_focus")
end
```

### Input Stack

Multiple objects can hold input focus simultaneously. They form a **stack** — the most recently acquired focus receives input first. If `on_input` returns `true`, the input is **consumed** and not passed to objects lower in the stack.

```lua
-- Pause menu script — consumes all input so gameplay below doesn't respond
function on_input(self, action_id, action)
    if action_id == hash("escape") and action.pressed then
        unpause()
    end
    return true   -- consume: nothing below receives this input
end
```

If `on_input` returns `false` (or nil), the action continues down the stack.

---

## The on_input Callback

```lua
function on_input(self, action_id, action)
```

### Parameters

**`action_id`** — A `hash` of the action name from input bindings, or `nil` for unbound mouse/touch movement.

**`action`** — A table with fields that vary by input type:

| Field | Type | Description |
|-------|------|-------------|
| `action.pressed` | boolean | `true` on the frame the button/key was pressed |
| `action.released` | boolean | `true` on the frame the button/key was released |
| `action.repeated` | boolean | `true` on OS key-repeat events (held key) |
| `action.value` | number | 0 or 1 for digital, 0.0–1.0 for analog triggers |
| `action.x` | number | Current cursor/touch X position (screen coords) |
| `action.y` | number | Current cursor/touch Y position (screen coords) |
| `action.dx` | number | X movement delta since last frame |
| `action.dy` | number | Y movement delta since last frame |
| `action.screen_x` | number | X in screen pixels (before projection) |
| `action.screen_y` | number | Y in screen pixels (before projection) |
| `action.touch` | table | Multi-touch points (indexed 1–N), each with `x`, `y`, `dx`, `dy`, `pressed`, `released`, `id` |

### Common Patterns

**Discrete button press (jump, shoot):**
```lua
function on_input(self, action_id, action)
    if action_id == hash("jump") and action.pressed then
        -- Single press — fires once
        self.velocity.y = self.jump_force
    end
end
```

**Held button (movement):**
```lua
function on_input(self, action_id, action)
    if action_id == hash("move_right") then
        -- value is 1.0 while held, 0.0 when released
        self.direction.x = action.value
    end
end
```

**Mouse position tracking:**
```lua
function on_input(self, action_id, action)
    if not action_id then
        -- action_id is nil for pure mouse/touch movement
        self.cursor_x = action.x
        self.cursor_y = action.y
    end
end
```

**Multi-touch:**
```lua
function on_input(self, action_id, action)
    if action_id == hash("touch") and action.touch then
        for i, tp in ipairs(action.touch) do
            print("Touch point", tp.id, "at", tp.x, tp.y)
        end
    end
end
```

---

## Script Properties (go.property)

### Why Properties?

Script properties let you expose values in the Defold Editor so designers can tweak them per-instance **without touching code**. They also enable runtime reads/writes via `go.get()` and `go.set()`, and smooth animation via `go.animate()`.

### Defining Properties

`go.property()` must be called at the **top level** of a script file — outside any lifecycle callback.

```lua
-- player.script
go.property("speed", 200)                                   -- number
go.property("jump_force", 450)                               -- number
go.property("is_invincible", false)                          -- boolean
go.property("damage_type", hash("physical"))                 -- hash
go.property("spawn_point", vmath.vector3(0, 0, 0))          -- vector3
go.property("color_tint", vmath.vector4(1, 1, 1, 1))        -- vector4
go.property("target", msg.url())                             -- url (reference to another object)
```

### Supported Types

| Type | Default Value | Editor Widget |
|------|--------------|---------------|
| `number` | `0` | Number field |
| `boolean` | `false` | Checkbox |
| `hash` | `hash("")` | Text field (hashed at build) |
| `vmath.vector3` | `vmath.vector3()` | 3 number fields |
| `vmath.vector4` | `vmath.vector4()` | 4 number fields |
| `vmath.quaternion` | `vmath.quat()` | 4 number fields |
| `msg.url` | `msg.url()` | URL picker |
| `resource.*` | See below | Resource picker |

### Resource Properties

Resource properties reference engine assets and let you swap them per-instance in the Editor:

```lua
go.property("my_atlas", resource.atlas("/graphics/sprites.atlas"))
go.property("my_font", resource.font("/fonts/main.font"))
go.property("my_material", resource.material("/materials/sprite.material"))
go.property("my_texture", resource.texture("/textures/bg.png"))
go.property("my_tile_source", resource.tile_source("/tiles/level.tilesource"))
```

### Reading and Writing at Runtime

```lua
-- Read a property on this game object's script
local spd = go.get("#script", "speed")

-- Read a property on another game object
local hp = go.get("/enemy#script", "health")

-- Write a property
go.set("#script", "speed", 400)

-- Animate a property (smooth transitions)
go.animate("#script", "speed", go.PLAYBACK_ONCE_FORWARD, 0, go.EASING_INQUAD, 2.0)
```

### Accessing Sub-components

Vector properties expose individual components:

```lua
-- Animate only the X position of a game object
go.animate(".", "position.x", go.PLAYBACK_ONCE_FORWARD, 500, go.EASING_OUTBOUNCE, 1.0)

-- Read Y component of a vector3 property
local y = go.get("#script", "spawn_point.y")
```

### Properties vs. self Variables

| | `go.property()` | `self.variable` |
|---|---|---|
| Visible in Editor | Yes | No |
| Editable per-instance | Yes | No |
| Animatable with `go.animate()` | Yes | No |
| Accessible from other scripts | Yes (via `go.get/set`) | No |
| Can hold strings | No (use `hash`) | Yes |

**Rule of thumb:** If a designer might want to tweak it, or another script needs to read it, use `go.property()`. For internal bookkeeping (`self.is_jumping`, `self.timer`), use `self`.

---

## Putting It Together — Input-Driven Character

```lua
-- character.script
go.property("speed", 200)
go.property("jump_force", 500)

function init(self)
    msg.post(".", "acquire_input_focus")
    self.direction = vmath.vector3()
    self.grounded = false
end

function on_input(self, action_id, action)
    if action_id == hash("move_left") then
        self.direction.x = -action.value
    elseif action_id == hash("move_right") then
        self.direction.x = action.value
    elseif action_id == hash("jump") and action.pressed and self.grounded then
        local vel = go.get("#collisionobject", "linear_velocity")
        vel.y = self.jump_force     -- uses the exposed property
        go.set("#collisionobject", "linear_velocity", vel)
    end
end

function update(self, dt)
    local pos = go.get_position()
    pos.x = pos.x + self.direction.x * self.speed * dt
    go.set_position(pos)
    self.direction.x = 0
end

function final(self)
    msg.post(".", "release_input_focus")
end
```

A designer can now select this game object in the Editor, change `speed` to 350 and `jump_force` to 600, and see results without opening the script.

---

*Input bindings decouple hardware from game logic. Script properties decouple data from code. Together they let designers iterate without programmer bottlenecks.*
