# G4 — Kaplay Physics and Collisions

> **Category:** guide · **Engine:** Kaplay · **Related:** [E1 Architecture Overview](../architecture/E1_architecture_overview.md) · [G1 Components & Game Objects](G1_components_and_game_objects.md) · [G3 Input Handling](G3_input_handling.md)

---

## Overview

Kaplay implements physics through two core components: `area()` and `body()`. The `area()` component defines a collision shape and enables overlap/collision detection. The `body()` component adds physical properties like gravity, velocity, and solid collision resolution. Together, they give you everything from simple AABB overlap checks to elastic collisions with mass-based reactions. Kaplay also provides effector components for simulating forces like buoyancy and attraction.

This guide covers collision shapes, events, physics bodies, gravity, effectors, and practical patterns for platformers, top-down games, and more.

---

## Core Components

### `area()` — Collision Shape

The `area()` component defines the collision shape of a game object. Without `body()`, objects with `area()` detect overlaps but do not physically push each other apart.

```typescript
import kaplay from 'kaplay';

const k = kaplay();

k.loadSprite('player', 'sprites/player.png');

// The area defaults to the sprite's bounding box
const player = k.add([
  k.sprite('player'),
  k.pos(100, 200),
  k.area(),       // collision shape = sprite bounds
  'player',       // tag for collision filtering
]);

// Custom-shaped collision area
const smallHitbox = k.add([
  k.sprite('player'),
  k.pos(300, 200),
  k.area({ shape: new k.Rect(k.vec2(0, 0), 16, 24) }), // narrower hitbox
  'player',
]);

// Offset the collision shape from the sprite origin
const offsetHitbox = k.add([
  k.sprite('boss'),
  k.pos(400, 100),
  k.area({
    shape: new k.Rect(k.vec2(8, 4), 48, 56),
    offset: k.vec2(0, 8), // shift hitbox down
  }),
  'boss',
]);
```

### `body()` — Physics Body

The `body()` component makes an object solid (it resolves collisions rather than just detecting them) and optionally subjects it to gravity.

```typescript
// Dynamic body — affected by gravity, responds to collisions
const player = k.add([
  k.sprite('player'),
  k.pos(100, 100),
  k.area(),
  k.body(),        // gravity-affected, solid
  'player',
]);

// Static body — solid but not affected by gravity (platforms, walls)
const platform = k.add([
  k.sprite('platform'),
  k.pos(0, 400),
  k.area(),
  k.body({ isStatic: true }),
  'platform',
]);

// Configure mass for collision reactions
const heavyBox = k.add([
  k.sprite('crate'),
  k.pos(200, 100),
  k.area(),
  k.body({ mass: 5 }),  // heavier objects push lighter ones more
  'crate',
]);
```

### Body Properties

| Property | Default | Description |
|----------|---------|-------------|
| `isStatic` | `false` | If `true`, the body is solid but immovable and unaffected by gravity |
| `mass` | `1` | Affects how much force is imparted during elastic collision resolution |
| `jumpForce` | `640` | Default force applied by the `.jump()` method |
| `maxVelocity` | `2400` | Maximum velocity cap in any direction |
| `gravityScale` | `1` | Multiplier for gravity on this specific body (0 = no gravity) |

---

## Gravity

Set global gravity on the Kaplay context. It applies a downward force on all objects with `body()` (unless `isStatic: true` or `gravityScale: 0`):

```typescript
// Set gravity (pixels/second²)
k.setGravity(1600);

// Read current gravity
const g = k.getGravity();

// Disable gravity for a specific object (e.g., a flying enemy)
const bat = k.add([
  k.sprite('bat'),
  k.pos(300, 100),
  k.area(),
  k.body({ gravityScale: 0 }),  // floats — not affected by gravity
  'enemy',
]);

// Temporarily change gravity (e.g., underwater zone)
k.onSceneLeave(() => k.setGravity(1600)); // restore when leaving scene
k.setGravity(400); // slow-fall underwater
```

---

## Collision Events

Kaplay provides three collision event hooks. Each can be used at the global level (listening for collisions between tagged objects) or on a specific game object.

### Global Collision Events

```typescript
// onCollide — fires ONCE when collision starts
k.onCollide('player', 'coin', (player, coin) => {
  // coin is the specific game object that was hit
  k.destroy(coin);
  score++;
});

// onCollideUpdate — fires EVERY FRAME while objects overlap
k.onCollide('player', 'lava', (player, lava) => {
  player.hurt(1); // take damage each frame
});

// onCollideEnd — fires ONCE when objects stop overlapping
k.onCollideEnd('player', 'water', (player, water) => {
  player.isSwimming = false;
});
```

### Per-Object Collision Events

