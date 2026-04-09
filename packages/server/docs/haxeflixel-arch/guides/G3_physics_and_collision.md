# G3 — HaxeFlixel Physics, Collision, and Gameplay Patterns

> **Category:** guide · **Engine:** HaxeFlixel · **Related:** [Architecture Overview](../architecture/E1_architecture_overview.md) · [Getting Started](G1_getting_started.md) · [Tilemaps](G2_tilemap_and_level_design.md) · [Cross-Compilation](../reference/R1_cross_compilation.md)

HaxeFlixel ships a built-in physics and collision system that handles the vast majority of 2D game needs without external libraries. This guide covers the core collision API, group-based optimization, pixel-perfect detection, and common gameplay patterns built on top of the collision system.

---

## The Collision Model

HaxeFlixel uses **axis-aligned bounding box (AABB)** collision built into `FlxObject`. Every `FlxObject` (and therefore every `FlxSprite`) has a rectangular hitbox defined by `width`, `height`, `x`, and `y`. The engine provides two top-level functions for collision detection:

| Function | What it Does | Use Case |
|----------|-------------|----------|
| `FlxG.collide(a, b)` | Detects overlap **and separates** objects | Walls, floors, solid objects |
| `FlxG.overlap(a, b)` | Detects overlap **without separating** | Pickups, triggers, damage zones |

Both accept `FlxObject`, `FlxGroup`, or `FlxTilemap` as either argument. Under the hood, `FlxG.collide` is just `FlxG.overlap` with `FlxObject.separate` as the process callback.

---

## Basic Collision: collide()

The quickest way to add solid collision to a game. Call it in your `FlxState.update()`:

```haxe
override function update(elapsed:Float):Void {
    super.update(elapsed);

    // Player can't walk through walls
    FlxG.collide(player, walls);

    // Enemies collide with each other and with walls
    FlxG.collide(enemies, walls);
    FlxG.collide(enemies, enemies);
}
```

### How Separation Works

When two objects overlap, `FlxObject.separate()` pushes them apart along the axis of least penetration. It respects each object's `immovable`, `mass`, and `allowCollisions` properties:

```haxe
// A wall that never moves when collided with
wall.immovable = true;

// A heavy crate that's harder to push
crate.mass = 3.0;

// A platform you can only land on from above
platform.allowCollisions = FlxDirectionFlags.UP;
```

### Built-in Physics Properties

Every `FlxObject` has Flixel's simple physics baked in:

```haxe
player.velocity.set(200, 0);       // Pixels per second
player.acceleration.y = 800;        // Gravity
player.maxVelocity.set(300, 600);   // Speed cap
player.drag.x = 400;                // Deceleration when no input
player.elasticity = 0.5;            // Bounce factor (0 = no bounce, 1 = full)
```

These are integrated automatically by `FlxObject.updateMotion()` each frame — you don't call a separate physics step.

---

## Overlap Detection: overlap()

Use `overlap()` for non-solid interactions where you need a callback:

```haxe
FlxG.overlap(player, coins, collectCoin);

function collectCoin(player:FlxSprite, coin:FlxSprite):Void {
    coin.kill();          // Remove coin from the game
    score += 10;
    FlxG.sound.play("assets/sounds/coin.wav");
}
```

### Process Callbacks for Filtering

Both `collide()` and `overlap()` accept an optional **process callback** — a function that returns `Bool` to filter which pairs actually trigger the collision:

```haxe
FlxG.overlap(bullets, enemies, bulletHitEnemy, shouldBulletCollide);

function shouldBulletCollide(bullet:FlxSprite, enemy:FlxSprite):Bool {
    // Don't collide if enemy is invincible
    return !cast(enemy, Enemy).isInvincible;
}

function bulletHitEnemy(bullet:FlxSprite, enemy:FlxSprite):Void {
    bullet.kill();
    cast(enemy, Enemy).takeDamage(10);
}
```

---

## Groups and Quadtree Optimization

### FlxGroup and FlxTypedGroup

`FlxGroup` is the primary container for organizing game objects. When passed to `FlxG.collide()` or `FlxG.overlap()`, Flixel uses a **quadtree** to dramatically reduce the number of overlap checks.

```haxe
// Typed group for compile-time safety
var enemies = new FlxTypedGroup<Enemy>();
var bullets = new FlxTypedGroup<Bullet>();
var coins   = new FlxTypedGroup<Coin>();

// One call handles all bullet-vs-enemy pairs efficiently
FlxG.overlap(bullets, enemies, bulletHitEnemy);
```

**Why this matters:** Without groups, checking 50 bullets against 30 enemies requires 1,500 individual overlap checks. With a quadtree, only spatially nearby pairs are tested — often reducing checks by 90% or more.

### Nesting Groups

Groups can be nested for broad-phase organization:

```haxe
// Top-level groups
var solidObjects = new FlxGroup();
solidObjects.add(walls);
solidObjects.add(platforms);
solidObjects.add(crates);

// One call collides the player against all solid things
FlxG.collide(player, solidObjects);
```

### Object Pooling via Groups

`FlxTypedGroup` doubles as an object pool. Instead of creating and destroying objects, recycle dead ones:

```haxe
var bullets = new FlxTypedGroup<Bullet>(50);  // Pre-size to 50

function fireBullet():Void {
    var b = bullets.recycle(Bullet);   // Reuse a dead bullet or create new
    b.reset(player.x, player.y);
    b.velocity.x = 600;
}
```

`recycle()` searches for the first member with `exists == false` and calls `reset()` on it. This avoids garbage collection pressure — critical for HTML5 targets.

---

## Pixel-Perfect Collision

For cases where AABBs are too imprecise (irregularly shaped sprites, precision puzzle games), use `FlxCollision`:

```haxe
import flixel.util.FlxCollision;

if (FlxCollision.pixelPerfectCheck(spriteA, spriteB)) {
    // Sprites overlap at the pixel level
}
```

**Performance note:** Pixel-perfect checks are expensive. `FlxCollision.pixelPerfectCheck` runs a bounding box test first and only does pixel comparison on the intersecting rectangle. Even so, limit usage to a small number of critical object pairs per frame.

### Alpha Threshold

By default, pixels with any alpha > 0 count as solid. Adjust the threshold:

```haxe
// Only consider pixels with alpha >= 128 as solid
FlxCollision.pixelPerfectCheck(spriteA, spriteB, 128);
```

---

## Tilemap Collision

`FlxTilemap` has built-in collision support. Tiles with index > 0 are solid by default, and you can configure collision on individual tiles or ranges:

```haxe
// Set tile indices 1-5 as solid walls
tilemap.setTileProperties(1, FlxDirectionFlags.ANY, null, null, 5);

// Set tile 6 as a one-way platform (only solid from above)
tilemap.setTileProperties(6, FlxDirectionFlags.UP);

// Set tile 7 as a ladder (no collision, but overlap-detectable)
tilemap.setTileProperties(7, FlxDirectionFlags.NONE);
```

Collide against the tilemap like any other object:

```haxe
FlxG.collide(player, tilemap);
FlxG.collide(enemies, tilemap);
```

The tilemap uses spatial hashing internally — only tiles near an object are tested, so collision is efficient even with massive maps.

---

## Common Gameplay Patterns

### Platformer Movement

```haxe
class Player extends FlxSprite {
    static inline var GRAVITY = 800;
    static inline var JUMP_FORCE = -350;
    static inline var MOVE_SPEED = 200;
    static inline var DRAG_AMOUNT = 600;

    override function new(x:Float, y:Float) {
        super(x, y);
        acceleration.y = GRAVITY;
        maxVelocity.set(MOVE_SPEED, 600);
        drag.x = DRAG_AMOUNT;
    }

    override function update(elapsed:Float):Void {
        // Horizontal movement
        acceleration.x = 0;
        if (FlxG.keys.pressed.LEFT)  acceleration.x = -MOVE_SPEED * 6;
        if (FlxG.keys.pressed.RIGHT) acceleration.x =  MOVE_SPEED * 6;

        // Jump — only when touching a floor
        if (FlxG.keys.justPressed.UP && isTouching(FlxDirectionFlags.DOWN)) {
            velocity.y = JUMP_FORCE;
        }

        super.update(elapsed);
    }
}
```

### Top-Down RPG Movement

```haxe
override function update(elapsed:Float):Void {
    velocity.set(0, 0);

    if (FlxG.keys.pressed.LEFT)  velocity.x = -SPEED;
    if (FlxG.keys.pressed.RIGHT) velocity.x =  SPEED;
    if (FlxG.keys.pressed.UP)    velocity.y = -SPEED;
    if (FlxG.keys.pressed.DOWN)  velocity.y =  SPEED;

    // Normalize diagonal movement so it's not faster
    if (velocity.x != 0 && velocity.y != 0) {
        velocity.x *= 0.707;   // 1 / sqrt(2)
        velocity.y *= 0.707;
    }

    super.update(elapsed);
}
```

### Damage Zone with Knockback

```haxe
FlxG.overlap(player, spikes, spikeHit);

function spikeHit(p:FlxSprite, spike:FlxSprite):Void {
    if (cast(p, Player).isInvincible) return;

    cast(p, Player).takeDamage(1);

    // Knockback: push player away from spike center
    var angle = FlxAngle.angleBetween(spike, p);
    p.velocity.set(
        Math.cos(angle) * 300,
        Math.sin(angle) * 300
    );
}
```

### Moving Platform

```haxe
class MovingPlatform extends FlxSprite {
    var startY:Float;
    var range:Float;

    override function new(x:Float, y:Float, range:Float) {
        super(x, y);
        this.startY = y;
        this.range = range;
        immovable = true;                         // Don't get pushed by player
        allowCollisions = FlxDirectionFlags.UP;   // One-way from above
    }

    override function update(elapsed:Float):Void {
        // Sine-wave vertical movement
        velocity.y = Math.sin(FlxG.game.ticks / 1000) * range;
        super.update(elapsed);
    }
}
```

---

## Collision Debugging

Flixel's debug overlay shows hitboxes and collision state. Toggle it at runtime:

```haxe
FlxG.debugger.drawDebug = true;   // Show all hitboxes
```

Individual objects can opt in or out:

```haxe
sprite.ignoreDrawDebug = true;    // Hide this sprite's hitbox in debug view
```

For custom debug rendering, override `drawDebug()` on any `FlxObject`:

```haxe
override function drawDebug():Void {
    super.drawDebug();
    // Draw additional debug info (sensor zones, patrol paths, etc.)
}
```

---

## Performance Tips

1. **Use groups, not individual checks.** One `FlxG.collide(groupA, groupB)` call with quadtree acceleration replaces O(n*m) individual checks.
2. **Kill off-screen objects.** Call `kill()` on bullets and particles that leave the screen — dead objects are skipped during collision.
3. **Limit pixel-perfect checks.** Reserve `FlxCollision.pixelPerfectCheck` for a small number of critical interactions (e.g., player vs. boss hitbox), not broad-phase sweeps.
4. **Set appropriate `allowCollisions`.** If an object only needs collision from one side (platforms, spikes), restricting directions reduces work.
5. **Pool with `recycle()`.** Avoid object allocation during gameplay — reuse objects from typed groups for bullets, particles, and pickups.
