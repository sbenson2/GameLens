# Nanite Tessellation & Displacement

> **Category:** guide · **Engine:** Unreal Engine 5.3+ · **Related:** [G9 Rendering — Nanite & Lumen](G9_rendering_nanite_lumen.md), [G18 Material System & Shaders](G18_material_system_shaders.md), [G36 Substrate Material System](G36_substrate_material_system.md)

Nanite Tessellation lets the engine subdivide low-polygon Nanite meshes at render time and apply displacement maps to produce high-detail surfaces without authoring dense geometry. Introduced experimentally in UE 5.3 and promoted to Beta in UE 5.4, this feature is production-viable from UE 5.5 onward. It works for landscapes, static meshes, and any Nanite-enabled geometry — enabling film-quality terrain and hard-surface detail from simple base meshes and texture data.

---

## When to Use Nanite Tessellation

| Use Case | Why Tessellation Helps |
|---|---|
| Terrain with height-map detail (cracks, erosion, rocks) | Displacement adds geometric depth that parallax mapping cannot match |
| Architectural detail (brick, stone, tile) | Real silhouette changes on close-up surfaces |
| Stylized environments with exaggerated depth | Displacement produces real geometry, not a shading trick |
| Reducing artist workload on hero meshes | Author simple meshes + displacement textures instead of dense sculpts |

**When NOT to use it:**

- Skeletal meshes (not supported as of UE 5.5)
- Meshes that are never viewed at close range — the GPU cost is wasted
- Mobile / low-end targets — Nanite Tessellation requires hardware that supports Nanite

---

## Setup: Engine Configuration

Nanite Tessellation requires console variable opt-in. These are read-only at runtime, so set them in your project's config file before launch.

### DefaultEngine.ini

```ini
; Config/DefaultEngine.ini
[/Script/Engine.RendererSettings]
; Enable the tessellation pipeline inside Nanite (read-only at runtime)
r.Nanite.AllowTessellation=1
r.Nanite.Tessellation=1
```

After adding these lines, restart the editor. Without them, the material tessellation options will not appear.

### Plugin Requirement

Enable the **Nanite Displaced Mesh** plugin:

```
Edit → Plugins → search "Nanite Displaced Mesh" → Enable → Restart Editor
```

This plugin exposes the displaced mesh asset type and the material tessellation controls.

---

## Setup: Material Configuration

Once the engine and plugin are configured, tessellation is enabled per-material.

### Step-by-Step

1. **Open your material** in the Material Editor.

2. **Enable Material Attributes** (optional but recommended for complex materials):
   - In the Details panel, check **Use Material Attributes**.
   - This aggregates all material outputs into a single `MaterialAttributes` struct, making it easier to blend multiple layers.

3. **Enable Tessellation**:
   - In the material Details panel, check **Enable Tessellation**.
   - This unlocks the **Displacement** input pin on the material output node.

4. **Connect a Displacement source**:
   - Use a `Texture Sample` node sampling your displacement / height map.
   - Optionally multiply by a scalar parameter to control displacement intensity.
   - Connect the result to the **Displacement** pin.

5. **Configure Displacement Settings** (material Details panel):
   - **Displacement Magnitude** — world-space maximum extrusion distance. Start with 5–20 units and adjust.
   - **Displacement Center** — the height value treated as "no displacement." Typically 0.5 for centered maps, 0.0 for maps where black = base surface.

### Material Graph Example

```
[Texture Sample: T_Displacement]
        |
        v
[Multiply] ← [Scalar Param: DisplacementStrength = 10.0]
        |
        v
 Material Output → Displacement pin
```

### Blending Multiple Layers

For terrain materials with multiple layers (rock, dirt, grass), use `MakeMaterialAttributes` per layer and blend them with `BlendMaterialAttributes`. Each layer can have its own displacement texture — the blend node interpolates displacement correctly.

```
Layer_Rock (MakeMaterialAttributes) ──┐
                                       ├─ BlendMaterialAttributes → Output
Layer_Dirt (MakeMaterialAttributes) ──┘         ↑
                                          Alpha from landscape layer blend
```

---

## Landscape-Specific Setup

Landscapes have additional requirements because they use the Landscape rendering path alongside Nanite.

