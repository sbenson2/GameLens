# UE 5.7 Production-Ready Systems: PCG, Substrate & Nanite Foliage

> **Category:** guide · **Engine:** Unreal Engine 5.7 · **Related:** [G16 PCG Framework](G16_pcg_framework.md), [G45 PCG Production Workflow](G45_pcg_production_workflow.md), [G46 Substrate Production Guide](G46_substrate_production_guide.md), [G41 Nanite Foliage Vegetation](G41_nanite_foliage_vegetation.md)

Unreal Engine 5.7 (released December 2025) marks a major milestone: three foundational systems — **PCG**, **Substrate**, and **Nanite Foliage** — reach or approach production-ready status. This guide covers what changed, migration considerations, and how to use these systems together for open-world development.

---

## System Status Overview

| System | UE 5.5 Status | UE 5.6 Status | UE 5.7 Status |
|--------|--------------|--------------|--------------|
| **PCG** (Procedural Content Generation) | Beta | Beta | **Production-Ready** |
| **Substrate** (Material Framework) | Experimental | Beta | **Production-Ready** |
| **Nanite Foliage** | Not available | Experimental | **Experimental** (major improvements) |

---

## 1. PCG Framework — Production-Ready

### What Changed in 5.7

The PCG framework graduated from Beta to Production-Ready with these key additions:

**PCG Editor Mode** — A dedicated editor mode (accessible from the **Modes** dropdown) provides a focused workspace for building and debugging PCG graphs. It includes:
- Visual debugging overlays showing point distributions, density maps, and spawn regions.
- Real-time graph parameter tweaking with instant viewport feedback.
- Performance profiling per-node to identify bottlenecks.

**GPU Compute Nodes** — Performance-critical operations (point scattering, distance filtering, noise generation) can now execute on the GPU. This is critical for open worlds where PCG graphs process millions of points.

```
Enable GPU compute in PCG Graph settings:
  PCG Graph → Details → Execution → Enable GPU Compute = true

GPU-eligible nodes show a GPU badge in the graph editor.
Not all nodes support GPU — custom Blueprint nodes remain CPU-only.
```

**Procedural Vegetation Editor (PVE)** — A specialized sub-editor for foliage placement built on top of PCG. It provides artist-friendly controls for:
- Biome definitions (forest, grassland, desert) with species distribution curves.
- Density, scale, and rotation randomization with preview.
- Slope, altitude, and surface-type masks.
- Integration with Landscape layers for painted biome boundaries.

### Migration from 5.5/5.6

PCG graphs from 5.5–5.6 are forward-compatible. Key migration notes:

- **Deprecated nodes**: `PCGPointFilter` (replaced by `PCGAttributeFilter` with broader attribute support). Deprecated nodes emit warnings but still function.
- **GPU compute opt-in**: Existing graphs default to CPU execution. Opt in per-graph or per-node.
- **Determinism**: PCG 5.7 enforces stricter determinism by default. Set `bEnforceStrictDeterminism=true` in Project Settings to match 5.7 behavior in older projects.

### C++ API Changes

```cpp
// UE 5.7: New GPU compute context for custom PCG nodes
#include "PCGContext.h"
#include "PCGGPUCompute.h"

// Custom PCG node with GPU support
UCLASS()
class UPCGCustomScatterNode : public UPCGSettings
{
    GENERATED_BODY()
public:
    // Override to indicate GPU eligibility
    virtual bool SupportsGPUExecution() const override { return true; }

    // GPU execution path
    virtual FPCGElementPtr CreateGPUElement() const override;

    // CPU fallback
    virtual FPCGElementPtr CreateElement() const override;
};
```

### Best Practices

- Use **Partition Actors** for PCG output in World Partition maps — each partition generates independently, enabling efficient streaming.
- Combine PCG with **HLODs** for distant vegetation clusters.
- Profile PCG generation time separately from rendering — use `stat PCG` and Unreal Insights.

---

## 2. Substrate — Production-Ready

### What Changed in 5.7

