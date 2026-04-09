# G4 — Excalibur Input Handling

> **Category:** guide · **Engine:** Excalibur · **Related:** [E1 Architecture Overview](../architecture/E1_architecture_overview.md) · [G1 Actors & Entities](G1_actors_and_entities.md) · [G2 Scene Management](G2_scene_management.md) · [G3 Physics & Collisions](G3_physics_and_collisions.md)

---

## Overview

Excalibur provides a comprehensive, built-in input system covering keyboard, pointer (mouse + touch), and gamepad. All input state is accessible through `engine.input` and can be queried during any `update()` cycle. Excalibur supports both polling (check state each frame) and event-driven (subscribe to callbacks) approaches, and includes a powerful `InputMapper` for abstracting raw input into named game actions.

This guide covers keyboard input, pointer events, gamepad support, the InputMapper system, and practical patterns for common game input scenarios.

---

## Architecture: Input Subsystems

```
Engine.input
    ├── .keyboard   → Keyboard state + events
    ├── .pointers   → Pointer (mouse + touch) state + events
    └── .gamepads   → Gamepad polling + events
```

All three subsystems update automatically each frame. You can query them in any Actor's `onPreUpdate()` / `onPostUpdate()`, in Scene update hooks, or via event subscriptions.

---

## Keyboard Input

### Polling (Recommended for Movement)

Excalibur tracks keyboard state across frames with three methods:

| Method | Returns `true` when |
|--------|-------------------|
| `isHeld(key)` | Key is currently pressed (persists across frames) |
| `wasPressed(key)` | Key was pressed this frame (cleared at end of frame) |
| `wasReleased(key)` | Key was released this frame (cleared at end of frame) |

```typescript
import { Actor, Engine, Keys } from 'excalibur';

class Player extends Actor {
  onPreUpdate(engine: Engine): void {
    const speed = 200;
    let vx = 0;
    let vy = 0;

    // isHeld — continuous movement while key is held down
    if (engine.input.keyboard.isHeld(Keys.A) || engine.input.keyboard.isHeld(Keys.Left)) {
      vx = -speed;
    }
    if (engine.input.keyboard.isHeld(Keys.D) || engine.input.keyboard.isHeld(Keys.Right)) {
      vx = speed;
    }
    if (engine.input.keyboard.isHeld(Keys.W) || engine.input.keyboard.isHeld(Keys.Up)) {
      vy = -speed;
    }
    if (engine.input.keyboard.isHeld(Keys.S) || engine.input.keyboard.isHeld(Keys.Down)) {
      vy = speed;
    }

    this.vel.x = vx;
    this.vel.y = vy;

    // wasPressed — one-shot actions (fires only on the frame the key goes down)
    if (engine.input.keyboard.wasPressed(Keys.Space)) {
      this.jump();
    }

    // wasReleased — e.g., release to fire a charged shot
    if (engine.input.keyboard.wasReleased(Keys.J)) {
      this.releaseChargedAttack();
    }
  }
}
```

### Key Enum

Excalibur provides the `Keys` enum for all standard keys. Common values:

```typescript
import { Keys } from 'excalibur';

Keys.A       // 'a' key
Keys.Space   // spacebar
Keys.Left    // left arrow
Keys.Escape  // escape
Keys.Enter   // enter/return
Keys.Shift   // shift
Keys.Digit1  // number row 1
```

### Event-Driven (Recommended for One-Shot Actions)

Subscribe to keyboard events for actions that should fire once:

```typescript
import { Engine, Keys } from 'excalibur';

const game = new Engine({ /* ... */ });

// 'press' fires on key down (once per press)
game.input.keyboard.on('press', (event) => {
  if (event.key === Keys.Escape) {
    togglePauseMenu();
  }
  if (event.key === Keys.E) {
    interactWithNearestNPC();
  }
});

// 'release' fires on key up
game.input.keyboard.on('release', (event) => {
  if (event.key === Keys.ShiftLeft) {
    stopSprinting();
  }
});

// 'hold' fires every frame a key is held — less common but available
game.input.keyboard.on('hold', (event) => {
  if (event.key === Keys.R) {
    chargePower += engine.elapsed;
  }
});
```

