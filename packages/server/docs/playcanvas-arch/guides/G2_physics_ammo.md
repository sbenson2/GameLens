# G2 — Physics with Ammo.js

> **Category:** guide · **Engine:** PlayCanvas · **Related:** [Architecture Overview](../architecture/E1_architecture_overview.md), [Scripting System](G1_scripting_system.md), [Physics Docs](https://developer.playcanvas.com/user-manual/physics/physics-basics/)

PlayCanvas uses **Ammo.js** as its physics engine — a WebAssembly port of the open-source C++ Bullet physics library. Physics is component-based: you add `rigidbody` and `collision` components to entities, and the engine handles simulation, collision detection, and contact resolution.

This guide covers physics setup, rigid body types, collision shapes, events, raycasting, triggers, and performance tuning for games.

---

## Enabling Physics

Ammo.js is **lazy-loaded** — it's not included in the default PlayCanvas bundle. You must load it before physics components will work.

### In the PlayCanvas Editor

1. Go to **Settings → Physics**.
2. Ensure "Enable Physics" is checked — the Editor bundles Ammo.js WASM automatically.

### Engine-Only (No Editor)

```typescript
import * as pc from 'playcanvas';
import Ammo from 'ammo.js'; // or load from CDN

// Initialize Ammo.js WASM before creating the app
const ammoModule = await Ammo();
(window as any).Ammo = ammoModule;

const app = new pc.Application(canvas, {
  // Physics will now work
});
app.start();
```

**Bundle size note:** Ammo.js WASM is ~300 KB gzipped. Load it during your loading screen, not on-demand during gameplay.

---

## Rigidbody + Collision Components

Physics requires **two** components on an entity:

| Component | Purpose |
|-----------|---------|
| `rigidbody` | Physical properties: mass, friction, restitution, body type |
| `collision` | Physical shape: box, sphere, capsule, cylinder, mesh |

```typescript
import * as pc from 'playcanvas';

// Create a dynamic physics box
const crate = new pc.Entity('crate');
crate.addComponent('model', { type: 'box' });
crate.addComponent('rigidbody', {
  type: 'dynamic',
  mass: 5,
  friction: 0.5,
  restitution: 0.3,       // bounciness (0–1)
  linearDamping: 0.1,     // air resistance
  angularDamping: 0.1,    // spin resistance
});
crate.addComponent('collision', {
  type: 'box',
  halfExtents: new pc.Vec3(0.5, 0.5, 0.5), // half-size
});
crate.setPosition(0, 5, 0);
app.root.addChild(crate);
```

---

## Rigid Body Types

| Type | `rigidbody.type` | Description | Use Case |
|------|-------------------|-------------|----------|
| **Static** | `'static'` | Never moves, infinite mass | Ground, walls, buildings |
| **Dynamic** | `'dynamic'` | Affected by forces, gravity, collisions | Players, projectiles, crates |
| **Kinematic** | `'kinematic'` | Moved by code, not affected by forces. Pushes dynamic bodies. | Moving platforms, elevators, doors |

```typescript
// Static ground — mass is ignored (always infinite)
ground.addComponent('rigidbody', { type: 'static' });
ground.addComponent('collision', { type: 'box', halfExtents: new pc.Vec3(50, 0.1, 50) });

// Kinematic platform — move with setPosition, not forces
platform.addComponent('rigidbody', { type: 'kinematic' });
platform.addComponent('collision', { type: 'box', halfExtents: new pc.Vec3(2, 0.2, 2) });
```

### Moving Kinematic Bodies

```typescript
import { Script } from 'playcanvas';

export class MovingPlatform extends Script {
  static scriptName = 'movingPlatform';

  /** @attribute */
  speed: number = 2;
  /** @attribute */
  distance: number = 5;

  private startY: number = 0;
  private direction: number = 1;

  initialize(): void {
    this.startY = this.entity.getPosition().y;
  }

  update(dt: number): void {
    const pos = this.entity.getPosition();
    const newY = pos.y + this.speed * this.direction * dt;

    if (newY > this.startY + this.distance) this.direction = -1;
    if (newY < this.startY) this.direction = 1;

    // Use teleport for kinematic bodies — updates physics body position
    this.entity.rigidbody!.teleport(pos.x, newY, pos.z);
  }
}
```

**Important:** For kinematic bodies, use `rigidbody.teleport()` instead of `entity.setPosition()`. `setPosition()` doesn't update the physics body's internal state and can cause tunneling.

---

## Collision Shapes

| Shape | `collision.type` | Parameters | Notes |
|-------|------------------|------------|-------|
| Box | `'box'` | `halfExtents: Vec3` | Half-extents, not full size |
| Sphere | `'sphere'` | `radius: number` | — |
| Capsule | `'capsule'` | `radius, height` | Good for characters (height includes hemispheres) |
| Cylinder | `'cylinder'` | `radius, height` | — |
| Cone | `'cone'` | `radius, height` | — |
| Mesh | `'mesh'` | `asset: Asset` (render mesh) | **Static bodies only** — very expensive |

```typescript
// Character capsule
player.addComponent('collision', {
  type: 'capsule',
  radius: 0.3,
  height: 1.8,   // total height including rounded caps
});

// Terrain — static mesh collider from a model asset
terrain.addComponent('collision', {
  type: 'mesh',
  asset: terrainModelAsset,
});
terrain.addComponent('rigidbody', { type: 'static' });
```

### Compound Shapes

For complex dynamic objects, use a parent entity with multiple child collision entities:

```typescript
// Vehicle body — parent
const vehicle = new pc.Entity('vehicle');
vehicle.addComponent('rigidbody', { type: 'dynamic', mass: 1500 });

// Main body collision
const bodyCollision = new pc.Entity('body');
bodyCollision.addComponent('collision', {
  type: 'box',
  halfExtents: new pc.Vec3(1, 0.5, 2),
});
bodyCollision.setLocalPosition(0, 0.5, 0);
vehicle.addChild(bodyCollision);

// Roof collision
const roofCollision = new pc.Entity('roof');
roofCollision.addComponent('collision', {
  type: 'box',
  halfExtents: new pc.Vec3(0.8, 0.3, 1),
});
roofCollision.setLocalPosition(0, 1.3, -0.2);
vehicle.addChild(roofCollision);
```

---

## Applying Forces and Impulses

```typescript
// Continuous force — apply every frame (e.g., thrust, wind)
entity.rigidbody!.applyForce(new pc.Vec3(0, 0, -100));

// Force at a specific world point (causes torque)
entity.rigidbody!.applyForce(new pc.Vec3(0, 50, 0), new pc.Vec3(1, 0, 0));

// One-shot impulse (e.g., jump, explosion knockback)
entity.rigidbody!.applyImpulse(new pc.Vec3(0, 10, 0));

// Torque impulse (e.g., spin a ball)
entity.rigidbody!.applyTorqueImpulse(new pc.Vec3(5, 0, 0));

// Set velocity directly (e.g., character controller)
entity.rigidbody!.linearVelocity = new pc.Vec3(0, jumpSpeed, 0);
entity.rigidbody!.angularVelocity = pc.Vec3.ZERO;
```

---

## Collision Events

Entities with both `rigidbody` and `collision` components fire collision events:

```typescript
import { Script } from 'playcanvas';

export class DamageOnHit extends Script {
  static scriptName = 'damageOnHit';

  initialize(): void {
    // Fires when two rigidbodies first touch
    this.entity.collision!.on('collisionstart', this.onCollisionStart, this);

    // Fires every frame while touching
    this.entity.collision!.on('collisionend', this.onCollisionEnd, this);
  }

  onCollisionStart(result: pc.ContactResult): void {
    const other = result.other; // the other entity
    const contacts = result.contacts;

    for (const contact of contacts) {
      const point = contact.localPoint;          // contact point (local space)
      const pointWorld = contact.point;           // contact point (world space)
      const normal = contact.normal;              // contact normal (world)
      const impulse = contact.impulse;            // impact strength

      // Example: apply damage proportional to impact
      if (impulse > 5) {
        console.log(`Hit by ${other.name} with force ${impulse}`);
      }
    }
  }

  onCollisionEnd(other: pc.Entity): void {
    console.log(`No longer touching ${other.name}`);
  }
}
```

---

## Trigger Volumes (Sensors)

A trigger is a collision shape with **no rigidbody** — it detects overlaps without physical response:

```typescript
// Create a trigger zone
const triggerZone = new pc.Entity('checkpoint');
triggerZone.addComponent('collision', {
  type: 'box',
  halfExtents: new pc.Vec3(2, 2, 2),
});
// No rigidbody component → this is a trigger

// Trigger events
triggerZone.collision!.on('triggerenter', (entity: pc.Entity) => {
  console.log(`${entity.name} entered the trigger`);
});

triggerZone.collision!.on('triggerleave', (entity: pc.Entity) => {
  console.log(`${entity.name} left the trigger`);
});
```

### Common Trigger Uses in Games

- **Checkpoints** — save progress when the player enters
- **Damage zones** — lava, poison gas, fall boundaries
- **Enemy aggro ranges** — start combat when player enters
- **Audio zones** — crossfade ambient sounds by region
- **Loading triggers** — stream in the next level section

---

## Raycasting

Raycasting tests a line against the physics world and returns the first (or all) hit results:

```typescript
// Single-hit raycast (fastest)
const from = new pc.Vec3(0, 1, 0);
const to = new pc.Vec3(0, -10, 0);
const result = app.systems.rigidbody!.raycastFirst(from, to);

if (result) {
  const hitEntity = result.entity;
  const hitPoint = result.point;     // Vec3 — world space
  const hitNormal = result.normal;   // Vec3 — surface normal
  console.log(`Hit ${hitEntity.name} at`, hitPoint);
}
```

```typescript
// Multi-hit raycast (returns all intersections)
const results = app.systems.rigidbody!.raycastAll(from, to);
for (const result of results) {
  console.log(`Hit ${result.entity.name} at distance`, result.point.distance(from));
}
```

### Common Raycast Uses

```typescript
// Ground check (is the player on the floor?)
function isGrounded(entity: pc.Entity): boolean {
  const pos = entity.getPosition();
  const from = new pc.Vec3(pos.x, pos.y, pos.z);
  const to = new pc.Vec3(pos.x, pos.y - 0.1, pos.z);
  const hit = app.systems.rigidbody!.raycastFirst(from, to);
  return hit !== null && hit.entity !== entity;
}

// Weapon hitscan
function fireWeapon(origin: pc.Vec3, direction: pc.Vec3, range: number): void {
  const to = origin.clone().add(direction.clone().mulScalar(range));
  const hit = app.systems.rigidbody!.raycastFirst(origin, to);
  if (hit) {
    // Apply damage, spawn impact effect at hit.point, etc.
  }
}
```

---

## Accessing the Ammo.js API Directly

For advanced physics (constraints, soft bodies, CCD), access the underlying Ammo.js API through the rigidbody:

```typescript
// Get the underlying Ammo.btRigidBody
const btBody = entity.rigidbody!.body;

// Enable Continuous Collision Detection for fast objects (bullets)
btBody.setCcdMotionThreshold(0.01);
btBody.setCcdSweptSphereRadius(0.05);

// Lock rotation axes (e.g., prevent character from tipping over)
btBody.setAngularFactor(new Ammo.btVector3(0, 1, 0)); // only rotate on Y

// Point-to-point constraint (rope/chain joint)
const pivotA = new Ammo.btVector3(0, 1, 0);
const pivotB = new Ammo.btVector3(0, -1, 0);
const constraint = new Ammo.btPoint2PointConstraint(
  bodyA.rigidbody!.body,
  bodyB.rigidbody!.body,
  pivotA,
  pivotB
);
app.systems.rigidbody!.dynamicsWorld.addConstraint(constraint);

// IMPORTANT: Clean up Ammo.js objects to prevent WASM memory leaks
Ammo.destroy(pivotA);
Ammo.destroy(pivotB);
```

**Memory warning:** Ammo.js objects allocated with `new Ammo.*` are in WASM heap memory and are NOT garbage collected. Always call `Ammo.destroy()` when done.

---

## Performance Considerations

| Concern | Guideline |
|---------|-----------|
| **Dynamic body count** | < 200 dynamic bodies on mobile, < 500 on desktop for 60 FPS |
| **Mesh colliders** | Static only — never use on dynamic bodies. Use compound primitives instead. |
| **CCD** | Enable only for fast, small objects (bullets). Significant per-body cost. |
| **Sleep** | Ammo.js auto-sleeps inactive bodies. Don't wake them unnecessarily (e.g., avoid constant `teleport` on sleeping bodies). |
| **Collision complexity** | Prefer boxes and spheres. Capsules are slightly more expensive. Mesh colliders are 10-50x more expensive than primitives. |
| **Ammo.js WASM size** | ~300 KB gzipped. Load during loading screen — don't lazy-load mid-gameplay. |
| **Substeps** | PlayCanvas uses a fixed timestep internally. Don't call `dynamicsWorld.stepSimulation()` yourself — the engine handles it. |
| **WASM memory** | `new Ammo.*()` objects are not GC'd. Always `Ammo.destroy()` to free WASM memory. |

---

## Common Mistakes

| Mistake | Fix |
|---------|-----|
| Using `setPosition()` on kinematic bodies | Use `rigidbody.teleport()` — it updates the physics body correctly |
| Mesh collider on a dynamic body | Use compound primitive shapes instead — mesh colliders are static-only |
| Forgetting to load Ammo.js (engine-only) | Load and assign to `window.Ammo` before creating the `Application` |
| Not destroying Ammo.js objects | Call `Ammo.destroy()` on any `new Ammo.*()` objects to prevent WASM memory leaks |
| Applying forces to kinematic bodies | Kinematic bodies ignore forces — use `teleport()` to move them |
| Physics on very small objects (< 0.1 units) | Bullet physics has a default collision margin of 0.04. Scale your world so objects are > 0.2 units. |
| Raycast returning the casting entity | Filter out `self` when raycasting from inside a collider |
