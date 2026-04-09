# G3 — Migrating from SDL2 to SDL3

> **Category:** guide · **Engine:** SDL3 · **Related:** [E1 Architecture Overview](../architecture/E1_architecture_overview.md) · [G1 Getting Started](G1_getting_started.md) · [SDL3 Rules](../sdl3-arch-rules.md)

SDL3 (first stable release: v3.2.0, January 2025) is a major rewrite of SDL2, not a drop-in upgrade. This guide covers the most impactful breaking changes and provides concrete before/after patterns for each migration area.

---

## Overview of Breaking Changes

SDL3 modernizes the API with several cross-cutting changes that affect almost every subsystem:

1. **Boolean return types** — Many functions that returned `int` (0 for success) now return `bool` (`true`/`false`).
2. **Consistent naming** — Functions follow `SDL_VerbNoun()` consistently. Many SDL2 names have been renamed.
3. **Properties API** — A new type-safe key-value system (`SDL_PropertiesID`) replaces scattered getter/setter pairs on objects.
4. **Main callbacks model** — A new optional application structure where SDL owns the main loop.
5. **Opaque types** — Many structs (e.g., `SDL_RWops` → `SDL_IOStream`) are now opaque pointers.

---

## Application Structure: Main Loop vs. Callbacks

### SDL2 (Traditional Main Loop)

```c
int main(int argc, char *argv[]) {
    SDL_Init(SDL_INIT_VIDEO);
    SDL_Window *win = SDL_CreateWindow("Game", SDL_WINDOWPOS_CENTERED,
                                       SDL_WINDOWPOS_CENTERED, 800, 600, 0);
    SDL_Renderer *ren = SDL_CreateRenderer(win, -1, SDL_RENDERER_ACCELERATED);
    bool running = true;
    while (running) {
        SDL_Event e;
        while (SDL_PollEvent(&e)) {
            if (e.type == SDL_QUIT) running = false;
        }
        SDL_RenderClear(ren);
        SDL_RenderPresent(ren);
    }
    SDL_DestroyRenderer(ren);
    SDL_DestroyWindow(win);
    SDL_Quit();
    return 0;
}
```

### SDL3 (Callback Model — Recommended)

```c
#define SDL_MAIN_USE_CALLBACKS
#include <SDL3/SDL_main.h>

typedef struct {
    SDL_Window *window;
    SDL_Renderer *renderer;
} AppState;

SDL_AppResult SDL_AppInit(void **appstate, int argc, char **argv) {
    AppState *state = SDL_calloc(1, sizeof(AppState));
    SDL_Init(SDL_INIT_VIDEO);
    state->window = SDL_CreateWindow("Game", 800, 600, 0);
    state->renderer = SDL_CreateRenderer(state->window, NULL);
    *appstate = state;
    return SDL_APP_CONTINUE;
}

SDL_AppResult SDL_AppIterate(void *appstate) {
    AppState *state = appstate;
    SDL_RenderClear(state->renderer);
    SDL_RenderPresent(state->renderer);
    return SDL_APP_CONTINUE;
}

SDL_AppResult SDL_AppEvent(void *appstate, SDL_Event *event) {
    if (event->type == SDL_EVENT_QUIT) return SDL_APP_SUCCESS;
    return SDL_APP_CONTINUE;
}

void SDL_AppQuit(void *appstate, SDL_AppResult result) {
    AppState *state = appstate;
    SDL_DestroyRenderer(state->renderer);
    SDL_DestroyWindow(state->window);
    SDL_free(state);
}
```

**Key differences:**
- `SDL_CreateWindow` no longer takes `x, y` position or `flags` parameter (use properties for advanced config).
- `SDL_CreateRenderer` takes `NULL` for auto-select instead of `-1` and flags.
- Do **not** call `SDL_PollEvent()` inside `SDL_AppEvent()` — SDL manages the event pump.
- The traditional main loop still works in SDL3. Migration to callbacks is recommended but not required.

---

## Event System Changes

### Window Events Are Now Top-Level

In SDL2, all window events were nested under `SDL_WINDOWEVENT` with a sub-type in `event.window.event`. In SDL3, each window event is its own top-level event type.

