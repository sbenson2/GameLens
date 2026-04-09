# G3 — PixiJS Scene & State Management

> **Category:** guide · **Engine:** PixiJS · **Related:** [E1 Architecture Overview](../architecture/E1_architecture_overview.md) · [G1 Asset Loading](G1_asset_loading.md) · [G2 Sprites & Animation](G2_sprites_animation.md)

---

## Overview

PixiJS is a rendering engine, not a game framework — it has no built-in concept of "scenes," "game states," or "screen transitions." Instead, it gives you a powerful scene graph built on Containers, and you compose your own state management on top of it. This is PixiJS's deliberate design: stay lean, stay flexible, let the developer choose the right abstraction.

This guide covers how to use PixiJS v8's Container hierarchy to implement game screens, how to build a lightweight scene manager, transition patterns, and state machine approaches for game logic.

---

## The Scene Graph as Your Foundation

In PixiJS v8, the scene graph is a tree of nodes rooted at `app.stage`. Every frame, PixiJS walks this tree from root to leaves, computing each node's final transform, visibility, and alpha, then renders the visible nodes.

```
app.stage (root Container)
├── menuScreen (Container)        ← visible when in menu
│   ├── background (Sprite)
│   ├── title (Text)
│   └── playButton (Sprite)
├── gameScreen (Container)        ← visible when playing
│   ├── world (Container)
│   │   ├── tilemap (Container)
│   │   ├── enemies (Container)
│   │   └── player (Sprite)
│   └── hud (Container)
│       ├── scoreText (Text)
│       └── healthBar (Graphics)
└── gameOverScreen (Container)    ← visible when game over
    ├── overlay (Graphics)
    └── retryButton (Sprite)
```

The key insight: **toggling a Container's `visible` property hides the entire subtree in a single operation.** This is the basis for screen management in PixiJS.

---

## Approach 1: Visibility Toggling (Simplest)

For small games or prototypes, keep all screens as children of `app.stage` and toggle visibility:

```typescript
import { Application, Container, Sprite, Text } from 'pixi.js';

const app = new Application();
await app.init({ width: 800, height: 600, background: '#1a1a2e' });
document.body.appendChild(app.canvas);

// Create screen containers
const menuScreen = new Container();
const gameScreen = new Container();
const gameOverScreen = new Container();

// Add all to stage, hide inactive
app.stage.addChild(menuScreen, gameScreen, gameOverScreen);
gameScreen.visible = false;
gameOverScreen.visible = false;

// Populate menu screen
const title = new Text({ text: 'My Game', style: { fontSize: 48, fill: 0xffffff } });
title.anchor.set(0.5);
title.position.set(400, 200);
menuScreen.addChild(title);

// Switch screens by toggling visibility
function showScreen(screen: Container) {
  menuScreen.visible = false;
  gameScreen.visible = false;
  gameOverScreen.visible = false;
  screen.visible = true;
}

// Usage
showScreen(gameScreen); // switch to gameplay
```

### Pros and Cons

- **Pro:** Dead simple, zero abstraction overhead.
- **Con:** All screens exist in memory at all times. For a menu and one gameplay screen this is fine; for 20 levels with heavy textures it's not.
- **Con:** No lifecycle hooks — you must manually initialize/reset state when switching.

---

## Approach 2: Add/Remove Pattern (Memory Efficient)

Instead of hiding screens, add them to the stage when entering and remove them when leaving. This frees memory for inactive screens:

```typescript
import { Application, Container } from 'pixi.js';

const app = new Application();
await app.init({ width: 800, height: 600, background: '#1a1a2e' });

let currentScreen: Container | null = null;

function switchScreen(newScreen: Container) {
  // Remove old screen from the stage
  if (currentScreen) {
    app.stage.removeChild(currentScreen);
    // Optional: destroy to free GPU resources
    // currentScreen.destroy({ children: true });
  }

  currentScreen = newScreen;
  app.stage.addChild(newScreen);
}

// Usage
const menuScreen = createMenuScreen();
switchScreen(menuScreen);

function startGame() {
  const gameScreen = createGameScreen(); // built fresh each time
  switchScreen(gameScreen);
}
```

