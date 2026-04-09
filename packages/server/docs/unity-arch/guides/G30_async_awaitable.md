# G30 — Async Programming with Awaitable

> **Category:** guide · **Engine:** Unity 6 (6000.x) · **Related:** [G1 Scene Management](G1_scene_management.md) · [G8 Networking & Netcode](G8_networking_netcode.md) · [G16 Performance & Memory](G16_performance_optimization_memory.md) · [Unity Rules](../unity-arch-rules.md)

Unity 6 introduces the `Awaitable` class — a pooled, allocation-friendly async return type purpose-built for game development. It replaces iterator-based coroutines with modern C# `async`/`await` syntax while staying aware of Unity's main thread, Update loops, and object lifetimes. This guide covers the Awaitable API, threading model, cancellation patterns, migration from coroutines, and when to reach for UniTask instead.

---

## Why Awaitable Exists

Traditional .NET `Task` allocates on the heap every call, knows nothing about Unity's player loop, and can silently outlive destroyed GameObjects. Unity's legacy coroutines (`IEnumerator` + `yield return`) avoid some of those problems but lack return values, proper error propagation, and composability.

`Awaitable` sits between the two:

| Feature | `Task` | `ValueTask` | `Awaitable` | Coroutine |
|---|---|---|---|---|
| Heap allocations | Every call | As-needed | Minimal (pooled) | Per-yield overhead |
| Multiple awaits safe | Yes | No | **No** | N/A |
| Return values | Yes | Yes | Yes | No |
| Error propagation | try/catch | try/catch | try/catch | Silent failure |
| Thread switching | Manual | Manual | **Built-in** | Main thread only |
| Unity lifecycle-aware | No | No | **Yes** | Yes |

> **Key constraint:** Awaitable instances are **pooled and single-use**. Never store an `Awaitable` in a field and await it twice — this causes undefined behavior or deadlocks.

---

## Core API Reference (Unity 6000.3+)

### Frame-Timing Methods

These replace common `yield return` patterns:

```csharp
// Wait until next frame (replaces: yield return null)
await Awaitable.NextFrameAsync(cancellationToken);

// Wait for a duration (replaces: yield return new WaitForSeconds)
await Awaitable.WaitForSecondsAsync(2.5f, cancellationToken);

// Wait until end of frame (replaces: yield return new WaitForEndOfFrame)
await Awaitable.EndOfFrameAsync(cancellationToken);

// Wait until next FixedUpdate (replaces: yield return new WaitForFixedUpdate)
await Awaitable.FixedUpdateAsync(cancellationToken);
```

### Thread-Switching Methods

Move work between the main thread and background threads:

```csharp
public async Awaitable<byte[]> CompressDataAsync(byte[] raw)
{
    // Switch to a background thread for CPU-heavy work
    await Awaitable.BackgroundThreadAsync();

    // This runs on a ThreadPool thread — no Unity API calls here!
    byte[] compressed = MyCompressor.Compress(raw);

    // Switch back to the main thread before touching GameObjects
    await Awaitable.MainThreadAsync();

    Debug.Log($"Compressed {raw.Length} → {compressed.Length} bytes");
    return compressed;
}
```

> **Scope rule:** `BackgroundThreadAsync()` and `MainThreadAsync()` only affect the *current* method. When an async method returns, the caller resumes on whatever thread *it* was on — not the thread the callee switched to.

### AwaitableCompletionSource

For user-defined async events (e.g., waiting for player input, a UI confirmation, or a network response):

```csharp
private AwaitableCompletionSource<bool> _confirmSource;

// Called by UI button
public void OnConfirmClicked()
{
    _confirmSource?.SetResult(true);
}

public void OnCancelClicked()
{
    _confirmSource?.SetResult(false);
}

public async Awaitable<bool> WaitForConfirmationAsync()
{
    // Create a new completion source each time (Awaitable is single-use)
    _confirmSource = new AwaitableCompletionSource<bool>();
    bool confirmed = await _confirmSource.Awaitable;
    _confirmSource = null;
    return confirmed;
}
```

