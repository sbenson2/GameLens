# G42 — Burst Compiler & C# Jobs System Deep Dive

> **Category:** guide · **Engine:** Unity 6 (6000.x, Burst 1.8+, Collections 2.x) · **Related:** [G13 ECS & DOTS](G13_ecs_dots.md) · [G16 Performance Optimization](G16_performance_optimization_memory.md) · [G33 Object Pooling](G33_object_pooling.md) · [Unity Rules](../unity-arch-rules.md)

The **Burst Compiler** and **C# Job System** are the performance foundation of Unity's Data-Oriented Technology Stack (DOTS). While G13 covers ECS holistically, this guide focuses specifically on getting the most out of Burst and Jobs — including direct-call compilation outside of ECS, advanced job types, native collections, SIMD intrinsics, and profiling techniques. Everything here targets **Burst 1.8+** shipping with Unity 6.

---

## How Burst Works

Burst is not a JIT upgrade — it is a **full ahead-of-time (AOT) and just-in-time (JIT) compiler** that translates IL/.NET bytecode into highly optimized native code via the LLVM compiler backend. The key differences from Mono/IL2CPP:

```
Standard C# Pipeline:           Burst Pipeline:
─────────────────────           ───────────────
C# → IL → Mono JIT → x86       C# → IL → Burst → LLVM IR → SIMD-optimized native
     (generic codegen)               (auto-vectorization, loop unrolling, SoA transforms)
```

Burst achieves 5–50× speedups over Mono by:
1. **Auto-vectorization** — detecting loops that can use SIMD (SSE4/AVX2/NEON) without manual intrinsics
2. **Eliminating GC** — Burst code cannot allocate managed memory; all data uses NativeContainers
3. **Aggressive inlining** — small methods are inlined across call boundaries
4. **Alias analysis** — proving that pointers don't overlap enables reordering and loop fusion

---

## Burst Entry Points

### 1. Jobs (The Classic Path)

Any job struct marked with `[BurstCompile]` is compiled by Burst automatically:

```csharp
using Unity.Burst;
using Unity.Collections;
using Unity.Jobs;
using Unity.Mathematics;

// WHY: [BurstCompile] tells Burst to compile this job's Execute() method
// into optimized native code. Without it, the job runs on Mono/IL2CPP.
[BurstCompile]
public struct ApplyGravityJob : IJobParallelFor
{
    // WHY: NativeArray is a contiguous, cache-friendly buffer that Burst
    // can auto-vectorize over. Regular C# arrays are managed and invisible to Burst.
    public NativeArray<float3> Velocities;

    // WHY: [ReadOnly] tells the safety system this data won't be written,
    // allowing multiple jobs to read it concurrently without race conditions.
    [ReadOnly] public float DeltaTime;
    [ReadOnly] public float3 Gravity;

    public void Execute(int index)
    {
        // WHY: Unity.Mathematics.float3 maps directly to SIMD registers.
        // UnityEngine.Vector3 would require marshalling and prevents vectorization.
        Velocities[index] += Gravity * DeltaTime;
    }
}
```

### 2. Direct Call — Burst Without Jobs (Burst 1.8+)

Since Burst 1.8, you can Burst-compile **static methods on regular classes/structs** — no job required. This is called the **direct call** pattern:

```csharp
using Unity.Burst;
using Unity.Collections;
using Unity.Mathematics;

// WHY: [BurstCompile] on the containing type is REQUIRED for direct call.
// Burst needs it to discover the static methods inside.
[BurstCompile]
public static class MathUtils
{
    // WHY: [BurstCompile] on the method itself marks it as a Burst entry point.
    // At runtime, Burst patches the call site to jump directly to native code.
    [BurstCompile]
    public static float SumArray(ref NativeArray<float> values)
    {
        float sum = 0f;
        for (int i = 0; i < values.Length; i++)
        {
            sum += values[i];
        }
        return sum;
    }
}

// Usage from MonoBehaviour — the call transparently executes Burst-compiled code
void Update()
{
    float total = MathUtils.SumArray(ref _dataArray);
}
```

**When to use direct call vs. jobs:**

| Scenario | Use |
|----------|-----|
| Parallelizable work over large arrays | `IJobParallelFor` + Burst |
| Single-threaded hot-path function | Direct call |
| Need to call from main thread immediately | Direct call |
| Background computation that can be deferred | Jobs (Schedule + Complete) |

### 3. Function Pointers — Dynamic Dispatch with Burst

For cases where you need runtime-selected compiled code (e.g., strategy pattern):

