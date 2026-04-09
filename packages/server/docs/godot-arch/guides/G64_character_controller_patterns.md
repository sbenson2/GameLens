# G64 — Character Controller Patterns

> **Category:** Guide · **Engine:** Godot 4.4+ · **Language:** GDScript / C#
> **Related:** [G4 Input Handling](./G4_input_handling.md) · [G5 Physics & Collision](./G5_physics_and_collision.md) · [G6 Camera Systems](./G6_camera_systems.md) · [G2 State Machine](./G2_state_machine.md) · [G38 Game Feel & Juice](./G38_game_feel_and_juice.md)

---

## What This Guide Covers

Character controllers are the most-written and most-rewritten code in any game. Godot provides `CharacterBody2D` and `CharacterBody3D` — kinematic bodies that give you full control over movement while handling collision response through `move_and_slide()`. This guide covers the complete API surface, then builds four production-ready controller patterns: 2D platformer, 2D top-down, 3D first-person, and 3D third-person.

**Use CharacterBody when:** the player (or NPCs) need responsive, code-driven movement with slope handling, one-way platforms, or gravity you control directly.

**Use RigidBody instead when:** you want physics-driven movement (ragdolls, vehicles, rolling balls) where the engine handles forces and collisions.

---

## Table of Contents

1. [CharacterBody API Overview](#1-characterbody-api-overview)
2. [Motion Modes — Grounded vs Floating](#2-motion-modes--grounded-vs-floating)
3. [Key Properties Explained](#3-key-properties-explained)
4. [2D Platformer Controller](#4-2d-platformer-controller)
5. [2D Top-Down Controller](#5-2d-top-down-controller)
6. [3D First-Person Controller](#6-3d-first-person-controller)
7. [3D Third-Person Controller](#7-3d-third-person-controller)
8. [Coyote Time and Input Buffering](#8-coyote-time-and-input-buffering)
9. [Slopes, Stairs, and Edge Cases](#9-slopes-stairs-and-edge-cases)
10. [C# Equivalents](#10-c-equivalents)
11. [Common Mistakes](#11-common-mistakes)

---

## 1. CharacterBody API Overview

Both `CharacterBody2D` and `CharacterBody3D` share the same core API. You set `velocity`, call `move_and_slide()`, then query collision state.

### The Move Loop

```gdscript
# Every CharacterBody follows this pattern:
func _physics_process(delta: float) -> void:
    # 1. Calculate desired velocity (gravity, input, etc.)
    velocity.y += gravity * delta
    var direction := Input.get_axis("move_left", "move_right")
    velocity.x = direction * speed

    # 2. Move — engine handles collision response
    move_and_slide()

    # 3. Query collision state for game logic
    if is_on_floor():
        can_jump = true
```

### Core Methods

| Method | Returns | Purpose |
|--------|---------|---------|
| `move_and_slide()` | `bool` | Move using `velocity`, slide along collisions. Returns `true` if any collision occurred. |
| `is_on_floor()` | `bool` | Touching a surface facing opposite to `up_direction` |
| `is_on_wall()` | `bool` | Touching a surface perpendicular to `up_direction` |
| `is_on_ceiling()` | `bool` | Touching a surface facing same direction as `up_direction` |
| `get_floor_normal()` | `Vector2/3` | Normal of the floor surface (only valid when `is_on_floor()`) |
| `get_wall_normal()` | `Vector2/3` | Normal of the wall surface (only valid when `is_on_wall()`) |
| `get_slide_collision_count()` | `int` | Number of collisions from last `move_and_slide()` |
| `get_slide_collision(idx)` | `KinematicCollision` | Collision data at index (body, normal, position, etc.) |
| `get_real_velocity()` | `Vector2/3` | Actual velocity after `move_and_slide()` (differs from `velocity` if collisions occurred) |
| `get_last_motion()` | `Vector2/3` | Actual motion applied during the last call |
| `get_platform_velocity()` | `Vector2/3` | Velocity of the platform the body is standing on |
| `apply_floor_snap()` | `void` | Snap to floor immediately (useful after teleporting) |

---

## 2. Motion Modes — Grounded vs Floating

The `motion_mode` property changes how `move_and_slide()` classifies surfaces.

### Grounded (default — `MOTION_MODE_GROUNDED`)

Surfaces are classified as floor, wall, or ceiling based on `up_direction` and `floor_max_angle`. This is the mode for any game with gravity — platformers, 3D action games, etc.

- Floor: surface normal angle to `up_direction` is less than `floor_max_angle`
- Ceiling: surface normal angle to `up_direction` is greater than `180° - floor_max_angle`
- Wall: everything else

### Floating (`MOTION_MODE_FLOATING`)

All surfaces are walls. There is no floor or ceiling concept. Use this for top-down 2D games, space games, or anything without a gravity direction.

```gdscript
# Top-down game setup
func _ready() -> void:
    motion_mode = CharacterBody2D.MOTION_MODE_FLOATING
```

---

## 3. Key Properties Explained

| Property | Default | What It Does |
|----------|---------|-------------|
| `velocity` | `Vector2/3.ZERO` | The desired velocity. Set this before calling `move_and_slide()`. |
| `up_direction` | `Vector2(0, -1)` / `Vector3(0, 1, 0)` | Defines which direction is "up" for floor/wall/ceiling detection. |
| `floor_max_angle` | `0.785` (~45°) | Maximum slope angle (in radians) that counts as a floor. |
| `floor_stop_on_slope` | `true` | Prevents sliding down slopes when standing still. |
| `floor_block_on_wall` | `true` | Prevents the body from sliding on a wall as if it were a floor. |
| `floor_constant_speed` | `false` | When `true`, speed is constant going up and down slopes. Set to `true` for most games. |
| `floor_snap_length` | `1.0` (2D) / `0.1` (3D) | Distance to snap the body to the floor. Prevents "hopping" off slopes at speed. |
| `wall_min_slide_angle` | `0.2618` (~15°) | Minimum angle between motion and wall before sliding begins. |
| `slide_on_ceiling` | `true` | Whether to slide horizontally when hitting a ceiling. |
| `max_slides` | `4` (2D) / `6` (3D) | Maximum collision iterations per `move_and_slide()` call. |
| `safe_margin` | `0.08` (2D) / `0.001` (3D) | Collision margin for depenetration. Increase if you see tunneling at high speeds. |
| `platform_floor_layers` | all | Collision layers that act as moving platforms (floor detection). |
| `platform_on_leave` | `ADD_VELOCITY` | What happens when leaving a moving platform: `ADD_VELOCITY`, `ADD_UPWARD_VELOCITY`, or `DO_NOTHING`. |

---

## 4. 2D Platformer Controller

A complete platformer controller with variable jump height, acceleration/deceleration, and fall gravity multiplier.

```gdscript
extends CharacterBody2D

## Movement tuning — tweak these in the Inspector
@export_group("Movement")
@export var max_speed: float = 300.0
@export var acceleration: float = 2000.0
@export var deceleration: float = 2400.0
@export var turn_speed: float = 3200.0

@export_group("Jump")
@export var jump_velocity: float = -500.0
@export var gravity_scale: float = 1.0
@export var fall_gravity_multiplier: float = 1.6
@export var jump_cut_multiplier: float = 0.4  # Release jump early = lower jump

@export_group("Tuning")
@export var coyote_time: float = 0.1
@export var jump_buffer_time: float = 0.12

var _coyote_timer: float = 0.0
var _jump_buffer_timer: float = 0.0
var _was_on_floor: bool = false

func _physics_process(delta: float) -> void:
    var base_gravity: float = ProjectSettings.get_setting("physics/2d/default_gravity")

    # --- Gravity ---
    if not is_on_floor():
        var multiplier := fall_gravity_multiplier if velocity.y > 0.0 else gravity_scale
        velocity.y += base_gravity * multiplier * delta
    
    # --- Coyote time ---
    if is_on_floor():
        _coyote_timer = coyote_time
    elif _was_on_floor:
        # Just left the floor without jumping
        _coyote_timer = coyote_time
    _coyote_timer = maxf(_coyote_timer - delta, 0.0)
    _was_on_floor = is_on_floor()

    # --- Jump buffer ---
    if Input.is_action_just_pressed("jump"):
        _jump_buffer_timer = jump_buffer_time
    _jump_buffer_timer = maxf(_jump_buffer_timer - delta, 0.0)

    # --- Jump execution ---
    if _jump_buffer_timer > 0.0 and _coyote_timer > 0.0:
        velocity.y = jump_velocity
        _jump_buffer_timer = 0.0
        _coyote_timer = 0.0

    # --- Variable jump height (release early = lower) ---
    if Input.is_action_just_released("jump") and velocity.y < 0.0:
        velocity.y *= jump_cut_multiplier

    # --- Horizontal movement ---
    var direction := Input.get_axis("move_left", "move_right")
    if direction != 0.0:
        var is_turning := signf(direction) != signf(velocity.x) and absf(velocity.x) > 10.0
        var accel := turn_speed if is_turning else acceleration
        velocity.x = move_toward(velocity.x, direction * max_speed, accel * delta)
    else:
        velocity.x = move_toward(velocity.x, 0.0, deceleration * delta)

    move_and_slide()
```

### Why These Choices

- **Separate acceleration / deceleration / turn speed:** Lets you make turning feel snappy while keeping acceleration smooth. Most shipped platformers use different values for each.
- **Fall gravity multiplier:** Makes jumps feel "arcier" — fast rise, faster fall. This is the single biggest improvement you can make to a platformer's feel.
- **Jump cut:** Releasing the jump button early multiplies the upward velocity by a fraction, giving variable jump height without complex parabola math.
- **Coyote time + jump buffer:** These two timers alone eliminate 90% of "I pressed jump but nothing happened" complaints.

---

## 5. 2D Top-Down Controller

For RPGs, twin-stick shooters, or any game viewed from above.

```gdscript
extends CharacterBody2D

@export var max_speed: float = 200.0
@export var acceleration: float = 1600.0
@export var friction: float = 2000.0

func _ready() -> void:
    motion_mode = CharacterBody2D.MOTION_MODE_FLOATING

func _physics_process(delta: float) -> void:
    var input := Input.get_vector("move_left", "move_right", "move_up", "move_down")
    
    if input.length_squared() > 0.0:
        # Normalize to prevent diagonal speed boost
        input = input.normalized()
        velocity = velocity.move_toward(input * max_speed, acceleration * delta)
    else:
        velocity = velocity.move_toward(Vector2.ZERO, friction * delta)

    move_and_slide()

    # Optional: face movement direction
    if velocity.length_squared() > 100.0:
        rotation = velocity.angle()
```

### Eight-Direction Variant

```gdscript
# Snap input to 8 directions for pixel-art games
func _get_snapped_input() -> Vector2:
    var raw := Input.get_vector("move_left", "move_right", "move_up", "move_down")
    if raw.length_squared() < 0.2:
        return Vector2.ZERO
    # Snap angle to nearest 45 degrees
    var angle := snappedf(raw.angle(), PI / 4.0)
    return Vector2.from_angle(angle)
```

---

## 6. 3D First-Person Controller

```gdscript
extends CharacterBody3D

@export_group("Movement")
@export var max_speed: float = 5.0
@export var acceleration: float = 30.0
@export var deceleration: float = 40.0
@export var air_control: float = 0.3  # Fraction of ground acceleration in air

@export_group("Jump")
@export var jump_velocity: float = 5.0
@export var gravity_multiplier: float = 1.0

@export_group("Camera")
@export var mouse_sensitivity: float = 0.002
@export var max_pitch: float = 89.0

@onready var camera_pivot: Node3D = $CameraPivot
@onready var camera: Camera3D = $CameraPivot/Camera3D

var _gravity: float = ProjectSettings.get_setting("physics/3d/default_gravity")

func _ready() -> void:
    Input.mouse_mode = Input.MOUSE_MODE_CAPTURED

func _unhandled_input(event: InputEvent) -> void:
    if event is InputEventMouseMotion:
        # Horizontal rotation: rotate the whole body
        rotate_y(-event.relative.x * mouse_sensitivity)
        # Vertical rotation: rotate only the camera pivot
        camera_pivot.rotate_x(-event.relative.y * mouse_sensitivity)
        camera_pivot.rotation.x = clampf(
            camera_pivot.rotation.x,
            deg_to_rad(-max_pitch),
            deg_to_rad(max_pitch)
        )
    
    if event.is_action_pressed("ui_cancel"):
        Input.mouse_mode = Input.MOUSE_MODE_VISIBLE

func _physics_process(delta: float) -> void:
    # --- Gravity ---
    if not is_on_floor():
        velocity.y -= _gravity * gravity_multiplier * delta

    # --- Jump ---
    if Input.is_action_just_pressed("jump") and is_on_floor():
        velocity.y = jump_velocity

    # --- Horizontal movement ---
    var input := Input.get_vector("move_left", "move_right", "move_forward", "move_back")
    # Transform input to world space based on body's facing direction
    var direction := (transform.basis * Vector3(input.x, 0.0, input.y)).normalized()

    var accel := acceleration
    if not is_on_floor():
        accel *= air_control
    
    if direction.length_squared() > 0.0:
        velocity.x = move_toward(velocity.x, direction.x * max_speed, accel * delta)
        velocity.z = move_toward(velocity.z, direction.z * max_speed, accel * delta)
    else:
        var decel := deceleration if is_on_floor() else deceleration * air_control
        velocity.x = move_toward(velocity.x, 0.0, decel * delta)
        velocity.z = move_toward(velocity.z, 0.0, decel * delta)

    move_and_slide()
```

### Scene Tree Setup

```
CharacterBody3D (this script)
├── CollisionShape3D (capsule, ~0.5m radius, ~1.8m height)
├── CameraPivot (Node3D, positioned at eye height ~1.6m)
│   └── Camera3D
└── MeshInstance3D (optional — for shadow or debug)
```

### Why `_unhandled_input` for Mouse Look

Using `_unhandled_input` instead of `_input` means UI elements (menus, inventory) can consume mouse events first. When a popup is open and captures the mouse, the camera won't spin.

---

## 7. 3D Third-Person Controller

The key difference from first-person: the camera orbits the player, and the character model rotates to face the movement direction.

```gdscript
extends CharacterBody3D

@export_group("Movement")
@export var max_speed: float = 5.0
@export var acceleration: float = 25.0
@export var deceleration: float = 30.0
@export var rotation_speed: float = 10.0

@export_group("Jump")
@export var jump_velocity: float = 5.0

@onready var camera_pivot: Node3D = $CameraPivot
@onready var camera: Camera3D = $CameraPivot/SpringArm3D/Camera3D
@onready var model: Node3D = $Model

var _gravity: float = ProjectSettings.get_setting("physics/3d/default_gravity")

func _physics_process(delta: float) -> void:
    # --- Gravity ---
    if not is_on_floor():
        velocity.y -= _gravity * delta

    # --- Jump ---
    if Input.is_action_just_pressed("jump") and is_on_floor():
        velocity.y = jump_velocity

    # --- Movement relative to camera ---
    var input := Input.get_vector("move_left", "move_right", "move_forward", "move_back")
    # Use camera's horizontal orientation, not the body's
    var cam_basis := camera_pivot.global_transform.basis
    var forward := -cam_basis.z
    forward.y = 0.0
    forward = forward.normalized()
    var right := cam_basis.x
    right.y = 0.0
    right = right.normalized()

    var direction := (right * input.x + forward * (-input.y)).normalized()

    if direction.length_squared() > 0.0:
        velocity.x = move_toward(velocity.x, direction.x * max_speed, acceleration * delta)
        velocity.z = move_toward(velocity.z, direction.z * max_speed, acceleration * delta)
        # Rotate model to face movement direction
        var target_angle := atan2(direction.x, direction.z)
        model.rotation.y = lerp_angle(model.rotation.y, target_angle, rotation_speed * delta)
    else:
        velocity.x = move_toward(velocity.x, 0.0, deceleration * delta)
        velocity.z = move_toward(velocity.z, 0.0, deceleration * delta)

    move_and_slide()
```

### Scene Tree Setup

```
CharacterBody3D (this script)
├── CollisionShape3D (capsule)
├── Model (Node3D — holds the visual mesh, rotates independently)
│   └── AnimatedMesh
├── CameraPivot (Node3D — orbits via mouse input, separate script)
│   └── SpringArm3D (handles camera collision with walls)
│       └── Camera3D
```

### Camera Orbit Script (on CameraPivot)

```gdscript
extends Node3D

@export var mouse_sensitivity: float = 0.002
@export var min_pitch: float = -40.0
@export var max_pitch: float = 60.0

func _unhandled_input(event: InputEvent) -> void:
    if event is InputEventMouseMotion and Input.mouse_mode == Input.MOUSE_MODE_CAPTURED:
        rotate_y(-event.relative.x * mouse_sensitivity)
        rotation.x = clampf(
            rotation.x - event.relative.y * mouse_sensitivity,
            deg_to_rad(min_pitch),
            deg_to_rad(max_pitch)
        )
```

---

## 8. Coyote Time and Input Buffering

These two patterns are essential for any game with jumping. They are simple timers that make the game feel fair.

### Coyote Time

Allow jumping for a short window after walking off a ledge. Without this, players will feel like the game "ate" their jump input.

```gdscript
var _coyote_timer: float = 0.0
const COYOTE_DURATION: float = 0.1  # 100ms is standard

func _physics_process(delta: float) -> void:
    if is_on_floor():
        _coyote_timer = COYOTE_DURATION
    else:
        _coyote_timer = maxf(_coyote_timer - delta, 0.0)

    var can_jump: bool = _coyote_timer > 0.0
```

### Jump Buffering

If the player presses jump slightly before landing, execute the jump on landing. Without this, the player must press jump on the exact frame they touch the ground.

```gdscript
var _jump_buffer: float = 0.0
const BUFFER_DURATION: float = 0.12  # 120ms

func _physics_process(delta: float) -> void:
    if Input.is_action_just_pressed("jump"):
        _jump_buffer = BUFFER_DURATION
    _jump_buffer = maxf(_jump_buffer - delta, 0.0)

    # Execute jump when grounded and buffer is active
    if _jump_buffer > 0.0 and is_on_floor():
        velocity.y = jump_velocity
        _jump_buffer = 0.0
```

---

## 9. Slopes, Stairs, and Edge Cases

### Preventing Slope Sliding

By default, `floor_stop_on_slope = true` prevents the character from sliding down when standing still. But at steep slopes near `floor_max_angle`, you may still see micro-sliding. Increase `floor_snap_length` to fix this.

### Constant Speed on Slopes

Without `floor_constant_speed = true`, your character slows down going uphill and speeds up going downhill. For most games, enable it:

```gdscript
func _ready() -> void:
    floor_constant_speed = true
```

### Stairs (3D)

Godot's `CharacterBody3D` doesn't have built-in stair stepping. The standard approach is two raycasts (one at foot height, one at step height) with a vertical snap:

```gdscript
@export var step_height: float = 0.3

func _stair_step(delta: float) -> void:
    if not is_on_floor() or velocity.length_squared() < 0.01:
        return
    
    var motion := velocity * delta
    motion.y = 0.0
    
    # Cast forward at step height to see if there's room above the stair
    var step_test := PhysicsTestMotionParameters3D.new()
    step_test.from = global_transform.translated(Vector3.UP * step_height)
    step_test.motion = motion
    
    var result := PhysicsTestMotionResult3D.new()
    if not PhysicsServer3D.body_test_motion(get_rid(), step_test, result):
        # No collision above — check if there's a floor to land on
        step_test.from = global_transform.translated(Vector3.UP * step_height + motion)
        step_test.motion = Vector3.DOWN * step_height
        if PhysicsServer3D.body_test_motion(get_rid(), step_test, result):
            global_position += Vector3.UP * (step_height - result.get_remainder().length()) + motion
```

### One-Way Platforms (2D)

Use the `platform_floor_layers` and collision layer system:

```gdscript
# On the one-way platform's CollisionShape2D:
# Set one_way_collision = true in the Inspector

# OR control it from code on the character:
# Temporarily disable platform collision to drop through
func _drop_through_platform() -> void:
    platform_floor_layers = 0  # Ignore all platforms
    await get_tree().create_timer(0.2).timeout
    platform_floor_layers = 0xFFFFFFFF  # Re-enable
```

---

## 10. C# Equivalents

```csharp
using Godot;

public partial class PlatformerController : CharacterBody2D
{
    [Export] public float MaxSpeed { get; set; } = 300f;
    [Export] public float Acceleration { get; set; } = 2000f;
    [Export] public float JumpVelocity { get; set; } = -500f;
    [Export] public float FallGravityMultiplier { get; set; } = 1.6f;

    public override void _PhysicsProcess(double delta)
    {
        float dt = (float)delta;
        float gravity = (float)ProjectSettings.GetSetting("physics/2d/default_gravity");

        // Gravity
        if (!IsOnFloor())
        {
            float mult = Velocity.Y > 0f ? FallGravityMultiplier : 1f;
            var vel = Velocity;
            vel.Y += gravity * mult * dt;
            Velocity = vel;
        }

        // Jump
        if (Input.IsActionJustPressed("jump") && IsOnFloor())
        {
            var vel = Velocity;
            vel.Y = JumpVelocity;
            Velocity = vel;
        }

        // Horizontal
        float direction = Input.GetAxis("move_left", "move_right");
        var v = Velocity;
        if (direction != 0f)
            v.X = Mathf.MoveToward(v.X, direction * MaxSpeed, Acceleration * dt);
        else
            v.X = Mathf.MoveToward(v.X, 0f, Acceleration * dt);
        Velocity = v;

        MoveAndSlide();
    }
}
```

**C# note:** `Velocity` is a struct property in C#, so you cannot write `Velocity.X = ...` directly. Copy to a local variable, modify it, then assign back.

---

## 11. Common Mistakes

**Using `_process` instead of `_physics_process`.** Character movement must run in the physics step. Using `_process` causes inconsistent behavior at different frame rates and breaks `is_on_floor()` detection.

**Forgetting to normalize diagonal input.** `Input.get_vector()` returns a vector with length up to `√2` when pressing two axes. Always call `.normalized()` on the result (or use `limit_length(1.0)`). Without this, diagonal movement is ~41% faster.

**Setting position directly.** Never set `position` or `global_position` for regular movement — it bypasses collision detection. Use `move_and_slide()`. The only exception is teleportation, and call `apply_floor_snap()` afterward.

**Not enabling `floor_constant_speed`.** This defaults to `false`, which means characters slow down going uphill. Almost every game wants this set to `true`.

**Ignoring `platform_on_leave`.** When your character rides a moving platform and jumps, the default `ADD_VELOCITY` adds the platform's full velocity to the jump. This is correct for most games but can cause surprising high-speed launches on fast elevators. Switch to `ADD_UPWARD_VELOCITY` or `DO_NOTHING` if needed.

**Hard-coding gravity.** Always read gravity from `ProjectSettings.get_setting("physics/2d/default_gravity")` (or `3d`). This keeps your controller consistent with the project settings and lets designers tune gravity from one place.
