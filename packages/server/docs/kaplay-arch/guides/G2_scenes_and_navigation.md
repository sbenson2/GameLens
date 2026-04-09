# G2 — Kaplay Scenes & Navigation

> **Category:** guide · **Engine:** Kaplay · **Related:** [E1 Architecture Overview](../architecture/E1_architecture_overview.md) · [G1 Components & Game Objects](G1_components_and_game_objects.md)

---

## Overview

Scenes in Kaplay are self-contained game states — a main menu, a gameplay level, a game-over screen. You define them with `scene()`, switch between them with `go()`, and pass data across transitions. Every time `go()` fires, all game objects in the current scene are destroyed and the new scene's setup function runs from scratch. This "clean slate" model keeps memory predictable and prevents stale state from leaking between screens.

This guide covers scene definition, navigation with data passing, persistent objects via `stay()`, transition patterns, and common multi-scene architectures.

---

## Defining Scenes with `scene()`

A scene is a named function registered before your game starts. The function body runs each time the scene is activated:

```typescript
import kaplay from 'kaplay';

const k = kaplay({ width: 800, height: 600, background: [26, 26, 46] });

// Load assets before defining scenes
k.loadSprite('hero', 'sprites/hero.png');
k.loadSprite('logo', 'sprites/logo.png');
k.loadSound('bgm', 'audio/bgm.ogg');

// Define scenes — nothing runs yet
k.scene('menu', () => {
  k.add([k.sprite('logo'), k.pos(400, 200), k.anchor('center')]);
  k.add([
    k.text('Press ENTER to Play', { size: 24 }),
    k.pos(400, 400),
    k.anchor('center'),
  ]);

  k.onKeyPress('enter', () => {
    k.go('game', { level: 1, score: 0 });
  });
});

k.scene('game', (data: { level: number; score: number }) => {
  // data comes from go()
  k.add([
    k.text(`Level ${data.level}  Score: ${data.score}`, { size: 20 }),
    k.pos(16, 16),
  ]);

  // ... gameplay setup
});

// Start the first scene
k.go('menu');
```

### Key Rules

1. **`scene()` registers, `go()` activates.** Calling `scene()` does not start the scene — it only stores the definition. The game begins when you call `go()`.
2. **Scene functions can receive parameters.** Whatever you pass as the second argument to `go()` is forwarded to the scene function.
3. **Define all scenes before calling `go()`.** Kaplay looks up scenes by name, so the scene must be registered before navigation targets it.

---

## Navigating with `go()` and Passing Data

`go(sceneName, data?)` destroys the current scene and starts a new one. The `data` argument can be any value — an object, a number, a string:

```typescript
// Pass a single value
k.go('gameover', 42);

k.scene('gameover', (finalScore: number) => {
  k.add([
    k.text(`Game Over! Score: ${finalScore}`, { size: 32 }),
    k.pos(k.center()),
    k.anchor('center'),
  ]);
});
```

```typescript
// Pass a structured object (recommended for complex state)
k.go('game', { level: 3, score: 1200, lives: 2 });

k.scene('game', (data: { level: number; score: number; lives: number }) => {
  const { level, score, lives } = data;
  // Build the level using the received data
});
```

### What Happens During `go()`

1. All game objects in the current scene are **destroyed** (except those with `stay()`).
2. All event handlers registered in the current scene are **removed**.
3. The target scene's setup function is **called** with the provided data.
4. The game loop continues rendering the new scene.

This means every `go()` call is a full reset. You don't need to manually clean up timers, collision handlers, or objects — Kaplay handles it.

---

## Persistent Objects with `stay()`

Some objects need to survive scene transitions — score displays, background music managers, transition overlays. The `stay()` component prevents an object from being destroyed on `go()`:

```typescript
// Create a persistent HUD before any scene starts
const scoreLabel = k.add([
  k.text('Score: 0', { size: 20 }),
  k.pos(16, 16),
  k.fixed(),     // unaffected by camera movement
  k.z(100),      // render on top of everything
  k.stay(),      // survive scene changes
  'hud',
]);

// This object exists across ALL scenes
k.scene('menu', () => {
  scoreLabel.text = 'Score: 0';
  // ...
});

k.scene('game', () => {
  // scoreLabel is still alive and accessible via k.get('hud')
});
```

