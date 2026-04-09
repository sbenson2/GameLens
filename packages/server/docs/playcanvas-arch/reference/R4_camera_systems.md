# Camera Systems & Controls

> **Category:** reference · **Engine:** PlayCanvas · **Related:** [G1 Scripting System](../guides/G1_scripting_system.md), [G6 Input Handling](../guides/G6_input_handling.md), [E1 Architecture Overview](../architecture/E1_architecture_overview.md)

PlayCanvas uses an entity-component architecture where cameras are entities with a `camera` component attached. Camera behavior is driven by scripts — there is no built-in "camera controller" component, so game developers build their own from PlayCanvas's input, transform, and physics APIs. This reference covers the three most common camera patterns for games: first-person, third-person orbit, and smooth follow cameras.

---

## Camera Component Basics

Every camera in PlayCanvas is an `Entity` with the `camera` component enabled:

```typescript
import { Entity, PROJECTION_PERSPECTIVE, Color } from "playcanvas";

const cameraEntity = new Entity("MainCamera");
cameraEntity.addComponent("camera", {
  clearColor: new Color(0.1, 0.1, 0.15),
  projection: PROJECTION_PERSPECTIVE,
  fov: 60,
  nearClip: 0.1,
  farClip: 1000,
});
app.root.addChild(cameraEntity);
```

Key properties on the camera component:

| Property | Type | Description |
|----------|------|-------------|
| `fov` | number | Vertical field of view in degrees |
| `nearClip` / `farClip` | number | Clipping planes |
| `projection` | enum | `PROJECTION_PERSPECTIVE` or `PROJECTION_ORTHOGRAPHIC` |
| `clearColor` | Color | Background clear color |
| `priority` | number | Render order when multiple cameras exist |
| `layers` | number[] | Which layers this camera renders |

---

## First-Person Camera

A first-person camera is parented to the player entity and rotated by mouse input. Movement forces are applied to the player's rigidbody.

```typescript
import {
  Script, Entity, Vec3, Vec2, Mouse, EVENT_MOUSEMOVE,
  EVENT_MOUSEDOWN, KEY_W, KEY_A, KEY_S, KEY_D, KEY_SPACE,
  math
} from "playcanvas";

export class FirstPersonCamera extends Script {
  static scriptName = "firstPersonCamera";

  /** Movement force magnitude */
  power = 2500;
  /** Mouse sensitivity (degrees per pixel) */
  lookSpeed = 0.12;
  /** Max vertical look angle */
  maxPitch = 89;

  private eulers = new Vec2(0, 0);  // x = pitch, y = yaw
  private camera: Entity | null = null;
  private force = new Vec3();

  initialize(): void {
    // Find or create camera child
    this.camera = this.entity.findByName("Camera") as Entity;

    // Pointer lock on click
    this.app.mouse.on(EVENT_MOUSEDOWN, () => {
      this.app.mouse.enablePointerLock();
    });

    // Mouse look
    this.app.mouse.on(EVENT_MOUSEMOVE, (event) => {
      if (Mouse.isPointerLocked()) {
        this.eulers.x -= event.dy * this.lookSpeed;
        this.eulers.y -= event.dx * this.lookSpeed;

        // Clamp pitch to prevent flipping
        this.eulers.x = math.clamp(
          this.eulers.x, -this.maxPitch, this.maxPitch
        );
      }
    });
  }

  update(dt: number): void {
    if (!this.camera) return;

    // Apply rotation — yaw on player entity, pitch on camera
    this.entity.setLocalEulerAngles(0, this.eulers.y, 0);
    this.camera.setLocalEulerAngles(this.eulers.x, 0, 0);

    // Movement relative to camera facing direction
    const forward = this.camera.forward;
    const right = this.camera.right;
    const kb = this.app.keyboard;

    this.force.set(0, 0, 0);

    if (kb.isPressed(KEY_W)) this.force.add(forward);
    if (kb.isPressed(KEY_S)) this.force.sub(forward);
    if (kb.isPressed(KEY_D)) this.force.add(right);
    if (kb.isPressed(KEY_A)) this.force.sub(right);

    // Zero out vertical component for ground movement
    this.force.y = 0;

    if (this.force.lengthSq() > 0) {
      this.force.normalize().mulScalar(this.power);
      this.entity.rigidbody?.applyForce(this.force);
    }

    // Jump
    if (kb.wasPressed(KEY_SPACE)) {
      this.entity.rigidbody?.applyImpulse(new Vec3(0, 300, 0));
    }
  }
}
```

