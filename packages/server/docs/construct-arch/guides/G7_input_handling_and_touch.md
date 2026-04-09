# G7 — Input Handling and Touch Controls in Construct 3

> **Category:** guide · **Engine:** Construct · **Related:** [E1 Architecture Overview](../architecture/E1_architecture_overview.md) · [G1 Event Sheet Patterns](G1_event_sheet_patterns.md) · [R1 Behaviors and Effects](../reference/R1_behaviors_and_effects.md)

---

Construct 3 handles input through dedicated **plugin objects** — Keyboard, Mouse, Touch, and Gamepad. Each is added to a project as a single global object and provides conditions, actions, and expressions in your event sheets. This guide covers each input plugin, how to build cross-device control schemes, and patterns for virtual touch controls.

---

## Input Plugin Architecture

Unlike scene objects (sprites, tilemaps), input plugins are **project-wide singletons**. You add them once and reference them from any event sheet.

```
┌────────────────────────────────────────────────────┐
│                  Input Plugins                      │
│                                                    │
│  ┌──────────┐  ┌──────┐  ┌───────┐  ┌─────────┐  │
│  │ Keyboard │  │Mouse │  │ Touch │  │ Gamepad │  │
│  └────┬─────┘  └──┬───┘  └───┬───┘  └────┬────┘  │
│       │            │          │            │       │
│       └────────────┴──────────┴────────────┘       │
│                        │                           │
│              Event Sheet Conditions                │
│              (unified game logic)                  │
└────────────────────────────────────────────────────┘
```

**To add an input plugin:** Right-click the project's object list → Insert new object → choose Keyboard, Mouse, Touch, or Gamepad.

---

## Keyboard Plugin

The Keyboard plugin detects physical keyboard input. It works on desktop and any device with a hardware or Bluetooth keyboard.

### Key Conditions

| Condition | Trigger Type | Use Case |
|-----------|-------------|----------|
| On key pressed | Triggered (fires once) | Jump, shoot, interact — discrete actions |
| On key released | Triggered (fires once) | Release charge shot, stop sprint |
| Key is down | Continuous (true every frame) | Movement, holding a direction |
| On any key pressed | Triggered | Rebinding controls, text input |

### Common Pattern — 4-Direction Movement

```
Event: Keyboard → Key is down "Right"
  Action: Player → Set X to Self.X + 200 * dt

Event: Keyboard → Key is down "Left"
  Action: Player → Set X to Self.X - 200 * dt

Event: Keyboard → Key is down "Up"
  Action: Player → Set Y to Self.Y - 200 * dt

Event: Keyboard → Key is down "Down"
  Action: Player → Set Y to Self.Y + 200 * dt
```

Always multiply movement by `dt` (delta time) for frame-rate-independent speed.

### Scripting API

```javascript
// In a script event or module
const keyboard = runtime.keyboard;

// Check if a key is currently held
if (keyboard.isKeyDown("ArrowRight")) {
    player.x += 200 * runtime.dt;
}
```

Key codes in the scripting API use standard `KeyboardEvent.code` values (`"ArrowRight"`, `"Space"`, `"KeyW"`, etc.).

---

## Mouse Plugin

The Mouse plugin handles cursor position, button clicks, and the scroll wheel.

### Key Conditions

| Condition | Purpose |
|-----------|---------|
| On click / On double-click | Detect left/middle/right button clicks |
| Mouse button is down | Continuous check for held buttons |
| On mouse wheel up/down | Scroll input (zoom, inventory scroll) |
| Cursor is over object | Hover detection for UI elements |
| On object clicked | Click directly on a specific object |

### Key Expressions

| Expression | Returns |
|-----------|---------|
| `Mouse.X` / `Mouse.Y` | Cursor position in layout coordinates |
| `Mouse.AbsoluteX` / `Mouse.AbsoluteY` | Screen (viewport) coordinates |

**Mouse vs. Touch:** On desktop, the Mouse plugin handles pointer input. On touch devices, use the Touch plugin instead. The Mouse plugin does **not** automatically respond to touch input.

---

