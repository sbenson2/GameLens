# G15 — Particle Systems & Visual Effects

> **Engine:** Godot 4.4+ | **Language:** Typed GDScript  
> **Scope:** GPUParticles2D, CPUParticles2D, particle materials, sub-emitters, trails, custom shaders, common VFX recipes, pooling, performance  
> **Prerequisites:** [G1 Scene Composition](./G1_scene_composition.md), [G3 Signal Architecture](./G3_signal_architecture.md), [G12 Shaders](./G12_shaders_and_visual_effects.md)

---

## Table of Contents

1. [Particle Pipeline Overview](#1-particle-pipeline-overview)
2. [GPU vs CPU Particles — Decision Guide](#2-gpu-vs-cpu-particles--decision-guide)
3. [GPUParticles2D Fundamentals](#3-gpuparticles2d-fundamentals)
4. [ParticleProcessMaterial Deep Dive](#4-particleprocessmaterial-deep-dive)
5. [CPUParticles2D](#5-cpuparticles2d)
6. [Emission Shapes](#6-emission-shapes)
7. [Particle Curves & Gradients](#7-particle-curves--gradients)
8. [Sub-Emitters](#8-sub-emitters)
9. [Particle Trails](#9-particle-trails)
10. [Custom Particle Shaders](#10-custom-particle-shaders)
11. [One-Shot Burst Effects](#11-one-shot-burst-effects)
12. [Continuous Ambient Effects](#12-continuous-ambient-effects)
13. [Physics-Influenced Particles](#13-physics-influenced-particles)
14. [VFX Recipes — Common Game Effects](#14-vfx-recipes--common-game-effects)
15. [Particle Pooling & Lifecycle Management](#15-particle-pooling--lifecycle-management)
16. [Screen-Space Effects](#16-screen-space-effects)
17. [Particle Interaction with Gameplay](#17-particle-interaction-with-gameplay)
18. [Performance Optimization](#18-performance-optimization)
19. [Common Mistakes & Troubleshooting](#19-common-mistakes--troubleshooting)
20. [Tuning Reference Tables](#20-tuning-reference-tables)

---

## 1. Particle Pipeline Overview

Godot's particle pipeline processes effects through a clear execution chain:

```
Emitter Configuration
    ↓
Emission Shape → WHERE particles spawn
    ↓
Initial Velocity + Direction → HOW they launch
    ↓
ParticleProcessMaterial / Shader → per-frame UPDATE
(gravity, acceleration, damping, color, scale over lifetime)
    ↓
Rendering (CanvasItemMaterial / draw pass mesh)
    ↓
Lifetime expiry → particle recycled to pool
```

### Key Concepts

| Concept | Description |
|---------|-------------|
| **Amount** | Max live particles at any time (GPU pre-allocates this) |
| **Lifetime** | How long each particle lives (seconds) |
| **Explosiveness** | 0.0 = even emission over lifetime, 1.0 = all at once (burst) |
| **Randomness** | Per-property random range (0.0–1.0) |
| **One Shot** | Emit once then stop (explosions, impacts) |
| **Preprocess** | Simulate N seconds on first frame (avoid "filling up" delay) |
| **Draw Order** | Index (spawn order), Lifetime (oldest first), Reverse Lifetime |

### Execution Order in the Frame

```
_physics_process()          ← game logic, movement
    ↓
Particle simulation step    ← GPU/CPU updates positions, velocities, colors
    ↓
_process()                  ← post-simulation adjustments
    ↓
Rendering                   ← particles drawn with current visual state
```

> **Tip:** Particle simulation happens BETWEEN physics and process. If you move the emitter in `_physics_process`, particles spawn at the new position that same frame.

---

## 2. GPU vs CPU Particles — Decision Guide

```
Need particles?
    ├─ Platform is Web (HTML5)?
    │   └─ YES → CPUParticles2D (GPU particles unreliable on WebGL)
    ├─ Need > 500 particles?
    │   └─ YES → GPUParticles2D
    ├─ Need manual per-particle control?
    │   └─ YES → CPUParticles2D (access particle arrays)
    ├─ Need sub-emitters or trails?
    │   └─ YES → GPUParticles2D (CPU doesn't support these)
    ├─ Need deterministic replay?
    │   └─ YES → CPUParticles2D (seed-based, reproducible)
    └─ Default → GPUParticles2D
```

### Comparison Table

| Feature | GPUParticles2D | CPUParticles2D |
|---------|---------------|----------------|
| **Max practical count** | 10,000+ | ~2,000 |
| **Sub-emitters** | ✅ Yes | ❌ No |
| **Trails** | ✅ Yes | ❌ No |
| **Custom shaders** | ✅ Vertex + fragment | ❌ Material only |
| **Per-particle access** | ❌ No (GPU-side) | ✅ Yes |
| **Deterministic** | ❌ No (GPU floating point) | ✅ Yes (with seed) |
| **Web export** | ⚠️ Unreliable | ✅ Works |
| **Convert between** | ✅ One-click in editor | ✅ One-click in editor |
| **Physics interaction** | Collision hints | Direct position manipulation |
| **Battery impact (mobile)** | Higher | Lower at small counts |
| **Material type** | ParticleProcessMaterial / ShaderMaterial | Built-in properties only |

> **Conversion:** Right-click any GPUParticles2D → "Convert to CPUParticles2D" (and vice versa). Useful for prototyping on GPU then converting for web builds.

---

## 3. GPUParticles2D Fundamentals

### Basic Setup

```gdscript
# Minimal particle emitter scene
# ParticleEmitter.tscn
#   GPUParticles2D
#     └── (ParticleProcessMaterial assigned)

extends GPUParticles2D

func _ready() -> void:
	# Assign material if not set in editor
	if not process_material:
		var mat := ParticleProcessMaterial.new()
		mat.direction = Vector3(0.0, -1.0, 0.0)  # Note: Vector3 even in 2D
		mat.initial_velocity_min = 50.0
		mat.initial_velocity_max = 150.0
		mat.gravity = Vector3(0.0, 98.0, 0.0)
		process_material = mat
	
	amount = 32
	lifetime = 1.5
	emitting = true
```

### Important: Vector3 in 2D Context

ParticleProcessMaterial uses **Vector3** for direction, velocity, and gravity even in 2D mode. The Z axis is ignored during 2D rendering but must be set:

```gdscript
# 2D convention:
# X = horizontal, Y = vertical (positive = DOWN in Godot 2D), Z = ignored
mat.direction = Vector3(0.0, -1.0, 0.0)  # Upward
mat.gravity = Vector3(0.0, 98.0, 0.0)     # Falls down (positive Y = down)
```

### Visibility & Draw Rect

GPUParticles2D uses a **visibility rect** for culling. If particles disappear when the emitter goes off-screen, the rect is too small:

```gdscript
# Set visibility rect to encompass full particle spread
visibility_rect = Rect2(-200, -400, 400, 500)

# Or disable culling entirely (not recommended for performance)
# Set a very large rect instead
```

> **Common mistake:** Leaving the default small visibility rect. Particles vanish when you scroll away because the AABB culls the entire emitter. Always expand the rect to cover the maximum particle spread.

### Draw Passes

Each draw pass renders the particle with a different mesh/texture. Most 2D effects use a single pass:

```gdscript
# Single texture (default)
draw_pass_1 = QuadMesh.new()  # Or leave null for point sprites
texture = preload("res://vfx/spark.png")

# Multi-pass: render same particles with different visuals
# Useful for glow layers
draw_pass_1 = preload("res://vfx/core_mesh.tres")
draw_pass_2 = preload("res://vfx/glow_mesh.tres")
```

---

## 4. ParticleProcessMaterial Deep Dive

ParticleProcessMaterial is the powerhouse — it controls every aspect of particle behavior over their lifetime without writing shader code.

### 4.1 Direction & Spread

```gdscript
var mat := ParticleProcessMaterial.new()

# Direction: base direction vector (normalized internally)
mat.direction = Vector3(0.0, -1.0, 0.0)  # Up

# Spread: cone angle in degrees (0 = laser, 180 = hemisphere, 360 = full sphere)
mat.spread = 45.0  # 45° cone

# Flatness: 0.0 = round cone, 1.0 = flat disc (useful for ground effects)
mat.flatness = 0.0
```

**Spread visualization:**
```
spread = 0°      spread = 45°     spread = 180°
    |                /|\              ___
    |               / | \           /     \
    |              /  |  \         |   |   |
    ↑             /   |   \       |   ↑   |
                 /    ↑    \       \_____/
```

### 4.2 Velocity & Acceleration

```gdscript
# Initial velocity range (units/sec)
mat.initial_velocity_min = 100.0
mat.initial_velocity_max = 200.0

# Gravity (constant acceleration)
mat.gravity = Vector3(0.0, 98.0, 0.0)  # Positive Y = down in 2D

# Linear acceleration (along velocity direction)
mat.linear_accel_min = -50.0  # Negative = decelerate
mat.linear_accel_max = -20.0

# Radial acceleration (away from/toward emitter center)
mat.radial_accel_min = 10.0   # Positive = push away
mat.radial_accel_max = 20.0
# Negative radial = particles spiral inward (implosion, vortex)

# Tangential acceleration (perpendicular to radial, creates spin)
mat.tangential_accel_min = 5.0
mat.tangential_accel_max = 15.0

# Damping (velocity reduction per second, like air resistance)
mat.damping_min = 10.0
mat.damping_max = 30.0
```

### 4.3 Angular Velocity (Spin)

```gdscript
# Rotation speed (degrees/sec)
mat.angular_velocity_min = -180.0
mat.angular_velocity_max = 180.0

# Modulate over lifetime with a curve
var spin_curve := CurveTexture.new()
spin_curve.curve = Curve.new()
spin_curve.curve.add_point(Vector2(0.0, 1.0))  # Full speed at birth
spin_curve.curve.add_point(Vector2(1.0, 0.0))  # Stop at death
mat.angular_velocity_curve = spin_curve
```

### 4.4 Scale Over Lifetime

```gdscript
# Base scale range
mat.scale_min = 0.5
mat.scale_max = 1.5

# Scale curve (0→1 over lifetime)
var scale_curve := CurveTexture.new()
scale_curve.curve = Curve.new()
scale_curve.curve.add_point(Vector2(0.0, 0.0))   # Start invisible
scale_curve.curve.add_point(Vector2(0.1, 1.0))   # Quick grow
scale_curve.curve.add_point(Vector2(0.8, 1.0))   # Hold
scale_curve.curve.add_point(Vector2(1.0, 0.0))   # Shrink to nothing
mat.scale_curve = scale_curve
```

### 4.5 Color Over Lifetime

```gdscript
# Static color
mat.color = Color(1.0, 0.5, 0.0, 1.0)  # Orange

# Color ramp (gradient over lifetime)
var gradient := GradientTexture1D.new()
gradient.gradient = Gradient.new()
gradient.gradient.colors = PackedColorArray([
	Color(1.0, 1.0, 0.8, 1.0),   # White-yellow at birth
	Color(1.0, 0.5, 0.0, 1.0),   # Orange at midlife
	Color(0.3, 0.0, 0.0, 0.5),   # Dark red, fading
	Color(0.1, 0.1, 0.1, 0.0),   # Smoke, invisible
])
gradient.gradient.offsets = PackedFloat32Array([0.0, 0.3, 0.7, 1.0])
mat.color_ramp = gradient
```

### 4.6 Turbulence

Turbulence adds organic noise-based displacement. Essential for natural-looking fire, smoke, and magical effects:

```gdscript
# Enable turbulence
mat.turbulence_enabled = true

# Noise parameters
mat.turbulence_noise_strength = 5.0        # Displacement intensity
mat.turbulence_noise_scale = 2.0           # Noise frequency (higher = more chaotic)
mat.turbulence_noise_speed = Vector3(0.5, 0.3, 0.0)  # Noise scrolling speed

# Influence blend (0.0 = turbulence ignored, 1.0 = fully turbulent)
mat.turbulence_influence_min = 0.3
mat.turbulence_influence_max = 0.7

# Over-lifetime modulation (optional)
# Use turbulence_influence_over_life CurveTexture to increase turbulence as particles age
```

> **Tip:** Turbulence is GPU-only. It's the single biggest visual upgrade for fire/smoke effects — enable it before adding more particles.

### 4.7 Attractor Interaction

```gdscript
# Enable/disable attractor response per emitter
mat.attractor_interaction_enabled = true
```

Attractors are separate nodes (GPUParticlesAttractor2D is not available in 2D — use 3D attractors with 2D particles in a 3D sub-viewport, or simulate with velocity adjustments). For 2D, custom attractors via shader are more practical — see [Section 10](#10-custom-particle-shaders).

---

## 5. CPUParticles2D

CPUParticles2D mirrors most ParticleProcessMaterial properties as direct node properties. The key advantage: per-particle access.

### Basic Setup

```gdscript
extends CPUParticles2D

func _ready() -> void:
	amount = 64
	lifetime = 2.0
	direction = Vector2(0.0, -1.0)  # Note: Vector2 in CPU mode!
	initial_velocity_min = 80.0
	initial_velocity_max = 160.0
	gravity = Vector2(0.0, 98.0)
	spread = 30.0
	emitting = true
```

### Per-Particle Access (Unique to CPU)

```gdscript
extends CPUParticles2D

## Manually set colors based on game state
func set_team_color(team: int) -> void:
	var colors: PackedColorArray = []
	for i: int in range(amount):
		match team:
			0: colors.append(Color.RED)
			1: colors.append(Color.BLUE)
			_: colors.append(Color.WHITE)
	# CPUParticles2D doesn't expose per-particle color arrays directly,
	# but you can manipulate the color_ramp gradient or use a custom solution
```

### Deterministic Particles (Replays, Netcode)

```gdscript
extends CPUParticles2D

## Seed-based deterministic spawning
func spawn_deterministic(effect_seed: int) -> void:
	randomness_ratio = 0.0  # Disable internal randomness
	seed = effect_seed       # Fixed seed → same output every time
	restart()
	emitting = true
```

> **Use case:** Rollback netcode requires identical VFX on all clients. CPU particles with a shared seed produce identical results.

---

## 6. Emission Shapes

### Point (Default)

All particles spawn at the emitter's origin:

```gdscript
mat.emission_shape = ParticleProcessMaterial.EMISSION_SHAPE_POINT
```

### Sphere / Sphere Surface

```gdscript
# Fill sphere (particles spawn anywhere inside)
mat.emission_shape = ParticleProcessMaterial.EMISSION_SHAPE_SPHERE
mat.emission_sphere_radius = 50.0

# Surface only (hollow sphere — ring in 2D)
mat.emission_shape = ParticleProcessMaterial.EMISSION_SHAPE_SPHERE_SURFACE
mat.emission_sphere_radius = 50.0
```

### Box

```gdscript
mat.emission_shape = ParticleProcessMaterial.EMISSION_SHAPE_BOX
mat.emission_box_extents = Vector3(100.0, 20.0, 0.0)  # Wide, thin strip
```

### Ring (2D Circle / Donut)

```gdscript
mat.emission_shape = ParticleProcessMaterial.EMISSION_SHAPE_RING
mat.emission_ring_radius = 80.0          # Outer radius
mat.emission_ring_inner_radius = 60.0    # Inner radius (donut hole)
mat.emission_ring_height = 0.0           # 0 for 2D ring
mat.emission_ring_axis = Vector3(0.0, 0.0, 1.0)  # Z-axis for 2D plane
```

> **Use case:** Magical circles, shield effects, portal rings.

### Points (Custom Shape via Texture)

Emit from specific positions defined by a texture:

```gdscript
# Emit from points along a custom shape
mat.emission_shape = ParticleProcessMaterial.EMISSION_SHAPE_POINTS

# Generate emission points from a Path2D
func generate_emission_points(path: Path2D, point_count: int) -> void:
	var positions: PackedVector2Array = []
	var curve: Curve2D = path.curve
	var length: float = curve.get_baked_length()
	
	for i: int in range(point_count):
		var offset: float = (float(i) / float(point_count)) * length
		var point: Vector2 = curve.sample_baked(offset)
		positions.append(point)
	
	# Create texture from points
	var tex := PointsTexture.new()
	# ... set points on ParticleProcessMaterial
```

### Directed Points (Position + Normal)

Particles spawn with velocity along the normal direction of each point. Useful for effects that follow surface contours.

---

## 7. Particle Curves & Gradients

Curves and gradients are the primary tools for making particles feel alive. Every property that varies over lifetime uses a CurveTexture or GradientTexture1D.

### Curve Patterns

```gdscript
## Create common curve shapes for particle properties
class_name VFXCurves

## Fast start, slow end (good for velocity damping)
static func ease_out() -> CurveTexture:
	var tex := CurveTexture.new()
	tex.curve = Curve.new()
	tex.curve.add_point(Vector2(0.0, 1.0), 0.0, -2.0)
	tex.curve.add_point(Vector2(1.0, 0.0))
	return tex

## Slow start, fast end (good for gravity pull-in)
static func ease_in() -> CurveTexture:
	var tex := CurveTexture.new()
	tex.curve = Curve.new()
	tex.curve.add_point(Vector2(0.0, 0.0))
	tex.curve.add_point(Vector2(1.0, 1.0), 2.0, 0.0)
	return tex

## Pop: quick grow then shrink (good for scale)
static func pop() -> CurveTexture:
	var tex := CurveTexture.new()
	tex.curve = Curve.new()
	tex.curve.add_point(Vector2(0.0, 0.0))
	tex.curve.add_point(Vector2(0.15, 1.2))  # Overshoot
	tex.curve.add_point(Vector2(0.3, 1.0))   # Settle
	tex.curve.add_point(Vector2(0.8, 1.0))   # Hold
	tex.curve.add_point(Vector2(1.0, 0.0))   # Vanish
	return tex

## Flicker (good for fire alpha)
static func flicker() -> CurveTexture:
	var tex := CurveTexture.new()
	tex.curve = Curve.new()
	tex.curve.add_point(Vector2(0.0, 0.8))
	tex.curve.add_point(Vector2(0.2, 1.0))
	tex.curve.add_point(Vector2(0.4, 0.6))
	tex.curve.add_point(Vector2(0.6, 0.9))
	tex.curve.add_point(Vector2(0.8, 0.4))
	tex.curve.add_point(Vector2(1.0, 0.0))
	return tex

## Pulse: oscillates then fades (good for glow)
static func pulse() -> CurveTexture:
	var tex := CurveTexture.new()
	tex.curve = Curve.new()
	tex.curve.add_point(Vector2(0.0, 1.0))
	tex.curve.add_point(Vector2(0.25, 0.5))
	tex.curve.add_point(Vector2(0.5, 1.0))
	tex.curve.add_point(Vector2(0.75, 0.3))
	tex.curve.add_point(Vector2(1.0, 0.0))
	return tex
```

### Gradient Patterns

```gdscript
## Common color gradients for particle effects
class_name VFXGradients

## Fire: white-yellow → orange → red → smoke
static func fire() -> GradientTexture1D:
	var tex := GradientTexture1D.new()
	tex.gradient = Gradient.new()
	tex.gradient.offsets = PackedFloat32Array([0.0, 0.15, 0.4, 0.7, 1.0])
	tex.gradient.colors = PackedColorArray([
		Color(1.0, 1.0, 0.9, 1.0),   # Hot white
		Color(1.0, 0.8, 0.2, 1.0),   # Yellow
		Color(1.0, 0.4, 0.0, 0.9),   # Orange
		Color(0.5, 0.1, 0.0, 0.5),   # Dark red
		Color(0.2, 0.2, 0.2, 0.0),   # Smoke, invisible
	])
	return tex

## Electric: cyan → white → blue → fade
static func electric() -> GradientTexture1D:
	var tex := GradientTexture1D.new()
	tex.gradient = Gradient.new()
	tex.gradient.offsets = PackedFloat32Array([0.0, 0.1, 0.4, 1.0])
	tex.gradient.colors = PackedColorArray([
		Color(0.8, 1.0, 1.0, 1.0),   # Bright cyan
		Color(1.0, 1.0, 1.0, 1.0),   # White flash
		Color(0.3, 0.5, 1.0, 0.8),   # Blue
		Color(0.1, 0.2, 0.5, 0.0),   # Dark blue, fade
	])
	return tex

## Heal: green → yellow-green → white → fade
static func heal() -> GradientTexture1D:
	var tex := GradientTexture1D.new()
	tex.gradient = Gradient.new()
	tex.gradient.offsets = PackedFloat32Array([0.0, 0.3, 0.6, 1.0])
	tex.gradient.colors = PackedColorArray([
		Color(0.5, 1.0, 0.5, 1.0),   # Bright green
		Color(0.8, 1.0, 0.3, 0.9),   # Yellow-green
		Color(1.0, 1.0, 1.0, 0.6),   # White sparkle
		Color(0.5, 1.0, 0.5, 0.0),   # Fade
	])
	return tex

## Poison: purple → green → dark → fade
static func poison() -> GradientTexture1D:
	var tex := GradientTexture1D.new()
	tex.gradient = Gradient.new()
	tex.gradient.offsets = PackedFloat32Array([0.0, 0.3, 0.7, 1.0])
	tex.gradient.colors = PackedColorArray([
		Color(0.6, 0.0, 0.8, 1.0),   # Purple
		Color(0.2, 0.8, 0.0, 0.8),   # Toxic green
		Color(0.1, 0.3, 0.0, 0.4),   # Dark
		Color(0.0, 0.1, 0.0, 0.0),   # Gone
	])
	return tex
```

---

## 8. Sub-Emitters

Sub-emitters spawn new particles when a parent particle reaches a lifecycle event. **GPU-only feature.**

### Setup

```gdscript
extends GPUParticles2D

@export var spark_material: ParticleProcessMaterial
@export var smoke_trail_material: ParticleProcessMaterial

func _ready() -> void:
	# Main firework particle
	var main_mat := ParticleProcessMaterial.new()
	main_mat.direction = Vector3(0.0, -1.0, 0.0)
	main_mat.initial_velocity_min = 200.0
	main_mat.initial_velocity_max = 300.0
	main_mat.gravity = Vector3(0.0, 200.0, 0.0)
	
	# Sub-emitter triggers when parent particle dies
	main_mat.sub_emitter_mode = ParticleProcessMaterial.SUB_EMITTER_AT_END
	# Amount multiplier: each dying particle spawns this many sub-particles
	main_mat.sub_emitter_amount_at_end = 16
	
	process_material = main_mat
	
	# The sub-emitter is another GPUParticles2D node, set as child
	# and referenced via the sub_emitter property
	var sub := GPUParticles2D.new()
	sub.process_material = spark_material
	sub.amount = 128  # Max concurrent sub-particles
	sub.emitting = false  # Controlled by parent
	add_child(sub)
	sub_emitter = sub.get_path()
```

### Sub-Emitter Modes

| Mode | Trigger | Use Case |
|------|---------|----------|
| `SUB_EMITTER_DISABLED` | Never | Default |
| `SUB_EMITTER_CONSTANT` | Every frame | Trails, continuous sparks |
| `SUB_EMITTER_AT_END` | Particle death | Explosions, fireworks, shatter |
| `SUB_EMITTER_AT_COLLISION` | Collision event | Spark on impact, splash |

### Firework Example (Two-Stage)

```gdscript
## Firework: launch shell → explode into colored sparks
class_name Firework
extends Node2D

@onready var launch: GPUParticles2D = $Launch
@onready var burst: GPUParticles2D = $Burst

func fire(color: Color) -> void:
	# Configure burst color
	var burst_mat: ParticleProcessMaterial = burst.process_material
	burst_mat.color = color
	
	# Launch is one-shot, burst is sub-emitter
	launch.sub_emitter = burst.get_path()
	launch.restart()
	launch.emitting = true
	
	# Auto-cleanup after all particles expire
	await get_tree().create_timer(
		launch.lifetime + burst.lifetime + 0.5
	).timeout
	queue_free()
```

> **Warning:** Sub-emitter particle counts multiply. 32 parent particles × 16 sub-emitter amount = 512 potential spawns per cycle. Budget carefully.

---

## 9. Particle Trails

Trails draw a ribbon/strip connecting a particle's current and previous positions. **GPU-only feature.**

### Basic Trail Setup

```gdscript
extends GPUParticles2D

func _ready() -> void:
	# Enable trails
	trail_enabled = true
	trail_lifetime = 0.3  # Trail persists for 0.3 seconds behind each particle
	
	# Trail needs a RibbonTrailMesh as the draw pass
	var trail_mesh := RibbonTrailMesh.new()
	trail_mesh.size = 8.0  # Width of the ribbon
	trail_mesh.sections = 4  # Subdivisions (more = smoother, costlier)
	trail_mesh.section_length = 0.2
	trail_mesh.section_segments = 3
	trail_mesh.shape = RibbonTrailMesh.SHAPE_FLAT  # FLAT or CROSS
	
	draw_pass_1 = trail_mesh
	
	# Material with fade-out
	var mat := ParticleProcessMaterial.new()
	mat.direction = Vector3(1.0, 0.0, 0.0)
	mat.initial_velocity_min = 100.0
	mat.initial_velocity_max = 200.0
	
	# Color ramp fades trail from bright to transparent
	var gradient := GradientTexture1D.new()
	gradient.gradient = Gradient.new()
	gradient.gradient.colors = PackedColorArray([
		Color(1.0, 0.8, 0.2, 1.0),  # Head: bright
		Color(1.0, 0.4, 0.0, 0.5),  # Mid: orange, semi-transparent
		Color(0.5, 0.1, 0.0, 0.0),  # Tail: invisible
	])
	mat.color_ramp = gradient
	
	process_material = mat
```

### Trail Mesh Shapes

| Shape | Look | Best For |
|-------|------|----------|
| `SHAPE_FLAT` | Flat ribbon, always faces camera | Sword trails, motion lines, ribbons |
| `SHAPE_CROSS` | Two intersecting flat ribbons | Volumetric trails, energy beams |

### Sword Slash Trail

```gdscript
## Attach to the tip of a sword sprite
class_name SwordTrail
extends GPUParticles2D

@export var trail_color: Color = Color(0.9, 0.95, 1.0, 0.8)
@export var trail_width: float = 4.0

func _ready() -> void:
	amount = 16
	lifetime = 0.2
	trail_enabled = true
	trail_lifetime = 0.15
	local_coords = true  # Trail follows emitter
	explosiveness = 0.0  # Even emission
	
	var mesh := RibbonTrailMesh.new()
	mesh.size = trail_width
	mesh.sections = 3
	mesh.section_length = 0.1
	mesh.shape = RibbonTrailMesh.SHAPE_FLAT
	draw_pass_1 = mesh
	
	var mat := ParticleProcessMaterial.new()
	mat.direction = Vector3.ZERO
	mat.initial_velocity_min = 0.0
	mat.initial_velocity_max = 0.0
	mat.gravity = Vector3.ZERO
	mat.color = trail_color
	
	var fade := GradientTexture1D.new()
	fade.gradient = Gradient.new()
	fade.gradient.colors = PackedColorArray([
		Color(trail_color, 0.9),
		Color(trail_color, 0.0),
	])
	mat.color_ramp = fade
	
	# Scale: thin tail
	var scale_curve := CurveTexture.new()
	scale_curve.curve = Curve.new()
	scale_curve.curve.add_point(Vector2(0.0, 1.0))
	scale_curve.curve.add_point(Vector2(1.0, 0.1))
	mat.scale_curve = scale_curve
	
	process_material = mat
	emitting = false  # Controlled by attack state

func start_trail() -> void:
	emitting = true

func stop_trail() -> void:
	emitting = false
```

### Trail + Local vs World Coordinates

```gdscript
# local_coords = true:  Trail follows emitter movement (sword slashes, motion lines)
# local_coords = false: Trail stays in world space (rocket exhaust, bullet tracers)
```

> **Tip:** For a trail that "sticks" in the world (like a rocket exhaust path), use `local_coords = false`. For a trail that shows motion (like a sword arc), use `local_coords = true`.

---

## 10. Custom Particle Shaders

When ParticleProcessMaterial isn't enough, write a custom particle shader. This gives per-particle control of position, velocity, color, and scale on the GPU.

### Vertex Shader (Particle Update)

```gdscript
# Attach as ShaderMaterial to GPUParticles2D.process_material
# File: spiral_particle.gdshader
shader_type particles;

uniform float spiral_speed: hint_range(0.0, 20.0) = 5.0;
uniform float spiral_radius: hint_range(0.0, 200.0) = 50.0;
uniform float upward_speed: hint_range(0.0, 500.0) = 100.0;
uniform vec4 start_color: source_color = vec4(1.0, 0.8, 0.2, 1.0);
uniform vec4 end_color: source_color = vec4(0.5, 0.0, 0.0, 0.0);

void start() {
	// Initialize particle on spawn
	float angle = float(INDEX) * 0.5;  // Offset each particle
	TRANSFORM[3].x = cos(angle) * spiral_radius * 0.1;
	TRANSFORM[3].y = 0.0;
	VELOCITY.x = 0.0;
	VELOCITY.y = -upward_speed;  // Negative Y = up in Godot 2D
	CUSTOM.x = angle;  // Store initial angle in CUSTOM
}

void process() {
	// Per-frame update
	float t = CUSTOM.y / LIFETIME;  // Normalized lifetime (0→1)
	
	// Spiral motion
	float angle = CUSTOM.x + TIME * spiral_speed;
	float radius = spiral_radius * (1.0 - t * 0.5);  // Shrink spiral over time
	TRANSFORM[3].x += cos(angle) * radius * DELTA;
	
	// Color over lifetime
	COLOR = mix(start_color, end_color, t);
	
	// Scale down over lifetime
	TRANSFORM[0].x = mix(1.0, 0.0, t);
	TRANSFORM[1].y = mix(1.0, 0.0, t);
	
	// Track lifetime progress
	CUSTOM.y += DELTA;
}
```

### Key Shader Built-ins for Particles

| Built-in | Type | Description |
|----------|------|-------------|
| `TRANSFORM` | mat4 | Particle's transform (position in column 3) |
| `VELOCITY` | vec3 | Current velocity |
| `COLOR` | vec4 | Particle color (passed to fragment) |
| `CUSTOM` | vec4 | User data (persistent across frames) |
| `INDEX` | uint | Particle index (0 to amount-1) |
| `NUMBER` | uint | Unique particle number (increases per spawn) |
| `LIFETIME` | float | Total lifetime of this particle |
| `DELTA` | float | Frame delta time |
| `TIME` | float | Global time |
| `ACTIVE` | bool | Set to false to kill particle early |
| `RESTART` | bool | True on spawn frame |
| `EMISSION_TRANSFORM` | mat4 | Emitter's transform |
| `SEED` | uint | Random seed for this particle |

### 2D Attractor via Shader

Since GPUParticlesAttractor2D doesn't exist natively, simulate one:

```glsl
shader_type particles;

uniform vec2 attractor_position = vec2(0.0, 0.0);
uniform float attractor_strength: hint_range(0.0, 500.0) = 100.0;
uniform float attractor_radius: hint_range(0.0, 500.0) = 200.0;

void process() {
	vec2 pos = TRANSFORM[3].xy;
	vec2 to_attractor = attractor_position - pos;
	float dist = length(to_attractor);
	
	if (dist < attractor_radius && dist > 1.0) {
		vec2 dir = to_attractor / dist;
		float strength = attractor_strength * (1.0 - dist / attractor_radius);
		VELOCITY.xy += dir * strength * DELTA;
	}
}
```

Update from GDScript:

```gdscript
var shader_mat: ShaderMaterial = particles.process_material
shader_mat.set_shader_parameter("attractor_position", target.global_position)
```

---

## 11. One-Shot Burst Effects

One-shot particles fire once and stop — perfect for explosions, impacts, death effects, item pickups.

### Explosion Manager (Autoload)

```gdscript
## VFX Spawner — Autoload ("VFX")
## Manages one-shot particle spawning with automatic cleanup
class_name VFXManager
extends Node

## Pre-built effect scenes
var _effect_scenes: Dictionary = {}

## Pool of available emitters per effect type
var _pools: Dictionary = {}  # String → Array[GPUParticles2D]

const MAX_POOL_SIZE: int = 8

func _ready() -> void:
	_register_effect("explosion", preload("res://vfx/explosion.tscn"))
	_register_effect("hit_spark", preload("res://vfx/hit_spark.tscn"))
	_register_effect("dust_puff", preload("res://vfx/dust_puff.tscn"))
	_register_effect("blood_splash", preload("res://vfx/blood_splash.tscn"))
	_register_effect("coin_burst", preload("res://vfx/coin_burst.tscn"))
	_register_effect("heal_sparkle", preload("res://vfx/heal_sparkle.tscn"))

func _register_effect(effect_name: String, scene: PackedScene) -> void:
	_effect_scenes[effect_name] = scene
	_pools[effect_name] = []

## Spawn a one-shot effect at a world position
func spawn(effect_name: String, pos: Vector2, rotation_deg: float = 0.0,
		scale_mult: float = 1.0) -> void:
	var emitter: GPUParticles2D = _get_or_create(effect_name)
	if not emitter:
		return
	
	emitter.global_position = pos
	emitter.rotation_degrees = rotation_deg
	emitter.scale = Vector2.ONE * scale_mult
	emitter.visible = true
	emitter.restart()
	emitter.emitting = true
	
	# Return to pool after lifetime expires
	var wait_time: float = emitter.lifetime * (1.0 + emitter.randomness_ratio)
	if emitter.trail_enabled:
		wait_time += emitter.trail_lifetime
	get_tree().create_timer(wait_time + 0.1).timeout.connect(
		_return_to_pool.bind(effect_name, emitter)
	)

## Spawn effect with velocity inheritance (e.g., sparks from moving enemy)
func spawn_with_velocity(effect_name: String, pos: Vector2,
		velocity: Vector2) -> void:
	var emitter: GPUParticles2D = _get_or_create(effect_name)
	if not emitter:
		return
	
	emitter.global_position = pos
	emitter.visible = true
	
	# Apply velocity to material direction
	if velocity.length_squared() > 1.0:
		emitter.rotation = velocity.angle()
	
	emitter.restart()
	emitter.emitting = true
	
	var wait_time: float = emitter.lifetime + 0.2
	get_tree().create_timer(wait_time).timeout.connect(
		_return_to_pool.bind(effect_name, emitter)
	)

func _get_or_create(effect_name: String) -> GPUParticles2D:
	if not _effect_scenes.has(effect_name):
		push_warning("VFX: Unknown effect '%s'" % effect_name)
		return null
	
	# Try pool first
	var pool: Array = _pools[effect_name]
	if pool.size() > 0:
		return pool.pop_back()
	
	# Instantiate new
	var instance: GPUParticles2D = _effect_scenes[effect_name].instantiate()
	instance.one_shot = true
	instance.emitting = false
	instance.visible = false
	get_tree().current_scene.add_child(instance)
	return instance

func _return_to_pool(effect_name: String, emitter: GPUParticles2D) -> void:
	emitter.emitting = false
	emitter.visible = false
	
	var pool: Array = _pools[effect_name]
	if pool.size() < MAX_POOL_SIZE:
		pool.append(emitter)
	else:
		emitter.queue_free()
```

### Usage

```gdscript
# From any script:
VFX.spawn("explosion", enemy.global_position)
VFX.spawn("hit_spark", hit_point, hit_normal.angle(), 0.5)
VFX.spawn("dust_puff", player.global_position + Vector2(0, 16))
VFX.spawn_with_velocity("blood_splash", hit_pos, knockback_dir * 100.0)
```

### Impact Effect Scene (hit_spark.tscn)

```gdscript
# GPUParticles2D settings for a directional spark burst:
extends GPUParticles2D

func _ready() -> void:
	amount = 12
	lifetime = 0.3
	one_shot = true
	explosiveness = 0.95  # Nearly all at once
	randomness_ratio = 0.2
	
	var mat := ParticleProcessMaterial.new()
	mat.direction = Vector3(1.0, 0.0, 0.0)  # Will be rotated by parent
	mat.spread = 35.0
	mat.initial_velocity_min = 120.0
	mat.initial_velocity_max = 250.0
	mat.gravity = Vector3(0.0, 300.0, 0.0)
	mat.damping_min = 50.0
	mat.damping_max = 100.0
	
	# Fast fade
	var scale_curve := VFXCurves.ease_out()
	mat.scale_curve = scale_curve
	mat.scale_min = 0.3
	mat.scale_max = 0.8
	
	# Orange-yellow sparks
	mat.color_ramp = VFXGradients.fire()
	
	process_material = mat
```

---

## 12. Continuous Ambient Effects

Continuous emitters run indefinitely — rain, snow, dust motes, fireflies, torch flames.

### Rain System

```gdscript
## Full-screen rain using multiple particle layers
class_name RainSystem
extends CanvasLayer

@onready var rain_drops: GPUParticles2D = $RainDrops
@onready var rain_splashes: GPUParticles2D = $RainSplashes
@onready var mist: GPUParticles2D = $Mist

@export var intensity: float = 1.0:
	set(value):
		intensity = clampf(value, 0.0, 1.0)
		_update_intensity()

func _ready() -> void:
	_setup_drops()
	_setup_splashes()
	_setup_mist()
	_update_intensity()

func _setup_drops() -> void:
	rain_drops.amount = 200
	rain_drops.lifetime = 0.6
	rain_drops.visibility_rect = Rect2(-640, -400, 1280, 800)
	
	var mat := ParticleProcessMaterial.new()
	mat.emission_shape = ParticleProcessMaterial.EMISSION_SHAPE_BOX
	mat.emission_box_extents = Vector3(700.0, 10.0, 0.0)  # Wide strip above screen
	mat.direction = Vector3(0.2, 1.0, 0.0).normalized()  # Slight wind angle
	mat.spread = 5.0
	mat.initial_velocity_min = 500.0
	mat.initial_velocity_max = 700.0
	mat.gravity = Vector3(0.0, 200.0, 0.0)
	mat.scale_min = 0.5
	mat.scale_max = 1.0
	mat.color = Color(0.7, 0.75, 0.85, 0.6)
	
	rain_drops.process_material = mat

func _setup_splashes() -> void:
	rain_splashes.amount = 50
	rain_splashes.lifetime = 0.2
	
	var mat := ParticleProcessMaterial.new()
	mat.emission_shape = ParticleProcessMaterial.EMISSION_SHAPE_BOX
	mat.emission_box_extents = Vector3(700.0, 5.0, 0.0)
	mat.direction = Vector3(0.0, -1.0, 0.0)
	mat.spread = 60.0
	mat.initial_velocity_min = 20.0
	mat.initial_velocity_max = 60.0
	mat.gravity = Vector3(0.0, 100.0, 0.0)
	mat.scale_min = 0.3
	mat.scale_max = 0.6
	mat.color = Color(0.8, 0.85, 0.9, 0.5)
	
	# Position at ground level
	rain_splashes.position.y = 300  # Adjust to your ground line
	rain_splashes.process_material = mat

func _setup_mist() -> void:
	mist.amount = 20
	mist.lifetime = 3.0
	
	var mat := ParticleProcessMaterial.new()
	mat.emission_shape = ParticleProcessMaterial.EMISSION_SHAPE_BOX
	mat.emission_box_extents = Vector3(700.0, 200.0, 0.0)
	mat.direction = Vector3(1.0, 0.0, 0.0)
	mat.spread = 15.0
	mat.initial_velocity_min = 10.0
	mat.initial_velocity_max = 30.0
	mat.gravity = Vector3.ZERO
	mat.scale_min = 3.0
	mat.scale_max = 6.0
	mat.turbulence_enabled = true
	mat.turbulence_noise_strength = 2.0
	mat.turbulence_noise_scale = 1.0
	
	var fade := GradientTexture1D.new()
	fade.gradient = Gradient.new()
	fade.gradient.colors = PackedColorArray([
		Color(0.6, 0.65, 0.7, 0.0),
		Color(0.6, 0.65, 0.7, 0.15),
		Color(0.6, 0.65, 0.7, 0.15),
		Color(0.6, 0.65, 0.7, 0.0),
	])
	mat.color_ramp = fade
	mist.process_material = mat

func _update_intensity() -> void:
	if not is_inside_tree():
		return
	rain_drops.amount_ratio = intensity
	rain_splashes.amount_ratio = intensity
	mist.amount_ratio = clampf(intensity * 1.5, 0.0, 1.0)
```

### Torch Flame

```gdscript
## Attach to a torch sprite as a child
class_name TorchFlame
extends GPUParticles2D

@export var flicker_speed: float = 3.0

func _ready() -> void:
	amount = 24
	lifetime = 0.8
	randomness_ratio = 0.3
	
	var mat := ParticleProcessMaterial.new()
	mat.emission_shape = ParticleProcessMaterial.EMISSION_SHAPE_SPHERE
	mat.emission_sphere_radius = 3.0
	mat.direction = Vector3(0.0, -1.0, 0.0)
	mat.spread = 15.0
	mat.initial_velocity_min = 20.0
	mat.initial_velocity_max = 50.0
	mat.gravity = Vector3(0.0, -30.0, 0.0)  # Negative = float up
	mat.damping_min = 5.0
	mat.damping_max = 10.0
	
	# Turbulence for organic movement
	mat.turbulence_enabled = true
	mat.turbulence_noise_strength = 3.0
	mat.turbulence_noise_scale = 3.0
	
	# Fire gradient
	mat.color_ramp = VFXGradients.fire()
	
	# Scale: start small, grow, then shrink
	mat.scale_curve = VFXCurves.pop()
	mat.scale_min = 0.5
	mat.scale_max = 1.2
	
	process_material = mat
	emitting = true

func _process(delta: float) -> void:
	# Subtle position flicker for the light
	var t: float = Time.get_ticks_msec() * 0.001 * flicker_speed
	position.x = sin(t * 2.3) * 1.5
	position.y = sin(t * 3.7) * 1.0
```

### Fireflies (Ambient Night)

```gdscript
class_name FireflyEmitter
extends GPUParticles2D

func _ready() -> void:
	amount = 30
	lifetime = 4.0
	randomness_ratio = 0.8
	
	var mat := ParticleProcessMaterial.new()
	mat.emission_shape = ParticleProcessMaterial.EMISSION_SHAPE_BOX
	mat.emission_box_extents = Vector3(300.0, 150.0, 0.0)
	mat.direction = Vector3(0.0, -1.0, 0.0)
	mat.spread = 180.0  # All directions
	mat.initial_velocity_min = 5.0
	mat.initial_velocity_max = 15.0
	mat.gravity = Vector3.ZERO
	
	# Gentle turbulence for organic movement
	mat.turbulence_enabled = true
	mat.turbulence_noise_strength = 2.0
	mat.turbulence_noise_scale = 0.5
	mat.turbulence_noise_speed = Vector3(0.3, 0.2, 0.0)
	
	# Pulsing glow
	mat.scale_curve = VFXCurves.pulse()
	mat.scale_min = 0.3
	mat.scale_max = 0.8
	
	var glow_fade := GradientTexture1D.new()
	glow_fade.gradient = Gradient.new()
	glow_fade.gradient.offsets = PackedFloat32Array([0.0, 0.2, 0.5, 0.8, 1.0])
	glow_fade.gradient.colors = PackedColorArray([
		Color(0.5, 1.0, 0.3, 0.0),
		Color(0.5, 1.0, 0.3, 0.8),
		Color(0.8, 1.0, 0.2, 0.4),
		Color(0.5, 1.0, 0.3, 0.7),
		Color(0.5, 1.0, 0.3, 0.0),
	])
	mat.color_ramp = glow_fade
	
	process_material = mat
	emitting = true
```

---

## 13. Physics-Influenced Particles

### Collision Hints (GPU)

GPUParticles2D supports basic collision with the scene via collision detection:

```gdscript
# In ParticleProcessMaterial:
mat.collision_mode = ParticleProcessMaterial.COLLISION_RIGID
# COLLISION_DISABLED — no collision
# COLLISION_RIGID — bounce off surfaces
# COLLISION_HIDE_ON_CONTACT — disappear on collision (triggers sub-emitter AT_COLLISION)

mat.collision_friction = 0.5   # 0.0 = ice, 1.0 = sticky
mat.collision_bounce = 0.3     # 0.0 = no bounce, 1.0 = full bounce
```

Add a GPUParticlesCollision2D node (SDF-based) as a sibling:

```
Level
├── TileMapLayer
├── GPUParticles2D (rain/debris)
└── GPUParticlesCollisionSDF2D
    └── (covers the level geometry)
```

> **Note:** SDF collision is approximate — particles may clip thin geometry. For precise collision, use CPUParticles2D with manual position checks.

### Manual Physics Particles (CPU)

For precise physics interaction, use CPUParticles2D with manual position updates:

```gdscript
## Debris that bounces off platforms using raycasts
class_name PhysicsDebris
extends Node2D

var particles: Array[DebrisParticle] = []
var space_state: PhysicsDirectSpaceState2D

const GRAVITY: float = 400.0
const BOUNCE: float = 0.5
const FRICTION: float = 0.8

class DebrisParticle:
	var position: Vector2
	var velocity: Vector2
	var rotation: float
	var angular_vel: float
	var lifetime: float
	var max_lifetime: float
	var size: float
	var color: Color

func spawn_debris(pos: Vector2, count: int, force: float) -> void:
	space_state = get_world_2d().direct_space_state
	
	for i: int in range(count):
		var p := DebrisParticle.new()
		p.position = pos + Vector2(randf_range(-5, 5), randf_range(-5, 5))
		var angle: float = randf_range(0, TAU)
		var speed: float = randf_range(force * 0.5, force)
		p.velocity = Vector2(cos(angle), sin(angle)) * speed
		p.velocity.y -= force * 0.8  # Bias upward
		p.rotation = randf_range(0, TAU)
		p.angular_vel = randf_range(-10.0, 10.0)
		p.max_lifetime = randf_range(1.0, 2.5)
		p.lifetime = p.max_lifetime
		p.size = randf_range(2.0, 6.0)
		p.color = Color(0.6, 0.5, 0.4, 1.0)
		particles.append(p)

func _physics_process(delta: float) -> void:
	var dead: Array[int] = []
	
	for i: int in range(particles.size()):
		var p: DebrisParticle = particles[i]
		
		# Apply gravity
		p.velocity.y += GRAVITY * delta
		
		# Raycast for collision
		var query := PhysicsRayQueryParameters2D.create(
			p.position, p.position + p.velocity * delta, 1  # Layer 1
		)
		var result: Dictionary = space_state.intersect_ray(query)
		
		if result:
			# Bounce
			var normal: Vector2 = result["normal"]
			p.velocity = p.velocity.bounce(normal) * BOUNCE
			p.velocity.x *= FRICTION
			p.angular_vel *= 0.5
			p.position = result["position"] + normal * 2.0
		else:
			p.position += p.velocity * delta
		
		p.rotation += p.angular_vel * delta
		p.lifetime -= delta
		
		# Fade out
		var t: float = p.lifetime / p.max_lifetime
		p.color.a = t
		
		if p.lifetime <= 0.0:
			dead.append(i)
	
	# Remove dead particles (reverse order)
	for i: int in range(dead.size() - 1, -1, -1):
		particles.remove_at(dead[i])
	
	queue_redraw()

func _draw() -> void:
	for p: DebrisParticle in particles:
		draw_set_transform(p.position, p.rotation)
		draw_rect(
			Rect2(-p.size * 0.5, -p.size * 0.5, p.size, p.size),
			p.color
		)
	draw_set_transform(Vector2.ZERO, 0.0)  # Reset
```

---

## 14. VFX Recipes — Common Game Effects

### 14.1 Dust Puff (Landing / Dash)

```gdscript
## Spawn on land, dash start, wall slide
static func create_dust_puff() -> GPUParticles2D:
	var p := GPUParticles2D.new()
	p.amount = 8
	p.lifetime = 0.4
	p.one_shot = true
	p.explosiveness = 0.9
	
	var mat := ParticleProcessMaterial.new()
	mat.emission_shape = ParticleProcessMaterial.EMISSION_SHAPE_SPHERE
	mat.emission_sphere_radius = 4.0
	mat.direction = Vector3(0.0, -1.0, 0.0)
	mat.spread = 70.0
	mat.initial_velocity_min = 20.0
	mat.initial_velocity_max = 50.0
	mat.gravity = Vector3(0.0, -10.0, 0.0)  # Float up slightly
	mat.damping_min = 30.0
	mat.damping_max = 60.0
	mat.scale_min = 0.3
	mat.scale_max = 0.8
	mat.scale_curve = VFXCurves.ease_out()
	mat.color = Color(0.7, 0.65, 0.55, 0.6)
	
	var fade := GradientTexture1D.new()
	fade.gradient = Gradient.new()
	fade.gradient.colors = PackedColorArray([
		Color(0.7, 0.65, 0.55, 0.6),
		Color(0.7, 0.65, 0.55, 0.0),
	])
	mat.color_ramp = fade
	
	p.process_material = mat
	return p
```

### 14.2 Coin / Item Pickup

```gdscript
## Sparkle burst + floating "+ 1" (combine with damage number from G8)
static func create_pickup_sparkle() -> GPUParticles2D:
	var p := GPUParticles2D.new()
	p.amount = 16
	p.lifetime = 0.6
	p.one_shot = true
	p.explosiveness = 1.0  # All at once
	
	var mat := ParticleProcessMaterial.new()
	mat.direction = Vector3(0.0, -1.0, 0.0)
	mat.spread = 180.0  # Full circle
	mat.initial_velocity_min = 40.0
	mat.initial_velocity_max = 100.0
	mat.gravity = Vector3(0.0, -20.0, 0.0)  # Float up
	mat.damping_min = 40.0
	mat.damping_max = 80.0
	mat.scale_min = 0.2
	mat.scale_max = 0.6
	mat.scale_curve = VFXCurves.pop()
	mat.angular_velocity_min = -360.0
	mat.angular_velocity_max = 360.0
	
	mat.color_ramp = VFXGradients.heal()  # Green sparkle
	
	p.process_material = mat
	return p
```

### 14.3 Blood / Hit Splash

```gdscript
static func create_blood_splash() -> GPUParticles2D:
	var p := GPUParticles2D.new()
	p.amount = 20
	p.lifetime = 0.5
	p.one_shot = true
	p.explosiveness = 0.95
	
	var mat := ParticleProcessMaterial.new()
	mat.direction = Vector3(1.0, -0.5, 0.0).normalized()  # Rotated by spawn
	mat.spread = 30.0
	mat.initial_velocity_min = 80.0
	mat.initial_velocity_max = 200.0
	mat.gravity = Vector3(0.0, 400.0, 0.0)  # Heavy, falls fast
	mat.damping_min = 20.0
	mat.damping_max = 50.0
	mat.scale_min = 0.3
	mat.scale_max = 1.0
	
	var blood_color := GradientTexture1D.new()
	blood_color.gradient = Gradient.new()
	blood_color.gradient.offsets = PackedFloat32Array([0.0, 0.3, 1.0])
	blood_color.gradient.colors = PackedColorArray([
		Color(0.8, 0.0, 0.0, 1.0),   # Bright red
		Color(0.5, 0.0, 0.0, 0.8),   # Dark red
		Color(0.2, 0.0, 0.0, 0.0),   # Fade out
	])
	mat.color_ramp = blood_color
	
	p.process_material = mat
	return p
```

### 14.4 Smoke Trail (Missile / Rocket)

```gdscript
## Attach as child of projectile node
class_name SmokeTrail
extends GPUParticles2D

func _ready() -> void:
	amount = 32
	lifetime = 1.2
	local_coords = false  # Stays in world space
	
	var mat := ParticleProcessMaterial.new()
	mat.emission_shape = ParticleProcessMaterial.EMISSION_SHAPE_SPHERE
	mat.emission_sphere_radius = 2.0
	mat.direction = Vector3(0.0, -1.0, 0.0)
	mat.spread = 20.0
	mat.initial_velocity_min = 5.0
	mat.initial_velocity_max = 15.0
	mat.gravity = Vector3(0.0, -15.0, 0.0)  # Rises
	mat.damping_min = 5.0
	mat.damping_max = 10.0
	mat.turbulence_enabled = true
	mat.turbulence_noise_strength = 2.0
	mat.turbulence_noise_scale = 1.5
	
	# Grow and fade
	mat.scale_min = 0.3
	mat.scale_max = 0.6
	var grow := CurveTexture.new()
	grow.curve = Curve.new()
	grow.curve.add_point(Vector2(0.0, 0.5))
	grow.curve.add_point(Vector2(0.5, 1.0))
	grow.curve.add_point(Vector2(1.0, 1.5))
	mat.scale_curve = grow
	
	var smoke_fade := GradientTexture1D.new()
	smoke_fade.gradient = Gradient.new()
	smoke_fade.gradient.offsets = PackedFloat32Array([0.0, 0.1, 0.5, 1.0])
	smoke_fade.gradient.colors = PackedColorArray([
		Color(1.0, 0.8, 0.3, 0.8),   # Flash near emitter
		Color(0.5, 0.5, 0.5, 0.6),   # Grey smoke
		Color(0.3, 0.3, 0.3, 0.3),   # Fading
		Color(0.2, 0.2, 0.2, 0.0),   # Gone
	])
	mat.color_ramp = smoke_fade
	
	process_material = mat
	emitting = true
```

### 14.5 Charge-Up / Power Accumulation

```gdscript
## Particles spiral inward toward a charge point
class_name ChargeEffect
extends GPUParticles2D

@export var charge_time: float = 1.5

func _ready() -> void:
	amount = 48
	lifetime = 0.8
	
	var mat := ParticleProcessMaterial.new()
	# Emit from a ring around the charge point
	mat.emission_shape = ParticleProcessMaterial.EMISSION_SHAPE_RING
	mat.emission_ring_radius = 80.0
	mat.emission_ring_inner_radius = 70.0
	mat.emission_ring_height = 0.0
	mat.emission_ring_axis = Vector3(0.0, 0.0, 1.0)
	
	# Negative radial acceleration = pull inward
	mat.radial_accel_min = -200.0
	mat.radial_accel_max = -150.0
	
	# Tangential = spiral
	mat.tangential_accel_min = 80.0
	mat.tangential_accel_max = 120.0
	
	mat.initial_velocity_min = 0.0
	mat.initial_velocity_max = 10.0
	mat.gravity = Vector3.ZERO
	
	# Shrink as they approach center
	var shrink := CurveTexture.new()
	shrink.curve = Curve.new()
	shrink.curve.add_point(Vector2(0.0, 1.0))
	shrink.curve.add_point(Vector2(1.0, 0.0))
	mat.scale_curve = shrink
	mat.scale_min = 0.5
	mat.scale_max = 1.0
	
	mat.color_ramp = VFXGradients.electric()
	
	process_material = mat
	emitting = false

func start_charge() -> void:
	emitting = true

func release() -> void:
	emitting = false
	# Spawn burst effect at center
	VFX.spawn("explosion", global_position, 0.0, 1.5)
```

### 14.6 Footstep Dust

```gdscript
## Call from character state machine on each footstep
class_name FootstepDust
extends GPUParticles2D

func _ready() -> void:
	amount = 6
	lifetime = 0.3
	one_shot = true
	explosiveness = 0.9
	
	var mat := ParticleProcessMaterial.new()
	mat.emission_shape = ParticleProcessMaterial.EMISSION_SHAPE_SPHERE
	mat.emission_sphere_radius = 3.0
	mat.direction = Vector3(0.0, -1.0, 0.0)
	mat.spread = 60.0
	mat.initial_velocity_min = 10.0
	mat.initial_velocity_max = 30.0
	mat.gravity = Vector3(0.0, -5.0, 0.0)
	mat.damping_min = 20.0
	mat.damping_max = 40.0
	mat.scale_min = 0.2
	mat.scale_max = 0.5
	mat.scale_curve = VFXCurves.ease_out()
	mat.color = Color(0.6, 0.55, 0.45, 0.4)
	
	var fade := GradientTexture1D.new()
	fade.gradient = Gradient.new()
	fade.gradient.colors = PackedColorArray([
		Color(0.6, 0.55, 0.45, 0.4),
		Color(0.6, 0.55, 0.45, 0.0),
	])
	mat.color_ramp = fade
	process_material = mat

func puff(foot_position: Vector2, facing_right: bool) -> void:
	global_position = foot_position
	# Kick dust backward
	rotation = 0.0 if facing_right else PI
	restart()
	emitting = true
```

### 14.7 Environmental Weather Particles

```gdscript
## Snow — lighter, slower, more turbulence than rain
static func create_snow() -> GPUParticles2D:
	var p := GPUParticles2D.new()
	p.amount = 100
	p.lifetime = 4.0
	p.visibility_rect = Rect2(-700, -500, 1400, 1000)
	
	var mat := ParticleProcessMaterial.new()
	mat.emission_shape = ParticleProcessMaterial.EMISSION_SHAPE_BOX
	mat.emission_box_extents = Vector3(700.0, 10.0, 0.0)
	mat.direction = Vector3(0.1, 1.0, 0.0).normalized()
	mat.spread = 10.0
	mat.initial_velocity_min = 30.0
	mat.initial_velocity_max = 60.0
	mat.gravity = Vector3(0.0, 10.0, 0.0)
	
	# Turbulence makes snow drift
	mat.turbulence_enabled = true
	mat.turbulence_noise_strength = 4.0
	mat.turbulence_noise_scale = 0.8
	mat.turbulence_noise_speed = Vector3(0.3, 0.1, 0.0)
	
	# Slow spin
	mat.angular_velocity_min = -45.0
	mat.angular_velocity_max = 45.0
	
	mat.scale_min = 0.2
	mat.scale_max = 0.6
	mat.color = Color(0.95, 0.95, 1.0, 0.8)
	
	var fade := GradientTexture1D.new()
	fade.gradient = Gradient.new()
	fade.gradient.offsets = PackedFloat32Array([0.0, 0.1, 0.9, 1.0])
	fade.gradient.colors = PackedColorArray([
		Color(0.95, 0.95, 1.0, 0.0),
		Color(0.95, 0.95, 1.0, 0.8),
		Color(0.95, 0.95, 1.0, 0.8),
		Color(0.95, 0.95, 1.0, 0.0),
	])
	mat.color_ramp = fade
	
	p.process_material = mat
	return p
```

---

## 15. Particle Pooling & Lifecycle Management

### Why Pool Particles?

Creating and destroying `GPUParticles2D` nodes is expensive — each allocates GPU buffers. For frequently-used effects (hit sparks, footsteps, projectile impacts), pooling is essential.

The [VFXManager](#11-one-shot-burst-effects) in Section 11 implements a basic pool. Here's the extended pattern for high-frequency effects:

### Advanced Pool with Warmup

```gdscript
## VFXPool — Pre-warms particle emitters for zero-allocation spawning
class_name VFXPool
extends Node

var _available: Array[GPUParticles2D] = []
var _active: Array[GPUParticles2D] = []
var _scene: PackedScene
var _max_size: int
var _container: Node

func _init(scene: PackedScene, initial_count: int, max_count: int,
		container: Node) -> void:
	_scene = scene
	_max_size = max_count
	_container = container
	
	# Pre-warm
	for i: int in range(initial_count):
		var instance: GPUParticles2D = _create_instance()
		_available.append(instance)

func _create_instance() -> GPUParticles2D:
	var instance: GPUParticles2D = _scene.instantiate()
	instance.emitting = false
	instance.visible = false
	instance.one_shot = true
	_container.add_child(instance)
	return instance

func get_emitter() -> GPUParticles2D:
	var emitter: GPUParticles2D
	
	if _available.size() > 0:
		emitter = _available.pop_back()
	elif _active.size() + _available.size() < _max_size:
		emitter = _create_instance()
	else:
		# Pool exhausted — steal oldest active
		emitter = _active.pop_front()
		emitter.emitting = false
	
	emitter.visible = true
	_active.append(emitter)
	return emitter

func return_emitter(emitter: GPUParticles2D) -> void:
	emitter.emitting = false
	emitter.visible = false
	_active.erase(emitter)
	_available.append(emitter)

## Stats for debugging
func get_stats() -> Dictionary:
	return {
		"available": _available.size(),
		"active": _active.size(),
		"total": _available.size() + _active.size(),
		"max": _max_size,
	}
```

### Automatic Return Timer

```gdscript
## Wrap pool usage with auto-return
func spawn_pooled(pool: VFXPool, pos: Vector2, rot: float = 0.0) -> void:
	var emitter: GPUParticles2D = pool.get_emitter()
	emitter.global_position = pos
	emitter.rotation = rot
	emitter.restart()
	emitter.emitting = true
	
	# Calculate when all particles will be dead
	var return_time: float = emitter.lifetime
	if emitter.trail_enabled:
		return_time += emitter.trail_lifetime
	return_time *= (1.0 + emitter.randomness_ratio)
	return_time += 0.1  # Safety margin
	
	get_tree().create_timer(return_time).timeout.connect(
		pool.return_emitter.bind(emitter)
	)
```

---

## 16. Screen-Space Effects

### Fullscreen Particle Overlay (CanvasLayer)

```gdscript
## Persistent screen-space effects (vignette particles, screen dust, etc.)
class_name ScreenVFX
extends CanvasLayer

@onready var damage_vignette: GPUParticles2D = $DamageVignette
@onready var speed_lines: GPUParticles2D = $SpeedLines

func _ready() -> void:
	layer = 10  # Above game, below UI
	_setup_speed_lines()

func flash_damage() -> void:
	damage_vignette.restart()
	damage_vignette.emitting = true

func set_speed_lines(active: bool) -> void:
	speed_lines.emitting = active

func _setup_speed_lines() -> void:
	speed_lines.amount = 20
	speed_lines.lifetime = 0.3
	
	var mat := ParticleProcessMaterial.new()
	mat.emission_shape = ParticleProcessMaterial.EMISSION_SHAPE_BOX
	mat.emission_box_extents = Vector3(640.0, 360.0, 0.0)
	
	# Radial outward from center (simulates speed)
	mat.radial_accel_min = 500.0
	mat.radial_accel_max = 1000.0
	mat.initial_velocity_min = 0.0
	mat.initial_velocity_max = 10.0
	mat.gravity = Vector3.ZERO
	
	mat.scale_min = 0.1
	mat.scale_max = 0.3
	# Stretch along velocity
	mat.scale_curve = VFXCurves.ease_in()
	
	mat.color = Color(1.0, 1.0, 1.0, 0.3)
	var fade := GradientTexture1D.new()
	fade.gradient = Gradient.new()
	fade.gradient.colors = PackedColorArray([
		Color(1.0, 1.0, 1.0, 0.0),
		Color(1.0, 1.0, 1.0, 0.3),
		Color(1.0, 1.0, 1.0, 0.0),
	])
	mat.color_ramp = fade
	
	speed_lines.process_material = mat
	speed_lines.emitting = false
```

### Camera Shake + Particles Integration

```gdscript
## Coordinate particle effects with camera shake (see G6 Camera Systems)
func big_explosion(pos: Vector2) -> void:
	# Screen shake (from G6)
	CameraShaker.add_trauma(0.7)
	
	# Particle burst
	VFX.spawn("explosion", pos, 0.0, 2.0)
	
	# Screen flash (fullscreen white fade)
	var flash_tween: Tween = create_tween()
	$ScreenFlash.color = Color(1.0, 0.9, 0.7, 0.4)
	flash_tween.tween_property($ScreenFlash, "color:a", 0.0, 0.3)
	
	# Hit freeze (from G8 Animation Systems)
	Engine.time_scale = 0.05
	await get_tree().create_timer(0.05 * 3).timeout  # 3 real frames
	Engine.time_scale = 1.0
```

---

## 17. Particle Interaction with Gameplay

### Damage Zone Particles

```gdscript
## Particles that visually represent an active damage area
class_name DamageZoneVFX
extends Node2D

@onready var particles: GPUParticles2D = $GPUParticles2D
@onready var area: Area2D = $Area2D

signal body_in_zone(body: Node2D)

@export var damage_per_second: float = 10.0
@export var zone_radius: float = 64.0

var _bodies_in_zone: Array[Node2D] = []

func _ready() -> void:
	# Sync particle emission shape with collision
	var mat: ParticleProcessMaterial = particles.process_material
	mat.emission_shape = ParticleProcessMaterial.EMISSION_SHAPE_RING
	mat.emission_ring_radius = zone_radius
	mat.emission_ring_inner_radius = zone_radius * 0.3
	mat.emission_ring_height = 0.0
	mat.emission_ring_axis = Vector3(0.0, 0.0, 1.0)
	
	# Match Area2D collision shape
	var shape: CircleShape2D = area.get_child(0).shape
	shape.radius = zone_radius
	
	area.body_entered.connect(_on_body_entered)
	area.body_exited.connect(_on_body_exited)

func _physics_process(delta: float) -> void:
	for body: Node2D in _bodies_in_zone:
		if body.has_method("take_damage"):
			body.take_damage(damage_per_second * delta)

func _on_body_entered(body: Node2D) -> void:
	if body.is_in_group("damageable"):
		_bodies_in_zone.append(body)
		body_in_zone.emit(body)

func _on_body_exited(body: Node2D) -> void:
	_bodies_in_zone.erase(body)

func activate() -> void:
	particles.emitting = true
	area.monitoring = true

func deactivate() -> void:
	particles.emitting = false
	area.monitoring = false
	_bodies_in_zone.clear()
```

### Status Effect Particle Attachment

```gdscript
## Attach persistent particle effects to characters for status effects
class_name StatusVFX
extends Node2D

## Active particle effects keyed by status name
var _active_effects: Dictionary = {}

## Pre-defined effect configurations
const EFFECT_CONFIGS: Dictionary = {
	"burning": {
		"amount": 12,
		"lifetime": 0.6,
		"gradient": "fire",
		"direction": Vector3(0.0, -1.0, 0.0),
		"spread": 40.0,
		"velocity_min": 15.0,
		"velocity_max": 40.0,
		"gravity": Vector3(0.0, -20.0, 0.0),
		"turbulence": true,
	},
	"poisoned": {
		"amount": 8,
		"lifetime": 1.0,
		"gradient": "poison",
		"direction": Vector3(0.0, -1.0, 0.0),
		"spread": 180.0,
		"velocity_min": 5.0,
		"velocity_max": 15.0,
		"gravity": Vector3(0.0, -10.0, 0.0),
		"turbulence": true,
	},
	"frozen": {
		"amount": 6,
		"lifetime": 1.5,
		"gradient": "electric",  # Reusing cyan-ish gradient
		"direction": Vector3(0.0, -1.0, 0.0),
		"spread": 120.0,
		"velocity_min": 3.0,
		"velocity_max": 10.0,
		"gravity": Vector3(0.0, -5.0, 0.0),
		"turbulence": false,
	},
}

func apply_effect(status_name: String) -> void:
	if _active_effects.has(status_name):
		return  # Already active
	
	if not EFFECT_CONFIGS.has(status_name):
		push_warning("StatusVFX: Unknown status '%s'" % status_name)
		return
	
	var config: Dictionary = EFFECT_CONFIGS[status_name]
	var emitter := GPUParticles2D.new()
	emitter.amount = config["amount"]
	emitter.lifetime = config["lifetime"]
	
	var mat := ParticleProcessMaterial.new()
	mat.direction = config["direction"]
	mat.spread = config["spread"]
	mat.initial_velocity_min = config["velocity_min"]
	mat.initial_velocity_max = config["velocity_max"]
	mat.gravity = config["gravity"]
	
	if config.get("turbulence", false):
		mat.turbulence_enabled = true
		mat.turbulence_noise_strength = 2.0
		mat.turbulence_noise_scale = 2.0
	
	# Apply gradient
	match config["gradient"]:
		"fire": mat.color_ramp = VFXGradients.fire()
		"poison": mat.color_ramp = VFXGradients.poison()
		"electric": mat.color_ramp = VFXGradients.electric()
		"heal": mat.color_ramp = VFXGradients.heal()
	
	emitter.process_material = mat
	emitter.emitting = true
	add_child(emitter)
	_active_effects[status_name] = emitter

func remove_effect(status_name: String) -> void:
	if not _active_effects.has(status_name):
		return
	
	var emitter: GPUParticles2D = _active_effects[status_name]
	emitter.emitting = false
	
	# Let remaining particles finish their lifetime
	var cleanup_timer: SceneTreeTimer = get_tree().create_timer(emitter.lifetime + 0.1)
	cleanup_timer.timeout.connect(emitter.queue_free)
	
	_active_effects.erase(status_name)

func clear_all() -> void:
	for status_name: String in _active_effects.keys():
		remove_effect(status_name)
```

---

## 18. Performance Optimization

### Budget Guidelines

| Platform | Max GPU Particles | Max CPU Particles | Max Emitters |
|----------|------------------|-------------------|--------------|
| Desktop (mid) | 10,000 | 2,000 | 50 |
| Desktop (low) | 5,000 | 1,000 | 30 |
| Mobile (high) | 3,000 | 800 | 20 |
| Mobile (low) | 1,000 | 300 | 10 |
| Web | 2,000 (CPU only recommended) | 500 | 15 |

### Optimization Techniques

#### 1. Reduce Draw Calls — Merge Emitters

```gdscript
# BAD: 20 separate torches, each with its own GPUParticles2D (20 draw calls)

# GOOD: One emitter with ring emission covering all torch positions
# If torches are static, bake their positions into a point emission texture
```

#### 2. LOD (Level of Detail) by Distance

```gdscript
## Reduce particle count and disable features based on camera distance
class_name ParticleLOD
extends GPUParticles2D

@export var full_detail_distance: float = 200.0
@export var low_detail_distance: float = 500.0
@export var cull_distance: float = 800.0

var _base_amount: int
var _camera: Camera2D

func _ready() -> void:
	_base_amount = amount
	_camera = get_viewport().get_camera_2d()

func _process(_delta: float) -> void:
	if not _camera:
		return
	
	var dist: float = global_position.distance_to(_camera.global_position)
	
	if dist > cull_distance:
		visible = false
		emitting = false
	elif dist > low_detail_distance:
		visible = true
		emitting = true
		amount_ratio = 0.25  # 25% particles
	elif dist > full_detail_distance:
		visible = true
		emitting = true
		amount_ratio = 0.5  # 50% particles
	else:
		visible = true
		emitting = true
		amount_ratio = 1.0  # Full detail
```

#### 3. Conditional Processing

```gdscript
# Disable particle processing when off-screen
func _on_visible_on_screen_notifier_2d_screen_exited() -> void:
	emitting = false
	set_process(false)

func _on_visible_on_screen_notifier_2d_screen_entered() -> void:
	emitting = true
	set_process(true)
```

#### 4. Texture Optimization

```gdscript
# Use small textures (16×16 to 64×64) for particles
# Larger textures waste fill rate on tiny objects

# Use texture atlases for multiple particle types
# Set region in CanvasItemMaterial or shader

# Avoid alpha gradients at edges — hard-edged circles with
# additive blending look better AND render faster
```

#### 5. Blend Mode Selection

```gdscript
# Additive blending (fire, sparks, magic): lighter colors, no sorting needed
# material.blend_mode = CanvasItemMaterial.BLEND_MODE_ADD

# Alpha blending (smoke, dust): correct layering, requires sorting
# material.blend_mode = CanvasItemMaterial.BLEND_MODE_MIX

# Additive is cheaper — use it for glow/energy effects whenever possible
```

#### 6. Preprocess for Instant Fill

```gdscript
# Avoid the "fill-up" delay when continuous emitters first appear
# Preprocess simulates N seconds before the first visible frame
particles.preprocess = 2.0  # Start as if it's been running for 2 seconds
```

### Profiling Particles

```gdscript
## Debug overlay for particle stats
class_name ParticleDebugOverlay
extends CanvasLayer

@onready var label: Label = $Label

func _process(_delta: float) -> void:
	if not OS.is_debug_build():
		return
	
	var total_particles: int = 0
	var emitter_count: int = 0
	
	_count_emitters(get_tree().root, total_particles, emitter_count)
	
	label.text = "Particles: %d | Emitters: %d" % [total_particles, emitter_count]

func _count_emitters(node: Node, total: int, count: int) -> void:
	if node is GPUParticles2D:
		var gpu: GPUParticles2D = node
		if gpu.emitting:
			count += 1
			total += gpu.amount
	elif node is CPUParticles2D:
		var cpu: CPUParticles2D = node
		if cpu.emitting:
			count += 1
			total += cpu.amount
	
	for child: Node in node.get_children():
		_count_emitters(child, total, count)
```

---

## 19. Common Mistakes & Troubleshooting

### Mistake 1: Particles Vanish When Camera Moves

**Problem:** GPUParticles2D disappears when the emitter is off-screen.

**Fix:** Expand the `visibility_rect` to cover the full particle spread:

```gdscript
# Calculate based on max velocity × lifetime + emission radius
var max_spread: float = max_velocity * lifetime + emission_radius
visibility_rect = Rect2(
	-max_spread, -max_spread,
	max_spread * 2.0, max_spread * 2.0
)
```

### Mistake 2: "Fill-Up" Delay on Scene Load

**Problem:** Continuous effects (rain, fire) start empty and take seconds to fill.

**Fix:** Use `preprocess`:

```gdscript
particles.preprocess = particles.lifetime  # Pre-fill one full cycle
```

### Mistake 3: One-Shot Doesn't Restart

**Problem:** Calling `emitting = true` on a one-shot emitter that already fired does nothing.

**Fix:** Call `restart()` before re-emitting:

```gdscript
particles.restart()
particles.emitting = true
```

### Mistake 4: Trails Look Broken / Zigzag

**Problem:** Trail ribbons form sharp zigzag patterns instead of smooth curves.

**Fix:** Increase `RibbonTrailMesh.sections` and `section_segments`. Also ensure the emitter's `process_material` has adequate lifetime for the trail:

```gdscript
# Too few sections → jagged
trail_mesh.sections = 8       # More subdivisions
trail_mesh.section_segments = 4
trail_mesh.section_length = 0.15

# Trail lifetime must be shorter than particle lifetime
# or ribbons disconnect
```

### Mistake 5: Sub-Emitter Particle Count Explosion

**Problem:** Game freezes when sub-emitters spawn — thousands of particles.

**Fix:** Budget sub-emitter amounts carefully:

```gdscript
# Parent: 32 particles × sub_emitter_amount_at_end: 16 = 512 spawns per cycle!
# Solution: reduce parent amount or sub-emitter amount
parent.amount = 8               # Fewer parents
mat.sub_emitter_amount_at_end = 8  # Fewer children per parent
# = 64 spawns per cycle (much more manageable)
```

### Mistake 6: Particles Don't Appear (Nothing Visible)

**Checklist:**
1. ✅ `emitting = true`?
2. ✅ `amount > 0`?
3. ✅ `process_material` assigned?
4. ✅ `initial_velocity > 0` OR `gravity != Vector3.ZERO`?
5. ✅ `color.a > 0`? (check color ramp too)
6. ✅ `scale > 0`? (check scale curve — does it start at 0?)
7. ✅ `visible = true` and parent visible?
8. ✅ `visibility_rect` large enough?
9. ✅ Texture assigned (or using default point sprite)?
10. ✅ Not behind CanvasLayer with wrong layer order?

### Mistake 7: GPU Particles Don't Work on Some Devices

**Problem:** GPUParticles2D shows nothing on older GPUs or web builds.

**Fix:** Always have a CPU fallback path:

```gdscript
## Runtime particle type selection
func create_emitter(use_gpu: bool) -> Node2D:
	if use_gpu and OS.get_name() != "Web":
		var gpu := GPUParticles2D.new()
		# ... configure
		return gpu
	else:
		var cpu := CPUParticles2D.new()
		# ... configure (same visual params, different API)
		return cpu
```

> **Tip:** The editor's "Convert to CPUParticles2D" is a one-click way to create the fallback version.

---

## 20. Tuning Reference Tables

### Particle Count by Effect Type

| Effect | Amount | Lifetime (s) | Explosiveness | One Shot |
|--------|--------|--------------|---------------|----------|
| Footstep dust | 4-8 | 0.2-0.4 | 0.9 | Yes |
| Hit spark | 8-16 | 0.2-0.4 | 0.95 | Yes |
| Blood splash | 12-24 | 0.3-0.6 | 0.95 | Yes |
| Explosion | 24-48 | 0.5-1.0 | 1.0 | Yes |
| Coin pickup | 12-20 | 0.4-0.8 | 1.0 | Yes |
| Torch flame | 16-32 | 0.5-1.0 | 0.0 | No |
| Rain drops | 100-300 | 0.4-0.8 | 0.0 | No |
| Snow | 50-150 | 3.0-5.0 | 0.0 | No |
| Smoke trail | 24-48 | 0.8-1.5 | 0.0 | No |
| Fireflies | 20-40 | 3.0-5.0 | 0.0 | No |
| Charge-up | 32-64 | 0.5-1.0 | 0.0 | No |
| Speed lines | 15-30 | 0.2-0.4 | 0.0 | No |

### Turbulence Tuning

| Effect | Noise Strength | Noise Scale | Noise Speed |
|--------|---------------|-------------|-------------|
| Fire | 3.0-5.0 | 2.0-4.0 | (0.5, 0.3, 0) |
| Smoke | 2.0-4.0 | 1.0-2.0 | (0.3, 0.2, 0) |
| Magical energy | 5.0-10.0 | 3.0-5.0 | (1.0, 0.8, 0) |
| Fireflies | 1.0-3.0 | 0.3-0.8 | (0.2, 0.15, 0) |
| Snow | 3.0-5.0 | 0.5-1.0 | (0.3, 0.1, 0) |
| Underwater bubbles | 2.0-3.0 | 1.0-2.0 | (0.2, 0.5, 0) |

### Velocity & Gravity by Effect Type

| Effect | Velocity (min-max) | Gravity Y | Damping |
|--------|-------------------|-----------|---------|
| Explosion debris | 150-400 | 300-500 | 20-50 |
| Hit sparks | 80-250 | 200-400 | 30-80 |
| Dust puff | 10-50 | -10 to -30 | 30-60 |
| Flame | 15-50 | -20 to -50 | 5-15 |
| Rain | 400-700 | 100-200 | 0 |
| Snow | 20-60 | 5-15 | 0 |
| Blood | 80-200 | 300-500 | 10-30 |
| Charge spiral | 0-10 | 0 | 0 |
| Smoke trail | 5-15 | -10 to -20 | 5-10 |
| Coin sparkle | 40-100 | -20 to -40 | 40-80 |

### Blend Mode Selection

| Effect Type | Blend Mode | Reason |
|-------------|-----------|--------|
| Fire, sparks, lightning | Additive | Colors add up, brighter = better, no sorting needed |
| Smoke, dust, clouds | Alpha Mix | Correct layering, natural occlusion |
| Blood, debris | Alpha Mix | Needs to look solid, not glowing |
| Magic, energy | Additive | Ethereal glow effect |
| UI particles (confetti) | Alpha Mix | Consistent look on any background |
| Glow overlay | Additive | Enhances existing light |

---

## Related Guides

- [G1 Scene Composition](./G1_scene_composition.md) — Scene structure for VFX nodes
- [G2 State Machine](./G2_state_machine.md) — Trigger effects from state transitions
- [G3 Signal Architecture](./G3_signal_architecture.md) — Signal-driven VFX spawning
- [G5 Physics & Collision](./G5_physics_and_collision.md) — Collision layers for particles
- [G6 Camera Systems](./G6_camera_systems.md) — Screen shake + particle coordination
- [G8 Animation Systems](./G8_animation_systems.md) — Hit effects, tweens + particles
- [G12 Shaders & Visual Effects](./G12_shaders_and_visual_effects.md) — Custom shader effects
- [E1 Architecture Overview](../architecture/E1_architecture_overview.md) — Node tree and signal fundamentals
- [godot-rules.md](../godot-rules.md) — GDScript coding standards

---

*Guide covers Godot 4.4+. All code uses typed GDScript. GPU particles require Vulkan/OpenGL 3.3+; use CPU particles for web and low-end targets.*
