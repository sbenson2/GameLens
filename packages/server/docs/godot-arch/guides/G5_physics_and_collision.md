# G5 — Physics & Collision
> **Category:** Guide · **Engine:** Godot 4.4+ · **Language:** GDScript  
> **Related:** [E1 Architecture Overview](../architecture/E1_architecture_overview.md) · [G1 Scene Composition](./G1_scene_composition.md) · [G4 Input Handling](./G4_input_handling.md) · [Physics Theory](../../core/concepts/physics-theory.md)

---

## What This Guide Covers

Physics and collision are the foundation of every game that has objects interacting in space. This guide covers Godot's physics body types (CharacterBody2D, RigidBody2D, StaticBody2D, Area2D), collision shapes and layers, raycasting, one-way platforms, moving platforms, physics materials, and common patterns for platformers, top-down games, and physics puzzles.

All code targets Godot 4.4+ with typed GDScript. For engine-agnostic collision detection theory (SAT, spatial hashing, swept AABB), see [Physics Theory](../../core/concepts/physics-theory.md).

---

## Physics Body Types — When to Use Each

Godot has four physics body types. Choosing the right one is the first architectural decision for every game object.

| Body Type | Moves Via | Collision Response | Use For |
|-----------|-----------|-------------------|---------|
| `StaticBody2D` | Not at all (or constant velocity) | Blocks other bodies | Walls, floors, platforms |
| `CharacterBody2D` | `move_and_slide()` / `move_and_collide()` | Script-controlled | Players, enemies, NPCs |
| `RigidBody2D` | Physics engine (forces/impulses) | Automatic | Crates, projectiles, ragdolls |
| `Area2D` | Manual (`position +=`) | No response (overlap detection only) | Triggers, hitboxes, pickups |

**Decision tree:**
```
Does it move?
├── No → StaticBody2D
└── Yes → Do YOU control movement, or does PHYSICS?
    ├── I control it → CharacterBody2D
    └── Physics controls it → RigidBody2D

Does it detect overlaps without blocking?
└── Yes → Area2D
```

---

## Collision Shapes

Every physics body needs at least one `CollisionShape2D` child. No shape = no collisions.

### Shape Types

```gdscript
# Rectangle — most common, cheapest to check
var rect := RectangleShape2D.new()
rect.size = Vector2(32.0, 48.0)

# Circle — fast, good for projectiles and items
var circle := CircleShape2D.new()
circle.radius = 16.0

# Capsule — characters, vertical or horizontal
var capsule := CapsuleShape2D.new()
capsule.radius = 12.0
capsule.height = 40.0

# Segment — thin lines, lasers, one-way ledges
var segment := SegmentShape2D.new()
segment.a = Vector2(-20.0, 0.0)
segment.b = Vector2(20.0, 0.0)

# Convex polygon — custom shapes (must be convex)
var poly := ConvexPolygonShape2D.new()
poly.points = PackedVector2Array([
    Vector2(-16, -16), Vector2(16, -16),
    Vector2(16, 16), Vector2(-16, 16)
])

# Concave polygon — complex static geometry only
# WARNING: Only works with StaticBody2D. Very expensive.
var concave := ConcavePolygonShape2D.new()
concave.segments = PackedVector2Array([...])
```

### Shape Performance (cheapest to most expensive)

1. `CircleShape2D` — single distance check
2. `RectangleShape2D` — two axis checks
3. `CapsuleShape2D` — slight overhead vs rectangle
4. `ConvexPolygonShape2D` — SAT, scales with vertex count
5. `ConcavePolygonShape2D` — decomposed into segments, static only

**Rule:** Use the simplest shape that approximates your sprite. A 64×64 character doesn't need pixel-perfect collision — a capsule works fine and is 10× cheaper than a polygon.

### Compound Shapes

For complex bodies, use multiple `CollisionShape2D` children:

```
CharacterBody2D
├── CollisionShape2D    ← Main body (capsule)
├── CollisionShape2D    ← Head (circle, different layer for headshots)
└── Area2D              ← Interaction range
    └── CollisionShape2D
```

---

## Collision Layers and Masks

Godot uses a 32-bit layer/mask system to control what collides with what.

- **Layer** = "I exist on these layers" (what I AM)
- **Mask** = "I check for collisions on these layers" (what I SEE)

Collision happens when A's **mask** includes B's **layer** OR B's **mask** includes A's **layer**.

