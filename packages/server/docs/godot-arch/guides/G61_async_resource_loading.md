# G61 — Async Resource Loading & Scene Streaming

> **Category:** Guide · **Engine:** Godot 4.4+ · **Language:** GDScript / C#
> **Related:** [G18 Performance Profiling](./G18_performance_profiling.md) · [G37 Scene Management & Transitions](./G37_scene_management_and_transitions.md) · [G34 Threading & Async](./G34_threading_and_async.md) · [G24 Terrain & Open World](./G24_terrain_and_open_world.md)

---

## What This Guide Covers

Calling `load()` or `preload()` blocks the main thread — fine for small resources, but a 200 MB level scene will freeze your game for seconds. Godot's `ResourceLoader` provides a threaded loading pipeline that moves disk I/O and resource parsing to background threads, letting your game keep running a loading screen, ambient animation, or even gameplay while heavy assets load behind the scenes.

This guide covers the three-step threaded loading API (`request → poll → get`), loading screen patterns, sub-thread acceleration, streaming large worlds with chunk-based loading, cache management, error handling, and platform-specific caveats (web, mobile).

**Use threaded loading when:** loading screens need progress bars or animations, seamless open-world streaming, preloading the next level during gameplay, or any resource load that takes more than ~100ms.

**Stick with `preload()` when:** resources are small, known at compile time, and needed immediately (e.g., a bullet scene in a weapon script).

---

## Table of Contents

