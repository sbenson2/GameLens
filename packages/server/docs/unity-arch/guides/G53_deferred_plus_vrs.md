# G53 — Deferred+ Rendering & Variable Rate Shading (VRS)

> **Category:** guide · **Engine:** Unity 6.1+ (6000.1) · **Related:** [G10 Rendering Pipeline URP/HDRP](G10_rendering_pipeline_urp_hdrp.md) · [G39 Render Graph Custom Passes](G39_render_graph_custom_passes.md) · [G40 GPU Rendering Optimization](G40_gpu_rendering_optimization.md) · [Unity Rules](../unity-arch-rules.md)

Unity 6.1 introduces two major rendering features in URP: **Deferred+**, a cluster-based deferred rendering path that handles many dynamic lights efficiently without the memory overhead of traditional deferred, and a **Variable Rate Shading (VRS) API** that lets you reduce per-pixel shading cost in specific screen regions. Both target GPU-bound scenarios on modern hardware.

---

## Deferred+ Rendering Path

### What Problem Does It Solve?

Traditional Deferred rendering in URP stores per-pixel data in a G-buffer, then lights every pixel in screen space. This removes the per-object light limit of Forward rendering but carries a fixed memory cost for the G-buffer — a problem on lower-end hardware or when many render targets are needed.

**Deferred+** combines the G-buffer approach with **cluster-based light culling** (similar to what Forward+ uses) and integrates with the **GPU Resident Drawer** introduced in Unity 6.0. The result: unlimited dynamic lights on opaque objects with lower memory overhead and better GPU utilization.

```
Rendering Path Comparison (URP 6.1+)
───────────────────────────────────────────────────────
Forward       │ Per-object light limit (8 default)
              │ Simple, low memory, good for mobile
───────────────────────────────────────────────────────
Forward+      │ Cluster-based culling, no light limit
              │ No G-buffer cost, but per-pixel lighting
───────────────────────────────────────────────────────
Deferred      │ G-buffer + screen-space lighting
              │ No light limit, but fixed G-buffer memory
───────────────────────────────────────────────────────
Deferred+     │ G-buffer + cluster-based culling
(NEW in 6.1)  │ No light limit, reduced memory, GPU Resident Drawer
───────────────────────────────────────────────────────
```

### When to Use Deferred+

Choose Deferred+ when:
- Your scene has **many dynamic lights** (dozens to hundreds)
- You target **PC, consoles, or high-end mobile** (DirectX 12, Vulkan, Metal)
- You want to pair deferred lighting with the GPU Resident Drawer for draw-call batching
- Memory overhead of traditional Deferred is a concern

Stick with Forward or Forward+ when:
- You target **low-end mobile** or need minimal G-buffer memory
- Your scenes have few lights and Forward's per-object limit isn't hit
- You need extensive custom transparent lighting

### Setup

1. Open your **URP Universal Renderer** asset
2. Navigate to **Lighting → Rendering Path**
3. Select **Deferred+**

```
// WHY: Deferred+ is configured at the asset level, not per-camera.
// The Renderer asset is typically at:
// Assets/Settings/URP-HighFidelity-Renderer.asset
//
// You can also set the rendering path via script:
using UnityEngine.Rendering.Universal;

// Get the renderer data asset (cast from ScriptableRendererData)
var rendererData = urpAsset.scriptableRendererData as UniversalRendererData;

// WHY: Check if the API is available before setting, since
// Deferred+ requires Unity 6.1+ and URP 17.1+
if (rendererData != null)
{
    // RenderingPath enum includes DeferredPlus in URP 17.1 (Unity 6.1)
    rendererData.renderingPath = RenderingPath.DeferredPlus;
}
```

### G-Buffer Layout

Deferred+ uses the same G-buffer layout as standard Deferred in URP, but the cluster-based culling step replaces the per-pixel light loop:

| G-Buffer | Format | Contents |
|----------|--------|----------|
| GBuffer0 | RGBA32 | Albedo (RGB), MaterialFlags (A) |
| GBuffer1 | RGBA32 | Specular (RGB), Occlusion (A) |
| GBuffer2 | RGBA8_SNorm | World Normal (RGB), Smoothness (A) |
| GBuffer3 | Varies | Lighting accumulation |
| Depth | D32_Float | Hardware depth buffer |

