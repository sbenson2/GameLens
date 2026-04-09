# G21 — Animation & Spritesheets

> **Category:** guide · **Engine:** Love2D · **Related:** [G2 Graphics & Rendering](G2_graphics_and_rendering.md) · [G1 Game Loop & Callbacks](G1_game_loop_and_callbacks.md) · [R2 Common Libraries](../reference/R2_common_libraries.md)

Sprite animation is fundamental to 2D games. LÖVE provides the low-level building blocks — Quads and draw calls — but leaves animation management to you. This guide covers both the manual approach and the popular anim8 library.

---

## Core Concept: Quads

A **Quad** defines a rectangular sub-region of a texture. Instead of loading individual image files per frame, you load one spritesheet and use Quads to select which frame to draw.

```lua
-- love.graphics.newQuad(x, y, width, height, sheetWidth, sheetHeight)
local quad = love.graphics.newQuad(0, 0, 32, 32, sheet:getDimensions())
```

When you call `love.graphics.draw(sheet, quad, x, y)`, LÖVE draws only the rectangular region defined by the Quad.

---

## Manual Spritesheet Animation

For simple cases (a single walk cycle, a coin spin), you can manage animation with a table of Quads and a timer.

### Step 1: Build a Quad Table

Assuming a horizontal spritesheet where each frame is `frameW × frameH` pixels:

```lua
local sheet, quads, frameW, frameH

function love.load()
    sheet = love.graphics.newImage("player_walk.png")
    frameW, frameH = 32, 32

    quads = {}
    local sheetW, sheetH = sheet:getDimensions()
    for x = 0, sheetW - frameW, frameW do
        table.insert(quads, love.graphics.newQuad(x, 0, frameW, frameH, sheetW, sheetH))
    end
end
```

### Step 2: Track Time and Current Frame

```lua
local currentFrame = 1
local elapsed = 0
local frameDuration = 0.1  -- seconds per frame

function love.update(dt)
    elapsed = elapsed + dt
    if elapsed >= frameDuration then
        elapsed = elapsed - frameDuration
        currentFrame = currentFrame % #quads + 1
    end
end
```

### Step 3: Draw the Current Frame

```lua
function love.draw()
    love.graphics.draw(sheet, quads[currentFrame], 100, 100)
end
```

### Handling Multi-Row Spritesheets

When frames are arranged in a grid (multiple rows and columns):

```lua
local function buildQuadGrid(sheet, frameW, frameH)
    local quads = {}
    local sheetW, sheetH = sheet:getDimensions()
    local cols = math.floor(sheetW / frameW)
    local rows = math.floor(sheetH / frameH)

    for row = 0, rows - 1 do
        for col = 0, cols - 1 do
            table.insert(quads, love.graphics.newQuad(
                col * frameW, row * frameH,
                frameW, frameH,
                sheetW, sheetH
            ))
        end
    end
    return quads
end
```

**Spritesheet tip:** Leave at least 1 pixel of transparent padding between frames to prevent texture bleeding when filtering is enabled.

---

## Using anim8

The **anim8** library (by kikito) is the de facto standard for LÖVE animation. It wraps the Quad-and-timer pattern into a clean API with grids, per-frame durations, and flip support.

### Installation

Drop `anim8.lua` into your project (typically `lib/anim8.lua`) and require it:

```lua
local anim8 = require("lib.anim8")
```

### Creating a Grid

A Grid maps frame coordinates onto a spritesheet. You address frames by column and row number (1-indexed).

```lua
-- anim8.newGrid(frameWidth, frameHeight, imageWidth, imageHeight, left, top, border)
local grid = anim8.newGrid(32, 32, sheet:getDimensions())
```

Optional parameters:
- `left`, `top` (default 0): Pixel offset to the first frame.
- `border` (default 0): Pixel gap between frames (padding/gutters).

### Selecting Frames

Call the grid as a function with column and row arguments:

```lua
grid('1-4', 1)          -- columns 1 through 4 in row 1
grid(1, '1-3')          -- column 1 in rows 1 through 3
grid(3, 4)              -- single frame at column 3, row 4
grid('1-4', 1, '3-1', 1)  -- forward then reverse (ping-pong loop)
```

### Creating an Animation

```lua
-- anim8.newAnimation(frames, durations, onLoop)
local walkRight = anim8.newAnimation(grid('1-6', 1), 0.1)
```

**durations** can be:
- A single number: all frames share this duration.
- A table of numbers: one duration per frame.
- A table with range keys: `{ ['1-3'] = 0.1, ['4-6'] = 0.15 }`.

**onLoop** (optional):
- A function called each time the animation loops. Receives the animation and the overshoot time.
- The string `"pauseAtEnd"`: animation plays once and stops on the last frame.

### Animation Methods

```lua
function love.update(dt)
    walkRight:update(dt)
end

function love.draw()
    walkRight:draw(sheet, x, y, angle, scaleX, scaleY, originX, originY)
end
```

