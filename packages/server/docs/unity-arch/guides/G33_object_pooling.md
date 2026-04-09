# G33 — Object Pooling & Spawn Management in Unity 6

> **Category:** guide · **Engine:** Unity 6 (6000.x, UnityEngine.Pool) · **Related:** [G16 Performance & Memory](G16_performance_optimization_memory.md) · [G9 Addressables](G9_addressables_asset_management.md) · [G13 ECS/DOTS](G13_ecs_dots.md) · [Unity Rules](../unity-arch-rules.md)

Object pooling is a critical optimization pattern for games that frequently create and destroy objects — bullets, particles, enemies, VFX, audio sources, and UI elements. Unity 6 ships a built-in pooling API in the `UnityEngine.Pool` namespace, eliminating the need for hand-rolled solutions in most cases. This guide covers the built-in API, practical patterns, and advanced strategies for large-scale spawn management.

---

## Why Pool?

Every call to `Instantiate()` and `Destroy()` has hidden costs:

1. **Memory allocation** — `Instantiate()` allocates managed memory for each MonoBehaviour, triggers GC pressure
2. **CPU spike** — `Awake()` and `OnEnable()` run synchronously, causing frame hitches when spawning many objects
3. **GC pauses** — `Destroy()` leaves managed references for the garbage collector to clean up
4. **Physics overhead** — adding/removing Rigidbodies and Colliders mid-frame forces PhysX broadphase rebuilds

Pooling trades **memory** (keeping inactive objects alive) for **frame-time stability** (no allocation spikes). On memory-constrained platforms (mobile, WebGL), balance pool sizes carefully.

```
Without Pooling                        With Pooling
──────────────                         ────────────
Frame 100: Instantiate(bullet)  ← GC   Frame 100: pool.Get()        ← 0 alloc
Frame 101: Instantiate(bullet)  ← GC   Frame 101: pool.Get()        ← 0 alloc
Frame 115: Destroy(bullet)      ← GC   Frame 115: pool.Release(obj) ← 0 alloc
Frame 130: Instantiate(bullet)  ← GC   Frame 130: pool.Get()        ← reuse!
```

---

## The UnityEngine.Pool API

Unity provides several pool implementations since Unity 2021, all available in Unity 6:

| Class | Internal Structure | Thread-Safe | Use Case |
|-------|-------------------|-------------|----------|
| `ObjectPool<T>` | Stack | No | General-purpose: GameObjects, components, plain C# objects |
| `LinkedPool<T>` | Linked list | No | When pool size fluctuates widely (avoids array resizing) |
| `CollectionPool<TCollection, TItem>` | Stack of collections | No | Temporary `List<T>`, `HashSet<T>`, `Dictionary<K,V>` |
| `ListPool<T>` | Alias for `CollectionPool<List<T>, T>` | No | Quick temporary lists (e.g., `Physics.OverlapSphereNonAlloc` results) |
| `HashSetPool<T>` | Alias for `CollectionPool<HashSet<T>, T>` | No | Temporary sets for deduplication |
| `DictionaryPool<K,V>` | Alias for `CollectionPool<Dictionary<K,V>, K>` | No | Temporary lookup tables |
| `GenericPool<T>` | Static `ObjectPool<T>` | No | Shared global pool for a type (simple but blocks domain reload) |
| `UnsafeGenericPool<T>` | Static, no checks | No | Like `GenericPool` but skips double-return check (faster, riskier) |

> **Important:** None of these pools are thread-safe. Do not use them from Job System worker threads. For DOTS pooling, use `EntityCommandBuffer.Instantiate` with prefab entities (see [G13 ECS/DOTS](G13_ecs_dots.md)).

---

## Basic Usage: ObjectPool\<T\>

### Pooling GameObjects (Bullets)

