# G62 — Serialization Deep Dive

> **Category:** guide · **Engine:** Unity 6 (6000.x) · **Related:** [ScriptableObject Architecture](G14_scriptable_object_architecture.md) · [Save/Load System](G6_save_load_system.md) · [Unity Rules](../unity-arch-rules.md)

Unity's serialization system underpins scenes, prefabs, assets, the Inspector, undo/redo, and hot-reload. Understanding its rules — and its limits — is essential for designing data-driven games. This guide covers serialization rules, `[SerializeField]`, `[SerializeReference]`, `ISerializationCallbackReceiver`, custom serialization patterns, and the new serialization analyzer in Unity 6.

---

## How Unity Serialization Works

Unity uses a **binary/YAML serializer** that operates at the field level. When Unity saves an object (scene, prefab, ScriptableObject), it walks each serializable field and writes its value. When loading, it reconstructs objects and injects field values.

### What Unity Can Serialize (by default)

| Supported | Type Examples |
|-----------|--------------|
| Primitives | `int`, `float`, `bool`, `string` |
| Unity types | `Vector3`, `Color`, `AnimationCurve`, `Gradient` |
| Enums | Any C# enum |
| Arrays / Lists | `int[]`, `List<string>` (one level deep) |
| Unity Object refs | `GameObject`, `Transform`, `Texture2D`, any `UnityEngine.Object` subclass |
| Custom classes | Classes marked `[Serializable]` with serializable fields |

### What Unity Cannot Serialize Directly

- Dictionaries (`Dictionary<K,V>`)
- Nested collections (`List<List<int>>`)
- Properties (only fields are serialized)
- Static fields
- Delegates / events
- Interfaces (without `[SerializeReference]`)
- Polymorphic types (without `[SerializeReference]`)
- Nullable value types (`int?`) — supported starting Unity 2022.2+

---

## `[SerializeField]` vs `[SerializeReference]`

These two attributes solve different problems. Confusing them is one of the most common Unity serialization mistakes.

### `[SerializeField]` — Value Serialization (Default)

```csharp
using System;
using UnityEngine;

[Serializable]
public class WeaponStats
{
    public string name;
    public int damage;
    public float fireRate;
}

public class Player : MonoBehaviour
{
    // WHY [SerializeField] on a private field: Exposes it in the Inspector
    // while keeping the C# access modifier private. Best of both worlds —
    // Inspector-editable but not accessible from other scripts.
    [SerializeField] private WeaponStats _primaryWeapon;
    [SerializeField] private WeaponStats _secondaryWeapon;
}
```

**Key behavior:** Value serialization creates **inline copies**. If `_primaryWeapon` and `_secondaryWeapon` point to the same object in code, Unity serializes two independent copies. After deserialization, they are separate instances.

### `[SerializeReference]` — Reference Serialization

```csharp
using System;
using UnityEngine;

// WHY [SerializeReference] here: We need polymorphism — the field type is
// the base interface, but the actual object could be any implementing class.
// Value serialization would lose the derived type information.
public interface IDamageEffect
{
    void Apply(GameObject target);
}

[Serializable]
public class FireDamage : IDamageEffect
{
    public float burnDuration = 3f;
    public float tickDamage = 5f;

    public void Apply(GameObject target)
    {
        // Apply burning effect
    }
}

[Serializable]
public class FrostDamage : IDamageEffect
{
    public float slowPercent = 0.5f;
    public float freezeChance = 0.1f;

    public void Apply(GameObject target)
    {
        // Apply frost effect
    }
}

public class Weapon : MonoBehaviour
{
    [SerializeReference]
    private IDamageEffect _damageEffect;  // Could be FireDamage, FrostDamage, etc.

    [SerializeReference]
    private List<IDamageEffect> _secondaryEffects = new();  // Polymorphic list
}
```

### When to Use Which

| Need | Use |
|------|-----|
| Simple data (stats, config) | `[SerializeField]` (default value serialization) |
| Polymorphic types (interfaces, abstract bases) | `[SerializeReference]` |
| Null support (distinguish null from default) | `[SerializeReference]` |
| Shared references (two fields → same object) | `[SerializeReference]` |
| Cyclic graphs (A → B → A) | `[SerializeReference]` |
| Maximum performance / minimal file size | `[SerializeField]` (inline is cheaper) |

> **Performance note:** `[SerializeReference]` is slower than inline serialization in terms of storage, memory, and load/save time. Use it only when you need its specific features.

---

## `ISerializationCallbackReceiver` — Bridging the Gap

When Unity can't serialize your data natively (dictionaries, complex graphs, custom formats), use `ISerializationCallbackReceiver` to convert between your runtime representation and a serializable form.

