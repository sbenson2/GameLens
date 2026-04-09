# G15 — Multi-Window Rendering with SDL3 GPU API

> **Category:** guide · **Engine:** FNA · **Related:** [G03 SDL3 GPU API](./G03_sdl3_gpu_api.md) · [G01 Getting Started](./G01_getting_started.md) · [G09 FNA3D → SDL GPU Migration](./G09_fna3d_sdl_gpu_migration.md) · [G12 SDL GPU Deployment Lessons](./G12_sdl_gpu_deployment_lessons.md)

SDL3's GPU API provides first-class support for rendering to multiple windows from a single `SDL_GPUDevice`. This is useful for game editors with viewport + inspector windows, local multiplayer with per-player windows, debug overlays, and tool windows alongside the main game view. This guide covers how to claim multiple windows, manage per-window swapchains, and structure your render loop for multi-window FNA games.

---

## When Multi-Window Matters

XNA and MonoGame historically bind one `GraphicsDevice` to one window. Workarounds like render-to-texture piped through a secondary form exist but are fragile. SDL3's GPU API solves this cleanly: a single `SDL_GPUDevice` can own swapchains for multiple `SDL_Window` handles simultaneously.

Common use cases in game development:

- **Level editors** — main viewport + property inspector + asset browser, each in its own window
- **Split-screen debug** — each player's view in a separate OS window for easier debugging
- **Performance monitors** — a secondary window showing frame timing, draw calls, and memory graphs
- **Shader preview** — hot-reload shader edits visible in a dedicated window

---

## Claiming Windows for the GPU Device

Each window that receives GPU rendering must be "claimed" by the device. This binds a swapchain to that window.

```csharp
using SDL3;

// Create the GPU device (done once)
IntPtr gpuDevice = SDL.SDL_CreateGPUDevice(
    SDL.SDL_GPUShaderFormat.SDL_GPU_SHADERFORMAT_SPIRV |
    SDL.SDL_GPUShaderFormat.SDL_GPU_SHADERFORMAT_DXIL |
    SDL.SDL_GPUShaderFormat.SDL_GPU_SHADERFORMAT_MSL,
    debugMode: true,
    name: null  // Let SDL pick the best backend
);

// Create the main game window
IntPtr mainWindow = SDL.SDL_CreateWindow(
    "My Game",
    1280, 720,
    SDL.SDL_WindowFlags.SDL_WINDOW_RESIZABLE
);

// Create a secondary debug window
IntPtr debugWindow = SDL.SDL_CreateWindow(
    "Debug View",
    640, 480,
    SDL.SDL_WindowFlags.SDL_WINDOW_RESIZABLE
);

// Claim both windows — each gets its own swapchain
if (!SDL.SDL_ClaimWindowForGPUDevice(gpuDevice, mainWindow))
    throw new Exception($"Failed to claim main window: {SDL.SDL_GetError()}");

if (!SDL.SDL_ClaimWindowForGPUDevice(gpuDevice, debugWindow))
    throw new Exception($"Failed to claim debug window: {SDL.SDL_GetError()}");
```

### Swapchain Configuration

By default, claimed windows use SDR composition and VSync presentation. Override per-window:

```csharp
// Configure the debug window for immediate presentation (no VSync)
SDL.SDL_SetGPUSwapchainParameters(
    gpuDevice,
    debugWindow,
    SDL.SDL_GPUSwapchainComposition.SDL_GPU_SWAPCHAINCOMPOSITION_SDR,
    SDL.SDL_GPUPresentMode.SDL_GPU_PRESENTMODE_IMMEDIATE
);
```

Available present modes:

| Mode | Behavior | Use case |
|------|----------|----------|
| `VSYNC` | Wait for vertical blank | Main game window |
| `IMMEDIATE` | Present immediately, may tear | Debug/tool windows |
| `MAILBOX` | Triple-buffered, lowest latency VSync | Performance-sensitive game window |

---

## Multi-Window Render Loop

The render loop must acquire swapchain textures for each window separately. Each window's rendering is bracketed by its own command buffer submit + present cycle.

