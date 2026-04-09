# G18 — Scripting Patterns & Best Practices

> **Category:** guide · **Engine:** Stride · **Related:** [G01 Getting Started](./G01_getting_started.md) · [G03 Code-Only Development](./G03_code_only_development.md) · [G08 Stride 4.3 Migration](./G08_stride_43_migration.md) · [G14 .NET 10 Performance](./G14_dotnet10_csharp14_performance.md)

How to choose and structure scripts in Stride 4.3. Covers SyncScript, AsyncScript, and StartupScript lifecycle, real-world usage patterns, inter-script communication, common pitfalls, and performance considerations. Stride scripts are components that attach to entities — understanding when to use each type is foundational to building clean game systems.

---

## Script Types Overview

Stride provides three base classes for game logic. All scripts must be `public` classes and derive from one of these:

| Base Class | Lifecycle Methods | Use Case |
|---|---|---|
| `StartupScript` | `Start()`, `Cancel()` | One-time initialization or teardown |
| `SyncScript` | `Start()`, `Update()`, `Cancel()` | Per-frame logic (movement, input, animation) |
| `AsyncScript` | `Execute()`, `Cancel()` | Event-driven, coroutine-style, or long-running tasks |

All three inherit from `ScriptComponent`, which means they are **components** attached to **entities** in the scene graph. You add them to entities either through the editor or via code.

---

## StartupScript

StartupScript runs once when the entity is added to the scene and cleans up when removed. Use it for initialization that doesn't need per-frame updates.

```csharp
public class SceneInitializer : StartupScript
{
    // Exposed in editor as a property
    public int EnemyCount { get; set; } = 10;

    public override void Start()
    {
        // Spawn initial enemies when the scene loads
        for (int i = 0; i < EnemyCount; i++)
        {
            var enemy = new Entity($"Enemy_{i}");
            enemy.Transform.Position = GetSpawnPosition(i);
            enemy.Add(new ModelComponent { Model = Content.Load<Model>("Models/Enemy") });
            enemy.Add(new EnemyAI());
            Entity.Scene.Entities.Add(enemy);
        }
    }

    public override void Cancel()
    {
        // Clean up resources if needed when this entity is removed
        Log.Info("SceneInitializer removed from scene.");
    }

    private Vector3 GetSpawnPosition(int index)
    {
        float angle = index * (MathF.PI * 2f / EnemyCount);
        return new Vector3(MathF.Cos(angle) * 10f, 0f, MathF.Sin(angle) * 10f);
    }
}
```

### When to Use StartupScript

- Spawning entities at scene load
- Registering services or event handlers
- Loading configuration data
- Setting up systems that don't need per-frame updates (the system itself handles its own timing)

---

## SyncScript

SyncScript is the workhorse for frame-dependent logic. `Update()` is called every frame on the main thread, in sequence with other sync scripts. If one sync script takes 1 second in `Update()`, the entire game freezes for that second.

```csharp
public class PlayerController : SyncScript
{
    public float MoveSpeed { get; set; } = 5.0f;
    public float RotationSpeed { get; set; } = 3.0f;

    // Reference another entity's component (set in editor)
    public CameraComponent Camera { get; set; }

    public override void Start()
    {
        // One-time setup — cache references, initialize state
        if (Camera == null)
            Camera = Entity.Scene.Entities
                .SelectMany(e => e.GetAll<CameraComponent>())
                .FirstOrDefault();
    }

    public override void Update()
    {
        var dt = (float)Game.UpdateTime.Elapsed.TotalSeconds;

        // Read input every frame
        var moveDirection = Vector3.Zero;

        if (Input.IsKeyDown(Keys.W))
            moveDirection += Entity.Transform.WorldMatrix.Forward;
        if (Input.IsKeyDown(Keys.S))
            moveDirection -= Entity.Transform.WorldMatrix.Forward;
        if (Input.IsKeyDown(Keys.A))
            moveDirection -= Entity.Transform.WorldMatrix.Right;
        if (Input.IsKeyDown(Keys.D))
            moveDirection += Entity.Transform.WorldMatrix.Right;

        // Normalize to prevent faster diagonal movement
        if (moveDirection.LengthSquared() > 0.001f)
        {
            moveDirection.Normalize();
            Entity.Transform.Position += moveDirection * MoveSpeed * dt;
        }

        // Mouse rotation
        if (Input.IsMouseButtonDown(MouseButton.Right))
        {
            Entity.Transform.Rotation *= Quaternion.RotationY(
                -Input.MouseDelta.X * RotationSpeed * dt);
        }
    }
}
```

