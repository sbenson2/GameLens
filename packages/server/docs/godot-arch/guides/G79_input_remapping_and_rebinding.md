# G79 — Input Remapping and Rebinding Systems

> **Category:** guide · **Engine:** Godot 4.x · **Related:** [G4 Input Handling](./G4_input_handling.md) · [G11 Save/Load Systems](./G11_save_load_systems.md) · [G21 Accessibility](./G21_accessibility.md) · [G9 UI Control Systems](./G9_ui_control_systems.md)

Runtime input remapping lets players reassign controls to their preference — a baseline expectation for shipped games and an accessibility requirement. Godot's `InputMap` singleton provides a full API for adding, removing, and swapping input events at runtime without touching Project Settings. This guide covers the full pipeline: reading the current map, building a rebind UI, detecting new input, conflict resolution, persistence, and gamepad/keyboard coexistence.

---

## Table of Contents

1. [How InputMap Works at Runtime](#1-how-inputmap-works-at-runtime)
2. [Reading the Current Binding](#2-reading-the-current-binding)
3. [Listening for New Input](#3-listening-for-new-input)
4. [Swapping a Binding](#4-swapping-a-binding)
5. [Conflict Detection and Resolution](#5-conflict-detection-and-resolution)
6. [Persisting Remapped Bindings](#6-persisting-remapped-bindings)
7. [Building a Rebind UI](#7-building-a-rebind-ui)
8. [Gamepad and Keyboard Coexistence](#8-gamepad-and-keyboard-coexistence)
9. [Restoring Defaults](#9-restoring-defaults)
10. [Accessibility Considerations](#10-accessibility-considerations)
11. [Common Mistakes](#11-common-mistakes)

---

## 1. How InputMap Works at Runtime

Godot's `InputMap` singleton holds every action defined in **Project > Input Map** at startup. You can modify it freely at runtime — add actions, erase events, replace events — and all `Input.is_action_pressed()` / `_input()` calls automatically use the live map.

Key facts:

- Runtime changes do **not** persist to `project.godot`. You must save/load yourself.
- `InputMap.load_from_project_settings()` resets everything to the defaults defined in the editor.
- Actions are identified by `StringName`. Events are `InputEvent` subclasses (`InputEventKey`, `InputEventJoypadButton`, `InputEventJoypadMotion`, `InputEventMouseButton`).

---

## 2. Reading the Current Binding

### GDScript

```gdscript
## Returns the first keyboard event bound to an action, or null.
func get_keyboard_event(action: StringName) -> InputEventKey:
    for event in InputMap.action_get_events(action):
        if event is InputEventKey:
            return event
    return null

## Returns a human-readable label like "W" or "Space".
func get_key_label(action: StringName) -> String:
    var ev := get_keyboard_event(action)
    if ev == null:
        return "<unbound>"
    return ev.as_text().get_slice(" (", 0)  # Strip "(Physical)" suffix
```

### C#

```csharp
using Godot;

public static class InputHelper
{
    public static InputEventKey GetKeyboardEvent(StringName action)
    {
        foreach (InputEvent ev in InputMap.ActionGetEvents(action))
        {
            if (ev is InputEventKey key)
                return key;
        }
        return null;
    }

    public static string GetKeyLabel(StringName action)
    {
        InputEventKey ev = GetKeyboardEvent(action);
        return ev != null ? ev.AsText().Split(" (")[0] : "<unbound>";
    }
}
```

---

## 3. Listening for New Input

When the player clicks "Rebind", you need to capture the **next** physical input. The cleanest pattern: temporarily override `_input()` in your rebind UI.

### GDScript

```gdscript
## Rebind listener — attach to your Settings scene.
var _awaiting_action: StringName = &""

func start_rebind(action: StringName) -> void:
    _awaiting_action = action
    # Show "Press a key…" prompt to the player

func _input(event: InputEvent) -> void:
    if _awaiting_action.is_empty():
        return

    # Filter — only accept physical key/button presses, ignore releases and mouse motion
    if not _is_rebindable(event):
        return

    get_viewport().set_input_as_handled()
    _apply_rebind(_awaiting_action, event)
    _awaiting_action = &""

func _is_rebindable(event: InputEvent) -> bool:
    if event is InputEventKey:
        return event.pressed and not event.echo
    if event is InputEventJoypadButton:
        return event.pressed
    if event is InputEventJoypadMotion:
        return absf(event.axis_value) > 0.5  # Deadzone threshold
    if event is InputEventMouseButton:
        return event.pressed
    return false
```

### C#

```csharp
using Godot;
using System;

public partial class RebindListener : Control
{
    private StringName _awaitingAction = "";

    public void StartRebind(StringName action)
    {
        _awaitingAction = action;
    }

    public override void _Input(InputEvent @event)
    {
        if (string.IsNullOrEmpty(_awaitingAction))
            return;

        if (!IsRebindable(@event))
            return;

        GetViewport().SetInputAsHandled();
        ApplyRebind(_awaitingAction, @event);
        _awaitingAction = "";
    }

    private static bool IsRebindable(InputEvent ev) => ev switch
    {
        InputEventKey key => key.Pressed && !key.Echo,
        InputEventJoypadButton btn => btn.Pressed,
        InputEventJoypadMotion axis => Mathf.Abs(axis.AxisValue) > 0.5f,
        InputEventMouseButton mb => mb.Pressed,
        _ => false,
    };
}
```

---

## 4. Swapping a Binding

Replace the **first event of the same type** so keyboard and gamepad bindings coexist on the same action.

### GDScript

```gdscript
func _apply_rebind(action: StringName, new_event: InputEvent) -> void:
    # Remove existing event of the same device type
    var event_type := _get_event_type(new_event)
    for existing in InputMap.action_get_events(action):
        if _get_event_type(existing) == event_type:
            InputMap.action_erase_event(action, existing)
            break

    InputMap.action_add_event(action, new_event)
    rebind_applied.emit(action, new_event)

## Enum for grouping input device types.
enum EventType { KEYBOARD, GAMEPAD_BUTTON, GAMEPAD_AXIS, MOUSE }

func _get_event_type(event: InputEvent) -> EventType:
    if event is InputEventKey:
        return EventType.KEYBOARD
    if event is InputEventJoypadButton:
        return EventType.GAMEPAD_BUTTON
    if event is InputEventJoypadMotion:
        return EventType.GAMEPAD_AXIS
    return EventType.MOUSE

signal rebind_applied(action: StringName, event: InputEvent)
```

### C#

```csharp
private void ApplyRebind(StringName action, InputEvent newEvent)
{
    string eventType = GetEventType(newEvent);

    foreach (InputEvent existing in InputMap.ActionGetEvents(action))
    {
        if (GetEventType(existing) == eventType)
        {
            InputMap.ActionEraseEvent(action, existing);
            break;
        }
    }

    InputMap.ActionAddEvent(action, newEvent);
}

private static string GetEventType(InputEvent ev) => ev switch
{
    InputEventKey => "keyboard",
    InputEventJoypadButton => "gamepad_button",
    InputEventJoypadMotion => "gamepad_axis",
    _ => "mouse",
};
```

---

## 5. Conflict Detection and Resolution

Two actions sharing the same key confuses players. Scan for conflicts before applying.

### GDScript

```gdscript
## Returns the action name that already uses this event, or empty string.
func find_conflict(new_event: InputEvent, exclude_action: StringName) -> StringName:
    for action in InputMap.get_actions():
        if action == exclude_action:
            continue
        # Skip built-in UI actions (ui_accept, ui_cancel, etc.)
        if (action as String).begins_with("ui_"):
            continue
        for existing in InputMap.action_get_events(action):
            if _events_match(existing, new_event):
                return action
    return &""

func _events_match(a: InputEvent, b: InputEvent) -> bool:
    if a is InputEventKey and b is InputEventKey:
        return a.physical_keycode == b.physical_keycode
    if a is InputEventJoypadButton and b is InputEventJoypadButton:
        return a.button_index == b.button_index
    if a is InputEventJoypadMotion and b is InputEventJoypadMotion:
        return a.axis == b.axis and signf(a.axis_value) == signf(b.axis_value)
    return false
```

**Resolution strategies:**

- **Swap**: Assign the old key of the rebound action to the conflicting action.
- **Unbind**: Remove the binding from the conflicting action and show a warning.
- **Block**: Refuse the rebind and tell the player why.

---

## 6. Persisting Remapped Bindings

Save bindings as a dictionary of action → serialized events. `ConfigFile` is the simplest approach.

### GDScript

```gdscript
const SAVE_PATH := "user://input_bindings.cfg"

func save_bindings(actions: Array[StringName]) -> void:
    var config := ConfigFile.new()
    for action in actions:
        var events: Array[Dictionary] = []
        for event in InputMap.action_get_events(action):
            events.append(_serialize_event(event))
        config.set_value("bindings", action, events)
    config.save(SAVE_PATH)

func load_bindings(actions: Array[StringName]) -> void:
    var config := ConfigFile.new()
    if config.load(SAVE_PATH) != OK:
        return  # No saved bindings — use defaults
    for action in actions:
        if not config.has_section_key("bindings", action):
            continue
        # Clear current events
        InputMap.action_erase_events(action)
        var events: Array = config.get_value("bindings", action, [])
        for data: Dictionary in events:
            var event := _deserialize_event(data)
            if event:
                InputMap.action_add_event(action, event)

func _serialize_event(event: InputEvent) -> Dictionary:
    if event is InputEventKey:
        return {"type": "key", "keycode": event.physical_keycode}
    if event is InputEventJoypadButton:
        return {"type": "joypad_button", "index": event.button_index}
    if event is InputEventJoypadMotion:
        return {"type": "joypad_axis", "axis": event.axis, "value": event.axis_value}
    if event is InputEventMouseButton:
        return {"type": "mouse_button", "index": event.button_index}
    return {}

func _deserialize_event(data: Dictionary) -> InputEvent:
    match data.get("type", ""):
        "key":
            var ev := InputEventKey.new()
            ev.physical_keycode = data["keycode"]
            return ev
        "joypad_button":
            var ev := InputEventJoypadButton.new()
            ev.button_index = data["index"]
            return ev
        "joypad_axis":
            var ev := InputEventJoypadMotion.new()
            ev.axis = data["axis"]
            ev.axis_value = data["value"]
            return ev
        "mouse_button":
            var ev := InputEventMouseButton.new()
            ev.button_index = data["index"]
            return ev
    return null
```

### C#

```csharp
using Godot;
using Godot.Collections;

public partial class InputBindingSaver : Node
{
    private const string SavePath = "user://input_bindings.cfg";

    public void SaveBindings(string[] actions)
    {
        var config = new ConfigFile();
        foreach (string action in actions)
        {
            var events = new Godot.Collections.Array<Dictionary>();
            foreach (InputEvent ev in InputMap.ActionGetEvents(action))
                events.Add(SerializeEvent(ev));
            config.SetValue("bindings", action, events);
        }
        config.Save(SavePath);
    }

    public void LoadBindings(string[] actions)
    {
        var config = new ConfigFile();
        if (config.Load(SavePath) != Error.Ok)
            return;

        foreach (string action in actions)
        {
            if (!config.HasSectionKey("bindings", action))
                continue;
            InputMap.ActionEraseEvents(action);
            var events = (Godot.Collections.Array)config.GetValue("bindings", action);
            foreach (Dictionary data in events)
            {
                InputEvent ev = DeserializeEvent(data);
                if (ev != null)
                    InputMap.ActionAddEvent(action, ev);
            }
        }
    }

    private static Dictionary SerializeEvent(InputEvent ev) => ev switch
    {
        InputEventKey key => new Dictionary
        {
            ["type"] = "key",
            ["keycode"] = (long)key.PhysicalKeycode
        },
        InputEventJoypadButton btn => new Dictionary
        {
            ["type"] = "joypad_button",
            ["index"] = (long)btn.ButtonIndex
        },
        _ => new Dictionary(),
    };

    private static InputEvent DeserializeEvent(Dictionary data)
    {
        string type = data["type"].AsString();
        if (type == "key")
        {
            var ev = new InputEventKey();
            ev.PhysicalKeycode = (Key)data["keycode"].AsInt64();
            return ev;
        }
        if (type == "joypad_button")
        {
            var ev = new InputEventJoypadButton();
            ev.ButtonIndex = (JoyButton)data["index"].AsInt64();
            return ev;
        }
        return null;
    }
}
```

---

## 7. Building a Rebind UI

A typical layout: one row per action, with a label and a button showing the current key. Use a `VBoxContainer` with dynamically generated rows.

### GDScript

```gdscript
## RebindMenu.gd — attach to a VBoxContainer
extends VBoxContainer

## Actions the player can rebind (skip engine/UI actions).
@export var rebindable_actions: Array[StringName] = [
    &"move_left", &"move_right", &"jump", &"attack", &"interact",
]

var _buttons: Dictionary[StringName, Button] = {}

func _ready() -> void:
    for action in rebindable_actions:
        var row := HBoxContainer.new()
        var label := Label.new()
        label.text = _humanize(action)
        label.custom_minimum_size.x = 180.0

        var btn := Button.new()
        btn.text = _get_key_label(action)
        btn.custom_minimum_size.x = 160.0
        btn.pressed.connect(_on_rebind_pressed.bind(action))

        row.add_child(label)
        row.add_child(btn)
        add_child(row)
        _buttons[action] = btn

func _on_rebind_pressed(action: StringName) -> void:
    _buttons[action].text = "Press a key..."
    # Delegate to RebindListener (see section 3)
    RebindListener.start_rebind(action)

func refresh_labels() -> void:
    for action in _buttons:
        _buttons[action].text = _get_key_label(action)

func _humanize(action: StringName) -> String:
    return (action as String).replace("_", " ").capitalize()

func _get_key_label(action: StringName) -> String:
    for event in InputMap.action_get_events(action):
        if event is InputEventKey:
            return event.as_text().get_slice(" (", 0)
    return "<unbound>"
```

---

## 8. Gamepad and Keyboard Coexistence

Most games keep **both** a keyboard binding and a gamepad binding per action. The section 4 swap logic already handles this — it only replaces events of the same `EventType`.

Display tips:

- Detect the last used device via `Input.get_connected_joypads()` and watching for `InputEventJoypad*` vs `InputEventKey` in `_input()`.
- Show keyboard glyphs or gamepad glyphs accordingly — a common pattern is an autoload that emits `device_changed(is_gamepad: bool)`.
- For gamepad glyphs, map `JoyButton` and `JoyAxis` enums to texture atlas regions.

### GDScript

```gdscript
## DeviceDetector.gd — autoload
extends Node

signal device_changed(is_gamepad: bool)

var is_gamepad: bool = false

func _input(event: InputEvent) -> void:
    var gamepad_now := event is InputEventJoypadButton or event is InputEventJoypadMotion
    var keyboard_now := event is InputEventKey or event is InputEventMouseButton or event is InputEventMouseMotion
    if gamepad_now and not is_gamepad:
        is_gamepad = true
        device_changed.emit(true)
    elif keyboard_now and is_gamepad:
        is_gamepad = false
        device_changed.emit(false)
```

---

## 9. Restoring Defaults

### GDScript

```gdscript
func restore_defaults() -> void:
    InputMap.load_from_project_settings()
    # Delete saved file so next launch uses defaults
    if FileAccess.file_exists(SAVE_PATH):
        DirAccess.remove_absolute(SAVE_PATH)
    rebind_menu.refresh_labels()
```

### C#

```csharp
public void RestoreDefaults()
{
    InputMap.LoadFromProjectSettings();
    if (FileAccess.FileExists(SavePath))
        DirAccess.RemoveAbsolute(SavePath);
}
```

---

## 10. Accessibility Considerations

- Always allow mouse buttons as valid rebind targets — some players rely on mice with extra buttons.
- Support **clearing** a binding (let the player press Escape or a dedicated "unbind" button).
- Show both keyboard and gamepad bindings simultaneously if the player uses both.
- Respect `InputMap.action_get_deadzone()` — some players need larger deadzones for accessibility controllers.
- Test with Steam Input and other remapping layers — avoid hardcoding raw keycodes in gameplay logic.

---

## 11. Common Mistakes

| Mistake | Why it's bad | Fix |
|---------|-------------|-----|
| Using `keycode` instead of `physical_keycode` | Breaks on non-QWERTY layouts | Always store and compare `physical_keycode` |
| Forgetting to call `set_input_as_handled()` | The rebound key also triggers gameplay | Call it immediately in the rebind listener |
| Saving `InputEvent` objects directly | They don't serialize cleanly to JSON/CFG | Serialize to a plain dictionary (section 6) |
| Not filtering `echo` events | Holding a key fires rapid rebinds | Check `event.echo` on `InputEventKey` |
| Allowing rebind to Escape/Enter | Breaks menu navigation | Maintain a blocklist of reserved keys |
| One binding per action (keyboard OR gamepad) | Alienates controller or KBM players | Keep both — only replace the matching device type |
