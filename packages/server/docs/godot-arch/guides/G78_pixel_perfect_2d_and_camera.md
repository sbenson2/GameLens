# G78 — Pixel-Perfect 2D and Advanced Camera Techniques

> **Category:** guide · **Engine:** Godot 4.4+ · **Language:** GDScript / C#
> **Related:** [G6 Camera Systems](./G6_camera_systems.md) · [G7 Tilemap & Terrain](./G7_tilemap_and_terrain.md) · [G9 UI Control Systems](./G9_ui_control_systems.md) · [G38 Game Feel & Juice](./G38_game_feel_and_juice.md) · [G22 Mobile & Web Export](./G22_mobile_and_web_export.md)

---

## What This Guide Covers

G6 covers Camera2D fundamentals — following targets, smoothing, limits, and shake. This guide focuses on **pixel-perfect rendering** for retro and pixel-art games, **advanced camera patterns** (split-screen, cinematic framing, room transitions, multi-resolution scaling), and the project settings required to get crisp pixels at any display resolution.

**Use this guide when:** you're building a pixel-art game and see blurry or shimmering pixels, you need camera techniques beyond basic follow (room-based cameras, split-screen, cinematic triggers), or you're struggling with how your 2D game looks at different screen sizes.

---

## Table of Contents

1. [The Pixel-Perfect Problem](#1-the-pixel-perfect-problem)
2. [Project Settings for Pixel Art](#2-project-settings-for-pixel-art)
3. [Stretch Modes and Aspect Ratios](#3-stretch-modes-and-aspect-ratios)
4. [Snap Settings: Pixel Snapping in Practice](#4-snap-settings-pixel-snapping-in-practice)
5. [Camera2D Pixel Snapping](#5-camera2d-pixel-snapping)
6. [Room-Based Camera Transitions](#6-room-based-camera-transitions)
7. [Cinematic Camera Triggers](#7-cinematic-camera-triggers)
8. [Split-Screen with SubViewport](#8-split-screen-with-subviewport)
9. [Parallax Layers at Pixel Scale](#9-parallax-layers-at-pixel-scale)
10. [UI at Native Resolution Over Pixel Viewport](#10-ui-at-native-resolution-over-pixel-viewport)
11. [Multi-Resolution Strategy](#11-multi-resolution-strategy)
12. [Common Mistakes](#12-common-mistakes)

---

## 1. The Pixel-Perfect Problem

Pixel-art games render at a low internal resolution (e.g., 320×180) and scale up to the display (e.g., 1920×1080 = 6× scale). Problems arise when:

- **Non-integer scaling** — 320×180 doesn't scale evenly to 1366×768 (4.27×). Pixels become different sizes, causing shimmering on movement.
- **Sub-pixel camera positions** — a camera at x=100.3 shifts the entire scene by 0.3 pixels, blurring textures when filtered or creating jitter when not.
- **Sprite positions between pixels** — a character at y=50.5 renders half a pixel off-grid.
- **UI text rendered at game resolution** — 8px text scaled 6× looks chunky. Players expect crisp UI.

This guide solves each of these.

---

## 2. Project Settings for Pixel Art

Open **Project → Project Settings** and configure:

### Display/Window

```
# Internal game resolution (your pixel art canvas size)
viewport/size/width = 320
viewport/size/height = 180

# Starting window size (integer multiple of viewport)
window/size/width = 1280       # 320 × 4
window/size/height = 720       # 180 × 4

# Allow resizing
window/size/resizable = true
```

### Stretch

```
stretch/mode = "viewport"      # Renders at viewport size, then scales up
stretch/aspect = "keep"        # Maintains aspect ratio, adds black bars
stretch/scale_mode = "integer" # Only allows integer scale factors (4×, 5×, 6×)
```

The `"integer"` scale mode (added in Godot 4.2) is the single most important setting for pixel-perfect rendering. It ensures every source pixel maps to exactly N×N display pixels — no fractional scaling.

### Rendering/Textures

```
textures/canvas_textures/default_texture_filter = "Nearest"
```

This prevents bilinear filtering from blurring pixel art. Set it project-wide here, not per-sprite.

### Rendering/2D

```
rendering/2d/snap/snap_2d_transforms_to_pixel = true
rendering/2d/snap/snap_2d_vertices_to_pixel = true
```

These snap transform positions and mesh vertices to the pixel grid, preventing sub-pixel rendering artifacts.

---

## 3. Stretch Modes and Aspect Ratios

| Mode | Behavior | Best For |
|------|----------|----------|
| `viewport` + `keep` + `integer` | Renders at base size, integer-scale up, black bars on remainder | Pixel-art games (recommended) |
| `viewport` + `keep` | Renders at base size, scale to fit with black bars | Retro-style with flexible window sizes |
| `canvas_items` + `expand` | Scales UI/canvas, reveals more world on wider screens | HD 2D games, not pixel art |
| `disabled` | No scaling — viewport = window size | Special cases only |

For most pixel-art games: **`viewport` + `keep` + `integer`** is the correct combination.

---

## 4. Snap Settings: Pixel Snapping in Practice

### Transform Snapping

With `snap_2d_transforms_to_pixel = true`, Godot rounds every Node2D's global position to the nearest pixel before rendering. This means:

```gdscript
# Even if your physics moves a character to x=100.7,
# it renders at x=101 (or x=100 depending on rounding).
# The character's logical position stays at 100.7.
```

This is usually what you want. But it can cause visual jitter when a character moves slowly (alternating between two pixel positions).

### Fixing Slow-Movement Jitter

Option A — increase minimum speed so movement always crosses a full pixel per frame:

```gdscript
const MIN_SPEED: float = 60.0  # pixels/sec at 60fps = 1 pixel/frame

func _physics_process(delta: float) -> void:
    if abs(velocity.x) > 0.0 and abs(velocity.x) < MIN_SPEED:
        velocity.x = sign(velocity.x) * MIN_SPEED
```

Option B — accumulate sub-pixel movement and only apply full pixels:

```gdscript
var sub_pixel := Vector2.ZERO

func _physics_process(delta: float) -> void:
    var movement := velocity * delta + sub_pixel
    var snapped := movement.round()
    sub_pixel = movement - snapped
    position += snapped
```

---

## 5. Camera2D Pixel Snapping

Camera2D has a **Pixel Snapping** property (Inspector → Camera2D → Pixel Snapping, or code):

```gdscript
extends Camera2D

func _ready() -> void:
    pixel_snapping = Camera2D.PIXEL_SNAPPING_ENABLED
```

**What it does:** rounds the camera's final position to whole pixels before applying the view transform. Without this, smooth camera following causes the entire world to shift by sub-pixel amounts each frame, causing pixel shimmering.

**Trade-off:** the camera "steps" in pixel increments instead of floating smoothly. For most pixel-art games this looks correct and expected. If you want sub-pixel smooth camera with pixel-perfect sprites, use a SubViewport approach (see section 8).

### Camera Smoothing at Pixel Scale

Godot's Camera2D smoothing works in world units. At a 320×180 viewport, default smoothing values can feel sluggish. Tune for your base resolution:

```gdscript
extends Camera2D

func _ready() -> void:
    pixel_snapping = Camera2D.PIXEL_SNAPPING_ENABLED
    position_smoothing_enabled = true
    position_smoothing_speed = 8.0  # Higher = tighter follow
```

---

## 6. Room-Based Camera Transitions

Many pixel-art games (Metroidvanias, Zelda-likes) snap the camera to discrete rooms instead of following the player continuously.

### Using Camera Limits

```gdscript
# room_camera.gd — attach to Camera2D
extends Camera2D

## Set by room trigger areas
var target_limits := Rect2(0, 0, 320, 180)
var transition_speed: float = 4.0

func transition_to_room(room_rect: Rect2) -> void:
    target_limits = room_rect

func _process(delta: float) -> void:
    limit_left = int(lerpf(limit_left, target_limits.position.x,
        delta * transition_speed))
    limit_top = int(lerpf(limit_top, target_limits.position.y,
        delta * transition_speed))
    limit_right = int(lerpf(limit_right, target_limits.end.x,
        delta * transition_speed))
    limit_bottom = int(lerpf(limit_bottom, target_limits.end.y,
        delta * transition_speed))
```

### Room Trigger Areas

```gdscript
# room_trigger.gd — attach to Area2D with CollisionShape2D matching room size
extends Area2D

@export var room_rect: Rect2 = Rect2(0, 0, 320, 180)

func _on_body_entered(body: Node2D) -> void:
    if body.is_in_group("player"):
        var camera := body.get_node("Camera2D") as Camera2D
        if camera and camera.has_method("transition_to_room"):
            camera.transition_to_room(room_rect)
```

### C# Equivalent

```csharp
using Godot;

public partial class RoomCamera : Camera2D
{
    private Rect2 _targetLimits = new(0, 0, 320, 180);
    private float _transitionSpeed = 4.0f;

    public void TransitionToRoom(Rect2 roomRect)
    {
        _targetLimits = roomRect;
    }

    public override void _Process(double delta)
    {
        float t = (float)delta * _transitionSpeed;
        LimitLeft = (int)Mathf.Lerp(LimitLeft, _targetLimits.Position.X, t);
        LimitTop = (int)Mathf.Lerp(LimitTop, _targetLimits.Position.Y, t);
        LimitRight = (int)Mathf.Lerp(LimitRight, _targetLimits.End.X, t);
        LimitBottom = (int)Mathf.Lerp(LimitBottom, _targetLimits.End.Y, t);
    }
}
```

---

## 7. Cinematic Camera Triggers

Use Area2D triggers to create look-ahead zones, zoom changes, or forced panning:

```gdscript
# cinematic_trigger.gd
extends Area2D

@export var zoom_level: Vector2 = Vector2(1.5, 1.5)
@export var offset_override: Vector2 = Vector2.ZERO
@export var transition_time: float = 0.8

func _on_body_entered(body: Node2D) -> void:
    if body.is_in_group("player"):
        var camera := get_viewport().get_camera_2d()
        if camera:
            var tween := create_tween().set_ease(Tween.EASE_OUT).set_trans(Tween.TRANS_CUBIC)
            tween.tween_property(camera, "zoom", zoom_level, transition_time)
            tween.parallel().tween_property(camera, "offset", offset_override, transition_time)

func _on_body_exited(body: Node2D) -> void:
    if body.is_in_group("player"):
        var camera := get_viewport().get_camera_2d()
        if camera:
            var tween := create_tween().set_ease(Tween.EASE_OUT).set_trans(Tween.TRANS_CUBIC)
            tween.tween_property(camera, "zoom", Vector2.ONE, transition_time)
            tween.parallel().tween_property(camera, "offset", Vector2.ZERO, transition_time)
```

**Pixel-art caveat:** zooming to non-integer values (e.g., 1.5×) in a pixel-art viewport will cause pixel scaling inconsistencies. If you need cinematic zoom in pixel-art, keep zoom values at integer or power-of-two scales (1×, 2×, 0.5×).

---

## 8. Split-Screen with SubViewport

For local co-op in 2D, use SubViewport nodes:

```
Main Scene
├── HSplitContainer (or HBoxContainer)
│   ├── SubViewportContainer (stretch, size = half screen)
│   │   └── SubViewport (size = 160×180 for 2-player horizontal split)
│   │       └── Camera2D (follows Player 1)
│   └── SubViewportContainer
│       └── SubViewport (size = 160×180)
│           └── Camera2D (follows Player 2)
└── World (shared game scene — instanced into BOTH SubViewports via script)
```

### Setup Script

```gdscript
extends Node

@onready var viewport_1: SubViewport = $HSplit/Left/SubViewport
@onready var viewport_2: SubViewport = $HSplit/Right/SubViewport
@onready var world_scene: PackedScene = preload("res://world.tscn")

func _ready() -> void:
    # Both viewports share the same world
    var world := world_scene.instantiate()
    viewport_1.add_child(world)
    # Viewport 2 shows the same world via World2D sharing
    viewport_2.world_2d = viewport_1.world_2d

    # Each viewport has its own camera
    var cam1 := Camera2D.new()
    cam1.pixel_snapping = Camera2D.PIXEL_SNAPPING_ENABLED
    viewport_1.add_child(cam1)

    var cam2 := Camera2D.new()
    cam2.pixel_snapping = Camera2D.PIXEL_SNAPPING_ENABLED
    viewport_2.add_child(cam2)
```

**Key:** Share `world_2d` between SubViewports so both render the same physics and visual world without duplicating nodes.

### C# Equivalent

```csharp
using Godot;

public partial class SplitScreenSetup : Node
{
    [Export] public PackedScene WorldScene { get; set; }

    public override void _Ready()
    {
        var vp1 = GetNode<SubViewport>("HSplit/Left/SubViewport");
        var vp2 = GetNode<SubViewport>("HSplit/Right/SubViewport");

        var world = WorldScene.Instantiate();
        vp1.AddChild(world);
        vp2.World2D = vp1.World2D;

        var cam1 = new Camera2D { PixelSnapping = Camera2D.PixelSnappingEnum.Enabled };
        vp1.AddChild(cam1);

        var cam2 = new Camera2D { PixelSnapping = Camera2D.PixelSnappingEnum.Enabled };
        vp2.AddChild(cam2);
    }
}
```

---

## 9. Parallax Layers at Pixel Scale

ParallaxBackground works at pixel-art scale, but requires careful setup:

```gdscript
# Attach to ParallaxBackground, child of Camera2D or sibling
extends ParallaxBackground

func _ready() -> void:
    # Layer 1 — far background (slow scroll)
    var layer1 := ParallaxLayer.new()
    layer1.motion_scale = Vector2(0.2, 0.0)     # 20% of camera speed
    layer1.motion_mirroring = Vector2(320, 0)    # Must match texture width in game pixels
    add_child(layer1)

    var sprite1 := Sprite2D.new()
    sprite1.texture = preload("res://art/bg_mountains.png")
    sprite1.centered = false
    layer1.add_child(sprite1)
```

**Pixel-art tips:**

- Set `motion_mirroring` to exactly the texture's pixel width — not the scaled size.
- Ensure parallax textures have **Repeat** import mode enabled.
- Use `motion_scale` values that result in whole-pixel movement at your target framerate. For a 320px viewport scrolling at 60fps, `motion_scale.x = 0.25` means the background moves 1 pixel for every 4 pixels the camera moves — always integer steps.

---

## 10. UI at Native Resolution Over Pixel Viewport

A common pattern: render the game at 320×180 (pixel art) but draw UI (text, HUD) at the display's native resolution (1920×1080) for crisp fonts and smooth elements.

### Architecture

```
Root (Window)
├── SubViewportContainer (stretch, filter = Nearest)
│   └── SubViewport (size = 320×180, snap_2d = true)
│       └── GameWorld
│           ├── Player
│           ├── Enemies
│           └── Camera2D
└── CanvasLayer (layer = 10)
    └── HUD (Control — rendered at native resolution)
        ├── Label (font size 16, crisp at 1080p)
        └── HealthBar
```

### Setup

```gdscript
# main.gd
extends Node

func _ready() -> void:
    var container := $SubViewportContainer as SubViewportContainer
    container.stretch = true
    # The SubViewport renders at 320×180
    # The SubViewportContainer scales it to fill the window

    # The CanvasLayer with HUD sits on top at native resolution
    # No additional setup needed — CanvasLayer ignores SubViewport scaling
```

**Project Settings for this approach:**

```
viewport/size/width = 1920     # or your target display resolution
viewport/size/height = 1080
stretch/mode = "canvas_items"  # Scale UI naturally
```

The SubViewport handles the pixel-art scaling internally, while the main viewport runs at native resolution for UI.

---

## 11. Multi-Resolution Strategy

### Decision Tree

1. **Pure pixel art, retro aesthetic** → viewport stretch + integer scaling (section 2)
2. **Pixel art with crisp UI** → SubViewport for game + native UI (section 10)
3. **HD 2D (hand-painted, vector)** → canvas_items stretch + expand aspect
4. **Mixed (pixel gameplay, HD menus)** → SubViewport approach with scene switching

### Testing Across Resolutions

Create a debug overlay to test:

```gdscript
# resolution_tester.gd — attach to a CanvasLayer for debug
extends Control

var resolutions: Array[Vector2i] = [
    Vector2i(1280, 720),
    Vector2i(1366, 768),
    Vector2i(1920, 1080),
    Vector2i(2560, 1440),
    Vector2i(3840, 2160),
]
var current_index: int = 0

func _unhandled_input(event: InputEvent) -> void:
    if event.is_action_pressed("debug_next_resolution"):
        current_index = (current_index + 1) % resolutions.size()
        var res := resolutions[current_index]
        DisplayServer.window_set_size(res)
        print("Testing resolution: %s (scale: %.2fx)" % [
            res, float(res.x) / get_viewport().size.x
        ])
```

---

## 12. Common Mistakes

### Using "Linear" Texture Filter for Pixel Art

Bilinear filtering blurs pixel art. Always set the project-wide default to **Nearest**. If individual textures (like UI icons) need filtering, override per-texture in the Import dock.

### Non-Integer Viewport Sizes

A 321×181 viewport doesn't divide evenly into any common display resolution. Stick to sizes with many integer multiples: 320×180 (×4=1280×720, ×6=1920×1080), 256×144, 384×216, or 480×270.

### Forgetting Camera Pixel Snapping

Without pixel snapping on Camera2D, smooth following causes the entire world to shift sub-pixel amounts, creating a "shimmer" effect on tiles and sprites. Always enable it for pixel-art games.

### Parallax Mirroring Mismatch

Setting `motion_mirroring` to the wrong value causes visible seams or gaps in scrolling backgrounds. It must exactly match the texture's width in game pixels (not display pixels).

### Mixing Filtered and Unfiltered Textures

If some sprites use Nearest and others use Linear in the same viewport, the visual style is inconsistent and filtered sprites look blurry next to crisp pixel art. Choose one filtering mode per visual layer.

### Zooming to Non-Integer Values

Zooming Camera2D to 1.5× or 0.75× in a pixel-art viewport causes pixels to render at inconsistent sizes. Keep zoom at integer values (1×, 2×) or exact fractions (0.5×) that result in uniform pixel scaling.