### Recommended Layer Setup

| Bit | Name | Used By |
|-----|------|---------|
| 1 | World | Walls, floors, platforms |
| 2 | Player | Player body |
| 3 | Enemy | Enemy bodies |
| 4 | PlayerHurtbox | Player's damage-receiving area |
| 5 | EnemyHurtbox | Enemy's damage-receiving area |
| 6 | PlayerHitbox | Player's attack area |
| 7 | EnemyHitbox | Enemy's attack area |
| 8 | Pickup | Collectibles, items |
| 9 | Trigger | Zone triggers, checkpoints |
| 10 | Projectile | Bullets, arrows |

Name your layers in **Project → Project Settings → Layer Names → 2D Physics**. Named layers make the inspector readable.

### Setting Layers in Code

```gdscript
extends CharacterBody2D

func _ready() -> void:
    # Set this body on layer 2 (Player)
    collision_layer = 1 << 1  # bit 2

    # Check for collisions on layers 1 (World) and 3 (Enemy)
    collision_mask = (1 << 0) | (1 << 2)  # bits 1 and 3


# Helper functions for readable layer management
func set_layer_bit(layer: int, enabled: bool) -> void:
    if enabled:
        collision_layer |= 1 << (layer - 1)
    else:
        collision_layer &= ~(1 << (layer - 1))


func set_mask_bit(layer: int, enabled: bool) -> void:
    if enabled:
        collision_mask |= 1 << (layer - 1)
    else:
        collision_mask &= ~(1 << (layer - 1))
```

### Hitbox/Hurtbox Layer Pattern

```gdscript
# player_hitbox.gd — attached to the player's attack Area2D
extends Area2D

func _ready() -> void:
    collision_layer = 1 << 5   # PlayerHitbox layer (bit 6)
    collision_mask = 1 << 4    # Sees EnemyHurtbox (bit 5)
    monitoring = false         # Off by default, enabled during attacks


# enemy_hurtbox.gd — attached to the enemy's damage Area2D
extends Area2D

func _ready() -> void:
    collision_layer = 1 << 4   # EnemyHurtbox layer (bit 5)
    collision_mask = 0         # Doesn't check anything — passive receiver
```

The player's hitbox **monitors** the enemy's hurtbox. The hurtbox just sits there. This is a one-directional check — cheaper and clearer than mutual monitoring.

---

## CharacterBody2D — Kinematic Movement

`CharacterBody2D` is the workhorse for player characters and enemies. You control it entirely through code — the physics engine handles collision resolution but not movement decisions.

### Core API

```gdscript
extends CharacterBody2D

@export var speed: float = 200.0
@export var gravity: float = 980.0
@export var jump_velocity: float = -350.0

func _physics_process(delta: float) -> void:
    # Apply gravity
    if not is_on_floor():
        velocity.y += gravity * delta

    # Jump
    if Input.is_action_just_pressed("jump") and is_on_floor():
        velocity.y = jump_velocity

    # Horizontal movement
    var direction: float = Input.get_axis("move_left", "move_right")
    velocity.x = direction * speed

    move_and_slide()
```

**Key points about `move_and_slide()`:**
- Uses the built-in `velocity` property — no return value, no arguments (Godot 3 passed velocity as a parameter)
- Automatically detects floors, walls, and ceilings based on `up_direction` (default: `Vector2.UP`)
- Slides along surfaces instead of stopping dead
- Handles slopes automatically up to `floor_max_angle` (default: 45°)

### move_and_slide() vs move_and_collide()

| Method | Behavior | Use When |
|--------|----------|----------|
| `move_and_slide()` | Slides along surfaces, auto-detects floor/wall/ceiling | Characters walking/running |
| `move_and_collide()` | Stops at collision, returns `KinematicCollision2D` | Projectiles, physics puzzles, custom resolution |

```gdscript
# move_and_collide returns collision info (or null if no collision)
func _physics_process(delta: float) -> void:
    var collision: KinematicCollision2D = move_and_collide(velocity * delta)
    if collision:
        var collider: Node = collision.get_collider()
        var normal: Vector2 = collision.get_normal()
        var position: Vector2 = collision.get_position()

        # Bounce
        velocity = velocity.bounce(normal) * 0.8
```

### Floor Detection Properties

