# R3 — Procedural Generation for Games

> **Category:** reference · **Engine:** Three.js · **Related:** [Architecture Overview](../architecture/E1_architecture_overview.md), [Optimization & Performance](../guides/G6_optimization_performance.md), [TSL Node Materials](../guides/G2_tsl_node_materials.md), [Three.js Procedural Terrain Example](https://threejs.org/examples/webgpu_tsl_procedural_terrain.html)

Procedural generation creates game content algorithmically — terrain, dungeons, vegetation, textures — instead of handcrafting every asset. In Three.js this means manipulating `BufferGeometry` vertex data, leveraging noise functions (Perlin, Simplex, Worley), and combining it all with instancing for performance. This reference covers the core techniques game developers need.

---

## Noise Functions

Noise is the foundation of most procedural generation. The two most common variants for game terrain and textures are **Perlin noise** and **Simplex noise**. Three.js does not include noise functions in its core — use a library or implement your own.

### Recommended Libraries

| Library | Install | Notes |
|---------|---------|-------|
| `simplex-noise` | `npm install simplex-noise` | Fast, TypeScript-native, 2D/3D/4D simplex noise |
| `open-simplex-noise` | `npm install open-simplex-noise` | Patent-free alternative, good for commercial games |
| Three.js TSL noise | Built into `three/tsl` | GPU-side noise for shaders (see [TSL guide](../guides/G2_tsl_node_materials.md)) |

### Basic Noise Heightmap

```typescript
import * as THREE from 'three';
import { createNoise2D } from 'simplex-noise';

const noise2D = createNoise2D();

function generateHeightmap(width: number, depth: number, scale: number): Float32Array {
  const heights = new Float32Array(width * depth);
  for (let z = 0; z < depth; z++) {
    for (let x = 0; x < width; x++) {
      // Layer multiple octaves for natural-looking terrain
      let height = 0;
      let amplitude = 1;
      let frequency = 1;
      for (let octave = 0; octave < 6; octave++) {
        height += amplitude * noise2D(
          (x / scale) * frequency,
          (z / scale) * frequency
        );
        amplitude *= 0.5;   // Each octave contributes less
        frequency *= 2.0;   // Each octave has higher frequency
      }
      heights[z * width + x] = height;
    }
  }
  return heights;
}
```

### Octave Layering (Fractal Brownian Motion)

Layering noise at different frequencies and amplitudes produces natural terrain variation. The key parameters are:

- **Octaves** — number of noise layers (4–8 typical; more = more detail, more cost)
- **Lacunarity** — frequency multiplier per octave (usually 2.0)
- **Persistence** — amplitude multiplier per octave (usually 0.5)
- **Scale** — base frequency divisor (larger = smoother terrain)

---

## Terrain Mesh Generation

### Creating a Terrain from a Heightmap

```typescript
import * as THREE from 'three';

function createTerrainGeometry(
  heightmap: Float32Array,
  width: number,
  depth: number,
  heightScale: number = 10
): THREE.BufferGeometry {
  const geometry = new THREE.PlaneGeometry(width, depth, width - 1, depth - 1);
  geometry.rotateX(-Math.PI / 2); // Lay flat on XZ plane

  const positions = geometry.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < positions.count; i++) {
    // PlaneGeometry vertices are in XYZ after rotation — Y is up
    positions.setY(i, heightmap[i] * heightScale);
  }

  positions.needsUpdate = true;
  geometry.computeVertexNormals(); // Recalculate normals for correct lighting
  geometry.computeBoundingBox();

  return geometry;
}

// Usage
const size = 256;
const heightmap = generateHeightmap(size, size, 64);
const terrainGeometry = createTerrainGeometry(heightmap, size, size, 15);
const terrainMaterial = new THREE.MeshStandardMaterial({
  color: 0x4a7c3f,
  flatShading: false,
  wireframe: false,
});
const terrain = new THREE.Mesh(terrainGeometry, terrainMaterial);
scene.add(terrain);
```

### Chunked Terrain for Large Worlds

For open-world games, generate terrain in chunks and load/unload based on camera distance:

```typescript
interface TerrainChunk {
  mesh: THREE.Mesh;
  chunkX: number;
  chunkZ: number;
}

class ChunkedTerrain {
  private chunks = new Map<string, TerrainChunk>();
  private readonly chunkSize: number;
  private readonly viewDistance: number;

  constructor(chunkSize: number = 64, viewDistance: number = 3) {
    this.chunkSize = chunkSize;
    this.viewDistance = viewDistance;
  }

  update(cameraPosition: THREE.Vector3, scene: THREE.Scene): void {
    const cx = Math.floor(cameraPosition.x / this.chunkSize);
    const cz = Math.floor(cameraPosition.z / this.chunkSize);

    // Load chunks within view distance
    for (let dz = -this.viewDistance; dz <= this.viewDistance; dz++) {
      for (let dx = -this.viewDistance; dx <= this.viewDistance; dx++) {
        const key = `${cx + dx},${cz + dz}`;
        if (!this.chunks.has(key)) {
          const chunk = this.createChunk(cx + dx, cz + dz);
          this.chunks.set(key, chunk);
          scene.add(chunk.mesh);
        }
      }
    }

    // Unload chunks outside view distance + buffer
    for (const [key, chunk] of this.chunks) {
      const dist = Math.max(
        Math.abs(chunk.chunkX - cx),
        Math.abs(chunk.chunkZ - cz)
      );
      if (dist > this.viewDistance + 1) {
        scene.remove(chunk.mesh);
        chunk.mesh.geometry.dispose();
        (chunk.mesh.material as THREE.Material).dispose();
        this.chunks.delete(key);
      }
    }
  }

  private createChunk(chunkX: number, chunkZ: number): TerrainChunk {
    const offsetX = chunkX * this.chunkSize;
    const offsetZ = chunkZ * this.chunkSize;

    // Generate heightmap for this chunk's world-space coordinates
    const heightmap = generateHeightmapAtOffset(
      this.chunkSize, this.chunkSize, 64, offsetX, offsetZ
    );
    const geometry = createTerrainGeometry(
      heightmap, this.chunkSize, this.chunkSize, 15
    );
    const material = new THREE.MeshStandardMaterial({ color: 0x4a7c3f });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(offsetX, 0, offsetZ);

    return { mesh, chunkX, chunkZ };
  }
}
```

> **Performance note:** Each chunk is a separate draw call. For very large view distances, combine adjacent chunks with `BufferGeometryUtils.mergeGeometries()` or use `BatchedMesh` (see [Optimization guide](../guides/G6_optimization_performance.md)).

---

## Dungeon & Level Generation

### Binary Space Partition (BSP) Rooms

BSP is a classic algorithm for generating dungeon rooms with corridors. It recursively splits a rectangle into two halves, places rooms in the leaves, and connects them.

```typescript
interface Room {
  x: number; y: number;
  width: number; height: number;
}

interface BSPNode {
  x: number; y: number;
  width: number; height: number;
  left?: BSPNode;
  right?: BSPNode;
  room?: Room;
}

function splitBSP(
  node: BSPNode,
  minSize: number,
  depth: number = 0,
  maxDepth: number = 5
): void {
  if (depth >= maxDepth || node.width < minSize * 2 || node.height < minSize * 2) {
    // Leaf node — place a room with random padding
    const padding = 2;
    const rw = minSize + Math.floor(Math.random() * (node.width - minSize - padding));
    const rh = minSize + Math.floor(Math.random() * (node.height - minSize - padding));
    const rx = node.x + Math.floor(Math.random() * (node.width - rw));
    const ry = node.y + Math.floor(Math.random() * (node.height - rh));
    node.room = { x: rx, y: ry, width: rw, height: rh };
    return;
  }

  const horizontal = Math.random() > 0.5;
  if (horizontal) {
    const split = minSize + Math.floor(Math.random() * (node.height - minSize * 2));
    node.left  = { x: node.x, y: node.y, width: node.width, height: split };
    node.right = { x: node.x, y: node.y + split, width: node.width, height: node.height - split };
  } else {
    const split = minSize + Math.floor(Math.random() * (node.width - minSize * 2));
    node.left  = { x: node.x, y: node.y, width: split, height: node.height };
    node.right = { x: node.x + split, y: node.y, width: node.width - split, height: node.height };
  }

  splitBSP(node.left, minSize, depth + 1, maxDepth);
  splitBSP(node.right, minSize, depth + 1, maxDepth);
}
```

### Converting BSP to Three.js Geometry

```typescript
function bspToMeshes(node: BSPNode, scene: THREE.Scene, wallHeight: number = 3): void {
  if (node.room) {
    const { x, y, width, height } = node.room;

    // Floor
    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(width, height),
      new THREE.MeshStandardMaterial({ color: 0x666666 })
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(x + width / 2, 0, y + height / 2);
    scene.add(floor);

    // Walls — four thin boxes around the perimeter
    const wallMat = new THREE.MeshStandardMaterial({ color: 0x888888 });
    const walls = [
      { w: width, d: 0.2, px: x + width / 2, pz: y },            // north
      { w: width, d: 0.2, px: x + width / 2, pz: y + height },   // south
      { w: 0.2, d: height, px: x, pz: y + height / 2 },          // west
      { w: 0.2, d: height, px: x + width, pz: y + height / 2 },  // east
    ];
    for (const w of walls) {
      const wall = new THREE.Mesh(
        new THREE.BoxGeometry(w.w, wallHeight, w.d),
        wallMat
      );
      wall.position.set(w.px, wallHeight / 2, w.pz);
      scene.add(wall);
    }
    return;
  }

  if (node.left) bspToMeshes(node.left, scene, wallHeight);
  if (node.right) bspToMeshes(node.right, scene, wallHeight);
}
```

---

## Vegetation & Object Scattering

Use Poisson disk sampling for natural-looking placement, then render with `InstancedMesh` for performance.

```typescript
import * as THREE from 'three';

/** Simple 2D Poisson disk sampling via Bridson's algorithm */
function poissonDisk2D(
  width: number, height: number,
  minDist: number, maxAttempts: number = 30
): Array<{ x: number; z: number }> {
  const cellSize = minDist / Math.SQRT2;
  const gridW = Math.ceil(width / cellSize);
  const gridH = Math.ceil(height / cellSize);
  const grid: (number | null)[] = new Array(gridW * gridH).fill(null);
  const points: Array<{ x: number; z: number }> = [];
  const active: number[] = [];

  const addPoint = (x: number, z: number): void => {
    const idx = points.length;
    points.push({ x, z });
    active.push(idx);
    const gx = Math.floor(x / cellSize);
    const gz = Math.floor(z / cellSize);
    grid[gz * gridW + gx] = idx;
  };

  addPoint(Math.random() * width, Math.random() * height);

  while (active.length > 0) {
    const ri = Math.floor(Math.random() * active.length);
    const base = points[active[ri]];
    let found = false;

    for (let a = 0; a < maxAttempts; a++) {
      const angle = Math.random() * Math.PI * 2;
      const dist = minDist + Math.random() * minDist;
      const nx = base.x + Math.cos(angle) * dist;
      const nz = base.z + Math.sin(angle) * dist;

      if (nx < 0 || nx >= width || nz < 0 || nz >= height) continue;

      const gx = Math.floor(nx / cellSize);
      const gz = Math.floor(nz / cellSize);
      let tooClose = false;

      for (let dz = -2; dz <= 2 && !tooClose; dz++) {
        for (let dx = -2; dx <= 2 && !tooClose; dx++) {
          const ci = (gz + dz) * gridW + (gx + dx);
          if (ci >= 0 && ci < grid.length && grid[ci] !== null) {
            const p = points[grid[ci]!];
            if ((p.x - nx) ** 2 + (p.z - nz) ** 2 < minDist ** 2) {
              tooClose = true;
            }
          }
        }
      }

      if (!tooClose) {
        addPoint(nx, nz);
        found = true;
        break;
      }
    }

    if (!found) active.splice(ri, 1);
  }

  return points;
}

// Scatter trees as InstancedMesh
function scatterTrees(
  scene: THREE.Scene,
  terrainSize: number,
  treeGeometry: THREE.BufferGeometry,
  treeMaterial: THREE.Material
): void {
  const positions = poissonDisk2D(terrainSize, terrainSize, 5);
  const instancedMesh = new THREE.InstancedMesh(
    treeGeometry, treeMaterial, positions.length
  );

  const dummy = new THREE.Object3D();
  for (let i = 0; i < positions.length; i++) {
    const { x, z } = positions[i];
    dummy.position.set(x - terrainSize / 2, 0, z - terrainSize / 2);
    dummy.scale.setScalar(0.8 + Math.random() * 0.4); // slight size variation
    dummy.rotation.y = Math.random() * Math.PI * 2;
    dummy.updateMatrix();
    instancedMesh.setMatrixAt(i, dummy.matrix);
  }

  instancedMesh.instanceMatrix.needsUpdate = true;
  scene.add(instancedMesh);
}
```

> **Performance note:** 10,000 trees as individual `Mesh` objects = 10,000 draw calls. As a single `InstancedMesh` = 1 draw call. Always instance repeated procedural objects.

---

## GPU-Side Procedural Generation with TSL

For real-time procedural effects (infinite terrain, animated water, clouds), run noise on the GPU via Three.js Shading Language (TSL) with the WebGPU renderer:

```typescript
import * as THREE from 'three/webgpu';
import { mx_noise_float, positionLocal, uniform, vec2 } from 'three/tsl';

const heightScale = uniform(10.0);
const noiseScale  = uniform(0.05);

// Displace vertices on the GPU — zero CPU cost per frame
const displacement = mx_noise_float(
  vec2(positionLocal.x.mul(noiseScale), positionLocal.z.mul(noiseScale))
).mul(heightScale);

const material = new THREE.MeshStandardNodeMaterial();
material.positionNode = positionLocal.add(
  THREE.vec3(0, displacement, 0)
);
```

This approach is essential for infinite terrain or real-time deformation since no CPU-side vertex updates are needed. See the [WebGPU Renderer guide](../guides/G9_webgpu_renderer.md) and [TSL guide](../guides/G2_tsl_node_materials.md) for setup details.

---

## Seeded Randomness

For reproducible worlds (save/load, multiplayer sync), never use `Math.random()` directly. Use a seeded PRNG:

```typescript
/** Simple mulberry32 seeded PRNG — returns [0, 1) */
function seededRandom(seed: number): () => number {
  let s = seed | 0;
  return (): number => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Usage — same seed always produces the same world
const rng = seededRandom(42);
const noise2D = createNoise2D(rng); // simplex-noise accepts custom RNG
```

---

## Performance Considerations

| Technique | CPU Cost | GPU Cost | Best For |
|-----------|----------|----------|----------|
| CPU heightmap + BufferGeometry | Medium (generation) | Low (static mesh) | Pre-generated terrain, dungeons |
| Chunked terrain | Medium (per chunk) | Low (culled chunks) | Open worlds, streaming |
| TSL GPU displacement | None (after setup) | Medium (per vertex/frame) | Infinite terrain, water, clouds |
| InstancedMesh scattering | Low (matrix setup) | Low (1 draw call) | Trees, rocks, props |
| BSP dungeon generation | Low (once) | Low (static geometry) | Indoor levels, roguelikes |

**Mobile budgets:** Keep chunk vertex counts under 65k (16-bit index buffer limit). Use `Uint32Array` indices for larger chunks on desktop only. Limit noise octaves to 4 on mobile GPUs.
