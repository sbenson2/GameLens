# G1 — Excalibur.js Actors & Entities

> **Category:** guide · **Engine:** Excalibur · **Related:** [E1 Architecture Overview](../architecture/E1_architecture_overview.md) · [G2 Scene Management](G2_scene_management.md)

---

## Overview

Actors are the primary way to represent things in an Excalibur game — players, enemies, platforms, projectiles, pickups, and UI elements. Every Actor comes with built-in position, velocity, graphics, collision, and actions. Beneath the Actor API, Excalibur runs a full Entity Component System (ECS), which you can drop into when you need fine-grained control.

This guide covers Actor creation, the Actor lifecycle, graphics and animation, collision types, the underlying ECS, and practical patterns for common game objects.

---

## Creating Actors

An Actor is created by extending the `Actor` class or instantiating it directly:

```typescript
import { Actor, Engine, vec, Color, CollisionType } from 'excalibur';

// Inline Actor — good for simple objects
const platform = new Actor({
  pos: vec(400, 500),
  width: 800,
  height: 32,
  color: Color.Green,
  collisionType: CollisionType.Fixed,
});

// Extended Actor — the recommended approach for game objects with behavior
export class Player extends Actor {
  private speed = 200;

  constructor(pos: ex.Vector) {
    super({
      pos,
      width: 32,
      height: 48,
      collisionType: CollisionType.Active,
      color: Color.Blue,  // fallback if no sprite is set
    });
  }

  onInitialize(engine: Engine): void {
    // Set up graphics, input bindings, collision handlers
    // This runs once, before the first frame this actor appears
  }

  onPreUpdate(engine: Engine, delta: number): void {
    // Game logic — input, movement, state changes
    // Runs every frame
  }
}
```

### Constructor Options

| Option | Type | Purpose |
|--------|------|---------|
| `pos` | `Vector` | Starting position in world coordinates |
| `width`, `height` | `number` | Collision box dimensions |
| `color` | `Color` | Fallback fill color (when no graphic is assigned) |
| `collisionType` | `CollisionType` | Physics behavior (see Collision section below) |
| `vel` | `Vector` | Initial velocity |
| `acc` | `Vector` | Constant acceleration |
| `rotation` | `number` | Initial rotation in radians |
| `scale` | `Vector` | Scale factor |
| `anchor` | `Vector` | Transform origin (default: `vec(0.5, 0.5)` = center) |
| `z` | `number` | Draw order (higher = on top) |

---

## Actor Lifecycle

Every actor follows a predictable lifecycle once it's added to a scene:

```
onInitialize(engine)       ← once, before the first frame
    ↓
onPreUpdate(engine, delta) ← every frame (before physics)
    ↓
[physics / collision resolution]
    ↓
onPostUpdate(engine, delta) ← every frame (after physics)
    ↓
onPreKill()                ← when kill() is called, before removal
    ↓
onPostKill()               ← after removal from scene
```

### onInitialize(engine)

Called once, the first time the actor is part of an active scene. This is where you set up graphics, register collision handlers, and configure initial state. It is **not** called again if the actor is removed and re-added.

```typescript
onInitialize(engine: Engine): void {
  // Set up spritesheet
  const spriteSheet = SpriteSheet.fromImageSource({
    image: Resources.heroImage,
    grid: { rows: 2, columns: 4, spriteWidth: 32, spriteHeight: 48 },
  });

  // Create animations
  const idle = Animation.fromSpriteSheet(
    spriteSheet, [0, 1, 2, 3], 150, AnimationStrategy.Loop
  );
  const run = Animation.fromSpriteSheet(
    spriteSheet, [4, 5, 6, 7], 100, AnimationStrategy.Loop
  );

  // Register graphics by name
  this.graphics.add('idle', idle);
  this.graphics.add('run', run);
  this.graphics.use('idle');

  // Register collision handlers
  this.on('collisionstart', (evt) => {
    if (evt.other.hasTag('coin')) {
      evt.other.kill();
      this.score++;
    }
  });
}
```

### onPreUpdate(engine, delta) and onPostUpdate(engine, delta)

Called every frame. `onPreUpdate` runs before physics resolution, `onPostUpdate` runs after. Most game logic (input, movement, AI) goes in `onPreUpdate`:

