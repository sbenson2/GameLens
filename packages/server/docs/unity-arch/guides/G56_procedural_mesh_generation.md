# G56 — Procedural Mesh Generation

> **Category:** guide · **Engine:** Unity 6 (6000.0+) · **Related:** [G42 Burst Compiler & Jobs](G42_burst_compiler_jobs_system.md) · [G16 Performance Optimization](G16_performance_optimization_memory.md) · [G19 Procedural Content Generation](G19_procedural_content_generation.md) · [Unity Rules](../unity-arch-rules.md)

Procedural mesh generation creates geometry at runtime via code rather than importing pre-made models. This is essential for terrain deformation, voxel engines, destructible environments, cable/rope rendering, custom trails, and any system where geometry must respond to gameplay. Unity's `Mesh` API — especially the `MeshDataArray` pipeline introduced for Jobs/Burst compatibility — gives you zero-allocation, multi-threaded mesh authoring.

---

## When to Use Procedural Meshes

| Use Case | Why Not a Pre-made Model? |
|----------|--------------------------|
| Voxel / block worlds | Geometry depends entirely on player-placed blocks |
| Terrain deformation | Mesh changes in response to explosions, digging |
| Rope / cable / chain | Shape determined by physics simulation each frame |
| 2D polygon colliders | Level geometry drawn by designers in a tool |
| Custom trail / ribbon effects | Vertices emitted along a moving path |
| Procedural architecture | Buildings assembled from rules, not hand-modeled |
| LOD generation | Simplified meshes generated from high-poly source |

---

## Architecture Decision: Three Mesh Authoring Paths

Unity offers three ways to build meshes at runtime. Choose based on your performance needs:

### Path 1: Simple Mesh API (Prototyping / Small Meshes)

The classic approach — set `vertices`, `triangles`, `normals`, and `uv` arrays directly on a `Mesh` object. Easy to understand, but allocates managed arrays on every update.

```csharp
// Simple Mesh API — good for prototyping or infrequently updated meshes
// WHY: Easiest to understand; vertices/triangles are plain C# arrays.
// TRADEOFF: Each assignment allocates managed arrays → GC pressure.
public class SimpleMeshBuilder : MonoBehaviour
{
    private Mesh _mesh;

    void Start()
    {
        _mesh = new Mesh();
        GetComponent<MeshFilter>().mesh = _mesh;

        // A single quad (two triangles)
        // WHY: Vertices define corners; triangles index into the vertex array
        // using clockwise winding order (for front-facing in Unity).
        _mesh.vertices = new Vector3[]
        {
            new(0, 0, 0), new(1, 0, 0),
            new(1, 1, 0), new(0, 1, 0)
        };

        // WHY: Each group of 3 indices forms one triangle.
        // Clockwise winding = front face in Unity's left-handed coordinate system.
        _mesh.triangles = new int[] { 0, 2, 1, 0, 3, 2 };

        // WHY: UVs map texture coordinates to each vertex (0-1 range).
        _mesh.uv = new Vector2[]
        {
            new(0, 0), new(1, 0),
            new(1, 1), new(0, 1)
        };

        // WHY: RecalculateNormals computes per-vertex normals from triangle faces.
        // For flat-shaded meshes, duplicate vertices per face instead.
        _mesh.RecalculateNormals();
        _mesh.RecalculateBounds();
    }
}
```

**When to use:** Editor tools, infrequently-created meshes, prototyping.

### Path 2: Advanced Mesh API with NativeArrays (No GC, Main Thread)

Use `Mesh.SetVertexBufferParams` + `Mesh.SetVertexBufferData` with `NativeArray<T>` to avoid managed allocations entirely. Still runs on the main thread.

