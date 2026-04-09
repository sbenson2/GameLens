# G10 — PixiJS v8 Performance Optimization

> **Category:** guide · **Engine:** PixiJS · **Related:** [E1 Architecture Overview](../architecture/E1_architecture_overview.md) · [G1 Asset Loading](G1_asset_loading.md) · [G2 Sprites & Animation](G2_sprites_animation.md)

---

## Overview

PixiJS v8 is fast out of the box — its rendering pipeline only updates elements that have changed, and if nothing moves, no render code executes. But games push limits: thousands of sprites, particle effects, complex UI, and mobile targets. This guide covers concrete techniques to keep your game running at 60fps, organized from highest-impact to most specialized.

The golden rule: **only optimize when you need to.** Profile first with browser DevTools or `app.ticker` timing, identify the actual bottleneck, then apply the relevant technique below.

---

## Draw Calls and Batching

The single most impactful performance concept in PixiJS. A **draw call** is one GPU instruction to render a set of objects. Fewer draw calls = better performance.

### How Batching Works

PixiJS automatically batches consecutive sprites that share compatible state (texture, blend mode) into a single draw call. Up to **16 different textures** can be batched together (hardware-dependent).

```typescript
// GOOD: These batch into 1-2 draw calls because they share textures
const sprite1 = new Sprite(atlas.textures['hero']);
const sprite2 = new Sprite(atlas.textures['enemy']);
const sprite3 = new Sprite(atlas.textures['coin']);
// All from the same spritesheet atlas = 1 draw call

// BAD: Alternating blend modes breaks batches
sprite1.blendMode = 'normal';
sprite2.blendMode = 'screen';   // batch break!
sprite3.blendMode = 'normal';   // another batch break!
// Result: 3 draw calls instead of 1
```

### Batch Optimization Rules

1. **Use spritesheets** — pack multiple images into a single texture atlas. This is the single biggest optimization for most games.
2. **Group objects by blend mode** — normal sprites together, additive sprites together.
3. **Group objects by texture** — objects sharing a BaseTexture batch efficiently.
4. **Minimize texture swaps** — reorder your display list so objects with the same texture are adjacent.

```typescript
// GOOD: Group by blend mode
container.addChild(normalSprite1, normalSprite2, normalSprite3);
container.addChild(additiveSprite1, additiveSprite2); // only 2 draw calls total

// BAD: Interleaved blend modes
container.addChild(normalSprite1, additiveSprite1, normalSprite2, additiveSprite2);
// 4 draw calls
```

---

## Spritesheets and Texture Atlases

Spritesheets combine multiple images into a single texture file, dramatically reducing both download time and draw calls.

```typescript
import { Assets, Sprite, Spritesheet } from 'pixi.js';

// Load the spritesheet (JSON + PNG)
const sheet = await Assets.load('assets/game-atlas.json');

// Create sprites from named frames
const hero = new Sprite(sheet.textures['hero-idle-01']);
const enemy = new Sprite(sheet.textures['slime-walk-01']);
const coin = new Sprite(sheet.textures['coin-spin-01']);
```

**Impact:** Converting from individual images to shared spritesheets can cut download time in half and reduce draw calls by 80%+ with zero quality loss.

### Spritesheet Tips

- Use tools like **TexturePacker**, **Free Texture Packer**, or **Aseprite** export to generate atlases.
- Keep atlas dimensions as powers of 2 (1024×1024, 2048×2048) for GPU efficiency.
- Separate atlases by usage: one for the player/enemies, one for UI, one for environment. This lets you load only what each scene needs.
- For low-end devices, provide `@0.5x.png` half-resolution variants — PixiJS auto-scales them visually.

---

## Cache as Texture

When a container has many children that rarely change, render them once to a texture and reuse it:

```typescript
import { Container, Graphics, Sprite } from 'pixi.js';

// A complex background made of many Graphics objects
const background = new Container();
for (let i = 0; i < 500; i++) {
  const g = new Graphics();
  g.rect(Math.random() * 800, Math.random() * 600, 20, 20);
  g.fill(Math.random() * 0xffffff);
  background.addChild(g);
}

// Cache the entire container as a single texture
// Now it renders as 1 draw call instead of 500
background.cacheAsTexture(true);

// When you need to update the contents:
background.updateCacheTexture();

// Disable caching when the container changes frequently
background.cacheAsTexture(false);
```

