# G12 — Particle Systems

> **Category:** guide · **Engine:** Babylon.js · **Related:** [Architecture Overview](../architecture/E1_architecture_overview.md), [Optimization](G8_optimization_performance.md), [WebGPU Compute](G5_webgpu_compute.md), [Lighting & PBR](G6_lighting_pbr_materials.md)

Babylon.js has one of the most complete built-in particle systems of any web 3D engine. It provides **CPU particles** (full-featured, sub-emitters, custom functions), **GPU particles** (transform-feedback powered, millions of particles), and **Particle Editor** (visual node graph in the Inspector). This guide covers the API, GPU acceleration, sub-emitters, and common game VFX patterns.

---

## CPU Particle System — Full Control

The standard `ParticleSystem` runs simulation on the CPU and rendering on the GPU. It supports the widest feature set including sub-emitters, custom update functions, and all emitter shapes.

### Basic Setup

```typescript
import {
  Scene, ParticleSystem, Texture, Vector3, Color4, MeshBuilder,
} from '@babylonjs/core';

function createFireEffect(scene: Scene): ParticleSystem {
  const emitter = MeshBuilder.CreateBox('emitter', { size: 0.1 }, scene);
  emitter.isVisible = false;

  const ps = new ParticleSystem('fire', 2000, scene);
  ps.particleTexture = new Texture('/textures/flare.png', scene);

  // Emitter configuration
  ps.emitter = emitter;
  ps.minEmitBox = new Vector3(-0.5, 0, -0.5);
  ps.maxEmitBox = new Vector3(0.5, 0, 0.5);

  // Lifetime
  ps.minLifeTime = 0.3;
  ps.maxLifeTime = 1.5;

  // Emission rate
  ps.emitRate = 500;

  // Size over lifetime
  ps.minSize = 0.1;
  ps.maxSize = 0.5;
  ps.addSizeGradient(0.0, 0.1);
  ps.addSizeGradient(0.5, 0.4);
  ps.addSizeGradient(1.0, 0.0); // shrink to zero at death

  // Color over lifetime
  ps.addColorGradient(0.0, new Color4(1, 1, 0.2, 1));   // bright yellow
  ps.addColorGradient(0.4, new Color4(1, 0.4, 0.1, 1));  // orange
  ps.addColorGradient(1.0, new Color4(0.3, 0.0, 0.0, 0)); // dark red, fade out

  // Physics
  ps.minEmitPower = 1;
  ps.maxEmitPower = 3;
  ps.gravity = new Vector3(0, -2, 0);
  ps.direction1 = new Vector3(-0.5, 1, -0.5);
  ps.direction2 = new Vector3(0.5, 1, 0.5);

  // Blending
  ps.blendMode = ParticleSystem.BLENDMODE_ADD;

  ps.start();
  return ps;
}
```

### Gradient API

Babylon.js lets you define per-property gradients over the particle's normalized lifetime (0→1). This replaces manual interpolation code:

```typescript
// Velocity over lifetime — particles slow down
ps.addVelocityGradient(0.0, 1.0);
ps.addVelocityGradient(0.5, 0.6);
ps.addVelocityGradient(1.0, 0.1);

// Angular speed gradient — spin fast, then slow
ps.addAngularSpeedGradient(0.0, 3.0);
ps.addAngularSpeedGradient(1.0, 0.5);

// Drag gradient — increase drag near end of life
ps.addDragGradient(0.0, 0.0);
ps.addDragGradient(1.0, 0.8);
```

Available gradient types: `color`, `size`, `velocity`, `drag`, `angularSpeed`, `alpha`, `emitRate`, `startSize`, `lifetime` (via `addRampGradient`).

---

## Emitter Shapes

Babylon.js includes several built-in emitter types. Assign them to `ps.particleEmitterType`:

```typescript
import {
  SphereParticleEmitter,
  ConeParticleEmitter,
  BoxParticleEmitter,
  CylinderParticleEmitter,
  HemisphericParticleEmitter,
  PointParticleEmitter,
  MeshParticleEmitter,
} from '@babylonjs/core';

// Sphere — particles emit from surface or volume
ps.particleEmitterType = new SphereParticleEmitter(2.0); // radius

// Cone — directional spray (torch, spotlight)
const cone = new ConeParticleEmitter(1.0, Math.PI / 4); // radius, angle
cone.directionRandomizer = 0.1;
ps.particleEmitterType = cone;

// Mesh — emit from the surface of any mesh
const meshEmitter = new MeshParticleEmitter(characterMesh);
meshEmitter.useMeshNormalsForDirection = true; // emit along surface normals
ps.particleEmitterType = meshEmitter;
```

### Custom Emitter

Implement `IParticleEmitterType` to create entirely custom shapes:

```typescript
import { IParticleEmitterType, Particle, Matrix, Vector3 } from '@babylonjs/core';

class RingEmitter implements IParticleEmitterType {
  constructor(public radius: number = 2, public height: number = 0) {}

  startDirectionFunction(
    worldMatrix: Matrix, directionToUpdate: Vector3, particle: Particle
  ): void {
    // Emit outward from ring center
    directionToUpdate.copyFrom(particle.position).normalize();
    directionToUpdate.y = 0.5; // slight upward bias
  }

  startPositionFunction(
    worldMatrix: Matrix, positionToUpdate: Vector3, particle: Particle
  ): void {
    const angle = Math.random() * Math.PI * 2;
    positionToUpdate.set(
      Math.cos(angle) * this.radius,
      this.height,
      Math.sin(angle) * this.radius,
    );
    Vector3.TransformCoordinatesToRef(positionToUpdate, worldMatrix, positionToUpdate);
  }

  clone(): RingEmitter { return new RingEmitter(this.radius, this.height); }
  applyToShader(): void {} // GPU particles need shader logic here
  getClassName(): string { return 'RingEmitter'; }
  serialize(): object { return { radius: this.radius, height: this.height }; }
  parse(data: { radius: number; height: number }): void {
    this.radius = data.radius;
    this.height = data.height;
  }
}
```

---

## Sub-Emitters (CPU Only)

Sub-emitters spawn new particle systems when a parent particle reaches a lifecycle event. Available since v3.2, they enable cascading effects like fireworks (burst → sparkle → fade).

```typescript
import { SubEmitter, SubEmitterType, ParticleSystem } from '@babylonjs/core';

// Create the sub-system (sparks that spawn when a firework particle dies)
const sparkSystem = new ParticleSystem('sparks', 200, scene);
sparkSystem.particleTexture = new Texture('/textures/spark.png', scene);
sparkSystem.minLifeTime = 0.1;
sparkSystem.maxLifeTime = 0.4;
sparkSystem.minSize = 0.02;
sparkSystem.maxSize = 0.06;
sparkSystem.emitRate = 50;
sparkSystem.blendMode = ParticleSystem.BLENDMODE_ADD;
sparkSystem.addColorGradient(0.0, new Color4(1, 0.9, 0.3, 1));
sparkSystem.addColorGradient(1.0, new Color4(1, 0.2, 0.0, 0));

// Wrap it as a sub-emitter
const subEmitter = new SubEmitter(sparkSystem);
subEmitter.type = SubEmitterType.END;             // Trigger: when parent dies
subEmitter.inheritDirection = true;               // Match parent's direction
subEmitter.inheritedVelocityAmount = 0.3;         // Inherit 30% of parent speed

// Attach to the parent system
fireSystem.subEmitters = [
  [subEmitter],   // Array of arrays — each parent can trigger multiple sub-systems
];
```

**Important limitation:** sub-emitters are **not supported** with `GPUParticleSystem`. GPU particles cannot dynamically spawn new systems because the simulation runs entirely on the GPU without CPU readback.

### Sub-Emitter Types

| Type | Trigger | Use case |
|------|---------|----------|
| `SubEmitterType.END` | Parent particle dies | Firework sparks, explosion debris |
| `SubEmitterType.ATTACHED` | Spawns continuously along parent's path | Comet tails, trail effects |

---

## GPU Particle System — Massive Scale

`GPUParticleSystem` uses WebGL2 transform feedback (or WebGPU compute) to run particle simulation on the GPU. It shares nearly the same API as the CPU system but supports millions of particles.

