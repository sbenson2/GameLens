# G68 — HDRP Environmental Effects: Water, Volumetric Clouds & Fog

> **Category:** guide · **Engine:** Unity 6 (6000.x, HDRP 17.x) · **Related:** [G10 Rendering Pipeline](G10_rendering_pipeline_urp_hdrp.md) · [G39 Render Graph](G39_render_graph_custom_passes.md) · [G49 Adaptive Probe Volumes](G49_adaptive_probe_volumes_lighting.md)

HDRP ships with physically-based environmental systems — water surfaces with scriptable buoyancy, volumetric clouds driven by weather maps, and volumetric fog with local density volumes. This guide covers setup, scripting, and performance tuning for each system.

> **HDRP only.** These features require the High Definition Render Pipeline. They are **not** available in URP. As of Unity 6, HDRP is in maintenance mode — these systems remain supported but new rendering features ship in URP first.

---

## Water System

### Overview

The HDRP Water System (introduced in Unity 2022 LTS, HDRP 14.x) simulates realistic water surfaces using multi-band spectral simulation. It supports three surface types, each with different wave simulation bands:

| Surface Type | Simulation Bands | Use Case |
|---|---|---|
| **Ocean / Sea / Lake** | 3 bands (2 Swell + 1 Ripple) | Open water, large bodies |
| **River** | 2 bands (1 Agitation + 1 Ripple) | Flowing water, streams |
| **Pool** | 1 band (Ripple only) | Small contained water, puddles |

### Setup

Enabling the water system requires changes in three places:

```
Step 1 — HDRP Asset
  Project Settings > Graphics > HDRP Global Settings
    → Frame Settings > Camera > Rendering → enable Water
    → Frame Settings > Realtime Reflection > Rendering → enable Water
    → Frame Settings > Baked or Custom Reflection > Rendering → enable Water

Step 2 — Scene Volume
  Add a Volume with a Water override (or use your global Volume)

Step 3 — Water Surface GameObject
  GameObject > Water Surface > Ocean (or River / Pool)
```

### Water Surface Properties

Key properties on the WaterSurface component:

- **Surface Type** — Ocean/Sea/Lake, River, or Pool
- **Simulation** — wave amplitude, wind speed/orientation, choppiness
- **Appearance** — refraction, scattering, caustics, foam generation
- **Masking** — texture masks to define where water appears (useful for shorelines)
- **Script Interactions** — must be enabled for C# height queries (buoyancy)

### Scripting: Buoyancy with Height Queries

To float objects on the water surface, you query the simulated height at a world-space position. This requires enabling **Script Interactions** on both the HDRP Asset and the individual WaterSurface.

```csharp
using UnityEngine;
using UnityEngine.Rendering.HighDefinition;

/// <summary>
/// Simple buoyancy — snaps a single GameObject to the water surface height.
/// Attach to any GameObject and assign the target WaterSurface in the Inspector.
/// Requires: HDRP 14+, Script Interactions enabled on the water surface.
/// </summary>
public class FitToWaterSurface : MonoBehaviour
{
    [Tooltip("The water surface to query for height data")]
    public WaterSurface targetSurface;

    void Update()
    {
        if (targetSurface == null) return;

        // Build search parameters — tells the system where to project
        WaterSearchParameters searchParams = new WaterSearchParameters();
        searchParams.startPositionWS = transform.position;
        // Target the same XZ but at a neutral Y — the system finds the surface
        searchParams.targetPositionWS = transform.position;
        // Error tolerance in world units (smaller = more precise, more iterations)
        searchParams.error = 0.01f;
        // Max iterations for the projection solver
        searchParams.maxIterations = 8;

        // Perform the height query
        WaterSearchResult searchResult = new WaterSearchResult();
        if (targetSurface.ProjectPointOnWaterSurface(searchParams, out searchResult))
        {
            // Apply the projected position — keeps XZ, adjusts Y to water height
            transform.position = searchResult.projectedPositionWS;
        }
    }
}
```