### Checking Multiple Keys

```typescript
// Check if ANY of several keys are held
function isMovingLeft(engine: Engine): boolean {
  return engine.input.keyboard.isHeld(Keys.A)
      || engine.input.keyboard.isHeld(Keys.Left);
}

// Check if ALL of several keys are held (combo)
function isDashAttack(engine: Engine): boolean {
  return engine.input.keyboard.isHeld(Keys.ShiftLeft)
      && engine.input.keyboard.wasPressed(Keys.J);
}

// Get all keys currently held
const heldKeys: Keys[] = engine.input.keyboard.getKeys();
```

---

## Pointer Input (Mouse + Touch)

Excalibur unifies mouse and touch into a single pointer API following the W3C Pointer Events spec. A click and a tap produce the same events.

### Scene-Level Pointer Events

```typescript
import { Engine, PointerButton } from 'excalibur';

const game = new Engine({ /* ... */ });

// Listen for clicks/taps anywhere in the scene
game.input.pointers.on('down', (event) => {
  console.log(`Pointer down at world: ${event.worldPos.x}, ${event.worldPos.y}`);
  console.log(`Screen coords: ${event.screenPos.x}, ${event.screenPos.y}`);

  // Distinguish mouse buttons
  if (event.button === PointerButton.Left) {
    shoot(event.worldPos);
  } else if (event.button === PointerButton.Right) {
    useAbility(event.worldPos);
  }
});

game.input.pointers.on('move', (event) => {
  crosshair.pos = event.worldPos;
});
```

### Actor-Level Pointer Events

Actors can receive pointer events when the pointer interacts with their bounding area:

```typescript
import { Actor, Engine, Vector, Color } from 'excalibur';

class Button extends Actor {
  constructor() {
    super({
      pos: new Vector(400, 300),
      width: 200,
      height: 60,
      color: Color.Blue,
    });

    // Enable pointer events on this actor
    this.pointer.useGraphicsBounds = true;

    this.on('pointerdown', () => {
      this.color = Color.Green;
      startGame();
    });

    this.on('pointerenter', () => {
      this.color = Color.Cyan;
      this.scale = new Vector(1.05, 1.05);
    });

    this.on('pointerleave', () => {
      this.color = Color.Blue;
      this.scale = new Vector(1, 1);
    });
  }
}
```

### Available Actor Pointer Events

| Event | Fires when |
|-------|-----------|
| `pointerdown` | Pointer button pressed while over the actor |
| `pointerup` | Pointer button released while over the actor |
| `pointermove` | Pointer moves while over the actor |
| `pointerenter` | Pointer enters the actor's bounds |
| `pointerleave` | Pointer leaves the actor's bounds |
| `pointercancel` | Pointer interaction is cancelled |

### Pointer Position Coordinates

Excalibur provides multiple coordinate systems on pointer events:

```typescript
game.input.pointers.on('down', (event) => {
  event.worldPos;   // position in world/game space (accounts for camera)
  event.screenPos;  // position relative to the canvas
  event.pagePos;    // position relative to the HTML page
});
```

Use `worldPos` for game logic (placing objects, shooting), `screenPos` for UI elements.

---

## Drag and Drop

Build drag-and-drop by combining pointer events on an actor:

```typescript
import { Actor, Engine, Vector, PointerEvent } from 'excalibur';

class DraggableItem extends Actor {
  private dragging = false;
  private dragOffset = Vector.Zero;

  onInitialize(): void {
    this.pointer.useGraphicsBounds = true;

    this.on('pointerdown', (event: PointerEvent) => {
      this.dragging = true;
      this.dragOffset = this.pos.sub(event.worldPos);
      this.z = 100; // bring to front
    });
  }

  onPreUpdate(engine: Engine): void {
    if (this.dragging) {
      const pointer = engine.input.pointers.primary;
      this.pos = pointer.lastWorldPos.add(this.dragOffset);
    }
  }

  onPostUpdate(): void {
    // Listen globally for pointer up (in case cursor leaves the actor)
    if (this.dragging && !this.scene!.engine.input.pointers.isDown(0)) {
      this.dragging = false;
      this.z = 0;
      this.snapToGrid();
    }
  }

  private snapToGrid(): void {
    const gridSize = 32;
    this.pos.x = Math.round(this.pos.x / gridSize) * gridSize;
    this.pos.y = Math.round(this.pos.y / gridSize) * gridSize;
  }
}
```

