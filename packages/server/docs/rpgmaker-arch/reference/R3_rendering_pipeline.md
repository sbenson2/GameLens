# Rendering Pipeline & PIXI.js Integration

> **Category:** reference · **Engine:** RPG Maker · **Related:** [G3_scene_and_window_system](../guides/G3_scene_and_window_system.md), [G1_plugin_development](../guides/G1_plugin_development.md)

RPG Maker MZ renders everything through PIXI.js (v5). Understanding the rendering pipeline is essential for writing plugins that add custom visuals, HUDs, weather effects, or shader-based post-processing.

---

## Architecture Overview

```
Graphics (static manager)
├── app            → PIXI.Application
│   ├── renderer   → PIXI.Renderer (WebGL)
│   ├── stage      → PIXI.Container (root — same as SceneManager._scene)
│   └── ticker     → PIXI.Ticker (drives the game loop)
├── effekseer      → EffekseerContext (particle effects)
└── _canvas        → HTMLCanvasElement
```

The `Graphics` module initialises the PIXI application during boot and coordinates rendering with the Effekseer particle system. Every frame, the ticker fires, the active scene's `update()` runs, and then PIXI renders the stage.

---

## The Frame Loop

```
PIXI.Ticker tick
  → SceneManager.update()
      → SceneManager._scene.update()     // active scene logic
      → SceneManager.renderScene()
          → Graphics.render()             // PIXI.Application.render()
          → Graphics.effekseer.update()   // Effekseer particle tick
```

The ticker is configured in manual mode — `app.ticker.autoStart = false` and `app.ticker.stop()` — so MZ controls exactly when frames render rather than relying on PIXI's built-in requestAnimationFrame loop.

---

## Key Classes

### Graphics (rmmz_core.js)

The static `Graphics` object manages the renderer, canvas size, FPS counter, and loading spinner.

| Property/Method | Description |
|----------------|-------------|
| `Graphics.app` | The `PIXI.Application` instance |
| `Graphics.effekseer` | The `EffekseerContext` for particle effects |
| `Graphics.width` / `Graphics.height` | Logical game resolution (default 816×624) |
| `Graphics.resize(w, h)` | Resize the renderer and canvas |
| `Graphics.render()` | Render one frame (called by SceneManager) |
| `Graphics._createCanvas()` | Creates the HTML canvas element |
| `Graphics._updateRenderer()` | Syncs renderer size to canvas CSS size |

### Bitmap (rmmz_core.js)

`Bitmap` wraps an HTML `Image` or `Canvas` element and a `PIXI.BaseTexture`. It provides a 2D canvas context for drawing operations (text, shapes, fills) and exposes the result as a PIXI texture.

```js
// Create a 200×50 bitmap and draw text on it
const bmp = new Bitmap(200, 50);
bmp.fontSize = 24;
bmp.textColor = "#ffffff";
bmp.drawText("Hello!", 0, 0, 200, 50, "center");
```

| Property | Description |
|----------|-------------|
| `bitmap._canvas` | The underlying HTMLCanvasElement |
| `bitmap._context` | The 2D rendering context |
| `bitmap._baseTexture` | The `PIXI.BaseTexture` (auto-updated on draw) |
| `bitmap.width` / `bitmap.height` | Dimensions |

After drawing onto a Bitmap, call `bitmap._baseTexture.update()` if the texture does not refresh automatically (rare but possible in custom rendering paths).

### Sprite (rmmz_core.js)

`Sprite` extends `PIXI.Sprite` with MZ-specific features: Bitmap integration, frame rectangles, blend modes, and color tone filters.

```js
// Create a sprite from a system image
const sprite = new Sprite();
sprite.bitmap = ImageManager.loadSystem("Window");

// Set the visible frame (source rectangle)
sprite.setFrame(0, 0, 96, 96);

// Position it
sprite.x = 100;
sprite.y = 200;

// Blend mode
sprite.blendMode = PIXI.BLEND_MODES.ADD;
```

**Important:** `Sprite` creates a `PIXI.Texture` from the Bitmap's `_baseTexture`. If you swap `sprite.bitmap`, the texture is reconstructed automatically.

### Spriteset_Map / Spriteset_Battle

These are the root sprite containers for map and battle scenes. They build up the visual layer stack:

```
Spriteset_Map
├── _baseSprite         (tilemap + parallax)
│   ├── _parallax
│   ├── _tilemap        (Tilemap — extends PIXI.Container)
│   ├── _characterSprites[]
│   └── _shadowSprite
├── _upperLayer         (above-character effects)
├── _weatherSprite      (Weather)
└── _pictureContainer   (Show Picture commands)
```

---

## Custom Sprites in Plugins

