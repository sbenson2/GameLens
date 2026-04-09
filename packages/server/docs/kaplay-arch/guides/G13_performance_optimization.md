# G13 — Kaplay Performance Optimization

> **Category:** guide · **Engine:** Kaplay · **Related:** [E1 Architecture Overview](../architecture/E1_architecture_overview.md) · [G1 Components & Game Objects](G1_components_and_game_objects.md) · [G4 Physics & Collisions](G4_physics_and_collisions.md) · [G11 Camera Systems](G11_camera_systems.md)

---

## Overview

Kaplay is beginner-friendly, but beginner-friendly doesn't mean performance-free. As your game grows — more objects, bigger maps, heavier effects — you'll hit frame-rate walls if you don't understand where Kaplay spends its time. The main bottlenecks are **object overhead** (every game object has a cost), **draw-call batching** (broken batches kill GPU throughput), **collision detection** (the wrong algorithm for your layout), and **off-screen waste** (updating and rendering things nobody can see).

This guide covers practical techniques for each bottleneck, with before/after patterns and numbers where they matter.

---

## Understanding the Cost of Game Objects

Every Kaplay game object carries overhead: component initialization, transform recalculation, update callbacks, and draw calls. For a handful of objects this is invisible. For thousands, it dominates your frame budget.

### The Object vs. Draw-Call Spectrum

```
More convenient                                              More performant
      ↓                                                           ↓
 add([sprite()])  →  onDraw + drawSprite()  →  onDraw + drawUVQuad()
  (full object)       (manual sprite draw)       (raw textured quad)
```

- **`add([sprite(), pos(), ...])`** — full game object with components. Supports collisions, tags, events, hierarchy. Most overhead per instance.
- **`onDraw` + `drawSprite()`** — draw a sprite in the draw loop without creating an object. No collision, no tags, no update. Much cheaper.
- **`onDraw` + `drawUVQuad()`** — draw a raw textured quad. Slightly faster than `drawSprite()` because it skips sprite resolution. Best for particles and dynamic tilemaps.

### When to Use Each

| Use Case | Approach |
|---|---|
| Player, enemies, interactables | Full game objects (`add()`) |
| Static decoration, background tiles | `drawSprite()` in `onDraw` |
| Particles, bullet trails, VFX | `drawUVQuad()` in `onDraw` or `particles()` component |
| HUD text that updates rarely | Full object is fine |
| Damage numbers, floating text | `drawText()` in `onDraw` (NOT `add([text()])`) |

### Example: Efficient Tilemap Rendering

Instead of creating an object per tile, draw them directly:

```typescript
import kaplay from "kaplay";

const k = kaplay();

// Load a tileset spritesheet
k.loadSprite("tiles", "assets/tileset.png", {
  sliceX: 16,
  sliceY: 16,
});

// Tile data — just numbers referencing frames
const mapData: number[][] = [
  [0, 1, 1, 0, 2, 2],
  [0, 3, 3, 0, 4, 4],
  // ... hundreds of rows
];

const TILE_SIZE = 32;

// Draw tiles in the draw loop — no game objects created
k.onDraw(() => {
  for (let y = 0; y < mapData.length; y++) {
    for (let x = 0; x < mapData[y].length; x++) {
      k.drawSprite({
        sprite: "tiles",
        frame: mapData[y][x],
        pos: k.vec2(x * TILE_SIZE, y * TILE_SIZE),
      });
    }
  }
});
```

This renders the same visual as creating thousands of tile objects, but without any per-object overhead.

---

## Draw-Call Batching

Kaplay batches consecutive draw calls that share the same texture, blend mode, and shader into a single GPU draw call. **Breaking the batch** forces a GPU flush, which is expensive.

### What Breaks Batching

- Switching between different textures (e.g., sprite A → sprite B → sprite A)
- Switching between sprites and shapes (e.g., `drawSprite()` → `drawRect()` → `drawSprite()`)
- Changing blend modes or shaders mid-frame

### How to Preserve Batching

**Group draws by type.** Draw all sprites together, then all shapes together:

```typescript
// BAD — alternating sprites and shapes breaks batching every draw call
k.onDraw(() => {
  for (const entity of entities) {
    k.drawSprite({ sprite: "enemy", pos: entity.pos });
    k.drawRect({ pos: entity.pos, width: 40, height: 4 }); // health bar
  }
});

// GOOD — all sprites first, then all shapes
k.onDraw(() => {
  // Batch 1: all enemy sprites (one draw call if same texture)
  for (const entity of entities) {
    k.drawSprite({ sprite: "enemy", pos: entity.pos });
  }
  // Batch 2: all health bars (one draw call for rectangles)
  for (const entity of entities) {
    k.drawRect({
      pos: k.vec2(entity.pos.x, entity.pos.y - 10),
      width: 40,
      height: 4,
      color: k.rgb(255, 0, 0),
    });
  }
});
```

