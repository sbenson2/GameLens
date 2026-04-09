# PlayCanvas Optimization & Performance Guide

> **Category:** guide · **Engine:** PlayCanvas v2+ · **Related:** [Architecture Overview](../architecture/E1_architecture_overview.md), [WebGPU Support](G3_webgpu_support.md), [PlayCanvas Rules](../playcanvas-rules.md)

Draw calls are the primary performance bottleneck in web 3D games. PlayCanvas provides batching, hardware instancing, frustum culling, LOD, and profiling tools to keep frame rates high — especially on mobile GPUs where each draw call is expensive. This guide covers every major optimisation lever and when to use each one.

---

## The Draw Call Budget

A **draw call** corresponds to one `MeshInstance` submitted for rendering. Each draw call incurs CPU overhead (state changes, uniform uploads, WebGL/WebGPU API calls).

| Platform | Target draw calls/frame | Notes |
|----------|------------------------|-------|
| Desktop (WebGL 2) | 500–2000 | Depends on GPU and driver |
| Mobile (WebGL 2) | 100–300 | Mali/Adreno GPUs bottleneck on draw calls fast |
| Desktop (WebGPU) | 2000–5000+ | Lower per-call overhead |
| Mobile (WebGPU) | 300–800 | Still limited by bandwidth and thermal throttling |

> **Rule of thumb:** If your scene has more draw calls than your platform budget, optimise draw calls first — it almost always gives the biggest win per effort.

---

## Batching

Batching merges multiple `MeshInstance`s that share the same material into a single draw call.

### Static Batching (BatchGroup)

For objects that never move (environment, props, buildings):

```typescript
import { Application, BatchGroup } from "playcanvas";

const app: Application = /* ... */;

// Create a batch group in code (or via the Editor UI)
const envBatch = app.batcher.addGroup("environment", false, 100);
// name, dynamic, maxAabbSize

// Assign entities to the batch group
wallEntity.render!.batchGroupId = envBatch.id;
floorEntity.render!.batchGroupId = envBatch.id;
propsEntity.render!.batchGroupId = envBatch.id;
```

**How it works:** The engine merges meshes into larger combined meshes at load time. The combined mesh is a single draw call.

**Trade-offs:**

| Pro | Con |
|-----|-----|
| Dramatic draw call reduction | Cannot move individual objects after batching |
| Works with any material | Increases total vertex count (duplicates shared geometry) |
| Supports camera culling on the combined AABB | Very large batches defeat frustum culling — tune `maxAabbSize` |

### Dynamic Batching

For objects that move but share a material (e.g., pickups, particles, projectiles):

```typescript
const pickupBatch = app.batcher.addGroup("pickups", true, 50);
// dynamic = true

coinEntity.render!.batchGroupId = pickupBatch.id;
```

Dynamic batches are re-merged each frame, so they have higher CPU overhead than static batches. Use them when the draw call savings outweigh the per-frame merge cost.

> **Tip:** Keep dynamic batch groups small (< 50 objects). If objects share the same mesh and material, prefer hardware instancing instead.

---

## Hardware Instancing

Instancing tells the GPU to draw the same mesh N times in a single draw call, each with different per-instance data (transform, colour, etc.).

### Basic Instancing (Transforms Only)

```typescript
import {
  Entity,
  MeshInstance,
  VertexBuffer,
  VertexFormat,
  TYPE_FLOAT32,
  SEMANTIC_ATTR12,
  SEMANTIC_ATTR13,
  SEMANTIC_ATTR14,
  SEMANTIC_ATTR15,
} from "playcanvas";

const meshInstance: MeshInstance = templateEntity.render!.meshInstances[0];
const instanceCount = 1000;

// Build per-instance matrices
const matrixData = new Float32Array(instanceCount * 16);
for (let i = 0; i < instanceCount; i++) {
  const mat = new pc.Mat4();
  mat.setTranslate(Math.random() * 100, 0, Math.random() * 100);
  matrixData.set(mat.data, i * 16);
}

// Create vertex buffer with 4x vec4 attributes (one Mat4 per instance)
const format = new VertexFormat(app.graphicsDevice, [
  { semantic: SEMANTIC_ATTR12, components: 4, type: TYPE_FLOAT32, normalize: false },
  { semantic: SEMANTIC_ATTR13, components: 4, type: TYPE_FLOAT32, normalize: false },
  { semantic: SEMANTIC_ATTR14, components: 4, type: TYPE_FLOAT32, normalize: false },
  { semantic: SEMANTIC_ATTR15, components: 4, type: TYPE_FLOAT32, normalize: false },
]);

const instanceBuffer = new VertexBuffer(app.graphicsDevice, format, instanceCount, {
  data: matrixData,
});

meshInstance.setInstancing(instanceBuffer);
```

