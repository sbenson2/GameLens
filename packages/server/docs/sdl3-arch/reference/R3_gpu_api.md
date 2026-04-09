# SDL3 GPU API Reference

> **Category:** reference · **Engine:** SDL3 · **Related:** [Architecture Overview](../architecture/E1_architecture_overview.md), [GPU Rendering Guide](../guides/G2_gpu_rendering.md)

The SDL_GPU API is SDL3's flagship addition — a modern, cross-platform GPU abstraction layer that targets Vulkan, Direct3D 12, and Metal through a single unified interface. Unlike SDL2's software-oriented SDL_Renderer, SDL_GPU uses a command-buffer architecture modeled after next-generation graphics APIs, giving developers explicit control over rendering pipelines, compute workloads, and resource transfers.

## Core Architecture

SDL_GPU follows a hierarchical object model:

```
SDL_GPUDevice (top-level)
  ├── SDL_GPUCommandBuffer (per-frame batch)
  │   ├── SDL_GPURenderPass (draw operations)
  │   ├── SDL_GPUComputePass (compute dispatch)
  │   └── SDL_GPUCopyPass (resource transfers)
  ├── SDL_GPUGraphicsPipeline (immutable render state)
  ├── SDL_GPUComputePipeline (immutable compute state)
  ├── SDL_GPUShader (compiled shader program)
  ├── SDL_GPUTexture (image data)
  ├── SDL_GPUBuffer (vertex/index/storage data)
  ├── SDL_GPUSampler (texture sampling state)
  └── SDL_GPUTransferBuffer (CPU↔GPU staging)
```

All GPU operations are deferred — commands are recorded into buffers and only executed when submitted. State is pass-local and resets between passes.

## Device Management

### Creating a Device

```c
// Specify which shader formats your app provides
SDL_GPUDevice* device = SDL_CreateGPUDevice(
    SDL_GPU_SHADERFORMAT_SPIRV | SDL_GPU_SHADERFORMAT_MSL,
    true,   // enable debug mode
    NULL    // no property overrides
);

// Claim a window for presentation
SDL_ClaimWindowForGPUDevice(device, window);
```

The device selects the first compatible backend based on platform and shader format support. Rendering can also occur offscreen without a window (useful for image processing or compute-only workloads).

### Key Functions

| Function | Purpose |
|----------|---------|
| `SDL_CreateGPUDevice()` | Create device with shader format preferences |
| `SDL_CreateGPUDeviceWithProperties()` | Create with explicit property overrides |
| `SDL_DestroyGPUDevice()` | Destroy device and release all resources |
| `SDL_ClaimWindowForGPUDevice()` | Bind a window for swapchain presentation |
| `SDL_ReleaseWindowFromGPUDevice()` | Unbind a window |
| `SDL_GetGPUDeviceDriver()` | Query active backend name |
| `SDL_GetGPUShaderFormats()` | Query supported shader formats |

## Command Buffer Lifecycle

Every frame follows the same pattern: acquire a command buffer, record passes into it, then submit.

```c
// 1. Acquire
SDL_GPUCommandBuffer* cmd = SDL_AcquireGPUCommandBuffer(device);

// 2. Record passes (render, compute, copy — in any order)
//    ... see sections below ...

// 3. Submit
SDL_SubmitGPUCommandBuffer(cmd);
```

Complex scenes may use multiple command buffers across threads, but a single buffer per frame suffices for most games.

| Function | Purpose |
|----------|---------|
| `SDL_AcquireGPUCommandBuffer()` | Get a fresh command buffer |
| `SDL_SubmitGPUCommandBuffer()` | Submit for execution |
| `SDL_SubmitGPUCommandBufferAndAcquireFence()` | Submit and get a fence for synchronization |
| `SDL_CancelGPUCommandBuffer()` | Discard without submitting |

## Render Passes

A render pass encapsulates all draw operations targeting specific color and depth/stencil textures. Up to 4 color targets and 1 depth target are supported per pass.

