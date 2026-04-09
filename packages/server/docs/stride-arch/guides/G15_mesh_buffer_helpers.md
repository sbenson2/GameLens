# G15 — Mesh Buffer Helpers & Procedural Geometry

> **Category:** guide · **Engine:** Stride · **Related:** [G03 Code-Only Development](./G03_code_only_development.md) · [G11 Community Toolkit & Bepu](./G11_community_toolkit_bepu.md) · [G07 Custom Render Features](./G07_custom_render_features.md) · [G10 Custom Assets Pipeline](./G10_custom_assets_pipeline.md)

Stride 4.3 introduced `VertexBufferHelper` and `IndexBufferHelper` — standardized utilities for reading and writing mesh vertex/index data regardless of the underlying buffer layout. Combined with the Community Toolkit's `MeshBuilder`, these tools make procedural geometry creation and runtime mesh manipulation straightforward. This guide covers the buffer helper API, procedural mesh generation patterns, and practical examples for terrain, UI meshes, and debug visualization.

---

## The Problem: Non-Standardized Vertex Layouts

Every mesh in Stride can have a different vertex layout. Some vertices include position + normal + UV. Others add tangents, blend weights, vertex colors, or use compact data types like `Half4` for positions or 4-byte packed colors. Reading or writing vertex data requires knowing the exact layout, offsets, and data types for each mesh.

Before 4.3, reading vertex data from a mesh meant:

1. Getting the `MeshDraw` from the `Mesh`
2. Reading the raw `VertexBufferBinding` byte array
3. Manually parsing the `VertexDeclaration` to find offsets
4. Casting bytes to the correct types based on `VertexElement.Format`

This was error-prone and verbose. The new helpers abstract this entirely.

---

## VertexBufferHelper

`VertexBufferHelper` provides typed access to any vertex element in a buffer, regardless of layout.

### Reading Vertex Data

```csharp
using Stride.Graphics;
using Stride.Rendering;

// Get a mesh from a loaded model
var model = Entity.Get<ModelComponent>().Model;
var meshData = model.Meshes[0].Draw;

// Create the helper from the first vertex buffer
var vbHelper = new VertexBufferHelper(meshData.VertexBuffers[0], GraphicsDevice);

// Read positions — works regardless of whether they're stored as
// Vector3, Vector4, Half4, or any other format
Vector3[] positions = vbHelper.GetPositions();

// Read normals
Vector3[] normals = vbHelper.GetNormals();

// Read texture coordinates (channel 0)
Vector2[] uvs = vbHelper.GetTextureCoordinates(0);

// Read vertex colors if present
Color4[] colors = vbHelper.GetColors(0);
```

The helper automatically converts between data types. If positions are stored as `Half4`, `GetPositions()` returns `Vector3[]` with the conversion handled internally.

### Writing Vertex Data

```csharp
// Modify positions (e.g., apply a wave deformation)
Vector3[] positions = vbHelper.GetPositions();

for (int i = 0; i < positions.Length; i++)
{
    float wave = MathF.Sin(positions[i].X * 0.5f + time) * 0.3f;
    positions[i].Y += wave;
}

// Write back — the helper converts to the buffer's native format
vbHelper.SetPositions(positions);

// Upload the modified data to the GPU
vbHelper.Upload(GraphicsDevice);
```

### Checking Available Elements

```csharp
// Query what vertex elements are present
bool hasNormals = vbHelper.HasElement(VertexElementUsage.Normal);
bool hasTangents = vbHelper.HasElement(VertexElementUsage.Tangent);
bool hasColors = vbHelper.HasElement(VertexElementUsage.Color);

// Get the vertex count
int vertexCount = vbHelper.VertexCount;
```

---

## IndexBufferHelper

`IndexBufferHelper` provides unified access to index buffers whether they use 16-bit or 32-bit indices.

```csharp
var ibHelper = new IndexBufferHelper(meshData.IndexBuffer, GraphicsDevice);

// Read all indices as int[] — converts from UInt16 if needed
int[] indices = ibHelper.GetIndices();

// Get index count and format
int indexCount = ibHelper.IndexCount;
bool is32Bit = ibHelper.Is32Bit;

// Write indices
int[] newIndices = GenerateLODIndices(positions, targetTriCount);
ibHelper.SetIndices(newIndices);
ibHelper.Upload(GraphicsDevice);
```

---

## Procedural Geometry with MeshBuilder

The Community Toolkit's `MeshBuilder` is the recommended high-level API for creating meshes from scratch. It wraps the vertex/index buffer setup into a fluent builder pattern.

### Basic Triangle

