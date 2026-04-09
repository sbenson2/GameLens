# G115 — Custom HLSL Effect Pipeline (End-to-End)

> **Category:** guide · **Engine:** MonoGame · **Related:** [G27 Shaders & Visual Effects](./G27_shaders_and_effects.md) · [G102 Screen-Space 2D Shaders](./G102_screen_space_2d_shaders.md) · [G8 Content Pipeline](./G8_content_pipeline.md) · [G89 Post-Processing Pipeline](./G89_post_processing_pipeline.md) · [G95 Render Target Management](./G95_render_target_management.md) · [G96 Graphics State Management](./G96_graphics_state_management.md) · [G2 Rendering & Graphics](./G2_rendering_and_graphics.md)

Complete walkthrough for authoring, compiling, loading, and debugging **custom HLSL effects** in MonoGame. Covers the MGFX toolchain, cross-platform shader compilation (DirectX → OpenGL → Vulkan), parameter binding, multi-pass techniques, and common pitfalls. Builds on the shader template from [G27](./G27_shaders_and_effects.md) with deeper coverage of the compilation pipeline and advanced effect patterns.

---

## Table of Contents

1. [How MonoGame Compiles Shaders](#1-how-monogame-compiles-shaders)
2. [File Setup & Content Pipeline](#2-file-setup--content-pipeline)
3. [HLSL Effect Structure](#3-hlsl-effect-structure)
4. [Cross-Platform Compatibility](#4-cross-platform-compatibility)
5. [Parameter Binding in C#](#5-parameter-binding-in-c)
6. [Multi-Pass Techniques](#6-multi-pass-techniques)
7. [SpriteBatch Integration](#7-spritebatch-integration)
8. [3D Mesh Effects](#8-3d-mesh-effects)
9. [Compiling with MGFXC Directly](#9-compiling-with-mgfxc-directly)
10. [Debugging Shaders](#10-debugging-shaders)
11. [Common Pitfalls](#11-common-pitfalls)

---

## 1. How MonoGame Compiles Shaders

MonoGame uses **MGFX** — its own effect format and toolchain. The compilation flow:

```
  .fx (HLSL source)
       │
       ▼
  EffectImporter          ← Content Pipeline reads the .fx file
       │
       ▼
  EffectProcessor         ← Invokes MGFXC compiler
       │
       ├─► DirectX: compiles HLSL → DXBC bytecode (via fxc/dxc)
       ├─► OpenGL:  compiles HLSL → GLSL (via MojoShader translation)
       └─► Vulkan:  compiles HLSL → SPIR-V (via dxc → SPIR-V backend)
       │
       ▼
  .xnb (binary effect)   ← Loaded at runtime by ContentManager
```

Key points:
- **You always write HLSL.** MojoShader translates to GLSL at build time for OpenGL targets. You never write GLSL manually.
- **One .fx file → one .xnb per platform.** The content pipeline builds platform-specific binaries. Your C# code loads the same asset name regardless of platform.
- **Shader model limits matter.** MojoShader only supports up to `vs_3_0` / `ps_3_0` for OpenGL. DirectX targets can use `vs_4_0` and above. Vulkan uses `dxc` which supports SM 5.0+.

---

## 2. File Setup & Content Pipeline

### Adding an Effect to Content

Place your `.fx` file in the content directory and register it:

**MGCB Editor (3.8.4 and earlier):**
```
# Content.mgcb
/importer:EffectImporter
/processor:EffectProcessor
/build:Effects/MyEffect.fx
```

**Content Builder Project (3.8.5+):**
```xml
<!-- In your .mgcbproj -->
<ItemGroup>
  <Compile Include="Effects\MyEffect.fx" />
</ItemGroup>
```

The processor uses `EffectImporter` and `EffectProcessor` by default for `.fx` files — no special configuration needed.

### Directory Convention

```
Content/
├── Effects/
│   ├── PostProcess/
│   │   ├── Bloom.fx
│   │   └── ColorGrade.fx
│   ├── Sprites/
│   │   ├── Dissolve.fx
│   │   └── Outline.fx
│   └── Lighting/
│       └── DeferredLight.fx
```

---

## 3. HLSL Effect Structure

Every MonoGame effect has four structural layers:

### 1. Platform Defines

```hlsl
// WHY: MonoGame targets multiple graphics APIs. These defines let you
// write one shader that compiles correctly on DirectX, OpenGL, and Vulkan.
// The content pipeline sets OPENGL automatically for GL targets.

#if OPENGL
    #define SV_POSITION POSITION
    #define VS_SHADERMODEL vs_3_0
    #define PS_SHADERMODEL ps_3_0
#else
    #define VS_SHADERMODEL vs_4_0_level_9_1
    #define PS_SHADERMODEL ps_4_0_level_9_1
#endif
```

### 2. Parameters (Uniforms)

```hlsl
// WHY: Parameters are the bridge between C# and the GPU. Each one
// maps to an EffectParameter you set from game code every frame.

float Time;                    // elapsed seconds — for animation
float2 Resolution;             // screen size in pixels
float4x4 WorldViewProjection;  // combined transform matrix

Texture2D SpriteTexture;
sampler2D SpriteTextureSampler = sampler_state
{
    Texture = <SpriteTexture>;
    MagFilter = Point;          // pixel-art friendly
    MinFilter = Point;
    AddressU = Clamp;
    AddressV = Clamp;
};
```

### 3. Vertex & Pixel Shader Functions

```hlsl
struct VertexShaderOutput
{
    float4 Position : SV_POSITION;
    float4 Color    : COLOR0;
    float2 TexCoord : TEXCOORD0;
};

// WHY: For 2D SpriteBatch effects, the vertex shader is usually a
// pass-through. SpriteBatch sets up the vertices — your custom logic
// lives in the pixel shader.

VertexShaderOutput MainVS(
    float4 position : POSITION,
    float4 color    : COLOR0,
    float2 texCoord : TEXCOORD0)
{
    VertexShaderOutput output;
    output.Position = mul(position, WorldViewProjection);
    output.Color = color;
    output.TexCoord = texCoord;
    return output;
}

float4 MainPS(VertexShaderOutput input) : COLOR
{
    float4 texColor = tex2D(SpriteTextureSampler, input.TexCoord);
    return texColor * input.Color;
}
```

### 4. Technique Block

```hlsl
// WHY: Techniques group shader passes. MonoGame iterates passes
// in your C# draw code. Most 2D effects need a single technique
// with a single pass.

technique SpriteEffect
{
    pass P0
    {
        VertexShader = compile VS_SHADERMODEL MainVS();
        PixelShader  = compile PS_SHADERMODEL MainPS();
    }
};
```

---

## 4. Cross-Platform Compatibility

### Shader Model Constraints

| Target | Max Vertex | Max Pixel | Notes |
|--------|-----------|-----------|-------|
| DesktopGL (OpenGL) | `vs_3_0` | `ps_3_0` | MojoShader translation limit |
| DesktopDX (DirectX 11) | `vs_5_0` | `ps_5_0` | Full SM 5.0 |
| DesktopVK (Vulkan preview) | `vs_5_0` | `ps_5_0` | Compiled via `dxc` → SPIR-V |
| Android / iOS | `vs_3_0` | `ps_3_0` | OpenGL ES via MojoShader |

### Rules for Cross-Platform Shaders

1. **Target `vs_3_0` / `ps_3_0`** if you need OpenGL or mobile support.
2. **Avoid SM 4.0+ features** on cross-platform paths: geometry shaders, compute shaders, structured buffers, `SV_InstanceID`.
3. **Use the platform defines** from section 3 — they ensure correct semantics and shader model per target.
4. **Texture sampling:** Use `tex2D()` (SM 3.0 syntax), not `Texture.Sample()` (SM 4.0+ syntax) for cross-platform code.
5. **Integer arithmetic:** GLSL translated from SM 3.0 has limited integer support. Prefer `float` operations.

### Platform-Specific Code Paths

If you need SM 4.0+ features on DirectX while maintaining an OpenGL fallback:

```hlsl
#if OPENGL
    // SM 3.0 fallback — simpler approximation
    float4 MainPS(VertexShaderOutput input) : COLOR
    {
        return tex2D(SpriteTextureSampler, input.TexCoord);
    }
#else
    // SM 4.0+ path — can use Texture2D.Sample, loops, etc.
    float4 MainPS(VertexShaderOutput input) : COLOR
    {
        return SpriteTexture.Sample(SpriteTextureSampler, input.TexCoord);
    }
#endif
```

---

## 5. Parameter Binding in C#

### Loading and Caching Parameters

```csharp
// WHY: EffectParameter lookups by name are dictionary lookups.
// Cache them once at load time — never call Parameters["Name"]
// inside your draw loop.

public class DissolveEffect
{
    private readonly Effect _effect;
    private readonly EffectParameter _paramTime;
    private readonly EffectParameter _paramThreshold;
    private readonly EffectParameter _paramEdgeColor;
    private readonly EffectParameter _paramNoiseTexture;

    public DissolveEffect(ContentManager content)
    {
        _effect = content.Load<Effect>("Effects/Sprites/Dissolve");
        _paramTime         = _effect.Parameters["Time"];
        _paramThreshold    = _effect.Parameters["Threshold"];
        _paramEdgeColor    = _effect.Parameters["EdgeColor"];
        _paramNoiseTexture = _effect.Parameters["NoiseTexture"];
    }

    public void Apply(float time, float threshold, Color edgeColor,
                      Texture2D noiseTexture)
    {
        _paramTime.SetValue(time);
        _paramThreshold.SetValue(threshold);
        _paramEdgeColor.SetValue(edgeColor.ToVector4());
        _paramNoiseTexture.SetValue(noiseTexture);
    }

    public Effect Effect => _effect;
}
```

### Parameter Type Mapping

| HLSL Type | C# SetValue Type |
|-----------|-----------------|
| `float` | `float` |
| `float2` | `Vector2` |
| `float3` | `Vector3` |
| `float4` | `Vector4` or `Color.ToVector4()` |
| `float4x4` | `Matrix` |
| `int` | `int` |
| `bool` | `bool` |
| `Texture2D` | `Texture2D` |

---

## 6. Multi-Pass Techniques

Some effects need multiple rendering passes — for example, a Gaussian blur that separates horizontal and vertical passes.

### HLSL: Two-Pass Blur

```hlsl
float2 BlurDirection;   // (1,0) for horizontal, (0,1) for vertical
float BlurRadius;

float4 BlurPS(VertexShaderOutput input) : COLOR
{
    float4 color = float4(0, 0, 0, 0);
    float totalWeight = 0;

    for (int i = -4; i <= 4; i++)
    {
        float weight = exp(-0.5 * (i * i) / (BlurRadius * BlurRadius));
        float2 offset = BlurDirection * i / Resolution;
        color += tex2D(SpriteTextureSampler, input.TexCoord + offset) * weight;
        totalWeight += weight;
    }

    return color / totalWeight;
}

technique GaussianBlur
{
    pass Horizontal
    {
        VertexShader = compile VS_SHADERMODEL MainVS();
        PixelShader  = compile PS_SHADERMODEL BlurPS();
    }
    pass Vertical
    {
        VertexShader = compile VS_SHADERMODEL MainVS();
        PixelShader  = compile PS_SHADERMODEL BlurPS();
    }
};
```

### C#: Applying Multi-Pass

```csharp
// WHY: Each pass in a technique is applied separately. For a
// separable blur, pass 1 renders to a temporary RT, pass 2
// reads that RT and writes to the final target.

public void DrawBlur(SpriteBatch spriteBatch, Texture2D source,
                     RenderTarget2D tempRT, RenderTarget2D output)
{
    var effect = _blurEffect;
    var passes = effect.CurrentTechnique.Passes;

    // Pass 0: Horizontal blur → tempRT
    GraphicsDevice.SetRenderTarget(tempRT);
    effect.Parameters["BlurDirection"].SetValue(new Vector2(1, 0));
    spriteBatch.Begin(effect: effect);
    passes[0].Apply();
    spriteBatch.Draw(source, Vector2.Zero, Color.White);
    spriteBatch.End();

    // Pass 1: Vertical blur → output
    GraphicsDevice.SetRenderTarget(output);
    effect.Parameters["BlurDirection"].SetValue(new Vector2(0, 1));
    spriteBatch.Begin(effect: effect);
    passes[1].Apply();
    spriteBatch.Draw(tempRT, Vector2.Zero, Color.White);
    spriteBatch.End();

    GraphicsDevice.SetRenderTarget(null);
}
```

---

## 7. SpriteBatch Integration

`SpriteBatch.Begin()` accepts an `Effect` parameter. When provided, SpriteBatch applies the effect to all sprites drawn in that batch.

```csharp
// WHY: SpriteBatch manages its own vertex buffer and handles
// the WorldViewProjection matrix internally via MatrixTransform.
// Your effect's vertex shader must accept the same vertex format
// that SpriteBatch emits (Position, Color, TexCoord).

_dissolveEffect.Apply(time, threshold, Color.OrangeRed, _noiseTexture);

spriteBatch.Begin(
    sortMode: SpriteSortMode.Deferred,
    blendState: BlendState.AlphaBlend,
    samplerState: SamplerState.PointClamp,
    effect: _dissolveEffect.Effect
);

spriteBatch.Draw(_spriteTexture, _position, Color.White);

spriteBatch.End();
```

### SpriteBatch Vertex Format

SpriteBatch emits vertices with this layout — your vertex shader input **must** match:

```hlsl
// SpriteBatch vertex input (VertexPositionColorTexture)
float4 position : POSITION;     // pre-transformed screen coords
float4 color    : COLOR0;       // sprite tint
float2 texCoord : TEXCOORD0;    // UV coordinates
```

### MatrixTransform

SpriteBatch sets an internal `MatrixTransform` parameter on your effect if the parameter exists. This is the orthographic projection matrix. If your vertex shader uses a custom matrix name (like `WorldViewProjection`), you need to set it yourself:

```csharp
// For custom matrix names, compute the SpriteBatch-equivalent matrix:
Matrix projection = Matrix.CreateOrthographicOffCenter(
    0, GraphicsDevice.Viewport.Width,
    GraphicsDevice.Viewport.Height, 0,
    0, 1);
_effect.Parameters["WorldViewProjection"].SetValue(projection);
```

---

## 8. 3D Mesh Effects

For 3D rendering (not SpriteBatch), you manage the full vertex pipeline:

```csharp
// WHY: Unlike SpriteBatch, 3D mesh rendering requires you to set
// all transform matrices and call Apply() on each pass manually.

foreach (var mesh in _model.Meshes)
{
    foreach (var part in mesh.MeshParts)
    {
        part.Effect = _customEffect;

        _customEffect.Parameters["World"].SetValue(
            mesh.ParentBone.Transform * _worldMatrix);
        _customEffect.Parameters["View"].SetValue(_camera.View);
        _customEffect.Parameters["Projection"].SetValue(_camera.Projection);

        foreach (var pass in _customEffect.CurrentTechnique.Passes)
        {
            pass.Apply();
            GraphicsDevice.SetVertexBuffer(part.VertexBuffer);
            GraphicsDevice.Indices = part.IndexBuffer;
            GraphicsDevice.DrawIndexedPrimitives(
                PrimitiveType.TriangleList,
                part.VertexOffset, part.StartIndex, part.PrimitiveCount);
        }
    }
}
```

---

## 9. Compiling with MGFXC Directly

For advanced workflows (CI pipelines, shader-only iteration), you can invoke the MGFX compiler outside the content pipeline:

```bash
# Install MGFXC (ships with MonoGame SDK)
dotnet tool install -g dotnet-mgfxc

# Compile for DirectX
mgfxc MyEffect.fx MyEffect_dx.mgfx /Profile:DirectX_11

# Compile for OpenGL
mgfxc MyEffect.fx MyEffect_gl.mgfx /Profile:OpenGL

# Compile for Vulkan (3.8.5+)
mgfxc MyEffect.fx MyEffect_vk.mgfx /Profile:Vulkan
```

### Loading Pre-Compiled Effects

```csharp
// WHY: Useful for hot-reload workflows or when effects are
// distributed as pre-compiled binaries outside the content pipeline.

using var stream = File.OpenRead("MyEffect_dx.mgfx");
using var reader = new BinaryReader(stream);
var effect = new Effect(GraphicsDevice, reader.ReadBytes((int)stream.Length));
```

### MGFXC in CI (3.8.5+)

The new C Header output feature in MGFXC (`/CHeader` flag) generates a `.h` file with the compiled bytecode as a C array — useful for native engine integrations:

```bash
mgfxc MyEffect.fx MyEffect.mgfx /Profile:DirectX_11 /CHeader:MyEffect.h
```

---

## 10. Debugging Shaders

### Visual Studio Graphics Debugger

1. Set your project to use the **DirectX** backend (DesktopDX).
2. Launch with **Graphics Diagnostics** (Alt+F5 in VS).
3. Capture a frame and inspect pixel shader inputs/outputs.

### RenderDoc (OpenGL / Vulkan)

1. Launch your game through RenderDoc.
2. Capture a frame (F12 by default).
3. Inspect draw calls, shader inputs, textures, and render targets.
4. Works with both DesktopGL and DesktopVK backends.

### Printf Debugging

Encode debug values into the pixel output:

```hlsl
// WHY: GPUs don't have printf. Encoding a value as a color
// lets you visually verify what the shader is computing.

float4 DebugPS(VertexShaderOutput input) : COLOR
{
    float value = /* the thing you want to inspect */;
    // Visualise as grayscale — black = 0, white = 1
    return float4(value, value, value, 1);
}
```

### Common Compile Errors

| Error | Cause | Fix |
|-------|-------|-----|
| `X3004: undeclared identifier 'SV_POSITION'` | Missing platform defines | Add the `#if OPENGL` block from section 3 |
| `error X4502: invalid vs/ps profile` | Wrong shader model for target | Use the `VS_SHADERMODEL`/`PS_SHADERMODEL` defines |
| `No technique/pass` | Missing or misnamed technique block | Ensure the technique block is at the end of the file |
| Black screen, no errors | Parameters not set in C# | Check that all texture and matrix parameters are bound before drawing |

---

## 11. Common Pitfalls

1. **Forgetting to set `SamplerState` in `SpriteBatch.Begin()`** — If your shader uses `Point` filtering but SpriteBatch defaults to `LinearClamp`, the GPU's sampler state wins over the shader's declared state on some platforms. Always pass the desired `SamplerState` to `Begin()`.

2. **Using `Texture.Sample()` on OpenGL targets** — This is SM 4.0+ syntax. Use `tex2D()` for cross-platform compatibility, or gate with `#if OPENGL`.

3. **Not handling premultiplied alpha** — MonoGame's content pipeline premultiplies alpha by default. If your shader manipulates alpha, account for this or disable premultiplication in the content pipeline settings.

4. **Editing `.fx` without rebuilding content** — Shader changes require a content rebuild. The `.xnb` is a compiled binary. Use MGFXC directly (section 9) for faster iteration.

5. **Parameter name mismatch** — `Parameters["Tiem"]` returns `null` silently. Always validate parameter names at load time (check for `null` in the constructor).

6. **Exceeding SM 3.0 instruction limits on GL** — Shader Model 3.0 limits you to 512 ALU instructions in the pixel shader. Complex effects may need to be split across multiple passes.

7. **Matrix row/column order** — MonoGame uses **row-major** matrices in C# but HLSL defaults to column-major. MonoGame's `Effect` class handles the transpose automatically when you call `SetValue(Matrix)`. Do **not** transpose manually.
