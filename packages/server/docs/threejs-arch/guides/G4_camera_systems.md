# Three.js Camera Systems for Games

> **Category:** guide · **Engine:** Three.js r160+ · **Related:** [Architecture Overview](../architecture/E1_architecture_overview.md), [Physics with Rapier](G1_physics_rapier.md), [Three.js Rules](../threejs-rules.md)

Cameras define how players see the world. Three.js provides two core camera classes — `PerspectiveCamera` and `OrthographicCamera` — plus a library of built-in controls and community alternatives. This guide covers camera setup, game-ready control patterns, and performance tips.

---

## Camera Types

### PerspectiveCamera

The standard for 3D games. Objects farther away appear smaller — matching human visual expectation.

```typescript
import { PerspectiveCamera } from "three";

const camera = new PerspectiveCamera(
  70,                          // fov (vertical, degrees) — 60-90 typical for games
  window.innerWidth / window.innerHeight, // aspect
  0.1,                         // near clipping plane
  1000                         // far clipping plane
);
camera.position.set(0, 5, 10);
camera.lookAt(0, 0, 0);
```

**Game-relevant settings:**

| Parameter | Typical range | Notes |
|-----------|--------------|-------|
| `fov` | 60–90° | Lower = cinematic, higher = fast-paced FPS feel |
| `near` | 0.1–1.0 | Too small causes z-fighting; too large clips nearby objects |
| `far` | 100–10000 | Larger values waste depth buffer precision |

> **Performance tip:** Keep `near / far` ratio as small as possible. A camera with `near: 0.01, far: 100000` produces severe z-fighting. Prefer `near: 0.5, far: 500` and use fog to hide the far plane.

### OrthographicCamera

No perspective foreshortening — objects have constant screen size regardless of distance. Ideal for 2D-style games, RTS/top-down, isometric, and UI overlays.

```typescript
import { OrthographicCamera } from "three";

const frustumSize = 20;
const aspect = window.innerWidth / window.innerHeight;

const camera = new OrthographicCamera(
  -frustumSize * aspect / 2,  // left
   frustumSize * aspect / 2,  // right
   frustumSize / 2,           // top
  -frustumSize / 2,           // bottom
  0.1,                        // near
  1000                        // far
);
camera.position.set(10, 10, 10);
camera.lookAt(0, 0, 0);
```

> **Isometric setup:** Position the camera at `(d, d, d)` with `lookAt(0,0,0)` and set `camera.zoom` to control visible area. Call `camera.updateProjectionMatrix()` after changing zoom.

### Handling Resize

Both camera types require updates when the viewport changes:

```typescript
window.addEventListener("resize", () => {
  const w = window.innerWidth;
  const h = window.innerHeight;

  // PerspectiveCamera
  camera.aspect = w / h;
  camera.updateProjectionMatrix();

  renderer.setSize(w, h);
});
```

---

## Built-in Controls (three/addons)

Three.js ships several control classes as addons. Import from `three/addons/controls/`.

### OrbitControls — Third-Person / Debug

Orbits around a target point. Great for third-person cameras, editors, and debugging.

```typescript
import { OrbitControls } from "three/addons/controls/OrbitControls.js";

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;    // smooth deceleration
controls.dampingFactor = 0.08;
controls.minDistance = 2;         // prevent clipping into target
controls.maxDistance = 50;
controls.maxPolarAngle = Math.PI / 2; // prevent flipping below ground

// In your game loop:
function animate() {
  controls.update(); // required when damping is enabled
  renderer.render(scene, camera);
  requestAnimationFrame(animate);
}
```

**Game tips:**
- Set `controls.target` to the player mesh position each frame for a follow-cam.
- Use `controls.minPolarAngle` / `controls.maxPolarAngle` to restrict vertical orbit.
- Disable `controls.enablePan` for gameplay cameras (pan is usually editor-only).

### MapControls — RTS / Top-Down

Variant of OrbitControls pre-configured for map-style navigation: right-click orbits, left-click pans.

```typescript
import { MapControls } from "three/addons/controls/MapControls.js";

const controls = new MapControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.screenSpacePanning = false; // pans along the ground plane
controls.maxPolarAngle = Math.PI / 3; // keep camera above horizon
```

### PointerLockControls — First-Person

Locks the mouse cursor and maps mouse movement to camera rotation. Essential for FPS games.

