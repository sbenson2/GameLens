# Fast Geometry Streaming

> **Category:** guide · **Engine:** Unreal Engine 5.6+ (Experimental) · **Related:** [G12 World Partition Streaming](G12_world_partition_streaming.md), [G48 Data Layers Level Instancing](G48_data_layers_level_instancing.md), [G20 Performance Optimization](G20_performance_optimization_memory.md)

**Fast Geometry Streaming** (FastGeo) is an experimental plugin introduced in UE 5.6, developed as a collaboration between Epic Games and CD Projekt RED. It provides a specialized streaming system for immutable static geometry that loads faster, reduces memory fragmentation, and eliminates hitching during zone transitions — a long-standing pain point in large open-world games.

---

## What Problem Does FastGeo Solve?

Standard World Partition streaming loads actors (with their components, collision, and gameplay data) on demand as the player moves through the world. For massive open worlds with millions of static meshes (buildings, rocks, debris, props), this general-purpose approach can cause:

- **Hitching** during cell transitions when many actors initialize simultaneously.
- **Memory fragmentation** from frequent allocation/deallocation of actor data.
- **CPU overhead** from registering components, building physics state, and running BeginPlay on purely visual objects.

FastGeo addresses this by creating a separate, optimized streaming path specifically for static visual geometry that does not need gameplay logic, collision responses, or tick functions.

---

## How It Works

### Architecture Overview

FastGeo operates alongside World Partition — it does not replace it. The system identifies qualifying static geometry and streams it through a dedicated pipeline:

```
World Partition Grid
├── Standard Cells (actors with gameplay logic, collision, AI)
│   └── Normal actor loading → RegisterComponents → BeginPlay
│
└── FastGeo Cells (immutable visual-only geometry)
    └── Optimized batch loading → Minimal registration → No BeginPlay
```

### What Qualifies for FastGeo?

An actor qualifies for Fast Geometry Streaming if it is:

- A **Static Mesh Actor** or equivalent with only visual representation.
- **Immutable** — no runtime transforms, material parameter changes, or destruction.
- **No gameplay impact** — no collision that gameplay code queries, no tick, no overlap events.
- Flagged appropriately (automatically or manually) during the cook process.

Actors that have Blueprints, respond to damage, participate in physics simulation, or need collision for gameplay should remain in standard World Partition cells.

---

## Enabling FastGeo

### Step 1 — Enable the Plugin

In **Edit → Plugins**, search for **Fast Geometry Streaming** and enable it. Restart the editor.

### Step 2 — Project Settings

In **Project Settings → Engine → Streaming**, configure:

| Setting | Description | Default |
|---------|-------------|---------|
| `bEnableFastGeoStreaming` | Master toggle | `false` |
| `FastGeoGridCellSize` | Cell size for FastGeo grid (cm) | `25600` |
| `FastGeoLoadingDistance` | Distance at which FastGeo cells begin loading | `51200` |
| `bAutoClassifyStaticGeometry` | Let the cook process auto-detect eligible actors | `true` |

### Step 3 — Console Variables

Key CVars for runtime tuning:

```
// Enable incremental component pre-registration (required for FastGeo)
LevelStreaming.AllowIncrementalPreRegisterComponents=true

// Control how many FastGeo actors register per frame (spread load)
FastGeo.MaxRegistrationsPerFrame=50

// Debug visualization: blue = FastGeo, red = standard
FastGeo.ActorColoration=1
```

### Step 4 — Cook & Package

FastGeo classification happens at cook time. When `bAutoClassifyStaticGeometry` is enabled, the cooker analyzes each actor and routes qualifying geometry into the FastGeo pipeline. Manual overrides are available per-actor in the **Details** panel under **Streaming → Force FastGeo** or **Exclude from FastGeo**.

---

## World Partition Integration

FastGeo creates its own runtime streaming grid that operates in parallel with the standard World Partition grids:

```
Runtime Grids (configured in World Settings)
├── Close Grid        → 25,600 cm   (gameplay actors)
├── Medium Grid       → 102,400 cm  (medium-range actors)
├── Far Grid          → 204,800 cm  (distant actors)
└── FastGeo Grid      → Configured separately (visual-only geometry)
```

The FastGeo grid can use larger cell sizes than gameplay grids because visual-only geometry has fewer loading constraints. This reduces the total number of streaming operations.

---

## C++ Integration

### Streaming Source Component

FastGeo uses the same `UWorldPartitionStreamingSourceComponent` interface as standard World Partition. The Player Controller is a streaming source by default via `IWorldPartitionStreamingSourceProvider`.

