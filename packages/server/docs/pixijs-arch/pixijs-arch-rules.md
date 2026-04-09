# PixiJS v8 — AI Rules

Engine-specific rules for projects using PixiJS v8. These supplement the engine-agnostic rules in `docs/core/ai-workflow/gamedev-rules.md`.

---

## Architecture Context

### Tech Stack

- **Library:** PixiJS v8 (2D rendering engine, not a full game framework)
- **Language:** TypeScript (preferred) or JavaScript
- **Renderer:** WebGPU with WebGL2/WebGL1 fallback (automatic)
- **Physics:** None built-in — use Matter.js, Planck.js, or Rapier
- **Audio:** `@pixi/sound` (optional, WebAudio API)
- **Build:** Vite (recommended), webpack, or Parcel
- **Key Libraries:**
  - `@pixi/sound` (audio playback with filters)
  - `@pixi/tilemap` (tilemap rendering)
  - `@pixi/ui` (UI components)
  - `@pixi/particle-emitter` (GPU particles)
  - TexturePacker / free-tex-packer (sprite atlas generation)
  - Capacitor (mobile native wrapper)

### Project Structure Conventions

```
src/
├── main.ts              # Application.init() + asset loading + state boot
├── states/              # Game states (Containers with lifecycle methods)
├── objects/             # Game object classes (extend Container/Sprite)
├── systems/             # Physics, input, audio wrappers
├── ui/                  # HUD, menus (Containers)
├── data/                # Manifests, level data, constants
└── utils/               # Helper functions
public/
└── assets/              # Sprites, tilemaps, audio
```

---

## Code Generation Rules

### Application Init: Always Async

```typescript
// CORRECT — v8 requires async init
const app = new Application();
await app.init({
  background: '#1a1a2e',
  resizeTo: window,
  resolution: window.devicePixelRatio || 1,
  autoDensity: true,
});
document.body.appendChild(app.canvas);

// WRONG — do not pass config to the constructor (v7 pattern)
const app = new Application({ width: 800, height: 600 }); // BROKEN in v8
```

### Asset Loading: Always Load Before Use

```typescript
// CORRECT — load assets with Assets API, then create sprites
import { Assets, Sprite } from 'pixi.js';

const texture = await Assets.load('hero.png');
const hero = new Sprite(texture);

// CORRECT — use bundles for organized loading
await Assets.init({ manifest });
await Assets.loadBundle('game-level-1');
const hero = Sprite.from('hero'); // alias from manifest

// WRONG — Texture.from() without loading first
const hero = Sprite.from('hero.png'); // may fail if not pre-loaded
```

### Containers: Use for Scene Management

```typescript
// CORRECT — Containers as "scenes" with show/hide
const gameWorld = new Container();
const pauseMenu = new Container();
app.stage.addChild(gameWorld);
app.stage.addChild(pauseMenu);
pauseMenu.visible = false;

// CORRECT — type-safe containers (v8 feature)
const spriteLayer = new Container<Sprite>();

// WRONG — no built-in Scene class; do not look for one
// import { Scene } from 'pixi.js'; // does not exist
```

### Game Loop: Use Ticker with deltaTime

```typescript
// CORRECT — frame-rate-independent updates
app.ticker.add((ticker) => {
  player.x += speed * ticker.deltaTime;
});

// CORRECT — per-object render callbacks
sprite.onRender = () => {
  sprite.rotation += 0.01;
};

// WRONG — assuming 60fps without deltaTime
app.ticker.add(() => {
  player.x += 5; // framerate-dependent — will run at different speeds
});
```

### Interaction: Set eventMode Explicitly

```typescript
// CORRECT — enable interaction with eventMode
button.eventMode = 'static';
button.cursor = 'pointer';
button.on('pointerdown', handleClick);

// WRONG — expecting interaction without eventMode
button.on('pointerdown', handleClick); // events won't fire with default 'auto'
```

### Keyboard Input: Use DOM Events

```typescript
// CORRECT — PixiJS has no built-in keyboard; use DOM events
const keys: Record<string, boolean> = {};
window.addEventListener('keydown', (e) => { keys[e.code] = true; });
window.addEventListener('keyup', (e) => { keys[e.code] = false; });

app.ticker.add((ticker) => {
  if (keys['ArrowLeft']) player.x -= speed * ticker.deltaTime;
});

// WRONG — looking for PixiJS keyboard API
// this.input.keyboard.createCursorKeys(); // this is Phaser, not PixiJS
```

### Physics: Integrate Externally

```typescript
// CORRECT — use Matter.js or similar alongside PixiJS
import Matter from 'matter-js';

const engine = Matter.Engine.create();
const world = engine.world;

// Sync physics bodies to PixiJS sprites in the ticker
app.ticker.add(() => {
  Matter.Engine.update(engine, app.ticker.deltaMS);
  sprite.x = body.position.x;
  sprite.y = body.position.y;
  sprite.rotation = body.angle;
});

// WRONG — looking for PixiJS physics API
// app.physics.add.sprite(); // this is Phaser, not PixiJS
```

### Audio: Use @pixi/sound

```typescript
// CORRECT — use @pixi/sound for audio
import { sound } from '@pixi/sound';

sound.add('bgm', 'assets/music.mp3');
sound.play('bgm', { loop: true, volume: 0.5 });

// Or load via Assets (if @pixi/sound is installed, audio files resolve automatically)
await Assets.load('assets/sfx-jump.mp3');
sound.play('assets/sfx-jump.mp3');
```

### TypeScript: Use PixiJS Types

```typescript
// CORRECT — use PixiJS type imports
import { Sprite, Container, Texture, FederatedPointerEvent } from 'pixi.js';

private hero!: Sprite;
private world!: Container;

button.on('pointerdown', (event: FederatedPointerEvent) => { ... });

// WRONG — untyped or using 'any'
private hero: any;
```

---

## Common Pitfalls

1. **Passing config to `new Application()` constructor** — in v8, the constructor takes no args. Use `await app.init(config)` instead.
2. **Forgetting to load assets before creating sprites** — `Sprite.from('key')` only works if the asset was previously loaded with `Assets.load()` or `Assets.loadBundle()`.
3. **Not setting `eventMode`** — pointer events silently fail if `eventMode` is not set to `'static'` or `'dynamic'`.
4. **Looking for built-in scenes, physics, or keyboard** — PixiJS is a renderer. Build or import these yourself.
5. **Using `requestAnimationFrame` manually** — use `app.ticker` instead. It handles frame timing, deltaTime, and pause/resume.
6. **Not calling `destroy()` on removed objects** — Containers and Sprites hold GPU resources. Call `.destroy({ children: true })` when removing them permanently.
7. **Ignoring `resolution` and `autoDensity`** — without these, games look blurry on retina/HiDPI displays.
8. **Single texture per sprite in production** — always pack sprites into atlases for fewer draw calls and better performance.
