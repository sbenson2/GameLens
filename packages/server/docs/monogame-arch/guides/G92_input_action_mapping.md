# G92 — Input Action Mapping & Rebinding

> **Category:** guide · **Engine:** MonoGame · **Related:** [G7 Input Handling](./G7_input_handling.md) · [G12 Design Patterns](./G12_design_patterns.md) · [G30 Game Feel Tooling](./G30_game_feel_tooling.md) · [G52 Character Controller](./G52_character_controller.md) · [G55 Settings Menu](./G55_settings_menu.md) · [G69 Save/Load Serialization](./G69_save_load_serialization.md)

How to build a hardware-agnostic input action mapping layer in MonoGame. Covers defining logical actions, binding them to physical inputs (keyboard, gamepad, mouse), runtime rebinding with conflict detection, serializing bindings to JSON, and integrating the system with an ECS or scene-based architecture.

---

## The Problem: Hardcoded Input

Most MonoGame tutorials start with direct hardware checks:

```csharp
// ❌ Hardcoded — impossible to rebind, painful to support multiple devices
if (Keyboard.GetState().IsKeyDown(Keys.Space))
    Jump();
if (GamePad.GetState(PlayerIndex.One).Buttons.A == ButtonState.Pressed)
    Jump();
```

This approach has serious limitations:

```
❌ Duplicate logic for every input device
❌ No player rebinding — accessibility and preference issue
❌ Scattered input checks make refactoring fragile
❌ No support for composite inputs (e.g., Shift+Click)
```

The solution is an **action mapping layer** that decouples game logic from physical input.

---

## Architecture Overview

```
Physical Input (Keys, Buttons, Sticks)
        │
        ▼
┌─────────────────────┐
│   InputBinding       │  Maps hardware → action name
│   (Keys.Space → Jump)│
└─────────┬───────────┘
          │
          ▼
┌─────────────────────┐
│   InputAction        │  Logical action with state
│   (Jump: Pressed,    │  (Pressed, Held, Released)
│    Held, Released)   │
└─────────┬───────────┘
          │
          ▼
┌─────────────────────┐
│   Game Systems       │  Query actions, not hardware
│   (player.Jump())    │
└─────────────────────┘
```

---

## Step 1: Define Logical Actions

Use an enum for compile-time safety and fast lookup:

```csharp
/// <summary>
/// All logical input actions in the game.
/// Add new actions here — the binding system maps hardware to these.
/// </summary>
public enum GameAction
{
    MoveUp,
    MoveDown,
    MoveLeft,
    MoveRight,
    Jump,
    Attack,
    Interact,
    Pause,
    Inventory,
    Confirm,    // UI navigation
    Cancel,     // UI navigation
}
```

---

## Step 2: Input Binding Data

Each binding maps a `GameAction` to one or more physical inputs. Support multiple bindings per action (e.g., keyboard + gamepad) and multiple actions per binding scenario.

```csharp
/// <summary>
/// Represents a single physical input source.
/// Exactly one field should be set — the others remain null/default.
/// </summary>
public class InputSource
{
    public Keys? Key { get; set; }
    public Buttons? Button { get; set; }
    public MouseButton? Mouse { get; set; }

    public override string ToString()
    {
        if (Key.HasValue) return Key.Value.ToString();
        if (Button.HasValue) return Button.Value.ToString();
        if (Mouse.HasValue) return Mouse.Value.ToString();
        return "Unbound";
    }
}

public enum MouseButton { Left, Right, Middle, X1, X2 }

/// <summary>
/// Maps a GameAction to its primary and alternate bindings.
/// Primary is required; alternate is optional (for two-key support).
/// </summary>
public class ActionBinding
{
    public GameAction Action { get; set; }
    public InputSource Primary { get; set; } = new();
    public InputSource? Alternate { get; set; }
}
```

---

## Step 3: The Action Map

The `InputActionMap` holds all bindings and provides the query interface that game systems use instead of raw hardware checks.

