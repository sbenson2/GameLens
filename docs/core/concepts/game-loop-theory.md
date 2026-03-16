# Game Loop -- Theory & Concepts

This document covers engine-agnostic game loop theory, including timestep models, frame independence, and optimization principles. For engine-specific implementations, see the relevant engine module.

---

## The Game Loop

Every game runs a continuous loop:

```
while game_is_running:
    process_input()
    update(dt)
    render()
```

The critical question is how `dt` (delta time) is determined.

---

## Timestep Models

### Variable Timestep

`dt` equals the actual elapsed time since the last frame. Simple but problematic:

- **Non-deterministic physics** -- same inputs produce different results at different frame rates
- **Instability** -- large dt spikes cause objects to teleport through walls
- **Frame-rate dependent behavior** -- game plays differently on fast vs slow hardware

### Fixed Timestep

Logic always runs at a fixed rate (typically 60 Hz). An accumulator tracks leftover time:

```
fixed_dt = 1/60
accumulator = 0

each frame:
    accumulator += frame_elapsed_time
    accumulator = min(accumulator, max_dt)    // prevent spiral of death

    while accumulator >= fixed_dt:
        update_game_logic(fixed_dt)
        accumulator -= fixed_dt

    render()
```

**Benefits:**
- Deterministic physics and logic
- Consistent behavior across all hardware
- Required for rollback netcode and replays

### Spiral of Death Prevention

If a frame takes too long, the accumulator grows, requiring more simulation steps, which take even longer. Cap the accumulator to a maximum (e.g., 0.25 seconds = 15 steps max) to break the cycle.

---

## Render Interpolation

With fixed timestep, the game state updates at a fixed rate but rendering can happen at any rate (60 Hz, 120 Hz, 144 Hz, 240 Hz). The leftover accumulator fraction provides an interpolation alpha:

```
alpha = accumulator / fixed_dt
render_position = lerp(previous_position, current_position, alpha)
```

This produces smooth visuals at any display refresh rate while keeping logic deterministic. The trade-off is one frame of visual latency.

**Many 2D games skip interpolation** and accept the minor visual quantization. It is most noticeable at high refresh rates (144+ Hz).

---

## Frame Independence

All time-based values must use delta time to be frame-rate independent:

```
// WRONG: frame-rate dependent
position.x += speed

// CORRECT: frame-rate independent
position.x += speed * dt
```

**Common pitfall with lerp:** `lerp(current, target, 0.1)` without dt creates frame-rate-dependent smoothing. At 30 fps it smooths slower than at 120 fps. Use exponential decay instead:

```
t = 1 - pow(smoothing_factor, dt)
value = lerp(current, target, t)
```

---

## Culling and Batching

### Frustum Culling

Test object bounds against the camera viewport before rendering. Reject objects that are entirely off-screen. Typically eliminates 50--80% of draw calls.

### Sprite Batching

Accumulate vertex data for all sprites sharing the same render state (texture, shader, blend mode). Flush as a single draw call when state changes.

**Batches break on:** Texture changes, shader changes, blend mode changes, or buffer fullness.

### Strategies

- Use texture atlases (2048x2048 is safe for all hardware)
- Minimize shader variants
- Sort draw order to minimize state changes
- Target ~1x overdraw; sort opaque sprites front-to-back

---

## System Execution Order

A typical 2D game loop processes systems in this order:

```
1. Input            -- read controller/keyboard/mouse
2. AI               -- decision-making
3. Moving Platforms  -- move platforms, apply delta to riders
4. Gravity          -- apply gravity to velocity
5. Player Movement  -- apply input to velocity
6. Physics Step     -- integrate velocity into position
7. Tile Collision   -- resolve vs tilemap
8. Entity Collision -- entity-vs-entity
9. Ground Detection -- update grounded state
10. Animation       -- pick animation from state
11. Render          -- draw with interpolated positions
```

---

## Final Principles

1. **Measure before optimizing** -- profile on target hardware in release builds
2. **Focus on p99 frame times** -- not averages; one 50ms spike per second ruins the feel
3. **Simplest correct solution** -- often performs adequately
4. **High-impact optimizations first** -- object pooling, frustum culling, spatial partitioning, fixing algorithmic complexity
5. **Ship games** -- architecture serves the game, not vice versa

---

*Implementation examples are available in engine-specific modules.*
