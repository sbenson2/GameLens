# G36 — Compositor Effects & Custom Render Passes

> **Category:** Guide · **Engine:** Godot 4.4+ · **Language:** GDScript / C# / GLSL
> **Related:** [G12 Shaders & Visual Effects](./G12_shaders_and_visual_effects.md) · [G31 Advanced 3D Shaders & Compute](./G31_advanced_3d_shaders_and_compute.md) · [G18 Performance Profiling](./G18_performance_profiling.md)

---

## What This Guide Covers

The **Compositor** system (introduced in Godot 4.3) gives you direct access to the rendering pipeline. With `CompositorEffect`, you can inject custom rendering logic — compute shaders, post-processing passes, screen-space effects — at specific stages of the frame, using the low-level `RenderingDevice` API.

This is different from traditional shader-based post-processing (which uses a `ShaderMaterial` on a full-screen quad). The Compositor operates at the engine level, giving you access to internal buffers (depth, normal/roughness, velocity) and the ability to run compute shaders that feed into subsequent render stages.

**G12** covers standard shaders and visual effects. **G31** covers compute shaders in isolation. This guide covers the Compositor pipeline that ties them into the rendering frame.

**Renderer support:** The Compositor works with **Forward+** and **Mobile** renderers only. The Compatibility renderer does not support it.

---

## Table of Contents

