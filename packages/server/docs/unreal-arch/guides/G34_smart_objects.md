# G34 — Smart Objects System in Unreal Engine 5

> **Category:** guide · **Engine:** Unreal Engine 5.4+ · **Related:** [G11 AI Behavior Trees](G11_ai_behavior_trees.md) · [G25 StateTree AI System](G25_statetree_ai_system.md) · [G32 Gameplay Tags](G32_gameplay_tags_data_driven.md) · [G1 Gameplay Framework](G1_gameplay_framework.md) · [Unreal Rules](../unreal-arch-rules.md)

The Smart Objects system is Unreal Engine 5's framework for defining **interactable slots in the world** — places where AI (and optionally players) can perform context-specific behaviors like sitting on a bench, using a workstation, eating at a table, or taking cover behind a wall. Instead of hardcoding interaction logic on each actor, Smart Objects decouple the **what** (the interaction behavior) from the **where** (the physical slot in the world), using a reservation system to prevent conflicts. This guide covers the core classes, slot definitions, behavior definitions, integration with StateTree and Behavior Trees, and practical patterns for both AI and player interactions.

---

## Why Smart Objects?

Without Smart Objects, world interactions accumulate these problems:

- **Logic scattered across actors** — every bench, chair, and workstation implements its own "sit down" logic
- **No conflict resolution** — two AI characters walk to the same chair simultaneously with no reservation system
- **Tight coupling** — the AI character class directly references every interactable type
- **No designer control** — adding a new interaction point requires C++ or complex Blueprint wiring

Smart Objects solve this with a **reservation-based slot system** where the object advertises what interactions it supports, and characters claim slots through a central subsystem. The interaction logic lives on the object (or in shared behavior definitions), not on the character.

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────┐
│               USmartObjectSubsystem                      │
│  (World Subsystem — central registry and claim manager)  │
│                                                          │
│  ┌─────────────────┐  ┌──────────────────┐              │
│  │ Slot Registry    │  │ Claim Tracker     │              │
│  │ (all slots in    │  │ (who has reserved │              │
│  │  the world)      │  │  which slot)      │              │
│  └─────────────────┘  └──────────────────┘              │
└─────────────────────────────────────────────────────────┘
         ▲                          ▲
         │ Register                 │ Claim / Release
    ┌────┴──────────┐         ┌────┴──────────────┐
    │ Smart Object   │         │ AI Controller /    │
    │ Component      │         │ StateTree /        │
    │ (on the bench) │         │ Behavior Tree      │
    │                │         │ (on the character) │
    │ Slots:         │         └───────────────────┘
    │ ├─ Slot 0      │
    │ └─ Slot 1      │
    │                │
    │ Definition →   │
    │ USmartObject   │
    │ Definition     │
    └────────────────┘
```

---

## Core Concepts

### USmartObjectDefinition

A `UDataAsset` that defines what a Smart Object offers. It contains:

- **Slots** — physical positions/orientations where a user stands or sits to interact
- **Default Behavior Definitions** — what happens when someone uses a slot
- **Activity Tags** — `FGameplayTagContainer` describing the activities available (e.g., `Activity.Sit`, `Activity.Work`)
- **Preconditions** — tag-based filters that must pass before the object can be found or claimed

```cpp
// Created as a Data Asset in the editor:
// USmartObjectDefinition: "SODef_Bench"
//   Slot 0: Offset (0, -50, 0), Rotation (0, 0, 0)
//     Activity Tags: Activity.Sit, Activity.Rest
//     Behavior: BehaviorDef_SitDown
//   Slot 1: Offset (0, 50, 0), Rotation (0, 180, 0)
//     Activity Tags: Activity.Sit, Activity.Rest
//     Behavior: BehaviorDef_SitDown
```

### USmartObjectComponent

An `UActorComponent` placed on world actors to register them as Smart Objects. It references a `USmartObjectDefinition` and registers/unregisters slots with the `USmartObjectSubsystem` automatically.

```cpp
// In the editor, add USmartObjectComponent to your bench Blueprint
// Set its SmartObjectDefinition to "SODef_Bench"
// The component handles registration with the subsystem on BeginPlay
```

### USmartObjectSubsystem

The world subsystem that manages the entire lifecycle:

- **Registration** — Smart Object Components register their slots on `BeginPlay`
- **Finding** — Characters query for available slots matching tag filters and spatial criteria
- **Claiming** — A character reserves a slot, preventing others from using it
- **Using** — The character begins the interaction behavior
- **Releasing** — The slot is freed when the interaction completes

### FSmartObjectClaimHandle

An opaque handle returned when a slot is successfully claimed. Used to track the claim through the use/release lifecycle. Always check `IsValid()` before using.

---

## Slot Configuration

Each slot in a `USmartObjectDefinition` has:

| Property | Purpose |
|----------|---------|
| **Offset / Rotation** | Local-space transform relative to the owning actor |
| **Activity Tags** | `FGameplayTagContainer` describing what the slot offers |
| **User Tags** | Tags the user must have to be eligible |
| **Behavior Definitions** | Array of `USmartObjectBehaviorDefinition` subclasses |
| **Selection Preconditions** | World condition checks (gameplay tag queries, custom logic) |

### Multiple Slots

A single Smart Object can have multiple slots for concurrent users:

```
Table Smart Object:
  Slot 0: Chair position (left)   — Activity.Sit, Activity.Eat
  Slot 1: Chair position (right)  — Activity.Sit, Activity.Eat
  Slot 2: Chair position (across) — Activity.Sit, Activity.Eat
  Slot 3: Standing position       — Activity.Serve (waiter)
