# G117 — Chunk-Based World Streaming

> **Category:** guide · **Engine:** MonoGame · **Related:** [G37 Tilemap Systems](./G37_tilemap_systems.md) · [G71 Spatial Partitioning](./G71_spatial_partitioning.md) · [G86 Async Content Loading](./G86_async_content_loading.md) · [G67 Object Pooling](./G67_object_pooling.md) · [G26 Resource Loading & Caching](./G26_resource_loading_caching.md) · [G13 C# Performance](./G13_csharp_performance.md) · [G116 External Level Editor Integration](./G116_external_level_editor_integration.md)

How to implement chunk-based world streaming in MonoGame for large 2D or 3D worlds that cannot fit in memory at once. Covers chunk grid design, async loading with threading constraints, memory budgeting, and integration with tilemap editors and ECS architectures.

---

## Table of Contents

1. [When You Need Streaming](#1-when-you-need-streaming)
2. [Chunk Grid Design](#2-chunk-grid-design)
3. [ChunkManager Architecture](#3-chunkmanager-architecture)
4. [Async Loading & Thread Safety](#4-async-loading--thread-safety)
5. [Memory Budget & Unloading](#5-memory-budget--unloading)
6. [Rendering Loaded Chunks](#6-rendering-loaded-chunks)
7. [Entity Streaming](#7-entity-streaming)
8. [Editor Integration](#8-editor-integration)
9. [Voxel World Variant](#9-voxel-world-variant)
10. [Performance Checklist](#10-performance-checklist)

---

## 1. When You Need Streaming

Load everything up front if your world fits in memory (most 2D games under ~500 MB). Streaming adds complexity — only use it when:

```
✓ World data exceeds available RAM (open-world RPGs, voxel games)
✓ Load times are unacceptable without progressive loading
✓ Seamless transitions between areas (no loading screens)
✓ Procedurally generated infinite worlds
```

If your world is a few hundred tilemaps that load in under 2 seconds, simpler approaches (preload all, swap scenes) work fine. See [G38 Scene Management](./G38_scene_management.md).

---

## 2. Chunk Grid Design

Divide the world into a uniform grid of **chunks**. Each chunk is an independent unit of loading/unloading.

```
World Coordinate → Chunk Coordinate

chunkX = (int)Math.Floor(worldX / ChunkWorldSize)
chunkY = (int)Math.Floor(worldY / ChunkWorldSize)
```

### Choosing Chunk Size

| Factor | Smaller chunks | Larger chunks |
|--------|---------------|---------------|
| Granularity | Fine — load only what's visible | Coarse — may load off-screen data |
| Overhead | More chunks active, more management | Fewer chunks, simpler bookkeeping |
| Load time per chunk | Fast | Slower |
| Draw calls | More batches | Fewer batches |

**Typical sizes:**

- **2D tilemap:** 32×32 to 64×64 tiles per chunk (512–1024 px at 16px tiles)
- **Voxel 3D:** 16×16×16 blocks per chunk (Minecraft-style)
- **Large 2D open-world:** 96×96 tiles per chunk (community-proven in MonoGame forums)

---

## 3. ChunkManager Architecture

```csharp
public class ChunkManager
{
    private readonly Dictionary<Point, Chunk> _loadedChunks = new();
    private readonly HashSet<Point> _loadingInProgress = new();
    private readonly Queue<Point> _loadQueue = new();
    private readonly Queue<Point> _unloadQueue = new();
    
    private readonly int _loadRadius;    // Chunks around player to keep loaded
    private readonly int _unloadRadius;  // Distance before unloading (> _loadRadius)

    public ChunkManager(int loadRadius = 2, int unloadRadius = 3)
    {
        _loadRadius = loadRadius;
        _unloadRadius = unloadRadius;
    }

    /// <summary>
    /// Call every frame with the player's current chunk coordinate.
    /// Queues loads for nearby chunks and unloads for distant ones.
    /// </summary>
    public void Update(Point playerChunk)
    {
        // 1. Queue chunks that should be loaded
        for (int dx = -_loadRadius; dx <= _loadRadius; dx++)
        {
            for (int dy = -_loadRadius; dy <= _loadRadius; dy++)
            {
                Point target = new(playerChunk.X + dx, playerChunk.Y + dy);
                if (!_loadedChunks.ContainsKey(target) && !_loadingInProgress.Contains(target))
                {
                    _loadQueue.Enqueue(target);
                    _loadingInProgress.Add(target);
                }
            }
        }

        // 2. Queue chunks that are too far away for unloading
        foreach (Point loaded in _loadedChunks.Keys)
        {
            int dist = Math.Max(
                Math.Abs(loaded.X - playerChunk.X),
                Math.Abs(loaded.Y - playerChunk.Y));
            
            if (dist > _unloadRadius)
                _unloadQueue.Enqueue(loaded);
        }

        // 3. Process unload queue (immediate — frees memory)
        while (_unloadQueue.Count > 0)
        {
            Point key = _unloadQueue.Dequeue();
            if (_loadedChunks.Remove(key, out Chunk chunk))
                chunk.Dispose();
        }

        // 4. Kick off async loads (budget: 1-2 per frame to avoid spikes)
        int loadsThisFrame = 0;
        while (_loadQueue.Count > 0 && loadsThisFrame < 2)
        {
            Point key = _loadQueue.Dequeue();
            _ = LoadChunkAsync(key);
            loadsThisFrame++;
        }
    }

    public IEnumerable<Chunk> GetVisibleChunks() => _loadedChunks.Values;
}
```

The **hysteresis gap** between `_loadRadius` and `_unloadRadius` prevents thrashing when the player walks along a chunk boundary.

---

## 4. Async Loading & Thread Safety

MonoGame's `ContentManager` and GPU resource creation (textures, vertex buffers) are **not thread-safe** and must happen on the main thread. The pattern is: load raw data on a background thread, then finalize GPU resources on the main thread.

```csharp
private async Task LoadChunkAsync(Point coord)
{
    // PHASE 1: Background thread — load raw data (disk I/O, parsing)
    ChunkData rawData = await Task.Run(() =>
    {
        string path = $"chunks/chunk_{coord.X}_{coord.Y}";
        return ChunkLoader.LoadRawData(path);
    });

    // PHASE 2: Main thread — create GPU resources
    // Queue for processing in the next Update() call
    _pendingFinalization.Enqueue((coord, rawData));
}

// Called from Update() on the main thread
private void FinalizePendingChunks()
{
    int finalized = 0;
    while (_pendingFinalization.Count > 0 && finalized < 2)
    {
        var (coord, rawData) = _pendingFinalization.Dequeue();
        
        // Safe to create Texture2D here — we're on the main thread
        Texture2D tileset = Content.Load<Texture2D>(rawData.TilesetName);
        Chunk chunk = new Chunk(coord, rawData, tileset, GraphicsDevice);
        
        _loadedChunks[coord] = chunk;
        _loadingInProgress.Remove(coord);
        finalized++;
    }
}
```

### Why Not Load Textures on Background Threads?

MonoGame creates textures via the GPU's graphics context, which is bound to the main thread. Loading a `Texture2D` on a background thread will either throw or produce a white rectangle. This is a fundamental MonoGame constraint, not a bug.

**Workaround for texture-heavy chunks:** Pre-load all tilesets at startup (they're shared across chunks anyway). Only the per-chunk tile data and entity data need async loading.

---

## 5. Memory Budget & Unloading

Track memory to prevent unbounded growth:

```csharp
public class ChunkMemoryBudget
{
    private long _currentBytes;
    private readonly long _maxBytes;

    public ChunkMemoryBudget(long maxMegabytes)
    {
        _maxBytes = maxMegabytes * 1024 * 1024;
    }

    public bool CanLoad(long chunkSizeBytes)
        => _currentBytes + chunkSizeBytes <= _maxBytes;

    public void Track(long bytes) => _currentBytes += bytes;
    public void Release(long bytes) => _currentBytes -= bytes;
}
```

Integrate with `ChunkManager.Update()` — skip loading if the budget is exhausted, and prioritize unloading the farthest chunks first.

### Chunk Disposal

```csharp
public class Chunk : IDisposable
{
    private Texture2D _uniqueTexture;  // Only if chunk has its own texture
    private VertexBuffer _meshBuffer;  // For 3D/voxel chunks
    
    public long EstimatedBytes { get; init; }

    public void Dispose()
    {
        _uniqueTexture?.Dispose();
        _meshBuffer?.Dispose();
        // Do NOT dispose shared tilesets — they're owned by ContentManager
    }
}
```

---

## 6. Rendering Loaded Chunks

### 2D Tilemap Chunks

```csharp
public void Draw(SpriteBatch spriteBatch, Matrix viewMatrix, Rectangle viewBounds)
{
    spriteBatch.Begin(
        sortMode: SpriteSortMode.Deferred,
        samplerState: SamplerState.PointClamp,
        transformMatrix: viewMatrix);

    foreach (Chunk chunk in _chunkManager.GetVisibleChunks())
    {
        // Frustum cull — skip chunks entirely outside the view
        if (!viewBounds.Intersects(chunk.WorldBounds))
            continue;

        chunk.Draw(spriteBatch);
    }

    spriteBatch.End();
}
```

### Reducing Draw Calls

- **Pre-bake chunk textures:** Render each chunk's tiles into a single `RenderTarget2D` once on load. Draw is then one sprite per chunk instead of one per tile. Good for static terrain layers.
- **Batch across chunks:** Use a single `SpriteBatch.Begin/End` for all chunks (shown above). SpriteBatch will batch tiles using the same tileset texture automatically.

---

## 7. Entity Streaming

Entities (NPCs, items, triggers) must be loaded/unloaded with their parent chunk:

```csharp
public class Chunk
{
    public List<Entity> Entities { get; } = new();
    
    public void Activate(EntityManager entityManager)
    {
        foreach (Entity entity in Entities)
            entityManager.Add(entity);
    }
    
    public void Deactivate(EntityManager entityManager)
    {
        foreach (Entity entity in Entities)
            entityManager.Remove(entity);
    }
}
```

**Edge case:** Entities near chunk boundaries may be visible from an adjacent chunk. Options:

1. **Overlap zone:** Extend entity visibility by a margin beyond the chunk bounds
2. **Entity ownership by position:** Entities live in whichever chunk their center falls in
3. **Global entities:** Important entities (bosses, quest NPCs) are never unloaded

---

## 8. Editor Integration

### LDtk Multi-Level as Chunks

LDtk projects with multiple levels map naturally to chunks. Each level has a `worldX`/`worldY` offset:

```csharp
// Parse LDtk project, treating each level as a chunk
foreach (var level in ldtkProject.Levels)
{
    Point chunkCoord = new(
        level.WorldX / ChunkWorldSize,
        level.WorldY / ChunkWorldSize);
    
    _chunkDataByCoord[chunkCoord] = level;
}
```

### Tiled .world Files

Tiled's `.world` format defines spatial relationships between `.tmx` files — each map file becomes a streamable chunk at a world position.

---

## 9. Voxel World Variant

For 3D voxel games (Minecraft-style), the chunk pattern extends to three dimensions:

```
Differences from 2D:
  - Chunks are 16×16×16 (or 32×32×32) cubes
  - Mesh generation is expensive — greedy meshing on background threads
  - VertexBuffer per chunk, rebuilt when blocks change
  - Vertical column of chunks loaded per (X,Z) position
  - LOD: distant chunks use simplified meshes or impostors
```

Key performance pattern: **batch chunk meshes**. Combining several adjacent chunks into one `VertexBuffer` reduces draw calls significantly. Rebuild the combined mesh when any constituent chunk changes.

```csharp
// Voxel chunk mesh — one VertexBuffer per chunk
public void RebuildMesh()
{
    List<VertexPositionTexture> vertices = new();
    
    // Greedy meshing — only emit faces between solid and air blocks
    for (int x = 0; x < Size; x++)
    for (int y = 0; y < Size; y++)
    for (int z = 0; z < Size; z++)
    {
        if (_blocks[x, y, z] == BlockType.Air) continue;
        
        // Check each face — only add if neighbor is air
        if (IsAir(x + 1, y, z)) AddFace(vertices, x, y, z, Face.East);
        if (IsAir(x - 1, y, z)) AddFace(vertices, x, y, z, Face.West);
        // ... other faces
    }
    
    _vertexBuffer?.Dispose();
    _vertexBuffer = new VertexBuffer(
        _graphicsDevice, typeof(VertexPositionTexture),
        vertices.Count, BufferUsage.WriteOnly);
    _vertexBuffer.SetData(vertices.ToArray());
}
```

---

## 10. Performance Checklist

```
□ Chunk size tuned — load time < 16ms for real-time streaming
□ Hysteresis gap between load and unload radius (prevents thrashing)
□ GPU resources created on main thread only
□ Raw data parsing offloaded to background threads
□ Load budget: max 1-2 chunks finalized per frame
□ Memory budget tracked — old chunks evicted before new ones load
□ Shared tilesets pre-loaded at startup (not per-chunk)
□ Frustum culling skips off-screen chunks in Draw()
□ Entity activation/deactivation tied to chunk lifecycle
□ Chunk disposal releases GPU resources (VertexBuffer, unique textures)
□ No ContentManager calls from background threads
```

---

## Architecture Summary

```
                    ┌──────────────────────────────────┐
                    │          ChunkManager             │
                    │                                    │
  Player position → │  Update() → queue loads/unloads   │
                    │  FinalizePendingChunks() → GPU     │
                    │  GetVisibleChunks() → render list  │
                    └──────┬──────────────┬─────────────┘
                           │              │
              ┌────────────▼──┐   ┌───────▼──────────┐
              │  Background   │   │   Main Thread     │
              │  Task.Run()   │   │   GPU finalization │
              │  Disk I/O     │   │   Texture creation │
              │  JSON parsing │   │   VertexBuffer     │
              └───────────────┘   └──────────────────┘
```

The pattern scales from small tile-based worlds to voxel engines. Start simple (load radius of 1, synchronous loading), then add async streaming and memory budgeting when profiling shows you need it.