```typescript
import { GPUParticleSystem, Texture, Vector3 } from '@babylonjs/core';

// Check support first
if (!GPUParticleSystem.IsSupported) {
  console.warn('GPU particles not supported — falling back to CPU');
}

const gpuPS = new GPUParticleSystem('storm', { capacity: 1_000_000 }, scene);
gpuPS.particleTexture = new Texture('/textures/raindrop.png', scene);

gpuPS.emitter = new Vector3(0, 20, 0);
gpuPS.minEmitBox = new Vector3(-50, 0, -50);
gpuPS.maxEmitBox = new Vector3(50, 0, 50);

gpuPS.minLifeTime = 1.0;
gpuPS.maxLifeTime = 2.0;
gpuPS.emitRate = 100_000;
gpuPS.minSize = 0.01;
gpuPS.maxSize = 0.03;
gpuPS.gravity = new Vector3(0, -15, 0);
gpuPS.direction1 = new Vector3(-0.2, -1, -0.2);
gpuPS.direction2 = new Vector3(0.2, -1, 0.2);

gpuPS.blendMode = ParticleSystem.BLENDMODE_STANDARD;
gpuPS.start();
```

### GPU vs CPU Feature Parity

Most properties work identically. Key **GPU-only limitations**:

- No sub-emitters
- No `updateFunction` (custom per-particle CPU callback)
- No `startSpriteCellID` / animated sprite sheets
- Noise texture works (for turbulence), but custom position functions don't

### Noise Texture for Organic Motion

GPU particles support noise textures that perturb particle direction, creating organic-feeling motion without custom code:

```typescript
import { NoiseProceduralTexture } from '@babylonjs/core';

const noiseTexture = new NoiseProceduralTexture('noise', 256, scene);
noiseTexture.animationSpeedFactor = 3;
noiseTexture.persistence = 1.5;
noiseTexture.brightness = 0.5;
noiseTexture.octaves = 4;

gpuPS.noiseTexture = noiseTexture;
gpuPS.noiseStrength = new Vector3(5, 5, 5);
```

---

## ParticleHelper — Presets

For quick prototyping, use the built-in presets:

```typescript
import { ParticleHelper } from '@babylonjs/core';

// Create a fire preset
const fireSet = ParticleHelper.CreateDefault(emitterMesh, 500, scene);
fireSet.start();

// Or load from the Babylon.js snippet server
const customSet = await ParticleHelper.ParseFromSnippetAsync('PARTICLE_SNIPPET_ID', scene);
customSet.start();
```

---

## Performance Guidelines

| Particle count | Recommended system | Notes |
|----------------|-------------------|-------|
| < 5,000 | CPU `ParticleSystem` | Full features, sub-emitters available |
| 5k – 100k | CPU with gradients | Use gradients instead of `updateFunction` for better perf |
| 100k – 1M+ | `GPUParticleSystem` | Check `IsSupported`, plan CPU fallback |

### General Tips

- **Pre-warm particles** with `ps.preWarmCycles` and `ps.preWarmStepOffset` so effects don't start empty.
- **Freeze inactive systems** with `ps.stop()` — a stopped system costs nearly zero.
- **Texture atlas:** use sprite sheets with `ps.startSpriteCellID` / `ps.endSpriteCellID` to animate particle textures without extra draw calls (CPU particles only).
- **Dispose systems** you no longer need: `ps.dispose()` frees GPU buffers.
- **Billboard mode:** set `ps.billboardMode` to `BILLBOARDMODE_STRETCHED` for velocity-aligned particles (rain, sparks) — cheaper than computing per-particle rotation.

---

## Further Reading

- [Babylon.js Particle System Documentation](https://doc.babylonjs.com/features/featuresDeepDive/particles/particle_system/)
- [GPU Particles Documentation](https://doc.babylonjs.com/features/featuresDeepDive/particles/particle_system/gpu_particles/)
- [Sub Emitters Documentation](https://doc.babylonjs.com/features/featuresDeepDive/particles/particle_system/subEmitters/)
- [GPUParticleSystem API Reference](https://doc.babylonjs.com/typedoc/classes/BABYLON.GPUParticleSystem)
- [Visual Effects with Particles — Beginner Guide](https://babylonjs.medium.com/visual-effects-with-particles-a-guide-for-beginners-5f322445388d)
