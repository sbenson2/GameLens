# G74 — Spatial-Temporal Post-Processing (STP) Upscaling

> **Category:** guide · **Engine:** Unity 6.0+ (6000.0+) · **Related:** [G10 Rendering Pipeline](G10_rendering_pipeline_urp_hdrp.md) · [G40 GPU Rendering Optimization](G40_gpu_rendering_optimization.md) · [G24 Mobile Development](G24_mobile_development.md) · [G53 Deferred+ & VRS](G53_deferred_plus_vrs.md) · [Unity Rules](../unity-arch-rules.md)

Spatial-Temporal Post-Processing (STP) is Unity's built-in software upscaler, introduced in Unity 6.0 (URP 17 / HDRP 17). It renders frames at a lower internal resolution and reconstructs a full-resolution, anti-aliased image using spatial and temporal techniques — similar in goal to NVIDIA DLSS 2, AMD FSR 2, and Intel XeSS, but running entirely in software with no vendor-specific hardware requirements. STP is designed from the ground up to work across desktop, console, and mobile (including compute-capable Android/iOS), making it the first cross-platform super-resolution solution shipping inside Unity.

---

## How STP Works

STP combines two upsampling strategies:

1. **Spatial upsampling** — analyzes neighboring pixels in the current low-resolution frame to reconstruct detail at the target resolution. Uses edge-aware filtering to avoid blurring sharp boundaries.
2. **Temporal accumulation** — integrates sub-pixel information from previous frames (using motion vectors and depth) to recover detail that no single frame contains. This is why STP implicitly requires Temporal Anti-Aliasing (TAA) — it enables the jittered sampling that temporal techniques depend on.

The result is a full-resolution image that is sharper and more stable than naive bilinear upscaling, with significantly less ghosting than TAA alone.

### Platform-Adaptive Quality

STP automatically adjusts its filtering quality per platform — you do **not** configure quality presets manually:

| Platform tier | Behavior |
|---|---|
| **Desktop / Console** | Higher-quality image filtering with additional deringing logic for maximum visual fidelity |
| **Mobile (compute-capable)** | Lighter filtering that balances quality with thermal/power budget |

This auto-configuration means a single project setting works correctly across all target platforms.

---

## Requirements

| Requirement | Detail |
|---|---|
| **Unity version** | 6.0+ (6000.0+) |
| **Render pipeline** | URP 17+ or HDRP 17+ (not available in Built-in RP) |
| **GPU** | Shader Model 5.0 with compute shader support |
| **Excluded APIs** | OpenGL ES is **not** supported, even if the device has compute shaders |
| **TAA** | STP implicitly enables TAA if it is not already active |

---

## Enabling STP in URP

### Via Inspector (recommended)

1. Select your active **URP Asset** in the Project window.
2. In the Inspector, navigate to **Quality → Upscaling Filter**.
3. Select **Spatial-Temporal Post-Processing (STP)**.

STP remains active even when **Render Scale** is set to `1.0` — in that case it still applies temporal anti-aliasing to the output, improving image stability.

### Via C# (runtime toggling)

```csharp
using UnityEngine;
using UnityEngine.Rendering.Universal;

public class STPConfigurator : MonoBehaviour
{
    [SerializeField] private UniversalRenderPipelineAsset _urpAsset;

    // WHY: Allows toggling STP at runtime — useful for settings menus
    // where players choose between performance and quality modes.
    public void EnableSTP(float renderScale)
    {
        // WHY: Lowering render scale reduces GPU fill rate cost.
        // Common values: 0.5 (performance), 0.67 (balanced), 0.75 (quality).
        // STP reconstructs the final image back to native resolution.
        _urpAsset.renderScale = renderScale;

        // WHY: UpscalingFilterSelection.STP tells URP to use
        // Spatial-Temporal Post-Processing instead of bilinear or FSR.
        _urpAsset.upscalingFilter = UpscalingFilterSelection.STP;
    }

    public void DisableSTP()
    {
        _urpAsset.renderScale = 1.0f;
        _urpAsset.upscalingFilter = UpscalingFilterSelection.Auto;
    }
}
```

### Via C# in HDRP

```csharp
using UnityEngine;
using UnityEngine.Rendering.HighDefinition;

public class STPConfiguratorHDRP : MonoBehaviour
{
    [SerializeField] private HDRenderPipelineAsset _hdrpAsset;

    public void EnableSTP()
    {
        // WHY: In HDRP, STP works through the Dynamic Resolution system.
        // You must enable dynamic resolution first, then add STP to the
        // upscaler priority list. Hardware DRS lets the GPU scale
        // resolution without re-creating render targets each frame.
        var settings = _hdrpAsset.currentPlatformRenderPipelineSettings;

        // NOTE: HDRP configuration is primarily done through the Inspector:
        // Rendering → Dynamic Resolution → Enable
        // → Advanced Upscalers by Priority → Add STP
        // → Set Dynamic Resolution Type to "Hardware"
        //
        // Programmatic HDRP DRS configuration is limited —
        // prefer Inspector setup for HDRP projects.
        Debug.Log("Configure HDRP STP via Inspector: " +
            "Rendering > Dynamic Resolution > Enable, " +
            "then add STP to Advanced Upscalers by Priority.");
    }
}
```

