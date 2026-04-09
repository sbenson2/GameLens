# G11 — Debugging and Profiling

> **Category:** guide · **Engine:** Unity 6 (6000.x) · **Related:** [E1 Architecture Overview](../architecture/E1_architecture_overview.md) · [G10 Rendering Pipeline](G10_rendering_pipeline_urp_hdrp.md) · [R1 Capability Matrix](../reference/R1_capability_matrix.md)

Unity 6 ships a comprehensive profiling toolkit for diagnosing CPU, GPU, and memory performance issues. This guide covers the core tools — Unity Profiler, Memory Profiler, Frame Debugger, and Profile Analyzer — along with practical workflows for finding and fixing bottlenecks in your game.

---

## The Profiling Toolkit at a Glance

```
┌─────────────────────────────────────────────────────────────┐
│                    Unity 6 Profiling Tools                    │
│                                                               │
│  ┌──────────────┐  ┌────────────────┐  ┌──────────────────┐ │
│  │ Unity Profiler│  │ Memory Profiler│  │  Frame Debugger  │ │
│  │ CPU / GPU /   │  │ Heap snapshots │  │  Draw call       │ │
│  │ Audio / Physics│ │ Object refs    │  │  inspection      │ │
│  └──────┬───────┘  └───────┬────────┘  └────────┬─────────┘ │
│         │                  │                     │           │
│  ┌──────▼──────────────────▼─────────────────────▼────────┐  │
│  │  Profile Analyzer — Compare two captures side by side   │ │
│  └─────────────────────────────────────────────────────────┘ │
│                                                               │
│  ┌──────────────────────────────────────────────────────────┐│
│  │  Project Auditor — Static analysis of code & settings    ││
│  └──────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────┘
```

---

## Unity Profiler

The Profiler is your first stop for performance investigation. It records per-frame timing data across CPU, GPU, rendering, audio, physics, and UI.

### Opening the Profiler

**Window → Analysis → Profiler** (or `Ctrl+7` / `Cmd+7`).

### Profiling on Target Devices

Editor profiling introduces overhead from editor systems (scene view, inspector repaints). For accurate numbers, always profile on target hardware.

```
Build Settings → Check these two boxes:
  ☑ Development Build      — Includes profiling instrumentation
  ☑ Autoconnect Profiler   — Profiler connects to the build automatically

WHY development build? Release builds strip profiling hooks for performance.
The dev build adds ~1-3% overhead, which is acceptable for profiling but
means you should also test final release builds for shipping perf targets.
```

### Key Profiler Modules

**CPU Usage** — Shows per-frame time broken down by system: scripts, rendering, physics, animation, GC. The hierarchy view lets you drill into individual method calls.

**GPU Usage** — Displays GPU-side timing. Requires platform support (not available on all devices). Shows draw calls, shader time, and post-processing costs.

**Memory** — Quick overview of total memory, texture memory, mesh memory, and GC allocations. For deep dives, use the standalone Memory Profiler (below).

**Rendering** — Draw calls, triangles, vertices, set-pass calls. The SRP Batcher panel shows batching efficiency.

### Profiler Markers (Custom Instrumentation)

Add custom markers to identify your code's cost in the Profiler timeline.

```csharp
using Unity.Profiling;

public class EnemyAISystem : MonoBehaviour
{
    // WHY a static ProfilerMarker? Creating markers is an allocation.
    // Static ensures it happens once, not per-frame. The string name
    // appears in the Profiler's hierarchy view for easy identification.
    static readonly ProfilerMarker s_UpdateAI =
        new ProfilerMarker("EnemyAI.UpdateBehavior");

    static readonly ProfilerMarker s_Pathfinding =
        new ProfilerMarker("EnemyAI.Pathfinding");

    void Update()
    {
        // Auto() returns a disposable that calls End() automatically,
        // even if an exception is thrown. WHY using() instead of
        // manual Begin/End? It's impossible to forget the End() call,
        // which would corrupt the Profiler's timing data.
        using (s_UpdateAI.Auto())
        {
            EvaluateBehaviorTree();

            using (s_Pathfinding.Auto())
            {
                RecalculatePath();
            }
        }
    }
}
```

### ProfilerRecorder for In-Game Metrics

Display performance metrics in a debug overlay using `ProfilerRecorder`.

