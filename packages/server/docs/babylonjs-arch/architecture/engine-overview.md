# Babylon.js Engine Architecture Overview

> **Category:** architecture · **Engine:** Babylon.js · **Related:** [physics-havok](../guides/physics-havok.md), [webgpu-support](../guides/webgpu-support.md)

Babylon.js is a full-featured, open-source 3D game engine for the web. Unlike Three.js (a rendering library), Babylon.js ships with physics integration, a GUI system, audio, animation blending, particle systems, a visual node editor, and an inspector — making it a batteries-included choice for browser-based games.

## Core Architecture

### Engine Hierarchy

The rendering backend follows a layered class hierarchy:

```
AbstractEngine        — Platform-agnostic interface
  └─ ThinEngine       — Minimal WebGL/WebGPU wrapper (textures, shaders, draw calls)
       └─ Engine      — Full engine with render loop, scene management, input
```

The `Engine` is the central hub dispatching all GPU commands. It manages the render loop, canvas resize handling, and browser capability detection. A single `Engine` instance can host multiple `Scene` objects, though most games use one.

```typescript
import { Engine, Scene } from '@babylonjs/core';

const canvas = document.getElementById('renderCanvas') as HTMLCanvasElement;
const engine = new Engine(canvas, true); // true = antialiasing

const scene = new Scene(engine);

engine.runRenderLoop(() => {
    scene.render();
});

window.addEventListener('resize', () => engine.resize());
```

### Scene Graph

The `Scene` is the root container holding all objects, cameras, lights, and systems. The node hierarchy:

```
Node                  — Base class: name, parent/child, enabled state
  └─ TransformNode    — Adds position, rotation, scale, world matrix
       └─ AbstractMesh — Culling, materials, skeleton binding
            └─ Mesh    — Concrete renderable with VertexData + Material
```

Parent-child transforms cascade. Attaching a weapon mesh to a character's hand bone is a parent operation — the weapon inherits the bone's world transform automatically.

### Material System

Babylon.js provides a rich material pipeline:
- **StandardMaterial** — Blinn-Phong model with diffuse, specular, emissive, and ambient maps.
- **PBRMaterial** / **PBRMetallicRoughnessMaterial** — Physically-based rendering following the metallic-roughness workflow. The default choice for modern games.
- **NodeMaterial** — Visual shader editor (Node Material Editor / NME). Compile node graphs to GLSL/WGSL. Accessible at nme.babylonjs.com.
- **ShaderMaterial** — Raw GLSL/WGSL for custom effects.

### Camera System

Babylon.js includes game-ready cameras out of the box:
- `FreeCamera` — WASD + mouse look (FPS-style).
- `ArcRotateCamera` — Orbits around a target (third-person, editors).
- `FollowCamera` — Follows a target mesh with configurable offset and damping.
- `UniversalCamera` — Combines keyboard, mouse, touch, and gamepad input.

All cameras support input customization by attaching/detaching `ICameraInput` components.

## Physics: Havok Integration

Babylon.js 6+ integrates the Havok physics engine via WebAssembly, replacing the older Ammo.js plugin. Havok delivers up to 20× performance improvement over Ammo.js.

```typescript
import { HavokPlugin } from '@babylonjs/core';
import HavokPhysics from '@babylonjs/havok';

const havokInstance = await HavokPhysics();
const havokPlugin = new HavokPlugin(true, havokInstance);
scene.enablePhysics(new Vector3(0, -9.81, 0), havokPlugin);

// Add a physics body to a mesh
const sphere = MeshBuilder.CreateSphere('sphere', { diameter: 1 }, scene);
new PhysicsAggregate(sphere, PhysicsShapeType.SPHERE, {
    mass: 1,
    restitution: 0.7
}, scene);
```

Key physics features: rigid bodies, collision detection, triggers, raycasting, joints/constraints, and character controllers. The physics simulation runs on the main thread via WASM — no web worker by default, though community solutions exist for offloading.

## WebGPU Support

Babylon.js provides transparent rendering backend switching:

```typescript
const engine = new WebGPUEngine(canvas);
await engine.initAsync();
```

The API surface is identical — scenes, meshes, and materials work the same regardless of backend. Babylon.js abstracts the graphics API behind its internal shader compilation and resource management layers. The Node Material Editor outputs shaders compatible with both WebGL and WebGPU.

## Performance Features

- **Performance Modes:** Babylon.js offers Compatibility, Intermediate, and Aggressive scene optimization modes. Aggressive mode can yield up to 50× speedup for scenes with many static meshes by freezing world matrices, materials, and active mesh lists.
- **Thin Instances:** Similar to Three.js `InstancedMesh` but managed per-mesh. Add thousands of instances with `mesh.thinInstanceAdd(matrix)` for a single draw call.
- **Octree:** Built-in octree spatial partitioning for mesh selection and collision queries.
- **Texture Compression:** Supports KTX2 (Basis Universal) and compressed texture formats natively.
- **Mesh Merging:** `Mesh.MergeMeshes()` combines static meshes to reduce draw calls.
- **Asset Containers:** Load assets into an `AssetContainer` for deferred instantiation — useful for level streaming and object pooling.

## Animation System

Babylon.js 7 introduced advanced animation features:
- **Animation Groups:** Named collections of animations that can be played, paused, and blended.
- **Animation Blending:** Smooth transitions between animation states (idle → walk → run).
- **Animation Masking:** Apply animations to specific parts of a skeleton (e.g., upper-body attack while legs run).
- **Skeleton / Bone System:** Full skeletal animation with IK support.

## V7 Highlights: Node Geometry and Flow Graph

- **Node Geometry Editor:** Create procedural geometry using a visual node graph — think Blender geometry nodes but in the browser. Generate terrain, vegetation, architecture procedurally at load time.
- **Flow Graph:** A visual scripting system for game logic, reducing the need for code in simple interactions.
- **Global Illumination:** Screen-space GI and improved IBL (Image-Based Lighting).
- **Gaussian Splat Rendering:** Support for 3D Gaussian splatting for photogrammetry and NeRF-style assets.

## Built-in Game Development Features

Unlike Three.js, Babylon.js ships:
- **GUI:** `@babylonjs/gui` — 2D and 3D UI system (buttons, sliders, text, panels) rendered on texture or full-screen.
- **Audio:** Spatial audio via Web Audio API, integrated with the scene graph.
- **Particles:** GPU particle system with sub-emitters, noise, and custom shaders.
- **Sprite System:** For 2D elements, HUD, or billboard effects.
- **Inspector:** In-browser debugging tool (scene graph explorer, property editors, performance profiler). Toggle with `scene.debugLayer.show()`.
- **Asset Manager:** Parallel loading with progress tracking and error handling.

## Asset Loading

- **Primary format:** glTF 2.0 / GLB via `SceneLoader.ImportMeshAsync()`.
- **Draco compression:** Supported via `DracoCompression` class.
- **Incremental loading:** Assets can stream in progressively.
- All loading is promise-based and integrates with the `AssetsManager` for batch loading with progress callbacks.

```typescript
import { SceneLoader } from '@babylonjs/core';
import '@babylonjs/loaders/glTF';

const result = await SceneLoader.ImportMeshAsync(
    '', '/assets/', 'character.glb', scene
);
const characterRoot = result.meshes[0];
```
