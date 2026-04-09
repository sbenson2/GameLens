# G65 — UMG Viewmodel (MVVM Pattern) in Unreal Engine 5

> **Category:** guide · **Engine:** Unreal Engine 5.3+ · **Related:** [G3 UMG and Common UI](G3_umg_and_common_ui.md) · [G13 Gameplay Ability System](G13_gameplay_ability_system.md) · [G15 Blueprint/C++ Workflow](G15_blueprint_cpp_workflow.md) · [G32 Gameplay Tags](G32_gameplay_tags_data_driven.md) · [Unreal Rules](../unreal-arch-rules.md)

The **UMG Viewmodel** plugin is Epic's built-in implementation of the Model-View-ViewModel (MVVM) pattern for Unreal Engine UI. Introduced as a Beta plugin in UE 5.1 and available as a built-in engine plugin since UE 5.3, it provides a first-party data-binding system that separates UI presentation (the View — your UMG widgets) from game state (the Model — your gameplay objects) through an intermediary ViewModel layer. This eliminates the common anti-pattern of widgets directly polling game objects every frame, replacing it with event-driven bindings that fire only when data actually changes.

---

## Why MVVM for Game UI?

Without a ViewModel layer, game UI code quickly accumulates these problems:

- **Tight coupling** — widgets reference specific actor classes, player controllers, or subsystems directly, making them impossible to reuse or test in isolation
- **Tick-driven polling** — widgets call `GetPlayerHealth()` every frame even when health hasn't changed, wasting CPU cycles
- **Fragile Blueprint spaghetti** — designers wire dozens of "Get" nodes on Tick to keep UI in sync, creating hard-to-debug graphs
- **No separation of concerns** — artists editing widget layout accidentally break gameplay data flow; programmers editing data flow accidentally break layout

The MVVM pattern solves this: the **ViewModel** owns the data, exposes it through **FieldNotify** properties, and the **View** (UMG widget) binds to those properties declaratively. When the ViewModel updates a value, only the bound widgets receive the change — no polling, no direct coupling.

---

## Architecture Overview

```
┌───────────────────────────────────────────────────┐
│                    MODEL LAYER                     │
│  (Game State: PlayerState, GAS, Inventory, etc.)  │
└──────────────────────┬────────────────────────────┘
                       │ Push data
                       ▼
┌───────────────────────────────────────────────────┐
│                 VIEWMODEL LAYER                    │
│  UMVVMViewModelBase subclasses                     │
│  ┌─────────────────────────────────────────────┐  │
│  │  UPROPERTY(FieldNotify) float Health;       │  │
│  │  UPROPERTY(FieldNotify) int32 AmmoCount;    │  │
│  │  UPROPERTY(FieldNotify) FText PlayerName;   │  │
│  └─────────────────────────────────────────────┘  │
│  UE_MVVM_SET_PROPERTY_VALUE(Health, NewVal);      │
│  → broadcasts change to bound Views               │
└──────────────────────┬────────────────────────────┘
                       │ Data binding
                       ▼
┌───────────────────────────────────────────────────┐
│                   VIEW LAYER                       │
│  UUserWidget subclasses (UMG Widgets)              │
│  Bindings declared in Widget Blueprint or C++      │
│  ProgressBar.Percent ← ViewModel.Health            │
│  TextBlock.Text ← ViewModel.PlayerName             │
└───────────────────────────────────────────────────┘
```

---

## Plugin Setup

### 1. Enable the Plugin

In the Unreal Editor, go to **Edit → Plugins**, search for **"UMG Viewmodel"** (listed under the UI category), and enable it. Restart the editor.

Alternatively, add to your `.uproject` file:

```json
{
  "Plugins": [
    {
      "Name": "ModelViewViewModel",
      "Enabled": true
    }
  ]
}
```

### 2. Module Dependencies (C++)

In your module's `Build.cs`, add:

```csharp
PublicDependencyModuleNames.AddRange(new string[]
{
    "Core",
    "CoreUObject",
    "Engine",
    "UMG",
    "ModelViewViewModel"   // The MVVM plugin module
});
```

---

## Creating a ViewModel (C++)

ViewModels inherit from `UMVVMViewModelBase`. Properties that should notify the View of changes use the `FieldNotify` specifier.

