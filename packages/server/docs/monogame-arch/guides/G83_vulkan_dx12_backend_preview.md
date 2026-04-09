# G83 — Vulkan & DirectX 12 Backend Preview (DesktopVK / DesktopDX)

> **Category:** guide · **Engine:** MonoGame · **Related:** [G72 Content Builder Migration](./G72_content_builder_migration.md) · [G82 3.8.5 StarterKit & New APIs](./G82_385_starterkit_new_apis.md) · [G2 Rendering & Graphics](./G2_rendering_and_graphics.md) · [G73 Cross-Platform Deployment](./G73_cross_platform_deployment.md)

MonoGame 3.8.5 introduces preview support for two new rendering backends: **DesktopVK** (Vulkan) and **DesktopDX** (DirectX 12). These replace the aging OpenGL (DesktopGL) and DirectX 11 backends with modern graphics APIs that support compute shaders, explicit GPU memory management, and better multi-threaded rendering. Both backends are in preview as of 3.8.5-preview.2 (January 2026) — usable for development and testing but not recommended for shipping games yet.

---

## Why New Backends?

DesktopGL uses OpenGL, which is effectively in maintenance mode — no new features, deprecated on macOS, and increasingly behind Vulkan/D3D12 in driver optimization. The legacy DesktopDX target uses DirectX 11, which lacks compute shader dispatch flexibility, explicit memory control, and modern debugging tooling.

The new backends unlock:

- **Compute shaders** — GPU-side particle systems, culling, physics, pathfinding
- **Explicit synchronization** — less driver overhead, more predictable frame times
- **Modern validation layers** — Vulkan's validation layer and D3D12's debug layer catch errors that OpenGL silently ignores
- **Future-proof platform** — DesktopGL will eventually be deprecated in favor of DesktopVK

---

## Creating a Project

### Using StarterKit Templates (Recommended)

The 3.8.5-preview.2 StarterKit templates include all three platform targets:

```bash
# Install 3.8.5 preview templates
dotnet new install MonoGame.Templates.CSharp::3.8.5-preview.2

# Create a StarterKit — includes DesktopGL, DesktopVK, and DesktopDX targets
dotnet new mgstarterkit -n MyGame
```

The StarterKit generates a solution with platform-specific projects. Build the Vulkan target:

```bash
cd MyGame
dotnet build MyGame.DesktopVK
dotnet run --project MyGame.DesktopVK
```

### From Source (Advanced)

If you need the latest fixes beyond preview.2:

```bash
git clone https://github.com/MonoGame/MonoGame.git
cd MonoGame
git checkout develop

# Build the framework with Vulkan support
dotnet build MonoGame.Framework/MonoGame.Framework.DesktopVK.csproj
```

Reference the locally-built framework in your game's `.csproj` instead of the NuGet package.

---

## DesktopVK (Vulkan) — Current Status

### What Works

- Basic 2D and 3D rendering (SpriteBatch, Model, BasicEffect, custom effects)
- Render targets and effect switching
- Fullscreen and windowed mode transitions
- VSync control
- FAudio integration for audio
- SPIR-V shaders compiled from HLSL via MonoGame's content pipeline

### Known Limitations (as of March 2026)

These are tracked issues being resolved before full release:

- **Pipeline cache degradation** — the shader pipeline cache works initially (~15 pipelines) but can degrade into creating thousands of uncached pipelines during extended sessions. Manifests as gradual frame time increases. Restart the game if frame times degrade unexpectedly during development.

- **Threading restrictions** — multi-threaded texture and resource loading triggers Vulkan validation errors due to shared command pool access. Load resources on the main thread or use a dedicated loading thread with synchronization. Do not call `Content.Load<T>()` from multiple threads simultaneously.

- **Swapchain image count** — currently hardcoded rather than dynamically negotiated. May cause issues on some drivers that prefer different image counts.

- **Surface capability quirks** — some drivers report restricted surface extents (e.g., 800×480) even when larger resolutions are requested, affecting exclusive fullscreen. Prefer borderless fullscreen during preview.

- **Validation layer noise** — swapchain images occasionally present with `VK_IMAGE_LAYOUT_UNDEFINED` instead of the spec-required `VK_IMAGE_LAYOUT_PRESENT_SRC_KHR`. Functionally correct on most drivers but triggers validation warnings.

### Vulkan Validation Layer Setup

Always develop with validation layers enabled — they catch real bugs:

```bash
# On Linux, install the Vulkan SDK or LunarG layers
sudo apt install vulkan-validationlayers

# Set environment variable to enable validation
export VK_INSTANCE_LAYERS=VK_LAYER_KHRONOS_validation

# Run your game
dotnet run --project MyGame.DesktopVK
```

