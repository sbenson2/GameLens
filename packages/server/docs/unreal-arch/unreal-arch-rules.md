# Unreal Engine 5 — AI Code Generation Rules

Engine-specific rules for Unreal Engine 5.4+ projects using C++ and Blueprints. These supplement the engine-agnostic rules in `docs/core/ai-workflow/gamedev-rules.md`.

---

## ⚠️ UE4 vs UE5 — Critical Differences

Unreal Engine 5 introduced major subsystem changes. Much online content and AI training data references UE4 patterns. **Always target UE5 APIs.**

### Key API Changes

| UE4 (WRONG) | UE5 (CORRECT) | Notes |
|---|---|---|
| `InputComponent->BindAction("Jump", ...)` | Enhanced Input: `IA_Jump` + `IMC_Default` | Legacy input binding is deprecated |
| `UCharacterMovementComponent` only | `UCharacterMovementComponent` or GAS | Gameplay Ability System for complex ability-driven movement |
| `UMaterialInstanceDynamic` with forward renderer | Nanite + Lumen materials pipeline | Nanite virtualizes geometry; Lumen handles GI |
| `AGameMode` | `AGameModeBase` | `AGameMode` adds match state on top; use Base unless you need match flow |
| `FName`-based input bindings | `UInputAction` + `UInputMappingContext` | Enhanced Input is the UE5 standard |
| StaticMesh LODs (manual) | Nanite (automatic) | Nanite eliminates manual LOD setup for supported meshes |
| Baked lightmaps as primary GI | Lumen (dynamic GI + reflections) | Lumen is default in UE5; baked still available for mobile |
| `ConstructorHelpers::FObjectFinder` everywhere | Soft references + `TSoftObjectPtr<>` | Avoid hard references that bloat memory |

### Deprecated Systems to Avoid

- **Matinee** — replaced by Sequencer
- **UMG widget animations via code** — use Sequencer or CommonUI
- **Legacy input system** — use Enhanced Input
- **World Composition** — replaced by World Partition (UE5.0+)
- **CharacterMovementComponent as sole option** — the Mover Plugin (`UMoverComponent`, experimental UE 5.4+) is the next-gen replacement. Works on any Actor, modular movement modes, built-in rollback networking. Use CMC for shipping titles that need stability; evaluate Mover for new projects targeting UE 5.7+
- **External DCC for morph targets** — UE 5.6+ supports in-editor morph target sculpting via the Skeletal Mesh Editor (experimental). Reduces round-trip iteration time for corrective blend shapes

---

## Architecture Rules

### The Gameplay Framework

Unreal's gameplay framework is a set of interconnected classes with specific responsibilities. Understanding which class owns which responsibility is the most important architectural decision in any UE project.

```
┌─────────────────────────────────────────────────────┐
│                  UGameInstance                        │
│  Persists across level loads. Global state, saves.   │
├─────────────────────────────────────────────────────┤
│                                                      │
│  ┌─────────────────────┐  ┌──────────────────────┐  │
│  │   AGameModeBase     │  │    AGameStateBase    │  │
│  │   (Server only)     │◄─┤    (Replicated)      │  │
│  │   Rules, spawning,  │  │    Score, phase,     │  │
│  │   match flow        │  │    connected players │  │
│  └─────────┬───────────┘  └──────────────────────┘  │
│            │ spawns                                   │
│  ┌─────────▼───────────┐  ┌──────────────────────┐  │
│  │  APlayerController  │  │    APlayerState      │  │
│  │  Input → commands   │◄─┤    Per-player data   │  │
│  │  Possesses Pawns    │  │    (replicated)      │  │
│  │  Manages UI (HUD)   │  │    Name, score, team │  │
│  └─────────┬───────────┘  └──────────────────────┘  │
│            │ possesses                                │
│  ┌─────────▼───────────┐                             │
│  │      APawn /        │                             │
│  │    ACharacter       │                             │
│  │  Physical presence  │                             │
│  │  Movement, mesh,    │                             │
│  │  collision          │                             │
│  └─────────────────────┘                             │
└─────────────────────────────────────────────────────┘
```