```csharp
using Unity.Collections;
using UnityEngine;
using UnityEngine.Rendering;

// Advanced Mesh API — zero GC allocations using NativeArrays
// WHY: SetVertexBufferData accepts NativeArray, avoiding managed array copies.
// TRADEOFF: Runs on main thread; for multi-threaded generation, use MeshDataArray.
public class AdvancedMeshBuilder : MonoBehaviour
{
    // WHY: Define vertex layout as a struct matching the GPU vertex format.
    // Sequential layout ensures predictable memory alignment for the GPU.
    [System.Runtime.InteropServices.StructLayout(
        System.Runtime.InteropServices.LayoutKind.Sequential)]
    struct Vertex
    {
        public Vector3 position;
        public Vector3 normal;
        public Vector2 uv;
    }

    void Start()
    {
        var mesh = new Mesh();

        // WHY: VertexAttributeDescriptor tells Unity the exact memory layout.
        // Stream 0 = all attributes interleaved in one buffer (simplest approach).
        var vertexAttributes = new NativeArray<VertexAttributeDescriptor>(3, Allocator.Temp);
        vertexAttributes[0] = new VertexAttributeDescriptor(
            VertexAttribute.Position, VertexAttributeFormat.Float32, 3, stream: 0);
        vertexAttributes[1] = new VertexAttributeDescriptor(
            VertexAttribute.Normal, VertexAttributeFormat.Float32, 3, stream: 0);
        vertexAttributes[2] = new VertexAttributeDescriptor(
            VertexAttribute.TexCoord0, VertexAttributeFormat.Float32, 2, stream: 0);

        int vertexCount = 4;
        mesh.SetVertexBufferParams(vertexCount, vertexAttributes);
        vertexAttributes.Dispose();

        // WHY: Write vertices into a NativeArray — no managed heap allocation.
        var vertices = new NativeArray<Vertex>(vertexCount, Allocator.Temp);
        vertices[0] = new Vertex { position = new Vector3(0, 0, 0), normal = Vector3.back, uv = new Vector2(0, 0) };
        vertices[1] = new Vertex { position = new Vector3(1, 0, 0), normal = Vector3.back, uv = new Vector2(1, 0) };
        vertices[2] = new Vertex { position = new Vector3(1, 1, 0), normal = Vector3.back, uv = new Vector2(1, 1) };
        vertices[3] = new Vertex { position = new Vector3(0, 1, 0), normal = Vector3.back, uv = new Vector2(0, 1) };

        mesh.SetVertexBufferData(vertices, 0, 0, vertexCount);
        vertices.Dispose();

        // WHY: 16-bit indices save memory for meshes under 65535 vertices.
        mesh.SetIndexBufferParams(6, IndexFormat.UInt16);
        var indices = new NativeArray<ushort>(6, Allocator.Temp);
        indices[0] = 0; indices[1] = 2; indices[2] = 1;
        indices[3] = 0; indices[4] = 3; indices[5] = 2;
        mesh.SetIndexBufferData(indices, 0, 0, 6);
        indices.Dispose();

        // WHY: SubMesh descriptor tells the renderer which index range to draw.
        mesh.SetSubMesh(0, new SubMeshDescriptor(0, 6, MeshTopology.Triangles));
        mesh.RecalculateBounds();

        GetComponent<MeshFilter>().mesh = mesh;
    }
}
```

### Path 3: MeshDataArray + Jobs + Burst (Multi-threaded, Zero GC)

The highest-performance path. Generate mesh data inside Burst-compiled jobs on worker threads, then apply to the mesh on the main thread.

