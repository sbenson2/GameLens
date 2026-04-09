# G21 — Environment Variables & Runtime Configuration

> **Category:** guide · **Engine:** FNA · **Related:** [FNA Architecture Rules](../fna-arch-rules.md) · [G03 SDL3 GPU API](./G03_sdl3_gpu_api.md) · [G09 FNA3D SDL GPU Migration](./G09_fna3d_sdl_gpu_migration.md) · [G08 Cross-Platform Deployment](./G08_cross_platform_deployment.md)

Complete reference for FNA and FNA3D environment variables that control graphics backends, input behavior, display settings, and platform configuration. Includes launch option equivalents for Steam/storefront integration and best practices for shipping games.

---

## Overview

FNA uses environment variables for runtime configuration rather than config files. This design matches XNA's philosophy: the game binary stays the same, and behavior is tuned externally. Most variables have equivalent launch options for Steam or other storefronts.

**Important for .NET Core/.NET 8+:** FNA3D variables must be set via `SDL3.SDL.SDL_SetHint()` rather than `System.Environment.SetEnvironmentVariable()`. The SDL hint system is what FNA3D actually reads.

```csharp
// Correct way to set FNA3D config on .NET 8+
SDL3.SDL.SDL_SetHint("FNA3D_FORCE_DRIVER", "OpenGL");

// This does NOT work for FNA3D variables on .NET Core
Environment.SetEnvironmentVariable("FNA3D_FORCE_DRIVER", "OpenGL");
```

## FNA Core Variables

### FNA_PLATFORM_BACKEND

Selects the platform abstraction layer. FNA uses a delegate-based system that loads either SDL2 or SDL3 at initialization.

| Value | Behavior |
|-------|----------|
| `SDL3` | Use SDL3 backend (default since 25.03) |
| `SDL2` | Use legacy SDL2 backend |

```bash
FNA_PLATFORM_BACKEND=SDL2 ./MyGame  # Force SDL2 on a system with both
```

### FNA_GRAPHICS_ENABLE_HIGHDPI

Enables high-DPI rendering on displays that support it (Retina, HiDPI Linux, Windows scaling).

| Value | Behavior |
|-------|----------|
| `1` | Enable — drawable size may exceed window size |
| unset | Disabled (default) |

When enabled, `GraphicsDevice.Viewport` reports the actual drawable resolution, which may be 2x the window size on Retina displays. Your UI scaling code must account for this.

**Launch option:** `/enablehighdpi:1`

```csharp
// Check the actual drawable vs. window size
int windowW = Window.ClientBounds.Width;   // e.g., 1920
int drawW = GraphicsDevice.Viewport.Width; // e.g., 3840 on 2x Retina
float scale = (float)drawW / windowW;
```

### FNA_GRAPHICS_JPEG_SAVE_QUALITY

Controls quality for `Texture2D.SaveAsJpeg()`.

| Value | Range | Default |
|-------|-------|---------|
| `1`–`100` | Low to high quality | 100 |

### FNA_KEYBOARD_USE_SCANCODES

Forces scancode-based keyboard input, ignoring the user's keyboard layout.

| Value | Behavior |
|-------|----------|
| `1` | WASD always maps to physical key positions regardless of layout |
| unset | Uses OS keyboard layout (default) |

**Launch option:** `/usescancodes:1`

Use this for games where physical key positions matter (WASD movement). Do not use for text input or games where the user expects their layout to be respected.

### FNA_GAMEPAD_NUM_GAMEPADS

Overrides XNA's hardcoded 4-controller limit.

| Value | Behavior |
|-------|----------|
| `1`–`N` | Support up to N gamepads |
| unset | 4 gamepads (XNA default) |

```bash
FNA_GAMEPAD_NUM_GAMEPADS=8 ./MyGame  # 8-player local multiplayer
```

### FNA_SDL_FORCE_BASE_PATH

