# G95 — Render Target Management & Off-Screen Rendering

> **Category:** guide · **Engine:** MonoGame · **Related:** [G2 Rendering & Graphics](./G2_rendering_and_graphics.md) · [G19 Display Resolution & Viewports](./G19_display_resolution_viewports.md) · [G20 Camera Systems](./G20_camera_systems.md) · [G27 Shaders & Effects](./G27_shaders_and_effects.md) · [G58 Minimap](./G58_minimap.md) · [G89 Post-Processing Pipeline](./G89_post_processing_pipeline.md) · [G94 Runtime Texture Atlas](./G94_runtime_texture_atlas.md)

How to manage `RenderTarget2D` objects in MonoGame for off-screen rendering scenarios: minimaps, split-screen, resolution-independent rendering, UI compositing, and dynamic texture generation. Covers lifecycle management, common pitfalls (auto-clearing, depth buffer sharing), and a reusable render target pool.

---

## Why Render Targets?

`SpriteBatch` draws to the back buffer by default. A `RenderTarget2D` redirects GPU output to an off-screen texture you control. This enables:

- **Resolution-independent rendering** — draw at a fixed logical resolution, scale to any window size.
- **Minimaps** — render the world from a zoomed-out camera, draw the result as a HUD element.
- **Split-screen** — render each player's camera to its own target, composite to the back buffer.
- **Dynamic textures** — procedurally generate textures at runtime (fog of war masks, light maps).
- **Layer compositing** — render game world and UI to separate targets, blend them with effects.

Without a structured approach, render target code becomes a tangle of `SetRenderTarget` calls and subtle bugs.

---

## RenderTarget2D Lifecycle

### Creation

Create render targets after the `GraphicsDevice` is ready — typically in `LoadContent` or when handling a window resize.

```csharp
/// <summary>
/// Create a render target sized to the back buffer.
/// PreferredMultiSampleCount: 0 = no MSAA (fastest for 2D).
/// RenderTargetUsage.DiscardContents: tells the GPU it can discard
/// the old contents when the target is rebound — avoids a costly
/// resolve on some platforms (mobile, consoles).
/// </summary>
private RenderTarget2D CreateFullScreenTarget()
{
    var pp = GraphicsDevice.PresentationParameters;
    return new RenderTarget2D(
        GraphicsDevice,
        pp.BackBufferWidth,
        pp.BackBufferHeight,
        mipMap: false,
        preferredFormat: pp.BackBufferFormat,
        preferredDepthFormat: DepthFormat.None,
        preferredMultiSampleCount: 0,
        usage: RenderTargetUsage.DiscardContents);
}
```

### Disposal

Render targets hold GPU memory. Dispose them when no longer needed and on window resize (then recreate at the new size).

```csharp
private void OnClientSizeChanged(object sender, EventArgs e)
{
    _sceneTarget?.Dispose();
    _sceneTarget = CreateFullScreenTarget();
}
```

### The SetRenderTarget Pattern

Every off-screen render follows the same three-step pattern:

```csharp
// Step 1: Redirect drawing to the render target
GraphicsDevice.SetRenderTarget(_minimapTarget);
GraphicsDevice.Clear(Color.Transparent);

// Step 2: Draw scene content
_spriteBatch.Begin(/* minimap camera transform */);
DrawWorldMinimap();
_spriteBatch.End();

// Step 3: Restore the back buffer
GraphicsDevice.SetRenderTarget(null);
```

> **Critical:** Always call `SetRenderTarget(null)` before `Present()`. Presenting while a render target is bound is undefined behavior on some platforms.

---

## Common Pitfalls

### 1. Auto-Clearing on Bind

When you call `SetRenderTarget(target)`, MonoGame clears the target **unless** you created it with `RenderTargetUsage.PreserveContents`. This catches beginners who draw to a target in multiple passes:

```csharp
// ❌ Bug: second SetRenderTarget clears the first draw
GraphicsDevice.SetRenderTarget(_target);
DrawBackground();
GraphicsDevice.SetRenderTarget(null); // unbind

GraphicsDevice.SetRenderTarget(_target); // clears!
DrawForeground();
GraphicsDevice.SetRenderTarget(null);

// ✅ Fix: draw everything in one bind, or use PreserveContents
GraphicsDevice.SetRenderTarget(_target);
DrawBackground();
DrawForeground();
GraphicsDevice.SetRenderTarget(null);
```

