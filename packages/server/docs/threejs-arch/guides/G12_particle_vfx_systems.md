# G12 — Particle & VFX Systems

> **Category:** guide · **Engine:** Three.js · **Related:** [Architecture Overview](../architecture/E1_architecture_overview.md), [WebGPU Renderer](G9_webgpu_renderer.md), [TSL Node Materials](G2_tsl_node_materials.md), [Optimization](G6_optimization_performance.md)

Three.js offers three tiers of particle/VFX capability: **Points** (CPU, simple), **InstancedMesh sprites** (CPU, flexible), and **TSL/WebGPU compute particles** (GPU, massive scale). Choose based on your particle count and complexity budget. This guide covers all three, with emphasis on the TSL compute approach introduced in r166+ for WebGPU-era games.

---

## Tier 1 — Points (CPU Particles)

`Points` is the simplest particle primitive. Each vertex in a `BufferGeometry` renders as a screen-aligned square. Good for ambient dust, stars, or simple rain — up to ~50k particles before CPU update becomes a bottleneck.

```typescript
import * as THREE from 'three';

const COUNT = 10_000;
const positions = new Float32Array(COUNT * 3);
const colors = new Float32Array(COUNT * 3);

for (let i = 0; i < COUNT; i++) {
  // Random positions in a 20-unit cube
  positions[i * 3]     = (Math.random() - 0.5) * 20;
  positions[i * 3 + 1] = (Math.random() - 0.5) * 20;
  positions[i * 3 + 2] = (Math.random() - 0.5) * 20;

  // Warm color gradient
  colors[i * 3]     = 0.8 + Math.random() * 0.2;
  colors[i * 3 + 1] = 0.3 + Math.random() * 0.4;
  colors[i * 3 + 2] = 0.1;
}

const geometry = new THREE.BufferGeometry();
geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));

const material = new THREE.PointsMaterial({
  size: 0.1,
  vertexColors: true,
  transparent: true,
  opacity: 0.8,
  // Use a soft circle texture for nicer particles
  map: new THREE.TextureLoader().load('/textures/particle-soft.png'),
  depthWrite: false,          // Prevents sorting artifacts
  blending: THREE.AdditiveBlending,
});

const particles = new THREE.Points(geometry, material);
scene.add(particles);
```

### CPU Update Loop

For animated particles (e.g., rising embers), update the position buffer each frame:

```typescript
function updateParticles(delta: number): void {
  const posArray = geometry.attributes.position.array as Float32Array;
  for (let i = 0; i < COUNT; i++) {
    // Float upward
    posArray[i * 3 + 1] += delta * 2.0;

    // Reset particles that exceed bounds
    if (posArray[i * 3 + 1] > 10) {
      posArray[i * 3 + 1] = -10;
    }
  }
  geometry.attributes.position.needsUpdate = true;
}
```

**Performance note:** `needsUpdate = true` re-uploads the entire buffer to the GPU every frame. Beyond ~50k particles, this CPU→GPU transfer becomes the bottleneck.

---

## Tier 2 — InstancedMesh Sprites (CPU, Flexible)

For particles that need rotation, non-uniform scale, or per-instance textures, use `InstancedMesh` with a small quad geometry. This gives you one draw call for all particles while allowing full transform control.

```typescript
import * as THREE from 'three';

const COUNT = 20_000;
const quad = new THREE.PlaneGeometry(0.1, 0.1);
const material = new THREE.MeshBasicMaterial({
  map: new THREE.TextureLoader().load('/textures/spark.png'),
  transparent: true,
  depthWrite: false,
  blending: THREE.AdditiveBlending,
});

const mesh = new THREE.InstancedMesh(quad, material, COUNT);
const dummy = new THREE.Object3D();

// Initialize transforms
for (let i = 0; i < COUNT; i++) {
  dummy.position.set(
    (Math.random() - 0.5) * 20,
    (Math.random() - 0.5) * 20,
    (Math.random() - 0.5) * 20,
  );
  dummy.updateMatrix();
  mesh.setMatrixAt(i, dummy.matrix);
}
mesh.instanceMatrix.needsUpdate = true;
scene.add(mesh);
```

**When to choose InstancedMesh over Points:** when you need per-particle rotation, rectangular sprites, or access to mesh material features (environment maps, normal maps on particles).

---

## Tier 3 — TSL Compute Particles (GPU, Massive Scale)

For hundreds of thousands to millions of particles, move simulation entirely to the GPU using TSL (Three.js Shading Language) compute shaders with `WebGPURenderer`. This eliminates the CPU bottleneck — particles are both simulated and rendered on the GPU.

### Architecture Overview

The TSL compute particle pipeline has three stages:

1. **Storage buffers** — hold per-particle data (position, velocity, life, color) in GPU memory
2. **Compute shader** — runs each frame to update particle state (physics, spawning, death)
3. **Render material** — `SpriteNodeMaterial` reads from the storage buffer to position and color each sprite

### Setting Up Storage Buffers

```typescript
import * as THREE from 'three';
import {
  storage,
  storageObject,
  instanceIndex,
  float,
  vec3,
  vec4,
  Fn,
  If,
} from 'three/tsl';

const COUNT = 500_000;

// Create typed arrays for initial data
const positionArray = new Float32Array(COUNT * 4); // xyz + padding
const velocityArray = new Float32Array(COUNT * 4);
const lifeArray     = new Float32Array(COUNT);

for (let i = 0; i < COUNT; i++) {
  positionArray[i * 4]     = (Math.random() - 0.5) * 10;
  positionArray[i * 4 + 1] = Math.random() * 5;
  positionArray[i * 4 + 2] = (Math.random() - 0.5) * 10;
  positionArray[i * 4 + 3] = 0; // padding

  velocityArray[i * 4]     = (Math.random() - 0.5) * 2;
  velocityArray[i * 4 + 1] = 1 + Math.random() * 3;
  velocityArray[i * 4 + 2] = (Math.random() - 0.5) * 2;
  velocityArray[i * 4 + 3] = 0;

  lifeArray[i] = Math.random(); // 0..1 phase offset
}

// Wrap in storage buffer attributes
const positionBuffer = new THREE.StorageBufferAttribute(positionArray, 4);
const velocityBuffer = new THREE.StorageBufferAttribute(velocityArray, 4);
const lifeBuffer     = new THREE.StorageBufferAttribute(lifeArray, 1);
```

