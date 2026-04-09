# G26 — Lighting and Environment Setup

> **Category:** Guide · **Engine:** Stride · **Related:** [Stride Architecture Rules](../stride-arch-rules.md), [G24 — Material System and PBR](G24_material_system_pbr.md), [G07 — Custom Render Features](G07_custom_render_features.md)

Stride's PBR rendering pipeline requires properly configured lighting to produce realistic visuals. Unlike rasterized engines that fake illumination, PBR materials respond physically to light — a perfectly authored material still looks flat without correct lighting. This guide covers Stride's light types, shadow configuration, light probes for indirect illumination, environment lighting, reflection probes, and the post-processing stack that ties it all together.

---

## Table of Contents

1. [Lighting System Overview](#1--lighting-system-overview)
2. [Direct Light Types](#2--direct-light-types)
3. [Shadow Mapping](#3--shadow-mapping)
4. [Light Probes — Indirect Illumination](#4--light-probes--indirect-illumination)
5. [Environment Lighting](#5--environment-lighting)
6. [Local Reflections](#6--local-reflections)
7. [Post-Processing Stack](#7--post-processing-stack)
8. [Lighting in Code](#8--lighting-in-code)
9. [Performance Tuning](#9--performance-tuning)
10. [Common Lighting Mistakes](#10--common-lighting-mistakes)

---

## 1 — Lighting System Overview

Stride uses a Forward+ rendering pipeline with clustered lighting. This means:

- **Many lights per scene** — the clustered approach bins lights into screen-space tiles, so hundreds of lights are feasible without deferred rendering's G-buffer overhead
- **PBR response** — all lights interact with materials through physically based BRDF calculations (metallic/roughness workflow)
- **Direct + indirect** — direct lights (point, spot, directional) provide primary illumination; light probes and environment maps provide indirect/ambient illumination

A complete lighting setup typically includes at least one directional light (sun), an environment map (skybox/ambient), and light probes for indirect bounce lighting.

## 2 — Direct Light Types

### Directional Light

Simulates a distant light source (sun, moon). Affects the entire scene uniformly.

- **Intensity** — in lux; outdoor sun is typically 100,000+ lux, but Stride normalizes so values of 1.0–20.0 are common
- **Color** — warm white for sun (~6500K), cooler for overcast or moonlight
- **Shadow** — cascaded shadow maps with configurable cascade count and distances

To add in the editor: right-click in the Scene Editor → Add → Light → Directional Light.

### Point Light

Emits light in all directions from a single position. Use for lamps, torches, explosions.

- **Range** — the maximum distance light reaches; beyond this, intensity is zero
- **Attenuation** — follows inverse-square falloff by default
- **Shadow** — omnidirectional shadow maps (cube map rendering, expensive)

### Spot Light

A cone-shaped light. Use for flashlights, stage lights, headlights.

- **Inner/Outer angle** — controls the cone's bright center and soft falloff edge
- **Range** — maximum reach of the cone
- **Projective texture** — optional texture projected through the cone (e.g., a gobo pattern)

### Ambient Light

A flat, directionless fill light. Useful for quick prototyping but produces unrealistic results in PBR scenes. Prefer environment lighting or light probes for ambient illumination in production.

## 3 — Shadow Mapping

Stride supports several shadow techniques depending on the light type.

### Cascaded Shadow Maps (Directional Lights)

Directional lights use cascaded shadow maps (CSM) to balance quality near the camera with coverage of distant geometry:

- **Cascade count** — 1 to 4 cascades; more cascades = better quality at distance, higher cost
- **Split distances** — how far each cascade extends; Stride auto-calculates based on camera far plane, but you can override
- **Shadow map resolution** — per cascade; 1024×1024 is a good default, 2048 for high quality
- **Depth bias** — prevents shadow acne; too high causes peter-panning (shadows detaching from objects)

### Shadow Filtering

Stride offers several shadow filtering modes:

- **PCF (Percentage Closer Filtering)** — basic soft shadows, low cost
- **PCSS (Percentage Closer Soft Shadows)** — contact-hardening shadows that are sharper near the caster and softer farther away
- **VSM (Variance Shadow Maps)** — smooth shadows with potential light bleeding artifacts

Configure shadow filtering on the light component in the Property Grid.

### Omnidirectional Shadows (Point Lights)

Point light shadows render the scene into a cube map — six faces per light per frame. This is expensive:

- Limit the number of shadow-casting point lights (2–4 in a typical scene)
- Use smaller shadow map resolutions (512×512) for point lights
- Consider disabling shadows on distant or minor point lights

## 4 — Light Probes — Indirect Illumination

Light probes capture indirect lighting at specific positions in the scene and interpolate between them to approximate global illumination for both static and dynamic objects.

### How Light Probes Work

1. Stride places probes at positions you specify in the scene
2. During a bake step (triggered from the editor), each probe captures the incoming light from all directions
3. At runtime, objects sample the four nearest probes (forming a tetrahedron) and blend their lighting contributions based on position
4. The result simulates diffuse light bouncing off nearby surfaces — colored walls tinting a white floor, for example

### Placement Guidelines

- **Minimum four probes** — you need at least four to form a tetrahedron for 3D interpolation
- **Grid placement** — a regular grid across walkable areas is the simplest approach; density depends on how much lighting varies spatially
- **Key transition points** — place extra probes at doorways, shadow boundaries, and color transitions (e.g., where a red wall meets a blue wall)
- **Vertical variation** — if your scene has multiple floors or significant vertical lighting changes, add probes at different heights

### Configuring Bounces

In the Scene Editor, open the lighting options menu and set the number of bounces:

- **1 bounce** — captures direct light only (light reflects off surfaces once)
- **2+ bounces** — simulates multiple reflections; brightens dark corners and adds color bleeding
- **Diminishing returns** — beyond 3 bounces, the visual difference is negligible for most scenes

### Light Probe Limitations

- Probes capture **diffuse** indirect light only — they don't provide specular reflections (use environment maps or local reflections for that)
- Probe data is **baked** — if you move lights or geometry, you need to re-bake
- Large open areas with uniform lighting need fewer probes; complex interiors with varied lighting need more

## 5 — Environment Lighting

Environment lighting provides ambient illumination from a surrounding environment map (typically a cubemap or HDR skybox). This is Stride's primary method for image-based lighting (IBL).

### Skybox Component

The `BackgroundComponent` renders a skybox and the `LightComponent` with a skybox light type uses the same cubemap for IBL:

1. Create or import an HDR cubemap texture (`.dds` or `.hdr`)
2. Add a `BackgroundComponent` to an entity → assign the cubemap as the texture
3. Add a `LightComponent` to the same or another entity → set type to **Skybox** → assign the same cubemap
4. The skybox light contributes both diffuse irradiance and specular reflections to all PBR materials

### HDR Environment Maps

For realistic IBL, use HDR environment maps rather than LDR:

- HDR maps preserve high-intensity light values (sun hotspots, bright windows), producing convincing specular highlights
- Sources: capture your own with a 360° camera, or use free HDRI libraries (Poly Haven, HDR Haven)
- Stride expects cubemap format — use the asset pipeline to convert equirectangular HDRIs to cubemaps on import

### Environment Lighting vs. Light Probes

| Feature | Environment Lighting | Light Probes |
|---------|---------------------|-------------|
| Source | Single cubemap (global) | Multiple baked positions (local) |
| Diffuse | Yes (uniform across scene) | Yes (varies by position) |
| Specular | Yes (reflections) | No |
| Spatial variation | None (same everywhere) | Yes (interpolated between probes) |
| Dynamic objects | Yes | Yes |
| Best for | Outdoor scenes, uniform ambient | Interiors, varied indirect lighting |

For best results, use both: environment lighting for specular reflections and overall ambient, light probes for spatially varying diffuse indirect.

## 6 — Local Reflections

Stride's screen-space local reflections (SSR) provide real-time reflections that react to scene geometry, replacing or supplementing environment map reflections.

### How SSR Works

SSR traces rays in screen space against the depth buffer. When a ray hits geometry, it samples the color buffer at that point to produce a reflection. Advantages:

- Reflections match the actual scene (not a static cubemap)
- Dynamic objects appear in reflections
- No additional rendering passes for reflected geometry

### Limitations

- **Screen-space only** — objects outside the screen cannot be reflected; SSR falls back to the environment map at edges
- **Performance cost** — depends on resolution and ray march quality; budget 1–3ms on mid-range hardware
- **Rough surfaces** — SSR works best on smooth/glossy surfaces; very rough materials show minimal reflections anyway

### Configuration

In the editor, add a **Local Reflections** post-processing effect to your graphics compositor:

- **Resolution** — full, half, or quarter resolution for the reflection trace
- **Max ray steps** — higher = more accurate reflections at distance, higher cost
- **Thickness** — controls how thick objects appear for ray intersection; too thin causes missed reflections, too thick causes false hits

## 7 — Post-Processing Stack

Stride's post-processing effects enhance the final rendered image. These are configured in the Graphics Compositor.

### Key Effects

- **Bloom** — bright areas bleed light into surrounding pixels; controlled by threshold and intensity
- **Ambient Occlusion (SSAO)** — darkens creases and corners where ambient light is occluded; adds depth without additional lights
- **Depth of Field** — blurs objects outside a focal range, simulating camera lens behavior
- **Tone Mapping** — maps HDR render values to displayable LDR range; Stride supports Reinhard, ACES, and filmic operators
- **Color Grading** — LUT-based color correction for stylistic looks (warm, cool, desaturated, etc.)
- **Anti-Aliasing** — FXAA (fast, slight blur) or TAA (temporal, better quality, slight ghosting)

### Compositor Setup

Post-processing effects are chained in the Graphics Compositor:

1. Open the **Graphics Compositor** asset in Game Studio
2. Find the **Post-Processing** node in the compositor graph
3. Add or remove effects, configure their parameters
4. Effects execute in order — order matters (e.g., bloom before tone mapping, tone mapping before color grading)

## 8 — Lighting in Code

### Adding a Directional Light Programmatically

```csharp
var lightEntity = new Entity("Sun");
var lightComponent = new LightComponent
{
    Type = new LightDirectional
    {
        Color = new ColorRgbProvider(Color.White),
        Shadow = new LightDirectionalShadowMap
        {
            Enabled = true,
            Size = LightShadowMapSize.Large,
            CascadeCount = LightShadowMapCascadeCount.FourCascades
        }
    },
    Intensity = 10.0f
};
lightEntity.Add(lightComponent);
lightEntity.Transform.Rotation = Quaternion.RotationYawPitchRoll(
    MathUtil.DegreesToRadians(45),
    MathUtil.DegreesToRadians(-60),
    0
);
rootScene.Entities.Add(lightEntity);
```

### Adding a Point Light

```csharp
var pointLight = new Entity("Torch");
pointLight.Add(new LightComponent
{
    Type = new LightPoint
    {
        Color = new ColorRgbProvider(new Color(255, 180, 100)),
        Radius = 10.0f,
        Shadow = new LightPointShadowMap { Enabled = false }
    },
    Intensity = 5.0f
});
pointLight.Transform.Position = new Vector3(2, 3, -1);
rootScene.Entities.Add(pointLight);
```

### Community Toolkit Helpers

The Stride Community Toolkit provides convenience methods for quick light setup in code-only projects:

```csharp
game.Run(start: (Scene rootScene) =>
{
    game.SetupBase3DScene(); // Adds default directional light + skybox
    // The base scene includes a directional light, camera, and skybox
    // Customize from here
});
```

## 9 — Performance Tuning

**Light count budgets** — Forward+ handles many lights well, but each shadow-casting light is expensive. Budget for 1 directional (with CSM) + 4–8 shadow-casting point/spot lights. Non-shadow lights are much cheaper.

**Shadow map resolution trade-offs** — 1024 for most lights; 2048 only for the primary directional light. Lower resolution (512) for distant or minor lights.

**Light probe density** — more probes = better quality but longer bake times and more memory. Start sparse, add probes where lighting artifacts (banding, incorrect color) appear.

**Post-processing budget** — bloom and FXAA are cheap (~0.5ms each). SSAO and SSR are moderate (1–2ms). Depth of field and TAA vary. Profile with Stride's built-in profiler (see G23) to find your bottlenecks.

**Disable what you don't need** — if your art style is stylized/flat, you may not need SSAO, SSR, or bloom. Removing unused post-effects is the easiest performance win.

## 10 — Common Lighting Mistakes

**No environment lighting** — PBR materials look unnaturally dark without ambient/environment light. Always add at least a skybox light or ambient light, even for indoor scenes.

**Over-relying on ambient light** — a single ambient light makes everything uniformly lit with no depth. Replace it with light probes and environment lighting for production quality.

**Shadow acne everywhere** — increase the depth bias on shadow-casting lights. Start small (0.001) and increase until acne disappears. Too much bias causes peter-panning.

**Forgetting to bake light probes** — light probes show default values until you bake them. After placing probes, use the lighting options menu in the Scene Editor to trigger a bake.

**Too many shadow-casting point lights** — each shadow-casting point light renders the scene into a cube map (6 passes). This is the most common source of GPU-bound performance problems in lit scenes. Disable shadows on lights that don't need them.
