# Babylon.js Input Handling & Camera Systems

> **Category:** guide · **Engine:** Babylon.js v7+ · **Related:** [Architecture Overview](../architecture/E1_architecture_overview.md), [Animation System](G2_animation_system.md), [Babylon.js Rules](../babylonjs-rules.md)

Babylon.js provides a composable input system where each camera type has an `InputManager` that treats input sources (mouse, keyboard, gamepad, touch, device orientation) as swappable plugins. This design lets you build custom control schemes — third-person orbiting, first-person WASD, twin-stick gamepad — by mixing and matching input components.

## Camera Types for Games

### UniversalCamera (First-Person / Exploration)

The default camera for most games. Combines keyboard movement (WASD/arrows) with mouse-look out of the box:

```typescript
import { UniversalCamera, Vector3 } from "@babylonjs/core";

const camera = new UniversalCamera("playerCam", new Vector3(0, 1.8, -5), scene);
camera.attachControl(canvas, true); // activates all default inputs

// Movement speed (units per second)
camera.speed = 0.5;

// Mouse look sensitivity
camera.angularSensibility = 2000; // higher = slower rotation

// Collision with scene geometry
camera.checkCollisions = true;
camera.ellipsoid = new Vector3(0.5, 0.9, 0.5); // player capsule
```

### ArcRotateCamera (Third-Person / Orbit)

Orbits around a target point — ideal for third-person, strategy, or inspect-mode cameras:

```typescript
import { ArcRotateCamera, Vector3 } from "@babylonjs/core";

const camera = new ArcRotateCamera(
  "orbitCam",
  Math.PI / 4,  // alpha — horizontal angle
  Math.PI / 3,  // beta — vertical angle
  10,           // radius — distance from target
  Vector3.Zero(), // target point
  scene
);
camera.attachControl(canvas, true);

// Clamp zoom range
camera.lowerRadiusLimit = 3;
camera.upperRadiusLimit = 30;

// Clamp vertical angle (prevent flipping under ground)
camera.lowerBetaLimit = 0.1;
camera.upperBetaLimit = Math.PI / 2;

// Smooth inertia on rotation (0 = instant, 1 = never stops)
camera.inertia = 0.7;

// Follow a player mesh
scene.onBeforeRenderObservable.add(() => {
  camera.target = playerMesh.position.clone();
});
```

### FollowCamera

Automatically tracks a target mesh with configurable height, distance, and damping:

```typescript
import { FollowCamera, Vector3 } from "@babylonjs/core";

const camera = new FollowCamera("followCam", new Vector3(0, 10, -10), scene);
camera.lockedTarget = playerMesh;
camera.radius = 8;             // distance behind target
camera.heightOffset = 4;       // height above target
camera.rotationOffset = 180;   // degrees behind target
camera.cameraAcceleration = 0.05; // chase damping (0–1)
camera.maxCameraSpeed = 10;
```

## The Input Manager System

Every camera exposes an `inputs` property — an `InputManager` that manages attached input plugins.

### Listing Attached Inputs

```typescript
// See what's attached
console.log(camera.inputs.attached);
// { keyboard: FreeCameraKeyboardMoveInput, mouse: FreeCameraMouseInput, ... }
```

### Adding and Removing Inputs

```typescript
// Add gamepad input
camera.inputs.addGamepad();

// Remove mouse input
camera.inputs.remove(camera.inputs.attached.mouse);

// Remove by class name string
camera.inputs.removeByType("FreeCameraKeyboardMoveInput");

// Clear ALL inputs (for fully custom control)
camera.inputs.clear();
```

### Shorthand Methods by Camera Type

**UniversalCamera / FreeCamera:**
`addKeyboard()`, `addMouse()`, `addGamepad()`, `addDeviceOrientation()`, `addTouch()`

**ArcRotateCamera:**
`addKeyboard()`, `addMouseWheel()`, `addPointers()`, `addGamepad()`

### Tuning Sensitivity

Each attached input exposes its own sensitivity properties:

```typescript
// Gamepad rotation sensitivity (higher = slower)
camera.inputs.attached.gamepad.gamepadAngularSensibility = 250;

// Mouse rotation sensitivity for ArcRotateCamera
camera.inputs.attached.pointers.angularSensibilityX = 1000;
camera.inputs.attached.pointers.angularSensibilityY = 1000;

// Keyboard movement speed (for FreeCamera-family)
camera.inputs.attached.keyboard.keysUp = [87]; // W
camera.inputs.attached.keyboard.keysDown = [83]; // S
camera.inputs.attached.keyboard.keysLeft = [65]; // A
camera.inputs.attached.keyboard.keysRight = [68]; // D
```

