# G35 — HDR Rendering Pipeline

> **Category:** Guide · **Engine:** Stride · **Related:** [Stride Architecture Rules](../stride-arch-rules.md), [G24 — Material System & PBR](G24_material_system_pbr.md), [G26 — Lighting & Environment](G26_lighting_environment.md), [G07 — Custom Render Features](G07_custom_render_features.md)

Stride supports High Dynamic Range (HDR) rendering, allowing color values to exceed the standard 0–1 range for more realistic lighting, reflections, and post-processing. Stride 4.3 added native HDR display output support for Direct3D on Windows, enabling games to take advantage of HDR monitors and TVs. This guide covers HDR pipeline configuration, tone mapping, HDR display output, and common pitfalls.

---

## Table of Contents

1. [HDR vs LDR Rendering](#1--hdr-vs-ldr-rendering)
2. [Enabling HDR in Stride](#2--enabling-hdr-in-stride)
3. [The HDR Pipeline Flow](#3--the-hdr-pipeline-flow)
4. [Tone Mapping](#4--tone-mapping)
5. [HDR Display Output (Stride 4.3+)](#5--hdr-display-output-stride-43)
6. [Post-Processing in HDR](#6--post-processing-in-hdr)
7. [HDR-Aware Materials and Lighting](#7--hdr-aware-materials-and-lighting)
8. [Common Pitfalls](#8--common-pitfalls)

---

## 1 — HDR vs LDR Rendering

In **LDR (Low Dynamic Range)** rendering, color channels are clamped to 0–1 at every stage. Bright lights look the same as moderately bright lights because values above 1.0 are lost. Bloom, exposure adaptation, and realistic reflections are difficult or impossible.

In **HDR** rendering, the internal render targets use floating-point formats (e.g., `R16G16B16A16_Float`), preserving the full intensity range throughout the pipeline. A sun emitting a color value of `(10, 9, 8)` remains distinct from a desk lamp at `(1.5, 1.4, 1.2)`. Tone mapping compresses this range to displayable values as the final step.

### Requirements

- **Graphics profile:** Direct3D 10.0 / OpenGL ES 3.0 or later (Direct3D 9 does **not** support HDR textures and will crash)
- **Render targets:** floating-point formats (Stride uses these by default when HDR is enabled)
- **Tone mapping:** required to convert HDR values to a displayable range

---

## 2 — Enabling HDR in Stride

### In Game Studio

1. Open the **Asset View** and select the **Game Settings** asset
2. In the **Property Grid**, navigate to **Rendering Settings**
3. Set **Color Space** to **Linear** (required for physically correct HDR)
4. Verify that the **Target graphics platform** is Direct3D 11, Direct3D 12, Vulkan, or OpenGL (not Direct3D 9)

HDR mode is the default for new Stride projects targeting modern graphics profiles. The engine allocates floating-point render targets automatically when the color space is set to Linear.

### In Code (Code-Only Projects)

```csharp
using Stride.Engine;
using Stride.Graphics;

var game = new Game();

// Game settings are typically loaded from the .sdpkg asset,
// but for code-only projects you can configure programmatically:
game.GraphicsDeviceManager.PreferredColorSpace = ColorSpace.Linear;
game.GraphicsDeviceManager.PreferredBackBufferFormat =
    PixelFormat.R16G16B16A16_Float;

game.Run(start: (Scene rootScene) =>
{
    // Scene setup...
});
```

---

## 3 — The HDR Pipeline Flow

Stride's rendering pipeline processes HDR data in this order:

```
Scene Geometry (HDR)
    ↓
G-Buffer / Forward Pass (floating-point targets)
    ↓
Lighting Accumulation (unbounded intensity values)
    ↓
Post-Processing (bloom, DoF, motion blur — all in HDR)
    ↓
Tone Mapping (HDR → displayable range)
    ↓
Color Grading & Gamma Correction
    ↓
Final Output (LDR backbuffer or HDR display)
```

The critical insight is that **post-processing happens before tone mapping**. Bloom reads from the HDR buffer, so it naturally extracts bright areas (values > 1.0) without needing artificial thresholds. Depth of field, ambient occlusion, and motion blur also benefit from the full dynamic range.

---

## 4 — Tone Mapping

Tone mapping compresses the HDR range into values a display can show. Stride provides several tone mapping operators in the post-processing stack.

### Configuring Tone Mapping in Game Studio

1. Open the **Graphics Compositor** asset
2. Select the **Post-Processing Effects** node
3. Add or configure the **Tone Map** effect
4. Choose the operator and adjust parameters

### Available Operators

| Operator | Characteristics |
|----------|----------------|
| **Reinhard** | Simple, preserves color. Good for evenly lit scenes. Can look washed out with extreme brightness. |
| **Hejl-Dawson (Filmic)** | Film-like response curve. Better contrast than Reinhard. Popular for realistic outdoor scenes. |
| **ACES (Academy Color)** | Industry-standard filmic curve. Strong contrast, desaturates extreme highlights naturally. Widely used in AAA games. |
| **Logarithmic** | Compresses a very wide range. Useful for scenes with extreme brightness variation (e.g., looking at the sun). |

### Exposure Control

Tone mapping works alongside exposure settings. Stride supports:

- **Manual exposure:** set a fixed EV (exposure value) for consistent brightness
- **Auto-exposure (eye adaptation):** the camera adapts to average scene luminance over time, simulating the human eye adjusting to darkness or brightness

```csharp
// Adjusting exposure in the post-processing stack via code
// (typically configured in the Graphics Compositor asset)
var postEffects = camera.Entity.Get<PostProcessingEffects>();
if (postEffects != null)
{
    // Manual exposure override
    postEffects.Exposure.Enabled = true;
    postEffects.Exposure.ExposureValue = 1.5f; // EV compensation
}
```

---

## 5 — HDR Display Output (Stride 4.3+)

Stride 4.3 introduces native HDR output support for Direct3D on Windows. When an HDR-capable monitor is connected and Windows HDR is enabled, Stride can output to an HDR10 or scRGB swapchain, bypassing the LDR tone mapping step for true high-dynamic-range display.

### Requirements

- Windows 10 (version 1709+) or Windows 11 with **HDR** enabled in Display Settings
- An HDR-capable monitor or TV (HDR10, HDR400+, Dolby Vision)
- Direct3D 11 or Direct3D 12 graphics platform
- Stride 4.3+

### How It Works

When HDR display output is active:

1. The rendering pipeline still operates in floating-point HDR internally
2. Instead of tone mapping to an 8-bit LDR backbuffer, the engine outputs to an HDR-format swapchain (typically `R16G16B16A16_Float` or `R10G10B10A2_UNorm` with ST.2084 transfer function)
3. The display hardware and OS compositor handle the final mapping to the panel's native capabilities
4. Tone mapping may still be applied but targets a wider output range (e.g., 0–1000 nits instead of 0–1)

### Design Considerations

- **Test on both SDR and HDR displays.** Your game must look good on standard monitors too. Use the tone mapping path as the SDR fallback.
- **UI elements need attention.** UI rendered in HDR can appear overly bright or cause eye strain. Consider rendering UI at a fixed, comfortable luminance level regardless of scene brightness.
- **Screenshots and video capture.** Some capture tools may not handle HDR swapchains correctly. Provide an SDR capture path for marketing assets.

---

## 6 — Post-Processing in HDR

HDR unlocks the full potential of Stride's post-processing stack:

### Bloom

Bloom in HDR naturally extracts overbright pixels (values > 1.0). Unlike LDR bloom, which uses an arbitrary brightness threshold, HDR bloom reflects actual light intensity:

- A torch flame at intensity 3.0 blooms moderately
- The sun at intensity 100.0 blooms intensely
- A candle at intensity 0.8 does not bloom at all

This produces physically plausible results without manual threshold tuning.

### Depth of Field

In HDR, bright out-of-focus highlights (bokeh) retain their intensity during the blur pass. This creates the characteristic bright circles seen in real photography when out-of-focus lights appear in the background.

### Light Shafts (God Rays)

Light shaft effects sample from the HDR buffer, so shafts from the sun are naturally much brighter than shafts from a window. The intensity falloff follows the source light's actual intensity.

---

## 7 — HDR-Aware Materials and Lighting

### Light Intensity Units

In HDR, light intensities are unbounded. Use physically motivated values:

| Light Source | Approximate Intensity |
|-------------|----------------------|
| Candle | 12 lux |
| Indoor room | 300–500 lux |
| Overcast sky | 10,000 lux |
| Direct sunlight | 100,000 lux |

Stride's PBR materials respond correctly to these values because the lighting math operates in linear HDR space. A material with albedo 0.8 lit by a light at intensity 50,000 will produce a surface luminance far exceeding 1.0, which the tone mapper then compresses.

### Emissive Materials

Emissive materials in HDR can represent actual light-emitting surfaces. Set emissive intensity above 1.0 to make materials contribute to bloom and appear to glow:

```csharp
// Emissive material values in HDR
// An emissive value of (5, 2, 0) creates an orange glow
// that naturally contributes to bloom without extra configuration
material.Passes[0].Parameters.Set(
    MaterialKeys.EmissiveIntensity, 5.0f);
```

---

## 8 — Common Pitfalls

### Using Direct3D 9

Direct3D 9 does not support HDR textures. If your Game Settings target Direct3D 9, HDR render targets will fail and the game will crash. Always target Direct3D 10.0 or later for HDR.

### Forgetting Tone Mapping

Without tone mapping, HDR values are clamped to 0–1 when written to the display. The scene will appear washed out with lost highlights. Always include a tone mapping step in your Graphics Compositor.

### sRGB vs Linear Color Space

HDR requires **Linear** color space. If the project is set to Gamma (sRGB), lighting math will be incorrect — darks will be too dark and brights will be too bright. Verify that Color Space is set to Linear in Game Settings.

### Overbright UI

UI elements drawn after tone mapping appear at their authored brightness. UI drawn before tone mapping gets compressed along with the scene. Stride's UI system renders as a separate compositor layer, which is typically post-tone-mapping. If your UI appears too bright or too dim, check which compositor layer it renders in.

### Auto-Exposure Flicker

If auto-exposure (eye adaptation) is too aggressive, rapid brightness changes (explosions, entering/exiting buildings) cause visible flickering. Increase the adaptation time constants to smooth the transition:

- **Speed Up:** how fast the exposure adapts to brighter scenes (0.5–2.0 seconds is typical)
- **Speed Down:** how fast it adapts to darker scenes (1.0–3.0 seconds is typical)
