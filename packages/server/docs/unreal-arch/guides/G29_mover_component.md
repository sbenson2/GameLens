# G29 — Mover Component: Next-Gen Character Movement

> **Category:** guide · **Engine:** Unreal Engine 5.4+ · **Related:** [G1 Gameplay Framework](G1_gameplay_framework.md) · [G2 Enhanced Input](G2_enhanced_input.md) · [G5 Networking & Replication](G5_networking_replication.md) · [Unreal Rules](../unreal-arch-rules.md)

The **Mover plugin** (`UMoverComponent`) is Unreal Engine's next-generation character movement system, introduced experimentally in UE 5.4. It is designed to eventually replace `UCharacterMovementComponent` (CMC), offering a modular, data-driven architecture with built-in rollback networking. Unlike the CMC, which is tightly coupled to `ACharacter`, the Mover system works on **any Actor class**. This guide covers architecture, C++ setup, custom movement modes, networking, and migration from CMC.

> **Status (UE 5.5+):** The Mover plugin is **experimental**. Epic uses it in the Game Animation Sample project. The API is stabilizing but may change between engine versions. Enable the **Mover** plugin in Edit → Plugins before use.

---

## Why Mover Over CharacterMovementComponent?

The CMC was designed in the UE3 era. While powerful, it has significant architectural limitations:

- **Tied to ACharacter** — cannot be used on generic Actors (vehicles, drones, possessed AI)
- **Monolithic** — a single 10,000+ line class handles walking, swimming, flying, falling, and networking in one file
- **Hard to extend** — adding a custom movement mode requires overriding deep internals
- **Networking is interleaved** — movement prediction and correction logic is mixed into the movement code itself
- **No composability** — you cannot mix and match movement behaviors

The Mover plugin addresses all of these:

| Feature | CMC | Mover |
|---------|-----|-------|
| Requires `ACharacter` | Yes | No — works on any `AActor` |
| Movement modes | Enum-based, hard to extend | Gameplay Tag-based, fully modular |
| Custom modes | Override virtual functions | Create standalone `UBaseMovementMode` classes |
| Networking | Interleaved with movement logic | Separate rollback layer via Network Prediction or Chaos Physics |
| Composability | Single monolith | Stack multiple backends and modes |
| Data-driven | Limited | Movement modes configurable via data assets |

---

## Architecture Overview

```
┌──────────────────────────────────────────────────────────┐
│                        AActor                            │
│                                                          │
│  ┌──────────────────────────────────────────────────┐   │
│  │            UMoverComponent                        │   │
│  │  • Owns the movement simulation tick              │   │
│  │  • Manages active movement mode (via Gameplay Tag)│   │
│  │  • Holds FMoverTickEndData (final transforms)     │   │
│  │  • Routes input proposals to active mode          │   │
│  │                                                    │   │
│  │  ┌──────────────────────────────────────────┐     │   │
│  │  │  UBaseMovementMode (active)              │     │   │
│  │  │  e.g. UGroundMovementMode               │     │   │
│  │  │  • GenerateMove() — produces movement    │     │   │
│  │  │  • SimulationTick() — runs physics step  │     │   │
│  │  └──────────────────────────────────────────┘     │   │
│  │                                                    │   │
│  │  ┌──────────────────────────────────────────┐     │   │
│  │  │  UMovementMixer                          │     │   │
│  │  │  • Blends outputs from multiple backends │     │   │
│  │  └──────────────────────────────────────────┘     │   │
│  └──────────────────────────────────────────────────┘   │
│                                                          │
│  ┌──────────────────────────────────────────────────┐   │
│  │  UCharacterMoverComponent (optional subclass)     │   │
│  │  • Adds jumping, crouching, montage replication   │   │
│  │  • Provides CMC-like defaults for classic chars   │   │
│  └──────────────────────────────────────────────────┘   │
└──────────────────────────────────────────────────────────┘
```

### Key Classes

