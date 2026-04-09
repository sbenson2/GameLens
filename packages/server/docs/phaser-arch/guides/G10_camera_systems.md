# G10 — Phaser 3 Camera Systems & Effects

> **Category:** guide · **Engine:** Phaser · **Related:** [E1 Architecture Overview](../architecture/E1_architecture_overview.md) · [G1 Scene Lifecycle](G1_scene_lifecycle.md) · [G3 Input Handling](G3_input_handling.md)

---

## Overview

Cameras are how players see your game world. Every Phaser scene has at least one camera (`this.cameras.main`), and a scene with no camera renders nothing. A camera has two independent concepts: a **viewport** (the rectangle on the canvas where it draws) and a **scroll position** (which part of the game world is visible through that viewport).

This guide covers camera creation, following targets, bounds, deadzones, zoom, rotation, built-in effects, multiple camera setups, and common patterns for platformers, RPGs, and UI overlays.

---

## Accessing & Creating Cameras

Every scene starts with a default main camera that fills the entire game canvas:

```typescript
export class GameScene extends Phaser.Scene {
  create() {
    // The main camera — always exists
    const cam = this.cameras.main;

    // Create an additional camera (x, y, width, height)
    const minimap = this.cameras.add(10, 10, 200, 200, false, 'minimap');

    // Retrieve by name later
    const mm = this.cameras.getCamera('minimap');
  }
}
```

**Key rules:**
- A scene always has at least one camera. Removing the last one will cause nothing to render.
- Cameras are recreated when a scene restarts — do not store references across scene lifecycles.
- The fifth parameter (`makeMain`) controls whether the new camera replaces `this.cameras.main`.

---

## Viewport vs. World View

### Viewport (Canvas Space)

The viewport defines where the camera draws on the HTML canvas:

```typescript
// Position the camera's viewport
cam.setViewport(100, 50, 640, 480);

// Or set individually
cam.setPosition(100, 50);
cam.setSize(640, 480);

// Read back
console.log(cam.x, cam.y, cam.width, cam.height);
console.log(cam.centerX, cam.centerY); // center of the viewport
```

### World View (Game World Space)

The world view is the rectangle of game-world coordinates currently visible:

```typescript
const wv = cam.worldView;
console.log(wv.x, wv.y, wv.width, wv.height);
console.log(wv.left, wv.right, wv.top, wv.bottom);

// Center point of what the camera sees in world coords
console.log(cam.midPoint.x, cam.midPoint.y);
```

> **Gotcha:** `midPoint` and `worldView` are not populated until the first render pass. If you need them during `create()`, call `cam.preRender()` first.

---

## Scrolling & Centering

Move the camera's view of the world by changing scroll values:

```typescript
// Direct scroll
cam.scrollX = 500;
cam.scrollY = 200;
cam.setScroll(500, 200);

// Center the camera on a world coordinate
cam.centerOn(1200, 600);
cam.centerOnX(1200);  // horizontal only
cam.centerOnY(600);   // vertical only
```

Scrolling has no effect on the viewport position, and viewport changes do not affect scrolling — they are fully independent.

---

## Following a Target

The most common camera pattern: track a player character.

```typescript
create() {
  this.player = this.physics.add.sprite(100, 100, 'hero');
  const cam = this.cameras.main;

  // Basic follow — camera snaps to the player instantly
  cam.startFollow(this.player);

  // Smooth follow with lerp (0 = no movement, 1 = instant snap)
  cam.startFollow(this.player, false, 0.1, 0.1);

  // Follow with offset (camera looks ahead of the player)
  cam.startFollow(this.player);
  cam.setFollowOffset(-100, 0); // camera shifted 100px right of player

  // Stop following
  cam.stopFollow();
}
```

### Lerp Values Explained

The `lerpX` and `lerpY` parameters (3rd and 4th arguments) control how quickly the camera catches up to the target:

| Value | Behavior | Best For |
|-------|----------|----------|
| `1.0` | Instant lock — no smoothing | Tile-based games, menus |
| `0.1` | Gradual, cinematic tracking | Platformers, adventure games |
| `0.05` | Very slow, drifty follow | Atmospheric exploration |

```typescript
// Different horizontal and vertical smoothing
// Faster horizontal, slower vertical — good for platformers
cam.startFollow(this.player, false, 0.15, 0.08);
```

### Follow Update Event

React when the camera updates its follow position:

```typescript
cam.on('followupdate', (camera: Phaser.Cameras.Scene2D.Camera, target: Phaser.GameObjects.GameObject) => {
  // Custom logic — e.g., parallax layer sync
});
```

---

## Bounds

Bounds prevent the camera from scrolling beyond the edges of your game world:

```typescript
create() {
  const cam = this.cameras.main;

  // Restrict camera to a 3200×1800 world starting at (0, 0)
  cam.setBounds(0, 0, 3200, 1800);

  // Check current bounds
  const bounds = cam.getBounds(); // returns a Phaser.Geom.Rectangle

  // Temporarily disable bounds without removing them
  cam.useBounds = false;

  // Remove bounds entirely
  cam.removeBounds();
}
```

**Important:** If the bounds area is smaller than the camera viewport, the camera cannot scroll at all — it will be locked in place. This is intentional and useful for fixed-screen rooms.

### Common Bounds Pattern — Tilemap World

```typescript
create() {
  const map = this.make.tilemap({ key: 'level1' });
  const cam = this.cameras.main;

  // Set camera bounds to match the tilemap dimensions
  cam.setBounds(0, 0, map.widthInPixels, map.heightInPixels);
  cam.startFollow(this.player, false, 0.1, 0.1);
}
```

---

## Deadzones

A deadzone is a rectangular area in the center of the viewport. While the followed target stays inside this rectangle, the camera does not scroll. The camera only moves when the target exits the deadzone.

```typescript
create() {
  const cam = this.cameras.main;
  cam.startFollow(this.player);

  // Deadzone: 200px wide, 150px tall centered in the viewport
  cam.setDeadzone(200, 150);

  // Read deadzone edges
  console.log(cam.deadzone.left, cam.deadzone.right, cam.deadzone.top, cam.deadzone.bottom);

  // Clear the deadzone
  cam.setDeadzone();
}
```

### When to Use Deadzones

| Game Type | Deadzone Strategy |
|-----------|------------------|
| Platformer | Wide horizontal deadzone (player moves freely left/right before camera follows), narrow vertical |
| Top-down RPG | Equal width/height deadzone for comfortable exploration |
| Dialogue / cutscene | Disable follow entirely; use `pan()` effect instead |

```typescript
// Platformer-style deadzone: wide horizontal, tight vertical
cam.setDeadzone(300, 80);
```

---

## Zoom

Zoom scales what the camera sees. Values above 1 zoom in (pixels appear larger); values below 1 zoom out (more world is visible).

```typescript
cam.setZoom(2);     // 2× zoom — each world pixel is 2 canvas pixels
cam.setZoom(0.5);   // 0.5× zoom — see twice as much of the world
cam.zoom = 1.5;     // direct property access works too
```

> **Warning:** Never set zoom to `0`. The minimum safe value is `0.001`.

### Zoom + Bounds Interaction

When zoomed in, bounds still constrain scrolling — the camera won't reveal empty space beyond the bounds even at high zoom. When zoomed out, more of the world is visible, so the effective scroll range shrinks.

---

## Rotation

Rotate the camera around its origin point:

```typescript
// Set rotation in degrees
cam.setAngle(45);

// Set rotation in radians
cam.setRotation(Math.PI / 4);

// Read back
console.log(cam.rotation); // always in radians

// Change the rotation pivot (default: 0.5, 0.5 = center)
cam.setOrigin(0, 0);     // rotate around top-left
cam.setOrigin(0.5, 0.5); // rotate around center (default)
```

