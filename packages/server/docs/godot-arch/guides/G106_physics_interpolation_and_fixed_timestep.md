# G106 — Physics Interpolation & Fixed Timestep Patterns

> **Category:** guide · **Engine:** Godot 4.x · **Related:** [G5 Physics & Collision](./G5_physics_and_collision.md) · [G23 Advanced Physics](./G23_advanced_physics.md) · [G64 Character Controller Patterns](./G64_character_controller_patterns.md) · [G41 Godot 4.4–4.6 Features](./G41_godot_44_to_46_features.md)

Godot's physics engine runs at a fixed tick rate (default 60 Hz) while rendering runs as fast as possible. Without interpolation, objects that move in `_physics_process()` appear to stutter — especially at high or variable frame rates. Godot 4.3 added built-in physics interpolation for 2D; Godot 4.4 extended it to 3D. This guide covers enabling interpolation, structuring game logic around fixed timesteps, handling edge cases like teleportation and spawning, and integrating with Jolt Physics (default in 4.6).

---

## Table of Contents

1. [Why Physics Interpolation Matters](#1-why-physics-interpolation-matters)
2. [Enabling Physics Interpolation](#2-enabling-physics-interpolation)
3. [How It Works Under the Hood](#3-how-it-works-under-the-hood)
4. [Structuring Game Logic — _physics_process vs _process](#4-structuring-game-logic--_physics_process-vs-_process)
5. [Teleportation and Spawning](#5-teleportation-and-spawning)
6. [Camera Interpolation Strategies](#6-camera-interpolation-strategies)
7. [AnimationPlayer and Interpolation Conflicts](#7-animationplayer-and-interpolation-conflicts)
8. [Jolt Physics Integration (4.6)](#8-jolt-physics-integration-46)
9. [Testing at Low Tick Rates](#9-testing-at-low-tick-rates)
10. [Common Patterns](#10-common-patterns)
11. [Common Mistakes](#11-common-mistakes)

---

## 1. Why Physics Interpolation Matters

Physics ticks are discrete steps. At 60 Hz physics with a 144 Hz monitor, there are ~2.4 render frames per physics tick. Without interpolation, objects visually "snap" to their physics position, creating micro-stutter even at high FPS.

```
Without interpolation (60 Hz physics, 144 Hz render):
Frame:  |  1  |  2  |  3  |  4  |  5  |  6  |  7  |
Pos:    | P0  | P0  | P0  | P1  | P1  | P1  | P2  |
                              ↑ SNAP — visible jitter

With interpolation:
Frame:  |  1  |  2  |  3  |  4  |  5  |  6  |  7  |
Pos:    | P0  |P0.4 |P0.8 | P1  |P1.4 |P1.8 | P2  |
                              ↑ Smooth — blended between ticks
```

Interpolation blends between the previous and current physics transform using the fractional time between ticks. The visual position trails the physics position by up to one tick (~16.6 ms at 60 Hz) — imperceptible for most games.

---

## 2. Enabling Physics Interpolation

### Project Settings

Enable globally in **Project → Project Settings → Physics → Common**:

- **`physics/common/physics_interpolation`** → `true`

This affects all `Node2D` and `Node3D` nodes automatically.

### GDScript — Per-Node Control

```gdscript
# Disable interpolation on a specific node (e.g., a HUD element in 3D space)
func _ready() -> void:
    # Interpolation is inherited from parent by default
    # Override per-node when needed
    set_physics_interpolation_mode(Node.PHYSICS_INTERPOLATION_MODE_OFF)
```

### C# — Per-Node Control

```csharp
public override void _Ready()
{
    // Disable interpolation for this specific node
    PhysicsInterpolationMode = PhysicsInterpolationModeEnum.Off;
}
```

### Per-Node Modes

| Mode | Behavior |
|------|----------|
| `PHYSICS_INTERPOLATION_MODE_INHERIT` | Use parent's setting (default) |
| `PHYSICS_INTERPOLATION_MODE_ON` | Force interpolation on |
| `PHYSICS_INTERPOLATION_MODE_OFF` | Force interpolation off |

---

## 3. How It Works Under the Hood

Each physics tick, the engine stores the **previous** and **current** global transforms of every interpolated node. During rendering, it calculates a blend fraction:

```
blend_fraction = time_since_last_physics_tick / physics_tick_duration
visual_transform = lerp(previous_transform, current_transform, blend_fraction)
```

For 3D nodes, rotation is interpolated using quaternion slerp to avoid gimbal artifacts. Scale is interpolated linearly.

Key points:

- Interpolation operates on **global transforms**, not local. Moving a parent also interpolates children correctly.
- The visual transform is read-only during rendering — your scripts always see the physics transform via `global_transform`.
- `RigidBody2D`, `RigidBody3D`, `CharacterBody2D`, and `CharacterBody3D` all participate automatically.

---

## 4. Structuring Game Logic — _physics_process vs _process

The golden rule: **move objects in `_physics_process()`**, not `_process()`.

### GDScript — Correct Pattern

```gdscript
extends CharacterBody3D

@export var speed: float = 5.0
@export var jump_velocity: float = 4.5

func _physics_process(delta: float) -> void:
    # Gravity
    if not is_on_floor():
        velocity += get_gravity() * delta

    # Jump — input is fine to read here
    if Input.is_action_just_pressed("jump") and is_on_floor():
        velocity.y = jump_velocity

    # Movement
    var input_dir := Input.get_vector("move_left", "move_right", "move_forward", "move_back")
    var direction := (transform.basis * Vector3(input_dir.x, 0, input_dir.y)).normalized()
    if direction:
        velocity.x = direction.x * speed
        velocity.z = direction.z * speed
    else:
        velocity.x = move_toward(velocity.x, 0, speed)
        velocity.z = move_toward(velocity.z, 0, speed)

    move_and_slide()
```

### C# — Correct Pattern

```csharp
using Godot;

public partial class Player : CharacterBody3D
{
    [Export] public float Speed { get; set; } = 5.0f;
    [Export] public float JumpVelocity { get; set; } = 4.5f;

    public override void _PhysicsProcess(double delta)
    {
        Vector3 vel = Velocity;

        if (!IsOnFloor())
            vel += GetGravity() * (float)delta;

        if (Input.IsActionJustPressed("jump") && IsOnFloor())
            vel.Y = JumpVelocity;

        Vector2 inputDir = Input.GetVector("move_left", "move_right", "move_forward", "move_back");
        Vector3 direction = (Transform.Basis * new Vector3(inputDir.X, 0, inputDir.Y)).Normalized();

        if (direction != Vector3.Zero)
        {
            vel.X = direction.X * Speed;
            vel.Z = direction.Z * Speed;
        }
        else
        {
            vel.X = Mathf.MoveToward(vel.X, 0, Speed);
            vel.Z = Mathf.MoveToward(vel.Z, 0, Speed);
        }

        Velocity = vel;
        MoveAndSlide();
    }
}
```

### What Belongs in _process()

Use `_process()` for things that should NOT be interpolated or that respond to visual state:

- UI updates (health bars, score displays)
- Particle emission triggers (visual-only)
- Audio playback triggers
- Input buffering (store inputs, apply in next `_physics_process`)

---

## 5. Teleportation and Spawning

When you instantly move an object to a new position, the interpolator will blend from the old position, creating a visible "streak." Call `reset_physics_interpolation()` to prevent this.

### GDScript — Teleportation

```gdscript
func teleport_to(target_position: Vector3) -> void:
    global_position = target_position
    # Crucial: tell the interpolator the previous position = current position
    reset_physics_interpolation()
```

### GDScript — Spawning

```gdscript
func spawn_enemy(scene: PackedScene, spawn_pos: Vector3) -> Node3D:
    var enemy := scene.instantiate() as Node3D
    enemy.global_position = spawn_pos
    add_child(enemy)
    # Reset after adding to tree — the node must be in the scene tree
    enemy.reset_physics_interpolation()
    return enemy
```

### C# — Teleportation

```csharp
public void TeleportTo(Vector3 targetPosition)
{
    GlobalPosition = targetPosition;
    ResetPhysicsInterpolation();
}
```

### When to Call reset_physics_interpolation()

- After teleporting a node to a new position
- After spawning and positioning a node
- When recycling pooled objects (object pools)
- After enabling a previously hidden node that moved while invisible

**2D auto-reset:** In 2D, nodes automatically reset when first entering the tree. In 3D, you should always call it explicitly after initial placement.

---

## 6. Camera Interpolation Strategies

Camera jitter is the most noticeable interpolation artifact. There are three approaches:

### Approach 1: Camera as Child of Interpolated Body (Simplest)

```gdscript
# Scene tree:
# CharacterBody3D (player — interpolated)
#   └─ Camera3D

# Camera inherits parent's interpolated transform automatically.
# Works well for first-person cameras.
```

### Approach 2: Independent Camera with Manual Follow

```gdscript
extends Camera3D

@export var target: Node3D
@export var offset := Vector3(0, 5, 8)
@export var smooth_speed: float = 10.0

func _process(delta: float) -> void:
    # Follow in _process so we track the interpolated visual position
    if target:
        var target_pos := target.global_position + offset
        global_position = global_position.lerp(target_pos, smooth_speed * delta)
        look_at(target.global_position, Vector3.UP)
```

### Approach 3: Camera with Interpolation Disabled

```gdscript
extends Camera3D

@export var target: Node3D

func _ready() -> void:
    # Camera handles its own smoothing — disable engine interpolation
    set_physics_interpolation_mode(Node.PHYSICS_INTERPOLATION_MODE_OFF)

func _process(delta: float) -> void:
    if target:
        global_position = target.global_position + Vector3(0, 5, 8)
        look_at(target.global_position, Vector3.UP)
```

**Recommendation:** Start with Approach 1 (camera as child). Move to Approach 2 if you need independent camera behavior like orbit, cinematic transitions, or multi-target framing.

---

## 7. AnimationPlayer and Interpolation Conflicts

AnimationPlayer can conflict with physics interpolation when it animates the transform of interpolated nodes. The animation writes to the transform every frame in `_process()`, but the interpolator expects transforms to change only in `_physics_process()`.

### The Problem

```gdscript
# AnimationPlayer animating position in _process
# Physics interpolation also trying to interpolate position
# Result: jittering or overridden positions
```

### Solutions

**Option A:** Disable interpolation on animated nodes.

```gdscript
@onready var animated_platform: Node3D = $AnimatedPlatform

func _ready() -> void:
    animated_platform.set_physics_interpolation_mode(
        Node.PHYSICS_INTERPOLATION_MODE_OFF
    )
```

**Option B:** Use AnimationPlayer in physics process mode.

```gdscript
@onready var anim_player: AnimationPlayer = $AnimationPlayer

func _ready() -> void:
    # Force AnimationPlayer to tick in physics process
    anim_player.process_callback = AnimationPlayer.ANIMATION_PROCESS_PHYSICS
```

**Option C:** Use Tweens in `_physics_process()` instead of AnimationPlayer for physics-driven movement.

```gdscript
func move_platform(target: Vector3, duration: float) -> void:
    var tween := create_tween()
    tween.set_process_mode(Tween.TWEEN_PROCESS_PHYSICS)
    tween.tween_property(self, "global_position", target, duration)
```

---

## 8. Jolt Physics Integration (4.6)

Godot 4.6 made Jolt Physics the default 3D physics engine. Physics interpolation is **engine-agnostic** — it works identically with GodotPhysics3D and Jolt.

### Verify Your Physics Engine

```gdscript
func _ready() -> void:
    var engine_name := ProjectSettings.get_setting("physics/3d/physics_engine")
    print("3D Physics Engine: ", engine_name)
    # "JoltPhysics3D" in Godot 4.6+ by default
```

### C#

```csharp
public override void _Ready()
{
    string engineName = ProjectSettings.GetSetting("physics/3d/physics_engine").AsString();
    GD.Print($"3D Physics Engine: {engineName}");
}
```

### Jolt-Specific Considerations

- Jolt uses different contact manifold generation — collision callbacks may fire at slightly different times than GodotPhysics3D.
- `RigidBody3D` with Jolt may settle faster (better sleeping), meaning fewer physics updates and smoother interpolation during rest.
- Continuous collision detection (CCD) in Jolt handles fast-moving objects better, reducing tunneling without needing lower physics tick rates.

---

## 9. Testing at Low Tick Rates

The official Godot docs recommend temporarily lowering the physics tick rate during development to make interpolation issues obvious.

### GDScript — Debug Toggle

```gdscript
# Add to a debug autoload
func _input(event: InputEvent) -> void:
    if event.is_action_pressed("debug_low_physics"):
        var current_fps := ProjectSettings.get_setting("physics/common/physics_ticks_per_second") as int
        if current_fps == 60:
            Engine.physics_ticks_per_second = 10
            print("Physics: 10 Hz (debug mode)")
        else:
            Engine.physics_ticks_per_second = 60
            print("Physics: 60 Hz (normal)")
```

### What to Look For at 10 Hz

- **Streaking:** Objects leave a visual trail — missing `reset_physics_interpolation()` after teleport/spawn.
- **Snapping:** Objects visually jump — code setting transforms in `_process()` instead of `_physics_process()`.
- **Desynchronization:** Camera or UI misaligned — following the physics transform instead of the visual transform.
- **Double movement:** Objects moving twice as fast — accidentally updating position in both `_process()` and `_physics_process()`.

---

## 10. Common Patterns

### Pattern: Interpolation-Safe Object Pool

```gdscript
class_name ObjectPool
extends Node

var _pool: Array[Node3D] = []
var _scene: PackedScene

func _init(scene: PackedScene, count: int) -> void:
    _scene = scene
    for i in count:
        var obj := scene.instantiate() as Node3D
        obj.visible = false
        obj.process_mode = Node.PROCESS_MODE_DISABLED
        _pool.append(obj)

func acquire(spawn_position: Vector3) -> Node3D:
    if _pool.is_empty():
        return null
    var obj := _pool.pop_back()
    obj.global_position = spawn_position
    obj.visible = true
    obj.process_mode = Node.PROCESS_MODE_INHERIT
    # Critical: reset interpolation when recycling from pool
    obj.reset_physics_interpolation()
    return obj

func release(obj: Node3D) -> void:
    obj.visible = false
    obj.process_mode = Node.PROCESS_MODE_DISABLED
    _pool.append(obj)
```

### Pattern: Input Buffering for Responsive Controls

```gdscript
extends CharacterBody3D

var _jump_buffered: bool = false
var _jump_buffer_timer: float = 0.0
const JUMP_BUFFER_DURATION: float = 0.1  # 100ms buffer

func _process(delta: float) -> void:
    # Buffer inputs in _process for maximum responsiveness
    if Input.is_action_just_pressed("jump"):
        _jump_buffered = true
        _jump_buffer_timer = JUMP_BUFFER_DURATION

    if _jump_buffered:
        _jump_buffer_timer -= delta
        if _jump_buffer_timer <= 0.0:
            _jump_buffered = false

func _physics_process(delta: float) -> void:
    if _jump_buffered and is_on_floor():
        velocity.y = 4.5
        _jump_buffered = false

    # ... rest of movement
    move_and_slide()
```

### Pattern: Fixed-Timestep with Variable Rendering (Manual)

For cases where you cannot use built-in interpolation (e.g., custom physics):

```gdscript
var _previous_position: Vector3
var _current_position: Vector3
var _visual_node: Node3D

func _physics_process(delta: float) -> void:
    _previous_position = _current_position
    _current_position = calculate_new_position(delta)

func _process(_delta: float) -> void:
    var fraction := Engine.get_physics_interpolation_fraction()
    _visual_node.global_position = _previous_position.lerp(
        _current_position, fraction
    )
```

---

## 11. Common Mistakes

| Mistake | Symptom | Fix |
|---------|---------|-----|
| Moving objects in `_process()` | Jitter at mismatched tick/frame rates | Move all gameplay transforms in `_physics_process()` |
| Forgetting `reset_physics_interpolation()` | Streaking on teleport/spawn | Call after every instant position change |
| Camera following physics transform in `_process()` | Camera jitter | Make camera a child, or follow the visual position |
| AnimationPlayer overriding interpolated transforms | Platform/object jitter | Set `process_callback` to `ANIMATION_PROCESS_PHYSICS` |
| Setting velocity in `_process()` | Inconsistent speed at different frame rates | Only modify `velocity` in `_physics_process()` |
| Not testing at low tick rates | Subtle bugs ship to production | Test at 10 Hz during development |
| Pooled objects not reset | Recycled objects streak from old position | Call `reset_physics_interpolation()` on acquire |
