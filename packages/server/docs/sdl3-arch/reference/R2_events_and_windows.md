# R2 — SDL3 Events & Window Management Reference

> **Category:** reference · **Engine:** SDL3 · **Related:** [Architecture Overview](../architecture/E1_architecture_overview.md) · [Getting Started](../guides/G1_getting_started.md) · [GPU Rendering](../guides/G2_gpu_rendering.md) · [Migrating from SDL2](../guides/G3_migrating_from_sdl2.md)

SDL3 overhauled its event system and window management compared to SDL2. Window events are now top-level event types (no more sub-event checking), window creation is simplified, and multi-window support is a first-class feature. This reference covers the event loop, window lifecycle, and common patterns.

---

## Event System Overview

### The Event Loop

SDL3 provides a unified event queue for all input and system notifications. Your game loop pulls events from this queue each frame:

```c
SDL_Event event;
while (SDL_PollEvent(&event)) {
    switch (event.type) {
        case SDL_EVENT_QUIT:
            running = false;
            break;
        case SDL_EVENT_KEY_DOWN:
            handle_key(event.key);
            break;
        case SDL_EVENT_WINDOW_CLOSE_REQUESTED:
            handle_window_close(event.window.windowID);
            break;
    }
}
```

### Event Retrieval Functions

SDL3 offers several ways to consume events, each suited to different situations:

| Function | Behavior | Use Case |
|----------|----------|----------|
| `SDL_PollEvent()` | Non-blocking; returns `true` if event available | Standard game loop — call every frame |
| `SDL_WaitEvent()` | Blocks until an event arrives | GUI/editor apps that don't need continuous rendering |
| `SDL_WaitEventTimeout()` | Blocks up to N milliseconds | Hybrid — saves CPU but caps latency |
| `SDL_PeepEvents()` | Batch access with filtering | Peeking at queue without consuming, or filtering by type |
| `SDL_PushEvent()` | Injects a custom event into the queue | Cross-system communication within your game |

### Event Watches (Callbacks)

For events you need to handle immediately (before the next `SDL_PollEvent` call), register an event watch:

```c
// Callback fires as soon as the event is pushed — runs on the posting thread
bool my_watcher(void *userdata, SDL_Event *event) {
    if (event->type == SDL_EVENT_WINDOW_RESIZED) {
        // Handle resize immediately (e.g., recreate framebuffer)
    }
    return true;  // true = allow event to stay in queue
}

SDL_AddEventWatch(my_watcher, NULL);

// Remove when no longer needed
SDL_RemoveEventWatch(my_watcher, NULL);
```

**Thread safety warning:** Event watches fire on whatever thread pushed the event. If your callback touches game state, you need synchronization.

---

## SDL3 vs. SDL2: Window Events Are Top-Level

This is one of the biggest breaking changes from SDL2. In SDL2, all window-related events were bundled under `SDL_WINDOWEVENT`, requiring a two-step check:

```c
// SDL2 — nested sub-event (no longer works in SDL3)
if (event.type == SDL_WINDOWEVENT) {
    if (event.window.event == SDL_WINDOWEVENT_RESIZED) {
        // handle resize
    }
}
```

In SDL3, every window event is its own top-level `SDL_EventType`. The `event.window.event` sub-field no longer exists:

```c
// SDL3 — direct top-level check
switch (event.type) {
    case SDL_EVENT_WINDOW_RESIZED:
        int w = event.window.data1;
        int h = event.window.data2;
        break;
    case SDL_EVENT_WINDOW_FOCUS_GAINED:
        // ...
        break;
    case SDL_EVENT_WINDOW_CLOSE_REQUESTED:
        // ...
        break;
}
```

### Common Window Event Types

