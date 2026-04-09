# G11 — PixiJS Camera & Viewport Systems

> **Category:** guide · **Engine:** PixiJS · **Related:** [E1 Architecture Overview](../architecture/E1_architecture_overview.md) · [G3 Scene State Management](G3_scene_state_management.md) · [G4 Input Handling](G4_input_handling.md)

---

## Overview

PixiJS is a rendering engine, not a full game framework, so it has **no built-in camera**. Instead, you build camera behavior from PixiJS primitives — specifically `Container` transforms (position, scale, pivot, rotation). This gives you maximum flexibility but means you must implement scrolling, following, bounds, and effects yourself or use the community `pixi-viewport` library.

This guide covers three approaches: manual container-based cameras, the `pixi-viewport` library (v6+ for PixiJS v8), and PixiJS v8's render groups for performance optimization.

---

## Approach 1: Manual Container Camera

The simplest camera pattern: put all game objects inside a "world" `Container`, then move, scale, and rotate that container to simulate a camera.

### Basic Setup

```typescript
import { Application, Container, Sprite } from 'pixi.js';

const app = new Application();
await app.init({ width: 800, height: 600 });

// World container acts as the camera target
const world = new Container();
app.stage.addChild(world);

// Add game objects to world, not to stage
const player = Sprite.from('hero.png');
world.addChild(player);
```

### Scrolling

Move the world container in the opposite direction of where you want the camera to look:

```typescript
// Camera class wrapping a Container
class Camera {
  private world: Container;
  private screenWidth: number;
  private screenHeight: number;

  constructor(world: Container, screenWidth: number, screenHeight: number) {
    this.world = world;
    this.screenWidth = screenWidth;
    this.screenHeight = screenHeight;
  }

  /** Center the camera on a world position */
  lookAt(x: number, y: number): void {
    this.world.x = this.screenWidth / 2 - x;
    this.world.y = this.screenHeight / 2 - y;
  }

  /** Get the world position the camera is centered on */
  get position(): { x: number; y: number } {
    return {
      x: this.screenWidth / 2 - this.world.x,
      y: this.screenHeight / 2 - this.world.y,
    };
  }
}

// Usage
const camera = new Camera(world, 800, 600);
camera.lookAt(player.x, player.y);
```

### Smooth Follow

Apply linear interpolation (lerp) in your game loop:

```typescript
app.ticker.add((ticker) => {
  const target = { x: player.x, y: player.y };
  const current = camera.position;
  const lerpFactor = 0.1; // 0 = no movement, 1 = instant snap

  camera.lookAt(
    current.x + (target.x - current.x) * lerpFactor,
    current.y + (target.y - current.y) * lerpFactor
  );
});
```

### Zoom

Scale the world container. To zoom toward the center of the screen, adjust the pivot:

```typescript
class Camera {
  // ... previous code ...

  setZoom(zoom: number): void {
    // Set pivot to current camera center in world space
    const cx = this.screenWidth / 2 - this.world.x;
    const cy = this.screenHeight / 2 - this.world.y;
    this.world.pivot.set(cx, cy);
    this.world.position.set(this.screenWidth / 2, this.screenHeight / 2);
    this.world.scale.set(zoom);
  }

  get zoom(): number {
    return this.world.scale.x;
  }
}
```

> **Gotcha:** When using `pivot` + `position` together for zoom, your `lookAt` method must account for the current scale. Multiply offsets by the scale factor.

### Bounds Clamping

Prevent the camera from revealing empty space beyond the world edges:

```typescript
clamp(worldWidth: number, worldHeight: number): void {
  const pos = this.position;
  const halfW = (this.screenWidth / 2) / this.world.scale.x;
  const halfH = (this.screenHeight / 2) / this.world.scale.y;

  const clampedX = Math.max(halfW, Math.min(worldWidth - halfW, pos.x));
  const clampedY = Math.max(halfH, Math.min(worldHeight - halfH, pos.y));

  this.lookAt(clampedX, clampedY);
}
```

### Coordinate Conversion

Essential for translating pointer input to world positions:

```typescript
/** Convert screen coordinates to world coordinates */
screenToWorld(screenX: number, screenY: number): { x: number; y: number } {
  const worldX = (screenX - this.world.x) / this.world.scale.x;
  const worldY = (screenY - this.world.y) / this.world.scale.y;
  return { x: worldX, y: worldY };
}

/** Convert world coordinates to screen coordinates */
worldToScreen(worldX: number, worldY: number): { x: number; y: number } {
  return {
    x: worldX * this.world.scale.x + this.world.x,
    y: worldY * this.world.scale.y + this.world.y,
  };
}
```

