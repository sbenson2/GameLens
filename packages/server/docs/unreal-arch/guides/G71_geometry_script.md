# G71 — Geometry Script & Procedural Mesh Generation

> **Category:** guide · **Engine:** Unreal Engine 5.0+ (Beta), improved through 5.7 · **Related:** [G16 PCG Framework](G16_pcg_framework.md), [G45 PCG Production Workflow](G45_pcg_production_workflow.md), [G9 Rendering Nanite Lumen](G9_rendering_nanite_lumen.md)

Geometry Script is an Unreal Engine plugin providing 150+ Blueprint-exposed functions for procedural mesh generation, editing, and analysis. Built on the `FDynamicMesh3` C++ geometry kernel, it enables both in-editor tool creation and runtime procedural content — from voxel terrain to procedural architecture. This guide covers the plugin architecture, Blueprint and C++ workflows, key API categories, runtime considerations, and production best practices.

---

## Plugin Architecture

```
┌─────────────────────────────────────────────────────────┐
│                   Geometry Script Plugin                  │
│                                                          │
│  ┌──────────────────┐    ┌────────────────────────────┐  │
│  │ GeometryCore     │    │ GeometryScriptingCore      │  │
│  │ (FDynamicMesh3,  │◄───│ (UDynamicMesh UObject      │  │
│  │  spatial queries,│    │  wrapper, function          │  │
│  │  mesh ops)       │    │  libraries)                 │  │
│  └──────────────────┘    └────────────────────────────┘  │
│           ▲                          ▲                    │
│           │                          │                    │
│  ┌────────┴─────────┐    ┌──────────┴─────────────────┐  │
│  │ GeometryFramework│    │ GeometryScriptingEditor     │  │
│  │ (UDynamicMesh-   │    │ (Editor-only utilities,     │  │
│  │  Component,      │    │  asset conversion)          │  │
│  │  ADynamicMesh-   │    │                             │  │
│  │  Actor)          │    │                             │  │
│  └──────────────────┘    └─────────────────────────────┘  │
└─────────────────────────────────────────────────────────┘
```

### Key Classes

| Class | Module | Purpose |
|-------|--------|---------|
| `FDynamicMesh3` | GeometryCore | Low-level triangle mesh with topology, normals, UVs, vertex colors. Not a UObject. |
| `UDynamicMesh` | GeometryScriptingCore | UObject wrapper around `FDynamicMesh3`. All Geometry Script functions operate on this. |
| `UDynamicMeshComponent` | GeometryFramework | Scene component that renders a `UDynamicMesh`. Supports in-editor and runtime updates. |
| `ADynamicMeshActor` | GeometryFramework | Actor with a `UDynamicMeshComponent`. Base class for mesh-generating actors. |
| `AGeneratedDynamicMeshActor` | GeometryFramework | Subclass of `ADynamicMeshActor` with `OnRebuildGeneratedMesh` event — the primary BP hook. |

---

## Enabling the Plugin

Geometry Script ships with UE5 but is **not enabled by default**:

1. **Edit → Plugins** → search "Geometry Script" → enable **GeometryScripting** plugin.
2. Restart the editor.
3. For C++ projects, add module dependencies to your `.Build.cs`:

```cpp
// YourProject.Build.cs
PublicDependencyModuleNames.AddRange(new string[] {
    "GeometryScriptingCore",
    "GeometryCore"
});

// Editor-only utilities (optional)
if (Target.bBuildEditor)
{
    PublicDependencyModuleNames.Add("GeometryScriptingEditor");
}
```

---

## Blueprint Workflow

### AGeneratedDynamicMeshActor

The fastest path to procedural geometry in Blueprints:

1. Create a **Blueprint Class** inheriting from `AGeneratedDynamicMeshActor`.
2. Override the **On Rebuild Generated Mesh** event.
3. Use Geometry Script nodes to build mesh geometry on the provided `UDynamicMesh`.
4. Place the actor in the level — geometry regenerates automatically.

```
Event: On Rebuild Generated Mesh (TargetMesh)
  │
  ├─► Append Box (TargetMesh, Size, Origin)
  │
  ├─► Append Cylinder (TargetMesh, Radius, Height)
  │
  ├─► Apply Mesh Boolean (TargetMesh, ToolMesh, Operation: Union)
  │
  └─► Set Material (TargetMesh, MaterialSlot, Material)
```

