# Lighting & PBR Materials

> **Category:** guide · **Engine:** PlayCanvas · **Related:** [Architecture Overview](../architecture/E1_architecture_overview.md), [Optimization](G7_optimization_performance.md), [WebGPU Support](G3_webgpu_support.md)

PlayCanvas uses physically based rendering (PBR) as its default material model, combined with a clustered lighting system that efficiently handles hundreds of dynamic lights. This guide covers light types, the StandardMaterial PBR workflow, shadow configuration, and performance tuning.

## Clustered Lighting Architecture

Since Engine v1.56, PlayCanvas uses clustered lighting by default for omni (point) and spot lights. The system works by:

1. Culling lights against the camera frustum
2. Dividing the visible volume into a 3D grid of cells
3. Assigning each light to the cells it overlaps
4. Storing per-cell light indices in GPU textures
5. At each pixel, sampling only the lights in that pixel's cell

This means adding more lights to the scene has minimal cost as long as each pixel is only affected by a handful of them. Directional lights bypass clustering and apply globally.

### Configuring the Cluster Grid

```typescript
import * as pc from 'playcanvas';

const app = new pc.Application(canvas);

// Access lighting settings through the scene
const lighting = app.scene.lighting;

// Grid resolution — higher values = tighter culling, more CPU cost
lighting.cells = new pc.Vec3(16, 4, 16); // X, Y, Z cell counts

// Max lights per cell — raise if you see light popping
lighting.maxLightsPerCell = 12; // default: 8

// Shadow atlas resolution (shared atlas for all clustered shadows)
lighting.shadowAtlasResolution = 2048;

// Cookie atlas resolution (for projected textures)
lighting.cookieAtlasResolution = 2048;
```

## Light Types

### Directional Light

Global light affecting all objects. Not clustered — always evaluated.

```typescript
const sun = new pc.Entity('sun');
sun.addComponent('light', {
  type: 'directional',
  color: new pc.Color(1, 0.95, 0.85),
  intensity: 1.2,
  castShadows: true,
  shadowBias: 0.2,
  shadowDistance: 100,        // shadow draw distance
  numCascades: 4,             // cascaded shadow maps
  cascadeDistribution: 0.7,   // 0 = linear, 1 = logarithmic
  shadowResolution: 2048,
});
sun.setEulerAngles(45, 135, 0);
app.root.addChild(sun);
```

### Point Light (Omni)

Emits in all directions. Uses clustered lighting.

```typescript
const torch = new pc.Entity('torch');
torch.addComponent('light', {
  type: 'omni',
  color: new pc.Color(1, 0.6, 0.2),
  intensity: 3,
  range: 15,                  // light attenuation radius
  falloffMode: pc.LIGHTFALLOFF_INVERSESQUARED,
  castShadows: true,
  shadowBias: 0.3,
});
torch.setPosition(5, 2, 0);
app.root.addChild(torch);
```

### Spot Light

Directed cone of light. Uses clustered lighting.

```typescript
const spotlight = new pc.Entity('spotlight');
spotlight.addComponent('light', {
  type: 'spot',
  color: new pc.Color(1, 1, 1),
  intensity: 5,
  range: 20,
  innerConeAngle: 20,   // full-intensity cone
  outerConeAngle: 40,   // falloff edge
  castShadows: true,
  shadowResolution: 512,
  // Cookie texture (projected pattern)
  // cookie: cookieTexture,
  // cookieIntensity: 1,
});
spotlight.setEulerAngles(90, 0, 0);
spotlight.setPosition(0, 10, 0);
app.root.addChild(spotlight);
```

### Area Lights

PlayCanvas supports rect and disk area lights for soft, realistic illumination. Area lights are more expensive but produce physically accurate soft shadows.

```typescript
const areaLight = new pc.Entity('areaLight');
areaLight.addComponent('light', {
  type: 'spot',                    // area lights use spot type with shape
  shape: pc.LIGHTSHAPE_RECT,      // or LIGHTSHAPE_DISK
  color: new pc.Color(0.9, 0.9, 1),
  intensity: 8,
  range: 10,
  innerConeAngle: 80,
  outerConeAngle: 90,
  castShadows: false,              // area light shadows are expensive
});
areaLight.setLocalScale(2, 1, 2);  // controls area size
app.root.addChild(areaLight);
```

## StandardMaterial PBR Properties

PlayCanvas uses a metalness/roughness PBR workflow via `StandardMaterial`.

### Basic Setup

```typescript
const material = new pc.StandardMaterial();

// Albedo (base color)
material.diffuse = new pc.Color(0.8, 0.2, 0.2);
// material.diffuseMap = albedoTexture;

// Metalness: 0 = dielectric, 1 = metal
material.metalness = 0.0;
// material.metalnessMap = metalnessTexture;

// Roughness: 0 = mirror-smooth, 1 = fully rough
material.gloss = 0.4;               // gloss = 1 - roughness
material.glossInvert = true;         // treat gloss map as roughness map
// material.glossMap = roughnessTexture;

// Normal mapping
// material.normalMap = normalTexture;
material.bumpiness = 1.0;           // normal map strength

// Ambient occlusion
// material.aoMap = aoTexture;

// Emission
material.emissive = new pc.Color(0, 0, 0);
material.emissiveIntensity = 1;

material.update();
```

