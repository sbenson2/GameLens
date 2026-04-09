# Babylon.js Architecture Overview

> **Category:** architecture · **Engine:** Babylon.js · **Related:** [babylonjs-rules.md](../babylonjs-rules.md), [Official Docs](https://doc.babylonjs.com)

Babylon.js is a **full-featured 3D game engine** for the web, built with TypeScript. Unlike Three.js (a rendering library), Babylon.js ships with physics (Havok), GUI, animation, audio, particles, navigation (Recast), a visual inspector, and an optional cloud editor. It targets WebGL 1/2 and WebGPU with a unified API.

---

## Core Architecture

### Engine Hierarchy

```
AbstractEngine
└── ThinEngine (minimal WebGL abstraction)
    └── Engine (full WebGL 1/2 engine)
        └── WebGPUEngine (WebGPU backend)
```

- `ThinEngine` — low-level GPU resource management (textures, buffers, shaders).
- `Engine` — adds scene rendering, camera management, input, audio context.
- `WebGPUEngine` — extends Engine with WebGPU-specific pipeline (WGSL shaders, compute, render bundles).

```typescript
// WebGL (default — broadest compatibility)
const engine = new Engine(canvas, true /* antialias */);

// WebGPU (must await — async initialization)
const engine = new WebGPUEngine(canvas);
await engine.initAsync();
```

### Scene

The `Scene` is the central container. Everything — meshes, lights, cameras, physics, particles, GUI — lives inside a Scene. A single Engine can run multiple Scenes (useful for level transitions or overlay scenes).

```typescript
const scene = new Scene(engine);

// Physics
const havok = await HavokPhysics();
scene.enablePhysics(new Vector3(0, -9.81, 0), new HavokPlugin(true, havok));

// Fog
scene.fogMode = Scene.FOGMODE_EXP2;
scene.fogDensity = 0.01;
scene.fogColor = new Color3(0.8, 0.8, 0.8);
```

---

## Node Hierarchy (Scene Graph)

```
Node (base — name, parent, children, enabled)
└── TransformNode (position, rotation, scaling)
    └── AbstractMesh (bounding, picking, collisions, material)
        └── Mesh (geometry — vertex buffers, index buffers)
            ├── GroundMesh
            ├── LinesMesh
            └── InstancedMesh
```

### TransformNode vs Mesh

| Class | Renderable | Use Case |
|-------|-----------|----------|
| `TransformNode` | No | Grouping, pivot points, attachment points, skeleton roots |
| `Mesh` | Yes | Anything visible — characters, terrain, props |
| `InstancedMesh` | Yes (shared geometry) | Many identical objects with per-instance transforms |

```typescript
// Group enemies under a TransformNode
const enemyGroup = new TransformNode('enemies', scene);

const enemy1 = MeshBuilder.CreateBox('enemy1', { size: 1 }, scene);
enemy1.parent = enemyGroup;

const enemy2 = MeshBuilder.CreateBox('enemy2', { size: 1 }, scene);
enemy2.parent = enemyGroup;

// Move all enemies at once
enemyGroup.position.x += 5;
```

---

## Rendering Pipeline

### Default Pipeline

```
Scene.render()
├── Evaluate active cameras
├── Evaluate active meshes (frustum culling)
├── Sort (opaque → alpha test → transparent)
├── Shadow map passes
├── Main render pass
│   ├── Pre-pass (SSAO, SSR data)
│   ├── Opaque pass
│   ├── Alpha test pass
│   └── Transparent pass (back-to-front)
└── Post-process chain
```

### Post-Processing

```typescript
import { DefaultRenderingPipeline } from '@babylonjs/core/PostProcesses/RenderPipeline';

const pipeline = new DefaultRenderingPipeline('pipeline', true, scene, [camera]);
pipeline.bloomEnabled = true;
pipeline.bloomThreshold = 0.8;
pipeline.fxaaEnabled = true;
pipeline.sharpenEnabled = true;
```

The `DefaultRenderingPipeline` bundles common post-effects (bloom, FXAA, chromatic aberration, grain, vignette, sharpen, depth of field, tone mapping). For custom effects, use individual `PostProcess` instances.

---

## WebGPU Support

Babylon.js has production-grade WebGPU support with these advantages over WebGL:

- **Native WGSL shaders** — no translation layer needed (TintWASM removed in v7).
- **Compute shaders** — particle systems, GPU-driven culling, procedural generation.
- **Render bundles** — pre-recorded draw calls for static geometry, reducing CPU overhead.
- **Snapshot rendering** — freeze and replay render commands for scenes that rarely change.

```typescript
// WebGPU compute shader example
const computeShader = new ComputeShader(
  'particleCompute',
  engine,
  { computeSource: wgslComputeCode },
  {
    bindingsMapping: {
      particles: { group: 0, binding: 0 },
      params: { group: 0, binding: 1 }
    }
  }
);
computeShader.setStorageBuffer('particles', particleBuffer);
computeShader.dispatch(Math.ceil(particleCount / 64), 1, 1);
```

### Fallback Strategy

Use feature detection to choose the best available backend:

```typescript
let engine: Engine;
if (navigator.gpu) {
  engine = new WebGPUEngine(canvas);
  await engine.initAsync();
} else {
  engine = new Engine(canvas, true);
}
```

---

## Built-in Systems (vs Three.js)

| Feature | Babylon.js | Three.js |
|---------|-----------|----------|
| Physics | Built-in (Havok WASM) | External (Rapier, cannon-es) |
| GUI | Built-in (`@babylonjs/gui`) | External (HTML overlay or troika-text) |
| Navigation/Pathfinding | Built-in (Recast/Detour) | External |
| Particle System | Built-in (GPU particles) | External or custom |
| Animation | Built-in (skeletal + keyframe) | Built-in (AnimationMixer) |
| Audio | Built-in (positional) | Built-in (PositionalAudio) |
| Inspector/Debugger | Built-in (F12 or `scene.debugLayer.show()`) | External (Stats.js, lil-gui) |
| Node Material Editor | Built-in visual shader editor (NME) | No equivalent |
| Sprites | Built-in (SpriteManager) | SpriteMaterial only |

---

## Observable Pattern

Babylon.js uses **Observables** (not DOM events) for communication:

```typescript
// Scene lifecycle
scene.onBeforeRenderObservable.add(() => { /* pre-frame logic */ });
scene.onAfterRenderObservable.add(() => { /* post-frame logic */ });

// Mesh events
mesh.onCollideObservable.add((otherMesh) => { /* collision */ });
mesh.actionManager = new ActionManager(scene);
mesh.actionManager.registerAction(
  new ExecuteCodeAction(ActionManager.OnPickTrigger, () => { /* clicked */ })
);

// Custom observables
const onGameEvent = new Observable<GameEvent>();
onGameEvent.add((event) => { /* handle event */ });
onGameEvent.notifyObservers({ type: 'score', value: 100 });
```

---

## Performance Characteristics

| Metric | Mobile Target | Desktop Target |
|--------|--------------|----------------|
| Draw calls | < 100 | < 500 |
| Active meshes | < 200 | < 2000 |
| Triangles | < 100K | < 2M |
| Texture memory | < 128 MB | < 512 MB |
| Target FPS | 30 | 60 |

### Optimization Tools

- **Inspector** — built-in performance profiler, scene explorer, material editor.
- **SceneOptimizer** — automatic degradation (reduce texture size, disable particles, lower shadow quality).
- **Octree** — spatial indexing for large scenes with many meshes.
- **Thin instances** — matrix-only instancing for >1000 identical objects.
- **Freeze** — `material.freeze()`, `scene.freezeActiveMeshes()` for static content.
- **Snapshot rendering** (WebGPU) — pre-record and replay render commands.

```typescript
// Automatic quality scaling
import { SceneOptimizer, SceneOptimizerOptions } from '@babylonjs/core';

const options = SceneOptimizerOptions.ModerateDegradationAllowed();
const optimizer = new SceneOptimizer(scene, options);
optimizer.start();
// Automatically reduces quality to maintain target FPS
```

---

## Ecosystem

| Need | Solution |
|------|----------|
| Visual editor | Babylon.js Editor (desktop app) or Playground (web) |
| Node materials | Node Material Editor (NME) — visual shader graph |
| React integration | `@babylonjs/react` or babylonjs-hook |
| Physics | Havok (built-in, default), or Cannon/Oimo (legacy) |
| Networking | Colyseus, Socket.io, WebRTC (all external) |
| Terrain | Built-in `GroundMesh` with heightmap, or custom |
| XR/VR | Built-in WebXR support (`WebXRDefaultExperience`) |
