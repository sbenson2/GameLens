# PlayCanvas Particle & VFX Systems for Games

> **Category:** reference · **Engine:** PlayCanvas v2+ · **Related:** [Architecture Overview](../architecture/E1_architecture_overview.md), [Custom Shaders](../guides/G12_custom_shaders.md), [Optimization](../guides/G7_optimization_performance.md)

PlayCanvas provides a GPU-accelerated particle system through the `ParticleSystemComponent`. Particles are simulated on the GPU, making the system efficient for fire, smoke, explosions, weather, and ambient effects. This reference covers component setup, curve-based animation, runtime scripting, common game VFX recipes, and performance budgets.

---

## ParticleSystemComponent Overview

The particle system is an ECS component attached to an `Entity`. Particles are emitted from a shape (box or sphere), animated over their lifetime via curves, and rendered as camera-facing billboards or mesh instances.

```typescript
import { Application, Entity, EMITTERSHAPE_SPHERE, BLEND_ADDITIVE } from "playcanvas";

const app: Application = /* your app instance */;

// Create a particle effect entity
const fireEntity = new Entity("campfire");
fireEntity.addComponent("particlesystem", {
  // Emission
  numParticles: 200,
  rate: 30,               // particles per second
  rate2: 40,              // random range: emit 30–40/sec
  lifetime: 1.5,          // seconds each particle lives

  // Emitter shape
  emitterShape: EMITTERSHAPE_SPHERE,
  emitterRadius: 0.3,

  // Velocity
  velocityGraph: { keys: [[0, 0], [1, 0]] },       // X velocity over lifetime
  velocityGraph2: { keys: [[0, 0], [1, 0]] },       // X velocity range max
  localVelocityGraph: { keys: [[0, 0], [1, 0]] },   // local X
  localVelocityGraph2: { keys: [[0, 2], [1, 0.5]] }, // local Y: upward, slowing

  // Appearance
  colorGraph: {
    type: 4,  // CurveSet (RGBA)
    keys: [
      [0, 1, 0.3, 1, 0.8, 0.2, 1, 0],    // R: bright → dim
      [0, 0.6, 0.3, 0.3, 0.8, 0.1, 1, 0], // G
      [0, 0.1, 1, 0],                       // B: minimal
    ],
  },
  alphaGraph: { keys: [[0, 0], [0.1, 1], [0.8, 1], [1, 0]] }, // fade in/out
  scaleGraph: { keys: [[0, 0.2], [0.5, 0.8], [1, 1.2]] },     // grow over life

  // Rendering
  blend: BLEND_ADDITIVE,
  depthWrite: false,
  lighting: false,
  halfLambert: false,
  intensity: 2.0,
});

app.root.addChild(fireEntity);
fireEntity.setPosition(0, 0, 0);
```

---

## Core Properties Reference

### Emission

| Property | Type | Description |
|----------|------|-------------|
| `numParticles` | number | Max particles alive at once (pool size) |
| `rate` | number | Emission rate (particles/sec) — min |
| `rate2` | number | Emission rate max (random between `rate` and `rate2`) |
| `lifetime` | number | Seconds each particle lives |
| `startAngle` / `startAngle2` | number | Initial rotation range (degrees) |
| `autoPlay` | boolean | Start emitting on creation (default `true`) |
| `loop` | boolean | Restart after all particles die (default `true`) |
| `preWarm` | boolean | Simulate one full cycle on spawn so particles appear immediately |

### Emitter Shape

| Property | Type | Description |
|----------|------|-------------|
| `emitterShape` | enum | `EMITTERSHAPE_BOX` (default) or `EMITTERSHAPE_SPHERE` |
| `emitterExtents` | Vec3 | Half-extents for box emitter (x, y, z) |
| `emitterRadius` | number | Radius for sphere emitter |
| `emitterExtentsInner` | Vec3 | Inner extents — spawn between inner and outer for hollow shapes |
| `emitterRadiusInner` | number | Inner radius for hollow sphere |

### Velocity

| Property | Type | Description |
|----------|------|-------------|
| `velocityGraph` | Curve | World-space velocity (X) over particle lifetime |
| `velocityGraph2` | Curve | Velocity max — actual is random between graph and graph2 |
| `localVelocityGraph` | Curve | Local-space velocity over lifetime |
| `localVelocityGraph2` | Curve | Local velocity max |
| `radialSpeedGraph` | Curve | Speed away from emitter center over lifetime |