---

## Gamepad Input

Excalibur wraps the HTML5 Gamepad API with a clean polling and event-based interface. It supports up to 4 connected gamepads.

### Enabling Gamepads

Gamepad support is enabled automatically when you subscribe to gamepad events. You can also enable it explicitly:

```typescript
import { Engine } from 'excalibur';

const game = new Engine({ /* ... */ });

// Option A: explicitly enable polling
game.input.gamepads.enabled = true;

// Option B: subscribing to events auto-enables
game.input.gamepads.on('connect', (event) => {
  console.log(`Gamepad connected: ${event.gamepad.id}`);
});
```

### Reading Gamepad State

```typescript
import { Engine, Buttons, Axes } from 'excalibur';

class Player extends Actor {
  onPreUpdate(engine: Engine): void {
    const pad = engine.input.gamepads.at(0); // first gamepad
    if (!pad.connected) return;

    // Sticks — returns -1 to 1
    const deadzone = 0.15;
    const lx = pad.getAxes(Axes.LeftStickX);
    const ly = pad.getAxes(Axes.LeftStickY);

    if (Math.abs(lx) > deadzone) this.vel.x = lx * 200;
    else this.vel.x = 0;

    if (Math.abs(ly) > deadzone) this.vel.y = ly * 200;
    else this.vel.y = 0;

    // Buttons — polling
    if (pad.isButtonPressed(Buttons.Face1)) { // A button
      this.jump();
    }

    // Right trigger (pressure-sensitive: 0 to 1)
    const rt = pad.getButton(Buttons.RightTrigger);
    if (rt > 0.5) {
      this.shoot();
    }
  }
}
```

### Gamepad Button Map (Standard Layout)

| Button | Excalibur Enum | Xbox | PlayStation |
|--------|---------------|------|-------------|
| `Buttons.Face1` | A | A | Cross |
| `Buttons.Face2` | B | B | Circle |
| `Buttons.Face3` | X | X | Square |
| `Buttons.Face4` | Y | Y | Triangle |
| `Buttons.LeftBumper` | LB | LB | L1 |
| `Buttons.RightBumper` | RB | RB | R1 |
| `Buttons.LeftTrigger` | LT | LT | L2 |
| `Buttons.RightTrigger` | RT | RT | R2 |
| `Buttons.Select` | Back/Select | Back | Share |
| `Buttons.Start` | Start/Menu | Menu | Options |
| `Buttons.LeftStick` | L3 | L3 | L3 |
| `Buttons.RightStick` | R3 | R3 | R3 |
| `Buttons.DpadUp/Down/Left/Right` | D-pad | D-pad | D-pad |

### Gamepad Events

```typescript
const pad = engine.input.gamepads.at(0);

pad.on('button', (event) => {
  if (event.button === Buttons.Start && event.value === 1) {
    togglePauseMenu();
  }
});

pad.on('axis', (event) => {
  if (event.axis === Axes.RightStickX) {
    aimDirection.x = event.value;
  }
});
```

---

## InputMapper — Action Abstraction

Excalibur provides a built-in `InputMapper` class that maps raw input from any device to named actions. This is the recommended approach for production games.