1. [How the Compositor Works](#1-how-the-compositor-works)
2. [Pipeline Stages](#2-pipeline-stages)
3. [Setting Up a Compositor](#3-setting-up-a-compositor)
4. [Creating a CompositorEffect](#4-creating-a-compositoreffect)
5. [Accessing Render Buffers](#5-accessing-render-buffers)
6. [Example: Grayscale Post-Process](#6-example-grayscale-post-process)
7. [Example: Edge Detection with Depth](#7-example-edge-detection-with-depth)
8. [Example: Custom Compute Shader Pass](#8-example-custom-compute-shader-pass)
9. [Push Constants and Uniforms](#9-push-constants-and-uniforms)
10. [Performance Considerations](#10-performance-considerations)
11. [C# Implementation](#11-c-implementation)
12. [Common Mistakes](#12-common-mistakes)

---

## 1. How the Compositor Works

```
┌─────────────────────────────────────────────────────────┐
│  Godot Rendering Frame                                   │
│                                                          │
│  1. Depth Pre-pass                                       │
│  2. ┌─ PRE_OPAQUE ──────────────────────┐               │
│     │  Your CompositorEffect callbacks   │               │
│     └────────────────────────────────────┘               │
│  3. Opaque Pass (meshes, terrain)                        │
│  4. ┌─ POST_OPAQUE ─────────────────────┐               │
│     │  Your CompositorEffect callbacks   │               │
│     └────────────────────────────────────┘               │
│  5. Sky rendering                                        │
│  6. ┌─ POST_SKY ────────────────────────┐               │
│     │  Your CompositorEffect callbacks   │               │
│     └────────────────────────────────────┘               │
│  7. ┌─ PRE_TRANSPARENT ─────────────────┐               │
│     │  Your CompositorEffect callbacks   │               │
│     └────────────────────────────────────┘               │
│  8. Transparent Pass                                     │
│  9. ┌─ POST_TRANSPARENT ────────────────┐               │
│     │  Your CompositorEffect callbacks   │               │
│     └────────────────────────────────────┘               │
│ 10. Built-in post-processing (tonemap, glow, etc.)       │
│ 11. Output to viewport                                   │
└─────────────────────────────────────────────────────────┘
```

A `Compositor` resource holds an ordered list of `CompositorEffect` resources. Each effect specifies which stage it runs at and implements `_render_callback()` where you issue `RenderingDevice` commands.

---

## 2. Pipeline Stages

| Stage | Enum | Available Buffers | Typical Use |
|-------|------|-------------------|-------------|
| Pre-opaque | `EFFECT_CALLBACK_TYPE_PRE_OPAQUE` | Depth (from pre-pass) | Modify depth, inject geometry |
| Post-opaque | `EFFECT_CALLBACK_TYPE_POST_OPAQUE` | Color, depth, normal/roughness | SSAO, screen-space shadows |
| Post-sky | `EFFECT_CALLBACK_TYPE_POST_SKY` | Color (with sky), depth | Atmospheric effects |
| Pre-transparent | `EFFECT_CALLBACK_TYPE_PRE_TRANSPARENT` | Color, depth, normal/roughness | Distortion prep, refraction |
| Post-transparent | `EFFECT_CALLBACK_TYPE_POST_TRANSPARENT` | Full color, depth, velocity | Post-processing (bloom, color grading, outlines) |

**Post-transparent** is the most common stage for post-processing — you see the fully rendered frame before Godot's built-in effects (tonemap, glow) are applied.

---

## 3. Setting Up a Compositor

### Via WorldEnvironment (Global)

1. Select your `WorldEnvironment` node
2. In the Inspector, find the **Compositor** property
3. Create a new `Compositor` resource
4. Add your `CompositorEffect` resources to its `compositor_effects` array

### Via Camera3D (Per-Camera)

1. Select your `Camera3D` node
2. In the Inspector, find the **Compositor** property
3. Assign a `Compositor` — this overrides the WorldEnvironment compositor for this camera

### In Code

```gdscript
func _ready() -> void:
    var compositor := Compositor.new()
    var effect := preload("res://effects/my_grayscale_effect.tres")
    compositor.compositor_effects.append(effect)
    %WorldEnvironment.compositor = compositor
```

---

## 4. Creating a CompositorEffect

A `CompositorEffect` is a `Resource` subclass. Mark it `@tool` so it works in the editor viewport.

```gdscript
# effects/grayscale_effect.gd
@tool
class_name GrayscaleEffect
extends CompositorEffect

var rd: RenderingDevice
var shader: RID
var pipeline: RID

func _init() -> void:
    # Tell the compositor when to call us
    effect_callback_type = EFFECT_CALLBACK_TYPE_POST_TRANSPARENT

    # Get the rendering device — this is the low-level GPU API
    rd = RenderingServer.get_rendering_device()

func _notification(what: int) -> void:
    if what == NOTIFICATION_PREDELETE:
        # Clean up GPU resources when this effect is freed
        if shader.is_valid():
            rd.free_rid(shader)

func _render_callback(effect_callback_type: int, render_data: RenderData) -> void:
    if rd == null:
        return
    if effect_callback_type != EFFECT_CALLBACK_TYPE_POST_TRANSPARENT:
        return

    # Get the render scene buffers
    var render_scene_buffers := render_data.get_render_scene_buffers()
    if render_scene_buffers == null:
        return

    # Get viewport size
    var size: Vector2i = render_scene_buffers.get_internal_size()
    if size.x == 0 or size.y == 0:
        return

    # Process each view (important for VR — left eye + right eye)
    var view_count: int = render_scene_buffers.get_view_count()
    for view in view_count:
        var color_image: RID = render_scene_buffers.get_color_layer(view)
        _apply_effect(color_image, size)
```

---

## 5. Accessing Render Buffers

Inside `_render_callback()`, `RenderData` gives you access to several buffers:

```gdscript
func _render_callback(effect_callback_type: int, render_data: RenderData) -> void:
    var scene_buffers := render_data.get_render_scene_buffers()

    # Color buffer (the rendered frame)
    var color: RID = scene_buffers.get_color_layer(view)

    # Depth buffer
    var depth: RID = scene_buffers.get_depth_layer(view)

    # You can also access the render scene data for camera info
    var scene_data := render_data.get_render_scene_data()
    var cam_transform: Transform3D = scene_data.get_cam_transform()
    var projection: Projection = scene_data.get_cam_projection()
```

---

## 6. Example: Grayscale Post-Process

A minimal but complete example that converts the frame to grayscale using a compute shader.

### The GLSL Compute Shader

```glsl
// grayscale.glsl
#[compute]
#version 450

layout(local_size_x = 8, local_size_y = 8, local_size_z = 1) in;

layout(rgba16f, set = 0, binding = 0) uniform image2D color_image;

layout(push_constant, std430) uniform Params {
    vec2 image_size;
    float intensity;   // 0.0 = full color, 1.0 = full grayscale
    float _pad;
} params;

void main() {
    ivec2 uv = ivec2(gl_GlobalInvocationID.xy);
    if (uv.x >= int(params.image_size.x) || uv.y >= int(params.image_size.y)) {
        return;
    }

    vec4 color = imageLoad(color_image, uv);
    float luminance = dot(color.rgb, vec3(0.2126, 0.7152, 0.0722));
    vec3 gray = vec3(luminance);
    color.rgb = mix(color.rgb, gray, params.intensity);
    imageStore(color_image, uv, color);
}
```

### The GDScript Effect

```gdscript
# effects/grayscale_effect.gd
@tool
class_name GrayscaleEffect
extends CompositorEffect

@export_range(0.0, 1.0) var intensity: float = 1.0

var rd: RenderingDevice
var shader: RID
var pipeline: RID
var _mutex := Mutex.new()

func _init() -> void:
    effect_callback_type = EFFECT_CALLBACK_TYPE_POST_TRANSPARENT
    rd = RenderingServer.get_rendering_device()
    if rd:
        _setup_shader()

func _notification(what: int) -> void:
    if what == NOTIFICATION_PREDELETE:
        _cleanup()

func _setup_shader() -> void:
    # Load and compile the compute shader
    var shader_file := load("res://effects/grayscale.glsl")
    var spirv: RDShaderSPIRV = shader_file.get_spirv()
    shader = rd.shader_create_from_spirv(spirv)
    pipeline = rd.compute_pipeline_create(shader)

func _cleanup() -> void:
    if rd and shader.is_valid():
        rd.free_rid(shader)
        # Pipeline is freed automatically with shader

func _render_callback(effect_callback_type_arg: int, render_data: RenderData) -> void:
    if rd == null or not pipeline.is_valid():
        return

    var scene_buffers := render_data.get_render_scene_buffers()
    if scene_buffers == null:
        return

    var size := scene_buffers.get_internal_size()
    if size.x == 0 or size.y == 0:
        return

    # Push constants: image_size (vec2) + intensity (float) + padding
    # Must be 16-byte aligned — PackedFloat32Array length must be multiple of 4
    var push_constants := PackedFloat32Array([
        float(size.x), float(size.y),
        intensity,
        0.0  # padding
    ])
    var push_bytes := push_constants.to_byte_array()

    var view_count := scene_buffers.get_view_count()
    for view in view_count:
        var color_image: RID = scene_buffers.get_color_layer(view)

        # Create uniform set for this frame's color image
        var uniform := RDUniform.new()
        uniform.uniform_type = RenderingDevice.UNIFORM_TYPE_IMAGE
        uniform.binding = 0
        uniform.add_id(color_image)

        var uniform_set: RID = UniformSetCacheRD.get_cache(shader, 0, [uniform])

        # Dispatch the compute shader
        var compute_list := rd.compute_list_begin()
        rd.compute_list_bind_compute_pipeline(compute_list, pipeline)
        rd.compute_list_bind_uniform_set(compute_list, uniform_set, 0)
        rd.compute_list_set_push_constant(compute_list, push_bytes, push_bytes.size())

        # Dispatch enough workgroups to cover the image (ceil division)
        var groups_x: int = ceili(float(size.x) / 8.0)
        var groups_y: int = ceili(float(size.y) / 8.0)
        rd.compute_list_dispatch(compute_list, groups_x, groups_y, 1)
        rd.compute_list_end()
```

### Using It

1. Save the GDScript as a `.gd` file and create a `.tres` resource from it in the Inspector
2. Add it to a `Compositor` resource's `compositor_effects` array
3. Assign the `Compositor` to your `WorldEnvironment` or `Camera3D`

---

## 7. Example: Edge Detection with Depth

Access the depth buffer to draw outlines around geometry.

```glsl
// edge_detect.glsl
#[compute]
#version 450

layout(local_size_x = 8, local_size_y = 8, local_size_z = 1) in;

layout(rgba16f, set = 0, binding = 0) uniform image2D color_image;
layout(set = 0, binding = 1) uniform sampler2D depth_texture;

layout(push_constant, std430) uniform Params {
    vec2 image_size;
    float edge_threshold;
    float outline_width;
} params;

float get_depth(ivec2 coord) {
    vec2 uv = (vec2(coord) + 0.5) / params.image_size;
    return texture(depth_texture, uv).r;
}

void main() {
    ivec2 uv = ivec2(gl_GlobalInvocationID.xy);
    if (uv.x >= int(params.image_size.x) || uv.y >= int(params.image_size.y)) {
        return;
    }

    // Sobel-style depth edge detection
    int r = int(params.outline_width);
    float center = get_depth(uv);
    float edge = 0.0;

    edge += abs(get_depth(uv + ivec2(r, 0)) - center);
    edge += abs(get_depth(uv + ivec2(-r, 0)) - center);
    edge += abs(get_depth(uv + ivec2(0, r)) - center);
    edge += abs(get_depth(uv + ivec2(0, -r)) - center);

    vec4 color = imageLoad(color_image, uv);
    if (edge > params.edge_threshold) {
        color.rgb = vec3(0.0);  // Black outline
    }
    imageStore(color_image, uv, color);
}
```

To bind the depth texture, add a second uniform in `_render_callback()`:

```gdscript
var depth_image: RID = scene_buffers.get_depth_layer(view)

var color_uniform := RDUniform.new()
color_uniform.uniform_type = RenderingDevice.UNIFORM_TYPE_IMAGE
color_uniform.binding = 0
color_uniform.add_id(color_image)

var depth_uniform := RDUniform.new()
depth_uniform.uniform_type = RenderingDevice.UNIFORM_TYPE_SAMPLER_WITH_TEXTURE
depth_uniform.binding = 1
depth_uniform.add_id(sampler_rid)  # Create a sampler with linear filtering
depth_uniform.add_id(depth_image)

var uniform_set := UniformSetCacheRD.get_cache(shader, 0, [color_uniform, depth_uniform])
```

---

## 8. Example: Custom Compute Shader Pass

For effects that need intermediate storage (blur, SSAO, multi-pass), create temporary textures:

```gdscript
func _render_callback(effect_callback_type_arg: int, render_data: RenderData) -> void:
    var scene_buffers := render_data.get_render_scene_buffers()
    var size := scene_buffers.get_internal_size()

    # Ensure our temporary texture exists (recreate on resize)
    # Use the scene buffers' built-in texture management
    if not scene_buffers.has_texture("my_effect", "temp_buffer"):
        var usage := RenderingDevice.TEXTURE_USAGE_STORAGE_BIT | \
                     RenderingDevice.TEXTURE_USAGE_SAMPLING_BIT
        scene_buffers.create_texture("my_effect", "temp_buffer",
            RenderingDevice.DATA_FORMAT_R16G16B16A16_SFLOAT,
            usage, RenderingServer.VIEWPORT_MSAA_DISABLED, size, 1, 1, true)

    for view in scene_buffers.get_view_count():
        var color: RID = scene_buffers.get_color_layer(view)
        var temp: RID = scene_buffers.get_texture_slice(
            "my_effect", "temp_buffer", view, 0, 1, 1)

        # Pass 1: Color → Temp (horizontal blur)
        _dispatch_blur(color, temp, size, Vector2(1, 0))

        # Pass 2: Temp → Color (vertical blur)
        _dispatch_blur(temp, color, size, Vector2(0, 1))
```

---

## 9. Push Constants and Uniforms

### Push Constants

Push constants are small (128 bytes max on most GPUs), fast uniform data sent per-dispatch.

```gdscript
# Must be 16-byte aligned
var push := PackedFloat32Array([
    float(size.x), float(size.y),   # 8 bytes
    intensity, time,                  # 8 bytes
])
var push_bytes := push.to_byte_array()

rd.compute_list_set_push_constant(compute_list, push_bytes, push_bytes.size())
```

### UniformSetCacheRD

Always use `UniformSetCacheRD.get_cache()` instead of creating uniform sets manually. The cache handles deduplication and lifecycle automatically — no need to free uniform set RIDs.

```gdscript
# DO:
var uniform_set := UniformSetCacheRD.get_cache(shader, set_index, [uniform1, uniform2])

# DON'T:
# var uniform_set := rd.uniform_set_create([uniform1], shader, 0)
# ↑ You'd need to track and free this manually
```

---

## 10. Performance Considerations

| Concern | Guidance |
|---------|----------|
| Workgroup size | `8×8` is a solid default. Benchmark `16×16` for texture-heavy shaders |
| Dispatch overhead | Batch draws — each `compute_list_begin/end` pair has fixed overhead |
| Buffer reads | Depth/normal reads are cheap; motion vectors are heavier |
| Temporary textures | Use `scene_buffers.create_texture()` — it handles resize and lifecycle |
| VR | Always loop over `view_count` — VR has 2+ views per frame |
| Half-resolution | Create temp textures at `size / 2` for expensive effects, then upscale |
| Profiling | Use **Debugger → Monitors → RenderingDevice** to track GPU time |

### Resolution-Aware Dispatching

```gdscript
# For a half-res pass:
var half_size := size / 2
var groups_x := ceili(float(half_size.x) / 8.0)
var groups_y := ceili(float(half_size.y) / 8.0)
rd.compute_list_dispatch(compute_list, groups_x, groups_y, 1)
```

---

## 11. C# Implementation

```csharp
#if TOOLS
using Godot;

[Tool]
[GlobalClass]
public partial class GrayscaleEffectCS : CompositorEffect
{
    [Export(PropertyHint.Range, "0,1,0.01")]
    public float Intensity { get; set; } = 1.0f;

    private RenderingDevice _rd;
    private Rid _shader;
    private Rid _pipeline;

    public GrayscaleEffectCS()
    {
        EffectCallbackType = EffectCallbackTypeEnum.PostTransparent;
        _rd = RenderingServer.GetRenderingDevice();
        if (_rd != null)
            SetupShader();
    }

    private void SetupShader()
    {
        var shaderFile = GD.Load<RDShaderFile>("res://effects/grayscale.glsl");
        var spirv = shaderFile.GetSpirV();
        _shader = _rd.ShaderCreateFromSpirV(spirv);
        _pipeline = _rd.ComputePipelineCreate(_shader);
    }

    public override void _RenderCallback(int effectCallbackType, RenderData renderData)
    {
        if (_rd == null || !_pipeline.IsValid)
            return;

        var sceneBuffers = renderData.GetRenderSceneBuffers();
        if (sceneBuffers == null)
            return;

        var size = sceneBuffers.GetInternalSize();
        if (size.X == 0 || size.Y == 0)
            return;

        var pushConstants = new float[] { size.X, size.Y, Intensity, 0f };
        var pushBytes = new byte[pushConstants.Length * sizeof(float)];
        System.Buffer.BlockCopy(pushConstants, 0, pushBytes, 0, pushBytes.Length);

        for (uint view = 0; view < sceneBuffers.GetViewCount(); view++)
        {
            var colorImage = sceneBuffers.GetColorLayer(view);

            var uniform = new RDUniform();
            uniform.UniformType = RenderingDevice.UniformType.Image;
            uniform.Binding = 0;
            uniform.AddId(colorImage);

            var uniformSet = UniformSetCacheRd.GetCache(_shader, 0,
                new Godot.Collections.Array<RDUniform> { uniform });

            var computeList = _rd.ComputeListBegin();
            _rd.ComputeListBindComputePipeline(computeList, _pipeline);
            _rd.ComputeListBindUniformSet(computeList, uniformSet, 0);
            _rd.ComputeListSetPushConstant(computeList, pushBytes, (uint)pushBytes.Length);

            int groupsX = Mathf.CeilToInt(size.X / 8f);
            int groupsY = Mathf.CeilToInt(size.Y / 8f);
            _rd.ComputeListDispatch(computeList, (uint)groupsX, (uint)groupsY, 1);
            _rd.ComputeListEnd();
        }
    }
}
#endif
```

---

## 12. Common Mistakes

| Mistake | Why It Breaks | Fix |
|---------|--------------|-----|
| Missing `@tool` on the effect script | Effect won't run in editor viewport | Add `@tool` at the top |
| Push constants not 16-byte aligned | GPU reads garbage data; visual artifacts or crash | Pad `PackedFloat32Array` length to a multiple of 4 |
| Creating uniform sets every frame without cache | Massive GPU resource leak | Use `UniformSetCacheRD.get_cache()` |
| Hardcoding view count to 1 | Breaks VR (stereo rendering needs 2 views) | Always loop over `scene_buffers.get_view_count()` |
| Using Compatibility renderer | Compositor is not supported | Switch to Forward+ or Mobile |
| Not cleaning up shader RIDs | GPU memory leak on effect removal | Free in `NOTIFICATION_PREDELETE` |
| Dispatching with wrong group count | Part of the image isn't processed — black bars | Use `ceili(size / workgroup_size)` |
| Accessing scene tree in `_render_callback` | Runs on the render thread, not the main thread | Only use `RenderingDevice` and `RenderData` APIs |
| Forgetting `image_size` bounds check in GLSL | Writes past image boundaries — undefined behavior | Guard with `if (uv.x >= int(size.x) ...)` |
