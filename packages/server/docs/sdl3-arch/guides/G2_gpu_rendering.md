# G2 — SDL3 GPU API: Modern Rendering

> **Category:** guide · **Engine:** SDL3 · **Related:** [Getting Started](G1_getting_started.md) · [Architecture Overview](../architecture/E1_architecture_overview.md) · [SDL3 Rules](../sdl3-arch-rules.md)

---

## What Is SDL_GPU?

SDL3 ships with a brand-new GPU abstraction (`SDL_GPU`) that sits above Vulkan, Direct3D 12, and Metal. It gives you explicit, modern-style rendering without writing three separate backends. The 2D `SDL_Renderer` still exists for simple games — `SDL_GPU` is for when you need custom shaders, compute passes, or full control over the graphics pipeline.

**Backend selection is automatic.** You declare which shader formats your app provides and SDL picks the first compatible backend at runtime:

| Backend | Platforms | Shader Format |
|---------|-----------|---------------|
| Vulkan | Windows, Linux, Switch, some Android | SPIR-V |
| Direct3D 12 | Windows 10+, Xbox | DXBC / DXIL |
| Metal | macOS 10.14+, iOS 13.0+ | MSL (Metal Shading Language) |

---

## Object Hierarchy

SDL_GPU follows a clear hierarchy. Understanding it prevents most "where does this go?" confusion:

```
SDL_GPUDevice                          ← Top-level context (one per app)
├── Resources (live as long as you need them)
│   ├── SDL_GPUBuffer                  ← Vertex, index, or storage data on GPU
│   ├── SDL_GPUTexture                 ← Image data on GPU
│   ├── SDL_GPUSampler                 ← Texture filtering/wrapping config
│   └── SDL_GPUTransferBuffer          ← CPU↔GPU staging area
├── Pipelines (immutable after creation)
│   ├── SDL_GPUGraphicsPipeline        ← Vertex + fragment shader + render state
│   └── SDL_GPUComputePipeline         ← Compute shader + dispatch config
└── Per-frame objects
    └── SDL_GPUCommandBuffer           ← Records a batch of work
        ├── SDL_GPURenderPass          ← Draw calls targeting color/depth textures
        ├── SDL_GPUComputePass         ← Dispatch compute work
        └── SDL_GPUCopyPass            ← Upload/download/copy data
```

**Key rule:** resources and pipelines are created once and reused across frames. Command buffers and passes are acquired fresh each frame and submitted when complete.

---

## Frame Rendering Workflow

Every frame follows the same pattern:

### Step 1: Acquire a Command Buffer

```c
SDL_GPUCommandBuffer *cmdbuf = SDL_AcquireGPUCommandBuffer(device);
```

A command buffer records GPU work. Nothing executes until you submit it.

### Step 2: Get the Swapchain Texture

```c
SDL_GPUTexture *swapchain_tex;
Uint32 w, h;
SDL_AcquireGPUSwapchainTexture(cmdbuf, window, &swapchain_tex, &w, &h);
```

This is the backbuffer you render into. The window must be claimed first (done once at startup with `SDL_ClaimWindowForGPUDevice`).

### Step 3: Begin a Render Pass

```c
SDL_GPUColorTargetInfo color_target = {
    .texture = swapchain_tex,
    .clear_color = { 0.1f, 0.1f, 0.15f, 1.0f },
    .load_op = SDL_GPU_LOADOP_CLEAR,
    .store_op = SDL_GPU_STOREOP_STORE
};

SDL_GPURenderPass *pass = SDL_BeginGPURenderPass(
    cmdbuf, &color_target, 1, NULL);
```

A render pass targets one or more color textures and optionally a depth/stencil texture. The load/store ops tell the GPU whether to clear, load from memory, or discard.

### Step 4: Bind Pipeline and Draw

```c
SDL_BindGPUGraphicsPipeline(pass, my_pipeline);

SDL_GPUBufferBinding vb = { .buffer = vertex_buf, .offset = 0 };
SDL_BindGPUVertexBuffers(pass, 0, &vb, 1);

SDL_DrawGPUPrimitives(pass, 3, 1, 0, 0);
//                     ↑ vertices  ↑ instances
```

### Step 5: End Pass and Submit

