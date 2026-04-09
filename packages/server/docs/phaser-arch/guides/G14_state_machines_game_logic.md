# G14 — Finite State Machines & Game Logic Patterns

> **Category:** guide · **Engine:** Phaser · **Related:** [G1 Scene Lifecycle](G1_scene_lifecycle.md) · [G4 Sprites & Animation](G4_sprites_and_animation.md) · [G3 Input Handling](G3_input_handling.md)

---

## Overview

As game logic grows, raw `if/else` chains in `update()` become unreadable and fragile. A **Finite State Machine (FSM)** organizes behavior into discrete states with explicit transitions, making code easier to reason about, extend, and debug.

This guide covers a lightweight, reusable FSM implementation in TypeScript, then shows how to apply it to player characters, enemies/AI, game flow, and animation synchronization in Phaser 3.

---

## The Problem: Conditional Spaghetti

A typical first attempt at player logic:

```typescript
// DON'T — this quickly becomes unmanageable
update(time: number, delta: number): void {
  if (this.isAttacking && !this.isDead && !this.isStunned) {
    // attack logic...
  } else if (this.isJumping && !this.isDead) {
    // jump logic...
  } else if (this.isDead) {
    // death logic...
  } else if (this.cursors.left.isDown && !this.isAttacking) {
    // move logic...
  }
  // Every new ability adds another branch and more boolean flags
}
```

Every new state multiplies the number of flags and conditions. An FSM replaces this with a clean structure where each state encapsulates its own behavior.

---

## A Reusable FSM Class

This generic FSM works with any game object — players, enemies, menus, or game phases:

```typescript
/**
 * A lightweight Finite State Machine.
 * Each state has optional enter, update, and exit hooks.
 * Only one state is active at a time.
 */
interface State {
  name: string;
  onEnter?: () => void;
  onUpdate?: (dt: number) => void;
  onExit?: () => void;
}

class StateMachine {
  private states = new Map<string, State>();
  private current: State | null = null;
  private previousName: string | null = null;

  /** Register a state. The first state added is NOT auto-activated. */
  addState(
    name: string,
    config: {
      onEnter?: () => void;
      onUpdate?: (dt: number) => void;
      onExit?: () => void;
    } = {},
  ): this {
    this.states.set(name, { name, ...config });
    return this; // Chainable
  }

  /** Transition to a new state. No-op if already in that state. */
  setState(name: string): void {
    if (this.current?.name === name) return;

    const next = this.states.get(name);
    if (!next) {
      console.warn(`StateMachine: unknown state "${name}"`);
      return;
    }

    // Exit current state
    this.current?.onExit?.();
    this.previousName = this.current?.name ?? null;

    // Enter new state
    this.current = next;
    this.current.onEnter?.();
  }

  /** Call every frame from update(). Delegates to current state's onUpdate. */
  update(dt: number): void {
    this.current?.onUpdate?.(dt);
  }

  /** Get the name of the currently active state. */
  get currentState(): string | null {
    return this.current?.name ?? null;
  }

  /** Check if a specific state is currently active. */
  isState(name: string): boolean {
    return this.current?.name === name;
  }

  /** Get the name of the previous state (useful for "return to last state"). */
  get previousState(): string | null {
    return this.previousName;
  }
}
```

### Why This Design?

- **No inheritance required.** States are plain config objects, not subclasses. This avoids deep class hierarchies.
- **Single responsibility.** Each state's `onEnter`/`onUpdate`/`onExit` only deals with its own logic.
- **Explicit transitions.** You call `setState()` — no implicit transitions or magic conditions.

---

## Player Character FSM

The most common FSM use case: a platformer player with idle, run, jump, attack, and hurt states.

