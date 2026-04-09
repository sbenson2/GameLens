# Babylon.js — AI Code Generation Rules

Engine-specific rules for Babylon.js 7.x+ projects using TypeScript. These supplement the engine-agnostic rules in `docs/core/ai-workflow/gamedev-rules.md`.

---

## ⚠️ Babylon.js 6 vs 7 — Critical Differences

Babylon.js 7 introduced Havok as the default physics engine (replacing Cannon.js/Oimo.js), native WGSL shaders for WebGPU, and the Gaussian Splat rendering pipeline. Most older tutorials use Babylon.js 5/6 APIs. **Always target Babylon.js 7+ APIs.**

### Changes That Break Code

| Babylon.js 5/6 (LEGACY) | Babylon.js 7+ (CORRECT) |
|--------------------------|--------------------------|
| `CannonJSPlugin` / `OimoJSPlugin` | `HavokPlugin` (WASM, MIT-licensed) |
| `physicsImpostor` | `PhysicsBody` + `PhysicsShape` (v2 physics API) |
| `mesh.physicsImpostor = new PhysicsImpostor(...)` | `new PhysicsBody(mesh, motionType, scene)` |
| TintWASM for WebGPU shaders | Native WGSL shaders (no translation layer) |
| `BABYLON.Engine` for everything | `BABYLON.WebGPUEngine` for WebGPU, `BABYLON.Engine` for WebGL |

### Import Style (ES Modules)

```typescript
// CORRECT — scoped npm packages
import { Engine, Scene, FreeCamera, Vector3 } from '@babylonjs/core';
import { HavokPlugin } from '@babylonjs/core/Physics/v2/Plugins/havokPlugin';
import '@babylonjs/loaders/glTF'; // side-effect import for glTF support

// WRONG — legacy CDN bundle
// <script src="https://cdn.babylonjs.com/babylon.js"></script>
// Using the global BABYLON namespace is for playgrounds only.
```

---

## Scene Graph Rules

### Node Hierarchy

```
Scene
├── TransformNode (grouping, no rendering cost)
│   ├── Mesh (geometry + material, rendered)
│   │   └── InstancedMesh (GPU instancing)
│   └── TransformNode
│       └── Mesh
├── DirectionalLight
├── HemisphericLight
├── FreeCamera / ArcRotateCamera
└── GUI (AdvancedDynamicTexture — fullscreen overlay)
```

**Class inheritance:**
```
Node → TransformNode → AbstractMesh → Mesh
```

- `Node` — base class, has name and parent/child relationships.
- `TransformNode` — adds position, rotation, scaling. **Use for logical groups** (zero rendering cost).
- `AbstractMesh` — adds bounding info, collision, material slot. Can't be instantiated directly.
- `Mesh` — adds geometry (vertex buffers). This is what you render.

### Object Lifecycle

```typescript
// Dispose properly — Babylon.js manages GPU resources per-scene
mesh.dispose();              // removes from scene, frees GPU buffers
material.dispose();          // frees shader program and textures
texture.dispose();           // frees GPU texture memory

// Dispose entire scene (e.g., level transition)
scene.dispose();             // disposes ALL meshes, materials, textures, shaders

// For instanced meshes
instancedMesh.dispose();     // disposes the instance, not the source mesh
sourceMesh.dispose();        // disposes source + all instances
```

Babylon.js tracks resources per-scene. Calling `scene.dispose()` is the safest way to clean up on level transitions.

---

## Camera Rules

```typescript
// ArcRotateCamera — orbits a target (best for 3rd-person, editor, strategy)
const camera = new ArcRotateCamera(
  'camera',
  Math.PI / 4,     // alpha (horizontal angle)
  Math.PI / 3,     // beta (vertical angle)
  10,              // radius (distance from target)
  Vector3.Zero(),  // target position
  scene
);
camera.attachControl(canvas, true);
camera.lowerRadiusLimit = 2;   // prevent zooming through objects
camera.upperRadiusLimit = 50;

// FreeCamera — first-person, WASD + mouse look
const fpCamera = new FreeCamera('fps', new Vector3(0, 1.8, 0), scene);
fpCamera.attachControl(canvas, true);
fpCamera.speed = 0.5;
fpCamera.minZ = 0.1; // near clip — same rules as Three.js, keep large

// UniversalCamera — FreeCamera + gamepad + touch support
const uniCamera = new UniversalCamera('uni', new Vector3(0, 1.8, 0), scene);
```

---

## Physics (Havok — Default in v7+)

```typescript
import HavokPhysics from '@babylonjs/havok';
import { HavokPlugin } from '@babylonjs/core/Physics/v2/Plugins/havokPlugin';
import { PhysicsBody, PhysicsMotionType, PhysicsShapeBox } from '@babylonjs/core/Physics/v2';

// Initialize — MUST await the WASM module
const havokInstance = await HavokPhysics();
const havokPlugin = new HavokPlugin(true, havokInstance);
scene.enablePhysics(new Vector3(0, -9.81, 0), havokPlugin);

// Create physics body (v2 API)
const body = new PhysicsBody(mesh, PhysicsMotionType.DYNAMIC, false, scene);
const shape = new PhysicsShapeBox(
  Vector3.Zero(),              // center
  Quaternion.Identity(),       // rotation
  new Vector3(1, 1, 1),       // extents
  scene
);
body.shape = shape;
body.setMassProperties({ mass: 1 });
```

