# G14 — .NET 10 & C# 14 Performance Patterns in Stride 4.3

> **Category:** guide · **Engine:** Stride · **Related:** [G08 Stride 4.3 Migration](./G08_stride_43_migration.md) · [G01 Getting Started](./G01_getting_started.md) · [G03 Code-Only Development](./G03_code_only_development.md) · [G02 Bepu Physics](./G02_bepu_physics.md) · [G13 Cross-Platform Builds](./G13_cross_platform_builds.md)

Stride 4.3 targets .NET 10 and C# 14, a significant runtime upgrade from the .NET 8 / C# 12 baseline of Stride 4.2. This guide covers the concrete performance benefits you get for free by upgrading, the new C# 14 language features most useful in game code, and patterns that take advantage of .NET 10's improved JIT, GC, and vectorization. We also cover the migration steps and what to watch for.

---

## What You Get for Free

Upgrading from Stride 4.2 (.NET 8) to 4.3 (.NET 10) improves performance without changing your code. The .NET runtime team ships JIT, GC, and library improvements in every major release, and they compound:

**JIT compiler improvements:**
- AVX-512, AVX10.2, and ARM SVE/SVE2 auto-vectorization — the JIT now uses wider SIMD instructions when available, accelerating math-heavy code (transforms, physics, particle updates) by 15–30% on modern CPUs with no source changes
- Better loop optimization and bounds-check elimination — array access in hot loops is faster when the JIT can prove bounds safety
- Improved inlining heuristics — more small methods get inlined, reducing call overhead in ECS-style code with many small component accessors

**Garbage collector:**
- Dynamic Adaptation to Application Sizes (DATAS) is refined in .NET 10, reducing GC pause duration for games that allocate in bursts (level loads, spawning waves of entities) then settle into steady-state
- Server GC with regions mode (default in .NET 10) compacts memory more efficiently, reducing long-term fragmentation during extended play sessions

**Base class library:**
- `System.Numerics.Vector<T>` and `System.Runtime.Intrinsics` benefit from wider hardware SIMD, making `Matrix4x4`, `Vector3`, and `Quaternion` operations faster
- `Span<T>` and `Memory<T>` optimizations reduce copying in serialization and asset loading paths
- `FrozenDictionary<TKey, TValue>` and `FrozenSet<T>` (introduced in .NET 8, optimized further in 10) are ideal for lookup tables that don't change at runtime — asset registries, tile type maps, input binding tables

---

## C# 14 Features for Game Development

C# 14 introduces several features that reduce boilerplate and improve performance in game code.

### Field-Backed Properties (`field` keyword)

Properties can now reference an auto-generated backing field directly, eliminating the need for an explicit private field when you want validation or side effects:

```csharp
public class HealthComponent : SyncScript
{
    // 'field' refers to the compiler-generated backing field
    public float MaxHealth
    {
        get => field;
        set => field = MathF.Max(0, value);
    }

    public float CurrentHealth
    {
        get => field;
        set
        {
            field = Math.Clamp(value, 0, MaxHealth);
            if (field <= 0)
                OnDeath();
        }
    }

    private void OnDeath() { /* ... */ }
}
```

Before C# 14, this required separate `_maxHealth` and `_currentHealth` fields. The `field` keyword is particularly useful in Stride `SyncScript` and `AsyncScript` components where you expose properties to the GameStudio editor.

### Extension Members (Preview)

C# 14 introduces `extension` blocks as a preview feature, replacing the static-class-with-this-parameter pattern for extension methods and adding extension properties and static members:

```csharp
// Add game-specific helpers to Stride's Vector3
implicit extension Vector3GameExtensions for Vector3
{
    // Extension property — no allocation, computed on access
    public float HorizontalMagnitude
        => MathF.Sqrt(X * X + Z * Z);

    // Extension method
    public Vector3 WithY(float y)
        => new(X, y, Z);

    // Static extension member
    public static Vector3 RandomOnUnitCircleXZ(Random rng)
    {
        float angle = rng.NextSingle() * MathF.Tau;
        return new Vector3(MathF.Cos(angle), 0, MathF.Sin(angle));
    }
}

// Usage in game code
var direction = entity.Transform.Position.WithY(0).HorizontalMagnitude;
var spawn = Vector3.RandomOnUnitCircleXZ(rng);
```