---

## Cancellation Patterns

Uncancelled async methods can outlive destroyed objects or even Play Mode. Unity 6 provides two built-in tokens:

### destroyCancellationToken (MonoBehaviour)

Signals when the MonoBehaviour or its GameObject is destroyed:

```csharp
public class EnemySpawner : MonoBehaviour
{
    // Start an async loop that auto-cancels when this object is destroyed
    async void Start()
    {
        try
        {
            while (true)
            {
                SpawnEnemy();
                // Pass the token so the wait cancels on Destroy
                await Awaitable.WaitForSecondsAsync(
                    spawnInterval,
                    destroyCancellationToken  // <-- automatic cleanup
                );
            }
        }
        catch (OperationCanceledException)
        {
            // Normal — object was destroyed, exit gracefully
        }
    }
}
```

### Application.exitCancellationToken

Signals when exiting Play Mode (editor) or when the application quits:

```csharp
public async Awaitable SaveToCloudAsync()
{
    await Awaitable.BackgroundThreadAsync();
    try
    {
        // Long-running network call — cancel if app exits
        await UploadSaveData(Application.exitCancellationToken);
    }
    catch (OperationCanceledException)
    {
        Debug.Log("Save cancelled — app is exiting");
    }
}
```

### Combining Tokens

Use `CancellationTokenSource.CreateLinkedTokenSource` when you need both object-lifetime *and* manual cancellation:

```csharp
private CancellationTokenSource _manualCts;

public async Awaitable RunPatrolAsync()
{
    _manualCts = new CancellationTokenSource();

    // Cancel if EITHER the object is destroyed OR we call _manualCts.Cancel()
    using var linked = CancellationTokenSource.CreateLinkedTokenSource(
        destroyCancellationToken, _manualCts.Token
    );

    try
    {
        while (true)
        {
            await MoveToNextWaypoint(linked.Token);
            await Awaitable.WaitForSecondsAsync(waitTime, linked.Token);
        }
    }
    catch (OperationCanceledException) { }
}

// Call this to stop patrol without destroying the object
public void StopPatrol() => _manualCts?.Cancel();
```

---

## Coroutine → Awaitable Migration

### Before (Coroutine)

```csharp
IEnumerator FadeOutCoroutine(CanvasGroup group, float duration)
{
    float elapsed = 0f;
    while (elapsed < duration)
    {
        elapsed += Time.deltaTime;
        group.alpha = 1f - (elapsed / duration);
        yield return null;  // wait one frame
    }
    group.alpha = 0f;
    // No way to return success/failure or catch errors
}

// Usage:
StartCoroutine(FadeOutCoroutine(canvasGroup, 0.5f));
```

### After (Awaitable)

```csharp
async Awaitable FadeOutAsync(CanvasGroup group, float duration)
{
    float elapsed = 0f;
    while (elapsed < duration)
    {
        elapsed += Time.deltaTime;
        group.alpha = 1f - (elapsed / duration);
        await Awaitable.NextFrameAsync(destroyCancellationToken);
    }
    group.alpha = 0f;
    // Automatically cancels if object is destroyed mid-fade
}

// Usage — can await, chain, try/catch:
await FadeOutAsync(canvasGroup, 0.5f);
await LoadNextSceneAsync();  // runs after fade completes
```

### Quick Reference

| Coroutine Pattern | Awaitable Equivalent |
|---|---|
| `yield return null` | `await Awaitable.NextFrameAsync(ct)` |
| `yield return new WaitForSeconds(t)` | `await Awaitable.WaitForSecondsAsync(t, ct)` |
| `yield return new WaitForEndOfFrame()` | `await Awaitable.EndOfFrameAsync(ct)` |
| `yield return new WaitForFixedUpdate()` | `await Awaitable.FixedUpdateAsync(ct)` |
| `yield return StartCoroutine(Other())` | `await OtherAsync()` |
| `yield return asyncOp` | `await asyncOp` (e.g., `SceneManager.LoadSceneAsync`) |

---

