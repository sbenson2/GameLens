# G32 — Gameplay Tags & Data-Driven Design in Unreal Engine 5

> **Category:** guide · **Engine:** Unreal Engine 5.4+ · **Related:** [G13 Gameplay Ability System](G13_gameplay_ability_system.md) · [G1 Gameplay Framework](G1_gameplay_framework.md) · [G15 Blueprint/C++ Workflow](G15_blueprint_cpp_workflow.md) · [Unreal Rules](../unreal-arch-rules.md)

Gameplay Tags (`FGameplayTag`) are Unreal Engine's hierarchical labelling system — lightweight, editor-friendly identifiers that replace scattered booleans, enums, and magic strings throughout your codebase. Combined with Data Tables and Data Assets, they form the backbone of data-driven gameplay where designers iterate without touching C++. This guide covers tag declaration, querying, containers, data-driven patterns, and practical integration with GAS, AI, and inventory systems.

---

## Why Gameplay Tags?

A typical game project accumulates state-tracking problems fast:

- **Boolean explosion** — `bIsStunned`, `bIsBurning`, `bIsInvisible`, `bIsShielded` multiply across actors with no unified query mechanism
- **Enum rigidity** — adding a new damage type means recompiling every switch statement
- **String fragility** — `"Fire"` vs `"fire"` vs `"FIRE"` causes silent mismatches at runtime
- **Cross-system coupling** — the combat system directly references the UI system's status enums

Gameplay Tags solve all of these. A tag like `Status.Debuff.Stun` is hierarchical, validated at edit-time, fast to query at runtime (backed by `FName` internally), and replicated efficiently in multiplayer.

---

## Core Concepts

### FGameplayTag

A single tag — an `FName` registered in the global `UGameplayTagsManager` dictionary. Tags are **never constructed from raw strings at runtime**; they are always looked up from the registry.

```cpp
// UE5 — Native tag declaration (preferred in C++)
// Header (.h)
UE_DECLARE_GAMEPLAY_TAG_EXTERN(TAG_Status_Stunned);

// Source (.cpp)
UE_DEFINE_GAMEPLAY_TAG(TAG_Status_Stunned, "Status.Debuff.Stunned");
```

The `UE_DECLARE_GAMEPLAY_TAG_EXTERN` / `UE_DEFINE_GAMEPLAY_TAG` macro pair (introduced in UE 4.27, standard in UE5) is the recommended way to define tags in C++. This ensures tags exist at startup and are validated at compile time.

**Alternative — runtime request (less safe):**

```cpp
// Works but not validated at compile time
FGameplayTag StunTag = FGameplayTag::RequestGameplayTag(FName("Status.Debuff.Stunned"));
// Returns invalid tag if the string doesn't match a registered tag
```

### FGameplayTagContainer

A container holding multiple tags. **Always use `FGameplayTagContainer` instead of `TArray<FGameplayTag>`** — the container provides optimized query methods and proper replication.

```cpp
UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Tags")
FGameplayTagContainer ActiveTags;

// Add / remove
ActiveTags.AddTag(TAG_Status_Stunned);
ActiveTags.RemoveTag(TAG_Status_Stunned);

// Query methods
bool bHasStun = ActiveTags.HasTag(TAG_Status_Stunned);           // Exact match
bool bHasAnyDebuff = ActiveTags.HasTag(TAG_Status_Debuff);       // Matches parent: true if ANY child of Status.Debuff is present
bool bHasAll = ActiveTags.HasAll(RequiredTagContainer);           // All tags in RequiredTagContainer are present
bool bHasAny = ActiveTags.HasAny(QueryTagContainer);             // At least one tag matches
```

### FGameplayTagQuery

For complex matching logic (AND / OR / NOT combinations), use `FGameplayTagQuery`:

```cpp
// "Has any fire tag AND does NOT have immunity to fire"
FGameplayTagQuery FireVulnerable = FGameplayTagQuery::MakeQuery_MatchAllExpressions(
    FGameplayTagQueryExpression()
        .AnyTagsMatch()
            .AddTag(TAG_Element_Fire)
        .NoTagsMatch()
            .AddTag(TAG_Immunity_Fire)
);

bool bCanBurn = FireVulnerable.Matches(TargetTags);
```

---

## Tag Registration Methods

### 1. Project Settings (DefaultGameplayTags.ini)

Navigate to **Project Settings > Gameplay Tags** to add tags through the editor UI. Tags are stored in `Config/DefaultGameplayTags.ini`. Best for designer-managed tags.

### 2. Data Table Import

Create a `DataTable` with row type `FGameplayTagTableRow`. Tags can be imported from CSV or Excel, useful for large tag sets managed externally.

### 3. Native C++ Tags (Recommended for Code)

