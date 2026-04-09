# R5 — Scene Optimization, LOD & Spatial Partitioning

> **Category:** reference · **Engine:** Babylon.js · **Related:** [Architecture Overview](../architecture/E1_architecture_overview.md), [Optimization & Performance](../guides/G8_optimization_performance.md), [Physics (Havok)](../guides/G1_physics_havok.md), [Procedural Generation](./R4_procedural_generation.md)

Large game worlds with thousands of meshes, sprawling terrain, and dense vegetation need aggressive optimization to maintain frame rates. Babylon.js provides a layered optimization toolkit: the automatic **SceneOptimizer**, manual **LOD** (Level of Detail) chains, **mesh instancing** and **thin instances**, **octree spatial partitioning**, and per-mesh/material freezing. This reference covers each technique with game-oriented examples.

---

## SceneOptimizer — Automatic Quality Scaling

The `SceneOptimizer` progressively degrades visual quality to maintain a target frame rate. It cycles through optimization levels, applying changes until the FPS target is met.

### Basic Usage

```typescript
import {
  Scene,
  SceneOptimizer,
  SceneOptimizerOptions,
} from '@babylonjs/core';

// Target 60 FPS with a 2-second evaluation window
SceneOptimizer.OptimizeAsync(
  scene,
  SceneOptimizerOptions.ModerateDegradation(),
  () => console.log('Target FPS reached'),
  () => console.log('Could not reach target FPS')
);
```

### Built-in Optimization Levels

| Level | Method | What It Does |
|-------|--------|-------------|
| Low | `LowDegradation()` | Disables post-processes, reduces texture size |
| Moderate | `ModerateDegradation()` | + Reduces shadow quality, disables particles |
| High | `HighDegradation()` | + Reduces render resolution, disables shadows entirely |

### Custom Optimizer

```typescript
import {
  SceneOptimizerOptions,
  SceneOptimization,
  TextureOptimization,
  ShadowsOptimization,
  HardwareScalingOptimization,
  MergeMeshesOptimization,
  CustomOptimization,
} from '@babylonjs/core';

const options = new SceneOptimizerOptions(60, 2000); // 60 FPS, 2s window

// Priority 0 — try first
options.addOptimization(new TextureOptimization(0, 512)); // max texture 512px
options.addOptimization(new ShadowsOptimization(0));

// Priority 1 — if still below target
options.addOptimization(new HardwareScalingOptimization(1, 2)); // render at half res

// Priority 2 — last resort
options.addOptimization(new MergeMeshesOptimization(2));

// Custom optimization
options.addCustomOptimization(
  () => {
    // Disable particle systems
    scene.particleSystems.forEach(ps => ps.stop());
    return true; // return true = optimization applied
  },
  () => 'Disabled particles',
  1 // priority
);

const optimizer = new SceneOptimizer(scene, options);
optimizer.start();

// Stop when no longer needed
optimizer.stop();
```

---

## Performance Priority Mode

A simpler alternative to `SceneOptimizer` — applies a bundle of optimizations in one call:

```typescript
import { ScenePerformancePriority } from '@babylonjs/core';

// Intermediate: freezes materials, skips bounds checks for known-visible meshes
scene.performancePriority = ScenePerformancePriority.Intermediate;

// Aggressive: + disables picking, frustum culling override, frozen active meshes
scene.performancePriority = ScenePerformancePriority.Aggressive;

// Back to normal
scene.performancePriority = ScenePerformancePriority.BackwardCompatible;
```

> **Game tip:** Use `Aggressive` for heavy combat scenes or large outdoor areas where picking isn't needed. Switch to `Intermediate` for menus and UI-heavy screens.

---

## Level of Detail (LOD)

LOD swaps mesh geometry based on camera distance — high-poly up close, low-poly far away, culled at extreme distance.

### Automatic LOD with Mesh Simplification

Babylon.js includes an in-browser quadratic error mesh simplification algorithm:

```typescript
import { Mesh, SimplificationType } from '@babylonjs/core';

// Define LOD levels with vertex count targets
const mesh: Mesh = /* loaded mesh */;

mesh.simplify(
  [
    { distance: 25, quality: 0.8, optimizeMesh: true },  // 80% quality at 25 units
    { distance: 50, quality: 0.5, optimizeMesh: true },  // 50% quality at 50 units
    { distance: 100, quality: 0.2, optimizeMesh: true },  // 20% quality at 100 units
  ],
  false, // don't run synchronously — keep rendering smooth
  SimplificationType.QUADRATIC,
  () => console.log('LOD chain generated')
);
```

