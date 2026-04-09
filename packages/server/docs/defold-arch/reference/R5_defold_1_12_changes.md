# R5 — Defold 1.12 Changes

> **Category:** reference · **Engine:** Defold · **Related:** [E1 Architecture Overview](../architecture/E1_architecture_overview.md) · [G15 Lua Scripting Patterns](../guides/G15_lua_scripting_patterns.md) · [R3 Performance Optimization](R3_performance_optimization.md) · [G9 Render Pipeline & Materials](../guides/G9_render_pipeline_and_materials.md)

---

## Overview

Defold 1.12.0 (released January 2026) introduces several significant changes to the script lifecycle, text rendering, and engine performance APIs. This reference covers the breaking changes, new features, and migration notes for developers moving from 1.11.x to 1.12.

---

## Script Execution Order (Breaking Change)

The biggest change in 1.12 is the new script callback execution order. In 1.11.x, `fixed_update()` could be called at various points relative to `update()`. In 1.12, the order is now deterministic:

### New Execution Order Per Frame

```
1. fixed_update(fixed_dt)    -- zero or more times (physics tick rate)
2. update(dt)                -- exactly once per frame
3. [messages dispatched]     -- all in-game messages sent during update
4. late_update(dt)           -- exactly once per frame (NEW)
5. [render script]           -- frame is drawn
```

### `fixed_update(dt)` Now Runs Before `update(dt)`

In 1.11.x, the relative ordering of `fixed_update` and `update` was not guaranteed. In 1.12, `fixed_update` always runs first. This matters for physics-driven games:

```lua
-- 1.12 pattern: physics input in fixed_update, visual smoothing in update
function fixed_update(self, dt)
    -- Apply forces and physics-dependent logic here
    -- This runs at a fixed timestep (set in game.project)
    if self.move_input ~= 0 then
        local force = vmath.vector3(self.move_input * self.force, 0, 0)
        msg.post("#collisionobject", "apply_force", {
            force = force,
            position = go.get_world_position(),
        })
    end
end

function update(self, dt)
    -- Visual-only updates: camera follow, animation, HUD
    -- Physics state is already resolved for this frame
    update_camera(self, dt)
    update_animation(self)
end
```

### `late_update(dt)` — New Callback

`late_update()` is called after `update()` and after all messages dispatched during `update()` have been processed. This is the right place for logic that depends on other objects having updated first:

```lua
function late_update(self, dt)
    -- Safe to read other objects' positions — they've all updated
    -- Components will update inner transforms after script execution
    local target_pos = go.get_position("/player/player")
    local my_pos = go.get_position()

    -- Smooth camera follow that always tracks the player's final position
    local lerped = vmath.lerp(self.follow_speed * dt, my_pos, target_pos)
    go.set_position(lerped)
end
```

**When to use `late_update`:**

- Camera scripts that follow other objects
- UI elements that track world positions (health bars above enemies)
- Post-movement collision checks or visual corrections
- Any logic that needs the "final" positions of other objects this frame

**Note:** The order in which `late_update()` is called across different scripts is unspecified (same as `update()`). Don't depend on script A's `late_update` running before script B's.

### Migration from 1.11.x

If your game relied on the previous (unspecified) ordering:

1. **Physics logic in `update()`**: Move physics force/impulse application to `fixed_update()`.
2. **Camera in `update()`**: Move camera-follow logic to `late_update()` for smoother tracking.
3. **Post-message logic**: If you sent a message in `update()` and expected it to be handled before the frame ended, this still works — messages are dispatched between `update()` and `late_update()`.

---

## Unicode Text Shaping

Defold 1.12 adds runtime Unicode text shaping support, a major upgrade for localized games:

### Features

- **Pair kerning**: Proper spacing between character pairs (e.g., "AV", "To")
- **Ligatures**: Automatic ligature substitution for fonts that support them (important for Arabic and Devanagari scripts)
- **Right-to-left (RTL) text**: Native RTL layout for Arabic, Hebrew, and other RTL scripts
- **Bidirectional text**: Mixed LTR/RTL text within the same label

### Usage

Text shaping happens automatically when using `label` components or `gui.set_text()` with fonts that contain the required OpenType tables. No code changes are needed for existing projects — labels that previously displayed incorrect glyph ordering will now render correctly.

```lua
-- No special API needed — set text as usual
label.set_text("#label", "مرحبا بالعالم")  -- Arabic: renders RTL automatically
label.set_text("#label", "AV Typography")    -- English: now properly kerned
```

### Font Requirements

For text shaping to work, your font files must include OpenType layout tables (GPOS, GSUB). Most modern TTF/OTF fonts include these. Bitmap fonts (`*.fnt`) do not support shaping.

---

## Engine Throttle API

A new Lua API allows developers to skip engine updates entirely, keeping only input detection active. This is useful for idle screens, pause menus, or energy-saving modes:

```lua
-- Throttle the engine: skip rendering and logic updates
-- Only input detection continues running
engine.set_throttle(true)

-- Resume normal operation
engine.set_throttle(false)
```

### Use Cases

- **Pause menu**: Throttle while a static pause screen is shown. Input still works, so the player can unpause.
- **Background tab**: Detect when the game loses focus and throttle to save battery on mobile.
- **Idle games**: When the game is in a "waiting" state with no animation, throttle to reduce power consumption.

### Caveats

- While throttled, `update()`, `fixed_update()`, and `late_update()` are **not called**.
- Timers, animations (`go.animate`), and physics do not advance.
- Only input callbacks (`on_input`) continue to fire.
- Messages are still delivered but may be delayed until the engine un-throttles.

---

## Other Notable Changes

### Render Script Updates

With `late_update()` running before the render script, the render pipeline now receives more up-to-date transform data. If your custom render script samples game object positions, those positions reflect `late_update()` adjustments.

### Collection Proxy Behavior

No changes to proxy loading/unloading semantics, but the new execution order means that `fixed_update` in a proxy-loaded collection runs before `update` in the bootstrap collection within the same frame.

---

## Quick Migration Checklist

- [ ] Move physics force/impulse code from `update()` to `fixed_update()`
- [ ] Move camera-follow and post-update logic to `late_update()`
- [ ] Verify that any frame-order-dependent logic still works with the deterministic order
- [ ] Test RTL/bidirectional text if your game is localized for Arabic or Hebrew
- [ ] Consider using `engine.set_throttle()` for pause screens and idle states
- [ ] Review custom render scripts for any assumptions about when transforms are finalized
