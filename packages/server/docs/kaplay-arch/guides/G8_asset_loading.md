# Asset Loading and Resources

> **Category:** guide · **Engine:** Kaplay · **Related:** [Sprites and Animation](G5_sprites_and_animation.md), [Audio and Sound](G6_audio_and_sound.md), [Architecture Overview](../architecture/E1_architecture_overview.md)

Kaplay loads all assets — sprites, sounds, fonts, shaders, JSON data — through a global asset manager. You call `load*()` functions during initialization, and Kaplay tracks progress automatically, showing a default loading screen until everything is ready. This guide covers every loader function, sprite atlases, custom loaders, load-progress tracking, and asset retrieval at runtime.

---

## Core Concept — Load Then Use

Kaplay assets are **asynchronous**. You register them with a `load*()` call, Kaplay downloads and processes them in the background, and the game loop does not start until all registered assets have resolved. If you try to use an asset before it loads, you get a placeholder or an error.

```typescript
import kaplay from "kaplay";

const k = kaplay();

// 1. Register assets (order doesn't matter)
k.loadSprite("player", "/sprites/player.png");
k.loadSound("jump", "/audio/jump.ogg");
k.loadFont("pixel", "/fonts/pixel.ttf");

// 2. Use them once the game loop starts
k.scene("main", () => {
  k.add([
    k.sprite("player"),
    k.pos(100, 100),
  ]);
});

k.go("main");
```

---

## Loading Sprites

### Basic Sprites — `loadSprite()`

```typescript
// Simple image
k.loadSprite("hero", "/sprites/hero.png");

// Spritesheet with slice config
k.loadSprite("hero", "/sprites/hero.png", {
  sliceX: 8,          // 8 columns
  sliceY: 4,          // 4 rows
  anims: {
    idle:  { from: 0,  to: 3,  loop: true, speed: 6 },
    run:   { from: 8,  to: 13, loop: true, speed: 10 },
    jump:  { from: 16, to: 19, loop: false, speed: 8 },
  },
});
```

**`LoadSpriteOpt` fields:**

| Field | Type | Description |
|---|---|---|
| `sliceX` | `number` | Columns in the spritesheet |
| `sliceY` | `number` | Rows in the spritesheet |
| `anims` | `Record<string, SpriteAnim>` | Named animation definitions |
| `frames` | `Quad[]` | Manual frame UV rects (advanced) |

### Sprite Atlases — `loadSpriteAtlas()`

When multiple sprites live on a single texture, use an atlas to slice them:

```typescript
// JSON atlas (e.g. exported from TexturePacker, Aseprite)
k.loadSpriteAtlas("/sprites/atlas.png", "/sprites/atlas.json");

// Inline atlas definition
k.loadSpriteAtlas("/sprites/tileset.png", {
  grass: { x: 0, y: 0, width: 16, height: 16 },
  stone: { x: 16, y: 0, width: 16, height: 16 },
  water: { x: 32, y: 0, width: 16, height: 16, anims: {
    flow: { from: 0, to: 2, loop: true, speed: 4 },
  }},
});
```

### Aseprite Integration — `loadAseprite()`

Load an Aseprite-exported spritesheet and its JSON metadata in one call. Frame tags in the `.json` become Kaplay animation names:

```typescript
k.loadAseprite("enemy", "/sprites/enemy.png", "/sprites/enemy.json");
```

### Built-in Debug Sprite — `loadBean()`

`loadBean()` loads the built-in "bean" sprite, useful for prototyping without art assets:

```typescript
k.loadBean();

k.scene("test", () => {
  k.add([k.sprite("bean"), k.pos(200, 200)]);
});
```

---

## Loading Fonts

### TrueType / OpenType / WOFF — `loadFont()`

```typescript
k.loadFont("gameui", "/fonts/gameui.ttf");
k.loadFont("title", "/fonts/title.woff2");
```

Any format the browser's `FontFace` API accepts works here — TTF, OTF, WOFF, WOFF2.

### Bitmap Fonts — `loadBitmapFont()`

For pixel-art games, bitmap fonts give a crisp, consistent look:

```typescript
k.loadBitmapFont("retro", "/fonts/retro.png", 8, 8);
// Each glyph is 8×8 pixels in a grid layout
```

---

## Loading Other Assets

### JSON Data — `loadJSON()`

