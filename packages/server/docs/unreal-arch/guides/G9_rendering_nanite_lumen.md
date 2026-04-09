# G9 — Rendering with Nanite & Lumen

> **Category:** guide · **Engine:** Unreal Engine 5.4+ · **Related:** [Architecture Overview](../architecture/E1_architecture_overview.md) · [G6 Physics & Collision](G6_physics_and_collision.md) · [Unreal Rules](../unreal-arch-rules.md)

Nanite and Lumen are UE5's two flagship rendering technologies. Nanite is a virtualized geometry system that renders film-quality meshes in real time by streaming only the triangles the camera can see. Lumen is a fully dynamic global illumination and reflections system that eliminates the need for baked lightmaps. Together they fundamentally change how artists and programmers approach rendering in Unreal. This guide covers when and how to use each system, material constraints, C++ integration, optimization, and common pitfalls.

---

## Nanite — Virtualized Geometry

### What Nanite Does

Nanite replaces the traditional LOD (Level of Detail) pipeline with a GPU-driven system that:

- Automatically streams and renders only the triangles visible at the current pixel resolution
- Eliminates manual LOD authoring — import multi-million polygon meshes directly
- Uses a persistent GPU cache to avoid redundant rendering work across frames
- Supports instancing natively — thousands of identical meshes at near-zero marginal cost

```
Traditional Pipeline:                 Nanite Pipeline:
                                     
Artist → LOD0 → LOD1 → LOD2 → LOD3   Artist → High-poly mesh → Nanite
       (manual reduction chain)               (automatic streaming)
       
CPU selects LOD per distance          GPU selects triangles per pixel
Draw calls scale with object count    Draw calls are constant (GPU-driven)
```

### When to Use Nanite

| Use Case | Use Nanite? | Why |
|----------|------------|-----|
| Static environment meshes (rocks, buildings, props) | **Yes** | Maximum visual quality, zero LOD authoring |
| Instanced foliage (dense forests, grass) | **Yes** | Massive instance counts with minimal cost |
| Skeletal meshes (animated characters) | **No** | Nanite does not support vertex deformation (as of UE 5.4) |
| Translucent/transparent materials | **No** | Nanite requires opaque or masked materials |
| Meshes with World Position Offset (WPO) | **Partial** | WPO support added in UE 5.4 but has performance cost; test carefully |
| Dynamic destructible meshes | **No** | Nanite meshes cannot be deformed at runtime |

### Enabling Nanite on a Static Mesh

In the editor: **Static Mesh Editor → Details → Nanite Settings → Enable Nanite Support**.

In C++:

```cpp
#include "Engine/StaticMesh.h"

// WHY check before enabling: Not all meshes benefit from Nanite.
// Small props with < 1000 triangles may actually be cheaper without it
// because Nanite has a fixed per-mesh overhead for its BVH structure.
void EnableNaniteOnMesh(UStaticMesh* Mesh)
{
    if (!Mesh) return;
    
    FMeshNaniteSettings NaniteSettings;
    NaniteSettings.bEnabled = true;
    
    // WHY set trim threshold: Controls how aggressively Nanite
    // simplifies geometry at distance. Lower values preserve more
    // detail but use more memory. 0.0 = no trimming.
    NaniteSettings.TrimRelativeError = 0.0f;
    
    Mesh->NaniteSettings = NaniteSettings;
    Mesh->PostEditChange();
}
```

### Querying Nanite Status at Runtime

```cpp
// WHY query at runtime: Useful for conditional logic — e.g., disabling
// a custom LOD system for Nanite meshes, or falling back to imposters
// on hardware that doesn't support Nanite.
bool bIsNanite = StaticMeshComponent->GetStaticMesh()->IsNaniteEnabled();
```

In Blueprints, use the **Is Nanite Enabled** node on a Static Mesh reference.

### Nanite Material Constraints

Nanite meshes have stricter material requirements than traditional meshes:

| Feature | Supported? | Notes |
|---------|-----------|-------|
| Opaque blend mode | **Yes** | Full support, recommended default |
| Masked blend mode | **Partial** | Supported but more expensive than opaque; avoid for large surfaces |
| Translucent blend mode | **No** | Translucent meshes must use traditional rendering |
| World Position Offset | **Partial** | Added in UE 5.4; has perf cost, disable when possible |
| Tessellation | **No** | Deprecated in UE5; Nanite replaces its use case |
| Custom depth / stencil | **Yes** | Works normally |
| Two-sided materials | **Yes** | Works, useful for foliage |

---

## Lumen — Dynamic Global Illumination & Reflections

### What Lumen Does