```cpp
// In a shared header (e.g., MyProjectTags.h)
#pragma once
#include "NativeGameplayTags.h"

UE_DECLARE_GAMEPLAY_TAG_EXTERN(TAG_Weapon_Melee);
UE_DECLARE_GAMEPLAY_TAG_EXTERN(TAG_Weapon_Ranged);
UE_DECLARE_GAMEPLAY_TAG_EXTERN(TAG_Status_Debuff_Stunned);
UE_DECLARE_GAMEPLAY_TAG_EXTERN(TAG_Status_Debuff_Burning);
UE_DECLARE_GAMEPLAY_TAG_EXTERN(TAG_Ability_Attack_Light);
UE_DECLARE_GAMEPLAY_TAG_EXTERN(TAG_Ability_Attack_Heavy);

// In the corresponding .cpp
#include "MyProjectTags.h"

UE_DEFINE_GAMEPLAY_TAG(TAG_Weapon_Melee,            "Weapon.Melee");
UE_DEFINE_GAMEPLAY_TAG(TAG_Weapon_Ranged,           "Weapon.Ranged");
UE_DEFINE_GAMEPLAY_TAG(TAG_Status_Debuff_Stunned,   "Status.Debuff.Stunned");
UE_DEFINE_GAMEPLAY_TAG(TAG_Status_Debuff_Burning,   "Status.Debuff.Burning");
UE_DEFINE_GAMEPLAY_TAG(TAG_Ability_Attack_Light,    "Ability.Attack.Light");
UE_DEFINE_GAMEPLAY_TAG(TAG_Ability_Attack_Heavy,    "Ability.Attack.Heavy");
```

### 4. GameplayTagsSettings.ini (Plugin Tags)

Plugins can ship their own tag tables via `.ini` files, keeping plugin tags self-contained.

---

## Hierarchy Best Practices

Design your tag hierarchy like a taxonomy — broad categories narrowing to specifics:

```
Status
  Status.Buff
    Status.Buff.Haste
    Status.Buff.Shield
  Status.Debuff
    Status.Debuff.Stunned
    Status.Debuff.Burning
    Status.Debuff.Poisoned
Ability
  Ability.Attack
    Ability.Attack.Light
    Ability.Attack.Heavy
  Ability.Movement
    Ability.Movement.Dash
    Ability.Movement.Teleport
Element
  Element.Fire
  Element.Ice
  Element.Lightning
Weapon
  Weapon.Melee
    Weapon.Melee.Sword
    Weapon.Melee.Axe
  Weapon.Ranged
    Weapon.Ranged.Bow
    Weapon.Ranged.Gun
```

**Rules of thumb:**

- **3-4 levels max** — deeper hierarchies get unwieldy
- **Singular nouns** — `Weapon.Melee.Sword` not `Weapons.Melee.Swords`
- **No redundancy** — don't duplicate info already in the hierarchy (e.g., avoid `Status.Debuff.DebuffStunned`)
- **Plan for queries** — if you'll often ask "does this actor have any debuff?", make sure all debuffs share a parent

---

## UPROPERTY Meta Filtering

Restrict which tags appear in editor dropdowns using the `Categories` meta specifier:

```cpp
// Only shows tags under "Status.Debuff" in the picker
UPROPERTY(EditAnywhere, meta = (Categories = "Status.Debuff"))
FGameplayTag DebuffType;

// Only shows tags under "Ability" in the container picker
UPROPERTY(EditAnywhere, meta = (Categories = "Ability"))
FGameplayTagContainer GrantedAbilities;
```

This prevents designers from accidentally assigning a weapon tag to a debuff slot.

---

## Data-Driven Patterns

### Pattern 1: DataAsset with Tags

```cpp
UCLASS()
class UItemDataAsset : public UPrimaryDataAsset
{
    GENERATED_BODY()
public:
    UPROPERTY(EditDefaultsOnly, Category = "Item")
    FText DisplayName;

    UPROPERTY(EditDefaultsOnly, Category = "Item")
    TSoftObjectPtr<UTexture2D> Icon;

    UPROPERTY(EditDefaultsOnly, Category = "Item")
    FGameplayTagContainer ItemTags;  // e.g., "Item.Weapon.Sword", "Element.Fire"

    UPROPERTY(EditDefaultsOnly, meta = (Categories = "Item.Rarity"))
    FGameplayTag Rarity;  // e.g., "Item.Rarity.Legendary"

    // Query helpers
    bool MatchesFilter(const FGameplayTagContainer& Filter) const
    {
        return ItemTags.HasAny(Filter);
    }
};
```

Designers create DataAssets per item, assigning tags without code. Inventory UI filters items by querying `ItemTags.HasAny(ActiveFilterTags)`.

### Pattern 2: DataTable-Driven Loot

```cpp
USTRUCT(BlueprintType)
struct FLootTableRow : public FTableRowBase
{
    GENERATED_BODY()

    UPROPERTY(EditAnywhere)
    TSoftClassPtr<AActor> ItemClass;

    UPROPERTY(EditAnywhere)
    float DropWeight = 1.0f;

    UPROPERTY(EditAnywhere, Category = "Filtering")
    FGameplayTagContainer RequiredTags;   // Context must have ALL of these

    UPROPERTY(EditAnywhere, Category = "Filtering")
    FGameplayTagContainer BlockedTags;    // Context must have NONE of these
};
```