```typescript
import { Engine, InputMapper, Keys, Buttons, Axes, Gamepad } from 'excalibur';

const game = new Engine({ /* ... */ });

const inputMapper = new InputMapper({
  keyboard: game.input.keyboard,
  pointers: game.input.pointers,
  gamepads: game.input.gamepads,
});

// Define actions with multi-device bindings
inputMapper.on(({ keyboard, gamepads }) => {
  const pad = gamepads.at(0);
  const speed = 200;

  // Movement — keyboard OR left stick
  let moveX = 0;
  let moveY = 0;

  if (keyboard.isHeld(Keys.A) || keyboard.isHeld(Keys.Left)) moveX -= 1;
  if (keyboard.isHeld(Keys.D) || keyboard.isHeld(Keys.Right)) moveX += 1;
  if (keyboard.isHeld(Keys.W) || keyboard.isHeld(Keys.Up)) moveY -= 1;
  if (keyboard.isHeld(Keys.S) || keyboard.isHeld(Keys.Down)) moveY += 1;

  if (pad.connected) {
    const lx = pad.getAxes(Axes.LeftStickX);
    const ly = pad.getAxes(Axes.LeftStickY);
    if (Math.abs(lx) > 0.15) moveX = lx;
    if (Math.abs(ly) > 0.15) moveY = ly;
  }

  player.vel.x = moveX * speed;
  player.vel.y = moveY * speed;

  // Jump — spacebar OR A button
  if (keyboard.wasPressed(Keys.Space) || pad.isButtonPressed(Buttons.Face1)) {
    player.jump();
  }

  // Pause — Escape OR Start button
  if (keyboard.wasPressed(Keys.Escape) || pad.isButtonPressed(Buttons.Start)) {
    togglePause();
  }
});
```

---

## Common Patterns

### Pattern 1: Platformer Controls

```typescript
import { Actor, Engine, Keys, CollisionType } from 'excalibur';

class PlatformerPlayer extends Actor {
  private isOnGround = false;
  private coyoteTime = 0;
  private jumpBufferTime = 0;

  constructor() {
    super({
      width: 32,
      height: 48,
      collisionType: CollisionType.Active,
    });

    // Detect ground contact via collisions
    this.on('postcollision', (event) => {
      // If the collision normal points up, we're on the ground
      if (event.contact.normal.y < -0.5) {
        this.isOnGround = true;
        this.coyoteTime = 0.1; // 100ms window after leaving ground
      }
    });
  }

  onPreUpdate(engine: Engine, delta: number): void {
    const kb = engine.input.keyboard;
    const speed = 250;

    // Horizontal movement
    this.vel.x = 0;
    if (kb.isHeld(Keys.A) || kb.isHeld(Keys.Left)) this.vel.x = -speed;
    if (kb.isHeld(Keys.D) || kb.isHeld(Keys.Right)) this.vel.x = speed;

    // Coyote time countdown
    if (!this.isOnGround && this.coyoteTime > 0) {
      this.coyoteTime -= delta / 1000;
    }

    // Jump buffer: remember jump intent for a short window
    if (kb.wasPressed(Keys.Space)) {
      this.jumpBufferTime = 0.08; // 80ms buffer
    }
    if (this.jumpBufferTime > 0) {
      this.jumpBufferTime -= delta / 1000;
    }

    // Execute jump if grounded (or coyote) AND jump was recently pressed
    if ((this.isOnGround || this.coyoteTime > 0) && this.jumpBufferTime > 0) {
      this.vel.y = -500;
      this.isOnGround = false;
      this.coyoteTime = 0;
      this.jumpBufferTime = 0;
    }

    // Variable jump height: release early to jump shorter
    if (kb.wasReleased(Keys.Space) && this.vel.y < -200) {
      this.vel.y = -200;
    }

    // Reset ground state (re-set each frame by collisions)
    this.isOnGround = false;
  }
}
```

### Pattern 2: Click-to-Move (Strategy/RPG)

```typescript
import { Actor, Engine, Vector, Color } from 'excalibur';

class ClickToMovePlayer extends Actor {
  private targetPos: Vector | null = null;
  private moveSpeed = 150;

  onInitialize(engine: Engine): void {
    engine.input.pointers.on('down', (event) => {
      this.targetPos = event.worldPos.clone();
      // Optionally show a movement indicator
      showMoveIndicator(this.targetPos);
    });
  }

  onPreUpdate(engine: Engine): void {
    if (!this.targetPos) return;

    const direction = this.targetPos.sub(this.pos);
    const distance = direction.size;

    if (distance < 4) {
      // Close enough — stop
      this.vel = Vector.Zero;
      this.targetPos = null;
    } else {
      this.vel = direction.normalize().scale(this.moveSpeed);
    }
  }
}
```