Substrate (formerly known as Strata in early previews) replaces the legacy material shading model system with a modular, physically-based material framework. In 5.7 it reached Production-Ready status.

**Key capabilities:**
- **Material layering** — Combine multiple material behaviors (metal, clearcoat, skin, cloth, subsurface) in a single material with physically correct blending.
- **Slab-based authoring** — Materials are defined as stacks of **Slabs**, each with its own BSDF properties. The renderer composites them at the pixel level.
- **True physical accuracy** — Multi-layer effects like oiled leather, car paint with clearcoat and metallic flake, or blood on skin are physically plausible rather than approximated.

### Enabling Substrate

Substrate must be explicitly enabled (it is not the default renderer):

**Project Settings → Engine → Rendering → Substrate:**

| Setting | Description |
|---------|-------------|
| `r.Substrate.Enabled` | Master toggle (requires editor restart) |
| `r.Substrate.MaxClosureCount` | Max material layers per pixel (default: 3, max: 15). Higher = more accurate but more expensive. |
| `r.Substrate.BackCompatibility` | Enable legacy material model fallback for unmigrated materials |

### Material Authoring

In the Material Editor, Substrate materials use new nodes:

| Node | Purpose |
|------|---------|
| `Substrate Slab` | Define a single material layer (diffuse, specular, roughness, thickness) |
| `Substrate Horizontal Mixʼ | Blend two Slabs side-by-side (e.g., rust patches on metal) |
| `Substrate Vertical Layer` | Stack Slabs top-to-bottom (e.g., clearcoat over paint over metal) |
| `Substrate Weight` | Control blend weights with masks |
| `Substrate Transmittance` | Define how light passes through thin layers |

Example: Multi-layer car paint

```
Substrate Vertical Layer
├── Top: Clearcoat Slab (high specular, low roughness, thin)
├── Middle: Metallic Flake Slab (high metallic, anisotropic, color)
└── Base: Primer Slab (diffuse, matte)
```

### Migration from Legacy Materials

- **Back-compatibility mode** (`r.Substrate.BackCompatibility=1`) renders legacy materials with approximate Substrate behavior. Use this during migration.
- **Material conversion tool** — Right-click a material asset → **Convert to Substrate**. This generates a single-Slab Substrate material matching the legacy output. Multi-layer effects must be added manually.
- **Performance**: Single-Slab Substrate materials are comparable in cost to legacy materials. Each additional Slab adds ~0.5 ms per full-screen pass on current-gen GPUs.

### Performance Considerations

| Slab Count | Use Case | Approximate Cost |
|-----------|----------|-----------------|
| 1 | Standard PBR (equivalent to legacy) | Baseline |
| 2 | Clearcoat, wet surface | +30% pixel shader cost |
| 3 | Complex layered (car paint, skin with sweat) | +60% pixel shader cost |
| 4+ | Extreme detail (use sparingly) | Scales linearly |

---

## 3. Nanite Foliage — Experimental (Major Update)

### What's New in 5.7

Nanite Foliage introduces a purpose-built rendering pipeline for dense, animated vegetation. It combines three sub-systems:

**Nanite Assemblies** — Group multiple mesh LODs and billboard imposters into a single Nanite-managed asset. The system seamlessly transitions between geometric detail levels based on screen coverage.

**Nanite Skinning** — Lightweight skeletal animation for foliage (wind sway, player interaction). Unlike full skeletal mesh rendering, Nanite Skinning operates on Nanite's virtualized geometry with minimal CPU overhead.

**Nanite Voxels** — For extremely distant foliage (far background), Nanite can represent vegetation as voxelized volumes rather than individual meshes, dramatically reducing triangle count while maintaining visual density.

### Enabling Nanite Foliage

```
Project Settings → Engine → Rendering → Nanite:
  r.Nanite.Foliage.Enabled = true        (experimental flag)
  r.Nanite.Foliage.MaxInstancesPerCluster = 256
  r.Nanite.Foliage.WindAnimationQuality = 2  (0=off, 1=simple, 2=full)
