# G20 — Particles & Visual Effects

> **Category:** guide · **Engine:** Defold · **Related:** [G9 Render Pipeline & Materials](G9_render_pipeline_and_materials.md) · [G2 Game Objects & Collections](G2_game_objects_and_collections.md) · [G7 Animation & Audio](G7_animation_and_audio.md)

Defold's built-in ParticleFX system handles explosions, smoke, fire, rain, sparkles, and other visual effects. Effects are authored in the editor with real-time preview and controlled at runtime through Lua scripting. No external plugins required.

---

## Creating a Particle Effect

1. In the Assets browser, right-click a folder and select **New... → Particle FX**.
2. The editor opens with one default emitter. Customize properties in the Properties pane.
3. Add more emitters by right-clicking in the Outline and selecting **Add Emitter**.
4. Add modifiers by right-clicking an emitter (or the root for global modifiers) and selecting **Add Modifier**.

### Adding to a Game Object

Add a ParticleFX component to any game object:

1. Open the game object (`.go`) or collection (`.collection`) in the editor.
2. Right-click the game object in the Outline → **Add Component** (or **Add Component File** to reference a shared `.particlefx`).
3. Set the **Id** (e.g., `particles`) — this is how you address it from scripts.

---

## Emitter Properties

### Playback

| Property | Description |
|----------|-------------|
| **Play Mode** | `Once` — plays and stops. `Loop` — restarts after duration. |
| **Duration** | How long the emitter spawns particles (seconds). |
| **Start Delay** | Seconds before the emitter begins spawning. |
| **Start Offset** | Pre-warms the simulation by this many seconds. Useful for effects that should appear "already running" (e.g., ambient fire). |

### Emission

| Property | Description |
|----------|-------------|
| **Spawn Rate** | Particles per second. Supports keyframe curves over the emitter's duration. |
| **Max Particle Count** | Hard cap on concurrent particles. Excess particles are not spawned. |
| **Emission Space** | `World` — particles stay in world space when the emitter moves. `Emitter` — particles follow the emitter. |

### Particle Lifecycle

| Property | Description |
|----------|-------------|
| **Life** | How long each particle lives (seconds). |
| **Initial Speed** | Starting velocity magnitude. |
| **Size** | Particle size. Keyframeable over particle lifetime. |
| **Color (R, G, B, Alpha)** | Each channel keyframeable over particle lifetime. |
| **Rotation** | Starting rotation and angular velocity. |
| **Stretch** | Scale along the movement direction (for trails/streaks). |
| **Inherit Velocity** | How much of the emitter's velocity transfers to spawned particles (0–1). |

### Visual

| Property | Description |
|----------|-------------|
| **Image** | Tile source or Atlas providing the particle texture. |
| **Animation** | Which animation from the image to use. Single-frame for static particles; multi-frame for animated particles. |
| **Material** | Custom material for shader effects. Default: `builtins/materials/particlefx.material`. |
| **Blend Mode** | `Alpha`, `Add` (glow/fire), `Multiply` (shadows), `Screen` (soft brightening). |
| **Size Mode** | `Auto` — uses the source frame size. `Manual` — uses the Size property. |
| **Particle Orientation** | `Default`, `Initial Direction`, or `Movement Direction`. |

---

## Emitter Types

The emitter type determines the shape of the spawn volume.

| Type | Shape | Key Dimensions |
|------|-------|----------------|
| **Circle** | Flat disc | Diameter = Emitter Size X |
| **Box** | Rectangular volume, particles emit upward | Width = X, Height = Y, Depth = Z |
| **Sphere** | 3D sphere, particles radiate outward | Radius from Emitter Size |
| **2D Cone** | Triangular spread | Spread angle from Emitter Size |
| **Cone** | 3D cone | Top diameter = X, Height = Y |

---

## Modifiers

