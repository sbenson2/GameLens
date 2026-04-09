# G71 — Unified Ray Tracing API

> **Category:** guide · **Engine:** Unity 6.3+ (com.unity.render-pipelines.core 17.3+) · **Related:** [G10 Rendering Pipeline](G10_rendering_pipeline_urp_hdrp.md) · [G39 Render Graph Custom Passes](G39_render_graph_custom_passes.md) · [G40 GPU Rendering Optimization](G40_gpu_rendering_optimization.md) · [G43 Compute Shaders](G43_compute_shaders_gpu_programming.md) · [Unity Rules](../unity-arch-rules.md)

The **UnifiedRayTracing API** (shipped in `com.unity.render-pipelines.core` 17.3+, Unity 6.3 / 6000.3) lets you write ray tracing code **once** and run it on GPUs with or without hardware ray tracing acceleration. On GPUs with dedicated RT cores (DXR 1.1, Vulkan RT) it dispatches through the hardware path; on everything else it falls back to a compute-shader-based software implementation — same C# API, same shader files. This guide covers the architecture, API surface, shader authoring, and practical patterns.

---

## Why Unified Ray Tracing?

Before this API, Unity offered two incompatible ray tracing paths:

| Path | Requires | Works on |
|------|----------|----------|
| `RayTracingShader` + `RayTracingAccelerationStructure` | Hardware RT (DXR / Vulkan RT) | High-end PC, modern consoles |
| Manual compute-shader BVH traversal | Compute shader support | Everything with compute, but you build the BVH yourself |

The UnifiedRayTracing API bridges this gap:

```
Your Game Code (C#)
       │
       ▼
┌──────────────────────────┐
│   RayTracingContext       │  ← Entry point, selects backend
│   ┌─────────────────────┐│
│   │ IRayTracingAccelStruct││ ← Acceleration structure (BVH)
│   └─────────────────────┘│
│   ┌─────────────────────┐│
│   │ IRayTracingShader    ││ ← Your ray tracing logic
│   └─────────────────────┘│
└──────────────────────────┘
       │
       ▼
 ┌──────────┐  ┌──────────┐
 │ Hardware  │  │ Compute  │   ← Backend selected at init time
 │ RT Path   │  │ Fallback │
 └──────────┘  └──────────┘
```

**Use cases:** ambient occlusion, global illumination probes, ray-traced reflections, path tracing for baking, visibility queries, procedural geometry intersection — anything where you need GPU ray–triangle intersection without locking out mid-range hardware.

---

## Prerequisites

1. **Unity 6.3+** (editor version 6000.3 or later)
2. **URP or HDRP** project (the API lives in `com.unity.render-pipelines.core`)
3. **Compute shader support** on the target GPU (minimum requirement for the software backend)
4. For hardware acceleration: DXR 1.1 (Windows) or Vulkan Ray Tracing (Linux, Android high-end)

```csharp
// WHY: Check at runtime which backend is available so you can
// log it for diagnostics or adjust quality settings accordingly.
using UnityEngine.Rendering.UnifiedRayTracing;

bool hwRtSupported = SystemInfo.supportsRayTracing;
Debug.Log(hwRtSupported
    ? "Using hardware-accelerated ray tracing"
    : "Falling back to compute-based ray tracing");
```

---

## Core API

### 1. RayTracingContext — The Entry Point

`RayTracingContext` is the main object you create. It selects a backend (hardware or compute) and provides factory methods for acceleration structures and shaders.

```csharp
using UnityEngine.Rendering;
using UnityEngine.Rendering.UnifiedRayTracing;

public class RayTracingManager : MonoBehaviour
{
    private RayTracingContext _context;

    void Awake()
    {
        // WHY: BackendType.Auto picks hardware RT if available,
        // compute fallback otherwise. You can force a specific
        // backend for testing or quality-tier control.
        var backendType = SystemInfo.supportsRayTracing
            ? RayTracingBackendType.Hardware
            : RayTracingBackendType.Compute;

        // WHY: RayTracingResources is a ScriptableObject shipped
        // with the SRP Core package containing internal shaders
        // needed by the compute backend. Load it from Resources
        // or reference it via a serialized field.
        var resources = RayTracingResources.Load();

        _context = new RayTracingContext(backendType, resources);
    }

    void OnDestroy()
    {
        // WHY: The context owns GPU resources (buffers, acceleration
        // structures). Always dispose to prevent native memory leaks.
        _context?.Dispose();
    }
}
```

