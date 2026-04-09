# G2 — libGDX with Kotlin and KTX

> **Category:** guide · **Engine:** libGDX · **Related:** [Architecture Overview](../architecture/E1_architecture_overview.md) · [Getting Started](G1_getting_started.md) · [libGDX Rules](../libgdx-arch-rules.md)

Kotlin is a first-class language for libGDX development. The **KTX** library (libktx) provides idiomatic Kotlin extensions that reduce boilerplate, add type safety, and leverage Kotlin features like coroutines, DSL builders, and extension functions. This guide covers setting up Kotlin with libGDX and the most useful KTX patterns for game development.

---

## Setting Up Kotlin with gdx-liftoff

The easiest way to start a Kotlin libGDX project is **gdx-liftoff**, which has native Kotlin support:

1. In gdx-liftoff, select **Kotlin** as the project language
2. Under **Third-party extensions**, check the KTX modules you need
3. Generate the project — Gradle is configured with the Kotlin plugin and KTX dependencies automatically

### Manual Setup (Existing Java Project)

Add the Kotlin Gradle plugin and KTX dependencies to your `build.gradle.kts`:

```kotlin
// root build.gradle.kts
plugins {
    kotlin("jvm") version "1.9.22" apply false
}

// In your core module build.gradle.kts
plugins {
    kotlin("jvm")
}

val ktxVersion = "1.12.1-rc1" // Match your libGDX version

dependencies {
    implementation("io.github.libktx:ktx-app:$ktxVersion")
    implementation("io.github.libktx:ktx-graphics:$ktxVersion")
    implementation("io.github.libktx:ktx-assets-async:$ktxVersion")
    // Add more KTX modules as needed
}
```

KTX versions are aligned with libGDX versions — use the KTX version that matches your libGDX version (e.g., `1.12.1-rc1` for libGDX 1.12.1).

---

## KTX Module Overview

KTX is modular by design. Each module is a thin Kotlin wrapper around a specific part of libGDX. You include only what you use.

### Core Modules

| Module | What It Does |
|--------|-------------|
| `ktx-app` | `KtxApplicationAdapter`, `KtxScreen`, simplified lifecycle |
| `ktx-graphics` | `ShapeRenderer` DSL, `Batch` extensions, `Color` utilities |
| `ktx-assets-async` | Non-blocking asset loading with Kotlin coroutines |
| `ktx-scene2d` | Type-safe DSL builders for Scene2D UI widgets |
| `ktx-style` | Type-safe `Skin` builder DSL |
| `ktx-log` | Lightweight logging with lazy message evaluation |
| `ktx-math` | Operator overloads for `Vector2`, `Vector3`, `Matrix4` |

### Entity Component System Modules

| Module | What It Does |
|--------|-------------|
| `ktx-ashley` | Extensions for the Ashley ECS — component mappers, entity builders |
| `ktx-artemis` | Extensions for the Artemis-odb ECS |

### Platform & I/O Modules

| Module | What It Does |
|--------|-------------|
| `ktx-json` | Kotlin-friendly JSON serialization/deserialization |
| `ktx-preferences` | Type-safe `Preferences` wrappers |
| `ktx-box2d` | DSL builders for Box2D bodies, fixtures, and joints |
| `ktx-inject` | Lightweight dependency injection without reflection |
| `ktx-async` | Coroutine context based on libGDX's threading model |

---

## Pattern: Application and Screen Lifecycle

### Java Approach (Verbose)

```java
public class MyGame extends Game {
    private SpriteBatch batch;

    @Override
    public void create() {
        batch = new SpriteBatch();
        setScreen(new GameScreen(batch));
    }

    @Override
    public void dispose() {
        batch.dispose();
    }
}
```

### Kotlin + KTX Approach (Idiomatic)

