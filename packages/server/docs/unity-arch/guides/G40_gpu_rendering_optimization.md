# G40 — GPU-Driven Rendering & Upscaling

> **Category:** guide · **Engine:** Unity 6 (6000.x+) · **Related:** [G10 Rendering Pipeline: URP & HDRP](G10_rendering_pipeline_urp_hdrp.md) · [G16 Performance Optimization](G16_performance_optimization_memory.md) · [G39 Render Graph Custom Passes](G39_render_graph_custom_passes.md) · [G24 Mobile Development](G24_mobile_development.md) · [Unity Rules](../unity-arch-rules.md)

Unity 6 introduced a suite of GPU-driven rendering features that shift work from the CPU to the GPU, dramatically reducing draw-call overhead and improving visual quality through intelligent upscaling. This guide covers the three headline systems — **GPU Resident Drawer**, **GPU Occlusion Culling**, and **Spatial-Temporal Post-Processing (STP)** — plus supporting features like the Camera History API and Adaptive Probe Volume improvements.

---

## GPU Resident Drawer

### What It Does

The GPU Resident Drawer automatically batches and draws meshes using the `BatchRendererGroup` (BRG) API under the hood, replacing CPU-side draw call submission with GPU-driven instanced rendering. In practice, this means:

- **Up to 50% reduction in CPU frame time** for scenes with many static meshes
- Draw calls labeled "Hybrid Batch Group" in the Frame Debugger
- Works transparently — no code changes to your GameObjects required

```
Traditional Rendering                GPU Resident Drawer
─────────────────────                ───────────────────
CPU: foreach (mesh)                  CPU: upload instance data once
  → SetPass()                        GPU: BRG draws all instances
  → DrawMesh()                            in minimal draw calls
  → SetPass()
  → DrawMesh()
  (thousands of draw calls)          (handful of batched draws)
```

### What It Supports

The GPU Resident Drawer renders:

- **MeshRenderer** components on GameObjects (static and dynamic meshes)
- **SpeedTree** vegetation generated with SpeedTree 9
- Any mesh using URP-compatible shaders (Lit, Simple Lit, Unlit, and custom shaders with `BatchRendererGroup` support)

It does **not** handle:

- SkinnedMeshRenderers (animated characters)
- Particle systems / VFX Graph output
- Meshes using shaders without BRG variant support

### Setup (URP)

Follow these steps in order — skipping any one will silently disable the feature:

**Step 1: Keep Shader Variants**

```
Project Settings > Graphics > Shader Stripping
  → BatchRendererGroup Variants: "Keep All"
```

This prevents Unity from stripping the GPU instancing shader variants that BRG requires. Without this, meshes fall back to standard rendering with no warning.

**Step 2: Enable SRP Batcher**

```
URP Asset (Inspector)
  → SRP Batcher: Enabled ✓
```

The GPU Resident Drawer builds on top of the SRP Batcher's constant buffer layout.

**Step 3: Enable GPU Resident Drawer**

```
URP Asset (Inspector)
  → GPU Resident Drawer: "Instanced Drawing"
```

Options are:
- **Disabled** — standard CPU-driven rendering
- **Instanced Drawing** — GPU Resident Drawer active

**Step 4: Set Forward+ Rendering Path**

```
URP Renderer Asset (double-click the renderer in the Renderer List)
  → Rendering Path: "Forward+"
```

The GPU Resident Drawer requires Forward+ because it uses the clustered lighting data structure that Forward+ provides. Classic Forward and Deferred paths are not supported.

**Step 5: Disable Static Batching**

```
Project Settings > Player > Other Settings
  → Static Batching: Disabled ✗
```

Static Batching and GPU Resident Drawer are mutually exclusive — they solve the same problem differently. If both are enabled, Static Batching takes priority and the Resident Drawer skips those meshes.

### Verifying It Works

1. **Frame Debugger** (Window > Analysis > Frame Debugger) — look for draw calls labeled **"Hybrid Batch Group"**. If you see standard `Draw Mesh` calls for static meshes, the setup is incomplete.
2. **Rendering Debugger** (Window > Analysis > Rendering Debugger) — shows GPU instancing statistics and batch counts.

### HDRP Setup

HDRP also supports GPU Resident Drawer. Enable it in the HDRP Asset:

```
HDRP Asset > Rendering
  → GPU Resident Drawer: Enabled
```

HDRP additionally supports GPU Occlusion Culling in the same settings panel.

---

## GPU Occlusion Culling

GPU Occlusion Culling works alongside the GPU Resident Drawer to skip rendering instances that are hidden behind other geometry — entirely on the GPU, without CPU readback.

### How It Works

1. The GPU renders a low-resolution depth buffer from the previous frame's camera position
2. Each instance's bounding box is tested against this depth buffer
3. Occluded instances are excluded from the draw call, saving both vertex and fragment work

### Enabling GPU Occlusion Culling

```
URP Renderer Asset
  → GPU Occlusion Culling: Enabled ✓
```

Requirements:
- GPU Resident Drawer must be active
- Forward+ rendering path
- Platform must support compute shaders

### When It Helps Most

