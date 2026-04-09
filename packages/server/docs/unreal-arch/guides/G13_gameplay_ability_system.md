# G13 — Gameplay Ability System (GAS) in Unreal Engine 5

> **Category:** guide · **Engine:** Unreal Engine 5.4+ · **Related:** [G1 Gameplay Framework](G1_gameplay_framework.md) · [G5 Networking & Replication](G5_networking_replication.md) · [Architecture Overview](../architecture/E1_architecture_overview.md) · [Unreal Rules](../unreal-arch-rules.md)

The Gameplay Ability System (GAS) is Epic's built-in framework for building abilities, attributes, status effects, cooldowns, and gameplay interactions. Originally developed for Fortnite and Paragon, it ships as a plugin in every UE5 installation. GAS solves the "ability spaghetti" problem — where every ability ends up with bespoke code for activation, cooldowns, costs, networking, and cancellation. Instead, GAS provides a **data-driven, replicated, extensible** architecture that handles all of this through configuration. This guide covers the core classes, setup, practical implementation, and multiplayer considerations.

---

## Why Use GAS?

Without GAS, a typical ability system accumulates these problems:

- **Every ability re-implements** cooldowns, costs, input binding, cancellation, and prediction
- **Status effects** (stun, burn, shield) each need custom replication and stacking logic
- **Attributes** (health, mana, stamina) scatter across multiple actors with no unified modification pipeline
- **Multiplayer** requires manual prediction and reconciliation per ability
- **Designer iteration** is slow — every change requires C++ compilation

GAS solves all of these with a unified architecture. Even for single-player games, the structured approach prevents technical debt as the ability count grows.

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────┐
│              UAbilitySystemComponent (ASC)                │
│              Central hub on each actor                    │
│                                                           │
│  ┌──────────────┐  ┌──────────────┐  ┌───────────────┐  │
│  │ Granted      │  │ Active       │  │ Attribute     │  │
│  │ Abilities    │  │ Gameplay     │  │ Sets          │  │
│  │ (specs)      │  │ Effects      │  │ (health, etc) │  │
│  └──────┬───────┘  └──────┬───────┘  └───────┬───────┘  │
│         │                 │                   │          │
│         ▼                 ▼                   ▼          │
│  UGameplayAbility   UGameplayEffect   UAttributeSet     │
│  (behavior)         (data changes)    (float values)     │
│                                                           │
│  ┌──────────────────────────────────────────────────┐    │
│  │          FGameplayTagContainer                     │    │
│  │  Tags used for filtering, blocking, requirements  │    │
│  └──────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────┘
```

### Core Classes

| Class | Role |
|-------|------|
| **UAbilitySystemComponent (ASC)** | The component that ties everything together. Lives on the actor (or PlayerState). Owns granted abilities, active effects, and attribute sets. |
| **UGameplayAbility** | Defines *what happens* when an ability activates — the behavior. C++ or Blueprint subclass. |
| **UGameplayEffect (GE)** | Defines *data changes* — modify attributes, apply tags, set duration. Configured entirely in Blueprint/data. No code needed. |
| **UAttributeSet** | Holds `FGameplayAttributeData` floats (Health, Mana, AttackPower). Modified only through GameplayEffects for proper prediction. |
| **FGameplayTag** | Hierarchical identifier (e.g., `Ability.Skill.Fireball`, `State.Debuff.Burning`). Used everywhere for filtering and matching. |
| **UGameplayAbility Task** | Async building blocks inside abilities — play montage, wait for event, wait for target, wait for cooldown. |

---

## Project Setup

### 1. Enable the Plugin

In your `.uproject` file or via Edit → Plugins, enable **Gameplay Abilities**. Then add dependencies to your `Build.cs`:

```cpp
// YourGame.Build.cs
PublicDependencyModuleNames.AddRange(new string[] {
    "GameplayAbilities",  // Core GAS
    "GameplayTags",       // FGameplayTag
    "GameplayTasks"       // Ability tasks (play montage, wait for event, etc.)
});
```

### 2. Create an Attribute Set

```cpp
// WHY UAttributeSet: attributes (health, mana, etc.) must live here so
// GameplayEffects can modify them through a unified pipeline with clamping,
// pre/post callbacks, and network prediction. Storing health as a raw float
// on your Character bypasses all of this.

