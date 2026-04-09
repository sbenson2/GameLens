# G73 — Async Instantiation & Content Streaming

> **Category:** guide · **Engine:** Unity 6.0+ (6000.0+) · **Related:** [G9 Addressables](G9_addressables_asset_management.md) · [G1 Scene Management](G1_scene_management.md) · [G30 Async Awaitable](G30_async_awaitable.md) · [G33 Object Pooling](G33_object_pooling.md) · [G16 Performance & Memory](G16_performance_optimization_memory.md) · [G47 DirectStorage](G47_directstorage_asset_loading.md) · [Unity Rules](../unity-arch-rules.md)

Instantiating complex prefabs — especially those with deep hierarchies, multiple components, and serialized references — is one of the most common sources of frame hitches in Unity games. A single `Object.Instantiate()` call on a character prefab can block the main thread for 2–15 ms, enough to drop below 60 fps. Unity 6 introduces **`Object.InstantiateAsync`**, which moves the heavy work (deserialization, hierarchy construction, component initialization) off the main thread and integrates the results in a controlled final step. Combined with Addressables and async scene loading, this enables smooth content streaming with minimal frame drops.

---

## Object.InstantiateAsync

### Basic Usage

```csharp
using UnityEngine;

public class EnemySpawner : MonoBehaviour
{
    [SerializeField] private GameObject _enemyPrefab;

    async void SpawnEnemy(Vector3 position)
    {
        // WHY: InstantiateAsync moves deserialization and hierarchy
        // construction off the main thread. Only the final integration
        // (parenting, Awake, OnEnable) happens on the main thread,
        // which is typically < 1 ms vs 5–15 ms for full Instantiate.
        var op = Object.InstantiateAsync(_enemyPrefab, position,
            Quaternion.identity);

        // WHY: Await returns the array of instantiated objects.
        // Even for a single object, the result is an array (length 1).
        GameObject[] results = await op;

        var enemy = results[0];
        enemy.GetComponent<EnemyAI>().Initialize();
    }
}
```

### Batch Instantiation

When spawning many objects at once (wave spawners, level population, particle-like effects), use the `count` parameter to batch them in a single async operation:

```csharp
async Awaitable SpawnWave(int count, Vector3 center, float radius)
{
    // WHY: Batching N objects into one InstantiateAsync call is
    // significantly faster than N separate calls because:
    // 1. One scheduling overhead instead of N
    // 2. The engine can share deserialized template data across copies
    // 3. Main-thread integration is batched into one frame
    var op = Object.InstantiateAsync(_enemyPrefab, count);

    // WHY: allowSceneActivation = false delays the final main-thread
    // integration phase. Objects are fully constructed off-thread but
    // not yet visible or running Awake/OnEnable. This lets you choose
    // WHEN the frame cost is paid — e.g., during a loading screen or
    // between gameplay waves.
    op.allowSceneActivation = false;

    // Wait for off-thread work to finish
    while (!op.isDone && op.progress < 0.9f)
    {
        await Awaitable.NextFrameAsync();
    }

    // Now activate — Awake/OnEnable run this frame
    op.allowSceneActivation = true;
    GameObject[] enemies = await op;

    // Position enemies in a circle
    for (int i = 0; i < enemies.Length; i++)
    {
        float angle = (float)i / count * Mathf.PI * 2f;
        enemies[i].transform.position = center + new Vector3(
            Mathf.Cos(angle) * radius, 0, Mathf.Sin(angle) * radius);
    }
}
```

### Positioned Batch with Spans

For spawning objects at predetermined positions (level decoration, pickup placement), use the `Span<Vector3>` and `Span<Quaternion>` overloads:

```csharp
async Awaitable PlacePickups(Vector3[] positions)
{
    // WHY: Span overloads let you set position/rotation during
    // instantiation rather than post-processing each object.
    // If count > positions.Length, positions cycle (wrapping).
    var op = Object.InstantiateAsync(
        _pickupPrefab,
        positions.Length,
        new ReadOnlySpan<Vector3>(positions),
        new ReadOnlySpan<Quaternion>(
            new Quaternion[1] { Quaternion.identity }));

    GameObject[] pickups = await op;
}
```

### Cancellation

