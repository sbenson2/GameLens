# Lighting & PBR Materials

> **Category:** guide · **Engine:** Three.js · **Related:** [G2_tsl_node_materials.md](G2_tsl_node_materials.md), [G9_webgpu_renderer.md](G9_webgpu_renderer.md), [G3_asset_loading_gltf.md](G3_asset_loading_gltf.md)

Three.js implements a metallic-roughness PBR workflow through `MeshStandardMaterial` and its advanced sibling `MeshPhysicalMaterial`. These materials respond realistically to any lighting setup, removing the need to hand-tune appearances per scene. This guide covers light types, PBR material configuration, environment maps, and performance trade-offs for game projects.

---

## Light Types

Three.js provides five core light sources. Most game scenes combine two or three.

### AmbientLight

Illuminates all objects equally — no direction, no shadows. Use it as a low-intensity fill to prevent pitch-black areas.

```typescript
import * as THREE from "three";

const ambient = new THREE.AmbientLight(0x404040, 0.5); // color, intensity
scene.add(ambient);
```

### DirectionalLight

Parallel rays simulating sunlight. Casts shadows via an orthographic camera frustum.

```typescript
const sun = new THREE.DirectionalLight(0xffffff, 1.5);
sun.position.set(50, 80, 30);
sun.castShadow = true;

// Shadow map quality
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.near = 0.5;
sun.shadow.camera.far = 200;
sun.shadow.camera.left = -50;
sun.shadow.camera.right = 50;
sun.shadow.camera.top = 50;
sun.shadow.camera.bottom = -50;

scene.add(sun);
```

**Performance note:** Shadow map resolution directly impacts GPU fill rate. Use 1024×1024 for mobile, 2048×2048 for desktop. Tighten the shadow camera frustum around visible geometry to maximize texel density.

### PointLight

Emits in all directions from a single position — torches, lamps, explosions.

```typescript
const torch = new THREE.PointLight(0xff6600, 2, 50, 2);
// color, intensity, distance (falloff range), decay (physical falloff exponent)
torch.position.set(0, 3, 0);
torch.castShadow = true;
scene.add(torch);
```

**Performance note:** Each shadow-casting point light renders 6 shadow passes (cube map). Limit shadow-casting point lights to 1–2 in gameplay areas. Use non-shadow point lights or baked lightmaps for ambient fill.

### SpotLight

Cone-shaped light for flashlights, stage lights, headlights.

```typescript
const spot = new THREE.SpotLight(0xffffff, 3, 100, Math.PI / 6, 0.3, 2);
// color, intensity, distance, angle (half-cone), penumbra (0–1 soft edge), decay
spot.position.set(0, 10, 0);
spot.target.position.set(0, 0, -10);
spot.castShadow = true;
scene.add(spot);
scene.add(spot.target);
```

### HemisphereLight

Sky/ground gradient fill — cheap ambient that adds directional color variation without shadows.

```typescript
const hemi = new THREE.HemisphereLight(0x87ceeb, 0x362907, 0.6);
// skyColor, groundColor, intensity
scene.add(hemi);
```

**Game pattern:** Hemisphere + one DirectionalLight with shadows is the most common outdoor lighting rig in web games. It is cheap, looks good, and scales to mobile.

---

## MeshStandardMaterial — The Workhorse PBR Material

This is the default choice for nearly all game objects. It implements the metallic-roughness model.

### Core Properties

| Property | Default | Purpose |
|----------|---------|---------|
| `color` | `#ffffff` | Base diffuse color (multiplied with `map`) |
| `metalness` | `0` | 0 = dielectric, 1 = metal |
| `roughness` | `1` | 0 = mirror, 1 = fully diffuse |
| `envMap` | `null` | Environment cubemap for reflections |
| `envMapIntensity` | `1` | Reflection brightness multiplier |

### Texture Maps

