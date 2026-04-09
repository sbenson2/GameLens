# G54 — Lumen Hardware Ray Tracing Optimization

> **Category:** guide · **Engine:** Unreal Engine 5.5+ · **Related:** [G9 Rendering — Nanite & Lumen](G9_rendering_nanite_lumen.md) · [G20 Performance Optimization & Memory](G20_performance_optimization_memory.md) · [G49 Virtual Shadow Maps](G49_virtual_shadow_maps.md)

**Lumen** is Unreal Engine 5's fully dynamic global illumination (GI) and reflections system. Starting with UE 5.5, **Hardware Ray Tracing (HWRT)** is the default and recommended Lumen mode, and as of UE 5.6, the Software Ray Tracing (SWRT) detail traces path is deprecated. This guide covers HWRT-specific optimization strategies, console variables, profiling techniques, and version-specific improvements from UE 5.5 through 5.7.

---

## Lumen Architecture Overview

Lumen's rendering pipeline consists of three primary GPU passes:

```
1. Lumen Scene Lighting    — builds a simplified "Lumen Scene" of surface caches
2. Screen Probe Gather     — traces rays from screen-space probes for GI
3. Lumen Reflections       — traces rays for specular reflections

Each pass has independent quality/performance knobs.
```

### SWRT vs. HWRT

| Aspect | SWRT (Deprecated) | HWRT (Default 5.5+) |
|---|---|---|
| Ray source | Distance Field meshes (CPU-built) | BVH acceleration structures (GPU-built) |
| Accuracy | Approximate — simplified geometry | Exact — traces against actual triangles |
| Hardware requirement | Any GPU | DXR/Vulkan RT capable GPU |
| Performance profile | Lower base cost, degrades with complexity | Higher base cost, scales better with complexity |
| Status in UE 5.7 | SWRT detail traces deprecated | Default and actively optimized |

**Key takeaway**: HWRT delivers higher quality and more stable lighting. Epic is actively deprecating SWRT code paths — optimize for HWRT going forward.

---

## Essential Console Variables

### Global Illumination (Screen Probe Gather)

| CVar | Default | Description |
|---|---|---|
| `r.Lumen.ScreenProbeGather.RadianceCache.ProbeResolution` | 32 | Samples per radiance cache probe. Lower = faster but noisier. Minimum recommended: 8. |
| `r.Lumen.ScreenProbeGather.MaxRayIntensity` | 10 | Firefly filter intensity cap. Lowered from 40 in older versions. Reduces bright GI fireflies. |
| `r.Lumen.ScreenProbeGather.StochasticInterpolation` | 1 | When enabled, stochastically selects one of four nearest probes per pixel instead of bilinear interpolation. Faster but introduces noise. |
| `r.Lumen.ScreenProbeGather.ScreenTraces.HZBTraceMaxIterations` | 50 | Max steps for screen-space HZB traces before falling back to HWRT. Lower = more HWRT rays = more accurate but slower. |
| `r.Lumen.ScreenProbeGather.AdaptiveProbeMinBudgetFraction` | 0.1 | Minimum fraction of adaptive probes allocated. UE 5.6 improved the algorithm to place fewer probes with similar visual quality. |

### Reflections

| CVar | Default | Description |
|---|---|---|
| `r.Lumen.Reflections.MaxRoughnessToTrace` | 0.4 | Surfaces rougher than this use the radiance cache instead of dedicated reflection traces. Increase for more accurate rough reflections at GPU cost. |
| `r.Lumen.Reflections.DownsampleFactor` | 1 | Reflection resolution divider. Set to 2 for half-res reflections — significant perf win with acceptable quality on non-mirror surfaces. |
| `r.Lumen.Reflections.Allow` | 1 | Master toggle for Lumen reflections. |

### Hardware Ray Tracing Specific

| CVar | Default | Description |
|---|---|---|
| `r.Lumen.HardwareRayTracing` | 1 | Master HWRT enable. |
| `r.Lumen.HardwareRayTracing.MaxIterations` | 256 | Maximum BVH traversal iterations per ray. Lower values may cause rays to terminate early in complex scenes. |
| `r.Lumen.HardwareRayTracing.MaxTranslucentSkipCount` | 2 | Number of translucent surfaces a ray can skip through. |
| `r.RayTracing.Culling.Radius` | 10000 | BVH culling radius in Unreal units. Geometry beyond this distance is excluded from the acceleration structure. |

