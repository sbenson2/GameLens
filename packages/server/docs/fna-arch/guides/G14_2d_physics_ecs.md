# G14 — 2D Physics Systems with MoonTools.ECS

> **Category:** guide · **Engine:** FNA · **Related:** [G01 Getting Started](./G01_getting_started.md) · [G11 ECS with MoonTools](./G11_ecs_moontools.md) · [G10 Debugging & Profiling](./G10_debugging_profiling_performance.md) · [G08 Cross-Platform Deployment](./G08_cross_platform_deployment.md)

FNA provides the rendering and input layer but has no built-in physics. For 2D games, you need to build or integrate a physics system. This guide covers how to implement 2D physics (collision detection, rigid body dynamics, and spatial queries) within a MoonTools.ECS architecture — the ECS library most commonly used with FNA. We'll build from simple AABB overlap up through velocity integration, collision response, and spatial partitioning, all structured as ECS components and systems.

---

## Architecture Overview

In an ECS physics setup, data lives in components and logic lives in systems. This separation means your physics code never touches rendering, and your rendering code never touches velocity. The physics pipeline runs as a sequence of systems each frame:

1. **VelocitySystem** — integrate acceleration into velocity, velocity into position
2. **BroadPhaseSystem** — find candidate collision pairs (spatial hash or grid)
3. **NarrowPhaseSystem** — test exact collision between candidates
4. **ResolutionSystem** — separate overlapping bodies, apply impulses
5. **ConstraintSystem** (optional) — enforce joints, limits, one-way platforms

Each system reads and writes components on the same entities. MoonTools.ECS filters ensure each system only processes entities that have the required component set.

---

## Core Components

Define physics components as structs. MoonTools.ECS stores components in tightly packed arrays, so small structs with value types perform best.

```csharp
using System.Numerics;

// Position in world space (also used by rendering)
public struct Position
{
    public Vector2 Value;
}

// Velocity in pixels per second
public struct Velocity
{
    public Vector2 Value;
}

// Acceleration — gravity, thrust, etc. Reset each frame by gameplay systems.
public struct Acceleration
{
    public Vector2 Value;
}

// Axis-aligned bounding box for collision detection
// Offset is relative to Position; Size is width/height
public struct AABBCollider
{
    public Vector2 Offset;
    public Vector2 Size;
}

// Physics material properties
public struct PhysicsMaterial
{
    public float Mass;
    public float Restitution; // 0 = no bounce, 1 = perfect bounce
    public float Friction;    // 0 = ice, 1 = rubber
}

// Tag component — entities with this don't move from collisions
public struct StaticBody { }

// Tag component — entities with this get full dynamics
public struct DynamicBody { }
```

---

## Velocity Integration System

The simplest system: apply acceleration to velocity, then velocity to position. Uses semi-implicit Euler integration, which is stable enough for most 2D games.

```csharp
using MoonTools.ECS;

public class VelocitySystem : System
{
    private Filter _dynamicFilter;

    public VelocitySystem(World world) : base(world)
    {
        // Only process entities that have all these components
        _dynamicFilter = FilterBuilder
            .Include<Position>()
            .Include<Velocity>()
            .Include<DynamicBody>()
            .Build();
    }

    public override void Update(TimeSpan delta)
    {
        float dt = (float)delta.TotalSeconds;

        foreach (var entity in _dynamicFilter.Entities)
        {
            var vel = Get<Velocity>(entity);
            var pos = Get<Position>(entity);

            // Apply acceleration if present, then clear it
            if (Has<Acceleration>(entity))
            {
                var accel = Get<Acceleration>(entity);
                vel.Value += accel.Value * dt;
                Set(entity, new Acceleration { Value = Vector2.Zero });
            }

            // Semi-implicit Euler: update velocity first, then position
            pos.Value += vel.Value * dt;

            Set(entity, vel);
            Set(entity, pos);
        }
    }
}
```

---

## Collision Detection: Broad Phase with Spatial Hashing

