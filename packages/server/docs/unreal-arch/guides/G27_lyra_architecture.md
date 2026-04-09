# G27 — Lyra Starter Game Architecture

> **Category:** guide · **Engine:** Unreal Engine 5.4+ · **Related:** [G1 Gameplay Framework](G1_gameplay_framework.md) · [G13 Gameplay Ability System](G13_gameplay_ability_system.md) · [G2 Enhanced Input](G2_enhanced_input.md) · [G3 UMG & Common UI](G3_umg_and_common_ui.md) · [Architecture Overview](../architecture/E1_architecture_overview.md) · [Unreal Rules](../unreal-arch-rules.md)

Lyra Starter Game is Epic's reference architecture for production-quality UE5 projects. It demonstrates **Modular Game Features**, the **Gameplay Ability System (GAS)**, **Enhanced Input**, **CommonUI**, and scalable multiplayer — the same patterns that power Fortnite's rotating content system. This guide breaks down Lyra's architecture, its Experience-driven game mode system, the Game Feature Plugin pattern, and how to extend Lyra for your own projects.

---

## Why Lyra Matters

Lyra is not just a sample — it is Epic's opinionated answer to "how should a modern UE5 project be structured?" Key principles:

1. **Organize by feature, not by asset type** — each gameplay feature lives in its own plugin with self-contained content, code, and configuration.
2. **Runtime feature injection** — game modes, abilities, input mappings, and UI are loaded/unloaded dynamically via Game Feature Plugins.
3. **Experience-driven design** — a `ULyraExperienceDefinition` data asset declares everything a game mode needs, from pawn class to ability sets to HUD layout.
4. **PlayerState-owned GAS** — the Ability System Component lives on `ALyraPlayerState`, not the Pawn, so abilities persist across respawns.

---

## High-Level Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                        Lyra Core                             │
│  (LyraGame module — always loaded)                          │
│                                                              │
│  ┌──────────────┐  ┌─────────────────┐  ┌───────────────┐  │
│  │ ALyraGameMode│  │ ALyraPlayerState │  │ ALyraCharacter │  │
│  │ (picks       │  │ (owns ASC,      │  │ (pawn, health, │  │
│  │  Experience)  │  │  player data)   │  │  movement)     │  │
│  └──────┬───────┘  └────────┬────────┘  └───────────────┘  │
│         │                   │                                │
│         ▼                   ▼                                │
│  ┌──────────────────────────────────────────────────────┐   │
│  │  ULyraExperienceDefinition                            │   │
│  │  • Lists Game Feature Plugins to activate             │   │
│  │  • Defines default pawn data (class, input, camera)   │   │
│  │  • References Action Sets (ability bundles)           │   │
│  └──────────────────────┬───────────────────────────────┘   │
│                         │ activates                          │
│                         ▼                                    │
│  ┌──────────────────────────────────────────────────────┐   │
│  │  Game Feature Plugins                                 │   │
│  │  ┌────────────────┐ ┌────────────────┐               │   │
│  │  │ ShooterCore    │ │ TopDownArena   │  ...           │   │
│  │  │ (weapons, HUD, │ │ (overhead cam, │               │   │
│  │  │  team logic)   │ │  arena rules)  │               │   │
│  │  └────────────────┘ └────────────────┘               │   │
│  └──────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

---

## Core Classes

### Game Framework

| Class | Role |
|-------|------|
| `ALyraGameMode` | Selects and loads an `ULyraExperienceDefinition`. Waits for async load before spawning players. |
| `ALyraGameState` | Replicates the active experience. Holds the `ULyraExperienceManagerComponent`. |
| `ALyraPlayerState` | Owns the `UAbilitySystemComponent`. Stores `ULyraExperienceDefinition` pawn data. Survives respawns. |
| `ALyraCharacter` | The default pawn. Modular: movement, health, and abilities come from components, not the class itself. |
| `ALyraPlayerController` | Routes input to the pawn. Owns a `ULyraAbilitySystemComponent` proxy for client prediction. |

### Experience System

| Class | Role |
|-------|------|
| `ULyraExperienceDefinition` | Data asset. The "recipe" for a game mode: lists Game Feature Plugins, pawn data, action sets. |
| `ULyraExperienceManagerComponent` | Lives on GameState. Manages async loading/unloading of the active experience. Broadcasts `OnExperienceLoaded`. |
| `ULyraExperienceActionSet` | Reusable bundle of `UGameFeatureAction`s. Shared across experiences (e.g., "Shooter Ability Set"). |

