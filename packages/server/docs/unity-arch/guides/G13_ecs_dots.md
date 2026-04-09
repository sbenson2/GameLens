# G13 — ECS and DOTS in Unity 6

> **Category:** guide · **Engine:** Unity 6 (6000.x, Entities 1.3+) · **Related:** [Architecture Overview](../architecture/E1_architecture_overview.md) · [G11 Debugging & Profiling](G11_debugging_profiling.md) · [Unity Rules](../unity-arch-rules.md)

The Data-Oriented Technology Stack (DOTS) is Unity's performance-focused architecture built on three pillars: the **Entity Component System (ECS)** for data layout, the **C# Job System** for multithreading, and the **Burst Compiler** for native-code generation. In Unity 6 the Entities package has graduated from experimental to a core engine package, and the roadmap targets unified transforms where ECS components attach directly to GameObjects — making incremental adoption realistic for the first time. This guide covers the mental model, core APIs, practical patterns, and migration strategies.

---

## Why DOTS?

Traditional Unity (MonoBehaviour + GameObjects) uses an object-oriented layout where each object scatters its data across the heap. This causes:

- **Cache misses** — iterating 10 000 enemies touches memory scattered across the heap, stalling the CPU cache
- **Single-threaded updates** — `Update()` runs on the main thread; parallelism requires manual thread management
- **GC pressure** — managed allocations trigger garbage collection pauses

DOTS addresses all three by changing *how data is stored and processed*:

```
Traditional (OOP)                         DOTS (Data-Oriented)
─────────────────                         ────────────────────
GameObject A                              Archetype: [Position, Velocity, Health]
  ├─ Transform (heap)                     ┌────────────────────────────────────┐
  ├─ EnemyBrain (heap)                    │ Chunk 0 (16 KB, tightly packed)   │
  └─ Health (heap)                        │  Entity 0: pos vel hp             │
                                          │  Entity 1: pos vel hp             │
GameObject B                              │  Entity 2: pos vel hp             │
  ├─ Transform (heap)                     │  ...                              │
  ├─ EnemyBrain (heap)                    └────────────────────────────────────┘
  └─ Health (heap)                        ┌────────────────────────────────────┐
                                          │ Chunk 1 (16 KB, tightly packed)   │
(N objects = N×3 random heap locations)   │  Entity 128: pos vel hp           │
                                          │  ...                              │
                                          └────────────────────────────────────┘
                                          (N entities = linear memory scan)
```

The linear memory layout means the CPU prefetcher can predict access patterns, yielding 10–100× throughput gains on large entity counts.

---

## The Three Pillars

### 1. Entity Component System (ECS)

ECS separates **identity** (Entity), **data** (Components), and **behavior** (Systems).

| Concept | What it is | Unity API |
|---------|-----------|-----------|
| **Entity** | A lightweight ID (no class, no inheritance) | `Entity` struct |
| **Component** | Pure data — a struct implementing `IComponentData` | `struct Position : IComponentData { public float3 Value; }` |
| **System** | Logic that queries and transforms component data | `partial struct MoveSystem : ISystem` |
| **Archetype** | The unique set of component types on an entity | Managed automatically by the `EntityManager` |
| **Chunk** | A 16 KB block holding all entities of one archetype | Allocated/freed by the ECS runtime |

**Key insight:** an Entity is *not* an object. It has no methods, no inheritance, and no identity beyond its index. All data lives in components; all behavior lives in systems. This inversion is what enables the performance gains.

### 2. C# Job System

The Job System lets you write multithreaded code without manual thread management or locks:

```csharp
// A job that moves entities by their velocity.
// IJobEntity automatically iterates matching entities across chunks.
[BurstCompile]
public partial struct MoveJob : IJobEntity
{
    public float DeltaTime;

    // The [in] attribute tells the safety system this is read-only,
    // allowing parallel scheduling without race conditions.
    void Execute(ref LocalTransform transform, [ReadOnly] in Velocity velocity)
    {
        // WHY ref + in: 'ref' means we write to transform (position changes),
        // 'in' means we only read velocity. The safety system uses these
        // annotations to detect data races at compile time.
        transform.Position += velocity.Value * DeltaTime;
    }
}
```

