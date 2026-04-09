# Three.js — AI Code Generation Rules

Engine-specific rules for Three.js r160+ projects using TypeScript. These supplement the engine-agnostic rules in `docs/core/ai-workflow/gamedev-rules.md`.

---

## ⚠️ WebGLRenderer vs WebGPURenderer — Critical Differences

Three.js is transitioning from WebGL to WebGPU. Most online tutorials, AI training data, and StackOverflow answers target the legacy `WebGLRenderer`. Starting with r166+, the `WebGPURenderer` is the recommended path forward and includes an automatic WebGL 2 fallback.

### API Changes That Break Everything

| Legacy (WebGL-only) | Modern (WebGPU-compatible) |
|----------------------|----------------------------|
| `WebGLRenderer` | `WebGPURenderer` (falls back to WebGL 2 automatically) |
| `ShaderMaterial` / `RawShaderMaterial` | Node materials + TSL (`MeshStandardNodeMaterial`, etc.) |
| `onBeforeCompile()` hacks | TSL node-based material composition |
| GLSL shader strings | TSL (Three Shading Language) — compiles to both WGSL and GLSL |
| `EffectComposer` (post-processing) | `PostProcessing` class with TSL passes |
| `renderer.info.render.calls` | `renderer.info.render.drawCalls` |

### Import Style (ES Modules Only)

```typescript
// CORRECT — tree-shakeable named imports
import { Scene, PerspectiveCamera, WebGPURenderer } from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

// WRONG — never import all of THREE
import * as THREE from 'three';
```

---

## Scene Graph Rules

### Hierarchy

```
Scene
├── Group (logical grouping, no geometry)
│   ├── Mesh (geometry + material)
│   ├── InstancedMesh (GPU instancing for repeated objects)
│   └── Group
│       └── Mesh
├── DirectionalLight
├── AmbientLight
└── PerspectiveCamera
```

- Use `Group` for logical containers (no overhead vs empty `Object3D`).
- Use `InstancedMesh` for >50 identical objects (grass, bullets, particles). Single draw call.
- Parent-child transforms are cumulative — `child.position` is relative to parent.
- Call `object.updateMatrixWorld()` only if you read world position after manual changes in the same frame.

### Object Lifecycle

```typescript
// ALWAYS dispose when removing objects
scene.remove(mesh);
mesh.geometry.dispose();
mesh.material.dispose();
if (mesh.material.map) mesh.material.map.dispose();

// For InstancedMesh
instancedMesh.dispose(); // disposes geometry + material
```

**Memory leaks are the #1 Three.js bug.** Every `Geometry`, `Material`, and `Texture` must be explicitly disposed. The garbage collector does NOT free GPU resources.

---

## Camera Rules

```typescript
// Standard game camera setup
const camera = new PerspectiveCamera(
  75,               // FOV — 60-90 for games
  width / height,   // aspect — update on resize!
  0.1,              // near — keep as large as possible
  1000              // far — keep as small as possible
);

// ALWAYS handle resize
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix(); // REQUIRED after changing fov/aspect/near/far
  renderer.setSize(window.innerWidth, window.innerHeight);
});
```

- Near/far ratio affects depth buffer precision. `near: 0.001, far: 100000` causes z-fighting.
- Use `OrthographicCamera` for 2D/isometric games only.

---

## Animation & Game Loop

```typescript
// CORRECT — use the built-in clock for frame-independent movement
const clock = new Clock();

function gameLoop(): void {
  const delta = clock.getDelta(); // seconds since last frame
  
  // Update game logic with delta time
  player.position.x += speed * delta;
  
  // Update animations
  mixer.update(delta);
  
  renderer.render(scene, camera);
}

// WebGPURenderer uses setAnimationLoop
renderer.setAnimationLoop(gameLoop);

// WRONG — don't use requestAnimationFrame directly with WebGPURenderer
// requestAnimationFrame(gameLoop); // breaks WebGPU async pipeline
```

---

## Asset Loading

```typescript
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';

// ALWAYS use Draco compression for production
const dracoLoader = new DRACOLoader();
dracoLoader.setDecoderPath('/draco/'); // host decoder files locally

const gltfLoader = new GLTFLoader();
gltfLoader.setDRACOLoader(dracoLoader);

// Load with proper error handling
const gltf = await gltfLoader.loadAsync('/models/character.glb');
const model = gltf.scene;
scene.add(model);
```

- **glTF/GLB** is the only recommended 3D format. GLB = binary (smaller, single file).
- Use Draco compression — reduces mesh size 80-90%.
- Use KTX2 + Basis Universal for compressed GPU textures (`KTX2Loader`).
- Preload assets during loading screen. Never load during gameplay.

---

## Physics Integration

Three.js has no built-in physics. Common options:

| Library | Type | Best For |
|---------|------|----------|
| Rapier (`@dimforge/rapier3d-compat`) | WASM | Modern games, deterministic physics |
| Cannon-es (`cannon-es`) | JS | Simple games, prototyping |
| Ammo.js | WASM (Bullet) | Complex physics, vehicles |

```typescript
// Rapier example — recommended for new projects
import RAPIER from '@dimforge/rapier3d-compat';

await RAPIER.init();
const world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });

// Sync Three.js mesh to physics body each frame
function syncPhysics(): void {
  const position = rigidBody.translation();
  const rotation = rigidBody.rotation();
  mesh.position.set(position.x, position.y, position.z);
  mesh.quaternion.set(rotation.x, rotation.y, rotation.z, rotation.w);
}
```

---

## Performance Rules

1. **Draw calls** — keep under 100 for mobile, 500 for desktop. Use `InstancedMesh`, `BatchedMesh`, or merge static geometry with `BufferGeometryUtils.mergeGeometries()`.
2. **Textures** — power-of-two dimensions (512, 1024, 2048). Max 2048 for mobile. Use KTX2 compression.
3. **Overdraw** — set `renderer.sortObjects = true` (default). Use `material.alphaTest` instead of `transparent: true` where possible.
4. **LOD** — use `THREE.LOD` for objects visible at multiple distances.
5. **Frustum culling** — enabled by default (`object.frustumCulled = true`). Don't disable it.
6. **Shadows** — expensive. Use `PCFSoftShadowMap`, limit shadow casters, keep shadow map size ≤2048.
7. **Monitor** — check `renderer.info` for triangle count, draw calls, textures in memory.

---

## Common Mistakes

| Mistake | Fix |
|---------|-----|
| Not disposing resources on removal | Always call `.dispose()` on geometry, material, and textures |
| Using `requestAnimationFrame` with WebGPURenderer | Use `renderer.setAnimationLoop()` |
| Forgetting `camera.updateProjectionMatrix()` after param change | Call it after changing fov, aspect, near, or far |
| Loading .obj or .fbx formats | Convert to .glb (glTF binary) — smaller, faster, standard |
| Creating new Vector3/Matrix4 every frame | Reuse objects — allocate once, call `.set()` or `.copy()` |
| Deep scene hierarchies (>10 levels) | Flatten where possible — each level adds matrix multiplication |
