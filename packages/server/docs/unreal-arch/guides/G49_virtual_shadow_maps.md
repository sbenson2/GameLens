# Virtual Shadow Maps

> **Category:** guide · **Engine:** Unreal Engine 5.0+ · **Related:** [G9 Rendering — Nanite & Lumen](G9_rendering_nanite_lumen.md), [G20 Performance & Memory](G20_performance_optimization_memory.md), [G41 Nanite Foliage & PVE](G41_nanite_foliage_vegetation.md)

Virtual Shadow Maps (VSM) are UE5's shadow rendering system designed to pair with Nanite's virtualized geometry. VSM replaces the traditional Cascaded Shadow Maps (CSM) with a page-based virtual texture approach that delivers consistent, high-resolution shadows from small surface detail near the camera all the way to the horizon — without the cascade boundary artifacts and resolution cliffs of CSM. VSM is the default shadow system in UE5 projects and is critical to understand for both rendering quality and performance optimization.

---

## How Virtual Shadow Maps Work

### Architecture Overview

Traditional CSM divides the view frustum into a fixed number of cascades (typically 3–5), each with its own shadow map. Nearby cascades get more resolution; distant ones get less. This creates visible quality drops at cascade boundaries.

VSM takes a different approach:

```
Traditional CSM:                    Virtual Shadow Maps:

┌────────┬──────┬────┐              ┌─────────────────────────┐
│Cascade3│Casc 2│ C1 │              │     Virtual Texture     │
│(low    │(med  │(hi)│              │  (pages allocated on    │
│ res)   │ res) │    │              │   demand per pixel)     │
└────────┴──────┴────┘              └─────────────────────────┘
  Fixed splits, visible seams          Continuous, no seams
```

VSM maintains a **virtual shadow texture** — a massive logical texture (up to 16K×16K equivalent) that is only partially resident in GPU memory. The engine allocates small **pages** (128×128 texels) on demand based on what the camera can see. Only the pages needed for the current view are rendered, cached, and composited.

### Two Shadow Map Types

| Type | Used For | Behavior |
|---|---|---|
| **Clipmap** | Directional lights (sun) | A set of concentric virtual textures centered on the camera. Higher resolution near the camera, lower resolution far away — but without cascade seams. |
| **Local Light Pages** | Point lights, spot lights, rect lights | Each local light gets its own virtual shadow map. Pages are allocated based on the light's influence and screen coverage. |

### Caching System

VSM caches rendered shadow pages across frames. If neither the light nor the shadow-casting geometry has moved, the cached page is reused — saving significant GPU cost.

**Cache invalidation** occurs when:
- A shadow-casting actor moves, is added, or is removed
- The light source moves or changes properties
- Material properties affecting shadow shape change (e.g., masked material opacity)

This caching is what makes VSM performant in practice — most pages in a typical frame are cached, and only a fraction need re-rendering.

---

## Performance Optimization

### Shadow Cache Invalidation Behavior

Every shadow-casting primitive has a **Shadow Cache Invalidation Behavior** setting that controls how the VSM cache treats it:

| Setting | Behavior | Use For |
|---|---|---|
| `Auto` (default) | Engine decides based on mobility | Most actors |
| `Static` | Never invalidates cache | Truly static geometry (buildings, terrain) — huge performance win |
| `Rigid` | Only invalidates when the actor actually moves | Actors that *can* move but are usually stationary (doors, platforms) |
| `Always` | Invalidates every frame | Continuously animated actors (skeletal meshes with shadows) |

**Recommendation:** Set `Static` on all environment geometry that will never move. This is one of the single biggest VSM performance improvements, especially on current-gen consoles.

```cpp
// C++ — Set shadow cache behavior on a static mesh component
// WHY: Static invalidation prevents this geometry from ever dirtying
// the shadow cache, eliminating per-frame re-rendering cost.
MeshComponent->SetShadowCacheInvalidationBehavior(
    EShadowCacheInvalidationBehavior::Static
);
```

In Blueprints, search for **Set Shadow Cache Invalidation Behavior** on any Primitive Component.

### World Position Offset (WPO) and Shadows

WPO (used for vegetation sway, flag animation, etc.) forces shadow pages to re-render because the geometry shape changes every frame. This is one of the most common VSM performance killers.

**Mitigation — WPO Disable Distance:**

```cpp
// Set WPO Disable Distance on a component
// WHY: Beyond this distance, WPO is disabled, and the mesh uses the
// cached shadow page — massive GPU savings for foliage-heavy scenes.
MeshComponent->SetWorldPositionOffsetDisableDistance(5000.0f); // 50 meters
```

In the Static Mesh Editor or on a component, set **World Position Offset Disable Distance**. A value of 3000–8000 units works well for most foliage.

**This should be set on ALL foliage and ALL meshes using WPO.** The performance difference is significant — Fortnite's production team reported it as one of their most impactful optimizations.

### Foliage Shadow Optimization

For dense foliage (trees, bushes), consider a **shadow proxy** pattern:

1. The visible mesh component has **Cast Shadow = false** and renders with full material (leaves, alpha).
2. A hidden simplified mesh component has **Cast Hidden Shadow = true** — it is invisible but casts shadows with a cheaper mesh/material.
3. Enable **Contact Shadows** on the directional light to fill in close-range shadow detail.