| Class | Role |
|-------|------|
| `UMoverComponent` | Core component. Owns tick, manages modes, processes input. |
| `UCharacterMoverComponent` | Subclass of `UMoverComponent` with ACharacter-like defaults (jump, crouch, simple montage replication). Use this for traditional character setups. |
| `UBaseMovementMode` | Abstract base for movement modes. Subclass this for custom movement. |
| `UGroundMovementMode` | Built-in walking/running mode. |
| `UFallingMode` | Built-in airborne/falling mode. |
| `USwimmingMode` | Built-in swimming mode. |
| `UFlyingMovementMode` | Built-in flying mode. |
| `UMovementMixer` | Blends outputs from multiple active backends. |
| `UNavMoverComponent` | AI-specific wrapper that implements `INavMoveInterface` for pathfinding integration. |

---

## Basic Setup in C++

### Step 1: Enable the Plugin

In your `.uproject` file or via Edit → Plugins, enable the **Mover** plugin. Add the module dependency:

```csharp
// MyGame.Build.cs
PublicDependencyModuleNames.AddRange(new string[]
{
    "Mover",          // Core Mover types
    "MoverExamples",  // Optional — example modes and utilities
});
```

### Step 2: Create a Mover-Based Pawn

```cpp
// MoverPawn.h
#pragma once

#include "CoreMinimal.h"
#include "GameFramework/Pawn.h"
#include "MoverComponent.h"
#include "MoverPawn.generated.h"

// WHY APawn and not ACharacter: The Mover system is designed to work on
// any Actor. Using APawn gives us possession and input routing without
// the CMC baggage that ACharacter brings.
UCLASS()
class MYGAME_API AMoverPawn : public APawn
{
    GENERATED_BODY()

public:
    AMoverPawn();

protected:
    // WHY CharacterMoverComponent: It provides sensible defaults for
    // humanoid characters (jump, crouch). Use plain UMoverComponent
    // for non-humanoid actors like vehicles or drones.
    UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Movement")
    TObjectPtr<UCharacterMoverComponent> MoverComp;

    UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Collision")
    TObjectPtr<UCapsuleComponent> CapsuleComp;

    UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Mesh")
    TObjectPtr<USkeletalMeshComponent> MeshComp;
};
```

```cpp
// MoverPawn.cpp
#include "MoverPawn.h"
#include "CharacterMoverComponent.h"
#include "Components/CapsuleComponent.h"

AMoverPawn::AMoverPawn()
{
    // Collision capsule — root component
    CapsuleComp = CreateDefaultSubobject<UCapsuleComponent>(TEXT("Capsule"));
    CapsuleComp->InitCapsuleSize(34.f, 88.f);
    CapsuleComp->SetCollisionProfileName(TEXT("Pawn"));
    SetRootComponent(CapsuleComp);

    // Skeletal mesh
    MeshComp = CreateDefaultSubobject<USkeletalMeshComponent>(TEXT("Mesh"));
    MeshComp->SetupAttachment(CapsuleComp);
    MeshComp->SetRelativeLocation(FVector(0.f, 0.f, -88.f));

    // Mover component — replaces CharacterMovementComponent entirely
    // WHY CreateDefaultSubobject: MoverComponent must be created in the
    // constructor so it's available for Blueprint configuration in the editor.
    MoverComp = CreateDefaultSubobject<UCharacterMoverComponent>(TEXT("MoverComp"));

    // The Mover component needs to know which primitive to sweep for collision.
    MoverComp->SetUpdatedComponent(CapsuleComp);
}
```

### Step 3: Feed Input to the Mover

The Mover system consumes input through **input producers** — objects that generate movement proposals each tick. The simplest approach uses `ProduceInput` on the component:

```cpp
void AMoverPawn::HandleMove(const FInputActionValue& Value)
{
    FVector2D Input = Value.Get<FVector2D>();

    // Convert 2D input to a 3D world-space intent vector
    // WHY controller rotation: Same reason as CMC — decouple camera from facing
    const FRotator YawRot(0, GetControlRotation().Yaw, 0);
    const FVector Forward = FRotationMatrix(YawRot).GetUnitAxis(EAxis::X);
    const FVector Right = FRotationMatrix(YawRot).GetUnitAxis(EAxis::Y);

    FVector Intent = (Forward * Input.Y + Right * Input.X);
    Intent.Normalize();

    // Pass the intent to the Mover system. The active movement mode
    // will decide HOW to translate this intent into actual movement.
    if (MoverComp)
    {
        MoverComp->SetMoveInput(Intent);
    }
}
```

---

## Movement Modes via Gameplay Tags

Unlike the CMC's `EMovementMode` enum, the Mover system uses **Gameplay Tags** to identify movement modes. This makes it fully extensible without modifying engine code.

