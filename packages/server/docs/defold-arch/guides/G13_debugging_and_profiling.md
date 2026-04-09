# Debugging & Profiling

> **Category:** guide · **Engine:** Defold · **Related:** [E1 Architecture Overview](../architecture/E1_architecture_overview.md), [G8 Hot Reload & Live Update](G8_hot_reload_and_live_update.md)

Defold ships with integrated debugging and profiling tools that work on debug builds. This guide covers print debugging, the Lua debugger, the visual profiler overlay, the web-based Remotery profiler, and performance optimization strategies.

## Print Debugging

The simplest approach. Defold provides two print functions:

```lua
-- Standard Lua print — outputs to the console
print("Player position:", self.x, self.y)

-- Pretty-print for tables — formats nested tables readably
pprint(self)
-- Output:
-- { x = 100, y = 200, speed = 300, state = "running" }
```

**Best practices:**

- Use `pprint()` for tables — `print()` on a table just shows the memory address.
- Prefix messages with the script/object name so you can filter console output:
  ```lua
  print("[player] health:", self.health)
  print("[enemy:boss] state:", self.state)
  ```
- Remove or gate debug prints before release. A common pattern:
  ```lua
  local DEBUG = sys.get_engine_info().is_debug
  local function dprint(...)
      if DEBUG then print(...) end
  end
  ```

## Defold's Lua Debugger

The editor includes a built-in Lua debugger with breakpoints, stepping, and variable inspection.

### Setting Breakpoints

1. Open a `.script` or `.gui_script` file in the Defold editor.
2. Click the gutter (left margin) next to a line number to toggle a breakpoint (red dot).
3. Run the game with **Debug > Start / Attach** (or press F5).
4. Execution pauses when a breakpoint is hit.

### Debugger Controls

| Action | Shortcut | Description |
|--------|----------|-------------|
| Continue | F5 | Resume execution until next breakpoint |
| Step Over | F10 | Execute current line, skip into function calls |
| Step Into | F11 | Step into the function call on the current line |
| Step Out | Shift+F11 | Run until the current function returns |
| Stop | Shift+F5 | Stop the debug session |

### Inspecting State

When paused at a breakpoint:

- **Variables panel** shows local variables and their values for the current scope.
- **`self`** is always visible — expand it to see all script properties.
- **Watch expressions** let you evaluate arbitrary Lua expressions.
- **Call stack** shows the execution path that reached the current line.

### Debugging Tips

- Breakpoints in `update()` fire every frame — use conditional breakpoints or set them in `on_message()` / `on_input()` for event-driven debugging.
- If the debugger won't connect, verify you're running a debug build (not release).
- The debugger attaches to the engine process — hot reload (`Ctrl+R`) preserves the debug session.

## Visual Profiler Overlay

Debug builds include a runtime profiler overlay that renders on top of the game. Toggle it with the profiler API:

```lua
-- Enable the visual profiler
profiler.enable_ui(true)

-- Disable it
profiler.enable_ui(false)
```

### Profiler Modes

```lua
-- Show the current frame (default)
profiler.set_ui_mode(profiler.MODE_RUN)

-- Pause on the current frame for inspection
profiler.set_ui_mode(profiler.MODE_PAUSE)

-- Record frames, then view the peak (worst) frame
profiler.set_ui_mode(profiler.MODE_RECORD)

-- After recording, show the peak frame
profiler.set_ui_mode(profiler.MODE_SHOW_PEAK_FRAME)
```

### View Modes

```lua
-- Minimal view — just frame time and FPS
profiler.set_ui_view_mode(profiler.VIEW_MODE_MINIMIZED)

-- Full view — all scopes with millisecond breakdown
profiler.set_ui_view_mode(profiler.VIEW_MODE_FULL)
```

### Reading the Overlay

The overlay displays a hierarchical breakdown of time spent per frame:

- **Engine** — total frame time including engine overhead
- **Script** — time in Lua `update()`, `on_message()`, etc.
- **Render** — time in the render script and GPU submission
- **Physics** — Box2D / Bullet simulation step
- **Gameobject** — game object transforms, spawning, deletion
- **Collection** — collection proxy loading/unloading

Each scope shows milliseconds per frame. At 60 FPS, your total budget is ~16.6ms. If any scope consistently exceeds its share, that's where to optimize.

### Toggling on Hot Reload

A convenient pattern is to toggle the profiler when hot-reloading during development:

```lua
function on_reload(self)
    -- Toggle profiler on each hot reload (Ctrl+R)
    self.profiler_visible = not self.profiler_visible
    profiler.enable_ui(self.profiler_visible)
end
```

