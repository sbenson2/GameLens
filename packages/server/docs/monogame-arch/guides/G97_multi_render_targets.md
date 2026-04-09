# G97 — Multiple Render Targets (MRT) & Deferred Rendering

> **Category:** guide · **Engine:** MonoGame · **Related:** [G2 Rendering & Graphics](./G2_rendering_and_graphics.md) · [G27 Shaders & Effects](./G27_shaders_and_effects.md) · [G39 2D Lighting](./G39_2d_lighting.md) · [G84 Compute Shaders](./G84_compute_shaders.md) · [G89 Post-Processing Pipeline](./G89_post_processing_pipeline.md) · [G95 Render Target Management](./G95_render_target_management.md) · [G96 Graphics State Management](./G96_graphics_state_management.md)

How to render to multiple textures simultaneously using MonoGame's `SetRenderTargets()` (plural) API. Covers the MRT binding model, HLSL output semantics, practical G-buffer layouts for 2D and 3D deferred rendering, and the lighting pass that consumes the G-buffer.

---

## What Are Multiple Render Targets?

Standard rendering writes one color per pixel to a single render target. **Multiple Render Targets (MRT)** let a pixel shader write to 2–4 render targets in a single draw call. The GPU executes your geometry once, but the shader outputs multiple color values — each routed to a different texture.

```
                   ┌─ COLOR0 → Albedo   (diffuse color + alpha)
Geometry Draw ───→ │─ COLOR1 → Normals  (surface normal directions)
                   └─ COLOR2 → Depth    (linear depth values)
```

This is the foundation of **deferred rendering**: separate "what to draw" from "how to light it."

---

## MonoGame MRT API

### Binding Multiple Targets

Use `GraphicsDevice.SetRenderTargets()` (note the plural) to bind 2–4 targets simultaneously. All targets must have the same width, height, and multisample count.

```csharp
private RenderTarget2D _albedoTarget;   // COLOR0
private RenderTarget2D _normalTarget;   // COLOR1
private RenderTarget2D _depthTarget;    // COLOR2

protected override void LoadContent()
{
    int w = GraphicsDevice.PresentationParameters.BackBufferWidth;
    int h = GraphicsDevice.PresentationParameters.BackBufferHeight;

    // All targets must share dimensions and MSAA count
    _albedoTarget = new RenderTarget2D(GraphicsDevice, w, h,
        false, SurfaceFormat.Color, DepthFormat.Depth24Stencil8);

    _normalTarget = new RenderTarget2D(GraphicsDevice, w, h,
        false, SurfaceFormat.Color, DepthFormat.None);

    _depthTarget = new RenderTarget2D(GraphicsDevice, w, h,
        false, SurfaceFormat.Single, DepthFormat.None);
    // SurfaceFormat.Single = 32-bit float for linear depth
}

protected override void Draw(GameTime gameTime)
{
    // Bind all three targets at once
    GraphicsDevice.SetRenderTargets(_albedoTarget, _normalTarget, _depthTarget);
    GraphicsDevice.Clear(Color.Transparent);

    // Draw scene geometry with the G-buffer shader
    DrawSceneGeometry();

    // Unbind — restore single back buffer
    GraphicsDevice.SetRenderTargets(null);

    // Lighting pass reads the G-buffer textures
    DrawLightingPass();
}
```

> **Platform note:** MRT is supported on DirectX 10+ and OpenGL 3.0+ backends. The maximum target count depends on the GPU — most modern hardware supports at least 4 simultaneous targets. Check `GraphicsDevice.GraphicsProfile` if targeting older hardware.

### Binding with RenderTargetBinding

For more control, use `RenderTargetBinding` structs:

```csharp
GraphicsDevice.SetRenderTargets(
    new RenderTargetBinding(_albedoTarget),
    new RenderTargetBinding(_normalTarget),
    new RenderTargetBinding(_depthTarget));
```

---

## HLSL: Writing to Multiple Targets

The pixel shader outputs to multiple targets using **SV_Target** semantics (or `COLOR` semantics for SM 3.0).

### Output Structure

```hlsl
/// G-buffer output structure. Each field maps to one render target
/// based on the SV_Target index.
struct GBufferOutput
{
    float4 Albedo  : SV_Target0;  // → _albedoTarget
    float4 Normal  : SV_Target1;  // → _normalTarget
    float  Depth   : SV_Target2;  // → _depthTarget (Single format)
};
```

