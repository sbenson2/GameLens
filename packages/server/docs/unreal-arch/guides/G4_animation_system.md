# G4 — Animation System in Unreal Engine 5

> **Category:** guide · **Engine:** Unreal Engine 5.4+ · **Related:** [Architecture Overview](../architecture/E1_architecture_overview.md) · [G1 Gameplay Framework](G1_gameplay_framework.md) · [G2 Enhanced Input](G2_enhanced_input.md) · [G3 UMG & Common UI](G3_umg_and_common_ui.md) · [Unreal Rules](../unreal-arch-rules.md)

Unreal Engine's animation system is built around **Animation Blueprints** — specialized Blueprints that drive a Skeletal Mesh's pose every frame. The system combines State Machines for locomotion logic, Blend Spaces for smooth parameter-driven blending, and Animation Montages for gameplay-triggered sequences (attacks, emotes, reloads). This guide covers the full pipeline from asset setup through C++ integration, optimization, and common pitfalls.

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────┐
│              Skeleton + Skeletal Mesh                     │
│  SK_Character  ←  shared bone hierarchy                  │
└───────────────────────┬─────────────────────────────────┘
                        │ drives
                        ▼
┌─────────────────────────────────────────────────────────┐
│            Animation Blueprint (ABP_Character)           │
│                                                          │
│  ┌─────────────────────────────────────────────────┐    │
│  │  EventGraph                                      │    │
│  │  • Reads gameplay variables (Speed, Direction,   │    │
│  │    IsInAir, IsCrouching) from the owning Pawn   │    │
│  └─────────────────────┬───────────────────────────┘    │
│                        │ feeds                           │
│  ┌─────────────────────▼───────────────────────────┐    │
│  │  AnimGraph                                       │    │
│  │  ┌─────────────┐   ┌──────────────┐             │    │
│  │  │ State Machine│──▶│ Blend Spaces │             │    │
│  │  │ (Locomotion) │   │ (Move/Idle)  │             │    │
│  │  └─────────────┘   └──────────────┘             │    │
│  │          │                                       │    │
│  │          ▼                                       │    │
│  │  ┌──────────────────┐                            │    │
│  │  │  Slot Node        │ ← Montages play here     │    │
│  │  │  (DefaultSlot)    │                           │    │
│  │  └──────────────────┘                            │    │
│  │          │                                       │    │
│  │          ▼  Final Pose                           │    │
│  └──────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────┘
```

---

## Animation Blueprints

An Animation Blueprint (ABP) is a specialized Blueprint class that controls animation for a Skeletal Mesh Component. Every ABP has two graphs:

1. **EventGraph** — runs every tick, reads gameplay state and caches it into variables
2. **AnimGraph** — a node graph that produces the final skeletal pose

### Setting Up an Animation Blueprint

1. Right-click in Content Browser → Animation → Animation Blueprint
2. Select the parent class (usually `UAnimInstance` or your custom subclass)
3. Select the target Skeleton
4. Name it with the `ABP_` prefix (e.g., `ABP_PlayerCharacter`)

### The EventGraph: Reading Gameplay State

The EventGraph is where you pull data from the game world into your animation variables. **Never** do heavy gameplay logic here — only read and cache.

```cpp
// WHY a custom AnimInstance subclass: Lets you cache variables in C++ for
// fast access in the AnimGraph, avoiding expensive Blueprint casts every tick.
// The AnimGraph runs on a worker thread in optimized builds, so accessing
// gameplay objects directly from AnimGraph nodes is unsafe.

UCLASS()
class UMyAnimInstance : public UAnimInstance
{
    GENERATED_BODY()

public:
    virtual void NativeUpdateAnimation(float DeltaSeconds) override;

    // WHY UPROPERTY with BlueprintReadOnly: These are read by AnimGraph nodes.
    // Setting them in C++ (NativeUpdateAnimation) is faster than Blueprint.
    UPROPERTY(BlueprintReadOnly, Category = "Animation")
    float Speed = 0.f;

    UPROPERTY(BlueprintReadOnly, Category = "Animation")
    float Direction = 0.f;

    UPROPERTY(BlueprintReadOnly, Category = "Animation")
    bool bIsInAir = false;

    UPROPERTY(BlueprintReadOnly, Category = "Animation")
    bool bIsCrouching = false;
};

