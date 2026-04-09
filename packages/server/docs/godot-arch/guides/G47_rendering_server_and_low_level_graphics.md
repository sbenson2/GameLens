# G47 — RenderingServer & Low-Level Graphics

> **Category:** Guide · **Engine:** Godot 4.4+ · **Language:** GDScript / C#
> **Related:** [G12 Shaders & Visual Effects](./G12_shaders_and_visual_effects.md) · [G31 Advanced 3D Shaders & Compute](./G31_advanced_3d_shaders_and_compute.md) · [G36 Compositor Effects](./G36_compositor_effects.md) · [G18 Performance Profiling](./G18_performance_profiling.md) · [G39 Scalable Architecture & Pooling](./G39_scalable_architecture_and_pooling.md)

---

## What This Guide Covers

Godot's scene tree is convenient, but every `Node2D`, `Sprite2D`, and `MeshInstance3D` carries overhead — signals, process callbacks, tree notifications, and metadata. For performance-critical scenarios like rendering thousands of bullets, drawing procedural geometry, or building custom 2D renderers, you can bypass the scene tree entirely and talk directly to the **RenderingServer** (and its sibling, **RenderingDevice**).

This guide covers the RenderingServer API for both 2D and 3D rendering, RenderingDevice for compute shaders and custom GPU work, when to use low-level rendering vs. the scene tree, and the patterns that make server-side rendering manageable in production code.

**Use this guide when:** you're hitting performance limits with the scene tree, need to render thousands of identical objects, want to build a custom 2D renderer, or need direct GPU access via compute shaders.

---

## Table of Contents

