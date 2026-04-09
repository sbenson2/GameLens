# G86 — Async Content Loading & Texture Streaming

> **Category:** guide · **Engine:** MonoGame · **Related:** [G8 Content Pipeline](./G8_content_pipeline.md) · [G26 Resource Loading & Caching](./G26_resource_loading_caching.md) · [G33 Profiling & Optimization](./G33_profiling_optimization.md) · [G67 Object Pooling](./G67_object_pooling.md) · [G71 Spatial Partitioning](./G71_spatial_partitioning.md)

How to load game content asynchronously in MonoGame without stalling the game loop. Covers background thread loading patterns, the thread-safety constraints of `ContentManager` and `Texture2D`, queue-based GPU upload strategies, and architectural patterns for streaming large worlds with loading screens and seamless zone transitions.

## The Problem: Main-Thread Loading Stalls

MonoGame's `ContentManager.Load<T>()` is synchronous and performs both I/O (reading `.xnb` files from disk) and GPU work (creating textures, vertex buffers). Calling it during gameplay causes frame hitches — sometimes hundreds of milliseconds for large textures or complex models.

The challenge is that **OpenGL and DirectX require GPU resource creation on the graphics thread**. You cannot simply move everything to `Task.Run` — the GPU upload step must execute on the thread that owns the graphics context.

## Architecture: Split I/O from GPU Upload

The proven pattern separates work into two phases:

```
Background Thread              Main Thread (game loop)
─────────────────              ──────────────────────
1. Read .xnb from disk         3. Dequeue loaded data
2. Decode/decompress bytes      4. Create GPU resource
   → Enqueue raw pixel data        (Texture2D.SetData, etc.)
```

### Phase 1: Background I/O and Decoding

```csharp
public class AsyncContentLoader
{
    private readonly ContentManager _content;
    private readonly ConcurrentQueue<LoadRequest> _pendingUploads = new();
    private readonly HashSet<string> _loading = new();

    /// <summary>
    /// Kicks off a background load. The raw pixel data is decoded off-thread,
    /// but actual GPU texture creation is deferred to the main thread.
    /// </summary>
    public void RequestLoad(string assetPath)
    {
        if (_loading.Contains(assetPath)) return;
        _loading.Add(assetPath);

        Task.Run(() =>
        {
            // Read and decode the file on a background thread.
            // Use FileStream directly — NOT ContentManager.Load,
            // which internally calls GraphicsDevice methods.
            string fullPath = Path.Combine(_content.RootDirectory, assetPath + ".xnb");
            byte[] fileBytes = File.ReadAllBytes(fullPath);

            // For textures loaded from raw images (PNG/JPG) rather than .xnb,
            // decode the pixel data without touching the GPU:
            // using var stream = File.OpenRead(imagePath);
            // var imageData = DecodeImageToRGBA(stream); // your decoder

            _pendingUploads.Enqueue(new LoadRequest
            {
                AssetPath = assetPath,
                RawData = fileBytes
            });
        });
    }
}
```

### Phase 2: Main-Thread GPU Upload

```csharp
/// <summary>
/// Call once per frame from Update() or Draw() to process
/// a limited number of queued uploads without causing frame drops.
/// </summary>
public void ProcessUploads(GraphicsDevice device, int maxPerFrame = 2)
{
    int processed = 0;
    while (processed < maxPerFrame && _pendingUploads.TryDequeue(out var request))
    {
        // GPU resource creation MUST happen on the main thread.
        var texture = new Texture2D(device, request.Width, request.Height);
        texture.SetData(request.PixelData);

        _loadedAssets[request.AssetPath] = texture;
        _loading.Remove(request.AssetPath);
        processed++;
    }
}
```

### Why Not Texture2D.FromStream on a Background Thread?

`Texture2D.FromStream()` internally creates GPU resources. On DesktopGL (OpenGL), this hangs or crashes when called from a non-GL thread. On DesktopDX it may work due to D3D11's deferred context support, but it is **not safe cross-platform**. Always separate I/O from GPU creation.

## ContentManager Thread Safety

`ContentManager.Load<T>()` is **not thread-safe** in MonoGame. Key rules:

1. **Never call `Load<T>` from multiple threads simultaneously.** The internal cache dictionary is not concurrent.
2. **Use separate ContentManager instances** if you must load from multiple threads — each instance has its own cache. Dispose them when done to avoid memory leaks.
3. **For .xnb loading specifically**, the XNB reader pipeline calls `GraphicsDevice` methods internally, making it inherently main-thread-only for GPU resources.

```csharp
// Safe pattern: dedicated ContentManager per loading context
var backgroundContent = new ContentManager(game.Services, "Content");
// Use only for non-GPU resources (SoundEffect, SpriteFont data, JSON, etc.)
```

## Streaming Large Worlds: Zone-Based Loading

For open-world or large-level games, divide the world into zones and load/unload them based on player position.

### Zone Manager Pattern

```csharp
public class ZoneManager
{
    private readonly Dictionary<Point, Zone> _zones = new();
    private readonly HashSet<Point> _activeZones = new();
    private readonly AsyncContentLoader _loader;
    private readonly int _loadRadius = 2;  // zones ahead to preload
    private readonly int _unloadRadius = 4; // zones behind to release

    public void Update(Vector2 playerPosition)
    {
        Point currentZone = WorldToZone(playerPosition);

        // Request loading for zones within radius
        for (int dx = -_loadRadius; dx <= _loadRadius; dx++)
        for (int dy = -_loadRadius; dy <= _loadRadius; dy++)
        {
            var coord = new Point(currentZone.X + dx, currentZone.Y + dy);
            if (!_activeZones.Contains(coord))
            {
                _loader.RequestLoad($"zones/zone_{coord.X}_{coord.Y}");
                _activeZones.Add(coord);
            }
        }

        // Unload distant zones to reclaim memory
        var toUnload = _activeZones
            .Where(z => Math.Abs(z.X - currentZone.X) > _unloadRadius
                     || Math.Abs(z.Y - currentZone.Y) > _unloadRadius)
            .ToList();

        foreach (var coord in toUnload)
        {
            _zones[coord].Dispose();
            _zones.Remove(coord);
            _activeZones.Remove(coord);
        }
    }
}
```

