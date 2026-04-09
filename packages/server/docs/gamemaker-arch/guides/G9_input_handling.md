# Input Handling & Abstraction

> **Category:** guide · **Engine:** GameMaker · **Related:** [G1_object_events](G1_object_events.md), [G6_structs_state_machines](G6_structs_state_machines.md), [E1_architecture_overview](../architecture/E1_architecture_overview.md)

GameMaker provides three input families — keyboard, mouse, and gamepad — each with its own set of `_check`, `_check_pressed`, and `_check_released` functions. This guide covers the raw API for each device, then builds up to an abstraction layer that unifies them behind a single "action" system suitable for shipping games.

---

## Keyboard Input

The keyboard API uses **virtual key constants** (`vk_left`, `vk_right`, `vk_space`, etc.) or **ord()** for letter keys.

### Core Functions

| Function | Returns | Fires |
|----------|---------|-------|
| `keyboard_check(key)` | `bool` | Every step the key is held |
| `keyboard_check_pressed(key)` | `bool` | Only the first step the key goes down |
| `keyboard_check_released(key)` | `bool` | Only the step the key comes up |
| `keyboard_lastkey` | `vk_*` constant | The most recent key pressed (read/write) |
| `keyboard_string` | `string` | Characters typed since last cleared |

```gml
// Basic directional movement
if (keyboard_check(vk_left))  x -= move_speed;
if (keyboard_check(vk_right)) x += move_speed;

// Jump on press only (not hold)
if (keyboard_check_pressed(vk_space) && on_ground) {
    vspeed = -jump_force;
}
```

### Letter Keys

Use `ord("A")` for letter keys. The string must be uppercase.

```gml
if (keyboard_check(ord("W"))) y -= move_speed;
if (keyboard_check(ord("S"))) y += move_speed;
```

---

## Mouse Input

Mouse functions work the same way but check mouse buttons (`mb_left`, `mb_right`, `mb_middle`, `mb_any`, `mb_none`).

### Core Functions

| Function | Returns | Use For |
|----------|---------|---------|
| `mouse_check_button(button)` | `bool` | Held — dragging, continuous fire |
| `mouse_check_button_pressed(button)` | `bool` | Single click — UI interaction, placing objects |
| `mouse_check_button_released(button)` | `bool` | Release — confirming drag, drop |
| `mouse_x` / `mouse_y` | `real` | Cursor position in the room |
| `mouse_wheel_up()` / `mouse_wheel_down()` | `bool` | Scroll detection (per step) |

```gml
// Aim toward mouse and shoot on click
image_angle = point_direction(x, y, mouse_x, mouse_y);

if (mouse_check_button_pressed(mb_left)) {
    var _bullet = instance_create_layer(x, y, "Instances", obj_Bullet);
    _bullet.direction = image_angle;
    _bullet.speed = 12;
}
```

### GUI vs. Room Coordinates

`mouse_x`/`mouse_y` are room coordinates (affected by camera). For UI elements drawn in the **Draw GUI** event, use:

```gml
// In the Draw GUI event
var _gx = device_mouse_x_to_gui(0);
var _gy = device_mouse_y_to_gui(0);

if (point_in_rectangle(_gx, _gy, btn_x1, btn_y1, btn_x2, btn_y2)) {
    // Mouse is over the GUI button
}
```

---

## Gamepad Input

Gamepads are identified by a **slot index** (0–11). Not every slot has a controller connected — always detect before reading.

### Detection via Async System Event

The recommended approach is the **Async – System** event, which fires whenever a pad connects or disconnects.

```gml
/// Async – System event
var _event_type = async_load[? "event_type"];

if (_event_type == "gamepad discovered") {
    var _pad = async_load[? "pad_index"];
    show_debug_message("Gamepad connected: slot " + string(_pad));
    global.active_gamepad = _pad;
}

if (_event_type == "gamepad lost") {
    var _pad = async_load[? "pad_index"];
    if (global.active_gamepad == _pad) {
        global.active_gamepad = -1;
    }
}
```

### Reading Buttons and Sticks

```gml
// Button check — gp_face1 is "A" on Xbox, "Cross" on PlayStation
if (gamepad_button_check_pressed(global.active_gamepad, gp_face1)) {
    // Jump
}

// Stick axis — returns -1.0 to 1.0
var _lx = gamepad_axis_value(global.active_gamepad, gp_axislh);
var _ly = gamepad_axis_value(global.active_gamepad, gp_axislv);

// Apply deadzone
if (abs(_lx) < 0.2) _lx = 0;
if (abs(_ly) < 0.2) _ly = 0;
```

### Standard Button Constants