## Threading Best Practices

### Do: Offload CPU-Heavy Work

```csharp
// Pathfinding, mesh generation, world-gen, compression, etc.
public async Awaitable<NavPath> CalculatePathAsync(Vector3 start, Vector3 end)
{
    await Awaitable.BackgroundThreadAsync();

    // Heavy A* computation on a worker thread
    NavPath path = Pathfinder.Calculate(start, end);

    await Awaitable.MainThreadAsync();
    return path;
}
```

### Don't: Call Unity APIs from Background Threads

```csharp
// BAD — transform is a main-thread-only API
await Awaitable.BackgroundThreadAsync();
transform.position = newPos;  // Exception in dev builds, undefined in release!
```

### Thread-Switch Latency

Switching threads is **not free**. Moving from main → background or back requires waiting until the next frame update, which means at least one frame of latency (~33ms at 30 FPS). Avoid frequent thread-switching in hot loops.

---

## Awaitable vs UniTask

| Consideration | Awaitable | UniTask |
|---|---|---|
| **Built-in** | Yes (Unity 6+) | Third-party package |
| **Zero-alloc** | Mostly (pooled) | Yes (struct-based) |
| **Multiple awaits** | No | Yes (`Preserve()`) |
| **WhenAll / WhenAny** | Not built-in | Yes |
| **Channel / AsyncReactiveProperty** | No | Yes |
| **DOTween integration** | No | Yes |
| **Addressables integration** | Basic | Rich |
| **Player-loop timing** | Limited | Granular (PostLateUpdate, etc.) |

**Recommendation:** Use `Awaitable` for straightforward async flows (loading, delays, background compute). Reach for UniTask when you need advanced composition (`WhenAll`, channels), granular player-loop timing, or third-party integrations. They coexist — you can use both in the same project.

---

## Common Pitfalls

### 1. Awaiting Twice

```csharp
// WRONG — Awaitable is pooled/single-use
var awaitable = Awaitable.WaitForSecondsAsync(1f);
await awaitable;
await awaitable;  // Undefined behavior!

// CORRECT — create a new Awaitable each time
await Awaitable.WaitForSecondsAsync(1f);
await Awaitable.WaitForSecondsAsync(1f);
```

### 2. Fire-and-Forget Without Cancellation

```csharp
// DANGEROUS — this loop runs forever, even after Destroy
async void Start()
{
    while (true)
    {
        await Awaitable.WaitForSecondsAsync(1f);  // no token!
        DoSomething();
    }
}

// SAFE — pass destroyCancellationToken
async void Start()
{
    try
    {
        while (true)
        {
            await Awaitable.WaitForSecondsAsync(1f, destroyCancellationToken);
            DoSomething();
        }
    }
    catch (OperationCanceledException) { }
}
```

### 3. async void vs async Awaitable

Prefer `async Awaitable` over `async void` for all methods except Unity event callbacks (Start, OnTriggerEnter, etc.). `async void` swallows exceptions silently:

```csharp
// Acceptable — Start is a Unity callback
async void Start() { ... }

// Prefer Awaitable for everything else
public async Awaitable InitializeAsync() { ... }
```

---

## Performance Notes

- Awaitable continuations run **synchronously** when completion is triggered — code resumes in the same frame, unlike `Task` which defers to the thread pool.
- At moderate concurrency (< ~100 simultaneous awaitables), Awaitable outperforms iterator coroutines, especially with non-null yields.
- At very high concurrency (thousands), benchmark both approaches — pooling overhead can become measurable.
- `BackgroundThreadAsync`/`MainThreadAsync` are cheap when already on the target thread (no-op fast path).

---

## Further Reading

- [Unity Manual — Async Programming with Awaitable](https://docs.unity3d.com/6000.3/Documentation/Manual/async-await-support.html)
- [Unity API — Awaitable Class](https://docs.unity3d.com/6000.2/Documentation/ScriptReference/Awaitable.html)
- [UniTask — Zero-Alloc Async for Unity](https://github.com/Cysharp/UniTask)
