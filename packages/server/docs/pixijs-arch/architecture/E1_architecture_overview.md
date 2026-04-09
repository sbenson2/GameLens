# E1 — PixiJS v8 Architecture Overview

> **Category:** explanation · **Engine:** PixiJS · **Related:** [G1 Asset Loading](../guides/G1_asset_loading.md) · [G2 Sprites & Animation](../guides/G2_sprites_animation.md)

---

## Core Philosophy: Renderer First, Game Framework Second

PixiJS is a high-performance 2D rendering engine for the web — not a full game framework. This is a critical distinction. Where Phaser gives you scenes, physics, audio, and input out of the box, PixiJS gives you the fastest possible 2D rendering pipeline and lets you choose your own physics, audio, and state management libraries.

This makes PixiJS ideal for developers who want fine-grained control over their game architecture, or for projects that need rendering power without framework opinions. The tradeoff: you build more yourself.

**PixiJS v8** (current major version) is a ground-up rewrite focused on:

1. **WebGPU + WebGL dual backend** — automatic selection of the best renderer for the hardware.
2. **Extension-based architecture** — every system is a modular extension, making PixiJS lightweight and tree-shakeable.
3. **Scene graph with smart rendering** — only re-renders elements that changed. Static scenes cost nearly zero GPU time.
4. **Single package** — `pixi.js` is one npm package with one import root, enabling excellent tree shaking.

---

## Application Bootstrap

Everything starts with `Application`, which sets up the renderer, creates a root stage container, and runs the frame ticker:

```typescript
import { Application, Sprite, Assets } from 'pixi.js';

const app = new Application();

// v8 BREAKING CHANGE: init() is async — you must await it
await app.init({
  background: '#1a1a2e',
  resizeTo: window,           // responsive canvas
  antialias: true,
  resolution: window.devicePixelRatio || 1,
  autoDensity: true,          // CSS pixel scaling
});

document.getElementById('game-container')!.appendChild(app.canvas);

// Load assets before using them
const texture = await Assets.load('hero.png');
const hero = new Sprite(texture);
hero.anchor.set(0.5);
hero.x = app.screen.width / 2;
hero.y = app.screen.height / 2;
app.stage.addChild(hero);

// Game loop via ticker
app.ticker.add((ticker) => {
  hero.rotation += 0.01 * ticker.deltaTime;
});
```

### Key Bootstrap Decisions

| Option | Guidance |
|--------|----------|
| `resizeTo` | Set to `window` for fullscreen games, or a specific DOM element for embedded games. |
| `antialias` | Enable for non-pixel-art games. Disable for pixel art to keep crisp edges. |
| `resolution` | Match `window.devicePixelRatio` for sharp rendering on retina/HiDPI displays. |
| `autoDensity` | Always pair with `resolution` — scales the canvas CSS to match device pixels. |
| `preference` | `'webgpu'`, `'webgl'`, or omit for auto-detection. Auto is recommended for most games. |

---

## Scene Graph: Containers All the Way Down

PixiJS has no built-in "Scene" concept like Phaser or Excalibur. Instead, it uses a **Container hierarchy** (scene graph). The `app.stage` is the root Container, and you build your game by nesting Containers:

```typescript
import { Container, Sprite, Text } from 'pixi.js';

// Conceptual "scenes" are just Containers
const gameWorld = new Container();
const uiLayer = new Container();
const pauseMenu = new Container();
pauseMenu.visible = false;

app.stage.addChild(gameWorld);
app.stage.addChild(uiLayer);   // renders on top of gameWorld
app.stage.addChild(pauseMenu); // renders on top of everything

// "Scene switching" = show/hide containers
function showPause(): void {
  pauseMenu.visible = true;
  // optionally stop game ticker updates
}

function hidePause(): void {
  pauseMenu.visible = false;
}
```

### Parent-Child Transform Cascade

Transforms cascade from parent to child — position, rotation, scale, and alpha all inherit:

```typescript
const ship = new Container();
ship.x = 400;
ship.y = 300;
ship.rotation = Math.PI / 4;

const turret = new Sprite(turretTexture);
turret.x = 20; // offset from ship's origin, not the world
ship.addChild(turret);

// When ship moves/rotates, turret follows automatically
app.stage.addChild(ship);
```

### Type-Safe Containers (v8 Feature)

PixiJS v8 supports generic container typing:

```typescript
import { Container, Sprite } from 'pixi.js';

// Container that only accepts Sprites as children
const spriteLayer = new Container<Sprite>();
spriteLayer.addChild(new Sprite(texture)); // OK
// spriteLayer.addChild(new Text('hi'));   // TypeScript error
```

---

## Asset Loading with Assets API

PixiJS v8 uses a centralized `Assets` class. Textures no longer self-load — you must load resources upfront:

```typescript
import { Assets } from 'pixi.js';

// Simple load
const heroTexture = await Assets.load('assets/hero.png');

// Load multiple at once
const textures = await Assets.load([
  'assets/hero.png',
  'assets/enemy.png',
  'assets/tileset.png',
]);

// Background loading (returns a promise you can await later)
Assets.backgroundLoad(['assets/level2-bg.png']);
```

### Bundles and Manifests for Larger Games

For production games, organize assets into bundles via a manifest:

```typescript
import { Assets } from 'pixi.js';

const manifest = {
  bundles: [
    {
      name: 'loading-screen',
      assets: [
        { alias: 'logo', src: 'assets/logo.png' },
        { alias: 'loading-bar', src: 'assets/bar.{webp,png}' },
      ],
    },
    {
      name: 'game-level-1',
      assets: [
        { alias: 'hero', src: 'assets/hero.png' },
        { alias: 'enemies', src: 'assets/enemies.json' },  // spritesheet
        { alias: 'tilemap', src: 'assets/level1.json' },
      ],
    },
  ],
};

await Assets.init({
  manifest,
  basePath: '/assets/',
  texturePreference: {
    resolution: window.devicePixelRatio,
    format: ['avif', 'webp', 'png'],  // tries formats in order
  },
});

// Load just what you need for the loading screen
const loadingAssets = await Assets.loadBundle('loading-screen');

// Then load the game level (with progress callback)
await Assets.loadBundle('game-level-1', (progress: number) => {
  console.log(`Loading: ${Math.round(progress * 100)}%`);
});
```

---

## The Ticker: Game Loop

PixiJS provides a `Ticker` for frame-based updates. The `app.ticker` runs automatically:

```typescript
// Basic game loop
app.ticker.add((ticker) => {
  // ticker.deltaTime = frame-rate-independent multiplier (1.0 at 60fps)
  // ticker.elapsedMS = milliseconds since last frame
  player.x += velocity * ticker.deltaTime;
});

// Per-object render callbacks (v8 feature)
hero.onRender = () => {
  // runs every frame during render — good for visual updates
  hero.rotation += 0.02;
};

// Control the ticker
app.ticker.stop();     // pause everything
app.ticker.start();    // resume
app.ticker.speed = 0.5; // slow motion
```

### Building a Game Loop Pattern

Since PixiJS has no scene lifecycle, you typically build your own:

```typescript
interface GameState {
  update(delta: number): void;
  destroy(): void;
}

class GameLoop {
  private currentState: GameState | null = null;

  constructor(private app: Application) {
    app.ticker.add((ticker) => {
      this.currentState?.update(ticker.deltaTime);
    });
  }

  switchTo(state: GameState): void {
    this.currentState?.destroy();
    this.currentState = state;
  }
}

// Usage
class PlayState implements GameState {
  private world = new Container();

  constructor(app: Application) {
    app.stage.addChild(this.world);
    // set up game objects...
  }

  update(delta: number): void {
    // game logic
  }

  destroy(): void {
    this.world.destroy({ children: true });
  }
}
```

---

## Interaction and Input

PixiJS v8 uses a federated event system for pointer (mouse + touch) input. Keyboard input is **not built in** — you handle it via standard DOM events or a library.

### Pointer Events

```typescript
import { Sprite, FederatedPointerEvent } from 'pixi.js';

const button = new Sprite(buttonTexture);
button.eventMode = 'static';  // enable interaction
button.cursor = 'pointer';

button.on('pointerdown', (event: FederatedPointerEvent) => {
  console.log('Clicked at', event.global.x, event.global.y);
});

button.on('pointerover', () => { button.tint = 0xaaaaff; });
button.on('pointerout', () => { button.tint = 0xffffff; });
```

### Event Modes

| Mode | Description | Use Case |
|------|-------------|----------|
| `'none'` | No events, no hit testing | Background tiles, decorations |
| `'passive'` | Only children receive events | Containers that pass events through |
| `'auto'` | Events only if parent is interactive | Default for most objects |
| `'static'` | Full interaction events | Buttons, clickable sprites |
| `'dynamic'` | Events + updates for moving objects | Draggable items, tooltips on moving targets |

### Keyboard Input (DIY)

```typescript
// Simple keyboard handler
const keys: Record<string, boolean> = {};

window.addEventListener('keydown', (e) => { keys[e.code] = true; });
window.addEventListener('keyup', (e) => { keys[e.code] = false; });

app.ticker.add((ticker) => {
  if (keys['ArrowLeft']) player.x -= speed * ticker.deltaTime;
  if (keys['ArrowRight']) player.x += speed * ticker.deltaTime;
  if (keys['Space']) player.jump();
});
```

For more robust input, consider `pixijs-input-devices` (community library with gamepad support).

---

## Ecosystem: What You Pair with PixiJS

Since PixiJS is a renderer, game features come from the ecosystem:

| Need | Library | Notes |
|------|---------|-------|
| **Physics** | Matter.js, Planck.js, or Rapier (WASM) | Rapier is fastest; Matter.js is easiest to integrate |
| **Audio** | PixiJS Sound (`@pixi/sound`) | WebAudio API wrapper with filters, sprites, spatial audio |
| **Tilemaps** | `@pixi/tilemap` | Rectangular tilemap rendering; pair with Tiled editor |
| **UI** | `@pixi/ui` | Buttons, sliders, scrollable containers |
| **Tweening** | `gsap`, `@pixi/motion` | GSAP is industry standard; @pixi/motion is lighter |
| **Particles** | `@pixi/particle-emitter` | GPU-accelerated particle effects |
| **Spine** | `@pixi/spine` | Skeletal animation (Spine editor format) |
| **Input** | `pixijs-input-devices` | Keyboard + gamepad abstraction |

---

## Recommended Project Structure

```
src/
├── main.ts              # Application init, asset loading, state boot
├── states/
│   ├── LoadingState.ts  # Show loading bar, load bundles
│   ├── MenuState.ts     # Title screen, settings
│   └── PlayState.ts     # Main gameplay
├── objects/
│   ├── Player.ts        # extends Container (sprite + physics body)
│   ├── Enemy.ts         # extends Container
│   └── Projectile.ts    # extends Sprite or Container
├── systems/
│   ├── PhysicsSystem.ts # Matter.js / Rapier wrapper
│   ├── InputSystem.ts   # Keyboard + gamepad + touch
│   └── AudioSystem.ts   # @pixi/sound wrapper
├── ui/
│   ├── HUD.ts           # Score, health bar (Container)
│   └── PauseMenu.ts     # Overlay UI (Container)
├── data/
│   ├── manifest.ts      # Asset manifest
│   └── levels.json      # Level definitions
└── utils/
    └── constants.ts     # Physics tuning, sizes, keys
public/
├── assets/
│   ├── sprites/         # Spritesheets and atlases
│   ├── tilemaps/        # Tiled exports
│   └── audio/           # Sound effects and music
└── index.html
```

---

## Rendering Architecture

### Dual Backend (WebGPU + WebGL)

PixiJS v8 automatically selects WebGPU when available, falling back to WebGL2, then WebGL1. An experimental Canvas renderer is available (v8.16+) for environments without GPU support.

**WebGPU advantages:**
- Better performance for scenes with many batch breaks (filters, masks, blend modes).
- More efficient GPU resource management.
- Modern API designed for current hardware.

### Smart Rendering

PixiJS v8 tracks scene graph changes and only re-renders what moved. If nothing changed between frames, no rendering work is done. This makes it exceptionally efficient for games with static backgrounds or UI-heavy screens.

### Texture Atlases

For production, always pack sprites into atlases:
- Reduces draw calls (one texture bind per atlas vs. one per sprite).
- Use TexturePacker, free-tex-packer, or PixiJS AssetPack to generate atlas JSON + spritesheet.
- PixiJS loads atlas JSON natively via `Assets.load('atlas.json')`.

---

## Mobile and Deployment

### Mobile Considerations

- Use `resizeTo: window` with `autoDensity: true` for responsive scaling across devices.
- Touch input works through the same pointer event API as mouse — no separate handling needed.
- Prefer `webp` or `avif` textures with PNG fallback (`texturePreference.format`).
- Audio requires user interaction before playback on iOS/Android — trigger audio init on first tap.
- Test on real devices — mobile GPUs have tighter memory and fill-rate limits.

### Deployment Options

- **Static hosting** (Netlify, Vercel, GitHub Pages) — build with Vite, deploy the `dist/` folder.
- **PWA** — add a service worker for offline play. Vite PWA plugin works well.
- **Native wrapper** — Capacitor or Electron for app store distribution.
- **Itch.io / Game Jams** — zip the build folder and upload.

---

## Key Takeaways for AI Code Generation

1. **`Application.init()` is async in v8** — always `await app.init()` before using the app. Do not pass config to the constructor.
2. **Load assets before using them** — use `Assets.load()` or `Assets.loadBundle()`. Textures do not self-load.
3. **PixiJS has no scenes** — build your own state management using Containers and a state machine pattern.
4. **PixiJS has no physics** — integrate Matter.js, Planck.js, or Rapier separately.
5. **PixiJS has no keyboard input** — use DOM `keydown`/`keyup` events or a library like `pixijs-input-devices`.
6. **Set `eventMode = 'static'`** on any object that needs pointer interaction. The default (`'auto'`) does not register events unless a parent is interactive.
7. **Use `ticker.deltaTime`** for frame-rate-independent movement — never assume 60fps.
8. **Prefer TypeScript** — PixiJS v8 has excellent type definitions including generic Container typing.
9. **Use bundles/manifests for production** — organize assets into logical groups for progressive loading.
10. **Always provide texture format fallbacks** — configure `texturePreference.format` with modern formats first, PNG last.
