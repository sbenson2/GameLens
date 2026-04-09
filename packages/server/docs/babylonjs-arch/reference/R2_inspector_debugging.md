# Babylon.js Inspector & Debugging Tools

> **Category:** reference · **Engine:** Babylon.js 7.x · **Related:** [Optimization & Performance](../guides/G8_optimization_performance.md), [Architecture Overview](../architecture/E1_architecture_overview.md)

Babylon.js ships with a powerful built-in Inspector — a visual debugging tool that lets you browse the scene graph, edit properties in real time, profile performance, and visualize physics, skeletons, and light gizmos. No external tools required. This reference covers setup, every major Inspector pane, and programmatic debugging APIs.

---

## Launching the Inspector

### Quick Start (Development)

```typescript
import "@babylonjs/inspector";  // side-effect import, registers the Inspector

// Toggle with a hotkey — great during development
scene.onKeyboardObservable.add((kbInfo) => {
  if (kbInfo.type === BABYLON.KeyboardEventTypes.KEYDOWN && kbInfo.event.key === "F1") {
    if (scene.debugLayer.isVisible()) {
      scene.debugLayer.hide();
    } else {
      scene.debugLayer.show({
        embedMode: true,        // render inside the canvas container
        showExplorer: true,     // left pane — scene tree
        showInspector: true,    // right pane — properties
      });
    }
  }
});
```

### Configuration Options

```typescript
scene.debugLayer.show({
  embedMode: true,              // false = floating popout window
  showExplorer: true,           // scene hierarchy pane
  showInspector: true,          // properties pane
  handleResize: true,           // auto-resize canvas when Inspector opens
  overlay: false,               // true = render on top of canvas
  globalRoot: document.body,    // DOM element to attach the Inspector to
  initialTab: 2,                // open to a specific tab index
});
```

### Production Builds — Exclude the Inspector

The Inspector adds ~1.5 MB to your bundle. Strip it from production:

```typescript
// Only import in development
if (process.env.NODE_ENV === "development") {
  import("@babylonjs/inspector").then(() => {
    scene.debugLayer.show();
  });
}
```

Or use your bundler's tree-shaking / dead-code elimination to exclude `@babylonjs/inspector` from production builds entirely.

---

## Scene Explorer (Left Pane)

The Scene Explorer shows a hierarchical tree of every object in your scene. You can filter by name using the search bar at the top.

### Node Categories

| Category | Contents |
|----------|----------|
| **Scene** | Environment, clear color, fog, gravity |
| **Nodes** | TransformNodes, meshes, cameras, lights — full parent-child hierarchy |
| **Materials** | All materials + their textures |
| **Textures** | Every loaded texture with preview thumbnails |
| **Animations** | Animation groups, skeletal animations |
| **Particle Systems** | All active emitters |
| **Sprites** | Sprite managers and instances |
| **Post Processes** | Rendering pipeline stages |
| **Sounds** | Spatial and global audio sources |
| **GUI** | AdvancedDynamicTexture controls (if using @babylonjs/gui) |

### Scene Explorer Actions

- **Click** a node to select it and inspect its properties in the right pane.
- **Double-click** a mesh to zoom the editor camera to it.
- **Eye icon** toggles visibility (`mesh.isVisible`).
- **Camera icon** on a camera sets it as the active camera.
- **Gizmo buttons** (top bar) enable Translate / Rotate / Scale gizmos on the selected node.

---

## Properties Pane (Right Pane)

When you select a node in the Scene Explorer, the right pane shows all editable properties. Changes take effect immediately in the viewport.

### Common Editable Properties

| Object Type | Key Properties |
|-------------|---------------|
| **Mesh** | Position, rotation, scaling, visibility, renderingGroupId, checkCollisions, material assignment |
| **Material** | Albedo color, metallic, roughness, emissive, alpha, textures, back-face culling |
| **Light** | Intensity, color, range, shadow generator settings, direction |
| **Camera** | FOV, near/far clip, speed, inertia, position, target |
| **Particle System** | Emit rate, lifetime, size, color gradients, gravity, texture |

### Custom Inspectable Properties

You can expose game-specific properties (like enemy health or spawn rates) directly in the Inspector:

```typescript
mesh.inspectableCustomProperties = [
  {
    label: "Health",
    propertyName: "metadata.health",
    type: BABYLON.InspectableType.Slider,
    min: 0,
    max: 100,
    step: 1,
  },
  {
    label: "Is Boss",
    propertyName: "metadata.isBoss",
    type: BABYLON.InspectableType.Checkbox,
  },
  {
    label: "Enemy Type",
    propertyName: "metadata.enemyType",
    type: BABYLON.InspectableType.Options,
    options: [
      { label: "Melee", value: 0 },
      { label: "Ranged", value: 1 },
      { label: "Flying", value: 2 },
    ],
  },
];
```

Available types: `Checkbox`, `Slider`, `Vector3`, `Quaternion`, `Color3`, `String`, `Button`, `Options`, `Tab`.

---

## Statistics & Performance Profiler

### Statistics Tab

The Statistics tab shows real-time engine metrics. Key metrics to watch for games:

| Metric | Healthy Target | Warning Sign |
|--------|---------------|--------------|
| **FPS** | 60 (or your target) | Drops below 30 |
| **Draw calls** | < 100 for mobile, < 500 desktop | Thousands = batch geometry or use instances |
| **Active meshes** | Depends on complexity | Rising unexpectedly = disposal leak |
| **Active particles** | < 10,000 on mobile | GPU-bound if combined with many lights |
| **Frame time (ms)** | < 16.6 ms at 60fps | Spikes indicate GC pauses or heavy computation |
| **GPU frame time** | < 12 ms (leaving headroom) | Shader-bound or fill-rate-bound |
| **Texture memory** | Varies by platform | Monitor for leaks — textures not disposed |