### When to `destroy()` vs. Just Remove

- **Remove only (`removeChild`):** The Container and its children are removed from the render tree but remain in memory. Use this when you'll return to the screen frequently (e.g., a pause menu).
- **Destroy (`destroy({ children: true })`):** The Container, its children, and optionally their textures are freed from both JS and GPU memory. Use this for one-time screens like level-complete overlays or screens with large textures you won't revisit soon.

```typescript
// Destroy with options
screen.destroy({
  children: true,      // also destroy child display objects
  texture: false,      // keep textures (shared assets)
  textureSource: false, // keep base texture sources
});
```

---

## Approach 3: Scene Manager Class

For structured games, build a scene manager that handles lifecycle, transitions, and the game loop:

```typescript
import { Application, Container } from 'pixi.js';

// Abstract base class for game screens
abstract class GameScreen extends Container {
  /** Called when the screen becomes active */
  abstract onEnter(data?: Record<string, unknown>): void;

  /** Called every frame while the screen is active */
  abstract onUpdate(delta: number): void;

  /** Called when the screen is about to be removed */
  abstract onExit(): void;
}

class SceneManager {
  private app: Application;
  private currentScreen: GameScreen | null = null;
  private screens = new Map<string, () => GameScreen>();

  constructor(app: Application) {
    this.app = app;

    // Wire into the PixiJS render loop
    this.app.ticker.add((ticker) => {
      this.currentScreen?.onUpdate(ticker.deltaTime);
    });
  }

  /** Register a screen factory (lazy construction) */
  register(name: string, factory: () => GameScreen) {
    this.screens.set(name, factory);
  }

  /** Transition to a named screen */
  goTo(name: string, data?: Record<string, unknown>) {
    const factory = this.screens.get(name);
    if (!factory) {
      throw new Error(`Screen "${name}" not registered`);
    }

    // Exit current screen
    if (this.currentScreen) {
      this.currentScreen.onExit();
      this.app.stage.removeChild(this.currentScreen);
      this.currentScreen.destroy({ children: true });
    }

    // Enter new screen
    const screen = factory();
    this.currentScreen = screen;
    this.app.stage.addChild(screen);
    screen.onEnter(data);
  }
}
```

### Implementing Screens

```typescript
class MenuScreen extends GameScreen {
  private title!: Text;

  onEnter() {
    this.title = new Text({
      text: 'Space Shooter',
      style: { fontSize: 48, fill: 0xffffff },
    });
    this.title.anchor.set(0.5);
    this.title.position.set(400, 200);
    this.addChild(this.title);

    // Button
    const playBtn = new Sprite(Texture.from('play-button'));
    playBtn.anchor.set(0.5);
    playBtn.position.set(400, 400);
    playBtn.eventMode = 'static';
    playBtn.cursor = 'pointer';
    playBtn.on('pointerdown', () => {
      sceneManager.goTo('game', { level: 1 });
    });
    this.addChild(playBtn);
  }

  onUpdate(delta: number) {
    // Animate title bob
    this.title.y = 200 + Math.sin(Date.now() / 500) * 10;
  }

  onExit() {
    // Cleanup — any event listeners, intervals, etc.
  }
}

class GameplayScreen extends GameScreen {
  private player!: Sprite;
  private score = 0;

  onEnter(data?: Record<string, unknown>) {
    const level = (data?.level as number) ?? 1;

    this.player = new Sprite(Texture.from('ship'));
    this.player.anchor.set(0.5);
    this.player.position.set(400, 500);
    this.addChild(this.player);

    // ... set up enemies, HUD, etc. based on level
  }

  onUpdate(delta: number) {
    // Game logic: input, movement, collisions
    // ...

    if (this.playerDead) {
      sceneManager.goTo('gameover', { score: this.score });
    }
  }

  onExit() {
    // Stop any audio, clear intervals
  }
}

// Bootstrap
const app = new Application();
await app.init({ width: 800, height: 600 });
document.body.appendChild(app.canvas);

const sceneManager = new SceneManager(app);
sceneManager.register('menu', () => new MenuScreen());
sceneManager.register('game', () => new GameplayScreen());
sceneManager.register('gameover', () => new GameOverScreen());

sceneManager.goTo('menu');
```

