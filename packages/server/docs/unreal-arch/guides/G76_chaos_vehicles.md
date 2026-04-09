# Chaos Vehicles System

> **Category:** guide · **Engine:** Unreal Engine · **Related:** [G6 Physics & Collision](G6_physics_and_collision.md), [G31 Chaos Destruction](G31_chaos_destruction.md), [G2 Enhanced Input](G2_enhanced_input.md)

The Chaos Vehicles plugin provides a full vehicle physics simulation built on Unreal's Chaos physics engine. It replaces the legacy PhysX vehicle system with a more flexible, data-driven approach supporting wheeled vehicles, motorcycles, tracked vehicles, and (in UE 5.5+) modular vehicle construction. The system handles engine power, transmission, suspension, tire friction, aerodynamics, and anti-roll in a unified simulation.

## Architecture Overview

```
AWheeledVehiclePawn
├── USkeletalMeshComponent (vehicle body)
├── UChaosWheeledVehicleMovementComponent
│   ├── Engine simulation (torque curve, RPM)
│   ├── Transmission (gears, shift points, auto/manual)
│   ├── Differential (open, limited-slip, front/rear/4WD)
│   ├── Suspension (per-wheel spring/damper)
│   ├── Tire friction model (per-surface)
│   └── Aerodynamics (drag, downforce)
├── UChaosVehicleWheel (× 4 or more)
│   ├── Wheel radius & width
│   ├── Suspension travel (max raise/drop)
│   ├── Friction multiplier
│   └── Brake/handbrake torque
└── USpringArmComponent + UCameraComponent (chase cam)
```

## Getting Started

### Enable the Plugin

1. **Edit > Plugins** > search "Chaos Vehicles" > Enable
2. Restart the editor
3. The `ChaosVehicles` module is now available in C++ and Blueprint

### Create a Vehicle Blueprint

1. Content Browser > right-click > **Blueprint Class**
2. Search for `WheeledVehiclePawn` as the parent class
3. The Blueprint comes pre-configured with a `ChaosWheeledVehicleMovementComponent`

### AWheeledVehiclePawn (C++)

```cpp
#include "WheeledVehiclePawn.h"
#include "ChaosWheeledVehicleMovementComponent.h"

// AWheeledVehiclePawn is your base class
// Access the movement component:
UChaosWheeledVehicleMovementComponent* VehicleMovement =
    Cast<UChaosWheeledVehicleMovementComponent>(GetVehicleMovementComponent());
```

## Core Components

### UChaosWheeledVehicleMovementComponent

The central simulation component. All physics tuning happens here.

**Engine Properties:**
| Property | Description | Typical Range |
|----------|-------------|---------------|
| `MaxRPM` | Engine redline | 6000-9000 |
| `EngineIdleRPM` | Idle speed | 700-1200 |
| `MaxTorque` | Peak engine torque (Nm) | 200-800 |
| `TorqueCurve` | Torque vs RPM curve (FRichCurve) | Custom per vehicle |

**Transmission Properties:**
| Property | Description |
|----------|-------------|
| `bAutomaticTransmission` | Auto vs manual shifting |
| `ForwardGearRatios` | Array of gear ratios |
| `ReverseGearRatio` | Reverse gear ratio |
| `FinalDriveRatio` | Final drive multiplier |
| `TransmissionType` | Automatic, Manual |
| `GearAutoShiftUpRPM` | RPM threshold for upshift |
| `GearAutoShiftDownRPM` | RPM threshold for downshift |

**Differential:**
| Property | Description |
|----------|-------------|
| `DifferentialType` | RearWheelDrive, FrontWheelDrive, AllWheelDrive |
| `FrontRearSplit` | Power split for AWD (0.0-1.0) |

### UChaosVehicleWheel

Defines per-wheel physics. Create a Blueprint subclass for each wheel type (front/rear).

```cpp
// Example wheel setup in C++
UCLASS()
class UFrontWheel : public UChaosVehicleWheel
{
    GENERATED_BODY()
public:
    UFrontWheel()
    {
        WheelRadius = 35.0f;       // cm
        WheelWidth = 25.0f;        // cm
        SuspensionMaxRaise = 10.0f; // cm above rest
        SuspensionMaxDrop = 12.0f;  // cm below rest
        bAffectedByHandbrake = false;
        bAffectedBySteering = true;
    }
};

UCLASS()
class URearWheel : public UChaosVehicleWheel
{
    GENERATED_BODY()
public:
    URearWheel()
    {
        WheelRadius = 35.0f;
        WheelWidth = 28.0f;
        SuspensionMaxRaise = 10.0f;
        SuspensionMaxDrop = 12.0f;
        bAffectedByHandbrake = true;
        bAffectedBySteering = false;
    }
};
```

### Suspension Tuning

Each wheel has independent suspension parameters:

| Parameter | Description | Unit |
|-----------|-------------|------|
| `SpringRate` | Spring stiffness | N/m |
| `SuspensionDampingRatio` | Damping (higher = less bounce) | 0.0-2.0 |
| `SuspensionMaxRaise` | Max upward travel | cm |
| `SuspensionMaxDrop` | Max downward travel | cm |
| `SuspensionSmoothing` | Smoothing factor | 0 (off) - 10 (max) |
| `SweepShape` | Raycast or Spherecast | Enum |

**Tuning guidelines:**
- **Sports car:** High spring rate (80,000-120,000 N/m), low damping ratio (0.5-0.8), minimal travel
- **Off-road truck:** Low spring rate (30,000-50,000 N/m), moderate damping (0.8-1.2), large travel (20+ cm)
- **Racing:** Very high spring rate, damping ratio near 1.0 (critically damped), minimal body roll