### Entity Setup

The player entity needs collision and rigidbody components:

```typescript
const player = new Entity("Player");
player.addComponent("collision", {
  type: "capsule",
  height: 1.8,
  radius: 0.3,
});
player.addComponent("rigidbody", {
  type: "dynamic",
  mass: 80,
  linearDamping: 0.95,   // prevents sliding on stop
  angularFactor: Vec3.ZERO, // prevent physics from rotating the player
});
player.addComponent("script");
player.script.create("firstPersonCamera");

// Camera as child entity
const cam = new Entity("Camera");
cam.addComponent("camera", { fov: 60 });
cam.setLocalPosition(0, 0.8, 0);  // eye height
player.addChild(cam);
```

---

## Third-Person Orbit Camera

An orbit camera rotates around a target entity at a fixed distance, controlled by mouse drag:

```typescript
import {
  Script, Entity, Vec3, Vec2, math,
  EVENT_MOUSEMOVE, EVENT_MOUSEDOWN, MOUSEBUTTON_LEFT,
} from "playcanvas";

export class OrbitCamera extends Script {
  static scriptName = "orbitCamera";

  /** Entity to orbit around */
  target: Entity | null = null;
  /** Distance from target */
  distance = 8;
  /** Min/max zoom distance */
  minDistance = 2;
  maxDistance = 20;
  /** Orbit speed (degrees per pixel) */
  sensitivity = 0.25;
  /** Smoothing factor (0 = instant, higher = smoother) */
  smoothing = 0.92;

  private pitch = -20;          // current angles
  private yaw = 0;
  private targetPitch = -20;    // target angles (for smoothing)
  private targetYaw = 0;
  private dragging = false;

  initialize(): void {
    // Track mouse drag state
    this.app.mouse.on(EVENT_MOUSEDOWN, (event) => {
      if (event.button === MOUSEBUTTON_LEFT) {
        this.dragging = true;
        this.app.mouse.enablePointerLock();
      }
    });

    window.addEventListener("mouseup", () => {
      this.dragging = false;
    });

    this.app.mouse.on(EVENT_MOUSEMOVE, (event) => {
      if (this.dragging) {
        this.targetYaw -= event.dx * this.sensitivity;
        this.targetPitch -= event.dy * this.sensitivity;
        this.targetPitch = math.clamp(this.targetPitch, -80, 80);
      }
    });

    // Scroll to zoom
    window.addEventListener("wheel", (event: WheelEvent) => {
      this.distance += event.deltaY * 0.01;
      this.distance = math.clamp(
        this.distance, this.minDistance, this.maxDistance
      );
    });
  }

  update(dt: number): void {
    if (!this.target) return;

    // Smooth interpolation toward target angles
    this.pitch = math.lerp(this.pitch, this.targetPitch, 1 - this.smoothing);
    this.yaw = math.lerp(this.yaw, this.targetYaw, 1 - this.smoothing);

    // Convert spherical coordinates to position offset
    const pitchRad = this.pitch * math.DEG_TO_RAD;
    const yawRad = this.yaw * math.DEG_TO_RAD;

    const offset = new Vec3(
      this.distance * Math.cos(pitchRad) * Math.sin(yawRad),
      this.distance * Math.sin(-pitchRad),
      this.distance * Math.cos(pitchRad) * Math.cos(yawRad)
    );

    const targetPos = this.target.getPosition();
    const camPos = new Vec3().add2(targetPos, offset);

    this.entity.setPosition(camPos);
    this.entity.lookAt(targetPos);
  }
}
```

---

## Smooth Follow Camera

For racing games, platformers, or any scenario where the camera trails behind a moving target:

```typescript
import { Script, Entity, Vec3, math } from "playcanvas";

export class FollowCamera extends Script {
  static scriptName = "followCamera";

  /** Entity to follow */
  target: Entity | null = null;
  /** Offset from target in target's local space */
  offset = new Vec3(0, 4, -10);
  /** Look-ahead offset (world Y) */
  lookOffset = new Vec3(0, 1.5, 0);
  /** Position smoothing (0–1, lower = snappier) */
  positionSmoothing = 0.05;
  /** Rotation smoothing */
  rotationSmoothing = 0.08;

  private currentPos = new Vec3();
  private currentLookAt = new Vec3();

  initialize(): void {
    if (this.target) {
      // Snap to initial position (no lerp on first frame)
      this.updateDesiredPosition(this.currentPos);
      this.entity.setPosition(this.currentPos);
    }
  }

  update(dt: number): void {
    if (!this.target) return;

    // Desired position: offset in target's local space
    const desiredPos = new Vec3();
    this.updateDesiredPosition(desiredPos);

    // Smooth position
    this.currentPos.lerp(this.currentPos, desiredPos, this.positionSmoothing);
    this.entity.setPosition(this.currentPos);

    // Smooth look-at
    const targetPos = this.target.getPosition();
    const lookTarget = new Vec3().add2(targetPos, this.lookOffset);
    this.currentLookAt.lerp(this.currentLookAt, lookTarget, this.rotationSmoothing);
    this.entity.lookAt(this.currentLookAt);
  }

  private updateDesiredPosition(out: Vec3): void {
    const targetTransform = this.target!.getWorldTransform();
    targetTransform.transformPoint(this.offset, out);
  }
}
```

### Collision Avoidance

Prevent the camera from clipping through walls using a raycast:

```typescript
update(dt: number): void {
  if (!this.target) return;

  const desiredPos = new Vec3();
  this.updateDesiredPosition(desiredPos);

  // Raycast from target to desired camera position
  const targetPos = this.target.getPosition();
  const result = this.app.systems.rigidbody?.raycastFirst(
    targetPos, desiredPos
  );

  if (result) {
    // Pull camera in front of the hit point
    const hitPos = result.point;
    const pullback = new Vec3().sub2(targetPos, hitPos).normalize().mulScalar(0.3);
    desiredPos.copy(hitPos).add(pullback);
  }

  this.currentPos.lerp(this.currentPos, desiredPos, this.positionSmoothing);
  this.entity.setPosition(this.currentPos);
  this.entity.lookAt(
    new Vec3().add2(this.target.getPosition(), this.lookOffset)
  );
}
```

---

## Camera Switching

Games often need to switch between cameras (gameplay → cutscene → security feed). Use the `camera` component's `enabled` property or `priority`:

```typescript
class CameraManager extends Script {
  static scriptName = "cameraManager";

  private cameras = new Map<string, Entity>();

  registerCamera(name: string, entity: Entity): void {
    this.cameras.set(name, entity);
  }

  switchTo(name: string): void {
    for (const [key, cam] of this.cameras) {
      const isActive = key === name;
      cam.camera!.enabled = isActive;
      // Also toggle audio listener if present
      if (cam.audiolistener) {
        cam.audiolistener.enabled = isActive;
      }
    }
  }
}
```

---

## Performance Considerations

| Concern | Guidance |
|---------|----------|
| **Smoothing & dt** | The `lerp`-based smoothing above is frame-rate dependent. For frame-rate independent smoothing, use `1 - Math.pow(smoothing, dt * 60)` as the interpolation factor. |
| **Raycasts** | `raycastFirst` is fast (single hit), but avoid calling it multiple times per frame. One raycast per camera update is fine. |
| **Multiple cameras** | Each enabled camera triggers a full render pass. Disable cameras you don't need. Use `priority` to control render order for split-screen or picture-in-picture. |
| **Clipping planes** | Keep `nearClip` as high as tolerable (≥0.1) and `farClip` as low as tolerable. This maximizes depth buffer precision and reduces Z-fighting. |
| **Mobile** | Pointer lock is not available on most mobile browsers. Fall back to touch input with virtual joystick for look controls. Use `app.touch` instead of `app.mouse`. |
| **FOV for speed** | Increasing FOV slightly at high speeds (e.g., in a racing game) sells the feeling of velocity. Lerp `camera.fov` between a base and max value based on the player's speed. |
