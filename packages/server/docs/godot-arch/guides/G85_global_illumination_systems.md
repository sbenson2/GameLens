# G85 — Global Illumination Systems

> **Category:** guide · **Engine:** Godot 4.x · **Related:** [G12 Shaders & Visual Effects](./G12_shaders_and_visual_effects.md) · [G18 Performance Profiling](./G18_performance_profiling.md) · [G36 Compositor Effects](./G36_compositor_effects.md) · [G24 Terrain & Open World](./G24_terrain_and_open_world.md)

Godot 4 provides three global illumination (GI) systems — **LightmapGI**, **VoxelGI**, and **SDFGI** — each with different tradeoffs between quality, performance, flexibility, and dynamic object support. This guide covers when to use each, how to set them up, performance tuning, and combining them for best results.

---

## Table of Contents

1. [GI at a Glance](#1-gi-at-a-glance)
2. [WorldEnvironment Setup](#2-worldenvironment-setup)
3. [LightmapGI — Baked Indirect Lighting](#3-lightmapgi--baked-indirect-lighting)
4. [VoxelGI — Real-Time Volumetric GI](#4-voxelgi--real-time-volumetric-gi)
5. [SDFGI — Signed Distance Field GI](#5-sdfgi--signed-distance-field-gi)
6. [Comparison Table](#6-comparison-table)
7. [Light Probes and Dynamic Objects](#7-light-probes-and-dynamic-objects)
8. [Combining GI Techniques](#8-combining-gi-techniques)
9. [Performance Tuning](#9-performance-tuning)
10. [Common Mistakes and Fixes](#10-common-mistakes-and-fixes)

---

## 1. GI at a Glance

Direct lighting (sun, point lights, spotlights) only illuminates surfaces directly hit by light rays. Global illumination simulates light bouncing off surfaces to illuminate other surfaces indirectly. Without GI, shadowed areas appear flat and unrealistic.

```
Direct only:          With GI:
┌─────────────┐       ┌─────────────┐
│ ☀ → ██████  │       │ ☀ → ██████  │
│     ██  ██  │       │     ██▒▒██  │
│     ██  ██  │       │     ██▒▒██  │
│     ██████  │       │     ██████  │
│     (dark)  │       │   (bounced) │
└─────────────┘       └─────────────┘
```

---

## 2. WorldEnvironment Setup

All GI systems require a `WorldEnvironment` node with an `Environment` resource. SDFGI and VoxelGI settings live on the Environment resource itself; LightmapGI is a separate node.

### GDScript

```gdscript
# Create environment programmatically (usually done in the editor)
func setup_environment() -> void:
    var env := Environment.new()
    env.background_mode = Environment.BG_SKY
    env.ambient_light_source = Environment.AMBIENT_SOURCE_BG
    env.ambient_light_energy = 0.5
    
    # Tone mapping (use AGX on 4.4+ for best results)
    env.tonemap_mode = Environment.TONE_MAPPER_FILMIC  # or TONE_MAP_LINEAR, TONE_MAP_ACES
    
    var world_env := WorldEnvironment.new()
    world_env.environment = env
    add_child(world_env)
```

### C#

```csharp
public void SetupEnvironment()
{
    var env = new Godot.Environment();
    env.BackgroundMode = Godot.Environment.BGModeEnum.Sky;
    env.AmbientLightSource = Godot.Environment.AmbientSourceEnum.Bg;
    env.AmbientLightEnergy = 0.5f;
    env.TonemapMode = Godot.Environment.ToneMapperEnum.Filmic;

    var worldEnv = new WorldEnvironment();
    worldEnv.Environment = env;
    AddChild(worldEnv);
}
```

---

## 3. LightmapGI — Baked Indirect Lighting

LightmapGI pre-computes indirect lighting into texture atlases at edit time. It produces the highest-quality static GI and is the most performant at runtime because the computation is already done.

### When to Use

- Static or mostly-static scenes (architecture, levels)
- Mobile and low-end hardware
- When you need the best visual quality for indirect light
- When dynamic light changes are not needed at runtime

### Setup

1. Add a `LightmapGI` node to your scene.
2. Ensure meshes have **UV2** (lightmap UVs). In the import settings for `.glb`/`.gltf`, enable **Generate Lightmap UV2**.
3. Set `GeometryInstance3D.gi_mode` to `GI_MODE_STATIC` on meshes that should contribute to the bake.
4. Click **Bake Lightmaps** in the 3D editor toolbar.

### GDScript — Configuring Bake Quality

```gdscript
# Configure LightmapGI from script (usually done in Inspector)
@onready var lightmap: LightmapGI = $LightmapGI

func configure_lightmap() -> void:
    # Texel density — smaller = more detail, longer bake
    lightmap.texel_scale = 1.0  # Default; 0.5 = half resolution, 2.0 = double
    
    # Quality preset
    lightmap.quality = LightmapGI.BAKE_QUALITY_HIGH
    
    # Bounces — more = more realistic, longer bake
    lightmap.bounces = 3
    
    # Use denoiser for cleaner results
    lightmap.use_denoiser = true
    lightmap.denoiser_strength = 0.1
    
    # Directional lightmaps store light direction for normal-mapped surfaces
    lightmap.directional = true
```

### C#

```csharp
public void ConfigureLightmap()
{
    var lightmap = GetNode<LightmapGI>("LightmapGI");
    lightmap.TexelScale = 1.0f;
    lightmap.Quality = LightmapGI.BakeQualityEnum.High;
    lightmap.Bounces = 3;
    lightmap.UseDenoiser = true;
    lightmap.DenoiserStrength = 0.1f;
    lightmap.Directional = true;
}
```

### Light Probes for Dynamic Objects

Baked lightmaps only affect static geometry. Dynamic objects (characters, items) need **light probes** to receive approximate indirect lighting:

```gdscript
# Light probes are automatically placed by LightmapGI
# Set dynamic objects to use probes:
func setup_dynamic_object(mesh: MeshInstance3D) -> void:
    mesh.gi_mode = GeometryInstance3D.GI_MODE_DYNAMIC
```

### Limitations

- Bake times can be long for large scenes.
- No runtime light changes — moving the sun invalidates the bake.
- Requires UV2 on all participating meshes.
- Increased disk/memory usage for lightmap textures.

---

## 4. VoxelGI — Real-Time Volumetric GI

VoxelGI voxelizes the scene into a 3D grid and traces light through it in real time. It supports dynamic lights and (partially) dynamic geometry.

### When to Use

- Small to medium indoor scenes
- Scenes with dynamic lighting (flickering torches, color-changing lights)
- When real-time indirect lighting changes are required
- Development/prototyping where bake iteration is too slow

### Setup

1. Add a `VoxelGI` node to the scene.
2. Adjust the **Extents** to cover the area where GI is needed.
3. Set meshes to `GI_MODE_STATIC` (they contribute to the voxelization).
4. Click **Bake VoxelGI** in the 3D toolbar.

### GDScript

```gdscript
@onready var voxel_gi: VoxelGI = $VoxelGI

func configure_voxel_gi() -> void:
    # Extents define the bounding box (half-size in each axis)
    voxel_gi.size = Vector3(20.0, 10.0, 20.0)
    
    # Subdivision — higher = more detail, more VRAM
    # 64, 128, 256, or 512
    voxel_gi.subdiv = VoxelGI.SUBDIV_128
    
    # Dynamic objects can receive indirect light from the voxel grid
    # Set them to GI_MODE_DYNAMIC in the Inspector
```

### C#

```csharp
public void ConfigureVoxelGI()
{
    var voxelGi = GetNode<VoxelGI>("VoxelGI");
    voxelGi.Size = new Vector3(20.0f, 10.0f, 20.0f);
    voxelGi.Subdiv = VoxelGI.SubdivEnum.Subdiv128;
}
```

### Runtime Light Changes

VoxelGI responds to dynamic light changes in real time — moving a light, changing its color, or toggling it on/off immediately updates the indirect lighting. The voxel grid itself must be re-baked if static geometry changes.

### Limitations

- Covers a fixed volume — not suitable for large open worlds.
- Higher VRAM usage at higher subdivisions.
- Light leaking at thin walls (voxel resolution too coarse).
- Does not support the Compatibility renderer.

---

## 5. SDFGI — Signed Distance Field GI

SDFGI generates a cascaded signed distance field from your scene and traces indirect light through it. It requires no baking, follows the camera automatically, and scales to any world size.

### When to Use

- Large outdoor scenes and open worlds
- Scenes where the camera moves freely through a large area
- When you need "set it and forget it" GI without baking
- Forward+ renderer only

### Setup

Enable SDFGI on the `Environment` resource:

### GDScript

```gdscript
func enable_sdfgi(env: Environment) -> void:
    env.sdfgi_enabled = true
    
    # Cascades — more = larger area coverage, more GPU cost
    # Range: 1–8, default 4
    env.sdfgi_cascades = 4
    
    # Min cell size — smaller = more detail, more GPU cost
    env.sdfgi_min_cell_size = 0.2
    
    # Use occlusion to reduce light leaking through thin geometry
    env.sdfgi_use_occlusion = true
    
    # Read sky light for outdoor scenes
    env.sdfgi_read_sky_light = true
    
    # Bounce feedback — 0.0 = single bounce, 0.5 = multi-bounce
    env.sdfgi_bounce_feedback = 0.5
    
    # Half resolution for performance (may alias on thin geometry)
    env.sdfgi_half_resolution = false
    
    # Energy — scales brightness of indirect light
    env.sdfgi_energy = 1.0
```

### C#

```csharp
public void EnableSdfgi(Godot.Environment env)
{
    env.SdfgiEnabled = true;
    env.SdfgiCascades = 4;
    env.SdfgiMinCellSize = 0.2f;
    env.SdfgiUseOcclusion = true;
    env.SdfgiReadSkyLight = true;
    env.SdfgiBounceFeedback = 0.5f;
    env.SdfgiHalfResolution = false;
    env.SdfgiEnergy = 1.0f;
}
```

### How Cascades Work

SDFGI uses cascading volumes centered on the camera, each twice the size of the previous:

```
Cascade 0: 4m  radius — high detail near camera
Cascade 1: 8m  radius — medium detail
Cascade 2: 16m radius — low detail
Cascade 3: 32m radius — distant indirect light
```

The `min_cell_size` controls Cascade 0's resolution. Lower values give finer detail but cost more GPU time.

### Limitations

- Forward+ renderer only — not available in Mobile or Compatibility.
- Does not support dynamic occluders — only static geometry blocks indirect light.
- Most GPU-demanding GI technique in Godot.
- Light leaking possible at thin walls; `use_occlusion` helps but costs performance.

---

## 6. Comparison Table

| Feature | LightmapGI | VoxelGI | SDFGI |
|---------|-----------|---------|-------|
| **Bake required** | Yes (offline) | Yes (fast, editor) | No |
| **Dynamic lights** | No | Yes | Yes (not occluders) |
| **Dynamic geometry** | Via probes only | Partial | Via probes only |
| **Scene scale** | Any | Small–Medium | Any |
| **Quality** | Highest | Good | Good |
| **Runtime cost** | Lowest | Medium | Highest |
| **VRAM cost** | Medium (textures) | High (3D grid) | High (cascades) |
| **Renderer** | Forward+, Mobile, Compat | Forward+, Mobile | Forward+ only |
| **Best for** | Static scenes, mobile | Indoor, dynamic lights | Open world, outdoors |

---

## 7. Light Probes and Dynamic Objects

All three GI systems need a way to light dynamic objects (characters, physics objects, items) that aren't part of the baked/voxelized data.

### GeometryInstance3D.gi_mode

| Mode | Meaning |
|------|---------|
| `GI_MODE_DISABLED` | Object neither contributes to nor receives GI |
| `GI_MODE_STATIC` | Object contributes to GI bake/voxelization and receives it |
| `GI_MODE_DYNAMIC` | Object receives GI from probes but does not contribute to bake |

```gdscript
# Static level geometry
$WallMesh.gi_mode = GeometryInstance3D.GI_MODE_STATIC

# Player character — receives indirect light from probes
$PlayerMesh.gi_mode = GeometryInstance3D.GI_MODE_DYNAMIC
```

```csharp
GetNode<MeshInstance3D>("WallMesh").GiMode = GeometryInstance3D.GIModeEnum.Static;
GetNode<MeshInstance3D>("PlayerMesh").GiMode = GeometryInstance3D.GIModeEnum.Dynamic;
```

---

## 8. Combining GI Techniques

You can use multiple GI systems in the same project by assigning different techniques to different areas:

### Indoor + Outdoor Hybrid

- **Outdoors:** SDFGI for large-scale indirect lighting.
- **Indoors:** VoxelGI nodes covering each room for better quality and dynamic light support.
- **Static areas:** LightmapGI for hero rooms or cutscene environments where quality matters most.

Use `Camera3D` environment overrides or `WorldEnvironment` swapping when transitioning between areas:

```gdscript
# Swap environment when entering a building
func _on_building_area_entered(_body: Node3D) -> void:
    var indoor_env: Environment = preload("res://environments/indoor.tres")
    $WorldEnvironment.environment = indoor_env  # VoxelGI, no SDFGI

func _on_building_area_exited(_body: Node3D) -> void:
    var outdoor_env: Environment = preload("res://environments/outdoor.tres")
    $WorldEnvironment.environment = outdoor_env  # SDFGI enabled
```

---

## 9. Performance Tuning

### LightmapGI

- Increase `texel_scale` to reduce lightmap resolution (faster bake, less memory).
- Reduce `bounces` to 1–2 for faster bakes during iteration.
- Disable `directional` if normal maps aren't critical.

### VoxelGI

- Use `SUBDIV_64` during development, `SUBDIV_128` or `SUBDIV_256` for release.
- Keep the volume as small as possible — don't cover areas the camera never reaches.
- Multiple small VoxelGI nodes are better than one giant one.

### SDFGI

- Enable `sdfgi_half_resolution` for 30–40% GPU savings.
- Reduce `sdfgi_cascades` from 4 to 2–3 for tighter scenes.
- Increase `sdfgi_min_cell_size` to reduce detail (and cost).
- Enable `sdfgi_use_occlusion` only if you see light leaking — it adds GPU cost.

### Monitoring Performance

```gdscript
func _process(_delta: float) -> void:
    var gpu_time: float = Performance.get_monitor(Performance.RENDER_GPU_FRAME_TIME)
    if gpu_time > 16.0:  # Above 60 FPS budget
        push_warning("GPU frame time %.1f ms — consider reducing GI quality" % gpu_time)
```

---

## 10. Common Mistakes and Fixes

### Light leaking through thin walls

**Cause:** Voxel or SDF resolution is too coarse relative to wall thickness.
**Fix:** Increase subdivision (VoxelGI) or decrease `min_cell_size` (SDFGI). Alternatively, thicken walls to at least 2× the cell size.

### Dynamic objects appear unlit

**Cause:** `gi_mode` is set to `DISABLED` or `STATIC` on a moving object.
**Fix:** Set to `GI_MODE_DYNAMIC`. For LightmapGI, ensure light probes are placed in the area.

### SDFGI shows no effect

**Cause:** Using the Mobile or Compatibility renderer.
**Fix:** SDFGI requires Forward+. Switch in Project Settings → Rendering → Renderer.

### Baked lightmaps look blotchy

**Cause:** UV2 is missing or overlapping.
**Fix:** Re-import meshes with "Generate Lightmap UV2" enabled. Check UV2 layout in the mesh import preview.

### VoxelGI shows GI outside its volume

**Cause:** Mismatched extents or overlapping VoxelGI nodes.
**Fix:** Ensure VoxelGI extents tightly cover the intended area. Avoid overlapping volumes.
