# G1 — Physics with Havok (Physics V2)

> **Category:** guide · **Engine:** Babylon.js · **Related:** [Architecture Overview](../architecture/E1_architecture_overview.md), [Official Docs](https://doc.babylonjs.com/features/featuresDeepDive/physics/havokPlugin)

Babylon.js includes a production-grade physics system powered by **Havok**, a professional WASM physics engine used in AAA games. Physics V2 (introduced in Babylon.js 6.0) replaces the older V1 API with a cleaner, more capable architecture built around `PhysicsBody`, `PhysicsShape`, and `PhysicsAggregate`.

This guide covers setup, rigid bodies, collision detection, character controllers, and performance tuning.

---

## Setup

### Installation

```bash
npm install @babylonjs/core @babylonjs/havok
```

### Initialization

```typescript
import { Engine, Scene, Vector3 } from '@babylonjs/core';
import HavokPhysics from '@babylonjs/havok';
import { HavokPlugin } from '@babylonjs/core/Physics/v2/Plugins/havokPlugin';

const canvas = document.getElementById('canvas') as HTMLCanvasElement;
const engine = new Engine(canvas, true);
const scene = new Scene(engine);

// Initialize Havok WASM — async, do this during loading
const havokInstance = await HavokPhysics();
const havokPlugin = new HavokPlugin(true, havokInstance);

// Enable physics on the scene
scene.enablePhysics(new Vector3(0, -9.81, 0), havokPlugin);
```

The `true` parameter in `new HavokPlugin(true, ...)` enables debug logging during development. Set to `false` for production.

### WebGPU Setup

```typescript
import { WebGPUEngine } from '@babylonjs/core';

let engine: Engine;
if (navigator.gpu) {
  engine = new WebGPUEngine(canvas);
  await (engine as WebGPUEngine).initAsync();
} else {
  engine = new Engine(canvas, true);
}
// Physics setup is identical regardless of rendering backend
```

---

## PhysicsAggregate (Quick Setup)

`PhysicsAggregate` is the easiest way to add physics to a mesh. It creates both a `PhysicsBody` and `PhysicsShape` in one call.

```typescript
import {
  MeshBuilder, PhysicsAggregate, PhysicsShapeType
} from '@babylonjs/core';

// Static ground
const ground = MeshBuilder.CreateGround('ground', { width: 20, height: 20 }, scene);
const groundAggregate = new PhysicsAggregate(
  ground,
  PhysicsShapeType.BOX,
  { mass: 0, friction: 0.7, restitution: 0.3 },
  scene
);

// Dynamic box
const box = MeshBuilder.CreateBox('box', { size: 1 }, scene);
box.position.y = 5;
const boxAggregate = new PhysicsAggregate(
  box,
  PhysicsShapeType.BOX,
  { mass: 1, friction: 0.5, restitution: 0.4 },
  scene
);
```

### PhysicsShapeType Options

| Type | Constant | Use Case |
|------|----------|----------|
| Box | `PhysicsShapeType.BOX` | Crates, walls, platforms |
| Sphere | `PhysicsShapeType.SPHERE` | Balls, projectiles |
| Capsule | `PhysicsShapeType.CAPSULE` | Characters |
| Cylinder | `PhysicsShapeType.CYLINDER` | Barrels, pillars |
| Convex Hull | `PhysicsShapeType.CONVEX_HULL` | Dynamic objects with complex shapes |
| Mesh | `PhysicsShapeType.MESH` | Static geometry only — expensive |
| Heightfield | `PhysicsShapeType.HEIGHTFIELD` | Terrain |

### PhysicsAggregate Parameters

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `mass` | `number` | `0` | 0 = static, >0 = dynamic |
| `friction` | `number` | `0.2` | Surface friction coefficient |
| `restitution` | `number` | `0` | Bounciness (0–1) |
| `startAsleep` | `boolean` | `false` | Body starts sleeping until disturbed |

---

## PhysicsBody + PhysicsShape (Full Control)

For advanced setups — compound shapes, collision filtering, trigger volumes — use the lower-level API directly.

```typescript
import {
  PhysicsBody, PhysicsShape, PhysicsShapeBox, PhysicsShapeSphere,
  PhysicsShapeContainer, PhysicsMotionType
} from '@babylonjs/core';

// Create a body
const body = new PhysicsBody(
  mesh,                          // the TransformNode to attach to
  PhysicsMotionType.DYNAMIC,     // STATIC, DYNAMIC, or ANIMATED
  false,                         // startAsleep
  scene
);

// Create a compound shape (e.g., a tank = box hull + sphere turret)
const container = new PhysicsShapeContainer(scene);
const hullShape = new PhysicsShapeBox(
  new Vector3(0, 0, 0),         // center offset
  new Quaternion(0, 0, 0, 1),   // rotation
  new Vector3(2, 0.5, 3),       // half-extents
  scene
);
const turretShape = new PhysicsShapeSphere(
  new Vector3(0, 0.8, -0.5),   // center offset
  0.6,                           // radius
  scene
);
container.addChild(hullShape);
container.addChild(turretShape);

body.shape = container;
body.setMassProperties({ mass: 5, centerOfMass: new Vector3(0, -0.2, 0) });
```

### Motion Types

| Type | Constant | Behavior |
|------|----------|----------|
| Static | `PhysicsMotionType.STATIC` | Immovable. Walls, floors, world geometry. |
| Dynamic | `PhysicsMotionType.DYNAMIC` | Fully simulated. Players, projectiles, crates. |
| Animated | `PhysicsMotionType.ANIMATED` | Script-controlled position. Moving platforms, elevators. Physics pushes other objects but the body itself is moved programmatically. |

---

## Applying Forces and Impulses

```typescript
const body = boxAggregate.body;

// Continuous force — apply every frame (e.g., thrust, wind)
body.applyForce(
  new Vector3(0, 0, -100),  // force vector (Newtons)
  mesh.getAbsolutePosition() // application point (world space)
);

// One-shot impulse — apply once (e.g., jump, explosion)
body.applyImpulse(
  new Vector3(0, 10, 0),    // impulse (kg⋅m/s)
  mesh.getAbsolutePosition()
);

// Set velocity directly (e.g., character controller)
body.setLinearVelocity(new Vector3(5, 0, 0));
body.setAngularVelocity(new Vector3(0, 2, 0));

// Damping — reduce velocity over time (drag)
body.setLinearDamping(0.1);
body.setAngularDamping(0.5);
```

---

## Collision Events

Physics V2 provides collision events through observables on the `HavokPlugin`:

```typescript
const havokPlugin = scene.getPhysicsEngine()!.getPhysicsPlugin() as HavokPlugin;

// Collision started
havokPlugin.onCollisionStartedObservable.add((event) => {
  const bodyA = event.collider;    // PhysicsBody
  const bodyB = event.collidedAgainst; // PhysicsBody
  const meshA = bodyA.transformNode;
  const meshB = bodyB.transformNode;

  console.log(`${meshA.name} hit ${meshB.name}`);

  // Access contact point and normal
  const contactPoint = event.point;   // Vector3
  const contactNormal = event.normal; // Vector3
});

// Collision ended
havokPlugin.onCollisionEndedObservable.add((event) => {
  console.log('Collision ended:', event.collider.transformNode.name);
});
```

### Trigger Volumes (Sensors)

Trigger volumes detect overlaps without physical response — useful for pickup zones, damage areas, or checkpoints.

```typescript
// Create a trigger zone
const triggerMesh = MeshBuilder.CreateBox('trigger', { size: 3 }, scene);
triggerMesh.isVisible = false; // invisible in-game

const triggerAggregate = new PhysicsAggregate(
  triggerMesh,
  PhysicsShapeType.BOX,
  { mass: 0 },
  scene
);

// Mark the shape as a trigger
triggerAggregate.shape.isTrigger = true;

// Listen for trigger events
havokPlugin.onTriggerCollisionObservable.add((event) => {
  const triggerBody = event.collider;
  const enteringBody = event.collidedAgainst;
  const type = event.type; // 'TRIGGER_ENTERED' or 'TRIGGER_EXITED'

  if (type === 'TRIGGER_ENTERED') {
    console.log(`${enteringBody.transformNode.name} entered trigger zone`);
  }
});
```

---

## Raycasting

```typescript
const physicsEngine = scene.getPhysicsEngine()!;

// Cast a ray from origin along direction
const raycastResult = physicsEngine.raycast(
  new Vector3(0, 5, 0),     // origin
  new Vector3(0, -1, 0),    // direction (normalized)
  100                         // max distance
);

if (raycastResult.hasHit) {
  const hitPoint = raycastResult.hitPointWorld;     // Vector3
  const hitNormal = raycastResult.hitNormalWorld;    // Vector3
  const hitBody = raycastResult.body;                // PhysicsBody
  const hitDistance = raycastResult.hitDistance;

  console.log(`Hit ${hitBody?.transformNode.name} at distance ${hitDistance}`);
}
```

---

## Character Controller

Babylon.js provides a built-in `PhysicsCharacterController` for first/third-person characters:

```typescript
import { PhysicsCharacterController } from '@babylonjs/core';

const characterMesh = MeshBuilder.CreateCapsule('player', {
  height: 1.8,
  radius: 0.3
}, scene);

// Create physics aggregate for the character
const characterAggregate = new PhysicsAggregate(
  characterMesh,
  PhysicsShapeType.CAPSULE,
  { mass: 70, friction: 0.5 },
  scene
);

// Movement in update loop
scene.onBeforeRenderObservable.add(() => {
  const body = characterAggregate.body;
  const moveDir = new Vector3(0, 0, 0);

  // WASD input
  if (inputMap['w']) moveDir.z = 1;
  if (inputMap['s']) moveDir.z = -1;
  if (inputMap['a']) moveDir.x = -1;
  if (inputMap['d']) moveDir.x = 1;

  // Normalize and scale to speed
  if (moveDir.length() > 0) {
    moveDir.normalize().scaleInPlace(5); // 5 m/s
  }

  // Preserve vertical velocity (gravity), override horizontal
  const currentVel = body.getLinearVelocity();
  body.setLinearVelocity(new Vector3(moveDir.x, currentVel.y, moveDir.z));

  // Jump — only if grounded (raycast downward)
  if (inputMap[' ']) {
    const ray = scene.getPhysicsEngine()!.raycast(
      characterMesh.position,
      new Vector3(0, -1, 0),
      1.0 // slightly more than character half-height
    );
    if (ray.hasHit && ray.hitDistance < 0.95) {
      body.applyImpulse(
        new Vector3(0, 400, 0),
        characterMesh.getAbsolutePosition()
      );
    }
  }
});
```

---

## Collision Filtering

Collision filtering uses membership and collision masks (bitmasks):

```typescript
// Define groups
const GROUP_PLAYER = 1;      // bit 0
const GROUP_ENEMY = 2;       // bit 1
const GROUP_TERRAIN = 4;     // bit 2
const GROUP_PROJECTILE = 8;  // bit 3

// Player collides with terrain and enemies
const playerShape = new PhysicsShapeCapsule(
  new Vector3(0, 0, 0),
  new Vector3(0, 1.8, 0),
  0.3,
  scene
);
playerShape.filterMembershipMask = GROUP_PLAYER;
playerShape.filterCollideMask = GROUP_TERRAIN | GROUP_ENEMY;

// Player projectile collides with terrain and enemies, not player
const bulletShape = new PhysicsShapeSphere(
  new Vector3(0, 0, 0), 0.05, scene
);
bulletShape.filterMembershipMask = GROUP_PROJECTILE;
bulletShape.filterCollideMask = GROUP_TERRAIN | GROUP_ENEMY;
```

---

## Debugging Physics

```typescript
// Visual debug overlay — shows collider wireframes
import { PhysicsViewer } from '@babylonjs/core/Debug';

const physicsViewer = new PhysicsViewer(scene);

// Show physics shapes for all meshes
for (const mesh of scene.meshes) {
  if (mesh.physicsBody) {
    physicsViewer.showBody(mesh.physicsBody);
  }
}

// Or use the Inspector (includes physics visualization)
scene.debugLayer.show();
```

---

## Performance Considerations

| Concern | Guideline |
|---------|-----------|
| **Body count** | < 300 dynamic bodies on mobile, < 1000 on desktop |
| **Mesh colliders** | Use only for static geometry. Prefer boxes, capsules, convex hulls for dynamic objects. |
| **Sleep** | Havok auto-sleeps resting bodies. Don't apply micro-forces that prevent sleep. |
| **SceneOptimizer** | Use `SceneOptimizer` to auto-degrade rendering quality if FPS drops — keeps physics budget intact. |
| **Freeze** | Call `scene.freezeActiveMeshes()` for static scenes. Does not affect physics — only rendering. |
| **Dispose** | Call `aggregate.dispose()` or `body.dispose()` when removing objects. Havok does not garbage collect. |
| **WASM size** | Havok WASM is ~1 MB. Load during splash screen. |
| **Substeps** | Default is 1 substep per frame. Increase for accuracy at the cost of CPU: `scene.getPhysicsEngine().setSubTimeStep(2)`. |

---

## Complete Minimal Example

```typescript
import {
  Engine, Scene, Vector3, Color3, ArcRotateCamera,
  HemisphericLight, MeshBuilder, StandardMaterial,
  PhysicsAggregate, PhysicsShapeType
} from '@babylonjs/core';
import { HavokPlugin } from '@babylonjs/core/Physics/v2/Plugins/havokPlugin';
import HavokPhysics from '@babylonjs/havok';

async function main(): Promise<void> {
  const canvas = document.getElementById('canvas') as HTMLCanvasElement;
  const engine = new Engine(canvas, true);
  const scene = new Scene(engine);

  // Camera
  const camera = new ArcRotateCamera('cam', -Math.PI / 2, Math.PI / 3, 15, Vector3.Zero(), scene);
  camera.attachControl(canvas, true);

  // Light
  new HemisphericLight('light', new Vector3(0, 1, 0), scene);

  // Physics
  const havok = await HavokPhysics();
  scene.enablePhysics(new Vector3(0, -9.81, 0), new HavokPlugin(true, havok));

  // Ground
  const ground = MeshBuilder.CreateGround('ground', { width: 20, height: 20 }, scene);
  const groundMat = new StandardMaterial('groundMat', scene);
  groundMat.diffuseColor = new Color3(0.4, 0.5, 0.4);
  ground.material = groundMat;
  new PhysicsAggregate(ground, PhysicsShapeType.BOX, { mass: 0, friction: 0.7 }, scene);

  // Spawn falling boxes
  for (let i = 0; i < 15; i++) {
    const box = MeshBuilder.CreateBox(`box${i}`, { size: 0.5 + Math.random() * 0.8 }, scene);
    box.position.set(
      (Math.random() - 0.5) * 6,
      3 + i * 1.5,
      (Math.random() - 0.5) * 6
    );
    const mat = new StandardMaterial(`mat${i}`, scene);
    mat.diffuseColor = Color3.FromHSV(Math.random() * 360, 0.7, 0.8);
    box.material = mat;

    new PhysicsAggregate(box, PhysicsShapeType.BOX, {
      mass: 1,
      friction: 0.5,
      restitution: 0.3
    }, scene);
  }

  // Render loop
  engine.runRenderLoop(() => scene.render());
  window.addEventListener('resize', () => engine.resize());
}

main();
```