```gdscript
extends CharacterBody2D

func _ready() -> void:
    # The "up" direction — determines what counts as floor vs wall vs ceiling
    up_direction = Vector2.UP  # default

    # Maximum slope angle (radians) the body can walk up
    floor_max_angle = deg_to_rad(46.0)  # slightly over 45° to handle imprecision

    # Snap to floor — prevents bouncing off slopes at speed
    floor_snap_length = 8.0  # pixels to snap down to floor

    # Stop on slopes — prevents sliding down when standing still
    floor_stop_on_slope = true

    # Constant speed on slopes — no speed increase going downhill
    floor_constant_speed = true

    # Block on wall — stop horizontal movement when hitting a wall
    floor_block_on_wall = true

    # Moving platform behavior
    platform_floor_layers = 0xFFFFFFFF  # which layers count as platforms
    platform_wall_layers = 0            # which layers count as moving walls
    platform_on_leave = PlatformOnLeave.ADD_VELOCITY  # inherit platform velocity
```

### Accessing Collision Data After move_and_slide()

```gdscript
func _physics_process(delta: float) -> void:
    move_and_slide()

    # Check all collisions from this frame
    for i: int in get_slide_collision_count():
        var collision: KinematicCollision2D = get_slide_collision(i)
        var collider: Node = collision.get_collider()
        var normal: Vector2 = collision.get_normal()

        # Hit a ceiling?
        if normal.dot(Vector2.DOWN) > 0.9:
            velocity.y = 0.0  # stop upward movement

        # Landed on something?
        if normal.dot(Vector2.UP) > 0.9:
            _on_landed(collider)

    # Convenience checks
    if is_on_floor():
        pass  # standing on something
    if is_on_wall():
        pass  # touching a wall
    if is_on_ceiling():
        pass  # head hit something
```

### Platformer Character (Complete)

```gdscript
# player.gd
class_name Player
extends CharacterBody2D

## Movement
@export var move_speed: float = 200.0
@export var acceleration: float = 1200.0
@export var friction: float = 1600.0

## Jumping
@export var jump_velocity: float = -360.0
@export var gravity: float = 980.0
@export var fall_gravity_multiplier: float = 1.5
@export var max_fall_speed: float = 600.0
@export var coyote_time: float = 0.1
@export var jump_buffer_time: float = 0.1

## State
var _coyote_timer: float = 0.0
var _jump_buffer_timer: float = 0.0
var _was_on_floor: bool = false
var _facing: int = 1

@onready var sprite: Sprite2D = $Sprite2D
@onready var anim: AnimationPlayer = $AnimationPlayer


func _physics_process(delta: float) -> void:
    _apply_gravity(delta)
    _update_timers(delta)
    _handle_jump()
    _handle_movement(delta)
    move_and_slide()
    _update_animation()


func _apply_gravity(delta: float) -> void:
    if not is_on_floor():
        # Heavier gravity when falling — snappier jump arc
        var gravity_scale: float = fall_gravity_multiplier if velocity.y > 0.0 else 1.0
        velocity.y += gravity * gravity_scale * delta
        velocity.y = minf(velocity.y, max_fall_speed)


func _update_timers(delta: float) -> void:
    # Coyote time: allow jump briefly after leaving the floor
    if is_on_floor():
        _coyote_timer = coyote_time
    elif _was_on_floor:
        # Just left the floor — start counting
        _coyote_timer = coyote_time

    _coyote_timer -= delta
    _was_on_floor = is_on_floor()

    # Jump buffer: remember jump input for when we land
    if Input.is_action_just_pressed("jump"):
        _jump_buffer_timer = jump_buffer_time
    _jump_buffer_timer -= delta


func _handle_jump() -> void:
    var can_jump: bool = is_on_floor() or _coyote_timer > 0.0
    var wants_jump: bool = Input.is_action_just_pressed("jump") or _jump_buffer_timer > 0.0

    if can_jump and wants_jump:
        velocity.y = jump_velocity
        _coyote_timer = 0.0
        _jump_buffer_timer = 0.0

    # Variable jump height: release early for a short hop
    if Input.is_action_just_released("jump") and velocity.y < 0.0:
        velocity.y *= 0.5


func _handle_movement(delta: float) -> void:
    var input_dir: float = Input.get_axis("move_left", "move_right")

    if absf(input_dir) > 0.0:
        # Accelerate toward target speed
        velocity.x = move_toward(velocity.x, input_dir * move_speed, acceleration * delta)
        _facing = signi(roundi(input_dir))
        sprite.flip_h = _facing < 0
    else:
        # Apply friction to decelerate
        velocity.x = move_toward(velocity.x, 0.0, friction * delta)


func _update_animation() -> void:
    if not is_on_floor():
        anim.play("jump" if velocity.y < 0.0 else "fall")
    elif absf(velocity.x) > 10.0:
        anim.play("run")
    else:
        anim.play("idle")
```

