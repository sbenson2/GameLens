# G24 — Terrain & Open-World Techniques

> **Category:** Guide · **Engine:** Godot 4.4+ · **Language:** GDScript / C#  
> **Related:** [G7 TileMap & Terrain](./G7_tilemap_and_terrain.md) · [G17 Procedural Generation](./G17_procedural_generation.md) · [G18 Performance Profiling](./G18_performance_profiling.md) · [G12 Shaders & Visual Effects](./G12_shaders_and_visual_effects.md) · [G14 Navigation & Pathfinding](./G14_navigation_and_pathfinding.md)

---

## What This Guide Covers

Open-world games push Godot to its limits. Loading an entire world at once is impossible — you need chunk streaming, LOD systems, terrain rendering, and careful memory management. This guide covers 3D terrain creation (built-in and plugin-based), chunk-based world streaming, level-of-detail systems, vegetation and foliage instancing, and the architectural patterns that make large worlds feasible in Godot 4.

**Use this guide when:** you're building a game with large explorable environments — open worlds, survival games, flight simulators, RPGs with seamless outdoor areas.

**Don't use this for:** small contained levels (rooms, arenas, linear platformers). For those, standard scene management is sufficient.

---

## Table of Contents

1. [Architecture of Large Worlds](#1-architecture-of-large-worlds)
2. [Terrain Solutions for Godot 4](#2-terrain-solutions-for-godot-4)
3. [Terrain3D Plugin — Setup and Usage](#3-terrain3d-plugin--setup-and-usage)
4. [HTerrain Plugin — GDScript-Based Alternative](#4-hterrain-plugin--gdscript-based-alternative)
5. [Procedural Terrain with Shaders](#5-procedural-terrain-with-shaders)
6. [Chunk-Based World Streaming](#6-chunk-based-world-streaming)
7. [Level of Detail (LOD)](#7-level-of-detail-lod)
8. [Vegetation and Foliage Instancing](#8-vegetation-and-foliage-instancing)
9. [Navigation in Large Worlds](#9-navigation-in-large-worlds)
10. [Lighting and Environment at Scale](#10-lighting-and-environment-at-scale)
11. [Performance Budgets for Open Worlds](#11-performance-budgets-for-open-worlds)
12. [Common Mistakes](#12-common-mistakes)

---

## 1. Architecture of Large Worlds

### The Core Problem

Godot's scene tree is powerful, but loading thousands of nodes — meshes, physics bodies, AI agents, foliage — into a single scene will tank performance. Open worlds require a **streaming architecture** where only the content near the player is active.

### Key Architectural Concepts

```
┌──────────────────────────────────────────────────┐
│                   World Manager                   │
│  Tracks player position, manages chunk lifecycle  │
├──────────────────────────────────────────────────┤
│  ┌──────────┐  ┌──────────┐  ┌──────────┐       │
│  │ Chunk    │  │ Chunk    │  │ Chunk    │  ...   │
│  │ (-1, 0)  │  │ (0, 0)   │  │ (1, 0)   │       │
│  │ LOADED   │  │ ACTIVE   │  │ LOADED   │       │
│  └──────────┘  └──────────┘  └──────────┘       │
│                                                   │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐       │
│  │ Chunk    │  │ Chunk    │  │ Chunk    │       │
│  │ (-1, -1) │  │ (0, -1)  │  │ (1, -1)  │       │
│  │ UNLOADED │  │ LOADED   │  │ UNLOADED │       │
│  └──────────┘  └──────────┘  └──────────┘       │
├──────────────────────────────────────────────────┤
│  LOD System    │  Object Pooling  │  Async I/O   │
└──────────────────────────────────────────────────┘
```

- **Chunks:** Fixed-size world regions (e.g., 64×64m or 128×128m) that can be loaded/unloaded independently.
- **Streaming radius:** How many chunks around the player remain loaded.
- **LOD:** Distant objects use simpler geometry and textures.
- **Object pooling:** Reuse node instances instead of creating/destroying them.

---

## 2. Terrain Solutions for Godot 4

Godot 4 does **not** have a built-in terrain system. You have several options:

| Solution | Language | Features | Best For |
|----------|----------|----------|----------|
| **Terrain3D** | C++ (GDExtension) | Sculpting, painting, 32 textures, 10 LOD levels, foliage | Production 3D games |
| **HTerrain** | GDScript | Heightmap, splatmap, detail layers | Prototyping, learning |
| **Custom mesh** | GDScript/C++ | Full control, procedural | Procedural worlds, voxel |
| **Blender import** | External | Pre-modeled terrain meshes | Linear/curated worlds |

### Decision Guide

```
Need in-editor sculpting and painting?
├─ YES
│  ├─ Need best performance? → Terrain3D (C++ GDExtension)
│  └─ Need GDScript-only? → HTerrain
└─ NO
   ├─ Procedural world? → Custom mesh generation (§5)
   └─ Hand-crafted levels? → Model in Blender, import as MeshInstance3D
```

---

## 3. Terrain3D Plugin — Setup and Usage

Terrain3D is the most capable terrain solution for Godot 4 — a C++ GDExtension with in-editor sculpting, texture painting, LOD, and foliage instancing.

### Installation

1. Download from the Godot Asset Library (search "Terrain3D") or from the GitHub releases page.
2. Copy the `addons/terrain_3d/` folder into your project.
3. Enable the plugin in **Project Settings > Plugins**.

### Creating Terrain

1. Add a `Terrain3D` node to your scene.
2. Create a new `Terrain3DStorage` resource and assign it.
3. Select the Terrain3D node — the editor toolbar shows sculpting and painting tools.

### Key Properties

| Property | Description | Typical Value |
|----------|-------------|---------------|
| `mesh_lods` | Number of LOD levels | 7–10 |
| `mesh_size` | Mesh resolution per region | 48 (balanced) |
| `region_size` | Region size in units | 256 or 512 |
| `collision_enabled` | Generate physics collision | `true` |

### Terrain Texturing

Terrain3D supports up to 32 texture slots with splatmap-based blending:

1. Open the **Terrain3D** texture list in the inspector.
2. Add texture sets — each set has albedo, normal, and roughness maps.
3. Use the **Paint** tool to blend textures on the terrain surface.
4. Enable **texture detiling** for more natural repetition breaking.

### Heightmap Import

Terrain3D can import heightmaps from external tools:

```
Supported formats:
- RAW 16-bit heightmaps (World Machine, Gaea, World Creator)
- PNG heightmaps (lower precision, 8-bit)
- EXR heightmaps (high precision, 32-bit float)
```

Import via the Terrain3D inspector under **Storage > Import**.

---

## 4. HTerrain Plugin — GDScript-Based Alternative

HTerrain by Zylann is fully implemented in GDScript, making it easy to modify and learn from. It's less performant than Terrain3D but requires no C++ compilation.

### Installation

1. Copy `addons/zylann.hterrain/` into your project's `addons/` folder.
2. Enable in **Project Settings > Plugins**.

### Creating Terrain

1. Add an `HTerrain` node to your scene.
2. In the inspector, set the terrain resolution (power of two + 1, e.g., 513).
3. Use the editor tools to sculpt height and paint textures.

### Key Features

- **Splatmap texturing:** Up to 4 ground textures blended via a splatmap.
- **Detail layers:** Grass and small objects rendered as quads or custom meshes.
- **LOD:** Automatic clipmap-based LOD around the camera.
- **Heightmap export/import:** 16-bit RAW format for interop with external tools.

### Limitations

- Single-camera LOD only (no split-screen or multi-camera support).
- GDScript performance ceiling — large terrains may lag in the editor.
- Less active maintenance compared to Terrain3D.

---

## 5. Procedural Terrain with Shaders

For fully procedural worlds (survival, exploration, infinite runners), generate terrain meshes at runtime.

### Heightmap Generation with Noise

```gdscript
# GDScript — procedural terrain chunk generation
class_name TerrainChunkGenerator
extends Node3D

const CHUNK_SIZE: int = 64
const VERTEX_SPACING: float = 1.0
const HEIGHT_SCALE: float = 20.0

var _noise: FastNoiseLite

func _ready() -> void:
    _noise = FastNoiseLite.new()
    _noise.noise_type = FastNoiseLite.TYPE_SIMPLEX_SMOOTH
    _noise.frequency = 0.01
    _noise.fractal_octaves = 5
    _noise.fractal_lacunarity = 2.0
    _noise.fractal_gain = 0.5

func generate_chunk(chunk_x: int, chunk_z: int) -> MeshInstance3D:
    var st := SurfaceTool.new()
    st.begin(Mesh.PRIMITIVE_TRIANGLES)

    var world_offset := Vector2(
        chunk_x * CHUNK_SIZE * VERTEX_SPACING,
        chunk_z * CHUNK_SIZE * VERTEX_SPACING
    )

    # Generate vertices
    var heights: Array[Array] = []
    for z in range(CHUNK_SIZE + 1):
        var row: Array[float] = []
        for x in range(CHUNK_SIZE + 1):
            var world_x: float = world_offset.x + x * VERTEX_SPACING
            var world_z: float = world_offset.y + z * VERTEX_SPACING
            var height: float = _noise.get_noise_2d(world_x, world_z) * HEIGHT_SCALE
            row.append(height)
        heights.append(row)

    # Generate triangles with normals
    for z in range(CHUNK_SIZE):
        for x in range(CHUNK_SIZE):
            var tl := Vector3(x * VERTEX_SPACING, heights[z][x], z * VERTEX_SPACING)
            var tr := Vector3((x + 1) * VERTEX_SPACING, heights[z][x + 1], z * VERTEX_SPACING)
            var bl := Vector3(x * VERTEX_SPACING, heights[z + 1][x], (z + 1) * VERTEX_SPACING)
            var br := Vector3((x + 1) * VERTEX_SPACING, heights[z + 1][x + 1], (z + 1) * VERTEX_SPACING)

            # Triangle 1: tl, bl, tr
            _add_triangle(st, tl, bl, tr)
            # Triangle 2: tr, bl, br
            _add_triangle(st, tr, bl, br)

    st.generate_normals()
    st.generate_tangents()

    var mesh_instance := MeshInstance3D.new()
    mesh_instance.mesh = st.commit()
    mesh_instance.position = Vector3(world_offset.x, 0, world_offset.y)
    return mesh_instance

func _add_triangle(st: SurfaceTool, a: Vector3, b: Vector3, c: Vector3) -> void:
    st.add_vertex(a)
    st.add_vertex(b)
    st.add_vertex(c)
```

### GPU-Based Terrain Displacement

For large-scale terrain, generate a flat grid mesh and displace vertices in a vertex shader using noise:

```glsl
// Godot Shading Language — terrain vertex displacement
shader_type spatial;

uniform float height_scale : hint_range(0.0, 100.0) = 20.0;
uniform float noise_frequency : hint_range(0.001, 0.1) = 0.01;
uniform sampler2D heightmap : filter_linear, repeat_enable;

void vertex() {
    vec2 uv_world = (MODEL_MATRIX * vec4(VERTEX, 1.0)).xz * noise_frequency;
    float height = texture(heightmap, uv_world).r * height_scale;
    VERTEX.y += height;

    // Recalculate normals from height gradient
    float h_right = texture(heightmap, uv_world + vec2(noise_frequency, 0.0)).r * height_scale;
    float h_up = texture(heightmap, uv_world + vec2(0.0, noise_frequency)).r * height_scale;
    vec3 tangent = normalize(vec3(1.0, h_right - height, 0.0));
    vec3 bitangent = normalize(vec3(0.0, h_up - height, 1.0));
    NORMAL = normalize(cross(bitangent, tangent));
}
```

---

## 6. Chunk-Based World Streaming

### Core Streaming System

```gdscript
# GDScript — chunk-based world streaming manager
class_name WorldStreamer
extends Node3D

## Size of each chunk in world units
@export var chunk_size: float = 128.0
## How many chunks to keep loaded around the player (radius)
@export var load_radius: int = 3
## How many chunks to unload beyond load_radius
@export var unload_radius: int = 5
## Maximum milliseconds per frame to spend on loading
@export var frame_budget_ms: float = 8.0

var _loaded_chunks: Dictionary = {}  # Vector2i → Node3D
var _loading_queue: Array[Vector2i] = []
var _unloading_queue: Array[Vector2i] = []
var _player: Node3D

func _ready() -> void:
    _player = get_tree().get_first_node_in_group("player")

func _process(_delta: float) -> void:
    if not _player:
        return

    var player_chunk := _world_to_chunk(_player.global_position)
    _update_queues(player_chunk)
    _process_loading_queue()
    _process_unloading_queue()

func _world_to_chunk(world_pos: Vector3) -> Vector2i:
    return Vector2i(
        floori(world_pos.x / chunk_size),
        floori(world_pos.z / chunk_size)
    )

func _update_queues(center: Vector2i) -> void:
    # Queue chunks that should be loaded
    for x in range(center.x - load_radius, center.x + load_radius + 1):
        for z in range(center.y - load_radius, center.y + load_radius + 1):
            var coord := Vector2i(x, z)
            if not _loaded_chunks.has(coord) and coord not in _loading_queue:
                _loading_queue.append(coord)

    # Queue chunks that are too far to unload
    for coord: Vector2i in _loaded_chunks.keys():
        var dist: int = maxi(absi(coord.x - center.x), absi(coord.y - center.y))
        if dist > unload_radius and coord not in _unloading_queue:
            _unloading_queue.append(coord)

    # Sort loading queue by distance (closest first)
    _loading_queue.sort_custom(func(a: Vector2i, b: Vector2i) -> bool:
        return a.distance_squared_to(center) < b.distance_squared_to(center)
    )

func _process_loading_queue() -> void:
    var start_time: int = Time.get_ticks_msec()
    while _loading_queue.size() > 0:
        if Time.get_ticks_msec() - start_time > frame_budget_ms:
            break  # Stay within frame budget
        var coord: Vector2i = _loading_queue.pop_front()
        _load_chunk(coord)

func _process_unloading_queue() -> void:
    while _unloading_queue.size() > 0:
        var coord: Vector2i = _unloading_queue.pop_front()
        _unload_chunk(coord)

func _load_chunk(coord: Vector2i) -> void:
    # Load from a scene file or generate procedurally
    var chunk_path := "res://world/chunks/chunk_%d_%d.tscn" % [coord.x, coord.y]
    var chunk_scene: PackedScene = null
    if ResourceLoader.exists(chunk_path):
        chunk_scene = load(chunk_path)
    if chunk_scene:
        var chunk: Node3D = chunk_scene.instantiate()
        chunk.position = Vector3(
            coord.x * chunk_size, 0, coord.y * chunk_size
        )
        add_child(chunk)
        _loaded_chunks[coord] = chunk

func _unload_chunk(coord: Vector2i) -> void:
    if _loaded_chunks.has(coord):
        var chunk: Node3D = _loaded_chunks[coord]
        chunk.queue_free()
        _loaded_chunks.erase(coord)
```

### Async Loading with ResourceLoader

For smoother streaming, use threaded loading:

```gdscript
# GDScript — async chunk loading
var _pending_loads: Dictionary = {}  # Vector2i → String (path)

func _load_chunk_async(coord: Vector2i) -> void:
    var chunk_path := "res://world/chunks/chunk_%d_%d.tscn" % [coord.x, coord.y]
    if ResourceLoader.exists(chunk_path):
        ResourceLoader.load_threaded_request(chunk_path)
        _pending_loads[coord] = chunk_path

func _process_pending_loads() -> void:
    for coord: Vector2i in _pending_loads.keys():
        var path: String = _pending_loads[coord]
        var status: ResourceLoader.ThreadLoadStatus = ResourceLoader.load_threaded_get_status(path)
        if status == ResourceLoader.THREAD_LOAD_LOADED:
            var scene: PackedScene = ResourceLoader.load_threaded_get(path)
            var chunk: Node3D = scene.instantiate()
            chunk.position = Vector3(coord.x * chunk_size, 0, coord.y * chunk_size)
            add_child(chunk)
            _loaded_chunks[coord] = chunk
            _pending_loads.erase(coord)
        elif status == ResourceLoader.THREAD_LOAD_FAILED:
            push_warning("Failed to load chunk at %s" % str(coord))
            _pending_loads.erase(coord)
```

### Content Categories with Different Radii

Large objects (terrain, buildings) should stream at a wider radius than small objects (props, grass):

```gdscript
# Different load radii by content type
const TERRAIN_RADIUS: int = 5    # 5 chunks — always have ground
const STRUCTURE_RADIUS: int = 3  # 3 chunks — buildings, large props
const DETAIL_RADIUS: int = 2     # 2 chunks — grass, rocks, small items
const AI_RADIUS: int = 2         # 2 chunks — NPCs, enemies
```

---

## 7. Level of Detail (LOD)

### Built-In Mesh LOD

Godot 4 supports automatic mesh LOD generation on import:

1. Import a `.glb` or `.gltf` mesh.
2. In the import settings, under **Meshes > LOD**, configure the `lod_bias` and number of generated LODs.
3. Godot generates simplified meshes automatically using mesh decimation.

### Controlling LOD Behavior

```
# Project Settings
rendering/mesh_lod/lod_change/threshold_pixels = 1.0
```

The `threshold_pixels` controls when LODs switch — lower values switch later (higher quality, higher cost).

Per-mesh control:

```gdscript
# GDScript — adjust LOD bias per object
$MeshInstance3D.lod_bias = 2.0  # Switch to lower LOD later (higher quality)
$MeshInstance3D.lod_bias = 0.5  # Switch to lower LOD sooner (better performance)
```

### Manual LOD for Complex Objects

For objects with gameplay implications (e.g., enemies that need animations at one LOD but can be static at another):

```gdscript
# GDScript — manual LOD switching
class_name LODSwitch
extends Node3D

@export var lod_distances: Array[float] = [50.0, 100.0, 200.0]
@export var lod_scenes: Array[PackedScene] = []

var _current_lod: int = -1
var _current_instance: Node3D = null
var _camera: Camera3D

func _ready() -> void:
    _camera = get_viewport().get_camera_3d()

func _process(_delta: float) -> void:
    if not _camera:
        return
    var dist: float = global_position.distance_to(_camera.global_position)
    var target_lod: int = lod_distances.size()  # Beyond all = invisible
    for i in range(lod_distances.size()):
        if dist < lod_distances[i]:
            target_lod = i
            break

    if target_lod != _current_lod:
        _switch_lod(target_lod)

func _switch_lod(lod: int) -> void:
    if _current_instance:
        _current_instance.queue_free()
        _current_instance = null
    _current_lod = lod
    if lod < lod_scenes.size() and lod_scenes[lod]:
        _current_instance = lod_scenes[lod].instantiate()
        add_child(_current_instance)
```

### VisibilityRange (HLOD)

Godot 4 supports `visibility_range_begin` and `visibility_range_end` on `GeometryInstance3D`:

```gdscript
# GDScript — set visibility range
$HighDetailMesh.visibility_range_begin = 0.0
$HighDetailMesh.visibility_range_end = 100.0       # Visible 0-100m
$HighDetailMesh.visibility_range_fade_mode = GeometryInstance3D.VISIBILITY_RANGE_FADE_SELF

$LowDetailMesh.visibility_range_begin = 80.0       # Fade in at 80m (overlaps for smooth transition)
$LowDetailMesh.visibility_range_end = 500.0        # Visible 80-500m
$LowDetailMesh.visibility_range_fade_mode = GeometryInstance3D.VISIBILITY_RANGE_FADE_SELF
```

This is the recommended approach for HLOD (hierarchical LOD) — use overlapping ranges with fade for smooth transitions.

---

## 8. Vegetation and Foliage Instancing

### MultiMeshInstance3D for Foliage

For thousands of grass tufts, bushes, or trees, use `MultiMeshInstance3D`:

```gdscript
# GDScript — scatter foliage over terrain
class_name FoliageScatterer
extends MultiMeshInstance3D

@export var density: float = 0.5  # Instances per square meter
@export var area_size: float = 64.0
@export var height_variation: float = 0.3
@export var scale_range: Vector2 = Vector2(0.8, 1.2)

func scatter(get_height_at: Callable) -> void:
    var count: int = int(area_size * area_size * density)
    multimesh.instance_count = count

    for i in range(count):
        var x: float = randf() * area_size
        var z: float = randf() * area_size
        var y: float = get_height_at.call(x, z)

        var s: float = randf_range(scale_range.x, scale_range.y)
        var rot: float = randf() * TAU

        var xform := Transform3D.IDENTITY
        xform = xform.scaled(Vector3(s, s + randf() * height_variation, s))
        xform = xform.rotated(Vector3.UP, rot)
        xform.origin = Vector3(x, y, z)

        multimesh.set_instance_transform(i, xform)
```

### Performance Tips for Foliage

- **Use billboard mode** for distant grass (faces the camera, much cheaper).
- **Combine with VisibilityRange** — grass only visible within 50–100m.
- **Use GPU particles** for extremely distant grass shimmer.
- **Chunk your MultiMeshes** — one per streaming chunk, so they load/unload with the terrain.

---

## 9. Navigation in Large Worlds

### Regional Navigation Meshes

Don't bake one giant navmesh. Instead, each chunk has its own `NavigationRegion3D`:

```gdscript
# GDScript — per-chunk navigation region
func _load_chunk(coord: Vector2i) -> void:
    var chunk: Node3D = chunk_scene.instantiate()
    add_child(chunk)

    # Each chunk contains its own NavigationRegion3D
    # Godot's NavigationServer merges adjacent regions automatically
    # as long as their edges overlap or connect at shared vertices
```

The `NavigationServer3D` automatically connects adjacent regions when their edges are close enough. Set `NavigationRegion3D.navigation_mesh.agent_radius` consistently across all chunks.

### Navigation Updates on Streaming

When chunks load/unload, the navigation map updates. This can cause brief path recalculations. Mitigate by:
- Keeping AI agents' movement buffers (don't stop immediately when the path invalidates).
- Using a wider navigation load radius than the AI activation radius.
- Requesting new paths via `NavigationAgent3D` after detecting invalidation.

---

## 10. Lighting and Environment at Scale

### Outdoor Lighting Strategy

| Technique | Use Case | Performance |
|-----------|----------|-------------|
| **DirectionalLight3D** | Sun/moon | Cheap, one per scene |
| **Baked lightmaps** | Static structures | Pre-computed, very fast |
| **ReflectionProbe** | Local reflections | Medium, place at key locations |
| **VoxelGI / SDFGI** | Dynamic GI | Expensive, use with Forward+ only |
| **LightmapGI** | Static GI | Baked, cheapest runtime GI |

### Cascaded Shadow Maps

For `DirectionalLight3D`, configure shadow cascades to balance quality and range:

```
# DirectionalLight3D properties
directional_shadow_mode = SHADOW_PARALLEL_4_SPLITS
directional_shadow_max_distance = 200.0  # Shadows up to 200m
directional_shadow_split_1 = 0.1         # First cascade: 0-20m (high detail)
directional_shadow_split_2 = 0.3         # Second cascade: 20-60m
directional_shadow_split_3 = 0.6         # Third cascade: 60-120m
                                          # Fourth cascade: 120-200m (lowest detail)
```

### Day/Night Cycle

```gdscript
# GDScript — basic day/night cycle
class_name DayNightCycle
extends Node3D

@export var day_duration_seconds: float = 600.0  # 10 minutes per day
@export var sun: DirectionalLight3D
@export var environment: WorldEnvironment

var _time_of_day: float = 0.3  # 0.0 = midnight, 0.5 = noon

func _process(delta: float) -> void:
    _time_of_day = fmod(_time_of_day + delta / day_duration_seconds, 1.0)

    # Rotate sun
    var sun_angle: float = (_time_of_day - 0.25) * TAU  # Sunrise at 0.25
    sun.rotation.x = sun_angle

    # Adjust sun energy based on time (dim at horizon)
    var elevation: float = sin(sun_angle)
    sun.light_energy = clampf(elevation * 1.5, 0.0, 1.0)

    # Enable/disable sun shadow near horizon
    sun.shadow_enabled = elevation > 0.05

    # Adjust ambient light for night
    var env: Environment = environment.environment
    if env:
        env.ambient_light_energy = lerpf(0.1, 0.3, clampf(elevation, 0.0, 1.0))
```

---

## 11. Performance Budgets for Open Worlds

### Target Budgets by Platform

| Metric | Desktop (60 FPS) | Console (30 FPS) | Mobile (30 FPS) |
|--------|-----------------|-------------------|------------------|
| Draw calls | < 2000 | < 1000 | < 300 |
| Triangles | < 2M | < 1M | < 200K |
| Loaded chunks | 5×5 to 9×9 | 3×3 to 5×5 | 3×3 |
| Active physics bodies | < 1000 | < 500 | < 200 |
| Active AI agents | < 200 | < 100 | < 30 |
| Texture memory | < 2 GB | < 1 GB | < 256 MB |

### Profiling an Open World

Use Godot's built-in monitors:

```gdscript
# GDScript — runtime performance monitoring
func _process(_delta: float) -> void:
    var fps: float = Engine.get_frames_per_second()
    var objects: int = Performance.get_monitor(Performance.RENDER_TOTAL_OBJECTS_IN_FRAME)
    var draw_calls: int = Performance.get_monitor(Performance.RENDER_TOTAL_DRAW_CALLS_IN_FRAME)
    var physics_bodies: int = Performance.get_monitor(Performance.PHYSICS_3D_ACTIVE_OBJECTS)

    if fps < 30.0:
        push_warning("FPS drop: %d fps, %d objects, %d draws, %d bodies" % [
            fps, objects, draw_calls, physics_bodies
        ])
```

See [G18 Performance Profiling](./G18_performance_profiling.md) for detailed profiling workflows.

---

## 12. Common Mistakes

| Mistake | Why It Fails | Fix |
|---------|-------------|-----|
| Loading entire world at startup | Memory exhaustion, long load times | Use chunk streaming (§6) |
| One giant navmesh for the whole world | Bake time explodes, memory waste | Per-chunk NavigationRegion3D (§9) |
| Foliage as individual MeshInstance3D nodes | Thousands of draw calls | MultiMeshInstance3D (§8) |
| No LOD for distant objects | GPU overload from full-detail meshes at distance | Use mesh LOD and VisibilityRange (§7) |
| Synchronous scene loading | Frame hitches during streaming | ResourceLoader.load_threaded_request (§6) |
| Same shadow quality at all distances | Wasted GPU on distant shadow detail | Cascaded shadow maps with tuned splits (§10) |
| Not budgeting frame time for loading | Stutter when many chunks load at once | Frame budget cap in streaming loop (§6) |
| Using SDFGI/VoxelGI on mobile | Too expensive for mobile GPUs | Use baked lightmaps + ambient light |
| Forgetting to cull AI in unloaded chunks | AI runs physics/navigation with no visible result | Deactivate AI when chunk unloads |

---

## Further Reading

- [G7 TileMap & Terrain](./G7_tilemap_and_terrain.md) — 2D terrain with TileMapLayer
- [G17 Procedural Generation](./G17_procedural_generation.md) — Noise, WFC, and generation algorithms
- [G14 Navigation & Pathfinding](./G14_navigation_and_pathfinding.md) — NavServer fundamentals
- [G18 Performance Profiling](./G18_performance_profiling.md) — Profiling tools and workflows
- [G12 Shaders & Visual Effects](./G12_shaders_and_visual_effects.md) — Terrain shaders and effects
