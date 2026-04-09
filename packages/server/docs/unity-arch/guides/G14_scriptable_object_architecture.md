# G14 — ScriptableObject Architecture in Unity 6

> **Category:** guide · **Engine:** Unity 6 (6000.x) · **Related:** [Architecture Overview](../architecture/E1_architecture_overview.md) · [Scene Management](G1_scene_management.md) · [Save/Load](G6_save_load_system.md) · [Unity Rules](../unity-arch-rules.md)

ScriptableObjects are Unity's most powerful tool for separating data from logic, building modular systems, and eliminating hard dependencies between MonoBehaviours. This guide covers the core patterns — data containers, event channels, runtime sets, delegate objects, and enum-like definitions — with production-tested examples for Unity 6.

---

## Why ScriptableObjects Matter

Most Unity projects start by storing configuration directly in MonoBehaviour fields. This works for prototypes but collapses at scale:

- **Duplicated data** — every prefab instance carries its own copy of stats, costing memory and making bulk edits painful.
- **Tight coupling** — MonoBehaviours reference each other directly, creating fragile dependency chains that break when you move or rename objects.
- **Merge conflicts** — when designers and programmers edit the same prefab or scene, version control turns hostile.

ScriptableObjects fix all three. They are **asset files** that live in your Project folder, are shared by reference (not copied into each prefab), and can be edited independently of scenes. Because they survive assembly reloads in the editor and persist across play-mode sessions (unless you clone them), they become the backbone of data-driven architecture.

---

## Core Concept: ScriptableObjects Are Assets, Not Scene Objects

A ScriptableObject:

- Lives in the **Project window**, not in a scene hierarchy
- Has **no Transform** — it is pure data/logic, not a world object
- Is **shared by reference** — every MonoBehaviour pointing to the same asset reads the same data
- **Persists in the editor** — changes made during Play Mode stick (this is a feature *and* a footgun)
- Can be created via `CreateAssetMenu` or instantiated at runtime via `ScriptableObject.CreateInstance<T>()`

```
┌─────────────────────────────────────────────────────┐
│  Project Assets (disk)                              │
│  ┌─────────────┐  ┌─────────────┐  ┌────────────┐  │
│  │ EnemyData   │  │ PlayerData  │  │ EventChannel│ │
│  │ (SO asset)  │  │ (SO asset)  │  │ (SO asset)  │  │
│  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘  │
│         │                │                │          │
├─────────┼────────────────┼────────────────┼──────────┤
│  Scene  │                │                │          │
│  ┌──────▼──────┐  ┌──────▼──────┐  ┌──────▼──────┐  │
│  │ EnemyCtrl   │  │ HealthBar   │  │ AudioMgr    │  │
│  │ (MonoBeh)   │  │ (MonoBeh)   │  │ (MonoBeh)   │  │
│  └─────────────┘  └─────────────┘  └─────────────┘  │
└─────────────────────────────────────────────────────┘
```

**Key insight:** the MonoBehaviours above never reference each other. They all point to shared SO assets. You can delete any one of them without breaking the others.

---

## Pattern 1: Data Containers

The simplest and most common pattern. Store configuration in a ScriptableObject so it can be shared, swapped, and edited by designers without touching code.

```csharp
// WeaponData.cs — defines what a weapon IS (immutable config)
using UnityEngine;

[CreateAssetMenu(fileName = "New Weapon", menuName = "GameData/Weapon")]
public class WeaponData : ScriptableObject
{
    [Header("Identity")]
    public string weaponName;
    [TextArea] public string description;
    public Sprite icon;

    [Header("Combat Stats")]
    [Range(1, 100)] public int baseDamage = 10;
    [Range(0.1f, 5f)] public float attackSpeed = 1f;
    [Range(0.5f, 20f)] public float range = 2f;

    [Header("Effects")]
    public GameObject hitVFX;
    public AudioClip hitSFX;
}
```

