# G11 — Phaser 3 Particle Effects & Visual FX

> **Category:** guide · **Engine:** Phaser · **Related:** [E1 Architecture Overview](../architecture/E1_architecture_overview.md) · [G4 Sprites & Animation](G4_sprites_and_animation.md) · [G1 Scene Lifecycle](G1_scene_lifecycle.md)

---

## Overview

Particle effects — explosions, fire trails, rain, sparks, smoke — transform a flat game into something that *feels* alive. Phaser's built-in particle system lets you emit thousands of lightweight sprites from a single Game Object, each following configurable rules for movement, scale, alpha, tint, and lifespan.

Since **v3.60**, Phaser removed the old `ParticleEmitterManager` wrapper. A `ParticleEmitter` is now a first-class Game Object — you add it to the display list directly, position it, scale it, put it in Containers, and apply blend modes like any other object.

This guide covers emitter creation, configuration properties, emit zones, death zones, gravity wells, common VFX recipes, and performance tips.

---

## Creating a Particle Emitter

The simplest emitter needs a position, a texture, and a config object:

```typescript
export class GameScene extends Phaser.Scene {
  create() {
    // Basic emitter — white particles flowing upward
    const emitter = this.add.particles(400, 300, 'flares', {
      frame: 'white',
      speed: 100,
      lifespan: 2000,
      alpha: { start: 1, end: 0 },
      scale: { start: 0.5, end: 0 },
      blendMode: 'ADD'
    });
  }
}
```

**Key points:**
- `this.add.particles(x, y, textureKey, config)` creates and adds the emitter in one call.
- The emitter is a `Phaser.GameObjects.Particles.ParticleEmitter` added directly to the scene's display list.
- Each particle is a lightweight object — not a full Game Object — so thousands are cheap.

---

## Configuration Properties

Every visual and behavioural aspect of particles is driven by the config object. Properties accept static values, `{ min, max }` ranges, `{ start, end }` tweens, or custom callbacks.

### Value Formats

```typescript
// Static value
{ speed: 200 }

// Random range — each particle picks a random value between min and max
{ speed: { min: 100, max: 300 } }

// Tween — interpolates from start to end over the particle's lifespan
{ alpha: { start: 1, end: 0 } }

// Stepped — cycles through discrete values
{ frame: { frames: ['red', 'orange', 'yellow'], cycle: true } }

// Custom callback — full control
{ speed: {
    onEmit: (particle, key, t, value) => Phaser.Math.Between(50, 200),
    onUpdate: (particle, key, t, value) => value - 1
  }
}
```

### Core Properties Reference

| Property | Type | What it controls |
|----------|------|-----------------|
| `speed` / `speedX` / `speedY` | EmitterOp | Initial velocity (px/s). `speed` sets both axes uniformly. |
| `angle` | EmitterOp | Emission angle in degrees. `{ min: -30, max: 30 }` for a spread. |
| `lifespan` | EmitterOp | How long each particle lives (ms). Default: 1000. |
| `frequency` | number | Ms between emissions. `0` = every frame. `-1` = explode mode. |
| `quantity` | EmitterOp | Particles emitted per cycle. |
| `alpha` | EmitterOp | Opacity (0–1). Use `{ start: 1, end: 0 }` for fade-out. |
| `scale` / `scaleX` / `scaleY` | EmitterOp | Size multiplier. Tween from 0.5 to 0 for shrink-to-nothing. |
| `rotate` | EmitterOp | Rotation in degrees over lifetime. |
| `tint` | EmitterOp | Colour tint applied to the texture. |
| `color` | number[] | Array of colour values to interpolate through. Overrides `tint`. |
| `accelerationX` / `accelerationY` | EmitterOp | Constant acceleration (gravity-like). |
| `bounce` | EmitterOp | Restitution when hitting emitter bounds (0–1). |
| `maxVelocityX` / `maxVelocityY` | EmitterOp | Speed cap per axis. |
| `delay` | EmitterOp | Ms before the particle becomes visible after emission. |
| `hold` | EmitterOp | Ms the particle stays at full visibility before fading. |
| `maxParticles` | number | Pool cap. `0` = unlimited. |

---

## Emitter Modes: Flow vs Explode

Phaser emitters operate in two modes:

### Flow Mode (default)

Particles emit continuously at a set `frequency`:

```typescript
const rain = this.add.particles(400, 0, 'raindrop', {
  speedY: { min: 200, max: 400 },
  lifespan: 4000,
  frequency: 20,       // Emit every 20ms
  quantity: 3,          // 3 particles per emission
  scaleX: 0.1,
  scaleY: { min: 0.4, max: 0.8 },
  alpha: { start: 0.6, end: 0 },
  emitZone: {
    type: 'random',
    source: new Phaser.Geom.Rectangle(-400, 0, 800, 1)
  }
});
```

### Explode Mode

All particles fire in a single burst. Set `frequency: -1` or call `explode()`:

```typescript
const explosion = this.add.particles(0, 0, 'spark', {
  speed: { min: 100, max: 400 },
  angle: { min: 0, max: 360 },
  lifespan: { min: 400, max: 800 },
  scale: { start: 0.6, end: 0 },
  alpha: { start: 1, end: 0 },
  blendMode: 'ADD',
  emitting: false          // Don't auto-start
});

// Fire 30 particles at enemy position on hit
explosion.explode(30, enemy.x, enemy.y);
```

**Tip:** Reuse the same emitter for repeated explosions — call `explode()` at different positions rather than creating new emitters.

---

## Emit Zones

Emit zones control *where* particles spawn. Without one, all particles spawn at the emitter's x/y.

### Random Zone

Particles spawn at random points inside a geometry:

```typescript
const emitter = this.add.particles(400, 300, 'star', {
  lifespan: 3000,
  speed: 50,
  emitZone: {
    type: 'random',
    source: new Phaser.Geom.Circle(0, 0, 120)   // Within 120px radius
  }
});
```

Any Phaser geometry works: `Circle`, `Ellipse`, `Rectangle`, `Triangle`, `Polygon`, or any object with a `getRandomPoint(point)` method.

### Edge Zone

Particles spawn along the perimeter of a shape and advance around it:

```typescript
const emitter = this.add.particles(400, 300, 'spark', {
  lifespan: 1000,
  speed: 0,
  scale: { start: 0.5, end: 0 },
  emitZone: {
    type: 'edge',
    source: new Phaser.Geom.Circle(0, 0, 150),
    quantity: 48,        // 48 evenly spaced emit points
    yoyo: false,
    seamless: true
  }
});
```

Edge zones are great for magic circles, shield effects, or trail outlines.

---

## Death Zones

Death zones destroy particles that enter (or leave) a region. Since v3.60, emitters support **multiple** death zones:

```typescript
const emitter = this.add.particles(400, 100, 'flame', {
  speed: { min: 80, max: 200 },
  angle: { min: 80, max: 100 },
  lifespan: 5000,
  deathZone: {
    type: 'onEnter',
    source: new Phaser.Geom.Rectangle(300, 400, 200, 50)
  }
});

// Add additional death zones after creation (v3.60+)
emitter.addDeathZone({
  type: 'onEnter',
  source: new Phaser.Geom.Circle(600, 300, 60)
});
```

**Zone types:**
- `'onEnter'` — kills particles that move *into* the zone (e.g., water surface absorbs sparks).
- `'onLeave'` — kills particles that move *out of* the zone (e.g., confine particles to an area).

---

## Gravity Wells

Gravity wells pull or push particles toward a point, simulating attraction or repulsion:

```typescript
const emitter = this.add.particles(400, 300, 'star', {
  speed: { min: 60, max: 150 },
  angle: { min: 0, max: 360 },
  lifespan: 4000,
  scale: { start: 0.4, end: 0 },
  blendMode: 'ADD'
});

// Pull particles toward (400, 300)
emitter.createGravityWell({
  x: 0,              // Relative to emitter position
  y: 0,
  power: 2,          // Strength — higher = stronger pull
  epsilon: 100,      // Minimum distance to prevent infinite force
  gravity: 150       // Gravitational constant
});
```

You can add multiple gravity wells to create orbital or chaotic patterns. Adjust `power` and `epsilon` to balance pull strength — low `epsilon` values cause aggressive snapping.

---

## Emitter Bounds

Constrain particles to a rectangular area with optional edge bouncing:

```typescript
const emitter = this.add.particles(400, 300, 'dust', {
  speed: { min: 30, max: 100 },
  angle: { min: 0, max: 360 },
  lifespan: 6000,
  bounce: 0.8,
  bounds: new Phaser.Geom.Rectangle(100, 100, 600, 400),
  collideBottom: true,
  collideLeft: true,
  collideRight: true,
  collideTop: true
});
```

Particles reverse velocity on the relevant axis when they hit an enabled boundary.

---

## Common VFX Recipes

### Fire / Torch

```typescript
const fire = this.add.particles(400, 500, 'flares', {
  frame: ['red', 'orange', 'yellow'],
  lifespan: 800,
  speed: { min: 20, max: 60 },
  angle: { min: 260, max: 280 },
  scale: { start: 0.6, end: 0 },
  alpha: { start: 1, end: 0 },
  blendMode: 'ADD',
  frequency: 30,
  quantity: 2,
  emitZone: {
    type: 'random',
    source: new Phaser.Geom.Rectangle(-10, 0, 20, 1)
  }
});
```

### Coin / Pickup Sparkle

```typescript
const sparkle = this.add.particles(0, 0, 'spark', {
  speed: { min: 40, max: 120 },
  angle: { min: 0, max: 360 },
  lifespan: 600,
  scale: { start: 0.4, end: 0 },
  alpha: { start: 1, end: 0 },
  tint: 0xffd700,
  blendMode: 'ADD',
  emitting: false
});

// On coin collect:
sparkle.explode(12, coin.x, coin.y);
```