### Pawn & Input

| Class | Role |
|-------|------|
| `ULyraPawnData` | Data asset defining the pawn class, input config, camera mode, and default abilities for a player type. |
| `ULyraInputConfig` | Maps Input Actions to Gameplay Ability Tags. Decouples binding from ability implementation. |
| `ULyraHeroComponent` | Initializes input bindings and grants abilities when the pawn is ready. Listens for experience load. |

---

## Game Feature Plugins — The Modular Pattern

### What Is a Game Feature Plugin?

A Game Feature Plugin (GFP) is a standard UE plugin with a `UGameFeaturesSubsystemPolicy` and a `.uplugin` file that declares it as a Game Feature. When activated, it:

1. Loads its content (assets, Blueprints, data tables)
2. Executes its `UGameFeatureAction` list (grant abilities, add components, bind input)
3. Registers its content with the game's runtime systems

When deactivated, all of the above is cleanly reversed.

### UGameFeatureAction — Extension Points

| Action Class | What It Does |
|-------------|-------------|
| `UGameFeatureAction_AddComponents` | Injects components into actors matching a filter (e.g., add a HealthComponent to all Pawns) |
| `UGameFeatureAction_AddAbilities` | Grants Gameplay Abilities and Attribute Sets to actors with an ASC |
| `UGameFeatureAction_AddInputConfig` | Registers Enhanced Input Mapping Contexts and binds Input Actions to ability tags |
| `UGameFeatureAction_AddWidget` | Adds HUD widgets to CommonUI layout slots |
| `UGameFeatureAction_DataRegistry` | Registers data assets (items, weapons) with the game's data registries |

### Modular Gameplay Component Manager

The `UGameFrameworkComponentManager` is the backbone. It manages:

- **Extension Handlers** — registered by Game Feature Actions, they fire when a matching actor initializes
- **Initialization States** — actors progress through states (`Spawned → DataAvailable → DataInitialized → GameplayReady`), ensuring components are added in the right order
- **Receiver Actors** — any actor that calls `RegisterReceiver` becomes eligible for runtime component injection

### Creating Your Own Game Feature Plugin

1. **Create the plugin:** Editor → Edit → Plugins → Add → Game Feature (or manually create a `.uplugin` with `"ExplicitlyLoaded": true`)
2. **Add a Game Feature Data asset** in the plugin's Content folder
3. **List your actions** in the data asset (abilities, components, widgets, input)
4. **Reference the plugin** in a `ULyraExperienceDefinition` (or activate manually via `UGameFeaturesSubsystem`)
5. **Test independently** — each plugin should be testable in isolation with a minimal experience

---

## Experience Flow — From Map Load to Gameplay

```
1. Map loads → ALyraGameMode::InitGame()
       │
2.     └─▶ Reads the Experience from the World Settings or URL options
       │
3.     └─▶ ULyraExperienceManagerComponent::StartExperienceLoad()
       │     • Async loads ULyraExperienceDefinition
       │     • Async loads all referenced Game Feature Plugins
       │     • Activates each Game Feature Plugin via UGameFeaturesSubsystem
       │
4.     └─▶ OnExperienceLoaded broadcast
       │     • ALyraGameMode spawns players
       │     • ULyraHeroComponent initializes input + abilities
       │     • HUD widgets are injected via CommonUI
       │
5.     └─▶ Gameplay begins
```

---

## Lyra's GAS Integration

Lyra uses the Gameplay Ability System in a specific way worth studying:

### ASC on PlayerState

```cpp
// ALyraPlayerState owns the ASC — abilities persist across respawns
UPROPERTY(VisibleAnywhere)
ULyraAbilitySystemComponent* AbilitySystemComponent;

// The Pawn accesses it through the interface:
IAbilitySystemInterface::GetAbilitySystemComponent()
    → returns PlayerState->AbilitySystemComponent
```

### Ability Granting via Game Features

Abilities are NOT hardcoded on the character. Instead:

1. A `ULyraExperienceActionSet` references a `ULyraAbilitySet` data asset
2. The ability set lists Gameplay Abilities + their input tags
3. When the Game Feature activates, `UGameFeatureAction_AddAbilities` grants them
4. When deactivated, abilities are cleanly removed

