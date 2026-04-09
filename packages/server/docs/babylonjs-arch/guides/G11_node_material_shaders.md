# Node Material Editor & Custom Shaders

> **Category:** guide · **Engine:** Babylon.js · **Related:** [G6_lighting_pbr_materials.md](G6_lighting_pbr_materials.md), [G5_webgpu_compute.md](G5_webgpu_compute.md), [G8_optimization_performance.md](G8_optimization_performance.md)

The Babylon.js **Node Material Editor (NME)** is a visual, graph-based shader authoring tool that produces production-ready materials without writing raw GLSL or WGSL. It generates both vertex and fragment shaders by connecting typed blocks in a directed acyclic graph. This guide covers the NME architecture, block categories, programmatic API, game-relevant shader patterns, and performance considerations.

## Overview

The Node Material system represents shaders as a graph of **blocks** (nodes). Each block performs a single operation — sample a texture, transform a vector, compute a dot product — and passes typed outputs to downstream blocks. The graph compiles to GLSL (WebGL) or WGSL (WebGPU) automatically.

Key advantages for game development:
- Visual iteration without shader recompilation cycles
- Automatic WebGL/WebGPU compatibility from the same graph
- JSON serialization for runtime loading and A/B testing materials
- Particle shader support for custom GPU particle effects
- Generate Code button exports copy-paste-ready TypeScript

