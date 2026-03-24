# G9 — UI & Control Systems
> **Category:** Guide · **Engine:** Godot 4.4+ · **Language:** GDScript  
> **Related:** [E1 Architecture Overview](../architecture/E1_architecture_overview.md) · [G1 Scene Composition](./G1_scene_composition.md) · [G3 Signal Architecture](./G3_signal_architecture.md) · [G8 Animation Systems](./G8_animation_systems.md) · [UI Theory](../../core/concepts/ui-theory.md)

---

## What This Guide Covers

UI is the bridge between your game and the player. Every genre needs it — HUDs, menus, inventory screens, dialogue boxes, shops, crafting grids, settings panels. Godot's Control node system provides a flexible, theme-driven UI framework that works across resolutions and input methods.

This guide covers the Control node hierarchy, containers and anchors, the theme system, HUD design, menus and navigation, inventory UI, dialogue display, shop/vendor interfaces, tooltip and popup patterns, screen transitions, resolution scaling, gamepad/keyboard UI navigation, and performance. All code targets Godot 4.4+ with typed GDScript.

For engine-agnostic UI architecture (layout models, data binding, accessibility), see [UI Theory](../../core/concepts/ui-theory.md). For input handling (rebinding, gamepad detection, action mapping), see [G4 Input Handling](./G4_input_handling.md).

---

## Control Node Hierarchy — The Foundation

Every UI element in Godot inherits from `Control`. Understanding the inheritance chain determines which node to use.

```
Control (base — raw rectangle, handles input/sizing)
├── Label / RichTextLabel
├── TextureRect / NinePatchRect
├── Button / TextureButton / LinkButton / OptionButton / MenuButton
├── LineEdit / TextEdit / CodeEdit
├── Range → ProgressBar / HScrollBar / VScrollBar / SpinBox / HSlider / VSlider
├── TextureProgressBar
├── ItemList / Tree
├── TabContainer / TabBar
├── Container (layout — auto-positions children)
│   ├── BoxContainer → HBoxContainer / VBoxContainer
│   ├── GridContainer
│   ├── MarginContainer
│   ├── CenterContainer
│   ├── PanelContainer
│   ├── ScrollContainer
│   ├── HSplitContainer / VSplitContainer
│   ├── FlowContainer → HFlowContainer / VFlowContainer
│   └── AspectRatioContainer
├── Panel
├── ColorRect
├── SubViewportContainer
└── ReferenceRect (editor-only debug)
```

**Decision tree — which node do I need?**
```
Displaying text?
├── Simple text → Label
├── Rich/formatted/BBCode → RichTextLabel
└── User editable → LineEdit (single) / TextEdit (multi)

Displaying an image?
├── Full texture → TextureRect
├── Scalable border → NinePatchRect
└── Fill amount (health bar) → TextureProgressBar

Player clicks/taps it?
├── Text button → Button
├── Image button → TextureButton
├── Dropdown → OptionButton
└── Popup menu → MenuButton

Laying out children?
├── Row → HBoxContainer
├── Column → VBoxContainer
├── Grid → GridContainer
├── Centered → CenterContainer
├── With padding → MarginContainer
├── Scrollable list → ScrollContainer > VBoxContainer
└── Panel with background → PanelContainer

Showing a value/range?
├── Read-only bar → ProgressBar / TextureProgressBar
├── User-adjustable → HSlider / VSlider
└── Numeric entry → SpinBox
```

---

## Anchors, Margins, and Layout

Control nodes position themselves relative to their parent via **anchors** (0.0–1.0, proportional) and **offsets** (pixels from anchor position).

### Anchor Presets

```gdscript
## HUD element pinned to top-left
@onready var health_bar: TextureProgressBar = $HealthBar

func _ready() -> void:
	# Anchor presets via code — matches editor presets
	health_bar.set_anchors_preset(Control.PRESET_TOP_LEFT)
	health_bar.offset_left = 16.0
	health_bar.offset_top = 16.0

## Full-screen overlay (e.g., pause menu background)
@onready var overlay: ColorRect = $PauseOverlay

func show_pause() -> void:
	overlay.set_anchors_preset(Control.PRESET_FULL_RECT)
	overlay.show()

## Bottom-center element (dialogue box)
@onready var dialogue_box: PanelContainer = $DialogueBox

func _ready() -> void:
	dialogue_box.set_anchors_preset(Control.PRESET_CENTER_BOTTOM)
	dialogue_box.offset_top = -120.0  # 120px above bottom edge
```

### Common Anchor Presets Reference

| Preset | Anchors | Use For |
|--------|---------|---------|
| `PRESET_TOP_LEFT` | (0,0)-(0,0) | Health bar, minimap |
| `PRESET_TOP_RIGHT` | (1,0)-(1,0) | Score, ammo counter |
| `PRESET_BOTTOM_LEFT` | (0,1)-(0,1) | Hotbar, abilities |
| `PRESET_CENTER_BOTTOM` | (0.5,1)-(0.5,1) | Dialogue box |
| `PRESET_CENTER` | (0.5,0.5)-(0.5,0.5) | Popup, modal |
| `PRESET_FULL_RECT` | (0,0)-(1,1) | Overlay, background |
| `PRESET_LEFT_WIDE` | (0,0)-(0,1) | Side panel |
| `PRESET_TOP_WIDE` | (0,0)-(1,0) | Top bar, notifications |

### Container-Based Layout

Prefer containers over manual positioning — containers handle resize automatically.

```gdscript
## Inventory grid — 5 columns, auto-sized cells
extends GridContainer

func _ready() -> void:
	columns = 5
	add_theme_constant_override("h_separation", 4)
	add_theme_constant_override("v_separation", 4)
	
	for i: int in range(20):
		var slot: InventorySlot = inventory_slot_scene.instantiate()
		add_child(slot)

## Stat list — vertical with consistent spacing
extends VBoxContainer

func add_stat(label_text: String, value: String) -> void:
	var row: HBoxContainer = HBoxContainer.new()
	row.alignment = BoxContainer.ALIGNMENT_BEGIN
	
	var name_label: Label = Label.new()
	name_label.text = label_text
	name_label.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	
	var value_label: Label = Label.new()
	value_label.text = value
	value_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_RIGHT
	
	row.add_child(name_label)
	row.add_child(value_label)
	add_child(row)
```

### Size Flags

Size flags control how children expand inside containers.

```gdscript
# Fill available space equally
control.size_flags_horizontal = Control.SIZE_EXPAND_FILL

# Take minimum space only
control.size_flags_horizontal = Control.SIZE_SHRINK_BEGIN

# Expand but don't fill (stay small, push others)
control.size_flags_horizontal = Control.SIZE_EXPAND

# Stretch ratio — relative sizing between siblings
control.size_flags_stretch_ratio = 2.0  # twice as wide as ratio 1.0 siblings
```

---

## Theme System — Consistent Styling

Themes define the visual appearance of all Control nodes. One Theme resource can style your entire game.

### Creating a Theme

