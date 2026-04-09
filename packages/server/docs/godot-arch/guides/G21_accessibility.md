# G21 — Accessibility in Godot Games

> **Category:** Guide · **Engine:** Godot 4.x (4.5+ for screen reader APIs) · **Language:** GDScript / C#  
> **Related:** [G9 UI & Control Systems](./G9_ui_control_systems.md) · [G4 Input Handling](./G4_input_handling.md) · [G10 Audio Systems](./G10_audio_systems.md) · [G12 Shaders & Visual Effects](./G12_shaders_and_visual_effects.md)

---

## What This Guide Covers

Accessibility (a11y) is about making your game playable by the widest possible audience — including players with visual, auditory, motor, or cognitive disabilities. Good accessibility isn't charity; it's good design that benefits everyone. Subtitles help in noisy rooms, rebindable controls help left-handed players, and colorblind modes help 8% of men.

This guide covers Godot-specific accessibility implementation: screen reader integration (Godot 4.5+), keyboard and controller navigation for UI, input remapping, colorblind-safe design, subtitle systems, scalable UI, difficulty options, and cognitive accessibility. Where Godot has built-in support, we use it. Where it doesn't, we build practical solutions.

**Target standard:** This guide references the [Game Accessibility Guidelines](https://gameaccessibilityguidelines.com/) and maps recommendations to Godot implementations at Basic, Intermediate, and Advanced levels.

---

## Table of Contents

1. [Why Accessibility Matters for Games](#1-why-accessibility-matters-for-games)
2. [Screen Reader Support (Godot 4.5+)](#2-screen-reader-support-godot-45)
3. [Keyboard and Controller Navigation](#3-keyboard-and-controller-navigation)
4. [Input Remapping](#4-input-remapping)
5. [Visual Accessibility](#5-visual-accessibility)
6. [Audio Accessibility](#6-audio-accessibility)
7. [Motor Accessibility](#7-motor-accessibility)
8. [Cognitive Accessibility](#8-cognitive-accessibility)
9. [Accessibility Options Menu](#9-accessibility-options-menu)
10. [Testing Your Game's Accessibility](#10-testing-your-games-accessibility)

---

## 1. Why Accessibility Matters for Games

- **~15% of the world's population** lives with some form of disability (WHO)
- **8% of men** and **0.5% of women** have color vision deficiency
- **~466 million people** have disabling hearing loss
- Players with temporary injuries, aging-related changes, or situational limitations also benefit

Beyond ethics and audience size, accessibility is increasingly a **platform requirement**: Apple requires accessibility metadata, Xbox has accessibility guidelines for certification, and Steam's accessibility tags help players find compatible games.

---

## 2. Screen Reader Support (Godot 4.5+)

Godot 4.5 introduced screen reader support via [AccessKit](https://accesskit.dev/), enabling assistive technology to read UI elements. This is experimental as of 4.5 but functional for standard Control nodes.

### How It Works

AccessKit creates an accessibility tree from your Control node hierarchy. Screen readers (NVDA, VoiceOver, JAWS) traverse this tree to announce element names, roles, and states.

### Enabling Screen Reader Support

Screen reader support is enabled by default in Godot 4.5+ for standard Control nodes. Each Control node exposes accessibility properties:

```gdscript
# Set accessible name and description on any Control
var button := Button.new()
button.text = "Start Game"  # Screen readers read button text automatically

# For controls without visible text, set the accessibility name
var icon_button := TextureButton.new()
icon_button.tooltip_text = "Settings"  # Used as fallback accessible name
```

### Custom Accessibility Bindings

For non-standard controls, implement custom screen reader behavior:

```gdscript
# custom_health_bar.gd
extends ProgressBar

func _ready() -> void:
    # Ensure the screen reader announces this meaningfully
    tooltip_text = "Health"

func _process(_delta: float) -> void:
    # Update accessible value description when health changes
    tooltip_text = "Health: %d percent" % int(value)
```

### Best Practices for Screen Reader Compatibility

- **Use standard Control nodes** wherever possible — they have built-in accessibility
- **Set meaningful text** on all interactive elements (Button, CheckBox, Slider, etc.)
- **Provide tooltip_text** on image-only controls
- **Use Label nodes** for important text — screen readers can traverse them
- **Avoid conveying information through visuals alone** — pair with text or audio

> **Compatibility note:** Screen reader support is only available in Godot 4.5+. For Godot 4.4 projects, use the [godot-accessibility](https://github.com/lightsoutgames/godot-accessibility) community addon as a fallback.

---

## 3. Keyboard and Controller Navigation

### Focus Navigation

Godot's Control system has built-in keyboard/controller focus navigation. Every `Control` node has focus neighbor properties:

```gdscript
# Set focus neighbors explicitly for complex layouts
@export var button_a: Button
@export var button_b: Button

func _ready() -> void:
    # Define focus flow: A → B (right) and B → A (left)
    button_a.focus_neighbor_right = button_b.get_path()
    button_b.focus_neighbor_left = button_a.get_path()

    # Set initial focus
    button_a.grab_focus()
```

### Auto-Focus Management

```gdscript
# menu_manager.gd — ensures focus is always somewhere sensible
extends Control

func _ready() -> void:
    # When the menu opens, focus the first interactive element
    visibility_changed.connect(_on_visibility_changed)

func _on_visibility_changed() -> void:
    if visible:
        # Find the first focusable child and grab focus
        var first_button := _find_first_focusable(self)
        if first_button:
            first_button.call_deferred("grab_focus")

func _find_first_focusable(node: Node) -> Control:
    if node is BaseButton or node is LineEdit or node is TextEdit:
        if (node as Control).visible:
            return node as Control
    for child in node.get_children():
        var result := _find_first_focusable(child)
        if result:
            return result
    return null
```

### Focus Visuals

Make focus indicators visible and high-contrast:

```gdscript
# In your theme or control script
func _ready() -> void:
    # Create a visible focus style
    var focus_style := StyleBoxFlat.new()
    focus_style.border_color = Color.YELLOW
    focus_style.border_width_left = 3
    focus_style.border_width_right = 3
    focus_style.border_width_top = 3
    focus_style.border_width_bottom = 3
    focus_style.corner_radius_top_left = 4
    focus_style.corner_radius_top_right = 4
    focus_style.corner_radius_bottom_left = 4
    focus_style.corner_radius_bottom_right = 4

    # Apply to all buttons in this control
    add_theme_stylebox_override("focus", focus_style)
```

---

## 4. Input Remapping

Godot's InputMap supports runtime remapping. Build an accessible remapping UI:

```gdscript
# input_remapper.gd
extends Control

signal binding_changed(action_name: String, event: InputEvent)

var _waiting_for_input := false
var _action_to_remap := ""

## Start listening for a new binding
func start_remap(action_name: String) -> void:
    _action_to_remap = action_name
    _waiting_for_input = true
    set_process_input(true)

func _input(event: InputEvent) -> void:
    if not _waiting_for_input:
        return

    # Accept keyboard, mouse button, and joypad inputs
    if event is InputEventKey or event is InputEventMouseButton \
            or event is InputEventJoypadButton or event is InputEventJoypadMotion:
        if event.is_pressed():
            _apply_remap(_action_to_remap, event)
            _waiting_for_input = false
            get_viewport().set_input_as_handled()

func _apply_remap(action_name: String, new_event: InputEvent) -> void:
    # Remove existing events of the same type
    for existing in InputMap.action_get_events(action_name):
        if existing.get_class() == new_event.get_class():
            InputMap.action_erase_event(action_name, existing)

    # Add the new binding
    InputMap.action_add_event(action_name, new_event)
    binding_changed.emit(action_name, new_event)

## Save remapped bindings to a config file
func save_bindings(path: String := "user://input_bindings.cfg") -> void:
    var config := ConfigFile.new()
    for action in InputMap.get_actions():
        if action.begins_with("ui_"):
            continue  # Skip built-in UI actions
        var events := InputMap.action_get_events(action)
        for i in events.size():
            config.set_value(action, "event_%d" % i, var_to_str(events[i]))
    config.save(path)

## Load remapped bindings from config
func load_bindings(path: String := "user://input_bindings.cfg") -> void:
    var config := ConfigFile.new()
    if config.load(path) != OK:
        return
    for action in config.get_sections():
        if not InputMap.has_action(action):
            continue
        # Clear current events
        InputMap.action_erase_events(action)
        for key in config.get_section_keys(action):
            var event = str_to_var(config.get_value(action, key))
            if event is InputEvent:
                InputMap.action_add_event(action, event)
```

---

## 5. Visual Accessibility

### Colorblind-Safe Design

Avoid relying on color alone to convey information. Pair color with shape, pattern, or text.

```gdscript
# colorblind_mode.gd — autoload
extends Node

enum Mode { NORMAL, PROTANOPIA, DEUTERANOPIA, TRITANOPIA }

var current_mode: Mode = Mode.NORMAL

## Color palettes that work for each type
const PALETTES := {
    Mode.NORMAL: {
        "danger": Color.RED,
        "safe": Color.GREEN,
        "warning": Color.YELLOW,
        "info": Color.BLUE,
    },
    Mode.PROTANOPIA: {
        "danger": Color(0.9, 0.6, 0.0),   # Orange
        "safe": Color(0.0, 0.45, 0.7),     # Blue
        "warning": Color(0.95, 0.9, 0.25), # Yellow
        "info": Color(0.0, 0.6, 0.5),      # Teal
    },
    Mode.DEUTERANOPIA: {
        "danger": Color(0.9, 0.6, 0.0),
        "safe": Color(0.0, 0.45, 0.7),
        "warning": Color(0.95, 0.9, 0.25),
        "info": Color(0.0, 0.6, 0.5),
    },
    Mode.TRITANOPIA: {
        "danger": Color(0.8, 0.2, 0.2),
        "safe": Color(0.0, 0.45, 0.7),
        "warning": Color(0.9, 0.55, 0.0),
        "info": Color(0.6, 0.35, 0.7),
    },
}

func get_color(semantic_name: String) -> Color:
    return PALETTES[current_mode].get(semantic_name, Color.WHITE)
```

### Scalable UI

Let players adjust UI scale, font size, and HUD element size:

```gdscript
# ui_scale.gd
extends Node

var ui_scale: float = 1.0:
    set(value):
        ui_scale = clampf(value, 0.75, 2.0)
        get_tree().root.content_scale_factor = ui_scale

var font_scale: float = 1.0:
    set(value):
        font_scale = clampf(value, 0.75, 2.5)
        _apply_font_scale()

func _apply_font_scale() -> void:
    # Update the default theme's font sizes
    var theme := ThemeDB.get_project_theme()
    if theme:
        var base_size := 16
        theme.set_default_font_size(int(base_size * font_scale))
```

### High Contrast Mode

```gdscript
# Apply a high-contrast shader to the entire viewport
# high_contrast.gdshader
shader_type canvas_item;

uniform float contrast : hint_range(1.0, 3.0) = 1.0;
uniform float brightness : hint_range(-0.5, 0.5) = 0.0;

void fragment() {
    vec4 color = texture(TEXTURE, UV);
    color.rgb = (color.rgb - 0.5) * contrast + 0.5 + brightness;
    COLOR = color;
}
```

---

## 6. Audio Accessibility

### Subtitle System

```gdscript
# subtitle_manager.gd — autoload
extends CanvasLayer

@onready var label: RichTextLabel = $SubtitleLabel

var _queue: Array[Dictionary] = []
var _timer: float = 0.0

## Display a subtitle with optional speaker name and duration
func show_subtitle(text: String, speaker: String = "",
        duration: float = 3.0, color: Color = Color.WHITE) -> void:
    var entry := {
        "text": text,
        "speaker": speaker,
        "duration": duration,
        "color": color,
    }
    _queue.append(entry)
    if _queue.size() == 1:
        _display_next()

func _display_next() -> void:
    if _queue.is_empty():
        label.visible = false
        return

    var entry: Dictionary = _queue[0]
    label.visible = true
    if entry["speaker"] != "":
        label.text = "[b][color=#%s]%s:[/color][/b] %s" % [
            entry["color"].to_html(false),
            entry["speaker"],
            entry["text"]
        ]
    else:
        label.text = entry["text"]
    _timer = entry["duration"]

func _process(delta: float) -> void:
    if _queue.is_empty():
        return
    _timer -= delta
    if _timer <= 0.0:
        _queue.pop_front()
        _display_next()
```

### Visual Audio Cues

For deaf and hard-of-hearing players, visualize important sounds:

```gdscript
# audio_cue_visualizer.gd — shows directional indicators for important sounds
extends Control

## Call this when a significant sound plays in the game world
func show_cue(world_position: Vector2, icon: Texture2D,
        duration: float = 2.0) -> void:
    var indicator := TextureRect.new()
    indicator.texture = icon
    indicator.modulate.a = 0.0
    add_child(indicator)

    # Position at screen edge pointing toward the sound source
    var screen_center := get_viewport_rect().size / 2.0
    var direction := (world_position - screen_center).normalized()
    var edge_pos := screen_center + direction * minf(
        screen_center.x, screen_center.y) * 0.9
    indicator.global_position = edge_pos
    indicator.rotation = direction.angle()

    # Animate in and out
    var tween := create_tween()
    tween.tween_property(indicator, "modulate:a", 1.0, 0.2)
    tween.tween_interval(duration - 0.4)
    tween.tween_property(indicator, "modulate:a", 0.0, 0.2)
    tween.tween_callback(indicator.queue_free)
```

### Separate Volume Controls

Always provide independent volume sliders for music, sound effects, voice, and UI sounds:

```gdscript
# audio_settings.gd
extends Node

func set_bus_volume(bus_name: String, linear: float) -> void:
    var bus_idx := AudioServer.get_bus_index(bus_name)
    if bus_idx == -1:
        return
    if linear <= 0.0:
        AudioServer.set_bus_mute(bus_idx, true)
    else:
        AudioServer.set_bus_mute(bus_idx, false)
        AudioServer.set_bus_volume_db(bus_idx, linear_to_db(linear))
```

---

## 7. Motor Accessibility

### Hold vs. Toggle

Let players choose between holding a button and toggling:

```gdscript
# toggle_actions.gd
var sprint_toggle_mode: bool = false  # User preference
var _sprint_active: bool = false

func _input(event: InputEvent) -> void:
    if event.is_action_pressed("sprint"):
        if sprint_toggle_mode:
            _sprint_active = not _sprint_active
        else:
            _sprint_active = true
    elif event.is_action_released("sprint"):
        if not sprint_toggle_mode:
            _sprint_active = false
```

### Adjustable Timings

QTEs, combo windows, and timed actions should be adjustable:

```gdscript
# qte_manager.gd
@export_range(0.5, 3.0, 0.25) var time_multiplier: float = 1.0

func start_qte(base_duration: float) -> void:
    var actual_duration := base_duration * time_multiplier
    # ...
```

### Auto-Aim and Aim Assist

```gdscript
# aim_assist.gd
@export var assist_radius: float = 50.0  # pixels
@export var assist_strength: float = 0.3  # 0 = off, 1 = full snap

func apply_aim_assist(aim_direction: Vector2,
        target_positions: Array[Vector2]) -> Vector2:
    if assist_strength <= 0.0:
        return aim_direction

    var closest_target: Vector2 = Vector2.ZERO
    var closest_angle: float = INF

    for target_pos in target_positions:
        var to_target := (target_pos - global_position).normalized()
        var angle := aim_direction.angle_to(to_target)
        if absf(angle) < closest_angle:
            closest_angle = absf(angle)
            closest_target = to_target

    if closest_angle < deg_to_rad(15.0):  # Within 15 degree cone
        return aim_direction.lerp(closest_target, assist_strength)
    return aim_direction
```

---

## 8. Cognitive Accessibility

### Difficulty Settings

Offer granular difficulty instead of just Easy/Normal/Hard:

```gdscript
# difficulty_settings.gd — resource-based difficulty
class_name DifficultySettings
extends Resource

@export_group("Combat")
@export_range(0.25, 2.0, 0.25) var enemy_damage_multiplier: float = 1.0
@export_range(0.25, 2.0, 0.25) var player_damage_multiplier: float = 1.0
@export var player_invincibility: bool = false

@export_group("Navigation")
@export var show_waypoints: bool = true
@export var show_minimap: bool = true
@export_range(0.5, 2.0, 0.25) var puzzle_hint_delay: float = 1.0

@export_group("UI")
@export var show_tutorials: bool = true
@export var pause_during_dialogue: bool = true
@export var auto_save_frequency_seconds: float = 300.0
```

### Clear Objective Indicators

```gdscript
# objective_marker.gd — screen-edge compass marker
extends Control

@export var target: Node2D
@export var icon: Texture2D
@export var show_distance: bool = true

func _process(_delta: float) -> void:
    if not target or not is_instance_valid(target):
        visible = false
        return

    var camera := get_viewport().get_camera_2d()
    if not camera:
        return

    var screen_pos := camera.get_viewport().get_screen_transform() * \
        (target.global_position - camera.global_position + \
        get_viewport_rect().size / 2.0)
    var viewport_rect := get_viewport_rect()

    if viewport_rect.has_point(screen_pos):
        # Target is on screen — show marker at target position
        global_position = screen_pos
    else:
        # Clamp to screen edge
        var center := viewport_rect.size / 2.0
        var direction := (screen_pos - center).normalized()
        global_position = center + direction * minf(center.x, center.y) * 0.9
```

---

## 9. Accessibility Options Menu

Provide a dedicated accessibility section in your options menu. Here's a recommended structure:

```
Accessibility
├── Visual
│   ├── UI Scale (0.75x – 2.0x)
│   ├── Font Size (Small / Medium / Large / Extra Large)
│   ├── Colorblind Mode (Off / Protanopia / Deuteranopia / Tritanopia)
│   ├── High Contrast Mode (On / Off)
│   ├── Screen Shake Intensity (0% – 100%)
│   ├── Flash Effects (On / Reduced / Off)
│   └── HUD Opacity (25% – 100%)
├── Audio
│   ├── Music Volume
│   ├── SFX Volume
│   ├── Voice Volume
│   ├── Subtitles (On / Off)
│   ├── Subtitle Size (Small / Medium / Large)
│   ├── Speaker Names in Subtitles (On / Off)
│   └── Visual Sound Indicators (On / Off)
├── Controls
│   ├── Remap Controls
│   ├── Sprint: Hold / Toggle
│   ├── Aim: Hold / Toggle
│   ├── Controller Vibration (0% – 100%)
│   ├── Aim Assist (Off / Low / Medium / High)
│   └── QTE Time Multiplier (0.5x – 3.0x)
└── Gameplay
    ├── Difficulty Preset (with custom option)
    ├── Tutorial Hints (On / Off)
    ├── Navigation Assists (Waypoints / Minimap)
    └── Auto-Save Frequency
```

> **Key principle:** Let players discover and change accessibility settings **before** they start playing. Consider showing accessibility options during first launch.

---

## 10. Testing Your Game's Accessibility

### Manual Testing Checklist

- [ ] Play the entire game using only keyboard (no mouse)
- [ ] Play using only a controller
- [ ] Enable a screen reader and navigate all menus
- [ ] Apply each colorblind filter and check all color-coded information
- [ ] Mute all audio and verify you can still play
- [ ] Set UI scale to maximum — check for overflow/clipping
- [ ] Try with the game at 200% system display scaling
- [ ] Enable high contrast mode and check readability
- [ ] Verify all subtitles display correctly
- [ ] Check that no gameplay requires rapid button presses without alternatives

### Automated Checks

```gdscript
# accessibility_audit.gd — @tool script to check common issues
@tool
extends EditorScript

func _run() -> void:
    var root := get_editor_interface().get_edited_scene_root()
    if not root:
        print("No scene open")
        return

    var issues: Array[String] = []

    _check_node_tree(root, issues)

    if issues.is_empty():
        print("✓ No accessibility issues found")
    else:
        print("⚠ Found %d accessibility issues:" % issues.size())
        for issue in issues:
            print("  - " + issue)

func _check_node_tree(node: Node, issues: Array[String]) -> void:
    # Check: TextureButtons should have tooltip_text for screen readers
    if node is TextureButton:
        var tb := node as TextureButton
        if tb.tooltip_text.is_empty() and (tb.text == null or tb.text.is_empty()):
            issues.append("%s: TextureButton has no tooltip_text (screen reader can't describe it)" % node.get_path())

    # Check: Labels with very small font
    if node is Label:
        var label := node as Label
        var font_size := label.get_theme_font_size("font_size")
        if font_size < 14:
            issues.append("%s: Font size %d is below minimum readable size (14)" % [node.get_path(), font_size])

    # Check: Buttons without text
    if node is Button:
        var btn := node as Button
        if btn.text.is_empty() and btn.icon == null and btn.tooltip_text.is_empty():
            issues.append("%s: Button has no text, icon, or tooltip" % node.get_path())

    for child in node.get_children():
        _check_node_tree(child, issues)
```

### Community Resources

- [Game Accessibility Guidelines](https://gameaccessibilityguidelines.com/) — comprehensive checklist organized by difficulty
- [Can I Play That?](https://caniplaythat.com/) — accessibility reviews and news
- [Xbox Accessibility Guidelines](https://learn.microsoft.com/en-us/gaming/accessibility/guidelines) — detailed guidelines with Godot-applicable patterns

---

## Common Mistakes

| Mistake | Fix |
|---------|-----|
| Color is the only differentiator | Add shapes, patterns, or text alongside color |
| No keyboard/controller menu navigation | Set focus neighbors, ensure `grab_focus()` on menu open |
| Hardcoded font sizes | Use Theme resources and allow user scaling |
| Subtitles with no background | Add a semi-transparent background panel for readability |
| Flashing effects with no option to reduce | Gate flashes behind a "Reduce Motion" setting |
| Settings only accessible from main menu | Allow pause-menu access to all accessibility options |
| No save after changing accessibility settings | Auto-save accessibility preferences immediately |
| Assuming all players can read small text | Default to 16px+ minimum, allow scaling up to 2.5x |
