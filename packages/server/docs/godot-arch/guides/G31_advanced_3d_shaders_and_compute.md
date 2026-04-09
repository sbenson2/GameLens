# G31 — Advanced 3D Shaders & Compute Shaders

> **Category:** Guide · **Engine:** Godot 4.4+ · **Language:** Godot Shading Language / GLSL / GDScript / C#
> **Related:** [G12 Shaders & Visual Effects](./G12_shaders_and_visual_effects.md) · [G18 Performance Profiling](./G18_performance_profiling.md) · [G16 GDExtension](./G16_gdextension_native_code.md) · [G15 Particle Systems](./G15_particle_systems.md)

---

## What This Guide Covers

G12 covers 2D CanvasItem shaders, the Visual Shader editor, and basic post-processing. This guide goes deeper into **3D spatial shaders** (vertex displacement, custom lighting, PBR overrides, volumetric effects) and **compute shaders** (GPGPU with `RenderingDevice`). These are the two shader topics most requested by developers moving beyond surface-level effects.

Spatial shaders are the most complex shader type Godot offers — they give you full control over vertex transformation, fragment output, and per-light calculations for 3D meshes. Compute shaders break out of the rendering pipeline entirely, letting you run arbitrary GPU workloads for simulation, data processing, and procedural generation.

All code targets Godot 4.4+ using the Forward+ or Mobile renderer (compute shaders require `RenderingDevice`-based renderers).

---

## Table of Contents

