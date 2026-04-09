# G2 — Enhanced Input System in Unreal Engine 5

> **Category:** guide · **Engine:** Unreal Engine 5.4+ · **Related:** [Architecture Overview](../architecture/E1_architecture_overview.md) · [Unreal Rules](../unreal-arch-rules.md) · [G1 Gameplay Framework](G1_gameplay_framework.md)

The Enhanced Input System is UE5's replacement for the legacy `BindAction`/`BindAxis` input system. It separates the *what* (Input Actions) from the *how* (key bindings, modifiers, triggers), making input fully data-driven and rebindable without code changes. This guide covers the full setup from asset creation through C++ binding, context switching, modifiers, triggers, and runtime rebinding.

---

## Why Enhanced Input?

The legacy input system bound action names (strings) directly to keys in Project Settings. This caused several problems:

- **No runtime rebinding** without custom code
- **Platform-specific bindings** required `#ifdef` blocks or manual remapping
- **No composability** — you couldn't stack deadzones, inversion, or sensitivity per-binding
- **String-based lookups** caused silent failures on typos

Enhanced Input solves all of these with a layered architecture: **Input Actions** define what the player can do, **Input Mapping Contexts** define which keys trigger those actions, and **Modifiers/Triggers** control how raw input is processed.

---

## Architecture Overview

```
┌─────────────────────────────────────────────────┐
│              Input Mapping Context               │
│              (IMC_Default)                        │
│                                                   │
│  ┌──────────────────────────────────────────┐    │
│  │  IA_Move  ←  WASD (+ Swizzle modifier)  │    │
│  │           ←  Gamepad Left Stick          │    │
│  ├──────────────────────────────────────────┤    │
│  │  IA_Jump  ←  Spacebar                    │    │
│  │           ←  Gamepad Face Button Bottom  │    │
│  ├──────────────────────────────────────────┤    │
│  │  IA_Look  ←  Mouse XY Delta             │    │
│  │           ←  Gamepad Right Stick         │    │
│  └──────────────────────────────────────────┘    │
└─────────────────────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────┐
│            Enhanced Input Subsystem              │
│  Evaluates: Raw Input → Modifiers → Triggers    │
│  Fires: ETriggerEvent (Started, Triggered, etc) │
└──────────────────────┬──────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────┐
│           Your C++ / Blueprint Bindings          │
│  HandleMove(), HandleJump(), HandleLook()        │
└─────────────────────────────────────────────────┘
```

---

## Step-by-Step Setup

### Step 1: Create Input Action Assets

In the Content Browser, right-click → **Input → Input Action**. Create one asset per player action:

| Asset Name | Value Type | Description |
|-----------|-----------|-------------|
| `IA_Move` | `Axis2D` (FVector2D) | Character movement (WASD / left stick) |
| `IA_Jump` | `Digital` (bool) | Jump button |
| `IA_Look` | `Axis2D` (FVector2D) | Camera look (mouse delta / right stick) |
| `IA_Fire` | `Digital` (bool) | Primary fire |
| `IA_Interact` | `Digital` (bool) | Interact with objects |

> **WHY separate assets:** Each action is a standalone data asset. Designers can modify triggers and modifiers per-action without touching code. Actions can be shared across multiple mapping contexts.

### Step 2: Create Input Mapping Context

Right-click → **Input → Input Mapping Context**. Create `IMC_Default`.

Inside `IMC_Default`, add each Input Action and assign key mappings:

**IA_Move:**
- W → Modifiers: `Swizzle Input Axis Values` (YXZ) — converts W key (Y only) to 2D forward
- S → Modifiers: `Swizzle Input Axis Values` (YXZ) + `Negate` — backward movement
- A → Modifiers: `Negate` — left movement
- D → (no modifier needed) — right movement
- Gamepad Left Stick → (no modifier) — already outputs 2D axis

**IA_Jump:**
- Spacebar → (no modifier)
- Gamepad Face Button Bottom → (no modifier)

> **WHY Swizzle?** WASD keys output 1D values (0 or 1). The `Swizzle` modifier maps that 1D value into the correct axis of a 2D vector. Without it, pressing W gives you `(1, 0)` (rightward movement) instead of `(0, 1)` (forward).

