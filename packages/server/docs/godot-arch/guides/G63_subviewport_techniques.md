# G63 — SubViewport Techniques

> **Category:** Guide · **Engine:** Godot 4.4+ · **Language:** GDScript / C#
> **Related:** [G6 Camera Systems](./G6_camera_systems.md) · [G9 UI & Control Systems](./G9_ui_control_systems.md) · [G12 Shaders & Visual Effects](./G12_shaders_and_visual_effects.md) · [G50 Advanced UI & Custom Controls](./G50_advanced_ui_custom_controls.md)

---

## What This Guide Covers

A `SubViewport` is a virtual screen — it renders a scene independently of the main viewport and exposes the result as a `ViewportTexture` you can apply to any material, sprite, or UI element. This unlocks techniques like minimaps, split-screen multiplayer, picture-in-picture, 3D models in 2D UI, portals, security cameras, render-to-texture effects, and dynamic reflections.

This guide covers how `SubViewport` and `SubViewportContainer` work, the relationship between viewports and worlds, practical implementations for common game features, performance management, and platform considerations.

**Use SubViewports when:** you need a second camera view (minimap, rear-view mirror), split-screen multiplayer, rendering 3D objects in a 2D UI, picture-in-picture, portals, or any render-to-texture effect.

**Don't use SubViewports when:** a simple shader can achieve the same effect (e.g., screen distortion, color grading). Each SubViewport adds a full render pass.

---

## Table of Contents

