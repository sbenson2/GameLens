# G51 — Landscape & Terrain System

> **Category:** guide · **Engine:** Unreal Engine 5.5+ · **Related:** [G12 World Partition & Streaming](G12_world_partition_streaming.md) · [G16 PCG Framework](G16_pcg_framework.md) · [G52 Water System & Buoyancy](G52_water_system_buoyancy.md)

The **Landscape** system is Unreal Engine's primary terrain solution, designed for large outdoor environments. It uses a heightfield representation with component-based LOD, paint layers for material blending, and full integration with World Partition for open-world streaming. UE 5.5+ introduces **Edit Layers** as a production-ready feature, enabling non-destructive, stackable terrain modifications.

---

## Architecture Overview

```
ALandscapeProxy (base — can be streamed)
└── ALandscape (root actor — owns shared data)
    ├── ULandscapeComponent[]       — Grid of renderable sections
    │   └── ULandscapeHeightfieldCollisionComponent
    ├── ULandscapeInfo               — Runtime registry (shared across proxies)
    ├── ULandscapeSplinesComponent   — Spline-based road/path tools
    └── ULandscapeEditLayerBase[]    — Non-destructive edit layers (UE 5.5+)
```

### Key Classes

| Class | Role |
|---|---|
| `ALandscape` | Root actor — holds shared state, edit layers, material assignments |
| `ALandscapeProxy` | Base class — `ALandscapeStreamingProxy` is used per World Partition cell |
| `ULandscapeComponent` | A single section of the heightfield grid (renders, has LOD) |
| `ULandscapeInfo` | Runtime singleton per landscape — indexes components, layers, proxies |
| `ULandscapeLayerInfoObject` | Defines a paint layer (name, physical material, weight blend) |
| `ULandscapeMaterialInstanceConstant` | Specialized MIC for landscape material weight blending |

---

## Creating a Landscape

### Editor Workflow

1. **Modes Panel → Landscape Mode** → New Landscape tab.
2. Configure section size (63×63 or 127×127 quads), number of sections, and components.
3. Assign a **Landscape Material** — a material with multiple layers blended by `LandscapeLayerBlend` or `LandscapeLayerCoords` nodes.
4. Click **Create**.

### Sizing Guidelines

| Target | Overall Size | Section Size | Component Size | Quads per Component |
|---|---|---|---|---|
| Small arena | 1009×1009 | 63×63 | 1×1 sections | 63×63 |
| Open world zone | 4033×4033 | 63×63 | 2×2 sections | 126×126 |
| Large open world | 8129×8129 | 127×127 | 2×2 sections | 254×254 |

> **Rule of thumb**: Each component is the unit of LOD, culling, and streaming. Fewer, larger components = fewer draw calls but coarser LOD transitions. More, smaller components = finer culling but higher overhead. Target 1024–4096 total components for a production landscape.

---

## Landscape Materials

Landscape materials use **layer blending** to paint multiple surface types (grass, rock, dirt, snow) onto the terrain.

### Material Setup

```
// In the Material Editor:
//
// 1. Create a LandscapeLayerBlend node
//    - Add layers: "Grass", "Rock", "Dirt", "Snow"
//    - Set blend type to "Weight Blend" (most common) or "Alpha Blend"
//
// 2. For each layer, connect:
//    - Base Color texture (with LandscapeLayerCoords for tiling)
//    - Normal map
//    - Roughness / packed ORM texture
//
// 3. Wire the blended outputs to the Material output node.
```

### Physical Materials per Layer

Each `ULandscapeLayerInfoObject` can reference a **Physical Material**, enabling per-surface footstep sounds, particle effects, and friction:

```cpp
// WHY: Physical materials on landscape layers drive gameplay systems like
// footstep audio and tire friction without per-vertex collision queries.
ULandscapeLayerInfoObject* GrassLayer = NewObject<ULandscapeLayerInfoObject>();
GrassLayer->LayerName = FName("Grass");
GrassLayer->PhysMaterial = GrassPhysicalMaterial;  // UPhysicalMaterial*
```

---

## Edit Layers (UE 5.5+ — Production Ready)

Edit Layers enable **non-destructive, stackable** landscape modifications. Each layer contains its own heightmap and weight map deltas, composited at runtime.

### Use Cases

- **Base terrain** layer — the sculpted world shape.
- **Road** layer — flattens terrain under roads (via Landscape Splines).
- **Procedural** layer — PCG-driven modifications (e.g., erosion, river carving).
- **Runtime** layer — gameplay-driven terrain deformation (experimental).

### Enabling Edit Layers

```
Project Settings → Engine → Landscape → Enable Edit Layers = true
```

### C++ API

```cpp
// WHY: ULandscapeEditLayerBase is the base class for custom edit layers.
// Override virtual methods to control how the layer interacts with tools.
UCLASS()
class MYGAME_API UMyProceduralLandscapeLayer : public ULandscapeEditLayerBase
{
    GENERATED_BODY()

public:
    // Control which tools work on this layer
    virtual bool SupportsHeightSculpting() const override { return true; }
    virtual bool SupportsWeightPainting() const override { return false; }

    // Display name in the Landscape mode UI
    virtual FText GetLayerDisplayName() const override
    {
        return NSLOCTEXT("Landscape", "ProceduralLayer", "Procedural Erosion");
    }
};
```

---

## Landscape Splines

Landscape Splines create roads, rivers, and paths that **automatically flatten and paint the terrain** beneath them.

