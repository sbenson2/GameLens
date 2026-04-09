# Nanite Skeletal Meshes

> **Category:** guide · **Engine:** Unreal Engine 5.5+ · **Related:** [G9 Rendering Nanite Lumen](G9_rendering_nanite_lumen.md), [G41 Nanite Foliage](G41_nanite_foliage_vegetation.md), [G47 Nanite Tessellation Displacement](G47_nanite_tessellation_displacement.md), [G4 Animation System](G4_animation_system.md)

Nanite's virtualized geometry system, originally designed for static meshes, gained experimental skeletal mesh support in UE 5.4 and reached production-ready status in UE 5.5. This enables automatic LOD for animated characters, dramatically improving performance in crowd-heavy scenes.

## Why It Matters

Traditional skeletal mesh rendering requires hand-authored LOD chains — artists manually create 3–5 LOD levels per character, and the engine switches between them at distance thresholds. Nanite Skeletal Meshes eliminate this workflow by applying Nanite's continuous LOD system to deforming geometry. The GPU renders only the triangles visible at the current screen resolution, cutting draw calls and memory usage in scenes with many animated characters.

## Engine Version Requirements

| Feature | UE Version | Status |
|---------|-----------|--------|
| Nanite Skeletal Mesh | 5.4 | Experimental |
| Nanite Skeletal Mesh | 5.5+ | Production-Ready |
| Nanite Displacement on Skeletal Mesh | 5.5+ | Supported |
| Nanite Skeletal + World Position Offset | 5.6+ | Improved |

## Enabling Nanite Skeletal Meshes

### Project Settings (DefaultEngine.ini)

```ini
[/Script/Engine.RendererSettings]
r.Nanite.Tessellation=1
r.Nanite.AllowSkinnedMeshes=1
```

### Per-Asset Setup

1. Open the Skeletal Mesh asset in the editor.
2. In **Asset Details**, find the **Nanite** section.
3. Enable **Enable Nanite Support**.
4. Reimport or save the asset — Nanite build data is generated on save.

### C++ Runtime Check

```cpp
#include "Engine/SkeletalMesh.h"

// Verify Nanite is enabled on a skeletal mesh at runtime
if (SkeletalMesh && SkeletalMesh->GetResourceForRendering())
{
    const bool bNaniteEnabled = SkeletalMesh->IsNaniteEnabled();
    UE_LOG(LogTemp, Log, TEXT("Nanite enabled: %s"), bNaniteEnabled ? TEXT("Yes") : TEXT("No"));
}
```

## Performance Characteristics

### When Nanite Skeletal Meshes Excel

- **Crowd rendering:** 50+ animated characters on screen. Nanite's GPU-driven pipeline batches skinned geometry efficiently, reducing CPU draw-call overhead.
- **Cinematic close-ups:** High-poly hero characters (100K+ triangles) render at full detail up close and automatically simplify at distance — no manual LOD setup.
- **Open-world NPCs:** Background characters at distance consume a fraction of the triangles, freeing GPU budget for foreground action.

### When to Stick with Traditional LODs

- **Low character counts** (< 10): The Nanite overhead may outweigh benefits.
- **Mobile / lower-end hardware:** Nanite requires SM6 / DX12. Traditional LODs are still the path for mobile targets.
- **Heavily morph-target-driven faces:** Morph targets interact with Nanite but may introduce visual artifacts at extreme LOD reduction. Test per-asset.

## Displacement Tessellation on Skeletal Meshes (UE 5.5+)

With `r.Nanite.Tessellation=1`, skeletal meshes can use Nanite displacement. This enables:

- **Wrinkle maps** that add geometric detail to character skin at close range.
- **Armor/clothing detail** via displacement rather than normal maps.
- **Dynamic muscle deformation** driven by displacement textures bound to bone transforms.

### Material Setup

In your Material, connect a **Displacement** output. Nanite tessellation generates new triangles on the GPU at render time — no pre-tessellated mesh needed.

```
// Material graph (pseudocode)
Texture2D DisplacementMap → Multiply(DisplacementScale) → Displacement Output
```

Key material parameters:
- **Displacement Magnitude:** Controls maximum displacement distance in world units.
- **Tessellation Multiplier:** Higher values = more generated triangles = more detail (and more GPU cost).

## Known Limitations (as of UE 5.7)

1. **No Cloth Simulation Interaction:** Nanite skeletal meshes do not currently support Chaos Cloth. Characters using cloth simulation should keep those mesh sections as traditional skeletal mesh.
2. **Ray Tracing:** Nanite skeletal meshes support hardware ray tracing for shadows and reflections as of UE 5.6, but software ray tracing fallback may show artifacts.
3. **Anim Notify Precision:** At extreme LOD reduction, mesh bounds may shift slightly. Anim Notifies based on socket positions remain accurate, but visual contact points may not match at very low triangle counts.
4. **Streaming:** Nanite skeletal mesh data is included in the Nanite streaming pool. Monitor `stat Nanite` for streaming pressure in scenes with many unique skeletal meshes.

## Console Variables Reference

| CVar | Default | Description |
|-------|---------|-------------|
| `r.Nanite.AllowSkinnedMeshes` | 0 | Master toggle for Nanite skeletal mesh support |
| `r.Nanite.Tessellation` | 0 | Enable Nanite displacement tessellation (static + skeletal) |
| `r.Nanite.MaxPixelsPerEdge` | 1.0 | Controls Nanite LOD aggressiveness (lower = more triangles) |
| `r.Nanite.ViewMeshLODBias` | 0 | Bias Nanite LOD selection (positive = coarser) |

## Profiling Nanite Skeletal Meshes

Use `stat Nanite` in the viewport to monitor:

- **Nanite Triangles:** Total triangles rendered by Nanite (static + skeletal combined).
- **Nanite Instances:** Number of Nanite-enabled mesh instances.
- **Streaming Pool:** How much of the Nanite streaming budget is consumed.

For deeper analysis, use **Unreal Insights** (see [G55](G55_unreal_insights_profiler.md)) with the Nanite trace channel enabled.

## Migration Checklist

When converting existing characters to Nanite skeletal meshes:

1. Ensure the project targets DX12 / SM6.
2. Enable CVars in `DefaultEngine.ini`.
3. Open each Skeletal Mesh asset → enable Nanite → save.
4. Remove hand-authored LOD chains (Nanite replaces them).
5. Test cloth simulation sections — split those to non-Nanite mesh sections if needed.
6. Profile with `stat Nanite` and Unreal Insights.
7. Verify displacement materials render correctly on deforming geometry.

## Further Reading

- Epic Documentation: [Nanite Virtualized Geometry](https://dev.epicgames.com/documentation/en-us/unreal-engine/nanite-virtualized-geometry-in-unreal-engine)
- Community Tutorial: [Nanite and Skeletal Mesh](https://dev.epicgames.com/community/learning/tutorials/5VKX/unreal-engine-nanite-and-skeletal-mesh-now-this-is-possible)