### 2. IRayTracingAccelStruct — Describing Geometry

The acceleration structure holds a Bounding Volume Hierarchy (BVH) over your mesh instances. Unlike `RayTracingAccelerationStructure`, the unified version **does not auto-sync with the scene** — you add and remove instances explicitly.

```csharp
private IRayTracingAccelStruct _accelStruct;

void BuildAccelerationStructure(Mesh[] meshes, Transform[] transforms)
{
    // WHY: CreateAccelerationStructure returns the correct
    // implementation (hardware BLAS/TLAS or compute BVH)
    // based on the context's backend.
    _accelStruct = _context.CreateAccelerationStructure(
        new AccelerationStructureOptions
        {
            // WHY: PreferFastBuild trades BVH quality for build
            // speed — good for dynamic scenes rebuilt every frame.
            // Use PreferFastTrace for static geometry queried often.
            buildFlags = BuildFlags.PreferFastBuild
        });

    for (int i = 0; i < meshes.Length; i++)
    {
        // WHY: MeshInstanceDesc tells the accel struct about one
        // piece of renderable geometry — its mesh data, transform,
        // and which submeshes to include.
        var desc = new MeshInstanceDesc(meshes[i])
        {
            localToWorldMatrix = transforms[i].localToWorldMatrix,
            enabledSubMeshes = 0xFFFFFFFF // all submeshes
        };

        _accelStruct.AddInstance(desc);
    }

    // WHY: Build() triggers the actual BVH construction on the GPU.
    // This is NOT automatic — you must call it after adding/removing
    // instances or when transforms change.
    var cmd = new CommandBuffer { name = "Build Accel Struct" };
    _accelStruct.Build(cmd);
    Graphics.ExecuteCommandBuffer(cmd);
    cmd.Release();
}
```

**Key constraints:**

- **Mesh geometries only** — no procedural AABBs or custom intersection shaders (unlike hardware-only `RayTracingAccelerationStructure`)
- **Manual updates required** — call `Build()` after any structural or transform change
- **Instance limit** — practical limit depends on GPU memory; profile with the Memory Profiler

### 3. IRayTracingShader — Ray Tracing Logic

Unified ray tracing shaders are written in `.raytrace` files using a restricted HLSL subset that compiles to both hardware RT shaders and compute kernels.

```hlsl
// WHY: The unified shader format uses #include from the SRP Core
// package to get cross-backend compatible ray tracing intrinsics.
#include "Packages/com.unity.render-pipelines.core/Runtime/UnifiedRayTracing/UnifiedRayTracing.hlsl"

// Output texture where we write ray tracing results
RWTexture2D<float4> _OutputTexture;

// Camera matrices for generating rays
float4x4 _CameraInverseProjection;
float4x4 _CameraToWorld;

// WHY: [shader("raygeneration")] marks the entry point that runs
// once per pixel (or per ray). This attribute works on both backends.
[shader("raygeneration")]
void MainRayGen()
{
    uint2 dispatchIdx = DispatchRaysIndex().xy;
    uint2 dispatchDim = DispatchRaysDimensions().xy;

    // Generate a camera ray for this pixel
    float2 uv = (float2(dispatchIdx) + 0.5) / float2(dispatchDim);
    float2 ndc = uv * 2.0 - 1.0;
    ndc.y = -ndc.y; // Unity uses top-left origin

    // WHY: Transform from clip space through inverse projection
    // and camera-to-world to get a world-space ray direction.
    float4 clipPos = float4(ndc, 1.0, 1.0);
    float4 viewPos = mul(_CameraInverseProjection, clipPos);
    viewPos /= viewPos.w;

    float3 rayOrigin = mul(_CameraToWorld, float4(0, 0, 0, 1)).xyz;
    float3 rayDir = normalize(mul(_CameraToWorld, viewPos).xyz - rayOrigin);

    // WHY: TraceRay is the unified intrinsic. On hardware backends
    // it maps to DXR TraceRay; on compute it runs BVH traversal.
    // Returns immediately on first hit (no closest-hit shader chaining).
    RayDesc ray;
    ray.Origin = rayOrigin;
    ray.Direction = rayDir;
    ray.TMin = 0.001;
    ray.TMax = 1000.0;

    UnifiedRT::Hit hit = UnifiedRT::TraceRayClosestHit(ray);

    float4 color = float4(0, 0, 0, 1); // miss = black
    if (hit.IsValid())
    {
        // WHY: Simple normal visualization — replace with your
        // actual shading (AO, GI, reflections, etc.)
        float3 normal = hit.normal;
        color = float4(normal * 0.5 + 0.5, 1.0);
    }

    _OutputTexture[dispatchIdx] = color;
}
```