| Map | Channel | Purpose |
|-----|---------|---------|
| `map` | RGBA | Albedo / base color (alpha = transparency) |
| `normalMap` | RGB | Surface micro-detail via per-pixel normal perturbation |
| `roughnessMap` | G | Per-pixel roughness (multiplied with `roughness`) |
| `metalnessMap` | B | Per-pixel metalness (multiplied with `metalness`) |
| `aoMap` | R | Ambient occlusion — requires `uv2` attribute |
| `emissiveMap` | RGB | Self-illumination (multiplied with `emissive` color) |
| `displacementMap` | Grayscale | Vertex displacement (affects geometry, can cast shadows) |
| `bumpMap` | Grayscale | Cheaper alternative to normalMap (ignored if normalMap set) |
| `lightMap` | RGB | Baked lighting — requires `uv2` attribute |
| `alphaMap` | Grayscale | Per-pixel opacity (black = transparent) |

### Typical Game Material Setup

```typescript
import * as THREE from "three";

const textureLoader = new THREE.TextureLoader();

const material = new THREE.MeshStandardMaterial({
  map: textureLoader.load("/textures/brick_diffuse.jpg"),
  normalMap: textureLoader.load("/textures/brick_normal.jpg"),
  roughnessMap: textureLoader.load("/textures/brick_roughness.jpg"),
  metalnessMap: textureLoader.load("/textures/brick_metalness.jpg"),
  aoMap: textureLoader.load("/textures/brick_ao.jpg"),
  roughness: 1.0,
  metalness: 1.0, // let the maps drive actual values
  envMapIntensity: 1.0,
});

// AO and lightmaps require a second UV channel
const geometry = new THREE.BoxGeometry(2, 2, 2);
geometry.setAttribute("uv2", geometry.getAttribute("uv")); // copy uv → uv2
```

---

## MeshPhysicalMaterial — Advanced PBR Effects

Extends `MeshStandardMaterial` with physically-based special effects. Each feature is disabled by default and adds shader complexity when enabled — only activate what you need.

### Clearcoat

Simulates a transparent reflective layer (car paint, lacquer, carbon fiber, wet surfaces).

```typescript
const carPaint = new THREE.MeshPhysicalMaterial({
  color: 0x991100,
  metalness: 0.9,
  roughness: 0.4,
  clearcoat: 1.0,          // 0–1, layer intensity
  clearcoatRoughness: 0.1, // 0–1, layer roughness
});
```

### Transmission (Physically-Based Glass)

Replaces opacity-based transparency with physically correct light transmission. When `transmission > 0`, set `opacity: 1`.

```typescript
const glass = new THREE.MeshPhysicalMaterial({
  transmission: 1.0,    // 0–1, fully transparent
  thickness: 0.5,       // simulated volume thickness (affects refraction)
  roughness: 0.0,       // smooth glass
  ior: 1.5,             // index of refraction (glass ≈ 1.5, water ≈ 1.33)
  color: 0xffffff,
  opacity: 1.0,         // must be 1 when using transmission
});
```

### Sheen

Fabric and cloth rendering — adds a soft highlight at grazing angles.

```typescript
const fabric = new THREE.MeshPhysicalMaterial({
  color: 0x2244aa,
  sheen: 1.0,              // 0–1
  sheenRoughness: 0.8,     // 0–1
  sheenColor: new THREE.Color(0x4488ff),
  roughness: 1.0,
});
```

### Iridescence

Thin-film interference (soap bubbles, oil slicks, beetle shells).

```typescript
const iridescent = new THREE.MeshPhysicalMaterial({
  iridescence: 1.0,                    // 0–1
  iridescenceIOR: 1.3,                 // 1.0–2.333
  iridescenceThicknessRange: [100, 400], // nm, controls color shift range
  metalness: 1.0,
  roughness: 0.2,
});
```

### Anisotropy

Directional roughness for brushed metal, hair, vinyl records.

