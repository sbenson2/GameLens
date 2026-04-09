# G09 — FNA3D SDL_GPU Migration

> **Category:** guide · **Engine:** FNA · **Related:** [G03 SDL3 GPU API](./G03_sdl3_gpu_api.md) · [G08 Cross-Platform Deployment](./G08_cross_platform_deployment.md) · [G02 NativeAOT Publishing](./G02_nativeaot_publishing.md)

How to work with FNA3D's transition to SDL_GPU as its primary graphics backend. Covers what changed, how to configure backends, environment variable controls, and what to watch for when updating FNA3D in an existing project.

---

## Background: FNA3D's Backend Evolution

FNA3D is the graphics library that FNA uses to implement XNA's `GraphicsDevice` API. Historically, FNA3D supported multiple backends:

- **OpenGL** — the original cross-platform default
- **Vulkan** — added for modern GPU access and better Linux/Steam Deck performance
- **D3D11** — Windows-specific backend
- **Metal** — macOS/iOS backend (via MoltenVK or native)

Starting in **FNA3D 25.03 (March 2025)**, the architecture changed significantly:

- **SDL_GPU became the default and recommended backend.** SDL_GPU is a cross-platform GPU abstraction layer built into SDL3 that provides Vulkan, D3D12, D3D11, and Metal support through a single API.
- **The standalone Vulkan renderer was removed.** Requesting "Vulkan" now maps to SDL_GPU with a Vulkan backend — the behavior is the same, but the code path goes through SDL_GPU's abstraction.
- **FNA3D now requires SDL 3.2.0 or newer** as its sole native dependency for graphics.

This is the culmination of work that started with the SDL GPU API proposal by FNA's maintainer (Ethan Lee / flibitijibibo), who used experience from FNA3D and the Refresh library to design SDL's GPU abstraction from scratch.

---

## What This Means for Your Game

### If You're Starting a New FNA Project

Nothing special to do. FNA3D ships with SDL_GPU as the default. Your game calls `GraphicsDevice` methods as always; FNA3D routes them through SDL_GPU, which picks the best available backend for the platform:

| Platform | SDL_GPU Backend |
|---|---|
| Windows | D3D12 (preferred), D3D11 (fallback), Vulkan |
| Linux | Vulkan |
| macOS | Metal |

### If You're Updating an Existing FNA Project

1. **Update fnalibs** — download fresh fnalibs that include SDL 3.2+ and the updated FNA3D. The old fnalibs with separate Vulkan/OpenGL libraries won't work.
2. **Update your FNA submodule** — `git submodule update --remote` to pull FNA's latest commit, which references the new FNA3D.
3. **Remove old environment variable overrides** — if you previously set `FNA3D_FORCE_DRIVER=Vulkan` or `FNA3D_FORCE_DRIVER=OpenGL`, update them (see below).
4. **Test on all target platforms** — the SDL_GPU path is well-tested but your specific shader/render patterns should be verified.

---

## Configuring the Graphics Backend

FNA3D respects environment variables for backend selection. With the SDL_GPU migration, the available options have changed.

### FNA3D_FORCE_DRIVER

Controls which FNA3D driver is used:

```bash
# Use SDL_GPU (default — you don't need to set this)
export FNA3D_FORCE_DRIVER=SDLGPU

# "Vulkan" is now an alias for SDLGPU (backwards compatibility)
export FNA3D_FORCE_DRIVER=Vulkan

# Force OpenGL (legacy path — still available but not recommended)
export FNA3D_FORCE_DRIVER=OpenGL
```

### SDL_GPU_DRIVER

When using SDL_GPU, you can further control which GPU backend SDL uses:

```bash
# Force Vulkan backend within SDL_GPU
export SDL_GPU_DRIVER=vulkan

# Force D3D12 on Windows
export SDL_GPU_DRIVER=d3d12

# Force D3D11 on Windows (compatibility)
export SDL_GPU_DRIVER=d3d11

# Force Metal on macOS
export SDL_GPU_DRIVER=metal
```

