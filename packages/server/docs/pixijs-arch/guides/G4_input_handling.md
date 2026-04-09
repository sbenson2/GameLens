# G4 — PixiJS Input Handling

> **Category:** guide · **Engine:** PixiJS · **Related:** [E1 Architecture Overview](../architecture/E1_architecture_overview.md) · [G1 Asset Loading](G1_asset_loading.md) · [G3 Scene & State Management](G3_scene_state_management.md)

---

## Overview

PixiJS v8 provides a DOM-like federated event system for pointer (mouse + touch) interaction on display objects. Unlike full game engines, PixiJS does not include built-in keyboard or gamepad APIs — those are handled via standard DOM events or community libraries. This guide covers PixiJS's pointer event system in depth, keyboard and gamepad patterns, and practical recipes for common game input scenarios.

---

## Architecture: How Events Flow

```
Browser DOM Events (pointer, mouse, touch)
    ↓
EventSystem (attached to the renderer's canvas)
    ↓ hit tests against the scene graph
EventBoundary (manages hit testing + dispatch)
    ↓ bubbles through display hierarchy
Container / Sprite / Graphics  (eventMode ≠ 'none')
    ↓ listeners fire
Your event handlers (.on('pointerdown', ...))
```

The `EventSystem` captures raw DOM events on the canvas and translates them into `FederatedPointerEvent` objects. It then hit-tests against the display list via `EventBoundary`, walking from leaf nodes up to the stage. Events bubble up the display hierarchy just like DOM events, and you can stop propagation with `event.stopPropagation()`.

---

## Event Modes

Every `Container` (and subclass) has an `eventMode` property that controls how it participates in hit testing and event dispatch. Setting this correctly is critical for performance.

| Mode | Hit-Tested? | Emits Events? | Use Case |
|------|------------|--------------|----------|
| `'none'` | No | No | Non-interactive backgrounds, particle effects |
| `'passive'` | No | No (but interactive children still work) | Default — container that holds interactive children |
| `'auto'` | Only if parent is interactive | No | Legacy compat, rarely used |
| `'static'` | Yes | Yes | Buttons, UI elements, anything clickable that doesn't move |
| `'dynamic'` | Yes | Yes (+ mock move events from ticker) | Moving objects that need hover/pointer tracking |

### Performance Tip

Only display objects with `eventMode = 'static'` or `'dynamic'` are included in hit testing. Setting `eventMode = 'none'` on large non-interactive groups (backgrounds, tile layers, particle containers) can significantly improve input performance.

```typescript
import { Container, Sprite } from 'pixi.js';

// Background layer — skip entirely in hit tests
const background = new Container();
background.eventMode = 'none';

// UI layer — interactive buttons inside
const uiLayer = new Container();
uiLayer.eventMode = 'passive'; // children can be interactive

const button = new Sprite(buttonTexture);
button.eventMode = 'static'; // receives pointer events
button.cursor = 'pointer';   // changes CSS cursor on hover
```

---

## Pointer Events (Mouse + Touch)

PixiJS normalizes mouse and touch into a unified pointer API via `FederatedPointerEvent`. You write handlers once and they work on desktop and mobile.

### Basic Click/Tap

```typescript
import { Sprite } from 'pixi.js';

const playButton = new Sprite(playTexture);
playButton.eventMode = 'static';
playButton.cursor = 'pointer';

playButton.on('pointerdown', (event: FederatedPointerEvent) => {
  console.log(`Clicked at: ${event.globalX}, ${event.globalY}`);
  startGame();
});
```

### Available Pointer Events

| Event | Fires when |
|-------|-----------|
| `pointerdown` | Button pressed while pointer is over the object |
| `pointerup` | Button released while pointer is over the object |
| `pointerupoutside` | Button released after leaving the object (started on it) |
| `pointermove` | Pointer moves while over the object |
| `pointerover` | Pointer enters the object's hit area |
| `pointerout` | Pointer leaves the object's hit area |
| `pointertap` | Quick press + release (click/tap) |
| `globalpointermove` | Pointer moves anywhere (even off this object) |
| `wheel` | Mouse wheel scrolled while over the object |

