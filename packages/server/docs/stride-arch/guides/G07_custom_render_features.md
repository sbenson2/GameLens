# G07 — Custom Render Features

> **Category:** guide · **Engine:** Stride · **Related:** [G01 Getting Started](./G01_getting_started.md) · [G04 SDSL Shader Development](./G04_sdsl_shader_development.md) · [G03 Code-Only Development](./G03_code_only_development.md)

How to extend Stride's rendering pipeline by creating custom `RootRenderFeature` and `RenderObject` classes. Covers the four-phase rendering architecture (Collect, Extract, Prepare, Draw), registering custom render features in the Graphics Compositor, and practical examples for rendering custom geometry outside the standard mesh/sprite pipeline.

---

## When You Need a Custom Render Feature

Stride's built-in render features handle meshes, sprites, particles, UI, and post-processing. You need a custom render feature when:

- Rendering procedural geometry (debug shapes, wire grids, line renderers)
- Implementing a custom rendering technique (voxels, signed distance fields, instanced foliage)
- Drawing to a render target with a non-standard pipeline
- Adding a rendering pass that doesn't fit the material/mesh model

If your need is a post-processing effect applied to the final image, use the built-in post-processing stack instead. Custom render features are for injecting entirely new geometry or draw calls into the pipeline.

---

## Architecture: The Four Phases

Stride's rendering pipeline processes all render features through four sequential phases. Each phase can be parallelized across features.

```
┌──────────┐   ┌──────────┐   ┌──────────┐   ┌──────────┐
│ Collect   │──▶│ Extract  │──▶│ Prepare  │──▶│  Draw    │
│           │   │          │   │          │   │          │
│ Gather    │   │ Copy     │   │ Sort,    │   │ Issue    │
│ visible   │   │ data to  │   │ batch,   │   │ GPU draw │
│ objects   │   │ render   │   │ upload   │   │ calls    │
│           │   │ thread   │   │ buffers  │   │          │
└──────────┘   └──────────┘   └──────────┘   └──────────┘
```

| Phase | Method Override | Purpose |
|-------|----------------|---------|
| **Collect** | `Collect()` | Gather visible `RenderObject` instances from the scene. The visibility system culls objects against the camera frustum. |
| **Extract** | `Extract()` | Copy per-frame data from game-thread objects to render-thread data structures. This is where you snapshot transform matrices, colors, etc. |
| **Prepare** | `Prepare()` | Sort render objects, set up GPU buffers, compute per-draw parameters. Runs on the render thread. |
| **Draw** | `Draw()` | Issue actual GPU draw calls using the prepared data. |

---

## Step 1: Define a Custom RenderObject

A `RenderObject` is the minimal unit that the render system tracks. Your custom render feature processes your custom render object type.

```csharp
using Stride.Rendering;

/// <summary>
/// A render object representing a custom debug line to be drawn.
/// One instance per visible debug line in the scene.
/// </summary>
public class RenderDebugLine : RenderObject
{
    /// <summary>World-space start point of the line.</summary>
    public Vector3 Start;

    /// <summary>World-space end point of the line.</summary>
    public Vector3 End;

    /// <summary>Line color.</summary>
    public Color4 Color;

    /// <summary>Line width in pixels.</summary>
    public float Width;
}
```

---

## Step 2: Create a Component to Attach to Entities

The component lives on entities in the scene and feeds data into the render object.

```csharp
using Stride.Engine;
using Stride.Engine.Design;
using Stride.Core;
using Stride.Core.Mathematics;

/// <summary>
/// Attach to an entity to draw a debug line from this entity
/// to a target position. The line is rendered by DebugLineRenderFeature.
/// </summary>
[DataContract("DebugLineComponent")]
[DefaultEntityComponentRenderer(typeof(DebugLineRenderProcessor))]
public class DebugLineComponent : EntityComponent
{
    /// <summary>Target endpoint in world space.</summary>
    public Vector3 Target { get; set; }

    /// <summary>Line color (default: green).</summary>
    public Color4 Color { get; set; } = new Color4(0f, 1f, 0f, 1f);

    /// <summary>Line width in pixels.</summary>
    public float Width { get; set; } = 2.0f;
}
```

---

## Step 3: Create an EntityProcessor

The `EntityProcessor` watches for entities with your component and creates/destroys corresponding `RenderObject` instances.

