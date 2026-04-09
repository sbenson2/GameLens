# G16 — Performance Optimization & Memory Management

> **Category:** guide · **Engine:** Unity 6 (6000.x) · **Related:** [G11 Debugging & Profiling](G11_debugging_profiling.md) · [G9 Addressables](G9_addressables_asset_management.md) · [G13 ECS/DOTS](G13_ecs_dots.md) · [R1 Capability Matrix](../reference/R1_capability_matrix.md)

Unity 6 manages memory across four domains — Native, Managed (C# heap), GPU, and Untracked (plugins). Understanding where allocations happen and how the garbage collector interacts with your code is the single most impactful optimization skill for Unity developers. This guide covers practical patterns for reducing allocations, pooling objects, managing assets, and profiling memory on target hardware.

---

## Memory Architecture Overview

```
┌────────────────────────────────────────────────────────┐
│                    Unity 6 Memory Map                    │
│                                                          │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  │
│  │ Native Memory │  │Managed Memory│  │  GPU Memory   │  │
│  │               │  │  (C# Heap)   │  │              │  │
│  │ Scene objects │  │ MonoBehaviour│  │ Textures     │  │
│  │ Assets (mesh, │  │ fields, Lists│  │ Render       │  │
│  │ texture data) │  │ strings,     │  │ targets      │  │
│  │ NativeArrays  │  │ delegates    │  │ Compute      │  │
│  │ Engine systems│  │              │  │ buffers      │  │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘  │
│         │                 │                  │          │
│  OS allocator       GC (Boehm or      Graphics driver  │
│  (manual lifetime)  Incremental)      (GPU managed)     │
│                     auto-collects                       │
└────────────────────────────────────────────────────────┘
```

**Key insight:** The garbage collector only manages the C# Managed heap. Native memory and GPU memory must be explicitly released. Leaks in any domain cause problems, but GC spikes — caused by frequent managed allocations — are the most common source of frame hitches.

---

## Garbage Collection — Understanding the Cost

Unity 6 uses the **Incremental GC** by default, which spreads collection work across multiple frames instead of one long pause. However, it is still triggered by allocation pressure.

### Enabling Incremental GC

```
Project Settings → Player → Other Settings → Configuration
  ☑ Use incremental GC

// WHY incremental: The non-incremental Boehm collector can pause
// your entire game for 5-50ms+ to scan the heap. Incremental mode
// distributes that work into ~1ms slices across frames. The tradeoff
// is slightly higher average overhead, but dramatically fewer spikes.
```

### The Golden Rule: Allocate Less

Every `new` on a reference type (class, string, array, delegate) allocates on the managed heap. When the heap fills, the GC runs. The fix is not to "optimize the GC" — it's to stop allocating.

**Common hidden allocations:**

```csharp
// BAD: String concatenation in Update allocates every frame
void Update()
{
    // Each + creates a new string object on the heap
    debugText.text = "Score: " + score + " HP: " + health;
}

// GOOD: Use StringBuilder or interpolated string handlers (C# 10+)
private readonly StringBuilder _sb = new StringBuilder(64);

void Update()
{
    _sb.Clear();
    _sb.Append("Score: ").Append(score).Append(" HP: ").Append(health);
    debugText.text = _sb.ToString();
}

// WHY StringBuilder: It reuses its internal char[] buffer, so repeated
// Clear() + Append() calls produce zero heap allocations once warmed up.
// The initial capacity (64) avoids resizing for typical UI strings.
```

```csharp
// BAD: LINQ in hot paths — every LINQ method allocates iterator objects
var enemies = allEntities.Where(e => e.IsEnemy).ToList();

// GOOD: Manual loop with a pre-allocated list
private readonly List<Entity> _enemyCache = new List<Entity>(64);

void FindEnemies()
{
    _enemyCache.Clear();
    for (int i = 0; i < allEntities.Count; i++)
    {
        if (allEntities[i].IsEnemy)
            _enemyCache.Add(allEntities[i]);
    }
}

// WHY avoid LINQ in Update: Where() allocates an iterator, ToList()
// allocates a new List. In a 60fps game that's 120 allocations/second
// from just this one call. Manual loops with cached lists: zero allocs.
```

```csharp
// BAD: Boxing value types
object boxed = 42; // int → object = heap allocation

// BAD: foreach on non-generic collections (boxes enumerator)
ArrayList old = GetLegacyList();
foreach (var item in old) { } // Enumerator boxed each iteration

// GOOD: Use generic collections — List<T>, Dictionary<TKey, TValue>
// Their enumerators are structs and don't allocate.
```

---

## Object Pooling with ObjectPool\<T\>

Unity provides a built-in pooling API in `UnityEngine.Pool`. Use it instead of rolling your own.

```csharp
using UnityEngine;
using UnityEngine.Pool;

public class ProjectileSpawner : MonoBehaviour
{
    [SerializeField] private Projectile prefab;
    
    // WHY IObjectPool interface: Allows swapping LinkedPool/ObjectPool
    // without changing consumer code. ObjectPool uses a Stack internally
    // (fast, array-backed). LinkedPool uses a linked list (no max capacity
    // array resize, but more pointer chasing — choose based on your needs).
    private IObjectPool<Projectile> _pool;
    
    void Awake()
    {
        _pool = new ObjectPool<Projectile>(
            createFunc:      () => Instantiate(prefab),
            actionOnGet:     proj => proj.gameObject.SetActive(true),
            actionOnRelease: proj => proj.gameObject.SetActive(false),
            actionOnDestroy: proj => Destroy(proj.gameObject),
            collectionCheck: false,  // skip duplicate-release check in builds
            defaultCapacity: 20,     // pre-size the internal stack
            maxSize:         100     // hard cap — excess released objects get destroyed
        );
    }
    
    public Projectile Spawn(Vector3 position, Quaternion rotation)
    {
        // WHY pool.Get() instead of Instantiate: Instantiate triggers
        // native memory allocation + C# object construction + Awake().
        // Pool.Get() just calls SetActive(true) — orders of magnitude faster.
        var proj = _pool.Get();
        proj.transform.SetPositionAndRotation(position, rotation);
        proj.Initialize(_pool); // pass pool ref so projectile can self-return
        return proj;
    }
}

public class Projectile : MonoBehaviour
{
    private IObjectPool<Projectile> _pool;
    
    public void Initialize(IObjectPool<Projectile> pool)
    {
        _pool = pool;
    }
    
    void OnBecameInvisible()
    {
        // WHY return here: Off-screen projectiles are prime candidates
        // for recycling. This avoids manual lifetime tracking.
        _pool.Release(this);
    }
}
```

### Collection Pools

For temporary lists, use `CollectionPool` to avoid allocating new `List<T>` instances:

```csharp
using UnityEngine.Pool;

void ProcessOverlaps()
{
    // WHY CollectionPool: Physics queries often need a temporary list.
    // Allocating a new List<Collider> every physics tick is wasteful.
    var results = CollectionPool<List<Collider>, Collider>.Get();
    
    Physics.OverlapSphereNonAlloc(transform.position, 5f, _colliderBuffer);
    // ... process results ...
    
    CollectionPool<List<Collider>, Collider>.Release(results);
}
```

---

## Native Containers & Burst Jobs

For performance-critical systems, move data out of managed memory entirely using `NativeArray<T>` and the Job System with Burst compilation.

```csharp
using Unity.Collections;
using Unity.Jobs;
using Unity.Burst;
using Unity.Mathematics;

// WHY BurstCompile: The Burst compiler translates C# (HPC#) into highly
// optimized SIMD machine code. A Burst-compiled job can be 10-100x faster
// than equivalent managed C# for math-heavy work like spatial queries.
[BurstCompile]
public struct BoidUpdateJob : IJobParallelFor
{
    [ReadOnly] public NativeArray<float3> Positions;
    [ReadOnly] public NativeArray<float3> Velocities;
    public NativeArray<float3> NewVelocities;
    public float NeighborRadius;
    public float DeltaTime;
    
    public void Execute(int index)
    {
        float3 separation = float3.zero;
        float3 alignment = float3.zero;
        float3 cohesion = float3.zero;
        int neighborCount = 0;
        
        for (int i = 0; i < Positions.Length; i++)
        {
            if (i == index) continue;
            float dist = math.distance(Positions[index], Positions[i]);
            if (dist < NeighborRadius)
            {
                separation += (Positions[index] - Positions[i]) / dist;
                alignment += Velocities[i];
                cohesion += Positions[i];
                neighborCount++;
            }
        }
        
        if (neighborCount > 0)
        {
            alignment /= neighborCount;
            cohesion = (cohesion / neighborCount) - Positions[index];
        }
        
        NewVelocities[index] = math.normalize(
            Velocities[index] + separation + alignment * 0.5f + cohesion * 0.3f
        ) * math.length(Velocities[index]);
    }
}

// Scheduling the job
public class BoidManager : MonoBehaviour
{
    private NativeArray<float3> _positions;
    private NativeArray<float3> _velocities;
    private NativeArray<float3> _newVelocities;
    
    void OnEnable()
    {
        // WHY Allocator.Persistent: This array lives across frames.
        // Use Allocator.TempJob for single-frame jobs, Allocator.Temp
        // for within-a-method allocations (fastest, auto-disposed).
        _positions = new NativeArray<float3>(1000, Allocator.Persistent);
        _velocities = new NativeArray<float3>(1000, Allocator.Persistent);
        _newVelocities = new NativeArray<float3>(1000, Allocator.Persistent);
    }
    
    void Update()
    {
        var job = new BoidUpdateJob
        {
            Positions = _positions,
            Velocities = _velocities,
            NewVelocities = _newVelocities,
            NeighborRadius = 5f,
            DeltaTime = Time.deltaTime
        };
        
        // WHY innerloopBatchCount = 64: Controls how many Execute() calls
        // each worker thread processes in a batch. 64 balances parallelism
        // vs. job scheduling overhead for typical boid counts.
        JobHandle handle = job.Schedule(_positions.Length, 64);
        handle.Complete(); // block until done — or use JobHandle dependencies
    }
    
    void OnDisable()
    {
        // WHY explicit Dispose: NativeArrays are NOT garbage collected.
        // Forgetting this leaks native memory. Unity logs a warning in
        // development builds but silently leaks in release builds.
        _positions.Dispose();
        _velocities.Dispose();
        _newVelocities.Dispose();
    }
}
```

---

## Asset Memory Optimization

### Texture Compression

Textures are typically the largest memory consumer. Choose the right format per platform:

| Platform | Recommended Format | Why |
|----------|-------------------|-----|
| Desktop (PC/Mac) | **BC7** (DXT) | Best quality-per-bit for desktop GPUs |
| Android | **ASTC 6×6** | Wide device support, good quality/size tradeoff |
| iOS | **ASTC 4×4** | Apple GPUs handle ASTC natively |
| Switch | **ASTC 4×4** | Native hardware decompression |
| Low-end mobile | **ETC2** | Fallback for devices without ASTC |

```
Texture Importer Settings:
  Max Size: Match target display resolution
    • 4K textures on a 1080p screen waste ~75% of GPU memory
    • Rule of thumb: texture resolution ≤ 2× the screen pixels it covers
    
  Generate Mip Maps: ☑ (for 3D assets)
    WHY: Mipmaps add ~33% memory but prevent texture shimmer at distance
    and actually improve GPU cache performance for distant objects.
    
  Read/Write Enabled: ☐ (disabled unless modifying at runtime)
    WHY: Enabling this doubles memory — Unity keeps a CPU-side copy
    alongside the GPU copy.
```

### Shader Variant Stripping

Shader variants are a hidden memory and build-size killer. Unity generates variants for every keyword combination.

```csharp
using UnityEditor.Build;
using UnityEditor.Rendering;
using System.Collections.Generic;
using System.Linq;

// WHY strip variants: A single shader with 10 keywords can produce
// 1024 variants (2^10). Most are never used. Stripping unused variants
// reduces build size, loading time, and runtime memory.
public class ShaderVariantStripper : IPreprocessShaders
{
    // Keywords for features your game definitely does not use
    private static readonly ShaderKeyword[] StripKeywords = new[]
    {
        new ShaderKeyword("POINT_COOKIE"),
        new ShaderKeyword("DIRECTIONAL_COOKIE"),
        new ShaderKeyword("_SMOOTHNESS_TEXTURE_ALBEDO_CHANNEL_A"),
    };
    
    public int callbackOrder => 0;
    
    public void OnProcessShader(
        Shader shader, ShaderSnippetData snippet,
        IList<ShaderCompilerData> data)
    {
        for (int i = data.Count - 1; i >= 0; i--)
        {
            if (StripKeywords.Any(kw => data[i].shaderKeywordSet.IsEnabled(kw)))
            {
                data.RemoveAt(i);
            }
        }
    }
}
```

### Addressables Memory Pattern

```csharp
using UnityEngine;
using UnityEngine.AddressableAssets;
using UnityEngine.ResourceManagement.AsyncOperations;

public class LevelLoader : MonoBehaviour
{
    [SerializeField] private AssetReference levelPrefab;
    private AsyncOperationHandle<GameObject> _handle;
    
    public async void LoadLevel()
    {
        // WHY Addressables over Resources.Load: The Resources folder loads
        // ALL assets into memory at startup. Addressables load on-demand
        // and can be unloaded individually, giving you fine-grained control.
        _handle = levelPrefab.LoadAssetAsync<GameObject>();
        await _handle.Task;
        
        if (_handle.Status == AsyncOperationStatus.Succeeded)
        {
            Instantiate(_handle.Result);
        }
    }
    
    public void UnloadLevel()
    {
        // WHY explicit release: Addressable handles hold a reference count.
        // Without Release, the asset stays in memory even after Destroy().
        Addressables.Release(_handle);
    }
}
```

---

## CPU Performance Patterns

### Avoid Expensive Per-Frame Operations

```csharp
// BAD: GetComponent every frame — involves a native→managed bridge call
void Update()
{
    var rb = GetComponent<Rigidbody>(); // ~1μs per call (adds up at scale)
    rb.AddForce(Vector3.up);
}

// GOOD: Cache in Awake
private Rigidbody _rb;
void Awake() => _rb = GetComponent<Rigidbody>();
void Update() => _rb.AddForce(Vector3.up);
```

```csharp
// BAD: Find by string every frame
void Update()
{
    var player = GameObject.Find("Player"); // O(n) scene scan
}

// GOOD: Cache reference, or use events/dependency injection
```

```csharp
// BAD: Camera.main accesses FindGameObjectWithTag internally
void Update()
{
    transform.LookAt(Camera.main.transform); // hidden Find call
}

// GOOD: Cache Camera.main (fixed in Unity 2020+ to be cached internally,
// but still good practice for clarity)
private Camera _mainCam;
void Start() => _mainCam = Camera.main;
void Update() => transform.LookAt(_mainCam.transform);
```

### Stagger Heavy Work

```csharp
// WHY stagger: If 100 enemies all run expensive AI logic on the same frame,
// you get a spike. Spreading work across frames keeps frame times consistent.
private int _updateIndex;
private List<EnemyAI> _enemies;

void Update()
{
    // Process 10 enemies per frame instead of all at once
    int batchSize = Mathf.Min(10, _enemies.Count);
    for (int i = 0; i < batchSize; i++)
    {
        int idx = (_updateIndex + i) % _enemies.Count;
        _enemies[idx].RunAITick();
    }
    _updateIndex = (_updateIndex + batchSize) % _enemies.Count;
}
```

---

## Profiling on Target Hardware

**Always profile on the actual target device.** Editor profiling includes overhead from editor systems (scene view, inspector) that doesn't exist in builds.

### Quick Profiling Workflow

```
1. Build Settings:
   ☑ Development Build
   ☑ Autoconnect Profiler
   
2. Build and deploy to target device

3. In Unity Editor:
   Window → Analysis → Profiler
   The profiler auto-connects to the running build

4. Key metrics to watch:
   • Frame time > 16.6ms (for 60fps target) — identify which system
   • GC.Alloc column in CPU module — any allocation in gameplay = investigate
   • Memory module → GC Used Memory trending upward = leak candidate
```

### Memory Profiler Snapshot Workflow

```
1. Install: Package Manager → Memory Profiler

2. Take snapshots at key moments:
   • After main menu loads (baseline)
   • Mid-gameplay (steady state)
   • After returning to main menu (should match baseline)
   
3. Compare Mode: Diff two snapshots
   • Growing "Unity Objects" = asset leak (missing Destroy/Release)
   • Growing "Managed Objects" = C# reference leak (static refs, events)
   
4. Look for "Leaked Managed Shell" in All Of Memory tab
   • These are C# wrappers for destroyed native objects
   • Cause: holding a reference to a destroyed GameObject
```

### Memory Budget Guidelines

| Platform | Typical Budget | Notes |
|----------|---------------|-------|
| Mobile (low-end) | 200–400 MB total | Aim for < 150 MB textures |
| Mobile (high-end) | 400–800 MB total | iOS kills apps > 1.5 GB |
| Console (Switch) | ~3 GB usable | Shared CPU/GPU memory |
| Desktop | 2–4 GB typical | More headroom but don't waste it |

---

## Memory Leak Detection Checklist

1. **Static references** — Static fields with `DontDestroyOnLoad` objects prevent entire reference chains from being collected. Clear statics on scene unload.

2. **Event subscriptions** — `SomeEvent += OnHandler` without a matching `-=` keeps the subscriber alive. Use `OnDestroy()` to unsubscribe.

3. **Coroutine captures** — Coroutines capture `this` in their closure. A running coroutine keeps its MonoBehaviour (and its GameObject) alive.

4. **Addressable handles** — Every `LoadAssetAsync` needs a matching `Release`. Use `Addressables.Release(handle)` when done.

5. **NativeContainers** — `NativeArray`, `NativeList`, etc. must be manually `Dispose()`d. Enable leak detection in **Preferences → Jobs** during development.

```
Memory change across a gameplay loop:
  < 20 MB growth = normal fragmentation (acceptable)
  > 100 MB growth = probable leak (investigate)
```

---

## Quick Reference: Optimization Priority Order

```
1. Profile first — never optimize blind
2. Reduce GC allocations — biggest bang for buck
3. Pool frequently spawned objects — ObjectPool<T>
4. Compress textures appropriately per platform
5. Strip unused shader variants
6. Use Addressables instead of Resources
7. Move hot paths to Burst jobs for 10-100× speedup
8. Stagger heavy work across frames
9. Cache component references — avoid per-frame lookups
10. Disable Read/Write on textures and meshes you don't modify
```