void UMyAnimInstance::NativeUpdateAnimation(float DeltaSeconds)
{
    Super::NativeUpdateAnimation(DeltaSeconds);

    // WHY TryGetPawnOwner: Gracefully handles cases where the AnimBP is
    // playing on a mesh with no owning Pawn (e.g., a preview in the editor).
    if (APawn* Pawn = TryGetPawnOwner())
    {
        // WHY Velocity.Size(): Gives us a single scalar "speed" that the
        // Blend Space uses to transition between idle and run animations.
        FVector Velocity = Pawn->GetVelocity();
        Speed = Velocity.Size();

        // WHY CalculateDirection: Converts world-space velocity into a
        // -180..180 degree value relative to the actor's forward vector.
        // This feeds a 2D Blend Space for directional movement.
        Direction = CalculateDirection(Velocity, Pawn->GetActorRotation());

        if (ACharacter* Character = Cast<ACharacter>(Pawn))
        {
            bIsInAir = Character->GetCharacterMovement()->IsFalling();
            bIsCrouching = Character->bIsCrouched;
        }
    }
}
```

---

## State Machines

State Machines are the primary way to organize animation states (Idle, Walk, Run, Jump, Fall, Land). Each state contains an animation or Blend Space, and transitions between states are controlled by rules.

### Typical Locomotion State Machine

```
                    ┌─────────┐
            ┌──────▶│  Idle   │◀──────┐
            │       └────┬────┘       │
            │            │ Speed > 10 │ Speed < 10
            │            ▼            │
            │       ┌─────────┐       │
            │       │  Move   │───────┘
            │       │ (Blend  │
            │       │  Space) │
            │       └────┬────┘
            │            │ IsInAir
   !IsInAir │            ▼
            │       ┌─────────┐
            └───────│  Jump/  │
                    │  Fall   │
                    └─────────┘
```

### Transition Rules Best Practices

```
// In Blueprint transition rules:

// ✅ GOOD: Use cached variables from the EventGraph
// Speed > 10.0  →  triggers Walk/Run state

// ❌ BAD: Calling GetOwningActor→Cast→GetVelocity inside a transition rule.
// WHY: Transition rules evaluate frequently and should be as cheap as possible.
// Cache values in NativeUpdateAnimation or the EventGraph instead.

// WHY "Time Remaining" transitions: For animations that should play to
// completion (landing, attacks), use "Time Remaining (ratio) < 0.1" as
// the transition condition. This ensures the animation finishes before
// transitioning, preventing animation pops.
```

---

## Blend Spaces

A Blend Space blends between multiple animations based on one or two continuous parameters. This creates smooth transitions for movement without manual crossfade logic.

### 1D Blend Space

Use for a single parameter axis — e.g., Speed drives Idle → Walk → Run:

```
Parameter: Speed (0 → 600)

   0        150        350        600
   |---------|----------|----------|
   Idle      Walk       Jog        Run
```

### 2D Blend Space

Use for two parameters — typically Speed and Direction for full directional movement:

```
             Direction
        -180    0    180
   600 | BL  | Fwd |  BR |     ← Run
   300 | WL  | WF  |  WR |     ← Walk
     0 | IL  | Idle|  IR |     ← Idle
       Speed axis (vertical)
```

### Creating a Blend Space in C++ / Blueprint

```cpp
// Blend Spaces are assets, not code. Create them in the Content Browser:
// Right-click → Animation → Blend Space (2D) or Blend Space 1D
//
// Key settings:
//   Axis 0: "Speed"     — Min: 0, Max: 600
//   Axis 1: "Direction" — Min: -180, Max: 180  (2D only)
//
// WHY a Blend Space over manual crossfades:
// 1. Smooth interpolation between any number of animations
// 2. Designer-friendly: just drag animations onto the grid
// 3. Automatically handles edge cases (diagonal movement, speed changes)
// 4. Much cheaper than running multiple animations and blending in code
```

---

## Animation Montages

Montages are the mechanism for gameplay-triggered animations that override or layer on top of the base locomotion. Attacks, reloads, emotes, hit reactions — these all use Montages.

### Key Concepts

- **Sections** — named segments within a Montage that can be jumped to, looped, or skipped
- **Slots** — named channels in the AnimGraph where Montages play. A Slot node in the AnimGraph receives the Montage output and blends it with the underlying pose
- **Notifies** — events placed on the Montage timeline that fire callbacks to gameplay code (e.g., "spawn projectile at frame 12")
- **Blend In/Out** — controls how the Montage fades in from and back to the base animation

### Playing a Montage from C++

```cpp
// WHY Montages instead of playing animations directly:
// 1. Montages can interrupt and blend with the current state machine
// 2. Sections let you branch mid-animation (e.g., combo chains)
// 3. Notifies synchronize gameplay events to exact animation frames
// 4. Multiple Montages can play simultaneously on different slots

