# G13 — PixiJS v8 Particles & Visual Effects

> **Category:** guide · **Engine:** PixiJS · **Related:** [E1 Architecture Overview](../architecture/E1_architecture_overview.md) · [G2 Sprites & Animation](G2_sprites_animation.md) · [G10 Performance Optimization](G10_performance_optimization.md)

---

## Overview

Particle effects — sparks, smoke, explosions, rain, fire trails — transform a static game into something that *feels* alive. PixiJS v8 offers two complementary approaches to particles: the built-in **ParticleContainer** for raw rendering speed, and the community **particle-emitter** library for behavior-driven particle systems with full lifecycle management.

This guide covers both approaches: when to use each, how to configure them, common VFX recipes, and performance considerations. PixiJS's rendering-engine nature means particles are just another layer in your scene graph — you integrate them with your game loop however you choose.

---

## Approach 1: Built-in ParticleContainer (Raw Speed)

PixiJS v8's `ParticleContainer` is a specialized container designed for rendering massive numbers of lightweight `Particle` objects. It can push **100K–1M particles at 60fps** by stripping away features like children, filters, and masks that normal Containers support.

### Key Concepts

- **Particle** replaces Sprite inside ParticleContainers — lighter weight, fewer features
- Particles are stored in a flat `particleChildren` list (no nested hierarchy)
- **Static vs. dynamic properties** control per-frame GPU updates — fewer dynamic props = faster rendering
- All particle textures should share the same `TextureSource` (use a spritesheet or atlas)

### Creating a ParticleContainer

```typescript
import { Application, Assets, ParticleContainer, Particle } from 'pixi.js';

const app = new Application();
await app.init({ background: '#0a0a1a', resizeTo: window });
document.body.appendChild(app.canvas);

// Load a spritesheet with all particle textures on one atlas
await Assets.load('assets/particles.json');

// Create container — specify which properties are dynamic (updated each frame)
const particleContainer = new ParticleContainer({
  dynamicProperties: {
    position: true,   // particles will move
    scale: false,      // scale stays constant after creation
    rotation: true,    // particles spin
    color: false,      // tint stays constant
  },
});

app.stage.addChild(particleContainer);
```

### Adding and Removing Particles

```typescript
// Create a particle from a texture
const spark = new Particle({
  texture: Assets.get('particles.json').textures['spark.png'],
  x: 400,
  y: 300,
  scaleX: 0.5,
  scaleY: 0.5,
  rotation: Math.random() * Math.PI * 2,
  alpha: 1,
  tint: 0xff6644,
});

// Add to container
particleContainer.addParticle(spark);

// Remove when done
particleContainer.removeParticle(spark);

// For maximum speed, manipulate the flat array directly:
// particleContainer.particleChildren.push(spark);
// (then manage removal yourself)
```

### Game Loop Integration

PixiJS doesn't manage particle lifetimes — you do. A common pattern stores metadata alongside particles:

```typescript
interface LiveParticle {
  particle: Particle;
  vx: number;
  vy: number;
  life: number;     // seconds remaining
  maxLife: number;
}

const liveParticles: LiveParticle[] = [];

function spawnSpark(x: number, y: number): void {
  const angle = Math.random() * Math.PI * 2;
  const speed = 50 + Math.random() * 150;
  const life = 0.5 + Math.random() * 1.0;

  const particle = new Particle({
    texture: Assets.get('particles.json').textures['spark.png'],
    x,
    y,
    scaleX: 0.3 + Math.random() * 0.4,
    scaleY: 0.3 + Math.random() * 0.4,
    tint: 0xffaa33,
  });

  particleContainer.addParticle(particle);
  liveParticles.push({
    particle,
    vx: Math.cos(angle) * speed,
    vy: Math.sin(angle) * speed,
    life,
    maxLife: life,
  });
}

// In your game loop (via app.ticker or your own loop)
app.ticker.add((ticker) => {
  const dt = ticker.deltaTime / 60; // seconds

  for (let i = liveParticles.length - 1; i >= 0; i--) {
    const p = liveParticles[i];
    p.life -= dt;

    if (p.life <= 0) {
      // Remove dead particle
      particleContainer.removeParticle(p.particle);
      liveParticles.splice(i, 1);
      continue;
    }

    // Update position
    p.particle.x += p.vx * dt;
    p.particle.y += p.vy * dt;

    // Fade out over lifetime
    p.particle.alpha = p.life / p.maxLife;

    // Apply gravity
    p.vy += 200 * dt;
  }
});
```

