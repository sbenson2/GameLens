# G15 — Shader Graph & VFX Graph

> **Category:** guide · **Engine:** Unity 6 (6000.x) · **Related:** [G10 Rendering Pipeline](G10_rendering_pipeline_urp_hdrp.md) · [E1 Architecture Overview](../architecture/E1_architecture_overview.md) · [R1 Capability Matrix](../reference/R1_capability_matrix.md)

Shader Graph lets you author vertex and fragment shaders visually without writing code, while VFX Graph is a GPU-accelerated particle system for high-volume visual effects. Both are node-based editors that ship with URP and HDRP in Unity 6. This guide covers how they work, when to use each, and practical patterns for game development.

---

## Part 1 — Shader Graph

### What Shader Graph Does

Shader Graph replaces hand-written ShaderLab/HLSL for most material authoring. You connect nodes in a visual graph that compiles to GPU shader code at build time. The result is a standard Unity material that works with the lighting, shadows, and post-processing of your chosen render pipeline.

**Why visual authoring matters for game dev:** Shader code is notoriously hard to debug and iterate on. Shader Graph gives you live preview, reusable sub-graphs, and a node API that prevents common mistakes like incorrect coordinate spaces. Artists can tweak materials without touching code, while programmers can extend the system with Custom Function nodes when the built-in nodes aren't enough.

### Creating a Shader Graph

```
Right-click in Project window →
  Create → Shader Graph → URP → Lit Shader Graph
```

This creates a `.shadergraph` asset. Double-click to open the editor. The workspace has three main areas:

| Area | Purpose |
|------|---------|
| **Blackboard** | Declare properties exposed to artists in the Inspector (colors, textures, floats) |
| **Graph Inspector** | Configure the shader target (Lit, Unlit, Sprite), surface type (Opaque, Transparent), and precision |
| **Node Canvas** | Wire nodes from left to right — data flows from inputs through operations into the Master Stack outputs |

### The Master Stack

The Master Stack is the final output of your shader. It has two sections:

- **Vertex Stage** — Modify vertex positions and normals before rasterization. Use this for wind sway, water waves, or vertex displacement from a height map.
- **Fragment Stage** — Set per-pixel properties like Base Color, Normal, Metallic, Smoothness, Emission, and Alpha.

```
[ Texture Sample ] ──► [ Multiply ] ──► Master Stack: Base Color
[ Color Property ] ──┘

// WHY: Multiplying a texture by a color property lets artists
// tint materials in the Inspector without duplicating textures.
```

### Essential Node Categories

| Category | Key Nodes | Use Case |
|----------|-----------|----------|
| **Input** | Texture 2D, Color, Float, Time, UV | Feed data into the graph |
| **Math** | Add, Multiply, Lerp, Clamp, Step | Blend values, create gradients, thresholds |
| **UV** | Tiling And Offset, Rotate, Flipbook | Animate or transform texture coordinates |
| **Channel** | Split, Combine, Swizzle | Extract R/G/B/A or rearrange components |
| **Artistic** | Blend, Contrast, Saturation | Color correction without leaving the graph |
| **Procedural** | Noise (Gradient, Simple, Voronoi), Checkerboard | Generate patterns without textures |

### Sub Graphs — Reusable Shader Logic

Sub Graphs are Shader Graph's equivalent of functions. Create them when you notice repeated node patterns across multiple shaders.

```
Right-click in Project window →
  Create → Shader Graph → Sub Graph
```

A Sub Graph has its own Blackboard for inputs and output nodes. Drop it into any parent Shader Graph as a single node. This keeps complex shaders readable and lets your team share common operations (e.g., a "Triplanar Mapping" sub-graph used by terrain, cliff, and building shaders).

### Custom Function Nodes — Escape Hatch to HLSL

When built-in nodes can't express your logic, the Custom Function node lets you write raw HLSL:

**String Mode** — inline code for small operations:

```hlsl
// Custom Function: "FresnelCustom"
// Inputs: float3 Normal, float3 ViewDir, float Power
// Output: float Out

void FresnelCustom_float(
    float3 Normal,
    float3 ViewDir,
    float Power,
    out float Out)
{
    // WHY: Built-in Fresnel node doesn't expose a custom falloff curve.
    // This version uses a configurable power exponent for artistic control.
    Out = pow(1.0 - saturate(dot(Normal, ViewDir)), Power);
}
```

**File Mode** — reference an external `.hlsl` file for larger functions or team-shared libraries. The file path is relative to the Assets folder:

```
Assets/Shaders/Include/MyLighting.hlsl
```

**Precision tip:** Use the `$precision` token instead of `half` or `float` in string mode. Unity substitutes the correct type based on the node's precision setting, which helps mobile shaders stay performant with half-precision math.

### Shader Graph Best Practices