### Pattern 3: Twin-Stick Shooter (Keyboard + Mouse Aim)

```typescript
class TwinStickPlayer extends Actor {
  onPreUpdate(engine: Engine): void {
    const kb = engine.input.keyboard;
    const speed = 250;

    // WASD movement
    let vx = 0, vy = 0;
    if (kb.isHeld(Keys.A)) vx -= speed;
    if (kb.isHeld(Keys.D)) vx += speed;
    if (kb.isHeld(Keys.W)) vy -= speed;
    if (kb.isHeld(Keys.S)) vy += speed;
    this.vel.x = vx;
    this.vel.y = vy;

    // Aim toward mouse
    const mouseWorld = engine.input.pointers.primary.lastWorldPos;
    const aimDir = mouseWorld.sub(this.pos);
    this.rotation = Math.atan2(aimDir.y, aimDir.x);

    // Fire on click
    if (engine.input.pointers.isDown(0)) {
      this.fireBullet(aimDir.normalize());
    }
  }

  private fireBullet(direction: Vector): void {
    // throttle, spawn projectile, etc.
  }
}
```

---

## Mobile Considerations

1. **Touch is a pointer.** Excalibur merges touch and mouse — no extra code needed. `pointers.primary` works for both.
2. **No hover on mobile.** `pointerenter` and `pointerleave` fire on touch start/end, not on hover. Design UI that works without hover states.
3. **Multi-touch.** Access additional pointers via `engine.input.pointers.at(1)`, etc. Useful for virtual joysticks or multi-finger gestures.
4. **Prevent scrolling.** Excalibur's canvas should have `touch-action: none` in CSS to prevent the browser from scrolling or zooming when the player touches the game.

---

## Comparison: Input Systems Across Frameworks

| Concept | Excalibur | Phaser | Kaplay | PixiJS |
|---------|-----------|--------|--------|--------|
| Keyboard polling | `keyboard.isHeld()` / `wasPressed()` | `key.isDown` / `JustDown()` | `isKeyDown()` / `onKeyPress()` | Not built-in (use DOM) |
| Keyboard events | `keyboard.on('press')` | `keyboard.on('keydown-X')` | `onKeyPress('x', fn)` | Not built-in (use DOM) |
| Pointer unified | Yes (mouse + touch) | Yes (mouse + touch) | Yes (mouse + touch) | Yes (FederatedEvent) |
| Actor pointer events | `this.on('pointerdown')` | `setInteractive()` + events | `area()` + `onClick()` | `eventMode = 'static'` + events |
| Gamepad | Built-in (`Gamepads` class) | Built-in plugin | Built-in (`onGamepadButtonPress`) | Not built-in |
| Input abstraction | Built-in `InputMapper` | Manual | Manual | Manual |
| Drag-and-drop | Manual (pointer events) | Built-in `{ draggable: true }` | Manual | Manual |

---

## Key Takeaways

1. **Poll in `onPreUpdate`, react with events.** Use `isHeld()` for continuous movement in update loops. Use `wasPressed()` or event subscriptions for one-shot actions like jumping or interacting.
2. **`wasPressed` vs `isHeld` matters.** `wasPressed()` is true for exactly one frame. `isHeld()` is true every frame the key is down. Mixing them up causes missed inputs or repeated actions.
3. **Use `worldPos` for game logic.** Pointer events provide `worldPos` (camera-adjusted) and `screenPos` (canvas-relative). Always use `worldPos` for gameplay interactions.
4. **Gamepad needs opt-in.** Either set `gamepads.enabled = true` or subscribe to gamepad events to begin polling.
5. **Deadzone your sticks.** Analog sticks rest near 0 but not exactly 0. Use a 0.1–0.2 threshold to filter noise.
6. **Use InputMapper for multi-device support.** Rather than checking keyboard, mouse, and gamepad separately throughout your code, centralize input into named actions via `InputMapper`.
