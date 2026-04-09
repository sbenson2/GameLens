# G33 — Game Features & Modular Gameplay in Unreal Engine 5

> **Category:** guide · **Engine:** Unreal Engine 5.4+ · **Related:** [G13 Gameplay Ability System](G13_gameplay_ability_system.md) · [G32 Gameplay Tags](G32_gameplay_tags_data_driven.md) · [G27 Lyra Architecture](G27_lyra_architecture.md) · [Architecture Overview](../architecture/E1_architecture_overview.md) · [Unreal Rules](../unreal-arch-rules.md)

The Game Features and Modular Gameplay plugins provide Unreal Engine 5's architecture for building self-contained, hot-swappable gameplay modules. Instead of a monolithic game codebase where every feature depends on everything else, Game Features let you package abilities, components, input mappings, and content into isolated plugins that activate and deactivate at runtime — with zero coupling to the core game. This is the architecture behind Fortnite's seasonal content and Epic's Lyra sample project. This guide covers the plugin structure, feature actions, lifecycle management, and practical patterns for modular game development.

---

## Why Modular Gameplay?

Traditional game projects accumulate coupling problems:

- **Adding a new weapon** requires changes to the character class, input system, animation blueprint, UI, and save system
- **Seasonal content** can't be toggled without `#ifdef` blocks or runtime booleans scattered across systems
- **Team parallelism** breaks down when everyone edits the same core classes
- **DLC and mods** need clean injection points that don't exist in monolithic architectures

The Game Features plugin solves this by treating each feature as an independent plugin that **injects** its content into the running game through a well-defined action system. The core game never references the feature — the feature registers itself with the core.

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                   Core Game Module                           │
│  (AGameModeBase, ACharacter, core systems)                  │
│                                                              │
│  UGameFrameworkComponentManager                              │
│  ├── Manages actor extension lifecycle                       │
│  └── Actors opt-in with AddReceiver / AddGameFrameworkInit   │
│                                                              │
│  UGameFeaturesSubsystem                                      │
│  ├── Discovers feature plugins                               │
│  ├── Manages loading / activating / deactivating             │
│  └── Executes UGameFeatureAction list per feature            │
└─────────────────────────────────────────────────────────────┘
         ▲                    ▲                    ▲
         │                    │                    │
    ┌────┴─────┐       ┌─────┴──────┐      ┌─────┴──────┐
    │ Feature A │       │ Feature B  │      │ Feature C  │
    │ (Sword)   │       │ (Gun)      │      │ (Season 3) │
    │           │       │            │      │            │
    │ Actions:  │       │ Actions:   │      │ Actions:   │
    │ - AddComp │       │ - AddComp  │      │ - AddComp  │
    │ - AddAbil │       │ - AddAbil  │      │ - AddLevel │
    │ - AddInput│       │ - AddInput │      │ - AddData  │
    └───────────┘       └────────────┘      └────────────┘
