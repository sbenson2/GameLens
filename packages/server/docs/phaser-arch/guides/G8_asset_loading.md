# G8 — Phaser Asset Loading & Preloader Scenes

> **Category:** guide · **Engine:** Phaser · **Related:** [E1 Architecture Overview](../architecture/E1_architecture_overview.md) · [G1 Scene Lifecycle](G1_scene_lifecycle.md) · [G4 Sprites & Animation](G4_sprites_and_animation.md) · [G6 Tilemaps & Levels](G6_tilemaps_and_levels.md)

---

## Overview

Every Phaser 3 game needs to load assets — images, spritesheets, audio, tilemaps, fonts, and data files — before they can be used. The **LoaderPlugin** (`this.load`) is available in every Scene and operates on a queue: you add files during the `preload()` lifecycle method, Phaser downloads them all, then calls `create()` once everything is ready.

This guide covers the Loader API, supported file types, preloader scene patterns, progress bars, lazy loading, pack files, error handling, and performance optimization. Getting asset loading right is critical — a well-structured loader prevents blank screens, memory bloat, and mid-gameplay stutters.

---

## The Preload Lifecycle

Phaser Scenes have a special `preload()` method. When a Scene starts, Phaser calls `preload()` first, waits for all queued assets to finish downloading, then calls `create()`. This guarantees every asset is available when `create()` runs:

```typescript
class BootScene extends Phaser.Scene {
  constructor() {
    super({ key: 'BootScene' });
  }

  preload(): void {
    // Queue assets — Phaser downloads them in parallel
    this.load.image('logo', 'assets/logo.png');
    this.load.audio('bgm', ['assets/music.ogg', 'assets/music.mp3']);
  }

  create(): void {
    // Safe to use — everything from preload() is loaded
    this.add.image(400, 300, 'logo');
    this.scene.start('GameScene');
  }
}
```

**Key rule:** only queue assets in `preload()`. If you call `this.load.image()` in `create()` or `update()`, the loader won't start automatically — you must call `this.load.start()` manually.

---

## Basic Asset Loading

Phaser's LoaderPlugin provides methods for every common game asset type. Load calls are queued in `preload()` and executed in parallel once Phaser calls `preload()` on your scene:

### Images & Textures

```typescript
preload(): void {
  // Single image — loaded once, cached in memory
  this.load.image('background', 'assets/bg.png');

  // Sprite sheet — uniform grid of frames
  // Use for simple animations where all frames are same size
  this.load.spritesheet('player', 'assets/player.png', {
    frameWidth: 32,
    frameHeight: 48,
    startFrame: 0,   // Optional: first frame index
    endFrame: 11,    // Optional: last frame index
    spacing: 0,      // Pixels between frames horizontally
    margin: 0,       // Pixels around the sheet edge
  });

  // Texture atlas — JSON hash or array format (TexturePacker, etc.)
  // More efficient than sprite sheets — variable frame sizes, less wasted space
  this.load.atlas('enemies', 'assets/enemies.png', 'assets/enemies.json');

  // Multi-atlas — single JSON referencing multiple texture files
  // Useful when atlas files exceed VRAM limits
  this.load.multiatlas('megapack', 'assets/megapack.json', 'assets/textures/');

  // Unity atlas format — exported from Unity sprite packager
  this.load.unityAtlas('ui', 'assets/ui.png', 'assets/ui.txt');
}
```

**Texture atlases vs. sprite sheets:** Atlases pack variable-sized frames efficiently (less wasted space) and reduce draw calls. Use atlases for production; sprite sheets for quick prototyping or uniform grid animations.

Once loaded, access frames via `this.textures.get(key)` and reference specific frames by name (for atlases) or index (for sprite sheets).

### Audio

```typescript
preload(): void {
  // Provide multiple formats for browser compatibility
  this.load.audio('explosion', [
    'assets/sfx/explosion.ogg',  // Preferred: smaller, better quality
    'assets/sfx/explosion.mp3',  // Fallback: universal support
  ]);

  // Audio sprite — single file with multiple sounds defined by time ranges
  this.load.audioSprite('sfx', 'assets/sfx/sfx.json', [
    'assets/sfx/sfx.ogg',
    'assets/sfx/sfx.mp3',
  ]);
}
```