void AMyCharacter::PlayAttack()
{
    if (UAnimInstance* AnimInstance = GetMesh()->GetAnimInstance())
    {
        // WHY Montage_Play returns duration: You can use it to set timers,
        // schedule combo windows, or check if the Montage was valid.
        float Duration = AnimInstance->Montage_Play(AttackMontage, 1.0f);
        
        if (Duration > 0.f)
        {
            // Montage started successfully
            bIsAttacking = true;
            
            // WHY bind to OnMontageEnded: Clean way to know when the attack
            // finishes so you can reset state without polling every frame.
            FOnMontageEnded EndDelegate;
            EndDelegate.BindUObject(this, &AMyCharacter::OnAttackMontageEnded);
            AnimInstance->Montage_SetEndDelegate(EndDelegate, AttackMontage);
        }
    }
}

void AMyCharacter::OnAttackMontageEnded(UAnimMontage* Montage, bool bInterrupted)
{
    bIsAttacking = false;
    // WHY check bInterrupted: If another Montage or gameplay event
    // interrupted this one, you may want different cleanup logic
    // (e.g., don't start the combo cooldown if the attack was canceled).
}
```

### Animation Notifies

Notifies fire gameplay events at specific frames in an animation. They're essential for synchronizing effects, damage, and sound with animation.

```cpp
// Custom Notify in C++ — fires when the animation reaches the notify's frame.
// WHY a custom notify class: Built-in notifies (PlaySound, SpawnParticle)
// cover common cases, but gameplay events like "apply damage" or "spawn
// projectile" need custom logic tied to your game systems.

UCLASS()
class UAnimNotify_ApplyDamage : public UAnimNotify
{
    GENERATED_BODY()

public:
    UPROPERTY(EditAnywhere, BlueprintReadWrite)
    float DamageAmount = 20.f;

    UPROPERTY(EditAnywhere, BlueprintReadWrite)
    float DamageRadius = 100.f;

    virtual void Notify(
        USkeletalMeshComponent* MeshComp,
        UAnimSequenceBase* Animation,
        const FAnimNotifyEventReference& EventReference) override
    {
        if (AActor* Owner = MeshComp->GetOwner())
        {
            // WHY trace from a socket: The "weapon_tip" socket on the skeleton
            // gives us the exact world-space position of the weapon at this
            // frame, so damage is applied where the weapon visually is.
            FVector Origin = MeshComp->GetSocketLocation(TEXT("weapon_tip"));
            
            TArray<FOverlapResult> Overlaps;
            FCollisionQueryParams Params;
            Params.AddIgnoredActor(Owner);
            
            if (Owner->GetWorld()->OverlapMultiByChannel(
                Overlaps, Origin, FQuat::Identity,
                ECC_Pawn, FCollisionShape::MakeSphere(DamageRadius), Params))
            {
                for (const FOverlapResult& Overlap : Overlaps)
                {
                    // Apply damage to overlapping pawns
                }
            }
        }
    }
};
```

---

## Slot Nodes and Layering

The **Slot** node in the AnimGraph is where Montages are injected into the animation pipeline. Without a Slot node, `Montage_Play()` has nowhere to output its pose.

### Basic Setup

```
AnimGraph:
  State Machine (Locomotion)
      │
      ▼
  Slot 'DefaultSlot'        ← Montages override the locomotion pose here
      │
      ▼
  Output Pose
```

### Layered Slots (Upper Body / Lower Body)

For games where the character can attack while running, use separate slots per body region with a **Layered Blend per Bone** node:

```
AnimGraph:
  State Machine (Locomotion) ──────────────┐
      │                                     │
      ▼                                     ▼
  Slot 'UpperBody'              Layered Blend per Bone
  (attack Montages)                   │
      │                               │ Spine bone = UpperBody slot
      └───────────────────────────────┘ Below spine = Locomotion
                    │
                    ▼
              Output Pose
```

```cpp
// WHY Layered Blend per Bone: Lets the character run (lower body from
// State Machine) while swinging a sword (upper body from Montage).
// Without this, playing an attack Montage would freeze the legs.
//
// To set this up:
// 1. In the Montage asset, set the Slot to "UpperBody" (or your custom name)
// 2. In the AnimGraph, add a "Layered Blend per Bone" node
// 3. Configure it to blend from the Spine bone upward
// 4. Feed base locomotion into the Base Pose pin
// 5. Feed the UpperBody Slot node into a Blend Pose pin
```

---

## Linked Anim Layers

Linked Anim Layers (introduced in UE 4.26, matured in UE5) let you modularize animation logic. Instead of one massive ABP, you define **Anim Layer Interfaces** that multiple ABPs can implement.

```cpp
// WHY Linked Anim Layers:
// 1. Swap animation sets at runtime (e.g., equipping a rifle vs. pistol
//    changes the locomotion, aim, and reload animations)
// 2. Keep ABPs small and focused — one per weapon type or movement mode
// 3. Multiple team members can work on different layers without merge conflicts

