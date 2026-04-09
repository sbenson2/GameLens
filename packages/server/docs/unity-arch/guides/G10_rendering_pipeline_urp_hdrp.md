# G10 — Rendering Pipeline: URP & HDRP

> **Category:** guide · **Engine:** Unity 6 (6000.x) · **Related:** [E1 Architecture Overview](../architecture/E1_architecture_overview.md) · [R1 Capability Matrix](../reference/R1_capability_matrix.md) · [G5 UI Toolkit](G5_ui_toolkit.md)

Unity 6 ships two Scriptable Render Pipelines (SRPs): the **Universal Render Pipeline (URP)** for cross-platform performance and the **High Definition Render Pipeline (HDRP)** for high-fidelity visuals on PC and consoles. This guide covers when to choose each, how they're structured, and how to extend them with custom render passes using the Render Graph API.

---

## Choosing Between URP and HDRP

### URP — The Default Choice for Most Projects

URP is Unity's primary pipeline going forward. In 2026, Unity announced that URP will receive all new rendering features, including advanced 3D lighting for dynamic and procedural worlds. Choose URP when:

- **Multi-platform targets** — mobile, VR, Switch, PC, and consoles from a single pipeline
- **Performance budgets are tight** — URP is optimized for lower-end hardware while scaling up
- **You want the latest features** — new rendering capabilities land in URP first

```
URP Sweet Spot
──────────────────────────────────────────
Mobile / VR ◄────── URP ──────► PC / Console
   Low-end              Scales up via quality settings
```

### HDRP — Photorealistic Fidelity

HDRP targets high-end PC and consoles with advanced features like ray tracing, volumetric lighting, and screen-space reflections. As of 2026, HDRP is in **maintenance mode** — it receives platform expansions (e.g., Nintendo Switch 2 support) but no new features. Choose HDRP only when:

- You need ray-traced reflections, caustics, or path tracing
- Your target is exclusively high-end PC / current-gen consoles
- Your project is already built on HDRP and migration would be costly

### Pipeline Comparison

| Feature | URP | HDRP |
|---|---|---|
| Mobile / VR | Yes | No |
| Console / PC | Yes | Yes |
| Ray Tracing | Limited | Full |
| Volumetric Fog | Probe-based | Native |
| Custom Post-Processing | Renderer Features | Custom Passes + Volume Overrides |
| Render Graph API | Yes (Unity 6+) | Yes (Unity 6+) |
| Active development | Yes (primary) | Maintenance only |

---

## URP Architecture

### The Rendering Loop

URP processes each camera through a list of **Render Passes** that execute in sequence. The pipeline is data-driven and extensible via **Scriptable Renderer Features**.

```
Camera renders ──► ForwardRenderer
                      │
                      ├── DepthPrePass
                      ├── OpaquePass (SRP Batcher groups draws)
                      ├── SkyboxPass
                      ├── TransparentPass
                      ├── [Your Custom Renderer Features]
                      └── PostProcessPass (Bloom, Tonemapping, etc.)
```

### Key URP Concepts

**SRP Batcher** — Groups draw calls by shader variant, dramatically reducing CPU overhead. Enabled by default. Works automatically when shaders use `CBUFFER` blocks for per-material properties.

**GPU Resident Drawer (Unity 6)** — Keeps mesh data GPU-side between frames, eliminating redundant uploads. Opt in via URP Asset settings. Provides the biggest wins for scenes with many static objects.

**Render Graph API (Unity 6+)** — The modern way to define render passes. Replaces the older `ScriptableRenderPass.Execute()` method with `RecordRenderGraph()`, which declares resource dependencies so the engine can optimize execution order and memory.

### Creating a Custom Renderer Feature (URP)

Renderer Features are how you inject custom rendering logic into URP. Every feature gets two hooks: `Create()` (initialization) and `AddRenderPasses()` or `RecordRenderGraph()` (per-frame work).

