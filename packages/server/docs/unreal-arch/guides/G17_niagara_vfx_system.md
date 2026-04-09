# G17 — Niagara VFX System

> **Category:** guide · **Engine:** Unreal Engine 5.4+ · **Related:** [G9 Rendering — Nanite & Lumen](G9_rendering_nanite_lumen.md) · [G10 Debugging & Profiling](G10_debugging_profiling.md) · [Architecture Overview](../architecture/E1_architecture_overview.md)

Niagara is Unreal Engine 5's modular, data-driven particle system that replaced Cascade. It uses a stack-based simulation pipeline where Systems contain Emitters, and Emitters are built from composable Modules. Niagara supports both CPU and GPU simulation, custom data interfaces, and a visual scripting environment for technical artists. This guide covers the architecture, common effect patterns, C++ integration, and optimization strategies.

---

## Architecture Overview

```
┌──────────────────────────────────────────────────────┐
│                   Niagara System                       │
│  (UNiagaraSystem — placed in level via component)      │
│                                                        │
│  ┌─────────────────┐  ┌─────────────────┐             │
│  │   Emitter A      │  │   Emitter B      │  ...       │
│  │  (UNiagaraEmitter)│  │                  │           │
│  │                   │  │                  │           │
│  │  ┌─Module Stack─┐ │  │  ┌─Module Stack─┐│           │
│  │  │ Emitter Spawn│ │  │  │ Emitter Spawn││           │
│  │  │ Emitter Update│ │  │  │ Emitter Update│           │
│  │  │ Particle Spawn│ │  │  │ Particle Spawn│           │
│  │  │ Particle Update│ │ │  │ Particle Update│          │
│  │  │ Render        │ │  │  │ Render        ││          │
│  │  └───────────────┘ │  │  └───────────────┘│          │
│  └─────────────────┘  └─────────────────┘             │
└──────────────────────────────────────────────────────┘
```

### Key Concepts

**System** — The top-level asset (`UNiagaraSystem`). A system is a container for one or more emitters that together produce a complete visual effect (e.g., a campfire = flame emitter + smoke emitter + sparks emitter + light emitter). Systems are placed in levels via `UNiagaraComponent`.

**Emitter** — An independent particle generator within a system (`UNiagaraEmitter`). Each emitter has its own simulation mode (CPU or GPU), spawn rules, update logic, and renderer. Emitters can be enabled/disabled and configured independently.

**Module** — A reusable, stackable block of simulation logic. Modules are Niagara Scripts (visual node graphs) that read and write particle or emitter attributes. They execute top-to-bottom within each simulation stage. You can write custom modules in the Niagara Module Editor or in C++ via `UNiagaraDataInterface`.

**Parameter** — Named, typed values that flow through the simulation. Parameters can be set per-system, per-emitter, or per-particle, and can be exposed for Blueprint/C++ control.

---

## Simulation Pipeline

Niagara executes modules in a strict stage order every frame:

```
Frame Tick
  │
  ├─► System Spawn      (once when system activates)
  │     Set system-level defaults
  │
  ├─► System Update      (every frame)
  │     System-wide logic (e.g., wind direction for all emitters)
  │
  └─► For each Emitter:
        │
        ├─► Emitter Spawn    (once when emitter activates)
        │     Initialize emitter parameters
        │
        ├─► Emitter Update   (every frame)
        │     Compute spawn rate, control emitter state
        │
        ├─► Particle Spawn   (for each newly born particle)
        │     Initialize position, velocity, color, lifetime
        │
        ├─► Particle Update  (for each living particle, every frame)
        │     Apply forces, update color/size over lifetime, collision
        │
        └─► Render           (draw all particles)
              Sprite, Mesh, Ribbon, or Light renderer
```

### Stage Details

**Emitter Spawn** — Runs once when the emitter first activates. Use it to initialize emitter-level state like spawn count curves, random seeds, or cached positions.

