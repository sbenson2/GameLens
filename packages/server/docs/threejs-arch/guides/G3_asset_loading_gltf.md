# Three.js Asset Loading — glTF, Compression & Production Pipelines

> **Category:** guide · **Engine:** Three.js r160+ · **Related:** [E1_architecture_overview](../architecture/E1_architecture_overview.md), [G1_physics_rapier](G1_physics_rapier.md)

Loading 3D assets efficiently is critical for web games where every kilobyte impacts load time. Three.js standardizes on glTF 2.0 as its primary asset format, with a layered compression stack (Draco, KTX2/Basis Universal, meshopt) that can reduce file sizes by 80–95%. This guide covers the full pipeline from raw assets to production-ready delivery.

---

## Why glTF / GLB

glTF 2.0 is the "JPEG of 3D" — a standardized, runtime-efficient format supported by every major tool (Blender, Maya, Substance, etc.). Two variants exist:

- **`.gltf`** — JSON descriptor + separate `.bin` (geometry) and image files. Good for debugging, bad for HTTP overhead.
- **`.glb`** — Single binary file. Preferred for production — one HTTP request, smaller due to binary packing.

Three.js `GLTFLoader` handles both transparently.

---

## Basic Loading (TypeScript)

```typescript
import { Scene, Group, AnimationMixer, Clock } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const loader = new GLTFLoader();

// Async/await — recommended for game loading screens
const gltf = await loader.loadAsync('/models/character.glb');

// The result object
const model: Group = gltf.scene;           // Root scene graph
const clips = gltf.animations;             // AnimationClip[]
const cameras = gltf.cameras;              // Camera[] (if defined in file)
const asset = gltf.asset;                  // { generator, version, copyright }

scene.add(model);

// Play animations if present
if (clips.length > 0) {
  const mixer = new AnimationMixer(model);
  const action = mixer.clipAction(clips[0]);
  action.play();
  
  // In your game loop:
  // mixer.update(delta);
}
```

### Callback Style (for progress bars)

```typescript
loader.load(
  '/models/level.glb',
  (gltf) => {
    scene.add(gltf.scene);
  },
  (progress) => {
    // ProgressEvent — use for loading bars
    const pct = (progress.loaded / progress.total) * 100;
    updateLoadingBar(pct);
  },
  (error) => {
    console.error('Failed to load model:', error);
  }
);
```

---

## Draco Mesh Compression

Draco compresses mesh geometry (vertices, normals, UVs, indices) using the `KHR_draco_mesh_compression` glTF extension. Typical reduction: **80–90% smaller** geometry data.

### Setup

```typescript
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';

const dracoLoader = new DRACOLoader();

// Option A: Use CDN-hosted decoder (quick start)
dracoLoader.setDecoderPath('https://www.gstatic.com/draco/versioned/decoders/1.5.7/');

// Option B: Self-host decoder files (recommended for production)
// Copy from node_modules/three/examples/jsm/libs/draco/ to your public dir
dracoLoader.setDecoderPath('/draco/');

// Auto-detect WASM vs JS decoder based on browser support
// WASM is ~10x faster for large meshes
dracoLoader.setDecoderConfig({ type: 'wasm' }); // 'wasm' | 'js'

const gltfLoader = new GLTFLoader();
gltfLoader.setDRACOLoader(dracoLoader);

// Now any .glb with Draco compression decodes automatically
const gltf = await gltfLoader.loadAsync('/models/city.glb');
```

### Creating Draco-Compressed Files

Use **gltf-transform** (recommended) or **gltf-pipeline**:

```bash
# Install gltf-transform CLI
npm install -g @gltf-transform/cli

# Compress meshes with Draco
gltf-transform draco input.glb output.glb

# Fine-tune quantization (lower = smaller but less precise)
gltf-transform draco input.glb output.glb \
  --quantize-position 14 \
  --quantize-normal 10 \
  --quantize-texcoord 12
```

### Performance Notes

- Draco decompression runs in a Web Worker (non-blocking).
- First load has ~50ms overhead to initialize the WASM decoder.
- For many small meshes, the per-mesh decode overhead can exceed savings. Merge static meshes first.

---

## KTX2 / Basis Universal Texture Compression

KTX2 containers with Basis Universal supercompression deliver GPU-compressed textures that stay compressed in VRAM — drastically reducing memory usage vs. PNG/JPEG which decompress to raw RGBA.

| Format | VRAM per 1024×1024 | Browser decoding |
|--------|---------------------|-----------------|
| PNG (RGBA8) | 4 MB | Decompress to raw |
| JPEG | 4 MB | Decompress to raw |
| KTX2 (BC7/ASTC) | 1 MB | Direct GPU upload |

### Setup

```typescript
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { KTX2Loader } from 'three/addons/loaders/KTX2Loader.js';

const ktx2Loader = new KTX2Loader();

// Must set the transcoder path BEFORE loading
// Copy from node_modules/three/examples/jsm/libs/basis/
ktx2Loader.setTranscoderPath('/basis/');

// Provide the renderer so KTX2Loader can detect GPU capabilities
// and transcode to the best format (BC7 on desktop, ASTC on mobile, ETC2 fallback)
ktx2Loader.detectSupport(renderer);

const gltfLoader = new GLTFLoader();
gltfLoader.setKTX2Loader(ktx2Loader);

const gltf = await gltfLoader.loadAsync('/models/scene.glb');
```

### Creating KTX2 Textures

