# G39 — Render Graph: Custom Render Passes

> **Category:** guide · **Engine:** Unity 6 (6000.x+) · **Related:** [G10 Rendering Pipeline: URP & HDRP](G10_rendering_pipeline_urp_hdrp.md) · [G15 Shader Graph & VFX Graph](G15_shader_graph_vfx_graph.md) · [G16 Performance Optimization](G16_performance_optimization_memory.md) · [Unity Rules](../unity-arch-rules.md)

The **Render Graph** is Unity 6's framework for extending URP (and HDRP) with custom rendering logic. It replaces the older `CommandBuffer`-injection approach with a declarative, resource-safe graph of render passes. Starting with **Unity 6.1**, Render Graph is the *only* way to add custom rendering to URP — the legacy `ScriptableRenderPass.Execute()` path is obsolete.

This guide covers the mental model, the two pass types (raster and compute), resource management, and practical patterns you'll use in real projects.

---

## Why Render Graph Exists

The old approach — grab a `CommandBuffer`, allocate temporary render textures, issue draw calls — had problems:

- **Over-allocation.** Every pass allocated its own textures even when passes could share them.
- **No dependency tracking.** Unity couldn't cull unused passes or reorder them for GPU efficiency.
- **Mobile perf hazard.** Tile-based GPUs need explicit load/store actions; the old API couldn't merge compatible passes into subpasses.

Render Graph solves all three. You *declare* what resources a pass reads and writes; the graph compiler handles allocation, lifetime, pass ordering, and subpass merging automatically.

```
Traditional Pipeline              Render Graph Pipeline
─────────────────────             ─────────────────────
Pass A: alloc RT, draw, release   Pass A: declare read/write
Pass B: alloc RT, draw, release   Pass B: declare read/write
Pass C: alloc RT, draw, release   Pass C: declare read/write
                                      │
                                  Graph Compiler
                                      │
                                  ┌─ merge A+B into subpass ─┐
                                  │  cull unused Pass C       │
                                  │  share RT between A & B   │
                                  └───────────────────────────┘
```

---

## Core Concepts

### The Two Phases

Every render pass has two distinct phases:

1. **Recording** (`RecordRenderGraph`) — You declare resources, set up builder configuration, and register your render function. No GPU commands execute here.
2. **Execution** (`SetRenderFunc` callback) — The graph compiler calls your static function when it's time to actually emit GPU commands. You receive a context with a `CommandBuffer`.

This separation is critical: *never* issue GPU commands during recording, and *never* allocate graph resources during execution.

### Resource Handles

Render Graph wraps GPU resources in lightweight handles:

| Handle Type | Wraps | Created Via |
|---|---|---|
| `TextureHandle` | `RTHandle` / render texture | `renderGraph.CreateTexture()` or `renderGraph.ImportTexture()` |
| `BufferHandle` | `GraphicsBuffer` | `renderGraph.CreateBuffer()` or `renderGraph.ImportBuffer()` |

Handles are *not* the resource — they're tokens the graph compiler resolves at execution time.

### Frame Data

URP provides per-frame context through `ContextContainer frameData`:

```csharp
// Access URP's built-in texture references
// (active color buffer, depth buffer, motion vectors, etc.)
var resourceData = frameData.Get<UniversalResourceData>();

// Access camera-specific rendering data
// (camera type, post-processing state, render scale, etc.)
var cameraData = frameData.Get<UniversalCameraData>();
```

---

## Raster Render Passes

Raster passes draw geometry or blit full-screen quads — the bread and butter of rendering.

### Anatomy of a Custom Raster Pass

```csharp
using UnityEngine;
using UnityEngine.Rendering;
using UnityEngine.Rendering.Universal;
using UnityEngine.Rendering.RenderGraphModule;

// Step 1: Define a Renderer Feature to inject your pass
public class GrayscaleFeature : ScriptableRendererFeature
{
    GrayscalePass m_Pass;
    public Material grayscaleMaterial;

    public override void Create()
    {
        // Create the pass instance; runs once when the feature initializes
        m_Pass = new GrayscalePass(grayscaleMaterial);
        m_Pass.renderPassEvent = RenderPassEvent.AfterRenderingPostProcessing;
    }

    public override void AddRenderPasses(ScriptableRenderer renderer,
        ref RenderingData renderingData)
    {
        // Enqueue the pass every frame
        if (grayscaleMaterial != null)
            renderer.EnqueuePass(m_Pass);
    }
}
```