### v8 Behavior Change — Move Events

In PixiJS v7, `pointermove` fired whenever the pointer moved anywhere on the canvas. In v8, `pointermove` only fires when the pointer is over the object. To get the old behavior (track movement everywhere), use `globalpointermove`:

```typescript
// Fires only when pointer is over this sprite
sprite.on('pointermove', (e) => { /* ... */ });

// Fires whenever the pointer moves anywhere on the canvas
sprite.on('globalpointermove', (e) => {
  crosshair.position.set(e.globalX, e.globalY);
});
```

### Hover Effects

```typescript
const menuItem = new Sprite(itemTexture);
menuItem.eventMode = 'static';
menuItem.cursor = 'pointer';

menuItem.on('pointerover', () => {
  menuItem.tint = 0xaaaaff;
  menuItem.scale.set(1.05);
});

menuItem.on('pointerout', () => {
  menuItem.tint = 0xffffff;
  menuItem.scale.set(1.0);
});
```

### Custom Hit Areas

By default, PixiJS hit-tests against the object's bounding rectangle. For non-rectangular shapes, provide a custom hit area:

```typescript
import { Sprite, Circle, Polygon } from 'pixi.js';

// Circular hit area
const orb = new Sprite(orbTexture);
orb.eventMode = 'static';
orb.hitArea = new Circle(0, 0, 48); // centerX, centerY, radius

// Polygonal hit area (triangle)
const gem = new Sprite(gemTexture);
gem.eventMode = 'static';
gem.hitArea = new Polygon([0, -32, 32, 32, -32, 32]);
```

---

## Drag and Drop

PixiJS does not have a built-in drag system, but it is straightforward to implement with pointer events:

```typescript
import { FederatedPointerEvent, Sprite } from 'pixi.js';

function makeDraggable(sprite: Sprite): void {
  sprite.eventMode = 'static';
  sprite.cursor = 'grab';

  let dragging = false;
  let dragOffset = { x: 0, y: 0 };

  sprite.on('pointerdown', (event: FederatedPointerEvent) => {
    dragging = true;
    sprite.cursor = 'grabbing';
    sprite.alpha = 0.8;

    // Store offset so the object doesn't snap to the pointer center
    dragOffset.x = sprite.x - event.globalX;
    dragOffset.y = sprite.y - event.globalY;

    // Listen globally so dragging works even when pointer leaves the object
    sprite.on('globalpointermove', onDragMove);
  });

  function onDragMove(event: FederatedPointerEvent): void {
    if (!dragging) return;
    sprite.x = event.globalX + dragOffset.x;
    sprite.y = event.globalY + dragOffset.y;
  }

  sprite.on('pointerup', endDrag);
  sprite.on('pointerupoutside', endDrag);

  function endDrag(): void {
    dragging = false;
    sprite.cursor = 'grab';
    sprite.alpha = 1.0;
    sprite.off('globalpointermove', onDragMove);
  }
}
```

---

## Keyboard Input

PixiJS does not provide a keyboard API. Use standard DOM `KeyboardEvent` listeners, wrapped in a small helper class for clean game integration:

```typescript
/**
 * Lightweight keyboard state tracker.
 * Tracks which keys are currently held and which were just pressed/released this frame.
 */
class Keyboard {
  private held = new Set<string>();
  private justPressed = new Set<string>();
  private justReleased = new Set<string>();

  constructor() {
    window.addEventListener('keydown', (e: KeyboardEvent) => {
      if (!this.held.has(e.code)) {
        this.justPressed.add(e.code);
      }
      this.held.add(e.code);
    });

    window.addEventListener('keyup', (e: KeyboardEvent) => {
      this.held.delete(e.code);
      this.justReleased.add(e.code);
    });
  }

  /** True while the key is held down (continuous) */
  isDown(code: string): boolean {
    return this.held.has(code);
  }

  /** True only on the frame the key was first pressed */
  wasPressed(code: string): boolean {
    return this.justPressed.has(code);
  }

  /** True only on the frame the key was released */
  wasReleased(code: string): boolean {
    return this.justReleased.has(code);
  }

  /** Call once per frame (at end of your game loop) to clear transient state */
  update(): void {
    this.justPressed.clear();
    this.justReleased.clear();
  }
}

// Usage with a PixiJS Ticker
const keyboard = new Keyboard();

app.ticker.add(() => {
  const speed = 5;
  if (keyboard.isDown('ArrowLeft') || keyboard.isDown('KeyA')) {
    player.x -= speed;
  }
  if (keyboard.isDown('ArrowRight') || keyboard.isDown('KeyD')) {
    player.x += speed;
  }
  if (keyboard.wasPressed('Space')) {
    player.jump();
  }

  keyboard.update(); // clear per-frame state
});
```

### Community Library: pixijs-input-devices