```c
// Get the swapchain texture for this frame
SDL_GPUTexture* swapchain;
SDL_WaitAndAcquireGPUSwapchainTexture(cmd, window, &swapchain, NULL, NULL);

// Configure the color target
SDL_GPUColorTargetInfo color_target = {
    .texture = swapchain,
    .load_op = SDL_GPU_LOADOP_CLEAR,        // clear on pass start
    .store_op = SDL_GPU_STOREOP_STORE,      // keep results
    .clear_color = { 0.1f, 0.1f, 0.1f, 1.0f }
};

// Begin the render pass
SDL_GPURenderPass* pass = SDL_BeginGPURenderPass(cmd, &color_target, 1, NULL);

// Bind pipeline, resources, and draw
SDL_BindGPUGraphicsPipeline(pass, my_pipeline);
SDL_BindGPUVertexBuffers(pass, 0, &vertex_binding, 1);
SDL_BindGPUIndexBuffer(pass, &index_binding, SDL_GPU_INDEXELEMENTSIZE_16BIT);
SDL_BindGPUFragmentSamplers(pass, 0, &sampler_binding, 1);
SDL_DrawGPUIndexedPrimitives(pass, index_count, 1, 0, 0, 0);

SDL_EndGPURenderPass(pass);
```

### Load/Store Operations

Load operations control what happens to target textures at pass start:
- `SDL_GPU_LOADOP_LOAD` — preserve existing contents
- `SDL_GPU_LOADOP_CLEAR` — clear to a specified color/value
- `SDL_GPU_LOADOP_DONT_CARE` — contents undefined (fastest)

Store operations control what happens at pass end:
- `SDL_GPU_STOREOP_STORE` — write results to texture
- `SDL_GPU_STOREOP_DONT_CARE` — discard (useful for depth-only passes)

### Draw Commands

| Function | Purpose |
|----------|---------|
| `SDL_DrawGPUPrimitives()` | Non-indexed draw |
| `SDL_DrawGPUIndexedPrimitives()` | Indexed draw |
| `SDL_DrawGPUPrimitivesIndirect()` | GPU-driven non-indexed draw |
| `SDL_DrawGPUIndexedPrimitivesIndirect()` | GPU-driven indexed draw |

### Render State

| Function | Purpose |
|----------|---------|
| `SDL_SetGPUViewport()` | Set viewport rectangle |
| `SDL_SetGPUScissor()` | Set scissor rectangle |
| `SDL_SetGPUStencilReference()` | Set stencil reference value |
| `SDL_SetGPUBlendConstants()` | Set blend color constants |

## Graphics Pipelines

Pipelines bundle shader programs with fixed rendering state. They are immutable once created and should be reused across frames.

```c
SDL_GPUGraphicsPipelineCreateInfo pipeline_info = {
    .vertex_shader = vertex_shader,
    .fragment_shader = fragment_shader,
    .vertex_input_state = {
        .vertex_buffer_descriptions = &vertex_desc,
        .num_vertex_buffers = 1,
        .vertex_attributes = vertex_attrs,
        .num_vertex_attributes = attr_count
    },
    .primitive_type = SDL_GPU_PRIMITIVETYPE_TRIANGLELIST,
    .rasterizer_state = {
        .fill_mode = SDL_GPU_FILLMODE_FILL,
        .cull_mode = SDL_GPU_CULLMODE_BACK,
        .front_face = SDL_GPU_FRONTFACE_COUNTER_CLOCKWISE
    },
    .multisample_state = { .sample_count = SDL_GPU_SAMPLECOUNT_1 },
    .depth_stencil_state = {
        .enable_depth_test = true,
        .enable_depth_write = true,
        .compare_op = SDL_GPU_COMPAREOP_LESS
    },
    .target_info = {
        .color_target_descriptions = &color_desc,
        .num_color_targets = 1,
        .has_depth_stencil_target = true,
        .depth_stencil_format = SDL_GPU_TEXTUREFORMAT_D32_FLOAT
    }
};

SDL_GPUGraphicsPipeline* pipeline = SDL_CreateGPUGraphicsPipeline(device, &pipeline_info);
```