### Where to Put Logic — Decision Table

| Logic Type | Put It In | Why |
|---|---|---|
| Game rules (win/lose, scoring) | `AGameModeBase` | Server authority; invisible to clients |
| Match state (score, phase, timer) | `AGameStateBase` | Replicated to all clients |
| Per-player stats (kills, team) | `APlayerState` | Replicated, persists across respawns |
| Input processing | `APlayerController` | Persists across Pawn death/respawn |
| Physical movement, collision | `APawn` / `ACharacter` | The body in the world |
| Persistent data (save/load, settings) | `UGameInstance` | Survives level transitions |
| Abilities, buffs, cooldowns | Gameplay Ability System (GAS) | Data-driven, replicated, composable |
| UI widget management | `AHUD` or `APlayerController` | Controller owns the player's UI |

### Project Structure Conventions

```
Source/
├── {ProjectName}/
│   ├── {ProjectName}.h / .cpp      # Module definition
│   ├── Core/                        # Game instance, game mode, game state
│   ├── Player/                      # Player controller, player state, character
│   ├── Characters/                  # NPCs, enemies, base character classes
│   ├── Abilities/                   # GAS: abilities, effects, attribute sets
│   ├── Weapons/                     # Weapon actors, projectiles
│   ├── UI/                          # UMG widget classes, HUD
│   ├── Input/                       # Enhanced Input actions + mapping contexts
│   ├── Data/                        # Data assets, data tables, curves
│   └── Subsystems/                  # Game instance & world subsystems
Content/
├── Blueprints/                      # Blueprint classes organized by feature
├── Maps/                            # Level assets
├── UI/                              # Widget Blueprints, textures, fonts
├── Characters/                      # Skeletal meshes, animation BPs
├── Environment/                     # Static meshes, materials, textures
├── Audio/                           # Sound cues, attenuation, mixes
├── Data/                            # Data tables, curves, data assets
├── Input/                           # IA_ and IMC_ assets
└── FX/                              # Niagara systems, materials
```

---

## C++ / Blueprint Division of Labor

The golden rule: **C++ defines the architecture; Blueprints define the content.**

### Use C++ For

- Base classes that define interfaces and core logic
- Performance-critical systems (AI inner loops, procedural generation)
- Networking: RPCs, replication rules, anti-cheat
- Subsystems and plugin modules
- Anything that needs source control diffing (Blueprints are binary)

### Use Blueprints For

- Subclassing C++ base classes to set default properties
- Level scripting, triggers, event sequences
- UI widget layout and animation
- Prototyping gameplay mechanics
- Designers tuning values, timelines, and visual scripting

### The C++ Base + Blueprint Child Pattern

```cpp
// C++ base class — defines the interface and core logic
// WHY: C++ is diffable, testable, and performant. Designers extend via Blueprint.
UCLASS(Abstract, Blueprintable)
class MYGAME_API AWeaponBase : public AActor
{
    GENERATED_BODY()

public:
    // BlueprintCallable: designers can call this from Blueprint event graphs
    UFUNCTION(BlueprintCallable, Category = "Weapon")
    void Fire();

    // BlueprintNativeEvent: C++ provides default, Blueprint can override
    UFUNCTION(BlueprintNativeEvent, Category = "Weapon")
    void OnFired();

protected:
    // EditDefaultsOnly: visible in Blueprint defaults, not per-instance
    UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Weapon")
    float FireRate = 0.5f;

    UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Weapon")
    int32 MaxAmmo = 30;

    UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Weapon")
    TSubclassOf<AProjectileBase> ProjectileClass;
};
```

Then in the Content Browser, create `BP_Shotgun` inheriting from `AWeaponBase`, set `FireRate = 0.8f`, `MaxAmmo = 8`, assign the shotgun mesh and projectile — **no C++ needed for content variants**.

---

## Enhanced Input System Rules

Always use **Enhanced Input** (UE5 default). Never use the legacy `BindAction`/`BindAxis` pattern.