```csharp
using Unity.Burst;
using Unity.Collections;
using Unity.Jobs;
using Unity.Mathematics;
using UnityEngine;
using UnityEngine.Rendering;

// MeshDataArray pipeline — multi-threaded mesh generation with Jobs + Burst
// WHY: MeshDataArray lets you write vertex/index data from any thread.
// Burst compiles the job to SIMD-optimized native code.
// This is the recommended path for meshes updated every frame (terrain, voxels).
public class JobMeshBuilder : MonoBehaviour
{
    [SerializeField] private int _gridSize = 64;

    // WHY: Define vertex struct matching GPU layout — must be unmanaged for Burst.
    [System.Runtime.InteropServices.StructLayout(
        System.Runtime.InteropServices.LayoutKind.Sequential)]
    struct Vertex
    {
        public float3 position;
        public float3 normal;
        public float2 uv;
    }

    // WHY: IJobParallelFor processes each grid cell independently on worker threads.
    // Burst compiles this to vectorized native code — 10-50x faster than C#.
    [BurstCompile]
    struct GenerateGridJob : IJobParallelFor
    {
        public int GridSize;
        public float Time;

        // WHY: NativeArray from MeshData — writing directly to the GPU upload buffer.
        [NativeDisableParallelForRestriction]
        public NativeArray<Vertex> Vertices;

        [NativeDisableParallelForRestriction]
        public NativeArray<ushort> Indices;

        public void Execute(int index)
        {
            int x = index % GridSize;
            int z = index / GridSize;

            // WHY: Simple sine wave height — replace with your terrain/voxel algorithm.
            float height = math.sin(x * 0.3f + Time) * math.cos(z * 0.3f + Time) * 0.5f;

            // WHY: 4 vertices per quad, offset by cell index.
            int vi = index * 4;
            int ii = index * 6;

            float3 normal = math.normalize(new float3(
                -math.cos(x * 0.3f + Time) * 0.3f * math.cos(z * 0.3f + Time) * 0.5f,
                1f,
                math.sin(x * 0.3f + Time) * math.sin(z * 0.3f + Time) * 0.3f * 0.5f
            ));

            Vertices[vi + 0] = new Vertex
            {
                position = new float3(x, height, z),
                normal = normal,
                uv = new float2(x / (float)GridSize, z / (float)GridSize)
            };
            Vertices[vi + 1] = new Vertex
            {
                position = new float3(x + 1, height, z),
                normal = normal,
                uv = new float2((x + 1) / (float)GridSize, z / (float)GridSize)
            };
            Vertices[vi + 2] = new Vertex
            {
                position = new float3(x + 1, height, z + 1),
                normal = normal,
                uv = new float2((x + 1) / (float)GridSize, (z + 1) / (float)GridSize)
            };
            Vertices[vi + 3] = new Vertex
            {
                position = new float3(x, height, z + 1),
                normal = normal,
                uv = new float2(x / (float)GridSize, (z + 1) / (float)GridSize)
            };

            // WHY: Two triangles per quad, clockwise winding.
            Indices[ii + 0] = (ushort)(vi + 0);
            Indices[ii + 1] = (ushort)(vi + 2);
            Indices[ii + 2] = (ushort)(vi + 1);
            Indices[ii + 3] = (ushort)(vi + 0);
            Indices[ii + 4] = (ushort)(vi + 3);
            Indices[ii + 5] = (ushort)(vi + 2);
        }
    }

    private Mesh _mesh;

    void Start()
    {
        _mesh = new Mesh();
        _mesh.name = "ProceduralGrid";
        GetComponent<MeshFilter>().mesh = _mesh;
    }

    void Update()
    {
        int cellCount = _gridSize * _gridSize;
        int vertexCount = cellCount * 4;
        int indexCount = cellCount * 6;

        // WHY: AllocateWritableMeshData gives a MeshDataArray you can write from jobs.
        // Allocate ONE array with ONE mesh — batch multiple meshes in one call if needed.
        Mesh.MeshDataArray meshDataArray = Mesh.AllocateWritableMeshData(1);
        Mesh.MeshData meshData = meshDataArray[0];

        // WHY: SetVertexBufferParams defines GPU vertex layout BEFORE writing data.
        // Use NativeArray overload — the params[] overload doesn't Burst-compile.
        var attributes = new NativeArray<VertexAttributeDescriptor>(3, Allocator.Temp);
        attributes[0] = new VertexAttributeDescriptor(
            VertexAttribute.Position, VertexAttributeFormat.Float32, 3);
        attributes[1] = new VertexAttributeDescriptor(
            VertexAttribute.Normal, VertexAttributeFormat.Float32, 3);
        attributes[2] = new VertexAttributeDescriptor(
            VertexAttribute.TexCoord0, VertexAttributeFormat.Float32, 2);
        meshData.SetVertexBufferParams(vertexCount, attributes);
        attributes.Dispose();

        meshData.SetIndexBufferParams(indexCount, IndexFormat.UInt16);

        // WHY: GetVertexData/GetIndexData return NativeArrays backed by the mesh buffer.
        // Writing here writes directly to the upload buffer — no intermediate copies.
        var vertices = meshData.GetVertexData<Vertex>();
        var indices = meshData.GetIndexData<ushort>();

        // WHY: Schedule the job on worker threads. InnerloopBatchCount = 64
        // means each thread processes 64 cells before checking for new work.
        var job = new GenerateGridJob
        {
            GridSize = _gridSize,
            Time = UnityEngine.Time.time,
            Vertices = vertices,
            Indices = indices
        };

        // WHY: Complete() blocks until all workers finish. For async workflows,
        // schedule in LateUpdate and complete next frame (adds one frame latency).
        job.Schedule(cellCount, 64).Complete();

        // WHY: SetSubMesh defines which index range constitutes a drawable sub-mesh.
        meshData.subMeshCount = 1;
        meshData.SetSubMesh(0, new SubMeshDescriptor(0, indexCount, MeshTopology.Triangles),
            MeshUpdateFlags.DontRecalculateBounds);

        // WHY: ApplyAndDisposeWritableMeshData transfers data to the GPU and
        // disposes the MeshDataArray. You MUST call this — leaking is an error.
        Mesh.ApplyAndDisposeWritableMeshData(meshDataArray, _mesh,
            MeshUpdateFlags.DontRecalculateBounds);

        _mesh.RecalculateBounds();
    }
}
```