```csharp
using UnityEngine;
using UnityEngine.Pool;

/// <summary>
/// Spawns and recycles bullet GameObjects using Unity's built-in ObjectPool.
/// Attach to a manager GameObject that persists across the scene.
/// </summary>
public class BulletPool : MonoBehaviour
{
    [SerializeField] private GameObject _bulletPrefab;
    [SerializeField] private int _defaultCapacity = 20;
    [SerializeField] private int _maxSize = 100;

    // WHY ObjectPool<GameObject>: stack-based pool with four lifecycle callbacks.
    // The pool handles tracking which objects are active vs. available.
    private ObjectPool<GameObject> _pool;

    private void Awake()
    {
        _pool = new ObjectPool<GameObject>(
            // createFunc — called when the pool is empty and a new object is needed.
            // This is the ONLY place Instantiate runs.
            createFunc: () =>
            {
                GameObject bullet = Instantiate(_bulletPrefab);
                // Store a reference so bullets can return themselves to the pool
                bullet.GetComponent<Bullet>().Pool = _pool;
                return bullet;
            },

            // actionOnGet — called every time an object is taken from the pool.
            // Re-enable the GameObject so it appears in the scene.
            actionOnGet: bullet =>
            {
                bullet.SetActive(true);
            },

            // actionOnRelease — called when an object is returned to the pool.
            // Disable it so it stops rendering, updating, and colliding.
            actionOnRelease: bullet =>
            {
                bullet.SetActive(false);
            },

            // actionOnDestroy — called when the pool exceeds maxSize.
            // Actually destroy the excess object to prevent unbounded memory growth.
            actionOnDestroy: bullet =>
            {
                Destroy(bullet);
            },

            // collectionCheck: true (default) — warns if you return an object
            // that's already in the pool. Catches double-release bugs.
            collectionCheck: true,

            defaultCapacity: _defaultCapacity,  // Pre-allocate stack capacity (not objects)
            maxSize: _maxSize                    // Hard cap — excess objects are destroyed
        );
    }

    /// <summary>
    /// Get a bullet from the pool, position it, and fire.
    /// </summary>
    public GameObject SpawnBullet(Vector3 position, Quaternion rotation)
    {
        GameObject bullet = _pool.Get();
        bullet.transform.SetPositionAndRotation(position, rotation);
        return bullet;
    }

    private void OnDestroy()
    {
        // WHY Dispose: ObjectPool implements IDisposable.
        // Dispose calls actionOnDestroy on every pooled object, preventing leaks.
        _pool.Dispose();
    }
}
```

### The Bullet Returns Itself

```csharp
using UnityEngine;
using UnityEngine.Pool;

/// <summary>
/// A pooled bullet that returns itself to the pool after a lifetime expires
/// or upon hitting something.
/// </summary>
public class Bullet : MonoBehaviour
{
    [SerializeField] private float _speed = 50f;
    [SerializeField] private float _lifetime = 3f;

    // WHY public setter: the pool manager assigns this during createFunc.
    // The bullet needs a reference to release itself back.
    public IObjectPool<GameObject> Pool { get; set; }

    private float _timer;

    private void OnEnable()
    {
        // WHY reset timer in OnEnable (not Start): OnEnable runs every time
        // the object is re-activated from the pool. Start only runs once.
        _timer = _lifetime;
    }

    private void Update()
    {
        transform.Translate(Vector3.forward * (_speed * Time.deltaTime));

        _timer -= Time.deltaTime;
        if (_timer <= 0f)
            ReturnToPool();
    }

    private void OnCollisionEnter(Collision collision)
    {
        // Handle damage, VFX, etc.
        ReturnToPool();
    }

    private void ReturnToPool()
    {
        // WHY Release instead of Destroy: returns the object to the pool
        // for reuse. No allocation, no GC pressure.
        Pool.Release(gameObject);
    }
}
```

---

## Collection Pools: Zero-Alloc Temporary Lists

Collection pools are invaluable for physics queries, raycasts, and any operation that needs a temporary list:

```csharp
using UnityEngine;
using UnityEngine.Pool;
using System.Collections.Generic;

public class ExplosionDamage : MonoBehaviour
{
    [SerializeField] private float _radius = 5f;
    [SerializeField] private int _damage = 50;
    [SerializeField] private LayerMask _damageMask;

    public void Explode(Vector3 center)
    {
        // WHY ListPool: allocating a new List<Collider> every explosion creates
        // GC pressure. ListPool reuses the list — zero allocation after warm-up.
        List<Collider> hits = ListPool<Collider>.Get();
        try
        {
            // OverlapSphere returns an array, but we use the list to filter
            Collider[] results = Physics.OverlapSphere(center, _radius, _damageMask);
            hits.AddRange(results);

            foreach (Collider hit in hits)
            {
                if (hit.TryGetComponent<IDamageable>(out var target))
                {
                    float distance = Vector3.Distance(center, hit.transform.position);
                    float falloff = 1f - (distance / _radius);
                    target.TakeDamage(Mathf.RoundToInt(_damage * falloff));
                }
            }
        }
        finally
        {
            // CRITICAL: always release in a finally block to prevent pool leaks.
            // The list is cleared automatically by the pool on release.
            ListPool<Collider>.Release(hits);
        }
    }
}
```

---