### Appearance

| Property | Type | Description |
|----------|------|-------------|
| `colorGraph` | CurveSet | RGBA color over lifetime (CurveSet with 3–4 curves) |
| `alphaGraph` / `alphaGraph2` | Curve | Opacity over lifetime (random range if both set) |
| `scaleGraph` / `scaleGraph2` | Curve | Size multiplier over lifetime |
| `rotationSpeedGraph` | Curve | Angular velocity (degrees/sec) over lifetime |
| `colorMap` | Texture | Particle texture atlas |
| `normalMap` | Texture | Normal map for lit particles |
| `animTilesX` / `animTilesY` | number | Sprite sheet tile count (for animated textures) |
| `animNumFrames` | number | Total frames in the sprite sheet |
| `animSpeed` | number | Playback speed multiplier |

### Rendering

| Property | Type | Description |
|----------|------|-------------|
| `blend` | enum | `BLEND_ADDITIVE`, `BLEND_NORMAL`, `BLEND_PREMULTIPLIED` |
| `depthWrite` | boolean | Write to depth buffer (usually `false` for particles) |
| `depthSoftening` | number | Soft particles — fade near intersecting geometry (0 = off) |
| `lighting` | boolean | Apply scene lighting to particles |
| `halfLambert` | boolean | Softer lighting model (less harsh shadows on particles) |
| `intensity` | number | Color multiplier for HDR bloom pipelines |
| `sort` | number | Render order sorting: 0 = none, 1 = camera distance, 2 = newest first, 3 = oldest first |
| `alignToMotion` | boolean | Stretch particles along their velocity vector |
| `stretch` | number | Stretch factor when `alignToMotion` is true |

---

## Curve System (Animation Over Lifetime)

Most visual properties animate over a particle's normalized lifetime (0 = birth, 1 = death) using curves. Curves are specified as `{ keys: [[time, value], ...] }` with linear interpolation between keys.

```typescript
// Particle grows from 0.1 to 1.0 then shrinks to 0.3
const scaleGraph = {
  keys: [
    [0, 0.1],     // birth: tiny
    [0.3, 1.0],   // peak size at 30% lifetime
    [1, 0.3],     // shrink at death
  ],
};

// Random range: actual scale is random between scaleGraph and scaleGraph2
const scaleGraph2 = {
  keys: [
    [0, 0.15],
    [0.3, 1.2],
    [1, 0.5],
  ],
};
```

**Color curves** use a `CurveSet` with 3 curves (RGB) where each sub-curve has interleaved `[time, value]` keys:

```typescript
const colorGraph = {
  type: 4, // CurveSet type
  keys: [
    // R channel: [t0, v0, t1, v1, ...]
    [0, 1.0, 0.5, 0.9, 1.0, 0.2],
    // G channel
    [0, 0.8, 0.5, 0.3, 1.0, 0.1],
    // B channel
    [0, 0.2, 0.5, 0.1, 1.0, 0.0],
  ],
};
```

---

## Runtime Control via Scripts

Control particle systems dynamically from gameplay scripts.

```typescript
import { Script, ParticleSystemComponent } from "playcanvas";

class ExplosionController extends Script {
  static scriptName = "explosionController";

  private particles!: ParticleSystemComponent;

  initialize() {
    this.particles = this.entity.particlesystem!;
    this.particles.autoPlay = false;
    this.particles.loop = false;
  }

  // Call from gameplay code to trigger the explosion
  trigger() {
    this.particles.reset();
    this.particles.play();
  }

  // Modify properties at runtime
  setIntensity(intensity: number) {
    this.particles.rate = 50 * intensity;
    this.particles.rate2 = 80 * intensity;
    this.particles.intensity = 1.0 + intensity * 2.0;
    this.particles.rebuild(); // apply changes to GPU buffers
  }
}
```

**Key runtime methods:**

| Method | Description |
|--------|-------------|
| `play()` | Start or resume emission |
| `pause()` | Pause emission (existing particles keep animating) |
| `stop()` | Stop emission (existing particles finish their lifetime) |
| `reset()` | Kill all particles and restart from time 0 |
| `rebuild()` | Re-upload particle system config to GPU after property changes |

