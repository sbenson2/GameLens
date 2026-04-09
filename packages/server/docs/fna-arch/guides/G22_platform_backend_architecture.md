# G22 — Platform Backend Architecture

> **Category:** guide · **Engine:** FNA · **Related:** [FNA Architecture Rules](../fna-arch-rules.md) · [G03 SDL3 GPU API](./G03_sdl3_gpu_api.md) · [G09 FNA3D SDL GPU Migration](./G09_fna3d_sdl_gpu_migration.md) · [G21 Environment Variables](./G21_environment_variables_runtime_config.md) · [G08 Cross-Platform Deployment](./G08_cross_platform_deployment.md)

How FNA's delegate-based platform abstraction enables a single compiled binary to run on SDL2 or SDL3 without recompilation. Covers the `FNAPlatform` architecture, native library loading, the three-tier rendering stack (FNA → FNA3D → SDL_GPU), and practical implications for game developers.

---

## Architecture Overview

FNA separates platform concerns into three tiers:

```
┌─────────────────────────────────────────┐
│           Your Game Code                │
│    (Microsoft.Xna.Framework.Game)       │
├─────────────────────────────────────────┤
│         FNA Framework Layer             │
│   Graphics · Audio · Input · Content    │
├──────────┬──────────┬───────────────────┤
│  FNA3D   │  FAudio  │   FNAPlatform     │
│ (render) │ (audio)  │ (window/input/IO) │
├──────────┴──────────┴───────────────────┤
│       SDL3 (or SDL2) + OS APIs          │
└─────────────────────────────────────────┘
```

Game code never touches platform APIs directly. The framework layer delegates to native libraries through P/Invoke, and `FNAPlatform` provides the abstraction layer that selects SDL2 or SDL3 at runtime.

## FNAPlatform: Delegate-Based Abstraction

`FNAPlatform` is a static class that holds function pointer delegates for every platform operation. At initialization, it assigns these delegates to either SDL2 or SDL3 implementations.

### How Backend Selection Works

```
Program starts
    ↓
FNAPlatform static constructor runs
    ↓
Checks FNA_PLATFORM_BACKEND environment variable
    ↓
    ├── "SDL2" → loads SDL2 function pointers
    ├── "SDL3" → loads SDL3 function pointers (default since 25.03)
    └── unset  → defaults to SDL3
    ↓
All FNAPlatform delegates now point to chosen backend
    ↓
Game.Run() proceeds using those delegates
```

### What FNAPlatform Manages

| Domain | Delegates | Examples |
|--------|-----------|---------|
| **Window** | Create, destroy, resize, title, icon | `CreateWindow`, `DisposeWindow`, `ApplyWindowChanges` |
| **Input** | Keyboard, mouse, gamepad, touch | `GetKeyboardState`, `GetMouseState`, `GetGamePadState` |
| **Display** | Monitor enumeration, display modes | `GetDisplayBounds`, `GetCurrentDisplayMode` |
| **Clipboard** | Read/write system clipboard | `GetClipboardText`, `SetClipboardText` |
| **Events** | OS event pump, quit handling | `PollEvents`, `NeedsPlatformMainLoop` |
| **Timer** | High-resolution timing | `GetTicks`, `GetPerformanceCounter` |
| **Storage** | Path resolution | `GetBaseDirectory`, `GetStoragePath` |

### Why Delegates Instead of Interfaces

FNA uses static function delegates rather than an interface or abstract class because:

1. **No allocation** — no interface dispatch overhead in the game loop's hottest paths (input polling, event pumping)
2. **Single binary** — the compiled assembly doesn't reference SDL2 or SDL3 types directly; the delegates are assigned at runtime
3. **P/Invoke routing** — native library names are resolved once during delegate assignment, avoiding DllImport conflicts

This means a single `.dll`/`.so` game binary works with either SDL version — just swap the native libraries in the directory.

## FNA3D: The Rendering Stack

FNA3D is FNA's graphics library, presenting the XNA `GraphicsDevice` API backed by multiple rendering implementations.

### Backend Architecture (Post-SDL_GPU Migration)

As of 25.03, FNA3D uses SDL_GPU as its default rendering backend:

```
┌──────────────────────────────────┐
│     FNA GraphicsDevice API       │
│  (SpriteBatch, BasicEffect,      │
│   RenderTarget2D, etc.)          │
├──────────────────────────────────┤
│         FNA3D C API              │
│  (FNA3D_CreateDevice,            │
│   FNA3D_DrawPrimitives, etc.)    │
├────────┬────────┬────────────────┤
│SDL_GPU │ OpenGL │   D3D11        │
│(default│ (compat│  (Windows      │
│ driver)│  mode) │   only)        │
├────────┴────────┴────────────────┤
│  Vulkan · Metal · D3D12 · GL    │
│     (selected by SDL_GPU)        │
└──────────────────────────────────┘
```

### SDL_GPU: The Default Path

SDL_GPU is SDL3's cross-platform graphics abstraction. It auto-selects the best native API per platform:

| Platform | SDL_GPU Backend | Previous FNA3D Driver |
|----------|-----------------|----------------------|
| Windows | Direct3D 12 or Vulkan | D3D11 or Vulkan |
| macOS | Metal (native) | Vulkan via MoltenVK |
| Linux | Vulkan | Vulkan or OpenGL |
| iOS | Metal (native) | OpenGL ES |
| Consoles | Platform-native | Platform-native |

Key improvement: **macOS now uses native Metal** through SDL_GPU instead of translating through MoltenVK. This eliminates an entire translation layer and the associated bugs/performance overhead.

### Legacy Drivers

FNA3D retains standalone OpenGL and D3D11 drivers for compatibility:

- **OpenGL** — maximum hardware compatibility; required for some embedded/legacy GPUs. Also needed for RenderDoc capture (with core profile forced).
- **D3D11** — Windows-only standalone driver, useful when SDL_GPU's D3D12 has issues on specific hardware.

The standalone Vulkan driver has been **removed**. Requesting `Vulkan` via `FNA3D_FORCE_DRIVER` transparently routes to SDL_GPU with Vulkan backend.

## FAudio: Audio Architecture

FAudio reimplements XAudio2 and provides both low-level and high-level audio:

```
┌────────────────────────────────────┐
│  FNA Audio API                     │
│  SoundEffect · Song · XACT        │
├────────────────────────────────────┤
│  FAudio (XAudio2 reimplementation) │
├────────────────────────────────────┤
│  SDL Audio (SDL_AudioStream)       │
└────────────────────────────────────┘
```

FAudio handles mixing, 3D spatialization, and DSP effects entirely in software. SDL provides the audio device interface. This means audio behavior is identical across all platforms — there are no platform-specific audio quirks.

## Native Library Loading

FNA loads native libraries (SDL, FNA3D, FAudio, Theorafile) via P/Invoke. The library resolution depends on your .NET target:

### .NET Framework / Mono

Libraries are resolved by name from the executable directory or system paths:

- Windows: `SDL3.dll`, `FNA3D.dll`, `FAudio.dll`, `libtheorafile.dll`
- Linux: `libSDL3.so.0`, `libFNA3D.so.0`, `libFAudio.so.0`, `libtheorafile.so.0`
- macOS: `libSDL3.dylib`, `libFNA3D.dylib`, `libFAudio.dylib`, `libtheorafile.dylib`

### .NET 8+ (CoreCLR)

Uses `NativeLibrary.SetDllImportResolver` or the `FNADllMap` utility to map library names to platform-correct filenames:

```csharp
// In Program.cs, before Game creation
FNADllMap.Init();
```

`FNADllMap` reads a mapping configuration and redirects P/Invoke calls to the correct native library name per platform.

### NativeAOT

All native libraries are linked at compile time. Your `.csproj` specifies them as linker inputs:

```xml
<!-- Linux/macOS -->
<NativeLibrary Include="-lSDL3" />
<NativeLibrary Include="-lFNA3D" />
<NativeLibrary Include="-lFAudio" />
<NativeLibrary Include="-ltheorafile" />

<!-- Windows -->
<NativeLibrary Include="SDL3.lib" />
<NativeLibrary Include="FNA3D.lib" />
<NativeLibrary Include="FAudio.lib" />
<NativeLibrary Include="libtheorafile.lib" />
```

## Build Once, Run Anywhere

FNA's architecture enables a genuine "build once" model for managed (.NET) builds:

1. **Compile your game** against FNA once — produces a single managed assembly
2. **Bundle platform-specific fnalibs** — different native binaries per OS/arch
3. **Ship** — the same `.dll` runs on Windows, Linux, macOS with the correct fnalibs

```
MyGame/
├── MyGame.dll          # Same binary everywhere
├── MyGame.deps.json
├── win-x64/
│   ├── SDL3.dll
│   ├── FNA3D.dll
│   ├── FAudio.dll
│   └── libtheorafile.dll
├── linux-x64/
│   ├── libSDL3.so.0
│   ├── libFNA3D.so.0
│   ├── libFAudio.so.0
│   └── libtheorafile.so.0
└── osx-x64/
    ├── libSDL3.dylib
    ├── libFNA3D.dylib
    ├── libFAudio.dylib
    └── libtheorafile.dylib
```

NativeAOT builds are platform-specific by nature (compiled native executables), so the "build once" model applies only to managed/.NET builds.

## Runtime vs. Compile-Time: FNA vs. MonoGame

This is one of the most fundamental architectural differences:

| Aspect | FNA | MonoGame |
|--------|-----|----------|
| Platform detection | Runtime (`SDL_GetPlatform()`) | Compile-time (`#if DESKTOPGL`) |
| Graphics backend | Runtime (`FNA3D_FORCE_DRIVER`) | Compile-time (separate NuGet per platform) |
| Native libraries | Shipped alongside, loaded at runtime | Bundled in NuGet, linked per-platform |
| Project files | One `.csproj` for all platforms | Separate projects per platform target |
| Binary portability | Single managed binary, swap fnalibs | Separate build per platform |

FNA's approach means fewer build configurations and simpler CI, but requires shipping and managing native library bundles yourself.

## Practical Implications for Game Developers

### You Don't Need to Understand the Internals

For most games, the platform architecture is invisible. You write standard XNA code, and FNA routes everything to the right backend automatically. The architecture matters when:

- **Debugging rendering issues** — knowing which backend is active helps isolate driver-specific bugs
- **Optimizing performance** — SDL_GPU's Metal path on macOS is significantly faster than the old MoltenVK path
- **Shipping on Linux** — understanding fnalibs layout is essential for packaging
- **Porting to consoles** — NativeAOT builds require understanding the native library linking model

### Checking the Active Backend

```csharp
// Check which SDL version is active
string platform = SDL3.SDL.SDL_GetPlatform();
Console.WriteLine($"Platform: {platform}");

// FNA3D backend is selected at GraphicsDevice creation
// No runtime query available, but FNA3D_FORCE_DRIVER logs the selection
// Check stderr/stdout for "FNA3D Driver: ..." message at startup
```

### Keeping fnalibs Updated

FNA releases monthly (first of each month). Native libraries should be updated alongside:

```bash
# Update FNA source
cd lib/FNA
git pull
git submodule update --init --recursive

# Download latest fnalibs
# Check https://github.com/FNA-XNA/fnalibs-dailies
```

SDL3 is under active development. Keep fnalibs current to get driver fixes and new GPU support.