### Adding a HUD sprite to a scene

```js
// In a plugin — alias Scene_Map.createDisplayObjects
const _Scene_Map_createDisplayObjects = Scene_Map.prototype.createDisplayObjects;
Scene_Map.prototype.createDisplayObjects = function() {
    _Scene_Map_createDisplayObjects.call(this);
    this._myHud = new Sprite();
    this._myHud.bitmap = new Bitmap(200, 40);
    this._myHud.bitmap.fontSize = 18;
    this._myHud.bitmap.drawText("HP: 100", 4, 4, 192, 32, "left");
    this._myHud.x = 10;
    this._myHud.y = 10;
    this.addChild(this._myHud);
};
```

### Using PIXI directly

You can create raw PIXI objects and add them to the scene tree:

```js
// Create a PIXI.Graphics shape
const circle = new PIXI.Graphics();
circle.beginFill(0xff0000, 0.5);
circle.drawCircle(0, 0, 30);
circle.endFill();
circle.x = 400;
circle.y = 300;

// Add to the current scene
SceneManager._scene.addChild(circle);
```

This works because every MZ scene IS a `PIXI.Container`. However, prefer extending MZ's `Sprite` class for anything that needs to integrate with MZ's update loop, as raw PIXI objects won't receive `update()` calls.

### Accessing PIXI textures from ImageManager

`ImageManager` returns `Bitmap` objects, not PIXI textures. To get the underlying texture:

```js
const bitmap = ImageManager.loadPicture("myImage");
bitmap.addLoadListener(() => {
    // bitmap._baseTexture is now ready
    const texture = new PIXI.Texture(bitmap._baseTexture);
    const pixiSprite = new PIXI.Sprite(texture);
    SceneManager._scene.addChild(pixiSprite);
});
```

Always use `addLoadListener` — images load asynchronously, and accessing `_baseTexture` before the image is decoded produces a blank texture.

---

## Effekseer Integration

MZ uses Effekseer for GPU-accelerated particle effects (spell animations, environmental particles). The context is initialised alongside the PIXI renderer:

```
Graphics._createEffekseerContext()
  → effekseer = effekseerWasmModule.createContext()
  → effekseer.init(gl)   // shares the WebGL context with PIXI
```

### Playing an effect from a plugin

```js
// Load an Effekseer effect file (.efkefc)
const effect = Graphics.effekseer.loadEffect("effects/MyEffect.efkefc");

// Play it at a world position
const handle = Graphics.effekseer.play(effect, 400, 300, 0);

// Stop it later
Graphics.effekseer.stopEffect(handle);
```

Effekseer effects render into the same WebGL context as PIXI, so they composite naturally with the sprite layers. The `Spriteset_Base._effectsContainer` manages effect playback for battle animations.

---

## Performance Considerations

- **Bitmap drawing is CPU-bound.** Every `drawText()`, `fillRect()`, or `blt()` call goes through the HTML Canvas 2D API and then uploads to the GPU via `_baseTexture.update()`. For text that changes every frame (damage numbers, timers), consider caching or using PIXI.Text directly.
- **Child count matters.** Each PIXI.Container child adds to the scene graph traversal. For particle-heavy plugins, use PIXI.ParticleContainer for uniform sprites.
- **Avoid per-frame `new Bitmap()`.** Bitmap allocation is expensive. Create once, clear with `bitmap.clear()`, and redraw.
- **Blend modes and filters** add draw calls. MZ's `ColorFilter` (tone, blend) uses PIXI filters under the hood — stacking multiple filters on many sprites impacts fill rate.
- **Effekseer vs. PIXI particles.** Use Effekseer for complex 3D particle effects (it's GPU-accelerated via WebAssembly). Use PIXI-based particles for simple 2D effects that need tight integration with the sprite system.

---

## PIXI Version Reference

RPG Maker MZ ships with **PIXI.js v5.3.12**. Key APIs available:

| Feature | Available |
|---------|-----------|
| `PIXI.Sprite`, `PIXI.Container` | Yes |
| `PIXI.Graphics` (vector drawing) | Yes |
| `PIXI.Text` (bitmap text rendering) | Yes |
| `PIXI.ParticleContainer` | Yes |
| `PIXI.RenderTexture` | Yes |
| `PIXI.Filter` (custom shaders) | Yes |
| `PIXI.Mesh` / `PIXI.SimpleMesh` | Yes |
| `PIXI.Assets` (v7+ loader) | No — use MZ's `ImageManager` |
| `PIXI.Spritesheet` (v6+ API) | Partial — MZ uses its own atlas system |

When writing plugins, always use `ImageManager` for loading game assets. Use raw PIXI loaders only for addon-specific assets that live outside MZ's resource folders.
