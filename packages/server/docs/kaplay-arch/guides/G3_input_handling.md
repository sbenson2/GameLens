# G3 — Kaplay Input Handling

> **Category:** guide · **Engine:** Kaplay · **Related:** [E1 Architecture Overview](../architecture/E1_architecture_overview.md) · [G1 Components & Game Objects](G1_components_and_game_objects.md) · [G2 Scenes & Navigation](G2_scenes_and_navigation.md)

---

## Overview

Kaplay provides two layers of input handling. The **low-level API** gives you direct access to keyboard, mouse, touch, and gamepad events via functions like `onKeyPress()` and `onMouseDown()`. The **Buttons API** (input bindings) sits on top and lets you define abstract actions ("jump", "fire") mapped to multiple physical inputs, so the same code works across keyboard, gamepad, and touch without branching.

This guide covers the low-level keyboard/mouse/touch/gamepad APIs, the Buttons (input bindings) system, per-object input with the `area()` component, virtual/simulated input for mobile and cutscenes, and practical patterns for common control schemes.

---

## Keyboard Input

### Event-Based: onKeyPress / onKeyDown / onKeyRelease

```typescript
import kaplay from 'kaplay';

const k = kaplay({ width: 800, height: 600 });

const player = k.add([
  k.sprite('hero'),
  k.pos(400, 300),
  k.area(),
  k.body(),
]);

// onKeyPress — fires once when the key is first pressed
k.onKeyPress('space', () => {
  // Jump — fires once per press, not while held
  player.jump(400);
});

// onKeyDown — fires every frame while the key is held
k.onKeyDown('right', () => {
  player.move(200, 0);
});

k.onKeyDown('left', () => {
  player.move(-200, 0);
});

// onKeyRelease — fires once when the key is released
k.onKeyRelease('right', () => {
  // Stop horizontal momentum, play idle animation, etc.
});
```

### Listening to Any Key

Pass no key argument to listen for all key events:

```typescript
k.onKeyPress((key) => {
  // key is the string name of the pressed key
  if (key === 'escape') {
    k.go('pause');
  }
});
```

### Polling: isKeyDown / isKeyPressed / isKeyReleased

Check input state directly in your update loop instead of registering events:

```typescript
k.onUpdate(() => {
  if (k.isKeyDown('left'))  player.move(-200, 0);
  if (k.isKeyDown('right')) player.move(200, 0);
  if (k.isKeyDown('up'))    player.move(0, -200);
  if (k.isKeyDown('down'))  player.move(0, 200);

  // isKeyPressed — true only on the frame the key was first pressed
  if (k.isKeyPressed('space')) {
    player.jump(400);
  }
});
```

> **When to use which:** Event-based (`onKeyPress`) is cleaner for one-shot actions (jump, interact, fire). Polling (`isKeyDown`) is better for continuous movement in an update loop.

---

## Mouse Input

### Event-Based

```typescript
// onMousePress — fires once on click/tap
k.onMousePress((pos, button) => {
  // pos is a Vec2 with the click position (world coords)
  // button is 'left', 'right', or 'middle'
  if (button === 'left') {
    spawnBullet(player.pos, pos);
  }
});

// onMouseDown — fires every frame while held
k.onMouseDown('left', (pos) => {
  aimLine.pointTo(pos);
});

// onMouseRelease — fires once on release
k.onMouseRelease('left', (pos) => {
  fireSlingshot(pos);
});

// onMouseMove — fires every frame the cursor moves
k.onMouseMove((pos, delta) => {
  crosshair.pos = pos;
});
```

### Polling

```typescript
k.onUpdate(() => {
  const mousePos = k.mousePos();        // Current mouse position
  const isDown = k.isMouseDown('left');  // Is left button held?
  const wasPressed = k.isMousePressed('left'); // Just pressed this frame?
});
```

---

## Touch Input

Kaplay translates touch events into mouse events by default (`touchToMouse: true` in the Kaplay options). This means `onMousePress` and `onMouseDown` work on mobile without extra code.

For multi-touch or advanced touch handling, use the dedicated touch events:

```typescript
k.onTouchStart((pos, touch) => {
  // pos — Vec2 position of the touch
  // touch — the raw Touch object with identifier, etc.
  console.log(`Touch started at ${pos} id=${touch.identifier}`);
});

k.onTouchMove((pos, touch) => {
  // Track finger movement for virtual joystick, swipe, etc.
});

k.onTouchEnd((pos, touch) => {
  // Touch lifted
});
```

### Disabling Touch-to-Mouse Translation