`PreserveContents` has a performance cost (GPU must resolve the target before rebinding), so prefer drawing everything in a single bind when possible.

### 2. Depth Buffer Sharing

If two render targets share the same dimensions and depth format, MonoGame may share the same depth-stencil buffer between them. Switching targets mid-frame can produce depth artifacts.

```csharp
// ✅ If targets need independent depth, use different sizes
// or explicitly create with different DepthFormats
var worldTarget = new RenderTarget2D(device, 1920, 1080,
    false, SurfaceFormat.Color, DepthFormat.Depth24Stencil8);

var uiTarget = new RenderTarget2D(device, 1920, 1080,
    false, SurfaceFormat.Color, DepthFormat.None); // no depth needed
```

### 3. Reading Back Pixel Data

`RenderTarget2D.GetData<T>()` forces a GPU → CPU sync and stalls the pipeline. Never use it per-frame for gameplay logic. If you need to read pixels (e.g., mouse picking), do it once and cache the result, or use a 1×1 render target for single-pixel queries.

---

## Resolution-Independent Rendering

A common pattern is to render the entire game at a fixed logical resolution and scale the result to fit the window. This gives pixel-perfect rendering regardless of display size.

```csharp
public class ResolutionScaler
{
    private readonly GraphicsDevice _device;
    private RenderTarget2D _gameTarget;

    /// <summary>Logical resolution the game is designed for.</summary>
    public readonly int LogicalWidth;
    public readonly int LogicalHeight;

    public ResolutionScaler(GraphicsDevice device, int logicalW, int logicalH)
    {
        _device = device;
        LogicalWidth = logicalW;
        LogicalHeight = logicalH;
        Recreate();
    }

    public void Recreate()
    {
        _gameTarget?.Dispose();
        _gameTarget = new RenderTarget2D(
            _device, LogicalWidth, LogicalHeight,
            false, SurfaceFormat.Color, DepthFormat.None,
            0, RenderTargetUsage.DiscardContents);
    }

    /// <summary>
    /// Call before drawing game content. Redirects to the logical-size target.
    /// </summary>
    public void BeginScene()
    {
        _device.SetRenderTarget(_gameTarget);
        _device.Clear(Color.Black);
    }

    /// <summary>
    /// Call after drawing game content. Scales the result to the back buffer
    /// using integer or fit scaling.
    /// </summary>
    public void EndScene(SpriteBatch batch)
    {
        _device.SetRenderTarget(null);
        _device.Clear(Color.Black); // letterbox color

        // Calculate scale to fit while maintaining aspect ratio
        float scaleX = (float)_device.PresentationParameters.BackBufferWidth / LogicalWidth;
        float scaleY = (float)_device.PresentationParameters.BackBufferHeight / LogicalHeight;
        float scale = Math.Min(scaleX, scaleY);

        // For pixel art, snap to integer scale
        // scale = MathF.Floor(scale);

        var destW = (int)(LogicalWidth * scale);
        var destH = (int)(LogicalHeight * scale);
        var destX = (_device.PresentationParameters.BackBufferWidth - destW) / 2;
        var destY = (_device.PresentationParameters.BackBufferHeight - destH) / 2;

        batch.Begin(samplerState: SamplerState.PointClamp);
        batch.Draw(_gameTarget, new Rectangle(destX, destY, destW, destH), Color.White);
        batch.End();
    }

    public void Dispose() => _gameTarget?.Dispose();
}
```

### Usage in Game

```csharp
private ResolutionScaler _scaler;

protected override void LoadContent()
{
    _scaler = new ResolutionScaler(GraphicsDevice, 320, 180);
}

protected override void Draw(GameTime gameTime)
{
    _scaler.BeginScene();

    // All game drawing happens at 320×180
    _spriteBatch.Begin(samplerState: SamplerState.PointClamp);
    DrawWorld();
    DrawEntities();
    _spriteBatch.End();

    _scaler.EndScene(_spriteBatch);
}
```

---

## Split-Screen Pattern

Render each player's view to its own render target, then composite them to the back buffer.

