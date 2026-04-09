# G66 — Gameplay Interactions Plugin in Unreal Engine 5

> **Category:** guide · **Engine:** Unreal Engine 5.4+ (Experimental) · **Related:** [G34 Smart Objects](G34_smart_objects.md) · [G13 Gameplay Ability System](G13_gameplay_ability_system.md) · [G25 StateTree AI](G25_statetree_ai_system.md) · [G32 Gameplay Tags](G32_gameplay_tags_data_driven.md) · [G1 Gameplay Framework](G1_gameplay_framework.md) · [Unreal Rules](../unreal-arch-rules.md)

The **Gameplay Interactions** plugin is Epic's experimental framework (UE 5.4+) for building contextual, data-driven interactions between characters and the world. It unifies three existing engine systems — **Smart Objects** (defining interactable slots), **Gameplay Abilities** (executing the interaction logic), and **Gameplay Behaviors** (defining what happens) — into a single cohesive workflow. Instead of scattering custom interaction code across dozens of actor classes, you define interaction types as data assets, advertise them on world objects via Smart Object slots, and let the framework handle discovery, validation, reservation, execution, and cleanup.

---

## Why a Unified Interaction System?

Before Gameplay Interactions, common approaches to world interaction had recurring problems:

- **Line-trace + interface soup** — every interactable actor implements `IInteractable`, the player does a line trace each tick, and the interaction logic lives in dozens of per-actor Blueprint overrides
- **No reservation or conflict resolution** — two AI characters can try to use the same terminal simultaneously with no coordination
- **Duplicated validation** — "can the player interact?" checks are copy-pasted across abilities, actors, and UI widgets
- **No designer-friendly authoring** — adding a new interaction type requires programmer involvement for Blueprint wiring or C++ changes

Gameplay Interactions solves this by layering on top of Smart Objects and GAS:

```
┌─────────────────────────────────────────────────────┐
│              GAMEPLAY INTERACTIONS                    │
│  (Orchestration: discovery → validation → execution) │
├──────────┬──────────────────┬───────────────────────┤
│  Smart   │  Gameplay        │  Gameplay             │
│  Objects │  Abilities       │  Behaviors            │
│  (WHERE) │  (HOW)           │  (WHAT HAPPENS)       │
│  Slots,  │  Activation,     │  Montages, state      │
│  claims  │  costs, effects  │  changes, rewards     │
└──────────┴──────────────────┴───────────────────────┘
```

---

## Plugin Setup

### Enable Required Plugins

The Gameplay Interactions plugin depends on several other plugins. Enable all of them:

| Plugin | Purpose |
|--------|---------|
| **GameplayInteractions** | Core interaction framework |
| **SmartObjects** | Slot registration and claiming |
| **GameplayAbilities** | Ability activation and effects |
| **GameplayBehaviors** | Behavior definitions and execution |
| **GameplayStateTree** | StateTree integration for AI-driven interactions |

In your `.uproject`:

```json
{
  "Plugins": [
    { "Name": "GameplayInteractions", "Enabled": true },
    { "Name": "SmartObjects", "Enabled": true },
    { "Name": "GameplayAbilities", "Enabled": true },
    { "Name": "GameplayBehaviors", "Enabled": true },
    { "Name": "GameplayStateTree", "Enabled": true }
  ]
}
```

### Module Dependencies (C++)

```csharp
PublicDependencyModuleNames.AddRange(new string[]
{
    "GameplayInteractionsModule",
    "SmartObjectsModule",
    "GameplayAbilities",
    "GameplayBehaviors",
    "GameplayTags"
});
```

---

## Core Concepts

### Interaction Definitions (Data Assets)

An **Interaction Definition** is a data asset that describes a type of interaction:

- **Required Gameplay Tags** — tags the interacting actor must have (e.g., `Ability.CanInteract`, `Status.Alive`)
- **Blocked Gameplay Tags** — tags that prevent interaction (e.g., `Status.Stunned`, `Status.Interacting`)
- **Gameplay Ability Class** — the ability granted and activated when the interaction starts
- **Gameplay Behavior** — optional behavior definition for AI-driven interactions
- **Interaction Type Tag** — categorization tag (e.g., `Interaction.Use`, `Interaction.Pickup`, `Interaction.Talk`)

