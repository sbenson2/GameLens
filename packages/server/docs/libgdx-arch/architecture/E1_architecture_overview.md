# E1 — libGDX Architecture Overview

> **Category:** explanation · **Engine:** libGDX · **Related:** [libGDX Rules](../libgdx-arch-rules.md) · [G1 Getting Started](../guides/G1_getting_started.md)

---

## What Is libGDX?

libGDX is a cross-platform game development framework written in Java, with first-class Kotlin support via the KTX extension libraries. It provides rendering, audio, input, file I/O, math, physics, and UI — but it is not an engine with an editor. You write code; libGDX handles platform abstraction. A single codebase deploys to desktop (Windows, macOS, Linux), Android, iOS, and HTML5/WebAssembly.

libGDX was created by Mario Zechner (badlogic) and has been in active development since 2010. It powers thousands of published games, including titles on Steam, Google Play, and the App Store.

---

## Core Architecture

libGDX follows a **backend abstraction** pattern. Your game code lives in a shared `core` module that depends only on the libGDX API. Platform-specific backends implement those APIs using native libraries:

```
                    ┌─────────────────────────────┐
                    │         Your Game (core/)    │
                    │   ApplicationAdapter / Game  │
                    └──────────────┬──────────────┘
                                   │  depends on libGDX API
                    ┌──────────────┴──────────────┐
                    │        libGDX Framework      │
                    │  Graphics · Audio · Input    │
                    │  Files · Net · Math · Utils  │
                    └──────┬────┬────┬────┬───────┘
                           │    │    │    │
              ┌────────────┤    │    │    ├────────────┐
              ▼            ▼    ▼    │    ▼            ▼
          Desktop      Android  iOS  │   HTML5
          (LWJGL3)     (OpenGL  (Robo│   (GWT /
                        ES)    VM)   │   TeaVM)
                                     │
                              Headless (testing)
```

Each backend is a thin launcher that creates a platform-specific `Application` instance and hands control to your `ApplicationListener`. The key insight: **core game code never imports platform-specific classes**.

---

## Module Breakdown

### Application — Lifecycle and Entry Point

The `Application` interface is the central contract. Your game implements `ApplicationListener` (or extends `ApplicationAdapter` / `Game`):

| Callback | When Called | Purpose |
|----------|-----------|---------|
| `create()` | Once, at startup | Load assets, initialize state |
| `render()` | Every frame | Update logic + draw (no separate update/draw split) |
| `resize(w, h)` | On window/screen resize | Update cameras and viewports |
| `pause()` | App loses focus (mobile: backgrounded) | Save state, stop audio |
| `resume()` | App regains focus | Restore state |
| `dispose()` | App is shutting down | Free all native resources |

libGDX does not separate update from render. Both happen inside `render()`. Use `Gdx.graphics.getDeltaTime()` for frame-rate-independent logic.

### Graphics — Rendering

Access via `Gdx.graphics`. Provides:

- **OpenGL ES 2.0/3.0 wrappers** — `Gdx.gl20`, `Gdx.gl30` for raw GL calls
- **SpriteBatch** — High-performance 2D batched rendering (up to 8,191 sprites per batch)
- **ShapeRenderer** — Debug and prototype drawing (lines, rectangles, circles)
- **Cameras** — `OrthographicCamera` (2D) and `PerspectiveCamera` (3D)
- **Viewports** — `FitViewport`, `FillViewport`, `ExtendViewport` for resolution handling
- **Shaders** — `ShaderProgram` for custom GLSL ES shaders
- **FrameBuffers** — Off-screen render targets
- **3D** — `ModelBatch`, `ModelInstance`, PBR via gdx-gltf extension

The 2D rendering pipeline:

```
SpriteBatch.begin()
  ├── Draws are recorded and batched by texture
  ├── Batch auto-flushes when texture changes or buffer is full
  └── Up to 8,191 quads per flush (32,764 vertices)
SpriteBatch.end()
  └── Final flush, submits all remaining geometry to GPU
```

### Audio

Access via `Gdx.audio`. Two types:

| Type | Class | Behavior | Use Case |
|------|-------|----------|----------|
| Sound | `Sound` | Fully loaded into memory | Short effects (< 10s) |
| Music | `Music` | Streamed from disk | Background music, long audio |

Supported formats: WAV, MP3, OGG. Both types support volume, pitch, pan, and looping. `Sound` supports concurrent playback of the same sample.

### Input

Access via `Gdx.input`. Two patterns:

1. **Polling** — Check state each frame: `Gdx.input.isKeyPressed(Keys.SPACE)`, `Gdx.input.getX()`, `Gdx.input.isTouched()`
2. **Event-driven** — Implement `InputProcessor` and register with `Gdx.input.setInputProcessor()`. Receives `keyDown`, `keyUp`, `touchDown`, `touchUp`, `mouseMoved`, `scrolled` callbacks.

For UI, use `InputMultiplexer` to chain multiple processors (e.g., Stage first, then game input).

Gamepad support requires the `gdx-controllers` extension.

### Files

Access via `Gdx.files`. File handle types:

| Type | Method | Readable | Writable | Notes |
|------|--------|----------|----------|-------|
| Internal | `Gdx.files.internal()` | Yes | No | Bundled assets (textures, maps, sounds) |
| Local | `Gdx.files.local()` | Yes | Yes | App-private storage (save files) |
| External | `Gdx.files.external()` | Yes | Yes | User storage (SD card on Android) |
| Absolute | `Gdx.files.absolute()` | Yes | Yes | Desktop only — full filesystem path |
| Classpath | `Gdx.files.classpath()` | Yes | No | Java classpath resources |