**Use spritesheets/atlases.** When all sprites share one texture atlas, they batch together even if they use different frames.

```typescript
// All frames from the same spritesheet = same texture = one batch
k.loadSprite("atlas", "assets/game-atlas.png", {
  sliceX: 8,
  sliceY: 8,
});
```

---

## Collision Detection: Choosing the Right Algorithm

Kaplay supports multiple broadphase algorithms. The default works, but choosing the right one for your game's spatial layout can cut collision time dramatically.

### Available Algorithms

| Algorithm | Config Value | Best For |
|---|---|---|
| Sweep-and-Prune (horizontal) | `"sap"` | Side-scrollers, horizontal games |
| Sweep-and-Prune (vertical) | `"sapv"` | Vertical shooters, falling games |
| Hash Grid | `"grid"` | Uniformly distributed objects (top-down, RTS) |
| Quadtree | `"quadtree"` | Clustered objects (strategy, open-world) |

### Configuring the Broadphase

```typescript
const k = kaplay({
  // Choose based on your game's object distribution
  broadphaseAlgorithm: "sap",  // for a side-scroller
});

// Or for a top-down game with evenly spread units:
const k = kaplay({
  broadphaseAlgorithm: "grid",
});
```

### Narrow-Phase: GJK vs. SAT

Kaplay's default narrow-phase algorithm is **GJK** (Gilbert–Johnson–Keerthi), which replaced SAT in recent versions. GJK is faster and supports any convex shape, including curved surfaces. If you need the old behavior:

```typescript
const k = kaplay({
  narrowPhaseCollisionAlgorithm: "sat", // revert to SAT if needed
});
```

### Reducing Collision Checks

- **Remove `area()` from objects that don't need collision.** Decorative objects, particles, and background elements should not have area components.
- **Use tags to scope collision handlers.** `onCollide("bullet", "enemy", ...)` only checks bullets against enemies, not against every object.
- **Limit collider complexity.** Simple rectangles are faster than polygons. Use the simplest shape that works.

---

## Off-Screen Culling

Objects outside the camera view still get updated and rendered by default. For large maps this is the single biggest waste.

### The `offscreen()` Component

```typescript
// Remove bullets that leave the screen — prevents buildup
const bullet = k.add([
  k.sprite("bullet"),
  k.pos(player.pos),
  k.move(k.RIGHT, 600),
  k.offscreen({ destroy: true }), // auto-destroy when off-screen
]);

// Pause expensive updates for off-screen enemies
const enemy = k.add([
  k.sprite("enemy"),
  k.pos(500, 300),
  k.offscreen({
    hide: true,     // stop rendering
    pause: true,    // stop update callbacks
    distance: 200,  // buffer zone (pixels beyond screen edge)
  }),
]);
```

### Manual Culling for Draw-Loop Rendering

When using `onDraw()` for tilemaps or particles, cull manually:

```typescript
k.onDraw(() => {
  const cam = k.camPos();
  const halfW = k.width() / 2 + TILE_SIZE;  // buffer
  const halfH = k.height() / 2 + TILE_SIZE;

  const startX = Math.max(0, Math.floor((cam.x - halfW) / TILE_SIZE));
  const endX = Math.min(mapWidth, Math.ceil((cam.x + halfW) / TILE_SIZE));
  const startY = Math.max(0, Math.floor((cam.y - halfH) / TILE_SIZE));
  const endY = Math.min(mapHeight, Math.ceil((cam.y + halfH) / TILE_SIZE));

  for (let y = startY; y < endY; y++) {
    for (let x = startX; x < endX; x++) {
      k.drawSprite({
        sprite: "tiles",
        frame: mapData[y][x],
        pos: k.vec2(x * TILE_SIZE, y * TILE_SIZE),
      });
    }
  }
});
```

This renders only visible tiles — a 100×100 map that shows 20×15 tiles goes from 10,000 draw calls to 300.

---

## Particles: Use the Built-in System

Creating and destroying game objects for each particle is expensive. Kaplay provides a `particles()` component specifically for this:

```typescript
const emitter = k.add([
  k.pos(400, 300),
  k.particles({
    max: 100,
    speed: [50, 150],
    angle: [0, 360],
    lifetime: [0.5, 1.5],
    rate: 20,
    // Particles are lightweight — not full game objects
    texture: k.getSprite("spark").data.tex,
    quads: [k.getSprite("spark").data.frames[0]],
  }),
]);

// Burst particles (e.g., on explosion)
emitter.emit(30);
```

