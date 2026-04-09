# R2 — libGDX Asset Management and Texture Atlases

> **Category:** reference · **Engine:** libGDX · **Related:** [Architecture Overview](../architecture/E1_architecture_overview.md) · [Getting Started](../guides/G1_getting_started.md) · [Scene2D UI](R1_scene2d_ui.md)

Asset management is critical in libGDX. Every `Texture`, `Sound`, `Music`, `BitmapFont`, `Skin`, and other GPU-backed resource must be explicitly disposed to avoid native memory leaks. This reference covers `AssetManager` for production loading, `TexturePacker` for atlas creation, and best practices for the asset lifecycle across platforms.

---

## Why AssetManager?

Loading assets directly (e.g., `new Texture("player.png")`) works for prototypes but breaks down in production:

- **No async loading** — the game freezes while textures upload to the GPU.
- **No reference counting** — two screens loading the same texture create two GPU copies.
- **No managed disposal** — you must track and dispose every resource manually.
- **Android lifecycle** — when the app is backgrounded and resumed, OpenGL context is lost; all textures must be reloaded.

`AssetManager` solves all of these.

---

## AssetManager Basics

### Creating the Manager

```java
AssetManager assets = new AssetManager();
```

**Critical rule:** Never make `AssetManager` or any `Disposable` resource `static`. On Android, a static reference may survive an activity restart while the underlying OpenGL resources are destroyed, causing crashes.

### Queueing Assets for Loading

```java
// Queue assets (nothing loads yet)
assets.load("textures/player.png", Texture.class);
assets.load("textures/enemies.atlas", TextureAtlas.class);
assets.load("sounds/explosion.ogg", Sound.class);
assets.load("music/theme.mp3", Music.class);
assets.load("fonts/pixel.fnt", BitmapFont.class);
assets.load("ui/skin.json", Skin.class);
```

### Loading with Parameters

```java
// Texture with custom filtering and mipmaps
TextureParameter texParam = new TextureParameter();
texParam.minFilter = TextureFilter.Linear;
texParam.magFilter = TextureFilter.Linear;
texParam.genMipMaps = true;
assets.load("textures/background.png", Texture.class, texParam);

// TextureAtlas with custom texture filtering
TextureAtlasParameter atlasParam = new TextureAtlasParameter();
atlasParam.flip = false;
assets.load("textures/sprites.atlas", TextureAtlas.class, atlasParam);
```

---

## Async vs. Blocking Loading

### Async Loading (Recommended for Loading Screens)

Call `assets.update()` every frame. It loads a small chunk per call and returns `true` when everything is finished:

```java
public class LoadingScreen implements Screen {
    private AssetManager assets;

    @Override
    public void render(float delta) {
        if (assets.update()) {
            // All assets loaded — transition to game
            game.setScreen(new GameplayScreen(game, assets));
            return;
        }

        // Draw loading bar
        float progress = assets.getProgress(); // 0.0 to 1.0
        drawProgressBar(progress);
    }
}
```

For smoother loading at 60 FPS, use the timed variant:

```java
assets.update(17); // spend up to 17ms loading (≈1 frame at 60 FPS)
```

### Blocking Loading (Simple Games / Prototyping)

```java
assets.finishLoading(); // blocks until all queued assets are loaded
```

Use sparingly — this freezes the entire application during loading.

### Waiting for a Specific Asset

```java
assets.load("textures/player.png", Texture.class);
assets.finishLoadingAsset("textures/player.png"); // blocks only until this asset is ready
Texture playerTex = assets.get("textures/player.png", Texture.class);
```

---

## Retrieving Assets

```java
// Type-safe retrieval
Texture tex = assets.get("textures/player.png", Texture.class);
TextureAtlas atlas = assets.get("textures/sprites.atlas", TextureAtlas.class);
Sound sfx = assets.get("sounds/explosion.ogg", Sound.class);

// Check if loaded before accessing
if (assets.isLoaded("textures/player.png")) {
    Texture tex = assets.get("textures/player.png", Texture.class);
}

// Get loading progress for specific asset types
int loaded = assets.getLoadedAssets();
int queued = assets.getQueuedAssets();
```

---

## Disposal and Reference Counting

