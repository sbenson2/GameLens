# G22 — Resolution Handling & Pixel Art Scaling

> **Category:** guide · **Engine:** Love2D · **Related:** [G2 Graphics & Rendering](G2_graphics_and_rendering.md) · [G1 Game Loop & Callbacks](G1_game_loop_and_callbacks.md) · [R2 Common Libraries](../reference/R2_common_libraries.md)

---

## The Problem

LÖVE games run on screens of wildly different sizes — a 320×180 pixel art game needs to look crisp on a 1920×1080 monitor, a 2560×1440 display, and a 720p phone. Without explicit handling, sprites will render at native pixel size (tiny on high-res screens) or scale with bilinear filtering (blurry pixel art).

Resolution independence in LÖVE comes down to one pattern: **render to a fixed-size canvas, then scale that canvas to fit the window.**

---

## Core Concepts

### Filter Modes

LÖVE applies texture filtering when images are drawn at non-native sizes. The filter mode determines whether scaled pixels look crisp or blurry.

```lua
-- Set globally in love.load() — affects all future Images, Canvases, and Fonts
love.graphics.setDefaultFilter("nearest", "nearest")
```

| FilterMode | Effect | Use Case |
|-----------|--------|----------|
| `"nearest"` | No interpolation — hard pixel edges | Pixel art, retro games |
| `"linear"` | Bilinear interpolation — smooth blending | HD art, photographs |

The first argument controls magnification (scaling up), the second controls minification (scaling down). For pixel art, set both to `"nearest"`.

**Important:** Call `setDefaultFilter` before loading any images. It only affects resources created after the call.

```lua
-- conf.lua — earliest possible place to set it
function love.conf(t)
    t.window.width = 960
    t.window.height = 540
end

-- main.lua
function love.load()
    love.graphics.setDefaultFilter("nearest", "nearest")
    -- NOW load images — they will use nearest filtering
    player_img = love.graphics.newImage("assets/player.png")
end
```

You can also set the filter on individual images after creation:

```lua
local img = love.graphics.newImage("assets/tileset.png")
img:setFilter("nearest", "nearest")
```

---

## Canvas Scaling (Manual Approach)

This is the fundamental pattern. Everything draws to a small canvas, and that canvas is scaled up to fill the window.

### Step 1: Define Your Game Resolution

Pick the native resolution your art is designed for. Common choices for pixel art:

| Style | Resolution | Aspect Ratio |
|-------|-----------|--------------|
| NES-like | 256×240 | 16:15 |
| SNES-like | 256×224 | 8:7 |
| GBA-like | 240×160 | 3:2 |
| Modern pixel | 320×180 | 16:9 |
| Modern pixel (large) | 480×270 | 16:9 |

### Step 2: Create and Render to the Canvas

```lua
-- Game resolution constants
local GAME_W, GAME_H = 320, 180

local canvas
local scale, offset_x, offset_y

function love.load()
    love.graphics.setDefaultFilter("nearest", "nearest")
    canvas = love.graphics.newCanvas(GAME_W, GAME_H)

    recalculate_scaling()
end

function recalculate_scaling()
    local win_w, win_h = love.graphics.getDimensions()

    -- Integer scaling: find the largest integer multiplier that fits
    scale = math.floor(math.min(win_w / GAME_W, win_h / GAME_H))
    scale = math.max(scale, 1) -- never go below 1x

    -- Center the scaled canvas (letterbox / pillarbox)
    offset_x = math.floor((win_w - GAME_W * scale) / 2)
    offset_y = math.floor((win_h - GAME_H * scale) / 2)
end

function love.draw()
    -- 1. Draw your game onto the small canvas
    love.graphics.setCanvas(canvas)
    love.graphics.clear(0.1, 0.1, 0.15)

    -- All game rendering happens here at GAME_W × GAME_H
    love.graphics.draw(player_img, player_x, player_y)
    draw_tilemap()
    draw_hud()

    love.graphics.setCanvas() -- back to the default screen

    -- 2. Draw the canvas scaled up to the window
    love.graphics.clear(0, 0, 0) -- black bars
    love.graphics.draw(canvas, offset_x, offset_y, 0, scale, scale)
end

function love.resize(w, h)
    recalculate_scaling()
end
```

### Step 3: Convert Mouse Coordinates

Mouse input is in window coordinates, not game coordinates. Convert them:

