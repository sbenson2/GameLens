# G3 — Phaser Input Handling

> **Category:** guide · **Engine:** Phaser · **Related:** [E1 Architecture Overview](../architecture/E1_architecture_overview.md) · [G1 Scene Lifecycle](G1_scene_lifecycle.md) · [G2 Physics Systems](G2_physics_systems.md)

---

## Overview

Phaser 3 provides a unified input system that normalizes mouse, touch, keyboard, and gamepad events into a consistent API. At its core is a global Input Manager that listens for native DOM events and dispatches them to per-scene Input Plugins. This means each Scene manages its own input state independently — pausing a scene also pauses its input processing.

This guide covers keyboard input, pointer (mouse + touch) events, interactive game objects, drag-and-drop, gamepad support, and practical patterns for common input scenarios.

---

## Architecture: How Input Flows

```
Browser DOM Events
    ↓
Input Manager (global, one per game)
    ↓ dispatches to active scenes
Input Plugin (per scene: this.input)
    ├── Keyboard Plugin  (this.input.keyboard)
    ├── Gamepad Plugin   (this.input.gamepad)
    └── Pointer Manager  (this.input.activePointer)
         ↓ hit tests against
    Interactive Game Objects (setInteractive)
```

The Input Manager handles raw event listening and pointer creation. Each scene's Input Plugin processes hit testing against interactive objects and routes events to the appropriate listeners.

---

## Keyboard Input

### Cursor Keys (Arrow Keys + Shift/Space)

The quickest way to get directional input:

```typescript
class GameScene extends Phaser.Scene {
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;

  create() {
    this.cursors = this.input.keyboard!.createCursorKeys();
    // Returns: { up, down, left, right, space, shift }
    // Each is a Phaser.Input.Keyboard.Key object
  }

  update() {
    const speed = 200;

    if (this.cursors.left.isDown) {
      this.player.setVelocityX(-speed);
    } else if (this.cursors.right.isDown) {
      this.player.setVelocityX(speed);
    } else {
      this.player.setVelocityX(0);
    }

    // JustDown fires only on the frame the key was first pressed
    if (Phaser.Input.Keyboard.JustDown(this.cursors.space)) {
      this.player.setVelocityY(-400); // jump
    }
  }
}
```

### Custom Key Bindings with `addKey()`

For WASD, action buttons, or any specific key:

```typescript
class GameScene extends Phaser.Scene {
  private keys!: {
    w: Phaser.Input.Keyboard.Key;
    a: Phaser.Input.Keyboard.Key;
    s: Phaser.Input.Keyboard.Key;
    d: Phaser.Input.Keyboard.Key;
    shoot: Phaser.Input.Keyboard.Key;
  };

  create() {
    // addKey accepts a string name or a KeyCodes constant
    this.keys = {
      w: this.input.keyboard!.addKey('W'),
      a: this.input.keyboard!.addKey('A'),
      s: this.input.keyboard!.addKey('S'),
      d: this.input.keyboard!.addKey('D'),
      shoot: this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE),
    };
  }

  update() {
    let vx = 0;
    let vy = 0;

    if (this.keys.a.isDown) vx -= 200;
    if (this.keys.d.isDown) vx += 200;
    if (this.keys.w.isDown) vy -= 200;
    if (this.keys.s.isDown) vy += 200;

    this.player.setVelocity(vx, vy);
  }
}
```

### Batch Key Registration with `addKeys()`

Register multiple keys at once and get them back as a keyed object:

```typescript
create() {
  const keys = this.input.keyboard!.addKeys({
    up: Phaser.Input.Keyboard.KeyCodes.W,
    down: Phaser.Input.Keyboard.KeyCodes.S,
    left: Phaser.Input.Keyboard.KeyCodes.A,
    right: Phaser.Input.Keyboard.KeyCodes.D,
    fire: Phaser.Input.Keyboard.KeyCodes.SPACE,
    dodge: Phaser.Input.Keyboard.KeyCodes.SHIFT,
  }) as Record<string, Phaser.Input.Keyboard.Key>;

  // Use: keys.up.isDown, keys.fire.isDown, etc.
}
```