### Static vs. Dynamic Properties (Performance Tuning)

Every dynamic property costs GPU bandwidth each frame. Only mark properties as dynamic if they actually change:

| Scenario | position | scale | rotation | color |
|---|---|---|---|---|
| Moving sparks | ✅ dynamic | ❌ static | ❌ static | ❌ static |
| Spinning debris | ✅ dynamic | ❌ static | ✅ dynamic | ❌ static |
| Fading smoke | ✅ dynamic | ✅ dynamic | ❌ static | ✅ dynamic |
| Static starfield | ❌ static | ❌ static | ❌ static | ❌ static |

```typescript
// Starfield — nothing changes after creation, maximum speed
const stars = new ParticleContainer({
  dynamicProperties: {
    position: false,
    scale: false,
    rotation: false,
    color: false,
  },
});
```

---

## Approach 2: @pixi/particle-emitter (Behavior-Driven)

The `@pixi/particle-emitter` library (community-maintained, originally official) provides a full particle lifecycle system: spawn rates, behaviors (alpha, scale, color, speed, acceleration), emit shapes, and automatic cleanup.

> **PixiJS v8 note:** The original `@pixi/particle-emitter` targets PixiJS v7. For v8, use the community fork [`@spd789562/particle-emitter`](https://github.com/spd789562/pixi-v8-particle-emitter) which rebuilds on v8's ParticleContainer for high performance. The config format (`EmitterConfigV3`) is identical.

### Installation

```bash
# For PixiJS v8
npm install @spd789562/particle-emitter

# For PixiJS v7 (original)
npm install @pixi/particle-emitter
```

### Basic Emitter Setup

```typescript
import { Application, Assets, Container } from 'pixi.js';
import { Emitter, upgradeConfig } from '@spd789562/particle-emitter';

const app = new Application();
await app.init({ background: '#0a0a1a', resizeTo: window });
document.body.appendChild(app.canvas);

await Assets.load('assets/particle.png');

const emitterContainer = new Container();
app.stage.addChild(emitterContainer);

// EmitterConfigV3 — behavior-based configuration
const emitter = new Emitter(emitterContainer, {
  lifetime: { min: 0.5, max: 1.5 },
  frequency: 0.01,        // seconds between spawns
  maxParticles: 500,
  pos: { x: 400, y: 300 },
  behaviors: [
    {
      type: 'alpha',
      config: {
        alpha: {
          list: [
            { value: 0.8, time: 0 },
            { value: 0.1, time: 1 },
          ],
        },
      },
    },
    {
      type: 'scale',
      config: {
        scale: {
          list: [
            { value: 1, time: 0 },
            { value: 0.3, time: 1 },
          ],
        },
        minMult: 0.5,
      },
    },
    {
      type: 'color',
      config: {
        color: {
          list: [
            { value: 'ff6622', time: 0 },
            { value: 'ff2200', time: 1 },
          ],
        },
      },
    },
    {
      type: 'moveSpeed',
      config: {
        speed: {
          list: [
            { value: 200, time: 0 },
            { value: 50, time: 1 },
          ],
        },
      },
    },
    {
      type: 'rotationStatic',
      config: { min: 0, max: 360 },
    },
    {
      type: 'spawnShape',
      config: {
        type: 'torus',
        data: { x: 0, y: 0, radius: 10 },
      },
    },
    {
      type: 'textureSingle',
      config: { texture: 'assets/particle.png' },
    },
  ],
});

// Drive the emitter from the game loop
let elapsed = Date.now();
app.ticker.add(() => {
  const now = Date.now();
  emitter.update((now - elapsed) / 1000);
  elapsed = now;
});
```

### Built-in Behavior Types

| Behavior | Purpose | Key Config |
|---|---|---|
| `alpha` | Fade over lifetime | `alpha.list` (value/time pairs) |
| `scale` | Grow/shrink over lifetime | `scale.list`, `minMult` |
| `color` | Color shift over lifetime | `color.list` (hex values) |
| `moveSpeed` | Speed over lifetime | `speed.list` |
| `moveAcceleration` | Constant acceleration (gravity) | `accel: {x, y}`, `minStart`, `maxStart` |
| `rotation` | Spin over lifetime | `accel`, `minStart`, `maxStart` |
| `rotationStatic` | Random fixed rotation | `min`, `max` |
| `spawnShape` | Emission area shape | `type`: `'torus'`, `'rect'`, `'point'` |
| `textureSingle` | Single texture | `texture` (asset key) |
| `textureRandom` | Random from list | `textures` (array of keys) |

### Controlling Emitters at Runtime

```typescript
// Start and stop emission
emitter.emit = true;   // enable spawning
emitter.emit = false;  // stop spawning (existing particles finish)

// Burst a fixed number of particles at once
emitter.emit = false;
emitter.particlesPerWave = 20;
emitter.emit = true;
// Then set emit = false on next frame for a one-shot burst

// Reposition the emitter (e.g., following a character)
emitter.updateOwnerPos(player.x, player.y);

// Clean up when done
emitter.destroy();
```

---

## Common VFX Recipes

### Explosion Burst (ParticleContainer)

```typescript
function spawnExplosion(x: number, y: number, count: number = 30): void {
  for (let i = 0; i < count; i++) {
    const angle = (i / count) * Math.PI * 2 + (Math.random() - 0.5) * 0.5;
    const speed = 100 + Math.random() * 300;
    const life = 0.3 + Math.random() * 0.5;
    const size = 0.2 + Math.random() * 0.6;

    const particle = new Particle({
      texture: Assets.get('particles.json').textures['circle.png'],
      x,
      y,
      scaleX: size,
      scaleY: size,
      tint: Math.random() > 0.5 ? 0xff6622 : 0xffcc00,
    });

    particleContainer.addParticle(particle);
    liveParticles.push({
      particle,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      life,
      maxLife: life,
    });
  }
}
```

### Rain (ParticleContainer)

```typescript
function spawnRaindrop(): void {
  const particle = new Particle({
    texture: Assets.get('particles.json').textures['raindrop.png'],
    x: Math.random() * app.screen.width,
    y: -10,
    scaleX: 0.3,
    scaleY: 0.8,
    alpha: 0.4 + Math.random() * 0.3,
    tint: 0x88bbff,
  });

  particleContainer.addParticle(particle);
  liveParticles.push({
    particle,
    vx: -20,          // slight wind
    vy: 400 + Math.random() * 200,
    life: 3,
    maxLife: 3,
  });
}

// Spawn several per frame for heavy rain
app.ticker.add(() => {
  for (let i = 0; i < 5; i++) spawnRaindrop();
});
```

### Smoke Trail (particle-emitter)

```typescript
const smokeConfig = {
  lifetime: { min: 1.0, max: 2.0 },
  frequency: 0.03,
  maxParticles: 200,
  pos: { x: 0, y: 0 },
  behaviors: [
    {
      type: 'alpha',
      config: { alpha: { list: [
        { value: 0.6, time: 0 },
        { value: 0, time: 1 },
      ]}},
    },
    {
      type: 'scale',
      config: { scale: { list: [
        { value: 0.3, time: 0 },
        { value: 1.2, time: 1 },
      ]}, minMult: 0.5 },
    },
    {
      type: 'color',
      config: { color: { list: [
        { value: 'aaaaaa', time: 0 },
        { value: '555555', time: 1 },
      ]}},
    },
    {
      type: 'moveSpeed',
      config: { speed: { list: [
        { value: 40, time: 0 },
        { value: 10, time: 1 },
      ]}},
    },
    {
      type: 'moveAcceleration',
      config: {
        accel: { x: 0, y: -30 }, // drift upward
        minStart: 30,
        maxStart: 60,
      },
    },
    {
      type: 'spawnShape',
      config: { type: 'torus', data: { x: 0, y: 0, radius: 5 } },
    },
    {
      type: 'textureSingle',
      config: { texture: 'assets/smoke.png' },
    },
  ],
};

const smokeEmitter = new Emitter(emitterContainer, smokeConfig);

// Attach to a moving object each frame:
// smokeEmitter.updateOwnerPos(rocket.x, rocket.y);
```

---

## Choosing Between Approaches

| Factor | ParticleContainer | particle-emitter library |
|---|---|---|
| **Particle count** | 100K–1M | Hundreds to low thousands |
| **Setup complexity** | Manual (you write the game loop logic) | Declarative (config-driven) |
| **Lifetime/alpha/scale** | DIY in update loop | Built-in behaviors |
| **Emit shapes** | DIY spawn logic | Built-in (torus, rect, point) |
| **Texture requirement** | Same TextureSource (atlas) | Any loaded texture |
| **Best for** | Starfields, rain, massive counts | Explosions, trails, polished VFX |

**Practical guidance:** Use ParticleContainer when you need raw throughput (weather, bullet-hell patterns, background ambience) and the emitter library when you need rich, designer-friendly VFX with minimal code (explosions, powerup pickups, character abilities).

---

## Performance Tips

1. **Atlas your particle textures.** ParticleContainer requires all textures on the same TextureSource. Even with the emitter library, atlased textures reduce draw calls.

2. **Minimize dynamic properties.** Every dynamic property on ParticleContainer adds per-particle GPU upload cost. Set `position: true` only if particles move, `color: true` only if they fade/tint, etc.

3. **Object-pool particles.** Instead of creating/destroying Particle objects each frame, reuse them:

```typescript
const particlePool: Particle[] = [];

function getParticle(texture: Texture): Particle {
  if (particlePool.length > 0) {
    const p = particlePool.pop()!;
    p.texture = texture;
    p.alpha = 1;
    return p;
  }
  return new Particle({ texture });
}

function recycleParticle(p: Particle): void {
  particleContainer.removeParticle(p);
  particlePool.push(p);
}
```

4. **Cap particle counts.** Always set `maxParticles` on emitters and check `liveParticles.length` before spawning in manual systems. Uncapped spawning at high framerates will tank performance.

5. **Use `additive` blend mode** for fire/spark/glow effects — it's cheap and looks great:

```typescript
import { BLEND_MODES } from 'pixi.js';

// Set blend mode on the ParticleContainer
particleContainer.blendMode = 'add';
```

6. **Cull off-screen particles.** Skip update logic and remove particles that leave the visible area.

---

## Framework Comparison: Particles

| Feature | PixiJS (v8) | Phaser 3 | Kaplay | Excalibur |
|---|---|---|---|---|
| Built-in emitter | No (ParticleContainer only) | Yes (ParticleEmitter) | Yes (`particles()` component) | Yes (`ParticleEmitter`) |
| Max particle count | 1M+ at 60fps | Thousands | Hundreds | Thousands |
| Config format | Manual / EmitterConfigV3 | Object config | Component config | `EmitterConfig` |
| Emit shapes | DIY / library | Zones (circle, rect, edge) | DIY | Built-in shapes |
| Behavior system | Library (alpha, scale, color, speed) | Easing properties | Component-based | Built-in properties |

---

## Summary

PixiJS v8 gives you two particle paths: the built-in ParticleContainer for extreme throughput with manual lifecycle management, and the community particle-emitter library for behavior-driven VFX with declarative configs. Most games use both — ParticleContainer for weather and ambient effects, the emitter library for gameplay VFX like explosions and trails. Atlas your textures, pool your objects, and cap your counts to keep frame rates smooth.