## LinkedPool vs ObjectPool

`LinkedPool<T>` uses a linked list instead of a stack. Choose it when:

- Pool size fluctuates **dramatically** (e.g., 0 to 10,000 during a boss fight)
- You want to avoid the array-resize cost of `ObjectPool` at extreme scales
- You don't need index-based access

```csharp
// WHY LinkedPool here: particle-like VFX pools can grow to thousands during
// heavy combat, then shrink to zero. LinkedPool avoids the large internal
// array that ObjectPool would keep allocated.
private LinkedPool<ParticleSystem> _vfxPool;

private void Awake()
{
    _vfxPool = new LinkedPool<ParticleSystem>(
        createFunc: () => Instantiate(_vfxPrefab).GetComponent<ParticleSystem>(),
        actionOnGet: ps => ps.gameObject.SetActive(true),
        actionOnRelease: ps =>
        {
            ps.Stop(true, ParticleSystemStopBehavior.StopEmittingAndClear);
            ps.gameObject.SetActive(false);
        },
        actionOnDestroy: ps => Destroy(ps.gameObject),
        collectionCheck: true,
        maxSize: 500
    );
}
```

---

## Pre-warming Pools

By default, `ObjectPool` only creates objects on first `Get()`. For a smooth first frame, pre-warm during loading:

```csharp
/// <summary>
/// Pre-warms the pool by creating and immediately releasing objects.
/// Call this during a loading screen to avoid first-frame hitches.
/// </summary>
public void PreWarm(int count)
{
    // WHY pre-warm: the first N Get() calls trigger Instantiate(),
    // which can cause frame spikes. Pre-warming moves that cost
    // to a loading screen where hitches are invisible.
    var temp = new GameObject[count];

    for (int i = 0; i < count; i++)
        temp[i] = _pool.Get();

    for (int i = 0; i < count; i++)
        _pool.Release(temp[i]);
}
```

---

## Pooling with Addressables

When pooled prefabs are loaded via Addressables, coordinate pool lifecycle with asset handle lifetime:

```csharp
using UnityEngine;
using UnityEngine.AddressableAssets;
using UnityEngine.Pool;
using UnityEngine.ResourceManagement.AsyncOperations;
using System.Threading.Tasks;

/// <summary>
/// Loads a prefab via Addressables, then creates a pool from it.
/// Releases the Addressable handle when the pool is disposed.
/// </summary>
public class AddressablePool : MonoBehaviour
{
    [SerializeField] private AssetReferenceGameObject _prefabRef;
    [SerializeField] private int _maxSize = 50;

    private ObjectPool<GameObject> _pool;
    private AsyncOperationHandle<GameObject> _handle;
    private GameObject _loadedPrefab;

    public async Task InitializeAsync()
    {
        // WHY async load: Addressables load from disk/network asynchronously.
        // Awaiting here (with Unity 6 Awaitable support) keeps the API clean.
        _handle = _prefabRef.LoadAssetAsync<GameObject>();
        _loadedPrefab = await _handle.Task;

        _pool = new ObjectPool<GameObject>(
            createFunc: () => Instantiate(_loadedPrefab),
            actionOnGet: obj => obj.SetActive(true),
            actionOnRelease: obj => obj.SetActive(false),
            actionOnDestroy: obj => Destroy(obj),
            maxSize: _maxSize
        );
    }

    public GameObject Get() => _pool.Get();
    public void Release(GameObject obj) => _pool.Release(obj);

    private void OnDestroy()
    {
        // WHY release handle: Addressables reference-count assets.
        // If we don't release, the prefab stays in memory forever.
        _pool?.Dispose();
        if (_handle.IsValid())
            Addressables.Release(_handle);
    }
}
```

---

## Spawn Manager Pattern

For games with many pooled types, a centralized spawn manager reduces boilerplate:

```csharp
using UnityEngine;
using UnityEngine.Pool;
using System.Collections.Generic;

/// <summary>
/// Centralized spawn manager that maintains one pool per prefab.
/// Usage: SpawnManager.Instance.Spawn(prefab, position, rotation);
/// </summary>
public class SpawnManager : MonoBehaviour
{
    public static SpawnManager Instance { get; private set; }

    [SerializeField] private int _defaultMaxSize = 100;

    // WHY Dictionary of pools: each prefab type gets its own pool.
    // This avoids mixing bullet objects with enemy objects in one pool.
    private readonly Dictionary<int, ObjectPool<GameObject>> _pools = new();

    private void Awake()
    {
        if (Instance != null && Instance != this)
        {
            Destroy(gameObject);
            return;
        }
        Instance = this;
    }

    /// <summary>
    /// Spawn a pooled instance of the given prefab.
    /// Creates a new pool automatically if this prefab hasn't been seen before.
    /// </summary>
    public GameObject Spawn(GameObject prefab, Vector3 position, Quaternion rotation)
    {
        int key = prefab.GetInstanceID();

        if (!_pools.TryGetValue(key, out var pool))
        {
            // WHY capture prefab in closure: each pool's createFunc needs to
            // know which prefab to instantiate. The closure captures it once.
            pool = new ObjectPool<GameObject>(
                createFunc: () =>
                {
                    var obj = Instantiate(prefab);
                    obj.AddComponent<PoolTag>().PrefabId = key;
                    return obj;
                },
                actionOnGet: obj => obj.SetActive(true),
                actionOnRelease: obj => obj.SetActive(false),
                actionOnDestroy: obj => Destroy(obj),
                maxSize: _defaultMaxSize
            );
            _pools[key] = pool;
        }

        GameObject instance = pool.Get();
        instance.transform.SetPositionAndRotation(position, rotation);
        return instance;
    }

    /// <summary>
    /// Return a spawned object to its pool.
    /// </summary>
    public void Despawn(GameObject obj)
    {
        if (obj.TryGetComponent<PoolTag>(out var tag) &&
            _pools.TryGetValue(tag.PrefabId, out var pool))
        {
            pool.Release(obj);
        }
        else
        {
            // Fallback: object wasn't pooled, destroy normally
            Destroy(obj);
        }
    }

    private void OnDestroy()
    {
        foreach (var pool in _pools.Values)
            pool.Dispose();
        _pools.Clear();
    }
}

/// <summary>
/// Tag component that tracks which pool a GameObject belongs to.
/// </summary>
public class PoolTag : MonoBehaviour
{
    public int PrefabId;
}
```

---

## Common Pitfalls

1. **Forgetting to reset state on reuse** — pooled objects carry state from previous use (velocity, health, coroutines). Always reset in `OnEnable()` or `actionOnGet`.

2. **Double-releasing** — calling `Release()` twice on the same object corrupts the pool. Enable `collectionCheck: true` (default) during development to catch this.

3. **Referencing destroyed pool objects** — if another system holds a reference to a pooled object after it's returned, it may access a disabled or repurposed object. Use events or null-checks.

4. **Unbounded growth** — always set `maxSize`. Without it, a burst of activity creates objects that never get cleaned up.

5. **Pooling across scenes** — if the pool lives on a `DontDestroyOnLoad` object but the pooled objects belong to a scene, loading a new scene destroys the pooled objects while the pool still references them. Either pool objects under the manager's transform, or clear pools on scene transitions.

6. **Coroutines and pooled objects** — `StopAllCoroutines()` in `actionOnRelease` or `OnDisable()` to prevent coroutines from running on inactive pooled objects.

```csharp
// WHY StopAllCoroutines: a bullet with a trail-fade coroutine will
// continue executing after returning to the pool unless explicitly stopped.
actionOnRelease: obj =>
{
    obj.GetComponent<MonoBehaviour>().StopAllCoroutines();
    obj.SetActive(false);
}
```

---

## Performance Checklist

- [ ] Profile with Unity Profiler → look for `GC.Alloc` in gameplay frames
- [ ] Pre-warm pools during loading screens
- [ ] Set `maxSize` to a reasonable upper bound (profile to find it)
- [ ] Use `ListPool<T>` for all temporary collections in hot paths
- [ ] Reset all state in `OnEnable()` — transform, velocity, health, timers
- [ ] Call `pool.Dispose()` in `OnDestroy()` to clean up
- [ ] Disable `collectionCheck` in release builds for a minor performance gain

---

## Further Reading

- [Unity Scripting API: ObjectPool\<T\> (6000.x)](https://docs.unity3d.com/6000.1/Documentation/ScriptReference/Pool.ObjectPool_1.html)
- [Unity Scripting API: LinkedPool\<T\> (6000.x)](https://docs.unity3d.com/6000.3/Documentation/ScriptReference/Pool.LinkedPool_1.html)
- [Unity Learn: Design Patterns — Object Pooling](https://learn.unity.com/course/design-patterns-unity-6/tutorial/use-object-pooling-to-boost-performance-of-c-scripts-in-unity)
- [Unity Manual: Pooling and Reusing Objects](https://docs.unity3d.com/6000.3/Documentation/Manual/performance-reusable-code.html)