### Limiting `stay()` to Specific Scenes

You can restrict which scenes the object persists in:

```typescript
// Only persists in 'game' and 'boss' scenes, destroyed in others
const gameHud = k.add([
  k.text('HP: ███'),
  k.pos(16, 40),
  k.fixed(),
  k.stay(['game', 'boss']),
  'game-hud',
]);
```

When you `go('menu')`, `gameHud` will be destroyed because `'menu'` is not in the allowed list.

### `stay()` Caveats

- **Root only:** `stay()` only works on objects added to the root level with `k.add()`. Children of other objects cannot independently persist.
- **Event handlers don't persist:** Scene-level handlers registered with `k.onKeyPress()`, `k.onCollide()`, etc. are still removed on `go()`. If a persistent object needs event handlers, re-register them in each scene or use the object's own `.onUpdate()`.
- **Manual cleanup:** If a `stay()` object accumulates stale state, you must reset it yourself when entering a new scene.

---

## Scene Architecture Patterns

### Pattern 1: Linear Flow (Menu → Game → Game Over)

The simplest and most common pattern for small games:

```typescript
k.scene('menu', () => {
  k.add([
    k.text('My Game', { size: 48 }),
    k.pos(k.center()),
    k.anchor('center'),
  ]);

  k.onKeyPress('enter', () => k.go('game', { level: 1, score: 0 }));
});

k.scene('game', ({ level, score }: { level: number; score: number }) => {
  const player = k.add([
    k.sprite('hero'), k.pos(100, 400), k.area(), k.body(),
    k.health(3), 'player', { score },
  ]);

  player.onDeath(() => {
    k.go('gameover', { score: player.score });
  });

  // On level complete:
  k.onCollide('player', 'exit-door', () => {
    k.go('game', { level: level + 1, score: player.score });
  });
});

k.scene('gameover', ({ score }: { score: number }) => {
  k.add([
    k.text(`Game Over\nScore: ${score}`, { size: 32, align: 'center' }),
    k.pos(k.center()),
    k.anchor('center'),
  ]);

  k.onKeyPress('enter', () => k.go('menu'));
});

k.go('menu');
```

### Pattern 2: Pause Overlay with `stay()`

Because `go()` destroys everything, a traditional pause screen requires a different approach. Instead of a separate scene, use a persistent overlay that toggles visibility:

```typescript
let paused = false;

// Persistent pause overlay (hidden by default)
const pauseOverlay = k.add([
  k.rect(k.width(), k.height()),
  k.color(0, 0, 0),
  k.opacity(0),
  k.pos(0, 0),
  k.fixed(),
  k.z(999),
  k.stay(),
  'pause-overlay',
  { hidden: true },
]);

const pauseText = pauseOverlay.add([
  k.text('PAUSED', { size: 48 }),
  k.pos(k.width() / 2, k.height() / 2),
  k.anchor('center'),
  k.opacity(0),
]);

k.scene('game', (data) => {
  // ... gameplay setup ...

  k.onKeyPress('escape', () => {
    paused = !paused;
    pauseOverlay.opacity = paused ? 0.7 : 0;
    pauseText.opacity = paused ? 1 : 0;
  });

  k.onUpdate(() => {
    if (paused) return; // freeze gameplay logic
    // ... game update logic ...
  });
});
```

### Pattern 3: Level Select with Dynamic Scenes

For games with many levels, generate scene data dynamically:

```typescript
interface LevelConfig {
  name: string;
  map: string;
  enemies: number;
  timeLimit: number;
}

const levels: LevelConfig[] = [
  { name: 'Forest',  map: 'maps/forest.json',  enemies: 5,  timeLimit: 60 },
  { name: 'Cave',    map: 'maps/cave.json',    enemies: 10, timeLimit: 90 },
  { name: 'Castle',  map: 'maps/castle.json',  enemies: 15, timeLimit: 120 },
];

k.scene('select', () => {
  levels.forEach((level, i) => {
    const btn = k.add([
      k.rect(200, 50, { radius: 8 }),
      k.pos(400, 150 + i * 80),
      k.anchor('center'),
      k.area(),
      k.color(60, 60, 100),
      'level-btn',
    ]);

    btn.add([
      k.text(level.name, { size: 20 }),
      k.anchor('center'),
      k.color(255, 255, 255),
    ]);

    btn.onClick(() => {
      k.go('game', { levelIndex: i, score: 0 });
    });
  });
});

k.scene('game', ({ levelIndex, score }: { levelIndex: number; score: number }) => {
  const config = levels[levelIndex];
  // Build level from config...
});
```