```gdscript
## theme_setup.gd — Autoload or called once at startup
class_name ThemeBuilder

static func create_game_theme() -> Theme:
	var theme := Theme.new()
	
	# Default font for all controls
	var font: FontFile = load("res://assets/fonts/pixel_font.ttf")
	theme.set_default_font(font)
	theme.set_default_font_size(16)
	
	# Button styling
	var button_normal := StyleBoxFlat.new()
	button_normal.bg_color = Color(0.2, 0.2, 0.3, 0.9)
	button_normal.corner_radius_top_left = 4
	button_normal.corner_radius_top_right = 4
	button_normal.corner_radius_bottom_left = 4
	button_normal.corner_radius_bottom_right = 4
	button_normal.content_margin_left = 12.0
	button_normal.content_margin_right = 12.0
	button_normal.content_margin_top = 8.0
	button_normal.content_margin_bottom = 8.0
	
	var button_hover := button_normal.duplicate()
	button_hover.bg_color = Color(0.3, 0.3, 0.45, 0.95)
	
	var button_pressed := button_normal.duplicate()
	button_pressed.bg_color = Color(0.15, 0.15, 0.25, 1.0)
	
	var button_disabled := button_normal.duplicate()
	button_disabled.bg_color = Color(0.15, 0.15, 0.15, 0.5)
	
	theme.set_stylebox("normal", "Button", button_normal)
	theme.set_stylebox("hover", "Button", button_hover)
	theme.set_stylebox("pressed", "Button", button_pressed)
	theme.set_stylebox("disabled", "Button", button_disabled)
	
	# Label colors
	theme.set_color("font_color", "Label", Color(0.9, 0.9, 0.85))
	theme.set_color("font_shadow_color", "Label", Color(0.0, 0.0, 0.0, 0.5))
	theme.set_constant("shadow_offset_x", "Label", 1)
	theme.set_constant("shadow_offset_y", "Label", 1)
	
	# Panel styling
	var panel_style := StyleBoxFlat.new()
	panel_style.bg_color = Color(0.1, 0.1, 0.15, 0.85)
	panel_style.border_color = Color(0.4, 0.35, 0.5, 0.8)
	panel_style.border_width_left = 2
	panel_style.border_width_right = 2
	panel_style.border_width_top = 2
	panel_style.border_width_bottom = 2
	panel_style.corner_radius_top_left = 6
	panel_style.corner_radius_top_right = 6
	panel_style.corner_radius_bottom_left = 6
	panel_style.corner_radius_bottom_right = 6
	panel_style.content_margin_left = 12.0
	panel_style.content_margin_right = 12.0
	panel_style.content_margin_top = 12.0
	panel_style.content_margin_bottom = 12.0
	theme.set_stylebox("panel", "PanelContainer", panel_style)
	
	return theme
```

### Applying Themes

```gdscript
## Apply to entire scene tree — set on root Control or use Project Settings
func _ready() -> void:
	# Option 1: Set on a root Control (propagates to all children)
	$UI.theme = ThemeBuilder.create_game_theme()
	
	# Option 2: Per-control overrides (highest priority)
	$SpecialButton.add_theme_color_override("font_color", Color.GOLD)
	$SpecialButton.add_theme_font_size_override("font_size", 24)

## Theme lookup order (highest to lowest priority):
# 1. Per-control overrides (add_theme_*_override)
# 2. Control's own .theme resource
# 3. Nearest ancestor's .theme resource
# 4. Project Settings → GUI → Theme → Custom (global fallback)
```

### StyleBox Types

| StyleBox Type | Use For |
|---------------|---------|
| `StyleBoxFlat` | Solid colors, borders, rounded corners — most common |
| `StyleBoxTexture` | Texture-based panels — for highly stylized UIs |
| `StyleBoxLine` | Separator lines |
| `StyleBoxEmpty` | Invisible (remove default styling) |

---

## HUD Design — In-Game Information Display

The HUD (Heads-Up Display) shows real-time game information. It lives on a `CanvasLayer` so it renders above the game world regardless of camera position.

### HUD Architecture

```
CanvasLayer (layer = 10)
└── HUD (Control — PRESET_FULL_RECT)
    ├── TopBar (HBoxContainer — PRESET_TOP_WIDE)
    │   ├── HealthDisplay (HBoxContainer)
    │   │   ├── HeartIcon (TextureRect)
    │   │   └── HealthBar (TextureProgressBar)
    │   ├── Spacer (Control — SIZE_EXPAND_FILL)
    │   ├── CoinDisplay (HBoxContainer)
    │   │   ├── CoinIcon (TextureRect)
    │   │   └── CoinLabel (Label)
    │   └── ScoreLabel (Label)
    ├── AbilityBar (HBoxContainer — PRESET_CENTER_BOTTOM)
    │   ├── Ability1 (AbilitySlot)
    │   ├── Ability2 (AbilitySlot)
    │   └── Ability3 (AbilitySlot)
    └── Minimap (SubViewportContainer — PRESET_TOP_RIGHT)
```

### Animated Health Bar

```gdscript
## health_bar.gd — Smooth health bar with damage preview
extends Control

@export var max_health: int = 100
@export var damage_preview_delay: float = 0.4
@export var damage_preview_speed: float = 80.0

@onready var health_fill: TextureProgressBar = $HealthFill
@onready var damage_fill: TextureProgressBar = $DamageFill
@onready var health_label: Label = $HealthLabel
@onready var damage_timer: Timer = $DamageTimer

var current_health: int = 100
var display_health: float = 100.0
var damage_display: float = 100.0

func _ready() -> void:
	health_fill.max_value = max_health
	damage_fill.max_value = max_health
	damage_timer.wait_time = damage_preview_delay
	damage_timer.one_shot = true
	damage_timer.timeout.connect(_on_damage_timer_timeout)
	_update_display()

func set_health(new_health: int) -> void:
	var old_health: int = current_health
	current_health = clampi(new_health, 0, max_health)
	display_health = float(current_health)
	health_fill.value = display_health
	health_label.text = "%d / %d" % [current_health, max_health]
	
	if current_health < old_health:
		# Damage taken — delay the damage preview drain
		damage_timer.start()
		_flash_red()
	else:
		# Healed — immediately catch up
		damage_display = display_health
		damage_fill.value = damage_display

func _on_damage_timer_timeout() -> void:
	# Start draining the damage preview bar
	set_process(true)

func _process(delta: float) -> void:
	if damage_display > display_health:
		damage_display = move_toward(damage_display, display_health, damage_preview_speed * delta)
		damage_fill.value = damage_display
	else:
		damage_display = display_health
		damage_fill.value = damage_display
		set_process(false)

func _flash_red() -> void:
	var tween: Tween = create_tween()
	tween.tween_property(health_fill, "modulate", Color(1.5, 0.3, 0.3), 0.05)
	tween.tween_property(health_fill, "modulate", Color.WHITE, 0.2)

func _update_display() -> void:
	health_fill.value = display_health
	damage_fill.value = damage_display
	health_label.text = "%d / %d" % [current_health, max_health]
```

### Animated Counter (Score, Coins)

```gdscript
## animated_counter.gd — Smoothly counts up/down to target value
extends Label

@export var count_speed: float = 200.0
@export var prefix: String = ""
@export var suffix: String = ""

var target_value: int = 0
var display_value: float = 0.0

func set_value(value: int) -> void:
	target_value = value
	set_process(true)

func _process(delta: float) -> void:
	if absf(display_value - float(target_value)) < 1.0:
		display_value = float(target_value)
		text = prefix + str(target_value) + suffix
		set_process(false)
	else:
		display_value = move_toward(display_value, float(target_value), count_speed * delta)
		text = prefix + str(roundi(display_value)) + suffix
```

### Ability Cooldown Slot

