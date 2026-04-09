# G34 — Custom Gizmos & Editor Extensions

> **Category:** Guide · **Engine:** Stride · **Related:** [Stride Architecture Rules](../stride-arch-rules.md), [G27 — Game Studio Editor Workflow](G27_game_studio_editor_workflow.md), [G28 — Entity Processors & Custom ECS](G28_entity_processors_custom_ecs.md)

Stride Game Studio supports user-defined gizmos — visual overlays in the scene editor that help designers understand and manipulate component data without running the game. Gizmos are useful for visualizing trigger volumes, AI patrol paths, spawn zones, camera frustums, and any other spatial data attached to entities. This guide covers the gizmo API, rendering primitives, scene picking, and best practices for editor extensions.

---

## Table of Contents

1. [Gizmo Architecture Overview](#1--gizmo-architecture-overview)
2. [Creating a Basic Gizmo](#2--creating-a-basic-gizmo)
3. [The IEntityGizmo Interface](#3--the-ientitygizmo-interface)
4. [Rendering Gizmo Geometry](#4--rendering-gizmo-geometry)
5. [Scene Picking and Selection](#5--scene-picking-and-selection)
6. [Responding to Component State](#6--responding-to-component-state)
7. [Performance Considerations](#7--performance-considerations)
8. [Common Gizmo Patterns](#8--common-gizmo-patterns)

---

## 1 — Gizmo Architecture Overview

Stride's gizmo system binds a visual representation to a specific component type. When the editor loads a scene, it scans for components that have matching gizmo classes and instantiates one gizmo per component instance. The gizmo lives in the **editor scene** (a separate scene overlaid on the game scene), so gizmo entities never appear in the built game.

The binding uses two pieces:

- **`[GizmoComponent]` attribute** — placed on the gizmo class, specifying which component type it visualizes
- **`IEntityGizmo` interface** — defines the lifecycle methods the editor calls each frame

The editor manages gizmo visibility through the View Settings panel, where designers can toggle gizmo categories on/off and adjust the size slider.

---

## 2 — Creating a Basic Gizmo

Suppose you have a `SpawnZone` component that defines a rectangular area where enemies spawn:

```csharp
using Stride.Engine;
using Stride.Core;

[DataContract]
public class SpawnZone : ScriptComponent
{
    /// <summary>Half-extents of the spawn area in local space.</summary>
    public Vector3 HalfExtents { get; set; } = new Vector3(5f, 0.1f, 5f);

    /// <summary>Maximum enemies that can spawn in this zone.</summary>
    public int MaxSpawns { get; set; } = 10;
}
```

The gizmo class draws a wireframe box matching the zone's dimensions:

```csharp
using Stride.Engine;
using Stride.Engine.Gizmos;
using Stride.Graphics;
using Stride.Rendering;

// Bind this gizmo to SpawnZone components
// isMainGizmo: false means it always displays (not competing with other gizmos)
[GizmoComponent(typeof(SpawnZone), isMainGizmo: false)]
public class SpawnZoneGizmo : IEntityGizmo
{
    private readonly SpawnZone _component;
    private ModelComponent _wireframeModel;
    private Entity _gizmoEntity;

    // Constructor MUST take a single parameter of the bound component type
    public SpawnZoneGizmo(SpawnZone component)
    {
        _component = component;
    }

    public bool IsEnabled { get; set; }
    public bool IsSelected { get; set; }
    public float SizeFactor { get; set; }

    public void Initialize(IServiceRegistry services, Scene editorScene)
    {
        // Create gizmo visuals in the editor scene
        _gizmoEntity = new Entity("SpawnZone_Gizmo");

        // Build a wireframe box model
        var graphicsDevice = services.GetService<IGraphicsDeviceService>().GraphicsDevice;
        var material = GizmoEmissiveColorMaterial.Create(
            graphicsDevice, new Color4(0.2f, 0.8f, 0.2f, 0.6f)); // Green, semi-transparent

        _wireframeModel = new ModelComponent
        {
            RenderGroup = IEntityGizmo.PickingRenderGroup
        };

        _gizmoEntity.Add(_wireframeModel);
        editorScene.Entities.Add(_gizmoEntity);
    }

    public void Update()
    {
        if (!IsEnabled || _gizmoEntity == null) return;

        // Sync gizmo transform with the component's entity
        _gizmoEntity.Transform.UseTRS = false;
        _gizmoEntity.Transform.LocalMatrix =
            _component.Entity.Transform.WorldMatrix;
    }

    public bool HandlesComponentId(
        OpaqueComponentId pickedComponentId, out Entity? selection)
    {
        if (pickedComponentId.Match(_wireframeModel))
        {
            selection = _component.Entity;
            return true;
        }
        selection = null;
        return false;
    }

    public void Dispose()
    {
        _gizmoEntity?.Scene?.Entities.Remove(_gizmoEntity);
        _gizmoEntity = null;
    }
}
```

After adding this class to your project, **restart Game Studio** — gizmo classes are discovered at editor startup, not hot-reloaded.

---

## 3 — The IEntityGizmo Interface

Every gizmo must implement `IEntityGizmo`. Here is a breakdown of each member:

| Member | Type | Purpose |
|--------|------|---------|
| `IsEnabled` | `bool` (property) | Set by the editor based on the View Settings toggle for this gizmo category. When false, skip rendering. |
| `IsSelected` | `bool` (property) | Set by the editor when the parent entity is selected. Use this to highlight the gizmo (brighter color, thicker lines). |
| `SizeFactor` | `float` (property) | Maps to the gizmo size slider in View Settings. Scale your visuals by this value so designers can adjust visibility. |
| `Initialize(IServiceRegistry, Scene)` | method | Called once when the gizmo is created. Use it to create entities and materials in the `editorScene`. |
| `Update()` | method | Called every editor frame. Sync transforms, update colors, and rebuild geometry if component data changed. |
| `HandlesComponentId(OpaqueComponentId, out Entity?)` | method | Called during scene picking (mouse click in viewport). Return `true` if the picked component belongs to this gizmo. |
| `Dispose()` | method | Called when the component or entity is removed. Clean up editor scene entities and GPU resources. |

---

## 4 — Rendering Gizmo Geometry

### Solid Primitives

Use `GeometricPrimitive` to create standard shapes (box, sphere, cylinder, cone, torus) with vertex and index buffers:

```csharp
// In Initialize():
var box = GeometricPrimitive.Cube.New(graphicsDevice, 1.0f);

var mesh = new Mesh
{
    Draw = box.ToMeshDraw(),
    MaterialIndex = 0
};

var model = new Model { mesh };
model.Materials.Add(material);
_wireframeModel.Model = model;
```

### Line-Based Wireframes

For wireframe rendering, build custom vertex/index buffers with `PrimitiveType.LineList`:

```csharp
// Create a wireframe box from 12 line segments (24 vertices)
var vertices = new VertexPositionNormalTexture[24];
var indices = new int[24];

// Define the 8 corners of the box
Vector3[] corners = GetBoxCorners(halfExtents);

// Connect corners with lines (12 edges × 2 vertices each)
int idx = 0;
// Bottom face
AddLine(ref idx, vertices, indices, corners[0], corners[1]);
AddLine(ref idx, vertices, indices, corners[1], corners[2]);
AddLine(ref idx, vertices, indices, corners[2], corners[3]);
AddLine(ref idx, vertices, indices, corners[3], corners[0]);
// Top face
AddLine(ref idx, vertices, indices, corners[4], corners[5]);
// ... remaining edges
```

### Emissive Gizmo Materials

Gizmos typically use unlit emissive materials so they remain visible regardless of scene lighting:

```csharp
// Stride provides a helper for gizmo materials
var material = GizmoEmissiveColorMaterial.Create(
    graphicsDevice, new Color4(1f, 0.5f, 0f, 0.8f)); // Orange glow
```

For selection highlighting, swap to a brighter color when `IsSelected` is true:

```csharp
public void Update()
{
    var color = IsSelected
        ? new Color4(1f, 1f, 0f, 1f)   // Bright yellow when selected
        : new Color4(0.2f, 0.8f, 0.2f, 0.6f); // Dim green normally
    UpdateMaterialColor(_wireframeModel, color);
}
```

---

## 5 — Scene Picking and Selection

Scene picking allows designers to click a gizmo in the viewport to select the owning entity. The editor renders gizmos into a picking buffer using `IEntityGizmo.PickingRenderGroup`, then calls `HandlesComponentId` on each gizmo to resolve the click.

```csharp
public bool HandlesComponentId(
    OpaqueComponentId pickedComponentId, out Entity? selection)
{
    // Check if the picked component is our model
    if (pickedComponentId.Match(_wireframeModel))
    {
        // Return the game entity (not the gizmo entity)
        selection = _component.Entity;
        return true;
    }

    selection = null;
    return false;
}
```

**Key rule:** always set `RenderGroup = IEntityGizmo.PickingRenderGroup` on your `ModelComponent`. Without this, the gizmo renders visually but cannot be clicked.

---

## 6 — Responding to Component State

Gizmos should reflect the current state of the component they visualize. Read component properties in `Update()` and adjust geometry or color accordingly:

```csharp
public void Update()
{
    if (!IsEnabled) return;

    // Reflect spawn zone capacity visually
    float fillRatio = _component.CurrentSpawnCount / (float)_component.MaxSpawns;
    var color = Color4.Lerp(
        new Color4(0f, 1f, 0f, 0.5f),  // Green = empty
        new Color4(1f, 0f, 0f, 0.5f),  // Red = at capacity
        fillRatio);
    UpdateMaterialColor(_wireframeModel, color);

    // Scale gizmo to match half-extents (which may be edited live)
    var scale = _component.HalfExtents * 2f * SizeFactor;
    _gizmoEntity.Transform.UseTRS = false;
    _gizmoEntity.Transform.LocalMatrix =
        Matrix.Scaling(scale) * _component.Entity.Transform.WorldMatrix;
}
```

---

## 7 — Performance Considerations

Gizmos render every editor frame, so keep them lightweight:

- **Set `UseTRS = false`** on gizmo entity transforms and write `LocalMatrix` directly. This bypasses the TRS decomposition/recomposition cost.
- **Cache geometry.** Rebuild vertex buffers only when the component data that drives the shape actually changes, not every frame.
- **Use simple geometry.** Wireframe lines are cheaper than solid meshes. Reserve solid primitives for selected-state highlighting.
- **Dispose GPU resources.** Implement `Dispose()` properly to avoid leaking vertex buffers and materials when entities are deleted.

---

## 8 — Common Gizmo Patterns

### Trigger Volume Visualizer

Draw a semi-transparent box or sphere matching a trigger collider's dimensions. Color it green for inactive, red for active.

### AI Waypoint Path

Iterate over a list of `Vector3` waypoints stored in a patrol component. Draw lines connecting them in sequence, with small spheres at each point.

### Audio Source Range

Draw two concentric wireframe spheres: the inner sphere for the audio's full-volume range, the outer sphere for the falloff distance.

### Camera Frustum Preview

Read the camera's field of view, aspect ratio, and near/far clip planes. Compute the frustum corners and draw a wireframe pyramid from the camera position.

### Light Cone/Radius

For spot lights, draw a cone matching the angle and range. For point lights, draw a wireframe sphere at the light's radius. Stride's built-in light gizmos follow this pattern — your custom lights can reuse the same approach.
