# G6 — Optimization & Performance

> **Category:** guide · **Engine:** Three.js · **Related:** [Architecture Overview](../architecture/E1_architecture_overview.md), [Camera Systems](G4_camera_systems.md), [Three.js LOD Docs](https://threejs.org/docs/pages/LOD.html), [BatchedMesh Docs](https://threejs.org/docs/pages/BatchedMesh.html)

Three.js scenes can easily exceed GPU budgets on mid-range hardware — especially on mobile. The three biggest levers are **draw call reduction** (instancing, batching), **geometry management** (LOD, culling), and **asset optimization** (texture compression, mesh simplification). This guide covers practical patterns for each.

---

## Measuring First

Before optimizing, instrument your scene. Three.js exposes render info on the renderer:

```typescript
import * as THREE from 'three';

const renderer = new THREE.WebGLRenderer({ antialias: true });

function animate(): void {
  renderer.render(scene, camera);

  const info = renderer.info;
  console.log({
    drawCalls: info.render.calls,
    triangles: info.render.triangles,
    textures: info.memory.textures,
    geometries: info.memory.geometries,
  });
}
```

Target budgets for 60 FPS on mobile: keep draw calls under 100, triangles under 500k, and texture memory under 128 MB. Desktop can handle 300+ draw calls and 2M+ triangles comfortably.

---

## InstancedMesh — Same Geometry, Many Copies

`InstancedMesh` renders many copies of one geometry in a single draw call. Each instance gets its own transform matrix and, optionally, a color. This is ideal for repeated objects: trees, rocks, particles, bullets.

```typescript
import * as THREE from 'three';

const geometry = new THREE.BoxGeometry(1, 1, 1);
const material = new THREE.MeshStandardMaterial({ color: 0x44aa88 });

const count = 1000;
const mesh = new THREE.InstancedMesh(geometry, material, count);

const dummy = new THREE.Object3D();
for (let i = 0; i < count; i++) {
  dummy.position.set(
    Math.random() * 100 - 50,
    0,
    Math.random() * 100 - 50
  );
  dummy.updateMatrix();
  mesh.setMatrixAt(i, dummy.matrix);
}
mesh.instanceMatrix.needsUpdate = true;
scene.add(mesh);
```

### Per-Instance Frustum Culling

By default, Three.js frustum-culls the entire `InstancedMesh` as one bounding box. Individual instances outside the camera view still consume GPU cycles. Two approaches fix this:

1. **Chunk-based splitting** — divide instances into spatial chunks, each with its own `InstancedMesh`. Three.js culls each chunk independently. Simple and effective for static environments.

2. **CPU-side index reordering** — each frame, test instance bounding spheres against the frustum, compact visible instances to the front of the buffer, and set `mesh.count` to the visible count. Costs CPU time but saves GPU work for very large instance counts.

```typescript
// Simplified frustum culling for InstancedMesh
const frustum = new THREE.Frustum();
const projScreenMatrix = new THREE.Matrix4();
const tmpMatrix = new THREE.Matrix4();
const tmpSphere = new THREE.Sphere(new THREE.Vector3(), 1.0);

function cullInstances(
  mesh: THREE.InstancedMesh,
  camera: THREE.Camera
): void {
  projScreenMatrix.multiplyMatrices(
    camera.projectionMatrix,
    camera.matrixWorldInverse
  );
  frustum.setFromProjectionMatrix(projScreenMatrix);

  let visibleCount = 0;
  for (let i = 0; i < mesh.userData.totalCount; i++) {
    mesh.getMatrixAt(i, tmpMatrix);
    tmpSphere.center.setFromMatrixPosition(tmpMatrix);

    if (frustum.intersectsSphere(tmpSphere)) {
      if (i !== visibleCount) {
        // Swap visible instance to front
        mesh.setMatrixAt(visibleCount, tmpMatrix);
      }
      visibleCount++;
    }
  }
  mesh.count = visibleCount;
  mesh.instanceMatrix.needsUpdate = true;
}
```

---

## BatchedMesh — Different Geometries, One Draw Call

`BatchedMesh` (stable since r156) takes instancing further: it can combine **different geometries** that share the same material into a single draw call. Unlike `InstancedMesh`, each "instance" can have a completely different shape.

```typescript
import * as THREE from 'three';

// Pre-allocate with maximum counts
const batchedMesh = new THREE.BatchedMesh(
  50,     // max instance count
  5000,   // max total vertices
  10000,  // max total indices
  new THREE.MeshStandardMaterial({ color: 0xffffff })
);

// Add different geometries
const boxGeoId = batchedMesh.addGeometry(
  new THREE.BoxGeometry(1, 1, 1)
);
const sphereGeoId = batchedMesh.addGeometry(
  new THREE.SphereGeometry(0.5, 16, 16)
);

// Create instances referencing those geometries
const boxInstanceId = batchedMesh.addInstance(boxGeoId);
const sphereInstanceId = batchedMesh.addInstance(sphereGeoId);

// Position them
const matrix = new THREE.Matrix4();
matrix.makeTranslation(0, 0, 0);
batchedMesh.setMatrixAt(boxInstanceId, matrix);

matrix.makeTranslation(3, 0, 0);
batchedMesh.setMatrixAt(sphereInstanceId, matrix);

scene.add(batchedMesh);
```

### BatchedMesh Options

- `perObjectFrustumCulled` (default `true`) — per-instance frustum culling on the CPU. Leave on unless all instances are always visible.
- `sortObjects` (default `true`) — sorts instances front-to-back to reduce overdraw. Costs some CPU each frame.

Use `BatchedMesh` for mixed static props (crates, barrels, furniture) and `InstancedMesh` for large counts of identical objects (grass, foliage). Both work with `WebGLRenderer` and `WebGPURenderer`.

---

## LOD — Level of Detail

The `THREE.LOD` object swaps between mesh detail levels based on camera distance. Closer objects get high-poly meshes; far objects get simplified versions.

```typescript
import * as THREE from 'three';

function createLOD(
  highPoly: THREE.BufferGeometry,   // ~5000 tris
  midPoly: THREE.BufferGeometry,    // ~1000 tris
  lowPoly: THREE.BufferGeometry,    //  ~200 tris
  material: THREE.Material
): THREE.LOD {
  const lod = new THREE.LOD();

  lod.addLevel(new THREE.Mesh(highPoly, material), 0);    // 0–15 units
  lod.addLevel(new THREE.Mesh(midPoly, material), 15);    // 15–50 units
  lod.addLevel(new THREE.Mesh(lowPoly, material), 50);    // 50+ units

  return lod;
}

// In the render loop, LOD updates automatically:
// lod.update(camera) is called internally by the renderer
```

### LOD Tips for Games

- **Generate LOD meshes offline** — tools like `meshoptimizer` or Blender's Decimate modifier produce better results than runtime simplification.
- **Match materials across levels** — use the same material instance on all LOD levels to avoid draw call increases from material switches.
- **Combine with texture LODs** — swap to smaller textures at distance (e.g., 1024x1024 up close, 256x256 far away) using manual texture assignment.
- **LOD + InstancedMesh** — Three.js LOD doesn't natively combine with InstancedMesh. For instanced LOD, use a chunk-based approach: group instances by distance band, each band being its own `InstancedMesh` at the appropriate detail level.

---

## Texture Optimization

Textures are often the biggest memory consumer. Key techniques:

### KTX2 / Basis Universal Compression

GPU-compressed textures (BCn on desktop, ASTC/ETC on mobile) are decoded by the GPU directly, using 4-8x less VRAM than uncompressed RGBA. Three.js supports KTX2 via `KTX2Loader`:

```typescript
import * as THREE from 'three';
import { KTX2Loader } from 'three/addons/loaders/KTX2Loader.js';

const ktx2Loader = new KTX2Loader()
  .setTranscoderPath('/libs/basis/')  // basis_transcoder.js + .wasm
  .detectSupport(renderer);

ktx2Loader.load('/textures/diffuse.ktx2', (texture) => {
  texture.minFilter = THREE.LinearMipMapLinearFilter;
  material.map = texture;
  material.needsUpdate = true;
});
```

### Texture Atlases

Combine multiple small textures into one atlas to reduce material/draw-call count. Adjust UVs to reference sub-regions. This pairs well with `BatchedMesh` — one material, one texture, one draw call for many different objects.

### Mipmap & Anisotropy

Always enable mipmaps (`texture.generateMipmaps = true`, the default) for 3D scenes. Set `texture.anisotropy = renderer.capabilities.getMaxAnisotropy()` for textures viewed at grazing angles (floors, terrain).

---

## Geometry Optimization

### Draco Compression

Draco compresses mesh geometry for smaller file sizes (typically 80-90% reduction). It doesn't reduce in-memory triangle count, but dramatically improves load times:

```typescript
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const dracoLoader = new DRACOLoader()
  .setDecoderPath('/libs/draco/');

const gltfLoader = new GLTFLoader();
gltfLoader.setDRACOLoader(dracoLoader);
```

### Geometry Merging

For static scene geometry that doesn't need individual transforms, merge meshes sharing the same material using `BufferGeometryUtils.mergeGeometries()`:

```typescript
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const geometries: THREE.BufferGeometry[] = staticMeshes.map(
  (mesh) => mesh.geometry.clone().applyMatrix4(mesh.matrixWorld)
);
const merged = mergeGeometries(geometries);
const mergedMesh = new THREE.Mesh(merged, sharedMaterial);
```

This eliminates per-mesh draw calls entirely but prevents individual manipulation.

---

## Renderer Settings

### WebGPURenderer (r171+)

Three.js now ships a `WebGPURenderer` that falls back to WebGL 2 automatically:

```typescript
import { WebGPURenderer } from 'three/webgpu';

const renderer = new WebGPURenderer({ antialias: true });
await renderer.init(); // Required — async WASM/GPU initialization
```

WebGPU enables compute shaders for GPU-side culling, skinning, and particle simulation. It also supports indirect drawing, which makes `BatchedMesh` even faster by skipping CPU-side visibility checks.

### Key Renderer Tuning

- **Pixel ratio** — cap at 2 on mobile: `renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))`
- **Power preference** — `{ powerPreference: 'high-performance' }` to hint at discrete GPU on laptops
- **Shadow maps** — use `PCFSoftShadowMap` and keep shadow map resolution at 1024 or 2048; 4096 is rarely needed
- **Tone mapping** — `renderer.toneMapping = THREE.ACESFilmicToneMapping` for cinematic look without post-processing overhead

---

## Performance Checklist for Games

| Technique | When to Use | Typical Gain |
|-----------|------------|--------------|
| InstancedMesh | 50+ identical objects | 10-30x fewer draw calls |
| BatchedMesh | Mixed static props, same material | 5-15x fewer draw calls |
| LOD | Large open worlds | 30-40% frame time reduction |
| KTX2 textures | Any textured scene | 4-8x less VRAM |
| Draco compression | glTF assets | 80-90% smaller files |
| Geometry merging | Static scenery | Eliminates per-mesh calls |
| Pixel ratio cap | Mobile targets | 2-4x fewer pixels shaded |
| Frustum culling | Complex scenes (automatic) | Free — enabled by default |

---

## Common Pitfalls

- **Forgetting `needsUpdate`** — after changing instance matrices, set `mesh.instanceMatrix.needsUpdate = true`. Without it, changes are silently ignored.
- **Over-allocating BatchedMesh** — pre-allocate only what you need. Each unused vertex/index slot still consumes GPU memory.
- **Too many materials** — each unique material forces a separate draw call. Share materials where possible; use vertex colors or texture atlases for variation.
- **Shadow map overdraw** — every shadow-casting light renders the scene again. Limit shadow-casting lights to 1-2 directional lights in game scenes.
- **Disposing resources** — call `geometry.dispose()`, `material.dispose()`, and `texture.dispose()` when removing objects. Three.js does not garbage-collect GPU resources automatically.