```csharp
using UnityEngine;
using UnityEngine.Rendering;
using UnityEngine.Rendering.Universal;
using UnityEngine.Rendering.RenderGraphModule;

// A Renderer Feature that applies a full-screen blur effect.
// WHY use a Renderer Feature? It integrates cleanly with URP's pass
// ordering and resource management, rather than hacking into OnRenderImage.
public class BlurRendererFeature : ScriptableRendererFeature
{
    // Exposed in the Renderer Asset inspector so designers can tweak settings
    // without touching code — keeps rendering configurable at the project level.
    [SerializeField] private Material blurMaterial;
    [SerializeField, Range(1, 10)] private int blurPasses = 3;

    // Create() is called when the feature loads or a property changes.
    // WHY here and not in a constructor? Unity controls the lifecycle of
    // ScriptableRendererFeatures — Create() is the safe initialization point.
    public override void Create()
    {
        // Validate material early to surface errors in the editor
        // rather than at runtime when debugging is harder.
        if (blurMaterial == null)
        {
            Debug.LogWarning("BlurRendererFeature: No material assigned.");
        }
    }

    // RecordRenderGraph is the Unity 6+ approach — it DECLARES what the pass
    // needs (inputs, outputs) without issuing draw commands yet. The render
    // graph compiler then optimizes execution order and memory.
    // WHY this over the old Execute()? The graph approach enables automatic
    // resource lifetime management and pass culling for unused outputs.
    public override void AddRenderPasses(ScriptableRenderer renderer,
                                          ref RenderingData renderingData)
    {
        // Only run for Game cameras — skip scene view, previews, etc.
        // WHY filter? Running expensive effects on every camera wastes
        // GPU time and can cause visual glitches in editor previews.
        if (renderingData.cameraData.cameraType != CameraType.Game)
            return;

        if (blurMaterial == null)
            return;

        // Enqueue the actual render pass (shown below).
        var pass = new BlurRenderPass(blurMaterial, blurPasses);
        renderer.EnqueuePass(pass);
    }
}
```

### Shader Graph Integration

URP and HDRP both support **Shader Graph** — Unity's node-based shader editor. For custom rendering:

- Use Shader Graph for surface shaders (lit, unlit, particle, decal)
- Use hand-written HLSL for full-screen post-process effects and compute shaders
- Shader Graph outputs are SRP-Batcher compatible by default

---

## HDRP Architecture

### Custom Passes and Volume Overrides

HDRP uses a **Volume system** for post-processing and rendering overrides. Custom Passes let you inject rendering at specific points in the HDRP pipeline.

```
HDRP Injection Points
──────────────────────────────────
Before Rendering  ─► Before opaque depth/normals
After Opaque      ─► After all opaque geometry
Before Refraction ─► Before transparent pre-pass
Before Transparent─► Before transparent geometry
Before Post       ─► Before post-processing
After Post        ─► After post-processing (UI overlay)
```

### Custom Pass Volume Setup

```csharp
using UnityEngine;
using UnityEngine.Rendering.HighDefinition;
using UnityEngine.Rendering;

// HDRP Custom Passes use a different pattern than URP.
// WHY? HDRP's volume-based system allows spatial blending
// of rendering effects — enter a fog zone and effects fade in.
public class OutlineCustomPass : CustomPass
{
    public LayerMask outlineLayer = 0;
    public Color outlineColor = Color.white;
    public float outlineWidth = 3f;

    // Setup is called once when the pass is created.
    // WHY separate from Execute? Heavy allocations (render textures,
    // materials) go here to avoid per-frame GC pressure.
    protected override void Setup(ScriptableRenderContext ctx,
                                   CommandBuffer cmd)
    {
        // Allocate any persistent resources here.
    }

    // Execute runs every frame for each camera affected by this volume.
    // WHY a CommandBuffer? HDRP records GPU commands into a buffer that
    // can be batched and reordered for optimal GPU utilization.
    protected override void Execute(CustomPassContext ctx)
    {
        // Draw objects on the outline layer with a custom shader.
        // CoreUtils provides helpers that handle SRP-specific state.
        CoreUtils.SetRenderTarget(ctx.cmd, ctx.cameraColorBuffer);

        // Custom drawing logic would go here — render the outlined
        // objects to a temp RT, then composite with an edge-detect shader.
    }

    // Cleanup releases resources allocated in Setup.
    // WHY explicit cleanup? GPU resources aren't garbage-collected —
    // leaking render textures causes memory bloat on the GPU.
    protected override void Cleanup()
    {
        // Release any render textures or materials.
    }
}
```

