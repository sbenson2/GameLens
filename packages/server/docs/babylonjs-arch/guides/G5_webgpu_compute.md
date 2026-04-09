# Babylon.js WebGPU Renderer & Compute Shaders

> **Category:** guide · **Engine:** Babylon.js v8.0+ / v9.0 · **Related:** [Architecture Overview](../architecture/E1_architecture_overview.md), [Physics with Havok](G1_physics_havok.md), [Babylon.js Rules](../babylonjs-rules.md)

Babylon.js has first-class WebGPU support alongside its WebGL 1/2 backends. Starting with v8.0, all core engine shaders ship in both GLSL and WGSL — eliminating the 3 MB conversion library that was previously required. This guide covers engine initialization, writing WGSL shaders, compute shaders for GPGPU work, the Frame Graph rendering pipeline, and migration strategies.

## Engine Initialization

WebGPU engine creation is **asynchronous** because the browser must request a GPU adapter and device. The recommended pattern uses `EngineFactory` for automatic WebGPU-with-WebGL-fallback:

```typescript
import * as BABYLON from "@babylonjs/core";

// Automatic fallback — preferred approach
const engine = await BABYLON.EngineFactory.CreateAsync(canvas, {
  // Optional: force a specific backend
  // adaptToDeviceRatio: true
});
```

For explicit control:

```typescript
async function createEngine(canvas: HTMLCanvasElement): Promise<BABYLON.AbstractEngine> {
  const webGPUSupported = await BABYLON.WebGPUEngine.IsSupportedAsync;

  if (webGPUSupported) {
    const engine = new BABYLON.WebGPUEngine(canvas, {
      adaptToDeviceRatio: true,
      antialias: true,
    });
    await engine.initAsync();
    return engine;
  }

  // WebGL fallback
  return new BABYLON.Engine(canvas, true);
}
```

**Feature detection:**

```typescript
// Check if running on WebGPU
const isWebGPU = engine.isWebGPU; // boolean

// Check compute shader support
const hasCompute = engine.getCaps().supportComputeShaders; // true only on WebGPU
```

## Writing WGSL Shaders

Babylon.js v8.0+ supports native WGSL shaders via `ShaderMaterial`. Writing WGSL directly (instead of GLSL with automatic conversion) gives faster startup and smaller downloads.

### ShaderMaterial with WGSL

```typescript
const wgslVertexShader = `
  struct VertexInput {
    @location(0) position: vec3<f32>,
    @location(1) uv: vec2<f32>,
  };

  struct VertexOutput {
    @builtin(position) position: vec4<f32>,
    @location(0) vUV: vec2<f32>,
  };

  @vertex
  fn main(input: VertexInput) -> VertexOutput {
    var output: VertexOutput;
    output.position = mesh.worldViewProjection * vec4<f32>(input.position, 1.0);
    output.vUV = input.uv;
    return output;
  }
`;

const wgslFragmentShader = `
  @group(2) @binding(1) var texSampler: sampler;
  @group(2) @binding(2) var tex: texture_2d<f32>;

  @fragment
  fn main(@location(0) vUV: vec2<f32>) -> @location(0) vec4<f32> {
    return textureSample(tex, texSampler, vUV);
  }
`;

// Store shaders in the shader store
BABYLON.ShaderStore.ShadersStoreWGSL["customVertexShader"] = wgslVertexShader;
BABYLON.ShaderStore.ShadersStoreWGSL["customFragmentShader"] = wgslFragmentShader;

const material = new BABYLON.ShaderMaterial("custom", scene, {
  vertex: "custom",
  fragment: "custom",
}, {
  attributes: ["position", "uv"],
  uniformBuffers: ["Scene", "Mesh"],
  shaderLanguage: BABYLON.ShaderLanguage.WGSL,
});
```

### Node Material Editor