### Pattern 4: Shared State Manager with `stay()`

For complex games that need shared state across scenes (inventory, achievements, settings), create a persistent manager object:

```typescript
// State manager — created once, lives forever
const gameState = k.add([
  k.stay(),
  'game-state',
  {
    playerName: '',
    totalScore: 0,
    unlockedLevels: [true, false, false, false, false],
    settings: { musicVolume: 0.8, sfxVolume: 1.0 },

    // Helper methods on the custom data object
    unlockLevel(index: number) {
      this.unlockedLevels[index] = true;
    },
    addScore(points: number) {
      this.totalScore += points;
    },
  },
]);

// Access from any scene
k.scene('game', ({ levelIndex }) => {
  const state = k.get('game-state')[0];
  // ... use state.totalScore, state.settings, etc.

  // On level complete:
  state.addScore(500);
  state.unlockLevel(levelIndex + 1);
  k.go('select');
});
```

---

## Comparison: Scene Navigation Across Frameworks

| Concept | Kaplay | Phaser | PixiJS | Excalibur |
|---------|--------|--------|--------|-----------|
| Define a scene | `scene('name', fn)` | `class MyScene extends Scene` | No built-in (use Containers) | `class MyScene extends Scene` |
| Switch scenes | `go('name', data)` | `this.scene.start('name', data)` | Manual (swap root children) | `engine.goToScene('name')` |
| Pass data | Second arg to `go()` | `init(data)` method | Manual property assignment | `onInitialize()`  |
| Parallel scenes | Not supported | `this.scene.launch()` | Multiple Containers | Not built-in |
| Persist objects | `stay()` component | Object in a parallel scene | Don't remove from stage | Use `kill()` / `unkill()` |
| Cleanup model | Auto-destroy all | Auto via scene lifecycle | Manual | Auto via scene lifecycle |

---

## Debugging Scene Issues

### "My objects disappeared after `go()`"

Objects without `stay()` are destroyed on every scene transition. If an object should persist, add the `stay()` component.

### "Event handlers stopped working after switching scenes"

Scene-level event handlers (`k.onKeyPress`, `k.onCollide`, etc.) are removed when the scene exits. Re-register them in the new scene's setup function.

### "Data is `undefined` in my scene function"

Ensure you're passing data as the second argument to `go()`:

```typescript
// Wrong — no data passed
k.go('game');

// Right — data passed
k.go('game', { level: 1, score: 0 });
```

Also ensure the scene function signature matches what you pass:

```typescript
// If you pass an object, destructure it
k.scene('game', ({ level, score }: { level: number; score: number }) => {
  // ...
});

// If you pass a single value, accept it directly
k.scene('gameover', (score: number) => {
  // ...
});
```

---

## Key Takeaways

1. **Scenes are named setup functions** — `scene()` registers, `go()` activates. Keep scene functions focused on one game state.
2. **`go()` is a clean slate** — all objects and handlers are destroyed. This prevents memory leaks but means you must explicitly persist anything that should survive.
3. **Use `stay()` for cross-scene objects** — HUD elements, audio managers, and global state managers should use `stay()` to persist across transitions.
4. **Pass structured data to scenes** — use objects with clear interfaces rather than loose positional arguments. TypeScript interfaces make this self-documenting.
5. **There are no parallel scenes** — unlike Phaser, Kaplay runs one scene at a time. Use `stay()` objects or visibility toggling for overlay-style UI like pause menus.
6. **Scene-level handlers are scoped** — `k.onKeyPress()`, `k.onCollide()`, and similar handlers are automatically cleaned up on transition. You don't need to unsubscribe manually.
