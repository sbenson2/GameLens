# G18 — SDL_shadercross & Compute Shader Pipeline

> **Category:** guide · **Engine:** FNA · **Related:** [G03 SDL3 GPU API](./G03_sdl3_gpu_api.md) · [G07 Shader Compilation (FXC)](./G07_shader_compilation_fxc.md) · [G09 FNA3D → SDL GPU Migration](./G09_fna3d_sdl_gpu_migration.md) · [G12 SDL GPU Deployment Lessons](./G12_sdl_gpu_deployment_lessons.md)

How to use SDL_shadercross to compile and translate shaders for FNA games targeting the SDL GPU API. Covers the shader compilation pipeline from HLSL or SPIR-V to all supported backends (Vulkan, D3D12, Metal), compute shader authoring, offline vs. runtime compilation workflows, and resource reflection for automatic binding.

## Background: Why SDL_shadercross Exists

The SDL GPU API (introduced in SDL3) supports three graphics backends — Vulkan, Direct3D 12, and Metal. Each backend accepts a different shader format:

| Backend | Native Format |
|---------|---------------|
| Vulkan | SPIR-V bytecode |
| Direct3D 12 | DXIL (via DirectXShaderCompiler) |
| Metal | MSL (Metal Shading Language) |

Writing shaders three times is impractical. SDL_shadercross solves this by translating shaders between formats, built on two established tools:

- **DirectXShaderCompiler (DXC):** Compiles HLSL → SPIR-V or DXIL
- **SPIRV-Cross:** Transpiles SPIR-V → MSL, HLSL, or GLSL

Together they form translation pathways from two source formats (HLSL and SPIR-V) to every backend the GPU API supports.

## Compilation Pipelines

### HLSL as Source (Recommended for FNA)

HLSL is the natural choice for FNA developers already familiar with XNA/MonoGame effect files:

```
HLSL Source
   │
   ├──→ DXC ──→ SPIR-V  ──→ Vulkan backend
   │              │
   │              └──→ SPIRV-Cross ──→ MSL ──→ Metal backend
   │
   └──→ DXC ──→ DXIL ──→ D3D12 backend
```

### SPIR-V as Source (For Existing Vulkan Shaders)

```
SPIR-V Bytecode
   │
   ├──→ Vulkan backend (direct)
   ├──→ SPIRV-Cross ──→ MSL ──→ Metal backend
   └──→ SPIRV-Cross ──→ HLSL ──→ DXC ──→ DXIL ──→ D3D12 backend
```

## Offline Compilation (Recommended for Shipping)

Compile shaders at build time to avoid shipping the compiler toolchain and to catch errors early.

### CLI Usage

```bash
# Compile a vertex shader from HLSL to SPIR-V
shadercross myshader.vert.hlsl \
    -s HLSL \
    -d SPIRV \
    -t vertex \
    -e main \
    -o myshader.vert.spv

# Compile a fragment shader
shadercross myshader.frag.hlsl \
    -s HLSL \
    -d SPIRV \
    -t fragment \
    -e main \
    -o myshader.frag.spv

# Compile a compute shader
shadercross myshader.comp.hlsl \
    -s HLSL \
    -d SPIRV \
    -t compute \
    -e main \
    -o myshader.comp.spv
```

### CLI Options Reference

| Flag | Purpose | Values |
|------|---------|--------|
| `-s` | Source format | `HLSL`, `SPIRV` |
| `-d` | Destination format | `SPIRV`, `DXIL`, `DXBC`, `MSL`, `HLSL`, `JSON` |
| `-t` | Shader stage | `vertex`, `fragment`, `compute` |
| `-e` | Entry point function | Usually `main` |
| `-o` | Output file path | — |

### Build Integration

Add shader compilation to your build process so shaders are always up to date:

```xml
<!-- In your .csproj -->
<Target Name="CompileShaders" BeforeTargets="Build">
  <Exec Command="shadercross shaders/particle.comp.hlsl -s HLSL -d SPIRV -t compute -e main -o Content/shaders/particle.comp.spv" />
  <Exec Command="shadercross shaders/sprite.vert.hlsl -s HLSL -d SPIRV -t vertex -e main -o Content/shaders/sprite.vert.spv" />
  <Exec Command="shadercross shaders/sprite.frag.hlsl -s HLSL -d SPIRV -t fragment -e main -o Content/shaders/sprite.frag.spv" />
</Target>
```

## Online (Runtime) Compilation

For development iteration or modding support, SDL_shadercross can compile shaders at application startup. This ships the compiler as a library dependency.

### Graphics Shader from HLSL

```c
SDL_GPUShader *vertShader = SDL_ShaderCross_CompileGraphicsShaderFromHLSL(
    device,
    hlslSource,        // HLSL source code as a string
    "main",            // entry point
    NULL,              // include directories (NULL for none)
    NULL,              // defines (NULL for none)
    0,                 // number of defines
    SDL_GPU_SHADERSTAGE_VERTEX,
    NULL               // out: number of threads (compute only)
);
```

### Compute Shader from HLSL

```c
SDL_GPUComputePipeline *computePipeline =
    SDL_ShaderCross_CompileComputePipelineFromHLSL(
        device,
        hlslSource,
        "main",
        NULL,  // includes
        NULL,  // defines
        0      // num defines
    );
```

### From SPIR-V (Pre-compiled)

```c
// Load pre-compiled SPIR-V bytecode
size_t spirvSize;
void *spirvData = SDL_LoadFile("shaders/particle.comp.spv", &spirvSize);

SDL_GPUComputePipeline *pipeline =
    SDL_ShaderCross_CompileComputePipelineFromSPIRV(
        device,
        spirvData,
        spirvSize
    );

SDL_free(spirvData);
```

SDL_shadercross automatically selects the correct output format based on the active GPU backend — no branching logic needed in your application code.

## Resource Reflection

One of SDL_shadercross's most valuable features is **automatic resource reflection**. When compiling from HLSL or SPIR-V, it inspects the shader bytecode to determine how many samplers, textures, storage buffers, and uniform buffers the shader uses.

Without reflection, you must manually specify resource counts when creating `SDL_GPUShader`:

```c
// Manual (error-prone) — you must keep these in sync with the shader
SDL_GPUShaderCreateInfo info = {
    .code = bytecode,
    .code_size = bytecodeSize,
    .num_samplers = 2,
    .num_storage_textures = 1,
    .num_storage_buffers = 0,
    .num_uniform_buffers = 1
};
```

With SDL_shadercross's `CompileFromHLSL` or `CompileFromSPIRV` functions, these counts are extracted automatically from the shader, eliminating a common source of bugs.

### JSON Reflection Output

For tooling and debugging, export shader reflection data as JSON:

```bash
shadercross myshader.comp.hlsl -s HLSL -d JSON -t compute -e main -o myshader.json
```

This produces a JSON file describing all resources the shader declares, useful for validating pipeline layouts.

## Writing Compute Shaders for SDL GPU

### HLSL Compute Shader Structure

```hlsl
// particle_update.comp.hlsl
// Updates particle positions using a compute shader.

struct Particle
{
    float2 position;
    float2 velocity;
    float life;
    float _pad;  // align to 8 bytes
};

// Read-write storage buffer bound at slot 0
RWStructuredBuffer<Particle> particles : register(u0);

// Uniform buffer with frame constants
cbuffer FrameData : register(b0)
{
    float deltaTime;
    float gravity;
    uint particleCount;
};

[numthreads(64, 1, 1)]
void main(uint3 id : SV_DispatchThreadID)
{
    if (id.x >= particleCount) return;

    Particle p = particles[id.x];

    // Apply gravity
    p.velocity.y += gravity * deltaTime;

    // Integrate position
    p.position += p.velocity * deltaTime;

    // Age the particle
    p.life -= deltaTime;

    particles[id.x] = p;
}
```

