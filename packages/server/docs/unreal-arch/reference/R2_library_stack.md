# R2 — Unreal Engine 5 Module & Plugin Stack

> **Category:** reference · **Engine:** Unreal Engine 5.4+ · **Related:** [Capability Matrix](R1_capability_matrix.md) · [Architecture Overview](../architecture/E1_architecture_overview.md) · [Project Structure](../architecture/E2_project_structure.md) · [Blueprint/C++ Workflow](../guides/G15_blueprint_cpp_workflow.md) · [Unreal Rules](../unreal-arch-rules.md)

A curated map of Unreal Engine 5's module and plugin ecosystem — built-in subsystems, engine plugins, and essential third-party tools. Use this when starting a project to pick the right modules, or when evaluating whether to build a system yourself or adopt an existing plugin.

---

## How UE5's Module System Works

Unlike Unity's opt-in package model, UE5 ships most of its systems as **engine modules** compiled into the editor — they're always present, but you choose which to depend on in your `.Build.cs` files. This means adding a dependency is a one-line change, not a package download.

**Module dependency types:**
- **PublicDependencyModuleNames** — headers exposed to modules that depend on yours
- **PrivateDependencyModuleNames** — used only in your .cpp files; hidden from dependents

**Plugin types:**
- **Engine plugins** — ship with UE5; enable/disable in Edit → Plugins
- **Project plugins** — live in your project's `Plugins/` folder
- **Fab marketplace plugins** — downloaded from Fab (formerly Marketplace); installed per-project

---

## Core Engine Modules

These modules are always available. Add them to your `.Build.cs` as needed.

### Gameplay Foundation

| Module | What It Does | Key Classes | When to Add |
|--------|-------------|-------------|-------------|
| **Core** | Fundamental types, containers, delegates | `TArray`, `TMap`, `FString`, `FName` | Always included (implicit) |
| **CoreUObject** | UObject system, reflection, serialization | `UObject`, `UClass`, `UPROPERTY()` | Always included (implicit) |
| **Engine** | Actors, components, world, game framework | `AActor`, `UActorComponent`, `UWorld` | Always included (implicit) |
| **InputCore** | Basic input types and keys | `FKey`, `EKeys` | Most gameplay modules |
| **EnhancedInput** | Action-based input with modifiers and triggers | `UInputAction`, `UInputMappingContext`, `UEnhancedInputComponent` | Every new project — replaces legacy input |
| **GameplayTags** | Hierarchical tag system for categorization | `FGameplayTag`, `FGameplayTagContainer` | Almost every project; tags beat enums for extensibility |
| **GameplayTasks** | Task-based async gameplay operations | `UGameplayTask`, `UGameplayTasksComponent` | Required by GAS; useful for custom async tasks |
| **GameplayAbilities** | Gameplay Ability System (GAS) | `UGameplayAbility`, `UAbilitySystemComponent`, `UAttributeSet`, `UGameplayEffect` | RPGs, action games, or any game with complex ability interactions |
| **NavigationSystem** | AI pathfinding with NavMesh | `UNavigationSystemV1`, `ANavigationData`, `ANavMeshBoundsVolume` | Any game with AI movement |
| **AIModule** | Behavior Trees, Blackboard, EQS, AI Perception | `UBehaviorTree`, `UBlackboardComponent`, `UAIPerceptionComponent` | AI-driven characters |
| **StateTreeModule** | State Tree — alternative to Behavior Trees (UE 5.4+) | `UStateTree`, `FStateTreeExecutionContext` | Prefer over BTs for new projects; more flexible |

### Physics & Collision

| Module | What It Does | Key Classes |
|--------|-------------|-------------|
| **PhysicsCore** | Physics interface layer | `FBodyInstance`, `FPhysicsInterface` |
| **Chaos** | Default physics engine (replaced PhysX in UE5) | `FChaosPhysicsMaterial`, `FPhysicsConstraintHandle` |
| **ChaosSolverEngine** | Destruction, fracture, cloth | `AGeometryCollectionActor`, `UGeometryCollectionComponent` |

### Rendering

| Module | What It Does | Notes |
|--------|-------------|-------|
| **Renderer** | Core rendering pipeline | Always present |
| **RenderCore** | Render thread utilities, shader compilation | Low-level; rarely referenced directly |
| **Nanite** | Virtual geometry — billions of triangles | Built into meshes; enable per-Static Mesh |
| **Lumen** | Dynamic global illumination + reflections | Project Settings → Global Illumination Method |
| **MegaLights** (5.5+) | Many dynamic lights without performance cliff | Enable in Project Settings; complements Lumen |
| **VirtualShadowMaps** | High-quality shadows for Nanite geometry | Default shadow method in UE5 |

### UI

