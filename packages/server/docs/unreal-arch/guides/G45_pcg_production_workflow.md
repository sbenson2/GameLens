# PCG Production Workflow & Custom Nodes

> **Category:** guide · **Engine:** Unreal Engine 5.6+ (Production-ready 5.7) · **Related:** [G16 PCG Framework](G16_pcg_framework.md), [G12 World Partition & Streaming](G12_world_partition_streaming.md), [G15 Blueprint/C++ Workflow](G15_blueprint_cpp_workflow.md)

The Procedural Content Generation (PCG) framework reached **production-ready** status in UE 5.7 after graduating from beta in 5.6. This guide covers the production-grade features added since the original framework: the PCG Editor Mode, custom node authoring in Blueprint and C++, the Procedural Vegetation Editor (PVE), new data types, and patterns for shipping PCG-driven worlds. For core PCG graph concepts and built-in nodes, see [G16 PCG Framework](G16_pcg_framework.md).

---

## What Changed in 5.6 and 5.7

### UE 5.6 — Beta Exit

- **API stabilization** — node names and pin interfaces locked down. Several experimental nodes were renamed or removed; the 5.6 API is the stable foundation.
- **Subgraph improvements** — `UPCGSubgraphSettings` allows reusable graph fragments with exposed parameters.
- **Performance** — graph execution caching and partition-aware generation reduce iteration time.

### UE 5.7 — Production-Ready

- **PCG Editor Mode** — a new editor mode with a library of drawing/painting/volume tools, each backed by a PCG graph.
- **Polygon2D data type** — defines closed 2D areas that can be converted to surfaces or splines. New operators: `Polygon2D From Spline`, `Surface From Polygon2D`.
- **Spline operators** — `Spline Intersection`, `Split Splines`, `Resample Spline` for road/river networks.
- **Procedural Vegetation Editor (PVE)** — graph-based tool for authoring vegetation assets inside UE, outputting Nanite skeletal assemblies. (Experimental in 5.7.)
- **PCG Graph debugging** — per-node execution time, data count overlays, and breakpoint support.

---

## PCG Editor Mode

The PCG Editor Mode provides interactive tools for artists to drive PCG graphs without touching the graph editor:

### Built-in Tool Types

| Tool | Description |
|------|-------------|
| **Draw Spline** | Click to place control points; the linked PCG graph generates content along the spline |
| **Paint Points** | Brush-paint point data onto landscape; density, scale, and rotation driven by brush settings |
| **Create Volume** | Draw a box/sphere/convex volume; PCG graph fills the volume with content |

### Creating Custom Tools

Each PCG Editor Mode tool is a PCG graph with special input nodes. To create your own:

1. Create a new PCG graph asset.
2. Add a `PCG Editor Mode Input` node — this receives the tool's geometry (spline, points, or volume) as PCG data.
3. Build your generation logic downstream.
4. The graph appears in the PCG Editor Mode tool palette automatically.

Tools support **real-time parameter control** — exposed graph parameters appear in the tool's details panel, and changes regenerate the output immediately.

---

## Custom Node Authoring

### Blueprint Custom Nodes

The fastest way to extend PCG without C++. Subclass `UPCGBlueprintElement`:

1. **Create a Blueprint** — right-click in Content Browser → Blueprint Class → search `PCGBlueprintElement`.
2. **Configure pins** — override `InputPinProperties` and `OutputPinProperties` to define your node's input/output data types.
3. **Override `ExecuteWithContext`** — this is where your node logic runs.

**Example — Random Scale Jitter Node (Blueprint):**

```
// In your PCGBlueprintElement subclass:

// 1. Override InputPinProperties
//    Add pin: "Points" (PCG Point Data)

// 2. Override OutputPinProperties
//    Add pin: "Points" (PCG Point Data)

// 3. Override ExecuteWithContext
//    For each point in input:
//      - Generate random scale offset within [MinJitter, MaxJitter]
//      - Apply to point Transform.Scale3D
//      - Add to output
```

**Exposed parameters:** Add `UPROPERTY(EditAnywhere)` variables to your Blueprint and they appear as editable fields on the node in the PCG graph editor.

### C++ Custom Nodes

For performance-critical operations, create C++ nodes by subclassing `UPCGSettings` and `FPCGElementBase`:

```cpp
// MyPCGDensityFilter.h
#pragma once

#include "PCGSettings.h"
#include "MyPCGDensityFilter.generated.h"

UCLASS(BlueprintType)
class UMyPCGDensityFilterSettings : public UPCGSettings
{
    GENERATED_BODY()

public:
    // Node display name in the graph editor
    //~Begin UPCGSettings interface
    virtual FName GetDefaultNodeTitle() const override
    {
        return FName(TEXT("Density Filter"));
    }

#if WITH_EDITOR
    virtual FName GetCategory() const override
    {
        return FName(TEXT("Custom|Filters"));
    }
#endif

    // Define input/output pins
    virtual TArray<FPCGPinProperties> InputPinProperties() const override;
    virtual TArray<FPCGPinProperties> OutputPinProperties() const override;

protected:
    virtual FPCGElementPtr CreateElement() const override;
    //~End UPCGSettings interface

public:
    // Exposed parameters
    UPROPERTY(BlueprintReadWrite, EditAnywhere, Category = "Settings",
              meta = (ClampMin = "0.0", ClampMax = "1.0"))
    float MinDensity = 0.0f;

    UPROPERTY(BlueprintReadWrite, EditAnywhere, Category = "Settings",
              meta = (ClampMin = "0.0", ClampMax = "1.0"))
    float MaxDensity = 1.0f;
};

// MyPCGDensityFilter.cpp
#include "MyPCGDensityFilter.h"
#include "Data/PCGPointData.h"

// The execution element that does the actual work
class FMyPCGDensityFilterElement : public FSimplePCGElement
{
protected:
    virtual bool ExecuteInternal(FPCGContext* Context) const override;
};

TArray<FPCGPinProperties> UMyPCGDensityFilterSettings::InputPinProperties() const
{
    TArray<FPCGPinProperties> Pins;
    Pins.Emplace(PCGPinConstants::DefaultInputLabel,
                 EPCGDataType::Point);
    return Pins;
}

TArray<FPCGPinProperties> UMyPCGDensityFilterSettings::OutputPinProperties() const
{
    TArray<FPCGPinProperties> Pins;
    Pins.Emplace(PCGPinConstants::DefaultOutputLabel,
                 EPCGDataType::Point);
    // Second output for rejected points
    Pins.Emplace(FName(TEXT("Rejected")),
                 EPCGDataType::Point);
    return Pins;
}

FPCGElementPtr UMyPCGDensityFilterSettings::CreateElement() const
{
    return MakeShared<FMyPCGDensityFilterElement>();
}

bool FMyPCGDensityFilterElement::ExecuteInternal(
    FPCGContext* Context) const
{
    const UMyPCGDensityFilterSettings* Settings =
        Context->GetInputSettings<UMyPCGDensityFilterSettings>();
    check(Settings);

    // Get input data from the default input pin
    TArray<FPCGTaggedData> Inputs = Context->InputData.GetInputs();

    for (const FPCGTaggedData& Input : Inputs)
    {
        const UPCGPointData* PointData =
            Cast<UPCGPointData>(Input.Data);
        if (!PointData) continue;

        // Create output data for accepted and rejected points
        UPCGPointData* AcceptedData = NewObject<UPCGPointData>();
        AcceptedData->InitializeFromData(PointData);
        UPCGPointData* RejectedData = NewObject<UPCGPointData>();
        RejectedData->InitializeFromData(PointData);

        const TArray<FPCGPoint>& Points = PointData->GetPoints();

        for (const FPCGPoint& Point : Points)
        {
            if (Point.Density >= Settings->MinDensity &&
                Point.Density <= Settings->MaxDensity)
            {
                AcceptedData->GetMutablePoints().Add(Point);
            }
            else
            {
                RejectedData->GetMutablePoints().Add(Point);
            }
        }

        // Route to the correct output pin
        FPCGTaggedData& AcceptedOutput = Context->OutputData.TaggedData.Emplace_GetRef();
        AcceptedOutput.Data = AcceptedData;
        AcceptedOutput.Pin = PCGPinConstants::DefaultOutputLabel;

        FPCGTaggedData& RejectedOutput = Context->OutputData.TaggedData.Emplace_GetRef();
        RejectedOutput.Data = RejectedData;
        RejectedOutput.Pin = FName(TEXT("Rejected"));
    }

    return true;
}
```

**Important:** The PCG API changed significantly between versions. The pattern above targets UE 5.6+. For 5.5 and earlier, some node base classes and pin configuration methods differ.

---

## Procedural Vegetation Editor (PVE)

The PVE (Experimental in UE 5.7) is a graph-based framework built on PCG for authoring high-quality vegetation assets entirely inside the editor.

### What PVE Does

- **Graph-based vegetation authoring** — define trunk, branch, leaf, and fruit placement rules as a graph.
- **Nanite skeletal assembly output** — PVE outputs vegetation as Nanite-compatible skeletal mesh assemblies for high-performance rendering.
- **Wind and LOD** — built-in wind simulation parameters and automatic LOD generation.
- **Biome-scale placement** — PVE graphs can feed into PCG landscape scattering for consistent forest generation.

### Workflow

