# G104 — MSDF Font Rendering

> **Category:** guide · **Engine:** MonoGame · **Related:** [G27 Shaders & Visual Effects](./G27_shaders_and_effects.md) · [G8 Content Pipeline](./G8_content_pipeline.md) · [G2 Rendering & Graphics](./G2_rendering_and_graphics.md) · [G98 SpriteBatch Shader Batching](./G98_spritebatch_shader_batching.md) · [G5 UI Framework](./G5_ui_framework.md) · [G34 Localization](./G34_localization.md)

How to render **resolution-independent, crisp text** in MonoGame using Multi-Channel Signed Distance Field (MSDF) fonts. Covers atlas generation, HLSL shaders, SpriteBatch integration, and performance considerations. Replaces blurry scaled `SpriteFont` text with pixel-perfect results at any zoom level.

---

## Why MSDF Over SpriteFont?

MonoGame's built-in `SpriteFont` rasterizes glyphs at a fixed pixel size during content build. Scaling up produces blurry text; scaling down loses detail. This is a persistent problem for games that support multiple resolutions, dynamic UI scaling, or camera zoom.

**Signed Distance Field (SDF)** fonts store the distance from each pixel to the nearest glyph edge, rather than raw pixel data. A shader reconstructs crisp edges at any scale from this distance information.

**Multi-Channel SDF (MSDF)** extends this with three color channels (RGB), each encoding distance to different edge features. This preserves sharp corners that single-channel SDF rounds off — critical for characters like `W`, `M`, and CJK glyphs.

```
SpriteFont at 2× zoom:     MSDF at 2× zoom:
┌──────────────────┐        ┌──────────────────┐
│  ▓▓░░░▓▓         │        │  ██   ██         │
│  ▓▓░░▓▓▓         │        │  ██  ███         │
│  ▓▓▓▓▓▓▓  blurry │        │  ███████  crisp  │
│  ▓▓░░▓▓▓         │        │  ██  ███         │
│  ▓▓░░░▓▓         │        │  ██   ██         │
└──────────────────┘        └──────────────────┘
```

### When to Use MSDF

| Scenario | SpriteFont | MSDF |
|----------|-----------|------|
| Fixed-resolution pixel art UI | ✅ Fine | Overkill |
| Dynamic resolution / DPI scaling | ❌ Blurry | ✅ Perfect |
| Camera zoom (strategy, map views) | ❌ Blurry | ✅ Perfect |
| Large display text (titles, HUD) | ❌ Needs multiple sizes | ✅ One atlas |
| Small body text (<12px rendered) | ✅ Pre-hinted | ⚠️ Needs special shader |
| Localization with many glyphs | ❌ Huge atlas per size | ✅ One atlas all sizes |

---

## Atlas Generation

MSDF fonts require a pre-generated texture atlas where each glyph is rendered as distance field data. The standard tool is **msdf-atlas-gen** (by Chlumsky, the author of the MSDF technique).

### Installing msdf-atlas-gen

```bash
# Build from source (CMake required)
git clone https://github.com/Chlumsky/msdf-atlas-gen.git
cd msdf-atlas-gen
mkdir build && cd build
cmake .. -DCMAKE_BUILD_TYPE=Release
cmake --build . --config Release

# Or download pre-built binaries from GitHub Releases
```

### Generating an Atlas

```bash
# Generate MSDF atlas from a TTF/OTF font
msdf-atlas-gen \
  -font MyFont.ttf \
  -type msdf \
  -size 48 \
  -pxrange 4 \
  -charset charset.txt \
  -imageout MyFont_atlas.png \
  -json MyFont_atlas.json
```

**Key parameters:**

| Parameter | Description | Recommended |
|-----------|-------------|-------------|
| `-size` | Glyph EM size in atlas pixels | 32–64 (48 is a good default) |
| `-pxrange` | Distance field range in pixels | 4–8 (higher = smoother at extreme scales) |
| `-type` | `sdf`, `psdf`, `msdf`, or `mtsdf` | `msdf` for best quality |
| `-charset` | Text file with characters to include | ASCII + your locale glyphs |

### Atlas JSON Layout

The JSON output contains glyph metrics needed for text layout:

```json
{
  "atlas": {
    "type": "msdf",
    "size": 48,
    "width": 512,
    "height": 512,
    "distanceRange": 4,
    "yOrigin": "top"
  },
  "glyphs": [
    {
      "unicode": 65,
      "advance": 0.602,
      "planeBounds": { "left": 0.006, "bottom": -0.013, "right": 0.596, "top": 0.714 },
      "atlasBounds": { "left": 1.5, "bottom": 1.5, "right": 30.5, "top": 36.5 }
    }
  ],
  "kerning": [
    { "unicode1": 65, "unicode2": 86, "advance": -0.06 }
  ]
}
```

---

## Content Pipeline Integration

### Option A: Raw File Loading (No MGCB)

Load the atlas texture and JSON metadata directly at runtime — simplest approach and compatible with the new Content Builder Project (see [G100](./G100_385_content_builder_project.md)).

```csharp
public class MsdfFontData
{
    public Texture2D Atlas { get; private set; }
    public Dictionary<int, GlyphInfo> Glyphs { get; private set; }
    public Dictionary<(int, int), float> Kerning { get; private set; }
    public float DistanceRange { get; private set; }
    public float AtlasSize { get; private set; }

    public static MsdfFontData Load(GraphicsDevice device, string basePath)
    {
        var font = new MsdfFontData();

        // Load atlas texture (disable premultiply — distance data, not color)
        using var stream = File.OpenRead($"{basePath}_atlas.png");
        font.Atlas = Texture2D.FromStream(device, stream);

        // Parse JSON metadata
        var json = File.ReadAllText($"{basePath}_atlas.json");
        var doc = JsonDocument.Parse(json);
        var root = doc.RootElement;

        var atlasInfo = root.GetProperty("atlas");
        font.DistanceRange = atlasInfo.GetProperty("distanceRange").GetSingle();
        font.AtlasSize = atlasInfo.GetProperty("width").GetSingle();

        // Parse glyphs
        font.Glyphs = new Dictionary<int, GlyphInfo>();
        foreach (var g in root.GetProperty("glyphs").EnumerateArray())
        {
            var unicode = g.GetProperty("unicode").GetInt32();
            var info = new GlyphInfo
            {
                Unicode = unicode,
                Advance = g.GetProperty("advance").GetSingle()
            };

            if (g.TryGetProperty("planeBounds", out var pb))
            {
                info.PlaneBounds = new Vector4(
                    pb.GetProperty("left").GetSingle(),
                    pb.GetProperty("bottom").GetSingle(),
                    pb.GetProperty("right").GetSingle(),
                    pb.GetProperty("top").GetSingle());
            }

            if (g.TryGetProperty("atlasBounds", out var ab))
            {
                info.AtlasBounds = new Vector4(
                    ab.GetProperty("left").GetSingle(),
                    ab.GetProperty("bottom").GetSingle(),
                    ab.GetProperty("right").GetSingle(),
                    ab.GetProperty("top").GetSingle());
            }

            font.Glyphs[unicode] = info;
        }

        // Parse kerning pairs
        font.Kerning = new Dictionary<(int, int), float>();
        if (root.TryGetProperty("kerning", out var kerning))
        {
            foreach (var k in kerning.EnumerateArray())
            {
                var u1 = k.GetProperty("unicode1").GetInt32();
                var u2 = k.GetProperty("unicode2").GetInt32();
                var advance = k.GetProperty("advance").GetSingle();
                font.Kerning[(u1, u2)] = advance;
            }
        }

        return font;
    }
}

public struct GlyphInfo
{
    public int Unicode;
    public float Advance;
    public Vector4 PlaneBounds;  // left, bottom, right, top in EM units
    public Vector4 AtlasBounds;  // left, bottom, right, top in atlas pixels
}
```

### Option B: Custom Content Pipeline Processor

For projects still using MGCB, create a custom processor that imports the atlas + JSON as a single content asset. See [G8 Content Pipeline](./G8_content_pipeline.md) for the custom processor pattern.

---

## The MSDF Shader

The pixel shader reconstructs glyph edges from the three distance channels. The core operation is computing the **median** of R, G, B — this is the multi-channel magic that preserves sharp corners.

### MsdfFont.fx