```csharp
using System.Threading;

private CancellationTokenSource _cts;

async Awaitable SpawnWithCancellation()
{
    _cts = new CancellationTokenSource();

    var op = Object.InstantiateAsync(
        _prefab,
        new InstantiateParameters { parent = transform },
        _cts.Token);

    try
    {
        GameObject[] results = await op;
        Debug.Log($"Spawned {results.Length} objects");
    }
    catch (OperationCanceledException)
    {
        // WHY: If the player leaves the area or the spawner is
        // destroyed, cancel pending instantiations to avoid
        // orphaned objects and wasted GPU/CPU work.
        Debug.Log("Spawn cancelled");
    }
}

void OnDestroy()
{
    _cts?.Cancel();
    _cts?.Dispose();
}
```

### InstantiateParameters

The `InstantiateParameters` struct provides fine-grained control:

```csharp
var parameters = new InstantiateParameters
{
    // WHY: Set parent during instantiation instead of after.
    // This avoids a redundant Transform.SetParent call and
    // the associated hierarchy rebuild.
    parent = _container,

    // WHY: worldPositionStays = false keeps the prefab's local
    // position relative to the parent, which is usually what you
    // want for UI or attached objects.
    worldPositionStays = false,

    // WHY: When set, the instantiated hierarchy is placed in
    // a specific scene (useful for additive scene management).
    destinationScene = SceneManager.GetSceneByName("Gameplay")
};

var op = Object.InstantiateAsync(_prefab, parameters, _cts.Token);
```

---

## AsyncInstantiateOperation Properties

| Property / Method | Type | Description |
|---|---|---|
| `Result` | `T[]` | The instantiated objects (available after completion) |
| `progress` | `float` | 0–1 progress of the off-thread work |
| `isDone` | `bool` | True when the operation is fully complete (including integration) |
| `allowSceneActivation` | `bool` | When false, delays main-thread integration until set to true |
| `completed` | `event` | Fires when the operation finishes |
| `Cancel()` | `void` | Cancels the operation if not yet complete |
| `WaitForCompletion()` | `T[]` | Blocks the main thread until done (use sparingly) |
| `priority` | `int` | Execution order when multiple async ops are queued |

---

## Combining with Object Pooling

`InstantiateAsync` excels at **pre-warming pools** during loading screens. At runtime, use synchronous pool Get/Release for zero-latency spawning:

```csharp
using UnityEngine;
using UnityEngine.Pool;

public class AsyncPoolWarmer : MonoBehaviour
{
    [SerializeField] private GameObject _prefab;
    [SerializeField] private int _poolSize = 50;

    private ObjectPool<GameObject> _pool;

    async Awaitable Start()
    {
        // WHY: Pre-warm the pool asynchronously during the loading
        // screen. InstantiateAsync handles the heavy deserialization
        // off-thread, then we deactivate and store the objects.
        var op = Object.InstantiateAsync(_prefab, _poolSize);
        op.allowSceneActivation = false;

        // Show loading progress
        while (!op.isDone && op.progress < 0.9f)
        {
            await Awaitable.NextFrameAsync();
        }

        op.allowSceneActivation = true;
        GameObject[] prewarmed = await op;

        // Build pool from pre-warmed objects
        var available = new System.Collections.Generic.Queue<GameObject>();
        foreach (var obj in prewarmed)
        {
            obj.SetActive(false);
            available.Enqueue(obj);
        }

        // WHY: ObjectPool's createFunc normally calls Instantiate
        // (synchronous). By pre-warming above, the pool rarely
        // needs to create new objects during gameplay.
        _pool = new ObjectPool<GameObject>(
            createFunc: () => Object.Instantiate(_prefab),
            actionOnGet: obj => obj.SetActive(true),
            actionOnRelease: obj => obj.SetActive(false),
            actionOnDestroy: obj => Object.Destroy(obj),
            defaultCapacity: _poolSize,
            maxSize: _poolSize * 2);

        // Seed the pool with pre-warmed objects
        foreach (var obj in available)
        {
            _pool.Release(obj);
        }

        Debug.Log($"Pool warmed with {_poolSize} objects (async)");
    }

    public GameObject Get() => _pool.Get();
    public void Release(GameObject obj) => _pool.Release(obj);
}
```

---

## Async Scene Loading Patterns