**Always provide OGG + MP3.** Safari historically lacks OGG support; some older browsers lack MP3. Phaser picks the first supported format automatically.

### Tilemaps

```typescript
preload(): void {
  // Tiled JSON format (most common)
  this.load.tilemapTiledJSON('level1', 'assets/maps/level1.json');

  // CSV tilemap
  this.load.tilemapCSV('simple', 'assets/maps/simple.csv');

  // Don't forget the tileset image(s) referenced by the map
  this.load.image('tileset', 'assets/tiles/tileset.png');
}
```

### Fonts & Text

```typescript
preload(): void {
  // Bitmap font (Angel Code format — exported from tools like BMFont, Littera)
  this.load.bitmapFont('pixelFont', 'assets/fonts/pixel.png', 'assets/fonts/pixel.fnt');

  // For web fonts (Google Fonts, etc.), load via CSS or the WebFontLoader plugin
  // before Phaser starts — Phaser's loader doesn't handle CSS web fonts directly
}
```

### Data Files

```typescript
preload(): void {
  // JSON data (level configs, dialogue trees, item databases)
  this.load.json('items', 'assets/data/items.json');

  // Plain text
  this.load.text('dialogue', 'assets/data/intro.txt');

  // XML
  this.load.xml('config', 'assets/data/config.xml');

  // Binary (ArrayBuffer)
  this.load.binary('navmesh', 'assets/data/navmesh.bin');
}
```

### HTML & Other

```typescript
preload(): void {
  // HTML texture — renders HTML to a canvas texture
  this.load.htmlTexture('panel', 'assets/ui/panel.html', 256, 128);

  // GLSL shader
  this.load.glsl('wavy', 'assets/shaders/wavy.frag');

  // Video
  this.load.video('intro', 'assets/video/intro.mp4');

  // Plugin
  this.load.plugin('rexUI', 'path/to/rexuiplugin.min.js', true);

  // Scene file (load another scene's code dynamically)
  this.load.sceneFile('BonusScene', 'assets/scenes/BonusScene.js');
}
```

---

## Building a Preloader Scene

A dedicated Preloader scene provides visual loading feedback and keeps asset management centralized. This is the most common pattern in production Phaser games:

```typescript
class PreloaderScene extends Phaser.Scene {
  constructor() {
    super({ key: 'Preloader' });
  }

  init(): void {
    // Show a simple loading bar
    const { width, height } = this.cameras.main;

    // Background bar
    this.add.rectangle(width / 2, height / 2, 468, 32)
      .setStrokeStyle(2, 0xffffff);

    // Fill bar — starts at width 0, grows with progress
    const bar = this.add.rectangle(
      width / 2 - 230, height / 2, 4, 28, 0xffffff
    ).setOrigin(0, 0.5);

    // Update bar width as loading progresses
    this.load.on('progress', (value: number) => {
      bar.width = 460 * value;
    });
  }

  preload(): void {
    // Load ALL game assets here
    this.load.setPath('assets/');

    // Images
    this.load.image('sky', 'images/sky.png');
    this.load.image('ground', 'images/platform.png');

    // Spritesheets
    this.load.spritesheet('hero', 'sprites/hero.png', {
      frameWidth: 32,
      frameHeight: 48,
    });

    // Atlas
    this.load.atlas('ui', 'ui/ui.png', 'ui/ui.json');

    // Audio
    this.load.audio('theme', ['audio/theme.ogg', 'audio/theme.mp3']);
    this.load.audio('jump', ['audio/jump.ogg', 'audio/jump.mp3']);

    // Tilemaps
    this.load.tilemapTiledJSON('level1', 'maps/level1.json');
    this.load.image('tiles', 'tiles/tileset.png');

    // Data
    this.load.json('enemyData', 'data/enemies.json');
  }

  create(): void {
    // Transition to the main menu or first game scene
    this.scene.start('MainMenu');
  }
}
```

