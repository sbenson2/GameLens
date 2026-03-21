# G4 — Input Handling
> **Category:** Guide · **Engine:** Godot 4.4+ · **Language:** GDScript  
> **Related:** [G1 Scene Composition](./G1_scene_composition.md) · [G2 State Machine](./G2_state_machine.md) · [G3 Signal Architecture](./G3_signal_architecture.md) · [godot-rules.md](../godot-rules.md)

---

## What This Guide Covers

Input handling is the bridge between player intent and game behavior. This guide covers Godot's InputMap action system, polling vs event-driven input, movement patterns for CharacterBody2D, input buffering for tight platformers, rebindable controls, gamepad/touch support, local multiplayer device splitting, combo/sequence detection, and input recording for replays and tutorials.

If you're coming from Unity: `Input.GetAxis` → `Input.get_axis()`, `Input.GetButtonDown` → `Input.is_action_just_pressed()`, InputActions → InputMap actions.

If you're coming from MonoGame: You probably poll `Keyboard.GetState()` every frame. Godot supports that style but strongly prefers action-based input through InputMap — it abstracts devices and enables rebinding for free.

---

## Architecture Decision: Polling vs Events

Godot offers two input approaches. Use both — they solve different problems.

### Polling (`_physics_process` / `_process`)

Read input state every frame. Best for **continuous** actions: movement, aiming, holding.

```gdscript
func _physics_process(_delta: float) -> void:
    var direction: float = Input.get_axis("move_left", "move_right")
    velocity.x = direction * speed
    move_and_slide()
```

### Events (`_input` / `_unhandled_input`)

React to input changes. Best for **discrete** actions: jump, attack, pause, interact.

```gdscript
func _unhandled_input(event: InputEvent) -> void:
    if event.is_action_pressed("jump"):
        _jump()
        get_viewport().set_input_as_handled()
```

### When to Use Which

| Pattern | Use For | Why |
|---------|---------|-----|
| `_physics_process` polling | Movement, steering, aiming | Needs to run every physics tick for smooth results |
| `_process` polling | Camera follow, UI cursor | Runs every render frame, decoupled from physics |
| `_unhandled_input` | Jump, attack, interact, pause | Fires once per press, respects UI consumption |
| `_input` | UI shortcuts, debug keys | Fires before `_unhandled_input`, even if UI has focus |

### The Input Pipeline

Understanding the order matters for UI + gameplay coexistence:

```
InputEvent arrives
    ↓
1. _input()              ← All nodes, tree order (top → bottom)
    ↓
2. Control / GUI nodes   ← Buttons, sliders, text fields consume events
    ↓
3. _unhandled_input()    ← Only if GUI didn't consume it
    ↓
4. _unhandled_key_input() ← Only InputEventKey that survived
```

**Rule:** Use `_unhandled_input` for gameplay so menus automatically block game actions when open. Use `_input` only for global shortcuts (screenshot, debug overlay) that should work regardless of UI state.

---

## InputMap Actions

### Defining Actions in Code

Project Settings → Input Map is the visual editor, but you can define actions in code for addons or dynamic controls:

```gdscript
## Registers input actions programmatically.
## Call once at startup (e.g., in an autoload's _ready).
static func register_actions() -> void:
    # Create action if it doesn't exist
    if not InputMap.has_action("move_left"):
        InputMap.add_action("move_left")
        
        # Keyboard: A key
        var key_event := InputEventKey.new()
        key_event.physical_keycode = KEY_A
        InputMap.action_add_event("move_left", key_event)
        
        # Gamepad: Left stick negative X
        var joy_event := InputEventJoypadMotion.new()
        joy_event.axis = JOY_AXIS_LEFT_X
        joy_event.axis_value = -1.0
        InputMap.action_add_event("move_left", joy_event)
        
        # D-pad left
        var dpad_event := InputEventJoypadButton.new()
        dpad_event.button_index = JOY_BUTTON_DPAD_LEFT
        InputMap.action_add_event("move_left", dpad_event)
```

### Standard Action Naming Convention

Use consistent names across projects. This is the recommended convention:

```
# Movement
move_left, move_right, move_up, move_down
move_jump, move_dash, move_crouch

# Combat
attack_primary, attack_secondary, attack_special
aim, block, dodge

# Interaction
interact, interact_alt
inventory_toggle, map_toggle, pause

# UI (built-in actions — don't rename)
ui_accept, ui_cancel, ui_left, ui_right, ui_up, ui_down
ui_focus_next, ui_focus_prev, ui_page_up, ui_page_down
```

### Deadzone Configuration

Analog sticks drift. Set deadzones per-action:

```gdscript
# In Project Settings → Input Map → action properties
# Or in code:
InputMap.action_set_deadzone("move_left", 0.2)
InputMap.action_set_deadzone("move_right", 0.2)
```

| Deadzone | Feel | Use For |
|----------|------|---------|
| 0.1 | Very sensitive | Twin-stick shooters, precision aiming |
| 0.2 | Standard | Most games (Godot default) |
| 0.3 | Forgiving | Platformers, casual games |
| 0.5+ | Very loose | Accessibility, worn controllers |

---

## Movement Patterns

### Basic 2D Platformer Movement

The foundation pattern. Handles horizontal movement with acceleration/deceleration and gravity:

```gdscript
class_name PlatformerController
extends CharacterBody2D

## Horizontal movement speed in pixels/sec.
@export var move_speed: float = 300.0
## How quickly the player reaches max speed (higher = snappier).
@export var acceleration: float = 2000.0
## How quickly the player stops (higher = less slidey).
@export var friction: float = 2500.0
## Upward velocity applied on jump.
@export var jump_velocity: float = -450.0
## Downward acceleration in pixels/sec².
@export var gravity_scale: float = 1.0

## Cached project gravity for consistency with RigidBody2D objects.
var _gravity: float = ProjectSettings.get_setting("physics/2d/default_gravity")


func _physics_process(delta: float) -> void:
    _apply_gravity(delta)
    _handle_movement(delta)
    _handle_jump()
    move_and_slide()


func _apply_gravity(delta: float) -> void:
    if not is_on_floor():
        velocity.y += _gravity * gravity_scale * delta


func _handle_movement(delta: float) -> void:
    var direction: float = Input.get_axis("move_left", "move_right")
    
    if direction != 0.0:
        # Accelerate toward target speed
        velocity.x = move_toward(velocity.x, direction * move_speed, acceleration * delta)
    else:
        # Apply friction when no input
        velocity.x = move_toward(velocity.x, 0.0, friction * delta)


func _handle_jump() -> void:
    if Input.is_action_just_pressed("move_jump") and is_on_floor():
        velocity.y = jump_velocity
```

### Variable Jump Height

Hold jump for higher jumps. Release early for short hops. Critical for platformer feel:

```gdscript
## Gravity multiplier when falling (heavier descent feels better).
@export var fall_gravity_multiplier: float = 1.8
## Gravity multiplier when ascending with jump released (cuts jump short).
@export var short_jump_gravity_multiplier: float = 3.5


func _apply_gravity(delta: float) -> void:
    if is_on_floor():
        return
    
    var multiplier: float = 1.0
    
    if velocity.y > 0.0:
        # Falling — heavier gravity for snappy descent
        multiplier = fall_gravity_multiplier
    elif not Input.is_action_pressed("move_jump"):
        # Ascending but jump released — cut the jump short
        multiplier = short_jump_gravity_multiplier
    
    velocity.y += _gravity * gravity_scale * multiplier * delta
```

### Coyote Time + Jump Buffering

Two mechanics that make jumps feel generous:

```gdscript
## Grace period after leaving a ledge where jump still works (seconds).
@export var coyote_time: float = 0.1
## How early before landing a jump press is remembered (seconds).
@export var jump_buffer_time: float = 0.12

var _coyote_timer: float = 0.0
var _jump_buffer_timer: float = 0.0
var _was_on_floor: bool = false


func _physics_process(delta: float) -> void:
    _update_coyote_time(delta)
    _update_jump_buffer(delta)
    _apply_gravity(delta)
    _handle_movement(delta)
    _handle_jump()
    move_and_slide()
    _was_on_floor = is_on_floor()


func _update_coyote_time(delta: float) -> void:
    if is_on_floor():
        _coyote_timer = coyote_time
    else:
        _coyote_timer -= delta


func _update_jump_buffer(delta: float) -> void:
    if Input.is_action_just_pressed("move_jump"):
        _jump_buffer_timer = jump_buffer_time
    else:
        _jump_buffer_timer -= delta


func _handle_jump() -> void:
    var can_jump: bool = is_on_floor() or _coyote_timer > 0.0
    var wants_jump: bool = Input.is_action_just_pressed("move_jump") or _jump_buffer_timer > 0.0
    
    if wants_jump and can_jump:
        velocity.y = jump_velocity
        _coyote_timer = 0.0     # Consume coyote time
        _jump_buffer_timer = 0.0 # Consume buffer
        _was_on_floor = false
```

### Top-Down 8-Direction Movement

For RPGs, twin-stick shooters, and top-down games:

```gdscript
class_name TopDownController
extends CharacterBody2D

@export var move_speed: float = 200.0
@export var acceleration: float = 1500.0
@export var friction: float = 2000.0


func _physics_process(delta: float) -> void:
    var input_dir := Vector2(
        Input.get_axis("move_left", "move_right"),
        Input.get_axis("move_up", "move_down")
    )
    
    # Normalize to prevent diagonal speed boost
    if input_dir.length() > 1.0:
        input_dir = input_dir.normalized()
    
    if input_dir != Vector2.ZERO:
        velocity = velocity.move_toward(input_dir * move_speed, acceleration * delta)
    else:
        velocity = velocity.move_toward(Vector2.ZERO, friction * delta)
    
    move_and_slide()
```

### 4-Direction Grid Movement

For puzzle games, classic RPGs, or grid-based dungeon crawlers:

```gdscript
class_name GridController
extends CharacterBody2D

## Size of one grid cell in pixels.
@export var cell_size: int = 16
## Movement speed in pixels/sec.
@export var move_speed: float = 100.0

## True while the character is moving between cells.
var is_moving: bool = false
## Grid position in cell coordinates.
var grid_position: Vector2i = Vector2i.ZERO
## World-space target position.
var _target_position: Vector2 = Vector2.ZERO

signal move_started(direction: Vector2i)
signal move_finished(grid_pos: Vector2i)


func _ready() -> void:
    # Snap to grid on spawn
    grid_position = Vector2i(
        roundi(position.x / cell_size),
        roundi(position.y / cell_size)
    )
    position = Vector2(grid_position) * cell_size
    _target_position = position


func _physics_process(delta: float) -> void:
    if is_moving:
        _process_move(delta)
    else:
        _check_input()


func _check_input() -> void:
    var dir := Vector2i.ZERO
    
    # Priority: last pressed direction wins
    if Input.is_action_pressed("move_right"):
        dir = Vector2i.RIGHT
    elif Input.is_action_pressed("move_left"):
        dir = Vector2i.LEFT
    elif Input.is_action_pressed("move_down"):
        dir = Vector2i.DOWN
    elif Input.is_action_pressed("move_up"):
        dir = Vector2i.UP
    
    if dir != Vector2i.ZERO:
        var next_cell: Vector2i = grid_position + dir
        if _can_move_to(next_cell):
            grid_position = next_cell
            _target_position = Vector2(grid_position) * cell_size
            is_moving = true
            move_started.emit(dir)


func _process_move(delta: float) -> void:
    position = position.move_toward(_target_position, move_speed * delta)
    if position.is_equal_approx(_target_position):
        position = _target_position
        is_moving = false
        move_finished.emit(grid_position)


func _can_move_to(cell: Vector2i) -> bool:
    # Override or connect to your tilemap/collision system
    # Example: raycast in the target direction
    var ray := RayCast2D.new()
    ray.target_position = Vector2(cell - grid_position) * cell_size
    add_child(ray)
    ray.force_raycast_update()
    var blocked: bool = ray.is_colliding()
    ray.queue_free()
    return not blocked
```

---

## Input Buffering (Advanced)

Input buffering remembers recent inputs and replays them when the action becomes possible. Essential for action games where frame-perfect timing feels unfair.

### General-Purpose Input Buffer

```gdscript
class_name InputBuffer
extends Node

## How long buffered inputs remain valid (seconds).
@export var buffer_window: float = 0.15

## Dictionary of action_name → time remaining.
var _buffered_actions: Dictionary = {}  # String → float


func _process(delta: float) -> void:
    var expired: Array[String] = []
    for action: String in _buffered_actions:
        _buffered_actions[action] -= delta
        if _buffered_actions[action] <= 0.0:
            expired.append(action)
    for action: String in expired:
        _buffered_actions.erase(action)


func _unhandled_input(event: InputEvent) -> void:
    # Buffer any action press
    for action: String in ["move_jump", "attack_primary", "dodge", "interact"]:
        if event.is_action_pressed(action):
            _buffered_actions[action] = buffer_window


## Returns true and consumes the buffer if the action was recently pressed.
func consume(action: String) -> bool:
    if _buffered_actions.has(action):
        _buffered_actions.erase(action)
        return true
    return false


## Returns true without consuming (peek).
func is_buffered(action: String) -> bool:
    return _buffered_actions.has(action)


## Clears all buffered inputs. Call on state transitions where old inputs
## should not carry over (e.g., death, cutscene start).
func clear() -> void:
    _buffered_actions.clear()
```

Usage with a state machine:

```gdscript
# In Jump state — check buffer when landing
func _on_landed() -> void:
    if input_buffer.consume("attack_primary"):
        # Player pressed attack while airborne — execute on landing
        transition_to("Attack")
    elif input_buffer.consume("move_jump"):
        # Buffered jump — immediate re-jump
        transition_to("Jump")
    else:
        transition_to("Idle")
```

---

## Rebindable Controls

### Save/Load Key Bindings

```gdscript
class_name InputRemapper
extends Node

## Path to the keybind save file.
const SAVE_PATH: String = "user://keybinds.cfg"

## Actions that can be rebound by the player.
var rebindable_actions: Array[String] = [
    "move_left", "move_right", "move_up", "move_down",
    "move_jump", "move_dash", "move_crouch",
    "attack_primary", "attack_secondary",
    "interact", "inventory_toggle", "pause",
]


## Saves current InputMap bindings to disk.
func save_bindings() -> void:
    var config := ConfigFile.new()
    
    for action: String in rebindable_actions:
        var events: Array[InputEvent] = InputMap.action_get_events(action)
        for i: int in events.size():
            # Store the event as a resource path string
            config.set_value(action, str(i), var_to_str(events[i]))
    
    config.save(SAVE_PATH)


## Loads saved bindings and applies them to InputMap.
func load_bindings() -> void:
    var config := ConfigFile.new()
    if config.load(SAVE_PATH) != OK:
        return  # No saved bindings — use defaults
    
    for action: String in config.get_sections():
        if not InputMap.has_action(action):
            continue
        
        # Remove existing events
        InputMap.action_erase_events(action)
        
        # Restore saved events
        var keys: PackedStringArray = config.get_section_keys(action)
        for key: String in keys:
            var event_str: String = config.get_value(action, key)
            var event: InputEvent = str_to_var(event_str) as InputEvent
            if event:
                InputMap.action_add_event(action, event)


## Starts listening for a new binding for the given action.
## Returns the InputEvent that was pressed.
func wait_for_rebind(action: String, device_filter: int = -1) -> InputEvent:
    # This is called from a UI button — use await
    var event: InputEvent = await _get_next_valid_input(device_filter)
    
    # Replace the binding
    InputMap.action_erase_events(action)
    InputMap.action_add_event(action, event)
    save_bindings()
    
    return event


## Waits for the next valid input event (ignores mouse motion, joystick drift).
func _get_next_valid_input(device_filter: int) -> InputEvent:
    while true:
        var event: InputEvent = await get_viewport().gui_input
        # Fallback: poll via _unhandled_input signal or use a flag
        # For simplicity, this example uses process-based polling
        await get_tree().process_frame
    return null  # unreachable


## Resets a single action to its default binding from ProjectSettings.
func reset_action(action: String) -> void:
    InputMap.action_erase_events(action)
    # Reload from project defaults
    var default_events: Array[InputEvent] = InputMap.action_get_events(action)
    # InputMap.load_from_project_settings() reloads ALL — 
    # for single action reset, cache defaults at startup
    pass


## Resets all actions to project defaults.
func reset_all() -> void:
    InputMap.load_from_project_settings()
    # Delete saved file
    if FileAccess.file_exists(SAVE_PATH):
        DirAccess.remove_absolute(SAVE_PATH)
```

