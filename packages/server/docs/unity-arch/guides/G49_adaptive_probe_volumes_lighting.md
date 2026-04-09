# G49 — Adaptive Probe Volumes & Global Illumination

> **Category:** guide · **Engine:** Unity 6 (6000.x, SRP Core 17.0+) · **Related:** [G10 Rendering Pipeline URP/HDRP](G10_rendering_pipeline_urp_hdrp.md) · [G39 Render Graph & Custom Passes](G39_render_graph_custom_passes.md) · [G40 GPU Rendering Optimization](G40_gpu_rendering_optimization.md) · [Unity Rules](../unity-arch-rules.md)

Adaptive Probe Volumes (APV) is Unity 6's replacement for the legacy Light Probe Group workflow. APV automatically places light probes in a hierarchical voxel grid that adapts density to scene geometry, samples indirect lighting per-pixel (not per-GameObject), and supports runtime streaming for large worlds. Available in both URP and HDRP, APV is now the recommended approach for baked and mixed global illumination in Unity 6+.

---

## Why APV Replaces Legacy Light Probes

| Problem with Legacy Light Probes | How APV Solves It |
|----------------------------------|-------------------|
| Manual placement — artists hand-place probes, tedious and error-prone | Automatic placement based on geometry density |
| Per-object sampling — all vertices of a mesh sample one probe set, causing seams between adjacent objects | Per-pixel sampling — each pixel samples surrounding probes independently, eliminating seams |
| No adaptive density — uniform grid wastes probes in open areas, too sparse in detail areas | Hierarchical grid — dense probes near complex geometry, sparse probes in open space |
| Painful iteration — move geometry, re-place probes, re-bake | Probes adapt automatically when geometry changes |
| No streaming — all probe data loaded at once | Cell-based streaming — load/unload probe data as camera moves |
| No lighting scenarios — one bake per scene | Scenario blending — blend between day/night lighting at runtime |

---

## Architecture Overview

```
Scene Geometry                     APV System                        Rendering
┌──────────────────┐              ┌──────────────────────────┐      ┌──────────────┐
│                   │              │  Baking Pipeline          │      │              │
│  Static Meshes    │── Analyze ──│  ┌──────────────────────┐ │      │  Per-Pixel   │
│  (Contribute GI)  │  geometry   │  │ Probe Placement       │ │      │  Indirect    │
│                   │  density    │  │ (hierarchical grid)   │ │      │  Lighting    │
│  Light Sources    │             │  └──────────┬───────────┘ │      │              │
│  (Mixed/Baked)    │── Bake ────│  ┌──────────▼───────────┐ │      │  Applied via │
│                   │  lighting   │  │ Spherical Harmonics   │ │──────│  SH sampling │
│  Volumes          │             │  │ (L0/L1/L2 per probe) │ │      │  in shader   │
│  (APV components) │             │  └──────────┬───────────┘ │      │              │
└──────────────────┘              │  ┌──────────▼───────────┐ │      └──────────────┘
                                   │  │ Cells & Bricks       │ │
                                   │  │ (streamable chunks)  │ │
                                   │  └──────────────────────┘ │
                                   │                            │
                                   │  Scenarios: Day / Night    │
                                   │  (blendable at runtime)    │
                                   └──────────────────────────┘
```

### Key Terminology

| Term | Definition |
|------|-----------|
| **Probe** | A point in 3D space storing indirect lighting as Spherical Harmonics (SH) coefficients |
| **Brick** | A small cluster of probes at a fixed spacing. The smallest unit of the hierarchy |
| **Cell** | A group of bricks. The unit of streaming — cells load/unload based on camera proximity |
| **Dilation** | Post-bake pass that fills invalid probes (inside geometry) with data from valid neighbors |
| **Scenario** | A named lighting state (e.g., "Day", "Night"). Each stores separate SH data per probe |
| **Validity** | Per-probe flag indicating whether the probe received meaningful lighting data or is inside solid geometry |

---

## Setup (URP)

### Step 1: Enable APV in the Render Pipeline Asset

```
// WHY: APV must be enabled at the pipeline level before it's available in scenes.
// Without this, the Lighting window won't show APV options.

// Navigate: Project Settings → Graphics → URP Renderer
// In the URP Asset (or Pipeline Asset):
//   Light Probe System → Adaptive Probe Volumes
```

In the **URP Asset Inspector**:

1. **Lighting** → Set **Light Probe System** to **Adaptive Probe Volumes**
2. Optionally enable **SH Bands** → **L2** for higher quality (L1 is default, cheaper)

### Step 2: Add an Adaptive Probe Volume to the Scene

```
// WHY: The APV component defines the 3D region where probes will be placed.
// Place one large volume covering your entire playable area, or use multiple
// smaller volumes for more control over probe density.

// GameObject → Light → Adaptive Probe Volume
// Or: Add Component → Rendering → Adaptive Probe Volume
```

