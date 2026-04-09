# G84 — Compute Shaders: GPU Particles, Culling & Post-Processing

> **Category:** guide · **Engine:** MonoGame · **Related:** [G83 Vulkan & DX12 Backend Preview](./G83_vulkan_dx12_backend_preview.md) · [G27 Shaders & Effects](./G27_shaders_and_effects.md) · [G23 Particles](./G23_particles.md) · [G33 Profiling & Optimization](./G33_profiling_optimization.md) · [G67 Object Pooling](./G67_object_pooling.md)

MonoGame's DesktopVK (Vulkan) and DesktopDX (DirectX 12) backends unlock compute shaders — general-purpose GPU programs that run outside the traditional vertex/fragment pipeline. Compute shaders let you offload massively parallel work to the GPU: particle simulation, frustum culling, post-processing, pathfinding grids, and physics broad-phase. This guide covers the MonoGame compute shader API, practical patterns for game systems, and performance considerations.

---

## Prerequisites

Compute shaders require one of the new graphics backends introduced in MonoGame 3.8.5:

- **DesktopVK** — Vulkan backend (Windows, Linux)
- **DesktopDX** — DirectX 12 backend (Windows)

The legacy **DesktopGL** (OpenGL) backend does **not** support compute shaders. If your project targets DesktopGL, you must migrate to DesktopVK or DesktopDX before using any compute features. See [G83](./G83_vulkan_dx12_backend_preview.md) for backend setup.

Shader model requirement: `cs_5_0` (Shader Model 5.0) or higher.

---

## Core Concepts

A compute shader is a GPU program dispatched independently of drawing. Instead of processing vertices or pixels, it processes arbitrary data through thread groups.

**Thread groups and dispatch:** You define a thread group size in the shader with `[numthreads(X, Y, Z)]`, then dispatch N groups from C#. Total threads = group size × group count. For a 1D workload like particles, a common pattern is `[numthreads(64, 1, 1)]` with `groupCount = ceil(itemCount / 64)`.

**Buffers, not draw calls:** Compute shaders read and write `StructuredBuffer` and `RWStructuredBuffer` objects — GPU-resident arrays of structs. The same buffer a compute shader writes to can be bound as a vertex buffer or read by a fragment shader, avoiding CPU round-trips.

---

## Writing an HLSL Compute Shader

Compute shaders live in `.fx` effect files alongside vertex/fragment shaders. Define a technique with a compute shader pass:

```hlsl
// ParticleCompute.fx
#define GROUP_SIZE 64

struct Particle
{
    float2 Position;
    float2 Velocity;
    float Life;
    float MaxLife;
};

// Read-write buffer — compute shader updates in place
RWStructuredBuffer<Particle> Particles;

float DeltaTime;
float2 Gravity;

[numthreads(GROUP_SIZE, 1, 1)]
void UpdateParticles(
    uint3 globalID : SV_DispatchThreadID,
    uint3 groupID  : SV_GroupID,
    uint  localIdx : SV_GroupIndex)
{
    uint idx = globalID.x;
    Particle p = Particles[idx];

    // Skip dead particles
    if (p.Life <= 0.0)
        return;

    // Integrate velocity and apply gravity
    p.Velocity += Gravity * DeltaTime;
    p.Position += p.Velocity * DeltaTime;
    p.Life -= DeltaTime;

    Particles[idx] = p;
}

technique UpdateTechnique
{
    pass Pass0
    {
        ComputeShader = compile cs_5_0 UpdateParticles();
    }
}
```

Key HLSL semantics for compute shaders:

| Semantic | Type | Meaning |
|----------|------|---------|
| `SV_DispatchThreadID` | `uint3` | Global thread index across all groups |
| `SV_GroupID` | `uint3` | Which group this thread belongs to |
| `SV_GroupThreadID` | `uint3` | Thread index within its group |
| `SV_GroupIndex` | `uint` | Flattened 1D index within the group |

---

## C# API: Buffers, Dispatch, and Readback

### Creating a StructuredBuffer

```csharp
// Define the particle struct — must match HLSL layout exactly
[StructLayout(LayoutKind.Sequential)]
public struct Particle
{
    public Vector2 Position;
    public Vector2 Velocity;
    public float Life;
    public float MaxLife;
}

const int MaxParticles = 10_000;

// Create a GPU buffer with read-write access for compute shaders
var particleBuffer = new StructuredBuffer(
    GraphicsDevice,
    typeof(Particle),
    MaxParticles,
    BufferUsage.None,
    ShaderAccess.ReadWrite
);

// Upload initial data
var initialData = new Particle[MaxParticles];
// ... populate initialData ...
particleBuffer.SetData(initialData);
```