1. [How SubViewports Work](#1-how-subviewports-work)
2. [SubViewport vs SubViewportContainer](#2-subviewport-vs-subviewportcontainer)
3. [Worlds — Shared vs Isolated](#3-worlds--shared-vs-isolated)
4. [Minimap](#4-minimap)
5. [Split-Screen Multiplayer](#5-split-screen-multiplayer)
6. [3D Model Preview in 2D UI](#6-3d-model-preview-in-2d-ui)
7. [Render-to-Texture — Security Cameras & Portals](#7-render-to-texture--security-cameras--portals)
8. [Pixel-Perfect Rendering](#8-pixel-perfect-rendering)
9. [Performance Management](#9-performance-management)
10. [C# Equivalents](#10-c-equivalents)
11. [Common Mistakes](#11-common-mistakes)

---

## 1. How SubViewports Work

Every Godot application has a root `Viewport` — the main window. A `SubViewport` is an additional viewport that renders independently and produces a `ViewportTexture` as output.

The rendering pipeline for each frame:

1. The main viewport and all active SubViewports are queued for rendering
2. Each viewport renders its scene tree (or shared world) through its own camera
3. SubViewport results become `ViewportTexture` objects
4. The main viewport composites everything to the screen

**Key properties of SubViewport:**

| Property | Default | Purpose |
|----------|---------|---------|
| `size` | `Vector2i(512, 512)` | Resolution of the rendered texture |
| `render_target_update_mode` | `UPDATE_WHEN_VISIBLE` | When to re-render |
| `transparent_bg` | `false` | Allow alpha transparency |
| `world_2d` / `world_3d` | Inherited from parent | Which world to render |
| `own_world_3d` | `false` | Create an isolated 3D world |
| `canvas_cull_mask` | All layers | Which 2D layers to render |

---

## 2. SubViewport vs SubViewportContainer

There are two ways to use a SubViewport:

### With SubViewportContainer (for UI display)

`SubViewportContainer` is a `Control` node that displays its child `SubViewport` inline in the UI tree. It handles sizing automatically.

```
Control (UI root)
└── SubViewportContainer  ← Sizes and displays the viewport
    └── SubViewport       ← Renders the scene
        └── Camera2D      ← What to render
```

**Use this for:** minimaps, split-screen, HUD elements, any SubViewport displayed directly in the UI.

The container's `stretch` property controls how the SubViewport's output is scaled:

- `stretch = false`: SubViewport renders at its own `size`, container displays 1:1
- `stretch = true`: SubViewport renders at the container's size (responsive)

### Without container (for texture access)

Place the SubViewport anywhere in the scene tree and access its texture directly:

```gdscript
# Get the texture to apply to a material
var tex: ViewportTexture = $SubViewport.get_texture()
some_material.albedo_texture = tex
```

**Use this for:** security cameras on 3D monitors, portals, dynamic reflections — anywhere the SubViewport output maps onto a mesh.

---

## 3. Worlds — Shared vs Isolated

By default, a SubViewport inherits its parent's `World3D` and `World2D`. This means it sees the same nodes as the main viewport — just from a different camera angle. This is what you want for minimaps and split-screen.

To render an **isolated** scene (e.g., a 3D model preview in UI), give the SubViewport its own world:

```gdscript
# In the editor: check "Own World 3D" on the SubViewport
# Or in code:
$SubViewport.own_world_3d = true
```

Now only nodes that are children of this SubViewport (or explicitly added to its world) will be rendered by it.

### Canvas Cull Mask (2D layer filtering)

For 2D games, you can filter which `CanvasLayer` layers appear in a SubViewport without creating a separate world:

```gdscript
# Only render layers 1 and 3 in the minimap SubViewport
$MinimapSubViewport.canvas_cull_mask = (1 << 0) | (1 << 2)  # Layers are 0-indexed
```

This is perfect for minimap icons that shouldn't appear in the main view — put them on a dedicated canvas layer and include that layer only in the minimap's cull mask.

---

## 4. Minimap

A minimap is a SubViewport with a zoomed-out camera that follows the player.

### Scene tree structure

```
HUD (CanvasLayer)
└── MinimapContainer (SubViewportContainer) [size: 200×200]
    └── MinimapViewport (SubViewport) [size: 200×200]
        └── MinimapCamera (Camera2D)
```

### 2D minimap implementation

```gdscript
# minimap.gd — attach to MinimapContainer
class_name Minimap
extends SubViewportContainer

@export var player: Node2D
@export var zoom_level: float = 0.15  # How zoomed out (smaller = wider view)

@onready var camera: Camera2D = %MinimapCamera

func _process(_delta: float) -> void:
    if player:
        camera.global_position = player.global_position
        camera.zoom = Vector2(zoom_level, zoom_level)
```

### Adding minimap-only icons

Place icons on a canvas layer that only the minimap viewport renders:

```gdscript
# minimap_icon.gd — attach to a Sprite2D on CanvasLayer 5
class_name MinimapIcon
extends Sprite2D

@export var tracked_node: Node2D
@export var icon_color: Color = Color.RED

func _process(_delta: float) -> void:
    if tracked_node:
        global_position = tracked_node.global_position
```

Configure the viewports:
```gdscript
# Main viewport: hide minimap layer
get_viewport().canvas_cull_mask &= ~(1 << 4)  # Hide layer 5 (0-indexed = 4)

# Minimap SubViewport: show all layers including minimap
$MinimapViewport.canvas_cull_mask = 0xFFFFFFFF  # All layers
```

### 3D minimap (top-down camera)

```gdscript
# For a 3D game, use a Camera3D looking straight down
# minimap_camera_3d.gd
extends Camera3D

@export var target: Node3D
@export var height: float = 50.0

func _process(_delta: float) -> void:
    if target:
        global_position = target.global_position + Vector3(0, height, 0)
        # Look straight down
        rotation_degrees = Vector3(-90, 0, 0)
```

### Minimap border and mask

Use a `TextureRect` with a circular mask shader over the `SubViewportContainer`:

```gdscript
# circular_mask.gdshader
shader_type canvas_item;

void fragment() {
    vec2 center = vec2(0.5, 0.5);
    float dist = distance(UV, center);
    float radius = 0.48;
    float edge = 0.02;

    // Circular mask with soft edge
    float alpha = 1.0 - smoothstep(radius - edge, radius + edge, dist);
    COLOR = texture(TEXTURE, UV);
    COLOR.a *= alpha;
}
```

---

## 5. Split-Screen Multiplayer

Split-screen uses one `SubViewportContainer` per player, each containing a SubViewport with its own camera. All viewports share the same world.

### Two-player horizontal split

```
GameUI (Control, full screen)
├── HSplitContainer or HBoxContainer [full screen]
│   ├── SubViewportContainer (Player 1) [stretch, 50% width]
│   │   └── SubViewport
│   │       └── Camera2D (follows player 1)
│   └── SubViewportContainer (Player 2) [stretch, 50% width]
│       └── SubViewport
│           └── Camera2D (follows player 2)
└── SharedHUD (CanvasLayer) — score, timer, etc.
```

### Setup in code

```gdscript
# split_screen_manager.gd
extends Control

@export var player1: CharacterBody2D
@export var player2: CharacterBody2D

@onready var cam1: Camera2D = %Player1Camera
@onready var cam2: Camera2D = %Player2Camera

func _ready() -> void:
    # Ensure both SubViewportContainers share the parent viewport
    # Cameras follow their respective players
    pass

func _process(_delta: float) -> void:
    cam1.global_position = player1.global_position
    cam2.global_position = player2.global_position
```

### Dynamic split — merge when players are close

A popular technique: show one viewport when players are near each other, split when they're far apart.

```gdscript
@export var split_distance: float = 400.0

@onready var single_container: SubViewportContainer = %SingleContainer
@onready var split_container: HBoxContainer = %SplitContainer

func _process(_delta: float) -> void:
    var dist := player1.global_position.distance_to(player2.global_position)

    if dist > split_distance:
        # Split mode
        single_container.visible = false
        split_container.visible = true
        # Each camera follows its player
        cam1.global_position = player1.global_position
        cam2.global_position = player2.global_position
    else:
        # Merged mode — single camera centered between players
        split_container.visible = false
        single_container.visible = true
        var center := (player1.global_position + player2.global_position) / 2.0
        single_cam.global_position = center
        # Zoom out to keep both players in frame
        var zoom_factor := clampf(split_distance / maxf(dist, 1.0), 0.5, 2.0)
        single_cam.zoom = Vector2(zoom_factor, zoom_factor)
```

---

## 6. 3D Model Preview in 2D UI

Display a rotating 3D character or item in a 2D menu by rendering it in an isolated SubViewport.

### Scene tree

```
UI (Control)
└── SubViewportContainer [size: 256×256]
    └── SubViewport [own_world_3d = true, transparent_bg = true]
        ├── Camera3D
        ├── DirectionalLight3D
        └── CharacterModel (MeshInstance3D or imported scene)
```

### Rotating preview

```gdscript
# model_preview.gd — attach to the SubViewport
extends SubViewport

@onready var model: Node3D = $CharacterModel
@export var rotation_speed: float = 30.0  # Degrees per second

func _ready() -> void:
    # Isolated world — only renders what's inside this SubViewport
    own_world_3d = true
    transparent_bg = true
    size = Vector2i(256, 256)

func _process(delta: float) -> void:
    model.rotate_y(deg_to_rad(rotation_speed * delta))

# Call this to swap the displayed model
func set_model(new_scene: PackedScene) -> void:
    if model:
        model.queue_free()
    model = new_scene.instantiate()
    add_child(model)
```

### Mouse interaction — drag to rotate

```gdscript
var _dragging: bool = false
var _drag_sensitivity: float = 0.5

func _input(event: InputEvent) -> void:
    if event is InputEventMouseButton:
        _dragging = event.pressed and event.button_index == MOUSE_BUTTON_LEFT
    elif event is InputEventMouseMotion and _dragging:
        model.rotate_y(deg_to_rad(event.relative.x * _drag_sensitivity))
        model.rotate_x(deg_to_rad(event.relative.y * _drag_sensitivity))
```

---

## 7. Render-to-Texture — Security Cameras & Portals

### Security camera on a 3D monitor

A Camera3D in the game world renders to a SubViewport, and that SubViewport's texture is applied to a mesh (a TV screen, monitor, etc.).

```gdscript
# security_camera.gd
extends Node3D

@onready var sub_viewport: SubViewport = $SubViewport
@onready var camera: Camera3D = $SubViewport/Camera3D
@onready var screen_mesh: MeshInstance3D = $ScreenMesh

func _ready() -> void:
    # SubViewport renders what the security camera sees
    sub_viewport.size = Vector2i(512, 512)

    # Apply the viewport texture to the screen mesh's material
    var mat := StandardMaterial3D.new()
    mat.albedo_texture = sub_viewport.get_texture()
    mat.emission_enabled = true
    mat.emission_texture = sub_viewport.get_texture()
    mat.emission_energy_multiplier = 0.5  # Slight glow for a screen effect
    screen_mesh.material_override = mat
```

### Performance tip — reduce update frequency

Security cameras that the player rarely looks at don't need 60 FPS rendering:

```gdscript
# Only update when player is nearby
func _process(_delta: float) -> void:
    var dist := global_position.distance_to(player.global_position)
    if dist < 20.0:
        sub_viewport.render_target_update_mode = SubViewport.UPDATE_ALWAYS
    elif dist < 50.0:
        # Update every few frames
        sub_viewport.render_target_update_mode = SubViewport.UPDATE_ONCE
        # Trigger manual update periodically
        if Engine.get_frames_drawn() % 10 == 0:
            sub_viewport.render_target_update_mode = SubViewport.UPDATE_ONCE
    else:
        sub_viewport.render_target_update_mode = SubViewport.UPDATE_DISABLED
```

---

## 8. Pixel-Perfect Rendering

For pixel art games, use a SubViewport at your native pixel resolution, then scale up:

```
Root
└── SubViewportContainer [stretch = true, stretch_shrink = 4, full screen]
    └── SubViewport [size: 320×180, canvas_item_default_texture_filter = NEAREST]
        └── Your entire game scene
```

### Configuration

```gdscript
# In Project Settings:
# display/window/size/viewport_width = 320
# display/window/size/viewport_height = 180
# display/window/size/window_width_override = 1280
# display/window/size/window_height_override = 720
# display/window/stretch/mode = "viewport"
# rendering/textures/canvas_textures/default_texture_filter = "Nearest"

# OR do it manually with a SubViewport:
func _ready() -> void:
    var svp := $SubViewport
    svp.size = Vector2i(320, 180)
    svp.canvas_item_default_texture_filter = Viewport.DEFAULT_CANVAS_ITEM_TEXTURE_FILTER_NEAREST

    var container := $SubViewportContainer
    container.stretch = true
    container.stretch_shrink = 4  # 320 * 4 = 1280
```

This ensures all sprites and tilemaps render at exact pixel boundaries, then the container scales the result with nearest-neighbor filtering for crisp pixel art.

---

## 9. Performance Management

Each SubViewport is a full render pass. The cost depends on what's in the viewport:

### Cost factors

| Factor | Impact | Mitigation |
|--------|--------|------------|
| Resolution | Linear with pixel count | Use smallest resolution that looks acceptable |
| Scene complexity | Proportional to visible objects | Use `own_world_3d` with minimal geometry |
| Update frequency | Each update = full render | Use `UPDATE_ONCE` or `UPDATE_DISABLED` when possible |
| Number of SubViewports | Additive cost | Combine when possible |
| Shadow maps | Duplicated per viewport | Disable shadows in secondary viewports |

### Practical limits

- **2–4 SubViewports** at full resolution is generally fine on desktop
- **Minimap** should be low resolution (128×128 to 256×256) — it's small on screen
- **Split-screen** halves the pixel count per viewport, so 2-player costs roughly the same as one full screen
- **Mobile:** limit to 1–2 SubViewports, keep resolution low

### Reducing cost

```gdscript
# Lower resolution for secondary viewports
minimap_viewport.size = Vector2i(128, 128)

# Disable shadows in minimap
minimap_viewport.positional_shadow_atlas_size = 0

# Update only when needed
security_cam_viewport.render_target_update_mode = SubViewport.UPDATE_DISABLED
# Then trigger manually:
security_cam_viewport.render_target_update_mode = SubViewport.UPDATE_ONCE

# Use simpler rendering in secondary viewports
# In the SubViewport's environment, disable SSAO, SSR, volumetric fog, etc.
```

---

## 10. C# Equivalents

```csharp
using Godot;

public partial class Minimap : SubViewportContainer
{
    [Export] public Node2D Player;
    [Export] public float ZoomLevel = 0.15f;

    private Camera2D _camera;

    public override void _Ready()
    {
        _camera = GetNode<Camera2D>("%MinimapCamera");
    }

    public override void _Process(double delta)
    {
        if (Player != null)
        {
            _camera.GlobalPosition = Player.GlobalPosition;
            _camera.Zoom = new Vector2(ZoomLevel, ZoomLevel);
        }
    }
}
```

```csharp
// 3D model preview with isolated world
public partial class ModelPreview : SubViewport
{
    [Export] public float RotationSpeed = 30.0f;
    private Node3D _model;

    public override void _Ready()
    {
        OwnWorld3D = true;
        TransparentBg = true;
        Size = new Vector2I(256, 256);
        _model = GetNode<Node3D>("CharacterModel");
    }

    public override void _Process(double delta)
    {
        _model?.RotateY(Mathf.DegToRad(RotationSpeed * (float)delta));
    }
}
```

---

## 11. Common Mistakes

**Forgetting `own_world_3d` for isolated previews.**
Without it, your item preview SubViewport renders the entire game world, not just the preview model. Always enable `own_world_3d` for UI previews.

**SubViewport resolution too high.**
A 1920×1080 minimap wastes GPU time for something displayed at 200×200 pixels on screen. Match the SubViewport size to its display size.

**Not setting `transparent_bg` for overlays.**
If you're compositing a SubViewport over other UI (like a 3D model in a 2D menu), enable `transparent_bg` or you'll get an opaque black background.

**ViewportTexture assigned in the wrong order.**
`get_texture()` returns `null` if called before the SubViewport has rendered at least once. Assign textures in `_ready()` (the SubViewport initializes before its parent) or defer to the next frame.

**Input not reaching the SubViewport.**
By default, `SubViewportContainer` consumes input events for its child viewport. If you need the SubViewport to NOT handle input (e.g., a minimap that shouldn't intercept clicks), set `mouse_filter = MOUSE_FILTER_IGNORE` on the container.

**Using too many SubViewports on mobile.**
Each SubViewport doubles rendering work for the objects it sees. On mobile GPUs, 3+ active SubViewports can halve your frame rate. Profile early and reduce resolution or update frequency.