### Scene Representation

| CVar | Default | Description |
|---|---|---|
| `r.Lumen.SurfaceCache.MeshCardsMinSize` | 1.0 | Minimum object size (in world units) for Lumen surface cache cards. Increase to exclude small objects. |
| `r.Lumen.SurfaceCache.CardMaxResolution` | 256 | Maximum resolution per surface cache card. Lower for memory savings. |

---

## Optimization Strategies

### 1. Profile Before Tuning

Use `stat gpu` and **Unreal Insights** (see [G55 — Unreal Insights](G55_unreal_insights_profiler.md)) to identify which Lumen pass dominates frame time:

```
stat gpu breakdown (typical):
  LumenSceneLighting:     0.8ms
  LumenScreenProbeGather: 2.1ms  ← usually the most expensive
  LumenReflections:       1.3ms
  Total Lumen:            4.2ms
```

### 2. Reduce Screen Probe Gather Cost

The Screen Probe Gather pass is typically the most expensive. Ordered by impact:

1. **Lower probe resolution**: `r.Lumen.ScreenProbeGather.RadianceCache.ProbeResolution 16` saves ~0.3–0.5ms on console. Visual difference is subtle in most scenes.
2. **Enable stochastic interpolation**: Already default. Verify it's on — saves interpolation cost.
3. **Half-res integration (UE 5.7)**: The High scalability preset enables half-resolution integration, saving ~0.5ms at 1080p. Normals in indirect lighting are slightly softened.
4. **Reduce adaptive probe count**: UE 5.6's improved algorithm already places fewer probes. Further reduce with `r.Lumen.ScreenProbeGather.AdaptiveProbeMinBudgetFraction 0.05`.

### 3. Optimize Reflections

1. **Lower roughness threshold**: `r.Lumen.Reflections.MaxRoughnessToTrace 0.25` — most game materials are rough enough that radiance cache reflections suffice.
2. **Half-res reflections**: `r.Lumen.Reflections.DownsampleFactor 2` — ~0.3ms saving. Noticeable on large flat mirrors but acceptable for gameplay cameras.
3. **UE 5.6 improvement**: Reflections output format reduced to 32 bits (from 64), saving 0.02ms in reflections and 0.03ms in water rendering at 900p.

### 4. Manage the Lumen Scene

The Lumen Scene is a simplified representation of your level used for indirect lighting. Keep it clean:

- **Exclude small props**: Increase `r.Lumen.SurfaceCache.MeshCardsMinSize` to skip objects that don't contribute meaningfully to GI (small debris, small decor).
- **Limit card resolution**: For levels with thousands of unique meshes, cap `r.Lumen.SurfaceCache.CardMaxResolution` at 128 to reduce GPU memory pressure.
- **Watch surface cache updates**: Each new or moving object updates the surface cache. Avoid large numbers of dynamic objects contributing to Lumen.

### 5. BVH Optimization

HWRT performance depends heavily on the ray tracing acceleration structure (BLAS/TLAS):

- **Cull distant geometry**: `r.RayTracing.Culling.Radius` controls how far geometry is included in the BVH. Tighten to match your actual lighting range.
- **Static vs. dynamic BVH**: Static meshes use a pre-built BVH. Dynamic (movable) meshes require per-frame BVH updates. Minimize movable mesh count.
- **Nanite + HWRT interaction**: Nanite meshes create their own ray tracing proxies. In UE 5.5+, these are more efficient but still add to BVH build cost.

---

## Version-Specific Improvements

### UE 5.5

- HWRT becomes the default Lumen mode
- Firefly filtering made more aggressive (`MaxRayIntensity` default lowered to 10)
- Improved async compute overlap for Lumen passes
- Fixed Radiance Cache time-splicing that caused major performance spikes

### UE 5.6

