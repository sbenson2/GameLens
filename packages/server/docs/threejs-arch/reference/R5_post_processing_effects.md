# R5 — Post-Processing & Effects Pipeline

> **Category:** reference · **Engine:** Three.js · **Related:** [Architecture Overview](../architecture/E1_architecture_overview.md), [WebGPU Renderer](../guides/G9_webgpu_renderer.md), [Optimization & Performance](../guides/G6_optimization_performance.md), [Lighting & PBR Materials](../guides/G10_lighting_pbr_materials.md)

Post-processing transforms a rendered frame before it reaches the screen — bloom, ambient occlusion, color grading, depth of field, and more. Three.js provides a built-in `EffectComposer` addon and the community-maintained **pmndrs/postprocessing** library offers a higher-performance alternative that merges effects into fewer GPU passes. This reference covers both approaches for game developers.

---

## Architecture Overview

### Built-in EffectComposer (three/addons)

The built-in system chains discrete **passes** in sequence. Each pass reads from one framebuffer, processes it, and writes to another. The final pass renders to screen.

```
Scene → RenderPass → BloomPass → SSAOPass → OutputPass → Screen
          (FBO 1)      (FBO 2)     (FBO 3)     (FBO 4)
```

**Drawback:** Every pass = one full-screen draw call + framebuffer swap. Five effects = five extra draw calls minimum.

### pmndrs/postprocessing (Recommended for Games)

The pmndrs library introduces an **EffectPass** that automatically merges multiple effects into a single shader program and executes them in one draw call. This is significantly faster for games that stack many effects.

```
Scene → RenderPass → EffectPass(Bloom + SSAO + Vignette + ColorGrading) → Screen
          (FBO 1)                     (FBO 2 — single pass)
```

**Performance benefit:** Fullscreen operations use a single triangle (not a quad), which harmonizes with modern GPU rasterization and eliminates unnecessary fragment calculations.

---

## Installation

### Built-in Passes

```bash
# No extra install — included with three.js
npm install three
```

```typescript
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
```

### pmndrs/postprocessing

```bash
npm install postprocessing
# three.js is a peer dependency
```

```typescript
import {
  BloomEffect,
  EffectComposer,
  EffectPass,
  RenderPass,
  ToneMappingEffect,
  SMAAEffect,
} from 'postprocessing';
```

---

## Built-in EffectComposer Setup

```typescript
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

// Create composer — replaces direct renderer.render() calls
const composer = new EffectComposer(renderer);

// 1. RenderPass — draws the scene into the composer's framebuffer
const renderPass = new RenderPass(scene, camera);
composer.addPass(renderPass);

// 2. UnrealBloomPass — HDR bloom glow
const bloomPass = new UnrealBloomPass(
  new THREE.Vector2(window.innerWidth, window.innerHeight),
  1.5,   // strength
  0.4,   // radius
  0.85   // threshold — pixels below this luminance won't bloom
);
composer.addPass(bloomPass);

// 3. OutputPass — handles color space conversion (sRGB) and tone mapping
const outputPass = new OutputPass();
composer.addPass(outputPass);

// Animation loop
function animate(): void {
  requestAnimationFrame(animate);
  composer.render(); // replaces renderer.render(scene, camera)
}
animate();

// Handle resize
window.addEventListener('resize', () => {
  const w = window.innerWidth;
  const h = window.innerHeight;
  renderer.setSize(w, h);
  composer.setSize(w, h);
});
```

### Key EffectComposer API

| Method | Purpose |
|--------|---------|
| `addPass(pass)` | Append a pass to the chain |
| `insertPass(pass, index)` | Insert at a specific position |
| `removePass(pass)` | Remove a pass |
| `render(delta?)` | Execute the full chain |
| `setSize(w, h)` | Resize all internal buffers |
| `setPixelRatio(ratio)` | Match device pixel ratio |
| `dispose()` | Free GPU resources |

---

## pmndrs/postprocessing Setup (Recommended)