```gdscript
## ability_slot.gd — Radial cooldown display with input hint
extends Control

signal ability_activated

@export var cooldown_time: float = 5.0
@export var icon: Texture2D
@export var input_hint: String = "Q"

@onready var icon_rect: TextureRect = $Icon
@onready var cooldown_overlay: TextureProgressBar = $CooldownOverlay
@onready var cooldown_label: Label = $CooldownLabel
@onready var hint_label: Label = $HintLabel

var remaining: float = 0.0

func _ready() -> void:
	icon_rect.texture = icon
	hint_label.text = input_hint
	cooldown_overlay.max_value = cooldown_time
	cooldown_overlay.value = 0.0
	cooldown_label.visible = false
	set_process(false)

func activate() -> void:
	if remaining > 0.0:
		return  # Still on cooldown
	ability_activated.emit()
	remaining = cooldown_time
	cooldown_overlay.value = remaining
	cooldown_label.visible = true
	set_process(true)

func _process(delta: float) -> void:
	remaining -= delta
	if remaining <= 0.0:
		remaining = 0.0
		cooldown_overlay.value = 0.0
		cooldown_label.visible = false
		set_process(false)
		_flash_ready()
	else:
		cooldown_overlay.value = remaining
		cooldown_label.text = "%0.1f" % remaining

func _flash_ready() -> void:
	var tween: Tween = create_tween()
	tween.tween_property(icon_rect, "modulate", Color(1.5, 1.5, 1.5), 0.1)
	tween.tween_property(icon_rect, "modulate", Color.WHITE, 0.3)
```

### Damage Numbers (Floating Text)

```gdscript
## damage_number.gd — Floating damage popup that rises and fades
extends Label

@export var rise_speed: float = 60.0
@export var fade_duration: float = 0.8
@export var spread: float = 20.0

func setup(amount: int, pos: Vector2, is_crit: bool = false) -> void:
	global_position = pos + Vector2(randf_range(-spread, spread), 0.0)
	text = str(amount)
	
	if is_crit:
		text = str(amount) + "!"
		add_theme_font_size_override("font_size", 24)
		add_theme_color_override("font_color", Color.GOLD)
		scale = Vector2(1.3, 1.3)
	
	var tween: Tween = create_tween().set_parallel(true)
	tween.tween_property(self, "position:y", position.y - 40.0, fade_duration).set_ease(Tween.EASE_OUT)
	tween.tween_property(self, "modulate:a", 0.0, fade_duration).set_delay(fade_duration * 0.5)
	tween.chain().tween_callback(queue_free)

## Spawner — call from your damage system
## DamageNumberSpawner.gd (Autoload)
extends Node

var damage_number_scene: PackedScene = preload("res://ui/damage_number.tscn")

func spawn(amount: int, world_pos: Vector2, is_crit: bool = false) -> void:
	var number: Label = damage_number_scene.instantiate()
	# Add to a CanvasLayer so it stays screen-relative
	get_tree().current_scene.get_node("UI").add_child(number)
	number.setup(amount, world_pos, is_crit)
```

---

## Menu Systems — Navigation and Flow

### Screen Manager (Stack-Based)

```gdscript
## screen_manager.gd — Manages UI screen stack with transitions
## Attach to a root Control node that parents all screen scenes.
extends Control

signal screen_changed(screen_name: String)

@export var initial_screen: String = "MainMenu"
@export var transition_duration: float = 0.25

var _screen_stack: Array[Control] = []
var _screens: Dictionary = {}  # name → Control
var _transitioning: bool = false

func _ready() -> void:
	# Register all child screens
	for child: Node in get_children():
		if child is Control:
			_screens[child.name] = child
			child.visible = false
	
	# Show initial screen
	if _screens.has(initial_screen):
		_push_screen(initial_screen, false)

## Push a new screen on top (previous stays in stack)
func push(screen_name: String) -> void:
	if _transitioning or not _screens.has(screen_name):
		return
	_push_screen(screen_name, true)

## Pop current screen, return to previous
func pop() -> void:
	if _transitioning or _screen_stack.size() <= 1:
		return
	_pop_screen()

## Replace current screen (no stack history)
func switch_to(screen_name: String) -> void:
	if _transitioning or not _screens.has(screen_name):
		return
	_clear_stack()
	_push_screen(screen_name, false)

func _push_screen(screen_name: String, animate: bool) -> void:
	var screen: Control = _screens[screen_name]
	
	# Hide current top
	if not _screen_stack.is_empty():
		var current: Control = _screen_stack.back()
		if animate:
			await _fade_out(current)
		else:
			current.visible = false
	
	_screen_stack.push_back(screen)
	screen.visible = true
	if animate:
		await _fade_in(screen)
	screen_changed.emit(screen_name)

func _pop_screen() -> void:
	_transitioning = true
	var current: Control = _screen_stack.pop_back()
	await _fade_out(current)
	current.visible = false
	
	if not _screen_stack.is_empty():
		var previous: Control = _screen_stack.back()
		previous.visible = true
		await _fade_in(previous)
		screen_changed.emit(previous.name)
	_transitioning = false

func _fade_out(control: Control) -> void:
	_transitioning = true
	var tween: Tween = create_tween()
	tween.tween_property(control, "modulate:a", 0.0, transition_duration)
	await tween.finished

func _fade_in(control: Control) -> void:
	control.modulate.a = 0.0
	var tween: Tween = create_tween()
	tween.tween_property(control, "modulate:a", 1.0, transition_duration)
	await tween.finished
	_transitioning = false

func _clear_stack() -> void:
	for screen: Control in _screen_stack:
		screen.visible = false
	_screen_stack.clear()
```

### Main Menu

```gdscript
## main_menu.gd
extends Control

@onready var play_button: Button = $VBoxContainer/PlayButton
@onready var settings_button: Button = $VBoxContainer/SettingsButton
@onready var quit_button: Button = $VBoxContainer/QuitButton
@onready var version_label: Label = $VersionLabel

func _ready() -> void:
	play_button.pressed.connect(_on_play)
	settings_button.pressed.connect(_on_settings)
	quit_button.pressed.connect(_on_quit)
	version_label.text = "v" + ProjectSettings.get_setting("application/config/version", "0.1.0")
	
	# Grab focus for gamepad/keyboard navigation
	play_button.grab_focus()

func _on_play() -> void:
	get_tree().change_scene_to_file("res://scenes/game.tscn")

func _on_settings() -> void:
	# Push settings screen onto the stack
	get_parent().push("Settings")

func _on_quit() -> void:
	get_tree().quit()
```

### Pause Menu

```gdscript
## pause_menu.gd — Overlay pause screen with resume/settings/quit
extends CanvasLayer

@onready var panel: PanelContainer = $Panel
@onready var resume_button: Button = $Panel/VBox/ResumeButton
@onready var settings_button: Button = $Panel/VBox/SettingsButton
@onready var main_menu_button: Button = $Panel/VBox/MainMenuButton

var is_paused: bool = false

func _ready() -> void:
	visible = false
	process_mode = Node.PROCESS_MODE_ALWAYS  # Runs even when tree is paused
	resume_button.pressed.connect(_on_resume)
	settings_button.pressed.connect(_on_settings)
	main_menu_button.pressed.connect(_on_main_menu)

func _unhandled_input(event: InputEvent) -> void:
	if event.is_action_pressed("pause"):
		toggle_pause()
		get_viewport().set_input_as_handled()

func toggle_pause() -> void:
	is_paused = not is_paused
	get_tree().paused = is_paused
	visible = is_paused
	if is_paused:
		resume_button.grab_focus()

func _on_resume() -> void:
	toggle_pause()

func _on_settings() -> void:
	# Open settings (also PROCESS_MODE_ALWAYS)
	pass

func _on_main_menu() -> void:
	get_tree().paused = false
	get_tree().change_scene_to_file("res://scenes/main_menu.tscn")
```

