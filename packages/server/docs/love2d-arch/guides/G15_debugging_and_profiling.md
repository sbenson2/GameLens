# Debugging and Profiling

> **Category:** guide · **Engine:** Love2D · **Related:** [G1 Game Loop & Callbacks](G1_game_loop_and_callbacks.md), [G2 Graphics & Rendering](G2_graphics_and_rendering.md), [G9 Threading & Channels](G9_threading_and_channels.md)

LÖVE runs on LuaJIT (desktop), which makes Lua code fast but also means standard debugging approaches apply — print debugging, profilers, and external debugger integrations. This guide covers built-in diagnostics, profiling tools, and optimization techniques for LÖVE games.

---

## Built-In Diagnostics

### love.graphics.getStats()

The most important single function for performance analysis. Returns rendering statistics for the current frame:

```lua
function love.draw()
    -- Draw your game first
    draw_game()

    -- Then overlay stats
    local stats = love.graphics.getStats()
    local info = string.format(
        "FPS: %d\nDraw calls: %d\nBatched: %d\nTexture memory: %.1f MB\nImages: %d",
        love.timer.getFPS(),
        stats.drawcalls,
        stats.drawcallsbatched,
        stats.texturememory / (1024 * 1024),
        stats.images
    )
    love.graphics.setColor(0, 0, 0, 0.7)
    love.graphics.rectangle("fill", 5, 5, 220, 90)
    love.graphics.setColor(1, 1, 1)
    love.graphics.print(info, 10, 10)
end
```

**Key fields:**

| Field | What it means | Warning threshold |
|-------|--------------|-------------------|
| `drawcalls` | GPU draw calls this frame | > 200 is worth investigating; > 1000 is a problem |
| `drawcallsbatched` | Draw calls LÖVE auto-batched away | Higher is better — means batching is working |
| `canvasswitches` | Render target changes | Each switch breaks batching |
| `shaderswitches` | Shader program changes | Each switch breaks batching |
| `texturememory` | Total VRAM used by images, canvases, fonts (bytes) | Monitor for leaks |
| `images` | Count of loaded Image/Canvas/Font objects | Should stay stable; rising = leak |

### love.timer.getFPS()

Returns the current frames per second. Useful for a quick HUD overlay but too noisy for analysis — use averages:

```lua
local fps_samples = {}
local FPS_WINDOW = 60

function get_average_fps()
    table.insert(fps_samples, love.timer.getFPS())
    if #fps_samples > FPS_WINDOW then
        table.remove(fps_samples, 1)
    end
    local sum = 0
    for _, v in ipairs(fps_samples) do sum = sum + v end
    return sum / #fps_samples
end
```

### love.timer.getDelta()

Returns the time in seconds since the last frame. A spike in `dt` means a frame took too long. Log frames that exceed your target:

```lua
function love.update(dt)
    if dt > 1/30 then
        print(string.format("SLOW FRAME: %.1f ms", dt * 1000))
    end
end
```

### collectgarbage("count")

Returns Lua memory usage in kilobytes. Track it over time to detect memory leaks:

```lua
local lua_mem = collectgarbage("count")  -- in KB
```

---

## Profiling Tools

### profile.lua (CPU Profiling)

A pure Lua profiler that uses the `debug` library to measure function call counts and execution time.

```lua
-- Usage pattern
local profile = require("lib.profile")

function love.load()
    profile.start()
end

function love.update(dt)
    -- your game logic
end

-- Print report periodically or on keypress
function love.keypressed(key)
    if key == "p" then
        profile.stop()
        local report = profile.report(20) -- top 20 functions
        print(report)
        profile.start()
    end
end
```

The report shows function name, file, line number, total time, self time, and call count. Sort by self time to find your actual bottlenecks.

**Caveat:** Profiling adds overhead. The debug hook fires on every function call, which slows LuaJIT significantly (LuaJIT disables its JIT compiler when debug hooks are active). Profile in short bursts, not continuously.

### AppleCake (Visual Profiler)

A LÖVE-specific profiler that outputs Chrome-compatible trace files. Open the output in `chrome://tracing` or Perfetto for a visual timeline of function execution.

```lua
local applecake = require("lib.applecake")

function love.update(dt)
    applecake.beginProfile("update")
    -- game logic
    applecake.endProfile()
end

function love.draw()
    applecake.beginProfile("draw")
    -- rendering
    applecake.endProfile()
end
```

Advantages: visual timeline, supports multithreaded profiling via `love.thread`, and shows where time is spent across the frame.

### ZeroBrane Studio (Debugger)

ZeroBrane Studio is a lightweight Lua IDE with a built-in debugger that supports LÖVE. It provides breakpoints, stepping, variable inspection, and a watch window.

Setup:

1. Install ZeroBrane Studio.
2. Add the ZeroBrane mobdebug module to your project.
3. In `main.lua`, add: `if arg[#arg] == "-debug" then require("mobdebug").start() end`
4. Launch from ZeroBrane with Project → Start Debugging.

### RenderDoc (GPU Profiling)

For advanced GPU analysis (shader performance, draw call inspection, texture bandwidth), use RenderDoc:

1. Launch LÖVE through RenderDoc.
2. Capture a frame with F12 (default).
3. Inspect individual draw calls, texture reads, and shader execution.

