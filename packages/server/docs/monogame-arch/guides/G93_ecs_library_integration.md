# G93 — ECS Library Integration (Arch & Frent)

> **Category:** guide · **Engine:** MonoGame · **Related:** [G10 Custom Game Systems](./G10_custom_game_systems.md) · [G12 Design Patterns](./G12_design_patterns.md) · [G18 Game Programming Patterns](./G18_game_programming_patterns.md) · [G67 Object Pooling](./G67_object_pooling.md) · [G77 ECS Event & Messaging](./G77_ecs_event_messaging.md) · [G88 Dependency Injection](./G88_dependency_injection.md)

How to integrate dedicated C# ECS libraries into a MonoGame project. Covers the two dominant storage strategies (archetype vs. sparse set), practical setup with **Arch** and **Frent**, component design, system authoring, and choosing the right library for your game's entity/component profile.

---

## Why a Dedicated ECS Library?

MonoGame has no built-in ECS. Many projects roll their own with lists of game objects and component dictionaries. That works for small games, but falls apart at scale:

```
❌ O(n) component lookups on every frame
❌ Poor cache locality — components scattered across heap
❌ No structural change batching — adding/removing components mid-frame causes bugs
❌ Manual iteration boilerplate for every system
```

Dedicated ECS libraries solve these problems with data-oriented storage, compiled queries, and safe structural change APIs.

---

## Archetype vs. Sparse Set: The Core Trade-off

Every ECS library picks one of two storage strategies (or a hybrid). Understanding the trade-off helps you choose the right library for your game.

### Archetype Storage

Entities with the same set of component types are stored together in contiguous memory blocks called **archetypes**. A query for `(Position, Velocity)` iterates a dense array — no gaps, perfect cache locality.

```
Archetype [Position, Velocity, Sprite]
┌──────────┬──────────┬──────────┐
│ Pos[0]   │ Vel[0]   │ Spr[0]   │  ← Entity A
│ Pos[1]   │ Vel[1]   │ Spr[1]   │  ← Entity B
│ Pos[2]   │ Vel[2]   │ Spr[2]   │  ← Entity C
└──────────┴──────────┴──────────┘
```

| Strength | Weakness |
|----------|----------|
| Blazing iteration — components are contiguous | Adding/removing components moves the entity to a new archetype (structural change cost) |
| Cache-friendly for systems that touch many entities | Many unique component combos = many small archetypes (fragmentation) |

**Best for:** Games with many similar entities iterated every frame (bullets, particles, NPCs with uniform component sets).

### Sparse Set Storage

Each component type has its own dense array. A sparse indirection array maps entity IDs to dense indices. Iteration per-component is fast; multi-component queries require intersecting index sets.

```
Sparse[Position]           Dense[Position]
┌───┬───┬───┬───┬───┐     ┌──────────┐
│ 2 │ - │ 0 │ - │ 1 │     │ Pos[A]   │  index 0
└───┴───┴───┴───┴───┘     │ Pos[C]   │  index 1
  Entity IDs: 0..4         │ Pos[E]   │  index 2
                            └──────────┘
```

| Strength | Weakness |
|----------|----------|
| Adding/removing components is O(1) — no data movement | Multi-component queries require set intersection |
| Entities can have any component combo cheaply | Less cache-friendly when iterating multiple components together |

**Best for:** Games where entities frequently gain/lose components at runtime (RPGs with dynamic buff/debuff systems, sandbox games with composable behaviors).

---

## Library Overview

### Arch (Archetype + Chunks)

**NuGet:** `Arch` · **License:** Apache-2.0 · **Min .NET:** 7.0+

Arch is the most popular C# archetype ECS. It stores entities in chunked archetype tables and uses source-generated queries for zero-allocation iteration.

```bash
dotnet add package Arch
```

### Frent (Hybrid Archetype + Sparse Set)

**NuGet:** `Frent` · **License:** MIT · **Min .NET:** 8.0+

Frent combines both strategies — archetypes for iteration, sparse sets for per-entity component access. Benchmarks show it outperforming most C# ECS implementations in both iteration and structural changes.

```bash
dotnet add package Frent
```

---

## Arch: Setup & Integration

### World Creation

