# Post-Processing Pipeline

> **Category:** reference · **Engine:** Babylon.js · **Related:** [G6_lighting_pbr_materials.md](../guides/G6_lighting_pbr_materials.md), [G5_webgpu_compute.md](../guides/G5_webgpu_compute.md), [R5_scene_optimization_lod.md](R5_scene_optimization_lod.md)

Babylon.js has a layered post-processing system: individual `PostProcess` effects, pre-built rendering pipelines that chain multiple effects together, and the ability to write custom GLSL/WGSL shaders. For most games, start with the `DefaultRenderingPipeline` — it bundles the most common effects with sensible defaults and a single toggle-based API.

## DefaultRenderingPipeline — The All-in-One Solution

The `DefaultRenderingPipeline` wraps bloom, depth of field, chromatic aberration, grain, sharpen, vignette, FXAA, image processing (tone mapping, contrast, exposure), and glow into one pipeline. Enable HDR for physically accurate bloom and tone mapping.

```typescript
import {
  DefaultRenderingPipeline,
  Scene,
  Camera,
  Color4,
} from '@babylonjs/core';

function setupDefaultPipeline(scene: Scene, camera: Camera): DefaultRenderingPipeline {
  const pipeline = new DefaultRenderingPipeline(
    'defaultPipeline',
    true, // HDR — enable unless targeting very low-end mobile
    scene,
    [camera]
  );

  // --- Bloom ---
  pipeline.bloomEnabled = true;
  pipeline.bloomThreshold = 0.8; // luminance threshold (HDR values above this bloom)
  pipeline.bloomWeight = 0.3;    // intensity of the bloom effect
  pipeline.bloomKernel = 64;     // blur kernel size (higher = wider bloom, more GPU cost)
  pipeline.bloomScale = 0.5;     // resolution scale for bloom passes

  // --- Depth of Field ---
  pipeline.depthOfFieldEnabled = true;
  pipeline.depthOfFieldBlurLevel = 1; // 0 = low, 1 = medium, 2 = high
  pipeline.depthOfField.focalLength = 50;   // mm
  pipeline.depthOfField.fStop = 2.8;        // aperture
  pipeline.depthOfField.focusDistance = 10;  // world units to focus plane

  // --- Chromatic Aberration ---
  pipeline.chromaticAberrationEnabled = true;
  pipeline.chromaticAberration.aberrationAmount = 30;  // pixel offset
  pipeline.chromaticAberration.radialIntensity = 0.7;  // 0 = uniform, 1 = strong at edges

  // --- Film Grain ---
  pipeline.grainEnabled = true;
  pipeline.grain.intensity = 15;    // grain strength
  pipeline.grain.animated = true;   // animate grain per frame

  // --- Sharpen ---
  pipeline.sharpenEnabled = true;
  pipeline.sharpen.edgeAmount = 0.3;   // edge detection strength
  pipeline.sharpen.colorAmount = 1.0;  // color preservation

  // --- Vignette ---
  // Vignette is part of imageProcessing
  pipeline.imageProcessing.vignetteEnabled = true;
  pipeline.imageProcessing.vignetteWeight = 2.0;
  pipeline.imageProcessing.vignetteStretch = 0.5;

  // --- Tone Mapping & Exposure ---
  pipeline.imageProcessing.toneMappingEnabled = true;
  pipeline.imageProcessing.toneMappingType = 1; // 0 = Hable, 1 = ACES
  pipeline.imageProcessing.exposure = 1.2;
  pipeline.imageProcessing.contrast = 1.1;

  // --- Anti-Aliasing ---
  pipeline.fxaaEnabled = true; // fast approximate AA
  // Alternatively: pipeline.samples = 4; // for MSAA (more expensive)

  return pipeline;
}
```

### Performance Notes

- Bloom at `bloomScale = 0.5` renders at half resolution — good balance of quality vs. cost.
- Depth of field at `blurLevel = 2` is expensive — use level 0 or 1 for action games.
- FXAA is nearly free. MSAA (`samples = 4`) costs more but handles geometric edges better.
- Each enabled effect adds a full-screen pass. On mobile, limit to bloom + FXAA + tone mapping.