### Manual LOD with Pre-made Meshes

For games, pre-authored LODs (from Blender/Maya) are preferred over runtime simplification:

```typescript
// highPoly, medPoly, lowPoly are pre-loaded meshes
highPoly.addLODLevel(30, medPoly);   // switch to medPoly at 30 units
highPoly.addLODLevel(60, lowPoly);   // switch to lowPoly at 60 units
highPoly.addLODLevel(120, null);     // cull entirely at 120 units

// Remove an LOD level
highPoly.removeLODLevel(medPoly);
```

### LOD + Instancing

LOD works with instances — each instance evaluates its own distance:

```typescript
const baseTree = loadedTreeMesh;
baseTree.addLODLevel(50, lowPolyTree);
baseTree.addLODLevel(100, null);

// Create instances — each inherits the LOD chain
for (let i = 0; i < 500; i++) {
  const instance = baseTree.createInstance(`tree_${i}`);
  instance.position.set(Math.random() * 200, 0, Math.random() * 200);
}
```

---

## Mesh Instancing

### Standard Instances

Instances share geometry and material but have independent transforms. One draw call per unique mesh:

```typescript
const sourceMesh = MeshBuilder.CreateBox('box', { size: 1 }, scene);
sourceMesh.material = sharedMaterial;

// 1000 boxes, 1 draw call
for (let i = 0; i < 1000; i++) {
  const instance = sourceMesh.createInstance(`box_${i}`);
  instance.position.set(
    Math.random() * 100,
    0,
    Math.random() * 100
  );
}
```

### Thin Instances (Maximum Performance)

Thin instances are even cheaper — no individual `InstancedMesh` objects. Transforms are packed into a raw `Float32Array` matrix buffer. Use for vegetation, debris, particles, or anything with 10K+ copies.

```typescript
import { Matrix, MeshBuilder } from '@babylonjs/core';

const grass = MeshBuilder.CreatePlane('grass', { width: 0.3, height: 0.5 }, scene);
grass.material = grassMaterial;

const COUNT = 50_000;
const matrices = new Float32Array(COUNT * 16); // 4x4 matrix per instance

for (let i = 0; i < COUNT; i++) {
  const matrix = Matrix.Translation(
    Math.random() * 500 - 250,
    0,
    Math.random() * 500 - 250
  );
  matrix.copyToArray(matrices, i * 16);
}

grass.thinInstanceSetBuffer('matrix', matrices, 16, false);

// Update a single instance later
const updatedMatrix = Matrix.Translation(10, 0, 10);
grass.thinInstanceSetMatrixAt(42, updatedMatrix, false);
grass.thinInstanceBufferUpdated('matrix');
```

**Performance comparison:**

| Method | 10K Objects | Draw Calls | CPU Overhead |
|--------|------------|------------|--------------|
| Individual meshes | Slow | 10,000 | High |
| Instances | Fast | 1 | Medium (per-object Node) |
| Thin instances | Fastest | 1 | Minimal (raw buffer) |

> **Warning:** If any instance uses a negative scale, Babylon.js disables back-face culling for the entire batch. Avoid negative scale with instancing.

---

## Octree Spatial Partitioning

Octrees subdivide 3D space into nested cubes. Babylon.js uses them to accelerate mesh selection (frustum culling), picking (raycasts), and collision detection.

### Scene-Level Octree

```typescript
// Create octree for visible mesh selection
// capacity = max meshes per leaf, maxDepth = subdivision levels
const octree = scene.createOrUpdateSelectionOctree(64, 2);
// depth 2 = 8^2 = 512 blocks at max subdivision
```

### Dynamic Content

Moving meshes don't fit neatly into static octree cells. Register them separately:

```typescript
// Player, enemies, projectiles — always evaluated
octree.dynamicContent.push(playerMesh);
octree.dynamicContent.push(enemyMesh);
```

### Per-Mesh Submesh Octree

For high-poly meshes (10K+ vertices), create submesh octrees for faster picking and collision:

```typescript
// First subdivide the mesh into smaller pieces
terrainMesh.subdivide(8);

// Then create submesh octree
terrainMesh.createOrUpdateSubmeshesOctree(32, 3);

// Enable octree usage
terrainMesh.useOctreeForCollisions = true;
terrainMesh.useOctreeForPicking = true;
terrainMesh.useOctreeForRenderingSelection = true;
```