### When to Use Instancing vs Batching

| Criterion | Batching | Instancing |
|-----------|----------|------------|
| Same mesh required? | No — different meshes OK if same material | Yes — all instances share one mesh |
| Objects move? | Static preferred; dynamic possible | Yes — update the instance buffer |
| Per-instance data | None (baked into combined mesh) | Transform + custom attributes (colour, scale, UV offset) |
| Skinned meshes | Not supported for dynamic batching | Not supported |
| Frustum culling | Per-batch AABB | All-or-nothing (set `customAabb` to cull the whole group) |
| Best for | Mixed static geometry | Forests, grass, particles, crowd NPCs |

---

## Frustum Culling

Objects outside the camera's view frustum don't need to be drawn. PlayCanvas supports frustum culling at the `MeshInstance` level.

### Enabling/Disabling

```typescript
// Per-camera (enabled by default)
cameraEntity.camera!.frustumCulling = true;

// Per-mesh-instance
meshInstance.cull = true;  // default — participate in culling
meshInstance.cull = false; // always draw (skybox, full-screen effects)
```

### When to Disable

- **Small indoor scenes** where everything is always visible — culling overhead > savings.
- **Instanced groups** — the GPU draws all instances in one call. Set `cull = false` on the instance template but provide a `customAabb` that bounds all instances so the entire group is culled together.

```typescript
import { BoundingBox, Vec3 } from "playcanvas";

// Bounding box covering all instances
meshInstance.customAabb = new BoundingBox(
  new Vec3(50, 5, 50),   // centre
  new Vec3(60, 10, 60)   // half-extents
);
```

---

## Level of Detail (LOD)

LOD swaps high-poly meshes for simpler ones at distance, reducing vertex processing and draw complexity.

### Entity Name Convention

PlayCanvas supports LOD via entity naming. Append `LOD0`, `LOD1`, `LOD2` etc. to entity names:

```
Tree_LOD0   ← highest detail (closest)
Tree_LOD1   ← medium detail
Tree_LOD2   ← lowest detail (farthest / billboard)
```

The engine automatically shows the appropriate LOD based on screen-space size or distance.

### Manual LOD Switching

For finer control, implement LOD in a script:

```typescript
import { Script, Entity, Vec3 } from "playcanvas";

class LodController extends Script {
  entity!: Entity;
  lods!: Entity[];
  thresholds = [20, 50, 100]; // Distance breakpoints

  initialize(): void {
    this.lods = [
      this.entity.findByName("LOD0")!,
      this.entity.findByName("LOD1")!,
      this.entity.findByName("LOD2")!,
    ];
  }

  update(): void {
    const cam = this.app.root.findByName("Camera")!;
    const dist = cam.getPosition().distance(this.entity.getPosition());

    for (let i = 0; i < this.lods.length; i++) {
      const show =
        dist >= (this.thresholds[i - 1] ?? 0) &&
        dist < (this.thresholds[i] ?? Infinity);
      this.lods[i].enabled = show;
    }
  }
}
```

### LOD Budget Guidelines

| LOD level | Typical triangle count | Usage |
|-----------|----------------------|-------|
| LOD0 | Full model | Close-up (< 20m) |
| LOD1 | 50% of LOD0 | Mid-range (20–50m) |
| LOD2 | 10–25% of LOD0 | Far (50–100m) |
| Billboard | 2 triangles + texture | Very far / impostor |

---

## Material & Shader Optimization

### Reduce Material Count

Every unique material potentially creates a new draw call. Strategies:

1. **Texture atlases** — Pack multiple textures into one atlas so objects share a single material.
2. **Material instances** — Use `material.clone()` only when truly needed. Shared materials = batch-friendly.
3. **Disable unused maps** — If an object doesn't need a normal map, don't assign one. Each map adds texture sampling cost.

### Shader Complexity

