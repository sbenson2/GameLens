# Three.js WebGPU Renderer — Modern Rendering with Automatic Fallback

> **Category:** guide · **Engine:** Three.js r171+ · **Related:** [Architecture Overview](../architecture/E1_architecture_overview.md), [TSL Node Materials](G2_tsl_node_materials.md), [Optimization](G6_optimization_performance.md), [Three.js Rules](../threejs-rules.md)

Since r171 (September 2025) Three.js ships `WebGPURenderer` as the recommended renderer for new projects. It automatically selects the best backend — WebGPU when the browser supports it, WebGL 2 as a fallback — with zero bundler configuration required. This guide covers setup, migration from `WebGLRenderer`, and game-specific considerations.

## Quick Start

```typescript
import * as THREE from "three/webgpu";

const renderer = new THREE.WebGPURenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);

// WebGPU init is async — must await before first render
await renderer.init();

renderer.setAnimationLoop((time: number) => {
  renderer.render(scene, camera);
});
```

**Critical note:** `renderer.init()` is asynchronous. Calling `render()` before `init()` resolves produces a blank canvas. Gate your game loop on this promise.

## Import Path

Use `three/webgpu` to get `WebGPURenderer`, node material classes, and TSL utilities in a single import. This replaces per-module imports from `three/examples/jsm`:

```typescript
// ✅ r171+ unified import
import * as THREE from "three/webgpu";

// ❌ Legacy — do not mix with WebGPURenderer
import { WebGLRenderer } from "three";
```

## Constructor Options

| Option | Type | Default | Game Use-Case |
|--------|------|---------|---------------|
| `antialias` | `boolean` | `false` | Turn on for 3D games; off for pixel-art or post-process AA |
| `samples` | `number` | `0` (4 when `antialias: true`) | Fine-tune MSAA sample count for quality vs. perf |
| `alpha` | `boolean` | `true` | Set `false` for opaque full-screen games (slight perf win) |
| `forceWebGL` | `boolean` | `false` | Force WebGL 2 backend for testing or compatibility |
| `logarithmicDepthBuffer` | `boolean` | `false` | Large open worlds with extreme near/far ratios |
| `reversedDepthBuffer` | `boolean` | `false` | Better depth precision for large scenes (WebGPU only) |
| `multiview` | `boolean` | `false` | Enable for WebXR stereo rendering (if hardware supports it) |
| `outputBufferType` | `number` | `HalfFloatType` | Use `UnsignedByteType` on mobile to halve framebuffer memory |

```typescript
// Production game config
const renderer = new THREE.WebGPURenderer({
  antialias: true,
  alpha: false,            // opaque canvas, skip compositing
  outputBufferType: THREE.HalfFloatType, // HDR pipeline
});
```

## Backend Selection & Detection

`WebGPURenderer` picks its backend automatically. You can check which is active after init:

```typescript
await renderer.init();

// Check which backend is running
if (renderer.backend.isWebGPUBackend) {
  console.log("Running on WebGPU");
} else {
  console.log("Fell back to WebGL 2");
}
```

**Browser support (as of early 2026):** Chrome, Edge, Firefox, and Safari (including iOS 18+) ship WebGPU. The automatic fallback to WebGL 2 covers older browsers and devices without a code change.

## Migrating from WebGLRenderer

### Step 1 — Swap the Renderer

Replace `WebGLRenderer` with `WebGPURenderer` and add the async init:

```typescript
// Before
import { WebGLRenderer } from "three";
const renderer = new WebGLRenderer({ antialias: true });

// After
import * as THREE from "three/webgpu";
const renderer = new THREE.WebGPURenderer({ antialias: true });
await renderer.init();
```

### Step 2 — Replace GLSL ShaderMaterial

Any `ShaderMaterial` or `RawShaderMaterial` with inline GLSL must be converted. Two options:

1. **TSL node materials (recommended):** Write materials using Three.js Shading Language. They compile to both WGSL and GLSL automatically. See the [TSL Node Materials guide](G2_tsl_node_materials.md).

2. **Inline WGSL:** Write raw WGSL shaders if you need maximum control and don't need WebGL fallback.

```typescript
// TSL approach — works on both backends
import { color, uv, sin, time, MeshBasicNodeMaterial } from "three/webgpu";

const mat = new MeshBasicNodeMaterial();
mat.colorNode = sin(time.mul(2.0)).mul(0.5).add(0.5).mul(color(0xff6600));
```

### Step 3 — Fix Render Target Names

`WebGLCubeRenderTarget` does not work with `WebGPURenderer`. Replace with `CubeRenderTarget`:

```typescript
// Before
const cubeRT = new THREE.WebGLCubeRenderTarget(256);

// After
const cubeRT = new THREE.CubeRenderTarget(256);
```

### Step 4 — Adjust Shadow Bias

WebGPURenderer improved shadow mapping. Shadow bias values that were necessary before may now cause peter-panning. Start by removing custom bias or halving it:

```typescript
directionalLight.shadow.bias = 0; // try zero first, then tune
```

## Compute Shaders (WebGPU Only)

WebGPU unlocks compute shaders for GPU-side game logic — particle simulation, spatial hashing, pathfinding, and more. Compute shaders run only on the WebGPU backend; provide a CPU fallback for WebGL browsers.

```typescript
import { compute, storage, instanceIndex, float } from "three/webgpu";

// Storage buffer for particle positions
const positionBuffer = new THREE.StorageBufferAttribute(
  new Float32Array(PARTICLE_COUNT * 4), 4
);

// Define compute kernel
const computeParticles = compute(() => {
  const i = instanceIndex;
  const pos = storage(positionBuffer, "vec4", PARTICLE_COUNT).element(i);
  pos.y.addAssign(float(-9.8).mul(deltaTime)); // gravity
}, PARTICLE_COUNT);

// Dispatch each frame
renderer.compute(computeParticles);
```

## Performance Considerations for Games

### Draw Call Overhead

WebGPU has significantly lower per-draw-call CPU overhead than WebGL. Scenes that bottleneck on draw calls in WebGL often see 2–4× improvement on WebGPU without code changes.

### Instancing

`InstancedMesh` works on both backends. On WebGPU it benefits from better buffer upload paths:

```typescript
const mesh = new THREE.InstancedMesh(geometry, material, 10000);
// Set per-instance transforms as usual
```

### Mobile GPU Limits

Mobile GPUs have tighter memory and bandwidth limits:

- Use `outputBufferType: THREE.UnsignedByteType` to halve framebuffer memory.
- Keep MSAA samples at 4 or below.
- Watch `renderer.info` for draw call and triangle counts.

### Frame Timing

Use `renderer.setAnimationLoop()` rather than `requestAnimationFrame` — it handles WebXR sessions and internal timing automatically.

## Checklist: New Game Project Setup

1. Import from `three/webgpu`.
2. Create `WebGPURenderer` with game-appropriate options.
3. `await renderer.init()` before first render.
4. Use TSL node materials for all custom shaders (cross-backend).
5. Use `InstancedMesh` for repeated geometry (trees, bullets, crowds).
6. Test with `forceWebGL: true` to verify fallback path.
7. Profile with Chrome DevTools → Performance panel and `renderer.info`.