```typescript
const brushedMetal = new THREE.MeshPhysicalMaterial({
  metalness: 1.0,
  roughness: 0.3,
  anisotropy: 0.8,          // 0–1, stretches highlights
  anisotropyRotation: 0,    // radians
});
```

### Dispersion

Chromatic aberration through transparent volumes (prisms, diamonds).

```typescript
const diamond = new THREE.MeshPhysicalMaterial({
  transmission: 1.0,
  ior: 2.33,
  dispersion: 0.5,   // 0+, typical 0–1
  thickness: 1.0,
  roughness: 0.0,
  opacity: 1.0,
});
```

---

## Environment Maps

Environment maps are essential for realistic PBR. Without one, metallic surfaces appear black.

### Using PMREMGenerator

Three.js pre-filters environment maps for physically correct roughness-based reflections:

```typescript
import { RGBELoader } from "three/addons/loaders/RGBELoader.js";

const pmremGenerator = new THREE.PMREMGenerator(renderer);
pmremGenerator.compileEquirectangularShader();

new RGBELoader().load("/envmaps/studio.hdr", (hdrTexture) => {
  const envMap = pmremGenerator.fromEquirectangular(hdrTexture).texture;
  scene.environment = envMap; // applies to all PBR materials
  scene.background = envMap;  // optional skybox

  hdrTexture.dispose();
  pmremGenerator.dispose();
});
```

**Game tip:** Set `scene.environment` once and all `MeshStandardMaterial` / `MeshPhysicalMaterial` instances automatically use it — no per-material `envMap` assignment needed.

### Lightweight Alternatives

For performance-constrained games, use a low-resolution cubemap (64×64 per face) or a flat-color `envMap` generated from `PMREMGenerator`. The reflections won't be photo-realistic, but metals will still read correctly.

---

## Performance Considerations for Games

### Material Cost Hierarchy

From cheapest to most expensive per fragment:

1. `MeshBasicMaterial` — no lighting, texture only
2. `MeshLambertMaterial` — per-vertex diffuse
3. `MeshPhongMaterial` — per-fragment specular
4. `MeshStandardMaterial` — per-fragment PBR
5. `MeshPhysicalMaterial` — PBR + optional advanced features

Each enabled Physical feature (clearcoat, transmission, sheen, iridescence) adds shader branches. Transmission is the most expensive because it requires a separate render pass for the background.

### Shadow Optimization

- Use `renderer.shadowMap.type = THREE.VSMShadowMap` for soft shadows without PCF sampling artifacts.
- Cascade shadow maps (CSM) via `three/addons/csm/CSM.js` for large outdoor scenes.
- Disable `castShadow` on small or distant objects.
- Use `light.shadow.autoUpdate = false` and manually call `light.shadow.needsUpdate = true` for static scenes.

### Texture Tips

- Compress textures with KTX2 (Basis Universal) for 4–6× smaller GPU memory footprint.
- Share roughness (G) and metalness (B) in a single texture — the glTF ORM pattern.
- Use `texture.anisotropy = renderer.capabilities.getMaxAnisotropy()` for ground textures viewed at grazing angles.
- Mipmap filtering is enabled by default — ensure textures are power-of-two or use `NearestFilter` for pixel art.

### Mobile GPU Limits

- Limit to 1 shadow-casting directional light.
- Avoid `MeshPhysicalMaterial` transmission on mobile — the extra render pass halves frame rate.
- Keep total unique materials under 20 to reduce shader compilation stalls.
- Use `renderer.info` to monitor draw calls, triangles, and texture memory at runtime.

---

## Tone Mapping and Color Space

Correct tone mapping is critical for PBR to look right:

```typescript
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
renderer.outputColorSpace = THREE.SRGBColorSpace;
```

Ensure all color textures (diffuse, emissive) use `SRGBColorSpace` and all data textures (normal, roughness, metalness, AO) use `LinearSRGBColorSpace`. The `GLTFLoader` handles this automatically for glTF assets.