## Touch Plugin

The Touch plugin handles touchscreen input — taps, multi-touch, and gestures. It also works with mouse input on desktop (treating mouse clicks as single touches), making it a good default for cross-platform games.

### Key Conditions

| Condition | Purpose |
|-----------|---------|
| On touch start | Any finger touches the screen (triggered) |
| On touch end | A finger lifts from the screen (triggered) |
| Is in touch | At least one finger is touching (continuous) |
| On touched object | A specific object was tapped |
| Compare touch speed | Detect swipe velocity |
| Has Nth touch | Check if N fingers are touching (multi-touch) |

### Key Expressions

| Expression | Returns |
|-----------|---------|
| `Touch.X` / `Touch.Y` | Position of the primary touch in layout coords |
| `Touch.XAt(index)` / `Touch.YAt(index)` | Position of the Nth touch point |
| `Touch.SpeedAt(index)` | Movement speed of a touch point |
| `Touch.AngleAt(index)` | Direction angle of touch movement |
| `Touch.TouchCount` | Number of active touch points |

### Virtual Joystick Pattern

On-screen joysticks are the most common mobile control. Here's the event-sheet pattern:

**Setup:** Create two sprites — `JoystickBase` (the outer circle) and `JoystickKnob` (the inner thumb circle). Pin the knob to a maximum radius from the base.

```
Event: Touch → On touched object JoystickBase
  Action: Set Variable(touchID) to Touch.TouchID

Event: Touch → Has Nth touch with ID = touchID
  Sub-event: Always
    Action: Set JoystickKnob position toward Touch.XForID(touchID), Touch.YForID(touchID)
    Action: Clamp distance from JoystickBase center to MaxRadius
    Action: Set Variable(stickAngle) to angle(JoystickBase.X, JoystickBase.Y,
                                                JoystickKnob.X, JoystickKnob.Y)
    Action: Set Variable(stickDist) to distance(JoystickBase.X, JoystickBase.Y,
                                                 JoystickKnob.X, JoystickKnob.Y) / MaxRadius

Event: Touch → On touch end with ID = touchID
  Action: Reset JoystickKnob position to JoystickBase center
  Action: Set Variable(stickDist) to 0
```

Then use `stickAngle` and `stickDist` (0–1 normalized) to drive player movement at any angle.

### Touch-Activated Buttons

For on-screen action buttons (jump, attack), create sprite buttons and use:

```
Event: Touch → On touched object JumpButton
  Action: Player → Simulate Platformer "Jump"

Event: Touch → On touched object AttackButton
  Action: Player → Trigger attack animation
```

The **"Simulate control"** action on the Platformer behavior lets touch buttons feed into the same movement system as keyboard input.

---

## Gamepad Plugin

The Gamepad plugin detects console controllers, PC gamepads, and joysticks via the browser's Gamepad API.

### Key Conditions

| Condition | Purpose |
|-----------|---------|
| On gamepad connected | A controller was plugged in |
| On gamepad disconnected | A controller was removed |
| On button pressed | Triggered once per button press |
| Button is down | Continuous check (held button) |
| Compare axis | Check stick deflection beyond a threshold |

### Gamepad Mapping

Construct uses the **Standard Gamepad Layout** (W3C spec):

```
         [LB/L1]                    [RB/R1]
         [LT/L2]                    [RT/R2]

    ┌─────────────────────────────────────────┐
    │     ↑                     [Y/△]         │
    │   ←   →   [Select][Start] [X/□] [B/○]  │
    │     ↓                     [A/✕]         │
    │                                         │
    │    [L-Stick]           [R-Stick]        │
    └─────────────────────────────────────────┘
```

| Button Index | Standard Mapping |
|-------------|-----------------|
| 0 | A / Cross (✕) |
| 1 | B / Circle (○) |
| 2 | X / Square (□) |
| 3 | Y / Triangle (△) |
| 4 | Left Bumper (LB/L1) |
| 5 | Right Bumper (RB/R1) |
| 6 | Left Trigger (LT/L2) |
| 7 | Right Trigger (RT/R2) |
| 12–15 | D-pad Up/Down/Left/Right |