```csharp
using Stride.CommunityToolkit.Rendering;

var mesh = MeshBuilder.Create(GraphicsDevice, builder =>
{
    builder.WithVertexElement(VertexElementUsage.Position, 0, PixelFormat.R32G32B32_Float);
    builder.WithVertexElement(VertexElementUsage.Color, 0, PixelFormat.R32G32B32A32_Float);
    builder.WithPrimitiveType(PrimitiveType.TriangleList);

    // Vertex 0
    builder.AddVertex();
    builder.SetElement(VertexElementUsage.Position, 0, new Vector3(0, 1, 0));
    builder.SetElement(VertexElementUsage.Color, 0, new Color4(1, 0, 0, 1));

    // Vertex 1
    builder.AddVertex();
    builder.SetElement(VertexElementUsage.Position, 0, new Vector3(-1, -1, 0));
    builder.SetElement(VertexElementUsage.Color, 0, new Color4(0, 1, 0, 1));

    // Vertex 2
    builder.AddVertex();
    builder.SetElement(VertexElementUsage.Position, 0, new Vector3(1, -1, 0));
    builder.SetElement(VertexElementUsage.Color, 0, new Color4(0, 0, 1, 1));

    builder.AddIndex(0);
    builder.AddIndex(1);
    builder.AddIndex(2);
});

// Attach to an entity
var entity = new Entity();
entity.Add(new ModelComponent { Model = new Model { mesh } });
```

### Procedural Grid (Terrain Base)

```csharp
Mesh CreateGrid(GraphicsDevice device, int width, int height, float cellSize)
{
    return MeshBuilder.Create(device, builder =>
    {
        builder.WithVertexElement(VertexElementUsage.Position, 0, PixelFormat.R32G32B32_Float);
        builder.WithVertexElement(VertexElementUsage.Normal, 0, PixelFormat.R32G32B32_Float);
        builder.WithVertexElement(VertexElementUsage.TextureCoordinate, 0, PixelFormat.R32G32_Float);
        builder.WithPrimitiveType(PrimitiveType.TriangleList);

        // Generate vertices
        for (int z = 0; z <= height; z++)
        {
            for (int x = 0; x <= width; x++)
            {
                builder.AddVertex();
                builder.SetElement(VertexElementUsage.Position, 0,
                    new Vector3(x * cellSize, 0, z * cellSize));
                builder.SetElement(VertexElementUsage.Normal, 0, Vector3.UnitY);
                builder.SetElement(VertexElementUsage.TextureCoordinate, 0,
                    new Vector2((float)x / width, (float)z / height));
            }
        }

        // Generate indices (two triangles per cell)
        int stride = width + 1;
        for (int z = 0; z < height; z++)
        {
            for (int x = 0; x < width; x++)
            {
                int topLeft = z * stride + x;
                int topRight = topLeft + 1;
                int bottomLeft = topLeft + stride;
                int bottomRight = bottomLeft + 1;

                // Triangle 1
                builder.AddIndex(topLeft);
                builder.AddIndex(bottomLeft);
                builder.AddIndex(topRight);

                // Triangle 2
                builder.AddIndex(topRight);
                builder.AddIndex(bottomLeft);
                builder.AddIndex(bottomRight);
            }
        }
    });
}
```

---

## Runtime Mesh Modification

Combining `VertexBufferHelper` with `IndexBufferHelper` enables runtime mesh manipulation — useful for terrain deformation, cloth simulation, or damage systems.

### Terrain Deformation Example

```csharp
public class TerrainDeformer : SyncScript
{
    public ModelComponent TerrainModel;
    public float DeformRadius = 2.0f;
    public float DeformStrength = 0.5f;

    private VertexBufferHelper _vbHelper;
    private Vector3[] _positions;
    private Vector3[] _normals;

    public override void Start()
    {
        var meshDraw = TerrainModel.Model.Meshes[0].Draw;
        _vbHelper = new VertexBufferHelper(meshDraw.VertexBuffers[0], GraphicsDevice);
        _positions = _vbHelper.GetPositions();
        _normals = _vbHelper.GetNormals();
    }

    public void DeformAt(Vector3 worldPoint)
    {
        bool modified = false;

        for (int i = 0; i < _positions.Length; i++)
        {
            float dist = Vector3.Distance(_positions[i], worldPoint);
            if (dist < DeformRadius)
            {
                // Smooth falloff
                float influence = 1.0f - (dist / DeformRadius);
                influence *= influence; // Quadratic falloff
                _positions[i].Y -= DeformStrength * influence;
                modified = true;
            }
        }

        if (modified)
        {
            RecalculateNormals(_positions, _normals);
            _vbHelper.SetPositions(_positions);
            _vbHelper.SetNormals(_normals);
            _vbHelper.Upload(GraphicsDevice);
        }
    }

    private void RecalculateNormals(Vector3[] positions, Vector3[] normals)
    {
        // Reset normals
        Array.Fill(normals, Vector3.Zero);

        // Accumulate face normals per vertex
        // (simplified — production code should use the index buffer)
        for (int i = 0; i < positions.Length - 2; i += 3)
        {
            var edge1 = positions[i + 1] - positions[i];
            var edge2 = positions[i + 2] - positions[i];
            var faceNormal = Vector3.Cross(edge1, edge2);

            normals[i] += faceNormal;
            normals[i + 1] += faceNormal;
            normals[i + 2] += faceNormal;
        }

        // Normalize
        for (int i = 0; i < normals.Length; i++)
            normals[i] = Vector3.Normalize(normals[i]);
    }
}
```

