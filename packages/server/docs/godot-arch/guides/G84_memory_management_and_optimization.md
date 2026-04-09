# Memory Management and Optimization

> **Category:** guide · **Engine:** Godot 4.x · **Related:** [G18_performance_profiling](G18_performance_profiling.md), [G39_scalable_architecture_and_pooling](G39_scalable_architecture_and_pooling.md), [G34_threading_and_async](G34_threading_and_async.md), [G61_async_resource_loading](G61_async_resource_loading.md)

Understand and control memory usage in Godot 4.x games — reference counting, manual resource lifecycle, object pooling, texture streaming, and platform-specific budgets. Essential for shipping on memory-constrained platforms (mobile, web, Switch).

---

## How Godot Manages Memory

Godot uses two memory management strategies depending on the object type:

| Type | Strategy | Base class | When freed |
|------|----------|------------|------------|
| **Reference-counted** | Automatic (ref-count) | `RefCounted` | When last reference drops to zero |
| **Manually managed** | Explicit `free()` / `queue_free()` | `Object` (non-RefCounted) | When you call free |
| **Scene tree nodes** | Manual via tree | `Node` | `queue_free()` or parent freed |

### Reference Counting in Detail

`RefCounted` objects (including `Resource`, `Texture2D`, `AudioStream`, etc.) are freed automatically when no variable holds a reference. This is deterministic — not garbage-collected.

```gdscript
## Reference counting example
func _demonstrate_refcount() -> void:
    var tex: Texture2D = load("res://icon.svg")  # refcount = 1
    var tex2: Texture2D = tex                      # refcount = 2
    tex = null                                      # refcount = 1
    # tex2 goes out of scope at function end        # refcount = 0 → freed
```

### The `Object` Leak Trap

Any class extending `Object` directly (not `RefCounted` or `Node`) **must be freed manually**. This is the most common source of memory leaks in Godot.

```gdscript
## LEAK: Object subclass never freed
class MyData extends Object:
    var values: Array = []

func _bad_example() -> void:
    var data := MyData.new()  # Allocated
    # Function returns — data is leaked because Object is not ref-counted
    # Fix: call data.free() before returning, or extend RefCounted instead
```

---

## 1. Monitoring Memory Usage

### GDScript — Memory Statistics

```gdscript
## memory_monitor.gd — Display runtime memory statistics
class_name MemoryMonitor
extends Node

## Print a snapshot of current memory usage to the console.
func print_memory_report() -> void:
    var static_mem: int = OS.get_static_memory_usage()
    var static_peak: int = OS.get_static_memory_peak_usage()

    # Performance singleton provides engine-level counters
    var object_count: int = Performance.get_monitor(
        Performance.OBJECT_COUNT)
    var resource_count: int = Performance.get_monitor(
        Performance.OBJECT_RESOURCE_COUNT)
    var node_count: int = Performance.get_monitor(
        Performance.OBJECT_NODE_COUNT)
    var orphan_count: int = Performance.get_monitor(
        Performance.OBJECT_ORPHAN_NODE_COUNT)

    print("=== Memory Report ===")
    print("Static memory:  %s" % _format_bytes(static_mem))
    print("Peak memory:    %s" % _format_bytes(static_peak))
    print("Objects:        %d" % object_count)
    print("Resources:      %d" % resource_count)
    print("Nodes:          %d" % node_count)
    print("Orphan nodes:   %d" % orphan_count)

    # Orphan nodes > 0 indicates potential leaks
    if orphan_count > 0:
        push_warning("Detected %d orphan nodes — possible memory leak" % orphan_count)

## Format byte count as human-readable string.
static func _format_bytes(bytes: int) -> String:
    if bytes < 1024:
        return "%d B" % bytes
    elif bytes < 1024 * 1024:
        return "%.1f KB" % (bytes / 1024.0)
    elif bytes < 1024 * 1024 * 1024:
        return "%.1f MB" % (bytes / (1024.0 * 1024.0))
    else:
        return "%.2f GB" % (bytes / (1024.0 * 1024.0 * 1024.0))
```