### 4. Dispatching Rays from C#

```csharp
private IRayTracingShader _shader;
private RenderTexture _outputRT;

void SetupShader()
{
    // WHY: Load the .raytrace file. The context compiles it for
    // the active backend (hardware RT shader or compute kernel).
    var shaderAsset = Resources.Load<RayTracingShaderAsset>("MyRayTracing");
    _shader = _context.CreateRayTracingShader(shaderAsset);

    _outputRT = new RenderTexture(Screen.width, Screen.height, 0,
        RenderTextureFormat.ARGBFloat)
    {
        enableRandomWrite = true // WHY: required for UAV binding
    };
    _outputRT.Create();
}

void DispatchRayTracing(Camera cam)
{
    var cmd = new CommandBuffer { name = "Ray Trace" };

    // Bind resources to the shader
    _shader.SetTexture(cmd, "_OutputTexture", _outputRT);
    _shader.SetMatrix(cmd, "_CameraInverseProjection",
        cam.projectionMatrix.inverse);
    _shader.SetMatrix(cmd, "_CameraToWorld",
        cam.cameraToWorldMatrix);

    // WHY: SetAccelerationStructure connects the BVH so
    // TraceRay calls in the shader can query geometry.
    _shader.SetAccelerationStructure(cmd, _accelStruct);

    // WHY: Dispatch launches one ray-gen invocation per pixel.
    // The dimensions match the output texture size.
    _shader.Dispatch(cmd, (uint)_outputRT.width, (uint)_outputRT.height, 1);

    Graphics.ExecuteCommandBuffer(cmd);
    cmd.Release();
}
```

---

## Practical Patterns

### Ambient Occlusion Pass

```csharp
// WHY: AO is an ideal first use case for unified RT —
// it's a local effect (short rays), visually forgiving
// of the compute fallback's lower throughput, and provides
// a clear visual improvement over SSAO.

void DispatchAO(Camera cam, RenderTexture gBufferNormals,
    RenderTexture gBufferDepth)
{
    var cmd = new CommandBuffer { name = "RT Ambient Occlusion" };

    _aoShader.SetTexture(cmd, "_GBufferNormals", gBufferNormals);
    _aoShader.SetTexture(cmd, "_GBufferDepth", gBufferDepth);
    _aoShader.SetTexture(cmd, "_AOOutput", _aoRT);
    _aoShader.SetAccelerationStructure(cmd, _accelStruct);
    _aoShader.SetInt(cmd, "_SamplesPerPixel", 4);
    _aoShader.SetFloat(cmd, "_MaxDistance", 2.0f);

    _aoShader.Dispatch(cmd, (uint)_aoRT.width, (uint)_aoRT.height, 1);
    Graphics.ExecuteCommandBuffer(cmd);
    cmd.Release();
}
```

### Dynamic Scene Updates

```csharp
// WHY: For scenes with moving objects, rebuild the TLAS every frame.
// Only call Build() — the BLAS (per-mesh BVH) is cached if the
// mesh topology hasn't changed.

void LateUpdate()
{
    // Update transforms for all moving instances
    for (int i = 0; i < _dynamicInstances.Count; i++)
    {
        _accelStruct.UpdateInstanceTransform(
            _dynamicInstances[i].instanceId,
            _dynamicInstances[i].transform.localToWorldMatrix);
    }

    // WHY: Rebuild only the top-level structure.
    // Bottom-level structures (per-mesh) are reused.
    var cmd = new CommandBuffer { name = "Update TLAS" };
    _accelStruct.Build(cmd);
    Graphics.ExecuteCommandBuffer(cmd);
    cmd.Release();
}
```

### Quality Tier Scaling