```csharp
// WeaponController.cs — reads from the SO, owns no data itself
using UnityEngine;

public class WeaponController : MonoBehaviour
{
    // Designers drag-drop a WeaponData asset here in the Inspector.
    // Swapping weapons = swapping one asset reference. Zero code changes.
    [SerializeField] private WeaponData weaponData;

    public void Attack(IDamageable target)
    {
        // All stats come from the shared asset — if a designer
        // tweaks baseDamage, every enemy using this weapon sees it instantly.
        float damage = weaponData.baseDamage * weaponData.attackSpeed;
        target.TakeDamage(damage);

        if (weaponData.hitVFX != null)
            Instantiate(weaponData.hitVFX, transform.position, Quaternion.identity);
    }
}
```

**Why this pattern?**
- 50 enemies sharing the same `WeaponData` asset use one allocation, not 50 copies.
- Designers create new weapon variants by right-clicking → Create → GameData → Weapon. No programmer needed.
- Balancing is fast: tweak the asset, hit Play, see results immediately.

### Runtime Copies for Mutable State

ScriptableObject assets are **shared** — if you modify a field at runtime, every reference sees the change, and in the editor the change persists after exiting Play Mode. For data that changes during gameplay (e.g., current ammo, durability), create a runtime copy:

```csharp
public class WeaponInstance : MonoBehaviour
{
    [SerializeField] private WeaponData templateData;

    // Runtime copy — safe to modify without affecting the original asset
    private WeaponData runtimeData;

    private void Awake()
    {
        // Instantiate() on a ScriptableObject creates a deep clone.
        // This is the recommended Unity 6 pattern for mutable runtime data.
        runtimeData = Instantiate(templateData);
    }

    private void OnDestroy()
    {
        // Clean up the runtime clone to avoid memory leaks
        if (runtimeData != null)
            Destroy(runtimeData);
    }
}
```

---

## Pattern 2: Event Channels

Event channels use ScriptableObjects as **decoupled message buses**. A publisher raises an event on the SO; any number of subscribers respond — without knowing about each other.

```csharp
// GameEvent.cs — a parameterless event channel
using System.Collections.Generic;
using UnityEngine;

[CreateAssetMenu(fileName = "New Event", menuName = "Events/Game Event")]
public class GameEvent : ScriptableObject
{
    // Why HashSet? O(1) add/remove, and prevents double-registration
    private readonly HashSet<GameEventListener> listeners = new();

    public void Raise()
    {
        // Iterate a snapshot to allow listeners to unregister during the callback
        foreach (var listener in new List<GameEventListener>(listeners))
        {
            listener.OnEventRaised();
        }
    }

    public void Register(GameEventListener listener) => listeners.Add(listener);
    public void Unregister(GameEventListener listener) => listeners.Remove(listener);
}
```

```csharp
// GameEventListener.cs — attach to any GameObject to respond to an event
using UnityEngine;
using UnityEngine.Events;

public class GameEventListener : MonoBehaviour
{
    [Tooltip("The SO event channel to subscribe to")]
    [SerializeField] private GameEvent gameEvent;

    [Tooltip("What to do when the event fires — wire this up in the Inspector")]
    [SerializeField] private UnityEvent response;

    private void OnEnable() => gameEvent.Register(this);
    private void OnDisable() => gameEvent.Unregister(this);

    public void OnEventRaised() => response.Invoke();
}
```

### Typed Event Channels

For events that carry data (e.g., damage amount, item collected), use generics:

```csharp
// TypedGameEvent.cs — event channel with a payload
using System;
using UnityEngine;

public abstract class TypedGameEvent<T> : ScriptableObject
{
    private event Action<T> OnRaised;

    public void Raise(T value) => OnRaised?.Invoke(value);
    public void Register(Action<T> callback) => OnRaised += callback;
    public void Unregister(Action<T> callback) => OnRaised -= callback;
}

// Concrete types (Unity can't serialize open generics, so you need these)
[CreateAssetMenu(fileName = "New Int Event", menuName = "Events/Int Event")]
public class IntGameEvent : TypedGameEvent<int> { }

[CreateAssetMenu(fileName = "New Float Event", menuName = "Events/Float Event")]
public class FloatGameEvent : TypedGameEvent<float> { }
```