```typescript
k.loadJSON("levels", "/data/levels.json");

// Retrieve later
const levels = k.getAsset("levels");
```

### Shaders — `loadShader()` / `loadShaderURL()`

```typescript
// Inline GLSL
k.loadShader("outline", null, `
  uniform float u_time;
  // ... fragment shader source
`);

// External files
k.loadShaderURL("crt", "/shaders/crt.vert", "/shaders/crt.frag");
```

---

## Load Configuration

### Base Path — `loadRoot()`

Set a root URL prefix for all subsequent `load*()` calls. Useful when assets live on a CDN or a sub-directory:

```typescript
k.loadRoot("https://cdn.example.com/assets/");

// Now resolves to https://cdn.example.com/assets/sprites/hero.png
k.loadSprite("hero", "sprites/hero.png");
```

Call `loadRoot()` again with a different path to change the prefix mid-setup.

### Custom Async Loaders — `load()`

Register an arbitrary async operation to block the loading screen:

```typescript
k.load(new Promise((resolve) => {
  fetch("/api/game-config")
    .then((res) => res.json())
    .then((data) => {
      // store data however you like
      resolve(data);
    });
}));
```

This is useful for fetching remote config, leaderboard data, or procedurally generating assets before the game starts.

---

## Loading Progress

### Querying Progress — `loadProgress()`

Returns a number from `0.0` to `1.0` representing global asset load progress:

```typescript
// In a custom loading scene or overlay
const progress = k.loadProgress();
console.log(`Loaded: ${Math.floor(progress * 100)}%`);
```

### Custom Loading Screen

You can override the default loading screen by providing a `loadingScreen` callback in the `kaplay()` config:

```typescript
const k = kaplay({
  loadingScreen: true, // default loading screen enabled
});
```

To fully customize, draw your own progress UI in the loading phase using `loadProgress()`.

---

## Retrieving Assets at Runtime

After assets are loaded, you can retrieve the underlying data with getter functions:

| Function | Returns |
|---|---|
| `getSprite(name)` | `SpriteData \| null` |
| `getSound(name)` | `SoundData \| null` |
| `getFont(name)` | `FontData \| null` |
| `getBitmapFont(name)` | `BitmapFontData \| null` |
| `getShader(name)` | `Shader \| null` |
| `getAsset(name)` | `any` — for `loadJSON()` etc. |

These are mainly useful for advanced use cases — normally, you just reference assets by name in components like `k.sprite("hero")`.

---

## Best Practices

### Organize by Category

```
public/
  sprites/
    player.png
    enemies.json    # atlas
    enemies.png
  audio/
    sfx/
    music/
  fonts/
  shaders/
  data/
```

### Use `loadRoot()` for Portability

Switching from local to CDN hosting becomes a one-line change.

### Prefer Sprite Atlases for Production

Individual sprite files mean individual HTTP requests. Packing sprites into atlases with tools like TexturePacker or free-tex-packer reduces network round-trips and improves load time — critical for mobile web games.

### Preload Versus Lazy Load

Kaplay blocks the game start on all registered loaders. For very large games, consider loading only essential assets upfront and loading level-specific assets at scene transitions using `load()` with a loading overlay.

### Browser and Mobile Considerations

- **WOFF2** fonts offer the best compression for web delivery.
- **OGG Vorbis** audio is not supported in Safari — provide MP3 fallback.
- **WebP** and **AVIF** sprites reduce download size on supporting browsers, but always test on your target platforms.
- On mobile, total asset size directly impacts initial load time over cellular networks. Aim for < 5 MB for the initial load.

---

## Cross-Framework Comparison

| Concept | Kaplay | Phaser | Excalibur | PixiJS |
|---|---|---|---|---|
| Load a sprite | `loadSprite(name, url)` | `this.load.image(key, url)` | `new ImageSource(url)` | `Assets.load(url)` |
| Sprite atlas | `loadSpriteAtlas()` | `this.load.atlas()` | Manual via `SpriteSheet` | `Assets.load(spritesheet)` |
| Progress | `loadProgress()` | `this.load.on('progress')` | Loader progress bar | `Assets.load()` promise |
| Audio | `loadSound()` / `loadMusic()` | `this.load.audio()` | `new Sound(url)` | External (Howler.js, etc.) |
| Scene-scoped loading | Use `load()` in scene | Per-scene `preload()` | `scene.onInitialize()` loader | Manual |
