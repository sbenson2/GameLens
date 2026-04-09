# G35 — MegaLights

> **Category:** guide · **Engine:** Unreal Engine 5.5+ · **Related:** [G9 Rendering — Nanite & Lumen](G9_rendering_nanite_lumen.md) · [G18 Material System & Shaders](G18_material_system_shaders.md)

MegaLights is a stochastic direct lighting system introduced as an **experimental** feature in Unreal Engine 5.5. It enables scenes with thousands of dynamic, movable, shadow-casting area lights at interactive frame rates — orders of magnitude more than the traditional deferred lighting pipeline supports. MegaLights achieves this by importance-sampling lights and tracing a fixed number of rays per pixel toward the most relevant sources, then denoising the result temporally and spatially.

---

## Prerequisites & Hardware Requirements

MegaLights requires **hardware ray tracing** support:

- NVIDIA RTX 2000 series or later
- AMD Radeon RX 6000 series or later
- Current-generation consoles (PlayStation 5, Xbox Series X|S)

Additionally, MegaLights depends on:

- **Hardware Lumen** — Software Lumen is not sufficient
- **Virtual Shadow Maps (VSM)** — must be enabled as the shadow map system

If your project targets hardware without RT support, MegaLights will not function. Plan a fallback lighting strategy using traditional deferred lights for lower-spec targets.

---

## Enabling MegaLights

### Project Settings (UE 5.5+)

1. **Enable Hardware Ray Tracing**: Project Settings → Platforms → Windows → Default RHI → DirectX 12. Then Project Settings → Engine → Rendering → Hardware Ray Tracing → Support Hardware Ray Tracing = true.
2. **Enable Lumen**: Project Settings → Engine → Rendering → Global Illumination → Dynamic Global Illumination Method = Lumen.
3. **Enable Virtual Shadow Maps**: Project Settings → Engine → Rendering → Shadows → Shadow Map Method = Virtual Shadow Maps.
4. **Enable MegaLights**: Project Settings → Engine → Rendering → MegaLights → Enable MegaLights = true.

Alternatively, use the console:

```
r.MegaLights.Enable 1
```

### Post Process Volume Override (UE 5.6+)

In UE 5.6, MegaLights settings can also be controlled per Post Process Volume, giving finer per-region control over quality and shadow method.

---

## How MegaLights Works

### Stochastic Direct Lighting

Traditional deferred rendering evaluates every light that overlaps a pixel. With hundreds or thousands of lights this becomes prohibitively expensive. MegaLights instead:

1. **Builds a light importance structure** each frame based on light intensity, distance, solid angle, and pixel surface orientation.
2. **Samples a fixed ray budget per pixel** (configurable) toward the most important lights.
3. **Traces shadow rays** using hardware ray tracing to determine visibility.
4. **Denoises** the stochastic result using a spatio-temporal filter to produce a stable, noise-free image.

This means cost scales with ray budget, not light count. A scene with 50 lights and a scene with 5,000 lights cost roughly the same to render.

### Shadow Methods

MegaLights supports two shadow sources, controlled by `r.MegaLights.DefaultShadowMethod`:

| Value | Method | Notes |
|-------|--------|-------|
| 0 | Ray Tracing (default) | Best quality soft shadows from area lights |
| 1 | Virtual Shadow Maps | Lower quality but avoids RT shadow cost; useful for consoles |

---

## Key Console Variables

| CVar | Default | Description |
|-------|---------|-------------|
| `r.MegaLights.Enable` | 0 | Master toggle for MegaLights |
| `r.MegaLights.Allow` | 1 | Per-scalability-level or device-profile override; set to 0 to disable on low-spec profiles |
| `r.MegaLights.DefaultShadowMethod` | 0 | 0 = Ray Tracing shadows, 1 = Virtual Shadow Maps |
| `r.MegaLights.SimpleLightMode` | 0 | Controls particle light handling: 0 = disabled, 2 = MegaLights handles all particle lights (requires shadow casting enabled per Niagara asset) |
| `r.MegaLights.MaxRaysPerPixel` | — | Controls the ray budget per pixel; higher values reduce noise but increase cost |

---

## Supported Light Types

MegaLights works with all standard UE5 light types when set to **Movable** mobility:

- **Point Lights** — treated as spherical area lights based on Source Radius
- **Spot Lights** — includes inner/outer cone and Source Radius
- **Rect Lights** — true rectangular area lights; best showcase for MegaLights soft shadows
- **Particle Lights** (via Niagara) — requires `SimpleLightMode` = 2 and per-asset shadow casting

**Static and Stationary** lights are **not** handled by MegaLights — they continue to use baked or stationary shadow paths.