---

## Debug Visualization Meshes

Create runtime debug meshes for visualizing collision shapes, AI paths, or spatial queries:

```csharp
public static class DebugMeshFactory
{
    /// <summary>
    /// Creates a wireframe sphere mesh for debug visualization.
    /// </summary>
    public static Mesh CreateWireSphere(GraphicsDevice device, float radius, int segments = 16)
    {
        return MeshBuilder.Create(device, builder =>
        {
            builder.WithVertexElement(VertexElementUsage.Position, 0, PixelFormat.R32G32B32_Float);
            builder.WithVertexElement(VertexElementUsage.Color, 0, PixelFormat.R32G32B32A32_Float);
            builder.WithPrimitiveType(PrimitiveType.LineList);

            var color = new Color4(0, 1, 0, 1); // Green wireframe
            int vertexIndex = 0;

            // Generate 3 rings (XY, XZ, YZ planes)
            for (int ring = 0; ring < 3; ring++)
            {
                for (int i = 0; i < segments; i++)
                {
                    float angle1 = (float)i / segments * MathF.Tau;
                    float angle2 = (float)(i + 1) / segments * MathF.Tau;

                    Vector3 p1 = ring switch
                    {
                        0 => new Vector3(MathF.Cos(angle1), MathF.Sin(angle1), 0) * radius,
                        1 => new Vector3(MathF.Cos(angle1), 0, MathF.Sin(angle1)) * radius,
                        _ => new Vector3(0, MathF.Cos(angle1), MathF.Sin(angle1)) * radius
                    };
                    Vector3 p2 = ring switch
                    {
                        0 => new Vector3(MathF.Cos(angle2), MathF.Sin(angle2), 0) * radius,
                        1 => new Vector3(MathF.Cos(angle2), 0, MathF.Sin(angle2)) * radius,
                        _ => new Vector3(0, MathF.Cos(angle2), MathF.Sin(angle2)) * radius
                    };

                    builder.AddVertex();
                    builder.SetElement(VertexElementUsage.Position, 0, p1);
                    builder.SetElement(VertexElementUsage.Color, 0, color);

                    builder.AddVertex();
                    builder.SetElement(VertexElementUsage.Position, 0, p2);
                    builder.SetElement(VertexElementUsage.Color, 0, color);

                    builder.AddIndex(vertexIndex++);
                    builder.AddIndex(vertexIndex++);
                }
            }
        });
    }
}
```

---

## Performance Considerations

- **Buffer uploads are expensive.** Call `Upload(GraphicsDevice)` only when data has actually changed. Batch modifications and upload once per frame.
- **Use 16-bit indices** when your mesh has fewer than 65,536 vertices. The `IndexBufferHelper` handles the conversion, but 16-bit indices use half the memory bandwidth.
- **For static meshes**, create the mesh once during initialization and let the GPU cache it. The buffer helpers are most valuable during content loading or infrequent runtime operations.
- **For per-frame deformation** (cloth, water), consider compute shaders (see [G07](./G07_custom_render_features.md)) instead of CPU-side vertex manipulation. The helpers are convenient but involve CPU → GPU upload each frame.
- **MeshBuilder allocates managed arrays internally.** For hot paths, prefer pre-allocated `VertexBufferHelper` with reused arrays over repeated `MeshBuilder.Create` calls.

---

## Summary

| Tool | Use case | When to use |
|------|----------|-------------|
| `VertexBufferHelper` | Read/write vertex data on existing meshes | Runtime deformation, mesh analysis, LOD generation |
| `IndexBufferHelper` | Read/write index data on existing meshes | LOD generation, mesh simplification |
| `MeshBuilder` | Create new meshes from scratch | Procedural geometry, debug visualization, UI meshes |
| Compute shaders | Per-frame GPU-side mesh manipulation | Cloth, water, particle mesh generation |

The buffer helpers bridge the gap between Stride's flexible vertex layouts and practical C# code that needs to read or modify mesh data. For new procedural geometry, start with `MeshBuilder`. For modifying existing meshes loaded from assets, reach for `VertexBufferHelper` and `IndexBufferHelper`.
