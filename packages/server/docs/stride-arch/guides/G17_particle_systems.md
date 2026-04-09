# G17 — Particle Systems

> **Category:** guide · **Engine:** Stride · **Related:** [G07 Custom Render Features](./G07_custom_render_features.md) · [G04 SDSL Shader Development](./G04_sdsl_shader_development.md) · [G16 Audio System](./G16_audio_system.md) · [G15 Mesh Buffer Helpers](./G15_mesh_buffer_helpers.md)

Stride ships with a full-featured GPU-accelerated particle system that supports billboard sprites, mesh particles, ribbon trails, and custom particle types. Particles are configured through the editor with a modular initializer/updater architecture, or extended in code with custom spawners, updaters, and materials. This guide covers editor setup, the runtime API, custom particle extensions, and performance optimization.

---

## Particle System Architecture

A Stride particle system is composed of:

1. **ParticleSystemComponent** — the entity component that hosts the particle system
2. **ParticleSystem** — the root container, holding one or more emitters
3. **ParticleEmitter** — each emitter defines a single stream of particles with its own spawner, initializers, updaters, shape builder, and material
4. **Spawners** — control when and how many particles are created (per-second, burst, distance-based)
5. **Initializers** — set initial values when a particle is born (position, velocity, size, color, lifetime)
6. **Updaters** — modify particles each frame (gravity, color-over-lifetime, size-over-lifetime, force fields)
7. **ShapeBuilder** — determines how particles are rendered (billboard quad, oriented quad, ribbon trail, mesh)
8. **ParticleMaterial** — the shader and texture used to draw particles

This modular pipeline means you can mix and match behaviors without writing code for most common effects.

---

## Creating Particles in the Editor

### Quick Setup

1. Right-click in the **Scene Editor** or **Entity Tree**
2. Select **Particle System** → choose a preset:
   - **Empty** — blank emitter, configure everything manually
   - **Simple** — basic billboard particles with gravity
   - **Fountain** — upward burst with spread and gravity falloff
   - **Ribbon** — trail particles connected as a ribbon strip

3. The new entity gets a `ParticleSystemComponent` with one emitter pre-configured

### Emitter Configuration

Select the particle entity, expand the **Particle System** component in the **Property Grid**:

**Spawner Settings:**
- **Spawner Type** — `PerSecond` (continuous), `Burst` (one-shot), `Distance` (emit while moving)
- **Particles/Second** — emission rate for continuous spawners
- **Burst Count** — number of particles per burst
- **Loop** — whether the emitter repeats

**Initializer Stack:**
Add initializers to set birth values:
- `PositionSeed` — spawn position with random offset (sphere, box, cone, edge distributions)
- `VelocitySeed` — initial velocity with random spread
- `SizeSeed` — initial size range (min/max)
- `ColorSeed` — initial color or color range
- `LifetimeSeed` — how long each particle lives (seconds)
- `RotationSeed` — initial rotation for oriented particles

**Updater Stack:**
Add updaters for per-frame behavior:
- `GravityUpdater` — applies constant downward acceleration
- `ColorAnimation` — interpolates color over particle lifetime using a gradient
- `SizeAnimation` — scales size over lifetime using a curve
- `ForceFieldUpdater` — attracts/repels particles toward a point or along an axis
- `DirectionFromSpeed` — orients particles along their velocity vector
- `CollisionUpdater` — bounces particles off planes (ground, walls)

---

## Shape Builders

The shape builder controls particle geometry:

### Billboard (Default)

Flat quads that always face the camera. Best for smoke, sparks, dust, and most 2D-in-3D effects.

```
ShapeBuilder: Billboard
  - ScreenAligned: true   → always faces screen
  - CameraFacing: false   → faces camera position (parallax at edges)
```

### Oriented Quad

Quads oriented along particle velocity or a fixed axis. Used for rain, speed lines, and directional effects.

### Ribbon / Trail

Particles connected by a continuous strip. The shape builder generates a mesh connecting sequential particles. Used for sword trails, magic effects, tire tracks, and contrails.

Configuration:
- **Segments Per Particle** — smoothness of the ribbon curve
- **Texture Mode** — `Stretch` (one texture across the full ribbon), `Tile` (repeat per segment)
- **Sort By** — `Age` (oldest first, typical) or `Custom`