1. **Start with URP Lit Shader Graph** — it handles PBR lighting, shadows, and fog automatically. Only go Unlit when you specifically need to bypass the lighting pipeline (UI elements, custom toon shading).

2. **Expose properties, don't hardcode** — any value an artist might want to tweak should be a Blackboard property. Use the `[HDR]` attribute on color properties to enable bloom-compatible emission.

3. **Use Sub Graphs for patterns you repeat** — triplanar mapping, dissolve effects, wind animation. Each Sub Graph compiles once and is referenced by pointer, not duplicated.

4. **Keep an eye on instruction count** — the Graph Inspector shows the compiled shader's vertex/fragment instruction counts. Mobile targets should aim for under 100 fragment instructions for opaque shaders.

5. **URP and HDRP graphs are NOT interchangeable** — the Master Stack nodes differ between pipelines. If you need to support both, use Sub Graphs for shared logic and create separate root graphs per pipeline.

---

## Part 2 — VFX Graph

### What VFX Graph Does

VFX Graph is Unity's GPU-based particle system. Unlike the legacy Particle System (Shuriken), which runs on the CPU, VFX Graph simulates millions of particles on the GPU using compute shaders. This makes it the right choice for:

- **High particle counts** — fire, rain, snow, magical auras, debris fields
- **Complex behaviors** — particles that interact with physics, spawn other particles, or follow vector fields
- **Mesh output** — render particles as animated meshes, not just billboards

**When to use legacy Particle System instead:** Simple effects (< 1000 particles) where CPU access to particle data is needed (e.g., gameplay logic that reads particle positions). Legacy Particle System is also lighter on GPU fill rate for very simple sprites.

### VFX Graph Architecture — The Four Contexts

Every VFX Graph flows through four context blocks, executed in order each frame:

```
┌─────────┐    ┌────────────┐    ┌────────────┐    ┌────────────┐
│  Spawn   │ ──►│ Initialize │ ──►│   Update   │ ──►│   Output   │
│          │    │  Particle  │    │  Particle  │    │  Particle  │
└─────────┘    └────────────┘    └────────────┘    └────────────┘
 How many?      Where & how       What changes      How to render
               do they start?     each frame?       (quad, mesh, etc.)
```

#### Spawn Context
Controls *when* and *how many* particles are created. Built-in spawning modes:

- **Constant Rate** — steady stream (e.g., 100 particles/sec for campfire embers)
- **Periodic Burst** — pulses at intervals (e.g., explosion bursts every 2 seconds)
- **Variable Rate** — rate driven by a curve or external parameter (e.g., rain intensity tied to a gameplay variable)
- **Single Burst** — one-shot emission triggered by an event

#### Initialize Particle Context
Sets starting values for each new particle:

- **Position** — shape-based (sphere, box, cone, mesh surface, skinned mesh)
- **Velocity** — direction and speed at birth
- **Lifetime** — how long the particle lives (in seconds)
- **Size, Color, Rotation** — initial visual properties
- **Capacity** — maximum alive particles in this system (GPU buffer size)

```
// WHY capacity matters: VFX Graph pre-allocates a GPU buffer of this size.
// Setting it too high wastes VRAM. Too low and particles silently stop spawning
// when the buffer is full. Profile and set to ~1.5x your expected peak count.
```

#### Update Particle Context
Runs every frame for every living particle. Common blocks:

| Block | What It Does |
|-------|-------------|
| **Gravity** | Apply constant downward force |
| **Turbulence** (Noise) | Organic, swirling motion using GPU noise |
| **Conform to Sphere/SDF** | Attract or repel particles from a shape |
| **Collision** (Plane, Depth Buffer) | Bounce or kill on contact with world geometry |
| **Trigger Event On Die** | Spawn child particles when this particle dies |
| **Trigger Event Rate** | Continuously spawn children from living particles |
| **Age Over Lifetime** | Drive color/size curves based on normalized age |

#### Output Particle Context
Determines visual representation:

- **Quad** — camera-facing billboard (cheapest, good for smoke/sparks)
- **Mesh** — render each particle as a 3D mesh (debris, leaves, butterflies)
- **Strip** — connect particles into ribbons (trails, lightning, laser beams)
- **Decal** — project particles onto surfaces (blood splatter, scorch marks)

### GPU Events — Particle Cascades

GPU Events let one particle system trigger another entirely on the GPU, with no CPU round-trip:

```
System A (Firework shell)            System B (Sparks)
┌──────────┐                        ┌──────────┐
│  Update   │── Trigger On Die ──►  │Initialize │
│  Particle │   (GPU Event)         │  Particle │
└──────────┘                        └──────────┘

// WHY this is powerful: When a firework shell particle dies,
// it instantly spawns 50 spark particles at its death position.
// All on GPU — no per-particle C# callbacks needed.
```

### Integrating VFX Graph with Shader Graph

Unity 6 lets you use Shader Graph shaders as the rendering material for VFX Graph outputs:

1. In VFX Graph, select your Output context
2. In the Inspector, set **Shader Graph** as the material type
3. Assign your custom Shader Graph asset

This is how you create particles with complex material effects — dissolving sparks, holographic fragments, or iridescent bubbles. The Shader Graph receives VFX Graph attributes (age, lifetime, color) as automatic inputs.

### VFX Graph Performance Guidelines

1. **Set Capacity conservatively** — each particle consumes GPU memory even when dead. Start low, profile, increase only if particles are getting culled.

2. **Use LOD (Level of Detail)** — VFX Graph supports camera-distance LODs that reduce spawn rate and complexity for distant effects. Configure in the Output context.

3. **Prefer Depth Buffer collision over physics** — Depth Buffer collision reads the existing depth texture (free if you already render opaques). Physics-based collision is more accurate but significantly more expensive.

4. **Bake complex simulations to textures** — for effects like fluid, smoke, or vector fields, pre-compute them in Houdini or EmberGen and import as Texture3D or Point Cache assets. The GPU reads baked data instead of computing it live.

5. **Profile with the VFX Graph Profiler** — open from the VFX Graph editor toolbar. It shows per-context GPU time, alive particle count, and buffer usage.

---

## Common Patterns for Game Developers

### Pattern: Dissolve Effect (Shader Graph)

A dissolve shader that burns away a mesh, commonly used for enemy death or teleportation:

```
Shader Graph Structure:
───────────────────────
[Noise (Gradient)]         [Float: Dissolve Amount]
       │                          │
       └──────► [Step] ◄─────────┘
                  │
                  ├──► Master Stack: Alpha Clip Threshold
                  │
       [Edge Detection on Step output]
                  │
       [Multiply by HDR Color]
                  │
                  └──► Master Stack: Emission

// WHY: Step compares noise against the dissolve amount.
// Pixels where noise < dissolve are clipped (invisible).
// The edge detection creates a glowing border at the dissolve front.
// HDR emission makes the edge bloom in post-processing.
```

Expose `Dissolve Amount` (0–1) as a Blackboard property. Animate it from C# or Timeline to control the effect.

### Pattern: Hit Flash (Shader Graph)

A brief white flash when an enemy takes damage:

```
[Lerp]
  A: Original Base Color (from texture)
  B: White (1,1,1)
  T: Float Property "Flash Amount"
  Out ──► Master Stack: Base Color

// WHY: Lerp blends between normal and white.
// Set Flash Amount to 1 from C#, then tween back to 0 over 0.1s.
// Simpler and cheaper than swapping materials.
```

### Pattern: Campfire (VFX Graph)

A complete campfire effect combining multiple systems:

```
System 1: Flames
  Spawn: Constant Rate 200
  Initialize: Position = Cone (narrow), Velocity = Up + Random, Size = 0.3-0.8
  Update: Turbulence (low), Color Over Life (yellow → orange → red → black)
  Output: Quad, Additive blend

System 2: Embers
  Spawn: Constant Rate 30
  Initialize: Position = Sphere (small), Velocity = Up + High Random
  Update: Gravity (light), Turbulence (medium), Size Over Life (shrink)
  Output: Quad, Additive blend, small size

System 3: Smoke
  Spawn: Constant Rate 10
  Initialize: Position = Point (center), Velocity = Slow Up
  Update: Turbulence (high), Size Over Life (grow), Alpha Over Life (fade)
  Output: Quad, Alpha blend, large size, Lit shader for light interaction
```

---

## Quick Reference

| Task | Tool | Key Approach |
|------|------|-------------|
| Custom material look | Shader Graph | Build in node editor, expose properties to artists |
| Dissolve / hologram / toon | Shader Graph | Use noise, step, and emission nodes |
| Code-level shader math | Custom Function Node | Write HLSL in string or file mode |
| Reuse shader logic | Sub Graph | Extract common patterns into shared assets |
| Thousands of particles | VFX Graph | GPU-simulated, use Spawn → Init → Update → Output |
| Particle cascades | GPU Events | Trigger On Die / Trigger Rate between systems |
| Custom particle look | VFX Graph + Shader Graph | Assign Shader Graph material to VFX Output |
| Simple < 1000 particles | Legacy Particle System | CPU-based, easier C# integration |

---

## Further Reading

- [Unity Shader Graph Manual](https://docs.unity3d.com/Packages/com.unity.shadergraph@17.0/manual/index.html)
- [Unity VFX Graph Manual](https://docs.unity3d.com/Packages/com.unity.visualeffectgraph@17.0/manual/index.html)
- [The Definitive Guide to Advanced VFX in Unity 6 (e-book)](https://unity.com/resources/creating-advanced-vfx-unity6)
- [Cyanilux Shader Graph Tutorials](https://www.cyanilux.com/tutorials/intro-to-shader-graph/)
