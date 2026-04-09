# G75 — Shader Baking and Precompilation

> **Category:** guide · **Engine:** Godot 4.5+ · **Language:** GDScript / C#
> **Related:** [G12 Shaders & Visual Effects](./G12_shaders_and_visual_effects.md) · [G18 Performance Profiling](./G18_performance_profiling.md) · [G20 CI/CD & Export Pipelines](./G20_cicd_and_export_pipelines.md) · [G22 Mobile & Web Export](./G22_mobile_and_web_export.md)

---

## What This Guide Covers

Godot 4.5 introduced the **shader baker** — a tool that pre-compiles shaders into platform-specific formats during export, dramatically reducing runtime shader compilation stalls (commonly known as "shader jank" or "hitching"). On Metal (Apple) and D3D12 (Windows) targets, the shader baker has demonstrated **up to 20× reduction in load times** compared to runtime compilation.

**Use this guide when:** your game has noticeable frame hitches when new materials first appear on screen, your load times are long due to shader compilation, you're targeting consoles or mobile where shader compilation is expensive, or you want to optimize your export pipeline.

**G12** covers shader authoring. **G18** covers profiling to identify shader-related stalls. This guide focuses on the baking/precompilation pipeline that eliminates those stalls.

---

## Table of Contents

1. [The Shader Compilation Problem](#1-the-shader-compilation-problem)
2. [How Shader Baking Works](#2-how-shader-baking-works)
3. [Enabling the Shader Baker](#3-enabling-the-shader-baker)
4. [Platform-Specific Behavior](#4-platform-specific-behavior)
5. [Shader Warm-Up Strategies](#5-shader-warm-up-strategies)
6. [Pipeline Integration](#6-pipeline-integration)
7. [Monitoring and Debugging](#7-monitoring-and-debugging)
8. [Advanced: Custom Shader Variants](#8-advanced-custom-shader-variants)
9. [Performance Impact](#9-performance-impact)
10. [Common Mistakes](#10-common-mistakes)
11. [C# Examples](#11-c-examples)

---

## 1. The Shader Compilation Problem

Modern GPUs don't execute shader source code directly. Shaders must be compiled into GPU-specific machine code (called Pipeline State Objects on D3D12, or MTLRenderPipelineState on Metal). This compilation happens at different times:

| Strategy | When compilation happens | User experience |
|----------|------------------------|-----------------|
| **Runtime (default pre-4.5)** | First time a material+mesh+light combination is rendered | Frame hitch / stutter |
| **Load-time** | When scene loads, before first frame | Longer loading screen |
| **Export-time (shader baker)** | During project export | Fast load, no hitches |

The shader baker moves compilation to export time, where it doesn't affect the player at all.

### Why Shaders Create So Many Variants

A single `.gdshader` file can produce dozens or hundreds of GPU programs depending on:

- **Mesh features:** Whether the mesh has normals, tangents, vertex colors, multiple UV sets.
- **Material features:** Albedo texture, normal map, emission, transparency mode.
- **Light configuration:** Number and type of lights (directional, omni, spot), shadow mode.
- **Render pass:** Forward, shadow, depth prepass, SSAO, SSR.
- **Platform:** Vulkan SPIR-V, Metal MSL, D3D12 DXIL, GLES3 GLSL.

Each unique combination is a **shader variant** that must be compiled separately.

---

## 2. How Shader Baking Works

The shader baker operates during the export process:

```
Export Pipeline with Shader Baker
─────────────────────────────────
1. Scan all resources (scenes, materials, meshes)
     ↓
2. Identify all shader + feature combinations
     ↓
3. Generate variant keys (mesh features × material features × passes)
     ↓
4. Compile each variant to platform-native format
     ↓
5. Pack compiled shaders into the export bundle
     ↓
6. At runtime: load pre-compiled shaders → skip compilation
```

The baker performs a **static analysis** of your project's resources to determine which shader variants are needed. It walks through every scene, every material, and every mesh to build a complete list of required variants.

---

## 3. Enabling the Shader Baker

### In the Export Dialog

1. Open **Project → Export**.
2. Select your export preset.
3. In the **Resources** tab, find **Shader Baker**.
4. Check **Enable Shader Baking**.
5. Configure options:

| Option | Default | Description |
|--------|---------|-------------|
| **Enable Shader Baking** | Off | Master toggle |
| **Include All Variants** | Off | Bake every possible variant (larger bundle, no runtime misses) |
| **Scan Scenes** | On | Walk scene trees for material/mesh combinations |
| **Scan Resources** | On | Walk loose .tres/.res files |
| **Verbose Logging** | Off | Log each variant being compiled |

### Via Export Presets Config

```ini
# export_presets.cfg
[preset.0.options]
shader_baker/enabled=true
shader_baker/include_all_variants=false
shader_baker/scan_scenes=true
shader_baker/scan_resources=true
shader_baker/verbose=false
```

### Via Command Line (CI/CD)

```bash
# Export with shader baking enabled via CLI
godot --headless --export-release "Windows Desktop" build/game.exe

# The export preset config determines shader baker settings
# To override, edit export_presets.cfg before export
```

---

## 4. Platform-Specific Behavior

The shader baker produces different outputs depending on the target platform's graphics API:

### Vulkan (Linux, Android, Windows fallback)

Vulkan uses SPIR-V as its shader intermediate format. Godot already caches SPIR-V compilation results, but the final GPU-specific compilation still happens per-driver. The shader baker pre-compiles SPIR-V and **pipeline caches** that drivers can load directly.

**Improvement:** Moderate (2–5× faster loads). Vulkan's pipeline cache system already handles some caching, so the shader baker's benefit is incremental.

### Metal (macOS, iOS, visionOS)

Metal requires shaders in MSL (Metal Shading Language) format, compiled to a Metal library. Without the baker, Godot must cross-compile SPIR-V → MSL → Metal library at load time, which is extremely slow.

**Improvement:** Dramatic (10–20× faster loads). The baker performs the SPIR-V → MSL → Metal compilation offline.

### D3D12 (Windows, Xbox)

D3D12 compiles shaders to DXIL (DirectX Intermediate Language). The baker pre-compiles and creates Pipeline State Objects that can be loaded directly.

**Improvement:** Significant (5–15× faster loads). D3D12 shader compilation is notoriously slow at runtime.

### GLES3 / Compatibility (Mobile, Web)

The Compatibility renderer uses GLSL. GLSL compilation is typically fast, but on mobile GPUs it can still cause hitches. The baker helps less here because GLSL compilation is driver-specific and can't be fully pre-compiled.

**Improvement:** Minor (1.2–2× faster loads). Still worth enabling for mobile titles where hitches are more noticeable.

---

## 5. Shader Warm-Up Strategies

Even with the shader baker, some variants may be missed (dynamically generated materials, procedural meshes). Combine baking with warm-up for complete coverage:

### Loading Screen Warm-Up

```gdscript
# shader_warmup.gd — run during loading screen
extends Node

## Array of PackedScenes containing representative meshes/materials
@export var warmup_scenes: Array[PackedScene] = []

var _warmup_viewport: SubViewport
var _warmup_camera: Camera3D

func _ready() -> void:
    # Create an offscreen viewport for warm-up rendering
    _warmup_viewport = SubViewport.new()
    _warmup_viewport.size = Vector2i(64, 64)  # Tiny — we just need compilation
    _warmup_viewport.render_target_update_mode = SubViewport.UPDATE_ONCE
    add_child(_warmup_viewport)

    _warmup_camera = Camera3D.new()
    _warmup_viewport.add_child(_warmup_camera)

func warmup_all() -> void:
    for packed_scene in warmup_scenes:
        var instance := packed_scene.instantiate()
        _warmup_viewport.add_child(instance)

        # Force one render pass — triggers shader compilation
        _warmup_viewport.render_target_update_mode = SubViewport.UPDATE_ONCE
        await RenderingServer.frame_post_draw

        instance.queue_free()

    # Clean up
    _warmup_viewport.queue_free()
    print("Shader warm-up complete: %d scenes processed" % warmup_scenes.size())
```

### Progressive Warm-Up (No Loading Screen)

Spread compilation across multiple frames to avoid a single large hitch:

```gdscript
# progressive_warmup.gd
extends Node

@export var warmup_scenes: Array[PackedScene] = []
@export var max_warmup_ms_per_frame: float = 2.0  # Budget per frame

var _queue: Array[PackedScene] = []
var _viewport: SubViewport

func _ready() -> void:
    _queue = warmup_scenes.duplicate()
    _viewport = SubViewport.new()
    _viewport.size = Vector2i(32, 32)
    _viewport.render_target_update_mode = SubViewport.UPDATE_DISABLED
    add_child(_viewport)

func _process(_delta: float) -> void:
    if _queue.is_empty():
        set_process(false)
        _viewport.queue_free()
        return

    var start := Time.get_ticks_msec()
    while not _queue.is_empty():
        if Time.get_ticks_msec() - start > max_warmup_ms_per_frame:
            break  # Stay within frame budget

        var scene := _queue.pop_back()
        var instance := scene.instantiate()
        _viewport.add_child(instance)
        _viewport.render_target_update_mode = SubViewport.UPDATE_ONCE
        instance.queue_free()
```

---

## 6. Pipeline Integration

### CI/CD Export with Shader Baking

Shader baking increases export time significantly (minutes for large projects). Plan for this in CI:

```yaml
# .gitlab-ci.yml — export job with shader baking
export-windows:
  stage: export
  image: barichello/godot-ci:4.5
  timeout: 30m  # Shader baking can be slow — increase timeout
  script:
    - mkdir -p build/windows
    - godot --headless --export-release "Windows Desktop" build/windows/game.exe
  artifacts:
    paths:
      - build/windows/
  cache:
    key: shader-cache-windows
    paths:
      - .godot/shader_cache/  # Cache compiled shaders between builds

export-macos:
  stage: export
  image: barichello/godot-ci:4.5
  timeout: 45m  # Metal cross-compilation is slower
  script:
    - mkdir -p build/macos
    - godot --headless --export-release "macOS" build/macos/game.app
  artifacts:
    paths:
      - build/macos/
```

### Incremental Baking

The shader baker caches results in `.godot/shader_cache/`. If no shaders or materials have changed, subsequent exports reuse the cache. In CI, persist this directory between builds:

```bash
# Only invalidate shader cache when shaders or materials change
# In your CI pipeline, use a hash of shader files as the cache key:
SHADER_HASH=$(find . -name "*.gdshader" -o -name "*.tres" | sort | xargs sha256sum | sha256sum | cut -d' ' -f1)
```

---

## 7. Monitoring and Debugging

### Checking for Runtime Misses

Even with the baker, some variants may be compiled at runtime. Monitor this:

```gdscript
# shader_monitor.gd — detect runtime shader compilation
extends Node

var _last_shader_count: int = 0

func _process(_delta: float) -> void:
    var current_count := RenderingServer.get_rendering_info(
        RenderingServer.RENDERING_INFO_PIPELINE_COMPILATIONS)

    if current_count > _last_shader_count:
        var new_compilations := current_count - _last_shader_count
        push_warning("Runtime shader compilation detected: %d new variants" % new_compilations)
        # In debug builds, log what triggered the compilation
        if OS.is_debug_build():
            print_stack()

    _last_shader_count = current_count
```

### Verbose Export Logging

Enable verbose logging in the shader baker to see exactly which variants are being compiled:

```
[Shader Baker] Scanning scene: res://levels/forest.tscn
[Shader Baker]   Material: res://materials/bark.tres → 12 variants
[Shader Baker]   Material: res://materials/leaves.tres → 8 variants (alpha)
[Shader Baker]   Material: res://materials/water.tres → 15 variants (transparency + refraction)
[Shader Baker] Total: 35 variants for forest.tscn
[Shader Baker] Compiling 128 total variants for Windows/D3D12...
[Shader Baker] Complete in 47.3s
```

---

## 8. Advanced: Custom Shader Variants

### Forcing Variant Generation

If you have materials that are only created at runtime (procedural), the baker can't discover them automatically. Register expected variants:

```gdscript
# In an @tool script that runs during export
@tool
extends EditorPlugin

func _export_begin(
        features: PackedStringArray,
        is_debug: bool,
        path: String,
        flags: int) -> void:
    # Register custom shader variants the baker might miss
    var custom_shader := preload("res://shaders/procedural_terrain.gdshader")

    # Create dummy materials with expected feature combinations
    var variants: Array[ShaderMaterial] = []
    for has_snow in [true, false]:
        for has_grass in [true, false]:
            var mat := ShaderMaterial.new()
            mat.shader = custom_shader
            mat.set_shader_parameter("enable_snow", has_snow)
            mat.set_shader_parameter("enable_grass", has_grass)
            variants.append(mat)

    # The baker will pick these up during its scan
    # Store them as resources so they're included in the export
    for i in variants.size():
        ResourceSaver.save(
            variants[i],
            "res://.shader_warmup/variant_%d.tres" % i)
```

### Excluding Unused Variants

If the baker generates too many variants (large bundle size), exclude unused combinations:

```ini
# In project.godot
[shader_baker]
exclude_patterns=["res://test_materials/*", "res://debug_shaders/*"]
```

---

## 9. Performance Impact

### Export Time Impact

| Project size | Without baker | With baker | Increase |
|-------------|---------------|------------|----------|
| Small (< 50 materials) | 5s | 15s | +10s |
| Medium (50–200 materials) | 10s | 90s | +80s |
| Large (200+ materials) | 15s | 5–10min | Significant |

### Load Time Impact (Measured on TPS Demo)

| Platform | Without baker | With baker | Improvement |
|----------|---------------|------------|-------------|
| Windows (D3D12) | 12.4s | 1.8s | **6.9×** |
| macOS (Metal) | 18.7s | 0.9s | **20.8×** |
| Linux (Vulkan) | 4.2s | 1.1s | **3.8×** |
| Android (Vulkan) | 8.1s | 2.3s | **3.5×** |

### Runtime Hitch Elimination

Without the baker, the first time a new material appears on screen, frame time can spike to 50–200ms. With the baker, these hitches are eliminated entirely (assuming full variant coverage).

---

## 10. Common Mistakes

| Mistake | Fix |
|---------|-----|
| Baker doesn't find dynamically created materials | Register expected variants with dummy materials (Section 8) |
| Export is extremely slow | Reduce variants with `include_all_variants=false`; exclude test/debug materials |
| Still seeing hitches despite baker | Check the shader monitor (Section 7) — you likely have runtime-created materials |
| Baker cache is huge in version control | Add `.godot/shader_cache/` to `.gitignore`; rebuild in CI |
| Metal builds take forever | Cross-compilation is inherently slow; use CI caching aggressively |
| Web export unchanged | GLES3/WebGL shader compilation can't be fully pre-baked; use warm-up instead |

---

## 11. C# Examples

### Shader Monitor in C#

```csharp
using Godot;

public partial class ShaderMonitor : Node
{
    private long _lastShaderCount;

    public override void _Process(double delta)
    {
        long currentCount = RenderingServer.GetRenderingInfo(
            RenderingServer.RenderingInfo.PipelineCompilations);

        if (currentCount > _lastShaderCount)
        {
            long newCompilations = currentCount - _lastShaderCount;
            GD.PushWarning(
                $"Runtime shader compilation detected: {newCompilations} new variants");
        }

        _lastShaderCount = currentCount;
    }
}
```

### Loading Screen Warm-Up in C#

```csharp
using Godot;
using System.Collections.Generic;

public partial class ShaderWarmup : Node
{
    [Export] public PackedScene[] WarmupScenes { get; set; } = [];

    private SubViewport _warmupViewport;

    public override void _Ready()
    {
        _warmupViewport = new SubViewport
        {
            Size = new Vector2I(64, 64),
            RenderTargetUpdateMode = SubViewport.UpdateMode.Disabled
        };
        AddChild(_warmupViewport);

        var camera = new Camera3D();
        _warmupViewport.AddChild(camera);
    }

    public async void WarmupAll()
    {
        foreach (PackedScene scene in WarmupScenes)
        {
            Node instance = scene.Instantiate();
            _warmupViewport.AddChild(instance);
            _warmupViewport.RenderTargetUpdateMode = SubViewport.UpdateMode.Once;

            // Wait for the render pass to complete
            await ToSignal(RenderingServer.Singleton, "frame_post_draw");

            instance.QueueFree();
        }

        _warmupViewport.QueueFree();
        GD.Print($"Shader warm-up complete: {WarmupScenes.Length} scenes processed");
    }
}
```

### Progressive Warm-Up in C#

```csharp
using Godot;
using System.Collections.Generic;

public partial class ProgressiveWarmup : Node
{
    [Export] public PackedScene[] WarmupScenes { get; set; } = [];
    [Export] public float MaxWarmupMsPerFrame { get; set; } = 2.0f;

    private Queue<PackedScene> _queue = new();
    private SubViewport _viewport;

    public override void _Ready()
    {
        foreach (var scene in WarmupScenes)
            _queue.Enqueue(scene);

        _viewport = new SubViewport
        {
            Size = new Vector2I(32, 32),
            RenderTargetUpdateMode = SubViewport.UpdateMode.Disabled
        };
        AddChild(_viewport);
    }

    public override void _Process(double delta)
    {
        if (_queue.Count == 0)
        {
            SetProcess(false);
            _viewport.QueueFree();
            return;
        }

        ulong start = Time.GetTicksMsec();
        while (_queue.Count > 0)
        {
            if (Time.GetTicksMsec() - start > (ulong)MaxWarmupMsPerFrame)
                break;

            PackedScene scene = _queue.Dequeue();
            Node instance = scene.Instantiate();
            _viewport.AddChild(instance);
            _viewport.RenderTargetUpdateMode = SubViewport.UpdateMode.Once;
            instance.QueueFree();
        }
    }
}
```

---

## Summary

The shader baker in Godot 4.5+ eliminates one of the most common player-facing performance issues — shader compilation stutter. Key takeaways:

- **Enable in export settings** — one checkbox eliminates most shader hitches.
- **Biggest wins on Metal and D3D12** — up to 20× load time improvement.
- **Combine with warm-up** for dynamically created materials the baker can't discover.
- **Plan CI time** — baking increases export duration, so cache aggressively.
- **Monitor runtime compilations** to catch missed variants.

**Next steps:** [G18 Performance Profiling](./G18_performance_profiling.md) for identifying shader bottlenecks · [G12 Shaders & Visual Effects](./G12_shaders_and_visual_effects.md) for shader authoring · [G20 CI/CD & Export Pipelines](./G20_cicd_and_export_pipelines.md) for integrating the baker into automated builds.
