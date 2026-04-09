# G102 — Screen-Space 2D Shader Techniques

> **Category:** guide · **Engine:** MonoGame · **Related:** [G27 Shaders & Visual Effects](./G27_shaders_and_effects.md) · [G89 Post-Processing Pipeline](./G89_post_processing_pipeline.md) · [G42 Screen Transitions](./G42_screen_transitions.md) · [G95 Render Target Management](./G95_render_target_management.md) · [G2 Rendering & Graphics](./G2_rendering_and_graphics.md)

Advanced 2D shader patterns that operate on the **full screen** rather than individual sprites. Covers dissolve transitions, screen wipes driven by gradient textures, CRT / retro post-effects, and vignette overlays — all using MonoGame's `SpriteBatch` + render-target workflow.

---

## Prerequisites

You should be comfortable with the basics covered in [G27](./G27_shaders_and_effects.md): loading `.fx` files through the content pipeline, writing a minimal pixel shader, and passing parameters from C#. This guide builds on that foundation with techniques that sample the **entire rendered frame** as a texture.

---

## The Screen-Space Pattern

All techniques in this guide follow the same C# pattern:

1. Render your game scene to a `RenderTarget2D` instead of the back buffer.
2. Switch to the back buffer and draw the render target as a full-screen quad through `SpriteBatch`.
3. Apply a custom `Effect` during that draw call.

```csharp
// Fields
private RenderTarget2D _sceneTarget;
private Effect _screenEffect;

protected override void LoadContent()
{
    _sceneTarget = new RenderTarget2D(
        GraphicsDevice,
        GraphicsDevice.PresentationParameters.BackBufferWidth,
        GraphicsDevice.PresentationParameters.BackBufferHeight);
    _screenEffect = Content.Load<Effect>("Effects/MyScreenEffect");
}

protected override void Draw(GameTime gameTime)
{
    // Pass 1 — render scene to off-screen target
    GraphicsDevice.SetRenderTarget(_sceneTarget);
    GraphicsDevice.Clear(Color.Black);
    _spriteBatch.Begin();
    DrawGameWorld(_spriteBatch);
    _spriteBatch.End();

    // Pass 2 — draw target to back buffer through effect
    GraphicsDevice.SetRenderTarget(null);
    _spriteBatch.Begin(
        SpriteSortMode.Immediate,     // required for custom effects
        BlendState.Opaque,
        SamplerState.PointClamp,      // keep pixel-art crisp
        effect: _screenEffect);
    _spriteBatch.Draw(_sceneTarget, Vector2.Zero, Color.White);
    _spriteBatch.End();
}
```

> **Important:** Use `SpriteSortMode.Immediate` when applying a custom effect. Deferred mode batches draws and may not apply the effect correctly to each draw call.

See [G95](./G95_render_target_management.md) for managing render targets across resolution changes and window resizing.

---

## Technique 1 — Texture-Driven Dissolve

A dissolve transition uses a **gradient texture** (grayscale image) to control which pixels disappear first. By animating a threshold value from 0 to 1, pixels whose gradient value falls below the threshold are discarded, creating organic dissolve patterns.

### The Gradient Texture

Any grayscale image works. Common patterns:

| Pattern | Effect |
|---------|--------|
| Perlin noise | Organic burn-away |
| Radial gradient | Circular iris wipe |
| Horizontal gradient | Left-to-right wipe |
| Diamond pattern | Diamond-shaped reveal |
| Voronoi cells | Shattered glass dissolve |

The gradient texture should be the same resolution as your render target, or tiled via sampler state.

### HLSL — Dissolve Shader

```hlsl
#if OPENGL
    #define SV_POSITION POSITION
    #define VS_SHADERMODEL vs_3_0
    #define PS_SHADERMODEL ps_3_0
#else
    #define VS_SHADERMODEL vs_4_0
    #define PS_SHADERMODEL ps_4_0
#endif

// The rendered scene
sampler2D SceneSampler : register(s0);

// The grayscale gradient texture driving the dissolve
texture2D DissolveMap;
sampler2D DissolveSampler = sampler_state
{
    Texture = <DissolveMap>;
    MinFilter = Linear;
    MagFilter = Linear;
    AddressU  = Clamp;
    AddressV  = Clamp;
};

// 0 = fully visible, 1 = fully dissolved
float Progress;

// Optional: width of the soft edge (0 = hard cut)
float EdgeWidth = 0.05;

// Optional: colour of the dissolve edge (e.g., fire glow)
float4 EdgeColor = float4(1.0, 0.5, 0.0, 1.0);

float4 MainPS(float2 texCoord : TEXCOORD0) : COLOR0
{
    float4 sceneColor = tex2D(SceneSampler, texCoord);
    float dissolveValue = tex2D(DissolveSampler, texCoord).r;

    // Hard discard — pixel is past the threshold
    if (dissolveValue < Progress - EdgeWidth)
        return float4(0, 0, 0, 0);

    // Soft edge band — blend toward edge colour
    if (dissolveValue < Progress)
    {
        float edgeFactor = 1.0 - (dissolveValue - (Progress - EdgeWidth))
                           / EdgeWidth;
        return lerp(sceneColor, EdgeColor, edgeFactor);
    }

    // Pixel is fully visible
    return sceneColor;
}

technique Dissolve
{
    pass P0
    {
        PixelShader = compile PS_SHADERMODEL MainPS();
    }
}
```

