# G89 — Post-Processing Pipeline

> **Category:** guide · **Engine:** MonoGame · **Related:** [G2 Rendering & Graphics](./G2_rendering_and_graphics.md) · [G27 Shaders & Effects](./G27_shaders_and_effects.md) · [G33 Profiling & Optimization](./G33_profiling_optimization.md) · [G67 Object Pooling](./G67_object_pooling.md) · [G39 2D Lighting](./G39_2d_lighting.md)

How to build a composable post-processing stack in MonoGame using render target chains. Covers the architecture for a multi-pass pipeline, common 2D effects (bloom, blur, vignette, color grading, chromatic aberration), performance budgets, and integration with SpriteBatch rendering.

---

## The Problem: Bolting Effects Onto SpriteBatch

MonoGame's `SpriteBatch` draws directly to the back buffer by default. To apply full-screen effects you need to redirect rendering through intermediate `RenderTarget2D` textures, process them with pixel shaders, and composite the result. Without a structured pipeline this quickly becomes a tangled mess of render target swaps and one-off effect code.

---

## Architecture: Render Target Chain

The core pattern is a **ping-pong chain** — two (or more) render targets that alternate as source and destination:

```
Scene → [RenderTarget A] → Effect 1 → [RenderTarget B] → Effect 2 → [RenderTarget A] → … → Back Buffer
```

### Base Types

```csharp
/// <summary>
/// A single post-processing effect. Subclass this for each effect
/// (bloom, blur, vignette, etc.). Each effect reads from a source
/// texture and writes to the current render target.
/// </summary>
public abstract class PostProcessEffect : IDisposable
{
    public bool Enabled { get; set; } = true;

    /// <summary>
    /// Apply the effect. Source is the previous pass output.
    /// Draw to the currently bound render target using SpriteBatch + your Effect.
    /// </summary>
    public abstract void Apply(
        GraphicsDevice device,
        SpriteBatch spriteBatch,
        Texture2D source,
        GameTime gameTime);

    public virtual void Dispose() { }
}
```

### The Pipeline Manager

```csharp
public class PostProcessPipeline : IDisposable
{
    private readonly GraphicsDevice _device;
    private readonly SpriteBatch _spriteBatch;
    private readonly List<PostProcessEffect> _effects = new();

    // Ping-pong targets — created at the render resolution
    private RenderTarget2D _targetA;
    private RenderTarget2D _targetB;

    public PostProcessPipeline(GraphicsDevice device)
    {
        _device = device;
        _spriteBatch = new SpriteBatch(device);
        CreateTargets();
    }

    private void CreateTargets()
    {
        int w = _device.PresentationParameters.BackBufferWidth;
        int h = _device.PresentationParameters.BackBufferHeight;

        _targetA?.Dispose();
        _targetB?.Dispose();

        // SurfaceFormat.Color is fine for LDR; use HalfVector4 for HDR
        _targetA = new RenderTarget2D(_device, w, h, false,
            SurfaceFormat.Color, DepthFormat.None);
        _targetB = new RenderTarget2D(_device, w, h, false,
            SurfaceFormat.Color, DepthFormat.None);
    }

    public void Add(PostProcessEffect effect) => _effects.Add(effect);

    /// <summary>
    /// Call this BEFORE drawing your scene. Sets the render target
    /// so your scene draws into the pipeline's first target.
    /// </summary>
    public void BeginScene()
    {
        _device.SetRenderTarget(_targetA);
        _device.Clear(Color.Transparent);
    }

    /// <summary>
    /// Call this AFTER drawing your scene. Runs every enabled effect
    /// in order, then presents the final result to the back buffer.
    /// </summary>
    public void EndScene(GameTime gameTime)
    {
        var source = _targetA;
        var dest = _targetB;

        foreach (var effect in _effects)
        {
            if (!effect.Enabled) continue;

            _device.SetRenderTarget(dest);
            _device.Clear(Color.Transparent);

            effect.Apply(_device, _spriteBatch, source, gameTime);

            // Swap ping-pong targets
            (source, dest) = (dest, source);
        }

        // Final blit to back buffer
        _device.SetRenderTarget(null);
        _spriteBatch.Begin(SpriteSortMode.Immediate, BlendState.Opaque);
        _spriteBatch.Draw(source, _device.Viewport.Bounds, Color.White);
        _spriteBatch.End();
    }

    /// <summary>
    /// Call when the window is resized to recreate targets at the new resolution.
    /// </summary>
    public void HandleResize() => CreateTargets();

    public void Dispose()
    {
        _targetA?.Dispose();
        _targetB?.Dispose();
        foreach (var e in _effects) e.Dispose();
    }
}
```

---

## Common Effects

### Gaussian Blur