```typescript
import * as THREE from 'three';
import {
  BloomEffect,
  EffectComposer,
  EffectPass,
  RenderPass,
  ToneMappingEffect,
  SMAAEffect,
  VignetteEffect,
} from 'postprocessing';

const composer = new EffectComposer(renderer, {
  frameBufferType: THREE.HalfFloatType, // HDR pipeline — essential for bloom
});

// 1. RenderPass
composer.addPass(new RenderPass(scene, camera));

// 2. EffectPass — merges ALL these effects into a single shader
const bloomEffect = new BloomEffect({
  luminanceThreshold: 0.8,
  luminanceSmoothing: 0.075,
  intensity: 1.2,
  mipmapBlur: true, // higher quality blur
});

const toneMappingEffect = new ToneMappingEffect({
  mode: THREE.ACESFilmicToneMapping,
});

const vignetteEffect = new VignetteEffect({
  offset: 0.35,
  darkness: 0.5,
});

const smaaEffect = new SMAAEffect(); // anti-aliasing

composer.addPass(new EffectPass(camera, bloomEffect, toneMappingEffect, vignetteEffect, smaaEffect));

// Animation loop — same as built-in
function animate(): void {
  requestAnimationFrame(animate);
  composer.render();
}
animate();
```

> **Important:** When using pmndrs/postprocessing, set `renderer.toneMapping = THREE.NoToneMapping` and handle tone mapping via `ToneMappingEffect` instead. This ensures the full HDR pipeline is processed correctly before conversion.

---

## Common Effects Reference

### Built-in Passes (three/addons)

| Pass | Import | Purpose | Game Use Case |
|------|--------|---------|---------------|
| `RenderPass` | `RenderPass.js` | Draws the scene | Always first in chain |
| `UnrealBloomPass` | `UnrealBloomPass.js` | HDR glow | Neon lights, magic spells, explosions |
| `SSAOPass` | `SSAOPass.js` | Screen-space AO | Adds depth to indoor scenes |
| `ShaderPass` | `ShaderPass.js` | Custom shader | Any custom effect |
| `OutputPass` | `OutputPass.js` | Color space / tone map | Always last in chain |
| `GlitchPass` | `GlitchPass.js` | Digital glitch | Damage feedback, cyberpunk UI |
| `FilmPass` | `FilmPass.js` | Film grain + scanlines | Horror, retro aesthetics |
| `SMAAPass` | `SMAAPass.js` | Anti-aliasing | Smooth edges without MSAA |

### pmndrs/postprocessing Effects

| Effect | Purpose | Game Use Case |
|--------|---------|---------------|
| `BloomEffect` | HDR glow | Neon, magic, fire |
| `N8AOEffect` | Fast AO (replaces SSAO) | Modern AO — faster and better quality |
| `SSAOEffect` | Screen-space AO | Legacy compatibility |
| `DepthOfFieldEffect` | Bokeh blur | Cutscenes, menu backgrounds |
| `ToneMappingEffect` | HDR → SDR | Color management |
| `ChromaticAberrationEffect` | Color fringing | Damage feedback, drunk effect |
| `VignetteEffect` | Edge darkening | Cinematic feel |
| `SMAAEffect` | Anti-aliasing | Edge smoothing |
| `GodRaysEffect` | Volumetric light shafts | Sunlight through trees, windows |
| `OutlineEffect` | Object outlines | Selection highlight, toon style |
| `NoiseEffect` | Film grain | Horror, vintage |
| `PixelationEffect` | Retro pixelation | Pixel art style in 3D |
| `ShockWaveEffect` | Circular distortion | Explosion shockwave |
| `GlitchEffect` | Digital corruption | Cyberpunk, damage |
| `LUT3DEffect` | Color lookup table | Cinematic color grading |

> **Game recommendation:** Use `N8AOEffect` from pmndrs instead of the built-in `SSAOPass`. It is faster, produces better visual results, and handles edge cases (thin geometry, large-radius AO) more gracefully.

---

## Selective Bloom (Emissive-Only Glow)

A common game pattern: only certain objects glow (neon signs, magic projectiles) while the rest of the scene stays unaffected.

### Approach: Emissive Materials + Luminance Threshold

```typescript
// Objects that should glow: set emissive color and intensity
const glowMaterial = new THREE.MeshStandardMaterial({
  color: 0x111111,
  emissive: 0x00ffff,
  emissiveIntensity: 2.0, // drives bloom brightness
});

// Non-glowing objects: keep emissive at zero
const normalMaterial = new THREE.MeshStandardMaterial({
  color: 0x888888,
  emissive: 0x000000,
});

// BloomEffect threshold filters out non-emissive pixels
const bloom = new BloomEffect({
  luminanceThreshold: 0.9, // only very bright pixels bloom
  luminanceSmoothing: 0.025,
  intensity: 1.5,
  mipmapBlur: true,
});
```

