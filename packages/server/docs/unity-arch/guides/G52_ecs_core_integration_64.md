# G52 — ECS Core Integration (Unity 6.4+)

> **Category:** guide · **Engine:** Unity 6.4+ (Entities 1.4, Collections 6.4) · **Related:** [G13 ECS & DOTS](G13_ecs_dots.md) · [G42 Burst Compiler](G42_burst_compiler_jobs_system.md) · [G44 Unity 6 Migration](G44_unity6_migration_new_features.md) · [G51 CoreCLR Migration](G51_coreclr_dotnet_modernization.md) · [Unity Rules](../unity-arch-rules.md)

Starting with Unity 6.4 (March 2026), the Entity Component System packages — Entities, Collections, Mathematics, and Entities Graphics — ship as **core engine packages** integrated directly into the Unity Editor. This is the most significant change to ECS since its 1.0 graduation, and it signals the beginning of Unity's long-term plan to unify the GameObject and Entity worlds. This guide covers what changed, what's new, and how to take advantage of ECS as a first-class citizen.

---

## What Changed in 6.4

### Core Package Promotion

Before 6.4, ECS packages were installed via the Package Manager as optional add-ons. Now:

| Package | Old Status | New Status (6.4+) |
|---------|-----------|-------------------|
| `com.unity.entities` (1.4+) | Optional, verified | **Core** — ships with editor |
| `com.unity.collections` (6.4) | Optional, verified | **Core** — ships with editor |
| `com.unity.mathematics` | Optional, verified | **Core** — ships with editor |
| `com.unity.entities.graphics` | Optional, verified | **Core** — ships with editor |

**Practical impact:**
- ECS is always available — no need to install packages for new projects
- Entities show up in the Hierarchy and Inspector by default (no separate Entities window required)
- Project Auditor (also now built-in) includes ECS-specific performance checks
- Documentation is integrated into the main Unity manual

### EntityId Replaces InstanceID

Unity 6.4 introduces `EntityId` as the preferred identifier for entities, deprecating `InstanceID`-based identification for ECS objects:

```csharp
// DEPRECATED in 6.4: Using InstanceID for entity references
int id = entityManager.GetComponentData<EntityIdentifier>(entity).InstanceId;

// PREFERRED: Use EntityId — the native entity identifier
// WHY: EntityId is purpose-built for the entity system and will expand
// to 8 bytes in Unity 6.5 to support larger worlds (>2M concurrent entities).
EntityId entityId = entity.Id;

// EntityId provides version checking to detect stale references
if (entityManager.Exists(entity))
{
    // Safe to access — entity hasn't been destroyed and recycled
    var health = entityManager.GetComponentData<Health>(entity);
}
```

> **Breaking change in 6.5:** `EntityId` expands from 4 bytes to 8 bytes. Code that casts `EntityId` to `int` or stores it in 4-byte fields will break. Use `EntityId` as an opaque type — never assume its size.

### URP Compatibility Mode Removal

Unity 6.4 fully removes the URP compatibility mode for custom render passes. All custom rendering must use the Render Graph API. This affects ECS projects that used custom entity rendering passes:

```csharp
// REMOVED in 6.4: Legacy ScriptableRenderPass.Execute() 
// (compatibility mode no longer available)

// REQUIRED: Use RecordRenderGraph with Render Graph API
// See G39 for full Render Graph patterns
public class EntityHighlightPass : ScriptableRenderPass
{
    public override void RecordRenderGraph(RenderGraph renderGraph,
        ContextContainer frameData)
    {
        // WHY: Render Graph manages resource lifetimes and enables
        // automatic pass merging — critical for ECS scenes with many
        // draw calls hitting the GPU Resident Drawer.
        using var builder = renderGraph.AddRasterRenderPass<PassData>(
            "EntityHighlight", out var passData);
        
        // Declare resources...
        builder.SetRenderFunc<PassData>(static (data, context) =>
        {
            // Emit GPU commands here (MUST be static)
        });
    }
}
```

---

## The Unification Roadmap: GameObjects + Entities

Unity's long-term vision is to eliminate the wall between GameObjects and Entities. Here's the roadmap as of early 2026:

| Phase | Version | What Happens |
|-------|---------|-------------|
| **Core integration** | 6.4 ✅ | ECS packages ship with editor; shared tooling |
| **Unified transforms** | 6.5–6.6 | `LocalTransform` (ECS) and `Transform` (GameObject) share the same underlying data |
| **ECS components on GameObjects** | 6.6–6.7 | Attach `IComponentData` structs directly to GameObjects without creating entities |
| **Full convergence** | 6.8+ | Single data model; GameObjects become a convenience layer over entities |

### What Unified Transforms Mean

Today, if you have a hybrid project (GameObjects + ECS), you must manually sync transform data between the two systems using `CompanionLink` or baking:

```csharp
// CURRENT (6.4): Baking a GameObject's transform into an ECS entity
// This runs at build time / during subscene baking
public class EnemyBaker : Baker<EnemyAuthoring>
{
    public override void Bake(EnemyAuthoring authoring)
    {
        var entity = GetEntity(TransformUsageFlags.Dynamic);
        
        // WHY: Baker copies the GameObject transform into LocalTransform.
        // At runtime, the entity's transform is independent — changes to
        // one do NOT affect the other.
        AddComponent(entity, new EnemyTag());
        AddComponent(entity, new MoveSpeed { Value = authoring.speed });
    }
}

// FUTURE (6.5–6.6): Unified transforms will share the same data buffer.
// A system moving an entity will move the visual GameObject without
// explicit sync — the transform IS the same memory.
```

### Incremental Adoption Strategy

The unification is designed so you can adopt ECS incrementally without rewriting your project:

**Phase 1 — Performance hotspots only (recommended starting point):**
- Keep game logic in MonoBehaviours
- Move performance-critical inner loops to ECS systems (enemy AI for 1000+ agents, bullet simulation, terrain queries)
- Use baking to convert authored GameObjects into entities at build time

**Phase 2 — Hybrid runtime:**
- Use `CompanionLink` to keep a GameObject visual representation alongside entity data
- MonoBehaviour "orchestrator" scripts drive high-level game flow
- ECS systems handle all simulation (physics, movement, damage)

**Phase 3 — Entity-first (after unified transforms ship):**
- Author everything as entities
- Use GameObjects only where required (UI Toolkit documents, third-party integrations)
- This is where the full performance benefits of data-oriented design pay off

---

## New ECS Patterns in 6.4

### Using Project Auditor for ECS

Project Auditor is now built into the editor and includes ECS-specific diagnostics:

```
// Access via: Window → Analysis → Project Auditor
// 
// ECS-specific checks include:
// - Systems with high structural changes (AddComponent/RemoveComponent in hot loops)
// - Queries that touch too many archetypes (fragmentation)
// - Missing [BurstCompile] on ISystem.OnUpdate
// - Entities.ForEach usage (deprecated pattern)
// - Component data layout inefficiencies (padding waste)
```

### Runtime Sprite Atlases (2D + ECS)

Unity 6.4 adds `SpriteAtlasManager.CreateSpriteAtlas` for runtime atlas generation — useful for procedural 2D games using ECS:

```csharp
// NEW in 6.4: Create sprite atlases at runtime
// WHY: Procedural 2D games (roguelikes, tile-based) can generate
// sprite atlases dynamically based on loaded content, reducing
// draw calls for ECS-rendered sprites.
var atlas = SpriteAtlasManager.CreateSpriteAtlas(
    sprites: collectedSprites,
    padding: 2,
    maxSize: 2048
);
```

### Improved Animation Entry Transitions

Unity 6.4's "Evaluate Entry Transitions On Start" option fixes the one-frame delay when Animator controllers first activate — relevant for ECS hybrid projects where entities spawn with animation:

```csharp
// In the Animator Controller:
// Settings → "Evaluate Entry Transitions On Start" = true
//
// WHY: When an entity with a CompanionLink spawns its visual
// GameObject at runtime, the Animator previously showed one frame
// of the default state before transitioning. This option eliminates
// that visual glitch.
```

---

## Querying Entities: Modern Patterns

Unity 6.4 continues to prefer `SystemAPI.Query` over the deprecated `Entities.ForEach`. Here are current best practices:

### Basic Query with Multiple Components

