# G11 — Kaplay Camera Systems & Viewport

> **Category:** guide · **Engine:** Kaplay · **Related:** [E1 Architecture Overview](../architecture/E1_architecture_overview.md) · [G2 Scenes and Navigation](G2_scenes_and_navigation.md) · [G3 Input Handling](G3_input_handling.md)

---

## Overview

Kaplay provides a built-in camera system with functions for position, scale (zoom), rotation, screen shake, and flash effects. The camera is a global singleton — there is one camera per game context. For advanced multi-viewport setups, Kaplay v4000+ introduces `camera()` and `viewport()` components that allow named cameras and multiple viewports rendered simultaneously.

This guide covers the core camera API, smooth following patterns, bounds clamping, effects, coordinate conversion, and the newer component-based camera/viewport system.

---

## Camera Position

### Legacy API (camPos / camScale / camRot)

The original functions both get and set camera state:

```typescript
import kaplay from 'kaplay';

const k = kaplay();

// Set camera position (centers the view on this world point)
k.camPos(400, 300);

// Get current camera position
const pos = k.camPos(); // returns Vec2

// Pass a Vec2 directly
k.camPos(k.vec2(400, 300));

// Pass a single value to set both x and y
k.camPos(500); // equivalent to camPos(500, 500)
```

### Modern API (setCamPos / getCamPos)

In newer versions, the getter/setter split is preferred. The `camPos()`, `camScale()`, and `camRot()` functions are deprecated in favor of explicit setters and getters:

```typescript
// Set camera position
k.setCamPos(k.vec2(400, 300));

// Get camera position
const pos: Vec2 = k.getCamPos();

// Set camera zoom (1 = default, 2 = zoomed in 2×)
k.setCamScale(k.vec2(2, 2));
const scale: Vec2 = k.getCamScale();

// Set camera rotation (radians)
k.setCamRot(Math.PI / 4);
const rot: number = k.getCamRot();
```

> **Migration tip:** If you are on Kaplay 3000+, use the `set`/`get` variants. The shorthand functions still work but may be removed in future versions.

---

## Following a Target

Kaplay does not have a built-in `follow` camera method. Instead, update the camera position each frame in an `onUpdate` callback:

### Basic Follow (Instant Lock)

```typescript
const player = k.add([
  k.sprite('hero'),
  k.pos(100, 100),
  k.area(),
  k.body(),
]);

player.onUpdate(() => {
  k.setCamPos(player.pos);
});
```

### Smooth Follow (Lerp)

```typescript
player.onUpdate(() => {
  const current = k.getCamPos();
  const target = player.pos;
  const lerpSpeed = 0.1; // 0 = no movement, 1 = instant

  k.setCamPos(current.lerp(target, lerpSpeed));
});
```

### Look-Ahead Follow

For platformers, offset the camera in the direction the player is moving:

```typescript
let lookAheadX = 0;

player.onUpdate(() => {
  // Gradually shift look-ahead based on movement direction
  if (k.isKeyDown('right')) {
    lookAheadX = k.lerp(lookAheadX, 80, 0.05);
  } else if (k.isKeyDown('left')) {
    lookAheadX = k.lerp(lookAheadX, -80, 0.05);
  } else {
    lookAheadX = k.lerp(lookAheadX, 0, 0.05);
  }

  const target = player.pos.add(k.vec2(lookAheadX, -30));
  k.setCamPos(k.getCamPos().lerp(target, 0.08));
});
```

### Deadzone Follow

Only move the camera when the player exits a central rectangle:

```typescript
const DEADZONE_W = 200;
const DEADZONE_H = 120;

player.onUpdate(() => {
  const cam = k.getCamPos();
  const diff = player.pos.sub(cam);
  let newX = cam.x;
  let newY = cam.y;

  if (diff.x > DEADZONE_W / 2) newX = player.pos.x - DEADZONE_W / 2;
  if (diff.x < -DEADZONE_W / 2) newX = player.pos.x + DEADZONE_W / 2;
  if (diff.y > DEADZONE_H / 2) newY = player.pos.y - DEADZONE_H / 2;
  if (diff.y < -DEADZONE_H / 2) newY = player.pos.y + DEADZONE_H / 2;

  k.setCamPos(k.vec2(newX, newY).lerp(k.vec2(newX, newY), 0.15));
});
```