These are useful for debugging platform-specific rendering issues. In production, let SDL_GPU auto-select.

### Setting Environment Variables in Code

You can set these before `GraphicsDeviceManager` initialization using SDL's hint system:

```csharp
// In your Game constructor, before graphics device creation
SDL3.SDL.SDL_SetHint("FNA3D_FORCE_DRIVER", "SDLGPU");
SDL3.SDL.SDL_SetHint("SDL_GPU_DRIVER", "vulkan");
```

---

## Shader Compatibility

FNA uses DXBC (DirectX Bytecode) shaders compiled with FXC. This has not changed with the SDL_GPU migration. The shader pipeline remains:

```
.fx source  →  FXC compiler  →  .fxb (DXBC bytecode)  →  FNA3D/SDL_GPU  →  runtime translation
```

SDL_GPU translates DXBC shaders to the appropriate backend format at runtime (SPIR-V for Vulkan, MSL for Metal, DXIL for D3D12). This translation is handled by MojoShader, which is bundled inside FNA3D.

**No shader recompilation is needed** when migrating to SDL_GPU. Your existing `.fxb` files work as-is.

### Shader Debugging Tips

If a shader renders differently after the migration:

1. **Check blend state** — SDL_GPU's blend state handling is stricter than the old OpenGL path. Verify your `BlendState` settings.
2. **Check depth/stencil** — the default depth buffer format may differ. Explicitly set `PreferredDepthStencilFormat` in your `GraphicsDeviceManager`.
3. **Use RenderDoc or Nsight** — SDL_GPU's Vulkan and D3D12 backends work with standard GPU debuggers. Capture a frame and compare.

---

## Performance Considerations

SDL_GPU generally provides equal or better performance compared to FNA3D's previous backends:

- **Draw call overhead** is lower on D3D12 and Vulkan compared to the old OpenGL path.
- **Shader compilation** happens at pipeline creation time (first use), which may cause a brief hitch. Warm up your shaders during loading screens by drawing one frame with each shader/state combination.
- **Memory management** is handled by SDL_GPU's internal allocator. If you're monitoring VRAM usage, the allocation patterns will differ from the old backends.

### Steam Deck Considerations

The Steam Deck runs Linux with Vulkan. SDL_GPU's Vulkan backend is the natural choice here. If you previously relied on the standalone Vulkan renderer, the transition is seamless — performance should be equivalent or improved.

For native ARM64 Linux (no Proton), ensure your fnalibs include the `lib-arm64` variants built against SDL 3.2+.

---

## Troubleshooting

**"No suitable FNA3D driver found"** — your fnalibs are outdated and don't include SDL_GPU-compatible FNA3D. Download fresh fnalibs.

**Crash on startup with SDL_GPU** — check that your GPU drivers support Vulkan 1.1+ (Linux) or that D3D12 is available (Windows 10+). Fall back to D3D11 with `SDL_GPU_DRIVER=d3d11` for older Windows systems.

**Visual glitches that weren't present before** — capture a frame with RenderDoc. Common causes are blend state differences and depth buffer format mismatches between the old and new backends.

**"FNA3D_FORCE_DRIVER=Vulkan" no longer selects standalone Vulkan** — correct, this now maps to SDL_GPU with Vulkan backend. The behavior should be identical. If you need the removed standalone Vulkan renderer, pin an older FNA3D version (not recommended).

---

## Migration Checklist

- [ ] Updated FNA submodule to latest
- [ ] Downloaded fnalibs with SDL 3.2+ and updated FNA3D
- [ ] Removed or updated old `FNA3D_FORCE_DRIVER` environment variables
- [ ] Tested rendering on Windows (D3D12/D3D11), Linux (Vulkan), and macOS (Metal)
- [ ] Verified shader rendering matches expectations
- [ ] Checked performance on target hardware (especially Steam Deck if applicable)
- [ ] Updated CI build scripts to download current fnalibs archive

---