`ShaderAccess` options:

- `ShaderAccess.ReadWrite` — compute shader can read and write (`RWStructuredBuffer` in HLSL)
- `ShaderAccess.Read` — read-only access (`StructuredBuffer` in HLSL), usable by vertex/fragment shaders

### Dispatching the Compute Shader

```csharp
private Effect _particleCompute;

public void UpdateParticlesGPU(GameTime gameTime)
{
    float dt = (float)gameTime.ElapsedGameTime.TotalSeconds;

    _particleCompute.Parameters["Particles"].SetValue(particleBuffer);
    _particleCompute.Parameters["DeltaTime"].SetValue(dt);
    _particleCompute.Parameters["Gravity"].SetValue(new Vector2(0, 98f));

    // Dispatch: ceil(MaxParticles / GROUP_SIZE) groups
    int groupCount = (MaxParticles + 63) / 64;

    foreach (var pass in _particleCompute.CurrentTechnique.Passes)
    {
        pass.ApplyCompute();
        GraphicsDevice.DispatchCompute(groupCount, 1, 1);
    }
}
```

**Critical:** Use `pass.ApplyCompute()`, not `pass.Apply()`. The latter is for draw calls.

### Reading Data Back to CPU (When Needed)

```csharp
// Only do this for debugging or infrequent operations — it stalls the GPU pipeline
var readback = new Particle[MaxParticles];
particleBuffer.GetData(readback, 0, MaxParticles);
```

Avoid per-frame readback. If you need CPU-side visibility (e.g., collision queries), consider a separate small readback buffer updated every N frames.

---

## Pattern: GPU Particle System

A complete GPU particle system uses two shaders — a compute shader to simulate and a vertex/fragment shader to render — sharing the same `StructuredBuffer`:

```csharp
public class GPUParticleSystem
{
    private StructuredBuffer _particleBuffer;
    private Effect _computeEffect;
    private Effect _renderEffect;

    public void Update(GameTime gameTime)
    {
        // 1. Run compute shader to update positions
        _computeEffect.Parameters["Particles"].SetValue(_particleBuffer);
        _computeEffect.Parameters["DeltaTime"].SetValue(
            (float)gameTime.ElapsedGameTime.TotalSeconds);

        int groups = (_particleCount + 63) / 64;
        foreach (var pass in _computeEffect.CurrentTechnique.Passes)
        {
            pass.ApplyCompute();
            GraphicsDevice.DispatchCompute(groups, 1, 1);
        }
    }

    public void Draw()
    {
        // 2. Render using the same buffer — no CPU copy needed
        //    Vertex shader reads particle positions from the StructuredBuffer
        _renderEffect.Parameters["Particles"].SetValue(_particleBuffer);
        // ... set up render state and draw instanced quads ...
    }
}
```

The vertex shader reads particle data directly:

```hlsl
StructuredBuffer<Particle> Particles; // Read-only in vertex shader

void VS(uint vertexID : SV_VertexID, uint instanceID : SV_InstanceID,
        out float4 position : SV_Position, out float alpha : TEXCOORD0)
{
    Particle p = Particles[instanceID];
    // Billboard quad from vertexID (0-3), positioned at p.Position
    float2 offsets[4] = { float2(-1,-1), float2(1,-1), float2(-1,1), float2(1,1) };
    float2 worldPos = p.Position + offsets[vertexID] * 4.0;

    position = mul(float4(worldPos, 0, 1), ViewProjection);
    alpha = saturate(p.Life / p.MaxLife);
}
```

---

## Pattern: GPU Frustum Culling

Offload visibility testing to the GPU. A compute shader tests each object's bounding sphere against the camera frustum and writes visible object indices to an append buffer:

```hlsl
struct ObjectData
{
    float3 Center;
    float Radius;
    uint MeshIndex;
};

StructuredBuffer<ObjectData> Objects;         // All scene objects (read-only)
AppendStructuredBuffer<uint> VisibleIndices;  // Output: visible object indices

float4 FrustumPlanes[6];

[numthreads(64, 1, 1)]
void FrustumCull(uint3 id : SV_DispatchThreadID)
{
    ObjectData obj = Objects[id.x];
    bool visible = true;

    [unroll]
    for (int i = 0; i < 6; i++)
    {
        float dist = dot(FrustumPlanes[i].xyz, obj.Center) + FrustumPlanes[i].w;
        if (dist < -obj.Radius)
        {
            visible = false;
            break;
        }
    }

    if (visible)
        VisibleIndices.Append(obj.MeshIndex);
}
```

