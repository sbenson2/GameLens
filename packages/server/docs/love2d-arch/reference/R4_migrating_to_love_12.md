# R4 — Migrating to LÖVE 12

> **Category:** reference · **Engine:** Love2D · **Related:** [E1 Architecture Overview](../architecture/E1_architecture_overview.md) · [R1 Module Reference](R1_module_reference.md) · [G1 Game Loop & Callbacks](../guides/G1_game_loop_and_callbacks.md)

---

## Overview

LÖVE 12.0 ("Bestest Friend") is a major release with breaking changes to several APIs. This reference covers what changes, what breaks, and how to update your 11.x project. The focus is on changes that will cause errors or silent behavior differences — cosmetic API tweaks are omitted unless they affect correctness.

---

## Breaking Changes

### Renamed List Functions

All `get[Object]List` functions have been renamed to `get[Object]s`:

| 11.x | 12.0 |
|------|------|
| `love.graphics.getCanvasList()` | `love.graphics.getCanvases()` |
| `love.audio.getSourceList()` | `love.audio.getSources()` |
| `love.joystick.getJoystickList()` | `love.joystick.getJoysticks()` |
| `love.touch.getTouchList()` | `love.touch.getTouches()` |

**Fix:** Find and replace across your codebase. The old names are removed entirely — calling them will raise an error.

```lua
-- 11.x
local sources = love.audio.getSourceList()

-- 12.0
local sources = love.audio.getSources()
```

### Mesh Vertex Format Changes

The vertex format used with `love.graphics.newMesh` now uses `format` and `location` named fields instead of positional tables:

```lua
-- 11.x
local mesh = love.graphics.newMesh({
    { "VertexPosition", "float", 2 },
    { "VertexTexCoord", "float", 2 },
    { "VertexColor",    "byte",  4 },
}, vertices, "fan")

-- 12.0 — named fields, no default draw mode
local mesh = love.graphics.newMesh({
    { format = "float", location = "VertexPosition", components = 2 },
    { format = "float", location = "VertexTexCoord", components = 2 },
    { format = "unorm8", location = "VertexColor", components = 4 },
}, vertices, "triangles")  -- "fan" is no longer the default
```

**Key differences:**
- Fields use named keys (`format`, `location`) instead of positional arrays
- `"byte"` type is replaced with `"unorm8"`
- `love.graphics.newMesh` no longer defaults to `"fan"` draw mode — specify explicitly

### Removed Deprecated Functions

Functions deprecated since LÖVE 0.10.x and earlier are removed:

| Removed | Replacement |
|---------|-------------|
| `love.graphics.newScreenshot()` | `love.graphics.captureScreenshot(callback)` |
| `love.window.isCreated()` | `love.window.isOpen()` |
| Various 0.10.x shim functions | See LÖVE wiki deprecation list |

**Fix:** If your project uses any functions deprecated since 0.10.x, they will now error. Check the [LÖVE wiki Version History](https://love2d.org/wiki/Version_History) for the full deprecation list.

### Screenshot API Change

The screenshot API is now callback-based instead of returning a value:

```lua
-- 11.x (synchronous, removed)
local imageData = love.graphics.newScreenshot()
imageData:encode("png", "screenshot.png")

-- 12.0 (asynchronous, callback-based)
love.graphics.captureScreenshot(function(imageData)
    imageData:encode("png", "screenshot.png")
end)
```

The callback is invoked at the end of the current frame's draw cycle.

---

## New Features Worth Adopting

### LuaJIT 2.1

LÖVE 12 ships LuaJIT 2.1 (upgraded from 2.0) on all platforms that support it. This brings:

- Improved performance for table operations and string handling
- Better trace compilation for common game loop patterns
- New `table.move()`, `table.new()` functions

No code changes required — your existing Lua runs faster.

### New Pixel Formats

Canvas (render target) creation supports new formats:

```lua
-- New 16-bit formats for HDR / precision rendering
local canvas = love.graphics.newCanvas(800, 600, { format = "r16" })
local canvas = love.graphics.newCanvas(800, 600, { format = "rg16" })
local canvas = love.graphics.newCanvas(800, 600, { format = "rgba16" })
```

Useful for light maps, height maps, and post-processing passes that need more than 8-bit precision.

### Texture Coordinates in Shape Shaders

Filled shapes (rectangles, circles, polygons) now provide texture coordinates to pixel shaders. In 11.x, only meshes and sprites had UVs — shapes had `(0, 0)` for every pixel.

```glsl
// This now works correctly for love.graphics.rectangle("fill", ...)
vec4 effect(vec4 color, Image tex, vec2 texture_coords, vec2 screen_coords) {
    // texture_coords range from (0,0) to (1,1) across the shape
    float gradient = texture_coords.x;
    return vec4(color.rgb * gradient, color.a);
}
```

### New Callbacks

```lua
-- Called when the user's system locale changes (e.g., language switch)
function love.localechanged()
    reload_translations()
end

-- Drag-and-drop now has begin/move/complete phases
function love.dropbegan(x, y)
    show_drop_target()
end

function love.dropmoved(x, y)
    update_drop_highlight(x, y)
end

function love.dropcompleted(file, x, y)
    handle_dropped_file(file)
    hide_drop_target()
end
```

These replace the single `love.filedropped` for richer drag-and-drop UX.

### Native arm64 macOS

LÖVE 12 runs natively on Apple Silicon (M1/M2/M3/M4) without Rosetta translation. If you distribute `.love` files, users on Apple Silicon get a performance boost automatically. If you distribute bundled `.app` packages, build with the arm64 LÖVE binary.

---

## Migration Checklist

1. **Search for renamed functions.** Grep for `getSourceList`, `getCanvasList`, `getJoystickList`, `getTouchList` and replace with the `get*s` variants.

2. **Search for removed functions.** Grep for `newScreenshot`, `isCreated`, and any other 0.10.x-era API calls.

3. **Audit Mesh creation.** If you use `love.graphics.newMesh` with custom vertex formats, update to named fields. Check that you specify a draw mode explicitly.

4. **Check shader assumptions.** If any shader relied on shape draw calls having `(0,0)` texture coordinates, the behavior changes in 12.0. This is usually a fix, not a regression, but verify.

5. **Test on LuaJIT 2.1.** While backward-compatible, some edge cases in FFI usage or `debug` library behavior may differ. Run your test suite.

6. **Update CI.** If your CI installs LÖVE from a PPA or GitHub release, pin to the 12.x release channel.

7. **Update `conf.lua` version.** Set the compatibility version so LÖVE knows which behavior to expect:
   ```lua
   function love.conf(t)
       t.version = "12.0"
       -- ... rest of config
   end
   ```

---

## Compatibility Shim

If you need to support both 11.x and 12.0 during the transition (e.g., a library), use a simple compatibility layer:

```lua
-- compat.lua
if not love.audio.getSources then
    -- Running on 11.x — alias new names to old
    love.audio.getSources = love.audio.getSourceList
    love.joystick.getJoysticks = love.joystick.getJoystickList
    love.touch.getTouches = love.touch.getTouchList
end

if love.graphics.newScreenshot then
    -- Running on 11.x — provide callback-based wrapper
    local original = love.graphics.captureScreenshot or function(cb)
        cb(love.graphics.newScreenshot())
    end
    love.graphics.captureScreenshot = original
end
```

Require this at the top of `main.lua` before any other code.

---

## Further Reading

- [LÖVE 12.0 wiki page](https://love2d.org/wiki/12.0)
- [LÖVE Version History](https://love2d.org/wiki/Version_History)
- [LÖVE GitHub Releases](https://github.com/love2d/love/releases)
