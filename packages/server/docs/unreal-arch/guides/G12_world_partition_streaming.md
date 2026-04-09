# World Partition & Asset Streaming

> **Category:** guide · **Engine:** Unreal Engine 5 · **Related:** [E1 Architecture Overview](../architecture/E1_architecture_overview.md), [G9 Rendering — Nanite & Lumen](G9_rendering_nanite_lumen.md)

World Partition is UE5's system for managing large worlds. It replaces UE4's manual Level Streaming with an automatic, grid-based streaming model built on a single persistent Level. Actors are saved as individual files (One File Per Actor), streamed in/out based on proximity to streaming sources, and represented at distance by HLODs. This guide covers UE 5.0–5.5+ best practices.

---

## Why World Partition?

| UE4 Level Streaming | UE5 World Partition |
|---|---|
| Manual sub-level setup + streaming volumes | Automatic grid-based streaming |
| One `.umap` file per sub-level → merge conflicts | One File Per Actor (OFPA) → fine-grained version control |
| Designer must decide what loads when | Engine streams based on proximity to sources |
| HLOD baked per sub-level | HLOD built from World Partition grid cells |

World Partition is the default for new UE5 projects. Existing projects
can convert via **Tools → Convert Level → World Partition**.

---

## Core Concepts

### 1. Streaming Grid

The world is divided into a regular grid of cells. Each cell tracks which actors are inside it. At runtime, cells near streaming sources are loaded; distant cells are unloaded.

**Key settings** (World Settings → World Partition → Runtime Settings):

| Setting | Default | Purpose |
|---|---|---|
| Grid Cell Size | 12800 (128m) | Size of each streaming cell. Smaller = more granular loading but more cells to manage |
| Loading Range | 25600 (256m) | Distance from a streaming source at which cells load |
| Debug Draw Distance | 0 | Set > 0 to visualize grid cells in PIE |

### 2. Streaming Sources

A streaming source is any component that tells World Partition "load cells around me." By default, every `APlayerController` is a streaming source.

Add custom streaming sources for non-player triggers:

```cpp
// Example: A security camera that pre-loads its view area
UCLASS()
class YOURGAME_API ASecurityCamera : public AActor
{
    GENERATED_BODY()

public:
    ASecurityCamera()
    {
        // WHY add a streaming source to a non-player actor:
        //   Without this, the area the camera watches might be unloaded
        //   until a player gets close. For AI or cinematics that need
        //   actors loaded ahead of time, custom streaming sources solve this.
        StreamingSource = CreateDefaultSubobject<UWorldPartitionStreamingSourceComponent>(
            "StreamingSource");
        StreamingSource->SetupAttachment(RootComponent);
    }

protected:
    UPROPERTY(VisibleAnywhere)
    UWorldPartitionStreamingSourceComponent* StreamingSource;
};
```

**Multiplayer note:** The dedicated server does *not* use rendering-based streaming. You must explicitly add streaming sources server-side (typically at player positions) or World Partition will not load actors for the server.

### 3. One File Per Actor (OFPA)

With World Partition enabled, each actor is saved to its own `.uasset` file under `__ExternalActors__/`. This means:

- **No lock contention** — two designers can work on actors in the same level simultaneously
- **Smaller diffs** — version control only uploads changed actor files, not the entire map
- **Faster iteration** — saving one actor doesn't trigger a full level save

OFPA is enabled automatically when World Partition is active. You cannot opt specific actors out.

### 4. Data Layers

Data Layers replace UE4's Layers for grouping actors that should load/unload together.

| Layer Type | Behavior |
|---|---|
| **Runtime Data Layer** | Can be activated/deactivated at runtime via C++ or Blueprint |
| **Editor Data Layer** | Only affects editor visibility; no runtime effect |

**Use cases for Runtime Data Layers:**

- **Day/Night variants** — swap lit/unlit versions of a marketplace
- **Quest phases** — load rubble after a scripted explosion
- **Seasonal content** — swap snow-covered assets

```cpp
// Activate a Data Layer at runtime (e.g., after a quest event)
UDataLayerManager* DLManager = UDataLayerManager::GetDataLayerManager(GetWorld());
if (DLManager)
{
    // WHY we use FActorDataLayer instead of a string:
    //   Type safety — the editor validates the layer reference at cook time,
    //   catching typos before they become runtime bugs.
    UDataLayerAsset* DestructionLayer = /* loaded from asset reference */;
    DLManager->SetDataLayerRuntimeState(DestructionLayer,
        EDataLayerRuntimeState::Activated);
}
```

### 5. Is Spatially Loaded

Every actor has an **Is Spatially Loaded** flag (default: true).

| Value | Behavior |
|---|---|
| `true` | Actor streams in/out based on grid cell proximity |
| `false` | Actor is always loaded (regardless of distance) |

Set to `false` for:

- Game mode actors, managers, world-global systems
- Triggers that must always be evaluable (e.g., quest triggers)
- Actors referenced by always-loaded Blueprints

---

## Hierarchical Level of Detail (HLOD)

HLODs represent distant geometry with simplified proxy meshes, drastically reducing draw calls for open worlds.

### HLOD Setup

1. **World Settings → World Partition → HLOD → Enable**: `true`
2. **Add HLOD Layers** to control merge granularity:
   - `HLOD Layer 0` — merges meshes within a grid cell (e.g., 128m cells)
   - `HLOD Layer 1` — merges across clusters of Layer 0 cells (e.g., 512m)
3. **Build HLODs:** `Tools → Build → Build HLODs` or via commandlet for CI:

```bash
# Build HLODs from the command line (useful for CI/CD pipelines)
# WHY a commandlet instead of in-editor:
#   HLOD builds are slow for large worlds. Running via commandlet
#   lets you offload this to a build machine overnight.
UnrealEditor-Cmd.exe MyProject.uproject -run=WorldPartitionBuilderCommandlet \
    -Builder=WorldPartitionHLODsBuilder -AllowCommandletRendering
```

### HLOD Configuration

| Setting | Purpose |
|---|---|
| Cell Size | How much area one HLOD proxy covers |
| Build Method | Merge, Simplify, or Approximate — trade quality vs. cost |
| Transition Distance | At what distance the engine swaps from real actors to HLOD proxy |

**Mesh Merge** combines source meshes into one draw call. **Simplify** also reduces triangle count. **Approximate** generates an impostor (billboard-like) for maximum perf.

---

## Editor Workflow

### Minimap & Region Loading

The World Partition editor (accessible via **Window → World Partition**) shows a 2D minimap of all actors. You can:

- **Select regions** to load into the editor (avoids loading the entire world)
- **Filter by Data Layer** to focus on specific content
- **See cell boundaries** overlaid on the map

### Loading Regions

Only the regions you select are loaded into memory in the editor. This is critical for large worlds:

```
// Typical workflow for a level designer:
1. Open the level (nothing loaded except always-loaded actors)
2. Open World Partition editor
3. Select the region you're working on
4. Make edits — only actor files in that region are dirtied
5. Save — only modified actor files are saved (OFPA)
6. Submit to version control — small, targeted changelist
```

---

## Runtime Streaming Architecture

```
Player moves →
  WorldPartitionStreamingPolicy evaluates cells →
    Cells within LoadingRange marked for load →
      UWorldPartitionLevelStreamingDynamic creates streaming levels →
        Actors in those cells are spawned →
          HLOD proxies for distant cells remain visible
```

### Controlling Streaming Priority

```cpp
// Mark an actor as high priority for streaming (loads before others in the same cell)
// WHY: Critical gameplay actors (spawn points, checkpoint triggers) must be
// loaded before decorative foliage to prevent "falling through the floor" moments.
UPROPERTY(EditAnywhere, Category = "WorldPartition")
int32 StreamingPriority = 0; // Higher = loaded first
```

---

## Multiplayer Considerations

| Concern | Solution |
|---|---|
| Server needs actors loaded for gameplay | Add `UWorldPartitionStreamingSourceComponent` at each player's server-side position |
| Client-authority actors in unloaded cells | Use `bIsSpatiallyLoaded = false` for always-relevant actors |
| Replication of streamed-out actors | UE5 handles dormancy — actors that stream out on the client become dormant on the server |

```cpp
// Server-side: ensure streaming around all connected players
// Typically done in your GameMode
void AMyGameMode::PostLogin(APlayerController* NewPlayer)
{
    Super::PostLogin(NewPlayer);

    // WHY we add a streaming source component to the player's pawn:
    //   On dedicated servers there is no rendering, so the default
    //   viewport-based streaming doesn't work. Explicit sources are required.
    if (APawn* Pawn = NewPlayer->GetPawn())
    {
        UWorldPartitionStreamingSourceComponent* Source =
            NewObject<UWorldPartitionStreamingSourceComponent>(Pawn);
        Source->RegisterComponent();
    }
}
```

---

## Migration from Level Streaming

If converting a UE4 project:

1. **Tools → Convert Level → World Partition** — automated conversion
2. Review actors that were in sub-levels — they become OFPA external actors
3. Replace `LevelStreamingVolume` triggers with Data Layers
4. Replace manual `LoadStreamLevel` calls with Data Layer activation
5. Rebuild HLODs for the partitioned world
6. Test in PIE with `wp.Runtime.ToggleDrawStreamingGrid 1` to visualize cells

---

## Performance & Debugging

### Console Commands

| Command | Purpose |
|---|---|
| `wp.Runtime.ToggleDrawStreamingGrid 1` | Visualize streaming grid cells |
| `wp.Runtime.ToggleDrawStreamingSources 1` | Show streaming source locations and radii |
| `wp.Runtime.OverrideLoadingRange 50000` | Temporarily increase loading range for testing |
| `stat WorldPartition` | Show streaming statistics |

### Optimization Checklist

| Issue | Solution |
|---|---|
| Hitches when cells load | Reduce actor count per cell; use async loading |
| Too many draw calls at distance | Configure HLOD layers with aggressive merge/simplify |
| Server not loading actors | Verify streaming sources exist on the server |
| Long HLOD build times | Increase HLOD cell size; use Approximate method |
| Large version control checkouts | Verify OFPA is active; actors should be individual files |
| Pop-in at cell boundaries | Increase Loading Range or add a pre-loading buffer zone |

### Profiling

Use **Unreal Insights** with the `WorldPartition` trace channel to measure:

- Cell load/unload time
- Actor spawn time per cell
- HLOD transition cost

---

## Version Notes

| UE Version | Key Changes |
|---|---|
| UE 5.0 | World Partition introduced (experimental) |
| UE 5.1 | Stable; Data Layers, HLOD improvements |
| UE 5.2 | Content Bundle support for modular DLC |
| UE 5.3 | Runtime Data Layer activation, improved minimap editor |
| UE 5.4 | Asset virtualization preview (reduced sync sizes) |
| UE 5.5 | Streaming priority refinements, HLOD Approximate method |