```csharp
while (running)
{
    // Poll events for all windows
    while (SDL.SDL_PollEvent(out SDL.SDL_Event e))
    {
        if (e.type == SDL.SDL_EventType.SDL_EVENT_QUIT)
            running = false;

        if (e.type == SDL.SDL_EventType.SDL_EVENT_WINDOW_CLOSE_REQUESTED)
        {
            uint windowId = e.window.windowID;
            IntPtr closedWindow = SDL.SDL_GetWindowFromID(windowId);

            if (closedWindow == debugWindow)
            {
                SDL.SDL_ReleaseWindowFromGPUDevice(gpuDevice, debugWindow);
                SDL.SDL_DestroyWindow(debugWindow);
                debugWindow = IntPtr.Zero;
            }
            else if (closedWindow == mainWindow)
            {
                running = false;
            }
        }
    }

    // --- Render main window ---
    RenderToWindow(gpuDevice, mainWindow, RenderMainScene);

    // --- Render debug window (if still open) ---
    if (debugWindow != IntPtr.Zero)
        RenderToWindow(gpuDevice, debugWindow, RenderDebugView);
}

void RenderToWindow(IntPtr device, IntPtr window, Action<IntPtr, IntPtr> renderFunc)
{
    IntPtr cmdBuf = SDL.SDL_AcquireGPUCommandBuffer(device);

    uint swapW, swapH;
    IntPtr swapchainTex;

    if (!SDL.SDL_AcquireGPUSwapchainTexture(cmdBuf, window, out swapchainTex, out swapW, out swapH))
    {
        // Window minimized or swapchain not ready — skip this frame
        SDL.SDL_SubmitGPUCommandBuffer(cmdBuf);
        return;
    }

    if (swapchainTex == IntPtr.Zero)
    {
        SDL.SDL_SubmitGPUCommandBuffer(cmdBuf);
        return;
    }

    renderFunc(cmdBuf, swapchainTex);

    SDL.SDL_SubmitGPUCommandBuffer(cmdBuf);
}
```

---

## Render Functions Per Window

Each window can have completely different rendering logic:

```csharp
void RenderMainScene(IntPtr cmdBuf, IntPtr swapchainTex)
{
    var colorTargetInfo = new SDL.SDL_GPUColorTargetInfo
    {
        texture = swapchainTex,
        clear_color = new SDL.SDL_FColor { r = 0.1f, g = 0.1f, b = 0.15f, a = 1.0f },
        load_op = SDL.SDL_GPULoadOp.SDL_GPU_LOADOP_CLEAR,
        store_op = SDL.SDL_GPUStoreOp.SDL_GPU_STOREOP_STORE
    };

    IntPtr renderPass = SDL.SDL_BeginGPURenderPass(cmdBuf, ref colorTargetInfo, 1, IntPtr.Zero);

    // Bind your game's pipeline, vertex buffers, draw calls...
    // DrawWorld(renderPass);
    // DrawEntities(renderPass);
    // DrawUI(renderPass);

    SDL.SDL_EndGPURenderPass(renderPass);
}

void RenderDebugView(IntPtr cmdBuf, IntPtr swapchainTex)
{
    var colorTargetInfo = new SDL.SDL_GPUColorTargetInfo
    {
        texture = swapchainTex,
        clear_color = new SDL.SDL_FColor { r = 0.0f, g = 0.0f, b = 0.0f, a = 1.0f },
        load_op = SDL.SDL_GPULoadOp.SDL_GPU_LOADOP_CLEAR,
        store_op = SDL.SDL_GPUStoreOp.SDL_GPU_STOREOP_STORE
    };

    IntPtr renderPass = SDL.SDL_BeginGPURenderPass(cmdBuf, ref colorTargetInfo, 1, IntPtr.Zero);

    // Draw debug visualizations: wireframes, collision shapes, frame graphs
    // DrawCollisionDebug(renderPass);
    // DrawFrameTimeGraph(renderPass);

    SDL.SDL_EndGPURenderPass(renderPass);
}
```

---

## Window Lifecycle Management

Windows can be created and destroyed at runtime. Always release a window from the GPU device before destroying it:

```csharp
public class WindowManager : IDisposable
{
    private readonly IntPtr _device;
    private readonly List<IntPtr> _windows = new();

    public WindowManager(IntPtr gpuDevice) => _device = gpuDevice;

    public IntPtr CreateWindow(string title, int width, int height)
    {
        IntPtr window = SDL.SDL_CreateWindow(title, width, height, 0);
        if (window == IntPtr.Zero)
            throw new Exception($"SDL_CreateWindow failed: {SDL.SDL_GetError()}");

        if (!SDL.SDL_ClaimWindowForGPUDevice(_device, window))
        {
            SDL.SDL_DestroyWindow(window);
            throw new Exception($"SDL_ClaimWindowForGPUDevice failed: {SDL.SDL_GetError()}");
        }

        _windows.Add(window);
        return window;
    }

    public void DestroyWindow(IntPtr window)
    {
        SDL.SDL_ReleaseWindowFromGPUDevice(_device, window);
        SDL.SDL_DestroyWindow(window);
        _windows.Remove(window);
    }

    public void Dispose()
    {
        foreach (var w in _windows.ToArray())
            DestroyWindow(w);
    }
}
```

---

## Sharing Resources Across Windows

A single `SDL_GPUDevice` means all GPU resources (textures, buffers, pipelines, shaders) are shared across windows. You do not need to duplicate assets:

```csharp
// Create a texture once — usable in any window's render pass
IntPtr sharedTexture = CreateTexture(gpuDevice, "player_sprite.png");

// Create a pipeline once — bind it in any render pass
IntPtr sharedPipeline = CreateGraphicsPipeline(gpuDevice, vertShader, fragShader);

// Both windows can use the same resources
void RenderMainScene(IntPtr cmdBuf, IntPtr swapTex)
{
    // ... begin render pass ...
    SDL.SDL_BindGPUGraphicsPipeline(renderPass, sharedPipeline);
    // ... draw with sharedTexture ...
}

void RenderDebugView(IntPtr cmdBuf, IntPtr swapTex)
{
    // Same pipeline, different draw calls
    SDL.SDL_BindGPUGraphicsPipeline(renderPass, sharedPipeline);
    // ... draw wireframe overlay using same vertex data ...
}
```

This is a major advantage over approaches that use separate `GraphicsDevice` instances per window — no texture re-upload, no shader re-compilation.

---

## Threading Considerations

- **Window claiming must happen on the thread that created the window.** Do not call `SDL_ClaimWindowForGPUDevice` from a worker thread for a window created on the main thread.
- **Command buffers are thread-safe to acquire** but each command buffer should be built and submitted from a single thread.
- **Swapchain acquisition is per-window** — you can acquire swapchain textures for different windows from different threads, but each window's acquire → render → submit must be sequential.

For most games, the simplest approach is single-threaded: render all windows in sequence on the main thread. The GPU work overlaps naturally since submit is non-blocking.

---

## FNA Integration Notes

When using multi-window rendering in an FNA game, keep in mind:

- FNA's `Game` class manages one primary window. For additional windows, create them directly via SDL3 bindings (`SDL3.SDL`) rather than through FNA's `GameWindow`.
- The primary `Game.Window` is automatically claimed. Additional windows need manual claiming.
- FNA's `SpriteBatch` draws to whatever render target is currently set. For secondary windows, you typically render to a `RenderTarget2D` in FNA-land, then blit that texture using SDL3 GPU commands in the secondary window's render pass.
- Alternatively, for fully custom secondary windows (debug views, editors), bypass FNA's rendering entirely and use raw SDL3 GPU calls.

---

## Summary

| Aspect | Details |
|--------|---------|
| Window claiming | `SDL_ClaimWindowForGPUDevice` per window |
| Resource sharing | All GPU resources shared via single device |
| Present modes | Per-window VSync/Immediate/Mailbox |
| Lifecycle | Release + destroy when closing secondary windows |
| Threading | Claim on creating thread; submit sequentially per window |
| FNA integration | Primary window via FNA, secondary via raw SDL3 |