Lumen provides fully dynamic indirect lighting and reflections without baked lightmaps:

- **Global Illumination (GI):** Light bounces off surfaces, carrying color. A red wall tints nearby surfaces red.
- **Reflections:** Mirrors, glass, metal, and water reflect the scene accurately without precomputed reflection captures.
- **Sky lighting:** Ambient light from the sky is accurately distributed, including into interiors through openings.

```
┌────────────────────────────────────────────┐
│           Lumen Tracing Pipeline            │
│                                            │
│  1. Screen-Space Trace (cheapest)          │
│     ↓ miss                                 │
│  2. Mesh Distance Field Trace (medium)     │
│     ↓ miss                                 │
│  3. Hardware Ray Trace (most expensive)    │
│     ↓                                      │
│  4. Global Distance Field / Sky fallback   │
└────────────────────────────────────────────┘
```

Lumen uses a **hierarchical tracing strategy** — it tries the cheapest method first and only falls back to more expensive tracing when needed.

### Lumen Modes

| Mode | Requirement | Quality | Performance |
|------|------------|---------|-------------|
| **Software Ray Tracing** | Mesh Distance Fields (default) | Good | Faster; works on all DX11+ hardware |
| **Hardware Ray Tracing** | RTX/RDNA2+ GPU | Best | Slower; most accurate reflections and thin geometry |

Set in **Project Settings → Rendering → Global Illumination → Lumen**:

```
r.Lumen.HardwareRayTracing = 1   // Enable HW RT (requires capable GPU)
r.Lumen.Reflections.HardwareRayTracing = 1
```

### Material Best Practices for Lumen

```
// Material tips for optimal Lumen results:

1. Base Color: Keep values between 0.02 and 0.9
   - WHY: Values of 0.0 (pure black) absorb all light, killing GI bounce.
   - Values of 1.0 (pure white) cause energy amplification artifacts.
   - Realistic materials are always in the 0.02–0.9 range.

2. Roughness: Avoid large areas of Roughness = 0 (perfect mirror)
   - WHY: Perfect mirrors create expensive reflection traces across
   - the entire surface. Use 0.05–0.1 minimum for "shiny" surfaces.

3. Emissive materials: These ARE Lumen light sources
   - WHY: Lumen traces emissive surfaces as area lights. A glowing
   - screen or neon sign will actually illuminate nearby geometry.
   - Keep emissive values reasonable (< 20) to avoid firefly artifacts.

4. Two-sided foliage: Enable "Two Sided" and use Subsurface profile
   - WHY: Light passes through leaves. Without subsurface, foliage
   - blocks all light and creates unnaturally dark shadows.
```

### C++ — Controlling Lumen at Runtime

```cpp
#include "Engine/RendererSettings.h"

// WHY toggle at runtime: Different game areas may need different
// quality settings. A dark indoor scene benefits from higher Lumen
// quality, while a bright outdoor scene can use lower settings
// for better performance.
void SetLumenQuality(bool bHighQuality)
{
    // Final Gather Quality: controls the denoising / accuracy tradeoff
    // Higher = cleaner GI but more expensive
    static IConsoleVariable* CVarFinalGather = IConsoleManager::Get()
        .FindConsoleVariable(TEXT("r.Lumen.FinalGather.Quality"));
    
    if (CVarFinalGather)
    {
        CVarFinalGather->Set(bHighQuality ? 6.0f : 2.0f);
    }
    
    // Reflection quality
    static IConsoleVariable* CVarReflections = IConsoleManager::Get()
        .FindConsoleVariable(TEXT("r.Lumen.Reflections.Quality"));
    
    if (CVarReflections)
    {
        CVarReflections->Set(bHighQuality ? 4.0f : 1.0f);
    }
}
```

---

## Virtual Shadow Maps

UE5 pairs Nanite and Lumen with **Virtual Shadow Maps (VSM)** — a unified shadow system that replaces cascaded shadow maps:

- One large virtual texture per light, paged and cached on the GPU
- Pixel-accurate shadows from any distance — no cascade popping
- Automatically leverages Nanite geometry for shadow rendering

```cpp
// WHY enable VSM: Traditional cascaded shadow maps have visible
// resolution transitions (cascade boundaries). VSM provides
// consistent shadow quality at all distances.
// Enabled by default in UE5 projects. Verify with:
//   r.Shadow.Virtual.Enable = 1
```

---

## Profiling and Optimization

### Essential Console Commands

