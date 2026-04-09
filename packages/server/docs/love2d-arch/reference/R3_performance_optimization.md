# R3 — Performance Optimization

> **Category:** reference · **Engine:** Love2D · **Related:** [G2 Graphics & Rendering](../guides/G2_graphics_and_rendering.md) · [G1 Game Loop & Callbacks](../guides/G1_game_loop_and_callbacks.md) · [R1 Module Reference](R1_module_reference.md)

---

LÖVE's immediate-mode rendering and Lua's garbage-collected runtime give you flexibility, but both require care to maintain smooth frame rates. This reference covers the most impactful optimization techniques, ordered roughly by the size of the win they typically deliver.

---

## Draw Call Reduction

Draw calls are the single biggest bottleneck in most LÖVE games. Every call to `love.graphics.draw()`, `love.graphics.rectangle()`, or similar functions submits work to the GPU — and the driver overhead per call dwarfs the actual rendering cost.

### SpriteBatch

A `SpriteBatch` groups many sprites that share the same texture into a single draw call.

```lua
function love.load()
    local atlas = love.graphics.newImage("atlas.png")
    -- "dynamic" usage hint: expect frequent updates
    batch = love.graphics.newSpriteBatch(atlas, 1000, "dynamic")
end

function love.update(dt)
    batch:clear()
    for _, tile in ipairs(visible_tiles) do
        batch:add(tile.quad, tile.x, tile.y)
    end
end

function love.draw()
    love.graphics.draw(batch)  -- one draw call for all tiles
end
```

**When to use SpriteBatch:**

- Tilemaps (biggest win — static geometry, one atlas).
- Particle-like systems with many identical sprites.
- Any situation where you draw > ~20 sprites from the same texture.

**Usage hints:**

- `"static"` — geometry set once, drawn many times (background tiles).
- `"dynamic"` — geometry changes every frame (moving entities).
- `"stream"` — geometry changes and is drawn only once per frame.

### Batch-Breaking Operations

The GPU batches consecutive draws automatically when they share the same texture, shader, and blend mode. Anything that changes one of these forces a new batch:

| Batch breaker | Fix |
|---|---|
| Switching textures between draws | Pack sprites into a **texture atlas** |
| Changing shaders mid-frame | Sort draws by shader, apply each shader in a block |
| Changing blend modes | Group translucent draws together |
| Calling `love.graphics.setColor()` between draws | Use per-sprite color via `SpriteBatch:setColor()` or a shader uniform |

### Texture Atlases

Combine individual images into one large texture and use `Quad` objects to select sub-regions. This lets the GPU batch all draws from the atlas without texture switches.

```lua
function love.load()
    atlas = love.graphics.newImage("spritesheet.png")
    -- Quad: x, y, width, height, atlas_width, atlas_height
    quads = {
        idle  = love.graphics.newQuad(0, 0, 32, 32, atlas),
        walk1 = love.graphics.newQuad(32, 0, 32, 32, atlas),
        walk2 = love.graphics.newQuad(64, 0, 32, 32, atlas),
    }
end

function love.draw()
    love.graphics.draw(atlas, quads.idle, 100, 200)
    love.graphics.draw(atlas, quads.walk1, 150, 200)
    -- same texture → GPU batches these automatically
end
```

---

## Spatial Partitioning — Draw and Update Less

The cheapest work is work you never do. Spatial partitioning lets you skip off-screen objects entirely.

### Grid-Based Culling

For tile-based games, compute the visible tile range from the camera and only iterate those tiles:

```lua
function get_visible_tiles(camera_x, camera_y, screen_w, screen_h, tile_size)
    local start_col = math.floor(camera_x / tile_size)
    local start_row = math.floor(camera_y / tile_size)
    local end_col = math.ceil((camera_x + screen_w) / tile_size)
    local end_row = math.ceil((camera_y + screen_h) / tile_size)
    return start_col, start_row, end_col, end_row
end
```

### Quadtree or Spatial Hash

For free-moving entities, a spatial hash is simple and effective:

```lua
local cell_size = 128
local grid = {}

function spatial_insert(entity)
    local cx = math.floor(entity.x / cell_size)
    local cy = math.floor(entity.y / cell_size)
    local key = cx .. "," .. cy
    grid[key] = grid[key] or {}
    table.insert(grid[key], entity)
end

function spatial_query(x, y, w, h)
    local results = {}
    local x1 = math.floor(x / cell_size)
    local y1 = math.floor(y / cell_size)
    local x2 = math.floor((x + w) / cell_size)
    local y2 = math.floor((y + h) / cell_size)
    for cx = x1, x2 do
        for cy = y1, y2 do
            local cell = grid[cx .. "," .. cy]
            if cell then
                for _, e in ipairs(cell) do
                    results[#results + 1] = e
                end
            end
        end
    end
    return results
end
```

---

## Memory & Garbage Collection

Lua's garbage collector runs incrementally, but allocation spikes cause frame-time jitter. The goal is to reduce allocations per frame, not to fight the GC.

### Common Allocation Sources

| Source | Cost | Mitigation |
|---|---|---|
| Creating tables in `update()` | High — triggers GC pressure | Pre-allocate and reuse (object pooling) |
| String concatenation (`..`) in hot paths | Medium — creates new strings | Use `string.format()` or buffer tables |
| `vmath`-style temp vectors | Medium | Reuse a scratch vector instead of `{x=0, y=0}` each frame |
| Creating closures each frame | Low–Medium | Define callbacks once, pass data via upvalues or tables |

