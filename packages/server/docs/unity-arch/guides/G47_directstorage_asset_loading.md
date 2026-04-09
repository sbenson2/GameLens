# G47 — DirectStorage & High-Performance Asset Loading

> **Category:** guide · **Engine:** Unity 6.4+ (6000.4.x) · **Related:** [G9 Addressables](G9_addressables_asset_management.md) · [G16 Performance & Memory](G16_performance_optimization_memory.md) · [G11 Debugging & Profiling](G11_debugging_profiling.md) · [Unity Rules](../unity-arch-rules.md)

Microsoft DirectStorage is a Windows API that bypasses the traditional OS I/O stack, allowing assets to stream directly from NVMe SSDs to GPU memory with minimal CPU involvement. Unity 6.4 (beta, 6000.4.x) introduced built-in DirectStorage support, reducing load times by up to **40%** for textures, meshes, and ECS/DOTS data on compatible hardware. This guide covers how it works, how to enable it, and how to structure your project to benefit from it.

---

## How DirectStorage Works

Traditional asset loading in Unity:

```
NVMe SSD → OS Kernel I/O → CPU Memory → Decompression (CPU) → GPU Upload → VRAM
     ↑ multiple copies, CPU bottlenecked, blocked by OS I/O scheduler
```

With DirectStorage:

```
NVMe SSD → DirectStorage API → GPU Memory (VRAM)
     ↑ single path, minimal CPU involvement, batched I/O requests
```

### Key Benefits

| Metric | Traditional I/O | DirectStorage | Improvement |
|--------|----------------|---------------|-------------|
| Texture load time | ~850ms (1GB) | ~510ms (1GB) | ~40% faster |
| CPU overhead during load | High (decompression) | Minimal (GPU decompresses) | Frees CPU for gameplay |
| I/O request batching | Sequential | Batched + prioritized | Better throughput |
| Memory copies | 2-3 intermediate buffers | Direct to destination | Lower peak memory |

> **WHY this matters for games:** Open-world games, large levels, and asset-heavy scenes benefit most. Faster streaming means less pop-in, shorter loading screens, and the ability to keep more assets on disk instead of in memory.

---

## Requirements

### Hardware

- **Storage:** NVMe SSD (SATA SSDs work but with reduced benefit)
- **GPU:** DirectX 12-compatible GPU (all modern NVIDIA, AMD, Intel discrete GPUs)
- **OS:** Windows 10 version 1909+ or Windows 11

### Software

- **Unity:** 6.4 beta or later (6000.4.x)
- **Build target:** Windows Standalone only (not available for other platforms yet)
- **Graphics API:** DirectX 12 must be the active graphics API

> **IMPORTANT:** DirectStorage is a Windows-only feature. Console platforms (Xbox, PlayStation) have their own equivalent I/O APIs that Unity abstracts separately. Mobile and WebGL are not supported.

---

## Enabling DirectStorage

### Step 1: Enable in Player Settings

```
Edit → Project Settings → Player → Other Settings → Configuration
  → Enable DirectStorage: ✓
```

That's it for the basic setup. When enabled, Unity's internal asset loading pipeline automatically routes through DirectStorage instead of the standard Windows I/O stack.

### Step 2: Ensure DirectX 12 is Active

```
Edit → Project Settings → Player → Other Settings → Rendering
  → Graphics APIs for Windows:
      Direct3D12  ← must be first (or only) entry
```

If Direct3D11 is listed first, DirectStorage will silently fall back to traditional I/O.

### Step 3: Verify at Runtime

Use the Profiler to confirm DirectStorage is active:

```csharp
// WHY: DirectStorage is transparent to gameplay code, but you should
// verify it's actually engaged — misconfiguration causes silent fallback.
using UnityEngine;
using Unity.IO.LowLevel.Unsafe;

public class DirectStorageCheck : MonoBehaviour
{
    private void Start()
    {
        // AsyncReadManager is Unity's low-level I/O API.
        // When DirectStorage is enabled, it uses DirectStorage under the hood.
        Debug.Log($"I/O subsystem active: {AsyncReadManager.IsAsyncReadManagerAvailable}");

        #if UNITY_STANDALONE_WIN
        // Check DirectX 12 is the active graphics API
        Debug.Log($"Graphics API: {SystemInfo.graphicsDeviceType}");
        if (SystemInfo.graphicsDeviceType != UnityEngine.Rendering.GraphicsDeviceType.Direct3D12)
        {
            Debug.LogWarning("DirectStorage requires Direct3D12. " +
                "Current API will use standard I/O fallback.");
        }
        #endif
    }
}
```

