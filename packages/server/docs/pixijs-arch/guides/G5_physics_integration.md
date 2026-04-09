# Physics Integration

> **Category:** guide · **Engine:** PixiJS · **Related:** [Scene & State Management](G3_scene_state_management.md), [Architecture Overview](../architecture/E1_architecture_overview.md)

PixiJS is a rendering engine, not a game engine — it has no built-in physics. For collision detection, rigid body dynamics, and constraints, you integrate a separate physics library. The two most popular choices are **Matter.js** (approachable, feature-rich) and **Planck.js** (Box2D port, deterministic and performant).

## Choosing a Physics Library

| Feature | Matter.js | Planck.js |
|---|---|---|
| API style | Functional, object-literal config | Class-based, Box2D conventions |
| Determinism | Approximate | Deterministic (fixed-point friendly) |
| Performance | Good for moderate body counts | Better for large simulations |
| Learning curve | Gentle — great docs and examples | Steeper — Box2D knowledge helps |
| Body types | Circles, rectangles, polygons, composites | Circles, polygons, edges, chains |
| Constraints | Springs, distance, mouse, revolute | Full Box2D joint set (revolute, prismatic, gear, etc.) |
| Best for | Prototypes, casual physics, puzzle games | Platformers, fighting games, simulations needing precision |

## Installation

```bash
# Matter.js
npm install matter-js
npm install -D @types/matter-js

# Planck.js (includes types)
npm install planck
```

## Matter.js Integration

### Core Setup

The pattern: create a Matter engine and world alongside a PixiJS application, then synchronize body positions to sprite transforms every frame.

```typescript
import * as PIXI from 'pixi.js';
import Matter from 'matter-js';

// --- PixiJS setup ---
const app = new PIXI.Application();
await app.init({ width: 800, height: 600, background: '#1a1a2e' });
document.body.appendChild(app.canvas);

// --- Matter.js setup ---
const engine = Matter.Engine.create();
const world = engine.world;

// Gravity defaults to { x: 0, y: 1 }. Adjust as needed:
engine.gravity.y = 1;
```

### Creating Physics Bodies with Sprites

Each game entity needs both a Matter body (for physics) and a PIXI sprite (for rendering). Store them together for easy sync:

```typescript
interface PhysicsSprite {
  body: Matter.Body;
  sprite: PIXI.Sprite;
}

function createBall(x: number, y: number, radius: number): PhysicsSprite {
  // Physics body
  const body = Matter.Bodies.circle(x, y, radius, {
    restitution: 0.7,
    friction: 0.1,
    density: 0.001
  });
  Matter.Composite.add(world, body);

  // Visual sprite
  const sprite = PIXI.Sprite.from('ball.png');
  sprite.anchor.set(0.5);
  sprite.width = radius * 2;
  sprite.height = radius * 2;
  app.stage.addChild(sprite);

  return { body, sprite };
}

function createBox(x: number, y: number, w: number, h: number): PhysicsSprite {
  const body = Matter.Bodies.rectangle(x, y, w, h, {
    restitution: 0.3,
    friction: 0.5
  });
  Matter.Composite.add(world, body);

  const sprite = PIXI.Sprite.from('crate.png');
  sprite.anchor.set(0.5);
  sprite.width = w;
  sprite.height = h;
  app.stage.addChild(sprite);

  return { body, sprite };
}

// Static ground (isStatic prevents physics from moving it)
const ground = Matter.Bodies.rectangle(400, 590, 800, 20, {
  isStatic: true
});
Matter.Composite.add(world, ground);
```

### The Game Loop — Sync Physics to Rendering

The critical step: each frame, step the physics engine first, then copy body positions and rotations onto sprites.

```typescript
const entities: PhysicsSprite[] = [];

// Create some objects
entities.push(createBall(400, 100, 25));
entities.push(createBox(300, 50, 50, 50));
entities.push(createBox(500, 200, 40, 40));

// Fixed timestep for physics (60 Hz)
const PHYSICS_DT = 1000 / 60;

app.ticker.add(() => {
  // Step physics
  Matter.Engine.update(engine, PHYSICS_DT);

  // Sync visuals to physics
  for (const entity of entities) {
    entity.sprite.position.set(
      entity.body.position.x,
      entity.body.position.y
    );
    entity.sprite.rotation = entity.body.angle;
  }
});
```

### Collision Events

Matter.js emits collision events on the engine:

```typescript
Matter.Events.on(engine, 'collisionStart', (event) => {
  for (const pair of event.pairs) {
    const { bodyA, bodyB } = pair;

    // Check collision labels or references
    if (bodyA.label === 'player' && bodyB.label === 'coin') {
      collectCoin(bodyB);
    }
  }
});

Matter.Events.on(engine, 'collisionEnd', (event) => {
  // Fires when bodies separate
});
```

Use `body.label` or store references in `body.plugin` to identify which game entity a body belongs to.

### Constraints and Joints

```typescript
// Distance constraint (rope/spring)
const rope = Matter.Constraint.create({
  bodyA: ball.body,
  bodyB: box.body,
  length: 150,
  stiffness: 0.02,    // 0 = loose, 1 = rigid
  damping: 0.01
});
Matter.Composite.add(world, rope);

// Pin constraint (revolute joint around a world point)
const pin = Matter.Constraint.create({
  bodyA: pendulum.body,
  pointB: { x: 400, y: 50 },  // world anchor
  length: 0,
  stiffness: 1
});
Matter.Composite.add(world, pin);
```