```typescript
const player = k.add([
  k.sprite('player'),
  k.pos(100, 100),
  k.area(),
  k.body(),
  'player',
]);

// Listen for this specific object colliding with any tagged object
player.onCollide('enemy', (enemy) => {
  if (player.pos.y < enemy.pos.y - 8) {
    // Player is above the enemy — stomp!
    k.destroy(enemy);
    player.jump(400);
  } else {
    // Hit from the side — take damage
    player.hurt(1);
  }
});

player.onCollideUpdate('ice', () => {
  // Reduce friction while on ice
  player.friction = 0.1;
});

player.onCollideEnd('ice', () => {
  player.friction = 1.0;
});
```

### Manual Collision Checks

For cases where event-driven collision is awkward, poll collision state directly:

```typescript
k.onUpdate('player', (player) => {
  // Check if this object is currently colliding with any object tagged 'ground'
  if (player.isColliding('ground')) {
    canJump = true;
  }

  // Check overlap (non-solid area-only objects)
  if (player.isOverlapping('danger-zone')) {
    showWarning();
  }
});
```

---

## Jumping and Grounding

The `body()` component includes a built-in `isGrounded()` check and `jump()` method:

```typescript
const player = k.add([
  k.sprite('player'),
  k.pos(100, 100),
  k.area(),
  k.body({ jumpForce: 600 }),
  'player',
]);

k.onKeyPress('space', () => {
  // isGrounded() returns true if the body is resting on a solid surface
  if (player.isGrounded()) {
    player.jump();           // uses the jumpForce set in body()
    // or: player.jump(800); // override with a custom force
  }
});

// Double-jump pattern
let jumpsLeft = 2;

k.onKeyPress('space', () => {
  if (jumpsLeft > 0) {
    player.jump(600);
    jumpsLeft--;
  }
});

// Reset jumps when landing
player.onGround(() => {
  jumpsLeft = 2;
});
```

### `onGround()` and `onFall()`

```typescript
player.onGround(() => {
  // Fires when the body lands on a solid surface
  playLandingEffect();
});

player.onFall(() => {
  // Fires when the body leaves a solid surface (starts falling)
  startFallAnimation();
});

// onFallOff is fired when falling off a platform edge (not jumping)
player.onFallOff(() => {
  // Coyote time: allow a short window to still jump after walking off an edge
  coyoteTimer = 0.1;
});
```

---

## Effectors

Effectors are components that apply forces within an area, simulating environmental physics effects. Add them to a game object that also has `area()`.

### Area Effector

Applies a constant directional force to any body within the area — useful for wind zones, conveyor belts, or water currents:

```typescript
const windZone = k.add([
  k.pos(200, 0),
  k.area({ shape: new k.Rect(k.vec2(0, 0), 200, 600) }),
  k.areaEffector({
    forceAngle: 0,       // angle in degrees (0 = right)
    forceMagnitude: 400,  // force strength
    useGlobalAngle: true,
  }),
]);
```

### Buoyancy Effector

Simulates water or fluid — objects entering the area experience upward force and drag:

```typescript
const water = k.add([
  k.pos(0, 400),
  k.rect(800, 200),
  k.color(0, 100, 200),
  k.opacity(0.4),
  k.area(),
  k.buoyancyEffector({
    surfaceLevel: 400,   // y-coordinate of the water surface
    density: 2,          // higher = stronger buoyancy
    linearDrag: 3,       // slows horizontal movement
    angularDrag: 1,      // slows rotation
  }),
]);
```

### Point Effector

Applies force toward or away from a point — useful for gravity wells or explosions:

```typescript
const blackHole = k.add([
  k.pos(400, 300),
  k.area({ shape: new k.Circle(k.vec2(0, 0), 150) }),
  k.pointEffector({
    forceMagnitude: -600, // negative = attract, positive = repel
  }),
]);
```

### Surface Effector

Applies tangential force along a surface — useful for conveyor belts or moving platforms:

```typescript
const conveyor = k.add([
  k.sprite('conveyor'),
  k.pos(100, 400),
  k.area(),
  k.body({ isStatic: true }),
  k.surfaceEffector({
    speed: 200,       // speed along the surface
    forceScale: 0.5,  // how aggressively it pulls objects to target speed
  }),
]);
```

---

## Collision Layers and Ignoring

Control which objects can collide with each other:

```typescript
// Collision ignore — specific object pairs
const ghost = k.add([
  k.sprite('ghost'),
  k.pos(300, 200),
  k.area(),
  k.body(),
  'ghost',
]);

// Ghost passes through walls but still collides with the player
ghost.collisionIgnore = ['wall'];

// One-way platforms: allow jumping up through the bottom
const oneWayPlatform = k.add([
  k.sprite('platform'),
  k.pos(200, 300),
  k.area(),
  k.body({ isStatic: true }),
  'one-way',
]);

k.onBeforeCollideUpdate('player', 'one-way', (player, platform) => {
  // Only resolve collision if the player is falling down onto the platform
  if (player.vel.y < 0) {
    // Player is moving up — cancel this collision
    return false;
  }
});
```

