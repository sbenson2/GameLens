# Input Handling & Controls

> **Category:** guide · **Engine:** GDevelop · **Related:** [G1_events_and_behaviors](G1_events_and_behaviors.md), [G4_physics_and_collisions](G4_physics_and_collisions.md), [E1_architecture_overview](../architecture/E1_architecture_overview.md)

GDevelop provides built-in conditions and actions for keyboard, mouse/touch, and gamepad input — all accessible through the visual event system without code. This guide covers each input type, how to combine them for cross-platform play, and patterns for building rebindable controls.

---

## Keyboard Input

Keyboard conditions live under **"Keyboard"** in the condition picker. There are two core conditions:

### Key Conditions

| Condition | Fires | Use Case |
|-----------|-------|----------|
| **Key is pressed** | Every frame the key is held | Movement, charging |
| **Key was just pressed** | One frame only, on key-down | Jumping, menu selection |
| **Key was just released** | One frame only, on key-up | Releasing a charged attack |

Each condition takes a **key name as a string expression** — for example `"Left"`, `"Right"`, `"Space"`, `"a"`, `"Shift"`.

### Common Key Names

| Key | String | Key | String |
|-----|--------|-----|--------|
| Arrow Left | `"Left"` | Space | `"Space"` |
| Arrow Right | `"Right"` | Enter | `"Return"` |
| Arrow Up | `"Up"` | Escape | `"Escape"` |
| Arrow Down | `"Down"` | Shift | `"Shift"` |
| Letters | `"a"` – `"z"` | Ctrl | `"Control"` |
| Numbers | `"0"` – `"9"` | Tab | `"Tab"` |

### Typical Movement Pattern

Set up four conditions in a single event group:

1. **Condition:** Key `"Left"` is pressed → **Action:** Change X of Player by `-200 * TimeDelta()`
2. **Condition:** Key `"Right"` is pressed → **Action:** Change X of Player by `200 * TimeDelta()`
3. **Condition:** Key `"Up"` is pressed → **Action:** Change Y of Player by `-200 * TimeDelta()`
4. **Condition:** Key `"Down"` is pressed → **Action:** Change Y of Player by `200 * TimeDelta()`

Always multiply movement by `TimeDelta()` so speed is frame-rate independent.

---

## Mouse & Touch Input

GDevelop unifies mouse and touch under a single set of conditions. By default, a single-finger touch is treated as a left mouse click, and the touch position maps to the cursor position. This means a game built with mouse conditions works on mobile with no changes for single-touch interactions.

### Mouse/Touch Conditions

| Condition | What It Detects |
|-----------|----------------|
| **Mouse button pressed or touch held** | Left/Middle/Right button held, or finger on screen |
| **Mouse button was just pressed** | Single-frame press (like click start) |
| **Mouse button was just released** | Single-frame release (like click end) |
| **Cursor is on an object** | Hit-test between cursor position and an object's bounding box |
| **A new touch has started** | A finger just made contact (useful for multitouch) |

### Cursor Position Expressions

| Expression | Returns |
|------------|---------|
| `CursorX("", 0)` | X position of cursor in the scene (default layer, camera 0) |
| `CursorY("", 0)` | Y position of cursor in the scene |
| `CursorX("UI", 0)` | X on a specific layer named "UI" |
| `MouseX()` (deprecated) | Use `CursorX` instead |

The layer and camera parameters matter when your camera moves or you have parallax layers. Always specify the correct layer for HUD elements.

### Click-to-Move Example

1. **Condition:** Mouse button was just pressed (Left)
2. **Action:** Change variable `TargetX` → set to `CursorX("", 0)`
3. **Action:** Change variable `TargetY` → set to `CursorY("", 0)`
4. **Condition (separate event):** Distance between Player and (`TargetX`, `TargetY`) > 5
5. **Action:** Move Player toward `TargetX`, `TargetY` at speed 200 (using "Move toward" action)

---

## Multitouch

For games requiring multiple simultaneous touches (dual-stick shooters, piano apps, two-player touch), use the **touch ID** system.

### Touch Conditions & Expressions

| Condition/Expression | Purpose |
|---------------------|---------|
| **A new touch has started** | Detects each new finger independently |
| `TouchX(touchId)` | X position of a specific touch |
| `TouchY(touchId)` | Y position of a specific touch |
| `LastTouchId()` | The ID of the most recently started touch |

### Multitouch Pattern

1. **Condition:** A new touch has started → **Action:** Store `LastTouchId()` in a variable (e.g., `MoveTouchId`)
2. **Condition:** Touch `MoveTouchId` is active → **Action:** Move player toward `TouchX(MoveTouchId)`, `TouchY(MoveTouchId)`

### Multitouch Joystick Object

GDevelop provides a dedicated **Multitouch Joystick** object for on-screen virtual controls. Drag it from the object panel into your scene, then use its conditions:

- `Joystick pushed in a direction` — checks for 4-way or 8-way directional input
- `StickForceX`, `StickForceY` — analog values from -1 to 1 for smooth movement
- Supports multiple joysticks (one for movement, one for aiming) by using different joystick names

### Disabling Touch-Mouse Mirroring

By default, touches trigger mouse conditions too. If you handle multitouch separately, use the action **"De/activate moving the mouse cursor with touches"** set to "no" to prevent ghost mouse events from interfering.

---

## Gamepad Input

Gamepad support comes through the **Gamepad** extension (install from the extension list if not already present). It follows the standard gamepad mapping (Xbox-style layout).

### Gamepad Conditions

| Condition | Description |
|-----------|------------|
| **Gamepad connected** | A gamepad is plugged in at index 1–4 |
| **Button pressed** | A button is held this frame |
| **Button just pressed** | Button was pressed this frame |
| **Button just released** | Button was released this frame |
| **Stick pushed in a direction** | Detects 4/8-way on left or right stick |

### Gamepad Expressions

| Expression | Returns |
|------------|---------|
| `Gamepad1AxisValue("Left", "X")` | Left stick horizontal: -1 (left) to 1 (right) |
| `Gamepad1AxisValue("Left", "Y")` | Left stick vertical: -1 (up) to 1 (down) |
| `Gamepad1AxisValue("Right", "X")` | Right stick horizontal |
| `Gamepad1ButtonValue("LT")` | Left trigger pressure (0 to 1) |

### Button Names

`"A"`, `"B"`, `"X"`, `"Y"`, `"LB"`, `"RB"`, `"LT"`, `"RT"`, `"Back"`, `"Start"`, `"LS"` (left stick click), `"RS"`, `"Up"`, `"Down"`, `"Left"`, `"Right"` (D-pad).

### Rumble/Vibration

Use the **"Start vibration"** action with a gamepad index, weak magnitude (0–1), strong magnitude (0–1), and duration in seconds. Not supported on all platforms.

---

## Cross-Platform Input Pattern

Many games need keyboard + gamepad + touch to all work simultaneously. The cleanest approach in GDevelop is an **abstraction layer using scene variables**.

### Step 1: Define Action Variables

Create scene variables: `MoveX`, `MoveY`, `ActionJump`, `ActionShoot` (all numbers, default 0).

### Step 2: Input Reading Events (one group per device)

**Keyboard group:**
- Key `"Left"` pressed → Set `MoveX` to `-1`
- Key `"Right"` pressed → Set `MoveX` to `1`
- Key `"Space"` just pressed → Set `ActionJump` to `1`

**Gamepad group (if connected):**
- Stick pushed left → Set `MoveX` to `Gamepad1AxisValue("Left", "X")`
- Button `"A"` just pressed → Set `ActionJump` to `1`

**Touch group (if on mobile):**
- Left half of screen touched → Set `MoveX` to `-1`
- Right half touched → Set `MoveX` to `1`

### Step 3: Gameplay Events Read Variables Only

- `MoveX < 0` → Move player left at `abs(MoveX) * 200 * TimeDelta()`
- `ActionJump = 1` → Apply jump force

### Step 4: Reset at End of Frame

At the bottom of your event sheet, reset one-shot variables: Set `ActionJump` to `0`. Continuous variables like `MoveX` reset at the start of the next input-reading pass.

---

## Input and Behaviors

GDevelop's built-in behaviors (Platformer, Top-down movement) have their own default key bindings:

| Behavior | Default Keys | Customizable? |
|----------|-------------|---------------|
| Platformer character | Arrow keys + Shift (jump) | Yes, via "Simulate" actions |
| Top-down movement | Arrow keys | Yes, via "Simulate" actions |

To override default keys or add gamepad support, use **"Simulate key press"** actions on the behavior. For example, when gamepad stick is pushed left, use the action "Simulate pressing Left key" on the Platformer behavior. This feeds into the behavior's internal logic cleanly.

---

## Common Pitfalls

1. **Forgetting `TimeDelta()`** — Without it, movement speed depends on frame rate. A game running at 30 FPS moves half as fast as at 60 FPS.
2. **Touch-mouse interference** — On mobile, touches trigger mouse conditions by default. Disable mirroring if handling multitouch separately.
3. **Gamepad index mismatch** — Gamepad 1 is not always the first controller plugged in. Check `Gamepad connected` before reading input.
4. **Layer mismatch in `CursorX`/`CursorY`** — If your camera moves, passing the wrong layer name returns screen coordinates instead of world coordinates (or vice versa).
5. **Mixing held/pressed conditions** — Using "Key is pressed" (held) for a jump means the player jumps every frame. Use "Key was just pressed" for single-fire actions.