```typescript
class Player extends Phaser.Physics.Arcade.Sprite {
  private fsm: StateMachine;
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private attackKey!: Phaser.Input.Keyboard.Key;

  constructor(scene: Phaser.Scene, x: number, y: number) {
    super(scene, x, y, 'player');
    scene.add.existing(this);
    scene.physics.add.existing(this);

    this.setCollideWorldBounds(true);
    this.cursors = scene.input.keyboard!.createCursorKeys();
    this.attackKey = scene.input.keyboard!.addKey('Z');

    this.fsm = new StateMachine();

    this.fsm
      .addState('idle', {
        onEnter: () => this.play('player-idle'),
        onUpdate: () => {
          if (!this.body!.blocked.down) {
            this.fsm.setState('fall');
          } else if (this.attackKey.isDown) {
            this.fsm.setState('attack');
          } else if (this.cursors.up.isDown) {
            this.fsm.setState('jump');
          } else if (this.cursors.left.isDown || this.cursors.right.isDown) {
            this.fsm.setState('run');
          }
        },
      })
      .addState('run', {
        onEnter: () => this.play('player-run'),
        onUpdate: () => {
          if (!this.body!.blocked.down) {
            this.fsm.setState('fall');
          } else if (this.attackKey.isDown) {
            this.fsm.setState('attack');
          } else if (this.cursors.up.isDown) {
            this.fsm.setState('jump');
          } else if (!this.cursors.left.isDown && !this.cursors.right.isDown) {
            this.fsm.setState('idle');
          } else {
            // Apply horizontal movement
            const speed = this.cursors.left.isDown ? -200 : 200;
            this.setVelocityX(speed);
            this.setFlipX(speed < 0);
          }
        },
        onExit: () => this.setVelocityX(0),
      })
      .addState('jump', {
        onEnter: () => {
          this.play('player-jump');
          this.setVelocityY(-350);
        },
        onUpdate: () => {
          // Allow air control
          if (this.cursors.left.isDown) this.setVelocityX(-150);
          else if (this.cursors.right.isDown) this.setVelocityX(150);
          else this.setVelocityX(0);

          // Transition to fall when velocity becomes downward
          if (this.body!.velocity.y > 0) {
            this.fsm.setState('fall');
          }
        },
      })
      .addState('fall', {
        onEnter: () => this.play('player-fall'),
        onUpdate: () => {
          // Air control while falling
          if (this.cursors.left.isDown) this.setVelocityX(-150);
          else if (this.cursors.right.isDown) this.setVelocityX(150);
          else this.setVelocityX(0);

          // Land
          if (this.body!.blocked.down) {
            this.fsm.setState('idle');
          }
        },
      })
      .addState('attack', {
        onEnter: () => {
          this.setVelocityX(0);
          this.play('player-attack');
          // Transition out when animation completes
          this.once(Phaser.Animations.Events.ANIMATION_COMPLETE, () => {
            this.fsm.setState('idle');
          });
        },
        // No onUpdate — player is locked in animation
      })
      .addState('hurt', {
        onEnter: () => {
          this.play('player-hurt');
          this.setVelocityX(this.flipX ? 150 : -150); // Knockback
          this.setVelocityY(-100);
          // Recover after brief invulnerability
          this.scene.time.delayedCall(500, () => {
            this.fsm.setState('idle');
          });
        },
      });

    this.fsm.setState('idle');
  }

  /** Call from scene update(). */
  update(time: number, delta: number): void {
    this.fsm.update(delta);
  }

  /** Called by collision handler when player takes damage. */
  takeDamage(): void {
    // Can't be hurt while already hurt (invulnerability)
    if (!this.fsm.isState('hurt')) {
      this.fsm.setState('hurt');
    }
  }
}
```

### Key Principles

1. **Animation changes happen in `onEnter`.** Each state calls `this.play()` exactly once. No animation flickering from repeated calls.
2. **Movement stops in `onExit`.** The `run` state zeroes velocity on exit so other states start from a clean slate.
3. **Locked states use events, not timers.** The `attack` state waits for `ANIMATION_COMPLETE` rather than guessing a duration.
4. **External triggers (`takeDamage`) can force state changes** from outside the FSM's normal update cycle.

---

## Enemy / AI State Machine

FSMs shine for AI — each behavior is a self-contained state with clear activation conditions.

