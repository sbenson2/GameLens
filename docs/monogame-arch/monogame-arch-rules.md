# MonoGame + Arch ECS — AI Rules

Engine-specific rules for projects using MonoGame with the Arch ECS framework. These supplement the engine-agnostic rules in `docs/core/ai-workflow/gamedev-rules.md`.

---

## Architecture Context

### Tech Stack

- **Engine:** MonoGame (cross-platform C# game framework)
- **ECS:** Arch (high-performance C# Entity Component System)
- **Language:** C# (.NET)
- **Key Libraries:** Commonly used alongside MonoGame + Arch:
  - Arch.Extended (system groups, source generators)
  - MonoGame.Extended (cameras, sprites, collections, input)
  - LDtk / Tiled loaders (level editors)
  - FMOD / NAudio (audio)

### Project Structure Conventions

```
{ProjectName}/
├── Components/          # Pure data structs (ECS components)
├── Systems/             # ECS systems (logic only)
├── Entities/            # Entity factory/archetype definitions
├── Core/                # Game loop, scene management, service locators
├── Rendering/           # Draw systems, sprite batching, cameras
├── Input/               # Input mapping and handling
├── Content/             # MonoGame content pipeline assets
├── Data/                # JSON/config data files
└── docs/                # Project documentation, ADRs
```

---

## ECS Code Generation Rules

### Components: Pure Data Only

Components MUST be pure data structs. No methods, no logic, no constructors with side effects.

```csharp
// CORRECT: Pure data component
public struct Position
{
    public float X;
    public float Y;
}

public struct Velocity
{
    public float X;
    public float Y;
}

public struct Health
{
    public int Current;
    public int Max;
}

public struct SpriteRenderer
{
    public Texture2D Texture;
    public Rectangle SourceRect;
    public Color Tint;
    public float Layer;
}
```

```csharp
// WRONG: Logic in a component
public struct Health
{
    public int Current;
    public int Max;

    public void TakeDamage(int amount) => Current -= amount;  // NO! Logic belongs in systems
    public bool IsDead => Current <= 0;  // NO! Computed properties belong in systems
}
```

### Systems: Logic Lives Here

Systems process components. They should have a single responsibility and query for exactly the components they need.

```csharp
// System that moves entities with Position and Velocity
public class MovementSystem : BaseSystem<World, float>
{
    private readonly QueryDescription _query = new QueryDescription()
        .WithAll<Position, Velocity>();

    public MovementSystem(World world) : base(world) { }

    public override void Update(in float deltaTime)
    {
        World.Query(in _query, (ref Position pos, ref Velocity vel) =>
        {
            pos.X += vel.X * deltaTime;
            pos.Y += vel.Y * deltaTime;
        });
    }
}
```

### Arch ECS Type Signatures

Always specify complete type signatures in Arch queries. The Arch API requires explicit type parameters:

```csharp
// QueryDescription — specify all required components
new QueryDescription().WithAll<Position, Velocity, Health>();

// Query execution — ref parameters must match WithAll types
World.Query(in query, (ref Position pos, ref Velocity vel, ref Health hp) => { ... });

// Entity creation — use component tuple
var entity = World.Create(
    new Position { X = 0, Y = 0 },
    new Velocity { X = 0, Y = 0 },
    new Health { Current = 100, Max = 100 }
);

// Get/Set components on entity
ref var pos = ref World.Get<Position>(entity);
World.Set(entity, new Velocity { X = 5, Y = 0 });
```

**Common mistakes to avoid:**
- Do not forget `ref` on query lambda parameters — Arch passes by reference for mutation.
- Do not use `World.Query` with fewer parameters than the `WithAll` specifies.
- Do not store entity references across frames without checking `World.IsAlive(entity)`.

---

## C# Conventions

### Naming

- **PascalCase** for types, methods, properties, public fields, and constants.
- **camelCase** for local variables and private fields.
- **_camelCase** (underscore prefix) for private instance fields.
- **ALL_CAPS** is NOT used — use PascalCase for constants.

### Patterns

- Use `readonly struct` for components when possible (if the component is not mutated in-place).
- Prefer `ref` returns and `in` parameters for performance-sensitive code paths.
- Use `Span<T>` and `stackalloc` for temporary allocations in hot paths.
- Avoid LINQ in per-frame code (allocates on the heap).
- Avoid `async/await` in the game loop — use coroutine patterns or manual state machines instead.

### String and Logging

- Use string interpolation (`$"text {var}"`) for debug logging.
- Never allocate strings per-frame in release builds.

---

## Build and Run Commands

```bash
# Build the project
dotnet build

# Run the project
dotnet run

# Build in Release mode
dotnet build -c Release

# Run in Release mode
dotnet run -c Release

# Clean build artifacts
dotnet clean

# Restore NuGet packages
dotnet restore
```

**Build rule:** Run `dotnet build` after every code change. Do not accumulate changes without building.

---

## MonoGame-Specific File Boundaries

### Content Pipeline

- All game assets go through the MonoGame Content Pipeline (`Content/` directory with `.mgcb` file).
- Do not manually copy assets into build output — use the content pipeline.
- The `.mgcb` file must be updated when adding or removing assets.
- Use `Content.Load<T>("AssetName")` to load assets — never use raw file I/O for content.

### File Responsibilities

Keep clear separation between these concerns:

| File/Directory | Responsibility | AI Should Not |
|---|---|---|
| `Game1.cs` (or main game class) | Bootstrap, initialize services, set up the world | Add game logic here |
| `Components/` | Data struct definitions only | Add methods or logic |
| `Systems/` | All game logic | Access MonoGame services directly (inject them) |
| `Rendering/` | Draw calls, sprite batching, camera | Contain game logic |
| `Content/` | Asset files + .mgcb manifest | Be modified without pipeline |
| `Core/` | Scene management, service location, game loop | Contain feature-specific code |

### MonoGame Lifecycle

Respect the MonoGame game loop order:

1. `Initialize()` — Set up non-graphical resources
2. `LoadContent()` — Load assets via Content Pipeline
3. `Update(GameTime)` — All game logic (ECS systems run here)
4. `Draw(GameTime)` — All rendering (ECS draw systems run here)
5. `UnloadContent()` — Cleanup

Do not perform rendering in `Update()` or game logic in `Draw()`. The ECS system execution order should reflect this separation.

---

## Integration with Core Rules

These MonoGame + Arch rules build on top of the core rules. Specifically:

- **Code generation principles** from core rules apply — small units, build after every change, one concern per generation.
- **Art pipeline rules** from core rules apply — MonoGame content pipeline is the "engine-ready" format.
- **Scope control** from core rules applies — resist the urge to build a custom engine on top of MonoGame.
- **Task structure** from core rules applies — tasks should be completable in one session.

When core rules and MonoGame rules could conflict, MonoGame rules take precedence for MonoGame projects.