```cpp
// HUDViewModel.h
#pragma once

#include "MVVMViewModelBase.h"
#include "HUDViewModel.generated.h"

UCLASS(BlueprintType)
class MYGAME_API UHUDViewModel : public UMVVMViewModelBase
{
    GENERATED_BODY()

public:
    // FieldNotify properties — changes are broadcast to bound Views
    UPROPERTY(BlueprintReadOnly, FieldNotify, Getter, Setter,
              meta = (AllowPrivateAccess = "true"))
    float Health = 1.0f;

    UPROPERTY(BlueprintReadOnly, FieldNotify, Getter, Setter,
              meta = (AllowPrivateAccess = "true"))
    int32 AmmoCount = 0;

    UPROPERTY(BlueprintReadOnly, FieldNotify, Getter, Setter,
              meta = (AllowPrivateAccess = "true"))
    FText PlayerName;

private:
    // Getter/Setter pairs (required by FieldNotify with Getter/Setter)
    float GetHealth() const { return Health; }
    void SetHealth(float NewHealth)
    {
        // UE_MVVM_SET_PROPERTY_VALUE only broadcasts if the value changed
        UE_MVVM_SET_PROPERTY_VALUE(Health, NewHealth);
    }

    int32 GetAmmoCount() const { return AmmoCount; }
    void SetAmmoCount(int32 NewAmmo)
    {
        UE_MVVM_SET_PROPERTY_VALUE(AmmoCount, NewAmmo);
    }

    FText GetPlayerName() const { return PlayerName; }
    void SetPlayerName(FText NewName)
    {
        UE_MVVM_SET_PROPERTY_VALUE(PlayerName, NewName);
    }
};
```

### Key Macros

| Macro | Purpose |
|-------|---------|
| `UE_MVVM_SET_PROPERTY_VALUE(Prop, Val)` | Sets the property and broadcasts `FieldValueChanged` only if the value differs from the current value. Use this in setters. |
| `UE_MVVM_BROADCAST_FIELD_VALUE_CHANGED(Prop)` | Manually broadcasts that a field changed — use when you modify a property directly (e.g., modifying array contents in-place). |

---

## Creating a ViewModel (Blueprint)

1. **Create a new Blueprint class** with parent `MVVMViewModelBase`
2. Add variables and mark them as **FieldNotify** in the variable details
3. Use the **Set [Property] with Broadcast** node (auto-generated) to update values — this is the Blueprint equivalent of `UE_MVVM_SET_PROPERTY_VALUE`

---

## Binding Views to ViewModels

### In the Widget Blueprint Editor

1. Open your UMG Widget Blueprint
2. In the **Viewmodel** panel (Window → Viewmodel), add your ViewModel class
3. Select a widget (e.g., a Progress Bar), open the **Bindings** panel
4. Create a binding: **Source** = ViewModel property (e.g., `Health`), **Destination** = widget property (e.g., `Percent`)
5. Optionally add a **Conversion Function** if types don't match directly

The binding system supports:

- **One-way bindings** — ViewModel → Widget (most common: display data)
- **Two-way bindings** — ViewModel ↔ Widget (e.g., text input fields)
- **Conversion functions** — transform data between source and destination (e.g., float health → FText "75%")
- **One-time bindings** — set once on initialization, no ongoing observation

### In C++

```cpp
// In your UUserWidget subclass
void UMyHUDWidget::NativeConstruct()
{
    Super::NativeConstruct();

    // Retrieve the ViewModel (set via Widget Blueprint or code)
    UHUDViewModel* VM = Cast<UHUDViewModel>(GetViewModel());
    if (!VM) return;

    // Manual binding (prefer the declarative editor approach when possible)
    VM->GetFieldNotifyDelegate(
        UHUDViewModel::FFieldNotificationClassDescriptor::Health
    ).AddUObject(this, &UMyHUDWidget::OnHealthChanged);
}
```

---

## ViewModel Lifecycle and Initialization

### Initialization Sources

The Widget Blueprint editor lets you configure where the ViewModel instance comes from:

| Source | When to Use |
|--------|-------------|
| **Create Instance** | Widget creates and owns the ViewModel — simplest for self-contained HUD elements |
| **Global Viewmodel Collection** | ViewModel registered with `UMVVMSubsystem` — shared across multiple widgets (e.g., a player stats VM used by both HUD and inventory screen) |
| **Manual** | You create and assign the ViewModel in code — maximum control |
| **Resolver** | Custom class that resolves the ViewModel instance at runtime — useful for dependency injection patterns |

### Global Viewmodel Collection

