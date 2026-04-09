# G18 — Material System & Shaders

> **Category:** guide · **Engine:** Unreal Engine 5.4+ · **Related:** [G9 Rendering — Nanite & Lumen](G9_rendering_nanite_lumen.md) · [G17 Niagara VFX](G17_niagara_vfx_system.md) · [Architecture Overview](../architecture/E1_architecture_overview.md)

Unreal Engine's Material system is a visual shader authoring pipeline built on top of HLSL. Materials control how every surface in your game looks — from physically-based metals and fabrics to stylized cel-shading and post-process effects. This guide covers the material architecture, the Master Material workflow, Material Instances, key material expressions, Nanite/Lumen-specific constraints, C++ integration, and optimization strategies.

---

## Material Architecture

```
┌──────────────────────────────────────────────────────────┐
│                 UE5 Material Pipeline                      │
│                                                            │
│  Material Editor (Node Graph)                              │
│       │                                                    │
│       ▼                                                    │
│  UMaterial (asset)                                         │
│       │                                                    │
│       ├──► HLSL Code Generation                            │
│       │        │                                           │
│       │        ▼                                           │
│       │    Platform Shader Compilation                     │
│       │    (SM5, SM6, Vulkan, Metal, etc.)                 │
│       │        │                                           │
│       │        ▼                                           │
│       │    Shader Permutations (per usage context)         │
│       │                                                    │
│       └──► UMaterialInstance (overrides parameters only)   │
│              • No recompilation                            │
│              • Instant iteration                           │
│              • GPU-friendly parameter updates              │
└──────────────────────────────────────────────────────────┘
```

**Key insight:** Every UMaterial compiles into HLSL shaders. Changing the node graph triggers a full recompile (seconds to minutes). Material Instances override only exposed parameters (textures, scalars, vectors) without recompiling — use instances everywhere in production.

---

## Shading Models

The Shading Model determines how light interacts with the surface. Set it in Material Details → Material → Shading Model.

| Shading Model | Use Case | Key Inputs |
|---------------|----------|------------|
| **Default Lit** | Most opaque surfaces (metal, wood, stone, plastic) | Base Color, Metallic, Roughness, Normal |
| **Unlit** | UI elements, emissive screens, custom lighting | Emissive Color only |
| **Subsurface** | Wax, jade, thick skin — light scatters through | Base Color, Subsurface Color, Opacity |
| **Subsurface Profile** | Realistic skin, ears backlit by sun | Base Color, Subsurface Profile asset |
| **Preintegrated Skin** | Cheaper skin shading (mobile-friendly) | Base Color, Subsurface Color |
| **Clear Coat** | Car paint, lacquered wood, wet surfaces | Base Color + Clear Coat, Clear Coat Roughness |
| **Hair** | Strand-based hair rendering (with Groom system) | Base Color, Scatter, Backlit |
| **Cloth** | Fabrics with fuzz/sheen (velvet, silk) | Base Color, Fuzz Color |
| **Eye** | Realistic eye rendering with refraction | Iris, Sclera textures |
| **Two Sided Foliage** | Leaves — light passes through thin surfaces | Base Color, Subsurface Color |
| **From Material Expression** | Per-pixel shading model selection (advanced) | Dynamic — use Shading Model node |

```
WHY choose the right shading model: Each model adds shader instructions
and potentially extra render passes. Default Lit is cheapest for opaque
surfaces. Subsurface adds a screen-space scattering pass. Clear Coat adds
a second specular lobe. Only use specialized models when the visual result
requires it — Default Lit handles 80% of game surfaces.
```

---

## Blend Modes

| Blend Mode | When to Use | Performance Cost |
|------------|-------------|-----------------|
| **Opaque** | Solid surfaces — walls, floors, characters | Cheapest. Uses deferred shading. Nanite-compatible. |
| **Masked** | Binary transparency — chain-link fence, leaves | Opaque cost + alpha test. Nanite-compatible. |
| **Translucent** | Smooth transparency — glass, water, smoke | Expensive. Forward-rendered. NOT Nanite-compatible. |
| **Additive** | Glow effects, fire, energy shields | Forward. Adds to scene color. No shadows. |
| **Modulate** | Decal darkening, multiply effects | Forward. Multiplies against scene. Rare. |

