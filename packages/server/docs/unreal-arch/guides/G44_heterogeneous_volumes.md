# Heterogeneous Volumes & Sparse Volume Textures

> **Category:** guide · **Engine:** Unreal Engine 5.3+ (Production-ready 5.7) · **Related:** [G17 Niagara VFX System](G17_niagara_vfx_system.md), [G9 Rendering — Nanite & Lumen](G9_rendering_nanite_lumen.md), [G18 Material System & Shaders](G18_material_system_shaders.md)

Unreal Engine's Heterogeneous Volumes system renders physically-based volumetric media — smoke, fire, clouds, fog, and atmospheric effects — by sampling Sparse Volume Textures (SVTs). Unlike uniform volumetric fog, heterogeneous volumes support spatially-varying density, color, temperature, and emission, enabling cinematic-quality volumetric effects in real-time. This guide covers the SVT pipeline, rendering approaches, Niagara Fluids integration, and performance optimization.

---

## Core Concepts

### Sparse Volume Textures (SVTs)

Sparse Volume Textures store 3D voxel data using a **page-table architecture** that only allocates memory for non-empty regions:

```
┌─────────────────────────────────────────────┐
│            Sparse Volume Texture              │
│                                               │
│  ┌──────────────┐    ┌──────────────────┐    │
│  │  Page Table   │───▶│ Physical Tile    │    │
│  │  (3D Texture) │    │ Data Texture     │    │
│  │               │    │ (dense storage)  │    │
│  └──────────────┘    └──────────────────┘    │
│                                               │
│  • Voxel data chunked into 3D tiles          │
│  • Only non-empty tiles written to physical  │
│  • Page table maps virtual → physical coords │
│  • 3D UV indexing for material sampling       │
└─────────────────────────────────────────────┘
```

**Key properties:**
- **Memory-efficient** — empty space costs almost nothing; large volumes use the same memory as dense textures of much smaller resolution.
- **OpenVDB import** — SVTs can be created from OpenVDB files (`.vdb`), the industry-standard volumetric data format from DreamWorks Animation.
- **Animated sequences** — SVTs support frame sequences for baked fluid simulations (smoke plumes, explosions, etc.).
- **Material sampling** — volume-domain materials read SVT data via dedicated material nodes (`Sparse Volume Texture Sample`).

### Importing SVTs

1. **Export from DCC** — Use Houdini, Blender, or EmberGen to export `.vdb` files containing density, temperature, velocity, and flame fields.
2. **Import into UE** — Drag `.vdb` files into the Content Browser. UE converts them to `USparseVolumeTexture` assets.
3. **Animated sequences** — Import numbered `.vdb` files (e.g., `smoke_001.vdb` through `smoke_120.vdb`) and UE creates an `USparseVolumeTextureFrame` sequence.

---

## Rendering Approaches

UE provides four methods for rendering volumetric data. Choose based on your use case:

### 1. Heterogeneous Volume Actor (Recommended for General Use)

The `AHeterogeneousVolume` actor renders volume-domain materials that sample from SVTs. This is the **most flexible and highest-quality** approach.

**Setup:**
1. Place a **Heterogeneous Volume** actor in your level.
2. Assign an SVT asset to its `Sparse Volume Texture` property.
3. Create a volume-domain material using the `Substrate` or `Volumetric Advanced` shading model.
4. Connect SVT sample nodes to drive density, albedo, and emission.

**C++ — Spawning a Heterogeneous Volume at Runtime:**
```cpp
// Requires: HeterogeneousVolumes plugin enabled
#include "HeterogeneousVolumes/HeterogeneousVolumeComponent.h"

void AMyActor::SpawnVolume()
{
    FActorSpawnParameters Params;
    AHeterogeneousVolume* Volume = GetWorld()->SpawnActor<AHeterogeneousVolume>(
        AHeterogeneousVolume::StaticClass(),
        GetActorLocation(),
        FRotator::ZeroRotator,
        Params
    );

    // Assign the SVT asset (loaded via soft reference or asset path)
    if (USparseVolumeTexture* SVT = LoadObject<USparseVolumeTexture>(
        nullptr, TEXT("/Game/VFX/Volumes/SmokePlume_SVT")))
    {
        Volume->GetVolumeComponent()->SetSparseVolumeTexture(SVT);
    }
}
```

**Material graph essentials:**
- `Sparse Volume Texture Sample` — reads density/temperature/velocity from the SVT at the current ray-march position.
- `Volume Albedo` — controls scattering color (what color light scatters through the medium).
- `Volume Extinction` — controls how quickly light is absorbed (higher = denser, more opaque).
- `Volume Emission` — adds self-illumination (fire glow, hot gas emission).

### 2. Volumetric Fog Integration

SVTs can feed into the global **Exponential Height Fog** system's volumetric fog pass. This is lower quality but integrates with the standard fog pipeline.

**When to use:** Large-scale atmospheric haze, ground fog with spatially varying density.

### 3. Volumetric Cloud Actor

The `VolumetricCloud` actor supports SVT sampling for authoring non-procedural cloud shapes.

**When to use:** Hero cloud formations, storm systems, cinematic cloud layers.

### 4. Path Tracer

The Path Tracer fully supports heterogeneous volume rendering with correct multi-scattering and emission. Use for offline rendering, cinematics, and reference images.

---

## Niagara Fluids Integration

Niagara Fluids is UE's real-time fluid simulation system built on top of Niagara. It produces smoke, fire, and liquid simulations that output directly to SVTs.

### Pipeline