### Rebind UI Widget

A reusable button that handles the rebind flow:

```gdscript
class_name RebindButton
extends Button

## The input action this button rebinds.
@export var action: String = ""
## Which device to filter for (0 = keyboard, all negative = any).
@export var device_filter: int = -1

var _is_listening: bool = false

@onready var _remapper: InputRemapper = get_node("/root/InputRemapper")


func _ready() -> void:
    _update_label()
    pressed.connect(_start_listening)


func _start_listening() -> void:
    _is_listening = true
    text = "Press a key..."
    # Disable other rebind buttons to prevent conflicts
    get_tree().call_group("rebind_buttons", "_set_listening_lock", true)


func _unhandled_input(event: InputEvent) -> void:
    if not _is_listening:
        return
    
    # Filter: only accept key, mouse button, or joypad button/axis
    if not (event is InputEventKey or event is InputEventMouseButton \
            or event is InputEventJoypadButton or event is InputEventJoypadMotion):
        return
    
    # Ignore releases
    if not event.is_pressed():
        return
    
    # Filter analog stick noise (small motions)
    if event is InputEventJoypadMotion:
        if absf(event.axis_value) < 0.5:
            return
    
    # Apply the rebind
    InputMap.action_erase_events(action)
    InputMap.action_add_event(action, event)
    _remapper.save_bindings()
    
    _is_listening = false
    _update_label()
    get_tree().call_group("rebind_buttons", "_set_listening_lock", false)
    get_viewport().set_input_as_handled()


func _update_label() -> void:
    var events: Array[InputEvent] = InputMap.action_get_events(action)
    if events.is_empty():
        text = "[unbound]"
        return
    text = events[0].as_text()


func _set_listening_lock(locked: bool) -> void:
    if not _is_listening:
        disabled = locked
```

---

## Gamepad Support

### Detecting Controller Connection

```gdscript
class_name GamepadManager
extends Node

## Emitted when the active input device changes.
signal input_device_changed(device: InputDevice)

enum InputDevice { KEYBOARD_MOUSE, GAMEPAD }

var current_device: InputDevice = InputDevice.KEYBOARD_MOUSE
## Maps connected gamepad device IDs to names.
var connected_gamepads: Dictionary = {}  # int → String


func _ready() -> void:
    Input.joy_connection_changed.connect(_on_joy_connection_changed)
    # Register already-connected gamepads
    for id: int in Input.get_connected_joypads():
        connected_gamepads[id] = Input.get_joy_name(id)


func _on_joy_connection_changed(device_id: int, connected: bool) -> void:
    if connected:
        connected_gamepads[device_id] = Input.get_joy_name(device_id)
        print("Gamepad connected: %s (device %d)" % [
            Input.get_joy_name(device_id), device_id
        ])
    else:
        connected_gamepads.erase(device_id)
        print("Gamepad disconnected: device %d" % device_id)
        # If no gamepads remain, switch to keyboard
        if connected_gamepads.is_empty():
            _set_device(InputDevice.KEYBOARD_MOUSE)


func _input(event: InputEvent) -> void:
    # Auto-detect device switch
    if event is InputEventKey or event is InputEventMouseMotion \
            or event is InputEventMouseButton:
        _set_device(InputDevice.KEYBOARD_MOUSE)
    elif event is InputEventJoypadButton or event is InputEventJoypadMotion:
        if event is InputEventJoypadMotion and absf(event.axis_value) < 0.2:
            return  # Ignore stick drift
        _set_device(InputDevice.GAMEPAD)


func _set_device(device: InputDevice) -> void:
    if current_device != device:
        current_device = device
        input_device_changed.emit(device)
```

### Showing Correct Button Prompts

Swap UI icons based on active device:

```gdscript
class_name ButtonPrompt
extends TextureRect

## Action to display the prompt for.
@export var action: String = "interact"
## Keyboard/mouse icon.
@export var keyboard_icon: Texture2D
## Xbox-style gamepad icon.
@export var gamepad_icon: Texture2D

@onready var _gamepad_mgr: GamepadManager = get_node("/root/GamepadManager")


func _ready() -> void:
    _gamepad_mgr.input_device_changed.connect(_on_device_changed)
    _update_icon()


func _on_device_changed(_device: GamepadManager.InputDevice) -> void:
    _update_icon()


func _update_icon() -> void:
    match _gamepad_mgr.current_device:
        GamepadManager.InputDevice.KEYBOARD_MOUSE:
            texture = keyboard_icon
        GamepadManager.InputDevice.GAMEPAD:
            texture = gamepad_icon
```

