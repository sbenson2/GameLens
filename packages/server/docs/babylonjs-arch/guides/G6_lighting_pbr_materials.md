# G6 — Lighting & PBR Materials

> **Category:** guide · **Engine:** Babylon.js · **Related:** [Architecture Overview](../architecture/E1_architecture_overview.md), [Asset Loading](G4_asset_loading_gltf.md), [Babylon.js PBR Docs](https://doc.babylonjs.com/features/featuresDeepDive/materials/using/introToPBR)

Babylon.js has a mature PBR (Physically Based Rendering) pipeline that handles metallic-roughness workflows, image-based lighting (IBL), shadow generators, and — as of v9.0 — OpenPBR material mapping. This guide covers the lighting and material systems you need for game-quality rendering.

---

## PBR Material Classes

Babylon.js offers two PBR material classes:

| Class | Use Case |
|-------|----------|
| `PBRMetallicRoughnessMaterial` | Simple setup, matches glTF metallic-roughness model directly. Best for importing assets from Blender/Substance. |
| `PBRMaterial` | Full-featured, exposes every PBR parameter (subsurface, clear coat, anisotropy, sheen, etc.). Use when you need fine control. |

Both produce identical visual results for basic metallic-roughness setups. Start with `PBRMetallicRoughnessMaterial` and upgrade to `PBRMaterial` when you need advanced features.

---

## Basic PBR Setup

```typescript
import {
  Engine, Scene, ArcRotateCamera, Vector3,
  HemisphericLight, DirectionalLight,
  MeshBuilder, PBRMetallicRoughnessMaterial, Color3,
  CubeTexture,
} from '@babylonjs/core';

const engine = new Engine(canvas, true);
const scene = new Scene(engine);

// Camera
const camera = new ArcRotateCamera(
  'cam', -Math.PI / 2, Math.PI / 3, 10, Vector3.Zero(), scene
);
camera.attachControl(canvas, true);

// Environment texture — required for reflections and IBL
scene.environmentTexture = CubeTexture.CreateFromPrefilteredData(
  '/textures/environment.env', scene
);

// PBR material
const pbr = new PBRMetallicRoughnessMaterial('gold', scene);
pbr.baseColor = new Color3(1.0, 0.766, 0.336); // Gold
pbr.metallic = 1.0;
pbr.roughness = 0.3;

// Mesh
const sphere = MeshBuilder.CreateSphere('sphere', { diameter: 2 }, scene);
sphere.material = pbr;
```

### Environment Textures

PBR materials **require** an environment texture for realistic reflections. Without one, metallic surfaces appear flat black. Babylon.js supports:

- `.env` files — Babylon's native pre-filtered format (recommended; smallest, fastest).
- `.dds` files — pre-filtered cube maps.
- `.hdr` files — HDR equirectangular images, converted at load time.

Generate `.env` files from HDR images using the [Babylon.js Sandbox](https://sandbox.babylonjs.com/) or the `EnvironmentTextureTools` API.

---

## Light Types for Games

Babylon.js provides four light types, each with different performance characteristics:

### HemisphericLight — Ambient Fill

```typescript
import { HemisphericLight, Vector3, Color3 } from '@babylonjs/core';

const hemiLight = new HemisphericLight('hemi', new Vector3(0, 1, 0), scene);
hemiLight.intensity = 0.4;
hemiLight.diffuse = new Color3(0.9, 0.9, 1.0);    // Sky color
hemiLight.groundColor = new Color3(0.3, 0.2, 0.1); // Ground bounce
```

Cheapest light — no shadows, no specular by default. Use for ambient fill.

### DirectionalLight — Sun/Moon

```typescript
import { DirectionalLight, Vector3 } from '@babylonjs/core';

const sun = new DirectionalLight('sun', new Vector3(-1, -3, -1), scene);
sun.intensity = 1.5;
sun.position = new Vector3(20, 40, 20); // Position affects shadow origin
```

Parallel rays, like sunlight. Pairs with `CascadedShadowGenerator` for outdoor scenes.

### PointLight — Omnidirectional

```typescript
import { PointLight, Vector3 } from '@babylonjs/core';

const torch = new PointLight('torch', new Vector3(0, 3, 0), scene);
torch.intensity = 50; // PBR uses physical light units
torch.range = 15;     // Attenuation cutoff
```

Emits in all directions. Expensive for shadows (renders 6 cube faces). Limit shadow-casting point lights to 1-2.

### SpotLight — Cone

```typescript
import { SpotLight, Vector3 } from '@babylonjs/core';

const spot = new SpotLight(
  'spot',
  new Vector3(0, 10, 0),       // position
  new Vector3(0, -1, 0),       // direction
  Math.PI / 4,                 // angle (cone width)
  2,                           // exponent (falloff)
  scene
);
spot.intensity = 100;
```

Good for flashlights, streetlights, stage lights. Moderate shadow cost (one render pass).

### Light Intensity in PBR

PBR lights use **physical light falloff** (inverse-square) by default. This means intensity values are much higher than standard materials (50-200 for point/spot). To match a non-PBR setup, adjust intensity or switch falloff mode:

```typescript
// Use non-physical falloff (not recommended for PBR realism)
import { Light } from '@babylonjs/core';
pointLight.falloffType = Light.FALLOFF_STANDARD;
```

---

## Shadow Generators

### ShadowGenerator — Standard

Works with directional, point, and spot lights:

```typescript
import { ShadowGenerator } from '@babylonjs/core';

const shadowGen = new ShadowGenerator(1024, sun); // 1024 = map resolution
shadowGen.useBlurExponentialShadowMap = true;      // Soft shadows
shadowGen.blurKernel = 32;                         // Blur radius

// Add shadow casters
shadowGen.addShadowCaster(playerMesh);
shadowGen.addShadowCaster(enemyMesh);

// Receivers must opt in
ground.receiveShadows = true;
```

### CascadedShadowGenerator — Large Outdoor Scenes

For open-world or large outdoor scenes, `CascadedShadowGenerator` (CSM) splits the view frustum into distance-based cascades, each with its own shadow map. Near objects get crisp shadows; far objects get lower resolution (but still shadowed).

```typescript
import { CascadedShadowGenerator } from '@babylonjs/core';

const csm = new CascadedShadowGenerator(2048, sun);
csm.numCascades = 4;                    // 2–4 cascades typical
csm.stabilizeCascades = true;           // Reduces shimmer on camera move
csm.lambda = 0.7;                       // Blend between log/uniform splits
csm.cascadeBlendPercentage = 0.05;      // Smooth transition between cascades
csm.shadowMaxZ = 300;                   // Max shadow distance
csm.autoCalcDepthBounds = true;         // Tighter cascade bounds

csm.addShadowCaster(playerMesh);
ground.receiveShadows = true;
```

### Shadow Performance Tips

- **Resolution** — 1024 is fine for indoor; 2048 for outdoor CSM. 4096 is rarely needed and halves fill rate.
- **Filter mode** — `useBlurExponentialShadowMap` is the best quality/performance trade-off for most games.
- **Shadow caster list** — only add meshes that actually need to cast shadows. Every caster is re-rendered per light per cascade.
- **Freeze shadows** — for static scenes, call `shadowGenerator.getShadowMap().refreshRate = 0` to render the shadow map once.

---

## Advanced PBR Features (PBRMaterial)

When you need more than base color, metallic, and roughness:

### Clear Coat

Simulates a lacquer or varnish layer on top of the base surface (car paint, polished wood):

```typescript
import { PBRMaterial } from '@babylonjs/core';

const carPaint = new PBRMaterial('carPaint', scene);
carPaint.metallic = 0.9;
carPaint.roughness = 0.4;
carPaint.clearCoat.isEnabled = true;
carPaint.clearCoat.intensity = 1.0;
carPaint.clearCoat.roughness = 0.1; // Smooth clear coat
```

### Subsurface Scattering

For skin, wax, leaves — light that penetrates and scatters within a surface:

```typescript
const skin = new PBRMaterial('skin', scene);
skin.subSurface.isScatteringEnabled = true;
skin.subSurface.scatteringDiffusionProfile = new Color3(1.0, 0.4, 0.25);
```

### Anisotropy

For brushed metal, hair, silk — surfaces with directional highlights:

```typescript
const brushedSteel = new PBRMaterial('brushedSteel', scene);
brushedSteel.metallic = 1.0;
brushedSteel.anisotropy.isEnabled = true;
brushedSteel.anisotropy.intensity = 0.8;
brushedSteel.anisotropy.direction = new Vector2(1, 0);
```

---

## OpenPBR (Babylon.js 9.0+)

Babylon.js 9.0 introduces support for **OpenPBR**, an open standard from the Academy Software Foundation (ASWF). OpenPBR maps artist-friendly parameter groups — Base, Specular, Coat, Thin-film, and more — onto the existing `PBRMaterial` system. This means materials authored in OpenPBR-compatible tools (e.g., MaterialX exporters) load directly into Babylon.js without manual parameter conversion.

Additionally, v9.0 adds **Dynamic IBL Shadows** — environment-based shadows that respond to changes in lighting conditions in real time, rather than being baked.

---

## Lightmaps

For static lighting (pre-baked in Blender, Unity, or dedicated lightmap bakers), apply a lightmap texture:

```typescript
import { Texture } from '@babylonjs/core';

const material = new PBRMaterial('baked', scene);
material.lightmapTexture = new Texture('/textures/lightmap.png', scene);
material.useLightmapAsShadowmap = true; // Treat as combined light+shadow
material.lightmapTexture.coordinatesIndex = 1; // Use UV2 channel
```

Lightmaps eliminate runtime shadow costs for static geometry. Combine with one realtime directional light for dynamic objects.

---

## Performance Checklist

| Technique | Cost | Recommendation |
|-----------|------|----------------|
| Environment texture | Low | Always use — PBR looks wrong without it |
| HemisphericLight | Very low | 1 per scene for ambient fill |
| DirectionalLight + CSM | Moderate | 1 for sun, 2-4 cascades |
| PointLight shadows | High | Max 1-2 shadow-casting |
| SpotLight shadows | Moderate | Max 2-3 shadow-casting |
| Clear coat / SSS | Low | Enable only on close-up materials |
| Lightmaps | Zero runtime | Use for all static geometry |
| Freeze shadow maps | Zero runtime | Use for static casters |

---

## Common Pitfalls

- **No environment texture** — metallic PBR surfaces appear black without environment reflections. Always assign `scene.environmentTexture`.
- **IBL washing out shadows** — strong environment lighting can overpower shadow maps. Reduce `scene.environmentIntensity` or increase directional light intensity to rebalance.
- **Light count** — each active light adds a shader permutation and per-pixel cost. Keep total active lights under 8 for game scenes; under 4 on mobile.
- **Shadow map resolution on mobile** — mobile GPUs struggle with 2048+ shadow maps. Use 1024 and increase blur to compensate.
- **Forgetting `receiveShadows`** — shadow generators only affect meshes that explicitly opt in with `mesh.receiveShadows = true`.