If you need full manual control over touch (e.g., a custom virtual joystick), disable the auto-translation:

```typescript
const k = kaplay({
  touchToMouse: false,
});
```

---

## Gamepad Input

Kaplay has built-in gamepad support via the Gamepad API:

```typescript
// Button events
k.onGamepadButtonPress('south', () => {
  // 'south' = A on Xbox, Cross on PlayStation
  player.jump(400);
});

k.onGamepadButtonDown('east', () => {
  // 'east' = B on Xbox, Circle on PlayStation
  player.dash();
});

k.onGamepadButtonRelease('south', () => {
  // A/Cross released
});

// Analog stick — fires every frame with stick position
k.onGamepadStick('left', (stick) => {
  // stick is a Vec2 with x/y in range [-1, 1]
  if (stick.len() > 0.2) { // Dead zone
    player.move(stick.x * 200, stick.y * 200);
  }
});
```

### Standard Gamepad Button Names

| Name | Xbox | PlayStation | Purpose |
|------|------|-------------|---------|
| `south` | A | Cross | Confirm / Jump |
| `east` | B | Circle | Cancel / Back |
| `west` | X | Square | Action 1 |
| `north` | Y | Triangle | Action 2 |
| `ltrigger` | LT | L2 | Left trigger |
| `rtrigger` | RT | R2 | Right trigger |
| `lshoulder` | LB | L1 | Left bumper |
| `rshoulder` | RB | R1 | Right bumper |
| `lstick` | LS | L3 | Left stick press |
| `rstick` | RS | R3 | Right stick press |

---

## Buttons API (Input Bindings)

The Buttons API is Kaplay's recommended approach for production games. Define abstract actions once, bind them to physical inputs, and use the same event handlers regardless of device.

### Defining Bindings

```typescript
const k = kaplay({
  width: 800,
  height: 600,
  buttons: {
    jump: {
      keyboard: ['space', 'up'],
      gamepad: ['south'],
    },
    fire: {
      keyboard: ['x', 'z'],
      mouse: ['left'],
      gamepad: ['west'],
    },
    moveLeft: {
      keyboard: ['left', 'a'],
      gamepad: ['lstick-left'],  // Left stick direction
    },
    moveRight: {
      keyboard: ['right', 'd'],
      gamepad: ['lstick-right'],
    },
  },
});
```

### Using Button Events

```typescript
// Fires once when any bound input for 'jump' is pressed
k.onButtonPress('jump', () => {
  player.jump(400);
});

// Fires every frame while any bound input for 'fire' is held
k.onButtonDown('fire', () => {
  chargePower += 1;
});

// Fires once when released
k.onButtonRelease('fire', () => {
  shootWithPower(chargePower);
  chargePower = 0;
});
```

### Polling Buttons

```typescript
k.onUpdate(() => {
  if (k.isButtonDown('moveLeft'))  player.move(-200, 0);
  if (k.isButtonDown('moveRight')) player.move(200, 0);
  if (k.isButtonPressed('jump'))   player.jump(400);
});
```

### Dynamic Rebinding

Change bindings at runtime (e.g., for a key remapping settings screen):

```typescript
// Get current bindings for a button
const jumpBindings = k.getButton('jump');
// Returns: { keyboard: ['space', 'up'], gamepad: ['south'] }

// Update bindings — performs a shallow merge, so omitted devices keep their bindings
k.setButton('jump', {
  keyboard: ['w', 'space'],
  // gamepad stays as ['south']
});
```

### Simulated Input

Trigger button events programmatically — useful for cutscenes, tutorials, or mobile virtual controls:

```typescript
// Simulate pressing the 'jump' button
k.pressButton('jump');

// Simulate releasing it
k.releaseButton('jump');
```

---

## Per-Object Input: area() + onClick / onHover

Game objects with the `area()` component can respond to pointer input directly:

```typescript
const startButton = k.add([
  k.rect(200, 60),
  k.pos(400, 400),
  k.anchor('center'),
  k.area(),
  k.color(100, 100, 255),
  'ui-button',
]);

// onClick — fires when this specific object is clicked/tapped
startButton.onClick(() => {
  k.go('game');
});

// onHover — fires when cursor enters the object bounds
startButton.onHover(() => {
  startButton.color = k.rgb(150, 150, 255);
  k.setCursor('pointer');
});

// onHoverEnd — fires when cursor leaves the object
startButton.onHoverEnd(() => {
  startButton.color = k.rgb(100, 100, 255);
  k.setCursor('default');
});
```