### Top-Down Character

```gdscript
# top_down_character.gd
class_name TopDownCharacter
extends CharacterBody2D

@export var speed: float = 160.0
@export var acceleration: float = 1000.0
@export var friction: float = 1200.0

@onready var sprite: Sprite2D = $Sprite2D


func _physics_process(delta: float) -> void:
    var input_dir: Vector2 = Input.get_vector(
        "move_left", "move_right", "move_up", "move_down"
    )

    if input_dir.length_squared() > 0.0:
        # Normalize to prevent diagonal speed boost
        input_dir = input_dir.normalized()
        velocity = velocity.move_toward(input_dir * speed, acceleration * delta)

        # Face movement direction
        sprite.flip_h = input_dir.x < 0.0
    else:
        velocity = velocity.move_toward(Vector2.ZERO, friction * delta)

    move_and_slide()
```

---

## RigidBody2D — Physics-Driven Objects

`RigidBody2D` is fully simulated by the physics engine. You influence it with forces and impulses — you don't set position or velocity directly (unless you use `_integrate_forces`).

### Force vs Impulse

```gdscript
extends RigidBody2D

func _ready() -> void:
    # Continuous force — applied every physics frame (like a thruster)
    apply_force(Vector2(100.0, 0.0))

    # Central impulse — instant velocity change (like a bullet hit)
    apply_central_impulse(Vector2(0.0, -500.0))

    # Impulse at a point — adds torque (spin)
    apply_impulse(Vector2(200.0, -100.0), Vector2(0.0, -16.0))

    # Torque — rotational force
    apply_torque(50.0)
```

### Freeze Modes

```gdscript
extends RigidBody2D

func _ready() -> void:
    # STATIC — acts like a StaticBody2D (no movement, still collides)
    freeze = true
    freeze_mode = RigidBody2D.FREEZE_MODE_STATIC

    # KINEMATIC — acts like a CharacterBody2D (script moves it)
    freeze = true
    freeze_mode = RigidBody2D.FREEZE_MODE_KINEMATIC
```

Use `FREEZE_MODE_STATIC` for sleeping objects (e.g., crates that activate when the player touches them).

### Physics Material

```gdscript
extends RigidBody2D

func _ready() -> void:
    var mat := PhysicsMaterial.new()
    mat.bounce = 0.6     # 0.0 = no bounce, 1.0 = perfect bounce
    mat.friction = 0.3   # 0.0 = ice, 1.0 = rubber
    mat.rough = false    # true = use max friction of contact pair
    mat.absorbent = false  # true = use min bounce of contact pair
    physics_material_override = mat
```

### Custom Integration

When you need full control over a `RigidBody2D`:

```gdscript
extends RigidBody2D

func _ready() -> void:
    # Enable custom integration — Godot won't apply default forces
    custom_integrator = true


func _integrate_forces(state: PhysicsDirectBodyState2D) -> void:
    # Apply gravity manually
    state.linear_velocity.y += 980.0 * state.step

    # Cap speed
    if state.linear_velocity.length() > 500.0:
        state.linear_velocity = state.linear_velocity.normalized() * 500.0

    # Read contacts
    for i: int in state.get_contact_count():
        var contact_pos: Vector2 = state.get_contact_local_position(i)
        var contact_normal: Vector2 = state.get_contact_local_normal(i)
        var collider: Object = state.get_contact_collider_object(i)
```

### Breakable Crate Example

```gdscript
# breakable_crate.gd
class_name BreakableCrate
extends RigidBody2D

@export var break_impulse_threshold: float = 300.0
@export var debris_scene: PackedScene

var _broken: bool = false


func _ready() -> void:
    contact_monitor = true  # Required to receive body_entered
    max_contacts_reported = 4


func _on_body_entered(body: Node) -> void:
    if _broken:
        return

    # Check impact force
    var impact: float = linear_velocity.length() * mass
    if impact >= break_impulse_threshold:
        _break()


func _break() -> void:
    _broken = true

    # Spawn debris
    for i: int in 4:
        var debris: RigidBody2D = debris_scene.instantiate()
        debris.global_position = global_position
        debris.apply_central_impulse(Vector2(
            randf_range(-150.0, 150.0),
            randf_range(-200.0, -50.0)
        ))
        get_parent().add_child(debris)

    queue_free()
```