## SSAO2 — Screen-Space Ambient Occlusion

`SSAO2RenderingPipeline` computes ambient occlusion from the depth buffer, adding contact shadows in crevices and corners. It is significantly better than SSAO v1 — use SSAO2 for all new projects.

```typescript
import { SSAO2RenderingPipeline, Scene, Camera } from '@babylonjs/core';

function setupSSAO(scene: Scene, camera: Camera): SSAO2RenderingPipeline {
  const ssao = new SSAO2RenderingPipeline('ssao', scene, {
    ssaoRatio: 0.5,       // render AO at half resolution (perf vs. quality)
    blurRatio: 1.0,       // blur at full resolution for clean edges
  });

  ssao.radius = 2.0;             // sampling radius in world units
  ssao.totalStrength = 1.5;      // AO intensity multiplier
  ssao.base = 0.1;               // minimum AO (prevents fully black areas)
  ssao.samples = 16;             // sample count (16–32 is typical)
  ssao.maxZ = 100;               // max depth range
  ssao.minZAspect = 0.2;         // prevents AO artifacts on distant surfaces
  ssao.expensiveBlur = true;     // bilateral blur — respects edges, costs more

  scene.postProcessRenderPipelineManager.attachCamerasToRenderPipeline('ssao', camera);

  return ssao;
}
```

### Tuning SSAO2

- `radius` controls how far the AO spreads — too large and you get dark halos around objects.
- `samples` at 16 is a good default; 32 for quality screenshots. Below 12 gets noisy.
- Set `ssaoRatio` to 0.5 on mobile GPUs — the blur pass hides the lower resolution.
- SSAO2 requires a depth texture. Ensure the scene has `scene.enableDepthRenderer()` or the pipeline enables it automatically.

## Screen-Space Reflections (SSR)

Babylon.js provides `SSRRenderingPipeline` for reflections computed from the screen buffer — cheaper than planar reflections or reflection probes but limited to what is visible on screen.

```typescript
import { SSRRenderingPipeline, Scene, Camera } from '@babylonjs/core';

function setupSSR(scene: Scene, camera: Camera): SSRRenderingPipeline {
  const ssr = new SSRRenderingPipeline(
    'ssr',
    scene,
    [camera],
    false,  // forceGeometryBuffer — use prepass renderer if false
    2       // texture type: 0 = unsigned byte, 2 = half float
  );

  ssr.thickness = 0.1;         // ray-march thickness tolerance
  ssr.strength = 0.8;          // reflection blending strength
  ssr.reflectionSpecularFalloffExponent = 3; // PBR roughness falloff
  ssr.step = 1.0;              // ray-march step size (smaller = more accurate, slower)
  ssr.maxSteps = 100;          // max ray-march iterations
  ssr.maxDistance = 50;         // max reflection distance in world units
  ssr.roughnessFactor = 0.15;  // roughness threshold for reflections

  return ssr;
}
```

### SSR Caveats

- Objects behind the camera or occluded on screen produce no reflections — expect fallback to environment maps.
- Highly expensive on mobile — consider disabling or using reflection probes instead.
- Works best on glossy floors and water surfaces where missing reflections are less noticeable.

## Custom Post-Process Effects

For game-specific effects (damage flash, underwater distortion, CRT scanlines), write a custom `PostProcess` with GLSL fragment shaders.

```typescript
import { PostProcess, Effect, Scene, Camera } from '@babylonjs/core';

// 1. Register the shader
Effect.ShadersStore['damageFlashFragmentShader'] = `
  precision highp float;

  varying vec2 vUV;
  uniform sampler2D textureSampler;
  uniform float intensity;     // 0.0 = no flash, 1.0 = full red overlay
  uniform float time;

  void main(void) {
    vec4 color = texture2D(textureSampler, vUV);
    // Red flash with vignette falloff
    float vignette = 1.0 - length(vUV - 0.5) * 1.5;
    vec3 flash = vec3(1.0, 0.0, 0.0) * intensity * vignette;
    color.rgb = mix(color.rgb, color.rgb + flash, intensity);
    gl_FragColor = color;
  }