---

## Camera Bounds

Kaplay does not provide a built-in `setCamBounds()` function. Clamp the camera position manually after setting it:

```typescript
function clampCamera(worldWidth: number, worldHeight: number): void {
  const cam = k.getCamPos();
  const halfW = k.width() / 2;
  const halfH = k.height() / 2;

  const clampedX = Math.max(halfW, Math.min(worldWidth - halfW, cam.x));
  const clampedY = Math.max(halfH, Math.min(worldHeight - halfH, cam.y));

  k.setCamPos(k.vec2(clampedX, clampedY));
}

// Apply after following the player each frame
player.onUpdate(() => {
  k.setCamPos(k.getCamPos().lerp(player.pos, 0.1));
  clampCamera(3200, 1800);
});
```

### Bounds with Zoom

When zoomed in, the visible area shrinks, so adjust the half-dimensions:

```typescript
function clampCameraWithZoom(worldWidth: number, worldHeight: number): void {
  const cam = k.getCamPos();
  const scale = k.getCamScale();
  const halfW = (k.width() / 2) / scale.x;
  const halfH = (k.height() / 2) / scale.y;

  const clampedX = Math.max(halfW, Math.min(worldWidth - halfW, cam.x));
  const clampedY = Math.max(halfH, Math.min(worldHeight - halfH, cam.y));

  k.setCamPos(k.vec2(clampedX, clampedY));
}
```

---

## Zoom

```typescript
// Zoom in 2× (everything appears twice as large)
k.setCamScale(k.vec2(2, 2));

// Zoom out to see more of the world
k.setCamScale(k.vec2(0.5, 0.5));

// Smooth zoom transition
let currentZoom = 1;
const targetZoom = 2;

k.onUpdate(() => {
  currentZoom = k.lerp(currentZoom, targetZoom, 0.05);
  k.setCamScale(k.vec2(currentZoom, currentZoom));
});
```

> **Note:** `setCamScale` takes a `Vec2`, allowing non-uniform scaling (e.g., `vec2(2, 1)` stretches horizontally). For standard zoom, keep x and y equal.

---

## Rotation

```typescript
// Rotate camera 45 degrees (value in radians)
k.setCamRot(Math.PI / 4);

// Get current rotation
const rot = k.getCamRot();

// Smooth rotation over time
k.onUpdate(() => {
  k.setCamRot(k.lerp(k.getCamRot(), targetAngle, 0.05));
});
```

---

## Camera Effects

### Screen Shake

```typescript
// Shake the camera with the given intensity (pixels of displacement)
k.shake(12);
```

`shake()` applies random per-frame displacement that decays automatically. Call it once — do not call it every frame.

### Flash

```typescript
// Flash the screen white for a brief moment
k.flash(255, 255, 255); // r, g, b

// Flash with custom color (e.g., red for damage)
k.flash(255, 0, 0);
```

---

## Coordinate Conversion

Convert between screen-space (mouse/touch position) and world-space (game object positions):

```typescript
// Screen coordinates → World coordinates
const worldPos = k.toWorld(k.mousePos());

// World coordinates → Screen coordinates
const screenPos = k.toScreen(player.pos);
```

This is essential for:
- Click-to-move or click-to-place mechanics
- Drawing UI elements at world positions
- Raycasting from the mouse pointer into the game world

### Camera Transform Matrix

For advanced use cases, retrieve the full camera transform:

```typescript
const matrix = k.getCamTransform(); // Mat4
```

---

## Component-Based Camera & Viewport (v4000+)

Kaplay v4000 introduces a node-based camera system using `camera()` and `viewport()` components. This enables named cameras, multiple simultaneous viewports, and per-viewport post-processing.

### Named Cameras

```typescript
// Create a camera node — its world transform becomes the camera view
const mainCam = k.add([
  k.pos(400, 300),
  k.camera('main'),
]);

// Create a second camera
const overviewCam = k.add([
  k.pos(1600, 900),
  k.scale(0.25),
  k.camera('overview'),
]);
```

The camera component uses the node's global transform (position, rotation, scale) as the camera transform. Moving the node moves the camera.

