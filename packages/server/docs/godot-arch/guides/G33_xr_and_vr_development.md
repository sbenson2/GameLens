# G33 — XR & VR Development

> **Category:** Guide · **Engine:** Godot 4.4+ · **Language:** GDScript / C#
> **Related:** [G4 Input Handling](./G4_input_handling.md) · [G5 Physics & Collision](./G5_physics_and_collision.md) · [G9 UI & Control Systems](./G9_ui_control_systems.md) · [G18 Performance Profiling](./G18_performance_profiling.md) · [G22 Mobile & Web Export](./G22_mobile_and_web_export.md)

---

## What This Guide Covers

Godot 4.4+ has first-class XR support via OpenXR — the cross-platform standard for VR, AR, and mixed reality. This guide covers project setup, the XR node hierarchy, controller and hand tracking input, interaction patterns (grab, point, teleport), XR-specific UI, performance targets for VR, and deploying to Meta Quest and SteamVR.

All code targets Godot 4.4+ with the OpenXR runtime. GDScript examples are fully typed, with C# equivalents for key patterns.

---

## Table of Contents

1. [XR Architecture in Godot](#1-xr-architecture-in-godot)
2. [Project Setup](#2-project-setup)
3. [Core XR Nodes](#3-core-xr-nodes)
4. [Controller Input](#4-controller-input)
5. [Hand Tracking](#5-hand-tracking)
6. [Interaction Patterns](#6-interaction-patterns)
7. [Locomotion](#7-locomotion)
8. [XR User Interface](#8-xr-user-interface)
9. [AR & Passthrough](#9-ar--passthrough)
10. [Performance for VR](#10-performance-for-vr)
11. [Deploying to Headsets](#11-deploying-to-headsets)
12. [Common Mistakes](#12-common-mistakes)

---

## 1. XR Architecture in Godot

Godot's XR system consists of three layers:

```
┌──────────────────────────────────────────────────────┐
│  Your Game Code (GDScript / C#)                       │
│    ↕  XR nodes: XROrigin3D, XRCamera3D, etc.         │
├──────────────────────────────────────────────────────┤
│  XRServer (singleton)                                 │
│    Manages interfaces, trackers, and poses            │
├──────────────────────────────────────────────────────┤
│  XR Interface (e.g., OpenXRInterface)                 │
│    Talks to the OpenXR runtime                        │
├──────────────────────────────────────────────────────┤
│  OpenXR Runtime (SteamVR, Oculus, Monado, etc.)       │
│    Platform-specific VR/AR driver                     │
└──────────────────────────────────────────────────────┘
```

**Key concept:** `XRServer` is the central hub. It holds references to the active `XRInterface` (typically `OpenXRInterface`), manages `XRTracker` objects (one per tracked device), and dispatches tracking data to `XRNode3D`-derived scene nodes.

---

## 2. Project Setup

### Step 1: Enable OpenXR

In **Project → Project Settings → XR**:

| Setting | Value | Notes |
|---------|-------|-------|
| `xr/openxr/enabled` | `true` | Enables the OpenXR plugin |
| `xr/openxr/default_action_map` | (auto) | Default action map file |
| `xr/openxr/environment_blend_mode` | `0` (Opaque) | `0` = VR, `1` = Additive AR, `2` = Alpha blend |
| `xr/shaders/enabled` | `true` | Required for stereo rendering |

### Step 2: Rendering Settings for VR

In **Project Settings → Rendering**:

| Setting | Recommended | Why |
|---------|-------------|-----|
| `renderer/rendering_method` | `mobile` or `forward_plus` | Mobile for Quest standalone, Forward+ for PCVR |
| `vrs/mode` | `2` (XR) | Variable Rate Shading — render foveal region at full res, periphery at lower |
| `anti_aliasing/quality/msaa_3d` | `2` (2x) or `4` (4x) | VR needs AA to avoid shimmer |

### Step 3: Startup Script

Create a startup script that initializes XR:

```gdscript
# xr_startup.gd
extends Node3D

var xr_interface: XRInterface

func _ready() -> void:
    xr_interface = XRServer.find_interface("OpenXR")
    if xr_interface and xr_interface.is_initialized():
        print("OpenXR already initialized")
        _start_xr()
    elif xr_interface:
        xr_interface.initialize()
        _start_xr()
    else:
        push_error("OpenXR interface not found. Check project settings.")


func _start_xr() -> void:
    # Tell the viewport to use the XR interface for rendering
    get_viewport().use_xr = true
    print("XR started: %s" % xr_interface.get_name())

    # Connect session state signals
    if xr_interface is OpenXRInterface:
        var openxr: OpenXRInterface = xr_interface as OpenXRInterface
        openxr.session_begun.connect(_on_session_begun)
        openxr.session_stopping.connect(_on_session_stopping)
        openxr.session_focussed.connect(_on_session_focussed)
        openxr.session_visible.connect(_on_session_visible)


func _on_session_begun() -> void:
    print("XR session begun")

func _on_session_stopping() -> void:
    print("XR session stopping")

func _on_session_focussed() -> void:
    print("XR session focussed — game is active")

func _on_session_visible() -> void:
    print("XR session visible — but not focused (system UI overlay?)")
```

### C# Startup

```csharp
using Godot;

public partial class XrStartup : Node3D
{
    private XRInterface _xrInterface;

    public override void _Ready()
    {
        _xrInterface = XRServer.FindInterface("OpenXR");
        if (_xrInterface != null)
        {
            _xrInterface.Initialize();
            GetViewport().UseXr = true;
            GD.Print($"XR started: {_xrInterface.GetName()}");
        }
        else
        {
            GD.PushError("OpenXR interface not found.");
        }
    }
}
```

---

## 3. Core XR Nodes

### Scene Tree Structure

Every XR scene follows this hierarchy:

```
XROrigin3D              ← World anchor (player's floor position)
├── XRCamera3D          ← Head-mounted display (auto-tracked)
├── XRController3D      ← Left hand (tracker: "left_hand")
│   ├── MeshInstance3D  ← Controller model
│   └── RayCast3D      ← Pointer ray
├── XRController3D      ← Right hand (tracker: "right_hand")
│   ├── MeshInstance3D
│   └── RayCast3D
└── XRNode3D (optional) ← Additional trackers (body, feet, etc.)
```

### Node Roles

| Node | Purpose | Auto-Tracked |
|------|---------|--------------|
| `XROrigin3D` | World-space anchor. Moving this moves the entire player rig | No (you move it for locomotion) |
| `XRCamera3D` | The player's eyes. Position/rotation tracked by HMD | Yes |
| `XRController3D` | A tracked controller or hand. Set `tracker` property to `"left_hand"` or `"right_hand"` | Yes |
| `XRNode3D` | Generic tracked point (body tracker, hip tracker, etc.) | Yes |

### Setting Up in Code

```gdscript
# xr_player.gd
extends XROrigin3D

@onready var camera: XRCamera3D = $XRCamera3D
@onready var left_controller: XRController3D = $LeftController
@onready var right_controller: XRController3D = $RightController

func _ready() -> void:
    left_controller.tracker = &"left_hand"
    right_controller.tracker = &"right_hand"

    # Connect button events
    left_controller.button_pressed.connect(_on_button_pressed.bind("left"))
    right_controller.button_pressed.connect(_on_button_pressed.bind("right"))

func _on_button_pressed(button_name: String, hand: String) -> void:
    print("%s hand pressed: %s" % [hand, button_name])
```

---

## 4. Controller Input

### OpenXR Action Map

Godot uses OpenXR's action system rather than raw button IDs. The default action map (`openxr_action_map.tres`) provides these standard actions:

| Action | Type | Binding |
|--------|------|---------|
| `trigger` | `float` | Index trigger analog |
| `trigger_click` | `bool` | Index trigger fully pressed |
| `grip` | `float` | Grip/squeeze analog |
| `grip_click` | `bool` | Grip fully pressed |
| `primary` | `Vector2` | Thumbstick / touchpad |
| `primary_click` | `bool` | Thumbstick press |
| `ax_button` | `bool` | A/X button |
| `by_button` | `bool` | B/Y button |
| `menu_button` | `bool` | Menu button |

### Reading Input

```gdscript
func _process(_delta: float) -> void:
    # Analog values
    var trigger_value: float = right_controller.get_float("trigger")
    var grip_value: float = right_controller.get_float("grip")
    var stick: Vector2 = left_controller.get_vector2("primary")

    # Button state
    var is_trigger_pressed: bool = right_controller.is_button_pressed("trigger_click")

    # Haptic feedback
    if is_trigger_pressed:
        right_controller.trigger_haptic_pulse(
            "haptic",     # action name
            0.0,          # frequency (0 = default)
            0.5,          # amplitude (0.0–1.0)
            0.1,          # duration in seconds
            0.0           # delay
        )
```

### Signal-Based Input

```gdscript
func _ready() -> void:
    right_controller.button_pressed.connect(_on_right_pressed)
    right_controller.button_released.connect(_on_right_released)
    right_controller.input_float_changed.connect(_on_right_float)

func _on_right_pressed(action: String) -> void:
    match action:
        "trigger_click":
            _fire_weapon()
        "grip_click":
            _grab_object()
        "ax_button":
            _jump()

func _on_right_released(action: String) -> void:
    match action:
        "grip_click":
            _release_object()

func _on_right_float(action: String, value: float) -> void:
    if action == "trigger":
        # Analog trigger for variable-force interaction
        _set_grab_strength(value)
```

---

## 5. Hand Tracking

Hand tracking provides skeletal data for each finger joint. Godot supports this via `XRHandTracker` (when the OpenXR runtime reports hand tracking capability).

### Checking Hand Tracking Availability

```gdscript
func _ready() -> void:
    var openxr: OpenXRInterface = XRServer.find_interface("OpenXR") as OpenXRInterface
    if openxr == null:
        return

    # Hand tracking is supported if the runtime provides it
    # Check tracker type at runtime
    XRServer.tracker_added.connect(_on_tracker_added)

func _on_tracker_added(tracker_name: StringName, type: int) -> void:
    if type == XRServer.TRACKER_HAND:
        print("Hand tracker available: %s" % tracker_name)
```

### Reading Hand Joint Positions

```gdscript
# Access hand tracking data via XRHandTracker
func _process(_delta: float) -> void:
    var hand_tracker: XRHandTracker = XRServer.get_tracker(&"left_hand") as XRHandTracker
    if hand_tracker == null:
        return

    # Get a specific joint transform (e.g., index finger tip)
    var index_tip: Transform3D = hand_tracker.get_hand_joint_transform(
        XRHandTracker.HAND_JOINT_INDEX_TIP
    )

    # Joint positions are in tracking space
    # Convert to world space through XROrigin3D
    var world_pos: Vector3 = global_transform * index_tip.origin
```

### Key Hand Joints

| Joint Constant | Finger | Position |
|---------------|--------|----------|
| `HAND_JOINT_WRIST` | — | Wrist |
| `HAND_JOINT_THUMB_TIP` | Thumb | Fingertip |
| `HAND_JOINT_INDEX_TIP` | Index | Fingertip |
| `HAND_JOINT_MIDDLE_TIP` | Middle | Fingertip |
| `HAND_JOINT_RING_TIP` | Ring | Fingertip |
| `HAND_JOINT_LITTLE_TIP` | Pinky | Fingertip |
| `HAND_JOINT_PALM` | — | Palm center |

### Pinch Gesture Detection

```gdscript
func _is_pinching(hand_tracker: XRHandTracker) -> bool:
    var thumb_tip: Vector3 = hand_tracker.get_hand_joint_transform(
        XRHandTracker.HAND_JOINT_THUMB_TIP
    ).origin
    var index_tip: Vector3 = hand_tracker.get_hand_joint_transform(
        XRHandTracker.HAND_JOINT_INDEX_TIP
    ).origin

    var distance: float = thumb_tip.distance_to(index_tip)
    return distance < 0.02  # ~2cm threshold
```

---

## 6. Interaction Patterns

### Grab / Pick Up Objects

```gdscript
# xr_grab.gd — Attach to XRController3D
extends XRController3D

@export var grab_distance: float = 0.15  # Meters
@onready var grab_area: Area3D = $GrabArea

var held_object: RigidBody3D = null
var _original_parent: Node = null

func _ready() -> void:
    button_pressed.connect(_on_button_pressed)
    button_released.connect(_on_button_released)

func _on_button_pressed(action: String) -> void:
    if action == "grip_click" and held_object == null:
        _try_grab()

func _on_button_released(action: String) -> void:
    if action == "grip_click" and held_object != null:
        _release()


func _try_grab() -> void:
    # Find closest grabbable body in range
    var bodies: Array[Node3D] = grab_area.get_overlapping_bodies()
    var closest: RigidBody3D = null
    var closest_dist: float = INF

    for body: Node3D in bodies:
        if body is RigidBody3D and body.is_in_group("grabbable"):
            var dist: float = global_position.distance_to(body.global_position)
            if dist < closest_dist:
                closest_dist = dist
                closest = body as RigidBody3D

    if closest == null:
        return

    held_object = closest
    _original_parent = held_object.get_parent()

    # Reparent to controller so it follows hand movement
    held_object.freeze = true
    _original_parent.remove_child(held_object)
    add_child(held_object)
    held_object.transform = Transform3D.IDENTITY

    # Haptic feedback on grab
    trigger_haptic_pulse("haptic", 0.0, 0.7, 0.05, 0.0)


func _release() -> void:
    if held_object == null:
        return

    # Calculate throw velocity from controller movement
    var velocity: Vector3 = Vector3.ZERO
    # XRController3D provides get_pose() for velocity data
    var pose: XRPose = XRServer.get_tracker(tracker).get_pose(&"default")
    if pose:
        velocity = pose.linear_velocity

    # Reparent back to world
    var world_transform: Transform3D = held_object.global_transform
    remove_child(held_object)
    _original_parent.add_child(held_object)
    held_object.global_transform = world_transform
    held_object.freeze = false
    held_object.linear_velocity = velocity

    held_object = null
```

### Ray Pointer (For UI and Distant Selection)

```gdscript
# xr_pointer.gd — Attach to XRController3D
extends XRController3D

@onready var ray: RayCast3D = $RayCast3D
@onready var laser_mesh: MeshInstance3D = $LaserMesh

var _hovered_object: Node3D = null

func _process(_delta: float) -> void:
    ray.force_raycast_update()

    if ray.is_colliding():
        var collider: Node3D = ray.get_collider() as Node3D
        _update_laser(ray.get_collision_point())

        if collider != _hovered_object:
            if _hovered_object and _hovered_object.has_method("on_pointer_exit"):
                _hovered_object.on_pointer_exit()
            _hovered_object = collider
            if _hovered_object.has_method("on_pointer_enter"):
                _hovered_object.on_pointer_enter()
    else:
        _update_laser(global_position + -global_transform.basis.z * 10.0)
        if _hovered_object:
            if _hovered_object.has_method("on_pointer_exit"):
                _hovered_object.on_pointer_exit()
            _hovered_object = null


func _update_laser(end_point: Vector3) -> void:
    var length: float = global_position.distance_to(end_point)
    laser_mesh.mesh = laser_mesh.mesh  # or update existing cylinder
    laser_mesh.scale = Vector3(0.002, 0.002, length)
    laser_mesh.position = Vector3(0, 0, -length / 2.0)
```

---

## 7. Locomotion

### Smooth Locomotion (Thumbstick)

```gdscript
# smooth_locomotion.gd — Attach to XROrigin3D
extends XROrigin3D

@export var move_speed: float = 2.0  # meters/second
@export var turn_speed: float = 60.0  # degrees/second
@export var dead_zone: float = 0.15

@onready var camera: XRCamera3D = $XRCamera3D

func _physics_process(delta: float) -> void:
    var left_stick: Vector2 = _get_stick("left_hand", "primary")
    var right_stick: Vector2 = _get_stick("right_hand", "primary")

    # Movement (left stick) — relative to head direction, projected to floor
    if left_stick.length() > dead_zone:
        var head_basis: Basis = camera.global_transform.basis
        var forward: Vector3 = -head_basis.z
        forward.y = 0.0
        forward = forward.normalized()
        var right: Vector3 = head_basis.x
        right.y = 0.0
        right = right.normalized()

        var movement: Vector3 = (forward * left_stick.y + right * left_stick.x) * move_speed * delta
        global_position += movement

    # Rotation (right stick X) — snap or smooth turn
    if absf(right_stick.x) > dead_zone:
        rotate_y(deg_to_rad(-right_stick.x * turn_speed * delta))


func _get_stick(tracker_name: String, action: String) -> Vector2:
    var tracker: XRPositionalTracker = XRServer.get_tracker(StringName(tracker_name))
    if tracker:
        var input: Variant = tracker.get_input(StringName(action))
        if input is Vector2:
            return input
    return Vector2.ZERO
```

### Snap Turn (Comfort Option)

```gdscript
@export var snap_angle: float = 30.0  # degrees
var _snap_cooldown: bool = false

func _handle_snap_turn(right_stick: Vector2) -> void:
    if absf(right_stick.x) > 0.7 and not _snap_cooldown:
        var direction: float = signf(right_stick.x)
        rotate_y(deg_to_rad(-direction * snap_angle))
        _snap_cooldown = true
    elif absf(right_stick.x) < 0.3:
        _snap_cooldown = false
```

### Teleport Locomotion

```gdscript
# teleport_locomotion.gd
extends XRController3D

@export var max_distance: float = 10.0
@export var arc_segments: int = 20
@export var teleport_button: String = "trigger_click"

@onready var arc_path: Path3D = $TeleportArc
@onready var target_indicator: Node3D = $TargetIndicator

var _is_aiming: bool = false
var _valid_target: bool = false
var _target_position: Vector3

func _ready() -> void:
    button_pressed.connect(_on_pressed)
    button_released.connect(_on_released)
    target_indicator.visible = false

func _on_pressed(action: String) -> void:
    if action == teleport_button:
        _is_aiming = true

func _on_released(action: String) -> void:
    if action == teleport_button and _is_aiming:
        _is_aiming = false
        target_indicator.visible = false
        if _valid_target:
            _teleport_to(_target_position)


func _process(delta: float) -> void:
    if not _is_aiming:
        return

    # Cast a parabolic arc from controller forward
    var start_pos: Vector3 = global_position
    var velocity: Vector3 = -global_transform.basis.z * 5.0  # Initial direction
    var gravity: Vector3 = Vector3(0, -9.8, 0)
    var step: float = 0.05

    _valid_target = false
    var space_state: PhysicsDirectSpaceState3D = get_world_3d().direct_space_state

    for i in arc_segments:
        var next_pos: Vector3 = start_pos + velocity * step
        velocity += gravity * step

        # Raycast between arc segments
        var query := PhysicsRayQueryParameters3D.create(start_pos, next_pos)
        query.collision_mask = 1  # Floor layer
        var result: Dictionary = space_state.intersect_ray(query)

        if result:
            _target_position = result["position"]
            _valid_target = true
            target_indicator.global_position = _target_position
            target_indicator.visible = true
            break

        start_pos = next_pos

    if not _valid_target:
        target_indicator.visible = false


func _teleport_to(target: Vector3) -> void:
    var xr_origin: XROrigin3D = get_parent() as XROrigin3D
    if xr_origin == null:
        return
    # Offset: keep camera's horizontal offset from origin
    var camera: XRCamera3D = xr_origin.get_node("XRCamera3D")
    var camera_offset: Vector3 = camera.global_position - xr_origin.global_position
    camera_offset.y = 0.0
    xr_origin.global_position = target - camera_offset
```

---

## 8. XR User Interface

Traditional 2D UI doesn't work in VR. You need spatial UI — `SubViewport` rendered onto a 3D surface.

### World-Space UI Panel

```gdscript
# xr_ui_panel.gd
extends StaticBody3D

## Renders a Control scene onto a 3D quad that responds to pointer interaction

@export var ui_scene: PackedScene
@export var viewport_size: Vector2i = Vector2i(800, 600)
@export var panel_size: Vector2 = Vector2(0.8, 0.6)  # meters

@onready var mesh: MeshInstance3D = $MeshInstance3D
@onready var collision: CollisionShape3D = $CollisionShape3D
@onready var sub_viewport: SubViewport = $SubViewport

func _ready() -> void:
    # Set up SubViewport
    sub_viewport.size = viewport_size
    sub_viewport.transparent_bg = true
    sub_viewport.render_target_update_mode = SubViewport.UPDATE_ALWAYS

    # Instance the UI scene into the viewport
    if ui_scene:
        var ui: Control = ui_scene.instantiate() as Control
        sub_viewport.add_child(ui)

    # Set up the quad mesh
    var quad := QuadMesh.new()
    quad.size = panel_size
    mesh.mesh = quad

    # Apply the viewport texture to the mesh
    var mat := StandardMaterial3D.new()
    mat.albedo_texture = sub_viewport.get_texture()
    mat.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
    mat.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
    mesh.material_override = mat

    # Collision shape matches the quad
    var shape := BoxShape3D.new()
    shape.size = Vector3(panel_size.x, panel_size.y, 0.01)
    collision.shape = shape


## Called by the XR pointer system when the ray hits this panel
func inject_pointer_event(local_point: Vector3, pressed: bool) -> void:
    # Convert 3D hit point to 2D viewport coordinates
    var local_2d: Vector2 = Vector2(
        (local_point.x / panel_size.x + 0.5) * viewport_size.x,
        (0.5 - local_point.y / panel_size.y) * viewport_size.y
    )

    # Create and inject mouse events into the SubViewport
    var event := InputEventMouseMotion.new()
    event.position = local_2d
    event.global_position = local_2d
    sub_viewport.push_input(event)

    if pressed:
        var click := InputEventMouseButton.new()
        click.position = local_2d
        click.global_position = local_2d
        click.button_index = MOUSE_BUTTON_LEFT
        click.pressed = true
        sub_viewport.push_input(click)
```

### Best Practices for VR UI

| Guideline | Reason |
|-----------|--------|
| Minimum text size: 24px at 1m distance | Readability at VR resolution |
| Panel distance: 1–2 meters | Comfortable focal range |
| Avoid pure white backgrounds | Causes glare in headsets |
| Use high-contrast colors | Low pixel density in VR |
| Attach menus to hand or world | Floating HUD causes motion sickness |
| Panel width ≤ 60° of FOV | Avoid excessive head turning |

---

## 9. AR & Passthrough

### Enabling Passthrough (Meta Quest)

```gdscript
func _enable_passthrough() -> void:
    var openxr: OpenXRInterface = XRServer.find_interface("OpenXR") as OpenXRInterface
    if openxr == null:
        return

    # Set environment blend mode to alpha blend
    openxr.environment_blend_mode = OpenXRInterface.XR_ENV_BLEND_MODE_ALPHA_BLEND

    # Make the viewport background transparent
    get_viewport().transparent_bg = true

    # Set the WorldEnvironment to transparent
    var env: Environment = $WorldEnvironment.environment
    env.background_mode = Environment.BG_COLOR
    env.background_color = Color(0, 0, 0, 0)
```

### Mixed Reality Scene Setup

For AR/MR, your virtual objects appear overlaid on the real world:

```
XROrigin3D
├── XRCamera3D           ← Shows passthrough + virtual objects
├── XRController3D (L)
├── XRController3D (R)
├── MeshInstance3D       ← Virtual object floating in real space
└── WorldEnvironment     ← Transparent background
```

**Tip:** Use physics raycasts against a floor plane (either detected by the runtime's scene understanding or placed manually) to anchor virtual objects to real surfaces.

---

## 10. Performance for VR

VR has strict performance requirements to avoid motion sickness.

### Target Frame Rates

| Platform | Required FPS | Frame Budget |
|----------|-------------|--------------|
| Meta Quest 2 | 72 Hz (90 Hz mode) | 13.8 ms (11.1 ms) |
| Meta Quest 3 | 90 Hz (120 Hz mode) | 11.1 ms (8.3 ms) |
| PCVR (SteamVR) | 90 Hz | 11.1 ms |
| PSVR2 | 90/120 Hz | 11.1/8.3 ms |

### Optimization Checklist

| Area | Technique | Impact |
|------|-----------|--------|
| **Draw calls** | Use MultiMesh for repeated geometry | High |
| **Shading** | Mobile renderer on Quest standalone | High |
| **VRS** | Enable XR Variable Rate Shading | Medium-High |
| **LOD** | Use `VisibilityNotifier3D` + LOD meshes | Medium |
| **Shadows** | Limit to 1 directional light, reduce shadow map size | Medium |
| **Physics** | Reduce physics tick rate if 90Hz isn't needed | Medium |
| **Textures** | Compress with ASTC for Quest, BC for PC | Medium |
| **Post-processing** | Minimize — no DOF, motion blur, or heavy bloom | High |
| **Transparency** | Avoid overlapping transparent surfaces | Medium |
| **GI** | Use baked lightmaps, not real-time GI on Quest | High |

### Godot-Specific VR Performance Settings

```gdscript
# Apply these at startup for Quest standalone:
func _configure_for_quest() -> void:
    # Reduce render resolution (foveated rendering handles the center)
    get_viewport().scaling_3d_scale = 0.85

    # Disable expensive post-processing
    var env: Environment = $WorldEnvironment.environment
    env.ssao_enabled = false
    env.ssil_enabled = false
    env.ssr_enabled = false
    env.glow_enabled = false
    env.volumetric_fog_enabled = false

    # Reduce shadow quality
    RenderingServer.directional_shadow_atlas_set_size(1024)
```

---

## 11. Deploying to Headsets

### Meta Quest (Android APK)

1. **Install Android build tools** in Editor Settings → Export → Android
2. **Create an export preset** for Android
3. **Set XR features** in the export preset:
   - `xr_features/xr_mode` = `1` (OpenXR)
   - `xr_features/hand_tracking` = `1` (Optional) or `2` (Required)
4. **Install the Godot OpenXR Vendors plugin** from the Asset Library — this adds Meta-specific extensions
5. **Set the package name** to your reverse-domain (`com.studio.game`)
6. **One-click deploy** via Remote Debug → Run on Device (with Quest in developer mode)

### SteamVR (PC)

1. **Export as Windows Desktop** (standard export)
2. Ensure OpenXR is enabled in project settings
3. SteamVR's OpenXR runtime handles the rest
4. For Steam distribution, the game launches SteamVR automatically if the user has it installed

### Tips for Both Platforms

| Concern | Solution |
|---------|----------|
| Controller models | Use `XRControllerModel3D` node — automatically loads the correct model for detected hardware |
| Fallback for missing tracking | Check `XRController3D.get_is_active()` before using pose data |
| Testing without headset | Use the XR Simulator plugin (Godot Asset Library) to emulate HMD with mouse/keyboard |

---

## 12. Common Mistakes

| Mistake | Fix |
|---------|-----|
| Moving `XRCamera3D` directly | The camera is auto-tracked by the HMD. Move `XROrigin3D` for locomotion |
| Using 2D UI nodes at root | 2D Controls won't render in VR. Use `SubViewport` + 3D mesh as described in Section 8 |
| Ignoring frame budget | Profile with Godot's built-in profiler. Every ms counts — a single frame spike causes judder |
| Not setting `use_xr = true` on viewport | Without this, the game renders flat to the headset, causing a 2D projection |
| Hard-coding Quest-only features | Always check `OpenXRInterface` capability queries. Not all runtimes support hand tracking or passthrough |
| Running Forward+ on Quest standalone | Use Mobile renderer. Forward+ is too heavy for mobile GPUs |
| Smooth turn as the only option | Always offer snap turn as a comfort option. Many players get motion sick from smooth rotation |
| Forgetting dead zones on thumbsticks | VR controllers have analog drift. Use a 0.1–0.2 dead zone |
| Physics interactions at tracking speed | VR hands move fast. Use `continuous_cd` on RigidBody3D for fast-moving grabbed objects |
| Not testing with real hardware | Mouse-simulated VR hides many comfort and ergonomic issues. Test on actual headsets early |

---

## Further Reading

- [Godot 4.4 XR Documentation](https://docs.godotengine.org/en/4.4/tutorials/xr/index.html)
- [Godot 4.4 Setting Up XR](https://docs.godotengine.org/en/4.4/tutorials/xr/setting_up_xr.html)
- [Godot 4.4 OpenXR Hand Tracking](https://docs.godotengine.org/en/4.4/tutorials/xr/openxr_hand_tracking.html)
- [Godot 4.4 OpenXR Settings](https://docs.godotengine.org/en/4.4/tutorials/xr/openxr_settings.html)
- [Godot XR Update — Feb 2025](https://godotengine.org/article/godot-xr-update-feb-2025/)
- [G4 — Input Handling](./G4_input_handling.md)
- [G18 — Performance Profiling](./G18_performance_profiling.md)
- [G22 — Mobile & Web Export](./G22_mobile_and_web_export.md)
