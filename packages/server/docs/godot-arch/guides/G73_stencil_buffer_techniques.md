# G73 — Stencil Buffer Techniques

> **Category:** guide · **Engine:** Godot 4.5+ · **Language:** GDScript / C#
> **Related:** [G12 Shaders & Visual Effects](./G12_shaders_and_visual_effects.md) · [G31 Advanced 3D Shaders & Compute](./G31_advanced_3d_shaders_and_compute.md) · [G40 2D Lighting & Shadows](./G40_2d_lighting_and_shadows.md) · [G36 Compositor Effects](./G36_compositor_effects.md)

---

## What This Guide Covers

Godot 4.5 introduced **stencil buffer** support across both the Forward+ and Compatibility renderers. The stencil buffer is an integer-per-pixel buffer that sits alongside the depth buffer and enables masking, outlining, portal effects, selective rendering, and X-ray vision — techniques that were previously difficult or impossible without engine modifications.

**Use this guide when:** you need to mask rendering to specific screen regions, draw outlines around selected objects, create portal/window effects, implement X-ray or see-through mechanics, or perform multi-pass rendering tricks.

**G12** covers general shader fundamentals. **G31** covers compute shaders and advanced 3D techniques. This guide focuses specifically on practical stencil buffer usage patterns introduced in 4.5.

---

## Table of Contents