> **Important:** After changing properties like `numParticles`, `rate`, curve graphs, or texture at runtime, you must call `rebuild()` for the changes to take effect. Simple numeric properties like `intensity` update immediately.

---

## Game VFX Recipes

### Campfire (Looping Ambient)

```typescript
entity.addComponent("particlesystem", {
  numParticles: 150,
  rate: 25,
  lifetime: 2.0,
  emitterShape: EMITTERSHAPE_SPHERE,
  emitterRadius: 0.15,
  localVelocityGraph: { keys: [[0, 0], [1, 0]] },
  localVelocityGraph2: { keys: [[0, 1.5], [1, 0.3]] }, // upward drift
  scaleGraph: { keys: [[0, 0.15], [0.3, 0.4], [1, 0.6]] },
  alphaGraph: { keys: [[0, 0], [0.1, 0.9], [0.7, 0.6], [1, 0]] },
  colorGraph: {
    type: 4,
    keys: [
      [0, 1, 0.4, 1, 1, 0.3],    // R
      [0, 0.7, 0.4, 0.2, 1, 0],   // G
      [0, 0.1, 1, 0],              // B
    ],
  },
  blend: BLEND_ADDITIVE,
  depthWrite: false,
  lighting: false,
  intensity: 3.0,
  sort: 0,
});
```

### Explosion (One-Shot Burst)

```typescript
entity.addComponent("particlesystem", {
  numParticles: 100,
  rate: 0,        // no continuous emission
  rate2: 0,
  lifetime: 0.8,
  loop: false,
  autoPlay: false,
  emitterShape: EMITTERSHAPE_SPHERE,
  emitterRadius: 0.1,
  // Burst: emit all at once using a script that calls reset()+play()
  // with rate temporarily set high, or use initialVelocity approach
  radialSpeedGraph: { keys: [[0, 8], [1, 0.5]] },  // explode outward, decelerate
  scaleGraph: { keys: [[0, 0.3], [0.2, 1.0], [1, 0.1]] },
  alphaGraph: { keys: [[0, 1], [0.5, 0.8], [1, 0]] },
  colorGraph: {
    type: 4,
    keys: [
      [0, 1, 0.3, 1, 1, 0.5],
      [0, 0.8, 0.3, 0.3, 1, 0.1],
      [0, 0.2, 1, 0],
    ],
  },
  blend: BLEND_ADDITIVE,
  depthWrite: false,
  intensity: 5.0,
  alignToMotion: true,
  stretch: 2.0,
});

// Trigger: temporarily crank up rate, then immediately stop
function triggerExplosion(entity: Entity) {
  const ps = entity.particlesystem!;
  ps.rate = 500;
  ps.rate2 = 500;
  ps.rebuild();
  ps.reset();
  ps.play();
  // After one frame, stop emitting — the burst is done
  setTimeout(() => {
    ps.rate = 0;
    ps.rate2 = 0;
    ps.rebuild();
  }, 50);
}
```

### Rain (Weather System)

```typescript
import { EMITTERSHAPE_BOX, BLEND_NORMAL, Vec3 } from "playcanvas";

entity.addComponent("particlesystem", {
  numParticles: 2000,
  rate: 400,
  lifetime: 1.5,
  emitterShape: EMITTERSHAPE_BOX,
  emitterExtents: new Vec3(30, 0.1, 30), // wide, flat emitter above camera
  localVelocityGraph: { keys: [[0, -15], [1, -15]] },  // straight down, fast
  scaleGraph: { keys: [[0, 0.02], [1, 0.02]] },        // thin streaks
  alphaGraph: { keys: [[0, 0.3], [0.5, 0.5], [1, 0]] },
  colorGraph: {
    type: 4,
    keys: [
      [0, 0.7, 1, 0.7],
      [0, 0.8, 1, 0.8],
      [0, 0.9, 1, 0.9],
    ],
  },
  blend: BLEND_NORMAL,
  depthWrite: false,
  alignToMotion: true,
  stretch: 5.0,  // elongate to look like streaks
  sort: 0,       // skip sorting for performance
});
```

---

## Sprite Sheet Animation

Animate particle textures through a sprite sheet atlas (fire sprites, smoke puffs, explosions).

```typescript
entity.addComponent("particlesystem", {
  // ... other properties ...
  colorMap: smokeAtlasTexture,  // 4x4 sprite sheet
  animTilesX: 4,
  animTilesY: 4,
  animNumFrames: 16,
  animSpeed: 1.0,              // 1.0 = one full cycle per particle lifetime
  animLoop: true,
});
```