Testing every entity against every other entity is O(n²). A spatial hash divides the world into grid cells and only tests entities that share a cell. For most 2D games with entities of similar size, a spatial hash outperforms quadtrees.

```csharp
public class SpatialHash
{
    private readonly float _cellSize;
    private readonly Dictionary<long, List<Entity>> _cells = new();
    private readonly List<(Entity A, Entity B)> _pairs = new();

    public SpatialHash(float cellSize = 64f)
    {
        _cellSize = cellSize;
    }

    public void Clear()
    {
        foreach (var list in _cells.Values)
            list.Clear();
        _pairs.Clear();
    }

    public void Insert(Entity entity, Vector2 position, Vector2 size)
    {
        int minX = (int)MathF.Floor(position.X / _cellSize);
        int minY = (int)MathF.Floor(position.Y / _cellSize);
        int maxX = (int)MathF.Floor((position.X + size.X) / _cellSize);
        int maxY = (int)MathF.Floor((position.Y + size.Y) / _cellSize);

        for (int x = minX; x <= maxX; x++)
        {
            for (int y = minY; y <= maxY; y++)
            {
                long key = ((long)x << 32) | (uint)y;
                if (!_cells.TryGetValue(key, out var list))
                {
                    list = new List<Entity>();
                    _cells[key] = list;
                }
                list.Add(entity);
            }
        }
    }

    public List<(Entity A, Entity B)> GetPairs()
    {
        _pairs.Clear();
        var seen = new HashSet<(Entity, Entity)>();

        foreach (var cell in _cells.Values)
        {
            for (int i = 0; i < cell.Count; i++)
            {
                for (int j = i + 1; j < cell.Count; j++)
                {
                    var pair = (cell[i], cell[j]);
                    if (seen.Add(pair))
                        _pairs.Add(pair);
                }
            }
        }
        return _pairs;
    }
}
```

---

## Collision Detection: Narrow Phase (AABB)

Once the broad phase identifies candidate pairs, test actual AABB overlap and compute penetration depth for resolution:

```csharp
public struct CollisionResult
{
    public bool Colliding;
    public Vector2 Normal;       // Direction to push A out of B
    public float Penetration;    // How far they overlap
}

public static class CollisionTests
{
    public static CollisionResult TestAABB(
        Vector2 posA, AABBCollider colA,
        Vector2 posB, AABBCollider colB)
    {
        var result = new CollisionResult();

        // Compute actual AABB bounds
        float aLeft   = posA.X + colA.Offset.X;
        float aRight  = aLeft + colA.Size.X;
        float aTop    = posA.Y + colA.Offset.Y;
        float aBottom = aTop + colA.Size.Y;

        float bLeft   = posB.X + colB.Offset.X;
        float bRight  = bLeft + colB.Size.X;
        float bTop    = posB.Y + colB.Offset.Y;
        float bBottom = bTop + colB.Size.Y;

        // No overlap check
        if (aRight <= bLeft || aLeft >= bRight ||
            aBottom <= bTop || aTop >= bBottom)
        {
            result.Colliding = false;
            return result;
        }

        // Compute overlap on each axis
        float overlapX = MathF.Min(aRight - bLeft, bRight - aLeft);
        float overlapY = MathF.Min(aBottom - bTop, bBottom - aTop);

        result.Colliding = true;

        // Resolve along the axis of least penetration
        if (overlapX < overlapY)
        {
            result.Penetration = overlapX;
            result.Normal = (posA.X + colA.Offset.X + colA.Size.X / 2) <
                            (posB.X + colB.Offset.X + colB.Size.X / 2)
                ? new Vector2(-1, 0)
                : new Vector2(1, 0);
        }
        else
        {
            result.Penetration = overlapY;
            result.Normal = (posA.Y + colA.Offset.Y + colA.Size.Y / 2) <
                            (posB.Y + colB.Offset.Y + colB.Size.Y / 2)
                ? new Vector2(0, -1)
                : new Vector2(0, 1);
        }

        return result;
    }
}
```

---