**Emitter Update** — Runs every frame for the emitter as a whole. The `Spawn Rate` and `Spawn Burst Instantaneous` modules live here. This is also where you evaluate emitter lifecycle (e.g., `Emitter State` module controls looping vs. one-shot).

**Particle Spawn** — Runs once per particle at birth. The `Initialize Particle` module sets initial position, velocity, color, sprite size, lifetime, and mass. This is where you define the "shape" of your spawn — sphere, cone, mesh surface, etc.

**Particle Update** — Runs every frame for every living particle. Common modules: `Gravity Force`, `Drag`, `Scale Color` (fade over lifetime), `Scale Sprite Size`, `Curl Noise Force`, `Collision` (scene depth, distance fields, or ray traces).

**Render** — Not a simulation stage but a configuration for how particles are drawn. Each emitter gets exactly one renderer.

---

## Renderer Types

| Renderer | Use Case | Key Properties |
|----------|----------|----------------|
| **Sprite Renderer** | Camera-facing billboards (fire, smoke, sparks) | Material, SubImage (flipbooks), Alignment, Facing Mode, Sort Order |
| **Mesh Renderer** | 3D geometry per particle (debris, shrapnel) | Static Mesh, Material Override, Facing, Enable Camera Distance Culling |
| **Ribbon Renderer** | Connected trails (sword swipes, lightning, laser beams) | Material, Ribbon Width, Tessellation, UV mode (Stretch/Tile) |
| **Light Renderer** | Dynamic point lights per particle (fireflies, sparks) | Color Binding, Radius Scale, Intensity. **Expensive** — use sparingly |
| **Component Renderer** | Spawns full UE components per particle (advanced) | Component class, template. Heavy — use for special cases only |

---

## GPU vs. CPU Simulation

| Aspect | CPU Simulation | GPU Simulation |
|--------|---------------|----------------|
| Particle count sweet spot | < 10,000 | 10,000 – 1,000,000+ |
| Collision support | Full scene raycasts | Depth buffer, distance fields |
| Data interfaces | All | Subset (no skeletal mesh sampling on GPU) |
| Debug workflow | Full Niagara debugger | Limited (GPU readback required) |
| Platform support | All | Requires compute shader support |
| When to choose | Complex per-particle logic, few particles | Massive particle counts, simple logic |

Set simulation target in: **Emitter Properties → Sim Target → CPUSim or GPUComputeSim**.

```
WHY default to GPU for high counts: GPU simulations run particle update
logic as compute shaders, processing thousands of particles in parallel.
The CPU only submits the dispatch — the actual per-particle work is free
from a CPU perspective. The tradeoff is that GPU particles can't easily
read arbitrary game state (like skeletal bone positions) without explicit
data interface setup.
```

---

## Common Effect Recipes

### Fire Effect (3-Emitter System)

```
System: SFX_Campfire
  │
  ├── Emitter: Flames
  │     Sim: GPU
  │     Spawn: 200/sec
  │     Particle Spawn:
  │       • Shape Location: Cylinder (radius 20, height 5)
  │       • Initial Velocity: (0, 0, Random 50-150) — upward
  │       • Initial Color: (1.0, 0.6, 0.1, 1.0) — orange
  │       • Lifetime: Random 0.3-0.8
  │     Particle Update:
  │       • Gravity Force: (0, 0, 50) — slight upward buoyancy
  │       • Curl Noise Force: Strength 30, Frequency 2
  │       • Scale Color: Alpha fades 1→0 over lifetime
  │       • Scale Sprite Size: 1→2 over lifetime (expanding flames)
  │     Renderer: Sprite — Additive blend, SubImage flipbook 4×4
  │
  ├── Emitter: Smoke
  │     Sim: GPU
  │     Spawn: 30/sec
  │     Particle Spawn:
  │       • Shape: same cylinder, offset Z+100
  │       • Initial Velocity: (0, 0, 30-80)
  │       • Initial Color: (0.15, 0.12, 0.1, 0.4) — dark gray
  │       • Lifetime: 2-4 sec
  │     Particle Update:
  │       • Drag: 0.5
  │       • Curl Noise Force: Strength 15
  │       • Scale Sprite Size: 1→4 (expanding smoke)
  │       • Scale Color: Alpha 0.4→0 (fades out)
  │     Renderer: Sprite — Translucent, large SubImage
  │
  └── Emitter: Sparks
        Sim: GPU
        Spawn: Burst 5-10 every 0.5 sec
        Particle Spawn:
          • Shape: Point at fire center
          • Initial Velocity: Random hemisphere, speed 200-500
          • Lifetime: 0.5-1.5 sec
          • Sprite Size: 1-3
        Particle Update:
          • Gravity Force: (0, 0, -400) — real gravity
          • Scale Color: orange→red, alpha 1→0
        Renderer: Sprite — Additive, tiny dot texture
```