1. **Enable Nanite on the Landscape**:
   - Select the Landscape actor → Details → Nanite section → check **Enable Nanite**.
   - After major landscape edits, rebuild Nanite data: right-click Landscape → **Build Nanite Data**.

2. **Landscape Material**:
   - The landscape material must have tessellation enabled (see above).
   - Use `LandscapeLayerBlend` nodes for per-layer displacement.

3. **Rebuild after changes**:
   - Nanite data for landscapes is baked. After sculpting or changing the displacement setup, rebuild via the Landscape context menu or the Build menu.

### Common Pitfall

If tessellation appears to have no effect on a landscape, verify:
- `r.Nanite.AllowTessellation=1` is set in DefaultEngine.ini (not just the console).
- The Nanite Displaced Mesh plugin is enabled.
- You rebuilt Nanite data after enabling the feature.

---

## Static Mesh Setup

For non-landscape meshes:

1. **Enable Nanite** on the Static Mesh asset (Mesh Editor → Nanite Settings → Enable).
2. **Apply a material** with tessellation enabled (as configured above).
3. No rebuild step is needed — displacement is applied at render time.

### Per-Mesh Tessellation Control

You can control the tessellation level on individual mesh components via:

```cpp
// C++ — Set the relative tessellation factor on a component
// WHY: Reduce GPU cost on distant or less important meshes
// while keeping high detail on hero assets.
MeshComponent->SetNaniteTessellationFactor(0.5f); // 0.0 = no tessellation, 1.0 = full
```

In Blueprints, search for **Set Nanite Tessellation Factor** on a Static Mesh Component.

---

## Performance Considerations

### GPU Cost Model

Nanite Tessellation adds GPU cost proportional to:
- **Screen coverage** of tessellated surfaces (more pixels → more tessellated triangles)
- **Displacement magnitude** (larger extrusion → more subdivisions needed)
- **Number of tessellated materials** visible simultaneously

The engine automatically adjusts tessellation density based on screen-space pixel size, so distant surfaces receive fewer subdivisions.

### Optimization Tips

| Technique | Effect |
|---|---|
| Lower `DisplacementMagnitude` on non-hero surfaces | Reduces subdivision depth |
| Use tessellation only on materials that need real silhouette changes | Avoids GPU cost on flat surfaces |
| Set `NaniteTessellationFactor` < 1.0 on background props | Per-component cost control |
| Profile with `stat Nanite` and `r.Nanite.ShowStats 1` | Identify tessellation hotspots |
| Limit tessellated material count in a single view | Fewer unique tessellation shaders = less GPU pressure |

### Console Variables for Debugging

```
r.Nanite.Tessellation                ; 0/1 — master toggle (requires restart)
r.Nanite.AllowTessellation           ; 0/1 — project-level opt-in (requires restart)
r.Nanite.ShowStats 1                 ; on-screen Nanite performance overlay
stat Nanite                          ; detailed Nanite GPU timings
r.Nanite.Visualize.TriangleDensity 1 ; heatmap of triangle density (useful for spotting over-tessellation)
```

---

## Limitations (as of UE 5.5)

- **Skeletal meshes** — not supported. Tessellation is static-geometry only.
- **Mobile rendering** — Nanite is not available on mobile, so tessellation is not either.
- **Runtime toggle** — `r.Nanite.Tessellation` is read-only after engine init. You cannot toggle tessellation on/off at runtime; control it per-component with the tessellation factor instead.
- **Translucent materials** — Nanite does not support translucency, so tessellated materials must be opaque or masked.
- **World Position Offset interaction** — WPO on tessellated meshes can cause visual artifacts. If using both, test carefully and consider disabling WPO at distance via `WPO Disable Distance`.

---

## Quick-Start Checklist

```
□ Add r.Nanite.AllowTessellation=1 to DefaultEngine.ini
□ Add r.Nanite.Tessellation=1 to DefaultEngine.ini
□ Enable "Nanite Displaced Mesh" plugin
□ Restart editor
□ Enable Nanite on mesh or landscape
□ Enable "Enable Tessellation" in material Details
□ Connect displacement texture to Displacement pin
□ Set DisplacementMagnitude (start with 10)
□ Profile with stat Nanite
```
