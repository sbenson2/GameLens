# G98 — SpriteBatch Custom Shader Batching

> **Category:** guide · **Engine:** MonoGame · **Related:** [G2 Rendering & Graphics](./G2_rendering_and_graphics.md) · [G27 Shaders & Effects](./G27_shaders_and_effects.md) · [G33 Profiling & Optimization](./G33_profiling_optimization.md) · [G67 Object Pooling](./G67_object_pooling.md) · [G89 Post-Processing Pipeline](./G89_post_processing_pipeline.md) · [G96 Graphics State Management](./G96_graphics_state_management.md)

How to apply per-sprite shader parameters without breaking SpriteBatch batching. Covers the core limitation, workaround strategies (master effects, custom vertices, render-target compositing), and when to drop down to `DrawUserIndexedPrimitives`.

---

## The Problem: One Effect Per Batch

`SpriteBatch.Begin()` accepts a single `Effect`. Every `Draw()` call between `Begin`/`End` shares that effect — parameter changes between draws only take effect on the *last* value set, because the GPU executes the batch as one draw call.

```csharp
// ❌ BROKEN — only the last tint is applied to ALL sprites
spriteBatch.Begin(effect: myEffect);
myEffect.Parameters["Tint"].SetValue(Color.Red.ToVector4());
spriteBatch.Draw(spriteA, posA, Color.White);
myEffect.Parameters["Tint"].SetValue(Color.Blue.ToVector4());
spriteBatch.Draw(spriteB, posB, Color.White);
spriteBatch.End(); // Both sprites get Blue tint
```

This is not a bug — it is how batched rendering works. The SpriteBatch collects vertices, then flushes them all in one GPU draw call when `End()` is called (or when an internal flush is triggered by texture/state changes).

---

## Strategy 1: Multiple Begin/End Pairs (Simple, Low Count)

The simplest approach: start a new batch for each effect variation. Acceptable when you have a small number of distinct effect states per frame (< 10–15).

```csharp
foreach (var group in spritesByEffect)
{
    group.Effect.Parameters["Tint"].SetValue(group.Tint);
    spriteBatch.Begin(
        sortMode: SpriteSortMode.Deferred,
        effect: group.Effect
    );
    foreach (var sprite in group.Sprites)
        spriteBatch.Draw(sprite.Texture, sprite.Position, Color.White);
    spriteBatch.End();
}
```

**Cost:** Each `Begin`/`End` pair = one draw call + one state change. At 10–15 groups this is fine. At 200+ it becomes a bottleneck — the CPU cost of submitting draw calls dominates.

**When to use:** Few distinct effect states, straightforward code, no custom vertex format needed.

---

## Strategy 2: Master Effect with Branching (Medium Complexity)

Combine multiple visual effects into a single HLSL effect file. Use a per-vertex or per-sprite identifier to select the active sub-effect in the shader.

### Encoding Sub-Effect ID in Vertex Color

SpriteBatch passes `Color` per vertex. If you can spare the alpha channel (or pack data into unused bits), encode a sub-effect index:

```csharp
// CPU side — encode effect index in the alpha channel
byte effectIndex = 2; // e.g., 0=normal, 1=outline, 2=dissolve
var encoded = new Color(255, 255, 255, effectIndex);
spriteBatch.Draw(texture, position, encoded);
```

```hlsl
// master_effect.fx — pixel shader
float4 PS_Main(VSOutput input) : SV_Target
{
    float4 texColor = tex2D(TextureSampler, input.TexCoord);
    texColor *= input.Color; // standard SpriteBatch tint

    int effectId = (int)(input.Color.a * 255.0);

    if (effectId == 1)
        return ApplyOutline(texColor, input.TexCoord);
    else if (effectId == 2)
        return ApplyDissolve(texColor, input.TexCoord);

    return texColor; // default pass-through
}
```

**Trade-off:** You lose the alpha channel for transparency. This works for fully opaque sprites or when alpha is binary (visible/invisible).

### Encoding in Vertex Color Channels

For more data, pack values across RGB channels — e.g., R = effect index, G = intensity parameter, B = time offset. You lose SpriteBatch tinting but gain three floats of per-sprite data.

---

## Strategy 3: Custom Vertex Type with DrawUserIndexedPrimitives

For maximum flexibility, bypass SpriteBatch entirely and submit your own vertex data. This lets you attach arbitrary per-sprite data that the shader can read.

### Define a Custom Vertex

```csharp
[StructLayout(LayoutKind.Sequential)]
public struct SpriteVertex : IVertexType
{
    public Vector3 Position;
    public Color Color;
    public Vector2 TexCoord;
    public float EffectId;
    public float EffectParam;

    public static readonly VertexDeclaration Declaration = new(
        new VertexElement(0,  VertexElementFormat.Vector3, VertexElementUsage.Position, 0),
        new VertexElement(12, VertexElementFormat.Color, VertexElementUsage.Color, 0),
        new VertexElement(16, VertexElementFormat.Vector2, VertexElementUsage.TextureCoordinate, 0),
        new VertexElement(24, VertexElementFormat.Single, VertexElementUsage.TextureCoordinate, 1),
        new VertexElement(28, VertexElementFormat.Single, VertexElementUsage.TextureCoordinate, 2)
    );

    VertexDeclaration IVertexType.VertexDeclaration => Declaration;
}
```