The loot roller checks each row against the current context tags (biome, player level, quest state) — all designer-configurable, zero code changes per new item.

### Pattern 3: Tag-Based Event Routing

```cpp
// Central event dispatcher
DECLARE_DYNAMIC_MULTICAST_DELEGATE_TwoParams(FOnGameplayTagEvent, FGameplayTag, Tag, int32, Count);

// In your game state or subsystem
UPROPERTY(BlueprintAssignable)
FOnGameplayTagEvent OnTagAdded;

UPROPERTY(BlueprintAssignable)
FOnGameplayTagEvent OnTagRemoved;

// Systems subscribe to tag categories they care about:
// - UI listens for Status.Debuff.* to show debuff icons
// - Audio listens for Ambient.* to adjust music layers
// - AI listens for Status.* on their perception targets
```

---

## GAS Integration

Gameplay Tags are deeply integrated with the Gameplay Ability System:

- **Ability Tags** — identify the ability (`Ability.Attack.Heavy`)
- **Activation Required/Blocked Tags** — control when abilities can fire
- **Cancel Abilities With Tag** — auto-cancel conflicting abilities
- **Gameplay Effects** grant/remove tags via `InheritableOwnedTagsContainer`
- **Gameplay Cues** fire based on tag events (`GameplayCue.Hit.Fire`)

```cpp
// In a UGameplayAbility subclass
AbilityTags.AddTag(TAG_Ability_Attack_Heavy);
ActivationRequiredTags.AddTag(TAG_Status_Grounded);      // Must be on ground
ActivationBlockedTags.AddTag(TAG_Status_Debuff_Stunned);  // Can't attack while stunned
CancelAbilitiesWithTag.AddTag(TAG_Ability_Movement_Dash); // Cancels dash on activation
```

---

## Multiplayer Replication

Tags replicate efficiently through `FGameplayTagContainer`:

- **Fast Replication** — replicates tags by index instead of full `FName`, saving bandwidth. Requires `GameplayTags.ini` to be identical on client and server.
- Enable via `Project Settings > Gameplay Tags > Fast Replication`
- `UAbilitySystemComponent` handles tag replication automatically when using GAS

For custom replication outside GAS:

```cpp
UPROPERTY(Replicated)
FGameplayTagContainer ReplicatedTags;

void GetLifetimeReplicatedProps(TArray<FLifetimeProperty>& OutLifetimeProps) const override
{
    Super::GetLifetimeReplicatedProps(OutLifetimeProps);
    DOREPLIFETIME(AMyActor, ReplicatedTags);
}
```

---

## Performance Notes

- `FGameplayTag` comparison is an `FName` comparison — effectively a 32-bit integer compare, extremely fast
- `FGameplayTagContainer::HasTag` uses a sorted array internally — O(log n) for exact match, O(n) for parent hierarchy check
- Tag count per actor rarely exceeds a few dozen in practice — performance is never a bottleneck
- **Avoid** calling `RequestGameplayTag()` in hot loops; cache the result in a variable or use native tags

---

## Common Mistakes

| Mistake | Fix |
|---------|-----|
| Using `TArray<FGameplayTag>` | Use `FGameplayTagContainer` — built-in query methods and replication |
| Constructing tags from strings at runtime | Use `UE_DEFINE_GAMEPLAY_TAG` macros or cache `RequestGameplayTag` results |
| Flat tag hierarchy (all at root level) | Design 2-4 level hierarchies for meaningful parent queries |
| Not using `meta = (Categories = "...")` | Filter editor pickers to prevent misassignment |
| Duplicating tag checks in multiple systems | Centralize tag queries in a subsystem or component |
| Forgetting to enable Fast Replication | Enable in Project Settings for bandwidth savings in multiplayer |

---

## Quick-Start Checklist

1. Enable the **Gameplay Tags** plugin (enabled by default in UE5)
2. Create a shared header with `UE_DECLARE_GAMEPLAY_TAG_EXTERN` for core tags
3. Design your tag hierarchy on paper before implementation (refactoring tags later is painful)
4. Use `FGameplayTagContainer` on actors that need tag-based queries
5. Add `meta = (Categories = "...")` to all tag `UPROPERTY` declarations
6. If using GAS, leverage built-in tag integration for ability activation/blocking
7. Enable **Fast Replication** for multiplayer projects
8. Consider a `UDataAsset` or `DataTable` approach for designer-facing content that references tags

---

## Further Reading

- [UE5 Gameplay Tags Documentation](https://dev.epicgames.com/documentation/en-us/unreal-engine/using-gameplay-tags-in-unreal-engine) — official reference
- [Tom Looman — Why You Should Be Using GameplayTags](https://tomlooman.com/unreal-engine-gameplaytags-data-driven-design/) — data-driven design patterns
- [FGameplayTag API Reference](https://dev.epicgames.com/documentation/en-us/unreal-engine/API/Runtime/GameplayTags/FGameplayTag) — full API docs
- [FGameplayTagContainer API Reference](https://dev.epicgames.com/documentation/en-us/unreal-engine/API/Runtime/GameplayTags/FGameplayTagContainer) — container methods
