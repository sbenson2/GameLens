# Data Layers & Packed Level Actors

> **Category:** guide · **Engine:** Unreal Engine 5.0+ · **Related:** [G12 World Partition & Streaming](G12_world_partition_streaming.md), [G33 Game Features & Modular Gameplay](G33_game_features_modular_gameplay.md), [G20 Performance & Memory](G20_performance_optimization_memory.md)

Data Layers and Packed Level Actors (PLAs) are two World Partition features that go beyond basic proximity-based streaming. Data Layers let you group actors into named layers that can be activated or deactivated at runtime — enabling gameplay-driven streaming (load a dungeon interior when the player opens the door, unload a destroyed city block after a story event). Packed Level Actors let you assemble reusable building blocks (a house, a city block, a dungeon room) as self-contained levels that stream efficiently and render with instanced draw calls. Together they are essential tools for shipping large-scale or content-heavy UE5 worlds.

---

## Data Layers

### What They Are

A Data Layer is a named group of actors within a World Partition world. Each actor can belong to zero or more Data Layers. At runtime, you control whether a layer is **Activated**, **Loaded**, or **Unloaded** — and the engine streams the associated actors accordingly.

Data Layers replace UE4's manual Level Streaming volumes with a declarative, data-driven model that works inside the World Partition grid.

### Layer Types

| Type | Description | Typical Use |
|---|---|---|
| **Editor Data Layer** | Organizational only — no runtime behavior | Hide/show groups of actors while editing (e.g., "Lighting_Debug", "Blockout_Geo") |
| **Runtime Data Layer** | Controls actor streaming at runtime | Gameplay-driven loading (dungeon interiors, quest-specific content, destruction states) |

Runtime Data Layers have an **Initial Runtime State** that determines their state at world load:

| State | Meaning |
|---|---|
| `Unloaded` | Actors are not loaded at world start |
| `Loaded` | Actors are loaded into memory but not visible or ticking |
| `Activated` | Actors are loaded, visible, and ticking |

### Creating Data Layers

**In the Editor:**

1. Open **Window → World Partition → Data Layers Outliner**.
2. Right-click → **Create Data Layer Asset** (creates a `UDataLayerAsset` in the Content Browser — reusable across levels) or **Create Data Layer Instance** (creates a `UDataLayerInstance` local to this world).
3. Set the layer type (Editor or Runtime) and, for Runtime layers, the Initial Runtime State.

**Assigning Actors:**

- Select actors in the viewport → Details panel → **Data Layers** section → add the desired layer(s).
- Or drag actors onto a layer in the Data Layers Outliner.

### How Data Layers Interact with Spatial Loading

An actor's loading depends on both its spatial-loading flag and its Data Layer membership:

| `Is Spatially Loaded` | Data Layer | Result |
|---|---|---|
| Yes | None | Loads when a streaming source is within range |
| Yes | Runtime layer | Loads when source is in range **AND** layer is Activated |
| No | None | Always loaded (non-spatial) |
| No | Runtime layer | Loaded only when layer is Activated (ignores proximity) |

This means Data Layers act as an additional gate on top of spatial streaming. An actor in a deactivated layer will never load, regardless of proximity.

### Runtime Control — C++

```cpp
#include "WorldPartition/DataLayer/DataLayerManager.h"
#include "WorldPartition/DataLayer/DataLayerAsset.h"

// WHY: Use SetDataLayerRuntimeState to drive gameplay-triggered streaming.
// Example: load a dungeon interior when the player opens a door.

void AMyGameMode::OpenDungeonDoor(const UDataLayerAsset* DungeonInteriorLayer)
{
    if (!DungeonInteriorLayer) return;

    UDataLayerManager* DLManager = UDataLayerManager::GetDataLayerManager(GetWorld());
    if (!DLManager) return;

    // Activate the layer — actors will stream in based on spatial rules
    // bIsRecursive: true = also activate child layers
    DLManager->SetDataLayerRuntimeState(
        DungeonInteriorLayer,
        EDataLayerRuntimeState::Activated,
        /*bIsRecursive=*/ true
    );
}

void AMyGameMode::SealDungeon(const UDataLayerAsset* DungeonInteriorLayer)
{
    UDataLayerManager* DLManager = UDataLayerManager::GetDataLayerManager(GetWorld());
    if (!DLManager) return;

    // Unload the layer — actors stream out
    DLManager->SetDataLayerRuntimeState(
        DungeonInteriorLayer,
        EDataLayerRuntimeState::Unloaded,
        /*bIsRecursive=*/ true
    );
}
```

### Runtime Control — Blueprints

The same API is exposed to Blueprints:

1. Get a reference to the `UDataLayerAsset` (e.g., via a `UPROPERTY(EditAnywhere)` on your GameMode or a Data Table).
2. Call **Set Data Layer Runtime State** (node category: Data Layers).
3. Pass the asset reference, the desired `EDataLayerRuntimeState`, and the recursive flag.

### EDataLayerRuntimeState Values

| Value | Effect |
|---|---|
| `Unloaded` | Actors are fully unloaded from memory |
| `Loaded` | Actors are in memory but hidden and not ticking |
| `Activated` | Actors are in memory, visible, and ticking |

The `Loaded` state is useful for pre-loading content before the player can see it — call `Loaded` a few seconds before `Activated` to avoid streaming hitches.

### Nesting and Hierarchies

Data Layers can be nested. A child layer inherits the activation constraint of its parent — if the parent is Unloaded, the child cannot be Activated. This enables patterns like:

```
RuntimeLayer: "Dungeon_Wing_A"        (Initial: Unloaded)
  └─ RuntimeLayer: "Dungeon_Wing_A_Boss"  (Initial: Unloaded)
```