---

## What Gets Accelerated

Unity 6.4's DirectStorage integration accelerates loading for specific asset types through the engine's internal systems:

### Automatically Accelerated

| Asset Type | How It's Loaded | Benefit |
|-----------|----------------|---------|
| **Textures** | Streamed from disk to GPU VRAM | Largest benefit — textures are the bulk of most game I/O |
| **Meshes** | Vertex/index buffer upload | Faster level geometry streaming |
| **ECS/DOTS data** | Entity scene loading | Massive entity worlds load faster |
| **Addressable assets** | Via AsyncReadManager | Addressables benefit automatically if DirectStorage is enabled |

### NOT Accelerated (as of 6.4 beta)

| Asset Type | Reason |
|-----------|--------|
| Audio clips | Uses separate audio streaming pipeline |
| Video | Uses platform video decoder |
| Custom binary files | Requires manual `AsyncReadManager` usage |
| Script serialization | CPU-bound deserialization dominates |

---

## Working with AsyncReadManager

Unity's `AsyncReadManager` is the C# API that DirectStorage operates through. If you're already using it for custom asset loading, you get DirectStorage acceleration for free.

```csharp
using Unity.IO.LowLevel.Unsafe;
using Unity.Collections;
using UnityEngine;

public class CustomAssetLoader : MonoBehaviour
{
    // WHY AsyncReadManager? It's Unity's lowest-level I/O API.
    // When DirectStorage is enabled, these reads go through the
    // DirectStorage pipeline automatically — no API changes needed.
    public unsafe void LoadCustomData(string filePath)
    {
        // Allocate a native buffer for the read result
        var readCommand = new ReadCommand
        {
            Offset = 0,
            Size = 1024 * 1024, // 1 MB
            Buffer = (byte*)UnsafeUtility.Malloc(
                1024 * 1024,
                16,
                Allocator.Persistent)
        };

        // Create the read handle — this is non-blocking
        var readHandle = AsyncReadManager.Read(
            filePath,
            &readCommand,
            1); // number of read commands

        // WHY non-blocking? The read happens on a separate I/O thread
        // (or DirectStorage queue). Your game loop continues running.
        // Check completion in a coroutine or system update.

        // Option 1: Block and wait (use only during loading screens)
        readHandle.JobHandle.Complete();

        if (readHandle.Status == ReadStatus.Complete)
        {
            // Process the loaded data
            Debug.Log("Custom data loaded via DirectStorage pipeline");
        }

        // Clean up
        readHandle.Dispose();
        UnsafeUtility.Free(readCommand.Buffer, Allocator.Persistent);
    }
}
```

> **NOTE:** Unity is actively working on a higher-level C# API that exposes more DirectStorage features (GPU decompression, priority queues). As of 6.4 beta, the `AsyncReadManager` is the primary interface.

---

## Optimizing Your Project for DirectStorage

DirectStorage delivers the best results when your project is structured for streaming:

### 1. Use Addressables, Not Resources

```csharp
// WRONG: Resources.Load is synchronous and bypasses DirectStorage
var tex = Resources.Load<Texture2D>("Textures/Hero");

// CORRECT: Addressables use AsyncReadManager → DirectStorage
var handle = Addressables.LoadAssetAsync<Texture2D>("Textures/Hero");
handle.Completed += (op) => { /* use op.Result */ };
```

### 2. Enable Texture Streaming

Texture Streaming works synergistically with DirectStorage — it loads only the mip levels needed for the current camera distance, and DirectStorage accelerates each mip upload.

```
Edit → Project Settings → Quality → Texture Streaming: ✓
  Memory Budget: 512 MB (adjust per platform)
```

```csharp
// WHY: Texture Streaming + DirectStorage = only load the mip levels
// you need, and load them as fast as possible.
// Tag textures as "Streaming Mip Maps" in the Texture Import Settings.
[SerializeField] private Texture2D _heroTexture;

// At runtime, Unity automatically streams higher mip levels
// as the camera approaches. DirectStorage handles the I/O.
```

### 3. Batch Asset Loads