| SDL3 Event Type | Description |
|----------------|-------------|
| `SDL_EVENT_WINDOW_SHOWN` | Window became visible |
| `SDL_EVENT_WINDOW_HIDDEN` | Window was hidden |
| `SDL_EVENT_WINDOW_MOVED` | Window position changed (`data1`=x, `data2`=y) |
| `SDL_EVENT_WINDOW_RESIZED` | Window size changed by user or API (`data1`=w, `data2`=h) |
| `SDL_EVENT_WINDOW_PIXEL_SIZE_CHANGED` | Backing pixel size changed (important for High-DPI) |
| `SDL_EVENT_WINDOW_MINIMIZED` | Window was minimized |
| `SDL_EVENT_WINDOW_MAXIMIZED` | Window was maximized |
| `SDL_EVENT_WINDOW_RESTORED` | Window restored from minimized/maximized |
| `SDL_EVENT_WINDOW_MOUSE_ENTER` | Mouse entered the window |
| `SDL_EVENT_WINDOW_MOUSE_LEAVE` | Mouse left the window |
| `SDL_EVENT_WINDOW_FOCUS_GAINED` | Window gained keyboard focus |
| `SDL_EVENT_WINDOW_FOCUS_LOST` | Window lost keyboard focus |
| `SDL_EVENT_WINDOW_CLOSE_REQUESTED` | User clicked the close button |
| `SDL_EVENT_WINDOW_DESTROYED` | Window is being destroyed |
| `SDL_EVENT_WINDOW_DISPLAY_CHANGED` | Window moved to a different display |

### Identifying Which Window

Every window event includes a `windowID` field. Use `SDL_GetWindowFromID()` to get the `SDL_Window*`:

```c
case SDL_EVENT_WINDOW_RESIZED:
    SDL_Window *win = SDL_GetWindowFromID(event.window.windowID);
    if (win == my_game_window) {
        resize_game_viewport(event.window.data1, event.window.data2);
    }
    break;
```

---

## Window Creation

### Basic Window

SDL3 simplifies `SDL_CreateWindow` compared to SDL2. Position arguments are removed — the OS decides initial placement:

```c
// SDL3 — 4 arguments (title, width, height, flags)
SDL_Window *window = SDL_CreateWindow(
    "My Game",                  // title
    1280, 720,                  // width, height
    SDL_WINDOW_RESIZABLE        // flags
);

if (!window) {
    SDL_Log("Window creation failed: %s", SDL_GetError());
    return 1;
}
```

To set a specific position after creation:

```c
SDL_SetWindowPosition(window, 100, 100);
```

### Common Window Flags

| Flag | Effect |
|------|--------|
| `SDL_WINDOW_FULLSCREEN` | Fullscreen at desktop resolution |
| `SDL_WINDOW_RESIZABLE` | User can resize the window |
| `SDL_WINDOW_BORDERLESS` | No title bar or borders |
| `SDL_WINDOW_HIDDEN` | Start hidden (call `SDL_ShowWindow` later) |
| `SDL_WINDOW_MAXIMIZED` | Start maximized |
| `SDL_WINDOW_MINIMIZED` | Start minimized |
| `SDL_WINDOW_HIGH_PIXEL_DENSITY` | Enable High-DPI/Retina rendering |
| `SDL_WINDOW_OPENGL` | Prepare for OpenGL context |
| `SDL_WINDOW_VULKAN` | Prepare for Vulkan surface |
| `SDL_WINDOW_METAL` | Prepare for Metal layer (macOS/iOS) |

### High-DPI Handling

SDL3 distinguishes between window size (in screen coordinates) and pixel size (in actual pixels). On a 2× Retina display, a 1280×720 window has 2560×1440 backing pixels:

```c
// Get screen-coordinate size (for UI layout)
int w, h;
SDL_GetWindowSize(window, &w, &h);

// Get actual pixel size (for rendering/framebuffers)
int pw, ph;
SDL_GetWindowSizeInPixels(window, &pw, &ph);

float dpi_scale = (float)pw / (float)w;  // 2.0 on Retina
```

Listen for `SDL_EVENT_WINDOW_PIXEL_SIZE_CHANGED` to react to DPI changes (e.g., dragging between monitors).

