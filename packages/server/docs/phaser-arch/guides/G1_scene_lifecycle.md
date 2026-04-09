# G1 — Phaser 3 Scene Lifecycle & Management

> **Category:** guide · **Engine:** Phaser · **Related:** [E1 Architecture Overview](../architecture/E1_architecture_overview.md) · [G2 Physics Systems](G2_physics_systems.md)

---

## Overview

Scenes are the organizational backbone of every Phaser game. A Scene is a self-contained unit with its own lifecycle, physics world, cameras, and game objects. Understanding how scenes boot, run, communicate, and clean up is essential for building games that don't leak memory or behave unpredictably during transitions.

This guide covers the full scene lifecycle, multi-scene patterns, data passing, and cleanup best practices.

---

## Lifecycle Methods in Order

Every scene class extends `Phaser.Scene` and can implement these methods, called in this exact order:

```
constructor() → init(data) → preload() → create() → update(time, delta) ↺
```

### 1. constructor()

Called once when the scene is registered. Set the scene key here. Do not set up game objects — nothing is ready yet.

```typescript
export class GameScene extends Phaser.Scene {
  private score: number = 0;

  constructor() {
    super({ key: 'GameScene' });
    // Only set the key and declare class properties.
    // Do NOT create game objects, load assets, or access `this.add` here.
  }
}
```

### 2. init(data)

Called every time the scene starts (including restarts). Receives data passed from `scene.start()` or `scene.launch()`. Use it to reset state and receive parameters.

```typescript
init(data: { level: number; score: number }): void {
  // Reset per-run state
  this.score = data.score ?? 0;
  this.currentLevel = data.level ?? 1;

  // Good place to reset data values
  this.data.set('lives', 3);
}
```

**Key behavior:** `init` runs before `preload`. If the scene has already been loaded once, `preload` is skipped and `create` is called immediately. This means `init` is your reliable entry point for per-start setup.

### 3. preload()

Queue assets for loading. Phaser's Loader only works correctly during this phase. The scene will not proceed to `create` until all queued assets finish loading.

```typescript
preload(): void {
  // Queue assets — order doesn't matter, they load in parallel
  this.load.spritesheet('player', 'assets/player.png', {
    frameWidth: 32,
    frameHeight: 48,
  });
  this.load.tilemapTiledJSON('level1', 'assets/level1.json');
  this.load.image('tiles', 'assets/tileset.png');
  this.load.audio('bgm', ['assets/bgm.ogg', 'assets/bgm.mp3']);
  this.load.atlas('ui', 'assets/ui.png', 'assets/ui.json');
}
```

**Important:** The texture cache is global. Assets loaded in any scene persist and are available to all other scenes. You only need to load an asset once.

### 4. create()

All queued assets are now available. Set up game objects, physics, input bindings, animations, and cameras here.

```typescript
create(): void {
  // Tilemap
  const map = this.make.tilemap({ key: 'level1' });
  const tileset = map.addTilesetImage('tileset-name', 'tiles');
  const ground = map.createLayer('Ground', tileset!);
  ground?.setCollisionByProperty({ collides: true });

  // Player
  this.player = this.physics.add.sprite(100, 200, 'player');
  this.player.setCollideWorldBounds(true);

  // Animations (defined once, available globally)
  if (!this.anims.exists('walk')) {
    this.anims.create({
      key: 'walk',
      frames: this.anims.generateFrameNumbers('player', { start: 0, end: 7 }),
      frameRate: 10,
      repeat: -1,
    });
  }

  // Input
  this.cursors = this.input.keyboard!.createCursorKeys();

  // Physics collision
  if (ground) {
    this.physics.add.collider(this.player, ground);
  }

  // Launch HUD as a parallel scene
  this.scene.launch('HUDScene', { score: this.score });
}
```

### 5. update(time, delta)

Called every frame (~60fps) while the scene is active. Put movement, input polling, and game logic here. Keep it lean — expensive operations belong in events or timers.

```typescript
update(time: number, delta: number): void {
  // delta = milliseconds since last frame (16.67ms at 60fps)
  // time = milliseconds since game started

  const speed = 200;

  if (this.cursors.left.isDown) {
    this.player.setVelocityX(-speed);
    this.player.anims.play('walk', true);
    this.player.setFlipX(true);
  } else if (this.cursors.right.isDown) {
    this.player.setVelocityX(speed);
    this.player.anims.play('walk', true);
    this.player.setFlipX(false);
  } else {
    this.player.setVelocityX(0);
    this.player.anims.play('idle', true);
  }

  if (this.cursors.up.isDown && this.player.body?.touching.down) {
    this.player.setVelocityY(-400);
  }
}
```