```csharp
private RenderTarget2D _player1View;
private RenderTarget2D _player2View;

protected override void LoadContent()
{
    int halfW = GraphicsDevice.PresentationParameters.BackBufferWidth / 2;
    int fullH = GraphicsDevice.PresentationParameters.BackBufferHeight;

    _player1View = new RenderTarget2D(GraphicsDevice, halfW, fullH);
    _player2View = new RenderTarget2D(GraphicsDevice, halfW, fullH);
}

protected override void Draw(GameTime gameTime)
{
    // Player 1 view
    GraphicsDevice.SetRenderTarget(_player1View);
    GraphicsDevice.Clear(Color.CornflowerBlue);
    DrawWorldFromCamera(_player1Camera);

    // Player 2 view
    GraphicsDevice.SetRenderTarget(_player2View);
    GraphicsDevice.Clear(Color.CornflowerBlue);
    DrawWorldFromCamera(_player2Camera);

    // Composite to back buffer
    GraphicsDevice.SetRenderTarget(null);
    GraphicsDevice.Clear(Color.Black);

    _spriteBatch.Begin(samplerState: SamplerState.PointClamp);
    _spriteBatch.Draw(_player1View, new Rectangle(0, 0, _player1View.Width, _player1View.Height), Color.White);
    _spriteBatch.Draw(_player2View, new Rectangle(_player1View.Width, 0, _player2View.Width, _player2View.Height), Color.White);
    _spriteBatch.End();
}
```

---

## Render Target Pool

For effects pipelines and dynamic systems that need many temporary render targets, a pool avoids allocation churn.

```csharp
/// <summary>
/// Pools RenderTarget2D objects by size to avoid per-frame allocation.
/// Targets are leased for a frame and returned automatically.
/// </summary>
public class RenderTargetPool : IDisposable
{
    private readonly GraphicsDevice _device;
    private readonly Dictionary<(int w, int h, SurfaceFormat fmt), Stack<RenderTarget2D>> _pool = new();
    private readonly List<RenderTarget2D> _inUse = new();

    public RenderTargetPool(GraphicsDevice device) => _device = device;

    /// <summary>
    /// Get a render target of the requested size. Returns a pooled
    /// instance if available, otherwise creates a new one.
    /// </summary>
    public RenderTarget2D Rent(int width, int height,
        SurfaceFormat format = SurfaceFormat.Color)
    {
        var key = (width, height, format);
        if (_pool.TryGetValue(key, out var stack) && stack.Count > 0)
        {
            var rt = stack.Pop();
            _inUse.Add(rt);
            return rt;
        }

        var newRt = new RenderTarget2D(_device, width, height,
            false, format, DepthFormat.None, 0,
            RenderTargetUsage.DiscardContents);
        _inUse.Add(newRt);
        return newRt;
    }

    /// <summary>
    /// Return all rented targets to the pool. Call once per frame
    /// after all rendering is complete.
    /// </summary>
    public void ReturnAll()
    {
        foreach (var rt in _inUse)
        {
            var key = (rt.Width, rt.Height, rt.Format);
            if (!_pool.TryGetValue(key, out var stack))
            {
                stack = new Stack<RenderTarget2D>();
                _pool[key] = stack;
            }
            stack.Push(rt);
        }
        _inUse.Clear();
    }

    /// <summary>
    /// Dispose all pooled targets. Call on window resize or shutdown.
    /// </summary>
    public void Dispose()
    {
        foreach (var stack in _pool.Values)
            foreach (var rt in stack)
                rt.Dispose();
        _pool.Clear();

        foreach (var rt in _inUse)
            rt.Dispose();
        _inUse.Clear();
    }
}
```

---

## Performance Guidelines

| Guideline | Why |
|-----------|-----|
| Use `RenderTargetUsage.DiscardContents` | Avoids resolve overhead on tile-based GPUs (mobile) |
| Match back buffer format | Prevents format conversion on composite |
| Minimize target count per frame | Each SetRenderTarget has driver overhead |
| Pool temporary targets | Avoids GC pressure from allocation/disposal churn |
| Avoid `GetData<T>()` per frame | Forces GPU–CPU sync stall |
| Dispose on resize + recreate | GPU memory is not automatically reclaimed |
| Use `DepthFormat.None` when depth is not needed | Saves VRAM and avoids depth buffer sharing issues |

---

## When to Use Render Targets vs. Viewports

MonoGame also supports `GraphicsDevice.Viewport` for rendering to a sub-region of the current target. The trade-offs:

- **Viewports** — cheaper (no extra GPU memory), but you cannot apply post-effects to the sub-region independently and you share the depth buffer.
- **Render targets** — each target is an independent texture you can shader-process, sample, or composite freely.

Use viewports for simple HUD regions. Use render targets when you need independent processing (post-effects, different resolutions, sampling as a texture).