```cpp
// Built-in mode tags (defined in the Mover plugin)
// Mover.Mode.Ground     — walking, running on surfaces
// Mover.Mode.Falling    — airborne, affected by gravity
// Mover.Mode.Swimming   — in a water volume
// Mover.Mode.Flying     — unconstrained 3D flight

// Your custom modes use your own tag hierarchy:
// MyGame.Movement.WallRunning
// MyGame.Movement.Grappling
// MyGame.Movement.Sliding
```

### Switching Modes

```cpp
// WHY tag-based switching: The Mover system checks the active mode tag
// each tick. Transitions happen by changing the tag — no state machine
// code needed in the component itself.
void AMoverPawn::StartWallRun()
{
    if (MoverComp)
    {
        FGameplayTag WallRunTag =
            FGameplayTag::RequestGameplayTag(TEXT("MyGame.Movement.WallRunning"));
        MoverComp->TryActivateMode(WallRunTag);
    }
}
```

---

## Creating a Custom Movement Mode

Custom movement modes are the primary extension point. Each mode is a standalone `UObject` subclass:

```cpp
// WallRunMode.h
#pragma once

#include "BaseMovementMode.h"
#include "WallRunMode.generated.h"

UCLASS()
class MYGAME_API UWallRunMode : public UBaseMovementMode
{
    GENERATED_BODY()

public:
    // Called each simulation tick to produce a movement delta
    // WHY override SimulationTick: This is where your movement physics live.
    // The Mover system calls this each frame with delta time and current state.
    virtual void SimulationTick(const FSimulationTickParams& Params,
                                FSimulationTickOutput& Output) override;

    // Called to check if this mode should activate
    // WHY OnActivated/OnDeactivated: Clean entry/exit — start wall-run
    // effects on activate, clean up on deactivate.
    virtual void OnActivated() override;
    virtual void OnDeactivated() override;

protected:
    // Wall normal detected by the trace
    FVector WallNormal;

    // How fast the character runs along the wall
    UPROPERTY(EditAnywhere, Category = "WallRun")
    float WallRunSpeed = 800.f;

    // How long the character can wall-run before falling
    UPROPERTY(EditAnywhere, Category = "WallRun")
    float MaxWallRunDuration = 1.5f;

    float WallRunTimer = 0.f;
};
```

```cpp
// WallRunMode.cpp
#include "WallRunMode.h"
#include "MoverComponent.h"

void UWallRunMode::OnActivated()
{
    Super::OnActivated();
    WallRunTimer = 0.f;
    // Trace to find the wall normal (would be set by the transition logic)
}

void UWallRunMode::OnDeactivated()
{
    Super::OnDeactivated();
    WallRunTimer = 0.f;
}

void UWallRunMode::SimulationTick(
    const FSimulationTickParams& Params,
    FSimulationTickOutput& Output)
{
    float DeltaTime = Params.TimeStep.StepMs / 1000.f;
    WallRunTimer += DeltaTime;

    // Exit condition: timer expired or no wall contact
    if (WallRunTimer >= MaxWallRunDuration)
    {
        // Transition to falling — the Mover system handles the mode switch
        FGameplayTag FallingTag =
            FGameplayTag::RequestGameplayTag(TEXT("Mover.Mode.Falling"));
        GetMoverComponent()->TryActivateMode(FallingTag);
        return;
    }

    // WHY project along wall: Wall running means moving perpendicular to
    // the wall normal while maintaining height. Gravity is partially cancelled.
    FVector MoveDir = FVector::CrossProduct(WallNormal, FVector::UpVector);
    MoveDir.Normalize();

    // Apply velocity along the wall
    FVector NewVelocity = MoveDir * WallRunSpeed;
    NewVelocity.Z = 0.f; // Cancel vertical — "sticking" to the wall

    Output.MoveDelta = NewVelocity * DeltaTime;
}
```

### Registering the Mode

Register your mode in the Mover component, either in Blueprints (add to the Modes array) or in C++:

```cpp
AMoverPawn::AMoverPawn()
{
    // ... (previous constructor code) ...

    // Register the wall-run mode with its gameplay tag
    // WHY constructor: Modes must be registered before BeginPlay so the
    // Mover system knows about them during initialization.
    MoverComp->AddMovementModeByClass(
        FGameplayTag::RequestGameplayTag(TEXT("MyGame.Movement.WallRunning")),
        UWallRunMode::StaticClass());
}
```

