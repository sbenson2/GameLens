# G3 — libGDX Box2D Physics Guide

> **Category:** guide · **Engine:** libGDX · **Related:** [Architecture Overview](../architecture/E1_architecture_overview.md) · [Getting Started](../guides/G1_getting_started.md) · [Kotlin Patterns](../guides/G2_kotlin_patterns.md) · [Scene2D UI](../reference/R1_scene2d_ui.md)

libGDX bundles Box2D as a first-party extension — a thin Java wrapper around the native C++ Box2D engine. It handles rigid-body physics, collision detection, and physical simulation. This guide covers world setup, body creation, fixtures, stepping, collision callbacks, debug rendering, and the Kotlin KTX DSL.

---

## Setup

### Adding the Dependency

Box2D is included as an official libGDX extension. In your `build.gradle`:

```groovy
// Core module
project(":core") {
    dependencies {
        api "com.badlogicgames.gdx:gdx-box2d:$gdxVersion"
    }
}

// Desktop module
project(":desktop") {
    dependencies {
        implementation "com.badlogicgames.gdx:gdx-box2d-platform:$gdxVersion:natives-desktop"
    }
}

// Android module
project(":android") {
    dependencies {
        natives "com.badlogicgames.gdx:gdx-box2d-platform:$gdxVersion:natives-armeabi-v7a"
        natives "com.badlogicgames.gdx:gdx-box2d-platform:$gdxVersion:natives-arm64-v8a"
        natives "com.badlogicgames.gdx:gdx-box2d-platform:$gdxVersion:natives-x86"
        natives "com.badlogicgames.gdx:gdx-box2d-platform:$gdxVersion:natives-x86_64"
    }
}
```

For Kotlin projects using KTX, also add:

```groovy
api "io.github.libktx:ktx-box2d:$ktxVersion"
```

---

## Core Concepts

Box2D operates on its own coordinate system measured in **meters**, not pixels. A common convention is 1 meter = 32–100 pixels, depending on your game's scale. You'll need a conversion factor or a camera setup that works in world units.

```
┌─────────────────────────────────────────────┐
│                  World                       │
│  ┌──────────┐                               │
│  │  Body    │◄── Position, velocity, angle  │
│  │  ┌──────┐│                               │
│  │  │Fixture│◄── Shape, density, friction   │
│  │  └──────┘│                               │
│  └──────────┘                               │
│                                              │
│  step(dt) → simulate → resolve contacts     │
└─────────────────────────────────────────────┘
```

**World** — The physics simulation container. Holds all bodies and runs the solver.
**Body** — A rigid body with position, velocity, and rotation. Has no shape on its own.
**Fixture** — Attaches a collision shape to a body, plus physical properties (density, friction, restitution).
**Shape** — The geometry: circle, polygon, edge, or chain.

---

## Creating the World

```java
// Gravity vector: 9.8 m/s² downward
World world = new World(new Vector2(0, -9.8f), true);
// Second param: doSleep — inactive bodies stop being simulated (performance win)
```

**Kotlin:**
```kotlin
val world = World(Vector2(0f, -9.8f), true)
```

---

## Creating Bodies

### Body Types

| Type | Behavior | Example |
|------|----------|---------|
| `BodyDef.BodyType.StaticBody` | Never moves, infinite mass | Ground, walls, platforms |
| `BodyDef.BodyType.DynamicBody` | Fully simulated — affected by forces and collisions | Player, enemies, projectiles |
| `BodyDef.BodyType.KinematicBody` | Moves at set velocity, not affected by forces | Moving platforms, elevators |

### Java — Manual Creation

```java
// 1. Define the body
BodyDef bodyDef = new BodyDef();
bodyDef.type = BodyDef.BodyType.DynamicBody;
bodyDef.position.set(5, 10);  // meters, not pixels

// 2. Create the body in the world
Body body = world.createBody(bodyDef);

// 3. Define the fixture shape
PolygonShape shape = new PolygonShape();
shape.setAsBox(0.5f, 0.5f);  // half-width, half-height in meters

// 4. Define fixture properties
FixtureDef fixtureDef = new FixtureDef();
fixtureDef.shape = shape;
fixtureDef.density = 1.0f;       // mass = density × area
fixtureDef.friction = 0.3f;      // surface friction (0–1)
fixtureDef.restitution = 0.5f;   // bounciness (0 = no bounce, 1 = perfect bounce)

// 5. Attach the fixture to the body
body.createFixture(fixtureDef);

// 6. Dispose the shape (body keeps its own copy)
shape.dispose();
```

