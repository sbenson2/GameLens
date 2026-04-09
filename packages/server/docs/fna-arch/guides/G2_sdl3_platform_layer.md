# G2 — SDL3 Platform Layer

> **Category:** guide · **Engine:** FNA · **Related:** [FNA Rules](../fna-arch-rules.md) · [G1 Getting Started](./G1_getting_started.md) · [G3 MonoGame Migration](./G3_monogame_migration.md)

> Deep dive into FNA's SDL3 integration: the delegate-based platform abstraction, backend switching between SDL2 and SDL3, graphics driver selection, and platform-specific considerations.

---

## 1. Architecture Overview

FNA uses a three-tier architecture that cleanly separates your game code from platform-specific operations:

```
┌──────────────────────────┐
│     Your Game Code       │  ← XNA4-compatible API (Microsoft.Xna.Framework)
├──────────────────────────┤
│     FNA Framework        │  ← XNA4 reimplementation layer
├──────────────────────────┤
│  FNAPlatform (delegates) │  ← Runtime-selected platform backend
├────────────┬─────────────┤
│ SDL3 (default) │ SDL2 (legacy) │  ← Native platform backends
└────────────┴─────────────┘
```

### Delegate-Based Platform Abstraction

Unlike MonoGame, which uses compile-time `#if` directives for platform switching, FNA uses **static delegates** in the `FNAPlatform` class. All platform operations (windowing, input, file I/O) route through these delegates, which are assigned at static initialization time.

This design enables a **single compiled binary** that works across multiple platforms and backend versions without recompilation.

```csharp
// Internally, FNA's platform layer works like this (simplified):
// DO NOT replicate this pattern in game code — it's internal to FNA.
internal static class FNAPlatform
{
    // Delegates assigned once during static initialization
    internal static Func<string> GetPlatformBackend;
    internal static Action<Game> Init;
    internal static Action<Game> PollEvents;
    // ... many more delegates for all platform operations
}
```

---

## 2. SDL3 vs SDL2 Backend Selection

### Default Behavior

FNA defaults to **SDL3** as of recent releases. SDL3 brings significant improvements:

| Feature | SDL2 | SDL3 |
|---|---|---|
| GPU API | N/A | SDL_GPU (unified graphics abstraction) |
| Gamepad support | SDL_GameController | Enhanced with touchpad, LED, rumble |
| HiDPI | Basic | Improved per-monitor DPI awareness |
| Audio | SDL_audio | Redesigned audio subsystem |
| Platform init | SDL_main | SDL_RunApp (better mobile/console bootstrap) |
| Maintenance | Stable/legacy | Active development |

### Switching Backends

Set the environment variable **before** any FNA code executes:

```csharp
// In Program.cs, before creating the Game instance:

// Use SDL3 (default — no action needed)

// Fall back to SDL2 for compatibility with older native library sets:
Environment.SetEnvironmentVariable("FNA_PLATFORM_BACKEND", "SDL2");

using var game = new MyGameMain();
game.Run();
```

```bash
# Or set it externally before launching:
# Linux/macOS
export FNA_PLATFORM_BACKEND=SDL2
dotnet run

# Windows (PowerShell)
$env:FNA_PLATFORM_BACKEND = "SDL2"
dotnet run
```

**When to use SDL2:**
- You have prebuilt native libraries only for SDL2
- Targeting a platform where SDL3 binaries are not yet available
- Debugging a regression that may be SDL3-specific

---

## 3. Graphics Backend (FNA3D)

FNA3D is FNA's graphics abstraction layer, separate from SDL. It supports four rendering backends:

| Backend | Platforms | Notes |
|---|---|---|
| **OpenGL 3.2+** | Windows, Linux, macOS (deprecated on macOS) | Most compatible; default on Linux |
| **Vulkan** | Windows, Linux | Best performance on modern hardware |
| **Metal** | macOS, iOS, tvOS | Required on Apple platforms going forward |
| **Direct3D 11** | Windows | Good performance; avoids OpenGL driver quirks |

### Forcing a Graphics Backend

```csharp
// Force Vulkan rendering (must be set before Game construction)
Environment.SetEnvironmentVariable("FNA3D_FORCE_DRIVER", "Vulkan");

// Force Metal on macOS
Environment.SetEnvironmentVariable("FNA3D_FORCE_DRIVER", "Metal");

// Force D3D11 on Windows
Environment.SetEnvironmentVariable("FNA3D_FORCE_DRIVER", "D3D11");

// Force OpenGL (compatibility fallback)
Environment.SetEnvironmentVariable("FNA3D_FORCE_DRIVER", "OpenGL");
```

### Auto-Selection Logic

When no driver is forced, FNA3D picks the best available backend:
1. **Windows:** D3D11 → Vulkan → OpenGL
2. **Linux:** Vulkan → OpenGL
3. **macOS:** Metal → OpenGL (OpenGL is deprecated by Apple)
4. **iOS/tvOS:** Metal

---

## 4. Window and Display Management

FNA's windowing goes through SDL3, providing consistent behavior across platforms:

```csharp
// Window configuration in your Game constructor
public MyGameMain()
{
    _graphics = new GraphicsDeviceManager(this)
    {
        PreferredBackBufferWidth = 1920,
        PreferredBackBufferHeight = 1080,
        IsFullScreen = false,
        // HardwareModeSwitch: true = exclusive fullscreen, false = borderless
        HardwareModeSwitch = false,
    };

    // Allow user window resizing
    Window.AllowUserResizing = true;
    Window.ClientSizeChanged += OnWindowResize;
}

private void OnWindowResize(object sender, EventArgs e)
{
    // Handle resolution changes (e.g., update camera, render targets)
    int newWidth = Window.ClientBounds.Width;
    int newHeight = Window.ClientBounds.Height;
}
```

### HiDPI Support

Enable high-DPI rendering for Retina/4K displays:

```csharp
// Set before Game construction
Environment.SetEnvironmentVariable("FNA_GRAPHICS_ENABLE_HIGHDPI", "1");
```

When HiDPI is enabled, `Window.ClientBounds` reports logical pixels while `GraphicsDevice.PresentationParameters.BackBufferWidth/Height` reports physical pixels. Scale your rendering accordingly.

### Multi-Monitor

```csharp
// Enumerate available displays (XNA-compatible API)
foreach (var adapter in GraphicsAdapter.Adapters)
{
    var displayMode = adapter.CurrentDisplayMode;
    // displayMode.Width, displayMode.Height, displayMode.Format
}
```

---

## 5. Input Through SDL3

FNA routes all input through SDL3, exposed via the standard XNA input API:

```csharp
protected override void Update(GameTime gameTime)
{
    // Keyboard
    var kb = Keyboard.GetState();
    if (kb.IsKeyDown(Keys.Space)) { /* jump */ }

    // Mouse
    var mouse = Mouse.GetState();
    var mousePos = new Vector2(mouse.X, mouse.Y);

    // Gamepad (SDL3 provides enhanced gamepad support)
    var pad = GamePad.GetState(PlayerIndex.One);
    if (pad.IsConnected)
    {
        var leftStick = pad.ThumbSticks.Left;
        bool aPressed = pad.Buttons.A == ButtonState.Pressed;

        // Rumble (supported via SDL3 haptics)
        GamePad.SetVibration(PlayerIndex.One, 0.5f, 0.5f);
    }

    base.Update(gameTime);
}
```

### Text Input (IME Support)

SDL3 provides improved IME composition for text fields:

```csharp
// Subscribe to text input events
Window.TextInput += (sender, e) =>
{
    char inputChar = e.Character;
    // Append to your text buffer
};

// Start/stop text input mode (enables on-screen keyboard on mobile,
// activates IME composition on desktop)
// FNA manages this automatically when TextInput is subscribed
```

---

## 6. Platform-Specific Notes

### Apple Platforms (macOS, iOS, tvOS)

- OpenGL is deprecated on Apple platforms. Metal backend is recommended.
- Use `SDL_RunApp` bootstrapping for non-PC platforms. FNA handles this internally, but custom launchers must account for it.
- On macOS, native libraries go in `/usr/local/lib` or the app bundle's `Frameworks/` directory.

### Linux

- Flatpak is the recommended distribution method for end users.
- Install SDL3 from your package manager or build from source.
- Vulkan requires appropriate GPU drivers (Mesa/NVIDIA/AMDGPU).

### Windows

- Enable case-sensitive filesystem for cross-platform compatibility: `fsutil.exe file SetCaseSensitiveInfo <folder> enable`
- D3D11 is the default graphics backend and typically offers the best experience.

### Console Platforms

Console support requires NDA platform access. FNA supports consoles through FNA3D's platform-specific backends. Bootstrapping via `SDL_RunApp` is required. See [Appendix B: FNA on Consoles](https://fna-xna.github.io/docs/appendix/Appendix-B:-FNA-on-Consoles/) in the official docs (NDA required).

---

## 7. Environment Variable Reference

Complete list of FNA environment variables affecting the platform layer:

| Variable | Values | Default | Purpose |
|---|---|---|---|
| `FNA_PLATFORM_BACKEND` | `SDL2`, `SDL3` | `SDL3` | Select platform backend |
| `FNA_GRAPHICS_ENABLE_HIGHDPI` | `0`, `1` | `0` | Enable HiDPI rendering |
| `FNA3D_FORCE_DRIVER` | `OpenGL`, `Vulkan`, `Metal`, `D3D11` | Auto | Force graphics backend |
| `FNA_OPENGL_FORCE_ES3` | `0`, `1` | `0` | Force OpenGL ES 3.0 |
| `FNA_OPENGL_FORCE_CORE_PROFILE` | `0`, `1` | `0` | Force OpenGL Core Profile |
| `FNA3D_OPENGL_FORCE_COMPATIBILITY_PROFILE` | `0`, `1` | `0` | Force OpenGL Compat Profile |
| `FNA_AUDIO_DISABLE_SOUND` | `0`, `1` | `0` | Disable audio entirely |
| `FNA_KEYBOARD_USE_SCANCODES` | `0`, `1` | `0` | Use scancodes instead of keycodes |

---

## 8. Next Steps

- **[G1 — Getting Started](./G1_getting_started.md):** Project setup, first game window, native library setup.
- **[G3 — MonoGame Migration](./G3_monogame_migration.md):** Content pipeline, shader, and API differences when porting from MonoGame.
