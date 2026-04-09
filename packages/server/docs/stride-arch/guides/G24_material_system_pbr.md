# G24 — Material System and PBR Workflow

> **Category:** Guide · **Engine:** Stride · **Related:** [Stride Architecture Rules](../stride-arch-rules.md), [G04 — SDSL Shader Development](G04_sdsl_shader_development.md)

Stride uses a Physically Based Rendering (PBR) material system with a metallic/roughness workflow. Materials define how surfaces respond to light — their color, reflectivity, roughness, and transparency. Stride's layered material architecture lets you compose complex surfaces by stacking attribute layers, each contributing independently to the final shader. This guide covers the material system's architecture, properties, editor workflow, and code-side usage.

---

## Table of Contents

1. [Material System Overview](#1--material-system-overview)
2. [PBR Workflow — Metallic/Roughness](#2--pbr-workflow--metallicroughness)
3. [Material Attributes](#3--material-attributes)
4. [Material Maps](#4--material-maps)
5. [Material Layers](#5--material-layers)
6. [Creating Materials in the Editor](#6--creating-materials-in-the-editor)
7. [Materials in Code](#7--materials-in-code)
8. [Material Slots and Models](#8--material-slots-and-models)
9. [Clear-Coat and Special Effects](#9--clear-coat-and-special-effects)
10. [Performance and Best Practices](#10--performance-and-best-practices)

---

## 1 — Material System Overview

In Stride, materials are partial shader definitions that plug into the rendering pipeline. A material tells the renderer:

- **What color is this surface?** (diffuse/albedo)
- **How rough or smooth is it?** (roughness/glossiness)
- **Is it metallic or dielectric?** (metalness)
- **Does it have surface detail?** (normal maps, displacement)
- **Does it emit light?** (emissive)
- **Is it transparent?** (transparency)

Without materials, models are blank shapes. Materials are what make a wooden crate look wooden and a metal pipe look metallic.

### Architecture

Materials operate as layered attribute compositions:

```
Material
├── Geometry Attributes (tessellation, displacement, surface detail)
├── Shading Attributes (diffuse, specular/metalness, emissive)
├── Misc Attributes (occlusion, transparency, clear-coat)
└── Layers (additional material stacks blended on top)
```

Each attribute can be driven by a **material map** — a constant value, a texture, a vertex stream, or a procedural computation.

---

## 2 — PBR Workflow — Metallic/Roughness

Stride follows the metallic/roughness PBR model (same as glTF, Unreal, and Unity HDRP):

| Property | Range | Description |
|----------|-------|-------------|
| **Albedo (Diffuse)** | RGB color or texture | Base color of the surface. For metals, this is the specular color. |
| **Metalness** | 0.0 – 1.0 | 0 = dielectric (plastic, wood, skin). 1 = metal (gold, steel, aluminum). |
| **Roughness** | 0.0 – 1.0 | 0 = perfectly smooth mirror. 1 = completely rough/matte. |
| **Normal** | RGB normal map | Per-pixel surface detail without extra geometry. |
| **Ambient Occlusion** | 0.0 – 1.0 (grayscale) | Darkens crevices where ambient light is occluded. |
| **Emissive** | RGB + intensity | Surface self-illumination. Does not cast light by default (pair with a light component for that). |

### Energy Conservation

Stride's PBR shader automatically conserves energy — as metalness increases, diffuse contribution decreases and specular contribution increases. You don't need to manually balance these; the shader handles it.

### Typical Material Maps for Common Surfaces

| Surface | Metalness | Roughness | Notes |
|---------|-----------|-----------|-------|
| Polished metal | 1.0 | 0.1 – 0.3 | Tinted albedo = specular color |
| Rough metal | 1.0 | 0.5 – 0.8 | Brushed steel, cast iron |
| Plastic | 0.0 | 0.3 – 0.6 | Colored albedo, low roughness = shiny |
| Wood | 0.0 | 0.5 – 0.9 | Use normal map for grain |
| Skin | 0.0 | 0.4 – 0.6 | Consider subsurface scattering if available |
| Glass | 0.0 | 0.0 – 0.1 | Use transparency attribute |

---

## 3 — Material Attributes

### Geometry Attributes

| Attribute | Description |
|-----------|-------------|
| **Tessellation** | Subdivides mesh triangles at render time for displacement detail. Options: None, Flat, Point-Normal. |
| **Displacement** | Offsets vertices based on a height map. Requires tessellation to be effective. |
| **Surface** | Normal mapping — adds per-pixel surface detail via a normal map texture. |

### Shading Attributes

| Attribute | Description |
|-----------|-------------|
| **Diffuse** | The base color/albedo. Driven by color, texture, or vertex color. |
| **Diffuse Model** | Lambert (default) or other BRDF models. |
| **Specular** | Controls metalness. 0 = non-metal, 1 = metal. Can use a metalness map texture. |
| **Specular Model** | GGX microfacet model (default, industry standard). |
| **Emissive** | Self-illumination color and intensity. |

### Misc Attributes

| Attribute | Description |
|-----------|-------------|
| **Occlusion / Cavity** | Ambient occlusion map that darkens indirect-lit crevices. |
| **Transparency** | Blend mode (None, Blend, Additive, Cutoff). Cutoff uses alpha testing for foliage, fences, etc. |
| **Clear-Coat** | A secondary specular layer for car paint, lacquered surfaces. |

---

## 4 — Material Maps

A **material map** is the data source for any material attribute. Stride supports several map types:

| Map Type | Description | Use Case |
|----------|-------------|----------|
| **Texture** | A 2D image sampled at the surface's UV coordinates | Most common — albedo, normal, roughness textures |
| **Color** | A constant RGBA value | Solid-color materials, prototyping |
| **Float** | A constant scalar value | Metalness = 1.0, Roughness = 0.5 |
| **Vertex Stream** | Per-vertex data from the mesh | Vertex color painting |
| **Compute Scalar/Color** | Procedural computation (shader-generated) | Noise patterns, procedural detail |
| **Binary Operator** | Combines two maps (multiply, add, etc.) | Blending multiple textures |

### Texture Import Settings

When importing textures, Stride's asset pipeline applies settings based on usage:

| Texture Type | Color Space | Compression | Notes |
|-------------|-------------|-------------|-------|
| **Color/Albedo** | sRGB | BC1 (no alpha) or BC3 (with alpha) | Standard color textures |
| **Normal Map** | Linear | BC5 | Mark as Normal Map in import settings |
| **Roughness/Metalness** | Linear | BC4 (single channel) | Grayscale data |
| **Ambient Occlusion** | Linear | BC4 | Grayscale data |
| **Emissive** | sRGB | BC1/BC3 | Color space matches albedo |

> **Important:** Normal maps must be tagged as Normal Map type during import so Stride applies the correct linear color space and compression. Using sRGB for normal maps causes subtle lighting errors.

---

## 5 — Material Layers

Material layers let you compose complex surfaces by stacking materials. Each layer contributes additional attributes on top of the base material, with a blend mode controlling how they combine.

### How Layers Work

```
Base Material (e.g., stone wall)
  └── Layer 1: Moss (blended by a mask texture, adds green diffuse + higher roughness)
      └── Layer 2: Frost (blended by height, adds white diffuse + low roughness + normal)
```

Each layer has:

- **Its own material attributes** (diffuse, normal, roughness, etc.)
- **A blend map** (texture, vertex color, or computed) that controls where the layer is visible
- **A blend mode** (overwrite, add, multiply)

### Creating Layers in the Editor

1. Select a material in the Asset View.
2. In the Property Grid, expand **Layers**.
3. Click **+** to add a new layer.
4. Configure the layer's material attributes and blend settings.
5. Assign a **blend map** (e.g., a mask texture painted in your DCC tool).

### Use Cases

| Scenario | Implementation |
|----------|---------------|
| Weathered metal | Base: clean metal. Layer: rust with roughness map as blend mask. |
| Snow-covered terrain | Base: terrain. Layer: snow blended by world-space Y-normal (top surfaces). |
| Moss on stone | Base: stone. Layer: moss blended by AO or cavity map (crevices). |
| Wet surfaces | Base: dry material. Layer: wet variant with lower roughness, blended by a wetness mask. |

---

## 6 — Creating Materials in the Editor

### New Material

1. In the **Asset View**, click **Add asset → Materials → Material**.
2. The new material appears in the Asset View. Select it to configure in the Property Grid.

### Assigning Textures

1. Expand the attribute you want to configure (e.g., **Diffuse**).
2. Set the map type to **Texture**.
3. Drag a texture asset from the Asset View into the texture slot, or click the browse button.

### Live Preview

Game Studio provides a real-time material preview sphere. Changes to material properties update the preview immediately, showing how the surface will look under the scene's lighting.

### Material Templates

For consistent art direction, create a base material and duplicate it for variations. This ensures consistent roughness ranges, normal map strengths, and specular settings across similar surfaces.

---

## 7 — Materials in Code

### Accessing Materials at Runtime

```csharp
public class MaterialSwapper : SyncScript
{
    // Assign in editor
    public Material DamagedMaterial { get; set; }

    private ModelComponent _model;

    public override void Start()
    {
        _model = Entity.Get<ModelComponent>();
    }

    public void ApplyDamage()
    {
        if (_model != null && DamagedMaterial != null)
        {
            // Replace material on the first material slot
            _model.Materials[0] = DamagedMaterial;
        }
    }
}
```

### Modifying Material Parameters at Runtime

```csharp
public class MaterialAnimator : SyncScript
{
    public override void Update()
    {
        var model = Entity.Get<ModelComponent>();
        if (model == null) return;

        // Access the material's parameter collection
        var material = model.Materials[0];
        if (material != null)
        {
            // Modify parameters — e.g., animate emissive intensity
            // Parameters are accessed through the material's Passes
            // Each pass exposes a ParameterCollection
            var pass = material.Passes[0];
            pass.Parameters.Set(
                MaterialKeys.EmissiveIntensity,
                MathF.Sin((float)Game.UpdateTime.Total.TotalSeconds) * 2.0f + 2.0f
            );
        }
    }
}
```

### Creating Materials from Code

```csharp
public class ProceduralMaterial : StartupScript
{
    public Texture AlbedoTexture { get; set; }

    public override void Start()
    {
        // Create a material descriptor
        var descriptor = new MaterialDescriptor
        {
            Attributes =
            {
                Diffuse = new MaterialDiffuseMapFeature(
                    new ComputeTextureColor(AlbedoTexture)),
                DiffuseModel = new MaterialDiffuseLambertModelFeature(),
                MicroSurface = new MaterialGlossinessMapFeature(
                    new ComputeFloat(0.6f)),  // Roughness = 1 - 0.6 = 0.4
                Specular = new MaterialMetalnessMapFeature(
                    new ComputeFloat(0.0f)),  // Non-metallic
            }
        };

        // Create the material from the descriptor
        var material = Material.New(GraphicsDevice, descriptor);

        // Apply to the entity's model
        var model = Entity.Get<ModelComponent>();
        if (model != null)
        {
            model.Materials[0] = material;
        }
    }
}
```

> **Note:** `MaterialKeys` contains the parameter keys for standard PBR properties. Use these keys when setting parameters through `ParameterCollection`.

---

## 8 — Material Slots and Models

When a 3D model is imported, it carries material slot assignments from the DCC tool (Blender, Maya, etc.). In Stride:

- Each mesh subset references a **material slot index**.
- The `ModelComponent` on the entity exposes a `Materials` collection indexed by slot.
- You can override any slot's material in the editor or code without modifying the model asset.

### Multi-Material Models

A single model can have multiple materials (e.g., a character with skin, clothing, and armor slots):

```
Character Model
├── Slot 0: Skin material
├── Slot 1: Clothing material
├── Slot 2: Armor material
└── Slot 3: Eyes material
```

Override individual slots by setting `model.Materials[slotIndex]` in the Property Grid or code.

---

## 9 — Clear-Coat and Special Effects

### Clear-Coat

Clear-coat adds a secondary specular layer over the base material, simulating lacquer, car paint, or coated surfaces:

1. In the material's **Misc attributes**, enable **Clear-Coat**.
2. Configure:
   - **Clear-coat intensity** (0–1): Strength of the coat layer.
   - **Clear-coat roughness** (0–1): How rough the topcoat is (0 = mirror finish).
   - **Clear-coat normal**: Optional — adds micro-detail to the coat (e.g., orange-peel texture on car paint).

### Transparency

| Mode | Description | Use Case |
|------|-------------|----------|
| **None** | Fully opaque (default) | Solid objects |
| **Blend** | Alpha blending | Glass, water, holograms |
| **Additive** | Additive blending | Glowing effects, particles |
| **Cutoff** | Alpha test (binary) | Foliage, fences, hair cards |

For alpha-cutoff transparency, set the **Alpha cutoff** threshold. Pixels with alpha below the threshold are discarded entirely — no sorting issues, full shadow support.

---

## 10 — Performance and Best Practices

| Practice | Reason |
|----------|--------|
| **Minimize unique materials** | Objects sharing a material can be batched, reducing draw calls. |
| **Use texture atlases** | Multiple small textures on one atlas allow batching across objects. |
| **Compress textures** | Use GPU-compressed formats (BC/DXT). Stride does this by default — don't override to uncompressed. |
| **Appropriate texture resolution** | 4K textures on small props waste VRAM. Use 512–1K for small objects, 2K for hero assets. |
| **Limit material layers** | Each layer adds shader complexity. Use 1–2 layers max for runtime materials. |
| **Bake what you can** | Bake ambient occlusion, cavity, and detail into textures rather than computing at runtime. |
| **Normal map format** | Always mark normal maps as Normal Map type on import for correct compression and color space. |
| **Avoid unnecessary transparency** | Transparent objects can't use early-Z, increasing overdraw. Use alpha cutoff over blend when possible. |

### Material Instancing

When you need per-entity material variation (e.g., different team colors on the same armor material):

1. Create a base material with the shared properties.
2. At runtime, clone the material for each variant: `var clone = material.Clone()`.
3. Modify clone parameters (color tint, emissive, etc.).
4. Assign the clone to the entity's `ModelComponent.Materials`.

> **Warning:** Each cloned material is a unique draw — this trades batching efficiency for visual variety. Use sparingly on high-entity-count scenarios.

---

## See Also

- [G04 — SDSL Shader Development](G04_sdsl_shader_development.md) — writing custom shaders that materials can use
- [G07 — Custom Render Features](G07_custom_render_features.md) — extending the rendering pipeline
- [G10 — Custom Assets Pipeline](G10_custom_assets_pipeline.md) — texture and model import pipeline
- [G23 — Profiling and Performance](G23_profiling_performance.md) — measuring material/rendering cost
