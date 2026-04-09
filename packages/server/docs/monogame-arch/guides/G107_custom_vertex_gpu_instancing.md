# G107 — Custom Vertex Types & GPU Instancing

> **Category:** guide · **Engine:** MonoGame · **Related:** [G2 Rendering & Graphics](./G2_rendering_and_graphics.md) · [G98 SpriteBatch Shader Batching](./G98_spritebatch_shader_batching.md) · [G96 Graphics State Management](./G96_graphics_state_management.md) · [G33 Profiling & Optimization](./G33_profiling_optimization.md) · [G27 Shaders & Effects](./G27_shaders_and_effects.md) · [G84 Compute Shaders](./G84_compute_shaders.md)

How to define custom vertex structures with `IVertexType`, build vertex/index buffers, and render thousands of objects efficiently using **hardware instancing** via `DrawInstancedPrimitives`. Covers vertex declaration layout, instance data buffers, matching HLSL semantics, and practical patterns for bullet-hell sprites, foliage, and particle rendering.

---

## Why Custom Vertices?

MonoGame ships several built-in vertex types (`VertexPositionColor`, `VertexPositionTexture`, `VertexPositionColorTexture`, `VertexPositionNormalTexture`). These cover basic cases, but real games frequently need:

- **Extra per-vertex data** — glow intensity, sprite index, animation frame, wind sway factor.
- **Leaner vertices** — dropping unused channels saves GPU bandwidth. A 2D game rarely needs normals.
- **Instancing data** — a separate vertex stream carrying per-instance transforms, tints, or atlas coordinates.

Custom vertex types are the mechanism for all three.

---

## Defining a Custom Vertex Type

Implement `IVertexType` on a `struct`. The struct must also expose a `static readonly VertexDeclaration` that describes the byte layout.

### Example: 2D Sprite Vertex with Tint + Atlas Index

```csharp
using Microsoft.Xna.Framework;
using Microsoft.Xna.Framework.Graphics;
using System.Runtime.InteropServices;

[StructLayout(LayoutKind.Sequential)]
public struct SpriteVertex : IVertexType
{
    public Vector2 Position;       // 8 bytes  (offset 0)
    public Vector2 TexCoord;       // 8 bytes  (offset 8)
    public Color   Tint;           // 4 bytes  (offset 16)
    public float   AtlasIndex;     // 4 bytes  (offset 20)

    public static readonly VertexDeclaration Declaration = new VertexDeclaration(
        new VertexElement( 0, VertexElementFormat.Vector2, VertexElementUsage.Position, 0),
        new VertexElement( 8, VertexElementFormat.Vector2, VertexElementUsage.TextureCoordinate, 0),
        new VertexElement(16, VertexElementFormat.Color,   VertexElementUsage.Color, 0),
        new VertexElement(20, VertexElementFormat.Single,  VertexElementUsage.TextureCoordinate, 1)
    );

    VertexDeclaration IVertexType.VertexDeclaration => Declaration;

    public SpriteVertex(Vector2 position, Vector2 texCoord, Color tint, float atlasIndex)
    {
        Position   = position;
        TexCoord   = texCoord;
        Tint       = tint;
        AtlasIndex = atlasIndex;
    }
}
```

### VertexElement Rules

| Parameter | Meaning |
|-----------|---------|
| **Offset** | Byte offset from the start of the struct. Must match actual field layout. |
| **Format** | `VertexElementFormat` enum — `Single`, `Vector2`, `Vector3`, `Vector4`, `Color`, `HalfVector2`, `HalfVector4`, etc. |
| **Usage** | `VertexElementUsage` enum — `Position`, `Normal`, `TextureCoordinate`, `Color`, `BlendWeight`, `BlendIndices`, etc. |
| **UsageIndex** | Differentiates multiple elements with the same usage. `TextureCoordinate` index 0, 1, 2 → `TEXCOORD0`, `TEXCOORD1`, `TEXCOORD2` in HLSL. |

> **Critical:** The byte offsets must be **exact**. A `Vector3` is 12 bytes, `Vector2` is 8 bytes, `Color` is 4 bytes, `Single` is 4 bytes. If the offsets are wrong, you get garbled vertices or a runtime crash.

