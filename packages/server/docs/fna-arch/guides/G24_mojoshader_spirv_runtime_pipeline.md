# G24 — MojoShader Runtime Shader Translation Pipeline

> **Category:** guide · **Engine:** FNA · **Related:** [G07 Shader Compilation (FXC)](./G07_shader_compilation_fxc.md) · [G18 SDL_shadercross & Compute](./G18_sdl_shadercross_compute.md) · [G03 SDL3 GPU API](./G03_sdl3_gpu_api.md) · [G09 FNA3D SDL GPU Migration](./G09_fna3d_sdl_gpu_migration.md) · [FNA Architecture Rules](../fna-arch-rules.md)

How MojoShader translates FXC-compiled DXBC shader bytecode at runtime to target every graphics backend FNA supports. Covers the translation pipeline from D3D9 Effect binaries through SPIR-V to native GPU formats, the role of SPIRV-Cross, and how this integrates with SDL_GPU in FNA3D. Distinct from G07 (compile-time FXC workflow) and G18 (SDL_shadercross for new compute shaders).

---

## The Problem MojoShader Solves

FNA reproduces XNA 4.0, which used Microsoft's Direct3D 9 Effect framework. Games ship shader binaries compiled by `fxc.exe` containing DXBC (DirectX Bytecode) — a D3D9-era format. Modern GPUs speak Vulkan (SPIR-V), Metal (MSL), or D3D12 (DXIL), not D3D9.

MojoShader bridges this gap **at runtime**, translating D3D9 bytecode to whatever the current graphics backend needs. This is why FNA games compile shaders once with FXC and run everywhere.

```
Game ships .fxb file (DXBC / D3D9 bytecode)
         │
         ▼
    MojoShader (runtime)
         │
    ┌────┴─────────────────────┐
    │  SPIR-V emitter          │
    │  (source of truth)       │
    └────┬─────────────────────┘
         │
    ┌────┴────┬──────────┬──────────┐
    │ Vulkan  │  Metal   │  D3D12   │
    │ SPIR-V  │  MSL     │  DXIL    │
    │ (direct)│ (via     │ (via     │
    │         │ SPIRV-   │ SPIRV-   │
    │         │ Cross)   │ Cross)   │
    └─────────┴──────────┴──────────┘
```

## SPIR-V as the Universal Intermediate

Since FNA3D adopted SDL_GPU as its default rendering backend (25.03), MojoShader uses its **SPIR-V emitter** as the single source of truth for all GPU backends. This is a deliberate architectural choice:

1. **MojoShader reads DXBC bytecode** — the D3D9 shader model 2.0/3.0 instructions
2. **Emits SPIR-V** — Khronos's portable intermediate representation
3. **SPIRV-Cross translates SPIR-V to native formats** — MSL for Metal, HLSL for D3D12 recompilation

This approach ensures consistency: every backend receives shaders derived from the same SPIR-V, reducing the chance of rendering differences between platforms.

### Why Not Translate Directly to Each Format?

MojoShader historically had separate emitters for GLSL, Metal, and other targets. The SPIR-V-centric approach is superior because:

- **One emitter to maintain** instead of N per backend
- **SPIRV-Cross is battle-tested** — used across the industry for shader translation
- **Dogfoods the SDL_GPU model** — SDL_GPU itself is designed around SPIR-V as interchange format
- **New backends get support automatically** — any target SPIRV-Cross supports works with FNA

## How FNA3D Integrates MojoShader

When your FNA game calls `Effect.Apply()` or `GraphicsDevice.DrawPrimitives()`, here's what happens internally:

### 1. Effect Loading

```csharp
// Your game code — standard XNA API
Effect myEffect = Content.Load<Effect>("Shaders/MyShader");
// Or: new Effect(GraphicsDevice, File.ReadAllBytes("MyShader.fxb"));
```

FNA3D receives the raw DXBC bytes and passes them to MojoShader for parsing. MojoShader reads the D3D9 Effect structure: techniques, passes, parameters, vertex/pixel shader programs.

### 2. Shader Translation (On First Use)

When a shader program is first bound, MojoShader translates it:

```
DXBC instructions → MojoShader IR → SPIR-V bytecode
```

The SPIR-V is then passed to SDL_GPU, which either:
- **Uses SPIR-V directly** (Vulkan backend)
- **Loads SPIRV-Cross dynamically** and translates to the native format (Metal, D3D12)

### 3. Caching

Translated shaders are cached in memory for the session. The same DXBC program is only translated once per backend per run.

### 4. Parameter Binding

MojoShader maintains the Effect parameter system (matrices, textures, floats) and maps XNA-style parameter binds to the appropriate uniform/constant buffer updates for the active backend.