## Web-Based Profiler (Remotery)

Defold uses the Remotery profiler by Celtoys. While a debug build is running, you can access an interactive timeline profiler in your browser.

### How to Connect

1. Run your game as a debug build.
2. Check the console output for the Remotery URL — it will look like:
   ```
   DEBUG:PROFILER: Remotery connected, visit http://127.0.0.1:17815/
   ```
3. Open that URL in a web browser.

### What Remotery Shows

- **Timeline view** — horizontal bars showing when each engine scope runs and how long it takes. Zoom and pan to inspect individual frames.
- **Thread view** — separate timelines for the main thread, render thread, and any background threads.
- **Sample tree** — hierarchical breakdown of nested scopes with min/max/average times.

### When to Use Remotery vs. the Visual Overlay

| Scenario | Tool |
|----------|------|
| Quick FPS check during play | Visual overlay |
| Investigating a specific frame spike | Remotery (pause + zoom) |
| Comparing frame timings over time | Remotery (timeline scroll) |
| Profiling on a mobile device | Remotery (connect from desktop browser to device IP) |
| Sharing profiling data with a teammate | Remotery (screenshots of timeline) |

## Memory Profiling

### Lua Memory

Track Lua memory usage with `collectgarbage()`:

```lua
function update(self, dt)
    if self.frame_count % 60 == 0 then
        local kb = collectgarbage("count")
        print(string.format("[memory] Lua: %.1f KB", kb))
    end
    self.frame_count = (self.frame_count or 0) + 1
end
```

### Common Memory Issues

- **Table churn** — creating and discarding tables every frame triggers frequent GC pauses. Pool and reuse tables instead.
- **String concatenation in loops** — each `..` creates a new string. Use `table.concat()` for building strings.
- **Unreleased references** — if you store entity IDs or URLs in a table but never remove them after deletion, the referenced data stays in memory.

```lua
-- BAD: creates a new vector table every frame
function update(self, dt)
    local velocity = vmath.vector3(self.speed * dt, 0, 0)
    go.set_position(go.get_position() + velocity)
end

-- GOOD: reuse a cached vector
function init(self)
    self.velocity = vmath.vector3()
end

function update(self, dt)
    self.velocity.x = self.speed * dt
    self.velocity.y = 0
    self.velocity.z = 0
    go.set_position(go.get_position() + self.velocity)
end
```

## Performance Optimization Checklist

### Script Performance

1. **Cache `hash()` calls.** Hashing a string every frame is wasteful:
   ```lua
   -- BAD: hashes "my_message" every time on_message fires
   if message_id == hash("my_message") then ... end

   -- GOOD: hash once at file scope
   local MSG_MY_MESSAGE = hash("my_message")
   if message_id == MSG_MY_MESSAGE then ... end
   ```

2. **Minimize `go.get_position()` / `go.set_position()` calls.** Each call crosses the Lua-C boundary. Read once, compute, write once.

3. **Avoid `msg.post()` in tight loops.** Messages are queued and dispatched — high-volume messaging adds overhead. Use shared Lua modules for hot-path data.

4. **Use `go.animate()` instead of manual tweening in `update()`.** The engine's animator runs in C and is significantly faster than Lua-side interpolation.

### Rendering Performance

1. Reduce draw calls by using atlas textures — one atlas = one draw call for all sprites using it.
2. Minimize GUI node count — hidden nodes still cost transform updates.
3. Avoid per-frame material constant changes when possible.

### Physics Performance

1. Use trigger collision objects (no physics response) instead of dynamic bodies when you only need overlap detection.
2. Set appropriate collision groups and masks — objects that never interact should not be in the same mask.
3. Reduce collision shape complexity — prefer boxes and circles over convex polygons.

## Debugging Checklist for Common Issues

| Symptom | Check |
|---------|-------|
| Message not received | Is the address correct? Check console for "Could not send message" warnings. Verify `hash()` on message ID. |
| Input not working | Did you `acquire_input_focus` in `init()`? Is another object consuming the input? |
| Object not visible | Check z-order, render script draw predicates, and whether the object is enabled. |
| Physics not responding | Verify collision group/mask configuration in `game.project`. Check that the collision object type is correct (kinematic vs dynamic vs trigger). |
| Sudden frame drops | Enable Remotery, reproduce the drop, and inspect the spike frame. Common causes: GC pause, large collection proxy load, excessive `msg.post()` volume. |
| Memory growing over time | Track Lua memory with `collectgarbage("count")`. Check for entity tables that grow but never shrink. |