```lua
function screen_to_game(screen_x, screen_y)
    local game_x = (screen_x - offset_x) / scale
    local game_y = (screen_y - offset_y) / scale
    return game_x, game_y
end

function love.mousepressed(x, y, button)
    local gx, gy = screen_to_game(x, y)
    -- Use gx, gy for game logic
    if gx >= 0 and gx < GAME_W and gy >= 0 and gy < GAME_H then
        handle_click(gx, gy, button)
    end
end
```

---

## Integer vs. Fractional Scaling

### Integer Scaling

Multiply the canvas by a whole number (2×, 3×, 4×). Every game pixel maps to the same number of screen pixels — no distortion, perfectly uniform pixels.

**Downside:** Wastes screen space. A 320×180 game on a 1920×1080 screen scales to 5× (1600×900), leaving 320px of black bars.

### Fractional Scaling

Scale to fill as much of the screen as possible, even if the scale factor is not an integer (e.g., 5.33×).

```lua
function recalculate_scaling_fractional()
    local win_w, win_h = love.graphics.getDimensions()
    scale = math.min(win_w / GAME_W, win_h / GAME_H)
    offset_x = math.floor((win_w - GAME_W * scale) / 2)
    offset_y = math.floor((win_h - GAME_H * scale) / 2)
end
```

**Downside:** Some pixels will be slightly larger than others, causing shimmer on scrolling backgrounds. The `"nearest"` filter keeps edges sharp, but pixel sizes become uneven.

### Hybrid Approach

Use integer scaling by default, but allow the user to toggle "fill screen" in an options menu:

```lua
local use_integer_scaling = true

function recalculate_scaling()
    local win_w, win_h = love.graphics.getDimensions()
    if use_integer_scaling then
        scale = math.floor(math.min(win_w / GAME_W, win_h / GAME_H))
        scale = math.max(scale, 1)
    else
        scale = math.min(win_w / GAME_W, win_h / GAME_H)
    end
    offset_x = math.floor((win_w - GAME_W * scale) / 2)
    offset_y = math.floor((win_h - GAME_H * scale) / 2)
end
```

---

## Using the Push Library