### C# — Memory Monitoring

```csharp
using Godot;

/// <summary>
/// Runtime memory monitoring utility.
/// </summary>
public partial class MemoryMonitor : Node
{
    /// <summary>
    /// Log current memory statistics to the output console.
    /// </summary>
    public void PrintMemoryReport()
    {
        long staticMem = (long)OS.GetStaticMemoryUsage();
        long peakMem = (long)OS.GetStaticMemoryPeakUsage();

        int objectCount = (int)Performance.GetMonitor(
            Performance.Monitor.ObjectCount);
        int resourceCount = (int)Performance.GetMonitor(
            Performance.Monitor.ObjectResourceCount);
        int nodeCount = (int)Performance.GetMonitor(
            Performance.Monitor.ObjectNodeCount);
        int orphanCount = (int)Performance.GetMonitor(
            Performance.Monitor.ObjectOrphanNodeCount);

        GD.Print("=== Memory Report ===");
        GD.Print($"Static memory:  {FormatBytes(staticMem)}");
        GD.Print($"Peak memory:    {FormatBytes(peakMem)}");
        GD.Print($"Objects:        {objectCount}");
        GD.Print($"Resources:      {resourceCount}");
        GD.Print($"Nodes:          {nodeCount}");
        GD.Print($"Orphan nodes:   {orphanCount}");

        if (orphanCount > 0)
            GD.PushWarning($"Detected {orphanCount} orphan nodes");
    }

    private static string FormatBytes(long bytes) => bytes switch
    {
        < 1024 => $"{bytes} B",
        < 1024 * 1024 => $"{bytes / 1024.0:F1} KB",
        < 1024 * 1024 * 1024 => $"{bytes / (1024.0 * 1024.0):F1} MB",
        _ => $"{bytes / (1024.0 * 1024.0 * 1024.0):F2} GB",
    };
}
```

---

## 2. Resource Lifecycle Management

### Preloading vs. Runtime Loading

```gdscript
## PRELOAD: Loaded at script parse time. Fast access, but increases
## initial load time and memory. Use for always-needed resources.
const EXPLOSION_SCENE: PackedScene = preload("res://effects/explosion.tscn")

## LOAD: Loaded on first call. Blocks the thread until complete.
## Godot caches the result — subsequent load() calls return the cache.
func _spawn_enemy() -> void:
    var enemy_scene: PackedScene = load("res://enemies/goblin.tscn")
    var enemy: Node = enemy_scene.instantiate()
    add_child(enemy)

## RESOURCELOADER: Async loading. Does not block. Best for large resources.
func _load_level_async(path: String) -> void:
    ResourceLoader.load_threaded_request(path)
    # Poll until ready (or use a loading screen)
    while ResourceLoader.load_threaded_get_status(path) \
            == ResourceLoader.THREAD_LOAD_IN_PROGRESS:
        await get_tree().process_frame
    var level: PackedScene = ResourceLoader.load_threaded_get(path)
```

### Releasing Cached Resources

Godot's `ResourceCache` holds strong references to loaded resources. To truly free a resource from memory, all references must be dropped:

```gdscript
## resource_unloader.gd — Force-unload resources from cache
class_name ResourceUnloader
extends RefCounted

## Unload a resource by clearing all references.
## This only works if no other code holds a reference.
static func unload(path: String) -> void:
    # Check if the resource is still in the cache
    if ResourceLoader.has_cached(path):
        # Load it to get the reference, then drop it
        # The cache entry survives until refcount hits zero
        var _res: Resource = ResourceLoader.load(path)
        # We cannot force-evict from cache, but we can ensure
        # our reference is the last one. If it is, the resource
        # is freed when _res goes out of scope.
        _res = null

## Unload all resources matching a prefix (e.g., a level's folder).
static func unload_prefix(prefix: String) -> void:
    # ResourceCache doesn't expose an iteration API, so track
    # loaded paths manually in your level manager.
    push_warning("Track loaded resource paths manually for batch unloading")
```

