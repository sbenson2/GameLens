# Asset Loading and Resources

> **Category:** guide · **Engine:** Excalibur · **Related:** [Sprites and Animation](G5_sprites_and_animation.md), [Audio and Sound](G6_audio_and_sound.md), [Scene Management](G2_scene_management.md), [Architecture Overview](../architecture/E1_architecture_overview.md)

Excalibur uses a typed resource system where every asset — images, sounds, fonts, generic data — is represented by a class instance (`ImageSource`, `Sound`, `FontSource`, `Resource`). Resources are grouped into a `Loader` and passed to `engine.start()` which displays a progress bar until all assets are ready. Excalibur also supports scene-specific loaders for loading assets on demand at scene transitions. This guide covers all resource types, the Loader, scene-level loading, custom resources, and production best practices.

---

## Core Concept — Resource → Loader → Start

Every asset follows the same three-step pattern:

1. **Declare** — Create a resource instance with a URL.
2. **Register** — Add it to a `Loader`.
3. **Load** — Pass the loader to `engine.start()`.

```typescript
import { Engine, Loader, ImageSource, Sound } from 'excalibur';

// 1. Declare resources
const heroImage = new ImageSource('./sprites/hero.png');
const jumpSound = new Sound('./audio/jump.mp3', './audio/jump.wav');

// 2. Register in a loader
const loader = new Loader([heroImage, jumpSound]);

// 3. Start the engine — shows loading screen automatically
const game = new Engine({ width: 800, height: 600 });
await game.start(loader);

// Now safe to use heroImage.toSprite(), jumpSound.play(), etc.
```

---

## Resource Types

### `ImageSource` — Images and Spritesheets

`ImageSource` loads an external image and provides methods to convert it into sprites and sprite sheets:

```typescript
import { ImageSource, SpriteSheet } from 'excalibur';

const playerSheet = new ImageSource('./sprites/player.png');

// After loading — create a sprite sheet
const spriteSheet = SpriteSheet.fromImageSource({
  image: playerSheet,
  grid: {
    rows: 4,
    columns: 8,
    spriteWidth: 32,
    spriteHeight: 32,
  },
});

// Single sprite from the image
const heroSprite = playerSheet.toSprite();

// Single sprite with options
const croppedSprite = playerSheet.toSprite({
  sourceView: { x: 0, y: 0, width: 32, height: 32 },
});
```

**Key methods:**

| Method | Returns | Description |
|---|---|---|
| `toSprite(options?)` | `Sprite` | Convert the full image (or a region) to a sprite |
| `isLoaded()` | `boolean` | Check if the image has finished loading |
| `load()` | `Promise<HTMLImageElement>` | Manually trigger loading outside a Loader |

### `Sound` — Audio

Provide multiple file paths for codec fallback — the browser plays the first format it supports:

```typescript
import { Sound } from 'excalibur';

// MP3 + WAV fallback for broad compatibility
const bgMusic = new Sound('./audio/music.mp3', './audio/music.wav');
const coinSfx = new Sound('./audio/coin.mp3', './audio/coin.wav');
```

After loading, use `play()`, `stop()`, `loop`, `volume`, etc. See the [Audio and Sound guide](G6_audio_and_sound.md) for playback details.

### `FontSource` — Custom Fonts

Load TTF, OTF, WOFF, or WOFF2 font files and convert them into Excalibur `Font` objects:

```typescript
import { FontSource, Font } from 'excalibur';

const pixelFontSource = new FontSource('./fonts/pixel.ttf', 'PixelFont');

// Add to loader alongside other resources
const loader = new Loader([heroImage, pixelFontSource]);
await game.start(loader);

// Convert to a Font for use in Labels
const pixelFont: Font = pixelFontSource.toFont({
  size: 24,
  color: ex.Color.White,
});
```

**`toFont()` options override any defaults** set on the `FontSource`. You can create multiple `Font` instances from a single `FontSource` at different sizes:

```typescript
const titleFont = pixelFontSource.toFont({ size: 48 });
const bodyFont = pixelFontSource.toFont({ size: 16 });
```

### `Resource<T>` — Generic Data

Load arbitrary data (JSON, XML, text) with the generic `Resource` class:

```typescript
import { Resource } from 'excalibur';

const levelData = new Resource<string>('./data/level1.json', 'json');

// After loading
const parsed = JSON.parse(levelData.data);
```

---

## The Loader

### Default Loader

The built-in `Loader` displays a progress bar with the Excalibur logo. Pass an array of resources:

```typescript
const loader = new Loader([heroImage, jumpSound, pixelFontSource, levelData]);
await game.start(loader);
```

### Adding Resources Dynamically

```typescript
const loader = new Loader();
loader.addResource(heroImage);
loader.addResource(jumpSound);
loader.addResources([pixelFontSource, levelData]);
```

### Suppressing the Play Button

By default, the Loader shows a "Play" button after loading to handle browser autoplay restrictions. You can suppress it:

```typescript
const loader = new Loader();
loader.suppressPlayButton = true;
```

**Warning:** Suppressing the play button means sounds may not play until the user's first interaction with the page, due to browser autoplay policies.

### Custom Loading Screen

Override the Loader's draw method for a fully custom look:

```typescript
class MyLoader extends Loader {
  onDraw(ctx: CanvasRenderingContext2D) {
    // Clear
    ctx.fillStyle = '#1a1a2e';
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

    // Progress bar
    const barWidth = 400;
    const barHeight = 20;
    const x = (this.canvas.width - barWidth) / 2;
    const y = this.canvas.height / 2;

    ctx.fillStyle = '#333';
    ctx.fillRect(x, y, barWidth, barHeight);

    ctx.fillStyle = '#e94560';
    ctx.fillRect(x, y, barWidth * this.progress, barHeight);

    // Percentage text
    ctx.fillStyle = '#fff';
    ctx.font = '16px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(
      `${Math.floor(this.progress * 100)}%`,
      this.canvas.width / 2,
      y + barHeight + 30
    );
  }
}
```

---

## Scene-Specific Loading

You do not have to load every asset upfront. Excalibur supports loading additional assets when transitioning to a new scene:

```typescript
import { Scene, Engine, ImageSource, Loader } from 'excalibur';

class Level2Scene extends Scene {
  private bossImage = new ImageSource('./sprites/boss.png');

  onInitialize(engine: Engine) {
    const sceneLoader = new Loader([this.bossImage]);
    engine.start(sceneLoader).then(() => {
      // Boss image is now available
      const boss = new ex.Actor({
        pos: ex.vec(400, 200),
      });
      boss.graphics.use(this.bossImage.toSprite());
      this.add(boss);
    });
  }
}
```

This pattern is useful for large games where loading everything upfront would create unacceptably long wait times.

### Scene Transition + Loader API

Excalibur's scene transition system integrates with loaders. When you transition to a scene with a loader, the transition animation plays while assets load:

```typescript
game.goToScene('level2', {
  destinationIn: new ex.FadeInOut({ duration: 500 }),
});
```

The engine automatically waits for the scene's resources to finish loading before completing the transition.

---

## Centralized Resource Registry Pattern

For larger projects, define all resources in a single file to avoid duplication and make them easy to find:

```typescript
// resources.ts
import { ImageSource, Sound, FontSource } from 'excalibur';

export const Resources = {
  // Sprites
  Player: new ImageSource('./sprites/player.png'),
  Enemy: new ImageSource('./sprites/enemy.png'),
  Tileset: new ImageSource('./sprites/tileset.png'),

  // Audio
  BgMusic: new Sound('./audio/bg.mp3', './audio/bg.wav'),
  JumpSfx: new Sound('./audio/jump.mp3'),
  CoinSfx: new Sound('./audio/coin.mp3'),

  // Fonts
  GameFont: new FontSource('./fonts/game.ttf', 'GameFont'),
} as const;

// All resources as an array for the Loader
export const AllResources = Object.values(Resources);
```