## Planck.js Integration

### Core Setup

Planck.js uses meters internally, so you need a pixel-to-meter scale factor:

```typescript
import * as PIXI from 'pixi.js';
import { World, Vec2, Box, Circle, Edge } from 'planck';

const SCALE = 30; // 30 pixels = 1 meter

const app = new PIXI.Application();
await app.init({ width: 800, height: 600, background: '#1a1a2e' });
document.body.appendChild(app.canvas);

const world = new World({
  gravity: Vec2(0, 10)  // 10 m/s² downward
});
```

### Bodies and Fixtures

```typescript
interface PlanckSprite {
  body: ReturnType<typeof world.createBody>;
  sprite: PIXI.Sprite;
}

function createDynamicCircle(px: number, py: number, radius: number): PlanckSprite {
  const body = world.createDynamicBody({
    position: Vec2(px / SCALE, py / SCALE)
  });
  body.createFixture({
    shape: Circle(radius / SCALE),
    density: 1.0,
    friction: 0.3,
    restitution: 0.6
  });

  const sprite = PIXI.Sprite.from('ball.png');
  sprite.anchor.set(0.5);
  sprite.width = radius * 2;
  sprite.height = radius * 2;
  app.stage.addChild(sprite);

  return { body, sprite };
}

// Static ground
const ground = world.createBody();
ground.createFixture({
  shape: Edge(Vec2(0, 580 / SCALE), Vec2(800 / SCALE, 580 / SCALE)),
  friction: 0.5
});
```

### Fixed Timestep with Interpolation

Planck.js (like Box2D) works best with a fixed timestep. Use accumulator-based stepping with visual interpolation for smooth rendering:

```typescript
const FIXED_DT = 1 / 60;
const VELOCITY_ITERATIONS = 8;
const POSITION_ITERATIONS = 3;
let accumulator = 0;

// Store previous positions for interpolation
const prevPositions = new Map<PlanckSprite, { x: number; y: number; angle: number }>();

app.ticker.add((ticker) => {
  accumulator += ticker.deltaMS / 1000;

  // Save previous state
  for (const entity of entities) {
    const pos = entity.body.getPosition();
    prevPositions.set(entity, {
      x: pos.x * SCALE,
      y: pos.y * SCALE,
      angle: entity.body.getAngle()
    });
  }

  // Step physics at fixed rate
  while (accumulator >= FIXED_DT) {
    world.step(FIXED_DT, VELOCITY_ITERATIONS, POSITION_ITERATIONS);
    accumulator -= FIXED_DT;
  }

  // Interpolate visuals
  const alpha = accumulator / FIXED_DT;
  for (const entity of entities) {
    const pos = entity.body.getPosition();
    const prev = prevPositions.get(entity)!;
    const currX = pos.x * SCALE;
    const currY = pos.y * SCALE;
    const currAngle = entity.body.getAngle();

    entity.sprite.position.set(
      prev.x + (currX - prev.x) * alpha,
      prev.y + (currY - prev.y) * alpha
    );
    entity.sprite.rotation = prev.angle + (currAngle - prev.angle) * alpha;
  }
});
```

### Contact Events

```typescript
world.on('begin-contact', (contact) => {
  const fixtureA = contact.getFixtureA();
  const fixtureB = contact.getFixtureB();
  const bodyA = fixtureA.getBody();
  const bodyB = fixtureB.getBody();

  // Use userData to identify game entities
  const dataA = bodyA.getUserData() as { type: string };
  const dataB = bodyB.getUserData() as { type: string };

  if (dataA?.type === 'player' && dataB?.type === 'enemy') {
    handlePlayerEnemyCollision(bodyA, bodyB);
  }
});

world.on('end-contact', (contact) => {
  // Bodies separated
});
```

## Removing Bodies

Always clean up both the physics body and the sprite when destroying entities:

```typescript
function destroyEntity(entity: PhysicsSprite): void {
  // Matter.js
  Matter.Composite.remove(world, entity.body);

  // PixiJS
  entity.sprite.removeFromParent();
  entity.sprite.destroy();
}

function destroyPlanckEntity(entity: PlanckSprite): void {
  world.destroyBody(entity.body);
  entity.sprite.removeFromParent();
  entity.sprite.destroy();
}
```

## Performance Tips

1. **Use static bodies for terrain** — static bodies skip broad-phase checks and cost almost nothing.
2. **Sleep idle bodies** — Matter.js supports `enableSleeping: true` on the engine; Planck bodies sleep by default. Sleeping bodies consume no CPU until another body contacts them.
3. **Simplify collision shapes** — use circles and boxes over complex polygons where possible. Convex decomposition for concave shapes is expensive.
4. **Limit body count** — pool and recycle bodies instead of creating/destroying frequently. 200–500 active bodies is a practical limit for smooth 60 fps in a browser.
5. **Fixed timestep matters** — variable timesteps cause jitter and tunneling. Always step physics at a fixed rate, especially with Planck.js.
6. **Use collision filtering** — both libraries support category/mask bit filtering to skip irrelevant collision checks.

## Comparison: Phaser vs PixiJS Physics Approach

Phaser bundles Arcade Physics and Matter.js out of the box with automatic sprite-body sync. With PixiJS you write the sync loop yourself, but this gives you full control over the physics pipeline, timestep strategy, and which library to use. The manual approach is more work but avoids Phaser's opinionated abstractions when you need fine-grained physics behavior.