| Module | What It Does | Key Classes | When to Use |
|--------|-------------|-------------|-------------|
| **UMG** | Widget-based runtime UI | `UUserWidget`, `UWidgetBlueprint`, `UButton` | HUD, menus, in-game UI |
| **CommonUI** | Cross-platform UI framework (gamepad/mouse/touch) | `UCommonActivatableWidget`, `UCommonButtonBase` | Multi-platform games; console-friendly menus |
| **Slate** | Low-level C++ UI framework (editor & runtime) | `SWidget`, `SCompoundWidget`, `STextBlock` | Custom editor tools; advanced runtime UI |

### Audio

| Module | What It Does | Key Classes |
|--------|-------------|-------------|
| **AudioMixer** | Core audio mixing and playback | `USoundWave`, `USoundCue`, `UAudioComponent` |
| **MetaSounds** | Node-graph procedural audio (UE 5.x) | `UMetaSoundSource`, MetaSound graph editor |
| **AudioModulation** | Runtime volume/pitch control buses | `USoundModulationParameter`, `USoundControlBusMix` |

### Networking

| Module | What It Does | Key Classes |
|--------|-------------|-------------|
| **NetCore** | Replication, RPCs, network serialization | Built into `AActor` — `UFUNCTION(Server)`, `UFUNCTION(Client)` |
| **OnlineSubsystem** | Platform-agnostic online services interface | `IOnlineSubsystem`, `IOnlineSession` |
| **OnlineSubsystemUtils** | Blueprint nodes for sessions | `CreateSession`, `FindSession`, `JoinSession` |
| **OnlineSubsystemSteam** | Steam integration (sessions, friends, achievements) | Enable plugin + configure `DefaultEngine.ini` |
| **OnlineSubsystemEOS** | Epic Online Services integration | Epic's cross-platform backend |

### Animation

| Module | What It Does | Key Classes |
|--------|-------------|-------------|
| **AnimGraphRuntime** | Animation Blueprints, state machines, blend spaces | `UAnimInstance`, `UAnimBlueprint` |
| **IKRig** | Retargeting and procedural IK (UE 5.x) | `UIKRigDefinition`, `UIKRetargeter` |
| **ControlRig** | Procedural animation and rigging in Sequencer | `UControlRig`, `URigHierarchy` |

### Sequencer & Cinematics

| Module | What It Does | Key Classes |
|--------|-------------|-------------|
| **LevelSequence** | Timeline-based cinematic sequences | `ALevelSequenceActor`, `ULevelSequence` |
| **MovieScene** | Core sequencer data model | `UMovieScene`, `UMovieSceneTrack` |
| **TemplateSequence** | Reusable sequence templates | `UTemplateSequence` |

---

## Essential Engine Plugins

These ship with UE5 but must be **enabled** in Edit → Plugins. They're off by default to keep project complexity manageable.

### Highly Recommended

| Plugin | What It Does | When to Enable |
|--------|-------------|----------------|
| **Common UI** | Cross-platform UI with input routing | Any game targeting gamepad + mouse/touch |
| **Gameplay Abilities** | GAS — abilities, attributes, effects | RPGs, action games, multiplayer with ability interactions |
| **Enhanced Input** | Modern input system | Enabled by default in UE 5.1+; verify it's active |
| **Niagara** | GPU/CPU particle system (replaces Cascade) | Any project with VFX |
| **MetaSounds** | Procedural audio | Projects needing dynamic/reactive audio |
| **Water** | Ocean/lake/river system with buoyancy | Open-world games with water bodies |
| **Datasmith** | CAD/DCC import pipeline | Arch-viz, importing from 3ds Max, Revit, etc. |

### Specialized

| Plugin | What It Does | When to Enable |
|--------|-------------|----------------|
| **Paper2D** | 2D sprite rendering and flipbook animation | 2D or 2.5D games |
| **Procedural Mesh Component** | Runtime mesh generation | Voxels, terrain deformation, custom geometry |
| **Geometry Scripting** | Runtime mesh operations (Boolean, extrude) | Level editors, procedural content tools |
| **Pixel Streaming** | Stream rendered frames to a browser | Cloud gaming, remote visualization |
| **Movie Render Queue** | High-quality offline rendering | Cinematics, trailers at higher-than-realtime quality |
| **Game Features** | Modular gameplay feature plugins | Large projects, DLC, live-service content |
| **Modular Gameplay** | Base classes for modular game systems | Foundation for Game Feature Plugins |

---

## Fab Marketplace — Essential Third-Party Plugins

Fab (formerly Unreal Marketplace) is the primary distribution channel. These are widely adopted community/commercial plugins.

