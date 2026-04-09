# G1 — Kaplay Components & Game Objects

> **Category:** guide · **Engine:** Kaplay · **Related:** [E1 Architecture Overview](../architecture/E1_architecture_overview.md) · [G2 Scenes & Navigation](G2_scenes_and_navigation.md)

---

## Overview

Game objects in Kaplay are built by composing **components** — small, reusable units that each provide a specific capability. A sprite component makes an object visible, a `pos()` component gives it a position, `area()` gives it a collision hitbox, `body()` makes it respond to gravity. This component-composition model is the core of Kaplay's architecture and the key to writing clean, reusable game code.

This guide covers how game objects work, the full built-in component library, custom component authoring, tags, parent-child hierarchies, and practical patterns for common game object types.

---

## Creating Game Objects with `add()`

Every game object is created with `add()`, which takes an array of components and tags:

```typescript
import kaplay from 'kaplay';

const k = kaplay({ width: 800, height: 600, background: [26, 26, 46] });

k.loadSprite('hero', 'sprites/hero.png');

k.scene('game', () => {
  // Create a player game object
  const player = k.add([
    k.sprite('hero'),          // what it looks like
    k.pos(100, 300),           // where it is
    k.area(),                  // collision hitbox (auto-sized from sprite)
    k.body(),                  // responds to gravity
    k.anchor('center'),        // origin point
    k.health(3),               // 3 hit points
    k.opacity(1),              // fully visible
    k.z(10),                   // draw order (higher = on top)
    'player',                  // tag (plain string)
    'friendly',                // multiple tags allowed
    { speed: 200, coins: 0 },  // custom data (any object)
  ]);

  // All component methods are now available on the object
  player.move(100, 0);         // from pos()
  player.hurt(1);              // from health()
  player.isGrounded();         // from body()
  player.play('run');          // from sprite()
  console.log(player.speed);   // from custom data: 200
});

k.go('game');
```

### How Composition Works

When `add()` processes the component array, it merges all properties and methods from every component onto a single object. The returned game object has a flat interface — you call `player.move()` directly, not `player.posComponent.move()`. This keeps the API extremely concise.

```
add([sprite('hero'), pos(100, 200), area(), body(), 'player'])
    ↓
GameObj {
  // From sprite():
  play(), stop(), frame, flipX(), flipY(), width, height, ...
  // From pos():
  pos, move(), moveTo(), worldPos(), ...
  // From area():
  onCollide(), onCollideUpdate(), onCollideEnd(), isHovering(), ...
  // From body():
  jump(), isGrounded(), isFalling(), gravityScale, ...
  // Tags:
  is('player') → true
  // Custom data:
  speed: 200, coins: 0
}
```

---

## Built-In Component Reference

### Transform & Position

| Component | Key Properties / Methods | Purpose |
|-----------|--------------------------|---------|
| `pos(x, y)` | `.pos` (Vec2), `.move(dx, dy)`, `.moveTo(target, speed)`, `.worldPos()` | Position in world coordinates |
| `anchor(point)` | `.anchor` | Transform origin: `'center'`, `'topleft'`, `'botleft'`, etc. |
| `rotate(angle)` | `.angle` | Rotation in degrees |
| `scale(s)` or `scale(sx, sy)` | `.scale` (Vec2) | Size multiplier |
| `z(index)` | `.z` | Draw order (higher renders on top) |
| `opacity(val)` | `.opacity` (0–1) | Transparency |
| `layer(name)` | `.layer` | Assign to a named rendering layer |

### Rendering

| Component | Key Properties / Methods | Purpose |
|-----------|--------------------------|---------|
| `sprite(name, opts?)` | `.play(anim)`, `.stop()`, `.frame`, `.flipX(bool)`, `.flipY(bool)`, `.width`, `.height` | Sprite rendering + animation |
| `text(str, opts?)` | `.text` | Text rendering. Options: `size`, `font`, `width` (wrap), `align` |
| `rect(w, h)` | `.width`, `.height` | Rectangle shape |
| `circle(radius)` | `.radius` | Circle shape |
| `polygon(pts)` | `.pts` | Polygon shape |
| `color(r, g, b)` | `.color` (Color) | Fill or tint color |
| `outline(width, color?)` | `.outline` | Stroke outline |

### Physics & Collision

| Component | Key Properties / Methods | Purpose |
|-----------|--------------------------|---------|
| `area(opts?)` | `.onCollide(tag, fn)`, `.onCollideUpdate(tag, fn)`, `.onCollideEnd(tag, fn)`, `.isHovering()`, `.isClicked()`, `.onClick(fn)` | Collision hitbox + pointer events |
| `body(opts?)` | `.jump(force)`, `.isGrounded()`, `.isFalling()`, `.gravityScale`, `.isStatic` | Gravity, landing, jumping |

