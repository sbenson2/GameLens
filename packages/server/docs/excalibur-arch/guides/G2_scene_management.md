# G2 — Excalibur.js Scene Management & Transitions

> **Category:** guide · **Engine:** Excalibur · **Related:** [E1 Architecture Overview](../architecture/E1_architecture_overview.md) · [G1 Actors & Entities](G1_actors_and_entities.md)

---

## Overview

Scenes in Excalibur organize your game into distinct states — a title screen, gameplay level, inventory, pause menu, game over screen, and so on. Each Scene has its own actors, camera, systems, and lifecycle hooks. The Engine manages which scene is active and provides built-in transition effects for smooth navigation between them.

This guide covers scene creation, the scene lifecycle, navigating between scenes, passing data, built-in and custom transitions, and practical multi-scene architectures.

---

## Creating Scenes

A Scene is a class you extend. Register it with the Engine by name, then navigate to it at runtime.

```typescript
import { Engine, Scene, Actor, vec, Color, CollisionType } from 'excalibur';

// Define a scene
export class GameScene extends Scene {
  onInitialize(engine: Engine): void {
    // Called once — set up actors, systems, initial state
    const player = new Player(vec(100, 300));
    this.add(player);

    const ground = new Actor({
      pos: vec(400, 580),
      width: 800,
      height: 40,
      color: Color.Green,
      collisionType: CollisionType.Fixed,
    });
    this.add(ground);
  }

  onActivate(): void {
    // Called every time the engine switches TO this scene
  }

  onDeactivate(): void {
    // Called every time the engine switches AWAY from this scene
  }
}

// Register scenes with the engine
const game = new Engine({
  width: 800,
  height: 600,
  scenes: {
    menu: MenuScene,
    game: GameScene,
    gameOver: GameOverScene,
  },
});

await game.start();
game.goToScene('menu');
```

### Class-Based vs Instance Registration

You can register scene classes (instantiated lazily) or scene instances (instantiated immediately):

```typescript
// Class registration — scene is created when first navigated to
const game = new Engine({
  scenes: {
    menu: MenuScene,        // class reference
    game: GameScene,
  },
});

// Instance registration — scene exists immediately
const game = new Engine({
  scenes: {
    menu: new MenuScene(),   // instance
    game: new GameScene(),
  },
});
```

**Recommendation:** Use class registration for most scenes. It defers initialization work until the scene is actually needed, which speeds up startup.

---

## Scene Lifecycle

Every scene follows a predictable lifecycle:

```
onInitialize(engine)        ← once, first time the scene is activated
    ↓
onActivate(context)         ← each time engine navigates TO this scene
    ↓
onPreUpdate(engine, delta)  ← every frame while active
    ↓
[actor updates, physics]
    ↓
onPostUpdate(engine, delta) ← every frame while active
    ↓
onDeactivate(context)       ← when engine navigates AWAY from this scene
```

### onInitialize(engine)

Called **once** — the first time the scene becomes active. This is where you create and add actors, register systems, and set up anything that should persist for the scene's entire lifetime.

```typescript
export class GameScene extends Scene {
  private player!: Player;
  private scoreDisplay!: ScoreDisplay;

  onInitialize(engine: Engine): void {
    // Create persistent entities
    this.player = new Player(vec(100, 300));
    this.add(this.player);

    // Set up the camera to follow the player
    this.camera.strategy.lockToActor(this.player);
    this.camera.zoom = 1.5;

    // Add HUD
    this.scoreDisplay = new ScoreDisplay();
    this.add(this.scoreDisplay);

    // Set up tilemap, enemies, etc.
    this.setupLevel();
  }
}
```

**Key behavior:** `onInitialize` does NOT run again if you navigate away and come back. The scene's state persists. Use `onActivate` for per-visit setup.

### onActivate(context) and onDeactivate(context)

Called every time the engine enters or leaves the scene. The `context` parameter provides the previous/next scene and any data passed via `goToScene`.

```typescript
export class GameScene extends Scene {
  onActivate(context: SceneActivationContext<{ level: number }>): void {
    // context.previousScene — the scene we came from
    // context.data — optional data passed from goToScene

    const level = context.data?.level ?? 1;
    this.loadLevel(level);

    // Reset player position for the new level
    this.player.pos = vec(100, 300);
    this.player.vel = vec(0, 0);
  }

  onDeactivate(context: SceneActivationContext): void {
    // Clean up per-visit state
    // context.nextScene — the scene we're going to

    // Stop background music
    this.bgm?.stop();

    // Remove temporary actors (enemies, projectiles)
    this.clearEnemies();
  }
}
```

### onPreUpdate / onPostUpdate

Frame-level hooks for scene-wide logic. Most per-frame logic should live in individual Actors, but scene-level concerns (win conditions, level timers, spawning) go here.

