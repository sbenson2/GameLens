# Optimization & Performance

> **Category:** guide · **Engine:** Babylon.js · **Related:** [Architecture Overview](../architecture/E1_architecture_overview.md), [Lighting & PBR](G6_lighting_pbr_materials.md)

Babylon.js provides a layered optimization toolkit — from quick scene-level toggles to fine-grained GPU instancing and occlusion queries. This guide covers the major techniques ordered from lowest effort to most advanced.

## Scene-Level Quick Wins

These single-line optimizations yield immediate frame rate improvements with minimal risk.

```typescript
import { Scene, Engine } from '@babylonjs/core';

const engine = new Engine(canvas, true);
const scene = new Scene(engine);

// 1. Freeze the active mesh list — skips per-frame mesh evaluation
//    Use when the set of visible meshes rarely changes
scene.freezeActiveMeshes();
// Call scene.unfreezeActiveMeshes() when objects are added/removed

// 2. Skip pointer-move evaluation when you don't need hover events
scene.skipPointerMovePicking = true;

// 3. Block material re-compilation when properties aren't changing
scene.blockMaterialDirtyMechanism = true;

// 4. Disable intermediate rendering events you don't subscribe to
scene.renderTargetsEnabled = false; // if no render targets
scene.particlesEnabled = false;      // if no particles
scene.spritesEnabled = false;        // if no sprites

// 5. Autoclean unused resources
scene.cleanCachedTextureBuffer();
```

## Mesh Optimization Strategies

### Freezing Transforms

When a mesh is static (never moves, rotates, or scales), freeze its world matrix to skip recomputation every frame:

```typescript
mesh.freezeWorldMatrix();
// Call mesh.unfreezeWorldMatrix() if you need to move it later

// Also freeze the material if its properties are constant
mesh.material.freeze();
```

### Mesh Merging

Merge many small static meshes into a single draw call:

```typescript
import { Mesh } from '@babylonjs/core';

// Merge an array of meshes sharing the same material
const merged = Mesh.MergeMeshes(
  smallMeshes,      // meshes to merge
  true,             // dispose source meshes
  true,             // allow 32-bit indices (for >65k vertices)
  undefined,        // parent
  false,            // subdivide per mesh (keep false for max batching)
  true              // multi-material support
);
```

**When to merge vs. instance:** Merge when meshes are unique geometry that never moves independently. Instance when many copies of identical geometry need individual transforms.

### Instances

Standard instances share geometry and material but allow per-instance world matrices:

```typescript
const baseTree = MeshBuilder.CreateCylinder('tree', { height: 5, diameter: 1 }, scene);

for (let i = 0; i < 500; i++) {
  const instance = baseTree.createInstance(`tree_${i}`);
  instance.position.x = Math.random() * 200 - 100;
  instance.position.z = Math.random() * 200 - 100;
}
// Result: 500 trees in ~1 draw call
```

### Thin Instances

Thin instances are the highest-performance option — no individual `TransformNode` overhead, just raw matrix buffers sent to the GPU:

```typescript
import { Matrix } from '@babylonjs/core';

const grass = MeshBuilder.CreatePlane('grass', { size: 0.3 }, scene);
const matrices = new Float32Array(10000 * 16); // 10k instances

for (let i = 0; i < 10000; i++) {
  const mat = Matrix.Translation(
    Math.random() * 100 - 50,
    0,
    Math.random() * 100 - 50
  );
  mat.copyToArray(matrices, i * 16);
}

grass.thinInstanceSetBuffer('matrix', matrices, 16);

// Update a single instance later:
const updatedMat = Matrix.Translation(5, 0, 5);
grass.thinInstanceSetMatrixAt(42, updatedMat);
```

**Thin instance limits:** Thin instances support frustum culling at the bounding-box level (the entire batch is culled, not individual instances). For per-instance culling, split into spatial chunks.

## Level of Detail (LOD)

```typescript
import { MeshBuilder } from '@babylonjs/core';

// Create LOD levels (or load from glTF with LOD extension)
const highPoly = await SceneLoader.ImportMeshAsync('', '/models/', 'tree_lod0.glb', scene);
const medPoly  = await SceneLoader.ImportMeshAsync('', '/models/', 'tree_lod1.glb', scene);
const lowPoly  = await SceneLoader.ImportMeshAsync('', '/models/', 'tree_lod2.glb', scene);

// Register LOD levels on the high-poly mesh
const rootMesh = highPoly.meshes[0];
rootMesh.addLODLevel(30, medPoly.meshes[0] as Mesh);   // switch at 30 units
rootMesh.addLODLevel(80, lowPoly.meshes[0] as Mesh);   // switch at 80 units
rootMesh.addLODLevel(150, null);                         // cull entirely at 150 units
```

## Occlusion Culling

Hardware occlusion queries let the GPU skip rendering meshes hidden behind large occluders:

```typescript
import { AbstractMesh } from '@babylonjs/core';

// Enable on meshes likely to be occluded
mesh.occlusionQueryAlgorithmType = AbstractMesh.OCCLUSION_ALGORITHM_TYPE_ACCURATE;
mesh.occlusionType = AbstractMesh.OCCLUSION_TYPE_OPTIMISTIC;
// OPTIMISTIC: render while waiting for query result (fewer pops)
// STRICT: skip render until query confirms visible (more aggressive)

mesh.occlusionRetryCount = 5; // frames to wait before re-querying
```

**Performance note:** Occlusion queries add GPU overhead per queried mesh. Use them selectively on medium-to-large meshes behind obvious occluders (walls, terrain). Do not enable on every mesh — the query cost exceeds the savings for small objects.

## SceneOptimizer

The `SceneOptimizer` automatically degrades quality at runtime to maintain a target frame rate:

```typescript
import { SceneOptimizer, SceneOptimizerOptions } from '@babylonjs/core';

// Use a preset or build custom options
const options = SceneOptimizerOptions.ModerateDegradation();
options.targetFrameRate = 50;

// Add custom optimizations to the chain
// options.addOptimization(new HardwareScalingOptimization(0, 2));

const optimizer = new SceneOptimizer(scene, options);
optimizer.start();

// Listen for events
optimizer.onSuccessObservable.add(() => {
  console.log('Target FPS reached');
});
optimizer.onFailureObservable.add(() => {
  console.log('Could not reach target FPS after all optimizations');
});
```

### Built-in Optimization Steps (in escalating order)

1. **ShadowsOptimization** — disable shadows
2. **TextureOptimization** — reduce texture sampling quality
3. **HardwareScalingOptimization** — render at lower resolution
4. **ParticlesOptimization** — disable particles
5. **PostProcessesOptimization** — disable post-processing
6. **LensFlaresOptimization** — disable lens flares
7. **MergeMeshesOptimization** — auto-merge compatible meshes
8. **CustomOptimization** — your own logic

## Texture and Asset Optimization

```typescript
// Use compressed textures for GPU-native decompression
import { KhronosTextureContainer2 } from '@babylonjs/core';
KhronosTextureContainer2.URLConfig = {
  jsDecoderModule: '/libs/basis_transcoder.js',
  wasmURI: '/libs/basis_transcoder.wasm',
};

// .basis and .ktx2 textures are transcoded to the GPU's native format
// (BC7 on desktop, ASTC on mobile, ETC2 on Android without ASTC)
const compressedTex = new Texture('/textures/diffuse.ktx2', scene);

// Reduce texture resolution at load time
scene.getEngine().setTextureFormatToUse(['.ktx2', '.basis', '.webp']);
```

## Profiling and Diagnostics

```typescript
// Enable the built-in performance counters
scene.debugLayer.show();

// Programmatic access to frame metrics
engine.onEndFrameObservable.add(() => {
  const perf = scene.getPerformanceCounter();
  console.log('Active meshes:', scene.getActiveMeshes().length);
  console.log('Draw calls:', engine.drawCalls);
  console.log('Active particles:', scene.getActiveParticles());
});

// GPU timer queries (when supported)
engine.enableGPUTimingMeasurements = true;
```

### Key Metrics to Monitor

| Metric | Target (60 FPS) | How to Reduce |
|---|---|---|
| Draw calls | < 200 | Merge, instance, thin instance |
| Active meshes | < 500 | Freeze, LOD, culling |
| Triangles | < 1M (mobile: 300K) | LOD, decimation |
| Texture memory | < 512 MB | KTX2, mip levels, atlas |
| Shader switches | < 50/frame | Shared materials, PBR atlas |

## Mobile-Specific Optimizations

- **Hardware scaling:** `engine.setHardwareScalingLevel(2)` renders at half resolution — large FPS gain on mobile GPUs.
- **Reduce shadow map size:** `shadowGenerator.mapSize = 512` (vs. 2048 on desktop).
- **Avoid real-time reflections:** Use pre-baked environment maps instead of reflection probes.
- **Limit dynamic lights:** Mobile GPUs handle 2-4 dynamic lights well; beyond that, bake lighting.
- **Disable anti-aliasing:** Pass `{ antialias: false }` to the engine constructor.

## WebGPU Considerations

When using the `WebGPUEngine`:

- **Compute shaders** can offload particle simulation, culling, or skinning to the GPU. See the [WebGPU Compute](G5_webgpu_compute.md) guide.
- **Snapshot rendering** (`engine.snapshotRendering = true`) caches the render command bundle. Ideal for mostly-static scenes where only a few objects change per frame.
- **Indirect draw** support enables GPU-driven rendering pipelines where the GPU itself decides what to draw, eliminating CPU-side draw call overhead.
