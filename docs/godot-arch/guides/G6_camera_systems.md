# G6 — Camera Systems
> **Category:** Guide · **Engine:** Godot 4.4+ · **Language:** GDScript  
> **Related:** [G1 Scene Composition](./G1_scene_composition.md) · [G2 State Machine](./G2_state_machine.md) · [G4 Input Handling](./G4_input_handling.md) · [G5 Physics & Collision](./G5_physics_and_collision.md) · [Camera Theory](../../core/concepts/camera-theory.md)

---

## What This Guide Covers

The camera is the player's window into your game world. A great camera feels invisible — a bad one makes even good games feel broken. This guide covers Godot's `Camera2D` node in depth: follow modes, smoothing, deadzone, limits, look-ahead, screen shake, zoom, multi-target framing, cinematic sequences, camera transitions, split-screen, pixel-perfect rendering, and camera zones.

All code targets Godot 4.4+ with typed GDScript. For engine-agnostic camera theory (damping, deadzone math, parallax), see [Camera Theory](../../core/concepts/camera-theory.md).

---

## Table of Contents

1. [Camera2D Fundamentals](#camera2d-fundamentals)
2. [Camera Pipeline](#camera-pipeline)
3. [Follow Modes](#follow-modes)
4. [Smoothing & Damping](#smoothing--damping)
5. [Deadzone](#deadzone)
6. [Camera Limits](#camera-limits)
7. [Look-Ahead](#look-ahead)
8. [Screen Shake](#screen-shake)
9. [Zoom System](#zoom-system)
10. [Multi-Target Camera](#multi-target-camera)
11. [Cinematic Camera](#cinematic-camera)
12. [Camera Transitions](#camera-transitions)
13. [Camera Zones](#camera-zones)
14. [Pixel-Perfect Camera](#pixel-perfect-camera)
15. [Split Screen](#split-screen)
16. [Camera State Machine](#camera-state-machine)
17. [Common Mistakes](#common-mistakes)
18. [Performance Considerations](#performance-considerations)
19. [Tuning Reference](#tuning-reference)
20. [See Also](#see-also)

---

## Camera2D Fundamentals

Godot's `Camera2D` is a built-in node that controls the viewport's visible region. Unlike many engines where you build a camera from scratch, Godot provides a feature-rich camera node out of the box.

### Scene Tree Placement

The camera can live in two places, each with different behavior:

```
# Option A: Child of player (follows automatically)
Player (CharacterBody2D)
├── Sprite2D
├── CollisionShape2D
└── Camera2D          ← moves with parent

# Option B: Separate node (manual control)
Main (Node2D)
├── Player (CharacterBody2D)
├── Camera2D          ← follows via script
└── TileMapLayer
```

**Option A** is simpler — the camera inherits the player's position automatically. **Option B** gives you full control (required for multi-target, cinematic, and transition cameras).

### Essential Properties

```gdscript
# Camera2D key properties
@export var camera: Camera2D

func setup_camera() -> void:
    camera.enabled = true              # Only one camera active per viewport
    camera.anchor_mode = Camera2D.ANCHOR_MODE_DRAG_CENTER  # Centers on position
    camera.ignore_rotation = true      # Don't rotate with parent (usually want this)
    camera.process_callback = Camera2D.CAMERA2D_PROCESS_PHYSICS  # Sync with physics
```

### Making a Camera Current

Only one `Camera2D` can be active per viewport. Switch with:

```gdscript
camera.make_current()    # Activate this camera
camera.enabled = false   # Deactivate (reverts to previous)

# Check which camera is active
if camera.is_current():
    pass
```

---

## Camera Pipeline

Every frame, the camera resolves its final position through a pipeline. Understanding this order prevents the most common camera bugs:

```
┌─────────────────────────────────────────────────────┐
│               Camera Update Pipeline                 │
├─────────────────────────────────────────────────────┤
│                                                      │
│  1. Resolve Target   → Who/what to follow?           │
│         │               (player, multi-target,       │
│         │                cinematic waypoint)          │
│         ▼                                            │
│  2. Apply Follow     → Smoothing / deadzone /        │
│         │               look-ahead offset            │
│         ▼                                            │
│  3. Clamp to Limits  → Keep view inside map bounds   │
│         │                                            │
│         ▼                                            │
│  4. Apply Shake      → Add shake offset              │
│         │               (AFTER clamping so shake     │
│         │                can push past limits)        │
│         ▼                                            │
│  5. Apply Zoom       → Scale the view                │
│         │                                            │
│         ▼                                            │
│  6. Transform Viewport → Final render position       │
│                                                      │
└─────────────────────────────────────────────────────┘
```

**Critical rule:** Apply shake AFTER clamping. If you clamp after shake, the shake gets eaten at map edges and feels wrong.

---

## Follow Modes

### Instant Follow (Child Camera)

The simplest approach — make Camera2D a child of the player:

```gdscript
# Player.tscn scene tree:
# Player (CharacterBody2D)
#   ├── Sprite2D
#   ├── CollisionShape2D
#   └── Camera2D

# No code needed — camera follows parent automatically
# Add an offset to look slightly ahead or above:
# Camera2D.offset = Vector2(0, -40)  ← look 40px above player
```

Good for: fast-paced games where the camera should never lag behind (bullet hell, fast platformers).

### Smooth Follow (Lerp)

For a camera that glides toward the target instead of snapping:

```gdscript
class_name SmoothCamera
extends Camera2D

@export var target: Node2D
@export var follow_speed: float = 5.0

func _physics_process(delta: float) -> void:
    if not target:
        return
    global_position = global_position.lerp(target.global_position, follow_speed * delta)
```

> **Why `follow_speed * delta` instead of a flat lerp factor?**  
> A flat factor like `lerp(pos, target, 0.1)` is framerate-dependent — at 120 FPS the camera moves twice as fast as at 60 FPS. Multiplying by delta makes the follow speed consistent regardless of framerate. For truly framerate-independent lerp, use exponential smoothing (see next section).

### Exponential Smoothing (Framerate-Independent)

The mathematically correct approach for framerate-independent smoothing:

```gdscript
class_name SmoothCamera
extends Camera2D

## The node this camera follows.
@export var target: Node2D
## How quickly the camera catches up. Higher = faster. 0 = no movement.
@export_range(0.0, 20.0) var smoothing: float = 5.0

func _physics_process(delta: float) -> void:
    if not target:
        return
    var weight: float = 1.0 - exp(-smoothing * delta)
    global_position = global_position.lerp(target.global_position, weight)
```

`exp(-smoothing * delta)` produces identical visual results at any framerate. This is the recommended approach for all camera smoothing.

### Using Built-in Smoothing

Godot's Camera2D has built-in smoothing via `position_smoothing_enabled`:

```gdscript
# In the editor or via code:
camera.position_smoothing_enabled = true
camera.position_smoothing_speed = 5.0  # Higher = faster catch-up
```

This uses Godot's internal smoothing which handles framerate independence automatically. It works well for simple cases but doesn't give you fine control over the smoothing curve or axis-independent speeds.

---

## Smoothing & Damping

### Axis-Independent Smoothing

Many games need different follow speeds on X and Y. Platformers often want fast horizontal follow but slower vertical follow (so the camera doesn't bob with every jump):

```gdscript
class_name AxisCamera
extends Camera2D

@export var target: Node2D
@export var smoothing_x: float = 8.0   # Fast horizontal
@export var smoothing_y: float = 3.0   # Slow vertical

func _physics_process(delta: float) -> void:
    if not target:
        return
    var target_pos: Vector2 = target.global_position
    var weight_x: float = 1.0 - exp(-smoothing_x * delta)
    var weight_y: float = 1.0 - exp(-smoothing_y * delta)
    global_position.x = lerpf(global_position.x, target_pos.x, weight_x)
    global_position.y = lerpf(global_position.y, target_pos.y, weight_y)
```

### Vertical Snap (Platformer Pattern)

In platformers, the camera should follow horizontally but only update vertically when the player lands — not mid-jump:

```gdscript
class_name PlatformerCamera
extends Camera2D

@export var target: CharacterBody2D
@export var smoothing_x: float = 8.0
@export var smoothing_y: float = 5.0
## Vertical position only updates when grounded.
@export var snap_to_ground: bool = true

var _last_ground_y: float = 0.0

func _physics_process(delta: float) -> void:
    if not target:
        return
    
    # Horizontal: always follow
    var weight_x: float = 1.0 - exp(-smoothing_x * delta)
    global_position.x = lerpf(global_position.x, target.global_position.x, weight_x)
    
    # Vertical: only update target when grounded
    if target.is_on_floor():
        _last_ground_y = target.global_position.y
    
    var vertical_target: float = _last_ground_y if snap_to_ground else target.global_position.y
    var weight_y: float = 1.0 - exp(-smoothing_y * delta)
    global_position.y = lerpf(global_position.y, vertical_target, weight_y)
```

### Velocity-Based Damping

Adjust smoothing speed based on how fast the target moves — tight follow during slow movement, looser follow during fast movement:

```gdscript
class_name VelocityDampedCamera
extends Camera2D

@export var target: CharacterBody2D
@export var slow_smoothing: float = 10.0  # When target barely moves
@export var fast_smoothing: float = 3.0   # When target is sprinting
@export var velocity_threshold: float = 300.0  # Speed at which we switch

func _physics_process(delta: float) -> void:
    if not target:
        return
    var speed: float = target.velocity.length()
    var t: float = clampf(speed / velocity_threshold, 0.0, 1.0)
    var smoothing: float = lerpf(slow_smoothing, fast_smoothing, t)
    var weight: float = 1.0 - exp(-smoothing * delta)
    global_position = global_position.lerp(target.global_position, weight)
```

---

## Deadzone

A deadzone is a region in the center of the screen where the target can move without the camera following. The camera only moves when the target exits the deadzone. This reduces camera motion during small movements and makes the game feel calmer.

### Built-in Deadzone

Camera2D supports deadzone natively:

```gdscript
# Enable drag (required for deadzone to work)
camera.drag_horizontal_enabled = true
camera.drag_vertical_enabled = true

# Deadzone as fraction of screen (0.0 to 1.0)
camera.drag_left_margin = 0.2    # 20% from left edge
camera.drag_right_margin = 0.2   # 20% from right edge
camera.drag_top_margin = 0.1     # 10% from top
camera.drag_bottom_margin = 0.3  # 30% from bottom (more room below)
```

### Custom Deadzone with Directional Bias

The built-in deadzone is symmetrical. For asymmetric deadzones (common in platformers where you want more room in the direction of movement):

```gdscript
class_name DeadzoneCamera
extends Camera2D

@export var target: Node2D
@export var smoothing: float = 5.0
## Deadzone half-size in pixels.
@export var deadzone: Vector2 = Vector2(80, 50)

func _physics_process(delta: float) -> void:
    if not target:
        return
    
    var target_pos: Vector2 = target.global_position
    var desired: Vector2 = global_position
    
    # Only move camera when target exits deadzone
    if target_pos.x > global_position.x + deadzone.x:
        desired.x = target_pos.x - deadzone.x
    elif target_pos.x < global_position.x - deadzone.x:
        desired.x = target_pos.x + deadzone.x
    
    if target_pos.y > global_position.y + deadzone.y:
        desired.y = target_pos.y - deadzone.y
    elif target_pos.y < global_position.y - deadzone.y:
        desired.y = target_pos.y + deadzone.y
    
    var weight: float = 1.0 - exp(-smoothing * delta)
    global_position = global_position.lerp(desired, weight)
```

### Visualizing the Deadzone (Debug)

```gdscript
# Add to DeadzoneCamera
func _draw() -> void:
    if not Engine.is_editor_hint() and not OS.is_debug_build():
        return
    # Draw deadzone rect in semi-transparent red
    var rect := Rect2(-deadzone, deadzone * 2.0)
    draw_rect(rect, Color(1, 0, 0, 0.2))
    draw_rect(rect, Color(1, 0, 0, 0.5), false, 2.0)
```

---

## Camera Limits

Limits prevent the camera from showing areas outside your game map (black void, invisible walls, etc.).

### Built-in Limits

```gdscript
# Set limits in pixels (world coordinates)
camera.limit_left = 0
camera.limit_top = 0
camera.limit_right = 3200    # Map width in pixels
camera.limit_bottom = 1800   # Map height in pixels

# Smooth limit transitions (prevents snapping at edges)
camera.limit_smoothed = true
```

### Auto-Limits from TileMapLayer

Calculate limits automatically from your tilemap:

```gdscript
class_name CameraLimiter
extends Node

@export var camera: Camera2D
@export var tilemap: TileMapLayer

func _ready() -> void:
    _update_limits()

func _update_limits() -> void:
    if not tilemap or not camera:
        return
    var used_rect: Rect2i = tilemap.get_used_rect()
    var tile_size: Vector2i = tilemap.tile_set.tile_size
    
    camera.limit_left = used_rect.position.x * tile_size.x
    camera.limit_top = used_rect.position.y * tile_size.y
    camera.limit_right = used_rect.end.x * tile_size.x
    camera.limit_bottom = used_rect.end.y * tile_size.y
```

### Small Room Centering

When the map is smaller than the viewport, the camera should center on the map instead of clamping awkwardly:

```gdscript
func _apply_limits(desired_pos: Vector2) -> Vector2:
    var viewport_size: Vector2 = get_viewport_rect().size / zoom
    var half_vp: Vector2 = viewport_size * 0.5
    
    var map_width: float = limit_right - limit_left
    var map_height: float = limit_bottom - limit_top
    
    var result: Vector2 = desired_pos
    
    # If map is narrower than viewport, center horizontally
    if map_width < viewport_size.x:
        result.x = limit_left + map_width * 0.5
    else:
        result.x = clampf(result.x, limit_left + half_vp.x, limit_right - half_vp.x)
    
    # If map is shorter than viewport, center vertically
    if map_height < viewport_size.y:
        result.y = limit_top + map_height * 0.5
    else:
        result.y = clampf(result.y, limit_top + half_vp.y, limit_bottom - half_vp.y)
    
    return result
```

---

## Look-Ahead

Look-ahead shifts the camera in the direction the player is moving (or facing), showing more of what's coming. Essential for platformers and action games.

### Direction-Based Look-Ahead

```gdscript
class_name LookAheadCamera
extends Camera2D

@export var target: CharacterBody2D
@export var smoothing: float = 5.0
## How far ahead to look (pixels).
@export var look_ahead_distance: float = 80.0
## How quickly the look-ahead shifts.
@export var look_ahead_speed: float = 3.0

var _look_offset: Vector2 = Vector2.ZERO

func _physics_process(delta: float) -> void:
    if not target:
        return
    
    # Calculate desired look-ahead from velocity
    var desired_offset: Vector2 = Vector2.ZERO
    if target.velocity.length_squared() > 100.0:  # Small threshold to ignore micro-movement
        desired_offset = target.velocity.normalized() * look_ahead_distance
    
    # Smooth the offset change (prevents jarring shifts on direction change)
    var offset_weight: float = 1.0 - exp(-look_ahead_speed * delta)
    _look_offset = _look_offset.lerp(desired_offset, offset_weight)
    
    # Follow target + offset
    var target_pos: Vector2 = target.global_position + _look_offset
    var weight: float = 1.0 - exp(-smoothing * delta)
    global_position = global_position.lerp(target_pos, weight)
```

### Mouse-Based Look-Ahead

In twin-stick or aim-based games, shift the camera toward where the player is aiming:

```gdscript
class_name MouseLookCamera
extends Camera2D

@export var target: Node2D
@export var smoothing: float = 5.0
## How much the cursor influences camera position (0.0 to 1.0).
@export_range(0.0, 1.0) var mouse_influence: float = 0.3
## Maximum offset from cursor (pixels).
@export var max_mouse_offset: float = 150.0

func _physics_process(delta: float) -> void:
    if not target:
        return
    
    var mouse_pos: Vector2 = get_global_mouse_position()
    var to_mouse: Vector2 = mouse_pos - target.global_position
    
    # Clamp and scale the mouse offset
    if to_mouse.length() > max_mouse_offset:
        to_mouse = to_mouse.normalized() * max_mouse_offset
    var mouse_offset: Vector2 = to_mouse * mouse_influence
    
    var desired: Vector2 = target.global_position + mouse_offset
    var weight: float = 1.0 - exp(-smoothing * delta)
    global_position = global_position.lerp(desired, weight)
```

### Combined Look-Ahead (Velocity + Facing)

For platformers, combine horizontal look-ahead with facing direction:

```gdscript
class_name PlatformerLookAhead
extends Camera2D

@export var target: CharacterBody2D
@export var smoothing: float = 5.0
@export var look_ahead_x: float = 60.0   # Pixels ahead of facing direction
@export var look_ahead_y: float = -30.0   # Look slightly above player
@export var look_speed: float = 3.0

var _facing: float = 1.0  # 1.0 = right, -1.0 = left
var _look_offset: Vector2 = Vector2.ZERO

func _physics_process(delta: float) -> void:
    if not target:
        return
    
    # Update facing direction (only when moving, not on stop)
    if absf(target.velocity.x) > 10.0:
        _facing = signf(target.velocity.x)
    
    var desired_offset := Vector2(_facing * look_ahead_x, look_ahead_y)
    var offset_weight: float = 1.0 - exp(-look_speed * delta)
    _look_offset = _look_offset.lerp(desired_offset, offset_weight)
    
    var desired_pos: Vector2 = target.global_position + _look_offset
    var weight: float = 1.0 - exp(-smoothing * delta)
    global_position = global_position.lerp(desired_pos, weight)
```

---

## Screen Shake

Screen shake provides visceral feedback for impacts, explosions, and damage. The key is making it feel powerful without being nauseating.

### Noise-Based Shake (Recommended)

Perlin noise produces organic shake that feels better than random offsets:

```gdscript
class_name CameraShaker
extends Node

## The camera to shake. Auto-detects parent Camera2D if not set.
@export var camera: Camera2D

var _trauma: float = 0.0       # Current shake intensity (0.0 to 1.0)
var _noise: FastNoiseLite      # Perlin noise generator
var _noise_y: float = 0.0      # Noise sample offset (advances over time)

## Maximum shake offset in pixels.
@export var max_offset: float = 16.0
## Maximum rotation in radians.
@export var max_rotation: float = 0.05
## How quickly trauma decays.
@export var decay_rate: float = 2.0
## Noise frequency (higher = more jittery).
@export var noise_speed: float = 30.0
## Trauma exponent (2.0 = quadratic falloff, feels natural).
@export var trauma_power: float = 2.0

func _ready() -> void:
    if not camera:
        camera = get_parent() as Camera2D
    _noise = FastNoiseLite.new()
    _noise.noise_type = FastNoiseLite.TYPE_SIMPLEX_SMOOTH
    _noise.frequency = 1.0

func _process(delta: float) -> void:
    if _trauma <= 0.0:
        camera.offset = Vector2.ZERO
        camera.rotation = 0.0
        return
    
    _trauma = maxf(_trauma - decay_rate * delta, 0.0)
    _noise_y += noise_speed * delta
    
    var shake_amount: float = pow(_trauma, trauma_power)
    
    # Sample noise at different offsets for X, Y, and rotation
    camera.offset = Vector2(
        _noise.get_noise_2d(1.0, _noise_y) * max_offset * shake_amount,
        _noise.get_noise_2d(100.0, _noise_y) * max_offset * shake_amount
    )
    camera.rotation = _noise.get_noise_2d(200.0, _noise_y) * max_rotation * shake_amount

## Add trauma (clamped to 1.0). Call this from gameplay code.
func add_trauma(amount: float) -> void:
    _trauma = minf(_trauma + amount, 1.0)
```

Usage from gameplay code:

```gdscript
# In your player or combat system:
@onready var shaker: CameraShaker = $Camera2D/CameraShaker

func take_damage(amount: int) -> void:
    health -= amount
    shaker.add_trauma(0.4)  # Medium shake

func on_explosion() -> void:
    shaker.add_trauma(0.8)  # Heavy shake
```

### Directional Shake

For hits and impacts, shake in the direction of the force:

```gdscript
## Add directional trauma. Direction is normalized internally.
func add_directional_trauma(amount: float, direction: Vector2) -> void:
    _trauma = minf(_trauma + amount, 1.0)
    # Apply an immediate kick in the impact direction
    camera.offset += direction.normalized() * max_offset * amount * 0.5

## Example: enemy hit from the right
# shaker.add_directional_trauma(0.5, Vector2.LEFT)  # Camera kicks left
```

### Shake Presets

```gdscript
## Preset shake amounts for consistent game feel
class ShakePreset:
    const LIGHT: float  = 0.2   # Footstep, small pickup
    const MEDIUM: float = 0.4   # Melee hit, jump land
    const HEAVY: float  = 0.6   # Explosion, boss attack
    const MEGA: float   = 1.0   # Screen-filling event, death

# Usage:
# shaker.add_trauma(ShakePreset.HEAVY)
```

---

## Zoom System

### Smooth Zoom

```gdscript
class_name ZoomableCamera
extends Camera2D

@export var min_zoom: float = 0.5    # Zoomed out (see more)
@export var max_zoom: float = 2.0    # Zoomed in (see less)
@export var zoom_speed: float = 5.0  # Smoothing speed
@export var zoom_step: float = 0.1   # Per scroll-wheel step

var _target_zoom: float = 1.0

func _unhandled_input(event: InputEvent) -> void:
    if event is InputEventMouseButton:
        if event.pressed:
            if event.button_index == MOUSE_BUTTON_WHEEL_UP:
                _target_zoom = minf(_target_zoom + zoom_step, max_zoom)
            elif event.button_index == MOUSE_BUTTON_WHEEL_DOWN:
                _target_zoom = maxf(_target_zoom - zoom_step, min_zoom)

func _process(delta: float) -> void:
    var weight: float = 1.0 - exp(-zoom_speed * delta)
    var current: float = zoom.x  # Uniform zoom — x and y are equal
    var new_zoom: float = lerpf(current, _target_zoom, weight)
    zoom = Vector2(new_zoom, new_zoom)
```

### Zoom to Cursor

When zooming in, the viewport should zoom toward the mouse position (like map applications):

```gdscript
func _zoom_toward_point(point: Vector2, new_zoom_level: float) -> void:
    var old_zoom: float = zoom.x
    var zoom_ratio: float = new_zoom_level / old_zoom
    
    # Adjust position so the point stays fixed on screen
    global_position += (point - global_position) * (1.0 - 1.0 / zoom_ratio)
    zoom = Vector2(new_zoom_level, new_zoom_level)
```

### Context-Sensitive Zoom

Automatically zoom based on gameplay state:

```gdscript
class_name ContextZoomCamera
extends Camera2D

@export var target: CharacterBody2D
@export var default_zoom: float = 1.0
@export var combat_zoom: float = 0.8    # Zoom out during combat
@export var dialogue_zoom: float = 1.3  # Zoom in during dialogue
@export var zoom_speed: float = 3.0

var _target_zoom: float = 1.0

func set_context(context: StringName) -> void:
    match context:
        &"default":
            _target_zoom = default_zoom
        &"combat":
            _target_zoom = combat_zoom
        &"dialogue":
            _target_zoom = dialogue_zoom

func _process(delta: float) -> void:
    var weight: float = 1.0 - exp(-zoom_speed * delta)
    var z: float = lerpf(zoom.x, _target_zoom, weight)
    zoom = Vector2(z, z)
```

---

## Multi-Target Camera

A camera that frames multiple targets — essential for local co-op, boss fights, and sports games.

### Basic Multi-Target

```gdscript
class_name MultiTargetCamera
extends Camera2D

## Nodes to keep in frame. Assign via editor or code.
@export var targets: Array[Node2D] = []
@export var smoothing: float = 5.0
## Extra padding around targets (pixels at zoom=1).
@export var padding: Vector2 = Vector2(100, 80)
@export var min_zoom: float = 0.3
@export var max_zoom: float = 1.5
@export var zoom_speed: float = 3.0

func _physics_process(delta: float) -> void:
    var active: Array[Node2D] = _get_active_targets()
    if active.is_empty():
        return
    
    # Calculate bounding box of all targets
    var bounds: Rect2 = Rect2(active[0].global_position, Vector2.ZERO)
    for i in range(1, active.size()):
        bounds = bounds.expand(active[i].global_position)
    
    # Center point
    var center: Vector2 = bounds.get_center()
    
    # Calculate required zoom to fit all targets
    var viewport_size: Vector2 = get_viewport_rect().size
    var bounds_with_padding: Vector2 = bounds.size + padding * 2.0
    
    var zoom_x: float = viewport_size.x / maxf(bounds_with_padding.x, 1.0)
    var zoom_y: float = viewport_size.y / maxf(bounds_with_padding.y, 1.0)
    var target_zoom: float = clampf(minf(zoom_x, zoom_y), min_zoom, max_zoom)
    
    # Smooth position
    var pos_weight: float = 1.0 - exp(-smoothing * delta)
    global_position = global_position.lerp(center, pos_weight)
    
    # Smooth zoom
    var zoom_weight: float = 1.0 - exp(-zoom_speed * delta)
    var z: float = lerpf(zoom.x, target_zoom, zoom_weight)
    zoom = Vector2(z, z)

func _get_active_targets() -> Array[Node2D]:
    var result: Array[Node2D] = []
    for t in targets:
        if is_instance_valid(t) and t.is_inside_tree():
            result.append(t)
    return result
```

### Boss-Fight Framing

During boss fights, frame both the player and the boss with the boss taking more visual priority:

```gdscript
func get_boss_frame_center(player: Node2D, boss: Node2D) -> Vector2:
    # Bias toward boss (60% boss, 40% player)
    return player.global_position.lerp(boss.global_position, 0.6)
```

### Dynamic Split/Merge (Co-op)

When players are close, use one camera. When they separate beyond a threshold, split into two viewports:

```gdscript
class_name SplitMergeManager
extends Node

@export var player_a: Node2D
@export var player_b: Node2D
@export var camera_shared: MultiTargetCamera
@export var split_distance: float = 600.0
@export var merge_distance: float = 400.0  # Hysteresis prevents flickering

var _is_split: bool = false

signal split_activated
signal merge_activated

func _process(_delta: float) -> void:
    if not player_a or not player_b:
        return
    var dist: float = player_a.global_position.distance_to(player_b.global_position)
    
    if not _is_split and dist > split_distance:
        _is_split = true
        split_activated.emit()
    elif _is_split and dist < merge_distance:
        _is_split = false
        merge_activated.emit()
```

---

## Cinematic Camera

For cutscenes, dialogue sequences, and scripted moments.

### Waypoint Sequence

```gdscript
class_name CinematicCamera
extends Camera2D

signal sequence_finished

@export var move_speed: float = 4.0
@export var zoom_speed: float = 2.0

var _waypoints: Array[CameraWaypoint] = []
var _current_index: int = 0
var _is_playing: bool = false
var _wait_timer: float = 0.0

func play_sequence(waypoints: Array[CameraWaypoint]) -> void:
    _waypoints = waypoints
    _current_index = 0
    _is_playing = true
    _wait_timer = 0.0

func _physics_process(delta: float) -> void:
    if not _is_playing or _waypoints.is_empty():
        return
    
    var wp: CameraWaypoint = _waypoints[_current_index]
    
    # Wait at waypoint
    if _wait_timer > 0.0:
        _wait_timer -= delta
        if _wait_timer <= 0.0:
            _advance_waypoint()
        return
    
    # Move toward waypoint
    var speed: float = wp.speed if wp.speed > 0.0 else move_speed
    var pos_weight: float = 1.0 - exp(-speed * delta)
    global_position = global_position.lerp(wp.position, pos_weight)
    
    # Zoom toward waypoint
    if wp.zoom > 0.0:
        var z_weight: float = 1.0 - exp(-zoom_speed * delta)
        var z: float = lerpf(zoom.x, wp.zoom, z_weight)
        zoom = Vector2(z, z)
    
    # Check if we've arrived
    if global_position.distance_squared_to(wp.position) < 4.0:
        if wp.hold_time > 0.0:
            _wait_timer = wp.hold_time
        else:
            _advance_waypoint()

func _advance_waypoint() -> void:
    _current_index += 1
    if _current_index >= _waypoints.size():
        _is_playing = false
        sequence_finished.emit()
```

### Camera Waypoint Resource

```gdscript
class_name CameraWaypoint
extends Resource

@export var position: Vector2
@export var zoom: float = 1.0
@export var hold_time: float = 0.0   # Seconds to pause at this waypoint
@export var speed: float = 0.0      # Override move speed (0 = use default)
```

### Triggering Cinematics

```gdscript
# In your level or cutscene manager:
func play_boss_intro(boss: Node2D) -> void:
    var cinematic_cam: CinematicCamera = $CinematicCamera
    cinematic_cam.make_current()
    
    var waypoints: Array[CameraWaypoint] = []
    
    # Pan to arena entrance
    var wp1 := CameraWaypoint.new()
    wp1.position = $ArenaEntrance.global_position
    wp1.hold_time = 1.0
    waypoints.append(wp1)
    
    # Zoom in on boss
    var wp2 := CameraWaypoint.new()
    wp2.position = boss.global_position
    wp2.zoom = 1.5
    wp2.hold_time = 2.0
    waypoints.append(wp2)
    
    # Pull back to arena view
    var wp3 := CameraWaypoint.new()
    wp3.position = $ArenaCenter.global_position
    wp3.zoom = 0.8
    waypoints.append(wp3)
    
    cinematic_cam.play_sequence(waypoints)
    await cinematic_cam.sequence_finished
    
    # Return to player camera
    $PlayerCamera.make_current()
```

---

## Camera Transitions

Smooth transitions between cameras (e.g., player camera → cinematic camera → new area camera).

### Tween-Based Transition

```gdscript
class_name CameraTransition
extends Node

## Transition the viewport from one camera to another with a smooth blend.
static func blend(
    from_cam: Camera2D,
    to_cam: Camera2D,
    duration: float = 1.0,
    ease_type: Tween.EaseType = Tween.EASE_IN_OUT,
    trans_type: Tween.TransitionType = Tween.TRANS_CUBIC
) -> void:
    # Store to_cam's target state
    var target_pos: Vector2 = to_cam.global_position
    var target_zoom: Vector2 = to_cam.zoom
    
    # Temporarily move to_cam to from_cam's position
    to_cam.global_position = from_cam.global_position
    to_cam.zoom = from_cam.zoom
    to_cam.make_current()
    
    # Tween to the desired position
    var tween: Tween = to_cam.create_tween()
    tween.set_parallel(true)
    tween.tween_property(to_cam, "global_position", target_pos, duration) \
        .set_ease(ease_type).set_trans(trans_type)
    tween.tween_property(to_cam, "zoom", target_zoom, duration) \
        .set_ease(ease_type).set_trans(trans_type)
    
    await tween.finished
```

### Fade Transition

For hard camera cuts, use a fade to black:

```gdscript
class_name FadeTransition
extends CanvasLayer

## Must be on a CanvasLayer above everything else.
@onready var color_rect: ColorRect = $ColorRect  # Full-screen black rect

func transition_cameras(
    from_cam: Camera2D,
    to_cam: Camera2D,
    fade_duration: float = 0.3
) -> void:
    # Fade to black
    var tween: Tween = create_tween()
    color_rect.color = Color(0, 0, 0, 0)
    color_rect.visible = true
    tween.tween_property(color_rect, "color:a", 1.0, fade_duration)
    await tween.finished
    
    # Switch camera while screen is black
    to_cam.make_current()
    
    # Fade from black
    tween = create_tween()
    tween.tween_property(color_rect, "color:a", 0.0, fade_duration)
    await tween.finished
    color_rect.visible = false
```

### Transition Types Summary

| Type | When to Use | Feel |
|------|-------------|------|
| Smooth blend | Same-scene transitions (player → boss focus) | Seamless, cinematic |
| Fade to black | Scene changes, teleports | Clean break |
| Crossfade | Between similar scenes | Dreamy, soft |
| Hard cut | Fast-paced, intentional | Jarring (on purpose) |
| Iris/circle wipe | Retro games, comedic tone | Nostalgic |

---

## Camera Zones

Define regions in your level that override camera behavior — zoom in for tight corridors, lock vertically for climbing sections, zoom out for grand vistas.

### Area2D Camera Zone

```gdscript
class_name CameraZone
extends Area2D

## Target zoom when player enters this zone.
@export var zone_zoom: float = 1.0
## Override camera limits within this zone. Leave at 0 to inherit.
@export var override_limits: bool = false
@export var zone_limit_left: int = 0
@export var zone_limit_right: int = 0
@export var zone_limit_top: int = 0
@export var zone_limit_bottom: int = 0
## Lock camera to a fixed position (useful for arena rooms).
@export var lock_position: bool = false
## Custom offset applied to camera while in zone.
@export var zone_offset: Vector2 = Vector2.ZERO
## Priority when zones overlap. Higher wins.
@export var priority: int = 0

signal zone_entered(zone: CameraZone)
signal zone_exited(zone: CameraZone)

func _ready() -> void:
    body_entered.connect(_on_body_entered)
    body_exited.connect(_on_body_exited)

func _on_body_entered(body: Node2D) -> void:
    if body.is_in_group(&"player"):
        zone_entered.emit(self)

func _on_body_exited(body: Node2D) -> void:
    if body.is_in_group(&"player"):
        zone_exited.emit(self)
```

### Camera Zone Manager

```gdscript
class_name CameraZoneManager
extends Node

@export var camera: Camera2D
@export var default_zoom: float = 1.0
@export var transition_speed: float = 3.0

var _active_zones: Array[CameraZone] = []
var _saved_limits: Dictionary = {}

func register_zone(zone: CameraZone) -> void:
    zone.zone_entered.connect(_on_zone_entered)
    zone.zone_exited.connect(_on_zone_exited)

func _on_zone_entered(zone: CameraZone) -> void:
    _active_zones.append(zone)
    _active_zones.sort_custom(func(a: CameraZone, b: CameraZone) -> bool:
        return a.priority > b.priority
    )
    _apply_top_zone()

func _on_zone_exited(zone: CameraZone) -> void:
    _active_zones.erase(zone)
    _apply_top_zone()

func _apply_top_zone() -> void:
    if _active_zones.is_empty():
        _restore_defaults()
        return
    
    var zone: CameraZone = _active_zones[0]  # Highest priority
    
    if zone.override_limits:
        camera.limit_left = zone.zone_limit_left
        camera.limit_right = zone.zone_limit_right
        camera.limit_top = zone.zone_limit_top
        camera.limit_bottom = zone.zone_limit_bottom

func _process(delta: float) -> void:
    if _active_zones.is_empty():
        return
    var zone: CameraZone = _active_zones[0]
    
    # Smooth zoom transition
    var weight: float = 1.0 - exp(-transition_speed * delta)
    var z: float = lerpf(camera.zoom.x, zone.zone_zoom, weight)
    camera.zoom = Vector2(z, z)
    
    # Apply offset
    camera.offset = camera.offset.lerp(zone.zone_offset, weight)
    
    # Lock position if specified
    if zone.lock_position:
        camera.global_position = camera.global_position.lerp(
            zone.global_position, weight
        )

func _restore_defaults() -> void:
    # Transition back to default zoom
    pass  # Handled in _process when _active_zones is empty
```

### Level Design with Camera Zones

```
┌─────────────────────────────────────────────────────────┐
│                        Level                             │
│                                                          │
│  ┌───────────┐    ┌──────┐    ┌────────────────────┐    │
│  │ Corridor  │    │Arena │    │   Vista             │    │
│  │ zoom: 1.5 │────│z:0.8 │────│   zoom: 0.5         │    │
│  │ lock Y    │    │locked│    │   wide view          │    │
│  └───────────┘    └──────┘    └────────────────────┘    │
│                                                          │
│  Each box is a CameraZone (Area2D with CollisionShape)   │
└─────────────────────────────────────────────────────────┘
```

---

## Pixel-Perfect Camera

Pixel art games need special camera handling to prevent subpixel jitter (sprites shimmer or wobble during movement).

### Project Settings for Pixel Art

```
# Project → Project Settings → Display → Window:
Viewport Width: 320        # Your game's native resolution
Viewport Height: 180
Window Width Override: 1280  # Actual window size (4× scale)
Window Height Override: 720

# Stretch:
Mode: viewport             # Renders at native res, scales up
Aspect: keep               # Maintains aspect ratio

# Rendering → Textures:
Default Texture Filter: Nearest  # Sharp pixels, no blur
```

### Pixel Snap Camera

```gdscript
class_name PixelPerfectCamera
extends Camera2D

## Size of one pixel in your game's native resolution.
@export var pixel_size: float = 1.0

var _subpixel_offset: Vector2 = Vector2.ZERO

func _physics_process(delta: float) -> void:
    # After your follow/smoothing logic runs, snap to pixel grid
    _snap_to_pixel()

func _snap_to_pixel() -> void:
    # Round position to nearest pixel
    var snapped: Vector2 = Vector2(
        roundf(global_position.x / pixel_size) * pixel_size,
        roundf(global_position.y / pixel_size) * pixel_size
    )
    
    # Store the subpixel remainder (prevents smoothing from fighting snap)
    _subpixel_offset = global_position - snapped
    global_position = snapped
```

### Handling Smooth Movement with Pixel Snap

The challenge: you want smooth camera movement BUT pixel-snapped rendering. Solution: snap the camera but apply subpixel offset to the viewport:

```gdscript
class_name SubpixelCamera
extends Camera2D

@export var target: Node2D
@export var smoothing: float = 5.0

func _physics_process(delta: float) -> void:
    if not target:
        return
    
    # Smooth follow (floating point precision)
    var weight: float = 1.0 - exp(-smoothing * delta)
    var smooth_pos: Vector2 = global_position.lerp(target.global_position, weight)
    
    # Snap to pixel grid
    global_position = smooth_pos.round()
    
    # The remaining subpixel offset goes into camera.offset
    # This keeps the smoothing feel while snapping the actual transform
    offset = smooth_pos - global_position
```

> **Common mistake:** Using `position_smoothing_enabled` with pixel art. Godot's built-in smoothing operates in subpixel space which causes jitter. Use the manual snap approach above instead.

---

## Split Screen

Local multiplayer with separate viewports for each player.

### Two-Player Horizontal Split

```gdscript
# Scene tree:
# SplitScreenManager (Node)
#   ├── TopViewport (SubViewportContainer)
#   │   └── SubViewport
#   │       └── Camera2D (follows Player 1)
#   └── BottomViewport (SubViewportContainer)
#       └── SubViewport
#           └── Camera2D (follows Player 2)
```

Setup via code:

```gdscript
class_name SplitScreenSetup
extends Node

@export var player_a: Node2D
@export var player_b: Node2D

func _ready() -> void:
    var screen_size: Vector2i = DisplayServer.window_get_size()
    
    # Top half
    var container_a: SubViewportContainer = $TopViewport
    container_a.size = Vector2(screen_size.x, screen_size.y / 2)
    container_a.position = Vector2.ZERO
    var viewport_a: SubViewport = container_a.get_child(0)
    viewport_a.size = Vector2i(screen_size.x, screen_size.y / 2)
    
    # Bottom half
    var container_b: SubViewportContainer = $BottomViewport
    container_b.size = Vector2(screen_size.x, screen_size.y / 2)
    container_b.position = Vector2(0, screen_size.y / 2.0)
    var viewport_b: SubViewport = container_b.get_child(0)
    viewport_b.size = Vector2i(screen_size.x, screen_size.y / 2)
    
    # Each viewport needs a copy of the world
    # Use World2D sharing so both see the same game world
    viewport_b.world_2d = viewport_a.world_2d
```

> **Key insight:** Both SubViewports must share the same `World2D` so they see the same game world. Without this, each viewport renders an empty world.

---

## Camera State Machine

For games with multiple camera behaviors (gameplay, cinematic, dialogue, death cam), use a state machine to manage transitions cleanly.

### Camera States

```gdscript
class_name CameraState
extends Node

## Reference to the camera this state controls.
var camera: GameCamera

## Called when this state becomes active.
func enter(_data: Dictionary = {}) -> void:
    pass

## Called when this state is deactivated.
func exit() -> void:
    pass

## Called every physics frame while active.
func physics_update(delta: float) -> void:
    pass

## Called every frame while active.
func update(delta: float) -> void:
    pass
```

### Follow State

```gdscript
class_name CameraFollowState
extends CameraState

@export var smoothing: float = 5.0
@export var look_ahead: float = 60.0
@export var look_speed: float = 3.0

var _target: Node2D
var _look_offset: Vector2 = Vector2.ZERO

func enter(data: Dictionary = {}) -> void:
    _target = data.get("target", null)

func physics_update(delta: float) -> void:
    if not _target:
        return
    
    # Look-ahead
    if _target is CharacterBody2D:
        var vel: Vector2 = (_target as CharacterBody2D).velocity
        var desired: Vector2 = Vector2.ZERO
        if vel.length_squared() > 100.0:
            desired = vel.normalized() * look_ahead
        var offset_w: float = 1.0 - exp(-look_speed * delta)
        _look_offset = _look_offset.lerp(desired, offset_w)
    
    var target_pos: Vector2 = _target.global_position + _look_offset
    var weight: float = 1.0 - exp(-smoothing * delta)
    camera.global_position = camera.global_position.lerp(target_pos, weight)
```

### Cinematic State

```gdscript
class_name CameraCinematicState
extends CameraState

var _waypoints: Array[CameraWaypoint] = []
var _index: int = 0
var _wait: float = 0.0

signal sequence_done

func enter(data: Dictionary = {}) -> void:
    _waypoints = data.get("waypoints", [])
    _index = 0
    _wait = 0.0

func physics_update(delta: float) -> void:
    if _index >= _waypoints.size():
        sequence_done.emit()
        return
    
    var wp: CameraWaypoint = _waypoints[_index]
    
    if _wait > 0.0:
        _wait -= delta
        if _wait <= 0.0:
            _index += 1
        return
    
    var speed: float = wp.speed if wp.speed > 0.0 else 4.0
    var w: float = 1.0 - exp(-speed * delta)
    camera.global_position = camera.global_position.lerp(wp.position, w)
    
    if wp.zoom > 0.0:
        var z: float = lerpf(camera.zoom.x, wp.zoom, w)
        camera.zoom = Vector2(z, z)
    
    if camera.global_position.distance_squared_to(wp.position) < 4.0:
        if wp.hold_time > 0.0:
            _wait = wp.hold_time
        else:
            _index += 1
```

### Game Camera (State Machine Host)

```gdscript
class_name GameCamera
extends Camera2D

@export var initial_state: CameraState

var _current_state: CameraState
var _shaker: CameraShaker

func _ready() -> void:
    for child in get_children():
        if child is CameraState:
            child.camera = self
        elif child is CameraShaker:
            _shaker = child
    
    if initial_state:
        _current_state = initial_state
        _current_state.enter()

func _physics_process(delta: float) -> void:
    if _current_state:
        _current_state.physics_update(delta)

func _process(delta: float) -> void:
    if _current_state:
        _current_state.update(delta)

func transition_to(state_name: StringName, data: Dictionary = {}) -> void:
    var new_state: CameraState = get_node(NodePath(state_name)) as CameraState
    if not new_state:
        push_warning("Camera state not found: %s" % state_name)
        return
    if _current_state:
        _current_state.exit()
    _current_state = new_state
    _current_state.enter(data)

func shake(amount: float) -> void:
    if _shaker:
        _shaker.add_trauma(amount)
```

Usage:

```gdscript
# Scene tree:
# GameCamera (Camera2D) — uses GameCamera script
#   ├── FollowState (CameraFollowState)
#   ├── CinematicState (CameraCinematicState)
#   ├── LockedState (CameraLockedState)
#   └── CameraShaker

# Transition to follow player
$GameCamera.transition_to(&"FollowState", {"target": $Player})

# Switch to cinematic
$GameCamera.transition_to(&"CinematicState", {"waypoints": boss_intro_waypoints})

# Lock camera for puzzle room
$GameCamera.transition_to(&"LockedState", {"position": puzzle_room_center})
```

---

## Common Mistakes

### 1. Camera Jitter from Process vs Physics Mismatch

**Problem:** Camera follows a `CharacterBody2D` in `_process()` but the body moves in `_physics_process()`. Different update rates cause jitter.

**Fix:** Always follow physics bodies in `_physics_process()`:

```gdscript
# ❌ Wrong — causes jitter
func _process(delta: float) -> void:
    global_position = target.global_position

# ✅ Correct
func _physics_process(delta: float) -> void:
    global_position = target.global_position
```

Or set `Camera2D.process_callback` to `CAMERA2D_PROCESS_PHYSICS`.

### 2. Smoothing Fights Camera Limits

**Problem:** The camera smoothly follows the player but oscillates or bounces at map edges because smoothing overshoots the limit and gets clamped back.

**Fix:** Apply limits to the target position BEFORE smoothing, not after:

```gdscript
# ❌ Wrong — smooth first, clamp after (causes oscillation)
global_position = global_position.lerp(target.global_position, weight)
global_position.x = clampf(global_position.x, limit_left, limit_right)

# ✅ Correct — clamp the target, then smooth toward it
var clamped_target: Vector2 = _apply_limits(target.global_position)
global_position = global_position.lerp(clamped_target, weight)
```

### 3. Zoom Changes Effective Limits

**Problem:** Camera limits are set correctly at zoom=1 but the camera shows beyond the limits when zoomed out.

**Fix:** Account for zoom when clamping:

```gdscript
func _apply_limits_with_zoom(desired_pos: Vector2) -> Vector2:
    var viewport_size: Vector2 = get_viewport_rect().size / zoom
    var half_vp: Vector2 = viewport_size * 0.5
    return Vector2(
        clampf(desired_pos.x, limit_left + half_vp.x, limit_right - half_vp.x),
        clampf(desired_pos.y, limit_top + half_vp.y, limit_bottom - half_vp.y)
    )
```

### 4. Shake Gets Eaten at Map Edges

**Problem:** Screen shake feels weak or absent near map edges because shake offset pushes the camera past limits, which gets clamped away.

**Fix:** Apply shake AFTER final position is set, bypassing limits:

```gdscript
# In CameraShaker: modify camera.offset, not camera.position
# offset is applied after all position calculations including limits
camera.offset = shake_offset  # ✅ Always works, even at edges
```

### 5. Child Camera Inherits Rotation

**Problem:** Camera rotates when the player sprite flips (e.g., `scale.x = -1`).

**Fix:** Enable `ignore_rotation`:

```gdscript
camera.ignore_rotation = true  # In inspector or code
```

### 6. Multiple Active Cameras

**Problem:** Strange camera behavior because two Camera2D nodes both have `enabled = true` in the same viewport.

**Fix:** Only one Camera2D should be current per viewport. Use `make_current()` to switch:

```gdscript
# When switching cameras:
old_camera.enabled = false
new_camera.make_current()
```

### 7. Pixel Jitter with Built-in Smoothing

**Problem:** Using `position_smoothing_enabled = true` with pixel art causes subpixel positions that make sprites shimmer.

**Fix:** Disable built-in smoothing and implement manual pixel-snapped smoothing (see [Pixel-Perfect Camera](#pixel-perfect-camera) section).

---

## Performance Considerations

### Camera2D is Lightweight

Godot's `Camera2D` has negligible performance cost. The node itself just sets a viewport transform — there's no rendering overhead from the camera. The performance-relevant decisions are:

| Factor | Cost | Recommendation |
|--------|------|----------------|
| Smoothing math | Trivial | Use exponential smoothing freely |
| Shake noise sampling | Trivial | `FastNoiseLite` is efficient |
| Multi-target bounds calc | O(n) per frame | Fine for <20 targets |
| Camera zones (Area2D) | Physics overlap checks | Use simple shapes (rectangles) |
| Split screen (SubViewports) | Doubles render cost | Only use when needed |
| Zoom out (sees more tiles) | More draw calls | Set reasonable min_zoom |

### Optimizing What the Camera Sees

The camera's real performance impact is what it makes visible:

```gdscript
# Disable nodes that are far off-screen
func _on_visibility_changed() -> void:
    # VisibleOnScreenNotifier2D fires this
    set_physics_process(is_on_screen)
    
# Use VisibleOnScreenEnabler2D for automatic enable/disable
# Add as child of enemies, particles, etc.
```

### Camera Change Signals

React to camera changes efficiently:

```gdscript
# Godot doesn't have a built-in "camera moved" signal
# Poll only when needed, or use a threshold:
var _last_camera_pos: Vector2

func _physics_process(delta: float) -> void:
    var cam_pos: Vector2 = get_viewport().get_camera_2d().global_position
    if cam_pos.distance_squared_to(_last_camera_pos) > 1.0:
        _last_camera_pos = cam_pos
        _on_camera_moved(cam_pos)
```

---

## Tuning Reference

### Smoothing Speed by Genre

| Genre | Smoothing | Look-Ahead | Deadzone | Notes |
|-------|-----------|------------|----------|-------|
| **Fast Platformer** | 8–12 | 40–80 px | Small (60×40) | Tight, responsive feel |
| **Exploration Platformer** | 4–6 | 60–100 px | Medium (100×60) | Room to breathe |
| **Top-Down Action** | 6–10 | 0 (or mouse-based) | Medium (80×80) | Symmetric deadzone |
| **Top-Down RPG** | 3–5 | 0–40 px | Large (120×80) | Relaxed, calm feel |
| **Twin-Stick Shooter** | 8–10 | Mouse 30% | None | Fast, precise |
| **Puzzle** | 2–4 | None | None | Slow, deliberate pans |
| **Metroidvania** | 5–8 | 60 px | Medium (80×60) | Balance explore + action |
| **Boss Fight** | 4–6 | Toward boss | Small | Frame both combatants |

### Shake Amounts by Event

| Event | Trauma | Duration Feel |
|-------|--------|---------------|
| Footstep (heavy char) | 0.05–0.10 | Subtle vibration |
| Melee hit (light) | 0.15–0.25 | Quick jolt |
| Melee hit (heavy) | 0.30–0.40 | Impactful |
| Gunshot | 0.10–0.20 | Sharp snap |
| Explosion (small) | 0.40–0.50 | Strong shake |
| Explosion (large) | 0.60–0.80 | Screen-filling |
| Boss slam | 0.50–0.70 | Earthquake feel |
| Death / game over | 0.80–1.00 | Maximum chaos |

### Zoom Ranges by Game Type

| Game Type | Min Zoom | Max Zoom | Default |
|-----------|----------|----------|---------|
| Pixel art platformer | 1.0 | 1.0 | 1.0 (fixed) |
| HD platformer | 0.8 | 1.5 | 1.0 |
| Top-down RPG | 0.5 | 2.0 | 1.0 |
| RTS / strategy | 0.3 | 2.0 | 0.7 |
| Twin-stick shooter | 0.6 | 1.2 | 1.0 |
| Local co-op (multi-target) | 0.3 | 1.5 | Auto |

---

## See Also

- [Camera Theory](../../core/concepts/camera-theory.md) — engine-agnostic damping math, deadzone theory, parallax
- [G1 Scene Composition](./G1_scene_composition.md) — structuring camera as a component scene
- [G2 State Machine](./G2_state_machine.md) — state machine pattern (used for camera states)
- [G4 Input Handling](./G4_input_handling.md) — mouse/gamepad input for camera control
- [G5 Physics & Collision](./G5_physics_and_collision.md) — Area2D for camera zones, CharacterBody2D for follow targets
- [godot-rules.md](../godot-rules.md) — GDScript coding standards