### Kotlin KTX — Type-Safe DSL

The KTX Box2D module provides a much cleaner API:

```kotlin
import ktx.box2d.*

// Create a dynamic body with a box fixture in one block
val body = world.body {
    type = BodyDef.BodyType.DynamicBody
    position.set(5f, 10f)

    box(width = 1f, height = 1f) {
        density = 1f
        friction = 0.3f
        restitution = 0.5f
    }
}

// Circle fixture
val ball = world.body {
    type = BodyDef.BodyType.DynamicBody
    position.set(3f, 15f)

    circle(radius = 0.5f) {
        density = 2f
        restitution = 0.8f
    }
}

// Static ground with edge shape
val ground = world.body {
    // type defaults to StaticBody
    edge(from = Vector2(-20f, 0f), to = Vector2(20f, 0f)) {
        friction = 0.5f
    }
}
```

### Common Fixture Shapes

| KTX DSL | Java Shape | Use Case |
|---------|------------|----------|
| `box(w, h)` | `PolygonShape.setAsBox()` | Crates, platforms, characters |
| `circle(r)` | `CircleShape` | Balls, coins, wheels |
| `polygon(vertices)` | `PolygonShape.set()` | Custom convex shapes (max 8 vertices) |
| `edge(from, to)` | `EdgeShape` | Ground lines, one-sided walls |
| `chain(vertices)` | `ChainShape` | Terrain surfaces, level boundaries |

---

## Stepping the Simulation

Box2D must be stepped at a **fixed time interval** for deterministic behavior. Never pass the raw frame delta:

```java
private static final float TIME_STEP = 1 / 60f;
private static final int VELOCITY_ITERATIONS = 6;
private static final int POSITION_ITERATIONS = 2;
private float accumulator = 0;

public void update(float deltaTime) {
    // Fixed timestep with accumulator
    accumulator += Math.min(deltaTime, 0.25f);  // cap to prevent spiral of death
    while (accumulator >= TIME_STEP) {
        world.step(TIME_STEP, VELOCITY_ITERATIONS, POSITION_ITERATIONS);
        accumulator -= TIME_STEP;
    }
}
```

**Velocity iterations** — how many times the solver refines velocity constraints (higher = more accurate stacking).
**Position iterations** — how many times the solver corrects overlaps (higher = less jitter at rest).

The values 6/2 are the Box2D recommended defaults. Increase for precision-critical games (e.g., puzzle physics); decrease for better performance on mobile.

---

## Collision Detection

### Contact Listener

Register a listener on the world to respond to collisions:

```java
world.setContactListener(new ContactListener() {
    @Override
    public void beginContact(Contact contact) {
        Fixture fixtureA = contact.getFixtureA();
        Fixture fixtureB = contact.getFixtureB();
        // Identify what collided using user data
        Object dataA = fixtureA.getBody().getUserData();
        Object dataB = fixtureB.getBody().getUserData();
        if (dataA instanceof Player || dataB instanceof Player) {
            handlePlayerCollision(contact);
        }
    }

    @Override
    public void endContact(Contact contact) { }

    @Override
    public void preSolve(Contact contact, Manifold oldManifold) { }

    @Override
    public void postSolve(Contact contact, ContactImpulse impulse) {
        // Access collision force for damage calculations
        float maxImpulse = 0;
        for (float imp : impulse.getNormalImpulses()) {
            maxImpulse = Math.max(maxImpulse, imp);
        }
        if (maxImpulse > DAMAGE_THRESHOLD) {
            applyDamage(contact, maxImpulse);
        }
    }
});
```

### User Data Pattern

Attach your game objects to bodies so you can identify them during collisions:

```java
// When creating the body
body.setUserData(myGameEntity);

// In the contact listener
Entity entity = (Entity) body.getUserData();
```

