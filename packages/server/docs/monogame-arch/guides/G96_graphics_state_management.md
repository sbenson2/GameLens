# G96 — Graphics State Management

> **Category:** guide · **Engine:** MonoGame · **Related:** [G2 Rendering & Graphics](./G2_rendering_and_graphics.md) · [G27 Shaders & Effects](./G27_shaders_and_effects.md) · [G33 Profiling & Optimization](./G33_profiling_optimization.md) · [G89 Post-Processing Pipeline](./G89_post_processing_pipeline.md) · [G95 Render Target Management](./G95_render_target_management.md)

How to manage `GraphicsDevice` render state in MonoGame — BlendState, DepthStencilState, RasterizerState, and SamplerState. Covers the built-in presets, creating custom states, avoiding common bugs (mutating bound states, scissor test gotchas), and structuring state changes for minimal GPU overhead.

---

## The Four State Objects

Every draw call in MonoGame is affected by four state objects set on the `GraphicsDevice`. Understanding what each controls is essential for correct rendering.

| State Object | Controls | Common Use |
|-------------|----------|------------|
| `BlendState` | How pixel shader output blends with the existing framebuffer | Transparency, additive particles, multiply blending |
| `DepthStencilState` | Depth testing and stencil buffer operations | 3D depth sorting, stencil masking, portal rendering |
| `RasterizerState` | Triangle rasterization: culling, fill mode, scissor test | Wireframe debug, disabling backface cull, scissor clipping |
| `SamplerState` | Texture filtering and address mode | Pixel-art point filtering, tiling textures, anisotropic filtering |

---

## Built-In Presets

MonoGame provides static readonly presets for each state type. Use these whenever possible — they are shared singleton instances that avoid allocating new GPU state objects.

### BlendState

```csharp
BlendState.Opaque            // No blending — fastest, use for opaque geometry
BlendState.AlphaBlend        // Standard alpha blending (pre-multiplied alpha)
BlendState.NonPremultiplied  // Alpha blending for non-premultiplied textures
BlendState.Additive          // Additive blending — particles, glows, lasers
```

> **Pre-multiplied vs. non-premultiplied:** The MonoGame Content Pipeline outputs pre-multiplied alpha textures by default. Use `BlendState.AlphaBlend` with these. If you load raw PNG files with `Texture2D.FromStream()`, the alpha is non-premultiplied — use `BlendState.NonPremultiplied` or convert to pre-multiplied on load.

### DepthStencilState

```csharp
DepthStencilState.Default   // Depth read + write enabled (3D default)
DepthStencilState.DepthRead // Read-only depth test, no writes (transparent 3D)
DepthStencilState.None      // No depth test at all (2D default, SpriteBatch)
```

### RasterizerState

```csharp
RasterizerState.CullNone             // No backface culling (2D, double-sided)
RasterizerState.CullClockwise        // Cull clockwise faces (MonoGame default)
RasterizerState.CullCounterClockwise // Cull counter-clockwise faces
```

### SamplerState

```csharp
SamplerState.PointClamp      // Nearest-neighbor, no tiling — pixel art
SamplerState.PointWrap        // Nearest-neighbor, wrap — tiling pixel art
SamplerState.LinearClamp      // Bilinear filter, no tiling — smooth scaling
SamplerState.LinearWrap       // Bilinear filter, wrap — tiling textures
SamplerState.AnisotropicClamp // Anisotropic filter, no tiling — 3D textures at angles
SamplerState.AnisotropicWrap  // Anisotropic filter, wrap
```

---

## Setting State via SpriteBatch

`SpriteBatch.Begin()` accepts all four state objects. This is the primary way 2D games configure render state.

```csharp
// Standard 2D pixel art rendering
_spriteBatch.Begin(
    sortMode: SpriteSortMode.Deferred,
    blendState: BlendState.AlphaBlend,
    samplerState: SamplerState.PointClamp,
    depthStencilState: DepthStencilState.None,
    rasterizerState: RasterizerState.CullNone);
```

If you pass `null` for any state parameter, SpriteBatch uses its defaults:

| Parameter | SpriteBatch Default |
|-----------|-------------------|
| `blendState` | `BlendState.AlphaBlend` |
| `samplerState` | `SamplerState.LinearClamp` |
| `depthStencilState` | `DepthStencilState.None` |
| `rasterizerState` | `RasterizerState.CullCounterClockwise` |

> **Gotcha:** The default sampler is `LinearClamp`, not `PointClamp`. Pixel-art games must always pass `SamplerState.PointClamp` explicitly, or sprites will appear blurry when scaled.

---

## Creating Custom States

When built-in presets are not enough, create a custom state. Custom states must be created once (typically in `LoadContent`) and reused — do not create them per frame.

### Custom BlendState: Multiply Blending

```csharp
/// <summary>
/// Multiply blend — darkens the destination by the source color.
/// Useful for lighting overlays: draw a dark texture over the scene
/// to simulate shadows or ambient lighting.
/// </summary>
private static readonly BlendState MultiplyBlend = new BlendState
{
    ColorSourceBlend = Blend.DestinationColor,
    ColorDestinationBlend = Blend.Zero,
    ColorBlendFunction = BlendFunction.Add,
    AlphaSourceBlend = Blend.DestinationAlpha,
    AlphaDestinationBlend = Blend.Zero,
    AlphaBlendFunction = BlendFunction.Add,
};
```

### Custom RasterizerState: Scissor Test

The scissor test clips rendering to a rectangle — useful for UI panels, scroll regions, and viewports.

```csharp
/// <summary>
/// Rasterizer state with scissor test enabled.
/// Set GraphicsDevice.ScissorRectangle before drawing.
/// </summary>
private static readonly RasterizerState ScissorEnabled = new RasterizerState
{
    CullMode = CullMode.None,
    ScissorTestEnable = true,
};
```

Usage:

```csharp
// Clip rendering to a 200×150 panel at position (50, 80)
GraphicsDevice.ScissorRectangle = new Rectangle(50, 80, 200, 150);

_spriteBatch.Begin(
    rasterizerState: ScissorEnabled,
    samplerState: SamplerState.PointClamp);
DrawScrollableContent();
_spriteBatch.End();
```

### Custom SamplerState: Wrapping Tile Background

```csharp
/// <summary>
/// Point-filtered wrapping — for scrolling tile backgrounds drawn
/// as a single large quad with UV coordinates > 1.0.
/// </summary>
private static readonly SamplerState TileWrap = new SamplerState
{
    Filter = TextureFilter.Point,
    AddressU = TextureAddressMode.Wrap,
    AddressV = TextureAddressMode.Wrap,
};
```

---

## Common Bugs and Fixes

### 1. Mutating a Bound State

State objects become immutable once bound to the `GraphicsDevice`. Attempting to modify a bound state throws an `InvalidOperationException`.

```csharp
// ❌ Throws: state is already bound
GraphicsDevice.BlendState = BlendState.AlphaBlend;
BlendState.AlphaBlend.ColorSourceBlend = Blend.One; // InvalidOperationException

// ✅ Create a new custom state instead
var customBlend = new BlendState { ColorSourceBlend = Blend.One, /* ... */ };
GraphicsDevice.BlendState = customBlend;
```

### 2. SpriteBatch Overwriting Your States

`SpriteBatch.Begin()` sets all four states when called, and `SpriteBatch.End()` does **not** restore previous states. If you interleave SpriteBatch calls with custom 3D rendering, the 3D state will be overwritten.

```csharp
// ❌ 3D states are clobbered after SpriteBatch.End()
Draw3DScene();                   // sets depth, cull, etc.
_spriteBatch.Begin(); /* ... */  // overwrites all 4 states
_spriteBatch.End();
Draw3DScene();                   // wrong states!

// ✅ Restore states explicitly after SpriteBatch
_spriteBatch.End();
GraphicsDevice.BlendState = BlendState.Opaque;
GraphicsDevice.DepthStencilState = DepthStencilState.Default;
GraphicsDevice.RasterizerState = RasterizerState.CullClockwise;
GraphicsDevice.SamplerStates[0] = SamplerState.LinearWrap;
Draw3DScene(); // correct states
```