### Input → Ability Binding

```
Enhanced Input Action ("IA_PrimaryFire")
    ──mapped in ULyraInputConfig──▶
Gameplay Tag ("InputTag.PrimaryFire")
    ──bound by ULyraHeroComponent──▶
UGameplayAbility ("GA_Weapon_Fire")
```

This decoupling means swapping weapons or game modes only requires changing which `ULyraAbilitySet` and `ULyraInputConfig` are active — no code changes.

---

## Networking Patterns in Lyra

| Pattern | Implementation |
|---------|---------------|
| **Replication Graph** | Custom nodes with spatial grid for relevancy. Reduces per-connection replication cost. |
| **PlayerState ASC** | Abilities replicate through PlayerState, which persists across Pawn respawns. |
| **Gameplay Tag Replication** | Uses `FGameplayTagCountContainer` with loose replication — only tags that change are sent. |
| **Client Prediction** | GAS prediction keys for instant weapon fire. Server validates and corrects. |
| **Experience Replication** | `ALyraGameState` replicates the active experience ID. Late-joining clients load the same feature set. |

---

## Naming Conventions

Lyra introduces specific prefixes worth adopting:

| Prefix | Asset Type | Example |
|--------|-----------|---------|
| `B_` | Blueprint (general) | `B_WeaponSpawner` |
| `W_` | Widget Blueprint | `W_HUD_Reticle` |
| `GA_` | Gameplay Ability | `GA_Weapon_Fire` |
| `GE_` | Gameplay Effect | `GE_Damage_Bullet` |
| `GC_` | Gameplay Cue | `GC_Impact_Bullet` |
| `LAS_` | Lyra Action Set | `LAS_ShooterAbilities` |
| `ID_` | Item Definition | `ID_Rifle_Standard` |
| `L_` | Level / Map | `L_Expanse` |

---

## Extending Lyra — Best Practices

1. **Never modify Lyra core directly** — create your own Game Feature Plugin that layers on top. This keeps Lyra updatable.
2. **One feature per plugin** — resist the urge to bundle. A "CTF Mode" plugin should not contain UI framework changes.
3. **Use Action Sets for shared functionality** — if multiple experiences need the same abilities, put them in a shared Action Set rather than duplicating across Game Feature data assets.
4. **Test experiences in isolation** — create minimal test maps with a single experience to validate each feature independently.
5. **Prefer data assets over code** — Lyra's strength is data-driven configuration. New weapons, abilities, and game modes should require minimal C++.
6. **Watch initialization order** — components added by Game Features may not exist in `BeginPlay`. Use `OnExperienceLoaded` or the Component Manager's initialization states instead.

---

## Common Pitfalls

| Problem | Cause | Fix |
|---------|-------|-----|
| Abilities lost on respawn | ASC on Pawn instead of PlayerState | Move ASC to PlayerState (Lyra default) |
| Game Feature assets not cooking | Plugin not referenced by any experience | Add explicit reference in `ULyraExperienceDefinition` or use Asset Manager rules |
| Components missing at BeginPlay | Game Feature not yet activated | Listen for `OnExperienceLoaded` before accessing injected components |
| Input bindings don't work | Input Mapping Context not added by Game Feature | Add `UGameFeatureAction_AddInputConfig` to your plugin's action list |
| Late joiners get wrong game mode | Experience not replicated | Ensure `ALyraGameState` replicates; client loads experience from replicated data |

---

## Further Reading

- [Lyra Sample Game (Epic)](https://dev.epicgames.com/documentation/en-us/unreal-engine/lyra-sample-game-in-unreal-engine) — official overview
- [Game Feature Plugins Tutorial](https://dev.epicgames.com/community/learning/tutorials/rdW2/unreal-engine-how-to-create-a-new-game-feature-plugin-and-experience-in-lyra) — step-by-step
- [Modular Gameplay — X157 Dev Notes](https://x157.github.io/UE5/ModularGameplay/) — deep community analysis
- [Understanding Game Features Subsystem](https://www.unrealcode.net/GameFeaturesSubsystem.html) — technical breakdown
- [G1 Gameplay Framework](G1_gameplay_framework.md) — UE5 game framework fundamentals
- [G13 Gameplay Ability System](G13_gameplay_ability_system.md) — GAS deep dive
