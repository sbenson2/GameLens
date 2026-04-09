# E1 — SDL3 Architecture Overview

> **Category:** explanation · **Engine:** SDL3 · **Related:** [SDL3 Rules](../sdl3-arch-rules.md) · [G1 Getting Started](../guides/G1_getting_started.md)

---

## What Is SDL3?

SDL (Simple DirectMedia Layer) 3 is a cross-platform multimedia library written in C99 that provides low-level access to audio, keyboard, mouse, joystick, and GPU hardware. It is the foundation layer beneath many commercial and indie games, and serves as the platform abstraction for engines like Valve's Source engine, the Godot engine (optionally), and hundreds of independent titles.

SDL3 was officially released in January 2025 as version 3.2.0, representing a major rewrite from SDL2 with modernized APIs, new subsystems, and improved consistency.

---

## Subsystem Architecture

SDL3 is organized into independent subsystems, each initialized separately via `SDL_Init()` flags:

| Subsystem | Flag | Purpose |
|-----------|------|---------|
| Video | `SDL_INIT_VIDEO` | Window creation, display management, OpenGL/Vulkan contexts |
| Audio | `SDL_INIT_AUDIO` | Audio device management, streaming playback and recording |
| Joystick | `SDL_INIT_JOYSTICK` | Low-level joystick/gamepad access |
| Gamepad | `SDL_INIT_GAMEPAD` | High-level gamepad mapping (built on joystick) |
| Haptic | `SDL_INIT_HAPTIC` | Force feedback / rumble |
| Events | `SDL_INIT_EVENTS` | Event queue (auto-initialized with most subsystems) |
| Camera | `SDL_INIT_CAMERA` | Webcam / capture device access (new in SDL3) |
| Sensor | `SDL_INIT_SENSOR` | Accelerometer, gyroscope (mobile/Switch) |

### New in SDL3 (Not in SDL2)

- **GPU API** — Cross-platform modern rendering (Vulkan/D3D12/Metal abstraction)
- **Camera API** — Webcam access with format negotiation
- **Dialog API** — Native file open/save dialogs
- **Filesystem API** — User directories, glob matching
- **Storage API** — Abstract storage (cloud save, title storage)
- **Pen API** — Pressure-sensitive pen/tablet input
- **Process API** — Cross-platform child process management
- **Properties API** — Type-safe key-value property bags on SDL objects
- **Async I/O** — io_uring (Linux) and IoRing (Windows) backed async file operations
- **Main Callbacks** — Optional event-driven app model without owning `main()`

---

## Application Models

SDL3 supports two application models:

### 1. Traditional Main Loop (SDL2 Compatible)

```c
int main(int argc, char *argv[]) {
    SDL_Init(SDL_INIT_VIDEO);
    SDL_Window *win = SDL_CreateWindow("Game", 800, 600, 0);
    bool running = true;
    while (running) {
        SDL_Event e;
        while (SDL_PollEvent(&e)) {
            if (e.type == SDL_EVENT_QUIT) running = false;
        }
        // update + render
    }
    SDL_DestroyWindow(win);
    SDL_Quit();
    return 0;
}
```

### 2. Main Callbacks (Recommended for New Projects)

The callback model delegates the main loop to SDL. You implement four functions: `SDL_AppInit`, `SDL_AppIterate`, `SDL_AppEvent`, and `SDL_AppQuit`. SDL calls them at the appropriate times. This model is **required** for correct behavior on platforms that don't allow apps to own the main loop (iOS, Emscripten) and is recommended for all new SDL3 projects.

See the rules file for the full callback pattern.

---

## Rendering Architecture

SDL3 offers two rendering paths:

### SDL_Renderer (2D, Simple)

The `SDL_Renderer` API is the simpler path for 2D games. It provides hardware-accelerated texture blitting, primitive drawing, and basic transformations. It works on top of whatever GPU backend is available.

Best for: 2D sprite games, pixel art, prototypes, UI rendering.

### SDL_GPU (3D, Modern)

The SDL_GPU API is the new cross-platform 3D rendering abstraction. It provides:

- **Device creation** with backend selection (Vulkan, D3D11, D3D12, Metal)
- **Graphics pipelines** — precalculated render state objects
- **Command buffers** — recorded GPU commands submitted in batches
- **Render passes** with color and depth attachments
- **Compute shaders** for GPU compute workloads
- **Shader cross-compilation** via SDL_shader_tools (SPIRV → target format)

The programming model follows modern GPU API conventions: create resources up front, record commands into buffers, submit for execution. This is fundamentally different from SDL2's immediate-mode SDL_Renderer approach.

Best for: 3D games, custom renderers, GPU compute, advanced 2D with shaders.

---

## Audio Architecture

SDL3's audio system was completely rewritten from SDL2:

- **SDL_AudioStream** is the primary API — push PCM data, bind to devices
- **Automatic device migration** — if headphones are unplugged, audio seamlessly moves to speakers
- **Logical vs physical devices** — your app binds to a logical device; SDL routes to physical hardware
- No more audio callbacks as the primary pattern (though low-level access is still possible)
- Built-in format conversion and resampling

---

## Platform Support

SDL3 targets: Windows (7+), macOS (10.13+), Linux (X11, Wayland), iOS (9+), Android (API 21+), Emscripten/WebAssembly, FreeBSD, NetBSD, OpenBSD, Haiku, and more.

The main callbacks model ensures consistent behavior across platforms with different main loop ownership models.

---

## When to Choose SDL3

**Choose SDL3 when:**
- You want maximum control over your game's architecture
- You need a stable, battle-tested platform abstraction layer
- You're building a custom engine or framework
- You need modern GPU access without Vulkan/D3D12/Metal directly
- Cross-platform support is a hard requirement

**Consider alternatives when:**
- You want a full game engine with editor, physics, scene graph (use Godot, Unity)
- You want built-in ECS, asset pipeline, and scripting (use Bevy, Macroquad)
- You're prototyping and want the simplest possible setup (use Raylib)