---

## Area2D — Overlap Detection

`Area2D` detects overlaps without physical collision response. It's the backbone of hitbox/hurtbox systems, pickup items, zone triggers, and damage fields.

### Signals

```gdscript
extends Area2D

func _ready() -> void:
    # Body signals — detect physics bodies (Static, Kinematic, Rigid)
    body_entered.connect(_on_body_entered)
    body_exited.connect(_on_body_exited)

    # Area signals — detect other Area2D nodes
    area_entered.connect(_on_area_entered)
    area_exited.connect(_on_area_exited)


func _on_body_entered(body: Node2D) -> void:
    if body is Player:
        print("Player entered zone")


func _on_area_entered(area: Area2D) -> void:
    if area.is_in_group("hitbox"):
        _take_damage(area)
```

### Monitoring vs Monitorable

| Property | Meaning | Default |
|----------|---------|---------|
| `monitoring` | This area actively checks for overlaps | `true` |
| `monitorable` | Other areas can detect this area | `true` |

**Performance pattern:** Set `monitoring = false` on passive objects (hurtboxes, pickup items). Only the active checker (hitbox, player detector) needs `monitoring = true`.

### Pickup Item

```gdscript
# pickup.gd
class_name Pickup
extends Area2D

enum Type { COIN, HEALTH, KEY }

@export var type: Type = Type.COIN
@export var value: int = 1
@export var bob_amplitude: float = 4.0
@export var bob_speed: float = 3.0

var _base_y: float
var _collected: bool = false

@onready var sprite: Sprite2D = $Sprite2D


func _ready() -> void:
    _base_y = position.y
    monitoring = false    # Passive — player detects us
    monitorable = true
    collision_layer = 1 << 7  # Pickup layer (bit 8)
    collision_mask = 0


func _process(delta: float) -> void:
    # Gentle bobbing
    position.y = _base_y + sin(Time.get_ticks_msec() * 0.001 * bob_speed) * bob_amplitude


func collect(collector: Node2D) -> void:
    if _collected:
        return
    _collected = true

    # Tween: scale up + fade out
    var tween: Tween = create_tween()
    tween.set_parallel(true)
    tween.tween_property(sprite, "scale", Vector2(1.5, 1.5), 0.2)
    tween.tween_property(sprite, "modulate:a", 0.0, 0.2)
    tween.chain().tween_callback(queue_free)
```

### Damage Zone (Continuous Damage)

```gdscript
# damage_zone.gd
class_name DamageZone
extends Area2D

@export var damage_per_second: float = 20.0
@export var damage_interval: float = 0.5

var _bodies_inside: Dictionary = {}  # Node → Timer
var _interval_timer: float = 0.0


func _ready() -> void:
    body_entered.connect(_on_body_entered)
    body_exited.connect(_on_body_exited)


func _physics_process(delta: float) -> void:
    _interval_timer += delta
    if _interval_timer >= damage_interval:
        _interval_timer -= damage_interval
        for body: Node2D in _bodies_inside:
            if body.has_method("take_damage"):
                body.take_damage(damage_per_second * damage_interval)


func _on_body_entered(body: Node2D) -> void:
    if body.has_method("take_damage"):
        _bodies_inside[body] = true
        body.take_damage(damage_per_second * damage_interval)


func _on_body_exited(body: Node2D) -> void:
    _bodies_inside.erase(body)
```

---

## Raycasting

### RayCast2D Node

For persistent rays that check every physics frame:

```gdscript
# ground_checker.gd — detect ground ahead (for enemy AI walking on platforms)
extends CharacterBody2D

@onready var ground_check: RayCast2D = $GroundCheck
@onready var wall_check: RayCast2D = $WallCheck


func _physics_process(delta: float) -> void:
    # Ground check points down and slightly ahead
    ground_check.target_position = Vector2(_facing * 20.0, 24.0)

    if not ground_check.is_colliding():
        _turn_around()

    if wall_check.is_colliding():
        _turn_around()


func _turn_around() -> void:
    _facing *= -1
    $Sprite2D.flip_h = _facing < 0
```