`body()` options:

```typescript
k.body({
  isStatic: true,   // immovable (platforms, walls)
  mass: 2,          // heavier objects push lighter ones
  jumpForce: 500,   // default jump strength
})
```

### Gameplay

| Component | Key Properties / Methods | Purpose |
|-----------|--------------------------|---------|
| `health(hp)` | `.hurt(n)`, `.heal(n)`, `.hp()`, `.onDeath(fn)`, `.onHurt(fn)`, `.onHeal(fn)` | Hit points with callbacks |
| `timer()` | `.wait(sec, fn)`, `.loop(sec, fn)`, `.tween(from, to, dur, fn)` | Delayed/repeating actions, tweens |
| `lifespan(sec)` | — | Auto-destroy after duration |
| `offscreen(opts?)` | `.onExitScreen(fn)`, `.onEnterScreen(fn)` | Detect leaving/entering viewport |
| `stay(scenes?)` | — | Survive scene transitions |
| `state(initial, transitions)` | `.state`, `.enterState(name)`, `.onStateEnter(name, fn)`, `.onStateUpdate(name, fn)`, `.onStateEnd(name, fn)` | Finite state machine |

---

## Sprites and Animation

### Loading a Spritesheet with Animations

```typescript
k.loadSprite('hero', 'sprites/hero-sheet.png', {
  sliceX: 8,     // 8 columns
  sliceY: 2,     // 2 rows = 16 total frames
  anims: {
    idle:  { from: 0, to: 3, loop: true, speed: 5 },
    run:   { from: 4, to: 7, loop: true, speed: 10 },
    jump:  { from: 8, to: 10, speed: 8 },
    fall:  { from: 11, to: 13, speed: 8 },
    die:   { from: 14, to: 15, speed: 4 },
  },
});
```

### Playing Animations

```typescript
const player = k.add([
  k.sprite('hero'),
  k.pos(100, 300),
  k.area(),
  k.body(),
  'player',
]);

// Play an animation
player.play('run');

// Listen for animation end (useful for one-shot anims like 'die')
player.onAnimEnd((anim: string) => {
  if (anim === 'die') {
    k.go('gameover', { score: player.score });
  }
});

// Flip sprite horizontally (for facing left/right)
k.onKeyDown('left', () => {
  player.flipX(true);
  player.play('run');
  player.move(-200, 0);
});

k.onKeyDown('right', () => {
  player.flipX(false);
  player.play('run');
  player.move(200, 0);
});

// Switch to idle when no keys are held
k.onKeyRelease(['left', 'right'], () => {
  player.play('idle');
});
```

---

## Tags: The Identification System

Tags are plain strings in the component array. They are Kaplay's type system — how you identify, query, and target game objects:

```typescript
// Create objects with tags
const goblin = k.add([
  k.sprite('goblin'), k.pos(400, 200), k.area(), k.body(),
  'enemy', 'ground-unit', 'goblin',
]);

const bat = k.add([
  k.sprite('bat'), k.pos(300, 50), k.area(),
  'enemy', 'flying-unit',
]);

const coin = k.add([
  k.sprite('coin'), k.pos(500, 400), k.area(),
  'pickup', 'coin',
]);

// Query by tag
const allEnemies = k.get('enemy');        // [goblin, bat]
const flyers = k.get('flying-unit');      // [bat]

// Check if an object has a tag
if (goblin.is('enemy')) { /* true */ }

// Collision between tagged objects
k.onCollide('player', 'enemy', (player, enemy) => {
  player.hurt(1);
  k.shake(4);  // screen shake
});

k.onCollide('player', 'coin', (player, coin) => {
  coin.destroy();
  player.coins++;
  k.play('coin-sfx');
});

// Destroy all objects with a tag
k.destroyAll('enemy');
```

### Tag Naming Conventions

Use descriptive, hyphenated tags and layer them for flexibility:

```typescript
// Broad category + specific type
k.add([..., 'enemy', 'melee-enemy', 'goblin']);
k.add([..., 'enemy', 'ranged-enemy', 'archer']);
k.add([..., 'pickup', 'health-pickup']);
k.add([..., 'pickup', 'weapon-pickup']);

// Now you can query at any level:
k.get('enemy');         // all enemies
k.get('melee-enemy');   // just melee enemies
k.get('goblin');        // just goblins
```

---

## Parent-Child Hierarchies

Game objects can have children, creating hierarchies where child transforms are relative to the parent:

```typescript
// Create a ship with a turret and health bar as children
const ship = k.add([
  k.sprite('ship'),
  k.pos(400, 300),
  k.rotate(0),
  k.area(),
  'ship',
]);

// Turret is a child — its position is relative to the ship
const turret = ship.add([
  k.sprite('turret'),
  k.pos(0, -20),    // 20px above ship's origin
  k.rotate(0),
  k.anchor('center'),
]);

// Health bar as a child
const hpBar = ship.add([
  k.rect(40, 4),
  k.pos(-20, -30),
  k.color(0, 255, 0),
]);

// When ship moves or rotates, turret and hpBar follow automatically
k.onUpdate(() => {
  // Turret tracks toward mouse
  const mousePos = k.mousePos();
  const worldTurretPos = turret.worldPos();
  turret.angle = worldTurretPos.angle(mousePos);
});
```

### Key Hierarchy Rules

1. Child `pos()` is relative to the parent's position.
2. Parent rotation and scale cascade to children.
3. Destroying a parent destroys all its children.
4. `worldPos()` returns the global position accounting for all parent transforms.
5. Tags on children are independent from parent tags.

---

## Custom Components

You can create reusable components to encapsulate game behavior:

```typescript
// components/patrol.ts — enemy patrol behavior
function patrol(speed: number = 100, distance: number = 200) {
  let startX = 0;
  let direction = 1;

  return {
    id: 'patrol',              // unique identifier (required)
    require: ['pos'],           // dependency declaration

    // Called when the object is added to the scene
    add(this: any) {
      startX = this.pos.x;
    },

    // Called every frame
    update(this: any) {
      this.move(speed * direction, 0);
      if (Math.abs(this.pos.x - startX) > distance) {
        direction *= -1;
        this.flipX(direction < 0);
      }
    },

    // Called when the object is destroyed
    destroy(this: any) {
      // cleanup if needed
    },
  };
}

// Usage — any enemy can now patrol
k.add([
  k.sprite('goblin'), k.pos(300, 400), k.area(), k.body(),
  patrol(80, 150),
  'enemy',
]);

k.add([
  k.sprite('skeleton'), k.pos(600, 400), k.area(), k.body(),
  patrol(60, 200),
  'enemy',
]);
```

### Custom Component Lifecycle Hooks

| Hook | When it runs | Typical use |
|------|--------------|-------------|
| `add()` | When the object is added to the scene | Initialize state, store initial position |
| `update()` | Every frame | Movement, AI logic, animation triggers |
| `draw()` | Every frame, after all updates | Custom rendering (debug shapes, effects) |
| `destroy()` | When the object is destroyed | Cleanup, spawn effects |

### Advanced: Component with Custom Methods

```typescript
// components/shooter.ts — adds a shoot() method to any object
function shooter(bulletSpeed: number = 400, cooldown: number = 0.2) {
  let lastFired = 0;

  return {
    id: 'shooter',
    require: ['pos'],

    // Custom method — becomes part of the game object's interface
    shoot(this: any, direction: { x: number; y: number }) {
      const now = k.time();
      if (now - lastFired < cooldown) return;  // enforce cooldown
      lastFired = now;

      k.add([
        k.rect(8, 4),
        k.pos(this.pos.x, this.pos.y),
        k.move(Math.atan2(direction.y, direction.x) * (180 / Math.PI), bulletSpeed),
        k.color(255, 255, 0),
        k.area(),
        k.lifespan(2),     // auto-destroy after 2 seconds
        k.offscreen({ destroy: true }),
        'bullet',
      ]);
    },
  };
}

// Usage
const player = k.add([
  k.sprite('hero'), k.pos(100, 300), k.area(), k.body(),
  shooter(500, 0.15),
  'player',
]);

k.onKeyPress('x', () => {
  player.shoot({ x: 1, y: 0 });  // shoot right
});
```

---

## The `state()` Component: Built-In State Machine

For objects with distinct behavioral states (idle, chase, attack, stunned), use the `state()` component instead of manual if/else chains:

```typescript
const enemy = k.add([
  k.sprite('goblin'),
  k.pos(400, 300),
  k.area(),
  k.body(),
  k.state('idle', ['idle', 'chase', 'attack', 'stunned']),
  'enemy',
]);

// Define behavior for each state
enemy.onStateEnter('idle', () => {
  enemy.play('idle');
});

enemy.onStateUpdate('idle', () => {
  const player = k.get('player')[0];
  if (player && enemy.pos.dist(player.pos) < 200) {
    enemy.enterState('chase');
  }
});

enemy.onStateEnter('chase', () => {
  enemy.play('run');
});

enemy.onStateUpdate('chase', () => {
  const player = k.get('player')[0];
  if (!player) return;

  const dist = enemy.pos.dist(player.pos);
  if (dist < 40) {
    enemy.enterState('attack');
  } else if (dist > 300) {
    enemy.enterState('idle');
  } else {
    enemy.moveTo(player.pos, 120);
  }
});

enemy.onStateEnter('attack', () => {
  enemy.play('attack');
  // Return to chase after attack animation
  enemy.wait(0.5, () => enemy.enterState('chase'));
});

enemy.onStateEnter('stunned', () => {
  enemy.play('stunned');
  enemy.wait(1.5, () => enemy.enterState('idle'));
});
```

