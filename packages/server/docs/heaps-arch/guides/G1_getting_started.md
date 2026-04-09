# G1 — Heaps Getting Started

> **Category:** guide · **Engine:** Heaps · **Related:** [Architecture Overview](../architecture/E1_architecture_overview.md) · [Heaps Rules](../heaps-arch-rules.md) · [HaxeFlixel Getting Started](../../haxeflixel-arch/guides/G1_getting_started.md)

Heaps is a cross-platform 2D/3D game framework for Haxe, created by Nicolas Cannasse (the Haxe language creator) and battle-tested in commercial titles like Dead Cells, Northgard, and Evoland. This guide covers installation, project setup, and the core concepts you need to start building a game.

---

## Prerequisites

- **Haxe 4.3+** — The programming language that Heaps uses. Install from [haxe.org](https://haxe.org/download/).
- **HashLink** — The recommended runtime for desktop development. Heaps compiles to HashLink bytecode for fast iteration during development.
- **Visual Studio Code** with the **Haxe extension** — The recommended editor. Provides autocomplete, go-to-definition, and integrated debugging.

### Installing Heaps

After installing Haxe, use `haxelib` (Haxe's package manager) to install Heaps and its dependencies:

```bash
# Install Heaps and the HashLink runtime bindings
haxelib install heaps
haxelib install hlsdl      # SDL/OpenGL backend for HashLink (Linux/macOS/Windows)
haxelib install hldx       # DirectX backend for HashLink (Windows only, optional)

# Verify installation
haxelib list | grep heaps
```

On **macOS**, you can install HashLink via Homebrew:

```bash
brew install hashlink
```

On **Windows**, download the HashLink binary release from [github.com/HaxeFoundation/hashlink/releases](https://github.com/HaxeFoundation/hashlink/releases) and add it to your PATH.

On **Linux**, build HashLink from source or use your distribution's package manager if available.

---

## Project Structure

A minimal Heaps project has three files:

```
my-game/
├── src/
│   └── Main.hx          # Entry point
├── res/                  # Resource directory (images, sounds, etc.)
├── build.hxml            # Haxe compiler configuration
└── compile.hxml          # (alternative name — either works)
```

### build.hxml — Compiler Configuration

```hxml
# build.hxml — HashLink target (development)
-cp src
-main Main
-lib heaps
-lib hlsdl
-hl bin/game.hl
```

This tells the Haxe compiler to:
- Look for source files in `src/`
- Use `Main` as the entry point class
- Include the `heaps` and `hlsdl` libraries
- Output a HashLink bytecode file to `bin/game.hl`

### Building and Running

```bash
# Compile
haxe build.hxml

# Run with HashLink
hl bin/game.hl
```

During development, this compile-run cycle is very fast — typically under 2 seconds for small-to-medium projects.

---

## Minimal Application

Every Heaps application extends `hxd.App`, which manages the application lifecycle, the 2D scene (`s2d`), the 3D scene (`s3d`), and the main loop.

```haxe
// src/Main.hx
class Main extends hxd.App {

    override function init() {
        // Called once at startup — set up your game here
        trace("Hello from Heaps!");
    }

    override function update(dt:Float) {
        // Called every frame — dt is the time since last frame in seconds
    }

    static function main() {
        new Main();
    }
}
```

`hxd.App` provides three key overridable methods:

- **`init()`** — Called once after the window and GPU context are ready. Load assets and set up your initial scene here.
- **`update(dt)`** — Called every frame. `dt` is delta time in seconds (e.g., 0.016 at 60 FPS). Put game logic here.
- **`onResize()`** — Called when the window is resized. Update layout or camera here.

---

## Drawing a Sprite

Heaps uses a scene graph model. You create display objects and add them to the 2D scene (`s2d`). The three key types:

- **`h2d.Tile`** — A rectangular region of a texture (image data). Cannot be displayed on its own.
- **`h2d.Bitmap`** — A display object that draws a Tile on screen. Add it to the scene to see it.
- **`h2d.Object`** — The base class for all display objects. Bitmaps, text, and interactive objects all extend this.

```haxe
override function init() {
    // Load an image from the res/ directory as a Tile
    var tile = hxd.Res.player_idle.toTile();

    // Create a Bitmap to display it, parented to the 2D scene
    var sprite = new h2d.Bitmap(tile, s2d);

    // Position it
    sprite.x = 100;
    sprite.y = 200;

    // Scale and rotate
    sprite.scaleX = 2.0;
    sprite.rotation = Math.PI / 4;  // 45 degrees in radians
}
```

**Important:** For `hxd.Res` to work, place your image files in the `res/` directory. A file at `res/player_idle.png` becomes accessible as `hxd.Res.player_idle`. Heaps generates typed accessors at compile time — you get autocomplete and compile-time errors for missing files.

### Resource Directory Setup

Add this to your `build.hxml` if resources aren't loading:

```hxml
# Tell Heaps where to find resources
-D resourcesPath=res
```

---

## Sprite Sheet Animation

For animated sprites, use `h2d.Anim` with a tile grid:

```haxe
override function init() {
    // Load a sprite sheet and split it into a grid of tiles
    var sheet = hxd.Res.player_run.toTile();

    // Split into frames: each frame is 64x64, sheet is a single row
    var frames = sheet.gridFlatten(64);  // splits by width, auto-detects rows

    // Create an animation — plays at 12 FPS by default
    var anim = new h2d.Anim(frames, 12, s2d);
    anim.x = 200;
    anim.y = 150;

    // Control playback
    anim.loop = true;         // loop the animation
    anim.speed = 10;          // frames per second
    anim.pause = false;       // set to true to freeze
}
```

For sprite sheets organized in a grid (multiple rows and columns), use `tile.grid(tileWidth)` which returns a 2D array, or `tile.gridFlatten(tileWidth)` for a flat array of all frames.

---

## Handling Input

Heaps provides input through `hxd.Key` for keyboard and the scene's `interactive` system for mouse/touch.

### Keyboard Input

```haxe
override function update(dt:Float) {
    var speed = 200.0 * dt;

    // Polling: check if a key is currently held
    if (hxd.Key.isDown(hxd.Key.LEFT) || hxd.Key.isDown(hxd.Key.A))
        player.x -= speed;
    if (hxd.Key.isDown(hxd.Key.RIGHT) || hxd.Key.isDown(hxd.Key.D))
        player.x += speed;

    // Just pressed this frame (for jump, shoot, etc.)
    if (hxd.Key.isPressed(hxd.Key.SPACE))
        playerJump();

    // Just released this frame
    if (hxd.Key.isReleased(hxd.Key.ESCAPE))
        togglePause();
}
```

### Mouse Input

For mouse interaction, use `h2d.Interactive`:

```haxe
override function init() {
    var tile = hxd.Res.button.toTile();
    var bmp = new h2d.Bitmap(tile, s2d);

    // Create an interactive area over the bitmap
    var inter = new h2d.Interactive(tile.width, tile.height, bmp);
    inter.onClick = function(event) {
        trace("Button clicked!");
    };
    inter.onOver = function(event) {
        bmp.alpha = 0.8;  // hover effect
    };
    inter.onOut = function(event) {
        bmp.alpha = 1.0;
    };
}
```

For global mouse state (cursor position, buttons):

```haxe
override function update(dt:Float) {
    var mouseX = s2d.mouseX;
    var mouseY = s2d.mouseY;

    if (hxd.Key.isPressed(hxd.Key.MOUSE_LEFT))
        shoot(mouseX, mouseY);
}
```

---

## Playing Audio

```haxe
override function init() {
    // Sound effects — load and play
    var sfx = hxd.Res.sounds.explosion;
    sfx.play();                    // fire and forget
    sfx.play(0.5);                 // play at 50% volume

    // Music — get a channel for control
    var music = hxd.Res.music.background.play(true);  // true = loop
    music.volume = 0.3;
    music.pause = false;

    // Stop later
    // music.stop();
}
```

Place audio files in `res/sounds/` and `res/music/`. Heaps supports WAV and OGG formats. MP3 support depends on the target platform.

---

## Compilation Targets

Heaps compiles to multiple targets via Haxe's cross-compilation:

| Target | build.hxml flag | Use case |
|--------|----------------|----------|
| **HashLink** | `-hl bin/game.hl` | Development (fast compile, debuggable) |
| **HashLink/C** | `-hl bin/game.c` | Release builds (compile HL bytecode to native C, then to binary) |
| **JavaScript** | `-js bin/game.js` | Web builds (WebGL 2 required) |

### Web Build Example

```hxml
# build-web.hxml
-cp src
-main Main
-lib heaps
-js bin/game.js
```

Create an `index.html` that includes the compiled JS:

```html
<!DOCTYPE html>
<html>
<head><title>My Heaps Game</title></head>
<body>
    <canvas id="webgl" style="width:800px;height:600px"></canvas>
    <script src="game.js"></script>
</body>
</html>
```

### Native Release Build (HashLink/C)

For shipping, compile to C and then to a native executable:

```bash
# Step 1: Generate C code
haxe build.hxml -hl bin/game.c

# Step 2: Compile with your C compiler (details vary by platform)
# HashLink provides a CMake setup for this step
```

This produces a standalone native binary with no runtime dependency.

---

## Project Checklist

When starting a new Heaps project:

1. Install Haxe, HashLink, and the Heaps haxelib.
2. Create the directory structure: `src/`, `res/`, `build.hxml`.
3. Extend `hxd.App` — put setup in `init()`, logic in `update(dt)`.
4. Place assets in `res/` and access via `hxd.Res.*` (typed, compile-time checked).
5. Build with `haxe build.hxml`, run with `hl bin/game.hl`.
6. For web: switch target to `-js` and serve with any static file server.
7. For release: compile to HashLink/C for native performance.

---

## Next Steps

- Read the [Architecture Overview](../architecture/E1_architecture_overview.md) to understand Heaps' rendering pipeline and scene graph design.
- Explore `h2d.TileGroup` for efficient batch rendering of tilemaps.
- Look into `h2d.Flow` and `h2d.Object` hierarchies for building UI.
- Study `hxd.Timer` for fixed-timestep game loops.
- Check the [Heaps wiki](https://github.com/HeapsIO/heaps/wiki) and [Deepnight's GameBase](https://github.com/deepnight/gameBase) for a production-ready project template (used in Dead Cells).
