# G9 — Input and Controls System

> **Category:** guide · **Engine:** RPG Maker · **Related:** [E1 Architecture Overview](../architecture/E1_architecture_overview.md) · [G1 Plugin Development](G1_plugin_development.md) · [G2 Event System Mastery](G2_event_system_mastery.md) · [R4 Custom Scenes and Windows](../reference/R4_custom_scenes_and_windows.md)

---

## Overview

RPG Maker MZ abstracts all player input through two core classes: `Input` (keyboard and gamepad) and `TouchInput` (mouse and touch screen). Rather than checking raw key codes directly, the engine maps physical buttons to logical **action names** like `"ok"`, `"cancel"`, and `"menu"`. This abstraction layer means your game logic stays consistent regardless of input device.

Understanding this system is essential for creating action RPGs, custom menus, or any game that needs controls beyond the built-in defaults.

---

## The Input Class

`Input` is a static class defined in `rmmz_core.js`. It handles keyboard and gamepad input through two mapper objects.

### Input.keyMapper — Keyboard Bindings

The `keyMapper` object maps JavaScript key codes to action names:

```javascript
Input.keyMapper = {
    9: "tab",       // Tab
    13: "ok",       // Enter
    16: "shift",    // Shift
    17: "control",  // Control
    18: "control",  // Alt (also maps to control)
    27: "escape",   // Escape
    32: "ok",       // Space
    33: "pageup",   // Page Up
    34: "pagedown", // Page Down
    37: "left",     // Left Arrow
    38: "up",       // Up Arrow
    39: "right",    // Right Arrow
    40: "down",     // Down Arrow
    45: "escape",   // Insert
    81: "pageup",   // Q
    87: "pagedown", // W
    88: "escape",   // X
    90: "ok",       // Z
    96: "escape",   // Numpad 0
    98: "down",     // Numpad 2
    100: "left",    // Numpad 4
    102: "right",   // Numpad 6
    104: "up",      // Numpad 8
    120: "debug"    // F9
};
```

### Input.gamepadMapper — Gamepad Bindings

The `gamepadMapper` maps standard Gamepad API button indices:

```javascript
Input.gamepadMapper = {
    0: "ok",        // A (Xbox) / Cross (PlayStation)
    1: "cancel",    // B (Xbox) / Circle (PlayStation)
    2: "shift",     // X (Xbox) / Square (PlayStation)
    3: "menu",      // Y (Xbox) / Triangle (PlayStation)
    4: "pageup",    // LB / L1
    5: "pagedown",  // RB / R1
    12: "up",       // D-pad Up
    13: "down",     // D-pad Down
    14: "left",     // D-pad Left
    15: "right"     // D-pad Right
};
```

Analog stick input from the left stick is automatically converted to directional input (`"up"`, `"down"`, `"left"`, `"right"`) with a built-in dead zone threshold of `0.5`.

---

## Checking Input State

The `Input` class provides four methods for reading state. Each checks the mapped action name, not the raw key code:

| Method | Returns `true` When | Common Use |
|--------|---------------------|-----------|
| `Input.isTriggered(actionName)` | Button was just pressed this frame | Menu confirm, dialogue advance, one-shot actions |
| `Input.isRepeated(actionName)` | Button is held and repeat interval has elapsed | Scrolling through menu lists, cursor movement |
| `Input.isPressed(actionName)` | Button is currently held down | Continuous movement, charging attacks |
| `Input.isLongPressed(actionName)` | Button has been held for a sustained period | Dash activation, skip cutscene |

### Usage in Events (Conditional Branch)

In the event editor, use **Conditional Branch → Script**:

```javascript
Input.isTriggered("ok")
```

This returns `true` on the exact frame the player presses confirm (Z, Enter, Space, or gamepad A).

### Usage in Plugins

```javascript
// In a Scene's update method
Scene_MyCustom.prototype.update = function() {
    Scene_MenuBase.prototype.update.call(this);

    if (Input.isTriggered("cancel")) {
        SoundManager.playCancel();
        this.popScene();
    }

    if (Input.isTriggered("ok")) {
        this.processSelection();
    }
};
```

---

## The TouchInput Class

`TouchInput` handles mouse clicks and touch screen taps. Like `Input`, it's a static class.

### Key Methods

| Method | What It Detects |
|--------|----------------|
| `TouchInput.isTriggered()` | Left click / tap just occurred this frame |
| `TouchInput.isPressed()` | Left button / finger is currently held down |
| `TouchInput.isRepeated()` | Held with repeat interval |
| `TouchInput.isLongPressed()` | Held for an extended duration |
| `TouchInput.isCancelled()` | Right click / two-finger tap (maps to cancel) |
| `TouchInput.isMoved()` | Pointer moved since last frame |

### Reading Position

```javascript
var mx = TouchInput.x;   // Screen X coordinate
var my = TouchInput.y;   // Screen Y coordinate
```

These coordinates are in screen space. To convert to map coordinates for gameplay logic:

```javascript
var mapX = $gameMap.canvasToMapX(TouchInput.x);
var mapY = $gameMap.canvasToMapY(TouchInput.y);
```

---

## Adding Custom Key Bindings

### Pattern: Extend keyMapper in a Plugin

```javascript
/*:
 * @target MZ
 * @plugindesc Adds custom key bindings for action gameplay.
 * @author YourName
 *
 * @param dashKey
 * @text Dash Key Code
 * @type number
 * @default 67
 * @desc JavaScript key code for dash (default: 67 = C)
 *
 * @param inventoryKey
 * @text Inventory Key Code
 * @type number
 * @default 73
 * @desc JavaScript key code for inventory (default: 73 = I)
 */

(() => {
    const params = PluginManager.parameters("CustomKeyBindings");
    const dashKeyCode = Number(params["dashKey"]);
    const inventoryKeyCode = Number(params["inventoryKey"]);

    // Add new mappings — these don't conflict with existing ones
    Input.keyMapper[dashKeyCode] = "dash";
    Input.keyMapper[inventoryKeyCode] = "inventory";
})();
```