### G-Buffer Fill Shader

```hlsl
#if OPENGL
    #define VS_SHADERMODEL vs_3_0
    #define PS_SHADERMODEL ps_3_0
#else
    #define VS_SHADERMODEL vs_4_0
    #define PS_SHADERMODEL ps_4_0
#endif

// Uniforms
float4x4 WorldViewProjection;
float4x4 World;
float FarPlane;

Texture2D DiffuseTexture;
sampler2D DiffuseSampler = sampler_state
{
    Texture = <DiffuseTexture>;
    Filter = LINEAR;
};

Texture2D NormalMapTexture;
sampler2D NormalSampler = sampler_state
{
    Texture = <NormalMapTexture>;
    Filter = LINEAR;
};

struct VertexInput
{
    float4 Position : POSITION0;
    float2 TexCoord : TEXCOORD0;
    float3 Normal   : NORMAL0;
};

struct VertexOutput
{
    float4 Position   : SV_POSITION;
    float2 TexCoord   : TEXCOORD0;
    float3 WorldNormal: TEXCOORD1;
    float  ViewDepth  : TEXCOORD2;
};

VertexOutput VS(VertexInput input)
{
    VertexOutput output;
    output.Position = mul(input.Position, WorldViewProjection);
    output.TexCoord = input.TexCoord;

    // Transform normal to world space for lighting
    output.WorldNormal = normalize(mul(input.Normal, (float3x3)World));

    // Linear depth normalized to [0, 1] for the depth target
    output.ViewDepth = output.Position.z / FarPlane;

    return output;
}

/// Pixel shader writes to all three G-buffer targets simultaneously.
/// This runs once per pixel — the GPU routes each output to the
/// corresponding render target based on SV_Target index.
GBufferOutput PS(VertexOutput input)
{
    GBufferOutput output;

    // Albedo: diffuse texture color
    output.Albedo = tex2D(DiffuseSampler, input.TexCoord);

    // Normal: encode world-space normal into [0,1] range
    // Decode in lighting pass: normal = stored * 2 - 1
    output.Normal = float4(input.WorldNormal * 0.5 + 0.5, 1.0);

    // Depth: linear depth for light attenuation calculations
    output.Depth = input.ViewDepth;

    return output;
}

technique GBufferFill
{
    pass P0
    {
        VertexShader = compile VS_SHADERMODEL VS();
        PixelShader  = compile PS_SHADERMODEL PS();
    }
}
```

---

## 2D Deferred Lighting with MRT

MRT is not just for 3D. A popular 2D technique uses two targets — a color buffer and a normal buffer — to enable dynamic 2D lighting that responds to sprite normals.

### G-Buffer Layout (2D)

```
COLOR0: Albedo (RGBA)     — the sprite's diffuse color
COLOR1: Normal (RG)       — 2D normal map encoded as (nx*0.5+0.5, ny*0.5+0.5)
```

### 2D G-Buffer Fill

```hlsl
struct GBuffer2DOutput
{
    float4 Albedo : SV_Target0;
    float4 Normal : SV_Target1;
};

Texture2D SpriteTexture;
sampler2D SpriteSampler = sampler_state { Texture = <SpriteTexture>; };

Texture2D SpriteNormalMap;
sampler2D NormalSampler = sampler_state { Texture = <SpriteNormalMap>; };

GBuffer2DOutput PS_2DGBuffer(float4 position : SV_POSITION,
                              float4 color : COLOR0,
                              float2 uv : TEXCOORD0)
{
    GBuffer2DOutput output;

    float4 diffuse = tex2D(SpriteSampler, uv) * color;
    output.Albedo = diffuse;

    // Sample the sprite's normal map. If no normal map is
    // provided, use a default "facing camera" normal (0.5, 0.5, 1.0).
    float4 normalSample = tex2D(NormalSampler, uv);
    output.Normal = float4(normalSample.rgb, diffuse.a);

    return output;
}
```

### 2D Lighting Pass

After the G-buffer is filled, render each light as a screen-space quad (point light) or full-screen pass (ambient/directional).