### Direct Space Queries (One-Shot Raycasts)

For raycasts you don't need every frame:

```gdscript
func _cast_ray(from: Vector2, to: Vector2) -> Dictionary:
    var space: PhysicsDirectSpaceState2D = get_world_2d().direct_space_state
    var query := PhysicsRayQueryParameters2D.create(from, to)

    # Configure what to hit
    query.collision_mask = (1 << 0) | (1 << 2)  # World + Enemy
    query.collide_with_areas = false
    query.collide_with_bodies = true
    query.exclude = [self]  # Don't hit yourself

    var result: Dictionary = space.intersect_ray(query)
    # result is empty dict if nothing hit, or:
    # { "position": Vector2, "normal": Vector2, "collider": Object,
    #   "collider_id": int, "rid": RID, "shape": int }
    return result


func _line_of_sight(target: Node2D) -> bool:
    var result: Dictionary = _cast_ray(global_position, target.global_position)
    if result.is_empty():
        return true  # Nothing in the way
    return result["collider"] == target  # Hit the target directly
```

### Shape Queries (Area Checks)

```gdscript
# Check for bodies in a circle — useful for explosions, AOE
func _get_bodies_in_radius(center: Vector2, radius: float) -> Array[Dictionary]:
    var space: PhysicsDirectSpaceState2D = get_world_2d().direct_space_state

    var shape := CircleShape2D.new()
    shape.radius = radius

    var params := PhysicsShapeQueryParameters2D.new()
    params.shape = shape
    params.transform = Transform2D(0.0, center)
    params.collision_mask = (1 << 1) | (1 << 2)  # Player + Enemy
    params.collide_with_bodies = true
    params.collide_with_areas = false

    return space.intersect_shape(params, 32)  # max 32 results


# Explosion damage with falloff
func _explode(center: Vector2, radius: float, max_damage: float) -> void:
    var hits: Array[Dictionary] = _get_bodies_in_radius(center, radius)
    for hit: Dictionary in hits:
        var body: Node2D = hit["collider"]
        if body.has_method("take_damage"):
            var dist: float = center.distance_to(body.global_position)
            var falloff: float = 1.0 - (dist / radius)
            body.take_damage(max_damage * maxf(falloff, 0.0))
```

---

## One-Way Platforms

Godot has built-in one-way collision support — no code required for basic cases.

### Inspector Setup

On the platform's `CollisionShape2D`:
1. Enable **One Way Collision** ✓
2. Set **One Way Collision Margin** to 4–8 pixels (prevents jittering at edges)

The body can pass through from below and stand on top.

### Drop-Through

```gdscript
# player.gd — addition for one-way platform drop-through
@export var drop_through_time: float = 0.2

var _drop_through_timer: float = 0.0


func _physics_process(delta: float) -> void:
    _handle_drop_through(delta)
    # ... rest of physics


func _handle_drop_through(delta: float) -> void:
    _drop_through_timer -= delta

    if _drop_through_timer > 0.0:
        # Temporarily disable platform collision
        set_collision_mask_value(1, false)  # layer 1 = World
    else:
        set_collision_mask_value(1, true)

    # Down + Jump to drop through
    if is_on_floor() and Input.is_action_pressed("move_down"):
        if Input.is_action_just_pressed("jump"):
            _drop_through_timer = drop_through_time
            position.y += 2.0  # nudge below platform surface
```

---

## Moving Platforms

### AnimatableBody2D (Preferred)

`AnimatableBody2D` is the correct node for moving platforms. It inherits from `StaticBody2D` but supports scripted movement that properly carries riders.

```gdscript
# moving_platform.gd
class_name MovingPlatform
extends AnimatableBody2D

@export var waypoints: Array[Vector2] = [Vector2.ZERO, Vector2(0.0, -128.0)]
@export var speed: float = 60.0
@export var wait_time: float = 1.0

var _current_waypoint: int = 0
var _waiting: bool = false
var _wait_timer: float = 0.0
var _start_position: Vector2


func _ready() -> void:
    _start_position = global_position
    sync_to_physics = true  # Smooth movement synced with physics


func _physics_process(delta: float) -> void:
    if _waiting:
        _wait_timer -= delta
        if _wait_timer <= 0.0:
            _waiting = false
            _current_waypoint = (_current_waypoint + 1) % waypoints.size()
        return

    var target: Vector2 = _start_position + waypoints[_current_waypoint]
    var direction: Vector2 = (target - global_position).normalized()
    var distance: float = global_position.distance_to(target)
    var move_distance: float = speed * delta

    if move_distance >= distance:
        global_position = target
        _waiting = true
        _wait_timer = wait_time
    else:
        global_position += direction * move_distance
```