---

## C++ Integration

### Spawning a Niagara System

```cpp
#include "NiagaraFunctionLibrary.h"
#include "NiagaraSystem.h"
#include "NiagaraComponent.h"

// WHY SpawnSystemAtLocation vs. AttachToComponent: Use SpawnSystemAtLocation
// for one-shot effects (explosions, impacts) that don't need to follow an
// actor. Use SpawnSystemAttached for effects that move with an actor (muzzle
// flash, engine exhaust).
void AMyActor::SpawnExplosion(FVector Location)
{
    UNiagaraSystem* ExplosionSystem = LoadObject<UNiagaraSystem>(
        nullptr, TEXT("/Game/VFX/NS_Explosion"));
    
    if (ExplosionSystem)
    {
        UNiagaraComponent* NiagaraComp = 
            UNiagaraFunctionLibrary::SpawnSystemAtLocation(
                GetWorld(),
                ExplosionSystem,
                Location,
                FRotator::ZeroRotator,
                FVector(1.0f),       // Scale
                true,                // Auto-destroy when complete
                true,                // Auto-activate
                ENCPoolMethod::AutoRelease  // Return to pool when done
            );
    }
}
```

### Setting Parameters from C++

```cpp
// WHY set parameters at runtime: This lets gameplay drive VFX —
// damage intensity controls fire size, speed controls trail length, etc.
void AMyActor::UpdateVFXIntensity(float Intensity)
{
    if (UNiagaraComponent* NiagaraComp = FindComponentByClass<UNiagaraComponent>())
    {
        // Set a float parameter exposed in the Niagara system
        NiagaraComp->SetFloatParameter(FName("Intensity"), Intensity);
        
        // Set a vector parameter (e.g., wind direction)
        NiagaraComp->SetVectorParameter(FName("WindDirection"), 
            FVector(100.0f, 0.0f, 50.0f));
        
        // Set a color parameter
        NiagaraComp->SetColorParameter(FName("ParticleColor"),
            FLinearColor(1.0f, 0.3f, 0.1f, 1.0f));
    }
}
```

### Custom Data Interface (Advanced)

Data Interfaces let you feed arbitrary game data into Niagara. Common built-in DIs:

| Data Interface | Purpose |
|---------------|---------|
| `Skeletal Mesh` | Sample bone positions, skin normals (CPU only) |
| `Static Mesh` | Spawn on mesh surface |
| `Spline` | Follow a spline path |
| `Audio Spectrum` | React to audio frequencies |
| `Landscape` | Sample terrain height/normals |
| `Collision Query` | Raycast from particles |
| `Array` | Pass arbitrary arrays from Blueprint/C++ |
| `Render Target 2D` | Read/write textures (GPU fluid sims) |

---

## Optimization Best Practices

### 1. Fewer Emitters = Better Performance

```
WHY: Each emitter has per-frame overhead for VM invocation (CPU sim) or
GPU dispatch. One emitter with 1000 particles is faster than 10 emitters
with 100 particles each. Combine similar-looking particles into a single
emitter where possible — use random variation in Initialize Particle to
create visual diversity within one emitter.
```