```csharp
using Stride.Engine;
using Stride.Rendering;

/// <summary>
/// Processor that creates RenderDebugLine objects for every entity
/// with a DebugLineComponent. Registers them with the VisibilityGroup
/// so the render feature can collect them.
/// </summary>
public class DebugLineRenderProcessor : EntityProcessor<DebugLineComponent, DebugLineRenderData>,
    IEntityComponentRenderProcessor
{
    public VisibilityGroup VisibilityGroup { get; set; }

    protected override DebugLineRenderData GenerateComponentData(Entity entity,
        DebugLineComponent component)
    {
        return new DebugLineRenderData
        {
            RenderDebugLine = new RenderDebugLine()
        };
    }

    protected override void OnEntityComponentAdding(Entity entity,
        DebugLineComponent component, DebugLineRenderData data)
    {
        // Register the render object so the pipeline can see it
        VisibilityGroup.RenderObjects.Add(data.RenderDebugLine);
    }

    protected override void OnEntityComponentRemoved(Entity entity,
        DebugLineComponent component, DebugLineRenderData data)
    {
        // Unregister when the entity is destroyed or component removed
        VisibilityGroup.RenderObjects.Remove(data.RenderDebugLine);
    }

    public override void Draw(RenderContext context)
    {
        // Sync game-thread component data to render objects each frame
        foreach (var pair in ComponentDatas)
        {
            var component = pair.Key;
            var data = pair.Value;
            var renderLine = data.RenderDebugLine;

            renderLine.Start = component.Entity.Transform.WorldMatrix.TranslationVector;
            renderLine.End = component.Target;
            renderLine.Color = component.Color;
            renderLine.Width = component.Width;
        }
    }
}

/// <summary>Per-entity data linking the component to its render object.</summary>
public class DebugLineRenderData
{
    public RenderDebugLine RenderDebugLine;
}
```

---

## Step 4: Implement the RootRenderFeature

The `RootRenderFeature` is where the actual rendering logic lives. It processes all `RenderDebugLine` objects that pass visibility culling.

```csharp
using Stride.Graphics;
using Stride.Rendering;

/// <summary>
/// Custom root render feature that draws debug lines.
/// Registered in the Graphics Compositor as a render feature.
/// </summary>
public class DebugLineRenderFeature : RootRenderFeature
{
    // Tell the pipeline which RenderObject type this feature handles
    public override Type SupportedRenderObjectType => typeof(RenderDebugLine);

    private MutablePipelineState _pipelineState;
    private EffectInstance _effectInstance;
    private Buffer<VertexPositionColor> _vertexBuffer;

    /// <summary>
    /// Called once when the feature is initialized.
    /// Set up GPU resources here.
    /// </summary>
    public override void InitializeCore()
    {
        base.InitializeCore();

        // Load the shader effect (must exist in your Effects/ folder)
        _effectInstance = new EffectInstance(
            Context.Effects.InstantiateEffect("DebugLineShader"));

        _pipelineState = new MutablePipelineState(Context.GraphicsDevice);
    }

    /// <summary>
    /// Prepare phase: upload vertex data to GPU buffers.
    /// </summary>
    public override void Prepare(RenderDrawContext context)
    {
        base.Prepare(context);

        // Collect all visible debug lines into a vertex array
        var vertices = new List<VertexPositionColor>();

        foreach (var renderNodeRef in RenderNodes)
        {
            var renderNode = GetRenderNode(renderNodeRef);
            if (renderNode.RenderObject is not RenderDebugLine line)
                continue;

            vertices.Add(new VertexPositionColor(line.Start, line.Color));
            vertices.Add(new VertexPositionColor(line.End, line.Color));
        }

        if (vertices.Count == 0)
            return;

        // Upload to GPU
        var vertexArray = vertices.ToArray();
        _vertexBuffer = Buffer.Vertex.New(
            Context.GraphicsDevice,
            vertexArray,
            GraphicsResourceUsage.Dynamic);
    }

    /// <summary>
    /// Draw phase: issue the GPU draw calls.
    /// </summary>
    public override void Draw(RenderDrawContext context, RenderView renderView,
        RenderViewStage renderViewStage)
    {
        if (_vertexBuffer == null)
            return;

        var commandList = context.CommandList;

        // Set up the pipeline state
        _pipelineState.State.RootSignature = _effectInstance.RootSignature;
        _pipelineState.State.EffectBytecode = _effectInstance.Effect.Bytecode;
        _pipelineState.State.PrimitiveType = PrimitiveType.LineList;
        _pipelineState.State.InputElements = VertexPositionColor.Layout.CreateInputElements();
        _pipelineState.Update();

        commandList.SetPipelineState(_pipelineState.CurrentState);

        // Set the view-projection matrix
        _effectInstance.Parameters.Set(
            TransformationKeys.ViewProjection,
            renderView.ViewProjection);
        _effectInstance.Apply(context.GraphicsContext);

        // Bind vertex buffer and draw
        commandList.SetVertexBuffer(0, _vertexBuffer, 0,
            VertexPositionColor.Layout.CalculateSize());
        commandList.Draw(_vertexBuffer.ElementCount, 0);
    }

    /// <summary>Clean up GPU resources.</summary>
    protected override void Destroy()
    {
        _vertexBuffer?.Dispose();
        _effectInstance?.Dispose();
        base.Destroy();
    }
}
```