### Settings Screen

```gdscript
## settings_screen.gd — Audio, video, and controls settings
extends Control

@onready var master_slider: HSlider = $Tabs/Audio/MasterSlider
@onready var music_slider: HSlider = $Tabs/Audio/MusicSlider
@onready var sfx_slider: HSlider = $Tabs/Audio/SFXSlider
@onready var fullscreen_check: CheckBox = $Tabs/Video/FullscreenCheck
@onready var vsync_check: CheckBox = $Tabs/Video/VSyncCheck
@onready var resolution_option: OptionButton = $Tabs/Video/ResolutionOption
@onready var back_button: Button = $BackButton

const RESOLUTIONS: Array[Vector2i] = [
	Vector2i(1280, 720),
	Vector2i(1920, 1080),
	Vector2i(2560, 1440),
	Vector2i(3840, 2160),
]

const SETTINGS_PATH: String = "user://settings.cfg"
var config: ConfigFile = ConfigFile.new()

func _ready() -> void:
	_populate_resolutions()
	_load_settings()
	_connect_signals()
	back_button.pressed.connect(_on_back)

func _populate_resolutions() -> void:
	resolution_option.clear()
	for res: Vector2i in RESOLUTIONS:
		resolution_option.add_item("%dx%d" % [res.x, res.y])

func _connect_signals() -> void:
	master_slider.value_changed.connect(_on_master_volume)
	music_slider.value_changed.connect(_on_music_volume)
	sfx_slider.value_changed.connect(_on_sfx_volume)
	fullscreen_check.toggled.connect(_on_fullscreen)
	vsync_check.toggled.connect(_on_vsync)
	resolution_option.item_selected.connect(_on_resolution)

func _on_master_volume(value: float) -> void:
	var bus_idx: int = AudioServer.get_bus_index("Master")
	AudioServer.set_bus_volume_db(bus_idx, linear_to_db(value))
	AudioServer.set_bus_mute(bus_idx, value < 0.01)
	_save_settings()

func _on_music_volume(value: float) -> void:
	var bus_idx: int = AudioServer.get_bus_index("Music")
	AudioServer.set_bus_volume_db(bus_idx, linear_to_db(value))
	_save_settings()

func _on_sfx_volume(value: float) -> void:
	var bus_idx: int = AudioServer.get_bus_index("SFX")
	AudioServer.set_bus_volume_db(bus_idx, linear_to_db(value))
	_save_settings()

func _on_fullscreen(enabled: bool) -> void:
	if enabled:
		DisplayServer.window_set_mode(DisplayServer.WINDOW_MODE_FULLSCREEN)
	else:
		DisplayServer.window_set_mode(DisplayServer.WINDOW_MODE_WINDOWED)
	_save_settings()

func _on_vsync(enabled: bool) -> void:
	if enabled:
		DisplayServer.window_set_vsync_mode(DisplayServer.VSYNC_ENABLED)
	else:
		DisplayServer.window_set_vsync_mode(DisplayServer.VSYNC_DISABLED)
	_save_settings()

func _on_resolution(index: int) -> void:
	var res: Vector2i = RESOLUTIONS[index]
	DisplayServer.window_set_size(res)
	_center_window()
	_save_settings()

func _center_window() -> void:
	var screen_size: Vector2i = DisplayServer.screen_get_size()
	var window_size: Vector2i = DisplayServer.window_get_size()
	DisplayServer.window_set_position((screen_size - window_size) / 2)

func _save_settings() -> void:
	config.set_value("audio", "master", master_slider.value)
	config.set_value("audio", "music", music_slider.value)
	config.set_value("audio", "sfx", sfx_slider.value)
	config.set_value("video", "fullscreen", fullscreen_check.button_pressed)
	config.set_value("video", "vsync", vsync_check.button_pressed)
	config.set_value("video", "resolution", resolution_option.selected)
	config.save(SETTINGS_PATH)

func _load_settings() -> void:
	if config.load(SETTINGS_PATH) != OK:
		return  # First launch — use defaults
	master_slider.value = config.get_value("audio", "master", 0.8)
	music_slider.value = config.get_value("audio", "music", 0.7)
	sfx_slider.value = config.get_value("audio", "sfx", 0.8)
	fullscreen_check.button_pressed = config.get_value("video", "fullscreen", false)
	vsync_check.button_pressed = config.get_value("video", "vsync", true)
	resolution_option.selected = config.get_value("video", "resolution", 1)
	# Apply loaded settings
	_on_master_volume(master_slider.value)
	_on_music_volume(music_slider.value)
	_on_sfx_volume(sfx_slider.value)
	_on_fullscreen(fullscreen_check.button_pressed)
	_on_vsync(vsync_check.button_pressed)

func _on_back() -> void:
	get_parent().pop()
```

---

## Inventory UI — Slot-Based Grid

### Inventory Data (Separate from UI)

```gdscript
## item_data.gd — Resource-based item definition
class_name ItemData
extends Resource

@export var id: StringName
@export var display_name: String
@export var icon: Texture2D
@export var description: String
@export var max_stack: int = 1
@export var rarity: Rarity = Rarity.COMMON

enum Rarity { COMMON, UNCOMMON, RARE, EPIC, LEGENDARY }

## inventory.gd — Pure data, no UI
class_name Inventory
extends RefCounted

signal slot_changed(index: int)
signal item_added(item: ItemData, index: int)
signal item_removed(item: ItemData, index: int)

var slots: Array[Dictionary] = []  # { "item": ItemData, "count": int } or {}
var size: int

func _init(inventory_size: int = 20) -> void:
	size = inventory_size
	slots.resize(size)
	for i: int in range(size):
		slots[i] = {}

func add_item(item: ItemData, count: int = 1) -> int:
	## Returns remaining count that didn't fit
	var remaining: int = count
	
	# First: stack onto existing matching items
	for i: int in range(size):
		if remaining <= 0:
			break
		if slots[i].has("item") and slots[i]["item"].id == item.id:
			var space: int = item.max_stack - slots[i].get("count", 0)
			var to_add: int = mini(remaining, space)
			if to_add > 0:
				slots[i]["count"] = slots[i].get("count", 0) + to_add
				remaining -= to_add
				slot_changed.emit(i)
	
	# Second: fill empty slots
	for i: int in range(size):
		if remaining <= 0:
			break
		if slots[i].is_empty():
			var to_add: int = mini(remaining, item.max_stack)
			slots[i] = { "item": item, "count": to_add }
			remaining -= to_add
			item_added.emit(item, i)
			slot_changed.emit(i)
	
	return remaining

func remove_item_at(index: int, count: int = 1) -> void:
	if index < 0 or index >= size or slots[index].is_empty():
		return
	slots[index]["count"] = slots[index].get("count", 0) - count
	if slots[index]["count"] <= 0:
		var item: ItemData = slots[index]["item"]
		slots[index] = {}
		item_removed.emit(item, index)
	slot_changed.emit(index)

func swap_slots(from: int, to: int) -> void:
	var temp: Dictionary = slots[from]
	slots[from] = slots[to]
	slots[to] = temp
	slot_changed.emit(from)
	slot_changed.emit(to)

func get_slot(index: int) -> Dictionary:
	if index < 0 or index >= size:
		return {}
	return slots[index]
```

### Inventory Slot UI

