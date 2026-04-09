# G62 — Procedural Mesh Generation

> **Category:** Guide · **Engine:** Godot 4.4+ · **Language:** GDScript / C#
> **Related:** [G17 Procedural Generation](./G17_procedural_generation.md) · [G12 Shaders & Visual Effects](./G12_shaders_and_visual_effects.md) · [G5 Physics & Collision](./G5_physics_and_collision.md) · [G24 Terrain & Open World](./G24_terrain_and_open_world.md)

---

## What This Guide Covers

Sometimes you need geometry that doesn't exist as a file — terrain generated from noise, trails behind a moving object, slicing a mesh at runtime, or debug visualizations. Godot provides four tools for creating and manipulating meshes from code: `ArrayMesh` (low-level), `SurfaceTool` (builder-pattern helper), `MeshDataTool` (read/modify existing meshes), and `ImmediateMesh` (draw-and-forget for debug lines).

This guide covers when to use each tool, vertex data layout, building common procedural shapes, generating collision from procedural meshes, performance considerations, and practical patterns like terrain chunks, trails, and runtime mesh modification.

**Use procedural meshes when:** generating terrain from heightmaps/noise, creating trails or ribbons, building geometry from player actions (voxels, destruction), runtime LOD, or debug visualization.

**Use imported meshes when:** the shape is static and authored in Blender/Maya — procedural generation adds complexity with no benefit for pre-made assets.

---

## Table of Contents