### Smart Object Slots as Interaction Points

Each interactable object in the world uses a **Smart Object Component** with slots that reference Interaction Definitions:

```
┌─────────────────────────────────────────┐
│  Workbench Actor                         │
│  ├── Static Mesh (visual)                │
│  └── Smart Object Component              │
│       └── Slot: "Use Workbench"          │
│            ├── Activity Tags: Craft      │
│            ├── User Tags Filter          │
│            └── Behavior: BP_CraftBehavior│
└─────────────────────────────────────────┘
```

### Interaction Flow

1. **Discovery** — the interaction subsystem finds nearby Smart Object slots matching the character's tags
2. **Validation** — checks required/blocked tags, slot availability, distance, and line-of-sight
3. **Reservation** — claims the Smart Object slot so no other character can use it
4. **Activation** — grants and activates the associated Gameplay Ability on the character
5. **Execution** — the ability runs its logic (montages, effects, state changes)
6. **Completion** — the ability ends, the slot claim is released, and cleanup runs

---

## Implementation Patterns

### Pattern: Player Interaction Component

Create an interaction component that handles discovery and input:

```cpp
UCLASS(ClassGroup=(Interaction), meta=(BlueprintSpawnableComponent))
class UPlayerInteractionComponent : public UActorComponent
{
    GENERATED_BODY()

public:
    // Call from Enhanced Input action binding
    UFUNCTION(BlueprintCallable, Category = "Interaction")
    void TryInteract();

    // Called each frame or on overlap to find nearby interactables
    UFUNCTION(BlueprintCallable, Category = "Interaction")
    void UpdateBestInteractionCandidate();

    UPROPERTY(BlueprintReadOnly, Category = "Interaction")
    FSmartObjectClaimHandle CurrentClaim;

    UPROPERTY(BlueprintReadOnly, Category = "Interaction")
    TObjectPtr<const USmartObjectDefinition> BestCandidate;

private:
    void OnInteractionEnded(const FSmartObjectClaimHandle& Handle);
};
```

### Pattern: Duration-Based (Hold) Interactions

For interactions requiring a held input:

```cpp
// In your Gameplay Ability
void UGA_HoldInteract::ActivateAbility(
    const FGameplayAbilitySpecHandle Handle,
    const FGameplayAbilityActorInfo* ActorInfo,
    const FGameplayAbilityActivationInfo ActivationInfo,
    const FGameplayEventData* TriggerEventData)
{
    // Start a WaitDelay task for the hold duration
    UAbilityTask_WaitDelay* WaitTask =
        UAbilityTask_WaitDelay::WaitDelay(this, HoldDuration);
    WaitTask->OnFinish.AddDynamic(this, &UGA_HoldInteract::OnHoldComplete);
    WaitTask->ReadyForActivation();

    // Play a looping interaction montage
    UAbilityTask_PlayMontageAndWait* MontageTask =
        UAbilityTask_PlayMontageAndWait::CreatePlayMontageAndWaitProxy(
            this, NAME_None, InteractMontage, 1.0f);
    MontageTask->ReadyForActivation();
}
```

### Pattern: AI-Driven Interactions with StateTree

For AI characters, interactions are triggered through StateTree tasks:

1. **Find Smart Object Task** — queries the Smart Object subsystem for slots matching criteria
2. **Claim Smart Object Task** — reserves the found slot
3. **Use Smart Object Task** — moves the AI to the slot and activates the associated behavior
4. **Gameplay Behavior** — executes the interaction logic (play animation, modify world state, etc.)

```
StateTree: AI_Worker
├── Selector
│   ├── Sequence: "Find Work"
│   │   ├── FindSmartObject (Tag: Activity.Craft)
│   │   ├── ClaimSmartObject
│   │   ├── MoveToSmartObject
│   │   └── UseSmartObject → BP_CraftBehavior
│   └── Sequence: "Idle"
│       └── Wait (5-10s)
```

---

## Interaction Types

### Instant Interactions

Complete immediately on activation — item pickups, button presses, door toggles:

```cpp
// Gameplay Ability: instant completion
void UGA_PickupItem::ActivateAbility(...)
{
    // Grant item to inventory
    if (UInventoryComponent* Inv = GetInventoryComponent(ActorInfo))
    {
        Inv->AddItem(ItemDefinition, Quantity);
    }

    // Release the Smart Object claim
    EndAbility(Handle, ActorInfo, ActivationInfo, true, false);
}
```

### Sustained Interactions

Run continuously until interrupted or completed — crafting stations, turret operation, hacking minigames:

- The Gameplay Ability stays active while the interaction is ongoing
- The Smart Object slot remains claimed for the duration
- Use `AbilityTask` subclasses for timed or conditional completion

### Conditional Interactions

Require specific items, abilities, or game state — locked doors, skill-gated terminals:

```cpp
// Override CanActivateAbility for pre-validation
bool UGA_UnlockDoor::CanActivateAbility(
    const FGameplayAbilitySpecHandle Handle,
    const FGameplayAbilityActorInfo* ActorInfo,
    const FGameplayTagContainer* SourceTags,
    const FGameplayTagContainer* TargetTags,
    FGameplayTagContainer* OptionalRelevantTags) const
{
    if (!Super::CanActivateAbility(Handle, ActorInfo, SourceTags,
                                    TargetTags, OptionalRelevantTags))
        return false;

    // Check if player has the required key
    const UInventoryComponent* Inv = GetInventoryComponent(ActorInfo);
    return Inv && Inv->HasItem(RequiredKeyTag);
}
```

---

## UI Integration

Show interaction prompts by listening for interaction candidates:

```cpp
// In your HUD or Widget class
void UInteractionPromptWidget::UpdatePrompt(
    const USmartObjectDefinition* Candidate)
{
    if (Candidate)
    {
        // Extract interaction name and input action from the definition
        PromptText->SetText(Candidate->GetInteractionDisplayName());
        InputIcon->SetBrushFromTexture(GetInputIconForAction(
            Candidate->GetInputAction()));
        SetVisibility(ESlateVisibility::HitTestInvisible);
    }
    else
    {
        SetVisibility(ESlateVisibility::Collapsed);
    }
}
```

---

## Networking Considerations

- **Smart Object claims are server-authoritative** — the server validates and grants claims; clients predict the UI prompt but wait for server confirmation before executing
- **Gameplay Abilities handle replication** — use GAS's built-in prediction and replication for multiplayer interactions
- **Slot state replication** — Smart Object slot states (free, claimed, occupied, disabled) replicate to clients for accurate UI display
- **Cancel on disconnect** — release claims automatically when a client disconnects to prevent permanently locked slots

---

## Performance Tips

- **Spatial queries**: Smart Object subsystem uses spatial hashing — keep interaction range reasonable (< 5m for most interactions) to minimize query results
- **Tag filtering**: Use specific Gameplay Tags in slot definitions to narrow query results early, before distance checks
- **Pooling interaction abilities**: If many actors share the same interaction type, the ability is granted once and reactivated — no per-interaction allocation
- **Disable unused slots**: Call `SetSlotEnabled(false)` on Smart Object slots that are temporarily unavailable rather than destroying and recreating them

---

## Common Pitfalls

| Pitfall | Solution |
|---------|----------|
| Interaction prompt flickers | Debounce candidate selection — require the candidate to be stable for 2-3 frames before showing prompt |
| AI characters ignore interaction objects | Verify Smart Object slots have correct `ActivityTags` matching the StateTree query |
| Player can interact while stunned | Add `Status.Stunned` to the interaction's Blocked Tags list |
| Slot stays claimed after ability cancelled | Ensure `EndAbility` always runs — bind to `OnAbilityEnded` to release the claim in all exit paths |
| Multiple interaction prompts overlap | Prioritize by distance, then by interaction type tag priority |

---

## Further Reading

- [G34 Smart Objects System](G34_smart_objects.md) — the slot and reservation foundation
- [G13 Gameplay Ability System](G13_gameplay_ability_system.md) — the ability execution framework
- [G25 StateTree AI System](G25_statetree_ai_system.md) — AI-driven interaction triggers
- [Gameplay Interactions Plugin — Epic Roadmap](https://portal.productboard.com/epicgames/1-unreal-engine-public-roadmap/c/1467-gameplay-interactions-plugin-experimental)