```gdscript
## inventory_slot_ui.gd — Single slot visual
extends PanelContainer

signal slot_clicked(index: int, button: int)

@onready var icon_rect: TextureRect = $MarginContainer/Icon
@onready var count_label: Label = $CountLabel
@onready var rarity_border: NinePatchRect = $RarityBorder

var slot_index: int = -1

const RARITY_COLORS: Dictionary = {
	ItemData.Rarity.COMMON: Color(0.6, 0.6, 0.6),
	ItemData.Rarity.UNCOMMON: Color(0.3, 0.8, 0.3),
	ItemData.Rarity.RARE: Color(0.3, 0.5, 1.0),
	ItemData.Rarity.EPIC: Color(0.7, 0.3, 0.9),
	ItemData.Rarity.LEGENDARY: Color(1.0, 0.7, 0.1),
}

func update_display(slot_data: Dictionary) -> void:
	if slot_data.is_empty():
		icon_rect.texture = null
		count_label.visible = false
		rarity_border.visible = false
	else:
		var item: ItemData = slot_data["item"]
		var count: int = slot_data.get("count", 1)
		icon_rect.texture = item.icon
		count_label.visible = count > 1
		count_label.text = str(count)
		rarity_border.visible = true
		rarity_border.modulate = RARITY_COLORS.get(item.rarity, Color.WHITE)

func _gui_input(event: InputEvent) -> void:
	if event is InputEventMouseButton and event.pressed:
		slot_clicked.emit(slot_index, event.button_index)
```

### Inventory Grid (Container)

```gdscript
## inventory_ui.gd — Grid of inventory slots with drag-and-drop
extends GridContainer

@export var slot_scene: PackedScene
@export var inventory_size: int = 20

var inventory: Inventory
var slot_uis: Array[Control] = []
var dragging_from: int = -1

func _ready() -> void:
	columns = 5
	inventory = Inventory.new(inventory_size)
	inventory.slot_changed.connect(_on_slot_changed)
	_create_slots()

func _create_slots() -> void:
	for i: int in range(inventory_size):
		var slot_ui: Control = slot_scene.instantiate()
		slot_ui.slot_index = i
		slot_ui.slot_clicked.connect(_on_slot_clicked)
		slot_uis.append(slot_ui)
		add_child(slot_ui)

func _on_slot_changed(index: int) -> void:
	slot_uis[index].update_display(inventory.get_slot(index))

func _on_slot_clicked(index: int, button: int) -> void:
	if button == MOUSE_BUTTON_LEFT:
		if dragging_from == -1:
			# Start drag
			if not inventory.get_slot(index).is_empty():
				dragging_from = index
		else:
			# Drop — swap slots
			inventory.swap_slots(dragging_from, index)
			dragging_from = -1
	elif button == MOUSE_BUTTON_RIGHT:
		# Right-click action (use, equip, etc.)
		_use_item(index)

func _use_item(index: int) -> void:
	var slot_data: Dictionary = inventory.get_slot(index)
	if slot_data.is_empty():
		return
	# Emit signal or call game logic
	pass
```

---

## Dialogue Display

### Typewriter Text Box

```gdscript
## dialogue_box.gd — Typewriter effect with BBCode support
extends PanelContainer

signal dialogue_finished
signal line_finished

@export var chars_per_second: float = 30.0
@export var fast_chars_per_second: float = 90.0
@export var punctuation_pause: float = 0.15

@onready var name_label: Label = $VBox/NameLabel
@onready var text_display: RichTextLabel = $VBox/TextDisplay
@onready var continue_indicator: TextureRect = $ContinueIndicator

var _full_text: String = ""
var _visible_chars: float = 0.0
var _target_chars: int = 0
var _is_fast: bool = false
var _is_complete: bool = false
var _char_delays: Array[float] = []

func show_line(speaker: String, text: String) -> void:
	name_label.text = speaker
	_full_text = text
	text_display.text = text
	text_display.visible_characters = 0
	_visible_chars = 0.0
	_target_chars = text_display.get_total_character_count()
	_is_complete = false
	_is_fast = false
	continue_indicator.visible = false
	_build_char_delays()
	visible = true
	set_process(true)

func _build_char_delays() -> void:
	_char_delays.clear()
	var stripped: String = text_display.get_parsed_text()
	for i: int in range(stripped.length()):
		var c: String = stripped[i]
		if c in ".!?":
			_char_delays.append(punctuation_pause)
		elif c == ",":
			_char_delays.append(punctuation_pause * 0.5)
		else:
			_char_delays.append(0.0)

func _process(delta: float) -> void:
	if _is_complete:
		return
	
	var speed: float = fast_chars_per_second if _is_fast else chars_per_second
	_visible_chars += speed * delta
	
	var char_index: int = int(_visible_chars)
	
	# Apply punctuation pauses
	if char_index < _char_delays.size() and _char_delays[char_index] > 0.0:
		_visible_chars -= speed * _char_delays[char_index] * delta
		char_index = int(_visible_chars)
	
	text_display.visible_characters = mini(char_index, _target_chars)
	
	if text_display.visible_characters >= _target_chars:
		_complete_line()

func _complete_line() -> void:
	_is_complete = true
	text_display.visible_characters = -1  # Show all
	continue_indicator.visible = true
	set_process(false)
	line_finished.emit()

func _unhandled_input(event: InputEvent) -> void:
	if not visible:
		return
	if event.is_action_pressed("ui_accept"):
		if _is_complete:
			dialogue_finished.emit()
		else:
			# Speed up or skip to end
			if _is_fast:
				_complete_line()
			else:
				_is_fast = true
		get_viewport().set_input_as_handled()
```

### Dialogue System (Simple Linear)

```gdscript
## dialogue_runner.gd — Drives dialogue sequences through the dialogue box
extends Node

@export var dialogue_box_path: NodePath

@onready var dialogue_box: PanelContainer = get_node(dialogue_box_path)

var _lines: Array[Dictionary] = []  # [{ "speaker": String, "text": String }]
var _current_index: int = 0
var _active: bool = false

func _ready() -> void:
	dialogue_box.dialogue_finished.connect(_advance)
	dialogue_box.visible = false

func start_dialogue(lines: Array[Dictionary]) -> void:
	_lines = lines
	_current_index = 0
	_active = true
	get_tree().paused = true  # Optional: pause gameplay
	_show_current_line()

func _show_current_line() -> void:
	if _current_index >= _lines.size():
		_end_dialogue()
		return
	var line: Dictionary = _lines[_current_index]
	dialogue_box.show_line(line.get("speaker", ""), line.get("text", ""))

func _advance() -> void:
	_current_index += 1
	_show_current_line()

func _end_dialogue() -> void:
	_active = false
	dialogue_box.visible = false
	get_tree().paused = false

## Usage:
## dialogue_runner.start_dialogue([
##     { "speaker": "Elder", "text": "The forest has been corrupted." },
##     { "speaker": "Elder", "text": "You must find the three crystals to restore balance." },
##     { "speaker": "Player", "text": "I'll do whatever it takes." },
## ])
```

---

## Shop / Vendor UI

