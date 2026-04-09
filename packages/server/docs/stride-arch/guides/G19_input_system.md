# G19 — Input System & Virtual Buttons

> **Category:** guide · **Engine:** Stride · **Related:** [G01 Getting Started](./G01_getting_started.md) · [G18 Scripting Patterns](./G18_scripting_patterns.md) · [G05 UI System](./G05_ui_system.md) · [G12 VR & OpenXR](./G12_vr_openxr_development.md)

How to handle input in Stride 4.3 — keyboard, mouse, gamepad, and touch. Covers direct state queries, event-based input, the Virtual Button abstraction for remappable controls, and patterns for building an action-mapped input system suitable for games that ship on multiple platforms.

---

## Input Architecture

All input in Stride flows through the `InputManager`, accessible from any script via `Input`. The manager polls devices each frame and exposes four approaches to reading input, from lowest to highest level:

| Approach | Best For | Example |
|---|---|---|
| State queries | Continuous actions (held keys, analog sticks) | `Input.IsKeyDown(Keys.W)` |
| State change detection | One-shot actions (jump, fire) | `Input.IsKeyPressed(Keys.Space)` |
| Event lists | Processing all events between frames | `Input.KeyEvents` |
| Virtual buttons | Remappable, multi-device action mapping | `Input.GetVirtualButton(0, "Jump")` |

---

## Device Availability

Always check if a device is available before reading it — not all platforms have all devices:

```csharp
public override void Update()
{
    if (Input.HasMouse)
    {
        // Safe to read mouse state
    }

    if (Input.HasKeyboard)
    {
        // Safe to read keyboard state
    }

    if (Input.HasGamePad)
    {
        // At least one gamepad is connected
        var gamePad = Input.DefaultGamePad;
    }

    if (Input.HasPointer)
    {
        // Touch or stylus input available
    }
}
```

---

## Keyboard Input

### State Queries (Held Keys)

Use for continuous actions like movement:

```csharp
public override void Update()
{
    var dt = (float)Game.UpdateTime.Elapsed.TotalSeconds;
    var velocity = Vector3.Zero;

    // IsKeyDown: true every frame the key is held
    if (Input.IsKeyDown(Keys.W)) velocity.Z -= 1f;
    if (Input.IsKeyDown(Keys.S)) velocity.Z += 1f;
    if (Input.IsKeyDown(Keys.A)) velocity.X -= 1f;
    if (Input.IsKeyDown(Keys.D)) velocity.X += 1f;

    if (velocity.LengthSquared() > 0.001f)
    {
        velocity.Normalize();
        Entity.Transform.Position += velocity * Speed * dt;
    }
}
```

### State Change Detection (Pressed/Released)

Use for one-shot actions like jumping or toggling menus:

```csharp
public override void Update()
{
    // IsKeyPressed: true only on the frame the key transitions from up to down
    if (Input.IsKeyPressed(Keys.Space))
        Jump();

    // IsKeyReleased: true only on the frame the key transitions from down to up
    if (Input.IsKeyReleased(Keys.Escape))
        TogglePauseMenu();
}
```

### Modifier Keys

Check modifier state for key combinations:

```csharp
if (Input.IsKeyDown(Keys.LeftCtrl) && Input.IsKeyPressed(Keys.S))
    SaveGame();

if (Input.IsKeyDown(Keys.LeftShift) && Input.IsKeyDown(Keys.W))
    Sprint();
```

### Event List

For text input or when you need every keystroke (including repeats that happen between frames):

```csharp
public override void Update()
{
    foreach (var keyEvent in Input.KeyEvents)
    {
        if (keyEvent.Type == KeyEventType.Pressed)
        {
            Log.Info($"Key pressed: {keyEvent.Key}");
            // Handle text input, debug console, chat, etc.
        }
    }
}
```

---

## Mouse Input

