# Raylib — AI Rules

Engine-specific rules for projects using Raylib. These supplement the engine-agnostic rules in `docs/core/ai-workflow/gamedev-rules.md`.

---

## Architecture Context

### Tech Stack

- **Library:** Raylib (simple C game programming library, no external dependencies)
- **Language:** C99 (primary), with 70+ language bindings
- **Rendering:** OpenGL 1.1, 2.1, 3.3, 4.3, ES 2.0, ES 3.0 (via rlgl abstraction)
- **Platforms:** Windows, macOS, Linux, Android, iOS, Raspberry Pi, HTML5 (Emscripten)
- **Key Companion Libraries:**
  - raygui (immediate-mode GUI)
  - rres (resource packaging)
  - rpng (PNG chunk management)

### What Raylib Is (and Is Not)

Raylib is a **simple, header-minimal game programming library** designed for learning and prototyping, but capable enough for shipping games. It has **zero external dependencies** — everything is bundled. The entire API is exposed through a single header: `raylib.h`.

Raylib is NOT a game engine. It provides no editor, no scene graph, no built-in ECS, and no asset pipeline. You write your game loop, your update logic, and your draw calls explicitly. This simplicity is the point.

### Popular Language Bindings

Raylib's C API makes binding to other languages straightforward. Actively maintained bindings include:

| Language | Binding | Notes |
|----------|---------|-------|
| C# | Raylib-CsLo, Raylib-cs | .NET / MonoGame alternative |
| Python | raylib-python-cffi | pip installable |
| Rust | raylib-rs | Cargo crate |
| Go | raylib-go | Idiomatic Go wrapper |
| Zig | raylib.zig | Zig package manager support |
| Nim | naylib | Nimble package |
| Java | jaylib | JNI bindings |
| Lua | raylua | Lightweight scripting |
| D | raylib-d | Dub package |

When generating code, always ask which language/binding the developer is using. Default to C unless specified.

### Project Structure Conventions

```
{ProjectName}/
├── src/
│   ├── main.c              # Entry point, game loop
│   ├── game.c/h            # Game state and update logic
│   ├── screens/            # Screen/state management
│   │   ├── screen_title.c
│   │   ├── screen_gameplay.c
│   │   └── screen_ending.c
│   └── entities/           # Entity logic (player, enemies)
├── resources/              # Textures, sounds, models, fonts
│   ├── textures/
│   ├── sounds/
│   ├── models/
│   └── fonts/
├── Makefile                # Or CMakeLists.txt
└── README.md
```

---

## Module Architecture

Raylib's source is split into seven modules, all exposed through `raylib.h`:

| Module | File | Purpose |
|--------|------|---------|
| Core | `rcore.c` | Window, input, timing, platform layer |
| Shapes | `rshapes.c` | 2D shape drawing (rectangles, circles, lines) |
| Textures | `rtextures.c` | Image/texture loading, manipulation, drawing |
| Text | `rtext.c` | Font loading, text drawing, text measurement |
| Models | `rmodels.c` | 3D model loading, mesh generation, animation |
| Audio | `raudio.c` | Audio device, sound/music loading and playback |
| GL | `rlgl.h` | OpenGL abstraction layer (standalone capable) |

`rlgl` and `raudio` can be used independently of raylib as standalone single-header libraries.

---

## Raylib-Specific Code Rules

### Game Loop Pattern

Raylib uses a traditional explicit game loop. Always structure code as:

```c
#include "raylib.h"

int main(void) {
    InitWindow(800, 600, "Game Title");
    SetTargetFPS(60);

    // Load resources here

    while (!WindowShouldClose()) {
        // Update game state

        BeginDrawing();
            ClearBackground(RAYWHITE);
            // Draw game objects
        EndDrawing();
    }

    // Unload resources here
    CloseWindow();
    return 0;
}
```

### Drawing Must Be Between BeginDrawing/EndDrawing

All draw calls MUST occur between `BeginDrawing()` and `EndDrawing()`. For 3D rendering, additionally wrap in `BeginMode3D()` / `EndMode3D()`. For render textures, use `BeginTextureMode()` / `EndTextureMode()`.

### Resource Loading After InitWindow

All resource loading (`LoadTexture`, `LoadSound`, `LoadModel`, etc.) MUST happen after `InitWindow()` and before `CloseWindow()`. The OpenGL context does not exist before `InitWindow()`.

### Prefer Built-in Types

Use raylib's built-in types: `Vector2`, `Vector3`, `Rectangle`, `Color`, `Camera2D`, `Camera3D`. Don't redefine equivalents.

### Screen Management Pattern

For multi-screen games, use the recommended screens pattern:

```c
typedef enum { TITLE, GAMEPLAY, ENDING } GameScreen;

GameScreen currentScreen = TITLE;

// In update:
switch (currentScreen) {
    case TITLE:    UpdateTitleScreen();    break;
    case GAMEPLAY: UpdateGameplayScreen(); break;
    case ENDING:   UpdateEndingScreen();   break;
}
```

Raylib provides official screen-based templates in the `raylib-game-template` repository.

---

## Common Mistakes to Catch

- Drawing outside `BeginDrawing()`/`EndDrawing()` blocks
- Loading resources before `InitWindow()`
- Not unloading resources before `CloseWindow()`
- Using raw OpenGL calls instead of rlgl equivalents
- Forgetting `SetTargetFPS()` (game runs at unlimited FPS, wastes CPU/GPU)
- Using wrong coordinate system (raylib: top-left origin, Y-down for 2D)
- Mixing 2D and 3D drawing without proper `BeginMode3D()`/`EndMode3D()` wrapping
- Assuming binding-specific API style when generating C code (or vice versa)