### SyncScript Best Practices

1. **Keep `Update()` fast.** Every sync script runs sequentially on the main thread. Heavy computation belongs in an AsyncScript or a background task.

2. **Cache references in `Start()`.** Don't call `Entity.Get<T>()` or LINQ queries every frame — cache the result.

3. **Use delta time.** Always multiply movement/rotation by `Game.UpdateTime.Elapsed.TotalSeconds` for frame-rate-independent behavior.

4. **Guard against null.** Editor-assigned properties may be null if the user forgot to link them:

```csharp
public override void Update()
{
    if (Camera == null) return; // Defensive — don't crash the game loop
    // ...
}
```

---

## AsyncScript

AsyncScript runs its `Execute()` method as an async coroutine. It starts on the main thread but can offload work to background threads with `Task.Run()`, then return to the main thread with `await Script.NextFrame()`.

```csharp
public class WaveSpawner : AsyncScript
{
    public Prefab EnemyPrefab { get; set; }
    public int WavesTotal { get; set; } = 5;
    public int EnemiesPerWave { get; set; } = 8;
    public float DelayBetweenWaves { get; set; } = 10f;

    public override async Task Execute()
    {
        // Wait 3 seconds before the first wave
        await Task.Delay(TimeSpan.FromSeconds(3));

        for (int wave = 0; wave < WavesTotal; wave++)
        {
            Log.Info($"Spawning wave {wave + 1}/{WavesTotal}");
            SpawnWave(wave);

            // Wait between waves — game continues running during this
            float elapsed = 0f;
            while (elapsed < DelayBetweenWaves)
            {
                await Script.NextFrame(); // Yield to game loop, resume next frame
                elapsed += (float)Game.UpdateTime.Elapsed.TotalSeconds;
            }
        }

        Log.Info("All waves spawned.");
    }

    private void SpawnWave(int waveIndex)
    {
        if (EnemyPrefab == null) return;

        for (int i = 0; i < EnemiesPerWave; i++)
        {
            var entities = EnemyPrefab.Instantiate();
            foreach (var entity in entities)
            {
                float angle = i * (MathF.PI * 2f / EnemiesPerWave);
                float radius = 15f + waveIndex * 3f;
                entity.Transform.Position = new Vector3(
                    MathF.Cos(angle) * radius, 0f, MathF.Sin(angle) * radius);
                Entity.Scene.Entities.Add(entity);
            }
        }
    }
}
```

### AsyncScript Patterns

**Pattern 1: Game loop with await**

The most common pattern — a `while (Game.IsRunning)` loop that yields each frame:

```csharp
public override async Task Execute()
{
    while (Game.IsRunning)
    {
        // Check conditions, update state
        if (ShouldTriggerEvent())
            await HandleEvent();

        await Script.NextFrame();
    }
}
```

**Pattern 2: Background computation**

Offload heavy work to a thread pool thread, then resume on the main thread:

```csharp
public override async Task Execute()
{
    // Heavy pathfinding on background thread — game doesn't freeze
    var path = await Task.Run(() => ComputeExpensivePath(start, end));

    // Back on main thread — safe to touch entities
    await Script.NextFrame();
    ApplyPathToEntity(path);
}
```

**Pattern 3: Sequential cutscene/tutorial**

AsyncScript is ideal for scripted sequences that would be awkward as state machines:

```csharp
public override async Task Execute()
{
    // Show dialogue
    ShowDialogue("Welcome, adventurer!");
    await WaitForInput(Keys.Space);

    // Camera pan
    await LerpCameraTo(targetPosition, duration: 2f);

    // Spawn NPC
    SpawnGuideNPC();
    await Task.Delay(TimeSpan.FromSeconds(1));

    ShowDialogue("Follow me to the village.");
}

private async Task WaitForInput(Keys key)
{
    while (!Input.IsKeyPressed(key))
        await Script.NextFrame();
}

private async Task LerpCameraTo(Vector3 target, float duration)
{
    var start = CameraEntity.Transform.Position;
    float elapsed = 0f;
    while (elapsed < duration)
    {
        float t = elapsed / duration;
        CameraEntity.Transform.Position = Vector3.Lerp(start, target, t);
        await Script.NextFrame();
        elapsed += (float)Game.UpdateTime.Elapsed.TotalSeconds;
    }
    CameraEntity.Transform.Position = target;
}
```

### AsyncScript Threading Rules