### Batch Buoyancy with Jobs + Burst

For many floating objects (boats, debris, buoys), use the job system to query heights in parallel:

```csharp
using Unity.Collections;
using Unity.Jobs;
using Unity.Mathematics;
using UnityEngine;
using UnityEngine.Rendering.HighDefinition;

/// <summary>
/// High-performance buoyancy for many objects using Burst-compiled jobs.
/// Queries all positions in a single batch instead of one-by-one.
/// </summary>
public class BatchBuoyancy : MonoBehaviour
{
    public WaterSurface waterSurface;
    public Transform[] floatingObjects;

    void Update()
    {
        if (waterSurface == null || floatingObjects.Length == 0) return;

        int count = floatingObjects.Length;

        // Allocate temporary native arrays for the job
        // TempJob = short-lived, freed this frame
        var positions = new NativeArray<float3>(count, Allocator.TempJob);
        var errors = new NativeArray<float>(count, Allocator.TempJob);
        var projectedPositions = new NativeArray<float3>(count, Allocator.TempJob);
        var normals = new NativeArray<float3>(count, Allocator.TempJob);
        var steps = new NativeArray<int>(count, Allocator.TempJob);

        // Fill input data from transforms
        for (int i = 0; i < count; i++)
        {
            positions[i] = floatingObjects[i].position;
            errors[i] = 0.01f;  // Per-object error tolerance
            steps[i] = 8;       // Per-object max iterations
        }

        // Create the search job — uses Burst for SIMD-optimized queries
        var searchJob = new WaterSimulationSearchJob();
        // FillWaterSearchData populates internal simulation state the job needs
        waterSurface.FillWaterSearchData(ref searchJob.simSearchData);
        searchJob.targetPositionWSBuffer = positions;
        searchJob.startPositionWSBuffer = positions;
        searchJob.errorBuffer = errors;
        searchJob.projectedPositionWSBuffer = projectedPositions;
        searchJob.normalWSBuffer = normals;
        searchJob.stepCountBuffer = steps;

        // Schedule and complete — innerLoopBatchCount=1 for water queries
        var handle = searchJob.Schedule(count, 1);
        handle.Complete();

        // Apply results back to transforms
        for (int i = 0; i < count; i++)
        {
            floatingObjects[i].position = projectedPositions[i];
        }

        // Clean up native arrays
        positions.Dispose();
        errors.Dispose();
        projectedPositions.Dispose();
        normals.Dispose();
        steps.Dispose();
    }
}
```

> **Limitation:** Buoyancy queries produce incorrect results for water surfaces that use **masking** textures. If you need masked shorelines, handle the transition in your own code.

---

## Volumetric Clouds

### Overview

HDRP's Volumetric Clouds generate ray-marched clouds directly in the rendering pipeline using noise-based shaping. The system uses a two-step generation process:

1. **Shaping** — large-scale noise creates general cloud formations (cumulus, stratus, etc.)
2. **Erosion** — smaller-scale noise carves detail into cloud edges

Clouds are controlled through the Volume framework with a **Volumetric Clouds** override.

### Setup

```
Step 1 — Enable in HDRP Asset
  Project Settings > Quality > HDRP > Lighting > Volumetric Clouds → enable

Step 2 — Add Volume Override
  Select your global Volume > Add Override > Sky > Volumetric Clouds

Step 3 — Choose a cloud preset or configure manually
  Simple / Quality presets available, or use Custom for full control
```

### Cloud Configuration

Key override properties on the Volumetric Clouds component:

| Property | Purpose | Notes |
|---|---|---|
| **Cloud Preset** | Quick presets: Sparse, Cloudy, Overcast, Storm | Use Custom for full control |
| **Cloud Map** | 2D texture controlling cloud density from above | Disable sRGB, use no compression |
| **Shape Factor / Offset** | Controls overall cloud coverage | Higher = more sky visible |
| **Erosion Factor** | Detail level at cloud edges | Higher = more wispy edges |
| **Wind** | Global wind orientation and speed | Affects cloud drift direction |
| **Temporal Accumulation** | Frame blending for smooth rendering | Lower values during editing for instant feedback |
| **Shadows** | Cloud shadows on the ground | Screen-space, significant performance cost |