```typescript
// Prefer StandardMaterial settings that match your visual needs:
const mat = new pc.StandardMaterial();
mat.useLighting = true;
mat.useMetalness = true;     // PBR metalness workflow
mat.useFog = false;          // Disable if not needed
mat.useGammaTonemap = true;  // Correct for linear workflow
mat.useSkybox = false;       // Disable if no environment reflections

// Fewer features = simpler compiled shader = faster rendering
mat.update();
```

---

## Texture Optimization

| Technique | Impact | How |
|-----------|--------|-----|
| Compressed textures (Basis/KTX2) | 4–8× smaller GPU memory, faster upload | Use `basis` or `ktx2` format in assets |
| Mipmaps | Reduces aliasing and texture cache misses | Enabled by default — don't disable |
| Power-of-two sizes | Required for mipmaps on WebGL 1; best practice everywhere | 256, 512, 1024, 2048 |
| Texture resolution audit | Textures > 2048 on mobile = memory pressure | Profile and downscale |
| Texture streaming | Load low-res first, swap to high-res | Custom loader or engine asset streaming |

---

## Runtime Profiling

### Built-In Stats

```typescript
app.stats; // Access runtime statistics

// Key metrics to monitor:
// app.stats.drawCalls   — total draw calls this frame
// app.stats.frame.fps   — frames per second
// app.stats.vram        — estimated video memory usage
```

### Profiler Overlay

In the PlayCanvas Editor, press **Ctrl+Shift+P** (or toggle via Settings) to show the profiler overlay. In code:

```typescript
app.setCanvasFillMode(pc.FILLMODE_FILL_WINDOW);
app.setCanvasResolution(pc.RESOLUTION_AUTO);

// Enable stats overlay
const stats = new pc.StatsTimer(app);
```

### Chrome DevTools + WebGL

- **Performance tab** — Record and look for long frames. GPU-bound frames show short JS but long compositing.
- **Spector.js** — WebGL debugger that captures draw calls, state, and textures per frame.
- **WebGPU** — Chrome's GPU inspector shows command buffers and pipeline state.

---

## Mobile-Specific Optimization

| Technique | Why |
|-----------|-----|
| Target 30 FPS if 60 isn't stable | Consistent 30 > stuttery 60 |
| Halve resolution with `app.graphicsDevice.maxPixelRatio = 1` | Reduces fill rate pressure |
| Limit shadow map resolution to 512–1024 | Shadow rendering is expensive |
| Use `lightmapMode: pc.BAKE_COLORDIR` | Baked lighting = zero runtime light cost |
| Disable real-time shadows on mobile | Or limit to 1 directional light |
| Reduce post-processing passes | Bloom, SSAO, and motion blur are fill-rate killers |
| Compress all textures to Basis/KTX2 | Saves GPU memory and upload time |

---

## Optimization Checklist

Use this checklist when profiling a PlayCanvas game:

1. **Measure first** — Check `app.stats.drawCalls` and FPS. Don't optimise blindly.
2. **Batch static geometry** — Create `BatchGroup`s for environment, props, decorations.
3. **Instance repeated objects** — Trees, grass, rocks, particles → hardware instancing.
4. **Enable frustum culling** — Default on, but verify it's not disabled on your cameras.
5. **Add LOD** — Any model > 5k triangles that appears at varying distances.
6. **Audit materials** — Merge where possible. Use texture atlases.
7. **Compress textures** — Basis/KTX2 everywhere. No uncompressed PNG/JPG on GPU.
8. **Profile on target hardware** — A fast desktop hides mobile bottlenecks.
9. **Reduce shadow casters** — Only cast shadows from objects that need them.
10. **Limit real-time lights** — Each light can multiply draw calls (forward rendering).

---

## Common Pitfalls

1. **Batching everything into one giant mesh** — Defeats frustum culling. Keep `maxAabbSize` reasonable so the engine can still cull large groups.
2. **Using instancing for skinned meshes** — Not supported. Use LOD and culling instead.
3. **Unique material per object** — Clone materials only when needed. Shared materials enable batching.
4. **Ignoring texture sizes** — A single 4096×4096 RGBA texture uses ~64 MB of GPU memory uncompressed.
5. **Not profiling on mobile** — Desktop performance is misleading. Always test on the lowest-spec target device.
6. **Dynamic batching for hundreds of objects** — The per-frame merge cost exceeds the draw call savings. Switch to instancing.
