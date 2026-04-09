# G62 — Gameplay Message Subsystem: Decoupled Event Messaging

> **Category:** guide · **Engine:** Unreal Engine 5.0+ · **Related:** [G27 Lyra Architecture](G27_lyra_architecture.md) · [G32 Gameplay Tags & Data-Driven Design](G32_gameplay_tags_data_driven.md) · [G13 Gameplay Ability System](G13_gameplay_ability_system.md) · [Unreal Rules](../unreal-arch-rules.md)

The **Gameplay Message Subsystem** (`UGameplayMessageSubsystem`) is a World Subsystem that enables decoupled, tag-based communication between gameplay objects that have no direct references to each other. It ships as the `GameplayMessageRuntime` plugin (included in Lyra and available as a standalone plugin since UE 5.0). This guide covers architecture, C++ and Blueprint usage, message design, and production patterns.

> **Why this matters:** In any non-trivial game, systems like HUD, audio, achievements, and analytics all need to react to gameplay events (kills, pickups, objective completion). Without a message bus, you end up with spaghetti references or fragile delegate chains. The Gameplay Message Subsystem solves this with a publish/subscribe model keyed on Gameplay Tags.

---

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                UGameplayMessageSubsystem                 │
│              (UWorldSubsystem — one per UWorld)          │
│                                                          │
│  ┌─────────────┐    GameplayTag Channel    ┌──────────┐ │
│  │  Broadcaster │ ──── "Event.Kill" ──────▶│ Listener │ │
│  │  (any UObject)│                          │ (any obj)│ │
│  └─────────────┘                           └──────────┘ │
│                                                          │
│  • Messages are structs (USTRUCT)                        │
│  • Channels are FGameplayTag hierarchies                 │
│  • Listeners can match exact tags or parent tags         │
│  • No tick cost — event-driven only                      │
└─────────────────────────────────────────────────────────┘
```

### Core Concepts

| Concept | Description |
|---------|-------------|
| **Channel** | A `FGameplayTag` that identifies the message type (e.g., `Gameplay.Message.Kill`) |
| **Message** | Any `USTRUCT` payload — you define what data travels with the event |
| **Broadcast** | Fire-and-forget: send a message on a channel to all current listeners |
| **Listener** | Registers interest in a channel (exact or hierarchical match) and receives a callback |
| **Hierarchical matching** | Listening on `Gameplay.Message` receives both `Gameplay.Message.Kill` and `Gameplay.Message.Pickup` |

---

## Enabling the Plugin

The `GameplayMessageRuntime` plugin is **not enabled by default** in new projects. Enable it in one of two ways:

1. **Editor:** Edit → Plugins → search "GameplayMessage" → enable `GameplayMessageRuntime`
2. **.uproject file:**

```json
{
  "Plugins": [
    {
      "Name": "GameplayMessageRuntime",
      "Enabled": true
    }
  ]
}
```

Add the module dependency in your `Build.cs`:

```csharp
PublicDependencyModuleNames.AddRange(new string[]
{
    "GameplayMessageRuntime",
    "GameplayTags"
});
```

---

## Defining a Message Struct

Messages are plain `USTRUCT`s. Keep them lightweight — they are passed by const reference.

```cpp
// MyGameMessages.h
#pragma once

#include "CoreMinimal.h"
#include "GameplayTagContainer.h"
#include "MyGameMessages.generated.h"

/**
 * Sent when any actor eliminates another actor.
 * Channel: Gameplay.Message.Elimination
 */
USTRUCT(BlueprintType)
struct FMyEliminationMessage
{
    GENERATED_BODY()

    // Who performed the elimination
    UPROPERTY(BlueprintReadWrite)
    TObjectPtr<AActor> Instigator = nullptr;

    // Who was eliminated
    UPROPERTY(BlueprintReadWrite)
    TObjectPtr<AActor> Target = nullptr;

    // Gameplay tags describing how (headshot, melee, etc.)
    UPROPERTY(BlueprintReadWrite)
    FGameplayTagContainer ContextTags;

    // Damage amount that caused the elimination
    UPROPERTY(BlueprintReadWrite)
    float DamageMagnitude = 0.f;
};
```

> **Lyra pattern:** Lyra uses a single `FLyraVerbMessage` for most messages, with a `Verb` tag, `Instigator`, `Target`, context tags, and a `Magnitude` float. This works well for smaller projects. For larger codebases, purpose-built structs improve type safety and discoverability.

---

## Broadcasting a Message (C++)

```cpp
#include "GameFramework/GameplayMessageSubsystem.h"
#include "MyGameMessages.h"

void UMyHealthComponent::HandleDeath(AActor* Killer)
{
    // Build the message
    FMyEliminationMessage Message;
    Message.Instigator = Killer;
    Message.Target = GetOwner();
    Message.DamageMagnitude = LastDamageAmount;

    // Broadcast on our channel tag
    UGameplayMessageSubsystem& MessageSubsystem =
        UGameplayMessageSubsystem::Get(GetWorld());

    // The tag must be defined in your GameplayTags .ini or DataTable
    static const FGameplayTag EliminationChannel =
        FGameplayTag::RequestGameplayTag(FName("Gameplay.Message.Elimination"));

    MessageSubsystem.BroadcastMessage(EliminationChannel, Message);
}
```

### Key Points

- `UGameplayMessageSubsystem::Get(UWorld*)` retrieves the singleton for that world.
- `BroadcastMessage<T>()` is a template — the struct type must match what listeners expect.
- Broadcasting is synchronous — all listeners execute before `BroadcastMessage` returns.
- Safe to broadcast during gameplay; avoid broadcasting during construction or `BeginDestroy`.

---

## Listening for Messages (C++)

```cpp
#include "GameFramework/GameplayMessageSubsystem.h"
#include "MyGameMessages.h"

