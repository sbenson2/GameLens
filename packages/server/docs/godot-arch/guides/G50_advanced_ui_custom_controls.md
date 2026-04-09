# G50 — Advanced UI: Custom Controls and Theming

> **Category:** Guide · **Engine:** Godot 4.4+ · **Language:** GDScript / C#
> **Related:** [G9 UI Control Systems](./G9_ui_control_systems.md) · [G49 Tweening & Procedural Animation](./G49_tweening_and_procedural_animation.md) · [G45 Advanced GDScript Patterns](./G45_advanced_gdscript_patterns.md) · [G21 Accessibility](./G21_accessibility.md)

---

## What This Guide Covers

Godot's Control node system is powerful enough to build full game UIs, editor plugins, and tool interfaces — but most tutorials stop at basic layouts with built-in widgets. This guide covers building **custom controls** from scratch (with proper minimum size, drawing, focus handling, and theme integration), the **theme system** in depth (type variations, inheritance, runtime switching), **responsive layout** patterns for multi-resolution games, and performance strategies for complex UIs.

**Use this guide when:** you need custom widgets beyond what built-in nodes offer, want to build a consistent theme system across your game, need runtime theme switching (e.g., dark mode), or are building complex HUDs with many dynamic elements.

---

## Table of Contents

1. [Building Custom Controls](#1-building-custom-controls)
2. [The Theme System In Depth](#2-the-theme-system-in-depth)
3. [Theme Type Variations](#3-theme-type-variations)
4. [Runtime Theme Switching](#4-runtime-theme-switching)
5. [StyleBox Deep Dive](#5-stylebox-deep-dive)
6. [Responsive and Multi-Resolution UI](#6-responsive-and-multi-resolution-ui)
7. [Focus and Keyboard Navigation](#7-focus-and-keyboard-navigation)
8. [Custom Drawing with _draw()](#8-custom-drawing-with-_draw)
9. [Performance Patterns for Complex UIs](#9-performance-patterns-for-complex-uis)
10. [C# Examples](#10-c-examples)
11. [Common Patterns and Recipes](#11-common-patterns-and-recipes)
12. [Common Pitfalls](#12-common-pitfalls)

---

## 1. Building Custom Controls

### Anatomy of a Custom Control

A custom control extends `Control` (or a subclass like `BaseButton`, `Range`, `Container`) and overrides virtual methods to define its behavior:

```gdscript
@tool  # Enable editor preview
class_name HealthBar
extends Control

## Maximum health value.
@export var max_health: float = 100.0:
    set(value):
        max_health = value
        queue_redraw()

## Current health value.
@export var current_health: float = 100.0:
    set(value):
        current_health = clampf(value, 0.0, max_health)
        queue_redraw()

## Bar fill color.
@export var fill_color: Color = Color.GREEN

## Bar background color.
@export var bg_color: Color = Color(0.2, 0.2, 0.2)

func _get_minimum_size() -> Vector2:
    return Vector2(80, 16)  # Minimum usable size

func _draw() -> void:
    var rect := Rect2(Vector2.ZERO, size)
    # Background
    draw_rect(rect, bg_color)
    # Fill
    var fill_width := size.x * (current_health / max_health)
    var fill_rect := Rect2(Vector2.ZERO, Vector2(fill_width, size.y))
    draw_rect(fill_rect, fill_color)
    # Border
    draw_rect(rect, Color.WHITE, false, 1.0)
```

### Key Virtual Methods

| Method | Purpose |
|--------|---------|
| `_get_minimum_size()` | Returns the smallest size the control should be. Containers use this for layout. |
| `_draw()` | Custom rendering. Call `queue_redraw()` when state changes. |
| `_gui_input(event)` | Handle input when the control has focus or is clicked. |
| `_notification(what)` | React to lifecycle events (`NOTIFICATION_RESIZED`, `NOTIFICATION_THEME_CHANGED`, etc.) |
| `_get_tooltip(at_position)` | Return dynamic tooltip text based on cursor position. |

### Minimum Size

**Always override `_get_minimum_size()`** for custom controls. Without it, containers can collapse your control to 0×0. If your minimum size depends on content (text, icons), recalculate it when content changes:

```gdscript
func _get_minimum_size() -> Vector2:
    var font := get_theme_font("font", "Label")
    var font_size := get_theme_font_size("font_size", "Label")
    var text_size := font.get_string_size(_text, HORIZONTAL_ALIGNMENT_LEFT, -1, font_size)
    return text_size + Vector2(16, 8)  # Padding
```

After changing content, call `update_minimum_size()` to notify parent containers.

### Input Handling

```gdscript
func _gui_input(event: InputEvent) -> void:
    if event is InputEventMouseButton:
        if event.button_index == MOUSE_BUTTON_LEFT and event.pressed:
            _handle_click(event.position)
            accept_event()  # Consume the event

    elif event is InputEventMouseMotion:
        _handle_hover(event.position)
```

**`accept_event()`** prevents the event from propagating further — call it when your control handles an event.

---

## 2. The Theme System In Depth

### How Theme Lookup Works

When a control requests a theme item (color, font, icon, stylebox, constant), Godot searches in this order:

1. **Local overrides** — set directly on the control via `add_theme_*_override()`
2. **Theme on this control** — the `theme` property of this node
3. **Theme on parent controls** — walks up the tree looking for a theme
4. **Project default theme** — set in Project Settings → GUI → Theme → Custom

This cascading system means you can set a base theme at the root of your UI tree and override specific items on individual controls.

### Theme Items

Each theme type (a string like `"Button"`, `"Label"`, `"Panel"`) defines five categories of items:

| Category | Accessor | Example |
|----------|----------|---------|
| **Colors** | `get_theme_color("name", "Type")` | `font_color`, `icon_color` |
| **Constants** | `get_theme_constant("name", "Type")` | `margin_left`, `separation` |
| **Fonts** | `get_theme_font("name", "Type")` | `font` |
| **Font sizes** | `get_theme_font_size("name", "Type")` | `font_size` |
| **Icons** | `get_theme_icon("name", "Type")` | `checked`, `unchecked` |
| **StyleBoxes** | `get_theme_stylebox("name", "Type")` | `normal`, `hover`, `pressed` |

### Using Theme Items in Custom Controls

```gdscript
class_name CustomPanel
extends Control

func _draw() -> void:
    var style := get_theme_stylebox("panel", "CustomPanel")
    if style:
        draw_style_box(style, Rect2(Vector2.ZERO, size))

    var font := get_theme_font("font", "CustomPanel")
    var font_size := get_theme_font_size("font_size", "CustomPanel")
    var font_color := get_theme_color("font_color", "CustomPanel")
    if font:
        draw_string(font, Vector2(8, font_size + 4), _title, HORIZONTAL_ALIGNMENT_LEFT, -1, font_size, font_color)
```

### Responding to Theme Changes

```gdscript
func _notification(what: int) -> void:
    if what == NOTIFICATION_THEME_CHANGED:
        _update_cached_theme_values()
        queue_redraw()
```

---

## 3. Theme Type Variations

Theme type variations let you create **named variants** of existing control types without writing a new class. This is how you create styled button types (e.g., "DangerButton" that inherits from "Button" but uses red colors).

### Creating a Variation in the Theme Editor

1. Open your `.theme` resource in the Theme Editor.
2. Click **Add Type** and name it (e.g., `PrimaryButton`).
3. In the type inspector, set **Base Type** to `Button`.
4. Override only the items you want to change — everything else cascades from `Button`.

### Applying a Variation

Set the `theme_type_variation` property on any control:

```gdscript
var btn := Button.new()
btn.theme_type_variation = "PrimaryButton"
```

Or in the Inspector: **Control → Theme → Theme Type Variation**.

### Variation Hierarchy

Variations can chain: `DangerButton` → `PrimaryButton` → `Button`. Godot walks the chain looking for overrides.

---

## 4. Runtime Theme Switching

### Dark Mode / Light Mode

```gdscript
# theme_manager.gd — Autoload
extends Node

var dark_theme: Theme = preload("res://themes/dark.tres")
var light_theme: Theme = preload("res://themes/light.tres")
var current_mode: String = "dark"

func toggle_theme() -> void:
    current_mode = "light" if current_mode == "dark" else "dark"
    apply_theme()

func apply_theme() -> void:
    var root_control := get_tree().root.get_node("UI")  # Your UI root
    if root_control:
        root_control.theme = dark_theme if current_mode == "dark" else light_theme
```

### Smooth Theme Transitions

Combine theme switching with tweens for smooth color transitions:

```gdscript
func transition_theme(new_theme: Theme, duration: float = 0.3) -> void:
    var ui_root := get_tree().root.get_node("UI")
    # Fade out
    var tween := create_tween()
    tween.tween_property(ui_root, "modulate:a", 0.8, duration * 0.4)
    tween.tween_callback(func(): ui_root.theme = new_theme)
    tween.tween_property(ui_root, "modulate:a", 1.0, duration * 0.6)
```

---

## 5. StyleBox Deep Dive

StyleBoxes define the visual appearance of control backgrounds, borders, and decorations.

### StyleBox Types

| Type | Use Case |
|------|----------|
| `StyleBoxFlat` | Solid colors, rounded corners, borders, shadows — most common |
| `StyleBoxTexture` | Nine-slice texture-based styling |
| `StyleBoxLine` | Single line (used for separators) |
| `StyleBoxEmpty` | Explicitly no styling (not the same as null) |

### StyleBoxFlat Properties

```gdscript
var style := StyleBoxFlat.new()
style.bg_color = Color(0.15, 0.15, 0.2)
style.border_color = Color(0.4, 0.4, 0.5)
style.set_border_width_all(2)
style.set_corner_radius_all(8)
style.set_content_margin_all(12)
style.shadow_color = Color(0, 0, 0, 0.3)
style.shadow_size = 4
style.shadow_offset = Vector2(2, 2)
# Anti-aliased corners
style.anti_aliasing = true
style.anti_aliasing_size = 1.0
```

### Nine-Slice Textures

```gdscript
var style := StyleBoxTexture.new()
style.texture = preload("res://ui/panel_bg.png")
# Define the non-stretching margins (corners and edges)
style.texture_margin_left = 16
style.texture_margin_top = 16
style.texture_margin_right = 16
style.texture_margin_bottom = 16
# Content margin (inner padding)
style.set_content_margin_all(20)
```

### Button State StyleBoxes

Buttons use different styleboxes for each state:

| StyleBox Name | State |
|---------------|-------|
| `normal` | Default appearance |
| `hover` | Mouse over |
| `pressed` | Mouse down |
| `disabled` | `disabled = true` |
| `focus` | Keyboard focus |

```gdscript
func _ready() -> void:
    var normal := StyleBoxFlat.new()
    normal.bg_color = Color(0.2, 0.5, 0.8)
    normal.set_corner_radius_all(6)

    var hover := normal.duplicate()
    hover.bg_color = Color(0.3, 0.6, 0.9)

    var pressed := normal.duplicate()
    pressed.bg_color = Color(0.1, 0.3, 0.6)

    add_theme_stylebox_override("normal", normal)
    add_theme_stylebox_override("hover", hover)
    add_theme_stylebox_override("pressed", pressed)
```

---

## 6. Responsive and Multi-Resolution UI

### Anchor Presets

Anchors define how a control is positioned relative to its parent. Common presets:

```gdscript
# Full rect (fills parent)
control.set_anchors_preset(Control.PRESET_FULL_RECT)

# Bottom-center HUD bar
control.set_anchors_preset(Control.PRESET_CENTER_BOTTOM)
control.offset_top = -60
control.offset_bottom = 0

# Top-right corner (minimap)
control.set_anchors_preset(Control.PRESET_TOP_RIGHT)
```

### Container-Based Layouts

Prefer containers over manual positioning:

```
MarginContainer         ← Outer padding
  └─ VBoxContainer      ← Vertical stack
      ├─ HBoxContainer  ← Horizontal row
      │   ├─ Label
      │   └─ Button
      └─ HSeparator
```

### Size Flags

Control how children behave inside containers:

```gdscript
label.size_flags_horizontal = Control.SIZE_EXPAND_FILL  # Take available space
button.size_flags_horizontal = Control.SIZE_SHRINK_END   # Align to end
panel.size_flags_vertical = Control.SIZE_EXPAND_FILL
```

### Handling Different Aspect Ratios

```gdscript
func _ready() -> void:
    get_tree().root.size_changed.connect(_on_viewport_resized)
    _on_viewport_resized()

func _on_viewport_resized() -> void:
    var viewport_size := get_viewport_rect().size
    var aspect := viewport_size.x / viewport_size.y

    if aspect > 2.0:
        # Ultra-wide: show side panels
        $SidePanel.visible = true
    elif aspect < 1.5:
        # Narrow: stack vertically
        $MainLayout.columns = 1
    else:
        $SidePanel.visible = false
        $MainLayout.columns = 2
```

---

## 7. Focus and Keyboard Navigation

### Focus Neighbors

Set focus navigation explicitly for gamepad/keyboard UI:

```gdscript
# In scene setup or _ready()
$PlayButton.focus_neighbor_bottom = $OptionsButton.get_path()
$OptionsButton.focus_neighbor_top = $PlayButton.get_path()
$OptionsButton.focus_neighbor_bottom = $QuitButton.get_path()
$QuitButton.focus_neighbor_top = $OptionsButton.get_path()
```

### Grabbing Focus

```gdscript
func _on_menu_opened() -> void:
    # Always set initial focus for keyboard/gamepad users
    $FirstButton.grab_focus()
```

### Custom Focus Drawing

```gdscript
func _draw() -> void:
    if has_focus():
        var focus_style := get_theme_stylebox("focus", "Button")
        if focus_style:
            draw_style_box(focus_style, Rect2(Vector2.ZERO, size))
```

### Focus Groups (Tab Containers)

For complex UIs with multiple focus regions, use `TabContainer` or manage focus groups manually:

```gdscript
## Cycle focus within a set of controls
func cycle_focus(controls: Array[Control], forward: bool = true) -> void:
    var focused := get_viewport().gui_get_focus_owner()
    var idx := controls.find(focused)
    if idx == -1:
        controls[0].grab_focus()
    else:
        var next_idx := (idx + (1 if forward else -1)) % controls.size()
        controls[next_idx].grab_focus()
```

---

## 8. Custom Drawing with _draw()

### Drawing Primitives

```gdscript
func _draw() -> void:
    # Filled rectangle
    draw_rect(Rect2(0, 0, 100, 50), Color.BLUE)

    # Outlined rectangle
    draw_rect(Rect2(10, 10, 80, 30), Color.WHITE, false, 2.0)

    # Circle
    draw_circle(Vector2(50, 50), 20.0, Color.RED)

    # Arc (partial circle)
    draw_arc(Vector2(50, 50), 30.0, 0, TAU * 0.75, 32, Color.GREEN, 2.0)

    # Line
    draw_line(Vector2(0, 0), Vector2(100, 100), Color.YELLOW, 2.0)

    # Polyline
    draw_polyline([Vector2(0,0), Vector2(50,20), Vector2(100,0)], Color.CYAN, 2.0)

    # Texture
    draw_texture(icon_texture, Vector2(10, 10))

    # String
    var font := get_theme_font("font", "Label")
    draw_string(font, Vector2(10, 30), "Hello", HORIZONTAL_ALIGNMENT_LEFT, -1, 16, Color.WHITE)
```

### Circular Progress Bar Example

```gdscript
class_name CircularProgress
extends Control

@export_range(0.0, 1.0) var progress: float = 0.0:
    set(value):
        progress = clampf(value, 0.0, 1.0)
        queue_redraw()

@export var ring_width: float = 8.0
@export var fill_color: Color = Color(0.3, 0.7, 1.0)
@export var bg_color: Color = Color(0.2, 0.2, 0.2, 0.5)

func _get_minimum_size() -> Vector2:
    return Vector2(48, 48)

func _draw() -> void:
    var center := size / 2.0
    var radius := minf(size.x, size.y) / 2.0 - ring_width / 2.0

    # Background ring
    draw_arc(center, radius, 0, TAU, 64, bg_color, ring_width, true)

    # Fill arc (starts from top, -PI/2)
    if progress > 0.001:
        var end_angle := -PI / 2.0 + TAU * progress
        draw_arc(center, radius, -PI / 2.0, end_angle, 64, fill_color, ring_width, true)
```

---

## 9. Performance Patterns for Complex UIs

### Avoid Unnecessary Redraws

`queue_redraw()` triggers a full `_draw()` call. Only call it when visual state actually changes:

```gdscript
@export var value: float = 0.0:
    set(new_val):
        if not is_equal_approx(value, new_val):
            value = new_val
            queue_redraw()
```

### Visibility Culling

For scrolling lists with many items, show/hide items based on scroll position rather than rendering everything:

```gdscript
func _on_scroll_changed(value: float) -> void:
    var visible_range := get_visible_item_range(value)
    for i in _items.size():
        _items[i].visible = i >= visible_range.x and i <= visible_range.y
```

### Use ItemList or Tree for Large Lists

Don't create hundreds of Control nodes for list items. `ItemList` and `Tree` are optimized for rendering many items efficiently with a single draw call.

### Deferred Layout Updates

Batch layout changes to avoid multiple resize passes:

```gdscript
var _needs_layout_update := false

func request_layout() -> void:
    if not _needs_layout_update:
        _needs_layout_update = true
        call_deferred("_do_layout")

func _do_layout() -> void:
    _needs_layout_update = false
    # Perform layout calculations once
```

---

## 10. C# Examples

### Custom Control

```csharp
[Tool]
public partial class HealthBar : Control
{
    private float _maxHealth = 100f;
    [Export]
    public float MaxHealth
    {
        get => _maxHealth;
        set { _maxHealth = value; QueueRedraw(); }
    }

    private float _currentHealth = 100f;
    [Export]
    public float CurrentHealth
    {
        get => _currentHealth;
        set { _currentHealth = Mathf.Clamp(value, 0f, _maxHealth); QueueRedraw(); }
    }

    public override Vector2 _GetMinimumSize() => new(80, 16);

    public override void _Draw()
    {
        var rect = new Rect2(Vector2.Zero, Size);
        DrawRect(rect, new Color(0.2f, 0.2f, 0.2f));

        float fillWidth = Size.X * (_currentHealth / _maxHealth);
        DrawRect(new Rect2(Vector2.Zero, new Vector2(fillWidth, Size.Y)), Colors.Green);
        DrawRect(rect, Colors.White, false, 1f);
    }
}
```

### Theme Switching

```csharp
public partial class ThemeManager : Node
{
    private Theme _darkTheme = GD.Load<Theme>("res://themes/dark.tres");
    private Theme _lightTheme = GD.Load<Theme>("res://themes/light.tres");

    public void ApplyTheme(string mode)
    {
        var uiRoot = GetTree().Root.GetNode<Control>("UI");
        uiRoot.Theme = mode == "dark" ? _darkTheme : _lightTheme;
    }
}
```

---

## 11. Common Patterns and Recipes

### Tooltip with Rich Content

```gdscript
class_name RichTooltip
extends PanelContainer

@onready var title_label: Label = %TitleLabel
@onready var desc_label: RichTextLabel = %DescLabel
@onready var icon_rect: TextureRect = %IconRect

func setup(title: String, description: String, icon: Texture2D = null) -> void:
    title_label.text = title
    desc_label.text = description
    icon_rect.texture = icon
    icon_rect.visible = icon != null
```

### Animated Menu Buttons

```gdscript
extends Button

func _ready() -> void:
    mouse_entered.connect(_on_hover)
    mouse_exited.connect(_on_unhover)

func _on_hover() -> void:
    var tween := create_tween()
    tween.tween_property(self, "scale", Vector2(1.05, 1.05), 0.1) \
        .set_ease(Tween.EASE_OUT).set_trans(Tween.TRANS_CUBIC)

func _on_unhover() -> void:
    var tween := create_tween()
    tween.tween_property(self, "scale", Vector2.ONE, 0.1) \
        .set_ease(Tween.EASE_OUT).set_trans(Tween.TRANS_CUBIC)
```

---

## 12. Common Pitfalls

### Forgetting `update_minimum_size()`

After changing content that affects minimum size, call `update_minimum_size()` so parent containers recalculate layout. `_get_minimum_size()` is only called when requested.

### Theme Type String Mismatch

Theme lookups use string names. A typo in `get_theme_color("font_colr", "MyType")` silently returns a default value. Consider constants:

```gdscript
const THEME_TYPE := &"HealthBar"

func _draw() -> void:
    var color := get_theme_color(&"fill_color", THEME_TYPE)
```

### Overdrawing

Each `draw_*` call adds to the draw list. For complex UIs, prefer `StyleBoxFlat` (which is GPU-optimized) over many individual `draw_rect` and `draw_line` calls.

### Control Outside Viewport

Controls positioned outside the visible viewport still process input and layout. Set `visible = false` on off-screen UI to skip processing entirely.

---

## Summary

Godot's UI system is a full-featured toolkit once you understand the layers: custom controls with `_draw()` and `_get_minimum_size()` for reusable widgets, the cascading theme system for consistent styling, type variations for named style presets, and containers for responsive layout. The key is to work WITH the system — use theme lookups instead of hardcoded colors, containers instead of absolute positioning, and focus neighbors instead of mouse-only interaction.
