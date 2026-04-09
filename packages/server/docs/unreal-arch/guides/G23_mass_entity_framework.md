# MassEntity: ECS Framework for Large-Scale Simulations

> **Category:** guide · **Engine:** Unreal Engine 5.0+ · **Related:** [G11 AI & Behavior Trees](G11_ai_behavior_trees.md), [G20 Performance & Memory](G20_performance_optimization_memory.md), [G12 World Partition](G12_world_partition_streaming.md)

MassEntity is Unreal Engine's archetype-based Entity Component System (ECS). Originally built by Epic's AI team for the massive crowd simulations in *Fortnite* and *The Matrix Awakens* demo, it enables thousands of lightweight entities with data-oriented processing. Unlike Unreal's traditional Actor model (which carries significant per-instance overhead), Mass entities are minimal data containers processed in bulk by Processors. This guide covers the architecture, Fragments, Processors, Traits, and practical patterns for crowd AI, environmental systems, and performance-critical simulations.

---

## When to Use MassEntity vs. Actors

| Scenario | Use Actors | Use MassEntity |
|----------|-----------|---------------|
| Player character, NPCs with complex behaviors | ✅ | ❌ |
| 50–10,000 crowd agents | ❌ | ✅ |
| Projectiles, particles with gameplay logic | Sometimes | ✅ |
| Environmental objects (foliage interaction, debris) | ❌ | ✅ |
| Anything with full physics, collision, widgets | ✅ | ❌ |

**Rule of thumb:** If you need more than ~100 of something with simple behavior, Mass is worth evaluating. If each entity needs its own Blueprint, collision, and player interaction, stick with Actors.

---

## Plugin Setup

MassEntity is split across several plugins. Enable what you need:

| Plugin | Purpose |
|--------|---------|
| `MassEntity` | Core ECS — entities, fragments, processors, archetypes |
| `MassGameplay` | Gameplay fragments (transform, movement, LOD, replication) |
| `MassAI` | AI integration — StateTree, ZoneGraph navigation |
| `MassNavigation` | Avoidance, pathfinding for Mass entities |
| `MassRepresentation` | Visual representation (ISM, Actors for nearby entities) |
| `MassCrowd` | High-level crowd simulation combining all of the above |

For a minimal setup, enable `MassEntity` and `MassGameplay`. For crowd AI, enable all of them.

---

## Core Architecture

```
┌─────────────────────────────────────────────────┐
│                 Entity Manager                    │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐       │
│  │Archetype │  │Archetype │  │Archetype │  ...   │
│  │ A+B+C    │  │ A+B      │  │ B+C+D    │       │
│  │┌──┬──┬──┐│  │┌──┬──┐   │  │┌──┬──┬──┐│       │
│  ││A │B │C ││  ││A │B │   │  ││B │C │D ││       │
│  │├──┼──┼──┤│  │├──┼──┤   │  │├──┼──┼──┤│       │
│  ││A │B │C ││  ││A │B │   │  ││B │C │D ││       │
│  │├──┼──┼──┤│  │└──┴──┘   │  │├──┼──┼──┤│       │
│  ││A │B │C ││  │ 2 entities│  ││B │C │D ││       │
│  │└──┴──┴──┘│  └──────────┘  │└──┴──┴──┘│       │
│  │3 entities │               │3 entities │       │
│  └──────────┘                └──────────┘       │
│                                                   │
│  Processors iterate over archetypes matching      │
│  their query — data is contiguous in memory.      │
└─────────────────────────────────────────────────┘
```

### Entities

An entity is just a unique ID (handle). It has no behavior or data on its own — it's a key that maps to a row in an archetype table.

### Fragments (Components in ECS terminology)

Fragments are small `UStruct`s that hold data. They inherit from `FMassFragment`.

