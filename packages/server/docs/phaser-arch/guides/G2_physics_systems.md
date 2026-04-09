# G2 — Phaser 3 Physics Systems

> **Category:** guide · **Engine:** Phaser · **Related:** [E1 Architecture Overview](../architecture/E1_architecture_overview.md) · [G1 Scene Lifecycle](G1_scene_lifecycle.md)

---

## Overview

Phaser 3 ships with two physics engines: **Arcade Physics** (lightweight, AABB and circle only) and **Matter.js** (full rigid-body, polygon shapes, joints, constraints). Arcade covers the vast majority of 2D games — platformers, top-down RPGs, shoot-em-ups — while Matter handles games that need realistic physical interactions, complex shapes, or ragdoll-style chains.

This guide covers both systems: when to use each, how to configure them, body types, collisions, groups, and practical patterns.

---

## Choosing a Physics System

| Criteria | Arcade | Matter.js |
|----------|--------|-----------|
| Shape support | Rectangles, circles | Any convex polygon, compound shapes |
| Performance | Very fast (optimized AABB broadphase) | Heavier (full SAT solver) |
| Gravity | World-wide or per-body | World-wide or per-body |
| Joints / constraints | No | Yes (springs, pins, distance, revolute) |
| Slopes / angled surfaces | Hacky (tile slopes only) | Native |
| Typical use cases | Platformers, shmups, puzzle games, top-down RPGs | Pool/billiards, angry-birds-style, ragdolls, vehicles |
| Setup | Enabled by default | Requires config opt-in |

**Rule of thumb:** Start with Arcade. Switch to Matter only when you need polygon shapes, joints, or physically realistic interactions. You can run both in the same scene, but they cannot interact with each other.

---

## Arcade Physics

### Enabling Arcade Physics

Arcade is enabled by default, but you can configure it explicitly:

```typescript
const config: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  width: 800,
  height: 600,
  physics: {
    default: 'arcade',
    arcade: {
      gravity: { x: 0, y: 300 },   // pixels/sec²
      debug: true,                   // shows collision boxes in dev
    },
  },
  scene: [GameScene],
};

const game = new Phaser.Game(config);
```

### Body Types: Dynamic vs Static

Every Arcade physics object has a body that is either **dynamic** (moves, affected by gravity and velocity) or **static** (immovable, optimized for level geometry).

```typescript
create(): void {
  // Dynamic body — affected by gravity, can move
  this.player = this.physics.add.sprite(100, 200, 'player');
  this.player.setCollideWorldBounds(true);
  this.player.setBounce(0.2);

  // Static body — immovable platforms, walls, floors
  const platforms = this.physics.add.staticGroup();
  platforms.create(400, 568, 'ground').setScale(2).refreshBody();
  platforms.create(600, 400, 'platform');
  platforms.create(50, 250, 'platform');

  // Collision between dynamic and static
  this.physics.add.collider(this.player, platforms);
}
```

**Important:** After scaling or repositioning a static body, call `.refreshBody()` to recalculate its collision bounds. Dynamic bodies update automatically.

### Velocity, Acceleration, and Drag

```typescript
// Direct velocity — instant movement (good for player input)
this.player.setVelocityX(200);
this.player.setVelocityY(-400);  // negative = upward
this.player.setVelocity(200, -400);  // both axes

// Acceleration — gradual speed change (good for vehicles, sliding)
this.player.setAccelerationX(100);

// Max velocity — cap speed
this.player.setMaxVelocity(300, 500);

// Drag — deceleration when no acceleration is applied
this.player.setDragX(200);

// Bounce — 0 = no bounce, 1 = full bounce
this.player.setBounce(0.5);
```

### Gravity

```typescript
// World gravity (affects all dynamic bodies)
this.physics.world.gravity.y = 500;

// Per-body gravity scale (0 = ignore world gravity)
this.player.body!.setGravityY(200);    // additional gravity
this.floatingEnemy.body!.setGravityY(-300);  // counteract world gravity

// Disable gravity for a specific body
this.projectile.body!.setAllowGravity(false);
```