Efficient blur uses two passes — horizontal then vertical — to reduce the number of texture samples from O(n²) to O(2n).

```csharp
public class GaussianBlurEffect : PostProcessEffect
{
    private readonly Effect _blurEffect;
    private float _blurAmount = 2.0f;

    public float BlurAmount
    {
        get => _blurAmount;
        set => _blurAmount = MathHelper.Clamp(value, 0.5f, 10f);
    }

    public GaussianBlurEffect(Effect blurEffect)
    {
        _blurEffect = blurEffect;
    }

    public override void Apply(
        GraphicsDevice device, SpriteBatch spriteBatch,
        Texture2D source, GameTime gameTime)
    {
        // Horizontal pass
        _blurEffect.Parameters["Direction"].SetValue(new Vector2(1f / source.Width, 0));
        _blurEffect.Parameters["BlurAmount"].SetValue(_blurAmount);

        spriteBatch.Begin(SpriteSortMode.Immediate, BlendState.Opaque,
            effect: _blurEffect);
        spriteBatch.Draw(source, device.Viewport.Bounds, Color.White);
        spriteBatch.End();
    }
}
```

**HLSL kernel (Bloom.fx):**

```hlsl
// Gaussian blur pixel shader — separable horizontal/vertical pass.
// MonoGame compiles HLSL to platform-appropriate bytecode via the content pipeline.
sampler TextureSampler : register(s0);

float2 Direction;  // (1/width, 0) for horizontal, (0, 1/height) for vertical
float BlurAmount;

// 9-tap Gaussian weights (precomputed for sigma ≈ BlurAmount)
static const int SAMPLE_COUNT = 9;
static const float Offsets[SAMPLE_COUNT] = { -4, -3, -2, -1, 0, 1, 2, 3, 4 };
static const float Weights[SAMPLE_COUNT] = {
    0.0162, 0.0540, 0.1216, 0.1945, 0.2270,
    0.1945, 0.1216, 0.0540, 0.0162
};

float4 PS_Blur(float2 texCoord : TEXCOORD0) : COLOR0
{
    float4 color = 0;
    for (int i = 0; i < SAMPLE_COUNT; i++)
    {
        float2 offset = Direction * Offsets[i] * BlurAmount;
        color += tex2D(TextureSampler, texCoord + offset) * Weights[i];
    }
    return color;
}

technique Blur
{
    pass P0
    {
        PixelShader = compile ps_3_0 PS_Blur();
    }
}
```

### Bloom

Bloom extracts bright pixels, blurs them at progressively lower resolutions, then composites back. This requires **additional render targets** at half, quarter, and eighth resolution — manage them inside the effect, not the pipeline.

```csharp
public class BloomEffect : PostProcessEffect
{
    private readonly Effect _extractEffect;
    private readonly Effect _blurEffect;
    private readonly Effect _combineEffect;
    private RenderTarget2D _halfTarget;
    private RenderTarget2D _quarterTarget;

    public float Threshold { get; set; } = 0.8f;
    public float Intensity { get; set; } = 1.2f;

    public BloomEffect(
        Effect extractEffect, Effect blurEffect, Effect combineEffect,
        GraphicsDevice device)
    {
        _extractEffect = extractEffect;
        _blurEffect = blurEffect;
        _combineEffect = combineEffect;

        int w = device.PresentationParameters.BackBufferWidth;
        int h = device.PresentationParameters.BackBufferHeight;
        _halfTarget = new RenderTarget2D(device, w / 2, h / 2);
        _quarterTarget = new RenderTarget2D(device, w / 4, h / 4);
    }

    public override void Apply(
        GraphicsDevice device, SpriteBatch spriteBatch,
        Texture2D source, GameTime gameTime)
    {
        // 1. Extract bright pixels to half-res target
        device.SetRenderTarget(_halfTarget);
        _extractEffect.Parameters["Threshold"].SetValue(Threshold);
        spriteBatch.Begin(SpriteSortMode.Immediate, BlendState.Opaque,
            effect: _extractEffect);
        spriteBatch.Draw(source, _halfTarget.Bounds, Color.White);
        spriteBatch.End();

        // 2. Blur at quarter-res (horizontal then vertical — simplified here)
        device.SetRenderTarget(_quarterTarget);
        _blurEffect.Parameters["Direction"]
            .SetValue(new Vector2(1f / _quarterTarget.Width, 0));
        spriteBatch.Begin(SpriteSortMode.Immediate, BlendState.Opaque,
            effect: _blurEffect);
        spriteBatch.Draw(_halfTarget, _quarterTarget.Bounds, Color.White);
        spriteBatch.End();

        // 3. Combine original + blurred bloom back to the pipeline target
        // (pipeline has already set the correct render target for us)
        device.SetRenderTarget(null); // Pipeline will re-set this
        _combineEffect.Parameters["BloomTexture"].SetValue(
            (Texture2D)_quarterTarget);
        _combineEffect.Parameters["Intensity"].SetValue(Intensity);
        spriteBatch.Begin(SpriteSortMode.Immediate, BlendState.Opaque,
            effect: _combineEffect);
        spriteBatch.Draw(source, device.Viewport.Bounds, Color.White);
        spriteBatch.End();
    }

    public override void Dispose()
    {
        _halfTarget?.Dispose();
        _quarterTarget?.Dispose();
    }
}
```