---

## Performance Guidelines

### Budget Awareness

MegaLights cost is driven by:

1. **Ray count per pixel** — the primary quality/cost knob
2. **Screen resolution** — more pixels = more rays
3. **Scene complexity for RT traversal** — dense Nanite geometry increases BVH traversal cost
4. **Denoiser overhead** — relatively fixed but not free

### Optimization Strategies

- **Use `r.MegaLights.Allow 0` on low scalability levels** to fall back to traditional lights on weaker hardware.
- **Prefer Rect Lights over many small Point Lights** — Rect Lights produce superior area shadow quality and are more efficiently sampled.
- **Set Source Radius appropriately** — a zero-radius point light produces a hard shadow; give lights a physical size for soft shadows that denoise cleanly.
- **Limit overlapping light volumes** — while MegaLights handles thousands of lights globally, extremely dense overlapping light clusters still increase sampling variance and noise.
- **Profile with `stat gpu`** and the GPU Visualizer — look for `MegaLights` timing entries.

### Scalability Strategy

```
; DefaultScalability.ini — example for "Low" quality
[ShadowQuality@1]
r.MegaLights.Allow=0

[ShadowQuality@3]
r.MegaLights.Allow=1
r.MegaLights.DefaultShadowMethod=1  ; VSM shadows on High

[ShadowQuality@4]  ; "Cinematic"
r.MegaLights.Allow=1
r.MegaLights.DefaultShadowMethod=0  ; RT shadows on Cinematic
```

---

## Common Use Cases

### Interior Architectural Visualization

Hundreds of emissive light fixtures (recessed lighting, sconces, chandeliers) each casting realistic soft shadows — previously impossible without baking.

### Open-World Night Scenes

Street lights, vehicle headlights, neon signs, and window light spill across a city at night. MegaLights makes dynamic time-of-day with thousands of urban lights practical.

### Animated / Textured Area Lights

MegaLights supports animated textures on Rect Lights — useful for TV screens, monitors, or flickering fire that projects realistic, content-driven lighting into the scene.

---

## Known Limitations (UE 5.5 Experimental)

- **Experimental status** — quality and stability may not meet production standards; expect iteration across UE 5.6+.
- **No translucency shadow support** — translucent materials do not cast MegaLights shadows.
- **Foliage noise** — dense foliage with thin geometry can produce persistent noise at lower ray budgets.
- **Hardware RT required** — no software fallback for MegaLights shadows.
- **Mobile not supported** — MegaLights is a desktop/console feature.

---

## C++ Integration

### Checking MegaLights Availability at Runtime

```cpp
#include "RenderCore.h"

bool bMegaLightsAvailable = false;

// Check the CVar at runtime
static const auto* CVarMegaLightsEnable = IConsoleManager::Get().FindTConsoleVariableDataInt(TEXT("r.MegaLights.Enable"));
if (CVarMegaLightsEnable)
{
    bMegaLightsAvailable = CVarMegaLightsEnable->GetValueOnGameThread() > 0;
}

// Use this to conditionally adjust gameplay lighting
// e.g., spawn fewer fallback lights when MegaLights is active
```

### Toggling MegaLights via Device Profiles

In your `DeviceProfiles.ini`, you can set per-platform overrides:

```ini
[Windows DeviceProfile]
+CVars=r.MegaLights.Enable=1

[XboxSeriesX DeviceProfile]
+CVars=r.MegaLights.Enable=1
+CVars=r.MegaLights.DefaultShadowMethod=1

[Switch DeviceProfile]
+CVars=r.MegaLights.Allow=0
```

---

## Migration from Traditional Lights

If converting an existing level to use MegaLights:

1. Enable MegaLights in project settings (see above).
2. Convert Stationary lights to **Movable** — MegaLights only processes Movable lights.
3. Set appropriate **Source Radius** / **Source Width × Height** on all lights for physically-based area shadows.
4. Remove manual shadow bias hacks — MegaLights uses ray-traced visibility, not shadow maps per light.
5. Profile and iterate on ray budget vs. visual quality.

---

## Further Reading

- [MegaLights Documentation (Epic)](https://dev.epicgames.com/documentation/unreal-engine/megalights-in-unreal-engine)
- [MegaLights: Stochastic Direct Lighting in UE5 (SIGGRAPH 2025)](https://advances.realtimerendering.com/s2025/content/MegaLights_Stochastic_Direct_Lighting_2025.pdf)
- [G9 — Rendering: Nanite & Lumen](G9_rendering_nanite_lumen.md) — companion guide for the global illumination and geometry systems MegaLights builds on
