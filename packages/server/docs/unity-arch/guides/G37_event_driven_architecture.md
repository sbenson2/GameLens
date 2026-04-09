# G37 — Event-Driven Architecture & Messaging Patterns

> **Category:** guide · **Engine:** Unity 6 (6000.x) · **Related:** [G14 ScriptableObject Architecture](G14_scriptable_object_architecture.md) · [G1 Scene Management](G1_scene_management.md) · [G34 Dependency Injection](G34_dependency_injection_architecture.md) · [Unity Rules](../unity-arch-rules.md)

Games are reactive systems — a coin is collected, a door opens, a boss dies, the UI updates. Wiring these interactions with direct references creates fragile spaghetti code that breaks when you move, rename, or reorder anything. **Event-driven architecture** decouples the sender ("something happened") from the receiver ("here's what I do about it"), producing modular systems that survive refactoring, cross scene boundaries, and let designers iterate without touching code.

This guide covers four progressively powerful patterns: C# events/delegates, UnityEvents, ScriptableObject event channels, and a static event bus. Choose the lightest pattern that solves your problem.

---

## Pattern Comparison

| Pattern | Coupling | Designer-Friendly | Cross-Scene | Performance | Best For |
|---------|----------|-------------------|-------------|-------------|----------|
| C# event / delegate | Low (interface) | No | Yes (if static) | Fastest | Programmer-to-programmer |
| UnityEvent | Medium | Yes (Inspector) | No | Slower (reflection) | Single-object callbacks |
| ScriptableObject Channel | Very low | Yes (asset refs) | Yes | Fast | Cross-system, designer-driven |
| Static Event Bus | None | No | Yes | Fast | Global game events |

---

## Pattern 1: C# Events and Delegates

The foundation of all event patterns in C#. Use when both the raiser and listener are in code and you want compile-time safety.

```csharp
using System;
using UnityEngine;

/// <summary>
/// A health component that broadcasts damage and death events.
/// Listeners subscribe in code — no Inspector wiring needed.
/// </summary>
public class Health : MonoBehaviour
{
    // 'event' keyword prevents external code from invoking the delegate —
    // only this class can raise it. Listeners can only += and -=.
    public event Action<float, float> OnHealthChanged;  // (current, max)
    public event Action OnDeath;

    [SerializeField] private float _maxHealth = 100f;
    private float _currentHealth;

    private void Awake()
    {
        _currentHealth = _maxHealth;
    }

    public void TakeDamage(float amount)
    {
        _currentHealth = Mathf.Max(0f, _currentHealth - amount);

        // The ?. (null-conditional) invokes only if someone is listening.
        // This avoids NullReferenceException when no one has subscribed.
        OnHealthChanged?.Invoke(_currentHealth, _maxHealth);

        if (_currentHealth <= 0f)
        {
            OnDeath?.Invoke();
        }
    }
}

/// <summary>
/// A UI element that listens to Health events. No direct reference to the
/// UI is needed in Health — they're decoupled via the event.
/// </summary>
public class HealthBar : MonoBehaviour
{
    [SerializeField] private Health _target;

    private void OnEnable()
    {
        // Subscribe when active — always pair with unsubscribe.
        _target.OnHealthChanged += UpdateBar;
    }

    private void OnDisable()
    {
        // Unsubscribe to prevent memory leaks and MissingReferenceException
        // when this object is destroyed before the Health component.
        _target.OnHealthChanged -= UpdateBar;
    }

    private void UpdateBar(float current, float max)
    {
        // Update slider, tween, etc.
        float ratio = current / max;
        Debug.Log($"Health: {ratio:P0}");
    }
}
```

### When to Use

- Internal component communication (Health → HealthBar, Inventory → UI).
- You want compile-time type safety and auto-complete.
- Both sides are in code, not designed in the Inspector.

### Gotchas

- **Always unsubscribe** in `OnDisable` or `OnDestroy`. Orphaned subscriptions are the #1 source of event-related bugs.
- **Anonymous lambdas can't be unsubscribed**: `OnDeath += () => Destroy(gameObject);` — you can never remove that listener. Use named methods instead.

---

## Pattern 2: UnityEvents (Inspector-Wired)

UnityEvents let designers wire up responses in the Inspector without code. They're the same system behind Button.onClick.

```csharp
using UnityEngine;
using UnityEngine.Events;

/// <summary>
/// A trigger zone that fires a UnityEvent when the player enters.
/// Designers drag-and-drop responses in the Inspector:
/// e.g., enable a light, play a sound, start a cutscene.
/// </summary>
public class TriggerZone : MonoBehaviour
{
    [Header("Fires when a player enters the trigger collider")]
    [SerializeField] private UnityEvent _onPlayerEnter;

    [Header("Fires with the entering player's name")]
    [SerializeField] private UnityEvent<string> _onPlayerEnterNamed;

    private void OnTriggerEnter(Collider other)
    {
        if (other.CompareTag("Player"))
        {
            // Invoke calls every listener wired in the Inspector.
            _onPlayerEnter?.Invoke();
            _onPlayerEnterNamed?.Invoke(other.name);
        }
    }
}
```

