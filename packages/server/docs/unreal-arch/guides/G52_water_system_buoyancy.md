# G52 — Water System & Buoyancy

> **Category:** guide · **Engine:** Unreal Engine 5.5+ · **Related:** [G51 Landscape & Terrain](G51_landscape_terrain.md) · [G6 Physics & Collision](G6_physics_and_collision.md) · [G16 PCG Framework](G16_pcg_framework.md)

The **Water** plugin is Unreal Engine's built-in system for creating oceans, lakes, rivers, and custom water bodies with physically-based rendering, spline-driven flow, automatic landscape interaction, and a Buoyancy Component for floating objects. It is a plugin that ships with the engine (enabled by default since UE 5.0) and is production-ready in UE 5.5+.

---

## Architecture Overview

```
Water Plugin (Plugin — enabled by default)
├── AWaterBody (abstract base)
│   ├── AWaterBodyOcean      — Infinite-extent ocean plane
│   ├── AWaterBodyLake       — Closed spline-defined lake
│   ├── AWaterBodyRiver      — Open spline-defined flowing river
│   └── AWaterBodyCustom     — Custom-shaped water volume
├── AWaterZone               — Rendering region (tiles water mesh)
├── UWaterSubsystem          — Runtime subsystem (queries, wave state)
├── UBuoyancyComponent       — Simulates floating on water surfaces
└── UWaterBodyComponent      — Per-body rendering, physics, wave config
```

### Key Classes

| Class | Role |
|---|---|
| `AWaterBody` | Base actor for all water body types |
| `AWaterBodyOcean` | Infinite ocean with Gerstner wave simulation |
| `AWaterBodyLake` | Closed-spline lake with optional waves |
| `AWaterBodyRiver` | Open-spline river with flow velocity |
| `AWaterZone` | Manages water mesh rendering tiles for a region |
| `UWaterSubsystem` | World subsystem — query water height, flow, overlap |
| `UBuoyancyComponent` | Component for physics-driven buoyancy on water |
| `UWaterSplineComponent` | Spline that defines water body shape |
| `AWaterBodyExclusionVolume` | Carves holes in water bodies (e.g., dry caves under water) |

---

## Enabling the Water Plugin

The Water plugin is enabled by default in UE 5.x projects. Verify:

1. **Edit → Plugins** → search "Water" → ensure **Water** is enabled.
2. The plugin adds the `Water` module to your project automatically.
3. For C++ access, add the module dependency:

```csharp
// Build.cs
PublicDependencyModuleNames.Add("Water");
```

---

## Water Body Types

### Ocean

`AWaterBodyOcean` creates an infinite water plane extending to the horizon. It uses **Gerstner waves** for surface displacement.

```cpp
// WHY: Oceans are placed as actors, not landscape paint.
// The ocean extends infinitely — only one per level is typical.
AWaterBodyOcean* Ocean = GetWorld()->SpawnActor<AWaterBodyOcean>(
    AWaterBodyOcean::StaticClass(), FTransform::Identity);

// Configure waves via the WaterBodyComponent
UWaterBodyComponent* WaterComp = Ocean->GetWaterBodyComponent();
// Wave settings are exposed as editable properties in the Details panel.
// In C++, modify the WaterWaves asset referenced by the component.
```

**Gerstner Wave Parameters:**

| Parameter | Description |
|---|---|
| `WaveAmplitude` | Height of waves (world units) |
| `WaveLength` | Distance between wave peaks |
| `Steepness` | How sharp wave peaks are (0 = sine, 1 = max Gerstner) |
| `Direction` | Wind direction driving the wave |
| `Speed` | Wave propagation speed |

Multiple wave layers can be stacked for natural-looking ocean surfaces.

### Lake

`AWaterBodyLake` uses a **closed spline** to define the lake boundary. The water surface fills the spline interior.

- Supports wave simulation (typically calmer than ocean).
- Automatically modifies the landscape heightmap underneath to create a basin (requires Landscape Edit Layers or the Landmass plugin).
- Spline points control the shoreline shape.

### River

`AWaterBodyRiver` uses an **open spline** to define the river path. Each spline point has a width and depth value.

- Supports **flow velocity** — objects in the river experience a directional force.
- Automatically carves into the landscape along the spline path.
- River segments can vary in width, depth, and flow speed per control point.