```typescript
class Patroller extends Phaser.Physics.Arcade.Sprite {
  private fsm: StateMachine;
  private player!: Player;
  private patrolSpeed = 80;
  private chaseSpeed = 150;
  private sightRange = 200;
  private attackRange = 40;
  private patrolDirection = 1;

  constructor(scene: Phaser.Scene, x: number, y: number, player: Player) {
    super(scene, x, y, 'enemy');
    scene.add.existing(this);
    scene.physics.add.existing(this);
    this.player = player;

    this.fsm = new StateMachine();

    this.fsm
      .addState('patrol', {
        onEnter: () => this.play('enemy-walk'),
        onUpdate: () => {
          // Walk back and forth
          this.setVelocityX(this.patrolSpeed * this.patrolDirection);
          this.setFlipX(this.patrolDirection < 0);

          // Reverse at edges (check if ground ahead exists)
          if (this.body!.blocked.right) this.patrolDirection = -1;
          if (this.body!.blocked.left) this.patrolDirection = 1;

          // Spot the player
          if (this.distanceToPlayer() < this.sightRange) {
            this.fsm.setState('chase');
          }
        },
      })
      .addState('chase', {
        onEnter: () => this.play('enemy-run'),
        onUpdate: () => {
          const dx = this.player.x - this.x;
          this.setVelocityX(Math.sign(dx) * this.chaseSpeed);
          this.setFlipX(dx < 0);

          if (this.distanceToPlayer() < this.attackRange) {
            this.fsm.setState('attack');
          } else if (this.distanceToPlayer() > this.sightRange * 1.5) {
            // Lost sight — return to patrol
            this.fsm.setState('patrol');
          }
        },
      })
      .addState('attack', {
        onEnter: () => {
          this.setVelocityX(0);
          this.play('enemy-attack');
          this.once(Phaser.Animations.Events.ANIMATION_COMPLETE, () => {
            this.fsm.setState('chase');
          });
        },
      })
      .addState('stunned', {
        onEnter: () => {
          this.setVelocityX(0);
          this.play('enemy-stunned');
          this.scene.time.delayedCall(1000, () => {
            this.fsm.setState('patrol');
          });
        },
      });

    this.fsm.setState('patrol');
  }

  update(time: number, delta: number): void {
    this.fsm.update(delta);
  }

  stun(): void {
    this.fsm.setState('stunned');
  }

  private distanceToPlayer(): number {
    return Phaser.Math.Distance.Between(this.x, this.y, this.player.x, this.player.y);
  }
}
```

---

## Game Phase / Flow FSM

FSMs aren't just for characters. Use them to manage high-level game flow within a single scene:

```typescript
class BattleScene extends Phaser.Scene {
  private phase!: StateMachine;

  create(): void {
    this.phase = new StateMachine();

    this.phase
      .addState('intro', {
        onEnter: () => {
          // Play intro animation, show stage name
          this.showBanner('Round 1', () => {
            this.phase.setState('playerTurn');
          });
        },
      })
      .addState('playerTurn', {
        onEnter: () => {
          this.enablePlayerInput();
          this.ui.showMessage('Your turn — choose an action');
        },
        onExit: () => this.disablePlayerInput(),
      })
      .addState('enemyTurn', {
        onEnter: () => {
          this.ui.showMessage('Enemy is thinking...');
          this.time.delayedCall(800, () => {
            this.executeEnemyAction();
            this.phase.setState('resolve');
          });
        },
      })
      .addState('resolve', {
        onEnter: () => {
          // Check win/lose conditions
          if (this.enemy.hp <= 0) {
            this.phase.setState('victory');
          } else if (this.player.hp <= 0) {
            this.phase.setState('defeat');
          } else {
            this.phase.setState('playerTurn');
          }
        },
      })
      .addState('victory', {
        onEnter: () => {
          this.ui.showMessage('Victory!');
          this.time.delayedCall(2000, () => this.scene.start('RewardScene'));
        },
      })
      .addState('defeat', {
        onEnter: () => {
          this.ui.showMessage('Defeated...');
          this.time.delayedCall(2000, () => this.scene.start('GameOverScene'));
        },
      });

    this.phase.setState('intro');
  }

  /** Called when player selects an attack in the UI */
  onPlayerAttack(): void {
    if (this.phase.isState('playerTurn')) {
      this.executePlayerAttack();
      this.phase.setState('enemyTurn');
    }
  }
}
```

---

## Syncing Animations with States

A common pattern: tie animation playback directly to state transitions so animations never desync.

