# R1 — Behaviors & Effects Reference

> **Category:** reference · **Engine:** Construct · **Related:** [E1 Architecture Overview](../architecture/E1_architecture_overview.md) · [G1 Event Sheet Patterns](../guides/G1_event_sheet_patterns.md)

---

## Behaviors: Plug-and-Play Functionality

Behaviors are Construct 3's primary composition mechanism. Instead of writing movement or physics code from scratch, you attach behaviors to object types. Each behavior adds its own properties, conditions, actions, and expressions to the object. Multiple behaviors can be stacked on a single object.

Behaviors are added via the **Object Behaviors** dialog (right-click an object type → Behaviors → Add).

---

### Movement Behaviors

| Behavior | What It Does | Typical Use |
|----------|-------------|-------------|
| **8 Direction** | Grid or free movement in 8 (or 4) directions via arrow keys/WASD | Top-down RPG characters, twin-stick movement |
| **Platform** | Side-view jump-and-run physics with slopes, one-way platforms | Platformer player characters |
| **Bullet** | Moves an object forward at its current angle at a set speed | Projectiles, enemies that patrol in a direction |
| **Car** | Simulates top-down vehicle steering (acceleration, drift) | Racing games, vehicle sections |
| **Orbit** | Moves the object in an elliptical orbit around a point | Moons, rotating shields, UI elements |
| **Pathfinding** | A* pathfinding on a grid, works with Solid/tilemap obstacles | RTS units, tower defense enemies |
| **Scroll To** | Camera follows this object | Player character in scrolling games |
| **Drag & Drop** | Lets the user drag the object with mouse/touch | Puzzle pieces, inventory items |
| **MoveTo** | Move to a target position with easing | Smooth repositioning, cutscenes |

### Physics Behavior

Construct integrates Box2D for full rigid-body physics. The **Physics** behavior gives objects mass, friction, restitution (bounciness), and collision shapes.

| Property | What It Controls |
|----------|-----------------|
| Immovable | Static body (walls, floors) — participates in collisions but doesn't move |
| Density | Mass per area — heavier objects push lighter ones |
| Friction | Resistance when sliding against other physics objects |
| Restitution | Bounciness (0 = no bounce, 1 = perfect bounce) |
| Linear damping | Air resistance / drag |
| Angular damping | Rotational slowdown |
| Collision shape | Bounding box, circle, polygon, or tilemap |

**Key rule:** Physics objects should only be moved by applying forces/impulses — never set position directly, or the simulation breaks.

### Utility Behaviors

| Behavior | What It Does | Typical Use |
|----------|-------------|-------------|
| **Solid** | Marks object as impassable for Platform, 8 Direction, and Pathfinding | Walls, terrain, obstacles |
| **Jumpthru** | Solid from above only — can jump up through it | One-way platforms |
| **Persist** | Object survives layout transitions | Player, inventory, global managers |
| **Destroy Outside Layout** | Auto-destroy when leaving the visible area | Off-screen projectiles, particles |
| **Bound To Layout** | Prevent leaving layout bounds | Player characters in bounded levels |
| **Fade** | Fade opacity in/out over time, optionally destroy at end | Hit effects, death animations |
| **Flash** | Toggle visibility rapidly | Damage feedback, invincibility frames |
| **Wrap** | Wrap around layout edges (Asteroids-style) | Classic arcade mechanics |
| **Pin** | Lock position/angle relative to another object | Weapons attached to characters, UI anchored to objects |
| **Timer** | Named timers that fire trigger conditions | Delayed actions, cooldowns, periodic spawning |
| **Tween** | Animate any property with easing curves | Smooth UI transitions, position tweening, scale pulses |

### Tween Behavior Details

The Tween behavior is critical for polished games. It can animate position, size, angle, opacity, value, and color with configurable easing.

Key actions: **Tween → Start** (property, start, end, duration, easing, loop mode). Easing functions include: `linear`, `ease-in`, `ease-out`, `ease-in-out` with curve types like `quad`, `cubic`, `elastic`, `bounce`, `back`.

```
// Event sheet pseudocode — tween a button scale on hover
On Button hovered:
    Button → Tween: Start "scale-up" tweening Width from 100 to 120 in 0.2s (ease-out back)
    Button → Tween: Start "scale-up-h" tweening Height from 100 to 120 in 0.2s (ease-out back)
```

---

### Custom Behaviors (Addon SDK)

You can create entirely new behaviors using the **Construct Addon SDK** (JavaScript). A custom behavior consists of:

| File | Purpose |
|------|---------|
| `behavior.js` | Metadata — name, category, supported object type |
| `instance.js` | Per-instance logic — `onCreate()`, `tick()`, `tick2()` lifecycle hooks |
| `type.js` | Shared per-type logic (rarely needed) |
| `conditions.js` | Custom conditions for event sheets |
| `actions.js` | Custom actions for event sheets |
| `expressions.js` | Custom expressions (return values) |