| Method | Description |
|--------|-------------|
| `anim:update(dt)` | Advance the animation timer |
| `anim:draw(image, x, y, r, sx, sy, ox, oy, kx, ky)` | Draw the current frame (same args as `love.graphics.draw`) |
| `anim:gotoFrame(n)` | Jump to frame `n` (1-indexed) |
| `anim:pause()` | Freeze on the current frame |
| `anim:resume()` | Continue from where it was paused |
| `anim:clone()` | Create an independent copy, reset to frame 1 |
| `anim:flipH()` | Mirror horizontally (returns self for chaining) |
| `anim:flipV()` | Mirror vertically (returns self for chaining) |
| `anim:pauseAtEnd()` | Jump to the last frame and pause |
| `anim:pauseAtStart()` | Jump to the first frame and pause |
| `anim:getDimensions()` | Return width and height of the current frame |

### Flipping for Direction

`flipH()` and `flipV()` are toggle operations that modify draw offsets internally. They do not create new Quads, so they are allocation-free.

```lua
local walkLeft = walkRight:clone():flipH()
```

---

## Animation State Machine

Games typically have multiple animations per entity (idle, walk, jump, attack). A common pattern is a state table that maps states to animations:

```lua
local anim8 = require("lib.anim8")

local player = {}

function player:load(sheet)
    self.sheet = sheet
    local g = anim8.newGrid(32, 32, sheet:getDimensions())

    self.animations = {
        idle      = anim8.newAnimation(g('1-4', 1), 0.15),
        walk      = anim8.newAnimation(g('1-6', 2), 0.1),
        jump      = anim8.newAnimation(g('1-2', 3), 0.1, "pauseAtEnd"),
        attack    = anim8.newAnimation(g('1-4', 4), 0.08, "pauseAtEnd"),
    }
    self.currentAnim = self.animations.idle
    self.facingRight = true
end

function player:setState(state)
    local newAnim = self.animations[state]
    if newAnim and newAnim ~= self.currentAnim then
        self.currentAnim = newAnim
        self.currentAnim:gotoFrame(1)
        self.currentAnim:resume()
    end
end

function player:update(dt)
    self.currentAnim:update(dt)
end

function player:draw(x, y)
    local anim = self.currentAnim
    if not self.facingRight then
        -- Temporarily flip, draw, then flip back
        anim:flipH()
        anim:draw(self.sheet, x, y)
        anim:flipH()
    else
        anim:draw(self.sheet, x, y)
    end
end
```

**Why flip/draw/flip instead of cloning?** Cloning doubles memory. If you only need directional flipping at draw time, toggling is cheaper. Clone when you need two independent playback timers (e.g., two characters using the same animation at different points).

---

## Tweening and Interpolation

Frame-by-frame isn't the only form of animation. For smooth movement, scaling, rotation, and fading, use **tweening** (in-between interpolation).

The **flux** library provides a simple interface:

```lua
local flux = require("lib.flux")

-- Tween player.x from current value to 400 over 1 second with ease-out
flux.to(player, 1.0, { x = 400 }):ease("quadout")
```

The **hump.timer** library offers `tween` and `after` for timer-based sequences:

```lua
local Timer = require("lib.hump.timer")

-- Flash red for 0.2 seconds, then return to white
Timer.tween(0.2, player, { r = 1, g = 0, b = 0 }, "linear", function()
    Timer.tween(0.2, player, { r = 1, g = 1, b = 1 })
end)
```

Call `flux.update(dt)` or `Timer.update(dt)` in `love.update`.

---

## Performance Tips

1. **Load spritesheets once.** Call `love.graphics.newImage` in `love.load`. Never in `update` or `draw`.
2. **Prefer SpriteBatches for many animated entities.** If you draw 100+ animated sprites each frame, a SpriteBatch reduces draw calls:
   ```lua
   local batch = love.graphics.newSpriteBatch(sheet, 200)

   function love.draw()
       batch:clear()
       for _, entity in ipairs(entities) do
           batch:add(entity.currentQuad, entity.x, entity.y)
       end
       love.graphics.draw(batch)
   end
   ```
3. **Reuse Quads.** Quads are lightweight objects, but creating them every frame wastes cycles. Build them once.
4. **Power-of-two textures** load faster on some GPUs. Pad your spritesheets to 256×256, 512×512, etc., when practical.
5. **Texture atlases** (one large image with multiple entity spritesheets) reduce texture swaps. Tools like TexturePacker export LÖVE-compatible atlas data.

---

## Common Pitfalls

| Pitfall | Fix |
|---------|-----|
| Frames bleed into neighbors | Add 1px transparent padding between frames; set `image:setFilter("nearest", "nearest")` for pixel art |
| Animation plays too fast/slow | Check that you're passing `dt` to `update`, not a fixed value |
| Flipped sprite draws at wrong position | Adjust the origin (`ox`) to the frame width when flipping: `love.graphics.draw(sheet, quad, x + frameW, y, 0, -1, 1)` |
| Animation doesn't restart on state change | Call `gotoFrame(1)` and `resume()` when switching animations |
| anim8 durations table doesn't work | Range keys must be strings: `{ ['1-3'] = 0.1 }`, not `{ [1-3] = 0.1 }` |