Note: extension members are a preview feature in C# 14 — enable with `<LangVersion>preview</LangVersion>` in your `.csproj`. They may change in C# 15.

### `params` Collections

`params` now works with `Span<T>`, `ReadOnlySpan<T>`, and other collection types, not just arrays. This eliminates hidden allocations in variadic methods:

```csharp
// Before: params T[] allocated an array on every call
// After: params ReadOnlySpan<T> is stack-allocated for small argument lists
public static Entity FindClosest(Vector3 origin, params ReadOnlySpan<Entity> candidates)
{
    Entity closest = default;
    float bestDist = float.MaxValue;

    foreach (var entity in candidates)
    {
        float dist = Vector3.DistanceSquared(origin, entity.Transform.WorldMatrix.TranslationVector);
        if (dist < bestDist)
        {
            bestDist = dist;
            closest = entity;
        }
    }
    return closest;
}

// Call site — no array allocation
var target = FindClosest(player.Transform.Position, enemy1, enemy2, enemy3);
```

This is valuable in game code where variadic helpers are common (find nearest, apply damage to multiple targets, log multiple values).

---

## Performance Patterns

### Pattern: FrozenDictionary for Static Lookups

Game data that's loaded once and never changes (tile definitions, item stats, animation clip names) benefits from `FrozenDictionary`, which optimizes its internal structure at creation time for faster reads:

```csharp
using System.Collections.Frozen;

public class TileRegistry
{
    private readonly FrozenDictionary<int, TileDefinition> _tiles;

    public TileRegistry(Dictionary<int, TileDefinition> definitions)
    {
        // One-time cost at load time, faster lookups forever after
        _tiles = definitions.ToFrozenDictionary();
    }

    public TileDefinition Get(int tileId) => _tiles[tileId];
}
```

`FrozenDictionary` is ~30-60% faster than `Dictionary` for reads, at the cost of being immutable and slower to create. Perfect for game data tables.

### Pattern: Ref Structs in Hot Paths

.NET 10's JIT is better at optimizing `ref struct` usage. Use them for zero-allocation iteration over game data:

```csharp
public ref struct EntityNeighborEnumerator
{
    private readonly ReadOnlySpan<Entity> _entities;
    private readonly Vector3 _center;
    private readonly float _radiusSq;
    private int _index;

    public EntityNeighborEnumerator(ReadOnlySpan<Entity> entities, Vector3 center, float radius)
    {
        _entities = entities;
        _center = center;
        _radiusSq = radius * radius;
        _index = -1;
    }

    public Entity Current => _entities[_index];

    public bool MoveNext()
    {
        while (++_index < _entities.Length)
        {
            var pos = _entities[_index].Transform.WorldMatrix.TranslationVector;
            if (Vector3.DistanceSquared(_center, pos) <= _radiusSq)
                return true;
        }
        return false;
    }

    public EntityNeighborEnumerator GetEnumerator() => this;
}
```

### Pattern: Vectorized Batch Updates

When updating many transforms or physics bodies, structure data for SIMD-friendly access. .NET 10's JIT auto-vectorizes simple loops over contiguous float arrays:

```csharp
public class BatchMover : SyncScript
{
    // Structure-of-arrays layout — SIMD-friendly
    private float[] _posX;
    private float[] _posY;
    private float[] _posZ;
    private float[] _velX;
    private float[] _velY;
    private float[] _velZ;

    public void IntegrateAll(float dt, int count)
    {
        // The .NET 10 JIT will auto-vectorize these loops using
        // AVX-512 (16 floats/iteration) or NEON (4 floats/iteration)
        for (int i = 0; i < count; i++)
            _posX[i] += _velX[i] * dt;

        for (int i = 0; i < count; i++)
            _posY[i] += _velY[i] * dt;

        for (int i = 0; i < count; i++)
            _posZ[i] += _velZ[i] * dt;
    }
}
```

Splitting X/Y/Z into separate arrays (structure-of-arrays) lets the JIT process 8-16 entities per SIMD instruction. An array-of-structs layout (`Vector3[]`) limits SIMD to one entity at a time because the fields interleave in memory.

---

## Migration from Stride 4.2