---

## Scene States

A scene can be in one of several states. Understanding these prevents bugs around "why isn't my scene updating?" or "why is my scene rendering but not responding to input?"

| State | update() runs | Renders | How to enter | How to exit |
|-------|:---:|:---:|---|---|
| **Running** | Yes | Yes | `scene.start()`, `scene.launch()`, `scene.resume()`, `scene.wake()` | `scene.pause()`, `scene.sleep()`, `scene.stop()` |
| **Paused** | No | Yes | `scene.pause()` | `scene.resume()` |
| **Sleeping** | No | No | `scene.sleep()` | `scene.wake()` |
| **Stopped** | No | No | `scene.stop()` | `scene.start()` (re-runs init/create) |

### When to Use Each

- **Pause** a scene when you want it visible but frozen (e.g., showing a pause overlay on top of the game).
- **Sleep** a scene when you want to completely hide it but keep its state intact (e.g., switching between game tabs).
- **Stop** a scene when you're done with it and want to free its game objects. Re-starting a stopped scene re-runs `init` → `create`.

---

## Scene Transitions

### start vs. launch vs. switch

```typescript
// START — stops the current scene, starts the target scene
// Use for: menu → game, game over → menu, level → next level
this.scene.start('GameScene', { level: 2 });

// LAUNCH — keeps current scene running, starts target in parallel
// Use for: game + HUD, game + pause overlay, game + dialog box
this.scene.launch('HUDScene', { score: this.score });

// SWITCH — sleeps current scene, wakes/starts target
// Use for: tab-like navigation where you want to return to the exact state
this.scene.switch('InventoryScene');
```

### Scene Order (Depth)

Scenes render in the order they were started. Later scenes render on top:

```typescript
// Ensure HUD renders above game
this.scene.launch('HUDScene');
this.scene.bringToTop('HUDScene');

// Or control order explicitly
this.scene.moveAbove('GameScene', 'HUDScene');
```

---

## Cross-Scene Communication

Scenes should communicate via events, not direct property access. This keeps scenes decoupled and testable.

### Pattern 1: Scene Events (Recommended)

```typescript
// GameScene — emit when score changes
this.events.emit('score-changed', this.score);
this.events.emit('player-died', { lives: this.lives });

// HUDScene — listen to GameScene's events
create(): void {
  const gameScene = this.scene.get('GameScene');

  gameScene.events.on('score-changed', (score: number) => {
    this.scoreText.setText(`Score: ${score}`);
  });

  gameScene.events.on('player-died', (data: { lives: number }) => {
    this.updateLives(data.lives);
  });
}
```

### Pattern 2: Event Bus (For Complex Games)

```typescript
// Shared event emitter — create once, import everywhere
// src/events/EventBus.ts
import Phaser from 'phaser';
export const EventBus = new Phaser.Events.EventEmitter();

// GameScene
import { EventBus } from '../events/EventBus';
EventBus.emit('enemy-killed', { type: 'goblin', points: 100 });

// HUDScene
import { EventBus } from '../events/EventBus';
EventBus.on('enemy-killed', (data) => {
  this.addScore(data.points);
});
```

### Pattern 3: Scene Data Manager

```typescript
// Write data in GameScene
this.data.set('playerHealth', 100);

// Read in another scene
const health = this.scene.get('GameScene').data.get('playerHealth');
```

---

## Cleanup and Memory Management

Phaser cleans up game objects when a scene stops, but you must handle custom resources yourself.

### The shutdown Event

```typescript
create(): void {
  // ... set up game objects ...

  // Clean up when this scene stops
  this.events.on('shutdown', this.cleanup, this);
}

private cleanup(): void {
  // Remove event listeners to prevent leaks
  EventBus.off('enemy-killed', this.onEnemyKilled, this);

  // Cancel timers
  this.time.removeAllEvents();

  // Destroy objects not added to the scene (won't auto-cleanup)
  this.customParticles?.destroy();
}
```

### The destroy Event

Called when a scene is removed from the Scene Manager entirely (not just stopped). Use this for one-time cleanup:

```typescript
this.events.on('destroy', () => {
  // Scene is being permanently removed
  this.input.keyboard?.removeAllKeys();
});
```

### Common Memory Leak Sources