```typescript
export class GameScene extends Scene {
  private spawnTimer = 0;
  private spawnInterval = 3000;  // ms

  onPreUpdate(engine: Engine, delta: number): void {
    // Check win condition
    if (this.enemies.length === 0 && this.waveComplete) {
      engine.goToScene('victory', { data: { score: this.score } });
      return;
    }

    // Timed enemy spawning
    this.spawnTimer += delta;
    if (this.spawnTimer >= this.spawnInterval) {
      this.spawnTimer = 0;
      this.spawnEnemy();
    }
  }
}
```

---

## Navigating Between Scenes

### engine.goToScene(name, options?)

The primary way to switch scenes:

```typescript
// Simple navigation
engine.goToScene('menu');

// With data
engine.goToScene('game', {
  data: { level: 3, difficulty: 'hard' },
});

// With transition effects (see Transitions section below)
engine.goToScene('game', {
  data: { level: 1 },
  destinationIn: new FadeInOut({ duration: 500, direction: 'in' }),
  sourceOut: new FadeInOut({ duration: 500, direction: 'out' }),
});
```

### Receiving Data in the Target Scene

```typescript
interface LevelData {
  level: number;
  difficulty: 'easy' | 'normal' | 'hard';
  score?: number;
}

export class GameScene extends Scene {
  onActivate(context: SceneActivationContext<LevelData>): void {
    const { level, difficulty, score } = context.data ?? {
      level: 1,
      difficulty: 'normal',
    };

    this.currentLevel = level;
    this.difficulty = difficulty;
    this.score = score ?? 0;

    this.loadLevel(level);
  }
}
```

### Navigation from Within Actors

Actors can trigger scene changes via their engine reference:

```typescript
export class Player extends Actor {
  onPreUpdate(engine: Engine, delta: number): void {
    // Player fell off the map
    if (this.pos.y > 1000) {
      engine.goToScene('gameOver', {
        data: { score: this.scene?.score ?? 0 },
      });
    }
  }
}

export class DoorTrigger extends Actor {
  private targetScene: string;
  private targetData: any;

  constructor(pos: ex.Vector, targetScene: string, targetData?: any) {
    super({
      pos,
      width: 32,
      height: 64,
      collisionType: CollisionType.Passive,
    });
    this.targetScene = targetScene;
    this.targetData = targetData;
  }

  onInitialize(engine: Engine): void {
    this.on('collisionstart', (evt) => {
      if (evt.other.hasTag('player')) {
        engine.goToScene(this.targetScene, {
          data: this.targetData,
        });
      }
    });
  }
}
```

---

## Scene Transitions

Excalibur provides built-in transition effects for smooth visual navigation between scenes. Transitions are specified per-navigation or as defaults on the scene registration.

### Built-in Transition: FadeInOut

```typescript
import { FadeInOut, Color } from 'excalibur';

// Fade out the current scene, then fade in the next
engine.goToScene('game', {
  sourceOut: new FadeInOut({
    duration: 500,
    direction: 'out',
    color: Color.Black,
  }),
  destinationIn: new FadeInOut({
    duration: 500,
    direction: 'in',
    color: Color.Black,
  }),
});
```

**How it works:**
- `direction: 'out'` — starts transparent, fades to the specified color (the scene disappears).
- `direction: 'in'` — starts at the specified color, fades to transparent (the scene appears).
- The `sourceOut` transition plays on the *current* scene before deactivation.
- The `destinationIn` transition plays on the *target* scene after activation.

### Built-in Transition: CrossFade

```typescript
import { CrossFade } from 'excalibur';

// Cross-dissolve from current scene to next
engine.goToScene('game', {
  destinationIn: new CrossFade({
    duration: 1000,
  }),
});
```

**Important:** `CrossFade` can only be used as a `destinationIn` transition, because it screenshots the previous scene and blends it into the new one. It cannot be used as `sourceOut`.

### Default Transitions on Scene Registration

Instead of specifying transitions on every `goToScene` call, set defaults when registering scenes:

```typescript
const game = new Engine({
  scenes: {
    menu: {
      scene: MenuScene,
      transitions: {
        in: new FadeInOut({ duration: 400, direction: 'in' }),
        out: new FadeInOut({ duration: 400, direction: 'out' }),
      },
    },
    game: {
      scene: GameScene,
      transitions: {
        in: new CrossFade({ duration: 600 }),
        out: new FadeInOut({ duration: 300, direction: 'out', color: Color.Black }),
      },
    },
    gameOver: {
      scene: GameOverScene,
      transitions: {
        in: new FadeInOut({ duration: 800, direction: 'in', color: Color.Red }),
      },
    },
  },
});

// Now every goToScene uses the registered defaults
engine.goToScene('game');  // uses game's default transitions
```

