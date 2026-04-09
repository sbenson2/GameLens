# SDL3 — AI Rules

Engine-specific rules for projects using SDL3 (Simple DirectMedia Layer 3). These supplement the engine-agnostic rules in `docs/core/ai-workflow/gamedev-rules.md`.

---

## Architecture Context

### Tech Stack

- **Library:** SDL3 (cross-platform multimedia library, C99)
- **Language:** C (primary), with bindings for C#, Rust, Python, Zig, and others
- **GPU Backends:** Vulkan, Direct3D 11/12, Metal, OpenGL (via SDL_GPU API)
- **Platforms:** Windows, macOS, Linux, iOS, Android, Emscripten, and more
- **Key Companion Libraries:**
  - SDL_image (image loading beyond BMP)
  - SDL_ttf (TrueType font rendering)
  - SDL_mixer (multi-channel audio mixing)
  - SDL_net (cross-platform networking)
  - SDL_shader_tools (shader cross-compilation)

### What SDL3 Is (and Is Not)

SDL3 is a **low-level multimedia abstraction layer**, not a game engine. It provides windowing, input, audio, GPU access, filesystem, and platform abstraction. You build your game loop, renderer, and systems on top of it. Games using SDL3 typically pair it with a rendering approach (SDL_Renderer for 2D, SDL_GPU for modern 3D) and additional libraries for physics, ECS, UI, etc.

### Project Structure Conventions

```
{ProjectName}/
├── src/
│   ├── main.c              # SDL_AppInit / SDL_AppIterate / SDL_AppQuit (callback model)
│   ├── game.c/h            # Game state and logic
│   ├── renderer.c/h        # Rendering abstraction (SDL_Renderer or SDL_GPU)
│   ├── input.c/h           # Input mapping
│   └── audio.c/h           # Audio stream management
├── assets/                 # Textures, sounds, fonts, shaders
├── shaders/                # SPIRV / HLSL / MSL shader sources
├── libs/                   # Third-party libraries
├── CMakeLists.txt          # CMake build (recommended)
└── README.md
```

---

## SDL3-Specific Code Rules

### Use the Callback Model (Not a Manual Main Loop)

SDL3 introduces the **main callbacks** pattern as the recommended application structure. Define `SDL_MAIN_USE_CALLBACKS` before including `SDL_main.h`, then implement:

- `SDL_AppInit()` — one-time setup, return `SDL_APP_CONTINUE` to proceed
- `SDL_AppIterate()` — called each frame; do NOT loop here
- `SDL_AppEvent()` — called per event; do NOT call `SDL_PollEvent` yourself
- `SDL_AppQuit()` — cleanup

This model works correctly on all platforms, including mobile and Emscripten where the app does not own the main loop.

```c
#define SDL_MAIN_USE_CALLBACKS
#include <SDL3/SDL_main.h>

SDL_AppResult SDL_AppInit(void **appstate, int argc, char **argv) {
    // Create window, renderer, load assets
    return SDL_APP_CONTINUE;
}

SDL_AppResult SDL_AppIterate(void *appstate) {
    // Update + render one frame
    return SDL_APP_CONTINUE;  // or SDL_APP_SUCCESS to quit
}

SDL_AppResult SDL_AppEvent(void *appstate, SDL_Event *event) {
    if (event->type == SDL_EVENT_QUIT)
        return SDL_APP_SUCCESS;
    return SDL_APP_CONTINUE;
}

void SDL_AppQuit(void *appstate, SDL_AppResult result) {
    // Free resources
}
```

### Audio: Use SDL_AudioStream, Not Callbacks

SDL3 **replaces** SDL2's audio callback model. The primary audio API is now `SDL_AudioStream`:

- Bind streams to devices with `SDL_BindAudioStream()`
- Push PCM data with `SDL_PutAudioStreamData()`
- SDL handles device migration automatically (hot-plug safe)
- Terminology changed: "capture" → "recording", "output" → "playback"

Do NOT generate SDL2-style `SDL_AudioSpec` callback code for SDL3 projects.

### GPU API: Modern Cross-Platform Rendering

For 3D or advanced 2D rendering, use the SDL_GPU API:

1. Create device: `SDL_CreateGPUDevice()` — specify shader formats (SPIRV, DXIL, MSL)
2. Create pipeline: `SDL_CreateGPUGraphicsPipeline()` — precalculated render state
3. Acquire command buffer: `SDL_AcquireGPUCommandBuffer()`
4. Begin render pass, bind pipeline, draw, end pass
5. Submit command buffer

The GPU API abstracts Vulkan, D3D12, and Metal behind a unified interface.

### SDL_IOStream Replaces SDL_RWops

SDL3 renames `SDL_RWops` to `SDL_IOStream`. The API is similar but the type is now opaque. Update all file I/O code accordingly.

### Naming Conventions Changed

SDL3 uses **consistent naming** across all subsystems. Key patterns:
- Functions: `SDL_VerbNoun()` consistently (e.g., `SDL_CreateWindow`, `SDL_DestroyWindow`)
- Boolean returns: many functions now return `bool` instead of `int`
- Error handling: check return values; use `SDL_GetError()` for details

---

## Migration from SDL2

When assisting with SDL2 → SDL3 migration:

1. Replace `SDL_RWops` with `SDL_IOStream`
2. Replace audio callbacks with `SDL_AudioStream` binding
3. Replace `main()` game loop with callback model (or keep `main()` — both work)
4. Update event type names (many renamed for consistency)
5. Review `README-migration.md` in the SDL3 repo for the full changelist
6. Properties API replaces many ad-hoc getter/setter pairs

---

## Common Mistakes to Catch

- Using `SDL_PollEvent` inside `SDL_AppEvent` (SDL manages the pump)
- Using SDL2 audio callback patterns in SDL3 projects
- Assuming `SDL_RWops` exists (it's `SDL_IOStream` now)
- Not checking `SDL_CreateGPUDevice` return for NULL
- Forgetting to call `SDL_SubmitGPUCommandBuffer` after recording commands
- Using SDL2 event type names (many were renamed)
