# Procedural Generation

> **Category:** reference · **Engine:** Babylon.js · **Related:** [G1 Physics (Havok)](../guides/G1_physics_havok.md), [G8 Optimization & Performance](../guides/G8_optimization_performance.md), [E1 Architecture Overview](../architecture/E1_architecture_overview.md)

Babylon.js provides multiple layers of procedural generation support, from simple heightmap terrain to a full node-based geometry system inspired by Blender's Geometry Nodes. This reference covers the three main approaches: MeshBuilder primitives, the DynamicTerrain extension, and the Node Geometry system.

---

## 1. MeshBuilder Procedural Primitives

The simplest path to procedural content. `MeshBuilder` methods generate `VertexData` on the CPU and upload it to the GPU as a standard `Mesh`.

### Height-Map Terrain

```typescript
import { MeshBuilder, Scene } from "@babylonjs/core";

const ground = MeshBuilder.CreateGroundFromHeightMap(
  "terrain",
  "textures/heightmap.png",
  {
    width: 200,
    height: 200,
    subdivisions: 128,    // vertex density — higher = more detail
    minHeight: 0,
    maxHeight: 30,
    onReady: (mesh) => {
      // Mesh is ready — safe to add physics impostor
      mesh.receiveShadows = true;
    },
  },
  scene
);
```

### Custom VertexData

For full control, build vertex data directly:

```typescript
import {
  Mesh, VertexData, Vector3, Scene
} from "@babylonjs/core";

function createProceduralPlane(
  width: number,
  depth: number,
  segW: number,
  segD: number,
  heightFn: (x: number, z: number) => number,
  scene: Scene
): Mesh {
  const positions: number[] = [];
  const indices: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];

  // Generate vertices
  for (let iz = 0; iz <= segD; iz++) {
    for (let ix = 0; ix <= segW; ix++) {
      const x = (ix / segW - 0.5) * width;
      const z = (iz / segD - 0.5) * depth;
      const y = heightFn(x, z);

      positions.push(x, y, z);
      uvs.push(ix / segW, iz / segD);
    }
  }

  // Generate triangle indices
  for (let iz = 0; iz < segD; iz++) {
    for (let ix = 0; ix < segW; ix++) {
      const a = iz * (segW + 1) + ix;
      const b = a + 1;
      const c = a + (segW + 1);
      const d = c + 1;
      indices.push(a, c, b, b, c, d);
    }
  }

  // Auto-compute normals
  VertexData.ComputeNormals(positions, indices, normals);

  const vertexData = new VertexData();
  vertexData.positions = positions;
  vertexData.indices = indices;
  vertexData.normals = normals;
  vertexData.uvs = uvs;

  const mesh = new Mesh("procPlane", scene);
  vertexData.applyToMesh(mesh);
  return mesh;
}

// Usage with Perlin noise
const terrain = createProceduralPlane(
  500, 500, 256, 256,
  (x, z) => perlinNoise2D(x * 0.01, z * 0.01) * 20,
  scene
);
```

### Updatable Meshes

Pass `updatable: true` to MeshBuilder options when vertices change at runtime:

```typescript
const ribbon = MeshBuilder.CreateRibbon("wave", {
  pathArray: paths,
  updatable: true,
}, scene);

// Later: update paths and rebuild
MeshBuilder.CreateRibbon("wave", {
  pathArray: newPaths,
  instance: ribbon,  // reuse existing mesh
});
```

> **Performance:** Updatable meshes keep a CPU-side copy of vertex data. For static procedural content, leave `updatable: false` (default) to free that memory.

---

## 2. DynamicTerrain Extension

The DynamicTerrain is a community extension for streaming large worlds. It renders a moving window of terrain around the camera, morphing a fixed-size ribbon mesh from a much larger data map.

### Setup

```typescript
// ES module import (from BabylonJS/Extensions)
import { DynamicTerrain } from "babylonjs-dynamic-terrain";

// Generate map data — flat Float32Array of [x, y, z] per point
const mapSubX = 1000;
const mapSubZ = 1000;
const mapData = new Float32Array(mapSubX * mapSubZ * 3);

for (let z = 0; z < mapSubZ; z++) {
  for (let x = 0; x < mapSubX; x++) {
    const idx = 3 * (z * mapSubX + x);
    const worldX = (x - mapSubX / 2) * 2;
    const worldZ = (z - mapSubZ / 2) * 2;
    mapData[idx] = worldX;
    mapData[idx + 1] = perlinNoise2D(worldX * 0.005, worldZ * 0.005) * 40;
    mapData[idx + 2] = worldZ;
  }
}

const terrain = new DynamicTerrain("world", {
  mapData,
  mapSubX,
  mapSubZ,
  terrainSub: 100,     // visible mesh subdivisions per axis
}, scene);
```

### LOD Configuration

DynamicTerrain supports automatic level-of-detail based on camera altitude:

```typescript
// Camera-driven LOD: higher altitude → more aggressive simplification
terrain.updateCameraLOD = (camera) => {
  return Math.max(0, Math.floor(camera.position.y / 50));
};

// Perimetric LOD: terrain edges render at lower detail
terrain.LODLimits = [4, 3, 2, 1];  // each ring outward increases LOD

// Update throttling: skip terrain update until camera moves N quads
terrain.subToleranceX = 4;
terrain.subToleranceZ = 4;
```

### Custom Vertex Functions

For runtime terrain modification (e.g., deformation, biome coloring):