## Shader Management

SDL_GPU accepts compiled shader binaries only. Use `SDL_shadercross` to compile GLSL/HLSL sources to the required format for each backend.

```c
SDL_GPUShaderCreateInfo shader_info = {
    .code = spirv_bytecode,
    .code_size = spirv_size,
    .format = SDL_GPU_SHADERFORMAT_SPIRV,
    .stage = SDL_GPU_SHADERSTAGE_VERTEX,
    .entrypoint = "main",
    .num_uniform_buffers = 1,
    .num_samplers = 0,
    .num_storage_buffers = 0,
    .num_storage_textures = 0
};

SDL_GPUShader* shader = SDL_CreateGPUShader(device, &shader_info);
// ... use in pipeline creation ...
SDL_ReleaseGPUShader(device, shader);  // safe after pipeline is created
```

**Shader format matrix:**

| Backend | Format | Tool |
|---------|--------|------|
| Vulkan | SPIR-V | `glslc` / `SDL_shadercross` |
| Direct3D 12 | DXIL | `dxc` / `SDL_shadercross` |
| Metal | MSL | `SDL_shadercross` |

**Uniform slots:** Maximum 4 per shader stage, ~4KB recommended per slot. Push uniform data per-frame via `SDL_PushGPUVertexUniformData()` and `SDL_PushGPUFragmentUniformData()`.

## Buffer and Texture Operations

### Buffers

```c
// Create a GPU buffer
SDL_GPUBuffer* vbo = SDL_CreateGPUBuffer(device, &(SDL_GPUBufferCreateInfo){
    .usage = SDL_GPU_BUFFERUSAGE_VERTEX,
    .size = vertex_data_size
});
```

### Textures

```c
SDL_GPUTexture* texture = SDL_CreateGPUTexture(device, &(SDL_GPUTextureCreateInfo){
    .type = SDL_GPU_TEXTURETYPE_2D,
    .format = SDL_GPU_TEXTUREFORMAT_R8G8B8A8_UNORM,
    .width = 512,
    .height = 512,
    .layer_count_or_depth = 1,
    .num_levels = 1,
    .usage = SDL_GPU_TEXTUREUSAGE_SAMPLER
});
```

### Uploading Data (Transfer Buffers)

Data upload follows a staging pattern — CPU writes to a transfer buffer, then a copy pass sends it to the GPU:

```c
// 1. Create a transfer buffer (CPU-accessible)
SDL_GPUTransferBuffer* transfer = SDL_CreateGPUTransferBuffer(device, &(SDL_GPUTransferBufferCreateInfo){
    .usage = SDL_GPU_TRANSFERBUFFERUSAGE_UPLOAD,
    .size = data_size
});

// 2. Map, write, unmap
void* mapped = SDL_MapGPUTransferBuffer(device, transfer, false);
memcpy(mapped, source_data, data_size);
SDL_UnmapGPUTransferBuffer(device, transfer);

// 3. Copy to GPU in a copy pass
SDL_GPUCopyPass* copy = SDL_BeginGPUCopyPass(cmd);
SDL_UploadToGPUBuffer(copy, &(SDL_GPUTransferBufferLocation){
    .transfer_buffer = transfer, .offset = 0
}, &(SDL_GPUBufferRegion){
    .buffer = vbo, .offset = 0, .size = data_size
}, false);
SDL_EndGPUCopyPass(copy);
```

### Resource Cycling

When `cycle=true` on upload/map operations, SDL_GPU automatically rotates to a fresh backing resource if the current one is still in-flight on the GPU. This prevents CPU/GPU synchronization stalls without manual double/triple buffering.

## Compute Passes

Compute pipelines execute shader code on arbitrary data, independent of rendering:

```c
SDL_GPUComputePipeline* compute = SDL_CreateGPUComputePipeline(device, &(SDL_GPUComputePipelineCreateInfo){
    .code = compute_spirv,
    .code_size = compute_spirv_size,
    .format = SDL_GPU_SHADERFORMAT_SPIRV,
    .entrypoint = "main",
    .num_readwrite_storage_buffers = 1,
    .threadcount_x = 256,
    .threadcount_y = 1,
    .threadcount_z = 1
});

// In a command buffer:
SDL_GPUComputePass* pass = SDL_BeginGPUComputePass(cmd, NULL, 0, &storage_binding, 1);
SDL_BindGPUComputePipeline(pass, compute);
SDL_DispatchGPUCompute(pass, group_count_x, 1, 1);
SDL_EndGPUComputePass(pass);
```

## Synchronization

| Function | Purpose |
|----------|---------|
| `SDL_QueryGPUFence()` | Check if a fence has been signaled |
| `SDL_WaitForGPUFences()` | Block until fences complete |
| `SDL_ReleaseGPUFence()` | Free a fence object |
| `SDL_WaitForGPUIdle()` | Block until all GPU work completes |

## Typical Frame Structure

```c
void render_frame(SDL_GPUDevice* device, SDL_Window* window) {
    SDL_GPUCommandBuffer* cmd = SDL_AcquireGPUCommandBuffer(device);

    // Upload dynamic data (copy pass)
    SDL_GPUCopyPass* copy = SDL_BeginGPUCopyPass(cmd);
    // ... upload per-frame uniforms, dynamic vertex data ...
    SDL_EndGPUCopyPass(copy);

    // Main render pass
    SDL_GPUTexture* swapchain;
    SDL_WaitAndAcquireGPUSwapchainTexture(cmd, window, &swapchain, NULL, NULL);

    SDL_GPURenderPass* pass = SDL_BeginGPURenderPass(cmd, &color_target, 1, &depth_target);
    SDL_BindGPUGraphicsPipeline(pass, pipeline);
    SDL_PushGPUVertexUniformData(cmd, 0, &view_proj, sizeof(view_proj));

    for (int i = 0; i < object_count; i++) {
        SDL_PushGPUVertexUniformData(cmd, 1, &objects[i].transform, sizeof(Mat4));
        SDL_DrawGPUIndexedPrimitives(pass, objects[i].index_count, 1, 0, 0, 0);
    }

    SDL_EndGPURenderPass(pass);
    SDL_SubmitGPUCommandBuffer(cmd);
}
```

## Performance Guidelines

- **Minimize pass count.** Each render pass has overhead — batch draws into fewer, longer passes.
- **Reuse pipelines.** Pipeline creation is expensive; create at startup and cache.
- **Upload early.** Perform data uploads in copy passes before render passes, not interleaved.
- **Use resource cycling.** Set `cycle=true` for resources written each frame to avoid stalls.
- **Prefer storage buffers** over uniforms for large per-frame data (uniform slots cap at ~4KB).
- **Sort draw calls** by pipeline to minimize state changes within a render pass.

## Migration from SDL2 SDL_Renderer

| SDL2 SDL_Renderer | SDL3 SDL_GPU Equivalent |
|-------------------|------------------------|
| `SDL_CreateRenderer()` | `SDL_CreateGPUDevice()` + `SDL_ClaimWindowForGPUDevice()` |
| `SDL_RenderClear()` | `SDL_GPU_LOADOP_CLEAR` in render pass begin |
| `SDL_RenderCopy()` | Bind pipeline + texture sampler + draw quad |
| `SDL_RenderPresent()` | `SDL_SubmitGPUCommandBuffer()` |
| Immediate state | Immutable pipelines + command buffer recording |
| Fixed-function blending | Shader-based (full control) |

Note: SDL3 still includes `SDL_Renderer` for simpler 2D use cases. SDL_GPU is the choice when you need shader control, compute, or multi-pass rendering.