```csharp
// WHY: Use the backend type to scale ray counts. Hardware RT
// can handle more rays per pixel at interactive framerates;
// the compute fallback should use fewer rays and larger
// temporal accumulation to compensate.

int GetSamplesPerPixel()
{
    return _context.BackendType switch
    {
        RayTracingBackendType.Hardware => 4,  // full quality
        RayTracingBackendType.Compute  => 1,  // lean on denoiser
        _ => 1
    };
}
```

---

## Performance Guidelines

| Guideline | Why |
|-----------|-----|
| **Prefer `PreferFastTrace`** for static geometry | BVH is built once but queried every frame — optimize for traversal |
| **Prefer `PreferFastBuild`** for dynamic scenes | Rebuilt every frame — minimize build cost even if traversal is slightly slower |
| **Limit ray count on compute backend** | Software traversal is 5–20× slower than hardware RT; use 1 SPP + denoiser |
| **Batch instance adds before Build()** | Each `Build()` is a GPU dispatch; adding 1000 instances then building once is far cheaper than building 1000 times |
| **Dispose everything** | `RayTracingContext`, `IRayTracingAccelStruct`, and `IRayTracingShader` all own GPU resources |
| **Profile with GPU Profiler** | Look for `BuildAccelerationStructure` and `DispatchRays` markers |
| **Use half-res for AO / GI** | Dispatch at half resolution and bilateral upsample — halves ray count with minimal quality loss |

---

## Limitations vs. Hardware-Only API

| Feature | UnifiedRayTracing | Hardware-only (`RayTracingShader`) |
|---------|-------------------|-------------------------------------|
| Auto scene sync | No (manual `AddInstance` / `Build`) | Yes (`BuildMode.Automatic`) |
| Procedural geometry (AABBs) | No | Yes (intersection shaders) |
| Any-hit / closest-hit shader chaining | No (single `TraceRayClosestHit`) | Yes (full DXR shader table) |
| Multi-bounce recursive traces | Manual loop in ray-gen | Recursive `TraceRay` calls |
| Compute fallback | Yes | No |
| Platform reach | Any GPU with compute shaders | DXR 1.1 / Vulkan RT only |

If your project exclusively targets high-end hardware and needs the full DXR shader table (any-hit, intersection, miss shaders with recursive dispatch), use the hardware-only `RayTracingShader` API. For everything else — especially cross-platform titles — the unified API gives you broader reach with simpler code.

---

## Integration with Render Graph

In Unity 6.1+, custom render passes use the Render Graph API. To integrate unified ray tracing into a URP render pass:

```csharp
// WHY: Render Graph manages resource lifetimes and pass ordering.
// Declare your RT output as a graph-managed texture so the
// compiler can alias memory and schedule correctly.

class RTAmbientOcclusionPass : ScriptableRenderPass
{
    public override void RecordRenderGraph(RenderGraph renderGraph,
        ContextContainer frameData)
    {
        var aoTexture = renderGraph.CreateTexture(new TextureDesc(
            Vector2.one, true) // full-res, dynamic scaling
        {
            colorFormat = GraphicsFormat.R8_UNorm,
            enableRandomWrite = true, // UAV for RT output
            name = "RT_AO"
        });

        using (var builder = renderGraph.AddComputePass(
            "RT Ambient Occlusion", out PassData passData))
        {
            passData.aoTexture = builder.UseTexture(aoTexture,
                AccessFlags.Write);

            // WHY: SetRenderFunc must be static to prevent
            // accidental capture of pass state (Render Graph rule).
            builder.SetRenderFunc(static (PassData data,
                ComputeGraphContext ctx) =>
            {
                // Dispatch unified RT shader via command buffer
                // (implementation follows the patterns above)
            });
        }
    }
}
```

---

## Checklist

- [ ] Verify `SystemInfo.supportsRayTracing` for backend selection logging
- [ ] Load `RayTracingResources` from the SRP Core package
- [ ] Create `RayTracingContext` with explicit backend or `Auto`
- [ ] Build acceleration structure **after** all instances are added
- [ ] Rebuild TLAS every frame for dynamic scenes
- [ ] Scale ray count by backend type (hardware = more, compute = fewer + denoise)
- [ ] Dispose context, accel struct, and shader in `OnDestroy()`
- [ ] Profile with GPU Profiler markers
- [ ] Test on both hardware RT and compute-only GPUs
