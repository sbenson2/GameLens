# Heaps — AI Rules

Engine-specific rules for projects using Heaps (Haxe game framework by Shiro Games). These supplement the engine-agnostic rules in `docs/core/ai-workflow/gamedev-rules.md`.

---

## Architecture Context

### Tech Stack

- **Framework:** Heaps (cross-platform 2D/3D game framework)
- **Language:** Haxe 4+ (cross-compiles to HashLink bytecode, HashLink/C native, or JavaScript)
- **Rendering:** GPU-accelerated via DirectX 11 (Windows), OpenGL/SDL2 (cross-platform), WebGL 2 (browser)
- **Audio Backend:** hlopenal (OpenAL bindings via HashLink)
- **Build System:** Haxe compiler + haxelib (package manager), configured via `.hxml` files
- **Platforms:** Windows, macOS, Linux (HashLink), HTML5/WebGL (JavaScript), Nintendo Switch, PS4, Xbox One (HashLink/C — requires registered developer)
- **Key Companion Libraries/Tools:**
  - DomKit (CSS-like UI framework)
  - HIDE (Heaps IDE — level editor, prefab editor)
  - CastleDB (structured data editor for game content)
  - HxBit (binary serialization and network sync)
  - hxsl (Heaps Shader Language — composable, runtime-assembled shaders)

### What Heaps Is (and Is Not)

Heaps is a **lightweight, highly customizable 2D/3D game framework** designed for high-performance games. It provides a scene graph, GPU rendering, resource management, and shader system. Its renderer and lighting system can be entirely replaced for game-specific pipelines.

Heaps is NOT a full game engine with an editor out of the box. HIDE exists as a separate level editor tool, but Heaps itself is code-driven. You build your game loop and systems by extending `hxd.App`.

Heaps was born from twenty years of game development at Motion-Twin (Dead Cells) and Shiro Games (Northgard, Evoland, Darksburg). All of these shipped games use the Heaps stack.

### Cross-Compilation Model

Haxe compiles to multiple backends. Heaps leverages this for cross-platform deployment:

```
Haxe Source (.hx files)
    │
    ├──► HashLink bytecode (.hl) ──► HashLink VM (JIT — fast iteration)
    │       └── Uses DirectX 11 (hldx) or OpenGL/SDL2 (hlsdl)
    │
    ├──► HashLink/C ──► Native C code ──► Platform compiler
    │       └── Targets: Windows, macOS, Linux, Switch (NVN), PS4 (GNM), Xbox One
    │
    └──► JavaScript (.js) ──► Browser (WebGL 2)
```

**HashLink** is the primary target for desktop development. It provides JIT execution for fast iteration and can also generate C code for native compilation and console deployment.

### Notable Games

- **Dead Cells** (Motion-Twin) — action roguelike
- **Northgard** (Shiro Games) — RTS
- **Evoland** / **Evoland 2** (Shiro Games) — adventure RPG
- **Darksburg** (Shiro Games) — co-op survival

### Project Structure Conventions

```
{ProjectName}/
├── src/
│   └── Main.hx              # Entry point (extends hxd.App)
├── res/                      # Resources (textures, sounds, fonts, data)
│   ├── sprites/
│   ├── sounds/
│   └── data/                 # CastleDB files, config
├── shaders/                  # Custom HXSL shaders (optional)
├── compile.hxml              # Haxe compiler configuration
├── .vscode/
│   └── launch.json           # VSCode HashLink debug config
└── README.md
```

---

## Module Architecture

Heaps is organized into four core packages:

| Package | Purpose |
|---------|---------|
| **h2d** | 2D rendering — scene graph, sprites, text, tilemaps, cameras, filters, UI interactions |
| **h3d** | 3D rendering — meshes, FBX models, particles, lighting, materials (PBR), shadows, world batching |
| **hxd** | Cross-platform layer — resource loading/baking, application lifecycle (`hxd.App`), sound, filesystem |
| **hxsl** | Heaps Shader Language — composable shader modules assembled and optimized at runtime |

### h2d Key Classes

- `h2d.Object` — Base scene graph node (transform, parent/child, visibility)
- `h2d.Bitmap` — Displays a single texture/tile
- `h2d.Anim` — Spritesheet animation
- `h2d.Text` — Text rendering with font support
- `h2d.Graphics` — Immediate-mode vector drawing
- `h2d.Interactive` — Click/hover/input detection region
- `h2d.TileGroup` — Batched tile rendering (tilemaps, particles)
- `h2d.Camera` — 2D viewport with pan, zoom, rotation
- `h2d.Layers` — Z-ordered layer management
- `h2d.Scene` — Root of the 2D scene graph (accessible via `s2d` in hxd.App)

### h3d Key Classes

- `h3d.scene.Object` — 3D scene graph node
- `h3d.scene.Mesh` — Renderable 3D mesh
- `h3d.scene.Scene` — Root of the 3D scene graph (accessible via `s3d` in hxd.App)
- `h3d.Camera` — 3D perspective/orthographic camera
- `h3d.mat.Material` / `h3d.mat.PbrMaterial` — Material system
- `h3d.scene.Light` — Point, directional, and spot lights
- `h3d.parts.GpuParticles` — GPU-accelerated particle system
- `h3d.prim.*` — Built-in primitives (cube, sphere, plane)

### hxd Key Classes