### Writing the Compute Shader (TSL)

TSL compute shaders are written in JavaScript using node-graph functions. The `Fn` helper creates a GPU function:

```typescript
const computeUpdate = Fn(() => {
  const idx = instanceIndex;

  // Read current state from storage
  const pos  = storage(positionBuffer, 'vec4').element(idx);
  const vel  = storage(velocityBuffer, 'vec4').element(idx);
  const life = storage(lifeBuffer, 'float').element(idx);

  // Delta time as a uniform (set from JS each frame)
  const dt = float(0.016); // or use a uniform node

  // Update life
  life.addAssign(dt);

  // Apply gravity
  vel.y.subAssign(float(9.8).mul(dt));

  // Integrate position
  pos.addAssign(vel.mul(dt));

  // Respawn dead particles
  If(life.greaterThan(float(3.0)), () => {
    pos.assign(vec4(0, 0, 0, 0));
    vel.assign(vec4(
      float(Math.random() - 0.5).mul(2),
      float(1 + Math.random() * 3),
      float(Math.random() - 0.5).mul(2),
      0,
    ));
    life.assign(float(0));
  });
})().compute(COUNT);
```

### Rendering with SpriteNodeMaterial

`SpriteNodeMaterial` renders each particle as a camera-facing sprite. Set its `positionNode` and `colorNode` to read from the same storage buffers:

```typescript
import { SpriteNodeMaterial } from 'three/webgpu';

const spriteMaterial = new SpriteNodeMaterial();
spriteMaterial.positionNode = storage(positionBuffer, 'vec4').toVar().xyz;
spriteMaterial.colorNode = vec4(1.0, 0.6, 0.2, 1.0); // orange
spriteMaterial.scaleNode = float(0.05);
spriteMaterial.transparent = true;
spriteMaterial.depthWrite = false;
spriteMaterial.blending = THREE.AdditiveBlending;

// Create the sprite mesh with the particle count
const sprite = new THREE.Sprite(spriteMaterial);
sprite.count = COUNT;
scene.add(sprite);
```

### The Render Loop

```typescript
import { WebGPURenderer } from 'three/webgpu';

const renderer = new WebGPURenderer();
await renderer.init();

function animate(): void {
  requestAnimationFrame(animate);

  // Run compute shader first — updates all particle positions on the GPU
  renderer.compute(computeUpdate);

  // Then render — SpriteNodeMaterial reads updated positions
  renderer.render(scene, camera);
}
animate();
```

---

## Choosing the Right Tier

| Factor | Points | InstancedMesh | TSL Compute |
|--------|--------|---------------|-------------|
| Max particles (60 FPS) | ~50k | ~100k | 1M+ |
| Renderer | WebGL / WebGPU | WebGL / WebGPU | WebGPU only |
| Per-particle rotation | No | Yes | Yes (via nodes) |
| Custom physics | CPU loop | CPU loop | GPU compute |
| Complexity | Low | Medium | High |
| Mobile support | Excellent | Good | Limited (WebGPU) |

---

## Common VFX Patterns

### Fire / Embers

Use additive blending with a warm color ramp. Particles spawn at a point, drift upward with turbulence, and fade out over their lifetime. Apply a noise offset to velocity for organic movement.

### Explosions

Burst-spawn particles in a sphere with outward velocity. Apply strong drag (multiply velocity by ~0.95 each frame) and gravity. Use sub-emitter sparks for secondary effects.

### Trails

For bullet trails or magic effects, spawn particles along a moving object's path. Give them zero initial velocity and a short lifetime. Use `AdditiveBlending` for glow.

### Rain / Snow

Spawn particles on a plane above the camera and let them fall with gravity. For rain, use elongated sprites aligned to velocity. For snow, add sinusoidal horizontal drift.

---

## Performance Tips

- **Depth sorting:** avoid it. Use `depthWrite: false` with additive or alpha blending instead. Sorting thousands of particles per frame is expensive.
- **Texture atlases:** pack multiple particle sprites into one atlas and use UV offsets — reduces material/draw-call overhead.
- **Particle pooling:** never create/destroy `Object3D` instances at runtime. Pre-allocate a fixed buffer and recycle particles by resetting their position and life.
- **Frustum culling:** `Points` and `InstancedMesh` are culled as a single bounding box. If your particles span a large area, disable frustum culling (`particles.frustumCulled = false`) or split into spatial chunks.
- **WebGPU fallback:** TSL compute particles require WebGPU. Always check `navigator.gpu` and fall back to CPU particles on unsupported browsers.

---

## Further Reading

- [Three.js WebGPU Particle Attractor Example](https://threejs.org/examples/webgpu_tsl_compute_attractors_particles.html)
- [TSL & WebGPU Field Guide — Maxime Heckel](https://blog.maximeheckel.com/posts/field-guide-to-tsl-and-webgpu/)
- [GPGPU Particles with TSL — Wawa Sensei](https://wawasensei.dev/courses/react-three-fiber/lessons/tsl-gpgpu)
- [Galaxy Simulation with WebGPU Compute — Three.js Roadmap](https://threejsroadmap.com/blog/galaxy-simulation-webgpu-compute-shaders)
