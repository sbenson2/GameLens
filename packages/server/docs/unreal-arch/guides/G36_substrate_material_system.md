# G36 — Substrate Material System

> **Category:** guide · **Engine:** Unreal Engine 5.5+ · **Related:** [G18 Material System & Shaders](G18_material_system_shaders.md) · [G9 Rendering — Nanite & Lumen](G9_rendering_nanite_lumen.md)

Substrate (formerly Strata) is Unreal Engine's next-generation material authoring framework, available as a **beta** feature from UE 5.5 onward (targeted for production-ready status in UE 5.7). It replaces the fixed suite of legacy shading models (Default Lit, Subsurface, Clear Coat, etc.) with a physically-based, composable slab system. Materials in Substrate are built from layers of matter — each a principled BSDF parameterized by measurable physical properties — which are combined using dedicated operators.

---

## Why Substrate?

### Limitations of Legacy Shading Models

The legacy material system offers ~12 discrete shading models. Each has a fixed set of inputs and a hardcoded lighting evaluation path. This creates several problems:

- **No blending between models** — you cannot smoothly transition from Default Lit to Clear Coat to Subsurface on the same surface.
- **Restricted parameter space** — each model exposes different pins; switching models means rewiring the graph.
- **Material Layers are workarounds** — Material Layer Blend in legacy mode layers via parameter blending, not physically-correct BSDF composition.

### What Substrate Solves

- **Single unified BSDF** — the Substrate Slab node replaces all legacy shading models with one physically-based representation.
- **Composable layers** — stack, coat, and blend slabs with dedicated operators that respect energy conservation.
- **Wider parameter space** — parameters map to real physical quantities (IOR, mean free path, anisotropy), enabling materials that were impossible or required hacks in the legacy system.

---

## Enabling Substrate

### Project Settings (UE 5.5+)

Substrate is opt-in and requires a project-wide setting change:

1. **Project Settings → Engine → Rendering → Substrate → Enable Substrate Materials** = true
2. **Restart the editor** — this is a global rendering change that recompiles all shaders.

> **Warning:** Enabling Substrate converts all materials project-wide to use the Substrate pipeline. Existing materials authored with legacy shading models will be automatically converted, but the conversion is one-way in practice — test on a branch first.

### Console Variable

```
r.Substrate.Enable 1
```

---

## Core Concepts

### The Slab

A **Slab** is the fundamental building block in Substrate. It represents a "slab of matter" composed of:

- **Interface** — the surface boundary (roughness, specular color, metallic behavior, anisotropy)
- **Medium** — the volume of matter beneath the interface (subsurface scattering, absorption, mean free path)

Together, these define a principled BSDF that encompasses what legacy UE would split across Default Lit, Subsurface, Subsurface Profile, and Cloth shading models.

### Slab Node Inputs

| Input | Type | Description |
|-------|------|-------------|
| Diffuse Albedo | Color | Base diffuse color (replaces Base Color for non-metals) |
| F0 | Color | Fresnel reflectance at normal incidence (replaces Metallic + Specular) |
| F90 | Color | Reflectance at grazing angle (usually white for dielectrics) |
| Roughness | Scalar | Surface micro-roughness (same as legacy) |
| Anisotropy | Scalar | Anisotropic specular stretching (-1 to 1) |
| Normal | Vector | Surface normal (same as legacy) |
| Tangent | Vector | Tangent direction for anisotropy |
| SSSMFP (Mean Free Path) | Color | Subsurface scattering mean free path — how far light travels through the medium. Set to 0 for opaque surfaces |
| SSS Phase Anisotropy | Scalar | Henyey-Greenstein phase function parameter |
| Emissive Color | Color | Self-illumination |
| Second Roughness | Scalar | Second specular lobe roughness (for fabrics, etc.) |
| Fuzz Amount | Scalar | Cloth-like fuzz layer intensity |
| Fuzz Color | Color | Color of the fuzz layer |
| Fuzz Roughness | Scalar | Roughness of the fuzz layer |
| Thickness | Scalar | Thin translucency thickness |
| Glint | — | Glint parameters for sparkle effects |

### Key Insight: F0 Replaces Metallic

In the legacy system, `Metallic` is a 0-1 blend that switches between dielectric and conductor behavior. In Substrate, you directly specify `F0` (reflectance at normal incidence):

- **Dielectric** (plastic, wood): F0 ≈ (0.04, 0.04, 0.04), Diffuse Albedo = surface color
- **Conductor** (gold, copper): F0 = metal reflectance color, Diffuse Albedo = black
- **In-between** — Substrate handles this physically; no binary metal/non-metal switch

---

## Substrate Operators

Operators combine multiple Slabs into complex multi-layer materials.

### Substrate Vertical Layer

Coats the **bottom** slab with the **top** slab. The top layer acts as a clear coat, varnish, or film. Energy conservation is maintained — light that passes through the top layer is attenuated before reaching the bottom.

```
Top Slab (clear coat, lacquer, ice)
─────────────────────────────────
Bottom Slab (base paint, skin, metal)
```

Use case: car paint with clear coat, lacquered wood, wet skin.

### Substrate Horizontal Mix

Blends two slabs side-by-side using a mix factor (0–1) or a mask texture. This is a spatial blend, not a vertical layer stack.

Use case: rust blending into clean metal, moss over stone, paint wear revealing underlying material.

### Substrate Coverage

Controls the fractional coverage of a slab. At coverage < 1, the slab partially covers the surface, allowing the background (or a lower layer) to show through. Useful for decals and sparse surface detail.

### Substrate Add

Adds the lighting contribution of two slabs. This is not physically correct for most use cases but useful for special effects like combining emissive overlays.