```csharp
public override void Update()
{
    // Absolute position (0,0 = top-left, normalized 0-1)
    Vector2 mousePos = Input.MousePosition;

    // Delta since last frame (for camera rotation)
    Vector2 mouseDelta = Input.MouseDelta;

    // Scroll wheel delta
    float scrollDelta = Input.MouseWheelDelta;

    // Button states — same Pressed/Down/Released pattern as keyboard
    if (Input.IsMouseButtonPressed(MouseButton.Left))
        Fire();

    if (Input.IsMouseButtonDown(MouseButton.Right))
        Aim();

    if (Input.IsMouseButtonReleased(MouseButton.Middle))
        StopPanning();
}
```

### Mouse Lock for First-Person Games

Lock and hide the cursor for FPS-style mouse look:

```csharp
public override void Start()
{
    // Lock cursor to center and hide it
    Input.Mouse.LockPosition = true;
    Game.IsMouseVisible = false;
}

public override void Update()
{
    // MouseDelta works even when locked — gives raw movement
    float yaw = -Input.MouseDelta.X * LookSensitivity;
    float pitch = -Input.MouseDelta.Y * LookSensitivity;

    Entity.Transform.Rotation *= Quaternion.RotationY(yaw);
    // Clamp pitch to prevent camera flipping
    currentPitch = Math.Clamp(currentPitch + pitch, -MathF.PI / 2.2f, MathF.PI / 2.2f);
}

public override void Cancel()
{
    // Restore cursor on script removal
    Input.Mouse.LockPosition = false;
    Game.IsMouseVisible = true;
}
```

---

## Gamepad Input

```csharp
public override void Update()
{
    if (!Input.HasGamePad) return;

    var gamePad = Input.DefaultGamePad;
    var dt = (float)Game.UpdateTime.Elapsed.TotalSeconds;

    // Analog sticks return Vector2 with range -1 to 1
    Vector2 leftStick = gamePad.State.LeftThumb;
    Vector2 rightStick = gamePad.State.RightThumb;

    // Apply dead zone to prevent stick drift
    if (leftStick.Length() > 0.15f)
    {
        Entity.Transform.Position += new Vector3(
            leftStick.X, 0, -leftStick.Y) * Speed * dt;
    }

    // Triggers return 0 to 1
    float leftTrigger = gamePad.State.LeftTrigger;
    float rightTrigger = gamePad.State.RightTrigger;

    // Digital buttons — same Pressed/Down/Released pattern
    if (gamePad.IsButtonPressed(GamePadButton.A))
        Jump();

    if (gamePad.IsButtonDown(GamePadButton.RightShoulder))
        Fire();
}
```

### Multiple Gamepads

Access specific gamepads by index for local multiplayer:

```csharp
public int PlayerIndex { get; set; } = 0; // Set in editor per player

public override void Update()
{
    if (PlayerIndex >= Input.GamePadCount) return;

    var pad = Input.GamePads[PlayerIndex];
    // Use pad for this player's input...
}
```

---

## Virtual Buttons — Remappable Input

Virtual buttons are Stride's input abstraction layer. You define logical actions ("Jump", "Fire", "MoveForward") and bind them to physical inputs. Players can rebind controls, and your game logic never references specific keys.

### Setup

Configure virtual buttons in `Start()`:

```csharp
public class InputSetup : StartupScript
{
    public override void Start()
    {
        // Create a config set if none exists
        Input.VirtualButtonConfigSet ??= new VirtualButtonConfigSet();

        // --- Jump action: Space, Gamepad A ---
        var jumpConfig = new VirtualButtonConfig();
        jumpConfig.Add(new VirtualButtonBinding("Jump", VirtualButton.Keyboard.Space));
        jumpConfig.Add(new VirtualButtonBinding("Jump", VirtualButton.GamePad.A));
        Input.VirtualButtonConfigSet.Add(jumpConfig);

        // --- Move Forward: W, Up Arrow, Left Stick Y ---
        var moveForwardConfig = new VirtualButtonConfig();
        moveForwardConfig.Add(new VirtualButtonBinding(
            "MoveForward", VirtualButton.Keyboard.W));
        moveForwardConfig.Add(new VirtualButtonBinding(
            "MoveForward", VirtualButton.Keyboard.Up));
        moveForwardConfig.Add(new VirtualButtonBinding(
            "MoveForward", VirtualButton.GamePad.LeftThumbAxisY));
        Input.VirtualButtonConfigSet.Add(moveForwardConfig);

        // --- Move Right: D, Right Arrow, Left Stick X ---
        var moveRightConfig = new VirtualButtonConfig();
        moveRightConfig.Add(new VirtualButtonBinding(
            "MoveRight", VirtualButton.Keyboard.D));
        moveRightConfig.Add(new VirtualButtonBinding(
            "MoveRight", VirtualButton.Keyboard.Right));
        moveRightConfig.Add(new VirtualButtonBinding(
            "MoveRight", VirtualButton.GamePad.LeftThumbAxisX));
        Input.VirtualButtonConfigSet.Add(moveRightConfig);

        // --- Fire: Left Mouse, Right Trigger ---
        var fireConfig = new VirtualButtonConfig();
        fireConfig.Add(new VirtualButtonBinding(
            "Fire", VirtualButton.Mouse.Left));
        fireConfig.Add(new VirtualButtonBinding(
            "Fire", VirtualButton.GamePad.RightTrigger));
        Input.VirtualButtonConfigSet.Add(fireConfig);
    }
}
```