### Custom Shaders for Deferred+

Shaders must be tagged for the G-buffer pass. If your shader already works with URP Deferred, it works with Deferred+ — no changes needed.

```hlsl
// WHY: The "UniversalGBuffer" LightMode tag tells URP to include
// this pass during the G-buffer fill phase of both Deferred and Deferred+.
// Without this tag, the object falls back to ForwardOnly rendering.

Shader "Custom/MyDeferredLit"
{
    SubShader
    {
        Tags { "RenderPipeline" = "UniversalPipeline" }

        // G-buffer pass — used by Deferred and Deferred+
        Pass
        {
            Name "GBuffer"
            Tags { "LightMode" = "UniversalGBuffer" }

            HLSLPROGRAM
            #pragma vertex vert
            #pragma fragment frag
            #include "Packages/com.unity.render-pipelines.universal/ShaderLibrary/Core.hlsl"
            #include "Packages/com.unity.render-pipelines.universal/ShaderLibrary/Lighting.hlsl"

            // ... standard vertex/fragment implementation
            // Output to G-buffer render targets using FragmentOutput struct
            ENDHLSL
        }

        // WHY: ForwardOnly pass is a fallback for transparent objects
        // or when the camera overrides to Forward rendering.
        Pass
        {
            Name "ForwardLit"
            Tags { "LightMode" = "UniversalForwardOnly" }
            // ... forward pass implementation
        }

        // WHY: DepthNormalsOnly is needed for SSAO and other
        // screen-space effects that run before the G-buffer pass.
        Pass
        {
            Name "DepthNormals"
            Tags { "LightMode" = "DepthNormalsOnly" }
            // ... depth/normal output
        }
    }
}
```

### Performance Tips

- **Enable GPU Resident Drawer** in URP settings — Deferred+ is designed to work with it for automatic draw-call batching
- **Accurate G-buffer normals** (octahedral encoding) improve lighting quality at a small ALU cost — enable for PC/consoles, consider disabling for mobile
- **Light layers** work with Deferred+ to cull lights per-layer, further reducing shading cost
- Profile with the **GPU Profiler** module — look for `DeferredPlus.ClusterLighting` markers

---

## Variable Rate Shading (VRS)

### What Is VRS?

Variable Rate Shading lets you shade groups of pixels at a reduced rate instead of per-pixel. A 2×2 shading rate means one fragment shader invocation covers a 2×2 pixel block — a potential 4× reduction in pixel shader cost for that region.

```
Shading Rate Visualization
┌────┬────┬────┬────┐
│1×1 │1×1 │2×2      │   Center of screen: full rate (1×1)
├────┼────┤         │   Edges: reduced rate (2×2)
│1×1 │1×1 │         │   
├────┴────┼────┬────┤   WHY: Players focus on screen center.
│2×2      │2×2      │   Peripheral quality loss is less noticeable,
│         │         │   but the GPU savings are significant.
└─────────┴─────────┘
```

### Platform Support (Unity 6.1+)

| Platform | Graphics API | VRS Tier |
|----------|-------------|----------|
| Windows PC | DirectX 12 | Per-draw + Per-image-tile |
| Windows PC | Vulkan | Per-draw + Per-image-tile |
| Android | Vulkan | Per-draw + Per-image-tile (device-dependent) |
| PlayStation 5 Pro | Native | Per-image-tile |
| Xbox Series X/S | DirectX 12 | Per-draw + Per-image-tile |

### Key API: `ShadingRateInfo`

The `UnityEngine.Rendering.ShadingRateInfo` class provides capability queries and format information:

```csharp
using UnityEngine;
using UnityEngine.Rendering;

public class VRSCapabilityCheck : MonoBehaviour
{
    void Start()
    {
        // WHY: Always check hardware support before enabling VRS.
        // Not all GPUs support per-image-tile shading rates.
        if (ShadingRateInfo.supportsPerImageTile)
        {
            Debug.Log("VRS per-image-tile supported!");
            Debug.Log($"Tile size: {ShadingRateInfo.tileSize}");
            Debug.Log($"Graphics format: {ShadingRateInfo.graphicsFormat}");
        }
        else
        {
            Debug.Log("VRS per-image-tile NOT supported on this device.");
        }

        // WHY: Per-draw shading rate is a simpler form of VRS
        // that sets a single rate for an entire draw call.
        if (ShadingRateInfo.supportsPerDrawCall)
        {
            Debug.Log("Per-draw VRS supported.");
        }
    }
}
```

### Implementing a VRS Renderer Feature

The primary way to use VRS in URP is through a custom **ScriptableRendererFeature** that generates a shading rate image and attaches it to render passes.

```csharp
using UnityEngine;
using UnityEngine.Experimental.Rendering;
using UnityEngine.Rendering;
using UnityEngine.Rendering.Universal;
using UnityEngine.Rendering.RenderGraphModule;

// WHY: A ScriptableRendererFeature is URP's extension point for injecting
// custom render passes. We use it to generate and apply a VRS image
// before the main opaque rendering pass.
public class VRSShadingRateFeature : ScriptableRendererFeature
{
    [Header("VRS Settings")]
    [Tooltip("Enable radial falloff — full rate at center, reduced at edges")]
    public bool useRadialFalloff = true;

    [Range(0f, 1f)]
    [Tooltip("Radius of the full-rate center region (0-1 normalized)")]
    public float centerRadius = 0.3f;

    private VRSShadingRatePass _pass;

    public override void Create()
    {
        // WHY: Only create the pass if the hardware supports VRS.
        // This avoids errors on unsupported platforms.
        if (!ShadingRateInfo.supportsPerImageTile)
        {
            Debug.LogWarning("VRS: Per-image-tile not supported. Feature disabled.");
            return;
        }

        _pass = new VRSShadingRatePass(useRadialFalloff, centerRadius);
        // WHY: BeforeRenderingOpaques ensures the shading rate image
        // is ready before any opaque geometry is drawn.
        _pass.renderPassEvent = RenderPassEvent.BeforeRenderingOpaques;
    }

    public override void AddRenderPasses(ScriptableRenderer renderer, ref RenderingData renderingData)
    {
        if (_pass != null)
        {
            renderer.EnqueuePass(_pass);
        }
    }
}
```

### Shading Rate Image Generation (Render Graph)

```csharp
// WHY: This pass runs in the Render Graph and produces a texture where
// each texel encodes the shading rate for a screen-space tile.
// The tile size is hardware-defined (typically 8×8 or 16×16 pixels).
public class VRSShadingRatePass : ScriptableRenderPass
{
    private bool _radialFalloff;
    private float _centerRadius;

    public VRSShadingRatePass(bool radialFalloff, float centerRadius)
    {
        _radialFalloff = radialFalloff;
        _centerRadius = centerRadius;
    }

    // Render Graph recording — Unity 6.1+ pattern
    public override void RecordRenderGraph(RenderGraph renderGraph,
        ContextContainer frameData)
    {
        var cameraData = frameData.Get<UniversalCameraData>();
        var tileSize = ShadingRateInfo.tileSize;

        // WHY: The shading rate image dimensions are the screen size
        // divided by the tile size. Each texel = one tile on screen.
        int width = Mathf.CeilToInt((float)cameraData.cameraTargetDescriptor.width / tileSize.x);
        int height = Mathf.CeilToInt((float)cameraData.cameraTargetDescriptor.height / tileSize.y);

        var desc = new RenderTextureDescriptor(width, height,
            ShadingRateInfo.graphicsFormat, GraphicsFormat.None);
        // WHY: enableShadingRate tells the driver this texture
        // will be used as a shading rate attachment.
        desc.enableShadingRate = true;

        var sriHandle = UniversalRenderer.CreateRenderGraphTexture(
            renderGraph, desc, "VRS_ShadingRateImage", false);

        // Build the pass that writes shading rate values
        using (var builder = renderGraph.AddComputePass("GenerateVRS", out PassData passData))
        {
            passData.sriTexture = sriHandle;
            passData.width = width;
            passData.height = height;
            passData.radialFalloff = _radialFalloff;
            passData.centerRadius = _centerRadius;

            builder.UseTexture(sriHandle, AccessFlags.Write);

            // WHY: SetShadingRateImageAttachment tells URP to bind
            // this texture as the VRS image for subsequent passes.
            builder.SetShadingRateImageAttachment(sriHandle);

            // WHY: The combiner controls how per-draw and per-image-tile
            // rates interact. Passthrough uses the image rate directly.
            builder.SetShadingRateCombiner(
                ShadingRateCombinerStage.PerImage,
                ShadingRateCombiner.Passthrough);

            builder.SetRenderFunc(static (PassData data, ComputeGraphContext ctx) =>
            {
                // Generate shading rate values per tile
                // (In production, use a compute shader for this)
                // ...
            });
        }
    }

    private class PassData
    {
        public TextureHandle sriTexture;
        public int width;
        public int height;
        public bool radialFalloff;
        public float centerRadius;
    }
}
```

