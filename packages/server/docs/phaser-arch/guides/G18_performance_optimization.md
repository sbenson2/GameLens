# G18 — Phaser 3 Performance Optimization & Debugging

> **Category:** guide · **Engine:** Phaser · **Related:** [G16 Groups, Pooling & Containers](G16_groups_pooling_containers.md) · [G8 Asset Loading](G8_asset_loading.md) · [G9 Mobile and Deployment](G9_mobile_and_deployment.md)

---

## Overview

Phaser games run at 60 FPS when things go right and grind to a halt when they don't. Performance issues in Phaser typically fall into three buckets: **too many draw calls** (rendering), **too much garbage collection** (memory), and **expensive per-frame logic** (CPU). This guide covers how to measure, diagnose, and fix each category.

---

## Measuring Performance

You can't optimize what you can't measure. Set up instrumentation before changing anything.

### FPS Counter

```typescript
// In GameConfig — enable the built-in FPS debug overlay
const config: Phaser.Types.Core.GameConfig = {
  // ...
  fps: {
    target: 60,
    forceSetTimeOut: false,  // true forces setTimeout over rAF (debug only)
  },
};
```

```typescript
// Custom FPS display in a scene (more control)
export class DebugScene extends Phaser.Scene {
  private fpsText!: Phaser.GameObjects.Text;

  create(): void {
    this.fpsText = this.add.text(10, 10, '', {
      fontSize: '14px',
      color: '#00ff00',
    }).setScrollFactor(0).setDepth(9999);
  }

  update(): void {
    this.fpsText.setText([
      `FPS: ${Math.round(this.game.loop.actualFps)}`,
      `Delta: ${this.game.loop.delta.toFixed(1)}ms`,
      `Frame: ${this.game.loop.frame}`,
    ].join('\n'));
  }
}
```

### Browser DevTools Profiling

1. **Chrome Performance tab** — Record 3–5 seconds of gameplay. Look for long frames (>16.6ms) and identify what's in them.
2. **Chrome Memory tab** — Take heap snapshots before and after a busy scene. Look for retained objects that should have been cleaned up.
3. **`game.renderer.textureFlush`** — High values mean too many texture swaps per frame (fix with atlases).

```typescript
// Log renderer stats every second (WebGL only)
this.time.addEvent({
  delay: 1000,
  loop: true,
  callback: () => {
    const renderer = this.game.renderer as Phaser.Renderer.WebGL.WebGLRenderer;
    console.log('Draw calls:', renderer.textureFlush);
  },
});
```

---

## Rendering Optimizations

### 1. Use Texture Atlases (Not Individual Images)

Every unique texture requires a WebGL texture bind. Switching textures mid-frame causes a **draw call flush**. A single atlas that packs all sprites into one texture sheet eliminates most flushes.

```typescript
// BAD — 50 individual images = up to 50 texture swaps per frame
this.load.image('coin', 'assets/coin.png');
this.load.image('gem', 'assets/gem.png');
this.load.image('heart', 'assets/heart.png');
// ... 47 more

// GOOD — one atlas = one texture bind for all sprites
this.load.atlas('game-atlas', 'assets/game-atlas.png', 'assets/game-atlas.json');

// Usage: reference frames by name
this.add.sprite(x, y, 'game-atlas', 'coin');
this.add.sprite(x, y, 'game-atlas', 'gem');
```