```cpp
// A fragment storing health data for crowd agents.
// Keep fragments small and focused — one concern per fragment.
// This enables better cache utilization when processors iterate
// over thousands of entities.
USTRUCT()
struct FHealthFragment : public FMassFragment
{
    GENERATED_BODY()

    UPROPERTY(EditAnywhere)
    float CurrentHealth = 100.f;

    UPROPERTY(EditAnywhere)
    float MaxHealth = 100.f;
};

// A fragment storing movement intent — separate from transform
// because some processors need movement without caring about position.
USTRUCT()
struct FMoveTargetFragment : public FMassFragment
{
    GENERATED_BODY()

    UPROPERTY()
    FVector TargetLocation = FVector::ZeroVector;

    UPROPERTY()
    float MoveSpeed = 300.f;

    UPROPERTY()
    bool bHasTarget = false;
};
```

### Shared Fragments

Data shared across many entities of the same type. Use `FMassSharedFragment` for read-only configuration that doesn't vary per entity:

```cpp
// Shared across all entities of the same faction — saves memory
// vs. duplicating faction data on every entity.
USTRUCT()
struct FFactionSharedFragment : public FMassSharedFragment
{
    GENERATED_BODY()

    UPROPERTY(EditAnywhere)
    FName FactionName;

    UPROPERTY(EditAnywhere)
    FLinearColor FactionColor = FLinearColor::White;

    UPROPERTY(EditAnywhere)
    float AggressionLevel = 0.5f;
};
```

### Tags

Tags are zero-size markers used for filtering. They inherit from `FMassTag`:

```cpp
// Tags carry no data — they just mark entities for query filtering.
// "Is this entity dead?" is a yes/no question, so a tag is cheaper
// than a bool fragment.
USTRUCT()
struct FDeadTag : public FMassTag
{
    GENERATED_BODY()
};

USTRUCT()
struct FAlertedTag : public FMassTag
{
    GENERATED_BODY()
};
```

### Archetypes

An archetype is a unique combination of fragment types and tags. Entities with the same archetype are stored together in contiguous memory. When you add or remove a fragment/tag from an entity, it moves to a different archetype — this is called **archetype migration**.

> **Performance insight:** Archetype migration is relatively expensive. Avoid rapidly adding/removing fragments as a way to change state. Use tags for binary state changes and fragment values for continuous state.

---

## Processors (Systems in ECS terminology)

Processors define behavior by iterating over entities that match a query. They inherit from `UMassProcessor`:

```cpp
// Processor that moves entities toward their target location.
// Processors run every tick on ALL matching entities — this is where
// the performance benefit comes from. The data is contiguous in memory,
// so the CPU cache stays hot across thousands of entities.
UCLASS()
class UMoveToTargetProcessor : public UMassProcessor
{
    GENERATED_BODY()

public:
    UMoveToTargetProcessor();

protected:
    // ConfigureQueries defines WHICH entities this processor operates on.
    // It runs once at initialization.
    virtual void ConfigureQueries() override;

    // Execute runs every tick with all matching entity chunks.
    virtual void Execute(FMassEntityManager& EntityManager,
                         FMassExecutionContext& Context) override;

private:
    FMassEntityQuery EntityQuery;
};

// Implementation
UMoveToTargetProcessor::UMoveToTargetProcessor()
{
    // Control execution order relative to other processors.
    // Lower number = runs earlier in the frame.
    ExecutionOrder.ExecuteAfter.Add(UMassApplyMovementProcessor::StaticClass());
}

void UMoveToTargetProcessor::ConfigureQueries()
{
    // This query matches entities that have BOTH FTransformFragment
    // and FMoveTargetFragment, and do NOT have the FDeadTag.
    EntityQuery.AddRequirement<FTransformFragment>(
        EMassFragmentAccess::ReadWrite);
    EntityQuery.AddRequirement<FMoveTargetFragment>(
        EMassFragmentAccess::ReadOnly);
    EntityQuery.AddTagRequirement<FDeadTag>(
        EMassFragmentPresence::None);  // Exclude dead entities

    EntityQuery.RegisterWithProcessor(*this);
}

void UMoveToTargetProcessor::Execute(
    FMassEntityManager& EntityManager,
    FMassExecutionContext& Context)
{
    // ForEachEntityChunk iterates over contiguous memory blocks.
    // Each chunk contains entities of the same archetype.
    EntityQuery.ForEachEntityChunk(
        EntityManager, Context,
        [this](FMassExecutionContext& Context)
        {
            const int32 NumEntities = Context.GetNumEntities();
            const float DeltaTime = Context.GetDeltaTimeSeconds();

            // Get arrays of fragment data for this chunk.
            // These are contiguous arrays — perfect for SIMD / cache.
            auto Transforms = Context.GetMutableFragmentView<FTransformFragment>();
            auto MoveTargets = Context.GetFragmentView<FMoveTargetFragment>();

            for (int32 i = 0; i < NumEntities; ++i)
            {
                if (!MoveTargets[i].bHasTarget)
                    continue;

                FVector CurrentPos = Transforms[i].GetTransform().GetLocation();
                FVector TargetPos = MoveTargets[i].TargetLocation;
                FVector Direction = (TargetPos - CurrentPos).GetSafeNormal();

                float MoveAmount = MoveTargets[i].MoveSpeed * DeltaTime;
                float Distance = FVector::Dist(CurrentPos, TargetPos);

                if (Distance < MoveAmount)
                {
                    // Arrived — snap to target
                    Transforms[i].GetMutableTransform().SetLocation(TargetPos);
                }
                else
                {
                    FVector NewPos = CurrentPos + Direction * MoveAmount;
                    Transforms[i].GetMutableTransform().SetLocation(NewPos);
                }
            }
        });
}
```