```

Each slot is independently claimable. When Slot 0 is claimed, Slots 1-3 remain available.

---

## Behavior Definitions

`USmartObjectBehaviorDefinition` is the base class for defining what happens when a slot is used. UE5 ships two key subclasses:

### USmartObjectGameplayBehaviorDefinition

Links to a `UGameplayBehavior` class that executes logic when the Smart Object is used. Gameplay Behaviors are modular, reusable actions:

```cpp
UCLASS()
class UGB_SitDown : public UGameplayBehavior
{
    GENERATED_BODY()

public:
    UPROPERTY(EditAnywhere, Category = "Animation")
    UAnimMontage* SitMontage;

    virtual bool Trigger(AActor& Avatar, const UGameplayBehaviorConfig* Config,
                         AActor* SmartObjectOwner) override
    {
        // Move to slot position, play sit animation
        if (ACharacter* Character = Cast<ACharacter>(&Avatar))
        {
            Character->PlayAnimMontage(SitMontage);
            return true;
        }
        return false;
    }

    virtual void EndBehavior(AActor& Avatar, const UGameplayBehaviorConfig* Config,
                             AActor* SmartObjectOwner) override
    {
        // Stand up, release slot
        if (ACharacter* Character = Cast<ACharacter>(&Avatar))
        {
            Character->StopAnimMontage(SitMontage);
        }
    }
};
```

### Custom Behavior Definitions

For StateTree integration, you can create behavior definitions that feed parameters into a StateTree task rather than executing standalone logic.

---

## Finding and Claiming Slots (C++)

### Basic Query Flow

```cpp
void AMyAIController::FindAndUseSeat()
{
    USmartObjectSubsystem* SOSubsystem = USmartObjectSubsystem::GetCurrent(GetWorld());
    if (!SOSubsystem) return;

    // Build a request filter
    FSmartObjectRequestFilter Filter;
    Filter.ActivityRequirements.AddTag(TAG_Activity_Sit);

    // Optional: spatial query around the AI's location
    FSmartObjectRequest Request(GetPawn()->GetActorLocation(), Filter);
    Request.QueryBox = FBox(FVector(-500), FVector(500));  // 10m search radius

    // Find candidates
    TArray<FSmartObjectRequestResult> Results;
    SOSubsystem->FindSmartObjects(Request, Results);

    if (Results.Num() == 0) return;

    // Claim the best result
    FSmartObjectClaimHandle ClaimHandle = SOSubsystem->Claim(Results[0]);
    if (!ClaimHandle.IsValid()) return;

    // Use the claimed slot — this triggers the behavior definition
    const USmartObjectBehaviorDefinition* BehaviorDef =
        SOSubsystem->Use<USmartObjectGameplayBehaviorDefinition>(ClaimHandle);

    // Store the handle to release later
    ActiveClaimHandle = ClaimHandle;
}