### Step 3: Declare C++ References

```cpp
// MyCharacter.h
UCLASS()
class MYGAME_API AMyCharacter : public ACharacter
{
    GENERATED_BODY()

public:
    AMyCharacter();

protected:
    virtual void BeginPlay() override;
    virtual void SetupPlayerInputComponent(UInputComponent* PlayerInputComponent) override;

    // Input Action references — set in the Blueprint child class or via C++ defaults
    // WHY UPROPERTY: These must be visible to the editor so designers can swap
    // actions without recompiling. EditDefaultsOnly keeps them out of per-instance details.
    UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Input")
    TObjectPtr<UInputAction> IA_Move;

    UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Input")
    TObjectPtr<UInputAction> IA_Jump;

    UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Input")
    TObjectPtr<UInputAction> IA_Look;

    UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Input")
    TObjectPtr<UInputAction> IA_Fire;

    // The default mapping context added on BeginPlay
    UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Input")
    TObjectPtr<UInputMappingContext> IMC_Default;

private:
    // Handler functions — called by the Enhanced Input system
    void HandleMove(const FInputActionValue& Value);
    void HandleJump(const FInputActionValue& Value);
    void HandleLook(const FInputActionValue& Value);
    void HandleFire(const FInputActionValue& Value);
};
```

### Step 4: Register the Mapping Context

```cpp
// MyCharacter.cpp
#include "EnhancedInputComponent.h"
#include "EnhancedInputSubsystems.h"

void AMyCharacter::BeginPlay()
{
    Super::BeginPlay();

    // Register the default mapping context with the Enhanced Input subsystem
    // WHY in BeginPlay and not the constructor: The subsystem requires a valid
    // PlayerController and LocalPlayer, which don't exist during construction.
    if (APlayerController* PC = Cast<APlayerController>(GetController()))
    {
        if (UEnhancedInputLocalPlayerSubsystem* Subsystem =
            ULocalPlayer::GetSubsystem<UEnhancedInputLocalPlayerSubsystem>(
                PC->GetLocalPlayer()))
        {
            // Priority 0 = base context. Higher priority contexts override lower ones.
            // WHY priority matters: A "Vehicle" context at priority 1 would override
            // the default movement keys when the player enters a vehicle.
            Subsystem->AddMappingContext(IMC_Default, 0);
        }
    }
}
```

### Step 5: Bind Actions to Functions

```cpp
void AMyCharacter::SetupPlayerInputComponent(UInputComponent* PlayerInputComponent)
{
    Super::SetupPlayerInputComponent(PlayerInputComponent);

    // Cast to Enhanced Input Component — this is guaranteed in UE5 when
    // the Enhanced Input plugin is enabled (it is by default).
    UEnhancedInputComponent* EnhancedInput =
        CastChecked<UEnhancedInputComponent>(PlayerInputComponent);

    // Bind each action to a handler function with the appropriate trigger event.
    //
    // WHY different trigger events:
    // - Triggered: fires every frame the input is active (movement, look)
    // - Started: fires once when the input begins (jump, interact)
    // - Completed: fires once when the input is released (charge attacks)
    
    EnhancedInput->BindAction(IA_Move, ETriggerEvent::Triggered,
        this, &AMyCharacter::HandleMove);

    EnhancedInput->BindAction(IA_Jump, ETriggerEvent::Started,
        this, &AMyCharacter::HandleJump);

    EnhancedInput->BindAction(IA_Look, ETriggerEvent::Triggered,
        this, &AMyCharacter::HandleLook);

    EnhancedInput->BindAction(IA_Fire, ETriggerEvent::Started,
        this, &AMyCharacter::HandleFire);
}
```

### Step 6: Implement Handler Functions

