# G11 — ECS Architecture with MoonTools.ECS

> **Category:** guide · **Engine:** FNA · **Related:** [G01 Getting Started](./G01_getting_started.md) · [G05 Input Handling](./G05_input_handling.md) · [G10 Debugging & Profiling](./G10_debugging_profiling_performance.md)

How to structure FNA games using the Entity Component System pattern with MoonTools.ECS. Covers the core ECS concepts (entities, components, systems, filters), integration with the FNA game loop, practical patterns for movement, rendering, collision, and state machines, plus performance considerations. MoonTools.ECS was built for commercial FNA games (Samurai Gunn 2) and is the most battle-tested ECS library in the FNA ecosystem.

---

## Why ECS with FNA?

FNA provides low-level XNA-compatible APIs — SpriteBatch, GraphicsDevice, ContentManager — but no opinion on how to organize game objects. The traditional XNA approach uses deep class hierarchies (e.g., `GameObject → Character → Player`) which become brittle as gameplay complexity grows. Adding a `Poisoned` status to a `Player` that already inherits from `Character → Damageable → PhysicsBody` means touching every level of the hierarchy.

ECS solves this by decomposing game objects into:

- **Entities** — lightweight IDs (just integers) with no behavior
- **Components** — small, data-only structs attached to entities
- **Systems** — classes containing all logic, operating on entities that match a component filter

Adding "poisoned" becomes: attach a `Poisoned` component to any entity. A `PoisonSystem` handles the logic. No inheritance changes needed.

## Setting Up MoonTools.ECS

MoonTools.ECS is distributed as a Git submodule (no NuGet package). Add it alongside FNA in your project:

```bash
git submodule add https://github.com/MoonsideGames/MoonTools.ECS lib/MoonTools.ECS
```

Reference it in your `.csproj`:

```xml
<ItemGroup>
  <ProjectReference Include="lib/MoonTools.ECS/MoonTools.ECS.csproj" />
</ItemGroup>
```

MoonTools.ECS has zero external dependencies and compiles to a small library. It targets .NET 8+ and works with NativeAOT because it avoids reflection entirely.

## Core Concepts

### Components Are Unmanaged Structs

Components must be unmanaged value types — no class references, no strings, no arrays. This constraint enables cache-friendly storage and zero-allocation iteration:

```csharp
// Good: unmanaged struct, small, focused
public readonly record struct Position(float X, float Y);
public readonly record struct Velocity(float Dx, float Dy);
public readonly record struct SpriteIndex(int AtlasIndex, int FrameIndex);
public readonly record struct Health(int Current, int Max);

// Tag component: zero-size struct signals state
public readonly record struct IsPlayerControlled();
public readonly record struct IsPoisoned();
```

Design principle: each component represents **one** aspect of an entity. Position and velocity are separate because some entities have position but no velocity (static scenery), and systems that only need position shouldn't pay for velocity data.

### The World

The `World` is the central container for all entities and components. Create one per game state:

```csharp
using MoonTools.ECS;

public class MyGame : Game
{
    private World _world;

    protected override void Initialize()
    {
        _world = new World();
        base.Initialize();
    }
}
```

### Creating Entities

Entities are created through the `World` and return an `Entity` handle:

```csharp
var player = _world.CreateEntity();
_world.Set(player, new Position(100, 200));
_world.Set(player, new Velocity(0, 0));
_world.Set(player, new SpriteIndex(0, 0));
_world.Set(player, new Health(100, 100));
_world.Set(player, new IsPlayerControlled());
```

### Systems and Filters

Systems inherit from `MoonTools.ECS.System` and declare filters to find relevant entities:

```csharp
public class MovementSystem : MoonTools.ECS.System
{
    private readonly Filter _movableFilter;

    public MovementSystem(World world) : base(world)
    {
        _movableFilter = FilterBuilder
            .Include<Position>()
            .Include<Velocity>()
            .Build();
    }

    public override void Update(TimeSpan delta)
    {
        float dt = (float)delta.TotalSeconds;

        foreach (var entity in _movableFilter.Entities)
        {
            var pos = Get<Position>(entity);
            var vel = Get<Velocity>(entity);

            Set(entity, new Position(
                pos.X + vel.Dx * dt,
                pos.Y + vel.Dy * dt
            ));
        }
    }
}
```

Key points:
- `FilterBuilder.Include<T>()` means "only entities that have component T"
- `FilterBuilder.Exclude<T>()` means "skip entities that have component T"
- `Get<T>(entity)` reads a component; `Set(entity, value)` writes it
- Filters are evaluated efficiently — no per-frame allocation

### Manipulators (for Non-System Code)

If you need to create/modify entities outside a System (e.g., in a loading screen or factory method), use a `Manipulator`:

```csharp
public class EntityFactory : Manipulator
{
    public EntityFactory(World world) : base(world) { }

    public Entity CreateBullet(float x, float y, float dx, float dy)
    {
        var bullet = CreateEntity();
        Set(bullet, new Position(x, y));
        Set(bullet, new Velocity(dx, dy));
        Set(bullet, new SpriteIndex(3, 0));
        return bullet;
    }
}
```

## Integrating with the FNA Game Loop

Wire systems into FNA's `Update` and `Draw` cycle:

```csharp
public class MyGame : Game
{
    private World _world;
    private InputSystem _inputSystem;
    private MovementSystem _movementSystem;
    private CollisionSystem _collisionSystem;
    private SpriteRenderSystem _renderSystem;

    protected override void Initialize()
    {
        _world = new World();
        _inputSystem = new InputSystem(_world);
        _movementSystem = new MovementSystem(_world);
        _collisionSystem = new CollisionSystem(_world);
        _renderSystem = new SpriteRenderSystem(_world, GraphicsDevice);
        base.Initialize();
    }

    protected override void Update(GameTime gameTime)
    {
        var dt = gameTime.ElapsedGameTime;
        _inputSystem.Update(dt);
        _movementSystem.Update(dt);
        _collisionSystem.Update(dt);

        // FinishUpdate processes deferred entity destroy/create
        _world.FinishUpdate();
    }

    protected override void Draw(GameTime gameTime)
    {
        GraphicsDevice.Clear(Color.Black);
        _renderSystem.Update(gameTime.ElapsedGameTime);
        base.Draw(gameTime);
    }
}
```

**Important:** Call `_world.FinishUpdate()` at the end of your update cycle. Entity creation and destruction are deferred to avoid invalidating filters mid-iteration. `FinishUpdate()` commits all pending structural changes.

## Rendering System Pattern

Rendering systems read component data and draw using FNA's SpriteBatch:

```csharp
public class SpriteRenderSystem : MoonTools.ECS.System
{
    private readonly Filter _renderFilter;
    private readonly SpriteBatch _spriteBatch;
    private readonly Texture2D _atlas;

    public SpriteRenderSystem(World world, GraphicsDevice device)
        : base(world)
    {
        _spriteBatch = new SpriteBatch(device);
        _renderFilter = FilterBuilder
            .Include<Position>()
            .Include<SpriteIndex>()
            .Build();
    }

    public override void Update(TimeSpan delta)
    {
        _spriteBatch.Begin(
            SpriteSortMode.Deferred,
            BlendState.AlphaBlend,
            SamplerState.PointClamp);

        foreach (var entity in _renderFilter.Entities)
        {
            var pos = Get<Position>(entity);
            var sprite = Get<SpriteIndex>(entity);
            var srcRect = GetSourceRect(sprite);

            _spriteBatch.Draw(_atlas, new Vector2(pos.X, pos.Y), srcRect, Color.White);
        }

        _spriteBatch.End();
    }

    private Rectangle GetSourceRect(SpriteIndex sprite)
    {
        const int TileSize = 16;
        return new Rectangle(
            sprite.FrameIndex * TileSize,
            sprite.AtlasIndex * TileSize,
            TileSize, TileSize);
    }
}
```

## Relations: Entity-to-Entity Connections

MoonTools.ECS supports typed relations between entities — useful for parent/child hierarchies, targeting, inventory slots, etc.:

```csharp
// Define a relation type
public readonly record struct ChildOf();
public readonly record struct EquippedBy();

// In a system or manipulator:
Relate(childEntity, parentEntity, new ChildOf());
Relate(swordEntity, playerEntity, new EquippedBy());

// Query relations:
foreach (var (child, parent) in Relations<ChildOf>())
{
    // Process parent-child pairs
}

// Check if a specific relation exists:
if (HasOutRelation<EquippedBy>(swordEntity))
{
    var wielder = OutRelationSingleton<EquippedBy>(swordEntity);
}
```

## Tag Components for State Machines

Use zero-size tag components instead of enums for entity state. This lets systems filter by state without checking fields:

```csharp
// State tags
public readonly record struct IsIdle();
public readonly record struct IsRunning();
public readonly record struct IsAttacking();

// Transition: remove old state, add new state
public void StartAttacking(Entity entity)
{
    Remove<IsIdle>(entity);
    Remove<IsRunning>(entity);
    Set(entity, new IsAttacking());
}

// Systems only process entities in their relevant state
public class AttackSystem : MoonTools.ECS.System
{
    private readonly Filter _attackingFilter;

    public AttackSystem(World world) : base(world)
    {
        _attackingFilter = FilterBuilder
            .Include<IsAttacking>()
            .Build();
    }

    public override void Update(TimeSpan delta)
    {
        foreach (var entity in _attackingFilter.Entities)
        {
            // Only processes entities currently attacking
        }
    }
}
```

## Performance Characteristics

MoonTools.ECS is designed for cache-friendly access:

- Components of the same type are stored contiguously in memory
- Filter iteration traverses packed arrays — no dictionary lookups per entity
- Zero-size tag components have no per-entity storage cost
- Entity creation/destruction is O(1) amortized (deferred and batched)
- No reflection, no boxing, no GC pressure during gameplay

For a typical 2D FNA game (hundreds to low thousands of entities), MoonTools.ECS adds negligible overhead to the frame budget. The library was used in Samurai Gunn 2, a fast-paced action game where frame-time consistency matters.

## Common Pitfalls

### Don't Store References in Components

Components must be unmanaged. If you need to associate an entity with a managed resource (like a Texture2D), use an index or ID:

```csharp
// Wrong: Texture2D is a class
// public readonly record struct Sprite(Texture2D Texture);

// Right: use an index into a managed lookup table
public readonly record struct SpriteIndex(int AtlasIndex, int FrameIndex);
```

### Don't Forget FinishUpdate

If entities aren't appearing or disappearing when expected, check that `World.FinishUpdate()` is called once per frame after all systems run.

### Keep Systems Focused

Each system should do one thing. A `MovementSystem` moves entities. A `GravitySystem` applies gravity to velocity. A `FrictionSystem` applies friction. Composing small systems is easier to debug than one large `PhysicsSystem`.

## When Not to Use ECS

ECS excels when you have many similar entities processed uniformly (bullets, particles, enemies, tiles). For one-off singletons (the camera, the HUD manager, the audio controller), a simple class is fine. Not everything needs to be an entity.
