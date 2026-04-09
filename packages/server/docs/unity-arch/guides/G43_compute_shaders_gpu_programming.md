# G43 — Compute Shaders & GPU Programming

> **Category:** guide · **Engine:** Unity 6 (6000.x, URP/HDRP) · **Related:** [G10 Rendering Pipeline](G10_rendering_pipeline_urp_hdrp.md) · [G15 Shader Graph & VFX Graph](G15_shader_graph_vfx_graph.md) · [G39 Render Graph Custom Passes](G39_render_graph_custom_passes.md) · [G40 GPU Rendering Optimization](G40_gpu_rendering_optimization.md) · [Unity Rules](../unity-arch-rules.md)

**Compute shaders** run arbitrary code on the GPU outside the rendering pipeline. They are the tool of choice when you need to process thousands or millions of elements in parallel — particle simulations, mesh deformation, spatial queries, fluid dynamics, procedural generation, or GPU-driven culling. This guide covers the complete workflow from HLSL kernel authoring through C# dispatch, with emphasis on Unity 6 patterns (GraphicsBuffer, Render Graph integration, and cross-platform considerations).

---

## When to Use Compute Shaders

| Scenario | CPU (Jobs+Burst) | GPU (Compute) | Winner |
|----------|-------------------|---------------|--------|
| 10K elements, simple math | ✅ Fast enough | Overhead from dispatch | CPU |
| 100K+ elements, uniform work | Good | ✅ Massively parallel | GPU |
| Results needed on CPU immediately | ✅ No readback | Requires async readback | CPU |
| Data already on GPU (textures, meshes) | Must upload | ✅ Already there | GPU |
| Complex branching logic | ✅ Branch prediction | Thread divergence penalty | CPU |
| Embarrassingly parallel (same op per element) | Good | ✅ Ideal | GPU |

**Rule of thumb:** Use compute when data is already on the GPU, the work is uniform, and you don't need results back on the CPU immediately.

---

## Compute Shader Anatomy (HLSL)

Create a compute shader asset: **Assets → Create → Shader → Compute Shader**

```hlsl
// GrassSimulation.compute
//
// WHY: #pragma kernel declares an entry point (kernel function) that C# can dispatch.
// A single .compute file can have multiple kernels for different passes.
#pragma kernel SimulateGrass
#pragma kernel ResetGrass

// WHY: Structured buffers map 1:1 to C# GraphicsBuffer/ComputeBuffer.
// RW = read-write; the GPU will both read and modify this data.
struct GrassBlade
{
    float3 position;
    float3 velocity;
    float height;
    float stiffness;
};

// WHY: register(t0) = read-only slot, register(u0) = read-write slot.
// Unity binds these by name from C# using SetBuffer().
RWStructuredBuffer<GrassBlade> _GrassBuffer;     // GPU read-write
StructuredBuffer<float3>       _WindSamples;      // GPU read-only

// WHY: Uniforms are set per-dispatch from C# via SetFloat/SetVector.
// They're constant across all threads in a dispatch — compute them on CPU.
float _DeltaTime;
float _WindStrength;
int   _BladeCount;

// WHY: numthreads(64,1,1) = 64 threads per thread group.
// 64 is a safe default: aligns with NVIDIA warps (32) and AMD wavefronts (64).
// Total threads = numthreads × dispatch group count.
[numthreads(64, 1, 1)]
void SimulateGrass(uint3 id : SV_DispatchThreadID)
{
    // WHY: Guard against out-of-bounds access. Dispatch launches full groups,
    // so the last group may have threads beyond the actual data count.
    if ((int)id.x >= _BladeCount) return;

    GrassBlade blade = _GrassBuffer[id.x];

    // WHY: Wind affects each blade based on its world position.
    // Sampling a buffer is faster than computing noise per-thread.
    float3 wind = _WindSamples[id.x % 256] * _WindStrength;

    // Spring-damper simulation: blend toward rest position
    // WHY: stiffness acts as spring constant — stiffer blades resist wind more.
    float3 restoreForce = -blade.velocity * 0.95 - (blade.velocity) * blade.stiffness;
    blade.velocity += (wind + restoreForce) * _DeltaTime;
    blade.position += blade.velocity * _DeltaTime;

    _GrassBuffer[id.x] = blade;
}

[numthreads(64, 1, 1)]
void ResetGrass(uint3 id : SV_DispatchThreadID)
{
    if ((int)id.x >= _BladeCount) return;
    _GrassBuffer[id.x].velocity = float3(0, 0, 0);
}
```

### Key HLSL Concepts