### Common Material Presets

```typescript
// Polished metal
function createMetal(color: pc.Color): pc.StandardMaterial {
  const mat = new pc.StandardMaterial();
  mat.diffuse = color;
  mat.metalness = 1.0;
  mat.gloss = 0.85;     // highly reflective
  mat.glossInvert = true;
  mat.update();
  return mat;
}

// Rough wood
function createWood(diffuseMap: pc.Texture, normalMap: pc.Texture): pc.StandardMaterial {
  const mat = new pc.StandardMaterial();
  mat.diffuseMap = diffuseMap;
  mat.normalMap = normalMap;
  mat.bumpiness = 0.8;
  mat.metalness = 0;
  mat.gloss = 0.25;     // very rough
  mat.glossInvert = true;
  mat.update();
  return mat;
}

// Glass / transparent
function createGlass(): pc.StandardMaterial {
  const mat = new pc.StandardMaterial();
  mat.diffuse = new pc.Color(0.9, 0.95, 1.0);
  mat.metalness = 0.0;
  mat.gloss = 0.95;
  mat.glossInvert = true;
  mat.opacity = 0.3;
  mat.blendType = pc.BLEND_NORMAL;
  mat.depthWrite = false;
  mat.update();
  return mat;
}
```

### Clear Coat and Sheen

For automotive paint, lacquered surfaces, or fabric:

```typescript
// Clear coat (car paint effect)
material.clearCoat = 1.0;
material.clearCoatGloss = 0.9;
// material.clearCoatNormalMap = clearCoatNormalTexture;

// Sheen (fabric/cloth)
material.sheen = new pc.Color(0.3, 0.3, 0.3);
material.sheenGloss = 0.5;

material.update();
```

## Environment Lighting

Image-based lighting (IBL) provides ambient reflections and diffuse fill from an environment map:

```typescript
// Load an HDR environment map
const envAtlas = await new Promise<pc.Texture>((resolve) => {
  app.assets.loadFromUrl('/env/studio.hdr', 'texture', (err, asset) => {
    resolve(asset!.resource);
  });
});

// Apply as scene skybox and IBL source
app.scene.envAtlas = envAtlas;
app.scene.skyboxIntensity = 1.0;
app.scene.skyboxMip = 0;      // 0 = sharp, higher = blurred

// Tone mapping
app.scene.toneMapping = pc.TONEMAP_ACES;
app.scene.exposure = 1.2;
app.scene.gammaCorrection = pc.GAMMA_SRGB;
```

## Lightmapping

For static scenes, baked lightmaps eliminate runtime lighting cost:

```typescript
// Mark meshes as lightmapped
const staticWall = entity.render.meshInstances[0];
staticWall.node.tags.add('lightmapped');

// In the PlayCanvas Editor: Bake > Lightmap
// Programmatically, lightmap textures are assigned via:
// meshInstance.lightmapTexture = bakedLightmap;
```

**Hybrid approach:** Use baked lightmaps for static geometry and clustered dynamic lights for moving objects and interactive props.

## Shadow Best Practices

| Setting | Desktop | Mobile |
|---|---|---|
| Directional cascades | 4 | 2 |
| Shadow resolution | 2048 | 512–1024 |
| Shadow atlas | 2048–4096 | 1024–2048 |
| Shadow distance | 80–150 | 30–60 |
| Shadow type | `pc.SHADOW_PCF5` | `pc.SHADOW_PCF3` |

```typescript
// Soft shadows via PCF filtering
light.light.shadowType = pc.SHADOW_PCF5;

// Variance shadow maps (smoother but more memory)
light.light.shadowType = pc.SHADOW_VSM32;
light.light.vsmBlurSize = 11;
```

## Performance Considerations

- **Light count per cell matters more than total lights.** A scene with 200 lights performs well if each pixel only evaluates 4–6 of them. Monitor `maxLightsPerCell` warnings in the console.
- **Shadow-casting lights are expensive.** Each shadowed light needs a shadow map render pass. Limit shadow casters to 2–4 key lights; use non-shadowed fill lights for the rest.
- **Area lights cost more per pixel.** Reserve them for hero lighting (e.g., a neon sign, desk lamp) rather than general illumination.
- **Clustered lighting has no effect on directional lights.** A single directional light is cheap; multiple directional lights each add a full-scene pass.
- **Compress environment maps.** Use `.basis` or `.ktx2` formats for IBL cubemaps to reduce GPU memory by 4–6x.
- **Use `material.chunks`** to override individual shader chunks for custom effects without writing a full custom shader.

## WebGPU Notes

PlayCanvas Engine v2+ supports WebGPU rendering. The lighting and material systems work identically, but WebGPU enables:

- Compute shader–based light culling (future optimization path)
- Bindless texture access for material atlases
- More efficient shadow atlas management via render bundles

No material or lighting code changes are needed when switching from WebGL2 to WebGPU — the engine abstracts the backend.