**Key rules:**
- Always use the v2 physics API (`PhysicsBody` + `PhysicsShape`). The v1 `PhysicsImpostor` API is deprecated.
- Havok is WASM — the `await HavokPhysics()` call must complete before enabling physics.
- Havok supports character controllers, ragdolls, constraints, and compound shapes natively.

---

## Animation & Game Loop

```typescript
// Babylon.js has a built-in deterministic game loop
scene.registerBeforeRender(() => {
  const delta = engine.getDeltaTime() / 1000; // convert ms → seconds
  player.position.x += speed * delta;
});

// Run the render loop
engine.runRenderLoop(() => {
  scene.render();
});

// Handle resize
window.addEventListener('resize', () => {
  engine.resize();
});
```

- Use `scene.registerBeforeRender()` for game logic — called once per frame before rendering.
- Use `scene.registerAfterRender()` for post-frame operations (analytics, state sync).
- `engine.getDeltaTime()` returns milliseconds. Divide by 1000 for seconds.

---

## Asset Loading

```typescript
import { SceneLoader } from '@babylonjs/core/Loading';
import '@babylonjs/loaders/glTF'; // REQUIRED side-effect import

// Async loading — recommended
const result = await SceneLoader.ImportMeshAsync(
  '',                    // mesh names (empty = all)
  '/models/',            // root URL
  'character.glb',       // filename
  scene
);
const meshes = result.meshes;
const animationGroups = result.animationGroups;

// Assets manager for loading screens
const assetsManager = new AssetsManager(scene);
const meshTask = assetsManager.addMeshTask('hero', '', '/models/', 'hero.glb');
meshTask.onSuccess = (task) => { /* handle loaded mesh */ };
assetsManager.onFinish = (tasks) => { /* all loaded */ };
assetsManager.load();
```

- **glTF/GLB** is the recommended format. Babylon.js has first-class glTF 2.0 support.
- Side-effect import `@babylonjs/loaders/glTF` is required — without it, glTF loading silently fails.
- Use `AssetsManager` for loading screens with progress reporting.
- Supports Draco and meshopt compression via `DracoCompression` and `MeshoptCompression` classes.

---

## GUI System

Babylon.js includes a built-in GUI system (`@babylonjs/gui`) rendered as a texture overlay.

```typescript
import { AdvancedDynamicTexture, Button, TextBlock } from '@babylonjs/gui';

// Fullscreen UI overlay
const ui = AdvancedDynamicTexture.CreateFullscreenUI('ui');

const button = Button.CreateSimpleButton('btn', 'Start Game');
button.width = '200px';
button.height = '50px';
button.color = 'white';
button.background = '#333';
button.onPointerClickObservable.add(() => {
  startGame();
});
ui.addControl(button);
```

- Use `AdvancedDynamicTexture.CreateFullscreenUI()` for HUD/menus.
- Use `AdvancedDynamicTexture.CreateForMesh()` for in-world UI (health bars, nameplates).
- The GUI runs on the Observable pattern — use `.onPointerClickObservable.add()`, not DOM events.

---

## Performance Rules

1. **Instances** — use `mesh.createInstance()` for >10 identical objects. Single draw call per source mesh.
2. **Thin instances** — for >1000 identical objects, use `mesh.thinInstanceAdd()` (matrix-only instancing, even faster).
3. **Octree** — enable `scene.createOrUpdateSelectionOctree()` for scenes with >500 meshes.
4. **Freeze materials** — call `material.freeze()` on materials that won't change at runtime.
5. **Freeze active meshes** — call `scene.freezeActiveMeshes()` if the visible set is static.
6. **Texture compression** — use KTX2 + Basis Universal via `engine.setTextureFormatToUse()`.
7. **LOD** — use `mesh.addLODLevel(distance, lowerDetailMesh)`.
8. **Shadows** — use `ShadowGenerator` with `useBlurExponentialShadowMap = true` for best quality/performance.
9. **Inspector** — press F12 in development, or `scene.debugLayer.show()` for the built-in performance inspector.

---

## Common Mistakes

| Mistake | Fix |
|---------|-----|
| Using `PhysicsImpostor` (v1 API) | Use `PhysicsBody` + `PhysicsShape` (v2 API) with Havok |
| Forgetting `@babylonjs/loaders/glTF` import | Add the side-effect import or glTF loads silently fail |
| Using `BABYLON.*` global namespace | Use ES module imports from `@babylonjs/core` |
| Not awaiting `HavokPhysics()` before enabling physics | Physics will silently fail without the WASM initialization |
| Creating materials per-instance instead of sharing | Reuse materials across meshes — each unique material = extra draw call |
| Not calling `engine.resize()` on window resize | Canvas will render at wrong resolution |