---

## MeshUpdateFlags — Controlling Recalculation

Every call to `ApplyAndDisposeWritableMeshData` or `SetVertexBufferData` can trigger expensive recalculations. Use `MeshUpdateFlags` to skip work you'll handle yourself:

| Flag | Effect | When to Use |
|------|--------|-------------|
| `DontRecalculateBounds` | Skips AABB recompute | You set bounds manually or call `RecalculateBounds()` once |
| `DontValidateIndices` | Skips index range checks | Production builds with validated data |
| `DontNotifyMeshUsers` | Skips notification to MeshCollider etc. | Mesh is render-only, no physics |
| `DontResetBoneBounds` | Skips skinned mesh bone bounds | Not a skinned mesh |

```csharp
// WHY: Combining flags avoids redundant work when you control the full pipeline.
// Only use DontValidateIndices when you're confident indices are correct.
Mesh.ApplyAndDisposeWritableMeshData(meshDataArray, mesh,
    MeshUpdateFlags.DontRecalculateBounds |
    MeshUpdateFlags.DontValidateIndices |
    MeshUpdateFlags.DontNotifyMeshUsers);

// WHY: Set bounds manually when you know the extents (cheaper than scanning all vertices).
mesh.bounds = new Bounds(center, size);
```

---

## Vertex Format Optimization

Choose the smallest format that maintains acceptable visual quality:

| Attribute | Full Quality | Optimized | Savings |
|-----------|-------------|-----------|---------|
| Position | Float32 × 3 (12 bytes) | Float16 × 3 (6 bytes) | 50% — only if world extent < ~65000 |
| Normal | Float32 × 3 (12 bytes) | SNorm8 × 4 (4 bytes) | 67% — pack into 4 bytes, GPU normalizes |
| UV | Float32 × 2 (8 bytes) | Float16 × 2 (4 bytes) | 50% — fine for most texture mapping |
| Color | Float32 × 4 (16 bytes) | UNorm8 × 4 (4 bytes) | 75% — standard vertex color |

```csharp
// WHY: Half-precision positions halve vertex buffer size — critical for voxel engines
// with millions of vertices. Only use when world coordinates fit in Float16 range.
new VertexAttributeDescriptor(VertexAttribute.Position, VertexAttributeFormat.Float16, 3),

// WHY: SNorm8 normals use 4 bytes instead of 12. The GPU reconstructs the unit vector.
// 4 components (not 3) for alignment — the 4th is padding.
new VertexAttributeDescriptor(VertexAttribute.Normal, VertexAttributeFormat.SNorm8, 4),
```

---

## Multi-Stream Vertex Buffers

For meshes where you update positions every frame but normals/UVs rarely change, split attributes across multiple GPU streams:

```csharp
// WHY: Stream 0 = positions (updated every frame via jobs)
// Stream 1 = normals + UVs (set once during initialization)
// The GPU reads from both streams, but you only upload the changed stream.
var attributes = new NativeArray<VertexAttributeDescriptor>(3, Allocator.Temp);
attributes[0] = new VertexAttributeDescriptor(
    VertexAttribute.Position, VertexAttributeFormat.Float32, 3, stream: 0);
attributes[1] = new VertexAttributeDescriptor(
    VertexAttribute.Normal, VertexAttributeFormat.Float32, 3, stream: 1);
attributes[2] = new VertexAttributeDescriptor(
    VertexAttribute.TexCoord0, VertexAttributeFormat.Float32, 2, stream: 1);

mesh.SetVertexBufferParams(vertexCount, attributes);

// WHY: Update only stream 0 each frame — stream 1 retains its data.
mesh.SetVertexBufferData(positionData, 0, 0, vertexCount, stream: 0);
```

---

## Read-Only Mesh Access with Jobs

Use `Mesh.AcquireReadOnlyMeshData` to read existing mesh data in jobs without blocking the render thread:

```csharp
// WHY: AcquireReadOnlyMeshData creates a snapshot for safe read access in jobs.
// Useful for mesh analysis, collision detection, or generating modified copies.
Mesh.MeshDataArray readData = Mesh.AcquireReadOnlyMeshData(sourceMesh);
Mesh.MeshData source = readData[0];

// Read vertex positions
var sourceVertices = source.GetVertexData<Vertex>();

// ... process in a job ...

// WHY: You MUST dispose read-only MeshDataArrays. They are not auto-disposed.
readData.Dispose();
```

---

## Physics Mesh Synchronization

If your procedural mesh also needs a `MeshCollider`, be aware of the cost:

```csharp
// WHY: MeshCollider.sharedMesh assignment triggers BVH rebuild — expensive.
// Only update the collider when gameplay requires it, not every frame.
[SerializeField] private float _colliderUpdateInterval = 0.25f;
private float _colliderTimer;

void Update()
{
    // ... update render mesh every frame ...

    _colliderTimer += Time.deltaTime;
    if (_colliderTimer >= _colliderUpdateInterval)
    {
        _colliderTimer = 0f;

        // WHY: Assign the same mesh reference — Unity detects the data changed
        // and rebuilds the BVH. Don't create a new Mesh each time.
        _meshCollider.sharedMesh = null;
        _meshCollider.sharedMesh = _mesh;
    }
}
```

**Tip:** For voxel worlds, prefer box/sphere colliders on individual blocks or use a compound collider approach rather than a single MeshCollider on the entire chunk.

---

## Common Pitfalls

1. **Forgetting to dispose `MeshDataArray`** — both writable (via `ApplyAndDisposeWritableMeshData`) and read-only (via `.Dispose()`) must be cleaned up. Leaking causes native memory growth and editor warnings.

2. **Using `params[]` overload of `SetVertexBufferParams` in Burst** — the `params VertexAttributeDescriptor[]` signature allocates a managed array. Use the `NativeArray<VertexAttributeDescriptor>` overload instead.

3. **Exceeding 65535 vertices with UInt16 indices** — switch to `IndexFormat.UInt32` for large meshes, or split into multiple sub-meshes/chunks.

4. **Calling `RecalculateNormals()` on MeshDataArray meshes** — this only works on the simple Mesh API. When using MeshDataArray, compute normals in your job.

5. **Not setting `subMeshCount` before `SetSubMesh`** — the sub-mesh count must be set first or the call is silently ignored.

6. **Updating MeshCollider every frame** — BVH rebuild is expensive. Throttle to 4-10 Hz or use simpler collider approximations.

---

## Performance Guidelines

| Scenario | Recommended Path | Notes |
|----------|-----------------|-------|
| Editor tool / one-time generation | Simple Mesh API | Clarity over performance |
| Runtime mesh, < 1000 vertices, infrequent updates | Advanced API (NativeArray) | Zero GC, main thread |
| Runtime mesh, > 1000 vertices OR per-frame updates | MeshDataArray + Jobs + Burst | Multi-threaded, zero GC |
| Voxel engine (millions of vertices) | MeshDataArray + Jobs + Burst + chunking | Split world into 16³–32³ chunks |

**Profiling tip:** Use the Unity Profiler's "Mesh.UploadMeshData" marker to measure GPU upload cost. If it dominates, reduce vertex format size or update frequency.