| Concept | Description |
|---------|-------------|
| `SV_DispatchThreadID` | Global thread index across all groups (most commonly used) |
| `SV_GroupID` | Which thread group this thread belongs to |
| `SV_GroupThreadID` | Thread index within its group (0 to numthreads-1) |
| `SV_GroupIndex` | Flattened 1D index within the group |
| `groupshared` | Shared memory within a thread group (fast, limited ~32KB) |
| `numthreads(X,Y,Z)` | Thread group dimensions — total threads per group = X×Y×Z |

---

## C# Dispatch Pattern

### Using GraphicsBuffer (Unity 6 Recommended)

```csharp
using UnityEngine;
using UnityEngine.Rendering;

public class GrassSimulator : MonoBehaviour
{
    [SerializeField] private ComputeShader _grassCompute;
    [SerializeField] private int _bladeCount = 100_000;

    // WHY: GraphicsBuffer replaces ComputeBuffer in Unity 6 as the preferred API.
    // It supports both compute AND vertex/index buffer usage, and works with
    // the Render Graph system. ComputeBuffer still works but is less flexible.
    private GraphicsBuffer _grassBuffer;
    private GraphicsBuffer _windBuffer;

    private int _simulateKernel;
    private int _resetKernel;
    private int _threadGroupCount;

    // WHY: Match the struct layout EXACTLY between HLSL and C#.
    // Mismatched sizes cause silent data corruption.
    struct GrassBlade
    {
        public Vector3 position;
        public Vector3 velocity;
        public float height;
        public float stiffness;
    }

    void Start()
    {
        // WHY: FindKernel retrieves the kernel index by name.
        // Cache it — calling FindKernel every frame is wasteful.
        _simulateKernel = _grassCompute.FindKernel("SimulateGrass");
        _resetKernel = _grassCompute.FindKernel("ResetGrass");

        // WHY: stride = Marshal.SizeOf<GrassBlade>() = size of one element in bytes.
        // The GPU needs to know element stride to index the buffer correctly.
        int stride = System.Runtime.InteropServices.Marshal.SizeOf<GrassBlade>();
        _grassBuffer = new GraphicsBuffer(
            GraphicsBuffer.Target.Structured, // WHY: Structured = array of custom structs
            _bladeCount,
            stride
        );

        // Initialize blade data on CPU, then upload once
        var blades = new GrassBlade[_bladeCount];
        for (int i = 0; i < _bladeCount; i++)
        {
            blades[i] = new GrassBlade
            {
                position = Random.insideUnitSphere * 50f,
                height = Random.Range(0.5f, 1.5f),
                stiffness = Random.Range(0.3f, 0.9f)
            };
        }
        _grassBuffer.SetData(blades);

        // WHY: Ceil division ensures we launch enough groups to cover all blades.
        // With numthreads(64,1,1), we need bladeCount/64 groups (rounded up).
        _threadGroupCount = Mathf.CeilToInt(_bladeCount / 64f);
    }

    void Update()
    {
        // WHY: SetBuffer binds the GPU buffer to the shader variable by name.
        // Must be called before each Dispatch if buffers could change.
        _grassCompute.SetBuffer(_simulateKernel, "_GrassBuffer", _grassBuffer);
        _grassCompute.SetFloat("_DeltaTime", Time.deltaTime);
        _grassCompute.SetFloat("_WindStrength", 2.5f);
        _grassCompute.SetInt("_BladeCount", _bladeCount);

        // WHY: Dispatch(kernel, groupsX, groupsY, groupsZ) launches the kernel.
        // Total threads = groupsX × numthreads.x (= threadGroupCount × 64).
        _grassCompute.Dispatch(_simulateKernel, _threadGroupCount, 1, 1);
    }

    void OnDestroy()
    {
        // WHY: GPU buffers are unmanaged resources — always release them.
        // Forgetting this leaks VRAM until the application exits.
        _grassBuffer?.Release();
        _windBuffer?.Release();
    }
}
```

---

## Async GPU Readback — Getting Data Back to CPU

Reading GPU buffer data back to the CPU is slow because it stalls the GPU pipeline. Use `AsyncGPUReadback` to avoid blocking:

```csharp
using UnityEngine;
using UnityEngine.Rendering;

public class GPUReadbackExample : MonoBehaviour
{
    private GraphicsBuffer _resultBuffer;
    private bool _readbackPending;

    void RequestReadback()
    {
        if (_readbackPending) return;
        _readbackPending = true;

        // WHY: AsyncGPUReadback.Request queues a readback that completes 1-3 frames later.
        // This avoids stalling the GPU pipeline, which a synchronous GetData() would cause.
        // Trade-off: data is delayed by 1-3 frames. Fine for analytics, AI decisions, etc.
        AsyncGPUReadback.Request(_resultBuffer, (AsyncGPUReadbackRequest request) =>
        {
            _readbackPending = false;

            if (request.hasError)
            {
                Debug.LogError("GPU readback failed");
                return;
            }

            // WHY: GetData<T>() returns a NativeArray view — no copy, no allocation.
            // The data is only valid inside this callback; copy if needed later.
            var data = request.GetData<float>();
            float maxValue = 0f;
            for (int i = 0; i < data.Length; i++)
                maxValue = Mathf.Max(maxValue, data[i]);

            Debug.Log($"GPU computed max: {maxValue}");
        });
    }
}
```