```csharp
// Step 2: Define the render pass itself
public class GrayscalePass : ScriptableRenderPass
{
    // PassData carries everything the execution function needs.
    // Keep it a plain class — no MonoBehaviour, no ScriptableObject.
    private class PassData
    {
        public TextureHandle sourceTexture;
        public Material material;
    }

    private Material m_Material;

    public GrayscalePass(Material material)
    {
        m_Material = material;
    }

    // --- RECORDING PHASE ---
    // Declare resources and register the execution callback.
    public override void RecordRenderGraph(RenderGraph renderGraph,
        ContextContainer frameData)
    {
        var resourceData = frameData.Get<UniversalResourceData>();

        // AddRasterRenderPass<T> creates a raster pass node in the graph.
        // The generic T is your PassData type.
        using (var builder = renderGraph.AddRasterRenderPass<PassData>(
            "Grayscale Pass",  // Debug name (shows in Frame Debugger)
            out var passData)) // The graph allocates PassData for you
        {
            // Tell the graph what we read
            passData.sourceTexture = resourceData.activeColorTexture;
            builder.UseTexture(passData.sourceTexture);

            // Tell the graph what we write to
            // (writing back to the same color buffer = in-place blit)
            builder.SetRenderAttachment(
                resourceData.activeColorTexture, // target texture
                0);                              // color attachment index

            passData.material = m_Material;

            // Allow the graph compiler to skip this pass if nothing
            // downstream reads our output
            builder.AllowPassCulling(true);

            // Register the execution function — MUST be static
            builder.SetRenderFunc(static (PassData data,
                RasterGraphContext context) =>
            {
                ExecutePass(data, context);
            });
        }
    }

    // --- EXECUTION PHASE ---
    // Emit actual GPU commands via the context's CommandBuffer.
    private static void ExecutePass(PassData data,
        RasterGraphContext context)
    {
        // Blit the source through our grayscale material
        Blitter.BlitTexture(
            context.cmd,           // the CommandBuffer for this pass
            data.sourceTexture,    // source
            new Vector4(1, 1, 0, 0), // scale + bias (full screen)
            data.material,
            0);                    // shader pass index
    }
}
```

### Key Builder Methods (Raster)

| Method | When to Use |
|---|---|
| `builder.UseTexture(handle)` | Declare a read-only texture input |
| `builder.SetRenderAttachment(handle, index)` | Set a color render target at the given attachment slot |
| `builder.SetRenderAttachmentDepth(handle)` | Set the depth/stencil target |
| `builder.AllowPassCulling(true)` | Let the compiler skip the pass if output is unused |
| `builder.SetRenderFunc(callback)` | Register the static execution function |

---

## Compute Render Passes

Compute passes run compute shaders — useful for GPU-side simulation, post-processing, or data generation.

### Full Compute Pass Example

```csharp
using UnityEngine;
using UnityEngine.Rendering;
using UnityEngine.Rendering.Universal;
using UnityEngine.Rendering.RenderGraphModule;

public class ParticleSimPass : ScriptableRenderPass
{
    // Data the compute pass needs during execution
    private class PassData
    {
        public BufferHandle particleBuffer;
        public ComputeShader computeShader;
        public int kernelIndex;
        public int particleCount;
    }

    private ComputeShader m_ComputeShader;
    private GraphicsBuffer m_ParticleBuffer;
    private const int PARTICLE_COUNT = 1024;

    // Particle data matches the compute shader's struct layout
    private struct Particle
    {
        public Vector3 position;  // 12 bytes
        public Vector3 velocity;  // 12 bytes
        public float life;        //  4 bytes
    }                             // 28 bytes total

    public ParticleSimPass(ComputeShader shader)
    {
        m_ComputeShader = shader;

        // Create the GPU buffer once — it persists across frames
        // Target.Structured = StructuredBuffer in HLSL
        m_ParticleBuffer = new GraphicsBuffer(
            GraphicsBuffer.Target.Structured,
            PARTICLE_COUNT,
            System.Runtime.InteropServices.Marshal.SizeOf<Particle>());
    }

    public override void RecordRenderGraph(RenderGraph renderGraph,
        ContextContainer frameData)
    {
        using (var builder = renderGraph.AddComputePass<PassData>(
            "Particle Sim",
            out var passData))
        {
            // Import the persistent buffer into the graph
            // so the compiler can track dependencies
            BufferHandle bufferHandle = renderGraph.ImportBuffer(
                m_ParticleBuffer);

            passData.particleBuffer = bufferHandle;
            passData.computeShader = m_ComputeShader;
            passData.kernelIndex = m_ComputeShader.FindKernel("CSMain");
            passData.particleCount = PARTICLE_COUNT;

            // Declare read-write access on the buffer
            builder.UseBuffer(passData.particleBuffer, AccessFlags.Write);

            builder.SetRenderFunc(static (PassData data,
                ComputeGraphContext context) =>
            {
                // Bind the buffer to the compute shader
                context.cmd.SetComputeBufferParam(
                    data.computeShader,
                    data.kernelIndex,
                    "ParticleBuffer",  // must match HLSL name
                    data.particleBuffer);

                // Dispatch with enough thread groups to cover all particles
                // (assumes [numthreads(64,1,1)] in HLSL)
                int threadGroups = Mathf.CeilToInt(
                    data.particleCount / 64f);

                context.cmd.DispatchCompute(
                    data.computeShader,
                    data.kernelIndex,
                    threadGroups, 1, 1);
            });
        }
    }

    // Clean up the persistent buffer when the pass is destroyed
    public void Dispose()
    {
        m_ParticleBuffer?.Dispose();
    }
}
```