```csharp
using Arch.Core;
using Arch.Core.Extensions;

public class Game1 : Game
{
    private World _world = null!;

    protected override void Initialize()
    {
        base.Initialize();
        // Create the ECS world — this is the container for all entities
        _world = World.Create();
    }

    protected override void OnExiting(object sender, ExitingEventArgs args)
    {
        // Arch worlds must be explicitly destroyed to free native memory
        World.Destroy(_world);
        base.OnExiting(sender, args);
    }
}
```

### Component Design

Components in Arch are plain structs. Keep them small and data-only — no methods, no references to other components.

```csharp
// ✅ Good: small, data-only, cache-friendly
public struct Position { public float X, Y; }
public struct Velocity { public float X, Y; }
public struct Sprite  { public int AtlasIndex; public Rectangle Source; }
public struct Health  { public int Current, Max; }

// Tag components — zero-size structs used for filtering
public struct IsPlayer;
public struct IsEnemy;
public struct MarkedForDestroy;
```

> **Why structs?** Structs are stored inline in the archetype array. Class components would scatter data across the heap, destroying the cache locality that makes ECS fast.

### Creating Entities

```csharp
// Spawn a player entity with components
var player = _world.Create(
    new Position { X = 100, Y = 200 },
    new Velocity { X = 0, Y = 0 },
    new Sprite { AtlasIndex = 0, Source = new Rectangle(0, 0, 32, 32) },
    new Health { Current = 100, Max = 100 },
    new IsPlayer()
);

// Spawn 1000 enemies in a batch — Arch optimizes bulk creation
for (int i = 0; i < 1000; i++)
{
    _world.Create(
        new Position { X = Random.Shared.Next(800), Y = Random.Shared.Next(600) },
        new Velocity { X = 1f, Y = 0f },
        new Sprite { AtlasIndex = 1, Source = new Rectangle(32, 0, 32, 32) },
        new Health { Current = 30, Max = 30 },
        new IsEnemy()
    );
}
```

### Writing Systems with Queries

Arch uses `QueryDescription` to define which entities a system operates on. The `World.Query` method iterates matching archetypes.

```csharp
public static class MovementSystem
{
    // Define the query once — reuse every frame
    private static readonly QueryDescription Query = new QueryDescription()
        .WithAll<Position, Velocity>();

    public static void Update(World world, float dt)
    {
        // Inline query — the lambda receives refs to each component
        world.Query(in Query, (ref Position pos, ref Velocity vel) =>
        {
            pos.X += vel.X * dt;
            pos.Y += vel.Y * dt;
        });
    }
}
```

### Structural Changes (Add/Remove Components)

Structural changes move entities between archetypes. Arch uses a **command buffer** to defer these changes, preventing iteration invalidation.

```csharp
public static class DestroySystem
{
    private static readonly QueryDescription Query = new QueryDescription()
        .WithAll<MarkedForDestroy>();

    public static void Update(World world)
    {
        // Collect entities to destroy, then destroy after iteration
        var buffer = new CommandBuffer(world);

        world.Query(in Query, (Entity entity) =>
        {
            buffer.Destroy(entity);
        });

        // Apply all buffered changes at once — safe, no iterator invalidation
        buffer.Playback();
        buffer.Dispose();
    }
}
```

### MonoGame Game Loop Integration

Wire ECS systems into MonoGame's `Update` and `Draw` methods:

```csharp
protected override void Update(GameTime gameTime)
{
    float dt = (float)gameTime.ElapsedGameTime.TotalSeconds;

    // Order matters — input before movement before collision before cleanup
    InputSystem.Update(_world, _inputMap);
    MovementSystem.Update(_world, dt);
    CollisionSystem.Update(_world);
    HealthSystem.Update(_world);
    DestroySystem.Update(_world);

    base.Update(gameTime);
}

protected override void Draw(GameTime gameTime)
{
    GraphicsDevice.Clear(Color.CornflowerBlue);

    _spriteBatch.Begin(samplerState: SamplerState.PointClamp);
    RenderSystem.Draw(_world, _spriteBatch, _atlas);
    _spriteBatch.End();

    base.Draw(gameTime);
}
```

---

## Frent: Setup & Integration

Frent's API is similar but uses generic type parameters instead of query descriptions.

### World and Entity Creation

