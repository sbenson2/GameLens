# E1 — HaxeFlixel Architecture Overview

> **Category:** explanation · **Engine:** HaxeFlixel · **Related:** [HaxeFlixel Rules](../haxeflixel-arch-rules.md) · [G1 Getting Started](../guides/G1_getting_started.md)

---

## Philosophy: The Flash Game Renaissance, Natively

HaxeFlixel descends from the original ActionScript 3 Flixel library created by Adam "Atomic" Saltsman (creator of Canabalt). When Flash died, the Haxe community rebuilt Flixel on top of the Haxe language and OpenFL, preserving the simple, sprite-based game development model while gaining native compilation to every major platform.

Core design principles:

1. **Sprite-centric** — everything is a sprite, group, or state. No complex scene graphs.
2. **Batteries included** — collision, tilemaps, cameras, animation, audio, UI built in
3. **Cross-platform from one codebase** — Haxe compiles to C++ (native), JavaScript (web), and more
4. **Beginner-friendly** — clear API, extensive demos (80+ official examples), active community
5. **No editor required** — code-only framework, integrate with external tools (Tiled, Ogmo, Aseprite)

Notable games built with HaxeFlixel include Friday Night Funkin' and Defender's Quest.

---

## Technology Stack

HaxeFlixel sits atop a layered technology stack:

```
┌─────────────────────────────────────┐
│          Your Game Code             │  ← Haxe (.hx files)
├─────────────────────────────────────┤
│            HaxeFlixel               │  ← Game framework
│   (FlxState, FlxSprite, FlxGroup,   │     (sprites, collision, tilemaps,
│    FlxTilemap, FlxCamera, FlxG)     │      cameras, input, audio)
├─────────────────────────────────────┤
│              OpenFL                 │  ← Display/rendering API
│   (Flash-like display list, Stage,  │     (abstraction over native + web)
│    BitmapData, TextField, Sound)    │
├─────────────────────────────────────┤
│               Lime                  │  ← Low-level multimedia layer
│   (windowing, input, audio, assets, │     (platform abstraction)
│    OpenGL context, lifecycle)       │
├───────────────┬─────────────────────┤
│    hxcpp      │     JS Target       │  ← Compilation targets
│  (C++ output  │  (browser runtime)  │
│   via GCC/    │                     │
│   MSVC/Clang) │                     │
├───────────────┤                     │
│     SDL2      │   HTML5 Canvas /    │  ← Platform layer
│  (native)     │   WebGL             │
└───────────────┴─────────────────────┘
```

**Key insight:** HaxeFlixel does NOT use OpenFL's display list for game rendering. While OpenFL provides a Flash-like `Sprite`/`Stage` hierarchy, HaxeFlixel bypasses it for game objects. HaxeFlixel's `FlxSprite` draws directly to a buffer via its own rendering pipeline. OpenFL is used only for the underlying `BitmapData`, asset loading, and text rendering.

---

## Core Architecture

### The Game Loop

HaxeFlixel runs a fixed-timestep game loop managed by `FlxGame`:

```
FlxGame (created in Main.hx)
  │
  ├── Each frame:
  │   ├── 1. Process input events (from Lime/OpenFL)
  │   ├── 2. Call FlxState.update(elapsed) on active state
  │   │       └── Recursively updates all FlxBasic objects in the state
  │   ├── 3. Process collision/overlap callbacks
  │   ├── 4. Call FlxState.draw() on active state
  │   │       └── Recursively draws all FlxBasic objects
  │   └── 5. Update cameras, debug overlay
  │
  └── State transitions: FlxG.switchState(newState)
      └── Calls destroy() on old state, create() on new state
```

### FlxBasic: The Root

Every game object inherits from `FlxBasic`, which defines:

- `exists` — if false, object is completely skipped (no update, no draw)
- `alive` — if false, object is "dead" but still processes (for death animations)
- `active` — if false, `update()` is skipped but `draw()` still runs
- `visible` — if false, `draw()` is skipped but `update()` still runs
- `update(elapsed:Float)` — called each frame with delta time
- `draw()` — called each frame for rendering
- `kill()` — sets `exists = false`, `alive = false`
- `revive()` — sets `exists = true`, `alive = true`

### FlxObject: Physics and Collision

Extends FlxBasic with a physics body:

- **Position:** `x`, `y` (top-left corner)
- **Size:** `width`, `height` (collision box)
- **Motion:** `velocity`, `acceleration`, `drag`, `maxVelocity` (all Vector2)
- **Rotation:** `angle`, `angularVelocity`, `angularAcceleration`, `angularDrag`
- **Collision:** `immovable`, `solid`, `allowCollisions`, `touching`, `wasTouching`
- **Mass / Elasticity:** `mass`, `elasticity` for physics responses

