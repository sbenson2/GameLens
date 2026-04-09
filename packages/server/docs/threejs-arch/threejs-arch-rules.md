# Three.js Architecture Module Rules

> **Module:** threejs-arch · **Engine:** Three.js (r160+) · **Docs:** 1 architecture, 12 guides, 1 reference

## Module Purpose

Provides game development documentation for Three.js — the dominant open-source web 3D rendering library. Covers architecture, rendering pipeline, WebGPU/TSL migration, performance optimization, and integration patterns for physics, audio, and input.

## Document Standards

- All code examples must use TypeScript and modern ES module imports (`import * as THREE from 'three'` or selective imports).
- Use `three/addons/` import paths for add-ons (not the deprecated `three/examples/jsm/`).
- Reference WebGPURenderer and TSL alongside WebGLRenderer — the ecosystem is transitioning.
- Never hallucinate Three.js APIs. If unsure, note the API as "verify against current docs" rather than guessing.
- Include performance notes for any pattern that affects draw calls, memory, or GC pressure.
- Note mobile GPU constraints where relevant (texture budgets, draw call limits, shader complexity).

## Coverage Plan

### architecture/
- [x] `engine-overview.md` — Core architecture, scene graph, rendering pipeline, WebGPU/TSL, performance
- [ ] `rendering-pipeline.md` — Deep dive into render lists, sorting, shader compilation, post-processing
- [ ] `memory-management.md` — Dispose patterns, object pooling, GC mitigation

### guides/
- [ ] `scene-graph.md` — Object3D hierarchy, transforms, matrix management, parenting patterns
- [ ] `webgpu-migration.md` — Migrating from WebGLRenderer + ShaderMaterial to WebGPURenderer + TSL
- [ ] `physics-integration.md` — Integrating Rapier, Cannon.js, or Ammo.js with Three.js
- [ ] `asset-loading.md` — GLTFLoader, DRACOLoader, KTX2Loader, LoadingManager patterns
- [ ] `performance-optimization.md` — InstancedMesh, BatchedMesh, LOD, frustum culling, spatial partitioning
- [ ] `audio-spatial.md` — PositionalAudio, AudioListener, Web Audio API integration
- [ ] `input-handling.md` — Pointer lock, raycasting for interaction, gamepad API

### reference/
- [x] `R1_ui_hud_overlays.md` — UI/HUD patterns: HTML overlay, CSS2DRenderer, orthographic scene, troika-three-text, minimap viewport
- [ ] `material-comparison.md` — All material types with use cases and performance characteristics
- [ ] `camera-types.md` — Perspective, Orthographic, ArrayCamera, CubeCamera
- [ ] `light-types.md` — All light types, shadow map modes, performance impact
