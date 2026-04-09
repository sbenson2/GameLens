# G83 — Vulkan & DirectX 12 Graphics Backends

> **Category:** guide · **Engine:** MonoGame · **Related:** [G82 3.8.5 StarterKit & New APIs](./G82_385_starterkit_new_apis.md) · [G72 Content Builder Migration](./G72_content_builder_migration.md) · [G2 Rendering & Graphics](./G2_rendering_and_graphics.md) · [G73 Cross-Platform Deployment](./G73_cross_platform_deployment.md) · [G33 Profiling & Optimization](./G33_profiling_optimization.md)

MonoGame 3.8.5 introduces native Vulkan and DirectX 12 graphics backends alongside the existing OpenGL and DirectX 11 backends. This guide covers backend selection, project setup, rendering differences, known limitations, and migration considerations. Both backends are preview-quality as of 3.8.5-preview.2 (January 2026) — suitable for development and testing but not yet recommended for production shipping.

---

## Backend Overview

MonoGame 3.8.5 expands platform support from two legacy backends to four:

| Backend | Platform Target | NuGet Suffix | Status |
|---------|----------------|--------------|--------|
| OpenGL (DesktopGL) | Windows, macOS, Linux | `.DesktopGL` | Stable (default) |
| DirectX 11 | Windows | `.WindowsDX` | Stable |
| **Vulkan** (DesktopVK) | Windows, Linux, macOS (MoltenVK) | `.DesktopVK` | Preview |
| **DirectX 12** (DesktopDX) | Windows 10+ | `.DesktopDX` | Preview |

The Vulkan and DX12 backends implement the same `GraphicsDevice` API surface that existing MonoGame code targets. In most cases, switching backends requires no code changes — only a different project template or NuGet package reference.

## Creating a New Project with VK/DX12

### Using StarterKit Templates

The 3.8.5 templates include preconfigured targets for the new backends:

```bash
# Install 3.8.5 preview templates
dotnet new install MonoGame.Templates.CSharp::3.8.5-preview.2

# Create a Vulkan-targeted StarterKit
dotnet new mgstarterkit -n MyGame --platform DesktopVK

# Create a DirectX 12-targeted StarterKit
dotnet new mgstarterkit -n MyGame --platform DesktopDX
```

The blank template variants are also available:

```bash
# Blank project with VK/DX12 targets included
dotnet new mgblankmgcbstartkit -n MyGame
```

### Using Source/Binary References

If you prefer to reference MonoGame from source or binary downloads rather than NuGet:

1. Clone the MonoGame repository at the `3.8.5-preview.2` tag
2. Build the desired platform target (see MonoGame build docs)
3. Reference the built assemblies in your `.csproj`

Binary releases are published on the GitHub releases page starting with 3.8.5.

## Switching an Existing Project

To migrate an existing DesktopGL or WindowsDX project to a new backend:

### Step 1 — Update NuGet References

Replace the framework package in your `.csproj`:

```xml
<!-- Before: DesktopGL -->
<PackageReference Include="MonoGame.Framework.DesktopGL"
                  Version="3.8.5-preview.2" />

<!-- After: Vulkan -->
<PackageReference Include="MonoGame.Framework.DesktopVK"
                  Version="3.8.5-preview.2" />

<!-- Or: DirectX 12 -->
<PackageReference Include="MonoGame.Framework.DesktopDX"
                  Version="3.8.5-preview.2" />
```

### Step 2 — Update Content Pipeline

The new backends work with both the legacy MGCB pipeline and the new Content Builder (see [G72](./G72_content_builder_migration.md)). Shader compilation targets are handled automatically — the Content Builder detects the active backend and compiles effects accordingly.

### Step 3 — Test Rendering

Run your game and verify visual correctness. Key areas to check:

- **Shaders/Effects:** Custom `.fx` files may behave differently under Vulkan SPIR-V compilation vs. HLSL/GLSL. Test all shader permutations.
- **Render targets:** Verify render-to-texture workflows produce correct results.
- **Blend states and depth/stencil:** Backend-specific precision differences can surface in alpha blending and depth testing.
- **Fullscreen/windowed transitions:** New backends handle display mode switching differently.

## Vulkan Backend Details

### Requirements

- Vulkan 1.0-capable GPU (most GPUs from 2012+)
- Vulkan runtime installed (included with recent GPU drivers on Windows/Linux)
- macOS: MoltenVK translation layer (bundled with MonoGame Vulkan target)