### Matching HLSL Input

The HLSL vertex shader input struct must match the declaration's usage semantics:

```hlsl
struct VSInput
{
    float2 Position  : POSITION0;
    float2 TexCoord  : TEXCOORD0;
    float4 Tint      : COLOR0;
    float  AtlasIdx  : TEXCOORD1;
};
```

---

## Building and Drawing with Vertex Buffers

### Static Geometry

```csharp
// One-time setup
var vertices = new SpriteVertex[4]
{
    new SpriteVertex(new Vector2(0, 0),   new Vector2(0, 0), Color.White, 0),
    new SpriteVertex(new Vector2(64, 0),  new Vector2(1, 0), Color.White, 0),
    new SpriteVertex(new Vector2(64, 64), new Vector2(1, 1), Color.White, 0),
    new SpriteVertex(new Vector2(0, 64),  new Vector2(0, 1), Color.White, 0),
};

var indices = new short[] { 0, 1, 2, 0, 2, 3 };

_vertexBuffer = new VertexBuffer(
    GraphicsDevice, SpriteVertex.Declaration,
    vertices.Length, BufferUsage.WriteOnly);
_vertexBuffer.SetData(vertices);

_indexBuffer = new IndexBuffer(
    GraphicsDevice, IndexElementSize.SixteenBit,
    indices.Length, BufferUsage.WriteOnly);
_indexBuffer.SetData(indices);
```

### Drawing

```csharp
GraphicsDevice.SetVertexBuffer(_vertexBuffer);
GraphicsDevice.Indices = _indexBuffer;

foreach (EffectPass pass in _effect.CurrentTechnique.Passes)
{
    pass.Apply();
    GraphicsDevice.DrawIndexedPrimitives(
        PrimitiveType.TriangleList,
        baseVertex: 0,
        startIndex: 0,
        primitiveCount: 2);  // 2 triangles = 1 quad
}
```

### Dynamic Geometry (Per-Frame Updates)

For vertices that change every frame (e.g., a custom particle renderer), use `DynamicVertexBuffer`:

```csharp
_dynamicVB = new DynamicVertexBuffer(
    GraphicsDevice, SpriteVertex.Declaration,
    MaxParticles * 4, BufferUsage.WriteOnly);

// Each frame:
_dynamicVB.SetData(particleVertices, 0, activeCount * 4,
    SetDataOptions.Discard);  // Discard tells the driver to orphan the old buffer
```

> **Performance:** Always use `SetDataOptions.Discard` on dynamic buffers when replacing the entire contents. This avoids GPU stalls by letting the driver allocate a fresh backing buffer.

---

## Hardware Instancing

Hardware instancing draws the same mesh many times in a single draw call, with per-instance data (position, tint, scale, atlas UV) supplied via a second vertex buffer. This is the standard technique for:

- Bullet-hell projectiles (thousands of identical sprites)
- Foliage / grass blades
- Particle systems beyond what SpriteBatch can handle
- Tiled map chunk rendering

### Step 1: Define the Instance Data Struct

```csharp
[StructLayout(LayoutKind.Sequential)]
public readonly struct InstanceData : IVertexType
{
    // A 4×4 matrix = 4 × Vector4 = 64 bytes
    // Passed as 4 TEXCOORD slots (MonoGame has no MATRIX semantic)
    public readonly Matrix Transform;
    public readonly Color  Tint;

    public static readonly VertexDeclaration Declaration = new VertexDeclaration(
        // Matrix rows → TEXCOORD 1..4 (0 is used by the mesh)
        new VertexElement( 0, VertexElementFormat.Vector4, VertexElementUsage.TextureCoordinate, 1),
        new VertexElement(16, VertexElementFormat.Vector4, VertexElementUsage.TextureCoordinate, 2),
        new VertexElement(32, VertexElementFormat.Vector4, VertexElementUsage.TextureCoordinate, 3),
        new VertexElement(48, VertexElementFormat.Vector4, VertexElementUsage.TextureCoordinate, 4),
        // Tint → COLOR1
        new VertexElement(64, VertexElementFormat.Color,   VertexElementUsage.Color, 1)
    );

    VertexDeclaration IVertexType.VertexDeclaration => Declaration;

    public InstanceData(Matrix transform, Color tint)
    {
        Transform = transform;
        Tint      = tint;
    }
}
```