**Why event channels over a static EventManager?**
- Each event is a visible, drag-droppable asset. Designers can wire up responses without code.
- No singleton dependency — systems remain testable in isolation.
- You can see who listens to what by selecting the event asset and checking references.

---

## Pattern 3: ScriptableObject Variables

Shared, observable variables that act as a lightweight data-binding layer between systems.

```csharp
// FloatVariable.cs — a single float value, shared across systems
using System;
using UnityEngine;

[CreateAssetMenu(fileName = "New Float Var", menuName = "Variables/Float")]
public class FloatVariable : ScriptableObject
{
    [SerializeField] private float initialValue;

    // NonSerialized so runtime changes don't persist to disk
    [NonSerialized] private float runtimeValue;

    // Subscribers get notified when the value changes
    public event Action<float> OnChanged;

    public float Value
    {
        get => runtimeValue;
        set
        {
            if (Mathf.Approximately(runtimeValue, value)) return;
            runtimeValue = value;
            OnChanged?.Invoke(runtimeValue);
        }
    }

    private void OnEnable()
    {
        // Reset to initial value when entering Play Mode or loading the asset.
        // This prevents stale runtime state from leaking between sessions.
        runtimeValue = initialValue;
    }
}
```

**Usage example — health bar reads player HP without referencing the player:**

```csharp
public class HealthBarUI : MonoBehaviour
{
    [SerializeField] private FloatVariable playerHealth;
    [SerializeField] private FloatVariable playerMaxHealth;
    [SerializeField] private UnityEngine.UI.Slider healthSlider;

    private void OnEnable()
    {
        playerHealth.OnChanged += UpdateSlider;
        UpdateSlider(playerHealth.Value); // sync on enable
    }

    private void OnDisable() => playerHealth.OnChanged -= UpdateSlider;

    private void UpdateSlider(float currentHP)
    {
        healthSlider.value = currentHP / playerMaxHealth.Value;
    }
}
```

The health bar and the player character **never reference each other**. Both point to the same `FloatVariable` asset. You can delete either without breaking the other.

---

## Pattern 4: Runtime Sets

Track collections of active game objects without singletons or `FindObjectsOfType`.

```csharp
// RuntimeSet.cs — tracks objects that register/unregister themselves
using System.Collections.Generic;
using UnityEngine;

public abstract class RuntimeSet<T> : ScriptableObject
{
    // Why List instead of HashSet? Order matters for things like
    // "iterate all enemies nearest-first" or "cycle through targets"
    private readonly List<T> items = new();

    public IReadOnlyList<T> Items => items;
    public int Count => items.Count;

    public void Register(T item)
    {
        if (!items.Contains(item))
            items.Add(item);
    }

    public void Unregister(T item) => items.Remove(item);

    // Clear on domain reload / play mode exit to avoid stale references
    private void OnDisable() => items.Clear();
}

// Concrete type for tracking enemy GameObjects
[CreateAssetMenu(fileName = "Enemy Set", menuName = "RuntimeSets/Transform Set")]
public class TransformRuntimeSet : RuntimeSet<Transform> { }
```

```csharp
// EnemyBrain.cs — self-registers into the runtime set
public class EnemyBrain : MonoBehaviour
{
    [SerializeField] private TransformRuntimeSet enemySet;

    private void OnEnable() => enemySet.Register(transform);
    private void OnDisable() => enemySet.Unregister(transform);
}
```

