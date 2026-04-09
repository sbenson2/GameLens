# PlayCanvas Architecture Module Rules

> **Module:** playcanvas-arch · **Engine:** PlayCanvas (v2+) · **Docs:** 1 architecture, 12 guides, 1 reference

## Module Purpose

Provides game development documentation for PlayCanvas — an open-source ECS-based 3D game engine for the web with an optional cloud editor. Covers entity-component architecture, script system, Ammo.js physics, clustered lighting, WebGPU support, shader chunks, and the multiple development workflows (editor, npm, React, Web Components).

## Document Standards

- All code examples must use TypeScript with `playcanvas` npm package imports.
- Use the v2 API (`import { Application, Entity, Script } from 'playcanvas'`), not the legacy `pc` global namespace.
- Reference both the engine-only workflow and the editor workflow where patterns differ.
- Note WebGPU vs WebGL2 differences when they affect shader authoring or feature availability.
- Never hallucinate PlayCanvas APIs. The engine evolves quickly; verify against api.playcanvas.com.
- Include mini-stats profiler tips where relevant for performance debugging.
- Note mobile constraints: PlayCanvas targets mobile web heavily, so perf budgets matter.

## Coverage Plan

### architecture/
- [x] `engine-overview.md` — ECS architecture, components, script system, rendering, physics, WebGPU, dev workflows
- [ ] `rendering-pipeline.md` — Clustered lighting, layers, shadow atlas, forward+ pipeline details
- [ ] `script-lifecycle.md` — Script class lifecycle, hot-reload, attribute system, inter-script communication

### guides/
- [ ] `entity-components.md` — Deep dive into all built-in components with game dev patterns
- [ ] `webgpu-support.md` — WebGPU setup, compute shaders, WGSL authoring, fallback strategy
- [ ] `physics-ammo.md` — Rigidbody/collision setup, triggers, raycasting, character controller patterns
- [ ] `asset-loading.md` — Asset registry, containers, bundles, streaming, preloading strategies
- [ ] `performance-optimization.md` — Batching, instancing, texture compression, draw call budgets, mobile targets
- [ ] `ui-system.md` — Element components, screen setup, layout groups, responsive UI
- [ ] `audio-spatial.md` — Sound component, 3D audio, slot management, music system patterns
- [ ] `shader-chunks.md` — Customizing the built-in shader pipeline via chunk overrides

### reference/
- [x] `R1_particle_vfx_systems.md` — Particle system component, curves, runtime scripting, VFX recipes, performance budgets
- [ ] `component-reference.md` — All built-in components with properties and events
- [ ] `script-attributes.md` — Attribute types, editor integration, runtime modification
- [ ] `editor-vs-code.md` — When to use the cloud editor vs engine-only npm workflow
