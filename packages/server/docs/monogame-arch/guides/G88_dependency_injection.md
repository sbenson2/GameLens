# G88 — Dependency Injection & Service Architecture

> **Category:** guide · **Engine:** MonoGame · **Related:** [G10 Custom Game Systems](./G10_custom_game_systems.md) · [G12 Design Patterns](./G12_design_patterns.md) · [G18 Game Programming Patterns](./G18_game_programming_patterns.md) · [G38 Scene & Game State Management](./G38_scene_management.md) · [G77 ECS Event & Messaging](./G77_ecs_event_messaging.md)

How to structure service dependencies in a MonoGame project. Covers MonoGame's built-in `GameServiceContainer`, modern constructor injection with `Microsoft.Extensions.DependencyInjection`, the `IHostedService` pattern for running MonoGame inside a .NET Generic Host, and practical guidance on when DI helps vs. hurts in game code.

---

## The Problem: Wiring Services Together

A non-trivial MonoGame game has many services that depend on each other: audio manager, input system, content cache, save system, analytics, settings, scene manager. Without a strategy, you end up with one of these anti-patterns:

```
❌ God Game1 class — everything lives as fields on Game1, passed manually everywhere
❌ Static singletons — AudioManager.Instance, InputManager.Instance (untestable, hidden deps)
❌ Constructor spaghetti — new AudioManager(new Settings(new FileSystem(...)))
```

MonoGame provides a lightweight solution. Modern .NET provides a heavier one. Both have trade-offs.

---

## Option 1: GameServiceContainer (Built-in)

MonoGame's `Game.Services` property is a `GameServiceContainer` that implements `IServiceProvider`. It's a **service locator** — you register services by interface, then retrieve them anywhere you have access to `Game.Services`.

### Registration

```csharp
public class Game1 : Game
{
    protected override void Initialize()
    {
        // Register services by interface → implementation
        var settings = new GameSettings();
        Services.AddService<IGameSettings>(settings);

        var audio = new AudioManager(settings);
        Services.AddService<IAudioManager>(audio);

        var input = new InputManager();
        Services.AddService<IInputManager>(input);

        var saveSystem = new SaveSystem(settings);
        Services.AddService<ISaveSystem>(saveSystem);

        base.Initialize();
    }
}
```

### Retrieval

```csharp
// Anywhere you have access to Game.Services (or an IServiceProvider):
var audio = Game.Services.GetService<IAudioManager>();
audio.PlaySfx("explosion");

// In a DrawableGameComponent:
public class HudRenderer : DrawableGameComponent
{
    private IAudioManager _audio;

    public override void Initialize()
    {
        _audio = Game.Services.GetService<IAudioManager>();
        base.Initialize();
    }
}
```

### Strengths and Weaknesses

| Pros | Cons |
|------|------|
| Zero dependencies — ships with MonoGame | Service locator anti-pattern — dependencies are hidden |
| Simple — 2 methods: `AddService`, `GetService` | No constructor injection — you pull, not push |
| No reflection, no startup cost | No lifetime management (singleton/scoped/transient) |
| Familiar to XNA veterans | Runtime errors if service not registered (returns null) |
| Works in hot paths without allocation | No built-in validation that all dependencies are satisfied |

### When to Use

`GameServiceContainer` is a good fit when:
- Your project has fewer than ~15 services.
- You want zero external NuGet dependencies.
- Your team is small and everyone knows what's registered.
- You're building a game jam project or prototype.

---

## Option 2: Microsoft.Extensions.DependencyInjection

For larger projects, .NET's built-in DI container provides constructor injection, lifetime management, and compile-time-like validation.

### Setup

```bash
dotnet add package Microsoft.Extensions.DependencyInjection
```

### Configuration

```csharp
using Microsoft.Extensions.DependencyInjection;

public static class Program
{
    public static void Main()
    {
        var services = new ServiceCollection();

        // Register services with explicit lifetimes
        services.AddSingleton<IGameSettings, GameSettings>();
        services.AddSingleton<IAudioManager, AudioManager>();
        services.AddSingleton<IInputManager, InputManager>();
        services.AddSingleton<ISaveSystem, SaveSystem>();
        services.AddSingleton<IContentCache, ContentCache>();
        services.AddSingleton<ISceneManager, SceneManager>();

        // Register the game itself
        services.AddSingleton<Game1>();

        var provider = services.BuildServiceProvider(new ServiceProviderOptions
        {
            ValidateOnBuild = true,  // catch missing registrations at startup
            ValidateScopes = true
        });

        using var game = provider.GetRequiredService<Game1>();
        game.Run();
    }
}
```