---

## Multi-Window Support

SDL3 supports multiple windows natively, useful for editors, debug views, or multi-monitor setups.

### Creating Additional Windows

```c
SDL_Window *main_win = SDL_CreateWindow("Game", 1280, 720, 0);
SDL_Window *debug_win = SDL_CreateWindow("Debug", 640, 480, SDL_WINDOW_RESIZABLE);
```

### Popup and Utility Windows

SDL3 introduces `SDL_CreatePopupWindow()` for context menus and tooltips:

```c
// Popup is always positioned relative to its parent
SDL_Window *popup = SDL_CreatePopupWindow(
    parent_window,          // required parent
    offset_x, offset_y,    // position relative to parent
    width, height,
    SDL_WINDOW_TOOLTIP      // or SDL_WINDOW_POPUP_MENU
);
```

Popup windows are automatically destroyed when their parent is destroyed or loses focus (depending on type).

---

## Custom Events

Send your own events through the same queue using `SDL_RegisterEvents` and `SDL_PushEvent`:

```c
// Register a block of custom event type IDs (do this once at init)
Uint32 MY_GAME_EVENT = SDL_RegisterEvents(1);
if (MY_GAME_EVENT == 0) {
    SDL_Log("Failed to register custom event");
}

// Push a custom event from anywhere in your code
SDL_Event custom;
SDL_zero(custom);
custom.type = MY_GAME_EVENT;
custom.user.code = 42;               // your sub-code
custom.user.data1 = some_pointer;    // attach data
SDL_PushEvent(&custom);

// Handle it in the main loop like any other event
case MY_GAME_EVENT:
    if (event.user.code == 42) {
        process_game_event(event.user.data1);
    }
    break;
```

This is especially useful for decoupling systems — e.g., your audio thread can push events to the main thread without shared mutable state.

---

## Common Patterns

### Graceful Shutdown

```c
while (SDL_PollEvent(&event)) {
    if (event.type == SDL_EVENT_QUIT) {
        // SDL_EVENT_QUIT fires when ALL windows are closed,
        // or when the OS requests termination (Cmd+Q, Alt+F4, etc.)
        running = false;
    }
    if (event.type == SDL_EVENT_WINDOW_CLOSE_REQUESTED) {
        // Fired per-window — you can choose to close just this one
        SDL_Window *win = SDL_GetWindowFromID(event.window.windowID);
        SDL_DestroyWindow(win);
        // Only quit if it was the main window
        if (win == main_window) {
            running = false;
        }
    }
}
```

### Pause on Focus Loss

```c
case SDL_EVENT_WINDOW_FOCUS_LOST:
    game_paused = true;
    break;
case SDL_EVENT_WINDOW_FOCUS_GAINED:
    game_paused = false;
    break;
```

### Handling Resize for Rendering

```c
case SDL_EVENT_WINDOW_PIXEL_SIZE_CHANGED:
    // Use pixel size, not window size, for rendering targets
    int pw, ph;
    SDL_GetWindowSizeInPixels(
        SDL_GetWindowFromID(event.window.windowID), &pw, &ph
    );
    recreate_framebuffer(pw, ph);
    break;
```

---

## Quick Migration Checklist (SDL2 → SDL3 Events & Windows)

1. Replace `SDL_WINDOWEVENT` + sub-event checks with direct `SDL_EVENT_WINDOW_*` types
2. Remove `x, y` params from `SDL_CreateWindow()` — use `SDL_SetWindowPosition()` if needed
3. Replace `SDL_GetWindowSize` for rendering with `SDL_GetWindowSizeInPixels` (High-DPI correctness)
4. Replace `SDL_WINDOWEVENT_CLOSE` with `SDL_EVENT_WINDOW_CLOSE_REQUESTED`
5. Check for renamed event struct fields — SDL3 uses `event.key.key` instead of SDL2's `event.key.keysym.sym`
