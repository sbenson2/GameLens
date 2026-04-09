# G12 — Excalibur.js Camera & Viewport Systems

> **Category:** guide · **Engine:** Excalibur · **Related:** [E1 Architecture Overview](../architecture/E1_architecture_overview.md) · [G2 Scene Management](G2_scene_management.md) · [G4 Input Handling](G4_input_handling.md)

---

## Overview

Excalibur provides a built-in `Camera` on every scene and a `Screen` abstraction that separates **viewport** (CSS pixels on the physical display) from **resolution** (logical game pixels). The camera uses a composable **strategy system** — you stack behaviors like "lock to actor" and "limit to bounds" and they execute in order each frame. This design avoids deep inheritance hierarchies and makes it easy to build custom camera behaviors.

This guide covers camera basics, the built-in strategies, custom strategy authoring, zoom, effects, the screen/viewport system, coordinate conversion, display modes, and common game patterns.

---

## Camera Basics

Each scene has a camera accessible via `scene.camera`:

```typescript
import { Engine, Scene, Actor, vec } from 'excalibur';

class GameScene extends Scene {
  onInitialize(engine: Engine): void {
    const cam = this.camera;

    // Set the camera position directly (centers on this world point)
    cam.pos = vec(400, 300);

    // Or use x/y individually
    cam.x = 400;
    cam.y = 300;
  }
}
```

The camera focus point (`cam.pos`) determines the center of the screen. Everything else — actors, tilemaps, particles — is rendered relative to this focus.

### Reading Camera State

```typescript
// Current focus position
const focus: Vector = camera.pos; // or camera.getFocus()

// Current zoom level (1 = default)
const z: number = camera.zoom;

// Current rotation (radians)
const r: number = camera.rotation;
```

---

## Camera Strategies

Strategies are the core of Excalibur's camera system. Each strategy is a function that receives the current target and camera state, and returns a new focus `Vector`. Strategies execute in the order they were added, each one potentially adjusting the result of the previous one.

### Lock to Actor

The most common strategy — locks the camera center to an actor's bounding box center:

```typescript
import { Actor, Engine, Scene } from 'excalibur';

class GameScene extends Scene {
  player!: Actor;

  onInitialize(engine: Engine): void {
    this.player = new Actor({ x: 100, y: 100, width: 32, height: 32 });
    this.add(this.player);

    // Camera follows the player exactly
    this.camera.strategy.lockToActor(this.player);
  }
}
```

### Lock to Actor Axis

Follow an actor on only one axis — useful for side-scrollers where vertical camera should be independent:

```typescript
import { Axis } from 'excalibur';

// Follow only on the X axis
this.camera.strategy.lockToActorAxis(this.player, Axis.X);

// Follow only on the Y axis
this.camera.strategy.lockToActorAxis(this.player, Axis.Y);
```

### Elastic to Actor

Smooth follow with spring-like physics. The camera accelerates toward the actor and decelerates as it approaches:

```typescript
// elasticToActor(actor, elasticity, friction)
// elasticity: 0.05–0.2 typical (higher = faster catchup)
// friction: 0.8–0.95 typical (higher = less damping)
this.camera.strategy.elasticToActor(this.player, 0.1, 0.9);
```

| Elasticity | Friction | Feel |
|------------|----------|------|
| `0.05` | `0.9` | Slow, floaty — atmospheric exploration |
| `0.1` | `0.9` | Balanced — platformers, adventure games |
| `0.2` | `0.85` | Snappy — action games |
| `0.05` | `0.95` | Very loose — emphasizes momentum |

### Radius Around Actor

The camera only moves when the actor leaves a circular region around the current focus:

```typescript
// radiusAroundActor(actor, radius)
this.camera.strategy.radiusAroundActor(this.player, 150);
```

The player can move freely within the 150px radius without the camera reacting, reducing motion for small movements.

### Limit Camera Bounds

Constrain the camera to a rectangular world region — prevents showing empty space beyond the map:

```typescript
import { BoundingBox } from 'excalibur';

const worldBounds = new BoundingBox({
  left: 0,
  top: 0,
  right: 3200,
  bottom: 1800,
});

this.camera.strategy.limitCameraBounds(worldBounds);
```

> **Important:** `limitCameraBounds` should be added **after** a follow strategy. Strategies execute in order — first the camera follows the actor, then bounds are applied on top.

### Combining Strategies

Strategies compose by executing in sequence:

```typescript
// 1. Follow player with elastic movement
this.camera.strategy.elasticToActor(this.player, 0.1, 0.9);

// 2. Then clamp to world bounds
this.camera.strategy.limitCameraBounds(worldBounds);
```

The result: the camera smoothly tracks the player but never scrolls past the edges of the map.

---

## Managing Strategies

```typescript
const cam = this.camera;

// Add a strategy (returns the strategy instance for later removal)
const lockStrategy = cam.strategy.lockToActor(this.player);

// Remove a specific strategy
cam.strategy.remove(lockStrategy);

// Remove all strategies
cam.clearAllStrategies();

// Replace all strategies at once
cam.setStrategies([myCustomStrategy]);

// Access the strategy array directly
console.log(cam.strategies.length);
```

