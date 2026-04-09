# G2 — The Input System in Unity 6

> **Category:** guide · **Engine:** Unity 6 (6000.x, Input System 1.6+) · **Related:** [Architecture Overview](../architecture/E1_architecture_overview.md) · [G1 Scene Management](G1_scene_management.md) · [Unity Rules](../unity-arch-rules.md)

The Input System package (`com.unity.inputsystem`) replaces Unity's legacy `UnityEngine.Input` API with a data-driven, device-agnostic architecture. It separates *what* the player can do (**Input Actions**) from *how* those actions are triggered (**Bindings**), making rebinding, multi-device support, and context switching trivial. This guide covers the full setup from asset creation through C# binding, the modifier pipeline, polling vs callbacks, local multiplayer, and common pitfalls.

---

## Why the Input System Package?

The legacy `Input.GetAxis("Horizontal")` / `Input.GetButtonDown("Jump")` API has several fundamental limitations:

- **String-based lookups** — typos fail silently at runtime
- **No runtime rebinding** without writing a custom mapping layer
- **No composability** — deadzones, inversion, and sensitivity require manual code per-input
- **No multiplayer support** — one global `Input` singleton, no per-player separation
- **Tight coupling** — game logic directly references physical keys, breaking when you add gamepad support

The Input System solves all of these with a layered architecture where everything is configurable in data assets.

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────┐
│             Input Action Asset (.inputactions)        │
│                                                       │
│  ┌─────────────────────────────────────────────┐     │
│  │  Action Map: "Gameplay"                      │     │
│  │    ├── Action: Move  (Value, Vector2)        │     │
│  │    │     ├── WASD (Composite) + Processors   │     │
│  │    │     └── Gamepad Left Stick + Dead Zone   │     │
│  │    ├── Action: Jump  (Button)                │     │
│  │    │     ├── Spacebar                        │     │
│  │    │     └── Gamepad South Button            │     │
│  │    └── Action: Look  (Value, Vector2)        │     │
│  │          ├── Mouse Delta                     │     │
│  │          └── Gamepad Right Stick + Dead Zone  │     │
│  ├─────────────────────────────────────────────┤     │
│  │  Action Map: "UI"                            │     │
│  │    ├── Action: Navigate                      │     │
│  │    ├── Action: Submit                        │     │
│  │    └── Action: Cancel                        │     │
│  └─────────────────────────────────────────────┘     │
│                                                       │
│  Control Schemes: "Keyboard&Mouse", "Gamepad"        │
└──────────────────────┬──────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────┐
│           Input System Runtime                        │
│  Raw Device Input → Processors → Interactions         │
│  → Phase Callbacks (started / performed / canceled)   │
└──────────────────────┬──────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────┐
│          Your Game Code (C# handlers)                 │
│  Callbacks or polling — your choice                   │
└─────────────────────────────────────────────────────┘
```

---

## Core Concepts

### Input Actions

An **Input Action** represents something the player can do: Move, Jump, Fire, Interact. Actions are abstract — they have no knowledge of which physical button triggers them. Each action has a **Value Type** that determines the data it produces:

| Value Type | C# Type | Use Case |
|-----------|---------|----------|
| `Button` | `bool` / `float` | Binary press/release (jump, fire, interact) |
| `Value` | `float` | 1D axis (throttle, zoom) |
| `Value` | `Vector2` | 2D axis (movement, camera look) |
| `Value` | `Vector3` | 3D axis (VR hand position) |
| `Pass-Through` | varies | Bypasses conflict resolution — every bound device fires independently |

**Button vs Value:** Button actions skip the initial state check on enable, preventing a phantom "performed" callback if a key happens to be held when the action is enabled. Use Button for discrete presses, Value for continuous input.

### Action Maps

Action Maps group related actions by context. A "Gameplay" map holds Move/Jump/Fire; a "UI" map holds Navigate/Submit/Cancel; a "Vehicle" map holds Throttle/Brake/Steer. Only enabled maps process input — this is how you switch contexts cleanly.

### Bindings

Bindings connect an action to a physical control. One action can have many bindings (keyboard + gamepad + touchscreen). Bindings are configured in the Input Action Asset editor — no code needed for standard setups.

**Composite Bindings** combine multiple keys into one value. The most common is the **2D Vector Composite** (WASD → Vector2):

```
Move (Vector2):
  ├── 2D Vector Composite
  │   ├── Up:    W
  │   ├── Down:  S
  │   ├── Left:  A
  │   └── Right: D
  └── Gamepad Left Stick (direct binding)
```

### Control Schemes

Control Schemes define valid device combinations ("Keyboard & Mouse", "Gamepad") and are used by the `PlayerInput` component for automatic device switching and local multiplayer device assignment.

---

## Action Lifecycle & Phases

Every action progresses through phases that map to three C# callbacks:

```
Disabled  →  Waiting  →  Started  →  Performed  →  Canceled  →  Waiting
                            │                          ▲
                            └──────────────────────────┘
                            (interaction resets)
```

| Callback | When It Fires | Typical Use |
|----------|--------------|-------------|
| `started` | Input begins (key pressed, stick moved past deadzone) | Start charging, begin aiming |
| `performed` | Interaction condition met (default: immediately for Value/Button) | Execute the action (jump, fire) |
| `canceled` | Input released or interaction failed | Release charge, cancel aim |

```csharp
// WHY three callbacks: Different actions need different timing.
// A jump fires on 'performed' (instant press).
// A charge attack starts on 'started', charges during the hold,
// and fires on 'canceled' (release). One action, all three phases.
moveAction.started   += ctx => OnMoveStarted(ctx);
moveAction.performed += ctx => OnMovePerformed(ctx);
moveAction.canceled  += ctx => OnMoveCanceled(ctx);
```

---

## Processors

Processors modify the raw input value before it reaches your code. They are applied **in order** on each binding — the output of one feeds into the next.

| Processor | Effect | Common Use |
|-----------|--------|-----------|
| `StickDeadzone` | Ignores input below a radial threshold | Eliminates gamepad drift |
| `NormalizeVector2` | Normalizes to unit length | Prevents diagonal speed boost |
| `AxisDeadzone` | 1D deadzone for triggers | Trigger threshold |
| `Invert` | Multiplies by -1 | Invert Y-axis |
| `InvertVector2` | Inverts individual axes of Vector2 | Invert look Y |
| `Scale` / `ScaleVector2` | Multiplies by a constant | Sensitivity multiplier |
| `Clamp` | Clamps to a range | Limit stick output |

### Processor Pipeline Example

For a gamepad left stick bound to a Move action:

```
Raw Stick Input (0.12, 0.85)
    → StickDeadzone (min 0.2):  (0.0, 0.81)     // X filtered as drift
    → NormalizeVector2:          (0.0, 1.0)       // Normalized
    → ScaleVector2 (x:1, y:1): (0.0, 1.0)       // (no change here)
    → Final value to performed callback
```

You configure processors per-binding in the Input Action Asset — no code required. To apply processors globally (e.g., sensitivity from a settings menu), set them in code:

```csharp
// WHY set processors at runtime: Player sensitivity settings
// shouldn't require editing the asset. Apply a ScaleVector2
// processor dynamically based on the options menu value.
```

---

## Interactions

Interactions change **when** an action fires by modifying the phase transitions. Without an explicit interaction, the default behavior depends on the action type:

| Interaction | Behavior | Use Case |
|------------|----------|----------|
| (default for Button) | `performed` on press, `canceled` on release | Standard button press |
| (default for Value) | `performed` every frame while active | Continuous movement/look |
| `Hold` | `performed` after holding for N seconds | Charged abilities, grenade cooking |
| `Tap` | `performed` on quick press+release within N seconds | Double-tap dodge |
| `SlowTap` | `performed` on release after holding ≥ N seconds | Deliberate press |
| `MultiTap` | `performed` after N presses within timeout | Double/triple tap |
| `Press` | `performed` on press, release, or both (configurable) | Press-to-toggle |

```csharp
// Example: Hold interaction configured in the asset editor
// Hold time: 0.5 seconds
// 
// Timeline:
// t=0.0  Key pressed   → 'started' fires
// t=0.3  Still held    → nothing yet (below hold threshold)
// t=0.5  Hold met      → 'performed' fires
// t=0.8  Key released  → 'canceled' fires
```

---

## Implementation Approaches

Unity offers several ways to connect actions to code. Choose based on your project's complexity.

### Approach 1: Direct References (Small Projects)

Define `InputAction` fields directly on a MonoBehaviour. Simple, but doesn't scale well.

```csharp
using UnityEngine;
using UnityEngine.InputSystem;

public class SimplePlayerController : MonoBehaviour
{
    // Define actions directly — visible in the Inspector
    // WHY this approach: Zero setup for prototypes. The action is
    // self-contained on the component with no external asset needed.
    [SerializeField] private InputAction _moveAction;
    [SerializeField] private InputAction _jumpAction;

    private void OnEnable()
    {
        // WHY manual Enable/Disable: Actions don't process input unless
        // explicitly enabled. This prevents disabled objects from consuming input.
        _moveAction.Enable();
        _jumpAction.Enable();

        _jumpAction.performed += OnJump;
    }

    private void OnDisable()
    {
        _moveAction.Disable();
        _jumpAction.Disable();

        _jumpAction.performed -= OnJump;
    }

    private void Update()
    {
        // WHY polling for movement: Movement needs a continuous value every frame.
        // Callbacks would also work, but polling is simpler for "read every frame" cases.
        Vector2 move = _moveAction.ReadValue<Vector2>();
        transform.Translate(new Vector3(move.x, 0, move.y) * 5f * Time.deltaTime);
    }

    private void OnJump(InputAction.CallbackContext ctx)
    {
        Debug.Log("Jump!");
    }
}
```

### Approach 2: Generated C# Class (Recommended for Most Projects)

Create an Input Action Asset, configure all actions in the editor, then check **Generate C# Class** in the asset's Inspector. Unity generates a type-safe wrapper class.

```csharp
using UnityEngine;
using UnityEngine.InputSystem;

// WHY generated class: Type-safe action references — no string lookups,
// no manual binding setup. Rename an action in the editor and the compiler
// catches every broken reference. This is the recommended approach for
// any project beyond prototype scale.
public class PlayerController : MonoBehaviour
{
    private GameInputActions _input;  // Generated class from the .inputactions asset

    private void Awake()
    {
        _input = new GameInputActions();
    }

    private void OnEnable()
    {
        // Enable the entire Gameplay action map — all actions within it activate
        _input.Gameplay.Enable();

        _input.Gameplay.Jump.performed += OnJump;
        _input.Gameplay.Fire.performed += OnFire;
    }

    private void OnDisable()
    {
        _input.Gameplay.Jump.performed -= OnJump;
        _input.Gameplay.Fire.performed -= OnFire;

        _input.Gameplay.Disable();
    }

    private void Update()
    {
        // Poll continuous actions (movement, look)
        Vector2 move = _input.Gameplay.Move.ReadValue<Vector2>();
        Vector2 look = _input.Gameplay.Look.ReadValue<Vector2>();

        ApplyMovement(move);
        ApplyLook(look);
    }

    private void OnJump(InputAction.CallbackContext ctx)
    {
        // WHY check phase: In rare cases (multiple interactions on one action),
        // you may receive callbacks during unexpected phases. Guard with a check.
        if (ctx.performed) GetComponent<Rigidbody>().AddForce(Vector3.up * 5f, ForceMode.Impulse);
    }

    private void OnFire(InputAction.CallbackContext ctx)
    {
        // Fire weapon logic
    }

    private void ApplyMovement(Vector2 input) { /* ... */ }
    private void ApplyLook(Vector2 input) { /* ... */ }
}
```

### Approach 3: PlayerInput Component (Local Multiplayer / Designer-Friendly)

The `PlayerInput` component handles action map switching, device assignment, and event routing automatically. Attach it to a player prefab, assign the Input Action Asset, and connect events in the Inspector.

```csharp
using UnityEngine;
using UnityEngine.InputSystem;

// WHY PlayerInput: It handles local multiplayer device splitting automatically.
// When Player 2 presses a button on Gamepad #2, PlayerInput assigns that gamepad
// to Player 2 and spawns a new player prefab. No manual device management needed.
[RequireComponent(typeof(PlayerInput))]
public class MultiplayerCharacter : MonoBehaviour
{
    // These methods are called by PlayerInput via Unity Events or SendMessage.
    // The method name must match "On{ActionName}" when using SendMessage behavior.

    public void OnMove(InputValue value)
    {
        // WHY InputValue (not CallbackContext): The PlayerInput component
        // wraps the callback into a simpler InputValue type for the
        // SendMessage and Unity Events behaviors.
        Vector2 move = value.Get<Vector2>();
        // Apply movement...
    }

    public void OnJump(InputValue value)
    {
        // For button actions, isPressed tells you the current state
        if (value.isPressed)
        {
            // Jump!
        }
    }
}
```

**PlayerInput Behavior Modes:**

| Mode | How It Works | Best For |
|------|-------------|----------|
| `Send Messages` | Calls `On{ActionName}` methods via `SendMessage` | Quick prototyping |
| `Broadcast Messages` | Like SendMessage but includes child GameObjects | Complex hierarchies |
| `Invoke Unity Events` | Exposes events in the Inspector per-action | Designer-friendly wiring |
| `Invoke C# Events` | Fires `onActionTriggered` C# event | Programmatic handling |

---

## Action Map Switching (Context Changes)

Different gameplay states need different input mappings. A player in a vehicle needs Throttle/Brake instead of Move/Jump. A menu needs Navigate/Submit instead of gameplay actions.

```csharp
public class InputContextSwitcher : MonoBehaviour
{
    private GameInputActions _input;

    private void Awake()
    {
        _input = new GameInputActions();
    }

    public void EnterVehicle()
    {
        // WHY disable before enable: Prevents brief overlap where both
        // maps process input simultaneously. A held movement key could
        // trigger both walking and driving for one frame.
        _input.Gameplay.Disable();
        _input.Vehicle.Enable();
    }

    public void ExitVehicle()
    {
        _input.Vehicle.Disable();
        _input.Gameplay.Enable();
    }

    public void OpenMenu()
    {
        // WHY not disable Gameplay: Some games want background gameplay
        // input (e.g., camera still moves while menu is open).
        // Disable selectively based on your design.
        _input.Gameplay.Disable();
        _input.UI.Enable();
    }

    public void CloseMenu()
    {
        _input.UI.Disable();
        _input.Gameplay.Enable();
    }
}
```

With `PlayerInput`, call `SwitchCurrentActionMap("Vehicle")` instead — it handles the disable/enable automatically.

---

## Runtime Rebinding

The Input System provides a built-in interactive rebinding workflow. The player presses "Rebind Jump", then presses any key — the system captures it and updates the binding.

```csharp
using UnityEngine;
using UnityEngine.InputSystem;
using TMPro;

public class RebindUI : MonoBehaviour
{
    [SerializeField] private InputActionReference _actionToRebind;
    [SerializeField] private int _bindingIndex = 0;  // Which binding on the action
    [SerializeField] private TMP_Text _bindingLabel;

    private InputActionRebindingExtensions.RebindingOperation _rebindOperation;

    public void StartRebind()
    {
        // WHY disable the action: An active action would consume the key press
        // instead of letting the rebind system capture it.
        _actionToRebind.action.Disable();

        _bindingLabel.text = "Press a key...";

        _rebindOperation = _actionToRebind.action.PerformInteractiveRebinding(_bindingIndex)
            // Exclude mouse movement — you don't want "move mouse" to accidentally rebind Jump
            .WithControlsExcluding("<Mouse>/position")
            .WithControlsExcluding("<Mouse>/delta")
            .OnComplete(operation =>
            {
                _bindingLabel.text = InputControlPath.ToHumanReadableString(
                    _actionToRebind.action.bindings[_bindingIndex].effectivePath,
                    InputControlPath.HumanReadableStringOptions.OmitDevice
                );

                operation.Dispose();  // WHY Dispose: Rebind operations allocate unmanaged memory
                _actionToRebind.action.Enable();
            })
            .OnCancel(operation =>
            {
                operation.Dispose();
                _actionToRebind.action.Enable();
            })
            .Start();
    }

    /// <summary>
    /// Save all rebindings as a JSON string (e.g., to PlayerPrefs or a file).
    /// WHY JSON overrides: The Input System stores rebindings as override strings
    /// that layer on top of the asset defaults. Saving/loading these overrides
    /// preserves player customization without modifying the asset itself.
    /// </summary>
    public void SaveBindings(InputActionAsset asset)
    {
        string json = asset.SaveBindingOverridesAsJson();
        PlayerPrefs.SetString("InputBindings", json);
    }

    public void LoadBindings(InputActionAsset asset)
    {
        string json = PlayerPrefs.GetString("InputBindings", string.Empty);
        if (!string.IsNullOrEmpty(json))
        {
            asset.LoadBindingOverridesFromJson(json);
        }
    }
}
```

---

## Debugging Input

The Input System includes a powerful debugging tool accessible via **Window → Analysis → Input Debugger**:

- View all connected devices and their current state
- See which actions are enabled and their current phase
- Inspect which control is driving an action (conflict resolution)
- Record and replay input traces with `InputActionTrace`

```csharp
// Trace all activity on a specific action (useful for debugging "why isn't my action firing?")
var trace = new InputActionTrace();
trace.SubscribeTo(myAction);

// ... perform input ...

foreach (var record in trace)
{
    Debug.Log($"{record.action.name} phase:{record.phase} value:{record.ReadValueAsObject()} "
        + $"control:{record.control} time:{record.time}");
}

trace.Dispose();  // WHY: InputActionTrace uses unmanaged memory and must be disposed
```

---

## Common Pitfalls

1. **Forgetting to Enable actions.** Actions are disabled by default. If your input doesn't work, check that the action or action map is enabled. This is the #1 "my input isn't working" issue.

2. **Using the wrong action type.** A Jump action set to `Value` instead of `Button` will fire a phantom `performed` callback when enabled if a key is already held. Use `Button` for discrete presses.

3. **Not disposing `InputActionTrace` / `RebindingOperation`.** Both allocate unmanaged memory. Failing to call `Dispose()` leaks memory.

4. **Diagonal speed boost.** A WASD composite without `NormalizeVector2` processor outputs `(1, 1)` when pressing W+D — that's magnitude 1.41, making diagonal movement 41% faster than cardinal. Add the processor or normalize in code.

5. **Callback context lifetime.** The `InputAction.CallbackContext` struct is only valid during the callback. Storing it for later use reads stale or garbage data. Extract the value immediately: `var value = ctx.ReadValue<Vector2>();`

6. **Multiple PlayerInput components in single-player.** `PlayerInput` is designed for per-player instances. Having two `PlayerInput` components referencing the same asset causes device-assignment conflicts. For single-player, use the generated C# class approach instead.

7. **Mixing old and new Input.** Having both `UnityEngine.Input` (legacy) and `UnityEngine.InputSystem` (new) in the same project works but requires setting **Active Input Handling** to "Both" in Player Settings. Choose one system and commit to it when possible.

8. **SendMessage behavior is slow.** `SendMessage` uses reflection and string matching. For performance-sensitive code, use `Invoke C# Events` or the generated class with direct callbacks.

---

## Quick Reference: Which Approach to Use

| Scenario | Recommended Approach |
|----------|---------------------|
| Prototype / game jam | Direct `InputAction` fields on MonoBehaviour |
| Single-player, medium+ project | Generated C# class from Input Action Asset |
| Local multiplayer | `PlayerInput` component (handles device splitting) |
| Designer-driven event wiring | `PlayerInput` with Invoke Unity Events |
| Full programmatic control | Generated C# class with callback subscriptions |
| UI navigation | Use the built-in `InputSystemUIInputModule` (replaces `StandaloneInputModule`) |