```gdscript
## shop_ui.gd — Buy/sell interface with price display
extends Control

signal item_purchased(item: ItemData, price: int)
signal item_sold(item: ItemData, price: int)

@onready var shop_grid: GridContainer = $HSplit/ShopPanel/ScrollContainer/ShopGrid
@onready var player_gold_label: Label = $GoldDisplay/GoldLabel
@onready var item_name: Label = $HSplit/InfoPanel/ItemName
@onready var item_desc: RichTextLabel = $HSplit/InfoPanel/ItemDesc
@onready var item_price: Label = $HSplit/InfoPanel/PriceLabel
@onready var buy_button: Button = $HSplit/InfoPanel/BuyButton

@export var shop_slot_scene: PackedScene

var shop_items: Array[Dictionary] = []  # [{ "item": ItemData, "price": int, "stock": int }]
var player_gold: int = 0
var selected_index: int = -1

func open_shop(items: Array[Dictionary], gold: int) -> void:
	shop_items = items
	player_gold = gold
	_build_shop_list()
	_update_gold_display()
	visible = true
	if shop_grid.get_child_count() > 0:
		shop_grid.get_child(0).grab_focus()

func _build_shop_list() -> void:
	# Clear existing
	for child: Node in shop_grid.get_children():
		child.queue_free()
	
	for i: int in range(shop_items.size()):
		var entry: Dictionary = shop_items[i]
		var slot: Control = shop_slot_scene.instantiate()
		slot.setup(entry["item"], entry["price"], entry.get("stock", -1))
		slot.slot_index = i
		slot.pressed.connect(_on_shop_item_selected.bind(i))
		shop_grid.add_child(slot)

func _on_shop_item_selected(index: int) -> void:
	selected_index = index
	var entry: Dictionary = shop_items[index]
	var item: ItemData = entry["item"]
	item_name.text = item.display_name
	item_desc.text = item.description
	item_price.text = "%d gold" % entry["price"]
	buy_button.disabled = player_gold < entry["price"]

func _on_buy_pressed() -> void:
	if selected_index < 0 or selected_index >= shop_items.size():
		return
	var entry: Dictionary = shop_items[selected_index]
	if player_gold < entry["price"]:
		return
	if entry.get("stock", -1) == 0:
		return
	
	player_gold -= entry["price"]
	if entry.has("stock") and entry["stock"] > 0:
		entry["stock"] -= 1
	
	item_purchased.emit(entry["item"], entry["price"])
	_update_gold_display()
	_on_shop_item_selected(selected_index)  # Refresh info panel

func _update_gold_display() -> void:
	player_gold_label.text = str(player_gold)
```

---

## Tooltips and Popups

### Tooltip on Hover

```gdscript
## tooltip_manager.gd — Global tooltip that follows the mouse
## Register as Autoload.
extends CanvasLayer

@onready var panel: PanelContainer = $Panel
@onready var title_label: Label = $Panel/VBox/Title
@onready var desc_label: RichTextLabel = $Panel/VBox/Description

const OFFSET: Vector2 = Vector2(16.0, 16.0)
const SHOW_DELAY: float = 0.3

var _show_timer: float = 0.0
var _pending: bool = false
var _pending_title: String = ""
var _pending_desc: String = ""

func _ready() -> void:
	panel.visible = false
	set_process(false)

func show_tooltip(title: String, description: String) -> void:
	_pending_title = title
	_pending_desc = description
	_pending = true
	_show_timer = 0.0
	set_process(true)

func hide_tooltip() -> void:
	_pending = false
	panel.visible = false
	set_process(false)

func _process(delta: float) -> void:
	if _pending and not panel.visible:
		_show_timer += delta
		if _show_timer >= SHOW_DELAY:
			title_label.text = _pending_title
			desc_label.text = _pending_desc
			panel.visible = true
			_pending = false
	
	if panel.visible:
		_position_tooltip()

func _position_tooltip() -> void:
	var mouse_pos: Vector2 = get_viewport().get_mouse_position()
	var screen_size: Vector2 = get_viewport().get_visible_rect().size
	var tooltip_size: Vector2 = panel.size
	
	var pos: Vector2 = mouse_pos + OFFSET
	
	# Keep on screen
	if pos.x + tooltip_size.x > screen_size.x:
		pos.x = mouse_pos.x - tooltip_size.x - OFFSET.x
	if pos.y + tooltip_size.y > screen_size.y:
		pos.y = mouse_pos.y - tooltip_size.y - OFFSET.y
	
	panel.global_position = pos
```

### Confirmation Dialog

```gdscript
## confirm_dialog.gd — Reusable yes/no confirmation popup
extends CanvasLayer

signal confirmed
signal cancelled

@onready var panel: PanelContainer = $CenterContainer/Panel
@onready var message_label: Label = $CenterContainer/Panel/VBox/Message
@onready var yes_button: Button = $CenterContainer/Panel/VBox/Buttons/YesButton
@onready var no_button: Button = $CenterContainer/Panel/VBox/Buttons/NoButton

func _ready() -> void:
	visible = false
	process_mode = Node.PROCESS_MODE_ALWAYS
	yes_button.pressed.connect(_on_yes)
	no_button.pressed.connect(_on_no)

func show_confirm(message: String, yes_text: String = "Yes", no_text: String = "No") -> void:
	message_label.text = message
	yes_button.text = yes_text
	no_button.text = no_text
	visible = true
	no_button.grab_focus()  # Default to "No" for safety

func _on_yes() -> void:
	visible = false
	confirmed.emit()

func _on_no() -> void:
	visible = false
	cancelled.emit()

func _unhandled_input(event: InputEvent) -> void:
	if visible and event.is_action_pressed("ui_cancel"):
		_on_no()
		get_viewport().set_input_as_handled()
```

---

## Gamepad & Keyboard UI Navigation

Godot's Control nodes have built-in focus navigation. Making your UI fully navigable without a mouse requires focus setup.

### Focus Architecture

```gdscript
## Focus moves between Controls via:
## - Arrow keys / D-pad (automatic if focus neighbors set)
## - Tab / Shift+Tab (by default)
## - ui_up / ui_down / ui_left / ui_right actions

## Set focus neighbors in code:
func setup_focus_chain(buttons: Array[Control]) -> void:
	for i: int in range(buttons.size()):
		var current: Control = buttons[i]
		var prev: Control = buttons[(i - 1 + buttons.size()) % buttons.size()]
		var next: Control = buttons[(i + 1) % buttons.size()]
		
		current.focus_neighbor_top = prev.get_path()
		current.focus_neighbor_bottom = next.get_path()
		# Wrap horizontally to same node (prevents leaving column)
		current.focus_neighbor_left = current.get_path()
		current.focus_neighbor_right = current.get_path()

## Focus the first element when a screen becomes visible:
func _on_visibility_changed() -> void:
	if visible:
		await get_tree().process_frame  # Wait one frame for layout
		$FirstButton.grab_focus()
```

### Focus Styling

```gdscript
## Theme the focus indicator so players know where they are
func setup_focus_theme(theme: Theme) -> void:
	var focus_style := StyleBoxFlat.new()
	focus_style.draw_center = false
	focus_style.border_color = Color(1.0, 0.85, 0.2, 0.9)  # Gold border
	focus_style.border_width_left = 3
	focus_style.border_width_right = 3
	focus_style.border_width_top = 3
	focus_style.border_width_bottom = 3
	focus_style.corner_radius_top_left = 4
	focus_style.corner_radius_top_right = 4
	focus_style.corner_radius_bottom_left = 4
	focus_style.corner_radius_bottom_right = 4
	
	# Apply to all focusable control types
	theme.set_stylebox("focus", "Button", focus_style)
	theme.set_stylebox("focus", "LineEdit", focus_style)
	theme.set_stylebox("focus", "TextEdit", focus_style)
	theme.set_stylebox("focus", "OptionButton", focus_style)
	theme.set_stylebox("focus", "CheckBox", focus_style)
	theme.set_stylebox("focus", "HSlider", focus_style)
```

### Input Method Switching