### Cloud Map Textures

When importing cloud map textures:

- **Disable sRGB** — cloud maps are data textures, not color
- **Disable compression** — compression introduces artifacts in density lookup
- R channel = cloud density, G channel = cloud type (0 = stratus, 1 = cumulus)

### Performance Considerations

```
Performance Budget (approximate, 1080p)
─────────────────────────────────────────
Volumetric Clouds (no shadows): ~1.5–3ms GPU
Volumetric Clouds (with shadows): ~3–5ms GPU
Reflection Probes with clouds:   additional ~1ms per probe

Optimization tips:
├── Disable clouds on Planar Reflection Probes (off by default)
├── Use lower Temporal Accumulation during gameplay transitions
├── Limit cloud shadow distance
└── Consider cloud presets over custom for mobile GPU targets
```

> **Reflection probes:** Volumetric clouds are disabled by default on Planar and Realtime Reflection Probes due to performance cost. When enabled, clouds render at reduced resolution without temporal accumulation.

### Interaction with Water

Water renders **in front of** Volumetric Clouds when viewed from above. This means aerial cameras looking down at an ocean with clouds below will see water on top. Plan your camera angles accordingly, or use a cloud altitude that keeps clouds above your maximum camera height.

---

## Volumetric Fog

### Overview

Volumetric Fog in HDRP simulates light scattering through participating media — fog, mist, dust, smoke. Unlike screen-space fog, it's computed in 3D, so lights produce visible shafts and halos.

### Global Fog Setup

```
Step 1 — Enable in HDRP Asset
  Lighting section → enable Volumetrics

Step 2 — Add Fog Volume Override
  Global Volume > Add Override > Fog
  Set Base Height, Maximum Height, Mean Free Path (density)

Step 3 — Enable Volumetric Fog checkbox in the Fog override
  This activates 3D light scattering (vs. simple distance fog)
```

### Key Fog Properties

- **Mean Free Path** — average distance light travels before scattering. Lower = denser fog.
- **Base Height / Maximum Height** — vertical bounds of the fog layer
- **Color Mode** — Constant Color or Single Scattering (physically based)
- **Denoise** — temporal denoising to reduce noise from low sample counts

### Local Volumetric Fog (Density Volumes)

For localized fog effects (smoke stacks, cave entrances, underwater haze):

```
GameObject > Volume > Local Volumetric Fog

Properties:
├── Size — 3D bounding box of the effect
├── Blend Distance — soft fade at edges
├── Fog Distance — density of the local fog
├── Density Mask Texture — 3D texture for shaped fog (smoke columns, etc.)
└── Scroll Speed — animate the density mask for dynamic effects
```

### Scripting Fog Parameters

```csharp
using UnityEngine;
using UnityEngine.Rendering;
using UnityEngine.Rendering.HighDefinition;

/// <summary>
/// Dynamically adjusts fog density based on game state.
/// Useful for weather transitions, entering caves, underwater effects.
/// Requires a Volume with a Fog override on the same GameObject or in the scene.
/// </summary>
public class DynamicFogController : MonoBehaviour
{
    [Tooltip("The Volume component containing the Fog override")]
    public Volume fogVolume;

    [Tooltip("Target mean free path — lower values = denser fog")]
    public float targetDensity = 50f;

    [Tooltip("Transition speed in units per second")]
    public float transitionSpeed = 10f;

    private Fog _fog;

    void Start()
    {
        // Try to extract the Fog override from the Volume profile
        if (fogVolume != null &&
            fogVolume.profile.TryGet<Fog>(out var fog))
        {
            _fog = fog;
        }
    }

    void Update()
    {
        if (_fog == null) return;

        // Smoothly interpolate the mean free path toward the target
        // meanFreePath is a VolumeParameter<float>, access via .value
        float current = _fog.meanFreePath.value;
        _fog.meanFreePath.value = Mathf.MoveTowards(
            current, targetDensity, transitionSpeed * Time.deltaTime
        );
    }

    /// <summary>
    /// Call from gameplay events (entering a cave, weather change, etc.)
    /// </summary>
    public void SetFogDensity(float newMeanFreePath)
    {
        targetDensity = newMeanFreePath;
    }
}
```