```cpp
// WHY: River flow velocity is useful for gameplay — pushing the player,
// moving debris, or driving boat physics.
AWaterBodyRiver* River = /* spawned or placed in editor */;
UWaterSplineComponent* Spline = River->GetWaterSpline();

// Query flow at a world position:
FVector FlowVelocity;
float WaterDepth;
UWaterSubsystem* WaterSub = GetWorld()->GetSubsystem<UWaterSubsystem>();
// Use the subsystem for runtime water queries (see below).
```

---

## Water Queries at Runtime

`UWaterSubsystem` provides runtime queries for water height, flow, and overlap detection.

### Querying Water Height

```cpp
#include "WaterSubsystem.h"

// WHY: Water height queries are essential for placing floating actors,
// splash VFX positioning, and camera underwater detection.
UWaterSubsystem* WaterSub = GetWorld()->GetSubsystem<UWaterSubsystem>();
if (WaterSub)
{
    FWaterBodyQueryResult QueryResult;
    // GetWaterInfoAtLocation returns the water surface height, depth,
    // normal, flow velocity, and which water body the point is in.
    bool bInWater = WaterSub->QueryWaterInfoClosestToWorldLocation(
        WorldLocation,
        ECollisionChannel::ECC_WorldStatic,
        QueryResult
    );

    if (bInWater)
    {
        float SurfaceHeight = QueryResult.GetWaterSurfaceLocation().Z;
        FVector FlowVelocity = QueryResult.GetVelocity();
        float ImmersionDepth = QueryResult.GetImmersionDepth();
    }
}
```

### Checking if a Point Is Underwater

```cpp
// WHY: Underwater detection drives camera post-process, audio reverb,
// and gameplay state (swimming vs. walking).
bool bUnderwater = false;
FWaterBodyQueryResult Result;
if (WaterSub->QueryWaterInfoClosestToWorldLocation(ActorLocation,
    ECC_WorldStatic, Result))
{
    bUnderwater = ActorLocation.Z < Result.GetWaterSurfaceLocation().Z;
}
```

---

## Buoyancy Component

`UBuoyancyComponent` adds physically-driven floating behavior to any actor with a physics-simulated root component.

### Setup

```cpp
#include "BuoyancyComponent.h"

// WHY: UBuoyancyComponent reads the water surface from the Water plugin
// and applies upward forces to keep the actor floating. No manual
// force calculations needed.
UCLASS()
class MYGAME_API AFloatingCrate : public AActor
{
    GENERATED_BODY()

public:
    AFloatingCrate()
    {
        // Mesh with physics simulation enabled
        MeshComp = CreateDefaultSubobject<UStaticMeshComponent>(TEXT("Mesh"));
        MeshComp->SetSimulatePhysics(true);
        SetRootComponent(MeshComp);

        // Buoyancy component — automatically detects water bodies
        BuoyancyComp = CreateDefaultSubobject<UBuoyancyComponent>(TEXT("Buoyancy"));
    }

    UPROPERTY(VisibleAnywhere)
    UStaticMeshComponent* MeshComp;

    UPROPERTY(VisibleAnywhere)
    UBuoyancyComponent* BuoyancyComp;
};
```

### Buoyancy Parameters

| Parameter | Description | Typical Value |
|---|---|---|
| `BuoyancyCoefficient` | Overall buoyancy strength | 1.0 (neutral — matches water density) |
| `Pontoons` | Array of sample points on the mesh | 4–8 for boats, 1 for simple objects |
| `DragCoefficient` | Linear drag in water | 0.5–2.0 |
| `DragCoefficient2` | Quadratic drag (dominates at high speed) | 0.5–1.0 |
| `MaxBuoyantForce` | Clamp on maximum upward force | Depends on actor mass |
| `WaterShorePushFactor` | Force pushing away from shallow shore | 0.0–1.0 |

### Pontoon Configuration

Pontoons are the sample points where the buoyancy system checks water depth. For boats and rafts, distribute pontoons across the hull:

```cpp
// WHY: Multiple pontoons create realistic tilt and roll behavior.
// A single pontoon just bobs up and down — multiple ones react to wave shape.
BuoyancyComp->Pontoons.SetNum(4);
BuoyancyComp->Pontoons[0].RelativeLocation = FVector(200, -100, -50);  // Bow port
BuoyancyComp->Pontoons[1].RelativeLocation = FVector(200, 100, -50);   // Bow starboard
BuoyancyComp->Pontoons[2].RelativeLocation = FVector(-200, -100, -50); // Stern port
BuoyancyComp->Pontoons[3].RelativeLocation = FVector(-200, 100, -50);  // Stern starboard
```