HaxeFlixel's built-in physics is simple arcade-style (AABB separation). For complex physics, integrate Nape or use flixel-addons.

### FlxSprite: The Visual Workhorse

Extends FlxObject with rendering capabilities:

- **Graphics:** `loadGraphic()` (static image), `makeGraphic()` (solid color), `loadGraphicFromTexture()`
- **Animation:** `animation.add()`, `animation.play()` — frame-based spritesheet animation
- **Rendering:** `alpha`, `color` (tint), `blend` (blend mode), `scale`, `offset`, `origin`, `flipX`/`flipY`
- **Shader support:** Custom GLSL fragment shaders via `shader` property

### FlxGroup: The Container

`FlxTypedGroup<T:FlxBasic>` is the generic container. `FlxGroup` is an alias for `FlxTypedGroup<FlxBasic>`.

Key behaviors:
- `add(object)` — adds to the group (must be added to appear in game)
- `remove(object)` — removes from group
- `recycle(ObjectClass)` — returns a dead member or creates new (object pooling)
- `forEachAlive(callback)` — iterate living members
- Collision functions work with groups: `FlxG.collide(groupA, groupB)`

### FlxState: The Scene

FlxState extends FlxGroup and represents a complete game screen. Only one state is active at a time. States manage:

- Object creation and setup (`create()`)
- Per-frame logic (`update(elapsed)`)
- Cleanup (`destroy()`)

**FlxSubState** can overlay a state (pause menus, dialog boxes) without destroying the parent state.

---

## Asset Pipeline

Assets are declared in `Project.xml` and compiled into the target build:

```xml
<assets path="assets/images" rename="images" />
<assets path="assets/sounds" rename="sounds" />
<assets path="assets/data" rename="data" />
```

For native targets, assets are copied alongside the binary. For HTML5, assets are embedded or loaded via HTTP. Use `openfl.Assets` or `flixel.FlxAssets` to load at runtime.

Supported asset formats:
- **Images:** PNG (recommended), JPG, BMP
- **Audio:** OGG (recommended for music), WAV (short sounds), MP3 (web fallback)
- **Tilemaps:** CSV, TMX (Tiled), Ogmo JSON
- **Fonts:** TTF, OTF

---

## Cross-Platform Considerations

### Performance Characteristics

| Target | Compilation | Performance | GC | Notes |
|--------|-------------|-------------|-----|-------|
| Windows/macOS/Linux | Haxe → C++ → Native | Excellent | hxcpp GC (stop-the-world) | Best target for desktop games |
| HTML5 | Haxe → JavaScript | Good | Browser JS GC | Watch for draw call limits |
| Android | Haxe → C++ → NDK | Good | hxcpp GC | Test on low-end devices |
| iOS | Haxe → C++ → Xcode | Good | hxcpp GC | Requires Apple developer account |

### Compiler Conditionals

Use Haxe's conditional compilation for platform-specific behavior:

```haxe
#if html5
    // Web: reduce particle count for performance
    maxParticles = 100;
#elseif mobile
    // Mobile: enable touch controls
    enableTouchInput();
#elseif desktop
    // Desktop: enable keyboard/mouse
    maxParticles = 500;
#end

#if debug
    FlxG.debugger.visible = true;
#end
```

### Known Platform Gotchas

- **HTML5:** No filesystem access. Audio may need user interaction to start (browser autoplay policy). Some blend modes behave differently.
- **Android:** Touch input requires different handling. Back button fires as keyboard ESCAPE.
- **iOS:** Must handle app lifecycle (pause/resume) properly via FlxG signals.
- **Native (all):** The hxcpp garbage collector can cause frame hitches — use object pooling via `recycle()`.

---

## When to Choose HaxeFlixel

HaxeFlixel is a strong choice when:

- You're building a **2D game** (platformer, top-down, puzzle, shmup)
- You want **true cross-platform** from one codebase (native desktop + web + mobile)
- You prefer a **code-only workflow** with a sprite-based model
- You want **built-in collision, tilemaps, and cameras** without external dependencies
- You value **near-native performance** without writing C++

Consider alternatives when:

- You need **3D rendering** (HaxeFlixel is 2D only; see Heaps for Haxe 3D)
- You want a **visual editor** (Godot, Unity, etc.)
- You need **advanced physics** (HaxeFlixel's built-in physics is simple arcade-style)
- Your team doesn't want to learn **Haxe** (less mainstream than C#, Python, JavaScript)
- You need **console ports** (possible but requires commercial Haxe target licenses)