## Building Custom Inputs

For game-specific controls (e.g., RTS camera with edge-pan, twin-stick controller, touch-to-move), implement the `ICameraInput` interface:

```typescript
import { ICameraInput, UniversalCamera } from "@babylonjs/core";

class EdgePanInput implements ICameraInput<UniversalCamera> {
  camera!: UniversalCamera;
  private _edgeThreshold = 50; // pixels from screen edge
  private _panSpeed = 0.3;

  getClassName(): string {
    return "EdgePanInput";
  }

  getSimpleName(): string {
    return "edgePan"; // accessed as camera.inputs.attached.edgePan
  }

  attachControl(noPreventDefault?: boolean): void {
    const canvas = this.camera.getEngine().getRenderingCanvas();
    if (!canvas) return;

    canvas.addEventListener("mousemove", this._onMouseMove);
  }

  detachControl(): void {
    const canvas = this.camera.getEngine().getRenderingCanvas();
    if (!canvas) return;

    canvas.removeEventListener("mousemove", this._onMouseMove);
  }

  // Called every frame — do the actual movement here
  checkInputs(): void {
    // Edge-pan logic: move camera when cursor near canvas edge
  }

  private _onMouseMove = (evt: MouseEvent): void => {
    // Store mouse position for checkInputs()
  };
}

// Register it
camera.inputs.add(new EdgePanInput());
```

### Required Interface Methods

| Method | Purpose |
|--------|---------|
| `getClassName()` | Serialization identifier |
| `getSimpleName()` | Key in `camera.inputs.attached` |
| `attachControl(noPreventDefault?)` | Bind event listeners |
| `detachControl()` | Unbind listeners and release resources |
| `checkInputs()` | (optional) Per-frame logic — called during the render loop |

### Pointer Inputs Shortcut — BaseCameraPointersInput

For pointer-based controls (mouse, touch, pen), extend `BaseCameraPointersInput` instead of implementing from scratch. It handles pointer capture, preventDefault, and multi-touch automatically:

```typescript
import { BaseCameraPointersInput, ArcRotateCamera } from "@babylonjs/core";

class PinchZoomInput extends BaseCameraPointersInput {
  camera!: ArcRotateCamera;

  getClassName(): string { return "PinchZoomInput"; }
  getSimpleName(): string { return "pinchZoom"; }

  onTouch(point: any, offsetX: number, offsetY: number): void {
    // Single-finger drag
  }

  onMultiTouch(
    pointA: any, pointB: any,
    previousPinchSquaredDistance: number,
    pinchSquaredDistance: number
  ): void {
    // Pinch zoom — adjust camera.radius
    const delta = pinchSquaredDistance - previousPinchSquaredDistance;
    this.camera.radius -= delta * 0.001;
  }
}
```

## Game-Specific Patterns

### Pointer Lock (FPS Games)

```typescript
const canvas = engine.getRenderingCanvas()!;

canvas.addEventListener("click", () => {
  canvas.requestPointerLock();
});

// UniversalCamera mouse input works automatically with pointer lock
camera.inputs.attached.mouse.touchEnabled = false; // desktop FPS: ignore touch
```

### Switching Camera Modes at Runtime

```typescript
// Strategy: orbit mode → unit follow mode
function switchToFollowCamera(target: AbstractMesh): void {
  scene.activeCamera?.detachControl();

  const followCam = new FollowCamera("follow", new Vector3(0, 10, -10), scene);
  followCam.lockedTarget = target;
  followCam.radius = 6;
  followCam.heightOffset = 3;
  followCam.attachControl(canvas, true);
  scene.activeCamera = followCam;
}
```

### Gamepad Dead Zones

```typescript
// Prevent drift on analog sticks
if (camera.inputs.attached.gamepad) {
  camera.inputs.attached.gamepad.gamepadMoveSensibility = 150;
  camera.inputs.attached.gamepad.gamepadAngularSensibility = 300;
  // Dead zone is proportional to sensibility — higher values ignore small inputs
}
```

## Performance Notes

- `attachControl()` registers DOM event listeners. Call `detachControl()` when a camera is inactive (e.g., in a pause menu) to avoid unnecessary event processing.
- `checkInputs()` runs every frame on every attached input. Keep it lean — avoid allocations and DOM reads inside this method.
- For mobile games, prefer `addTouch()` over `addPointers()` if you only need touch (avoids mouse-event processing overhead on hybrid devices).