### Dispatching Compute Work

```c
// Bind the compute pipeline and dispatch
SDL_GPUComputePass *computePass = SDL_BeginGPUComputePass(
    commandBuffer,
    NULL, 0,    // no storage textures
    &(SDL_GPUStorageBufferReadWriteBinding){
        .buffer = particleBuffer,
        .cycle = true
    }, 1        // 1 read-write storage buffer
);

SDL_BindGPUComputePipeline(computePass, particlePipeline);

// Push uniform data
SDL_PushGPUComputeUniformData(commandBuffer, 0, &frameData, sizeof(frameData));

// Dispatch: ceil(particleCount / 64) workgroups
uint32_t groupCount = (particleCount + 63) / 64;
SDL_DispatchGPUCompute(computePass, groupCount, 1, 1);

SDL_EndGPUComputePass(computePass);
```

## Common Use Cases for Compute Shaders in Games

| Use Case | Description |
|----------|-------------|
| **Particle simulation** | Update thousands of particles on the GPU without CPU readback |
| **GPU culling** | Frustum/occlusion cull draw calls before rendering |
| **Tile-based lighting** | Classify lights per screen tile for deferred/forward+ rendering |
| **Terrain generation** | Procedural heightmap generation and erosion simulation |
| **Post-processing** | Bloom, blur, tone-mapping as compute dispatches |
| **Physics broadphase** | Spatial hashing or sort-based broadphase on the GPU |

## Offline vs. Online: Decision Guide

| Factor | Offline (Build Time) | Online (Runtime) |
|--------|---------------------|-------------------|
| Startup time | Fast — bytecode is ready | Slower — must compile on first launch |
| Error detection | At build time | At runtime (bad for users) |
| Ship size | Smaller — no compiler libs | Larger — ships DXC/SPIRV-Cross |
| Mod support | Requires custom tooling | Mods can ship HLSL directly |
| Dev iteration | Requires rebuild | Hot-reload friendly |

**Recommendation:** Use offline compilation for release builds. Use online compilation during development for faster iteration. If you support modding, ship the online compiler as an optional component.

## Migration from FXC (Legacy)

If you have existing FNA shaders compiled with `fxc.exe` (the legacy D3D9-era compiler), you need to port them:

1. **Update HLSL syntax:** FXC uses Shader Model 3.0–5.1 syntax. DXC uses Shader Model 6.0+. Key changes include replacing `tex2D()` with `Texture.Sample()`, using register spaces, and declaring resources with `StructuredBuffer` / `RWStructuredBuffer` instead of global uniforms.
2. **Replace `technique`/`pass` blocks:** The SDL GPU API does not use effect framework concepts. Each shader stage is compiled independently.
3. **Update resource bindings:** Move from `register(s0)` / `register(t0)` semantics to explicit `register(b0)` (uniform), `register(t0)` (texture), `register(s0)` (sampler), `register(u0)` (storage).

See [G07 Shader Compilation (FXC)](./G07_shader_compilation_fxc.md) for details on the legacy pipeline and [G09 FNA3D → SDL GPU Migration](./G09_fna3d_sdl_gpu_migration.md) for the broader migration context.

## Checklist

- [ ] Choose source format: HLSL (recommended for FNA) or SPIR-V
- [ ] Set up offline compilation in your build pipeline (`.csproj` target or Makefile)
- [ ] Compile vertex, fragment, and compute shaders to SPIR-V for maximum portability
- [ ] Rely on SDL_shadercross resource reflection instead of manual resource counts
- [ ] Use `[numthreads(64,1,1)]` as a sensible default workgroup size for 1D compute
- [ ] Always guard compute shader access with bounds checks (`if (id.x >= count) return`)
- [ ] Test on all three backends (Vulkan, D3D12, Metal) — translation can expose precision or layout differences
- [ ] Use JSON reflection output to debug resource binding mismatches