---

## Landscape Integration

Water bodies automatically modify the landscape when using the **Landmass plugin** or **Landscape Edit Layers**:

- **Oceans** push the landscape below sea level around the coastline.
- **Lakes** carve a basin into the terrain.
- **Rivers** carve a channel along the spline path.

### Enabling Automatic Landscape Modification

1. Enable the **Landmass** plugin (Edit → Plugins → Landmass).
2. Enable **Landscape Edit Layers** in Project Settings.
3. Place water bodies — they automatically create an edit layer that modifies the heightmap and paint layers.

### Exclusion Volumes

`AWaterBodyExclusionVolume` carves holes in water bodies. Use cases:

- Dry caves beneath a lake or ocean.
- Bridge underpasses where water should not render.
- Gameplay areas that should remain dry.

```cpp
// Place an exclusion volume actor in the level.
// It uses a brush volume to define the dry region.
// Any water body overlapping the volume will not render inside it.
```

---

## Water Rendering

### Water Mesh System

The `AWaterZone` actor manages a tiled mesh grid that renders the water surface. Key rendering features:

- **Gerstner wave displacement** — GPU vertex shader displaces the water mesh per-frame.
- **Screen-space reflections (SSR)** and **Lumen reflections** for water surface reflections.
- **Caustics** — projective texture caustics on surfaces beneath the water.
- **Underwater post-process** — fog, color grading, and distortion when the camera is submerged.
- **Refraction** — distorted view of objects beneath the surface.

### Material Customization

Each water body type has a **Water Material** that controls visual appearance. Override the default material for custom looks:

```cpp
// WHY: Custom water materials let you create stylized water (toon, pixel art)
// or specialized effects (toxic swamp, lava, magical liquids).
UWaterBodyComponent* WaterComp = WaterBody->GetWaterBodyComponent();
WaterComp->SetWaterMaterial(CustomWaterMaterial);  // UMaterialInterface*
```

### Post-Process for Underwater

The Water plugin includes a **Water Body Post-Process Volume** that activates when the camera is submerged. Configure:

- Underwater fog color and density.
- Depth-based color absorption.
- Distortion/refraction intensity.
- Particle effects (bubbles).

---

## Networking Considerations

Water bodies are **static level actors** — they don't replicate. For multiplayer games:

- Water surface state (waves) is deterministic from shared parameters, so all clients render the same waves.
- `UBuoyancyComponent` runs on the **server** (with physics authority) and replicates the resulting actor transform to clients.
- Water queries (`UWaterSubsystem`) run locally on each machine — results are deterministic given the same water body configuration.

---

## Performance Considerations

1. **Water mesh density** — `AWaterZone` tile density affects GPU vertex cost. Reduce for mobile/lower-spec targets.
2. **Wave complexity** — more Gerstner wave layers = higher vertex shader cost. 3–4 layers is typical; 8+ is expensive.
3. **Reflection method** — Lumen reflections on water are high quality but expensive. SSR is cheaper. Planar reflections are most expensive and rarely needed.
4. **Buoyancy pontoon count** — each pontoon does a water query per physics tick. Keep under 8 per actor, especially with many floating objects.
5. **Exclusion volumes** — each exclusion volume adds overdraw cost. Use sparingly.

---

## Common Pitfalls

1. **Missing Water Zone** — water bodies require an `AWaterZone` in the level to render. Without it, the water is invisible. Place one in each World Partition cell that contains water.
2. **No Landmass plugin** — without Landmass or Edit Layers, water bodies sit on top of the landscape without carving into it, creating visible z-fighting at the shoreline.
3. **Buoyancy without physics** — `UBuoyancyComponent` requires `SetSimulatePhysics(true)` on the root component. Without physics simulation, buoyancy forces have no effect.
4. **River flow direction** — river splines define flow from the first control point to the last. Reversing the spline reverses the flow. This is not always obvious in the editor.
5. **Underwater post-process not activating** — ensure the water body's `UnderwaterPostProcessMaterial` is assigned and the camera actor has the correct collision channel to detect water overlap.
6. **Ocean + World Partition** — the ocean actor should be in the persistent level (always loaded), not in a streaming cell. Otherwise it disappears when the player is far from the ocean actor's original cell.