### Progressive Scene Loading with Progress

```csharp
using UnityEngine;
using UnityEngine.SceneManagement;

public class SceneLoader : MonoBehaviour
{
    // WHY: This pattern loads a scene asynchronously while showing
    // a loading screen. allowSceneActivation = false lets you
    // control exactly when the scene appears.

    public async Awaitable LoadSceneAsync(string sceneName,
        System.Action<float> onProgress = null)
    {
        var op = SceneManager.LoadSceneAsync(sceneName,
            LoadSceneMode.Additive);
        op.allowSceneActivation = false;

        // WHY: Unity caps progress at 0.9 until allowSceneActivation
        // is set to true. This is by design — it gives you a window
        // to do final setup before the scene becomes visible.
        while (op.progress < 0.9f)
        {
            onProgress?.Invoke(op.progress / 0.9f);
            await Awaitable.NextFrameAsync();
        }

        onProgress?.Invoke(1f);

        // Scene is loaded but not activated — do pre-activation work
        // (e.g., warm PSOs, pre-instantiate pools, position camera)
        await Awaitable.NextFrameAsync();

        op.allowSceneActivation = true;
    }

    public async Awaitable UnloadSceneAsync(string sceneName)
    {
        var op = SceneManager.UnloadSceneAsync(sceneName);
        while (!op.isDone)
        {
            await Awaitable.NextFrameAsync();
        }

        // WHY: Unloading a scene doesn't free all memory immediately.
        // Request an unload of unused assets to reclaim textures,
        // meshes, and materials that are no longer referenced.
        await Resources.UnloadUnusedAssets();
    }
}
```

### Additive Scene Streaming (Open World)

```csharp
using UnityEngine;
using UnityEngine.SceneManagement;
using System.Collections.Generic;

// WHY: For open-world or large-level games, stream scene chunks
// based on the player's position. Each chunk is a separate Unity
// scene loaded additively.
public class WorldStreamer : MonoBehaviour
{
    [SerializeField] private float _loadDistance = 100f;
    [SerializeField] private float _unloadDistance = 150f;
    [SerializeField] private WorldChunk[] _chunks; // ScriptableObject with scene name + center position

    private readonly HashSet<string> _loadedChunks = new();
    private readonly HashSet<string> _loadingChunks = new();

    void Update()
    {
        var playerPos = transform.position;

        foreach (var chunk in _chunks)
        {
            float dist = Vector3.Distance(playerPos, chunk.center);
            string sceneName = chunk.sceneName;

            if (dist < _loadDistance &&
                !_loadedChunks.Contains(sceneName) &&
                !_loadingChunks.Contains(sceneName))
            {
                LoadChunkAsync(sceneName);
            }
            else if (dist > _unloadDistance &&
                     _loadedChunks.Contains(sceneName))
            {
                UnloadChunkAsync(sceneName);
            }
        }
    }

    private async void LoadChunkAsync(string sceneName)
    {
        _loadingChunks.Add(sceneName);

        var op = SceneManager.LoadSceneAsync(sceneName,
            LoadSceneMode.Additive);

        // WHY: Set priority to low so gameplay scenes don't
        // cause frame hitches during streaming.
        op.priority = (int)ThreadPriority.Low;

        while (!op.isDone)
        {
            await Awaitable.NextFrameAsync();
        }

        _loadingChunks.Remove(sceneName);
        _loadedChunks.Add(sceneName);
    }

    private async void UnloadChunkAsync(string sceneName)
    {
        _loadedChunks.Remove(sceneName);

        var op = SceneManager.UnloadSceneAsync(sceneName);
        while (!op.isDone)
        {
            await Awaitable.NextFrameAsync();
        }
    }
}

[CreateAssetMenu(menuName = "Game/World Chunk")]
public class WorldChunk : ScriptableObject
{
    public string sceneName;
    public Vector3 center;
}
```

---

## Addressables + InstantiateAsync

For content loaded via Addressables, combine `Addressables.LoadAssetAsync` (loads the prefab from a bundle) with `Object.InstantiateAsync` (instantiates it without blocking):