Modifiers alter particle velocity after spawning. Add them to individual emitters (affects only that emitter's particles) or to the ParticleFX root (affects all emitters).

| Modifier | Effect | Use Case |
|----------|--------|----------|
| **Acceleration** | Constant directional force | Gravity, wind |
| **Drag** | Velocity-proportional slowdown | Air resistance, underwater feel |
| **Radial** | Attract or repel from a point | Implosions, magnetic effects |
| **Vortex** | Circular motion around a point | Swirling smoke, tornado effects |

Each modifier has:
- **Position / Rotation**: Where the force originates (relative to emitter or root).
- **Magnitude**: Strength of the effect. Keyframeable over emitter duration.
- **Max Distance** (Radial, Vortex only): Particles beyond this distance are unaffected.

---

## Scripting API

### Playing and Stopping

```lua
function init(self)
    -- Play the effect on this game object's "explosion" component
    particlefx.play("#explosion")
end

-- Stop emitting, but let existing particles finish their lifecycle
particlefx.stop("#explosion")

-- Stop and immediately clear all particles
particlefx.stop("#explosion", { clear = true })
```

### Emitter State Callbacks

Track emitter lifecycle by passing a callback to `play()`:

```lua
particlefx.play("#explosion", function(self, id, emitter, state)
    if state == particlefx.EMITTER_STATE_POSTSPAWN then
        -- All particles have been spawned; emitter is winding down
    end
end)
```

**Emitter states:**

| Constant | Meaning |
|----------|---------|
| `particlefx.EMITTER_STATE_SLEEPING` | No particles alive, not spawning |
| `particlefx.EMITTER_STATE_PRESPAWN` | Started, before first particle |
| `particlefx.EMITTER_STATE_SPAWNING` | Actively emitting particles |
| `particlefx.EMITTER_STATE_POSTSPAWN` | Done spawning, particles still alive |

### Runtime Tinting

Override shader constants at runtime to recolor effects without duplicating `.particlefx` files:

```lua
-- Tint the "sparks" emitter red
particlefx.set_constant("#effect", "sparks", "tint", vmath.vector4(1, 0.2, 0.2, 1))

-- Reset to the material's default
particlefx.reset_constant("#effect", "sparks", "tint")
```

This uses the `tint` constant defined in the default particle material.

---

## GUI Particle Effects

ParticleFX can also be used inside GUI scenes for menu effects, button highlights, and transitions.

1. Add a **Particle FX** node to a `.gui` file (right-click Particle FX folder → Add).
2. Set the particlefx resource on the node.
3. Control from the `.gui_script`:

```lua
function init(self)
    local node = gui.get_node("sparkle")
    gui.play_particlefx(node)
end

function final(self)
    local node = gui.get_node("sparkle")
    gui.stop_particlefx(node)
end
```

GUI particles render in GUI coordinate space and layer with other GUI nodes.

---

## Common Effect Recipes

### Fire

- Emitter type: **Circle** (small diameter).
- Blend mode: **Add** for glow.
- Color curve: orange → yellow → transparent over particle life.
- Size curve: medium → small (shrink as it rises).
- Add an **Acceleration** modifier pointing upward for rise.
- Add a **Drag** modifier for natural slowdown.
- Use 2–3 emitters: base flame, sparks, and smoke (smoke uses Alpha blend with gray tint).

### Explosion

- Play mode: **Once**.
- High spawn rate, short duration (burst of particles).
- Initial speed: high with wide spread.
- Strong **Drag** modifier for rapid deceleration.
- Color: white → orange → dark, with alpha fading to zero.
- Add a secondary emitter for debris/sparks with longer life.

### Rain

- Emitter type: **Box** (wide X, positioned above the camera).
- Emission space: **World** (rain stays in place as camera moves).
- Particle orientation: **Movement Direction** with stretch for streaks.
- Acceleration modifier: downward gravity.
- Blend mode: **Alpha** with semi-transparent white/blue.

### Trail / Sparkle

- Attach the ParticleFX to a moving game object.
- Emission space: **World** (particles are left behind as the object moves).
- Low spawn rate, moderate particle life.
- Size curve: starts visible, fades to zero.
- Blend mode: **Add** for magical glow effects.

---

## Performance Considerations

1. **Max Particle Count matters.** Each particle consumes memory and GPU fill rate. Set the cap as low as you can while maintaining visual quality.
2. **Fewer emitters per effect.** Combine visual layers when possible rather than stacking many emitters.
3. **Additive blending is cheaper** than Alpha blending because it skips the read-back of the destination pixel on some GPUs.
4. **Use `{ clear = true }` on stop** when recycling effects (e.g., returning to a pool) to prevent stale particles from rendering.
5. **Texture atlas efficiency.** Put particle textures in a shared atlas with other small sprites to reduce texture swaps.
6. **Profile with the built-in profiler.** Open **Debug → Toggle Profiler** to monitor particle system CPU and GPU cost.

---

## Common Pitfalls

| Pitfall | Fix |
|---------|-----|
| Particles continue after deleting the game object | ParticleFX outlives its owner by design. Call `particlefx.stop(url, { clear = true })` before deleting, or use the emitter state callback to delete after `POSTSPAWN`. |
| Effect invisible at game start | Check that `particlefx.play()` is called and the game object is enabled. Also verify the particle's Z position is within the camera's render range. |
| Particles spawn at origin, not at the game object | Verify the ParticleFX is a component on the game object, not a standalone game object at (0,0,0). |
| Color looks wrong with Additive blend | Additive blending adds RGB to the background. Dark backgrounds show the effect; light backgrounds wash it out. |
| `set_constant` has no visible effect | The first argument is the ParticleFX URL, the second is the **emitter ID** (not the component ID). Check your emitter's ID in the Outline. |