### Key Events (Event-Driven Approach)

For actions that should fire once (not every frame), use events instead of polling:

```typescript
create() {
  // Listen for a specific key
  this.input.keyboard!.on('keydown-E', () => {
    this.interactWithNearestNPC();
  });

  // Listen for any key
  this.input.keyboard!.on('keydown', (event: KeyboardEvent) => {
    if (event.key === 'Escape') {
      this.scene.pause();
      this.scene.launch('PauseMenu');
    }
  });

  // Using a Key object's event
  const jumpKey = this.input.keyboard!.addKey('SPACE');
  jumpKey.on('down', () => {
    if (this.player.body!.touching.down) {
      this.player.setVelocityY(-400);
    }
  });
}
```

### Preventing Default Browser Behavior

By default, Phaser captures keyboard events to prevent the browser from scrolling on arrow keys or triggering shortcuts:

```typescript
// In game config — prevent specific keys from bubbling to the browser
const config: Phaser.Types.Core.GameConfig = {
  input: {
    keyboard: {
      // Only capture these keys (let others pass through)
      capture: [
        Phaser.Input.Keyboard.KeyCodes.SPACE,
        Phaser.Input.Keyboard.KeyCodes.UP,
        Phaser.Input.Keyboard.KeyCodes.DOWN,
      ],
    },
  },
};
```

---

## Pointer Input (Mouse + Touch)

Phaser unifies mouse and touch into a single pointer API. A mouse click and a finger tap both produce the same `pointerdown` event. This means you write input code once and it works on desktop and mobile.

### Scene-Level Pointer Events

```typescript
create() {
  // Fire on any click/tap anywhere in the scene
  this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
    console.log(`Clicked at: ${pointer.worldX}, ${pointer.worldY}`);
    // pointer.worldX/Y = world coords (accounts for camera)
    // pointer.x/y = screen coords
  });

  // Track pointer movement
  this.input.on('pointermove', (pointer: Phaser.Input.Pointer) => {
    this.crosshair.setPosition(pointer.worldX, pointer.worldY);
  });

  // Distinguish left/right/middle click
  this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
    if (pointer.leftButtonDown()) {
      this.shoot();
    } else if (pointer.rightButtonDown()) {
      this.useAbility();
    }
  });
}
```

### Making Game Objects Interactive

Game objects must opt in to receiving pointer events with `setInteractive()`:

```typescript
create() {
  const button = this.add.image(400, 300, 'play-button')
    .setInteractive()  // enable hit testing
    .on('pointerover', () => button.setTint(0xaaaaff))
    .on('pointerout', () => button.clearTint())
    .on('pointerdown', () => this.scene.start('Game'));

  // Custom hit area (useful for non-rectangular shapes)
  const circle = this.add.image(200, 200, 'orb')
    .setInteractive(
      new Phaser.Geom.Circle(32, 32, 32),
      Phaser.Geom.Circle.Contains
    );
}
```

### Interactive Events on Game Objects

| Event | Fires when |
|-------|-----------|
| `pointerover` | Pointer enters the object's hit area |
| `pointerout` | Pointer leaves the object's hit area |
| `pointerdown` | Pointer button pressed while over the object |
| `pointerup` | Pointer button released while over the object |
| `pointermove` | Pointer moves while over the object |
| `pointerwheel` | Mouse wheel scrolled while over the object |

---

## Drag and Drop

Phaser has built-in drag support. Enable it by passing `{ draggable: true }` to `setInteractive()`:

```typescript
create() {
  const card = this.add.image(400, 300, 'card')
    .setInteractive({ draggable: true });

  // Option A: Listen on the object
  card.on('drag', (pointer: Phaser.Input.Pointer, dragX: number, dragY: number) => {
    card.setPosition(dragX, dragY);
  });

  // Option B: Listen on the scene input (works for all draggable objects)
  this.input.on('drag', (
    pointer: Phaser.Input.Pointer,
    gameObject: Phaser.GameObjects.Image,
    dragX: number,
    dragY: number
  ) => {
    gameObject.setPosition(dragX, dragY);
  });
}
```

