# G11 — Cameras & Tilemaps

> **Category:** guide · **Engine:** Love2D · **Related:** [G2 Graphics & Rendering](G2_graphics_and_rendering.md) · [G1 Game Loop & Callbacks](G1_game_loop_and_callbacks.md) · [G3 Physics & Box2D](G3_physics_and_box2d.md)

---

## Why Cameras Matter

LÖVE has no built-in camera. The rendering API is immediate-mode: you draw everything at fixed world coordinates each frame. To scroll, zoom, or rotate the view, you transform the coordinate system before drawing. Understanding this pattern is essential for any game bigger than a single screen.

---

## Basic Camera with Transform Stack

LÖVE's `love.graphics.push()` / `love.graphics.pop()` let you save and restore the coordinate transform. Between them, you apply translate, scale, and rotate to create a camera effect.

```lua
-- camera.lua — minimal camera module
local camera = { x = 0, y = 0, scale = 1, rotation = 0 }

function camera:set()
    love.graphics.push()
    love.graphics.rotate(-self.rotation)
    love.graphics.scale(self.scale, self.scale)
    love.graphics.translate(-self.x, -self.y)
end

function camera:unset()
    love.graphics.pop()
end

return camera
```

Usage in `love.draw()`:

```lua
local cam = require("camera")

function love.draw()
    cam:set()
        -- Everything here is drawn in world space
        map:draw()
        love.graphics.draw(player.image, player.x, player.y)
    cam:unset()

    -- HUD draws after unset — stays fixed on screen
    love.graphics.print("Score: " .. score, 10, 10)
end
```

### Transform Order Matters

Graphic transformations are **not commutative**. LÖVE applies them in reverse call order. The typical call sequence is: rotate → scale → translate. This means the translation happens first in world space (move to camera position), then scale, then rotate.

---

## Centering the Camera on a Target

Most games want the camera to follow the player. Center by offsetting by half the screen size:

```lua
function camera:follow(target)
    local w, h = love.graphics.getDimensions()
    self.x = target.x - (w / 2) / self.scale
    self.y = target.y - (h / 2) / self.scale
end
```

### Smooth Following (Lerp)

Snapping directly to the player feels rigid. Linear interpolation creates smooth tracking:

```lua
function camera:follow_smooth(target, dt, speed)
    speed = speed or 5
    local w, h = love.graphics.getDimensions()
    local target_x = target.x - (w / 2) / self.scale
    local target_y = target.y - (h / 2) / self.scale
    self.x = self.x + (target_x - self.x) * speed * dt
    self.y = self.y + (target_y - self.y) * speed * dt
end
```

### Clamping to Map Bounds

Prevent the camera from showing empty space beyond the map edges:

```lua
function camera:clamp(map_width, map_height)
    local w, h = love.graphics.getDimensions()
    local view_w = w / self.scale
    local view_h = h / self.scale
    self.x = math.max(0, math.min(self.x, map_width - view_w))
    self.y = math.max(0, math.min(self.y, map_height - view_h))
end
```

---

## Screen-to-World Conversion

Mouse clicks report screen coordinates. Convert them to world coordinates to check what the player clicked on:

```lua
function camera:screen_to_world(sx, sy)
    local wx = sx / self.scale + self.x
    local wy = sy / self.scale + self.y
    return wx, wy
end

function camera:world_to_screen(wx, wy)
    local sx = (wx - self.x) * self.scale
    local sy = (wy - self.y) * self.scale
    return sx, sy
end
```

---

## Camera Shake

A simple shake effect offsets the camera by random amounts that decay over time:

```lua
function camera:start_shake(intensity, duration)
    self.shake_intensity = intensity
    self.shake_duration = duration
    self.shake_timer = duration
end

function camera:apply_shake(dt)
    if self.shake_timer and self.shake_timer > 0 then
        self.shake_timer = self.shake_timer - dt
        local fade = self.shake_timer / self.shake_duration
        local ox = love.math.random(-1, 1) * self.shake_intensity * fade
        local oy = love.math.random(-1, 1) * self.shake_intensity * fade
        love.graphics.translate(-ox, -oy)
    end
end
```

Call `camera:apply_shake(dt)` right after `camera:set()`.

---

## Popular Camera Libraries

| Library | Description |
|---------|-------------|
| **gamera** | Lightweight camera with bounds clamping and screen-to-world transforms |
| **hump.camera** | Part of the HUMP utility library — smoothing, movement locking, parallax helpers |
| **stalker-x** | Advanced camera with screen shake, flash, fade, and multiple follow styles |

All three are thin wrappers over the transform stack pattern shown above. Learning the manual approach first makes debugging library issues much easier.

---

## Tilemaps with Simple Tiled Implementation (STI)