### What Works

- SpriteBatch rendering
- 3D rendering with BasicEffect and custom effects
- Render targets and multi-render-target (MRT)
- Content pipeline shader compilation to SPIR-V
- GamePad, keyboard, mouse input (unchanged)
- Sound effects via FAudio

### Known Issues (Preview.2)

- **Screen tearing:** Single-frame tearing appears intermittently and is not reliably reproducible. Enabling VSync may mitigate but not eliminate the issue.
- **MediaPlayer:** Song playback via `MediaPlayer` is non-functional on VK/DX12 targets. `SoundEffect` and `SoundEffectInstance` work normally.
- **Dynamic audio:** `DynamicSoundEffectInstance` has reported issues under FAudio with new backends.

## DirectX 12 Backend Details

### Requirements

- Windows 10 version 1607+ (Anniversary Update)
- DirectX 12-capable GPU with WDDM 2.0 driver
- Feature Level 11_0 minimum

### Architecture Differences from DX11

The DX12 backend uses a fundamentally different rendering model:

- **Command lists and command queues** replace the immediate-context model of DX11. MonoGame abstracts this behind the same `GraphicsDevice` API, but internal resource management is more explicit.
- **Resource barriers** are managed internally. If you use `GetBackBufferData` or read from render targets, expect slightly different performance characteristics.
- **Descriptor heaps** are managed per-frame. Heavy shader resource binding may have different overhead patterns compared to DX11.

### What Changes for Game Code

For the vast majority of games: **nothing**. The `GraphicsDevice`, `SpriteBatch`, `Effect`, and content pipeline APIs remain identical. The differences are internal to the MonoGame framework.

Games that use low-level `GraphicsDevice` features should test:

- `SetRenderTarget` / `SetRenderTargets` — verify multi-target and depth buffer behavior
- `GetBackBufferData` — may have different latency due to DX12's async nature
- Custom `Effect` subclasses — verify parameter binding works correctly

## Multi-Backend Projects

You can maintain a single codebase that targets multiple backends using MSBuild conditions:

```xml
<PropertyGroup Condition="'$(MonoGamePlatform)' == 'DesktopVK'">
  <DefineConstants>$(DefineConstants);VULKAN</DefineConstants>
</PropertyGroup>

<PropertyGroup Condition="'$(MonoGamePlatform)' == 'DesktopDX'">
  <DefineConstants>$(DefineConstants);DX12</DefineConstants>
</PropertyGroup>
```

Then use preprocessor directives for backend-specific code paths (rare):

```csharp
#if VULKAN
    // Vulkan-specific workaround
#elif DX12
    // DX12-specific workaround
#else
    // Default GL/DX11 path
#endif
```

## Performance Considerations

The new backends are not guaranteed to be faster than OpenGL/DX11 for all workloads during preview:

- **Draw-call-heavy scenes** may see improvement from DX12's lower per-call overhead once the backend matures.
- **Vulkan on Linux** can outperform OpenGL for GPU-bound workloads, especially with compute shader usage (future MonoGame feature).
- **Simple 2D games** are unlikely to see meaningful differences between backends.

Profile with the tools from [G33 Profiling & Optimization](./G33_profiling_optimization.md) before assuming a backend switch will help.

## When to Use Which Backend

| Use Case | Recommended Backend |
|----------|-------------------|
| Shipping a game today | DesktopGL (broadest compatibility) |
| Windows-only with DX features | WindowsDX (DX11, stable) |
| Testing future readiness | DesktopVK or DesktopDX |
| Linux with modern GPU | DesktopVK (once stable) |
| macOS | DesktopGL (MoltenVK for VK is experimental) |

## Troubleshooting

**"GraphicsDevice could not be created"** — Verify your GPU supports the target API. Run `vulkaninfo` (Linux/Windows) or `dxdiag` (Windows) to check capability.

**Black screen on startup** — Ensure content was rebuilt for the new target. Delete `bin/` and `obj/` and rebuild.

**Shader compilation errors** — Custom `.fx` effects may use HLSL features that don't translate cleanly to SPIR-V. Check the MonoGame community forums for backend-specific shader compatibility notes.

**Audio not playing (songs)** — Known limitation: `MediaPlayer` doesn't work on VK/DX12. Use `SoundEffect` for critical audio, or keep a DesktopGL build for full audio support.
