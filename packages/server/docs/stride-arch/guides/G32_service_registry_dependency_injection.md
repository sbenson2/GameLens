# G32 — Service Registry & Dependency Injection

> **Category:** Guide · **Engine:** Stride · **Related:** [Stride Architecture Rules](../stride-arch-rules.md), [G18 — Scripting Patterns](G18_scripting_patterns.md), [G28 — Entity Processors](G28_entity_processors_custom_ecs.md)

Stride provides a built-in service locator (`IServiceRegistry`) that game systems, scripts, and custom modules use to discover shared services. This guide covers how the registry works, how to register and consume your own services, when to use community DI libraries, and patterns for clean dependency management in Stride projects.

---

## Table of Contents

1. [How Stride's Service Registry Works](#1--how-strides-service-registry-works)
2. [Accessing the Registry from Scripts](#2--accessing-the-registry-from-scripts)
3. [Registering Custom Services](#3--registering-custom-services)
4. [GameSystemBase — Creating Engine-Level Services](#4--gamesystembase--creating-engine-level-services)
5. [Community DI Libraries](#5--community-di-libraries)
6. [Architecture Patterns](#6--architecture-patterns)
7. [Testing with Service Substitution](#7--testing-with-service-substitution)
8. [Common Pitfalls](#8--common-pitfalls)

---

## 1 — How Stride's Service Registry Works

Stride uses a **service locator** pattern via `IServiceRegistry`. The `Game` object owns the root registry, and all built-in systems register themselves there during initialization:

- `IGraphicsDeviceService` — GPU device access
- `IContentManager` — asset loading (`Content`)
- `ITexturesStreamingProvider` — texture streaming management
- `IGameSystemCollection` — collection of active game systems
- The physics simulation, audio engine, input manager, and script system are all registered services

The registry is a simple key-value store where the key is a `Type` (typically an interface) and the value is an object instance.

```csharp
// Conceptual view of the registry
// Type -> Instance
// IGraphicsDeviceService -> GraphicsDeviceManager
// IContentManager -> ContentManager
// ITexturesStreamingProvider -> StreamingManager
```

---

## 2 — Accessing the Registry from Scripts

Inside any `ScriptComponent` (SyncScript, AsyncScript, StartupScript), you access services through `Game.Services`:

```csharp
public class MyGameScript : SyncScript
{
    public override void Start()
    {
        // Built-in services are available through convenience properties:
        // this.Content  -> IContentManager
        // this.Input    -> InputManager
        // this.Log      -> Logger
        // this.Script   -> ScriptSystem

        // For other services, query the registry directly:
        var streaming = Game.Services.GetService<ITexturesStreamingProvider>();
        var graphics = Game.Services.GetService<IGraphicsDeviceService>();
    }

    public override void Update()
    {
        // Services are singletons — safe to cache in Start()
    }
}
```

### Service Access from Non-Script Code

If you have a plain C# class that needs a service, pass the `IServiceRegistry` through the constructor:

```csharp
public class InventorySystem
{
    private readonly IContentManager content;

    public InventorySystem(IServiceRegistry services)
    {
        content = services.GetService<IContentManager>();
    }

    public ItemData LoadItem(string url)
    {
        return content.Load<ItemData>(url);
    }
}
```

---

## 3 — Registering Custom Services

Register your own services so other scripts and systems can discover them without direct references:

```csharp
// Define the service interface
public interface IScoreService
{
    int CurrentScore { get; }
    void AddScore(int points);
    event Action<int> ScoreChanged;
}

// Implement it
public class ScoreService : IScoreService
{
    public int CurrentScore { get; private set; }
    public event Action<int> ScoreChanged;

    public void AddScore(int points)
    {
        CurrentScore += points;
        ScoreChanged?.Invoke(CurrentScore);
    }
}

// Register in a StartupScript (runs once at scene load)
public class GameBootstrap : StartupScript
{
    public override void Start()
    {
        var scoreService = new ScoreService();
        Game.Services.AddService<IScoreService>(scoreService);
    }
}
```

Other scripts can then consume it:

```csharp
public class ScoreDisplay : SyncScript
{
    private IScoreService scores;

    public override void Start()
    {
        scores = Game.Services.GetService<IScoreService>();
        scores.ScoreChanged += OnScoreChanged;
    }

    private void OnScoreChanged(int newScore)
    {
        // Update UI text
    }

    public override void Update() { }
}
```

### Registration Timing

Services must be registered **before** they are consumed. Use this ordering:

1. `StartupScript` with low `Priority` (runs early) for registration
2. `SyncScript.Start()` / `AsyncScript.Execute()` for consumption

Set priority in Game Studio on the script component, or in code:

```csharp
public class GameBootstrap : StartupScript
{
    // Lower priority number = runs earlier
    // Default is 0; set negative to run before other scripts
    public override void Start()
    {
        Game.Services.AddService<IScoreService>(new ScoreService());
    }
}
```

---

## 4 — GameSystemBase — Creating Engine-Level Services

For systems that need to participate in the engine update loop (like the built-in StreamingManager or ScriptSystem), extend `GameSystemBase`:

```csharp
public class WaveSpawnerSystem : GameSystemBase
{
    private readonly List<WaveDefinition> waves = new();
    private int currentWave;

    public WaveSpawnerSystem(IServiceRegistry registry) : base(registry)
    {
        // Register this system as a service so scripts can access it
        registry.AddService<WaveSpawnerSystem>(this);
    }

    public override void Initialize()
    {
        base.Initialize();
        // Called once when the system is added to the game
    }

    public override void Update(GameTime gameTime)
    {
        // Called every frame as part of the game loop
        // Process wave logic here
    }

    public void StartWave(int waveIndex)
    {
        currentWave = waveIndex;
        // Begin spawning logic
    }
}
```

Register the system with the game:

```csharp
public class GameBootstrap : StartupScript
{
    public override void Start()
    {
        var waveSystem = new WaveSpawnerSystem(Game.Services);
        Game.GameSystems.Add(waveSystem);
        // Now WaveSpawnerSystem.Update() is called every frame by the engine
    }
}
```

### GameSystemBase vs. SyncScript

| Aspect | GameSystemBase | SyncScript |
|--------|---------------|------------|
| Lifecycle | Tied to `Game`, survives scene changes | Tied to an entity in a scene |
| Update order | Controlled by `UpdateOrder` property | Runs in script system's pass |
| Use case | Global systems (audio, networking, save) | Per-entity behavior |
| Scene awareness | No owning entity | Has `Entity`, `Scene` references |
| Registration | `Game.GameSystems.Add(...)` | Attached to entity in editor/code |

---

## 5 — Community DI Libraries

### Stride.DependencyInjection (Nicogo1705)

For projects that prefer attribute-based injection over manual service lookups:

```csharp
// Install: Stride.DependencyInjection NuGet package

public class PlayerController : SyncScript
{
    [Inject] private IScoreService scoreService;
    [Inject] private IAudioService audioService;

    public override void Start()
    {
        // Dependencies are injected before Start() is called
    }

    public override void Update()
    {
        // Use injected services directly
    }
}
```

This library hooks into Stride's script initialization pipeline to resolve `[Inject]` attributes from the service registry.

### When to Use a DI Library

- **Small projects** — `Game.Services.GetService<T>()` is sufficient
- **Medium projects** — define interfaces and register in a bootstrap script
- **Large projects** — consider a DI library to reduce boilerplate and enforce interface contracts

---

## 6 — Architecture Patterns

### Composition Root Pattern

Centralize all service registration in one place:

```csharp
public class CompositionRoot : StartupScript
{
    public override void Start()
    {
        // Core game services
        Game.Services.AddService<IScoreService>(new ScoreService());
        Game.Services.AddService<IInventoryService>(new InventoryService(Game.Services));
        Game.Services.AddService<ISaveService>(new SaveService());

        // Game systems (participate in update loop)
        var waveSystem = new WaveSpawnerSystem(Game.Services);
        Game.GameSystems.Add(waveSystem);

        var dialogueSystem = new DialogueSystem(Game.Services);
        Game.GameSystems.Add(dialogueSystem);
    }
}
```

### Interface Segregation

Keep service interfaces focused:

```csharp
// Good: focused interfaces
public interface IScoreReader { int CurrentScore { get; } }
public interface IScoreWriter { void AddScore(int points); }

// A script that only displays score depends on IScoreReader
// A script that awards score depends on IScoreWriter
// The implementation can implement both
public class ScoreService : IScoreReader, IScoreWriter { /* ... */ }
```

### Service Lifetime Awareness

Stride's registry does not manage lifetimes — you register an instance and it stays until you remove it or the game exits. For scene-scoped services:

```csharp
public class SceneScopedBootstrap : StartupScript
{
    private IScoreService scoreService;

    public override void Start()
    {
        scoreService = new ScoreService();
        Game.Services.AddService<IScoreService>(scoreService);
    }

    public override void Cancel()
    {
        // Clean up when this entity/scene is removed
        Game.Services.RemoveService<IScoreService>();
    }
}
```

---

## 7 — Testing with Service Substitution

Because services are accessed through interfaces, you can substitute them for testing:

```csharp
// In a test harness or debug scene
public class TestBootstrap : StartupScript
{
    public override void Start()
    {
        // Replace real services with test doubles
        Game.Services.AddService<IScoreService>(new MockScoreService());
        Game.Services.AddService<ISaveService>(new InMemorySaveService());
    }
}
```

This also works for switching implementations at runtime (e.g., swapping a networked score service for a local one).

---

## 8 — Common Pitfalls

1. **Service not found** — `GetService<T>()` returns `null` if the service isn't registered yet. Check registration order and script priorities.
2. **Duplicate registration** — calling `AddService<T>()` twice with the same type throws an exception. Guard with a null check or use `RemoveService` first.
3. **Scene-scoped services leaking** — if you register a service in one scene and don't remove it in `Cancel()`, it persists into the next scene, potentially holding stale references.
4. **Circular dependencies** — if Service A needs Service B in its constructor and vice versa, you'll hit a null reference. Break the cycle with lazy initialization or event-based communication.
5. **Thread safety** — `IServiceRegistry` is not thread-safe. Register and query services on the main thread only. If a background system needs a service reference, capture it during initialization.