```c
// SDL2
if (e.type == SDL_WINDOWEVENT) {
    if (e.window.event == SDL_WINDOWEVENT_RESIZED) {
        int w = e.window.data1;
        int h = e.window.data2;
    }
}

// SDL3
if (e.type == SDL_EVENT_WINDOW_RESIZED) {
    int w = e.window.data1;
    int h = e.window.data2;
}
```

### Renamed Event Constants

| SDL2 | SDL3 |
|------|------|
| `SDL_QUIT` | `SDL_EVENT_QUIT` |
| `SDL_KEYDOWN` | `SDL_EVENT_KEY_DOWN` |
| `SDL_KEYUP` | `SDL_EVENT_KEY_UP` |
| `SDL_MOUSEMOTION` | `SDL_EVENT_MOUSE_MOTION` |
| `SDL_MOUSEBUTTONDOWN` | `SDL_EVENT_MOUSE_BUTTON_DOWN` |
| `SDL_MOUSEBUTTONUP` | `SDL_EVENT_MOUSE_BUTTON_UP` |
| `SDL_MOUSEWHEEL` | `SDL_EVENT_MOUSE_WHEEL` |
| `SDL_CONTROLLERDEVICEADDED` | `SDL_EVENT_GAMEPAD_ADDED` |
| `SDL_WINDOWEVENT` | (removed — sub-events promoted to top-level) |

---

## Audio System Rewrite

The audio system is the single biggest API change. SDL2's audio callback model is replaced by SDL_AudioStream.

### SDL2 (Audio Callback)

```c
void audio_callback(void *userdata, Uint8 *stream, int len) {
    // fill stream with audio data
}

SDL_AudioSpec want = {
    .freq = 44100,
    .format = AUDIO_S16LSB,
    .channels = 2,
    .samples = 4096,
    .callback = audio_callback,
};
SDL_AudioDeviceID dev = SDL_OpenAudioDevice(NULL, 0, &want, &have, 0);
SDL_PauseAudioDevice(dev, 0);
```

### SDL3 (AudioStream Binding)

```c
SDL_AudioSpec spec = { SDL_AUDIO_S16LE, 2, 44100 };
SDL_AudioStream *stream = SDL_OpenAudioDeviceStream(
    SDL_AUDIO_DEVICE_DEFAULT_PLAYBACK, &spec, NULL, NULL);
SDL_ResumeAudioStreamDevice(stream);

// Push data when ready:
SDL_PutAudioStreamData(stream, pcm_buffer, buffer_size);

// Cleanup:
SDL_DestroyAudioStream(stream);
```

**Key changes:**
- No more audio callbacks as the primary API (a callback option still exists for low-level use).
- `SDL_AudioStream` handles format conversion and resampling internally.
- Device hot-plug is automatic — if headphones are unplugged, audio migrates to speakers.
- Terminology: "capture" → "recording", "output" → "playback".
- Audio format constants changed: `AUDIO_S16LSB` → `SDL_AUDIO_S16LE`.

---

## I/O and File Access

### SDL_RWops → SDL_IOStream

`SDL_RWops` has been renamed to `SDL_IOStream` and is now an opaque type.

| SDL2 | SDL3 |
|------|------|
| `SDL_RWFromFile()` | `SDL_IOFromFile()` |
| `SDL_RWFromMem()` | `SDL_IOFromMem()` |
| `SDL_RWclose()` | `SDL_CloseIO()` |
| `SDL_RWread()` | `SDL_ReadIO()` |
| `SDL_RWwrite()` | `SDL_WriteIO()` |

Direct struct member access (e.g., `rwops->size`) is no longer possible. Use the corresponding function calls.

---

## Renderer API Changes

- `SDL_CreateRenderer()` — the `index` parameter (int) is replaced by a `name` parameter (const char*). Pass `NULL` for auto-select.
- `SDL_RenderCopy()` / `SDL_RenderCopyEx()` → `SDL_RenderTexture()` / `SDL_RenderTextureRotated()`.
- Render coordinates are now `float` instead of `int` by default.
- `SDL_CreateTextureFromSurface()` remains available but surfaces are less central.

---

## Gamepad and Haptics