### 3. Sampler State on Wrong Slot

`SpriteBatch` uses sampler slot 0. If your shader samples multiple textures, set additional sampler states on higher slots:

```csharp
// Main texture uses slot 0 (set by SpriteBatch)
// Normal map uses slot 1
GraphicsDevice.SamplerStates[1] = SamplerState.LinearClamp;
```

---

## State Change Minimization

Each state change triggers driver work. For best performance, sort draw calls to minimize state transitions.

### Sorting Strategy (2D)

1. **By blend state** — group all opaque draws first (`BlendState.Opaque`), then all alpha-blended draws. Opaque draws are cheaper and can write depth.
2. **By texture** — within a blend group, sort by texture to maximize SpriteBatch batching (fewer draw calls).
3. **By depth** — within a texture group, sort front-to-back for opaque (early depth rejection) or back-to-front for transparent (correct blending order).

### SpriteBatch Sort Modes

`SpriteSortMode` in `SpriteBatch.Begin()` controls when and how sprites are sorted:

```csharp
SpriteSortMode.Deferred         // Draw in submission order (one batch)
SpriteSortMode.Immediate        // Draw each sprite immediately (custom state per sprite)
SpriteSortMode.Texture          // Sort by texture to reduce draw calls
SpriteSortMode.BackToFront      // Sort by layer depth, back-to-front (transparency)
SpriteSortMode.FrontToBack      // Sort by layer depth, front-to-back (early-Z)
```

> **Recommendation:** Use `SpriteSortMode.Deferred` (default) for most 2D games. Switch to `SpriteSortMode.Texture` when you have many sprites from different textures and draw order does not matter. Use `BackToFront` only when you need manual depth sorting with transparency.

---

## State Snapshot Helper

For complex rendering pipelines that interleave 2D and 3D, a snapshot/restore utility prevents state corruption.

```csharp
/// <summary>
/// Captures and restores GraphicsDevice render state.
/// Use around SpriteBatch or effect passes that modify state.
/// </summary>
public readonly struct GraphicsStateSnapshot
{
    private readonly GraphicsDevice _device;
    private readonly BlendState _blend;
    private readonly DepthStencilState _depth;
    private readonly RasterizerState _rasterizer;
    private readonly SamplerState _sampler0;

    public GraphicsStateSnapshot(GraphicsDevice device)
    {
        _device = device;
        _blend = device.BlendState;
        _depth = device.DepthStencilState;
        _rasterizer = device.RasterizerState;
        _sampler0 = device.SamplerStates[0];
    }

    /// <summary>
    /// Restore all captured states to the GraphicsDevice.
    /// </summary>
    public void Restore()
    {
        _device.BlendState = _blend;
        _device.DepthStencilState = _depth;
        _device.RasterizerState = _rasterizer;
        _device.SamplerStates[0] = _sampler0;
    }
}
```

Usage:

```csharp
var snapshot = new GraphicsStateSnapshot(GraphicsDevice);

_spriteBatch.Begin(/* UI states */);
DrawUI();
_spriteBatch.End();

snapshot.Restore(); // back to 3D states
```

---

## Quick Reference: Choosing States

| Scenario | Blend | Depth | Rasterizer | Sampler |
|----------|-------|-------|-----------|---------|
| Pixel art (opaque) | `Opaque` | `None` | `CullNone` | `PointClamp` |
| Pixel art (transparent) | `AlphaBlend` | `None` | `CullNone` | `PointClamp` |
| Additive particles | `Additive` | `None` | `CullNone` | `PointClamp` |
| HD sprites (smooth) | `AlphaBlend` | `None` | `CullNone` | `LinearClamp` |
| 3D opaque | `Opaque` | `Default` | `CullClockwise` | `LinearWrap` |
| 3D transparent | `AlphaBlend` | `DepthRead` | `CullNone` | `LinearClamp` |
| Shadow/light overlay | `MultiplyBlend` | `None` | `CullNone` | `LinearClamp` |
| UI with scissor clip | `AlphaBlend` | `None` | `ScissorEnabled` | `PointClamp` |