---

## Practical Patterns

### Top-Down 8-Direction Movement

```typescript
const SPEED = 200;

k.onUpdate(() => {
  let dir = k.vec2(0, 0);
  if (k.isButtonDown('moveLeft'))  dir.x -= 1;
  if (k.isButtonDown('moveRight')) dir.x += 1;
  if (k.isButtonDown('moveUp'))    dir.y -= 1;
  if (k.isButtonDown('moveDown'))  dir.y += 1;

  // Normalize so diagonal movement isn't faster
  if (dir.len() > 0) {
    dir = dir.unit();
    player.move(dir.scale(SPEED));
  }
});
```

### Mobile Virtual Joystick

Use touch events with simulated buttons for a mobile-friendly joystick:

```typescript
let joystickOrigin: { x: number; y: number } | null = null;

k.onTouchStart((pos) => {
  if (pos.x < k.width() / 2) {
    // Left side of screen = joystick
    joystickOrigin = { x: pos.x, y: pos.y };
  }
});

k.onTouchMove((pos) => {
  if (joystickOrigin) {
    const dx = pos.x - joystickOrigin.x;
    const dy = pos.y - joystickOrigin.y;
    const deadZone = 20;

    if (Math.abs(dx) > deadZone) {
      if (dx > 0) k.pressButton('moveRight');
      else k.pressButton('moveLeft');
    }
    if (Math.abs(dy) > deadZone) {
      if (dy > 0) k.pressButton('moveDown');
      else k.pressButton('moveUp');
    }
  }
});

k.onTouchEnd(() => {
  joystickOrigin = null;
  k.releaseButton('moveLeft');
  k.releaseButton('moveRight');
  k.releaseButton('moveUp');
  k.releaseButton('moveDown');
});
```

### Input Buffering for Responsive Controls

Buffer jump input so pressing jump slightly before landing still works:

```typescript
let jumpBufferTimer = 0;
const BUFFER_WINDOW = 0.15; // 150ms

k.onButtonPress('jump', () => {
  if (player.isGrounded()) {
    player.jump(400);
  } else {
    jumpBufferTimer = BUFFER_WINDOW;
  }
});

k.onUpdate(() => {
  if (jumpBufferTimer > 0) {
    jumpBufferTimer -= k.dt();
    if (player.isGrounded()) {
      player.jump(400);
      jumpBufferTimer = 0;
    }
  }
});
```

---

## Framework Comparison

| Concept | Kaplay | Phaser 3 | Excalibur |
|---------|--------|----------|-----------|
| Abstract bindings | Buttons API (`onButtonPress`) | Custom (no built-in) | Custom (no built-in) |
| Keyboard events | `onKeyPress`, `onKeyDown`, `onKeyRelease` | `keyboard.on('keydown-SPACE')` | `engine.input.keyboard.on('press')` |
| Mouse events | `onMousePress`, `onMouseDown` | `input.on('pointerdown')` | `engine.input.pointers.on('down')` |
| Gamepad | `onGamepadButtonPress`, `onGamepadStick` | `gamepad.on('down')` | `engine.input.gamepads.on('button')` |
| Touch-to-mouse | Auto (`touchToMouse: true`) | Auto (Pointer events) | Pointer abstraction |
| Per-object clicks | `area()` + `onClick()` | `setInteractive()` + `on('pointerdown')` | Actor pointer events |
| Input simulation | `pressButton()` / `releaseButton()` | Manual dispatch | Manual dispatch |

---

## Mobile & Browser Considerations

1. **Touch-to-mouse is on by default.** Test early on mobile to confirm your UI buttons and gameplay work with touch without extra code.
2. **Gamepad API requires HTTPS** in most browsers. During local development, `localhost` is exempt.
3. **Gamepad connect/disconnect:** Listen for `onGamepadConnect` and `onGamepadDisconnect` to show/hide gamepad UI hints.
4. **Browser focus:** Input events only fire when the game canvas has focus. Kaplay handles this, but be aware if embedding the game in an iframe.
5. **Virtual keyboard on mobile** can resize the viewport. If your game has text input, handle the resize event or avoid `<input>` elements in favor of in-game text input.

---

## Next Steps

- **[G1 Components & Game Objects](G1_components_and_game_objects.md)** — The component model that `area()` and `body()` plug into
- **[G2 Scenes & Navigation](G2_scenes_and_navigation.md)** — Organizing input across scenes
- **[E1 Architecture Overview](../architecture/E1_architecture_overview.md)** — Kaplay's overall architecture