```cpp
// Step 1: Create Input Action assets in the editor
//   IA_Move (Value Type: Axis2D / Vector2D)
//   IA_Jump (Value Type: Digital / Bool)
//   IA_Look (Value Type: Axis2D / Vector2D)

// Step 2: Create Input Mapping Context (IMC_Default)
//   Map IA_Move → WASD (with Swizzle modifier for 2D), Gamepad Left Stick
//   Map IA_Jump → Spacebar, Gamepad Face Button Bottom
//   Map IA_Look → Mouse Delta, Gamepad Right Stick

// Step 3: Bind in C++
void AMyCharacter::SetupPlayerInputComponent(UInputComponent* PlayerInputComponent)
{
    Super::SetupPlayerInputComponent(PlayerInputComponent);

    // WHY: Enhanced Input uses asset references instead of string names.
    // This prevents typo bugs and allows designers to remap without code changes.
    if (UEnhancedInputComponent* EnhancedInput =
        Cast<UEnhancedInputComponent>(PlayerInputComponent))
    {
        EnhancedInput->BindAction(IA_Move, ETriggerEvent::Triggered, this,
            &AMyCharacter::HandleMove);
        EnhancedInput->BindAction(IA_Jump, ETriggerEvent::Started, this,
            &AMyCharacter::HandleJump);
    }
}

// Step 4: Add the mapping context in BeginPlay
void AMyCharacter::BeginPlay()
{
    Super::BeginPlay();

    if (APlayerController* PC = Cast<APlayerController>(GetController()))
    {
        if (UEnhancedInputLocalPlayerSubsystem* Subsystem =
            ULocalPlayer::GetSubsystem<UEnhancedInputLocalPlayerSubsystem>(
                PC->GetLocalPlayer()))
        {
            // Priority 0 = default; higher priority contexts override lower ones
            Subsystem->AddMappingContext(IMC_Default, 0);
        }
    }
}
```

---

## Memory & Reference Rules

### Soft References for Content

```cpp
// WRONG: Hard reference — loads the asset into memory immediately
UPROPERTY(EditDefaultsOnly)
UStaticMesh* MeshToLoad;

// CORRECT: Soft reference — only loads when explicitly requested
// WHY: Hard references create a dependency chain that loads entire asset trees
// into memory. Soft references let you control when and if the asset loads.
UPROPERTY(EditDefaultsOnly)
TSoftObjectPtr<UStaticMesh> MeshToLoad;

// Load when needed:
UStaticMesh* Mesh = MeshToLoad.LoadSynchronous(); // blocking
// or use StreamableManager for async loading
```

### UPROPERTY Is Mandatory

Every `UObject*` member MUST have `UPROPERTY()`. Without it, the garbage collector cannot see the reference and may delete the object while you still hold a pointer to it.

```cpp
// WRONG: Raw pointer without UPROPERTY — dangling pointer risk
UStaticMeshComponent* MeshComp;

// CORRECT: GC-tracked reference
UPROPERTY(VisibleAnywhere)
UStaticMeshComponent* MeshComp;
```

---

## Common Pitfalls to Avoid

1. **Don't put game rules in the Pawn** — use GameMode for rules, Pawn for physical presence
2. **Don't use `ConstructorHelpers` at runtime** — it only works in constructors; use soft refs + async loading
3. **Don't hard-reference large assets** — use `TSoftObjectPtr` / `TSoftClassPtr` to control memory
4. **Don't replicate everything** — only replicate state that clients need; use `COND_OwnerOnly` where possible
5. **Don't skip `Super::` calls** — almost every overridden function requires calling the parent implementation
6. **Don't use raw `new` for UObjects** — always use `NewObject<>()`, `CreateDefaultSubobject<>()`, or `SpawnActor<>()`
7. **Don't ignore the `GENERATED_BODY()` macro** — without it, reflection, replication, and Blueprint integration break silently
8. **Don't use World Composition** — it's deprecated; use World Partition for open worlds