```hlsl
#if OPENGL
    #define SV_POSITION POSITION
    #define VS_SHADERMODEL vs_3_0
    #define PS_SHADERMODEL ps_3_0
#else
    #define VS_SHADERMODEL vs_4_0_level_9_1
    #define PS_SHADERMODEL ps_4_0_level_9_1
#endif

// --- Parameters ---
Texture2D FontAtlas;
sampler2D FontAtlasSampler = sampler_state
{
    Texture = <FontAtlas>;
    MagFilter = Linear;
    MinFilter = Linear;
    MipFilter = Linear;
    AddressU = Clamp;
    AddressV = Clamp;
};

float PxRange;       // distanceRange from atlas JSON (e.g. 4.0)
float2 AtlasSize;    // width, height of atlas texture

struct VertexShaderOutput
{
    float4 Position : SV_POSITION;
    float4 Color : COLOR0;
    float2 TexCoord : TEXCOORD0;
};

// Median of three values — the core MSDF operation
float median(float r, float g, float b)
{
    return max(min(r, g), min(max(r, g), b));
}

// Standard MSDF shader — good for normal and large text
float4 MsdfPS(VertexShaderOutput input) : COLOR
{
    float3 msdf = tex2D(FontAtlasSampler, input.TexCoord).rgb;

    // Compute screen-space distance per pixel for resolution independence
    float2 unitRange = PxRange / AtlasSize;
    float2 screenTexSize = 1.0 / fwidth(input.TexCoord);
    float screenPxRange = max(0.5 * dot(unitRange, screenTexSize), 1.0);

    float sd = median(msdf.r, msdf.g, msdf.b);
    float screenPxDistance = screenPxRange * (sd - 0.5);
    float opacity = clamp(screenPxDistance + 0.5, 0.0, 1.0);

    return float4(input.Color.rgb, input.Color.a * opacity);
}

// Small-text optimized shader — reduces artifacts below ~14px
float4 MsdfSmallPS(VertexShaderOutput input) : COLOR
{
    float3 msdf = tex2D(FontAtlasSampler, input.TexCoord).rgb;

    float2 unitRange = PxRange / AtlasSize;
    float2 screenTexSize = 1.0 / fwidth(input.TexCoord);
    float screenPxRange = max(0.5 * dot(unitRange, screenTexSize), 1.0);

    float sd = median(msdf.r, msdf.g, msdf.b);
    float screenPxDistance = screenPxRange * (sd - 0.5);

    // Wider smoothing band for small text
    float alpha = smoothstep(-0.8, 0.8, screenPxDistance);

    return float4(input.Color.rgb, input.Color.a * alpha);
}

technique Standard
{
    pass P0
    {
        PixelShader = compile PS_SHADERMODEL MsdfPS();
    }
}

technique SmallText
{
    pass P0
    {
        PixelShader = compile PS_SHADERMODEL MsdfSmallPS();
    }
}
```

### Shader Notes

- **`fwidth()`** computes the rate of change of texture coordinates in screen space. This makes the edge threshold adapt automatically to whatever scale the text is rendered at.
- **`screenPxRange`** converts the atlas-space distance range to screen pixels. Without this, edge sharpness would vary with zoom level.
- **`median(r, g, b)`** merges the three channels into a single signed distance. Each channel encodes distance to a different edge segment, and the median reconstructs the true outline.
- Use the **SmallText** technique when rendering below ~14px to avoid notch artifacts at glyph corners.

---

## Text Layout & SpriteBatch Rendering

### MsdfTextRenderer

