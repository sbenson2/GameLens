# G16 — SDL 3.4 GPU / 2D Renderer Interoperability

> **Category:** guide · **Engine:** FNA · **Related:** [G03 SDL3 GPU API](./G03_sdl3_gpu_api.md) · [G09 FNA3D → SDL GPU Migration](./G09_fna3d_sdl_gpu_migration.md) · [G15 Multi-Window Rendering](./G15_multi_window_rendering.md) · [G12 SDL GPU Deployment Lessons](./G12_sdl_gpu_deployment_lessons.md)

SDL 3.4 introduced new APIs that bridge the gap between SDL's modern 3D GPU API (`SDL_GPU`) and its 2D rendering system (`SDL_Renderer`). This means FNA games can now apply fragment shaders, custom render states, and GPU-backed effects to 2D sprite rendering without dropping down to the full 3D pipeline. This guide covers the new interop APIs, practical shader integration with 2D rendering, and patterns for combining 2D and 3D rendering in the same frame.

---

## Why GPU/2D Interop Matters for FNA

FNA games typically use `SpriteBatch` for 2D rendering, which maps to SDL's 2D renderer under the hood via FNA3D (or the newer SDL GPU backend). Before SDL 3.4, you had two choices:

1. **Pure 2D renderer** — simple, fast, but no custom shaders or GPU effects
2. **Full GPU API** — complete control, but you lose the convenience of `SDL_RenderTexture`, `SDL_RenderGeometry`, and other 2D primitives

SDL 3.4's interop APIs let you stay in the 2D renderer workflow while injecting fragment shaders and GPU render states. This is ideal for:

- Post-processing effects on 2D scenes (CRT filters, bloom, color grading)
- Per-sprite shader effects (dissolve, outline, water distortion)
- Combining UI rendered with the 2D API over a 3D GPU-rendered game world
- Transitioning a 2D game to use GPU features incrementally

---

## Core Interop APIs (SDL 3.4+)

SDL 3.4 added four functions that connect the GPU shader pipeline to the 2D renderer:

### SDL_CreateGPURenderState

Creates a render state object that bundles a fragment shader with sampler and blend configuration for use with the 2D renderer.

```c
// C API — FNA wraps this via P/Invoke
SDL_GPURenderState* SDL_CreateGPURenderState(
    SDL_Renderer* renderer,
    SDL_GPURenderStateCreateInfo* info
);
```

The `SDL_GPURenderStateCreateInfo` structure specifies:
- A compiled `SDL_GPUShader` (fragment shader only — the 2D renderer provides the vertex stage)
- Sampler descriptions for texture inputs
- Fragment shader resource bindings

### SDL_SetGPURenderState

Activates a render state for subsequent 2D draw calls. All `SDL_RenderTexture`, `SDL_RenderGeometry`, etc. calls after this will use the specified fragment shader.

```c
bool SDL_SetGPURenderState(
    SDL_Renderer* renderer,
    SDL_GPURenderState* state
);
```

Pass `NULL` to reset to the default (unshaded) 2D rendering.

### SDL_SetGPURenderStateFragmentUniforms

Uploads uniform data to the active render state's fragment shader. This is how you pass parameters like time, screen resolution, or effect intensity to your shader.

```c
bool SDL_SetGPURenderStateFragmentUniforms(
    SDL_Renderer* renderer,
    uint32_t slot,
    const void* data,
    uint32_t length
);
```

### SDL_DestroyGPURenderState

Frees a render state and its associated GPU resources.

```c
void SDL_DestroyGPURenderState(
    SDL_Renderer* renderer,
    SDL_GPURenderState* state
);
```

---

## FNA Integration Pattern

Since FNA's `SpriteBatch` ultimately calls into SDL's renderer, you can interleave GPU render state changes with sprite batch operations. The pattern in C# using FNA's SDL3 backend:

```csharp
using SDL3;
using Microsoft.Xna.Framework;
using Microsoft.Xna.Framework.Graphics;

public class ShaderEffect2D
{
    private IntPtr renderState;
    private IntPtr renderer;

    // Uniform data passed to the fragment shader
    [StructLayout(LayoutKind.Sequential)]
    struct CRTUniforms
    {
        public float Time;
        public float ScanlineIntensity;
        public float CurvatureAmount;
        public float Padding;  // Align to 16 bytes
    }

    public void Initialize(IntPtr sdlRenderer, IntPtr gpuDevice)
    {
        renderer = sdlRenderer;

        // Load a pre-compiled fragment shader
        // Shader must be compiled for all target backends:
        // SPIRV (Vulkan), DXIL (D3D12), MSL (Metal)
        var shaderCode = File.ReadAllBytes("Content/Shaders/crt_filter.spv");

        var shaderInfo = new SDL.SDL_GPUShaderCreateInfo
        {
            code = shaderCode,
            code_size = (uint)shaderCode.Length,
            entrypoint = "main",
            format = SDL.SDL_GPUShaderFormat.SDL_GPU_SHADERFORMAT_SPIRV,
            stage = SDL.SDL_GPUShaderStage.SDL_GPU_SHADERSTAGE_FRAGMENT,
            num_uniform_buffers = 1,
            num_samplers = 1
        };

        IntPtr shader = SDL.SDL_CreateGPUShader(gpuDevice, ref shaderInfo);

        // Create the render state binding this shader to the 2D renderer
        var stateInfo = new SDL.SDL_GPURenderStateCreateInfo
        {
            fragment_shader = shader,
            // Additional sampler and blend config as needed
        };

        renderState = SDL.SDL_CreateGPURenderState(renderer, ref stateInfo);

        // The shader object can be released after creating the state
        SDL.SDL_ReleaseGPUShader(gpuDevice, shader);
    }

    public void BeginEffect(float gameTime)
    {
        // Activate the shader for subsequent 2D draws
        SDL.SDL_SetGPURenderState(renderer, renderState);

        // Upload uniforms
        var uniforms = new CRTUniforms
        {
            Time = gameTime,
            ScanlineIntensity = 0.3f,
            CurvatureAmount = 0.02f,
            Padding = 0f
        };

        unsafe
        {
            SDL.SDL_SetGPURenderStateFragmentUniforms(
                renderer, 0, &uniforms, (uint)sizeof(CRTUniforms));
        }
    }

    public void EndEffect()
    {
        // Reset to default unshaded rendering
        SDL.SDL_SetGPURenderState(renderer, IntPtr.Zero);
    }

    public void Dispose()
    {
        if (renderState != IntPtr.Zero)
        {
            SDL.SDL_DestroyGPURenderState(renderer, renderState);
            renderState = IntPtr.Zero;
        }
    }
}
```