### Constructor Injection

```csharp
public class Game1 : Game
{
    private readonly IAudioManager _audio;
    private readonly IInputManager _input;
    private readonly ISceneManager _scenes;

    // Dependencies are injected automatically by the container
    public Game1(IAudioManager audio, IInputManager input, ISceneManager scenes)
    {
        _audio = audio;
        _input = input;
        _scenes = scenes;
        new GraphicsDeviceManager(this);
        Content.RootDirectory = "Content";
    }

    protected override void Update(GameTime gameTime)
    {
        _input.Update(gameTime);
        _scenes.Update(gameTime);
        _audio.Update(gameTime);
        base.Update(gameTime);
    }
}
```

### Service Implementation with Dependencies

```csharp
public class AudioManager : IAudioManager
{
    private readonly IGameSettings _settings;
    private readonly IContentCache _content;

    // The container resolves IGameSettings and IContentCache automatically
    public AudioManager(IGameSettings settings, IContentCache content)
    {
        _settings = settings;
        _content = content;
    }

    public void PlaySfx(string name)
    {
        var sfx = _content.Get<SoundEffect>(name);
        sfx.Play(_settings.SfxVolume, 0f, 0f);
    }
}
```

### Strengths and Weaknesses

| Pros | Cons |
|------|------|
| Constructor injection — dependencies are explicit | Adds a NuGet dependency |
| `ValidateOnBuild` catches missing registrations at startup | Reflection-based — slightly slower startup |
| Lifetime management (singleton, transient, scoped) | Overkill for small projects |
| Industry-standard — familiar to .NET developers | Can encourage over-abstraction |
| Testable — swap implementations easily | Transient/scoped lifetimes rarely useful in games |

---

## Option 3: IHostedService (Full .NET Host)

For projects that want .NET's full hosting infrastructure — logging, configuration, graceful shutdown — you can run MonoGame inside a `Generic Host`.

### Setup

```bash
dotnet add package Microsoft.Extensions.Hosting
```

### Implementation

```csharp
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;

public static class Program
{
    public static void Main(string[] args)
    {
        var host = Host.CreateDefaultBuilder(args)
            .ConfigureServices((context, services) =>
            {
                // Game services
                services.AddSingleton<IGameSettings, GameSettings>();
                services.AddSingleton<IAudioManager, AudioManager>();
                services.AddSingleton<IInputManager, InputManager>();

                // The game runs as a hosted service
                services.AddSingleton<Game1>();
                services.AddHostedService<GameHostService>();
            })
            .Build();

        host.Run();
    }
}

public class GameHostService : IHostedService
{
    private readonly Game1 _game;
    private Task? _gameTask;

    public GameHostService(Game1 game) => _game = game;

    public Task StartAsync(CancellationToken ct)
    {
        // Run the game loop on a dedicated thread.
        // Game.Run() blocks until the window closes.
        _gameTask = Task.Run(() => _game.Run(), ct);
        return Task.CompletedTask;
    }

    public async Task StopAsync(CancellationToken ct)
    {
        _game.Exit();
        if (_gameTask != null) await _gameTask;
    }
}
```

### When to Use IHostedService

This pattern is most useful when:
- Your game has a **dedicated server** component (headless multiplayer server) that benefits from .NET hosting features (configuration, logging, health checks).
- You want `ILogger<T>` and `IConfiguration` integrated throughout your game services.
- You're building a **tool** (level editor, asset viewer) alongside the game.

For a standard client-side game, Option 2 (plain DI) is typically sufficient.

---

## Hybrid Approach: DI at the Edges, Direct References in Hot Paths

The pragmatic approach for most MonoGame games combines DI for service wiring with direct references in performance-critical code.

### Principle: DI for Setup, Direct Access for Gameplay

```csharp
// ✅ Use DI for service construction (runs once at startup)
public class CombatSystem : GameSystem
{
    private readonly IAudioManager _audio;
    private readonly IParticleSystem _particles;

    public CombatSystem(IAudioManager audio, IParticleSystem particles)
    {
        _audio = audio;
        _particles = particles;
    }

    // ✅ Direct field access in hot path (runs 60x/sec for every entity)
    public override void Update(in GameTime gt)
    {
        World.Query(in _combatQuery, (ref Health hp, ref Position pos) =>
        {
            if (hp.Current <= 0)
            {
                _audio.PlaySfx("death");           // direct call, no resolution
                _particles.Emit("blood", pos.Value); // no service lookup per frame
            }
        });
    }
}
```