```csharp
using System;
using System.Collections.Generic;
using UnityEngine;

// WHY this pattern: Unity can't serialize Dictionary<K,V> directly.
// ISerializationCallbackReceiver lets you convert the dictionary to
// parallel arrays before save and reconstruct it after load.
[Serializable]
public class SerializableDictionary<TKey, TValue> : ISerializationCallbackReceiver
{
    // Runtime data structure (not serialized by Unity)
    private Dictionary<TKey, TValue> _dictionary = new();

    // Serialized backing storage — Unity CAN serialize parallel lists
    [SerializeField] private List<TKey> _keys = new();
    [SerializeField] private List<TValue> _values = new();

    public void OnBeforeSerialize()
    {
        // WHY OnBeforeSerialize: Called right before Unity writes this
        // object to disk or copies it. Convert runtime dict → arrays.
        _keys.Clear();
        _values.Clear();
        foreach (var kvp in _dictionary)
        {
            _keys.Add(kvp.Key);
            _values.Add(kvp.Value);
        }
    }

    public void OnAfterDeserialize()
    {
        // WHY OnAfterDeserialize: Called after Unity has loaded the
        // serialized data. Rebuild the dict from the arrays.
        _dictionary = new Dictionary<TKey, TValue>();
        for (int i = 0; i < Mathf.Min(_keys.Count, _values.Count); i++)
        {
            _dictionary[_keys[i]] = _values[i];
        }
    }

    // Public API wrapping the dictionary
    public TValue this[TKey key]
    {
        get => _dictionary[key];
        set => _dictionary[key] = value;
    }

    public bool TryGetValue(TKey key, out TValue value) =>
        _dictionary.TryGetValue(key, out value);

    public void Add(TKey key, TValue value) => _dictionary.Add(key, value);
    public bool Remove(TKey key) => _dictionary.Remove(key);
    public int Count => _dictionary.Count;
}
```

### Usage

```csharp
public class LootTable : ScriptableObject
{
    // WHY SerializableDictionary: Item name → drop chance.
    // The Inspector shows _keys and _values arrays, which are editable.
    // At runtime, lookups use the fast Dictionary<K,V>.
    [SerializeField]
    private SerializableDictionary<string, float> _dropChances = new();
}
```

### Important Threading Caveat

```csharp
public void OnBeforeSerialize()
{
    // WARNING: This callback runs on the serialization thread, NOT the
    // main thread. Do NOT call Unity APIs (GetComponent, Instantiate,
    // Debug.Log, etc.) here — they are not thread-safe.
    // Only process fields that belong directly to this object.
}
```

---

## Serialization Rules Analyzer (Unity 6)

Unity 6 introduced a **serialization rules analyzer** (Roslyn-based) that catches common mistakes at compile time instead of silently failing at runtime.

### What It Detects

| Diagnostic ID | Problem |
|---------------|---------|
| `UNT0027` | Field marked `[SerializeField]` on a non-serializable type |
| `UNT0028` | `[SerializeReference]` on a value type (must be reference type) |
| `UNT0029` | Serializable class missing `[Serializable]` attribute |
| `UNT0030` | Generic field that Unity cannot serialize |

### Configuration (Unity 6.3+)

In Unity 6.3, the analyzer is configurable via `.editorconfig` or project settings:

```ini
# .editorconfig — Elevate serialization warnings to errors
[*.cs]
dotnet_diagnostic.UNT0027.severity = error
dotnet_diagnostic.UNT0029.severity = error
```

> **WHY use the analyzer:** Silent serialization failures are one of the hardest bugs to track. A field that "should" persist just… doesn't. The analyzer catches this at edit time.

---

## JSON Serialization for Save Data

Unity's built-in `JsonUtility` is fast but limited. For save systems, understand its constraints:

```csharp
using UnityEngine;

[System.Serializable]
public class SaveData
{
    public string playerName;
    public int level;
    public float[] position;  // Vector3 doesn't serialize well in JSON
    public InventorySlot[] inventory;
}

[System.Serializable]
public class InventorySlot
{
    public string itemId;
    public int count;
}

public static class SaveSystem
{
    public static string Serialize(SaveData data)
    {
        // WHY JsonUtility over System.Text.Json / Newtonsoft:
        // JsonUtility uses the same serializer as the Inspector — it's
        // fast and consistent with Unity's serialization rules. But it
        // has the same limitations (no dictionaries, no polymorphism).
        return JsonUtility.ToJson(data, prettyPrint: true);
    }

    public static SaveData Deserialize(string json)
    {
        return JsonUtility.FromJson<SaveData>(json);
    }
}
```

### JsonUtility Limitations

