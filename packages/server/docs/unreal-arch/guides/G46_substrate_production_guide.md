# Substrate Production Guide

> **Category:** guide · **Engine:** Unreal Engine 5.7 (Production-ready) · **Related:** [G36 Substrate Material System](G36_substrate_material_system.md), [G18 Material System & Shaders](G18_material_system_shaders.md), [G9 Rendering — Nanite & Lumen](G9_rendering_nanite_lumen.md)

Substrate reached **production-ready** status in UE 5.7 and is **enabled by default** for new projects. This guide builds on the Substrate fundamentals in [G36](G36_substrate_material_system.md) with production-grade workflows: operator composition patterns, migration from legacy materials, automotive/archviz material recipes, and performance tuning. For the conceptual foundation (Slab BSDF, operator model, why Substrate exists), start with G36.

---

## Production Status Summary

| Version | Status | Notes |
|---------|--------|-------|
| UE 5.3 | Experimental | Initial Substrate (then called "Strata") |
| UE 5.5 | Beta | Renamed to Substrate; major API stabilization |
| UE 5.7 | **Production-ready** | Enabled by default; 280+ free automotive materials on Fab |

**Hybrid workflows are supported** — legacy materials and Substrate materials coexist in the same project without conflicts. You can migrate surfaces incrementally.

---

## Operator Reference

Substrate materials are built by composing Slabs (layers of matter) with Operators. Understanding the operator stack is essential for production work.

### Substrate Slab BSDF

The foundational building block. Each Slab represents a layer of physical material:

```
┌─────────────────────────────────────────┐
│            Substrate Slab BSDF           │
│                                          │
│  Base Color ──────────▶ Diffuse albedo   │
│  Metallic ────────────▶ 0=dielectric     │
│  Specular ────────────▶ F0 adjustment    │
│  Roughness ───────────▶ Microfacet rough │
│  Normal ──────────────▶ Surface normal   │
│  Emissive ────────────▶ Self-illumination│
│  Subsurface Color ────▶ SSS profile      │
│  Mean Free Path ──────▶ SSS depth        │
│  Fuzz Amount ─────────▶ Cloth/velvet     │
│  Fuzz Color ──────────▶ Fuzz tint        │
│  Second Roughness ────▶ Dual-lobe spec   │
│  Glint ───────────────▶ Sparkle effect   │
│  Thin Film ───────────▶ Iridescence      │
└─────────────────────────────────────────┘
```

A single Slab can represent metal, dielectric, cloth, subsurface skin, or any blend — no more switching between discrete shading models.

### Vertical Layer Operator

Stacks one Slab on top of another with **physically correct transmittance**:

```
         ┌──────────┐
         │   Top     │ ← Clear coat, varnish, water film
         │   Slab    │
         └────┬─────┘
              │ light transmits through top thickness
         ┌────▼─────┐
         │  Bottom   │ ← Base paint, wood, metal
         │   Slab    │
         └──────────┘

[Substrate Vertical Layer]
    Top Input ──── clear coat Slab (roughness 0.05, IOR 1.5)
    Bottom Input ─ base paint Slab (metallic flake)
    Thickness ──── controls transmittance depth
```

**Use cases:** Car paint with clear coat, varnished wood, wet surfaces, skin with oily sheen.

**Key insight:** The Top Slab's thickness drives how much light reaches the Bottom. Thicker top = more absorption = darker base appearance. Use the `Substrate Transmittance-To-MeanFreePath` helper to convert an intuitive transmittance color into the correct Mean Free Path value.

### Horizontal Blend Operator

Mixes two Slabs spatially using a blend mask:

```
[Substrate Horizontal Blend]
    Foreground ── rust Slab
    Background ── clean metal Slab
    Mix ───────── rust mask texture (0=metal, 1=rust)
```

**Use cases:** Rust on metal, dirt on paint, moss on stone, damage layers.

### Coverage Weight Operator

Controls the opacity ratio of a Slab in a vertical layer stack:

```
[Substrate Coverage Weight]
    Slab ──────── scratches Slab
    Weight ─────── scratch mask (0=no scratch, 1=full scratch)
        │
        ▼
[Substrate Vertical Layer]
    Top Input ──── (from Coverage Weight)
    Bottom Input ─ base surface
```

**Use cases:** Partial coverage effects — scratches that reveal base metal, chipped paint, worn edges.

### Add Operator

Combines Slab outputs additively — each Slab is evaluated independently and the results are summed. This is cheaper than vertical layering but less physically accurate.

**Use cases:** Performance-critical materials where transmittance simulation is unnecessary.

---

## Production Material Recipes

### Recipe 1 — Automotive Paint (3-Layer)

The classic car paint stack: base metallic flake → color tint layer → clear coat.

```
Layer 3 (Top):    Clear Coat
                  Slab: Roughness 0.02–0.08, no color, IOR 1.5
                      │
                      ▼
Layer 2 (Mid):    [Vertical Layer]
                  Color Tint
                  Slab: Subsurface color = paint hue,
                        MFP from Transmittance helper
                      │
                      ▼
Layer 1 (Base):   [Vertical Layer]
                  Metallic Flake
                  Slab: Metallic 0.8–1.0, high roughness variation,
                        Glint enabled for sparkle
```

**Tips:**
- Use `Thin Film` on the base flake for pearlescent/chameleon effects.
- Modulate clear coat roughness with a subtle noise for orange-peel realism.
- The 280+ free automotive Substrate materials on Fab implement this pattern — use them as starting points.

### Recipe 2 — Weathered Wood

```
[Horizontal Blend]
    ├── Foreground: aged wood Slab
    │     Base Color: desaturated, lighter
    │     Roughness: 0.8–0.95
    │
    └── Background: fresh wood Slab
          Base Color: warm brown
          Roughness: 0.4–0.6
          Subsurface: slight warm tint (wood SSS)

    Mix: edge-wear mask + noise
        │
        ▼
[Vertical Layer]
    Top: varnish Slab (optional)
        Roughness: 0.05–0.15
        Thickness: modulated by wear mask
    Bottom: blended wood from above
```

### Recipe 3 — Character Skin

```
[Vertical Layer]
    Top: oil/sweat film
        Slab: Roughness 0.1–0.3, very thin
        Coverage Weight: mask for forehead, nose, chin
    
    Bottom: skin base
        Slab: Subsurface profile enabled
              Base Color: diffuse skin texture
              Subsurface Color: warm red (blood layer)
              Mean Free Path: from TransmittanceToMFP(skin scatter color)
              Fuzz Amount: 0.1–0.3 (peach fuzz)
              Fuzz Color: blonde/light
```

---

## Migration from Legacy Materials

### When to Migrate

Migrate when you need:
- **Blended shading models** — a surface that transitions between metal, cloth, and subsurface.
- **Physically layered finishes** — clear coat over paint over flake.
- **New Substrate-only features** — Glint, Thin Film interference, Coverage Weight.

**Don't force-migrate** materials that work fine as legacy — the two systems render side by side. Prioritize hero assets, vehicles, and characters.

### Migration Steps

1. **Open the legacy material** in the Material Editor.
2. **Change shading model** — in Material Details, set `Material Domain` to `Surface` and enable `Use Substrate`.
3. **Replace the output node** — the legacy output node is replaced by a Substrate output that accepts a single Slab (or operator chain).
4. **Convert inputs:**

| Legacy Input | Substrate Equivalent |
|-------------|---------------------|
| Base Color | Slab → Base Color |
| Metallic | Slab → Metallic |
| Roughness | Slab → Roughness |
| Normal | Slab → Normal |
| Emissive Color | Slab → Emissive Color |
| Opacity (translucent) | Coverage Weight Operator |
| Subsurface Color | Slab → Subsurface Color + Mean Free Path |
| Clear Coat | Vertical Layer with clear coat Slab on top |
| Cloth | Slab → Fuzz Amount + Fuzz Color |

