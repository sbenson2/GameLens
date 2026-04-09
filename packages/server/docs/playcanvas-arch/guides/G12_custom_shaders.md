# G12 — Custom Shaders & Shader Chunks

> **Category:** guide · **Engine:** PlayCanvas · **Related:** [Architecture Overview](../architecture/E1_architecture_overview.md), [WebGPU Support](G3_webgpu_support.md), [Lighting & PBR](G8_lighting_pbr_materials.md), [Optimization](G7_optimization_performance.md)

PlayCanvas provides two approaches to custom rendering: **ShaderMaterial** (full custom vertex/fragment shaders) and **shader chunks** (override specific parts of the built-in `StandardMaterial` pipeline). Both support WebGL (GLSL) and WebGPU (WGSL). This guide covers both systems, cross-platform authoring, and common game shader patterns.

---

## Approach 1 — ShaderMaterial (Full Custom Shaders)

`ShaderMaterial` gives you complete control over vertex and fragment processing. Use it for effects that don't fit within the standard PBR pipeline: portals, force fields, dissolve effects, water surfaces, hologram effects.

### Basic Setup

```typescript
import * as pc from 'playcanvas';

const vertGLSL = /* glsl */ `
  attribute vec3 aPosition;
  attribute vec2 aUv0;

  uniform mat4 matrix_model;
  uniform mat4 matrix_viewProjection;
  uniform float uTime;

  varying vec2 vUv;
  varying float vDisplacement;

  void main() {
    vUv = aUv0;

    // Simple vertex displacement for a wave effect
    vec3 pos = aPosition;
    vDisplacement = sin(pos.x * 4.0 + uTime * 2.0) * 0.2;
    pos.y += vDisplacement;

    gl_Position = matrix_viewProjection * matrix_model * vec4(pos, 1.0);
  }
`;

const fragGLSL = /* glsl */ `
  precision mediump float;

  uniform float uTime;
  uniform vec3 uColor;

  varying vec2 vUv;
  varying float vDisplacement;

  void main() {
    // Color based on displacement intensity
    float intensity = abs(vDisplacement) * 2.0;
    vec3 color = mix(uColor, vec3(1.0), intensity);
    gl_FragColor = vec4(color, 1.0);
  }
`;

// Create the ShaderMaterial
const material = new pc.ShaderMaterial({
  uniqueName: 'WaveEffect',
  vertexGLSL: vertGLSL,
  fragmentGLSL: fragGLSL,
});

// Set uniforms
material.setParameter('uTime', 0);
material.setParameter('uColor', [0.2, 0.5, 1.0]);
```

### Adding WGSL for WebGPU

For optimal performance on WebGPU, provide WGSL shaders alongside GLSL. If you only supply GLSL, PlayCanvas will transpile it to WGSL via a WASM-based transpiler — this works but adds shader compilation overhead.

```typescript
const vertWGSL = /* wgsl */ `
  struct VertexInput {
    @location(0) position: vec3f,
    @location(1) uv0: vec2f,
  }

  struct VertexOutput {
    @builtin(position) position: vec4f,
    @location(0) vUv: vec2f,
    @location(1) vDisplacement: f32,
  }

  @group(0) @binding(0) var<uniform> matrix_model: mat4x4f;
  @group(0) @binding(1) var<uniform> matrix_viewProjection: mat4x4f;
  @group(0) @binding(2) var<uniform> uTime: f32;

  @vertex
  fn vertexMain(input: VertexInput) -> VertexOutput {
    var output: VertexOutput;
    output.vUv = input.uv0;

    var pos = input.position;
    output.vDisplacement = sin(pos.x * 4.0 + uTime * 2.0) * 0.2;
    pos.y += output.vDisplacement;

    output.position = matrix_viewProjection * matrix_model * vec4f(pos, 1.0);
    return output;
  }