On the C# side, use an append-mode `StructuredBuffer`:

```csharp
var visibleBuffer = new StructuredBuffer(
    GraphicsDevice,
    typeof(uint),
    maxObjects,
    BufferUsage.None,
    ShaderAccess.ReadWrite,
    StructuredBufferType.Append,
    0  // reset counter to 0 each dispatch
);
```

---

## Pattern: Compute Post-Processing

Use `RWTexture2D` to write directly to a texture from a compute shader — useful for full-screen effects that don't fit neatly into a pixel shader (blur with variable kernel, SSAO, bloom threshold):

```csharp
// Create a writable render target
var target = new Texture2D(
    GraphicsDevice, width, height, false,
    SurfaceFormat.Color, ShaderAccess.ReadWrite
);
```

```hlsl
RWTexture2D<float4> OutputTexture;
Texture2D<float4> InputTexture;

[numthreads(8, 8, 1)]
void BloomThreshold(uint3 id : SV_DispatchThreadID)
{
    float4 color = InputTexture[id.xy];
    float brightness = dot(color.rgb, float3(0.2126, 0.7152, 0.0722));
    OutputTexture[id.xy] = brightness > 1.0 ? color : float4(0, 0, 0, 0);
}
```

Dispatch with 2D groups: `DispatchCompute(ceil(width/8), ceil(height/8), 1)`.

---

## Performance Guidelines

**Dispatch before draw.** Run all compute dispatches at the start of your frame, before any `SpriteBatch.Begin()` or draw calls. This gives the GPU time to finish compute work before the render pass needs the results.

**Match group size to hardware.** GPU wavefronts are typically 32 threads (NVIDIA) or 64 threads (AMD). A `[numthreads(64, 1, 1)]` group size works well across both. Avoid very small groups (under 32) — they waste GPU lanes.

**Minimize readback.** `StructuredBuffer.GetData()` forces a GPU-CPU sync that stalls the pipeline. Design your systems so the GPU both writes and reads the data. Use `AppendStructuredBuffer` with `CopyCounterValue` for indirect draw arguments instead of reading counts back to the CPU.

**Barrier awareness.** MonoGame handles resource barriers automatically between compute and render passes. If you dispatch multiple compute passes that read/write the same buffer, each dispatch-to-dispatch transition is handled implicitly. For complex multi-pass compute pipelines, verify correctness by checking results with small datasets first.

**Profile with backend tools.** Use RenderDoc (Vulkan) or PIX (DirectX 12) to profile compute dispatches. MonoGame's built-in profiling does not break down compute shader time separately.

---

## Common Pitfalls

- **Struct layout mismatch.** The C# struct must match the HLSL struct exactly in field order and alignment. Use `[StructLayout(LayoutKind.Sequential)]` and be aware of HLSL packing rules (float3 takes 16 bytes in a struct, not 12).

- **Using `Apply()` instead of `ApplyCompute()`.** `pass.Apply()` sets draw state; `pass.ApplyCompute()` sets compute state. Using the wrong one produces no error but also no results.

- **Thread count overflow.** If your buffer has 10,000 elements and you dispatch `ceil(10000/64) = 157` groups of 64, that's 10,048 threads. Guard against out-of-bounds access: `if (globalID.x >= ParticleCount) return;`

- **DesktopGL fallback.** If your game needs to support DesktopGL as a fallback, you must implement a CPU-side code path for every compute operation. Use `#if` directives or a strategy pattern to switch at runtime.

---

## When to Use Compute vs CPU

| Workload | Compute shader | CPU |
|----------|---------------|-----|
| 10,000+ particles | Yes — 10-50× faster | Too slow for complex sim |
| < 500 particles | Overhead not worth it | Fine |
| Frustum culling 1,000+ objects | Yes | Fine for < 500 |
| Image processing (blur, threshold) | Yes — pixel shaders also work | Too slow |
| Pathfinding grid updates | Yes for large grids (128×128+) | Fine for small grids |
| Single-object physics | No | Yes — GPU dispatch overhead |

Compute shaders shine when you have thousands of independent work items. For small workloads, the dispatch overhead and potential sync stalls make CPU the better choice.