```
Niagara Fluid Simulation
        │
        ▼
   SVT Cache (baked frames)
        │
        ▼
  Heterogeneous Volume Actor
        │
        ▼
   Volume-Domain Material
        │
        ▼
     Rendered Output
```

### Creating a Niagara Fluid Effect

1. **Create a Niagara System** — use the `Grid 3D Gas` template for smoke/fire or `Grid 3D Liquid` for water.
2. **Configure simulation** — set grid resolution, domain size, buoyancy, turbulence, and combustion parameters.
3. **Cache to SVT** — enable `Cache to Sparse Volume Texture` on the emitter. Niagara writes simulation frames as SVT data.
4. **Render** — attach the cached SVT to a Heterogeneous Volume actor or sample directly in the Niagara renderer.

**Performance note (UE 5.5+):** Niagara fluid caches are stored internally as SVTs, improving memory usage and playback performance compared to the older dense grid format.

### Real-Time vs. Baked

| Mode | Use Case | Performance |
|------|----------|-------------|
| **Real-time simulation** | Interactive effects (player-triggered explosions) | GPU-intensive; limit grid resolution to 128^3 or lower |
| **Baked SVT playback** | Cinematic smoke, environmental fire | Cheap at runtime; limited to pre-simulated results |
| **Hybrid** | Base baked + real-time turbulence overlay | Balanced; common for AAA environments |

---

## Volume-Domain Materials

### Basic Smoke Material

```
[Sparse Volume Texture Sample]
    ├── Density ──▶ [Multiply] ──▶ Volume Extinction
    ├── Temperature ──▶ [Lerp (cold→hot color)] ──▶ Volume Emission
    └── Albedo ──▶ Volume Albedo
```

**Key parameters:**
- `Extinction Scale` — global density multiplier. Start at 1.0, increase for thicker smoke.
- `Albedo` — scattering color. Pure white for realistic smoke; tint for stylized effects.
- `Emission Temperature Ramp` — map temperature values to a color gradient (black → red → orange → white) for fire.

### Substrate Volume Materials (UE 5.7+)

With Substrate enabled, volume materials gain access to the full Substrate operator stack:
- **Slab BSDF with volume properties** — physically correct absorption and scattering.
- **Layered volumes** — combine smoke and fire as separate slabs with proper transmittance.

---

## Performance Optimization

### Memory Management

- **SVT resolution** — reduce voxel resolution for distant or non-hero volumes. 64^3 is often sufficient for background smoke.
- **Frame count** — for animated SVTs, reduce frame count by baking at lower temporal resolution and enabling interpolation.
- **Streaming** — SVTs support mip-level streaming. Enable `Virtual Volume Texture` mode for large datasets.

### Rendering Cost

- **Ray march step count** — the primary performance knob. Heterogeneous volumes default to 256 steps; reduce to 64–128 for distant volumes.
- **Shadow step count** — self-shadowing ray march steps. Reduce for non-hero volumes.
- **Max ray depth** — controls multi-scattering approximation depth in the path tracer.

### Scalability

```cpp
// Adjust volume quality per scalability group
// In DefaultScalability.ini:
// [ViewDistanceQuality@2]  ; Medium
// r.HeterogeneousVolumes.MaxStepCount=128
// [ViewDistanceQuality@3]  ; High
// r.HeterogeneousVolumes.MaxStepCount=256
```

### Console Variables

| CVar | Default | Description |
|------|---------|-------------|
| `r.HeterogeneousVolumes` | 1 | Enable/disable heterogeneous volume rendering |
| `r.HeterogeneousVolumes.MaxStepCount` | 256 | Maximum ray-march steps per pixel |
| `r.HeterogeneousVolumes.ShadowStepCount` | 16 | Steps for self-shadow ray march |
| `r.HeterogeneousVolumes.Jitter` | 1 | Jitter ray-march start position (reduces banding) |

---

## Common Patterns

### Environmental Smoke / Fog Banks

Place heterogeneous volumes at key locations with baked low-resolution SVTs. Use lower step counts and rely on the volumetric fog system for fill.

### Cinematic Explosions

1. Simulate in Houdini (Pyro solver) at high resolution.
2. Export `.vdb` sequence with density, temperature, and velocity fields.
3. Import as animated SVT.
4. Render with heterogeneous volume actor + emission material.
5. For final pixels, use the Path Tracer for multi-scattering accuracy.

### Interactive Fire (Runtime)

1. Use Niagara Fluids `Grid 3D Gas` with combustion enabled.
2. Keep grid resolution at 64^3 to 128^3 for real-time performance.
3. Render via Niagara's built-in volume renderer (no separate actor needed).
4. Scale down simulation on lower hardware using Niagara scalability settings.

---

## Plugin Requirements

| Plugin | Required For |
|--------|-------------|
| `HeterogeneousVolumes` | `AHeterogeneousVolume` actor and component |
| `NiagaraFluids` | Niagara fluid simulation templates |
| `SparseVolumeTexture` | SVT asset import and management (enabled by default in 5.5+) |

Enable these in **Edit → Plugins** and restart the editor.

---

## Version History

| Version | Status | Key Changes |
|---------|--------|-------------|
| UE 5.1 | Experimental | Initial heterogeneous volume support |
| UE 5.3 | Experimental | SVT import pipeline, Niagara Fluids integration |
| UE 5.5 | Beta | Niagara fluid caches as SVTs, improved ray marching |
| UE 5.7 | Production-ready | Stable API, Substrate volume materials, performance improvements |