## The Role of SPIRV-Cross

SPIRV-Cross is loaded as a **shared library** (`spirv-cross-c-shared`) at runtime by SDL_GPU. It is not statically linked into FNA3D.

### When SPIRV-Cross Is Available

SDL_GPU dynamically loads `spirv-cross-c-shared` and uses it to translate SPIR-V to native formats:

| Backend | SPIRV-Cross Output |
|---------|--------------------|
| Vulkan | Not needed — uses SPIR-V directly |
| Metal | MSL (Metal Shading Language) |
| Direct3D 12 | HLSL → compiled to DXIL by platform compiler |
| Direct3D 11 | HLSL → compiled to DXBC by platform compiler |

### When SPIRV-Cross Is Not Available

If the shared library is not found at runtime, SDL_GPU falls back to requiring pre-translated native shaders. For FNA games using MojoShader, this means:
- Vulkan backend works (SPIR-V is native)
- Other backends may fail to load shaders

**Deployment rule:** Always bundle `spirv-cross-c-shared` with your fnalibs unless you are targeting Vulkan exclusively.

## MojoShader vs SDL_shadercross

These are complementary tools, not alternatives:

| | MojoShader | SDL_shadercross |
|---|---|---|
| **Input** | DXBC (D3D9 FXC output) | HLSL source or SPIR-V |
| **Purpose** | Translate legacy XNA shaders at runtime | Compile new shaders for SDL_GPU |
| **When to use** | Existing FNA game with `.fxb` shaders | New compute shaders or custom GPU pipelines |
| **Runtime/Offline** | Runtime only | Both runtime and offline |
| **Used by** | FNA3D internally | Your game code (if using SDL_GPU directly) |

If you are writing a standard FNA game using the XNA Effect API, MojoShader handles everything automatically. You only need SDL_shadercross if you are authoring new shaders that bypass the XNA Effect system (e.g., compute shaders via SDL_GPU directly, covered in G18).

## Shader Model Limitations

MojoShader supports D3D9 Shader Model 2.0 and 3.0, matching what XNA 4.0 supported:

| Feature | SM 2.0 | SM 3.0 | SM 4.0+ |
|---------|--------|--------|---------|
| Vertex/Pixel shaders | Yes | Yes | No |
| Geometry shaders | No | No | No |
| Compute shaders | No | No | No (use SDL_shadercross) |
| Tessellation | No | No | No |
| Max texture samplers | 16 | 16 | N/A |
| Max instructions | 512 | 65535 | N/A |
| Dynamic branching | Limited | Yes | N/A |

This is by design — FNA is XNA 4.0, and XNA 4.0 was Shader Model 3.0. If you need SM 4.0+ features (compute, geometry shaders, tessellation), use SDL_GPU directly with SDL_shadercross (G18).

## Debugging Shader Translation Issues

### Symptoms of MojoShader Problems

- **Black screen / missing geometry** — shader failed to translate but error was swallowed
- **Incorrect colors on one platform** — precision or instruction translation difference
- **Crash on Effect load** — malformed or unsupported DXBC bytecode

### Environment Variables for Diagnosis

```bash
# Force a specific FNA3D renderer (isolate backend issues)
export FNA3D_FORCE_DRIVER=vulkan    # or d3d11, d3d12, metal

# Enable FNA3D debug logging
export FNA3D_LOG_LEVEL=verbose

# Force SDL_GPU shader format (advanced debugging)
export SDL_GPU_SHADERCROSS_SPIRVCROSS_PATH=/path/to/libspirv-cross-c-shared.so
```

### Validation Steps

1. **Test on Vulkan first** — SPIR-V is used directly, fewest translation layers
2. **Compare with D3D11** — MojoShader's GLSL path is most mature
3. **Check shader complexity** — SM 3.0 features like dynamic branching may translate differently
4. **Verify SPIRV-Cross version** — ensure fnalibs include a recent build

## MonoGame Compatibility Note

MonoGame uses its own MGFX shader format and does **not** use MojoShader. The shader pipelines are completely separate:

| | FNA | MonoGame |
|---|---|---|
| **Compiler** | `fxc.exe` (Microsoft) | MGFX (MonoGame custom) |
| **Binary format** | DXBC | MGFX |
| **Runtime translator** | MojoShader → SPIR-V | Per-platform compiled shaders |
| **Cross-platform** | Single binary, runtime translation | Per-platform shader compilation |

Compiled shader binaries are **not interchangeable**. When porting between FNA and MonoGame, you must recompile from `.fx` source. See G20 for the full migration guide.