### C# — Driving the Dissolve

```csharp
private Texture2D _dissolveMap;
private float _dissolveProgress; // 0..1

protected override void LoadContent()
{
    _dissolveMap = Content.Load<Texture2D>("Textures/PerlinNoise");
    _screenEffect = Content.Load<Effect>("Effects/Dissolve");
}

protected override void Update(GameTime gameTime)
{
    if (_transitioning)
    {
        _dissolveProgress += (float)gameTime.ElapsedGameTime.TotalSeconds
                             / _transitionDuration;
        _dissolveProgress = MathHelper.Clamp(_dissolveProgress, 0f, 1f);
    }
}

protected override void Draw(GameTime gameTime)
{
    // ... render scene to _sceneTarget ...

    _screenEffect.Parameters["Progress"].SetValue(_dissolveProgress);
    _screenEffect.Parameters["DissolveMap"].SetValue(_dissolveMap);
    _screenEffect.Parameters["EdgeWidth"].SetValue(0.06f);
    _screenEffect.Parameters["EdgeColor"].SetValue(
        new Vector4(1f, 0.4f, 0.1f, 1f)); // orange glow

    GraphicsDevice.SetRenderTarget(null);
    _spriteBatch.Begin(SpriteSortMode.Immediate, BlendState.Opaque,
        effect: _screenEffect);
    _spriteBatch.Draw(_sceneTarget, Vector2.Zero, Color.White);
    _spriteBatch.End();
}
```

---

## Technique 2 — CRT / Retro Post-Effect

A scanline + curvature shader sells the retro look for pixel-art games. This combines three sub-effects in a single pass: barrel distortion, horizontal scanlines, and a subtle vignette.

### HLSL — CRT Shader

```hlsl
#if OPENGL
    #define SV_POSITION POSITION
    #define VS_SHADERMODEL vs_3_0
    #define PS_SHADERMODEL ps_3_0
#else
    #define VS_SHADERMODEL vs_4_0
    #define PS_SHADERMODEL ps_4_0
#endif

sampler2D SceneSampler : register(s0);

float2 ScreenSize;      // backbuffer dimensions in pixels
float Curvature = 0.03; // barrel distortion strength (0 = off)
float ScanlineIntensity = 0.15;
float VignetteStrength = 0.4;

float2 BarrelDistort(float2 uv)
{
    float2 centered = uv - 0.5;
    float r2 = dot(centered, centered);
    centered *= 1.0 + Curvature * r2;
    return centered + 0.5;
}

float4 MainPS(float2 texCoord : TEXCOORD0) : COLOR0
{
    float2 uv = BarrelDistort(texCoord);

    // Discard pixels outside the distorted area
    if (uv.x < 0 || uv.x > 1 || uv.y < 0 || uv.y > 1)
        return float4(0, 0, 0, 1);

    float4 color = tex2D(SceneSampler, uv);

    // Scanlines — darken every other row
    float scanline = sin(uv.y * ScreenSize.y * 3.14159) * 0.5 + 0.5;
    color.rgb *= 1.0 - ScanlineIntensity * (1.0 - scanline);

    // Vignette — darken edges
    float2 vignetteUV = uv - 0.5;
    float vignette = 1.0 - dot(vignetteUV, vignetteUV) * VignetteStrength;
    color.rgb *= saturate(vignette);

    return color;
}

technique CRT
{
    pass P0
    {
        PixelShader = compile PS_SHADERMODEL MainPS();
    }
}
```

### C# Integration

```csharp
_crtEffect.Parameters["ScreenSize"].SetValue(new Vector2(
    GraphicsDevice.PresentationParameters.BackBufferWidth,
    GraphicsDevice.PresentationParameters.BackBufferHeight));
_crtEffect.Parameters["Curvature"].SetValue(0.03f);
_crtEffect.Parameters["ScanlineIntensity"].SetValue(0.15f);
_crtEffect.Parameters["VignetteStrength"].SetValue(0.4f);
```

> **Performance note:** This shader is a single full-screen pass with only basic math — it runs well even on integrated GPUs. If you need heavier effects (chromatic aberration, phosphor glow), chain them as additional passes using the multi-target pattern in [G89](./G89_post_processing_pipeline.md).

---

## Technique 3 — Vignette with Colour Tinting

A standalone vignette is useful for focus effects, damage feedback (red tint), or underwater ambience (blue-green tint).