---

## Screen Transitions

### Fade Transition

Add a full-screen Graphics overlay that fades in, swaps screens, then fades out:

```typescript
import { Graphics, Ticker } from 'pixi.js';

class SceneManager {
  private overlay: Graphics;
  private transitioning = false;

  constructor(app: Application) {
    // ... previous constructor code ...

    // Persistent overlay for transitions
    this.overlay = new Graphics();
    this.overlay.rect(0, 0, app.screen.width, app.screen.height);
    this.overlay.fill({ color: 0x000000 });
    this.overlay.alpha = 0;
    this.overlay.zIndex = 9999;
    app.stage.addChild(this.overlay);
    app.stage.sortableChildren = true;
  }

  async goTo(name: string, data?: Record<string, unknown>) {
    if (this.transitioning) return;
    this.transitioning = true;

    // Fade to black
    await this.fadeTo(1, 300);

    // Swap screens (same logic as before)
    if (this.currentScreen) {
      this.currentScreen.onExit();
      this.app.stage.removeChild(this.currentScreen);
      this.currentScreen.destroy({ children: true });
    }
    const factory = this.screens.get(name)!;
    const screen = factory();
    this.currentScreen = screen;
    this.app.stage.addChild(screen);
    screen.onEnter(data);

    // Fade from black
    await this.fadeTo(0, 300);
    this.transitioning = false;
  }

  private fadeTo(targetAlpha: number, durationMs: number): Promise<void> {
    return new Promise((resolve) => {
      const startAlpha = this.overlay.alpha;
      const startTime = performance.now();

      const tick = () => {
        const elapsed = performance.now() - startTime;
        const t = Math.min(elapsed / durationMs, 1);
        this.overlay.alpha = startAlpha + (targetAlpha - startAlpha) * t;

        if (t >= 1) {
          this.app.ticker.remove(tick);
          resolve();
        }
      };

      this.app.ticker.add(tick);
    });
  }
}
```

---

## Game State Machine

Beyond screen management, games need state tracking within a screen — a gameplay screen might cycle through `playing → paused → boss-intro → boss-fight → victory`. Here's a lightweight state machine for PixiJS:

```typescript
type StateHooks = {
  onEnter?: () => void;
  onUpdate?: (delta: number) => void;
  onExit?: () => void;
};

class StateMachine {
  private states = new Map<string, StateHooks>();
  private current: string | null = null;

  add(name: string, hooks: StateHooks) {
    this.states.set(name, hooks);
    return this; // chainable
  }

  transition(name: string) {
    if (name === this.current) return;

    // Exit current state
    if (this.current) {
      this.states.get(this.current)?.onExit?.();
    }

    // Enter new state
    this.current = name;
    this.states.get(name)?.onEnter?.();
  }

  update(delta: number) {
    if (this.current) {
      this.states.get(this.current)?.onUpdate?.(delta);
    }
  }

  get currentState(): string | null {
    return this.current;
  }
}
```

### Using the State Machine in a Screen

```typescript
class GameplayScreen extends GameScreen {
  private fsm = new StateMachine();
  private pauseOverlay!: Container;

  onEnter() {
    // ... set up game objects ...

    this.fsm
      .add('playing', {
        onEnter: () => { this.pauseOverlay.visible = false; },
        onUpdate: (delta) => { this.updateGameplay(delta); },
      })
      .add('paused', {
        onEnter: () => { this.pauseOverlay.visible = true; },
        onUpdate: () => { /* frozen — no gameplay update */ },
        onExit: () => { this.pauseOverlay.visible = false; },
      })
      .add('victory', {
        onEnter: () => { this.showVictoryAnimation(); },
        onUpdate: (delta) => { this.updateVictoryAnimation(delta); },
      });

    this.fsm.transition('playing');

    // Pause on Escape
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        const next = this.fsm.currentState === 'paused' ? 'playing' : 'paused';
        this.fsm.transition(next);
      }
    });
  }

  onUpdate(delta: number) {
    this.fsm.update(delta);
  }

  onExit() {
    // Remove global listeners
  }
}
```

