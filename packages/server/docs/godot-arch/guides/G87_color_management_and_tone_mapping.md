# G87 — Color Management, Tone Mapping, and HDR Pipeline

> **Category:** guide · **Engine:** Godot 4.x · **Related:** [G12 Shaders & Visual Effects](./G12_shaders_and_visual_effects.md) · [G85 Global Illumination Systems](./G85_global_illumination_systems.md) · [G41 Godot 4.4–4.6 Features](./G41_godot_44_to_46_features.md) · [G36 Compositor Effects](./G36_compositor_effects.md)

Godot 4 renders in linear HDR color space internally and applies tone mapping to compress the wide dynamic range into displayable colors. Choosing the right tone mapper and understanding the color pipeline is critical for achieving the look you want — whether stylized, filmic, or photorealistic. This guide covers the HDR pipeline, all available tone mappers (including AGX added in 4.4), color grading, and practical workflows.

---

## Table of Contents

1. [The HDR Pipeline](#1-the-hdr-pipeline)
2. [Tone Mapping Modes](#2-tone-mapping-modes)
3. [AGX — The Modern Default](#3-agx--the-modern-default)
4. [Configuring Tone Mapping](#4-configuring-tone-mapping)
5. [Color Adjustments and Grading](#5-color-adjustments-and-grading)
6. [White Balance and Exposure](#6-white-balance-and-exposure)
7. [Post-Processing Stack](#7-post-processing-stack)
8. [Practical Workflows by Genre](#8-practical-workflows-by-genre)
9. [Common Mistakes and Fixes](#9-common-mistakes-and-fixes)

---

## 1. The HDR Pipeline

Godot 4's rendering pipeline operates in **linear color space** with **high dynamic range** (HDR) values. Light values are not clamped to 0–1 during rendering — a bright light can have an intensity of 10.0, 100.0, or higher.

```
Scene Rendering (Linear HDR)
    ↓
Lighting & GI (values can exceed 1.0)
    ↓
Post-Processing (glow, SSR, SSAO, DOF)
    ↓
Tone Mapping (compress HDR → LDR for display)
    ↓
sRGB Conversion (linear → gamma for monitor)
    ↓
Display (0–255 per channel)
```

### Why Tone Mapping Matters

Without tone mapping, any pixel with a value above 1.0 is simply clamped to white. A bright sky, specular highlight, or explosion would appear as flat white blobs. Tone mapping compresses the full range gracefully, preserving detail in both shadows and highlights.

---

## 2. Tone Mapping Modes

Godot 4 offers five tone mapping modes via `Environment.tonemap_mode`:

| Mode | Enum Value | Character |
|------|-----------|-----------|
| **Linear** | `TONE_MAPPER_LINEAR` | No compression — values > 1.0 clip to white. Only useful for non-photographic rendering. |
| **Reinhardt** | `TONE_MAPPER_REINHARDT` | Simple S-curve. Preserves bright detail but can look washed out. |
| **Filmic** | `TONE_MAPPER_FILMIC` | Inspired by film stock. Good contrast, slight warm tint in highlights. |
| **ACES** | `TONE_MAPPER_ACES` | Industry-standard cinematic look. Desaturates bright values to communicate brightness. Can shift hues in extreme cases. |
| **AGX** | `TONE_MAPPER_AGX` (4.4+) | Modern tone mapper from Blender. Best hue preservation, natural desaturation of brights. |

### Visual Comparison

```
Bright white light on colored surface:

Linear:   ███ (clipped to white — color lost)
Reinhard:  ██▓ (detail preserved, slightly flat)
Filmic:    ██▒ (warm rolloff, good contrast)
ACES:      █▒░ (desaturated brights, cinematic)
AGX:       █▓░ (hue-stable desaturation, natural)
```

---

## 3. AGX — The Modern Default

AGX (added in Godot 4.4) is based on the same tonemapping approach used in Blender 4.0+. It produces the most perceptually accurate results for scenes with wide dynamic range.

### Key Properties

- **Hue stability:** Unlike ACES, AGX preserves hue in bright areas. A bright red light stays red rather than shifting toward yellow/orange.
- **Natural desaturation:** Very bright values desaturate toward white, which communicates brightness without color distortion.
- **Better dark-end response:** Shadow detail is preserved more naturally than ACES.

### When to Use AGX

- Photorealistic or semi-realistic games
- Scenes with bright colored lights (neon, magic effects, fire)
- Any project where ACES hue shifts are distracting
- As a starting point for most new 3D projects in Godot 4.4+

### Compensating for AGX Desaturation

AGX desaturates the image more aggressively than ACES by default. To counteract this while keeping AGX's benefits:

```gdscript
func configure_agx_look(env: Environment) -> void:
    # Enable AGX (Godot 4.4+)
    env.tonemap_mode = Environment.TONE_MAPPER_AGX
    
    # Boost saturation to compensate for AGX's natural desaturation
    env.adjustment_enabled = true
    env.adjustment_saturation = 1.2  # Bump saturation slightly
    env.adjustment_contrast = 1.05   # Subtle contrast boost
```

---

## 4. Configuring Tone Mapping

### GDScript

```gdscript
func setup_tone_mapping(env: Environment) -> void:
    # Choose tone mapper
    env.tonemap_mode = Environment.TONE_MAPPER_FILMIC
    
    # White reference — values above this map to pure white
    # Higher = more headroom for bright highlights
    env.tonemap_white = 6.0  # Default is 1.0; raise for HDR scenes
    
    # Exposure — overall brightness multiplier applied before tone mapping
    env.tonemap_exposure = 1.0  # 1.0 = no change; 0.5 = half brightness
```

### C#

```csharp
public void SetupToneMapping(Godot.Environment env)
{
    env.TonemapMode = Godot.Environment.ToneMapperEnum.Filmic;
    env.TonemapWhite = 6.0f;
    env.TonemapExposure = 1.0f;
}
```

### Tonemap White

The `tonemap_white` property controls the point at which values map to pure white. Default is 1.0 (everything above 1.0 is clamped). For HDR scenes with bright sky, specular highlights, or emissive materials, increase it:

| Scene Type | Recommended `tonemap_white` |
|-----------|---------------------------|
| Indoor, controlled lighting | 1.0–2.0 |
| Outdoor daylight | 4.0–8.0 |
| Scenes with very bright emissives | 8.0–16.0 |

---

## 5. Color Adjustments and Grading

The `Environment` resource includes a built-in color adjustment system.

### GDScript

```gdscript
func setup_color_grading(env: Environment) -> void:
    env.adjustment_enabled = true
    
    # Brightness — multiplicative (1.0 = no change)
    env.adjustment_brightness = 1.0
    
    # Contrast — 1.0 = no change, >1 = more contrast
    env.adjustment_contrast = 1.1
    
    # Saturation — 0.0 = grayscale, 1.0 = normal, >1 = oversaturated
    env.adjustment_saturation = 1.0
    
    # Color correction LUT (3D texture for full color grading)
    # Create from a neutral LUT image processed through photo editing software
    env.adjustment_color_correction = preload("res://luts/cinematic_warm.tres")
```

### C#

```csharp
public void SetupColorGrading(Godot.Environment env)
{
    env.AdjustmentEnabled = true;
    env.AdjustmentBrightness = 1.0f;
    env.AdjustmentContrast = 1.1f;
    env.AdjustmentSaturation = 1.0f;
    env.AdjustmentColorCorrection = GD.Load<Texture>("res://luts/cinematic_warm.tres");
}
```

### Creating a Color Correction LUT

1. Export a screenshot from your game.
2. Open it in photo editing software (GIMP, Photoshop, DaVinci Resolve).
3. Apply your desired color grade to a neutral LUT image (Godot provides one at `addons/` or you can generate a 64×64×64 identity LUT).
4. Import the graded LUT as a `Texture3D` resource in Godot.
5. Assign it to `adjustment_color_correction`.

---

## 6. White Balance and Exposure

### Auto Exposure (Eye Adaptation)

Godot supports camera auto-exposure that simulates the human eye adapting to brightness changes. Auto exposure is configured through `CameraAttributesPractical` or `CameraAttributesPhysical`, which are assigned to a `Camera3D` or `WorldEnvironment`.

```gdscript
func setup_auto_exposure() -> void:
    var cam_attrs := CameraAttributesPractical.new()
    
    # Enable auto-exposure
    cam_attrs.auto_exposure_enabled = true
    
    # Speed of adaptation (seconds)
    cam_attrs.auto_exposure_speed = 2.0
    
    # Min/max exposure bounds — prevents fully dark or blown-out frames
    cam_attrs.auto_exposure_min_sensitivity = 50.0   # Lower = darker scenes allowed
    cam_attrs.auto_exposure_max_sensitivity = 800.0  # Higher = brighter scenes allowed
    
    # Assign to camera or world environment
    $Camera3D.attributes = cam_attrs
    # OR: $WorldEnvironment.camera_attributes = cam_attrs
```

### C#

```csharp
public void SetupAutoExposure()
{
    var camAttrs = new CameraAttributesPractical();
    camAttrs.AutoExposureEnabled = true;
    camAttrs.AutoExposureSpeed = 2.0f;
    camAttrs.AutoExposureMinSensitivity = 50.0f;
    camAttrs.AutoExposureMaxSensitivity = 800.0f;

    GetNode<Camera3D>("Camera3D").Attributes = camAttrs;
}
```

### When to Use Auto Exposure

- Walking from a dark dungeon into bright sunlight
- Driving through tunnels
- Any scene with large brightness transitions
- **Avoid** for top-down or side-scrolling games where the camera framing is consistent.

---

## 7. Post-Processing Stack

Tone mapping is one step in a larger post-processing chain. Here's how they interact:

```
Rendering
    ↓
SSAO (ambient occlusion — darken crevices)
    ↓
SSR (screen-space reflections)
    ↓
SDFGI / VoxelGI / LightmapGI
    ↓
Glow (bloom — bright areas bleed light)
    ↓
DOF (depth of field — focus blur)
    ↓
Tone Mapping (HDR → LDR)
    ↓
Color Adjustment (brightness, contrast, saturation, LUT)
    ↓
Display
```

### Glow Configuration

Glow (bloom) works in HDR space before tone mapping, so it naturally responds to bright values.

```gdscript
func setup_glow(env: Environment) -> void:
    env.glow_enabled = true
    env.glow_intensity = 0.8          # Overall bloom strength
    env.glow_strength = 1.0           # Multiplier for bloom contribution
    env.glow_bloom = 0.1              # Soft bloom over entire image (0 = off)
    env.glow_hdr_threshold = 1.0      # Only pixels above this value bloom
    env.glow_hdr_scale = 2.0          # Scale of HDR contribution
    env.glow_blend_mode = Environment.GLOW_BLEND_MODE_ADDITIVE
```

---

## 8. Practical Workflows by Genre

### Horror / Dark Atmospheric

```gdscript
func horror_look(env: Environment) -> void:
    env.tonemap_mode = Environment.TONE_MAPPER_FILMIC
    env.tonemap_white = 2.0           # Low headroom — brights clip fast
    env.adjustment_enabled = true
    env.adjustment_saturation = 0.6   # Desaturated
    env.adjustment_contrast = 1.2     # Harsh shadows
    env.glow_enabled = true
    env.glow_bloom = 0.05
    env.glow_hdr_threshold = 0.8      # Even dim lights bloom slightly
    env.volumetric_fog_enabled = true
```

### Colorful Stylized

```gdscript
func stylized_look(env: Environment) -> void:
    env.tonemap_mode = Environment.TONE_MAPPER_LINEAR  # No compression — art controls values
    env.adjustment_enabled = true
    env.adjustment_saturation = 1.4   # Vivid colors
    env.adjustment_contrast = 1.0     # Keep flat for toon shading
    env.glow_enabled = false          # Often disabled for stylized
```

### Photorealistic Outdoor

```gdscript
func outdoor_realistic(env: Environment) -> void:
    # Use AGX if available (4.4+), otherwise ACES
    env.tonemap_mode = Environment.TONE_MAPPER_ACES
    env.tonemap_white = 8.0           # Lots of headroom for sky
    env.auto_exposure_enabled = true
    env.auto_exposure_speed = 1.5
    env.adjustment_enabled = true
    env.adjustment_saturation = 1.1   # Slight boost if using AGX
    env.glow_enabled = true
    env.glow_hdr_threshold = 1.5      # Only very bright areas bloom
```

---

## 9. Common Mistakes and Fixes

### Scene looks washed out with AGX

**Cause:** AGX desaturates more aggressively than ACES.
**Fix:** Enable color adjustments and increase `adjustment_saturation` to 1.1–1.3.

### Bright lights appear as flat white blobs

**Cause:** `tonemap_white` is too low or tone mapping is set to `LINEAR`.
**Fix:** Switch to Filmic/ACES/AGX and increase `tonemap_white`.

### Auto-exposure makes the scene too dark/bright

**Cause:** Min/max exposure bounds are too wide.
**Fix:** Tighten `auto_exposure_min_exposure_value` and `auto_exposure_max_exposure_value` to constrain adaptation range.

### Colors look different in editor vs. export

**Cause:** Editor viewport may use different rendering settings than the game camera.
**Fix:** Ensure the `WorldEnvironment` is used consistently. Test with **Project → Run** rather than relying on the editor viewport preview.

### Glow has no effect

**Cause:** No pixels exceed the `glow_hdr_threshold`.
**Fix:** Lower `glow_hdr_threshold` or increase light intensity so some values exceed it.

### Emissive materials don't bloom

**Cause:** Emissive energy is set to 1.0 or below, which doesn't exceed the glow threshold.
**Fix:** Set `emission_energy_multiplier` on `StandardMaterial3D` to values above the glow threshold (e.g., 2.0–10.0).

```gdscript
# Make an emissive material that blooms
var mat := StandardMaterial3D.new()
mat.emission_enabled = true
mat.emission = Color.RED
mat.emission_energy_multiplier = 4.0  # Well above glow threshold
```

```csharp
var mat = new StandardMaterial3D();
mat.EmissionEnabled = true;
mat.Emission = Colors.Red;
mat.EmissionEnergyMultiplier = 4.0f;
```