### Full Drag Lifecycle

```typescript
create() {
  const item = this.add.image(200, 300, 'item')
    .setInteractive({ draggable: true });

  item.on('dragstart', () => {
    item.setScale(1.2);
    item.setTint(0x44ff44);
  });

  item.on('drag', (pointer: Phaser.Input.Pointer, dragX: number, dragY: number) => {
    item.setPosition(dragX, dragY);
  });

  item.on('dragend', () => {
    item.setScale(1.0);
    item.clearTint();
  });

  // Drop zones
  const dropZone = this.add.zone(600, 300, 120, 120)
    .setRectangleDropZone(120, 120);

  item.on('dragenter', (pointer: Phaser.Input.Pointer, target: Phaser.GameObjects.Zone) => {
    target.setData('highlight', true);
  });

  item.on('dragleave', (pointer: Phaser.Input.Pointer, target: Phaser.GameObjects.Zone) => {
    target.setData('highlight', false);
  });

  item.on('drop', (pointer: Phaser.Input.Pointer, target: Phaser.GameObjects.Zone) => {
    item.setPosition(target.x, target.y); // snap to drop zone
  });
}
```

---

## Gamepad Input

Gamepad support must be enabled in the game config. Phaser supports up to 4 connected gamepads:

```typescript
const config: Phaser.Types.Core.GameConfig = {
  input: {
    gamepad: true, // enable the gamepad plugin
  },
};
```

### Detecting Connection

```typescript
create() {
  // Wait for a gamepad to connect
  this.input.gamepad!.once('connected', (pad: Phaser.Input.Gamepad.Gamepad) => {
    console.log(`Gamepad connected: ${pad.id}`);
    this.setupGamepadControls(pad);
  });

  // Or check if one is already connected
  if (this.input.gamepad!.total > 0) {
    const pad = this.input.gamepad!.pad1;
    this.setupGamepadControls(pad);
  }
}
```

### Reading Sticks and Buttons

```typescript
update() {
  const pad = this.input.gamepad?.pad1;
  if (!pad) return;

  // Left stick — pad.leftStick is a Vector2 (-1 to 1 per axis)
  const threshold = 0.15; // deadzone
  let vx = 0;
  let vy = 0;

  if (Math.abs(pad.leftStick.x) > threshold) {
    vx = pad.leftStick.x * 300;
  }
  if (Math.abs(pad.leftStick.y) > threshold) {
    vy = pad.leftStick.y * 300;
  }
  this.player.setVelocity(vx, vy);

  // Right stick — aim direction
  if (pad.rightStick.length() > threshold) {
    this.aimAngle = Math.atan2(pad.rightStick.y, pad.rightStick.x);
  }

  // Buttons (Standard Gamepad Mapping)
  // A=0, B=1, X=2, Y=3, LB=4, RB=5, LT=6, RT=7
  // Back=8, Start=9, L3=10, R3=11
  // DPad: Up=12, Down=13, Left=14, Right=15

  if (pad.A) {  // A button held
    this.player.setVelocityY(-400); // jump
  }

  if (pad.R2 > 0.5) {  // Right trigger (pressure sensitive, 0–1)
    this.shoot();
  }
}
```

### Gamepad Button Events

```typescript
create() {
  this.input.gamepad!.on('down', (
    pad: Phaser.Input.Gamepad.Gamepad,
    button: Phaser.Input.Gamepad.Button,
    value: number
  ) => {
    // button.index = standard gamepad button index
    if (button.index === 9) { // Start button
      this.togglePause();
    }
  });
}
```

### Vibration / Haptic Feedback

Vibration is experimental and depends on browser + hardware support:

```typescript
// pad.vibration is the HapticActuator (if available)
const pad = this.input.gamepad!.pad1;
if (pad?.vibration) {
  // playEffect takes duration and intensity
  pad.vibration.playEffect('dual-rumble', {
    duration: 200,
    strongMagnitude: 0.8,
    weakMagnitude: 0.4,
  });
}
```

---

## Multi-Input Patterns

### Pattern 1: Unified Movement (Keyboard + Gamepad)

Support both input methods simultaneously:

```typescript
update() {
  const speed = 200;
  let vx = 0;
  let vy = 0;

  // Keyboard
  const cursors = this.cursors;
  if (cursors.left.isDown) vx -= speed;
  if (cursors.right.isDown) vx += speed;
  if (cursors.up.isDown) vy -= speed;
  if (cursors.down.isDown) vy += speed;

  // Gamepad (additive — if both are used, gamepad wins on overlap)
  const pad = this.input.gamepad?.pad1;
  if (pad) {
    const deadzone = 0.15;
    if (Math.abs(pad.leftStick.x) > deadzone) {
      vx = pad.leftStick.x * speed;
    }
    if (Math.abs(pad.leftStick.y) > deadzone) {
      vy = pad.leftStick.y * speed;
    }
  }

  this.player.setVelocity(vx, vy);
}
```

### Pattern 2: Virtual Joystick (Mobile Touch)

For mobile games, create an on-screen virtual joystick using pointer tracking:

```typescript
class GameScene extends Phaser.Scene {
  private joystickBase!: Phaser.GameObjects.Image;
  private joystickThumb!: Phaser.GameObjects.Image;
  private joystickActive = false;
  private joystickVector = new Phaser.Math.Vector2();

  create() {
    this.joystickBase = this.add.image(120, 450, 'joystick-base')
      .setAlpha(0.5).setScrollFactor(0).setDepth(100);
    this.joystickThumb = this.add.image(120, 450, 'joystick-thumb')
      .setAlpha(0.7).setScrollFactor(0).setDepth(101);

    const maxRadius = 50;

    this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      // Only activate if touch is on the left side of the screen
      if (pointer.x < this.scale.width / 2) {
        this.joystickActive = true;
        this.joystickBase.setPosition(pointer.x, pointer.y);
        this.joystickThumb.setPosition(pointer.x, pointer.y);
      }
    });

    this.input.on('pointermove', (pointer: Phaser.Input.Pointer) => {
      if (!this.joystickActive) return;
      const dx = pointer.x - this.joystickBase.x;
      const dy = pointer.y - this.joystickBase.y;
      const dist = Math.min(Math.sqrt(dx * dx + dy * dy), maxRadius);
      const angle = Math.atan2(dy, dx);

      this.joystickThumb.setPosition(
        this.joystickBase.x + Math.cos(angle) * dist,
        this.joystickBase.y + Math.sin(angle) * dist
      );
      this.joystickVector.set(
        Math.cos(angle) * (dist / maxRadius),
        Math.sin(angle) * (dist / maxRadius)
      );
    });

    this.input.on('pointerup', () => {
      this.joystickActive = false;
      this.joystickThumb.setPosition(this.joystickBase.x, this.joystickBase.y);
      this.joystickVector.set(0, 0);
    });
  }

  update() {
    if (this.joystickActive) {
      this.player.setVelocity(
        this.joystickVector.x * 200,
        this.joystickVector.y * 200
      );
    }
  }
}
```

### Pattern 3: Input Action Map

Abstract raw input into named actions for cleaner game logic:

```typescript
class InputActions {
  private scene: Phaser.Scene;
  private keys: Record<string, Phaser.Input.Keyboard.Key>;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
    this.keys = scene.input.keyboard!.addKeys({
      moveLeft: Phaser.Input.Keyboard.KeyCodes.A,
      moveRight: Phaser.Input.Keyboard.KeyCodes.D,
      moveUp: Phaser.Input.Keyboard.KeyCodes.W,
      moveDown: Phaser.Input.Keyboard.KeyCodes.S,
      jump: Phaser.Input.Keyboard.KeyCodes.SPACE,
      interact: Phaser.Input.Keyboard.KeyCodes.E,
      pause: Phaser.Input.Keyboard.KeyCodes.ESC,
    }) as Record<string, Phaser.Input.Keyboard.Key>;
  }

  get moveX(): number {
    let x = 0;
    if (this.keys.moveLeft.isDown) x -= 1;
    if (this.keys.moveRight.isDown) x += 1;

    // Blend gamepad if present
    const pad = this.scene.input.gamepad?.pad1;
    if (pad && Math.abs(pad.leftStick.x) > 0.15) {
      x = pad.leftStick.x;
    }
    return x;
  }

  get moveY(): number {
    let y = 0;
    if (this.keys.moveUp.isDown) y -= 1;
    if (this.keys.moveDown.isDown) y += 1;

    const pad = this.scene.input.gamepad?.pad1;
    if (pad && Math.abs(pad.leftStick.y) > 0.15) {
      y = pad.leftStick.y;
    }
    return y;
  }

  get jumpPressed(): boolean {
    return Phaser.Input.Keyboard.JustDown(this.keys.jump)
      || (this.scene.input.gamepad?.pad1?.A ?? false);
  }

  get interactPressed(): boolean {
    return Phaser.Input.Keyboard.JustDown(this.keys.interact)
      || (this.scene.input.gamepad?.pad1?.X ?? false);
  }
}

// Usage in scene
class GameScene extends Phaser.Scene {
  private actions!: InputActions;

  create() {
    this.actions = new InputActions(this);
  }

  update() {
    const speed = 200;
    this.player.setVelocity(
      this.actions.moveX * speed,
      this.actions.moveY * speed
    );

    if (this.actions.jumpPressed) {
      this.player.setVelocityY(-400);
    }
  }
}
```

---

## Comparison: Input Systems Across Frameworks

| Concept | Phaser | Kaplay | PixiJS | Excalibur |
|---------|--------|--------|--------|-----------|
| Keyboard polling | `key.isDown` | `k.isKeyDown('left')` | Not built-in (use DOM) | `engine.input.keyboard.isHeld()` |
| Keyboard events | `keyboard.on('keydown-X')` | `k.onKeyPress('x', fn)` | Not built-in (use DOM) | `keyboard.on('press', fn)` |
| Pointer unified | Mouse + touch merged | Mouse + touch merged | Mouse + touch merged (FederatedEvent) | Mouse + touch merged |
| Interactive objects | `setInteractive()` | `area()` + `onClick()` | `eventMode = 'static'` | `pointer.useGraphicsBounds = true` |
| Drag-and-drop | Built-in `{ draggable: true }` | Manual with pointer events | Manual | Manual |
| Gamepad | Built-in plugin | `k.onGamepadButtonPress()` | Not built-in | Built-in `Gamepads` class |
| Input abstraction | Manual (see pattern above) | Manual | Manual | Built-in `Actions` |

---

## Key Takeaways

1. **Keyboard: poll in `update()`, react in `create()`.** Use `isDown` for continuous movement and `JustDown()` or `keydown` events for one-shot actions like jumping.
2. **Pointer events are unified.** Write once for mouse and touch — Phaser merges them. Use `pointer.worldX/Y` for game coordinates and `pointer.x/y` for screen coordinates.
3. **`setInteractive()` is opt-in.** Game objects do not receive pointer events by default. Call it to enable hit testing, and pass geometry for non-rectangular shapes.
4. **Gamepad requires config opt-in.** Set `input: { gamepad: true }` in your game config. Always handle the case where no gamepad is connected.
5. **Deadzone your sticks.** Analog sticks rarely rest at exactly 0. Use a threshold of 0.1–0.2 to prevent drift.
6. **Abstract input into actions.** An InputActions class that maps raw keys, gamepad buttons, and touch zones into semantic actions (`moveX`, `jumpPressed`) keeps game logic clean and makes rebinding trivial.