### Performance Profiler (Visual Graph)

Available inside the Statistics tab, the Performance Profiler charts metrics over time so you can spot frame spikes, GC pauses, and gradual degradation.

```typescript
// Programmatic access to the same data the profiler shows:
const perf = scene.getEngine().getFps();
const drawCalls = scene.getEngine()._drawCalls.current;

// Custom instrumentation — add your own metrics to the profiler:
const myCounter = new BABYLON.PerfCounter();
scene.registerBeforeRender(() => {
  myCounter.beginMonitoring();
  // ... your game logic ...
  myCounter.endMonitoring();
});
```

**Profiler data types:**
1. All built-in statistics (FPS, draw calls, active meshes, etc.)
2. User-defined counters via `PerfCounter`
3. User-defined events via code annotations

---

## Debug Visualizers

### Skeleton Viewer

Visualize bone hierarchies for animation debugging:

```typescript
import { SkeletonViewer } from "@babylonjs/core/Debug/skeletonViewer";

const skeletonViewer = new SkeletonViewer(
  skeleton,           // the Skeleton instance
  mesh,               // the mesh it's attached to
  scene,
  false,              // autoUpdateBonesMatrices
  mesh.renderingGroupId,
  {
    displayMode: SkeletonViewer.DISPLAY_SPHERE_AND_SPURS,
    sphereBaseSize: 0.05,
    sphereScaleUnit: 10,
    midStep: 0.25,
  }
);

// Toggle visibility
skeletonViewer.isEnabled = true;

// Clean up
skeletonViewer.dispose();
```

Display modes: `DISPLAY_LINES` (simple), `DISPLAY_SPHERE_AND_SPURS` (detailed, shows joint sizes and bone directions).

### Physics Debug Viewer

Render physics collider wireframes:

```typescript
// Via Inspector: open the Debug pane → toggle "Physics Viewer"

// Programmatic — using the PhysicsViewer utility:
import { PhysicsViewer } from "@babylonjs/core/Debug/physicsViewer";

const physicsViewer = new PhysicsViewer(scene);

// Show impostors for specific meshes:
for (const mesh of scene.meshes) {
  if (mesh.physicsBody) {
    physicsViewer.showBody(mesh.physicsBody);
  }
}

// Hide when done:
physicsViewer.dispose();
```

### Bounding Box and Axes Helpers

```typescript
// Show bounding box for a mesh
mesh.showBoundingBox = true;

// Show world axes at a node's position
const axes = new BABYLON.AxesViewer(scene, 1.0);
axes.xAxis.parent = myNode;

// Show all light gizmos
const gizmoManager = new BABYLON.GizmoManager(scene);
gizmoManager.attachableMeshes = null; // attach to anything
gizmoManager.positionGizmoEnabled = true;
gizmoManager.rotationGizmoEnabled = true;
```

---

## Tools Pane

The Tools pane in the Inspector provides utility actions:

| Tool | What it Does |
|------|-------------|
| **Screenshot** | Capture the canvas at any resolution |
| **Video Recorder** | Record the canvas to WebM |
| **glTF Export** | Export the current scene (or selection) to glTF/GLB |
| **Environment Texture** | Change the scene's IBL environment texture |
| **Fog** | Toggle and configure scene fog |

---

## Programmatic Debugging Utilities

### Logging and Timers

```typescript
// Structured logging with levels
BABYLON.Logger.Log("Info message");
BABYLON.Logger.Warn("Warning");
BABYLON.Logger.Error("Error");

// Measure code block execution time
BABYLON.Tools.StartPerformanceCounter("AI Update");
updateAllEnemies();
BABYLON.Tools.EndPerformanceCounter("AI Update");
// Results appear in browser devtools and the Performance Profiler
```

### Render Pipeline Debugging

```typescript
// Wireframe mode — see triangle density
scene.forceWireframe = true;

// Point cloud mode — see vertex density
scene.forcePointsCloud = true;

// Freeze materials — stops material recompilation (useful for isolating shader perf)
scene.freezeMaterials();

// Freeze active meshes — stops per-frame frustum culling evaluation
scene.freezeActiveMeshes();
// Call scene.unfreezeActiveMeshes() when done testing
```

### Texture Inspector

```typescript
// List all textures with size info
for (const tex of scene.textures) {
  const size = tex.getSize();
  console.log(`${tex.name}: ${size.width}x${size.height}, type=${tex.getClassName()}`);
}
```

---

## Game Development Debugging Workflow

1. **Hotkey toggle** — bind Inspector to F1 during development (see Quick Start above).
2. **Custom metadata** — put game data (health, state, AI mode) in `mesh.metadata` and expose it via `inspectableCustomProperties` so designers can tweak values at runtime.
3. **Performance baseline** — open Statistics at the start of each play session. Note draw calls, active meshes, and FPS. Watch for trends over a play session (memory leaks show as rising texture count or mesh count).
4. **Physics debugging** — enable the Physics Viewer when collision detection seems wrong. Collider shapes often don't match visual meshes.
5. **Animation debugging** — use the Skeleton Viewer to verify bone orientations, especially after re-exporting from Blender/Maya.
6. **Strip for release** — dynamically import `@babylonjs/inspector` only in dev builds. The Inspector code is never needed in production.