### Mesh Particles

Instead of quads, each particle renders a 3D mesh (leaves, debris, shell casings). Assign a `Model` asset to the shape builder. Mesh particles have higher per-particle cost, so limit max count.

---

## Materials and Shaders

### Built-in Particle Materials

Stride provides particle-specific material types:

- **Unlit Particle** — no lighting, flat texture × color. Best for glowing effects (fire, magic, sparks).
- **Lit Particle** — receives scene lighting. Used for debris, leaves, and physically grounded particles.

Both support:
- Texture atlas with animated UV (flipbook animation)
- Additive, alpha, or opaque blending
- Soft particles (depth-fade near geometry to avoid hard cutoff)

### Flipbook Animation

For animated particles (explosion sequences, animated fire):

1. Create a texture atlas with frames in a grid layout
2. Set the material's **Animation** to `Flipbook`
3. Configure **Columns** and **Rows** matching the atlas grid
4. Set **Frames Per Second** for playback speed
5. Enable **Random Start Frame** to avoid all particles looking identical

### Custom Particle Shaders

For effects beyond the built-in materials, write custom SDSL shaders. See [G04 SDSL Shader Development](./G04_sdsl_shader_development.md) for the shader language. A custom particle shader typically:

1. Extends `ParticleBaseEffect` or `ComputeColor`
2. Reads particle attributes (UV, color, age) from the vertex stream
3. Outputs the final fragment color with custom logic (noise distortion, rim lighting, dissolve)

---

## Runtime API

Control particles from scripts at runtime:

```csharp
using Stride.Engine;
using Stride.Particles;
using Stride.Particles.Components;

public class ExplosionSpawner : SyncScript
{
    // Assign a prefab containing a particle system entity
    public Prefab ExplosionPrefab;

    public void SpawnExplosion(Vector3 position)
    {
        var entities = ExplosionPrefab.Instantiate();
        var explosionEntity = entities[0];
        explosionEntity.Transform.Position = position;
        SceneSystem.SceneInstance.RootScene.Entities.Add(explosionEntity);

        // The particle system starts automatically
        // Remove after particles finish
        Script.AddTask(async () =>
        {
            await Task.Delay(3000);  // Wait for effect to finish
            SceneSystem.SceneInstance.RootScene.Entities.Remove(explosionEntity);
        });
    }
}
```

### Controlling Emitters at Runtime

```csharp
var particleComp = Entity.Get<ParticleSystemComponent>();
var system = particleComp.ParticleSystem;

// Access the first emitter
var emitter = system.Emitters[0];

// Pause / resume emission
emitter.CanEmitParticles = false;  // Stop spawning new particles
emitter.CanEmitParticles = true;   // Resume

// Change spawn rate dynamically
if (emitter.Spawners[0] is SpawnerPerSecond spawner)
{
    spawner.SpawnCount = 200f;  // Increase emission rate
}

// Trigger a burst manually
if (emitter.Spawners[0] is SpawnerBurst burst)
{
    burst.SpawnCount = 50;
    // Burst fires on the next emitter tick
}
```

### Resetting a Particle System

```csharp
// Clear all living particles and restart
particleComp.ParticleSystem.ResetSimulation();
```

---

## Custom Spawners and Updaters

For behaviors not covered by the built-in modules, create custom spawners or updaters in C#.

### Custom Spawner Example

A spawner that emits particles on a musical beat:

```csharp
using Stride.Core;
using Stride.Particles;
using Stride.Particles.Spawners;

[DataContract("BeatSpawner")]
[Display("Beat Spawner")]
public class BeatSpawner : ParticleSpawner
{
    [DataMember(10)]
    public int ParticlesPerBeat { get; set; } = 20;

    [DataMember(20)]
    public float BPM { get; set; } = 120f;

    private float beatTimer;

    public override void SpawnNew(float dt, ParticleEmitter emitter)
    {
        float beatInterval = 60f / BPM;
        beatTimer += dt;

        if (beatTimer >= beatInterval)
        {
            beatTimer -= beatInterval;
            emitter.EmitParticles(ParticlesPerBeat);
        }
    }
}
```

Custom spawners and updaters appear in the editor's dropdown menus after compilation, so designers can configure them without touching code.

### Custom Updater Example