## Collision Resolution System

Combine broad phase, narrow phase, and response into a single system. Static bodies don't move; dynamic bodies get pushed apart and have their velocities adjusted.

```csharp
public class CollisionSystem : System
{
    private Filter _allColliders;
    private SpatialHash _spatialHash = new(64f);

    public CollisionSystem(World world) : base(world)
    {
        _allColliders = FilterBuilder
            .Include<Position>()
            .Include<AABBCollider>()
            .Build();
    }

    public override void Update(TimeSpan delta)
    {
        // Build spatial hash
        _spatialHash.Clear();
        foreach (var entity in _allColliders.Entities)
        {
            var pos = Get<Position>(entity);
            var col = Get<AABBCollider>(entity);
            _spatialHash.Insert(entity, pos.Value + col.Offset, col.Size);
        }

        // Test candidate pairs
        foreach (var (a, b) in _spatialHash.GetPairs())
        {
            var posA = Get<Position>(a);
            var colA = Get<AABBCollider>(a);
            var posB = Get<Position>(b);
            var colB = Get<AABBCollider>(b);

            var result = CollisionTests.TestAABB(
                posA.Value, colA, posB.Value, colB);

            if (!result.Colliding)
                continue;

            bool aStatic = Has<StaticBody>(a);
            bool bStatic = Has<StaticBody>(b);

            if (aStatic && bStatic)
                continue; // Two static bodies — nothing to resolve

            // Positional correction — push bodies apart
            if (aStatic)
            {
                // Only move B
                posB.Value -= result.Normal * result.Penetration;
                Set(b, posB);
            }
            else if (bStatic)
            {
                // Only move A
                posA.Value += result.Normal * result.Penetration;
                Set(a, posA);
            }
            else
            {
                // Split the correction
                posA.Value += result.Normal * (result.Penetration * 0.5f);
                posB.Value -= result.Normal * (result.Penetration * 0.5f);
                Set(a, posA);
                Set(b, posB);
            }

            // Velocity response (bounce)
            ApplyBounce(a, b, result.Normal, aStatic, bStatic);
        }
    }

    private void ApplyBounce(Entity a, Entity b, Vector2 normal,
                              bool aStatic, bool bStatic)
    {
        if (!Has<Velocity>(a) && !Has<Velocity>(b))
            return;

        var velA = Has<Velocity>(a) ? Get<Velocity>(a) : default;
        var velB = Has<Velocity>(b) ? Get<Velocity>(b) : default;

        float restA = Has<PhysicsMaterial>(a) ? Get<PhysicsMaterial>(a).Restitution : 0f;
        float restB = Has<PhysicsMaterial>(b) ? Get<PhysicsMaterial>(b).Restitution : 0f;
        float restitution = MathF.Min(restA, restB);

        Vector2 relativeVel = velA.Value - velB.Value;
        float velAlongNormal = Vector2.Dot(relativeVel, normal);

        // Only resolve if objects are moving toward each other
        if (velAlongNormal > 0)
            return;

        float impulse = -(1 + restitution) * velAlongNormal;

        if (!aStatic && Has<Velocity>(a))
        {
            velA.Value += normal * (aStatic ? 0 : impulse * 0.5f);
            Set(a, velA);
        }
        if (!bStatic && Has<Velocity>(b))
        {
            velB.Value -= normal * (bStatic ? 0 : impulse * 0.5f);
            Set(b, velB);
        }
    }
}
```

---

## Registering the Physics Pipeline

In your FNA `Game` class, register systems in the correct order:

```csharp
public class MyGame : Game
{
    private World _world;
    private VelocitySystem _velocitySystem;
    private CollisionSystem _collisionSystem;

    protected override void Initialize()
    {
        _world = new World();
        _velocitySystem = new VelocitySystem(_world);
        _collisionSystem = new CollisionSystem(_world);

        // Create a dynamic player entity
        var player = _world.CreateEntity();
        _world.Set(player, new Position { Value = new Vector2(100, 100) });
        _world.Set(player, new Velocity { Value = Vector2.Zero });
        _world.Set(player, new AABBCollider { Offset = Vector2.Zero, Size = new Vector2(32, 32) });
        _world.Set(player, new PhysicsMaterial { Mass = 1f, Restitution = 0.2f, Friction = 0.5f });
        _world.Set(player, new DynamicBody());

        // Create a static floor
        var floor = _world.CreateEntity();
        _world.Set(floor, new Position { Value = new Vector2(0, 400) });
        _world.Set(floor, new AABBCollider { Offset = Vector2.Zero, Size = new Vector2(800, 32) });
        _world.Set(floor, new StaticBody());

        base.Initialize();
    }

    protected override void Update(GameTime gameTime)
    {
        var delta = gameTime.ElapsedGameTime;

        // Physics pipeline — order matters
        _velocitySystem.Update(delta);
        _collisionSystem.Update(delta);

        _world.FinishUpdate(); // MoonTools.ECS housekeeping
        base.Update(gameTime);
    }
}
```

---

## One-Way Platforms

A common 2D pattern: platforms you can jump through from below but stand on from above. Implement this as a tag component and a check in the collision system:

```csharp
public struct OneWayPlatform { }

// In your collision resolution, before resolving:
if (Has<OneWayPlatform>(b) && result.Normal.Y >= 0)
    continue; // Only collide when landing on top (normal points up = -Y)

if (Has<OneWayPlatform>(a) && result.Normal.Y <= 0)
    continue;
```

The key insight: only resolve the collision when the normal indicates the dynamic body is above the platform (Y-axis depends on your coordinate system — in screen coords, -Y is up).

---

## Fixed Timestep Physics

FNA's `Game.TargetElapsedTime` gives you a fixed update rate, but physics stability improves further with a dedicated fixed timestep that accumulates time:

```csharp
private const float PhysicsDt = 1f / 120f; // 120 Hz physics
private float _physicsAccumulator;

protected override void Update(GameTime gameTime)
{
    _physicsAccumulator += (float)gameTime.ElapsedGameTime.TotalSeconds;

    while (_physicsAccumulator >= PhysicsDt)
    {
        var delta = TimeSpan.FromSeconds(PhysicsDt);
        _velocitySystem.Update(delta);
        _collisionSystem.Update(delta);
        _physicsAccumulator -= PhysicsDt;
    }

    _world.FinishUpdate();
    base.Update(gameTime);
}
```

120 Hz is a good default for platformers. Top-down games with slower movement can use 60 Hz. Racing or fighting games may need 240 Hz.

---

## Performance Considerations

**Spatial hash cell size** should be 1-2× the size of your largest moving entity. Too small = entities span many cells, too large = too many candidates per cell.

**Component size** matters. MoonTools.ECS copies components by value. Keep physics components under 64 bytes. If you need large data (polygon collider vertices), store them in a separate array and reference by index.

**Avoid allocations in the hot path.** The `SpatialHash` above reuses its internal lists. Pre-allocate collision pair lists. Use `stackalloc` for small temporary arrays in narrow-phase tests.

**Profile collision pairs, not entity count.** A scene with 1,000 entities but good spatial partitioning might only test 50 pairs per frame. A scene with 200 entities in a tight cluster might test 5,000 pairs.

---

## When to Use a Third-Party Physics Library

This guide covers custom 2D physics suitable for platformers, top-down games, and simple simulations. Consider a dedicated library when you need:

- **Circle, polygon, or capsule colliders** — extending the narrow phase to handle arbitrary convex shapes is significant work
- **Continuous collision detection (CCD)** — preventing fast objects from tunneling through thin walls
- **Joint constraints** — hinges, springs, ropes, ragdolls
- **Stable stacking** — multiple dynamic bodies resting on each other without jitter

Options for FNA: Aether.Physics2D (Box2D port, pure C#), Genbox.VelcroPhysics (formerly Farseer), or BepuPhysics2 (for 3D or high-performance 2D projected to 2D planes).