### Vignette

A lightweight single-pass effect:

```hlsl
sampler TextureSampler : register(s0);
float Radius = 0.75;   // How far from center before darkening starts
float Softness = 0.45;  // Transition width

float4 PS_Vignette(float2 texCoord : TEXCOORD0) : COLOR0
{
    float4 color = tex2D(TextureSampler, texCoord);
    float dist = distance(texCoord, float2(0.5, 0.5));
    float vignette = smoothstep(Radius, Radius - Softness, dist);
    return color * vignette;
}
```

### Color Grading (LUT-based)

Use a 256×16 color lookup texture for cinematic color grading. Sample the LUT based on the pixel's original RGB values:

```hlsl
sampler TextureSampler : register(s0);
sampler LutSampler : register(s1);
float LutSize = 16.0; // Number of color slices

float4 PS_ColorGrade(float2 texCoord : TEXCOORD0) : COLOR0
{
    float4 color = tex2D(TextureSampler, texCoord);

    float blue = color.b * (LutSize - 1.0);
    float slice0 = floor(blue);
    float slice1 = min(slice0 + 1.0, LutSize - 1.0);
    float blend = blue - slice0;

    float2 uv0 = float2(
        (slice0 + color.r) / LutSize,
        color.g);
    float2 uv1 = float2(
        (slice1 + color.r) / LutSize,
        color.g);

    float4 graded = lerp(
        tex2D(LutSampler, uv0),
        tex2D(LutSampler, uv1),
        blend);
    graded.a = color.a;
    return graded;
}
```

---

## Integration with Game Loop

```csharp
public class Game1 : Game
{
    private PostProcessPipeline _postProcess;

    protected override void LoadContent()
    {
        _postProcess = new PostProcessPipeline(GraphicsDevice);
        _postProcess.Add(new BloomEffect(
            Content.Load<Effect>("Shaders/Extract"),
            Content.Load<Effect>("Shaders/Blur"),
            Content.Load<Effect>("Shaders/Combine"),
            GraphicsDevice));
        _postProcess.Add(new VignetteEffect(
            Content.Load<Effect>("Shaders/Vignette")));
    }

    protected override void Draw(GameTime gameTime)
    {
        // Scene renders into the pipeline's first render target
        _postProcess.BeginScene();

        _spriteBatch.Begin();
        // ... draw your game scene normally ...
        _spriteBatch.End();

        // Effects are applied in order, result goes to back buffer
        _postProcess.EndScene(gameTime);
    }
}
```

---

## Performance Considerations

| Concern | Guidance |
|---------|----------|
| **Render target count** | Each `RenderTarget2D` consumes GPU memory. Budget 2 full-res + 2–3 reduced-res targets for bloom. On mobile, keep to 1–2 effects. |
| **Resolution scaling** | Run expensive effects (blur, bloom) at half or quarter resolution. The quality loss is minimal for blur-based effects. |
| **Shader complexity** | Keep tap counts low. A 9-tap separable blur ≈ 18 samples per pixel per blur pass — acceptable for 1080p on integrated GPUs. |
| **Resize handling** | Hook `Window.ClientSizeChanged` to call `pipeline.HandleResize()`. Stale render targets will crash or render at the wrong size. |
| **HDR workflow** | Use `SurfaceFormat.HalfVector4` for render targets if you need values >1.0 for bloom extraction. Convert to LDR in the final combine pass (tone mapping). |
| **SpriteSortMode** | Always use `SpriteSortMode.Immediate` when drawing with a custom `Effect` in post-processing passes — other modes may batch draws and skip your shader. |

---

## Extending the Pipeline

The composable architecture makes it straightforward to add new effects:

- **Chromatic aberration** — offset R, G, B channels by different UV amounts
- **Screen shake** — offset the UV in the final blit (no shader needed, just adjust the destination rectangle)
- **CRT / scanline** — modulate brightness by `sin(texCoord.y * lineCount)`
- **Pixelate** — render to a small target, then upscale with `SamplerState.PointClamp`

Each is a `PostProcessEffect` subclass. The pipeline handles ordering and render target management.
