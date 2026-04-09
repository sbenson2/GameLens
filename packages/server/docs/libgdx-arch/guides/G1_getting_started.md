# G1 — libGDX Getting Started

> **Category:** guide · **Engine:** libGDX · **Related:** [Architecture Overview](../architecture/E1_architecture_overview.md) · [libGDX Rules](../libgdx-arch-rules.md)

---

## Prerequisites

- **JDK 17 or 21** — download from [Adoptium](https://adoptium.net/) (recommended) or use your IDE's bundled JDK
- **An IDE** — Android Studio, IntelliJ IDEA Community, or Eclipse
- **For Android targets:** Android SDK (included with Android Studio)
- **For iOS targets:** RoboVM OSS IntelliJ plugin + Xcode on macOS

### Which IDE?

| IDE | JDK Included | Android | iOS | Best For |
|-----|-------------|---------|-----|----------|
| **Android Studio** | Yes | Native support | Via RoboVM plugin | Mobile-first projects |
| **IntelliJ IDEA CE** | No (install JDK 17/21) | Needs Android SDK | Via RoboVM plugin | Desktop/multi-platform |
| **Eclipse** | No (install JDK 17/21) | Not officially supported | Via RoboVM plugin | Existing Eclipse users |

For newcomers targeting both desktop and mobile, **Android Studio** is the recommended choice since it bundles the JDK and Android SDK.

---

## Creating a New Project with gdx-liftoff

libGDX projects use Gradle for build management. The **gdx-liftoff** tool generates the project structure, build files, and starter code for you.

### Step 1: Download gdx-liftoff

Get the latest `.jar` from [github.com/libgdx/gdx-liftoff/releases](https://github.com/libgdx/gdx-liftoff/releases/latest).

### Step 2: Run It

```bash
java -jar gdx-liftoff-1.12.1.12.jar
```

Or double-click the `.jar` file. A GUI wizard opens.

### Step 3: Configure Your Project

The wizard walks you through these settings:

**Basic Info:**
- **Project name** — letters, numbers, underscores, dashes
- **Package** — e.g. `com.mygame.core`
- **Main class** — e.g. `MyGame`

**Platforms** (check the ones you want):
- **Core** — always required (shared game logic)
- **Desktop (LWJGL3)** — recommended for development/testing
- **Android** — mobile
- **iOS** — via RoboVM
- **HTML (GWT)** — browser deployment

**Language:**
- **Java** — default, widest documentation
- **Kotlin** — first-class support, recommended for new projects
- **Groovy / Scala** — supported but less common

**Extensions** (optional):
- **Box2D** — 2D physics
- **Bullet** — 3D physics
- **FreeType** — TrueType/OpenType font rendering
- **Controllers** — gamepad input
- **Ashley** — entity-component-system framework
- **AI** — pathfinding, steering, behavior trees

**libGDX Version:** Use the latest stable release (currently **1.14.0**). Snapshot builds (`1.14.1-SNAPSHOT`) may contain breaking changes.

### Step 4: Generate and Import

Click **Generate** and the tool creates a Gradle project directory. Import it into your IDE:

- **IntelliJ / Android Studio:** File → Open → select the project root folder
- **Eclipse:** File → Import → Gradle → Existing Gradle Project

The first build downloads dependencies and may take a few minutes.

---

## Project Structure

gdx-liftoff generates a multi-module Gradle project:

```
my-game/
├── core/                  ← Shared game code (all platforms)
│   └── src/main/java/
│       └── com/mygame/core/
│           └── MyGame.java
├── lwjgl3/                ← Desktop launcher
│   └── src/main/java/
│       └── com/mygame/lwjgl3/
│           └── Lwjgl3Launcher.java
├── android/               ← Android launcher (if selected)
│   └── src/main/java/
│       └── com/mygame/android/
│           └── AndroidLauncher.java
├── html/                  ← GWT/browser launcher (if selected)
├── ios/                   ← RoboVM launcher (if selected)
├── assets/                ← Shared game assets (textures, sounds, etc.)
├── build.gradle           ← Root build config
├── settings.gradle        ← Module declarations
└── gradle.properties      ← Version pins
```

**The `core` module is where you write your game.** Platform modules are thin launchers that create a window/activity and instantiate your core game class.

---

## Your First Game Class (Java)

```java
package com.mygame.core;

import com.badlogic.gdx.ApplicationAdapter;
import com.badlogic.gdx.Gdx;
import com.badlogic.gdx.graphics.GL20;
import com.badlogic.gdx.graphics.Texture;
import com.badlogic.gdx.graphics.g2d.SpriteBatch;

public class MyGame extends ApplicationAdapter {
    SpriteBatch batch;
    Texture img;

    @Override
    public void create() {
        batch = new SpriteBatch();
        img = new Texture("badlogic.jpg");  // from assets/ folder
    }

    @Override
    public void render() {
        // Clear screen
        Gdx.gl.glClearColor(0.15f, 0.15f, 0.2f, 1f);
        Gdx.gl.glClear(GL20.GL_COLOR_BUFFER_BIT);

        // Draw texture
        batch.begin();
        batch.draw(img, 140, 210);
        batch.end();
    }

    @Override
    public void dispose() {
        batch.dispose();
        img.dispose();
    }
}
```

### The Same Game in Kotlin

```kotlin
package com.mygame.core

import com.badlogic.gdx.ApplicationAdapter
import com.badlogic.gdx.Gdx
import com.badlogic.gdx.graphics.GL20
import com.badlogic.gdx.graphics.Texture
import com.badlogic.gdx.graphics.g2d.SpriteBatch

class MyGame : ApplicationAdapter() {
    private lateinit var batch: SpriteBatch
    private lateinit var img: Texture

    override fun create() {
        batch = SpriteBatch()
        img = Texture("badlogic.jpg")
    }

    override fun render() {
        Gdx.gl.glClearColor(0.15f, 0.15f, 0.2f, 1f)
        Gdx.gl.glClear(GL20.GL_COLOR_BUFFER_BIT)

        batch.begin()
        batch.draw(img, 140f, 210f)
        batch.end()
    }

    override fun dispose() {
        batch.dispose()
        img.dispose()
    }
}
```

To use Kotlin, select it as your language in gdx-liftoff. The tool configures the Kotlin Gradle plugin and provides Kotlin-based launcher templates.

---

## Running Your Game

### Desktop (fastest iteration)

```bash
# From project root
./gradlew lwjgl3:run
```

Or in your IDE: run the `Lwjgl3Launcher` main class directly. This is the fastest way to test during development.

### Android

```bash
./gradlew android:installDebug
```

Or use Android Studio's Run button with an emulator or connected device.

### HTML/Browser

```bash
./gradlew html:superDev
```

Opens a GWT dev server at `http://localhost:8080`. Changes hot-reload on refresh.

---

## Application Lifecycle

libGDX calls these methods on your `ApplicationListener` (or `ApplicationAdapter`) in order:

| Method | When Called | Use For |
|--------|------------|---------|
| `create()` | Once at startup | Load assets, set up initial state |
| `resize(w, h)` | On window/screen resize | Update cameras, viewports |
| `render()` | Every frame (~60fps) | Game logic + drawing |
| `pause()` | App loses focus (mobile: backgrounded) | Save state, pause music |
| `resume()` | App regains focus | Restore state |
| `dispose()` | App closing | Free GPU resources (textures, batches) |

**Important:** `dispose()` is your responsibility. libGDX does not garbage-collect GPU resources. Every `Texture`, `SpriteBatch`, `ShaderProgram`, `FrameBuffer`, and `Music` object you create must be disposed when no longer needed.

---

## Managing Assets

Place all game assets in the `assets/` directory at the project root. All platforms load from here.

For larger projects, use the **AssetManager** for async loading:

```java
AssetManager assets = new AssetManager();
assets.load("player.png", Texture.class);
assets.load("music.ogg", Music.class);

// In render loop, call until loading is complete
if (assets.update()) {
    // All assets loaded — switch to game screen
    Texture player = assets.get("player.png", Texture.class);
}
```

`AssetManager` handles reference counting and disposes assets when you call `assets.dispose()`.

---

## Kotlin Extensions: ktx Libraries

If you're using Kotlin, the [**libktx**](https://github.com/libktx/ktx) libraries provide idiomatic extensions:

```kotlin
// build.gradle.kts
implementation("io.github.libktx:ktx-app:1.14.0-rc1")
implementation("io.github.libktx:ktx-graphics:1.14.0-rc1")
implementation("io.github.libktx:ktx-assets:1.14.0-rc1")
```

Key modules: `ktx-app` (lifecycle), `ktx-graphics` (drawing DSLs), `ktx-scene2d` (UI builder), `ktx-ashley` (ECS extensions), `ktx-box2d` (physics DSL).

---

## Java Version Compatibility

| Java Version | Desktop (LWJGL3) | Android | HTML (GWT) | iOS |
|-------------|-------------------|---------|------------|-----|
| 8 | Yes | Yes | Yes | Yes |
| 11 | Yes | Yes | Yes | Yes |
| 17 | Yes | Yes | Limited | Yes |
| 21+ | Yes | Check Gradle version | No | Check RoboVM |

**Recommendation:** Use **Java 8 source compatibility** in `build.gradle` for maximum platform reach, even if your JDK is 17 or 21. gdx-liftoff sets this up by default.

---

## Next Steps

- **Screens and transitions** — Use `Game` + `Screen` classes to manage multiple game states
- **Scene2D UI** — Built-in retained-mode UI toolkit for menus and HUDs
- **Tiled map support** — Load `.tmx` tilemaps with `TmxMapLoader`
- **Physics** — Add Box2D extension for 2D collision and rigid body simulation
- **3D rendering** — Use `ModelBatch` and `PerspectiveCamera` for 3D scenes
