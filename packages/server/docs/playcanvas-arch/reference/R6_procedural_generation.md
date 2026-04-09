# Procedural Generation

> **Category:** reference · **Engine:** PlayCanvas · **Related:** [G7_optimization_performance.md](../guides/G7_optimization_performance.md), [G2_physics_ammo.md](../guides/G2_physics_ammo.md), [R1_particle_vfx_systems.md](R1_particle_vfx_systems.md)

PlayCanvas provides a procedural `Mesh` API for generating geometry at runtime — terrain from heightmaps, infinite level chunks, parametric shapes, and deformable meshes. Combined with the Entity-Component system and Ammo.js physics, you can build fully procedural game worlds.

## The Procedural Mesh API

Since engine v1.27.0, PlayCanvas provides high-level methods on `pc.Mesh` for setting vertex data without manually constructing vertex buffers. The workflow is: create a mesh, set positions/normals/UVs/indices, call `update()`.

### Basic Procedural Quad

```typescript
const app = this.app;
const mesh = new pc.Mesh(app.graphicsDevice);

// Vertex positions (flat array, 3 floats per vertex)
const positions: number[] = [
  -1, 0, -1,  // bottom-left
   1, 0, -1,  // bottom-right
   1, 0,  1,  // top-right
  -1, 0,  1,  // top-left
];

// Normals (all pointing up for a flat surface)
const normals: number[] = [
  0, 1, 0,
  0, 1, 0,
  0, 1, 0,
  0, 1, 0,
];

// UV coordinates
const uvs: number[] = [
  0, 0,
  1, 0,
  1, 1,
  0, 1,
];

// Triangle indices (two triangles forming a quad)
const indices: number[] = [
  0, 1, 2,
  0, 2, 3,
];

mesh.setPositions(positions);
mesh.setNormals(normals);
mesh.setUvs(0, uvs);  // channel 0
mesh.setIndices(indices);
mesh.update(pc.PRIMITIVE_TRIANGLES);
```

### Attaching to an Entity

```typescript
// Create a material
const material = new pc.StandardMaterial();
material.diffuseMap = someTexture;
material.update();

// Create a MeshInstance and add it to an entity
const meshInstance = new pc.MeshInstance(mesh, material);
const entity = new pc.Entity('proceduralMesh');
entity.addComponent('render', {
  meshInstances: [meshInstance],
});
app.root.addChild(entity);
```

## Terrain Generation from Heightmaps

The most common procedural use case is terrain. Read pixel data from a heightmap texture and generate a subdivided grid mesh.

