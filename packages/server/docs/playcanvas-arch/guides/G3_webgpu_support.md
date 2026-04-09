# PlayCanvas WebGPU Support — Migration & Best Practices

> **Category:** guide · **Engine:** PlayCanvas v2.0+ · **Related:** [E1_architecture_overview](../architecture/E1_architecture_overview.md), [G1_scripting_system](G1_scripting_system.md)

PlayCanvas is one of the first production 3D game engines to ship WebGPU support alongside its existing WebGL2 backend. Starting with Engine v2.0, WebGL1 was dropped entirely — the engine exclusively targets WebGL2 and WebGPU (beta). This guide covers how to enable WebGPU, what changes for your code, compute shaders, and how to write games that work seamlessly on both backends.

---

## Current State (2026)

- **WebGPU status:** Beta in PlayCanvas. Stable enough for development and testing; some features (e.g., runtime lightmapper) are not yet supported.
- **Browser support:** Chrome 113+ and Edge ship WebGPU by default. Firefox and Safari have shipped or are close to shipping support. Per Web3D Survey, ~62% of end users can run WebGPU.
- **Engine versions:** WebGPU first landed in v1.62; compute shaders arrived in v1.70. The v2.x line is the recommended baseline.
- **Editor support:** The PlayCanvas Editor supports WebGPU — you can preview your project with the WebGPU backend directly in the editor.

---

## Enabling WebGPU

### In the PlayCanvas Editor

1. Open **Project Settings** in the Inspector.
2. Expand the **RENDERING** section.
3. Set **Graphics Devices** to include **WebGPU (beta)**.
4. The engine will attempt WebGPU first and fall back to WebGL2 if unsupported.

### In Engine-Only Projects (No Editor)

```typescript
import * as pc from 'playcanvas';

const canvas = document.getElementById('game-canvas') as HTMLCanvasElement;

const app = new pc.Application(canvas, {
  graphicsDeviceOptions: {
    // Request WebGPU first, fall back to WebGL2
    deviceTypes: [pc.DEVICETYPE_WEBGPU, pc.DEVICETYPE_WEBGL2]
  }
});

// Wait for device initialization (async for WebGPU)
await app.init({
  // standard init options
});

app.start();

// Check which backend was selected
const device = app.graphicsDevice;
console.log(`Rendering with: ${device.isWebGPU ? 'WebGPU' : 'WebGL2'}`);
```

### Device Type Constants

```typescript
pc.DEVICETYPE_WEBGPU   // Request WebGPU backend
pc.DEVICETYPE_WEBGL2   // Request WebGL2 backend
```

The engine tries each device type in order and uses the first one the browser supports.

---

## What Changes with WebGPU

### For Most Game Code: Nothing

PlayCanvas abstracts the graphics backend. If your game uses the standard APIs — materials, meshes, lights, cameras, scripts — it works identically on both WebGL2 and WebGPU without code changes. The scene graph, entity-component system, physics, audio, and input are backend-agnostic.

### Key Differences Under the Hood

| Aspect | WebGL2 | WebGPU |
|--------|--------|--------|
| Shader language | GLSL ES 3.0 | WGSL (engine translates automatically) |
| Pipeline state | Implicit, set per draw call | Explicit render pipelines (engine manages) |
| Resource binding | Texture units, uniform blocks | Bind groups (engine manages) |
| Compute shaders | Not available | Supported via `pc.Compute` |
| Driver overhead | Higher per draw call | Lower — batching is more efficient |
| Initialization | Synchronous | Asynchronous (requires `await`) |

### Shader Authoring

For standard materials (`StandardMaterial`, `LitMaterial`), you don't write shaders at all — the engine handles translation. For custom shaders:

```typescript
// PlayCanvas shader chunks work on both backends.
// The engine transpiles GLSL-like chunks to WGSL when running WebGPU.

const material = new pc.StandardMaterial();

// Custom shader chunks (GLSL syntax — engine handles WebGPU translation)
material.chunks.diffusePS = /* glsl */ `
  uniform float uTime;
  void getAlbedo() {
    float wave = sin(vPositionW.x * 10.0 + uTime) * 0.5 + 0.5;
    dAlbedo = mix(vec3(0.2, 0.4, 0.8), vec3(0.8, 0.9, 1.0), wave);
  }
`;
```

**Important:** Avoid raw WebGL calls (`gl.bindTexture`, `gl.drawElements`, etc.) — these obviously won't work on WebGPU. Use the PlayCanvas API exclusively.

---

## Compute Shaders (WebGPU Only)

Compute shaders run general-purpose code on the GPU. Available since Engine v1.70, they enable particle simulations, GPU physics, terrain generation, and other data-parallel workloads.

```typescript
// Compute shaders require WebGPU — check before using
if (!app.graphicsDevice.isWebGPU) {
  console.warn('Compute shaders require WebGPU');
  return;
}

// Define a compute shader in WGSL
const shaderCode = /* wgsl */ `
  struct Particle {
    pos: vec3f,
    vel: vec3f,
  };

  @group(0) @binding(0) var<storage, read_write> particles: array<Particle>;

  @compute @workgroup_size(64)
  fn main(@builtin(global_invocation_id) id: vec3u) {
    let i = id.x;
    if (i >= arrayLength(&particles)) { return; }

    // Simple gravity simulation
    particles[i].vel.y -= 9.81 * 0.016;  // dt ≈ 16ms
    particles[i].pos += particles[i].vel * 0.016;

    // Floor bounce
    if (particles[i].pos.y < 0.0) {
      particles[i].pos.y = 0.0;
      particles[i].vel.y *= -0.8;
    }
  }
`;

// Create a storage buffer for 10,000 particles
const particleCount = 10000;
const particleBuffer = new pc.StorageBuffer(
  app.graphicsDevice,
  particleCount * 6 * 4  // 6 floats (pos + vel) × 4 bytes
);

// Create and dispatch the compute shader
const compute = new pc.Compute(app.graphicsDevice, shaderCode, 'particleSim');
compute.setParameter('particles', particleBuffer);

// In your update loop:
app.on('update', (dt: number) => {
  compute.dispatch(Math.ceil(particleCount / 64), 1, 1);
});
```

### Compute Shader Use Cases for Games

- **GPU particle systems** — simulate millions of particles without CPU bottleneck.
- **Terrain generation** — generate heightmaps and erosion on the GPU.
- **Skinning / animation** — offload skeletal animation to compute passes.
- **Spatial hashing** — GPU-accelerated collision broadphase.
- **Post-processing** — custom image effects as compute passes.

---

## FrameGraph Architecture

PlayCanvas v2.x uses a FrameGraph internally to manage the rendering pipeline. The FrameGraph describes rendering as a directed acyclic graph of render passes with explicit dependencies and resource lifetimes. While most game developers don't interact with it directly, understanding it helps with:

- **Custom render passes** — insert your own passes (e.g., screen-space reflections, custom shadow techniques).
- **Resource management** — the FrameGraph automatically allocates and releases render targets.
- **Pass ordering** — dependencies are resolved automatically, preventing common ordering bugs.

```typescript
// Example: reading back the depth buffer in a custom pass
// (Advanced — most games won't need this)
const customPass = new pc.RenderPass(app.graphicsDevice, () => {
  // Your custom rendering code
});
customPass.name = 'CustomDepthRead';

// The camera's frame graph manages pass ordering
// Consult PlayCanvas API docs for full FrameGraph integration
```

---

## Performance: WebGPU vs WebGL2

WebGPU reduces driver overhead per draw call, but the magnitude depends on your scene:

### Where WebGPU Helps Most

- **Draw-call-heavy scenes** (>1000 draw calls) — reduced CPU overhead per call.
- **Compute workloads** — particle simulations, GPU skinning, and procedural generation that previously required CPU fallbacks.
- **Complex materials** — pipeline state caching eliminates redundant state changes.