### Components

| Component | Role |
|---|---|
| `ULandscapeSplinesComponent` | Container for all splines on the landscape |
| `ULandscapeSplineControlPoint` | A control point with position, rotation, width |
| `ULandscapeSplineSegment` | Connects two control points — defines mesh and deformation |

### Workflow

1. **Landscape Mode → Splines tool** → Ctrl+Click to place control points.
2. Each segment can have a **static mesh** assigned (road mesh, guardrail).
3. The spline automatically modifies the landscape heightmap and paint layer beneath it — typically flattening and painting a "Road" layer.
4. With Edit Layers enabled, spline modifications go to a dedicated layer that can be toggled independently.

---

## Grass and Foliage on Landscape

The **Landscape Grass Type** system procedurally scatters foliage based on painted weight layers.

```cpp
// WHY: ULandscapeGrassType defines what meshes to scatter per landscape layer.
// This is more performant than placing individual foliage instances by hand.
UPROPERTY(EditDefaultsOnly, Category = "Landscape")
ULandscapeGrassType* GrassType;

// In the editor, configure ULandscapeGrassType:
// - Add Grass Varieties (static meshes)
// - Set density, scale range, random rotation, alignment to surface
// - Assign to the Grass layer in your Landscape Material
```

For higher-fidelity foliage, combine with the **PCG Framework** (see G16) to scatter Nanite-enabled foliage meshes procedurally.

---

## World Partition Integration

When World Partition is enabled, the landscape is automatically split into **Landscape Streaming Proxies** — one per World Partition cell. This means:

- Each cell has its own `ALandscapeStreamingProxy` actor.
- Components within unloaded cells are not in memory.
- The root `ALandscape` actor is always loaded (it holds shared data like material assignments and edit layers).
- Landscape LOD streaming works independently of World Partition cell streaming for distant terrain visibility.

### Landscape LOD Settings

```
// In Landscape actor details:
// - LOD Group: controls which LOD streaming distance group the landscape uses
// - LOD Falloff: "Linear" for smooth transitions, "Square Root" for more aggressive
// - Streaming Distance Multiplier: scale factor for when LODs transition
//
// WHY: Aggressive LOD + World Partition streaming is essential for open-world
// performance. Distant terrain at LOD 6+ uses tiny fractions of the memory.
```

---

## Runtime Landscape Queries

### Height Queries

```cpp
// WHY: Height queries are essential for placing actors on terrain,
// ground-clamping projectiles, and foot IK.
FVector Location(1000.0f, 2000.0f, 0.0f);
float Height = 0.0f;

if (ALandscape* Landscape = GetLandscapeActor())
{
    // Option 1: Line trace (most reliable, works with collision)
    FHitResult Hit;
    FVector Start = FVector(Location.X, Location.Y, 100000.0f);
    FVector End = FVector(Location.X, Location.Y, -100000.0f);

    if (GetWorld()->LineTraceSingleByChannel(Hit, Start, End, ECC_WorldStatic))
    {
        Height = Hit.ImpactPoint.Z;
    }
}
```

### Layer Weight Queries

```cpp
// WHY: Querying which paint layer is dominant at a world position
// drives gameplay — e.g., footstep sounds, movement speed modifiers.
#include "LandscapeProxy.h"

TArray<FLandscapeLayerWeight> LayerWeights;
ALandscapeProxy* LandscapeProxy = /* trace to find */;
if (LandscapeProxy)
{
    // GetComponentAtPosition returns the landscape component under a point.
    // Layer weights can then be sampled from the component's weight data.
    ULandscapeComponent* Comp = LandscapeProxy->GetLandscapeInfo()
        ->GetComponentAtPosition(WorldLocation);
    // Use the component to sample layer weights for audio/VFX decisions.
}
```

---

## Performance Considerations

1. **Component count** — each `ULandscapeComponent` has overhead for LOD, collision, and streaming. Stay under 4096 for most projects.
2. **Material complexity** — landscape materials render for every visible component. Limit layer count to 4–6 per component to avoid texture sample overhead.
3. **Virtual Texturing** — enable **Runtime Virtual Texturing (RVT)** for landscapes with many layers. RVT composites layers into a virtual texture, reducing per-component shader complexity.
4. **Nanite** — as of UE 5.7, landscape geometry does **not** use Nanite. Landscape has its own LOD system. Nanite is used for foliage and props placed on the landscape.
5. **Collision** — `ULandscapeHeightfieldCollisionComponent` uses a simplified heightfield for physics. For gameplay-critical collision, ensure collision mip level is set correctly (0 = full resolution, higher = simplified).

---

## Common Pitfalls

1. **Mismatched component/section sizes** — changing these after creation requires re-importing the heightmap. Plan sizing upfront.
2. **Too many paint layers per component** — exceeding the hardware texture sample limit (usually 12–16) causes material compilation errors. Split materials or use RVT.
3. **Ignoring World Partition** — without WP, loading a massive landscape loads all components. Always use World Partition for open-world terrains.
4. **Forgetting physical materials on layers** — without per-layer physical materials, all terrain surfaces feel identical to gameplay systems.
5. **Edit Layer ordering** — layers composite top-down; placing a road layer below a sculpt layer may produce unexpected results when both modify the same region.
6. **Runtime landscape modification** — editing landscape heightmaps at runtime is technically possible but expensive and not production-supported for gameplay. Use mesh deformation or decals for crater/destruction effects instead.