1. Open the **Procedural Vegetation Editor** from the Tools menu.
2. Create a new vegetation graph.
3. Define **trunk geometry** (spline-based, with radius curve).
4. Add **branch rules** (angle, density, recursion depth).
5. Add **leaf and detail** nodes (mesh instancing, billboard LODs).
6. Preview in the viewport; adjust parameters interactively.
7. Export as a `StaticMesh` or `SkeletalMesh` Nanite assembly.

---

## Production Patterns

### Pattern 1 — Landscape Biome System

Use PCG to create a biome-driven world where landscape layers determine what gets placed:

```
Landscape Layer Data
    │
    ▼
[Get Landscape Data] ──▶ [Density Filter per biome]
    │                         │
    ▼                         ▼
[Forest Graph]          [Desert Graph]
    │                         │
    ▼                         ▼
Trees, undergrowth      Rocks, cacti, sand details
```

**Key nodes:**
- `Get Landscape Data` — samples landscape layer weights at point positions.
- `Density Filter` — route points to biome-specific subgraphs based on layer weight thresholds.
- `Subgraph` — encapsulate biome logic as reusable `UPCGSubgraphSettings` assets.

### Pattern 2 — Road / River Networks with Spline Operators

```
[Spline Input (road centerline)]
    │
    ├──▶ [Split Splines at intersections]
    │
    ├──▶ [Spline Intersection] ──▶ intersection geometry
    │
    └──▶ [Surface From Spline (road surface)]
              │
              ▼
         [Scatter: guardrails, signs, lane markings]
```

### Pattern 3 — Runtime PCG Generation

PCG graphs can execute at runtime for roguelike level generation or dynamic environments:

```cpp
// Trigger PCG generation at runtime
UPCGComponent* PCGComp = MyActor->FindComponentByClass<UPCGComponent>();
if (PCGComp)
{
    // Set a seed for deterministic generation
    PCGComp->Seed = MyLevelSeed;

    // Trigger generation
    PCGComp->Generate(/*bForce=*/ true);
}
```

**Runtime considerations:**
- Keep graph complexity low — avoid expensive landscape queries at runtime.
- Use `EPCGGenerationTrigger::GenerateOnDemand` to control when generation happens.
- Profile with `stat PCG` console command.

---

## Performance Best Practices

### Graph Execution

- **Partition actors** — enable `Use Partitioned Components` on PCG components to distribute generation across World Partition cells. Only visible cells generate.
- **Execution caching** — PCG caches graph results. Avoid invalidating caches unnecessarily by keeping dynamic inputs stable.
- **Hierarchical generation** — use coarse-to-fine graphs: first pass places major landmarks, second pass fills details within bounds.

### Data Volume

- **Point count limits** — monitor point counts with the PCG graph debugger. Millions of points can stall generation.
- **Distance-based LOD** — use `Filter by Distance` nodes to reduce detail density far from the camera.
- **HLOD integration** — PCG-generated actors automatically participate in the Hierarchical LOD system when World Partition is enabled.

### Profiling

| Console Command | Description |
|----------------|-------------|
| `stat PCG` | PCG graph execution stats |
| `pcg.ShowDebug 1` | Overlay PCG debug visualization |
| `pcg.LogVerbose 1` | Detailed PCG execution log |

---

## Migration Notes

If upgrading a project from UE 5.4 or 5.5 PCG graphs to 5.6+:

- **Renamed nodes** — several experimental node names changed in 5.6. The editor will show warnings for deprecated nodes; follow the suggested replacements.
- **Pin type changes** — some nodes that accepted `Any` data now require specific types (`Point`, `Spline`, `Polygon2D`). Add explicit type conversion nodes if needed.
- **Subgraph API** — `UPCGSubgraphSettings` replaced the older subgraph embedding method. Migrate embedded subgraphs to asset-based references.
- **Blueprint node base class** — `UPCGBlueprintElement::ExecuteWithContext` signature is stable from 5.6 forward. Earlier versions used `Execute` without context.

---

## Plugin Requirements

| Plugin | Required For |
|--------|-------------|
| `PCG` | Core PCG framework (enabled by default in 5.6+) |
| `PCGGeometryScriptInterop` | Geometry Script integration with PCG |
| `ProceduralVegetation` | Procedural Vegetation Editor (Experimental) |

---

## Version History

| Version | Status | Key Changes |
|---------|--------|-------------|
| UE 5.2 | Experimental | Initial PCG framework |
| UE 5.4 | Beta | Custom Blueprint nodes, landscape integration |
| UE 5.5 | Beta | API iteration, improved graph editor |
| UE 5.6 | Production-ready | Stable API, subgraph improvements, node renames |
| UE 5.7 | Production-ready | PCG Editor Mode, Polygon2D, PVE (Experimental), spline operators |
