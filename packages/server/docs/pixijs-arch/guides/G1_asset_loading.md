# G1 — PixiJS v8 Asset Loading & Management

> **Category:** guide · **Engine:** PixiJS · **Related:** [E1 Architecture Overview](../architecture/E1_architecture_overview.md) · [G2 Sprites & Animation](G2_sprites_animation.md)

---

## Overview

PixiJS v8 replaced the legacy `Loader` class with a centralized `Assets` API. Every texture, spritesheet, sound, and font must be explicitly loaded before use — textures no longer self-load from URLs. This guide covers the full asset pipeline: single loads, bundles, manifests, progress tracking, background loading, and cache management.

Understanding the Assets API is essential because PixiJS will silently show nothing (or throw) if you reference a texture that hasn't been loaded yet. There is no `preload()` lifecycle hook like Phaser — you manage loading timing yourself.

---

## Quick Start: Loading a Single Asset

The simplest case — load one texture and create a sprite:

```typescript
import { Application, Assets, Sprite } from 'pixi.js';

const app = new Application();
await app.init({ background: '#1a1a2e', resizeTo: window });
document.body.appendChild(app.canvas);

// Load returns the loaded resource (Texture, Spritesheet, etc.)
const heroTexture = await Assets.load('assets/hero.png');

const hero = new Sprite(heroTexture);
hero.anchor.set(0.5);
hero.x = app.screen.width / 2;
hero.y = app.screen.height / 2;
app.stage.addChild(hero);
```

**Key behavior:** `Assets.load()` is async and returns the loaded resource directly. If the asset has already been loaded, it returns the cached version immediately (still a Promise, but resolves instantly).

---

## Loading Multiple Assets

Pass an array to `Assets.load()` to load several assets in parallel:

```typescript
// Load multiple assets at once
const textures = await Assets.load([
  'assets/hero.png',
  'assets/enemy.png',
  'assets/tileset.png',
  'assets/ui-atlas.json',
]);

// Access by URL key
const hero = new Sprite(textures['assets/hero.png']);
```

### Using Aliases

Aliases let you reference assets by friendly names instead of file paths:

```typescript
// Register aliases before loading
Assets.add({ alias: 'hero', src: 'assets/sprites/hero.png' });
Assets.add({ alias: 'enemy', src: 'assets/sprites/enemy.png' });
Assets.add({ alias: 'tileset', src: 'assets/maps/tileset.png' });

// Load by alias
await Assets.load(['hero', 'enemy', 'tileset']);

// Create sprites using the alias
const heroSprite = Sprite.from('hero');  // looks up the alias in the cache
```

---

## Bundles: Organizing Assets by Game State

For production games, group assets into **bundles** — logical collections that map to your game states (loading screen, menu, level 1, etc.):

```typescript
import { Assets } from 'pixi.js';

// Define bundles
Assets.addBundle('loading-screen', [
  { alias: 'logo', src: 'assets/logo.png' },
  { alias: 'loading-bar', src: 'assets/loading-bar.png' },
]);

Assets.addBundle('game-level-1', [
  { alias: 'hero', src: 'assets/hero.png' },
  { alias: 'enemies', src: 'assets/enemies.json' },      // spritesheet atlas
  { alias: 'level1-map', src: 'assets/level1.json' },
  { alias: 'bgm', src: 'assets/bgm.mp3' },
]);

Assets.addBundle('game-level-2', [
  { alias: 'boss', src: 'assets/boss.png' },
  { alias: 'level2-map', src: 'assets/level2.json' },
]);

// Load the loading screen first (small, fast)
await Assets.loadBundle('loading-screen');
showLoadingScreen();

// Then load level 1 with progress tracking
await Assets.loadBundle('game-level-1', (progress: number) => {
  updateLoadingBar(progress); // 0.0 → 1.0
});

hideLoadingScreen();
startGame();
```

### Why Bundles Matter

1. **Progressive loading** — load only what you need for the current screen. Don't front-load the entire game.
2. **Progress tracking** — the progress callback only works at the bundle level, not individual assets.
3. **Logical grouping** — makes it clear which assets belong to which game state.
4. **Memory management** — you can unload entire bundles when done with a level.

---

## Manifests: The Production Approach

For larger games, define all bundles in a **manifest** — a single data structure that describes every asset in your game:

```typescript
import { Assets } from 'pixi.js';

const manifest = {
  bundles: [
    {
      name: 'loading-screen',
      assets: [
        { alias: 'logo', src: 'assets/logo.{webp,png}' },
        { alias: 'bar', src: 'assets/bar.png' },
      ],
    },
    {
      name: 'game-core',
      assets: [
        { alias: 'hero', src: 'assets/hero.{webp,png}' },
        { alias: 'hero-atlas', src: 'assets/hero-atlas.json' },
        { alias: 'tiles', src: 'assets/tileset.{webp,png}' },
      ],
    },
    {
      name: 'audio',
      assets: [
        { alias: 'bgm', src: 'assets/bgm.{ogg,mp3}' },
        { alias: 'sfx-jump', src: 'assets/jump.{ogg,mp3}' },
        { alias: 'sfx-coin', src: 'assets/coin.{ogg,mp3}' },
      ],
    },
  ],
};

// Initialize with manifest and preferences
await Assets.init({
  manifest,
  basePath: '/game/',
  texturePreference: {
    resolution: window.devicePixelRatio,
    format: ['avif', 'webp', 'png'],  // tries each format in order
  },
});

// Load bundles by name
await Assets.loadBundle('loading-screen');
await Assets.loadBundle('game-core', onProgress);
await Assets.loadBundle('audio');
```