```typescript
interface TerrainConfig {
  heightmap: HTMLImageElement;
  width: number;        // world units X
  depth: number;        // world units Z
  height: number;       // max world height Y
  subdivisions: number; // grid subdivisions per axis
}

function generateTerrain(
  device: pc.GraphicsDevice,
  config: TerrainConfig
): pc.Mesh {
  const { heightmap, width, depth, height, subdivisions } = config;
  const cols = subdivisions + 1;
  const rows = subdivisions + 1;
  const vertexCount = cols * rows;
  const triCount = subdivisions * subdivisions * 2;

  // Read heightmap pixel data
  const canvas = document.createElement('canvas');
  canvas.width = heightmap.width;
  canvas.height = heightmap.height;
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(heightmap, 0, 0);
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const pixels = imageData.data;

  // Use typed arrays for performance
  const positions = new Float32Array(vertexCount * 3);
  const normals = new Float32Array(vertexCount * 3);
  const uvs = new Float32Array(vertexCount * 2);
  const indices = new Uint32Array(triCount * 3);

  // Generate vertex positions from heightmap
  for (let z = 0; z < rows; z++) {
    for (let x = 0; x < cols; x++) {
      const i = z * cols + x;

      // Map grid position to world coordinates
      const worldX = (x / subdivisions - 0.5) * width;
      const worldZ = (z / subdivisions - 0.5) * depth;

      // Sample heightmap (bilinear would be better for production)
      const sampleX = Math.floor((x / subdivisions) * (canvas.width - 1));
      const sampleZ = Math.floor((z / subdivisions) * (canvas.height - 1));
      const pixelIndex = (sampleZ * canvas.width + sampleX) * 4;
      const heightValue = pixels[pixelIndex] / 255; // 0–1 from red channel

      positions[i * 3 + 0] = worldX;
      positions[i * 3 + 1] = heightValue * height;
      positions[i * 3 + 2] = worldZ;

      uvs[i * 2 + 0] = x / subdivisions;
      uvs[i * 2 + 1] = z / subdivisions;
    }
  }

  // Generate triangle indices
  let idx = 0;
  for (let z = 0; z < subdivisions; z++) {
    for (let x = 0; x < subdivisions; x++) {
      const topLeft = z * cols + x;
      const topRight = topLeft + 1;
      const bottomLeft = (z + 1) * cols + x;
      const bottomRight = bottomLeft + 1;

      // Two triangles per quad
      indices[idx++] = topLeft;
      indices[idx++] = bottomLeft;
      indices[idx++] = topRight;

      indices[idx++] = topRight;
      indices[idx++] = bottomLeft;
      indices[idx++] = bottomRight;
    }
  }

  // Calculate normals from cross products of adjacent triangles
  calculateNormals(positions, indices, normals, vertexCount);

  // Build the mesh
  const mesh = new pc.Mesh(device);
  mesh.setPositions(positions, 3);
  mesh.setNormals(normals, 3);
  mesh.setUvs(0, uvs, 2);
  mesh.setIndices(indices);
  mesh.update(pc.PRIMITIVE_TRIANGLES);

  return mesh;
}

function calculateNormals(
  positions: Float32Array,
  indices: Uint32Array,
  normals: Float32Array,
  vertexCount: number
): void {
  // Zero out normals
  normals.fill(0);

  const v0 = new pc.Vec3();
  const v1 = new pc.Vec3();
  const v2 = new pc.Vec3();
  const edge1 = new pc.Vec3();
  const edge2 = new pc.Vec3();
  const faceNormal = new pc.Vec3();

  // Accumulate face normals per vertex
  for (let i = 0; i < indices.length; i += 3) {
    const i0 = indices[i], i1 = indices[i + 1], i2 = indices[i + 2];
    v0.set(positions[i0 * 3], positions[i0 * 3 + 1], positions[i0 * 3 + 2]);
    v1.set(positions[i1 * 3], positions[i1 * 3 + 1], positions[i1 * 3 + 2]);
    v2.set(positions[i2 * 3], positions[i2 * 3 + 1], positions[i2 * 3 + 2]);

    edge1.sub2(v1, v0);
    edge2.sub2(v2, v0);
    faceNormal.cross(edge1, edge2);

    for (const vi of [i0, i1, i2]) {
      normals[vi * 3 + 0] += faceNormal.x;
      normals[vi * 3 + 1] += faceNormal.y;
      normals[vi * 3 + 2] += faceNormal.z;
    }
  }

  // Normalize
  const n = new pc.Vec3();
  for (let i = 0; i < vertexCount; i++) {
    n.set(normals[i * 3], normals[i * 3 + 1], normals[i * 3 + 2]);
    n.normalize();
    normals[i * 3 + 0] = n.x;
    normals[i * 3 + 1] = n.y;
    normals[i * 3 + 2] = n.z;
  }
}
```

### Adding Physics Collision to Terrain

Use Ammo.js heightfield shape or generate a trimesh collision body:

```typescript
function addTerrainCollision(
  entity: pc.Entity,
  config: TerrainConfig,
  heightData: Float32Array
): void {
  // Option 1: Simple static rigidbody with mesh collision
  entity.addComponent('collision', {
    type: 'mesh',
    renderAsset: null, // uses the render component's mesh
  });

  entity.addComponent('rigidbody', {
    type: 'static',
    friction: 0.8,
    restitution: 0.2,
  });
}
```

