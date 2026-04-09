# G16 — Phaser 3 Groups, Object Pooling & Containers

> **Category:** guide · **Engine:** Phaser · **Related:** [G1 Scene Lifecycle](G1_scene_lifecycle.md) · [G4 Sprites and Animation](G4_sprites_and_animation.md) · [G2 Physics Systems](G2_physics_systems.md)

---

## Overview

Managing many game objects efficiently is critical for shooters, bullet-hell games, particle-heavy scenes, and any game that spawns/despawns objects at runtime. Phaser 3 provides three complementary structures — **Groups**, **Containers**, and **Layers** — each with different trade-offs around performance, physics integration, and transform inheritance.

This guide covers when and how to use each, with emphasis on **object pooling** via Groups — the single biggest performance optimization for games that create/destroy objects frequently.

---

## Groups

A `Phaser.GameObjects.Group` is a lightweight collection of game objects that share a common type or behavior. Groups do **not** have position, rotation, or alpha — they are organizational, not spatial.

### Creating a Group

```typescript
// Basic group — manages existing objects
const enemies = this.add.group();

// Physics group — all children get Arcade physics bodies automatically
const bullets = this.physics.add.group({
  classType: Bullet,        // Custom class extending Arcade.Sprite
  maxSize: 50,              // Cap at 50 instances (essential for pooling)
  runChildUpdate: true,     // Calls update() on each active child every frame
  active: false,            // Children start inactive (ready for pooling)
  visible: false,           // Children start invisible
});
```

### Key Group Methods

```typescript
// Add an existing game object
enemies.add(existingSprite);

// Create a new child using the group's classType + texture
const enemy = enemies.create(x, y, 'enemy-atlas', 'idle_0');

// Iterate only active children (skips pooled/inactive objects)
enemies.getChildren().filter(c => c.active).forEach(child => {
  // per-child logic
});

// Shorthand: call a method on all children
enemies.setAlpha(0.5);            // sets alpha on every child
enemies.incXY(1, 0);             // nudge all children right

// Remove a child (does NOT destroy it — reusable for pooling)
enemies.remove(child, false, false);

// Destroy all children and the group itself
enemies.destroy(true);  // true = also destroy children
```

### Physics Group Collisions

```typescript
// In create():
this.physics.add.overlap(
  this.bullets,    // Group A
  this.enemies,    // Group B
  this.onBulletHitEnemy,  // callback
  undefined,
  this
);

// Collide a group with a tilemap layer
this.physics.add.collider(this.enemies, this.groundLayer);
```

---

## Object Pooling with Groups

Object pooling avoids the cost of repeatedly calling `new` and letting the garbage collector clean up destroyed objects. Instead, you **deactivate** objects when they "die" and **reactivate** them when needed.

### The Pattern

```typescript
export class BulletPool {
  private group: Phaser.Physics.Arcade.Group;

  constructor(scene: Phaser.Scene) {
    this.group = scene.physics.add.group({
      classType: Bullet,
      maxSize: 100,
      runChildUpdate: true,
    });
  }

  /** Spawn a bullet from the pool. Returns null if pool is exhausted. */
  fire(x: number, y: number, velocityX: number, velocityY: number): Bullet | null {
    // getFirstDead(createIfNull, x, y, key, frame)
    // - Finds the first inactive child
    // - If none found AND pool isn't full, creates one
    const bullet = this.group.getFirstDead(true, x, y, 'bullet') as Bullet | null;

    if (bullet) {
      bullet.setActive(true);
      bullet.setVisible(true);
      bullet.body?.enable;          // re-enable physics body
      (bullet.body as Phaser.Physics.Arcade.Body).enable = true;
      bullet.setVelocity(velocityX, velocityY);
    }

    return bullet;
  }

  /** Return a bullet to the pool. */
  kill(bullet: Bullet): void {
    bullet.setActive(false);
    bullet.setVisible(false);
    bullet.setVelocity(0, 0);
    (bullet.body as Phaser.Physics.Arcade.Body).enable = false;
  }

  getGroup(): Phaser.Physics.Arcade.Group {
    return this.group;
  }
}
```

### Custom Pooled Game Object

```typescript
export class Bullet extends Phaser.Physics.Arcade.Sprite {
  private lifespan: number = 0;
  private maxLifespan: number = 2000; // ms

  constructor(scene: Phaser.Scene, x: number, y: number) {
    super(scene, x, y, 'bullet');
  }

  /** Called every frame when runChildUpdate is true on the parent group. */
  preUpdate(time: number, delta: number): void {
    super.preUpdate(time, delta);

    this.lifespan += delta;

    // Auto-recycle when lifespan expires or bullet leaves world bounds
    if (this.lifespan >= this.maxLifespan || !this.scene.cameras.main.worldView.contains(this.x, this.y)) {
      this.recycle();
    }
  }

  /** Reset state when pulled from pool. */
  spawn(x: number, y: number, vx: number, vy: number): void {
    this.setPosition(x, y);
    this.setActive(true);
    this.setVisible(true);
    this.setVelocity(vx, vy);
    (this.body as Phaser.Physics.Arcade.Body).enable = true;
    this.lifespan = 0;
  }

  /** Return to pool. */
  recycle(): void {
    this.setActive(false);
    this.setVisible(false);
    this.setVelocity(0, 0);
    (this.body as Phaser.Physics.Arcade.Body).enable = false;
    this.lifespan = 0;
  }
}
```