| Constant | Xbox | PlayStation | Purpose |
|----------|------|-------------|---------|
| `gp_face1` | A | Cross | Confirm / Jump |
| `gp_face2` | B | Circle | Cancel / Back |
| `gp_face3` | X | Square | Action 1 |
| `gp_face4` | Y | Triangle | Action 2 |
| `gp_shoulderl` / `gp_shoulderr` | LB / RB | L1 / R1 | Bumpers |
| `gp_shoulderlb` / `gp_shoulderrb` | LT / RT | L2 / R2 | Triggers |
| `gp_start` | Menu | Options | Pause |
| `gp_select` | View | Touchpad Click | Map / Inventory |

---

## Building an Input Abstraction Layer

Checking raw keys throughout your codebase leads to two problems: (1) you cannot remap controls, and (2) supporting multiple devices requires duplicating every input check. The solution is an **action map** that decouples game verbs from physical inputs.

### The InputManager Constructor

```gml
/// scr_InputManager

/// @desc Creates an input manager that maps actions to keys/buttons
function InputManager() constructor {
    bindings = {};   // action_name -> array of binding structs
    buffer_frames = 6;  // frames to buffer a press
    _buffer = {};    // action_name -> frames remaining

    /// Bind a keyboard key to an action
    static bind_key = function(_action, _key) {
        if (!variable_struct_exists(bindings, _action)) bindings[$ _action] = [];
        array_push(bindings[$ _action], {
            type: "key",
            value: _key
        });
        return self;  // allow chaining
    };

    /// Bind a gamepad button to an action
    static bind_pad = function(_action, _button, _pad_index) {
        _pad_index ??= 0;
        if (!variable_struct_exists(bindings, _action)) bindings[$ _action] = [];
        array_push(bindings[$ _action], {
            type: "pad",
            value: _button,
            pad: _pad_index
        });
        return self;
    };

    /// Bind a mouse button to an action
    static bind_mouse = function(_action, _button) {
        if (!variable_struct_exists(bindings, _action)) bindings[$ _action] = [];
        array_push(bindings[$ _action], {
            type: "mouse",
            value: _button
        });
        return self;
    };

    /// Check if an action is currently held
    static check = function(_action) {
        var _arr = bindings[$ _action];
        if (is_undefined(_arr)) return false;
        for (var i = 0; i < array_length(_arr); i++) {
            var _b = _arr[i];
            switch (_b.type) {
                case "key":   if (keyboard_check(_b.value)) return true; break;
                case "pad":   if (gamepad_button_check(_b.pad, _b.value)) return true; break;
                case "mouse": if (mouse_check_button(_b.value)) return true; break;
            }
        }
        return false;
    };

    /// Check if an action was pressed this step (with optional buffer)
    static check_pressed = function(_action, _use_buffer) {
        _use_buffer ??= false;

        // Check raw press
        var _arr = bindings[$ _action];
        if (!is_undefined(_arr)) {
            for (var i = 0; i < array_length(_arr); i++) {
                var _b = _arr[i];
                var _hit = false;
                switch (_b.type) {
                    case "key":   _hit = keyboard_check_pressed(_b.value); break;
                    case "pad":   _hit = gamepad_button_check_pressed(_b.pad, _b.value); break;
                    case "mouse": _hit = mouse_check_button_pressed(_b.value); break;
                }
                if (_hit) {
                    _buffer[$ _action] = buffer_frames;
                    return true;
                }
            }
        }

        // Check buffer
        if (_use_buffer) {
            var _remaining = _buffer[$ _action] ?? 0;
            if (_remaining > 0) {
                _buffer[$ _action] = 0;  // consume the buffer
                return true;
            }
        }
        return false;
    };

    /// Call once per step to tick down buffers
    static update = function() {
        var _names = variable_struct_get_names(_buffer);
        for (var i = 0; i < array_length(_names); i++) {
            var _val = _buffer[$ _names[i]];
            if (_val > 0) _buffer[$ _names[i]] = _val - 1;
        }
    };
}
```

### Wiring It Up

```gml
/// Create event of obj_Game (persistent controller object)
global.input = new InputManager();

global.input
    .bind_key("move_left",  vk_left)
    .bind_key("move_left",  ord("A"))
    .bind_pad("move_left",  gp_padl)
    .bind_key("move_right", vk_right)
    .bind_key("move_right", ord("D"))
    .bind_pad("move_right", gp_padr)
    .bind_key("jump",       vk_space)
    .bind_pad("jump",       gp_face1)
    .bind_key("attack",     ord("J"))
    .bind_pad("attack",     gp_face3)
    .bind_mouse("attack",   mb_left);
```

```gml
/// Step event of obj_Game
global.input.update();
```