```typescript
import { PointerLockControls } from "three/addons/controls/PointerLockControls.js";

const controls = new PointerLockControls(camera, renderer.domElement);

// Activate on click
document.addEventListener("click", () => controls.lock());

controls.addEventListener("lock", () => {
  // Hide menu, start gameplay
});

controls.addEventListener("unlock", () => {
  // Show pause menu
});

// Movement is manual — PointerLockControls only handles look direction
const velocity = new Vector3();
const direction = new Vector3();

function updateMovement(delta: number) {
  // Read WASD keys (track via keydown/keyup)
  direction.z = Number(moveForward) - Number(moveBackward);
  direction.x = Number(moveRight) - Number(moveLeft);
  direction.normalize();

  velocity.x -= velocity.x * 10.0 * delta; // friction
  velocity.z -= velocity.z * 10.0 * delta;

  velocity.z -= direction.z * 400.0 * delta;
  velocity.x -= direction.x * 400.0 * delta;

  controls.moveRight(-velocity.x * delta);
  controls.moveForward(-velocity.z * delta);
}
```

> **Browser note:** Pointer lock requires a user gesture (click) to activate and can be exited with Escape. Plan your UI around this.

### FlyControls — Free Camera / Spectator

Six-degrees-of-freedom movement with mouse look. Good for spectator modes and level editors.

```typescript
import { FlyControls } from "three/addons/controls/FlyControls.js";

const controls = new FlyControls(camera, renderer.domElement);
controls.movementSpeed = 20;
controls.rollSpeed = Math.PI / 6;
controls.dragToLook = true; // only rotate while mouse is held
```

---

## Community Alternative: camera-controls

The [`camera-controls`](https://github.com/yomotsu/camera-controls) library by yomotsu wraps Three.js cameras with smooth transitions, boundaries, and more game-friendly defaults than OrbitControls.

```typescript
import CameraControls from "camera-controls";
import * as THREE from "three";

CameraControls.install({ THREE });

const controls = new CameraControls(camera, renderer.domElement);

// Smooth transition to a new position over 1.5 seconds
controls.setLookAt(5, 3, 5, 0, 1, 0, true);

// Follow a target with offset
function followTarget(target: THREE.Object3D) {
  const pos = target.position;
  controls.setTarget(pos.x, pos.y, pos.z, true);
}
```

**Why use it over OrbitControls?**
- Built-in smooth transitions (`setLookAt`, `dollyTo`, `rotateTo`, all animatable).
- Boundary boxes and spheres for constraining the camera to a play area.
- Works with both PerspectiveCamera and OrthographicCamera.

---

## Game Camera Patterns

### Third-Person Follow Camera

```typescript
const cameraOffset = new Vector3(0, 4, -8);
const lerpFactor = 0.1;

function updateFollowCamera(player: Object3D) {
  // Desired position behind and above the player
  const desired = player.position.clone().add(
    cameraOffset.clone().applyQuaternion(player.quaternion)
  );

  // Smooth follow via lerp
  camera.position.lerp(desired, lerpFactor);
  camera.lookAt(player.position.clone().add(new Vector3(0, 1.5, 0)));
}
```

**Enhancements:**
- Add raycast from player to desired camera position to avoid clipping through walls.
- Increase lerp factor during fast movement, decrease when idle.

### Isometric Camera (fixed angle)

```typescript
const camera = new OrthographicCamera(/* ... */);
camera.position.set(20, 20, 20);
camera.lookAt(0, 0, 0);
camera.zoom = 2;
camera.updateProjectionMatrix();

// Smooth pan to follow player
function updateIsoCam(player: Object3D) {
  const target = player.position;
  camera.position.lerp(
    new Vector3(target.x + 20, 20, target.z + 20),
    0.05
  );
  camera.lookAt(target);
}
```

### Camera Shake

```typescript
function applyShake(intensity: number, decay: number) {
  const offset = new Vector3(
    (Math.random() - 0.5) * intensity,
    (Math.random() - 0.5) * intensity,
    0
  );
  camera.position.add(offset);
  // Decay intensity each frame
  return intensity * decay; // e.g., 0.92
}
```

---

## Performance Considerations

1. **Frustum culling** is automatic in Three.js — objects outside the camera frustum are not rendered. Ensure `object.frustumCulled = true` (the default).

2. **Camera.layers** can selectively render objects. Use layers to avoid rendering debug geometry in the gameplay camera:
   ```typescript
   debugHelper.layers.set(1);       // layer 1 = debug
   camera.layers.enable(1);         // toggle debug visibility
   ```

3. **Multiple cameras** (e.g., minimap + main view): render each with separate `renderer.setViewport()` and `renderer.setScissor()` calls. Clear between renders with `renderer.autoClear = false`.

4. **LOD with cameras:** Three.js `LOD` objects automatically switch detail based on camera distance. Place your `LOD` meshes in the scene and they respond to whichever camera renders them.

5. **Mobile:** Lower FOV (60°) reduces the visible scene area, cutting draw calls. Consider reducing the `far` plane aggressively and using fog.

---

## WebGPU Notes

Camera classes work identically with `WebGPURenderer`. No API changes required — the projection matrices are renderer-agnostic. Controls also work unchanged since they manipulate camera transforms, not rendering internals.