> **Why TextureCoordinate for a matrix?** MonoGame / XNA does not support a `Matrix` vertex element format. You must split it into four `Vector4` rows using sequential `TextureCoordinate` usage indices. This is the standard pattern.

### Step 2: Create the Instance Buffer

```csharp
private VertexBuffer _instanceBuffer;
private VertexBufferBinding[] _bindings;

void SetupInstancing(int maxInstances)
{
    _instanceBuffer = new DynamicVertexBuffer(
        GraphicsDevice, InstanceData.Declaration,
        maxInstances, BufferUsage.WriteOnly);

    // Binding array: slot 0 = mesh, slot 1 = instances
    _bindings = new VertexBufferBinding[2];
    _bindings[0] = new VertexBufferBinding(_meshVertexBuffer, 0, 0);
    // frequency = 1 means "advance once per instance"
    _bindings[1] = new VertexBufferBinding(_instanceBuffer, 0, 1);
}
```

The third parameter of `VertexBufferBinding` is the **instance frequency**:

| Value | Meaning |
|-------|---------|
| `0`   | Per-vertex data (standard mesh buffer) |
| `1`   | Advance once per instance |
| `N`   | Advance once every N instances (rare) |

### Step 3: Upload Instance Data Each Frame

```csharp
void UpdateInstances(Span<InstanceData> instances, int count)
{
    _instanceBuffer.SetData(instances.ToArray(), 0, count,
        SetDataOptions.Discard);
}
```

### Step 4: Draw

```csharp
void DrawInstanced(int instanceCount)
{
    GraphicsDevice.SetVertexBuffers(_bindings);
    GraphicsDevice.Indices = _meshIndexBuffer;

    foreach (EffectPass pass in _instanceEffect.CurrentTechnique.Passes)
    {
        pass.Apply();
        GraphicsDevice.DrawInstancedPrimitives(
            PrimitiveType.TriangleList,
            baseVertex:     0,
            startIndex:     0,
            primitiveCount: 2,           // triangles per mesh (1 quad = 2)
            instanceCount:  instanceCount);
    }
}
```

### Step 5: HLSL Shader for Instancing

```hlsl
float4x4 View;
float4x4 Projection;
texture2D SpriteTexture;

sampler2D SpriteSampler = sampler_state
{
    Texture = <SpriteTexture>;
    MinFilter = Point;
    MagFilter = Point;
};

// Per-vertex (mesh) input — stream 0
struct VSInput
{
    float2 Position : POSITION0;
    float2 TexCoord : TEXCOORD0;
};

// Per-instance input — stream 1
struct InstanceInput
{
    float4 Row0 : TEXCOORD1;
    float4 Row1 : TEXCOORD2;
    float4 Row2 : TEXCOORD3;
    float4 Row3 : TEXCOORD4;
    float4 Tint : COLOR1;
};

struct VSOutput
{
    float4 Position : SV_POSITION;
    float2 TexCoord : TEXCOORD0;
    float4 Tint     : COLOR0;
};

// Reconstruct a 4×4 matrix from four row vectors
float4x4 BuildMatrix(float4 r0, float4 r1, float4 r2, float4 r3)
{
    return float4x4(r0, r1, r2, r3);
}

VSOutput MainVS(VSInput vert, InstanceInput inst)
{
    VSOutput output;
    float4x4 world = BuildMatrix(inst.Row0, inst.Row1, inst.Row2, inst.Row3);

    float4 worldPos = mul(float4(vert.Position, 0, 1), world);
    float4 viewPos  = mul(worldPos, View);
    output.Position = mul(viewPos, Projection);
    output.TexCoord = vert.TexCoord;
    output.Tint     = inst.Tint;
    return output;
}

float4 MainPS(VSOutput input) : SV_TARGET
{
    float4 texColor = tex2D(SpriteSampler, input.TexCoord);
    return texColor * input.Tint;
}

technique Instanced
{
    pass P0
    {
        VertexShader = compile vs_4_0 MainVS();
        PixelShader  = compile ps_4_0 MainPS();
    }
}
```