This avoids rendering complex alpha-tested foliage into shadow maps while maintaining plausible shadow shapes.

```cpp
// Shadow proxy setup on a tree actor
// WHY: Foliage shadow maps are expensive due to alpha testing.
// A simplified shadow proxy mesh reduces VSM page render cost.

// Visible component — renders to main view, no shadow
VisibleFoliageMesh->SetCastShadow(false);

// Hidden proxy — casts shadow only, invisible in main view
ShadowProxyMesh->SetVisibility(false);
ShadowProxyMesh->SetCastHiddenShadow(true);
```

### LOD Shadow Optimization

For meshes with LODs (non-Nanite or hybrid pipelines), disable shadow casting on the lowest LOD levels:

- In the Static Mesh Editor → LOD Settings → per-LOD → uncheck **Cast Shadow** on LOD 2, LOD 3, etc.
- The main light's **Contact Shadows** will fill in close-range detail where the low LOD lacks it.

---

## Console Variables Reference

### Core VSM Controls

```
r.Shadow.Virtual.Enable 1                    ; Master toggle (1 = VSM, 0 = fallback to CSM)
r.Shadow.Virtual.Cache 1                     ; Enable page caching (always keep on in shipping builds)
r.Shadow.Virtual.Cache.StaticSeparate 1      ; Separate cache for static geometry (improves cache hit rate)
```

### Resolution and Quality

```
r.Shadow.Virtual.ResolutionLodBiasDirectional 0  ; Bias for directional light resolution (negative = higher res)
r.Shadow.Virtual.ResolutionLodBiasLocal 0        ; Bias for local light resolution
r.Shadow.Virtual.MaxPhysicalPages 4096           ; Max GPU memory pages for shadow data
r.Shadow.Virtual.SMRT.RayCountDirectional 8      ; Shadow Map Ray Traced filtering — ray count for directional
r.Shadow.Virtual.SMRT.RayCountLocal 8            ; Ray count for local lights
```

### Debugging and Profiling

```
r.Shadow.Virtual.Visualize 1                 ; Visualize allocated pages, cache state, and invalidation
r.Shadow.Virtual.ShowStats 1                 ; On-screen stats: pages allocated, cached, rendered
stat ShadowRendering                         ; Shadow pass GPU timings
ProfileGPU                                   ; Full GPU profiler (look for "Shadow" entries)
```

### Performance Tuning

```
r.Shadow.Virtual.NonNanite.IncludeInCoarsePages 1  ; Include non-Nanite geometry in coarse shadow pages
r.Shadow.Virtual.Cache.InvalidateUseHZB 1           ; Use HZB for smarter cache invalidation
r.ContactShadows 1                                   ; Enable contact shadows (complements VSM)
r.ContactShadows.NonShadowCastingIntensity 0.3      ; Contact shadow strength on non-shadow-casting objects
```

---

## VSM and Nanite Integration

VSM and Nanite are designed as a pair. When both are active:

- Nanite geometry is rendered directly into VSM pages using the GPU-driven Nanite pipeline — no CPU draw calls per shadow-casting mesh.
- Nanite's automatic LOD selection applies to shadow rendering too — distant shadow casters use fewer triangles.
- The combination eliminates the "shadow pop" artifacts common with CSM + traditional LODs.

**Non-Nanite geometry** is also supported in VSM but at higher CPU cost (traditional draw calls per mesh). For best performance, enable Nanite on as much static geometry as possible.

---

## Common Pitfalls

1. **Not setting WPO Disable Distance on foliage** — This is the #1 VSM performance issue in foliage-heavy scenes. Every frame, every foliage mesh with active WPO forces its shadow pages to re-render.

2. **Leaving Shadow Cache Invalidation on Auto for static geometry** — `Auto` may not classify all truly-static geometry correctly. Explicitly set `Static` on environment meshes.

3. **Too many local lights with shadows** — Each shadow-casting local light adds VSM pages. Use **Max Draw Distance** and **Attenuation Radius** to limit shadow-casting range on fill lights.

4. **Masked materials in shadow passes** — Alpha-tested materials (foliage, fences) are more expensive to render into shadow maps than opaque materials. Consider the shadow proxy pattern for dense masked geometry.

5. **Forgetting Contact Shadows** — Contact Shadows are cheap and fill in small-scale shadow detail that VSM's page resolution may miss at close range. Enable them on your directional light.

---

## Quick-Start Checklist

```
□ VSM is enabled by default in UE5 — verify with r.Shadow.Virtual.Enable
□ Set Shadow Cache Invalidation = Static on all non-moving environment meshes
□ Set WPO Disable Distance on ALL foliage and WPO-using meshes (3000–8000 units)
□ Enable Contact Shadows on directional light
□ Profile with r.Shadow.Virtual.ShowStats 1 and stat ShadowRendering
□ Consider shadow proxy pattern for dense foliage
□ Enable Nanite on static meshes for efficient GPU-driven shadow rendering
□ Limit shadow-casting local lights (use Max Draw Distance)
```