void UMyKillFeedWidget::NativeConstruct()
{
    Super::NativeConstruct();

    UGameplayMessageSubsystem& MessageSubsystem =
        UGameplayMessageSubsystem::Get(GetWorld());

    static const FGameplayTag EliminationChannel =
        FGameplayTag::RequestGameplayTag(FName("Gameplay.Message.Elimination"));

    // Register listener — returns a handle for unregistration
    ListenerHandle = MessageSubsystem.RegisterListener<FMyEliminationMessage>(
        EliminationChannel,
        this,  // UObject* to prevent GC of the listener
        [this](FGameplayTag Channel, const FMyEliminationMessage& Message)
        {
            // Update kill feed UI
            AddKillFeedEntry(Message.Instigator, Message.Target);
        }
    );
}

void UMyKillFeedWidget::NativeDestruct()
{
    // Always unregister to avoid dangling callbacks
    if (ListenerHandle.IsValid())
    {
        ListenerHandle.Unregister();
    }

    Super::NativeDestruct();
}
```

### Listener Options

| Registration method | Behavior |
|---------------------|----------|
| `RegisterListener<T>(Tag, ...)` | Exact tag match only |
| `RegisterListener<T>(Tag, ..., EGameplayMessageMatch::PartialMatch)` | Matches the tag and all child tags |

---

## Blueprint Usage

### Broadcasting

1. Get the subsystem: **Get Gameplay Message Subsystem** node
2. Call **Broadcast Message** — select your struct type from the dropdown
3. Fill in the struct fields and the channel tag

### Listening

1. **Get Gameplay Message Subsystem** → **Register Listener**
2. Choose the channel tag and struct type
3. The output exec pin fires each time a matching message arrives
4. Store the returned handle and call **Unregister** on EndPlay or widget destruction

---

## Production Patterns

### 1. Tag Hierarchy for Filtering

Organize channels hierarchically so systems can listen broadly or narrowly:

```
Gameplay.Message
  Gameplay.Message.Elimination
    Gameplay.Message.Elimination.Headshot
    Gameplay.Message.Elimination.Melee
  Gameplay.Message.Pickup
    Gameplay.Message.Pickup.Health
    Gameplay.Message.Pickup.Ammo
  Gameplay.Message.Objective
    Gameplay.Message.Objective.Captured
    Gameplay.Message.Objective.Lost
```

The achievement system listens on `Gameplay.Message` (catches everything). The ammo counter listens only on `Gameplay.Message.Pickup.Ammo`.

### 2. Avoid Heavy Work in Listeners

Because broadcasts are synchronous, a slow listener blocks the broadcaster. For expensive operations (spawning VFX, saving to disk), queue the work:

```cpp
MessageSubsystem.RegisterListener<FMyEliminationMessage>(
    EliminationChannel, this,
    [this](FGameplayTag, const FMyEliminationMessage& Msg)
    {
        // Queue — don't execute inline
        PendingEliminations.Add(Msg);
    }
);
```

Process the queue in `Tick` or a timer.

### 3. Combine with Gameplay Ability System

GAS abilities can broadcast messages on activation, commitment, or cancellation. This lets the HUD, audio, and analytics react to ability events without coupling to `UGameplayAbility` subclasses directly.

### 4. Networking Considerations

The Gameplay Message Subsystem is **local only** — messages do not replicate across the network. For multiplayer games:

- Broadcast on the **server** after authoritative state changes, then let replication move the state.
- Broadcast on each **client** in response to replicated property changes (e.g., `OnRep_` functions).
- Do **not** rely on message ordering between server and client.

---

## Common Mistakes

| Mistake | Fix |
|---------|-----|
| Forgetting to unregister listeners | Store the `FGameplayMessageListenerHandle` and call `Unregister()` on destruction |
| Broadcasting before world is ready | Check `GetWorld()` is valid; avoid broadcasting in constructors |
| Mismatched struct types | The template type in `BroadcastMessage<T>` must match `RegisterListener<T>` — mismatches silently fail |
| Assuming network replication | Messages are local; use property replication for cross-machine state |
| Listening on leaf tag expecting children | Use `EGameplayMessageMatch::PartialMatch` for hierarchical matching |

---

## When to Use (vs. Alternatives)

| Mechanism | Best for | Downside |
|-----------|----------|----------|
| **Gameplay Message Subsystem** | Decoupled N-to-M events across unrelated systems | Synchronous; local only; no guaranteed ordering |
| **Delegates / Events** | 1-to-N with a known broadcaster | Requires a reference to the broadcasting object |
| **Gameplay Cues (GAS)** | Cosmetic feedback from abilities | Tied to the Gameplay Ability System |
| **Gameplay Events (GAS)** | Triggering abilities on other actors | Requires GAS on both actors |
| **Event Dispatchers (BP)** | Simple Blueprint-to-Blueprint communication | Requires direct reference; hard to scale |

---

## Version Notes

| Version | Status |
|---------|--------|
| UE 5.0 | Introduced as part of Lyra Starter Game plugins |
| UE 5.1–5.5 | Stable; no breaking API changes |
| UE 5.6+ | Community tutorials demonstrate production use with nameplates and indicator systems |

The plugin's API has been stable since its introduction. The core types — `UGameplayMessageSubsystem`, `FGameplayMessageListenerHandle`, and `BroadcastMessage<T>` — have not changed across UE 5.x releases.