### Approach: Layers (Built-in Composer)

```typescript
// Render bloom layer separately with two composers
const BLOOM_LAYER = 1;
const bloomLayer = new THREE.Layers();
bloomLayer.set(BLOOM_LAYER);

// Assign glowing meshes to the bloom layer
glowingMesh.layers.enable(BLOOM_LAYER);

// Use two render passes with layer masking for selective bloom
// (More complex — prefer the emissive threshold approach for most games)
```

---

## HDR Pipeline Setup

For physically accurate bloom and tone mapping, use half-float framebuffers:

```typescript
// pmndrs/postprocessing HDR setup
const composer = new EffectComposer(renderer, {
  frameBufferType: THREE.HalfFloatType, // 16-bit float FBOs
  multisampling: 0, // use SMAA instead for best perf
});

// Disable renderer tone mapping — let ToneMappingEffect handle it
renderer.toneMapping = THREE.NoToneMapping;
renderer.outputColorSpace = THREE.SRGBColorSpace;

// Add ACES tone mapping as an effect
const toneMapping = new ToneMappingEffect({
  mode: THREE.ACESFilmicToneMapping,
});
```

---

## Performance Considerations

### Budget Guidelines

| Target | Max Post-Processing Cost | Notes |
|--------|-------------------------|-------|
| Desktop 60fps | 2–4 ms | Budget for 3–5 stacked effects |
| Mobile 60fps | 1–2 ms | Limit to 1–2 lightweight effects |
| VR 90fps | < 1 ms per eye | Minimize — prefer baked lighting |

### Optimization Tips

1. **Use pmndrs/postprocessing over built-in** — effect merging reduces draw calls from N to 1.
2. **Use `HalfFloatType` only when needed** — bloom and HDR require it, but simpler effects don't.
3. **Reduce resolution for expensive effects** — render AO or bloom at half resolution:
   ```typescript
   const bloomEffect = new BloomEffect({
     mipmapBlur: true,     // uses downsampled mip chain — fast
     resolutionScale: 0.5, // half-res bloom
   });
   ```
4. **Disable effects on mobile** — detect with `renderer.capabilities` or user settings.
5. **Profile with `performance.now()`** — wrap `composer.render()` to measure total post-processing cost.
6. **Avoid redundant passes** — never use both `OutputPass` and `ToneMappingEffect`.

### WebGPU Compatibility Note

As of r171+, the built-in `EffectComposer` is **WebGL-only** and does not work with `WebGPURenderer`. For WebGPU post-processing, use the TSL (Three.js Shading Language) node-based approach with `PostProcessing` from `three/addons/tsl/display/PostProcessing.js`. See the [WebGPU Renderer guide](../guides/G9_webgpu_renderer.md) for details.

The pmndrs/postprocessing library also currently targets WebGL. WebGPU support is under development.

---

## Quick-Start: Game-Ready Post-Processing Stack

A production-ready stack for a 3D action game:

```typescript
import {
  BloomEffect,
  EffectComposer,
  EffectPass,
  RenderPass,
  SMAAEffect,
  ToneMappingEffect,
  VignetteEffect,
} from 'postprocessing';
import * as THREE from 'three';

export function createPostProcessing(
  renderer: THREE.WebGLRenderer,
  scene: THREE.Scene,
  camera: THREE.PerspectiveCamera
): EffectComposer {
  renderer.toneMapping = THREE.NoToneMapping;

  const composer = new EffectComposer(renderer, {
    frameBufferType: THREE.HalfFloatType,
  });

  composer.addPass(new RenderPass(scene, camera));

  composer.addPass(new EffectPass(
    camera,
    new BloomEffect({
      luminanceThreshold: 0.8,
      intensity: 1.0,
      mipmapBlur: true,
    }),
    new ToneMappingEffect({ mode: THREE.ACESFilmicToneMapping }),
    new VignetteEffect({ offset: 0.3, darkness: 0.4 }),
    new SMAAEffect(),
  ));

  return composer;
}
```

This stack costs roughly 1–2 ms on a mid-range desktop GPU and produces a polished cinematic look suitable for most 3D game genres.
