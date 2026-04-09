# G34 — Dependency Injection & Architecture Patterns in Unity 6

> **Category:** guide · **Engine:** Unity 6 (6000.x) · **Related:** [G14 ScriptableObject Architecture](G14_scriptable_object_architecture.md) · [G1 Scene Management](G1_scene_management.md) · [G18 Automated Testing](G18_automated_testing.md) · [Unity Rules](../unity-arch-rules.md)

As Unity projects grow, managing dependencies between systems becomes the dominant source of complexity. Hard-coded `GetComponent<T>()` calls, singletons, and `FindAnyObjectByType<T>()` lookups create tight coupling that makes code fragile, hard to test, and difficult to refactor. This guide covers dependency injection (DI) patterns in Unity — from lightweight manual approaches to the VContainer framework — and the broader architecture patterns (Service Locator, MVP, event buses) that keep large projects maintainable.

---

## The Problem: Dependency Spaghetti

In a typical Unity project, systems acquire their dependencies through direct lookups:

```csharp
// PROBLEM: Every system reaches out and grabs its own dependencies.
// This creates hidden coupling — you can't test, reorder, or replace systems.
public class EnemyAI : MonoBehaviour
{
    private PlayerHealth _player;
    private AudioManager _audio;
    private ScoreManager _score;

    private void Start()
    {
        // WHY this is bad:
        // 1. Fragile — fails silently if PlayerHealth isn't in the scene
        // 2. Untestable — can't substitute a mock player in unit tests
        // 3. Order-dependent — if AudioManager hasn't called Awake() yet, this breaks
        // 4. Hidden — reading this class doesn't reveal its dependencies without reading Start()
        _player = FindAnyObjectByType<PlayerHealth>();
        _audio = AudioManager.Instance;  // Singleton
        _score = FindAnyObjectByType<ScoreManager>();
    }
}
```

**Dependency injection** inverts this: instead of a class *finding* its dependencies, they are *provided* to it from the outside, typically through constructor parameters, method parameters, or property injection.

---

## Level 0: Constructor / Method Injection (No Framework)

The simplest form of DI requires no framework at all. For pure C# classes (non-MonoBehaviour), use constructor injection:

```csharp
/// <summary>
/// Pure C# class with constructor injection.
/// All dependencies are visible in the constructor signature.
/// </summary>
public class CombatResolver
{
    private readonly IDamageCalculator _damage;
    private readonly ILogger _logger;

    // WHY constructor injection: dependencies are explicit, required, and immutable.
    // You cannot create a CombatResolver without providing both dependencies.
    // This makes the class self-documenting and impossible to misconfigure.
    public CombatResolver(IDamageCalculator damage, ILogger logger)
    {
        _damage = damage ?? throw new System.ArgumentNullException(nameof(damage));
        _logger = logger ?? throw new System.ArgumentNullException(nameof(logger));
    }

    public int Resolve(AttackData attack, DefenseData defense)
    {
        int result = _damage.Calculate(attack, defense);
        _logger.Log($"Combat resolved: {result} damage");
        return result;
    }
}

// Interfaces enable substitution for testing or different implementations
public interface IDamageCalculator
{
    int Calculate(AttackData attack, DefenseData defense);
}

public interface ILogger
{
    void Log(string message);
}
```

For MonoBehaviours (which Unity constructs via `AddComponent` or scene deserialization), use an `Initialize()` method:

```csharp
/// <summary>
/// MonoBehaviour with method injection via Initialize().
/// Call this after Instantiate() / scene load to provide dependencies.
/// </summary>
public class EnemyAI : MonoBehaviour
{
    private IPlayerTracker _player;
    private IAudioService _audio;

    // WHY Initialize() instead of constructor: Unity creates MonoBehaviours
    // internally — we can't use constructors. Initialize() is the next best thing.
    // Call it from the spawner or scene bootstrapper.
    public void Initialize(IPlayerTracker player, IAudioService audio)
    {
        _player = player;
        _audio = audio;
    }

    private void Update()
    {
        if (_player == null) return;  // Guard until initialized

        Vector3 target = _player.Position;
        // ... AI logic using injected dependencies
    }
}
```

---

## Level 1: Service Locator Pattern

A **service locator** is a lightweight registry that systems query for their dependencies. It's simpler than full DI but still decouples consumers from concrete implementations:

```csharp
using System;
using System.Collections.Generic;

/// <summary>
/// Minimal service locator. Register services during bootstrap,
/// resolve them anywhere. Supports interface-based registration
/// for easy testing and swapping.
/// </summary>
public static class ServiceLocator
{
    // WHY static Dictionary: a global registry that's accessible without
    // requiring a reference to a specific GameObject or MonoBehaviour.
    private static readonly Dictionary<Type, object> _services = new();

    /// <summary>
    /// Register a service implementation for a given interface type.
    /// Call during bootstrap scene initialization.
    /// </summary>
    public static void Register<T>(T service) where T : class
    {
        _services[typeof(T)] = service
            ?? throw new ArgumentNullException(nameof(service));
    }

    /// <summary>
    /// Retrieve a registered service. Throws if not registered.
    /// </summary>
    public static T Get<T>() where T : class
    {
        if (_services.TryGetValue(typeof(T), out var service))
            return (T)service;

        throw new InvalidOperationException(
            $"Service {typeof(T).Name} not registered. " +
            "Ensure it is registered in the bootstrap scene.");
    }

    /// <summary>
    /// Try to retrieve a service without throwing.
    /// Returns false if the service is not registered.
    /// </summary>
    public static bool TryGet<T>(out T service) where T : class
    {
        if (_services.TryGetValue(typeof(T), out var obj))
        {
            service = (T)obj;
            return true;
        }
        service = null;
        return false;
    }

    /// <summary>
    /// Clear all services. Call on application quit or test teardown.
    /// </summary>
    public static void Clear() => _services.Clear();
}
```

### Bootstrap Registration

```csharp
using UnityEngine;

/// <summary>
/// Bootstrap scene script — registers all core services before
/// loading the first gameplay scene. This is the composition root.
/// </summary>
public class GameBootstrap : MonoBehaviour
{
    [SerializeField] private AudioService _audioService;
    [SerializeField] private SaveService _saveService;

    // WHY a dedicated bootstrap scene: it guarantees initialization order.
    // All services are registered before any gameplay code tries to use them.
    // Load gameplay scenes additively after bootstrap completes.
    private void Awake()
    {
        ServiceLocator.Register<IAudioService>(_audioService);
        ServiceLocator.Register<ISaveService>(_saveService);
        ServiceLocator.Register<IPlayerTracker>(new PlayerTracker());

        // Load the first gameplay scene additively
        UnityEngine.SceneManagement.SceneManager.LoadScene("MainMenu",
            UnityEngine.SceneManagement.LoadSceneMode.Additive);
    }

    private void OnApplicationQuit()
    {
        ServiceLocator.Clear();
    }
}
```

### Trade-offs

| Aspect | Service Locator | Full DI (VContainer) |
|--------|----------------|---------------------|
| **Setup complexity** | Minimal — one static class | Moderate — LifetimeScope per scene |
| **Dependencies visible?** | No — hidden inside method bodies | Yes — declared in Configure() |
| **Testability** | Moderate — must register mocks globally | High — scope per test, auto-inject |
| **Compile-time safety** | No — runtime errors if service missing | Partial — missing registrations caught at container build |
| **Best for** | Small teams, prototypes, game jams | Medium-to-large projects, teams with testing culture |

---

## Level 2: VContainer (Recommended DI Framework)