**Precedence:** Transitions passed directly to `goToScene()` override the registered defaults.

### Transition Options

All transitions support these options:

```typescript
new FadeInOut({
  duration: 500,           // milliseconds
  direction: 'in',         // 'in' or 'out'
  color: Color.Black,      // fade color (FadeInOut only)
  easing: EasingFunctions.EaseInOutCubic,  // easing function
  blockInput: true,        // block user input during transition (default: true)
  hideLoader: true,        // hide any active loader during transition
});
```

### Custom Transitions

Create your own transition by extending the `Transition` class:

```typescript
import { Transition, Engine, Color, Graphics } from 'excalibur';

export class SlideTransition extends Transition {
  private progress = 0;

  constructor(private slideDirection: 'left' | 'right' = 'left') {
    super({ duration: 600 });
  }

  onInitialize(engine: Engine): void {
    // Set up any resources needed for the transition
  }

  onUpdate(progress: number): void {
    // progress goes from 0 to 1 over the duration
    this.progress = progress;
  }

  onDraw(ctx: Graphics.ExcaliburGraphicsContext): void {
    const width = this.engine.screen.resolution.width;
    const height = this.engine.screen.resolution.height;

    // Draw a sliding rectangle that covers the screen
    const x = this.slideDirection === 'left'
      ? -width + (width * this.progress)
      : width - (width * this.progress);

    ctx.drawRectangle(
      vec(x, 0),
      width,
      height,
      Color.Black
    );
  }
}
```

---

## Camera Per Scene

Each Scene has its own `Camera`. Configure it in `onInitialize` or `onActivate`:

```typescript
export class GameScene extends Scene {
  onInitialize(engine: Engine): void {
    // Follow the player
    this.camera.strategy.lockToActor(this.player);

    // Or: lock to player with elastic follow
    this.camera.strategy.elasticToActor(this.player, 0.1, 0.1);

    // Zoom
    this.camera.zoom = 2;  // 2x zoom

    // Camera bounds (prevent showing outside the map)
    this.camera.strategy.limitCameraBounds(
      new BoundingBox(0, 0, mapWidth, mapHeight)
    );
  }
}

export class MenuScene extends Scene {
  onInitialize(engine: Engine): void {
    // Menu uses a fixed camera — no following, no zoom
    this.camera.pos = vec(
      engine.halfDrawWidth,
      engine.halfDrawHeight
    );
  }
}
```

---

## Common Scene Architectures

### Linear Flow

```
BootScene → MenuScene → GameScene → GameOverScene
                ↑                        |
                └────────────────────────┘
```

```typescript
const game = new Engine({
  scenes: {
    boot: BootScene,
    menu: MenuScene,
    game: GameScene,
    gameOver: GameOverScene,
  },
});

// BootScene loads assets, then navigates to menu
export class BootScene extends Scene {
  onInitialize(engine: Engine): void {
    const loader = new Loader([
      Resources.heroImage,
      Resources.tilesetImage,
      Resources.bgm,
    ]);

    engine.start(loader).then(() => {
      engine.goToScene('menu');
    });
  }
}

// MenuScene
export class MenuScene extends Scene {
  onInitialize(engine: Engine): void {
    const startButton = new StartButton(
      vec(engine.halfDrawWidth, 300)
    );
    startButton.on('pointerup', () => {
      engine.goToScene('game', {
        data: { level: 1 },
        destinationIn: new FadeInOut({ duration: 500, direction: 'in' }),
      });
    });
    this.add(startButton);
  }
}

// GameOverScene receives final score
export class GameOverScene extends Scene {
  private finalScore = 0;

  onActivate(context: SceneActivationContext<{ score: number }>): void {
    this.finalScore = context.data?.score ?? 0;
    this.scoreLabel.text = `Final Score: ${this.finalScore}`;
  }
}
```

### Multi-Level with Shared Scene

Instead of creating separate scene classes per level, reuse one GameScene with different data:

```typescript
export class GameScene extends Scene {
  private currentLevel = 1;

  onActivate(context: SceneActivationContext<{ level: number; score: number }>): void {
    this.currentLevel = context.data?.level ?? 1;
    this.score = context.data?.score ?? 0;

    // Clear previous level's actors (enemies, items)
    this.clearLevelActors();

    // Load new level data
    this.loadLevel(this.currentLevel);
  }

  private completeLevel(): void {
    this.engine.goToScene('game', {
      data: {
        level: this.currentLevel + 1,
        score: this.score,
      },
      sourceOut: new FadeInOut({ duration: 300, direction: 'out' }),
      destinationIn: new FadeInOut({ duration: 300, direction: 'in' }),
    });
  }

  private clearLevelActors(): void {
    // Remove all actors tagged as level-specific
    for (const actor of this.actors) {
      if (actor.hasTag('level-entity')) {
        actor.kill();
      }
    }
  }
}
```