---

## Camera Effects

Phaser cameras have six built-in timed effects. Each effect can run independently and fires events on start and completion.

### Fade

```typescript
// Fade to black over 1000ms
cam.fadeOut(1000, 0, 0, 0); // duration, r, g, b

// Fade back in
cam.fadeIn(1000, 0, 0, 0);

// With callback
cam.fadeOut(1000, 0, 0, 0, (camera, progress) => {
  if (progress === 1) {
    this.scene.start('NextScene');
  }
});

// Or use the event
cam.once('camerafadeoutcomplete', () => {
  this.scene.start('NextScene');
});
```

### Flash

```typescript
// White flash for 500ms
cam.flash(500, 255, 255, 255);

// Flash with completion callback
cam.flash(250, 255, 0, 0, false, (camera, progress) => {
  // Red flash — e.g., player took damage
});
```

### Shake

```typescript
// Shake for 300ms at default intensity (0.05)
cam.shake(300);

// Stronger shake
cam.shake(500, 0.02); // lower = subtler, higher = more violent

// Directional shake (custom intensity per axis not directly supported,
// but you can tween scrollX/scrollY for custom shake patterns)
```

### Pan

```typescript
// Smoothly pan the camera to a world position
cam.pan(1200, 800, 2000, 'Power2'); // x, y, duration, ease

// Pan fires events
cam.once('camerapancomplete', () => {
  // Cutscene finished — resume player follow
  cam.startFollow(this.player, false, 0.1, 0.1);
});
```

> **Note:** `pan()` temporarily overrides `startFollow`. After the pan completes, re-call `startFollow` if you want the camera to track the player again.

### Zoom Effect (Animated)

```typescript
// Smoothly zoom to 2× over 1000ms
cam.zoomTo(2, 1000, 'Sine.easeInOut');

// Zoom back out
cam.zoomTo(1, 800);

cam.once('camerazoomcomplete', () => {
  // Zoom finished
});
```

### Rotate Effect (Animated)

```typescript
// Rotate to 45 degrees over 2000ms
cam.rotateTo(Phaser.Math.DegToRad(45), false, 2000, 'Cubic.easeInOut');
```

### Effect Rules

- Most effects will **not interrupt** an already-running effect of the same type unless you pass `force = true`.
- Reset an individual effect: `cam.fadeEffect.reset()`, `cam.shakeEffect.reset()`, etc.
- Reset all effects at once: `cam.resetFX()`.
- Check if an effect is running: `cam.fadeEffect.isRunning`, `cam.shakeEffect.progress`.
- Do **not** call effects inside `update()` — they are one-shot triggers, not per-frame operations.

---

## Multiple Cameras

### Split-Screen

```typescript
create() {
  // Player 1 camera — left half
  const cam1 = this.cameras.main;
  cam1.setViewport(0, 0, 512, 600);
  cam1.startFollow(this.player1);

  // Player 2 camera — right half
  const cam2 = this.cameras.add(512, 0, 512, 600);
  cam2.startFollow(this.player2);

  // Both cameras share the same world bounds
  cam1.setBounds(0, 0, 3200, 1800);
  cam2.setBounds(0, 0, 3200, 1800);
}
```

### UI Camera Overlay

A common pattern: use one camera for the game world and another for the HUD that never scrolls:

```typescript
create() {
  // Main game camera follows the player
  const gameCam = this.cameras.main;
  gameCam.startFollow(this.player);

  // UI camera — fixed, ignores game world objects
  const uiCam = this.cameras.add(0, 0, 1024, 600, false, 'uiCam');
  uiCam.ignore(this.worldGroup); // don't render game objects on UI camera

  // Game camera ignores UI elements
  gameCam.ignore(this.uiGroup);
}
```

### Minimap Camera

