# Three.js Engine Architecture Overview

> **Category:** architecture · **Engine:** Three.js · **Related:** [scene-graph](../guides/scene-graph.md), [webgpu-migration](../guides/webgpu-migration.md)

Three.js is the dominant open-source 3D library for the web, providing a high-level abstraction over WebGL and WebGPU. It is not a full game engine but a rendering-focused library that game developers extend with additional systems for physics, input, audio, and game logic.

## Core Architecture

Three.js follows a classic retained-mode rendering model: you build a scene graph of objects, attach materials and geometries, point a camera at the scene, and hand it to a renderer. The renderer traverses the graph each frame, sorts draw calls, and submits them to the GPU.

### Key Subsystems

**Scene Graph (Object3D tree):** Every visible or logical object in Three.js inherits from `Object3D`. The scene itself is an `Object3D` subclass that serves as the root. Parent-child relationships cascade transforms — moving a parent moves all descendants. Each `Object3D` maintains a local `matrix` (composed from `position`, `rotation`, `scale`) and a `matrixWorld` (local × parent's world matrix).

**Geometry (BufferGeometry):** All geometry in modern Three.js uses `BufferGeometry`, which stores vertex data in typed arrays mapped to GPU buffers. Attributes like `position`, `normal`, `uv`, and `index` are set via `BufferAttribute`. Interleaved buffers (`InterleavedBufferAttribute`) can improve cache performance for static meshes.

**Materials:** Three.js ships PBR materials (`MeshStandardMaterial`, `MeshPhysicalMaterial`) plus simpler options (`MeshBasicMaterial`, `MeshLambertMaterial`, `MeshPhongMaterial`). Custom shaders use `ShaderMaterial` (WebGL only) or the newer node-based `MeshStandardNodeMaterial` (WebGPU-compatible via TSL).

**Renderer:** Two renderer backends exist:
- `WebGLRenderer` — Mature, stable, broad browser support. Uses internal render lists, state caching, and UBO management to minimize draw-call overhead.
- `WebGPURenderer` — Newer backend supporting both WebGPU and WebGL fallback. Ships with the node-based material system and TSL (Three.js Shading Language). This is the future direction of Three.js.

**Cameras:** `PerspectiveCamera` and `OrthographicCamera` are the primary options. Both inherit from `Camera`, which itself extends `Object3D`, so cameras participate in the scene graph and can be parented to other objects.

**Lights:** Point, Directional, Spot, Hemisphere, Ambient, and RectArea lights. Shadow-casting lights use internal shadow cameras and render-to-texture passes. Shadow maps support PCF, PCFSoft, VSM, and basic filtering modes.

## Rendering Pipeline

```
Scene Graph Traversal
    → Frustum Culling (per-object bounding sphere)
    → Render List Construction (opaque front-to-back, transparent back-to-front)
    → Material / Shader Program Compilation & Caching
    → Uniform Upload + Texture Binding
    → Draw Calls (instanced where possible)
    → Post-Processing (EffectComposer chain)
```

The renderer caches compiled shader programs keyed by material type + defines. Changing a material property that alters defines (e.g., enabling a map) triggers recompilation — avoid toggling these at runtime.

## WebGPU and TSL

Three.js Shading Language (TSL) is a JavaScript-based shader authoring system for `WebGPURenderer`. TSL code is transpiled to WGSL (for WebGPU) or GLSL (for WebGL fallback) at build time. Key points:

- Node materials replace `ShaderMaterial` in the WebGPU path. For example, `MeshStandardNodeMaterial` is the node equivalent of `MeshStandardMaterial`.
- `onBeforeCompile()` hacks and raw `ShaderMaterial` / `RawShaderMaterial` do **not** work with `WebGPURenderer`. These must be ported to TSL node materials.
- TSL is the only actively developed shader path — new features and fixes target `WebGPURenderer` first.
- `WebGPURenderer` falls back to WebGL automatically if the browser doesn't support WebGPU.

```typescript
import { WebGPURenderer } from 'three/webgpu';
import { MeshStandardNodeMaterial, color, uv, texture } from 'three/tsl';

const renderer = new WebGPURenderer();
await renderer.init(); // async initialization required for WebGPU

const material = new MeshStandardNodeMaterial();
material.colorNode = texture(myTexture, uv()).mul(color(0x88ccff));
```

## Performance Considerations for Games

- **Draw calls:** Each unique material/geometry combination is a draw call. Use `InstancedMesh` for repeated objects (trees, bullets, particles) — one draw call for thousands of instances.
- **BatchedMesh:** For objects sharing a material but with different geometries, `BatchedMesh` (r150+) batches them into fewer draw calls.
- **Frustum culling:** Enabled by default per-object. For large worlds, implement spatial partitioning (octree, BVH) yourself — Three.js doesn't ship one.
- **LOD:** The `LOD` object swaps geometry detail levels based on camera distance. Essential for open-world games.
- **Texture memory:** Compress textures (KTX2 with Basis Universal) via `KTX2Loader`. Mobile GPUs have tight VRAM budgets.
- **Object pooling:** Three.js allocates `Vector3`, `Matrix4`, etc. frequently. Reuse objects in hot paths to reduce GC pressure.
- **Dispose resources:** Call `.dispose()` on geometries, materials, textures, and render targets when done. Three.js does not garbage-collect GPU resources automatically.

## Asset Loading

Three.js uses a loader system with format-specific loaders:
- `GLTFLoader` — Primary format. Supports glTF 2.0 and GLB. Use with `DRACOLoader` for mesh compression and `KTX2Loader` for texture compression.
- `FBXLoader`, `OBJLoader`, `ColladaLoader` — Legacy formats, functional but less optimized.
- `TextureLoader`, `CubeTextureLoader` — For images and cubemaps.

All loaders support `LoadingManager` for progress tracking and error handling.

## What Three.js Does NOT Provide (Game Dev Must-Haves)

Three.js is a rendering library, not an engine. Games typically need:
- **Physics:** Integrate Cannon.js, Rapier (WASM), or Ammo.js (Bullet via Emscripten).
- **Input handling:** Roll your own or use libraries like `pointer-lock-controls`.
- **Audio:** Use the built-in `AudioListener` + `PositionalAudio` (wraps Web Audio API) or a dedicated library like Howler.js.
- **ECS / Game loop:** No built-in entity-component system or fixed-timestep loop. Frameworks like `ecsy`, `bitecs`, or `miniplex` fill this gap. Use `requestAnimationFrame` or a custom loop with delta-time accumulation.
- **UI:** HTML/CSS overlays or canvas-based UI. No built-in GUI system.
- **Networking:** Not included. Use WebSocket, WebRTC, or libraries like Colyseus.

## Version Notes

- **r160+:** Deprecated old build files (`build/three.js`). Renamed `Object3D.DefaultUp` → `Object3D.DEFAULT_UP`, `DefaultMatrixAutoUpdate` → `DEFAULT_MATRIX_AUTO_UPDATE`.
- **r150+:** Introduced `BatchedMesh`. WebGPU renderer matured significantly.
- **Import path:** Use `import * as THREE from 'three'` or selective imports. Addons live under `three/addons/` (previously `three/examples/jsm/`).
