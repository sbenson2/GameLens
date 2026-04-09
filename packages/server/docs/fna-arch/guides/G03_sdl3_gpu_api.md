# G03 — FNA3D, SDL_gpu, and the SDL3 Graphics Transition

> **Category:** Guide · **Engine:** FNA · **Related:** [G01 Getting Started](./G01_getting_started.md) · [G02 NativeAOT Publishing](./G02_nativeaot_publishing.md) · [FNA Architecture Rules](../fna-arch-rules.md)

FNA's graphics layer is migrating from its custom FNA3D backend to SDL_gpu, the official GPU API that shipped with SDL3. This guide covers what SDL_gpu is, how it affects FNA games, the migration timeline, backend selection, shader compilation changes, and what developers need to do (or not do) during the transition.

---

## Table of Contents

1. [Background: FNA3D to SDL_gpu](#1--background-fna3d-to-sdl_gpu)
2. [What is SDL_gpu?](#2--what-is-sdl_gpu)
3. [How FNA Uses SDL_gpu](#3--how-fna-uses-sdl_gpu)
4. [Supported Graphics Backends](#4--supported-graphics-backends)
5. [Migration Impact on Game Code](#5--migration-impact-on-game-code)
6. [Shader Compilation Changes](#6--shader-compilation-changes)
7. [SDL3 Input and Platform Changes](#7--sdl3-input-and-platform-changes)
8. [Building FNA Against SDL3](#8--building-fna-against-sdl3)
9. [Debugging Graphics Issues](#9--debugging-graphics-issues)
10. [Timeline and Stability](#10--timeline-and-stability)
11. [Common Pitfalls](#11--common-pitfalls)

---

## 1 — Background: FNA3D to SDL_gpu

FNA's graphics have historically been handled by **FNA3D**, a custom rendering library built by Ethan Lee that abstracted over OpenGL, Vulkan, Metal, and D3D11. FNA3D served FNA well for years, but maintaining a separate GPU abstraction layer is a significant burden.

SDL3 introduced **SDL_gpu** — a cross-platform GPU API designed to replace the patchwork of backend-specific code that every framework maintains. The key insight: SDL_gpu was directly inspired by and co-developed with the FNA team's experience building FNA3D and its predecessor, Refresh.

### The lineage

```
Refresh (FNA internal) → FNA3D → SDL_gpu (SDL3 official)
```

This means SDL_gpu is not a foreign API being imposed on FNA — it is the natural evolution of FNA's own graphics architecture, now maintained by the broader SDL community.

## 2 — What is SDL_gpu?

SDL_gpu is a cross-platform GPU abstraction layer that ships as part of SDL3. It provides:

- **Unified API** across Vulkan, Metal, D3D11, and D3D12
- **Shader cross-compilation** using SDL's shader tooling
- **Compute shader support** (new capability not available in FNA3D's OpenGL path)
- **Modern GPU features** — proper resource binding models, pipeline state objects, render passes
- **Console support** — SDL_gpu's abstraction maps cleanly to console graphics APIs

### SDL_gpu vs. FNA3D Feature Comparison

| Feature | FNA3D | SDL_gpu |
|---------|-------|---------|
| OpenGL backend | Yes | No (dropped) |
| Vulkan backend | Yes | Yes |
| Metal backend | Yes | Yes |
| D3D11 backend | Yes | Yes |
| D3D12 backend | No | Yes |
| Compute shaders | Limited | Yes |
| Shader format | Backend-specific | SDL_gpu shader format |
| Maintained by | Ethan Lee | SDL project + contributors |

**Important:** The OpenGL backend is gone in SDL_gpu. If your deployment target required OpenGL (e.g., very old Linux systems), you'll need to evaluate whether Vulkan is available on those systems. For the vast majority of modern systems (2016+), Vulkan or Metal is available.

## 3 — How FNA Uses SDL_gpu

From the FNA game developer's perspective, very little changes at the API level. FNA's public API remains the XNA 4.0 API surface:

```csharp
// This code works identically with FNA3D or SDL_gpu underneath
spriteBatch.Begin(SpriteSortMode.Deferred, BlendState.AlphaBlend);
spriteBatch.Draw(texture, position, Color.White);
spriteBatch.End();
```

FNA translates XNA API calls into SDL_gpu calls internally. The `GraphicsDevice`, `SpriteBatch`, `Effect`, `RenderTarget2D`, and all other XNA graphics types continue to work as before.

### What changes internally

```
Your Game Code
    ↓ (XNA 4.0 API — unchanged)
FNA Framework
    ↓ (was: FNA3D calls, now: SDL_gpu calls)
SDL_gpu
    ↓ (auto-selects backend)
Vulkan / Metal / D3D11 / D3D12
```

## 4 — Supported Graphics Backends

SDL_gpu auto-selects the best available backend for the current platform:

| Platform | Primary Backend | Fallback |
|----------|----------------|----------|
| Windows | D3D12 | D3D11, Vulkan |
| Linux | Vulkan | — |
| macOS | Metal | — |
| iOS | Metal | — |
| Android | Vulkan | — |

### Forcing a specific backend

For debugging or compatibility testing, you can force a backend via environment variable:

```bash
# Force Vulkan on Windows
SDL_GPU_DRIVER=vulkan ./MyGame

# Force D3D11 on Windows (if D3D12 causes issues)
SDL_GPU_DRIVER=d3d11 ./MyGame
```

## 5 — Migration Impact on Game Code

### What does NOT change

- **All XNA API calls** — `SpriteBatch`, `GraphicsDevice`, `Effect`, `Texture2D`, etc.
- **Game lifecycle** — `Initialize`, `LoadContent`, `Update`, `Draw`
- **Content loading** — `ContentManager.Load<T>()` works identically
- **Render target usage** — `RenderTarget2D` creation and switching
- **Blend states, sampler states, rasterizer states** — all XNA state objects

### What MAY change

- **Shader compilation** — if you use custom `.fx` effects, the compilation toolchain changes (see Section 6)
- **Native library dependencies** — `fnalibs` now includes SDL3 instead of SDL2, and FNA3D is replaced by SDL_gpu (bundled in SDL3)
- **Platform-specific rendering quirks** — some OpenGL-specific workarounds in your code may no longer be needed (or may need replacement)
- **GPU debugging tools** — different tools apply (RenderDoc for Vulkan, PIX for D3D12, Xcode GPU debugger for Metal)

### Checklist for existing projects

```
□ Update FNA submodule to SDL3-compatible branch
□ Replace SDL2 fnalibs with SDL3 fnalibs
□ Remove FNA3D from fnalibs (now part of SDL3)
□ Recompile custom shaders using SDL_gpu shader tools
□ Test on all target platforms
□ Remove any OpenGL-specific workarounds from game code
□ Update CI/CD scripts for new native library paths
```

## 6 — Shader Compilation Changes

This is the most significant change for games with custom effects.

### Previous workflow (FNA3D)

FNA historically used DXBC shader bytecode (compiled with Microsoft's FXC compiler). FNA3D would cross-compile this to the appropriate backend format at load time.

```bash
# Old: Compile .fx to DXBC
fxc /T fx_2_0 MyShader.fx /Fo MyShader.fxb
```

### New workflow (SDL_gpu)

SDL_gpu uses its own shader format. The SDL shader tools compile HLSL (or SPIR-V) to a cross-platform shader bundle that SDL_gpu can load on any backend.

```bash
# New: Compile HLSL to SDL_gpu shader format
# (Exact tool name and flags depend on SDL3 shader compiler version)
sdl-shadercross MyShader.hlsl -o MyShader.sdlshader
```

### Migration path for shaders

1. **Keep your `.fx` / `.hlsl` source files** — the source shader code generally works unchanged
2. **Replace the compilation step** — use SDL's shader cross-compilation tools instead of FXC
3. **Update content loading** — `Effect` loading in FNA handles the new format transparently if using the latest FNA
4. **Test visual output** — shader compilation differences can cause subtle rendering changes

### Games with no custom shaders

If your game only uses `SpriteBatch`, `BasicEffect`, or other built-in XNA effects, you have **nothing to do**. FNA bundles pre-compiled versions of all standard effects.

## 7 — SDL3 Input and Platform Changes

The SDL3 migration is not just graphics. SDL3 includes changes across the board:

### Input changes

- **SDL_GameController** renamed to **SDL_Gamepad** — FNA abstracts this, so your `GamePad` API calls don't change
- **Improved haptics API** — more rumble motors, trigger rumble on supported controllers
- **Pen/tablet input** — new in SDL3, not exposed through XNA API but accessible via `SDL3.SDL` P/Invoke

### SDL_Storage

SDL3 introduces `SDL_Storage`, a cross-platform file I/O API designed for game save data and cloud saves. FNA may expose this for `StorageContainer` functionality.

### Event system

SDL3's event system has been reworked. This is invisible to FNA game code — FNA's input polling abstracts over SDL events.

## 8 — Building FNA Against SDL3

### Prerequisites

- **.NET 8+** (or .NET 9 / .NET 10)
- **SDL3 development libraries** (headers + shared libraries)
- **FNA source** (SDL3 branch)
- **SDL3 fnalibs** (prebuilt native binaries)

### Build steps

```bash
# Clone FNA (ensure you're on the SDL3-compatible branch)
git clone --recursive https://github.com/FNA-XNA/FNA.git lib/FNA
cd lib/FNA
git checkout main  # SDL3 support is on main as of 2026

# Download SDL3 fnalibs
# Check https://fna-xna.github.io for the latest fnalibs package
# Place in lib/fnalibs/

# Build your game
cd ../..
dotnet build MyGame.sln
```

### Project file changes

Your `.csproj` should not need changes — the `ProjectReference` to FNA still works. However, ensure your native library copy step references the SDL3 versions:

```xml
<!-- Copy SDL3 native libraries to output -->
<ItemGroup>
  <Content Include="lib/fnalibs/x64/**" CopyToOutputDirectory="PreserveNewest" />
</ItemGroup>
```

## 9 — Debugging Graphics Issues

### Common issues during SDL3 migration

| Symptom | Likely Cause | Fix |
|---------|-------------|-----|
| Black screen | Missing SDL3 native libraries | Verify fnalibs are in output directory |
| Shader load failure | Old DXBC shader format | Recompile shaders with SDL shader tools |
| Wrong colors / gamma | Backend difference in sRGB handling | Check `GraphicsDevice.PresentationParameters.RenderTargetUsage` |
| Crash on startup | SDL3/SDL2 library conflict | Ensure no SDL2 libraries remain in output |
| Performance regression | Debug validation layers active | Disable Vulkan validation layers for release |

### GPU debugging tools by backend

| Backend | Tool | Notes |
|---------|------|-------|
| Vulkan | RenderDoc | Attach to process, capture frames |
| D3D11 | PIX, RenderDoc | Windows only |
| D3D12 | PIX | Windows only, best D3D12 debugger |
| Metal | Xcode GPU Frame Capture | macOS only |

### SDL_gpu debug logging

```bash
# Enable verbose SDL_gpu logging
SDL_LOG_PRIORITY=verbose ./MyGame
```

## 10 — Timeline and Stability

| Milestone | Date | Status |
|-----------|------|--------|
| SDL_gpu API design (from FNA3D/Refresh) | 2024 | Complete |
| SDL_gpu merged into SDL3 | 2024 | Complete |
| SDL3 1.0 release | 2025 | Released |
| FNA stable ABI update for SDL3 | 2025–2026 | In progress |
| FNA3D deprecated | TBD | After SDL_gpu proves stable |

### Recommendation

For **new FNA projects** starting in 2026: target SDL3 from the start. The SDL3 branch of FNA is the future.

For **existing FNA games** in production: wait until the FNA team marks SDL3 support as stable (watch the FNA repository for announcements). The SDL2 path continues to work and receive bug fixes.

## 11 — Common Pitfalls

**Mixing SDL2 and SDL3 libraries.** If both `SDL2.dll` and `SDL3.dll` are in your output directory, FNA may load the wrong one. Clean your build output and ensure only one version is present.

**Assuming OpenGL is available.** SDL_gpu drops OpenGL entirely. If you had conditional code paths for OpenGL, they need removal or replacement with Vulkan equivalents.

**Shipping debug shader builds.** SDL_gpu shader tools have debug and release modes. Debug shaders include validation that hurts performance. Always ship release-compiled shaders.

**Forgetting to update CI/CD.** Your build pipeline needs updated fnalibs URLs and shader compilation steps. If you cached the old fnalibs, invalidate the cache.

**P/Invoking SDL2 directly.** If your game calls `SDL2.SDL.*` via P/Invoke, those calls need updating to `SDL3.SDL.*`. The function signatures may have changed — consult the SDL2→SDL3 migration guide.

---

> **Next steps:** If you're starting a new FNA project with SDL3, see [G01 Getting Started](./G01_getting_started.md) for project setup, then return here for graphics backend details. For deploying with NativeAOT, see [G02 NativeAOT Publishing](./G02_nativeaot_publishing.md).