- The **Game Controller** API is renamed to **Gamepad** throughout. `SDL_GameController*` functions → `SDL_Gamepad*` functions.
- `SDL_GameControllerOpen()` → `SDL_OpenGamepad()`.
- Simple rumble on gamepads: use `SDL_RumbleGamepad()` instead of the Haptic API. Gamepads with basic rumble no longer appear as haptic devices.
- The Gesture API (`SDL_RecordGesture`, etc.) has been **removed entirely** with no replacement in SDL3.

---

## Properties System

SDL3 introduces `SDL_PropertiesID`, a type-safe key-value store attached to SDL objects. This replaces many SDL2 getter/setter functions and the `SDL_SetWindowData()` pattern.

```c
// Get properties from a window
SDL_PropertiesID props = SDL_GetWindowProperties(window);
void *native_handle = SDL_GetPointerProperty(props, SDL_PROP_WINDOW_WIN32_HWND_POINTER, NULL);

// Create window with custom properties
SDL_PropertiesID create_props = SDL_CreateProperties();
SDL_SetStringProperty(create_props, SDL_PROP_WINDOW_CREATE_TITLE_STRING, "Game");
SDL_SetNumberProperty(create_props, SDL_PROP_WINDOW_CREATE_WIDTH_NUMBER, 800);
SDL_SetNumberProperty(create_props, SDL_PROP_WINDOW_CREATE_HEIGHT_NUMBER, 600);
SDL_Window *win = SDL_CreateWindowWithProperties(create_props);
SDL_DestroyProperties(create_props);
```

---

## Quick Reference: Common Renames

| SDL2 Function | SDL3 Function |
|---------------|---------------|
| `SDL_CreateWindow(title, x, y, w, h, flags)` | `SDL_CreateWindow(title, w, h, flags)` |
| `SDL_CreateRenderer(win, -1, flags)` | `SDL_CreateRenderer(win, NULL)` |
| `SDL_RenderCopy(ren, tex, src, dst)` | `SDL_RenderTexture(ren, tex, src, dst)` |
| `SDL_RenderFillRect()` | `SDL_RenderFillRect()` (takes `SDL_FRect*` now) |
| `SDL_OpenAudioDevice()` | `SDL_OpenAudioDeviceStream()` |
| `SDL_GameControllerOpen()` | `SDL_OpenGamepad()` |
| `SDL_RWFromFile()` | `SDL_IOFromFile()` |
| `SDL_GetTicks()` | `SDL_GetTicks()` (now returns `Uint64` milliseconds) |
| `SDL_GetPerformanceCounter()` | `SDL_GetPerformanceCounter()` (unchanged) |

---

## Migration Checklist

1. **Include paths** — Change `#include "SDL.h"` to `#include <SDL3/SDL.h>`. Sub-headers follow: `<SDL3/SDL_main.h>`, `<SDL3_image/SDL_image.h>`, etc.
2. **Event constants** — Search-and-replace `SDL_QUIT` → `SDL_EVENT_QUIT`, `SDL_KEYDOWN` → `SDL_EVENT_KEY_DOWN`, etc.
3. **Window events** — Remove `SDL_WINDOWEVENT` switch blocks; promote sub-events to top-level checks.
4. **Audio** — Replace callback-based audio with `SDL_AudioStream` binding. Update format constants.
5. **I/O** — Replace `SDL_RWops` usage with `SDL_IOStream` equivalents.
6. **Renderer** — Update `SDL_CreateRenderer` signature, replace `SDL_RenderCopy` with `SDL_RenderTexture`.
7. **Gamepad** — Rename all `SDL_GameController*` calls to `SDL_Gamepad*` equivalents.
8. **Boolean returns** — Audit error checking; many functions now return `bool` instead of `int`.
9. **Companion libraries** — Update SDL_image, SDL_ttf, SDL_mixer to their SDL3-compatible versions (3.x series).
10. **Test incrementally** — SDL3 is a big change. Migrate one subsystem at a time, testing as you go.

---

## Further Reading

- [Official SDL3 Migration Guide](https://github.com/libsdl-org/SDL/blob/main/docs/README-migration.md) — exhaustive function-by-function changelog
- [SDL3 New Features](https://wiki.libsdl.org/SDL3/NewFeatures) — everything added in SDL3
- [SDL3 Wiki](https://wiki.libsdl.org/SDL3/) — full API reference