1. [When to Use RenderingServer](#1-when-to-use-renderingserver)
2. [Core Concepts: RIDs and Server Architecture](#2-core-concepts-rids-and-server-architecture)
3. [2D Rendering with RenderingServer](#3-2d-rendering-with-renderingserver)
4. [3D Rendering with RenderingServer](#4-3d-rendering-with-renderingserver)
5. [Custom Meshes and Procedural Geometry](#5-custom-meshes-and-procedural-geometry)
6. [Materials and Shaders via RenderingServer](#6-materials-and-shaders-via-renderingserver)
7. [MultiMesh for Mass Instancing](#7-multimesh-for-mass-instancing)
8. [RenderingDevice and Compute Shaders](#8-renderingdevice-and-compute-shaders)
9. [Lifecycle and Cleanup](#9-lifecycle-and-cleanup)
10. [C# Equivalents](#10-c-equivalents)
11. [Performance Guidelines](#11-performance-guidelines)
12. [Common Mistakes](#12-common-mistakes)

---

## 1. When to Use RenderingServer

| Scenario | Scene Tree | RenderingServer | Winner |
|----------|-----------|-----------------|--------|
| 50 sprites on screen | Simple, readable | Overkill | Scene tree |
| 10,000 bullets | 10K nodes = lag | Minimal overhead | **RenderingServer** |
| Procedural mesh generation | SurfaceTool or ArrayMesh | Direct buffer upload | **RenderingServer** (for hot paths) |
| Custom 2D draw calls | `_draw()` on CanvasItem | `canvas_item_*` API | **RenderingServer** (if > hundreds) |
| GPU compute (particles, sim) | Not possible | RenderingDevice | **RenderingDevice** |
| Standard game objects | Full lifecycle | Manual everything | Scene tree |

**Rule of thumb:** If you have fewer than ~500 dynamic visual objects, the scene tree is fine. Above that, or for custom rendering pipelines, use the server directly.

---

## 2. Core Concepts: RIDs and Server Architecture

### RIDs (Resource IDs)

Every object in the RenderingServer is identified by an `RID` — an opaque handle. You create objects, get back an RID, and use that RID for all further operations.

```gdscript
var my_canvas_item: RID = RenderingServer.canvas_item_create()
# my_canvas_item is now a handle — not a node, not a resource
```

**RIDs are not garbage-collected.** You must free them manually with `RenderingServer.free_rid(rid)` when done. Forgetting this leaks GPU memory.

### Server Threading Model

The RenderingServer runs on a separate thread. API calls from GDScript are queued and executed on the render thread at the next frame boundary. This means:

- Calls are cheap (just queue a command).
- You won't see visual results until the next frame.
- Multiple calls within one `_process()` are batched efficiently.

---

## 3. 2D Rendering with RenderingServer

### Creating and Drawing a Canvas Item

```gdscript
extends Node2D

var _canvas_item: RID
var _texture: Texture2D

func _ready() -> void:
    _texture = preload("res://icon.svg")

    # Create a canvas item and parent it to this node's canvas item
    _canvas_item = RenderingServer.canvas_item_create()
    RenderingServer.canvas_item_set_parent(_canvas_item, get_canvas_item())

    # Draw a texture onto it
    _draw_item()

func _draw_item() -> void:
    # Clear previous draw commands
    RenderingServer.canvas_item_clear(_canvas_item)

    # Draw the texture at position (100, 50)
    RenderingServer.canvas_item_add_texture_rect(
        _canvas_item,
        Rect2(Vector2(100, 50), _texture.get_size()),
        _texture.get_rid()
    )

func _exit_tree() -> void:
    # CRITICAL: free the RID to prevent GPU memory leak
    RenderingServer.free_rid(_canvas_item)
```

### Drawing Primitives

```gdscript
func draw_custom_shapes(ci: RID) -> void:
    RenderingServer.canvas_item_clear(ci)

    # Rectangle
    RenderingServer.canvas_item_add_rect(ci, Rect2(0, 0, 64, 64), Color.RED)

    # Line
    RenderingServer.canvas_item_add_line(ci, Vector2.ZERO, Vector2(100, 100), Color.WHITE, 2.0)

    # Circle (approximated with polygon)
    var points: PackedVector2Array = []
    var colors: PackedColorArray = []
    for i: int in range(32):
        var angle: float = TAU * i / 32.0
        points.append(Vector2(cos(angle), sin(angle)) * 50.0 + Vector2(200, 200))
        colors.append(Color.BLUE)
    RenderingServer.canvas_item_add_polygon(ci, points, colors)
```

### Transforms

```gdscript
func move_canvas_item(ci: RID, position: Vector2, rotation: float) -> void:
    var xform := Transform2D(rotation, position)
    RenderingServer.canvas_item_set_transform(ci, xform)
```

### Bulk 2D Rendering (Bullet Hell Example)

```gdscript
extends Node2D

const MAX_BULLETS := 10000

var _bullet_items: Array[RID] = []
var _bullet_positions: PackedVector2Array = []
var _bullet_velocities: PackedVector2Array = []
var _texture_rid: RID
var _texture_size: Vector2

func _ready() -> void:
    var tex: Texture2D = preload("res://bullet.png")
    _texture_rid = tex.get_rid()
    _texture_size = tex.get_size()

    var parent_ci := get_canvas_item()
    _bullet_items.resize(MAX_BULLETS)
    _bullet_positions.resize(MAX_BULLETS)
    _bullet_velocities.resize(MAX_BULLETS)

    for i: int in MAX_BULLETS:
        var ci := RenderingServer.canvas_item_create()
        RenderingServer.canvas_item_set_parent(ci, parent_ci)

        # Draw once — the texture stays on the canvas item
        RenderingServer.canvas_item_add_texture_rect(
            ci, Rect2(Vector2.ZERO, _texture_size), _texture_rid
        )
        _bullet_items[i] = ci

        # Initialize with random position and velocity
        _bullet_positions[i] = Vector2(
            randf_range(0, 1920), randf_range(0, 1080)
        )
        _bullet_velocities[i] = Vector2.from_angle(randf() * TAU) * randf_range(100, 400)

func _process(delta: float) -> void:
    var screen := get_viewport_rect().size
    for i: int in MAX_BULLETS:
        _bullet_positions[i] += _bullet_velocities[i] * delta

        # Wrap around screen
        var pos := _bullet_positions[i]
        if pos.x < 0: pos.x += screen.x
        elif pos.x > screen.x: pos.x -= screen.x
        if pos.y < 0: pos.y += screen.y
        elif pos.y > screen.y: pos.y -= screen.y
        _bullet_positions[i] = pos

        # Update transform — this is one cheap server call per bullet
        RenderingServer.canvas_item_set_transform(
            _bullet_items[i], Transform2D(0.0, pos)
        )

func _exit_tree() -> void:
    for ci: RID in _bullet_items:
        RenderingServer.free_rid(ci)
```

---

## 4. 3D Rendering with RenderingServer

In 3D, the hierarchy is: **Scenario** → **Instance** → **Base (Mesh/Light/etc.)**

```gdscript
extends Node3D

var _instance: RID
var _mesh: RID

func _ready() -> void:
    var scenario: RID = get_world_3d().scenario

    # Create a mesh resource on the server
    _mesh = RenderingServer.mesh_create()

    # Create a box mesh via helper (or build arrays manually)
    var arrays := _build_box_arrays(Vector3(1, 1, 1))
    RenderingServer.mesh_add_surface_from_arrays(_mesh, RenderingServer.PRIMITIVE_TRIANGLES, arrays)

    # Create an instance and place it in the world
    _instance = RenderingServer.instance_create()
    RenderingServer.instance_set_base(_instance, _mesh)
    RenderingServer.instance_set_scenario(_instance, scenario)

    # Position the instance
    var xform := Transform3D(Basis(), Vector3(2, 0, -5))
    RenderingServer.instance_set_transform(_instance, xform)

func _build_box_arrays(size: Vector3) -> Array:
    # Use a BoxMesh to generate the arrays, then extract them
    var box := BoxMesh.new()
    box.size = size
    return box.get_mesh_arrays()

func _exit_tree() -> void:
    RenderingServer.free_rid(_instance)
    RenderingServer.free_rid(_mesh)
```

---

## 5. Custom Meshes and Procedural Geometry

For procedural geometry uploaded directly to the RenderingServer:

```gdscript
func create_procedural_mesh(vertices: PackedVector3Array,
                            normals: PackedVector3Array,
                            uvs: PackedVector2Array,
                            indices: PackedInt32Array) -> RID:
    var mesh_rid := RenderingServer.mesh_create()

    var arrays: Array = []
    arrays.resize(Mesh.ARRAY_MAX)
    arrays[Mesh.ARRAY_VERTEX] = vertices
    arrays[Mesh.ARRAY_NORMAL] = normals
    arrays[Mesh.ARRAY_TEX_UV] = uvs
    arrays[Mesh.ARRAY_INDEX] = indices

    RenderingServer.mesh_add_surface_from_arrays(
        mesh_rid, RenderingServer.PRIMITIVE_TRIANGLES, arrays
    )

    return mesh_rid
```

### Updating Mesh Data Every Frame

For dynamic geometry (terrain deformation, fluid surfaces), update the surface data:

```gdscript
func update_mesh_surface(mesh_rid: RID, surface_idx: int, new_arrays: Array) -> void:
    # Remove old surface and add updated one
    RenderingServer.mesh_surface_update_vertex_region(mesh_rid, surface_idx, 0,
        new_arrays[Mesh.ARRAY_VERTEX].to_byte_array())
```

> **Note:** For very frequent updates, consider using a compute shader (Section 8) to update vertex positions on the GPU instead.

---

## 6. Materials and Shaders via RenderingServer

```gdscript
func create_shader_material(shader_code: String) -> RID:
    var shader_rid := RenderingServer.shader_create()
    RenderingServer.shader_set_code(shader_rid, shader_code)

    var material_rid := RenderingServer.material_create()
    RenderingServer.material_set_shader(material_rid, shader_rid)

    return material_rid

func apply_material_to_mesh(mesh_rid: RID, material_rid: RID, surface: int = 0) -> void:
    RenderingServer.mesh_surface_set_material(mesh_rid, surface, material_rid)

# Example: create a simple unshaded red material
func create_red_material() -> RID:
    var code := """
shader_type spatial;
render_mode unshaded;
void fragment() {
    ALBEDO = vec3(1.0, 0.0, 0.0);
}
"""
    return create_shader_material(code)
```

### Setting Shader Parameters

```gdscript
func set_shader_param(material_rid: RID, param_name: StringName, value: Variant) -> void:
    RenderingServer.material_set_param(material_rid, param_name, value)

# Example
set_shader_param(mat_rid, &"speed", 2.5)
set_shader_param(mat_rid, &"tint_color", Color.CYAN)
```

---

## 7. MultiMesh for Mass Instancing

For rendering thousands of identical meshes (grass, trees, debris), `MultiMesh` via the RenderingServer is the fastest approach:

```gdscript
extends Node3D

var _multimesh_rid: RID
var _instance_rid: RID
const INSTANCE_COUNT := 50000

func _ready() -> void:
    var mesh := preload("res://grass_blade.tres")

    # Create MultiMesh on the server
    _multimesh_rid = RenderingServer.multimesh_create()
    RenderingServer.multimesh_set_mesh(_multimesh_rid, mesh.get_rid())
    RenderingServer.multimesh_allocate_data(
        _multimesh_rid, INSTANCE_COUNT,
        RenderingServer.MULTIMESH_TRANSFORM_3D,
        true  # use_colors
    )

    # Set transforms and colors for all instances
    for i: int in INSTANCE_COUNT:
        var xform := Transform3D(
            Basis().rotated(Vector3.UP, randf() * TAU),
            Vector3(randf_range(-100, 100), 0, randf_range(-100, 100))
        )
        RenderingServer.multimesh_instance_set_transform(_multimesh_rid, i, xform)
        RenderingServer.multimesh_instance_set_color(_multimesh_rid, i,
            Color(randf_range(0.3, 0.7), randf_range(0.5, 1.0), randf_range(0.1, 0.4))
        )

    # Create a visual instance and attach the multimesh
    _instance_rid = RenderingServer.instance_create()
    RenderingServer.instance_set_base(_instance_rid, _multimesh_rid)
    RenderingServer.instance_set_scenario(_instance_rid, get_world_3d().scenario)

func _exit_tree() -> void:
    RenderingServer.free_rid(_instance_rid)
    RenderingServer.free_rid(_multimesh_rid)
```

### Bulk Transform Updates

For large instance counts, use `multimesh_set_buffer()` to upload all transforms in one call:

```gdscript
func update_all_transforms(transforms: Array[Transform3D]) -> void:
    var buffer := PackedFloat32Array()
    buffer.resize(transforms.size() * 12)  # 12 floats per 3D transform
    for i: int in transforms.size():
        var t := transforms[i]
        var offset := i * 12
        # Row-major: basis columns then origin
        buffer[offset + 0] = t.basis.x.x
        buffer[offset + 1] = t.basis.y.x
        buffer[offset + 2] = t.basis.z.x
        buffer[offset + 3] = t.origin.x
        buffer[offset + 4] = t.basis.x.y
        buffer[offset + 5] = t.basis.y.y
        buffer[offset + 6] = t.basis.z.y
        buffer[offset + 7] = t.origin.y
        buffer[offset + 8] = t.basis.x.z
        buffer[offset + 9] = t.basis.y.z
        buffer[offset + 10] = t.basis.z.z
        buffer[offset + 11] = t.origin.z
    RenderingServer.multimesh_set_buffer(_multimesh_rid, buffer)
```

---

## 8. RenderingDevice and Compute Shaders

The `RenderingDevice` provides low-level GPU access for compute shaders. This is available only with the **Forward+** and **Mobile** renderers (not Compatibility/OpenGL).

### Basic Compute Shader Workflow

```gdscript
extends Node

func _ready() -> void:
    # Get the rendering device
    var rd := RenderingServer.get_rendering_device()
    if not rd:
        push_error("RenderingDevice not available — requires Forward+ or Mobile renderer")
        return

    # Load and compile the compute shader
    var shader_file := load("res://compute_example.glsl")
    var shader_spirv := shader_file.get_spirv()
    var shader := rd.shader_create_from_spirv(shader_spirv)

    # Prepare input data
    var input := PackedFloat32Array([1.0, 2.0, 3.0, 4.0, 5.0, 6.0, 7.0, 8.0])
    var input_bytes := input.to_byte_array()

    # Create a storage buffer
    var buffer := rd.storage_buffer_create(input_bytes.size(), input_bytes)

    # Create a uniform set
    var uniform := RDUniform.new()
    uniform.uniform_type = RenderingDevice.UNIFORM_TYPE_STORAGE_BUFFER
    uniform.binding = 0
    uniform.add_id(buffer)
    var uniform_set := rd.uniform_set_create([uniform], shader, 0)

    # Create and dispatch the compute pipeline
    var pipeline := rd.compute_pipeline_create(shader)
    var compute_list := rd.compute_list_begin()
    rd.compute_list_bind_compute_pipeline(compute_list, pipeline)
    rd.compute_list_bind_uniform_set(compute_list, uniform_set, 0)
    rd.compute_list_dispatch(compute_list, 1, 1, 1)  # 1 workgroup
    rd.compute_list_end()

    # Submit and wait for GPU to finish
    rd.submit()
    rd.sync()

    # Read back results
    var output_bytes := rd.buffer_get_data(buffer)
    var output := output_bytes.to_float32_array()
    print("Result: ", output)  # Values doubled by shader

    # Cleanup
    rd.free_rid(pipeline)
    rd.free_rid(uniform_set)
    rd.free_rid(buffer)
    rd.free_rid(shader)
```

### The Compute Shader (GLSL)

Save as `compute_example.glsl` with `.glsl` import type set to "Compute":

```glsl
#[compute]
#version 450

layout(local_size_x = 8, local_size_y = 1, local_size_z = 1) in;

layout(set = 0, binding = 0, std430) restrict buffer DataBuffer {
    float data[];
} buf;

void main() {
    uint idx = gl_GlobalInvocationID.x;
    if (idx < buf.data.length()) {
        buf.data[idx] *= 2.0;
    }
}
```

### Compute Shader Use Cases

- **GPU particle simulation** — Update thousands of particle positions on the GPU.
- **Terrain generation** — Generate heightmaps or erosion simulations.
- **Pathfinding** — Flow field computation for large AI groups.
- **Image processing** — Blur, edge detection, or procedural textures.

---

## 9. Lifecycle and Cleanup

**Every `*_create()` call requires a matching `free_rid()` call.** Wrap server objects in a class to make this manageable:

```gdscript
class ServerObject:
    var rids: Array[RID] = []

    func track(rid: RID) -> RID:
        rids.append(rid)
        return rid

    func free_all() -> void:
        for rid: RID in rids:
            if rid.is_valid():
                RenderingServer.free_rid(rid)
        rids.clear()

# Usage
var _server := ServerObject.new()

func _ready() -> void:
    var ci := _server.track(RenderingServer.canvas_item_create())
    # ... use ci ...

func _exit_tree() -> void:
    _server.free_all()
```

---

## 10. C# Equivalents

```csharp
using Godot;

public partial class BulletRenderer : Node2D
{
    private Rid[] _items;
    private const int Count = 10000;

    public override void _Ready()
    {
        _items = new Rid[Count];
        var parentCi = GetCanvasItem();
        var tex = GD.Load<Texture2D>("res://bullet.png");
        var texRid = tex.GetRid();
        var texSize = tex.GetSize();

        for (int i = 0; i < Count; i++)
        {
            var ci = RenderingServer.CanvasItemCreate();
            RenderingServer.CanvasItemSetParent(ci, parentCi);
            RenderingServer.CanvasItemAddTextureRect(ci,
                new Rect2(Vector2.Zero, texSize), texRid);
            _items[i] = ci;
        }
    }

    public override void _ExitTree()
    {
        foreach (var ci in _items)
            RenderingServer.FreeRid(ci);
    }
}
```

---

## 11. Performance Guidelines

1. **Batch your calls.** All RenderingServer calls within one `_process()` are batched automatically. Don't try to "flush" manually.
2. **Prefer MultiMesh over individual instances.** For identical meshes, MultiMesh is orders of magnitude faster than creating separate instances.
3. **Use `multimesh_set_buffer()`** for bulk updates instead of per-instance `multimesh_instance_set_transform()` calls.
4. **Profile with the Godot profiler.** Monitor "Rendering" time in the debugger's Profiler tab. If RenderingServer calls dominate, you may need to reduce draw calls rather than optimize the server calls themselves.
5. **Keep RID cleanup on `_exit_tree()`**, not `_notification(NOTIFICATION_PREDELETE)` — the latter fires too late and may crash.
6. **Canvas item draw order** is controlled by `canvas_item_set_draw_index()` — don't rely on creation order.

---

## 12. Common Mistakes

1. **Forgetting to free RIDs** — Every `*_create()` needs a `free_rid()`. Unlike nodes, RIDs are never garbage collected.
2. **Not setting a parent or scenario** — A canvas item without a parent or an instance without a scenario is invisible. This is the #1 "why is nothing showing up?" issue.
3. **Using RenderingServer for small scenes** — If you have 20 sprites, the scene tree is simpler and fast enough. Don't over-optimize.
4. **Expecting immediate results** — Server calls are queued. If you create an item and immediately try to query its bounds, you'll get stale data.
5. **Using RenderingDevice with the Compatibility renderer** — Compute shaders require the Forward+ or Mobile renderer. Check `RenderingServer.get_rendering_device() != null` before attempting GPU compute.
6. **Mixing up coordinate systems** — RenderingServer uses the same coordinate system as the scene tree (Y-down for 2D, Y-up for 3D), but transforms are applied differently when there's no parent node chain.