---

## Approach 2: pixi-viewport Library

For feature-rich camera behavior without building everything from scratch, `pixi-viewport` (v6.0.3+) provides a drop-in viewport with plugins for drag, pinch-zoom, follow, snap, bounce, and more.

### Installation

```bash
npm install pixi-viewport
```

### Basic Setup

```typescript
import { Application } from 'pixi.js';
import { Viewport } from 'pixi-viewport';

const app = new Application();
await app.init({ width: 800, height: 600 });

const viewport = new Viewport({
  screenWidth: 800,
  screenHeight: 600,
  worldWidth: 3200,
  worldHeight: 1800,
  events: app.renderer.events, // Required for PixiJS v8
});

app.stage.addChild(viewport);

// Add game objects to the viewport instead of the stage
viewport.addChild(player);
```

> **Critical:** The `events` parameter is required for PixiJS v8. Pass `app.renderer.events` — without it, input plugins (drag, pinch, wheel) will not function.

### Plugin System

Enable behaviors by chaining plugin methods:

```typescript
viewport
  .drag()           // Pan by dragging
  .pinch()          // Pinch-to-zoom on touch devices
  .wheel()          // Mouse wheel zoom
  .decelerate()     // Momentum after drag release
  .clampZoom({      // Restrict zoom range
    minScale: 0.5,
    maxScale: 3,
  })
  .clamp({          // Restrict panning to world bounds
    direction: 'all',
  })
  .bounce();        // Elastic bounce at edges
```

### Following a Target

```typescript
// Follow a sprite with the viewport
viewport.follow(player, {
  speed: 0,       // 0 = instant, >0 = pixels per frame
  acceleration: undefined, // Optional acceleration factor
  radius: undefined,       // Only follow when target exceeds this distance
});

// Stop following
viewport.plugins.remove('follow');
```

### Snap to Position

```typescript
// Snap the viewport center to a specific world coordinate
viewport.snap(1600, 900, {
  time: 1000,           // Duration in ms
  ease: 'easeInOutSine',
  removeOnComplete: true,
});

// Snap zoom to a specific level
viewport.snapZoom({
  width: 800,    // Target visible width in world pixels
  time: 500,
  ease: 'easeOutQuad',
});
```

### Animate

```typescript
viewport.animate({
  position: { x: 1600, y: 900 },
  scale: 2,
  time: 2000,
  ease: 'easeInOutCubic',
  callbackOnComplete: () => {
    console.log('Camera animation finished');
  },
});
```

### Managing Plugins at Runtime

```typescript
// Pause/resume individual plugins
viewport.plugins.pause('drag');
viewport.plugins.resume('drag');

// Remove a plugin entirely
viewport.plugins.remove('wheel');

// Add a custom plugin
viewport.plugins.add('custom', myPlugin);
```

### Events

```typescript
viewport.on('moved', (data) => {
  // Fired when viewport moves (drag, follow, snap, etc.)
  console.log('Viewport moved:', data.type);
});

viewport.on('zoomed', (data) => {
  console.log('Zoom changed:', data.type);
});

viewport.on('clicked', (data) => {
  // World-space click coordinates
  console.log('Clicked at:', data.world.x, data.world.y);
});
```

---

## Approach 3: Render Groups (PixiJS v8)

PixiJS v8 introduced **render groups** — containers that get their own rendering pass with separate transform matrices. This is useful for performance optimization in camera setups.

```typescript
import { Container } from 'pixi.js';

// Create the world container as a render group
const world = new Container({ isRenderGroup: true });
app.stage.addChild(world);

// Or enable on an existing container
world.enableRenderGroup();
```

**Why render groups matter for cameras:**
- The world container's transform (position, scale, rotation) is applied as a single GPU operation rather than recalculating each child's transform individually.
- UI layers can be separate render groups that remain unaffected by world camera transforms.
- Particularly beneficial for large worlds with many objects.

### Multi-Layer Setup with Render Groups

```typescript
// Game world — moves with camera
const world = new Container({ isRenderGroup: true });
app.stage.addChild(world);

// UI layer — stays fixed on screen
const ui = new Container({ isRenderGroup: true });
app.stage.addChild(ui);

// Camera only moves the world container
camera.lookAt(player.x, player.y); // Affects world only
// UI remains stationary regardless of camera movement
```

---

## Camera Effects

Since PixiJS has no built-in camera effects, implement them manually:

### Screen Shake