On Windows, install the [LunarG Vulkan SDK](https://vulkan.lunarg.com/sdk/home). Validation is typically auto-detected when the SDK is installed.

---

## DesktopDX (DirectX 12) — Current Status

DesktopDX replaces the DirectX 11 backend with DirectX 12. It's at an earlier stage than DesktopVK:

- **Windows-only** — D3D12 is a Windows/Xbox API
- **Requires Windows 10+** with a D3D12-capable GPU
- **Feature parity** with DesktopVK is the goal but not yet achieved

Use DesktopDX when:
- Your game targets Windows exclusively
- You want D3D12's PIX debugging and GPU profiling tools
- You need D3D12-specific features (DirectX Raytracing in the future)

For cross-platform games, DesktopVK is the better default — Vulkan runs on Windows, Linux, and (via MoltenVK) macOS.

---

## Shader Compilation

Both new backends require compiled shader bytecode rather than HLSL source at runtime:

- **DesktopVK** — HLSL is cross-compiled to SPIR-V during content build
- **DesktopDX** — HLSL is compiled to DXIL (DX12 shader format) during content build

The MonoGame Content Builder handles this automatically. Your `.fx` effect files work unchanged — the pipeline detects the target platform and invokes the correct compiler.

### Custom Shader Workflow

If you write raw HLSL outside the effect framework:

```
# Content Builder compiles .fx → .xnb containing SPIR-V (VK) or DXIL (DX12)
# No manual shader compilation needed for standard Effect files
```

For advanced scenarios (compute shaders, custom pipelines), you may need to compile shaders manually:

```bash
# Compile HLSL to SPIR-V using DXC (DirectX Shader Compiler)
dxc -spirv -T cs_6_0 -E main compute.hlsl -Fo compute.spv

# Compile HLSL to DXIL
dxc -T cs_6_0 -E main compute.hlsl -Fo compute.dxil
```

---

## Migration from DesktopGL

For existing DesktopGL projects, migration is straightforward because the MonoGame API surface is identical — `SpriteBatch`, `GraphicsDevice`, `Effect`, `RenderTarget2D` all work the same way. The backend change is transparent to game code.

### Step-by-Step

1. **Update templates and NuGet packages** to 3.8.5-preview.2+
2. **Create a new platform project** targeting DesktopVK or DesktopDX alongside your existing DesktopGL project
3. **Share your game code** — the `Game1` class and all game logic remain in a shared project
4. **Rebuild content** — the Content Builder recompiles assets for the new target platform
5. **Test thoroughly** — rendering differences are rare but possible, especially around blend state edge cases and shader precision

### What Might Break

- **OpenGL-specific workarounds** — if you worked around OpenGL quirks (flipped render targets, half-pixel offsets), those workarounds may cause issues on Vulkan/DX12. Remove them and test.
- **Shader precision** — SPIR-V and DXIL have stricter floating-point behavior than GLSL. Shaders that relied on undefined behavior may render differently.
- **Multithreaded resource creation** — worked accidentally in OpenGL (driver serialized internally), will crash on Vulkan without proper synchronization.

---

## Performance Expectations

During preview, don't expect automatic performance gains. The new backends are being optimized for correctness first:

- **CPU overhead** may be higher during preview due to conservative synchronization
- **GPU performance** should be comparable to or better than DesktopGL for GPU-bound workloads
- **Frame time consistency** should improve once pipeline caching is fixed — Vulkan/DX12 have more predictable submission paths than OpenGL

Profile with backend-specific tools:
- **Vulkan** — RenderDoc, NVIDIA Nsight Graphics
- **DX12** — PIX, NVIDIA Nsight Graphics, AMD Radeon GPU Profiler

---

## Recommendations

- **Use DesktopVK for cross-platform development** — it will become the default desktop target
- **Keep DesktopGL as a fallback** for shipping until DesktopVK exits preview
- **Enable validation layers during development** — they catch real bugs before your players do
- **Don't ship on preview backends** — wait for the full 3.8.5 release or later
- **Report issues** on the [MonoGame GitHub](https://github.com/MonoGame/MonoGame/issues) with `DesktopVK` or `DesktopDX` labels

---

## Timeline

- **December 2025** — 3.8.5-preview.1: initial DesktopVK/DesktopDX templates
- **January 2026** — 3.8.5-preview.2: bug fixes, StarterKit templates with all three targets
- **Q1–Q2 2026** — 3.8.5 full release expected (pipeline cache, threading, and validation fixes)
- **3.9+** — DesktopGL deprecation, DesktopVK becomes default cross-platform target