### When to Use

- Designers need to wire up simple cause-and-effect without code.
- One-off events (button clicks, trigger zones, animation events).
- Prototyping — fast to set up, easy to change.

### When NOT to Use

- High-frequency events (every frame, every physics tick) — UnityEvents use reflection and allocate garbage.
- Cross-scene communication — Inspector references break across scenes.

---

## Pattern 3: ScriptableObject Event Channels (Recommended)

This is the **gold standard** pattern for Unity event architecture. A ScriptableObject acts as a shared "channel" that any component can broadcast to or listen on. Because ScriptableObjects are assets, references survive scene loads and are visible in the Inspector.

### The Channel Asset

```csharp
using System;
using UnityEngine;

/// <summary>
/// A ScriptableObject that acts as a decoupled event channel.
/// Create instances via Assets → Create → Events → Void Event Channel.
/// Any script can raise it; any script can listen. Neither knows about the other.
/// </summary>
[CreateAssetMenu(menuName = "Events/Void Event Channel", fileName = "NewVoidEvent")]
public class VoidEventChannel : ScriptableObject
{
    // Action with no parameters — "something happened, no details."
    private Action _onEventRaised;

    /// <summary>Subscribe to this channel.</summary>
    public void Subscribe(Action listener) => _onEventRaised += listener;

    /// <summary>Unsubscribe from this channel.</summary>
    public void Unsubscribe(Action listener) => _onEventRaised -= listener;

    /// <summary>Broadcast to all subscribers.</summary>
    public void Raise()
    {
        _onEventRaised?.Invoke();
    }
}
```

### Generic Channel for Data

```csharp
using System;
using UnityEngine;

/// <summary>
/// Generic event channel that carries a payload of type T.
/// Subclass with a concrete type to make it a createable asset.
/// </summary>
public abstract class EventChannel<T> : ScriptableObject
{
    private Action<T> _onEventRaised;

    public void Subscribe(Action<T> listener) => _onEventRaised += listener;
    public void Unsubscribe(Action<T> listener) => _onEventRaised -= listener;

    public void Raise(T value)
    {
        _onEventRaised?.Invoke(value);
    }
}

/// <summary>Broadcasts an int (score, damage, currency change, etc.).</summary>
[CreateAssetMenu(menuName = "Events/Int Event Channel", fileName = "NewIntEvent")]
public class IntEventChannel : EventChannel<int> { }

/// <summary>Broadcasts a float (health ratio, timer, etc.).</summary>
[CreateAssetMenu(menuName = "Events/Float Event Channel", fileName = "NewFloatEvent")]
public class FloatEventChannel : EventChannel<float> { }

/// <summary>Broadcasts a string (dialogue line, notification, etc.).</summary>
[CreateAssetMenu(menuName = "Events/String Event Channel", fileName = "NewStringEvent")]
public class StringEventChannel : EventChannel<string> { }
```

### Broadcaster (Raises the Event)

```csharp
using UnityEngine;

/// <summary>
/// When the player scores, broadcast to the ScoreChanged channel.
/// The broadcaster doesn't know (or care) who is listening.
/// </summary>
public class ScoreTracker : MonoBehaviour
{
    // Drag the ScoreChanged asset from the Project window here.
    [SerializeField] private IntEventChannel _scoreChanged;

    private int _score;

    public void AddScore(int points)
    {
        _score += points;
        // Broadcast the new score — all subscribers receive it.
        _scoreChanged.Raise(_score);
    }
}
```

### Listener (Responds to the Event)

```csharp
using TMPro;
using UnityEngine;

/// <summary>
/// Updates the score display whenever the ScoreChanged channel fires.
/// This component has zero knowledge of ScoreTracker.
/// </summary>
public class ScoreDisplay : MonoBehaviour
{
    [SerializeField] private IntEventChannel _scoreChanged;
    [SerializeField] private TMP_Text _label;

    private void OnEnable()
    {
        _scoreChanged.Subscribe(OnScoreChanged);
    }

    private void OnDisable()
    {
        _scoreChanged.Unsubscribe(OnScoreChanged);
    }

    private void OnScoreChanged(int newScore)
    {
        _label.text = $"Score: {newScore}";
    }
}
```

### Designer-Friendly Listener (with UnityEvent)

```csharp
using UnityEngine;
using UnityEngine.Events;

/// <summary>
/// A reusable listener MonoBehaviour. Designers drop it on any GameObject
/// and wire responses in the Inspector — no code needed per use.
/// </summary>
public class VoidEventListener : MonoBehaviour
{
    [SerializeField] private VoidEventChannel _channel;
    [SerializeField] private UnityEvent _response;

    private void OnEnable()  => _channel.Subscribe(OnEventRaised);
    private void OnDisable() => _channel.Unsubscribe(OnEventRaised);

    private void OnEventRaised() => _response?.Invoke();
}
```

### Why This Pattern Wins