### When to Cache

| Scenario | Cache? | Why |
|----------|--------|-----|
| Static background tiles | Yes | Rarely changes, many objects |
| HUD with score counter | No | Text updates every frame |
| Inventory grid (opened/closed) | Yes | Static while visible, update on open |
| Particle system | No | Changes every frame |
| Complex SVG-like Graphics | Yes | Expensive to re-render, rarely changes |

---

## ParticleContainer

For rendering massive numbers of similar sprites (bullets, particles, raindrops), `ParticleContainer` is purpose-built:

```typescript
import { ParticleContainer, Sprite, Texture } from 'pixi.js';

const particles = new ParticleContainer({
  dynamicProperties: {
    position: true,    // particles will move
    scale: false,      // all same size — skip scale updates
    rotation: false,   // no rotation — skip rotation updates
    color: false,      // all same color — skip color updates
  },
});

const texture = Texture.from('assets/particle.png');

for (let i = 0; i < 10000; i++) {
  const p = new Sprite(texture);
  p.x = Math.random() * 800;
  p.y = Math.random() * 600;
  particles.addChild(p);
}

app.stage.addChild(particles);
```

**Key:** Set `dynamicProperties` to `false` for any property that doesn't change. Each `false` saves per-particle per-frame computation. ParticleContainer can handle **millions of particles** when most properties are static.

### ParticleContainer Limitations

- All children must use the **same base texture** (use spritesheet frames from one atlas).
- No nested containers inside a ParticleContainer.
- No filters or masks on individual particles.
- No interactivity (no click/hover events) on individual particles.

---

## Graphics Performance

Small `Graphics` objects (under ~100 vertices) are automatically batched like sprites. But complex or frequently modified Graphics objects are expensive.

```typescript
// GOOD: Simple shapes batch automatically
const rect = new Graphics();
rect.rect(0, 0, 50, 50);
rect.fill(0xff0000);
// Treated like a sprite internally — very fast

// BAD: Rebuilding complex Graphics every frame
update() {
  complexShape.clear();
  complexShape.moveTo(x1, y1);
  // ... 200 lines of path commands
  complexShape.fill(color);
  // Expensive! Rebuilds GPU geometry every frame
}
```

### Graphics Optimization Strategies

1. **Simple shapes are free** — rectangles, circles, triangles with < 100 points perform like sprites.
2. **Don't modify Graphics every frame** — transforms (`x`, `y`, `rotation`, `alpha`, `tint`) are cheap; rebuilding geometry is not.
3. **Convert complex static Graphics to sprites** — render to texture once, use as sprite afterward.
4. **Batch small Graphics** — PixiJS auto-batches Graphics with ≤ 100 points.

---

## Text Performance

Text rendering is one of the most common performance traps:

```typescript
// BAD: Updating text every frame with Text
update() {
  scoreText.text = `Score: ${score}`;
  // Re-rasterizes the entire string to a canvas texture every time
}

// GOOD: Use BitmapText for frequently changing text
import { BitmapText, BitmapFont } from 'pixi.js';

// Install a bitmap font (do this once)
BitmapFont.install({
  name: 'GameFont',
  style: { fontFamily: 'Arial', fontSize: 24, fill: 'white' },
});

const scoreText = new BitmapText({
  text: 'Score: 0',
  style: { fontFamily: 'GameFont', fontSize: 24 },
});

// Now updates are cheap — no canvas re-rasterization
update() {
  scoreText.text = `Score: ${score}`;
}
```

### Text Type Comparison

| Type | Update Cost | Quality | Best For |
|------|------------|---------|----------|
| `Text` | High (re-rasterizes) | Crisp at any size | Static labels, dialogue |
| `BitmapText` | Low (GPU quads) | Fixed resolution | Scores, timers, damage numbers |
| `HTMLText` | Very high (DOM) | Full CSS styling | Rich text, rarely changing |

**Shared style optimization:** `Text` objects that use the same `TextStyle` *instance* (not just the same values) share cached textures, boosting performance:

```typescript
// GOOD: Share a single style instance
const labelStyle = new TextStyle({ fontSize: 16, fill: 'white' });
const label1 = new Text({ text: 'HP', style: labelStyle });
const label2 = new Text({ text: 'MP', style: labelStyle });
// Shares texture cache

// LESS OPTIMAL: Separate identical styles
const label1 = new Text({ text: 'HP', style: { fontSize: 16, fill: 'white' } });
const label2 = new Text({ text: 'MP', style: { fontSize: 16, fill: 'white' } });
// Separate cache entries even though styles are identical
```

---

## Masks

Masks are powerful but expensive — minimize their use:

```typescript
// FASTEST: Rectangle mask (uses scissor rect — nearly free)
import { Graphics } from 'pixi.js';
const rectMask = new Graphics();
rectMask.rect(0, 0, 200, 200);
rectMask.fill(0xffffff);
container.mask = rectMask;
// This is an axis-aligned rectangle → GPU scissor test, very cheap

// MEDIUM: Graphics mask (stencil buffer)
const shapeMask = new Graphics();
shapeMask.circle(100, 100, 80);
shapeMask.fill(0xffffff);
container.mask = shapeMask;
// Uses stencil buffer — moderate cost

// EXPENSIVE: Sprite mask (filter-based)
const spriteMask = new Sprite(Texture.from('mask-gradient.png'));
container.mask = spriteMask;
// Uses a filter pass — most expensive, supports soft edges
```

**Rule of thumb:** If you have more than ~50 masks, consider alternative approaches (pre-rendered masked textures, clever sprite framing).

---

## Filters

Filters apply post-processing effects (blur, glow, color matrix). Each filter adds a render pass:

```typescript
import { BlurFilter } from 'pixi.js';

// Apply a blur
const blur = new BlurFilter({ strength: 4 });
container.filters = [blur];

// IMPORTANT: Set filterArea when you know the bounds
// Prevents PixiJS from measuring bounds every frame
container.filterArea = new Rectangle(0, 0, 800, 600);

// Release filter memory when done
container.filters = null;
```

### Filter Performance Tips

- Each filter = 1+ additional render passes. Two filters on one container = 2+ extra passes.
- Set `filterArea` to a fixed `Rectangle` whenever possible — saves a bounds calculation per frame.
- The v8 `BlurFilter` uses a halving strength scheme for better performance at high blur values.
- Remove filters when not visible: `container.filters = null` frees GPU resources.

---

## Event System Optimization

The interaction/event system traverses the scene graph to find hit targets. For complex scenes, this traversal is expensive:

```typescript
// Skip traversal for containers that don't need interaction
nonInteractiveGroup.interactiveChildren = false;

// Provide explicit hit areas to avoid bounds calculation
button.eventMode = 'static';
button.hitArea = new Rectangle(0, 0, 120, 40);
// Without hitArea, PixiJS calculates bounds from the display object's shape
```

---

## Culling

By default, PixiJS renders everything in the scene graph, even off-screen objects. Enable culling for large worlds:

```typescript
// Enable culling on individual objects
sprite.cullable = true;

// Set the cull area (defaults to the renderer screen)
sprite.cullArea = new Rectangle(0, 0, 800, 600);
```

### Culling Tradeoffs

- **GPU-bound games** (complex shaders, many filters): Culling helps by reducing draw calls.
- **CPU-bound games** (many objects, complex logic): Culling adds CPU overhead for bounds checks — may not help.
- For very large worlds, consider manual chunking: only add objects near the camera to the stage, and remove distant ones.

---

## Object Pooling

Reuse objects instead of creating and destroying them to avoid garbage collection spikes:

```typescript
class BulletPool {
  private pool: Sprite[] = [];
  private active: Set<Sprite> = new Set();

  constructor(private texture: Texture, private container: Container) {}

  acquire(): Sprite {
    const bullet = this.pool.pop() ?? new Sprite(this.texture);
    bullet.visible = true;
    this.active.add(bullet);
    this.container.addChild(bullet);
    return bullet;
  }

  release(bullet: Sprite): void {
    bullet.visible = false;
    this.active.delete(bullet);
    this.container.removeChild(bullet);
    this.pool.push(bullet);
  }

  releaseAll(): void {
    for (const bullet of this.active) {
      bullet.visible = false;
      this.container.removeChild(bullet);
      this.pool.push(bullet);
    }
    this.active.clear();
  }
}

// Usage
const bulletPool = new BulletPool(bulletTexture, gameContainer);

function fireBullet(x: number, y: number) {
  const b = bulletPool.acquire();
  b.x = x;
  b.y = y;
}

function onBulletOffScreen(bullet: Sprite) {
  bulletPool.release(bullet);
}
```