Access the editor at: [nodematerial-editor.babylonjs.com](https://nodematerial-editor.babylonjs.com/)

## Architecture: Vertex + Fragment Outputs

Every Node Material graph must terminate in exactly two output blocks:

1. **VertexOutput** — receives the final transformed vertex position
2. **FragmentOutput** — receives the final pixel color (and optionally alpha)

The NME automatically splits the graph into vertex and fragment shader stages based on which output each block feeds into. Blocks that feed both outputs are computed in the vertex shader and passed via varyings.

```
[WorldPosition] → [Transform] → [VertexOutput]
                        ↓ (varying)
[Texture] → [Color] → [Multiply] → [FragmentOutput]
```

## Block Categories

### Input Blocks
Provide data that enters the shader. These are the starting points of your graph.

| Block | Output Type | Description |
|---|---|---|
| `Position` | Vector3 | Object-space vertex position |
| `Normal` | Vector3 | Object-space vertex normal |
| `UV` | Vector2 | Texture coordinates (UV set 0 or 1) |
| `WorldPosition` | Vector4 | World-space position |
| `WorldNormal` | Vector4 | World-space normal |
| `Time` | Float | Elapsed seconds — use for animation |
| `CameraPosition` | Vector3 | Camera world position |
| `Color` | Color4 | Constant color input |
| `Float` / `Vector2` / `Vector3` / `Vector4` | Various | Uniform parameters exposed to code |

### Math Blocks
Perform arithmetic and trigonometric operations.

| Block | Operation | Game Use Case |
|---|---|---|
| `Add`, `Subtract`, `Multiply`, `Divide` | Basic arithmetic | Combining effects, masking |
| `Lerp` | Linear interpolation | Blending textures, transitions |
| `Clamp`, `Saturate` | Range limiting | Preventing overbright |
| `Sin`, `Cos` | Trigonometry | Wave motion, oscillation |
| `Dot`, `Cross` | Vector operations | Rim lighting, facing ratio |
| `Normalize` | Unit vector | Direction calculations |
| `Pow` | Exponentiation | Specular falloff, contrast |
| `Step`, `SmoothStep` | Threshold | Toon shading, edge detection |
| `Negate`, `Abs` | Sign operations | Bilateral effects |
| `Min`, `Max` | Selection | Combining multiple effects |

### Texture Blocks
Sample and process textures.

| Block | Description |
|---|---|
| `Texture` | Sample a 2D texture at given UV |
| `ReflectionTexture` | Sample cubemap or equirectangular environment |
| `Perlin3D` | Procedural 3D Perlin noise |
| `SimplexPerlin3D` | Procedural 3D Simplex noise |
| `WorleyNoise3D` | Procedural Worley (cellular) noise |
| `VoronoiNoise` | Procedural Voronoi pattern |

### PBR Blocks
Ready-made physically-based rendering nodes.

| Block | Description |
|---|---|
| `PBRMetallicRoughness` | Full PBR with metallic/roughness workflow |
| `Reflection` | Environment reflections |
| `Refraction` | Transparent refraction (glass, water) |
| `ClearCoat` | Clear coat layer (car paint, lacquer) |
| `SubSurface` | Subsurface scattering (skin, wax) |
| `Sheen` | Fabric/velvet sheen layer |

### Conditional / Logic Blocks

| Block | Description |
|---|---|
| `Conditional` | If-else branching (use sparingly — hurts GPU parallelism) |
| `Gradient` | Remap float to color gradient |
| `Remap` | Remap value from one range to another |

## Programmatic API

You can build Node Materials entirely in code, without the visual editor. This is useful for procedural generation, runtime material variants, and unit testing.

### Creating a Node Material from Code

```typescript
import {
  NodeMaterial,
  InputBlock,
  TransformBlock,
  VertexOutputBlock,
  FragmentOutputBlock,
  TextureBlock,
  MultiplyBlock,
  NodeMaterialSystemValues,
} from '@babylonjs/core';

function createCustomMaterial(scene: BABYLON.Scene): NodeMaterial {
  const nodeMaterial = new NodeMaterial('customShader', scene);

  // --- Vertex shader ---
  const position = new InputBlock('position');
  position.setAsAttribute('position');

  const worldViewProjection = new InputBlock('worldViewProjection');
  worldViewProjection.setAsSystemValue(
    NodeMaterialSystemValues.WorldViewProjection
  );

  const vertexTransform = new TransformBlock('vertexTransform');
  position.connectTo(vertexTransform);
  worldViewProjection.connectTo(vertexTransform, { input: 'transform' });

  const vertexOutput = new VertexOutputBlock('vertexOutput');
  vertexTransform.connectTo(vertexOutput);

  // --- Fragment shader ---
  const uv = new InputBlock('uv');
  uv.setAsAttribute('uv');

  const texture = new TextureBlock('diffuseTexture');
  uv.connectTo(texture);

  const tintColor = new InputBlock('tintColor');
  tintColor.value = new BABYLON.Color3(1.0, 0.8, 0.6);

  const multiply = new MultiplyBlock('tint');
  texture.connectTo(multiply, { output: 'rgb' });
  tintColor.connectTo(multiply, { input: 'right' });

  const fragmentOutput = new FragmentOutputBlock('fragmentOutput');
  multiply.connectTo(fragmentOutput, { input: 'rgb' });

  // Build and compile
  nodeMaterial.addOutputNode(vertexOutput);
  nodeMaterial.addOutputNode(fragmentOutput);
  nodeMaterial.build();

  return nodeMaterial;
}
```

### Loading from JSON (Editor Export)

The NME exports materials as JSON. Load them at runtime for hot-swapping:

```typescript
async function loadNodeMaterial(
  scene: BABYLON.Scene,
  jsonUrl: string
): Promise<NodeMaterial> {
  const response = await fetch(jsonUrl);
  const json = await response.json();

  const material = NodeMaterial.Parse(json, scene);
  material.build();

  return material;
}

// Usage — swap materials at runtime
const fireMat = await loadNodeMaterial(scene, '/materials/fire.json');
const iceMat = await loadNodeMaterial(scene, '/materials/ice.json');

// Expose uniforms for gameplay control
const intensityInput = fireMat.getInputBlockByPredicate(
  (block) => block.name === 'intensity'
);
if (intensityInput) {
  intensityInput.value = 2.5; // Crank up the fire
}
```

### Exposing Parameters for Gameplay

Use named `InputBlock` floats/vectors as uniforms you control from game logic:

```typescript
// In the NME, create a Float input named "damageFlash"
// In code, animate it on hit:
function onPlayerDamaged(material: NodeMaterial): void {
  const flashBlock = material.getInputBlockByPredicate(
    (b) => b.name === 'damageFlash'
  );
  if (!flashBlock) return;

  flashBlock.value = 1.0;

  // Fade back to 0 over 300ms
  const start = performance.now();
  const animate = () => {
    const elapsed = performance.now() - start;
    flashBlock.value = Math.max(0, 1.0 - elapsed / 300);
    if (flashBlock.value > 0) requestAnimationFrame(animate);
  };
  requestAnimationFrame(animate);
}
```

## Game-Relevant Shader Patterns

### Toon / Cel Shading

Use `Dot` (normal · light direction) → `Step` or `SmoothStep` to create banded lighting:

```
[WorldNormal] → [Dot] ← [LightDirection]
                   ↓
              [SmoothStep] (edge0=0.3, edge1=0.31)
                   ↓
              [Lerp] (shadow color ↔ lit color)
                   ↓
              [FragmentOutput]
```

### Dissolve Effect

Drive a dissolve with noise and a threshold uniform:

```
[UV] → [SimplexNoise3D] → [Subtract] ← [dissolveThreshold (Float)]
                              ↓
                          [Step] → [FragmentOutput.a]  (alpha cutoff)
                              ↓
               [edge glow] → [Add] → [FragmentOutput.rgb]
```

### Scrolling Lava / Water

Offset UV by `Time` to animate texture flow:

```
[Time] → [Multiply] ← [scrollSpeed (Float)]
            ↓
         [Add] ← [UV]
            ↓
         [Texture (lava.png)]
            ↓
         [FragmentOutput]
```

### Rim Lighting

Facing ratio (dot of view direction and normal) drives a glow at object edges:

```
[ViewDirection] → [Dot] ← [WorldNormal]
                     ↓
                 [OneMinus] → [Pow] ← [rimPower (Float)]
                                 ↓
                             [Multiply] ← [rimColor (Color3)]
                                 ↓
                             [Add] ← [baseColor]
                                 ↓
                             [FragmentOutput]
```

## Particle Shaders

The NME supports a dedicated **Particle** mode for creating custom GPU particle effects. In particle mode you only define a fragment shader — the vertex transformation is handled by the particle system.

```typescript
// Create a particle-mode Node Material
const particleMat = new NodeMaterial('fireParticle', scene);
// Load from JSON exported in Particle mode
await particleMat.loadAsync('/materials/fire-particle.json');
particleMat.createEffectForParticles('fireSystem', scene);

// Apply to particle system
const ps = new BABYLON.ParticleSystem('fire', 2000, scene);
ps.particleTexture = new BABYLON.Texture('/textures/spark.png', scene);
// The node material overrides the default shader
```

Particle-mode restrictions: mesh-specific blocks (WorldPosition, WorldNormal) are unavailable. Use `ParticleColor`, `ParticleUV`, and `ParticleTexture` blocks instead.

## WebGPU Considerations

Node Materials automatically compile to WGSL when using the WebGPU engine. No changes are needed to the graph itself, but be aware:

- **Compute shaders** are a separate system (`ComputeShader` class) — NME does not produce compute shaders.
- Some noise blocks may have slight visual differences between WebGL and WebGPU due to floating-point precision.
- WebGPU allows more simultaneous texture bindings, enabling more complex material graphs without hitting limits.

## Performance Tips

- **Minimize branching**: `Conditional` blocks compile to GPU `if` statements that can break SIMD parallelism. Prefer `Lerp` + `Step` for soft switches.
- **Texture atlas over many textures**: Each `Texture` block is a separate texture bind. Combine into atlases to reduce draw call overhead.
- **Freeze materials**: Call `material.freeze()` on materials that don't change per-frame. This skips uniform upload.
- **LOD materials**: Use simpler Node Material graphs for distant objects. Swap materials based on camera distance rather than using a single expensive shader everywhere.
- **Compile ahead of time**: `NodeMaterial.build()` is synchronous and can cause a frame hitch. Build materials during loading screens, not during gameplay.
- **Profile with Spector.js**: Inspect generated GLSL to verify the graph compiled as expected. Look for unnecessary `varying` declarations.
