# Three.js Input Handling for Games

> **Category:** guide · **Engine:** Three.js r160+ · **Related:** [Architecture Overview](../architecture/E1_architecture_overview.md), [Camera Systems](G4_camera_systems.md), [Three.js Rules](../threejs-rules.md)

Three.js does not include a built-in input manager — it relies on the browser's native DOM event system for keyboard, mouse, pointer, touch, and gamepad input. This guide covers the patterns game developers need: polling vs event-driven input, raycaster-based object picking, built-in controls, gamepad support, and a reusable input manager class.

---

## Input Architecture Overview

Three.js input follows a layered pattern:

1. **DOM Events** — Browser fires `keydown`, `pointerdown`, `pointermove`, `gamepadconnected`, etc.
2. **Raycaster** — Converts 2D screen coordinates to 3D world picks (object selection, click targets).
3. **Controls** — Pre-built camera controllers (`OrbitControls`, `PointerLockControls`, `DragControls`) that consume DOM events internally.
4. **Game Input Manager** — Your abstraction that normalises all input sources into a poll-able state.

> **Key principle:** Capture events in handlers, store state in a map, read state during your game loop's `update()`. Never move objects directly inside event handlers — that bypasses your frame timing.

---

## Keyboard Input

### Event-Driven Capture, Polling Read

```typescript
const keys = new Map<string, boolean>();

window.addEventListener("keydown", (e: KeyboardEvent) => {
  keys.set(e.code, true);    // Use e.code ("KeyW") not e.key ("w") — layout-independent
});

window.addEventListener("keyup", (e: KeyboardEvent) => {
  keys.set(e.code, false);
});

// In your game loop:
function update(delta: number) {
  const speed = 5 * delta;
  if (keys.get("KeyW")) player.position.z -= speed;
  if (keys.get("KeyS")) player.position.z += speed;
  if (keys.get("KeyA")) player.position.x -= speed;
  if (keys.get("KeyD")) player.position.x += speed;
  if (keys.get("Space")) jump();
}
```

**Why `e.code` over `e.key`?** `e.code` maps to the physical key position (QWERTY layout), so WASD works on AZERTY keyboards too. `e.key` returns the character produced, which shifts with layout.

### Detecting Press vs Hold

```typescript
const keysDown = new Map<string, boolean>();   // currently held
const keysPressed = new Map<string, boolean>(); // just pressed this frame

window.addEventListener("keydown", (e: KeyboardEvent) => {
  if (!keysDown.get(e.code)) {
    keysPressed.set(e.code, true);  // First frame only
  }
  keysDown.set(e.code, true);
});

window.addEventListener("keyup", (e: KeyboardEvent) => {
  keysDown.set(e.code, false);
});

// Call at end of each frame:
function resetFrameInput() {
  keysPressed.clear();
}
```

---

## Pointer & Mouse Input

### Normalised Device Coordinates (NDC)

Three.js raycasting requires mouse position in NDC space (−1 to +1). Always compute from the canvas element, not the window:

```typescript
import { Vector2 } from "three";

const pointer = new Vector2();

renderer.domElement.addEventListener("pointermove", (e: PointerEvent) => {
  const rect = renderer.domElement.getBoundingClientRect();
  pointer.x =  ((e.clientX - rect.left) / rect.width)  * 2 - 1;
  pointer.y = -((e.clientY - rect.top)  / rect.height) * 2 + 1;
});
```

### Raycaster for Object Picking

```typescript
import { Raycaster, Camera, Object3D } from "three";

const raycaster = new Raycaster();

function getPickedObject(
  pointer: Vector2,
  camera: Camera,
  targets: Object3D[]
): Object3D | null {
  raycaster.setFromCamera(pointer, camera);
  const hits = raycaster.intersectObjects(targets, true); // true = recursive
  return hits.length > 0 ? hits[0].object : null;
}

// Usage on click:
renderer.domElement.addEventListener("pointerdown", () => {
  const picked = getPickedObject(pointer, camera, selectableObjects);
  if (picked) picked.userData.onClick?.();
});
```

> **Performance tip:** Limit `intersectObjects` to a subset of the scene — not `scene.children`. Use layers or a dedicated array of interactive objects. For large numbers of objects, consider spatial indexing (e.g., an octree) instead of brute-force raycasting.

### Raycaster Layers

Three.js `Layers` let you filter raycasting by channel:

```typescript
// Setup: assign interactive objects to layer 1
interactiveGroup.children.forEach((obj) => obj.layers.enable(1));

// Raycaster only tests layer 1
raycaster.layers.set(1);
raycaster.setFromCamera(pointer, camera);
const hits = raycaster.intersectObjects(scene.children, true);
```

### Pointer Lock (FPS-Style)

```typescript
import { PointerLockControls } from "three/addons/controls/PointerLockControls.js";

const controls = new PointerLockControls(camera, renderer.domElement);

renderer.domElement.addEventListener("click", () => {
  controls.lock(); // Request pointer lock
});

controls.addEventListener("lock", () => console.log("Pointer locked"));
controls.addEventListener("unlock", () => showPauseMenu());

// In game loop — movement handled via keyboard; PointerLockControls handles look
```