- `Execute()` starts on the **main thread** — safe to access entities, input, and Stride services.
- After `await Task.Run(...)`, you are on a **thread pool thread** — do NOT access Stride APIs.
- After `await Script.NextFrame()`, you are back on the **main thread** — safe again.
- The `CancellationToken` is triggered when the script's entity is removed from the scene. Check it in long loops or pass it to `Task.Run()`.

---

## Inter-Script Communication

Scripts on the same entity or across entities need to communicate. Stride provides several patterns:

### Direct Reference (Editor-Linked)

Expose a public property of another script's type and link it in the editor:

```csharp
public class DamageReceiver : SyncScript
{
    public HealthBar HealthBarScript { get; set; } // Linked in editor

    public void TakeDamage(float amount)
    {
        HealthBarScript?.UpdateHealth(-amount);
    }
}
```

### Entity.Get<T>() Lookup

Find a sibling component on the same entity:

```csharp
public override void Start()
{
    var rigidBody = Entity.Get<RigidbodyComponent>();
    var animator = Entity.Get<AnimationComponent>();
}
```

### Event-Based Communication

For loosely coupled systems, use C# events or a simple event bus:

```csharp
// Shared event definition
public static class GameEvents
{
    public static event Action<Entity, float> OnDamageDealt;
    public static event Action<int> OnScoreChanged;

    public static void DamageDealt(Entity target, float amount)
        => OnDamageDealt?.Invoke(target, amount);

    public static void ScoreChanged(int newScore)
        => OnScoreChanged?.Invoke(newScore);
}

// Producer script
public class Weapon : SyncScript
{
    public override void Update()
    {
        if (Input.IsKeyPressed(Keys.Space))
            GameEvents.DamageDealt(targetEntity, 25f);
    }
}

// Consumer script
public class ScoreUI : SyncScript
{
    public override void Start()
    {
        GameEvents.OnScoreChanged += HandleScoreChange;
    }

    public override void Cancel()
    {
        GameEvents.OnScoreChanged -= HandleScoreChange; // Always unsubscribe!
    }

    private void HandleScoreChange(int newScore)
    {
        // Update UI element
    }
}
```

---

## Common Pitfalls

### 1. Forgetting to Unsubscribe Events

If you subscribe to a static event in `Start()`, you must unsubscribe in `Cancel()`. Otherwise, removed entities keep receiving events (and crash when they try to access destroyed components).

### 2. Blocking in AsyncScript

`Thread.Sleep()` or synchronous I/O in `Execute()` blocks the main thread — the game freezes. Always use `await Task.Delay()` or `await Script.NextFrame()` for timing.

### 3. Accessing Stride APIs from Background Threads

After `Task.Run()`, you're off the main thread. Accessing `Entity.Transform`, `Input`, `Content`, or `SceneSystem` will cause race conditions or crashes. Always `await Script.NextFrame()` to return to the main thread before touching engine state.

### 4. Heavy SyncScript Updates

If a sync script does expensive work in `Update()` (pathfinding, terrain generation, AI planning), it stalls all other sync scripts and rendering. Move heavy work to an AsyncScript with `Task.Run()` and apply results on the next frame.

### 5. Script Execution Order

Stride does not guarantee the order in which sync scripts execute their `Update()` methods. If script B depends on script A running first, use `[DefaultMember]` ordering or restructure so they communicate through state rather than execution order assumptions.

---

## Performance Tips

- **Pool entities** instead of creating/destroying them every frame. Disable unused entities with `Entity.EnableAll(false)` and re-enable when needed.
- **Use `Game.UpdateTime.Factor`** to implement slow-motion or pause without changing script logic — set it to 0 for pause, 0.5 for slow-mo.
- **Profile with Stride's built-in profiler.** Access via `Game.ProfilerSystem` or the editor's profiler panel to identify which scripts consume the most frame time.
- **Prefer `IsKeyDown` over event lists** for simple input checks — event list processing allocates more.
- **Mark properties with `[DataMemberIgnore]`** if they shouldn't be serialized or exposed in the editor — reduces noise and prevents accidental state persistence.

---

## Choosing the Right Script Type

| Scenario | Script Type | Why |
|---|---|---|
| Player movement & input | SyncScript | Needs per-frame response |
| Enemy AI tick | SyncScript | Regular decision-making each frame |
| Wave spawner with delays | AsyncScript | Natural for "wait, then do" patterns |
| Cutscene sequence | AsyncScript | Sequential steps with timing |
| Background pathfinding | AsyncScript | Offload to thread pool |
| Scene setup / entity spawning | StartupScript | One-time initialization |
| Service registration | StartupScript | Runs once, no updates needed |
| Network lobby polling | AsyncScript | Async I/O with periodic checks |