### What NOT to Inject

Not everything belongs in the DI container:

```
❌ Components (ECS data) — these are plain structs, not services
❌ Entities — created/destroyed at runtime, not injected
❌ GameTime — passed as a parameter, not a dependency
❌ Per-frame data — allocations in DI resolution are unacceptable at 60fps
❌ MonoGame types (GraphicsDevice, ContentManager) — use Game.Services for these
```

### What TO Inject

```
✅ Managers/services (AudioManager, InputManager, SaveSystem)
✅ Configuration (GameSettings, DifficultyConfig)
✅ Infrastructure (ILogger, IFileSystem for testing)
✅ Scene/state management (ISceneManager)
✅ ECS systems (if they have service dependencies)
```

---

## ECS System Factory with DI (Arch)

When using Arch ECS with DI, create systems through the container so their dependencies are resolved automatically.

```csharp
// Register systems in DI
services.AddSingleton<MovementSystem>();
services.AddSingleton<CombatSystem>();
services.AddSingleton<RenderSystem>();
services.AddSingleton<SpatialAudioUpdateSystem>();

// Scene creates its world and pulls pre-wired systems from DI
public class GameplayScene : Scene
{
    private readonly IServiceProvider _services;
    private World _world;

    public GameplayScene(IServiceProvider services)
    {
        _services = services;
    }

    public override void Enter()
    {
        _world = World.Create();

        // Systems are already constructed with their dependencies injected
        AddSystem(_services.GetRequiredService<MovementSystem>());
        AddSystem(_services.GetRequiredService<CombatSystem>());
        AddSystem(_services.GetRequiredService<RenderSystem>());
        AddSystem(_services.GetRequiredService<SpatialAudioUpdateSystem>());
    }
}
```

---

## Testing with DI

One of the primary benefits of constructor injection is testability.

```csharp
// Unit test with mock dependencies
[Test]
public void CombatSystem_KillsEntity_PlaysSfx()
{
    var mockAudio = new MockAudioManager();
    var mockParticles = new MockParticleSystem();

    var system = new CombatSystem(mockAudio, mockParticles);
    // ... set up world with an entity at 0 HP ...
    system.Update(new GameTime());

    Assert.That(mockAudio.LastPlayed, Is.EqualTo("death"));
}

// Integration test with real services but test configuration
var services = new ServiceCollection();
services.AddSingleton<IGameSettings>(new TestSettings { SfxVolume = 0f });
services.AddSingleton<IAudioManager, AudioManager>();
// ...
```

---

## Decision Matrix

| Factor | GameServiceContainer | MS DI | IHostedService |
|--------|---------------------|-------|----------------|
| Dependencies | None | 1 NuGet | 1 NuGet |
| Injection style | Service locator (pull) | Constructor (push) | Constructor (push) |
| Startup validation | None (null on miss) | ValidateOnBuild | ValidateOnBuild |
| Learning curve | Minimal | Moderate | Higher |
| Testability | Low | High | High |
| Best for | Jams, prototypes, small games | Mid-to-large games | Servers, tools, editor apps |
| Performance risk | None | Startup reflection (~ms) | Hosting overhead (~ms) |

---

## Common Pitfalls

1. **Resolving services per frame.** Never call `provider.GetService<T>()` inside `Update()`. Resolve once at construction time and store in a field.

2. **Circular dependencies.** `AudioManager` needs `IContentCache`, which needs `IAudioManager` → stack overflow. Break the cycle with lazy resolution (`Lazy<T>`) or event-based decoupling.

3. **Over-abstracting.** Not every class needs an interface. Only create `IAudioManager` if you actually have a second implementation (like `NullAudioManager` for tests or headless mode).

4. **Injecting MonoGame internals.** `GraphicsDevice` isn't available until `Game.Initialize()` runs. If a service needs it, use `Game.Services.GetService<IGraphicsDeviceService>()` or defer initialization.

5. **Scoped lifetimes in games.** ASP.NET's "scoped" concept (per HTTP request) doesn't map well to games. Use singleton for services and manage per-scene cleanup explicitly.

---
