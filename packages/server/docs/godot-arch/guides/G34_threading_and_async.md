# G34 — Threading, Async Loading, and Background Tasks

> **Category:** Guide · **Engine:** Godot 4.4+ · **Language:** GDScript / C#
> **Related:** [G18 Performance Profiling](./G18_performance_profiling.md) · [G11 Save/Load Systems](./G11_save_load_systems.md) · [G17 Procedural Generation](./G17_procedural_generation.md) · [G24 Terrain & Open World](./G24_terrain_and_open_world.md)

---

## What This Guide Covers

Godot 4.x provides three concurrency mechanisms — **coroutines** (`await`), **background resource loading** (`ResourceLoader`), and **explicit threading** (`WorkerThreadPool`, `Thread`). Choosing the right one is critical: coroutines keep code simple but run on the main thread, background loading is purpose-built for assets, and explicit threading unlocks true parallelism for compute-heavy work like procedural generation or AI.

This guide covers when to use each approach, the APIs involved, thread-safety rules, and practical patterns for loading screens, chunked world generation, and parallel enemy processing.

---

## Table of Contents

1. [Concurrency Model Overview](#1-concurrency-model-overview)
2. [Coroutines and Await](#2-coroutines-and-await)
3. [Background Resource Loading](#3-background-resource-loading)
4. [WorkerThreadPool](#4-workerthreadpool)
5. [Manual Threads](#5-manual-threads)
6. [Mutexes and Semaphores](#6-mutexes-and-semaphores)
7. [Thread-Safety Rules](#7-thread-safety-rules)
8. [Pattern: Loading Screen with Progress](#8-pattern-loading-screen-with-progress)
9. [Pattern: Chunked World Generation](#9-pattern-chunked-world-generation)
10. [Pattern: Parallel Enemy Processing](#10-pattern-parallel-enemy-processing)
11. [C# Equivalents](#11-c-equivalents)
12. [Common Mistakes](#12-common-mistakes)

---

## 1. Concurrency Model Overview

```
┌────────────────────────────────────────────────────────────┐
│  Main Thread (SceneTree)                                    │
│  ├── _process() / _physics_process()                       │
│  ├── Coroutines (await) — cooperative, same thread         │
│  └── Signals — deferred by default                         │
├────────────────────────────────────────────────────────────┤
│  Background Loading Thread(s)                               │
│  └── ResourceLoader.load_threaded_request()                │
│      Returns loaded resource to main thread via polling     │
├────────────────────────────────────────────────────────────┤
│  WorkerThreadPool                                           │
│  ├── add_task()        — single task, one worker thread    │
│  └── add_group_task()  — batch task, distributed across N  │
├────────────────────────────────────────────────────────────┤
│  Manual Thread                                              │
│  └── Thread.new() — full control, your responsibility      │
└────────────────────────────────────────────────────────────┘
```

**Decision matrix:**

| Need | Use | Why |
|------|-----|-----|
| Wait for a signal or timer | `await` | No thread overhead, simple syntax |
| Load a scene/resource without freezing | `ResourceLoader.load_threaded_request()` | Purpose-built, handles caching |
| Heavy computation (proc-gen, pathfinding) | `WorkerThreadPool.add_task()` | Reuses engine thread pool |
| Batch operation over many items | `WorkerThreadPool.add_group_task()` | Auto-distributes across workers |
| Long-lived background system | `Thread.new()` | Full control over lifecycle |

---

## 2. Coroutines and Await

Coroutines pause a function and resume it later — all on the main thread. They are **not** parallel execution.

### Awaiting Signals

```gdscript
# Wait for animation to finish before continuing
func play_attack() -> void:
    animation_player.play("slash")
    await animation_player.animation_finished
    # This line runs after "slash" completes
    can_attack = true
```

### Awaiting Timers

```gdscript
func flash_damage() -> void:
    modulate = Color.RED
    await get_tree().create_timer(0.15).timeout
    modulate = Color.WHITE
```

### Awaiting Another Coroutine

```gdscript
func load_and_transition() -> void:
    var scene: PackedScene = await load_scene_async("res://levels/world_2.tscn")
    get_tree().change_scene_to_packed(scene)

func load_scene_async(path: String) -> PackedScene:
    ResourceLoader.load_threaded_request(path)
    while ResourceLoader.load_threaded_get_status(path) != ResourceLoader.THREAD_LOAD_LOADED:
        await get_tree().process_frame
    return ResourceLoader.load_threaded_get(path) as PackedScene
```

### Key Rules

- A function containing `await` returns a `Signal` to the caller — the caller must also `await` it or the result is lost.
- `await` does **not** block the main thread; it yields back to the engine loop.
- Do not use `await` for heavy computation — it still runs on the main thread and will cause frame hitches.

---

## 3. Background Resource Loading

`ResourceLoader` provides a dedicated API for loading assets without freezing the game.

### Basic Usage

```gdscript
func start_loading(path: String) -> void:
    # Start the background load. use_sub_threads=true lets Godot use
    # multiple threads for sub-resources (faster but may cause micro-stutters).
    ResourceLoader.load_threaded_request(path, "", true)

func poll_loading(path: String) -> float:
    var progress: Array = []
    var status: ResourceLoader.ThreadLoadStatus = ResourceLoader.load_threaded_get_status(path, progress)

    match status:
        ResourceLoader.THREAD_LOAD_IN_PROGRESS:
            return progress[0]  # 0.0 → 1.0
        ResourceLoader.THREAD_LOAD_LOADED:
            return 1.0
        ResourceLoader.THREAD_LOAD_FAILED:
            push_error("Failed to load: %s" % path)
            return -1.0
        _:
            return 0.0

func get_loaded(path: String) -> Resource:
    # Call ONLY after status == THREAD_LOAD_LOADED
    return ResourceLoader.load_threaded_get(path)
```

### Loading Multiple Resources

```gdscript
var _pending_loads: Array[String] = []

func queue_loads(paths: Array[String]) -> void:
    for path in paths:
        ResourceLoader.load_threaded_request(path, "", true)
        _pending_loads.append(path)

func get_overall_progress() -> float:
    if _pending_loads.is_empty():
        return 1.0
    var total: float = 0.0
    for path in _pending_loads:
        var progress: Array = []
        ResourceLoader.load_threaded_get_status(path, progress)
        total += progress[0] if not progress.is_empty() else 0.0
    return total / float(_pending_loads.size())
```

### Caveats

- `load_threaded_request()` caches internally — calling it twice with the same path is safe and cheap.
- The loaded resource is pinned in memory until you call `load_threaded_get()`. Always retrieve it.
- **Web exports:** Background loading does not use threads on the web platform (single-threaded). It still works but may cause frame drops for large resources.
- Resources that reference other resources (e.g., a scene with many textures) load sub-resources on the main thread unless `use_sub_threads=true`.

---

## 4. WorkerThreadPool

The `WorkerThreadPool` singleton manages a pool of threads created at startup. Use it for compute-heavy tasks that don't need to touch the scene tree.

### Single Task

```gdscript
func generate_noise_map(width: int, height: int) -> void:
    # The callable runs on a worker thread
    var task_id: int = WorkerThreadPool.add_task(
        _generate_noise.bind(width, height),
        false,  # high_priority
        "noise_generation"  # description (debugging)
    )
    # Do other work here while task runs...

    # Block until complete (call from a coroutine or non-critical path)
    WorkerThreadPool.wait_for_task_completion(task_id)

var _noise_result: PackedFloat32Array

func _generate_noise(width: int, height: int) -> void:
    # ⚠ This runs on a worker thread — NO scene tree access!
    var noise := FastNoiseLite.new()
    noise.seed = randi()
    _noise_result.resize(width * height)
    for y in height:
        for x in width:
            _noise_result[y * width + x] = noise.get_noise_2d(float(x), float(y))
```

### Group Task (Parallel Batches)

Group tasks call the same `Callable` multiple times with different indices — perfect for processing arrays in parallel.

```gdscript
var enemies: Array[Enemy] = []
var enemy_scores: PackedFloat32Array

func evaluate_all_enemies() -> void:
    var count: int = enemies.size()
    enemy_scores.resize(count)

    var group_id: int = WorkerThreadPool.add_group_task(
        _evaluate_enemy,
        count,       # number of invocations
        -1,          # tasks_needed (-1 = auto)
        false,       # high_priority
        "enemy_eval" # description
    )
    WorkerThreadPool.wait_for_group_task_completion(group_id)
    # All scores now populated

func _evaluate_enemy(index: int) -> void:
    # ⚠ Thread-safe: each index writes to its own slot
    var enemy: Enemy = enemies[index]
    enemy_scores[index] = _compute_threat_score(enemy)
```

### Checking Completion Without Blocking

```gdscript
var _active_task: int = -1

func start_heavy_work() -> void:
    _active_task = WorkerThreadPool.add_task(_do_heavy_work)

func _process(_delta: float) -> void:
    if _active_task >= 0:
        if WorkerThreadPool.is_task_completed(_active_task):
            WorkerThreadPool.wait_for_task_completion(_active_task)  # Clean up
            _active_task = -1
            _on_heavy_work_done()
```

---

## 5. Manual Threads

For long-lived systems (a dedicated networking thread, a continuous proc-gen pipeline), use `Thread` directly.

```gdscript
var _thread: Thread
var _running: bool = false
var _mutex: Mutex

func _ready() -> void:
    _mutex = Mutex.new()
    _thread = Thread.new()
    _running = true
    _thread.start(_background_loop)

func _background_loop() -> void:
    while _running:
        _mutex.lock()
        var work_item: Variant = _dequeue_work()
        _mutex.unlock()

        if work_item != null:
            _process_work(work_item)
        else:
            OS.delay_msec(5)  # Don't spin-wait

func _exit_tree() -> void:
    _running = false
    _thread.wait_to_finish()  # MUST call before freeing
```

**Always** call `Thread.wait_to_finish()` before the node is freed. Failing to do so can crash the engine on exit.

---

## 6. Mutexes and Semaphores

### Mutex

```gdscript
var _mutex := Mutex.new()
var _shared_data: Array = []

func _add_from_thread(item: Variant) -> void:
    _mutex.lock()
    _shared_data.append(item)
    _mutex.unlock()

func _read_from_main() -> Array:
    _mutex.lock()
    var copy: Array = _shared_data.duplicate()
    _mutex.unlock()
    return copy
```

### Semaphore

Semaphores let a thread sleep until signaled — useful for producer/consumer patterns.

```gdscript
var _semaphore := Semaphore.new()
var _queue: Array = []
var _queue_mutex := Mutex.new()

# Producer (main thread)
func enqueue(item: Variant) -> void:
    _queue_mutex.lock()
    _queue.append(item)
    _queue_mutex.unlock()
    _semaphore.post()  # Wake the consumer

# Consumer (worker thread)
func _consumer_loop() -> void:
    while _running:
        _semaphore.wait()  # Sleep until post()
        _queue_mutex.lock()
        var item: Variant = _queue.pop_front()
        _queue_mutex.unlock()
        if item != null:
            _process_item(item)
```

---

## 7. Thread-Safety Rules

Godot's scene tree is **not** thread-safe. Violating these rules causes subtle bugs or crashes.

### What You CAN Do from Worker Threads

- Math operations, noise generation, array manipulation
- Read `Resource` properties (if no other thread writes them simultaneously)
- Use `Mutex`, `Semaphore`, `Thread`
- Call `OS.delay_msec()`, `Time.get_ticks_msec()`
- Create new `Resource` subclasses (but don't add them to the tree)

### What You CANNOT Do from Worker Threads

- Add/remove/reparent nodes in the scene tree
- Modify node properties (position, visibility, etc.)
- Emit signals connected to scene tree nodes
- Call `get_tree()`, `get_node()`, or any tree-traversal method
- Access `Input` singleton
- Modify `RenderingServer` directly (unless using its thread-safe API subset)

### Passing Results Back to Main Thread

Use `call_deferred()` or signals:

```gdscript
# From a worker thread, schedule a call on the main thread
call_deferred("_apply_generation_result", result_data)

func _apply_generation_result(data: PackedFloat32Array) -> void:
    # This runs on the main thread — safe to modify nodes
    terrain_mesh.update_from_heightmap(data)
```

Or use a flag pattern:

```gdscript
var _result_ready: bool = false
var _result: PackedFloat32Array

func _process(_delta: float) -> void:
    if _result_ready:
        _result_ready = false
        _apply_result(_result)

func _worker_func() -> void:
    _result = _compute_heavy_thing()
    _result_ready = true  # Atomic on most platforms for bool
```

---

## 8. Pattern: Loading Screen with Progress

A complete loading screen combining `ResourceLoader` with a progress bar.

```gdscript
# loading_screen.gd
extends CanvasLayer

@onready var progress_bar: ProgressBar = %ProgressBar
@onready var status_label: Label = %StatusLabel

var _target_scene_path: String

func load_scene(path: String) -> void:
    _target_scene_path = path
    ResourceLoader.load_threaded_request(path, "", true)
    visible = true

func _process(_delta: float) -> void:
    if _target_scene_path.is_empty():
        return

    var progress: Array = []
    var status := ResourceLoader.load_threaded_get_status(_target_scene_path, progress)

    match status:
        ResourceLoader.THREAD_LOAD_IN_PROGRESS:
            var pct: float = progress[0] if not progress.is_empty() else 0.0
            progress_bar.value = pct * 100.0
            status_label.text = "Loading... %d%%" % int(pct * 100.0)

        ResourceLoader.THREAD_LOAD_LOADED:
            var scene: PackedScene = ResourceLoader.load_threaded_get(_target_scene_path)
            _target_scene_path = ""
            visible = false
            get_tree().change_scene_to_packed(scene)

        ResourceLoader.THREAD_LOAD_FAILED:
            status_label.text = "Load failed!"
            _target_scene_path = ""
```

---

## 9. Pattern: Chunked World Generation

Generate terrain chunks on worker threads, apply results on the main thread.

```gdscript
# chunk_generator.gd
extends Node

const CHUNK_SIZE := 64

var _pending_chunks: Dictionary[Vector2i, int] = {}  # chunk_pos → task_id
var _completed: Dictionary[Vector2i, PackedFloat32Array] = {}
var _mutex := Mutex.new()

func request_chunk(chunk_pos: Vector2i) -> void:
    if _pending_chunks.has(chunk_pos):
        return
    var task_id := WorkerThreadPool.add_task(
        _generate_chunk.bind(chunk_pos)
    )
    _pending_chunks[chunk_pos] = task_id

func _generate_chunk(pos: Vector2i) -> void:
    var noise := FastNoiseLite.new()
    noise.seed = 42
    var heightmap := PackedFloat32Array()
    heightmap.resize(CHUNK_SIZE * CHUNK_SIZE)
    for y in CHUNK_SIZE:
        for x in CHUNK_SIZE:
            var wx: float = float(pos.x * CHUNK_SIZE + x)
            var wy: float = float(pos.y * CHUNK_SIZE + y)
            heightmap[y * CHUNK_SIZE + x] = noise.get_noise_2d(wx, wy)

    _mutex.lock()
    _completed[pos] = heightmap
    _mutex.unlock()

func _process(_delta: float) -> void:
    _mutex.lock()
    var ready_chunks := _completed.duplicate()
    _completed.clear()
    _mutex.unlock()

    for pos: Vector2i in ready_chunks:
        if _pending_chunks.has(pos):
            WorkerThreadPool.wait_for_task_completion(_pending_chunks[pos])
            _pending_chunks.erase(pos)
        _instantiate_chunk(pos, ready_chunks[pos])
```

---

## 10. Pattern: Parallel Enemy Processing

Use group tasks to evaluate AI for many enemies simultaneously.

```gdscript
# ai_batch_processor.gd
extends Node

var _enemies: Array[CharacterBody3D] = []
var _decisions: Array[Dictionary] = []

func process_ai_batch() -> void:
    var count := _enemies.size()
    _decisions.resize(count)

    var group_id := WorkerThreadPool.add_group_task(
        _evaluate_enemy, count
    )
    WorkerThreadPool.wait_for_group_task_completion(group_id)

    # Apply decisions on main thread
    for i in count:
        _enemies[i].apply_ai_decision(_decisions[i])

func _evaluate_enemy(index: int) -> void:
    # ⚠ Read-only access to enemy state — write only to _decisions[index]
    var enemy := _enemies[index]
    var pos := enemy.global_position  # Reading is safe if main thread isn't writing
    _decisions[index] = {
        "target": _find_nearest_target(pos),
        "action": "attack" if randf() > 0.5 else "patrol",
    }
```

---

## 11. C# Equivalents

### Background Loading

```csharp
using Godot;

public partial class AsyncLoader : Node
{
    public async void LoadSceneAsync(string path)
    {
        ResourceLoader.LoadThreadedRequest(path, useSubThreads: true);

        while (ResourceLoader.LoadThreadedGetStatus(path) ==
               ResourceLoader.ThreadLoadStatus.InProgress)
        {
            await ToSignal(GetTree(), SceneTree.SignalName.ProcessFrame);
        }

        var scene = ResourceLoader.LoadThreadedGet(path) as PackedScene;
        GetTree().ChangeSceneToPacked(scene);
    }
}
```

### WorkerThreadPool

```csharp
using Godot;

public partial class ParallelProcessor : Node
{
    private float[] _results;

    public void ProcessInParallel(int count)
    {
        _results = new float[count];

        long groupId = WorkerThreadPool.AddGroupTask(
            Callable.From<int>(EvaluateItem), count
        );
        WorkerThreadPool.WaitForGroupTaskCompletion(groupId);
    }

    private void EvaluateItem(int index)
    {
        // Thread-safe: each index writes to its own slot
        _results[index] = Mathf.Sin(index * 0.1f);
    }
}
```

### Manual Thread with Task

```csharp
using Godot;
using System.Threading.Tasks;

public partial class BackgroundWorker : Node
{
    // C# Tasks work in Godot but you MUST marshal back to the main thread
    // using CallDeferred for any scene tree operations.
    public async void StartWork()
    {
        var result = await Task.Run(() => HeavyComputation());
        CallDeferred(MethodName.ApplyResult, result);
    }

    private float HeavyComputation()
    {
        // Runs on .NET thread pool
        float sum = 0f;
        for (int i = 0; i < 10_000_000; i++)
            sum += Mathf.Sin(i * 0.001f);
        return sum;
    }

    private void ApplyResult(float value)
    {
        GD.Print($"Result: {value}");
    }
}
```

---

## 12. Common Mistakes

| Mistake | Why It Breaks | Fix |
|---------|--------------|-----|
| Modifying nodes from a worker thread | Scene tree isn't thread-safe; causes crashes or corruption | Use `call_deferred()` to marshal back to main thread |
| Forgetting `wait_for_task_completion()` | Leaks internal resources | Always wait, even if you don't need the result |
| Forgetting `Thread.wait_to_finish()` | Crashes on scene exit or engine shutdown | Call in `_exit_tree()` |
| Using `await` for heavy computation | `await` doesn't move work off the main thread — still causes frame drops | Use `WorkerThreadPool` instead |
| Spin-waiting without delay | Burns 100% CPU on the thread | Use `OS.delay_msec(1)` or a `Semaphore` |
| Sharing a mutable `Array` without a `Mutex` | Race conditions — intermittent wrong results or crashes | Protect with `Mutex` or give each thread its own index range |
| Calling `ResourceLoader.load_threaded_get()` before status is `LOADED` | Returns `null` or stale data | Always check status first |
| Using `use_sub_threads=true` on web builds | Web is single-threaded; flag is ignored but code may assume parallelism | Feature-detect with `OS.get_name() == "Web"` |