```csharp
using Unity.Profiling;
using UnityEngine;

public class PerformanceOverlay : MonoBehaviour
{
    // ProfilerRecorder captures Unity's internal counters without
    // the Profiler window open. WHY use this over Time.deltaTime?
    // It gives you access to internal engine metrics (draw calls,
    // triangle count, GC alloc) that Time.deltaTime can't provide.
    ProfilerRecorder _drawCallsRecorder;
    ProfilerRecorder _trianglesRecorder;
    ProfilerRecorder _gcAllocRecorder;

    void OnEnable()
    {
        // Start recording specific stats. The string names match
        // Unity's internal stat categories.
        _drawCallsRecorder = ProfilerRecorder.StartNew(
            ProfilerCategory.Render, "Draw Calls Count");
        _trianglesRecorder = ProfilerRecorder.StartNew(
            ProfilerCategory.Render, "Triangles Count");
        _gcAllocRecorder = ProfilerRecorder.StartNew(
            ProfilerCategory.Memory, "GC Allocated In Frame");
    }

    void OnDisable()
    {
        // WHY dispose? ProfilerRecorders are native resources —
        // GC won't clean them up, and leaked recorders keep
        // consuming CPU cycles for stats collection.
        _drawCallsRecorder.Dispose();
        _trianglesRecorder.Dispose();
        _gcAllocRecorder.Dispose();
    }

    void OnGUI()
    {
        GUI.Label(new Rect(10, 10, 300, 20),
            $"Draw Calls: {_drawCallsRecorder.LastValue}");
        GUI.Label(new Rect(10, 30, 300, 20),
            $"Triangles: {_trianglesRecorder.LastValue}");
        GUI.Label(new Rect(10, 50, 300, 20),
            $"GC Alloc: {_gcAllocRecorder.LastValue / 1024} KB");
    }
}
```

---

## Memory Profiler

Install via **Package Manager → Memory Profiler**. This tool takes detailed heap snapshots showing every managed and native object, their sizes, and reference chains.

### Workflow: Finding Memory Leaks

1. **Take a snapshot** at a known baseline (e.g., main menu)
2. **Play through** the suspected leaky area (e.g., load/unload a level)
3. **Return to baseline** and take a second snapshot
4. **Compare snapshots** — objects present in snapshot 2 but not in 1 are potential leaks

### Common Memory Issues

| Symptom | Likely Cause | Fix |
|---|---|---|
| Memory grows each scene load | Unreleased assets (textures, AudioClips) | Call `Resources.UnloadUnusedAssets()` after scene transitions, or use Addressables with proper release |
| Frequent GC spikes | Per-frame allocations (string concat, LINQ, closures) | Cache results, use `StringBuilder`, avoid LINQ in hot paths |
| Large texture memory | Uncompressed or oversized textures | Set platform-specific compression in texture import settings |
| Duplicate assets | Same asset loaded from different paths | Centralize asset loading through Addressables |

---

## Frame Debugger

**Window → Analysis → Frame Debugger**. Steps through every draw call in a single frame, showing what was rendered, which shader was used, and what state was set.

### When to Use Frame Debugger

- **Overdraw investigation** — see how many times each pixel is drawn
- **Batching analysis** — why did the SRP Batcher break a batch?
- **Shader debugging** — verify the correct shader variant is selected
- **UI draw calls** — UI Toolkit and Canvas often generate more draws than expected

---

## Profile Analyzer

Install via **Package Manager → Profile Analyzer**. It imports Profiler capture files and provides statistical analysis across hundreds of frames.

### Workflow: Before/After Optimization

1. Capture 300+ frames of gameplay with the Profiler
2. Save the `.data` file
3. Make your optimization changes
4. Capture another 300+ frames under identical conditions
5. Load both captures in Profile Analyzer's **Compare** view
6. Sort by median time to see which methods improved or regressed

---

## Project Auditor

**Window → Analysis → Project Auditor**. Performs static analysis on your project without running it.

### What It Catches

- **Code issues** — empty `Update()` methods (still have overhead), string allocations in hot paths, missing `[SerializeField]` on private fields used in inspector
- **Settings issues** — Physics layers that collide unnecessarily, disabled GPU instancing on materials that would benefit from it
- **Asset issues** — Textures without compression, meshes with excessive polygon counts

---

## Performance Debugging Workflow