---

## 3. Texture Memory Management

Textures are typically the largest memory consumers. A single 4096×4096 RGBA texture uses 64 MB uncompressed.

### Texture Compression Formats

| Format | Platform | VRAM per pixel | Quality |
|--------|----------|---------------|---------|
| **S3TC/BC** (DXT) | Desktop (Windows/Linux) | 0.5–1 byte | Good |
| **BPTC** (BC7) | Desktop (modern GPU) | 1 byte | Excellent |
| **ETC2** | Mobile (Android/iOS) | 0.5–1 byte | Good |
| **ASTC** | Mobile (modern) | 0.5–1 byte | Excellent |
| **Uncompressed** | All | 4 bytes | Perfect |

### GDScript — Texture Budget Tracker

```gdscript
## texture_budget.gd — Track VRAM usage from textures
class_name TextureBudget
extends Node

## Target VRAM budget in megabytes. Adjust per platform.
@export var budget_mb: float = 256.0

## Estimate VRAM usage of a texture.
## This is an approximation — actual VRAM depends on GPU compression format.
static func estimate_vram_bytes(texture: Texture2D) -> int:
    if texture is CompressedTexture2D:
        var img: Image = texture.get_image()
        if img:
            return img.get_data().size()
    # Fallback: assume 4 bytes per pixel (RGBA8)
    var size: Vector2i = texture.get_size()
    return size.x * size.y * 4

## Get current VRAM usage reported by the rendering server.
static func get_vram_usage_bytes() -> int:
    return RenderingServer.get_rendering_info(
        RenderingServer.RENDERING_INFO_TEXTURE_MEM_USED)

## Check if we are within budget.
func is_within_budget() -> bool:
    var used_mb: float = get_vram_usage_bytes() / (1024.0 * 1024.0)
    return used_mb <= budget_mb

## Print VRAM usage report.
func print_vram_report() -> void:
    var used: int = get_vram_usage_bytes()
    var used_mb: float = used / (1024.0 * 1024.0)
    print("VRAM textures: %.1f MB / %.1f MB budget (%.0f%%)" % [
        used_mb, budget_mb, (used_mb / budget_mb) * 100.0
    ])
```

### Mipmaps and Streaming

```gdscript
## Mipmaps trade ~33% extra memory for dramatically better visual quality
## at distance and improved GPU cache performance. Almost always worth it.
## Enable in Import dock: Mipmaps → Generate = true

## For very large textures (terrain splat maps, world textures), consider
## loading lower mip levels first and upgrading when the player gets close.

## Manual mip level control is available through RenderingServer:
func _set_texture_mip_bias(rid: RID, bias: float) -> void:
    # Positive bias = blurrier (lower mips), negative = sharper (higher mips)
    # Useful for reducing VRAM pressure: set bias = 1.0 for distant objects
    RenderingServer.texture_set_force_redraw_if_visible(rid, true)
```

---

## 4. Node Tree Optimization

### Deferred Freeing

`queue_free()` defers deletion to the end of the current frame, preventing crashes from freeing a node that's still being processed. Always prefer it over `free()` for scene tree nodes.

```gdscript
## Safe pattern: queue_free() during gameplay
func _on_enemy_died() -> void:
    # Play death animation, then free
    var tween: Tween = create_tween()
    tween.tween_property(self, "modulate:a", 0.0, 0.5)
    tween.tween_callback(queue_free)
```

### Orphan Node Detection

Orphan nodes are nodes that exist in memory but are not attached to the scene tree. They consume memory and process time if they have `_process()` defined.

