# E1 — Unreal Engine 5 Architecture Overview

> **Category:** explanation · **Engine:** Unreal Engine 5.4+ · **Related:** [Unreal Rules](../unreal-arch-rules.md) · [G1 Gameplay Framework](../guides/G1_gameplay_framework.md) · [G2 Enhanced Input](../guides/G2_enhanced_input.md) · [G3 UMG & Common UI](../guides/G3_umg_and_common_ui.md)

Unreal Engine 5 is a full-featured 3D game engine using C++ and a visual scripting system called Blueprints. This document explains the core architectural concepts — the Gameplay Framework, the module system, rendering technologies (Nanite, Lumen), and the C++/Blueprint partnership — that form the foundation of every UE5 project.

---

## Engine Architecture at a Glance

```
┌──────────────────────────────────────────────────────────────┐
│                       Your Game Code                          │
│  ┌───────────────┐  ┌───────────────┐  ┌──────────────────┐ │
│  │   C++ Classes  │  │  Blueprints   │  │   Data Assets    │ │
│  │  (Source/)     │  │  (Content/)   │  │  (DataTables,    │ │
│  │               │  │               │  │   Curves, etc.)  │ │
│  └───────┬───────┘  └───────┬───────┘  └────────┬─────────┘ │
├──────────┼──────────────────┼────────────────────┼───────────┤
│          │   UE5 Gameplay Framework & Subsystems │           │
│  ┌───────▼──────────────────▼────────────────────▼────────┐  │
│  │  GameMode · GameState · PlayerController · Pawn        │  │
│  │  GameInstance · PlayerState · HUD                      │  │
│  ├────────────────────────────────────────────────────────┤  │
│  │  Enhanced Input · GAS · Navigation · AI (BehaviorTree) │  │
│  │  Niagara (Particles) · Chaos (Physics) · Audio Engine  │  │
│  │  World Partition · Level Streaming · Sequencer         │  │
│  └────────────────────────┬──────────────────────────────┘  │
├───────────────────────────┼──────────────────────────────────┤
│              Rendering Pipeline                               │
│  ┌────────────────────────▼──────────────────────────────┐  │
│  │  Nanite (Virtual Geometry) · Lumen (Global Illumination)│ │
│  │  Virtual Shadow Maps · MegaLights (5.5+)               │ │
│  │  Path Tracer · Temporal Super Resolution (TSR)         │  │
│  └───────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────┘
```

---

## The Gameplay Framework

The Gameplay Framework is Unreal's opinionated answer to "where does this logic go?" Every UE5 project uses these classes, whether you realize it or not — when you hit Play, the engine instantiates them automatically.

### Class Hierarchy & Responsibilities

**UGameInstance** — The Singleton That Survives Level Loads

```cpp
// GameInstance persists for the entire application lifetime.
// WHY: Use it for data that must survive map transitions — player profiles,
// save game references, online subsystem handles, global settings.
UCLASS()
class MYGAME_API UMyGameInstance : public UGameInstance
{
    GENERATED_BODY()

public:
    // This data persists when you call OpenLevel() or ServerTravel()
    UPROPERTY()
    FPlayerProfile CurrentProfile;

    UPROPERTY()
    USaveGame* CurrentSave;
};
```

**AGameModeBase** — The Server-Side Referee

GameMode only exists on the server (or in standalone). Clients never have a GameMode instance. It controls:
- Which Pawn class to spawn for each player
- Spawn locations and respawn logic
- Match flow (start, end, transitions)
- Whether a player can join mid-match

```cpp
UCLASS()
class MYGAME_API AMyGameMode : public AGameModeBase
{
    GENERATED_BODY()

public:
    AMyGameMode()
    {
        // WHY set defaults here: The engine reads these before any player joins.
        // This is the single source of truth for "what classes does this game use?"
        DefaultPawnClass = AMyCharacter::StaticClass();
        PlayerControllerClass = AMyPlayerController::StaticClass();
        PlayerStateClass = AMyPlayerState::StaticClass();
        GameStateClass = AMyGameState::StaticClass();
    }

    // Called when a player joins — customize spawn logic
    virtual AActor* ChoosePlayerStart_Implementation(AController* Player) override;
};
```

**AGameStateBase** — The Replicated Scoreboard

```cpp
// WHY GameState exists: GameMode is server-only, but clients need to know
// the match score, time remaining, game phase. GameState replicates this.
UCLASS()
class MYGAME_API AMyGameState : public AGameStateBase
{
    GENERATED_BODY()

public:
    UPROPERTY(Replicated, BlueprintReadOnly)
    int32 TeamAScore;

    UPROPERTY(Replicated, BlueprintReadOnly)
    int32 TeamBScore;

    UPROPERTY(ReplicatedUsing=OnRep_MatchPhase, BlueprintReadOnly)
    EMatchPhase CurrentPhase;

private:
    UFUNCTION()
    void OnRep_MatchPhase();
};
```

**APlayerController** — The Player's Brain

The PlayerController translates input into game actions. It persists across Pawn death/respawn — this is why it's the right place for input handling, UI management, and player identity.

**APawn / ACharacter** — The Physical Body