**Kotlin:**
```kotlin
val body = world.body {
    userData = myGameEntity
    // ...
}
```

### Collision Filtering

Control which objects can collide using categories and masks:

```java
// Category bits — each object type gets a power of 2
static final short CATEGORY_PLAYER    = 0x0001;
static final short CATEGORY_ENEMY     = 0x0002;
static final short CATEGORY_BULLET    = 0x0004;
static final short CATEGORY_WALL      = 0x0008;

// In your fixture definition
fixtureDef.filter.categoryBits = CATEGORY_BULLET;
fixtureDef.filter.maskBits = CATEGORY_ENEMY | CATEGORY_WALL;
// This bullet collides with enemies and walls, but passes through the player
```

---

## Debug Rendering

Box2DDebugRenderer draws all physics bodies as wireframes — essential for development:

```java
Box2DDebugRenderer debugRenderer = new Box2DDebugRenderer();
OrthographicCamera camera = new OrthographicCamera();
// Camera should be sized in meters (world units), not pixels
camera.setToOrtho(false, 30, 20);  // 30m × 20m viewport

// In your render method
debugRenderer.render(world, camera.combined);
```

Enable/disable specific elements:

```java
debugRenderer.setDrawBodies(true);
debugRenderer.setDrawJoints(true);
debugRenderer.setDrawAABBs(false);     // axis-aligned bounding boxes
debugRenderer.setDrawContacts(true);   // collision contact points
debugRenderer.setDrawVelocities(true); // velocity vectors
```

---

## Syncing Physics with Sprites

Box2D bodies and your game sprites live in different coordinate systems. Sync them each frame:

```java
// Convert physics position (meters) to render position (pixels)
float PPM = 64f;  // pixels per meter

public void render() {
    for (Body body : physicsBodies) {
        GameEntity entity = (GameEntity) body.getUserData();
        // Body position is the center; sprite position may be bottom-left
        float x = body.getPosition().x * PPM - entity.getWidth() / 2;
        float y = body.getPosition().y * PPM - entity.getHeight() / 2;
        float angleDeg = body.getAngle() * MathUtils.radiansToDegrees;
        entity.sprite.setPosition(x, y);
        entity.sprite.setRotation(angleDeg);
    }
}
```

**Better approach:** Set your camera to work in world units (meters) and skip pixel conversion entirely:

```java
OrthographicCamera camera = new OrthographicCamera();
camera.setToOrtho(false, 20, 15);  // 20m × 15m viewport
// Now sprites and physics use the same coordinate space
```

---

## Destroying Bodies Safely

Never destroy bodies inside a contact listener or during `world.step()` — this crashes Box2D. Queue them for destruction after the step:

```java
Array<Body> bodiesToDestroy = new Array<>();

// In contact listener:
bodiesToDestroy.add(bulletBody);

// After world.step():
for (Body body : bodiesToDestroy) {
    world.destroyBody(body);
}
bodiesToDestroy.clear();
```

---

## Cleanup

Dispose of Box2D resources when leaving the screen or shutting down:

```java
@Override
public void dispose() {
    world.dispose();
    debugRenderer.dispose();
}
```

In KTX, the world extension handles fixture shape disposal automatically when using the DSL builders.

---

## Common Gotchas

**Units are meters, not pixels.** A 64-pixel character should be ~1–2 meters in Box2D. Making a body 64 units wide creates a skyscraper-sized object and the simulation will behave strangely.

**Fixed timestep is mandatory.** Variable timesteps cause non-deterministic behavior — objects tunnel through walls, stacking is unstable, and replays diverge.

**Don't create/destroy bodies during step.** Queue changes and apply them after `world.step()` returns.

**Max polygon vertices is 8.** Box2D limits `PolygonShape` to 8 vertices. For complex shapes, use multiple fixtures on one body (compound shapes).

**Sensors detect but don't collide.** Set `fixtureDef.isSensor = true` for trigger zones (checkpoints, pickups). They fire `beginContact`/`endContact` but don't generate physical responses.

**Sleeping bodies save performance.** When `doSleep` is enabled (recommended), bodies at rest stop being simulated. Wake them with `body.setAwake(true)` or by applying a force.