```cpp
// Register a ViewModel globally (e.g., in GameMode::BeginPlay)
UMVVMSubsystem* Subsystem = GetGameInstance()->GetSubsystem<UMVVMSubsystem>();
UHUDViewModel* HudVM = NewObject<UHUDViewModel>(this);
Subsystem->RegisterViewModelInstance(FName("PlayerHUD"), HudVM);

// Any widget can now bind to "PlayerHUD" by name
```

---

## Practical Patterns

### Pattern: Updating ViewModel from Gameplay

```cpp
// In your PlayerCharacter or PlayerController
void AMyPlayerCharacter::OnHealthChanged(
    const FOnAttributeChangeData& Data)
{
    // GAS attribute changed → push to ViewModel
    if (UHUDViewModel* VM = GetHUDViewModel())
    {
        VM->SetHealth(Data.NewValue / MaxHealth);  // Normalized 0-1
    }
}
```

### Pattern: ViewModel Aggregating Multiple Sources

A single ViewModel can aggregate data from multiple game systems:

```cpp
UCLASS()
class UPlayerStatusViewModel : public UMVVMViewModelBase
{
    GENERATED_BODY()
public:
    UPROPERTY(FieldNotify, BlueprintReadOnly, Getter, Setter)
    float Health;

    UPROPERTY(FieldNotify, BlueprintReadOnly, Getter, Setter)
    float Mana;

    UPROPERTY(FieldNotify, BlueprintReadOnly, Getter, Setter)
    int32 Gold;

    UPROPERTY(FieldNotify, BlueprintReadOnly, Getter, Setter)
    TArray<FText> ActiveBuffNames;

    // Called by the owning Controller to batch-update from multiple systems
    void RefreshFromGameState(
        const UAbilitySystemComponent* ASC,
        const UInventoryComponent* Inventory);
};
```

### Pattern: Child ViewModels

For complex UIs, compose ViewModels hierarchically:

```cpp
UPROPERTY(FieldNotify, BlueprintReadOnly, Getter)
UInventoryItemViewModel* SelectedItem;
```

Child ViewModel properties also participate in FieldNotify — the binding system can observe `SelectedItem.ItemName` across the hierarchy.

---

## Performance Considerations

- **FieldNotify is event-driven** — zero cost when data doesn't change, unlike Tick-based polling
- **Batching**: if you need to update many properties at once, consider calling setters in sequence — each broadcasts individually but the UI framework batches widget updates to the next frame
- **Avoid heavy logic in conversion functions** — they run on every property change
- **Global ViewModels** persist for the session — clean up registrations when changing levels or game modes to avoid stale references
- **Array properties**: modifying array elements in-place requires a manual `UE_MVVM_BROADCAST_FIELD_VALUE_CHANGED` call since the property address didn't change

---

## Common Pitfalls

| Pitfall | Solution |
|---------|----------|
| Binding shows stale data on widget open | Ensure ViewModel is initialized before widget `NativeConstruct` — use Global Collection or Resolver for early availability |
| Changes to array contents don't update UI | Use `UE_MVVM_BROADCAST_FIELD_VALUE_CHANGED(ArrayProp)` after modifying array elements in-place |
| Widget references ViewModel after level transition | Clear global ViewModel registrations in `EndPlay` or `HandleMatchHasEnded` |
| Two-way binding creates infinite loop | Use `UE_MVVM_SET_PROPERTY_VALUE` which skips broadcast when value hasn't changed |
| Blueprint ViewModel properties not showing in binding panel | Ensure the variable has **FieldNotify** enabled in the variable details panel |

---

## When to Use (and When Not To)

**Good fit for MVVM:**
- HUD elements displaying player stats, ammo, health, objectives
- Inventory and equipment screens with multiple data sources
- Settings menus with two-way bindings
- Any UI shared across multiple contexts (in-game HUD + pause menu)

**Simpler alternatives may suffice:**
- One-shot popup dialogs with static text — direct widget setup is simpler
- Extremely simple UIs with 1-2 values — FieldNotify adds overhead in code structure
- Loading screens — typically driven by async loading delegates, not persistent ViewModels

---

## Further Reading

- [UMG Viewmodel Documentation (Epic)](https://dev.epicgames.com/documentation/en-us/unreal-engine/umg-viewmodel-for-unreal-engine)
- [UMG Viewmodels: Building More Robust and Testable UIs — Unreal Fest 2023](https://dev.epicgames.com/community/learning/talks-and-demos/pw3Y/)
- [Model View ViewModel for Game Devs — miltoncandelero](https://miltoncandelero.github.io/unreal-viewmodel)
- [G3 UMG and Common UI](G3_umg_and_common_ui.md) — the UI framework these ViewModels bind to