---

## Render Scale Guidelines

The render scale controls how much work the GPU does before STP upscales to native resolution. Lower values = better performance but more reliance on the upscaler:

| Render Scale | Internal Resolution (1080p target) | Use Case |
|---|---|---|
| `1.0` | 1920×1080 | TAA-only mode (still benefits from temporal stability) |
| `0.75` | 1440×810 | Quality mode — minimal visual loss |
| `0.67` | 1286×723 | Balanced — good for mid-range mobile |
| `0.5` | 960×540 | Performance mode — noticeable softness on fine detail |

```csharp
using UnityEngine;
using UnityEngine.Rendering.Universal;

/// <summary>
/// WHY: A settings menu helper that maps user-friendly quality names
/// to render scale values. STP handles the upscaling automatically.
/// </summary>
public class QualityPresetManager : MonoBehaviour
{
    [SerializeField] private UniversalRenderPipelineAsset _urpAsset;

    public enum QualityPreset { Performance, Balanced, Quality, Native }

    public void ApplyPreset(QualityPreset preset)
    {
        // WHY: We always keep STP enabled — even at native resolution
        // it provides temporal anti-aliasing benefits.
        _urpAsset.upscalingFilter = UpscalingFilterSelection.STP;

        _urpAsset.renderScale = preset switch
        {
            QualityPreset.Performance => 0.5f,
            QualityPreset.Balanced    => 0.67f,
            QualityPreset.Quality     => 0.75f,
            QualityPreset.Native      => 1.0f,
            _ => 0.67f
        };
    }
}
```

---

## Debugging STP

Unity 6 includes STP-specific debug views in the **Rendering Debugger** (Window → Analysis → Rendering Debugger):

- **Motion Vectors** — visualizes per-pixel motion; gaps indicate objects missing motion vector passes (common cause of ghosting).
- **Depth** — shows the depth buffer STP uses for reprojection; missing depth = incorrect temporal accumulation.
- **STP Input / Output** — compares the low-resolution input with the upscaled output side-by-side.

### Common Issues

| Symptom | Likely Cause | Fix |
|---|---|---|
| Ghosting on moving objects | Missing or incorrect motion vectors | Ensure all shaders write motion vectors; check **Motion Vector Mode** on Mesh Renderers |
| Shimmering on thin geometry | Temporal instability from sub-pixel features | Increase render scale slightly (e.g., 0.5 → 0.6) or add geometric LODs |
| Blurry UI | UI rendered before upscaling | Render UI in a separate camera/overlay that bypasses STP |
| Black screen on Android | OpenGL ES backend selected | Switch to Vulkan in Player Settings → Graphics APIs |

---

## STP vs. Other Upscalers

| Feature | STP | DLSS 2 | FSR 2 | XeSS |
|---|---|---|---|---|
| **Vendor lock-in** | None (software) | NVIDIA RTX only | None (software) | Intel Arc (HW) / Software fallback |
| **Unity integration** | Built-in, one checkbox | Plugin required | Plugin required | Plugin required |
| **Mobile support** | Yes (compute-capable) | No | Limited | No |
| **Quality at 0.5× scale** | Good | Excellent | Good | Good |
| **Performance overhead** | Low–Medium | Very Low (HW accelerated) | Low–Medium | Low (HW) / Medium (SW) |
| **Auto platform tuning** | Yes | No | No | No |

**When to use STP:** Cross-platform projects (especially mobile + desktop), projects that want a single upscaling solution without third-party plugins, and indie teams that want "set and forget" quality scaling.

**When to consider alternatives:** If targeting NVIDIA-only (DLSS is still the quality leader on RTX hardware) or if you need frame generation (DLSS 3+).

---

## Performance Tips

1. **Combine with GPU Resident Drawer** — STP reduces fill-rate cost, GPU Resident Drawer reduces draw-call cost. Together they compound performance gains.
2. **Profile the upscaler itself** — STP's compute pass shows up in the Frame Debugger and GPU profiler. On low-end mobile, even the upscaler's cost matters.
3. **Test at target render scales** — Don't just test at 1.0 and ship at 0.5. Visual quality and temporal stability can change significantly at lower scales.
4. **Disable on OpenGL ES builds** — STP silently falls back to bilinear on unsupported APIs. Detect this and adjust expectations:

```csharp
// WHY: OpenGL ES doesn't support STP. Detect at startup
// and warn or adjust quality settings accordingly.
if (SystemInfo.graphicsDeviceType == UnityEngine.Rendering.GraphicsDeviceType.OpenGLES3)
{
    Debug.LogWarning("STP not supported on OpenGL ES — falling back to bilinear upscaling.");
    // Consider raising render scale to compensate for lower upscale quality.
}
```

---

## Version History

| Version | Change |
|---|---|
| Unity 6.0 (6000.0) | STP introduced in URP 17 and HDRP 17 |
| Unity 6.1 (6000.1) | Stability improvements, reduced ghosting on fast motion |
| Unity 6.3 LTS (6000.3) | Improved lightmap packing (up to 27% memory savings) benefits STP's temporal cache |