```
WHY prefer Masked over Translucent: Masked materials render in the
deferred pass (same as Opaque), support Nanite, receive and cast shadows,
and are dramatically cheaper than Translucent. The tradeoff is no partial
transparency — pixels are either fully opaque or fully clipped. For foliage,
fences, and decals, Masked is almost always the right choice.
```

---

## Material Domains

| Domain | Purpose |
|--------|---------|
| **Surface** | Standard 3D surface material (default — 95% of materials) |
| **Deferred Decal** | Projected onto existing surfaces (bullet holes, splatter) |
| **Light Function** | Controls light shape/fallback (gobos, stained glass shadows) |
| **Volume** | Volumetric fog and clouds |
| **Post Process** | Full-screen post-processing effects |
| **User Interface** | UMG/Slate widget rendering |

---

## The Master Material Pattern

The most important production workflow: create a small number of "Master Materials" with many exposed parameters, then create Material Instances for every surface in your game.

```
Master Material: M_Standard_Surface
  │
  ├── MI_BrickWall_Red      (Instance — overrides textures + tint)
  ├── MI_BrickWall_Mossy    (Instance — different textures, same graph)
  ├── MI_ConcreteFloor      (Instance — different roughness)
  └── MI_MetalPanel_Rusty   (Instance — metallic=1, rust mask)
```

### Creating a Master Material

```
Material Graph: M_Standard_Surface

Key Nodes:
  ┌─────────────────────────────────────────────┐
  │ Texture2DParameter "BaseColorMap"            │──► Base Color
  │ Texture2DParameter "NormalMap"               │──► Normal
  │ Texture2DParameter "ORMMap"                  │──► Channel breakout:
  │   (Occlusion, Roughness, Metallic packed)    │      R → AO
  │                                              │      G → Roughness
  │                                              │      B → Metallic
  │ ScalarParameter "RoughnessScale" (default 1) │──► Multiply → Roughness
  │ VectorParameter "ColorTint" (default white)  │──► Multiply → Base Color
  │ StaticSwitchParameter "UseEmissive"          │──► Branch to Emissive
  └─────────────────────────────────────────────┘
```

```
WHY pack ORM into one texture: Three separate textures = 3 texture samples
per pixel. Packing Occlusion/Roughness/Metallic into RGB channels of one
texture = 1 sample. This saves GPU bandwidth and texture memory. It's
the standard AAA practice (sometimes called ORM, ARM, or MRA packing).
```

### Static Switch Parameters

```
WHY StaticSwitchParameter: Regular if-branches compile BOTH paths into the
shader. Static switches compile ONLY the active path per material instance,
producing smaller, faster shaders. Use them for feature toggles (emissive
on/off, detail normal on/off, vertex animation on/off).

TRADEOFF: Each unique combination of static switches produces a separate
shader permutation. 10 static switches = up to 1024 permutations. Keep
static switches under 5-6 per master material.
```

---

## Key Material Expressions

### Texture Sampling

| Node | Purpose |
|------|---------|
| `TextureSample` | Standard texture lookup |
| `TextureObject` | Pass texture reference to functions |
| `TextureCoordinate` | UV channel selection + tiling |
| `Panner` | Animated UV scrolling (rivers, lava) |
| `Rotator` | Animated UV rotation |
| `WorldAlignedTexture` | Project texture in world space (no UV seams on terrain) |

### Math Operations

| Node | Purpose |
|------|---------|
| `Lerp` | Blend between two values (A, B, Alpha) — most-used node |
| `Multiply / Add / Subtract` | Basic math |
| `Clamp / Saturate` | Clamp to range / clamp to 0-1 |
| `Power` | Contrast adjustment (sharpen/soften masks) |
| `Fresnel` | View-angle-based effect (rim lighting, glass reflections) |
| `Dot Product` | Surface angle relative to direction (snow on top of rocks) |

### World Data

| Node | Purpose |
|------|---------|
| `WorldPosition` | Pixel world position (triplanar mapping, distance fading) |
| `ActorPosition` | Owning actor's location (proximity effects) |
| `CameraPosition` | Camera location (distance-based detail) |
| `Time` | Elapsed time (animation, pulsing) |
| `VertexNormalWS` | World-space vertex normal (snow accumulation) |