### Platform On Leave Behavior

On `CharacterBody2D`, set `platform_on_leave` to control what happens when the player walks off a moving platform:

```gdscript
# In player.gd _ready():
platform_on_leave = PlatformOnLeave.ADD_VELOCITY
# Options:
# ADD_VELOCITY — inherit platform velocity (feels natural)
# ADD_UPWARD_VELOCITY — only inherit upward velocity (for elevators)
# DO_NOTHING — no velocity inheritance (feels stiff)
```

---

## Physics Layers in Practice — Full Setup

A complete example showing how collision layers work together in a typical game:

```gdscript
# collision_setup.gd — autoload that documents your collision architecture
class_name CollisionSetup
extends Node

## Layer constants for readability
const LAYER_WORLD: int = 1
const LAYER_PLAYER: int = 2
const LAYER_ENEMY: int = 3
const LAYER_PLAYER_HURTBOX: int = 4
const LAYER_ENEMY_HURTBOX: int = 5
const LAYER_PLAYER_HITBOX: int = 6
const LAYER_ENEMY_HITBOX: int = 7
const LAYER_PICKUP: int = 8
const LAYER_TRIGGER: int = 9
const LAYER_PROJECTILE: int = 10

## Expected collision matrix:
## Player body → sees World, Enemy
## Enemy body → sees World, Player
## Player hitbox → sees Enemy hurtbox
## Enemy hitbox → sees Player hurtbox
## Player projectile → sees World, Enemy hurtbox
## Pickup → monitorable only, Player area detects it

static func layer_bit(layer: int) -> int:
    return 1 << (layer - 1)

static func layers_mask(layers: Array[int]) -> int:
    var mask: int = 0
    for layer: int in layers:
        mask |= 1 << (layer - 1)
    return mask
```

---

## Common Mistakes

### 1. No CollisionShape2D

```
# WRONG — body has no shape, collisions silently don't work
CharacterBody2D
├── Sprite2D
└── AnimationPlayer

# RIGHT
CharacterBody2D
├── Sprite2D
├── CollisionShape2D   ← Required!
└── AnimationPlayer
```

Godot shows a warning icon (⚠️) in the scene tree when a physics body has no shape.

### 2. Scaling CollisionShape2D

```gdscript
# WRONG — scaling collision shapes causes physics engine issues
$CollisionShape2D.scale = Vector2(2.0, 2.0)

# RIGHT — change the shape's size properties
var shape: RectangleShape2D = $CollisionShape2D.shape
shape.size = Vector2(64.0, 64.0)
```

Never scale a `CollisionShape2D` node. Always resize the shape resource directly. Scaling causes inconsistent behavior and physics engine warnings.

### 3. Moving RigidBody2D with position

```gdscript
# WRONG — breaks physics simulation
rigid_body.position = Vector2(100.0, 200.0)
rigid_body.global_position = target

# RIGHT — use forces or impulses
rigid_body.apply_central_impulse(direction * force)

# Or teleport safely inside _integrate_forces:
func _integrate_forces(state: PhysicsDirectBodyState2D) -> void:
    state.transform = Transform2D(0.0, Vector2(100.0, 200.0))
```

### 4. Querying Physics in _process

```gdscript
# WRONG — physics state isn't reliable in _process
func _process(delta: float) -> void:
    if is_on_floor():  # May be stale
        jump()

# RIGHT — all physics queries in _physics_process
func _physics_process(delta: float) -> void:
    if is_on_floor():  # Accurate, just updated
        jump()
```

### 5. Forgetting Exclude Self in Raycasts

```gdscript
# WRONG — ray hits the caster's own collision shape
var result: Dictionary = space.intersect_ray(query)

# RIGHT — exclude yourself
query.exclude = [get_rid()]
```

### 6. Area2D body_entered Not Firing