```gdscript
## orphan_detector.gd — Periodic orphan check for development builds
class_name OrphanDetector
extends Node

func _ready() -> void:
    if OS.is_debug_build():
        # Check every 10 seconds during development
        var timer := Timer.new()
        timer.wait_time = 10.0
        timer.timeout.connect(_check_orphans)
        add_child(timer)
        timer.start()

func _check_orphans() -> void:
    var count: int = Performance.get_monitor(
        Performance.OBJECT_ORPHAN_NODE_COUNT)
    if count > 10:  # Threshold — some engine internals create temporary orphans
        push_warning("High orphan node count: %d — check for leaked nodes" % count)
```

---

## 5. Object Pooling

Frequent instantiation/deletion of nodes (bullets, particles, pickups) creates GC pressure and allocation overhead. Pool objects instead.

### GDScript — Generic Object Pool

```gdscript
## object_pool.gd — Reusable object pool for any PackedScene
class_name ObjectPool
extends Node

@export var scene: PackedScene
@export var initial_size: int = 20
@export var max_size: int = 100

var _available: Array[Node] = []
var _in_use: int = 0

func _ready() -> void:
    # Pre-allocate the initial pool
    for i: int in initial_size:
        var instance: Node = scene.instantiate()
        instance.set_process(false)
        instance.set_physics_process(false)
        # Keep pooled objects hidden and out of the tree
        # Adding to tree avoids orphan warnings but costs tree overhead
        instance.visible = false if instance is CanvasItem else true
        _available.append(instance)

## Acquire an object from the pool. Returns null if pool is exhausted.
func acquire() -> Node:
    var instance: Node
    if _available.size() > 0:
        instance = _available.pop_back()
    elif _in_use < max_size:
        # Pool exhausted but under max — create a new one
        instance = scene.instantiate()
    else:
        push_warning("ObjectPool exhausted (max_size=%d)" % max_size)
        return null

    instance.set_process(true)
    instance.set_physics_process(true)
    if instance is CanvasItem or instance is Node3D:
        instance.visible = true
    _in_use += 1
    return instance

## Return an object to the pool for reuse.
func release(instance: Node) -> void:
    if instance == null:
        return
    instance.set_process(false)
    instance.set_physics_process(false)
    if instance is CanvasItem or instance is Node3D:
        instance.visible = false
    # Remove from current parent if any
    if instance.get_parent():
        instance.get_parent().remove_child(instance)
    _available.append(instance)
    _in_use -= 1

## Free all pooled objects. Call on scene transitions.
func clear() -> void:
    for instance: Node in _available:
        instance.queue_free()
    _available.clear()
    _in_use = 0

func get_stats() -> Dictionary:
    return {
        "available": _available.size(),
        "in_use": _in_use,
        "total": _available.size() + _in_use,
        "max": max_size,
    }
```

### C# — Object Pool

```csharp
using Godot;
using System.Collections.Generic;

/// <summary>
/// Generic node pool that pre-allocates instances for reuse.
/// Attach to a manager node and configure via the inspector.
/// </summary>
public partial class ObjectPool : Node
{
    [Export] public PackedScene Scene { get; set; }
    [Export] public int InitialSize { get; set; } = 20;
    [Export] public int MaxSize { get; set; } = 100;

    private readonly Stack<Node> _available = new();
    private int _inUse;

    public override void _Ready()
    {
        for (int i = 0; i < InitialSize; i++)
        {
            var instance = Scene.Instantiate();
            instance.SetProcess(false);
            instance.SetPhysicsProcess(false);
            _available.Push(instance);
        }
    }

    public Node Acquire()
    {
        Node instance;
        if (_available.Count > 0)
        {
            instance = _available.Pop();
        }
        else if (_inUse < MaxSize)
        {
            instance = Scene.Instantiate();
        }
        else
        {
            GD.PushWarning($"ObjectPool exhausted (max={MaxSize})");
            return null;
        }

        instance.SetProcess(true);
        instance.SetPhysicsProcess(true);
        _inUse++;
        return instance;
    }

    public void Release(Node instance)
    {
        if (instance == null) return;
        instance.SetProcess(false);
        instance.SetPhysicsProcess(false);
        instance.GetParent()?.RemoveChild(instance);
        _available.Push(instance);
        _inUse--;
    }

    public void Clear()
    {
        while (_available.Count > 0)
            _available.Pop().QueueFree();
        _inUse = 0;
    }
}
```

