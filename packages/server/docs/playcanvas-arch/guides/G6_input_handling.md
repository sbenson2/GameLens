# G6 — Input Handling & Controls

> **Category:** guide · **Engine:** PlayCanvas · **Related:** [Architecture Overview](../architecture/E1_architecture_overview.md), [Scripting System](G1_scripting_system.md), [PlayCanvas Input Docs](https://developer.playcanvas.com/user-manual/user-interface/input/), [Keyboard API](https://api.playcanvas.com/engine/classes/Keyboard.html)

PlayCanvas provides input APIs for keyboard, mouse, touch, and gamepad. Each device type has its own class, all accessed through the `Application` instance. This guide covers setup, polling, events, and cross-device patterns for game controls.

---

## Input Device Access

PlayCanvas attaches input handlers to the `Application` object. In a script component, access them via `this.app`:

```typescript
import { Script, KEY_SPACE, MOUSEBUTTON_LEFT } from 'playcanvas';

class PlayerController extends Script {
  update(dt: number): void {
    // Keyboard
    if (this.app.keyboard.isPressed(KEY_SPACE)) {
      this.jump();
    }

    // Mouse
    if (this.app.mouse.isPressed(MOUSEBUTTON_LEFT)) {
      this.shoot();
    }
  }

  private jump(): void { /* ... */ }
  private shoot(): void { /* ... */ }
}
```

---

## Keyboard Input

The `Keyboard` class tracks key states and fires events. Two query modes:

### Polling (in update loop)

```typescript
import { Script, KEY_W, KEY_A, KEY_S, KEY_D, KEY_SPACE } from 'playcanvas';

class Movement extends Script {
  speed = 5;

  update(dt: number): void {
    const kb = this.app.keyboard;
    const move = { x: 0, z: 0 };

    // isPressed — true every frame while held
    if (kb.isPressed(KEY_W)) move.z -= 1;
    if (kb.isPressed(KEY_S)) move.z += 1;
    if (kb.isPressed(KEY_A)) move.x -= 1;
    if (kb.isPressed(KEY_D)) move.x += 1;

    if (move.x !== 0 || move.z !== 0) {
      this.entity.translateLocal(
        move.x * this.speed * dt,
        0,
        move.z * this.speed * dt
      );
    }

    // wasPressed — true only on the frame the key goes down
    if (kb.wasPressed(KEY_SPACE)) {
      this.jump();
    }
  }
}
```

**Key difference:** `isPressed()` returns `true` every frame while held. `wasPressed()` returns `true` only once, on the frame the key was first pressed. Use `wasPressed()` for discrete actions (jump, interact) and `isPressed()` for continuous input (movement, aiming).

### Event-Based

```typescript
import { Script, EVENT_KEYDOWN, EVENT_KEYUP, KEY_ESCAPE } from 'playcanvas';

class PauseMenu extends Script {
  initialize(): void {
    this.app.keyboard.on(EVENT_KEYDOWN, this.onKeyDown, this);
  }

  private onKeyDown(event: { key: number }): void {
    if (event.key === KEY_ESCAPE) {
      this.togglePause();
    }

    // Prevent browser default (e.g., F5 refresh)
    event.event?.preventDefault();
  }

  destroy(): void {
    this.app.keyboard.off(EVENT_KEYDOWN, this.onKeyDown, this);
  }
}
```

Always clean up event listeners in `destroy()` to prevent memory leaks when entities are removed.

---

## Mouse Input

The `Mouse` class tracks button state and cursor position:

```typescript
import {
  Script, MOUSEBUTTON_LEFT, MOUSEBUTTON_RIGHT,
  EVENT_MOUSEDOWN, EVENT_MOUSEMOVE,
} from 'playcanvas';

class CameraLook extends Script {
  sensitivity = 0.2;

  initialize(): void {
    // Lock pointer for FPS-style camera
    this.app.mouse.on(EVENT_MOUSEDOWN, () => {
      this.app.mouse.enablePointerLock();
    });

    this.app.mouse.on(EVENT_MOUSEMOVE, this.onMouseMove, this);
  }

  private onMouseMove(event: { dx: number; dy: number }): void {
    // dx/dy are raw pixel deltas — use for camera rotation
    this.entity.rotateLocal(-event.dy * this.sensitivity, 0, 0);
    this.entity.parent?.rotateLocal(0, -event.dx * this.sensitivity, 0);
  }

  destroy(): void {
    this.app.mouse.off(EVENT_MOUSEMOVE, this.onMouseMove, this);
  }
}
```

### Pointer Lock

`enablePointerLock()` hides the cursor and provides raw movement deltas — essential for FPS and third-person camera controls. The browser requires a user gesture (click) before granting pointer lock.

### Mouse Position

For UI interactions or cursor-based gameplay:

```typescript
// Screen coordinates (pixels)
const x = event.x;
const y = event.y;

// Raycasting from mouse position
const from = camera.camera.screenToWorld(event.x, event.y, camera.camera.nearClip);
const to = camera.camera.screenToWorld(event.x, event.y, camera.camera.farClip);
```

---

## Touch Input

The `TouchDevice` class handles multi-touch:

```typescript
import { Script, EVENT_TOUCHSTART, EVENT_TOUCHMOVE, EVENT_TOUCHEND } from 'playcanvas';

class TouchControls extends Script {
  private touchId: number | null = null;
  private startPos = { x: 0, y: 0 };

  initialize(): void {
    if (this.app.touch) {
      this.app.touch.on(EVENT_TOUCHSTART, this.onTouchStart, this);
      this.app.touch.on(EVENT_TOUCHMOVE, this.onTouchMove, this);
      this.app.touch.on(EVENT_TOUCHEND, this.onTouchEnd, this);
    }
  }

  private onTouchStart(event: { touches: Array<{ id: number; x: number; y: number }> }): void {
    if (this.touchId === null) {
      const touch = event.touches[0];
      this.touchId = touch.id;
      this.startPos.x = touch.x;
      this.startPos.y = touch.y;
    }
    event.event?.preventDefault();
  }

  private onTouchMove(event: { touches: Array<{ id: number; x: number; y: number }> }): void {
    for (const touch of event.touches) {
      if (touch.id === this.touchId) {
        const dx = touch.x - this.startPos.x;
        const dy = touch.y - this.startPos.y;
        // Use dx, dy for movement or camera rotation
        break;
      }
    }
  }

  private onTouchEnd(event: { touches: Array<{ id: number }> }): void {
    for (const touch of event.touches) {
      if (touch.id === this.touchId) {
        this.touchId = null;
        break;
      }
    }
  }

  destroy(): void {
    if (this.app.touch) {
      this.app.touch.off(EVENT_TOUCHSTART, this.onTouchStart, this);
      this.app.touch.off(EVENT_TOUCHMOVE, this.onTouchMove, this);
      this.app.touch.off(EVENT_TOUCHEND, this.onTouchEnd, this);
    }
  }
}
```

### Touch Availability

`this.app.touch` is `null` on devices without touch support. Always check before attaching listeners. For cross-platform games, support both mouse and touch — they can coexist on tablets and touchscreen laptops.

### Virtual Joystick

PlayCanvas provides a **Touchscreen Joypad** library for mobile controls. It creates on-screen joystick and button overlays that map to game actions. Install it as a project dependency and configure zones for movement (left thumb) and actions (right thumb).

---

## Gamepad Input

The `GamePad` class wraps the browser Gamepad API for Xbox, PlayStation, and generic controllers:

```typescript
import { Script } from 'playcanvas';

class GamepadController extends Script {
  deadzone = 0.15;

  update(dt: number): void {
    const gamepads = this.app.gamePads;
    if (!gamepads) return;

    gamepads.update(); // Poll for new gamepad state

    const pad = gamepads.getGamePad(0); // First connected controller
    if (!pad) return;

    // Left stick — movement
    const lx = this.applyDeadzone(pad.axes[0]);
    const ly = this.applyDeadzone(pad.axes[1]);

    if (lx !== 0 || ly !== 0) {
      this.entity.translateLocal(lx * 5 * dt, 0, ly * 5 * dt);
    }

    // Right stick — camera
    const rx = this.applyDeadzone(pad.axes[2]);
    const ry = this.applyDeadzone(pad.axes[3]);

    // Buttons — A/Cross = jump, RT = shoot
    if (pad.buttons[0].pressed) this.jump(); // A / Cross
    if (pad.buttons[7].pressed) this.shoot(); // RT / R2

    // Vibration feedback
    if (this.tookDamage) {
      pad.pad?.vibrationActuator?.playEffect('dual-rumble', {
        duration: 200,
        strongMagnitude: 0.5,
        weakMagnitude: 0.3,
      });
    }
  }

  private applyDeadzone(value: number): number {
    return Math.abs(value) < this.deadzone ? 0 : value;
  }
}
```

### Gamepad Button Map (Standard Layout)

| Index | Xbox | PlayStation | Use Case |
|-------|------|-------------|----------|
| 0 | A | Cross | Jump / Confirm |
| 1 | B | Circle | Cancel / Dodge |
| 2 | X | Square | Attack / Interact |
| 3 | Y | Triangle | Reload / Switch |
| 4 | LB | L1 | Ability / Aim |
| 5 | RB | R1 | Ability / Grenade |
| 6 | LT | L2 | Aim (analog) |
| 7 | RT | R2 | Shoot (analog) |
| 12 | D-Up | D-Up | Item / Menu nav |
| 13 | D-Down | D-Down | Item / Menu nav |

---

## Cross-Device Input Pattern

For games that support keyboard+mouse, gamepad, and touch simultaneously, abstract input into an action-based system:

```typescript
import { Script, KEY_W, KEY_SPACE, MOUSEBUTTON_LEFT } from 'playcanvas';

interface InputState {
  moveX: number;
  moveZ: number;
  lookX: number;
  lookY: number;
  jump: boolean;
  shoot: boolean;
}

class UnifiedInput extends Script {
  deadzone = 0.15;

  getInput(): InputState {
    const state: InputState = {
      moveX: 0, moveZ: 0,
      lookX: 0, lookY: 0,
      jump: false, shoot: false,
    };

    // Keyboard + Mouse
    const kb = this.app.keyboard;
    if (kb.isPressed(KEY_W)) state.moveZ = -1;
    // ... other WASD keys
    if (kb.wasPressed(KEY_SPACE)) state.jump = true;
    if (this.app.mouse.isPressed(MOUSEBUTTON_LEFT)) state.shoot = true;

    // Gamepad (overrides if connected)
    const pad = this.app.gamePads?.getGamePad(0);
    if (pad) {
      const lx = this.applyDeadzone(pad.axes[0]);
      const ly = this.applyDeadzone(pad.axes[1]);
      if (lx !== 0 || ly !== 0) {
        state.moveX = lx;
        state.moveZ = ly;
      }
      if (pad.buttons[0].pressed) state.jump = true;
      if (pad.buttons[7].pressed) state.shoot = true;
    }

    return state;
  }

  private applyDeadzone(value: number): number {
    return Math.abs(value) < this.deadzone ? 0 : value;
  }
}
```

This lets game logic consume abstract actions without caring which device produced them. Add touch input by mapping virtual joystick output to the same `moveX`/`moveZ` axes.

---

## Preventing Default Browser Behavior

Keyboard and touch events can trigger browser actions (scrolling, zooming, back navigation). Prevent these in your input handlers:

```typescript
// In keyboard handler
event.event?.preventDefault();

// On the canvas element — prevent touch scrolling
canvas.addEventListener('touchmove', (e) => e.preventDefault(), { passive: false });

// Prevent context menu on right-click
canvas.addEventListener('contextmenu', (e) => e.preventDefault());
```

---

## Performance Tips

- **Poll in `update()`**, don't allocate objects — reuse state objects to avoid GC pressure.
- **Gamepad polling** — call `gamePads.update()` once per frame, not per-script. Use a centralized input manager script.
- **Touch multi-finger** — track finger IDs to distinguish gestures (pinch, rotate) from movement.
- **Event listener cleanup** — always remove listeners in `destroy()`. Leaked listeners cause subtle bugs when entities are recycled.
- **Pointer Lock** — test without pointer lock during development; add it as a polished final step. Some mobile browsers don't support it.