---

## Common Patterns

### Pattern 1: Platformer Physics

```typescript
const k = kaplay();

k.setGravity(1600);

k.loadSprite('player', 'sprites/player.png');
k.loadSprite('ground', 'sprites/ground.png');

k.scene('game', () => {
  // Ground
  k.add([
    k.sprite('ground'),
    k.pos(0, 480),
    k.area(),
    k.body({ isStatic: true }),
    'ground',
  ]);

  // Player
  const player = k.add([
    k.sprite('player'),
    k.pos(100, 100),
    k.area(),
    k.body({ jumpForce: 650 }),
    'player',
  ]);

  // Movement
  k.onUpdate(() => {
    const speed = 300;
    if (k.isKeyDown('left'))  player.move(-speed, 0);
    if (k.isKeyDown('right')) player.move(speed, 0);
  });

  // Jump with coyote time
  let coyoteTime = 0;

  player.onFallOff(() => { coyoteTime = 0.12; });
  player.onGround(() => { coyoteTime = 0; });

  k.onUpdate(() => {
    if (coyoteTime > 0) coyoteTime -= k.dt();
  });

  k.onKeyPress('space', () => {
    if (player.isGrounded() || coyoteTime > 0) {
      player.jump();
      coyoteTime = 0;
    }
  });

  // Coin collection
  k.onCollide('player', 'coin', (_, coin) => {
    k.destroy(coin);
  });
});

k.go('game');
```

### Pattern 2: Top-Down Physics (No Gravity)

```typescript
k.setGravity(0); // no gravity for top-down

const player = k.add([
  k.sprite('player'),
  k.pos(400, 300),
  k.area(),
  k.body(), // still solid for wall collisions, but no falling
  'player',
]);

// Walls block movement via solid body collision
const wall = k.add([
  k.rect(32, 200),
  k.pos(300, 200),
  k.area(),
  k.body({ isStatic: true }),
  'wall',
]);

// 8-directional movement
k.onUpdate(() => {
  const speed = 200;
  let dir = k.vec2(0, 0);

  if (k.isKeyDown('left'))  dir.x -= 1;
  if (k.isKeyDown('right')) dir.x += 1;
  if (k.isKeyDown('up'))    dir.y -= 1;
  if (k.isKeyDown('down'))  dir.y += 1;

  if (dir.len() > 0) {
    player.move(dir.unit().scale(speed));
  }
});
```

### Pattern 3: Trigger Zones (Area Without Body)

```typescript
// A zone that detects the player entering but has no physical presence
const checkpoint = k.add([
  k.pos(500, 300),
  k.area({ shape: new k.Rect(k.vec2(0, 0), 64, 64) }),
  // No body() — not solid, just a detection area
  'checkpoint',
]);

k.onCollide('player', 'checkpoint', (player, cp) => {
  saveCheckpoint(cp.pos);
  k.destroy(cp);
});
```

---

## Comparison: Physics Across Frameworks

| Concept | Kaplay | Phaser | PixiJS | Excalibur |
|---------|--------|--------|--------|-----------|
| Physics component | `body()` + `area()` | Arcade / Matter.js | Not built-in | `CollisionType` + `Collider` |
| Gravity | `setGravity()` | `physics.arcade.gravity` | N/A | `Physics.gravity` |
| Static bodies | `body({ isStatic: true })` | `body.setImmovable(true)` | N/A | `CollisionType.Fixed` |
| Collision events | `onCollide()`, `onCollideUpdate()` | `collider()`, `overlap()` | N/A | `on('collisionstart')` |
| Grounded check | `isGrounded()` | `body.touching.down` | N/A | Manual via raycasts |
| Effectors (forces) | Built-in (area, buoyancy, point, surface) | Manual | N/A | Manual |
| One-way platforms | `onBeforeCollideUpdate` + return false | One-way collision body | N/A | Manual |

---

## Key Takeaways

1. **`area()` for detection, `body()` for physics.** Use `area()` alone for trigger zones and overlap detection. Add `body()` when you need solid collisions, gravity, and velocity.
2. **Static bodies for the environment.** Platforms, walls, and floors should use `body({ isStatic: true })` — they participate in collision resolution without being pushed or affected by gravity.
3. **Three collision events cover all cases.** `onCollide` (enter), `onCollideUpdate` (stay), and `onCollideEnd` (exit) map to every collision lifecycle you need.
4. **`isGrounded()` and `onGround()` for platformers.** Use the built-in grounded detection rather than manual raycasts. Combine with `onFallOff()` for coyote time.
5. **Effectors are powerful.** Wind, water, gravity wells, and conveyors are all just a single component addition — no manual force calculations needed.
6. **Use `collisionIgnore` for selective physics.** When you need ghosts that pass through walls, or bullets that only hit enemies, set the `collisionIgnore` array to skip specific tags.