### HLSL — Vignette Shader

```hlsl
#if OPENGL
    #define SV_POSITION POSITION
    #define VS_SHADERMODEL vs_3_0
    #define PS_SHADERMODEL ps_3_0
#else
    #define VS_SHADERMODEL vs_4_0
    #define PS_SHADERMODEL ps_4_0
#endif

sampler2D SceneSampler : register(s0);

float Radius = 0.75;        // vignette radius (0..1)
float Softness = 0.45;      // transition softness
float4 TintColor = float4(0, 0, 0, 1); // black by default

float4 MainPS(float2 texCoord : TEXCOORD0) : COLOR0
{
    float4 color = tex2D(SceneSampler, texCoord);

    float2 centered = texCoord - 0.5;
    float dist = length(centered);

    // smoothstep creates a gradual falloff
    float vignette = smoothstep(Radius, Radius - Softness, dist);

    color.rgb = lerp(TintColor.rgb, color.rgb, vignette);
    return color;
}

technique Vignette
{
    pass P0
    {
        PixelShader = compile PS_SHADERMODEL MainPS();
    }
}
```

### Example — Damage Flash

```csharp
// In Update — pulse the vignette red when hit
if (_damageTimer > 0)
{
    _damageTimer -= (float)gameTime.ElapsedGameTime.TotalSeconds;
    float pulse = MathHelper.Clamp(_damageTimer / _damageDuration, 0f, 1f);

    _vignetteEffect.Parameters["Radius"].SetValue(
        MathHelper.Lerp(0.75f, 0.35f, pulse));
    _vignetteEffect.Parameters["TintColor"].SetValue(
        new Vector4(0.8f, 0.0f, 0.0f, 1f)); // red
}
else
{
    _vignetteEffect.Parameters["Radius"].SetValue(0.85f);
    _vignetteEffect.Parameters["TintColor"].SetValue(Vector4.Zero);
}
```

---

## Chaining Multiple Screen Effects

For games that need more than one screen-space effect simultaneously (e.g., CRT + dissolve), use a **ping-pong** render target approach:

```csharp
private RenderTarget2D _pingTarget;
private RenderTarget2D _pongTarget;

private void DrawScreenEffects(Effect[] effects)
{
    var source = _sceneTarget;

    for (int i = 0; i < effects.Length; i++)
    {
        bool isLast = (i == effects.Length - 1);
        var destination = isLast ? null : (source == _pingTarget
                          ? _pongTarget : _pingTarget);

        GraphicsDevice.SetRenderTarget(destination);
        _spriteBatch.Begin(SpriteSortMode.Immediate, BlendState.Opaque,
            SamplerState.PointClamp, effect: effects[i]);
        _spriteBatch.Draw((Texture2D)source, Vector2.Zero, Color.White);
        _spriteBatch.End();

        if (!isLast)
            source = destination;
    }
}
```

See [G95](./G95_render_target_management.md) for pooling and lifecycle management of these intermediate targets.

---

## Performance Considerations

| Concern | Guidance |
|---------|----------|
| **Render target count** | Each extra target costs VRAM equal to `width × height × 4 bytes`. On mobile, limit to 2–3 intermediate targets. |
| **Shader model** | All shaders in this guide use `ps_3_0` / `ps_4_0` — compatible with all MonoGame platforms including mobile. |
| **Texture sampling** | Every `tex2D` call has a cost. The dissolve shader samples twice per pixel (scene + gradient); the CRT shader samples once. Keep total samples per pixel under ~8 for mobile targets. |
| **Immediate mode** | `SpriteSortMode.Immediate` flushes the batch on every draw call. Group all non-effect sprites in a separate `Deferred` batch to avoid unnecessary flushes. |
| **Resolution** | Render your scene at a lower internal resolution and upscale with the screen effect for a performance boost. This pairs naturally with the CRT shader's intentional pixelation. |

---

## Content Pipeline Setup

Each `.fx` file needs a Content Pipeline entry. If using the `.mgcb` editor:

```
#begin Effects/Dissolve.fx
/importer:EffectImporter
/processor:EffectProcessor
/processorParam:DebugMode=Auto
/build:Effects/Dissolve.fx
```

If using the new Content Builder Project (3.8.5+), see [G100](./G100_385_content_builder_project.md) for the equivalent C# builder code.

---

## Where to Go Next

- **[G27 Shaders & Visual Effects](./G27_shaders_and_effects.md)** — per-sprite elemental effects (fire, water, ice)
- **[G89 Post-Processing Pipeline](./G89_post_processing_pipeline.md)** — multi-pass effect stacking architecture
- **[G42 Screen Transitions](./G42_screen_transitions.md)** — fade, slide, and wipe transitions between scenes
- **[G39 2D Lighting](./G39_2d_lighting.md)** — normal-mapped lighting system
- **[G95 Render Target Management](./G95_render_target_management.md)** — safe target pooling and lifecycle