`;

const fragWGSL = /* wgsl */ `
  struct FragmentInput {
    @location(0) vUv: vec2f,
    @location(1) vDisplacement: f32,
  }

  @group(0) @binding(2) var<uniform> uTime: f32;
  @group(0) @binding(3) var<uniform> uColor: vec3f;

  @fragment
  fn fragmentMain(input: FragmentInput) -> @location(0) vec4f {
    let intensity = abs(input.vDisplacement) * 2.0;
    let color = mix(uColor, vec3f(1.0), intensity);
    return vec4f(color, 1.0);
  }
`;

// Provide both languages
const material = new pc.ShaderMaterial({
  uniqueName: 'WaveEffect',
  vertexGLSL: vertGLSL,
  fragmentGLSL: fragGLSL,
  vertexWGSL: vertWGSL,
  fragmentWGSL: fragWGSL,
});
```

### Textures in ShaderMaterial

```typescript
// Bind a texture
const texture = new pc.Texture(app.graphicsDevice, {
  width: 512, height: 512, format: pc.PIXELFORMAT_RGBA8,
});
// ... load or generate texture data ...

material.setParameter('uDiffuseMap', texture);

// In GLSL fragment shader:
// uniform sampler2D uDiffuseMap;
// vec4 texColor = texture2D(uDiffuseMap, vUv);

// In WGSL fragment shader:
// @group(0) @binding(4) var uDiffuseMap: texture_2d<f32>;
// @group(0) @binding(5) var uDiffuseMapSampler: sampler;
// let texColor = textureSample(uDiffuseMap, uDiffuseMapSampler, input.vUv);
```

---

## Approach 2 — Shader Chunks (Override Parts of StandardMaterial)

Shader chunks let you customize specific stages of the built-in PBR pipeline without rewriting everything. The engine assembles its internal shaders from small "chunk" functions — you can replace any of them.

### How Chunks Work

Each chunk is a named GLSL/WGSL function that computes one part of the material. For example, `emissivePS` computes the emissive color in the fragment shader. By overriding it, you inject custom logic into the standard pipeline while keeping lighting, shadows, fog, etc.

### Basic Chunk Override

```typescript
import * as pc from 'playcanvas';

const material = new pc.StandardMaterial();
material.diffuse = new pc.Color(0.8, 0.8, 0.8);

// Override the emissive chunk — pulse with time
material.getShaderChunks(pc.SHADERLANGUAGE_GLSL).set('emissivePS', `
  uniform float uTime;

  void getEmission() {
    float pulse = sin(uTime * 3.0) * 0.5 + 0.5;
    dEmission = vec3(pulse, 0.0, pulse * 0.5);
  }
`);

// Provide WGSL version for WebGPU (recommended for performance)
material.getShaderChunks(pc.SHADERLANGUAGE_WGSL).set('emissivePS', `
  @group(2) @binding(10) var<uniform> uTime: f32;

  fn getEmission() {
    let pulse = sin(uTime * 3.0) * 0.5 + 0.5;
    dEmission = vec3f(pulse, 0.0, pulse * 0.5);
  }
`);

// Set the uniform value each frame
material.setParameter('uTime', 0);
material.update();
```

### Common Chunks to Override

| Chunk name | Stage | What it computes |
|-----------|-------|-----------------|
| `diffusePS` | Fragment | Base diffuse color |
| `emissivePS` | Fragment | Emissive/glow color |
| `opacityPS` | Fragment | Alpha/transparency |
| `normalDetailMapPS` | Fragment | Detail normal mapping |
| `transformVS` | Vertex | Vertex position transform |
| `normalVS` | Vertex | Vertex normal transform |
| `uvVS` | Vertex | UV coordinate generation |

### Dissolve Effect (Practical Example)

A dissolve shader is a classic game effect — objects fade out by discarding pixels based on a noise texture:

```typescript
const dissolveMaterial = new pc.StandardMaterial();
dissolveMaterial.diffuseMap = baseColorTexture;

// Custom opacity chunk for dissolve
dissolveMaterial.getShaderChunks(pc.SHADERLANGUAGE_GLSL).set('opacityPS', `
  uniform sampler2D uNoiseMap;
  uniform float uDissolveThreshold;
  uniform vec3 uEdgeColor;
  uniform float uEdgeWidth;

  void getOpacity() {
    float noise = texture2D(uNoiseMap, vUv0).r;

    // Discard pixels below threshold
    if (noise < uDissolveThreshold) {
      discard;
    }

    // Bright edge at the dissolve boundary
    float edgeFactor = smoothstep(uDissolveThreshold,
                                   uDissolveThreshold + uEdgeWidth,
                                   noise);
    if (edgeFactor < 1.0) {
      // Add glow to dEmission for the burning edge
      dEmission += uEdgeColor * (1.0 - edgeFactor) * 3.0;
    }

    dAlpha = 1.0;
  }
`);

dissolveMaterial.setParameter('uNoiseMap', noiseTexture);
dissolveMaterial.setParameter('uDissolveThreshold', 0.0);
dissolveMaterial.setParameter('uEdgeColor', [1.0, 0.4, 0.0]);
dissolveMaterial.setParameter('uEdgeWidth', 0.05);
dissolveMaterial.update();

// Animate the dissolve in your update loop:
// dissolveMaterial.setParameter('uDissolveThreshold', progress);
```

---

## GLSL vs WGSL — Key Differences

When writing shaders for both backends, keep these differences in mind:

| Feature | GLSL (WebGL2) | WGSL (WebGPU) |
|---------|---------------|---------------|
| Types | `vec3`, `float`, `mat4` | `vec3f`, `f32`, `mat4x4f` |
| Entry points | `void main()` | `@vertex fn vertexMain()` |
| Input/output | Globals (`gl_Position`, `varying`) | Structs with `@location` decorators |
| Textures | `uniform sampler2D tex` | Separate `texture_2d<f32>` + `sampler` |
| Texture sampling | `texture2D(tex, uv)` | `textureSample(tex, samp, uv)` |
| Uniforms | `uniform float x` | `var<uniform> x: f32` with binding |

**Recommendation:** Author GLSL first for wider compatibility, then add WGSL for WebGPU. If you only provide GLSL, the engine transpiles it automatically, but native WGSL compiles faster and avoids the transpiler overhead.

---

## Shader Chunk Migrations

PlayCanvas occasionally updates its internal shader chunk signatures between engine versions. When upgrading, check the [Shader Chunk Migrations](https://developer.playcanvas.com/user-manual/graphics/shaders/migrations/) page for breaking changes. Key practices:

- Pin your engine version in production builds.
- If a chunk's function signature changes, your override will silently fail or produce errors.
- Test custom shaders after every engine update.

---

## Performance Considerations

- **Minimize shader variants:** every unique combination of chunk overrides creates a new compiled shader. Avoid per-object chunk overrides; share materials.
- **Provide both GLSL and WGSL:** the WASM transpiler (GLSL→WGSL) adds ~50ms per unique shader on first compile. Native WGSL avoids this.
- **Uniform updates:** `setParameter()` is cheap but triggers a GPU upload. Batch uniform updates before `material.update()`.
- **Texture lookups:** each `texture2D` / `textureSample` call costs GPU bandwidth. Minimize dependent texture reads in fragments.
- **Branching:** GPUs handle uniform branching well but per-pixel branching (like dissolve discard) can hurt performance on mobile. Use `smoothstep` over hard `if/discard` where possible.

---

## Further Reading

- [PlayCanvas Custom Shaders Tutorial](https://developer.playcanvas.com/tutorials/custom-shaders/)
- [PlayCanvas Shaders User Manual](https://developer.playcanvas.com/user-manual/graphics/shaders/)
- [ShaderMaterial API Reference (v2.17)](https://api.playcanvas.com/engine/classes/ShaderMaterial.html)
- [Shader Chunk Migrations Guide](https://developer.playcanvas.com/user-manual/graphics/shaders/migrations/)
- [PlayCanvas WGSL Shader Programming — Shader Chunks](https://oboe.com/learn/playcanvas-wgsl-shader-programming-u7lgmp/shader-chunks-5)