### Smoke Trail (following a moving object)

```typescript
const smoke = this.add.particles(0, 0, 'smoke', {
  follow: rocket,                     // Track a Game Object
  followOffset: { x: 0, y: 20 },     // Offset from target origin
  lifespan: 1500,
  speed: { min: 10, max: 30 },
  angle: { min: 85, max: 95 },
  scale: { start: 0.3, end: 1.2 },
  alpha: { start: 0.5, end: 0 },
  frequency: 40,
  quantity: 1
});
```

---

## Particle Tinting and Colour Interpolation

For effects that shift colour over time, use the `color` array instead of `tint`:

```typescript
const magicOrb = this.add.particles(400, 300, 'flares', {
  frame: 'white',
  lifespan: 2000,
  speed: 80,
  color: [0x00ffff, 0x0066ff, 0xff00ff, 0xff0066],
  scale: { start: 0.5, end: 0 },
  blendMode: 'ADD'
});
```

The `color` array interpolates smoothly through each value across the particle's lifetime — ideal for fire (red → orange → yellow), magic (cyan → purple), or rainbow effects.

---

## Performance Tips

1. **Set `maxParticles`** — unbounded emitters can spawn thousands of particles. Cap them based on what's visible.
2. **Use atlases** — put particle textures in a shared sprite atlas to minimize draw calls.
3. **Reuse emitters** — call `explode()` or `emitParticleAt()` on existing emitters instead of creating new ones.
4. **Additive blending** — `blendMode: 'ADD'` looks great for glowing effects and is generally GPU-friendly.
5. **Limit frequency** — `frequency: 50` (every 50ms) instead of `0` (every frame) cuts particle count significantly with little visual difference.
6. **Prefer `scale` over large textures** — a small 16×16 particle scaled up is cheaper than a 128×128 texture.
7. **Camera culling** — particles outside the camera viewport are still updated. For large worlds, stop or pause off-screen emitters manually:

```typescript
update() {
  const cam = this.cameras.main;
  const inView = Phaser.Geom.Rectangle.Overlaps(
    cam.worldView,
    emitter.getBounds()
  );
  emitter.emitting = inView;
}
```

---

## Blend Modes

Blend modes control how particle pixels combine with whatever is behind them:

| Mode | Constant | Best for |
|------|----------|----------|
| Normal | `'NORMAL'` | Opaque particles (dust, debris) |
| Add | `'ADD'` | Glowing effects (fire, sparks, magic) |
| Multiply | `'MULTIPLY'` | Dark overlays (shadows, smoke stains) |
| Screen | `'SCREEN'` | Subtle light effects |

Additive blending (`'ADD'`) is the workhorse for VFX — overlapping particles glow brighter instead of stacking opaque layers.

---

## Controlling Emitters at Runtime

```typescript
// Pause / resume
emitter.emitting = false;       // Stop spawning (existing particles continue)
emitter.emitting = true;

// Kill all active particles immediately
emitter.killAll();

// One-shot burst at a position
emitter.emitParticleAt(worldX, worldY, count);

// Change config property dynamically
emitter.setSpeed(200, 400);     // new min/max speed
emitter.setAlpha(0.5, 0);       // new start/end alpha
emitter.setLifespan(500);

// Follow a different target
emitter.startFollow(newTarget, offsetX, offsetY);
emitter.stopFollow();

// Remove from scene
emitter.destroy();
```

---

## Framework Comparison

| Concept | Phaser | PixiJS | Kaplay | Excalibur |
|---------|--------|--------|--------|-----------|
| Built-in particles | Yes — `ParticleEmitter` Game Object | No built-in (use `@pixi/particle-emitter` plugin) | Yes — `addKaboom()`, custom via `lifespan` + `wait` | Yes — `ParticleEmitter` class |
| Emit zones | Geometry-based (Circle, Rect, etc.) | Plugin-dependent | Manual positioning | Shape-based emission |
| Gravity wells | Built-in `createGravityWell()` | Plugin-dependent | Manual with `onUpdate` | Manual via acceleration |
| Death zones | Built-in (enter/leave) | N/A (manual bounds) | Manual with area checks | Manual via kill conditions |
| Blend modes | Game Object blend modes | Container blend modes | Limited (canvas-based) | Built-in blend modes |

---

## Next Steps

- [G4 Sprites & Animation](G4_sprites_and_animation.md) — texture atlases used by particle frames
- [G1 Scene Lifecycle](G1_scene_lifecycle.md) — managing emitters across scene transitions
- [G10 Camera Systems](G10_camera_systems.md) — particle layers and camera ignore lists
- [R1 API Cheatsheet](../reference/R1_api_cheatsheet.md) — quick property lookup