### 2. Set Fixed Bounds

By default, Niagara dynamically calculates bounding boxes each frame. This is expensive.

```
Emitter Properties → Bounds → Local Bounds Mode: Fixed
  Set to a generous box that covers the full effect volume.
  
WHY: Dynamic bounds require reading back particle positions from the GPU
every frame to compute the AABB. Fixed bounds skip this entirely. The
tradeoff is that if particles leave the fixed bounds, they'll be culled
prematurely — so set bounds generously.
```

### 3. Use Scalability Settings

```
Emitter Properties → Scalability
  • Assign emitters to scalability groups (Low, Medium, High, Epic, Cine)
  • Set max particle count per group
  • Configure distance-based culling
  
WHY: Scalability lets you automatically reduce VFX complexity on lower-end
hardware without maintaining separate effect assets. A smoke emitter might
spawn 200 particles on Epic but only 50 on Low.
```

### 4. Use Lightweight Emitters (UE 5.4+)

Lightweight emitters are a reduced-functionality mode optimized for simple, high-volume effects.

```
Emitter Properties → Emitter Mode → Lightweight

Limitations:
  • No events, no custom simulation stages
  • Limited module support (basic spawn, update, render)
  • Sprite renderer only

Benefits:
  • Significantly reduced CPU overhead per emitter
  • Ideal for ambient particles: dust motes, floating pollen, rain
```

### 5. Material Optimization for Particles

```
• Keep shader instruction count < 100-150 for particle materials
• Use alpha cutout (Masked blend mode) instead of Translucent where possible
  — Masked renders in the opaque pass, avoiding expensive translucency sorting
• Use SubImage (flipbooks) instead of complex shader animation
• Avoid reading SceneDepth or SceneColor in particle materials on mobile
```

### 6. Particle Count Budgets

| Platform | Approximate Budget | Notes |
|----------|-------------------|-------|
| Desktop (GPU sim) | 100,000 – 500,000 | Depends on material complexity |
| Console (GPU sim) | 50,000 – 200,000 | Profile per title |
| Mobile (CPU sim) | 500 – 5,000 | GPU compute often unavailable |
| VR | 10,000 – 50,000 | Must maintain 90fps |

### 7. Object Pooling for Niagara Components

```cpp
// WHY ENCPoolMethod::AutoRelease: Without pooling, every SpawnSystemAtLocation
// creates a new UNiagaraComponent, triggers garbage collection when destroyed.
// Pooling reuses components, avoiding allocation churn during combat/explosions.

UNiagaraFunctionLibrary::SpawnSystemAtLocation(
    GetWorld(),
    System,
    Location,
    FRotator::ZeroRotator,
    FVector(1.0f),
    true,    // bAutoDestroy
    true,    // bAutoActivate
    ENCPoolMethod::AutoRelease  // ← pool it
);
```

---

## Debugging Niagara Effects

### Niagara Debugger

Enable via **Window → Niagara Debugger** or console command `fx.Niagara.Debug 1`.

Shows per-system and per-emitter stats: active particle count, simulation time, memory usage, and bounds visualization.

### Performance HUD

```
Console: stat niagara

Displays:
  • Total active systems and emitters
  • CPU simulation time (ms)
  • GPU simulation time (ms)
  • Total particle count
  • Memory usage
```

### Common Pitfalls

| Problem | Cause | Fix |
|---------|-------|-----|
| Particles pop in/out | Dynamic bounds too tight or culled by distance | Use fixed bounds or increase cull distance |
| VFX invisible in build | Material not included in build | Add material to Always Cook or reference from a loaded asset |
| GPU particles flicker | Reading from write-after-read buffer | Add a simulation stage barrier or split into two stages |
| Performance tank with many systems | Too many emitters, dynamic bounds | Pool components, fix bounds, use scalability |
| Particles don't collide | Wrong collision module for sim target | CPU: Scene Trace, GPU: Depth Buffer or Distance Field |