### Vibration / Haptic Feedback

```gdscript
## Trigger controller rumble. Weak motor = subtle buzz, strong motor = heavy rumble.
## Duration in seconds. Only works on gamepads that support it.
static func rumble(
    device_id: int = 0,
    weak: float = 0.0,
    strong: float = 0.5,
    duration: float = 0.2
) -> void:
    Input.start_joy_vibration(device_id, weak, strong, duration)


## Predefined rumble patterns for common game events.
static func rumble_light(device_id: int = 0) -> void:
    rumble(device_id, 0.3, 0.0, 0.1)  # Subtle feedback (pickup, menu select)

static func rumble_medium(device_id: int = 0) -> void:
    rumble(device_id, 0.2, 0.5, 0.2)  # Hit landed, explosion nearby

static func rumble_heavy(device_id: int = 0) -> void:
    rumble(device_id, 0.5, 1.0, 0.4)  # Big impact, death, boss attack

static func rumble_continuous(device_id: int = 0, intensity: float = 0.3) -> void:
    rumble(device_id, intensity * 0.5, intensity, 0.0)  # 0 = until stopped

static func rumble_stop(device_id: int = 0) -> void:
    Input.stop_joy_vibration(device_id)
```

---

## Touch Input

### Virtual Joystick

For mobile games — an on-screen analog stick:

```gdscript
class_name VirtualJoystick
extends Control

## Maximum drag distance in pixels from center.
@export var max_radius: float = 64.0
## Deadzone as a fraction of max_radius (0.0–1.0).
@export var deadzone: float = 0.15

## Normalized output direction (-1 to 1 per axis).
var output: Vector2 = Vector2.ZERO

var _is_pressed: bool = false
var _touch_index: int = -1
var _center: Vector2 = Vector2.ZERO

@onready var _knob: TextureRect = $Knob


func _ready() -> void:
    _center = size / 2.0
    _knob.position = _center - _knob.size / 2.0


func _gui_input(event: InputEvent) -> void:
    if event is InputEventScreenTouch:
        var touch: InputEventScreenTouch = event
        if touch.pressed:
            _is_pressed = true
            _touch_index = touch.index
            _update_knob(touch.position)
        elif touch.index == _touch_index:
            _release()
    
    elif event is InputEventScreenDrag:
        var drag: InputEventScreenDrag = event
        if drag.index == _touch_index:
            _update_knob(drag.position)


func _update_knob(touch_pos: Vector2) -> void:
    var local_pos: Vector2 = touch_pos - _center
    var distance: float = local_pos.length()
    
    # Clamp to max radius
    if distance > max_radius:
        local_pos = local_pos.normalized() * max_radius
    
    # Update knob visual
    _knob.position = _center + local_pos - _knob.size / 2.0
    
    # Calculate output with deadzone
    var normalized: Vector2 = local_pos / max_radius
    if normalized.length() < deadzone:
        output = Vector2.ZERO
    else:
        # Remap from deadzone–1.0 to 0.0–1.0 for smooth response
        var remapped_length: float = (normalized.length() - deadzone) / (1.0 - deadzone)
        output = normalized.normalized() * remapped_length


func _release() -> void:
    _is_pressed = false
    _touch_index = -1
    output = Vector2.ZERO
    _knob.position = _center - _knob.size / 2.0
```

### Touch Action Buttons

```gdscript
class_name TouchActionButton
extends TouchScreenButton

## The InputMap action to simulate when pressed.
@export var action: String = "move_jump"


func _ready() -> void:
    pressed.connect(_on_pressed)
    released.connect(_on_released)


func _on_pressed() -> void:
    Input.action_press(action)


func _on_released() -> void:
    Input.action_release(action)
```

---

## Local Multiplayer

### Device-Split Input Manager

Assigns specific devices to specific players for couch co-op:

```gdscript
class_name MultiplayerInput
extends Node

## Maximum number of local players.
const MAX_PLAYERS: int = 4

## Player action prefix format: "p1_move_left", "p2_move_left", etc.
const ACTION_PREFIX: String = "p%d_%s"

## Base actions that get duplicated per player.
var _base_actions: Array[String] = [
    "move_left", "move_right", "move_up", "move_down",
    "move_jump", "attack_primary", "interact",
]

## Maps player index (1-based) to device ID (-1 = keyboard).
var player_devices: Dictionary = {}  # int → int


func _ready() -> void:
    _create_player_actions()


## Creates per-player actions: p1_move_left, p2_move_left, etc.
func _create_player_actions() -> void:
    for player_idx: int in range(1, MAX_PLAYERS + 1):
        for base_action: String in _base_actions:
            var action_name: String = ACTION_PREFIX % [player_idx, base_action]
            if not InputMap.has_action(action_name):
                InputMap.add_action(action_name)


## Assigns a device to a player and maps their inputs.
func assign_device(player_idx: int, device_id: int) -> void:
    player_devices[player_idx] = device_id
    
    for base_action: String in _base_actions:
        var player_action: String = ACTION_PREFIX % [player_idx, base_action]
        InputMap.action_erase_events(player_action)
        
        # Copy events from base action, filtered to this device
        for event: InputEvent in InputMap.action_get_events(base_action):
            var cloned: InputEvent = event.duplicate()
            cloned.device = device_id
            InputMap.action_add_event(player_action, cloned)


## Gets the action name for a specific player.
## Usage: Input.is_action_pressed(mp_input.action(1, "move_left"))
func action(player_idx: int, base_action: String) -> String:
    return ACTION_PREFIX % [player_idx, base_action]
```