The Node Material Editor (NME) in v8.0+ generates both GLSL and WGSL output. Over 110 of 140+ node types support WGSL generation. Use the online editor at [nme.babylonjs.com](https://nme.babylonjs.com) to visually build shaders that work on both backends.

## Compute Shaders

Compute shaders enable GPGPU workloads — particle simulation, pathfinding, terrain generation, fluid dynamics — directly on the GPU. They are **WebGPU-only** (not available on WebGL).

### Basic Compute Shader

```typescript
// WGSL compute shader source
const particleComputeShader = `
  struct Particle {
    position: vec3<f32>,
    velocity: vec3<f32>,
  };

  @group(0) @binding(0) var<storage, read_write> particles: array<Particle>;

  struct Params {
    deltaTime: f32,
    particleCount: u32,
  };

  @group(0) @binding(1) var<uniform> params: Params;

  @compute @workgroup_size(64)
  fn main(@builtin(global_invocation_id) id: vec3<u32>) {
    let index = id.x;
    if (index >= params.particleCount) { return; }

    // Simple gravity simulation
    particles[index].velocity.y -= 9.8 * params.deltaTime;
    particles[index].position += particles[index].velocity * params.deltaTime;

    // Floor bounce
    if (particles[index].position.y < 0.0) {
      particles[index].position.y = 0.0;
      particles[index].velocity.y *= -0.7;
    }
  }
`;

// Create the compute shader
const compute = new BABYLON.ComputeShader("particleSim", engine, {
  computeSource: particleComputeShader,
}, {
  bindingsMapping: {
    particles: { group: 0, binding: 0 },
    params:    { group: 0, binding: 1 },
  },
});
```

### Binding Resources

**Storage buffers** (read/write data on GPU):

```typescript
const PARTICLE_COUNT = 10000;
const PARTICLE_STRIDE = 8; // 3 floats position + 1 pad + 3 floats velocity + 1 pad
const bufferSize = PARTICLE_COUNT * PARTICLE_STRIDE * Float32Array.BYTES_PER_ELEMENT;

const storageBuffer = new BABYLON.StorageBuffer(engine, bufferSize);
compute.setStorageBuffer("particles", storageBuffer);
```

**Uniform buffers** (read-only parameters):

```typescript
const uniformBuffer = new BABYLON.UniformBuffer(engine);
uniformBuffer.addUniform("deltaTime", 1);
uniformBuffer.addUniform("particleCount", 1);
uniformBuffer.updateFloat("deltaTime", 0.016);
uniformBuffer.updateUInt("particleCount", PARTICLE_COUNT);
uniformBuffer.update();
compute.setUniformBuffer("params", uniformBuffer);
```

**Storage textures** (image read/write):

```typescript
const storageTex = BABYLON.RawTexture.CreateRGBAStorageTexture(
  null, 512, 512, scene, false, false,
  BABYLON.Constants.TEXTURETYPE_UNSIGNED_BYTE
);
compute.setStorageTexture("outputImage", storageTex);
```

**Texture + sampler** (read-only image sampling):

```typescript
compute.setTexture("inputImage", someTexture);
const sampler = new BABYLON.TextureSampler()
  .setParameters(
    BABYLON.Constants.TEXTURE_LINEAR_LINEAR,
    BABYLON.Constants.TEXTURE_CLAMP_ADDRESSMODE
  );
compute.setTextureSampler("inputSampler", sampler);
```

### Dispatching and Reading Results

```typescript
// Dispatch in the render loop
scene.onBeforeRenderObservable.add(() => {
  uniformBuffer.updateFloat("deltaTime", engine.getDeltaTime() / 1000);
  uniformBuffer.update();

  // Dispatch with enough workgroups to cover all particles
  const workgroups = Math.ceil(PARTICLE_COUNT / 64);
  compute.dispatch(workgroups, 1, 1);
});

// Read results back to CPU (async — use sparingly)
const gpuData = await storageBuffer.read();
const floatView = new Float32Array(gpuData.buffer);
```

**Performance note:** `storageBuffer.read()` stalls the GPU pipeline. Avoid per-frame readbacks. If you need CPU access, read every N frames or use the data purely on the GPU (e.g., feed the storage buffer into a vertex shader).

## Frame Graph (v9.0)

The Frame Graph system gives fine-grained control over the rendering pipeline — which passes run, in what order, and how GPU memory is allocated and reused. It replaces manual post-process stacking with a declarative graph.

**Key benefits for games:**
- **GPU memory savings** — automatic resource lifetime management and aliasing
- **Pass reordering** — the engine can optimize pass order for GPU occupancy
- **Custom render passes** — insert compute dispatches, custom effects, or conditional passes

The Frame Graph was introduced as alpha in v8.0 and became a v1 feature in v9.0.

## WebGPU Limitations and Gotchas

| Limitation | Impact | Workaround |
|-----------|--------|------------|
| `readPixels` is async | Cannot synchronously sample textures | Use `await` or restructure as async |
| Point size locked to 1.0 | Point Cloud System renders tiny points | Use instanced quads for point sprites |
| No variable texture array indexing | Cannot do `textures[i]` in shaders | Use texture atlases or switch statements |
| Viewport must stay within framebuffer | `x + width ≤ 1.0`, `y + height ≤ 1.0` | Clamp viewport values |
| Half-float textures slower | Some GPU drivers penalize float16 | Prefer full float32 textures |
| No samplers as function arguments | WGSL restriction | Inline sampling or use global bindings |

## Migration Checklist: WebGL → WebGPU

1. **Replace `new Engine(canvas)` with `await EngineFactory.CreateAsync(canvas)`** — this is the only mandatory change for basic scenes.
2. **Audit `readPixels` calls** — wrap them in `await` since they return `Promise` on WebGPU.
3. **Convert custom GLSL shaders to WGSL** — optional but recommended. GLSL auto-converts but adds download overhead.
4. **Test on both backends** — use `engine.isWebGPU` to branch where needed.
5. **Add compute shaders** — move CPU-bound work (particle sims, terrain gen, pathfinding) to GPU compute.
6. **Adopt Frame Graph** (v9.0) — for complex multi-pass rendering pipelines.

## Performance Recommendations

- **Use WGSL directly** to avoid the 3 MB GLSL→WGSL conversion library.
- **Batch compute dispatches** before the render pass to minimize GPU pipeline stalls.
- **Avoid per-frame CPU readbacks** from storage buffers — keep data on the GPU when possible.
- **Use `EngineFactory.CreateAsync`** so your game works on browsers without WebGPU support.
- **Profile with browser GPU tools** — Chrome's `chrome://gpu` and the WebGPU profiler in DevTools help identify bottlenecks.
