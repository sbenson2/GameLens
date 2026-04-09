# G112 — GPUParticles3D & 3D VFX Pipeline

> **Category:** guide · **Engine:** Godot 4.x · **Related:** [G15 Particle Systems (2D)](./G15_particle_systems.md) · [G12 Shaders & Visual Effects](./G12_shaders_and_visual_effects.md) · [G31 Advanced 3D Shaders & Compute](./G31_advanced_3d_shaders_and_compute.md) · [G36 Compositor Effects](./G36_compositor_effects.md)

Complete guide to 3D particle systems in Godot 4.4+. Covers GPUParticles3D node setup, ParticleProcessMaterial configuration, attractors, colliders (SDF, height field), turbulence, sub-emitters, trails, custom particle shaders in 3D space, and performance optimization for shipping titles. All examples use GDScript and C# with 4.4+ APIs.

---

## Table of Contents

1. [GPUParticles3D vs CPUParticles3D — When to Use Each](#1-gpuparticles3d-vs-cpuparticles3d--when-to-use-each)
2. [GPUParticles3D Node Setup](#2-gpuparticles3d-node-setup)
3. [ParticleProcessMaterial for 3D](#3-particleprocessmaterial-for-3d)
4. [Emission Shapes in 3D](#4-emission-shapes-in-3d)
5. [Gravity, Velocity, and Directional Forces](#5-gravity-velocity-and-directional-forces)
6. [Turbulence](#6-turbulence)
7. [Particle Attractors](#7-particle-attractors)
8. [Particle Colliders](#8-particle-colliders)
9. [Sub-Emitters in 3D](#9-sub-emitters-in-3d)
10. [Particle Trails in 3D](#10-particle-trails-in-3d)
11. [Custom 3D Particle Shaders](#11-custom-3d-particle-shaders)
12. [Draw Passes and Mesh Particles](#12-draw-passes-and-mesh-particles)
13. [VFX Recipes — Common 3D Effects](#13-vfx-recipes--common-3d-effects)
14. [Performance Optimization](#14-performance-optimization)
15. [Common Mistakes](#15-common-mistakes)

---

## 1. GPUParticles3D vs CPUParticles3D — When to Use Each

| Criteria | GPUParticles3D | CPUParticles3D |
|----------|---------------|----------------|
| Particle count | 10,000+ easily | <1,000 practical |
| Custom shaders | Full support | No |
| Attractors / colliders | Yes | No |
| Sub-emitters | Yes | No |
| Trails | Yes | No |
| Turbulence | Yes | No |
| Per-particle gameplay reads | No (GPU-side) | Yes (CPU-side) |
| Mobile compatibility | Forward+ / Mobile renderer | All renderers |
| Determinism | Non-deterministic | Deterministic |

**Rule of thumb:** Use GPUParticles3D for visual effects (fire, smoke, sparks, magic). Use CPUParticles3D when you need per-particle logic from GDScript or need the Compatibility renderer.

---

## 2. GPUParticles3D Node Setup

### GDScript

```gdscript
func create_fire_emitter() -> GPUParticles3D:
    var particles := GPUParticles3D.new()
    particles.amount = 200
    particles.lifetime = 1.5
    particles.one_shot = false
    particles.explosiveness = 0.0  # Steady stream (0.0) vs burst (1.0)
    particles.randomness = 0.2
    particles.fixed_fps = 60  # Lock simulation rate for consistency
    particles.interpolate = true  # Smooth between fixed steps
    particles.visibility_aabb = AABB(Vector3(-2, -1, -2), Vector3(4, 6, 4))

    var material := ParticleProcessMaterial.new()
    particles.process_material = material

    # Draw pass — what each particle looks like
    var mesh := QuadMesh.new()
    mesh.size = Vector2(0.3, 0.3)
    particles.draw_pass_1 = mesh

    # Billboard so quads always face the camera
    var mat := StandardMaterial3D.new()
    mat.billboard_mode = BaseMaterial3D.BILLBOARD_ENABLED
    mat.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
    mesh.material = mat

    return particles
```

### C#

```csharp
public GpuParticles3D CreateFireEmitter()
{
    var particles = new GpuParticles3D();
    particles.Amount = 200;
    particles.Lifetime = 1.5f;
    particles.OneShot = false;
    particles.Explosiveness = 0.0f;
    particles.Randomness = 0.2f;
    particles.FixedFps = 60;
    particles.Interpolate = true;
    particles.VisibilityAabb = new Aabb(new Vector3(-2, -1, -2), new Vector3(4, 6, 4));

    var material = new ParticleProcessMaterial();
    particles.ProcessMaterial = material;

    var mesh = new QuadMesh();
    mesh.Size = new Vector2(0.3f, 0.3f);
    particles.DrawPass1 = mesh;

    var mat = new StandardMaterial3D();
    mat.BillboardMode = BaseMaterial3D.BillboardModeEnum.Enabled;
    mat.Transparency = BaseMaterial3D.TransparencyEnum.Alpha;
    mesh.Material = mat;

    return particles;
}
```

### Key Properties

- **`visibility_aabb`** — The engine culls the entire particle system when this AABB leaves the camera frustum. If your AABB is too small, particles will pop in/out. If it's too large, the system renders even when off-screen. Size it to encompass the maximum particle spread.
- **`fixed_fps`** — Locks the simulation update rate. Set to 60 for consistent behavior across hardware. Set to 0 to match the rendering framerate (variable).
- **`interpolate`** — Smooths particle positions between fixed simulation steps. Always enable when using `fixed_fps`.

---

## 3. ParticleProcessMaterial for 3D

ParticleProcessMaterial controls how particles behave after emission. Key 3D-specific properties:

### GDScript

```gdscript
func configure_fire_material(mat: ParticleProcessMaterial) -> void:
    # Direction — base velocity direction
    mat.direction = Vector3(0, 1, 0)  # Upward
    mat.spread = 15.0  # Cone spread in degrees

    # Velocity
    mat.initial_velocity_min = 2.0
    mat.initial_velocity_max = 4.0

    # Gravity — 3D vector, not just downward
    mat.gravity = Vector3(0, -0.5, 0)  # Slight downward pull

    # Size over lifetime
    mat.scale_min = 0.8
    mat.scale_max = 1.2
    var scale_curve := CurveTexture.new()
    var curve := Curve.new()
    curve.add_point(Vector2(0.0, 0.3))
    curve.add_point(Vector2(0.3, 1.0))
    curve.add_point(Vector2(1.0, 0.0))
    scale_curve.curve = curve
    mat.scale_curve = scale_curve

    # Color ramp (fire: yellow → orange → red → transparent)
    var gradient := GradientTexture1D.new()
    var grad := Gradient.new()
    grad.set_color(0, Color(1.0, 0.9, 0.3, 1.0))
    grad.add_point(0.4, Color(1.0, 0.5, 0.1, 0.9))
    grad.add_point(0.7, Color(0.8, 0.2, 0.0, 0.5))
    grad.set_color(1, Color(0.3, 0.1, 0.0, 0.0))
    gradient.gradient = grad
    mat.color_ramp = gradient
```

### C#

```csharp
public void ConfigureFireMaterial(ParticleProcessMaterial mat)
{
    mat.Direction = new Vector3(0, 1, 0);
    mat.Spread = 15.0f;
    mat.InitialVelocityMin = 2.0f;
    mat.InitialVelocityMax = 4.0f;
    mat.Gravity = new Vector3(0, -0.5f, 0);
    mat.ScaleMin = 0.8f;
    mat.ScaleMax = 1.2f;
}
```

---

## 4. Emission Shapes in 3D

3D emission shapes determine where particles spawn in world space.

| Shape | Use Case |
|-------|----------|
| `EMISSION_SHAPE_POINT` | Single origin (sparks, magic cast point) |
| `EMISSION_SHAPE_SPHERE` | Omnidirectional area (explosions, ambient dust) |
| `EMISSION_SHAPE_SPHERE_SURFACE` | Hollow sphere (force field edges) |
| `EMISSION_SHAPE_BOX` | Rectangular volume (rain, snow over an area) |
| `EMISSION_SHAPE_RING` | Torus shape (portal effects, ground impacts) |

```gdscript
# Sphere emission — explosion
mat.emission_shape = ParticleProcessMaterial.EMISSION_SHAPE_SPHERE
mat.emission_sphere_radius = 0.5

# Ring emission — ground impact circle
mat.emission_shape = ParticleProcessMaterial.EMISSION_SHAPE_RING
mat.emission_ring_radius = 2.0
mat.emission_ring_inner_radius = 1.8
mat.emission_ring_height = 0.1
mat.emission_ring_axis = Vector3(0, 1, 0)  # Ring lies flat on XZ plane
```

---

## 5. Gravity, Velocity, and Directional Forces

In 3D, gravity is a full `Vector3`, enabling wind, suction, and directional drift:

```gdscript
# Rising smoke with wind
mat.gravity = Vector3(1.5, -0.2, 0.0)  # Wind pushes +X, slight upward (negative gravity = upward)

# Radial velocity — particles fly outward from center
mat.radial_velocity_min = 3.0
mat.radial_velocity_max = 5.0

# Orbit velocity — particles spiral around the Y axis
mat.orbit_velocity_min = 0.5
mat.orbit_velocity_max = 1.0

# Damping — slow particles over lifetime (0 = no damping)
mat.damping_min = 1.0
mat.damping_max = 3.0
```

---

## 6. Turbulence

Turbulence applies 3D noise-based displacement, making particles move organically. Available since Godot 4.0 on GPUParticles3D.

```gdscript
mat.turbulence_enabled = true
mat.turbulence_noise_strength = 2.0  # Displacement intensity
mat.turbulence_noise_scale = 1.5     # Noise frequency (smaller = larger swirls)
mat.turbulence_noise_speed_random = 0.5

# Control how much turbulence affects each particle
mat.turbulence_influence_min = 0.1
mat.turbulence_influence_max = 0.6

# Vary turbulence over particle lifetime using a CurveTexture
var influence_curve := CurveTexture.new()
var c := Curve.new()
c.add_point(Vector2(0.0, 0.0))   # No turbulence at birth
c.add_point(Vector2(0.3, 1.0))   # Full turbulence mid-life
c.add_point(Vector2(1.0, 0.5))   # Fade slightly at death
influence_curve.curve = c
mat.turbulence_influence_over_life = influence_curve
```

**Performance note:** Turbulence evaluates 3D noise per particle per frame. On mobile, keep particle counts under 500 when turbulence is enabled.

---

## 7. Particle Attractors

Attractors pull (or push) particles toward a point in 3D space. They work across all GPUParticles3D systems — one attractor can affect multiple emitters.

**Requirement:** Set `attractor_interaction_enabled = true` on the ParticleProcessMaterial.

### Attractor Types

| Node | Shape | Use Case |
|------|-------|----------|
| `GPUParticlesAttractorSphere3D` | Sphere | Black holes, suction points |
| `GPUParticlesAttractorBox3D` | Box | Wind tunnels, conveyor belts |
| `GPUParticlesAttractorVectorField3D` | 3D texture | Complex flow (tornado, vortex) |

### GDScript

```gdscript
func create_suction_point(pos: Vector3) -> GPUParticlesAttractorSphere3D:
    var attractor := GPUParticlesAttractorSphere3D.new()
    attractor.position = pos
    attractor.radius = 5.0
    attractor.strength = 3.0          # Positive = attract, negative = repel
    attractor.attenuation = 1.0       # Falloff (1.0 = linear, 2.0 = quadratic)
    attractor.directionality = 0.0    # 0 = toward center, 1 = along attractor's -Z
    attractor.cull_mask = 0xFFFFFFFF  # Which particle layers are affected
    return attractor
```

### C#

```csharp
public GpuParticlesAttractorSphere3D CreateSuctionPoint(Vector3 pos)
{
    var attractor = new GpuParticlesAttractorSphere3D();
    attractor.Position = pos;
    attractor.Radius = 5.0f;
    attractor.Strength = 3.0f;
    attractor.Attenuation = 1.0f;
    attractor.Directionality = 0.0f;
    attractor.CullMask = 0xFFFFFFFF;
    return attractor;
}
```

### Vector Field Attractors

`GPUParticlesAttractorVectorField3D` uses a 3D texture where each texel's RGB encodes a force direction. Create vector fields in external tools (Houdini, EmberGen, VectorayGen) and import as `.exr` or `.bmp` sequences.

```gdscript
var vf_attractor := GPUParticlesAttractorVectorField3D.new()
vf_attractor.texture = preload("res://vfx/tornado_field.exr")
vf_attractor.size = Vector3(10, 20, 10)
vf_attractor.strength = 5.0
```

---

## 8. Particle Colliders

Colliders make particles bounce off or slide along surfaces. Unlike physics bodies, these only affect GPU particles.

### Collider Types

| Node | Best For |
|------|----------|
| `GPUParticlesCollisionSphere3D` | Simple round obstacles |
| `GPUParticlesCollisionBox3D` | Floors, walls, platforms |
| `GPUParticlesCollisionSDF3D` | Complex indoor geometry (signed distance field) |
| `GPUParticlesCollisionHeightField3D` | Outdoor terrain (real-time height field) |

### SDF Collider — Indoor Scenes

The SDF collider bakes scene geometry into a 3D signed distance field texture. Particles then sample this texture to detect collisions.

```gdscript
# Add as a child of the room geometry
var sdf := GPUParticlesCollisionSDF3D.new()
sdf.size = Vector3(20, 10, 20)          # Volume that is baked
sdf.resolution = GPUParticlesCollisionSDF3D.RESOLUTION_64  # 64³ grid
# Call sdf.bake() in the editor or at runtime to generate the field
add_child(sdf)
```

Available resolutions: `RESOLUTION_16`, `RESOLUTION_32`, `RESOLUTION_64`, `RESOLUTION_128`, `RESOLUTION_256`. Higher resolution = more accurate collisions, more VRAM.

### Height Field Collider — Outdoor Terrain

Captures a top-down height map in real-time. Efficient for large terrain, but only captures the top surface.

```gdscript
var hf := GPUParticlesCollisionHeightField3D.new()
hf.size = Vector3(100, 50, 100)
hf.resolution = GPUParticlesCollisionHeightField3D.RESOLUTION_512
hf.update_mode = GPUParticlesCollisionHeightField3D.UPDATE_MODE_WHEN_MOVED
hf.follow_camera_enabled = true  # Re-centers on active camera
add_child(hf)
```

### Collision Material Properties

```gdscript
# On the ParticleProcessMaterial:
mat.collision_mode = ParticleProcessMaterial.COLLISION_RIGID  # RIGID or HIDE_ON_CONTACT
mat.collision_bounce = 0.3    # 0 = no bounce, 1 = full bounce
mat.collision_friction = 0.5  # 0 = ice, 1 = sticky
mat.collision_use_scale = true  # Use particle scale for collision radius
```

---

## 9. Sub-Emitters in 3D

Sub-emitters spawn a secondary particle system when a parent particle meets a condition. Only available on GPUParticles3D.

```gdscript
# Parent emitter (firework trail)
var parent := GPUParticles3D.new()
parent.amount = 20
parent.lifetime = 2.0

var parent_mat := ParticleProcessMaterial.new()
parent_mat.direction = Vector3(0, 1, 0)
parent_mat.initial_velocity_min = 8.0
parent_mat.initial_velocity_max = 12.0
parent_mat.gravity = Vector3(0, 9.8, 0)

# Sub-emitter (explosion burst when parent particle dies)
parent_mat.sub_emitter_mode = ParticleProcessMaterial.SUB_EMITTER_AT_END
parent_mat.sub_emitter_frequency = 1.0
parent_mat.sub_emitter_amount_at_end = 30
parent_mat.sub_emitter_keep_velocity = false

# Assign child GPUParticles3D node as sub-emitter
var burst := GPUParticles3D.new()
burst.amount = 30
parent.add_child(burst)
parent.sub_emitter = burst.get_path()
parent.process_material = parent_mat
```

**Sub-emitter modes:**
- `SUB_EMITTER_DISABLED` — No sub-emission
- `SUB_EMITTER_CONSTANT` — Continuously while parent is alive
- `SUB_EMITTER_AT_END` — When parent particle dies
- `SUB_EMITTER_AT_COLLISION` — When parent particle collides

---

## 10. Particle Trails in 3D

Trails render a ribbon or tube behind each moving particle. Uses the `trail_*` properties on GPUParticles3D.

```gdscript
var particles := GPUParticles3D.new()
particles.amount = 50
particles.lifetime = 1.0
particles.trail_enabled = true
particles.trail_lifetime = 0.4  # Trail duration in seconds

# Trail mesh — use a RibbonTrailMesh for flat ribbons or TubeTrailMesh for round trails
var trail_mesh := RibbonTrailMesh.new()
trail_mesh.size = 0.2
trail_mesh.sections = 4          # Subdivisions along the trail
trail_mesh.section_length = 0.1  # Length per section
trail_mesh.section_segments = 3  # Cross-section detail
particles.draw_pass_1 = trail_mesh
```

```csharp
var particles = new GpuParticles3D();
particles.Amount = 50;
particles.Lifetime = 1.0f;
particles.TrailEnabled = true;
particles.TrailLifetime = 0.4f;

var trailMesh = new RibbonTrailMesh();
trailMesh.Size = 0.2f;
trailMesh.Sections = 4;
trailMesh.SectionLength = 0.1f;
trailMesh.SectionSegments = 3;
particles.DrawPass1 = trailMesh;
```

---

## 11. Custom 3D Particle Shaders

For effects beyond what ParticleProcessMaterial offers, write a custom particle shader. Assign a `ShaderMaterial` as the `process_material`.

```glsl
shader_type particles;

uniform float spiral_speed : hint_range(0.0, 10.0) = 3.0;
uniform float spiral_radius : hint_range(0.0, 5.0) = 1.0;
uniform float rise_speed : hint_range(0.0, 10.0) = 2.0;

void start() {
    // Initialize particle at ring position
    float angle = float(INDEX) / float(AMOUNT) * TAU;
    TRANSFORM[3].x = cos(angle) * spiral_radius;
    TRANSFORM[3].z = sin(angle) * spiral_radius;
    TRANSFORM[3].y = 0.0;
    VELOCITY = vec3(0.0, rise_speed, 0.0);
    COLOR = vec4(1.0, 0.8, 0.3, 1.0);
    CUSTOM.x = angle;  // Store initial angle for spiral
}

void process() {
    // Spiral upward
    float current_angle = CUSTOM.x + TIME * spiral_speed;
    float life_frac = CUSTOM.y;  // Normalized lifetime (0-1)
    TRANSFORM[3].x = cos(current_angle) * spiral_radius * (1.0 - life_frac);
    TRANSFORM[3].z = sin(current_angle) * spiral_radius * (1.0 - life_frac);

    // Fade out
    COLOR.a = 1.0 - life_frac;
}
```

### Built-in Particle Shader Variables

| Variable | Type | Description |
|----------|------|-------------|
| `COLOR` | vec4 | Particle color |
| `VELOCITY` | vec3 | Current velocity |
| `TRANSFORM` | mat4 | Particle transform (column 3 = position) |
| `CUSTOM` | vec4 | User data persisted across frames |
| `INDEX` | uint | Particle index (0 to AMOUNT-1) |
| `AMOUNT` | uint | Total particles in the system |
| `LIFETIME` | float | Total particle lifetime in seconds |
| `DELTA` | float | Frame delta time |
| `TIME` | float | Global shader time |
| `NUMBER` | uint | Unique particle emission number |
| `EMISSION_TRANSFORM` | mat4 | Emitter's global transform |
| `ACTIVE` | bool | Set to false to kill the particle |
| `RESTART_POSITION` | bool | Set true in `start()` to accept initial TRANSFORM |
| `RESTART_VELOCITY` | bool | Set true in `start()` to accept initial VELOCITY |

---

## 12. Draw Passes and Mesh Particles

GPUParticles3D supports up to 4 draw passes, rendering different meshes for each particle. This is useful for multi-part effects (e.g., a core glow + outer sparks).

```gdscript
particles.draw_pass_1 = preload("res://vfx/meshes/flame_core.tres")
particles.draw_pass_2 = preload("res://vfx/meshes/ember_spark.tres")
# Each pass renders the same particle data with a different mesh
```

For **mesh particles** (rendering actual 3D meshes instead of billboarded quads), assign a scene mesh:

```gdscript
# Debris chunks
var box := BoxMesh.new()
box.size = Vector3(0.1, 0.1, 0.1)
particles.draw_pass_1 = box

# Particles will rotate in 3D — disable billboard on the material
var mat := StandardMaterial3D.new()
mat.billboard_mode = BaseMaterial3D.BILLBOARD_DISABLED
box.material = mat

# Enable angular velocity in the process material for spinning debris
var pmat: ParticleProcessMaterial = particles.process_material
pmat.angular_velocity_min = -360.0
pmat.angular_velocity_max = 360.0
```

---

## 13. VFX Recipes — Common 3D Effects

### Campfire

```gdscript
# Fire: upward cone, warm gradient, turbulence
fire_mat.direction = Vector3(0, 1, 0)
fire_mat.spread = 20.0
fire_mat.initial_velocity_min = 1.0
fire_mat.initial_velocity_max = 2.5
fire_mat.gravity = Vector3(0, 0, 0)
fire_mat.turbulence_enabled = true
fire_mat.turbulence_noise_strength = 0.8
fire_mat.emission_shape = ParticleProcessMaterial.EMISSION_SHAPE_SPHERE
fire_mat.emission_sphere_radius = 0.3

# Smoke: separate GPUParticles3D, slower, wider spread
smoke_mat.direction = Vector3(0, 1, 0)
smoke_mat.spread = 30.0
smoke_mat.initial_velocity_min = 0.5
smoke_mat.initial_velocity_max = 1.0
smoke_mat.gravity = Vector3(0.3, -0.1, 0)  # Light wind
smoke_mat.turbulence_enabled = true
smoke_mat.turbulence_noise_strength = 1.5
smoke_mat.damping_min = 0.5
smoke_mat.damping_max = 1.5
```

### Rain with Splash Sub-Emitter

```gdscript
# Rain drops
rain_particles.amount = 2000
rain_mat.direction = Vector3(0, -1, 0)
rain_mat.spread = 3.0
rain_mat.initial_velocity_min = 15.0
rain_mat.initial_velocity_max = 20.0
rain_mat.emission_shape = ParticleProcessMaterial.EMISSION_SHAPE_BOX
rain_mat.emission_box_extents = Vector3(25, 0, 25)
rain_mat.gravity = Vector3(0, 9.8, 0)

# Splash on collision
rain_mat.sub_emitter_mode = ParticleProcessMaterial.SUB_EMITTER_AT_COLLISION
rain_mat.sub_emitter_amount_at_collision = 3
```

### Magic Vortex

```gdscript
vortex_mat.emission_shape = ParticleProcessMaterial.EMISSION_SHAPE_RING
vortex_mat.emission_ring_radius = 3.0
vortex_mat.emission_ring_inner_radius = 2.8
vortex_mat.emission_ring_height = 0.1
vortex_mat.emission_ring_axis = Vector3(0, 1, 0)
vortex_mat.orbit_velocity_min = 2.0
vortex_mat.orbit_velocity_max = 3.0
vortex_mat.radial_velocity_min = -0.5  # Pull inward
vortex_mat.radial_velocity_max = -0.3
vortex_mat.gravity = Vector3(0, -2.0, 0)  # Rise upward (upward in particle space)
```

---

## 14. Performance Optimization

### Budget Guidelines

| Platform | Max particles (total scene) | Recommended per system |
|----------|---------------------------|----------------------|
| Desktop (Forward+) | 100,000+ | 5,000–10,000 |
| Desktop (Mobile renderer) | 20,000 | 1,000–3,000 |
| Mobile (Android/iOS) | 5,000 | 200–500 |
| Web (WebGL2) | 10,000 | 500–1,000 |

### Optimization Techniques

1. **Set `visibility_aabb` tightly** — prevents GPU work when off-screen. Use the editor gizmo to visualize it.
2. **Use `fixed_fps = 30`** for ambient/background effects — halves simulation cost.
3. **Limit draw passes** — each pass is a separate draw call. Use 1 when possible.
4. **SDF collider resolution** — use `RESOLUTION_32` or `RESOLUTION_64` for most indoor scenes. `RESOLUTION_256` is rarely needed.
5. **Height field `UPDATE_MODE_WHEN_MOVED`** — avoids re-rendering every frame.
6. **Disable turbulence on mobile** — the 3D noise evaluation is expensive.
7. **LOD with `amount_ratio`** — reduce visible particles at distance:

```gdscript
func _process(_delta: float) -> void:
    var cam := get_viewport().get_camera_3d()
    if cam:
        var dist := global_position.distance_to(cam.global_position)
        particles.amount_ratio = clampf(1.0 - (dist - 20.0) / 50.0, 0.1, 1.0)
```

---

## 15. Common Mistakes

| Mistake | Fix |
|---------|-----|
| Particles disappear when moving camera | `visibility_aabb` is too small — expand it to cover full particle spread |
| Attractors have no effect | Enable `attractor_interaction_enabled` on the ParticleProcessMaterial |
| Colliders don't work | Set `collision_mode` to `COLLISION_RIGID` on the material, not `COLLISION_DISABLED` |
| Trails look jagged | Increase `sections` and `section_segments` on the trail mesh |
| Sub-emitters don't fire | Ensure the sub-emitter GPUParticles3D is a child of the parent and `sub_emitter` path is set |
| Particles jitter at low FPS | Set `fixed_fps` and enable `interpolate` |
| SDF collider misses thin walls | Increase SDF resolution or thicken walls (SDF minimum feature size = volume / resolution) |