Usage in a player controller:

```gdscript
class_name LocalPlayer
extends CharacterBody2D

## Player index (1-4). Set by the spawner.
@export var player_index: int = 1

@onready var _mp_input: MultiplayerInput = get_node("/root/MultiplayerInput")

var move_speed: float = 200.0


func _physics_process(_delta: float) -> void:
    var dir := Vector2(
        Input.get_axis(
            _mp_input.action(player_index, "move_left"),
            _mp_input.action(player_index, "move_right")
        ),
        Input.get_axis(
            _mp_input.action(player_index, "move_up"),
            _mp_input.action(player_index, "move_down")
        )
    )
    
    if dir.length() > 1.0:
        dir = dir.normalized()
    
    velocity = dir * move_speed
    move_and_slide()
```

### Join Screen (Press Start)

```gdscript
class_name JoinScreen
extends Control

signal player_joined(player_idx: int, device_id: int)
signal all_ready

@onready var _mp_input: MultiplayerInput = get_node("/root/MultiplayerInput")

var _joined_devices: Array[int] = []
var _ready_players: Array[int] = []


func _unhandled_input(event: InputEvent) -> void:
    if not (event.is_pressed()):
        return
    
    var device_id: int = event.device
    
    # Keyboard always uses device -1 for our purposes
    if event is InputEventKey:
        device_id = -1
    
    # Skip mouse and analog drift
    if event is InputEventMouseButton or event is InputEventMouseMotion:
        return
    if event is InputEventJoypadMotion and absf(event.axis_value) < 0.5:
        return
    
    # New player joining
    if device_id not in _joined_devices:
        if event is InputEventKey and event.keycode == KEY_ENTER:
            _join_player(device_id)
        elif event is InputEventJoypadButton \
                and event.button_index == JOY_BUTTON_A:
            _join_player(device_id)


func _join_player(device_id: int) -> void:
    _joined_devices.append(device_id)
    var player_idx: int = _joined_devices.size()
    _mp_input.assign_device(player_idx, device_id)
    player_joined.emit(player_idx, device_id)
```

---

## Combo / Sequence Detection

For fighting games, action games, or cheat codes:

```gdscript
class_name ComboDetector
extends Node

## Maximum time between inputs in a combo sequence (seconds).
@export var combo_window: float = 0.4

signal combo_detected(combo_name: String)

## Each combo is: name → array of action strings.
var _combos: Dictionary = {}  # String → Array[String]

## Recent action presses with timestamps.
var _input_history: Array[Dictionary] = []  # [{action: String, time: float}]


## Registers a combo sequence.
## Example: register("hadouken", ["move_down", "move_right", "attack_primary"])
func register(combo_name: String, sequence: Array[String]) -> void:
    _combos[combo_name] = sequence


func _unhandled_input(event: InputEvent) -> void:
    for action: String in _get_all_combo_actions():
        if event.is_action_pressed(action):
            _record_input(action)
            _check_combos()
            return


func _record_input(action: String) -> void:
    var now: float = Time.get_ticks_msec() / 1000.0
    _input_history.append({"action": action, "time": now})
    
    # Trim old inputs beyond any combo length
    var max_len: int = 0
    for combo_seq: Array in _combos.values():
        max_len = maxi(max_len, combo_seq.size())
    
    while _input_history.size() > max_len:
        _input_history.remove_at(0)


func _check_combos() -> void:
    var now: float = Time.get_ticks_msec() / 1000.0
    
    for combo_name: String in _combos:
        var sequence: Array = _combos[combo_name]
        if _matches_sequence(sequence, now):
            combo_detected.emit(combo_name)
            _input_history.clear()  # Consume the combo
            return


func _matches_sequence(sequence: Array, now: float) -> bool:
    if _input_history.size() < sequence.size():
        return false
    
    # Check the last N inputs match the sequence in order
    var start: int = _input_history.size() - sequence.size()
    
    for i: int in sequence.size():
        var entry: Dictionary = _input_history[start + i]
        if entry["action"] != sequence[i]:
            return false
        # Check timing: each input must be within combo_window of the next
        if i > 0:
            var prev: Dictionary = _input_history[start + i - 1]
            if entry["time"] - prev["time"] > combo_window:
                return false
    
    # Check the combo isn't stale (last input must be recent)
    if now - _input_history.back()["time"] > combo_window:
        return false
    
    return true


func _get_all_combo_actions() -> Array[String]:
    var actions: Array[String] = []
    for combo_seq: Array in _combos.values():
        for action: String in combo_seq:
            if action not in actions:
                actions.append(action)
    return actions
```

Usage:

```gdscript
# In player _ready()
var combo := ComboDetector.new()
add_child(combo)
combo.register("hadouken", ["move_down", "move_right", "attack_primary"])
combo.register("shoryuken", ["move_right", "move_down", "move_right", "attack_primary"])
combo.register("dash", ["move_right", "move_right"])
combo.combo_detected.connect(_on_combo)

func _on_combo(combo_name: String) -> void:
    match combo_name:
        "hadouken":
            spawn_projectile()
        "shoryuken":
            rising_uppercut()
        "dash":
            start_dash()
```

---

## Input Recording & Replay

For tutorials, demos, ghost races, or debugging:

```gdscript
class_name InputRecorder
extends Node

## Actions to record.
@export var tracked_actions: Array[String] = [
    "move_left", "move_right", "move_up", "move_down",
    "move_jump", "attack_primary",
]

var is_recording: bool = false
var is_replaying: bool = false

## Recorded frames: array of {tick: int, states: Dictionary}.
var _recording: Array[Dictionary] = []
var _replay_index: int = 0
var _tick: int = 0


func start_recording() -> void:
    _recording.clear()
    _tick = 0
    is_recording = true


func stop_recording() -> Array[Dictionary]:
    is_recording = false
    return _recording.duplicate()


func start_replay(data: Array[Dictionary]) -> void:
    _recording = data
    _replay_index = 0
    _tick = 0
    is_replaying = true


func stop_replay() -> void:
    is_replaying = false
    # Release all simulated inputs
    for action: String in tracked_actions:
        Input.action_release(action)


func _physics_process(_delta: float) -> void:
    if is_recording:
        _record_frame()
    elif is_replaying:
        _replay_frame()
    _tick += 1


func _record_frame() -> void:
    var states: Dictionary = {}
    for action: String in tracked_actions:
        if Input.is_action_pressed(action):
            states[action] = Input.get_action_strength(action)
    
    # Only store frames where something is pressed (sparse recording)
    if not states.is_empty() or _should_record_release():
        _recording.append({"tick": _tick, "states": states})


func _should_record_release() -> bool:
    # Record the first empty frame after input stops (captures releases)
    if _recording.is_empty():
        return false
    return not _recording.back()["states"].is_empty()


func _replay_frame() -> void:
    if _replay_index >= _recording.size():
        stop_replay()
        return
    
    var frame: Dictionary = _recording[_replay_index]
    
    if frame["tick"] == _tick:
        # Apply this frame's inputs
        for action: String in tracked_actions:
            if action in frame["states"]:
                Input.action_press(action, frame["states"][action])
            else:
                Input.action_release(action)
        _replay_index += 1
    # else: hold previous state until the next recorded frame


## Save recording to file.
func save_to_file(path: String) -> void:
    var file := FileAccess.open(path, FileAccess.WRITE)
    if file:
        file.store_string(JSON.stringify(_recording))


## Load recording from file.
func load_from_file(path: String) -> bool:
    var file := FileAccess.open(path, FileAccess.READ)
    if not file:
        return false
    var json := JSON.new()
    if json.parse(file.get_as_text()) != OK:
        return false
    _recording.assign(json.data)
    return true
```

---

## Accessibility Patterns

### Hold-to-Toggle Conversion

Some players can't hold buttons. Convert any hold action to a toggle:

```gdscript
class_name ToggleAccessibility
extends Node

## Actions that can be toggled instead of held.
@export var toggleable_actions: Array[String] = ["move_crouch", "aim", "block"]

## Whether toggle mode is active (set from accessibility options).
@export var toggle_enabled: bool = false

var _toggled_states: Dictionary = {}  # String → bool


func _unhandled_input(event: InputEvent) -> void:
    if not toggle_enabled:
        return
    
    for action: String in toggleable_actions:
        if event.is_action_pressed(action):
            var is_active: bool = _toggled_states.get(action, false)
            _toggled_states[action] = not is_active
            
            if _toggled_states[action]:
                Input.action_press(action)
            else:
                Input.action_release(action)
            
            get_viewport().set_input_as_handled()
            return


## Check if an action is currently toggled on.
func is_toggled(action: String) -> bool:
    return _toggled_states.get(action, false)
```

### Input Sensitivity Scaling

```gdscript
## Global input sensitivity multipliers (0.1 = very slow, 2.0 = very fast).
## Apply in your movement code: direction * sensitivity_scale
class_name InputAccessibility
extends Node

## Mouse look / aim sensitivity.
@export_range(0.1, 3.0) var mouse_sensitivity: float = 1.0
## Analog stick sensitivity.
@export_range(0.1, 3.0) var stick_sensitivity: float = 1.0
## How long a press must be held to register (anti-tremor). Seconds.
@export_range(0.0, 0.5) var press_threshold: float = 0.0

var _press_timers: Dictionary = {}  # String → float


func get_aim_sensitivity() -> float:
    var mgr: GamepadManager = get_node_or_null("/root/GamepadManager")
    if mgr and mgr.current_device == GamepadManager.InputDevice.GAMEPAD:
        return stick_sensitivity
    return mouse_sensitivity


## For anti-tremor: call instead of is_action_just_pressed.
func is_action_confirmed(action: String) -> bool:
    if press_threshold <= 0.0:
        return Input.is_action_just_pressed(action)
    
    if Input.is_action_pressed(action):
        _press_timers[action] = _press_timers.get(action, 0.0)
        # Timer incremented in _process
        return _press_timers[action] >= press_threshold
    else:
        _press_timers[action] = 0.0
        return false


func _process(delta: float) -> void:
    for action: String in _press_timers:
        if Input.is_action_pressed(action):
            _press_timers[action] += delta
```

