# G68 — Destructible Environments

> **Category:** Guide · **Engine:** Godot 4.4+ · **Language:** GDScript / C#
> **Related:** [G5 Physics & Collision](./G5_physics_and_collision.md) · [G23 Advanced Physics](./G23_advanced_physics.md) · [G62 Procedural Mesh Generation](./G62_procedural_mesh_generation.md) · [G38 Game Feel & Juice](./G38_game_feel_and_juice.md)

---

## Table of Contents

1. [What This Guide Covers](#what-this-guide-covers)
2. [Approaches Overview](#approaches-overview)
3. [Pre-Fractured Mesh Destruction (3D)](#pre-fractured-mesh-destruction-3d)
4. [CSG Boolean Destruction](#csg-boolean-destruction)
5. [2D Sprite Destruction](#2d-sprite-destruction)
6. [Health and Damage System Integration](#health-and-damage-system-integration)
7. [Physics Debris Management](#physics-debris-management)
8. [Visual Effects & Polish](#visual-effects--polish)
9. [Networking Considerations](#networking-considerations)
10. [Common Mistakes](#common-mistakes)

---

## What This Guide Covers

Destructible environments are a core pillar of game feel. Whether a crate shatters into splinters, a wall crumbles from an explosion, or terrain deforms under your feet, destruction sells interaction and consequence. This guide covers five approaches to destruction in Godot 4.4+, from simple pre-fractured meshes to advanced runtime voronoi fracturing. You'll learn how to balance visual fidelity with performance, sync destruction across the network, and avoid the pitfalls that turn destruction into a performance nightmare.

---

## Approaches Overview

| Approach | Best For | Pros | Cons | Performance |
|----------|----------|------|------|-------------|
| **Pre-Fractured Meshes** | Crates, barrels, destructible props | Simple, predictable, polished | Static fracture pattern, high memory | High |
| **CSG Boolean Operations** | Bullet holes, craters, prototype deformation | Dynamic, flexible | Recalculates every frame, ~10 ops max | Medium |
| **Sprite Replacement (2D)** | 2D action games, explosions | Fast, familiar workflow | Limited by art assets | Very High |
| **Image Pixel Erosion (2D)** | Terrain, Worms-style destruction | Fully dynamic, pixel-perfect | Expensive per-pixel ops, not real-time | Low-Medium |
| **Polygon Clipping (2D)** | Geometric shapes, cutting mechanics | Dynamic, clean geometry | CPU-bound for complex shapes | Medium |
| **Runtime Voronoi Fracturing (3D)** | Shattering, crystal breaking, advanced | Infinite variation, realistic | Expensive compute, complex implementation | Low |
| **Voxel/Chunk Destruction** | Terrain, mining games, large-scale deformation | Scalable, efficient chunking | Requires voxel infrastructure | High |

**Recommendation:** Start with pre-fractured meshes for 3D and sprite replacement for 2D. Both ship fast and feel great. Add CSG or image erosion only when gameplay demands dynamic destruction.

---

## Pre-Fractured Mesh Destruction (3D)

The most shipping destruction system. Import a whole mesh and its pre-fractured counterpart from Blender (Cell Fracture addon), then swap from static to dynamic on damage.

### Setup: Importing Fractured Meshes

1. In Blender, apply Cell Fracture to your model (select object → Fracture Cells)
2. Export as `.glb` or `.fbx` with separate object per shard
3. Import to Godot; each shard becomes a MeshInstance3D
4. Blender → Godot adds ConvexPolygonShape3D colliders automatically (ideal for debris)

### GDScript Implementation

```gdscript
# BreakableObject.gd — Pre-fractured destruction with physics
extends StaticBody3D

@export var health: float = 100.0
@export var debris_lifetime: float = 8.0
@export var explosion_force: float = 500.0
@export var max_active_debris: int = 50

var current_health: float
var is_broken: bool = false
var debris_count: int = 0

@onready var whole_mesh = $WholeMesh  # StaticBody3D child
@onready var shards_parent = $ShardsParent  # Node3D (hidden by default)

func _ready():
	current_health = health
	# Hide shards until destroyed
	for shard in shards_parent.get_children():
		shard.visible = false
		shard.gravity_scale = 0.0  # Disable until explosion

func take_damage(amount: float, impact_pos: Vector3):
	if is_broken:
		return
	
	current_health -= amount
	
	if current_health <= 0.0:
		_shatter(impact_pos)

func _shatter(impact_pos: Vector3):
	is_broken = true
	whole_mesh.visible = false
	
	# Enable all shards and apply physics
	for shard in shards_parent.get_children():
		if debris_count >= max_active_debris:
			break
		
		shard.visible = true
		shard.gravity_scale = 1.0
		
		# Random impulse from impact point
		var direction = (shard.global_position - impact_pos).normalized()
		direction.y += 0.3  # Lift slightly
		var force = direction * explosion_force * randf_range(0.8, 1.2)
		
		shard.apply_central_impulse(force)
		shard.apply_torque_impulse(Vector3.ONE.normalized() * randf_range(-50, 50))
		
		# Schedule cleanup
		_schedule_debris_cleanup(shard)
		debris_count += 1
	
	# Optional: emit signal for sounds/particles
	destroyed.emit(global_position)

func _schedule_debris_cleanup(shard: RigidBody3D):
	var tween = create_tween()
	await tween.tween_timer(debris_lifetime - 1.0)  # Fade during last second
	
	tween.set_parallel(true)
	tween.tween_property(shard, "modulate", Color.TRANSPARENT, 1.0)
	await tween.finished
	
	shard.visible = false
	shard.gravity_scale = 0.0
	debris_count -= 1

signal destroyed(pos: Vector3)
```

### C# Implementation

```csharp
// BreakableObject.cs
using Godot;

public partial class BreakableObject : StaticBody3D
{
    [Export] public float Health = 100f;
    [Export] public float DebrisLifetime = 8f;
    [Export] public float ExplosionForce = 500f;
    [Export] public int MaxActiveDebris = 50;

    private float currentHealth;
    private bool isBroken;
    private int debrisCount;

    private MeshInstance3D wholeMesh;
    private Node3D shardsParent;

    [Signal]
    public delegate void DestroyedEventHandler(Vector3 pos);

    public override void _Ready()
    {
        currentHealth = Health;
        wholeMesh = GetNode<MeshInstance3D>("WholeMesh");
        shardsParent = GetNode<Node3D>("ShardsParent");

        foreach (var shard in shardsParent.GetChildren())
        {
            if (shard is RigidBody3D rb)
            {
                rb.Visible = false;
                rb.GravityScale = 0f;
            }
        }
    }

    public void TakeDamage(float amount, Vector3 impactPos)
    {
        if (isBroken) return;

        currentHealth -= amount;
        if (currentHealth <= 0f)
            Shatter(impactPos);
    }

    private void Shatter(Vector3 impactPos)
    {
        isBroken = true;
        wholeMesh.Visible = false;

        foreach (var shard in shardsParent.GetChildren())
        {
            if (debrisCount >= MaxActiveDebris) break;

            if (shard is RigidBody3D rb)
            {
                rb.Visible = true;
                rb.GravityScale = 1f;

                var direction = (rb.GlobalPosition - impactPos).Normalized();
                direction.Y += 0.3f;
                var force = direction * ExplosionForce * GD.Randf() * 1.2f;

                rb.ApplyCentralImpulse(force);
                rb.ApplyTorqueImpulse(Vector3.One.Normalized() * GD.Randf() * 100f - 50f);

                ScheduleDebrisCleanup(rb);
                debrisCount++;
            }
        }

        EmitSignal(SignalName.Destroyed, GlobalPosition);
    }

    private async void ScheduleDebrisCleanup(RigidBody3D shard)
    {
        await Task.Delay((int)(DebrisLifetime - 1f) * 1000);

        var tween = CreateTween();
        tween.SetParallel(true);
        tween.TweenProperty(shard, "modulate", Colors.Transparent, 1f);
        await tween.Finished;

        shard.Visible = false;
        shard.GravityScale = 0f;
        debrisCount--;
    }
}
```

### Key Points

- **Convex Collision:** Each shard uses ConvexPolygonShape3D (auto-calculated from mesh). Fast collision, necessary for many objects.
- **Pooling:** Reuse shard RigidBody3D nodes rather than freeing; toggle visibility and gravity.
- **Impulse Direction:** Always apply force away from impact; add Y bias to prevent flat explosions.
- **Debris Limit:** Cap active debris to prevent physics lag; queue oldest shards for cleanup.

---

## CSG Boolean Destruction

For dynamic deformation without pre-fractured meshes. Useful for bullet holes, craters, or real-time wall carving.

### GDScript Implementation

```gdscript
# CraterMaker.gd — CSG-based impact deformation
extends CSGCombiner3D

@export var crater_radius: float = 2.0
@export var crater_depth: float = 1.0
@export var max_craters: int = 10

var crater_count: int = 0
var craters: Array[CSGSphere3D] = []

func create_crater(impact_pos: Vector3, normal: Vector3):
	if crater_count >= max_craters:
		_remove_oldest_crater()
	
	# Offset impact slightly inward along normal
	var crater_pos = impact_pos - normal * crater_depth * 0.5
	
	# Create subtractive sphere (hole)
	var crater = CSGSphere3D.new()
	crater.radius = crater_radius
	crater.global_position = crater_pos
	crater.operation = CSGShape3D.OPERATION_SUBTRACT
	
	add_child(crater)
	craters.append(crater)
	crater_count += 1
	
	# Rebuild mesh (expensive — only do on damage, not every frame)
	force_update_shape()

func _remove_oldest_crater():
	if craters.is_empty():
		return
	
	var oldest = craters.pop_front()
	oldest.queue_free()
	crater_count -= 1
	force_update_shape()

signal crater_created(pos: Vector3)
```

### C# Implementation

```csharp
// CraterMaker.cs
using Godot;
using System.Collections.Generic;

public partial class CraterMaker : CSGCombiner3D
{
    [Export] public float CraterRadius = 2f;
    [Export] public float CraterDepth = 1f;
    [Export] public int MaxCraters = 10;

    private int craterCount;
    private Queue<CSGSphere3D> craters = new();

    [Signal]
    public delegate void CraterCreatedEventHandler(Vector3 pos);

    public void CreateCrater(Vector3 impactPos, Vector3 normal)
    {
        if (craterCount >= MaxCraters)
            RemoveOldestCrater();

        var craterPos = impactPos - normal * CraterDepth * 0.5f;

        var crater = new CSGSphere3D
        {
            Radius = CraterRadius,
            GlobalPosition = craterPos,
            Operation = CSGShape3D.OperationEnum.Subtract
        };

        AddChild(crater);
        craters.Enqueue(crater);
        craterCount++;

        ForceUpdateShape();
        EmitSignal(SignalName.CraterCreated, impactPos);
    }

    private void RemoveOldestCrater()
    {
        if (craters.Count == 0) return;

        var oldest = craters.Dequeue();
        oldest.QueueFree();
        craterCount--;
        ForceUpdateShape();
    }
}
```

### Performance Warning

CSG recalculates the entire baked mesh when you call `force_update_shape()`. This is expensive:
- **Limit to ~10 active operations** in production
- Batch crater creation (don't call per bullet; accumulate impacts over a frame)
- Use only for walls, floors—not dense debris fields
- Consider pre-baked destructible meshes for frequently-hit surfaces

---

## 2D Sprite Destruction

For 2D games, the sprite swap approach is fast and easy. Replace an intact sprite with broken pieces.

### Sprite Replacement (GDScript)

```gdscript
# BreakableSprite2D.gd — Sprite swap destruction for 2D
extends CharacterBody2D

@export var health: float = 50.0
@export var explosion_force: float = 300.0

var current_health: float
var is_broken: bool = false

@onready var intact_sprite = $IntactSprite  # Sprite2D
@onready var broken_pieces_scene = preload("res://scenes/broken_pieces.tscn")

func _ready():
	current_health = health

func take_damage(amount: float):
	if is_broken:
		return
	
	current_health -= amount
	
	if current_health <= 0.0:
		_break()

func _break():
	is_broken = true
	intact_sprite.visible = false
	
	# Instantiate pre-made broken pieces (RigidBody2D children with Sprite2D)
	var pieces = broken_pieces_scene.instantiate()
	add_child(pieces)
	
	for piece in pieces.get_children():
		if piece is RigidBody2D:
			var direction = Vector2.from_angle(randf() * TAU)
			var force = direction * explosion_force * randf_range(0.8, 1.2)
			piece.apply_central_impulse(force)
			piece.angular_velocity = randf_range(-10, 10)
			
			# Auto-cleanup
			await get_tree().create_timer(4.0).timeout
			piece.queue_free()

signal destroyed
```

### Image-Based Erosion (Worms-Style)

For terrain or large sprite destruction, use pixel manipulation:

```gdscript
# TerrainEraser.gd — Image-based pixel destruction
extends Sprite2D

@export var eraser_radius: float = 20.0
var terrain_image: Image

func _ready():
	terrain_image = texture.get_image()

func erase_at(world_pos: Vector3):
	# Convert world position to texture coordinates
	var local_pos = world_pos - global_position
	var texture_pos = local_pos / scale
	
	# Circular erase with feathering
	for x in range(-int(eraser_radius), int(eraser_radius)):
		for y in range(-int(eraser_radius), int(eraser_radius)):
			var dist = sqrt(x * x + y * y)
			if dist <= eraser_radius:
				var fade = 1.0 - (dist / eraser_radius)  # Feather edges
				var px = int(texture_pos.x) + x
				var py = int(texture_pos.y) + y
				
				if terrain_image.get_rect().has_point(Vector2(px, py)):
					var color = terrain_image.get_pixel(px, py)
					color.a *= (1.0 - fade)  # Reduce alpha
					terrain_image.set_pixel(px, py, color)
	
	# Update texture
	texture.update(terrain_image)
	# Regenerate physics (expensive — batch this)
	_update_collision_shape()
```

---

## Health and Damage System Integration

Connect destruction to a unified damage/health system.

### Damageable Interface (GDScript)

```gdscript
# Damageable.gd — Shared interface for all destructible objects
class_name Damageable
extends Node

signal health_changed(current: float, max: float)
signal died(object: Node)

var health: float
var max_health: float
var damage_types_modifier: Dictionary = {
	"explosive": 1.5,
	"impact": 1.0,
	"thermal": 0.8,
}

func take_damage(amount: float, damage_type: String, impact_pos: Vector3):
	var modified_amount = amount * damage_types_modifier.get(damage_type, 1.0)
	health -= modified_amount
	health_changed.emit(health, max_health)
	
	if health <= 0:
		_on_death(impact_pos)
	else:
		_on_partial_damage(health / max_health)

func _on_death(impact_pos: Vector3):
	died.emit(self.owner)
	# Subclass implements destruction

func _on_partial_damage(health_ratio: float):
	# Cracked state: change material, disable some collision, etc.
	if health_ratio < 0.5:
		# Swap to "cracked" material
		pass
```

### Area-of-Effect Damage

```gdscript
# ExplosionArea.gd — AoE damage propagation
extends Area3D

@export var damage: float = 50.0
@export var damage_type: String = "explosive"
@export var max_distance: float = 30.0

func detonate(origin: Vector3):
	var overlapping = get_overlapping_bodies()
	
	for body in overlapping:
		if body.is_in_group("damageable"):
			var distance = origin.distance_to(body.global_position)
			var falloff = 1.0 - (distance / max_distance)
			falloff = maxf(0.0, falloff)  # Clamp to 0
			
			var adjusted_damage = damage * falloff
			body.take_damage(adjusted_damage, damage_type, origin)
```

---

## Physics Debris Management

The difference between shipping and crashing is debris cleanup.

### Object Pooling for Debris

```gdscript
# DebrisPool.gd — Reuse shard RigidBody3D nodes
extends Node3D

@export var pool_size: int = 100
var debris_pool: Array[RigidBody3D] = []
var active_debris: Array[RigidBody3D] = []

func _ready():
	# Pre-allocate debris
	for i in range(pool_size):
		var debris = preload("res://scenes/debris_shard.tscn").instantiate()
		debris.visible = false
		add_child(debris)
		debris_pool.append(debris)

func spawn_debris(mesh: Mesh, position: Vector3, impulse: Vector3) -> RigidBody3D:
	if debris_pool.is_empty():
		# Safety: return null or cull oldest active
		if active_debris.size() > 0:
			_reclaim_debris(active_debris[0])
	
	var shard = debris_pool.pop_back()
	shard.position = position
	shard.apply_central_impulse(impulse)
	shard.visible = true
	active_debris.append(shard)
	
	# Schedule return to pool
	await get_tree().create_timer(8.0).timeout
	_reclaim_debris(shard)
	
	return shard

func _reclaim_debris(shard: RigidBody3D):
	shard.visible = false
	shard.global_position = Vector3.ZERO  # Reset far away
	shard.linear_velocity = Vector3.ZERO
	shard.angular_velocity = Vector3.ZERO
	active_debris.erase(shard)
	debris_pool.append(shard)
```

### Freeze Settled Debris

```gdscript
# SettledDebrisOptimizer.gd — Stop physics for resting objects
extends RigidBody3D

@export var settle_threshold: float = 0.1  # Velocity before "settled"
@export var settle_time: float = 2.0

var settle_timer: float = 0.0

func _physics_process(delta):
	# Check if velocity is below threshold
	if linear_velocity.length() < settle_threshold:
		settle_timer += delta
		if settle_timer >= settle_time:
			freeze = true  # Stops physics updates
	else:
		settle_timer = 0.0
```

### Maximum Active Debris Cap

```gdscript
# DebrisManager.gd — Global debris limiter
extends Node

@export var max_active_debris: int = 200
var active_debris: Array[RigidBody3D] = []

func register_debris(shard: RigidBody3D):
	active_debris.append(shard)
	
	if active_debris.size() > max_active_debris:
		var oldest = active_debris.pop_front()
		oldest.queue_free()

func cleanup_distant_debris(camera_pos: Vector3, max_distance: float):
	var to_remove = []
	for debris in active_debris:
		if debris.global_position.distance_to(camera_pos) > max_distance:
			to_remove.append(debris)
	
	for debris in to_remove:
		active_debris.erase(debris)
		debris.queue_free()
```

---

## Visual Effects & Polish

Destruction feels alive with sound, particles, and screen shake.

### Impact Particles

```gdscript
# DestructionFX.gd — Particles + sound on destruction
extends Node3D

@export var particle_scene: PackedScene
@export var impact_sound: AudioStream

func play_destruction_fx(impact_pos: Vector3, normal: Vector3, material_type: String):
	# Particles
	var particles = particle_scene.instantiate()
	particles.global_position = impact_pos
	particles.process_material.initial_velocity_min = (normal * 5.0)
	particles.process_material.initial_velocity_max = (normal * 15.0)
	
	# Color by material
	match material_type:
		"wood":
			particles.modulate = Color.BROWN
		"concrete":
			particles.modulate = Color.GRAY
		"metal":
			particles.modulate = Color.WHITE
	
	add_child(particles)
	
	# Sound
	var audio = AudioStreamPlayer3D.new()
	audio.stream = impact_sound
	audio.global_position = impact_pos
	audio.bus = "SFX"
	add_child(audio)
	audio.play()

signal fx_played(pos: Vector3)
```

### Screen Shake on Large Destruction

```gdscript
# CameraShake.gd — Trauma-based screen shake
extends Camera3D

var trauma: float = 0.0
@export var max_shake: float = 0.1
@export var trauma_decay: float = 0.8

func _process(delta):
	if trauma > 0.0:
		trauma = lerpf(trauma, 0.0, trauma_decay * delta)
		var shake = trauma * max_shake
		global_position += Vector3(
			randf_range(-shake, shake),
			randf_range(-shake, shake),
			randf_range(-shake, shake)
		)

func add_trauma(amount: float):
	trauma = minf(trauma + amount, 1.0)
```

---

## Networking Considerations

Syncing destruction across the network requires careful authority design.

### Server-Authoritative Damage

```gdscript
# NetworkBreakableObject.gd — Multiplayer destruction
extends StaticBody3D

@rpc("any_peer", "call_remote", "unreliable")
func request_damage(amount: float, impact_pos: Vector3):
	# Only server applies damage
	if not multiplayer.is_server():
		return
	
	take_damage(amount, impact_pos)
	_broadcast_destruction.rpc(impact_pos)

@rpc("authority", "call_remote", "reliable")
func _broadcast_destruction(impact_pos: Vector3):
	# All clients play destruction
	_shatter(impact_pos)

func take_damage(amount: float, impact_pos: Vector3):
	current_health -= amount
	if current_health <= 0.0:
		_broadcast_destruction.rpc(impact_pos)
```

### Syncing Debris (Option: State vs. Simulation)

**Option A: Sync destroyed state only**
- Server broadcasts "object X is destroyed"
- Each client simulates shards independently (deterministic RNG seeded by ID)
- Bandwidth: 1 message
- Downside: Different clients see different debris positions (acceptable)

**Option B: Sync shard positions**
- Server broadcasts each shard's position + velocity on destruction
- Clients use authority physics
- Bandwidth: N shards × 3 vectors per message
- Better consistency; higher bandwidth cost

**Recommendation:** Option A for most games. Option B for competitive/precise games.

---

## Common Mistakes

1. **Too Many Collision Shapes:** Each shard needs ConvexPolygonShape3D. 50 shards = 50 shapes. Cap this.
   - **Fix:** Use object pooling, limit max debris, freeze settled physics.

2. **Forgetting to Free Debris:** Memory leaks from uncleaned RigidBody3D nodes.
   - **Fix:** Always queue_free() or return to pool; use timers or distance checks.

3. **CSG in Production:** Re-baking CSG every frame for ~10 craters destroys frame rate.
   - **Fix:** Batch updates, limit active operations, use pre-fractured meshes instead.

4. **Not Freezing Settled Debris:** Physics solver still updates frozen objects.
   - **Fix:** Call `freeze = true` after settling time; dramatically reduces CPU cost.

5. **Explosion Forces Too Uniform:** All shards fly the same direction—looks artificial.
   - **Fix:** Add randomness to direction, torque, and magnitude. Add Y lift bias.

6. **No Debris Cleanup Distance:** Off-screen debris still runs physics.
   - **Fix:** Distance-check from camera; cull debris beyond max_distance.

7. **Collision Shapes Don't Match Mesh:** Convex hulls are approximations—shard geometry and collision shape mismatch.
   - **Fix:** Import with ConvexPolygonShape3D; use Mesh → Convex Collision in editor.

8. **Syncing Physics Over Network:** Trying to sync RigidBody3D velocities for every shard.
   - **Fix:** Server-side only; broadcast "destroyed" state, let clients simulate independently.

---

## Summary

Destructible environments are **art + physics + audio + cleanup**. Ship with pre-fractured meshes and sprite swaps—they feel great and perform well. Add dynamic destruction (CSG, image erosion, voronoi) only when gameplay demands it. Always pool debris, cap active objects, and freeze settled physics. Sync destruction events (not debris positions) across the network.

Test destruction heavily: object pools under stress, memory leaks over time, frame rates with 200+ active shards. One unbounded debris spawn and your game tanks.

Good destruction makes players *want* to break things.