### Substrate Weight

Scales a slab's contribution by a weight factor. Useful for fading layers in and out.

---

## Practical Patterns

### Pattern 1: Metallic Paint with Clear Coat

```
Substrate Vertical Layer
├── Top: Slab (F0=0.04, Roughness=0.05)        ← clear coat
└── Bottom: Slab (F0=paint_color, Roughness=0.3) ← base paint
```

### Pattern 2: Wet / Dry Surface Blend

```
Substrate Horizontal Mix (Mix = wetness_mask)
├── A: Slab (Roughness=0.7)                      ← dry surface
└── B: Slab (Roughness=0.1, F0 boosted)          ← wet surface
```

### Pattern 3: Subsurface Skin

```
Single Slab
├── Diffuse Albedo = skin_color
├── F0 = (0.028, 0.028, 0.028)    ← skin IOR ~1.4
├── Roughness = 0.4
├── SSSMFP = (1.2, 0.4, 0.15)     ← red scatters far, blue scatters close
└── Fuzz Amount = 0.1              ← peach fuzz
```

### Pattern 4: Rusted Metal (Wear)

```
Substrate Horizontal Mix (Mix = rust_mask_texture)
├── A: Slab (F0=iron_reflectance, Roughness=0.2)  ← clean metal
└── B: Slab (F0=0.04, Diffuse=rust_color, Roughness=0.8) ← rust (dielectric)
```

---

## Migration from Legacy Materials

### Automatic Conversion

When Substrate is enabled, the engine automatically converts legacy material graphs:

| Legacy Concept | Substrate Equivalent |
|----------------|---------------------|
| Base Color (Metallic=0) | Diffuse Albedo |
| Base Color (Metallic=1) | F0 (Diffuse Albedo = black) |
| Metallic 0–1 blend | Interpolation between dielectric F0 and conductor F0 |
| Specular (0–1 scalar) | Scales dielectric F0 around 0.04 |
| Clear Coat shading model | Substrate Vertical Layer with a gloss top slab |
| Subsurface shading model | Single Slab with SSSMFP > 0 |
| Cloth shading model | Single Slab with Fuzz Amount > 0 |

### Manual Considerations

- Review converted materials — automatic conversion handles common cases but complex Material Functions or custom shading model hacks may need manual adjustment.
- Legacy Material Layers (blend layers) should be re-authored using Substrate operators for correct energy conservation.
- Performance profile after conversion — Substrate may have different shader permutation costs than legacy.

---

## Performance Considerations

### Shader Compilation

Substrate reduces the total number of shading model permutations (no more separate paths for Default Lit, Clear Coat, Subsurface, etc.), which can **reduce** total shader permutation count. However, complex multi-layer Substrate materials with many operators may produce more expensive per-pixel evaluation.

### Runtime Cost

- **Single-slab materials** are roughly equivalent to legacy Default Lit in cost.
- **Vertical Layer (2 slabs)** is comparable to legacy Clear Coat.
- **3+ layer stacks** increase per-pixel ALU cost. Profile with `stat gpu` and `ProfileGPU`.

### Best Practices

- Keep slab count per material to 2–3 maximum for real-time game use.
- Use Horizontal Mix with texture masks rather than stacking many vertical layers.
- Set SSSMFP to exactly 0 (black) on surfaces that don't need subsurface scattering — this disables the SSS evaluation path.
- Use Material Instances to override Slab parameters without creating new shader permutations.

---

## C++ Interaction

### Checking if Substrate is Enabled

```cpp
#include "RenderCore.h"

// Check at runtime whether Substrate is active
static const auto* CVarSubstrate = IConsoleManager::Get().FindTConsoleVariableDataInt(TEXT("r.Substrate.Enable"));
bool bSubstrateEnabled = CVarSubstrate && CVarSubstrate->GetValueOnGameThread() > 0;
```

### Setting Material Parameters (Unchanged)

Material Instance Dynamic parameter setting works identically whether Substrate is enabled or not — you set scalar and vector parameters by name:

```cpp
UMaterialInstanceDynamic* MID = UMaterialInstanceDynamic::Create(BaseMaterial, this);
MID->SetVectorParameterValue(FName("DiffuseAlbedo"), FLinearColor(0.8f, 0.2f, 0.1f));
MID->SetScalarParameterValue(FName("Roughness"), 0.4f);
```

The Substrate Slab node in the material graph exposes these parameters through the same `FName`-based system as legacy materials.

---

## Known Limitations (UE 5.5 Beta)

- **Beta status** — production-ready target is UE 5.7. Expect API changes.
- **One-way conversion** — once Substrate is enabled and materials are resaved, reverting to legacy requires manual work.
- **Mobile support limited** — Substrate is primarily a desktop/console feature. Mobile rendering paths may fall back to simplified evaluation.
- **Decal interaction** — some Substrate operator combinations have incomplete decal support as of UE 5.5.
- **Custom shading models** — creating entirely custom Substrate BSDFs requires engine source modification (not available in Blueprint or standard C++).

---

## Further Reading

- [Substrate Materials Overview (Epic)](https://dev.epicgames.com/documentation/en-us/unreal-engine/overview-of-substrate-materials-in-unreal-engine)
- [Substrate Materials Reference (Epic)](https://dev.epicgames.com/documentation/en-us/unreal-engine/substrate-materials-in-unreal-engine)
- [Substrate: Authoring Materials That Matter (SIGGRAPH 2023)](https://advances.realtimerendering.com/s2023/2023%20Siggraph%20-%20Substrate.pdf)
- [G18 — Material System & Shaders](G18_material_system_shaders.md) — legacy material system guide for comparison