// Example workflow:
// 1. Create an Anim Layer Interface: ALI_WeaponAnims
//    - Defines layers: FullBodyOverride, UpperBodyOverride, AimOffset
// 2. Create ABPs that implement this interface:
//    - ABP_Rifle, ABP_Pistol, ABP_Melee
// 3. At runtime, link the appropriate ABP:

void AMyCharacter::EquipWeapon(EWeaponType Type)
{
    TSubclassOf<UAnimInstance> AnimClass;
    switch (Type)
    {
        case EWeaponType::Rifle:  AnimClass = RifleAnimBP;  break;
        case EWeaponType::Pistol: AnimClass = PistolAnimBP; break;
        case EWeaponType::Melee:  AnimClass = MeleeAnimBP;  break;
    }
    
    // WHY LinkAnimClassLayers: Swaps the animation logic for all layers
    // defined in the interface, with automatic blend transitions.
    GetMesh()->LinkAnimClassLayers(AnimClass);
}
```

---

## Performance Optimization

### Animation Budget

Animation is often one of the top CPU costs. Key optimization strategies:

```cpp
// 1. URO (Update Rate Optimization)
// WHY: Off-screen or distant characters don't need 60fps animation updates.
// Set in the Skeletal Mesh Component details or via code:
// - "Anim Update Rate" settings in the Skeletal Mesh Component
// - LOD-based update rates (LOD 0 = every frame, LOD 2 = every 4th frame)

// 2. Visibility-based optimization
// The engine automatically skips animation updates for meshes that aren't
// rendered. Ensure VisibilityBasedAnimTickOption is set appropriately:
GetMesh()->VisibilityBasedAnimTickOption = 
    EVisibilityBasedAnimTickOption::OnlyTickPoseWhenRendered;

// 3. Fast Path
// WHY: The "Fast Path" in AnimGraph evaluates nodes without going through
// the Blueprint VM, which is significantly faster. To use it:
// - Use member variables directly (not function calls) in AnimGraph nodes
// - Avoid Break Struct nodes — access struct members directly
// - The AnimGraph compiler shows a lightning bolt icon on fast-path nodes

// 4. Animation Sharing Plugin
// WHY: For crowds of identical characters (NPCs, enemies), the Animation
// Sharing plugin lets many actors share a single animation evaluation,
// dramatically reducing CPU cost for large numbers of similar characters.
```

### Common Performance Pitfalls

- **Too many Blend Spaces evaluating simultaneously** — each active Blend Space blends N animations. Limit active blend counts.
- **Complex Control Rig solves every frame** — use LOD to disable IK/Control Rig at distance
- **Notify spam** — hundreds of notifies firing per frame adds up. Use Notify States (ranges) over single-frame notifies where possible.
- **Blueprint-heavy AnimGraph** — every Blueprint node in the AnimGraph that isn't on the Fast Path runs through the VM. Move logic to C++ `NativeUpdateAnimation`.

---

## Common Pitfalls

### 1. Montage Not Playing

Most common causes:
- No **Slot** node in the AnimGraph matching the Montage's slot name
- The Montage's **Skeleton** doesn't match the Skeletal Mesh's skeleton
- Another Montage is already playing on the same slot (use `Montage_Stop` first or set blend modes)

### 2. Root Motion Not Working

- Ensure **Root Motion** is enabled on both the AnimSequence asset and the Character Movement Component (`bAllowPhysicsRotationDuringAnimRootMotion`, etc.)
- Root motion from Montages requires the Montage to be on a slot that contributes to root motion

### 3. Animation Pops on State Transitions

- Increase blend time on transitions (0.2s is a good starting point)
- Use "Time Remaining" rules to wait for the current animation to nearly finish
- Enable **Inertialization** blending for smoother transitions without requiring matched poses

### 4. Variables Not Updating in AnimGraph

- Variables set in the EventGraph must be `UPROPERTY(BlueprintReadOnly)` to be visible in the AnimGraph
- If using C++, ensure `NativeUpdateAnimation` calls `Super::NativeUpdateAnimation`
- Thread safety: don't access UObjects from AnimGraph node logic directly — cache values in the EventGraph

---

## Further Reading

- [UE5 Animation Blueprints Documentation](https://dev.epicgames.com/documentation/en-us/unreal-engine/animation-blueprints-in-unreal-engine)
- [Blend Spaces Documentation](https://dev.epicgames.com/documentation/en-us/unreal-engine/blend-spaces-in-animation-blueprints-in-unreal-engine)
- [Animation Montages Documentation](https://dev.epicgames.com/documentation/en-us/unreal-engine/animation-montage-in-unreal-engine)
- [Animation Notifies Documentation](https://dev.epicgames.com/documentation/en-us/unreal-engine/animation-notifies-in-unreal-engine)
- [Animation Optimization Guide](https://dev.epicgames.com/documentation/en-us/unreal-engine/animation-optimization-in-unreal-engine)
