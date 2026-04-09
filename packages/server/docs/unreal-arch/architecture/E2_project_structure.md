# E2 — Project Structure & Organization in Unreal Engine 5

> **Category:** architecture · **Engine:** Unreal Engine 5.4+ · **Related:** [Architecture Overview](E1_architecture_overview.md) · [Blueprint/C++ Workflow](../guides/G15_blueprint_cpp_workflow.md) · [Asset Management](../guides/G14_asset_management.md) · [World Partition](../guides/G12_world_partition_streaming.md) · [Unreal Rules](../unreal-arch-rules.md)

A well-organized UE5 project structure prevents broken references, minimizes merge conflicts, and lets your project scale from prototype to shipped game. This guide covers the on-disk directory layout, Content folder conventions, C++ Source organization, and the progression from flat folders to modular Game Feature Plugins.

---

## Why Structure Matters in Unreal

Unreal tracks every asset by a soft-object path (e.g., `/Game/Characters/Hero/BP_Hero.BP_Hero`). Renaming or moving assets in your OS file browser bypasses the reference-updating system and breaks those paths silently. Establish conventions on day one because retroactive reorganization is expensive.

**Symptoms of poor structure:**
- "Which Blueprint is the real one?" — duplicates scattered across folders
- Content Browser searches return hundreds of unrelated hits
- Merge conflicts on `.uasset` files that can't be diffed
- Cook times explode because every asset is in a single dependency chain
- Marketplace/Fab content pollutes your project namespace

---

## On-Disk Directory Layout

Every UE5 project has this skeleton on disk. Understanding what lives where prevents accidental commits of massive derived-data folders.

```
MyGame/
├── Config/                    # .ini files — engine, game, input, editor settings
│   ├── DefaultEngine.ini      # Rendering, physics, platform settings
│   ├── DefaultGame.ini        # Project metadata, packaging options
│   ├── DefaultInput.ini       # Key bindings (legacy; prefer Enhanced Input assets)
│   └── DefaultEditor.ini      # Editor preferences
├── Content/                   # All assets visible in Content Browser
│   └── (see Content Layout below)
├── Source/                    # C++ code — modules, plugins
│   └── (see C++ Layout below)
├── Plugins/                   # Project-local plugins (game features, tools)
├── Saved/                     # ⚠ Auto-generated. Logs, autosaves, local caches
├── Intermediate/              # ⚠ Auto-generated. Build intermediates
├── Binaries/                  # ⚠ Auto-generated. Compiled executables/DLLs
├── DerivedDataCache/          # ⚠ Auto-generated. Cooked shader/texture caches
├── MyGame.uproject            # Project descriptor — modules, plugins, target platforms
└── .gitignore                 # MUST exclude Saved/, Intermediate/, Binaries/, DerivedDataCache/
```

> **Rule of thumb:** Only `Config/`, `Content/`, `Source/`, `Plugins/`, and `*.uproject` belong in version control. Everything else is derived.

---

## Content Folder Layout

### Organize by Feature, Not by Asset Type

The single most impactful decision: group assets by gameplay domain, not by type. This keeps related assets together and makes it easy to promote features into plugins later.

```
Content/
├── _MyGame/                   # Project namespace (underscore sorts to top)
│   ├── Characters/
│   │   ├── Hero/
│   │   │   ├── BP_Hero.uasset
│   │   │   ├── SK_Hero.uasset           # Skeletal Mesh
│   │   │   ├── ABP_Hero.uasset          # Animation Blueprint
│   │   │   ├── Anims/                    # Montages, sequences
│   │   │   └── Materials/
│   │   └── Enemies/
│   │       ├── Goblin/
│   │       └── Dragon/
│   ├── Weapons/
│   │   ├── Sword/
│   │   └── Bow/
│   ├── Environment/
│   │   ├── Props/
│   │   └── Landscapes/
│   ├── UI/
│   │   ├── HUD/
│   │   ├── Menus/
│   │   └── Widgets/               # Reusable UI components
│   ├── Audio/
│   │   ├── Music/
│   │   ├── SFX/
│   │   └── MetaSounds/
│   ├── VFX/
│   │   └── Niagara/
│   ├── Core/                      # Shared gameplay logic
│   │   ├── GameModes/
│   │   ├── DataAssets/            # DataTables, Curves, primary data assets
│   │   └── Input/                 # Input Actions, Mapping Contexts
│   ├── Maps/
│   │   ├── MainMenu.umap
│   │   ├── Level01.umap
│   │   └── TestMaps/             # Developer test levels (exclude from package)
│   └── Cinematics/
│       └── Sequencer/
├── External/                      # Third-party assets isolated here
│   ├── Fab/                       # Fab marketplace downloads
│   └── Plugins/                   # Plugin content that leaks into Content/
└── Developers/                    # Per-developer scratchpads (never ship)
    ├── Alice/
    └── Bob/
```