```gdscript
## input_icon_manager.gd — Switch between keyboard and gamepad icons
## Register as Autoload.
extends Node

signal input_method_changed(method: InputMethod)

enum InputMethod { KEYBOARD, GAMEPAD }

var current_method: InputMethod = InputMethod.KEYBOARD

## Icon mappings
var keyboard_icons: Dictionary = {
	"ui_accept": "res://ui/icons/key_enter.png",
	"ui_cancel": "res://ui/icons/key_esc.png",
	"attack": "res://ui/icons/key_z.png",
	"jump": "res://ui/icons/key_space.png",
}

var gamepad_icons: Dictionary = {
	"ui_accept": "res://ui/icons/btn_a.png",
	"ui_cancel": "res://ui/icons/btn_b.png",
	"attack": "res://ui/icons/btn_x.png",
	"jump": "res://ui/icons/btn_a.png",
}

func _input(event: InputEvent) -> void:
	var new_method: InputMethod = current_method
	if event is InputEventKey or event is InputEventMouseButton or event is InputEventMouseMotion:
		new_method = InputMethod.KEYBOARD
	elif event is InputEventJoypadButton or event is InputEventJoypadMotion:
		if event is InputEventJoypadMotion and absf(event.axis_value) < 0.3:
			return  # Ignore small stick drift
		new_method = InputMethod.GAMEPAD
	
	if new_method != current_method:
		current_method = new_method
		input_method_changed.emit(current_method)

func get_icon(action: String) -> Texture2D:
	var icons: Dictionary = gamepad_icons if current_method == InputMethod.GAMEPAD else keyboard_icons
	var path: String = icons.get(action, "")
	if path.is_empty():
		return null
	return load(path)
```

---

## Screen Transitions

### Fade Transition (Reusable)

```gdscript
## screen_transition.gd — Global fade-to-black transition
## Register as Autoload. Attach a ColorRect child that covers the full viewport.
extends CanvasLayer

@onready var fade_rect: ColorRect = $FadeRect

var _transitioning: bool = false

func _ready() -> void:
	layer = 100  # Above everything
	fade_rect.color = Color(0.0, 0.0, 0.0, 0.0)
	fade_rect.mouse_filter = Control.MOUSE_FILTER_IGNORE

func transition_to_scene(scene_path: String, duration: float = 0.5) -> void:
	if _transitioning:
		return
	_transitioning = true
	fade_rect.mouse_filter = Control.MOUSE_FILTER_STOP  # Block input during transition
	
	# Fade out
	var tween: Tween = create_tween()
	tween.tween_property(fade_rect, "color:a", 1.0, duration * 0.5)
	await tween.finished
	
	# Change scene
	get_tree().change_scene_to_file(scene_path)
	await get_tree().process_frame  # One frame for new scene to load
	
	# Fade in
	tween = create_tween()
	tween.tween_property(fade_rect, "color:a", 0.0, duration * 0.5)
	await tween.finished
	
	fade_rect.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_transitioning = false

## Usage from anywhere:
## ScreenTransition.transition_to_scene("res://scenes/level_2.tscn")
```

---

## Resolution Scaling & Multi-Resolution Support

### Project Settings for Pixel Art Games

```gdscript
## Set in Project Settings → Display → Window:
## - Viewport Width: 320 (your pixel art resolution)
## - Viewport Height: 180
## - Window Width Override: 1280 (display window size)
## - Window Height Override: 720
## - Stretch → Mode: "viewport" (pixel-perfect scaling)
## - Stretch → Aspect: "keep" (letterbox to preserve ratio)

## For HD/Vector games:
## - Stretch → Mode: "canvas_items" (UI scales with window)
## - Stretch → Aspect: "expand" (fill available space)
```

### Safe Area for Mobile / Ultrawide

```gdscript
## safe_area.gd — Keep HUD within safe margins
extends MarginContainer

func _ready() -> void:
	set_anchors_preset(Control.PRESET_FULL_RECT)
	_update_safe_margins()
	get_viewport().size_changed.connect(_update_safe_margins)

func _update_safe_margins() -> void:
	var safe_area: Rect2i = DisplayServer.get_display_safe_area()
	var screen_size: Vector2i = DisplayServer.screen_get_size()
	
	if safe_area.size == Vector2i.ZERO:
		# No safe area info — use default margins
		add_theme_constant_override("margin_left", 16)
		add_theme_constant_override("margin_right", 16)
		add_theme_constant_override("margin_top", 16)
		add_theme_constant_override("margin_bottom", 16)
		return
	
	add_theme_constant_override("margin_left", safe_area.position.x)
	add_theme_constant_override("margin_right", screen_size.x - safe_area.end.x)
	add_theme_constant_override("margin_top", safe_area.position.y)
	add_theme_constant_override("margin_bottom", screen_size.y - safe_area.end.y)
```

---

## RichTextLabel — Formatted Text Display

RichTextLabel supports BBCode for styled text. Essential for dialogue, item descriptions, tutorials, and damage logs.

```gdscript
## Common BBCode tags:
## [b]bold[/b]  [i]italic[/i]  [u]underline[/u]
## [color=red]colored text[/color]
## [font_size=24]large text[/font_size]
## [wave amp=20 freq=3]wavy text[/wave]
## [shake rate=10 level=5]shaking text[/shake]
## [rainbow freq=0.5 sat=0.8 val=0.8]rainbow[/rainbow]
## [img]res://icon.png[/img]
## [url=https://example.com]clickable link[/url]

## Item description with rarity coloring
func format_item_description(item: ItemData) -> String:
	var rarity_color: String = _rarity_to_color(item.rarity)
	var text: String = "[b][color=%s]%s[/color][/b]\n" % [rarity_color, item.display_name]
	text += "[i]%s[/i]\n\n" % _rarity_name(item.rarity)
	text += item.description
	return text

func _rarity_to_color(rarity: ItemData.Rarity) -> String:
	match rarity:
		ItemData.Rarity.COMMON: return "#999999"
		ItemData.Rarity.UNCOMMON: return "#4cbb4c"
		ItemData.Rarity.RARE: return "#4c7eff"
		ItemData.Rarity.EPIC: return "#b34cdd"
		ItemData.Rarity.LEGENDARY: return "#ffb31a"
		_: return "#ffffff"

func _rarity_name(rarity: ItemData.Rarity) -> String:
	match rarity:
		ItemData.Rarity.COMMON: return "Common"
		ItemData.Rarity.UNCOMMON: return "Uncommon"
		ItemData.Rarity.RARE: return "Rare"
		ItemData.Rarity.EPIC: return "Epic"
		ItemData.Rarity.LEGENDARY: return "Legendary"
		_: return "Unknown"
```

---

## Notification / Toast System

```gdscript
## notification_manager.gd — Toast notifications that stack and auto-dismiss
## Register as Autoload. Attach a VBoxContainer child at the top of the viewport.
extends CanvasLayer

@onready var container: VBoxContainer = $NotificationContainer

@export var notification_scene: PackedScene
@export var display_duration: float = 3.0
@export var max_visible: int = 5

func show_notification(message: String, icon: Texture2D = null, color: Color = Color.WHITE) -> void:
	# Remove oldest if at max
	while container.get_child_count() >= max_visible:
		var oldest: Control = container.get_child(0)
		oldest.queue_free()
	
	var notif: Control = notification_scene.instantiate()
	container.add_child(notif)
	notif.setup(message, icon, color)
	
	# Slide in
	notif.modulate.a = 0.0
	notif.position.x = 300.0
	var tween: Tween = create_tween().set_parallel(true)
	tween.tween_property(notif, "modulate:a", 1.0, 0.2)
	tween.tween_property(notif, "position:x", 0.0, 0.3).set_ease(Tween.EASE_OUT).set_trans(Tween.TRANS_BACK)
	
	# Auto dismiss
	await get_tree().create_timer(display_duration).timeout
	if is_instance_valid(notif):
		var fade: Tween = create_tween()
		fade.tween_property(notif, "modulate:a", 0.0, 0.3)
		await fade.finished
		if is_instance_valid(notif):
			notif.queue_free()

## Usage:
## NotificationManager.show_notification("Quest Complete!", quest_icon, Color.GOLD)
## NotificationManager.show_notification("New item acquired: Iron Sword")
```