This is only needed for shader-heavy games or when `love.graphics.getStats()` shows high draw calls that you cannot explain.

---

## Common Performance Problems and Fixes

### Problem: Too Many Draw Calls

**Symptom:** `drawcalls` in getStats is high (hundreds or thousands). FPS drops.

**Causes and fixes:**

- **Drawing sprites in a loop** — use `SpriteBatch` to batch identical textures into one draw call:
  ```lua
  local batch = love.graphics.newSpriteBatch(spritesheet, 1000)

  function update_batch()
      batch:clear()
      for _, entity in ipairs(entities) do
          batch:add(entity.quad, entity.x, entity.y)
      end
  end

  function love.draw()
      love.graphics.draw(batch)  -- one draw call for all sprites
  end
  ```

- **Switching textures between draws** — LÖVE auto-batches consecutive draws of the same texture. Pack sprites into atlases so consecutive draws share one texture.

- **Switching shaders or canvases mid-frame** — each switch breaks batching. Minimize canvas switches; group draws by shader.

### Problem: Garbage Collector Stalls

**Symptom:** Periodic frame-time spikes (every few seconds). `collectgarbage("count")` shows sawtooth pattern.

**Causes and fixes:**

- **Creating tables every frame** — reuse tables instead of creating new ones:
  ```lua
  -- BAD: allocates a new table every frame
  function love.update(dt)
      local pos = { x = player.x, y = player.y }
  end

  -- GOOD: reuse a table
  local pos = { x = 0, y = 0 }
  function love.update(dt)
      pos.x = player.x
      pos.y = player.y
  end
  ```

- **String concatenation in loops** — use `string.format` or `table.concat` instead of `..` in tight loops.

- **Incremental GC** — spread collection across frames:
  ```lua
  function love.update(dt)
      collectgarbage("step", 1)  -- do a small amount of GC each frame
  end
  ```
  Alternatively, set `collectgarbage("setpause", 110)` for more frequent, smaller collections.

### Problem: Slow Physics

**Symptom:** `love.update` takes too long when many physics bodies exist.

**Fixes:**

- Reduce the number of active bodies. Destroy bodies that are offscreen or inactive.
- Use `body:setActive(false)` for sleeping bodies instead of destroying and recreating.
- Lower the physics iteration count if precision is not critical.
- Use simpler collision shapes (circles and rectangles) instead of complex polygons.

### Problem: Texture Memory Leak

**Symptom:** `stats.texturememory` and `stats.images` grow over time.

**Fix:** Ensure you call `:release()` on images, canvases, and fonts that are no longer needed, or let them be garbage collected by removing all references. Common leak: loading the same image repeatedly without caching.

```lua
-- Image cache pattern
local image_cache = {}
function get_image(path)
    if not image_cache[path] then
        image_cache[path] = love.graphics.newImage(path)
    end
    return image_cache[path]
end
```

---

## Debug HUD Pattern

A reusable debug overlay you can toggle with a key:

```lua
local show_debug = false

function love.keypressed(key)
    if key == "f3" then
        show_debug = not show_debug
    end
end

function draw_debug_hud()
    if not show_debug then return end

    local stats = love.graphics.getStats()
    local mem = collectgarbage("count")

    local lines = {
        string.format("FPS: %d (dt: %.1fms)", love.timer.getFPS(), love.timer.getDelta() * 1000),
        string.format("Draw calls: %d (batched: %d)", stats.drawcalls, stats.drawcallsbatched),
        string.format("Canvas switches: %d  Shader switches: %d", stats.canvasswitches, stats.shaderswitches),
        string.format("VRAM: %.1f MB (%d textures)", stats.texturememory / 1048576, stats.images),
        string.format("Lua mem: %.1f MB", mem / 1024),
        string.format("Entities: %d", #entities or 0),
    }

    love.graphics.push()
    love.graphics.origin()
    love.graphics.setColor(0, 0, 0, 0.75)
    love.graphics.rectangle("fill", 4, 4, 340, #lines * 18 + 10)
    love.graphics.setColor(0, 1, 0)
    love.graphics.setFont(love.graphics.newFont(14)) -- cache this in practice
    for i, line in ipairs(lines) do
        love.graphics.print(line, 10, 4 + (i - 1) * 18)
    end
    love.graphics.pop()
end
```

Call `draw_debug_hud()` at the end of `love.draw()` so it renders on top of everything.

---

## Performance Checklist

- [ ] FPS is stable at target (60 or your chosen cap) — check `love.timer.getFPS()`
- [ ] Draw calls are under 200 — check `love.graphics.getStats().drawcalls`
- [ ] No texture memory growth over time — monitor `stats.texturememory`
- [ ] No Lua memory growth over time — monitor `collectgarbage("count")`
- [ ] No frame spikes above 33ms — log `love.timer.getDelta()` warnings
- [ ] SpriteBatches used for tilemap and particle rendering
- [ ] Image assets packed into atlases where possible
- [ ] Tables and strings are reused, not allocated every frame
- [ ] Physics bodies are cleaned up when offscreen or unused
- [ ] `love.graphics.push()`/`pop()` used to prevent transform leaks