1. [How the Stencil Buffer Works](#1-how-the-stencil-buffer-works)
2. [Enabling Stencil in Godot 4.5+](#2-enabling-stencil-in-godot-45)
3. [Stencil Operations Reference](#3-stencil-operations-reference)
4. [Pattern: Object Outlining](#4-pattern-object-outlining)
5. [Pattern: Portal / Window Effects](#5-pattern-portal--window-effects)
6. [Pattern: X-Ray / See-Through](#6-pattern-x-ray--see-through)
7. [Pattern: Decal Masking](#7-pattern-decal-masking)
8. [2D Stencil Techniques](#8-2d-stencil-techniques)
9. [Performance Considerations](#9-performance-considerations)
10. [Common Mistakes](#10-common-mistakes)
11. [C# Integration Examples](#11-c-integration-examples)

---

## 1. How the Stencil Buffer Works

The stencil buffer stores an 8-bit integer (0–255) per pixel. During rendering, each draw call can:

- **Test** the current stencil value against a reference value (pass/fail determines whether the pixel is drawn).
- **Write** a new stencil value based on whether the depth/stencil tests pass or fail.

This creates a two-pass workflow: a **write pass** stamps values into the stencil buffer, then a **test pass** uses those values to conditionally render geometry.

### Stencil Test Logic

```
if (stencil_buffer[pixel] COMPARE_OP reference_value):
    draw pixel → apply pass_op to stencil
else:
    skip pixel → apply fail_op to stencil
```

---

## 2. Enabling Stencil in Godot 4.5+

Stencil support works in both **Forward+** and **Compatibility** renderers via the Vulkan backend. No project setting is needed to enable it — stencil operations are configured per-material in shader code.

### Spatial Shader Stencil Parameters

In Godot 4.5+, spatial shaders gain stencil render mode hints:

```gdscript
# Write pass shader — stamps reference value 1 into stencil
shader_type spatial;
render_mode unshaded, stencil_write;

uniform int stencil_reference : hint_range(0, 255) = 1;
uniform int stencil_compare = 0;  // ALWAYS

void fragment() {
    ALBEDO = vec3(0.0);  // invisible write pass
    ALPHA = 0.0;         // don't draw color
}
```

```gdscript
# Read pass shader — only draws where stencil == 1
shader_type spatial;
render_mode stencil_read;

uniform int stencil_reference : hint_range(0, 255) = 1;
uniform int stencil_compare = 3;  // EQUAL

void fragment() {
    ALBEDO = vec3(1.0, 0.3, 0.1);  // visible only in stencil region
}
```

### Stencil Compare Operations

| Value | Operation   | Description                              |
|-------|-------------|------------------------------------------|
| 0     | ALWAYS      | Always passes — used for writing         |
| 1     | NEVER       | Never passes                             |
| 2     | LESS        | Passes if reference < buffer value       |
| 3     | EQUAL       | Passes if reference == buffer value      |
| 4     | LESS_EQUAL  | Passes if reference <= buffer value      |
| 5     | GREATER     | Passes if reference > buffer value       |
| 6     | NOT_EQUAL   | Passes if reference != buffer value      |
| 7     | GREATER_EQUAL | Passes if reference >= buffer value    |

---

## 3. Stencil Operations Reference

Stencil operations determine what happens to the stencil buffer value after the test:

| Operation    | Effect                                         |
|-------------|------------------------------------------------|
| KEEP        | Don't change the stencil value                 |
| ZERO        | Set stencil to 0                               |
| REPLACE     | Set stencil to the reference value              |
| INCREMENT   | Increment (clamp at 255)                       |
| DECREMENT   | Decrement (clamp at 0)                         |
| INVERT      | Bitwise invert the stencil value               |

You specify separate operations for three cases: **stencil fail**, **stencil pass + depth fail**, and **both pass**.

---

## 4. Pattern: Object Outlining

The classic stencil outline renders the object normally, writes to stencil, then draws a slightly scaled-up version that only appears where stencil was NOT written.

### GDScript Setup

```gdscript
# outline_controller.gd
extends Node3D

@export var outline_color: Color = Color(1.0, 0.8, 0.0)
@export var outline_width: float = 1.05

func enable_outline(mesh_instance: MeshInstance3D) -> void:
    # The mesh's material writes stencil ref=1 in its normal pass
    var base_mat := mesh_instance.get_surface_override_material(0)
    base_mat.set_shader_parameter("stencil_reference", 1)

    # Create outline mesh as sibling
    var outline := mesh_instance.duplicate() as MeshInstance3D
    outline.name = mesh_instance.name + "_outline"
    outline.scale = Vector3.ONE * outline_width
    mesh_instance.get_parent().add_child(outline)

    # Outline material reads stencil, draws only where stencil != 1
    var outline_mat := ShaderMaterial.new()
    outline_mat.shader = preload("res://shaders/stencil_outline.gdshader")
    outline_mat.set_shader_parameter("outline_color", outline_color)
    outline_mat.set_shader_parameter("stencil_reference", 1)
    outline_mat.set_shader_parameter("stencil_compare", 6)  # NOT_EQUAL
    outline.set_surface_override_material(0, outline_mat)

func disable_outline(mesh_instance: MeshInstance3D) -> void:
    var outline_name := mesh_instance.name + "_outline"
    var outline := mesh_instance.get_parent().get_node_or_null(outline_name)
    if outline:
        outline.queue_free()
```

### Outline Shader (stencil_outline.gdshader)

```gdscript
shader_type spatial;
render_mode unshaded, cull_front, stencil_read;

uniform vec4 outline_color : source_color = vec4(1.0, 0.8, 0.0, 1.0);
uniform int stencil_reference : hint_range(0, 255) = 1;
uniform int stencil_compare = 6;  // NOT_EQUAL

void fragment() {
    ALBEDO = outline_color.rgb;
    ALPHA = outline_color.a;
}
```

The `cull_front` render mode draws only back faces, creating a clean outline silhouette. Combined with the stencil NOT_EQUAL test, the outline only appears around the object's edges.

---

## 5. Pattern: Portal / Window Effects

Portals use stencil to restrict rendering to a specific screen region defined by a "window" mesh.

### Step-by-Step

1. **Clear pass:** Render the portal frame mesh, writing stencil ref=1.
2. **Scene pass:** Render the "other world" scene with stencil test EQUAL to 1 — it only appears inside the portal frame.
3. **Normal pass:** Render the main scene normally (stencil test ALWAYS or disabled).

```gdscript
# portal_manager.gd
extends Node3D

## The MeshInstance3D that defines the portal shape
@export var portal_frame: MeshInstance3D
## The SubViewport rendering the destination scene
@export var destination_viewport: SubViewport

func _ready() -> void:
    # Portal frame writes stencil but is invisible
    var write_mat := ShaderMaterial.new()
    write_mat.shader = preload("res://shaders/stencil_write_only.gdshader")
    write_mat.set_shader_parameter("stencil_reference", 2)
    portal_frame.set_surface_override_material(0, write_mat)

    # Destination quad reads stencil == 2
    var dest_quad := portal_frame.get_node("DestinationQuad") as MeshInstance3D
    var read_mat := ShaderMaterial.new()
    read_mat.shader = preload("res://shaders/stencil_textured_read.gdshader")
    read_mat.set_shader_parameter("stencil_reference", 2)
    read_mat.set_shader_parameter("stencil_compare", 3)  # EQUAL
    read_mat.set_shader_parameter("viewport_texture", destination_viewport.get_texture())
    dest_quad.set_surface_override_material(0, read_mat)
```

---

## 6. Pattern: X-Ray / See-Through

Show objects (like player skeletons or items) through walls using stencil:

1. Render walls normally, writing stencil ref=1 where they cover screen pixels.
2. Render the "x-ray target" with stencil test EQUAL to 1, a special unshaded silhouette material.
3. Render the target again normally with stencil ALWAYS for uncovered parts.

```gdscript
# xray_shader.gdshader — renders behind-wall silhouette
shader_type spatial;
render_mode unshaded, depth_test_disabled, stencil_read;

uniform vec4 xray_color : source_color = vec4(0.2, 0.5, 1.0, 0.6);
uniform int stencil_reference : hint_range(0, 255) = 1;
uniform int stencil_compare = 3;  // EQUAL — only behind walls

void fragment() {
    ALBEDO = xray_color.rgb;
    ALPHA = xray_color.a;
}
```

The `depth_test_disabled` render mode lets the x-ray pass draw over the wall geometry. The stencil test restricts it to only the wall region, preventing the silhouette from appearing in open space.

---

## 7. Pattern: Decal Masking

Use stencil to prevent decals from bleeding onto surfaces where they shouldn't appear (e.g., preventing blood splatter from appearing on the sky or UI elements):

```gdscript
# Mark surfaces that ACCEPT decals by writing stencil ref=1
# In the decal shader, test stencil EQUAL to 1
# Surfaces without the stencil write (sky, transparent objects) are excluded

# decal_receiver.gdshader
shader_type spatial;
render_mode stencil_write;

uniform int stencil_reference = 1;  # Mark as decal-receiving

void fragment() {
    // Normal rendering — the stencil write happens automatically
    ALBEDO = texture(base_texture, UV).rgb;
}
```

---

## 8. 2D Stencil Techniques

Stencil buffers also work with `shader_type canvas_item` in Godot 4.5+, enabling 2D masking effects.

### Spotlight / Fog of War

```gdscript
# 2D visibility mask — write pass
shader_type canvas_item;
render_mode stencil_write;

uniform int stencil_reference = 1;

void fragment() {
    // Circle mask based on UV distance
    float dist = distance(UV, vec2(0.5));
    if (dist > 0.5) {
        discard;  // Outside circle — don't write stencil
    }
    COLOR = vec4(0.0);  // Invisible write
}
```

```gdscript
# 2D world layer — read pass, only visible inside mask
shader_type canvas_item;
render_mode stencil_read;

uniform int stencil_reference = 1;
uniform int stencil_compare = 3;  // EQUAL

void fragment() {
    COLOR = texture(TEXTURE, UV);
}
```

---

## 9. Performance Considerations

**Stencil is nearly free.** The stencil buffer exists alongside the depth buffer in GPU memory and stencil tests happen at the same pipeline stage as depth tests — early fragment rejection with minimal overhead.

However, keep in mind:

- **Draw order matters.** Write passes must complete before read passes. Use render priority or render layers to control ordering.
- **Overdraw from multi-pass.** Each stencil pattern adds at least one extra draw call per object. Profile with Godot's built-in debugger (see G18).
- **Mobile GPUs.** Tile-based renderers (common on mobile) handle stencil efficiently, but be cautious with very large stencil write regions that span many tiles.
- **Clear cost.** Stencil is cleared once per frame as part of the depth-stencil clear — no extra cost for using it.

---

## 10. Common Mistakes

| Mistake | Fix |
|---------|-----|
| Outline flickers on some frames | Ensure the stencil write pass has higher render priority than the read pass |
| Stencil has no effect | Confirm you're on Godot 4.5+ and using Forward+ or Compatibility renderer |
| Bleeding between objects | Use different stencil reference values per object group (you have 0–255) |
| Portal shows artifacts at edges | Use a slightly inset portal quad to avoid sub-pixel edge gaps |
| Stencil and transparency conflict | Transparent objects may not write depth/stencil — use a separate opaque write pass |

---

## 11. C# Integration Examples

### Outline Controller in C#

```csharp
using Godot;

public partial class OutlineController : Node3D
{
    [Export] public Color OutlineColor { get; set; } = new Color(1f, 0.8f, 0f);
    [Export] public float OutlineWidth { get; set; } = 1.05f;

    public void EnableOutline(MeshInstance3D meshInstance)
    {
        // Set stencil reference on the base material
        var baseMat = meshInstance.GetSurfaceOverrideMaterial(0) as ShaderMaterial;
        baseMat?.SetShaderParameter("stencil_reference", 1);

        // Create scaled outline duplicate
        var outline = meshInstance.Duplicate() as MeshInstance3D;
        outline.Name = meshInstance.Name + "_outline";
        outline.Scale = Vector3.One * OutlineWidth;
        meshInstance.GetParent().AddChild(outline);

        // Apply outline shader material
        var outlineMat = new ShaderMaterial();
        outlineMat.Shader = GD.Load<Shader>("res://shaders/stencil_outline.gdshader");
        outlineMat.SetShaderParameter("outline_color", OutlineColor);
        outlineMat.SetShaderParameter("stencil_reference", 1);
        outlineMat.SetShaderParameter("stencil_compare", 6); // NOT_EQUAL
        outline.SetSurfaceOverrideMaterial(0, outlineMat);
    }

    public void DisableOutline(MeshInstance3D meshInstance)
    {
        string outlineName = meshInstance.Name + "_outline";
        var outline = meshInstance.GetParent().GetNodeOrNull(outlineName);
        outline?.QueueFree();
    }
}
```

### Portal Manager in C#

```csharp
using Godot;

public partial class PortalManager : Node3D
{
    [Export] public MeshInstance3D PortalFrame { get; set; }
    [Export] public SubViewport DestinationViewport { get; set; }

    public override void _Ready()
    {
        // Write stencil on portal frame
        var writeMat = new ShaderMaterial();
        writeMat.Shader = GD.Load<Shader>("res://shaders/stencil_write_only.gdshader");
        writeMat.SetShaderParameter("stencil_reference", 2);
        PortalFrame.SetSurfaceOverrideMaterial(0, writeMat);

        // Read stencil on destination quad
        var destQuad = PortalFrame.GetNode<MeshInstance3D>("DestinationQuad");
        var readMat = new ShaderMaterial();
        readMat.Shader = GD.Load<Shader>("res://shaders/stencil_textured_read.gdshader");
        readMat.SetShaderParameter("stencil_reference", 2);
        readMat.SetShaderParameter("stencil_compare", 3); // EQUAL
        readMat.SetShaderParameter("viewport_texture", DestinationViewport.GetTexture());
        destQuad.SetSurfaceOverrideMaterial(0, readMat);
    }
}
```

---

## Summary

The stencil buffer in Godot 4.5+ unlocks a family of rendering techniques that were previously inaccessible without engine modifications. Key takeaways:

- Stencil is a **per-pixel integer mask** — think of it as a cookie cutter for rendering.
- The basic workflow is always **write pass → test pass**.
- It's available in 3D (spatial shaders) and 2D (canvas_item shaders).
- Performance cost is negligible — the buffer already exists alongside depth.
- Use different reference values (0–255) to manage multiple independent stencil regions.

**Next steps:** [G12 Shaders & Visual Effects](./G12_shaders_and_visual_effects.md) for shader fundamentals · [G36 Compositor Effects](./G36_compositor_effects.md) for full-screen post-processing · [G31 Advanced 3D Shaders](./G31_advanced_3d_shaders_and_compute.md) for compute shader integration.