1. [Spatial Shader Architecture](#1-spatial-shader-architecture)
2. [Render Modes Reference](#2-render-modes-reference)
3. [Vertex Shader Techniques](#3-vertex-shader-techniques)
4. [Fragment Shader & PBR Overrides](#4-fragment-shader--pbr-overrides)
5. [Custom Light Functions](#5-custom-light-functions)
6. [Volumetric Fog & Fog Shaders](#6-volumetric-fog--fog-shaders)
7. [Compute Shader Fundamentals](#7-compute-shader-fundamentals)
8. [RenderingDevice API Walkthrough](#8-renderingdevice-api-walkthrough)
9. [Compute Shader Patterns](#9-compute-shader-patterns)
10. [Integrating Compute Output with Rendering](#10-integrating-compute-output-with-rendering)
11. [Performance Considerations](#11-performance-considerations)
12. [Common Mistakes](#12-common-mistakes)

---

## 1. Spatial Shader Architecture

Spatial shaders process 3D meshes through three programmable stages:

```
┌─────────────────────────────────────────────────────────────────┐
│  Spatial Shader Pipeline                                        │
│                                                                 │
│  Mesh Data ──▶ vertex() ──▶ fragment() ──▶ light() ──▶ Output  │
│                   │              │              │                │
│          Transform verts   Set material    Per-light calc       │
│          (world/clip)      properties      (called N times)     │
│                            (albedo, PBR)                        │
└─────────────────────────────────────────────────────────────────┘
```

A minimal spatial shader:

```glsl
shader_type spatial;

void vertex() {
    // Transform vertices — VERTEX is in model space
    // Output is clip space (Godot handles MODEL/VIEW/PROJECTION)
}

void fragment() {
    // Set surface properties
    ALBEDO = vec3(0.8, 0.2, 0.1);
    ROUGHNESS = 0.5;
    METALLIC = 0.0;
}

void light() {
    // Custom per-light calculation (optional)
    // Called once per light affecting this fragment
    DIFFUSE_LIGHT += clamp(dot(NORMAL, LIGHT), 0.0, 1.0) * ATTENUATION * LIGHT_COLOR;
}
```

### Built-in Variable Categories

**Vertex function inputs (read-only):**

| Variable | Type | Description |
|----------|------|-------------|
| `VERTEX` | `vec3` | Vertex position (model space, writable) |
| `NORMAL` | `vec3` | Vertex normal (model space, writable) |
| `TANGENT` | `vec3` | Vertex tangent (model space, writable) |
| `BINORMAL` | `vec3` | Vertex binormal (model space, writable) |
| `UV` | `vec2` | Primary UV coordinates (writable) |
| `UV2` | `vec2` | Secondary UV coordinates (writable) |
| `COLOR` | `vec4` | Vertex color (writable) |
| `INSTANCE_ID` | `int` | Instance ID for MultiMesh |
| `MODEL_MATRIX` | `mat4` | Model-to-world transform |
| `VIEW_MATRIX` | `mat4` | World-to-view transform |
| `PROJECTION_MATRIX` | `mat4` | View-to-clip transform |
| `INV_VIEW_MATRIX` | `mat4` | Inverse view matrix |

**Fragment function inputs:**

| Variable | Type | Description |
|----------|------|-------------|
| `FRAGCOORD` | `vec4` | Fragment screen coordinates |
| `VERTEX` | `vec3` | View-space position |
| `NORMAL` | `vec3` | View-space normal (writable) |
| `UV` | `vec2` | Interpolated UV |
| `SCREEN_UV` | `vec2` | Screen UV for post-processing |
| `VIEW` | `vec3` | View direction |

**Fragment function outputs (write):**

| Variable | Type | Description |
|----------|------|-------------|
| `ALBEDO` | `vec3` | Base color |
| `ALPHA` | `float` | Transparency |
| `METALLIC` | `float` | Metallic (0.0–1.0) |
| `ROUGHNESS` | `float` | Roughness (0.0–1.0) |
| `SPECULAR` | `float` | Specular amount (0.0–1.0) |
| `EMISSION` | `vec3` | Emissive color |
| `NORMAL_MAP` | `vec3` | Tangent-space normal map |
| `NORMAL_MAP_DEPTH` | `float` | Normal map strength |
| `RIM` | `float` | Rim lighting amount |
| `RIM_TINT` | `float` | Rim tint (0=white, 1=albedo) |
| `AO` | `float` | Ambient occlusion |
| `SSS_STRENGTH` | `float` | Subsurface scattering |
| `BACKLIGHT` | `vec3` | Backlight color |

---

## 2. Render Modes Reference

Render modes control how the shader interacts with the rendering pipeline. Set them on the `shader_type` line:

```glsl
shader_type spatial;
render_mode unshaded, cull_disabled, depth_draw_always;
```

### Lighting & Shading Modes

| Render Mode | Effect |
|-------------|--------|
| `unshaded` | Skip all lighting — output ALBEDO directly |
| `diffuse_burley` | Burley diffuse model (default) |
| `diffuse_lambert` | Classic Lambert diffuse |
| `diffuse_lambert_wrap` | Wrapped Lambert (softer) |
| `diffuse_toon` | Hard-edge toon diffuse |
| `specular_schlick_ggx` | Schlick-GGX specular (default) |
| `specular_toon` | Toon specular highlight |
| `specular_disabled` | No specular at all |

### Depth & Culling

| Render Mode | Effect |
|-------------|--------|
| `depth_draw_opaque` | Draw depth for opaque objects only (default) |
| `depth_draw_always` | Always write to depth buffer |
| `depth_draw_never` | Never write to depth buffer |
| `depth_prepass_alpha` | Use alpha in depth prepass |
| `cull_back` | Cull back faces (default) |
| `cull_front` | Cull front faces |
| `cull_disabled` | No face culling (double-sided) |

### Blending & Transparency

| Render Mode | Effect |
|-------------|--------|
| `blend_mix` | Standard alpha blending (default) |
| `blend_add` | Additive blending |
| `blend_sub` | Subtractive blending |
| `blend_mul` | Multiplicative blending |

### Other

| Render Mode | Effect |
|-------------|--------|
| `shadows_disabled` | Don't cast shadows |
| `ambient_light_disabled` | Ignore ambient light |
| `fog_disabled` | Ignore fog |
| `vertex_lighting` | Per-vertex instead of per-fragment lighting |
| `world_vertex_coords` | VERTEX in vertex() is in world space |

---

## 3. Vertex Shader Techniques

### Wind Animation for Vegetation

```glsl
shader_type spatial;
render_mode cull_disabled;

uniform float wind_strength : hint_range(0.0, 2.0) = 0.5;
uniform float wind_speed : hint_range(0.0, 5.0) = 1.5;
uniform vec2 wind_direction = vec2(1.0, 0.0);

void vertex() {
    // Use vertex height (Y) as weight — roots stay still, tips sway
    float height_factor = clamp(VERTEX.y / 2.0, 0.0, 1.0);
    float wind_wave = sin(TIME * wind_speed + VERTEX.x * 1.5 + VERTEX.z * 1.5);

    // Apply wind displacement in world XZ
    vec3 world_vertex = (MODEL_MATRIX * vec4(VERTEX, 1.0)).xyz;
    float wind_offset = wind_wave * wind_strength * height_factor;

    VERTEX.x += wind_direction.x * wind_offset;
    VERTEX.z += wind_direction.y * wind_offset;
}

void fragment() {
    ALBEDO = vec3(0.2, 0.6, 0.15);
    ROUGHNESS = 0.85;
}
```

**Key pattern:** Use vertex position or UV as a spatial seed for animation — this creates natural variation across the mesh without per-vertex data.

### Vertex Displacement with Height Maps

```glsl
shader_type spatial;

uniform sampler2D height_map : hint_default_black;
uniform float displacement_strength : hint_range(0.0, 10.0) = 1.0;

void vertex() {
    float height = texture(height_map, UV).r;
    VERTEX += NORMAL * height * displacement_strength;
}
```

### Mesh Explosion Effect

```glsl
shader_type spatial;

uniform float explode_amount : hint_range(0.0, 5.0) = 0.0;

void vertex() {
    // Push each vertex outward along its normal
    VERTEX += NORMAL * explode_amount;
    // Add some rotation for visual interest
    float angle = explode_amount * 2.0;
    float s = sin(angle * float(VERTEX_ID % 7));
    float c = cos(angle * float(VERTEX_ID % 7));
    VERTEX.xz = mat2(vec2(c, s), vec2(-s, c)) * VERTEX.xz;
}
```

---

## 4. Fragment Shader & PBR Overrides

### Triplanar Mapping (Texture Without UVs)

Use this for terrain or procedural meshes that don't have clean UV coordinates:

```glsl
shader_type spatial;

uniform sampler2D albedo_texture : source_color;
uniform float texture_scale = 1.0;
uniform float blend_sharpness : hint_range(1.0, 16.0) = 4.0;

void fragment() {
    // World-space position from view-space
    vec3 world_pos = (INV_VIEW_MATRIX * vec4(VERTEX, 1.0)).xyz;
    vec3 world_normal = (INV_VIEW_MATRIX * vec4(NORMAL, 0.0)).xyz;

    // Triplanar blend weights from world normal
    vec3 blend = pow(abs(world_normal), vec3(blend_sharpness));
    blend /= (blend.x + blend.y + blend.z);

    // Sample texture from each axis
    vec3 x_proj = texture(albedo_texture, world_pos.yz * texture_scale).rgb;
    vec3 y_proj = texture(albedo_texture, world_pos.xz * texture_scale).rgb;
    vec3 z_proj = texture(albedo_texture, world_pos.xy * texture_scale).rgb;

    ALBEDO = x_proj * blend.x + y_proj * blend.y + z_proj * blend.z;
    ROUGHNESS = 0.8;
}
```

### Dissolve Effect (3D)

```glsl
shader_type spatial;
render_mode cull_disabled;

uniform float dissolve_amount : hint_range(0.0, 1.0) = 0.0;
uniform sampler2D noise_texture : hint_default_white;
uniform vec3 edge_color : source_color = vec3(1.0, 0.4, 0.0);
uniform float edge_width : hint_range(0.0, 0.2) = 0.05;

void fragment() {
    float noise = texture(noise_texture, UV).r;

    // Discard pixels below dissolve threshold
    if (noise < dissolve_amount) {
        discard;
    }

    // Glowing edge near the dissolve boundary
    float edge = smoothstep(dissolve_amount, dissolve_amount + edge_width, noise);
    ALBEDO = mix(edge_color, vec3(0.5), edge);
    EMISSION = edge_color * (1.0 - edge) * 3.0;
    ROUGHNESS = 0.5;
}
```

### Subsurface Scattering (Skin, Wax, Leaves)

```glsl
shader_type spatial;

uniform sampler2D albedo_texture : source_color;
uniform float sss_amount : hint_range(0.0, 1.0) = 0.4;

void fragment() {
    ALBEDO = texture(albedo_texture, UV).rgb;
    ROUGHNESS = 0.6;
    SSS_STRENGTH = sss_amount;
    // SSS uses the ALBEDO color as the scattering tint
}
```

---

## 5. Custom Light Functions

The `light()` function is called **once per light** for each fragment. This is where you implement custom lighting models like toon shading or stylized effects.

### Toon / Cel Shading

```glsl
shader_type spatial;

uniform vec3 base_color : source_color = vec3(0.8, 0.3, 0.2);
uniform int shade_steps : hint_range(2, 8) = 3;
uniform float specular_size : hint_range(0.0, 1.0) = 0.5;

void fragment() {
    ALBEDO = base_color;
    // Disable built-in specular so we control it in light()
    SPECULAR = 0.0;
}

void light() {
    // Stepped diffuse
    float NdotL = dot(NORMAL, LIGHT);
    float stepped = floor(NdotL * float(shade_steps)) / float(shade_steps);
    stepped = max(stepped, 0.0);

    DIFFUSE_LIGHT += ALBEDO * LIGHT_COLOR * ATTENUATION * stepped;

    // Hard-edge specular highlight
    float NdotH = dot(NORMAL, normalize(LIGHT + VIEW));
    float spec = step(1.0 - specular_size, NdotH);
    SPECULAR_LIGHT += LIGHT_COLOR * ATTENUATION * spec * 0.5;
}
```

### Rim Lighting in Light Function

```glsl
void light() {
    // Standard diffuse
    float NdotL = max(dot(NORMAL, LIGHT), 0.0);
    DIFFUSE_LIGHT += ALBEDO * LIGHT_COLOR * ATTENUATION * NdotL;

    // View-dependent rim that only appears on lit side
    float rim = 1.0 - max(dot(NORMAL, VIEW), 0.0);
    rim = pow(rim, 4.0) * NdotL;
    DIFFUSE_LIGHT += LIGHT_COLOR * ATTENUATION * rim * 0.3;
}
```

---

## 6. Volumetric Fog & Fog Shaders

Godot 4.4+ supports volumetric fog through `FogVolume` nodes with custom `fog` shaders. Volumetric fog requires the **Forward+** renderer.

### Enabling Volumetric Fog

In the `WorldEnvironment` node's `Environment` resource, enable **Volumetric Fog** under the Fog section. Key properties:

| Property | Description | Default |
|----------|-------------|---------|
| `density` | Global fog density | 0.01 |
| `albedo` | Fog color | White |
| `emission` | Self-illumination color | Black |
| `gi_inject` | Blend in GI light | 0.0 |
| `length` | Fog depth distance | 64 |

### Custom Fog Shader

Fog shaders run per-voxel inside a `FogVolume` and control density and color:

```glsl
shader_type fog;

uniform float density_amount : hint_range(0.0, 5.0) = 1.0;
uniform vec3 fog_color : source_color = vec3(0.5, 0.6, 0.7);
uniform float noise_scale = 2.0;

void fog() {
    // WORLD_POSITION is the position of this fog voxel in world space
    float noise = sin(WORLD_POSITION.x * noise_scale + TIME) *
                  cos(WORLD_POSITION.z * noise_scale + TIME * 0.7);
    noise = noise * 0.5 + 0.5;

    DENSITY = density_amount * noise;
    ALBEDO = fog_color;
    // EMISSION can add self-lit fog (lava glow, magic mist, etc.)
    EMISSION = vec3(0.0);
}
```

**Fog shader built-in variables:**

| Variable | Type | Access | Description |
|----------|------|--------|-------------|
| `WORLD_POSITION` | `vec3` | in | Voxel world position |
| `OBJECT_POSITION` | `vec3` | in | FogVolume center |
| `UVW` | `vec3` | in | 0–1 coordinates within the volume |
| `SIZE` | `vec3` | in | FogVolume extents |
| `SDF` | `float` | in | Signed distance (for non-box shapes) |
| `DENSITY` | `float` | out | Fog density at this voxel |
| `ALBEDO` | `vec3` | out | Fog color |
| `EMISSION` | `vec3` | out | Fog self-illumination |

---

## 7. Compute Shader Fundamentals

Compute shaders run on the GPU outside the rendering pipeline. They're written in raw **GLSL** (not Godot Shading Language) and executed via the `RenderingDevice` API.

### When to Use Compute Shaders

| Use Case | Why Compute |
|----------|-------------|
| Particle simulation (millions) | GPU parallelism far exceeds CPU |
| Boid / flocking AI | Per-agent updates are independent |
| Terrain erosion | Iterative grid operations |
| Image processing | Per-pixel operations |
| Physics pre-pass | Broad-phase collision on GPU |
| Noise generation | Procedural textures at runtime |

### When NOT to Use Compute Shaders

- Small data sets (< 10,000 elements) — CPU is faster due to dispatch overhead
- Sequential algorithms — GPU excels at parallel, not serial
- Frequent CPU readback — GPU→CPU transfers stall the pipeline
- Simple visual effects — use fragment shaders instead

### GLSL Compute Shader Structure

Compute shaders are `.glsl` files with `#[compute]` annotation:

```glsl
#[compute]
#version 450

// Work group size — total threads = X * Y * Z
layout(local_size_x = 256, local_size_y = 1, local_size_z = 1) in;

// Storage buffer (read/write)
layout(set = 0, binding = 0, std430) restrict buffer DataBuffer {
    float data[];
} data_buffer;

// Uniform buffer (read-only structured data)
layout(set = 0, binding = 1, std430) restrict buffer Params {
    float time;
    float delta;
    uint count;
} params;

void main() {
    uint idx = gl_GlobalInvocationID.x;
    if (idx >= params.count) return;  // Guard against over-dispatch

    // Process one element
    data_buffer.data[idx] = sin(data_buffer.data[idx] + params.time);
}
```

**Key GLSL built-ins for compute:**

| Variable | Type | Description |
|----------|------|-------------|
| `gl_GlobalInvocationID` | `uvec3` | Unique thread ID across all work groups |
| `gl_LocalInvocationID` | `uvec3` | Thread ID within the work group |
| `gl_WorkGroupID` | `uvec3` | Work group ID |
| `gl_WorkGroupSize` | `uvec3` | Matches `local_size_*` |
| `gl_NumWorkGroups` | `uvec3` | Total work groups dispatched |

---

## 8. RenderingDevice API Walkthrough

### Step-by-Step: Running a Compute Shader from GDScript

```gdscript
# compute_runner.gd
extends Node

var rd: RenderingDevice
var shader_rid: RID
var pipeline_rid: RID
var storage_buffer_rid: RID
var uniform_set_rid: RID

const ELEMENT_COUNT: int = 1024
const WORK_GROUP_SIZE: int = 256

func _ready() -> void:
    # Step 1: Get a RenderingDevice
    # Use the global one to share with the renderer, or create a local one
    rd = RenderingServer.get_rendering_device()

    # Step 2: Load and compile the GLSL shader
    var shader_file: RDShaderFile = load("res://shaders/my_compute.glsl") as RDShaderFile
    var shader_spirv: RDShaderSPIRV = shader_file.get_spirv()
    shader_rid = rd.shader_create_from_spirv(shader_spirv)

    # Step 3: Create a compute pipeline
    pipeline_rid = rd.compute_pipeline_create(shader_rid)

    # Step 4: Prepare input data
    var input_data: PackedFloat32Array = PackedFloat32Array()
    input_data.resize(ELEMENT_COUNT)
    for i in ELEMENT_COUNT:
        input_data[i] = float(i)
    var input_bytes: PackedByteArray = input_data.to_byte_array()

    # Step 5: Create a storage buffer on the GPU
    storage_buffer_rid = rd.storage_buffer_create(input_bytes.size(), input_bytes)

    # Step 6: Create a uniform (descriptor) pointing to the buffer
    var uniform := RDUniform.new()
    uniform.uniform_type = RenderingDevice.UNIFORM_TYPE_STORAGE_BUFFER
    uniform.binding = 0
    uniform.add_id(storage_buffer_rid)

    # Step 7: Create a uniform set (bound to set = 0)
    uniform_set_rid = rd.uniform_set_create([uniform], shader_rid, 0)


func run_compute() -> PackedFloat32Array:
    # Step 8: Begin a compute list (command recording)
    var compute_list: int = rd.compute_list_begin()
    rd.compute_list_bind_compute_pipeline(compute_list, pipeline_rid)
    rd.compute_list_bind_uniform_set(compute_list, uniform_set_rid, 0)

    # Step 9: Dispatch work groups
    # Total threads = work_groups * local_size = (4 * 256) = 1024
    var work_groups: int = ceili(float(ELEMENT_COUNT) / float(WORK_GROUP_SIZE))
    rd.compute_list_dispatch(compute_list, work_groups, 1, 1)
    rd.compute_list_end()

    # Step 10: Submit and sync (blocks until GPU finishes)
    rd.submit()
    rd.sync()

    # Step 11: Read back results
    var output_bytes: PackedByteArray = rd.buffer_get_data(storage_buffer_rid)
    return output_bytes.to_float32_array()


func _exit_tree() -> void:
    # CRITICAL: Free GPU resources manually — RenderingDevice doesn't auto-free
    if rd != null:
        rd.free_rid(uniform_set_rid)
        rd.free_rid(storage_buffer_rid)
        rd.free_rid(pipeline_rid)
        rd.free_rid(shader_rid)
```

### C# Equivalent (Key Differences)

```csharp
using Godot;

public partial class ComputeRunner : Node
{
    private RenderingDevice _rd;
    private Rid _shaderRid;
    private Rid _pipelineRid;
    private Rid _storageBufferRid;
    private Rid _uniformSetRid;

    private const int ElementCount = 1024;
    private const int WorkGroupSize = 256;

    public override void _Ready()
    {
        _rd = RenderingServer.GetRenderingDevice();

        var shaderFile = GD.Load<RdShaderFile>("res://shaders/my_compute.glsl");
        var spirv = shaderFile.GetSpirv();
        _shaderRid = _rd.ShaderCreateFromSpirv(spirv);
        _pipelineRid = _rd.ComputePipelineCreate(_shaderRid);

        // Prepare data
        var inputData = new float[ElementCount];
        for (int i = 0; i < ElementCount; i++)
            inputData[i] = i;

        byte[] inputBytes = new byte[ElementCount * sizeof(float)];
        System.Buffer.BlockCopy(inputData, 0, inputBytes, 0, inputBytes.Length);

        _storageBufferRid = _rd.StorageBufferCreate((uint)inputBytes.Length, inputBytes);

        var uniform = new RDUniform();
        uniform.UniformType = RenderingDevice.UniformType.StorageBuffer;
        uniform.Binding = 0;
        uniform.AddId(_storageBufferRid);

        _uniformSetRid = _rd.UniformSetCreate(
            new Godot.Collections.Array<RDUniform> { uniform }, _shaderRid, 0);
    }

    public override void _ExitTree()
    {
        _rd?.FreeRid(_uniformSetRid);
        _rd?.FreeRid(_storageBufferRid);
        _rd?.FreeRid(_pipelineRid);
        _rd?.FreeRid(_shaderRid);
    }
}
```

---

## 9. Compute Shader Patterns

### Pattern: GPU Boid Simulation

GLSL shader (`boids_compute.glsl`):

```glsl
#[compute]
#version 450

layout(local_size_x = 64, local_size_y = 1, local_size_z = 1) in;

struct Boid {
    vec2 position;
    vec2 velocity;
};

layout(set = 0, binding = 0, std430) restrict buffer BoidBuffer {
    Boid boids[];
} boid_buffer;

layout(set = 0, binding = 1, std430) restrict buffer Params {
    float delta_time;
    uint boid_count;
    float separation_radius;
    float alignment_radius;
    float cohesion_radius;
    float max_speed;
    float separation_weight;
    float alignment_weight;
    float cohesion_weight;
} params;

void main() {
    uint idx = gl_GlobalInvocationID.x;
    if (idx >= params.boid_count) return;

    Boid self = boid_buffer.boids[idx];
    vec2 separation = vec2(0.0);
    vec2 alignment = vec2(0.0);
    vec2 cohesion = vec2(0.0);
    uint sep_count = 0u;
    uint align_count = 0u;
    uint coh_count = 0u;

    for (uint i = 0u; i < params.boid_count; i++) {
        if (i == idx) continue;
        Boid other = boid_buffer.boids[i];
        float dist = distance(self.position, other.position);

        if (dist < params.separation_radius) {
            separation += (self.position - other.position) / max(dist, 0.001);
            sep_count++;
        }
        if (dist < params.alignment_radius) {
            alignment += other.velocity;
            align_count++;
        }
        if (dist < params.cohesion_radius) {
            cohesion += other.position;
            coh_count++;
        }
    }

    vec2 accel = vec2(0.0);
    if (sep_count > 0u) accel += normalize(separation) * params.separation_weight;
    if (align_count > 0u) accel += normalize(alignment / float(align_count)) * params.alignment_weight;
    if (coh_count > 0u) accel += normalize(cohesion / float(coh_count) - self.position) * params.cohesion_weight;

    self.velocity += accel * params.delta_time;
    float speed = length(self.velocity);
    if (speed > params.max_speed) {
        self.velocity = normalize(self.velocity) * params.max_speed;
    }
    self.position += self.velocity * params.delta_time;

    boid_buffer.boids[idx] = self;
}
```

### Pattern: Compute Texture Generation

Generate a noise texture on the GPU and use it in a spatial shader:

```glsl
#[compute]
#version 450

layout(local_size_x = 8, local_size_y = 8, local_size_z = 1) in;

// Write to an image instead of a buffer
layout(rgba8, set = 0, binding = 0) uniform restrict writeonly image2D output_image;

layout(set = 0, binding = 1, std430) restrict buffer Params {
    float time;
    float scale;
} params;

// Simple hash for noise
float hash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

float value_noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    f = f * f * (3.0 - 2.0 * f); // smoothstep

    float a = hash(i);
    float b = hash(i + vec2(1.0, 0.0));
    float c = hash(i + vec2(0.0, 1.0));
    float d = hash(i + vec2(1.0, 1.0));

    return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}

void main() {
    ivec2 coord = ivec2(gl_GlobalInvocationID.xy);
    ivec2 size = imageSize(output_image);
    if (coord.x >= size.x || coord.y >= size.y) return;

    vec2 uv = vec2(coord) / vec2(size);
    float n = value_noise(uv * params.scale + vec2(params.time));

    imageStore(output_image, coord, vec4(n, n, n, 1.0));
}
```

---

## 10. Integrating Compute Output with Rendering

### Method 1: Storage Buffer → MultiMesh

Use compute results to position thousands of instances:

```gdscript
func update_multimesh_from_compute(positions: PackedFloat32Array) -> void:
    var multimesh: MultiMesh = $MultiMeshInstance3D.multimesh
    var count: int = positions.size() / 2  # x, y pairs
    multimesh.instance_count = count

    for i in count:
        var t := Transform3D.IDENTITY
        t.origin = Vector3(positions[i * 2], 0.0, positions[i * 2 + 1])
        multimesh.set_instance_transform(i, t)
```

### Method 2: Compute Image → Shader Texture

```gdscript
# After compute dispatch, the image texture is already on the GPU.
# Assign it to a ShaderMaterial parameter:
var texture_rd: RID = rd.texture_create(format, view, [])
# ... dispatch compute that writes to texture_rd ...

# Create a Texture2DRD that wraps the RenderingDevice texture
var shared_texture := Texture2DRD.new()
shared_texture.texture_rd_rid = texture_rd

# Assign to material
material.set_shader_parameter("compute_output", shared_texture)
```

---

## 11. Performance Considerations

### Work Group Sizing

| GPU Vendor | Optimal local_size | Notes |
|------------|--------------------|-------|
| NVIDIA | 32, 64, 128, 256 | Warp size = 32. Multiples of 32 avoid idle threads |
| AMD | 64, 128, 256 | Wavefront = 64 |
| Mobile (Adreno/Mali) | 64, 128 | Smaller groups for power efficiency |

**Rule of thumb:** Start with `local_size_x = 256` for 1D work, `local_size_x = 8, local_size_y = 8` for 2D (64 total).

### Avoiding GPU Stalls

```gdscript
# BAD: Dispatch + sync every frame blocks the CPU
func _process(delta: float) -> void:
    dispatch_compute()
    rd.submit()
    rd.sync()       # CPU waits for GPU — kills framerate
    read_results()

# GOOD: Double-buffer — read last frame's results while this frame computes
var current_buffer: int = 0

func _process(delta: float) -> void:
    var read_buffer: int = 1 - current_buffer
    var results: PackedByteArray = rd.buffer_get_data(buffers[read_buffer])
    # Use results from last frame (one frame of latency, no stall)

    dispatch_compute_to(buffers[current_buffer])
    rd.submit()
    # Don't sync — let GPU work asynchronously
    current_buffer = 1 - current_buffer
```

### Memory Alignment

GLSL `std430` layout rules:

| Type | Alignment | Size |
|------|-----------|------|
| `float` | 4 | 4 |
| `vec2` | 8 | 8 |
| `vec3` | 16 | 12 |
| `vec4` | 16 | 16 |
| `int` / `uint` | 4 | 4 |

**Warning:** `vec3` has 16-byte alignment but 12-byte size. In structs, this creates implicit padding. Prefer `vec4` (and ignore `.w`) or manually pad with a `float _pad` field to keep GDScript byte arrays aligned.

---

## 12. Common Mistakes

### Spatial Shaders

| Mistake | Fix |
|---------|-----|
| Using `VERTEX` in fragment() expecting model space | In fragment(), `VERTEX` is in **view space**. Use `INV_VIEW_MATRIX * vec4(VERTEX, 1.0)` for world space |
| Writing to `ALPHA` without transparency render mode | Alpha blending needs `render_mode blend_mix` or similar |
| Custom `light()` replaces ALL lighting | If you define `light()`, Godot skips built-in PBR lighting entirely. You must implement diffuse + specular yourself |
| Reading `SCREEN_TEXTURE` on mobile | Not available on Mobile renderer. Use `hint_screen_texture` uniform |

### Compute Shaders

| Mistake | Fix |
|---------|-----|
| Forgetting `free_rid()` on exit | RenderingDevice never auto-frees. Leaking RIDs crashes after many runs |
| `vec3` padding in storage buffers | Use `vec4` or add manual padding floats to match `std430` alignment |
| Dispatching too few work groups | Calculate: `ceili(element_count / local_size)`. Under-dispatch skips elements silently |
| Calling `rd.sync()` every frame | Use double-buffering or only sync when you actually need the results |
| Using compute on Mobile renderer | Compute requires Forward+ or a local `RenderingDevice`. Mobile renderer has no compute support |
| Not checking `idx >= count` in shader | Over-dispatch threads write garbage to random memory |

---

## Further Reading

- [Godot 4.4 Spatial Shader Reference](https://docs.godotengine.org/en/4.4/tutorials/shaders/shader_reference/spatial_shader.html)
- [Godot 4.4 Compute Shader Tutorial](https://docs.godotengine.org/en/4.4/tutorials/shaders/compute_shaders.html)
- [Godot 4.4 RenderingDevice API](https://docs.godotengine.org/en/4.4/classes/class_renderingdevice.html)
- [Godot 4.4 Volumetric Fog](https://docs.godotengine.org/en/4.4/tutorials/3d/volumetric_fog.html)
- [G12 — Shaders & Visual Effects (2D Focus)](./G12_shaders_and_visual_effects.md)
- [G18 — Performance Profiling](./G18_performance_profiling.md)