```typescript
onPreUpdate(engine: Engine, delta: number): void {
  // delta = milliseconds since last frame
  this.vel.x = 0;

  if (engine.input.keyboard.isHeld(Input.Keys.Left)) {
    this.vel.x = -this.speed;
    this.graphics.use('run');
    this.graphics.flipHorizontal = true;
  } else if (engine.input.keyboard.isHeld(Input.Keys.Right)) {
    this.vel.x = this.speed;
    this.graphics.use('run');
    this.graphics.flipHorizontal = false;
  } else {
    this.graphics.use('idle');
  }

  if (engine.input.keyboard.wasPressed(Input.Keys.Space)) {
    this.vel.y = -400;  // jump
  }
}
```

### onPreKill() and onPostKill()

Called when `actor.kill()` is invoked. Use `onPreKill` for death effects and cleanup, `onPostKill` for post-removal logic:

```typescript
onPreKill(): void {
  // Spawn death particles or play a sound before removal
  this.scene?.add(new DeathEffect(this.pos));
}
```

---

## Graphics System

Excalibur separates graphics from actors — an Actor can switch between multiple named graphics at runtime.

### Static Sprites

```typescript
import { ImageSource, Sprite, Actor } from 'excalibur';

const Resources = {
  heroImage: new ImageSource('/assets/hero.png'),
};

class Player extends Actor {
  onInitialize(): void {
    // Convert loaded ImageSource to a Sprite
    const sprite = Resources.heroImage.toSprite();
    this.graphics.use(sprite);
  }
}
```

### Spritesheets and Animation

```typescript
import { SpriteSheet, Animation, AnimationStrategy } from 'excalibur';

onInitialize(): void {
  const sheet = SpriteSheet.fromImageSource({
    image: Resources.heroImage,
    grid: {
      rows: 2,
      columns: 8,
      spriteWidth: 32,
      spriteHeight: 48,
    },
    spacing: {
      margin: { x: 0, y: 0 },   // gap around the sheet edge
      originOffset: { x: 0, y: 0 },
    },
  });

  // Create animations from specific frame indices
  const idle = Animation.fromSpriteSheet(
    sheet,
    [0, 1, 2, 3],           // frame indices
    150,                      // ms per frame
    AnimationStrategy.Loop    // Loop, End, Freeze, PingPong
  );

  const run = Animation.fromSpriteSheet(sheet, [4, 5, 6, 7], 100, AnimationStrategy.Loop);
  const jump = Animation.fromSpriteSheet(sheet, [8, 9, 10], 120, AnimationStrategy.Freeze);
  const attack = Animation.fromSpriteSheet(sheet, [12, 13, 14, 15], 80, AnimationStrategy.End);

  this.graphics.add('idle', idle);
  this.graphics.add('run', run);
  this.graphics.add('jump', jump);
  this.graphics.add('attack', attack);
  this.graphics.use('idle');
}

onPreUpdate(engine: Engine): void {
  if (engine.input.keyboard.isHeld(Input.Keys.Right)) {
    this.graphics.use('run');
    this.graphics.flipHorizontal = false;
  } else {
    this.graphics.use('idle');
  }
}
```

### Animation Strategies

| Strategy | Behavior | Use for |
|----------|----------|---------|
| `Loop` | Replays forever | Walk, idle, fly cycles |
| `End` | Plays once, then the animation completes and fires the `end` event | Attack, death, one-shot effects |
| `Freeze` | Plays once, freezes on the last frame | Jump apex, charge-up |
| `PingPong` | Plays forward then backward, repeating | Breathing, pulsing |

### Graphics Groups (Composite Sprites)

Combine multiple graphics into one visual:

```typescript
import { GraphicsGroup } from 'excalibur';

const bodySprite = Resources.bodyImage.toSprite();
const armorSprite = Resources.armorImage.toSprite();
const weaponSprite = Resources.weaponImage.toSprite();

const compositeGraphic = new GraphicsGroup({
  members: [
    { graphic: bodySprite, offset: vec(0, 0) },
    { graphic: armorSprite, offset: vec(0, 0) },
    { graphic: weaponSprite, offset: vec(10, -5) },
  ],
});

this.graphics.use(compositeGraphic);
```

---

## Collision Types

Every Actor has a `collisionType` that determines how it interacts with other actors physically:

| Type | Moves | Physics Response | Use For |
|------|-------|------------------|---------|
| `CollisionType.Active` | Yes | Full collision response (bounces, pushes) | Players, enemies, projectiles |
| `CollisionType.Fixed` | No | Others collide against it, but it doesn't move | Platforms, walls, terrain |
| `CollisionType.Passive` | Can move | Detects overlap, no physics push | Triggers, pickups, sensors, coins |
| `CollisionType.PreventCollision` | Yes | No detection whatsoever | Background decor, particles |

### Collision Events

```typescript
// On this specific actor
this.on('collisionstart', (evt: CollisionStartEvent) => {
  console.log('Started touching:', evt.other);
  console.log('Contact direction:', evt.contact.normal);
});

this.on('collisionend', (evt: CollisionEndEvent) => {
  console.log('Stopped touching:', evt.other);
});

// Continuous collision (fires every frame while overlapping)
this.on('precollision', (evt: PreCollisionEvent) => {
  // useful for continuous damage zones
});
```

### Using Tags for Collision Filtering

```typescript
// Tag actors when creating them
const coin = new Actor({
  pos: vec(300, 400),
  width: 16, height: 16,
  collisionType: CollisionType.Passive,
});
coin.addTag('coin');
coin.addTag('pickup');

// Filter collisions by tag
player.on('collisionstart', (evt) => {
  if (evt.other.hasTag('coin')) {
    evt.other.kill();
    score += 10;
  }
  if (evt.other.hasTag('enemy')) {
    playerHealth--;
  }
  if (evt.other.hasTag('door')) {
    engine.goToScene('nextLevel');
  }
});
```

---

## Actions API: Scripted Behavior

Excalibur includes a built-in Actions system for scripting movement sequences without manual velocity math:

```typescript
import { Actor, vec } from 'excalibur';

// Move to a point over 2 seconds
actor.actions.moveTo(vec(500, 300), 200);  // 200 px/sec

// Chain actions — they run sequentially
actor.actions
  .moveTo(vec(500, 100), 150)
  .delay(500)                         // wait 500ms
  .moveTo(vec(100, 100), 150)
  .delay(500)
  .moveTo(vec(100, 500), 150)
  .repeatForever();                   // loop the whole chain

// Other actions
actor.actions.rotateTo(Math.PI, 1);       // rotate to π over 1 second
actor.actions.scaleTo(vec(2, 2), vec(1, 1)); // scale up
actor.actions.fade(0, 1000);              // fade out over 1 second
actor.actions.die();                      // kill after current actions finish

// Easing
actor.actions.easeTo(vec(500, 300), 1000, EasingFunctions.EaseInOutCubic);
```

### Action Patterns

**Patrol route:**
```typescript
const guard = new Actor({ pos: vec(100, 300), ... });

guard.actions
  .moveTo(vec(500, 300), 100)
  .delay(1000)
  .moveTo(vec(100, 300), 100)
  .delay(1000)
  .repeatForever();
```

**Pickup bob animation:**
```typescript
const coin = new Actor({ pos: vec(300, 400), ... });

coin.actions
  .moveBy(vec(0, -8), 200)
  .moveBy(vec(0, 8), 200)
  .repeatForever();
```

---

## The Entity Component System (ECS)

Beneath every Actor is Excalibur's ECS. Actors are Entities with pre-attached components (TransformComponent, GraphicsComponent, BodyComponent, ColliderComponent). You can add custom components for data and custom systems for logic.

### Custom Component

Components are pure data containers:

```typescript
import { Component } from 'excalibur';

export class HealthComponent extends Component {
  public type = 'health';

  constructor(
    public current: number,
    public max: number
  ) {
    super();
  }

  heal(amount: number): void {
    this.current = Math.min(this.current + amount, this.max);
  }

  damage(amount: number): void {
    this.current = Math.max(this.current - amount, 0);
  }

  get isDead(): boolean {
    return this.current <= 0;
  }
}
```

### Custom System

Systems contain logic and operate on entities that have specific components:

```typescript
import { System, SystemType, Query, World } from 'excalibur';
import { HealthComponent } from '../components/HealthComponent';

export class HealthSystem extends System {
  public systemType = SystemType.Update;
  private query: Query;

  constructor(world: World) {
    super();
    this.query = world.query([HealthComponent]);
  }

  update(delta: number): void {
    for (const entity of this.query.entities) {
      const health = entity.get(HealthComponent)!;
      if (health.isDead) {
        entity.kill();
      }
    }
  }
}
```