**Tools for atlas generation:**
- [TexturePacker](https://www.codeandweb.com/texturepacker) (paid, best features)
- [free-tex-packer](https://free-tex-packer.com/) (free, works well)
- Phaser Editor 2D (built-in atlas packer)

**Atlas guidelines:**
- Keep atlas textures at power-of-two sizes (2048×2048 max for broad mobile compatibility).
- Group sprites by scene — don't load a 4MB atlas if the current scene only needs 10 frames from it.
- Use separate atlases for UI vs gameplay to allow independent loading.

### 2. Minimize Game Objects on the Display List

Every object on the display list is processed every frame, even if off-screen (unless culled).

```typescript
// Enable camera culling — skips rendering objects outside the viewport
this.cameras.main.setRoundPixels(true);

// For very large worlds, manually cull objects
this.events.on('update', () => {
  const cam = this.cameras.main.worldView;
  this.enemies.getChildren().forEach((enemy) => {
    const e = enemy as Phaser.Physics.Arcade.Sprite;
    e.setVisible(cam.contains(e.x, e.y));
  });
});
```

### 3. Use Layers for Render Batching

Objects sharing the same texture in the same Layer batch into a single draw call:

```typescript
const coinLayer = this.add.layer();
// All 100 coins use the same atlas frame → 1 draw call
for (let i = 0; i < 100; i++) {
  coinLayer.add(this.add.image(x, y, 'game-atlas', 'coin'));
}
```

### 4. Prefer Sprites over Text

`Phaser.GameObjects.Text` creates a private Canvas element and re-rasterizes on every content change. For frequently updated text (score, timers):

```typescript
// SLOW — Text re-rasterizes the entire surface on every setText()
this.scoreText.setText(`Score: ${score}`);

// FASTER — BitmapText uses a pre-rendered font atlas (single texture, no rasterization)
this.load.bitmapFont('pixel-font', 'assets/pixel-font.png', 'assets/pixel-font.xml');
// In create():
this.scoreBitmapText = this.add.bitmapText(10, 10, 'pixel-font', 'Score: 0', 16);
// In update():
this.scoreBitmapText.setText(`Score: ${score}`);  // fast — just repositions quads
```

---

## Memory & GC Optimizations

### 5. Object Pooling

The #1 cause of GC stutters in Phaser games. See [G16 Groups, Pooling & Containers](G16_groups_pooling_containers.md) for the full pattern.

**Quick checklist:**
- Pool bullets, particles, enemies, collectibles — anything that spawns/despawns frequently.
- Use `group.getFirstDead(true)` to recycle.
- Disable physics bodies on inactive objects.
- Set `maxSize` on every pool.

### 6. Cache References

Avoid repeated lookups every frame:

```typescript
// BAD — repeated property chain traversal every frame
update(): void {
  if (this.input.keyboard!.createCursorKeys().left.isDown) { ... }
}

// GOOD — cache in create(), reuse in update()
private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;

create(): void {
  this.cursors = this.input.keyboard!.createCursorKeys();
}

update(): void {
  if (this.cursors.left.isDown) { ... }
}
```

### 7. Clean Up on Scene Shutdown

Scenes that are started/stopped/restarted can leak objects if not cleaned up:

```typescript
shutdown(): void {
  // Remove event listeners
  this.input.off('pointerdown');
  this.events.off('update');

  // Kill tweens
  this.tweens.killAll();

  // Kill timers
  this.time.removeAllEvents();

  // Destroy groups (pass true to destroy children too)
  this.bullets.destroy(true);
  this.enemies.destroy(true);

  // Remove FX pipelines
  this.cameras.main.resetPostPipeline();
}
```

### 8. Avoid Creating Objects in update()

```typescript
// BAD — creates a new Vector2 every frame (60 allocations/sec)
update(): void {
  const direction = new Phaser.Math.Vector2(targetX - this.x, targetY - this.y);
  direction.normalize();
}

// GOOD — reuse a pre-allocated vector
private tempVec = new Phaser.Math.Vector2();

update(): void {
  this.tempVec.set(targetX - this.x, targetY - this.y).normalize();
}
```

---

## CPU / Logic Optimizations

### 9. Throttle Expensive Operations

Not everything needs to run at 60Hz:

```typescript
private aiTimer: number = 0;
private readonly AI_INTERVAL: number = 200; // ms — 5 times per second

update(_time: number, delta: number): void {
  this.aiTimer += delta;
  if (this.aiTimer >= this.AI_INTERVAL) {
    this.aiTimer -= this.AI_INTERVAL;
    this.runEnemyAI();  // expensive pathfinding, LOS checks, etc.
  }

  // Physics and input still run at 60Hz
  this.handlePlayerInput();
}
```

### 10. Spatial Partitioning for Large Worlds

Arcade physics checks every body against every other body in a group by default. For large numbers of objects, reduce the search space:

```typescript
// Enable the Arcade physics spatial tree (quad-tree) — on by default but tune it
const config: Phaser.Types.Core.GameConfig = {
  physics: {
    arcade: {
      // Tune these for your world size
      overlapBias: 4,        // default 4
      tileBias: 16,          // default 16
      forceX: false,         // default false
    },
  },
};
```

For custom spatial queries beyond Arcade's built-in quad-tree, consider a grid-based spatial hash:

```typescript
// Simple spatial hash for O(1) neighbor lookups
class SpatialHash {
  private cellSize: number;
  private cells: Map<string, Set<Phaser.GameObjects.Sprite>> = new Map();

  constructor(cellSize: number) {
    this.cellSize = cellSize;
  }

  private key(x: number, y: number): string {
    return `${Math.floor(x / this.cellSize)},${Math.floor(y / this.cellSize)}`;
  }

  insert(obj: Phaser.GameObjects.Sprite): void {
    const k = this.key(obj.x, obj.y);
    if (!this.cells.has(k)) this.cells.set(k, new Set());
    this.cells.get(k)!.add(obj);
  }

  query(x: number, y: number, radius: number = 1): Phaser.GameObjects.Sprite[] {
    const results: Phaser.GameObjects.Sprite[] = [];
    const cx = Math.floor(x / this.cellSize);
    const cy = Math.floor(y / this.cellSize);
    for (let dx = -radius; dx <= radius; dx++) {
      for (let dy = -radius; dy <= radius; dy++) {
        const cell = this.cells.get(`${cx + dx},${cy + dy}`);
        if (cell) results.push(...cell);
      }
    }
    return results;
  }

  clear(): void {
    this.cells.clear();
  }
}
```

### 11. Use `runChildUpdate` Wisely

Setting `runChildUpdate: true` on a Group calls `preUpdate()` on every child every frame. Only enable it on groups that actually need per-child update logic (bullets with lifespan, enemies with AI). For static objects like coins or platforms, leave it off.

---

## Debugging Tools

### Built-in Physics Debug

```typescript
const config: Phaser.Types.Core.GameConfig = {
  physics: {
    arcade: {
      debug: true,             // draws physics bodies, velocities, and collision shapes
      debugShowBody: true,
      debugShowStaticBody: true,
      debugBodyColor: 0xff00ff,
    },
  },
};

// Toggle at runtime:
this.physics.world.drawDebug = !this.physics.world.drawDebug;
```

### Scene Plugin Inspector

```typescript
// List all active scenes
console.log(this.scene.manager.getScenes(true).map(s => s.scene.key));

// Count game objects in the current scene
console.log('Display list size:', this.children.length);

// Count physics bodies
console.log('Physics bodies:', this.physics.world.bodies.size);
console.log('Static bodies:', this.physics.world.staticBodies.size);
```

### Tracking Down Memory Leaks

```typescript
// Log active object counts periodically
this.time.addEvent({
  delay: 5000,
  loop: true,
  callback: () => {
    console.table({
      'Display list': this.children.length,
      'Physics bodies': this.physics.world.bodies.size,
      'Tweens active': this.tweens.getTweens().length,
      'Timers active': this.time.getTimerEvents ? this.time.getTimerEvents().length : 'N/A',
    });
  },
});
```

If object counts grow over time without leveling off, something is leaking — likely missed cleanup on scene restart or pooled objects not being properly recycled.

---

## Performance Checklist

| Check | Impact | Effort |
|-------|--------|--------|
| Pack sprites into texture atlases | High | Medium |
| Object pool bullets, particles, enemies | High | Medium |
| Use BitmapText instead of Text for dynamic text | Medium | Low |
| Cache input/reference lookups in create() | Medium | Low |
| Throttle AI/pathfinding to 5–10 Hz | Medium | Low |
| Clean up tweens, timers, listeners on shutdown | Medium | Low |
| Disable physics bodies on inactive pooled objects | Medium | Low |
| Enable camera culling / manual visibility culling | Medium | Medium |
| Avoid allocations in update() (reuse temp objects) | Medium | Low |
| Use Layers for same-texture batching | Low–Med | Low |
| Profile with Chrome DevTools before guessing | Critical | Zero |

---

## Common Mistakes

1. **Optimizing without profiling** — The bottleneck is rarely where you think. Always profile first.
2. **Loading individual images when an atlas would work** — This is the #1 rendering performance issue in beginner Phaser projects.
3. **Destroying and re-creating objects every frame** — Use object pooling instead. GC pauses cause visible frame stutters.
4. **Leaving `debug: true` in production** — Physics debug rendering is extremely expensive. Strip it from release builds.
5. **Running pathfinding every frame for every enemy** — Throttle to 100–200ms intervals and cache results.
6. **Not testing on target hardware** — A game that runs at 60 FPS on a MacBook Pro may run at 15 FPS on a mid-range Android phone. Test early and often on your lowest-spec target.