## Input Setup

Wire Enhanced Input to the vehicle movement component:

```cpp
void AMyVehicle::SetupPlayerInputComponent(UInputComponent* PlayerInputComponent)
{
    Super::SetupPlayerInputComponent(PlayerInputComponent);

    UEnhancedInputComponent* EIC =
        Cast<UEnhancedInputComponent>(PlayerInputComponent);

    EIC->BindAction(ThrottleAction, ETriggerEvent::Triggered, this,
        &AMyVehicle::HandleThrottle);
    EIC->BindAction(SteeringAction, ETriggerEvent::Triggered, this,
        &AMyVehicle::HandleSteering);
    EIC->BindAction(BrakeAction, ETriggerEvent::Triggered, this,
        &AMyVehicle::HandleBrake);
    EIC->BindAction(HandbrakeAction, ETriggerEvent::Triggered, this,
        &AMyVehicle::HandleHandbrake);
}

void AMyVehicle::HandleThrottle(const FInputActionValue& Value)
{
    GetVehicleMovementComponent()->SetThrottleInput(Value.Get<float>());
}

void AMyVehicle::HandleSteering(const FInputActionValue& Value)
{
    GetVehicleMovementComponent()->SetSteeringInput(Value.Get<float>());
}

void AMyVehicle::HandleBrake(const FInputActionValue& Value)
{
    GetVehicleMovementComponent()->SetBrakeInput(Value.Get<float>());
}

void AMyVehicle::HandleHandbrake(const FInputActionValue& Value)
{
    GetVehicleMovementComponent()->SetHandbrakeInput(Value.Get<bool>());
}
```

## Chaos Modular Vehicles (UE 5.5+)

UE 5.5 introduced the **Modular Vehicle** system, an experimental evolution of ChaosVehicles that allows assembling vehicles from discrete simulation modules rather than a single monolithic movement component.

### Key Differences from Classic Chaos Vehicles

| Feature | Classic | Modular |
|---------|---------|---------|
| Configuration | Single movement component | Composable modules |
| Vehicle types | Primarily wheeled | Wheeled, tracked, hover, hybrid |
| Suspension | Per-wheel only | Per-module, stackable |
| Extensibility | Subclass UChaosWheeledVehicleMovementComponent | Add/remove simulation modules |

### Modular Setup

Instead of a single `UChaosWheeledVehicleMovementComponent`, modular vehicles use a base `UModularVehicleBaseComponent` with attached simulation modules:

- **Wheel Module** — Handles individual wheel physics
- **Suspension Module** — Spring/damper per attach point
- **Engine Module** — Torque generation
- **Transmission Module** — Gear ratios and shifting
- **Aerofoil Module** — Aerodynamic surfaces (wings, spoilers)
- **Thruster Module** — Jet/rocket propulsion for hover vehicles

This is experimental as of UE 5.5-5.7. The classic `AWheeledVehiclePawn` remains the stable, recommended path for standard wheeled vehicles.

## Physical Surfaces & Tire Friction

Chaos Vehicles integrate with Unreal's Physical Material system for surface-dependent tire behavior:

```cpp
// In your Physical Material asset
// Set Surface Type to a custom enum value (e.g., Asphalt, Gravel, Ice)

// In your wheel class, override friction per surface
// Or use the Tire Friction data asset to define friction multipliers
// per wheel type / surface type combination
```

| Surface | Friction Multiplier | Notes |
|---------|-------------------|-------|
| Dry Asphalt | 1.0 | Baseline |
| Wet Asphalt | 0.7 | Reduced grip |
| Gravel | 0.5 | Loose surface |
| Ice | 0.15 | Minimal traction |
| Grass | 0.6 | Moderate, variable |

## Networking

For multiplayer vehicle games, Chaos Vehicles replicate through the standard movement component replication:

- **Server-authoritative:** Server simulates physics, clients receive corrections
- **Client prediction:** Clients run local simulation and reconcile with server state
- Set `bReplicateMovement = true` on the vehicle pawn
- Consider reducing physics substep count on clients for performance

## Debugging & Profiling

### Console Commands

```
// Show vehicle debug info on screen
p.Vehicle.ShowDebug 1

// Show suspension raycasts
p.Vehicle.ShowSuspension 1

// Show tire friction data
p.Vehicle.ShowTireFriction 1
```

### Common Issues

1. **Vehicle flipping on spawn** — Ensure the skeletal mesh's root bone is at the correct height relative to wheel contact points. The center of mass should be low.
2. **Bouncy suspension** — Increase `SuspensionDampingRatio` toward 1.0. Values below 0.5 cause excessive oscillation.
3. **No engine sound** — Chaos Vehicles don't include audio. Wire `GetVehicleMovementComponent()->GetEngineRotationSpeed()` to your audio system (MetaSounds recommended).
4. **Wheels clipping through ground** — Increase suspension `SweepShape` radius or switch from Raycast to Spherecast.
5. **Vehicle slides on slopes** — Increase static friction multiplier or add brake torque when throttle is zero.

## Version History

| Version | Changes |
|---------|---------|
| UE 5.0 | Chaos Vehicles replace PhysX vehicles |
| UE 5.1 | Stability improvements, better networking |
| UE 5.3 | Anti-roll bar support, improved tire model |
| UE 5.5 | Modular Vehicles (Experimental), improved suspension |
| UE 5.7 | Modular Vehicle settings examples, continued refinement |