### Matching HLSL Compute Shader

```hlsl
#pragma kernel CSMain

// Must match the C# Particle struct layout exactly
struct Particle
{
    float3 position;
    float3 velocity;
    float life;
};

// RWStructuredBuffer = read-write from compute shader
RWStructuredBuffer<Particle> ParticleBuffer;

[numthreads(64, 1, 1)]
void CSMain(uint3 id : SV_DispatchThreadID)
{
    Particle p = ParticleBuffer[id.x];

    // Simple Euler integration
    p.position += p.velocity * 0.016; // ~60fps timestep
    p.life -= 0.016;

    ParticleBuffer[id.x] = p;
}
```

---

## Resource Management Patterns

### Creating Temporary Textures

```csharp
// Inside RecordRenderGraph:
var desc = new TextureDesc(Screen.width, Screen.height)
{
    colorFormat = GraphicsFormat.R16G16B16A16_SFloat,
    // depthBufferBits is 0 by default (color-only)
    name = "MyTempTexture"
};

// The graph allocates this texture and manages its lifetime —
// it's freed automatically when no more passes reference it
TextureHandle tempTex = renderGraph.CreateTexture(desc);
```

### Importing External Textures

```csharp
// Wrap an existing RTHandle or RenderTexture so the graph
// can track reads/writes to it
TextureHandle imported = renderGraph.ImportTexture(myRTHandle);
```

### Reading Back Compute Results to CPU

```csharp
// After the frame completes, read data from the persistent buffer
// WARNING: This stalls the CPU waiting for GPU — use sparingly
int[] results = new int[PARTICLE_COUNT];
m_ParticleBuffer.GetData(results);
```

For async readback (non-blocking), use `AsyncGPUReadback.Request()` instead.

---

## Subpass Merging (Mobile Optimization)

On tile-based GPUs (iOS, Android, Switch), the Render Graph compiler can automatically merge consecutive raster passes that share the same render targets into a single native render pass with multiple subpasses. This avoids expensive tile memory load/store operations.

For merging to work:

1. Consecutive passes must write to the **same set of attachments**
2. Later subpasses can read the output of earlier ones via `builder.SetInputAttachment()`
3. Don't insert compute passes between raster passes you want merged

Unity 6.2+ improved the merging heuristic to reduce overhead and avoid exceeding hardware subpass limits.

```
Before Merging                    After Merging
──────────────                    ──────────────
Pass A → write color + depth      Native Render Pass
  (store to memory)                 ├─ Subpass A: write color + depth
Pass B → read color, write color    ├─ Subpass B: read + write color
  (load from memory, store)         └─ (single load, single store)
```

---

## Debugging

### Frame Debugger

**Window > Analysis > Frame Debugger** shows the resolved render graph with actual pass order, merged subpasses, and resource lifetimes.

### Render Graph Viewer

URP includes a dedicated **Render Graph Viewer** (Window > Analysis > Render Graph Viewer) that visualizes the entire graph structure: nodes, edges, resource allocations, and which passes were culled.

### Common Pitfalls

| Symptom | Likely Cause |
|---|---|
| Pass silently disappears | `AllowPassCulling(true)` and nothing reads your output — either disable culling or ensure a downstream pass uses the texture |
| Black screen after custom pass | Forgot to call `builder.SetRenderAttachment()` — the pass has no render target |
| `InvalidOperationException` during recording | Trying to access `context.cmd` in `RecordRenderGraph` instead of the render function |
| Subpasses not merging on mobile | Compute pass between raster passes breaks the merge chain |

---

## Migration from Legacy ScriptableRenderPass

If you have existing passes using the old `Execute(ScriptableRenderContext, ref RenderingData)` pattern:

1. **Move rendering code** from `Execute()` into a static method matching `SetRenderFunc`'s signature
2. **Replace** `CommandBuffer` allocation with the context-provided `context.cmd`
3. **Replace** `cmd.GetTemporaryRT()` / `cmd.ReleaseTemporaryRT()` with `renderGraph.CreateTexture()`
4. **Declare** all texture/buffer reads and writes through the builder API
5. **Delete** the `Execute()` override — `RecordRenderGraph()` is the only entry point now

The URP package includes migration samples in **Package Manager > Universal RP > Samples**.

---

## Version Notes

| Version | Change |
|---|---|
| Unity 6.0 (6000.0) | Render Graph API available; `RecordRenderGraph` added to `ScriptableRenderPass` |
| Unity 6.1 (6000.1) | Render Graph is the *only* URP extension path; legacy `Execute()` deprecated |
| Unity 6.2 (6000.2) | Improved subpass merging; reduced compiler overhead |
| Unity 6.3 (6000.3) | Further defragmentation and cross-pipeline unification work |
