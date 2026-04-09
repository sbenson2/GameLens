# G2 — Graphics & Rendering

> **Category:** guide · **Engine:** Love2D · **Related:** [E1 Architecture Overview](../architecture/E1_architecture_overview.md) · [G1 Game Loop & Callbacks](G1_game_loop_and_callbacks.md) · [R1 Module Reference](../reference/R1_module_reference.md)

---

## The love.graphics Module

All rendering in LÖVE flows through `love.graphics`. It handles images, shapes, text, canvases (render targets), and shaders. Everything you see on screen is drawn inside the `love.draw()` callback.

```lua
function love.draw()
    love.graphics.draw(image, x, y)       -- draw an image
    love.graphics.rectangle("fill", 10, 10, 50, 50)  -- draw a shape
    love.graphics.print("Hello", 100, 100)            -- draw text
end
```

**Golden rule:** draw calls are immediate-mode. There is no retained scene graph — you redraw everything each frame.

---

## Loading & Drawing Images

### love.graphics.newImage(path)

Loads a texture from disk. Call this in `love.load()`, never inside `love.draw()`.

```lua
function love.load()
    player_img = love.graphics.newImage("assets/player.png")
end

function love.draw()
    -- Basic draw: image, x, y
    love.graphics.draw(player_img, 100, 200)

    -- Full signature: image, x, y, rotation, scaleX, scaleY, originX, originY
    love.graphics.draw(player_img, 400, 300, math.rad(45), 2, 2, 16, 16)
end
```

**Parameters for `love.graphics.draw`:**

| Param | Default | Purpose |
|-------|---------|---------|
| `x, y` | 0, 0 | Position |
| `r` | 0 | Rotation in radians |
| `sx, sy` | 1, 1 | Scale (negative = flip) |
| `ox, oy` | 0, 0 | Origin offset (pivot point) |
| `kx, ky` | 0, 0 | Shearing |

---

## Quads (Sprite Sheets)

A Quad defines a rectangular sub-region of a texture — essential for sprite sheets and tile maps.

```lua
function love.load()
    sheet = love.graphics.newImage("assets/characters.png")
    -- newQuad(x, y, width, height, texture)
    -- Extracts a 32x32 region starting at pixel (0, 0)
    quad_idle = love.graphics.newQuad(0, 0, 32, 32, sheet)
    quad_walk = love.graphics.newQuad(32, 0, 32, 32, sheet)
end

function love.draw()
    love.graphics.draw(sheet, quad_idle, player.x, player.y)
end
```

### Animation with Quads

LÖVE has no built-in animation system. A simple frame-based approach:

```lua
function love.load()
    sheet = love.graphics.newImage("assets/walk.png")
    local fw, fh = 32, 32  -- frame size
    frames = {}
    for i = 0, 3 do
        frames[i + 1] = love.graphics.newQuad(i * fw, 0, fw, fh, sheet)
    end
    anim = { frames = frames, index = 1, timer = 0, speed = 0.1 }
end

function love.update(dt)
    anim.timer = anim.timer + dt
    if anim.timer >= anim.speed then
        anim.timer = anim.timer - anim.speed
        anim.index = (anim.index % #anim.frames) + 1
    end
end

function love.draw()
    love.graphics.draw(sheet, anim.frames[anim.index], player.x, player.y)
end
```

For production, consider the `anim8` library which handles sprite sheet animations with a cleaner API.

---

## SpriteBatches (Draw Call Optimization)

A SpriteBatch groups many draws of the **same texture** into a single GPU draw call. Critical for tile maps and particle-heavy scenes.