An updater that applies wind with turbulence:

```csharp
using Stride.Core;
using Stride.Core.Mathematics;
using Stride.Particles;
using Stride.Particles.Updaters;

[DataContract("WindUpdater")]
[Display("Wind Turbulence")]
public class WindUpdater : ParticleUpdater
{
    [DataMember(10)]
    public Vector3 WindDirection { get; set; } = new Vector3(1, 0, 0);

    [DataMember(20)]
    public float WindStrength { get; set; } = 5f;

    [DataMember(30)]
    public float TurbulenceScale { get; set; } = 0.3f;

    public override void Update(float dt, ParticlePool pool)
    {
        var posField = pool.GetField(ParticleFields.Position);
        var velField = pool.GetField(ParticleFields.Velocity);

        if (!posField.IsValid() || !velField.IsValid()) return;

        foreach (var particle in pool)
        {
            var pos = particle.Get(posField);
            var vel = particle.Get(velField);

            // Simple noise-based turbulence
            float noise = MathF.Sin(pos.X * TurbulenceScale + pos.Y * 0.7f)
                        * MathF.Cos(pos.Z * TurbulenceScale * 0.5f);

            var windForce = WindDirection * WindStrength * (1f + noise * 0.5f);
            vel += windForce * dt;

            particle.Set(velField, vel);
        }
    }
}
```

---

## Performance Optimization

### Particle Budgeting

Set **Max Particles** on each emitter to cap the pool size. A good budget:

| Platform | Max particles per system | Max concurrent systems |
|---|---|---|
| Desktop (60fps) | 5,000–10,000 | 10–20 |
| Mobile | 500–2,000 | 3–5 |
| VR (90fps) | 2,000–5,000 | 5–10 |

### Reducing Overdraw

Overdraw is the primary particle performance bottleneck. Mitigations:

- **Fewer, larger particles** — prefer 20 large smoke puffs over 200 small ones
- **Opaque or cutout materials** — write to depth buffer, eliminating overdraw. Use for debris, leaves, and sparks
- **Additive blending** — cheaper than alpha blending (no sort required), good for fire and glow
- **Soft particles with short fade** — keep the depth fade distance small to minimize the blended pixel area

### LOD for Particles

Stride does not have built-in particle LOD, but you can implement it by adjusting spawn rate based on camera distance:

```csharp
float distance = (cameraPosition - Entity.Transform.WorldMatrix.TranslationVector).Length();

if (distance > 50f)
    spawner.SpawnCount = baseRate * 0.25f;  // 25% at long range
else if (distance > 20f)
    spawner.SpawnCount = baseRate * 0.5f;   // 50% at mid range
else
    spawner.SpawnCount = baseRate;           // Full rate up close
```

### Sorting

Transparent particles need back-to-front sorting for correct blending. Sorting has a per-frame CPU cost proportional to particle count. Reduce this by:

- Using additive blending (no sort needed) where visually acceptable
- Limiting max particles on sorted emitters
- Disabling sorting on particles that are always far from each other (wide-area ambient effects)

---

## Common Effect Recipes

### Fire

- Two emitters: orange-red billboard flames (additive) + gray smoke (alpha blend)
- Flames: short lifetime (0.3–0.8s), upward velocity, size grows then shrinks, color fades from white-hot to orange to transparent
- Smoke: longer lifetime (1–3s), slower upward drift, size grows over life, gray → transparent

### Sparks

- One emitter: small oriented quads, high initial velocity with spread, strong gravity updater
- Short lifetime (0.2–0.5s), bright yellow/orange color, no size change
- Enable `DirectionFromSpeed` to orient along velocity

### Magic Trail (Ribbon)

- Ribbon shape builder, distance-based spawner on a moving entity
- Color gradient from bright core (white/blue) to transparent edges
- Enable soft particles for smooth blending with geometry
- Add a second emitter with small billboard sparkles along the same path

---

## Next Steps

- Start with the **Fountain** preset and experiment with initializer/updater settings in the editor
- For projectile trails, combine a ribbon emitter on the projectile entity with a burst emitter for impact
- Write custom SDSL shaders for unique particle visuals — see [G04 SDSL Shader Development](./G04_sdsl_shader_development.md)
- Profile particle performance with Stride's built-in profiler to find your overdraw budget