### Collision Shapes

Arcade supports only rectangles and circles. You can resize and offset the collision body to fit your sprite:

```typescript
create(): void {
  const player = this.physics.add.sprite(100, 200, 'player');

  // Default: rectangle matching the sprite's full frame size
  // Resize to a smaller hitbox (width, height)
  player.body!.setSize(20, 40);

  // Offset the hitbox relative to the sprite's top-left
  player.body!.setOffset(6, 8);

  // Use a circle instead of a rectangle
  const ball = this.physics.add.sprite(400, 100, 'ball');
  ball.body!.setCircle(16);          // radius
  ball.body!.setOffset(0, 0);        // center the circle
}
```

---

## Colliders and Overlaps

The two core collision methods are `collider` (physical response — objects bounce off each other) and `overlap` (detection only — objects pass through each other but fire a callback).

### collider — Physical Collision Response

```typescript
create(): void {
  this.player = this.physics.add.sprite(100, 200, 'player');
  this.platforms = this.physics.add.staticGroup();
  this.platforms.create(400, 568, 'ground');

  // Objects physically collide — the player stands on the platform
  this.physics.add.collider(this.player, this.platforms);

  // Collider with callback — physical collision + custom logic
  this.enemies = this.physics.add.group();
  this.physics.add.collider(
    this.player,
    this.enemies,
    this.onPlayerHitEnemy,   // callback
    undefined,                // processCallback (optional filter)
    this                      // context
  );
}

private onPlayerHitEnemy(
  player: Phaser.Types.Physics.Arcade.GameObjectWithBody,
  enemy: Phaser.Types.Physics.Arcade.GameObjectWithBody
): void {
  // Both objects physically respond AND this callback runs
  const p = player as Phaser.Physics.Arcade.Sprite;
  const e = enemy as Phaser.Physics.Arcade.Sprite;

  // Stomp mechanic: if player is falling and above the enemy
  if (p.body!.velocity.y > 0 && p.y < e.y - 16) {
    e.destroy();
    p.setVelocityY(-250);  // bounce up
  } else {
    this.playerTakeDamage();
  }
}
```

### overlap — Detection Only (No Physics Response)

```typescript
create(): void {
  this.coins = this.physics.add.group();

  // Objects pass through each other, but the callback fires
  this.physics.add.overlap(
    this.player,
    this.coins,
    this.collectCoin,
    undefined,
    this
  );
}

private collectCoin(
  player: Phaser.Types.Physics.Arcade.GameObjectWithBody,
  coin: Phaser.Types.Physics.Arcade.GameObjectWithBody
): void {
  (coin as Phaser.Physics.Arcade.Sprite).disableBody(true, true);
  this.score += 10;
  this.events.emit('score-changed', this.score);
}
```

### processCallback — Conditional Collision

The optional `processCallback` lets you filter whether the collision/overlap should fire:

```typescript
this.physics.add.overlap(
  this.player,
  this.powerups,
  this.collectPowerup,
  (player, powerup) => {
    // Only collect if the player doesn't already have this powerup
    return !this.activePowerups.has((powerup as any).powerupType);
  },
  this
);
```

---

## Physics Groups

Groups let you manage collections of physics objects efficiently. Collisions against a group check all members automatically.

### Static Groups (Platforms, Walls)

```typescript
create(): void {
  const platforms = this.physics.add.staticGroup();

  // Create children directly
  platforms.create(400, 568, 'ground');
  platforms.create(600, 400, 'platform');

  // Or add existing sprites
  const wall = this.add.image(50, 300, 'wall');
  platforms.add(wall);

  this.physics.add.collider(this.player, platforms);
}
```

### Dynamic Groups (Enemies, Projectiles, Coins)