## Infinite Terrain with Chunk Streaming

For open-world games, generate terrain in chunks around the player and recycle distant chunks.

```typescript
interface ChunkManager {
  chunkSize: number;
  viewDistance: number;   // chunks visible in each direction
  activeChunks: Map<string, pc.Entity>;
}

function updateChunks(
  manager: ChunkManager,
  playerPos: pc.Vec3,
  app: pc.Application
): void {
  const { chunkSize, viewDistance, activeChunks } = manager;

  // Current chunk coordinates
  const cx = Math.floor(playerPos.x / chunkSize);
  const cz = Math.floor(playerPos.z / chunkSize);

  const neededKeys = new Set<string>();

  // Determine which chunks should exist
  for (let dz = -viewDistance; dz <= viewDistance; dz++) {
    for (let dx = -viewDistance; dx <= viewDistance; dx++) {
      const key = `${cx + dx},${cz + dz}`;
      neededKeys.add(key);

      if (!activeChunks.has(key)) {
        // Generate and add new chunk
        const chunkEntity = generateChunkEntity(
          app,
          cx + dx,
          cz + dz,
          chunkSize
        );
        app.root.addChild(chunkEntity);
        activeChunks.set(key, chunkEntity);
      }
    }
  }

  // Remove chunks that are too far away
  for (const [key, entity] of activeChunks) {
    if (!neededKeys.has(key)) {
      entity.destroy(); // removes from scene and frees GPU resources
      activeChunks.delete(key);
    }
  }
}

function generateChunkEntity(
  app: pc.Application,
  chunkX: number,
  chunkZ: number,
  chunkSize: number
): pc.Entity {
  // Use deterministic noise seeded by chunk coordinates
  // (plug in a noise library like simplex-noise)
  const mesh = generateTerrainChunk(app.graphicsDevice, chunkX, chunkZ, chunkSize);

  const material = new pc.StandardMaterial();
  material.diffuse = new pc.Color(0.3, 0.6, 0.2);
  material.update();

  const entity = new pc.Entity(`chunk_${chunkX}_${chunkZ}`);
  entity.addComponent('render', {
    meshInstances: [new pc.MeshInstance(mesh, material)],
  });
  entity.setPosition(chunkX * chunkSize, 0, chunkZ * chunkSize);

  return entity;
}
```

## Procedural Level Geometry

Beyond terrain, generate dungeon rooms, corridors, and obstacles at runtime.

```typescript
function generateBox(
  device: pc.GraphicsDevice,
  w: number,
  h: number,
  d: number
): pc.Mesh {
  // 24 vertices (4 per face × 6 faces — separate normals per face)
  const hw = w / 2, hh = h / 2, hd = d / 2;

  const positions: number[] = [
    // Front face
    -hw, -hh,  hd,   hw, -hh,  hd,   hw,  hh,  hd,  -hw,  hh,  hd,
    // Back face
     hw, -hh, -hd,  -hw, -hh, -hd,  -hw,  hh, -hd,   hw,  hh, -hd,
    // Top face
    -hw,  hh,  hd,   hw,  hh,  hd,   hw,  hh, -hd,  -hw,  hh, -hd,
    // Bottom face
    -hw, -hh, -hd,   hw, -hh, -hd,   hw, -hh,  hd,  -hw, -hh,  hd,
    // Right face
     hw, -hh,  hd,   hw, -hh, -hd,   hw,  hh, -hd,   hw,  hh,  hd,
    // Left face
    -hw, -hh, -hd,  -hw, -hh,  hd,  -hw,  hh,  hd,  -hw,  hh, -hd,
  ];

  const normals: number[] = [
    0,0,1, 0,0,1, 0,0,1, 0,0,1,    // front
    0,0,-1, 0,0,-1, 0,0,-1, 0,0,-1, // back
    0,1,0, 0,1,0, 0,1,0, 0,1,0,    // top
    0,-1,0, 0,-1,0, 0,-1,0, 0,-1,0, // bottom
    1,0,0, 1,0,0, 1,0,0, 1,0,0,    // right
    -1,0,0, -1,0,0, -1,0,0, -1,0,0, // left
  ];

  const indices: number[] = [];
  for (let face = 0; face < 6; face++) {
    const base = face * 4;
    indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }

  const mesh = new pc.Mesh(device);
  mesh.setPositions(positions);
  mesh.setNormals(normals);
  mesh.setIndices(indices);
  mesh.update(pc.PRIMITIVE_TRIANGLES);

  return mesh;
}
```