---

## Custom Strategies

Implement the `CameraStrategy<T>` interface to create bespoke camera behavior:

```typescript
import { CameraStrategy, Camera, Engine, Vector, Actor } from 'excalibur';

class LookAheadStrategy implements CameraStrategy<Actor> {
  target: Actor;
  private lookAhead: number;

  constructor(target: Actor, lookAhead: number = 100) {
    this.target = target;
    this.lookAhead = lookAhead;
  }

  action(target: Actor, camera: Camera, _engine: Engine, _elapsed: number): Vector {
    const current = camera.getFocus();
    const direction = target.vel.normalize();
    const offset = direction.scale(this.lookAhead);
    const desired = target.pos.add(offset);

    // Lerp toward the look-ahead position
    return current.add(desired.sub(current).scale(0.08));
  }
}

// Usage
const lookAhead = new LookAheadStrategy(this.player, 120);
this.camera.addStrategy(lookAhead);
```

**Key rule:** Always reference `camera.getFocus()` (not `camera.pos` directly) inside a strategy's `action` method. This ensures your strategy composes correctly with strategies that ran before it — `getFocus()` returns the accumulated result.

---

## Zoom

```typescript
const cam = this.camera;

// Set zoom instantly (2 = zoomed in 2×, 0.5 = zoomed out)
cam.zoom = 2;

// Animated zoom transition
cam.zoomOverTime(2, 1000); // zoom to 2× over 1000ms
```

### Zoom + Bounds Interaction

When zoomed in, less of the world is visible. If `limitCameraBounds` is active, the bounds constraint respects the current zoom — the camera will not reveal space outside the bounds even at high zoom levels.

When zoomed out, more of the world becomes visible. If the entire world fits on screen, the camera locks in place.

---

## Camera Effects

### Shake

```typescript
// Shake for a specified duration
cam.shake(5, 5, 300); // x-intensity, y-intensity, duration (ms)
```

Call `shake()` once — it decays automatically. Calling it while a shake is in progress resets the timer.

### Move (Animated Pan)

Smoothly transition the camera to a target position:

```typescript
import { EasingFunctions } from 'excalibur';

// Move to world position (1600, 900) over 2 seconds with easing
cam.move(vec(1600, 900), 2000, EasingFunctions.EaseInOutCubic);
```

`move()` returns a `Promise` that resolves when the animation completes:

```typescript
async function bossIntro(): Promise<void> {
  // Clear follow strategies during the cutscene
  cam.clearAllStrategies();

  await cam.move(vec(bossX, bossY), 2000, EasingFunctions.EaseInOutCubic);
  cam.shake(8, 8, 500);
  await delay(1500);
  await cam.move(player.pos, 1500, EasingFunctions.EaseInOutQuad);

  // Re-enable follow
  cam.strategy.elasticToActor(player, 0.1, 0.9);
  cam.strategy.limitCameraBounds(worldBounds);
}
```

---

## Screen & Viewport

The `Screen` class manages the HTML canvas size, scaling, and coordinate translation. It separates two concepts:

### Viewport (CSS Pixels)

The viewport is the physical size of the canvas element on the web page:

```typescript
const game = new Engine({
  viewport: { width: 800, height: 600 },
});
```

### Resolution (Logical Game Pixels)

The resolution defines how many logical pixels are distributed across the viewport. A low resolution stretched across a large viewport creates a pixel-art look:

```typescript
import { Resolution } from 'excalibur';

const game = new Engine({
  viewport: { width: 800, height: 600 },
  resolution: Resolution.GameBoy, // 160×144 logical pixels
});
```

| Preset | Width | Height | Use Case |
|--------|-------|--------|----------|
| `Resolution.GameBoy` | 160 | 144 | Retro pixel art |
| `Resolution.GameBoyAdvance` | 240 | 160 | GBA-style games |
| `Resolution.SNES` | 256 | 224 | 16-bit era |
| `Resolution.Standard` | 1920 | 1080 | Modern HD |

### Custom Resolution

```typescript
const game = new Engine({
  viewport: { width: 1280, height: 720 },
  resolution: { width: 320, height: 180 },
});
```

---

## Display Modes

Display modes control how the game canvas adapts to the browser window:

```typescript
import { DisplayMode } from 'excalibur';

const game = new Engine({
  displayMode: DisplayMode.FillScreen,
  viewport: { width: 800, height: 600 },
});
```

| Mode | Behavior |
|------|----------|
| `Fixed` | Canvas stays at the configured viewport size. No resizing. |
| `FillScreen` | Stretches canvas to fill the entire window. Resolution scales proportionally. |
| `FillContainer` | Fills the parent HTML element (useful for embedded games). |
| `FitScreen` | Scales to fit the window while maintaining aspect ratio (letterboxing). |
| `FitContainer` | Same as FitScreen but relative to parent element. |

### Antialiasing and Pixel Art

```typescript
const game = new Engine({
  antialiasing: false,  // Disable for crisp pixel art
  pixelRatio: 1,        // Override device pixel ratio
});
```