```csharp
public class InputActionMap
{
    private readonly Dictionary<GameAction, ActionBinding> _bindings = new();

    // Per-frame state: current and previous
    private readonly HashSet<GameAction> _active = new();
    private readonly HashSet<GameAction> _previousActive = new();

    public InputActionMap(IEnumerable<ActionBinding> defaults)
    {
        foreach (var binding in defaults)
            _bindings[binding.Action] = binding;
    }

    /// <summary>
    /// Call once per frame BEFORE game logic.
    /// Reads raw hardware state and resolves which actions are active.
    /// </summary>
    public void Update()
    {
        _previousActive.Clear();
        foreach (var action in _active)
            _previousActive.Add(action);
        _active.Clear();

        var kb = Keyboard.GetState();
        var gp = GamePad.GetState(PlayerIndex.One);
        var mouse = Microsoft.Xna.Framework.Input.Mouse.GetState();

        foreach (var (action, binding) in _bindings)
        {
            if (IsSourceActive(binding.Primary, kb, gp, mouse) ||
                (binding.Alternate != null &&
                 IsSourceActive(binding.Alternate, kb, gp, mouse)))
            {
                _active.Add(action);
            }
        }
    }

    // --- Query methods: game systems use these ---

    /// <summary>True on the first frame the action is active.</summary>
    public bool IsPressed(GameAction action) =>
        _active.Contains(action) && !_previousActive.Contains(action);

    /// <summary>True every frame the action remains active.</summary>
    public bool IsHeld(GameAction action) =>
        _active.Contains(action);

    /// <summary>True on the first frame the action stops being active.</summary>
    public bool IsReleased(GameAction action) =>
        !_active.Contains(action) && _previousActive.Contains(action);

    private static bool IsSourceActive(
        InputSource source, KeyboardState kb, GamePadState gp, MouseState mouse)
    {
        if (source.Key.HasValue)
            return kb.IsKeyDown(source.Key.Value);
        if (source.Button.HasValue)
            return gp.IsButtonDown(source.Button.Value);
        if (source.Mouse.HasValue)
            return source.Mouse.Value switch
            {
                MouseButton.Left   => mouse.LeftButton == ButtonState.Pressed,
                MouseButton.Right  => mouse.RightButton == ButtonState.Pressed,
                MouseButton.Middle => mouse.MiddleButton == ButtonState.Pressed,
                MouseButton.X1     => mouse.XButton1 == ButtonState.Pressed,
                MouseButton.X2     => mouse.XButton2 == ButtonState.Pressed,
                _ => false,
            };
        return false;
    }
}
```

### Usage in Game Logic

```csharp
// ✅ Hardware-agnostic — works with any bound device
protected override void Update(GameTime gameTime)
{
    _inputMap.Update();

    if (_inputMap.IsPressed(GameAction.Jump))
        _player.StartJump();

    if (_inputMap.IsHeld(GameAction.Attack))
        _player.ChargeAttack(gameTime);

    if (_inputMap.IsReleased(GameAction.Attack))
        _player.ReleaseAttack();

    if (_inputMap.IsPressed(GameAction.Pause))
        TogglePauseMenu();
}
```

---

## Step 4: Runtime Rebinding

Allow players to change bindings from a settings menu. The key challenge is **conflict detection** — two actions sharing the same physical input.