```csharp
using UnityEngine;
using UnityEngine.AddressableAssets;
using UnityEngine.ResourceManagement.AsyncOperations;

public class AddressableSpawner : MonoBehaviour
{
    [SerializeField] private AssetReference _enemyRef;

    async Awaitable<GameObject> SpawnFromAddressable(Vector3 pos)
    {
        // WHY: Step 1 — Load the prefab asset from disk/bundle.
        // This is I/O-bound and benefits from DirectStorage (Unity 6.4+).
        var loadOp = _enemyRef.LoadAssetAsync<GameObject>();
        await loadOp.Task;

        if (loadOp.Status != AsyncOperationStatus.Succeeded)
        {
            Debug.LogError($"Failed to load {_enemyRef.RuntimeKey}");
            return null;
        }

        // WHY: Step 2 — Instantiate asynchronously from the loaded prefab.
        // The prefab is already in memory (Step 1); this step handles
        // hierarchy construction and component initialization off-thread.
        var prefab = loadOp.Result;
        var instantiateOp = Object.InstantiateAsync(prefab, pos,
            Quaternion.identity);
        GameObject[] results = await instantiateOp;

        return results[0];
    }

    void OnDestroy()
    {
        // WHY: Release the Addressable handle when done to allow
        // the asset to be unloaded from memory.
        _enemyRef.ReleaseAsset();
    }
}
```

---

## Performance Comparison

| Method | Main Thread Cost (Character Prefab) | When to Use |
|--------|-------------------------------------|-------------|
| `Object.Instantiate()` | 5–15 ms (blocks) | Small prefabs, pooled objects already warmed |
| `Object.InstantiateAsync()` | < 1 ms integration | Complex prefabs, batch spawns, loading screens |
| `ObjectPool.Get()` (pre-warmed) | < 0.1 ms | Frequent spawn/despawn (bullets, VFX, enemies) |
| `Addressables.InstantiateAsync()` | I/O + 1–5 ms integration | Remote or on-demand content, DLC |

---

## Best Practices

| Practice | Why |
|----------|-----|
| **Use `allowSceneActivation = false` for batch spawns** | Control when the main-thread integration cost is paid |
| **Pre-warm pools with InstantiateAsync during loading** | Avoid runtime hitches from first-time instantiation |
| **Combine with Addressables for large content** | Load asset from bundle (I/O) → InstantiateAsync (CPU) → pool for reuse |
| **Set `priority` on queued operations** | Lower priority for background streaming, higher for player-initiated spawns |
| **Cancel operations when leaving areas** | Avoid orphaned objects from stale spawn requests |
| **Don't use `WaitForCompletion()` in gameplay** | It blocks the main thread — defeats the purpose of async |
| **Profile with `Object.InstantiateAsync` marker** | Verify off-thread work isn't spilling into main-thread frames |
| **Prefer count-based batch over individual calls** | One `InstantiateAsync(prefab, 50)` is faster than 50 separate calls |

---

## Common Pitfalls

| Pitfall | Solution |
|---------|----------|
| Calling `Result` before `isDone` is true | Await the operation or check `isDone` first |
| Spawning in `Awake()` before scene is ready | Use `async void Start()` or wait until bootstrap is complete |
| Not disposing `CancellationTokenSource` | Always dispose in `OnDestroy()` to prevent leaks |
| Using `InstantiateAsync` for tiny prefabs | Overhead of scheduling may exceed the Instantiate cost for simple prefabs (< 1 ms sync). Profile first |
| Forgetting `Resources.UnloadUnusedAssets()` after scene unload | Memory from unloaded scenes lingers until explicitly freed |
| Mixing sync Instantiate and async in the same frame | Sync calls can push frame time over budget; prefer consistent async for complex objects |

---

## Checklist

- [ ] Use `Object.InstantiateAsync` for prefabs with 5+ components or deep hierarchies
- [ ] Batch-instantiate with `count` parameter during loading screens
- [ ] Pre-warm object pools asynchronously before gameplay begins
- [ ] Use `allowSceneActivation = false` to control integration timing
- [ ] Support cancellation with `CancellationToken` for streaming spawners
- [ ] Combine with Addressables for remote/on-demand content
- [ ] Profile with `Object.InstantiateAsync` profiler marker
- [ ] Use additive scene loading with distance-based streaming for open worlds
- [ ] Call `Resources.UnloadUnusedAssets()` after scene unloads
