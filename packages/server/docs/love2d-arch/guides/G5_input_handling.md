# G5 — Input Handling

> **Category:** guide · **Engine:** Love2D · **Related:** [G1 Game Loop & Callbacks](G1_game_loop_and_callbacks.md) · [R1 Module Reference](../reference/R1_module_reference.md)

---

## Two Input Models

LÖVE gives you two ways to read input, and most games use both:

| Model | API | Best For |
|-------|-----|----------|
| **Callbacks** | `love.keypressed`, `love.mousepressed`, etc. | Discrete one-shot events (jump, shoot, pause) |
| **Polling** | `love.keyboard.isDown`, `love.mouse.getPosition`, etc. | Continuous held-state queries (movement, aiming) |

Callbacks fire once per event inside `love.run()`'s event pump. Polling reads the current device state and belongs in `love.update(dt)`.

---

## Keyboard

### Polling

```lua
function love.update(dt)
    local dx, dy = 0, 0
    if love.keyboard.isDown("w", "up")    then dy = dy - 1 end
    if love.keyboard.isDown("s", "down")  then dy = dy + 1 end
    if love.keyboard.isDown("a", "left")  then dx = dx - 1 end
    if love.keyboard.isDown("d", "right") then dx = dx + 1 end

    -- Normalize diagonal movement
    local len = math.sqrt(dx * dx + dy * dy)
    if len > 0 then
        dx, dy = dx / len, dy / len
    end

    player.x = player.x + dx * player.speed * dt
    player.y = player.y + dy * player.speed * dt
end
```

`isDown` accepts multiple key names — it returns `true` if **any** of them are held.

### Callbacks

```lua
function love.keypressed(key, scancode, isrepeat)
    if key == "space" and not isrepeat then
        player:jump()
    end
    if key == "escape" then
        love.event.quit()
    end
end

function love.keyreleased(key, scancode)
    if key == "space" then
        player:cancelJump()  -- Variable-height jump
    end
end

function love.textinput(text)
    -- Receives actual characters (respects keyboard layout, IME)
    -- Use this for text fields, NOT keypressed
    chatInput = chatInput .. text
end
```

**`key` vs `scancode`:** `key` follows the user's keyboard layout (AZERTY users get `"z"` for the top-left letter). `scancode` is the physical key position — use it when you want WASD to work regardless of layout:

```lua
function love.keypressed(key, scancode, isrepeat)
    if scancode == "w" then  -- Physical top-left key, any layout
        moveUp()
    end
end
```

### Key Repeat

By default, `love.keypressed` does **not** fire repeatedly when a key is held. Enable it with:

```lua
love.keyboard.setKeyRepeat(true)
```

Then check `isrepeat` to distinguish held-key repeats from the initial press.

---

## Mouse

### Polling

```lua
function love.update(dt)
    local mx, my = love.mouse.getPosition()
    aimAngle = math.atan2(my - player.y, mx - player.x)

    if love.mouse.isDown(1) then  -- 1 = left, 2 = right, 3 = middle
        player:shoot(aimAngle)
    end
end
```

### Callbacks

```lua
function love.mousepressed(x, y, button, istouch, presses)
    if button == 1 then
        onLeftClick(x, y)
    elseif button == 2 then
        onRightClick(x, y)
    end
    -- presses = click count (2 for double-click)
end

function love.mousereleased(x, y, button, istouch, presses)
    if button == 1 then
        endDrag()
    end
end

function love.mousemoved(x, y, dx, dy, istouch)
    -- dx, dy = movement since last frame
    if isDragging then
        camera.x = camera.x - dx
        camera.y = camera.y - dy
    end
end

function love.wheelmoved(x, y)
    -- y > 0 = scroll up, y < 0 = scroll down
    camera.zoom = camera.zoom + y * 0.1
end
```

### Mouse Capture and Visibility

```lua
love.mouse.setVisible(false)          -- Hide cursor (custom cursor)
love.mouse.setGrabbed(true)           -- Confine to window
love.mouse.setRelativeMode(true)      -- Infinite mouse (FPS-style)
```

In relative mode, `love.mousemoved` still fires with `dx, dy`, but the cursor stays locked in place.

---

## Touch (Mobile)

Touch callbacks mirror mouse events but carry a unique `id` per finger:

```lua
function love.touchpressed(id, x, y, dx, dy, pressure)
    touches[id] = { x = x, y = y }
end

function love.touchmoved(id, x, y, dx, dy, pressure)
    touches[id].x = x
    touches[id].y = y
end

function love.touchreleased(id, x, y, dx, dy, pressure)
    touches[id] = nil
end
```

**Pinch-to-zoom pattern:**