#pragma once
#include "AbilitySystemComponent.h"
#include "AttributeSet.h"
#include "MyAttributeSet.generated.h"

UCLASS()
class UMyAttributeSet : public UAttributeSet
{
    GENERATED_BODY()

public:
    // The ATTRIBUTE_ACCESSORS macro generates GetHealth(), SetHealth(),
    // InitHealth() helper functions automatically.
    UPROPERTY(BlueprintReadOnly, ReplicatedUsing = OnRep_Health)
    FGameplayAttributeData Health;
    ATTRIBUTE_ACCESSORS(UMyAttributeSet, Health)

    UPROPERTY(BlueprintReadOnly, ReplicatedUsing = OnRep_MaxHealth)
    FGameplayAttributeData MaxHealth;
    ATTRIBUTE_ACCESSORS(UMyAttributeSet, MaxHealth)

    UPROPERTY(BlueprintReadOnly, ReplicatedUsing = OnRep_Mana)
    FGameplayAttributeData Mana;
    ATTRIBUTE_ACCESSORS(UMyAttributeSet, Mana)

    // WHY PreAttributeChange: this is called BEFORE the value changes.
    // Use it to clamp values so Health never exceeds MaxHealth.
    virtual void PreAttributeChange(const FGameplayAttribute& Attribute,
                                     float& NewValue) override;

    // WHY PostGameplayEffectExecute: called AFTER an instant GE executes.
    // Use it for reactions: show damage numbers, trigger death, etc.
    virtual void PostGameplayEffectExecute(
        const FGameplayEffectModCallbackData& Data) override;

    virtual void GetLifetimeReplicatedProps(
        TArray<FLifetimeProperty>& OutLifetimeProps) const override;

    UFUNCTION()
    void OnRep_Health(const FGameplayAttributeData& OldValue);
    UFUNCTION()
    void OnRep_MaxHealth(const FGameplayAttributeData& OldValue);
    UFUNCTION()
    void OnRep_Mana(const FGameplayAttributeData& OldValue);
};
```

### 3. Add the ASC to Your Character

There are two common placement strategies:

```cpp
// OPTION A: ASC on the Character (simple, recommended for single-player)
// WHY: straightforward ownership — the character IS the ability holder
AMyCharacter::AMyCharacter()
{
    AbilitySystemComponent = CreateDefaultSubobject<UAbilitySystemComponent>(
        TEXT("AbilitySystemComponent"));
    AttributeSet = CreateDefaultSubobject<UMyAttributeSet>(
        TEXT("AttributeSet"));
}

// OPTION B: ASC on the PlayerState (recommended for multiplayer)
// WHY: PlayerState survives pawn death/respawn. If the ASC lives on the
// pawn, all active effects and granted abilities are lost on respawn.
// Fortnite and Lyra both use this pattern.
AMyPlayerState::AMyPlayerState()
{
    AbilitySystemComponent = CreateDefaultSubobject<UAbilitySystemComponent>(
        TEXT("AbilitySystemComponent"));
    AttributeSet = CreateDefaultSubobject<UMyAttributeSet>(
        TEXT("AttributeSet"));
}
```

With Option B, the Character's `PossessedBy` must initialize the ASC's actor info:

```cpp
void AMyCharacter::PossessedBy(AController* NewController)
{
    Super::PossessedBy(NewController);

    // WHY InitAbilityActorInfo: the ASC needs to know who OWNS it
    // (PlayerState — persistent) and who is its AVATAR (Character — spatial).
    // This separation lets the ASC survive pawn swaps.
    if (AMyPlayerState* PS = GetPlayerState<AMyPlayerState>())
    {
        PS->GetAbilitySystemComponent()->InitAbilityActorInfo(PS, this);
    }
}
```

---

## Creating a Gameplay Ability

```cpp
#pragma once
#include "Abilities/GameplayAbility.h"
#include "GA_FireballAbility.generated.h"

UCLASS()
class UGA_FireballAbility : public UGameplayAbility
{
    GENERATED_BODY()

public:
    UGA_FireballAbility();