```csharp
using Unity.Burst;

// WHY: Function pointers let you call different Burst-compiled methods
// at runtime without losing native performance. Useful for pluggable
// algorithms like damage formulas or AI evaluation functions.
[BurstCompile]
public static class DamageFormulas
{
    // WHY: MonoPInvokeCallback is required for AOT platforms (iOS, consoles)
    // where Burst must know the signature at compile time.
    [BurstCompile(CompileSynchronously = true)]
    [AOT.MonoPInvokeCallback(typeof(DamageDelegate))]
    public static float LinearDamage(float baseDmg, float armor)
    {
        return math.max(0f, baseDmg - armor);
    }

    [BurstCompile(CompileSynchronously = true)]
    [AOT.MonoPInvokeCallback(typeof(DamageDelegate))]
    public static float PercentDamage(float baseDmg, float armor)
    {
        return baseDmg * (100f / (100f + armor));
    }

    public delegate float DamageDelegate(float baseDmg, float armor);

    // WHY: FunctionPointer<T> wraps a Burst-compiled native function pointer.
    // Store it once, invoke it thousands of times per frame with zero overhead.
    public static readonly FunctionPointer<DamageDelegate> Linear =
        BurstCompiler.CompileFunctionPointer<DamageDelegate>(LinearDamage);

    public static readonly FunctionPointer<DamageDelegate> Percent =
        BurstCompiler.CompileFunctionPointer<DamageDelegate>(PercentDamage);
}
```

---

## Job Types Reference

Unity provides several job interfaces, each suited to different access patterns:

| Job Type | Use Case | Parallelism |
|----------|----------|-------------|
| `IJob` | Single unit of work on a worker thread | 1 thread |
| `IJobParallelFor` | Same operation on each element of an array | N threads (auto-split) |
| `IJobFor` | Like IJobParallelFor but can run single-threaded via `Run()` | 1 or N threads |
| `IJobParallelForTransform` | Modify Transform data in parallel (hybrid ECS bridge) | N threads |
| `IJobEntity` (Entities pkg) | ECS query-based iteration with source generation | N threads |

### Scheduling and Completing Jobs

```csharp
using Unity.Jobs;
using Unity.Collections;

public class EnemySimulation : MonoBehaviour
{
    private NativeArray<float3> _positions;
    private NativeArray<float3> _velocities;
    private JobHandle _moveHandle;

    void Update()
    {
        // WHY: Schedule() returns immediately — the job runs on a worker thread.
        // The main thread is free to do other work (UI, input, etc.).
        var moveJob = new MoveEntitiesJob
        {
            Positions = _positions,
            Velocities = _velocities,
            DeltaTime = Time.deltaTime
        };
        _moveHandle = moveJob.Schedule(_positions.Length, 64);
        // 64 = batch size — each worker thread processes 64 elements at a time.
        // WHY: Smaller batches = better load balancing but more scheduling overhead.
        // 32–128 is typical; profile to find the sweet spot for your workload.
    }

    void LateUpdate()
    {
        // WHY: Complete() blocks the main thread until the job finishes.
        // Call it as late as possible to maximize parallel overlap.
        _moveHandle.Complete();
        // Now safe to read _positions on the main thread
    }

    void OnDestroy()
    {
        // WHY: NativeContainers are unmanaged memory — you MUST Dispose them
        // or you get a native memory leak. The safety system logs warnings in Editor.
        _positions.Dispose();
        _velocities.Dispose();
    }
}

[BurstCompile]
public struct MoveEntitiesJob : IJobParallelFor
{
    public NativeArray<float3> Positions;
    [ReadOnly] public NativeArray<float3> Velocities;
    [ReadOnly] public float DeltaTime;

    public void Execute(int index)
    {
        Positions[index] += Velocities[index] * DeltaTime;
    }
}
```

### Job Dependencies — Chaining Without Blocking

```csharp
// WHY: Pass the handle from one job as a dependency to the next.
// This lets the Job System execute them in order on worker threads
// WITHOUT blocking the main thread between them.
var moveHandle = moveJob.Schedule(count, 64);
var boundsHandle = boundsJob.Schedule(count, 64, moveHandle); // waits for move
var cullingHandle = cullingJob.Schedule(count, 64, boundsHandle); // waits for bounds

// Only block the main thread once, at the end
cullingHandle.Complete();
```

---

## Native Collections Reference

All Burst-compatible containers live in the `Unity.Collections` package:

| Container | Description | Burst-Safe |
|-----------|-------------|------------|
| `NativeArray<T>` | Fixed-size contiguous array | ✅ |
| `NativeList<T>` | Resizable list | ✅ |
| `NativeHashMap<K,V>` | Unordered key-value store | ✅ |
| `NativeHashSet<T>` | Unordered unique values | ✅ |
| `NativeQueue<T>` | FIFO queue | ✅ |
| `NativeMultiHashMap<K,V>` | Key to multiple values | ✅ |
| `NativeReference<T>` | Single-value container (replaces NativeArray of length 1) | ✅ |
| `NativeText` | UTF-8 mutable string | ✅ |
| `NativeParallelHashMap<K,V>` | Concurrent writes from parallel jobs | ✅ |

