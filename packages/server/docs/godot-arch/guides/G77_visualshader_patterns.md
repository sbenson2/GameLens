# G77 — VisualShader Patterns and Custom Shader Nodes

> **Category:** guide · **Engine:** Godot 4.4+ · **Language:** GDScript / C# / GLSL
> **Related:** [G12 Shaders & Visual Effects](./G12_shaders_and_visual_effects.md) · [G31 Advanced 3D Shaders & Compute](./G31_advanced_3d_shaders_and_compute.md) · [G40 2D Lighting & Shadows](./G40_2d_lighting_and_shadows.md) · [G35 Editor Tool Scripts](./G35_editor_tool_scripts.md)

---

## What This Guide Covers

G12 and G31 cover Godot's text-based shader language. This guide covers **VisualShader** — Godot's node-graph shader editor that lets you build shaders by connecting nodes instead of writing GLSL. It also covers creating **custom VisualShader nodes** using `VisualShaderNodeCustom`, which lets you extend the node palette with reusable shader functions written in GLSL.

**Use VisualShader when:** you prefer visual authoring, you want fast iteration with live preview, your team includes artists who aren't comfortable with shader code, or you want to prototype effects quickly before (optionally) converting to text shaders.

**Use text shaders when:** you need compute shaders (VisualShader doesn't support them), you want full control over includes and shared functions, or the node graph becomes unwieldy (30+ nodes).

**You can mix both.** A project can have some materials using VisualShader and others using text shaders. They compile to the same backend.

---

## Table of Contents

1. [VisualShader Basics](#1-visualshader-basics)
2. [Node Categories Reference](#2-node-categories-reference)
3. [Common Effect Recipes](#3-common-effect-recipes)
4. [Expressions and Inline GLSL](#4-expressions-and-inline-glsl)
5. [Creating Custom Nodes](#5-creating-custom-nodes)
6. [Custom Node: Voronoi Noise](#6-custom-node-voronoi-noise)
7. [Custom Node: Outline Detection](#7-custom-node-outline-detection)
8. [Packaging Nodes as Addons](#8-packaging-nodes-as-addons)
9. [Performance Considerations](#9-performance-considerations)
10. [VisualShader to Text Conversion](#10-visualshader-to-text-conversion)
11. [C# Workflow Notes](#11-c-workflow-notes)
12. [Common Mistakes](#12-common-mistakes)

---

## 1. VisualShader Basics

### Creating a VisualShader

1. Select a mesh, sprite, or canvas item.
2. In the Inspector, click its **Material** property → **New ShaderMaterial**.
3. Click the ShaderMaterial → **Shader** → **New VisualShader**.
4. Click the shader resource to open the VisualShader editor at the bottom of the screen.

### Shader Modes

| Mode | Use Case | Output Node |
|------|----------|-------------|
| **Spatial** | 3D meshes | Albedo, Normal, Roughness, Emission, etc. |
| **CanvasItem** | 2D sprites, UI | Color, Normal |
| **Particles** | GPU particle shaders | Position, Velocity, Color |
| **Sky** | Sky rendering | Color |
| **Fog** | Volumetric fog | Density, Albedo |

### Processing Functions

Each mode supports multiple processing functions, selectable via tabs in the editor:

- **Vertex** — runs per vertex (displacement, animation)
- **Fragment** — runs per pixel (color, textures, lighting)
- **Light** — runs per light per pixel (custom lighting models)

---

## 2. Node Categories Reference

The VisualShader editor organizes nodes into categories. Key ones:

| Category | Example Nodes | Use For |
|----------|--------------|---------|
| **Input** | UV, Time, ScreenUV, ViewportSize | Reading built-in values |
| **Color** | ColorConstant, ColorOp, Grayscale | Color math |
| **Scalar** | FloatConstant, FloatOp, FloatFunc | Math on single values |
| **Vector** | VectorOp, VectorFunc, VectorLen | Vector math |
| **Texture** | Texture2D, TextureSDF, CubeMap | Sampling textures |
| **Special** | Expression, Fresnel, ProximityFade | Advanced built-ins |
| **Conditional** | If, Is, Switch, Compare | Branching (use sparingly) |
| **Transform** | TransformCompose, TransformMult | Matrix operations |
| **Procedural** | Noise (various), Voronoi | Procedural patterns |
| **Particle** | EmitParticle, ParticleOutput | Particle-specific |

---

## 3. Common Effect Recipes

### Dissolve Effect (CanvasItem or Spatial)

Node chain:

```
[Texture2D: noise] → [FloatOp: Step] → [Mix] → [Output: Alpha]
                                ↑
                    [FloatUniform: dissolve_amount]
```

Steps:
1. Add a **Texture2D** node, assign a noise texture.
2. Add a **FloatUniform** named `dissolve_amount` (range 0.0–1.0).
3. Add a **FloatOp** set to **Step** — threshold = uniform, input = noise sample.
4. Connect the Step output to the **Alpha** output.
5. Set material to **Transparency: Alpha**.

From GDScript, animate the dissolve:

```gdscript
@export var dissolve_speed: float = 0.5
var dissolve_amount: float = 0.0

func _process(delta: float) -> void:
    dissolve_amount += delta * dissolve_speed
    material.set_shader_parameter("dissolve_amount", dissolve_amount)
```

### Scrolling UV (Water, Lava, Conveyors)

```
[UV] → [VectorOp: Add] → [Texture2D] → [Output: Albedo/Color]
              ↑
[Time] → [VectorOp: Multiply] → [Vec2Uniform: scroll_speed]
```

### Rim Lighting (Spatial)

```
[Normal] → [DotProduct] ← [ViewDir]
               ↓
         [OneMinus] → [FloatOp: Power] → [FloatOp: Multiply] → [Output: Emission]
                              ↑                    ↑
                   [FloatUniform: rim_power]  [ColorUniform: rim_color]
```

### Pixelation (CanvasItem)

```
[UV] → [VectorOp: Multiply] → [VectorFunc: Floor] → [VectorOp: Divide] → [Texture2D] → [Output: Color]
              ↑                                              ↑
     [FloatUniform: pixel_size]                    [FloatUniform: pixel_size]
```

---

## 4. Expressions and Inline GLSL

The **Expression** node lets you write raw GLSL inside a VisualShader graph. This bridges the gap when you need complex math that would require too many nodes.

Add an Expression node, define inputs/outputs, then write GLSL:

```glsl
// Expression node: Inputs: vec2 uv, float time  |  Output: vec3 color
float dist = length(uv - vec2(0.5));
float ring = smoothstep(0.3, 0.31, dist) - smoothstep(0.4, 0.41, dist);
float pulse = sin(time * 3.0) * 0.5 + 0.5;
color = vec3(ring * pulse, ring * 0.3, ring * 0.8);
```

Expression nodes compile to the same GLSL as regular nodes — no performance difference.

---

## 5. Creating Custom Nodes

Custom VisualShader nodes extend the node palette with reusable shader building blocks. They are GDScript or C# classes that inherit `VisualShaderNodeCustom`.

### Minimal Custom Node (GDScript)

Create a file — for example `res://addons/my_shaders/voronoi_node.gd`:

```gdscript
@tool
class_name VisualShaderNodeVoronoi
extends VisualShaderNodeCustom

func _get_name() -> String:
    return "Voronoi"

func _get_category() -> String:
    return "MyShaders/Procedural"

func _get_description() -> String:
    return "Generates a Voronoi noise pattern."

func _get_return_icon_type() -> VisualShaderNode.PortType:
    return PORT_TYPE_SCALAR

func _get_input_port_count() -> int:
    return 2

func _get_input_port_name(port: int) -> String:
    match port:
        0: return "uv"
        1: return "scale"
    return ""

func _get_input_port_type(port: int) -> VisualShaderNode.PortType:
    match port:
        0: return PORT_TYPE_VECTOR_2D
        1: return PORT_TYPE_SCALAR
    return PORT_TYPE_SCALAR

func _get_input_port_default_value(port: int) -> Variant:
    match port:
        1: return 5.0
    return null

func _get_output_port_count() -> int:
    return 2

func _get_output_port_name(port: int) -> String:
    match port:
        0: return "cells"
        1: return "distance"
    return ""

func _get_output_port_type(port: int) -> VisualShaderNode.PortType:
    return PORT_TYPE_SCALAR

func _get_global_code(mode: Shader.Mode) -> String:
    return """
float voronoi_custom(vec2 uv, float scale, out float min_dist) {
    vec2 scaled = uv * scale;
    vec2 cell = floor(scaled);
    vec2 frac = fract(scaled);
    min_dist = 1.0;
    float cell_id = 0.0;
    for (int y = -1; y <= 1; y++) {
        for (int x = -1; x <= 1; x++) {
            vec2 neighbor = vec2(float(x), float(y));
            vec2 point = fract(sin(vec2(
                dot(cell + neighbor, vec2(127.1, 311.7)),
                dot(cell + neighbor, vec2(269.5, 183.3))
            )) * 43758.5453);
            float d = length(neighbor + point - frac);
            if (d < min_dist) {
                min_dist = d;
                cell_id = dot(cell + neighbor, vec2(7.0, 113.0));
            }
        }
    }
    return fract(sin(cell_id) * 43758.5453);
}
"""

func _get_code(input_vars: Array[String], output_vars: Array[String],
        mode: Shader.Mode, type: VisualShader.Type) -> String:
    var uv := input_vars[0] if input_vars[0] else "UV"
    var scale := input_vars[1] if input_vars[1] else "5.0"
    return """
float _voronoi_dist;
%s = voronoi_custom(%s, %s, _voronoi_dist);
%s = _voronoi_dist;
""" % [output_vars[0], uv, scale, output_vars[1]]
```

### How It Works

1. `@tool` makes it run in the editor — required.
2. `class_name` registers it globally — no plugin.cfg needed.
3. `_get_global_code()` injects GLSL functions into the shader's global scope.
4. `_get_code()` injects GLSL at the node's position in the graph.
5. `input_vars` contains the GLSL variable names of connected inputs (or empty string if unconnected).
6. `output_vars` contains the GLSL variable names for outputs.

---

## 6. Custom Node: Voronoi Noise

The full implementation is in section 5 above. Usage tips:

- **Scale** controls cell density. Values 3–20 work well for most effects.
- **Cells output** gives a random value per cell (use for coloring regions).
- **Distance output** gives distance to the nearest cell center (use for edge detection, cracks).
- Chain with a **Step** or **SmoothStep** node for crisp cell borders.
- Animate by adding `TIME * speed` to the UV input for flowing lava or plasma.

---

## 7. Custom Node: Outline Detection

A screen-space outline node for CanvasItem shaders:

```gdscript
@tool
class_name VisualShaderNodeOutline2D
extends VisualShaderNodeCustom

func _get_name() -> String:
    return "Outline2D"

func _get_category() -> String:
    return "MyShaders/Effects"

func _get_description() -> String:
    return "Adds an outline around sprites based on alpha edge detection."

func _get_return_icon_type() -> VisualShaderNode.PortType:
    return PORT_TYPE_VECTOR_4D

func _get_input_port_count() -> int:
    return 3

func _get_input_port_name(port: int) -> String:
    match port:
        0: return "texture"
        1: return "width"
        2: return "color"
    return ""

func _get_input_port_type(port: int) -> VisualShaderNode.PortType:
    match port:
        0: return PORT_TYPE_SAMPLER
        1: return PORT_TYPE_SCALAR
        2: return PORT_TYPE_VECTOR_4D
    return PORT_TYPE_SCALAR

func _get_input_port_default_value(port: int) -> Variant:
    match port:
        1: return 1.0
        2: return Color.BLACK
    return null

func _get_output_port_count() -> int:
    return 1

func _get_output_port_name(port: int) -> String:
    return "result"

func _get_output_port_type(port: int) -> VisualShaderNode.PortType:
    return PORT_TYPE_VECTOR_4D

func _get_code(input_vars: Array[String], output_vars: Array[String],
        mode: Shader.Mode, type: VisualShader.Type) -> String:
    var tex := input_vars[0] if input_vars[0] else "TEXTURE"
    var width := input_vars[1] if input_vars[1] else "1.0"
    var col := input_vars[2] if input_vars[2] else "vec4(0.0, 0.0, 0.0, 1.0)"
    return """
vec2 _outline_ps = TEXTURE_PIXEL_SIZE * %s;
float _outline_a = texture(%s, UV + vec2(_outline_ps.x, 0.0)).a;
_outline_a += texture(%s, UV + vec2(-_outline_ps.x, 0.0)).a;
_outline_a += texture(%s, UV + vec2(0.0, _outline_ps.y)).a;
_outline_a += texture(%s, UV + vec2(0.0, -_outline_ps.y)).a;
_outline_a = min(_outline_a, 1.0);
vec4 _outline_orig = texture(%s, UV);
%s = mix(%s * _outline_a, _outline_orig, _outline_orig.a);
""" % [width, tex, tex, tex, tex, tex, output_vars[0], col]
```

This samples the texture's alpha in 4 cardinal directions. Where the original pixel is transparent but neighbors are opaque, it draws the outline color.

---

## 8. Packaging Nodes as Addons

To share custom nodes as a reusable addon:

```
addons/
└── my_shader_nodes/
    ├── plugin.cfg
    ├── nodes/
    │   ├── voronoi_node.gd
    │   └── outline_node.gd
    └── examples/
        └── demo_material.tres
```

`plugin.cfg`:

```ini
[plugin]
name="My Shader Nodes"
description="Custom VisualShader nodes: Voronoi, Outline, etc."
author="Your Name"
version="1.0"
script="plugin.gd"
```

`plugin.gd`:

```gdscript
@tool
extends EditorPlugin

# Custom nodes register themselves via class_name.
# This plugin file is only needed for Asset Library publishing
# and for any editor-specific setup.
```

**Key point:** Custom VisualShader nodes with `class_name` register automatically. You only need a full plugin if you want Asset Library packaging or additional editor integration.

---

## 9. Performance Considerations

### Node Count vs Performance

VisualShader nodes compile to GLSL — the node count does NOT directly affect runtime performance. A 50-node graph that implements a simple effect performs identically to the same effect in 5 lines of text shader. What matters is the GLSL output.

### What Actually Costs Performance

- **Texture samples** — each Texture2D node = 1 sample. Minimize these.
- **Branching** (If/Switch nodes) — GPUs handle branching poorly. Use `mix()` or `step()` instead when possible.
- **Dependent texture reads** — sampling a texture using coordinates from another texture read (common in distortion effects). These cannot be pipelined.
- **Fragment vs Vertex** — move calculations to the Vertex function when the result doesn't need per-pixel precision (UV scrolling, object-space position).

### Checking Generated Code

You can inspect the GLSL that VisualShader generates:

1. Save the VisualShader resource as `.tres` (text format).
2. Open the `.tres` file in a text editor.
3. The generated shader code is embedded in the resource.

Alternatively, enable **Rendering > Shader > Log Shader Compilation** in Project Settings to see compiled shaders in the output log.

---

## 10. VisualShader to Text Conversion

If your VisualShader graph outgrows visual editing, you can convert it:

1. Open the `.tres` resource file.
2. Copy the generated `code` section.
3. Create a new `ShaderMaterial` with a text-based `Shader`.
4. Paste and clean up the generated GLSL.

The generated code is verbose (lots of temp variables) but functionally correct. Refactor variable names and combine operations for readability.

**There is no automatic text → VisualShader conversion.**

---

## 11. C# Workflow Notes

Custom VisualShader nodes can also be written in C#:

```csharp
using Godot;

[Tool]
[GlobalClass]
public partial class VisualShaderNodePulse : VisualShaderNodeCustom
{
    public override string _GetName() => "Pulse";
    public override string _GetCategory() => "MyShaders/Animation";
    public override string _GetDescription() => "Sine-based pulse effect.";

    public override int _GetInputPortCount() => 2;
    public override string _GetInputPortName(int port) => port switch
    {
        0 => "speed",
        1 => "intensity",
        _ => ""
    };
    public override PortType _GetInputPortType(int port) => PortType.Scalar;

    public override int _GetOutputPortCount() => 1;
    public override string _GetOutputPortName(int port) => "value";
    public override PortType _GetOutputPortType(int port) => PortType.Scalar;

    public override string _GetCode(string[] inputVars, string[] outputVars,
        Shader.Mode mode, VisualShader.Type type)
    {
        string speed = string.IsNullOrEmpty(inputVars[0]) ? "1.0" : inputVars[0];
        string intensity = string.IsNullOrEmpty(inputVars[1]) ? "1.0" : inputVars[1];
        return $"{outputVars[0]} = sin(TIME * {speed}) * {intensity} * 0.5 + 0.5;\n";
    }
}
```

The C# node appears in the VisualShader "Add Node" menu alongside GDScript custom nodes. Both produce the same GLSL output.

---

## 12. Common Mistakes

### Forgetting @tool

Custom VisualShader nodes **must** have `@tool` (GDScript) or `[Tool]` (C#). Without it, the class doesn't run in the editor and the node won't appear in the Add Node menu.

### Mismatched Port Types

If `_get_input_port_type()` returns `PORT_TYPE_VECTOR_3D` but your GLSL code treats it as `float`, you'll get a compilation error. The GLSL variable type must match the declared port type:

| Port Type | GLSL Type |
|-----------|-----------|
| `PORT_TYPE_SCALAR` | `float` |
| `PORT_TYPE_SCALAR_INT` | `int` |
| `PORT_TYPE_VECTOR_2D` | `vec2` |
| `PORT_TYPE_VECTOR_3D` | `vec3` |
| `PORT_TYPE_VECTOR_4D` | `vec4` |
| `PORT_TYPE_BOOLEAN` | `bool` |
| `PORT_TYPE_SAMPLER` | `sampler2D` |

### Using Reserved GLSL Variable Names

Inside `_get_code()`, avoid naming temp variables with GLSL reserved words or built-in names (`color`, `normal`, `uv`). Prefix with an underscore to be safe.

### Not Handling Unconnected Inputs

When an input port is unconnected, `input_vars[n]` is an empty string. Always provide a fallback:

```gdscript
var uv := input_vars[0] if input_vars[0] else "UV"
```

### Overly Complex Graphs

If your graph exceeds ~40 nodes, consider splitting into:
- A custom node that encapsulates a sub-graph as GLSL.
- Or converting to a text shader entirely.

Large graphs become hard to maintain and debug, even though they compile fine.
