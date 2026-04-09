# G1 — Game Loop & Callbacks

> **Category:** guide · **Engine:** Love2D · **Related:** [E1 Architecture Overview](../architecture/E1_architecture_overview.md) · [R1 Module Reference](../reference/R1_module_reference.md)

---

## The Default Game Loop

LÖVE's game loop lives in `love.run()`. The default implementation (simplified) looks like this:

```lua
function love.run()
    love.load(love.arg.parseGameArguments(arg), arg)

    local dt = 0
    return function()
        love.event.pump()               -- Process OS events
        for name, a, b, c, d, e, f in love.event.poll() do
            if name == "quit" then
                if not love.quit or not love.quit() then
                    return a or 0
                end
            end
            love.handlers[name](a, b, c, d, e, f)
        end

        dt = love.timer.step()          -- Measure frame time
        love.update(dt)                 -- Update game state
        love.graphics.origin()
        love.graphics.clear(love.graphics.getBackgroundColor())
        love.draw()                     -- Render
        love.graphics.present()         -- Flip buffers
        love.timer.sleep(0.001)         -- Yield to OS
    end
end
```

**Key takeaway:** `love.run()` calls your callbacks. You never call `love.update` or `love.draw` yourself.

---

## Core Callbacks

### love.load(arg)

Called once at startup, after `conf.lua` runs. Use it to load assets and initialize state.

```lua
function love.load()
    player = {
        x = 400, y = 300,
        speed = 200,
        sprite = love.graphics.newImage("assets/player.png")
    }
    font = love.graphics.newFont("assets/main.ttf", 16)
end
```

**Rules:**
- Load all images, sounds, and fonts here — not inside `update` or `draw`.
- `arg` contains command-line arguments (useful for debug flags).

### love.update(dt)

Called every frame. `dt` is the time in seconds since the last frame (typically ~0.016 at 60 FPS).

```lua
function love.update(dt)
    if love.keyboard.isDown("right") then
        player.x = player.x + player.speed * dt
    end
    if love.keyboard.isDown("left") then
        player.x = player.x - player.speed * dt
    end
end
```

**Rules:**
- Always multiply movement/physics by `dt` for frame-rate independence.
- Never draw anything here — `love.graphics` calls in update have no visible effect.
- Keep update logic fast; heavy computation stalls the entire frame.

### love.draw()

Called every frame after `update`. All rendering happens here.

```lua
function love.draw()
    love.graphics.draw(player.sprite, player.x, player.y)
    love.graphics.setFont(font)
    love.graphics.print("Score: " .. score, 10, 10)
end
```

**Rules:**
- Do not modify game state in `draw` — it should be a pure function of your current state.
- Drawing order matters: things drawn later appear on top.
- Use `love.graphics.push()`/`pop()` to isolate transform state (translate, rotate, scale).

---

## Input Callbacks

LÖVE provides both **callback-based** and **polling-based** input.

### Callback Style (Event-Driven)

```lua
function love.keypressed(key, scancode, isrepeat)
    if key == "space" then
        player:jump()
    end
end

function love.keyreleased(key)
    -- key was released
end

function love.mousepressed(x, y, button, istouch, presses)
    if button == 1 then  -- left click
        shoot(x, y)
    end
end

function love.mousereleased(x, y, button)
    -- mouse button released
end

function love.touchpressed(id, x, y, dx, dy, pressure)
    -- touch began (mobile)
end
```

### Polling Style (State-Based)

```lua
function love.update(dt)
    -- Continuous movement while key is held
    if love.keyboard.isDown("w") then
        player.y = player.y - player.speed * dt
    end

    -- Mouse position
    local mx, my = love.mouse.getPosition()
end
```

**When to use which:**
- **Callbacks** for discrete events: jump, shoot, menu select, pause toggle
- **Polling** for continuous actions: movement, aiming, camera control

---

## Window & Lifecycle Callbacks

```lua
function love.focus(focused)
    -- Window gained/lost focus — pause game if needed
    if not focused then
        paused = true
    end
end

function love.resize(w, h)
    -- Window was resized — update camera/viewport
end

function love.visible(visible)
    -- Window was minimized/restored
end

function love.quit()
    -- Return true to abort quit, false/nil to allow it
    saveGame()
    return false
end
```

---

## Fixed Timestep Pattern

The default loop uses variable `dt`, which works for most games. For deterministic physics or networked gameplay, replace `love.run()` with a fixed timestep:

```lua
function love.run()
    love.load(love.arg.parseGameArguments(arg), arg)

    local TICK_RATE = 1 / 60          -- 60 Hz fixed step
    local accumulator = 0
    local dt = 0

    return function()
        love.event.pump()
        for name, a, b, c, d, e, f in love.event.poll() do
            if name == "quit" then
                if not love.quit or not love.quit() then
                    return a or 0
                end
            end
            love.handlers[name](a, b, c, d, e, f)
        end

        dt = love.timer.step()
        accumulator = accumulator + dt

        while accumulator >= TICK_RATE do
            love.update(TICK_RATE)      -- Always same dt
            accumulator = accumulator - TICK_RATE
        end

        love.graphics.origin()
        love.graphics.clear(love.graphics.getBackgroundColor())
        love.draw()
        love.graphics.present()
        love.timer.sleep(0.001)
    end
end
```

---

## State Management Pattern

LÖVE has no built-in scene system. The simplest pattern is a state table:

```lua
local states = {}
local current_state = nil

function states.menu()
    return {
        update = function(self, dt) end,
        draw = function(self)
            love.graphics.print("Press Enter to Play", 300, 300)
        end,
        keypressed = function(self, key)
            if key == "return" then
                current_state = states.play()
            end
        end
    }
end

function states.play()
    local state = { score = 0 }
    state.update = function(self, dt)
        -- game logic
    end
    state.draw = function(self)
        love.graphics.print("Score: " .. self.score, 10, 10)
    end
    return state
end

-- Wire callbacks to current state
function love.load()
    current_state = states.menu()
end

function love.update(dt)
    current_state:update(dt)
end

function love.draw()
    current_state:draw()
end

function love.keypressed(key)
    if current_state.keypressed then
        current_state:keypressed(key)
    end
end
```

For richer features (state stacking, transitions, enter/leave hooks), use `hump.gamestate` or `roomy`.

---

## Error Handling

LÖVE shows a blue screen with a stack trace when an unhandled error occurs. You can customize this by defining `love.errorhandler(msg)` (called `love.errhand` in LÖVE < 11.0):

```lua
function love.errorhandler(msg)
    -- Custom error screen or logging
    print("Error: " .. tostring(msg))
    print(debug.traceback())
    return nil  -- return to default handler, or run a custom loop
end
```

---

## Summary: Callback Checklist

| Callback | When | Use For |
|----------|------|---------|
| `love.load()` | Once at startup | Asset loading, init |
| `love.update(dt)` | Every frame | Game logic, physics |
| `love.draw()` | Every frame after update | All rendering |
| `love.keypressed(key)` | Key down event | Discrete actions |
| `love.keyreleased(key)` | Key up event | Release handling |
| `love.mousepressed(x,y,btn)` | Mouse click | Click actions |
| `love.mousereleased(x,y,btn)` | Mouse release | Drag end |
| `love.touchpressed(id,x,y)` | Touch begin | Mobile input |
| `love.focus(f)` | Window focus change | Auto-pause |
| `love.resize(w,h)` | Window resize | Viewport update |
| `love.quit()` | Close requested | Save game, confirm |
