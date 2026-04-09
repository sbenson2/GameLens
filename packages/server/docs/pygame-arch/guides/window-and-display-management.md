# Window & Display Management

> **Category:** guide · **Engine:** Pygame · **Related:** [game-loop-and-state](../architecture/game-loop-and-state.md), [performance-and-pygame-ce](performance-and-pygame-ce.md)

Managing windows and display modes is one of the first things you'll do in a Pygame project — and one of the trickiest to get right across different monitors, resolutions, and platforms. This guide covers `pygame.display.set_mode()` flags, resolution strategies, fullscreen handling, multi-monitor awareness, and the newer `pygame.Window` class available in pygame-ce.

## Setting Up the Display

The core function is `pygame.display.set_mode()`, which creates or reconfigures the game window:

```python
import pygame
pygame.init()

# Basic windowed mode at 1280×720
screen = pygame.display.set_mode((1280, 720))
pygame.display.set_caption("My Game")
```

The function signature is:

```python
pygame.display.set_mode(
    size=(0, 0),      # (width, height) — (0,0) uses current desktop resolution
    flags=0,           # Bitwise OR of display flags
    depth=0,           # Color depth in bits — usually leave at 0 (auto)
    display=0,         # Monitor index for multi-monitor setups
    vsync=0            # 0=off, 1=on (requires OPENGL or SCALED flag)
)
```

**Note:** `set_mode()` returns a `Surface` object. This is your primary drawing target — everything you blit ends up here, and `pygame.display.flip()` or `pygame.display.update()` pushes it to the screen.

## Display Flags

Combine flags with bitwise OR (`|`) to configure window behavior:

| Flag | Effect |
|------|--------|
| `pygame.FULLSCREEN` | Exclusive fullscreen — takes over the display at the requested resolution |
| `pygame.RESIZABLE` | User can drag window edges to resize; generates `VIDEORESIZE` events |
| `pygame.NOFRAME` | Removes the window title bar and border (useful for splash screens) |
| `pygame.SCALED` | Pygame auto-scales your logical resolution to fit the desktop; mouse coords are remapped automatically |
| `pygame.SHOWN` | Window starts visible (default behavior) |
| `pygame.HIDDEN` | Window starts hidden — call `pygame.display.get_surface()` later to show it |
| `pygame.OPENGL` | Creates an OpenGL-compatible context (you must use OpenGL calls, not `Surface.blit`) |
| `pygame.DOUBLEBUF` | Double-buffered display — only meaningful with `OPENGL` |

### The SCALED Flag (Pygame 2.0+)

`SCALED` is particularly useful for pixel-art games where you design at a small logical resolution (e.g. 320×180) and want Pygame to handle upscaling:

```python
# Design at 320×180, Pygame scales to fill the desktop
screen = pygame.display.set_mode((320, 180), pygame.SCALED)
```

Key behaviors of `SCALED`:

- Pygame picks an integer scale factor that fits your desktop (or uses fractional scaling if needed).
- Mouse events are automatically translated back to your logical coordinate space.
- Works well with `vsync=1` — this is one of only two flags that support the vsync parameter.
- Letterboxing is applied if the aspect ratio doesn't match the desktop.

```python
# SCALED + vsync for smooth pixel-art rendering
screen = pygame.display.set_mode((320, 180), pygame.SCALED, vsync=1)
```

## Fullscreen Strategies

There are three approaches to fullscreen, each with trade-offs:

### 1. Exclusive Fullscreen

```python
screen = pygame.display.set_mode((1920, 1080), pygame.FULLSCREEN)
```

Takes over the display entirely. Fast, but alt-tabbing can be slow or glitchy. If you request a resolution the monitor doesn't support, Pygame may silently pick a different one.

### 2. Borderless Windowed (Fake Fullscreen)

```python
info = pygame.display.Info()
screen = pygame.display.set_mode(
    (info.current_w, info.current_h),
    pygame.NOFRAME
)
```

Creates a window the exact size of the desktop with no border. Alt-tabs cleanly, no mode switch. This is what most modern games call "borderless windowed."

### 3. Scaled Fullscreen

```python
screen = pygame.display.set_mode((0, 0), pygame.FULLSCREEN | pygame.SCALED)
```

Combines exclusive fullscreen with automatic scaling from your logical resolution. Passing `(0, 0)` uses the native desktop resolution as the output size.

### Toggling Fullscreen at Runtime

```python
pygame.display.toggle_fullscreen()
```

This switches between windowed and fullscreen modes. On Linux/Wayland, this uses the desktop-friendly borderless approach. On Windows, behavior depends on the driver. Always handle the `VIDEORESIZE` event after toggling to update any cached surface sizes.

## Handling Resizable Windows

When using the `RESIZABLE` flag, the user can drag the window edges. Your game needs to respond:

```python
screen = pygame.display.set_mode((800, 600), pygame.RESIZABLE)

for event in pygame.event.get():
    if event.type == pygame.VIDEORESIZE:
        # event.w and event.h contain the new window dimensions
        screen = pygame.display.set_mode(
            (event.w, event.h),
            pygame.RESIZABLE
        )
        # Recalculate UI layout, camera bounds, etc.
```

**Pygame 2 change:** In Pygame 2+, calling `set_mode()` again inside the resize handler is still the standard pattern, but the display surface is automatically updated to the new size. The `VIDEORESIZE` event is your signal to re-layout game elements.

**Minimum size enforcement** — Pygame doesn't natively enforce a minimum window size. You can clamp manually:

```python
MIN_W, MIN_H = 640, 480

if event.type == pygame.VIDEORESIZE:
    w = max(event.w, MIN_W)
    h = max(event.h, MIN_H)
    screen = pygame.display.set_mode((w, h), pygame.RESIZABLE)
```

## VSync

The `vsync` parameter in `set_mode()` requests vertical synchronization from the GPU driver:

```python
# VSync only works with OPENGL or SCALED flags
screen = pygame.display.set_mode((800, 600), pygame.SCALED, vsync=1)
```

Important caveats:

- VSync is a **request**, not a guarantee. The driver can ignore it.
- `vsync=1` — standard vsync (locks to monitor refresh rate).
- `vsync=-1` — adaptive vsync (OpenGL only). Drops to unsynced if the frame misses the deadline, avoiding stutters.
- Without `OPENGL` or `SCALED`, the `vsync` parameter is silently ignored.
- For frame-rate limiting without vsync, use `pygame.time.Clock().tick(60)` instead.

## Multi-Monitor Support

Query available displays and choose which one to use:

```python
# How many displays are connected?
num_displays = pygame.display.get_num_displays()

# Get resolution of each display
for i in range(num_displays):
    size = pygame.display.get_desktop_sizes()[i]
    print(f"Display {i}: {size[0]}×{size[1]}")

# Open on the second monitor
screen = pygame.display.set_mode((1280, 720), display=1)
```

**Note:** `get_desktop_sizes()` was added in Pygame 2.0. For positioning the window on a specific display in windowed mode, you may need OS-level hints via `SDL_VIDEO_WINDOW_POS` or pygame-ce's `set_window_position()`.

## Display Info and Querying Capabilities

```python
info = pygame.display.Info()
print(f"Desktop: {info.current_w}×{info.current_h}")
print(f"Hardware surfaces: {info.hw}")
print(f"Video memory: {info.video_mem} MB")

# List supported fullscreen resolutions
modes = pygame.display.list_modes()
# Returns list of (w, h) tuples, sorted largest first
# Returns -1 if any size is supported (windowed mode)
```

## pygame-ce: The Window Class

pygame-ce (Community Edition) 2.5.2+ introduces `pygame.Window`, a modern alternative to `set_mode()` that supports **multiple windows** and finer-grained control:

```python
import pygame
pygame.init()

# Create a window (does NOT replace set_mode for the main display)
window = pygame.Window("My Game", size=(1280, 720))
surface = window.get_surface()

# Window properties
window.title = "New Title"
window.resizable = True
window.size = (1920, 1080)
window.position = (100, 100)     # Pixel position on desktop
window.minimum_size = (640, 480)
window.maximum_size = (3840, 2160)
window.opacity = 0.9             # Window transparency (0.0–1.0)

# Fullscreen control
window.set_fullscreen(True)      # Enter fullscreen
window.set_windowed()            # Return to windowed

# Update the display
window.flip()
```

### Key Differences from `set_mode()`

| Feature | `display.set_mode()` | `pygame.Window` (pygame-ce) |
|---------|---------------------|-----------------------------|
| Multiple windows | No | Yes |
| Minimum/maximum size | Manual clamping | `minimum_size`, `maximum_size` properties |
| Window position | OS environment variable hack | `position` property |
| Opacity/transparency | Not supported | `opacity` property |
| Always-on-top | Not supported | `always_on_top` property |
| Available in | pygame + pygame-ce | pygame-ce 2.5.2+ only |

### When to Use Which

- Use `set_mode()` when targeting both standard pygame and pygame-ce, or for simple single-window games.
- Use `Window` when you need multiple windows, precise window positioning, or advanced window properties — and can require pygame-ce.

## Resolution Strategy Pattern

A common pattern for games that need to support multiple resolutions while maintaining a consistent logical size:

```python
LOGICAL_W, LOGICAL_H = 1280, 720

def create_display(fullscreen=False):
    """Create display with automatic resolution handling."""
    flags = pygame.SCALED
    if fullscreen:
        flags |= pygame.FULLSCREEN

    screen = pygame.display.set_mode(
        (LOGICAL_W, LOGICAL_H),
        flags,
        vsync=1
    )
    return screen

# All game logic works in 1280×720 coordinates regardless
# of the actual window/monitor size
```

For pixel-art games that need crisp integer scaling:

```python
PIXEL_W, PIXEL_H = 320, 180

# Internal render target at native pixel-art resolution
render_surface = pygame.Surface((PIXEL_W, PIXEL_H))

# Display window at a larger size
screen = pygame.display.set_mode((960, 540))  # 3× scale

# Each frame: draw to render_surface, then scale up
render_surface.fill((0, 0, 0))
# ... draw game at 320×180 ...
scaled = pygame.transform.scale(render_surface, screen.get_size())
screen.blit(scaled, (0, 0))
pygame.display.flip()
```

## Common Pitfalls

**Calling `set_mode()` destroys the previous surface.** Any reference to the old surface becomes invalid. If other objects cache a reference to `screen`, update them after resizing.

**OPENGL and Surface blitting are mutually exclusive.** With the `OPENGL` flag set, you cannot use `Surface.blit()` or `pygame.draw` — you must use OpenGL rendering calls via PyOpenGL or similar.

**`set_mode()` must be called from the main thread.** SDL2 requires display operations on the main thread. Calling it from a background thread will crash or produce undefined behavior.

**VSync on integrated GPUs.** Some Intel integrated GPUs ignore the vsync request entirely. Always include a `Clock.tick()` fallback to prevent uncapped frame rates.