**`this.load.setPath()`** sets a base directory for all subsequent load calls in that scene, reducing repetition and typos.

---

## Load Events

The Loader emits events you can listen to for custom progress UI, error handling, and post-load setup:

```typescript
preload(): void {
  // Fires after each individual file completes — (value: 0 to 1)
  this.load.on('progress', (value: number) => {
    console.log(`${Math.round(value * 100)}%`);
  });

  // Fires after each file loads — useful for "Loading: filename" display
  this.load.on('fileprogress', (file: Phaser.Loader.File) => {
    console.log(`Loading: ${file.key}`);
  });

  // Fires when ALL files are done
  this.load.on('complete', () => {
    console.log('All assets loaded');
  });

  // Error handling for individual files
  this.load.on('loaderror', (file: Phaser.Loader.File) => {
    console.warn(`Failed to load: ${file.key} (${file.url})`);
  });

  // Queue your assets after setting up listeners
  this.load.image('hero', 'assets/hero.png');
}
```

**Important:** create display objects (progress bars, text) in the `init()` method or in the `load` `START` event handler. Destroy them in the `load` `COMPLETE` event. This prevents errors if the scene restarts and the loader runs again.

---

## Texture Atlases

Texture atlases are the production-standard way to pack multiple images into a single texture, reducing HTTP requests and draw calls. Phaser supports two JSON formats:

### JSON Hash Format (TexturePacker default)

```json
{
  "textures": [{
    "image": "enemies.png",
    "format": "RGBA8888",
    "size": { "w": 1024, "h": 1024 },
    "scale": 1,
    "frames": [
      {
        "filename": "goblin_idle_01.png",
        "rotated": false,
        "trimmed": false,
        "sourceSize": { "w": 64, "h": 64 },
        "spriteSourceSize": { "x": 0, "y": 0, "w": 64, "h": 64 },
        "frame": { "x": 0, "y": 0, "w": 64, "h": 64 }
      },
      {
        "filename": "goblin_idle_02.png",
        "frame": { "x": 64, "y": 0, "w": 64, "h": 64 }
      }
    ]
  }]
}
```

Access frames by filename (without extension):

```typescript
preload(): void {
  this.load.atlas('enemies', 'assets/enemies.png', 'assets/enemies.json');
}

create(): void {
  // Reference by frame key
  const sprite = this.add.sprite(100, 100, 'enemies', 'goblin_idle_01.png');
  
  // Or create animation with frame names
  this.anims.create({
    key: 'goblin_walk',
    frames: this.anims.generateFrameNames('enemies', {
      prefix: 'goblin_idle_',
      start: 1,
      end: 4,
      zeroPad: 2
    }),
    frameRate: 8,
    repeat: -1
  });
}
```

### JSON Array Format

For tools that export array-based indexes instead of frame names:

```json
{
  "textures": [{
    "image": "tiles.png",
    "frames": [
      { "filename": "0", "frame": { "x": 0, "y": 0, "w": 32, "h": 32 } },
      { "filename": "1", "frame": { "x": 32, "y": 0, "w": 32, "h": 32 } },
      { "filename": "2", "frame": { "x": 64, "y": 0, "w": 32, "h": 32 } }
    ]
  }]
}
```

Access by numeric frame name:

```typescript
const tile = this.add.sprite(100, 100, 'tiles', '0');
```

### Multi-Atlas Loading

For games with many textures, split atlases reduce individual file size and VRAM pressure:

```typescript
preload(): void {
  // Loads megapack.json which references multiple PNG files
  // Example: megapack.json contains refs to "enemies.png", "ui.png", "tiles.png"
  this.load.multiatlas('megapack', 'assets/megapack.json', 'assets/textures/');
}

// Frames from all referenced images are accessible by their frame names
```

**TexturePacker workflow:** Export from TexturePacker with "Phaser (JSON Hash)" or "Phaser (JSON Array)" as the data format. Phaser handles both automatically.