```c
SDL_EndGPURenderPass(pass);
SDL_SubmitGPUCommandBuffer(cmdbuf);
```

After submit, the command buffer is consumed — acquire a new one next frame.

---

## Creating Resources

### Vertex Buffers

```c
SDL_GPUBuffer *vbuf = SDL_CreateGPUBuffer(device,
    &(SDL_GPUBufferCreateInfo){
        .usage = SDL_GPU_BUFFERUSAGE_VERTEX,
        .size  = sizeof(vertices)
    });
```

### Textures

```c
SDL_GPUTexture *tex = SDL_CreateGPUTexture(device,
    &(SDL_GPUTextureCreateInfo){
        .type   = SDL_GPU_TEXTURETYPE_2D,
        .format = SDL_GPU_TEXTUREFORMAT_R8G8B8A8_UNORM,
        .width  = 512,
        .height = 512,
        .layer_count_or_depth = 1,
        .num_levels = 1,
        .usage  = SDL_GPU_TEXTUREUSAGE_SAMPLER
    });
```

### Uploading Data (CPU → GPU)

GPU resources aren't directly writable. Use a transfer buffer as a staging area:

```c
// 1. Create a transfer buffer
SDL_GPUTransferBuffer *xfer = SDL_CreateGPUTransferBuffer(device,
    &(SDL_GPUTransferBufferCreateInfo){
        .usage = SDL_GPU_TRANSFERBUFFERUSAGE_UPLOAD,
        .size  = data_size
    });

// 2. Map, copy, unmap
void *ptr = SDL_MapGPUTransferBuffer(device, xfer, false);
SDL_memcpy(ptr, my_data, data_size);
SDL_UnmapGPUTransferBuffer(device, xfer);

// 3. Record the upload in a copy pass
SDL_GPUCommandBuffer *upload_cmd = SDL_AcquireGPUCommandBuffer(device);
SDL_GPUCopyPass *copy = SDL_BeginGPUCopyPass(upload_cmd);

SDL_UploadToGPUBuffer(copy,
    &(SDL_GPUTransferBufferLocation){ .transfer_buffer = xfer, .offset = 0 },
    &(SDL_GPUBufferRegion){ .buffer = vbuf, .offset = 0, .size = data_size },
    false);  // cycle = false if buffer isn't in use yet

SDL_EndGPUCopyPass(copy);
SDL_SubmitGPUCommandBuffer(upload_cmd);
```

**Resource cycling:** pass `true` for the cycle parameter if the GPU may still be reading the buffer from a previous frame. SDL will internally rotate to a fresh backing allocation instead of stalling.

---

## Shader Cross-Compilation

SDL_GPU requires pre-compiled shader bytecode — you can't pass GLSL strings at runtime. The workflow:

1. **Write shaders in HLSL** (recommended for portability) or GLSL
2. **Compile with `SDL_shadercross`** to produce SPIR-V, DXBC, and MSL
3. **Load at runtime** with `SDL_CreateGPUShader()`

```bash
# Install SDL_shader_tools (ships with SDL3 extras)
# Compile HLSL vertex shader to all formats
shadercross --input triangle.vert.hlsl --output triangle.vert \
            --stage vertex --entrypoint main
```

When creating the device, declare which formats your shaders support:

```c
SDL_GPUDevice *device = SDL_CreateGPUDevice(
    SDL_GPU_SHADERFORMAT_SPIRV | SDL_GPU_SHADERFORMAT_DXBC | SDL_GPU_SHADERFORMAT_MSL,
    true,   // debug mode
    NULL);
```

SDL picks the best backend that matches your provided formats and the current platform.

---

## Graphics Pipeline Configuration

Pipelines are immutable objects that encapsulate the full render state:

```c
SDL_GPUGraphicsPipelineCreateInfo pipeline_info = {
    .vertex_shader   = vert_shader,
    .fragment_shader = frag_shader,
    .vertex_input_state = &(SDL_GPUVertexInputState){
        .vertex_buffer_descriptions = &(SDL_GPUVertexBufferDescription){
            .slot = 0,
            .pitch = sizeof(Vertex),
            .input_rate = SDL_GPU_VERTEXINPUTRATE_VERTEX
        },
        .num_vertex_buffers = 1,
        .vertex_attributes = (SDL_GPUVertexAttribute[]){
            { .location = 0, .format = SDL_GPU_VERTEXELEMENTFORMAT_FLOAT2,
              .offset = offsetof(Vertex, position) },
            { .location = 1, .format = SDL_GPU_VERTEXELEMENTFORMAT_UBYTE4_NORM,
              .offset = offsetof(Vertex, color) }
        },
        .num_vertex_attributes = 2
    },
    .primitive_type = SDL_GPU_PRIMITIVETYPE_TRIANGLELIST,
    .rasterizer_state = &(SDL_GPURasterizerState){
        .fill_mode = SDL_GPU_FILLMODE_FILL,
        .cull_mode = SDL_GPU_CULLMODE_BACK,
        .front_face = SDL_GPU_FRONTFACE_COUNTER_CLOCKWISE
    },
    .target_info = &(SDL_GPUGraphicsPipelineTargetInfo){
        .color_target_descriptions = &(SDL_GPUColorTargetDescription){
            .format = SDL_GetGPUSwapchainTextureFormat(device, window)
        },
        .num_color_targets = 1
    }
};

SDL_GPUGraphicsPipeline *pipeline =
    SDL_CreateGPUGraphicsPipeline(device, &pipeline_info);
```

**Why immutable?** The GPU driver can fully optimize the pipeline once at creation time instead of patching state at draw time. This is how Vulkan, D3D12, and Metal all work — SDL_GPU follows the same model.

---

## Compute Passes

SDL_GPU supports general-purpose compute shaders for tasks like particle simulation, terrain generation, or post-processing:

```c
SDL_GPUComputePass *compute = SDL_BeginGPUComputePass(
    cmdbuf,
    storage_textures, num_storage_textures,
    storage_buffers, num_storage_buffers);

SDL_BindGPUComputePipeline(compute, compute_pipeline);
SDL_BindGPUComputeStorageBuffers(compute, 0, &buf_binding, 1);
SDL_DispatchGPUCompute(compute, group_count_x, group_count_y, group_count_z);

SDL_EndGPUComputePass(compute);
```

---

## Coordinate Conventions

This catches people coming from OpenGL:

| Aspect | SDL_GPU Convention |
|--------|--------------------|
| Handedness | Left-handed |
| NDC Z range | [0, 1] (not [-1, 1]) |
| Texture origin | Top-left (Y-down) |
| Viewport origin | Top-left (Y-down) |

These match D3D12 and Metal conventions. If you're porting OpenGL shaders, flip your Y coordinates and remap Z.

---

## SDL_Renderer vs SDL_GPU

| Feature | SDL_Renderer | SDL_GPU |
|---------|-------------|---------|
| Complexity | ~10 functions to draw | Full pipeline setup required |
| Custom shaders | No | Yes |
| 3D rendering | No | Yes |
| Compute | No | Yes |
| Use case | 2D games, UI, prototyping | Custom rendering, 3D, VFX |
| Backend | Auto-selected (OpenGL/D3D/Metal) | Vulkan/D3D12/Metal only |

**You can use both in the same application.** `SDL_Renderer` can target an `SDL_GPU` device, letting you mix 2D convenience drawing with custom GPU work.

---

## Common Pitfalls

1. **Forgetting to claim the window** — call `SDL_ClaimWindowForGPUDevice(device, window)` once after creating both. Swapchain acquire will fail without it.

2. **Submitting empty command buffers** — valid but wasteful. Always have at least one pass.

3. **Mismatched shader formats** — if your compiled shaders only include SPIR-V but you're on macOS, device creation will fail. Always compile for all three formats or check the platform.

4. **Not handling swapchain resize** — when the window resizes, the swapchain texture dimensions change. Check the width/height returned by `SDL_AcquireGPUSwapchainTexture` and update your viewport/projection accordingly.

5. **Uploading to in-flight resources without cycling** — if the GPU is still reading a buffer from the last frame and you overwrite it, you get corruption. Pass `cycle=true` or double-buffer manually.

---

## Next Steps

- **Texture rendering** — load images with `SDL_image`, upload to `SDL_GPUTexture`, bind samplers
- **Depth buffering** — add a depth target to your render pass for 3D scenes
- **Multiple render targets** — render to offscreen textures for post-processing
- **Shader cross-compilation** — set up `SDL_shader_tools` in your build pipeline