### Pooling Checklist

1. **Set `maxSize`** on the group to cap memory usage.
2. **Use `getFirstDead(true)`** — creates a new child only if no inactive one exists and pool isn't full.
3. **Disable physics bodies** on recycled objects — inactive sprites with enabled bodies still cost CPU.
4. **Stop tweens and timers** attached to recycled objects.
5. **Reset all custom state** (lifespan counters, damage, status effects) on spawn.

---

## Containers

A `Phaser.GameObjects.Container` is a **transform parent** — it has position, rotation, alpha, and scale that propagate to all children. Unlike Groups, children positions are **relative** to the container's origin.

### When to Use Containers

- **Composite UI elements**: health bar + text + icon that move together.
- **Multi-part characters**: body + weapon + shadow as a single movable unit.
- **Relative positioning**: children need to stay in formation.

### When NOT to Use Containers

- **Large collections of independent objects** (enemies, bullets) — use Groups.
- **Deeply nested hierarchies** — each nesting level adds per-child transform overhead.
- **Physics-heavy scenarios** — Containers don't have physics bodies by default; adding physics to a Container is awkward.

### Container Basics

```typescript
// Create a container at (400, 300)
const playerUnit = this.add.container(400, 300);

// Add children — positions are relative to the container
const body = this.add.sprite(0, 0, 'player-body');
const weapon = this.add.sprite(16, -4, 'sword');
const shadow = this.add.ellipse(0, 20, 32, 8, 0x000000, 0.3);

playerUnit.add([shadow, body, weapon]);  // render order: shadow behind, weapon on top

// Move the entire unit — all children follow
playerUnit.setPosition(500, 400);

// Rotate the entire unit
playerUnit.setAngle(45);

// Set alpha on everything at once
playerUnit.setAlpha(0.5);

// Get a child by index
const weaponRef = playerUnit.getAt(2) as Phaser.GameObjects.Sprite;
```

### Container with Physics (Workaround)

Containers don't natively support physics. The standard workaround is to attach a physics body via `MatterContainer` or manually sync an invisible physics sprite:

```typescript
// Create an invisible physics sprite at the container's position
const hitbox = this.physics.add.sprite(400, 300, '__DEFAULT');
hitbox.setVisible(false);
hitbox.body.setSize(32, 48);

// Sync container position to the hitbox every frame
this.events.on('update', () => {
  playerUnit.setPosition(hitbox.x, hitbox.y);
});
```

### Container Size for Input

Containers have zero size by default. To make them interactive:

```typescript
playerUnit.setSize(64, 64);  // set a hit area
playerUnit.setInteractive();
playerUnit.on('pointerdown', () => {
  console.log('Player unit clicked!');
});
```

---

## Layers

`Phaser.GameObjects.Layer` (added in v3.50) is a lightweight render-only grouping. It controls draw order without transform overhead.

```typescript
// Create layers for draw ordering
const bgLayer = this.add.layer();
const entityLayer = this.add.layer();
const uiLayer = this.add.layer();

// Add objects to layers — they render in layer order
bgLayer.add(this.add.image(0, 0, 'background'));
entityLayer.add(player);
entityLayer.add(enemy);
uiLayer.add(healthBar);
```

Layers are ideal for managing **z-order** without the per-child transform cost of Containers or the physics integration of Groups.

---

## Comparison Table

| Feature | Group | Container | Layer |
|---------|-------|-----------|-------|
| Has position / rotation / alpha | No | Yes (propagates to children) | No |
| Children positions relative to parent | No | Yes | No |
| Physics integration | Native (Arcade/Matter groups) | Manual workaround | None |
| Object pooling (`getFirstDead`) | Yes | No | No |
| Collision callbacks | Yes (group vs group) | No | No |
| Per-child transform overhead | None | Yes (scales with depth) | None |
| Draw order control | No (uses scene display list) | Yes (own display list) | Yes (own display list) |
| Best for | Collections, pooling, physics | Composite objects, UI | Render ordering |

---

## Common Mistakes

1. **Using Containers for bullet pools** — Containers add transform overhead per child per frame. Use Groups for large, independent collections.
2. **Forgetting to disable physics bodies on pooled objects** — An invisible, inactive sprite with an enabled physics body still participates in collision checks.
3. **Not setting `maxSize` on pools** — Without a cap, the pool grows unbounded if objects spawn faster than they recycle.
4. **Adding a game object to multiple Containers** — A game object can only belong to one Container. Adding it to a second silently removes it from the first.
5. **Nesting Containers deeply** — Each level multiplies transform calculations. Keep nesting to 2 levels maximum.