### Object Pooling

```lua
local Pool = {}

function Pool.new(factory, initial_size)
    local pool = { free = {}, factory = factory }
    for i = 1, initial_size do
        pool.free[i] = factory()
    end
    return pool
end

function Pool.get(pool)
    local n = #pool.free
    if n > 0 then
        local obj = pool.free[n]
        pool.free[n] = nil
        return obj
    end
    return pool.factory()
end

function Pool.release(pool, obj)
    pool.free[#pool.free + 1] = obj
end
```

### GC Tuning

LÖVE uses standard Lua (or LuaJIT) garbage collection. You can tune the collector's pace:

```lua
function love.load()
    -- Default is (200, 200). Lower values = more frequent, shorter pauses.
    collectgarbage("setpause", 100)
    collectgarbage("setstepmul", 200)
end
```

**Caution:** Calling `collectgarbage("collect")` every frame forces a full collection cycle. This guarantees memory stays low but can introduce frame-time spikes. Prefer incremental tuning.

### Releasing Heavy Objects

LÖVE objects (Images, Canvases, Sources) are C++ objects wrapped in Lua userdata. The GC may not reclaim them promptly because Lua sees them as tiny allocations. Call `:release()` explicitly when you are done with large objects:

```lua
function change_level()
    if current_music then
        current_music:stop()
        current_music:release()  -- free C++ memory immediately
        current_music = nil
    end
    current_music = love.audio.newSource("level2.ogg", "stream")
end
```

---

## Rendering Pipeline Tricks

### Canvas Caching

Render expensive static content to a `Canvas` once, then draw the canvas each frame:

```lua
function love.load()
    bg_canvas = love.graphics.newCanvas(800, 600)
    love.graphics.setCanvas(bg_canvas)
    -- draw complex background (tiles, parallax, etc.)
    draw_background_layers()
    love.graphics.setCanvas()  -- restore default
end

function love.draw()
    love.graphics.draw(bg_canvas)  -- single draw call
    draw_dynamic_entities()
end
```

Rebuild the canvas only when the camera moves beyond a threshold or the content changes.

### Shader Optimization

- Avoid branching (`if`/`else`) in fragment shaders — GPUs prefer math.
- Minimize `uniform` updates per frame.
- Use `love.graphics.setShader(nil)` to revert to the default shader when done.

### Geometry Reduction

- Use `love.graphics.newMesh()` for complex shapes instead of many `polygon()` calls.
- Meshes with a shared texture batch into a single draw call.

---

## CPU-Side Performance

### Hot-Path Lua Patterns

```lua
-- Localize frequently called functions (avoids global table lookups)
local floor = math.floor
local insert = table.insert
local draw = love.graphics.draw

-- Numeric for-loops are faster than ipairs() in plain Lua
-- (LuaJIT optimizes both, but numeric for is never slower)
for i = 1, #entities do
    local e = entities[i]
    -- ...
end

-- Avoid creating tables as function return values in hot paths
-- Instead, return multiple values:
local function get_position(entity)
    return entity.x, entity.y  -- no table allocation
end
```

### Delta-Time Accumulator

For physics or fixed-rate logic, use an accumulator to decouple simulation from frame rate:

```lua
local accumulator = 0
local FIXED_DT = 1 / 60

function love.update(dt)
    accumulator = accumulator + dt
    while accumulator >= FIXED_DT do
        physics_step(FIXED_DT)
        accumulator = accumulator - FIXED_DT
    end
end
```

---

## Profiling Tools

| Tool | What it measures |
|---|---|
| `love.graphics.getStats()` | Draw calls, texture memory, canvas switches, shader switches per frame |
| `love.timer.getAverageDelta()` | Smoothed frame time |
| `collectgarbage("count")` | Current Lua memory usage in KB |
| **LÖVE-Profiler** (community library) | Function-level CPU profiling with call counts and time |
| **jprof** (community library) | Timeline profiler — flame-chart style visualization |

```lua
-- Quick stats overlay
function love.draw()
    -- ... game rendering ...

    local stats = love.graphics.getStats()
    love.graphics.print(string.format(
        "draws: %d  texmem: %.1f MB  canvases: %d",
        stats.drawcalls,
        stats.texturememory / (1024 * 1024),
        stats.canvasswitches
    ), 10, 10)
end
```

---

## Quick Checklist

1. **Profile first** — `love.graphics.getStats()` reveals whether you are draw-call bound or fill-rate bound.
2. **Atlas your sprites** — one texture = one batch.
3. **SpriteBatch tilemaps** — the single largest win in most 2D games.
4. **Cull off-screen objects** — spatial hash or grid range.
5. **Pool frequently created objects** — bullets, particles, effects.
6. **Release heavy LÖVE objects** — call `:release()` on Images, Canvases, Sources you no longer need.
7. **Localize hot functions** — `local sin = math.sin` in module scope.
8. **Cache to Canvas** — render static layers once.
9. **Fixed timestep** — accumulator pattern for deterministic physics.
10. **Measure after every change** — optimization without measurement is guessing.