---

## Common Mistakes

### 1. Using CanvasLayer for Everything

```gdscript
# WRONG — every UI panel on its own CanvasLayer
# This creates z-order chaos and complicates input handling

# RIGHT — one CanvasLayer for the entire HUD, one for popups
# Use Control node ordering (bottom = drawn last = on top) for layering
# CanvasLayer is for UI that must render above ALL game content (HUD, menus)
```

### 2. Not Handling Focus for Gamepad

```gdscript
# WRONG — relying on mouse-only interaction
button.pressed.connect(_on_button)

# RIGHT — grab focus when screen opens, set focus neighbors
func _on_visibility_changed() -> void:
	if visible:
		await get_tree().process_frame
		first_button.grab_focus()
```

### 3. Scaling CollisionShapes with UI

```gdscript
# WRONG — using Control.scale on a parent that contains physics bodies
$UIRoot.scale = Vector2(2.0, 2.0)  # Breaks CollisionShape2D children

# RIGHT — UI sizing uses anchors, margins, and containers
# NEVER scale collision shapes indirectly via parent transforms
# Use the size property on Controls, not scale
```

### 4. Hardcoding Screen Positions

```gdscript
# WRONG — pixel positions that break at different resolutions
health_bar.position = Vector2(20, 20)

# RIGHT — anchors + offsets
health_bar.set_anchors_preset(Control.PRESET_TOP_LEFT)
health_bar.offset_left = 20.0
health_bar.offset_top = 20.0
```

### 5. Rebuilding UI Every Frame

```gdscript
# WRONG — clearing and rebuilding inventory grid every frame in _process
func _process(_delta: float) -> void:
	_rebuild_inventory()  # Allocates 20 nodes per frame

# RIGHT — create once, update only changed slots via signals
inventory.slot_changed.connect(_on_slot_changed)

func _on_slot_changed(index: int) -> void:
	slot_uis[index].update_display(inventory.get_slot(index))
```

### 6. Blocking Input Behind UI Panels

```gdscript
# WRONG — UI panel is visible but clicks go through to the game
# The panel's mouse_filter is MOUSE_FILTER_IGNORE

# RIGHT — set mouse_filter on container panels
panel.mouse_filter = Control.MOUSE_FILTER_STOP  # Blocks clicks from passing through

# For non-interactive backgrounds that should still block:
background.mouse_filter = Control.MOUSE_FILTER_STOP
# For decorative elements that shouldn't block:
decoration.mouse_filter = Control.MOUSE_FILTER_IGNORE
```

### 7. Mixing Pixel Sizes Across Resolutions

```gdscript
# WRONG — font size 16px looks fine at 1080p, tiny at 4K
label.add_theme_font_size_override("font_size", 16)

# RIGHT — use the theme system with stretch mode "canvas_items"
# All font sizes, margins, and spacing scale automatically
# OR for pixel art: use "viewport" stretch mode where everything scales uniformly
```

---

## Performance

- **Minimize `visible_characters` updates** — RichTextLabel typewriter effect should only change `visible_characters` once per character, not every frame.
- **Use `set_process(false)`** on UI elements that don't need per-frame updates. Enable only when animating (counters, cooldowns, damage previews).
- **Share themes** — one Theme resource on a root Control is cheaper than per-node overrides scattered everywhere.
- **Pool damage numbers** if spawning many per frame. For small quantities (<10/sec), `instantiate()` + `queue_free()` is fine.
- **Avoid deep nesting** — Control layout recalculates down the tree when any size changes. Flatten container hierarchies where possible (3-4 levels max).
- **Hide off-screen UI** with `visible = false`, not `modulate.a = 0`. Hidden nodes skip layout and rendering entirely.
- **Use `mouse_filter = MOUSE_FILTER_IGNORE`** on non-interactive controls (Labels, TextureRects that are purely decorative). Reduces input event propagation.
- **Batch theme changes** — multiple `add_theme_*_override` calls trigger multiple layout passes. Set the Theme resource once instead.

---

## Tuning Reference

### Font Sizes by Game Type

| Game Type | Base Size | Header | Small/Sub |
|-----------|-----------|--------|-----------|
| Pixel art (320×180) | 8px | 12px | 6px |
| Pixel art (640×360) | 16px | 24px | 12px |
| HD 2D (1920×1080) | 18px | 28px | 14px |
| Mobile (touch) | 22px+ | 32px+ | 16px+ |

### Minimum Touch Target Sizes

| Platform | Minimum Size | Recommended |
|----------|-------------|-------------|
| Mobile (phone) | 44×44 px | 48×48 px |
| Mobile (tablet) | 40×40 px | 44×44 px |
| Desktop (mouse) | 24×24 px | 32×32 px |
| Console (gamepad focus) | N/A | Visible focus indicator |

### Animation Timing Guide

| UI Animation | Duration | Easing |
|--------------|----------|--------|
| Fade in/out | 0.15–0.3s | EASE_IN_OUT |
| Slide panel | 0.2–0.4s | EASE_OUT / TRANS_BACK |
| Button press | 0.05–0.1s | EASE_OUT |
| Tooltip appear | 0.3s delay + 0.15s fade | EASE_IN |
| Notification slide | 0.2–0.3s | EASE_OUT / TRANS_BACK |
| Screen transition | 0.3–0.6s total | LINEAR |
| Health bar drain | 0.3–0.5s | EASE_OUT |
| Counter tick | varies by delta | LINEAR (move_toward) |

### Container Choice Guide

| Need | Container | Notes |
|------|-----------|-------|
| Horizontal row of buttons | `HBoxContainer` | Set separation via theme constant |
| Vertical menu list | `VBoxContainer` | Use `SIZE_EXPAND_FILL` for equal sizing |
| Grid of items/icons | `GridContainer` | Set `columns` property |
| Scrollable list | `ScrollContainer` > `VBoxContainer` | ScrollContainer must have fixed size |
| Centered popup | `CenterContainer` | Or `MarginContainer` with equal margins |
| Panel with padding | `PanelContainer` | Content margin via StyleBox |
| Wrapping buttons | `HFlowContainer` | Auto-wraps children to next row |
| Aspect-locked video | `AspectRatioContainer` | Maintains child aspect ratio |

---

## Related Guides

- [G1 Scene Composition](./G1_scene_composition.md) — Component scene architecture that UI scenes follow
- [G3 Signal Architecture](./G3_signal_architecture.md) — Signal bus for decoupling UI from game state
- [G4 Input Handling](./G4_input_handling.md) — Rebindable controls, gamepad detection, input buffering
- [G8 Animation Systems](./G8_animation_systems.md) — Tween patterns used throughout UI animation
- [UI Theory](../../core/concepts/ui-theory.md) — Engine-agnostic UI architecture, layout models, accessibility
- [E1 Architecture Overview](../architecture/E1_architecture_overview.md) — Autoloads, scene management patterns