```csharp
public class RebindResult
{
    public bool Success { get; init; }
    public GameAction? ConflictingAction { get; init; }
    public string Message { get; init; } = "";
}

public partial class InputActionMap
{
    /// <summary>
    /// Attempt to rebind an action's primary or alternate slot.
    /// Returns conflict info if another action already uses this source.
    /// </summary>
    public RebindResult TryRebind(
        GameAction action, InputSource newSource, bool isAlternate = false)
    {
        // Check for conflicts
        foreach (var (otherAction, otherBinding) in _bindings)
        {
            if (otherAction == action) continue;

            if (SourceEquals(otherBinding.Primary, newSource) ||
                (otherBinding.Alternate != null &&
                 SourceEquals(otherBinding.Alternate, newSource)))
            {
                return new RebindResult
                {
                    Success = false,
                    ConflictingAction = otherAction,
                    Message = $"'{newSource}' is already bound to {otherAction}."
                };
            }
        }

        // Apply the rebind
        var binding = _bindings[action];
        if (isAlternate)
            binding.Alternate = newSource;
        else
            binding.Primary = newSource;

        return new RebindResult { Success = true, Message = "Binding updated." };
    }

    /// <summary>
    /// Force rebind — swap with conflicting action instead of rejecting.
    /// Useful for "press any key" style rebinding UIs.
    /// </summary>
    public void ForceRebind(
        GameAction action, InputSource newSource, bool isAlternate = false)
    {
        // Remove the source from any other action first
        foreach (var (_, otherBinding) in _bindings)
        {
            if (SourceEquals(otherBinding.Primary, newSource))
                otherBinding.Primary = new InputSource(); // Unbind
            if (otherBinding.Alternate != null &&
                SourceEquals(otherBinding.Alternate, newSource))
                otherBinding.Alternate = null;
        }

        var binding = _bindings[action];
        if (isAlternate)
            binding.Alternate = newSource;
        else
            binding.Primary = newSource;
    }

    private static bool SourceEquals(InputSource a, InputSource b) =>
        a.Key == b.Key && a.Button == b.Button && a.Mouse == b.Mouse;
}
```

---

## Step 5: Serialization (Save/Load Bindings)

Persist player bindings to JSON so they survive between sessions. Use `System.Text.Json` (included in .NET 8+).

```csharp
using System.Text.Json;

public static class InputBindingSerializer
{
    private static readonly JsonSerializerOptions JsonOpts = new()
    {
        WriteIndented = true,
        Converters = { new JsonStringEnumConverter() }
    };

    /// <summary>
    /// Save current bindings to a JSON file.
    /// Typical path: Path.Combine(Environment.GetFolderPath(
    ///     Environment.SpecialFolder.LocalApplicationData),
    ///     "MyGame", "input-bindings.json")
    /// </summary>
    public static void Save(
        IEnumerable<ActionBinding> bindings, string filePath)
    {
        var json = JsonSerializer.Serialize(bindings.ToList(), JsonOpts);
        Directory.CreateDirectory(Path.GetDirectoryName(filePath)!);
        File.WriteAllText(filePath, json);
    }

    /// <summary>
    /// Load bindings from JSON. Returns null if file doesn't exist
    /// (caller should fall back to defaults).
    /// </summary>
    public static List<ActionBinding>? Load(string filePath)
    {
        if (!File.Exists(filePath)) return null;
        var json = File.ReadAllText(filePath);
        return JsonSerializer.Deserialize<List<ActionBinding>>(json, JsonOpts);
    }
}
```

### Example JSON Output

```json
[
  {
    "Action": "Jump",
    "Primary": { "Key": "Space" },
    "Alternate": { "Button": "A" }
  },
  {
    "Action": "Attack",
    "Primary": { "Mouse": "Left" },
    "Alternate": { "Button": "X" }
  }
]
```

---

## Step 6: Default Binding Profiles

Provide sensible defaults and allow switching between profiles (e.g., "WASD", "Arrow Keys", "Gamepad Only").

```csharp
public static class DefaultBindings
{
    public static List<ActionBinding> WasdProfile() => new()
    {
        new() { Action = GameAction.MoveUp,    Primary = new() { Key = Keys.W } },
        new() { Action = GameAction.MoveDown,  Primary = new() { Key = Keys.S } },
        new() { Action = GameAction.MoveLeft,  Primary = new() { Key = Keys.A } },
        new() { Action = GameAction.MoveRight, Primary = new() { Key = Keys.D } },
        new() { Action = GameAction.Jump,
                Primary = new() { Key = Keys.Space },
                Alternate = new() { Button = Buttons.A } },
        new() { Action = GameAction.Attack,
                Primary = new() { Mouse = MouseButton.Left },
                Alternate = new() { Button = Buttons.X } },
        new() { Action = GameAction.Interact,
                Primary = new() { Key = Keys.E },
                Alternate = new() { Button = Buttons.Y } },
        new() { Action = GameAction.Pause,
                Primary = new() { Key = Keys.Escape },
                Alternate = new() { Button = Buttons.Start } },
    };

    public static List<ActionBinding> GamepadProfile() => new()
    {
        new() { Action = GameAction.Jump,     Primary = new() { Button = Buttons.A } },
        new() { Action = GameAction.Attack,   Primary = new() { Button = Buttons.X } },
        new() { Action = GameAction.Interact, Primary = new() { Button = Buttons.Y } },
        new() { Action = GameAction.Pause,    Primary = new() { Button = Buttons.Start } },
        // Movement uses analog stick — handled separately via thumbstick axis
    };
}
```