Checklist:
- ✅ `monitoring = true` on the detecting Area2D
- ✅ `monitorable = true` on the detected body's layer (default is true)
- ✅ The Area2D's **mask** includes the body's **layer**
- ✅ Both nodes have `CollisionShape2D` children with shapes assigned
- ✅ Signal is connected (via editor or `area.body_entered.connect(...)`)

### 7. Using ConcavePolygonShape2D for Moving Bodies

```gdscript
# WRONG — concave shapes only work on StaticBody2D
var rigid := RigidBody2D.new()
var shape := ConcavePolygonShape2D.new()  # Will NOT work

# RIGHT — decompose into convex shapes, or use ConvexPolygonShape2D
var convex := ConvexPolygonShape2D.new()
```

---

## Performance Considerations

### Collision Shape Costs

- Fewer shapes = faster broadphase. Combine shapes when possible.
- `CircleShape2D` is fastest. Use for projectiles and particles.
- Disable `CollisionShape2D` when not needed: `$CollisionShape2D.set_deferred("disabled", true)`
  - **Must use `set_deferred`** — disabling during a physics callback crashes.

### Sleeping Bodies

`RigidBody2D` nodes automatically sleep when they stop moving. Sleeping bodies cost nearly zero CPU. Don't wake them unnecessarily:

```gdscript
# Let the engine manage sleeping (default behavior)
can_sleep = true  # default

# Force awake only when needed
sleeping = false
```

### Reducing Physics Checks

```gdscript
# Disable monitoring on areas that don't need continuous detection
area.monitoring = false

# Use collision layers to prevent unnecessary checks
# A pickup item should only be detectable by the player — not by enemies, walls, or other pickups

# Reduce max_contacts_reported on RigidBody2D
# Default is 0 (no contact reporting). Only set > 0 if you need body_entered signals.
```

### Physics Tick Rate

Default is 60 Hz (set in Project Settings → Physics → Common → Physics Ticks Per Second). Lower it to 30 for less demanding games, increase to 120 for precision-critical games (fighting, rhythm).

```
# Project Settings
physics/common/physics_ticks_per_second = 60  # default
physics/common/max_physics_steps_per_frame = 8  # spiral of death prevention
```

---

## Tuning Reference Tables

### Platformer Physics

| Parameter | Tight (Celeste) | Standard (Mario) | Floaty (Kirby) |
|-----------|-----------------|-------------------|-----------------|
| Gravity | 1400 | 980 | 600 |
| Jump velocity | -420 | -350 | -280 |
| Move speed | 250 | 200 | 150 |
| Acceleration | 2000 | 1200 | 600 |
| Friction | 2400 | 1600 | 800 |
| Fall multiplier | 2.0 | 1.5 | 1.0 |
| Max fall speed | 800 | 600 | 400 |
| Coyote time | 0.12s | 0.10s | 0.08s |
| Jump buffer | 0.10s | 0.08s | 0.06s |

### Top-Down Movement

| Parameter | Fast (Hotline Miami) | Standard (Zelda) | Slow (Stardew) |
|-----------|---------------------|-------------------|-----------------|
| Speed | 250 | 160 | 100 |
| Acceleration | 2000 | 1000 | 600 |
| Friction | 2500 | 1200 | 800 |

### RigidBody2D Materials

| Surface | Bounce | Friction |
|---------|--------|----------|
| Rubber ball | 0.8 | 0.9 |
| Wooden crate | 0.1 | 0.5 |
| Ice | 0.05 | 0.02 |
| Metal | 0.3 | 0.4 |
| Bouncy ball | 1.0 | 0.3 |

---

## Related Guides

- [Physics Theory](../../core/concepts/physics-theory.md) — Engine-agnostic collision detection theory (SAT, spatial hashing, CCD)
- [G1 Scene Composition](./G1_scene_composition.md) — How to structure physics bodies as composed scenes
- [G2 State Machine](./G2_state_machine.md) — Character states that depend on floor/wall detection
- [G3 Signal Architecture](./G3_signal_architecture.md) — Signals for Area2D enter/exit events
- [G4 Input Handling](./G4_input_handling.md) — Input patterns that feed into physics movement
- [E1 Architecture Overview](../architecture/E1_architecture_overview.md) — Where physics bodies fit in Godot's node architecture

---

*All code targets Godot 4.4+ with typed GDScript. For CharacterBody3D and 3D physics equivalents, the same patterns apply with 3D-suffixed node types.*
