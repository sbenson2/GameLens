# Babylon.js Architecture Module Rules

> **Module:** babylonjs-arch · **Engine:** Babylon.js (v7+) · **Docs:** 1 architecture, 12 guides, 1 reference

## Module Purpose

Provides game development documentation for Babylon.js — a full-featured open-source 3D game engine for the web. Covers engine architecture, Havok physics, Node Material Editor, animation system, WebGPU support, performance optimization, and the complete built-in toolset (GUI, audio, particles, inspector).

## Document Standards

- All code examples must use TypeScript with `@babylonjs/core` package imports (not the legacy `babylonjs` UMD bundle).
- Import only what you need: `import { Engine, Scene, MeshBuilder } from '@babylonjs/core'`.
- Loaders require separate imports: `import '@babylonjs/loaders/glTF'`.
- Reference both WebGL and WebGPU paths where behavior differs.
- Havok physics is the recommended physics engine (not Ammo.js) — document Havok patterns by default.
- Never hallucinate Babylon.js APIs. The engine is large; verify method signatures against docs.
- Include Inspector usage tips (`scene.debugLayer.show()`) where relevant for debugging.

## Coverage Plan

### architecture/
- [x] `engine-overview.md` — Core architecture, scene graph, materials, cameras, Havok physics, WebGPU, v7 features
- [ ] `rendering-pipeline.md` — Forward/deferred rendering, shadow systems, post-process pipeline
- [ ] `node-material-system.md` — Node Material Editor (NME), node graph architecture, custom shader nodes

### guides/
- [ ] `physics-havok.md` — Havok plugin setup, rigid bodies, triggers, raycasting, joints, character controller
- [ ] `webgpu-support.md` — WebGPUEngine setup, compatibility, performance comparison, shader considerations
- [ ] `animation-blending.md` — Animation groups, blending, masking, state machine patterns
- [ ] `asset-loading.md` — SceneLoader, AssetsManager, AssetContainer, streaming patterns
- [ ] `performance-optimization.md` — Performance modes, thin instances, octree, mesh merging, freezing
- [ ] `gui-system.md` — @babylonjs/gui for 2D/3D UI, responsive layouts, interactive controls
- [ ] `audio-spatial.md` — Sound class, spatial audio, music management
- [ ] `node-geometry.md` — Procedural geometry with the Node Geometry Editor

### reference/
- [x] `R1_scene_management.md` — Scene lifecycle, multi-scene rendering, game state machines, AssetContainer, loading screens
- [ ] `material-comparison.md` — Standard, PBR, Node, Shader materials with use cases
- [ ] `camera-types.md` — Free, ArcRotate, Follow, Universal cameras and input customization
- [ ] `inspector-guide.md` — Scene explorer, property editors, performance profiler, texture inspector