### Where It Doesn't Help (Yet)

- **Simple scenes** (<100 draw calls) — the overhead reduction is negligible.
- **Fill-rate-bound rendering** — WebGPU doesn't change GPU fill rate. If you're shader-bound, the backend doesn't matter.
- **Initialization** — WebGPU app startup is slightly slower due to async device creation.

### Optimization Tips (Both Backends)

```typescript
// 1. Batch static meshes — reduces draw calls dramatically
app.scene.layers.getLayerByName('World')?.opaqueSortMode = pc.SORTMODE_MATERIALMESH;

// 2. Use instancing for repeated objects (trees, grass, props)
const meshInstance = new pc.MeshInstance(mesh, material);
// PlayCanvas handles instancing automatically for identical mesh+material pairs
// when using the Entity system with render components

// 3. LOD — switch mesh detail by distance
entity.addComponent('render', {
  type: 'asset',
  asset: highDetailAsset,
  // LOD is managed via scripts or PlayCanvas LOD group (editor feature)
});

// 4. Frustum culling is on by default — don't disable it

// 5. Texture compression — use Basis Universal / KTX2 via the asset pipeline
// The editor handles this automatically; for engine-only, use:
// pc.basisInitialize() to set up the transcoder

// 6. Monitor performance
console.log('Draw calls:', app.graphicsDevice.renderTarget?.drawCalls);
console.log('Primitives:', app.stats.frame.triangles);
console.log('Shaders compiled:', app.stats.frame.shaders);
```

---

## Writing Cross-Backend Code

The golden rule: **use PlayCanvas APIs, not raw graphics APIs.** If your code doesn't contain `gl.` or `device.gl` calls, it almost certainly works on both backends.

### Feature Detection Pattern

```typescript
// Check for WebGPU-specific features before using them
const device = app.graphicsDevice;

if (device.isWebGPU) {
  // WebGPU path — use compute shaders, storage buffers
  initGPUParticles();
} else {
  // WebGL2 fallback — use CPU particles or transform feedback
  initCPUParticles();
}

// Check for specific capabilities
if (device.supportsCompute) {
  // Safe to use pc.Compute
}
```

### Things to Avoid

| Practice | Why It Breaks |
|----------|---------------|
| Raw `gl.*` calls | No WebGL context exists on WebGPU |
| GLSL shader strings via `device.createShaderFromCode()` | Use shader chunks or the material system instead |
| `requestAnimationFrame` manually | Use `app.on('update')` — the engine manages the loop |
| Synchronous device init | WebGPU requires `await app.init()` |
| Assuming texture format support | Check `device.extTextureFloat`, etc. |

---

## Migration Checklist (WebGL2 → WebGPU-Ready)

1. **Update to PlayCanvas Engine v2.0+** — v1.x doesn't have stable WebGPU.
2. **Remove all raw WebGL calls** — search for `gl.` in your codebase.
3. **Replace custom GLSL shaders** with shader chunks or `StandardMaterial` overrides.
4. **Add `pc.DEVICETYPE_WEBGPU` to your device type list** (keep WebGL2 as fallback).
5. **Make initialization async** — `await app.init()` instead of synchronous setup.
6. **Test on Chrome/Edge** — these have the most mature WebGPU implementations.
7. **Profile both backends** — use browser DevTools GPU profiling to compare.
8. **Gate compute features** — wrap compute shader code in `device.isWebGPU` checks with CPU fallbacks.

---

## Known Limitations (Beta)

As of early 2026, the following features are not yet available on the WebGPU backend:

- **Runtime lightmapper** — bake lightmaps in the editor instead.
- **Some post-processing effects** — verify each effect in your project with WebGPU enabled.
- **WebXR** — WebXR support on WebGPU is browser-dependent; test thoroughly.

Check the [PlayCanvas GitHub releases](https://github.com/playcanvas/engine/releases) for the latest status updates.