```csharp
public class MsdfTextRenderer
{
    private readonly MsdfFontData _font;
    private readonly Effect _effect;

    public MsdfTextRenderer(MsdfFontData font, Effect msdfEffect)
    {
        _font = font;
        _effect = msdfEffect;

        _effect.Parameters["PxRange"].SetValue(_font.DistanceRange);
        _effect.Parameters["AtlasSize"].SetValue(
            new Vector2(_font.AtlasSize, _font.AtlasSize));
    }

    /// <summary>
    /// Draw a string using SpriteBatch with the MSDF shader.
    /// </summary>
    /// <param name="spriteBatch">An active SpriteBatch (Begin already called).</param>
    /// <param name="text">The string to render.</param>
    /// <param name="position">Top-left position in screen coordinates.</param>
    /// <param name="fontSize">Desired font size in pixels.</param>
    /// <param name="color">Text color.</param>
    public void DrawString(
        SpriteBatch spriteBatch,
        string text,
        Vector2 position,
        float fontSize,
        Color color)
    {
        float scale = fontSize / _font.AtlasSize;
        float cursorX = 0f;
        int previousUnicode = -1;

        for (int i = 0; i < text.Length; i++)
        {
            int unicode = text[i];

            if (!_font.Glyphs.TryGetValue(unicode, out var glyph))
                continue;

            // Apply kerning
            if (previousUnicode >= 0 &&
                _font.Kerning.TryGetValue((previousUnicode, unicode), out float kern))
            {
                cursorX += kern * fontSize;
            }

            // Skip whitespace (no atlas region)
            if (glyph.AtlasBounds != Vector4.Zero)
            {
                // Atlas source rectangle (pixel coordinates in atlas)
                var atlasLeft   = glyph.AtlasBounds.X;
                var atlasBottom = glyph.AtlasBounds.Y;
                var atlasRight  = glyph.AtlasBounds.Z;
                var atlasTop    = glyph.AtlasBounds.W;
                var srcWidth    = atlasRight - atlasLeft;
                var srcHeight   = atlasTop - atlasBottom;

                var sourceRect = new Rectangle(
                    (int)atlasLeft,
                    (int)(_font.AtlasSize - atlasTop),   // flip Y if yOrigin=top
                    (int)srcWidth,
                    (int)srcHeight);

                // Destination position from plane bounds (EM-space)
                float destX = position.X + cursorX + glyph.PlaneBounds.X * fontSize;
                float destY = position.Y + (1f - glyph.PlaneBounds.W) * fontSize;
                float destW = (glyph.PlaneBounds.Z - glyph.PlaneBounds.X) * fontSize;
                float destH = (glyph.PlaneBounds.W - glyph.PlaneBounds.Y) * fontSize;

                var destRect = new Rectangle(
                    (int)destX, (int)destY,
                    (int)destW, (int)destH);

                spriteBatch.Draw(_font.Atlas, destRect, sourceRect, color);
            }

            cursorX += glyph.Advance * fontSize;
            previousUnicode = unicode;
        }
    }

    /// <summary>
    /// Measure the width of a string at a given font size.
    /// </summary>
    public float MeasureString(string text, float fontSize)
    {
        float width = 0f;
        int prevUnicode = -1;

        for (int i = 0; i < text.Length; i++)
        {
            int unicode = text[i];
            if (!_font.Glyphs.TryGetValue(unicode, out var glyph))
                continue;

            if (prevUnicode >= 0 &&
                _font.Kerning.TryGetValue((prevUnicode, unicode), out float kern))
            {
                width += kern * fontSize;
            }

            width += glyph.Advance * fontSize;
            prevUnicode = unicode;
        }

        return width;
    }
}
```

### Usage in Game

```csharp
public class MyGame : Game
{
    private SpriteBatch _spriteBatch;
    private MsdfFontData _fontData;
    private Effect _msdfEffect;
    private MsdfTextRenderer _textRenderer;

    protected override void LoadContent()
    {
        _spriteBatch = new SpriteBatch(GraphicsDevice);

        _fontData = MsdfFontData.Load(GraphicsDevice, "Content/Fonts/MyFont");
        _msdfEffect = Content.Load<Effect>("Shaders/MsdfFont");

        _textRenderer = new MsdfTextRenderer(_fontData, _msdfEffect);
    }

    protected override void Draw(GameTime gameTime)
    {
        GraphicsDevice.Clear(Color.CornflowerBlue);

        // Use the MSDF effect with SpriteBatch
        _spriteBatch.Begin(
            SpriteSortMode.Deferred,
            BlendState.NonPremultiplied,    // Important: MSDF needs non-premultiplied
            SamplerState.LinearClamp,
            null, null,
            _msdfEffect);

        // Same atlas, any size — all crisp
        _textRenderer.DrawString(_spriteBatch, "Game Title", new Vector2(100, 50), 72f, Color.White);
        _textRenderer.DrawString(_spriteBatch, "Score: 12345", new Vector2(100, 150), 24f, Color.Yellow);
        _textRenderer.DrawString(_spriteBatch, "Press Start", new Vector2(100, 200), 16f, Color.Gray);

        _spriteBatch.End();
    }
}
```

---

## Advanced Techniques

### Text Effects via Shader Parameters