DirectStorage performs best when it can batch multiple I/O requests. Avoid loading assets one-by-one in a tight loop:

```csharp
// SUBOPTIMAL: Sequential loads prevent batching
foreach (var key in assetKeys)
{
    await Addressables.LoadAssetAsync<GameObject>(key).Task;
}

// BETTER: Fire all loads concurrently, let DirectStorage batch them
var handles = assetKeys.Select(key =>
    Addressables.LoadAssetAsync<GameObject>(key)).ToList();

// WHY: DirectStorage's request queue can reorder and merge adjacent
// disk reads. Concurrent requests give it more optimization opportunities.
await Task.WhenAll(handles.Select(h => h.Task));
```

### 4. Keep Assets Contiguous on Disk

DirectStorage reads are fastest when data is contiguous. Unity's build pipeline generally handles this, but you can help:

- **Group related Addressable assets** into the same Addressable Group (e.g., all textures for a level)
- **Use LZ4 compression** (not LZMA) for AssetBundles — LZ4 supports random access, LZMA requires sequential decompression
- **Avoid tiny AssetBundles** — each bundle is a separate file; merging small bundles reduces I/O overhead

### 5. Profile with the Profiler

Use Unity's Profiler (Window → Analysis → Profiler) to measure actual I/O performance:

- **File I/O module** — shows read requests, throughput, and queue depth
- **Loading module** — tracks asset loading time per type
- **Memory module** — verify that DirectStorage isn't inflating peak memory

```
Profiler markers to watch:
  AsyncReadManager.Read     — individual read requests
  DirectStorage.Submit      — batched submission to DirectStorage queue
  Texture.StreamMipLevel    — individual mip streaming operations
```

---

## Fallback Behavior

DirectStorage degrades gracefully when requirements aren't met:

| Condition | Behavior |
|-----------|----------|
| SATA SSD (not NVMe) | DirectStorage runs but with reduced throughput |
| HDD | Falls back to standard Windows I/O entirely |
| DirectX 11 active | Falls back to standard I/O (no error, just slower) |
| Windows 7/8 | DirectStorage not available; standard I/O used |
| Non-Windows platform | Feature ignored; platform-native I/O used |

> **No code changes needed for fallback.** The same `AsyncReadManager` / Addressables code works on all platforms. DirectStorage is purely an acceleration layer.

---

## Known Limitations (Unity 6.4 Beta)

1. **No GPU decompression yet** — Unity 6.4's initial implementation uses DirectStorage for I/O routing but still decompresses on the CPU. GPU decompression (GDeflate) is planned for a future release
2. **No custom file C# API yet** — you can't currently pass arbitrary file paths through a dedicated DirectStorage C# API; only Unity's internal asset types go through the accelerated path
3. **Windows Standalone only** — no editor play mode acceleration, no other platforms
4. **Build size unchanged** — DirectStorage doesn't affect asset compression or build size
5. **URP Compatibility Mode removed in 6.4** — if upgrading specifically for DirectStorage, you must also migrate to the Render Graph-based URP workflow

---

## Migration Checklist

If you're adding DirectStorage to an existing Unity 6.x project:

- [ ] Upgrade to Unity 6.4+ (6000.4.x)
- [ ] Set Direct3D12 as the primary graphics API
- [ ] Enable DirectStorage in Player Settings
- [ ] Migrate from `Resources.Load` to Addressables (if not already done)
- [ ] Enable Texture Streaming and set an appropriate memory budget
- [ ] Switch AssetBundle compression from LZMA to LZ4
- [ ] Profile before and after with the File I/O Profiler module
- [ ] Test on HDD and SATA SSD to verify graceful fallback
- [ ] Update minimum system requirements in your store page (recommend NVMe SSD)

---

## Further Reading

- [Unity Manual: Optimize Performance Using DirectStorage](https://docs.unity3d.com/6000.4/Documentation/Manual/windows-directstorage.html)
- [Unity 6.4 Beta Announcement & Discussion](https://discussions.unity.com/t/unity-announces-directstorage-support-in-unity-6-4-beta-enabling-accelerated-asset-loading-on-windows/1703061)
- [Microsoft DirectStorage Developer Overview](https://devblogs.microsoft.com/directx/directstorage-overview/)
- [G9 Addressables & Asset Management](G9_addressables_asset_management.md) — prerequisite for optimal DirectStorage usage