- SWRT detail traces deprecated — HWRT is the only actively maintained path
- New ray weighting for Lumen Reflections improving stability and speed
- Improved adaptive probe placement algorithm — fewer probes, similar quality
- Reflections output format reduced to 32 bits
- CPU bottlenecks eliminated in HWRT dispatch, enabling 60 fps in more complex scenes
- Fixed async compute overlap when async Lumen reflections are enabled

### UE 5.7

- Half-resolution integration on High scalability — saves ~0.5ms at 1080p
- Downsampled neighborhood for temporal accumulation — better quality with less data loaded
- Merged identical rays to avoid overhead of duplicated traces (significant win with strong point lights)
- Continued deprecation of SWRT — distance field detail traces removed from default paths
- Focus on achieving stable 60hz with HWRT on current-gen consoles

---

## Scalability Presets

Lumen quality is configured through the **Global Illumination** and **Reflections** scalability groups in `BaseScalability.ini`. The built-in presets map to:

| Preset | GI Quality | Reflection Quality | Typical Target |
|---|---|---|---|
| Low | Reduced probes, no HWRT fallback | Screen-space only | Integrated GPU / min spec |
| Medium | Standard probes, limited HWRT | Half-res Lumen reflections | Mid-range GPU |
| High | Full probes, half-res integration | Full Lumen reflections | Current-gen console |
| Epic | Maximum probe density | Full resolution, high trace count | High-end PC |
| Cinematic | Maximum everything + path tracer option | Maximum trace count | Offline / MRQ rendering |

Override scalability per-platform in `{Platform}Scalability.ini` or at runtime:

```cpp
// WHY: Runtime scalability switching enables dynamic quality adjustment
// based on measured frame time — useful for maintaining 60 fps targets.
#include "Scalability.h"

void AMyGameMode::AdjustLumenQuality(float FrameTimeMs)
{
    if (FrameTimeMs > 16.6f) // Below 60 fps
    {
        // Drop to Medium GI quality
        Scalability::SetQualityLevel(
            EQualityLevel::Medium,
            Scalability::EQualityLevelBehavior::EQualityLevelBehavior_GlobalIllumination);
    }
}
```

---

## Debugging Lumen Issues

### Black or Noisy GI

- **Cause**: Insufficient warm-up frames or temporal history reset
- **Fix**: Ensure `r.Lumen.ScreenProbeGather.TemporalMaxFramesAccumulated` is ≥ 8. In cinematics, use MRG warm-up frames.

### Light Leaking

- **Cause**: Surface cache cards not covering thin geometry (walls, floors)
- **Fix**: Increase mesh card density with `r.Lumen.SurfaceCache.MeshCardsMinSize 0.5` or add **Lumen Scene** card overrides on the Static Mesh asset.

### GI Flickering

- **Cause**: Radiance cache invalidation from fast camera movement or many dynamic lights
- **Fix**: Increase `r.Lumen.ScreenProbeGather.RadianceCache.NumFramesToKeepCachedProbes` to allow longer temporal accumulation.

### Performance Spikes

- **Cause**: BVH rebuild from large numbers of movable meshes or level streaming
- **Fix**: Mark environment geometry as Static. Use `r.RayTracing.Culling.Radius` to limit BVH scope. Profile with `stat gpu` to isolate the spike.

---

## Best Practices

1. **Target HWRT from day one** — design your lighting workflow around HWRT. SWRT is deprecated and will receive no further optimization.
2. **Budget Lumen at 4–5ms GPU on console** — this leaves headroom for Nanite, shadows, post-process, and gameplay rendering.
3. **Use scalability presets, not raw CVars, for shipping games** — scalability groups are tested across hardware and update between engine versions.
4. **Profile on target hardware** — Lumen performance varies dramatically between PC GPUs and consoles. Always validate on your min-spec device.
5. **Keep dynamic light count low** — each dynamic light contributes to ray tracing cost. Use static/stationary lights where possible for ambient fill.
6. **Combine with Virtual Shadow Maps** — VSM (see [G49](G49_virtual_shadow_maps.md)) and Lumen are designed to work together. Don't mix legacy shadow mapping with Lumen HWRT.