```csharp
[BurstCompile]
public partial struct DamageSystem : ISystem
{
    [BurstCompile]
    public void OnUpdate(ref SystemState state)
    {
        // WHY: SystemAPI.Query is source-generated at compile time,
        // producing optimal iteration code. RefRW = read-write,
        // RefRO = read-only (allows parallel scheduling).
        foreach (var (health, damage, entity) in
            SystemAPI.Query<RefRW<Health>, RefRO<DamageBuffer>>()
                .WithEntityAccess())
        {
            health.ValueRW.Current -= damage.ValueRO.Amount;
            
            if (health.ValueRW.Current <= 0)
            {
                // WHY: Structural changes (destroying entities) can't happen
                // during iteration. Use an ECB to defer them.
                var ecb = SystemAPI.GetSingleton<EndSimulationEntityCommandBufferSystem.Singleton>()
                    .CreateCommandBuffer(state.WorldUnmanaged);
                ecb.DestroyEntity(entity);
            }
        }
    }
}
```

### Shared Component Filtering

```csharp
// WHY: Shared components (ISharedComponentData) partition entities
// into separate chunks by value. Filtering by shared component
// skips entire chunks, making it very efficient for faction/team queries.
foreach (var (transform, speed) in
    SystemAPI.Query<RefRW<LocalTransform>, RefRO<MoveSpeed>>()
        .WithSharedComponentFilter(new TeamId { Value = 1 }))
{
    // Only processes entities on Team 1 — other chunks are never touched
    transform.ValueRW.Position += new float3(speed.ValueRO.Value, 0, 0)
        * SystemAPI.Time.DeltaTime;
}
```

### Enableable Components (Zero-Cost Toggling)

```csharp
// WHY: IEnableableComponent lets you toggle a component on/off
// without structural changes (no archetype move, no chunk defragmentation).
// Ideal for temporary states like "stunned" or "on fire".
public struct Stunned : IComponentData, IEnableableComponent { }

// Toggle stun ON — no structural change, instant, Burst-compatible
SystemAPI.SetComponentEnabled<Stunned>(entity, true);

// Query only stunned entities
foreach (var (transform, entity) in
    SystemAPI.Query<RefRO<LocalTransform>>()
        .WithAll<Stunned>()  // Only matches entities where Stunned is enabled
        .WithEntityAccess())
{
    // Process stunned entities
}
```

---

## Migration from Entities 1.3 → 1.4 (Core)

If your project already uses ECS, the 6.4 upgrade is mostly seamless. Watch for these changes:

1. **`InstanceID` → `EntityId`:** Replace any code that uses `InstanceID` for entity identification. The compiler will emit deprecation warnings.

2. **Package versions lock to editor version:** Since ECS is now a core package, you can't pin an older version. Test your project against the exact Entities version shipping with your Unity version.

3. **Collections 6.4 changes:** `NativeList`, `NativeHashMap`, and other collection types may have minor API adjustments. Check the [Collections 6.4 changelog](https://docs.unity3d.com/Packages/com.unity.collections@6.4/changelog/CHANGELOG.html).

4. **Entities Graphics:** Now renders through the standard URP/HDRP pipeline without the separate Entities Graphics setup window. Ensure your entity materials use URP/HDRP shaders (never Built-in RP).

---

## Performance Rules for ECS in 6.4

1. **Always add `[BurstCompile]` to `ISystem` structs and their `OnUpdate`** — missing Burst means 10–100× slower iteration
2. **Minimize structural changes in simulation** — use `IEnableableComponent` for toggles, `DynamicBuffer<T>` for variable-size data, and ECBs for deferred creation/destruction
3. **Keep components small** — components larger than 128 bytes waste chunk space; split into multiple components
4. **Use `WithNone<T>()` and `WithAll<T>()` tag filters** — tag components (empty `IComponentData` structs) are free in memory and enable powerful query filtering
5. **Profile with the built-in Project Auditor** — it now detects ECS anti-patterns automatically
6. **Prefer `SystemAPI.Query` over `EntityQuery` + `ToComponentDataArray`** — the latter allocates a managed array; `SystemAPI.Query` iterates chunks directly

---

## Further Reading

- [Unity ECS Documentation](https://docs.unity3d.com/Packages/com.unity.entities@1.4/manual/index.html) — Official Entities 1.4 manual
- [ECS Development Status (December 2025)](https://discussions.unity.com/t/ecs-development-status-december-2025/1699284) — Unity's roadmap update
- [Unity 6.4 What's New](https://docs.unity3d.com/6000.4/Documentation/Manual/WhatsNewUnity64.html) — Full release notes
- [G13 ECS & DOTS](G13_ecs_dots.md) — Foundational ECS guide (core concepts, baking, jobs)