**Important:** Always use `internal` for assets. Never prefix with `/assets/` — just use the filename relative to the assets root: `Gdx.files.internal("textures/player.png")`.

### Net — Networking

Access via `Gdx.net`. Provides:

- Simple HTTP GET/POST via `HttpRequestBuilder`
- TCP client and server sockets (low-level, non-blocking)
- `openURI()` to open URLs in the system browser

For multiplayer, most projects use external libraries (KryoNet, Netty, WebSockets via extensions).

---

## Scene2D — UI Framework

Scene2D is libGDX's built-in UI and scene graph system. It has two layers:

### Scene2D Core (scene graph)

A tree of `Actor` objects managed by a `Stage`. Actors have position, size, rotation, scale, color, and actions (tweens/animations). `Group` is an Actor that contains children.

```
Stage
├── Background (Image actor)
├── Player (custom Actor subclass)
├── EnemyGroup (Group)
│   ├── Enemy1
│   └── Enemy2
└── HUD (Table — Scene2D.ui)
```

The Stage owns a `SpriteBatch` and a `Viewport`. Call `stage.act(delta)` to update all actors and `stage.draw()` to render them.

### Scene2D.ui (widgets)

Built on top of Scene2D Core. Provides widgets: `Label`, `TextButton`, `TextField`, `SelectBox`, `Slider`, `ProgressBar`, `Window`, `Tree`, `List`, `ScrollPane`, and more.

Layout uses `Table` — a powerful layout system similar to HTML tables / CSS Grid. Tables can be nested for complex UIs.

Styling uses `Skin` — a JSON file that maps widget styles to fonts, colors, and 9-patch textures. Load with `new Skin(Gdx.files.internal("uiskin.json"))`.

### Event System

Scene2D uses a capture-then-bubble event model:

1. **Capture phase** — Event travels root → target. Parents can intercept.
2. **Normal phase** — Event travels target → root. Actors handle or pass up.

Register listeners with `actor.addListener(new ClickListener() { ... })`.

---

## Asset Management

### AssetManager (Recommended for Production)

```java
AssetManager assets = new AssetManager();
assets.load("player.png", Texture.class);
assets.load("bgm.ogg", Music.class);
assets.load("ui/skin.json", Skin.class);

// Async loading — call in render loop
if (assets.update()) {
    // All assets loaded, switch to game screen
}

// Or block (loading screen not shown):
assets.finishLoading();

// Retrieve
Texture player = assets.get("player.png", Texture.class);

// Cleanup — disposes everything
assets.dispose();
```

AssetManager handles: async/sync loading, dependency resolution, reference counting, and bulk disposal. Always use it for anything beyond prototypes.

### Texture Atlases

For performance, pack sprites into atlases using `TexturePacker` (bundled tool):

```bash
# CLI
java -cp gdx-tools.jar com.badlogic.gdx.tools.texturepacker.TexturePacker input/ output/ atlas
```

```java
// In code
TextureAtlas atlas = new TextureAtlas("atlas.atlas");
TextureRegion player = atlas.findRegion("player_idle");
```

Atlases reduce draw calls by batching sprites that share the same texture page.

---

## Kotlin with KTX

KTX is a set of Kotlin extensions that make libGDX idiomatic:

| KTX Module | What It Adds |
|------------|-------------|
| `ktx-app` | `KtxGame`, `KtxScreen`, `KtxApplicationAdapter` |
| `ktx-async` | Coroutine-based async loading via `AssetStorage` |
| `ktx-graphics` | Extension functions for `SpriteBatch`, `ShapeRenderer` |
| `ktx-math` | Operator overloads for `Vector2`, `Vector3`, `Matrix4` |
| `ktx-scene2d` | Type-safe DSL for building UI: `table { label("Score") }` |
| `ktx-collections` | libGDX collection extensions (avoid Java autoboxing) |
| `ktx-inject` | Lightweight dependency injection |

```kotlin
// KTX async asset loading (no callbacks, no blocking)
val assetStorage = AssetStorage()
KtxAsync.launch {
    val texture = assetStorage.load<Texture>("player.png")
    // texture is ready, use it
}
```

Always prefer KTX equivalents when the project uses Kotlin. They eliminate most of the Java boilerplate without adding runtime overhead.

---

## Platform Deployment

| Platform | Backend | Build | Notes |
|----------|---------|-------|-------|
| Desktop | LWJGL3 | `./gradlew desktop:dist` | Produces runnable JAR |
| Android | Android SDK + OpenGL ES | `./gradlew android:assembleRelease` | Standard APK/AAB |
| iOS | RoboVM (or Multi-OS Engine) | `./gradlew ios:launchIPhoneSimulator` | Requires macOS |
| HTML5 | GWT (or TeaVM) | `./gradlew html:dist` | Compiles Java → JavaScript |
| Headless | No rendering | For testing | Server-side game logic |

**Key constraint:** The HTML5/GWT backend does not support reflection, most of `java.io`, or Java 8+ features (lambdas, streams). Keep GWT-targeted code simple. TeaVM (community backend) lifts many of these restrictions.

---

## When to Choose libGDX

**Choose libGDX when:**
- You want a mature, battle-tested framework with a large community
- Your team knows Java or Kotlin
- You need true cross-platform from a single codebase (desktop + mobile + web)
- You want framework-level control without engine lock-in
- You're building 2D games (libGDX's 2D stack is exceptionally strong)

**Consider alternatives when:**
- You need a visual editor and drag-and-drop workflows (use Godot, Unity)
- You're doing AAA 3D with PBR, GI, large worlds (use Unreal, Unity)
- You want bleeding-edge rendering tech (use Bevy, custom SDL3+GPU)
- Your team doesn't know JVM languages and doesn't want to learn