### Naming Prefixes

Consistent prefixes make Content Browser search instant and prevent type confusion:

| Prefix | Asset Type | Example |
|--------|-----------|---------|
| `BP_` | Blueprint | `BP_Hero`, `BP_HealthPickup` |
| `SK_` | Skeletal Mesh | `SK_Hero` |
| `SM_` | Static Mesh | `SM_Barrel` |
| `M_` | Material | `M_Stone_Wall` |
| `MI_` | Material Instance | `MI_Stone_Wall_Mossy` |
| `T_` | Texture | `T_Stone_Wall_D` (diffuse), `T_Stone_Wall_N` (normal) |
| `ABP_` | Anim Blueprint | `ABP_Hero` |
| `AM_` | Anim Montage | `AM_Hero_Attack01` |
| `DA_` | Data Asset | `DA_WeaponStats_Sword` |
| `DT_` | Data Table | `DT_ItemDatabase` |
| `WBP_` | Widget Blueprint | `WBP_HealthBar` |
| `GFP_` | Game Feature Plugin | `GFP_Inventory` |
| `IA_` | Input Action | `IA_Move`, `IA_Jump` |
| `IMC_` | Input Mapping Context | `IMC_Default`, `IMC_Vehicle` |
| `NS_` | Niagara System | `NS_FireTrail` |
| `NE_` | Niagara Emitter | `NE_Sparks` |
| `SB_` | Sound Base / Cue | `SB_Footstep_Dirt` |

---

## C++ Source Organization

### Module Structure

UE5 compiles C++ into **modules** — each module has a `.Build.cs` file that declares dependencies. A typical project starts with one module and may grow to three or four.

```
Source/
├── MyGame/                        # Primary gameplay module
│   ├── MyGame.Build.cs            # Module dependencies (e.g., "EnhancedInput", "CommonUI")
│   ├── MyGame.h                   # Module header (minimal — PCH candidates)
│   ├── MyGameModule.cpp           # Module startup / registration
│   ├── Core/                      # Game framework classes
│   │   ├── MyGameMode.h/.cpp
│   │   ├── MyGameState.h/.cpp
│   │   ├── MyPlayerController.h/.cpp
│   │   └── MyGameInstance.h/.cpp
│   ├── Characters/
│   │   ├── MyCharacterBase.h/.cpp
│   │   └── MyHeroCharacter.h/.cpp
│   ├── Abilities/                 # GAS abilities, effects, attribute sets
│   │   ├── MyAbilitySystemComponent.h/.cpp
│   │   ├── MyAttributeSet.h/.cpp
│   │   └── Abilities/
│   ├── AI/
│   │   ├── MyAIController.h/.cpp
│   │   ├── Tasks/                 # BTTask nodes
│   │   └── Services/              # BTService nodes
│   ├── UI/
│   │   ├── MyHUDWidget.h/.cpp
│   │   └── MyMenuWidget.h/.cpp
│   ├── Inventory/
│   │   ├── InventoryComponent.h/.cpp
│   │   └── ItemBase.h/.cpp
│   └── Utils/                     # Statics, function libraries, logging
│       ├── MyBlueprintFunctionLibrary.h/.cpp
│       └── MyLogChannels.h/.cpp
├── MyGameEditor/                  # Editor-only module (custom tools, details panels)
│   ├── MyGameEditor.Build.cs
│   └── ...
├── MyGame.Target.cs               # Game build target (client/standalone)
└── MyGameEditor.Target.cs         # Editor build target
```

### Class Naming Conventions

UE5 enforces prefix conventions that the Unreal Header Tool (UHT) relies on:

| Prefix | Meaning | Example |
|--------|---------|---------|
| `U` | UObject-derived (components, subsystems) | `UInventoryComponent` |
| `A` | AActor-derived (placed in world) | `AMyHeroCharacter` |
| `F` | Plain struct / value type | `FItemData`, `FWeaponStats` |
| `I` | Interface | `IInteractable`, `IDamageable` |
| `E` | Enum | `EWeaponType`, `EGamePhase` |
| `T` | Template | `TArray`, `TMap` (engine types) |
| `S` | Slate widget | `SMyCustomWidget` |

> **Why these matter:** UHT parses these prefixes to generate reflection code. A class named `InventoryComponent` instead of `UInventoryComponent` will fail to compile with UCLASS/UFUNCTION macros.

---

## Scaling: From Flat Folders to Game Feature Plugins

UE5's recommended scaling path for growing projects:

### Stage 1 — Single Module (Prototype / Jam)

All gameplay code in one module, feature-based folders in Content. Fine for solo devs or small teams.