---

## Analog Axis Support

Thumbsticks and triggers need separate handling since they produce float values, not binary pressed/released states.

```csharp
public class AxisMapping
{
    public string Name { get; set; } = "";
    public float DeadZone { get; set; } = 0.15f;

    /// <summary>
    /// Read the current axis value, applying dead zone.
    /// Returns a value in [-1, 1] for sticks, [0, 1] for triggers.
    /// </summary>
    public float GetValue(GamePadState gp)
    {
        var raw = Name switch
        {
            "LeftStickX"   => gp.ThumbSticks.Left.X,
            "LeftStickY"   => gp.ThumbSticks.Left.Y,
            "RightStickX"  => gp.ThumbSticks.Right.X,
            "RightStickY"  => gp.ThumbSticks.Right.Y,
            "LeftTrigger"  => gp.Triggers.Left,
            "RightTrigger" => gp.Triggers.Right,
            _ => 0f,
        };

        // Apply dead zone — prevents drift from worn controllers
        if (MathF.Abs(raw) < DeadZone) return 0f;

        // Rescale so the usable range is still [0, 1] after dead zone
        var sign = MathF.Sign(raw);
        return sign * (MathF.Abs(raw) - DeadZone) / (1f - DeadZone);
    }
}
```

---

## Integration with ECS (Arch)

If you use an ECS like Arch, inject input state as a shared resource rather than passing the action map through constructors:

```csharp
// Shared resource — one per world
public struct InputState
{
    public InputActionMap ActionMap;
    public Vector2 MoveAxis;      // Combined WASD / stick direction
    public Vector2 AimDirection;  // Mouse or right stick
}

// In your game setup:
world.AddResource(new InputState { ActionMap = actionMap });

// In any system — query the resource, not the hardware:
public void PlayerMovementSystem(ref InputState input, ref Position pos, ref Velocity vel)
{
    if (input.ActionMap.IsPressed(GameAction.Jump))
        vel.Y = -JumpForce;

    vel.X = input.MoveAxis.X * MoveSpeed;
}
```

---

## Rebinding UI Flow

A typical settings-screen rebinding flow:

1. Player selects an action (e.g., "Jump") from the list.
2. UI shows "Press any key…" prompt.
3. On the next frame any input is detected, capture the `InputSource`.
4. Call `TryRebind()` — if conflict, show a confirmation dialog ("Swap with Attack?").
5. On confirm, call `ForceRebind()`.
6. Auto-save bindings via `InputBindingSerializer.Save()`.

> **Tip:** During the "listening" state, stop processing gameplay input. Set a flag like `_isListeningForRebind` and skip the normal `InputActionMap.Update()` call.

---

## Gotchas

| Issue | Solution |
|-------|----------|
| `GamePad.GetState()` returns disconnected state | Check `GamePadState.IsConnected` before reading buttons |
| Keyboard ghosting (some key combos don't register) | Limit simultaneous bindings to 2–3 keys; warn players about known ghosting pairs |
| Analog stick drift triggers digital actions | Use a dead zone (0.15–0.25) before converting stick to digital press |
| Bindings file corrupted | Wrap `Load()` in try/catch, fall back to defaults, log the error |
| Adding new actions in an update | Merge saved bindings with defaults — new actions get default bindings, existing bindings are preserved |

---

## Summary

The action mapping pattern creates a clean boundary between hardware and game logic. Game systems query logical actions (`IsPressed(GameAction.Jump)`) instead of physical keys, making your code device-agnostic, rebindable, and testable. Serialize bindings to JSON for persistence, provide default profiles, and handle conflicts gracefully in the rebinding UI.