### Loading Priority

Not all assets are equally urgent. Implement a priority queue:

- **Priority 0 (Immediate):** Zone the player is currently in — block if not loaded.
- **Priority 1 (High):** Adjacent zones in the player's movement direction.
- **Priority 2 (Low):** Remaining zones within the load radius.

```csharp
// Use a PriorityQueue (.NET 6+) for ordered processing
private readonly PriorityQueue<LoadRequest, int> _loadQueue = new();

public void RequestLoad(string asset, int priority)
{
    _loadQueue.Enqueue(new LoadRequest(asset), priority);
}
```

## Loading Screens and Progress Tracking

For level transitions where seamless streaming is not needed, use a loading screen with progress feedback.

```csharp
public class LoadingScreen
{
    private readonly List<string> _assetsToLoad;
    private int _loaded;

    public float Progress => _assetsToLoad.Count > 0
        ? (float)_loaded / _assetsToLoad.Count
        : 1f;

    /// <summary>
    /// Cooperative loader: loads one asset per frame to keep
    /// the loading screen animation smooth at 60fps.
    /// </summary>
    public bool LoadNext(ContentManager content)
    {
        if (_loaded >= _assetsToLoad.Count) return true; // done

        content.Load<object>(_assetsToLoad[_loaded]);
        _loaded++;
        return _loaded >= _assetsToLoad.Count;
    }
}
```

This "cooperative" approach loads one asset per frame, keeping the loading screen responsive. For faster loading at the cost of animation smoothness, batch multiple assets per frame with a time budget:

```csharp
public bool LoadBatch(ContentManager content, double timeBudgetMs = 8.0)
{
    var sw = Stopwatch.StartNew();
    while (_loaded < _assetsToLoad.Count && sw.Elapsed.TotalMilliseconds < timeBudgetMs)
    {
        content.Load<object>(_assetsToLoad[_loaded]);
        _loaded++;
    }
    return _loaded >= _assetsToLoad.Count;
}
```

## Placeholder Assets and LOD Transitions

Avoid pop-in by showing low-resolution placeholders while full assets load:

```csharp
public Texture2D GetTexture(string assetPath)
{
    if (_loadedAssets.TryGetValue(assetPath, out var tex))
        return tex;

    // Return a 1x1 placeholder (or low-res mipmap) while loading
    if (!_loading.Contains(assetPath))
        RequestLoad(assetPath);

    return _placeholderTexture;
}
```

For 3D games or detailed 2D games, maintain two texture variants per asset (quarter-resolution thumbnail and full resolution) and crossfade during the transition.

## Memory Budget and Disposal

Streaming content means managing a memory budget:

1. **Track loaded asset sizes.** Maintain a running total of VRAM usage.
2. **Set a ceiling.** For example, 512 MB for textures on desktop, 128 MB on mobile.
3. **Evict by LRU.** When approaching the ceiling, dispose the least-recently-used assets that are outside the active zone radius.
4. **Call `Texture2D.Dispose()` explicitly.** MonoGame textures hold unmanaged GPU memory — the garbage collector alone is not sufficient.

```csharp
// Track usage with a simple LRU cache
private readonly LinkedList<(string path, int sizeBytes)> _lruOrder = new();
private long _totalBytes;
private const long MaxBytes = 512 * 1024 * 1024; // 512 MB

private void EvictIfNeeded()
{
    while (_totalBytes > MaxBytes && _lruOrder.Count > 0)
    {
        var oldest = _lruOrder.First.Value;
        _lruOrder.RemoveFirst();
        if (_loadedAssets.TryGetValue(oldest.path, out var tex))
        {
            tex.Dispose();
            _loadedAssets.Remove(oldest.path);
            _totalBytes -= oldest.sizeBytes;
        }
    }
}
```

## Platform-Specific Notes

| Platform | Thread Behavior |
|----------|----------------|
| DesktopGL | OpenGL context is thread-bound. All `Texture2D`, `Effect`, `VertexBuffer` creation must be on the GL thread. Background I/O is fine. |
| DesktopDX | D3D11 supports deferred contexts, but MonoGame's implementation still routes through `Threading.BlockOnUIThread`. Treat as main-thread-only. |
| DesktopVK (3.8.5 preview) | Vulkan supports transfer queues for async uploads. MonoGame's Vulkan backend may enable true parallel uploads in the future. |
| Mobile (Android/iOS) | Same GL thread constraint. Additionally, texture memory is more limited — aggressive eviction is essential. |
| Consoles | Consult platform-specific NDA documentation. Generally support async upload via DMA/transfer queues. |

## Checklist

- [ ] Never call `ContentManager.Load<T>` for GPU resources off the main thread
- [ ] Separate file I/O (background-safe) from GPU upload (main-thread-only)
- [ ] Budget GPU uploads per frame to avoid spikes (2–4 textures/frame or use a time budget)
- [ ] Implement zone-based streaming with load/unload radius for open worlds
- [ ] Track VRAM usage and evict by LRU when approaching budget limits
- [ ] Dispose textures explicitly — do not rely on GC for GPU memory
- [ ] Show placeholders during async loads to prevent visual pop-in
- [ ] Test on DesktopGL specifically — it is the strictest platform for thread safety