### Format Resolution with `{webp,png}` Syntax

The `{webp,png}` pattern tells PixiJS to try each format in the order specified by `texturePreference.format`. This means:

- On browsers that support WebP/AVIF → smaller file sizes, faster loads.
- On older browsers → automatic PNG fallback.
- You provide both file formats in your `assets/` directory.

---

## Background Loading

Pre-fetch assets for upcoming levels without blocking the current frame:

```typescript
// Start loading level 2 assets in the background while level 1 plays
Assets.backgroundLoadBundle('game-level-2');

// Later, when the player reaches level 2, this is instant (or nearly so)
await Assets.loadBundle('game-level-2');
```

Background loading uses `requestIdleCallback` internally — it loads assets during idle frames without causing jank. This is ideal for:

- Pre-loading the next level while the current level plays.
- Loading optional assets (high-res textures, bonus content).
- Warming up audio files that will be needed soon.

---

## Cache Management

All loaded assets are cached by PixiJS. You can query and manage the cache:

```typescript
// Check if an asset is already loaded
const isLoaded = Assets.cache.has('hero');

// Get a cached asset without loading
const texture = Assets.cache.get('hero');

// Unload assets to free memory
await Assets.unload('hero');

// Unload an entire bundle
await Assets.unloadBundle('game-level-1');
```

### When to Unload

- **Level transitions** — unload the previous level's bundle before loading the next one.
- **Memory pressure on mobile** — mobile devices have tighter GPU memory limits. Unload textures you're done with.
- **Never unload shared assets** — if multiple levels use the same hero spritesheet, keep it loaded.

```typescript
// Level transition pattern
async function goToLevel(levelNum: number): Promise<void> {
  const prevBundle = `game-level-${levelNum - 1}`;
  const nextBundle = `game-level-${levelNum}`;

  // Unload previous level (skip shared bundles like 'game-core')
  if (levelNum > 1) {
    await Assets.unloadBundle(prevBundle);
  }

  // Load next level (may already be background-loaded)
  await Assets.loadBundle(nextBundle, updateLoadingBar);
}
```

---

## Spritesheets and Texture Atlases

PixiJS natively supports spritesheet JSON (TexturePacker, free-tex-packer, Aseprite export):

```typescript
// Load a spritesheet atlas — PixiJS parses the JSON and creates
// individual Texture objects for each frame automatically
await Assets.load('assets/hero-atlas.json');

// Access individual frames by their name in the atlas JSON
const idleFrame = Sprite.from('hero-idle-01');
const walkFrame = Sprite.from('hero-walk-03');
```

### Spritesheet JSON Format

PixiJS expects the standard TexturePacker JSON Hash format:

```json
{
  "frames": {
    "hero-idle-01": {
      "frame": { "x": 0, "y": 0, "w": 32, "h": 48 },
      "sourceSize": { "w": 32, "h": 48 }
    },
    "hero-walk-01": {
      "frame": { "x": 32, "y": 0, "w": 32, "h": 48 },
      "sourceSize": { "w": 32, "h": 48 }
    }
  },
  "meta": {
    "image": "hero-atlas.png",
    "size": { "w": 256, "h": 256 },
    "scale": 1
  }
}
```

**Best practice:** Always use texture atlases in production. One atlas = one draw call for all sprites in that atlas, versus one draw call per individual texture. This is the single biggest performance optimization for 2D games.

---

## Loading Bitmap Fonts

```typescript
// Load a bitmap font (BMFont .fnt + .png format)
await Assets.load('assets/fonts/pixel.fnt');

// Use it with BitmapText
import { BitmapText } from 'pixi.js';

const scoreText = new BitmapText({
  text: 'Score: 0',
  style: {
    fontFamily: 'pixel',  // matches the font name in the .fnt file
    fontSize: 24,
  },
});
app.stage.addChild(scoreText);
```

### Web Fonts (TTF/OTF/WOFF2)

```typescript
// Load a web font
await Assets.load('assets/fonts/gameFont.woff2');

// Use with standard Text (not BitmapText)
import { Text, TextStyle } from 'pixi.js';

const label = new Text({
  text: 'Hello World',
  style: new TextStyle({
    fontFamily: 'gameFont',
    fontSize: 32,
    fill: 0xffffff,
  }),
});
```