---

## Step 5: Write the SDSL Shader

Create an SDSL shader file in your project's `Effects/` directory.

```hlsl
// Effects/DebugLineShader.sdsl
shader DebugLineShader : ShaderBase, TransformationBase
{
    // Vertex input
    stage stream float4 Position : POSITION;
    stage stream float4 Color : COLOR;

    // Vertex shader
    stage override void VSMain()
    {
        streams.ShadingPosition = mul(streams.Position, Transformation.ViewProjection);
    }

    // Pixel shader
    stage override void PSMain()
    {
        streams.ColorTarget = streams.Color;
    }
};
```

### SDSL Key Concepts

- **Inheritance:** `ShaderBase` provides the base shader pipeline. `TransformationBase` gives access to `Transformation.ViewProjection`.
- **Streams:** The `streams` object carries data between shader stages (vertex → pixel). `streams.ShadingPosition` is the clip-space output.
- **Mixins:** SDSL shaders compose via inheritance. You can override specific stages while inheriting the rest from base shaders.

---

## Step 6: Register in the Graphics Compositor

The Graphics Compositor is Stride's visual pipeline editor. Your custom render feature must be registered there.

### Via Game Studio (Editor)

1. Open the **Graphics Compositor** asset in Game Studio
2. In the **Render Features** list, click **Add**
3. Select your `DebugLineRenderFeature` class
4. Add it to the appropriate render stage (typically `Opaque` or a custom `Debug` stage)

### Via Code (Code-Only Projects)

```csharp
// In your game initialization
var compositor = ((SceneInstance)SceneSystem.SceneInstance).GetProcessor<RenderSystem>();

// Register the custom render feature
var debugLineFeature = new DebugLineRenderFeature();
compositor.RenderFeatures.Add(debugLineFeature);
```

For code-only projects using the Community Toolkit:

```csharp
game.Run(start: (Scene rootScene) =>
{
    game.SetupBase3DScene();

    // Access the render system and add the feature
    var renderSystem = game.SceneSystem.SceneInstance
        .GetProcessor<RenderSystem>();
    renderSystem.RenderFeatures.Add(new DebugLineRenderFeature());

    // Add entities with DebugLineComponent...
});
```

---

## Render Stages

Stride organizes rendering into stages. Each stage represents a pass through the scene with specific settings (opaque, transparent, shadow, etc.).

| Built-in Stage | Purpose | Sort Order |
|----------------|---------|------------|
| `Opaque` | Solid geometry, front-to-back | Minimizes overdraw |
| `Transparent` | Alpha-blended geometry, back-to-front | Correct blending |
| `ShadowMapCaster` | Objects that cast shadows | N/A |

You can create custom stages for specialized rendering passes:

```csharp
// Register a custom render stage for debug visualization
var debugStage = new RenderStage("Debug", "Debug")
{
    SortMode = new BackToFrontSortMode()
};
```

Assign your render feature to the appropriate stage based on its blending needs. Opaque debug lines go in `Opaque`; transparent overlays go in `Transparent`.

---

## Performance Considerations

Custom render features bypass Stride's automatic batching and instancing. Keep these in mind:

- **Batch draw calls:** Collect all objects of the same type into a single vertex buffer (as shown in the example) rather than issuing one draw call per object.
- **Dynamic buffers:** Use `GraphicsResourceUsage.Dynamic` for buffers that change every frame. Use `Default` for static geometry.
- **Frustum culling:** Stride's visibility system culls `RenderObject` instances by their bounding box. Set `RenderObject.BoundingBox` accurately to benefit from automatic culling.
- **Minimize state changes:** Sort your draw calls to minimize pipeline state and shader switches.

```csharp
// Set a bounding box so culling works correctly
renderLine.BoundingBox = BoundingBox.FromPoints(new[] { line.Start, line.End });
```

---

## Common Mistakes

### Forgetting to Register the RenderObject with VisibilityGroup

If your custom objects don't appear, verify that the `EntityProcessor` adds them to `VisibilityGroup.RenderObjects`. Without registration, the collect phase never sees them.

### Mismatching SupportedRenderObjectType

The `SupportedRenderObjectType` property must return exactly the type you registered. If you return a base class, the feature may receive objects it doesn't know how to render.

### Disposing Buffers Mid-Frame

Never dispose GPU resources during the Draw phase. Dispose in `Destroy()` or defer disposal to the next frame using `Context.GraphicsDevice` deferred disposal mechanisms.

### Missing SDSL Compilation

SDSL shaders are compiled at build time. If your shader doesn't appear in the effect database, verify it's included in the `Effects/` directory and that the project builds without shader compilation errors.