### Triggering Rebuilds

Geometry regenerates when:
- The actor is placed or moved in the editor.
- An exposed property (marked `EditAnywhere`) changes.
- You call `RequestRebuild()` at runtime.

---

## C++ Workflow

### Direct API Usage

```cpp
#include "GeometryScript/MeshPrimitiveFunctions.h"
#include "GeometryScript/MeshBasicEditFunctions.h"
#include "GeometryScript/MeshBooleanFunctions.h"
#include "GeometryScript/MeshTransformFunctions.h"
#include "GeometryScript/MeshNormalsFunctions.h"
#include "GeometryScript/MeshUVFunctions.h"

void AMyProceduralActor::GenerateMesh()
{
    UDynamicMesh* Mesh = DynamicMeshComponent->GetDynamicMesh();

    // Append a box primitive
    FGeometryScriptPrimitiveOptions PrimOptions;
    UGeometryScriptLibrary_MeshPrimitiveFunctions::AppendBox(
        Mesh,
        PrimOptions,
        FTransform::Identity,
        100.0f, 100.0f, 100.0f,  // Dimensions
        4, 4, 4                   // Subdivisions
    );

    // Recompute normals
    FGeometryScriptCalculateNormalsOptions NormalOptions;
    UGeometryScriptLibrary_MeshNormalsFunctions::RecomputeNormals(
        Mesh, NormalOptions
    );
}
```

### Key Function Library Headers

| Header | Functions |
|--------|-----------|
| `MeshPrimitiveFunctions.h` | `AppendBox`, `AppendSphere`, `AppendCylinder`, `AppendCapsule`, `AppendTorus`, `AppendDisc`, `AppendSweepPolygon` |
| `MeshBasicEditFunctions.h` | `AppendMesh`, `DeleteTriangles`, `AppendBufferMesh`, `SetVertexPosition` |
| `MeshBooleanFunctions.h` | `ApplyMeshBoolean` (Union, Intersect, Subtract) |
| `MeshTransformFunctions.h` | `TransformMesh`, `TranslateMesh`, `ScaleMesh` |
| `MeshQueryFunctions.h` | `GetVertexCount`, `GetTriangleCount`, `GetBoundingBox`, `GetMeshVolumeArea` |
| `MeshUVFunctions.h` | `SetMeshUVsFromPlanarProjection`, `SetMeshUVsFromBoxProjection`, `AutoGeneratePatchBasedUVs` |
| `MeshMaterialFunctions.h` | `SetMaterialIDOnTriangles`, `RemapMaterialIDs`, `SetPolygroupMaterialID` |
| `MeshSimplifyFunctions.h` | `ApplySimplifyToTriangleCount`, `ApplySimplifyToVertexCount` |
| `MeshDecomposeFunctions.h` | `SplitMeshByComponents`, `SplitMeshByMaterialIDs` |
| `MeshSelectionFunctions.h` | `SelectMeshElementsInBox`, `SelectMeshElementsInsideMesh` |

---

## Boolean Operations

Boolean operations combine or subtract meshes:

```cpp
FGeometryScriptMeshBooleanOptions BoolOptions;
BoolOptions.bFillHoles = true;

UDynamicMesh* ToolMesh = NewObject<UDynamicMesh>();
// ... populate ToolMesh with geometry ...

UGeometryScriptLibrary_MeshBooleanFunctions::ApplyMeshBoolean(
    TargetMesh,
    FTransform::Identity,  // Target transform
    ToolMesh,
    FTransform::Identity,  // Tool transform
    EGeometryScriptBooleanOperation::Subtract,
    BoolOptions
);
```

**Operations:**
- `Union` — Merge two meshes, removing interior geometry.
- `Intersect` — Keep only overlapping volume.
- `Subtract` — Remove tool volume from target.

**Performance note:** Boolean operations are CPU-intensive. Cache results rather than recomputing per-frame.

---

## Runtime Procedural Generation

### Enabling Runtime Support

Geometry Script works at runtime, but with caveats:

1. **No Nanite support** — `UDynamicMeshComponent` does not support Nanite virtualized geometry. For high-poly runtime meshes, use `ApplySimplifyToTriangleCount` to manage triangle budgets.
2. **No Lumen hardware ray tracing** — Software ray tracing is supported. Use `DynamicMeshComponent->SetCastShadow(true)` for shadow casting.
3. **Collision** — Call `DynamicMeshComponent->EnableComplexAsSimpleCollision()` or generate simplified collision meshes.

