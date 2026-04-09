# G23 — Profiling and Performance Optimization

> **Category:** Guide · **Engine:** Stride · **Related:** [Stride Architecture Rules](../stride-arch-rules.md), [G14 — .NET 10 / C# 14 Performance](G14_dotnet10_csharp14_performance.md)

Stride ships with a built-in Game Profiler that displays CPU, GPU, and memory metrics as an in-game overlay. Combined with external tools like Visual Studio Profiler and RenderDoc, you can identify and fix rendering bottlenecks, excessive allocations, and frame-time spikes. This guide covers Stride's profiling tools, common optimization strategies, and engine-specific performance patterns.

---

## Table of Contents

1. [Game Profiler Setup](#1--game-profiler-setup)
2. [Runtime Controls](#2--runtime-controls)
3. [Profiler Modes and Metrics](#3--profiler-modes-and-metrics)
4. [External Profiling Tools](#4--external-profiling-tools)
5. [Profiling API](#5--profiling-api)
6. [CPU Optimization](#6--cpu-optimization)
7. [GPU and Rendering Optimization](#7--gpu-and-rendering-optimization)
8. [Memory Optimization](#8--memory-optimization)
9. [Physics Performance](#9--physics-performance)
10. [Common Bottlenecks](#10--common-bottlenecks)

---

## 1 — Game Profiler Setup

### Adding the Profiler Script

1. In the **Asset View**, click **Add asset → Scripts → Game Profiler**.
2. Leave the default configuration and click **Create script**. Game Studio adds the `GameProfiler` script to your project.
3. Add the script as a component to any entity in your scene (a dedicated "Debug" entity is a common pattern).
4. In the **Property Grid**, make sure the **Game Profiler** component is enabled.

### Enabling at Startup

To have the profiler active from the first frame, check the **Enabled** property on the component. Otherwise, toggle it at runtime with the keyboard shortcut.

---

## 2 — Runtime Controls

Once the game is running, control the profiler with these keyboard shortcuts:

| Action | Shortcut |
|--------|----------|
| **Toggle profiler on/off** | `Left Ctrl + Left Shift + P` |
| **Switch display mode** | `F1` (cycles through FPS → CPU → GPU) |
| **Change sort order** | `F2` (sort by name or by time) |
| **Increase refresh rate** | `+` (numpad or main keyboard) |
| **Decrease refresh rate** | `-` (numpad or main keyboard) |
| **Navigate pages** | `F3` / `F4` or number keys |

> **Tip:** Start with FPS mode to get a quick read on frame time, then switch to CPU or GPU mode to drill into specifics.

---

## 3 — Profiler Modes and Metrics

### FPS Mode

Displays high-level frame timing:

| Metric | Description |
|--------|-------------|
| **Frame count** | Total frames rendered since launch |
| **Update time** | Time spent in game logic (ms) |
| **Draw time** | Time spent rendering (ms) |
| **FPS** | Frames per second |

### CPU Mode

Shows detailed CPU profiling data:

| Metric | Description |
|--------|-------------|
| **Total memory** | Total managed memory in use |
| **Peak memory** | Highest memory usage observed |
| **Allocations** | Memory allocation rate changes |
| **GC Gen0 / Gen1 / Gen2** | Garbage collection counts per generation |
| **Per-profiling-key breakdown** | Time per system (scripts, physics, rendering prep, etc.) |

Each profiling key shows:

- **Average time** per frame
- **Min / Max time** observed
- **Call count** per frame

### GPU Mode

Displays rendering pipeline metrics:

| Metric | Description |
|--------|-------------|
| **Graphics device** | GPU name and driver info |
| **Backend** | Rendering API (Vulkan, DirectX 11/12, OpenGL) |
| **Feature level** | Supported GPU feature level |
| **Resolution** | Current render resolution |
| **Triangle count** | Total triangles rendered per frame |
| **Draw calls** | Number of draw calls per frame |
| **Buffer memory** | GPU buffer memory allocated |
| **Texture memory** | GPU texture memory allocated |

---

## 4 — External Profiling Tools

### Visual Studio Performance Profiler

Best for CPU and memory profiling of C# code:

1. Open your Stride solution in Visual Studio.
2. Go to **Debug → Performance Profiler** (or `Alt + F2`).
3. Select **CPU Usage** and/or **.NET Object Allocation Tracking**.
4. Run your game through the profiler.
5. Analyze hot paths, allocation sites, and GC pressure.

### RenderDoc

Best for GPU debugging and draw-call analysis:

1. Install [RenderDoc](https://renderdoc.org/).
2. Launch your Stride game through RenderDoc.
3. Capture a frame with `F12` (or RenderDoc's capture key).
4. Inspect draw calls, shader execution, texture binds, and pipeline state.
5. Identify overdraw, redundant state changes, and expensive shaders.

### dotnet-counters and dotnet-trace

.NET CLI diagnostic tools work with Stride since it runs on .NET 10:

```bash
# Real-time GC and thread pool metrics
dotnet counters monitor --process-id <PID>

# Collect a performance trace for analysis
dotnet trace collect --process-id <PID> --duration 00:00:30
```

---

## 5 — Profiling API

### Enabling Profiling in Code

```csharp
public class DebugManager : StartupScript
{
    public override void Start()
    {
        // Enable the profiler programmatically
        GameProfiler.EnableProfiling();

        // Enable profiling for specific keys only
        // GameProfiler.EnableProfiling(true, specificKey1, specificKey2);
    }
}
```

### Custom Profiling Keys

Create custom profiling keys to measure your own systems:

```csharp
public class AISystem : SyncScript
{
    // Define a custom profiling key for your system
    private static readonly ProfilingKey AIUpdateKey =
        new ProfilingKey("AI.Update");

    public override void Update()
    {
        // Wrap the code you want to measure
        using (Profiler.Begin(AIUpdateKey))
        {
            // Your AI logic here
            UpdatePathfinding();
            EvaluateDecisionTrees();
            ExecuteActions();
        }
    }
}
```

Custom keys appear in the CPU profiler alongside engine keys, making it easy to compare your code's cost against Stride's internal systems.

### Accessing ProfilingKey from Scripts

Every `ScriptComponent` has a `ProfilingKey` property that identifies it in the profiler. You can use this to see per-script costs without additional setup.

---

## 6 — CPU Optimization

### Script Performance

| Practice | Reason |
|----------|--------|
| **Minimize per-frame allocations** | Reduces GC pressure. Reuse lists, avoid LINQ in `Update()`. |
| **Use `SyncScript` for simple logic** | Lower overhead than `AsyncScript` for per-frame work. |
| **Cache component lookups** | Call `Entity.Get<T>()` in `Start()`, not every frame. |
| **Avoid string operations in hot paths** | String concatenation allocates. Use `StringBuilder` or interpolated strings sparingly. |

### Example: Caching Component References

```csharp
public class OptimizedScript : SyncScript
{
    // Cache in Start(), not every frame
    private TransformComponent _transform;
    private RigidbodyComponent _rigidbody;

    public override void Start()
    {
        _transform = Entity.Transform;
        _rigidbody = Entity.Get<RigidbodyComponent>();
    }

    public override void Update()
    {
        // Use cached references — no per-frame lookup cost
        var pos = _transform.Position;
    }
}
```

### Entity Processing

- **Entity processors** run once per frame for all matching entities — more efficient than individual scripts when managing hundreds of entities.
- Consider consolidating per-entity scripts into a single processor when entity count is high.

---

## 7 — GPU and Rendering Optimization

### Draw Call Reduction

Draw calls are often the primary GPU bottleneck:

| Technique | How |
|-----------|-----|
| **Instancing** | Use Stride's instanced rendering for repeated meshes (trees, rocks, etc.) |
| **LOD (Level of Detail)** | Reduce polygon count for distant objects |
| **Occlusion culling** | Stride performs frustum culling automatically; ensure objects have correct bounding boxes |
| **Material batching** | Objects sharing the same material can be batched — minimize unique materials |

### Shader Optimization

- Avoid complex math in fragment shaders when a vertex-shader approximation suffices.
- Use `discard` sparingly — it can break early-Z optimizations on some GPUs.
- Profile shader cost with RenderDoc's per-draw timing.

### Post-Processing

Stride's post-processing stack (bloom, ambient occlusion, depth of field, etc.) adds per-frame GPU cost:

- Disable effects you don't need.
- Reduce quality settings for effects that support them.
- AO (Ambient Occlusion) is often the most expensive post-process — consider half-resolution AO.

### Resolution and Render Targets

- Consider rendering at a lower internal resolution and upscaling.
- Minimize the number of active render targets and shadow cascades.

---

## 8 — Memory Optimization

### Texture Memory

Textures are typically the largest memory consumer:

| Strategy | Details |
|----------|---------|
| **Compression** | Use GPU-compressed formats (BC/DXT). Stride's asset pipeline compresses by default. |
| **Mipmaps** | Ensure mipmaps are generated (default). Saves memory at distance. |
| **Streaming** | For very large scenes, consider loading textures on demand. |
| **Resolution** | Use the smallest texture resolution that looks acceptable. 4K textures on small props waste memory. |

### GC Pressure

Monitor Gen0 collections in the CPU profiler. High Gen0 counts indicate excessive allocations:

- Pool frequently created/destroyed objects.
- Pre-allocate collections with expected capacity.
- Avoid boxing value types (use generic collections).

```csharp
// Bad: allocates a new list every frame
var nearby = FindNearbyEntities(); // returns new List<Entity>

// Good: reuse a pre-allocated list
private readonly List<Entity> nearbyBuffer = new(64);

void FindNearby()
{
    nearbyBuffer.Clear();
    // ... fill nearbyBuffer ...
}
```

---

## 9 — Physics Performance

Bepu Physics v2 is multi-threaded and efficient, but physics can still dominate frame time in complex scenes:

| Concern | Recommendation |
|---------|----------------|
| **Collider complexity** | Use simple shapes (Box, Sphere, Capsule) over MeshColliders where possible |
| **Static vs. dynamic** | Mark non-moving objects as static — they're much cheaper to simulate |
| **Simulation step rate** | Default is 60 Hz. Lowering to 30 Hz halves physics CPU cost (at the expense of accuracy) |
| **Broad-phase efficiency** | Bepu handles this well, but extreme entity counts (10,000+) may need spatial partitioning at the game logic level |
| **Raycasts** | Batch raycasts when possible. Avoid per-frame raycasts per entity. |

---

## 10 — Common Bottlenecks

| Symptom | Likely Cause | Investigation |
|---------|-------------|---------------|
| Low FPS, high Draw time | GPU bound | Check GPU profiler: draw calls, triangle count, post-processing |
| Low FPS, high Update time | CPU bound | Check CPU profiler: scripts, physics, AI |
| Frame-time spikes every few seconds | GC collections | Check Gen0/Gen1/Gen2 counts. Reduce allocations in hot paths. |
| Slow scene loading | Asset loading | Profile asset deserialization. Consider async loading. |
| Physics taking >5ms | Too many dynamic bodies or complex colliders | Simplify colliders, reduce dynamic body count, lower sim rate |
| Stuttering on first encounter | Shader compilation | Stride compiles shaders on first use. Pre-warm by rendering once off-screen. |

### Quick Optimization Checklist

1. Enable the Game Profiler and identify whether you're CPU or GPU bound.
2. If GPU bound: check draw calls (target <2000 for most games), reduce post-processing, add LODs.
3. If CPU bound: check per-script costs, cache component lookups, reduce pathfinding frequency.
4. Check GC counters — if Gen0 collects frequently, find and eliminate per-frame allocations.
5. Profile physics separately — Bepu's simulation time appears as its own profiling key.
6. Validate with a Release build — Debug builds have significant overhead from assertions and checks.

---

## See Also

- [G14 — .NET 10 / C# 14 Performance](G14_dotnet10_csharp14_performance.md) — language-level performance features
- [G02 — Bepu Physics](G02_bepu_physics.md) — physics system details
- [G07 — Custom Render Features](G07_custom_render_features.md) — extending the render pipeline
- [G04 — SDSL Shader Development](G04_sdsl_shader_development.md) — shader optimization context