### Ground Mesh Optimization

For terrain specifically, use the built-in shortcut:

```typescript
const ground = MeshBuilder.CreateGroundFromHeightMap(
  'terrain', heightmapUrl, { width: 500, height: 500, subdivisions: 256 }, scene
);

ground.onReady = () => {
  ground.optimize(32); // chunk size — creates octree for rendering + collision
};
```

### Manual Queries

```typescript
// Frustum query — what's visible?
const visibleMeshes = octree.select(frustumPlanes);

// Sphere query — what's near this point?
const nearbyMeshes = octree.intersects(center, radius);

// Ray query — what does this ray hit?
const hitMeshes = octree.intersectsRay(ray);
```

---

## Freezing & Caching

### Material Freezing

Prevents shader recompilation when material properties are static:

```typescript
material.freeze(); // no more shader updates

// If you need to change a property later:
material.unfreeze();
material.diffuseColor = new Color3(1, 0, 0);
material.freeze();
```

### World Matrix Freezing

Stops recalculating transform matrices for static geometry:

```typescript
// Static props — walls, floor, decorations
staticMesh.freezeWorldMatrix();

// If it needs to move later:
staticMesh.unfreezeWorldMatrix();
staticMesh.position.x += 5;
staticMesh.freezeWorldMatrix();
```

### Active Mesh Freezing

Locks the visible mesh list — no per-frame frustum culling:

```typescript
scene.freezeActiveMeshes();

// Force-include a mesh that moves
movingMesh.alwaysSelectAsActiveMesh = true;

// Release when the scene changes significantly
scene.unfreezeActiveMeshes();
```

---

## Culling Strategies

Configure how the engine determines mesh visibility:

```typescript
import { AbstractMesh } from '@babylonjs/core';

// Default — bounding sphere then bounding box
mesh.cullingStrategy = AbstractMesh.CULLINGSTRATEGY_STANDARD;

// Faster — sphere check only (good for roughly spherical objects)
mesh.cullingStrategy = AbstractMesh.CULLINGSTRATEGY_BOUNDINGSPHERE_ONLY;

// Optimistic — assume visible unless clearly outside
mesh.cullingStrategy = AbstractMesh.CULLINGSTRATEGY_OPTIMISTIC_INCLUSION;

// Optimistic + sphere — best for large open worlds
mesh.cullingStrategy = AbstractMesh.CULLINGSTRATEGY_OPTIMISTIC_INCLUSION_THEN_BSPHERE_ONLY;
```

---

## Buffer Clearing Optimization

Skip framebuffer clearing when the camera always sees opaque geometry:

```typescript
scene.autoClear = false;              // don't clear color buffer
scene.autoClearDepthAndStencil = false; // don't clear depth/stencil

// Per rendering group control
scene.setRenderingAutoClearDepthStencil(0, false, false, false);
```

---

## Optimization Checklist for Game Worlds

| Technique | When to Use | FPS Impact |
|-----------|------------|------------|
| Material freeze | Always for static materials | +5-15% |
| World matrix freeze | Static geometry (walls, terrain, props) | +5-10% |
| Thin instances | 1K+ identical objects (grass, trees, debris) | +50-90% vs individual |
| LOD chains | Any mesh visible at varying distances | +20-40% |
| Octree selection | 200+ meshes in scene | +10-30% |
| Performance priority (Aggressive) | Action scenes, outdoor areas | +15-25% |
| SceneOptimizer | Shipping to varied hardware | Adaptive |
| `autoClear = false` | Full-screen skybox or background | +2-5% |

### Profiling Tools

```typescript
// Enable performance counters
scene.getEngine().enableOfflineSupport = false;

// Monitor draw calls
const instrumentation = new SceneInstrumentation(scene);
instrumentation.captureRenderTime = true;
instrumentation.captureFrameTime = true;

scene.onAfterRenderObservable.add(() => {
  console.log('Draw calls:', scene.getEngine().drawCalls);
  console.log('Active meshes:', scene.getActiveMeshes().length);
  console.log('Frame time:', instrumentation.frameTimeCounter.lastSecAverage.toFixed(1), 'ms');
});
```

Use the **Babylon.js Inspector** (`scene.debugLayer.show()`) for real-time profiling during development. See the [Inspector & Debugging reference](./R2_inspector_debugging.md) for details.
