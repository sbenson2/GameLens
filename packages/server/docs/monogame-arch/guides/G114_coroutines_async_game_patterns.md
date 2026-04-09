# G114 — Coroutines & Async Game Patterns

> **Category:** guide · **Engine:** MonoGame · **Related:** [G15 Game Loop](./G15_game_loop.md) · [G10 Custom Game Systems](./G10_custom_game_systems.md) · [G86 Async Content Loading](./G86_async_content_loading.md) · [G12 Design Patterns](./G12_design_patterns.md) · [G13 C# Performance](./G13_csharp_performance.md) · [G45 Cutscenes](./G45_cutscenes.md) · [G42 Screen Transitions](./G42_screen_transitions.md)

How to implement Unity-style **coroutines** in MonoGame using C# iterators, and when to use **async/await** vs. coroutines for game logic. Covers a production-ready coroutine runner, common yield instructions, and patterns for sequencing gameplay (cutscenes, screen transitions, timed events) without blocking the game loop.

---

## Table of Contents

1. [Why Coroutines?](#1-why-coroutines)
2. [C# Iterators as Coroutines](#2-c-iterators-as-coroutines)
3. [Building a Coroutine Runner](#3-building-a-coroutine-runner)
4. [Yield Instructions](#4-yield-instructions)
5. [Using Coroutines in Game Code](#5-using-coroutines-in-game-code)
6. [Nested Coroutines](#6-nested-coroutines)
7. [Cancellation & Lifecycle](#7-cancellation--lifecycle)
8. [Async/Await in MonoGame](#8-asyncawait-in-monogame)
9. [Coroutines vs. Async: Decision Guide](#9-coroutines-vs-async-decision-guide)
10. [Performance Considerations](#10-performance-considerations)

---

## 1. Why Coroutines?

MonoGame has no built-in coroutine system. Game logic that spans multiple frames — delays, sequenced animations, cutscenes, screen fades — typically devolves into state machines with manual timers:

```csharp
// ❌ Manual state machine — grows unwieldy fast
enum DoorState { Closed, Opening, Open, Closing }
DoorState _state = DoorState.Closed;
float _timer;

public void Update(GameTime gameTime)
{
    switch (_state)
    {
        case DoorState.Opening:
            _timer -= (float)gameTime.ElapsedGameTime.TotalSeconds;
            if (_timer <= 0) _state = DoorState.Open;
            break;
        // ... more cases, more timers, more nesting
    }
}
```

Coroutines let you write the same logic as a **linear sequence** that pauses and resumes each frame:

```csharp
// ✅ Coroutine — reads like a script
IEnumerator<IYieldInstruction> OpenDoor()
{
    _state = DoorState.Opening;
    yield return new WaitForSeconds(0.5f);
    _state = DoorState.Open;
}
```

---

## 2. C# Iterators as Coroutines

The C# compiler transforms any method returning `IEnumerator` or `IEnumerator<T>` into a **state machine**. Each `yield return` is a suspension point. Calling `MoveNext()` advances to the next yield. This is exactly the behaviour a coroutine needs — the game loop calls `MoveNext()` once per frame.

```
Frame 1:  MoveNext() → runs code up to first yield return
Frame 2:  MoveNext() → runs code between first and second yield
...
Frame N:  MoveNext() returns false → coroutine finished
```

No threads, no `Task`, no synchronisation primitives. Everything runs on the main thread, inside `Update`.

---

## 3. Building a Coroutine Runner

### Yield Instruction Interface

```csharp
/// <summary>
/// Base interface for all yield instructions.
/// Returning true from IsDone signals the coroutine runner
/// to resume the coroutine on the next frame.
/// </summary>
public interface IYieldInstruction
{
    bool IsDone(GameTime gameTime);
}
```

### Core Runner

```csharp
/// <summary>
/// Drives coroutines forward each frame. Attach to your Game
/// or to individual game objects that own coroutines.
/// </summary>
public sealed class CoroutineRunner
{
    private readonly List<CoroutineHandle> _active = new();
    private readonly List<CoroutineHandle> _toAdd = new();
    private int _nextId;

    /// <summary>
    /// Start a coroutine. Returns a handle for cancellation.
    /// </summary>
    public CoroutineHandle Start(IEnumerator<IYieldInstruction> routine)
    {
        var handle = new CoroutineHandle(++_nextId, routine);
        _toAdd.Add(handle);          // deferred add — safe to call during Update
        return handle;
    }

    /// <summary>
    /// Cancel a running coroutine by handle.
    /// </summary>
    public void Stop(CoroutineHandle handle)
    {
        handle.Cancel();
    }

    /// <summary>
    /// Cancel all running coroutines.
    /// </summary>
    public void StopAll()
    {
        foreach (var h in _active) h.Cancel();
        foreach (var h in _toAdd) h.Cancel();
    }

    /// <summary>
    /// Call once per frame from your Update method.
    /// </summary>
    public void Update(GameTime gameTime)
    {
        // Merge newly started coroutines
        if (_toAdd.Count > 0)
        {
            _active.AddRange(_toAdd);
            _toAdd.Clear();
        }

        for (int i = _active.Count - 1; i >= 0; i--)
        {
            var handle = _active[i];

            if (handle.IsCancelled)
            {
                _active.RemoveAt(i);
                continue;
            }

            // If waiting on a yield instruction, check if it's done
            if (handle.CurrentInstruction != null &&
                !handle.CurrentInstruction.IsDone(gameTime))
            {
                continue;   // still waiting — skip this frame
            }

            // Advance the iterator
            bool hasMore = handle.Routine.MoveNext();
            if (hasMore)
            {
                handle.CurrentInstruction = handle.Routine.Current;
            }
            else
            {
                _active.RemoveAt(i);   // coroutine finished
            }
        }
    }
}
```

### Coroutine Handle

```csharp
/// <summary>
/// Opaque handle returned by CoroutineRunner.Start().
/// Use it to cancel or check status.
/// </summary>
public sealed class CoroutineHandle
{
    public int Id { get; }
    public bool IsCancelled { get; private set; }
    internal IEnumerator<IYieldInstruction> Routine { get; }
    internal IYieldInstruction CurrentInstruction { get; set; }

    internal CoroutineHandle(int id, IEnumerator<IYieldInstruction> routine)
    {
        Id = id;
        Routine = routine;
    }

    public void Cancel() => IsCancelled = true;
}
```

---

## 4. Yield Instructions

### WaitForSeconds

Pauses for a real-time duration.

```csharp
public sealed class WaitForSeconds : IYieldInstruction
{
    private float _remaining;

    public WaitForSeconds(float seconds)
    {
        _remaining = seconds;
    }

    public bool IsDone(GameTime gameTime)
    {
        _remaining -= (float)gameTime.ElapsedGameTime.TotalSeconds;
        return _remaining <= 0f;
    }
}
```

### WaitForFrames

Pauses for a fixed number of update ticks.

```csharp
public sealed class WaitForFrames : IYieldInstruction
{
    private int _remaining;

    public WaitForFrames(int frames)
    {
        _remaining = frames;
    }

    public bool IsDone(GameTime gameTime)
    {
        return --_remaining <= 0;
    }
}
```

### WaitUntil

Pauses until a predicate returns true.

```csharp
public sealed class WaitUntil : IYieldInstruction
{
    private readonly Func<bool> _predicate;

    public WaitUntil(Func<bool> predicate)
    {
        _predicate = predicate;
    }

    public bool IsDone(GameTime gameTime) => _predicate();
}
```

### WaitForCoroutine

Pauses until another coroutine finishes — enables nesting.

```csharp
public sealed class WaitForCoroutine : IYieldInstruction
{
    private readonly CoroutineHandle _handle;

    public WaitForCoroutine(CoroutineHandle handle)
    {
        _handle = handle;
    }

    public bool IsDone(GameTime gameTime) => _handle.IsCancelled ||
        !IsStillRunning(_handle);

    // The runner removes finished handles, so if the handle
    // is no longer in the active list, it's done.
    // Simplest check: expose an IsFinished flag on the handle.
    private static bool IsStillRunning(CoroutineHandle h) => !h.IsCancelled;
}
```

> **Tip:** For a cleaner `WaitForCoroutine`, add an `IsFinished` property to `CoroutineHandle` that the runner sets to `true` when the iterator returns `false` from `MoveNext()`.

---

## 5. Using Coroutines in Game Code

### Setup

```csharp
public class MyGame : Game
{
    private readonly CoroutineRunner _coroutines = new();

    protected override void Update(GameTime gameTime)
    {
        _coroutines.Update(gameTime);
        base.Update(gameTime);
    }
}
```

### Sequenced Screen Fade

```csharp
// WHY: Coroutines make multi-step visual sequences trivial to author.
// Each yield pauses execution until the condition is met, then
// the next line runs — no state enum, no manual timer bookkeeping.

IEnumerator<IYieldInstruction> FadeToBlack(float duration)
{
    float elapsed = 0f;
    float halfDuration = duration / 2f;

    // Fade out
    while (elapsed < halfDuration)
    {
        _fadeAlpha = elapsed / halfDuration;
        elapsed += (float)_lastGameTime.ElapsedGameTime.TotalSeconds;
        yield return null;    // resume next frame (null = no wait)
    }
    _fadeAlpha = 1f;

    // Hold on black
    yield return new WaitForSeconds(0.3f);

    // Swap scene while screen is black
    LoadNextScene();

    // Fade in
    elapsed = 0f;
    while (elapsed < halfDuration)
    {
        _fadeAlpha = 1f - (elapsed / halfDuration);
        elapsed += (float)_lastGameTime.ElapsedGameTime.TotalSeconds;
        yield return null;
    }
    _fadeAlpha = 0f;
}
```

> **Note on `yield return null`:** If you use the `IYieldInstruction` generic pattern, you need a sentinel for "resume next frame." Options: return a shared static `WaitForFrames(0)` instance, or adjust the runner to treat `null` as "continue next frame" (which requires `IEnumerator<IYieldInstruction?>` with nullable reference types).

### Timed Spawn Wave

```csharp
IEnumerator<IYieldInstruction> SpawnWave(int count, float interval)
{
    for (int i = 0; i < count; i++)
    {
        SpawnEnemy(GetSpawnPosition());
        yield return new WaitForSeconds(interval);
    }
}
```

### Dialog Sequence

```csharp
IEnumerator<IYieldInstruction> PlayDialog(DialogLine[] lines)
{
    foreach (var line in lines)
    {
        _dialogBox.Show(line.Speaker, line.Text);
        yield return new WaitUntil(() => _dialogBox.IsAdvanced);
    }
    _dialogBox.Hide();
}
```

---

## 6. Nested Coroutines

Start a child coroutine and wait for it:

```csharp
IEnumerator<IYieldInstruction> BossIntro()
{
    // Camera pan runs as its own coroutine
    var panHandle = _coroutines.Start(PanCamera(_bossPosition, 1.5f));
    yield return new WaitForCoroutine(panHandle);

    // Boss roar animation
    _boss.PlayAnimation("roar");
    yield return new WaitForSeconds(1.2f);

    // Dialog
    var dialogHandle = _coroutines.Start(PlayDialog(_bossDialog));
    yield return new WaitForCoroutine(dialogHandle);

    // Enable player control
    _player.InputEnabled = true;
}
```

---

## 7. Cancellation & Lifecycle

### Cancel on Scene Change

When changing scenes, cancel all coroutines owned by the outgoing scene:

```csharp
public void UnloadScene()
{
    _coroutines.StopAll();
    // ... dispose scene resources
}
```

### Cancel Individual Coroutines

```csharp
private CoroutineHandle _patrolHandle;

public void StartPatrol()
{
    _patrolHandle = _coroutines.Start(PatrolRoute());
}

public void OnPlayerDetected()
{
    _coroutines.Stop(_patrolHandle);
    _coroutines.Start(ChasePlayer());
}
```

### Dispose Safety

The `CoroutineHandle` holds a reference to the `IEnumerator`, which captures local variables. If a coroutine captures an entity that gets destroyed, either cancel the coroutine first or check for null/disposed state inside the coroutine body.

---

## 8. Async/Await in MonoGame

C# `async/await` is **not a replacement** for coroutines in game logic. Key differences:

| | Coroutines (iterators) | async/await |
|---|---|---|
| Thread | Always main thread | May hop to thread-pool |
| Timing | Ticked by game loop | Ticked by `SynchronizationContext` or thread pool |
| Frame sync | Natural — one `MoveNext()` per `Update` | Requires explicit marshalling back to main thread |
| Cancellation | Simple flag check | `CancellationToken` plumbing |
| Best for | Frame-by-frame game logic | I/O-bound work (file loading, HTTP, leaderboards) |

### When Async/Await IS Appropriate

- **Content loading** — loading large textures or audio from disk. See [G86](./G86_async_content_loading.md).
- **Network requests** — fetching leaderboards, cloud saves, analytics.
- **File I/O** — writing save files without hitching.

### Thread Safety with Async

MonoGame's `GraphicsDevice` is **not thread-safe**. Any GPU operation (creating textures, setting render targets) must happen on the main thread. Use a completion queue pattern:

```csharp
// WHY: GPU resources can only be created on the main thread.
// We load the raw bytes on a background thread, then enqueue
// the GPU upload for the next Update tick.

private readonly ConcurrentQueue<Action> _mainThreadQueue = new();

public async Task LoadTextureAsync(string path)
{
    // Background thread — safe for disk I/O
    byte[] data = await File.ReadAllBytesAsync(path);

    // Marshal GPU work back to main thread
    _mainThreadQueue.Enqueue(() =>
    {
        using var stream = new MemoryStream(data);
        _texture = Texture2D.FromStream(GraphicsDevice, stream);
    });
}

protected override void Update(GameTime gameTime)
{
    // Drain the queue on the main thread
    while (_mainThreadQueue.TryDequeue(out var action))
        action();

    _coroutines.Update(gameTime);
    base.Update(gameTime);
}
```

### MonoGame's Legacy Async API

MonoGame exposes a `Begin`/`End` pattern (IAsyncResult) inherited from XNA. This is the **APM (Asynchronous Programming Model)** — a pre-Task .NET 1.0 pattern. For new code, prefer `Task`-based async or coroutines. The APM surface is maintained for backward compatibility only.

---

## 9. Coroutines vs. Async: Decision Guide

```
Is the work I/O-bound (disk, network)?
├── YES → Use async/await + marshal results to main thread
└── NO → Is the work spread across multiple game frames?
    ├── YES → Use a coroutine
    └── NO → Just do it in Update()
```

| Scenario | Use |
|----------|-----|
| Screen fade over 60 frames | Coroutine |
| Spawn enemies every 2 seconds | Coroutine |
| Cutscene sequence (pan → dialog → animation) | Coroutine |
| Load a 50 MB texture without hitching | async/await |
| POST analytics event to server | async/await |
| Check if player is grounded | Inline in `Update()` |

---

## 10. Performance Considerations

- **Allocation:** Each `Start()` allocates one `CoroutineHandle` and the compiler-generated `IEnumerator` state machine. For hot paths (hundreds of coroutines per frame), consider pooling handles.
- **Yield instructions:** `WaitForSeconds` and `WaitForFrames` are tiny structs if you make them `struct : IYieldInstruction` — but be aware of boxing when stored as `IYieldInstruction`. Use a generic `IEnumerator<T>` with a union-style yield or accept the small allocation.
- **Iteration cost:** The runner iterates all active coroutines every frame. For thousands of simultaneous coroutines, batch into buckets or use a priority queue.
- **GC pressure:** In practice, most games have < 50 active coroutines. The GC cost is negligible compared to rendering. Profile before optimising.

### Struct Yield to Avoid Boxing (Advanced)

```csharp
// WHY: If you need zero-allocation yields, you can use a discriminated
// union approach. This is rarely necessary but shown for completeness.

public readonly struct YieldInstruction
{
    public readonly YieldType Type;
    public readonly float Seconds;
    public readonly int Frames;
    public readonly Func<bool> Predicate;

    public static YieldInstruction Seconds(float s) =>
        new(YieldType.Seconds, s, 0, null);
    public static YieldInstruction NextFrame =>
        new(YieldType.Frames, 0, 1, null);

    // ... constructor, enum, etc.
}
```

This trades ergonomics for zero allocations — only worth it if profiling shows GC spikes from yield instructions.