Jobs are **scheduled** (not immediately executed) and run on worker threads. The safety system tracks read/write dependencies automatically — if two jobs both write to the same component type, the second waits for the first.

### 3. Burst Compiler

Burst translates C# (via IL) to highly optimized native code using LLVM. It works on any `[BurstCompile]`-annotated struct job or system method:

```csharp
[BurstCompile]
public partial struct MoveSystem : ISystem
{
    [BurstCompile]
    public void OnUpdate(ref SystemState state)
    {
        // WHY we pass DeltaTime as a value: Burst-compiled code cannot
        // access managed objects (like Time.deltaTime). SystemAPI provides
        // a Burst-safe equivalent.
        float dt = SystemAPI.Time.DeltaTime;

        // Schedule the job across all worker threads.
        // The Dependency chain ensures correct ordering with other systems.
        new MoveJob { DeltaTime = dt }.ScheduleParallel();
    }
}
```

**Burst restrictions:** no managed types (string, List<T>, class references), no virtual calls, no try/catch. Use `NativeArray<T>`, `FixedString`, and `NativeList<T>` from `Unity.Collections` instead.

---

## Defining Components

Components are plain structs. Keep them small and focused — one responsibility per component:

```csharp
using Unity.Entities;
using Unity.Mathematics;

// WHY IComponentData not MonoBehaviour: IComponentData structs are stored
// in tightly-packed archetype chunks, enabling cache-friendly iteration.
// MonoBehaviours are heap-allocated class instances with vtable overhead.

/// Marks an entity as part of the movement system. Position data.
public struct Position : IComponentData
{
    public float3 Value;
}

/// Velocity vector — read by the movement system, written by AI/input systems.
public struct Velocity : IComponentData
{
    public float3 Value;
}

/// Tag component (zero-size) — marks enemies for queries without storing data.
/// WHY tags exist: they change the archetype, so you can query "all entities
/// that are enemies" without adding a bool field to every entity.
public struct EnemyTag : IComponentData { }

/// Shared component — entities with the same value share a chunk.
/// WHY shared: if 5000 enemies share the same FactionId, they land in the
/// same chunks, making faction-based queries extremely fast.
public struct Faction : ISharedComponentData
{
    public int FactionId;
}

/// Buffer element — a resizable list attached to a single entity.
/// WHY DynamicBuffer: inventory slots, path waypoints, damage history —
/// variable-length data that doesn't fit a fixed struct.
[InternalBufferCapacity(8)] // First 8 elements stored inline in the chunk
public struct InventorySlot : IBufferElementData
{
    public Entity ItemEntity;
    public int StackCount;
}
```

### Component Type Summary

| Type | Trait | Use Case |
|------|-------|----------|
| `IComponentData` | Unmanaged struct | Most data (position, health, stats) |
| `ISharedComponentData` | Groups entities into chunks by value | Faction, material, team |
| `IBufferElementData` | Dynamic-length list per entity | Inventory, waypoints, damage log |
| `ICleanupComponentData` | Survives entity destruction | Resource cleanup, deferred despawn |
| `IEnableableComponent` | Can be toggled without archetype change | Stunned, invulnerable, invisible |
| Tag (zero-size `IComponentData`) | No data, just changes archetype | Enemy, Player, Projectile markers |

---

## Writing Systems

Systems run every frame (or on demand) and query entities by their component signature:

```csharp
using Unity.Burst;
using Unity.Entities;
using Unity.Mathematics;
using Unity.Transforms;

/// Applies gravity to all entities with Velocity.
/// WHY ISystem (not SystemBase): ISystem is an unmanaged struct that Burst
/// can compile entirely. SystemBase is a managed class — useful for prototyping
/// but blocks Burst on the outer method.
[BurstCompile]
[UpdateInGroup(typeof(SimulationSystemGroup))]  // Run during simulation phase
[UpdateBefore(typeof(MoveSystem))]               // Gravity before movement
public partial struct GravitySystem : ISystem
{
    [BurstCompile]
    public void OnUpdate(ref SystemState state)
    {
        float dt = SystemAPI.Time.DeltaTime;

        // SystemAPI.Query iterates all entities matching the component signature.
        // 'ref' = read-write access to Velocity.
        // The query automatically excludes entities missing Velocity.
        foreach (var velocity in SystemAPI.Query<RefRW<Velocity>>())
        {
            velocity.ValueRW.Value.y -= 9.81f * dt;
        }
    }
}
```

### Querying Patterns

```csharp
// Basic query — all entities with Position AND Velocity
foreach (var (pos, vel) in SystemAPI.Query<RefRW<Position>, RefRO<Velocity>>())
{
    pos.ValueRW.Value += vel.ValueRO.Value * dt;
}

// With entity ID — when you need to record commands for a specific entity
foreach (var (health, entity) in SystemAPI.Query<RefRO<Health>>().WithEntityAccess())
{
    if (health.ValueRO.Current <= 0)
        ecb.DestroyEntity(entity);  // Deferred destruction via command buffer
}

// Filtering — only enemies, exclude dead tag
foreach (var (pos, vel) in SystemAPI.Query<RefRW<Position>, RefRO<Velocity>>()
    .WithAll<EnemyTag>()
    .WithNone<DeadTag>())
{
    // Process only living enemies
}

// Shared component filter — only faction 2
foreach (var (pos, vel) in SystemAPI.Query<RefRW<Position>, RefRO<Velocity>>()
    .WithSharedComponentFilter(new Faction { FactionId = 2 }))
{
    // Process only faction 2 entities
}
```

---

## Entity Command Buffers (ECB)

Structural changes (creating/destroying entities, adding/removing components) cannot happen while iterating — they would invalidate chunk memory. Use an **EntityCommandBuffer**:

```csharp
[BurstCompile]
public partial struct SpawnSystem : ISystem
{
    [BurstCompile]
    public void OnUpdate(ref SystemState state)
    {
        // WHY ECB: creating entities during iteration would resize/move chunks,
        // invalidating pointers. ECBs queue changes and play them back after
        // the system completes — safe AND parallelizable.
        var ecb = new EntityCommandBuffer(Allocator.Temp);

        foreach (var (spawner, entity) in
            SystemAPI.Query<RefRW<Spawner>>().WithEntityAccess())
        {
            spawner.ValueRW.Timer -= SystemAPI.Time.DeltaTime;

            if (spawner.ValueRW.Timer <= 0f)
            {
                spawner.ValueRW.Timer = spawner.ValueRW.Interval;

                // Queue the spawn — actual creation happens after iteration
                Entity newEntity = ecb.Instantiate(spawner.ValueRW.Prefab);
                ecb.SetComponent(newEntity, new Position
                {
                    Value = spawner.ValueRW.SpawnPoint
                });
            }
        }

        ecb.Playback(state.EntityManager);
        ecb.Dispose();
    }
}
```

For parallel jobs, use `EntityCommandBuffer.ParallelWriter` with a sort key (typically the entity index) to ensure deterministic playback order.

---

## Baking: Converting GameObjects to Entities

**Bakers** are the bridge between the familiar GameObject editor workflow and the ECS runtime. A Baker reads MonoBehaviour authoring data at edit time and produces ECS components:

```csharp
// Authoring component — lives on a GameObject in the editor.
// WHY separate authoring: designers use the Inspector to set values on
// GameObjects; Bakers convert that into ECS data at build time.
// The authoring component is NEVER present at runtime.
public class SpawnerAuthoring : MonoBehaviour
{
    public GameObject Prefab;
    public float SpawnInterval = 2f;
    public Vector3 SpawnPoint;
}

// Baker — runs at build/bake time to convert authoring → ECS
public class SpawnerBaker : Baker<SpawnerAuthoring>
{
    public override void Bake(SpawnerAuthoring authoring)
    {
        // WHY TransformUsageFlags: tells the baking system which transform
        // components this entity needs. Dynamic = full LocalTransform.
        var entity = GetEntity(TransformUsageFlags.Dynamic);

        AddComponent(entity, new Spawner
        {
            // GetEntity converts a GameObject prefab reference into an Entity prefab
            Prefab = GetEntity(authoring.Prefab, TransformUsageFlags.Dynamic),
            Interval = authoring.SpawnInterval,
            Timer = authoring.SpawnInterval,
            SpawnPoint = authoring.SpawnPoint
        });
    }
}

// The runtime component — no reference to MonoBehaviour or GameObject
public struct Spawner : IComponentData
{
    public Entity Prefab;
    public float Interval;
    public float Timer;
    public float3 SpawnPoint;
}
```

---

## Managed vs Unmanaged Components

| Aspect | Unmanaged (`IComponentData` struct) | Managed (`class IComponentData`) |
|--------|--------------------------------------|----------------------------------|
| **Burst compatible** | Yes | No |
| **Job safe** | Yes | No (main thread only) |
| **Stored in chunks** | Yes (cache-friendly) | No (heap reference in chunk) |
| **Use case** | Almost everything | When you must hold managed refs (Texture2D, string) |

**Rule of thumb:** default to unmanaged. Use managed components only when interfacing with managed Unity APIs that have no unmanaged equivalent.

---

## Common Patterns

### Enableable Components (Toggling State Without Archetype Changes)

```csharp
// WHY enableable: adding/removing a component changes the entity's archetype,
// which moves it between chunks — expensive at scale. Enableable components
// let you toggle behavior without any structural change.
public struct Stunned : IComponentData, IEnableableComponent
{
    public float Duration;
}

// In a system:
foreach (var (stunned, entity) in SystemAPI.Query<RefRW<Stunned>>()
    .WithEntityAccess())
{
    stunned.ValueRW.Duration -= dt;
    if (stunned.ValueRW.Duration <= 0)
    {
        // Disable instead of remove — no chunk move, no archetype change
        SystemAPI.SetComponentEnabled<Stunned>(entity, false);
    }
}
```

### Singleton / Unique Components

```csharp
// A single entity with GameSettings — accessed like a global
public struct GameSettings : IComponentData
{
    public float Gravity;
    public int MaxEnemies;
}

// In a system — fast lookup, no iteration
ref var settings = ref SystemAPI.GetSingletonRW<GameSettings>().ValueRW;
settings.Gravity = 12f;
```

### Aspect: Grouping Component Access

```csharp
// WHY Aspects: systems that access 5+ components per entity get verbose.
// An Aspect bundles related component access into a reusable, named group.
public readonly partial struct CharacterAspect : IAspect
{
    public readonly RefRW<Position> Position;
    public readonly RefRW<Velocity> Velocity;
    public readonly RefRO<Health> Health;
    public readonly RefRO<MoveSpeed> MoveSpeed;

    public void ApplyMovement(float dt)
    {
        Position.ValueRW.Value += Velocity.ValueRO.Value * dt;
    }
}

// In a system — clean, readable iteration
foreach (var character in SystemAPI.Query<CharacterAspect>())
{
    character.ApplyMovement(dt);
}
```

---

## Migration Strategy: MonoBehaviour → DOTS

Migrating an entire project at once is impractical. Unity 6's roadmap supports **incremental adoption**:

1. **Identify the hot path** — profile first. If 10 000 enemies are your bottleneck but the UI runs fine, only convert the enemy system.
2. **Keep hybrid** — GameObjects and Entities coexist. Use SubScene for ECS content and regular Scenes for MonoBehaviour content.
3. **Bakers bridge the gap** — author in GameObjects (designers keep their workflow), bake to ECS at build time.
4. **Start with read-only systems** — convert queries that just read data (e.g., spatial lookups, distance checks) before tackling write-heavy systems.
5. **Use `SystemBase` for prototyping** — it allows managed code (easier debugging). Switch to `ISystem` + Burst when correctness is proven.

### When to Use DOTS vs. MonoBehaviour

| Scenario | Recommendation |
|----------|---------------|
| 10 000+ similar entities (bullets, particles, crowd) | **DOTS** — linear memory, parallel jobs |
| Unique game managers, UI controllers | **MonoBehaviour** — one-off objects don't benefit from data-oriented layout |
| Complex physics simulation | **DOTS** — Unity Physics package, deterministic, stateless |
| Rapid prototyping / game jams | **MonoBehaviour** — faster iteration, richer editor tooling |
| Performance-critical inner loops | **DOTS** — Burst + Jobs for 10–100× speedup |
| Third-party asset integration | **MonoBehaviour** — most Asset Store packages expect GameObjects |

---

## Performance Tips

1. **Burst everything** — add `[BurstCompile]` to every system and job. The overhead of *not* using Burst is enormous.
2. **Minimize structural changes** — prefer `IEnableableComponent` over add/remove. Batch structural changes via ECB.
3. **Use `RefRO<T>` over `RefRW<T>`** — read-only access enables more parallelism (no write dependencies).
4. **Profile with the Entities Profiler** — it shows chunk utilization, archetype fragmentation, and system timings.
5. **Avoid `EntityManager` in hot paths** — use `SystemAPI` or jobs instead; `EntityManager` calls are main-thread-only and sync-pointed.
6. **Keep components small** — large components waste chunk space. Split rarely-used fields into separate components.
7. **Prefer `IJobEntity` over `IJobChunk`** — `IJobEntity` auto-generates chunk iteration boilerplate; `IJobChunk` is only needed for advanced chunk-level control.

---

## Package Dependencies

```json
// Minimum packages for a DOTS project in Unity 6
{
  "com.unity.entities": "1.3.x",          // Core ECS
  "com.unity.entities.graphics": "1.3.x",  // ECS rendering (Hybrid Renderer)
  "com.unity.physics": "1.3.x",            // Stateless physics for ECS
  "com.unity.burst": "1.8.x",              // LLVM compiler
  "com.unity.collections": "2.4.x",        // NativeArray, NativeList, etc.
  "com.unity.mathematics": "1.3.x"         // float3, quaternion, math functions
}
```

---

## Quick Reference

| Task | API |
|------|-----|
| Create entity | `EntityManager.CreateEntity(archetype)` or `ecb.CreateEntity()` |
| Add component | `EntityManager.AddComponent<T>(entity)` or `ecb.AddComponent<T>(entity)` |
| Get component | `SystemAPI.GetComponent<T>(entity)` |
| Query entities | `SystemAPI.Query<RefRW<T>>()` |
| Get singleton | `SystemAPI.GetSingleton<T>()` |
| Schedule job | `new MyJob { ... }.ScheduleParallel()` |
| Toggle component | `SystemAPI.SetComponentEnabled<T>(entity, bool)` |
| Instantiate prefab | `EntityManager.Instantiate(prefabEntity)` |

---

## Further Reading

- [Unity ECS Manual (6000.x)](https://docs.unity3d.com/6000.3/Documentation/Manual/com.unity.entities.html)
- [Entities Package Docs](https://docs.unity3d.com/Packages/com.unity.entities@latest/)
- [Unity DOTS Samples (GitHub)](https://github.com/Unity-Technologies/EntityComponentSystemSamples)
- [ECS Development Status](https://discussions.unity.com/t/ecs-development-status-december-2025/1699284)