### Build Quad Vertices Per Sprite

```csharp
// Each sprite = 4 vertices + 6 indices (two triangles)
private void AddSpriteQuad(
    SpriteVertex[] vertices, short[] indices, ref int vertIdx, ref int idxIdx,
    Texture2D texture, Vector2 pos, float effectId, float effectParam)
{
    int w = texture.Width, h = texture.Height;
    short baseVert = (short)vertIdx;

    vertices[vertIdx++] = new SpriteVertex
    {
        Position = new Vector3(pos.X, pos.Y, 0),
        Color = Color.White, TexCoord = Vector2.Zero,
        EffectId = effectId, EffectParam = effectParam
    };
    vertices[vertIdx++] = new SpriteVertex
    {
        Position = new Vector3(pos.X + w, pos.Y, 0),
        Color = Color.White, TexCoord = Vector2.UnitX,
        EffectId = effectId, EffectParam = effectParam
    };
    vertices[vertIdx++] = new SpriteVertex
    {
        Position = new Vector3(pos.X, pos.Y + h, 0),
        Color = Color.White, TexCoord = Vector2.UnitY,
        EffectId = effectId, EffectParam = effectParam
    };
    vertices[vertIdx++] = new SpriteVertex
    {
        Position = new Vector3(pos.X + w, pos.Y + h, 0),
        Color = Color.White, TexCoord = Vector2.One,
        EffectId = effectId, EffectParam = effectParam
    };

    indices[idxIdx++] = baseVert;
    indices[idxIdx++] = (short)(baseVert + 1);
    indices[idxIdx++] = (short)(baseVert + 2);
    indices[idxIdx++] = (short)(baseVert + 1);
    indices[idxIdx++] = (short)(baseVert + 3);
    indices[idxIdx++] = (short)(baseVert + 2);
}
```

### Draw Call

```csharp
masterEffect.Parameters["MatrixTransform"].SetValue(viewProjection);
masterEffect.Parameters["Time"].SetValue((float)gameTime.TotalGameTime.TotalSeconds);

foreach (var pass in masterEffect.CurrentTechnique.Passes)
{
    pass.Apply();
    GraphicsDevice.DrawUserIndexedPrimitives(
        PrimitiveType.TriangleList,
        vertices, 0, vertexCount,
        indices, 0, vertexCount / 4 * 2 // 2 triangles per quad
    );
}
```

**Cost:** You own sorting, texture atlas management, and vertex buffer construction — SpriteBatch normally handles all of this. Use this when you need more than 2–3 custom parameters per sprite.

---

## Strategy 4: Render-Target Compositing (Post-Process Per Layer)

Instead of per-sprite effects, group sprites onto separate render targets by effect type, then composite them with full-screen shader passes.

```
Frame Rendering:
  1. Draw normal sprites → RT_Main
  2. Draw glow sprites  → RT_Glow (no shader yet, just geometry)
  3. Full-screen bloom pass on RT_Glow → RT_GlowBlurred
  4. Composite: RT_Main + RT_GlowBlurred → Backbuffer
```

This scales well when "per-sprite" effects are really "per-layer" effects. See [G89 Post-Processing Pipeline](./G89_post_processing_pipeline.md) and [G95 Render Target Management](./G95_render_target_management.md) for render target setup details.

---

## Decision Matrix

| Scenario | Recommended Strategy |
|----------|---------------------|
| < 15 distinct effect states per frame | Strategy 1: Multiple Begin/End |
| Many sprites, few effect types, can sacrifice vertex color | Strategy 2: Master effect + encoded ID |
| Arbitrary per-sprite data (> 2 params) | Strategy 3: Custom vertex + DrawUserIndexedPrimitives |
| Effects apply uniformly to sprite layers | Strategy 4: Render-target compositing |
| Mixing approaches | Combine 1 + 4 (group by layer, few batches per layer) |

---

## Performance Notes

- **Texture atlas usage** is critical for all strategies. SpriteBatch flushes whenever the texture changes. Atlas your sprites to minimize flushes even within a single Begin/End pair.
- **Profile with `GraphicsDevice.Metrics`** — check `DrawCount`, `PrimitiveCount`, and `TextureCount` to quantify batching effectiveness.
- **Avoid per-frame allocations** in Strategy 3. Pre-allocate vertex and index arrays, reuse them each frame, and only grow when the sprite count exceeds capacity.
- On mobile (Android/iOS via MonoGame), draw call count matters more than desktop. Prefer Strategy 2 or 4 over Strategy 1 when targeting mobile.

---

## Further Reading

- [MonoGame SpriteBatch API Reference](https://docs.monogame.net/api/Microsoft.Xna.Framework.Graphics.SpriteBatch.html)
- [GitHub Issue #8295 — SpriteBatch With Custom Effects and Per-Sprite Data](https://github.com/MonoGame/MonoGame/issues/8295)
- [G27 Shaders & Effects](./G27_shaders_and_effects.md) — HLSL fundamentals for MonoGame
- [G96 Graphics State Management](./G96_graphics_state_management.md) — managing GPU state between draw calls