### Querying Virtual Buttons

```csharp
public class PlayerActions : SyncScript
{
    public float MoveSpeed { get; set; } = 5f;

    public override void Update()
    {
        var dt = (float)Game.UpdateTime.Elapsed.TotalSeconds;

        // GetVirtualButton returns a float:
        //   Keyboard/mouse buttons: 0 or 1
        //   Gamepad triggers: 0 to 1 (analog)
        //   Gamepad sticks: -1 to 1
        float forward = Input.GetVirtualButton(0, "MoveForward");
        float right = Input.GetVirtualButton(0, "MoveRight");
        float fire = Input.GetVirtualButton(0, "Fire");
        float jump = Input.GetVirtualButton(0, "Jump");

        // Movement — works identically for keyboard and gamepad
        var move = new Vector3(right, 0, -forward);
        if (move.LengthSquared() > 0.01f)
        {
            move.Normalize();
            Entity.Transform.Position += move * MoveSpeed * dt;
        }

        // One-shot actions — check threshold crossing
        if (jump > 0.5f)
            Jump();

        if (fire > 0.5f)
            FireWeapon();
    }
}
```

The first argument to `GetVirtualButton` is the config index (0-based). Use different indices for different player configurations in local multiplayer.

### Limitations of Built-In Virtual Buttons

Stride's `VirtualButton` system is functional but minimal:

- **No built-in pressed/released detection.** `GetVirtualButton` returns the current value — you need to track the previous frame's value yourself to detect transitions.
- **No serialization.** Rebindings are lost on restart unless you save/load the `VirtualButtonConfigSet` yourself.
- **No composite axes.** You can't define "MoveHorizontal" as A/D in one binding — you need separate "MoveLeft" and "MoveRight" actions or track positive/negative separately.

For games that need proper pressed/released detection with virtual buttons:

```csharp
public class InputState
{
    private readonly Dictionary<string, float> _previous = new();
    private readonly Dictionary<string, float> _current = new();

    public void Update(InputManager input, params string[] actions)
    {
        foreach (var action in actions)
        {
            _previous[action] = _current.GetValueOrDefault(action);
            _current[action] = input.GetVirtualButton(0, action);
        }
    }

    // Analog value (0-1 or -1 to 1)
    public float GetValue(string action) => _current.GetValueOrDefault(action);

    // Digital: is the action active this frame?
    public bool IsDown(string action) => _current.GetValueOrDefault(action) > 0.5f;

    // Digital: did the action just activate this frame?
    public bool IsPressed(string action) =>
        _current.GetValueOrDefault(action) > 0.5f &&
        _previous.GetValueOrDefault(action) <= 0.5f;

    // Digital: did the action just deactivate this frame?
    public bool IsReleased(string action) =>
        _current.GetValueOrDefault(action) <= 0.5f &&
        _previous.GetValueOrDefault(action) > 0.5f;
}
```

---

## Touch & Pointer Input

For mobile or touchscreen games, use the pointer API:

```csharp
public override void Update()
{
    // Pointer events cover both touch and mouse
    foreach (var pointerEvent in Input.PointerEvents)
    {
        switch (pointerEvent.EventType)
        {
            case PointerEventType.Pressed:
                // New touch/click — pointerEvent.Position is normalized (0-1)
                HandleTouchStart(pointerEvent.Position);
                break;

            case PointerEventType.Moved:
                // Finger/cursor moved while touching/clicking
                HandleTouchMove(pointerEvent.Position, pointerEvent.DeltaPosition);
                break;

            case PointerEventType.Released:
                HandleTouchEnd(pointerEvent.Position);
                break;
        }
    }
}
```

### Gesture Recognition

Stride includes built-in gesture recognizers for common touch patterns:

```csharp
public override void Start()
{
    // Enable gesture recognition
    Input.Gestures.Add(new GestureConfigDrag());
    Input.Gestures.Add(new GestureConfigFlick());
    Input.Gestures.Add(new GestureConfigTap());
    Input.Gestures.Add(new GestureConfigLongPress());
    Input.Gestures.Add(new GestureConfigComposite()); // Pinch/rotate
}

public override void Update()
{
    foreach (var gesture in Input.GestureEvents)
    {
        switch (gesture.Type)
        {
            case GestureType.Tap:
                var tap = (GestureEventTap)gesture;
                HandleTap(tap.TapPosition);
                break;

            case GestureType.Flick:
                var flick = (GestureEventFlick)gesture;
                HandleFlick(flick.StartPosition, flick.EndPosition);
                break;

            case GestureType.Composite:
                var pinch = (GestureEventComposite)gesture;
                HandlePinchZoom(pinch.DeltaScale);
                HandleTwoFingerRotate(pinch.DeltaRotation);
                break;
        }
    }
}
```

---

## Common Patterns

### Input Context Switching

Disable input in certain game states (menus, cutscenes, dialogue):

```csharp
public enum InputContext { Gameplay, Menu, Dialogue, Cutscene }

public class InputContextManager : SyncScript
{
    public static InputContext CurrentContext { get; set; } = InputContext.Gameplay;

    public override void Update()
    {
        // Toggle pause menu
        if (Input.IsKeyPressed(Keys.Escape))
        {
            CurrentContext = CurrentContext == InputContext.Gameplay
                ? InputContext.Menu
                : InputContext.Gameplay;

            Game.IsMouseVisible = CurrentContext == InputContext.Menu;
            Input.Mouse.LockPosition = CurrentContext == InputContext.Gameplay;
        }
    }
}

// In player controller:
public override void Update()
{
    if (InputContextManager.CurrentContext != InputContext.Gameplay) return;
    // Normal movement code...
}
```

### Input Buffering

Buffer actions for a few frames so players don't miss inputs due to timing:

```csharp
public class BufferedInput
{
    private float _bufferTimeRemaining;
    private const float BufferDuration = 0.1f; // 100ms buffer window

    public bool IsBuffered => _bufferTimeRemaining > 0;

    public void Update(float deltaTime, bool inputPressed)
    {
        if (inputPressed)
            _bufferTimeRemaining = BufferDuration;
        else
            _bufferTimeRemaining -= deltaTime;
    }

    public void Consume() => _bufferTimeRemaining = 0;
}

// Usage in a platformer:
private BufferedInput _jumpBuffer = new();

public override void Update()
{
    var dt = (float)Game.UpdateTime.Elapsed.TotalSeconds;
    _jumpBuffer.Update(dt, Input.IsKeyPressed(Keys.Space));

    if (_jumpBuffer.IsBuffered && IsGrounded())
    {
        Jump();
        _jumpBuffer.Consume(); // Prevent double-jump from buffer
    }
}
```

---

## Performance Notes

- **Prefer state queries over event lists** for simple input checks. Event list iteration allocates more per frame.
- **Check `HasGamePad`/`HasMouse` once** and cache the result, re-checking only when `Input.DeviceAdded` or `Input.DeviceRemoved` fires.
- **Virtual button lookups are string-based.** In hot loops, the string comparison cost is negligible for a handful of actions, but if you have 50+ virtual buttons, consider caching the config index.