---

## Traits (Entity Templates)

Traits are the primary way to define what fragments an entity starts with. They inherit from `UMassEntityTraitBase` and are composed in **Mass Entity Config** data assets:

```cpp
// A trait that adds health-related fragments to an entity.
// Traits are reusable building blocks — compose them in data assets
// to define different entity types without code changes.
UCLASS(meta = (DisplayName = "Health"))
class UHealthTrait : public UMassEntityTraitBase
{
    GENERATED_BODY()

public:
    // Called during entity template building to register fragments.
    virtual void BuildTemplate(
        FMassEntityTemplateBuildContext& BuildContext,
        const UWorld& World) const override
    {
        // Add the health fragment with default values
        FHealthFragment HealthDefaults;
        HealthDefaults.MaxHealth = DefaultMaxHealth;
        HealthDefaults.CurrentHealth = DefaultMaxHealth;
        BuildContext.AddFragment<FHealthFragment>(HealthDefaults);
    }

protected:
    UPROPERTY(EditAnywhere, Category = "Health")
    float DefaultMaxHealth = 100.f;
};
```

### Mass Entity Config (Data Asset)

Create a **Mass Entity Config** in the Content Browser to compose traits:

```
MassEntityConfig: "CrowdCivilian"
├── Traits:
│   ├── AssortedFragmentsTrait (built-in: adds transform)
│   ├── HealthTrait (custom: adds FHealthFragment)
│   ├── MoveTargetTrait (custom: adds FMoveTargetFragment)
│   ├── NavigationTrait (MassNavigation: adds avoidance)
│   ├── RepresentationTrait (MassRepresentation: ISM rendering)
│   └── StateTreeTrait (MassAI: behavior via StateTree)
```

---

## Spawning Entities

### From a Mass Spawner Actor

Place a `AMassSpawner` in the level and assign a Mass Entity Config. Configure spawn count, area, and timing in the Details panel. This is the simplest approach for level-designed crowds.

### Programmatically

```cpp
// Spawn entities from C++ — useful for runtime spawning
// (e.g., spawning reinforcements during gameplay).
void SpawnCrowdEntities(UWorld* World, int32 Count)
{
    FMassEntityManager& EntityManager =
        UE::Mass::Utils::GetEntityManagerChecked(*World);

    // Build archetype from a config asset
    const FMassArchetypeHandle Archetype =
        EntityManager.CreateArchetype(
            CivilianConfigAsset->GetArchetypeComposition());

    // Batch-create entities — much faster than creating one at a time
    TArray<FMassEntityHandle> NewEntities;
    EntityManager.BatchCreateEntities(Archetype, Count, NewEntities);

    // Initialize their transforms
    for (int32 i = 0; i < NewEntities.Num(); ++i)
    {
        FTransformFragment& Transform =
            EntityManager.GetFragmentDataChecked<FTransformFragment>(
                NewEntities[i]);

        FVector SpawnPos = GetRandomPointInSpawnArea();
        Transform.GetMutableTransform().SetLocation(SpawnPos);
    }
}
```