```bash
# Using gltf-transform to convert all textures in a glb to KTX2
gltf-transform ktx input.glb output.glb --format uastc

# For color textures (diffuse, emissive) — use ETC1S (smaller, lossy)
gltf-transform ktx input.glb output.glb --format etc1s --quality 128

# For data textures (normal maps, roughness) — use UASTC (higher quality)
gltf-transform ktx input.glb output.glb --format uastc --slots "normalTexture"
```

### When to Use KTX2

- **Always** for production games with >4 textures.
- Mobile games benefit most — ASTC keeps VRAM under control.
- Skip for prototyping — the tooling adds pipeline complexity.

---

## Meshopt Compression

An alternative/complement to Draco that compresses geometry AND animation data. Uses the `EXT_meshopt_compression` extension.

```typescript
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';

const gltfLoader = new GLTFLoader();
gltfLoader.setMeshoptDecoder(MeshoptDecoder);

const gltf = await gltfLoader.loadAsync('/models/animated_character.glb');
```

### Draco vs Meshopt

| Feature | Draco | Meshopt |
|---------|-------|---------|
| Mesh compression | Excellent (80-90%) | Good (60-80%) |
| Animation compression | No | Yes |
| Decode speed | Slower (WASM worker) | Faster (JS, no worker needed) |
| Quantization artifacts | Can distort normals | Preserves topology better |
| Streaming support | No | Yes (progressive loading) |

**Recommendation:** Use Draco for static environments. Use meshopt for animated characters where animation data is a large portion of the file.

---

## Combined Compression Pipeline

For maximum savings, combine Draco (geometry) + KTX2 (textures):

```typescript
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { KTX2Loader } from 'three/addons/loaders/KTX2Loader.js';

// Configure both loaders
const dracoLoader = new DRACOLoader();
dracoLoader.setDecoderPath('/draco/');

const ktx2Loader = new KTX2Loader();
ktx2Loader.setTranscoderPath('/basis/');
ktx2Loader.detectSupport(renderer);

// Attach both to GLTFLoader
const gltfLoader = new GLTFLoader();
gltfLoader.setDRACOLoader(dracoLoader);
gltfLoader.setKTX2Loader(ktx2Loader);

// Load — compression is handled transparently
const gltf = await gltfLoader.loadAsync('/models/game_level.glb');
```

### Build Pipeline (gltf-transform)

```bash
# Full production pipeline: optimize → compress geometry → compress textures
gltf-transform dedup input.glb tmp1.glb          # Remove duplicate accessors
gltf-transform flatten tmp1.glb tmp2.glb          # Flatten node hierarchy
gltf-transform draco tmp2.glb tmp3.glb            # Draco-compress geometry
gltf-transform ktx tmp3.glb output.glb --format etc1s  # KTX2-compress textures
rm tmp1.glb tmp2.glb tmp3.glb

# Or chain with gltf-transform's pipeline syntax:
gltf-transform optimize input.glb output.glb \
  --compress draco \
  --texture-compress ktx2
```

---

## Loading Manager & Multi-Asset Loading

For games with many assets, use `LoadingManager` to track overall progress:

```typescript
import { LoadingManager } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const manager = new LoadingManager();

manager.onStart = (url, loaded, total) => {
  console.log(`Loading started: ${url}`);
};

manager.onProgress = (url, loaded, total) => {
  const progress = (loaded / total) * 100;
  updateLoadingScreen(progress);
};

manager.onLoad = () => {
  hideLoadingScreen();
  startGame();
};

manager.onError = (url) => {
  console.error(`Failed to load: ${url}`);
};

// All loaders share the same manager
const gltfLoader = new GLTFLoader(manager);
const textureLoader = new TextureLoader(manager);

// Queue all loads — manager tracks completion
gltfLoader.loadAsync('/models/player.glb');
gltfLoader.loadAsync('/models/enemy.glb');
gltfLoader.loadAsync('/models/level.glb');
textureLoader.loadAsync('/textures/skybox.jpg');
```

---

## glTF Extensions Supported by Three.js

Key game-relevant extensions supported out of the box:

| Extension | Purpose |
|-----------|---------|
| `KHR_draco_mesh_compression` | Geometry compression |
| `KHR_texture_basisu` | KTX2/Basis Universal textures |
| `EXT_meshopt_compression` | Meshopt geometry + animation compression |
| `KHR_materials_unlit` | Unlit/toon materials |
| `KHR_materials_transmission` | Glass, water |
| `KHR_materials_clearcoat` | Car paint, lacquer |
| `KHR_materials_iridescence` | Soap bubbles, oil slicks |
| `KHR_lights_punctual` | Point, spot, directional lights embedded in scene |
| `EXT_mesh_gpu_instancing` | Hardware instancing data in glTF |
| `KHR_animation_pointer` | Animate any property (via plugin) |

---

## Performance Checklist

1. **Use GLB over glTF** — single request, binary packing.
2. **Draco-compress all static meshes** — 80-90% geometry savings.
3. **KTX2 all textures for production** — 75% less VRAM.
4. **Max texture size: 2048×2048** (1024 on mobile). Power-of-two dimensions.
5. **Preload during loading screen** — never load assets during gameplay.
6. **Dispose loaded assets on scene change** — call `.dispose()` on geometry, materials, and textures.
7. **Reuse loaders** — don't create new `GLTFLoader` instances per load.
8. **Enable HTTP/2** on your server — parallel asset downloads.
9. **Serve with gzip/brotli** — additional 20-40% savings on non-compressed formats.
10. **Profile with `renderer.info`** — check `textures`, `geometries`, `programs` counts.