```kotlin
import ktx.app.KtxGame
import ktx.app.KtxScreen

// KtxGame manages screens and provides clearScreen utility
class MyGame : KtxGame<KtxScreen>() {
    override fun create() {
        // addScreen registers a screen by its class
        addScreen(GameScreen())
        setScreen<GameScreen>()
    }
}

class GameScreen : KtxScreen {
    // KtxScreen provides no-op defaults for all methods —
    // override only what you need (no empty stubs)
    private val batch = SpriteBatch()

    override fun render(delta: Float) {
        // clearScreen is a ktx-app extension — clears color buffer in one call
        clearScreen(0.1f, 0.1f, 0.15f)
        batch.use { // .use opens, draws, and closes the batch safely
            // draw calls here
        }
    }

    override fun dispose() {
        batch.dispose()
    }
}
```

**Why this is better:** `KtxScreen` provides default no-op implementations for all lifecycle methods, so you only override what you need. `KtxGame` adds type-safe screen management. The `batch.use { }` extension handles `begin()`/`end()` pairing automatically, preventing the common bug of forgetting to call `end()`.

---

## Pattern: Type-Safe Scene2D UI

Building UI in Java with Scene2D requires verbose, nested method chains. KTX's `ktx-scene2d` module provides a type-safe DSL:

### Java Approach

```java
Table root = new Table();
root.setFillParent(true);
root.add(new Label("Score: 0", skin)).padTop(10f).left();
root.row();
TextButton btn = new TextButton("Play", skin);
btn.addListener(new ChangeListener() {
    @Override
    public void changed(ChangeEvent event, Actor actor) {
        startGame();
    }
});
root.add(btn).width(200f).height(60f).padTop(20f);
stage.addActor(root);
```

### Kotlin + KTX Approach

```kotlin
import ktx.scene2d.*

stage.actors {
    table {
        setFillParent(true)

        label("Score: 0") {
            it.padTop(10f).left()
        }
        row()
        textButton("Play") {
            it.width(200f).height(60f).padTop(20f)
            onChange { startGame() }
        }
    }
}
```

**Why this is better:** The DSL mirrors the widget hierarchy visually. Each widget block implicitly creates and adds the widget to its parent. `onChange` is a concise shorthand for `ChangeListener`. The `it` parameter is the `Cell` reference for layout configuration.

---

## Pattern: Coroutine-Based Asset Loading

Loading assets on a background thread is essential for smooth loading screens. KTX replaces `AssetManager` callbacks with Kotlin coroutines:

```kotlin
import ktx.assets.async.AssetStorage
import ktx.async.KtxAsync

class LoadingScreen(private val game: MyGame) : KtxScreen {
    // AssetStorage is a coroutine-based replacement for AssetManager
    private val assets = AssetStorage()

    override fun show() {
        // Initialize KTX coroutine context (call once, typically in create())
        KtxAsync.initiate()

        // Launch a coroutine to load assets without blocking the render thread
        KtxAsync.launch {
            // Each load call suspends until the asset is ready
            val atlas = assets.load<TextureAtlas>("sprites.atlas")
            val font  = assets.load<BitmapFont>("ui.fnt")
            val music = assets.load<Music>("theme.ogg")

            // All assets loaded — switch screen on the main thread
            Gdx.app.postRunnable {
                game.setScreen<GameScreen>()
            }
        }
    }

    override fun render(delta: Float) {
        clearScreen(0f, 0f, 0f)
        // Draw progress bar using assets.progress.percent (0f..1f)
    }

    override fun dispose() {
        assets.dispose() // Disposes all loaded assets
    }
}
```

**Why this is better:** `AssetStorage` uses Kotlin's structured concurrency. The `load` calls suspend (not block) until each asset is ready, and errors propagate naturally through coroutine exception handling. No polling loops or callbacks needed.

---

## Pattern: Math Operator Overloads

The `ktx-math` module adds operator overloads to `Vector2`, `Vector3`, and `Matrix4`:

```kotlin
import ktx.math.*

// Java: new Vector2(player.x + velocity.x * delta, player.y + velocity.y * delta)
// Kotlin + KTX:
val newPos = playerPos + velocity * delta

// Destructuring
val (x, y) = playerPos

// In-place operations (no allocation)
playerPos += velocity * delta

// Dot product, length, distance
val speed = velocity.len()
val dist = playerPos.dst(targetPos)
val dot = direction dot normal
```

**Why this is better:** Reads like math notation. The `*` and `+` operators are inlined by the Kotlin compiler, so there is zero overhead compared to manual field arithmetic.

---

## Pattern: Dependency Injection with ktx-inject

`ktx-inject` is a simple, reflection-free DI container. You register singletons and factories at startup, then retrieve them anywhere:

```kotlin
import ktx.inject.Context
import ktx.inject.register

// At startup
val context = Context()
context.register {
    bindSingleton(SpriteBatch())
    bindSingleton(AssetStorage())
    bindSingleton<GameScreen>(GameScreen(inject(), inject()))
    // inject() resolves the dependency by type at registration time
}

// Anywhere in code
val batch: SpriteBatch = context.inject()
```

This keeps your game classes decoupled without the weight of a full DI framework. There is no reflection and no annotation processing — everything resolves at registration time.

---

## Pattern: Box2D DSL

Building physics worlds in Java is verbose. KTX's `ktx-box2d` provides a DSL:

```kotlin
import ktx.box2d.*

val world = createWorld()

// Create a dynamic body with a circle fixture in one expression
val player = world.body {
    type = BodyDef.BodyType.DynamicBody
    position.set(5f, 10f)

    circle(radius = 0.5f) {
        density = 1f
        friction = 0.3f
        restitution = 0.1f
    }
}

// Create a static platform with an edge shape
val ground = world.body {
    edge(from = vec2(0f, 0f), to = vec2(20f, 0f)) {
        friction = 0.8f
    }
}
```

---

## Java-to-Kotlin Interop Notes

libGDX is written in Java. When calling libGDX APIs from Kotlin, keep these in mind:

1. **Nullability:** libGDX APIs do not have nullability annotations. Kotlin treats return types from Java as _platform types_ (e.g., `String!`), meaning the compiler does not enforce null checks. Be explicit with `?` when you know a value can be null.

2. **Array types:** libGDX uses custom `Array<T>`, `IntArray`, and `FloatArray` classes (not `java.util` collections). These work in Kotlin but do not have Kotlin collection extensions by default. KTX adds `.forEach`, `.map`, and other extensions for libGDX collection types.

3. **Lambda SAM conversion:** Kotlin automatically converts lambdas to single-abstract-method Java interfaces. This is why `onClick { }` works instead of creating an anonymous `ClickListener` subclass.

4. **GDX.app.postRunnable:** Use this for thread-safe callbacks from coroutines, just as you would in Java. KTX's `KtxAsync` context dispatches to the render thread by default.

---

## Recommended Project Structure

```
core/src/
├── com/mygame/
│   ├── MyGame.kt              # KtxGame subclass, screen registration
│   ├── screens/
│   │   ├── LoadingScreen.kt   # Coroutine-based asset loading
│   │   ├── MenuScreen.kt      # Scene2D UI with ktx-scene2d
│   │   └── GameScreen.kt      # Gameplay with ECS or direct rendering
│   ├── ecs/                   # Entity component system (if using Ashley/Artemis)
│   │   ├── components/
│   │   └── systems/
│   ├── ui/                    # Shared UI widgets and styles
│   └── util/                  # Extensions, constants, helpers
```

---

## When to Use Kotlin vs. Java with libGDX

**Use Kotlin when:** you are starting a new project, you want cleaner UI code with Scene2D, you need coroutine-based asset loading, or your team already knows Kotlin.

**Stick with Java when:** you are maintaining a large existing Java codebase, your team is more comfortable with Java, or you need maximum compatibility with older libGDX tutorials and sample code (most community examples are in Java).

**Mixing is fine:** Kotlin and Java interoperate seamlessly in the same Gradle module. You can adopt KTX incrementally — add `ktx-app` first, then bring in more modules as needed.