---

## Common Mistakes

### ❌ Using `_process` for Physics Movement

```gdscript
# WRONG — movement tied to framerate, inconsistent on different hardware
func _process(delta: float) -> void:
    velocity.x = Input.get_axis("move_left", "move_right") * speed
    move_and_slide()

# CORRECT — movement runs at fixed physics tick rate
func _physics_process(delta: float) -> void:
    velocity.x = Input.get_axis("move_left", "move_right") * speed
    move_and_slide()
```

### ❌ Not Normalizing Diagonal Input

```gdscript
# WRONG — diagonal movement is ~41% faster than cardinal
var dir := Vector2(
    Input.get_axis("move_left", "move_right"),
    Input.get_axis("move_up", "move_down")
)
velocity = dir * speed

# CORRECT — clamp length to prevent diagonal speed boost
var dir := Vector2(
    Input.get_axis("move_left", "move_right"),
    Input.get_axis("move_up", "move_down")
)
if dir.length() > 1.0:
    dir = dir.normalized()
velocity = dir * speed
```

### ❌ Using `_input` for Gameplay Actions

```gdscript
# WRONG — game actions fire even when typing in a chat box or clicking UI
func _input(event: InputEvent) -> void:
    if event.is_action_pressed("attack_primary"):
        attack()

# CORRECT — _unhandled_input is skipped when UI consumes the event
func _unhandled_input(event: InputEvent) -> void:
    if event.is_action_pressed("attack_primary"):
        attack()
        get_viewport().set_input_as_handled()
```

### ❌ Forgetting `set_input_as_handled()`

```gdscript
# WRONG — multiple nodes all react to the same press
func _unhandled_input(event: InputEvent) -> void:
    if event.is_action_pressed("interact"):
        interact_with_nearest()
        # Event keeps propagating! Other nodes will also fire.

# CORRECT — stop propagation after handling
func _unhandled_input(event: InputEvent) -> void:
    if event.is_action_pressed("interact"):
        interact_with_nearest()
        get_viewport().set_input_as_handled()
```

### ❌ Polling `is_action_just_pressed` in `_process` for Physics Actions

```gdscript
# WRONG — _process runs at render framerate. At 144fps, just_pressed
# checks happen 2-3x between physics ticks. At 30fps, checks happen
# every other tick. Jump timing feels inconsistent.
func _process(_delta: float) -> void:
    if Input.is_action_just_pressed("move_jump"):
        velocity.y = jump_velocity

# CORRECT — poll just_pressed in _physics_process for consistent behavior,
# OR use _unhandled_input and set a flag
var _jump_requested: bool = false

func _unhandled_input(event: InputEvent) -> void:
    if event.is_action_pressed("move_jump"):
        _jump_requested = true

func _physics_process(_delta: float) -> void:
    if _jump_requested:
        _jump_requested = false
        if is_on_floor():
            velocity.y = jump_velocity
```

---

## Tuning Reference

### Platformer Input Values

| Parameter | Tight (Celeste) | Standard (Mario) | Floaty (Kirby) |
|-----------|-----------------|-------------------|-----------------|
| Move speed | 180–220 | 250–350 | 150–200 |
| Acceleration | 3000+ | 1500–2500 | 800–1200 |
| Friction | 3000+ | 2000–3000 | 600–1000 |
| Jump velocity | -350 to -400 | -400 to -500 | -300 to -350 |
| Fall gravity mult | 2.0–3.0 | 1.5–2.0 | 1.0–1.3 |
| Short jump mult | 4.0–5.0 | 3.0–4.0 | 2.0–2.5 |
| Coyote time | 0.06–0.08s | 0.08–0.12s | 0.12–0.15s |
| Jump buffer | 0.08–0.10s | 0.10–0.15s | 0.15–0.20s |

### Input Buffer Windows by Genre

| Genre | Buffer Window | Why |
|-------|---------------|-----|
| Platformer | 0.08–0.15s | Tight timing, needs responsiveness |
| Fighting | 0.15–0.30s | Combo inputs are sequences, not instant |
| Action RPG | 0.10–0.20s | Attack chains, dodge timing |
| Puzzle | Not needed | Inputs aren't time-critical |
| Strategy | Not needed | Click-based, no buffering needed |

### Combo Window by Game Speed

| Game Speed | Combo Window | Example |
|------------|-------------|---------|
| Very fast | 0.20–0.30s | Fighting games, spectacle fighters |
| Fast | 0.30–0.45s | Action RPGs, hack and slash |
| Medium | 0.40–0.60s | Combo-based platformers |
| Casual | 0.50–0.80s | Cheat codes, easter eggs |

---

## Cross-References

- **[G1 Scene Composition](./G1_scene_composition.md)** — How to structure the player scene tree
- **[G2 State Machine](./G2_state_machine.md)** — State-driven input handling (different inputs per state)
- **[G3 Signal Architecture](./G3_signal_architecture.md)** — Input signals → game system communication
- **[E1 Architecture Overview](../architecture/E1_architecture_overview.md)** — Where input fits in Godot's architecture
- **[godot-rules.md](../godot-rules.md)** — GDScript conventions, Godot 3→4 migration table