```

### Integration with PCG

Nanite Foliage works best when combined with PCG for placement:

1. **PCG graph** generates foliage spawn points with species, scale, rotation data.
2. **Foliage actors** are spawned as **Nanite Foliage Instances** (a new instance type that uses the Nanite Foliage pipeline).
3. **Procedural Vegetation Editor** (new in 5.7) provides a combined PCG + Nanite Foliage workflow in a single UI.

### Current Limitations (Experimental)

- **No collision on Nanite Foliage geometry** — Use separate simple collision volumes for gameplay interaction.
- **Limited material complexity** — Nanite Foliage supports single-layer materials only (no Substrate multi-Slab on foliage yet).
- **Wind animation is approximate** — Nanite Skinning uses simplified bone hierarchies; results may differ from traditional skeletal mesh wind.
- **Editor performance** — Dense Nanite Foliage scenes may cause editor slowdowns. Use **Nanite Visualization Modes** to debug.

---

## Using All Three Together: Open-World Workflow

For a large open-world project targeting 60 FPS on current-gen consoles, the recommended pipeline:

### Environment Art Pipeline

```
1. Landscape & Terrain
   └── Landscape system with painted biome layers

2. Surface Materials (Substrate)
   └── Terrain materials with Substrate layering
       (rock + moss + snow blending per-pixel)

3. Vegetation Placement (PCG + Nanite Foliage)
   └── PCG graphs read Landscape layers → spawn Nanite Foliage instances
       Procedural Vegetation Editor for artist tweaking

4. Prop & Structure Placement (PCG + World Partition)
   └── PCG scatters rocks, fences, debris
       World Partition manages streaming
       FastGeo (G69) for visual-only static props

5. HLOD Generation
   └── Nanite HLOD clusters for distant landscape features
       Nanite Foliage handles its own LOD transitions
```

### Performance Budget (60 FPS target, current-gen)

| System | Budget | Notes |
|--------|--------|-------|
| Nanite geometry | ~4 ms GPU | Static + foliage combined |
| Substrate materials | ~3 ms GPU | Limit to 2 Slabs average |
| Lumen GI | ~4 ms GPU | HWRT path recommended |
| PCG generation | Cook-time | No runtime cost for static placements |
| World Partition streaming | ~1 ms CPU | With FastGeo for visual geometry |

---

## Migration Checklist: Upgrading to UE 5.7

- [ ] **Back up project** before upgrading.
- [ ] Enable Substrate with back-compatibility mode first; convert materials incrementally.
- [ ] PCG graphs: test for deprecated nodes (check Output Log for warnings).
- [ ] PCG: opt into GPU compute for scatter-heavy graphs.
- [ ] Nanite Foliage: test on target hardware before committing — experimental features may have platform-specific issues.
- [ ] Profile with `stat Nanite`, `stat Substrate`, `stat PCG` and Unreal Insights.
- [ ] Review `DefaultEngine.ini` for new CVars that may need tuning for your project.

---

## Version History

| Version | Key Changes |
|---------|-------------|
| UE 5.5 | PCG Beta. Substrate Experimental. Nanite limited to static meshes. |
| UE 5.6 | PCG Beta improvements. Substrate Beta. Nanite Skeletal Meshes (G56). |
| UE 5.7 | **PCG Production-Ready.** **Substrate Production-Ready.** Nanite Foliage Experimental with Assemblies, Skinning, Voxels. Procedural Vegetation Editor. |

---

## Next Steps

- **[G16 PCG Framework](G16_pcg_framework.md)** — PCG fundamentals and graph authoring.
- **[G45 PCG Production Workflow](G45_pcg_production_workflow.md)** — Scaling PCG for shipping titles.
- **[G46 Substrate Production Guide](G46_substrate_production_guide.md)** — Substrate material authoring deep dive.
- **[G41 Nanite Foliage Vegetation](G41_nanite_foliage_vegetation.md)** — Nanite Foliage setup and optimization.
- **[G69 Fast Geometry Streaming](G69_fast_geometry_streaming.md)** — Complement PCG with optimized visual streaming.