### Stage 2 — Multiple Modules (Mid-size)

Split editor utilities, testing, and core gameplay into separate modules. Each module compiles independently, so changes in `MyGameEditor` don't recompile gameplay code.

```csharp
// MyGame.Build.cs — primary module
PublicDependencyModuleNames.AddRange(new string[]
{
    "Core", "CoreUObject", "Engine", "InputCore",
    "EnhancedInput", "CommonUI", "GameplayAbilities",
    "GameplayTags", "GameplayTasks"
});
```

### Stage 3 — Game Feature Plugins (Large / Live Service)

Game Feature Plugins (GFPs) encapsulate entire features — content, code, and config — as self-contained plugins that can be loaded/unloaded at runtime. Epic's **Lyra Starter Game** is the canonical example.

```
Plugins/
├── GFP_Inventory/
│   ├── Content/                   # Feature-specific assets
│   ├── Source/
│   │   └── GFP_Inventory/
│   │       ├── GFP_Inventory.Build.cs
│   │       ├── InventoryComponent.h/.cpp
│   │       └── InventoryManagerSubsystem.h/.cpp
│   └── GFP_Inventory.uplugin
├── GFP_Crafting/
│   ├── Content/
│   ├── Source/
│   └── GFP_Crafting.uplugin
└── GFP_QuestSystem/
    └── ...
```

**Benefits of GFPs:**
- Features can be toggled without recompiling unrelated code
- DLC / seasonal content ships as a plugin
- Teams work on isolated features with fewer merge conflicts
- Runtime loading/unloading for live-service games

**When to promote a feature to a GFP:** When it has its own assets, its own code, and a clear boundary. Don't create GFPs for small utility classes — that's overhead without benefit.

---

## Version Control Best Practices

### .gitignore Essentials

```gitignore
# Generated directories — never commit
Binaries/
DerivedDataCache/
Intermediate/
Saved/

# IDE files
.vs/
.idea/
*.sln           # Regenerated by UBT — optional to track

# OS files
.DS_Store
Thumbs.db
```

### Git LFS for Binary Assets

UE5 assets (`.uasset`, `.umap`) are binary. Use Git LFS to avoid bloating your repository:

```
# .gitattributes
*.uasset filter=lfs diff=lfs merge=lfs -text
*.umap filter=lfs diff=lfs merge=lfs -text
*.png filter=lfs diff=lfs merge=lfs -text
*.wav filter=lfs diff=lfs merge=lfs -text
*.mp3 filter=lfs diff=lfs merge=lfs -text
*.fbx filter=lfs diff=lfs merge=lfs -text
```

### Perforce / UnrealGameSync

For teams larger than ~5, Epic recommends Perforce with **UnrealGameSync** (UGS). Perforce's file-locking model prevents the binary-merge nightmares that plague Git with `.uasset` files. UGS provides a visual dashboard for tracking which changelists are safe to sync.

---

## Common Pitfalls

| Pitfall | Why It Hurts | Fix |
|---------|-------------|-----|
| Organizing Content by asset type (`Meshes/`, `Textures/`) | Related assets scattered; can't promote to plugin | Group by feature (`Characters/Hero/`) |
| Moving files in OS file explorer | Breaks all UE references (soft-object paths) | Always move/rename in Content Browser |
| No namespace folder (`Content/MyGame/`) | Marketplace content collides with your assets | Wrap everything in `_MyGame/` |
| Committing `Saved/` or `Intermediate/` | Gigabytes of useless data, constant conflicts | Add to `.gitignore` immediately |
| Single monolithic module | Any C++ change recompiles everything | Split into gameplay + editor + test modules |
| Creating GFPs too early | Plugin boilerplate overhead for simple features | Start flat, promote when complexity warrants |
| Deep folder nesting (>3 levels) | Hard to navigate, long path names | Keep hierarchy flat; max 3 levels deep |
| No naming prefixes | "Which `Sword` asset is the Blueprint vs the mesh?" | Use `BP_`, `SM_`, `SK_`, etc. consistently |

---

## Quick-Start Checklist

1. **Create namespace folder** — `Content/_MyGame/` to isolate your assets
2. **Set up naming prefixes** — agree on the prefix table above with your team
3. **Organize by feature** — `Characters/`, `Weapons/`, `Environment/`, `UI/`
4. **Isolate third-party content** — `Content/External/Fab/`, `Content/External/Plugins/`
5. **Configure version control** — `.gitignore` + Git LFS (or Perforce for larger teams)
6. **Create `Developers/` folder** — per-developer scratchpads excluded from packaging
7. **Set up C++ modules** — start with one, split when compile times warrant it
8. **Plan your scaling path** — flat folders → multiple modules → Game Feature Plugins