```typescript
// main.ts
import { Engine, Loader } from 'excalibur';
import { Resources, AllResources } from './resources';

const game = new Engine({ width: 800, height: 600 });
const loader = new Loader(AllResources);

await game.start(loader);

// Use anywhere via import
const sprite = Resources.Player.toSprite();
```

This pattern gives you:

- **Type-safe resource access** — `Resources.Player` is always an `ImageSource`.
- **Single source of truth** — no duplicate `new ImageSource()` calls.
- **Easy loader construction** — `Object.values(Resources)` gives you everything.

---

## Checking Load State

Every resource exposes an `isLoaded()` method:

```typescript
if (heroImage.isLoaded()) {
  actor.graphics.use(heroImage.toSprite());
} else {
  console.warn('Hero image not loaded yet!');
}
```

You can also manually load a single resource without a Loader:

```typescript
await heroImage.load();
// Now safe to use immediately
```

---

## Best Practices

### Always Provide Audio Fallbacks

Safari does not support OGG Vorbis. Always provide at least two formats:

```typescript
new Sound('./audio/sfx.mp3', './audio/sfx.wav');
```

### Use the Resource Registry for Projects > 10 Assets

The centralized registry pattern prevents duplicated loads and makes refactoring painless.

### Lazy-Load Level-Specific Assets

For games with multiple levels, only load what the current level needs. Use scene-specific loaders to defer heavy assets like boss sprites, cutscene images, or level music.

### Handle Load Errors Gracefully

```typescript
const image = new ImageSource('./sprites/hero.png');

image.events.on('error', (err) => {
  console.error('Failed to load hero:', err);
  // Fall back to a placeholder sprite
});
```

### Optimize for Web Delivery

- **Compress images** — Use WebP where browser support allows, PNG for transparency, JPEG for large backgrounds.
- **Use WOFF2 fonts** — Smallest file size for web delivery.
- **Minify JSON** — Strip whitespace from data files.
- **Total initial bundle** — Aim for < 5 MB for the first load on mobile. Lazy-load the rest at scene transitions.

### Mobile and Browser Considerations

- **Autoplay restrictions** — Browsers block audio playback until the user interacts. The Loader's default play button handles this. If you suppress it, ensure your game has an initial click/tap interaction before playing sounds.
- **Memory pressure** — Mobile browsers have lower memory limits. Dispose of scene-specific resources when leaving a scene if memory is a concern.
- **HTTP/2** — Modern servers multiplex requests, reducing the benefit of sprite atlases for network performance. But atlases still help GPU batching.

---

## Cross-Framework Comparison

| Concept | Excalibur | Phaser | Kaplay | PixiJS |
|---|---|---|---|---|
| Resource declaration | `new ImageSource(url)` | `this.load.image(key, url)` | `loadSprite(name, url)` | `Assets.add({ alias, src })` |
| Loader | `new Loader([...resources])` | Built-in per-scene `preload()` | Automatic (blocks game start) | `Assets.load([...])` promise |
| Custom loading screen | Subclass `Loader.onDraw()` | `this.load.on('progress')` | `loadProgress()` polling | `onProgress` callback |
| Scene-specific loading | `engine.start(sceneLoader)` | Per-scene `preload()` | `load()` custom promise | Manual `Assets.load()` |
| Font loading | `new FontSource(url, name)` | `this.load.font()` (v3.60+) | `loadFont(name, url)` | `Assets.load()` with font config |
| Progress tracking | `loader.progress` (0–1) | `this.load.on('progress', cb)` | `loadProgress()` (0–1) | Promise-based |
| Audio fallback | Multiple paths in constructor | Multiple paths in array | Single file per call | External (Howler.js, etc.) |