```cpp
void AMyCharacter::HandleMove(const FInputActionValue& Value)
{
    // Value type matches IA_Move's configured type: Axis2D → FVector2D
    FVector2D Input = Value.Get<FVector2D>();

    // Move relative to where the player is LOOKING (controller rotation),
    // not where the character mesh is FACING.
    // WHY: Third-person cameras often don't match character facing direction.
    const FRotator YawRotation(0, GetControlRotation().Yaw, 0);
    const FVector ForwardDir = FRotationMatrix(YawRotation).GetUnitAxis(EAxis::X);
    const FVector RightDir = FRotationMatrix(YawRotation).GetUnitAxis(EAxis::Y);

    AddMovementInput(ForwardDir, Input.Y);
    AddMovementInput(RightDir, Input.X);
}

void AMyCharacter::HandleJump(const FInputActionValue& Value)
{
    // ACharacter::Jump() handles the actual jump via CharacterMovementComponent.
    // WHY not AddMovementInput: Jumping is a state change (grounded → airborne),
    // not a continuous input. The movement component manages the physics.
    Jump();
}

void AMyCharacter::HandleLook(const FInputActionValue& Value)
{
    FVector2D Input = Value.Get<FVector2D>();

    // AddControllerYawInput/PitchInput modify the PlayerController's rotation.
    // WHY controller rotation: The camera follows the controller, not the Pawn.
    // This decouples look direction from movement direction.
    AddControllerYawInput(Input.X);
    AddControllerPitchInput(Input.Y);
}

void AMyCharacter::HandleFire(const FInputActionValue& Value)
{
    // Delegate to the weapon system
    if (CurrentWeapon)
    {
        CurrentWeapon->Fire();
    }
}
```

---

## Input Modifiers

Modifiers transform raw input values before they reach your handler. They are applied **in order** — each modifier's output feeds into the next.

| Modifier | What It Does | Common Use |
|----------|-------------|------------|
| `Dead Zone` | Ignores input below a threshold | Gamepad stick drift elimination |
| `Negate` | Inverts the value (multiply by -1) | Invert Y-axis, reverse key direction |
| `Swizzle Input Axis Values` | Reorders axis components (e.g., X→Y) | Mapping 1D keys to 2D movement |
| `Scalar` | Multiplies by a constant | Sensitivity scaling |
| `Smooth` | Applies exponential smoothing | Gamepad look smoothing |
| `Response Curve` | Applies a curve to the input | Non-linear stick response |
| `FOV Scaling` | Adjusts sensitivity based on FOV | Aim-down-sights sensitivity |

### Modifier Pipeline Example

For a gamepad right stick look input:

```
Raw Stick Input (0.15, 0.8)
    → Dead Zone (threshold 0.2): (0.0, 0.75)     // X filtered out as drift
    → Scalar (sensitivity 2.5): (0.0, 1.875)       // Amplified
    → Smooth (factor 0.5): (0.0, ~1.4)             // Smoothed over frames
    → Final value sent to HandleLook()
```

You configure this chain directly in the Input Mapping Context asset — no code needed.

---

## Input Triggers

Triggers control **when** an action fires based on the input state. The default trigger is `Down` (fires every frame the input is held), but you can customize this per-binding.

| Trigger | Fires When | Use Case |
|---------|-----------|----------|
| `Down` (default) | Every frame input is active | Movement, continuous fire |
| `Pressed` | Once on initial press | Jump, interact |
| `Released` | Once when input is released | Charge attack release |
| `Hold` | After holding for N seconds | Charged ability, grenade cook |
| `Hold And Release` | On release after holding for N seconds | Bow draw and fire |
| `Tap` | Quick press and release within N seconds | Double-tap dash |
| `Pulse` | Repeatedly at an interval while held | Automatic fire at fixed rate |
| `Combo` | After a sequence of other actions | Fighting game combos |

> **Important UE5.5 note:** The default trigger behavior changed slightly between UE5.4 and UE5.5. In 5.5, an action with **no explicit trigger** uses implicit `Down` behavior. If you explicitly set triggers, only those triggers apply — the implicit `Down` is removed. This can cause `Started` events to not fire as expected if you've mixed explicit and implicit triggers.

---

## Context Switching

Different gameplay states need different input bindings. A player driving a vehicle needs throttle/brake instead of walk/run. Enhanced Input handles this with **multiple mapping contexts at different priorities**.

