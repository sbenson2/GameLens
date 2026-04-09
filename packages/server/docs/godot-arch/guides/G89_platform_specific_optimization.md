# G89 — Platform-Specific Optimization Strategies

> **Category:** guide · **Engine:** Godot 4.x · **Related:** [G18 Performance Profiling](./G18_performance_profiling.md) · [G22 Mobile & Web Export](./G22_mobile_and_web_export.md) · [G84 Memory Management & Optimization](./G84_memory_management_and_optimization.md) · [G85 Global Illumination Systems](./G85_global_illumination_systems.md) · [G39 Scalable Architecture & Pooling](./G39_scalable_architecture_and_pooling.md)

---

## What This Guide Covers

How to **scale your game's performance across desktop, mobile, and web** — setting per-platform rendering budgets, choosing the right renderer, tuning draw calls, managing memory, and building quality-tier systems that adapt at runtime.

**Use this guide when:** you're shipping to multiple platforms and need concrete budgets and techniques for each, or your game runs well on desktop but struggles on mobile or web.

**G18** covers general profiling tools and workflows. **G22** covers export configuration. **G84** covers memory management. This guide bridges them with platform-specific budgets, renderer selection, and adaptive quality systems.

---

## Table of Contents

1. [Platform Performance Budgets](#1-platform-performance-budgets)
2. [Choosing the Right Renderer](#2-choosing-the-right-renderer)
3. [Draw Call Optimization](#3-draw-call-optimization)
4. [LOD Systems](#4-lod-systems)
5. [Texture and Asset Optimization](#5-texture-and-asset-optimization)
6. [Shader Complexity Management](#6-shader-complexity-management)
7. [Adaptive Quality System](#7-adaptive-quality-system)
8. [Mobile-Specific Techniques](#8-mobile-specific-techniques)
9. [Web-Specific Techniques](#9-web-specific-techniques)
10. [Desktop Scaling (Steam Deck, Low-End PCs)](#10-desktop-scaling-steam-deck-low-end-pcs)
11. [Profiling Per Platform](#11-profiling-per-platform)
12. [Common Mistakes](#12-common-mistakes)

---

## 1. Platform Performance Budgets

Set concrete targets **before** building content. These are starting points — adjust based on your genre and art style.

| Metric | Desktop (60 fps) | Steam Deck (40–60 fps) | Mobile (30 fps) | Web (30–60 fps) |
|---|---|---|---|---|
| Frame budget | 16.6 ms | 16.6–25 ms | 33.3 ms | 16.6–33.3 ms |
| Draw calls | < 2000 | < 1000 | < 300 | < 500 |
| Triangles/frame | < 2M | < 500K | < 100K | < 300K |
| Texture memory | < 2 GB | < 1 GB | < 256 MB | < 512 MB |
| Shader instructions (frag) | < 256 | < 128 | < 64 | < 96 |
| Active particles | < 5000 | < 2000 | < 500 | < 1000 |
| Physics bodies | < 500 | < 200 | < 100 | < 150 |

> **Why these numbers?** Mobile GPUs (Adreno, Mali, Apple GPU) are tile-based deferred renderers with limited bandwidth. Web runs inside a browser sandbox with WebGL 2 or WebGPU limitations. Desktop GPUs are immediate-mode with dedicated VRAM.

---

## 2. Choosing the Right Renderer

Godot 4.x offers three rendering backends. Choose based on your target platform.

| Renderer | API | Best For | Limitations |
|---|---|---|---|
| **Forward+** | Vulkan / D3D12 | Desktop, console, high-end | Heavy on mobile, no web support |
| **Mobile** | Vulkan / D3D12 | Mobile, Steam Deck, low-end desktop | Fewer post-processing features |
| **Compatibility** | OpenGL 3.3 / WebGL 2 | Web, very old hardware | No compute shaders, limited effects |

### Setting Renderer Per Export

In `project.godot`:

```ini
[rendering]
renderer/rendering_method="forward_plus"

# Override for specific exports in the export preset:
# Mobile export -> "mobile"
# Web export -> "gl_compatibility"
```

### Runtime Renderer Detection

```gdscript
func _ready() -> void:
	var renderer: String = ProjectSettings.get_setting("rendering/renderer/rendering_method")
	match renderer:
		"forward_plus":
			_apply_desktop_settings()
		"mobile":
			_apply_mobile_settings()
		"gl_compatibility":
			_apply_web_settings()
```

```csharp
public override void _Ready()
{
    string renderer = (string)ProjectSettings.GetSetting("rendering/renderer/rendering_method");
    switch (renderer)
    {
        case "forward_plus": ApplyDesktopSettings(); break;
        case "mobile": ApplyMobileSettings(); break;
        case "gl_compatibility": ApplyWebSettings(); break;
    }
}
```

---

## 3. Draw Call Optimization

Every unique material + mesh combination = 1 draw call. Reducing draw calls is the single highest-impact optimization on mobile.

### Techniques by Impact

| Technique | Draw Call Reduction | Effort | Notes |
|---|---|---|---|
| **MultiMeshInstance3D** | 100→1 for identical objects | Low | Grass, trees, props, bullets |
| **Mesh merging** (MeshLibrary) | Combines static geometry | Medium | Bake at export time or use `MeshInstance3D.merge_meshes()` |
| **Texture atlases** | Eliminates material switches | Medium | Combine textures into a single atlas |
| **Visibility culling** | Skips off-screen objects | Low | `VisibleOnScreenNotifier3D` / `OccluderInstance3D` |
| **Distance culling** | Hides far objects entirely | Low | `visibility_range_end` on `GeometryInstance3D` |

### MultiMesh Example

```gdscript
# Scatter 1000 trees with a single draw call
func _ready() -> void:
	var mm := MultiMesh.new()
	mm.mesh = preload("res://assets/tree_lod0.mesh")
	mm.transform_format = MultiMesh.TRANSFORM_3D
	mm.instance_count = 1000

	for i: int in mm.instance_count:
		var t := Transform3D.IDENTITY
		t.origin = Vector3(randf_range(-100, 100), 0, randf_range(-100, 100))
		t = t.rotated(Vector3.UP, randf() * TAU)
		mm.set_instance_transform(i, t)

	var mmi := MultiMeshInstance3D.new()
	mmi.multimesh = mm
	add_child(mmi)
```

```csharp
public override void _Ready()
{
    var mm = new MultiMesh
    {
        Mesh = GD.Load<Mesh>("res://assets/tree_lod0.mesh"),
        TransformFormat = MultiMesh.TransformFormatEnum.Transform3D,
        InstanceCount = 1000
    };

    var rng = new RandomNumberGenerator();
    for (int i = 0; i < mm.InstanceCount; i++)
    {
        var t = Transform3D.Identity;
        t.Origin = new Vector3(rng.RandfRange(-100, 100), 0, rng.RandfRange(-100, 100));
        t = t.Rotated(Vector3.Up, rng.Randf() * Mathf.Tau);
        mm.SetInstanceTransform(i, t);
    }

    var mmi = new MultiMeshInstance3D { Multimesh = mm };
    AddChild(mmi);
}
```

---

## 4. LOD Systems

### Automatic LOD with `visibility_range`

Godot 4.x supports distance-based LOD on any `GeometryInstance3D`:

```gdscript
# Attach LOD levels to a parent node
# LOD0 (high detail): 0–30 meters
@onready var lod0: MeshInstance3D = $MeshLOD0
# LOD1 (medium detail): 30–80 meters
@onready var lod1: MeshInstance3D = $MeshLOD1
# LOD2 (low detail): 80–200 meters
@onready var lod2: MeshInstance3D = $MeshLOD2

func _ready() -> void:
	lod0.visibility_range_begin = 0.0
	lod0.visibility_range_end = 30.0
	lod0.visibility_range_fade_mode = GeometryInstance3D.VISIBILITY_RANGE_FADE_SELF

	lod1.visibility_range_begin = 30.0
	lod1.visibility_range_end = 80.0
	lod1.visibility_range_fade_mode = GeometryInstance3D.VISIBILITY_RANGE_FADE_SELF

	lod2.visibility_range_begin = 80.0
	lod2.visibility_range_end = 200.0
	lod2.visibility_range_fade_mode = GeometryInstance3D.VISIBILITY_RANGE_FADE_SELF
```

### Adjusting LOD Distances Per Platform

```gdscript
## Scale LOD distances based on platform capability
func adjust_lod_for_platform(node: GeometryInstance3D, quality: float) -> void:
	# quality: 1.0 = desktop, 0.5 = mobile (shows lower LODs sooner)
	node.visibility_range_begin *= quality
	node.visibility_range_end *= quality
```

---

## 5. Texture and Asset Optimization

### Texture Compression by Platform

| Platform | Format | Godot Setting | Notes |
|---|---|---|---|
| Desktop (Vulkan) | BC1–BC7 (S3TC/BPTC) | Default for desktop exports | Best quality/size ratio |
| Mobile (Android) | ETC2 / ASTC | Enable in export preset | ASTC preferred on modern GPUs |
| Mobile (iOS) | ASTC | Enable in export preset | Hardware-accelerated decoding |
| Web | ETC2 or S3TC | Depends on WebGL extensions | Test on target browsers |

### Mipmap Streaming (Godot 4.x)

For large open-world games, enable texture streaming to avoid loading full-resolution textures for distant objects:

```gdscript
# In project settings or per-texture import
# rendering/textures/default_filters/texture_mipmap_bias = 0.0
# Increase bias (e.g., 1.0) on mobile to force lower mip levels earlier
```

### Asset Size Budgets

```gdscript
# quality_settings.gd — Autoload
extends Node

## Maximum texture resolution per quality tier
var max_texture_size: Dictionary[String, int] = {
	"high": 4096,
	"medium": 2048,
	"low": 1024,
	"web": 1024,
}

## Shadow atlas size per tier
var shadow_atlas_size: Dictionary[String, int] = {
	"high": 8192,
	"medium": 4096,
	"low": 2048,
	"web": 2048,
}
```

---

## 6. Shader Complexity Management

### Mobile Shader Guidelines

- Avoid `discard` in fragment shaders (breaks early-Z on tile-based GPUs)
- Minimize texture samples per fragment (target ≤ 4 on mobile)
- Use `hint_screen_texture` sparingly — each use requires a framebuffer copy
- Prefer vertex-based calculations over per-pixel when possible

### Platform Shader Variants

```gdscript
# Use shader preprocessor to branch by platform
# In your .gdshader file:
shader_type spatial;

uniform bool use_high_quality = true;

void fragment() {
    vec3 base_color = texture(albedo_tex, UV).rgb;

    if (use_high_quality) {
        // Desktop: expensive normal mapping + parallax
        vec3 normal = texture(normal_tex, UV).rgb * 2.0 - 1.0;
        NORMAL_MAP = normal;
        // Parallax occlusion mapping...
    } else {
        // Mobile: simple diffuse only
        ALBEDO = base_color;
    }
}
```

### Setting Shader Quality at Runtime

```gdscript
func apply_shader_quality(material: ShaderMaterial, is_mobile: bool) -> void:
	material.set_shader_parameter("use_high_quality", not is_mobile)
```

```csharp
public void ApplyShaderQuality(ShaderMaterial material, bool isMobile)
{
    material.SetShaderParameter("use_high_quality", !isMobile);
}
```

---

## 7. Adaptive Quality System

Dynamically adjust rendering quality to maintain target framerate.

```gdscript
# adaptive_quality.gd — Autoload
extends Node

enum Tier { LOW, MEDIUM, HIGH, ULTRA }

@export var target_fps: float = 60.0
@export var check_interval: float = 2.0  # Seconds between quality adjustments

var current_tier: Tier = Tier.HIGH
var _timer: float = 0.0
var _frame_times: PackedFloat64Array = []

func _process(delta: float) -> void:
	_frame_times.append(delta)
	_timer += delta

	if _timer >= check_interval:
		_evaluate_and_adjust()
		_timer = 0.0
		_frame_times.clear()


func _evaluate_and_adjust() -> void:
	if _frame_times.is_empty():
		return

	# Use 95th percentile frame time to catch stutters
	var sorted: PackedFloat64Array = _frame_times.duplicate()
	sorted.sort()
	var p95_index: int = int(sorted.size() * 0.95)
	var p95_frame_time: float = sorted[mini(p95_index, sorted.size() - 1)]
	var p95_fps: float = 1.0 / maxf(p95_frame_time, 0.001)

	if p95_fps < target_fps * 0.85 and current_tier > Tier.LOW:
		# Performance is suffering — lower quality
		current_tier = (current_tier - 1) as Tier
		_apply_tier(current_tier)
	elif p95_fps > target_fps * 1.1 and current_tier < Tier.ULTRA:
		# Headroom available — raise quality
		current_tier = (current_tier + 1) as Tier
		_apply_tier(current_tier)


func _apply_tier(tier: Tier) -> void:
	var env: Environment = get_viewport().world_3d.environment
	match tier:
		Tier.LOW:
			env.ssao_enabled = false
			env.ssil_enabled = false
			env.ssr_enabled = false
			env.glow_enabled = false
			RenderingServer.viewport_set_msaa_3d(
				get_viewport().get_viewport_rid(), RenderingServer.VIEWPORT_MSAA_DISABLED
			)
			get_viewport().positional_shadow_atlas_size = 2048
		Tier.MEDIUM:
			env.ssao_enabled = true
			env.ssil_enabled = false
			env.ssr_enabled = false
			env.glow_enabled = true
			RenderingServer.viewport_set_msaa_3d(
				get_viewport().get_viewport_rid(), RenderingServer.VIEWPORT_MSAA_2X
			)
			get_viewport().positional_shadow_atlas_size = 4096
		Tier.HIGH:
			env.ssao_enabled = true
			env.ssil_enabled = true
			env.ssr_enabled = false
			env.glow_enabled = true
			RenderingServer.viewport_set_msaa_3d(
				get_viewport().get_viewport_rid(), RenderingServer.VIEWPORT_MSAA_4X
			)
			get_viewport().positional_shadow_atlas_size = 8192
		Tier.ULTRA:
			env.ssao_enabled = true
			env.ssil_enabled = true
			env.ssr_enabled = true
			env.glow_enabled = true
			RenderingServer.viewport_set_msaa_3d(
				get_viewport().get_viewport_rid(), RenderingServer.VIEWPORT_MSAA_8X
			)
			get_viewport().positional_shadow_atlas_size = 16384
	print("Quality tier changed to: %s" % Tier.keys()[tier])
```

```csharp
public partial class AdaptiveQuality : Node
{
    public enum Tier { Low, Medium, High, Ultra }

    [Export] public float TargetFps = 60f;
    [Export] public float CheckInterval = 2f;

    public Tier CurrentTier { get; private set; } = Tier.High;
    private readonly List<double> _frameTimes = new();
    private float _timer;

    public override void _Process(double delta)
    {
        _frameTimes.Add(delta);
        _timer += (float)delta;
        if (_timer >= CheckInterval)
        {
            EvaluateAndAdjust();
            _timer = 0f;
            _frameTimes.Clear();
        }
    }

    private void EvaluateAndAdjust()
    {
        if (_frameTimes.Count == 0) return;
        _frameTimes.Sort();
        int p95Index = (int)(_frameTimes.Count * 0.95);
        double p95Time = _frameTimes[Math.Min(p95Index, _frameTimes.Count - 1)];
        double p95Fps = 1.0 / Math.Max(p95Time, 0.001);

        if (p95Fps < TargetFps * 0.85 && CurrentTier > Tier.Low)
        {
            CurrentTier--;
            ApplyTier(CurrentTier);
        }
        else if (p95Fps > TargetFps * 1.1 && CurrentTier < Tier.Ultra)
        {
            CurrentTier++;
            ApplyTier(CurrentTier);
        }
    }

    private void ApplyTier(Tier tier)
    {
        var env = GetViewport().World3D.Environment;
        env.SsaoEnabled = tier >= Tier.Medium;
        env.SsilEnabled = tier >= Tier.High;
        env.SsrEnabled = tier >= Tier.Ultra;
        env.GlowEnabled = tier >= Tier.Medium;
        GD.Print($"Quality tier: {tier}");
    }
}
```

---

## 8. Mobile-Specific Techniques

### Battery and Thermal Management

```gdscript
# Reduce target FPS when battery is low or device is hot
func _check_device_state() -> void:
	# On Android, check battery via OS methods
	if OS.get_name() == "Android":
		# Limit to 30 FPS on mobile to reduce thermal throttling
		Engine.max_fps = 30
		# Reduce physics tick rate
		Engine.physics_ticks_per_second = 30
```

### Touch Input Overhead

- Use `InputEventScreenTouch` and `InputEventScreenDrag` instead of polling
- Limit `_input()` processing — don't run expensive logic on every touch move
- Use `input_pickable = false` on nodes that don't need touch detection

### Mobile Rendering Checklist

- [ ] Use **Mobile** renderer (not Forward+)
- [ ] Disable SSAO, SSIL, SSR, volumetric fog
- [ ] Shadow atlas ≤ 2048
- [ ] Use ASTC or ETC2 texture compression
- [ ] Limit dynamic lights to 2–4
- [ ] Prefer baked `LightmapGI` over real-time GI
- [ ] Disable MSAA (use FXAA if needed)
- [ ] Test on actual low-end devices (not just emulators)

---

## 9. Web-Specific Techniques

### SharedArrayBuffer and Threading

Web exports require `SharedArrayBuffer` for threading, which needs specific HTTP headers:

```
Cross-Origin-Opener-Policy: same-origin
Cross-Origin-Embedder-Policy: require-corp
```

Without these headers, Godot falls back to single-threaded mode.

### Web Export Checklist

- [ ] Use **Compatibility** renderer (OpenGL / WebGL 2)
- [ ] Keep initial download < 30 MB (compressed)
- [ ] Use `ResourceLoader.load_threaded_request()` for async loading (if threading enabled)
- [ ] Avoid `OS.execute()` — not available in web
- [ ] Test AudioServer initialization (browsers require user gesture to start audio)
- [ ] Minimize shader count — WebGL compile times block the main thread

### Reducing Download Size

```gdscript
# Use .ogg for audio instead of .wav (10x smaller)
# Use .webp for textures (lossy OK for backgrounds)
# Strip debug symbols in export settings
# Enable "Export with Debug" = OFF for production
```

---

## 10. Desktop Scaling (Steam Deck, Low-End PCs)

### Steam Deck Specifics

- Target 800p (1280×800) native resolution
- FSR 2.0 upscaling is available in Godot 4.x via `viewport_set_scaling_3d_mode()`
- Aim for 40 fps (Steam Deck's 40 Hz refresh mode is very smooth)
- Budget ~15W TDP — profile with `mangohud` on Linux

```gdscript
func apply_steam_deck_settings() -> void:
	# Render at 75% resolution, upscale with FSR
	get_viewport().scaling_3d_mode = Viewport.SCALING_3D_MODE_FSR2
	get_viewport().scaling_3d_scale = 0.75
	Engine.max_fps = 40
	DisplayServer.window_set_size(Vector2i(1280, 800))
```

```csharp
public void ApplySteamDeckSettings()
{
    GetViewport().Scaling3DMode = Viewport.Scaling3DModeEnum.Fsr2;
    GetViewport().Scaling3DScale = 0.75f;
    Engine.MaxFps = 40;
    DisplayServer.WindowSetSize(new Vector2I(1280, 800));
}
```

---

## 11. Profiling Per Platform

| Tool | Platform | What It Measures |
|---|---|---|
| Godot built-in profiler | All | Frame time, function cost, physics |
| Godot Monitor panel | All | Draw calls, vertices, objects, memory |
| RenderDoc | Desktop (Vulkan/D3D12) | GPU draw calls, shader cost, overdraw |
| Xcode GPU Debugger | iOS/macOS | Metal frame capture, shader profiling |
| Android GPU Inspector (AGI) | Android | Vulkan frame capture, bandwidth |
| `about:tracing` (Chrome) | Web | WebGL calls, JS main thread |
| `mangohud` / `gamescope` | Linux / Steam Deck | Frametime overlay, GPU/CPU utilization |

### Quick Profiling Script

```gdscript
# fps_counter.gd — Attach to a Label for on-screen metrics
extends Label

func _process(_delta: float) -> void:
	var fps := Engine.get_frames_per_second()
	var frame_time := 1000.0 / maxf(fps, 1)
	var draw_calls := RenderingServer.get_rendering_info(
		RenderingServer.RENDERING_INFO_TOTAL_DRAW_CALLS_IN_FRAME
	)
	var objects := RenderingServer.get_rendering_info(
		RenderingServer.RENDERING_INFO_TOTAL_OBJECTS_IN_FRAME
	)
	text = "FPS: %d | Frame: %.1f ms | Draws: %d | Objects: %d" % [
		fps, frame_time, draw_calls, objects
	]
```

---

## 12. Common Mistakes

| Mistake | Why It Hurts | Fix |
|---|---|---|
| Developing only on a high-end PC | Performance issues surface late | Profile on target hardware weekly |
| Using Forward+ for mobile | Heavy overdraw on tile-based GPUs | Switch to Mobile renderer |
| No LOD on 3D assets | Thousands of triangles rendered for distant dots | Set `visibility_range_end` on all meshes |
| Full-resolution shadows everywhere | Shadow atlas eats VRAM and bandwidth | Reduce atlas size, limit shadow-casting lights |
| Ignoring web first-frame shader compile | 5–10 second stall on first load | Pre-warm shaders; use shader baking (4.5+) |
| Testing mobile only in editor remote | Editor overhead masks real performance | Export and test on-device |
| Skipping texture compression | Raw RGBA textures waste 4x memory | Configure ASTC/ETC2/BC per platform in import |
