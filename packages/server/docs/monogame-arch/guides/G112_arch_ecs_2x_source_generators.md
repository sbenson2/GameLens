# G112 — Arch ECS 2.x: Source Generators, Bulk Operations & Event Bus

> **Category:** guide · **Engine:** MonoGame · **Related:** [G93 ECS Library Integration (Arch & Frent)](./G93_ecs_library_integration.md) · [G77 ECS Event & Messaging](./G77_ecs_event_messaging.md) · [G67 Object Pooling](./G67_object_pooling.md) · [G13 C# Performance](./G13_csharp_performance.md) · [G99 Source Generators & AOT Serialization](./G99_source_generators_aot_serialization.md) · [G81 NativeAOT Publishing](./G81_nativeaot_publishing.md)

Covers features introduced in **Arch 2.0–2.1**: the `Arch.System.SourceGenerator` for zero-boilerplate system authoring, bulk entity operations for high-performance spawning/destruction, the `Arch.Bus` EventBus for decoupled messaging, and `Arch.AOT` for NativeAOT-compatible serialization. All examples use MonoGame integration patterns consistent with the Arch ECS approach used throughout this knowledge base.

---

## Table of Contents

1. [Package Overview (Arch 2.x Ecosystem)](#1-package-overview-arch-2x-ecosystem)
2. [Source-Generated Systems](#2-source-generated-systems)
3. [Bulk Entity Operations](#3-bulk-entity-operations)
4. [Event Bus (Arch.Bus)](#4-event-bus-archbus)
5. [Relationships Between Entities](#5-relationships-between-entities)
6. [AOT Compatibility (Arch.AOT)](#6-aot-compatibility-archaot)
7. [Serialization (Arch.Persistence)](#7-serialization-archpersistence)
8. [Performance Patterns](#8-performance-patterns)
9. [Putting It Together: MonoGame Integration](#9-putting-it-together-monogame-integration)

---

## 1. Package Overview (Arch 2.x Ecosystem)

Arch ships as a set of focused NuGet packages. Install only what you need.

| Package | Version | Purpose |
|---------|---------|---------|
| `Arch` | 2.1.0 | Core ECS — worlds, entities, queries, command buffers |
| `Arch.System` | 2.1.0 | Base classes for systems (`BaseSystem<W, T>`) |
| `Arch.System.SourceGenerator` | 2.1.0 | Compile-time system code generation — eliminates query boilerplate |
| `Arch.Bus` | 2.1.0 | High-performance event bus with attribute-based subscriptions |
| `Arch.Extended.Relationships` | 2.1.0 | Parent-child and arbitrary relationships between entities |
| `Arch.Persistence` | 2.1.0 | JSON and binary serialization for entire worlds |
| `Arch.AOT` | 2.1.0 | Source-generated serialization for NativeAOT compatibility |
| `Arch.LowLevel` | 2.1.0 | Unmanaged arrays, handles — used internally, rarely needed directly |

### Installation

```bash
# Core + source-generated systems + event bus (recommended starting set)
dotnet add package Arch --version 2.1.0
dotnet add package Arch.System --version 2.1.0
dotnet add package Arch.System.SourceGenerator --version 2.1.0
dotnet add package Arch.Bus --version 2.1.0
```

> **Compatibility:** Arch 2.1 targets .NET Standard 2.1 and .NET 6/8. Works with MonoGame 3.8.2+ on all platforms.

---

## 2. Source-Generated Systems

The source generator eliminates manual query boilerplate. Instead of writing `World.Query(in desc, ...)` loops, you declare a partial method with parameters matching your component types. The generator writes the query for you.

### Before (Manual Query — Arch 1.x Style)

```csharp
public class MovementSystem : BaseSystem<World, GameTime>
{
    private readonly QueryDescription _query =
        new QueryDescription().WithAll<Position, Velocity>();

    public MovementSystem(World world) : base(world) { }

    public override void Update(in GameTime gameTime)
    {
        float dt = (float)gameTime.ElapsedGameTime.TotalSeconds;

        World.Query(in _query, (ref Position pos, ref Velocity vel) =>
        {
            pos.X += vel.X * dt;
            pos.Y += vel.Y * dt;
        });
    }
}
```

### After (Source-Generated — Arch 2.x)

```csharp
using Arch.Core;
using Arch.System;
using Arch.System.SourceGenerator;

/// <summary>
/// The [partial] keyword is required — the source generator adds
/// the query dispatch code to the other half of this class.
/// </summary>
public partial class MovementSystem : BaseSystem<World, GameTime>
{
    public MovementSystem(World world) : base(world) { }

    /// <summary>
    /// The generator creates a query for all entities with Position AND Velocity.
    /// Parameters map to components: ref = read-write, in = read-only.
    /// The [Query] attribute on the containing class marks it for generation.
    /// </summary>
    [Query]
    [All<Position, Velocity>]
    private void Move(ref Position pos, in Velocity vel)
    {
        float dt = (float)Data.ElapsedGameTime.TotalSeconds;
        pos.X += vel.X * dt;
        pos.Y += vel.Y * dt;
    }
}
```

### How It Works

1. The `[Query]` attribute marks the method for code generation.
2. `[All<Position, Velocity>]` specifies the query filter. You can also use `[Any<...>]` and `[None<...>]`.
3. Method parameters with `ref` become writable component references; `in` parameters are read-only.
4. The generator creates an `Update()` override that dispatches the query — you never write the query loop.
5. `Data` is a property from `BaseSystem<World, T>` that holds the `T` value passed to `Update()`.

### Filtering: All, Any, None

```csharp
// Process entities that have Position AND Velocity, but NOT Frozen
[Query]
[All<Position, Velocity>, None<Frozen>]
private void MoveUnfrozen(ref Position pos, in Velocity vel) { ... }

// Process entities that have Health AND (Poisoned OR Burning)
[Query]
[All<Health>, Any<Poisoned, Burning>]
private void ApplyDamageOverTime(ref Health hp) { ... }
```

### Accessing the Entity Reference

If you need the `Entity` handle (for deferred destruction, component addition, etc.), add it as the first parameter:

```csharp
[Query]
[All<Health>]
private void CheckDeath(Entity entity, in Health hp)
{
    if (hp.Current <= 0)
    {
        // Don't destroy during iteration — use a command buffer
        _commandBuffer.Destroy(entity);
    }
}
```

---

## 3. Bulk Entity Operations

Arch 2.x optimizes batch creation and destruction. This matters for particle systems, bullet-hell spawners, and level loading where you create hundreds or thousands of entities per frame.

### Bulk Creation

```csharp
// Pre-allocate space for 1000 entities with the same archetype.
// This is MUCH faster than calling World.Create() 1000 times because
// Arch allocates chunk memory once instead of potentially resizing
// on every Create call.
var archetype = new ComponentType[] { typeof(Position), typeof(Velocity), typeof(Sprite) };

// Reserve space — returns the range of entity slots allocated.
// Entities exist after this call but components have default values.
var entities = World.Reserve(archetype, 1000);

// Initialize component values in bulk using a query.
// This iterates the freshly created entities with perfect cache locality.
var initQuery = new QueryDescription().WithAll<Position, Velocity, Sprite>();
int index = 0;
World.Query(in initQuery, (ref Position pos, ref Velocity vel, ref Sprite spr) =>
{
    float angle = index * MathHelper.TwoPi / 1000f;
    pos.X = MathF.Cos(angle) * 200f;
    pos.Y = MathF.Sin(angle) * 200f;
    vel.X = MathF.Cos(angle) * 50f;
    vel.Y = MathF.Sin(angle) * 50f;
    spr.TextureId = ParticleTextureId;
    index++;
});
```

### Bulk Destruction

```csharp
// Destroy all entities matching a query in one operation.
// Far faster than iterating and destroying one by one.
var expiredQuery = new QueryDescription().WithAll<Expired>();
World.Destroy(in expiredQuery);
```

### Bulk Add/Remove Components

```csharp
// Add a component to all entities matching a query.
var allEnemies = new QueryDescription().WithAll<Enemy, Position>();
World.Add<Frozen>(in allEnemies);

// Remove a component from all matching entities.
World.Remove<Frozen>(in allEnemies);
```

### Performance Comparison

| Operation | Per-entity loop (1000 entities) | Bulk API |
|-----------|--------------------------------|----------|
| Create | ~0.8 ms | ~0.1 ms |
| Destroy | ~0.6 ms | ~0.05 ms |
| Add component | ~0.9 ms (structural change each) | ~0.15 ms |

> Timings are approximate and vary by hardware. The key insight: bulk operations amortize allocation and structural change costs.

---

## 4. Event Bus (Arch.Bus)

`Arch.Bus` provides a high-performance, allocation-free event bus. Events are structs dispatched by type. Receivers use the `[Event]` attribute.

### Defining Events

```csharp
// Events are simple structs — keep them small.
public readonly struct DamageEvent
{
    public Entity Target { get; init; }
    public float Amount { get; init; }
    public DamageType Type { get; init; }
}

public readonly struct EntityDestroyedEvent
{
    public Entity Entity { get; init; }
    public string Reason { get; init; }
}
```

### Subscribing to Events

```csharp
using Arch.Bus;

public partial class DamageEffectSystem : BaseSystem<World, GameTime>
{
    public DamageEffectSystem(World world) : base(world)
    {
        // Hook this instance into the global event bus.
        EventBus.Register(this);
    }

    /// <summary>
    /// The [Event] attribute marks this method as an event receiver.
    /// The parameter type determines which event it receives.
    /// Method is called synchronously when the event is published.
    /// </summary>
    [Event]
    private void OnDamage(ref DamageEvent e)
    {
        // Spawn a damage number particle at the target's position.
        if (World.Has<Position>(e.Target))
        {
            ref var pos = ref World.Get<Position>(e.Target);
            SpawnDamageNumber(pos, e.Amount);
        }
    }

    public override void Dispose()
    {
        // CRITICAL: Always unregister to prevent dangling references.
        EventBus.Unregister(this);
        base.Dispose();
    }
}
```

### Publishing Events

```csharp
[Query]
[All<Health, DamageQueue>]
private void ProcessDamage(Entity entity, ref Health hp, ref DamageQueue queue)
{
    while (queue.TryDequeue(out var damage))
    {
        hp.Current -= damage.Amount;

        // Publish to all registered listeners — synchronous, allocation-free.
        var evt = new DamageEvent
        {
            Target = entity,
            Amount = damage.Amount,
            Type = damage.Type
        };
        EventBus.Send(ref evt);
    }
}
```

### Instance vs. Static Event Bus

Arch.Bus supports both static (`EventBus.Send`) and instance-based event buses. For MonoGame scenes with separate worlds, prefer instance-based buses to prevent cross-scene event leakage:

```csharp
// Per-scene event bus — events stay within the scene boundary
public class BattleScene : Scene
{
    private readonly Arch.Bus.EventBus _localBus = new();

    protected override void Initialize()
    {
        var damageSystem = new DamageEffectSystem(World);
        _localBus.Register(damageSystem);
    }
}
```

---

## 5. Relationships Between Entities

`Arch.Extended.Relationships` adds typed relationships between entities — parent-child hierarchies, equipment slots, targeting links.

```csharp
using Arch.Relationships;

// Define relationship marker types.
public struct ParentOf { }
public struct EquippedIn
{
    public string Slot; // "MainHand", "OffHand", "Helmet", etc.
}

// Create a parent-child relationship.
var parent = World.Create(new Position { X = 0, Y = 0 }, new Transform());
var child = World.Create(new Position { X = 10, Y = 0 }, new Transform());
World.AddRelationship<ParentOf>(parent, child);

// Query entities with a specific relationship.
// Get all children of a parent:
var children = World.GetRelationships<ParentOf>(parent);
foreach (var childEntity in children)
{
    ref var childPos = ref World.Get<Position>(childEntity);
    // Update child position relative to parent...
}

// Equipment: player → weapon
var player = World.Create(new PlayerStats(), new Position());
var sword = World.Create(new Weapon { Damage = 10 }, new Sprite());
World.AddRelationship(player, new EquippedIn { Slot = "MainHand" }, sword);
```

> **Performance note:** Relationships use sparse storage internally. They're efficient for low-cardinality links (parent has 2-10 children) but not designed for thousands of relationships per entity.

---

## 6. AOT Compatibility (Arch.AOT)

If you publish with NativeAOT (see [G81](./G81_nativeaot_publishing.md)), Arch's reflection-based query dispatch won't work. `Arch.AOT` provides source-generated alternatives.

### Setup

```bash
dotnet add package Arch.AOT --version 2.1.0
```

### Usage

The AOT source generator inspects your `[Query]` attributes and generates fully static dispatch code with no reflection. This is automatic when both `Arch.System.SourceGenerator` and `Arch.AOT` are installed — no code changes needed.

### Verifying AOT Compatibility

```bash
# Publish with AOT and check for trim warnings
dotnet publish -c Release -r win-x64 /p:PublishAot=true

# If you see warnings about Arch types being trimmed, ensure Arch.AOT
# is installed and your systems use [Query] attributes (not manual
# World.Query lambdas, which use reflection).
```

### Fallback for Manual Queries

If you have manual `World.Query(in desc, (ref A, ref B) => ...)` calls, these use `Action` delegates resolved via reflection at runtime. For AOT:

```csharp
// ❌ May fail under AOT — lambda-based query uses reflection
World.Query(in query, (ref Position pos, ref Velocity vel) => { ... });

// ✅ AOT-safe — use the source-generated [Query] attribute instead
[Query]
[All<Position, Velocity>]
private void Move(ref Position pos, ref Velocity vel) { ... }
```

---

## 7. Serialization (Arch.Persistence)

`Arch.Persistence` saves and loads entire Arch worlds to JSON or binary. Useful for save/load systems (see [G69](./G69_save_load_serialization.md)).

```csharp
using Arch.Persistence;

// Save the world to a byte array (binary format — smaller, faster).
byte[] worldData = World.Serialize();

// Save to a file
File.WriteAllBytes("save.dat", worldData);

// Load into a new world
var loadedWorld = World.Create();
loadedWorld.Deserialize(File.ReadAllBytes("save.dat"));
```

### Selective Serialization

Not all components should be saved (render state, cached references). Use query filters to serialize only persistent data:

```csharp
// Only serialize entities that have the Persistent marker component.
var persistQuery = new QueryDescription().WithAll<Persistent>();
byte[] saveData = World.Serialize(in persistQuery);
```

### JSON Format (for Debugging)

```csharp
using Arch.Persistence.Json;

string json = World.SerializeToJson();
File.WriteAllText("save.json", json);

// Inspect the save file in any text editor — useful during development.
```

---

## 8. Performance Patterns

### Command Buffers for Thread-Safe Structural Changes

```csharp
using Arch.CommandBuffer;

public partial class SpawnSystem : BaseSystem<World, GameTime>
{
    private readonly CommandBuffer _buffer;

    public SpawnSystem(World world) : base(world)
    {
        _buffer = new CommandBuffer(world);
    }

    [Query]
    [All<Spawner, Position>]
    private void ProcessSpawners(in Spawner spawner, in Position pos)
    {
        if (spawner.ShouldSpawn)
        {
            // Record the creation — don't execute it during iteration.
            _buffer.Create(
                new Position { X = pos.X, Y = pos.Y },
                new Velocity { X = 0, Y = -100 },
                new Bullet { Damage = spawner.Damage }
            );
        }
    }

    public override void AfterUpdate(in GameTime t)
    {
        // Playback all recorded commands — creates entities in bulk.
        _buffer.Playback();
    }
}
```

### Parallel Queries (Multithreaded Iteration)

```csharp
// Arch supports parallel query dispatch for read-only or
// per-entity-independent operations.
var query = new QueryDescription().WithAll<Position, Velocity>();

World.ParallelQuery(in query, (ref Position pos, ref Velocity vel) =>
{
    pos.X += vel.X * dt;
    pos.Y += vel.Y * dt;
});
```

> **Thread safety rule:** Parallel queries are safe only when systems don't share mutable state and don't perform structural changes. Use command buffers for any create/destroy operations.

### Query Caching

```csharp
// Queries are compiled on first use and cached internally by Arch.
// There is no need to cache QueryDescription instances manually —
// Arch deduplicates them. However, storing them as fields avoids
// allocation of the description object each frame.
private static readonly QueryDescription MovementQuery =
    new QueryDescription().WithAll<Position, Velocity>();
```

---

## 9. Putting It Together: MonoGame Integration

A complete example showing Arch 2.x features in a MonoGame game loop:

```csharp
using Arch.Core;
using Arch.System;
using Arch.Bus;
using Microsoft.Xna.Framework;

public class GameplayScene : Scene
{
    private Group<GameTime> _systems = null!;

    protected override void Initialize()
    {
        // Create systems — order matters (input → logic → rendering).
        _systems = new Group<GameTime>(
            new InputSystem(World),
            new MovementSystem(World),
            new CollisionSystem(World),
            new DamageSystem(World),
            new DamageEffectSystem(World),
            new RenderSystem(World, Services.GraphicsDevice)
        );

        _systems.Initialize();
        SpawnInitialEntities();
    }

    private void SpawnInitialEntities()
    {
        // Bulk-create enemies using the Reserve pattern.
        var enemyArchetype = new ComponentType[]
        {
            typeof(Position), typeof(Velocity), typeof(Health),
            typeof(Enemy), typeof(Sprite)
        };
        World.Reserve(enemyArchetype, 50);

        // Initialize via query...
    }

    public override void Update(GameTime gameTime)
    {
        _systems.BeforeUpdate(in gameTime);
        _systems.Update(in gameTime);
        _systems.AfterUpdate(in gameTime);
    }

    public override void Draw(SpriteBatch spriteBatch, GameTime gameTime)
    {
        _systems.BeforeUpdate(in gameTime); // Render systems use BeforeUpdate for setup
        // Actual draw calls happen inside RenderSystem.Update
    }

    protected override void UnloadContent()
    {
        _systems.Dispose();
    }
}
```

---

## Summary

| Feature | Package | Key Benefit |
|---------|---------|-------------|
| Source-generated systems | `Arch.System.SourceGenerator` | Zero-boilerplate queries via `[Query]` attribute |
| Bulk operations | `Arch` (core) | 5–10x faster batch create/destroy/add/remove |
| Event bus | `Arch.Bus` | Allocation-free decoupled messaging |
| Relationships | `Arch.Extended.Relationships` | Typed entity-to-entity links (parent-child, equipment) |
| AOT support | `Arch.AOT` | NativeAOT publish without reflection |
| Serialization | `Arch.Persistence` | Save/load entire worlds to JSON or binary |
| Command buffers | `Arch` (core) | Thread-safe deferred structural changes |
| Parallel queries | `Arch` (core) | Multi-threaded system iteration |