5. **Test with Lumen** — Substrate materials integrate with Lumen GI. Verify that indirect lighting looks correct after migration.

### Automated Conversion

UE 5.7 includes an experimental **Substrate Auto-Convert** option (right-click material → Convert to Substrate). This handles simple materials (Default Lit, basic Clear Coat) automatically. Complex materials with custom shading models require manual conversion.

---

## Performance Considerations

### Cost Model

Substrate materials are slightly more expensive than legacy equivalents due to the composable evaluation:

| Configuration | Relative Cost |
|--------------|---------------|
| Single Slab (equivalent to Default Lit) | ~1.0x legacy |
| Two Slabs + Horizontal Blend | ~1.2x |
| Two Slabs + Vertical Layer | ~1.3x |
| Three Slabs + nested Vertical Layers | ~1.6x |
| Four+ Slabs | ~2.0x+ |

### Optimization Strategies

- **Limit layer count** — 2–3 Slabs covers most real-world surfaces. Reserve 4+ for hero close-up assets.
- **Use Horizontal Blend over Vertical Layer when physically accurate transmittance isn't needed** — it's cheaper.
- **Leverage material instances** — parameterize your Substrate master material and swap parameters per instance rather than duplicating graphs.
- **Shader complexity view** — use `View Mode → Shader Complexity` to identify expensive materials. Substrate shows accurate per-pixel cost.
- **Nanite material slots** — Nanite meshes with Substrate materials benefit from the same per-cluster material evaluation. Keep material slot count per mesh low.

### Console Variables

| CVar | Default | Description |
|------|---------|-------------|
| `r.Substrate` | 1 | Enable Substrate rendering (project-wide) |
| `r.Substrate.Debug` | 0 | Debug visualization for Substrate layers |
| `r.Substrate.MaxClosureCount` | 4 | Maximum evaluated Slab closures per pixel |
| `r.Substrate.OpaqueMaterialMode` | 0 | 0=auto, 1=force single-slab fast path |

---

## Substrate + Lumen Integration

Substrate materials fully integrate with Lumen's global illumination and reflections:

- **Diffuse GI** — Slab albedo contributes to Lumen's surface cache for indirect bounce lighting.
- **Specular reflections** — each Slab's roughness is evaluated independently for Lumen screen traces and ray-traced reflections.
- **Emissive** — Substrate emissive surfaces are Lumen light sources. Use for neon signs, screens, glowing materials.
- **Subsurface** — Lumen correctly handles SSS profiles in Substrate Slabs for skin and translucent materials.

**Gotcha:** Very complex layer stacks (4+ Slabs) may produce slightly different indirect lighting than expected because Lumen's surface cache simplifies the material evaluation. Test with `r.Lumen.Reflections.Quality` at 4 for validation, then dial back for shipping.

---

## Common Pitfalls

1. **MFP confusion** — Mean Free Path is not transmittance color. Use `Substrate Transmittance-To-MeanFreePath` to convert. Plugging a color directly into MFP produces incorrect results.
2. **Over-layering** — more layers ≠ better. Each vertical layer adds a transmittance evaluation. Start simple; add layers only when the visual difference justifies the cost.
3. **Thickness of zero** — a Vertical Layer with thickness 0 makes the top Slab invisible. Always set a non-zero thickness.
4. **Legacy material instances** — material instances of a legacy parent cannot use Substrate operators. The parent material must be converted first.
5. **Mobile support** — Substrate is desktop/console only as of UE 5.7. Mobile projects should continue using legacy shading models.

---

## Resources

- **Fab Automotive Materials** — 280+ free Substrate materials from Epic: search "Automotive Substrate Materials" on [Fab](https://www.fab.com).
- **SIGGRAPH 2023 talk** — "Substrate: Authoring Materials That Matter" covers the rendering architecture in depth.
- **Unreal Fest Bali 2025** — "Exploring Substrate Materials: Basic to Advanced Techniques" demonstrates production patterns.