    // WHY CanActivateAbility: check custom conditions beyond tag requirements.
    // Tag-based blocking (e.g., "can't cast while stunned") is automatic —
    // this is for additional game logic checks.
    virtual bool CanActivateAbility(
        const FGameplayAbilitySpecHandle Handle,
        const FGameplayAbilityActorInfo* ActorInfo,
        const FGameplayTagContainer* SourceTags,
        const FGameplayTagContainer* TargetTags,
        FGameplayTagContainer* OptionalRelevantTags) const override;

    // ActivateAbility is the main entry point — this IS the ability.
    virtual void ActivateAbility(
        const FGameplayAbilitySpecHandle Handle,
        const FGameplayAbilityActorInfo* ActorInfo,
        const FGameplayAbilityActivationInfo ActivationInfo,
        const FGameplayEventData* TriggerEventData) override;
};
```

```cpp
UGA_FireballAbility::UGA_FireballAbility()
{
    // WHY InstancingPolicy: NonInstanced means ONE shared instance for all
    // activations — lowest memory, but no per-activation state. Use
    // InstancedPerActor when you need member variables per activation.
    InstancingPolicy = EGameplayAbilityInstancingPolicy::InstancedPerActor;

    // Net execution: LocalPredicted means the client activates immediately
    // (responsive feel) and the server validates. If the server rejects,
    // the client rolls back.
    NetExecutionPolicy = EGameplayAbilityNetExecutionPolicy::LocalPredicted;
}
```

### Ability Tags (The Control System)

Tags on a GameplayAbility control activation, blocking, and cancellation — entirely through data:

| Tag Container | Purpose | Example |
|---------------|---------|---------|
| `AbilityTags` | Identifies this ability | `Ability.Skill.Fireball` |
| `CancelAbilitiesWithTag` | Cancels active abilities with these tags when this activates | `Ability.Skill.Channel` (fireball cancels channeling) |
| `BlockAbilitiesWithTag` | Prevents abilities with these tags while this is active | `Ability.Skill` (can't cast other skills during fireball) |
| `ActivationOwnedTags` | Tags added to the owner while this ability is active | `State.Casting` |
| `ActivationRequiredTags` | Owner must have ALL of these to activate | `State.Alive` |
| `ActivationBlockedTags` | Owner must have NONE of these to activate | `State.Stunned`, `State.Dead` |

---

## Gameplay Effects

GameplayEffects are **data-only assets** — no C++ needed. They modify attributes through a structured pipeline:

### Duration Types

| Type | Behavior | Use Case |
|------|----------|----------|
| **Instant** | Applies once, immediately | Damage, healing, picking up an item |
| **Duration** | Active for N seconds, then removed | Buff lasting 10 seconds, poison ticking |
| **Infinite** | Active until explicitly removed | Passive aura, equipment stat bonus |

### Modifier Structure

Each modifier within a GE specifies:

```
Attribute:    Health
Operation:    Add (or Multiply, Override, etc.)
Magnitude:    -50 (or curve table, attribute-based, custom calc)
```

### Stacking

Stacking rules determine what happens when the same effect is applied multiple times:

| Policy | Behavior | Example |
|--------|----------|---------|
| **Aggregate by Source** | Each source gets its own stack | Two enemies each apply their own poison |
| **Aggregate by Target** | All applications share one stack | Poison stacks up to 5 regardless of source |
| **Stack Limit** | Maximum number of stacks | Max 5 stacks of Bleed |
| **Stack Duration Refresh** | Re-applying refreshes the timer | Refreshing a buff by recasting |

### Gameplay Effect Components (UE 5.4+)

GE Components are modular building blocks attached to a GameplayEffect:

```
UGameplayEffect
├── GE Component: Target Tags (adds "State.Burning" while active)
├── GE Component: Chance to Apply (70% chance)
├── GE Component: Remove Other GE (removes "State.Frozen" on apply)
├── GE Component: Immunity (blocks effects with tag "Damage.Fire")
└── Modifiers: Health -10 per second
```

---

## Gameplay Cues: Visual/Audio Feedback

Gameplay Cues decouple visual effects from gameplay logic:

```cpp
// In your GameplayEffect or Ability:
// Set the Gameplay Cue tag to: GameplayCue.Ability.Fireball.Impact

