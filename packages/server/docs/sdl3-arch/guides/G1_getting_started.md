# G1 — SDL3 Getting Started

> **Category:** guide · **Engine:** SDL3 · **Related:** [Architecture Overview](../architecture/E1_architecture_overview.md) · [SDL3 Rules](../sdl3-arch-rules.md)

---

## Prerequisites

- A C99 (or C++ 11+) compiler: GCC, Clang, or MSVC
- CMake 3.16+ (recommended) or your preferred build system
- SDL3 source or prebuilt binaries (v3.2.0+, released January 2025)

### Installing SDL3

SDL3 is too new for most system package managers. Build from source or use vcpkg:

```bash
# Option 1: vcpkg (Windows, macOS, Linux)
vcpkg install sdl3

# Option 2: Build from source
git clone https://github.com/libsdl-org/SDL.git -b main
cd SDL
cmake -B build -DCMAKE_BUILD_TYPE=Release
cmake --build build
sudo cmake --install build   # Linux/macOS
```

On Windows with MSVC, use `cmake --build build --config Release` and install to a known prefix.

---

## Application Model: Main Callbacks (Recommended)

SDL3 introduces a **main callbacks** model that replaces the traditional `main()` function. SDL owns the event loop and calls your code at defined points. This model is **required** on platforms that don't allow apps to own `main()` (iOS, Emscripten) and is recommended for all new projects.

### Minimal Example — Main Callbacks

```c
// main.c — SDL3 main callbacks pattern
#define SDL_MAIN_USE_CALLBACKS 1
#include <SDL3/SDL.h>
#include <SDL3/SDL_main.h>

static SDL_Window *window = NULL;
static SDL_Renderer *renderer = NULL;

SDL_AppResult SDL_AppInit(void **appstate, int argc, char *argv[]) {
    if (!SDL_Init(SDL_INIT_VIDEO)) {
        SDL_Log("SDL_Init failed: %s", SDL_GetError());
        return SDL_APP_FAILURE;
    }

    if (!SDL_CreateWindowAndRenderer("My Game", 800, 600, 0, &window, &renderer)) {
        SDL_Log("Window creation failed: %s", SDL_GetError());
        return SDL_APP_FAILURE;
    }

    return SDL_APP_CONTINUE;
}

SDL_AppResult SDL_AppEvent(void *appstate, SDL_Event *event) {
    if (event->type == SDL_EVENT_QUIT) {
        return SDL_APP_SUCCESS;  // clean exit
    }
    return SDL_APP_CONTINUE;
}

SDL_AppResult SDL_AppIterate(void *appstate) {
    // Clear screen
    SDL_SetRenderDrawColor(renderer, 25, 25, 40, 255);
    SDL_RenderClear(renderer);

    // Draw a white rectangle
    SDL_FRect rect = { 350.0f, 250.0f, 100.0f, 100.0f };
    SDL_SetRenderDrawColor(renderer, 255, 255, 255, 255);
    SDL_RenderFillRect(renderer, &rect);

    SDL_RenderPresent(renderer);
    return SDL_APP_CONTINUE;
}

void SDL_AppQuit(void *appstate, SDL_AppResult result) {
    // SDL cleans up window and renderer automatically
    // Free your own resources here
}
```

### Callback Return Values

| Value | Meaning |
|-------|---------|
| `SDL_APP_CONTINUE` | Keep running — SDL will call `AppIterate` again |
| `SDL_APP_SUCCESS` | Exit cleanly (exit code 0) |
| `SDL_APP_FAILURE` | Exit with error (non-zero exit code) |

### Using App State

Pass your game state through the `appstate` pointer instead of using globals:

```c
typedef struct {
    SDL_Window *window;
    SDL_Renderer *renderer;
    float player_x, player_y;
    bool running;
} GameState;

SDL_AppResult SDL_AppInit(void **appstate, int argc, char *argv[]) {
    GameState *state = SDL_calloc(1, sizeof(GameState));
    if (!state) return SDL_APP_FAILURE;

    SDL_Init(SDL_INIT_VIDEO);
    SDL_CreateWindowAndRenderer("Game", 800, 600, 0,
                                &state->window, &state->renderer);
    state->player_x = 400.0f;
    state->player_y = 300.0f;

    *appstate = state;  // SDL passes this to all other callbacks
    return SDL_APP_CONTINUE;
}

SDL_AppResult SDL_AppIterate(void *appstate) {
    GameState *state = (GameState *)appstate;
    // Use state->player_x, state->renderer, etc.
    return SDL_APP_CONTINUE;
}

void SDL_AppQuit(void *appstate, SDL_AppResult result) {
    SDL_free(appstate);
}
```

---

## Alternative: Traditional Main Loop

If you're porting SDL2 code or prefer owning the loop:

```c
#include <SDL3/SDL.h>
#include <SDL3/SDL_main.h>

int main(int argc, char *argv[]) {
    SDL_Init(SDL_INIT_VIDEO);
    SDL_Window *win = SDL_CreateWindow("Game", 800, 600, 0);
    SDL_Renderer *ren = SDL_CreateRenderer(win, NULL);

    bool running = true;
    while (running) {
        SDL_Event e;
        while (SDL_PollEvent(&e)) {
            if (e.type == SDL_EVENT_QUIT) running = false;
        }

        SDL_SetRenderDrawColor(ren, 25, 25, 40, 255);
        SDL_RenderClear(ren);
        SDL_RenderPresent(ren);
    }

    SDL_DestroyRenderer(ren);
    SDL_DestroyWindow(win);
    SDL_Quit();
    return 0;
}
```

This works on desktop but may not behave correctly on iOS or Emscripten. Prefer main callbacks for new projects.

---

## CMake Project Setup

```cmake
cmake_minimum_required(VERSION 3.16)
project(MyGame C)

find_package(SDL3 REQUIRED CONFIG)

add_executable(mygame main.c)
target_link_libraries(mygame PRIVATE SDL3::SDL3)
```

If SDL3 is installed via vcpkg, CMake finds it automatically. If built from source, pass `-DSDL3_DIR=/path/to/install/lib/cmake/SDL3`.

---

## Key Differences from SDL2

If you're migrating from SDL2, these are the changes that will hit you first:

| SDL2 | SDL3 | Notes |
|------|------|-------|
| `SDL_CreateWindow(title, x, y, w, h, flags)` | `SDL_CreateWindow(title, w, h, flags)` | Position removed (use properties API for placement) |
| `SDL_CreateRenderer(win, -1, flags)` | `SDL_CreateRenderer(win, NULL)` | Driver name string instead of index; flags removed |
| Return `int` (0 = success) | Return `bool` (`true` = success) | All SDL3 functions that can fail return `bool` |
| `SDL_KEYDOWN` | `SDL_EVENT_KEY_DOWN` | Event type names use `SDL_EVENT_` prefix |
| `SDL_Surface` 32-bit assumed | `SDL_Surface` uses `SDL_PixelFormat` enum | No more `SDL_PixelFormat*` struct on surfaces |
| Separate audio callback API | `SDL_AudioStream` push model | Callbacks replaced by stream binding |
| No GPU API | `SDL_GPU` — modern Vulkan/D3D12/Metal abstraction | Entirely new subsystem |
| `SDL_Rect` (int) for rendering | `SDL_FRect` (float) for rendering | Renderer uses floats for sub-pixel precision |

### Function Naming Convention Change

SDL3 uses consistent naming: `SDL_GetFoo()` returns a value, `SDL_SetFoo()` sets a value. Boolean functions return `bool` instead of `int`. Error-returning functions return `true` on success (opposite of SDL2's `0` on success convention).

---

## Adding Input Handling

```c
SDL_AppResult SDL_AppEvent(void *appstate, SDL_Event *event) {
    GameState *state = (GameState *)appstate;

    switch (event->type) {
        case SDL_EVENT_QUIT:
            return SDL_APP_SUCCESS;

        case SDL_EVENT_KEY_DOWN:
            if (event->key.key == SDLK_ESCAPE) return SDL_APP_SUCCESS;
            if (event->key.key == SDLK_LEFT)   state->player_x -= 5.0f;
            if (event->key.key == SDLK_RIGHT)  state->player_x += 5.0f;
            if (event->key.key == SDLK_UP)     state->player_y -= 5.0f;
            if (event->key.key == SDLK_DOWN)   state->player_y += 5.0f;
            break;
    }
    return SDL_APP_CONTINUE;
}
```

For continuous movement (not just key-repeat), poll keyboard state in `AppIterate`:

```c
SDL_AppResult SDL_AppIterate(void *appstate) {
    GameState *state = (GameState *)appstate;
    const bool *keys = SDL_GetKeyboardState(NULL);

    float speed = 200.0f * (SDL_GetTicks() / 1000.0f);  // use delta time in real code
    if (keys[SDL_SCANCODE_LEFT])  state->player_x -= speed;
    if (keys[SDL_SCANCODE_RIGHT]) state->player_x += speed;

    // ... render ...
    return SDL_APP_CONTINUE;
}
```

---

## Next Steps

- **SDL_GPU for 3D rendering** — See the [GPU API reference](../reference/) for modern rendering
- **Audio** — Use `SDL_AudioStream` to play sounds (push PCM data, bind to devices)
- **Gamepad input** — Initialize `SDL_INIT_GAMEPAD` and use `SDL_GetGamepadAxis()` / `SDL_GetGamepadButton()`
- **File I/O** — `SDL_GetBasePath()` for app directory, `SDL_GetPrefPath()` for save data
- **Shader cross-compilation** — Use `SDL_shader_tools` to compile HLSL/GLSL to SPIRV for SDL_GPU