[push](https://github.com/Ulydev/push) is the most widely used resolution-handling library for LÖVE. It wraps the canvas scaling pattern and handles window resize, fullscreen, and coordinate mapping.

### Setup

```lua
local push = require("lib.push")

local GAME_W, GAME_H = 320, 180
local WINDOW_W, WINDOW_H = 1280, 720

function love.load()
    love.graphics.setDefaultFilter("nearest", "nearest")

    push:setupScreen(GAME_W, GAME_H, WINDOW_W, WINDOW_H, {
        fullscreen = false,
        resizable = true,
        pixelperfect = true,  -- integer scaling only
        canvas = true,
    })
end

function love.draw()
    push:start()

    -- All game drawing at GAME_W × GAME_H
    love.graphics.draw(player_img, player_x, player_y)

    push:finish()
end

function love.resize(w, h)
    push:resize(w, h)
end
```

### Coordinate Conversion with Push

```lua
function love.mousepressed(x, y, button)
    local gx, gy = push:toGame(x, y)
    if gx and gy then
        handle_click(gx, gy, button)
    end
end
```

### Push Options Reference

| Option | Type | Default | Effect |
|--------|------|---------|--------|
| `fullscreen` | boolean | false | Start in fullscreen |
| `resizable` | boolean | false | Allow window resizing |
| `pixelperfect` | boolean | false | Integer scaling only |
| `canvas` | boolean | true | Use canvas (required for scaling) |
| `stencil` | boolean | true | Enable stencil buffer on canvas |

---

## Alternative: Shöve Library

[Shöve](https://github.com/Oval-Tutu/Shove) is a newer resolution-handling library that extends Push's functionality with additional scaling modes and shader support. It is a drop-in replacement for Push with these additions:

- Multiple scaling modes (integer, aspect-fill, stretch)
- Built-in CRT and scanline shader effects
- Subpixel smoothing for non-integer scales

---

## Fullscreen and Window Modes

### conf.lua Setup

```lua
function love.conf(t)
    t.window.title = "My Pixel Game"
    t.window.width = 1280
    t.window.height = 720
    t.window.resizable = true
    t.window.minwidth = 320
    t.window.minheight = 180
    t.window.vsync = 1
end
```

### Toggling Fullscreen

```lua
function love.keypressed(key)
    if key == "f11" or (key == "return" and love.keyboard.isDown("lalt")) then
        love.window.setFullscreen(not love.window.getFullscreen())
        -- Scaling recalculates in love.resize callback
    end
end
```

### Querying Display Size

```lua
-- Get the desktop resolution (useful for default window size)
local desktop_w, desktop_h = love.window.getDesktopDimensions()

-- Set window to 80% of desktop size
love.window.setMode(
    math.floor(desktop_w * 0.8),
    math.floor(desktop_h * 0.8),
    { resizable = true }
)
```

---

## High-DPI Displays

On macOS and some Linux/Windows configurations, screens report a DPI scale > 1. LÖVE can render at the native DPI for sharper text and UI.

```lua
function love.conf(t)
    t.window.highdpi = true  -- request native DPI rendering
end
```

When `highdpi` is enabled, the pixel dimensions of the window and canvas may be larger than the "screen coordinate" dimensions:

```lua
local pixel_w, pixel_h = love.graphics.getDimensions()        -- drawing surface
local screen_w, screen_h = love.window.getMode()               -- window coordinates
local dpi_scale = love.window.getDPIScale()                    -- typically 1 or 2

-- pixel_w == screen_w * dpi_scale
```

**For pixel art games** using canvas scaling, high-DPI usually does not matter — you are rendering at your game resolution regardless. But if you draw any native-resolution UI (settings menus, text overlays), account for the DPI scale.

---

## Common Pitfalls

### 1. Loading Images Before Setting the Filter

```lua
-- WRONG — image loads with default "linear" filter
local img = love.graphics.newImage("player.png")
love.graphics.setDefaultFilter("nearest", "nearest")

-- RIGHT — set filter first
love.graphics.setDefaultFilter("nearest", "nearest")
local img = love.graphics.newImage("player.png")
```

### 2. Drawing at Sub-Pixel Positions

Pixel art should always be drawn at integer coordinates. Fractional positions cause neighboring pixels to bleed together, even with `"nearest"` filtering.

```lua
-- WRONG — causes pixel shimmer
love.graphics.draw(sprite, 10.5, 20.3)

-- RIGHT — floor positions
love.graphics.draw(sprite, math.floor(player.x), math.floor(player.y))
```

### 3. Camera Sub-Pixel Jitter

If your camera follows the player smoothly, the entire world shifts by fractional amounts each frame. Lock camera positions to integers:

```lua
local cam_x = math.floor(player.x - GAME_W / 2)
local cam_y = math.floor(player.y - GAME_H / 2)
love.graphics.translate(-cam_x, -cam_y)
```

### 4. Forgetting love.resize

If `resizable = true` in your config but you never handle `love.resize`, your scaling parameters will be stale after the user resizes the window.

### 5. Mixing Canvas and Direct Drawing

All game visuals should go through the canvas. Drawing directly to the screen after `love.graphics.setCanvas()` will appear at window resolution, not game resolution, creating an inconsistent look.

---

## Quick Reference: Minimal Pixel Art Setup

```lua
-- conf.lua
function love.conf(t)
    t.window.title = "Pixel Game"
    t.window.width = 960
    t.window.height = 540
    t.window.resizable = true
    t.window.minwidth = 320
    t.window.minheight = 180
end

-- main.lua
local GAME_W, GAME_H = 320, 180
local canvas, scale, ox, oy

function love.load()
    love.graphics.setDefaultFilter("nearest", "nearest")
    canvas = love.graphics.newCanvas(GAME_W, GAME_H)
    love.resize(love.graphics.getDimensions())
end

function love.resize(w, h)
    scale = math.floor(math.min(w / GAME_W, h / GAME_H))
    scale = math.max(scale, 1)
    ox = math.floor((w - GAME_W * scale) / 2)
    oy = math.floor((h - GAME_H * scale) / 2)
end

function love.draw()
    love.graphics.setCanvas(canvas)
    love.graphics.clear(0.1, 0.1, 0.2)
    -- draw game here
    love.graphics.setCanvas()

    love.graphics.clear(0, 0, 0)
    love.graphics.draw(canvas, ox, oy, 0, scale, scale)
end

function love.mousepressed(x, y, btn)
    local gx = (x - ox) / scale
    local gy = (y - oy) / scale
    if gx >= 0 and gx < GAME_W and gy >= 0 and gy < GAME_H then
        -- handle click at game coordinates gx, gy
    end
end
```