```gml
/// Step event of obj_Player
var _inp = global.input;

// Movement
var _move = _inp.check("move_right") - _inp.check("move_left");
x += _move * move_speed;

// Jump with 6-frame input buffer (coyote-time-friendly)
if (_inp.check_pressed("jump", true) && on_ground) {
    vspeed = -jump_force;
}

// Attack
if (_inp.check_pressed("attack")) {
    state = PlayerState.Attack;
}
```

---

## Input Buffering for Platformers

Input buffering lets a player press jump a few frames before landing and still have it register. The `InputManager` above tracks this via the `buffer_frames` field. Pair it with **coyote time** (a few frames after leaving a ledge where you can still jump):

```gml
/// Step event of obj_Player
// Coyote time tracking
if (on_ground) {
    coyote_timer = 5;  // frames of grace
} else {
    coyote_timer = max(coyote_timer - 1, 0);
}

// Jump allowed if grounded OR within coyote window
var _can_jump = (on_ground || coyote_timer > 0);

if (global.input.check_pressed("jump", true) && _can_jump) {
    vspeed = -jump_force;
    coyote_timer = 0;  // consume coyote time
}
```

---

## Analog Stick Helpers

For gamepad-heavy games, add stick axis reading to the `InputManager`:

```gml
/// Inside InputManager constructor

/// Get a stick axis value with deadzone applied
/// @param {string} _stick  "left" or "right"
/// @param {string} _axis   "h" or "v"
/// @param {real}   _deadzone  Threshold below which output is 0 (default 0.2)
static get_axis = function(_stick, _axis, _deadzone) {
    _deadzone ??= 0.2;
    var _gp = global.active_gamepad;
    if (_gp < 0) return 0;

    var _gp_axis;
    if (_stick == "left"  && _axis == "h") _gp_axis = gp_axislh;
    if (_stick == "left"  && _axis == "v") _gp_axis = gp_axislv;
    if (_stick == "right" && _axis == "h") _gp_axis = gp_axisrh;
    if (_stick == "right" && _axis == "v") _gp_axis = gp_axisrv;

    var _val = gamepad_axis_value(_gp, _gp_axis);
    if (abs(_val) < _deadzone) return 0;

    // Remap deadzone-to-1 range onto 0-to-1 for smooth acceleration
    return sign(_val) * ((abs(_val) - _deadzone) / (1 - _deadzone));
};
```

---

## Handling Multiple Input Devices

To detect which device the player is using (for showing the correct button prompts):

```gml
/// Step event of obj_Game
enum InputDevice {
    Keyboard,
    Gamepad
}

// Track the last-used device
if (keyboard_check(vk_anykey) || mouse_check_button(mb_any)) {
    global.last_device = InputDevice.Keyboard;
}
if (global.active_gamepad >= 0) {
    // Check any gamepad input
    for (var i = gp_face1; i <= gp_axisrv; i++) {
        if (abs(gamepad_button_value(global.active_gamepad, i)) > 0.2) {
            global.last_device = InputDevice.Gamepad;
            break;
        }
    }
}
```

Then use `global.last_device` when drawing button prompts:

```gml
/// Draw GUI event of obj_HUD
var _prompt = (global.last_device == InputDevice.Keyboard)
    ? "Press SPACE to jump"
    : "Press A to jump";
draw_text(32, 32, _prompt);
```

---

## Common Pitfalls

| Problem | Cause | Fix |
|---------|-------|-----|
| Key press fires every frame | Using `keyboard_check` instead of `keyboard_check_pressed` | Use the `_pressed` variant for one-shot actions |
| Gamepad reads from wrong slot | Hard-coding slot 0 | Use Async System event to track `active_gamepad` |
| Diagonal movement is faster | Adding raw dx + dy | Normalize the movement vector: `var _len = point_distance(0,0,_dx,_dy); if (_len > 0) { _dx /= _len; _dy /= _len; }` |
| GUI clicks don't register | Using `mouse_x`/`mouse_y` in Draw GUI | Use `device_mouse_x_to_gui(0)` / `device_mouse_y_to_gui(0)` |
| Stick drift | No deadzone applied | Apply a 0.15–0.25 deadzone before using axis values |
| Input not detected on HTML5 | Browser requires focus and user interaction before input | Prompt the player to click the game canvas first |

---

## Summary

| Concept | Recommendation |
|---------|---------------|
| Raw input | Fine for prototypes; replace with abstraction for production |
| Action maps | Decouple verbs from physical inputs — required for rebinding and multi-device |
| Input buffering | 4–8 frames for jump in platformers; improves perceived responsiveness |
| Gamepad detection | Always use Async System event, never assume slot 0 |
| Button prompts | Track `last_device` and swap prompt sprites/text at draw time |