| Feature | `JsonUtility` | `Newtonsoft.Json` | `System.Text.Json` |
|---------|---------------|-------------------|---------------------|
| Speed | Fastest (native) | Moderate | Fast |
| Dictionary support | No | Yes | Yes |
| Polymorphism | No | Yes (`$type`) | Yes (with converters) |
| Null support | Limited | Full | Full |
| Custom converters | No | Yes | Yes |
| Unity Object refs | By value only | No | No |
| Available | Built-in | `com.unity.nuget.newtonsoft-json` | .NET BCL (CoreCLR builds) |

### When to Use What

- **Small save data, simple types:** `JsonUtility` — zero dependencies, fastest
- **Complex save data, dictionaries, polymorphism:** `Newtonsoft.Json` via Unity's official NuGet package (`com.unity.nuget.newtonsoft-json`)
- **CoreCLR builds (Unity 6.7+):** `System.Text.Json` becomes available natively as CoreCLR matures

```csharp
// Using Newtonsoft.Json for complex save data (install com.unity.nuget.newtonsoft-json)
using Newtonsoft.Json;

[System.Serializable]
public class ComplexSaveData
{
    public Dictionary<string, int> questProgress;

    // WHY Newtonsoft here: Dictionaries and polymorphic types
    // require a serializer that handles them. JsonUtility can't.
    [JsonProperty(TypeNameHandling = TypeNameHandling.Auto)]
    public List<IQuestObjective> activeObjectives;
}
```

---

## ScriptableObject Serialization Patterns

ScriptableObjects are the preferred way to hold game data in Unity 6. They serialize with the same rules as MonoBehaviours but live as standalone `.asset` files.

```csharp
using System;
using System.Collections.Generic;
using UnityEngine;

// WHY ScriptableObject for game config: They're assets — editable in
// the Inspector, versionable in git (YAML), and shared across scenes
// without duplication. Unlike JSON files, they validate at edit time.
[CreateAssetMenu(fileName = "EnemyConfig", menuName = "Game/Enemy Config")]
public class EnemyConfig : ScriptableObject
{
    [Header("Base Stats")]
    [SerializeField] private string _enemyName;
    [SerializeField, Range(1, 1000)] private int _maxHealth = 100;
    [SerializeField, Range(0f, 50f)] private float _moveSpeed = 5f;

    [Header("Behavior")]
    [SerializeReference]
    private List<IEnemyBehavior> _behaviors = new();

    [Header("Loot")]
    [SerializeField]
    private SerializableDictionary<string, float> _lootTable = new();

    // Public read-only API — data is configured in the Inspector,
    // consumed at runtime via properties.
    public string EnemyName => _enemyName;
    public int MaxHealth => _maxHealth;
    public float MoveSpeed => _moveSpeed;
    public IReadOnlyList<IEnemyBehavior> Behaviors => _behaviors;
}
```

---

## Common Pitfalls

### 1. Missing `[Serializable]` on Custom Classes

```csharp
// WRONG: Unity will silently skip this field — no error, no data
public class Stats
{
    public int health;  // Never saved or shown in Inspector
}

// CORRECT: [Serializable] is required for custom classes
[System.Serializable]
public class Stats
{
    public int health;  // Now appears in Inspector and persists
}
```

### 2. Properties Are Not Serialized

```csharp
[System.Serializable]
public class PlayerData
{
    public int Health { get; set; }    // WRONG: Not serialized (property)
    public int health;                 // CORRECT: Serialized (field)
    [field: SerializeField]
    public int Armor { get; set; }     // CORRECT: [field:] targets the backing field
}
```

### 3. Struct Reference Semantics with `[SerializeReference]`

```csharp
// WRONG: [SerializeReference] requires a reference type (class)
[SerializeReference]
private MyStruct data;  // Compile-time analyzer error in Unity 6

// CORRECT: Use a class
[SerializeReference]
private MyClass data;
```

### 4. Hot Reload Breaking State

```csharp
// Non-serialized fields reset to default on domain reload (code change in Editor).
// If you have runtime state that must survive hot reload:
[SerializeField] private int _importantState;    // Survives reload
private int _transientCache;                      // Lost on reload — this is fine
                                                  // if it's truly just a cache.
```

---

## Version Compatibility Notes

| Feature | Minimum Version |
|---------|-----------------|
| `[SerializeField]` | All Unity versions |
| `[SerializeReference]` | Unity 2019.3+ |
| `[SerializeReference]` stable ID system | Unity 2021.2+ |
| Nullable value type serialization (`int?`) | Unity 2022.2+ |
| Serialization rules analyzer | Unity 6.0 (6000.0) |
| Analyzer `.editorconfig` configuration | Unity 6.3 (6000.3) |
| `[field: SerializeField]` on auto-properties | Unity 2020.1+ |
