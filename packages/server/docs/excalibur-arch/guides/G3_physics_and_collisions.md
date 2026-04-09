# G3 — Excalibur.js Physics & Collisions

> **Category:** guide · **Engine:** Excalibur · **Related:** [E1 Architecture Overview](../architecture/E1_architecture_overview.md) · [G1 Actors & Entities](G1_actors_and_entities.md) · [G2 Scene Management](G2_scene_management.md)

---

## Overview

Excalibur ships with two built-in physics simulations: **Arcade** (fast, AABB-based — ideal for platformers and top-down games) and **Realistic** (rigid-body dynamics with angular velocity, friction, and restitution — suited for physics-sandbox or puzzle games). Both share the same collider primitives and collision event system, so you can switch modes without rewriting game objects.

This guide covers physics configuration, collision types, collider shapes, collision events, composite colliders, the broadphase/narrowphase pipeline, and practical patterns for common game scenarios.

---

## Configuring Physics

Set the physics simulation when creating the Engine. The default is `Arcade`.

```typescript
import { Engine, Physics, SolverStrategy, CollisionResolutionStrategy } from 'excalibur';

const game = new Engine({
  width: 800,
  height: 600,
  physics: {
    // 'arcade' — fast, axis-aligned resolution (default)
    // 'realistic' — rigid-body with rotation, friction, restitution
    solver: SolverStrategy.Arcade,

    // Gravity — applied every frame to Active bodies
    gravity: { x: 0, y: 800 },

    // Enable continuous collision detection to prevent tunneling
    // at high speeds (more expensive)
    continuous: {
      checkForFastBodies: true,
      disableMinimumSpeedForFastBody: false,
    },
  },
});
```

### Switching to Realistic Physics

```typescript
const game = new Engine({
  width: 800,
  height: 600,
  physics: {
    solver: SolverStrategy.Realistic,
    gravity: { x: 0, y: 500 },
  },
});
```

> **Tip:** Arcade physics is significantly cheaper. Start with Arcade and only move to Realistic when you need angular velocity, torque, or friction-based interactions.

---

## Collision Types

Every Actor has a `collisionType` that determines how it participates in the physics simulation. Setting the correct type is essential — Actors default to `PreventCollision` (no collisions at all).

| Type | Moves? | Pushes others? | Gets pushed? | Raises events? |
|------|--------|-----------------|--------------|----------------|
| `PreventCollision` | — | No | No | No |
| `Passive` | Yes | No | No | **Yes** |
| `Active` | Yes | Yes | Yes | **Yes** |
| `Fixed` | No | Yes | No | **Yes** |

```typescript
import { Actor, CollisionType, Color, vec } from 'excalibur';

// A player that moves and collides
const player = new Actor({
  pos: vec(100, 300),
  width: 32,
  height: 48,
  color: Color.Blue,
  collisionType: CollisionType.Active,
});

// A solid ground that never moves but stops Active actors
const ground = new Actor({
  pos: vec(400, 580),
  width: 800,
  height: 40,
  color: Color.Green,
  collisionType: CollisionType.Fixed,
});

// A coin pickup — detects overlap but doesn't push anything
const coin = new Actor({
  pos: vec(250, 400),
  width: 16,
  height: 16,
  color: Color.Yellow,
  collisionType: CollisionType.Passive,
});
```

### When to Use Each Type

- **Active:** Player, enemies, projectiles — anything that moves and should interact physically.
- **Fixed:** Ground, walls, platforms — immovable solids.
- **Passive:** Pickups, triggers, damage zones — detect overlap without physical response.
- **PreventCollision:** Purely visual objects like background decorations.

---

## Collider Shapes

Excalibur provides four collider primitives. When you set `width` and `height` on an Actor, it automatically gets a `PolygonCollider` (box). For more precise shapes, assign colliders explicitly.

### BoxCollider (default)

Created automatically from Actor dimensions:

```typescript
import { Actor, vec, CollisionType } from 'excalibur';

const crate = new Actor({
  pos: vec(200, 400),
  width: 48,
  height: 48,
  collisionType: CollisionType.Active,
  // Implicitly creates a box-shaped PolygonCollider
});
```

### CircleCollider