| Command | What It Shows |
|---------|--------------|
| `stat unit` | Frame time breakdown: Game, Draw, GPU, RHI |
| `stat GPU` | Per-pass GPU time (BasePass, Nanite, Lumen, Shadows, etc.) |
| `profileGPU` | Detailed GPU capture — the single most useful profiling tool |
| `stat Nanite` | Nanite-specific stats: triangle count, instance count, BVH depth |
| `r.Nanite.Visualize 1` | Overlay showing Nanite triangle density and LOD levels |
| `r.Lumen.Visualize.Overview 1` | Shows Lumen trace types and hit rates |

### Optimization Strategies

**Nanite Optimization:**

```cpp
// WHY cull small objects: Nanite has a per-instance BVH overhead.
// Objects smaller than a pixel still cost BVH traversal. Use
// Nanite Fallback meshes for very small props, or cull them entirely.

// In Project Settings → Rendering → Nanite:
// - Pixel Cull Threshold: objects below this pixel size are culled
// - Fallback Triangle Percent: triangle budget for non-Nanite fallback mesh
```

- Merge small props into larger combined meshes where possible
- Use hierarchical instanced static meshes (HISM) for massive foliage fields
- Monitor `stat Nanite` — if "Visible Clusters" is very high, consolidate geometry

**Lumen Optimization:**

- Use Software RT for most scenes; only enable Hardware RT when quality demands it
- Reduce `r.Lumen.FinalGather.Quality` for outdoor scenes (GI is less noticeable in bright sun)
- Keep Mesh Distance Fields enabled (`r.DistanceField.Generate = 1`) — Lumen's SW path depends on them
- Avoid many small emissive surfaces; consolidate into fewer, larger emissive areas
- Use `r.Lumen.ScreenProbeGather.DownsampleFactor` to trade GI resolution for performance

**General Rendering:**

```cpp
// WHY scalability groups matter: They let you ship one build that
// adapts to different hardware. Lumen and Nanite settings are
// automatically adjusted by the scalability system.
//
// In C++, query the current level:
Scalability::FQualityLevels QualityLevels = Scalability::GetQualityLevels();
int32 ShadowQuality = QualityLevels.ShadowQuality; // 0=Low, 3=Epic

// Override for a specific platform:
Scalability::SetQualityLevelRelativeToMax(
    Scalability::EQualityLevelGroup::ShadowQuality, -1); // One step below max
```

---

## Common Pitfalls

### 1. Nanite mesh appears invisible

Check that the material is **Opaque** or **Masked**. Translucent materials on Nanite meshes render nothing — no warning, just invisible geometry.

### 2. Dark or incorrect GI

Ensure Mesh Distance Fields are generated (`r.DistanceField.Generate 1` in Project Settings → Rendering). Without distance fields, Lumen's software path has nothing to trace against.

### 3. Lumen "light leaks" through thin walls

Walls thinner than ~10cm can leak light because Lumen's distance field traces have limited precision. Solution: make walls at least 10cm thick, or add backface geometry.

### 4. Shadow flickering / noise

Virtual Shadow Maps need stable caching. Fast camera rotation can cause transient noise. Use `r.Shadow.Virtual.Cache.StaticSeparate 1` to keep static shadow pages cached separately from dynamic ones.

### 5. Performance regression on older hardware

Nanite requires compute shader support (DX12/Vulkan). On DX11 or older GPUs, it falls back to traditional rendering. Always test your fallback mesh quality with `r.Nanite.Fallback.Enable 1`.

---

## Platform Support Matrix

| Platform | Nanite | Lumen SW RT | Lumen HW RT | Virtual Shadow Maps |
|----------|--------|-------------|-------------|-------------------|
| PC (DX12) | Yes | Yes | Yes (RTX/RDNA2+) | Yes |
| PC (Vulkan) | Yes | Yes | Yes (with RT extensions) | Yes |
| PS5 | Yes | Yes | Yes | Yes |
| Xbox Series X | Yes | Yes | Yes | Yes |
| Xbox Series S | Yes | Yes | No | Yes |
| Nintendo Switch | No | No | No | No |
| Mobile | No | No | No | No |

---

## Further Reading

- [Lumen Technical Details — Epic Documentation](https://dev.epicgames.com/documentation/en-us/unreal-engine/lumen-technical-details-in-unreal-engine)
- [Nanite Overview — Epic Documentation](https://dev.epicgames.com/documentation/en-us/unreal-engine/nanite-virtualized-geometry-in-unreal-engine)
- [Optimizing UE5: Nanite and Lumen — Unreal Fest 2023](https://dev.epicgames.com/community/learning/talks-and-demos/Vpv2/)
- [UE5 Best Practices — O'Reilly](https://www.oreilly.com/library/view/unreal-engine-5/9781836205654/)
