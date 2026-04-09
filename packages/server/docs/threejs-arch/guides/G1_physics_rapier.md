# G1 — Physics Integration with Rapier

> **Category:** guide · **Engine:** Three.js · **Related:** [Architecture Overview](../architecture/E1_architecture_overview.md), [Rapier Docs](https://rapier.rs/docs/user_guides/javascript/getting_started_js/)

Three.js is a rendering library — it has no built-in physics. The recommended physics engine for Three.js games is **Rapier**, a Rust-based WASM physics engine that is fast, deterministic, and well-maintained. Three.js ships an official `RapierPhysics` addon, but for full control you should use the Rapier API directly alongside Three.js.

This guide covers both approaches: the lightweight official addon and the full manual integration pattern.

---

## Installing Rapier

```bash
npm install @dimforge/rapier3d-compat
```

The `-compat` package uses standard WASM loading that works in all bundlers (Vite, webpack, Rollup). The non-compat package (`@dimforge/rapier3d`) uses top-level await and requires bundler support.

```typescript
import RAPIER from '@dimforge/rapier3d-compat';

// Must initialize WASM before use — call once at startup
await RAPIER.init();
```

---

## Approach 1: Official RapierPhysics Addon

Three.js includes a `RapierPhysics` helper in its addons. It provides a thin wrapper that automatically syncs rigid bodies to Three.js meshes.

```typescript
import * as THREE from 'three';
import { RapierPhysics } from 'three/addons/physics/RapierPhysics.js';

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight);
camera.position.set(0, 5, 10);

const renderer = new THREE.WebGPURenderer({ antialias: true });
await renderer.init();
renderer.setSize(window.innerWidth, window.innerHeight);

// Create a static floor (mass = 0 → static body)
const floor = new THREE.Mesh(
  new THREE.BoxGeometry(10, 0.2, 10),
  new THREE.MeshStandardMaterial({ color: 0x888888 })
);
floor.position.y = -0.1;
floor.userData.physics = { mass: 0 };
scene.add(floor);

// Create a dynamic box (mass > 0 → dynamic body)
const box = new THREE.Mesh(
  new THREE.BoxGeometry(1, 1, 1),
  new THREE.MeshStandardMaterial({ color: 0xff4444 })
);
box.position.set(0, 5, 0);
box.userData.physics = { mass: 1, restitution: 0.5 };
scene.add(box);

// Initialize physics — reads userData.physics from all meshes in the scene
const physics = await RapierPhysics();
physics.addScene(scene);

// Render loop — physics updates automatically
renderer.setAnimationLoop(() => {
  renderer.render(scene, camera);
});
```

### userData.physics Properties

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `mass` | `number` | `0` | 0 = static, >0 = dynamic |
| `restitution` | `number` | `0` | Bounciness (0–1) |

**Limitations of the addon:** The official addon is intentionally minimal. It does not expose forces, joints, raycasting, collision events, or kinematic bodies. For games that need any of these, use the manual integration pattern below.

---

## Approach 2: Manual Integration (Recommended for Games)

For full control, manage the Rapier `World` yourself and sync transforms each frame.

### Architecture Overview

```
Three.js Scene Graph          Rapier Physics World
┌──────────────────┐          ┌────────────────────┐
│  Scene            │          │  World              │
│  ├── Mesh (floor) │ ◄──────► │  ├── RigidBody (static)  │
│  ├── Mesh (player)│ ◄──────► │  │   └── Collider (box)   │
│  └── Mesh (enemy) │ ◄──────► │  └── RigidBody (dynamic)  │
│                    │          │      └── Collider (capsule)│
└──────────────────┘          └────────────────────┘
           ▲                              │
           │   Sync positions/rotations   │
           └──────────────────────────────┘
```

### Step 1: Create the Physics World

```typescript
import RAPIER from '@dimforge/rapier3d-compat';

await RAPIER.init();

const gravity = new RAPIER.Vector3(0, -9.81, 0);
const world = new RAPIER.World(gravity);
```

### Step 2: Create Rigid Bodies and Colliders

```typescript
// --- Static ground plane ---
const groundBodyDesc = RAPIER.RigidBodyDesc.fixed()
  .setTranslation(0, -0.5, 0);
const groundBody = world.createRigidBody(groundBodyDesc);

const groundColliderDesc = RAPIER.ColliderDesc.cuboid(50, 0.5, 50)
  .setFriction(0.7);
world.createCollider(groundColliderDesc, groundBody);

// --- Dynamic player ---
const playerBodyDesc = RAPIER.RigidBodyDesc.dynamic()
  .setTranslation(0, 5, 0)
  .setCcdEnabled(true); // Continuous collision detection for fast objects
const playerBody = world.createRigidBody(playerBodyDesc);

const playerColliderDesc = RAPIER.ColliderDesc.capsule(0.5, 0.3) // half-height, radius
  .setDensity(1.0)
  .setFriction(0.5)
  .setRestitution(0.2);
world.createCollider(playerColliderDesc, playerBody);

// --- Kinematic platform (script-controlled movement) ---
const platformBodyDesc = RAPIER.RigidBodyDesc.kinematicPositionBased()
  .setTranslation(5, 2, 0);
const platformBody = world.createRigidBody(platformBodyDesc);

const platformColliderDesc = RAPIER.ColliderDesc.cuboid(2, 0.2, 2);
world.createCollider(platformColliderDesc, platformBody);
```

### Rigid Body Types

| Type | Rapier Desc | Use Case |
|------|------------|----------|
| **Dynamic** | `RigidBodyDesc.dynamic()` | Player, projectiles, crates — affected by forces and gravity |
| **Fixed** | `RigidBodyDesc.fixed()` | Ground, walls, static obstacles — never moves |
| **KinematicPositionBased** | `RigidBodyDesc.kinematicPositionBased()` | Moving platforms, elevators — you set position directly |
| **KinematicVelocityBased** | `RigidBodyDesc.kinematicVelocityBased()` | Doors, conveyor belts — you set velocity directly |

### Collider Shapes

| Shape | Constructor | Notes |
|-------|------------|-------|
| Box | `ColliderDesc.cuboid(hx, hy, hz)` | Half-extents, not full size |
| Sphere | `ColliderDesc.ball(radius)` | — |
| Capsule | `ColliderDesc.capsule(halfHeight, radius)` | Good for characters |
| Cylinder | `ColliderDesc.cylinder(halfHeight, radius)` | — |
| Cone | `ColliderDesc.cone(halfHeight, radius)` | — |
| Trimesh | `ColliderDesc.trimesh(vertices, indices)` | Static geometry only — expensive |
| Convex hull | `ColliderDesc.convexHull(points)` | Dynamic-safe alternative to trimesh |
| Heightfield | `ColliderDesc.heightfield(rows, cols, heights, scale)` | Terrain |

### Step 3: Sync Physics → Three.js Each Frame

```typescript
// Map from Rapier body handle to Three.js mesh
const bodyToMesh = new Map<number, THREE.Object3D>();

function registerBody(body: RAPIER.RigidBody, mesh: THREE.Object3D): void {
  bodyToMesh.set(body.handle, mesh);
}

// Call registerBody for each pair
registerBody(playerBody, playerMesh);

// Physics sync — call every frame
function syncPhysics(): void {
  world.step(); // advance simulation by one fixed timestep (default 1/60s)

  bodyToMesh.forEach((mesh, handle) => {
    const body = world.getRigidBody(handle);
    if (!body || body.isFixed()) return;

    const pos = body.translation();
    const rot = body.rotation();

    mesh.position.set(pos.x, pos.y, pos.z);
    mesh.quaternion.set(rot.x, rot.y, rot.z, rot.w);
  });
}
```

### Step 4: Fixed Timestep Game Loop

Physics engines produce consistent results only with a fixed timestep. Decouple physics from rendering:

```typescript
const PHYSICS_DT = 1 / 60; // 60 Hz physics
let accumulator = 0;
const clock = new THREE.Clock();

renderer.setAnimationLoop(() => {
  const frameDelta = Math.min(clock.getDelta(), 0.1); // clamp spiral-of-death
  accumulator += frameDelta;

  while (accumulator >= PHYSICS_DT) {
    world.step(); // fixed-rate physics step
    accumulator -= PHYSICS_DT;
  }

  // Sync visual positions after all steps
  bodyToMesh.forEach((mesh, handle) => {
    const body = world.getRigidBody(handle);
    if (!body || body.isFixed()) return;
    const pos = body.translation();
    const rot = body.rotation();
    mesh.position.set(pos.x, pos.y, pos.z);
    mesh.quaternion.set(rot.x, rot.y, rot.z, rot.w);
  });

  renderer.render(scene, camera);
});
```

---

## Applying Forces and Impulses

```typescript
// Continuous force (e.g., thrust) — apply every frame
playerBody.addForce(new RAPIER.Vector3(0, 0, -50), true);

// One-shot impulse (e.g., jump)
playerBody.applyImpulse(new RAPIER.Vector3(0, 8, 0), true);

// Torque (spin)
playerBody.addTorque(new RAPIER.Vector3(0, 5, 0), true);

// Reset velocity (e.g., on landing)
playerBody.setLinvel(new RAPIER.Vector3(0, 0, 0), true);
playerBody.setAngvel(new RAPIER.Vector3(0, 0, 0), true);
```

The second argument (`true`) wakes the body if it is sleeping. Always pass `true` when applying gameplay forces.

---

## Raycasting

```typescript
const rayOrigin = new RAPIER.Vector3(0, 1, 0);
const rayDir = new RAPIER.Vector3(0, -1, 0);
const maxToi = 100; // max distance
const solid = true; // report hits on the ray origin if inside a shape

const hit = world.castRay(
  new RAPIER.Ray(rayOrigin, rayDir),
  maxToi,
  solid
);

if (hit) {
  const hitPoint = new RAPIER.Vector3(
    rayOrigin.x + rayDir.x * hit.timeOfImpact,
    rayOrigin.y + rayDir.y * hit.timeOfImpact,
    rayOrigin.z + rayDir.z * hit.timeOfImpact
  );
  const hitCollider = hit.collider;
  const hitBody = hitCollider.parent(); // the RigidBody
  console.log('Hit at distance:', hit.timeOfImpact);
}
```

### Common Raycast Uses in Games

- **Ground check:** Cast downward from character to detect floor (for jump logic).
- **Line-of-sight:** Cast from enemy to player to check visibility.
- **Weapon hit detection:** Cast from muzzle along aim direction.
- **Mouse picking:** Unproject screen point to world ray, then cast.

---

## Collision Events

Rapier supports collision events via the `EventQueue`:

```typescript
const eventQueue = new RAPIER.EventQueue(true); // true = auto-drain

// Mark a collider as a sensor (trigger volume — no physical response)
const triggerColliderDesc = RAPIER.ColliderDesc.cuboid(2, 2, 2)
  .setSensor(true)
  .setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS);
const triggerCollider = world.createCollider(triggerColliderDesc, triggerBody);

// In game loop, after world.step():
world.step(eventQueue);

eventQueue.drainCollisionEvents((handle1, handle2, started) => {
  const collider1 = world.getCollider(handle1);
  const collider2 = world.getCollider(handle2);

  if (started) {
    console.log('Collision started between', handle1, 'and', handle2);
  } else {
    console.log('Collision ended between', handle1, 'and', handle2);
  }
});

eventQueue.drainContactForceEvents((event) => {
  // Triggered when contact forces exceed a threshold
  console.log('Strong contact force:', event.maxForceMagnitude());
});
```

To receive events, at least one of the two colliders must have `ActiveEvents.COLLISION_EVENTS` set:

```typescript
const colliderDesc = RAPIER.ColliderDesc.ball(0.5)
  .setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS);
```

---

## Joints and Constraints

```typescript
// Fixed joint — weld two bodies together
const fixedJointParams = RAPIER.JointData.fixed(
  new RAPIER.Vector3(0, 0, 0), // anchor on body1 (local space)
  new RAPIER.Quaternion(0, 0, 0, 1),
  new RAPIER.Vector3(0, 1, 0), // anchor on body2 (local space)
  new RAPIER.Quaternion(0, 0, 0, 1)
);
world.createImpulseJoint(fixedJointParams, body1, body2, true);

// Revolute joint — hinge (e.g., doors)
const revoluteJointParams = RAPIER.JointData.revolute(
  new RAPIER.Vector3(0, 0, 0),
  new RAPIER.Vector3(0, 1, 0), // anchor on body2
  new RAPIER.Vector3(0, 1, 0)  // hinge axis
);
world.createImpulseJoint(revoluteJointParams, doorFrame, doorBody, true);

// Spherical joint — ball-and-socket (e.g., ragdoll)
const sphericalJointParams = RAPIER.JointData.spherical(
  new RAPIER.Vector3(0, 0.5, 0),
  new RAPIER.Vector3(0, -0.5, 0)
);
world.createImpulseJoint(sphericalJointParams, upperArm, lowerArm, true);
```

---

## Collision Groups and Filtering

```typescript
// Collision groups use a bitmask: (membership, filter)
// membership = which groups this collider belongs to
// filter = which groups this collider can collide with

const PLAYER_GROUP = 0x0001;
const ENEMY_GROUP = 0x0002;
const TERRAIN_GROUP = 0x0004;
const PROJECTILE_GROUP = 0x0008;

// Player collides with terrain and enemies, not own projectiles
const playerCollider = RAPIER.ColliderDesc.capsule(0.5, 0.3)
  .setCollisionGroups(
    (PLAYER_GROUP << 16) | (TERRAIN_GROUP | ENEMY_GROUP)
  );

// Projectile collides with terrain and enemies, not player
const projectileCollider = RAPIER.ColliderDesc.ball(0.1)
  .setCollisionGroups(
    (PROJECTILE_GROUP << 16) | (TERRAIN_GROUP | ENEMY_GROUP)
  );
```

---

## Performance Considerations

| Concern | Guideline |
|---------|-----------|
| **Body count** | < 500 dynamic bodies for 60 FPS on mobile |
| **Trimesh colliders** | Use only for static geometry — expensive for dynamic bodies. Prefer convex hull or compound shapes. |
| **CCD** | Enable only for fast small objects (bullets, thrown items). Doubles the cost per body. |
| **Sleep** | Rapier auto-sleeps inactive bodies. Don't wake bodies unnecessarily. |
| **Step rate** | 60 Hz is standard. 30 Hz saves CPU but reduces accuracy. Never go above 120 Hz. |
| **Cleanup** | Call `world.removeRigidBody(body)` when objects are destroyed. Rapier does not garbage collect. |
| **WASM init** | `RAPIER.init()` downloads and compiles ~200 KB of WASM. Do this during a loading screen. |

---

## Complete Minimal Example

```typescript
import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';

async function main(): Promise<void> {
  // --- Init ---
  await RAPIER.init();

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(60, innerWidth / innerHeight, 0.1, 100);
  camera.position.set(0, 8, 12);
  camera.lookAt(0, 0, 0);

  const renderer = new THREE.WebGPURenderer({ antialias: true });
  await renderer.init();
  renderer.setSize(innerWidth, innerHeight);
  document.body.appendChild(renderer.domElement);

  scene.add(new THREE.AmbientLight(0xffffff, 0.6));
  const dirLight = new THREE.DirectionalLight(0xffffff, 1);
  dirLight.position.set(5, 10, 5);
  scene.add(dirLight);

  // --- Physics world ---
  const world = new RAPIER.World(new RAPIER.Vector3(0, -9.81, 0));
  const bodyToMesh = new Map<number, THREE.Object3D>();

  // --- Ground ---
  const groundMesh = new THREE.Mesh(
    new THREE.BoxGeometry(20, 0.2, 20),
    new THREE.MeshStandardMaterial({ color: 0x556655 })
  );
  groundMesh.position.y = -0.1;
  scene.add(groundMesh);

  const groundBody = world.createRigidBody(
    RAPIER.RigidBodyDesc.fixed().setTranslation(0, -0.1, 0)
  );
  world.createCollider(
    RAPIER.ColliderDesc.cuboid(10, 0.1, 10).setFriction(0.7),
    groundBody
  );

  // --- Spawn falling cubes ---
  for (let i = 0; i < 20; i++) {
    const size = 0.3 + Math.random() * 0.5;
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(size, size, size),
      new THREE.MeshStandardMaterial({
        color: new THREE.Color().setHSL(Math.random(), 0.7, 0.5)
      })
    );
    scene.add(mesh);

    const body = world.createRigidBody(
      RAPIER.RigidBodyDesc.dynamic().setTranslation(
        (Math.random() - 0.5) * 6,
        3 + i * 1.2,
        (Math.random() - 0.5) * 6
      )
    );
    world.createCollider(
      RAPIER.ColliderDesc.cuboid(size / 2, size / 2, size / 2)
        .setRestitution(0.3)
        .setFriction(0.5),
      body
    );
    bodyToMesh.set(body.handle, mesh);
  }

  // --- Game loop ---
  const PHYSICS_DT = 1 / 60;
  let accumulator = 0;
  const clock = new THREE.Clock();

  renderer.setAnimationLoop(() => {
    accumulator += Math.min(clock.getDelta(), 0.1);

    while (accumulator >= PHYSICS_DT) {
      world.step();
      accumulator -= PHYSICS_DT;
    }

    bodyToMesh.forEach((mesh, handle) => {
      const body = world.getRigidBody(handle);
      if (!body) return;
      const p = body.translation();
      const r = body.rotation();
      mesh.position.set(p.x, p.y, p.z);
      mesh.quaternion.set(r.x, r.y, r.z, r.w);
    });

    renderer.render(scene, camera);
  });
}

main();
```