**STI** (Simple Tiled Implementation) is the standard library for loading maps created in the **Tiled** editor into LÖVE. It handles image caching, tile batching, and layer rendering.

### Installation

Drop the `sti` folder into your project or install via LuaRocks:

```
luarocks install sti
```

### Basic Setup

```lua
local sti = require("sti")
local map

function love.load()
    -- Export map from Tiled as .lua format
    map = sti("maps/level1.lua")
end

function love.update(dt)
    map:update(dt)
end

function love.draw()
    map:draw()
end
```

### Key STI API

| Method | Purpose |
|--------|---------|
| `sti(path)` | Load a Tiled map exported as `.lua` |
| `map:update(dt)` | Update animated tiles and custom layers |
| `map:draw(tx, ty, sx, sy)` | Draw all visible layers; `tx`/`ty` translate, `sx`/`sy` scale |
| `map:drawLayer(layer)` | Draw a single layer by reference |
| `map.layers` | Table of all layers (indexed and named) |
| `map.tilewidth` / `map.tileheight` | Tile dimensions in pixels |
| `map.width` / `map.height` | Map dimensions in tiles |

### Integrating STI with a Camera

The most common mistake is letting the camera transform and STI's own translation fight each other. Two approaches work:

**Approach A — Let the camera handle everything:**

```lua
function love.draw()
    cam:set()
        map:draw()     -- no tx/ty args — camera transform handles scrolling
        draw_entities()
    cam:unset()
end
```

**Approach B — Pass camera offset to STI directly (no transform stack):**

```lua
function love.draw()
    -- STI draws with offset; entities also offset manually
    map:draw(-cam.x, -cam.y)
    love.graphics.draw(player.image, player.x - cam.x, player.y - cam.y)
end
```

Approach A is cleaner — you apply the camera once and everything in world space just works.

### Custom Layers for Entities

STI supports Custom Layers — special layers where you control what gets drawn. This is how you draw players, enemies, and items interleaved with tile layers for correct depth ordering:

```lua
function love.load()
    map = sti("maps/level1.lua")

    -- Create a custom layer between background and foreground
    local entity_layer = map:addCustomLayer("entities", 3)

    entity_layer.draw = function(self)
        for _, entity in ipairs(entities) do
            love.graphics.draw(entity.image, entity.x, entity.y)
        end
    end

    entity_layer.update = function(self, dt)
        for _, entity in ipairs(entities) do
            entity:update(dt)
        end
    end
end
```

### Tile Collision from STI

STI can generate collision geometry from Tiled's object layers for use with `love.physics` (Box2D) or manual AABB checks:

```lua
-- Using the Box2D plugin:
local sti = require("sti")
local map = sti("maps/level1.lua", { "box2d" })

function love.load()
    world = love.physics.newWorld(0, 512)
    map:box2d_init(world)
end
```

For simpler collision without physics, iterate the object layer directly:

```lua
local collision_layer = map.layers["collision"]
for _, obj in ipairs(collision_layer.objects) do
    -- obj.x, obj.y, obj.width, obj.height define the collision box
end
```

---

## Parallax Scrolling

Layer-based parallax multiplies the camera offset by a factor per layer. Background layers scroll slower (factor < 1), foreground layers scroll faster (factor > 1):

```lua
function draw_parallax(cam)
    -- Far background at 30% camera speed
    love.graphics.draw(bg_far, -cam.x * 0.3, -cam.y * 0.3)

    -- Near background at 60% camera speed
    love.graphics.draw(bg_near, -cam.x * 0.6, -cam.y * 0.6)

    -- Game world at 100% (handled by camera transform)
    cam:set()
        map:draw()
        draw_entities()
    cam:unset()
end
```

With STI, set parallax per layer using Tiled's custom properties (e.g., `parallax_x = 0.5`) and read them in your draw loop:

```lua
for _, layer in ipairs(map.layers) do
    if layer.properties.parallax_x then
        map:drawLayer(layer, -cam.x * layer.properties.parallax_x, -cam.y * (layer.properties.parallax_y or 1))
    end
end
```

---

## Common Pitfalls

| Problem | Cause | Fix |
|---------|-------|-----|
| Map draws but doesn't scroll | Camera transform not applied before `map:draw()` | Use `cam:set()` before drawing, or pass offsets to `map:draw(tx, ty)` |
| Mouse clicks hit wrong tiles | Using screen coords instead of world coords | Convert with `camera:screen_to_world(love.mouse.getPosition())` |
| STI draws blank | Map exported as `.tmx` instead of `.lua` | Re-export from Tiled using the Lua format |
| Tiles have gaps at certain zoom levels | Floating-point rounding | Round camera position to integers: `math.floor(cam.x + 0.5)` |
| Entities draw behind all tiles | Drawing entities after `map:draw()` which draws all layers | Use STI Custom Layers to interleave entities at the correct depth |