```lua
function love.update(dt)
    local active = love.touch.getTouches()
    if #active == 2 then
        local x1, y1 = love.touch.getPosition(active[1])
        local x2, y2 = love.touch.getPosition(active[2])
        local dist = math.sqrt((x2 - x1)^2 + (y2 - y1)^2)
        if lastPinchDist then
            local scale = dist / lastPinchDist
            camera.zoom = camera.zoom * scale
        end
        lastPinchDist = dist
    else
        lastPinchDist = nil
    end
end
```

---

## Gamepad / Joystick

LÖVE wraps SDL's gamepad database. Controllers that match known layouts (Xbox, PlayStation, Switch Pro) expose standardized names via the "gamepad" API. Unknown controllers fall back to raw joystick axes/buttons.

### Detecting Controllers

```lua
function love.joystickadded(joystick)
    if joystick:isGamepad() then
        gamepad = joystick
        print("Gamepad connected: " .. joystick:getName())
    end
end

function love.joystickremoved(joystick)
    if joystick == gamepad then
        gamepad = nil
    end
end
```

### Polling Gamepad State

```lua
function love.update(dt)
    if not gamepad then return end

    -- Left stick (returns -1..1 on each axis)
    local lx = gamepad:getGamepadAxis("leftx")
    local ly = gamepad:getGamepadAxis("lefty")

    -- Apply deadzone
    local deadzone = 0.25
    if math.abs(lx) < deadzone then lx = 0 end
    if math.abs(ly) < deadzone then ly = 0 end

    player.x = player.x + lx * player.speed * dt
    player.y = player.y + ly * player.speed * dt

    -- Right trigger (0..1)
    local rt = gamepad:getGamepadAxis("triggerright")
    if rt > 0.5 then
        player:shoot()
    end
end
```

### Gamepad Callbacks

```lua
function love.gamepadpressed(joystick, button)
    -- button: "a", "b", "x", "y", "start", "back",
    --         "dpup", "dpdown", "dpleft", "dpright",
    --         "leftshoulder", "rightshoulder",
    --         "leftstick", "rightstick"
    if button == "a" then
        player:jump()
    end
end

function love.gamepadreleased(joystick, button)
    if button == "a" then
        player:cancelJump()
    end
end
```

### Standard Axis Names

| Axis | Description |
|------|-------------|
| `leftx` | Left stick horizontal (-1 left, +1 right) |
| `lefty` | Left stick vertical (-1 up, +1 down) |
| `rightx` | Right stick horizontal |
| `righty` | Right stick vertical |
| `triggerleft` | Left trigger (0..1) |
| `triggerright` | Right trigger (0..1) |

---

## Input Abstraction Pattern

LÖVE has no built-in action mapping. For games that support rebinding and multiple input devices, wrap input behind an action layer:

```lua
local Input = {}
local bindings = {
    jump   = { key = "space",  gamepad = "a" },
    shoot  = { key = "z",      gamepad = "x", mouse = 1 },
    left   = { key = "a",      gamepad_axis = { "leftx", -1 } },
    right  = { key = "d",      gamepad_axis = { "leftx",  1 } },
    up     = { key = "w",      gamepad_axis = { "lefty", -1 } },
    down   = { key = "s",      gamepad_axis = { "lefty",  1 } },
}

local pressed_this_frame = {}

function Input.pressed(action)
    return pressed_this_frame[action] == true
end

function Input.down(action)
    local b = bindings[action]
    if b.key and love.keyboard.isDown(b.key) then return true end
    if b.mouse and love.mouse.isDown(b.mouse) then return true end
    if b.gamepad and gamepad and gamepad:isGamepadDown(b.gamepad) then return true end
    if b.gamepad_axis and gamepad then
        local axis, dir = b.gamepad_axis[1], b.gamepad_axis[2]
        local val = gamepad:getGamepadAxis(axis)
        if dir > 0 and val > 0.25 then return true end
        if dir < 0 and val < -0.25 then return true end
    end
    return false
end

-- Call from love.keypressed / love.gamepadpressed
function Input.onPressed(action)
    pressed_this_frame[action] = true
end

-- Call at end of love.update
function Input.endFrame()
    pressed_this_frame = {}
end

return Input
```

For production games, community libraries like **baton** and **boipushy** provide full-featured input management with chording, axes, and rebinding UI support.

---

## Common Pitfalls

**Mixing up `key` and `scancode` for movement.** WASD bindings should use `scancode` so the physical keys stay consistent across keyboard layouts.

**Forgetting diagonal normalization.** Polling two axes independently gives ~1.41x speed diagonally. Always normalize the direction vector.

**Gamepad deadzone.** Analog sticks rarely rest at exactly 0. Without a deadzone, characters will drift. A threshold of 0.2–0.3 works for most controllers.

**Using `keypressed` for text input.** The `keypressed` callback gives you key constants, not characters. Use `love.textinput(text)` for anything the user types as text (chat, name entry, search).

**Reading input in `love.draw()`.** Input polling works in draw, but acting on it there mixes rendering with logic. Keep all input reads in `love.update(dt)`.