```typescript
terrain.useCustomVertexFunction = true;
terrain.computeNormals = true;

terrain.updateVertex = (vertex, i, j) => {
  // vertex.position — editable Vector3
  // vertex.color — editable Color4
  // vertex.uvs — editable Vector2
  // vertex.worldPosition — read-only world pos
  // vertex.mapIndex — index into mapData

  // Example: tint based on elevation
  const height = vertex.position.y;
  if (height > 20) {
    vertex.color.set(1, 1, 1, 1);       // snow
  } else if (height > 10) {
    vertex.color.set(0.4, 0.35, 0.3, 1); // rock
  } else {
    vertex.color.set(0.2, 0.6, 0.1, 1);  // grass
  }
};
```

### Camera-Following (FPS-Style)

```typescript
const playerHeight = 1.8;
scene.registerBeforeRender(() => {
  camera.position.y = terrain.getHeightFromMap(
    camera.position.x, camera.position.z
  ) + playerHeight;
});
```

---

## 3. Node Geometry System

Introduced in Babylon.js 7.0, Node Geometry is a CPU-side procedural geometry pipeline using a directed node graph. It processes `VertexData` through blocks — sources, transforms, math, noise, instancing — and outputs a final mesh. Think of it as a shader graph, but for geometry.

### Basic Pipeline

```typescript
import {
  NodeGeometry,
  SphereBlock,
  SetPositionsBlock,
  NoiseBlock,
  MathBlock,
  GeometryOutputBlock,
  GeometryInputBlock,
  NodeGeometryContextualSources,
} from "@babylonjs/core";

const ng = new NodeGeometry("terrain-geo");

// Source: sphere with high subdivision
const sphere = new SphereBlock("sphere");
sphere.subdivisions = 64;

// Read current positions
const positions = new GeometryInputBlock("pos");
positions.contextualValue = NodeGeometryContextualSources.Positions;

// Apply noise displacement
const noise = new NoiseBlock("noise");
positions.output.connectTo(noise.input);

// Math: scale the noise
const math = new MathBlock("scale");
math.operation = 0; // Multiply
noise.output.connectTo(math.left);
// Connect a float constant for amplitude...

// Write modified positions back
const setPos = new SetPositionsBlock("setPos");
sphere.geometry.connectTo(setPos.geometry);
noise.output.connectTo(setPos.positions);

// Output
const output = new GeometryOutputBlock("out");
ng.outputBlock = output;
setPos.output.connectTo(output.geometry);

// Build (async — wait for observable)
ng.onBuildObservable.addOnce(() => {
  const mesh = ng.createMesh("proceduralMesh", scene);
});
ng.build();
```

### Available Source Blocks

Box, Capsule, Cylinder, Disc, Grid, IcoSphere, Mesh (import external), Plane, Sphere, Torus.

### Instancing Blocks

Distribute geometry across surfaces or vertices:

```typescript
// Place trees at every vertex of a ground mesh
const instantiate = new InstantiateOnVerticesBlock("scatter");
groundSource.geometry.connectTo(instantiate.geometry);
treeSource.geometry.connectTo(instantiate.instance);
// Output: merged mesh with tree at each ground vertex
```

- `InstantiateOnVerticesBlock` — one instance per vertex
- `InstantiateOnFacesBlock` — distribute N instances across faces
- `MergeBlock` — combine multiple geometry streams

### Node Geometry Editor

The visual editor at **nge.babylonjs.com** lets you build node graphs interactively, then export JSON for runtime loading:

```typescript
// Load a graph built in the Node Geometry Editor
const ng = await NodeGeometry.ParseFromSnippetAsync("IJA02K#11");
const mesh = ng.createMesh("fromEditor", scene);
```

### Performance Considerations

| Concern | Guidance |
|---------|----------|
| **CPU-bound** | Node Geometry runs entirely on the CPU. Keep vertex counts reasonable for real-time generation. |
| **Build once** | Build at load time, not per frame. The output mesh renders at normal GPU speed. |
| **`evaluateContext`** | Set to `false` on blocks that don't read contextual values to skip per-vertex context evaluation. |
| **Instancing vs. merging** | `InstantiateOnVerticesBlock` merges all instances into one draw call — great for static scatter, but the merged mesh can be very large. |
| **Serialization** | Ship `.json` graph definitions rather than building graphs in code for complex procedural assets. |

---

## Comparison of Approaches

| Approach | Best For | Complexity | Runtime Cost |
|----------|----------|------------|-------------|
| `MeshBuilder` + `VertexData` | Simple terrain, custom shapes | Low | One-time CPU |
| `DynamicTerrain` extension | Large open worlds, streaming | Medium | Per-frame CPU (morph) |
| Node Geometry | Complex procedural assets, scatter | Medium–High | One-time CPU (build) |

---

## Integration with Physics

All three approaches produce standard `Mesh` objects compatible with Havok physics:

```typescript
import { PhysicsAggregate, PhysicsShapeType } from "@babylonjs/core";

// For heightmap terrain — use MESH shape for accurate collision
new PhysicsAggregate(
  terrain,
  PhysicsShapeType.MESH,
  { mass: 0 },  // static
  scene
);
```

> **Tip:** For DynamicTerrain, the mesh changes each frame. Use a simplified collision heightfield or raycast against `terrain.getHeightFromMap()` instead of a physics mesh shape, which would need to be rebuilt constantly.