The `state()` component is the second argument accepts an array of valid states that enforces valid transitions at definition time.

---

## The `stay()` Component: Surviving Scene Transitions

By default, `k.go()` destroys all game objects. Use `stay()` to keep an object alive across scene changes:

```typescript
// HUD that persists across all scenes
const hud = k.add([
  k.text('Score: 0', { size: 24 }),
  k.pos(16, 16),
  k.fixed(),        // not affected by camera
  k.z(100),         // render on top
  k.stay(),         // survive scene changes
  'hud',
]);

// Or limit to specific scenes
const gameHud = k.add([
  k.text('HP: 3'),
  k.pos(16, 16),
  k.fixed(),
  k.stay(['game', 'boss']),  // only persists in 'game' and 'boss' scenes
  'game-hud',
]);
```

**Important:** `stay()` only works on objects attached to the root (not children of other objects). Plan your hierarchy accordingly.

---

## Practical Patterns

### Platformer Player

```typescript
function createPlayer(startPos: { x: number; y: number }) {
  return k.add([
    k.sprite('hero'),
    k.pos(startPos.x, startPos.y),
    k.area(),
    k.body(),
    k.anchor('center'),
    k.health(3),
    k.state('idle', ['idle', 'run', 'jump', 'fall']),
    'player',
    { speed: 200, jumpForce: 500 },
  ]);
}
```

### Collectible Coin

```typescript
function spawnCoin(x: number, y: number) {
  return k.add([
    k.sprite('coin'),
    k.pos(x, y),
    k.area(),
    k.anchor('center'),
    'pickup', 'coin',
  ]);
}

k.onCollide('player', 'coin', (player, coin) => {
  coin.destroy();
  player.coins++;
  k.play('coin-sfx');
  // Spawn floating score text
  k.add([
    k.text('+10', { size: 16 }),
    k.pos(coin.pos.x, coin.pos.y),
    k.anchor('center'),
    k.lifespan(0.5, { fade: 0.3 }),
    k.move(270, 60),  // float upward
  ]);
});
```

### Spawner Pattern

```typescript
function enemySpawner(interval: number = 2) {
  return {
    id: 'spawner',
    require: ['pos'],
    add(this: any) {
      this.spawnTimer = k.loop(interval, () => {
        k.add([
          k.sprite('bat'),
          k.pos(this.pos.x, this.pos.y),
          k.area(),
          k.body(),
          k.offscreen({ destroy: true }),
          patrol(k.rand(60, 120), k.rand(100, 300)),
          'enemy', 'flying-unit',
        ]);
      });
    },
    destroy(this: any) {
      this.spawnTimer.cancel();
    },
  };
}

// Place spawners in the level
k.add([k.pos(800, 200), enemySpawner(3)]);
k.add([k.pos(1200, 100), enemySpawner(5)]);
```

---

## Comparison: Game Object Models Across Frameworks

| Concept | Kaplay | Phaser | PixiJS | Excalibur |
|---------|--------|--------|--------|-----------|
| Object creation | `add([components])` | `this.add.sprite(...)` | `new Sprite(...)` | `new Actor({...})` |
| Behavior composition | Component arrays | Inheritance / mixins | Manual | ECS Components + Actor methods |
| Identity system | String tags | None (use groups) | None (use Containers) | String tags + class types |
| State machine | Built-in `state()` | None built-in | None built-in | None built-in |
| Hierarchy | `obj.add([children])` | `container.add(child)` | `container.addChild(child)` | `actor.addChild(child)` |
| Custom behavior | Custom component function | Extend class | Extend class or ticker callback | Extend Actor / add Component |

---

## Key Takeaways

1. **Game objects are component arrays** — compose behavior by combining `sprite()`, `pos()`, `area()`, `body()`, `health()`, and other components. Never use class inheritance.
2. **Tags are your type system** — use descriptive, layered tags (`'enemy'`, `'melee-enemy'`, `'goblin'`) for flexible querying, collision handling, and batch operations.
3. **Custom components are plain objects** — return an object with `id`, optional `require`, and lifecycle hooks (`add`, `update`, `draw`, `destroy`). Methods you add become part of the game object's interface.
4. **Use `state()` for complex behavior** — the built-in state machine component is cleaner than nested if/else chains for AI, player states, or animated objects.
5. **Use `stay()` for persistent UI** — HUD elements and persistent managers should use `stay()` to survive scene transitions.
6. **Parent-child hierarchies cascade transforms** — child positions are relative to the parent. Destroying a parent destroys all children.
7. **Keep components small and focused** — a component should do one thing well. Compose multiple components for complex behavior rather than building monolithic ones.