```lua
function love.load()
    tileset = love.graphics.newImage("assets/tiles.png")
    -- Create a batch that can hold up to 1000 sprites
    batch = love.graphics.newSpriteBatch(tileset, 1000, "static")

    -- Populate the batch (typically from map data)
    local tile_w, tile_h = 16, 16
    for row = 0, 19 do
        for col = 0, 29 do
            local quad = love.graphics.newQuad(
                getTileId(col, row) * tile_w, 0,
                tile_w, tile_h, tileset
            )
            batch:add(quad, col * tile_w, row * tile_h)
        end
    end
end

function love.draw()
    -- One draw call for the entire tilemap
    love.graphics.draw(batch, 0, 0)
end
```

### Usage Hints

| Mode | When to use |
|------|------------|
| `"static"` | Tile maps, backgrounds — set once, draw many times |
| `"dynamic"` | Particle effects, changing sprites — rebuilt each frame |
| `"stream"` | Complete rebuild every frame — most flexible, moderate cost |

**When to use a SpriteBatch:** if you're drawing 100+ sprites from the same texture and frame rate drops below target, batch them. LÖVE's automatic batching handles simple cases, but explicit batching gives you control.

---

## Canvases (Render Targets)

A Canvas is an off-screen texture you can draw to, then draw the canvas itself to the screen. Essential for post-processing, minimaps, UI layers, and pixel-art scaling.

```lua
function love.load()
    -- Create a canvas at game resolution
    game_canvas = love.graphics.newCanvas(320, 180)
end

function love.draw()
    -- Render the game at native resolution
    love.graphics.setCanvas(game_canvas)
        love.graphics.clear()
        drawWorld()
        drawEntities()
    love.graphics.setCanvas()  -- reset to screen

    -- Scale up to window size (pixel-perfect upscaling)
    local sx = love.graphics.getWidth() / 320
    local sy = love.graphics.getHeight() / 180
    love.graphics.draw(game_canvas, 0, 0, 0, sx, sy)
end
```

### Canvas Settings

```lua
-- High-DPI canvas
love.graphics.newCanvas(800, 600, { dpiscale = love.graphics.getDPIScale() })

-- Canvas with specific pixel format (HDR, depth)
love.graphics.newCanvas(800, 600, { format = "rgba16f" })

-- Multi-sample anti-aliasing
love.graphics.newCanvas(800, 600, { msaa = 4 })
```

### Multiple Render Targets (MRT)

LÖVE supports rendering to multiple canvases simultaneously, useful for deferred rendering:

```lua
love.graphics.setCanvas(color_canvas, normal_canvas)
```

---

## Shaders (GLSL)

Shaders run on the GPU and transform how things are drawn. LÖVE shaders use GLSL but with LÖVE-specific entry points.

### Pixel Shader (Fragment)

```lua
function love.load()
    grayscale = love.graphics.newShader([[
        vec4 effect(vec4 color, Image tex, vec2 texture_coords, vec2 screen_coords) {
            vec4 pixel = Texel(tex, texture_coords);  // sample the texture
            float gray = dot(pixel.rgb, vec3(0.299, 0.587, 0.114));
            return vec4(gray, gray, gray, pixel.a) * color;
        }
    ]])
end

function love.draw()
    love.graphics.setShader(grayscale)
    love.graphics.draw(player_img, 100, 100)
    love.graphics.setShader()  -- reset to default
end
```

### Vertex Shader

```lua
local wobble = love.graphics.newShader([[
    uniform float time;

    vec4 position(mat4 transform_projection, vec4 vertex_position) {
        vertex_position.x += sin(vertex_position.y * 0.1 + time * 3.0) * 5.0;
        return transform_projection * vertex_position;
    }
]])
```

### Sending Data to Shaders

```lua
function love.update(dt)
    time = (time or 0) + dt
    wobble:send("time", time)
end
```

**Supported uniform types:** `number`, `vec2/vec3/vec4` (as tables), `mat4`, `boolean`, `Image`, `Canvas`.

### Shader Applied to Canvas (Post-Processing)

A common pattern for full-screen effects:

```lua
function love.draw()
    -- Draw scene to canvas
    love.graphics.setCanvas(scene_canvas)
        love.graphics.clear()
        drawEverything()
    love.graphics.setCanvas()

    -- Draw canvas to screen with post-process shader
    love.graphics.setShader(bloom_shader)
    love.graphics.draw(scene_canvas)
    love.graphics.setShader()
end
```

---

## Transform Stack

LÖVE provides a transform stack for translating, rotating, and scaling groups of draw calls. This is the foundation of camera systems.

```lua
function love.draw()
    -- Camera transform
    love.graphics.push()
    love.graphics.translate(-camera.x, -camera.y)
    love.graphics.scale(camera.zoom)
    love.graphics.rotate(camera.rotation)

    -- Everything drawn here is in world space
    drawWorld()
    drawEntities()

    love.graphics.pop()

    -- UI drawn in screen space (unaffected by camera)
    drawHUD()
end
```

### Nested Transforms

```lua
love.graphics.push()
    love.graphics.translate(player.x, player.y)
    love.graphics.rotate(player.angle)
    -- Player drawn at origin (0,0) in local space
    love.graphics.draw(player_img, 0, 0, 0, 1, 1, 16, 16)

    love.graphics.push()
        love.graphics.translate(8, -4)  -- gun offset relative to player
        love.graphics.draw(gun_img, 0, 0)
    love.graphics.pop()
love.graphics.pop()
```

---

## Drawing Primitives

```lua
-- Shapes
love.graphics.rectangle("fill", x, y, w, h)
love.graphics.rectangle("line", x, y, w, h, rx, ry)  -- rounded corners
love.graphics.circle("fill", cx, cy, radius)
love.graphics.line(x1, y1, x2, y2, x3, y3, ...)
love.graphics.polygon("fill", vertices)

-- Colors (RGBA, 0–1 range since LÖVE 11.0)
love.graphics.setColor(1, 0, 0, 1)      -- red, fully opaque
love.graphics.setColor(1, 1, 1, 0.5)    -- white, half transparent

-- Text
love.graphics.setFont(my_font)
love.graphics.print("Hello", x, y)
love.graphics.printf("Centered text", 0, y, screen_width, "center")
```

---

## Blend Modes

Control how new pixels combine with existing pixels:

```lua
love.graphics.setBlendMode("alpha")       -- default transparency
love.graphics.setBlendMode("add")         -- additive (glow, fire)
love.graphics.setBlendMode("multiply")    -- darkening
love.graphics.setBlendMode("replace")     -- overwrite (no blending)
```

**Common use:** switch to `"add"` for particle effects and light overlays, then back to `"alpha"` for normal sprites.

---

## Stencil Buffer

Use the stencil buffer to mask drawing regions:

```lua
love.graphics.stencil(function()
    love.graphics.circle("fill", 400, 300, 100)
end, "replace", 1)

love.graphics.setStencilTest("greater", 0)
-- Only draws inside the circle
love.graphics.draw(background_img, 0, 0)
love.graphics.setStencilTest()
```

---

## Performance Tips

1. **Batch texture switches** — group draws by texture. Every texture change can break automatic batching.
2. **Use SpriteBatches for tile maps** — a 30×20 tile map goes from 600 draw calls to 1.
3. **Load textures as power-of-two** when targeting older GPUs (256×256, 512×512, 1024×1024).
4. **Avoid creating objects in love.draw()** — `newImage`, `newFont`, `newCanvas`, `newShader` allocate memory.
5. **Profile with `love.graphics.getStats()`** — returns draw calls, texture memory, canvas switches, and shader switches per frame.

```lua
function love.draw()
    drawEverything()

    -- Debug overlay
    local stats = love.graphics.getStats()
    love.graphics.print(string.format(
        "Draw calls: %d  Tex mem: %.1f MB  Canvas switches: %d",
        stats.drawcalls, stats.texturememory / 1024 / 1024,
        stats.canvasswitches
    ), 10, 10)
end
```
