# Heaps Architecture Overview

> **Category:** architecture · **Engine:** Heaps · **Related:** [heaps-arch-rules](../heaps-arch-rules.md), [HaxeFlixel Architecture](../../haxeflixel-arch/architecture/E1_architecture_overview.md)

Heaps is a cross-platform 2D/3D game framework written in Haxe, created by Nicolas Cannasse (creator of the Haxe language). It was developed through twenty years of game production at Motion-Twin and Shiro Games, powering commercial titles including Dead Cells, Northgard, and Evoland.

---

## Design Philosophy

Heaps is built around three core principles:

1. **Lightweight and customizable** — The framework provides building blocks, not rigid pipelines. The renderer, lighting system, and scene graph can all be extended or replaced entirely.
2. **GPU-first rendering** — All rendering is GPU-accelerated and shader-based, even for 2D. There is no software rendering fallback.
3. **Separation of platform and logic** — Low-level platform implementation (windowing, input, GPU backend) is cleanly separated from mid-level graphics logic and data, making it straightforward to port to new platforms.

## High-Level Architecture

```
┌─────────────────────────────────────────────────┐
│                  Your Game                       │
│              (extends hxd.App)                   │
├─────────────────────────────────────────────────┤
│          h2d (2D Scene Graph)                    │
│    Objects, Sprites, Text, Tilemaps, UI          │
├─────────────────────────────────────────────────┤
│          h3d (3D Scene Graph)                    │
│    Meshes, Models, Lights, Materials, Particles  │
├─────────────────────────────────────────────────┤
│          hxsl (Shader Language)                  │
│    Composable shader modules, runtime assembly   │
├─────────────────────────────────────────────────┤
│          hxd (Platform Abstraction)              │
│    App lifecycle, Resources, Sound, Timer, Input │
├─────────────────────────────────────────────────┤
│        HashLink VM / JS Runtime                  │
│   ┌──────────┬──────────┬────────────┐          │
│   │  hlsdl   │  hldx    │  WebGL 2   │          │
│   │(OpenGL/  │(DirectX  │(JavaScript │          │
│   │  SDL2)   │  11)     │  target)   │          │
│   └──────────┴──────────┴────────────┘          │
├─────────────────────────────────────────────────┤
│              Operating System                    │
│   Windows · macOS · Linux · Switch · PS · Xbox   │
└─────────────────────────────────────────────────┘
```

## Package Structure

### hxd — Platform Layer and Application Lifecycle

The `hxd` package is the foundation. It provides:

- **`hxd.App`** — Base class for all Heaps applications. Manages the main loop, provides `init()`, `update(dt)`, and exposes `s2d` (2D scene) and `s3d` (3D scene).
- **`hxd.Res`** — Compile-time validated resource manager. Paths to files in `res/` are checked at compile time, preventing runtime "file not found" errors.
- **`hxd.Key`** — Keyboard input polling (key states: down, pressed, released).
- **`hxd.Timer`** — Frame timing. `hxd.Timer.dt` provides delta time.
- **`hxd.snd.Manager`** — Audio playback and management.
- **`hxd.fs.*`** — Virtual filesystem abstraction (local files for desktop, embedded for web).

### h2d — 2D Scene Graph

The `h2d` package implements a hierarchical 2D scene graph. Every visible 2D element is an `h2d.Object` (or subclass) attached to the scene tree rooted at `s2d`.

**Object hierarchy:**

```
h2d.Object (base — transform, visibility, parent/child)
  ├── h2d.Drawable (base for renderable objects)
  │   ├── h2d.Bitmap (single texture/tile)
  │   ├── h2d.Anim (spritesheet animation)
  │   ├── h2d.Text (text rendering)
  │   ├── h2d.Graphics (vector drawing — lines, shapes, fills)
  │   └── h2d.TileGroup (batched tile rendering)
  ├── h2d.Interactive (input region — click, hover, drag)
  ├── h2d.Layers (ordered layer container)
  ├── h2d.Camera (viewport with transform)
  └── h2d.Mask (clip children to a rectangle)
```

**Key concepts:**
- Objects inherit transform from parents (position, rotation, scale).
- `h2d.Tile` represents a rectangular region of a texture. Bitmaps and Anims display Tiles.
- `h2d.Interactive` provides mouse/touch input regions without requiring a visible element.
- Filters (blur, glow, color matrix) can be applied to any Object.

### h3d — 3D Scene Graph

The `h3d` package mirrors the 2D pattern for 3D content, rooted at `s3d`:

- **`h3d.scene.Object`** — 3D scene graph node (transform, hierarchy).
- **`h3d.scene.Mesh`** — Renders a 3D mesh with a material.
- **`h3d.scene.Scene`** — Root of the 3D scene, manages the rendering pipeline.
- **`h3d.Camera`** — Perspective or orthographic camera.
- **`h3d.mat.Material`** — Base material; `h3d.mat.PbrMaterial` for physically-based rendering.
- **`h3d.scene.pbr.Renderer`** — Deferred PBR renderer (can be replaced with custom renderers).
- **`h3d.scene.Light`** — Directional, point, and spot lights.
- **`h3d.parts.GpuParticles`** — GPU-accelerated particle effects.
- **`h3d.prim.*`** — Built-in primitives (Cube, Sphere, Plane, etc.).
- **FBX model loading** — Native support for FBX format (Autodesk).

### hxsl — Heaps Shader Language

HXSL is a composable shader system written in Haxe syntax. Instead of monolithic shader files (GLSL/HLSL), you write small, focused shader modules that are composed and optimized at runtime:

```haxe
class MyShader extends hxsl.Shader {
    static var SRC = {
        @param var tint : Vec4;
        var pixelColor : Vec4;
        function fragment() {
            pixelColor *= tint;
        }
    };
}
```

**Key advantages:**
- Shaders compose automatically — add multiple shader effects to a material and they merge.
- Compile-time type checking via Haxe's type system.
- Cross-platform — compiled to GLSL, HLSL, or platform-specific formats as needed.
- Runtime optimization — unused shader paths are eliminated.

## Compilation Targets

| Target | Command | Output | GPU Backend | Use Case |
|--------|---------|--------|-------------|----------|
| HashLink VM | `-hl game.hl` | Bytecode | DirectX 11 or OpenGL/SDL2 | Development (JIT, fast iteration) |
| HashLink/C | `-hl game.c` | C source | Same + NVN, GNM | Shipping builds, consoles |
| JavaScript | `-js game.js` | JS bundle | WebGL 2 | Browser deployment |

The HashLink VM with JIT is the primary development target — it provides near-native performance with fast compile times. For shipping, HashLink/C generates C code that compiles with the platform's native toolchain, enabling console deployment.

## Resource Pipeline

Heaps provides a resource system centered on the `res/` directory:

1. **Compile-time validation** — `hxd.Res.path.to.file` is checked by the Haxe compiler. Typos and missing files are caught before runtime.
2. **Resource baking** — The `hxd` resource baking system converts assets from content creation tools (Photoshop, Maya, Blender) into optimized runtime formats.
3. **CastleDB integration** — Structured game data (items, enemies, levels) can be managed in CastleDB and accessed as typed data at compile time.

## Ecosystem Tools

- **HIDE** — Heaps IDE, a visual editor for level design, prefab editing, and scene composition. Built with Heaps itself.
- **CastleDB** — A structured database for game content. Exports typed Haxe code for compile-time access.
- **DomKit** — A CSS-like UI framework for building game interfaces with markup and style sheets.
- **HxBit** — Binary serialization and automatic network synchronization library.

## Performance Characteristics

- All rendering is GPU-based — no CPU-side pixel pushing.
- 2D rendering batches draw calls via `h2d.TileGroup` and internal batching.
- 3D rendering supports world batching for static geometry.
- HashLink JIT provides near-native performance for gameplay logic.
- HashLink/C native compilation matches C/C++ performance for shipping builds.
- The scene graph is lightweight — object overhead is minimal.

## Comparison with HaxeFlixel

Both frameworks use Haxe, but they have different architectures:

| Aspect | Heaps | HaxeFlixel |
|--------|-------|------------|
| Scene graph | Custom (h2d/h3d) | OpenFL display list (Flash-like) |
| 3D support | Full (h3d) | None (2D only) |
| Rendering | Direct GPU (hxsl shaders) | OpenFL → Lime → SDL2/WebGL |
| Shader system | HXSL (composable) | Limited (OpenFL shaders) |
| Built-in physics | None | Basic (velocity, acceleration, collide) |
| Target platforms | HashLink, JS | hxcpp (C++), JS, Neko |
| Console support | Yes (HashLink/C) | No |
| Philosophy | Lightweight, GPU-focused | Batteries-included 2D |

Choose Heaps for GPU-intensive games, 3D, or console targets. Choose HaxeFlixel for rapid 2D prototyping with built-in physics and collision.