### VRS Strategies for Games

| Strategy | Description | Best For |
|----------|-------------|----------|
| **Radial falloff** | Full rate at screen center, 2×2 or 4×4 at edges | First-person, third-person games |
| **Motion-based** | Reduce rate for fast-moving screen regions | Racing, action games |
| **Content-adaptive** | Reduce rate for low-contrast areas | Open-world, atmospheric scenes |
| **VR foveated** | Full rate at gaze point, reduced periphery | VR with eye tracking |
| **UI-aware** | Full rate under UI elements, reduced elsewhere | HUD-heavy games |

### Performance Expectations

VRS savings depend heavily on the scene's pixel shader complexity:

- **Simple shaders** (unlit, basic Lit): 5–15% GPU time savings
- **Complex shaders** (PBR + many texture samples): 15–30% savings
- **Post-processing passes**: VRS does not apply (screen-space quad)
- **Transparent objects**: VRS applies per-draw, not per-image-tile

### Profiling VRS

Use the **GPU Profiler** module (Window → Analysis → Profiler → GPU) and look for:
- `VRS.GenerateShadingRateImage` — cost of generating the rate image
- Compare frame times with VRS enabled vs. disabled
- Use **RenderDoc** or **PIX** to inspect the shading rate image visually

---

## Combining Deferred+ and VRS

Deferred+ and VRS complement each other:

1. **Deferred+** reduces the per-light cost through cluster culling
2. **VRS** reduces the per-pixel shading cost across the screen

Together, they tackle GPU-bound scenarios from two angles. Enable both when your scene has many lights AND complex pixel shaders.

```
GPU Cost Reduction Stack
─────────────────────────────────────
GPU Resident Drawer → fewer draw calls
Deferred+           → fewer wasted light calculations
VRS                 → fewer pixel shader invocations
─────────────────────────────────────
Result: significantly higher throughput
        for visually dense scenes
```

---

## Troubleshooting

| Issue | Cause | Fix |
|-------|-------|-----|
| Deferred+ not available in dropdown | URP version < 17.1 | Update to Unity 6.1+ |
| VRS has no effect | GPU doesn't support Tier 2 VRS | Check `ShadingRateInfo.supportsPerImageTile` at runtime |
| Visible tile artifacts at VRS boundaries | Shading rate too aggressive | Use 2×2 max, avoid 4×4 in high-contrast areas |
| G-buffer memory higher than expected | Accurate normals enabled | Disable for mobile targets |
| Custom shader not lit in Deferred+ | Missing `UniversalGBuffer` pass | Add the GBuffer pass with correct LightMode tag |

---

## Version History

| Version | Change |
|---------|--------|
| Unity 6.0 (6000.0) | Deferred rendering path in URP, GPU Resident Drawer |
| Unity 6.1 (6000.1) | Deferred+ rendering path, `ShadingRateInfo` API, VRS support |
| Unity 6.2 (6000.2) | VRS integration with post-processing (preview) |
