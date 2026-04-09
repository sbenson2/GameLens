# E1 — Raylib Architecture Overview

> **Category:** explanation · **Engine:** Raylib · **Related:** [Raylib Rules](../raylib-arch-rules.md) · [G1 Getting Started](../guides/G1_getting_started.md)

---

## Philosophy: Simplicity as a Feature

Raylib was created by Ramón Santamaría (raysan5) as a teaching tool and has grown into a mature library used for commercial games, game jams, prototyping, and tools. Its core design principles are:

1. **No external dependencies** — everything compiles from source, no package managers needed
2. **Single header API** — include `raylib.h`, get everything
3. **C99** — maximum portability, trivial FFI to any language
4. **Explicit over implicit** — no hidden state machines, no magic callbacks
5. **Learn by doing** — 120+ official examples, each a self-contained file

The result is a library that a beginner can pick up in an afternoon but that has enough depth for shipping real games.

---

## Module Architecture

Raylib is structured as seven loosely-coupled modules that communicate through `raylib.h`:

```
┌──────────────────────────────────────────────┐
│                  raylib.h                     │  ← Single public header
├──────┬──────┬──────┬──────┬──────┬───────────┤
│rcore │rshap │rtex  │rtext │rmodel│  raudio   │  ← 6 implementation modules
│      │es    │tures │      │s     │           │
├──────┴──────┴──────┴──────┴──────┤           │
│              rlgl.h              │           │  ← OpenGL abstraction
├──────────────────────────────────┤           │
│     OpenGL 1.1/2.1/3.3/4.3      │  miniaudio│  ← Backend
│     OpenGL ES 2.0/3.0           │           │
└──────────────────────────────────┴───────────┘
```

### rcore — Platform Layer

Handles window creation, input (keyboard, mouse, gamepad, touch), timing (`GetFrameTime`, `SetTargetFPS`), file I/O utilities, and the platform abstraction. rcore is the only module that talks to the OS directly.

Platform backends include: GLFW (desktop), Android NDK, DRM (Raspberry Pi), SDL (optional alternative), and Emscripten.

### rlgl — OpenGL Abstraction

A standalone single-header library (`rlgl.h`) that wraps OpenGL into an immediate-mode-style API. It batches draw calls internally for performance. Key features:

- Automatic batching of geometry
- Shader management and default shaders
- Render texture (FBO) support
- VBO/VAO management
- Can be used independently of raylib

### rshapes — 2D Shape Drawing

Provides functions for drawing rectangles, circles, lines, triangles, polygons, and other 2D primitives. All shapes are rendered through rlgl's batching system.

### rtextures — Image and Texture Management

Image loading/saving (supports 12+ formats via stb_image), image manipulation (crop, resize, rotate, color operations), texture creation from images, and texture drawing with transforms.

### rtext — Font and Text

Font loading (TTF, BMFont, image fonts), text drawing with formatting, text measurement, Unicode support, and SDF font rendering for resolution-independent text.

### rmodels — 3D Models and Animation

3D model loading (OBJ, glTF, IQM, VOX, M3D), mesh generation (cube, sphere, plane, heightmap), skeletal animation, collision detection (ray-mesh, bounding boxes), and basic material system.

### raudio — Sound and Music

Audio device management via miniaudio (bundled), sound effects (fully loaded in memory), music streams (streamed from disk), and audio processing pipeline. Can be used as a standalone library.

---

## Rendering Pipeline

Raylib's rendering follows a simple frame-based model:

```
BeginDrawing()
  ├── ClearBackground()
  ├── [2D Drawing]           ← DrawTexture, DrawRectangle, DrawText, etc.
  ├── BeginMode3D(camera)
  │   └── [3D Drawing]      ← DrawModel, DrawCube, DrawGrid, etc.
  ├── EndMode3D()
  ├── BeginMode2D(camera)
  │   └── [2D with camera]  ← Scrolling, zoom, rotation
  ├── EndMode2D()
  └── [HUD Drawing]         ← UI elements drawn last, no camera transform
EndDrawing()                 ← Swaps buffers, rlgl submits batched draws
```

For off-screen rendering, wrap draw calls in `BeginTextureMode(target)` / `EndTextureMode()` using a `RenderTexture2D`.

### Custom Shaders

Raylib supports custom GLSL shaders through the `Shader` type:

```c
Shader shader = LoadShader("vertex.glsl", "fragment.glsl");
BeginShaderMode(shader);
    // Draw calls here use the custom shader
EndShaderMode();
```

Set uniforms with `SetShaderValue()` / `SetShaderValueMatrix()`.

---

## Input Handling

Raylib provides both **polling** and **state-change** input functions:

- **Polling (current frame):** `IsKeyDown()`, `IsMouseButtonDown()`, `GetMousePosition()`
- **State change (this frame):** `IsKeyPressed()`, `IsKeyReleased()`, `IsMouseButtonPressed()`
- **Gamepad:** `IsGamepadAvailable()`, `GetGamepadAxisMovement()`, `IsGamepadButtonPressed()`
- **Touch:** `GetTouchPointCount()`, `GetTouchPosition()`, `GetGestureDetected()`

All input functions are stateless from the caller's perspective — raylib tracks state internally per frame.

---

## Build System

Raylib supports multiple build approaches:

1. **Makefile** — provided for all platforms, simplest for C projects
2. **CMake** — `CMakeLists.txt` included, integrates with IDEs
3. **Premake** — alternative generator
4. **Source inclusion** — copy raylib source files directly into your project
5. **Package managers** — vcpkg, homebrew, apt, pacman, etc.

For language bindings, the binding's native package manager is typically used (pip, cargo, go get, nimble, etc.).

---

## When to Choose Raylib

**Choose Raylib when:**
- Learning game programming (best-in-class onboarding)
- Game jams (fast to set up, zero boilerplate)
- Prototyping gameplay ideas quickly
- You want full control without engine complexity
- Multi-language projects (70+ binding options)
- Embedding a game in a larger application

**Consider alternatives when:**
- You need a full 3D engine with PBR, scene graph, editor (use Godot)
- You need maximum GPU performance and modern rendering (use SDL3 + GPU API)
- You need built-in networking, physics, ECS out of the box
- Your team is large and needs collaborative tooling / editors