---

## Layered UI with Persistent Containers

Some elements (HUD, debug overlays, notification toasts) should persist across screen changes. Handle this by keeping them outside the scene manager's jurisdiction:

```typescript
// Bootstrap
const app = new Application();
await app.init({ width: 800, height: 600 });

// Layer structure
const screenLayer = new Container();  // managed by SceneManager
const hudLayer = new Container();     // persistent
const debugLayer = new Container();   // persistent

app.stage.addChild(screenLayer, hudLayer, debugLayer);

// SceneManager only touches screenLayer
class SceneManager {
  constructor(private app: Application, private root: Container) {}

  goTo(name: string) {
    // Remove/add children of this.root, not app.stage
    // hudLayer and debugLayer are unaffected
  }
}

const sceneManager = new SceneManager(app, screenLayer);

// HUD lives outside scene management
const scoreText = new Text({ text: 'Score: 0', style: { fill: 0xffffff } });
scoreText.position.set(16, 16);
hudLayer.addChild(scoreText);
```

---

## Important v8 Change: Leaf Nodes Cannot Have Children

In PixiJS v8, **Sprite, Mesh, Graphics, and other leaf nodes can no longer have children.** Only Container can. If you previously attached a health bar as a child of a Sprite, you now need to wrap both in a Container:

```typescript
// v7 style (no longer works in v8)
// const enemy = new Sprite(texture);
// enemy.addChild(healthBar); // ERROR in v8

// v8 style — use a Container wrapper
const enemyContainer = new Container();
const enemySprite = new Sprite(Texture.from('enemy'));
const healthBar = new Graphics();

enemyContainer.addChild(enemySprite, healthBar);
healthBar.position.set(-20, -30); // relative to container
```

This affects scene organization — plan your hierarchy with Containers as branch nodes and Sprites/Graphics as leaves.

---

## Comparison: Scene Management Across Frameworks

| Concept | PixiJS | Phaser | Kaplay | Excalibur |
|---------|--------|--------|--------|-----------|
| Built-in scenes | No | Yes (`Scene` class) | Yes (`scene()` / `go()`) | Yes (`Scene` class) |
| Screen switching | Manual (Container add/remove) | `scene.start()` / `scene.launch()` | `go('name', data)` | `engine.goToScene('name')` |
| Parallel screens | Trivial (multiple Containers) | Built-in (`scene.launch()`) | Not supported | Not built-in |
| Transitions | Manual (tween overlay) | Built-in camera effects | Manual | Manual |
| Auto cleanup | Manual (`destroy()`) | Automatic per scene | Automatic per `go()` | Automatic per scene |
| Persistent UI | Keep in separate Container | Use parallel scene | `stay()` component | Manage manually |
| State machine | Build your own | Build your own | Built-in `state()` on objects | Build your own |

---

## Key Takeaways

1. **PixiJS has no scene system — you build one.** The Container-based scene graph is your toolkit. Choose visibility toggling for simplicity, add/remove for memory efficiency, or a full scene manager class for structured games.
2. **Containers are your organizational primitive.** Use them as screens, layers, groups, and UI panels. In v8, only Containers can have children — Sprites and Graphics are leaf nodes.
3. **Call `destroy()` to free memory.** Removing a Container from the stage stops it from rendering but keeps it in JS/GPU memory. Destroy with `{ children: true }` for screens you won't revisit.
4. **Separate persistent UI from managed screens.** Keep HUD and overlays in their own Container tree so the scene manager can swap gameplay screens without affecting the HUD.
5. **A state machine helps within screens.** Playing, paused, cutscene, boss-intro — track these with a simple FSM rather than scattered boolean flags.
6. **Transitions are just overlays.** Fade a full-screen Graphics between screen swaps. Wrap the swap in async/await for clean sequencing.
