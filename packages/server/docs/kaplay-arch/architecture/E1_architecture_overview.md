# E1 — Kaplay Architecture Overview

> **Category:** explanation · **Engine:** Kaplay · **Related:** [G1 Components & Game Objects](../guides/G1_components_and_game_objects.md) · [G2 Scenes & Navigation](../guides/G2_scenes_and_navigation.md)

---

## Core Philosophy: Functions, Components, and Tags

Kaplay (formerly Kaboom.js) is a beginner-friendly 2D game library for JavaScript and TypeScript. Its architecture prioritizes **simplicity and speed of expression** — you can have a playable game in under 20 lines of code.

The design rests on three pillars:

1. **Functional API** — no class hierarchies. You call `kaplay()` to initialize, `add()` to create objects, `onKeyPress()` to handle input. Everything is a function call.
2. **Component composition** — game objects are built by combining components (`sprite()`, `pos()`, `area()`, `body()`, `health()`). Components provide data and behavior. This is an ECS-inspired pattern but with a friendlier API.
3. **Tags for identity** — game objects are identified by string tags, not types. Collision, querying, and destruction all work through tags.

This is fundamentally different from Phaser (class-based scenes and game objects) or Excalibur (typed Actor/Entity hierarchy). In Kaplay, **functions ARE the API**, **components ARE the building blocks**, and **tags ARE the type system**.

---

## Initialization: The `kaplay()` Function

Everything starts with a single function call:

```typescript
import kaplay from 'kaplay';

const k = kaplay({
  width: 800,
  height: 600,
  background: [0, 0, 0],       // RGB black
  canvas: document.querySelector('#game') as HTMLCanvasElement,
  scale: 1,
  crisp: true,                  // pixel-perfect rendering
  debug: true,                  // show colliders, FPS
  buttons: {
    jump: {
      keyboard: ['space', 'up'],
      gamepad: ['south'],
    },
    fire: {
      keyboard: ['x'],
      mouse: 'left',
      gamepad: ['west'],
    },
  },
});
```

### Key Config Decisions

| Option | Guidance |
|--------|----------|
| `crisp` | Set `true` for pixel art games — disables anti-aliasing and texture filtering. |
| `background` | RGB array or CSS color string. Clears every frame. |
| `buttons` | Define input bindings up front — unifies keyboard, mouse, and gamepad under one name. |
| `stretch` / `letterbox` | Use both `true` for responsive fit with letterboxing on mobile. |
| `debug` | Shows collision shapes and FPS counter. Disable for production. |

---

## Game Objects and Components: The Core Model

In Kaplay, a **game object** is created by calling `add()` with an array of components:

```typescript
// Create a player game object
const player = k.add([
  k.sprite('hero'),            // render a sprite
  k.pos(100, 200),             // position in world
  k.area(),                    // collision hitbox (auto-sized to sprite)
  k.body(),                    // affected by gravity, can land on platforms
  k.health(3),                 // 3 hit points
  k.anchor('center'),          // origin point for transforms
  k.scale(2),                  // 2x size
  'player',                    // tag — a plain string
  'friendly',                  // objects can have multiple tags
  { speed: 200 },              // custom data — any object literal
]);

// Access component methods
player.move(100, 0);           // from pos()
player.hurt(1);                // from health()
player.isGrounded();           // from body()
```

### How Components Work

Each component is a function that returns an object with properties and methods. When composed into a game object, all properties and methods merge onto that object:

| Component | Provides | Purpose |
|-----------|----------|---------|
| `pos(x, y)` | `.pos`, `.move()`, `.moveTo()` | Position and movement |
| `sprite(name)` | `.play()`, `.frame`, `.flipX()` | Sprite rendering and animation |
| `area()` | `.onCollide()`, `.isHovering()`, `.clicks()` | Collision detection and pointer events |
| `body()` | `.jump()`, `.isGrounded()`, `.gravityScale` | Physics: gravity, landing, solid surfaces |
| `health(hp)` | `.hurt()`, `.heal()`, `.onDeath()` | Hit points and death handling |
| `text(str)` | `.text` | Text rendering |
| `rect(w, h)` | — | Rectangle shape rendering |
| `color(r, g, b)` | `.color` | Tint or fill color |
| `rotate(angle)` | `.angle` | Rotation |
| `anchor(point)` | `.anchor` | Transform origin |
| `z(index)` | `.z` | Draw order |
| `opacity(val)` | `.opacity` | Transparency |
| `offscreen()` | `.onExitScreen()`, `.onEnterScreen()` | Screen boundary detection |
| `timer()` | `.wait()`, `.loop()`, `.tween()` | Delayed and repeating actions |

