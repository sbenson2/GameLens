# G2 — TSL & Node Materials

> **Category:** guide · **Engine:** Three.js · **Related:** [Architecture Overview](../architecture/E1_architecture_overview.md), [Three.js Rules](../threejs-rules.md), [TSL Docs](https://threejs.org/docs/TSL.html)

Three.js is transitioning from GLSL shader strings to **TSL (Three Shading Language)** — a JavaScript-based node material system that compiles to both WGSL (WebGPU) and GLSL (WebGL). Starting with r166+, TSL is the recommended way to write custom shaders. It works with both `WebGPURenderer` and the WebGL 2 fallback.

This guide covers the node material system, TSL syntax, and practical game-relevant shader patterns.

---

## Why TSL?

Traditional Three.js materials (`ShaderMaterial`, `onBeforeCompile`) use raw GLSL strings that only work with WebGL. TSL replaces this with composable JavaScript functions:

| Legacy (WebGL-only) | Modern (TSL) |
|----------------------|--------------|
| `ShaderMaterial({ vertexShader: '...' })` | `MeshStandardNodeMaterial` + node assignments |
| GLSL shader strings | JavaScript/TypeScript function calls |
| Manual uniform management | Automatic uniform nodes |
| WebGL only | Compiles to WGSL (WebGPU) and GLSL (WebGL 2) |
| No automatic optimization | Dead code elimination, uniform reuse, graph optimization |

**Key insight:** TSL lets you *extend* built-in PBR materials (lighting, shadows, fog all still work) rather than replacing them from scratch.

---

## Node Material Classes

Every classic Three.js material has a `Node` counterpart:

| Classic Material | Node Material | Use Case |
|-----------------|---------------|----------|
| `MeshBasicMaterial` | `MeshBasicNodeMaterial` | Unlit (UI elements, skyboxes) |
| `MeshStandardMaterial` | `MeshStandardNodeMaterial` | Standard PBR (most game objects) |
| `MeshPhysicalMaterial` | `MeshPhysicalNodeMaterial` | Advanced PBR (glass, subsurface, clearcoat) |
| `PointsMaterial` | `PointsNodeMaterial` | Particle systems |
| `SpriteMaterial` | `SpriteNodeMaterial` | 2D sprites / billboards |
| `LineBasicMaterial` | `LineBasicNodeMaterial` | Debug lines, outlines |

```typescript
import { MeshStandardNodeMaterial } from 'three';

// Create a node material — starts identical to MeshStandardMaterial
const material = new MeshStandardNodeMaterial();
material.color.set(0xff4444);   // Classic properties still work
material.roughness = 0.5;
material.metalness = 0.0;
```

---

## TSL Basics: Nodes and Imports

TSL functions are imported from `'three/tsl'` and compose into a node graph:

```typescript
import {
  color, float, vec2, vec3, vec4,   // constructors
  uniform,                           // CPU → GPU uniforms
  texture, uv,                       // textures and UV coords
  positionLocal, positionWorld, normalLocal, normalWorld, // geometry
  sin, cos, abs, mix, smoothstep, step, clamp, // math
  time,                              // elapsed time (auto-updated)
  Fn,                                // custom function builder
} from 'three/tsl';
```

### Assigning Nodes to Material Slots

Instead of setting scalar values, you assign *node graphs* to material slots:

```typescript
import { MeshStandardNodeMaterial } from 'three';
import { color, texture, uv, time, sin, float } from 'three/tsl';

const material = new MeshStandardNodeMaterial();

// Animated red pulse
material.colorNode = color(1, 0, 0).mul(sin(time).mul(0.5).add(0.5));

// Texture with tiled UVs
material.colorNode = texture(colorMap, uv().mul(4));

// Procedural roughness
material.roughnessNode = float(0.3);

// Normal map with custom strength
material.normalNode = texture(normalMap).xyz.mul(float(2)).sub(float(1));
```

### Available Material Slots (MeshStandardNodeMaterial)

| Slot | Type | Controls |
|------|------|----------|
| `colorNode` | `vec3/vec4` | Albedo color (feeds into PBR) |
| `roughnessNode` | `float` | Surface roughness (0 = mirror, 1 = matte) |
| `metalnessNode` | `float` | Metallic factor (0 = dielectric, 1 = metal) |
| `normalNode` | `vec3` | Surface normal perturbation |
| `emissiveNode` | `vec3` | Self-illumination color |
| `opacityNode` | `float` | Transparency (requires `transparent: true`) |
| `positionNode` | `vec3` | Vertex position override (vertex shader) |
| `outputNode` | `vec4` | Final fragment color override (bypasses PBR) |

---

## Uniforms: CPU → GPU Communication

Use `uniform()` to create values you update from JavaScript each frame:

```typescript
import { uniform } from 'three/tsl';
import { Color, Vector2 } from 'three';

// Typed uniforms
const healthPercent = uniform(float(1.0));
const hitColor = uniform(color(new Color(1, 0, 0)));
const scrollOffset = uniform(vec2(new Vector2(0, 0)));

// Use in material
material.colorNode = mix(
  texture(albedoMap, uv().add(scrollOffset)),
  hitColor,
  float(1).sub(healthPercent)
);

// Update from game logic
function onPlayerHit(): void {
  healthPercent.value = player.health / player.maxHealth;
}
```

---

## Custom Functions with Fn

For reusable shader logic, use `Fn` to define custom node functions:

```typescript
import { Fn, float, vec3, sin, cos, time, positionLocal } from 'three/tsl';

// Wind sway for vegetation — takes strength param
const windSway = Fn(([strength]: [ReturnType<typeof float>]) => {
  const sway = sin(time.mul(2.0).add(positionLocal.x.mul(0.5)));
  return vec3(sway.mul(strength), float(0), sway.mul(strength).mul(0.3));
});

// Apply to vertex positions
material.positionNode = positionLocal.add(
  windSway(float(0.2)).mul(positionLocal.y) // sway increases with height
);
```

---

## Game-Relevant Shader Patterns

### Dissolve / Disintegration Effect

```typescript
import { MeshStandardNodeMaterial } from 'three';
import {
  texture, uv, uniform, float, smoothstep, mix, color, vec3,
} from 'three/tsl';

const dissolveThreshold = uniform(float(0.0)); // animate 0 → 1

const material = new MeshStandardNodeMaterial({ transparent: true });
material.colorNode = texture(albedoMap);

const noise = texture(noiseMap, uv()).r;
const edge = smoothstep(dissolveThreshold, dissolveThreshold.add(0.05), noise);

// Glow at dissolve edge
const edgeGlow = smoothstep(
  dissolveThreshold.sub(0.02),
  dissolveThreshold.add(0.02),
  noise
).oneMinus();
material.emissiveNode = vec3(1.0, 0.3, 0.0).mul(edgeGlow);

// Clip dissolved pixels
material.opacityNode = edge;
```

### Scrolling Lava / Water UV

```typescript
const scrollSpeed = uniform(float(0.3));
const scrolledUV = uv().add(vec2(time.mul(scrollSpeed), time.mul(0.1)));

material.colorNode = texture(lavaMap, scrolledUV);
material.emissiveNode = texture(lavaMap, scrolledUV).mul(float(0.5));
```

### Rim Lighting (Fresnel Glow)

```typescript
import { normalWorld, cameraPosition, positionWorld, dot, pow, float, vec3, clamp } from 'three/tsl';

const viewDir = cameraPosition.sub(positionWorld).normalize();
const fresnel = float(1.0).sub(dot(normalWorld, viewDir)).clamp(0, 1);
const rimPower = pow(fresnel, float(3.0));

material.emissiveNode = vec3(0.2, 0.5, 1.0).mul(rimPower);
```

### Triplanar Mapping (Terrain Without UV Seams)

```typescript
import {
  Fn, texture, positionWorld, normalWorld, abs, pow, float, vec3,
} from 'three/tsl';

const triplanar = Fn(([map, scale]: [any, ReturnType<typeof float>]) => {
  const scaledPos = positionWorld.mul(scale);
  const blending = pow(abs(normalWorld), vec3(4.0));
  const blendNorm = blending.div(blending.x.add(blending.y).add(blending.z));

  const xProj = texture(map, scaledPos.yz);
  const yProj = texture(map, scaledPos.xz);
  const zProj = texture(map, scaledPos.xy);

  return xProj.mul(blendNorm.x).add(yProj.mul(blendNorm.y)).add(zProj.mul(blendNorm.z));
});

material.colorNode = triplanar(terrainTexture, float(0.1));
```

---

## MeshPhysicalNodeMaterial: Advanced PBR

For glass, water, subsurface scattering, and clearcoat:

```typescript
import { MeshPhysicalNodeMaterial } from 'three';
import { float, color } from 'three/tsl';

// Glass
const glass = new MeshPhysicalNodeMaterial({
  transmission: 0.95,        // light passes through
  ior: 1.5,                  // index of refraction (glass)
  roughness: 0.05,           // near-perfect surface
  thickness: 0.5,            // volume thickness for absorption
  transparent: true,
});

// Clearcoat (car paint, lacquered wood)
const carPaint = new MeshPhysicalNodeMaterial({
  clearcoat: 1.0,
  clearcoatRoughness: 0.1,
  metalness: 0.9,
  roughness: 0.4,
});
carPaint.colorNode = color(0.8, 0.1, 0.1);
```

---

## Post-Processing with TSL

The new `PostProcessing` class replaces the legacy `EffectComposer`:

```typescript
import { PostProcessing } from 'three';
import { pass, float, vec2, texture, uniform } from 'three/tsl';

const postProcessing = new PostProcessing(renderer);
const scenePass = pass(scene, camera);

// Bloom pass (built-in)
scenePass.setMRT(/* ... */);

// Custom vignette
const vignetteStrength = uniform(float(0.8));
const vignette = scenePass.getTextureNode();
const uv_centered = uv().sub(vec2(0.5));
const dist = uv_centered.length();
const vignetteEffect = vignette.mul(float(1).sub(dist.mul(vignetteStrength)));

postProcessing.outputNode = vignetteEffect;

// In render loop:
renderer.setAnimationLoop(() => {
  postProcessing.render();
});
```

---

## WebGPU Compute Shaders (Advanced)

TSL also supports compute shaders for GPU-side game logic (particle systems, spatial hashing):

```typescript
import { WebGPURenderer, StorageBufferAttribute } from 'three';
import { compute, storage, instanceIndex, float, vec3, time, sin } from 'three/tsl';

// Storage buffer with particle positions
const positionBuffer = new StorageBufferAttribute(particleCount * 3, 3);
const positionStorage = storage(positionBuffer, 'vec3', particleCount);

// Compute shader: update particle positions on the GPU
const computeParticles = compute(() => {
  const i = instanceIndex;
  const pos = positionStorage.element(i);
  pos.y.assign(pos.y.sub(float(9.81).mul(0.016))); // gravity
  pos.x.assign(pos.x.add(sin(time.add(float(i))).mul(0.01))); // drift
}, particleCount);

// In render loop:
renderer.setAnimationLoop(() => {
  renderer.computeAsync(computeParticles);
  renderer.render(scene, camera);
});
```

**Note:** Compute shaders require `WebGPURenderer` with actual WebGPU support — they do not fall back to WebGL. Gate compute usage behind a capability check:

```typescript
if (renderer.backend.isWebGPUBackend) {
  renderer.computeAsync(computeParticles);
}
```

---

## Performance Considerations

| Concern | Guideline |
|---------|-----------|
| **Node graph complexity** | TSL optimizes automatically (dead code elimination, CSE), but deeply nested graphs still compile to large shaders. Profile with `material.customProgramCacheKey()`. |
| **Uniform updates** | Updating a `uniform()` value is cheap (no recompilation). Prefer uniforms over rebuilding node graphs. |
| **Texture lookups** | Each `texture()` node is a GPU texture sample. Limit to 4-6 per material on mobile. |
| **Compute shaders** | WebGPU only — always check `renderer.backend.isWebGPUBackend`. Great for particle systems (thousands of particles at zero CPU cost). |
| **Material variants** | TSL compiles a unique shader per unique node graph. Reuse materials where possible — don't create per-object materials with identical graphs. |
| **Migration** | Start with classic properties (`color`, `roughness`). Only assign `*Node` slots when you need custom behavior. Mixing both works fine. |

---

## Common Mistakes

| Mistake | Fix |
|---------|-----|
| Using `ShaderMaterial` with `WebGPURenderer` | Use `MeshStandardNodeMaterial` + TSL nodes instead |
| Importing TSL from wrong path | Use `'three/tsl'` (not `'three/nodes'` — legacy path) |
| Rebuilding node graph every frame | Build the graph once, use `uniform()` for dynamic values |
| Forgetting `transparent: true` with `opacityNode` | Always set `transparent: true` when using opacity |
| Using compute shaders without WebGPU check | Gate behind `renderer.backend.isWebGPUBackend` |
| Creating unique materials per mesh with same shader | Share materials — TSL caches by graph structure |