PixiJS v8.16+ includes improved internal `Pool` typing — `pool.get()` returns properly typed instances.

---

## Texture Memory Management

Textures consume GPU memory. Manage them explicitly in large games:

```typescript
// Unload assets when leaving a scene
Assets.unload('level1-atlas');

// Destroy individual textures
texture.destroy(true); // true = also destroy the base texture

// When destroying many textures at once, stagger destruction
// to avoid a single-frame freeze
const texturesToDestroy = [...levelTextures];
const destroyNext = () => {
  const t = texturesToDestroy.pop();
  if (t) {
    t.destroy(true);
    setTimeout(destroyNext, 10); // spread across frames
  }
};
destroyNext();
```

---

## Mobile-Specific Optimizations

Mobile GPUs have tighter constraints:

```typescript
import { Application } from 'pixi.js';

const app = new Application();
await app.init({
  // Disable features that cost performance on mobile
  antialias: false,            // saves GPU fill rate
  useBackBuffer: false,        // reduces memory on older devices

  // Lower resolution for performance (1 = native, 0.5 = half)
  resolution: window.devicePixelRatio > 2 ? 2 : window.devicePixelRatio,
});
```

### Mobile Checklist

- Use `@0.5x` texture variants for older devices.
- Keep total texture memory under ~256MB for broad compatibility.
- Prefer `BitmapText` over `Text` — canvas rasterization is slower on mobile.
- Reduce particle counts by 50–75% on mobile.
- Test on real devices — browser DevTools throttling doesn't reflect real mobile GPU behavior.

---

## Profiling Techniques

### Frame Time Monitoring

```typescript
// Simple FPS counter
let frameCount = 0;
let elapsed = 0;

app.ticker.add((ticker) => {
  elapsed += ticker.deltaMS;
  frameCount++;
  if (elapsed >= 1000) {
    console.log(`FPS: ${frameCount}, Objects: ${countDisplayObjects(app.stage)}`);
    frameCount = 0;
    elapsed = 0;
  }
});

function countDisplayObjects(container: Container): number {
  let count = 1;
  for (const child of container.children) {
    count += child instanceof Container ? countDisplayObjects(child) : 1;
  }
  return count;
}
```

### Browser DevTools

1. **Performance tab** — record a few seconds of gameplay, look for long frames (> 16.6ms).
2. **Memory tab** — take heap snapshots before/after scene changes to find leaks.
3. **WebGL Inspector** (browser extension) — see draw calls, texture uploads, and shader switches.

---

## Performance Checklist

| Area | Action | Impact |
|------|--------|--------|
| Textures | Use spritesheets | High |
| Batching | Group by texture and blend mode | High |
| Text | Use BitmapText for dynamic text | High |
| Containers | Cache static containers as texture | Medium–High |
| Particles | Use ParticleContainer with minimal dynamic props | High |
| Events | Disable `interactiveChildren` on non-interactive groups | Medium |
| Filters | Set `filterArea`; remove unused filters | Medium |
| Masks | Prefer rectangle masks; minimize total mask count | Medium |
| Culling | Enable for large worlds with many off-screen objects | Situational |
| Memory | Unload unused assets; pool frequently created objects | Medium |
| Mobile | Lower resolution; disable antialiasing; reduce particles | High on mobile |

---

## Cross-Framework Comparison

| Technique | PixiJS v8 | Phaser 3 | Kaplay | Excalibur |
|-----------|-----------|----------|--------|-----------|
| Sprite batching | Automatic (16 textures) | Automatic via WebGL pipeline | Automatic | Automatic |
| Particle system | ParticleContainer (millions) | Particle Emitter Manager | `addKaboom()` effects | `ParticleEmitter` |
| Texture caching | `cacheAsTexture()` | `renderTexture` | Not built-in | `GraphicsGroup` |
| Object pooling | Manual (improved Pool in v8.16) | `GameObjectPool` class | Not built-in | Manual |
| Text performance | BitmapText | BitmapText | Default text is canvas-based | `Label` with SpriteFont |
| Culling | `cullable` property | Camera-based auto-cull | Automatic | Automatic offscreen culling |
