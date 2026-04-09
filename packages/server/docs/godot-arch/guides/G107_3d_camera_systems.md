# G107 — 3D Camera Systems & Cinematic Rigs

> **Category:** guide · **Engine:** Godot 4.x · **Related:** [G6 Camera Systems (2D)](./G6_camera_systems.md) · [G64 Character Controller Patterns](./G64_character_controller_patterns.md) · [G106 Physics Interpolation](./G106_physics_interpolation_and_fixed_timestep.md) · [G58 Cutscene & Cinematic Systems](./G58_cutscene_and_cinematic_systems.md)

G6 covers Camera2D in depth. This guide covers **Camera3D** — the node that defines how your 3D world is projected onto the screen. Topics include first-person, third-person with SpringArm3D, orbit cameras, camera collision, cinematic cameras, screen shake in 3D, split-screen, smooth transitions between cameras, and performance considerations.

All code targets Godot 4.4+ with typed GDScript and C#.

---

## Table of Contents

1. [Camera3D Fundamentals](#1-camera3d-fundamentals)
2. [First-Person Camera](#2-first-person-camera)
3. [Third-Person Camera with SpringArm3D](#3-third-person-camera-with-springarm3d)
4. [Orbit Camera](#4-orbit-camera)
5. [Camera Collision and Clipping](#5-camera-collision-and-clipping)
6. [Smooth Camera Transitions](#6-smooth-camera-transitions)
7. [Screen Shake in 3D](#7-screen-shake-in-3d)
8. [Cinematic Camera Rail](#8-cinematic-camera-rail)
9. [Split-Screen Multiplayer](#9-split-screen-multiplayer)
10. [Field of View Effects](#10-field-of-view-effects)
11. [Common Mistakes](#11-common-mistakes)

---

## 1. Camera3D Fundamentals

### Key Properties

| Property | Default | Purpose |
|----------|---------|---------|
| `fov` | 75.0 | Vertical field of view (degrees) |
| `near` | 0.05 | Near clip plane distance |
| `far` | 4000.0 | Far clip plane distance |
| `projection` | PERSPECTIVE | `PERSPECTIVE` or `ORTHOGONAL` |
| `current` | false | Whether this camera is active |
| `h_offset` / `v_offset` | 0.0 | Frustum offset (for over-shoulder views) |

### Scene Tree Conventions

```
# First-person:
CharacterBody3D
  └─ CameraPivot (Node3D)  ← pitch rotation
      └─ Camera3D

# Third-person:
CharacterBody3D
  └─ CameraPivot (Node3D)  ← pitch rotation
      └─ SpringArm3D
          └─ Camera3D
```

### Making a Camera Active

```gdscript
# Activate a camera
camera.make_current()

# Check which camera is active
var active_cam := get_viewport().get_camera_3d()
```

```csharp
camera.MakeCurrent();
Camera3D activeCam = GetViewport().GetCamera3D();
```

---

## 2. First-Person Camera

### GDScript

```gdscript
extends CharacterBody3D

@export var mouse_sensitivity: float = 0.002
@export var speed: float = 5.0

@onready var camera_pivot: Node3D = $CameraPivot

func _ready() -> void:
    Input.mouse_mode = Input.MOUSE_MODE_CAPTURED

func _unhandled_input(event: InputEvent) -> void:
    if event is InputEventMouseMotion:
        # Yaw: rotate the whole body
        rotate_y(-event.relative.x * mouse_sensitivity)
        # Pitch: rotate the camera pivot only
        camera_pivot.rotate_x(-event.relative.y * mouse_sensitivity)
        # Clamp pitch to prevent flipping
        camera_pivot.rotation.x = clampf(
            camera_pivot.rotation.x,
            deg_to_rad(-89),
            deg_to_rad(89)
        )

    if event.is_action_pressed("ui_cancel"):
        Input.mouse_mode = Input.MOUSE_MODE_VISIBLE

func _physics_process(delta: float) -> void:
    var input_dir := Input.get_vector("move_left", "move_right", "move_forward", "move_back")
    var direction := (transform.basis * Vector3(input_dir.x, 0, input_dir.y)).normalized()

    if not is_on_floor():
        velocity += get_gravity() * delta

    if direction:
        velocity.x = direction.x * speed
        velocity.z = direction.z * speed
    else:
        velocity.x = move_toward(velocity.x, 0, speed)
        velocity.z = move_toward(velocity.z, 0, speed)

    move_and_slide()
```

### C#

```csharp
using Godot;

public partial class FirstPersonController : CharacterBody3D
{
    [Export] public float MouseSensitivity { get; set; } = 0.002f;
    [Export] public float Speed { get; set; } = 5.0f;

    private Node3D _cameraPivot;

    public override void _Ready()
    {
        _cameraPivot = GetNode<Node3D>("CameraPivot");
        Input.MouseMode = Input.MouseModeEnum.Captured;
    }

    public override void _UnhandledInput(InputEvent @event)
    {
        if (@event is InputEventMouseMotion mouseMotion)
        {
            RotateY(-mouseMotion.Relative.X * MouseSensitivity);
            _cameraPivot.RotateX(-mouseMotion.Relative.Y * MouseSensitivity);
            var rot = _cameraPivot.Rotation;
            rot.X = Mathf.Clamp(rot.X, Mathf.DegToRad(-89), Mathf.DegToRad(89));
            _cameraPivot.Rotation = rot;
        }
    }

    public override void _PhysicsProcess(double delta)
    {
        Vector3 vel = Velocity;
        Vector2 inputDir = Input.GetVector("move_left", "move_right", "move_forward", "move_back");
        Vector3 direction = (Transform.Basis * new Vector3(inputDir.X, 0, inputDir.Y)).Normalized();

        if (!IsOnFloor())
            vel += GetGravity() * (float)delta;

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

### Why _unhandled_input for Mouse Look

- `_input()` runs before UI processing — mouse events reach your camera even when clicking menus.
- `_unhandled_input()` only fires if no UI `Control` consumed the event.
- This means pause menus, inventory screens, and dialog boxes automatically suppress camera movement.

---

## 3. Third-Person Camera with SpringArm3D

`SpringArm3D` casts a ray from its origin toward the camera. If geometry blocks the ray, it pushes the camera forward to prevent clipping through walls.

### Scene Tree

```
CharacterBody3D
  └─ CameraPivot (Node3D)
      └─ SpringArm3D
          ├─ spring_length = 4.0
          ├─ collision_mask = 1  (environment layer)
          └─ Camera3D
```

### GDScript

```gdscript
extends CharacterBody3D

@export var mouse_sensitivity: float = 0.002
@export var min_pitch: float = -80.0
@export var max_pitch: float = 60.0

@onready var camera_pivot: Node3D = $CameraPivot
@onready var spring_arm: SpringArm3D = $CameraPivot/SpringArm3D

func _ready() -> void:
    Input.mouse_mode = Input.MOUSE_MODE_CAPTURED
    # SpringArm3D collision only with environment, not the player
    spring_arm.add_excluded_object(get_rid())

func _unhandled_input(event: InputEvent) -> void:
    if event is InputEventMouseMotion:
        rotate_y(-event.relative.x * mouse_sensitivity)
        camera_pivot.rotate_x(-event.relative.y * mouse_sensitivity)
        camera_pivot.rotation.x = clampf(
            camera_pivot.rotation.x,
            deg_to_rad(min_pitch),
            deg_to_rad(max_pitch)
        )
```

### C#

```csharp
using Godot;

public partial class ThirdPersonController : CharacterBody3D
{
    [Export] public float MouseSensitivity { get; set; } = 0.002f;
    [Export] public float MinPitch { get; set; } = -80.0f;
    [Export] public float MaxPitch { get; set; } = 60.0f;

    private Node3D _cameraPivot;
    private SpringArm3D _springArm;

    public override void _Ready()
    {
        _cameraPivot = GetNode<Node3D>("CameraPivot");
        _springArm = GetNode<SpringArm3D>("CameraPivot/SpringArm3D");
        Input.MouseMode = Input.MouseModeEnum.Captured;
        _springArm.AddExcludedObject(GetRid());
    }

    public override void _UnhandledInput(InputEvent @event)
    {
        if (@event is InputEventMouseMotion mouseMotion)
        {
            RotateY(-mouseMotion.Relative.X * MouseSensitivity);
            _cameraPivot.RotateX(-mouseMotion.Relative.Y * MouseSensitivity);
            var rot = _cameraPivot.Rotation;
            rot.X = Mathf.Clamp(rot.X, Mathf.DegToRad(MinPitch), Mathf.DegToRad(MaxPitch));
            _cameraPivot.Rotation = rot;
        }
    }
}
```

### SpringArm3D Properties

| Property | Purpose |
|----------|---------|
| `spring_length` | Maximum distance from pivot to camera |
| `collision_mask` | Which physics layers trigger camera push |
| `margin` | Extra distance to keep from collision surface |
| `shape` | Optional collision shape (default: ray cast) |

---

## 4. Orbit Camera

An orbit camera rotates freely around a target. Useful for strategy games, editors, and spectator modes.

### GDScript

```gdscript
extends Camera3D

@export var target: Node3D
@export var distance: float = 10.0
@export var min_distance: float = 2.0
@export var max_distance: float = 30.0
@export var orbit_speed: float = 0.005
@export var zoom_speed: float = 1.0
@export var min_pitch: float = -85.0
@export var max_pitch: float = 85.0

var _yaw: float = 0.0
var _pitch: float = -30.0

func _unhandled_input(event: InputEvent) -> void:
    if event is InputEventMouseMotion and Input.is_mouse_button_pressed(MOUSE_BUTTON_MIDDLE):
        _yaw -= event.relative.x * orbit_speed
        _pitch -= event.relative.y * orbit_speed
        _pitch = clampf(_pitch, deg_to_rad(min_pitch), deg_to_rad(max_pitch))

    if event is InputEventMouseButton:
        if event.button_index == MOUSE_BUTTON_WHEEL_UP:
            distance = maxf(min_distance, distance - zoom_speed)
        elif event.button_index == MOUSE_BUTTON_WHEEL_DOWN:
            distance = minf(max_distance, distance + zoom_speed)

func _process(delta: float) -> void:
    if not target:
        return

    var offset := Vector3.ZERO
    offset.x = distance * cos(_pitch) * sin(_yaw)
    offset.y = distance * sin(_pitch)
    offset.z = distance * cos(_pitch) * cos(_yaw)

    global_position = target.global_position + offset
    look_at(target.global_position, Vector3.UP)
```

### C#

```csharp
using Godot;

public partial class OrbitCamera : Camera3D
{
    [Export] public Node3D Target { get; set; }
    [Export] public float Distance { get; set; } = 10.0f;
    [Export] public float MinDistance { get; set; } = 2.0f;
    [Export] public float MaxDistance { get; set; } = 30.0f;
    [Export] public float OrbitSpeed { get; set; } = 0.005f;
    [Export] public float ZoomSpeed { get; set; } = 1.0f;

    private float _yaw = 0.0f;
    private float _pitch = Mathf.DegToRad(-30.0f);

    public override void _UnhandledInput(InputEvent @event)
    {
        if (@event is InputEventMouseMotion mouseMotion
            && Input.IsMouseButtonPressed(MouseButton.Middle))
        {
            _yaw -= mouseMotion.Relative.X * OrbitSpeed;
            _pitch -= mouseMotion.Relative.Y * OrbitSpeed;
            _pitch = Mathf.Clamp(_pitch, Mathf.DegToRad(-85), Mathf.DegToRad(85));
        }

        if (@event is InputEventMouseButton mouseBtn && mouseBtn.Pressed)
        {
            if (mouseBtn.ButtonIndex == MouseButton.WheelUp)
                Distance = Mathf.Max(MinDistance, Distance - ZoomSpeed);
            else if (mouseBtn.ButtonIndex == MouseButton.WheelDown)
                Distance = Mathf.Min(MaxDistance, Distance + ZoomSpeed);
        }
    }

    public override void _Process(double delta)
    {
        if (Target == null) return;

        var offset = new Vector3(
            Distance * Mathf.Cos(_pitch) * Mathf.Sin(_yaw),
            Distance * Mathf.Sin(_pitch),
            Distance * Mathf.Cos(_pitch) * Mathf.Cos(_yaw)
        );

        GlobalPosition = Target.GlobalPosition + offset;
        LookAt(Target.GlobalPosition, Vector3.Up);
    }
}
```

---

## 5. Camera Collision and Clipping

Beyond SpringArm3D, you may need custom collision handling for complex camera behaviors.

### Raycast-Based Collision

```gdscript
extends Camera3D

@export var target: Node3D
@export var desired_distance: float = 5.0
@export var collision_margin: float = 0.2

func _process(delta: float) -> void:
    if not target:
        return

    var origin := target.global_position + Vector3(0, 1.5, 0)
    var direction := (global_position - origin).normalized()
    var desired_pos := origin + direction * desired_distance

    # Raycast from target to desired camera position
    var space_state := get_world_3d().direct_space_state
    var query := PhysicsRayQueryParameters3D.create(origin, desired_pos)
    query.collision_mask = 1  # Environment only
    query.exclude = [target.get_rid()]

    var result := space_state.intersect_ray(query)
    if result:
        # Hit something — push camera forward
        global_position = result.position + result.normal * collision_margin
    else:
        global_position = desired_pos

    look_at(origin, Vector3.UP)
```

### C#

```csharp
public override void _Process(double delta)
{
    if (Target == null) return;

    Vector3 origin = Target.GlobalPosition + new Vector3(0, 1.5f, 0);
    Vector3 direction = (GlobalPosition - origin).Normalized();
    Vector3 desiredPos = origin + direction * DesiredDistance;

    var spaceState = GetWorld3D().DirectSpaceState;
    var query = PhysicsRayQueryParameters3D.Create(origin, desiredPos);
    query.CollisionMask = 1;
    query.Exclude = new Godot.Collections.Array<Rid> { Target.GetRid() };

    var result = spaceState.IntersectRay(query);
    if (result.Count > 0)
    {
        GlobalPosition = result["position"].AsVector3()
            + result["normal"].AsVector3() * CollisionMargin;
    }
    else
    {
        GlobalPosition = desiredPos;
    }

    LookAt(origin, Vector3.Up);
}
```

---

## 6. Smooth Camera Transitions

Transitioning between cameras (e.g., gameplay to cutscene) should be smooth, not jarring.

### Tween-Based Transition

```gdscript
## Attach to an autoload or camera manager node.
func transition_to_camera(from: Camera3D, to: Camera3D, duration: float = 1.0) -> void:
    # Store the starting transform
    var start_transform := from.global_transform
    var start_fov := from.fov

    # Make the target camera current immediately
    to.global_transform = start_transform
    to.fov = start_fov
    to.make_current()

    # Tween to the target camera's intended position
    var target_transform := to.get_meta("intended_transform") as Transform3D
    var target_fov := to.get_meta("intended_fov") as float

    var tween := to.create_tween()
    tween.set_parallel(true)
    tween.tween_property(to, "global_transform", target_transform, duration) \
        .set_ease(Tween.EASE_IN_OUT).set_trans(Tween.TRANS_CUBIC)
    tween.tween_property(to, "fov", target_fov, duration) \
        .set_ease(Tween.EASE_IN_OUT).set_trans(Tween.TRANS_CUBIC)
```

### Simple Crossfade with Environment

```gdscript
func crossfade_cameras(from: Camera3D, to: Camera3D, duration: float = 0.5) -> void:
    to.make_current()
    # Use a ColorRect overlay for visual crossfade
    var overlay := ColorRect.new()
    overlay.color = Color(0, 0, 0, 1)
    overlay.anchors_preset = Control.PRESET_FULL_RECT
    get_tree().root.add_child(overlay)

    var tween := overlay.create_tween()
    tween.tween_property(overlay, "color:a", 0.0, duration)
    tween.tween_callback(overlay.queue_free)
```

---

## 7. Screen Shake in 3D

### GDScript — Perlin-Based Shake

```gdscript
extends Camera3D

var _shake_intensity: float = 0.0
var _shake_decay: float = 5.0
var _noise := FastNoiseLite.new()
var _noise_y: float = 0.0

func _ready() -> void:
    _noise.noise_type = FastNoiseLite.TYPE_SIMPLEX
    _noise.frequency = 1.0

func shake(intensity: float, decay: float = 5.0) -> void:
    _shake_intensity = intensity
    _shake_decay = decay

func _process(delta: float) -> void:
    if _shake_intensity > 0.01:
        _noise_y += delta * 30.0
        h_offset = _noise.get_noise_2d(0.0, _noise_y) * _shake_intensity
        v_offset = _noise.get_noise_2d(100.0, _noise_y) * _shake_intensity
        _shake_intensity = lerpf(_shake_intensity, 0.0, _shake_decay * delta)
    else:
        h_offset = 0.0
        v_offset = 0.0
        _shake_intensity = 0.0
```

### C#

```csharp
using Godot;

public partial class ShakableCamera : Camera3D
{
    private float _shakeIntensity;
    private float _shakeDecay = 5.0f;
    private FastNoiseLite _noise = new();
    private float _noiseY;

    public override void _Ready()
    {
        _noise.NoiseType = FastNoiseLite.NoiseTypeEnum.Simplex;
        _noise.Frequency = 1.0f;
    }

    public void Shake(float intensity, float decay = 5.0f)
    {
        _shakeIntensity = intensity;
        _shakeDecay = decay;
    }

    public override void _Process(double delta)
    {
        if (_shakeIntensity > 0.01f)
        {
            _noiseY += (float)delta * 30.0f;
            HOffset = _noise.GetNoise2D(0, _noiseY) * _shakeIntensity;
            VOffset = _noise.GetNoise2D(100, _noiseY) * _shakeIntensity;
            _shakeIntensity = Mathf.Lerp(_shakeIntensity, 0, _shakeDecay * (float)delta);
        }
        else
        {
            HOffset = 0;
            VOffset = 0;
            _shakeIntensity = 0;
        }
    }
}
```

Using `h_offset` and `v_offset` instead of moving the camera transform avoids conflicting with position interpolation and keeps the shake purely visual.

---

## 8. Cinematic Camera Rail

A camera that follows a Path3D for cutscenes or scripted sequences.

### GDScript

```gdscript
extends PathFollow3D

## Attach this to a PathFollow3D on a Path3D.
## The Camera3D is a child of this node.

@export var travel_speed: float = 0.1
@export var look_target: Node3D

@onready var camera: Camera3D = $Camera3D

var _active: bool = false

func start_cinematic() -> void:
    progress_ratio = 0.0
    camera.make_current()
    _active = true

func _process(delta: float) -> void:
    if not _active:
        return

    progress_ratio += travel_speed * delta

    if look_target:
        camera.look_at(look_target.global_position, Vector3.UP)

    if progress_ratio >= 1.0:
        _active = false
        cinematic_finished.emit()

signal cinematic_finished
```

### Scene Tree

```
Path3D (with curve points defined in editor)
  └─ CinematicRail (PathFollow3D — this script)
      └─ Camera3D
```

---

## 9. Split-Screen Multiplayer

Use `SubViewport` nodes to render each player's camera independently.

### Scene Tree

```
HBoxContainer (or custom layout)
  ├─ SubViewportContainer (stretch, size_flags_horizontal = SIZE_EXPAND_FILL)
  │   └─ SubViewport
  │       └─ Player1Scene (with Camera3D)
  └─ SubViewportContainer
      └─ SubViewport
          └─ Player2Scene (with Camera3D)
```

### GDScript Setup

```gdscript
func setup_split_screen(player1_scene: PackedScene, player2_scene: PackedScene) -> void:
    var vp1: SubViewport = $HBox/ViewportContainer1/SubViewport
    var vp2: SubViewport = $HBox/ViewportContainer2/SubViewport

    var p1 := player1_scene.instantiate()
    var p2 := player2_scene.instantiate()

    vp1.add_child(p1)
    vp2.add_child(p2)

    # Each SubViewport renders its own Camera3D independently
    # World3D is shared by default — both players see the same world
```

### Performance Tips

- Each SubViewport doubles the draw call overhead. Keep poly counts reasonable.
- Use `SubViewport.render_target_update_mode = UPDATE_ALWAYS` for smooth rendering.
- Consider `SubViewport.msaa_3d` and `SubViewport.screen_space_aa` independently per viewport for performance tuning.

---

## 10. Field of View Effects

Dynamic FOV adds game feel — sprint FOV increase, ADS FOV decrease, damage pulse.

### GDScript

```gdscript
extends Camera3D

@export var default_fov: float = 75.0
@export var sprint_fov: float = 85.0
@export var ads_fov: float = 45.0
@export var fov_lerp_speed: float = 8.0

var _target_fov: float = 75.0

func _process(delta: float) -> void:
    if Input.is_action_pressed("aim"):
        _target_fov = ads_fov
    elif Input.is_action_pressed("sprint"):
        _target_fov = sprint_fov
    else:
        _target_fov = default_fov

    fov = lerpf(fov, _target_fov, fov_lerp_speed * delta)

## Call from damage system
func fov_punch(amount: float = 5.0, duration: float = 0.15) -> void:
    var tween := create_tween()
    tween.tween_property(self, "fov", fov + amount, duration * 0.3)
    tween.tween_property(self, "fov", _target_fov, duration * 0.7)
```

---

## 11. Common Mistakes

| Mistake | Symptom | Fix |
|---------|---------|-----|
| Camera as direct child of CharacterBody3D without pivot | Cannot pitch without rolling the body | Add intermediate Node3D pivot for pitch |
| Not excluding player from SpringArm3D collision | Camera clips inside the player mesh | Call `spring_arm.add_excluded_object(player.get_rid())` |
| Using `_input()` instead of `_unhandled_input()` | Camera moves when clicking UI buttons | Switch to `_unhandled_input()` |
| Not clamping pitch | Camera flips upside down at ±90° | Clamp to ±89° or use quaternion math |
| Raycasting with player in collision mask | Camera collides with the player body | Set camera raycast to exclude player RID |
| Forgetting `Input.mouse_mode` | Mouse visible and escapes window during gameplay | Set `MOUSE_MODE_CAPTURED` in `_ready()` |
| Using `look_at()` when directly above target | Camera snaps or jitters | Check for near-parallel up vector, handle the degenerate case |