Activating `Dungeon_Wing_A` loads the wing. Later, activating `Dungeon_Wing_A_Boss` loads the boss arena. Unloading the parent unloads everything.

---

## Packed Level Actors (PLAs)

### What They Are

A Packed Level Actor is an actor that references a separate level asset and renders its static geometry as a single optimized actor. PLAs use **Instanced Static Mesh (ISM)** and **Hierarchical Instanced Static Mesh (HISM)** components internally, so placing the same PLA multiple times is cheap — identical meshes are batched into instanced draw calls.

### Why Use PLAs

| Problem | PLA Solution |
|---|---|
| Placing the same building 50 times = 50× the actors | PLA instances share geometry; draw calls scale with unique meshes, not placements |
| Editing one building requires finding all copies | Edit the source level once — all PLA instances update |
| Large actor counts slow down World Partition streaming | One PLA = one streaming unit, regardless of internal complexity |
| OFPA merge conflicts on shared structures | The source level is separate; PLA placements are lightweight references |

### Creating a PLA

1. **Build the structure in a sub-level**:
   - Create a new Level asset (e.g., `L_Building_House_01`).
   - Place Static Meshes, lights, collision volumes, etc. inside it.

2. **Create the Packed Level Actor**:
   - In the Content Browser, right-click the Level → **Create Packed Level Actor**.
   - The engine bakes the level's static meshes into ISM/HISM components.

3. **Place instances**:
   - Drag the PLA into your World Partition world. Place as many instances as needed.
   - Each instance can have a unique transform and per-instance data (e.g., variation seed).

### PLAs and World Partition Streaming

PLAs integrate with World Partition's OFPA (One File Per Actor) system. Each PLA instance is stored as a single actor file and streams as one unit. This is significantly more efficient than streaming hundreds of individual actors per building.

**Recommended setup:**
- Use PLAs with OFPA enabled (the default in World Partition worlds).
- For very large structures (e.g., an entire city block), consider nesting PLAs — a city-block PLA that contains building PLAs.

### PLAs and HLODs

World Partition generates HLODs (Hierarchical Level of Detail) per grid cell. PLAs participate in HLOD generation automatically. The HLOD system supports several reduction strategies:

| HLOD Layer Type | Description | Best For |
|---|---|---|
| **Instancing** | Keeps instanced meshes, reduces unique mesh count | Dense repeated geometry (forests, building arrays) |
| **Merged Mesh** | Combines nearby meshes into a single mesh | Mixed-geometry areas |
| **Simplified Mesh** | Generates proxy meshes with reduced triangle count | Distant city blocks, large structures |
| **Approximated Mesh** | Captures appearance into imposter-like representations | Very distant background geometry |

### Performance Tips

- **Profile draw calls**: Use `stat SceneRendering` to check instance counts and draw calls. PLAs should reduce both significantly compared to individual actor placement.
- **Avoid dynamic actors inside PLAs**: PLAs bake static geometry. Dynamic actors (physics, interactables) should be placed alongside the PLA in the world, not inside the source level.
- **Watch HISM component limits**: Each unique mesh in a PLA source level becomes an HISM component. Keep unique mesh variety reasonable per PLA.

---

## Combining Data Layers and PLAs

A powerful pattern is assigning PLAs to Data Layers for gameplay-driven structural loading:

```
RuntimeLayer: "City_Destroyed"  (Initial: Unloaded)
  → PLA: L_CityBlock_Destroyed_01 (instances throughout the city)

RuntimeLayer: "City_Intact"     (Initial: Activated)
  → PLA: L_CityBlock_Intact_01   (same positions)
```

When the story triggers city destruction:
1. Unload `City_Intact`.
2. Activate `City_Destroyed`.

The engine swaps the intact buildings for destroyed versions — with efficient instanced rendering and controlled streaming.

---

## Common Pitfalls

1. **Forgetting to set Initial Runtime State** — Runtime layers default to `Unloaded`. If your content should be visible at world start, set the state to `Activated`.

2. **Mixing Editor and Runtime layer types** — Editor layers have no runtime effect. If you need gameplay control, the layer must be a Runtime type.

3. **Spatial loading masking layer activation** — An actor with `Is Spatially Loaded = true` on an Activated layer still requires a streaming source nearby to load. For always-loaded gameplay content, set `Is Spatially Loaded = false`.

4. **Editing PLA source levels without rebuilding** — After modifying a PLA's source level, right-click the PLA asset → **Update Packed Level Actor** to rebake the ISM/HISM components.

5. **Dynamic actors in PLA source levels** — PLAs only bake static geometry. Actors with physics or Blueprint logic will not work correctly inside a PLA. Place them as separate actors in the world.

---

## Quick-Start Checklist

### Data Layers
```
□ World uses World Partition (Project Settings or converted)
□ Open Data Layers Outliner (Window → World Partition → Data Layers)
□ Create Runtime Data Layer asset or instance
□ Set Initial Runtime State (Unloaded / Loaded / Activated)
□ Assign actors to the layer
□ Toggle at runtime via SetDataLayerRuntimeState (C++ or Blueprint)
□ Test spatial loading interaction (Is Spatially Loaded flag)
```

### Packed Level Actors
```
□ Build reusable structure in a separate Level asset
□ Right-click Level → Create Packed Level Actor
□ Place PLA instances in World Partition world
□ Verify HLOD generation includes PLA content (Build → Build HLODs)
□ Profile with stat SceneRendering for draw call reduction
□ Optionally assign PLAs to Data Layers for gameplay-driven loading
```