Forces FNA to use `SDL_GetBasePath()` for resolving the executable directory instead of `AppDomain.CurrentDomain.BaseDirectory`.

Useful when the .NET runtime reports an incorrect base path (some container or sandbox environments).

## FNA3D Graphics Variables

### FNA3D_FORCE_DRIVER

Selects the graphics rendering backend. Since FNA3D migrated to SDL_GPU as the default, the legacy backend names map to the new system:

| Value | Actual Backend | Notes |
|-------|---------------|-------|
| `SDL_GPU` | SDL_GPU | Default since 25.03 |
| `Vulkan` | SDL_GPU (Vulkan) | Maps to SDL_GPU; no separate Vulkan renderer |
| `Metal` | SDL_GPU (Metal) | Maps to SDL_GPU; native Metal on Apple, no MoltenVK |
| `D3D12` | SDL_GPU (D3D12) | Maps to SDL_GPU |
| `D3D11` | Direct3D 11 | Standalone driver, Windows only |
| `OpenGL` | OpenGL | Standalone driver, all platforms |

**Launch option:** `/gldevice:%s`

```bash
# Force OpenGL for debugging
FNA3D_FORCE_DRIVER=OpenGL ./MyGame

# The SDL_GPU backend auto-selects the best API per platform:
#   Windows → D3D12 or Vulkan
#   macOS   → Metal
#   Linux   → Vulkan
```

### FNA3D_ENABLE_HDR_COLORSPACE

Enables HDR output. Only works with SDL_GPU and D3D11 backends.

| Value | Behavior |
|-------|----------|
| `1` | Enables HDR10 and extended sRGB colorspace support |
| unset | SDR output (default) |

Requires an HDR-capable display and OS-level HDR enabled. Your game must also render to an appropriate surface format (e.g., `SurfaceFormat.HdrBlendable`).

### FNA3D_ENABLE_LATESWAPTEAR

Enables "late swap tearing" (adaptive VSync). The GPU tears only when a frame misses the VSync deadline, reducing stutter compared to hard VSync.

| Value | Behavior |
|-------|----------|
| `1` | Use `FIFO_RELAXED` present mode |
| unset | Standard VSync (default) |

**Launch option:** `/enablelateswaptear:1`

### FNA3D_BACKBUFFER_SCALE_NEAREST

Controls the filtering mode when the backbuffer is scaled to the window size.

| Value | Behavior |
|-------|----------|
| `1` | Point/nearest-neighbor filtering (crisp pixels) |
| unset | Linear filtering (smooth, default) |

**Launch option:** `/backbufferscalenearest:1`

Essential for pixel art games where you want sharp integer scaling without blur.

### FNA3D_MOJOSHADER_PROFILE

Controls the GLSL profile used by the OpenGL backend for shader translation.

| Value | Effect |
|-------|--------|
| `glsl120` | GLSL 1.20 (maximum compatibility) |
| `glspirv` | GLSL SPIR-V (Vulkan interop) |

**Launch option:** `/mojoshaderprofile:%s`

Only relevant when using the OpenGL driver. The SDL_GPU backend handles shader translation internally.

### OpenGL Profile Overrides

These variables force specific OpenGL context types. Only relevant when `FNA3D_FORCE_DRIVER=OpenGL`.

| Variable | Value | Effect |
|----------|-------|--------|
| `FNA3D_OPENGL_FORCE_ES3` | `1` | Force OpenGL ES 3.0 context |
| `FNA3D_OPENGL_FORCE_CORE_PROFILE` | `1` | Force OpenGL 4.6 Core (needed for RenderDoc) |
| `FNA3D_OPENGL_FORCE_COMPATIBILITY_PROFILE` | `1` | Force OpenGL 2.1 Compatibility (legacy hardware) |

**Launch options:** `/glprofile:es3`, `/glprofile:core`, `/glprofile:compatibility`

### FNA3D_OPENGL_WINDOW_DEPTHSTENCILFORMAT

Override the depth/stencil buffer format for the OpenGL window surface.

