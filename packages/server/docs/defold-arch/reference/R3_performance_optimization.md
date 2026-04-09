# R3 — Performance Optimization

> **Category:** reference · **Engine:** Defold · **Related:** [G9 Render Pipeline & Materials](../guides/G9_render_pipeline_and_materials.md) · [G13 Debugging & Profiling](../guides/G13_debugging_and_profiling.md) · [G11 Resource Management](../guides/G11_resource_management.md)

---

Defold's deterministic engine architecture gives you a head start on performance — the runtime is written in C++ and the Lua scripting layer is lightweight by design. But draw calls, texture memory, GC pressure, and script cost still dominate frame budgets on mobile. This reference covers the highest-impact optimization techniques.

---

## Profiling First

Never optimize blind. Defold ships a built-in profiler (Remotery-based) that breaks frame time into scopes:

| Scope | What It Measures |
|-------|-----------------|
| **Engine** | Core engine tick (collections, transforms, physics step) |
| **Render** | GPU submission — draw calls, shader execution, render script |
| **Script** | Lua execution — `update()`, `on_message()`, `on_input()` |
| **Gameobject** | Component updates — sprite animation, particle ticking |

Enable it during development: **Project → Build with Profiler**, or toggle at runtime with `profiler.enable_ui(true)`. The web profiler is also available on port 8002 when running a debug build, which is useful for profiling on-device.

**Rule of thumb:** if your frame time exceeds 16.6 ms (60 FPS) or 33.3 ms (30 FPS), identify which scope dominates before changing code.

---

## Draw Call Reduction

Draw calls are usually the biggest bottleneck on mobile. Each draw call sets up GPU state (texture bind, shader uniforms, vertex buffer) and has a fixed driver overhead that dwarfs the actual rendering cost.

### How Defold Batches

Defold automatically batches consecutive render operations when all of the following match:

1. Same **component type** (sprite, particle FX, tilemap, label, etc.)
2. Same **texture** (atlas or tile source)
3. Same **material** (shader program)
4. Same **material constants** (tint, custom uniforms)
5. Same **collection proxy world** (each proxy is a separate render world)
6. Same **blend mode**

If any of these differ between two consecutive objects, the batch breaks and a new draw call is issued.

### Practical Strategies

**Consolidate atlases.** Group sprites that render together (same scene, same layer) into the same atlas. A single 2048×2048 atlas batches better than four 512×512 atlases.

```
-- game.project atlas settings
[graphics]
max_texture_size = 2048
```

**Avoid per-instance tint changes.** Calling `go.set("#sprite", "tint", vmath.vector4(...))` on individual sprites breaks batching. If many sprites share a material but each has a unique tint, every sprite becomes its own draw call. Alternatives: bake tint into the sprite image, or use a small set of shared tint values via material constants on shared materials.

**Sort by material.** The render script controls draw order via predicates. Ensure your predicates group objects by material so the engine can batch them. Interleaving materials (sprite-A material-1, sprite-B material-2, sprite-C material-1) forces three draw calls instead of two.

**Use tilemaps for static geometry.** A tilemap renders its entire visible area in a single draw call regardless of tile count, as long as the tiles come from one tile source.

**Minimize GUI draw calls.** GUI nodes are rendered in tree order. Nodes that share the same texture and font batch. Interleaving text and image nodes from different textures breaks batches.

### Checking Draw Call Count

In the profiler, watch the **Render** scope's draw call counter. On low-end Android, target under 100 draw calls per frame. Mid-range devices handle 200–300. Desktop is far more forgiving.

---

## Texture Memory

Uncompressed RGBA textures consume `width × height × 4` bytes of GPU memory. A 2048×2048 atlas is 16 MB; a 4096×4096 atlas is 64 MB.

### Texture Profiles

Defold's texture profile system (configured in a `.texture_profiles` file) lets you apply per-atlas compression and scaling:

```
platforms {
    os: OS_ID_GENERIC
    formats {
        format: TEXTURE_FORMAT_RGBA
        compression_level: NORMAL
        compression_type: COMPRESSION_TYPE_BASIS_ETC1S
    }
    mipmaps: false
}
```

**ETC1S** (via Basis Universal): good compression ratio, works on all platforms, some quality loss — ideal for backgrounds and large tilesets.

**UASTC**: higher quality, larger files, better for hero sprites and UI.

**Platform-specific:** set separate profiles for Android (ETC2), iOS (ASTC/PVRTC), and desktop (uncompressed or BC). Defold transcodes from Basis at build time.

### Scaling Down

For atlases that don't need full resolution on mobile, apply a scale in the texture profile:

```
platforms {
    os: OS_ID_ANDROID
    formats {
        format: TEXTURE_FORMAT_RGBA
        compression_level: NORMAL
    }
    max_texture_size: 1024   -- halve 2048 atlases on Android
}
```

---

## Lua Script Performance

Defold runs Lua 5.1 (not LuaJIT on all platforms). Script optimization matters, especially on low-end mobile.

### Reduce Per-Frame Work

Every `update(self, dt)` call costs Lua overhead. If a game object doesn't need per-frame logic, don't give it an `update` function — or disable it:

```lua
function init(self)
    -- This object reacts to messages, not frames
    msg.post("#", "disable")  -- disables update() calls
end

function on_message(self, message_id, message, sender)
    if message_id == hash("wake_up") then
        msg.post("#", "enable")
    end
end
```

### Avoid Table Allocation in Hot Paths

Creating Lua tables triggers eventual GC pauses. In `update()` or `on_input()`, reuse tables:

```lua
-- BAD: allocates a new vector every frame
function update(self, dt)
    local dir = vmath.vector3(1, 0, 0)  -- new allocation
    go.set_position(go.get_position() + dir * self.speed * dt)
end

-- GOOD: reuse a pre-allocated vector
function init(self)
    self.dir = vmath.vector3(1, 0, 0)
    self.pos = vmath.vector3()
end

function update(self, dt)
    self.pos = go.get_position()
    self.pos.x = self.pos.x + self.dir.x * self.speed * dt
    go.set_position(self.pos)
end
```

### Cache Hash Values

`hash("string")` computes a hash every time it's called. For strings used in hot paths, cache them:

```lua
-- In module scope or init()
local MSG_CONTACT = hash("contact_point_response")
local MSG_TRIGGER = hash("trigger_response")

function on_message(self, message_id, message, sender)
    if message_id == MSG_CONTACT then
        -- handle collision
    elseif message_id == MSG_TRIGGER then
        -- handle trigger
    end
end
```

### Localize Frequently Called Functions

Lua's global lookup is slower than local lookup. For functions called every frame:

```lua
local go_get_position = go.get_position
local go_set_position = go.set_position
local vmath_vector3 = vmath.vector3
```

This matters most in tight loops (processing many entities per frame).

---

## Collection Proxy Loading

Collection proxies load entire worlds into memory. Careless use can cause memory spikes and load-time hitches.

### Async Loading

Always load proxies asynchronously to avoid blocking the main thread:

```lua
function load_level(self, proxy_url)
    msg.post(proxy_url, "async_load")  -- non-blocking
end

function on_message(self, message_id, message, sender)
    if message_id == hash("proxy_loaded") then
        msg.post(sender, "init")
        msg.post(sender, "enable")
    end
end
```

### Unloading

When switching levels, unload the previous proxy to free memory:

```lua
function switch_level(self, old_proxy, new_proxy)
    msg.post(old_proxy, "disable")
    msg.post(old_proxy, "final")
    msg.post(old_proxy, "unload")
    -- Load new level after unload completes
    msg.post(new_proxy, "async_load")
end
```

You can also send `"unload"` directly without first disabling/finalizing — the proxy will handle the teardown sequence automatically.

### Exclude Resources

Use Defold's **exclude** mechanism in `game.project` to strip resources from specific platform builds. Desktop builds can include uncompressed audio; mobile builds can exclude it in favor of compressed alternatives.

---

## Sound Optimization

Audio can silently consume significant memory.

### Streaming

For music and long audio files, enable streaming in `game.project`:

```ini
[sound]
stream_cache_size = 512000       -- bytes of decoded audio to keep in memory
stream_preload_size = 32768      -- initial chunk size
stream_chunk_size = 16384        -- subsequent chunk size
```

Streaming decodes audio in small chunks instead of loading the entire file into memory. A 3-minute OGG at 192 kbps is ~4.3 MB uncompressed — streaming keeps only a fraction resident.

### Short SFX

Keep sound effects short and use OGG Vorbis compression. WAV files decode instantly but consume more memory. For mobile, the trade-off favors OGG for everything except latency-critical sounds (e.g., UI clicks).

---

## Physics Optimization

Defold uses Box2D for 2D physics and Bullet for 3D. Physics simulation cost scales with active body count.

**Use triggers over dynamic bodies** when you only need overlap detection (pickups, area damage). Triggers are cheaper than full dynamic simulation.

**Reduce active bodies.** Disable physics on off-screen objects:

```lua
function update(self, dt)
    if not is_on_screen(go.get_position()) then
        msg.post("#collisionobject", "disable")
    else
        msg.post("#collisionobject", "enable")
    end
end
```

**Simplify collision shapes.** Circles and boxes are cheaper than polygons. Convex hulls are cheaper than multiple shapes on one object.

**Tune physics step.** In `game.project`, the `physics.max_collision_pairs` and `physics.max_contact_points` settings control pre-allocated buffers. Set them to reasonable upper bounds to avoid reallocation.

---

## Render Script Optimization

The render script controls the entire GPU pipeline. Common wins:

**Minimize state changes.** Group draw calls by predicate so materials and textures stay bound longer.

**Cull aggressively.** Use `render.set_viewport()` and frustum settings to skip off-screen geometry.

**Avoid full-screen post-processing on mobile.** A full-screen shader pass on a 1080p display processes ~2 million fragments. If you need blur or color grading, render to a half-resolution render target first.

```lua
-- In render script: half-res post-processing
local HALF_W = render.get_window_width() / 2
local HALF_H = render.get_window_height() / 2
render.set_render_target(self.half_res_target)
render.set_viewport(0, 0, HALF_W, HALF_H)
-- draw post-process quad
```

---

## Quick Reference: Optimization Checklist

| Area | Target | Action |
|------|--------|--------|
| Draw calls | < 100 (low-end mobile) | Consolidate atlases, avoid per-instance tints |
| Texture memory | < 128 MB total (mobile) | Texture profiles with compression, scale down |
| Lua GC | No visible hitches | Reuse tables, cache hashes, localize globals |
| Script `update()` | Only where needed | Disable update on idle objects |
| Collection proxies | Async only | `async_load`, unload when switching |
| Audio | Stream music, compress SFX | Configure `stream_cache_size` |
| Physics | Minimize active bodies | Disable off-screen, use triggers, simplify shapes |
| Render | Minimal state changes | Group by predicate, half-res post-processing |