### Runtime Best Practices

```cpp
// Generate mesh asynchronously on game thread (no worker thread support)
void AMyGenerator::BeginPlay()
{
    Super::BeginPlay();

    // Build mesh
    UDynamicMesh* Mesh = DynamicMeshComponent->GetDynamicMesh();
    BuildProceduralMesh(Mesh);

    // Update collision after mesh generation
    DynamicMeshComponent->UpdateCollision();
}
```

**Tips:**
- Break large generation tasks across multiple frames using timers or coroutines.
- Pool `UDynamicMesh` objects rather than creating/destroying them frequently.
- Use `AppendBufferMesh` for batching triangle additions — faster than individual triangle inserts.

---

## Converting to Static Mesh

For baked assets (e.g., level-design tools that output static geometry):

```cpp
#include "GeometryScript/MeshAssetFunctions.h"

// Editor-only: Convert dynamic mesh to static mesh asset
FGeometryScriptCreateNewStaticMeshAssetOptions Options;
Options.bEnableNanite = true;  // Enable Nanite on the output
Options.bEnableCollision = true;

EGeometryScriptOutcomePins Outcome;
UGeometryScriptLibrary_MeshAssetFunctions::CreateNewStaticMeshAssetFromMesh(
    Mesh,
    "/Game/Generated/MyMesh",  // Asset path
    Options,
    Outcome
);
```

This is the recommended path for tools that generate geometry in-editor — convert to `UStaticMesh` to gain Nanite, Lumen HWRT, and full rendering pipeline support.

---

## Integration with PCG Framework

Geometry Script and PCG complement each other:

| Use Case | Tool |
|----------|------|
| Scatter points, manage biomes | PCG |
| Generate mesh geometry per-point | Geometry Script |
| Deform terrain, cut holes | Geometry Script |
| Runtime world building | Both |

A common pattern is to use PCG to scatter spawn points, then use `AGeneratedDynamicMeshActor` at each point to create unique procedural geometry (buildings, rocks, modular structures).

---

## Limitations

| Limitation | Workaround |
|------------|------------|
| No Nanite on `UDynamicMeshComponent` | Convert to `UStaticMesh` for Nanite support |
| No hardware ray tracing (Lumen HWRT) | Software ray tracing works; bake to static mesh for HWRT |
| CPU-only mesh operations | Cache results; avoid per-frame regeneration |
| No built-in LOD on dynamic meshes | Use `ApplySimplifyToTriangleCount` at different distances |
| Large meshes impact draw calls | Split into sections; use instancing for repeated elements |

---

## Common Patterns

### Procedural Building Generator

```
1. Define floor plan as 2D polygon
2. AppendSweepPolygon to extrude walls
3. Boolean-subtract window/door openings
4. AppendBox for floor slabs per story
5. Loop for multiple floors
6. Apply UVs → SetMeshUVsFromBoxProjection
7. Assign materials per element via SetMaterialIDOnTriangles
```

### Terrain Deformation Tool

```
1. Copy static mesh to UDynamicMesh (CopyMeshFromStaticMesh)
2. SelectMeshElementsInSphere around tool location
3. Offset selected vertices along normals
4. RecomputeNormals
5. UpdateCollision
```

### Mesh Merging Utility

```
1. Collect multiple static meshes in selection
2. CopyMeshFromStaticMesh for each → UDynamicMesh
3. AppendMesh to combine into single mesh
4. ApplySimplifyToTriangleCount for optimization
5. CreateNewStaticMeshAssetFromMesh for output
```

---

## Version History

| Version | Status | Key Changes |
|---------|--------|-------------|
| UE 5.0 | Experimental | Initial release with ~50 functions |
| UE 5.1–5.3 | Experimental | Expanded to 100+ functions, improved boolean robustness |
| UE 5.4 | Beta | Performance improvements, better Blueprint integration |
| UE 5.5–5.6 | Beta | Continued stability improvements, more primitive types |
| UE 5.7 | Beta | Improved editor tooling, better PCG integration |

> **Note:** Geometry Script remains in Beta as of UE 5.7. The API is stable for production use but may see additions in future releases. Core function signatures have been stable since UE 5.2.