Configure the volume in the Inspector:

| Property | Recommended | Why |
|----------|-------------|-----|
| **Mode** | Global | Covers entire scene. Use "Local" for fine-grained density overrides |
| **Min Probe Spacing** | 1–3 meters | Smaller = more probes = better quality but more memory |
| **Max Probe Spacing** | 12–24 meters | Upper limit for sparse areas. Keep reasonable for large worlds |
| **Override Renderer Filters** | Layer-based | Exclude non-contributing layers (UI, VFX) from probe placement |

### Step 3: Configure Light Sources

```csharp
// WHY: Only Mixed and Baked lights contribute to APV's baked lighting data.
// Realtime lights are excluded from the bake — they're applied at runtime.

// For each Light in your scene:
//   Mode: Mixed (recommended for most games — baked indirect + realtime direct)
//   OR
//   Mode: Baked (fully baked, cheapest at runtime)
```

### Step 4: Mark Static Geometry

```
// WHY: Only GameObjects with "Contribute Global Illumination" enabled are
// included in the lightmap bake. Moving objects should have
// "Receive Global Illumination" set to "Light Probes" to receive APV lighting.

// Static meshes:
//   Inspector → Static dropdown → ✓ Contribute GI
//   (or check "Contribute Global Illumination" in the Mesh Renderer)

// Dynamic meshes (characters, props):
//   Mesh Renderer → Receive Global Illumination → Light Probes
//   (they receive APV lighting but don't contribute to the bake)
```

### Step 5: Bake

```
// WHY: Baking computes indirect lighting and stores it in the probe grid.
// Use "Generate Lighting" for a full bake. Incremental baking is not yet
// supported in APV (Unity 6.3) — every bake is a full recompute.

// Window → Rendering → Lighting
// Tab: Adaptive Probe Volumes
// Baking Mode: Single Scene (or Baking Set for multi-scene)
// Click: Generate Lighting
```

---

## Setup (HDRP)

The HDRP setup is nearly identical with these differences:

| URP | HDRP |
|-----|------|
| URP Asset → Light Probe System → APV | HDRP Asset → Lighting → Probe Volumes → Enable |
| SH Bands: L1 or L2 | SH Bands: L1, L2, or L3 (L3 available in HDRP only) |
| Volume Framework → not required | Volume Framework → add "Probe Volumes Options" override to a Volume |

```
// HDRP-specific: Add a Volume with "Probe Volumes Options" override
// to control runtime sampling quality:
//   Normal Bias, View Bias, Sampling Noise, Leak Reduction Mode
```

---

## Lighting Scenarios (Day/Night Blending)

APV supports multiple "scenarios" — separate baked lighting states that blend at runtime.

### Baking Multiple Scenarios

```
// WHY: Scenarios let you bake different lighting conditions (day, night, overcast)
// and blend between them at runtime without re-baking. Each scenario stores
// separate SH data for every probe — the probe positions stay the same.

// 1. In Lighting window → Adaptive Probe Volumes tab:
//    - Lighting Scenarios → Add "Day" scenario
//    - Set up your daytime lights and skybox
//    - Click "Generate Lighting"
//
// 2. Switch to "Night" scenario:
//    - Modify lights (disable sun, enable moon, change ambient)
//    - Click "Generate Lighting" again
//    - Each scenario bakes independently to its own data
```

### Runtime Scenario Blending

```csharp
using UnityEngine.Rendering;

public class DayNightCycle : MonoBehaviour
{
    [Range(0f, 1f)]
    public float timeOfDay = 0f; // 0 = Day, 1 = Night

    void Update()
    {
        // WHY: ProbeReferenceVolume is the singleton managing all APV data.
        // SetScenarioBlendingFactor smoothly interpolates SH data between
        // two scenarios. The GPU does the blending — very cheap at runtime.
        var prv = ProbeReferenceVolume.instance;

        // WHY: First set which scenario to blend toward.
        // "Day" is the active scenario (loaded by default), "Night" is the blend target.
        prv.lightingScenario = "Day";
        prv.scenarioBlendingFactor = timeOfDay;

        // WHY: numberOfCellsBlendedPerFrame controls how many cells update per frame
        // during a blend transition. Higher = faster transition, more CPU cost.
        // Default is 12 — increase for instant transitions, decrease for large worlds.
        prv.numberOfCellsBlendedPerFrame = 12;
    }
}
```

---

## Streaming for Large Worlds

APV data is organized into cells that stream based on camera position:

```csharp
// WHY: For open-world games, you can't load all APV data at once.
// The streaming system loads cells near the camera and unloads distant ones.
// Configure the streaming budget in the Render Pipeline Asset.

// URP Asset → Adaptive Probe Volumes → Max Cell Streaming Budget
// WHY: This controls how many cells can be loaded per frame.
// Too low = visible pop-in. Too high = frame spikes during fast camera movement.
// Start with 4 and increase if you see lighting pop-in.
```