```csharp
using Frent;

public class Game1 : Game
{
    private World _world = null!;

    protected override void Initialize()
    {
        base.Initialize();
        _world = new World();
    }

    protected override void LoadContent()
    {
        // Frent uses a fluent builder for entity creation
        _world.Spawn(
            new Position { X = 100, Y = 200 },
            new Velocity { X = 0, Y = 0 },
            new Health { Current = 100, Max = 100 }
        );
    }
}
```

### System Iteration

```csharp
// Frent query — iterate all entities with Position and Velocity
_world.Query((ref Position pos, ref Velocity vel) =>
{
    pos.X += vel.X * dt;
    pos.Y += vel.Y * dt;
});
```

---

## Choosing Between Them

| Factor | Arch | Frent |
|--------|------|-------|
| Storage model | Pure archetype + chunks | Hybrid archetype + sparse set |
| Iteration speed (many entities) | Excellent | Excellent |
| Structural change cost | Moderate (entity moves between archetypes) | Low (sparse set handles component add/remove cheaply) |
| Maturity / community | Larger community, more examples | Newer, smaller community |
| Minimum .NET | 7.0 | 8.0 |
| Source generation | Yes (optional, for perf) | Yes |
| MonoGame community adoption | High — recommended on MonoGame forums | Growing — active MonoGame integration examples |

### Decision Heuristic

- **Mostly uniform entities** (bullet hell, tower defense, particles) → **Arch**. Archetype iteration is fastest when entities share component sets.
- **Highly dynamic entities** (RPG with many buff/debuff/equipment components added/removed per frame) → **Frent**. Sparse-set hybrid handles structural changes with less overhead.
- **Unsure?** Start with **Arch** — larger community, more tutorials, and the structural change cost only matters at high churn rates (thousands of add/remove per frame).

---

## Component Design Guidelines

```csharp
// ✅ DO: Small structs, value types, plain data
public struct Position { public float X, Y; }
public struct DamageOnContact { public int Amount; }

// ✅ DO: Tag components for filtering (zero-size)
public struct IsPlayer;
public struct Poisoned;

// ⚠️ CAREFUL: Reference types in components break cache locality
// Use only when necessary (e.g., storing a Texture2D reference for rendering)
public struct SpriteRef { public Texture2D Texture; public Rectangle Source; }

// ❌ DON'T: Logic in components — systems own the behavior
// ❌ DON'T: Massive components — split into smaller pieces
// ❌ DON'T: Optional fields with "IsEnabled" flags — use tag components instead
```

---

## Shared Resources (Non-Entity Data)

Both libraries support world-level resources for data that isn't per-entity (e.g., input state, camera position, delta time):

```csharp
// Arch — add/get resources on the world
_world.AddResource(new GameTime());
_world.AddResource(new InputState { ActionMap = _inputMap });

// Inside a system:
ref var input = ref world.GetResource<InputState>();
```

This avoids passing extra parameters to every system and keeps the ECS as the single source of truth.

---

## Performance Tips

1. **Minimize structural changes during iteration.** Use command buffers to defer `Create`, `Destroy`, `Add`, and `Remove` operations.
2. **Keep components small.** The fewer bytes per component, the more entities fit in a CPU cache line.
3. **Query once, reuse.** Create `QueryDescription` objects as static fields — don't allocate them every frame.
4. **Batch entity creation.** When spawning many entities (e.g., a particle burst), use bulk-create APIs.
5. **Profile before optimizing.** Arch's built-in diagnostics can show archetype fragmentation and query times.

---

## Gotchas

| Issue | Solution |
|-------|----------|
| Modifying components during `Query` iteration crashes | Use command buffers for structural changes; direct component mutation (`ref`) is safe |
| Too many unique archetypes (fragmentation) | Reduce optional components; use tag components sparingly; consider Frent's hybrid model |
| Draw order not deterministic | Add a `SortLayer` component and sort before rendering, or use separate queries per layer |
| Arch world leaks native memory | Always call `World.Destroy()` in `OnExiting` |
| Components with managed references (strings, arrays) | These work but reduce cache benefits; prefer fixed-size structs when possible |

---

## Summary

A dedicated ECS library replaces ad-hoc game object lists with a data-oriented architecture that scales to thousands of entities. **Arch** provides best-in-class archetype iteration and is the safe default for MonoGame projects. **Frent** offers a hybrid model better suited to games with frequent structural changes. Both integrate cleanly into MonoGame's `Update`/`Draw` loop — systems are plain static methods, components are plain structs, and the world is the single owner of all game state.