### Material Functions

Material Functions are reusable subgraphs — the equivalent of functions in code.

```
Content Browser → Right-click → Materials → Material Function

Example: MF_HeightBlend
  Inputs: Layer A (color), Layer B (color), Height A, Height B, Blend Alpha
  Output: Blended color with height-aware transition
  
Usage: Drop MF_HeightBlend into any material to get terrain-style
layer blending with sharp, realistic transitions along height maps.

WHY Material Functions: They DRY up your material graphs. Fix a bug in
the function → every material using it gets the fix. They also reduce
node-graph complexity, making materials easier to read and maintain.
```

---

## Nanite & Lumen Material Constraints

### Nanite Requirements

```
✅ Supported:     Opaque, Masked blend modes
❌ Not Supported: Translucent, Additive, Modulate

✅ Supported:     Default Lit, Unlit, Subsurface, Clear Coat, Two Sided Foliage
❌ Not Supported: Hair (requires strand rendering, not mesh)

⚠️  World Position Offset (WPO): Supported in UE 5.4+ but adds cost
     because Nanite must evaluate WPO per-cluster. Use sparingly.
     
⚠️  Pixel Depth Offset: Not supported with Nanite.
```

### Lumen Considerations

```
• Lumen reads surface emissive for indirect lighting — use Emissive Color
  to make materials contribute to global illumination (neon signs, lava).
  
• Very rough surfaces (Roughness > 0.8) diffuse light broadly, which
  Lumen handles well. Highly specular surfaces (Roughness < 0.1) need
  Screen Space Reflections or Planar Reflections as supplements.
  
• Translucent materials do NOT contribute to or receive Lumen GI.
  Use Masked + dithered opacity as an alternative where possible.
```

---

## C++ Integration

### Creating Dynamic Material Instances at Runtime

```cpp
#include "Materials/MaterialInstanceDynamic.h"

// WHY Dynamic Material Instance (MID): Unlike editor-created instances,
// MIDs can change parameters every frame at runtime — for damage effects,
// dissolve transitions, health-bar fills, or player color customization.
void AMyActor::BeginPlay()
{
    Super::BeginPlay();
    
    UMaterialInterface* BaseMaterial = MeshComp->GetMaterial(0);
    
    // WHY CreateDynamicMaterialInstance: This creates a unique copy
    // of the material for this specific mesh. Without it, changing a
    // parameter would affect ALL objects sharing that material.
    DynMaterial = UMaterialInstanceDynamic::Create(BaseMaterial, this);
    MeshComp->SetMaterial(0, DynMaterial);
}

void AMyActor::TakeDamage(float DamageAmount)
{
    CurrentDamage = FMath::Clamp(CurrentDamage + DamageAmount, 0.0f, 1.0f);
    
    // Set scalar parameter — drives a dissolve/damage effect in the material
    DynMaterial->SetScalarParameterValue(FName("DamageAmount"), CurrentDamage);
    
    // Set vector parameter — shift color toward red as damage increases
    FLinearColor DamageColor = FMath::Lerp(
        FLinearColor::White, 
        FLinearColor::Red, 
        CurrentDamage
    );
    DynMaterial->SetVectorParameterValue(FName("DamageTint"), DamageColor);
}
```

### Setting Material Parameters from Blueprint

```
Blueprint equivalent of C++ above:

1. Create Dynamic Material Instance node
   • Target: Mesh Component
   • Source Material: slot index 0
   • → Returns: Dynamic Material Instance reference

2. Set Scalar Parameter Value
   • Target: the dynamic instance
   • Parameter Name: "DamageAmount"
   • Value: float variable

3. Set Vector Parameter Value
   • Target: the dynamic instance  
   • Parameter Name: "DamageTint"
   • Value: LinearColor variable
```

---

## Optimization Best Practices

### 1. Minimize Shader Instruction Count

```
Console: stat material

Check instruction count in Material Editor → Stats window.

Budget guidelines:
  • Opaque environment:     < 200 instructions
  • Characters:             < 250 instructions
  • Particles/VFX:          < 100 instructions
  • Mobile:                 < 80 instructions
  
WHY instruction count matters: Every visible pixel runs your shader.
At 1080p that's ~2 million pixels per frame. A 300-instruction shader
at 60fps = 36 billion shader instructions per second. Cutting instructions
directly reduces GPU frame time.
```