```cpp
void AMyCharacter::EnterVehicle(AMyVehicle* Vehicle)
{
    if (APlayerController* PC = Cast<APlayerController>(GetController()))
    {
        if (UEnhancedInputLocalPlayerSubsystem* Subsystem =
            ULocalPlayer::GetSubsystem<UEnhancedInputLocalPlayerSubsystem>(
                PC->GetLocalPlayer()))
        {
            // Add the vehicle context at higher priority — it overrides
            // any conflicting bindings from the default context.
            // WHY not remove the default: Some bindings (pause, menu)
            // should work in all contexts. Only conflicting keys are overridden.
            Subsystem->AddMappingContext(IMC_Vehicle, 1);
        }
    }
}

void AMyCharacter::ExitVehicle()
{
    if (APlayerController* PC = Cast<APlayerController>(GetController()))
    {
        if (UEnhancedInputLocalPlayerSubsystem* Subsystem =
            ULocalPlayer::GetSubsystem<UEnhancedInputLocalPlayerSubsystem>(
                PC->GetLocalPlayer()))
        {
            // Remove the vehicle context — default context automatically
            // regains control of the previously overridden keys.
            Subsystem->RemoveMappingContext(IMC_Vehicle);
        }
    }
}
```

### Priority Rules

- Higher priority contexts override lower ones for conflicting keys
- Non-conflicting bindings from lower-priority contexts still work
- Removing a context restores the lower-priority bindings instantly
- Multiple contexts at the same priority: last added wins for conflicts

---

## Runtime Key Rebinding

Enhanced Input supports runtime rebinding through `UEnhancedInputUserSettings` (UE5.3+) or manual `FPlayerMappableKeySlot` manipulation.

```cpp
// Simple approach: swap a key mapping at runtime
void AMyPlayerController::RemapKey(
    UInputMappingContext* Context,
    UInputAction* Action,
    FKey OldKey,
    FKey NewKey)
{
    if (UEnhancedInputLocalPlayerSubsystem* Subsystem =
        ULocalPlayer::GetSubsystem<UEnhancedInputLocalPlayerSubsystem>(
            GetLocalPlayer()))
    {
        // Request a mapping change — the subsystem handles the swap
        FModifyContextOptions Options;
        Options.bIgnoreAllPressedKeysUntilRelease = true;
        // WHY this option: Prevents the "old key release" event from firing
        // on the new binding immediately after rebinding.

        Subsystem->RequestRebuildControlMappings(Options);
    }
}
```

> **Best Practice:** Use `UEnhancedInputUserSettings` (available since UE5.3) for a full settings-menu key rebinding workflow. It handles conflict detection, serialization to save games, and per-player profiles automatically.

---

## Module Dependencies

To use Enhanced Input in C++, add these to your module's `.Build.cs`:

```csharp
PublicDependencyModuleNames.AddRange(new string[]
{
    "EnhancedInput",  // Core Enhanced Input types
    "InputCore",      // FKey, EKeys definitions
});
```

And include these headers:

```cpp
#include "EnhancedInputComponent.h"
#include "EnhancedInputSubsystems.h"
#include "InputActionValue.h"
```

---

## Common Pitfalls

1. **Forgetting to add the Mapping Context.** Binding actions without calling `AddMappingContext()` means no input events fire. The subsystem only evaluates actions that belong to an active context.

2. **Wrong trigger event in BindAction.** Using `Triggered` for a jump means the character jumps every frame the button is held. Use `Started` for one-shot actions.

3. **Not casting to UEnhancedInputComponent.** The default `UInputComponent` doesn't have `BindAction` with `UInputAction*`. You must cast to `UEnhancedInputComponent`.

4. **Modifier order matters.** Dead Zone → Scalar gives different results than Scalar → Dead Zone. The pipeline processes left-to-right.

5. **Missing Swizzle on WASD.** Without `Swizzle`, the W key outputs `(1, 0)` — that's rightward, not forward. This is the most common "my character moves sideways" bug.

6. **UE5.5 trigger behavior change.** Explicitly adding any trigger removes the implicit `Down` trigger. If you add a `Hold` trigger to an action, the `Started` event no longer fires on initial press unless you also add a `Pressed` trigger.

7. **Binding in the constructor.** `SetupPlayerInputComponent` is the correct place. The `PlayerInputComponent` doesn't exist in the constructor and the subsystem isn't available yet.