| Value | Effect |
|-------|--------|
| A `DepthFormat` enum integer | Overrides the default depth/stencil format |

Uses `SDL_SetHintWithPriority` internally. Only needed for unusual hardware compatibility issues.

## Setting Variables in Code

### At Application Startup (Before Game Constructor)

```csharp
static class Program
{
    static void Main(string[] args)
    {
        // FNA core variables — use System.Environment (read before SDL init)
        Environment.SetEnvironmentVariable("FNA_GRAPHICS_ENABLE_HIGHDPI", "1");
        Environment.SetEnvironmentVariable("FNA_GAMEPAD_NUM_GAMEPADS", "8");

        // FNA3D variables — use SDL hints (.NET 8+)
        // These must be set AFTER SDL is initialized but BEFORE GraphicsDevice creation
        // Typically in Game constructor or Initialize()

        using var game = new MyGame();
        game.Run();
    }
}

public class MyGame : Game
{
    public MyGame()
    {
        // Set FNA3D hints early
        SDL3.SDL.SDL_SetHint("FNA3D_FORCE_DRIVER", "OpenGL");
        SDL3.SDL.SDL_SetHint("FNA3D_BACKBUFFER_SCALE_NEAREST", "1");

        _graphics = new GraphicsDeviceManager(this);
    }
}
```

### Parsing Launch Options

FNA supports `/key:value` command-line arguments that map to environment variables. This is the standard pattern for Steam launch options:

```
# Steam launch options example
./MyGame /gldevice:OpenGL /enablehighdpi:1 /usescancodes:1
```

FNA parses these automatically — you don't need to handle them yourself.

## Shipping Recommendations

### Default Configuration

For most games, ship with no environment variables set (use defaults):

- SDL_GPU backend auto-selects the best graphics API per platform
- SDL3 platform backend (current default)
- Standard VSync, no HiDPI, 4 gamepads

### Player-Facing Options

Expose these as in-game settings or launcher options:

| Setting | Variable | Common Presets |
|---------|----------|---------------|
| Graphics backend | `FNA3D_FORCE_DRIVER` | "Auto" (unset), "OpenGL" (compatibility) |
| VSync mode | `FNA3D_ENABLE_LATESWAPTEAR` | Off (standard VSync), On (adaptive) |
| Pixel scaling | `FNA3D_BACKBUFFER_SCALE_NEAREST` | Smooth (unset), Sharp (1) |
| HiDPI | `FNA_GRAPHICS_ENABLE_HIGHDPI` | Off (unset), On (1) |

### Debugging

For debugging and profiling, these combinations are useful:

```bash
# Force OpenGL Core for RenderDoc capture
FNA3D_FORCE_DRIVER=OpenGL FNA3D_OPENGL_FORCE_CORE_PROFILE=1 ./MyGame

# Force SDL2 backend for testing legacy path
FNA_PLATFORM_BACKEND=SDL2 ./MyGame

# Maximum compatibility mode
FNA3D_FORCE_DRIVER=OpenGL FNA3D_OPENGL_FORCE_COMPATIBILITY_PROFILE=1 ./MyGame
```

## Troubleshooting

**Game launches with wrong GPU on dual-GPU laptops** — Set `FNA3D_FORCE_DRIVER` to select a specific backend that targets the desired GPU. On Linux, also check `DRI_PRIME=1`.

**HiDPI causes UI to render at wrong scale** — Check both `Window.ClientBounds` and `GraphicsDevice.Viewport`. The viewport reflects the actual render target size, while ClientBounds reflects the logical window size.

**Late swap tear not working** — Not all drivers support `FIFO_RELAXED`. Falls back to standard VSync silently. Check driver documentation for your GPU.

**Environment variable has no effect** — On .NET 8+, FNA3D variables must be set via `SDL_SetHint`, not `Environment.SetEnvironmentVariable`. FNA core variables (prefixed `FNA_`) still use the system environment.