1. [How Resource Loading Works in Godot](#1-how-resource-loading-works-in-godot)
2. [The Threaded Loading Pipeline](#2-the-threaded-loading-pipeline)
3. [Building a Loading Screen](#3-building-a-loading-screen)
4. [Sub-Thread Acceleration](#4-sub-thread-acceleration)
5. [Streaming Open Worlds — Chunk-Based Loading](#5-streaming-open-worlds--chunk-based-loading)
6. [Cache Management and Memory](#6-cache-management-and-memory)
7. [Error Handling](#7-error-handling)
8. [Platform Caveats — Web, Mobile, Console](#8-platform-caveats--web-mobile-console)
9. [C# Equivalents](#9-c-equivalents)
10. [Common Mistakes](#10-common-mistakes)

---

## 1. How Resource Loading Works in Godot

Godot has three loading mechanisms, each suited to different situations:

| Method | Thread | When resolved | Use case |
|--------|--------|---------------|----------|
| `preload("res://...")` | Main (compile time) | Before `_ready()` | Small, always-needed resources |
| `load("res://...")` | Main (runtime) | Blocks until done | Simple scripts, tools |
| `ResourceLoader.load_threaded_request()` | Background | You poll for completion | Large scenes, textures, audio |

`preload()` is resolved by the editor/export pipeline and baked into the PCK — it adds zero runtime cost but increases startup time if overused. `load()` is identical at runtime but deferred until the call site executes. Both freeze the main thread.

`ResourceLoader.load_threaded_request()` is the async alternative. It queues a resource for background loading and returns immediately. You then poll with `load_threaded_get_status()` until the resource is ready, then retrieve it with `load_threaded_get()`.

---

## 2. The Threaded Loading Pipeline

The API follows a request → poll → retrieve pattern:

### GDScript

```gdscript
# Step 1: Request background loading
# type_hint helps Godot pick the right loader (optional but recommended)
ResourceLoader.load_threaded_request("res://levels/world_2.tscn", "PackedScene")

# Step 2: Poll each frame (in _process or a loading screen)
func _process(delta: float) -> void:
    var progress: Array = []
    var status := ResourceLoader.load_threaded_get_status(
        "res://levels/world_2.tscn", progress
    )

    match status:
        ResourceLoader.THREAD_LOAD_IN_PROGRESS:
            # progress[0] is a float 0.0–1.0
            loading_bar.value = progress[0] * 100.0
        ResourceLoader.THREAD_LOAD_LOADED:
            # Step 3: Retrieve the loaded resource
            var scene: PackedScene = ResourceLoader.load_threaded_get(
                "res://levels/world_2.tscn"
            )
            _on_level_loaded(scene)
        ResourceLoader.THREAD_LOAD_FAILED:
            push_error("Failed to load world_2.tscn")
        ResourceLoader.THREAD_LOAD_INVALID_RESOURCE:
            push_error("Invalid resource path")
```

### Key parameters for `load_threaded_request()`

```gdscript
ResourceLoader.load_threaded_request(
    path: String,           # Resource path
    type_hint: String = "", # e.g., "PackedScene", "Texture2D"
    use_sub_threads: bool = false,  # Allow sub-resources to load in parallel
    cache_mode: int = ResourceLoader.CACHE_MODE_REUSE  # Cache behavior
)
```

**Return value:** An `Error` enum — `OK` on success, `ERR_BUSY` if already loading that path.

### Status values

| Constant | Meaning |
|----------|---------|
| `THREAD_LOAD_IN_PROGRESS` | Still loading — keep polling |
| `THREAD_LOAD_LOADED` | Done — call `load_threaded_get()` |
| `THREAD_LOAD_FAILED` | Error occurred — check logs |
| `THREAD_LOAD_INVALID_RESOURCE` | Bad path or unsupported type |

---

## 3. Building a Loading Screen

A reusable loading screen that can load any scene:

```gdscript
# loading_screen.gd — attach to a Control node with a ProgressBar and AnimationPlayer
class_name LoadingScreen
extends Control

@onready var progress_bar: ProgressBar = %ProgressBar
@onready var anim_player: AnimationPlayer = %AnimationPlayer
@onready var tip_label: Label = %TipLabel

var _target_path: String = ""
var _min_display_time: float = 0.5  # Prevent flash-loading
var _elapsed: float = 0.0

const TIPS: Array[String] = [
    "Press Shift to sprint!",
    "Explore every corner for hidden items.",
    "Save often — the world is dangerous.",
]

func load_scene(scene_path: String) -> void:
    _target_path = scene_path
    _elapsed = 0.0

    # Show with fade-in
    visible = true
    anim_player.play("fade_in")
    tip_label.text = TIPS.pick_random()

    # Start background loading
    var err := ResourceLoader.load_threaded_request(scene_path, "PackedScene", true)
    if err != OK:
        push_error("Failed to start loading: %s" % scene_path)
        return

    set_process(true)

func _process(delta: float) -> void:
    _elapsed += delta
    var progress: Array = []
    var status := ResourceLoader.load_threaded_get_status(_target_path, progress)

    if status == ResourceLoader.THREAD_LOAD_IN_PROGRESS:
        progress_bar.value = progress[0] * 100.0
        return

    if status == ResourceLoader.THREAD_LOAD_LOADED:
        progress_bar.value = 100.0

        # Enforce minimum display time so the screen doesn't flash
        if _elapsed < _min_display_time:
            return

        var scene: PackedScene = ResourceLoader.load_threaded_get(_target_path)
        set_process(false)
        _switch_to_scene(scene)
        return

    # Error states
    push_error("Loading failed for: %s (status %d)" % [_target_path, status])
    set_process(false)

func _switch_to_scene(scene: PackedScene) -> void:
    # Fade out, then swap
    anim_player.play("fade_out")
    await anim_player.animation_finished
    get_tree().change_scene_to_packed(scene)
    queue_free()
```

**Usage from anywhere:**

```gdscript
# Instantiate the loading screen, add to root, and kick it off
var loader := preload("res://ui/loading_screen.tscn").instantiate()
get_tree().root.add_child(loader)
loader.load_scene("res://levels/world_2.tscn")
```

---

## 4. Sub-Thread Acceleration

By default, `load_threaded_request()` uses a single background thread. Pass `use_sub_threads = true` to parallelize sub-resource loading (textures, meshes, scripts within a scene):

```gdscript
ResourceLoader.load_threaded_request(
    "res://levels/huge_level.tscn",
    "PackedScene",
    true  # use_sub_threads — loads textures, meshes in parallel
)
```

**Trade-offs:**

- **Faster loading** — sub-resources load concurrently across CPU cores
- **Spikier frame times** — more threads compete with the main thread. If you're running gameplay during loading (open-world streaming), test carefully
- **Not available on web** — browsers limit threading. `use_sub_threads` is silently ignored on HTML5 builds

**Rule of thumb:** Use `use_sub_threads = true` for loading screens (gameplay is paused anyway). Use `false` for background streaming during gameplay.

---

## 5. Streaming Open Worlds — Chunk-Based Loading

For large worlds, load and unload chunks as the player moves. A common pattern divides the world into a grid of scenes:

```
res://world/chunks/
    chunk_0_0.tscn
    chunk_0_1.tscn
    chunk_1_0.tscn
    ...
```

### Chunk Streaming Manager

```gdscript
# world_streamer.gd
class_name WorldStreamer
extends Node

@export var chunk_size: float = 64.0  # World units per chunk
@export var load_radius: int = 2      # Chunks to keep loaded around player
@export var player: Node3D

# Currently loaded chunks: Vector2i → Node (instantiated scene)
var _loaded_chunks: Dictionary = {}
# Chunks currently being loaded in background
var _loading_chunks: Dictionary = {}  # Vector2i → path

func _process(_delta: float) -> void:
    if not player:
        return

    var player_chunk := _world_to_chunk(player.global_position)
    _request_nearby_chunks(player_chunk)
    _unload_distant_chunks(player_chunk)
    _poll_loading_chunks()

func _world_to_chunk(pos: Vector3) -> Vector2i:
    return Vector2i(
        floori(pos.x / chunk_size),
        floori(pos.z / chunk_size)
    )

func _request_nearby_chunks(center: Vector2i) -> void:
    for x in range(center.x - load_radius, center.x + load_radius + 1):
        for z in range(center.y - load_radius, center.y + load_radius + 1):
            var coord := Vector2i(x, z)
            if coord in _loaded_chunks or coord in _loading_chunks:
                continue

            var path := "res://world/chunks/chunk_%d_%d.tscn" % [x, z]
            if not ResourceLoader.exists(path):
                continue

            var err := ResourceLoader.load_threaded_request(path, "PackedScene")
            if err == OK:
                _loading_chunks[coord] = path

func _poll_loading_chunks() -> void:
    var done: Array[Vector2i] = []
    for coord: Vector2i in _loading_chunks:
        var path: String = _loading_chunks[coord]
        var status := ResourceLoader.load_threaded_get_status(path)

        if status == ResourceLoader.THREAD_LOAD_LOADED:
            var scene: PackedScene = ResourceLoader.load_threaded_get(path)
            var instance := scene.instantiate()
            instance.position = Vector3(
                coord.x * chunk_size, 0.0, coord.y * chunk_size
            )
            add_child(instance)
            _loaded_chunks[coord] = instance
            done.append(coord)
        elif status == ResourceLoader.THREAD_LOAD_FAILED:
            push_warning("Chunk load failed: %s" % path)
            done.append(coord)

    for coord in done:
        _loading_chunks.erase(coord)

func _unload_distant_chunks(center: Vector2i) -> void:
    var to_remove: Array[Vector2i] = []
    for coord: Vector2i in _loaded_chunks:
        var dist := absi(coord.x - center.x) + absi(coord.y - center.y)
        if dist > load_radius + 1:  # +1 hysteresis to avoid load/unload thrashing
            to_remove.append(coord)

    for coord in to_remove:
        _loaded_chunks[coord].queue_free()
        _loaded_chunks.erase(coord)
```

### Design tips for chunk streaming

- **Hysteresis buffer:** Unload at `load_radius + 1` so chunks don't thrash at boundaries
- **Priority loading:** Sort requested chunks by distance to player — load nearest first
- **LOD chunks:** Have low-detail versions for distant chunks (fewer meshes, simplified collision)
- **Shared resources:** Textures and materials used across chunks are cached automatically by Godot's resource system — you don't need to manage this yourself
- **Thread budget:** Don't request dozens of chunks simultaneously. Queue 2–4 at a time

---

## 6. Cache Management and Memory

`ResourceLoader` caches loaded resources by path. The `cache_mode` parameter controls this:

| Mode | Behavior |
|------|----------|
| `CACHE_MODE_REUSE` (default) | Return cached resource if already loaded |
| `CACHE_MODE_IGNORE` | Load fresh, don't read from cache |
| `CACHE_MODE_REPLACE` | Load fresh and overwrite cache entry |
| `CACHE_MODE_REPLACE_DEEP` | Replace including sub-resources |

### Monitoring memory

```gdscript
# Check if a resource is cached
if ResourceLoader.has_cached("res://levels/world_2.tscn"):
    print("Already in memory")

# Performance.get_monitor() for memory tracking
var static_mem := Performance.get_monitor(Performance.MEMORY_STATIC)
var msg_mem := Performance.get_monitor(Performance.MEMORY_MESSAGE_BUFFER_MAX)
print("Static memory: %.1f MB" % (static_mem / 1048576.0))
```

### Forcing resource release

Resources are reference-counted. To release a loaded scene from memory, ensure no references remain:

```gdscript
# Remove from scene tree
chunk_node.queue_free()
# Clear any variable references
my_cached_scene = null
# Godot's ref-counting will free the resource when refcount hits 0
```

**Warning:** `preload()` resources are held by the script itself — they won't be freed until the script is unloaded. For large assets that should be unloadable, always use `load()` or `ResourceLoader`.

---

## 7. Error Handling

Threaded loading can fail silently if you don't check status. Always handle all four states:

```gdscript
func _poll_load(path: String) -> void:
    var progress: Array = []
    var status := ResourceLoader.load_threaded_get_status(path, progress)

    match status:
        ResourceLoader.THREAD_LOAD_IN_PROGRESS:
            pass  # Still loading
        ResourceLoader.THREAD_LOAD_LOADED:
            _on_loaded(ResourceLoader.load_threaded_get(path))
        ResourceLoader.THREAD_LOAD_FAILED:
            push_error("Load failed: %s — check path and resource type" % path)
            _on_load_failed(path)
        ResourceLoader.THREAD_LOAD_INVALID_RESOURCE:
            push_error("Invalid resource: %s — file missing or wrong type_hint" % path)
            _on_load_failed(path)
```

**Common failure causes:**

- Path doesn't exist (typo, not exported)
- Resource type mismatch (e.g., loading a `.tres` as `PackedScene`)
- Circular dependency in loaded scene
- File corrupted in PCK

---

## 8. Platform Caveats — Web, Mobile, Console

### Web (HTML5)

- **No real threads:** `use_sub_threads` is silently ignored. Loading runs on a single background "thread" via browser APIs
- **No `XMLHttpRequest` for `res://`:** Resources must be in the PCK/WASM bundle. You cannot dynamically load from a remote URL using `ResourceLoader`
- **Progress may jump:** Browser fetch APIs don't always report incremental progress

### Mobile (Android/iOS)

- **Storage I/O is slow:** Prefer fewer, larger resources over many small files. Pack textures into atlases
- **Memory pressure:** Monitor `Performance.MEMORY_STATIC` and unload aggressively. Mobile OS can kill your app without warning if memory is too high
- **APK expansion files (Android):** Resources in APK expansion files load normally via `res://`, but initial download is handled by the OS

### Console

- Platform-specific restrictions apply. Consult platform SDK documentation for threading and I/O limits.

---

## 9. C# Equivalents

```csharp
using Godot;

public partial class LoadingScreen : Control
{
    private string _targetPath;

    public void LoadScene(string scenePath)
    {
        _targetPath = scenePath;
        var err = ResourceLoader.LoadThreadedRequest(
            scenePath, "PackedScene", useSubThreads: true
        );
        if (err != Error.Ok)
        {
            GD.PushError($"Failed to start loading: {scenePath}");
            return;
        }
        SetProcess(true);
    }

    public override void _Process(double delta)
    {
        var progress = new Godot.Collections.Array();
        var status = ResourceLoader.LoadThreadedGetStatus(_targetPath, progress);

        switch (status)
        {
            case ResourceLoader.ThreadLoadStatus.InProgress:
                GetNode<ProgressBar>("%ProgressBar").Value =
                    (float)progress[0] * 100.0f;
                break;

            case ResourceLoader.ThreadLoadStatus.Loaded:
                var scene = ResourceLoader.LoadThreadedGet(_targetPath)
                    as PackedScene;
                SetProcess(false);
                GetTree().ChangeSceneToPacked(scene);
                QueueFree();
                break;

            case ResourceLoader.ThreadLoadStatus.Failed:
            case ResourceLoader.ThreadLoadStatus.InvalidResource:
                GD.PushError($"Loading failed: {_targetPath}");
                SetProcess(false);
                break;
        }
    }
}
```

---

## 10. Common Mistakes

**Calling `load_threaded_get()` before status is `LOADED`.**
This blocks the main thread until the resource finishes — defeating the purpose of async loading. Always check status first.

**Forgetting to call `load_threaded_get()` after loading completes.**
The resource stays cached but the internal loading state isn't cleaned up. Always retrieve the resource to finalize the request.

**Using `preload()` for large assets.**
`preload()` adds to startup time and holds a permanent reference. Use `load()` or `ResourceLoader` for anything over ~1 MB that isn't needed immediately.

**Requesting the same path twice.**
`load_threaded_request()` returns `ERR_BUSY` if a request for that path is already in flight. Check with `load_threaded_get_status()` before re-requesting.

**Not testing on target platform.**
Loading times vary dramatically between editor (SSD, uncompressed) and exported builds (compressed PCK, mobile storage). Always profile exported builds.

**Loading too many chunks simultaneously.**
Each threaded request consumes I/O bandwidth. Queue requests and limit concurrent loads to 2–4 for smooth streaming.