1. **Event listeners not removed** — if Scene A listens to Scene B's events, remove those listeners in `shutdown`. Otherwise they accumulate on each restart.
2. **Timers and tweens** — `this.time.addEvent()` and `this.tweens.add()` are automatically cleaned on shutdown, but callbacks may hold references. Use `this.events.on('shutdown', ...)` to be safe.
3. **Audio not stopped** — background music started in a scene continues after the scene stops unless explicitly stopped.
4. **External references** — if you store references to scene objects outside the scene (e.g., in a global manager), null them out on shutdown.

---

## Common Scene Architectures

### Linear Flow (Most Games)

```
BootScene → PreloadScene → MenuScene → GameScene → GameOverScene
                                           ↓
                                       HUDScene (parallel)
```

```typescript
// BootScene — loads only the loading bar assets (tiny, instant)
class BootScene extends Phaser.Scene {
  constructor() { super({ key: 'BootScene' }); }
  preload() {
    this.load.image('loading-bar', 'assets/loading-bar.png');
  }
  create() {
    this.scene.start('PreloadScene');
  }
}

// PreloadScene — loads all game assets with a progress bar
class PreloadScene extends Phaser.Scene {
  constructor() { super({ key: 'PreloadScene' }); }
  preload() {
    // Show progress
    const bar = this.add.graphics();
    this.load.on('progress', (value: number) => {
      bar.clear().fillStyle(0xffffff).fillRect(100, 290, 600 * value, 20);
    });

    // Load everything
    this.load.atlas('characters', 'assets/characters.png', 'assets/characters.json');
    this.load.tilemapTiledJSON('world', 'assets/world.json');
    this.load.audio('bgm', ['assets/bgm.ogg', 'assets/bgm.mp3']);
  }
  create() {
    this.scene.start('MenuScene');
  }
}
```

### Multi-Level with Data Passing

```typescript
// GameScene — pass level data to the next level
private completeLevel(): void {
  this.scene.start('GameScene', {
    level: this.currentLevel + 1,
    score: this.score,
    lives: this.lives,
  });
}

// GameScene.init — receives the data
init(data: { level: number; score: number; lives: number }): void {
  this.currentLevel = data.level ?? 1;
  this.score = data.score ?? 0;
  this.lives = data.lives ?? 3;
}
```

### Persistent HUD with Parallel Scenes

```typescript
// GameScene.create — launch HUD alongside
create(): void {
  this.scene.launch('HUDScene');

  // When game restarts, stop and re-launch HUD
  this.events.on('shutdown', () => {
    this.scene.stop('HUDScene');
  });
}

// HUDScene — separate camera, separate update loop
class HUDScene extends Phaser.Scene {
  constructor() { super({ key: 'HUDScene' }); }

  create(): void {
    this.scoreText = this.add.text(16, 16, 'Score: 0', {
      fontSize: '24px',
      color: '#ffffff',
    });

    // Listen to game events
    this.scene.get('GameScene').events.on('score-changed', (score: number) => {
      this.scoreText.setText(`Score: ${score}`);
    });
  }
}
```

---

## Comparison: Phaser Scenes vs. Other Frameworks

| Concept | Phaser | PixiJS | Kaplay | Excalibur |
|---------|--------|--------|--------|-----------|
| Scene class | `Phaser.Scene` | None (use Containers) | `scene()` function | `ex.Scene` class |
| Lifecycle | init → preload → create → update | Manual (ticker) | onLoad → draw (add) | onInitialize → onActivate → onPreUpdate/onPostUpdate |
| Parallel scenes | Yes (launch) | Manual (Container visibility) | No | No |
| Scene communication | Events / Data Manager | Manual | Manual | Manual |
| Asset loading | Scene-scoped `preload()` | Global `Assets.load()` | `loadSprite()` etc. | `ex.Loader` |

---

## Key Takeaways

1. **`init()` is your reliable reset point** — it runs every time a scene starts, even on restart. Use it to reset state and receive data.
2. **`preload()` only runs on first load** — if assets are already cached, Phaser skips straight to `create()`.
3. **Use `launch` for parallel scenes, `start` for sequential** — confusing these is the #1 scene management bug.
4. **Always clean up event listeners in `shutdown`** — this prevents the most common memory leak in Phaser games.
5. **Use events for cross-scene communication** — never store mutable global state or directly reference other scenes' properties.
6. **Keep `update()` lean** — expensive operations should run on timers or events, not every frame.