```typescript
class AnimatedCharacter extends Phaser.Physics.Arcade.Sprite {
  private fsm: StateMachine;

  // Map state names to animation keys
  private readonly animMap: Record<string, string> = {
    idle: 'char-idle',
    run: 'char-run',
    jump: 'char-jump',
    fall: 'char-fall',
  };

  setupStates(): void {
    // Create all states with auto-animation on enter
    for (const [stateName, animKey] of Object.entries(this.animMap)) {
      this.fsm.addState(stateName, {
        onEnter: () => this.play(animKey, true),
        // Add custom onUpdate per state as needed
      });
    }
  }
}
```

---

## Hierarchical State Machines

For complex characters, nest FSMs. A top-level FSM manages broad modes (ground, air, climbing), while sub-FSMs handle fine-grained states within each mode:

```typescript
class AdvancedPlayer extends Phaser.Physics.Arcade.Sprite {
  private modeFsm: StateMachine;   // Top level: ground | air | climbing
  private groundFsm: StateMachine; // Sub-states: idle | run | crouch | slide
  private airFsm: StateMachine;    // Sub-states: jump | fall | wallSlide

  constructor(scene: Phaser.Scene, x: number, y: number) {
    super(scene, x, y, 'player');
    // ... physics setup ...

    this.groundFsm = new StateMachine();
    this.groundFsm
      .addState('idle', { /* ... */ })
      .addState('run', { /* ... */ })
      .addState('crouch', { /* ... */ })
      .addState('slide', { /* ... */ });

    this.airFsm = new StateMachine();
    this.airFsm
      .addState('rising', { /* ... */ })
      .addState('falling', { /* ... */ })
      .addState('wallSlide', { /* ... */ });

    this.modeFsm = new StateMachine();
    this.modeFsm
      .addState('ground', {
        onEnter: () => this.groundFsm.setState('idle'),
        onUpdate: (dt) => this.groundFsm.update(dt),
      })
      .addState('air', {
        onEnter: () => this.airFsm.setState('rising'),
        onUpdate: (dt) => this.airFsm.update(dt),
      });

    this.modeFsm.setState('ground');
  }

  update(time: number, delta: number): void {
    this.modeFsm.update(delta);
  }
}
```

---

## Debugging FSMs

Add a visual debug display during development:

```typescript
class FsmDebugger {
  private text: Phaser.GameObjects.Text;

  constructor(
    scene: Phaser.Scene,
    private machines: Record<string, StateMachine>,
  ) {
    this.text = scene.add.text(10, 10, '', {
      fontSize: '14px',
      color: '#00ff00',
      backgroundColor: '#000000',
      padding: { x: 6, y: 4 },
    }).setScrollFactor(0).setDepth(9999);
  }

  update(): void {
    const lines = Object.entries(this.machines).map(
      ([label, fsm]) => `${label}: ${fsm.currentState}`,
    );
    this.text.setText(lines.join('\n'));
  }
}

// Usage in scene:
// this.debugger = new FsmDebugger(this, { player: playerFsm, enemy: enemyFsm });
// call this.debugger.update() in scene update()
```

---

## When NOT to Use an FSM

FSMs aren't always the right tool:

- **Simple behaviors with 2 states** — a boolean flag is fine for on/off toggles.
- **Concurrent behaviors** — if a character can aim and walk simultaneously, those are separate concerns. Use two FSMs or a component-based approach, not one FSM trying to model every combination.
- **Behavior trees** — for complex AI with priorities, conditions, and composable nodes, a behavior tree may be more appropriate than an FSM. FSMs work best when states are clearly defined and transitions are explicit.

---

## Best Practices

1. **One FSM per concern.** Don't cram movement, combat, and dialogue into a single FSM. Use separate machines.
2. **Transitions happen in `onUpdate` or via external events.** Never transition inside `onEnter` of the same state — that leads to infinite loops.
3. **Keep states small.** If a state's `onUpdate` is longer than ~20 lines, it probably contains sub-states that should be extracted.
4. **Name states descriptively.** `'chasePlayer'` is better than `'state3'`. Your debug display will thank you.
5. **Clean up in `onExit`.** Reset velocity, stop sounds, clear timers. The next state should start from a clean slate.
6. **Use `isState()` for external queries.** Other systems (health bars, sound) can check the FSM state rather than maintaining their own flags.
