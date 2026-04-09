# Babylon.js Asset Loading — glTF, Compression & Production Pipelines

> **Category:** guide · **Engine:** Babylon.js v7+ · **Related:** [Architecture Overview](../architecture/E1_architecture_overview.md), [Physics with Havok](G1_physics_havok.md), [Animation System](G2_animation_system.md)

Babylon.js provides a powerful, extensible asset loading pipeline built around `SceneLoader`. This guide covers loading glTF/GLB models, managing assets with `AssetContainer`, compression strategies, and production optimization patterns.

---

## SceneLoader API

Babylon.js v7 introduced module-level loading functions that improve tree-shaking. Prefer the async variants.

### Core Loading Methods

| Method | Behaviour | When to use |
|--------|-----------|------------|
| `loadAssetContainerAsync` | Loads into an `AssetContainer` — nothing added to scene until you call `.addAllToScene()` | Preloading, pooling, deferred instantiation |
| `appendSceneAsync` | Loads and immediately adds everything to the active scene | Quick prototyping, single-model scenes |
| `importMeshAsync` | Loads specific meshes by name | When you need only certain meshes from a file |

### Basic Loading

```typescript
import { SceneLoader } from "@babylonjs/core/Loading/sceneLoader";
import "@babylonjs/loaders/glTF"; // registers the glTF plugin

// Load and add to scene
const result = await SceneLoader.ImportMeshAsync(
  "",                  // meshNames — "" loads all
  "/assets/models/",   // rootUrl
  "character.glb",     // fileName
  scene
);

const characterRoot = result.meshes[0];
characterRoot.position.y = 0;

// Access loaded components
console.log(result.meshes);          // AbstractMesh[]
console.log(result.skeletons);       // Skeleton[]
console.log(result.animationGroups); // AnimationGroup[]
```

### AssetContainer — Deferred Loading

`AssetContainer` loads assets without adding them to the scene. This is the recommended pattern for games because it gives you full control over when assets appear.

```typescript
import { SceneLoader } from "@babylonjs/core/Loading/sceneLoader";
import "@babylonjs/loaders/glTF";

// Preload during loading screen
const container = await SceneLoader.LoadAssetContainerAsync(
  "/assets/models/",
  "enemy.glb",
  scene
);

// Later, when the enemy should spawn:
container.addAllToScene();

// To despawn / unload:
container.removeAllFromScene();

// Clone for instancing (e.g., enemy pool)
const entries = container.instantiateModelsToScene(
  (name) => `enemy_${instanceId}_${name}` // name generator
);
const enemyRoot = entries.rootNodes[0];
```

**Why AssetContainer?**
- Prevents pop-in: load assets during a loading screen, add them when ready.
- Enables object pooling: `instantiateModelsToScene()` creates lightweight clones.
- Clean unloading: `removeAllFromScene()` + `dispose()` frees GPU resources.

---

## glTF Extension Support

Babylon.js supports the major glTF extensions relevant to games:

| Extension | Purpose | Import |
|-----------|---------|--------|
| `KHR_draco_mesh_compression` | Mesh geometry compression (70-90% smaller) | `@babylonjs/loaders/glTF` (auto-detected) |
| `KHR_mesh_quantization` | Reduced-precision vertex attributes | Built-in |
| `KHR_texture_basisu` | GPU-compressed textures (KTX2) | Built-in with `KhronosTextureContainer2` |
| `KHR_materials_unlit` | Flat/unlit materials for UI or stylized art | Built-in |
| `KHR_lights_punctual` | Embedded lights in glTF scenes | Built-in |
| `EXT_meshopt_compression` | Alternative mesh compression (better for animation) | `@babylonjs/loaders/glTF` (auto-detected) |

### Draco Compression Setup

Draco decompression runs in a Web Worker. Point Babylon to the decoder files:

```typescript
import { DracoCompression } from "@babylonjs/core/Meshes/Compression/dracoCompression";

DracoCompression.Configuration = {
  decoder: {
    wasmUrl: "/draco/draco_wasm_wrapper_gltf.js",
    wasmBinaryUrl: "/draco/draco_decoder_gltf.wasm",
    fallbackUrl: "/draco/draco_decoder_gltf.js", // non-WASM fallback
  },
};
```

> **Tip:** Host the Draco decoder files yourself rather than relying on CDNs for production games — avoids CORS issues and ensures availability.

### KTX2 Texture Compression

KTX2 (Basis Universal) textures decompress on the GPU, saving both download size and VRAM:

```typescript
import { KhronosTextureContainer2 } from "@babylonjs/core/Misc/khronosTextureContainer2";

// Point to the basis transcoder
KhronosTextureContainer2.URLConfig = {
  jsDecoderModule: "/basis/basis_transcoder.js",
  wasmURI: "/basis/basis_transcoder.wasm",
};
```

---

## Loading Patterns for Games

### Progress Tracking

```typescript
import { SceneLoader } from "@babylonjs/core/Loading/sceneLoader";

const container = await SceneLoader.LoadAssetContainerAsync(
  "/assets/",
  "level.glb",
  scene,
  (event) => {
    if (event.lengthComputable) {
      const pct = Math.round((event.loaded / event.total) * 100);
      updateLoadingBar(pct);
    }
  }
);
```

### Parallel Loading with AssetsManager

For loading multiple assets concurrently with a unified progress callback:

```typescript
import { AssetsManager } from "@babylonjs/core/Misc/assetsManager";

const manager = new AssetsManager(scene);

const characterTask = manager.addContainerTask(
  "character", "", "/assets/", "character.glb"
);
const environmentTask = manager.addContainerTask(
  "environment", "", "/assets/", "level.glb"
);
const audioTask = manager.addBinaryFileTask(
  "bgm", "/assets/audio/bgm.mp3"
);

manager.onProgress = (remaining, total) => {
  updateLoadingBar(((total - remaining) / total) * 100);
};

manager.onFinish = (tasks) => {
  characterTask.loadedContainer.addAllToScene();
  environmentTask.loadedContainer.addAllToScene();
};

await manager.loadAsync();
```

### Incremental Loading

For open-world or large scenes, load assets as the player moves:

```typescript
// Stream meshes progressively
SceneLoader.ShowLoadingScreen = false; // suppress default loading UI

scene.onBeforeRenderObservable.add(() => {
  const playerPos = player.position;

  for (const chunk of worldChunks) {
    const dist = Vector3.Distance(playerPos, chunk.center);
    if (dist < LOAD_DISTANCE && !chunk.loaded) {
      chunk.loaded = true;
      chunk.containerPromise = SceneLoader.LoadAssetContainerAsync(
        "/assets/chunks/", chunk.file, scene
      ).then((c) => {
        c.addAllToScene();
        chunk.container = c;
      });
    }
    if (dist > UNLOAD_DISTANCE && chunk.container) {
      chunk.container.removeAllFromScene();
      chunk.container.dispose();
      chunk.loaded = false;
    }
  }
});
```

---

## Right-Handed Coordinate System

glTF uses a right-handed coordinate system (Y-up, +Z forward). Babylon.js defaults to left-handed. You have two options:

**Option A — Switch scene to right-handed (recommended for glTF-heavy projects):**
```typescript
scene.useRightHandedSystem = true;
```

**Option B — Let the loader convert (default):** The glTF loader automatically flips coordinates to match Babylon's left-handed system. This works transparently but means exported positions/rotations differ from the glTF source values.

---

## Performance Considerations

1. **Instancing over cloning:** Use `container.instantiateModelsToScene()` for repeated objects (trees, enemies). Instances share geometry on the GPU.

2. **Dispose when done:** Call `container.dispose()` after `removeAllFromScene()` to free GPU buffers, textures, and materials. Failing to dispose is the most common memory leak.

3. **Texture compression matters most:** A 4K RGBA texture is 64MB uncompressed. KTX2 with Basis Universal reduces this to 2-8MB on the GPU. Always use `KHR_texture_basisu` for production.

4. **Mesh compression trade-offs:**
   - Draco: best compression ratio, slower to decompress, poor for animated meshes.
   - Meshopt: faster decompression, better for animated meshes, slightly larger files.
   - For games: use Draco for static environment, meshopt for characters/animated props.

5. **LOD:** Export multiple LOD levels in your glTF (using `MSFT_lod` extension or separate files) and swap based on camera distance.

6. **Mobile budgets:** Aim for under 50MB total asset download. Compress aggressively: Draco + KTX2 can reduce a 200MB scene to under 30MB.

---

## WebGPU Notes

Asset loading is renderer-agnostic — `SceneLoader` and `AssetContainer` work identically whether using the WebGL2 or WebGPU engine. Texture formats chosen by the Basis transcoder will automatically target the optimal GPU format (BC7 on desktop, ASTC on mobile) regardless of renderer backend.