- Dense urban environments with many buildings occluding each other
- Interior scenes with rooms and corridors
- Scenes with high instance counts (thousands of props)

It adds a small overhead for the depth test pass, so it's less beneficial in open landscapes where most objects are visible.

---

## Spatial-Temporal Post-Processing (STP)

STP is Unity 6's built-in temporal upscaler — think DLSS or FSR, but integrated natively into URP. It renders frames at a lower internal resolution and reconstructs a full-resolution image using temporal data from previous frames.

### Why Use STP

| Metric | Without STP | With STP (50% scale) |
|---|---|---|
| Internal render resolution | 1920×1080 | 960×540 |
| GPU fragment work | 100% | ~25% |
| Final output quality | Native | Near-native (temporal reconstruction) |
| GPU time saved | — | 30-60% on fragment-bound scenes |

### Enabling STP

```
URP Asset > Quality
  → Upscaling Filter: "Spatial Temporal Post-Processing (STP)"
```

Then configure dynamic resolution to control the render scale:

```
URP Asset > Quality
  → Render Scale: 0.5 - 1.0 (controls internal resolution)
```

### STP vs Other Upscalers

| Feature | STP | FSR (AMD) | DLSS (NVIDIA) |
|---|---|---|---|
| Built into Unity | Yes | Plugin | Plugin |
| Hardware requirement | Compute shaders | Any GPU | RTX GPU |
| Platform support | Desktop, Console, Mobile | Desktop, Console | Desktop |
| Quality at 50% scale | Good | Good | Excellent |
| Motion vector requirement | Yes | Yes | Yes |

STP is the default choice when you want a single upscaler that works everywhere Unity runs. Use platform-specific upscalers (DLSS, FSR, XeSS) when targeting specific hardware for maximum quality.

### Limitations

- Requires dynamic resolution support on the target platform
- Hardware dynamic resolution mode must be active for the best quality path
- Ghosting artifacts can appear on fast-moving thin objects (common to all temporal upscalers)
- Not compatible with the legacy TAAU (Temporal Anti-Aliasing Upscaling) — use one or the other

---

## Camera History API

Unity 6 introduces a per-camera history system that stores color and depth textures from previous frames. This enables temporal algorithms without manual ping-pong buffer management.

### Accessing History Textures

```csharp
using UnityEngine.Rendering.Universal;

// Inside a ScriptableRenderPass:
public override void RecordRenderGraph(RenderGraph renderGraph,
    ContextContainer frameData)
{
    var cameraData = frameData.Get<UniversalCameraData>();

    // Access the previous frame's color buffer
    // Returns null if history is not yet available (first frame)
    var historyManager = cameraData.historyManager;

    // Request specific history types
    // The system automatically manages the ring buffer
}
```

### Use Cases

- **Custom temporal anti-aliasing** — compare current and previous frames to reduce aliasing
- **Motion blur** — blend current frame with history based on motion vectors
- **Temporal reprojection** — reproject previous frame data for effects like screen-space reflections
- **Frame interpolation** — generate in-between frames for smoother output

---

## Adaptive Probe Volumes (APV) — Unity 6 Improvements

APV automatically places light probes throughout your scene to capture indirect lighting. Unity 6 added three major improvements:

### Lighting Scenario Blending

Blend between different pre-baked lighting setups at runtime — for example, transitioning from daytime to nighttime lighting without re-baking:

```csharp
// Blend between two baked lighting scenarios
// 0.0 = fully "Day", 1.0 = fully "Night"
ProbeReferenceVolume.instance.BlendLightingScenario(
    "Day", "Night", blendFactor);
```

### Sky Occlusion

Probes now account for sky visibility, improving accuracy in partially covered outdoor areas where the sky contributes significant indirect light.

### Disk Streaming

Large worlds can stream probe data from disk instead of holding everything in memory — critical for open-world games with extensive probe coverage.

### Mobile Optimization

The Volume framework received CPU performance optimizations specifically targeting mobile platforms, reducing the overhead of evaluating probe data per frame.

---

## Performance Decision Tree

```
Is your scene fragment-bound (GPU time in pixel shaders)?
├─ YES → Enable STP upscaling (render at 50-75% scale)
│        ├─ Still slow? → Profile shader complexity
│        └─ Artifacts? → Ensure motion vectors are correct
│
└─ NO → Is your scene CPU draw-call bound?
    ├─ YES → Enable GPU Resident Drawer
    │        ├─ Still slow? → Enable GPU Occlusion Culling
    │        └─ Characters slow? → BRG doesn't help here; profile skinning
    │
    └─ NO → Profile elsewhere (physics, scripts, animation)
```

---

## Version Notes

| Version | Feature |
|---|---|
| Unity 6.0 (6000.0) | GPU Resident Drawer, GPU Occlusion Culling, STP, APV improvements, Camera History API |
| Unity 6.1 (6000.1) | Stability improvements, broader shader compatibility |
| Unity 6.2 (6000.2) | Volume framework perf optimizations (mobile), APV streaming improvements |
| Unity 6.3 (6000.3) | Additional Render Graph + GPU Resident Drawer integration work |