---

## Networking with Mover

The Mover plugin was designed from the ground up with networking in mind. It supports two networking backends:

| Backend | Best For | How It Works |
|---------|----------|-------------|
| **Network Prediction Plugin** | Gameplay movement (characters, vehicles) | Client-side prediction with server reconciliation and rollback |
| **Chaos Networked Physics** | Physics-driven objects | Full physics rollback for simulated rigid bodies |

### Network Prediction Flow

```
Client                              Server
──────                              ──────
1. Sample input
2. Predict locally (run SimulationTick)
3. Send input + frame to server ──────►
                                    4. Receive input
                                    5. Run authoritative SimulationTick
                                    6. Send correction if diverged ──────►
7. Receive correction
8. Rollback to corrected state
9. Resimulate from correction frame
   using buffered inputs
```

> **WHY built-in rollback:** The CMC implements its own prediction/correction system that's deeply intertwined with movement code. The Mover system separates networking into a dedicated layer, so your `SimulationTick` code doesn't need to know about networking at all — write movement logic once, and it works in single-player, listen server, and dedicated server contexts.

---

## UE 5.5+ Additions

### Spring-Based Walking Modes

UE 5.5 added two new built-in walking modes in the `MoverExamples` plugin:

- **Simple Spring Walking Mode** — simulates movement with two springs (velocity + rotation), each independently configurable for smoothness
- **Smooth Walking Mode** — more complex behavior that can replicate the "feel" of the legacy CMC but with smoother velocity and rotation curves

These are especially useful for third-person characters where smooth acceleration/deceleration curves matter for animation blending.

### NavMoverComponent for AI

`UNavMoverComponent` (UE 5.5+) implements `INavMoveInterface`, enabling AI agents using the Mover system to integrate with the Navigation System and behavior trees. It uses gameplay tags for active movement mode state checks instead of calling functions on the MoverComponent directly.

---

## Migrating from CharacterMovementComponent

| CMC Concept | Mover Equivalent |
|-------------|-----------------|
| `ACharacter` | Any `AActor` with `UMoverComponent` (or `UCharacterMoverComponent` for CMC-like defaults) |
| `EMovementMode::Walking` | `FGameplayTag("Mover.Mode.Ground")` |
| `EMovementMode::Falling` | `FGameplayTag("Mover.Mode.Falling")` |
| `MaxWalkSpeed` | Configured per-mode in the movement mode object |
| `Jump()` / `CanJump()` | `UCharacterMoverComponent` provides jump support; or implement in your custom mode |
| `AddMovementInput()` | `MoverComp->SetMoveInput()` |
| `GetMovementComponent()->Velocity` | `MoverComp->GetVelocity()` |
| Custom movement mode (enum) | Create a `UBaseMovementMode` subclass with its own gameplay tag |

---

## Common Pitfalls

1. **Plugin not enabled.** The Mover system is a plugin, not part of the engine core. If `UMoverComponent` is not found, ensure the Mover plugin is enabled in your `.uproject`.

2. **Using ACharacter with Mover.** `ACharacter` creates its own `UCharacterMovementComponent` in its constructor. Using `UMoverComponent` alongside it causes conflicts. Use `APawn` as your base class instead.

3. **Forgetting SetUpdatedComponent.** The Mover component needs to know which primitive component to sweep. Without `SetUpdatedComponent(CapsuleComp)`, collision detection won't work.

4. **C++ Pawn initialization order.** When implementing Mover in pure C++ (no Blueprint), component initialization order matters. The capsule must be created and set as root before creating the MoverComponent. Blueprint-based setups handle this automatically.

5. **AI pathfinding without NavMoverComponent.** If your AI pawns use the Mover system, add `UNavMoverComponent` alongside `UMoverComponent`. Without it, `MoveToLocation` and behavior tree move tasks won't function.

6. **Mixing CMC and Mover networking.** The Mover system uses the Network Prediction Plugin for its networking layer, which is separate from the CMC's built-in prediction. Don't try to use both on the same pawn.

7. **Expecting API stability.** The Mover plugin is still experimental. Pin your project to a specific engine version and review Mover API changes in the release notes before upgrading.