```typescript
create(): void {
  this.bullets = this.physics.add.group({
    classType: Phaser.Physics.Arcade.Image,
    maxSize: 20,           // object pool limit
    runChildUpdate: true,  // calls update() on each active child
    allowGravity: false,
    collideWorldBounds: true,
  });

  // Fire a bullet
  this.input.on('pointerdown', () => {
    const bullet = this.bullets.get(this.player.x, this.player.y, 'bullet');
    if (bullet) {
      bullet.setActive(true).setVisible(true);
      bullet.body!.enable = true;
      bullet.setVelocityX(500);
    }
  });

  // Recycle when hitting world bounds
  this.physics.world.on('worldbounds', (body: Phaser.Physics.Arcade.Body) => {
    const obj = body.gameObject as Phaser.Physics.Arcade.Image;
    if (this.bullets.contains(obj)) {
      this.bullets.killAndHide(obj);
      obj.body!.enable = false;
    }
  });
}
```

### Group vs Group Collision

```typescript
// All bullets collide with all enemies
this.physics.add.collider(this.bullets, this.enemies, (bullet, enemy) => {
  (bullet as Phaser.Physics.Arcade.Image).disableBody(true, true);
  (enemy as Phaser.Physics.Arcade.Sprite).destroy();
});

// Members within the same group collide with each other
this.physics.add.collider(this.enemies, this.enemies);
```

---

## Tilemap Collision

For tile-based games, set collision on specific tile indices or properties:

```typescript
create(): void {
  const map = this.make.tilemap({ key: 'level1' });
  const tileset = map.addTilesetImage('tileset-name', 'tiles');
  const groundLayer = map.createLayer('Ground', tileset!);

  // By tile index range
  groundLayer?.setCollisionBetween(1, 48);

  // By specific indices
  groundLayer?.setCollision([1, 2, 3, 10, 11, 12]);

  // By custom property set in Tiled editor (recommended)
  groundLayer?.setCollisionByProperty({ collides: true });

  // Exclude specific tiles from collision
  groundLayer?.setCollisionByExclusion([-1, 0]);  // -1 = empty tile

  // Set up collision with the player
  if (groundLayer) {
    this.physics.add.collider(this.player, groundLayer);
  }
}
```

### One-Way Platforms

```typescript
create(): void {
  const platformLayer = map.createLayer('Platforms', tileset!);
  platformLayer?.setCollisionByProperty({ oneWay: true });

  this.physics.add.collider(
    this.player,
    platformLayer!,
    undefined,
    (player, tile) => {
      // Only collide when falling downward
      const body = (player as Phaser.Physics.Arcade.Sprite).body!;
      return body.velocity.y >= 0;
    },
    this
  );
}
```

---

## Matter.js Physics

### Enabling Matter.js

Matter is not enabled by default. Opt in via the game config:

```typescript
const config: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  width: 800,
  height: 600,
  physics: {
    default: 'matter',
    matter: {
      gravity: { x: 0, y: 1 },    // Matter uses a 0-1 scale for gravity
      debug: true,
      enableSleeping: true,         // inactive bodies sleep for performance
    },
  },
  scene: [GameScene],
};
```

### Creating Matter Bodies

```typescript
create(): void {
  // Rectangle body with sprite
  this.player = this.matter.add.sprite(400, 200, 'player');
  this.player.setRectangle(32, 48);
  this.player.setFixedRotation();        // prevent tumbling
  this.player.setFriction(0.5);
  this.player.setBounce(0.1);

  // Circle body
  const ball = this.matter.add.sprite(300, 100, 'ball');
  ball.setCircle(16);
  ball.setBounce(0.8);

  // Polygon body (hexagon)
  const hex = this.matter.add.sprite(500, 100, 'hex');
  hex.setBody({
    type: 'polygon',
    sides: 6,
    radius: 24,
  });

  // Static body (immovable)
  const ground = this.matter.add.sprite(400, 580, 'ground', undefined, {
    isStatic: true,
  });

  // Bodies from physics editor (PhysicsEditor JSON)
  const crate = this.matter.add.sprite(200, 100, 'crate');
  const shapes = this.cache.json.get('shapes');
  crate.setBody(shapes.crate);   // complex polygon from editor
}
```

### Matter Collision Detection

Matter uses collision categories and events instead of Arcade's collider/overlap pattern:

```typescript
create(): void {
  // Collision categories (bitmask flags)
  const PLAYER = this.matter.world.nextCategory();
  const ENEMY = this.matter.world.nextCategory();
  const GROUND = this.matter.world.nextCategory();
  const PICKUP = this.matter.world.nextCategory();

  // Set categories and what each collides with
  this.player.setCollisionCategory(PLAYER);
  this.player.setCollidesWith([GROUND, ENEMY, PICKUP]);

  // Listen for collisions via world events
  this.matter.world.on('collisionstart', (event: Phaser.Physics.Matter.Events.CollisionStartEvent) => {
    for (const pair of event.pairs) {
      const { bodyA, bodyB } = pair;

      // Identify colliding game objects
      const objA = bodyA.gameObject as Phaser.Physics.Matter.Sprite;
      const objB = bodyB.gameObject as Phaser.Physics.Matter.Sprite;

      if (!objA || !objB) continue;

      // Check collision by label
      if (bodyA.label === 'player' && bodyB.label === 'coin') {
        objB.destroy();
        this.score += 10;
      }
    }
  });
}
```

### Constraints (Joints)

```typescript
create(): void {
  const ballA = this.matter.add.image(300, 100, 'ball');
  const ballB = this.matter.add.image(400, 100, 'ball');

  // Distance constraint — keeps two bodies at a fixed distance
  this.matter.add.constraint(ballA, ballB, 100, 0.5);
  // args: bodyA, bodyB, length, stiffness (0-1)

  // Pin constraint — anchor a body to a fixed world point
  const pendulum = this.matter.add.image(400, 200, 'weight');
  this.matter.add.worldConstraint(pendulum, 150, 0.9, {
    pointA: { x: 400, y: 50 },  // world anchor point
  });

  // Spring — low stiffness makes a bouncy connection
  const platform = this.matter.add.image(400, 400, 'platform');
  this.matter.add.worldConstraint(platform, 0, 0.05, {
    pointA: { x: 400, y: 200 },
    damping: 0.05,
  });
}
```

---

## Common Platformer Patterns

### Basic Platformer Controller (Arcade)

```typescript
export class GameScene extends Phaser.Scene {
  private player!: Phaser.Physics.Arcade.Sprite;
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;

  create(): void {
    this.player = this.physics.add.sprite(100, 300, 'player');
    this.player.setCollideWorldBounds(true);
    this.player.body!.setSize(20, 40);
    this.player.body!.setOffset(6, 8);

    this.cursors = this.input.keyboard!.createCursorKeys();
  }

  update(): void {
    const speed = 200;
    const jumpVelocity = -400;
    const onGround = this.player.body!.blocked.down;

    // Horizontal movement
    if (this.cursors.left.isDown) {
      this.player.setVelocityX(-speed);
      this.player.setFlipX(true);
      this.player.anims.play('run', true);
    } else if (this.cursors.right.isDown) {
      this.player.setVelocityX(speed);
      this.player.setFlipX(false);
      this.player.anims.play('run', true);
    } else {
      this.player.setVelocityX(0);
      this.player.anims.play('idle', true);
    }

    // Jump — only when on the ground
    if (this.cursors.up.isDown && onGround) {
      this.player.setVelocityY(jumpVelocity);
    }
  }
}
```

### Coyote Time and Jump Buffering

```typescript
private coyoteTime = 80;     // ms of grace after leaving a platform
private jumpBuffer = 100;    // ms of pre-jump input buffering
private lastOnGround = 0;
private lastJumpPressed = 0;

update(time: number): void {
  const onGround = this.player.body!.blocked.down;

  if (onGround) {
    this.lastOnGround = time;
  }

  if (Phaser.Input.Keyboard.JustDown(this.cursors.up)) {
    this.lastJumpPressed = time;
  }

  // Jump allowed if: recently on ground (coyote) AND recently pressed jump (buffer)
  const canCoyoteJump = (time - this.lastOnGround) < this.coyoteTime;
  const hasBufferedJump = (time - this.lastJumpPressed) < this.jumpBuffer;

  if (canCoyoteJump && hasBufferedJump) {
    this.player.setVelocityY(-400);
    this.lastJumpPressed = 0;   // consume the buffered input
    this.lastOnGround = 0;      // consume the coyote window
  }
}
```