---

## Render Graph Integration (Unity 6.1+ URP)

In Unity 6.1+, compute passes in URP must go through the Render Graph API:

```csharp
using UnityEngine;
using UnityEngine.Rendering;
using UnityEngine.Rendering.Universal;
using UnityEngine.Rendering.RenderGraphModule;

public class ComputeRenderPass : ScriptableRenderPass
{
    private ComputeShader _computeShader;
    private int _kernelIndex;

    // WHY: PassData is a plain class holding all resources the render function needs.
    // The Render Graph captures this data and manages resource lifetimes automatically.
    private class PassData
    {
        public ComputeShader computeShader;
        public int kernelIndex;
        public BufferHandle buffer;
        public int threadGroups;
    }

    public override void RecordRenderGraph(RenderGraph renderGraph, ContextContainer frameData)
    {
        // WHY: AddComputePass (not AddRasterRenderPass) — compute and raster passes
        // have different context types. Using the wrong one causes compile errors.
        using (var builder = renderGraph.AddComputePass<PassData>("Custom Compute", out var passData))
        {
            // WHY: CreateBuffer tells the graph compiler about the resource.
            // Graph-managed buffers get automatic lifetime and memory aliasing.
            var bufferDesc = new BufferDesc(1024, sizeof(float))
            {
                name = "ComputeResult"
            };
            passData.buffer = builder.CreateTransientBuffer(bufferDesc);
            passData.computeShader = _computeShader;
            passData.kernelIndex = _kernelIndex;
            passData.threadGroups = Mathf.CeilToInt(1024 / 64f);

            // WHY: UseBuffer declares that this pass writes to the buffer.
            // The graph compiler uses this to order passes and insert barriers.
            builder.UseBuffer(passData.buffer, AccessFlags.Write);

            // WHY: SetRenderFunc MUST be static to prevent accidental state capture.
            // All data flows through PassData — this is a Render Graph requirement.
            builder.SetRenderFunc(static (PassData data, ComputeGraphContext ctx) =>
            {
                ctx.cmd.SetComputeBufferParam(
                    data.computeShader, data.kernelIndex, "_ResultBuffer", data.buffer);
                ctx.cmd.DispatchCompute(
                    data.computeShader, data.kernelIndex, data.threadGroups, 1, 1);
            });
        }
    }
}
```

---

## Shared Memory (groupshared)

Thread groups have access to fast on-chip shared memory (~32KB per group). Use it for reduction operations and neighborhood lookups:

```hlsl
// WHY: groupshared memory is ~100× faster than global buffer reads.
// But it's limited to ~32KB per group and only visible within the group.
groupshared float sharedData[64];

[numthreads(64, 1, 1)]
void ParallelReduce(
    uint3 id : SV_DispatchThreadID,
    uint groupIndex : SV_GroupIndex)
{
    // Step 1: Each thread loads one element into shared memory
    sharedData[groupIndex] = _InputBuffer[id.x];

    // WHY: GroupMemoryBarrierWithGroupSync() ensures ALL threads in the group
    // have finished writing to shared memory before any thread reads from it.
    // Without this barrier, you get race conditions and wrong results.
    GroupMemoryBarrierWithGroupSync();

    // Step 2: Parallel reduction — each step halves the active threads
    // WHY: This tree-reduction pattern sums 64 values in 6 steps (log2(64))
    // instead of 63 sequential additions. Classic GPU optimization.
    for (uint stride = 32; stride > 0; stride >>= 1)
    {
        if (groupIndex < stride)
        {
            sharedData[groupIndex] += sharedData[groupIndex + stride];
        }
        GroupMemoryBarrierWithGroupSync();
    }

    // Thread 0 writes the group's sum to the output
    if (groupIndex == 0)
    {
        _OutputBuffer[id.x / 64] = sharedData[0];
    }
}
```

---

## Textures in Compute Shaders

Compute shaders can read and write textures directly — useful for image processing, GPU-based heightmap generation, and post-processing:

```hlsl
#pragma kernel BlurPass

// WHY: Texture2D<float4> for read-only, RWTexture2D<float4> for write.
// These bind to RenderTextures with enableRandomWrite = true.
Texture2D<float4>   _InputTex;
RWTexture2D<float4> _OutputTex;
SamplerState        sampler_InputTex; // WHY: Unity auto-generates sampler by naming convention

float2 _TexelSize; // 1.0 / textureResolution

// WHY: 8×8 is ideal for 2D image processing — maps to 64 threads per group,
// and the 2D layout matches the spatial locality of pixel neighborhoods.
[numthreads(8, 8, 1)]
void BlurPass(uint3 id : SV_DispatchThreadID)
{
    float2 uv = (float2(id.xy) + 0.5) * _TexelSize;

    // Simple 3×3 box blur
    float4 sum = float4(0, 0, 0, 0);
    for (int y = -1; y <= 1; y++)
    {
        for (int x = -1; x <= 1; x++)
        {
            sum += _InputTex.SampleLevel(sampler_InputTex, uv + float2(x, y) * _TexelSize, 0);
        }
    }

    _OutputTex[id.xy] = sum / 9.0;
}
```

```csharp
// C# setup for texture compute
var rt = new RenderTexture(512, 512, 0, RenderTextureFormat.ARGBFloat);
rt.enableRandomWrite = true; // WHY: REQUIRED for RWTexture2D binding. Without this, writes silently fail.
rt.Create();

_computeShader.SetTexture(_kernel, "_OutputTex", rt);
_computeShader.SetVector("_TexelSize", new Vector4(1f / 512f, 1f / 512f, 0, 0));
_computeShader.Dispatch(_kernel, 512 / 8, 512 / 8, 1); // 64×64 groups of 8×8 threads
```

---

## Performance Optimization

### Thread Group Sizing

| GPU Vendor | Warp/Wavefront Size | Recommended numthreads |
|------------|---------------------|----------------------|
| NVIDIA | 32 threads | 64, 128, or 256 |
| AMD | 64 threads | 64, 128, or 256 |
| Apple (Metal) | 32 threads | 64 or 128 |
| Mobile (Vulkan) | Varies (16–64) | 64 (safe default) |

### Common Pitfalls

| Pitfall | Impact | Fix |
|---------|--------|-----|
| Thread divergence (if/else in kernel) | GPU runs both branches, halving throughput | Minimize branching; sort data by category before dispatch |
| Random memory access pattern | Cache thrashing, 10–50× slowdown | Access buffers sequentially by thread index |
| Synchronous GPU readback (`GetData()`) | Stalls GPU pipeline 1–3ms | Use `AsyncGPUReadback.Request()` |
| Forgetting bounds check in kernel | Silent buffer overwrite / GPU crash | Always check `id.x < _Count` |
| Too-small dispatch (< 1000 threads) | GPU cores idle, dispatch overhead dominates | Batch more work; consider CPU instead |
| `enableRandomWrite` not set on RT | Writes silently fail | Always set before `Create()` |

### Memory Bandwidth Rules

1. **Minimize CPU↔GPU transfers** — upload once, compute many times on GPU
2. **Use `half` precision** when full `float` isn't needed (saves bandwidth on mobile)
3. **Pack struct fields** to avoid padding — align to 16-byte boundaries for best performance
4. **Use `StructuredBuffer` (read-only)** instead of `RWStructuredBuffer` when possible — gives the GPU more optimization freedom

---

## Platform Support

| Platform | Compute Shader Support | Notes |
|----------|----------------------|-------|
| Windows (DX11/12) | ✅ Full | Best tooling and debugging |
| macOS/iOS (Metal) | ✅ Full | Use `metal` pragma target for best codegen |
| Android (Vulkan) | ✅ Most devices | Requires Vulkan backend; older GLES3.1 limited |
| Android (GLES 3.1) | ⚠️ Limited | Supported but fewer features than Vulkan |
| WebGL 2 | ❌ Not supported | WebGPU (Unity 6) adds compute support |
| WebGPU | ✅ Experimental | Unity 6 preview; WGSL shaders |
| Consoles | ✅ Full | Platform-specific extensions available |

### Cross-Platform Pragma

```hlsl
// WHY: #pragma target defines the minimum shader model. 4.5 = compute support.
// Use 5.0 for advanced features like typed UAV loads.
#pragma kernel MyKernel
#pragma target 4.5
```

---

## Further Reading

- [G10 Rendering Pipeline URP/HDRP](G10_rendering_pipeline_urp_hdrp.md) — Pipeline architecture overview
- [G15 Shader Graph & VFX Graph](G15_shader_graph_vfx_graph.md) — Visual shader authoring (can output to compute)
- [G39 Render Graph Custom Passes](G39_render_graph_custom_passes.md) — Integrating custom rendering in URP
- [G40 GPU Rendering Optimization](G40_gpu_rendering_optimization.md) — GPU Resident Drawer and upscaling
- [G42 Burst Compiler & Jobs System](G42_burst_compiler_jobs_system.md) — CPU-side parallel processing alternative
- [Unity Rules](../unity-arch-rules.md) — Engine-wide code generation rules