| Axis Index | Control |
|-----------|---------|
| 0 | Left stick horizontal (-1 left, +1 right) |
| 1 | Left stick vertical (-1 up, +1 down) |
| 2 | Right stick horizontal |
| 3 | Right stick vertical |

### Dead Zone Handling

Analog sticks rarely rest at exactly 0. Always apply a **dead zone** threshold:

```
Event: Gamepad → Compare axis 0 of gamepad 0 > 0.2
  Action: Player → Move right

Event: Gamepad → Compare axis 0 of gamepad 0 < -0.2
  Action: Player → Move left
```

A dead zone of **0.15–0.25** works for most controllers.

---

## Cross-Device Input Abstraction

Most games need to support keyboard + gamepad + touch. The cleanest pattern is an **input variable layer** — events from all sources write to shared variables, and game logic reads only those variables.

```
┌──────────────────────────────────────────────────┐
│  Input Sources (write)                           │
│                                                  │
│  Keyboard events ──┐                             │
│  Gamepad events  ──┼──► Variables: moveX, moveY, │
│  Touch joystick  ──┘    jump, attack, interact   │
│                                                  │
│  Game Logic (read)                               │
│  Movement, combat, UI ◄── reads variables only   │
└──────────────────────────────────────────────────┘
```

**Implementation:**

```
// Keyboard input
Event: Keyboard → "D" is down
  Action: Set moveX to 1
Event: Keyboard → "A" is down
  Action: Set moveX to -1
Event: Keyboard → "D" is NOT down AND "A" is NOT down
  Action: Set moveX to 0

// Gamepad input (overwrites if active)
Event: Gamepad → abs(axis 0) > 0.2
  Action: Set moveX to Gamepad.Axis(0, 0)

// Touch joystick (overwrites if active)
Event: Variable(stickDist) > 0.1
  Action: Set moveX to cos(stickAngle) * stickDist

// Game logic — input-source agnostic
Event: Always
  Action: Player.X = Player.X + moveX * Speed * dt
```

### Detecting Input Method

Show the right UI prompts (keyboard icons vs. gamepad buttons vs. touch hints) by tracking the last active input:

```
Event: Keyboard → On any key pressed
  Action: Set inputMethod to "keyboard"

Event: Gamepad → On any button pressed
  Action: Set inputMethod to "gamepad"

Event: Touch → On touch start
  Action: Set inputMethod to "touch"
```

Use `inputMethod` to swap button prompt sprites in your HUD.

---

## Platform Detection for Touch UI

Show on-screen controls only when needed:

```
Event: System → On start of layout
  Sub-event: Browser → Is mobile
    Action: Set TouchControls group visible
  Sub-event: (Else)
    Action: Set TouchControls group invisible
```

Alternatively, use the Touch plugin's presence detection: if a touch event fires, show touch controls. If keyboard or gamepad input fires, hide them. This handles hybrid devices (laptops with touchscreens) gracefully.

---

## Common Pitfalls

**Forgetting to add the plugin object.** Input conditions won't appear in event sheets until you add the Keyboard/Mouse/Touch/Gamepad object to your project.

**Mouse doesn't detect touch.** These are separate plugins. If you only add Mouse, your game won't respond to touch input on mobile. Add Touch for cross-platform support.

**No dead zone on gamepad sticks.** Without a dead zone, characters drift constantly from stick noise. Always threshold analog input.

**Hard-coding keys.** Support rebinding by mapping actions to variables rather than checking specific keys throughout your events.

**Ignoring dt.** Movement without `dt` runs at different speeds on 30 FPS vs. 144 FPS devices. Always use `dt` for continuous motion.

---

## Next Steps

- **[G1 Event Sheet Patterns](G1_event_sheet_patterns.md)** — Foundational event logic for all game systems
- **[G2 Families and Performance](G2_families_and_performance.md)** — Group objects for efficient input handling
- **[R1 Behaviors and Effects](../reference/R1_behaviors_and_effects.md)** — Platformer/8-direction behaviors that receive simulated input
