# libGDX — AI Rules

Engine-specific rules for projects using libGDX. These supplement the engine-agnostic rules in `docs/core/ai-workflow/gamedev-rules.md`.

---

## Architecture Context

### Tech Stack

- **Framework:** libGDX (cross-platform Java/Kotlin game framework)
- **Language:** Java 8+ (primary), Kotlin (via KTX extensions)
- **Rendering:** OpenGL ES 2.0/3.0 (via custom LWJGL/Android/iOS/GWT backends)
- **Build System:** Gradle (multi-project layout)
- **Platforms:** Windows, macOS, Linux (LWJGL3), Android, iOS (RoboVM/MOE), HTML5 (GWT)
- **Key Extensions:**
  - KTX (Kotlin idiomatic wrappers, coroutines, type-safe builders)
  - Ashley (built-in ECS framework)
  - Box2D (physics, bundled)
  - gdx-ai (AI: steering behaviors, behavior trees, pathfinding)
  - gdx-controllers (gamepad support)

### What libGDX Is

libGDX is a **cross-platform game development framework** providing rendering, audio, input, file I/O, math, physics, and UI. It is NOT an engine with an editor — you write code, libGDX handles platform abstraction. Games deploy to desktop, Android, iOS, and web from a single codebase.

### Project Structure Conventions (Gradle Multi-Project)

```
{ProjectName}/
├── core/                   # Shared game code (all platforms)
│   └── src/main/java/
│       └── com/game/
│           ├── MyGame.java          # ApplicationAdapter entry point
│           ├── screens/             # Screen implementations
│           ├── entities/            # Game entities / ECS components
│           ├── systems/             # ECS systems (if using Ashley)
│           └── utils/               # Helpers, constants
├── desktop/                # Desktop launcher (LWJGL3)
│   └── src/main/java/
│       └── DesktopLauncher.java
├── android/                # Android launcher + manifest
├── ios/                    # iOS launcher (RoboVM)
├── html/                   # GWT/HTML5 launcher
├── assets/                 # Shared assets (textures, sounds, maps)
│   ├── textures/
│   ├── sounds/
│   ├── maps/
│   └── skins/              # Scene2D UI skins
├── build.gradle            # Root build config
└── gradle.properties
```

All game logic goes in `core/`. Platform launchers are thin wrappers that configure platform-specific settings and launch the core game class.

---

## libGDX-Specific Code Rules

### Application Lifecycle

libGDX uses the `ApplicationListener` interface (or `ApplicationAdapter` / `Game` convenience classes):

```java
public class MyGame extends ApplicationAdapter {
    @Override public void create()  { /* load assets, init state */ }
    @Override public void render()  { /* update + draw every frame */ }
    @Override public void resize(int width, int height) { /* handle resize */ }
    @Override public void pause()   { /* app backgrounded (mobile) */ }
    @Override public void resume()  { /* app foregrounded (mobile) */ }
    @Override public void dispose() { /* free all Disposable resources */ }
}
```

### Dispose Everything

Any class implementing `Disposable` MUST be disposed when no longer needed. Failing to dispose causes native memory leaks. Key disposables: `Texture`, `SpriteBatch`, `BitmapFont`, `ShaderProgram`, `Skin`, `Music`, `Sound`, `FrameBuffer`, `Pixmap`.

```java
// WRONG: Leaks GPU memory
Texture tex = new Texture("player.png");
// ... game runs ... game exits without tex.dispose()

// CORRECT: Always dispose
@Override
public void dispose() {
    tex.dispose();
    batch.dispose();
    font.dispose();
}
```

### Use AssetManager for Production

For anything beyond prototypes, use `AssetManager` for async loading, reference counting, and automatic disposal:

```java
AssetManager assets = new AssetManager();
assets.load("player.png", Texture.class);
assets.finishLoading(); // or check assets.update() each frame for async
Texture tex = assets.get("player.png", Texture.class);
// ...
assets.dispose(); // disposes all managed assets
```

### Screen Pattern for Game States

Use `Game` + `Screen` for multi-screen games:

```java
public class MyGame extends Game {
    @Override
    public void create() {
        setScreen(new MainMenuScreen(this));
    }
}

public class MainMenuScreen implements Screen {
    @Override public void show() { /* enter screen */ }
    @Override public void render(float delta) { /* update + draw */ }
    @Override public void hide() { /* leave screen */ }
    @Override public void dispose() { /* free screen resources */ }
    // ... resize, pause, resume
}
```

### SpriteBatch: Begin/End Required

All sprite drawing must occur between `batch.begin()` and `batch.end()`. Never nest batches or change blend modes / shaders inside a batch without ending and restarting.

### Kotlin with KTX

When generating Kotlin code for libGDX, use KTX extensions for idiomatic Kotlin:

```kotlin
// KTX application
class MyGame : KtxGame<KtxScreen>() {
    override fun create() {
        addScreen(GameplayScreen())
        setScreen<GameplayScreen>()
    }
}

// KTX coroutines for async loading
KtxAsync.launch {
    val texture = assetStorage.load<Texture>("player.png")
}

// KTX math operators
val position = vec2(10f, 20f)
val moved = position + vec2(5f, 0f)
```

Always prefer KTX equivalents when the project uses Kotlin.

---

## Common Mistakes to Catch

- Forgetting to dispose `Disposable` resources (memory leaks)
- Drawing outside `batch.begin()` / `batch.end()`
- Loading assets in the `render()` method (must load in `create()` or via AssetManager)
- Using `Gdx.files.internal()` paths with leading slashes (don't use `/assets/...`, use `player.png`)
- Not handling `resize()` for camera/viewport updates
- Putting platform-specific code in `core/` (use interfaces + platform injection)
- Using `Thread.sleep()` instead of libGDX timing (`Gdx.graphics.getDeltaTime()`)
- Ignoring `pause()`/`resume()` lifecycle on Android (causes crashes on backgrounding)