### Project File Changes

Update your `.csproj` target framework and Stride package references:

```xml
<Project Sdk="Microsoft.NET.Sdk">
  <PropertyGroup>
    <!-- Was net8.0 in Stride 4.2 -->
    <TargetFramework>net10.0</TargetFramework>
    <LangVersion>14</LangVersion>
  </PropertyGroup>

  <ItemGroup>
    <!-- Update all Stride packages to 4.3.x -->
    <PackageReference Include="Stride.Engine" Version="4.3.*" />
    <PackageReference Include="Stride.Graphics" Version="4.3.*" />
    <PackageReference Include="Stride.Physics" Version="4.3.*" />
  </ItemGroup>
</Project>
```

### .NET 10 SDK

Install .NET 10 SDK from [dotnet.microsoft.com](https://dotnet.microsoft.com/download/dotnet/10.0). Verify with:

```bash
dotnet --version
# Should output 10.0.xxx
```

### IDE Support

Stride 4.3 adds Rider and VSCode support alongside Visual Studio:

- **Visual Studio 2022 17.12+** — .NET 10 support built in
- **JetBrains Rider 2025.1+** — .NET 10 and C# 14 support, Stride plugin available
- **VSCode with C# Dev Kit** — full IntelliSense, debugging, and project support

GameStudio's "Open in IDE" button now detects all three. Set your preference in GameStudio → Settings → IDE.

### Breaking Changes to Watch

Stride 4.3 itself has no documented breaking changes, but .NET 10 includes some runtime behavior changes:

- **`JsonSerializer` stricter by default** — if you use `System.Text.Json` for save files or config, test deserialization of existing files. The `JsonSerializerOptions.Default` is slightly stricter about trailing commas and comments.
- **Obsolete API removals** — APIs marked `[Obsolete]` in .NET 8 may be removed in .NET 10. Run a build and fix any compiler errors.
- **Regex source generator changes** — if you use `[GeneratedRegex]`, the generated code may differ. Functionally equivalent but worth a test pass.

### Physics Migration: Bullet to Bepu

Stride 4.3 adds BepuPhysics as an alternative to Bullet. Bullet remains the default — this is opt-in. If you want to switch, see [G02 Bepu Physics](./G02_bepu_physics.md) for the full migration guide. Key considerations:

- Bepu is pure C#, which means it benefits directly from .NET 10's JIT improvements (Bullet is native C++ via interop)
- Bepu uses a different collision shape API — shapes are not interchangeable
- Bepu's constraint system is more flexible but has a different API surface

---

## Profiling .NET 10 Improvements

To measure the actual impact of the runtime upgrade on your game:

**dotnet-counters** for real-time GC and JIT metrics:

```bash
dotnet-counters monitor --process-id <pid> --counters \
    System.Runtime[gen-0-gc-count,gen-1-gc-count,gen-2-gc-count,time-in-gc,alloc-rate] \
    System.Runtime[il-bytes-jitted,methods-jitted-count]
```

**Stride's built-in profiler** — enable in GameStudio or via code:

```csharp
// In your Game class
GameProfiler.EnableProfiling = true;
```

This overlays frame time, draw calls, and physics step duration. Compare identical scenes on Stride 4.2 vs 4.3 to quantify the .NET 10 uplift.

**BenchmarkDotNet** for micro-benchmarks of specific hot paths:

```csharp
[Benchmark]
public void TransformUpdate_1000Entities()
{
    for (int i = 0; i < 1000; i++)
        _transforms[i].Position += _velocities[i] * Dt;
}
```

Run with `--runtimes net8.0 net10.0` to compare directly.

---

## Summary of Actionable Steps

1. Install .NET 10 SDK and update your `.csproj` to `net10.0`
2. Update all Stride NuGet packages to `4.3.*`
3. Build and fix any obsolete API warnings or errors
4. Test JSON deserialization of save files and configs
5. Benchmark before and after — expect 10-30% improvement in math-heavy systems for free
6. Adopt C# 14 features gradually: start with `field` keyword in editor-exposed components, then `params Span<T>` in hot utility methods
7. Replace `Dictionary` with `FrozenDictionary` for static game data tables
8. Consider switching from Bullet to Bepu physics for pure-C# JIT benefits
