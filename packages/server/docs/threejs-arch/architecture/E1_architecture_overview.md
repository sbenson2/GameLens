# Three.js Architecture Overview

> **Category:** architecture · **Engine:** Three.js · **Related:** [threejs-rules.md](../threejs-rules.md), [Scene Graph (DeepWiki)](https://deepwiki.com/mrdoob/three.js/2.3-scene-graph-and-object-system)

Three.js is a JavaScript/TypeScript library that abstracts WebGL and WebGPU into a high-level scene graph API. It is the most widely used web 3D library, powering everything from product configurators to full browser-based games. Unlike Babylon.js or PlayCanvas, Three.js is a **rendering library, not a game engine** — it provides the graphics layer and leaves architecture decisions (ECS, game loop, physics, networking) to the developer.

---

## Core Architecture

### Rendering Pipeline

```
Scene + Camera
    │
    ▼
WebGPURenderer / WebGLRenderer
    │
    ├── Frustum Culling (per-object)
    ├── Sorting (opaque front-to-back, transparent back-to-front)
    ├── Material compilation (shaders → GPU programs)
    ├── Draw call batching
    │
    ▼
GPU (WebGPU or WebGL 2 backend)
```

The renderer traverses the scene graph each frame, culls invisible objects, sorts for optimal rendering order, and issues draw calls. The `WebGPURenderer` (r166+) uses a WebGPU backend by default with an automatic WebGL 2 fallback, making it safe to adopt today.

### Key Subsystems

| Subsystem | Core Classes | Purpose |
|-----------|-------------|---------|
| **Scene Graph** | `Scene`, `Group`, `Object3D` | Hierarchical spatial organization |
| **Geometry** | `BufferGeometry`, `BufferAttribute` | Vertex data (positions, normals, UVs) |
| **Materials** | `MeshStandardMaterial`, `MeshStandardNodeMaterial` | Surface appearance and shading |
| **Lighting** | `DirectionalLight`, `PointLight`, `SpotLight`, `AmbientLight` | Scene illumination |
| **Camera** | `PerspectiveCamera`, `OrthographicCamera` | Viewpoint and projection |
| **Loaders** | `GLTFLoader`, `TextureLoader`, `KTX2Loader` | Asset importing |
| **Animation** | `AnimationMixer`, `AnimationClip`, `AnimationAction` | Skeletal and keyframe animation |
| **Audio** | `AudioListener`, `PositionalAudio` | Web Audio API integration |
| **Post-processing** | `PostProcessing` (WebGPU), `EffectComposer` (legacy) | Screen-space effects |

---

## Scene Graph

The scene graph is a tree of `Object3D` instances. Every visible and invisible object in the scene inherits from `Object3D`, which provides:

- **Transform:** `position` (Vector3), `rotation` (Euler), `quaternion` (Quaternion), `scale` (Vector3)
- **Hierarchy:** `parent`, `children`, `add()`, `remove()`
- **Visibility:** `visible`, `frustumCulled`
- **Matrices:** `matrix` (local), `matrixWorld` (accumulated world transform)

```
Object3D (base class)
├── Scene (root of the graph)
├── Group (transform-only container)
├── Mesh (geometry + material)
├── InstancedMesh (GPU-instanced geometry)
├── BatchedMesh (heterogeneous batching, r160+)
├── Line / Points / Sprite
├── Light (DirectionalLight, PointLight, etc.)
├── Camera (PerspectiveCamera, OrthographicCamera)
├── Audio / PositionalAudio
└── Bone / SkinnedMesh (skeletal animation)
```

### Transform Propagation

Transforms flow from parent to child. When `scene.updateMatrixWorld()` is called (automatically each render), each node's world matrix is computed as:

```
child.matrixWorld = parent.matrixWorld × child.matrix
```

This means moving a parent `Group` moves all children. Scale, rotation, and position all compose.

---

## Rendering Backends

### WebGPURenderer (Recommended — r166+)

```typescript
import { WebGPURenderer } from 'three';

const renderer = new WebGPURenderer({ antialias: true });
await renderer.init(); // async — must await before first render
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setAnimationLoop(render); // required — no requestAnimationFrame
```

Key characteristics:
- **Automatic fallback** to WebGL 2 if WebGPU is unavailable.
- **Node-based materials** via TSL (Three Shading Language) — write once, compile to WGSL or GLSL.
- **Compute shaders** support for particle systems, GPU physics, procedural generation.
- **Async pipeline creation** — shaders compile without blocking the main thread.

### WebGLRenderer (Legacy)

Still supported and stable for projects that don't need WebGPU features. Uses GLSL shaders directly.

```typescript
import { WebGLRenderer } from 'three';

const renderer = new WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
// Can use requestAnimationFrame or setAnimationLoop
```

---

## TSL (Three Shading Language)

TSL is a **node-based material system** introduced in r166 that replaces raw GLSL for custom shading. It compiles to both WGSL (WebGPU) and GLSL (WebGL fallback).

```typescript
import { color, positionLocal, sin, time, vec4 } from 'three/tsl';
import { MeshStandardNodeMaterial } from 'three';

const material = new MeshStandardNodeMaterial();

// Animate color based on world position and time
material.colorNode = color(0x00ff00).mul(
  sin(positionLocal.y.add(time)).mul(0.5).add(0.5)
);
```

**Key principle:** Node materials are composable graphs, not string-based shaders. Each node represents an operation, and the graph is compiled into optimal shader code for the active backend.

---

## Game Architecture Patterns

Since Three.js is a rendering library, you choose your own game architecture. Common patterns:

### 1. Component-Based (Recommended for Games)

```typescript
interface GameComponent {
  update(delta: number): void;
  dispose(): void;
}

class GameObject {
  mesh: Object3D;
  components: GameComponent[] = [];

  addComponent(component: GameComponent): void {
    this.components.push(component);
  }

  update(delta: number): void {
    for (const component of this.components) {
      component.update(delta);
    }
  }
}
```

### 2. State Machine (For Game States)

```typescript
type GameState = 'loading' | 'menu' | 'playing' | 'paused' | 'gameOver';

class GameManager {
  private state: GameState = 'loading';

  transition(newState: GameState): void {
    this.exitState(this.state);
    this.state = newState;
    this.enterState(newState);
  }
}
```

### 3. ECS Libraries

For larger games, consider dedicated ECS libraries that integrate with Three.js:
- **bitECS** — high-performance archetypal ECS
- **ecsy** (archived but stable) — Mozilla's ECS for Three.js
- **miniplex** — lightweight, TypeScript-first ECS

---

## Performance Characteristics

| Metric | Mobile Target | Desktop Target |
|--------|--------------|----------------|
| Draw calls | < 100 | < 500 |
| Triangles | < 100K | < 1M |
| Texture memory | < 128 MB | < 512 MB |
| Shadow map size | 1024 | 2048 |
| Target FPS | 30 | 60 |

### Optimization Tools

- `renderer.info` — real-time stats (draw calls, triangles, textures, geometries in memory)
- `Stats.js` — FPS / frame time overlay
- `InstancedMesh` — reduces draw calls for repeated geometry (vegetation, crowds, projectiles)
- `BatchedMesh` (r160+) — batches heterogeneous meshes into one draw call
- `LOD` — automatic level-of-detail switching based on camera distance
- `BufferGeometryUtils.mergeGeometries()` — merge static geometry at load time

---

## Ecosystem

| Need | Library |
|------|---------|
| Physics | Rapier (WASM, recommended), cannon-es (JS), Ammo.js (WASM/Bullet) |
| React integration | React Three Fiber (`@react-three/fiber`) |
| UI overlays | HTML/CSS overlays, or `troika-three-text` for in-scene text |
| Networking | Colyseus, Socket.io, WebRTC (all external) |
| Audio | Built-in `PositionalAudio` wrapping Web Audio API |
| Tweening | `@tweenjs/tween.js`, gsap |
| State management | Zustand (with R3F), or custom |