```typescript
class ScreenShake {
  private world: Container;
  private intensity: number = 0;
  private duration: number = 0;
  private elapsed: number = 0;
  private originX: number = 0;
  private originY: number = 0;

  constructor(world: Container) {
    this.world = world;
  }

  start(intensity: number, durationMs: number): void {
    this.intensity = intensity;
    this.duration = durationMs;
    this.elapsed = 0;
    this.originX = this.world.x;
    this.originY = this.world.y;
  }

  update(deltaMs: number): void {
    if (this.elapsed >= this.duration) return;

    this.elapsed += deltaMs;
    const progress = this.elapsed / this.duration;
    const decay = 1 - progress; // Fade out over time

    this.world.x = this.originX + (Math.random() - 0.5) * this.intensity * decay;
    this.world.y = this.originY + (Math.random() - 0.5) * this.intensity * decay;

    if (this.elapsed >= this.duration) {
      this.world.x = this.originX;
      this.world.y = this.originY;
    }
  }
}

// Usage
const shake = new ScreenShake(world);
shake.start(10, 300); // 10px intensity, 300ms

app.ticker.add((ticker) => {
  shake.update(ticker.deltaMS);
});
```

### Fade Transition

Use a full-screen `Graphics` rectangle with animated alpha:

```typescript
import { Graphics } from 'pixi.js';

const fadeOverlay = new Graphics();
fadeOverlay.rect(0, 0, 800, 600).fill({ color: 0x000000 });
fadeOverlay.alpha = 0;
ui.addChild(fadeOverlay); // Add to UI layer, not world

function fadeOut(durationMs: number, onComplete?: () => void): void {
  let elapsed = 0;
  const tick = (ticker: { deltaMS: number }) => {
    elapsed += ticker.deltaMS;
    fadeOverlay.alpha = Math.min(1, elapsed / durationMs);
    if (elapsed >= durationMs) {
      app.ticker.remove(tick);
      onComplete?.();
    }
  };
  app.ticker.add(tick);
}
```

---

## Common Patterns

### Platformer Camera

```typescript
// Follow player horizontally with look-ahead, smooth vertical
app.ticker.add(() => {
  const lookAhead = player.vx > 0 ? 100 : player.vx < 0 ? -100 : 0;
  const targetX = player.x + lookAhead;
  const targetY = player.y;

  const pos = camera.position;
  camera.lookAt(
    pos.x + (targetX - pos.x) * 0.08,  // Slow horizontal
    pos.y + (targetY - pos.y) * 0.15    // Faster vertical
  );
  camera.clamp(mapWidth, mapHeight);
});
```

### Room-Based Camera (Zelda-style)

```typescript
function getRoomBounds(playerX: number, playerY: number) {
  const roomW = 800;
  const roomH = 600;
  const col = Math.floor(playerX / roomW);
  const row = Math.floor(playerY / roomH);
  return {
    x: col * roomW + roomW / 2,
    y: row * roomH + roomH / 2,
  };
}

app.ticker.add(() => {
  const room = getRoomBounds(player.x, player.y);
  const pos = camera.position;
  camera.lookAt(
    pos.x + (room.x - pos.x) * 0.05,
    pos.y + (room.y - pos.y) * 0.05
  );
});
```

---

## Cross-Framework Comparison

| Feature | PixiJS | Phaser | Kaplay | Excalibur |
|---------|--------|--------|--------|-----------|
| Built-in camera | No — Container transforms | `this.cameras.main` | `camPos()` / `setCamPos()` | `engine.currentScene.camera` |
| Follow target | Manual lerp or pixi-viewport `follow()` | `cam.startFollow()` with lerp | `setCamPos(player.pos)` per frame | `camera.strategy.lockToActor()` |
| Bounds | Manual clamping or pixi-viewport `clamp()` | `cam.setBounds()` | Manual or community plugin | `camera.strategy.limitCameraBounds()` |
| Zoom | `container.scale.set()` | `cam.setZoom()` | `setCamScale()` | `camera.zoom` |
| Multiple cameras | Multiple Containers | Native multi-camera | Single + viewport components (v4000) | Single camera with strategies |
| Effects | DIY (shake, fade, etc.) | Built-in fade, flash, shake, pan | `shake()`, `flash()` | `camera.shake()`, `camera.move()` |

---

## Performance Notes

- **Render groups** reduce transform recalculations — use them for the world container when you have many children.
- With manual cameras, avoid calling `lookAt` or modifying `world.position` more than once per frame.
- `pixi-viewport` adds event listeners; call `viewport.plugins.pause()` on plugins you're not using to reduce overhead.
- For large worlds with many objects, combine camera culling (only add visible objects to the stage) with viewport bounds checks.
- Coordinate conversion (`screenToWorld`) is cheap — do not cache results across frames since the camera moves.