---

## Pack Files

Pack files let you define all your assets in a single JSON file instead of hardcoding load calls. This is useful for data-driven loading, level-specific asset lists, or tools that generate asset manifests:

```json
{
  "section1": {
    "files": [
      { "type": "image", "key": "sky", "url": "assets/sky.png" },
      { "type": "spritesheet", "key": "player", "url": "assets/player.png",
        "frameConfig": { "frameWidth": 32, "frameHeight": 48 } },
      { "type": "audio", "key": "bgm", "url": ["assets/bgm.ogg", "assets/bgm.mp3"] }
    ]
  }
}
```

```typescript
preload(): void {
  this.load.pack('gameassets', 'assets/asset-pack.json');
}
```

Pack files can contain multiple sections. You can load specific sections by passing the section key as the third argument.

---

## Lazy Loading (Load on Demand)

For large games, loading everything upfront is impractical. Load assets per-scene or on demand to reduce initial load time and memory usage:

### Per-Scene Loading

```typescript
// Each scene loads only what it needs
class Level1Scene extends Phaser.Scene {
  preload(): void {
    // Only Level 1 assets
    this.load.tilemapTiledJSON('level1', 'maps/level1.json');
    this.load.image('level1_tiles', 'tiles/forest.png');
    this.load.audio('forest_ambience', ['audio/forest.ogg', 'audio/forest.mp3']);
  }
}

class Level2Scene extends Phaser.Scene {
  preload(): void {
    // Only Level 2 assets
    this.load.tilemapTiledJSON('level2', 'maps/level2.json');
    this.load.image('level2_tiles', 'tiles/cave.png');
    this.load.audio('cave_ambience', ['audio/cave.ogg', 'audio/cave.mp3']);
  }
}
```

### On-Demand Loading in create() or update()

```typescript
create(): void {
  // Check if texture already exists before loading
  if (!this.textures.exists('bonus_boss')) {
    this.load.image('bonus_boss', 'assets/boss.png');

    // Must listen for completion when loading outside preload()
    this.load.once('filecomplete-image-bonus_boss', () => {
      this.spawnBoss();
    });

    // CRITICAL: manually start the loader outside preload()
    this.load.start();
  } else {
    this.spawnBoss();
  }
}
```

**Caveat:** on-demand loading can cause visible hitches if a large texture loads mid-gameplay. For smooth gameplay, preload the next level's assets in the background during the current level.

---

## Background Pre-Loading

Load the next level's assets while the current level is playing, so transitions feel instant:

```typescript
class Level1Scene extends Phaser.Scene {
  create(): void {
    // ... set up Level 1 gameplay ...

    // Start background-loading Level 2 assets
    this.load.image('level2_bg', 'assets/level2/bg.png');
    this.load.tilemapTiledJSON('level2', 'assets/maps/level2.json');

    this.load.once('complete', () => {
      console.log('Level 2 assets ready');
      this.registry.set('level2Loaded', true);
    });

    this.load.start();
  }

  onLevelComplete(): void {
    if (this.registry.get('level2Loaded')) {
      this.scene.start('Level2Scene');
    } else {
      // Show a brief loading screen
      this.scene.start('TransitionScene', { next: 'Level2Scene' });
    }
  }
}
```

---

## Unloading & Memory Management

Phaser caches every loaded asset. For long-running games or games with many levels, unload assets you no longer need to free memory:

```typescript
// Remove a specific texture
this.textures.remove('level1_bg');

// Remove a specific audio file
this.cache.audio.remove('forest_ambience');

// Remove JSON data
this.cache.json.remove('level1_data');

// Remove a tilemap
this.cache.tilemap.remove('level1');
```

**When to unload:** during scene transitions, after a level is complete, or when entering a menu. Never unload assets that are still referenced by active game objects — destroy the objects first.

---

## Error Handling & Fallbacks

Network issues and missing files happen. Handle them gracefully:

```typescript
preload(): void {
  this.load.on('loaderror', (file: Phaser.Loader.File) => {
    console.error(`Failed: ${file.key} → ${file.url}`);

    // Provide a fallback texture for missing images
    if (file.type === 'image' || file.type === 'spritesheet') {
      // Create a colored rectangle as placeholder
      const gfx = this.make.graphics({ x: 0, y: 0, add: false });
      gfx.fillStyle(0xff00ff, 1);  // Magenta = "missing texture" convention
      gfx.fillRect(0, 0, 32, 32);
      gfx.generateTexture(file.key, 32, 32);
      gfx.destroy();
    }
  });

  this.load.image('hero', 'assets/hero.png');
}
```

---

## Asset Compression & Optimization

Production games must optimize asset sizes to reduce bandwidth, memory usage, and load times:

### Image Optimization

```typescript
// Best practices for image assets:
// 1. Use PNG for sprites and UI (lossless, supports transparency)
// 2. Use WebP for backgrounds (modern browsers, 25-30% smaller than PNG)
// 3. Use JPG for photographs (lossy, but much smaller)
// 4. Always compress before shipping

// Tool recommendations:
// - Squoosh (squoosh.app): batch compress PNG/JPG/WebP with preview
// - TinyPNG (tinypng.com): high-quality lossy PNG compression (API available)
// - ImageMagick: CLI batch processing
// - Aseprite: sprite-focused, includes export optimization

// Texture atlases further reduce memory:
// - Reduces VRAM usage (fewer texture binds)
// - Enables power-of-two sizing (512x512, 1024x1024, etc.)
// - Most GPUs require POT textures for mipmapping

preload(): void {
  // Load WebP with PNG fallback for modern browser support
  const webp = this.game.device.video.webGL;
  const ext = webp ? '.webp' : '.png';
  
  this.load.image('bg', `assets/bg${ext}`);
}
```

### Audio Optimization

```typescript
// Audio format strategy (always provide multiple formats):
// OGG Vorbis (Recommended):
//   - Quality: 160 kbps @ 44.1 kHz = excellent quality, small file
//   - Supported: Chrome, Firefox, Safari 14.1+, Edge
//   - Command: ffmpeg -i audio.wav -q:a 4 audio.ogg
//
// MP3 (Fallback):
//   - Quality: 192 kbps @ 44.1 kHz = good quality, larger than OGG
//   - Supported: All browsers (legacy support)
//   - Command: ffmpeg -i audio.wav -b:a 192k audio.mp3
//
// Phaser auto-selects the first supported format

preload(): void {
  // Always provide OGG first (smaller), MP3 as fallback
  this.load.audio('sfx_jump', [
    'assets/audio/jump.ogg',  // 50 KB
    'assets/audio/jump.mp3'   // 80 KB (fallback only)
  ]);

  // Audio sprite: combine 10-20 sound effects in one file
  // Reduces HTTP requests and improves cache efficiency
  this.load.audioSprite('sfx_pack', 'assets/audio/sfx.json', [
    'assets/audio/sfx.ogg',
    'assets/audio/sfx.mp3'
  ]);
}
```

### Loading Configuration

```typescript
const config: Phaser.Types.Core.GameConfig = {
  // ...
  loader: {
    // Increase for desktop/good connections, decrease for mobile
    maxParallelDownloads: 16,
    
    // Required for cross-origin assets (CDNs, data URIs)
    crossOrigin: 'anonymous',
    
    // CDN base URL — reduces origin bandwidth, enables caching
    baseURL: 'https://cdn.example.com/assets/',
    
    // Response type for binary assets (audio sprites, etc.)
    responseType: 'blob'
  },
};

// Manual optimization flags
class OptimizedPreloader extends Phaser.Scene {
  preload(): void {
    // Set a base path to avoid repeating directory names
    this.load.setPath('https://cdn.example.com/game/');
    
    // Then just use relative paths
    this.load.image('hero', 'images/hero.webp');  // Loads from CDN
    
    // Use asset aliases to handle version cache-busting
    const v = '1.2.3';  // Increment when assets change
    this.load.image('bg', `images/bg.png?v=${v}`);
  }
}
```