```cpp
// Custom streaming source example
// Add to any actor that should trigger FastGeo loading
UPROPERTY(VisibleAnywhere)
UWorldPartitionStreamingSourceComponent* StreamingSource;

void AMyVehicle::BeginPlay()
{
    Super::BeginPlay();
    // StreamingSource automatically registers with World Partition
    // and FastGeo grids based on its location
}
```

### Querying FastGeo Status

```cpp
#include "FastGeoStreaming/FastGeoSubsystem.h"

void AMyGameMode::CheckStreamingStatus()
{
    if (UFastGeoSubsystem* FastGeo = GetWorld()->GetSubsystem<UFastGeoSubsystem>())
    {
        // Check if all nearby FastGeo cells are loaded
        bool bFullyLoaded = FastGeo->IsAreaFullyLoaded(
            PlayerLocation, LoadingRadius);

        // Get streaming stats
        FFastGeoStreamingStats Stats = FastGeo->GetStreamingStats();
        UE_LOG(LogGame, Log, TEXT("FastGeo: %d cells loaded, %d pending"),
            Stats.LoadedCells, Stats.PendingCells);
    }
}
```

---

## Debugging & Profiling

### Visual Debug Tools

| Command | Effect |
|---------|--------|
| `FastGeo.ActorColoration 1` | Color-codes actors: blue (FastGeo), red (standard) |
| `FastGeo.ShowGrid 1` | Render FastGeo grid cell boundaries |
| `FastGeo.ShowStats 1` | On-screen streaming statistics |
| `wp.Runtime.ShowGrid 1` | Standard World Partition grid overlay (for comparison) |

### Unreal Insights

FastGeo emits trace events visible in **Unreal Insights** under the **Loading** track:

- `FastGeo::LoadCell` — individual cell load times.
- `FastGeo::RegisterBatch` — component registration batch times.
- `FastGeo::UnloadCell` — cell unload and memory reclamation.

Compare these against standard `WorldPartition::StreamIn` events to measure the improvement.

---

## Performance Impact

Based on Epic's published benchmarks and CD Projekt RED's usage in The Witcher 4 tech demo:

| Metric | Standard Streaming | FastGeo Streaming | Improvement |
|--------|-------------------|-------------------|-------------|
| Cell load time (avg) | 8-12 ms | 1-3 ms | ~4x faster |
| Memory fragmentation | High (many small allocs) | Low (batch allocs) | Significant reduction |
| Hitch frequency | Noticeable on cell boundaries | Rare / imperceptible | Major UX improvement |
| CPU cost per frame (streaming) | ~2 ms | ~0.5 ms | ~4x reduction |

*These numbers are scenario-dependent. Dense urban environments with millions of unique meshes see the largest gains.*

---

## Limitations & Caveats

- **Experimental status** — API surface may change in future engine versions. Not recommended for shipping titles without thorough testing.
- **Static only** — No support for movable, destructible, or animating geometry. Use standard World Partition for those.
- **No collision** — FastGeo actors do not contribute to physics or trace queries. If you need player-blocking collision on a visual mesh, keep it in standard streaming.
- **Cook-time classification** — Changes to FastGeo eligibility require a re-cook. PIE testing may not perfectly reflect cooked behavior.
- **Nanite recommended** — FastGeo works best with Nanite-enabled meshes, as Nanite's own LOD and streaming complement FastGeo's loading strategy.

---

## Best Practices

1. **Start with auto-classification** — Let the cooker decide what qualifies. Manual overrides are for edge cases.
2. **Use larger FastGeo cell sizes** — Visual-only geometry can tolerate coarser grids (e.g., 51,200 cm) without gameplay impact.
3. **Combine with HLODs** — For extremely distant geometry, HLOD clusters reduce draw calls further. FastGeo handles the mid-range where full meshes are needed but gameplay is not.
4. **Profile with Unreal Insights** — Compare streaming load times before and after enabling FastGeo to validate the benefit for your specific world.
5. **Keep gameplay collision separate** — If a building needs both visual streaming (FastGeo) and collision (standard), split them into separate actors: one for the visual mesh (FastGeo), one for the collision volume (standard grid).

---

## Version History

| Version | Changes |
|---------|---------|
| UE 5.6 | Fast Geometry Streaming Plugin introduced (Experimental). Collaboration with CD Projekt RED. |
| UE 5.7 | Performance improvements. Better integration with Nanite and HLOD systems. Debug visualization enhancements. |

---

## Next Steps

- **[G12 World Partition Streaming](G12_world_partition_streaming.md)** — Comprehensive World Partition setup.
- **[G48 Data Layers Level Instancing](G48_data_layers_level_instancing.md)** — Data Layers for conditional content loading.
- **[G55 Unreal Insights Profiler](G55_unreal_insights_profiler.md)** — Profiling streaming performance.