// The cue handler (Blueprint or C++) responds to:
// - OnExecute (instant effects — play a particle burst)
// - WhileActive / OnRemove (duration effects — looping fire VFX)
```

**Why Gameplay Cues?** The ability logic (damage, cooldown) runs on the server. Visual effects run on clients. Gameplay Cues bridge this gap — the server triggers a cue tag, and each client plays the associated VFX/SFX locally. This means:

- No visual logic in your ability C++
- Designers swap VFX in Blueprint without touching ability code
- Network bandwidth is minimal (just a tag, not particle system data)

---

## Multiplayer Considerations

### Prediction

GAS has built-in client-side prediction for responsive gameplay:

1. **Client** activates ability locally (instant feedback)
2. **Server** validates and either confirms or rejects
3. **On rejection**, the client rolls back (removes predicted effects)

This requires `NetExecutionPolicy::LocalPredicted` and proper use of `FPredictionKey`.

### Where to Put the ASC

| Placement | Replication | Survives Respawn | Best For |
|-----------|-------------|-----------------|----------|
| On the Pawn/Character | Yes (with pawn) | No | Simple single-player, AI enemies |
| On the PlayerState | Yes (always) | Yes | Multiplayer games (Lyra pattern) |

### Replication Rules

- **Attributes** replicate via standard `GetLifetimeReplicatedProps` + `DOREPLIFETIME_CONDITION`
- **Active GameplayEffects** replicate automatically through the ASC
- **Ability activation** uses the ASC's built-in prediction and confirmation flow
- **Gameplay Cues** replicate as lightweight tags — the VFX is played locally on each client

---

## Common Patterns

### Damage Pipeline

```
1. Attacker activates UGA_Attack
2. Ability creates a GE_Damage spec with magnitude = AttackPower - TargetArmor
3. GE_Damage is applied to target's ASC
4. Target's UAttributeSet::PostGameplayEffectExecute fires
5. If Health <= 0 → apply GE_Death (adds tag State.Dead, triggers GameplayCue.Death)
6. GameplayCue.Death plays death animation on all clients
```

### Cooldowns

Cooldowns in GAS are just GameplayEffects with a duration:

```cpp
// In your ability constructor:
CooldownGameplayEffectClass = UGE_FireballCooldown::StaticClass();

// UGE_FireballCooldown is a duration GE that:
// - Lasts 5 seconds
// - Grants tag: Cooldown.Ability.Fireball
// - Your ability's ActivationBlockedTags includes Cooldown.Ability.Fireball
// Result: the ability auto-blocks itself for 5 seconds after use
```

### Costs (Mana, Stamina, etc.)

Costs are instant GameplayEffects that modify a resource attribute:

```cpp
CostGameplayEffectClass = UGE_FireballCost::StaticClass();
// UGE_FireballCost: Instant, modifies Mana by -30
// The ASC checks CanActivateAbility, which checks if Cost would
// reduce Mana below 0. If so, activation is denied.
```

---

## GAS Setup Checklist

1. Enable **GameplayAbilities** plugin
2. Add `GameplayAbilities`, `GameplayTags`, `GameplayTasks` to `Build.cs`
3. Create `UAttributeSet` subclass with your game's attributes
4. Add `UAbilitySystemComponent` + `UAttributeSet` to your Character or PlayerState
5. Call `InitAbilityActorInfo()` in `PossessedBy` and `OnRep_PlayerState`
6. Create `UGameplayAbility` subclasses (C++ base, Blueprint children for designers)
7. Create `UGameplayEffect` assets in the editor for damage, buffs, cooldowns, costs
8. Set up `GameplayTags` in Project Settings → GameplayTags
9. Grant abilities via `ASC->GiveAbility(FGameplayAbilitySpec(...))` on spawn or possession
10. Bind ability input via Enhanced Input → `ASC->AbilityLocalInputPressed(InputID)`

---

## Further Reading

- [Official GAS Documentation (UE 5.7)](https://dev.epicgames.com/documentation/en-us/unreal-engine/gameplay-ability-system-for-unreal-engine)
- [GAS Community Documentation (tranek)](https://github.com/tranek/GASDocumentation)
- [Epic Tutorial: GAS Best Practices for Setup](https://dev.epicgames.com/community/learning/tutorials/DPpd/unreal-engine-gameplay-ability-system-best-practices-for-setup)
- [Lyra Sample Project](https://www.unrealengine.com/en-US/lyra) — Epic's official GAS reference implementation