For production games, the [`pixijs-input-devices`](https://github.com/reececomo/pixijs-input-devices) library provides a more robust keyboard and gamepad API with features like input bindings, deadzone handling, and multi-device support:

```bash
npm install pixijs-input-devices
```

---

## Gamepad Input

Like keyboard, gamepads require using the browser's native Gamepad API. Here is a minimal wrapper:

```typescript
class GamepadInput {
  private pad: Gamepad | null = null;
  private deadzone = 0.15;

  update(): void {
    // Gamepad API requires polling — snapshot state each frame
    const gamepads = navigator.getGamepads();
    this.pad = gamepads[0] ?? null;
  }

  get connected(): boolean {
    return this.pad !== null;
  }

  /** Left stick X axis: -1 (left) to 1 (right), with deadzone applied */
  get leftStickX(): number {
    if (!this.pad) return 0;
    const val = this.pad.axes[0];
    return Math.abs(val) > this.deadzone ? val : 0;
  }

  /** Left stick Y axis: -1 (up) to 1 (down), with deadzone applied */
  get leftStickY(): number {
    if (!this.pad) return 0;
    const val = this.pad.axes[1];
    return Math.abs(val) > this.deadzone ? val : 0;
  }

  /** Check if a standard gamepad button is pressed (A=0, B=1, X=2, Y=3) */
  isButtonPressed(index: number): boolean {
    if (!this.pad) return false;
    return this.pad.buttons[index]?.pressed ?? false;
  }
}

// Usage
const gamepadInput = new GamepadInput();

app.ticker.add(() => {
  gamepadInput.update();

  if (gamepadInput.connected) {
    player.x += gamepadInput.leftStickX * 5;
    player.y += gamepadInput.leftStickY * 5;

    if (gamepadInput.isButtonPressed(0)) { // A button
      player.jump();
    }
  }
});
```

---

## Multi-Input Action Map

For production games, abstract raw input into named actions so your game logic is decoupled from specific devices:

```typescript
class InputActions {
  private keyboard: Keyboard;
  private gamepad: GamepadInput;

  constructor(keyboard: Keyboard, gamepad: GamepadInput) {
    this.keyboard = keyboard;
    this.gamepad = gamepad;
  }

  get moveX(): number {
    // Keyboard
    let x = 0;
    if (this.keyboard.isDown('ArrowLeft') || this.keyboard.isDown('KeyA')) x -= 1;
    if (this.keyboard.isDown('ArrowRight') || this.keyboard.isDown('KeyD')) x += 1;
    // Gamepad overrides if connected and active
    if (this.gamepad.connected && Math.abs(this.gamepad.leftStickX) > 0) {
      x = this.gamepad.leftStickX;
    }
    return x;
  }

  get moveY(): number {
    let y = 0;
    if (this.keyboard.isDown('ArrowUp') || this.keyboard.isDown('KeyW')) y -= 1;
    if (this.keyboard.isDown('ArrowDown') || this.keyboard.isDown('KeyS')) y += 1;
    if (this.gamepad.connected && Math.abs(this.gamepad.leftStickY) > 0) {
      y = this.gamepad.leftStickY;
    }
    return y;
  }

  get jumpPressed(): boolean {
    return this.keyboard.wasPressed('Space') || this.gamepad.isButtonPressed(0);
  }

  get shootPressed(): boolean {
    return this.keyboard.wasPressed('KeyJ') || this.gamepad.isButtonPressed(5);
  }
}
```

---

## Mobile Considerations

1. **Touch is a pointer.** PixiJS merges touch and mouse into the same `FederatedPointerEvent` — no extra code needed.
2. **No hover on mobile.** `pointerover` and `pointerout` events fire on `touchstart`/`touchend` on mobile, not on hover. Avoid designs that require hover for essential functionality.
3. **Multi-touch.** PixiJS tracks multiple pointers. Each touch gets a unique `pointerId`. If you need multi-touch (e.g., virtual joystick + fire button), track pointer IDs:

```typescript
const activePointers = new Map<number, { startX: number; startY: number }>();

app.stage.eventMode = 'static';
app.stage.hitArea = app.screen; // full-screen hit area

app.stage.on('pointerdown', (e: FederatedPointerEvent) => {
  activePointers.set(e.pointerId, { startX: e.globalX, startY: e.globalY });
});

app.stage.on('pointerup', (e: FederatedPointerEvent) => {
  activePointers.delete(e.pointerId);
});
```

4. **Prevent default.** To avoid the browser scrolling or zooming when the player touches the canvas, ensure the canvas has `touch-action: none` in CSS (PixiJS sets this by default on the canvas element).

---

## Comparison: Input Systems Across Frameworks

| Concept | PixiJS | Phaser | Kaplay | Excalibur |
|---------|--------|--------|--------|-----------|
| Pointer events | Built-in (FederatedEvent) | Built-in (Input Plugin) | Built-in (`onClick()`) | Built-in (Pointer API) |
| Keyboard | Not built-in (use DOM) | Built-in (Keyboard Plugin) | Built-in (`onKeyPress()`) | Built-in (`engine.input.keyboard`) |
| Gamepad | Not built-in (use DOM) | Built-in plugin | Built-in (`onGamepadButtonPress()`) | Built-in (`Gamepads` class) |
| Interactive opt-in | `eventMode = 'static'` | `setInteractive()` | `area()` component | `pointer.useGraphicsBounds` |
| Drag-and-drop | Manual (pointer events) | Built-in `{ draggable: true }` | Manual | Manual |
| Performance tuning | `eventMode: 'none'/'static'/'dynamic'` | N/A | N/A | N/A |

---

## Key Takeaways

1. **Set `eventMode` intentionally.** Use `'static'` for clickable UI, `'dynamic'` for moving objects that need hover detection, and `'none'` on everything else. This is the most impactful input optimization in PixiJS.
2. **Pointer events are your foundation.** Mouse and touch are unified — write handlers once. Use `globalpointermove` for cursor tracking or drag operations that go outside the object.
3. **Bring your own keyboard/gamepad.** PixiJS focuses on rendering. For keyboard and gamepad, build a thin wrapper around DOM events (shown above) or use `pixijs-input-devices`.
4. **Clear per-frame state.** If you track `wasPressed`/`wasReleased`, always clear those sets at the end of each ticker callback to avoid stale input.
5. **Abstract into actions.** An `InputActions` class that unifies keyboard, gamepad, and touch into semantic actions (`moveX`, `jumpPressed`) keeps game logic clean and makes adding new input devices trivial.