---

## Touch Input

Use `PointerEvent` instead of separate `TouchEvent` and `MouseEvent` handlers — pointer events unify mouse, touch, and pen. Set `touch-action: none` on the canvas to prevent browser gestures (scroll, zoom) from interfering:

```css
canvas { touch-action: none; }
```

### Virtual Joystick Pattern

```typescript
interface JoystickState {
  active: boolean;
  dx: number; // -1 to 1
  dy: number; // -1 to 1
}

const joystick: JoystickState = { active: false, dx: 0, dy: 0 };
const maxRadius = 50; // pixels

let origin = { x: 0, y: 0 };

renderer.domElement.addEventListener("pointerdown", (e: PointerEvent) => {
  if (e.clientX < window.innerWidth / 2) { // Left half = joystick
    joystick.active = true;
    origin = { x: e.clientX, y: e.clientY };
  }
});

renderer.domElement.addEventListener("pointermove", (e: PointerEvent) => {
  if (!joystick.active) return;
  const rawDx = e.clientX - origin.x;
  const rawDy = e.clientY - origin.y;
  const dist = Math.sqrt(rawDx * rawDx + rawDy * rawDy);
  const clamp = Math.min(dist, maxRadius) / maxRadius;
  joystick.dx = (rawDx / (dist || 1)) * clamp;
  joystick.dy = (rawDy / (dist || 1)) * clamp;
});

renderer.domElement.addEventListener("pointerup", () => {
  joystick.active = false;
  joystick.dx = 0;
  joystick.dy = 0;
});
```

---

## Gamepad API

The browser Gamepad API provides access to USB and Bluetooth controllers. Three.js has no wrapper — use the native API directly:

```typescript
interface GamepadState {
  leftStick: { x: number; y: number };
  rightStick: { x: number; y: number };
  buttons: boolean[];
}

const gamepadState: GamepadState = {
  leftStick: { x: 0, y: 0 },
  rightStick: { x: 0, y: 0 },
  buttons: [],
};

const DEADZONE = 0.15;

function applyDeadzone(value: number): number {
  return Math.abs(value) < DEADZONE ? 0 : value;
}

// Poll every frame — gamepad state is snapshot-based, not event-driven
function pollGamepad(): void {
  const gamepads = navigator.getGamepads();
  const gp = gamepads[0]; // First connected controller
  if (!gp) return;

  gamepadState.leftStick.x  = applyDeadzone(gp.axes[0]);
  gamepadState.leftStick.y  = applyDeadzone(gp.axes[1]);
  gamepadState.rightStick.x = applyDeadzone(gp.axes[2]);
  gamepadState.rightStick.y = applyDeadzone(gp.axes[3]);
  gamepadState.buttons = gp.buttons.map((b) => b.pressed);
}

// Standard mapping (Xbox / PlayStation layout):
// buttons[0] = A/Cross, [1] = B/Circle, [2] = X/Square, [3] = Y/Triangle
// buttons[6] = LT, [7] = RT, [8] = Back/Select, [9] = Start
// buttons[12-15] = D-pad Up/Down/Left/Right
```

> **Tip:** Always check `gp.mapping === "standard"` — non-standard controllers may have different axis/button indices. Log `gp.id` during development to identify controllers.

---

## Built-In Controls Reference

Three.js ships several control classes in `three/addons/controls/`:

| Control | Use case | Input consumed |
|---------|----------|----------------|
| `OrbitControls` | Editor, spectator, strategy cam | Mouse drag + scroll + touch |
| `MapControls` | Top-down / RTS camera | Mouse drag + scroll (no rotation lock) |
| `PointerLockControls` | First-person shooter | Mouse movement (raw) |
| `DragControls` | Object dragging / puzzle games | Mouse / touch drag on objects |
| `TransformControls` | Level editor gizmos | Mouse drag on axes handles |
| `FlyControls` | Free flight | Keyboard WASD + mouse look |
| `FirstPersonControls` | Simple FPS (no pointer lock) | Mouse + keyboard |
| `TrackballControls` | Unconstrained orbiting | Mouse drag |

### Combining Controls with Game Input

A common pattern is to use `PointerLockControls` for camera look while handling movement yourself:

```typescript
import { PointerLockControls } from "three/addons/controls/PointerLockControls.js";

const controls = new PointerLockControls(camera, renderer.domElement);
scene.add(controls.object);

function update(delta: number) {
  const speed = 10 * delta;
  if (keys.get("KeyW")) controls.moveForward(speed);
  if (keys.get("KeyS")) controls.moveForward(-speed);
  if (keys.get("KeyA")) controls.moveRight(-speed);
  if (keys.get("KeyD")) controls.moveRight(speed);
}
```

---

## Unified Input Manager Pattern

For production games, wrap all input sources into a single abstraction:

```typescript
export interface InputState {
  moveX: number;       // -1 to 1
  moveY: number;       // -1 to 1
  lookX: number;       // -1 to 1 (or raw delta for mouse)
  lookY: number;       // -1 to 1
  jump: boolean;
  attack: boolean;
  interact: boolean;
}

export class InputManager {
  private keys = new Map<string, boolean>();
  private gamepadIndex = -1;
  public state: InputState = { moveX: 0, moveY: 0, lookX: 0, lookY: 0, jump: false, attack: false, interact: false };

  constructor(canvas: HTMLCanvasElement) {
    window.addEventListener("keydown", (e) => this.keys.set(e.code, true));
    window.addEventListener("keyup", (e) => this.keys.set(e.code, false));
    window.addEventListener("gamepadconnected", (e) => { this.gamepadIndex = e.gamepad.index; });
    window.addEventListener("gamepaddisconnected", () => { this.gamepadIndex = -1; });
  }

  update(): void {
    // Reset
    const s = this.state;
    s.moveX = 0; s.moveY = 0; s.lookX = 0; s.lookY = 0;
    s.jump = false; s.attack = false; s.interact = false;

    // Keyboard
    if (this.keys.get("KeyD") || this.keys.get("ArrowRight")) s.moveX += 1;
    if (this.keys.get("KeyA") || this.keys.get("ArrowLeft"))  s.moveX -= 1;
    if (this.keys.get("KeyW") || this.keys.get("ArrowUp"))    s.moveY -= 1;
    if (this.keys.get("KeyS") || this.keys.get("ArrowDown"))  s.moveY += 1;
    if (this.keys.get("Space")) s.jump = true;
    if (this.keys.get("KeyE"))  s.interact = true;

    // Gamepad (overrides if connected and active)
    const gp = this.gamepadIndex >= 0 ? navigator.getGamepads()[this.gamepadIndex] : null;
    if (gp) {
      const lx = Math.abs(gp.axes[0]) > 0.15 ? gp.axes[0] : 0;
      const ly = Math.abs(gp.axes[1]) > 0.15 ? gp.axes[1] : 0;
      if (lx || ly) { s.moveX = lx; s.moveY = ly; }
      const rx = Math.abs(gp.axes[2]) > 0.15 ? gp.axes[2] : 0;
      const ry = Math.abs(gp.axes[3]) > 0.15 ? gp.axes[3] : 0;
      if (rx || ry) { s.lookX = rx; s.lookY = ry; }
      if (gp.buttons[0]?.pressed) s.jump = true;
      if (gp.buttons[7]?.pressed) s.attack = true;
      if (gp.buttons[2]?.pressed) s.interact = true;
    }
  }

  dispose(): void {
    // Remove listeners in production code
  }
}
```

---

## WebXR Input (VR/AR Controllers)

Three.js has first-class WebXR support via `WebXRManager`:

```typescript
import { WebGLRenderer } from "three";

const renderer = new WebGLRenderer({ antialias: true });
renderer.xr.enabled = true;

// Get controllers
const controller0 = renderer.xr.getController(0);
const controller1 = renderer.xr.getController(1);
scene.add(controller0, controller1);

controller0.addEventListener("selectstart", () => { /* trigger pressed */ });
controller0.addEventListener("selectend",   () => { /* trigger released */ });
controller0.addEventListener("squeeze",     () => { /* grip pressed */ });

// Controller grip models (visual representation)
const grip0 = renderer.xr.getControllerGrip(0);
scene.add(grip0);
```

> **Note:** XR input is event-driven and frame-synced to the XR session — do not poll `navigator.getGamepads()` for XR controllers.

---

## Performance Considerations

| Concern | Recommendation |
|---------|---------------|
| Raycasting cost | Test against a small subset, not the whole scene. Use `Layers` or spatial structures. |
| Event handler frequency | `pointermove` fires at screen refresh rate — debounce if you only need periodic updates. |
| Gamepad polling | Poll once per frame in your game loop. `navigator.getGamepads()` returns a snapshot, not live state. |
| Mobile touch | Set `touch-action: none` on canvas. Use `PointerEvent` API — it handles touch + mouse. |
| Pointer lock | Falls back gracefully — always handle the `unlock` event for pause menus. |
| Memory leaks | Remove event listeners on scene teardown. Use `AbortController` for clean cleanup. |

---

## Common Pitfalls

1. **Using `e.key` instead of `e.code`** — breaks on non-QWERTY layouts.
2. **Moving objects inside event handlers** — causes frame-rate-dependent speed. Always read state in your game loop.
3. **Forgetting `preventDefault()`** — arrow keys scroll the page, space scrolls, Tab changes focus. Call `e.preventDefault()` for keys your game uses.
4. **Raycasting the entire scene** — extremely slow with complex scenes. Filter targets.
5. **Not handling `visibilitychange`** — if the user tabs away, `keyup` events are lost. Clear all key state on `document.addEventListener("visibilitychange", ...)`.