### Sprite Sheet Packing Tips

```typescript
// When creating spritesheets, follow these guidelines:
// 1. Keep frame sizes consistent (32x32, 64x64, etc.)
// 2. Use power-of-two dimensions (256, 512, 1024)
// 3. Leave 1-2 pixel spacing between frames (prevents bleeding)
// 4. Use tools: Aseprite, Pyxel Edit, or TexturePacker

// Bad: 73x91 frame size on 800x600 sheet (wasted space)
// Good: 64x64 frames on 512x512 sheet (POT alignment)

preload(): void {
  this.load.spritesheet('character', 'assets/char.png', {
    frameWidth: 64,
    frameHeight: 64,
    spacing: 1,   // Prevent texture bleeding between frames
    margin: 1     // Margin around sheet edge
  });
}
```

---

## Performance Tips

1. **Use texture atlases** over individual images — fewer HTTP requests, fewer draw calls, better GPU batching.
2. **Compress assets** before shipping (see Asset Compression section above).
3. **Use `setPath()`** to reduce URL string duplication and make path changes easy.
4. **Split loading across scenes** — don't load everything in one giant preloader unless your game is small.
5. **Use pack files** for large games — easier to manage and can be generated by build tools.
6. **Set `maxParallelDownloads`** in the game config for your target platform.
7. **Consider Base64 inlining** for tiny assets (icons, UI elements) to eliminate HTTP requests entirely.
8. **Use CDNs** in production — geographically distributed servers load faster for global audiences.
9. **Cache assets aggressively** — set long `Cache-Control` headers for versioned asset URLs.

---

## Progressive Asset Loading Strategy

For open-world or multi-level games, load assets strategically to balance startup time and memory:

```typescript
// Boot scene: load only essential assets (splash, main menu)
class BootScene extends Phaser.Scene {
  preload(): void {
    this.load.image('splash', 'assets/splash.png');
    this.load.audio('click', ['assets/click.ogg', 'assets/click.mp3']);
  }

  create(): void {
    this.scene.start('MainMenuScene');
  }
}

// Menu scene: load menu assets + start background-loading first level
class MainMenuScene extends Phaser.Scene {
  preload(): void {
    this.load.setPath('assets/menu/');
    this.load.image('bg', 'bg.png');
    this.load.atlas('buttons', 'buttons.png', 'buttons.json');
    
    // START background loading of level 1 assets
    // Don't call load.start() — preload() auto-starts for this scene
    this.scene.launch('Level1Preloader', { visible: false });
  }

  create(): void {
    // Render menu while Level1Preloader loads in background
    this.add.image(512, 384, 'bg');
  }

  onPlayClicked(): void {
    // By now, Level1 assets should be loaded (or nearly loaded)
    const level1Loaded = this.scene.get('Level1Preloader').isReady;
    
    if (level1Loaded) {
      this.scene.stop('Level1Preloader');
      this.scene.start('Level1Scene');
    } else {
      // Show brief "Loading..." spinner
      this.scene.get('Level1Preloader').events.once('complete', () => {
        this.scene.stop('Level1Preloader');
        this.scene.start('Level1Scene');
      });
    }
  }
}

// Invisible preloader scene running in parallel
class Level1Preloader extends Phaser.Scene {
  isReady: boolean = false;

  constructor() {
    super({ key: 'Level1Preloader' });
  }

  preload(): void {
    this.load.setPath('assets/level1/');
    this.load.tilemapTiledJSON('level1', 'level1.json');
    this.load.image('tiles', 'tileset.png');
    this.load.atlas('enemies', 'enemies.png', 'enemies.json');
    this.load.audio('bgm', ['bgm.ogg', 'bgm.mp3']);
    this.load.json('enemyConfig', 'enemies.json');
    
    // Track loading progress
    this.load.on('progress', (val: number) => {
      console.log(`Level 1 loading: ${Math.round(val * 100)}%`);
    });

    this.load.on('complete', () => {
      this.isReady = true;
      this.events.emit('complete');
    });
  }

  create(): void {
    // This scene's create() is called immediately when scene launches
    // Preload assets load in the background while other scenes run
  }
}

// Level scene: all assets already cached (instant start)
class Level1Scene extends Phaser.Scene {
  create(): void {
    // All Level 1 assets loaded — create immediately
    const map = this.make.tilemap({ key: 'level1' });
    const tileset = map.addTilesetImage('Forest', 'tiles');
    
    // No loading delays — gameplay starts instantly
  }

  shutdown(): void {
    // Unload when moving to next level
    this.textures.remove('enemies');
    this.cache.tilemap.remove('level1');
    
    // Start preloading Level 2 assets for smooth transition
    this.scene.launch('Level2Preloader', { visible: false });
  }
}
```