`APawn` is the base (any controllable actor). `ACharacter` extends Pawn with `UCharacterMovementComponent` — a feature-rich movement system supporting walking, falling, swimming, flying, and networking out of the box.

---

## Rendering Technologies (UE5)

### Nanite — Virtual Geometry

Nanite is a virtualized geometry system that automatically handles level-of-detail:
- Import film-quality meshes (millions of polygons) directly — no manual LOD authoring
- The engine streams only the triangles visible at the current pixel resolution
- Supported for static meshes and (as of UE5.5) skeletal meshes in preview

**When Nanite helps:** Dense environments, photogrammetry, architectural visualization, any scene with complex static geometry.

**When to skip Nanite:** Translucent materials, masked/cutout materials (limited support), very simple geometry where the overhead isn't justified.

### Lumen — Dynamic Global Illumination

Lumen provides real-time global illumination and reflections with no baking required:
- Fully dynamic — move lights and geometry at runtime, GI updates automatically
- Two modes: **Software ray tracing** (default, works on all hardware) and **Hardware ray tracing** (requires RTX/RDNA2+)
- Replaces lightmass baking for most projects (baked lighting still available for mobile)

### Virtual Shadow Maps

Replace the old cascaded shadow maps with a single, high-resolution virtual shadow map system. Consistent shadow quality at any distance, integrated with Nanite.

### MegaLights (UE5.5+, Experimental)

Enables thousands of dynamic light sources in a scene. Significant for open worlds and dense interior environments. Currently experimental — use with profiling.

---

## Module System

UE5 projects are organized into **modules** — C++ compilation units with explicit dependency declarations.

```csharp
// MyGame.Build.cs — module definition
// WHY modules matter: They control compilation boundaries, enforce dependency
// direction, and enable hot-reload during development.
public class MyGame : ModuleRules
{
    public MyGame(ReadOnlyTargetRules Target) : base(Target)
    {
        PCHUsage = PCHUsageMode.UseExplicitOrSharedPCHs;

        PublicDependencyModuleNames.AddRange(new string[]
        {
            "Core",
            "CoreUObject",
            "Engine",
            "InputCore",
            "EnhancedInput",       // Enhanced Input System
            "GameplayAbilities",   // GAS (if using abilities)
            "GameplayTags",        // Gameplay Tags for GAS
            "GameplayTasks",       // Async tasks for GAS
            "Niagara",             // Particle system
            "NavigationSystem"     // AI navigation
        });
    }
}
```

### Plugin Architecture

For larger projects, split features into **Game Feature Plugins**:
- Each plugin is a self-contained module with its own Content folder
- Can be loaded/unloaded at runtime (great for DLC, seasonal content)
- Enforces clean dependency boundaries

---

## Key Subsystems

### Physics — Chaos

UE5 uses the **Chaos** physics engine (replaced PhysX):
- Destruction system (Chaos Destruction) for breakable geometry
- Cloth simulation
- Ragdoll physics
- Vehicles via Chaos Vehicle system

### AI — Behavior Trees + Environment Query System

- **Behavior Trees:** The primary AI decision-making framework. Nodes include tasks, decorators, and services.
- **Blackboard:** Shared data store for a Behavior Tree — holds current target, patrol points, perception state.
- **EQS (Environment Query System):** Spatial reasoning — "find the best cover point within 10m that has line of sight to the target."

### Niagara — Particle System

Niagara replaces the legacy Cascade particle system:
- GPU-accelerated particle simulation
- Data-driven: modules, emitters, and systems are composable assets
- Supports mesh particles, ribbons, sprite particles, and fluid simulation

### World Partition (Open Worlds)

Replaces World Composition. Automatically streams level data based on distance:
- Grid-based cell loading/unloading
- Data layers for organizing world content
- HLOD (Hierarchical Level of Detail) for distant geometry

### Networking

Unreal has built-in networking with a server-authoritative model:
- `UPROPERTY(Replicated)` for automatic state sync
- `UFUNCTION(Server)` / `UFUNCTION(Client)` / `UFUNCTION(NetMulticast)` for RPCs
- `ReplicatedUsing=OnRep_X` for client-side response to replicated state changes
- GameMode is server-only; GameState and PlayerState replicate to all clients

---

## Build & Iteration

### Compilation Modes

| Mode | Use Case |
|------|----------|
| **Development** | Default for iteration. Includes debug symbols, unoptimized. |
| **DebugGame** | Full debugging but with engine optimized. |
| **Shipping** | Final release build. No debug tools, console commands stripped. |
| **Test** | Like Shipping but with test hooks. |

### Live Coding (Hot Reload)

UE5 supports **Live Coding** (`Ctrl+Alt+F11`) — recompile C++ changes without restarting the editor. Limitations:
- Cannot add new `UPROPERTY`/`UFUNCTION` (requires full restart)
- Cannot change class hierarchy
- Works well for logic-only changes inside existing functions

### Key Console Commands for Development

```
stat fps              — FPS counter
stat unit             — Frame time breakdown (Game, Draw, GPU, Render)
stat scenerendering   — Draw call count, triangle count
stat memory           — Memory usage overview
profilegpu            — GPU profiler snapshot
```