### Tags: The Identification System

Tags are plain strings passed into the component array. They serve as the game's type system:

```typescript
// Create enemies with tags
k.add([k.sprite('goblin'), k.pos(400, 200), k.area(), k.body(), 'enemy', 'ground-unit']);
k.add([k.sprite('bat'), k.pos(300, 50), k.area(), 'enemy', 'flying-unit']);

// Query by tag
const enemies = k.get('enemy');              // all objects tagged 'enemy'
const flyers = k.get('flying-unit');         // just the flying ones

// Collision between tags
k.onCollide('player', 'enemy', (player, enemy) => {
  player.hurt(1);
  enemy.destroy();
});

// Destroy all enemies
k.destroyAll('enemy');
```

---

## Scene Management

Kaplay uses a simple scene system for organizing game states:

```typescript
// Define scenes
k.scene('menu', () => {
  k.add([k.text('Press SPACE to start'), k.pos(400, 300), k.anchor('center')]);
  k.onKeyPress('space', () => k.go('game', { level: 1 }));
});

k.scene('game', (data: { level: number }) => {
  // data passed from k.go()
  const player = k.add([
    k.sprite('hero'),
    k.pos(50, 300),
    k.area(),
    k.body(),
    'player',
  ]);

  k.setGravity(1600);

  player.onCollide('goal', () => {
    k.go('game', { level: data.level + 1 });
  });

  player.onDeath(() => {
    k.go('gameover', { score: player.score });
  });
});

k.scene('gameover', (data: { score: number }) => {
  k.add([k.text(`Game Over! Score: ${data.score}`), k.pos(400, 300), k.anchor('center')]);
  k.onKeyPress('space', () => k.go('menu'));
});

// Start the first scene
k.go('menu');
```

### Scene Lifecycle

```
k.go('sceneName', data)
    ↓
Scene function runs (re-creates all objects each time)
    ↓
Game loop: update + draw every frame
    ↓
k.go('otherScene')  ← destroys current scene, starts new one
```

**Important:** Scenes in Kaplay are **not persistent**. When you call `k.go()`, the current scene is completely torn down and the new scene function runs fresh. There is no scene stacking or parallel scenes like in Phaser.

---

## Asset Loading

Kaplay loads assets before scenes run:

```typescript
// Load assets — call these before k.go()
k.loadSprite('hero', 'sprites/hero.png');
k.loadSprite('hero-sheet', 'sprites/hero-sheet.png', {
  sliceX: 8,    // 8 frames wide
  sliceY: 2,    // 2 rows
  anims: {
    idle: { from: 0, to: 3, loop: true, speed: 5 },
    run:  { from: 4, to: 7, loop: true, speed: 10 },
    jump: { from: 8, to: 10, speed: 8 },
    fall: { from: 11, to: 13, speed: 8 },
  },
});

k.loadSound('bgm', 'audio/bgm.mp3');
k.loadSound('jump', 'audio/jump.wav');
k.loadFont('pixel', 'fonts/pixel.ttf');

// Then start your game
k.go('menu');
```

### Supported Asset Types

- **Sprites:** PNG, JPG, with optional spritesheet slicing and animation definitions
- **Sounds:** MP3, OGG, WAV
- **Fonts:** TTF, OTF, or bitmap font sheets
- **Shaders:** Custom GLSL fragment shaders via `loadShader()`
- **JSON data:** Via `loadJSON()` for level data, dialogue trees, etc.

---

## Input Handling

Kaplay unifies input through a flexible binding system:

```typescript
// Direct keyboard input
k.onKeyPress('space', () => player.jump(400));
k.onKeyDown('right', () => player.move(200, 0));
k.onKeyRelease('right', () => { /* stop animation */ });

// Unified button input (configured in kaplay() options)
k.onButtonPress('jump', () => player.jump(400));
k.onButtonDown('fire', () => shoot());

// Mouse / touch
k.onMousePress((pos) => { /* click/tap position */ });
k.onTouchStart((pos, touch) => { /* multi-touch */ });

// Per-object input (requires area() component)
button.onClick(() => k.go('game'));
player.onHover(() => { /* mouse hovering */ });
```

---

## Physics and Collision

Kaplay includes built-in arcade physics:

```typescript
// Set global gravity
k.setGravity(1600);

// Platform (static — has area but no body)
k.add([k.rect(800, 40), k.pos(0, 560), k.area(), k.body({ isStatic: true }), 'platform']);

// Player (dynamic — has body, affected by gravity)
const player = k.add([k.sprite('hero'), k.pos(100, 400), k.area(), k.body(), 'player']);

// Jump when grounded
k.onKeyPress('space', () => {
  if (player.isGrounded()) {
    player.jump(500);
  }
});

// Collision callbacks
k.onCollide('player', 'coin', (player, coin) => {
  coin.destroy();
  k.play('coin-sfx');
  score++;
});

// Overlap detection (non-solid)
k.onCollide('player', 'danger-zone', () => {
  player.hurt(1);
});
```

---

## Recommended Project Structure

```
src/
├── main.ts               # kaplay() init, asset loading, k.go('menu')
├── scenes/
│   ├── menu.ts           # Menu scene definition
│   ├── game.ts           # Main gameplay scene
│   └── gameover.ts       # Game over scene
├── objects/
│   ├── player.ts         # Function returning player component array
│   ├── enemy.ts          # Function returning enemy component array
│   └── ui.ts             # HUD and UI helper functions
├── components/
│   └── patrol.ts         # Custom components (returns component object)
├── data/
│   └── levels.ts         # Level layouts, spawn data
└── utils/
    └── constants.ts      # Physics values, speeds, tag names
public/
├── sprites/
├── audio/
└── fonts/
```

### Custom Components

You can create reusable components:

```typescript
// components/patrol.ts
function patrol(speed: number = 100, distance: number = 200) {
  let startX = 0;
  let dir = 1;
  return {
    id: 'patrol',             // unique component ID
    require: ['pos'],          // declare dependencies
    add() {
      startX = this.pos.x;    // 'this' is the game object
    },
    update() {
      this.move(speed * dir, 0);
      if (Math.abs(this.pos.x - startX) > distance) {
        dir *= -1;
      }
    },
  };
}

// Usage
k.add([k.sprite('goblin'), k.pos(300, 400), k.area(), k.body(), patrol(80, 150), 'enemy']);
```

---

## Comparison with Other Web Frameworks

| Aspect | Kaplay | Phaser | Excalibur |
|--------|--------|--------|-----------|
| API style | Functional | Class-based | Class-based |
| Scene model | Stateless functions | Persistent Scene instances | Persistent Scene instances |
| Object model | Component arrays + tags | Game Object classes | Actor / Entity classes |
| Physics | Built-in arcade | Arcade or Matter.js | Built-in SAT-based |
| TypeScript | Supported | Excellent typings | Built from ground up |
| Learning curve | Very low | Moderate | Moderate |
| Best for | Game jams, prototypes, learning | Production 2D web games | TypeScript-first projects |

---

## Mobile and Deployment

### Mobile Considerations

- Set `stretch: true` and `letterbox: true` for responsive mobile layout.
- Use `buttons` config to unify touch, keyboard, and gamepad under one input binding.
- Audio may require user interaction to start on mobile — trigger first sound on a tap event.
- Touch works through mouse events (`onMousePress`, `onClick`) automatically.

### Deployment

- **Vite/Webpack** — `create-kaplay` scaffolds a Vite project. Build and deploy `dist/` to any static host.
- **Itch.io** — zip the build output and upload. Kaplay games are lightweight (library is ~200KB).
- **Replit** — Kaplay has built-in Replit template support for instant browser-based development.

---

## Key Takeaways for AI Code Generation

1. **Always call `kaplay()` first** — it returns the context object with all API functions. Use `const k = kaplay()` and prefix calls with `k.` for clarity.
2. **Components are composed, not inherited** — build objects by combining `sprite()`, `pos()`, `area()`, `body()`, etc. Do not create class hierarchies.
3. **Use tags for identification** — pass string tags into `add()` arrays. Use `k.get('tag')` to query, `k.onCollide('a', 'b', fn)` for collisions.
4. **Scenes are stateless** — every `k.go()` call re-runs the scene function from scratch. Do not rely on scene-level state persistence.
5. **Load assets before `k.go()`** — all `loadSprite()`, `loadSound()`, etc. calls should happen before the first `k.go()`.
6. **Custom components** return objects with `id`, optional `require`, and lifecycle hooks (`add`, `update`, `draw`, `destroy`).
7. **Kaplay is Kaboom-compatible** — `kaboom()` is an alias for `kaplay()`. Existing Kaboom.js tutorials and code work with Kaplay.