### Pause Overlay Pattern

Excalibur does not support parallel scenes like Phaser. For a pause overlay, toggle engine state and render a pause UI:

```typescript
export class GameScene extends Scene {
  private isPaused = false;
  private pauseOverlay!: Actor;

  onInitialize(engine: Engine): void {
    // Create pause overlay (hidden by default)
    this.pauseOverlay = new ScreenElement({
      pos: vec(0, 0),
      width: engine.drawWidth,
      height: engine.drawHeight,
      color: Color.fromRGB(0, 0, 0, 0.6),
    });
    this.pauseOverlay.z = 1000;  // render on top
    this.pauseOverlay.graphics.visible = false;
    this.add(this.pauseOverlay);

    // Pause input
    engine.input.keyboard.on('press', (evt) => {
      if (evt.key === Input.Keys.Escape) {
        this.togglePause(engine);
      }
    });
  }

  private togglePause(engine: Engine): void {
    this.isPaused = !this.isPaused;
    this.pauseOverlay.graphics.visible = this.isPaused;

    if (this.isPaused) {
      engine.clock.stop();  // freeze all updates
    } else {
      engine.clock.start();
    }
  }
}
```

---

## Resource Loading Per Scene

Use Excalibur's `Loader` to load resources before a scene becomes interactive:

```typescript
import { Loader, ImageSource } from 'excalibur';

// Define resources
const Resources = {
  heroImage: new ImageSource('/assets/hero.png'),
  enemyImage: new ImageSource('/assets/enemy.png'),
  tilesetImage: new ImageSource('/assets/tileset.png'),
  bgm: new Sound('/assets/bgm.mp3'),
};

// Load all resources at startup
const loader = new Loader();
for (const resource of Object.values(Resources)) {
  loader.addResource(resource);
}

await game.start(loader);
// Loader shows a progress bar, then the first scene activates
```

For per-level loading, you can create additional loaders:

```typescript
export class GameScene extends Scene {
  async onActivate(context: SceneActivationContext<{ level: number }>): Promise<void> {
    const level = context.data?.level ?? 1;

    // Load level-specific resources if not already loaded
    if (!this.levelResources[level]) {
      const levelImage = new ImageSource(`/assets/level${level}.png`);
      await levelImage.load();
      this.levelResources[level] = levelImage;
    }
  }
}
```

---

## Comparison: Scene Systems Across Frameworks

| Concept | Excalibur | Phaser | Kaplay | PixiJS |
|---------|-----------|--------|--------|--------|
| Scene class | `ex.Scene` (extend) | `Phaser.Scene` (extend) | `scene()` function | None (use Containers) |
| Registration | `Engine({ scenes: {} })` | `GameConfig.scene[]` | `k.scene(name, fn)` | Manual |
| Navigation | `engine.goToScene(name)` | `this.scene.start(key)` | `k.go(name)` | Manual (swap Containers) |
| Data passing | `goToScene(name, { data })` → `onActivate(ctx)` | `scene.start(key, data)` → `init(data)` | `k.go(name, ...args)` | Manual |
| Lifecycle: init | `onInitialize` (once) | `init` + `create` | Scene function body | Manual |
| Lifecycle: enter | `onActivate` (each visit) | `init` (each start) | Scene function body (re-runs) | Manual |
| Lifecycle: exit | `onDeactivate` | `shutdown` event | None | Manual |
| Parallel scenes | No | Yes (`scene.launch`) | No | Manual (multiple Containers) |
| Transitions | Built-in (FadeInOut, CrossFade) | Camera effects / manual | None built-in | Manual |
| Camera per scene | Yes (auto) | Yes (auto) | Shared | Manual |

---

## Key Takeaways

1. **Extend `Scene` and register with `Engine({ scenes: {} })`** — each scene is a named, self-contained game state.
2. **`onInitialize` runs once; `onActivate`/`onDeactivate` run on each visit** — set up persistent state in init, per-visit state in activate/deactivate.
3. **Pass data via `goToScene(name, { data })`** — receive it in `onActivate(context)`. Type the data with `SceneActivationContext<T>`.
4. **Use built-in transitions for polish** — `FadeInOut` and `CrossFade` require minimal code and make navigation feel professional.
5. **Set default transitions on scene registration** — avoids repeating transition config on every `goToScene` call.
6. **Each scene owns its camera** — configure follow strategies, zoom, and bounds per scene.
7. **Reuse one scene class for multiple levels** — pass level data via `goToScene` and rebuild level content in `onActivate`.
8. **Tag level-specific actors for easy cleanup** — use `addTag('level-entity')` and clear them in `onActivate` when reloading.
