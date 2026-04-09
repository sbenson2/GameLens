# G64 — Pose Warping & Runtime IK Retargeting

> **Category:** guide · **Engine:** Unreal Engine 5.4+ · **Related:** [G4 Animation System](G4_animation_system.md) · [G22 Motion Matching](G22_motion_matching.md) · [G26 Control Rig](G26_control_rig.md) · [G29 Mover Component](G29_mover_component.md) · [Unreal Rules](../unreal-arch-rules.md)

**Pose Warping** dynamically adjusts a character's animated pose to align with capsule movement at runtime, reducing the number of directional animations needed. **Runtime IK Retargeting** shares animations between characters of different proportions without offline processing. Together, these systems form the backbone of modern UE5 locomotion — used extensively in the Lyra Starter Game and the Game Animation Sample Project (GASP). This guide covers Stride Warping, Orientation Warping, Slope Warping, IK Rig retargeting, and production integration patterns.

---

## Why Pose Warping?

Traditional locomotion requires a separate animation for every speed × direction combination. A character with 8-directional movement at 3 speeds needs 24 locomotion animations — and they still slide when gameplay speed doesn't exactly match animation root motion speed.

Pose Warping solves this by dynamically adjusting the animated pose:

```
┌──────────────────────────────────────────────────────────────┐
│  Without Pose Warping          With Pose Warping              │
│                                                               │
│  24 directional anims          4-8 base anims                 │
│  Foot sliding at speed         + Stride Warping (speed match) │
│    mismatches                  + Orientation Warping (turning) │
│  Pop when changing direction   + Slope Warping (terrain)       │
│                                                               │
│  Result: slide & pop           Result: grounded & responsive   │
└──────────────────────────────────────────────────────────────┘
```

---

## Stride Warping

Stride Warping adjusts the character's step length and play rate to match the actual movement speed, eliminating foot sliding.

### How It Works

1. The animation plays at its authored speed (e.g., a walk cycle at 200 cm/s)
2. Gameplay requests a different speed (e.g., 250 cm/s)
3. Stride Warping scales the leg IK targets outward (longer strides) and slightly increases play rate
4. The combined adjustment matches the animation to the actual capsule velocity

### Animation Blueprint Setup

```
AnimGraph:
  Locomotion State Machine
    → Output Pose
      → Stride Warping (Animation Warping node)
        → Output
```

The **Stride Warping** node in the AnimGraph takes these inputs:

| Parameter | Type | Description |
|-----------|------|-------------|
| `LocomotionSpeed` | float | Current capsule movement speed |
| `StrideDirection` | FVector | Direction of movement in component space |
| `PlayRateClamp` | FVector2D | Min/max play rate multiplier (default: 0.8–1.2) |
| `StrideScaleClamp` | FVector2D | Min/max stride length multiplier |

### Best Practice: The 15–20% Rule

The industry standard (used in Lyra and GASP) is to allow **no more than 15–20% deviation** from the authored animation speed through combined play rate and stride adjustment. Beyond that, the animation looks unnatural.

```
Authored walk speed: 200 cm/s
Acceptable range:    160–240 cm/s (±20%)

If gameplay needs 300 cm/s → switch to jog animation, not warp the walk further
```

### C++ Access

```cpp
#include "Animation/AnimNode_StrideWarping.h"

// In your AnimInstance class, expose the locomotion speed
UPROPERTY(BlueprintReadWrite, Category = "Locomotion")
float LocomotionSpeed = 0.f;

// Update each frame from the movement component
void UMyAnimInstance::NativeUpdateAnimation(float DeltaSeconds)
{
    Super::NativeUpdateAnimation(DeltaSeconds);

    if (const APawn* Pawn = TryGetPawnOwner())
    {
        LocomotionSpeed = Pawn->GetVelocity().Size2D();
    }
}
```

---

## Orientation Warping

Orientation Warping rotates the character's lower body to face the movement direction while keeping the upper body aimed at the look target. This is essential for strafing locomotion in shooters.

### How It Works

```
                    Look Direction (upper body)
                         ↑
                         │
           ┌─────────────┼─────────────┐
           │     Upper body stays       │
           │     aimed at target        │
           │             │              │
           │    ─────────┼──────────    │
           │             │              │
           │     Lower body rotates     │
           │     toward movement dir    │
           └─────────────┼─────────────┘
                         │
                    Movement Direction (lower body)
```

### AnimGraph Node Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| `LocomotionAngle` | float | Angle between character facing and movement direction (degrees) |
| `SpineBones` | TArray | Bones to blend between upper/lower body rotation |
| `DistributeBoneRotations` | bool | Spread the rotation across multiple spine bones for natural twist |

### Calculating Locomotion Angle

```cpp
float UMyAnimInstance::CalculateLocomotionAngle() const
{
    if (const APawn* Pawn = TryGetPawnOwner())
    {
        const FVector Velocity = Pawn->GetVelocity();
        if (Velocity.SizeSquared2D() > KINDA_SMALL_NUMBER)
        {
            const FRotator ActorRotation = Pawn->GetActorRotation();
            const FRotator VelocityRotation = Velocity.Rotation();
            float Angle = FMath::FindDeltaAngleDegrees(
                ActorRotation.Yaw, VelocityRotation.Yaw);
            return Angle;
        }
    }
    return 0.f;
}
```

---

## Slope Warping

Slope Warping adjusts foot placement and pelvis height when the character moves on uneven terrain, preventing feet from clipping through slopes or floating above them.

### Integration with Foot IK

Slope Warping and foot IK (via Control Rig) work together:

1. **Slope Warping** — adjusts the overall pelvis height and leg extension based on the surface normal beneath the character
2. **Foot IK** — performs per-foot trace to plant each foot precisely on the ground
3. The combined result: the character's body adjusts to the slope angle while each foot individually conforms to surface irregularities

### AnimGraph Layering

```
Base Locomotion Pose
  → Stride Warping
    → Orientation Warping
      → Slope Warping
        → Control Rig (Foot IK)
          → Final Output Pose
```

> **Order matters.** Stride and Orientation Warping modify the overall pose. Slope Warping and Foot IK are additive corrections applied after. Reversing the order produces artifacts.

---

## Runtime IK Retargeting

### Overview

IK Retargeting transfers animations between characters of different skeletal proportions at runtime — without preprocessing or offline baking. This is used for:

- Sharing a single locomotion set across NPCs of varying body types
- Player character customization (short/tall characters using the same anims)
- Procedural characters (MetaHuman variants with different proportions)

### Architecture

```
┌───────────────┐          ┌────────────────┐
│ Source IK Rig  │          │ Target IK Rig   │
│ (defines bone  │          │ (maps to target  │
│  chains and    │◀────────▶│  skeleton with   │
│  IK goals)     │  IK      │  different       │
│               │  Retargeter│  proportions)   │
└───────────────┘          └────────────────┘
```

### Setting Up an IK Rig

1. **Create IK Rig asset** for the source skeleton (e.g., Mannequin)
2. Define **bone chains**: Spine, LeftArm, RightArm, LeftLeg, RightLeg, Head
3. Set **IK goals** on end effectors (hands, feet)
4. Repeat for the target skeleton
5. Create an **IK Retargeter** asset that maps source chains → target chains

### Runtime Retargeting API

```cpp
#include "Retargeter/IKRetargeter.h"

// In your character setup
UPROPERTY(EditAnywhere, Category = "Animation")
TObjectPtr<UIKRetargeter> RuntimeRetargeter;

// The retargeter is assigned to the AnimInstance
// via the "Retarget Pose From Mesh" AnimGraph node
```

The **Retarget Pose From Mesh** AnimGraph node enables one character to mirror another's animation at runtime through the IK Retargeter, applying proportion correction automatically.

### UE 5.7 LOD Optimization

UE 5.7 added per-operation **LODThreshold** settings to the IK Retargeter. Each retarget chain can specify the maximum LOD at which it runs:

| LOD Level | Active Chains | Use Case |
|-----------|---------------|----------|
| LOD 0 | All (spine, arms, legs, fingers, head) | Close-up characters |
| LOD 1 | Spine, arms, legs, head (no fingers) | Mid-range |
| LOD 2 | Spine, legs only | Background characters |
| LOD 3+ | Disabled — use source animation directly | Distant crowd |

This prevents retargeting from consuming CPU budget on characters the player can barely see.

---

## GASP Locomotion Architecture (UE 5.7)

The Game Animation Sample Project demonstrates the production integration of these systems with the Mover Plugin:

```
┌────────────────────────────────────────────────────────────┐
│  GASP Locomotion Stack (UE 5.7)                             │
│                                                              │
│  Mover Plugin (movement simulation)                          │
│    ├── Simple Spring Walking Mode                            │
│    ├── Smooth Walking Mode                                   │
│    └── Slide Mode (new in 5.7)                               │
│           │                                                  │
│           ▼                                                  │
│  Motion Matching (pose selection from database)              │
│           │                                                  │
│           ▼                                                  │
│  Pose Warping Stack                                          │
│    ├── Stride Warping (speed matching)                       │
│    ├── Orientation Warping (strafe alignment)                │
│    └── Slope Warping (terrain adaptation)                    │
│           │                                                  │
│           ▼                                                  │
│  Control Rig (procedural IK)                                 │
│    ├── Foot IK (ground contact)                              │
│    └── Hand IK (weapon / prop alignment)                     │
│           │                                                  │
│           ▼                                                  │
│  Final Pose Output                                           │
└────────────────────────────────────────────────────────────┘
```

### GASP 5.7 Additions

- **400 new animations** in the locomotion dataset
- **Two walking modes** built on the Mover Plugin's abstract base class: Simple Spring and Smooth Walking, extensible in C++ or Blueprint
- **Slide mechanic** — characters slide along the ground with speed affected by terrain slope
- **Smart Object integration** — NPCs approach and interact with smart objects (benches, doors) from multiple angles using animation warping

---

## Common Mistakes

| Mistake | Fix |
|---------|-----|
| Stride Warping exceeds 20% — animation looks robotic | Tighten clamps and add more speed-tier animations |
| Orientation Warping applied to non-strafing characters | Only use for characters that move in a different direction from where they face |
| Slope Warping without foot IK | Always pair with foot IK; slope warping alone causes floating feet |
| Runtime retargeting on all NPCs regardless of distance | Use LOD thresholds (UE 5.7+) to skip retargeting on distant characters |
| Warping nodes in wrong order in AnimGraph | Follow the standard order: Stride → Orientation → Slope → Control Rig |

---

## Version Notes

| Feature | 5.4 | 5.5 | 5.6 | 5.7 |
|---------|-----|-----|-----|-----|
| Stride Warping | Production | Production | Production | Production |
| Orientation Warping | Production | Production | Production | Production |
| Slope Warping | Beta | Production | Production | Production |
| IK Rig Retargeting | Production | Production | Production | Production |
| Runtime IK Retargeting | Beta | Production | Production | Production (LOD opt) |
| GASP with Mover Plugin | — | Experimental | Experimental | Experimental (expanded) |