- `hxd.App` — Application base class (provides `init()`, `update()`, `s2d`, `s3d`)
- `hxd.Res` — Resource manager (compile-time checked resource access)
- `hxd.res.DefaultFont` — Built-in default font
- `hxd.Timer` — Frame timing (dt accessible via `hxd.Timer.dt`)
- `hxd.snd.Manager` — Sound/music playback

---

## Heaps-Specific Code Rules

### Application Lifecycle (hxd.App)

Every Heaps game extends `hxd.App` and overrides lifecycle methods:

```haxe
class Main extends hxd.App {
    override function init() {
        // Called once — set up scene, load resources
        var tf = new h2d.Text(hxd.res.DefaultFont.get(), s2d);
        tf.text = "Hello Heaps!";
    }

    override function update(dt:Float) {
        // Called every frame — game logic goes here
    }

    static function main() {
        new Main();
    }
}
```

- `init()` — One-time setup. `s2d` and `s3d` scenes are available here.
- `update(dt:Float)` — Called every frame with delta time.
- `s2d` — The root `h2d.Scene` (2D scene graph).
- `s3d` — The root `h3d.scene.Scene` (3D scene graph).

### Scene Graph — Add Objects to Scenes

All renderable objects must be added to a scene (or to a parent that is in a scene):

```haxe
// 2D: add to s2d or a child of s2d
var sprite = new h2d.Bitmap(hxd.Res.sprites.player.toTile(), s2d);

// 3D: add to s3d or a child of s3d
var mesh = new h3d.scene.Mesh(prim, mat, s3d);
```

Objects not in the scene tree will not render. The second constructor argument is the parent — passing `s2d` adds directly to the 2D root.

### Resource Management (hxd.Res)

Heaps provides compile-time checked resource access via `hxd.Res`:

```haxe
// Access res/sprites/player.png — compile error if file doesn't exist
var tile = hxd.Res.sprites.player.toTile();

// Sound
var sound = hxd.Res.sounds.explosion.play();
```

Resources live in the `res/` directory. The Haxe compiler validates paths at compile time — missing resources are caught before runtime.

For this to work, add `-D resourcesPath=res` to your `.hxml` file (or use the default).

### Compile Configuration (.hxml)

```hxml
# compile.hxml — HashLink target
-cp src
-lib heaps
-lib hlsdl          # OpenGL/SDL2 (cross-platform)
# -lib hldx         # DirectX 11 (Windows only)
-hl game.hl
-main Main
-debug
```

```hxml
# compile-js.hxml — JavaScript/WebGL target
-cp src
-lib heaps
-js game.js
-main Main
-debug
```

### Shaders (HXSL)

Heaps uses HXSL — composable shader modules written in Haxe syntax:

```haxe
class RedTint extends hxsl.Shader {
    static var SRC = {
        var pixelColor : Vec4;
        function fragment() {
            pixelColor.r += 0.3;
        }
    };
}

// Apply to a material or drawable:
sprite.addShader(new RedTint());
```

HXSL shaders are composed at runtime — multiple small shader effects are assembled and optimized together. This is a key architectural advantage over monolithic shader files.

### Input Handling

Heaps handles input through `hxd.Key` (keyboard) and scene interactions:

```haxe
// Keyboard (polling in update):
if (hxd.Key.isDown(hxd.Key.LEFT)) {
    player.x -= speed * dt;
}
if (hxd.Key.isPressed(hxd.Key.SPACE)) {
    jump();
}

// Mouse/touch (via h2d.Interactive):
var inter = new h2d.Interactive(64, 64, sprite);
inter.onClick = function(e) { trace("clicked!"); };
inter.onOver = function(e) { trace("hover"); };
```

---

## Build and Run

```bash
# Install Haxe 4+ and HashLink VM, then:
haxelib install heaps
haxelib install hlsdl        # OpenGL/SDL2 rendering
haxelib install hlopenal     # Audio
# On Windows, optionally:
haxelib install hldx         # DirectX 11 rendering

# Compile to HashLink bytecode:
haxe compile.hxml

# Run with HashLink VM:
hl game.hl

# Or compile to JavaScript:
haxe compile-js.hxml
# Open index.html in browser

# For native C compilation (shipping/consoles):
haxe compile.hxml -hl game.c
# Then compile generated C with platform toolchain
```

For VSCode, configure `launch.json` to run HashLink with F5 for a debug-and-run workflow.

---

## Common Mistakes to Catch

- Not extending `hxd.App` — the application lifecycle and scene graphs require it
- Forgetting to add objects to `s2d` or `s3d` (objects not in the scene tree are invisible)
- Using `s2d` or `s3d` before `init()` is called (they don't exist in the constructor)
- Not calling `super.init()` if overriding init with additional parent class logic
- Missing `-lib hlsdl` or `-lib hldx` in `.hxml` — no rendering backend available
- Assuming resources load asynchronously — `hxd.Res` is synchronous for HashLink, but may differ for JS
- Using `hxd.Res` without the `res/` directory or without proper resource path config
- Writing raw GLSL instead of HXSL — Heaps requires its shader language for the composable pipeline
- Forgetting `hxd.Timer.dt` for frame-rate-independent movement (or the `dt` parameter in `update()`)
- Creating h2d.Text without a font — use `hxd.res.DefaultFont.get()` as a fallback
- Mixing Heaps APIs with HaxeFlixel or OpenFL — they are separate frameworks with incompatible scene graphs
