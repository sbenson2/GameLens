# G18 — Performance Profiling & Optimization

> **Category:** Guide · **Engine:** Godot 4.4+ · **Language:** GDScript / C#  
> **Related:** [E1 Architecture Overview](../architecture/E1_architecture_overview.md) · [G16 GDExtension](./G16_gdextension_native_code.md) · [G15 Particle Systems](./G15_particle_systems.md) · [G12 Shaders & Visual Effects](./G12_shaders_and_visual_effects.md)

---

## What This Guide Covers

Performance optimization without profiling is guessing. This guide covers Godot 4.4+'s built-in profiling tools, how to identify CPU, GPU, and memory bottlenecks, and the practical optimization patterns that fix the most common problems in 2D and 3D games.

The structure follows a diagnostic workflow: measure → identify the bottleneck → apply the right fix. Every optimization is paired with the profiling evidence that tells you it's needed, because applying the wrong optimization wastes time and can make code harder to maintain.

---

## Table of Contents

1. [The Profiling Workflow](#1-the-profiling-workflow)
2. [Built-In Profiler (Debugger Panel)](#2-built-in-profiler-debugger-panel)
3. [Performance Monitors](#3-performance-monitors)
4. [Custom Performance Monitors](#4-custom-performance-monitors)
5. [CPU Optimization](#5-cpu-optimization)
6. [GPU Optimization](#6-gpu-optimization)
7. [Memory Optimization](#7-memory-optimization)
8. [Physics Optimization](#8-physics-optimization)
9. [Object Pooling](#9-object-pooling)
10. [Multithreading with WorkerThreadPool](#10-multithreading-with-workerthreadpool)
11. [GDScript-Specific Optimizations](#11-gdscript-specific-optimizations)
12. [Export and Platform Optimization](#12-export-and-platform-optimization)
13. [External Profilers](#13-external-profilers)
14. [Common Mistakes](#14-common-mistakes)
15. [Optimization Checklist](#15-optimization-checklist)

---

## 1. The Profiling Workflow

```
1. REPRODUCE → Get the game into the slow state consistently
2. MEASURE   → Use the profiler to capture frame data
3. IDENTIFY  → Find the function/system consuming the most time
4. DIAGNOSE  → Determine WHY it's slow (algorithm? draw calls? allocations?)
5. FIX       → Apply the smallest change that resolves the bottleneck
6. VERIFY    → Re-measure to confirm improvement (and no regressions)
```

### Are You CPU-Bound or GPU-Bound?

This is the single most important question. Optimizing the wrong side wastes time.

| Symptom | Likely Bound |
|---------|-------------|
| Profiler shows `_process` / `_physics_process` dominating | CPU |
| Lots of draw calls (Monitors → Rendering → Draw Calls) | CPU (driver overhead) |
| Reducing resolution improves FPS | GPU (fill rate) |
| Reducing shader complexity improves FPS | GPU (fragment) |
| Reducing node count improves FPS | CPU (scene tree) |
| Reducing physics bodies improves FPS | CPU (physics) |

---

## 2. Built-In Profiler (Debugger Panel)

Access via **Debugger → Profiler** (bottom panel in the editor) while running the game.

### How to Use

1. Click **Start** to begin recording
2. Play through the slow section
3. Click **Stop** to analyze
4. The profiler shows per-frame timing for every function call

### Reading the Profiler

| Column | Meaning |
|--------|---------|
| **Self** | Time spent in this function only (excludes children) |
| **Total** | Time spent in this function + all functions it calls |
| **Calls** | Number of times this function was called this frame |

**What to look for:**
- Functions with high **Self** time → optimize the function itself
- Functions with high **Total** but low **Self** → one of its children is the bottleneck
- Functions with high **Calls** → consider calling less frequently or batching

### Frame Time Budget

| Target FPS | Budget per Frame |
|------------|-----------------|
| 60 FPS | 16.67ms |
| 30 FPS | 33.33ms |
| 120 FPS | 8.33ms |

If your frame exceeds the budget, the game stutters. The profiler shows exactly which function pushes you over.

---

## 3. Performance Monitors

Access via **Debugger → Monitors** (bottom panel). These are real-time graphs of engine metrics.

### Key Monitors to Watch

| Monitor | What It Tells You | Red Flag |
|---------|-------------------|----------|
| `Time/FPS` | Current frames per second | Below target FPS |
| `Time/Process` | Time in `_process` callbacks | >8ms at 60 FPS |
| `Time/Physics Process` | Time in `_physics_process` | >8ms at 60 FPS |
| `Memory/Static` | Static memory usage | Unexplained growth |
| `Memory/Dynamic` | Dynamic allocations | Constant growth = leak |
| `Object/Objects` | Total Object instances | Unexplained growth |
| `Object/Resources` | Loaded resources | Too high = not freeing |
| `Object/Nodes` | Scene tree node count | >10,000 for 2D is suspect |
| `Rendering/Draw Calls` | GPU draw calls per frame | >500 in 2D, >2000 in 3D |
| `Rendering/Vertices` | Vertex count per frame | Platform-dependent |
| `Physics 2D/Active Objects` | Physics bodies being simulated | >1000 rarely needed |

### Accessing Monitors in Code

```gdscript
## Read any performance monitor programmatically.
func _process(_delta: float) -> void:
    var fps: float = Performance.get_monitor(Performance.TIME_FPS)
    var draw_calls: int = int(Performance.get_monitor(Performance.RENDER_TOTAL_DRAW_CALLS_IN_FRAME))
    var node_count: int = int(Performance.get_monitor(Performance.OBJECT_NODE_COUNT))
    var static_memory: int = int(Performance.get_monitor(Performance.MEMORY_STATIC))

    if fps < 55.0:
        push_warning("FPS drop: %d fps, %d draw calls, %d nodes" % [fps, draw_calls, node_count])
```

---

## 4. Custom Performance Monitors

Godot 4.4+ lets you register your own monitors that appear alongside built-in ones in the Debugger → Monitors panel.

```gdscript
class_name GamePerformanceMonitors
extends Node
## Register custom monitors for game-specific metrics.

var _enemy_count: int = 0
var _bullet_count: int = 0
var _pathfinding_ms: float = 0.0

func _ready() -> void:
    # Register custom monitors
    Performance.add_custom_monitor(
        "game/enemy_count",
        _get_enemy_count
    )
    Performance.add_custom_monitor(
        "game/bullet_count",
        _get_bullet_count
    )
    Performance.add_custom_monitor(
        "game/pathfinding_ms",
        _get_pathfinding_time
    )

func _get_enemy_count() -> int:
    return _enemy_count

func _get_bullet_count() -> int:
    return _bullet_count

func _get_pathfinding_time() -> float:
    return _pathfinding_ms

## Call this from your pathfinding system
func record_pathfinding(time_ms: float) -> void:
    _pathfinding_ms = time_ms

func _exit_tree() -> void:
    # Clean up custom monitors
    Performance.remove_custom_monitor("game/enemy_count")
    Performance.remove_custom_monitor("game/bullet_count")
    Performance.remove_custom_monitor("game/pathfinding_ms")
```

### Micro-Benchmarking in Code

```gdscript
## Measure a specific code section.
func expensive_operation() -> void:
    var start: int = Time.get_ticks_usec()

    # ... the code you want to measure ...

    var elapsed_us: int = Time.get_ticks_usec() - start
    var elapsed_ms: float = elapsed_us / 1000.0
    print("Operation took %.2f ms" % elapsed_ms)
```

---

## 5. CPU Optimization

### Reduce Per-Frame Work

```gdscript
# BAD: Querying every frame for something that rarely changes
func _process(_delta: float) -> void:
    var enemies: Array[Node] = get_tree().get_nodes_in_group("enemies")
    for enemy in enemies:
        if global_position.distance_to(enemy.global_position) < 100:
            _engage(enemy)

# GOOD: Check every N frames or on a timer
var _check_counter: int = 0
const CHECK_INTERVAL: int = 10  # Every 10 frames

func _process(_delta: float) -> void:
    _check_counter += 1
    if _check_counter < CHECK_INTERVAL:
        return
    _check_counter = 0

    var enemies: Array[Node] = get_tree().get_nodes_in_group("enemies")
    for enemy in enemies:
        if global_position.distance_squared_to(enemy.global_position) < 10000:  # 100^2
            _engage(enemy)
```

**Key principle:** `distance_squared_to()` is faster than `distance_to()` because it avoids a square root. Compare against the squared threshold instead.

### Reduce Scene Tree Operations

```gdscript
# BAD: Adding/removing nodes frequently
func spawn_bullet() -> void:
    var bullet: Node2D = bullet_scene.instantiate()
    add_child(bullet)

func _on_bullet_expired(bullet: Node2D) -> void:
    bullet.queue_free()  # Triggers deferred deletion, tree restructure

# GOOD: Use visibility and process toggles instead (see Section 9 for full pooling)
func acquire_bullet() -> Node2D:
    var bullet: Node2D = _pool.pop_back()
    bullet.visible = true
    bullet.set_process(true)
    bullet.set_physics_process(true)
    return bullet

func release_bullet(bullet: Node2D) -> void:
    bullet.visible = false
    bullet.set_process(false)
    bullet.set_physics_process(false)
    _pool.push_back(bullet)
```

### Use `@onready` and Cache References

```gdscript
# BAD: get_node every frame
func _process(_delta: float) -> void:
    var sprite: Sprite2D = get_node("Sprite2D")  # String lookup each frame
    sprite.rotation += 0.1

# GOOD: Cache once at startup
@onready var sprite: Sprite2D = $Sprite2D

func _process(_delta: float) -> void:
    sprite.rotation += 0.1
```

### Disable Processing for Inactive Nodes

```gdscript
## Off-screen enemies don't need _process every frame.
func _on_visibility_changed() -> void:
    set_process(is_visible_in_tree())
    set_physics_process(is_visible_in_tree())
```

---

## 6. GPU Optimization

### Reduce Draw Calls

Each unique material, texture, or blend mode generates a separate draw call. In 2D, Godot batches compatible sprites automatically — but only if they share the same texture atlas and material.

| Technique | Draw Call Reduction |
|-----------|-------------------|
| Texture atlases (combine sprites into one image) | Major |
| Use the same Material on similar sprites | Moderate |
| `CanvasGroup` node (batches children into one draw) | Major |
| Reduce `z_index` variation | Minor |
| Disable `CanvasItem.visible` instead of removing from tree | N/A (avoids rebuilds) |

### Shader Optimization

```glsl
// BAD: Branching in fragment shader (runs per-pixel)
void fragment() {
    if (UV.x > 0.5) {
        COLOR = texture(TEXTURE, UV);
    } else {
        COLOR = vec4(1.0, 0.0, 0.0, 1.0);
    }
}

// GOOD: Use mix/step instead of branching
void fragment() {
    vec4 tex_color = texture(TEXTURE, UV);
    vec4 solid_color = vec4(1.0, 0.0, 0.0, 1.0);
    float mask = step(0.5, UV.x);
    COLOR = mix(solid_color, tex_color, mask);
}
```

### Viewport and Resolution

```gdscript
# For pixel-art games: render at low resolution, scale up
# In Project Settings:
# display/window/size/viewport_width = 320
# display/window/size/viewport_height = 180
# display/window/size/window_width_override = 1280
# display/window/size/window_height_override = 720
# display/window/stretch/mode = "viewport"  (nearest-neighbor scaling)
```

### Particle Budgets

| Platform | Recommended Max Particles |
|----------|--------------------------|
| Desktop | 5,000–10,000 |
| Mobile | 500–2,000 |
| Web | 1,000–3,000 |

Use `GPUParticles2D` for large counts (GPU-driven) and `CPUParticles2D` only when you need per-particle logic.

---

## 7. Memory Optimization

### Monitor for Leaks

```gdscript
## Print resource counts periodically to detect leaks.
func _on_debug_timer_timeout() -> void:
    var object_count: int = int(Performance.get_monitor(Performance.OBJECT_COUNT))
    var resource_count: int = int(Performance.get_monitor(Performance.OBJECT_RESOURCE_COUNT))
    var node_count: int = int(Performance.get_monitor(Performance.OBJECT_NODE_COUNT))
    print("Objects: %d | Resources: %d | Nodes: %d" % [object_count, resource_count, node_count])
```

### Common Leak Patterns

| Pattern | Cause | Fix |
|---------|-------|-----|
| Node count grows over time | `add_child()` without `queue_free()` | Use object pooling or ensure cleanup |
| Resource count grows | Loading resources without releasing references | Use `ResourceLoader` with `cache_mode` |
| Signal connections accumulate | Connecting signals without disconnecting | Disconnect in `_exit_tree()` or use `CONNECT_ONE_SHOT` |
| Circular references | Two RefCounted objects referencing each other | Use `WeakRef` for one direction |

### Texture Memory

```gdscript
## Check VRAM usage
func _log_vram() -> void:
    var vram: int = int(Performance.get_monitor(Performance.RENDER_VIDEO_MEM_USED))
    print("VRAM: %.1f MB" % (vram / 1048576.0))
```

| Texture Format | Size (1024×1024) | Quality | Use Case |
|---------------|------------------|---------|----------|
| RGBA8 (uncompressed) | 4 MB | Perfect | Development |
| ETC2 (mobile) | 1 MB | Good | Android/iOS |
| S3TC/BC (desktop) | 1 MB | Good | Desktop |
| RGBA4444 | 2 MB | Acceptable | Low-memory targets |
| WebP (import) | ~200 KB disk | N/A | Reduces download, same VRAM |

---

## 8. Physics Optimization

### Collision Layer Strategy

```gdscript
# Use collision layers to avoid unnecessary checks.
# Example layer setup:
# Layer 1: Player
# Layer 2: Enemies
# Layer 3: Player projectiles
# Layer 4: Enemy projectiles
# Layer 5: Environment
# Layer 6: Pickups

# A player projectile:
# collision_layer = 3 (it IS on layer 3)
# collision_mask = 2 | 5 (it CHECKS against enemies + environment)
# → Never tested against other projectiles or pickups
```

### Reduce Physics Body Count

```gdscript
# BAD: Each coin is a RigidBody2D
# 200 coins = 200 physics bodies in the simulation

# GOOD: Use Area2D for pickups (detection only, no simulation)
# Or even better: use a single manager that checks distance to player
class_name CoinManager
extends Node2D

var coin_positions: PackedVector2Array
var coin_values: PackedInt32Array

func _physics_process(_delta: float) -> void:
    var player_pos: Vector2 = player.global_position
    var pickup_radius_sq: float = 400.0  # 20^2

    # Iterate backwards so we can remove by index
    for i: int in range(coin_positions.size() - 1, -1, -1):
        if player_pos.distance_squared_to(coin_positions[i]) < pickup_radius_sq:
            _collect(i)

func _collect(index: int) -> void:
    # ... award value ...
    coin_positions.remove_at(index)
    coin_values.remove_at(index)
```

### Physics Tick Rate

```
# Project Settings → Physics → Common → Physics Ticks Per Second
# Default: 60
# Reduce to 30 for games that don't need precise physics (puzzle, strategy)
# Keep at 60 for platformers, action games
# Never go above 60 unless you have a specific reason
```

---

## 9. Object Pooling

Object pooling pre-creates nodes and reuses them instead of instantiating/freeing every frame. Critical for bullets, particles, hit numbers, and any frequently spawned object.

```gdscript
class_name ObjectPool
extends Node
## Generic object pool for any PackedScene.

@export var pooled_scene: PackedScene
@export var initial_size: int = 50
@export var max_size: int = 200

var _available: Array[Node] = []
var _active_count: int = 0

func _ready() -> void:
    _grow(initial_size)

## Get an object from the pool. Returns null if pool is exhausted.
func acquire() -> Node:
    if _available.is_empty():
        if _active_count >= max_size:
            push_warning("ObjectPool: max size reached (%d)" % max_size)
            return null
        _grow(mini(10, max_size - _active_count))  # Grow in batches

    var obj: Node = _available.pop_back()
    obj.visible = true
    obj.set_process(true)
    obj.set_physics_process(true)
    _active_count += 1
    return obj

## Return an object to the pool.
func release(obj: Node) -> void:
    obj.visible = false
    obj.set_process(false)
    obj.set_physics_process(false)

    # Reset transform
    if obj is Node2D:
        (obj as Node2D).position = Vector2.ZERO
        (obj as Node2D).rotation = 0.0

    _available.push_back(obj)
    _active_count -= 1

## Pre-allocate objects.
func _grow(count: int) -> void:
    for i: int in range(count):
        var obj: Node = pooled_scene.instantiate()
        obj.visible = false
        obj.set_process(false)
        obj.set_physics_process(false)
        add_child(obj)
        _available.push_back(obj)
```

### Usage

```gdscript
@onready var bullet_pool: ObjectPool = $BulletPool

func fire() -> void:
    var bullet: Node2D = bullet_pool.acquire() as Node2D
    if bullet == null:
        return  # Pool exhausted
    bullet.global_position = muzzle.global_position
    bullet.rotation = muzzle.global_rotation

# In the bullet script:
func _on_lifetime_expired() -> void:
    # Don't queue_free — return to pool
    var pool: ObjectPool = get_parent() as ObjectPool
    pool.release(self)
```

---

## 10. Multithreading with WorkerThreadPool

Godot 4.4+ provides `WorkerThreadPool`, a managed thread pool that avoids the overhead of creating/destroying threads.

### Safe Threading Rules

1. **Never** access the scene tree from a worker thread
2. **Never** call `add_child()`, `remove_child()`, `queue_free()` from a worker thread
3. Use `call_deferred()` to send results back to the main thread
4. Use `Mutex` to protect shared data structures

### Example: Threaded Pathfinding

```gdscript
class_name ThreadedPathfinder
extends Node
## Runs A* pathfinding off the main thread.

var _mutex: Mutex = Mutex.new()
var _pending_results: Array[Dictionary] = []

func request_path(from: Vector2, to: Vector2, callback: Callable) -> void:
    WorkerThreadPool.add_task(
        func() -> void:
            # This runs on a worker thread — safe to do heavy math
            var nav_map: RID = NavigationServer2D.get_maps()[0]
            var path: PackedVector2Array = NavigationServer2D.map_get_path(
                nav_map, from, to, true
            )

            # Queue result for main thread
            _mutex.lock()
            _pending_results.append({
                "path": path,
                "callback": callback,
            })
            _mutex.unlock()
    )

func _process(_delta: float) -> void:
    # Process results on main thread
    _mutex.lock()
    var results: Array[Dictionary] = _pending_results.duplicate()
    _pending_results.clear()
    _mutex.unlock()

    for result: Dictionary in results:
        result["callback"].call(result["path"])
```

### Example: Threaded Chunk Generation

```gdscript
## Generate world chunks without blocking the main thread.
func generate_chunk_async(chunk_coord: Vector2i) -> void:
    WorkerThreadPool.add_task(
        func() -> void:
            var chunk_data: Dictionary = _generate_chunk_data(chunk_coord)
            # Send result to main thread
            call_deferred("_apply_chunk", chunk_coord, chunk_data)
    )

func _apply_chunk(coord: Vector2i, data: Dictionary) -> void:
    # This runs on the main thread — safe to modify the scene tree
    for tile_pos: Vector2i in data["tiles"]:
        tilemap.set_cell(tile_pos, data["tiles"][tile_pos])
```

---

## 11. GDScript-Specific Optimizations

### Use Typed Variables

```gdscript
# BAD: Untyped — Godot must check types at runtime
var speed = 100.0
var enemies = get_tree().get_nodes_in_group("enemies")

# GOOD: Typed — compiler can optimize access
var speed: float = 100.0
var enemies: Array[Node] = get_tree().get_nodes_in_group("enemies")
```

Typed GDScript is measurably faster in tight loops. The compiler generates more efficient bytecode when it knows the type.

### Use PackedArrays for Large Data

```gdscript
# BAD: Array of Vector2 (each element is a Variant — 20+ bytes overhead)
var positions: Array[Vector2] = []

# GOOD: PackedVector2Array (tightly packed, cache-friendly, 8 bytes per element)
var positions: PackedVector2Array = PackedVector2Array()
```

| Array Type | Per-Element Size | Use Case |
|-----------|-----------------|----------|
| `PackedFloat32Array` | 4 bytes | Height maps, weights |
| `PackedFloat64Array` | 8 bytes | High-precision data |
| `PackedVector2Array` | 8 bytes | 2D positions, UVs |
| `PackedVector3Array` | 12 bytes | 3D positions |
| `PackedInt32Array` | 4 bytes | Tile IDs, indices |
| `PackedByteArray` | 1 byte | Binary data, bitmasks |
| `PackedStringArray` | Varies | Name lists |

### Avoid String Concatenation in Loops

```gdscript
# BAD: Creates a new String every iteration
var log: String = ""
for i: int in range(1000):
    log += "Entry %d\n" % i  # O(n²) — copies entire string each time

# GOOD: Use PackedStringArray and join
var parts: PackedStringArray = PackedStringArray()
parts.resize(1000)
for i: int in range(1000):
    parts[i] = "Entry %d" % i
var log: String = "\n".join(parts)  # O(n) — one allocation
```

### StringName for Frequent Comparisons

```gdscript
# BAD: String comparison (character-by-character)
if action == "jump":
    pass

# GOOD: StringName comparison (pointer comparison — instant)
const ACTION_JUMP: StringName = &"jump"
if action == ACTION_JUMP:
    pass
```

---

## 12. Export and Platform Optimization

### Mobile-Specific Settings

```
# Project Settings for mobile targets:
rendering/renderer/rendering_method = "mobile"     # Simpler renderer
rendering/textures/vram_compression/import_etc2_astc = true
rendering/anti_aliasing/quality/msaa_2d = "Disabled"
physics/common/physics_ticks_per_second = 30        # If acceptable
```

### Web Export Settings

```
# Web exports need smaller download size and limited memory:
rendering/renderer/rendering_method = "mobile"     # WebGL2 compatible
# Use lossy texture compression for smaller .pck
# Reduce audio quality (OGG Vorbis, lower sample rate)
# Avoid GDExtension (no native code in web builds without Emscripten)
```

### Debug vs Release Performance

Debug builds include safety checks, assertions, and profiling hooks. Always benchmark on **release** (or `template_release`) exports — debug can be 2-5x slower.

```bash
# Godot export presets:
# "Debug" → template_debug (includes profiler, assertions)
# "Release" → template_release (optimized, no profiling overhead)
```

---

## 13. External Profilers

For deep analysis beyond Godot's built-in tools:

| Platform | Tool | What It Shows |
|----------|------|--------------|
| Windows | Very Sleepy | CPU function-level sampling |
| Linux | HotSpot (perf frontend) | CPU flame graphs |
| macOS | Xcode Instruments | CPU, GPU, memory, energy |
| Any | Tracy | Frame-level timeline profiler (Godot has native Tracy support in dev builds) |
| Any | RenderDoc | GPU draw call capture and inspection |

### Using Tracy with Godot

Godot 4.4+ supports Tracy integration for detailed frame-level profiling. This requires a custom engine build with Tracy enabled, but provides the most detailed performance data available — function-level timing, lock contention, memory allocation tracking, and GPU timing.

---

## 14. Common Mistakes

### Optimizing Without Profiling
"I think this is slow" is not evidence. Profile first. The bottleneck is almost never where you think it is.

### Premature Optimization
Don't optimize until you have a performance problem. Readable code is easier to optimize later than clever code is to debug.

### Optimizing the Wrong Side
If you're GPU-bound, optimizing GDScript won't help. If you're CPU-bound, reducing texture resolution won't help. Identify the bottleneck first.

### Creating Nodes Every Frame
`instantiate()` + `add_child()` + `queue_free()` every frame is expensive. Use object pooling (Section 9) for anything spawned frequently.

### Too Many `get_node()` Calls
`get_node()` does a string-based tree traversal. Cache the result in `@onready` or `_ready()`.

### Using `_process` When `_physics_process` Suffices
If your logic depends on physics (movement, collision responses), use `_physics_process`. Using `_process` for physics leads to frame-rate-dependent behavior AND duplicate work.

### Forgetting to Disable Processing
Nodes that aren't doing anything still cost CPU time if `_process` or `_physics_process` is defined. Call `set_process(false)` when idle.

---

## 15. Optimization Checklist

Use this as a diagnostic checklist when your game drops below target FPS.

### Quick Wins (< 5 minutes each)

- [ ] Switch distance checks to `distance_squared_to()`
- [ ] Cache `get_node()` results with `@onready`
- [ ] Add type hints to all variables in hot loops
- [ ] Disable `_process` / `_physics_process` on idle nodes
- [ ] Replace `Array` with `PackedArray` for large numeric data

### Medium Effort (30 min – 2 hours)

- [ ] Implement object pooling for frequently spawned objects
- [ ] Reduce collision layers to minimum needed
- [ ] Combine sprite textures into atlases
- [ ] Stagger expensive operations across frames (don't process all enemies on the same frame)
- [ ] Move expensive checks to timers instead of per-frame

### Major Refactors (hours – days)

- [ ] Move performance-critical loops to C# or GDExtension
- [ ] Implement multithreaded pathfinding / generation
- [ ] Switch from individual nodes to a data-driven manager (e.g., 1000 coins → CoinManager with PackedVector2Array)
- [ ] Implement LOD (Level of Detail) for large worlds
- [ ] Implement chunk-based loading for open worlds

### Tuning Reference

| Metric | Healthy (60 FPS) | Warning | Critical |
|--------|------------------|---------|----------|
| Frame time | <16ms | 16–25ms | >25ms |
| Draw calls (2D) | <200 | 200–500 | >500 |
| Draw calls (3D) | <1000 | 1000–2000 | >2000 |
| Node count | <5000 | 5000–10000 | >10000 |
| Physics bodies | <500 | 500–1000 | >1000 |
| GDScript allocations/frame | <100 | 100–500 | >500 |
| VRAM usage | <512MB | 512MB–1GB | >1GB |