The `particles()` component renders directly without creating per-particle game objects, giving you orders-of-magnitude better performance than spawning `add([sprite()])` in a loop.

---

## Object Pooling

For objects that spawn and despawn frequently (bullets, coins, enemies), recycling is faster than creating/destroying:

```typescript
class BulletPool {
  private pool: ReturnType<typeof k.add>[] = [];

  spawn(x: number, y: number, dir: number): ReturnType<typeof k.add> {
    let bullet = this.pool.pop();

    if (bullet) {
      // Reuse existing object
      bullet.pos.x = x;
      bullet.pos.y = y;
      bullet.angle = dir;
      bullet.hidden = false;
      bullet.paused = false;
    } else {
      // Create new if pool is empty
      bullet = k.add([
        k.sprite("bullet"),
        k.pos(x, y),
        k.rotate(dir),
        k.move(k.Vec2.fromAngle(dir), 800),
        k.area(),
        k.offscreen({ destroy: false }),
        "bullet",
      ]);
    }

    return bullet;
  }

  recycle(bullet: ReturnType<typeof k.add>): void {
    bullet.hidden = true;
    bullet.paused = true;
    this.pool.push(bullet);
  }
}

const bullets = new BulletPool();
```

---

## Texture and Asset Optimization

### Use Spritesheets Over Individual Images

```typescript
// BAD — 50 separate HTTP requests, 50 separate textures (50 potential batch breaks)
for (let i = 0; i < 50; i++) {
  k.loadSprite(`enemy_${i}`, `assets/enemy_${i}.png`);
}

// GOOD — 1 HTTP request, 1 texture, perfect batching
k.loadSprite("enemies", "assets/enemies-atlas.png", {
  sliceX: 10,
  sliceY: 5,
});
```

### Keep Textures Power-of-Two

GPU hardware works most efficiently with power-of-two textures (256×256, 512×512, 1024×1024). Non-power-of-two textures may be padded internally, wasting VRAM.

### Compress Audio

Use `.ogg` (or `.mp3` as fallback) instead of `.wav`. A 30-second `.wav` can be 5MB; the same audio as `.ogg` is ~300KB.

---

## Profiling Your Game

### Built-in Debug Mode

```typescript
const k = kaplay({
  debug: true, // enables debug info
});

// Toggle debug overlay at runtime
k.onKeyPress("f1", () => {
  k.debug.inspect = !k.debug.inspect; // show object info on hover
});
```

### Browser DevTools

- **Performance tab** — record a few seconds of gameplay and look for long frames. The "Main" thread flame chart shows where time is spent.
- **Memory tab** — take heap snapshots to find leaking objects (game objects that were never destroyed).
- **`console.time` / `console.timeEnd`** — wrap suspect code to measure it directly.

```typescript
k.onUpdate(() => {
  console.time("collision");
  // collision-heavy logic
  console.timeEnd("collision");
});
```

---

## Quick Checklist

1. **Are you creating objects you could draw directly?** Switch decorations and tiles to `onDraw` + `drawSprite()`.
2. **Are draw calls batched?** Group sprites together, shapes together. Use atlases.
3. **Is the right collision algorithm selected?** Match `broadphaseAlgorithm` to your game layout.
4. **Are off-screen objects culled?** Use `offscreen()` or manual camera-based culling.
5. **Are particles using the `particles()` component?** Not spawning full game objects.
6. **Are frequently-spawned objects pooled?** Bullets, coins, damage numbers.
7. **Are textures atlased and power-of-two?** Minimize draw calls and VRAM waste.
8. **Is audio compressed?** `.ogg`/`.mp3`, not `.wav`.

---

## Framework Comparison: Performance Strategies

| Strategy | Kaplay | Phaser 3 | PixiJS | Excalibur |
|---|---|---|---|---|
| Object culling | `offscreen()` component | Camera cull on Containers | Manual (no built-in) | `offscreen` strategy |
| Particle system | `particles()` component | `ParticleEmitter` (built-in) | `ParticleContainer` (1M+) | `ParticleEmitter` |
| Batching control | Draw ordering, atlases | Automatic per-pipeline | Automatic with atlas | Automatic |
| Broadphase options | SAP, grid, quadtree | Arcade (AABB), Matter.js | None (rendering only) | Dynamic tree |
| Object pooling | Manual | `Group.get()` built-in | Manual | Manual |

---

## Summary

Kaplay performance comes down to four things: avoid unnecessary game objects (draw directly when you can), keep GPU batches intact (group draws by type, use atlases), pick the right collision algorithm for your object layout, and cull everything the camera can't see. The `offscreen()` component and `particles()` system are your two most impactful built-in tools — use them early, not after performance problems appear. Profile with browser DevTools to confirm where your frame budget actually goes before optimizing blind.
