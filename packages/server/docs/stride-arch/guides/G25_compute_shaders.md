# G25 — Compute Shaders

> **Category:** Guide · **Engine:** Stride · **Related:** [Stride Architecture Rules](../stride-arch-rules.md), [G04 — SDSL Shader Development](G04_sdsl_shader_development.md), [G07 — Custom Render Features](G07_custom_render_features.md)

Stride supports compute shaders across its rendering backends — DirectX 11/12, OpenGL, and (as of 4.2.1) Vulkan. Compute shaders run general-purpose work on the GPU outside the traditional vertex/fragment pipeline, making them ideal for particle simulations, post-processing, physics calculations, terrain generation, and data-parallel algorithms. This guide covers Stride's compute shader architecture, the `ComputeEffectShader` API, SDSL authoring for compute, and practical patterns for dispatching GPU work.

---

## Table of Contents

1. [When to Use Compute Shaders](#1--when-to-use-compute-shaders)
2. [Stride's Compute Architecture](#2--strides-compute-architecture)
3. [Writing a Compute Shader in SDSL](#3--writing-a-compute-shader-in-sdsl)
4. [ComputeEffectShader API](#4--computeeffectshader-api)
5. [Dispatching Compute Work](#5--dispatching-compute-work)
6. [Buffers and Textures](#6--buffers-and-textures)
7. [Vulkan Compute Support](#7--vulkan-compute-support)
8. [Practical Patterns](#8--practical-patterns)
9. [Performance Considerations](#9--performance-considerations)
10. [Common Pitfalls](#10--common-pitfalls)

---

## 1 — When to Use Compute Shaders

Compute shaders are the right tool when you need to run massively parallel, data-independent operations on the GPU. Common game dev use cases include:

- **GPU particle systems** — simulate thousands of particles without CPU overhead
- **Post-processing effects** — blur, bloom, screen-space effects that operate per-pixel
- **Procedural generation** — terrain heightmaps, noise textures, vegetation placement
- **Physics preprocessing** — broad-phase collision, spatial hashing
- **AI/pathfinding grids** — flood-fill, flow fields on large grids
- **Image processing** — lightmap generation, texture compositing

If your workload is inherently sequential or requires frequent CPU readback, compute shaders may not help. The GPU excels at "same operation, thousands of elements" problems.

## 2 — Stride's Compute Architecture

Stride's compute shader support is built on the same shader infrastructure as its rendering pipeline:

- **SDSL authoring** — compute shaders are written in Stride's Shading Language (SDSL), the same HLSL-based language used for vertex/fragment shaders
- **Cross-compilation** — SDSL compiles automatically to HLSL (DirectX), GLSL (OpenGL), or SPIR-V (Vulkan)
- **ComputeEffectShader** — the primary API class for loading and dispatching compute shaders, extending `DrawEffect`
- **Integration with RenderContext** — compute dispatches happen within Stride's rendering pipeline, sharing the same command buffer and resource management

### Where Compute Fits in the Pipeline

```
Game Loop
  └── RenderSystem
        └── RenderFeatures (vertex/fragment rendering)
        └── Custom RenderFeature or PostProcessingEffect
              └── ComputeEffectShader dispatch
```

You typically dispatch compute work from within a custom `RenderFeature` or a post-processing effect, giving you access to the GPU command context and shared resources.

## 3 — Writing a Compute Shader in SDSL

Create an `.sdsl` file in your project's `Effects/` directory. Compute shaders in SDSL use the `[numthreads]` attribute and a `Compute()` entry point:

```hlsl
// Effects/ParticleSimulation.sdsl
shader ParticleSimulation : ComputeShaderBase
{
    // Thread group size — 64 threads per group is a common default
    [numthreads(64, 1, 1)]
    stage override void Compute()
    {
        uint index = streams.DispatchThreadId.x;

        // Read particle position from a structured buffer
        float3 pos = ParticleBuffer[index].Position;
        float3 vel = ParticleBuffer[index].Velocity;

        // Simple gravity integration
        vel.y -= 9.81 * DeltaTime;
        pos += vel * DeltaTime;

        // Write back
        ParticleBuffer[index].Position = pos;
        ParticleBuffer[index].Velocity = vel;
    }

    // Declare structured buffer (RWStructuredBuffer in HLSL terms)
    rw_structured ParticleData ParticleBuffer;

    // Uniform parameter
    stage float DeltaTime;
};
```

### Key SDSL Compute Concepts

- **`ComputeShaderBase`** — base mixin that provides compute dispatch intrinsics (`streams.DispatchThreadId`, `streams.GroupThreadId`, `streams.GroupId`)
- **`[numthreads(X, Y, Z)]`** — defines the thread group dimensions; total threads per group = X × Y × Z (max 1024 on most hardware)
- **`streams.DispatchThreadId`** — the global thread index across all dispatched groups
- **`rw_structured`** — declares a read-write structured buffer (maps to `RWStructuredBuffer<T>` in HLSL)

## 4 — ComputeEffectShader API

`ComputeEffectShader` is Stride's C# wrapper for loading and dispatching a compute shader. It extends `DrawEffect` and integrates with the rendering pipeline.

```csharp
using Stride.Rendering;
using Stride.Rendering.ComputeEffect;

public class ParticleComputeEffect
{
    private ComputeEffectShader computeEffect;

    public void Initialize(RenderContext renderContext)
    {
        // Load the SDSL compute shader by name (filename without extension)
        computeEffect = new ComputeEffectShader(renderContext)
        {
            ShaderSourceName = "ParticleSimulation"
        };
    }

    public void Dispatch(RenderDrawContext drawContext, int particleCount)
    {
        // Set parameters
        computeEffect.Parameters.Set(
            ParticleSimulationKeys.DeltaTime,
            (float)drawContext.RenderContext.Time.Elapsed.TotalSeconds
        );

        // Set thread group counts
        // If numthreads is (64,1,1) and we have particleCount particles:
        int groupCountX = (particleCount + 63) / 64;
        computeEffect.ThreadGroupCounts = new Int3(groupCountX, 1, 1);

        // Dispatch
        computeEffect.Draw(drawContext);
    }
}
```

### Key Properties

| Property | Type | Purpose |
|----------|------|---------|
| `ShaderSourceName` | `string` | Name of the `.sdsl` compute shader file |
| `ThreadGroupCounts` | `Int3` | Number of thread groups to dispatch (X, Y, Z) |
| `ThreadNumbers` | `Int3` | Thread group size — must match `[numthreads]` in shader |
| `Parameters` | `ParameterCollection` | Shader parameters (uniforms, buffers, textures) |

## 5 — Dispatching Compute Work

### From a Custom RenderFeature

The most common integration point is a custom `RenderFeature`:

```csharp
public class ParticleComputeFeature : RenderFeature
{
    private ComputeEffectShader computeShader;

    protected override void InitializeCore()
    {
        base.InitializeCore();
        computeShader = new ComputeEffectShader(Context)
        {
            ShaderSourceName = "ParticleSimulation"
        };
    }

    public override void Draw(RenderDrawContext context,
                              RenderView renderView,
                              RenderViewStage renderViewStage)
    {
        computeShader.ThreadGroupCounts = new Int3(128, 1, 1);
        computeShader.Draw(context);
    }
}
```

### From a Script (Less Common)

You can also dispatch compute from a `SyncScript`, though this requires accessing the graphics context manually and is less idiomatic:

```csharp
public class ComputeDispatchScript : SyncScript
{
    public override void Update()
    {
        // Access via Services — compute dispatch in scripts
        // is possible but RenderFeature integration is preferred
        // for proper synchronization with the render pipeline
    }
}
```

## 6 — Buffers and Textures

### Structured Buffers

Compute shaders commonly read/write structured buffers. In Stride, create a `Buffer<T>` and bind it to the shader:

```csharp
// Create a structured buffer
var buffer = Buffer.Structured.New(
    GraphicsDevice,
    particleData,          // initial data array
    isUnorderedAccess: true // required for compute write access
);

// Bind to shader parameter
computeEffect.Parameters.Set(
    ParticleSimulationKeys.ParticleBuffer,
    buffer
);
```

### Read-Write Textures

For image-processing compute shaders, bind a `Texture` as an unordered access view (UAV):

```csharp
var outputTexture = Texture.New2D(
    GraphicsDevice,
    width, height,
    PixelFormat.R8G8B8A8_UNorm,
    TextureFlags.UnorderedAccess | TextureFlags.ShaderResource
);

computeEffect.Parameters.Set(
    MyComputeShaderKeys.OutputTexture,
    outputTexture
);
```

## 7 — Vulkan Compute Support

As of Stride 4.2.1, compute shaders are fully supported on the Vulkan backend. The engine generates GLSL compute shaders with the appropriate compute intrinsics and dispatches them through the Vulkan command buffer.

### What Changed

- SDSL compute shaders now cross-compile to SPIR-V for Vulkan (previously only DirectX and OpenGL were supported)
- `ComputeEffectShader` dispatches work identically across all backends — no code changes needed
- Vulkan's explicit memory model means buffer barriers are handled by Stride's resource tracking

### Cross-Platform Considerations

- **DirectX 11/12** — compute shaders have been supported since Stride's early releases
- **OpenGL** — requires OpenGL 4.3+ (compute shader extension)
- **Vulkan** — supported as of 4.2.1; SPIR-V compilation is automatic
- **Mobile** — compute support depends on the device's Vulkan/OpenGL ES 3.1 support

Write your compute shaders once in SDSL; Stride handles backend differences.

## 8 — Practical Patterns

### Pattern: GPU Particle System

```
1. Initialize: Create structured buffer with particle data
2. Each frame:
   a. Dispatch ParticleSimulation compute shader (updates positions/velocities)
   b. Render particles using the same buffer as vertex data (no CPU readback)
```

### Pattern: Post-Process Compute

```
1. Bind the rendered scene texture as input (ShaderResource)
2. Bind an output texture as UAV
3. Dispatch compute shader with thread groups covering the screen resolution
4. Use output texture in the next rendering pass
```

### Pattern: Procedural Terrain

```
1. Dispatch noise generation compute shader → writes to heightmap texture
2. Dispatch normal generation compute shader → reads heightmap, writes normal map
3. Terrain mesh samples both textures during rendering
```

## 9 — Performance Considerations

**Thread group sizing** — aim for 64 or 128 threads per group on modern GPUs. Too few threads underutilizes the hardware; too many increases register pressure. A group size of `(64, 1, 1)` for 1D workloads or `(8, 8, 1)` for 2D workloads is a good starting point.

**Minimize CPU-GPU readback** — reading compute results back to the CPU stalls the pipeline. Prefer keeping data on the GPU (e.g., use compute output directly as vertex buffer input).

**Buffer barriers** — Stride manages resource barriers automatically, but be aware that dispatching multiple compute passes that read/write the same buffer incurs synchronization costs.

**Occupancy** — keep shared memory usage low to allow more thread groups to run concurrently. Avoid branching within a thread group where possible.

## 10 — Common Pitfalls

**Wrong thread group count** — if you dispatch too few groups, some data won't be processed. Always calculate: `groupCount = ceil(elementCount / threadsPerGroup)`.

**Missing UnorderedAccess flag** — buffers and textures that compute shaders write to must be created with the `isUnorderedAccess` / `TextureFlags.UnorderedAccess` flag. Without it, the GPU cannot bind them as UAVs.

**Forgetting cross-platform testing** — a compute shader that works on DirectX may behave differently on Vulkan due to precision differences or barrier semantics. Test on all target backends.

**Structured buffer stride mismatch** — the C# struct layout must exactly match the SDSL struct. Use `[StructLayout(LayoutKind.Sequential)]` and verify field sizes.