```csharp
// Minimap.cs — reads the set without knowing about enemies
public class MinimapSystem : MonoBehaviour
{
    [SerializeField] private TransformRuntimeSet enemySet;

    private void Update()
    {
        // No FindObjectsOfType, no singleton — just iterate the set
        foreach (var enemy in enemySet.Items)
        {
            DrawBlip(enemy.position);
        }
    }

    private void DrawBlip(Vector3 worldPos) { /* ... */ }
}
```

---

## Pattern 5: Enum-like Definitions

Replace string tags and magic numbers with SO assets that can carry metadata.

```csharp
// DamageType.cs — replaces stringly-typed damage categories
using UnityEngine;

[CreateAssetMenu(fileName = "New DamageType", menuName = "GameData/DamageType")]
public class DamageType : ScriptableObject
{
    [TextArea] public string description;
    public Color uiColor = Color.white;
    public Sprite icon;
    // Adding a new damage type = creating a new asset, no code changes.
}
```

**Why SO enums over C# enums?**
- Adding a new damage type doesn't require recompiling.
- Each type carries rich metadata (icon, color, description) that a plain enum can't hold.
- Designers can create new types without programmer involvement.

---

## Unity 6 Improvements for ScriptableObject Workflows

Unity 6 (6000.x) introduced several features that strengthen SO-based architecture:

| Feature | Benefit for SO workflows |
|---------|-------------------------|
| **`[SerializeReference]` improvements** | Better support for polymorphic fields in SO assets — store derived types in a base-type list |
| **Build Profiles** | Different SO configurations per platform without duplicating assets |
| **UI Toolkit data binding** | Bind UI directly to SO properties, reducing boilerplate in UI code |
| **Faster serialization** | Large SO databases (item DBs with thousands of entries) load and save faster |

---

## Common Pitfalls

### 1. Modifying SO assets at runtime (without cloning)
Changes persist in the editor. Always `Instantiate()` before modifying, or use `[NonSerialized]` fields for runtime state.

### 2. Null references on domain reload
ScriptableObjects survive domain reload, but their `[NonSerialized]` fields reset. Use `OnEnable()` to reinitialize runtime state.

### 3. Circular event chains
Event channel A triggers listener that raises Event B, which triggers a listener that raises Event A. Add guards or use a one-frame delay (`StartCoroutine`) to break cycles.

### 4. Forgetting to unregister
Always unregister in `OnDisable()`, not `OnDestroy()`. `OnDisable` fires before the object is destroyed and also when the scene unloads, catching more edge cases.

### 5. Over-engineering
Not everything needs a ScriptableObject. Local state that only one component uses (e.g., a cooldown timer) belongs in a plain field. Use SOs when data is **shared**, **configured by designers**, or **needs to decouple systems**.

---

## When to Use Each Pattern

| Pattern | Use When |
|---------|----------|
| **Data Container** | Multiple objects share the same config (stats, items, abilities) |
| **Event Channel** | Systems need to communicate without direct references |
| **SO Variable** | A value is read by many systems (player HP, score, ammo count) |
| **Runtime Set** | You need to track active objects globally (enemies, collectibles, waypoints) |
| **Enum-like SO** | Categories that carry metadata and change without recompilation |

---

## Recommended Project Structure

```
Assets/
├── _Data/
│   ├── Events/           # GameEvent assets (OnPlayerDied, OnLevelLoaded, ...)
│   ├── Variables/         # FloatVariable, IntVariable assets
│   ├── RuntimeSets/       # TransformRuntimeSet assets
│   └── Config/
│       ├── Weapons/       # WeaponData assets
│       ├── Enemies/       # EnemyData assets
│       └── DamageTypes/   # DamageType SO-enum assets
├── _Scripts/
│   ├── ScriptableObjects/ # SO class definitions (the C# code)
│   ├── Gameplay/          # MonoBehaviours that consume SOs
│   └── UI/                # UI scripts bound to SO variables/events
```

Prefix data folders with `_` so they sort to the top of the Project window, making them easy for designers to find.