---

## 6. Platform Memory Budgets

Targeting specific platforms means respecting hard memory limits:

| Platform | Typical RAM limit | Recommended budget |
|----------|------------------|--------------------|
| **Desktop** | 8–16+ GB | 2–4 GB comfortable |
| **Mobile (low-end)** | 2–3 GB | 400–600 MB total |
| **Mobile (high-end)** | 6–8 GB | 800 MB–1.2 GB |
| **Web (Wasm)** | Browser-dependent | 256–512 MB |
| **Nintendo Switch** | 4 GB (3.2 available) | 2.5–3 GB max |

### GDScript — Platform-Aware Quality Settings

```gdscript
## platform_memory.gd — Adjust quality based on available memory
class_name PlatformMemory
extends Node

enum MemoryTier { LOW, MEDIUM, HIGH }

## Detect the memory tier for the current platform.
static func detect_tier() -> MemoryTier:
    var platform: String = OS.get_name()

    match platform:
        "Web":
            return MemoryTier.LOW
        "Android", "iOS":
            # Use screen size as a rough proxy for device capability
            var screen: Vector2i = DisplayServer.screen_get_size()
            if screen.y < 1080:
                return MemoryTier.LOW
            return MemoryTier.MEDIUM
        _:
            return MemoryTier.HIGH

## Apply quality settings based on memory tier.
static func apply_tier(tier: MemoryTier) -> void:
    match tier:
        MemoryTier.LOW:
            # Reduce texture sizes, disable shadows, limit particles
            ProjectSettings.set_setting(
                "rendering/textures/default_filters/texture_mipmap_bias", 1.0)
            RenderingServer.directional_shadow_atlas_set_size(1024, false)
            print("Memory tier: LOW — reduced quality settings applied")
        MemoryTier.MEDIUM:
            ProjectSettings.set_setting(
                "rendering/textures/default_filters/texture_mipmap_bias", 0.5)
            RenderingServer.directional_shadow_atlas_set_size(2048, false)
            print("Memory tier: MEDIUM")
        MemoryTier.HIGH:
            ProjectSettings.set_setting(
                "rendering/textures/default_filters/texture_mipmap_bias", 0.0)
            RenderingServer.directional_shadow_atlas_set_size(4096, true)
            print("Memory tier: HIGH — full quality")
```

---

## 7. GDScript-Specific Memory Tips

### Variant Size Awareness

Every GDScript `Variant` has a fixed overhead (currently 24 bytes on 64-bit). Small types like `bool` or `int` still consume 24 bytes each when stored as variants.

```gdscript
## For large data sets, prefer PackedArrays over Array[Variant]
## PackedFloat32Array stores floats contiguously — no per-element overhead

# BAD: 1 million Variants = ~24 MB of overhead alone
var bad_data: Array = []
for i: int in 1_000_000:
    bad_data.append(randf())

# GOOD: Packed array = ~4 MB (4 bytes per float, contiguous)
var good_data: PackedFloat32Array = PackedFloat32Array()
good_data.resize(1_000_000)
for i: int in good_data.size():
    good_data[i] = randf()
```

### Dictionary vs Custom Resource

```gdscript
## Dictionaries are flexible but each key-value pair carries Variant overhead.
## For structured data repeated thousands of times, use a Resource subclass.

## Instead of:
var enemy_dict: Dictionary = {
    "hp": 100, "damage": 15, "speed": 2.5, "name": "Goblin"
}

## Prefer:
class_name EnemyData extends Resource
@export var hp: int = 100
@export var damage: int = 15
@export var speed: float = 2.5
@export var enemy_name: String = "Goblin"
## Resources are typed, editor-friendly, and have no per-field Variant boxing
```

---

## 8. Scene Transition Memory Management