---

## HiDPI Handling

Excalibur auto-detects high-DPI displays and scales the canvas resolution accordingly. On a 2× Retina display with an 800×600 viewport, the actual canvas backing is 1600×1200 to prevent blurriness.

Disable this if it causes performance issues on mobile:

```typescript
const game = new Engine({
  suppressHiDPIScaling: true,
});
```

### Actual Rendered Dimensions

```typescript
// Get the true pixel dimensions (accounting for device pixel ratio)
const drawW = engine.drawWidth;
const drawH = engine.drawHeight;
```

---

## Coordinate Conversion

Convert between screen-space (pointer input) and world-space (actor positions):

```typescript
// Screen → World (e.g., where did the player click in the game world?)
const worldPos = engine.screenToWorldCoordinates(vec(pointerX, pointerY));

// World → Screen (e.g., position a CSS tooltip over a game actor)
const screenPos = engine.worldToScreenCoordinates(actor.pos);
```

These methods account for:
- Camera position and zoom
- Viewport scaling and display mode
- Device pixel ratio
- Canvas offset on the page

---

## Runtime Resolution Changes

Dynamically change the viewport or resolution (e.g., for a settings menu or fullscreen toggle):

```typescript
// Change viewport and resolution
engine.screen.viewport = { width: 1280, height: 720 };
engine.screen.resolution = { width: 640, height: 360 };
engine.screen.applyResolutionAndViewport();

// Push/pop for temporary changes (e.g., pause menu overlay)
engine.screen.pushResolutionAndViewport();
engine.screen.viewport = { width: 400, height: 300 };
engine.screen.resolution = { width: 200, height: 150 };
engine.screen.applyResolutionAndViewport();

// Later: restore previous settings
engine.screen.popResolutionAndViewport();
```

---

## Common Patterns

### Platformer Camera

```typescript
onInitialize(engine: Engine): void {
  // Elastic follow for smooth horizontal movement
  this.camera.strategy.elasticToActor(this.player, 0.12, 0.88);

  // Clamp to level bounds
  const bounds = new BoundingBox({ left: 0, top: 0, right: 6400, bottom: 1200 });
  this.camera.strategy.limitCameraBounds(bounds);
}
```

### Top-Down RPG Camera

```typescript
// Lock to actor — RPGs typically want precise camera tracking
this.camera.strategy.lockToActor(this.player);

// Clamp to room/map bounds
this.camera.strategy.limitCameraBounds(currentMapBounds);
```

### Scene Transition Pan

```typescript
async function transitionToNewArea(targetPos: Vector): Promise<void> {
  // Disable player input during transition
  this.player.vel = vec(0, 0);

  // Fade and move
  await this.camera.move(targetPos, 1500, EasingFunctions.EaseInOutSine);

  // Re-enable player input
}
```

### Damage Feedback

```typescript
onPlayerDamaged(): void {
  this.camera.shake(4, 4, 200);
}
```

---

## Cross-Framework Comparison

| Feature | Excalibur | Phaser | PixiJS | Kaplay |
|---------|-----------|--------|--------|--------|
| Built-in camera | `scene.camera` with strategies | `this.cameras.main` | No built-in — Container transforms | `setCamPos()` / `getCamPos()` |
| Follow target | `lockToActor()`, `elasticToActor()` | `cam.startFollow()` with lerp | Manual or pixi-viewport `follow()` | Manual `onUpdate` + lerp |
| Bounds | `limitCameraBounds()` strategy | `cam.setBounds()` | Manual clamping or pixi-viewport | Manual clamping |
| Zoom | `camera.zoom` / `zoomOverTime()` | `cam.setZoom()` / `cam.zoomTo()` | `container.scale.set()` | `setCamScale()` |
| Shake | `camera.shake(x, y, duration)` | `cam.shake(duration, intensity)` | DIY implementation | `shake(intensity)` |
| Animated pan | `camera.move()` with easing + Promise | `cam.pan()` + event callback | DIY tween | `tween()` + `setCamPos()` |
| Custom behavior | `CameraStrategy<T>` interface | Override update + manual scroll | Full manual control | Full manual in `onUpdate` |
| Multiple cameras | Single camera per scene | Native multi-camera | Multiple Containers | `camera()` + `viewport()` (v4000+) |
| Viewport/resolution split | `Screen` with viewport + resolution | Game config `width`/`height` | `Application` init options | `kaplay({ width, height })` |

---

## Performance Notes

- Camera strategies are lightweight — each is a single function call per frame. Having 2–3 strategies stacked has negligible cost.
- `limitCameraBounds` is a simple clamp operation and should always be included to prevent disorienting views of empty space.
- `camera.move()` uses Excalibur's built-in timer system and does not create per-frame garbage.
- On mobile, consider `suppressHiDPIScaling: true` if the device reports a pixel ratio of 3× or higher — the backing canvas at that scale can be very large.
- Coordinate conversion (`screenToWorldCoordinates`) is cheap and accounts for all transforms — use it directly in pointer event handlers rather than caching.