[VContainer](https://vcontainer.hadashikick.jp/) is the recommended DI framework for Unity 6 projects. It is 5–10x faster than Zenject, has zero GC allocation at resolve time, and integrates deeply with Unity's scene lifecycle.

### Installation

Install via Unity Package Manager using the Git URL:
```
https://github.com/hadashiA/VContainer.git?path=VContainer/Assets/VContainer#1.16.0
```

Or via OpenUPM:
```bash
openupm add jp.hadashikick.vcontainer
```

### Core Concepts

| Concept | What it does |
|---------|-------------|
| `LifetimeScope` | A MonoBehaviour that defines a DI scope. One per scene (or nested for subscopes). |
| `IContainerBuilder` | Registration API inside `Configure()`. Maps interfaces to implementations. |
| `IObjectResolver` | Resolution API. Injected into classes that need to create instances dynamically. |
| `[Inject]` attribute | Marks constructors, methods, or fields for automatic injection. |

### Basic Setup

```csharp
using VContainer;
using VContainer.Unity;

/// <summary>
/// Root scope — lives in the bootstrap scene, persists across scene loads.
/// Registers globally-shared services.
/// </summary>
public class RootLifetimeScope : LifetimeScope
{
    // WHY LifetimeScope: it's the composition root — the single place where
    // you wire up which concrete class implements which interface.
    // This replaces scattered GetComponent/FindObject calls throughout the project.
    protected override void Configure(IContainerBuilder builder)
    {
        // Register a singleton service (one instance shared everywhere)
        builder.Register<IAudioService, AudioService>(Lifetime.Singleton);

        // Register a transient service (new instance per injection)
        builder.Register<IDamageCalculator, StandardDamageCalculator>(Lifetime.Transient);

        // Register a MonoBehaviour from the scene
        builder.RegisterComponentInHierarchy<PlayerController>();

        // Register an entry point — a pure C# class that receives
        // IStartable, ITickable, IDisposable lifecycle callbacks
        // WITHOUT being a MonoBehaviour.
        builder.RegisterEntryPoint<GameFlowController>();
    }
}
```

### Entry Points: Pure C# Game Logic

VContainer's entry points let you write game logic in pure C# classes — no MonoBehaviour required:

```csharp
using VContainer.Unity;

/// <summary>
/// Game flow controller — runs as a pure C# entry point.
/// Receives DI lifecycle callbacks (Start, Tick, Dispose)
/// without inheriting MonoBehaviour.
/// </summary>
public class GameFlowController : IStartable, ITickable, IDisposable
{
    private readonly IAudioService _audio;
    private readonly ISceneService _scenes;

    // WHY constructor injection in entry points: VContainer creates this
    // class and automatically provides all constructor parameters from
    // the container. Dependencies are explicit and immutable.
    public GameFlowController(IAudioService audio, ISceneService scenes)
    {
        _audio = audio;
        _scenes = scenes;
    }

    // Called once when the scope initializes (like Start)
    public void Initialize()
    {
        _audio.PlayMusic("MainTheme");
    }

    // Called every frame (like Update) — driven by VContainer's PlayerLoopSystem
    public void Tick()
    {
        // Game flow logic — state machine, phase transitions, etc.
    }

    // Called when the scope is destroyed (like OnDestroy)
    public void Dispose()
    {
        _audio.StopMusic();
    }
}
```

### Scene-Scoped Dependencies

Each scene can have its own `LifetimeScope` that inherits from the root:

```csharp
/// <summary>
/// Gameplay scene scope — inherits from RootLifetimeScope.
/// Services registered here are available only while this scene is loaded.
/// </summary>
public class GameplayLifetimeScope : LifetimeScope
{
    [SerializeField] private EnemySpawner _enemySpawner;

    protected override void Configure(IContainerBuilder builder)
    {
        // WHY scene scope: the EnemySpawner only exists during gameplay.
        // When the scene unloads, this scope is disposed, and all
        // scene-scoped services are cleaned up automatically.
        builder.RegisterComponent(_enemySpawner);
        builder.Register<IWaveManager, WaveManager>(Lifetime.Scoped);
        builder.RegisterEntryPoint<GameplayLoop>();
    }
}
```

### Injecting into MonoBehaviours

MonoBehaviours that exist in the scene can receive injection via the `[Inject]` attribute:

```csharp
using VContainer;
using UnityEngine;

public class EnemyAI : MonoBehaviour
{
    // WHY [Inject] method: VContainer calls this after the MonoBehaviour is
    // created/found. It's equivalent to constructor injection for MonoBehaviours.
    // The method name doesn't matter — [Inject] is what VContainer looks for.
    [Inject]
    public void Construct(IPlayerTracker player, IAudioService audio)
    {
        _player = player;
        _audio = audio;
    }

    private IPlayerTracker _player;
    private IAudioService _audio;

    private void Update()
    {
        Vector3 target = _player.Position;
        // ... AI logic with injected dependencies
    }
}
```

---

## Architecture Patterns for Unity

### Event Bus (Decoupled Communication)

An event bus enables fire-and-forget communication between systems without direct references:

```csharp
using System;
using System.Collections.Generic;

/// <summary>
/// Simple type-based event bus. Systems publish events;
/// other systems subscribe to event types they care about.
/// No direct references between publisher and subscriber.
/// </summary>
public class EventBus
{
    // WHY Dictionary<Type, Delegate>: events are identified by their type.
    // This avoids string-based event names (typo-prone) and provides
    // compile-time type safety for event payloads.
    private readonly Dictionary<Type, Delegate> _handlers = new();

    public void Subscribe<T>(Action<T> handler) where T : struct
    {
        if (_handlers.TryGetValue(typeof(T), out var existing))
            _handlers[typeof(T)] = Delegate.Combine(existing, handler);
        else
            _handlers[typeof(T)] = handler;
    }

    public void Unsubscribe<T>(Action<T> handler) where T : struct
    {
        if (_handlers.TryGetValue(typeof(T), out var existing))
        {
            var updated = Delegate.Remove(existing, handler);
            if (updated == null)
                _handlers.Remove(typeof(T));
            else
                _handlers[typeof(T)] = updated;
        }
    }

    public void Publish<T>(T evt) where T : struct
    {
        if (_handlers.TryGetValue(typeof(T), out var handler))
            ((Action<T>)handler)?.Invoke(evt);
    }
}

// Events are lightweight structs — no allocation when published
public struct EnemyDiedEvent
{
    public int EnemyId;
    public Vector3 Position;
    public int XpReward;
}

public struct PlayerDamagedEvent
{
    public int Damage;
    public int RemainingHealth;
}
```

### Model-View-Presenter (MVP)

MVP separates UI from game logic, making both independently testable:

```csharp
// MODEL — pure data, no Unity dependencies
public class PlayerModel
{
    public int Health { get; private set; }
    public int MaxHealth { get; }
    public event Action<int, int> HealthChanged;

    public PlayerModel(int maxHealth)
    {
        MaxHealth = maxHealth;
        Health = maxHealth;
    }

    public void TakeDamage(int amount)
    {
        Health = Math.Max(0, Health - amount);
        HealthChanged?.Invoke(Health, MaxHealth);
    }
}

// VIEW — Unity UI, no logic
public class PlayerHealthView : MonoBehaviour
{
    [SerializeField] private UIDocument _document;
    private ProgressBar _healthBar;
    private Label _healthText;

    private void OnEnable()
    {
        var root = _document.rootVisualElement;
        _healthBar = root.Q<ProgressBar>("health-bar");
        _healthText = root.Q<Label>("health-text");
    }

    // WHY the view has no logic: it just displays what it's told.
    // The presenter decides WHEN and WHAT to display.
    public void UpdateHealth(int current, int max)
    {
        _healthBar.value = (float)current / max * 100f;
        _healthText.text = $"{current}/{max}";
    }
}

// PRESENTER — mediates between model and view
public class PlayerHealthPresenter : IDisposable
{
    private readonly PlayerModel _model;
    private readonly PlayerHealthView _view;

    public PlayerHealthPresenter(PlayerModel model, PlayerHealthView view)
    {
        _model = model;
        _view = view;
        _model.HealthChanged += OnHealthChanged;
        // Initialize view
        _view.UpdateHealth(_model.Health, _model.MaxHealth);
    }

    private void OnHealthChanged(int current, int max)
    {
        _view.UpdateHealth(current, max);
    }

    public void Dispose()
    {
        _model.HealthChanged -= OnHealthChanged;
    }
}
```

---

## When to Use What

| Project Size | Recommended Approach |
|-------------|---------------------|
| Game jam / prototype | Direct references + `[SerializeField]` — simplest, fastest to set up |
| Small indie (1-3 devs) | Service Locator + ScriptableObject events — low overhead, no extra packages |
| Medium project (3-10 devs) | VContainer + Event Bus + MVP — testable, scalable, clear boundaries |
| Large project (10+ devs) | VContainer + full MVP/MVVM + domain modules with assembly definitions |

---

## Common Pitfalls

1. **Over-engineering small projects** — DI adds indirection. For a game jam, `[SerializeField]` references are perfectly fine.

2. **Circular dependencies** — if A depends on B and B depends on A, the container cannot resolve either. Break the cycle with an event bus or an interface that both share.

3. **Forgetting to dispose scopes** — VContainer disposes scoped services when the `LifetimeScope` is destroyed. If you bypass the scope (e.g., `DontDestroyOnLoad` without a root scope), services leak.

4. **Injecting into prefabs instantiated at runtime** — VContainer doesn't auto-inject into `Instantiate()`'d objects. Use `IObjectResolver.Instantiate()` instead:

```csharp
// WRONG: Unity's Instantiate — VContainer doesn't know about this object
var enemy = Object.Instantiate(enemyPrefab);

// CORRECT: VContainer's Instantiate — dependencies are injected automatically
var enemy = _resolver.Instantiate(enemyPrefab);
```

5. **Registering everything as Singleton** — not all services need to be singletons. Use `Lifetime.Transient` for stateless services and `Lifetime.Scoped` for scene-bound services.

---

## Further Reading

- [VContainer Documentation](https://vcontainer.hadashikick.jp/)
- [VContainer GitHub (hadashiA)](https://github.com/hadashiA/VContainer)
- [Unity Learn: Design Patterns for Game Development](https://learn.unity.com/course/design-patterns-unity-6)
- [Game Programming Patterns — Robert Nystrom](https://gameprogrammingpatterns.com/)