The SDK is available at: `github.com/Scirra/Construct-Addon-SDK`

Behaviors run in two tick phases: `tick()` runs before event sheets, `tick2()` runs after. Use `tick()` for input/physics updates and `tick2()` for position corrections after events have run.

---

## Effects: GPU-Powered Visual Processing

Effects (also called blend modes or WebGL/WebGPU shaders) are applied to **objects**, **layers**, or **layouts** to transform their visual output. Effects are processed on the GPU and are non-destructive — they don't change the source image.

### Applying Effects

Effects are added via the **Effects** panel in the Properties sidebar. You can stack multiple effects — they process top-to-bottom as a chain.

Each effect exposes **parameters** that can be adjusted at edit time or changed at runtime via actions:

```
// Event sheet — animate a shockwave effect parameter
Every tick:
    Set ShockwaveEffect "progress" to min(ShockwaveEffect.progress + dt * 0.5, 1.0)
```

### Built-In Effect Categories

| Category | Examples | Use Cases |
|----------|----------|-----------|
| **Blend** | Additive, Multiply, Screen, Overlay, Dodge, Burn | Lighting overlays, shadow layers, particle glow |
| **Color** | Grayscale, Sepia, Hue Rotate, Color Replace, Tint | Damage flash, ability indicators, retro filters |
| **Distortion** | Warp, Bulge, Shockwave, Ripple, Water | Screen shake, impact effects, underwater scenes |
| **Blur** | Gaussian Blur, Radial Blur, Motion Blur, Zoom Blur | Speed lines, depth of field, menu backgrounds |
| **Masking** | Mask (cut out shapes), Stencil | Fog of war, spotlight reveals, custom UI shapes |
| **Other** | Pixelate, Glass, Vignette, Noise, Outline, Shadow | Retro aesthetics, UI polish, emphasis effects |

### Blend Modes (Simplified)

Every object and layer has a **Blend mode** property (separate from effects):

| Mode | Formula | Visual Result |
|------|---------|--------------|
| Normal | Standard alpha blending | Default rendering |
| Additive | src + dest | Glow, fire, light rays — never darkens |
| Multiply | src * dest | Shadows, tinting — never brightens |
| Screen | 1 - (1-src)(1-dest) | Soft brightening — like projecting two slides |
| Overlay | Multiply darks, Screen lights | High contrast — dramatic lighting |

### Custom Effects (Addon SDK)

Custom effects are GLSL (WebGL) or WGSL (WebGPU) shaders packaged as addons. A custom effect includes:

| File | Purpose |
|------|---------|
| `effect.fx` (WebGL) | GLSL fragment shader source |
| `effect.wgsl` (WebGPU) | WGSL shader source (Construct now supports both) |
| `addon.json` | Metadata, parameter definitions, blend mode info |

The shader receives the source texture and any parameters you define. Construct handles all the boilerplate — you just write the pixel-processing logic.

```glsl
// Example WebGL fragment shader — custom vignette
precision mediump float;
varying vec2 vTex;
uniform sampler2D samplerFront;
uniform float intensity;  // exposed parameter

void main() {
    vec4 color = texture2D(samplerFront, vTex);
    float dist = distance(vTex, vec2(0.5, 0.5));
    float vignette = smoothstep(0.7, 0.3, dist * intensity);
    gl_FragColor = vec4(color.rgb * vignette, color.a);
}
```

---

## Performance Considerations

| Concern | Guidance |
|---------|----------|
| Too many effects stacked | Each effect = extra GPU pass. Keep per-object effects to 1–2 |
| Effects on many instances | Apply effects to the **layer** instead — one pass for all objects on that layer |
| Blur effects | Gaussian blur is expensive at large radii. Lower the quality setting or use on layers |
| Physics behavior on many objects | Box2D slows with hundreds of active bodies. Use Solid + Platform for most objects; reserve Physics for objects that truly need rigid-body simulation |
| Pathfinding on large grids | Reduce cell size or limit recalculations. Use "Move To" for simple A-to-B movement |
| Tween count | Tweens are lightweight but not free. Clean up completed tweens and avoid thousands of concurrent tweens |

---

## Quick Decision Guide

| I want to... | Use |
|--------------|-----|
| Move a character with arrow keys | **8 Direction** or **Platform** behavior |
| Make a projectile fly forward | **Bullet** behavior |
| Make walls block movement | **Solid** behavior on wall objects |
| Smooth UI animation | **Tween** behavior with easing |
| Add glow to particles | **Additive** blend mode on the object or layer |
| Full-screen blur for pause menu | **Gaussian Blur** effect on a layer |
| Mask/reveal part of the screen | **Mask** effect or a layer with a stencil |
| Custom visual effect not in built-ins | Write a GLSL shader via the Addon SDK |
| Rigid body physics (crates, ragdolls) | **Physics** behavior |
| AI enemy navigation | **Pathfinding** behavior + **Solid** obstacles |