**Tips:**
- Use power-of-two atlas sizes (256x256, 512x512) for best GPU compatibility.
- `animSpeed` of 1.0 means the animation completes exactly once during the particle's lifetime. Values > 1.0 loop faster.
- Combine animated textures with `alphaGraph` for fade-out at end of life — prevents abrupt disappearance.

---

## Soft Particles (Depth Softening)

Eliminate hard edges where particles intersect scene geometry.

```typescript
entity.addComponent("particlesystem", {
  // ... other properties ...
  depthSoftening: 0.5,  // fade over 0.5 units near geometry
  depthWrite: false,
});
```

**Requirement:** The scene must render a depth buffer. Soft particles compare particle fragment depth against the scene depth texture to compute the fade factor.

---

## Object Pooling for Particle Entities

For frequently spawned effects (projectile impacts, footsteps), pool the entities rather than creating/destroying them.

```typescript
class ParticlePool {
  private pool: Entity[] = [];
  private index = 0;

  constructor(
    app: Application,
    template: Record<string, unknown>,
    size: number
  ) {
    for (let i = 0; i < size; i++) {
      const entity = new Entity(`vfx_${i}`);
      entity.addComponent("particlesystem", {
        ...template,
        autoPlay: false,
        loop: false,
      });
      entity.enabled = false;
      app.root.addChild(entity);
      this.pool.push(entity);
    }
  }

  spawn(position: { x: number; y: number; z: number }) {
    const entity = this.pool[this.index];
    this.index = (this.index + 1) % this.pool.length;

    entity.setPosition(position.x, position.y, position.z);
    entity.enabled = true;
    entity.particlesystem!.reset();
    entity.particlesystem!.play();

    // Auto-disable after lifetime
    const lifetime = entity.particlesystem!.lifetime;
    setTimeout(() => {
      entity.enabled = false;
    }, lifetime * 1000 + 100); // small buffer
  }
}

// Usage
const impactPool = new ParticlePool(app, {
  numParticles: 30,
  rate: 0,
  lifetime: 0.5,
  emitterShape: EMITTERSHAPE_SPHERE,
  emitterRadius: 0.1,
  radialSpeedGraph: { keys: [[0, 5], [1, 0]] },
  scaleGraph: { keys: [[0, 0.1], [1, 0.01]] },
  alphaGraph: { keys: [[0, 1], [1, 0]] },
  blend: BLEND_ADDITIVE,
  depthWrite: false,
}, 10);

impactPool.spawn({ x: 5, y: 0, z: 3 });
```

---

## Performance Budget

| Metric | Budget (Desktop) | Budget (Mobile) | Notes |
|--------|-------------------|-----------------|-------|
| Max particles on screen | 10,000–50,000 | 2,000–5,000 | GPU-simulated, so CPU cost is low |
| Active particle systems | 20–50 | 5–15 | Each system = 1+ draw call |
| Texture atlas size | 1024x1024 | 512x512 | Shared across particle types when possible |
| `depthSoftening` | Use freely | Use sparingly | Requires depth texture read per fragment |
| `sort` mode | Use mode 1 (camera) for translucent | Use mode 0 (none) | Sorting has CPU cost; additive blending often looks fine unsorted |
| `alignToMotion` | Minimal cost | Minimal cost | Computed on GPU |

**Optimization tips:**
- Set `sort: 0` for additive-blended effects — sorting is unnecessary when blending is commutative.
- Use `depthWrite: false` for nearly all particle effects to avoid z-fighting.
- Limit `numParticles` to the minimum needed — excess particles waste GPU memory even when not alive.
- Disable `lighting` unless particles must respond to scene lights (adds shader complexity).
- Use `preWarm: true` for ambient effects (fire, fog) so they appear fully formed on level load rather than ramping up.

---

## WebGPU Notes

PlayCanvas v2's particle system works on both WebGL2 and WebGPU backends:

- GPU simulation runs via the compute path on WebGPU (where available) and falls back to transform feedback on WebGL2.
- Soft particles (`depthSoftening`) work identically on both backends.
- Sprite sheet animation is handled in the fragment shader — no backend differences.
- Performance characteristics are similar; WebGPU may show modest improvements for very high particle counts due to more efficient GPU dispatch.