Ideal for balls, coins, or circular hitboxes:

```typescript
import { Actor, CircleCollider, vec, CollisionType } from 'excalibur';

const ball = new Actor({
  pos: vec(300, 100),
  collisionType: CollisionType.Active,
  collider: new CircleCollider({
    radius: 16,
  }),
});
```

### PolygonCollider

Define arbitrary convex shapes with a list of points (relative to the actor's anchor):

```typescript
import { Actor, PolygonCollider, vec, CollisionType } from 'excalibur';

// A triangle collider
const spike = new Actor({
  pos: vec(500, 500),
  collisionType: CollisionType.Fixed,
  collider: new PolygonCollider({
    points: [vec(-16, 16), vec(0, -16), vec(16, 16)],
  }),
});
```

> **Important:** PolygonCollider only supports **convex** shapes. If you need a concave shape (like an L or a Pac-Man), use a CompositeCollider to combine multiple convex primitives.

### EdgeCollider

A single line segment — useful for thin walls, one-way platforms, or level boundaries:

```typescript
import { Actor, EdgeCollider, vec, CollisionType } from 'excalibur';

const wall = new Actor({
  pos: vec(0, 0),
  collisionType: CollisionType.Fixed,
  collider: new EdgeCollider({
    begin: vec(0, 0),
    end: vec(0, 600),
  }),
});
```

---

## CompositeCollider

Combine multiple primitives into a single collider for complex shapes. This is how you build concave geometry, compound hitboxes, or level terrain.

```typescript
import {
  Actor, CompositeCollider, PolygonCollider,
  CircleCollider, vec, CollisionType, Shape,
} from 'excalibur';

// An "L-shaped" platform using two boxes
const lPlatform = new Actor({
  pos: vec(400, 300),
  collisionType: CollisionType.Fixed,
  collider: new CompositeCollider([
    Shape.Box(120, 20, vec(0.5, 0.5), vec(0, 0)),   // horizontal bar
    Shape.Box(20, 80, vec(0.5, 0.5), vec(-50, 30)),  // vertical bar
  ]),
});
```

### Composite Mode: Together vs. Separate

```typescript
const composite = new CompositeCollider(colliders);

// 'together' — treat all sub-colliders as one solid shape.
// Best for shapes without gaps (compound hitboxes, complex platforms).
composite.compositeStrategy = 'together';

// 'separate' — each sub-collider raises its own collision events.
// Best for level geometry with deliberate gaps between pieces.
composite.compositeStrategy = 'separate';
```

---

## Collision Events

Excalibur provides three event pairs on Actors for handling collisions:

### collisionstart / collisionend

Fire once when two colliders first touch and when they separate:

```typescript
player.on('collisionstart', (evt) => {
  // evt.other — the Actor we collided with
  // evt.contact — collision contact info (normal, point, etc.)
  // evt.side — Side enum: Top, Bottom, Left, Right
  console.log(`Hit ${evt.other.name} on the ${evt.side}`);

  if (evt.other.hasTag('spike')) {
    player.kill();
  }
});

player.on('collisionend', (evt) => {
  console.log(`Stopped touching ${evt.other.name}`);
});
```

### precollision

Fires every frame that two colliders overlap — useful for continuous effects like damage-over-time zones:

```typescript
player.on('precollision', (evt) => {
  if (evt.other.hasTag('lava')) {
    playerHealth -= 1;
  }
});
```

### postcollision

Fires after the collision has been resolved. Use this to apply post-resolution effects:

```typescript
player.on('postcollision', (evt) => {
  // The collision has been resolved — actor positions are updated
  if (evt.side === 'Bottom') {
    isGrounded = true;
  }
});
```

### Collision Groups

Filter which Actors can collide with each other using CollisionGroups:

```typescript
import { CollisionGroup, CollisionGroupManager } from 'excalibur';

const PlayerGroup = CollisionGroupManager.create('player');
const EnemyGroup = CollisionGroupManager.create('enemy');
const PickupGroup = CollisionGroupManager.create('pickup');

// Players collide with enemies and pickups, but not other players
player.body.group = CollisionGroup.collidesWith([EnemyGroup, PickupGroup]);

// Enemies collide with players but not other enemies or pickups
enemy.body.group = CollisionGroup.collidesWith([PlayerGroup]);
```

---

## Broadphase: SparseHashGrid

Excalibur uses a **SparseHashGrid** broadphase to quickly cull collision pairs before running narrowphase geometry tests. This spatial data structure is optimized for large numbers of colliders and performs significantly better than the older DynamicAABBTree approach.

You generally don't need to configure the broadphase, but for advanced tuning:

```typescript
const game = new Engine({
  physics: {
    solver: SolverStrategy.Arcade,
    spatialPartition: Physics.SparseHashGrid,
  },
});
```

> The broadphase identifies *candidate* pairs cheaply using spatial hashing. The narrowphase then runs precise geometry intersection tests (SAT for polygons, circle-circle, etc.) only on those candidates.

---

## Common Patterns

### One-Way Platforms

Allow the player to jump through a platform from below but land on it from above:

```typescript
platform.on('precollision', (evt) => {
  if (evt.other === player) {
    const playerBottom = player.pos.y + player.height / 2;
    const platformTop = platform.pos.y - platform.height / 2;

    // Cancel the collision if player is below the platform
    if (playerBottom > platformTop + 2) {
      evt.contact.cancel();
    }
  }
});
```

### Ground Detection for Jumping

Track whether the player is on the ground to prevent infinite jumps:

```typescript
let isGrounded = false;

player.on('collisionstart', (evt) => {
  if (evt.side === 'Bottom') {
    isGrounded = true;
  }
});

player.on('collisionend', (evt) => {
  if (evt.side === 'Bottom') {
    isGrounded = false;
  }
});

// In your update loop or key handler:
engine.input.keyboard.on('press', (evt) => {
  if (evt.key === 'Space' && isGrounded) {
    player.vel.y = -400;
    isGrounded = false;
  }
});
```

### Pickup / Trigger Zone

Use a Passive collider to detect overlap without physical pushback:

```typescript
const healthPack = new Actor({
  pos: vec(600, 450),
  width: 24,
  height: 24,
  collisionType: CollisionType.Passive,
});
healthPack.addTag('health');

healthPack.on('collisionstart', (evt) => {
  if (evt.other === player) {
    playerHealth = Math.min(playerHealth + 25, 100);
    healthPack.kill(); // Remove the pickup
  }
});
```

---

## Framework Comparison

| Concept | Excalibur | Phaser 3 | Kaplay |
|---------|-----------|----------|--------|
| Physics modes | Arcade / Realistic | Arcade / Matter.js | Built-in (area, body) |
| Collision types | Active, Fixed, Passive, PreventCollision | Dynamic body, Static body, Sensor | body(), area() components |
| Collider shapes | Circle, Polygon, Edge, Composite | Rectangle, Circle, Polygon (Matter) | rect(), circle(), polygon() |
| Collision events | collisionstart/end, precollision, postcollision | collide, overlap, worldbounds | onCollide(), onCollideUpdate(), onCollideEnd() |
| Broadphase | SparseHashGrid | Quad Tree (Arcade) / SAP (Matter) | Spatial hash |
| Collision groups | CollisionGroupManager | collision categories (Matter) | layers |

---

## Performance Tips

1. **Use Arcade unless you need rotation-based physics.** Realistic mode is 2–3× more expensive per collision pair.
2. **Set `PreventCollision` on decorative actors.** Every Active/Fixed/Passive actor enters the broadphase.
3. **Use CollisionGroups** to skip unnecessary pair checks (e.g., enemy-vs-enemy).
4. **Prefer simple colliders.** A `CircleCollider` is cheaper than a `PolygonCollider`; a box is cheaper than a complex polygon.
5. **Enable continuous collision detection only for fast-moving small objects** (projectiles). It adds overhead.
6. **Use CompositeCollider with `together` strategy** for shapes without gaps — it reduces the number of contact points the solver must process.

---

## Next Steps

- **[G1 Actors & Entities](G1_actors_and_entities.md)** — How actors work, components, and the ECS model
- **[G2 Scene Management](G2_scene_management.md)** — Organizing game states and transitions
- **[E1 Architecture Overview](../architecture/E1_architecture_overview.md)** — Excalibur's engine architecture