### Disk Streaming (Unity 6.1+)

```
// WHY: "Streaming from Disk" mode keeps APV data on disk instead of GPU memory,
// loading cells on demand. This dramatically reduces VRAM usage for large worlds
// at the cost of slightly slower cell activation.

// Lighting window → Adaptive Probe Volumes → Streaming Mode → Disk Streaming
// Set GPU Budget (MB) to limit VRAM usage for probe data.
```

---

## Debug Visualization

APV includes built-in debug views accessible at runtime and in-editor:

```
// Window → Rendering → Rendering Debugger → Probe Volumes tab

// Key debug modes:
// - "Probe" — shows individual probes as colored spheres (SH visualization)
// - "Cell" — shows cell boundaries and streaming state
// - "Validity" — highlights invalid probes (inside geometry) in red
// - "Dilation" — shows which probes received dilated data from neighbors
```

```csharp
// WHY: You can also toggle debug visualization from code — useful for
// in-game debug menus during development.
using UnityEngine.Rendering;

// Show probe visualization
ProbeReferenceVolume.instance.debugDisplay.probeDebugMode =
    ProbeReferenceVolume.DebugProbeMode.SH;

// Disable debug visualization
ProbeReferenceVolume.instance.debugDisplay.probeDebugMode =
    ProbeReferenceVolume.DebugProbeMode.None;
```

---

## Performance Tuning

### Memory Budget

| Setting | Impact | Guidance |
|---------|--------|----------|
| Min Probe Spacing | Quadruples probes per halving | 1m for interiors, 3m+ for exteriors |
| Max Probe Spacing | Upper bound in empty areas | 12m for small levels, 24m for open worlds |
| SH Bands (L1 vs L2) | L2 uses ~2.5× more memory per probe | Use L1 for mobile/Switch, L2 for PC/console |
| Cell Streaming Budget | Cells loaded per frame | 4 for mobile, 8–16 for PC/console |
| Disk Streaming GPU Budget | VRAM cap for probe data | 64 MB for mobile, 256 MB+ for PC |

### Common Performance Pitfalls

| Pitfall | Solution |
|---------|----------|
| Too-dense probes everywhere | Use Local APV volumes with smaller spacing only in important areas |
| L2 on mobile | Switch to L1 — the quality difference is subtle but the memory cost is significant |
| No dilation → dark patches | Ensure dilation is enabled in Lighting settings; it fills probes inside walls |
| Baking takes hours | Reduce Max Lightmap Size, use GPU Lightmapper, exclude distant geometry from GI |
| Lighting pop-in during camera cuts | Increase cell streaming budget or pre-warm cells before the camera cut |

---

## APV vs. Legacy Light Probes: Migration

If migrating an existing project from legacy Light Probe Groups:

1. **Enable APV** in your Render Pipeline Asset (replaces Light Probe Group workflow globally)
2. **Delete Light Probe Group** components — they're ignored once APV is active
3. **Add Adaptive Probe Volume** component(s) covering your scenes
4. **Re-bake** — APV generates its own probe grid; old probe data is not migrated
5. **Test dynamic objects** — verify characters and moving props receive correct indirect lighting

> **Warning:** Enabling APV disables all legacy Light Probe Groups in the project. This is a one-way switch per pipeline — there's no hybrid mode. Test in a separate branch first.

---

## Production Checklist

| Area | Check |
|------|-------|
| **Quality** | Verify no dark patches — enable dilation, check validity debug view |
| **Memory** | Profile APV VRAM usage via Rendering Debugger → Probe Volumes → Memory |
| **Streaming** | Test fast camera movements — no visible lighting pop-in |
| **Scenarios** | If using day/night, verify blend transition is smooth across all areas |
| **Mobile** | Use L1 SH bands, larger min probe spacing (3m+), disk streaming |
| **Multi-scene** | Use Baking Sets to bake lighting across additive scenes consistently |
| **VFX** | Particles and VFX Graph objects don't contribute to APV but can receive APV lighting |

---

## Breadcrumbs

- **Rendering Pipeline** → See [G10 Rendering Pipeline](G10_rendering_pipeline_urp_hdrp.md) for URP/HDRP setup context
- **Custom Render Passes** → See [G39 Render Graph](G39_render_graph_custom_passes.md) for integrating APV with custom rendering
- **GPU Optimization** → See [G40 GPU Rendering Optimization](G40_gpu_rendering_optimization.md) for draw call reduction alongside APV
- **Shader Graph** → See [G15 Shader Graph & VFX Graph](G15_shader_graph_vfx_graph.md) for custom shaders that sample APV
- **Large Worlds** → See [G35 Terrain & Large Worlds](G35_terrain_large_worlds.md) for combining APV streaming with terrain streaming