### 2. Use Material Instances Everywhere

```
• Never place a UMaterial directly on a mesh in production
• Create Material Instances for every variation
• Changing instance parameters = instant, no shader recompile
• Same base material = shared shader permutation = fewer draw calls
  (Unreal can batch meshes with the same shader)

WHY: A project with 200 unique UMaterials has 200 compiled shaders
(plus permutations). A project with 5 Master Materials and 200 instances
has ~5 compiled shaders. Compilation time, memory, and draw call batching
all improve dramatically.
```

### 3. Reduce Texture Samples

```
• Pack channels: ORM (Occlusion/Roughness/Metallic) into one RGB texture
• Share textures: use tiling + UV offset to reuse textures across materials
• Use Shared Samplers: UE5 limits texture samplers to 16 per material.
  Enable "Shared: Wrap" or "Shared: Clamp" on TextureSample nodes to
  share sampler slots between textures.
  
Budget: < 8 texture samples for environment, < 12 for characters
```

### 4. LOD Material Simplification

```
• Assign simpler materials to lower LODs
• LOD 0 (close): Full detail — normal map, detail textures, parallax
• LOD 1 (mid): Drop detail textures and parallax
• LOD 2+ (far): Single texture, no normal map
  
Set per-LOD materials in: Static Mesh Editor → LOD Settings → Material Slots
```

### 5. Avoid Expensive Nodes in Common Materials

| Expensive Node | Cost | Alternative |
|---------------|------|-------------|
| `SceneDepth` / `SceneColor` | Forces forward rendering | Use only for special effects, not environment |
| `Refraction` | Extra render pass | Fake with Fresnel + environment cubemap |
| `Tessellation` | Multiplies triangle count | Use Nanite for geometric detail instead |
| `WorldPositionOffset` (with Nanite) | Per-cluster eval | Limit to hero assets, use vertex animation textures for crowds |
| `Noise` (high octaves) | Many ALU ops | Pre-bake to texture |

### 6. Shader Complexity View

```
Viewport → View Mode → Optimization Viewmodes → Shader Complexity

Color coding:
  Green  = cheap (< 50 instructions)
  Yellow = moderate (50-150)
  Red    = expensive (150-300)
  White  = very expensive (300+)
  
WHY use this view: It immediately shows which surfaces are GPU-heavy.
If your ground material is showing red, that's millions of expensive
pixels every frame — a high-priority optimization target.
```

---

## Common Material Techniques

### Dissolve Effect

```
Material Graph:
  Time → Multiply (speed) → Add (offset parameter)
    → Feed into: Noise texture R channel
    → Subtract: "DissolveAmount" scalar parameter
    → Clamp 0-1
    → Output to Opacity Mask (set blend mode to Masked)
    
  For glowing edges:
    → Same noise output → Step (narrow band near dissolve edge)
    → Multiply by emissive color
    → Output to Emissive Color
```

### Triplanar Mapping (No UV Seams)

```
Material Graph:
  AbsWorldPosition → Divide by tiling scale → feed into 3 TextureSamples:
    • XY projection (top/bottom)
    • XZ projection (front/back)  
    • YZ projection (left/right)
  VertexNormalWS → Abs → Power (blend sharpness) → Normalize
    → Use as blend weights between the 3 projections

WHY triplanar: Procedurally placed meshes (rocks, terrain) often have
stretched or misaligned UVs. Triplanar projects textures from world space,
eliminating UV seams. The cost is 3× texture samples — acceptable for
environment surfaces, too expensive for characters.
```

### Distance-Based Detail Fade

```
Material Graph:
  CameraPosition - WorldPosition → Length → divide by fade distance
    → Clamp 0-1 → use as Lerp alpha
  Lerp(DetailNormal, FlatNormal, FadeAlpha)
    → Output to Normal
    
WHY: Detail normals on a surface 50 meters away waste GPU cycles on
sub-pixel detail the player can't see. Fading them out based on camera
distance saves shader cost with no visible quality loss.
```