1. [The Four Mesh Tools](#1-the-four-mesh-tools)
2. [Vertex Data Fundamentals](#2-vertex-data-fundamentals)
3. [SurfaceTool — The Builder Pattern](#3-surfacetool--the-builder-pattern)
4. [ArrayMesh — Maximum Control](#4-arraymesh--maximum-control)
5. [MeshDataTool — Modify Existing Meshes](#5-meshdatatool--modify-existing-meshes)
6. [ImmediateMesh — Debug Visualization](#6-immediatemesh--debug-visualization)
7. [Generating Collision Shapes](#7-generating-collision-shapes)
8. [Practical Patterns](#8-practical-patterns)
9. [Performance Guidelines](#9-performance-guidelines)
10. [C# Equivalents](#10-c-equivalents)
11. [Common Mistakes](#11-common-mistakes)

---

## 1. The Four Mesh Tools

| Tool | Strength | Weakness | Best for |
|------|----------|----------|----------|
| **SurfaceTool** | Clean builder API, auto-generates normals/tangents | Slower than raw arrays for huge meshes | Most procedural generation |
| **ArrayMesh** | Fastest creation, direct array access | Verbose setup, manual normal calculation | Performance-critical generation |
| **MeshDataTool** | Read/modify faces, edges, vertices of existing meshes | Slow — copies entire mesh to/from arrays | Runtime mesh deformation, analysis |
| **ImmediateMesh** | Instant draw, no setup | Rebuilt every frame, no persistence | Debug lines, gizmos, prototyping |

**Decision rule:** Start with `SurfaceTool`. Move to `ArrayMesh` if profiling shows it's a bottleneck. Use `MeshDataTool` only when you need to read/modify an existing mesh's topology. Use `ImmediateMesh` for throwaway debug visuals.

---

## 2. Vertex Data Fundamentals

Every mesh surface is a collection of vertex attributes:

| Attribute | Type | Required | Purpose |
|-----------|------|----------|---------|
| `VERTEX` | `Vector3` | Yes | Position in local space |
| `NORMAL` | `Vector3` | For lighting | Direction the surface faces |
| `TANGENT` | `Plane` | For normal maps | Surface tangent + binormal sign |
| `UV` | `Vector2` | For texturing | Texture coordinates |
| `UV2` | `Vector2` | For lightmaps | Secondary UV channel |
| `COLOR` | `Color` | Optional | Per-vertex color |
| `BONES` | `PackedInt32Array` | For skinning | Bone indices |
| `WEIGHTS` | `PackedFloat32Array` | For skinning | Bone weights |

**Winding order:** Godot uses counter-clockwise winding for front faces (same as OpenGL). If your triangles are invisible, you likely have the winding reversed.

**Index arrays:** Optional but recommended for meshes with shared vertices. Without indices, every triangle needs 3 unique vertices (no sharing). With indices, you define vertices once and reference them by index — saves memory and improves cache performance.

---

## 3. SurfaceTool — The Builder Pattern

`SurfaceTool` uses an OpenGL 1.x immediate-mode style: set attributes, then add the vertex. Attributes apply to the *next* vertex added.

### Basic quad

```gdscript
func _create_quad() -> ArrayMesh:
    var st := SurfaceTool.new()
    st.begin(Mesh.PRIMITIVE_TRIANGLES)

    # Set material
    var mat := StandardMaterial3D.new()
    mat.albedo_color = Color.CORNFLOWER_BLUE
    st.set_material(mat)

    # Vertex order: set attributes BEFORE calling add_vertex()
    # Triangle 1
    st.set_normal(Vector3.UP)
    st.set_uv(Vector2(0, 0))
    st.add_vertex(Vector3(-1, 0, -1))

    st.set_uv(Vector2(1, 0))
    st.add_vertex(Vector3(1, 0, -1))

    st.set_uv(Vector2(1, 1))
    st.add_vertex(Vector3(1, 0, 1))

    # Triangle 2
    st.set_uv(Vector2(0, 0))
    st.add_vertex(Vector3(-1, 0, -1))

    st.set_uv(Vector2(1, 1))
    st.add_vertex(Vector3(1, 0, 1))

    st.set_uv(Vector2(0, 1))
    st.add_vertex(Vector3(-1, 0, 1))

    return st.commit()
```

### Using indices (shared vertices)

```gdscript
func _create_quad_indexed() -> ArrayMesh:
    var st := SurfaceTool.new()
    st.begin(Mesh.PRIMITIVE_TRIANGLES)

    st.set_normal(Vector3.UP)

    # Define 4 unique vertices
    st.set_uv(Vector2(0, 0))
    st.add_vertex(Vector3(-1, 0, -1))  # 0

    st.set_uv(Vector2(1, 0))
    st.add_vertex(Vector3(1, 0, -1))   # 1

    st.set_uv(Vector2(1, 1))
    st.add_vertex(Vector3(1, 0, 1))    # 2

    st.set_uv(Vector2(0, 1))
    st.add_vertex(Vector3(-1, 0, 1))   # 3

    # Define triangles via indices
    st.add_index(0)
    st.add_index(1)
    st.add_index(2)

    st.add_index(0)
    st.add_index(2)
    st.add_index(3)

    return st.commit()
```

### Auto-generating normals and tangents

```gdscript
# After adding all vertices:
st.generate_normals()   # Calculates smooth normals from face geometry
st.generate_tangents()  # Required for normal-mapped materials
var mesh := st.commit()
```

`generate_normals()` computes smooth normals by averaging adjacent face normals. For flat shading, don't share vertices between faces (don't use indices, or duplicate vertices at hard edges).

---

## 4. ArrayMesh — Maximum Control

`ArrayMesh` lets you provide raw arrays directly — no per-vertex function calls, so it's faster for large meshes.

### Heightmap terrain chunk

```gdscript
func _generate_terrain(width: int, depth: int, scale: float) -> ArrayMesh:
    var vertices := PackedVector3Array()
    var normals := PackedVector3Array()
    var uvs := PackedVector2Array()
    var indices := PackedInt32Array()

    var noise := FastNoiseLite.new()
    noise.noise_type = FastNoiseLite.TYPE_SIMPLEX_SMOOTH
    noise.frequency = 0.02

    # Generate vertex grid
    for z in range(depth + 1):
        for x in range(width + 1):
            var height := noise.get_noise_2d(x * scale, z * scale) * 10.0
            vertices.append(Vector3(x * scale, height, z * scale))
            uvs.append(Vector2(float(x) / width, float(z) / depth))
            normals.append(Vector3.UP)  # Placeholder — recalculate below

    # Generate triangle indices
    for z in range(depth):
        for x in range(width):
            var top_left := z * (width + 1) + x
            var top_right := top_left + 1
            var bottom_left := (z + 1) * (width + 1) + x
            var bottom_right := bottom_left + 1

            # Triangle 1
            indices.append(top_left)
            indices.append(bottom_left)
            indices.append(top_right)

            # Triangle 2
            indices.append(top_right)
            indices.append(bottom_left)
            indices.append(bottom_right)

    # Recalculate normals from geometry
    normals = _calculate_normals(vertices, indices)

    # Build the mesh
    var arrays := []
    arrays.resize(Mesh.ARRAY_MAX)
    arrays[Mesh.ARRAY_VERTEX] = vertices
    arrays[Mesh.ARRAY_NORMAL] = normals
    arrays[Mesh.ARRAY_TEX_UV] = uvs
    arrays[Mesh.ARRAY_INDEX] = indices

    var mesh := ArrayMesh.new()
    mesh.add_surface_from_arrays(Mesh.PRIMITIVE_TRIANGLES, arrays)
    return mesh

func _calculate_normals(
    verts: PackedVector3Array, idxs: PackedInt32Array
) -> PackedVector3Array:
    var norms := PackedVector3Array()
    norms.resize(verts.size())

    # Accumulate face normals per vertex
    for i in range(0, idxs.size(), 3):
        var a := verts[idxs[i]]
        var b := verts[idxs[i + 1]]
        var c := verts[idxs[i + 2]]
        var face_normal := (b - a).cross(c - a).normalized()

        norms[idxs[i]] += face_normal
        norms[idxs[i + 1]] += face_normal
        norms[idxs[i + 2]] += face_normal

    # Normalize accumulated normals
    for i in range(norms.size()):
        norms[i] = norms[i].normalized()

    return norms
```

---

## 5. MeshDataTool — Modify Existing Meshes

`MeshDataTool` creates an editable copy of a mesh surface. Use it when you need to read or modify topology (edges, faces, adjacency) of an existing mesh.

### Runtime mesh deformation

```gdscript
# Deform a sphere along a noise field
func deform_mesh(mesh_instance: MeshInstance3D) -> void:
    var mdt := MeshDataTool.new()
    mdt.create_from_surface(mesh_instance.mesh, 0)  # Surface index 0

    var noise := FastNoiseLite.new()
    noise.frequency = 0.5

    for i in range(mdt.get_vertex_count()):
        var vertex := mdt.get_vertex(i)
        var normal := mdt.get_vertex_normal(i)

        # Displace along normal by noise value
        var displacement := noise.get_noise_3dv(vertex) * 0.5
        mdt.set_vertex(i, vertex + normal * displacement)

    # Commit changes back to the mesh
    mesh_instance.mesh.clear_surfaces()
    mdt.commit_to_surface(mesh_instance.mesh)
```

### Querying mesh topology

```gdscript
# MeshDataTool gives you face/edge info that other tools don't
var mdt := MeshDataTool.new()
mdt.create_from_surface(some_mesh, 0)

# Iterate faces
for face_idx in range(mdt.get_face_count()):
    var v0 := mdt.get_face_vertex(face_idx, 0)
    var v1 := mdt.get_face_vertex(face_idx, 1)
    var v2 := mdt.get_face_vertex(face_idx, 2)
    var face_normal := mdt.get_face_normal(face_idx)

# Get edges connected to a vertex
var edges := mdt.get_vertex_edges(vertex_idx)

# Get faces connected to a vertex
var faces := mdt.get_vertex_faces(vertex_idx)
```

**Performance warning:** `MeshDataTool` copies the entire mesh into CPU-side arrays. For a 10K-vertex mesh this is fine; for 100K+ vertices, consider modifying `ArrayMesh` arrays directly.

---

## 6. ImmediateMesh — Debug Visualization

`ImmediateMesh` draws geometry that exists only for the current frame. Ideal for debug lines, rays, and shapes.

```gdscript
# debug_draw.gd — attach to a MeshInstance3D
extends MeshInstance3D

func _ready() -> void:
    mesh = ImmediateMesh.new()
    # Unshaded material so debug lines are always visible
    var mat := StandardMaterial3D.new()
    mat.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
    mat.albedo_color = Color.RED
    mat.no_depth_test = true  # Draw on top of everything
    material_override = mat

func _process(_delta: float) -> void:
    var im := mesh as ImmediateMesh
    im.clear_surfaces()

    # Draw a line from origin to target
    im.surface_begin(Mesh.PRIMITIVE_LINES)
    im.surface_add_vertex(Vector3.ZERO)
    im.surface_add_vertex(Vector3(5, 2, -3))
    im.surface_end()

    # Draw a wireframe box
    _draw_wire_box(im, Vector3(-1, -1, -1), Vector3(1, 1, 1))

func _draw_wire_box(im: ImmediateMesh, min_pt: Vector3, max_pt: Vector3) -> void:
    im.surface_begin(Mesh.PRIMITIVE_LINES)

    # Bottom face
    im.surface_add_vertex(Vector3(min_pt.x, min_pt.y, min_pt.z))
    im.surface_add_vertex(Vector3(max_pt.x, min_pt.y, min_pt.z))
    im.surface_add_vertex(Vector3(max_pt.x, min_pt.y, min_pt.z))
    im.surface_add_vertex(Vector3(max_pt.x, min_pt.y, max_pt.z))
    im.surface_add_vertex(Vector3(max_pt.x, min_pt.y, max_pt.z))
    im.surface_add_vertex(Vector3(min_pt.x, min_pt.y, max_pt.z))
    im.surface_add_vertex(Vector3(min_pt.x, min_pt.y, max_pt.z))
    im.surface_add_vertex(Vector3(min_pt.x, min_pt.y, min_pt.z))

    # Top face
    im.surface_add_vertex(Vector3(min_pt.x, max_pt.y, min_pt.z))
    im.surface_add_vertex(Vector3(max_pt.x, max_pt.y, min_pt.z))
    im.surface_add_vertex(Vector3(max_pt.x, max_pt.y, min_pt.z))
    im.surface_add_vertex(Vector3(max_pt.x, max_pt.y, max_pt.z))
    im.surface_add_vertex(Vector3(max_pt.x, max_pt.y, max_pt.z))
    im.surface_add_vertex(Vector3(min_pt.x, max_pt.y, max_pt.z))
    im.surface_add_vertex(Vector3(min_pt.x, max_pt.y, max_pt.z))
    im.surface_add_vertex(Vector3(min_pt.x, max_pt.y, min_pt.z))

    # Vertical edges
    im.surface_add_vertex(Vector3(min_pt.x, min_pt.y, min_pt.z))
    im.surface_add_vertex(Vector3(min_pt.x, max_pt.y, min_pt.z))
    im.surface_add_vertex(Vector3(max_pt.x, min_pt.y, min_pt.z))
    im.surface_add_vertex(Vector3(max_pt.x, max_pt.y, min_pt.z))
    im.surface_add_vertex(Vector3(max_pt.x, min_pt.y, max_pt.z))
    im.surface_add_vertex(Vector3(max_pt.x, max_pt.y, max_pt.z))
    im.surface_add_vertex(Vector3(min_pt.x, min_pt.y, max_pt.z))
    im.surface_add_vertex(Vector3(min_pt.x, max_pt.y, max_pt.z))

    im.surface_end()
```

---

## 7. Generating Collision Shapes

Procedural meshes don't automatically have collision. You need to generate it:

### From mesh geometry

```gdscript
# Create trimesh (concave) collision — accurate but static only
func add_collision_from_mesh(mesh_instance: MeshInstance3D) -> void:
    var body := StaticBody3D.new()
    var shape := ConcavePolygonShape3D.new()
    shape.set_faces(mesh_instance.mesh.get_faces())
    var col := CollisionShape3D.new()
    col.shape = shape
    body.add_child(col)
    mesh_instance.add_child(body)
```

### Simplified collision for terrain

```gdscript
# Create a heightmap collision shape (much faster than trimesh for terrain)
func create_heightmap_collision(
    heights: PackedFloat32Array, width: int, depth: int
) -> HeightMapShape3D:
    var shape := HeightMapShape3D.new()
    shape.map_width = width + 1
    shape.map_depth = depth + 1
    shape.map_data = heights
    return shape
```

### Convex hull for dynamic objects

```gdscript
# Convex collision — works with RigidBody3D but approximates the shape
var convex := ConvexPolygonShape3D.new()
convex.points = mesh.get_faces()  # Auto-generates convex hull from points
```

---

## 8. Practical Patterns

### Trail / ribbon mesh

```gdscript
# trail.gd — creates a ribbon mesh behind a moving object
class_name Trail3D
extends MeshInstance3D

@export var max_points: int = 50
@export var width: float = 0.5
@export var min_distance: float = 0.1

var _points: Array[Vector3] = []

func _ready() -> void:
    mesh = ImmediateMesh.new()
    # Use a transparent material
    var mat := StandardMaterial3D.new()
    mat.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
    mat.albedo_color = Color(1, 1, 1, 0.8)
    mat.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
    material_override = mat

func add_point(pos: Vector3) -> void:
    if _points.size() > 0 and pos.distance_to(_points[0]) < min_distance:
        return
    _points.insert(0, pos)
    if _points.size() > max_points:
        _points.resize(max_points)
    _rebuild()

func _rebuild() -> void:
    var im := mesh as ImmediateMesh
    im.clear_surfaces()

    if _points.size() < 2:
        return

    im.surface_begin(Mesh.PRIMITIVE_TRIANGLE_STRIP)

    for i in range(_points.size()):
        var t := float(i) / (_points.size() - 1)
        var alpha := 1.0 - t  # Fade out toward tail

        # Calculate perpendicular direction for width
        var forward: Vector3
        if i < _points.size() - 1:
            forward = (_points[i + 1] - _points[i]).normalized()
        else:
            forward = (_points[i] - _points[i - 1]).normalized()

        var right := forward.cross(Vector3.UP).normalized() * width * (1.0 - t * 0.5)

        im.surface_set_color(Color(1, 1, 1, alpha))
        im.surface_add_vertex(_points[i] + right)
        im.surface_set_color(Color(1, 1, 1, alpha))
        im.surface_add_vertex(_points[i] - right)

    im.surface_end()
```

---

## 9. Performance Guidelines

**Minimize mesh rebuilds.** Creating a new `ArrayMesh` every frame is expensive. For static procedural geometry, build once in `_ready()`. For dynamic geometry like trails, use `ImmediateMesh` or rebuild only the changed portion.

**Use indices.** Indexed meshes use less GPU memory and improve vertex cache hit rates. A 64×64 terrain grid with indices uses ~8K vertices; without indices, it uses ~24K.

**Batch surfaces.** Each surface in an `ArrayMesh` is a separate draw call. Combine geometry that shares the same material into one surface. 100 separate surfaces = 100 draw calls = bad.

**Generate on background threads.** For heavy generation (large terrain, voxel chunks), compute vertices on a thread and commit to the mesh on the main thread:

```gdscript
# Generate arrays on a thread, commit on main
var thread := Thread.new()
thread.start(_generate_chunk_data.bind(chunk_coord))

# When done (check Thread.is_alive() or use a signal):
var arrays = thread.wait_to_finish()
var mesh := ArrayMesh.new()
mesh.add_surface_from_arrays(Mesh.PRIMITIVE_TRIANGLES, arrays)
```

**Profile with the Godot profiler.** Check "Rendering > Draw Calls" and "Vertices" in the debugger to verify your mesh complexity is reasonable.

---

## 10. C# Equivalents

```csharp
using Godot;

public partial class ProceduralMeshExample : MeshInstance3D
{
    public override void _Ready()
    {
        var st = new SurfaceTool();
        st.Begin(Mesh.PrimitiveType.Triangles);

        st.SetNormal(Vector3.Up);
        st.SetUV(new Vector2(0, 0));
        st.AddVertex(new Vector3(-1, 0, -1));

        st.SetUV(new Vector2(1, 0));
        st.AddVertex(new Vector3(1, 0, -1));

        st.SetUV(new Vector2(1, 1));
        st.AddVertex(new Vector3(1, 0, 1));

        st.GenerateNormals();
        st.GenerateTangents();
        Mesh = st.Commit();
    }
}
```

For `ArrayMesh` in C#, use `Godot.Collections.Array` for the surface arrays and cast typed arrays (`Vector3[]`, `int[]`) as needed.

---

## 11. Common Mistakes

**Setting attributes after `add_vertex()` instead of before.**
`SurfaceTool` applies the *current* normal/UV/color to the next `add_vertex()` call. Setting them after adds the vertex with default values.

**Wrong winding order — invisible triangles.**
Godot culls back faces by default (counter-clockwise = front). If your mesh is invisible, reverse the triangle winding or set `cull_mode = CULL_DISABLED` on the material.

**Forgetting to generate normals.**
Without normals, your mesh renders flat black under any directional light. Call `st.generate_normals()` or provide them manually.

**Using `MeshDataTool` for generation.**
`MeshDataTool` is for reading/modifying existing meshes. For creating new meshes, use `SurfaceTool` or `ArrayMesh`.

**Not freeing old meshes.**
If you regenerate a mesh every frame, assign the new mesh to `.mesh` — the old one is freed automatically via reference counting. But if you hold references elsewhere, clear them to avoid memory leaks.