### Allocator Lifetimes

```csharp
// WHY: The allocator determines when memory is freed.
// Choose the shortest lifetime that fits your use case.

// Temp — freed automatically at end of frame. Fastest allocation.
// Use for: within a single method, same-frame calculations
var scratch = new NativeArray<float>(256, Allocator.Temp);

// TempJob — must be freed within 4 frames. Moderate overhead.
// Use for: jobs scheduled this frame and completed within a few frames
var jobData = new NativeArray<float>(1024, Allocator.TempJob);

// Persistent — lives until you Dispose(). Full allocation overhead.
// Use for: data that persists across many frames (spatial grids, caches)
var longLived = new NativeArray<float>(4096, Allocator.Persistent);
```

---

## BurstCompile Configuration

### Float Precision and Mode

```csharp
// WHY: FloatMode.Fast allows Burst to reorder floating-point operations
// and use fused multiply-add (FMA) instructions. Results may differ by
// a few ULP but performance improves significantly.
[BurstCompile(FloatMode = FloatMode.Fast, FloatPrecision = FloatPrecision.Medium)]
public struct ParticlePhysicsJob : IJobParallelFor { /* ... */ }

// WHY: FloatMode.Deterministic guarantees identical results across all
// platforms (x86, ARM, etc). Essential for lockstep multiplayer.
// Trade-off: ~10-20% slower due to disabled platform-specific optimizations.
[BurstCompile(FloatMode = FloatMode.Deterministic)]
public struct DeterministicSimJob : IJobParallelFor { /* ... */ }
```

| FloatMode | When to Use |
|-----------|-------------|
| `Strict` (default) | Respects IEEE 754; safe but slower |
| `Fast` | Visual/physics where exact precision doesn't matter |
| `Deterministic` | Lockstep networking, replays, simulation verification |

### Disable Safety Checks (Release Only)

```csharp
// WHY: Safety checks validate NativeContainer access patterns at runtime
// (bounds, read/write, dispose tracking). They have measurable overhead.
// Disable ONLY after thorough testing — out-of-bounds writes will corrupt memory silently.
[BurstCompile(DisableSafetyChecks = true)]
public struct HotPathJob : IJobParallelFor { /* ... */ }
```

---

## Burst Restrictions — What You Can't Do

Burst operates on a **subset of C#** called High-Performance C# (HPC#). The following are NOT allowed inside `[BurstCompile]` code:

| Restriction | Why | Workaround |
|-------------|-----|------------|
| Managed allocations (`new object()`, `new List<T>()`) | Burst has no GC | Use NativeCollections |
| `string` operations | Strings are managed types | Use `FixedString64Bytes` or `NativeText` |
| `try/catch/finally` | Exceptions require managed runtime | Use return codes or error flags |
| Virtual methods / interfaces | Burst needs static dispatch | Use function pointers or direct calls |
| `UnityEngine.Debug.Log()` | Managed call | Use `Unity.Burst.Debug.Log()` (Burst 1.8+) |
| Class fields / reference types | Managed heap pointers | Use structs and NativeContainers only |
| LINQ | Allocates iterators | Write explicit loops |
| `async/await` | Managed state machine | Use jobs for async patterns |

### Fixed-Size Strings in Burst

```csharp
using Unity.Collections;

[BurstCompile]
public struct LoggingJob : IJob
{
    public FixedString128Bytes Message;

    public void Execute()
    {
        // WHY: FixedString is a stack-allocated, Burst-compatible string.
        // It stores UTF-8 bytes in a fixed-size buffer (32/64/128/512/4096 variants).
        var combined = new FixedString128Bytes();
        combined.Append((FixedString32Bytes)"Count: ");
        combined.Append(42);

        // WHY: Unity.Burst.Debug.Log works inside Burst code (1.8+).
        // It's stripped in release builds automatically.
        Unity.Burst.Debug.Log(combined);
    }
}
```

---

## SIMD Intrinsics — Manual Vectorization

When auto-vectorization isn't enough, Burst exposes CPU-level SIMD intrinsics through `Unity.Burst.Intrinsics`:

```csharp
using Unity.Burst;
using Unity.Burst.Intrinsics;
using static Unity.Burst.Intrinsics.X86;
using static Unity.Burst.Intrinsics.X86.Sse;
using static Unity.Burst.Intrinsics.X86.Sse2;

[BurstCompile]
public struct SimdDotProductJob : IJob
{
    public NativeArray<float> A;
    public NativeArray<float> B;
    public NativeArray<float> Result;

    public void Execute()
    {
        // WHY: Check CPU feature support at runtime. Burst compiles multiple
        // code paths and selects the best one for the current CPU.
        if (Sse.IsSseSupported)
        {
            // Process 4 floats at a time using 128-bit SSE registers
            var sum = Sse.set1_ps(0f);
            for (int i = 0; i + 3 < A.Length; i += 4)
            {
                // WHY: Load 4 consecutive floats into a SIMD register
                var a = Sse.loadu_ps(A.GetUnsafeReadOnlyPtr() + i);
                var b = Sse.loadu_ps(B.GetUnsafeReadOnlyPtr() + i);

                // WHY: mul_ps multiplies all 4 pairs simultaneously,
                // add_ps accumulates — doing 4 multiplies in one instruction cycle.
                sum = Sse.add_ps(sum, Sse.mul_ps(a, b));
            }
            // Horizontal sum of the 4 lanes
            // (scalar remainder loop omitted for brevity)
        }
    }
}
```

> **Tip:** Prefer `Unity.Mathematics` (`math.dot`, `math.mad`, `float4` operations) before reaching for raw intrinsics. Burst auto-vectorizes `math.*` calls in most cases. Only use intrinsics when the Burst Inspector shows suboptimal codegen.

---

## Profiling and Debugging Burst Code

### Burst Inspector

Access via **Jobs → Burst → Open Inspector** in the Unity Editor:

1. Select your job or Burst-compiled method from the left panel
2. View the generated assembly (x86, ARM) to verify vectorization
3. Look for `vaddps`, `vmulps` (AVX), `addps`, `mulps` (SSE) — these confirm SIMD is active
4. Check "Show Branch Flow" to identify unpredictable branches that hurt performance
5. Enable "Safety Checks → Force On" to debug container access issues

### Profiler Markers

```csharp
using Unity.Profiling;

// WHY: ProfilerMarker lets you measure Burst-compiled code in the Unity Profiler.
// It works inside jobs and adds minimal overhead (nanoseconds).
static readonly ProfilerMarker s_MarkerPathfinding = new ProfilerMarker("Pathfinding.AStar");

[BurstCompile]
public struct PathfindingJob : IJob
{
    public void Execute()
    {
        s_MarkerPathfinding.Begin();
        // ... pathfinding logic ...
        s_MarkerPathfinding.End();
    }
}
```

### Common Performance Pitfalls

| Symptom | Cause | Fix |
|---------|-------|-----|
| Job is scheduled but takes 0ms in Profiler | Burst compiled asynchronously — first run uses Mono fallback | Set `CompileSynchronously = true` during profiling (not shipping) |
| No SIMD instructions in Inspector | Loop has data dependency or branch | Restructure to remove loop-carried dependencies |
| Job spends time in "Complete" on main thread | Completing too early | Move `Complete()` to `LateUpdate()` or next frame |
| NativeArray access throws in Editor | Safety system detected race condition | Add `[ReadOnly]` or `[WriteOnly]` attributes correctly |
| Performance same with/without Burst | Data is too small for SIMD benefit | Batch more work per job; minimum ~1000 elements to see gains |

---

## Best Practices Checklist

1. **Use `Unity.Mathematics` types everywhere** — `float3`, `float4x4`, `quaternion`, `math.*` functions all map to SIMD
2. **Prefer `IJobParallelFor` over `IJob`** — let the scheduler split work across cores
3. **Set `[ReadOnly]` on all input NativeContainers** — enables concurrent scheduling
4. **Batch size 32–128 for `IJobParallelFor`** — too small wastes scheduling overhead, too large hurts load balancing
5. **Dispose every NativeContainer** — use `[DeallocateOnJobCompletion]` for fire-and-forget jobs
6. **Profile with Burst Inspector** — verify SIMD codegen before assuming performance is optimal
7. **Use `Allocator.TempJob`** for per-frame data, `Persistent` only for long-lived caches
8. **Never Complete() immediately after Schedule()** — that serializes execution and wastes the worker threads
9. **Avoid struct fields larger than 4 pointers** in jobs — large structs cause unnecessary copying at schedule time
10. **Test on target hardware** — Burst generates different code for x86 (SSE4/AVX2) vs ARM (NEON)

---

## Version Notes

| Version | Key Addition |
|---------|-------------|
| Burst 1.6 | Stable release, function pointers |
| Burst 1.7 | Improved ARM NEON codegen |
| Burst 1.8 | **Direct call** (static methods without jobs), improved diagnostics, `Debug.Log` support |
| Collections 2.x | `NativeParallelHashMap`, `NativeText`, improved allocators |

---

## Further Reading

- [G13 ECS & DOTS](G13_ecs_dots.md) — Full ECS architecture guide
- [G16 Performance Optimization](G16_performance_optimization_memory.md) — Memory and CPU profiling strategies
- [G33 Object Pooling](G33_object_pooling.md) — Complementary technique for managed objects
- [Unity Rules](../unity-arch-rules.md) — Engine-wide code generation rules