---

## Render Graph API (Unity 6+)

Both URP and HDRP are migrating to the **Render Graph API**, which replaces the older immediate-mode `CommandBuffer` approach with a declarative graph of passes and resources.

### Why Render Graph Matters

| Old Approach | Render Graph |
|---|---|
| Manual resource creation/destruction | Automatic lifetime management |
| Passes always execute | Unused passes get culled |
| Developer manages execution order | Graph compiler optimizes ordering |
| Easy to leak GPU memory | Resources scoped to pass lifetimes |

### Render Graph Pass Pattern (URP)

```csharp
using UnityEngine.Rendering.RenderGraphModule;

// PassData is a plain class that holds references to everything
// the pass needs. WHY a separate data class? The render graph
// separates declaration (what you need) from execution (what you do),
// enabling the compiler to optimize across passes.
class BlurPassData
{
    public TextureHandle source;
    public TextureHandle destination;
    public Material material;
    public int iterations;
}

// Inside your ScriptableRenderPass:
public override void RecordRenderGraph(RenderGraph renderGraph,
                                        ContextContainer frameData)
{
    // Declare a new pass in the graph.
    using (var builder = renderGraph.AddRasterRenderPass<BlurPassData>(
        "Blur Pass", out var passData))
    {
        // Read the camera color as input.
        var cameraData = frameData.Get<UniversalCameraData>();
        passData.source = cameraData.activeColorTexture;

        // Create a temporary texture for output.
        // WHY let the graph create it? The graph pools and reuses
        // textures automatically, reducing VRAM pressure.
        var desc = cameraData.cameraTargetDescriptor;
        passData.destination = renderGraph.CreateTexture(desc);

        passData.material = blurMaterial;
        passData.iterations = blurPasses;

        // Declare that we read from source and write to destination.
        // WHY declare dependencies? This lets the compiler prove that
        // passes don't conflict and can run in parallel on the GPU.
        builder.UseTexture(passData.source, AccessFlags.Read);
        builder.SetRenderAttachment(passData.destination, 0);

        // SetRenderFunc runs on the render thread — keep it lean.
        builder.SetRenderFunc((BlurPassData data,
                                RasterGraphContext context) =>
        {
            // Blit source → destination through the blur material.
            Blitter.BlitTexture(context.cmd, data.source,
                                Vector4.one, data.material, 0);
        });
    }
}
```

---

## Common Pitfalls

### 1. Switching Pipelines Mid-Project

Materials, shaders, and lighting are **not compatible** between URP, HDRP, and the Built-in pipeline. Switching mid-project requires re-authoring all materials. Choose your pipeline before production begins.

### 2. SRP Batcher Compatibility

Shaders must declare properties inside a `CBUFFER` named `UnityPerMaterial` to be SRP-Batcher compatible. Shader Graph does this automatically; hand-written shaders need manual setup.

```hlsl
// WHY a named CBUFFER? The SRP Batcher identifies materials by their
// CBUFFER layout. Matching layouts get batched into a single draw call
// set-up, reducing CPU overhead by up to 4x.
CBUFFER_START(UnityPerMaterial)
    float4 _BaseColor;
    float _Smoothness;
CBUFFER_END
```

### 3. Obsolete APIs in Unity 6

The old `ScriptableRenderPass.Execute()` and `OnCameraSetup()` methods are **obsolete** in Unity 6. Use `RecordRenderGraph()` instead. Legacy code will still compile but emits warnings and bypasses Render Graph optimizations.

---

## Further Reading

- [E1 Architecture Overview](../architecture/E1_architecture_overview.md) — How the rendering pipeline fits into Unity's overall architecture
- [G5 UI Toolkit](G5_ui_toolkit.md) — UI rendering integrates with URP's overlay camera system
- [G9 Addressables](G9_addressables_asset_management.md) — Load shader variants and materials on demand
- Unity Docs: [URP Renderer Features](https://docs.unity3d.com/6000.1/Documentation/Manual/urp/renderer-features/create-custom-renderer-feature.html)
- Unity Docs: [Render Graph API](https://docs.unity3d.com/6000.3/Documentation/Manual/urp/renderer-features/custom-rendering-pass-workflow-in-urp.html)