Add outline, shadow, or glow effects by modifying the shader:

```hlsl
// --- Additional parameters for effects ---
float4 OutlineColor;
float OutlineWidth;   // 0.0 = no outline, 0.1–0.3 typical

float4 MsdfOutlinePS(VertexShaderOutput input) : COLOR
{
    float3 msdf = tex2D(FontAtlasSampler, input.TexCoord).rgb;

    float2 unitRange = PxRange / AtlasSize;
    float2 screenTexSize = 1.0 / fwidth(input.TexCoord);
    float screenPxRange = max(0.5 * dot(unitRange, screenTexSize), 1.0);

    float sd = median(msdf.r, msdf.g, msdf.b);
    float screenPxDistance = screenPxRange * (sd - 0.5);

    // Inner fill
    float fillAlpha = clamp(screenPxDistance + 0.5, 0.0, 1.0);

    // Outline band
    float outlineDistance = screenPxRange * (sd - 0.5 + OutlineWidth);
    float outlineAlpha = clamp(outlineDistance + 0.5, 0.0, 1.0);

    // Composite: outline color behind, fill color in front
    float4 fill = float4(input.Color.rgb, input.Color.a * fillAlpha);
    float4 outline = float4(OutlineColor.rgb, OutlineColor.a * outlineAlpha);

    return lerp(outline, fill, fillAlpha);
}
```

### Drop Shadow

Render the same text twice — first pass offset by a few pixels with a dark color, second pass at the normal position. This is cheaper than a shader-based shadow and works well with SpriteBatch sorting.

### Batching Multiple Fonts

Since MSDF rendering uses SpriteBatch, you can batch multiple font atlases in the same draw call if they share the same shader. Set the atlas texture per-glyph or use a texture atlas that combines multiple fonts (advanced — requires careful UV management).

---

## Performance Considerations

| Concern | Guidance |
|---------|----------|
| **Atlas size** | 512×512 covers ASCII + Latin Extended comfortably at size 48 |
| **Texture memory** | One MSDF atlas (~1 MB) replaces multiple SpriteFont textures |
| **Shader cost** | `fwidth()` and `median()` are trivial — no measurable GPU cost |
| **Draw calls** | One SpriteBatch.Begin/End per font atlas (same as SpriteFont) |
| **Small text** | Switch to `SmallText` technique below ~14px rendered size |
| **CJK/Unicode** | Large glyph sets need 1024×1024+ atlas — use `-charset` to include only needed ranges |

### When SpriteFont Is Still Better

- **Pixel-art games at 1:1 scale** — hand-hinted bitmap fonts look intentionally pixelated; MSDF's smooth edges would break the aesthetic.
- **Extremely small fixed text** — pre-rasterized at exact pixel size will always be sharper than any distance field at that size.

---

## Troubleshooting

| Issue | Cause | Fix |
|-------|-------|-----|
| Text is invisible | Wrong blend state | Use `BlendState.NonPremultiplied` |
| Glyph corners are rounded | Using SDF instead of MSDF | Regenerate atlas with `-type msdf` |
| Artifacts at small sizes | Standard shader at low px | Switch to `SmallText` technique |
| Text position is wrong | Y-axis flip mismatch | Check `yOrigin` in atlas JSON — flip accordingly |
| Fuzzy edges at large scale | `pxRange` too low | Regenerate with `-pxrange 6` or `8` |
| Missing glyphs | Not in charset | Add characters to `charset.txt` and regenerate |

---

## Community Libraries

Several community libraries provide ready-made MSDF integration for MonoGame:

- **BracketHouse.FontExtension** — content pipeline processor + renderer, minimal setup
- **MonoGame.MSDF-Font-Library** — direct font file import via content manager
- **roy-t/MSDF** — original MonoGame MSDF sample, content pipeline based

These are useful for quick integration. The manual approach in this guide gives full control over rendering, layout, and effects.

---

## Further Reading

- [G27 Shaders & Visual Effects](./G27_shaders_and_effects.md) — HLSL fundamentals for MonoGame
- [G98 SpriteBatch Shader Batching](./G98_spritebatch_shader_batching.md) — advanced batching with custom effects
- [G34 Localization](./G34_localization.md) — managing multi-language glyph sets
- [G5 UI Framework](./G5_ui_framework.md) — integrating MSDF text into your UI system