```typescript
create() {
  // Minimap in top-right corner
  const minimap = this.cameras.add(790, 10, 200, 150, false, 'minimap');
  minimap.setZoom(0.1);
  minimap.startFollow(this.player);
  minimap.setBackgroundColor('rgba(0, 0, 0, 0.5)');

  // Optionally ignore certain objects from the minimap
  minimap.ignore(this.particles);
}
```

---

## Coordinate Conversion

Convert between screen (pointer) coordinates and world coordinates:

```typescript
// Screen → World (e.g., where did the player click in the world?)
const worldPoint = cam.getWorldPoint(pointer.x, pointer.y);
console.log(worldPoint.x, worldPoint.y);

// This accounts for camera scroll, zoom, and rotation.
```

This is essential for click-to-move games, placing objects at the cursor position, or raycasting in a zoomed/scrolled scene.

---

## Pixel Rounding

Sub-pixel rendering can cause blurry sprites, especially in pixel-art games:

```typescript
// Enable pixel rounding on the camera
cam.setRoundPixels(true);

// Or set it in the game config for all cameras
const config: Phaser.Types.Core.GameConfig = {
  pixelArt: true,       // sets roundPixels + disables antialiasing globally
  roundPixels: true,    // just rounding, no other pixel-art settings
};
```

---

## Ignoring Game Objects

Control which objects each camera renders:

```typescript
// Single object
cam.ignore(this.backgroundLayer);

// Array of objects
cam.ignore([this.sky, this.clouds, this.uiText]);

// Entire group
cam.ignore(this.uiGroup);
```

This is critical for multi-camera setups where different cameras show different layers.

---

## Common Patterns

### Scene Transition with Fade

```typescript
exitToNextLevel() {
  this.cameras.main.fadeOut(500, 0, 0, 0);
  this.cameras.main.once('camerafadeoutcomplete', () => {
    this.scene.start('Level2', { score: this.score });
  });
}
```

### Boss Reveal Pan

```typescript
triggerBossIntro() {
  const cam = this.cameras.main;
  cam.stopFollow();
  cam.pan(this.boss.x, this.boss.y, 2000, 'Cubic.easeInOut');
  cam.zoomTo(1.5, 2000, 'Cubic.easeInOut');

  cam.once('camerapancomplete', () => {
    cam.zoomTo(1, 1000, 'Sine.easeOut');
    cam.once('camerazoomcomplete', () => {
      cam.startFollow(this.player, false, 0.1, 0.1);
    });
  });
}
```

### Damage Feedback

```typescript
onPlayerHit() {
  this.cameras.main.shake(150, 0.01);
  this.cameras.main.flash(100, 255, 50, 50);
}
```

---

## Cross-Framework Comparison

| Feature | Phaser | PixiJS | Kaplay | Excalibur |
|---------|--------|--------|--------|-----------|
| Built-in camera | `this.cameras.main` | No built-in — manual viewport transforms | `camPos()` / `camScale()` | `engine.currentScene.camera` |
| Follow target | `cam.startFollow()` with lerp | Manual position tracking | `camPos(target.pos)` per frame | `camera.strategy.lockToActor()` |
| Bounds | `cam.setBounds()` | Manual clamping | `setCamBounds()` (plugin) | `camera.strategy.limitCameraBounds()` |
| Built-in effects | Fade, flash, shake, pan, zoom, rotate | None — use tweens/filters | `shake()`, `flash()` functions | `camera.shake()`, zoom via strategy |
| Multiple cameras | Native multi-camera system | Multiple Containers as viewports | Single camera only | Single camera with strategies |

---

## Performance Notes

- Each additional camera multiplies the render cost — the entire visible scene is rendered once per camera.
- Use `cam.ignore()` aggressively to skip objects that a camera doesn't need to render.
- Disable cameras you're not using: `cam.setVisible(false)` skips both rendering and input tests.
- Prefer built-in effects over per-frame `update()` manipulation — they use internal timers and are optimized.
