# G1 — Scripting System (ESM Scripts)

> **Category:** guide · **Engine:** PlayCanvas · **Related:** [Architecture Overview](../architecture/E1_architecture_overview.md), [Official Docs](https://developer.playcanvas.com/user-manual/scripting/fundamentals/esm-scripts/)

PlayCanvas games are built by attaching **Script components** to entities. Scripts define behavior — movement, combat, AI, camera control, UI logic — and run within the engine's update loop. The modern **ESM Script** system (replacing the legacy `createScript` API) uses standard ES module classes and is the recommended approach for all new projects.

This guide covers the ESM scripting API, lifecycle methods, attributes, entity communication, and common game patterns.

---

## Basic Script Structure

An ESM script is a class that extends `Script` and is attached to entities via the `script` component.

```typescript
import { Script } from 'playcanvas';

export class Rotator extends Script {
  // Required: unique name used in the Editor and when creating via code
  static scriptName = 'rotator';

  // Attributes — exposed in the Editor, configurable per-instance
  /** @attribute */
  speed: number = 90; // degrees per second

  // Called every frame
  update(dt: number): void {
    this.entity.rotateLocal(0, this.speed * dt, 0);
  }
}
```

Save this as a `.mjs` file (or `.ts` with TypeScript support) and attach it to any entity in the Editor or via code.

### Attaching Scripts via Code

```typescript
import * as pc from 'playcanvas';

const entity = new pc.Entity('spinner');
entity.addComponent('render', { type: 'box' });
entity.addComponent('script');
entity.script!.create('rotator', {
  attributes: { speed: 180 }
});
app.root.addChild(entity);
```

---

## Script Lifecycle

PlayCanvas calls lifecycle methods in a specific order. Understanding this order is essential for correct game logic.

```
Scene Load
  │
  ├── initialize()        — called once per script, in order of scene hierarchy
  ├── postInitialize()    — called once, after ALL scripts have initialized
  │
  ▼
Frame Loop (every frame while enabled):
  ├── update(dt)          — main game logic
  └── postUpdate(dt)      — runs after ALL update() calls (cameras, UI sync)
  
Enable/Disable Events:
  ├── on('enable')        — script becomes enabled
  └── on('disable')       — script becomes disabled

Cleanup:
  └── on('destroy')       — entity or script is destroyed
```

### Lifecycle Methods

| Method | When Called | Use Case |
|--------|-----------|----------|
| `initialize()` | Once, when script first runs | Setup: find references, subscribe to events, init state |
| `postInitialize()` | Once, after all `initialize()` calls | Cross-script setup that depends on other scripts being ready |
| `update(dt)` | Every frame | Movement, input, game logic |
| `postUpdate(dt)` | Every frame, after all `update()` | Camera follow, UI sync, anything that depends on final positions |

### Enable/Disable

```typescript
export class EnemyAI extends Script {
  static scriptName = 'enemyAI';

  initialize(): void {
    // Listen for enable/disable
    this.on('enable', () => {
      console.log('AI activated');
    });

    this.on('disable', () => {
      console.log('AI deactivated');
    });
  }

  update(dt: number): void {
    // Only called when this.enabled === true
    this.moveTowardPlayer(dt);
  }
}

// Disable from outside:
entity.script!.enemyAI.enabled = false;
```

---

## Script Attributes

Attributes let you configure script behavior per-instance from the Editor. Use the `@attribute` JSDoc tag.

```typescript
import { Script, Entity, Color, Vec3, Asset, Curve } from 'playcanvas';

export class Weapon extends Script {
  static scriptName = 'weapon';

  /** @attribute */
  damage: number = 25;

  /** @attribute */
  fireRate: number = 0.1; // seconds between shots

  /** @attribute */
  projectileSpeed: number = 50;

  /**
   * @attribute
   * @title Muzzle Flash Color
   */
  flashColor: Color = new Color(1, 0.8, 0.2);

  /**
   * @attribute
   * @type {Entity}
   * @title Muzzle Point
   */
  muzzleEntity: Entity | null = null;

  /**
   * @attribute
   * @type {Asset}
   * @resource texture
   */
  impactTexture: Asset | null = null;
}
```

### Supported Attribute Types

| Type | Declaration | Editor Widget |
|------|------------|---------------|
| `number` | `speed: number = 10` | Number input / slider |
| `string` | `name: string = 'default'` | Text field |
| `boolean` | `active: boolean = true` | Checkbox |
| `Vec2`, `Vec3`, `Vec4` | `offset: Vec3 = new Vec3()` | Vector fields |
| `Color` | `tint: Color = new Color(1,1,1)` | Color picker |
| `Entity` | `@type {Entity}` + `target: Entity \| null = null` | Entity picker |
| `Asset` | `@type {Asset}` + `sound: Asset \| null = null` | Asset picker |
| `Curve` | `falloff: Curve = new Curve()` | Curve editor |
| Enum | `@type {'walk'\|'run'\|'idle'}` | Dropdown |
| JSON | `@type {Object}` | JSON editor |

**Important:** An attribute must either be initialized with a value or have a `@type` JSDoc tag. Attributes without either are silently ignored by the Editor.

---

## Entity Communication Patterns

### 1. Direct Reference (via Attributes)

The simplest pattern — drag-and-drop entity references in the Editor.

```typescript
export class HealthBar extends Script {
  static scriptName = 'healthBar';

  /** @attribute @type {Entity} */
  playerEntity: Entity | null = null;

  update(dt: number): void {
    if (!this.playerEntity) return;
    const health = this.playerEntity.script!.playerStats.currentHealth;
    this.updateBar(health);
  }
}
```

### 2. Application Events (Global Bus)

Use `this.app.fire()` and `this.app.on()` for decoupled communication.

```typescript
// In PlayerHealth script
export class PlayerHealth extends Script {
  static scriptName = 'playerHealth';

  /** @attribute */
  maxHealth: number = 100;
  currentHealth: number = 100;

  takeDamage(amount: number): void {
    this.currentHealth = Math.max(0, this.currentHealth - amount);

    // Fire a global event — any script can listen
    this.app.fire('player:damaged', this.currentHealth, this.maxHealth);

    if (this.currentHealth <= 0) {
      this.app.fire('player:died');
    }
  }
}

// In HUD script (completely separate entity)
export class HUD extends Script {
  static scriptName = 'hud';

  initialize(): void {
    this.app.on('player:damaged', this.onPlayerDamaged, this);
    this.app.on('player:died', this.onPlayerDied, this);

    // Clean up listeners on destroy
    this.on('destroy', () => {
      this.app.off('player:damaged', this.onPlayerDamaged, this);
      this.app.off('player:died', this.onPlayerDied, this);
    });
  }

  onPlayerDamaged(current: number, max: number): void {
    // Update health bar display
  }

  onPlayerDied(): void {
    // Show game over screen
  }
}
```

### 3. Entity Events (Local Bus)

Use `entity.fire()` for events scoped to a specific entity.

```typescript
// DamageReceiver — attached to any damageable entity
export class DamageReceiver extends Script {
  static scriptName = 'damageReceiver';

  /** @attribute */
  health: number = 50;

  initialize(): void {
    // Listen on this entity only
    this.entity.on('damage', this.onDamage, this);
  }

  onDamage(amount: number, source: Entity): void {
    this.health -= amount;
    if (this.health <= 0) {
      this.entity.fire('destroyed', source);
      this.entity.destroy();
    }
  }
}

// In a projectile script
export class Projectile extends Script {
  static scriptName = 'projectile';

  onCollision(result: any): void {
    const hitEntity = result.other;
    // Fire event on the hit entity — only its own scripts receive it
    hitEntity.fire('damage', 25, this.entity);
  }
}
```

### 4. Finding Entities by Name or Tag

```typescript
initialize(): void {
  // Find by name (returns first match)
  this.player = this.app.root.findByName('Player');

  // Find by tag (returns array)
  this.enemies = this.app.root.findByTag('enemy');

  // Find script on a specific entity
  const ai = this.entity.findByName('Guard')?.script?.guardAI;
}
```

---

## Input Handling Pattern

```typescript
import { Script, KEY_W, KEY_A, KEY_S, KEY_D, KEY_SPACE, MOUSEBUTTON_LEFT } from 'playcanvas';

export class PlayerController extends Script {
  static scriptName = 'playerController';

  /** @attribute */
  moveSpeed: number = 5;

  /** @attribute */
  jumpForce: number = 8;

  private isGrounded: boolean = false;

  initialize(): void {
    // Lock mouse for FPS controls
    this.app.mouse.on('mousedown', () => {
      this.app.mouse.enablePointerLock();
    });

    // Mouse look
    this.app.mouse.on('mousemove', (event) => {
      if (!pc.Mouse.isPointerLocked()) return;
      this.entity.rotateLocal(0, -event.dx * 0.1, 0);
    });
  }

  update(dt: number): void {
    const forward = this.entity.forward;
    const right = this.entity.right;
    let moveX = 0, moveZ = 0;

    if (this.app.keyboard.isPressed(KEY_W)) { moveZ -= 1; }
    if (this.app.keyboard.isPressed(KEY_S)) { moveZ += 1; }
    if (this.app.keyboard.isPressed(KEY_A)) { moveX -= 1; }
    if (this.app.keyboard.isPressed(KEY_D)) { moveX += 1; }

    // Combine forward/right vectors
    const move = new pc.Vec3();
    move.add2(
      forward.clone().mulScalar(moveZ),
      right.clone().mulScalar(moveX)
    );

    if (move.length() > 0) {
      move.normalize().mulScalar(this.moveSpeed * dt);
      this.entity.translate(move);
    }

    // Jump
    if (this.app.keyboard.wasPressed(KEY_SPACE) && this.isGrounded) {
      this.entity.rigidbody?.applyImpulse(0, this.jumpForce, 0);
      this.isGrounded = false;
    }
  }
}
```

---

## Physics Integration in Scripts

```typescript
import { Script, Vec3, EVENT_CONTACT, EVENT_TRIGGERENTER, EVENT_TRIGGERLEAVE } from 'playcanvas';

export class PhysicsObject extends Script {
  static scriptName = 'physicsObject';

  initialize(): void {
    // Collision contact — physical collision with another rigidbody
    if (this.entity.collision) {
      this.entity.collision.on('contact', (result) => {
        const otherEntity = result.other;
        const contactNormal = result.contacts[0].normal;
        const impulse = result.contacts[0].impulse;

        // Detect ground contact for jump logic
        if (contactNormal.y > 0.7) {
          this.isGrounded = true;
        }

        // Damage on hard impact
        if (impulse > 10) {
          this.entity.fire('damage', impulse * 0.5, otherEntity);
        }
      });

      // Trigger enter — non-physical overlap (collision shape marked as trigger)
      this.entity.collision.on('triggerenter', (other) => {
        console.log(`${this.entity.name} entered trigger: ${other.name}`);
      });

      this.entity.collision.on('triggerleave', (other) => {
        console.log(`${this.entity.name} left trigger: ${other.name}`);
      });
    }
  }
}
```

---

## State Machine Pattern

A common pattern for managing entity states (idle, walk, attack, die):

```typescript
import { Script } from 'playcanvas';

type CharacterState = 'idle' | 'walk' | 'attack' | 'die';

export class CharacterFSM extends Script {
  static scriptName = 'characterFSM';

  private state: CharacterState = 'idle';
  private stateTime: number = 0;

  update(dt: number): void {
    this.stateTime += dt;

    switch (this.state) {
      case 'idle':
        this.updateIdle(dt);
        break;
      case 'walk':
        this.updateWalk(dt);
        break;
      case 'attack':
        this.updateAttack(dt);
        break;
      case 'die':
        this.updateDie(dt);
        break;
    }
  }

  private transition(newState: CharacterState): void {
    this.exitState(this.state);
    this.state = newState;
    this.stateTime = 0;
    this.enterState(newState);
  }

  private enterState(state: CharacterState): void {
    switch (state) {
      case 'attack':
        this.entity.anim?.setTrigger('attack');
        break;
      case 'die':
        this.entity.rigidbody!.enabled = false;
        this.entity.anim?.setTrigger('die');
        break;
    }
    this.entity.fire('state:changed', state);
  }

  private exitState(state: CharacterState): void {
    // Cleanup for the state being exited
  }

  private updateIdle(dt: number): void {
    if (this.detectEnemy()) {
      this.transition('walk');
    }
  }

  private updateWalk(dt: number): void {
    // Move toward target...
    if (this.isInAttackRange()) {
      this.transition('attack');
    }
  }

  private updateAttack(dt: number): void {
    if (this.stateTime > 0.5) { // attack animation duration
      this.transition('idle');
    }
  }

  private updateDie(dt: number): void {
    if (this.stateTime > 2) {
      this.entity.destroy();
    }
  }

  // Public API for external damage
  public receiveDamage(amount: number): void {
    if (this.state === 'die') return;
    // reduce health...
    if (this.health <= 0) {
      this.transition('die');
    }
  }

  private detectEnemy(): boolean { return false; /* raycast or distance check */ }
  private isInAttackRange(): boolean { return false; /* distance check */ }
  private health: number = 100;
}
```

---

## Hot Reloading (Editor Development)

When developing in the PlayCanvas Editor, scripts can hot-reload without restarting the game. The `swap` method transfers state from the old instance to the new one:

```typescript
export class GameManager extends Script {
  static scriptName = 'gameManager';

  private score: number = 0;
  private level: number = 1;

  // Called when a script is hot-swapped in the Editor
  swap(old: GameManager): void {
    // Transfer state from old instance to new instance
    this.score = old.score;
    this.level = old.level;
  }
}
```

**Note:** `swap` is only relevant during development in the Editor. It is not called in production builds.

---

## Performance Considerations

| Concern | Guideline |
|---------|-----------|
| **update() cost** | Every enabled script's `update()` runs every frame. Disable scripts on off-screen entities. |
| **Entity lookups** | Cache results of `findByName()` and `findByTag()` in `initialize()` — never in `update()`. |
| **Event listeners** | Always clean up `app.on()` listeners in the `destroy` event. Leaked listeners accumulate. |
| **Allocations in update** | Avoid `new Vec3()` or `new Quat()` in `update()`. Reuse pre-allocated objects. |
| **Script count** | Prefer fewer, slightly larger scripts over many micro-scripts. Each script has lifecycle overhead. |
| **postUpdate** | Only use `postUpdate()` when you specifically need to run after all `update()` calls (cameras, UI). Most scripts only need `update()`. |
| **Tags vs names** | Use `findByTag()` for group operations (all enemies). Use `findByName()` for unique entities (the player). |