### Registering Components and Systems

```typescript
import { Scene, Engine } from 'excalibur';
import { HealthComponent } from '../components/HealthComponent';
import { HealthSystem } from '../systems/HealthSystem';

export class GameScene extends Scene {
  onInitialize(engine: Engine): void {
    // Register the system
    this.world.add(new HealthSystem(this.world));

    // Create an actor with the custom component
    const enemy = new Actor({ pos: vec(400, 300), width: 32, height: 32 });
    enemy.addComponent(new HealthComponent(100, 100));
    this.add(enemy);
  }
}

// Access the component from anywhere you have the actor
const hp = enemy.get(HealthComponent);
hp?.damage(25);
```

### Actor vs Raw Entity: When to Use Which

| Scenario | Use Actor | Use Entity |
|----------|-----------|------------|
| Player, enemy, NPC, pickup, platform | Yes | — |
| Needs graphics, collision, position out of the box | Yes | — |
| Data-only object (timer manager, game state tracker) | — | Yes |
| High-volume identical objects (particle system, thousands of bullets) | — | Yes (lighter weight) |
| 90% of game development | Yes | — |

**Rule of thumb:** Start with Actors. Only reach for raw Entities when you hit a specific performance need or an object genuinely has no visual/physical presence.

---

## ScreenElement: UI Actors

For HUD elements that should not move with the camera, use `ScreenElement`:

```typescript
import { ScreenElement, Label, Font, Color, vec } from 'excalibur';

export class ScoreDisplay extends ScreenElement {
  private label!: Label;

  constructor() {
    super({ pos: vec(16, 16) });
  }

  onInitialize(): void {
    this.label = new Label({
      text: 'Score: 0',
      pos: vec(0, 0),
      font: new Font({
        size: 24,
        color: Color.White,
        family: 'monospace',
      }),
    });
    this.addChild(this.label);
  }

  updateScore(score: number): void {
    this.label.text = `Score: ${score}`;
  }
}

// Add to scene
const scoreDisplay = new ScoreDisplay();
scene.add(scoreDisplay);
```

`ScreenElement` extends `Actor` but is drawn in screen-space coordinates, unaffected by camera position or zoom.

---

## Practical Patterns

### Platformer Player (Full Example)

```typescript
import {
  Actor, Engine, Input, vec, CollisionType,
  SpriteSheet, Animation, AnimationStrategy
} from 'excalibur';
import { Resources } from '../resources';

export class Player extends Actor {
  private speed = 200;
  private jumpForce = -450;
  private isOnGround = false;

  constructor(pos: ex.Vector) {
    super({
      pos,
      width: 24,
      height: 44,
      collisionType: CollisionType.Active,
      anchor: vec(0.5, 1),  // bottom-center anchor for platformers
    });
  }

  onInitialize(engine: Engine): void {
    // Graphics
    const sheet = SpriteSheet.fromImageSource({
      image: Resources.heroImage,
      grid: { rows: 2, columns: 4, spriteWidth: 32, spriteHeight: 48 },
    });
    this.graphics.add('idle', Animation.fromSpriteSheet(sheet, [0, 1, 2, 3], 150, AnimationStrategy.Loop));
    this.graphics.add('run', Animation.fromSpriteSheet(sheet, [4, 5, 6, 7], 100, AnimationStrategy.Loop));
    this.graphics.use('idle');

    // Ground detection via collision
    this.on('postcollision', (evt) => {
      if (evt.contact.normal.y < 0) {
        this.isOnGround = true;
      }
    });
  }

  onPreUpdate(engine: Engine, delta: number): void {
    this.vel.x = 0;
    this.isOnGround = false;  // reset each frame, set by collision

    // Horizontal movement
    if (engine.input.keyboard.isHeld(Input.Keys.Left)) {
      this.vel.x = -this.speed;
      this.graphics.use('run');
      this.graphics.flipHorizontal = true;
    } else if (engine.input.keyboard.isHeld(Input.Keys.Right)) {
      this.vel.x = this.speed;
      this.graphics.use('run');
      this.graphics.flipHorizontal = false;
    } else {
      this.graphics.use('idle');
    }

    // Jump
    if (engine.input.keyboard.wasPressed(Input.Keys.Space) && this.isOnGround) {
      this.vel.y = this.jumpForce;
    }
  }
}
```