void AMyAIController::StopUsingSeat()
{
    if (USmartObjectSubsystem* SOSubsystem = USmartObjectSubsystem::GetCurrent(GetWorld()))
    {
        SOSubsystem->Release(ActiveClaimHandle);
        ActiveClaimHandle = FSmartObjectClaimHandle();
    }
}
```

### Claim Lifecycle

```
FindSmartObjects()  →  Claim()  →  Use()  →  Release()
     │                    │           │          │
     │ Returns candidates │ Reserves  │ Starts   │ Frees
     │ (not reserved)     │ the slot  │ behavior │ the slot
```

**Important:** Always release claims when done. Leaked claims permanently block slots.

---

## StateTree Integration

Smart Objects integrate naturally with UE5's StateTree system (see G25). The `SmartObject` plugin provides StateTree tasks for finding, claiming, and using Smart Objects:

### USmartObjectTask_FindAndClaim

A StateTree task that finds and claims a Smart Object matching tag criteria. Outputs the `FSmartObjectClaimHandle` for downstream tasks.

### USmartObjectTask_UseClaimedObject

Takes a claim handle and begins using the Smart Object, triggering its behavior definition.

### Example StateTree Flow

```
StateTree: AI_CityResident
  ├─ Root
  │   ├─ State: Idle
  │   │   ├─ Transition: Random timer → FindSeat
  │   │
  │   ├─ State: FindSeat
  │   │   ├─ Task: SmartObject_FindAndClaim (Activity.Sit)
  │   │   ├─ Transition: Success → MoveTo
  │   │   ├─ Transition: Failure → Idle
  │   │
  │   ├─ State: MoveTo
  │   │   ├─ Task: MoveTo (claim slot location)
  │   │   ├─ Transition: Success → Sitting
  │   │   ├─ Transition: Failure → Release + Idle
  │   │
  │   ├─ State: Sitting
  │   │   ├─ Task: SmartObject_UseClaimedObject
  │   │   ├─ Transition: Timer (30-120s) → Release + Idle
