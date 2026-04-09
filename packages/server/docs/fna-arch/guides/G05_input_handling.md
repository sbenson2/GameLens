# G05 — Input Handling & FNA Extensions

> **Category:** Guide · **Engine:** FNA · **Related:** [G01 Getting Started](./G01_getting_started.md) · [G04 Audio System](./G04_audio_system.md) · [FNA Architecture Rules](../fna-arch-rules.md)

FNA preserves the XNA 4.0 input API exactly — `Keyboard`, `Mouse`, `GamePad`, and `TouchPanel` work identically to their original XNA counterparts. On top of that, FNA provides several input extensions (suffixed with `EXT`) that expose platform capabilities XNA never had: text input events, mouse click notifications, gamepad hardware identification, and more. Under the hood, all input flows through SDL2, which provides broad controller support and platform abstraction. This guide covers the full input stack: polling-based XNA input, FNA extensions, SDL2 controller database integration, and common patterns for input abstraction layers.

---

## Table of Contents

1. [Input Architecture Overview](#1--input-architecture-overview)
2. [Keyboard Input](#2--keyboard-input)
3. [Mouse Input](#3--mouse-input)
4. [GamePad Input](#4--gamepad-input)
5. [TextInputEXT — Text Entry Events](#5--textinputext--text-entry-events)
6. [Mouse Extensions — ClickedEXT](#6--mouse-extensions--clickedext)
7. [GamePad Extensions](#7--gamepad-extensions)
8. [SDL2 Controller Database](#8--sdl2-controller-database)
9. [Building an Input Abstraction Layer](#9--building-an-input-abstraction-layer)
10. [Touch Input (Mobile/SDL)](#10--touch-input-mobilesdl)
11. [Environment Variables for Input](#11--environment-variables-for-input)
12. [Common Pitfalls](#12--common-pitfalls)
13. [Differences from MonoGame Input](#13--differences-from-monogame-input)

---

## 1 — Input Architecture Overview

FNA's input path:

```
SDL2 (platform layer)
  ↓ events + polling
FNAPlatform (FNA's SDL2 bridge)
  ↓ translates to XNA types
Keyboard / Mouse / GamePad / TouchPanel (XNA API)
  ↓ your code polls each frame
Game.Update(GameTime)
```

FNA uses **polling-based input** — you call `GetState()` each frame and compare with the previous frame to detect presses and releases. FNA extensions like `TextInputEXT` are **event-based** and fire callbacks asynchronously, which is important for text entry where you need every keystroke including repeats and IME composition.

### Key Principle

FNA's XNA-compatible input classes (`Keyboard`, `Mouse`, `GamePad`) return **snapshots** via `GetState()`. The state represents what's happening at the moment you call it. For frame-accurate edge detection (pressed this frame, released this frame), you must track both the current and previous frame's state yourself.

## 2 — Keyboard Input

### Basic Polling

```csharp
using Microsoft.Xna.Framework.Input;

public class InputHandler
{
    private KeyboardState _currentKeyboard;
    private KeyboardState _previousKeyboard;

    public void Update()
    {
        _previousKeyboard = _currentKeyboard;
        _currentKeyboard = Keyboard.GetState();
    }

    /// <summary>Key is currently held down.</summary>
    public bool IsKeyDown(Keys key) => _currentKeyboard.IsKeyDown(key);

    /// <summary>Key was just pressed this frame (not held from previous frame).</summary>
    public bool IsKeyPressed(Keys key) =>
        _currentKeyboard.IsKeyDown(key) && !_previousKeyboard.IsKeyDown(key);

    /// <summary>Key was just released this frame.</summary>
    public bool IsKeyReleased(Keys key) =>
        !_currentKeyboard.IsKeyDown(key) && _previousKeyboard.IsKeyDown(key);

    /// <summary>Get all keys currently pressed.</summary>
    public Keys[] GetPressedKeys() => _currentKeyboard.GetPressedKeys();
}
```

### Scancodes vs Keycodes

FNA (through SDL2) distinguishes between:
- **Scancodes** — physical key positions on the keyboard (layout-independent). `Keys.W` is always the key in the QWERTY W position, regardless of keyboard layout.
- **Keycodes** — the character the key produces in the current layout.

XNA's `Keys` enum maps to scancodes in FNA. For text input that respects keyboard layout, use `TextInputEXT` instead.

## 3 — Mouse Input

### Basic Polling

```csharp
private MouseState _currentMouse;
private MouseState _previousMouse;

public void UpdateMouse()
{
    _previousMouse = _currentMouse;
    _currentMouse = Mouse.GetState();
}

public bool IsLeftButtonPressed() =>
    _currentMouse.LeftButton == ButtonState.Pressed &&
    _previousMouse.LeftButton == ButtonState.Released;

public bool IsRightButtonDown() =>
    _currentMouse.RightButton == ButtonState.Pressed;

public Point MousePosition => _currentMouse.Position;

public int ScrollWheelDelta =>
    _currentMouse.ScrollWheelValue - _previousMouse.ScrollWheelValue;
```

### Relative Mouse Mode

For first-person camera controls, use SDL2's relative mouse mode via FNA:

```csharp
// Lock the mouse to the window and get relative movement
// FNA exposes this through the SDL2 interop
SDL2.SDL.SDL_SetRelativeMouseMode(SDL2.SDL.SDL_bool.SDL_TRUE);

// In Update, mouse delta is available through the mouse state
// when relative mode is active, Position reports delta instead of absolute
var delta = Mouse.GetState().Position;
```

### Setting Mouse Position

```csharp
// Warp cursor to center of window (useful for FPS-style look)
Mouse.SetPosition(
    GraphicsDevice.Viewport.Width / 2,
    GraphicsDevice.Viewport.Height / 2);
```

## 4 — GamePad Input

FNA supports up to 4 gamepads via the XNA API (matching the original Xbox 360 limit). The underlying SDL_GameController maps any recognized controller to the Xbox 360 button layout.

### Basic Polling

```csharp
private GamePadState _currentPad;
private GamePadState _previousPad;

public void UpdateGamePad(PlayerIndex playerIndex = PlayerIndex.One)
{
    _previousPad = _currentPad;
    _currentPad = GamePad.GetState(playerIndex);
}

public bool IsConnected => _currentPad.IsConnected;

public bool IsButtonPressed(Buttons button) =>
    _currentPad.IsButtonDown(button) && !_previousPad.IsButtonDown(button);

public bool IsButtonDown(Buttons button) =>
    _currentPad.IsButtonDown(button);

/// <summary>
/// Left thumbstick as Vector2. X = left/right, Y = up/down.
/// Values range from -1 to 1. Apply deadzone before using.
/// </summary>
public Vector2 LeftStick => _currentPad.ThumbSticks.Left;

/// <summary>
/// Triggers return 0.0 (not pressed) to 1.0 (fully pressed).
/// </summary>
public float LeftTrigger => _currentPad.Triggers.Left;
```

### Thumbstick Deadzone

XNA/FNA apply a default deadzone to thumbsticks. You can control this with the `GamePadDeadZone` parameter:

```csharp
// IndependentAxes applies deadzone per-axis (default)
var state = GamePad.GetState(PlayerIndex.One, GamePadDeadZone.IndependentAxes);

// Circular applies deadzone as a radial zone (better for 360° movement)
var state = GamePad.GetState(PlayerIndex.One, GamePadDeadZone.Circular);

// None gives raw values — apply your own deadzone
var state = GamePad.GetState(PlayerIndex.One, GamePadDeadZone.None);
```

### Custom Deadzone Implementation

```csharp
/// <summary>
/// Apply a radial deadzone to a thumbstick vector.
/// Values below the threshold are zeroed; values above are rescaled
/// to use the full 0-1 range.
/// </summary>
public static Vector2 ApplyRadialDeadzone(Vector2 stick, float deadzone = 0.25f)
{
    float magnitude = stick.Length();
    if (magnitude < deadzone)
        return Vector2.Zero;

    // Rescale so the edge of the deadzone maps to 0
    var normalized = stick / magnitude;
    float rescaled = (magnitude - deadzone) / (1f - deadzone);
    return normalized * Math.Min(rescaled, 1f);
}
```

### Vibration / Rumble

```csharp
// Set rumble — leftMotor and rightMotor range from 0.0 to 1.0
// leftMotor = low-frequency rumble, rightMotor = high-frequency rumble
GamePad.SetVibration(PlayerIndex.One, leftMotor: 0.5f, rightMotor: 0.25f);

// Stop rumble
GamePad.SetVibration(PlayerIndex.One, 0f, 0f);
```

## 5 — TextInputEXT — Text Entry Events

`TextInputEXT` is FNA's extension for proper text input. Unlike polling `Keyboard.GetState()`, it handles key repeats, IME composition, and produces the correct character for the current keyboard layout.

### Setup

```csharp
using Microsoft.Xna.Framework.Input;

public class TextInputHandler
{
    private string _inputBuffer = string.Empty;
    private bool _isActive;

    public void StartTextInput()
    {
        _isActive = true;
        TextInputEXT.TextInput += OnTextInput;
        TextInputEXT.StartTextInput();
    }

    public void StopTextInput()
    {
        _isActive = false;
        TextInputEXT.TextInput -= OnTextInput;
        TextInputEXT.StopTextInput();
    }

    private void OnTextInput(char character)
    {
        if (!_isActive) return;

        switch (character)
        {
            case '\b': // Backspace
                if (_inputBuffer.Length > 0)
                    _inputBuffer = _inputBuffer[..^1];
                break;

            case '\r': // Enter
            case '\n':
                OnSubmit(_inputBuffer);
                _inputBuffer = string.Empty;
                break;

            case '\t': // Tab
                _inputBuffer += "    ";
                break;

            default:
                if (!char.IsControl(character))
                    _inputBuffer += character;
                break;
        }
    }

    private void OnSubmit(string text)
    {
        // Handle submitted text (chat message, console command, etc.)
    }

    public string CurrentText => _inputBuffer;
}
```

### Important Notes

- Always call `TextInputEXT.StartTextInput()` before subscribing to events and `StopTextInput()` when done. On some platforms, this toggles the on-screen keyboard.
- The `TextInput` event fires on the main thread during `FNAPlatform.PollEvents()`, which happens at the start of each `Game.Update()` call.
- Characters arrive as the layout-correct character, not the physical key. On an AZERTY keyboard, pressing the A position produces 'q'.

## 6 — Mouse Extensions — ClickedEXT

`Mouse.ClickedEXT` provides an event-based notification when a mouse button is clicked, which can simplify UI hit-testing.

```csharp
// Subscribe to click events
Mouse.ClickedEXT += OnMouseClicked;

private void OnMouseClicked(int button)
{
    // button: 1 = left, 2 = middle, 3 = right
    var mouseState = Mouse.GetState();
    var clickPos = new Point(mouseState.X, mouseState.Y);

    switch (button)
    {
        case 1: HandleLeftClick(clickPos); break;
        case 3: HandleRightClick(clickPos); break;
    }
}
```

## 7 — GamePad Extensions

FNA adds several extensions to the standard XNA GamePad API:

### GetGUIDEXT — Hardware Identification

```csharp
// Get the hardware GUID for a specific controller
// Useful for identifying controller type (Xbox, PlayStation, Switch, etc.)
string guid = GamePad.GetGUIDEXT(PlayerIndex.One);
```

### GetCapabilitiesEXT — Extended Capabilities

The standard `GamePad.GetCapabilities()` returns XNA-compatible data. FNA's extended version provides additional information about the physical device.

### SetLightBarEXT — PlayStation DualShock/DualSense

```csharp
// Set the light bar color on PlayStation controllers
// Only works on DualShock 4 and DualSense controllers
GamePad.SetLightBarEXT(
    PlayerIndex.One,
    new Color(255, 0, 0) // Red light bar
);
```

### SetTriggerVibrationEXT — Trigger Haptics

```csharp
// Set individual trigger motor vibration (DualSense adaptive triggers)
GamePad.SetTriggerVibrationEXT(
    PlayerIndex.One,
    leftTrigger: 0.5f,
    rightTrigger: 0.25f
);
```

## 8 — SDL2 Controller Database

FNA uses SDL2's GameController API, which maps physical joystick inputs to a standard Xbox 360 layout. The mapping database determines how each controller model is mapped.

### Built-in Database

SDL2 ships with a large built-in database of controller mappings. Additionally, it reads Steam's Big Picture Mode database if Steam is running.

### Custom Mappings

Place a `gamecontrollerdb.txt` file in your game's root directory. FNA/SDL2 will load it at startup. Each line maps a controller GUID to a button layout:

```
# Format: GUID,name,mapping
030000005e040000ea02000000000000,Xbox Wireless Controller,a:b0,b:b1,x:b2,y:b3,...
```

You can generate these mappings using the [SDL2 Gamepad Tool](https://www.generalarcade.com/gamepadtool/) or from the community database at [github.com/gabomdq/SDL_GameControllerDB](https://github.com/gabomdq/SDL_GameControllerDB).

### Detecting Unmapped Controllers

If SDL2 doesn't recognize a controller, it falls through to raw joystick mode. You can detect this:

```csharp
// Check if the connected device is recognized as a gamecontroller
// (vs. a raw joystick that SDL2 can't map)
var caps = GamePad.GetCapabilities(PlayerIndex.One);
if (caps.IsConnected && caps.GamePadType == GamePadType.Unknown)
{
    // Unmapped controller — prompt user for custom mapping or
    // fall back to a rebinding UI
}
```

## 9 — Building an Input Abstraction Layer

For games that support both keyboard and gamepad, build an abstraction layer that maps physical inputs to game actions.

```csharp
/// <summary>
/// Game actions that can be triggered by any input device.
/// </summary>
public enum GameAction
{
    MoveUp, MoveDown, MoveLeft, MoveRight,
    Jump, Attack, Interact, Pause,
    MenuUp, MenuDown, MenuConfirm, MenuCancel
}

/// <summary>
/// Unified input system that polls keyboard and gamepad,
/// exposing actions rather than raw inputs.
/// </summary>
public sealed class ActionInputManager
{
    private KeyboardState _currentKb, _previousKb;
    private GamePadState _currentPad, _previousPad;
    private readonly Dictionary<GameAction, Keys[]> _keyboardBindings;
    private readonly Dictionary<GameAction, Buttons[]> _gamepadBindings;
    private float _stickDeadzone = 0.25f;

    public ActionInputManager()
    {
        // Default bindings — make these configurable and serializable
        _keyboardBindings = new()
        {
            [GameAction.MoveUp] = new[] { Keys.W, Keys.Up },
            [GameAction.MoveDown] = new[] { Keys.S, Keys.Down },
            [GameAction.MoveLeft] = new[] { Keys.A, Keys.Left },
            [GameAction.MoveRight] = new[] { Keys.D, Keys.Right },
            [GameAction.Jump] = new[] { Keys.Space },
            [GameAction.Attack] = new[] { Keys.Z },
            [GameAction.Interact] = new[] { Keys.E },
            [GameAction.Pause] = new[] { Keys.Escape },
        };

        _gamepadBindings = new()
        {
            [GameAction.Jump] = new[] { Buttons.A },
            [GameAction.Attack] = new[] { Buttons.X },
            [GameAction.Interact] = new[] { Buttons.B },
            [GameAction.Pause] = new[] { Buttons.Start },
            [GameAction.MenuConfirm] = new[] { Buttons.A },
            [GameAction.MenuCancel] = new[] { Buttons.B },
        };
    }

    public void Update()
    {
        _previousKb = _currentKb;
        _currentKb = Keyboard.GetState();
        _previousPad = _currentPad;
        _currentPad = GamePad.GetState(PlayerIndex.One, GamePadDeadZone.None);
    }

    /// <summary>Action is currently held.</summary>
    public bool IsActionDown(GameAction action)
    {
        if (_keyboardBindings.TryGetValue(action, out var keys))
            foreach (var key in keys)
                if (_currentKb.IsKeyDown(key)) return true;

        if (_gamepadBindings.TryGetValue(action, out var buttons))
            foreach (var button in buttons)
                if (_currentPad.IsButtonDown(button)) return true;

        return false;
    }

    /// <summary>Action was just triggered this frame.</summary>
    public bool IsActionPressed(GameAction action)
    {
        if (_keyboardBindings.TryGetValue(action, out var keys))
            foreach (var key in keys)
                if (_currentKb.IsKeyDown(key) && !_previousKb.IsKeyDown(key))
                    return true;

        if (_gamepadBindings.TryGetValue(action, out var buttons))
            foreach (var button in buttons)
                if (_currentPad.IsButtonDown(button) && !_previousPad.IsButtonDown(button))
                    return true;

        return false;
    }

    /// <summary>
    /// Movement vector combining keyboard WASD and left thumbstick.
    /// Returns a Vector2 with magnitude 0-1.
    /// </summary>
    public Vector2 GetMoveVector()
    {
        var kbMove = Vector2.Zero;
        if (IsActionDown(GameAction.MoveUp)) kbMove.Y -= 1;
        if (IsActionDown(GameAction.MoveDown)) kbMove.Y += 1;
        if (IsActionDown(GameAction.MoveLeft)) kbMove.X -= 1;
        if (IsActionDown(GameAction.MoveRight)) kbMove.X += 1;

        if (kbMove.LengthSquared() > 0)
            kbMove.Normalize();

        // Blend with gamepad stick (take whichever has larger magnitude)
        var stick = ApplyRadialDeadzone(_currentPad.ThumbSticks.Left, _stickDeadzone);
        // XNA thumbstick Y is inverted (up = positive)
        stick.Y = -stick.Y;

        return kbMove.LengthSquared() > stick.LengthSquared() ? kbMove : stick;
    }

    private static Vector2 ApplyRadialDeadzone(Vector2 stick, float deadzone)
    {
        float magnitude = stick.Length();
        if (magnitude < deadzone) return Vector2.Zero;
        var normalized = stick / magnitude;
        float rescaled = (magnitude - deadzone) / (1f - deadzone);
        return normalized * Math.Min(rescaled, 1f);
    }
}
```

## 10 — Touch Input (Mobile/SDL)

FNA supports `TouchPanel` from the XNA API, though it's primarily useful when targeting touch-capable SDL2 platforms.

```csharp
using Microsoft.Xna.Framework.Input.Touch;

// Enable touch gestures
TouchPanel.EnabledGestures = GestureType.Tap | GestureType.FreeDrag | GestureType.Pinch;

// Poll touch state
var touchCollection = TouchPanel.GetState();
foreach (var touch in touchCollection)
{
    switch (touch.State)
    {
        case TouchLocationState.Pressed:
            // Finger just touched
            break;
        case TouchLocationState.Moved:
            // Finger is moving
            break;
        case TouchLocationState.Released:
            // Finger lifted
            break;
    }
}

// Poll gestures
while (TouchPanel.IsGestureAvailable)
{
    var gesture = TouchPanel.ReadGesture();
    switch (gesture.GestureType)
    {
        case GestureType.Tap:
            HandleTap(gesture.Position);
            break;
        case GestureType.Pinch:
            HandlePinchZoom(gesture.Position, gesture.Position2, gesture.Delta, gesture.Delta2);
            break;
    }
}
```

## 11 — Environment Variables for Input

FNA respects several environment variables that affect input behavior:

| Variable | Effect |
|----------|--------|
| `FNA_KEYBOARD_USE_SCANCODES` | `1` (default) = Keys enum maps to physical positions. `0` = Maps to characters (layout-dependent). |
| `FNA_GAMEPAD_NUM_GAMEPADS` | Override the number of gamepads to poll (default: 4). Set to `0` to skip gamepad polling entirely. |
| `SDL_GAMECONTROLLERCONFIG` | Inline gamecontroller mapping string (alternative to `gamecontrollerdb.txt`). |
| `FNA_GRAPHICS_ENABLE_HIGHDPI` | `1` = Enable high-DPI mode, which affects mouse coordinate scaling. |

Set these before the game window is created (e.g., in `Program.Main` before `new Game()`):

```csharp
Environment.SetEnvironmentVariable("FNA_KEYBOARD_USE_SCANCODES", "1");
Environment.SetEnvironmentVariable("FNA_GAMEPAD_NUM_GAMEPADS", "2");
```

## 12 — Common Pitfalls

**Not tracking previous state.** Calling only `GetState()` without comparing to the previous frame means you can't distinguish "pressed this frame" from "held since last frame." Always store both current and previous states.

**Polling input in Draw.** Input should be read in `Update()`, not `Draw()`. With fixed timestep, `Update()` and `Draw()` can run at different rates. Polling in `Draw()` can miss inputs or produce inconsistent behavior.

**Ignoring deadzone on thumbsticks.** Raw thumbstick values drift slightly even when untouched. Always apply a deadzone — either use `GamePadDeadZone.Circular` in `GetState()` or apply your own with `GamePadDeadZone.None`.

**TextInputEXT without Start/Stop.** Subscribing to `TextInputEXT.TextInput` without calling `TextInputEXT.StartTextInput()` first may not deliver events on all platforms. Always bracket text input sessions with `Start`/`Stop` calls.

**Forgetting to unsubscribe events.** FNA extension events (`TextInput`, `ClickedEXT`) are static events. If you subscribe in a game state and don't unsubscribe when leaving, the handler keeps firing. This can cause null references or duplicate input.

**Assuming 4 controllers max.** While the XNA API exposes `PlayerIndex.One` through `Four`, FNA's SDL2 backend can detect more than 4 controllers. If you need more, use SDL2 joystick APIs directly via P/Invoke.

## 13 — Differences from MonoGame Input

| Area | FNA | MonoGame |
|------|-----|----------|
| Scancode behavior | Physical position by default (`FNA_KEYBOARD_USE_SCANCODES=1`) | Layout-dependent by default |
| TextInput extension | `TextInputEXT` (FNA-specific class) | `Window.TextInput` event (different API surface) |
| Mouse click event | `Mouse.ClickedEXT` | Not available (poll only) |
| GamePad light bar | `GamePad.SetLightBarEXT` | Not available |
| Trigger haptics | `GamePad.SetTriggerVibrationEXT` | Not available |
| Max gamepads | 4 via API, more via SDL2 P/Invoke | Up to 8 in MonoGame 3.8.5+ |
| Controller mapping | `gamecontrollerdb.txt` + SDL2 built-in | SDL2 built-in (similar, but MonoGame may override) |
| Touch input | XNA TouchPanel via SDL2 | Platform-native TouchPanel |

When porting between FNA and MonoGame, the core `Keyboard`, `Mouse`, and `GamePad` polling APIs are compatible. The extensions (`*EXT`) are FNA-only and will need conditional compilation or abstraction if you support both frameworks.