Now anywhere in your game logic you can check:

```javascript
if (Input.isPressed("dash")) {
    // Increase player speed
}
if (Input.isTriggered("inventory")) {
    SceneManager.push(Scene_Item);
}
```

### Pattern: Custom Gamepad Bindings

```javascript
// Map LT (button 6) and RT (button 7) — not mapped by default
Input.gamepadMapper[6] = "dash";      // Left Trigger
Input.gamepadMapper[7] = "attack";    // Right Trigger
```

---

## Common Event Integration

For non-programmers, the easiest way to respond to custom keys is through **Common Events** run via parallel process:

1. Create a **Common Event** with trigger **Parallel**.
2. Add a **Conditional Branch → Script**: `Input.isTriggered("inventory")`
3. Inside the branch, call **Open Menu Screen** or run custom event commands.

This pattern bridges the visual event system with custom key bindings defined in a plugin.

### Key Code Reference

Common key codes for custom bindings:

| Key | Code | Key | Code |
|-----|------|-----|------|
| A | 65 | N | 78 |
| B | 66 | O | 79 |
| C | 67 | P | 80 |
| D | 68 | R | 82 |
| E | 69 | S | 83 |
| F | 70 | T | 84 |
| G | 71 | U | 85 |
| H | 72 | V | 86 |
| I | 73 | 1 | 49 |
| J | 74 | 2 | 50 |
| K | 75 | 3 | 51 |
| L | 76 | 4 | 52 |
| M | 77 | 5 | 53 |

Avoid overriding keys already in `keyMapper` (Z, X, Shift, arrows, etc.) unless you intentionally want to remap them.

---

## Player-Configurable Key Remapping

For games that ship with rebindable controls, store the player's preferred mappings and apply them on boot:

```javascript
/*:
 * @target MZ
 * @plugindesc Player key remapping with save/load support.
 * @author YourName
 */

(() => {
    const STORAGE_KEY = "customKeyConfig";

    // Default custom bindings
    const defaultBindings = {
        dash: 67,       // C
        inventory: 73,  // I
        attack: 74      // J
    };

    // Load saved bindings or use defaults
    function loadBindings() {
        const saved = localStorage.getItem(STORAGE_KEY);
        return saved ? JSON.parse(saved) : { ...defaultBindings };
    }

    // Apply bindings to Input.keyMapper
    function applyBindings(bindings) {
        // Clear previous custom entries
        for (const action of Object.keys(defaultBindings)) {
            for (const [code, name] of Object.entries(Input.keyMapper)) {
                if (name === action) {
                    delete Input.keyMapper[code];
                }
            }
        }
        // Apply new bindings
        for (const [action, code] of Object.entries(bindings)) {
            Input.keyMapper[code] = action;
        }
    }

    // Save bindings to localStorage
    function saveBindings(bindings) {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(bindings));
    }

    // Initialize on boot
    const _Scene_Boot_start = Scene_Boot.prototype.start;
    Scene_Boot.prototype.start = function() {
        _Scene_Boot_start.call(this);
        applyBindings(loadBindings());
    };

    // Expose for use in a config scene
    window.KeyConfig = {
        getBindings: loadBindings,
        setBinding: function(action, keyCode) {
            const bindings = loadBindings();
            bindings[action] = keyCode;
            saveBindings(bindings);
            applyBindings(bindings);
        },
        resetDefaults: function() {
            saveBindings({ ...defaultBindings });
            applyBindings(defaultBindings);
        }
    };
})();
```

---

## Mobile and Touch UI Patterns

RPG Maker MZ includes built-in virtual buttons for mobile deployment, but custom touch zones give more control:

### Pattern: Virtual Joystick Region

```javascript
// Check if touch is in the left quarter of the screen (joystick area)
if (TouchInput.isPressed()) {
    const screenWidth = Graphics.width;
    if (TouchInput.x < screenWidth * 0.25) {
        // Virtual joystick zone — calculate direction from center
        const centerX = screenWidth * 0.125;
        const centerY = Graphics.height * 0.75;
        const dx = TouchInput.x - centerX;
        const dy = TouchInput.y - centerY;
        const angle = Math.atan2(dy, dx);

        // Convert angle to 4-direction or 8-direction input
        // Feed into movement system
    }
}
```

### Built-In Touch UI

MZ provides `Scene_Map.prototype.isMenuEnabled()` and virtual button overlays. To toggle the default touch UI:

```javascript
// Disable default touch UI buttons
ConfigManager.touchUI = false;
```

---

## Troubleshooting

| Problem | Cause | Fix |
|---------|-------|-----|
| Custom key not detected | Key code not in `keyMapper` | Add the mapping: `Input.keyMapper[keyCode] = "actionName"` |
| Key triggers multiple actions | Two entries in `keyMapper` with same key code | Remove the conflicting entry before adding yours |
| Gamepad not responding | Browser Gamepad API requires user interaction first | Prompt player to press a button; check `navigator.getGamepads()` |
| `isTriggered` fires multiple times | Checking in `update` without guarding state | Use `isTriggered` (not `isPressed`) for one-shot actions; it returns `true` for only one frame |
| Touch coordinates wrong after resize | Screen scaling not accounted for | Use `TouchInput.x/y` (already adjusted) — not raw DOM event coordinates |
| F5/F12 interfere with gameplay | Browser intercepts these keys | Avoid mapping F-keys; use `event.preventDefault()` cautiously as it breaks expected browser behavior |