### Viewports

```typescript
// Main viewport using the 'main' camera
const mainViewport = k.add([
  k.viewport('main', 800, 600),
  k.pos(0, 0),
]);

// Minimap viewport using the 'overview' camera
const minimap = k.add([
  k.viewport('overview', 200, 150),
  k.pos(590, 10),
]);
```

### Switching Cameras at Runtime

```typescript
// Dynamically switch which camera a viewport uses
mainViewport.camera = 'overview';   // Now shows the overview
mainViewport.camera = 'main';       // Switch back

// Set to null for the default camera
mainViewport.camera = null;
```

### Post-Processing per Viewport

Shader effects applied to a viewport node affect only that viewport's framebuffer:

```typescript
const mainViewport = k.add([
  k.viewport('main', 800, 600),
  k.shader('crt-effect'), // Only this viewport gets the CRT filter
]);
```

> **Deferred rendering:** Non-main viewports render to framebuffers first, then those framebuffers are composited onto the main viewport. This prevents recursive viewport rendering.

---

## Common Patterns

### Zelda-Style Room Transitions

```typescript
const ROOM_W = 800;
const ROOM_H = 600;
let currentRoom = k.vec2(0, 0);

player.onUpdate(() => {
  const newRoom = k.vec2(
    Math.floor(player.pos.x / ROOM_W),
    Math.floor(player.pos.y / ROOM_H)
  );

  if (!newRoom.eq(currentRoom)) {
    currentRoom = newRoom;
    // Camera target is room center
  }

  const roomCenter = k.vec2(
    currentRoom.x * ROOM_W + ROOM_W / 2,
    currentRoom.y * ROOM_H + ROOM_H / 2
  );

  k.setCamPos(k.getCamPos().lerp(roomCenter, 0.06));
});
```

### Boss Reveal Cutscene

```typescript
async function bossReveal(bossPos: Vec2): Promise<void> {
  // Stop player follow temporarily
  const savedPos = k.getCamPos();

  // Pan to boss over 2 seconds
  await k.tween(
    k.getCamPos(),
    bossPos,
    2,
    (val) => k.setCamPos(val),
    k.easings.easeInOutCubic
  );

  k.shake(8);
  await k.wait(1.5);

  // Pan back to player
  await k.tween(
    k.getCamPos(),
    player.pos,
    1.5,
    (val) => k.setCamPos(val),
    k.easings.easeInOutQuad
  );
}
```

### Damage Feedback

```typescript
function onPlayerHit(): void {
  k.shake(6);
  k.flash(255, 50, 50);
}
```

---

## Cross-Framework Comparison

| Feature | Kaplay | Phaser | PixiJS | Excalibur |
|---------|--------|--------|--------|-----------|
| Built-in camera | `setCamPos()` / `getCamPos()` | `this.cameras.main` | No built-in — Container transforms | `engine.currentScene.camera` |
| Follow target | Manual `onUpdate` + lerp | `cam.startFollow()` with lerp | Manual or pixi-viewport `follow()` | `camera.strategy.lockToActor()` |
| Bounds | Manual clamping | `cam.setBounds()` | Manual or pixi-viewport `clamp()` | `camera.strategy.limitCameraBounds()` |
| Zoom | `setCamScale()` | `cam.setZoom()` | `container.scale.set()` | `camera.zoom` |
| Built-in effects | `shake()`, `flash()` | Fade, flash, shake, pan, zoom, rotate | None — implement manually | `camera.shake()`, `camera.move()` |
| Multiple cameras | `camera()` + `viewport()` components (v4000+) | Native multi-camera system | Multiple Containers | Single camera with strategies |

---

## Performance Notes

- Camera position updates are cheap — the engine applies the transform globally before rendering.
- Avoid calling `setCamPos` multiple times per frame; compute the final position once and set it.
- `shake()` intensity decays automatically — calling it repeatedly before it finishes stacks the effect and can cause jarring motion.
- The v4000 viewport system renders non-main viewports to offscreen framebuffers, which has a GPU cost proportional to viewport size. Keep minimap viewports small.
- Coordinate conversion with `toWorld()` / `toScreen()` is very fast — use it freely for input handling.