| Plugin | What It Does | Notes |
|--------|-------------|-------|
| **Oceanology** | Advanced ocean/water with buoyancy and caustics | Commercial; more features than built-in Water |
| **Dungeon Architect** | Procedural level generation (node-based) | Roguelikes, infinite dungeons |
| **Dialogue Plugin** | Branching dialogue trees with conditions | RPGs, narrative games |
| **Easy Multi Save** | Slot-based save/load system | Quick save system setup without building from scratch |
| **Voxel Plugin** | Voxel terrain with Nanite support | Destructible terrain, Minecraft-style worlds |
| **Narrative** | Quest and dialogue system | Open-world games with quest tracking |

---

## Open-Source & Community Tools

| Tool | Source | What It Does |
|------|--------|-------------|
| **UnrealGameSync (UGS)** | Epic (GitHub) | Perforce changelist dashboard for team syncing |
| **GameplayMessageRouter** | Lyra sample | Decoupled event messaging between game systems |
| **CommonGame** | Lyra sample | Base game framework classes (experiences, user-facing errors) |
| **Unreal Engine Style Guide** | GitHub (various) | Community naming and folder conventions |
| **UnrealSharp** | GitHub | C# scripting for Unreal via .NET hosting |
| **Horde** | Epic (internal / enterprise) | Build automation and CI/CD for UE projects |

---

## .Build.cs Quick Reference

A typical gameplay module dependency block for a mid-size project:

```csharp
// MyGame.Build.cs
using UnrealBuildTool;

public class MyGame : ModuleRules
{
    public MyGame(ReadOnlyTargetRules Target) : base(Target)
    {
        PCHUsage = PCHUsageMode.UseExplicitOrSharedPCHs;

        // WHY: These are the foundation modules every gameplay module needs.
        // Core/CoreUObject/Engine provide UObject, AActor, UWorld.
        // InputCore provides FKey types for binding checks.
        PublicDependencyModuleNames.AddRange(new string[]
        {
            "Core",
            "CoreUObject",
            "Engine",
            "InputCore"
        });

        // WHY: Private dependencies keep these systems as implementation details.
        // Other modules depending on MyGame won't transitively pull these in,
        // which keeps compile times down and coupling loose.
        PrivateDependencyModuleNames.AddRange(new string[]
        {
            "EnhancedInput",       // Action-based input
            "GameplayAbilities",   // GAS: abilities, attributes, effects
            "GameplayTags",        // Tag-based categorization
            "GameplayTasks",       // Async tasks (required by GAS)
            "CommonUI",            // Cross-platform widget base classes
            "UMG",                 // Widget Blueprints
            "NavigationSystem",    // NavMesh AI
            "AIModule",            // Behavior Trees, Blackboard
            "Niagara",             // Particle VFX
            "PhysicsCore"          // Physics queries and collision
        });
    }
}
```

---

## Decision Flowchart: Choosing Modules & Plugins

```
Starting a new project?
│
├── Input ──► Always use EnhancedInput (default since UE 5.1)
│
├── UI ──► Basic HUD → UMG widgets
│          Multi-platform (gamepad + mouse) → CommonUI + UMG
│          Editor tools → Slate
│
├── Abilities / RPG mechanics? ──► GAS (GameplayAbilities + Tags + Tasks)
│   └── Simple cooldowns only? ──► Skip GAS; use Timers + GameplayTags
│
├── AI? ──► New project → State Trees (UE 5.4+)
│           Existing BT assets → Behavior Trees + Blackboard
│           Both → Can coexist in the same project
│
├── VFX ──► Niagara (always; Cascade is deprecated)
│
├── Audio ──► Simple playback → SoundCue + AudioComponent
│             Procedural / reactive → MetaSounds
│
├── Multiplayer? ──► Built-in replication (NetCore) for gameplay
│                    OnlineSubsystem for platform services (Steam, EOS)
│
├── Water / Ocean? ──► Built-in Water plugin (basic)
│                      Oceanology (advanced: caustics, buoyancy)
│
└── Save System? ──► See G8 Save/Load guide for built-in approach
                     Easy Multi Save plugin for quick slot-based saves
```

---

## Tips for Managing Dependencies

1. **Start minimal** — only add modules you actively use. Every dependency increases compile time.
2. **Private over Public** — prefer `PrivateDependencyModuleNames` unless another module needs the headers.
3. **Check plugin dependencies** — some plugins (GAS, CommonUI) pull in their own modules. Read the `.uplugin` file to see what's included.
4. **Lyra is your reference** — Epic's Lyra Starter Game demonstrates the recommended module and plugin setup for a modern UE5 project. Clone it and study its `.Build.cs` files.
5. **Version lock marketplace plugins** — pin Fab plugin versions in your `.uplugin` config. Marketplace updates can introduce breaking changes mid-project.