---

## Visualization: Mass Representation

Mass entities have no meshes by default. The `MassRepresentation` plugin provides LOD-based rendering:

- **Far LOD** — Instanced Static Meshes (ISM). Thousands of simple meshes rendered in a few draw calls.
- **Medium LOD** — ISM with animation (vertex animation textures).
- **Near LOD** — Spawn a full Actor with skeletal mesh, animation, collision. The Mass entity is temporarily "represented" by this Actor.

This is configured via the `UMassRepresentationTrait` and `UMassVisualizationProcessor`.

> **Key insight:** The Actor spawned for near-LOD is a temporary shell. When the player moves away, the Actor is destroyed and the entity goes back to ISM rendering. This lets you have 5,000 crowd agents but only 20–30 full Actors at any time.

---

## Integration with AI (StateTree)

MassAI uses **StateTree** (not Behavior Trees) for entity decision-making. StateTree is a hierarchical state machine with evaluation-based transitions — designed for the data-oriented context of Mass where thousands of entities share the same tree:

```
StateTree: "CivilianBehavior"
├── Root
│   ├── State: Idle
│   │   ├── Task: Wait(2-5s random)
│   │   └── Transition → Wander (on timer complete)
│   ├── State: Wander
│   │   ├── Task: FindRandomNavPoint
│   │   ├── Task: MoveToTarget
│   │   └── Transition → Flee (on tag: FAlertedTag added)
│   └── State: Flee
│       ├── Task: FindFleePoint (away from threat)
│       ├── Task: MoveToTarget (at 2x speed)
│       └── Transition → Idle (on tag: FAlertedTag removed)
```

---

## Performance Tips

### Memory Layout

Mass entities are stored in **chunks** of contiguous memory (similar to Unity DOTS). This means:

- Fragments accessed together should be on the same archetype (they'll be in the same cache line)
- Splitting rarely-accessed data into separate fragments is good — processors that don't need it won't load it into cache
- Keep fragments small (under 64 bytes is ideal)

### Processor Optimization

- **Batch operations** — `ForEachEntityChunk` gives you arrays; use SIMD-friendly loops
- **Avoid per-entity allocations** — no `TArray` resizing inside the loop
- **Use `EMassFragmentAccess::ReadOnly`** when you don't modify a fragment — the scheduler can parallelize read-only processors
- **Execution order** — group processors that write to the same fragment to avoid false sharing

### Scaling Guidelines

| Entity Count | Expected Performance (60fps budget) |
|-------------|--------------------------------------|
| 1,000 | Trivial — plenty of headroom |
| 10,000 | Comfortable with basic fragments/processors |
| 50,000 | Requires careful fragment design, ISM-only rendering |
| 100,000+ | Possible but needs custom LOD, spatial partitioning, throttled processing |

---

## Common Pitfalls

| Pitfall | Solution |
|---------|----------|
| Entities aren't visible | Add `MassRepresentation` trait and configure ISM meshes |
| Processor never executes | Check that `ConfigureQueries` is correct and processor is registered (not manually excluded) |
| Archetype migration spam | Avoid rapidly adding/removing fragments; use tags for state flags |
| "Entity handle is invalid" crash | Entities can be destroyed between ticks; validate handles before access |
| StateTree not running | Ensure `MassAI` plugin is enabled and `StateTreeTrait` is in the config |

---

## Next Steps

- **[G11 AI & Behavior Trees](G11_ai_behavior_trees.md)** — Traditional AI for Actor-based NPCs alongside Mass crowds
- **[G12 World Partition](G12_world_partition_streaming.md)** — Stream Mass entities in/out with World Partition
- **[G20 Performance & Memory](G20_performance_optimization_memory.md)** — Profile Mass processors with Unreal Insights
- Epic's [Mass Entity documentation](https://dev.epicgames.com/documentation/en-us/unreal-engine/overview-of-mass-entity-in-unreal-engine) for the full API reference
- [MassSample community project](https://github.com/Megafunk/MassSample) for working examples