---

## Practical Pattern: Instanced Bullet System

A complete bullet manager using instancing:

```csharp
public class BulletRenderer
{
    private const int MaxBullets = 10_000;

    private readonly GraphicsDevice _device;
    private readonly VertexBuffer _quadVB;
    private readonly IndexBuffer _quadIB;
    private readonly DynamicVertexBuffer _instanceVB;
    private readonly VertexBufferBinding[] _bindings;
    private readonly Effect _effect;
    private readonly InstanceData[] _instanceData;

    private int _activeBullets;

    public BulletRenderer(GraphicsDevice device, Effect effect, int spriteSize)
    {
        _device = device;
        _effect = effect;
        _instanceData = new InstanceData[MaxBullets];

        // Build a unit quad (mesh data, stream 0)
        float s = spriteSize * 0.5f;
        var verts = new VertexPositionTexture[]
        {
            new(new Vector3(-s, -s, 0), new Vector2(0, 0)),
            new(new Vector3( s, -s, 0), new Vector2(1, 0)),
            new(new Vector3( s,  s, 0), new Vector2(1, 1)),
            new(new Vector3(-s,  s, 0), new Vector2(0, 1)),
        };
        var idx = new short[] { 0, 1, 2, 0, 2, 3 };

        _quadVB = new VertexBuffer(device, typeof(VertexPositionTexture), 4, BufferUsage.WriteOnly);
        _quadVB.SetData(verts);
        _quadIB = new IndexBuffer(device, IndexElementSize.SixteenBit, 6, BufferUsage.WriteOnly);
        _quadIB.SetData(idx);

        // Instance buffer (stream 1)
        _instanceVB = new DynamicVertexBuffer(device, InstanceData.Declaration, MaxBullets, BufferUsage.WriteOnly);
        _bindings = new VertexBufferBinding[]
        {
            new VertexBufferBinding(_quadVB, 0, 0),
            new VertexBufferBinding(_instanceVB, 0, 1),
        };
    }

    /// <summary>
    /// Call once per frame after updating bullet positions.
    /// </summary>
    public void Upload(ReadOnlySpan<BulletState> bullets)
    {
        _activeBullets = Math.Min(bullets.Length, MaxBullets);
        for (int i = 0; i < _activeBullets; i++)
        {
            ref readonly var b = ref bullets[i];
            _instanceData[i] = new InstanceData(
                Matrix.CreateRotationZ(b.Rotation)
                * Matrix.CreateTranslation(b.Position.X, b.Position.Y, 0),
                b.Tint);
        }
        _instanceVB.SetData(_instanceData, 0, _activeBullets, SetDataOptions.Discard);
    }

    public void Draw(Matrix view, Matrix projection)
    {
        if (_activeBullets == 0) return;

        _effect.Parameters["View"].SetValue(view);
        _effect.Parameters["Projection"].SetValue(projection);

        _device.SetVertexBuffers(_bindings);
        _device.Indices = _quadIB;

        foreach (EffectPass pass in _effect.CurrentTechnique.Passes)
        {
            pass.Apply();
            _device.DrawInstancedPrimitives(
                PrimitiveType.TriangleList, 0, 0, 2, _activeBullets);
        }
    }
}
```

---

## Performance Tips

### Batch Size Sweet Spots

| Instance Count | Approach | Notes |
|---------------|----------|-------|
| < 50 | `SpriteBatch` | Simpler, no custom shader needed |
| 50–500 | `DrawUserIndexedPrimitives` | No buffer management overhead |
| 500–100,000+ | Hardware instancing | One draw call, GPU-side iteration |

### Reducing Instance Data Size

Full 4×4 matrices (64 bytes each) work but are expensive at high counts. For 2D sprites that only need position, rotation, and uniform scale:

```csharp
[StructLayout(LayoutKind.Sequential)]
public readonly struct InstanceData2D : IVertexType
{
    public readonly Vector3 PosAndRotation;  // x, y, rotation
    public readonly float   Scale;
    public readonly Color   Tint;

    public static readonly VertexDeclaration Declaration = new VertexDeclaration(
        new VertexElement( 0, VertexElementFormat.Vector3, VertexElementUsage.TextureCoordinate, 1),
        new VertexElement(12, VertexElementFormat.Single,  VertexElementUsage.TextureCoordinate, 2),
        new VertexElement(16, VertexElementFormat.Color,   VertexElementUsage.Color, 1)
    );

    VertexDeclaration IVertexType.VertexDeclaration => Declaration;

    public InstanceData2D(Vector2 pos, float rotation, float scale, Color tint)
    {
        PosAndRotation = new Vector3(pos.X, pos.Y, rotation);
        Scale = scale;
        Tint  = tint;
    }
}
```

This reduces per-instance data from 68 bytes to 20 bytes — a 3.4× bandwidth reduction. The shader reconstructs the transform:

```hlsl
float4x4 BuildTransform2D(float3 posRot, float scale)
{
    float s = sin(posRot.z);
    float c = cos(posRot.z);
    return float4x4(
         c * scale,  s * scale, 0, 0,
        -s * scale,  c * scale, 0, 0,
         0,          0,         1, 0,
         posRot.x,   posRot.y,  0, 1);
}
```

### Avoiding Common Pitfalls

1. **Mismatched TEXCOORD indices** — If your mesh uses `TEXCOORD0`, instance data must start at `TEXCOORD1`. Overlapping indices silently corrupt data.
2. **Forgetting `SetDataOptions.Discard`** — Without it, `SetData` on dynamic buffers causes a GPU sync stall every frame.
3. **Row-major vs column-major confusion** — HLSL uses column-major by default. MonoGame's `Matrix` is row-major. Pass rows as-is and reconstruct with `float4x4(r0, r1, r2, r3)` — the mul order handles the rest.
4. **Exceeding vertex buffer slots** — MonoGame supports up to 16 vertex buffer bindings, but most hardware instancing uses exactly 2 (mesh + instances).
5. **`DrawInstancedPrimitives` not available on all backends** — Supported on DesktopGL (OpenGL 3.3+), DirectX, Vulkan, and DX12. Not available on older mobile GL ES 2.0 targets.

---

## When to Use What

| Scenario | Technique | Guide |
|----------|-----------|-------|
| < 50 unique sprites/frame | `SpriteBatch` | [G2](./G2_rendering_and_graphics.md) |
| Per-sprite shader params | Multiple Begin/End or custom vertices | [G98](./G98_spritebatch_shader_batching.md) |
| Hundreds of same sprite | Hardware instancing (this guide) | — |
| GPU particle simulation | Compute → instanced draw | [G84](./G84_compute_shaders.md) |
| 3D mesh instancing (foliage) | Same pattern, 3D vertex type | — |

---

## Arch ECS Integration

Store instance data as a component and batch-upload each frame:

```csharp
// Component
public struct Renderable
{
    public Vector2 Position;
    public float   Rotation;
    public float   Scale;
    public Color   Tint;
    public int     SpriteId;  // which instanced renderer to use
}

// System (Arch ECS query)
var query = new QueryDescription().WithAll<Renderable>();
world.Query(in query, (ref Renderable r) =>
{
    _bulletRenderer.Enqueue(r.Position, r.Rotation, r.Scale, r.Tint);
});
_bulletRenderer.FlushAndDraw(view, projection);
```

---

## Further Reading

- [G2 Rendering & Graphics](./G2_rendering_and_graphics.md) — SpriteBatch fundamentals
- [G98 SpriteBatch Shader Batching](./G98_spritebatch_shader_batching.md) — Per-sprite effects without instancing
- [G96 Graphics State Management](./G96_graphics_state_management.md) — Render state, blend modes, samplers
- [G84 Compute Shaders](./G84_compute_shaders.md) — GPU-side particle updates
- [G33 Profiling & Optimization](./G33_profiling_optimization.md) — Measuring draw call impact
- [MonoGame Docs — Custom Vertex Declaration](https://docs.monogame.net/articles/getting_to_know/howto/graphics/HowTo_UseACustomVertex.html)