- **Cross-scene**: ScriptableObject assets exist in the Project, not in a scene. Listeners in Scene A can respond to events raised in Scene B.
- **Designer-friendly**: Create new event channels as assets in the Project window. No code changes needed to add new events.
- **Testable**: Raise an event channel in a unit test without instantiating GameObjects.
- **No singletons**: No static state, no service locators. Just asset references.

---

## Pattern 4: Static Event Bus (Global Events)

For truly global game events where you don't want to manage asset references — pause, quit, achievement unlocked, scene loaded.

```csharp
using System;
using System.Collections.Generic;

/// <summary>
/// A lightweight static event bus. Any script can publish or subscribe
/// to events by type. No MonoBehaviour or ScriptableObject needed.
///
/// Trade-off: global state is harder to test and debug than SO channels.
/// Use sparingly for truly game-wide events.
/// </summary>
public static class EventBus
{
    // Each event type T gets its own subscriber list.
    private static readonly Dictionary<Type, Delegate> _events = new();

    /// <summary>Subscribe to events of type T.</summary>
    public static void Subscribe<T>(Action<T> handler)
    {
        var type = typeof(T);
        if (_events.TryGetValue(type, out var existing))
        {
            _events[type] = Delegate.Combine(existing, handler);
        }
        else
        {
            _events[type] = handler;
        }
    }

    /// <summary>Unsubscribe from events of type T.</summary>
    public static void Unsubscribe<T>(Action<T> handler)
    {
        var type = typeof(T);
        if (_events.TryGetValue(type, out var existing))
        {
            var result = Delegate.Remove(existing, handler);
            if (result == null)
                _events.Remove(type);
            else
                _events[type] = result;
        }
    }

    /// <summary>Publish an event — all subscribers of type T are notified.</summary>
    public static void Publish<T>(T eventData)
    {
        if (_events.TryGetValue(typeof(T), out var handler))
        {
            (handler as Action<T>)?.Invoke(eventData);
        }
    }

    /// <summary>Clear all subscriptions. Call on domain reload or app quit.</summary>
    public static void Clear() => _events.Clear();
}

// Events are plain structs — lightweight, no allocation.
public struct PlayerDiedEvent
{
    public string PlayerName;
    public Vector3 Position;
}

public struct SceneLoadedEvent
{
    public string SceneName;
    public float LoadTime;
}

// Usage:
// EventBus.Subscribe<PlayerDiedEvent>(OnPlayerDied);
// EventBus.Publish(new PlayerDiedEvent { PlayerName = "Hero", Position = transform.position });
```

### Caution

- **Domain reload**: In Unity's Enter Play Mode settings, if you disable domain reload, static state persists between play sessions. Call `EventBus.Clear()` via `[RuntimeInitializeOnLoadMethod]` to avoid stale subscriptions.
- **Debugging**: Static events are invisible in the Inspector. Add logging in `Publish` during development.
- **Prefer SO channels** for most cases. Reserve the static bus for events that truly every system needs (pause, quit, fatal error).

---

## Choosing the Right Pattern

```
Do you need Inspector wiring?
├── Yes → Is it cross-scene?
│   ├── Yes → ScriptableObject Event Channel (Pattern 3)
│   └── No  → UnityEvent (Pattern 2)
└── No  → Is it game-global (pause, quit)?
    ├── Yes → Static Event Bus (Pattern 4)
    └── No  → C# event/delegate (Pattern 1)
```

---

## Performance Considerations

- **C# events** and **ScriptableObject channels**: effectively zero overhead — delegate invocation is nanoseconds.
- **UnityEvents**: uses serialization and reflection. Fine for button clicks, not for per-frame events.
- **Static EventBus**: dictionary lookup + delegate invoke. Fast enough for any game event frequency, but profile if you're publishing thousands per frame.
- **Allocation**: `Action<T>` delegates don't allocate when using named methods. Lambdas and closures allocate — avoid in hot paths.

---

## Common Mistakes

| Mistake | Fix |
|---------|-----|
| Forgetting to unsubscribe | Always pair Subscribe in `OnEnable` with Unsubscribe in `OnDisable` |
| Subscribing in `Awake`, unsubscribing in `OnDestroy` | Use `OnEnable`/`OnDisable` — respects enable/disable toggling |
| Using events for per-frame data | Use a shared ScriptableObject variable or direct reference instead |
| Too many event channels | Group related data into a single event struct instead of one channel per field |
| Circular event chains | A raises B raises A → infinite loop. Add guards or redesign the dependency |

---

## See Also

- [G14 ScriptableObject Architecture](G14_scriptable_object_architecture.md) — ScriptableObject patterns beyond events
- [G34 Dependency Injection Architecture](G34_dependency_injection_architecture.md) — Alternative decoupling strategy
- [G1 Scene Management](G1_scene_management.md) — Cross-scene communication needs
- [Unity Official: ScriptableObjects as Event Channels](https://unity.com/how-to/scriptableobjects-event-channels-game-code)
- [Unity Official: Architect Code with ScriptableObjects](https://unity.com/how-to/architect-game-code-scriptable-objects)