```csharp
/// <summary>
/// Render a point light by drawing a screen-space quad covering
/// the light's radius. The shader reads the G-buffer to compute
/// lighting per pixel.
/// </summary>
private void DrawPointLight(Vector2 position, float radius,
    Color color, float intensity)
{
    _lightEffect.Parameters["LightPosition"].SetValue(position);
    _lightEffect.Parameters["LightRadius"].SetValue(radius);
    _lightEffect.Parameters["LightColor"].SetValue(color.ToVector3() * intensity);
    _lightEffect.Parameters["AlbedoMap"].SetValue(_albedoTarget);
    _lightEffect.Parameters["NormalMap"].SetValue(_normalTarget);
    _lightEffect.Parameters["ScreenSize"].SetValue(
        new Vector2(_albedoTarget.Width, _albedoTarget.Height));

    // Draw a quad covering the light's bounding rectangle
    var lightRect = new Rectangle(
        (int)(position.X - radius),
        (int)(position.Y - radius),
        (int)(radius * 2),
        (int)(radius * 2));

    _spriteBatch.Begin(
        blendState: BlendState.Additive, // lights accumulate
        effect: _lightEffect);
    _spriteBatch.Draw(_pixelTexture, lightRect, Color.White);
    _spriteBatch.End();
}
```

---

## Full Deferred Pipeline (Draw Order)

```
Frame Start
│
├── 1. G-Buffer Fill Pass
│   ├── SetRenderTargets(albedo, normal [, depth])
│   ├── Clear all targets
│   ├── Draw all scene geometry with G-buffer shader
│   └── SetRenderTargets(null)
│
├── 2. Lighting Accumulation Pass
│   ├── SetRenderTarget(lightAccumTarget)
│   ├── Clear to ambient color
│   ├── For each light:
│   │   ├── Bind G-buffer textures as shader inputs
│   │   └── Draw light volume with additive blending
│   └── SetRenderTarget(null)
│
├── 3. Composite Pass
│   ├── Draw to back buffer
│   ├── Combine: finalColor = albedo * lightAccum
│   └── (Optional: add emissive, post-processing)
│
└── Present()
```

---

## Performance Considerations

| Factor | Guidance |
|--------|----------|
| **Target count** | Each additional target increases memory bandwidth. 2 targets is ~2× bandwidth of 1. Keep to the minimum your lighting model needs. |
| **Surface format** | `SurfaceFormat.Color` (32-bit RGBA) is efficient. Use `HalfVector4` or `Single` only for targets that need HDR range (depth, emissive). |
| **Fill rate** | MRT does not increase vertex processing cost — geometry is processed once. The cost is entirely in pixel shader output and memory writes. |
| **Light count** | Each light is a draw call in the accumulation pass. For many lights, batch small lights into a single shader that loops over a light array. |
| **Overdraw** | Calculate screen-space bounding rectangles for lights and only draw quads covering the affected region — not full-screen passes for every light. |
| **Profile gate** | MRT requires at least `GraphicsProfile.HiDef`. Check and fall back to forward rendering on `Reach` profile devices. |

---

## Platform Compatibility

```csharp
/// <summary>
/// Check whether the current device supports the MRT count needed
/// for the deferred pipeline. Fall back to forward rendering if not.
/// </summary>
public static bool SupportsDeferredRendering(GraphicsDevice device)
{
    // HiDef profile guarantees at least 4 simultaneous render targets
    return device.GraphicsProfile >= GraphicsProfile.HiDef;
}
```

| Profile | Max Simultaneous Targets | Notes |
|---------|-------------------------|-------|
| `Reach` | 1 | No MRT — forward rendering only |
| `HiDef` | 4 | Full MRT support, required for deferred |

> **Fallback strategy:** Ship both a deferred and forward lighting path. Use MRT-based deferred on HiDef devices for dynamic light counts, and a simpler forward path (limited lights) on Reach.

---

## Debugging MRT

Visualize individual G-buffer targets by drawing them to screen quadrants during development:

```csharp
#if DEBUG
private void DrawGBufferDebug()
{
    int qw = GraphicsDevice.PresentationParameters.BackBufferWidth / 3;
    int qh = GraphicsDevice.PresentationParameters.BackBufferHeight / 3;

    _spriteBatch.Begin(samplerState: SamplerState.PointClamp);
    _spriteBatch.Draw(_albedoTarget, new Rectangle(0, 0, qw, qh), Color.White);
    _spriteBatch.Draw(_normalTarget, new Rectangle(qw, 0, qw, qh), Color.White);
    _spriteBatch.Draw(_depthTarget,  new Rectangle(qw * 2, 0, qw, qh), Color.White);
    _spriteBatch.End();
}
#endif
```

This immediately reveals issues like incorrect normal encoding, missing depth writes, or alpha bleed between targets.