`;

// 2. Create the post-process
function createDamageFlash(camera: Camera): PostProcess {
  let currentIntensity = 0;

  const pp = new PostProcess(
    'damageFlash',
    'damageFlash',              // shader name (matches ShadersStore key)
    ['intensity', 'time'],       // uniforms
    null,                        // samplers
    1.0,                         // render ratio
    camera
  );

  pp.onApply = (effect) => {
    effect.setFloat('intensity', currentIntensity);
    effect.setFloat('time', performance.now() / 1000);
  };

  // Public API for gameplay code
  (pp as any).triggerFlash = () => { currentIntensity = 1.0; };
  (pp as any).update = (dt: number) => {
    currentIntensity = Math.max(0, currentIntensity - dt * 3); // fade over ~0.33s
  };

  return pp;
}
```

### Custom Shader Tips

- Store shaders in `Effect.ShadersStore` with the naming convention `{name}FragmentShader`.
- Use `onApply` to set uniforms each frame — this is the hook for dynamic values.
- For multi-pass effects, chain multiple `PostProcess` instances on the same camera.
- Test on WebGL 1 if targeting older mobile browsers — some GLSL features are unavailable.

## Combining Pipelines

You can use multiple pipelines simultaneously. The `PostProcessRenderPipelineManager` handles ordering:

```typescript
// All pipelines coexist — order is determined by attachment order
const defaultPipeline = setupDefaultPipeline(scene, camera);
const ssao = setupSSAO(scene, camera);

// Custom effects added directly to the camera run after pipelines
const damageFlash = createDamageFlash(camera);
```

### Pipeline Ordering Best Practices

1. **SSAO** first — it modifies lighting before other effects
2. **SSR** next — reflections should include AO
3. **DefaultRenderingPipeline** last — bloom, tone mapping, and AA are final-stage effects
4. **Custom gameplay effects** (damage flash, transitions) at the very end

## Performance Budget

| Effect | GPU Cost (relative) | Mobile Viable |
|--------|-------------------|---------------|
| FXAA | Very Low | Yes |
| Vignette | Very Low | Yes |
| Sharpen | Low | Yes |
| Film Grain | Low | Yes |
| Chromatic Aberration | Low | Yes |
| Bloom (half-res) | Medium | Cautious |
| Tone Mapping (ACES) | Low | Yes |
| Depth of Field (level 1) | Medium-High | No |
| SSAO2 (16 samples, half-res) | Medium-High | No |
| SSR | High | No |

On desktop, you can enable everything. On mobile, stick to FXAA + bloom (half-res) + tone mapping + grain. Profile with the Babylon.js Inspector's performance tab to measure actual frame-time impact.

## Disabling at Runtime

Toggle effects based on device capability or user quality settings:

```typescript
function setQualityPreset(
  pipeline: DefaultRenderingPipeline,
  ssao: SSAO2RenderingPipeline,
  preset: 'low' | 'medium' | 'high'
): void {
  switch (preset) {
    case 'low':
      pipeline.bloomEnabled = false;
      pipeline.depthOfFieldEnabled = false;
      pipeline.chromaticAberrationEnabled = false;
      pipeline.grainEnabled = false;
      pipeline.fxaaEnabled = true;
      ssao.totalStrength = 0; // effectively disables SSAO
      break;
    case 'medium':
      pipeline.bloomEnabled = true;
      pipeline.bloomScale = 0.25;
      pipeline.depthOfFieldEnabled = false;
      pipeline.fxaaEnabled = true;
      ssao.samples = 8;
      ssao.ssaoRatio = 0.5;
      break;
    case 'high':
      pipeline.bloomEnabled = true;
      pipeline.bloomScale = 0.5;
      pipeline.depthOfFieldEnabled = true;
      pipeline.chromaticAberrationEnabled = true;
      pipeline.grainEnabled = true;
      pipeline.fxaaEnabled = true;
      ssao.samples = 24;
      ssao.ssaoRatio = 1.0;
      break;
  }
}
```