```

---

## Plugin Structure

A Game Feature plugin follows a specific directory layout:

```
Plugins/GameFeatures/
  MyFeature/
    MyFeature.uplugin              ← Plugin descriptor
    Content/
      MyFeatureData.uasset         ← UGameFeatureData (the feature's action list)
      Abilities/
        GA_MyAbility.uasset
      Input/
        IMC_MyFeature.uasset
    Source/
      MyFeatureModule.h / .cpp     ← Optional C++ module
```

### The .uplugin File

```json
{
    "FileVersion": 3,
    "Version": 1,
    "VersionName": "1.0",
    "FriendlyName": "My Feature",
    "Description": "Adds sword combat to the game",
    "Category": "Game Features",
    "CreatedBy": "Your Studio",
    "BuiltInInitialFeatureState": "Registered",
    "ExplicitlyLoaded": true,
    "Plugins": [
        {
            "Name": "GameFeatures",
            "Enabled": true
        },
        {
            "Name": "ModularGameplay",
            "Enabled": true
        }
    ]
}
```

Key fields:
- `BuiltInInitialFeatureState` — controls startup state: `"Installed"`, `"Registered"`, `"Loaded"`, or `"Active"`
- `ExplicitlyLoaded` — if `true`, the feature won't auto-activate; something must request it

### UGameFeatureData

The central data asset for each feature. It holds an array of `UGameFeatureAction` objects — the instructions for what the feature does when activated.

Create this asset in the feature's Content folder and name it to match the plugin (e.g., `MyFeatureData`). The `UGameFeaturesSubsystem` discovers it automatically.

---

## Built-In Feature Actions

UE5 ships several `UGameFeatureAction` subclasses:

### UGameFeatureAction_AddComponents

Injects components into actors at runtime. The most commonly used action.

```cpp
// Configured in the UGameFeatureData asset:
// Actor Class: AMyCharacter
// Component Class: USwordCombatComponent
// bClientComponent: true
// bServerComponent: true
```

When activated, any `AMyCharacter` that has opted in via `UGameFrameworkComponentManager` receives a `USwordCombatComponent`. When deactivated, the component is removed.

### UGameFeatureAction_AddAbilities

Grants Gameplay Abilities through the Gameplay Ability System:

- Adds `UGameplayAbility` subclasses to the actor's `UAbilitySystemComponent`
- Can also add `UAttributeSet` subclasses
- Abilities are automatically removed on deactivation

### UGameFeatureAction_AddInputContextMapping

Adds `UInputMappingContext` assets to the Enhanced Input system:

- Specifies the mapping context and priority
- Automatically removed when the feature deactivates
- Works with the Enhanced Input plugin's priority system

### UGameFeatureAction_AddWorldSystem

Registers a `UWorldSubsystem` subclass that lives only while the feature is active.

### UGameFeatureAction_AddSpawnedActors

Spawns actors into the world when the feature activates (triggers, volumes, etc.) and destroys them on deactivation.

### UGameFeatureAction_AddLevelInstances

Streams in level instances — useful for adding map areas or environmental changes tied to a feature.

### UGameFeatureAction_DataRegistry

Registers `UDataRegistry` assets, making data tables available only while the feature is active.

---

## Actor Opt-In: UGameFrameworkComponentManager

For component injection to work, actors must **opt in** to the component manager. This is the critical setup step that projects often miss.

```cpp
// In your base character or pawn class
#include "Components/GameFrameworkComponentManager.h"

void AMyCharacter::PreInitializeComponents()
{
    Super::PreInitializeComponents();

    // Register with the component manager so Game Feature plugins can inject components
    UGameFrameworkComponentManager::AddGameFrameworkComponentReceiver(this);
}

void AMyCharacter::EndPlay(const EEndPlayReason::Type EndPlayReason)
{
    UGameFrameworkComponentManager::RemoveGameFrameworkComponentReceiver(this);
    Super::EndPlay(EndPlayReason);
}
```

In Lyra and modern UE5 projects, this is typically done in the base `ACharacter` or `APawn` subclass so that all derived classes automatically support Game Feature injection.

---

## Feature Lifecycle

Features progress through a state machine:

```
Installed → Registered → Loaded → Active
                                     │
                                     ▼
                               Deactivating → Loaded → Registered → Installed
```

### States

| State | What Happens |
|-------|-------------|
| **Installed** | Plugin files detected on disk |
| **Registered** | Plugin descriptor parsed, feature known to the subsystem |
| **Loaded** | Assets loaded into memory (but actions not executed) |
| **Active** | `UGameFeatureAction::OnGameFeatureActivating()` called — components injected, abilities granted, input mappings added |

### Controlling State from C++

```cpp
UGameFeaturesSubsystem& GFS = UGameFeaturesSubsystem::Get();

// Activate a feature
FString PluginURL = FString::Printf(TEXT("/%s/%s.%s"),
    *PluginName, *PluginName, *PluginName);
GFS.LoadAndActivateGameFeaturePlugin(PluginURL, FGameFeaturePluginLoadComplete());

// Deactivate
GFS.DeactivateGameFeaturePlugin(PluginURL);
```

### Controlling State from Blueprints

The `UGameFeaturesSubsystem` exposes Blueprint-callable functions for loading and activating features, useful for in-game toggles or experience-selection screens.

---

## Writing Custom Feature Actions

For project-specific needs, create custom `UGameFeatureAction` subclasses:

```cpp
UCLASS(MinimalAPI, meta = (DisplayName = "Add Weather System"))
class UGameFeatureAction_AddWeather : public UGameFeatureAction
{
    GENERATED_BODY()

public:
    UPROPERTY(EditAnywhere, Category = "Weather")
    TSubclassOf<AWeatherController> WeatherControllerClass;

    // Called when feature activates
    virtual void OnGameFeatureActivating(FGameFeatureActivatingContext& Context) override
    {
        if (UWorld* World = Context.GetWorld())
        {
            SpawnedWeather = World->SpawnActor<AWeatherController>(WeatherControllerClass);
        }
    }

    // Called when feature deactivates — MUST clean up
    virtual void OnGameFeatureDeactivating(FGameFeatureDeactivatingContext& Context) override
    {
        if (SpawnedWeather)
        {
            SpawnedWeather->Destroy();
            SpawnedWeather = nullptr;
        }
    }

private:
    UPROPERTY()
    TObjectPtr<AWeatherController> SpawnedWeather;
};
```

**Critical rule:** always implement `OnGameFeatureDeactivating` to clean up everything `OnGameFeatureActivating` created. Features must be fully reversible.

---

## Lyra Pattern: Experience System

Epic's Lyra sample project builds on Game Features with an **Experience** system — a higher-level concept where each game mode is defined by:

1. A `ULyraExperienceDefinition` data asset
2. A list of `UGameFeatureAction` objects (same as Game Feature plugins but defined per-experience)
3. A set of Game Feature plugins to activate

This pattern allows a single project to host multiple game modes (deathmatch, capture-the-flag, racing) where each mode activates different features, components, abilities, and input mappings — all without conditional code in the core game.

---

## Practical Patterns

### Pattern 1: Weapon as a Game Feature

```
Plugins/GameFeatures/SwordCombat/
  Content/
    SwordCombatData.uasset  ← GameFeatureData
    GA_SwordSwing.uasset    ← Gameplay Ability
    IMC_SwordInput.uasset   ← Input Mapping Context
    BP_SwordMesh.uasset     ← Weapon visual

// SwordCombatData actions:
// 1. AddComponents: USwordCombatComponent → AMyCharacter
// 2. AddAbilities: GA_SwordSwing → AMyCharacter
// 3. AddInputContextMapping: IMC_SwordInput (Priority 1)
```

### Pattern 2: Seasonal Content

```
Plugins/GameFeatures/HalloweenEvent/
  Content/
    HalloweenData.uasset
    L_HalloweenDecorations.umap    ← Level instance
    DT_HalloweenLoot.uasset        ← Data table

// HalloweenData actions:
// 1. AddLevelInstances: L_HalloweenDecorations
// 2. DataRegistry: DT_HalloweenLoot
// 3. AddComponents: UHalloweenQuestComponent → AMyCharacter
```

### Pattern 3: Feature Flags via Tags

Combine with Gameplay Tags for runtime feature toggling:

```cpp
// In your game instance or state
void ActivateFeatureByTag(FGameplayTag FeatureTag)
{
    // Map tags to plugin URLs
    if (FString* PluginURL = FeatureTagMap.Find(FeatureTag))
    {
        UGameFeaturesSubsystem::Get().LoadAndActivateGameFeaturePlugin(*PluginURL,
            FGameFeaturePluginLoadComplete());
    }
}
```

---

## Common Mistakes

| Mistake | Fix |
|---------|-----|
| Forgetting `AddGameFrameworkComponentReceiver` | Add it in `PreInitializeComponents` of your base actor classes |
| Feature referencing core game classes directly | Features should only depend on interfaces and base classes — never import core game modules |
| Not cleaning up in `OnGameFeatureDeactivating` | Every action must be fully reversible; leaked components or actors cause crashes |
| Hardcoding feature activation | Use data-driven activation (experience definitions, config) instead of C++ `LoadAndActivate` calls |
| Putting shared code in a Game Feature | Shared systems go in the core game module or a shared plugin — Game Features are for isolated, toggleable content |

---

## Setup Checklist

1. Enable **GameFeatures** and **ModularGameplay** plugins in your `.uproject`
2. Create `Plugins/GameFeatures/` directory in your project
3. Add `UGameFrameworkComponentManager` opt-in to your base actor classes
4. Create your first Game Feature plugin with a `UGameFeatureData` asset
5. Configure actions (AddComponents, AddAbilities, AddInputContextMapping)
6. Test activation/deactivation — verify clean teardown with no leaked actors or components
7. Consider the Lyra Experience pattern for multi-mode games

---

## Further Reading

- [UE5 Game Features Documentation](https://dev.epicgames.com/documentation/en-us/unreal-engine/game-features-and-modular-gameplay-in-unreal-engine) — official reference
- [Epic Blog: Modular Game Features in UE5](https://www.unrealengine.com/en-US/blog/modular-game-features-in-ue5-plug-n-play-the-unreal-way) — overview and rationale
- [UGameFeatureAction API](https://dev.epicgames.com/documentation/en-us/unreal-engine/API/Plugins/GameFeatures/UGameFeatureAction) — base class reference
- [Unreal Directive: What You Need to Know](https://unrealdirective.com/articles/modular-game-features-what-you-need-to-know/) — practical walkthrough
- [Lyra Sample Project](https://dev.epicgames.com/documentation/en-us/unreal-engine/lyra-sample-game-in-unreal-engine) — reference implementation