Scene transitions are prime opportunities for memory spikes. Load the new scene before unloading the old one, and you double memory usage briefly.

### GDScript — Memory-Safe Scene Transition

```gdscript
## scene_transition.gd — Transition scenes with controlled memory usage
class_name SceneTransition
extends Node

signal transition_started
signal transition_finished

## Transition to a new scene with a loading screen in between.
## The loading screen lets us fully free the old scene before
## allocating the new one, keeping peak memory low.
func transition_to(scene_path: String) -> void:
    transition_started.emit()

    # Step 1: Show loading screen (lightweight — minimal memory)
    var loading_screen: Control = preload(
        "res://ui/loading_screen.tscn").instantiate()
    get_tree().root.add_child(loading_screen)

    # Step 2: Free the current scene entirely
    get_tree().current_scene.queue_free()
    await get_tree().process_frame  # Let queue_free() execute
    await get_tree().process_frame  # Extra frame for cleanup

    # Step 3: Async-load the new scene
    ResourceLoader.load_threaded_request(scene_path)
    while ResourceLoader.load_threaded_get_status(scene_path) \
            == ResourceLoader.THREAD_LOAD_IN_PROGRESS:
        await get_tree().process_frame

    # Step 4: Instantiate and set as current scene
    var new_scene: PackedScene = ResourceLoader.load_threaded_get(scene_path)
    var instance: Node = new_scene.instantiate()
    get_tree().root.add_child(instance)
    get_tree().current_scene = instance

    # Step 5: Remove loading screen
    loading_screen.queue_free()
    transition_finished.emit()
```

---

## Debugging Memory Issues

| Tool | What it shows | When to use |
|------|---------------|-------------|
| **Godot Profiler** (Debugger → Profiler) | Per-frame memory snapshots | General monitoring |
| **Monitors tab** | Object/resource/node counts | Detecting leaks over time |
| **`Performance` singleton** | Programmable access to counters | Automated leak detection |
| **`RenderingServer` info** | VRAM usage breakdown | Texture budget tracking |
| **`OS.get_static_memory_usage()`** | Process memory | Tracking total footprint |
| **Valgrind / AddressSanitizer** | Native memory leaks (C++/GDExtension) | GDExtension debugging |
| **Platform profilers** (Xcode Instruments, Android Studio) | Platform-specific memory | Mobile optimization |

---

## Best Practices

- **Prefer `RefCounted` over `Object`** for data classes. You eliminate an entire category of leak.
- **Use `PackedArray` types** (`PackedFloat32Array`, `PackedVector3Array`, etc.) for large homogeneous collections. They use a fraction of the memory of `Array[Variant]`.
- **Pool frequently spawned nodes**. If something is created and destroyed more than once per second, pool it.
- **Unload resources between levels**. Don't rely on GDScript scope alone — resources cached by `ResourceCache` persist until explicitly dropped.
- **Profile on target hardware**. Desktop memory is forgiving; mobile and web are not. Test memory on the weakest target platform early.
- **Watch orphan node count**. If `Performance.OBJECT_ORPHAN_NODE_COUNT` climbs over time, you have a leak.
- **Use typed arrays**. `Array[Enemy]` prevents accidental mixed-type arrays that waste memory through Variant boxing of every element.

---

## Common Pitfalls

| Pitfall | Solution |
|---------|----------|
| Extending `Object` instead of `RefCounted` | Always extend `RefCounted` for data-only classes |
| Loading large textures at full resolution on mobile | Use import overrides to set max texture size per platform |
| Forgetting to disconnect signals from freed nodes | Use `CONNECT_ONE_SHOT` or disconnect in `_exit_tree()` |
| Preloading resources that are only used in one level | Use `load()` or `ResourceLoader.load_threaded_request()` instead |
| Spawning hundreds of identical particle effects | Use `GPUParticles` with high `amount` rather than many emitter nodes |
| Not calling `queue_free()` on removed UI elements | Track all dynamically-created UI nodes and free them on screen change |