### Usage in a Game's Draw Loop

```csharp
protected override void Draw(GameTime gameTime)
{
    GraphicsDevice.Clear(Color.Black);

    // Draw the game world to a render target
    GraphicsDevice.SetRenderTarget(sceneTarget);
    spriteBatch.Begin(SpriteSortMode.Deferred, BlendState.AlphaBlend);
    DrawGameWorld(spriteBatch);
    spriteBatch.End();

    // Draw the render target to screen WITH the CRT shader
    GraphicsDevice.SetRenderTarget(null);
    crtEffect.BeginEffect((float)gameTime.TotalGameTime.TotalSeconds);
    spriteBatch.Begin(SpriteSortMode.Immediate, BlendState.Opaque);
    spriteBatch.Draw(sceneTarget, GraphicsDevice.Viewport.Bounds, Color.White);
    spriteBatch.End();
    crtEffect.EndEffect();

    // Draw UI without the shader (clean text)
    spriteBatch.Begin(SpriteSortMode.Deferred, BlendState.AlphaBlend);
    DrawUI(spriteBatch);
    spriteBatch.End();

    base.Draw(gameTime);
}
```

---

## Shader Compilation for Cross-Platform

The interop APIs require pre-compiled shaders for each backend. Use `SDL_shadercross` to compile HLSL source to all targets:

```bash
# Compile HLSL fragment shader to SPIRV, DXIL, and MSL
shadercross -i crt_filter.hlsl -o crt_filter.spv --stage fragment --format spirv
shadercross -i crt_filter.hlsl -o crt_filter.dxil --stage fragment --format dxil
shadercross -i crt_filter.hlsl -o crt_filter.msl --stage fragment --format msl
```

At runtime, detect which format the current GPU backend expects and load the matching binary. See [G07 Shader Compilation](./G07_shader_compilation_fxc.md) for the full cross-platform shader build pipeline.

---

## Additional SDL 3.4 GPU Features

Beyond the interop APIs, SDL 3.4 brings several features relevant to FNA developers:

### YUV Texture Support in GPU 2D Renderer

YUV textures and HDR color spaces are now supported in the GPU-backed 2D renderer. This is useful for video playback (cutscenes, splash screens) without converting to RGB on the CPU.

### GPU Device Property Queries

New APIs let you query device capabilities at runtime:

```c
// Check if the device supports a specific texture format
bool supported = SDL_GPUTextureSupportsFormat(
    gpuDevice,
    SDL_GPU_TEXTUREFORMAT_BC7_UNORM,
    SDL_GPU_TEXTURETYPE_2D,
    SDL_GPU_TEXTUREUSAGE_SAMPLER
);
```

This is valuable for feature detection — fall back to uncompressed textures on hardware that does not support BC7, or skip HDR rendering on SDR-only displays.

### Vulkan Feature Configuration

SDL 3.4 allows configuring Vulkan-specific features at device creation time, giving more control over which extensions and features are enabled. FNA games targeting Vulkan can opt into features like `multiDrawIndirect` or `shaderStorageImageMultisample` when available.

---

## When to Use Interop vs. Full GPU API

| Scenario | Recommended Approach |
|---|---|
| 2D game with a few post-process effects | GPU/2D Interop — keep SpriteBatch workflow |
| Per-sprite shader effects (outline, dissolve) | GPU/2D Interop with render state toggling |
| Full 3D scene with 2D HUD overlay | Full GPU API for 3D, Interop for HUD |
| Complex multi-pass rendering (deferred, SSAO) | Full GPU API — interop is single-pass only |
| Particle systems with compute shaders | Full GPU API — interop doesn't expose compute |
| Rapid prototyping / jam games | GPU/2D Interop — faster iteration |

---

## Performance Notes

- **Render state switches are not free** — each `SDL_SetGPURenderState` call may trigger a pipeline state change on the GPU. Batch draws by shader: render all sprites using shader A, then switch to shader B, then disable shaders for UI.
- **Uniform uploads are cheap** — `SDL_SetGPURenderStateFragmentUniforms` does a small memcpy. Update uniforms freely between draw calls.
- **The 2D renderer is already GPU-backed** — on SDL3, `SDL_Renderer` uses the GPU API internally. The interop APIs expose the shader stage of this existing GPU pipeline, not a separate path. There is no extra draw call overhead from using interop.
- **Shader compilation happens once** — the render state caches the compiled pipeline. Create states during load, not per-frame.

---

## Next Steps

- Start with a simple full-screen post-process (grayscale, vignette) to validate your shader compilation pipeline
- Move to per-sprite effects by toggling render states between `SpriteBatch.Begin/End` calls
- For compute shaders (particles, GPU-driven animation), use the full GPU API — see [G03 SDL3 GPU API](./G03_sdl3_gpu_api.md)
- Test on all target platforms — shader behavior can differ subtly between Vulkan, D3D12, and Metal