```

---

## Behavior Tree Integration

For projects using Behavior Trees instead of StateTree, Smart Objects can be queried and used via custom tasks or the `GameplayBehaviorSmartObjects` plugin:

```cpp
// BTTask_UseSmartObject — custom Behavior Tree task
EBTNodeResult::Type UBTTask_UseSmartObject::ExecuteTask(
    UBehaviorTreeComponent& OwnerComp, uint8* NodeMemory)
{
    USmartObjectSubsystem* SOSubsystem = USmartObjectSubsystem::GetCurrent(GetWorld());
    AAIController* AIController = OwnerComp.GetAIOwner();

    FSmartObjectRequestFilter Filter;
    Filter.ActivityRequirements = ActivityTagFilter;

    FSmartObjectRequest Request(
        AIController->GetPawn()->GetActorLocation(), Filter);

    TArray<FSmartObjectRequestResult> Results;
    SOSubsystem->FindSmartObjects(Request, Results);

    if (Results.IsEmpty()) return EBTNodeResult::Failed;

    FSmartObjectClaimHandle Handle = SOSubsystem->Claim(Results[0]);
    if (!Handle.IsValid()) return EBTNodeResult::Failed;

    // Store handle in blackboard for release later
    OwnerComp.GetBlackboardComponent()->SetValueAsObject(
        ClaimHandleKey.SelectedKeyName, /* ... */);

    return EBTNodeResult::InProgress;
}
```

---

## Player Interactions

While Smart Objects were designed primarily for AI, they work with player characters too. The key difference is the interaction trigger — players need explicit input rather than AI decision-making:

```cpp
// In your player interaction component
void UPlayerInteractionComponent::TryInteractWithSmartObject()
{
    USmartObjectSubsystem* SOSubsystem = USmartObjectSubsystem::GetCurrent(GetWorld());
    APawn* PlayerPawn = Cast<APawn>(GetOwner());

    // Find nearby Smart Objects with player-compatible activities
    FSmartObjectRequestFilter Filter;
    Filter.ActivityRequirements.AddTag(TAG_Activity_PlayerInteract);

    FSmartObjectRequest Request(PlayerPawn->GetActorLocation(), Filter);
    Request.QueryBox = FBox(FVector(-150), FVector(150));  // Smaller radius for player

    TArray<FSmartObjectRequestResult> Results;
    SOSubsystem->FindSmartObjects(Request, Results);

    if (Results.IsEmpty()) return;

    // Claim and use
    CurrentClaim = SOSubsystem->Claim(Results[0]);
    if (CurrentClaim.IsValid())
    {
        SOSubsystem->Use<USmartObjectGameplayBehaviorDefinition>(CurrentClaim);
    }
}
```

---

## Tag-Based Filtering

Smart Objects use Gameplay Tags extensively for matching:

### Activity Tags

Tags on slots describing what the interaction offers. Queried by characters looking for specific activities.

```
Activity.Sit          — Any sitting interaction
Activity.Sit.Bench    — Sitting on a bench specifically
Activity.Work         — Using a workstation
Activity.Eat          — Eating at a table
Activity.Cover        — Taking cover (combat AI)
```

### User Tags

Tags the claiming character must have to be eligible:

```
// Slot requires the user to have "Role.Civilian" tag
// A soldier AI without this tag won't find this slot
UserTagFilter: Role.Civilian
```

### Preconditions

More complex filtering using `FWorldConditionQueryDefinition` — can check world state, time of day, quest progress, etc.

---

## World Partition Integration

Smart Objects work with World Partition (see G12). When a `USmartObjectComponent` is in a streamed level:

- Slots register with the subsystem when the actor streams in
- Slots unregister when the actor streams out
- Active claims on streaming-out slots are automatically released
- The `USmartObjectSubsystem` maintains a spatial hash for efficient queries across large worlds

---

## Performance Considerations

- **Spatial queries** — the subsystem uses spatial hashing; queries are O(nearby slots), not O(all slots in world)
- **Claim overhead** — claiming/releasing is lightweight (handle-based, no actor spawning)
- **Behavior execution** — the behavior definition determines cost; keep montages and logic simple for background NPCs
- **Slot count** — thousands of slots perform well; the bottleneck is usually the AI decision-making, not the Smart Object system itself
- **Tick-free** — Smart Object slots don't tick; only active behaviors consume CPU

---

## Common Mistakes

| Mistake | Fix |
|---------|-----|
| Forgetting to release claims | Always release in `EndBehavior`, on task abort, and on character death |
| Not checking `IsValid()` on claim handles | Claims can fail if the slot was taken between find and claim |
| Putting interaction logic on the character | Put it in `UGameplayBehavior` subclasses — keeps characters clean |
| Using Smart Objects without Gameplay Tags | Tags are essential for filtering; design your activity tag hierarchy early |
| Ignoring streaming | Test Smart Objects in World Partition levels; handle streaming-out during active use |
| One slot per object | Use multiple slots for multi-user interactions (tables, vehicles, etc.) |

---

## Setup Checklist

1. Enable the **SmartObjects** plugin and **GameplayBehaviors** plugin in your `.uproject`
2. Enable the **GameplayBehaviorSmartObjects** plugin if using Behavior Trees
3. Design your activity tag hierarchy under `Activity.*`
4. Create `USmartObjectDefinition` data assets for each interaction type
5. Create `UGameplayBehavior` subclasses for each behavior (sit, work, eat, etc.)
6. Add `USmartObjectComponent` to world actors and assign definitions
7. Integrate with StateTree or Behavior Tree for AI-driven usage
8. For player interaction: add a proximity query triggered by input
9. Test claim/release lifecycle — verify no leaked claims

---

## Further Reading

- [UE5 Smart Objects Overview](https://dev.epicgames.com/documentation/en-us/unreal-engine/smart-objects-in-unreal-engine---overview) — official documentation
- [UE5 Smart Objects Quick Start](https://dev.epicgames.com/documentation/en-us/unreal-engine/smart-objects-in-unreal-engine---quick-start) — step-by-step tutorial
- [Smart Ant Demo: StateTree + Smart Objects](https://forums.unrealengine.com/t/talks-and-demos-smart-ant-building-ai-behavior-with-state-tree-and-smart-objects/2705288) — Epic's demo project
- [Smart Objects and You (Medium)](https://bigm227.medium.com/smart-objects-and-you-in-ue5-pt-1-what-is-smart-object-a9d3e579a077) — community walkthrough