### Enemy with Patrol

```typescript
export class PatrolEnemy extends Actor {
  private startX: number;
  private patrolDistance: number;
  private patrolSpeed: number;
  private direction = 1;

  constructor(pos: ex.Vector, distance = 200, speed = 80) {
    super({
      pos,
      width: 28,
      height: 32,
      collisionType: CollisionType.Active,
    });
    this.startX = pos.x;
    this.patrolDistance = distance;
    this.patrolSpeed = speed;
  }

  onInitialize(): void {
    const sprite = Resources.enemyImage.toSprite();
    this.graphics.use(sprite);
    this.addTag('enemy');
  }

  onPreUpdate(engine: Engine, delta: number): void {
    this.vel.x = this.patrolSpeed * this.direction;

    if (Math.abs(this.pos.x - this.startX) > this.patrolDistance) {
      this.direction *= -1;
      this.graphics.flipHorizontal = this.direction < 0;
    }
  }
}
```

### Collectible Pickup

```typescript
export class Coin extends Actor {
  constructor(pos: ex.Vector) {
    super({
      pos,
      width: 16,
      height: 16,
      collisionType: CollisionType.Passive,  // detects overlap, no physics push
    });
  }

  onInitialize(): void {
    const sprite = Resources.coinImage.toSprite();
    this.graphics.use(sprite);
    this.addTag('coin');
    this.addTag('pickup');

    // Gentle bob animation
    this.actions
      .moveBy(vec(0, -6), 150)
      .moveBy(vec(0, 6), 150)
      .repeatForever();
  }
}
```

---

## Comparison: Game Object Models Across Frameworks

| Concept | Excalibur | Phaser | Kaplay | PixiJS |
|---------|-----------|--------|--------|--------|
| Primary game object | `Actor` (class) | `GameObjects.*` (class) | `add([components])` (functional) | `Sprite` / `Container` (class) |
| Custom behavior | Override `onPreUpdate` | Override `update()` | Custom component with `update()` | `ticker.add()` callback |
| Collision | Built-in SAT, `CollisionType` enum | Arcade (AABB) or Matter.js | Built-in arcade, `area()` + `body()` | None (bring your own) |
| Graphics switching | `this.graphics.add(name, graphic)` | `this.setTexture()` / `this.play()` | `obj.play(anim)` | `sprite.texture = ...` |
| Scripted movement | Actions API (`actions.moveTo()`) | Tweens | `moveTo()` + `timer()` | GSAP or custom |
| ECS access | Full (Component, System, Query) | None | ECS-inspired, no raw access | None |
| UI elements | `ScreenElement` (screen-space Actor) | Separate UI scene | `fixed()` component | Manual Container positioning |

---

## Key Takeaways

1. **Extend `Actor` for game objects** — Actors come with position, velocity, graphics, collision, and actions built in. This handles 90% of use cases.
2. **Use `onInitialize` for setup, `onPreUpdate` for frame logic** — `onInitialize` runs once; `onPreUpdate`/`onPostUpdate` run every frame.
3. **Set `CollisionType` correctly** — `Active` for moving collidable objects, `Fixed` for immovable platforms, `Passive` for triggers and pickups, `PreventCollision` for decoration.
4. **Use `this.graphics.add(name, graphic)` to register multiple graphics** — switch between them with `this.graphics.use(name)`. Graphics and actors are decoupled.
5. **Use the Actions API for scripted movement** — patrol routes, pickups bobbing, fade-outs, and sequences are cleaner with `.actions.moveTo().delay().repeatForever()` than manual velocity math.
6. **Tags provide flexible identity** — use `addTag()` and `hasTag()` for collision filtering and object queries. Prefer tags over `instanceof` checks.
7. **Use ECS only when Actors aren't enough** — custom Components (data) and Systems (logic) are available for performance-critical scenarios or novel behavior patterns, but Actors cover most games.
8. **Use `ScreenElement` for HUD** — it renders in screen-space, unaffected by the camera, which is exactly what you want for score displays, health bars, and menus.