**Guidance:** Use BitmapText for frequently-updated text (scores, timers, damage numbers) — it's much faster. Use Text for static labels or when you need rich formatting.

---

## Complete Loading Screen Pattern

Putting it all together — a production-ready loading flow for a PixiJS game:

```typescript
import { Application, Assets, Container, Graphics, Text, TextStyle, Sprite } from 'pixi.js';

const app = new Application();
await app.init({
  background: '#1a1a2e',
  resizeTo: window,
  antialias: true,
  resolution: window.devicePixelRatio || 1,
  autoDensity: true,
});
document.getElementById('game')!.appendChild(app.canvas);

// --- Phase 1: Init manifest ---
await Assets.init({
  manifest: {
    bundles: [
      {
        name: 'preload',
        assets: [
          { alias: 'logo', src: 'assets/logo.png' },
        ],
      },
      {
        name: 'game',
        assets: [
          { alias: 'hero', src: 'assets/hero-atlas.json' },
          { alias: 'tiles', src: 'assets/tileset.{webp,png}' },
          { alias: 'bgm', src: 'assets/bgm.{ogg,mp3}' },
        ],
      },
    ],
  },
  texturePreference: {
    format: ['webp', 'png'],
    resolution: window.devicePixelRatio,
  },
});

// --- Phase 2: Tiny preload (loading screen assets) ---
await Assets.loadBundle('preload');

// --- Phase 3: Show loading screen, load game bundle ---
const loadingScreen = new Container();
app.stage.addChild(loadingScreen);

const logo = Sprite.from('logo');
logo.anchor.set(0.5);
logo.x = app.screen.width / 2;
logo.y = app.screen.height / 2 - 60;
loadingScreen.addChild(logo);

const barBg = new Graphics().rect(200, app.screen.height / 2 + 20, 400, 20).fill(0x333333);
loadingScreen.addChild(barBg);

const barFill = new Graphics();
loadingScreen.addChild(barFill);

const loadingText = new Text({
  text: 'Loading... 0%',
  style: new TextStyle({ fill: 0xffffff, fontSize: 16 }),
});
loadingText.anchor.set(0.5);
loadingText.x = app.screen.width / 2;
loadingText.y = app.screen.height / 2 + 60;
loadingScreen.addChild(loadingText);

await Assets.loadBundle('game', (progress: number) => {
  barFill.clear().rect(200, app.screen.height / 2 + 20, 400 * progress, 20).fill(0x44aaff);
  loadingText.text = `Loading... ${Math.round(progress * 100)}%`;
});

// --- Phase 4: Tear down loading screen, start game ---
loadingScreen.destroy({ children: true });
startGame(app);
```

---

## Common Mistakes

1. **Forgetting `await` on `Assets.load()`** — the load is async. Using a texture before it's loaded produces a blank sprite or an error.
2. **Loading individual files instead of atlases** — each separate texture is a separate draw call. Pack sprites into atlases for production.
3. **Not providing format fallbacks** — using only `.webp` will break on older Safari. Always include a `.png` fallback.
4. **Loading everything up front** — on mobile, loading 50MB of assets before showing anything is a bad experience. Use bundles and progressive loading.
5. **Forgetting `Assets.init()` when using manifests** — if you pass a manifest, you must call `Assets.init()` before `Assets.loadBundle()`.

---

## Comparison: Asset Loading Across Frameworks

| Concept | PixiJS v8 | Phaser 3 | Kaplay | Excalibur |
|---------|-----------|----------|--------|-----------|
| Loading API | `Assets.load()` / `Assets.loadBundle()` | `this.load.*` in `preload()` | `loadSprite()`, `loadSound()` etc. | `new Loader()` + resource classes |
| When to load | Any time (async) | Only in scene `preload()` | Before `k.go()` | Before `game.start(loader)` |
| Progress tracking | Bundle-level callback | `this.load.on('progress')` | None built-in | Loader progress bar |
| Cache scope | Global singleton | Global texture cache | Global | Global |
| Format negotiation | `{webp,png}` syntax | Manual per-call | None | None |
| Background loading | `Assets.backgroundLoad()` | Manual via lazy `preload()` | None | None |

---

## Key Takeaways

1. **`Assets.load()` is your primary API** — call it with a path, alias, or array. Always `await` it before using the returned textures.
2. **Use bundles for production games** — group assets by game state, load progressively, and track progress at the bundle level.
3. **Use aliases to decouple code from file paths** — your game code should reference `'hero'`, not `'assets/sprites/characters/hero-v3-final.png'`.
4. **Use texture atlases** — this is the single most impactful performance optimization. One atlas = one GPU draw call.
5. **Provide format fallbacks** — use the `{webp,png}` syntax in manifests for automatic browser-appropriate format selection.
6. **Background-load upcoming content** — call `Assets.backgroundLoadBundle()` for the next level while the current one plays.
7. **Unload assets you're done with** — especially on mobile where GPU memory is limited. Use `Assets.unloadBundle()` during level transitions.