### Moving Platforms (Arcade)

```typescript
create(): void {
  this.movingPlatform = this.physics.add.image(400, 400, 'platform');
  this.movingPlatform.setImmovable(true);
  this.movingPlatform.body!.setAllowGravity(false);
  this.movingPlatform.setVelocityX(100);

  this.physics.add.collider(this.player, this.movingPlatform);
}

update(): void {
  // Reverse direction at edges
  if (this.movingPlatform.x >= 600) {
    this.movingPlatform.setVelocityX(-100);
  } else if (this.movingPlatform.x <= 200) {
    this.movingPlatform.setVelocityX(100);
  }
}
```

---

## Running Both Systems Together

You can use Arcade and Matter in the same scene for different objects. They will **not** interact with each other — Arcade sprites and Matter sprites exist in separate physics worlds.

```typescript
const config: Phaser.Types.Core.GameConfig = {
  physics: {
    arcade: { gravity: { x: 0, y: 300 } },
    matter: { gravity: { x: 0, y: 1 } },
  },
};

create(): void {
  // Arcade-controlled player
  this.player = this.physics.add.sprite(100, 200, 'player');

  // Matter-controlled debris (realistic tumbling)
  const crate = this.matter.add.image(300, 50, 'crate');
  crate.setBounce(0.5);
  crate.setFriction(0.3);

  // These two CANNOT collide with each other
  // Use Arcade for gameplay, Matter for visual/decorative physics
}
```

---

## Performance Tips

1. **Prefer Arcade** unless you specifically need polygon shapes or joints.
2. **Use static bodies for level geometry** — they use an optimized spatial tree and skip velocity calculations.
3. **Enable sleeping in Matter** (`enableSleeping: true`) — inactive bodies stop being simulated until disturbed.
4. **Use object pools for projectiles** — create a group with `maxSize` and recycle with `killAndHide()` / `get()`.
5. **Disable physics on off-screen objects** — `body.enable = false` for objects outside the camera viewport.
6. **Turn off debug rendering in production** — debug mode draws collision shapes every frame, which is expensive.
7. **Limit Matter body complexity** — more vertices per polygon = more expensive collision detection.

---

## Comparison: Physics Across Web Frameworks

| Concept | Phaser Arcade | Phaser Matter | Kaplay | Excalibur | PixiJS |
|---------|---------------|---------------|--------|-----------|--------|
| Built-in | Yes (default) | Yes (opt-in) | Yes (arcade-style) | Yes (SAT-based) | No |
| Shape types | Rect, circle | Any polygon | Rect, circle, polygon | Rect, circle, polygon, edge | N/A |
| Gravity | Per-world + per-body | Per-world + per-body | Per-world | Per-scene + per-body | N/A |
| Joints / constraints | No | Yes | No | No | N/A |
| Tilemap collision | Native | Via plugin | Native | Via TileMap | N/A |
| Best for | Most 2D games | Realistic physics | Simple games | TypeScript games | Bring your own |

---

## Key Takeaways

1. **Use Arcade Physics for 90% of 2D games** — it's fast, simple, and handles platformers, top-down, and shmups well.
2. **Use Matter.js when you need polygon shapes, joints, or realistic physics** — pool games, Angry Birds-style, ragdolls, and vehicles.
3. **`collider` = physical response, `overlap` = detection only** — this is the most fundamental distinction in Arcade Physics.
4. **Static bodies are for level geometry** — platforms, walls, and floors should always be static for performance.
5. **Use groups for collections** — bullets, enemies, coins, and platforms should be in groups for efficient collision checking.
6. **Set collision on tilemap layers** — `setCollisionByProperty()` is the cleanest approach when using Tiled.
7. **Arcade and Matter can coexist but cannot interact** — use this for mixing gameplay physics (Arcade) with decorative physics (Matter).