## Dynamic Mesh Updates

For deformable terrain, water surfaces, or destructible geometry, update mesh data each frame:

```typescript
function deformMesh(mesh: pc.Mesh, time: number): void {
  // Get current positions (returns Float32Array for typed-array data)
  const positions = new Float32Array(mesh.getPositions()!);
  const cols = 64; // assuming a 64×64 grid

  for (let i = 0; i < positions.length; i += 3) {
    const x = positions[i];
    const z = positions[i + 2];
    // Simple sine wave deformation
    positions[i + 1] = Math.sin(x * 0.5 + time) * Math.cos(z * 0.5 + time) * 0.5;
  }

  mesh.setPositions(positions, 3);
  // Recalculate normals after deformation for correct lighting
  mesh.setNormals(calculateNormalsFromPositions(positions, mesh.getIndices()!));
  mesh.update(pc.PRIMITIVE_TRIANGLES);
}
```

### Performance for Dynamic Meshes

- Use `Float32Array` (typed arrays) instead of plain arrays — avoids GC pressure and is faster for large meshes.
- Keep subdivision count reasonable: a 128×128 grid = 16,384 vertices. Updating per frame is fine up to ~64×64 on mobile.
- If only a portion changes, consider splitting into sub-meshes and only updating the affected chunk.
- `mesh.update()` re-uploads the vertex buffer to the GPU each call. Minimize calls per frame.

## Noise-Based Generation

For natural-looking terrain and caves, use noise functions. Install a library like `simplex-noise`:

```typescript
import { createNoise2D } from 'simplex-noise';
import Alea from 'alea';

function generateNoiseHeightmap(
  seed: string,
  size: number,
  octaves: number = 4
): Float32Array {
  const prng = Alea(seed);
  const noise = createNoise2D(prng);
  const data = new Float32Array(size * size);

  for (let z = 0; z < size; z++) {
    for (let x = 0; x < size; x++) {
      let value = 0;
      let amplitude = 1;
      let frequency = 0.01;

      for (let o = 0; o < octaves; o++) {
        value += noise(x * frequency, z * frequency) * amplitude;
        amplitude *= 0.5;   // persistence
        frequency *= 2.0;   // lacunarity
      }

      // Normalize to 0–1
      data[z * size + x] = (value + 1) * 0.5;
    }
  }

  return data;
}
```

## Common Pitfalls

1. **Index format**: PlayCanvas defaults to 16-bit indices (max 65,535 vertices). For larger meshes, the engine auto-switches to 32-bit, but verify your target devices support `OES_element_index_uint` (all modern devices do).
2. **Forgetting `mesh.update()`**: Setting positions/normals without calling `update()` does nothing — data stays in JavaScript and never reaches the GPU.
3. **Memory leaks**: When destroying procedural entities, the mesh and material are not automatically garbage collected. Call `mesh.destroy()` and `material.destroy()` explicitly, or rely on `entity.destroy()` which handles render component cleanup.
4. **Missing normals**: If you skip normals, lighting will look flat or black. Always calculate normals for lit meshes.
5. **Winding order**: PlayCanvas expects counter-clockwise winding for front faces by default. Reversed triangles will be back-face culled and invisible.