A systematic approach to finding bottlenecks:

```
Step 1: Is it CPU or GPU bound?
───────────────────────────────
  Profiler → CPU Usage module
  If "WaitForTargetFPS" or "Gfx.WaitForPresent" is large → CPU has
  spare time → you're GPU-bound.
  If frame time is mostly scripts/physics/animation → CPU-bound.

Step 2: CPU-bound — which system?
───────────────────────────────
  Profiler hierarchy view → sort by Self time
  Common culprits:
  • Physics.Simulate  → reduce rigidbodies, simplify colliders
  • Scripts           → optimize Update(), reduce GetComponent calls
  • Animation         → use Animator culling, reduce bone count
  • GarbageCollector  → eliminate per-frame allocations

Step 3: GPU-bound — which stage?
───────────────────────────────
  Frame Debugger → count draw calls
  Rendering Profiler → check fill rate vs vertex processing
  Common culprits:
  • Too many draw calls   → enable SRP Batcher, GPU instancing
  • Overdraw              → reduce transparent objects, use LODs
  • Expensive shaders     → simplify materials, reduce texture samples
  • Post-processing       → profile each effect, disable unnecessary ones

Step 4: Memory issues?
───────────────────────────────
  Memory Profiler → take snapshots
  Look for: growing heap, duplicate assets, large uncompressed textures
```

---

## Common Optimization Patterns

### Avoid Per-Frame Allocations

```csharp
// BAD — allocates a new array every frame, triggering GC
void Update()
{
    var enemies = FindObjectsOfType<Enemy>();
    foreach (var e in enemies) { /* ... */ }
}

// GOOD — cache the list and reuse it.
// WHY? Each allocation eventually triggers garbage collection,
// which causes frame hitches (often 1-5ms on mobile).
private readonly List<Enemy> _enemyCache = new();

void Update()
{
    _enemyCache.Clear();
    // Use a pre-registered list or event-driven approach instead
    EnemyManager.GetActiveEnemies(_enemyCache);
    foreach (var e in _enemyCache) { /* ... */ }
}
```

### Cache Component References

```csharp
// BAD — GetComponent searches the GameObject's component list every call.
void Update()
{
    GetComponent<Rigidbody>().AddForce(Vector3.up);
}

// GOOD — cache in Awake(). WHY Awake and not Start?
// Awake runs before Start, so other scripts that reference
// this component in their Start() will find it ready.
private Rigidbody _rb;

void Awake()
{
    _rb = GetComponent<Rigidbody>();
}

void Update()
{
    _rb.AddForce(Vector3.up);
}
```

### Object Pooling

```csharp
using UnityEngine;
using UnityEngine.Pool;

public class BulletSpawner : MonoBehaviour
{
    [SerializeField] private GameObject bulletPrefab;

    // WHY ObjectPool? Instantiate/Destroy are expensive operations
    // that cause GC pressure and frame spikes. Pooling reuses objects
    // instead of creating/destroying them, which is critical for
    // frequently spawned objects like bullets, particles, and VFX.
    private ObjectPool<GameObject> _pool;

    void Awake()
    {
        _pool = new ObjectPool<GameObject>(
            createFunc: () => Instantiate(bulletPrefab),
            actionOnGet: obj => obj.SetActive(true),
            actionOnRelease: obj => obj.SetActive(false),
            actionOnDestroy: obj => Destroy(obj),
            defaultCapacity: 20,
            maxSize: 100
        );
    }

    public GameObject SpawnBullet()
    {
        return _pool.Get();
    }

    public void ReturnBullet(GameObject bullet)
    {
        _pool.Release(bullet);
    }
}
```

---

## Further Reading

- [E1 Architecture Overview](../architecture/E1_architecture_overview.md) — How Unity's subsystems interact
- [G10 Rendering Pipeline](G10_rendering_pipeline_urp_hdrp.md) — URP/HDRP rendering details for GPU profiling context
- Unity Docs: [Unity Profiler](https://docs.unity3d.com/6000.1/Documentation/Manual/Profiler.html)
- Unity Guide: [Ultimate Guide to Profiling Unity Games (Unity 6)](https://unity.com/resources/ultimate-guide-to-profiling-unity-games-unity-6)
- Unity Docs: [Profile Analyzer](https://unity.com/how-to/optimize-your-game-unity-profile-analyzer)