AssetManager tracks dependencies automatically. If assets A and B both depend on asset C, C won't be disposed until both A and B are unloaded.

```java
// Unload a single asset (decrements reference count)
assets.unload("textures/player.png");

// Clear all assets
assets.clear();

// Dispose the manager and all managed assets (call in dispose())
assets.dispose();
```

**Rule:** Never call `.dispose()` directly on an asset managed by `AssetManager`. Use `assets.unload()` instead — direct disposal breaks reference counting and causes double-free crashes.

---

## TexturePacker and Texture Atlases

### Why Atlases?

In OpenGL, binding a texture is expensive. Drawing 100 sprites from 100 separate textures means 100 texture binds per frame. A **texture atlas** packs many images onto a single large texture, allowing `SpriteBatch` to draw them all in one bind — often a single draw call.

### Using libGDX's Built-in TexturePacker

TexturePacker is a command-line tool included with libGDX that packs images into optimized atlases:

```java
// Run from code (typically in a desktop-only tool, not in the game itself)
import com.badlogic.gdx.tools.texturepacker.TexturePacker;

TexturePacker.process(
    "raw-images/",      // input directory
    "assets/textures/",  // output directory
    "sprites"            // atlas name (produces sprites.atlas + sprites.png)
);
```

### Gradle Integration (Recommended)

Add a task to your `build.gradle` so atlases are packed automatically during build:

```groovy
// In desktop/build.gradle or a shared build script
task texturePacker(type: JavaExec) {
    classpath = sourceSets.main.runtimeClasspath
    mainClass = "com.badlogic.gdx.tools.texturepacker.TexturePacker"
    args = ["raw-images", "assets/textures", "sprites"]
}
```

Run with `./gradlew texturePacker` before building.

### Pack Configuration (pack.json)

Place a `pack.json` in the input directory to control packing behavior:

```json
{
    "maxWidth": 2048,
    "maxHeight": 2048,
    "paddingX": 2,
    "paddingY": 2,
    "edgePadding": true,
    "duplicatePadding": true,
    "pot": true,
    "stripWhitespaceX": true,
    "stripWhitespaceY": true,
    "filterMin": "MipMapLinearLinear",
    "filterMag": "Linear"
}
```

**Key settings:**

| Setting | Default | Notes |
|---------|---------|-------|
| `maxWidth` / `maxHeight` | 1024 | Max atlas dimensions. 1024 is safe everywhere; 2048 works on all modern devices; 4096 on desktop |
| `pot` | true | Power-of-two dimensions (required by some older GPUs) |
| `paddingX` / `paddingY` | 2 | Pixel padding between packed images (prevents bleeding) |
| `stripWhitespaceX/Y` | false | Remove transparent borders to save space |
| `filterMin` / `filterMag` | Nearest | Texture filtering. Use `Nearest` for pixel art, `Linear` for HD |

Subdirectories inherit parent settings. A `pack.json` in a subdirectory overrides only the settings it specifies.

### Loading and Using a TextureAtlas

```java
// Load via AssetManager
assets.load("textures/sprites.atlas", TextureAtlas.class);
assets.finishLoading();
TextureAtlas atlas = assets.get("textures/sprites.atlas", TextureAtlas.class);

// Get a single region (TextureRegion)
TextureRegion playerRegion = atlas.findRegion("player_idle");
// Use with SpriteBatch:
batch.draw(playerRegion, x, y);

// Get animation frames (named "player_run_0", "player_run_1", etc.)
Array<TextureRegion> runFrames = atlas.findRegions("player_run");
Animation<TextureRegion> runAnim = new Animation<>(0.1f, runFrames, PlayMode.LOOP);

// Get a Sprite (includes position, rotation, scale)
Sprite playerSprite = atlas.createSprite("player_idle");
playerSprite.setPosition(100, 200);
playerSprite.draw(batch);

// NinePatch for UI elements (named with .9 suffix or split data in atlas)
NinePatch patch = atlas.createPatch("button_bg");
```

### Naming Conventions in Atlases

TexturePacker uses filename conventions for animation frames:

```
raw-images/
├── player_idle.png          → atlas.findRegion("player_idle")
├── player_run_0.png         → atlas.findRegions("player_run") [index 0]
├── player_run_1.png         → [index 1]
├── player_run_2.png         → [index 2]
└── ui/
    └── button_bg.png        → atlas.findRegion("ui/button_bg")
```

Files ending in `_N` (where N is an integer) are treated as indexed frames of the same animation. Subdirectories become path prefixes.

---

## Android Resume Handling

When an Android app is backgrounded, the OpenGL context may be destroyed. AssetManager can reload all textures automatically:

```java
// In your Game class constructor or create():
Texture.setAssetManager(assets);
```

With this set, textures are automatically reloaded when the app resumes. Without it, all textures appear black after a resume.

### Resume-Safe Loading Pattern

```java
@Override
public void resume() {
    // If using AssetManager with Texture.setAssetManager(), this is automatic.
    // For manual management, switch to a loading screen:
    game.setScreen(new LoadingScreen(game, assets));
}
```

---

## Custom Asset Loaders

For game-specific formats, implement a custom loader:

### Synchronous Loader (Simple)

```java
public class LevelDataLoader extends SynchronousAssetLoader<LevelData, LevelDataParameter> {

    public LevelDataLoader(FileHandleResolver resolver) {
        super(resolver);
    }

    @Override
    public LevelData load(AssetManager manager, String fileName,
                          FileHandle file, LevelDataParameter param) {
        String json = file.readString();
        return new Json().fromJson(LevelData.class, json);
    }

    @Override
    public Array<AssetDescriptor> getDependencies(String fileName,
                                                   FileHandle file,
                                                   LevelDataParameter param) {
        return null; // no dependencies
    }
}

// Register the loader
assets.setLoader(LevelData.class, new LevelDataLoader(new InternalFileHandleResolver()));

// Use it
assets.load("data/level1.json", LevelData.class);
```

### File Handle Resolvers

| Resolver | Use Case |
|----------|----------|
| `InternalFileHandleResolver` | Default — reads from `assets/` (bundled with app) |
| `ExternalFileHandleResolver` | Reads from external storage (user downloads, mods) |
| `LocalFileHandleResolver` | App-local storage (save files) |

---

## Built-in Asset Loaders

| Loader | Asset Class | File Types |
|--------|-------------|------------|
| `TextureLoader` | `Texture` | `.png`, `.jpg`, `.bmp` |
| `TextureAtlasLoader` | `TextureAtlas` | `.atlas` |
| `BitmapFontLoader` | `BitmapFont` | `.fnt` |
| `FreeTypeFontLoader` | `BitmapFont` | `.ttf`, `.otf` (requires gdx-freetype) |
| `SoundLoader` | `Sound` | `.ogg`, `.wav`, `.mp3` |
| `MusicLoader` | `Music` | `.ogg`, `.wav`, `.mp3` |
| `SkinLoader` | `Skin` | `.json` (Scene2D UI skins) |
| `ParticleEffectLoader` | `ParticleEffect` | `.p` |
| `PixmapLoader` | `Pixmap` | `.png`, `.jpg` |
| `I18NBundleLoader` | `I18NBundle` | `.properties` |
| `ShaderProgramLoader` | `ShaderProgram` | `.vert` + `.frag` |

---

## Best Practices Summary

1. **Use AssetManager for all production assets.** Direct `new Texture()` is for quick prototypes only.
2. **Pack sprites into atlases.** This is the single biggest rendering optimization for 2D games.
3. **Use async loading with a loading screen.** Never block the main thread for more than a frame.
4. **Set `Texture.setAssetManager()`** on Android to handle OpenGL context loss.
5. **Never `dispose()` a managed asset directly.** Use `assets.unload()` to respect reference counting.
6. **Keep atlas size ≤ 2048x2048** for broad device compatibility. Use 1024 if targeting very old hardware.
7. **Use `Nearest` filtering for pixel art**, `Linear` or `MipMapLinearLinear` for HD art.
8. **Load everything you need for a screen before entering it.** Avoid loading in `render()`.
9. **Dispose the AssetManager in your `ApplicationListener.dispose()`** to prevent native memory leaks.
10. **Use `pack.json` inheritance** — put shared settings in the root, override per-subdirectory for special cases.