This pattern eliminates loading screens by preloading the next level while the current level plays. By the time the player finishes a level, the next one is ready.

---

## Cross-Framework Comparison

### Phaser vs. Other HTML5 Frameworks

| Feature | Phaser 3 | PixiJS | Kaplay | Excalibur |
|---------|----------|--------|--------|-----------|
| **Loading hook** | `preload()` scene lifecycle — automatic, declarative | `Assets.load()` — manual, promise-based | `loadSprite()`, `loadSound()` — convenience functions | `Loader` class with `addResource()` — manual queue |
| **Progress tracking** | `load.on('progress')`, `load.on('fileprogress')` | `Assets.load(urls, onProgress)` callback | Built-in loading screen (screens) | `loader.on('progress')` event |
| **Texture atlases** | Built-in: JSON Hash, JSON Array, XML, Unity formats | Built-in: JSON spritesheet only | Atlas via `loadSpriteAtlas()` | Manual spritesheet frame definition |
| **Pack files** | `this.load.pack()` for manifest loading | Asset bundle API (ES6 imports) | Not built-in — use separate JSON | Not built-in |
| **Audio formats** | Multiple format fallbacks: OGG, MP3, M4A | Requires external plugin (Howler.js typically) | Built-in: WebAudio API directly | Built-in: Web Audio API |
| **Cache management** | Automatic: `this.textures.remove()`, `this.cache.audio.remove()` | Manual: `Assets.unload()` | Manual texture management | Manual resource cleanup |
| **Lazy loading** | `this.load.start()` for on-demand loading | Manual async/await with `Assets.load()` | Manual with promise chains | Manual with `Loader.addResource()` |
| **Best for** | Full-featured 2D games, prototypes to AAA | High-performance rendering, WebGL focus | Quick WebGL games, learning | Strongly-typed game development |
| **Learning curve** | Moderate — rich API, well-documented | Steep — low-level renderer API | Gentle — simple function calls | Moderate — TypeScript-first |

### Recommendation Matrix

Choose **Phaser** if you need:
- A complete, integrated framework with physics, input, animation, and audio built-in
- Preloader scenes with progress feedback
- Production-ready asset management (pack files, texture atlases, multi-format audio)
- Rapid game development with minimal boilerplate

Choose **PixiJS** if you need:
- Pure, blazing-fast 2D rendering with full control
- Lightweight core (add your own physics, audio, input systems)
- Emphasis on graphics and WebGL optimization

Choose **Kaplay** if you need:
- Simplicity and quick prototyping
- Minimal setup and dependencies
- Beginner-friendly API

Choose **Excalibur** if you need:
- Strong TypeScript support and type safety
- Entity-component-system (ECS) architecture
- Educational framework with clear patterns

---

## Summary

Phaser's Loader is one of the framework's strongest features — it handles dozens of file types, provides rich progress events, and integrates seamlessly with the Scene lifecycle. For small games, a single Preloader scene with a progress bar is all you need. For larger projects, combine pack files, per-scene loading, and background pre-loading to keep load times fast and memory usage under control. Always provide format fallbacks for audio, compress your assets, and use texture atlases in production.