---

## Combining Environmental Effects

These three systems work together for cohesive environments. Here's a typical outdoor scene layering:

```
Scene Stack (bottom to top in rendering order)
──────────────────────────────────────────────
1. Skybox / HDRI Sky
2. Volumetric Clouds — ray-marched above the scene
3. Volumetric Fog — fills the scene volume with scattering
4. Water Surface — ocean/lake with reflection, refraction, caustics
5. Local Volumetric Fog — mist above water, cave entrances
```

### Weather Transition Pattern

```csharp
using UnityEngine;
using UnityEngine.Rendering;
using UnityEngine.Rendering.HighDefinition;

/// <summary>
/// Coordinates weather transitions across multiple environmental systems.
/// Blend between "clear" and "stormy" presets by interpolating Volume weights.
/// </summary>
public class WeatherSystem : MonoBehaviour
{
    [Header("Volume Profiles")]
    [Tooltip("Volume for clear weather settings")]
    public Volume clearWeatherVolume;

    [Tooltip("Volume for storm weather settings")]
    public Volume stormWeatherVolume;

    [Header("Transition")]
    [Range(0f, 1f)]
    public float stormIntensity = 0f;

    [Tooltip("How fast weather changes (0-1 per second)")]
    public float transitionRate = 0.1f;

    private float _targetIntensity = 0f;

    void Update()
    {
        // Smoothly blend toward target weather state
        stormIntensity = Mathf.MoveTowards(
            stormIntensity, _targetIntensity,
            transitionRate * Time.deltaTime
        );

        // Volume weights control blending — clear fades out as storm fades in
        clearWeatherVolume.weight = 1f - stormIntensity;
        stormWeatherVolume.weight = stormIntensity;
    }

    /// <summary>
    /// Trigger from gameplay: 0 = clear, 1 = full storm.
    /// The Volume system blends cloud density, fog, wind, and lighting together.
    /// </summary>
    public void SetWeather(float intensity)
    {
        _targetIntensity = Mathf.Clamp01(intensity);
    }
}
```

**Tip:** Create two Volume profiles — one for clear skies (sparse clouds, light fog, calm water) and one for storms (overcast clouds, dense fog, rough water). Blend between them using Volume weight for seamless transitions.

---

## Performance Summary

| System | Approx. GPU Cost (1080p) | Primary Optimization |
|---|---|---|
| Water Surface (Ocean) | 1–2ms | Reduce simulation bands, lower tessellation |
| Water Script Interactions | CPU cost | Use batch jobs, limit query count |
| Volumetric Clouds | 1.5–5ms | Disable cloud shadows, use presets |
| Volumetric Fog (Global) | 0.5–1.5ms | Reduce volumetric slice count |
| Local Volumetric Fog | 0.2–0.5ms each | Limit count, use blend distance |

> **Profiler tip:** Use the HDRP Render Graph Viewer (Window > Analysis > Render Graph Viewer) to see exactly which environmental passes are consuming your GPU budget.

---

## Common Pitfalls

1. **Water not visible** — Check all three Frame Settings locations (Camera, Realtime Reflection, Baked Reflection)
2. **Buoyancy returns wrong heights** — Ensure Script Interactions is enabled on both the HDRP Asset *and* the WaterSurface component
3. **Cloud edits feel laggy** — Lower Temporal Accumulation Factor while editing; raise it for final quality
4. **Fog looks noisy** — Enable Denoise in the Fog override; increase volumetric sample count in HDRP Asset
5. **Performance drop with reflections** — Disable Volumetric Clouds on Reflection Probes (they're off by default for a reason)
