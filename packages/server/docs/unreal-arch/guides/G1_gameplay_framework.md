# G1 — The Gameplay Framework in Unreal Engine 5

> **Category:** guide · **Engine:** Unreal Engine 5.4+ · **Related:** [Architecture Overview](../architecture/E1_architecture_overview.md) · [Unreal Rules](../unreal-arch-rules.md) · [G2 Enhanced Input](G2_enhanced_input.md)

The Gameplay Framework is Unreal's opinionated class hierarchy that answers "where does this logic go?" for every game system. Understanding which class owns which responsibility is the single most important architectural decision in any UE5 project. This guide walks through each class, its role, its replication behavior, and practical implementation patterns.

---

## Why the Framework Exists

Most engines give you a blank canvas. Unreal gives you a pre-built framework with specific classes for specific jobs. This is opinionated by design — it means:

- Multiplayer "just works" when you put logic in the right place (GameMode on server, GameState replicated to clients)
- New team members immediately know where to find scoring logic (GameState), spawn rules (GameMode), or per-player data (PlayerState)
- Engine features like seamless travel, spectating, and matchmaking hook into the framework automatically

The cost is that **fighting the framework** — putting game rules in the Pawn, or persistent state in the GameMode — causes bugs that are difficult to diagnose, especially in multiplayer.

---

## Class Hierarchy Overview

```
UGameInstance
│   Lifetime: entire application
│   Replication: NONE (local only)
│
├── AGameModeBase
│   │   Lifetime: one map/level
│   │   Replication: SERVER ONLY (never exists on clients)
│   │
│   ├── AGameStateBase
│   │       Lifetime: one map/level
│   │       Replication: ALL CLIENTS
│   │
│   ├── APlayerController
│   │   │   Lifetime: player connection (survives respawn)
│   │   │   Replication: OWNING CLIENT only
│   │   │
│   │   ├── APlayerState
│   │   │       Lifetime: player connection
│   │   │       Replication: ALL CLIENTS
│   │   │
│   │   └── APawn / ACharacter  (possessed)
│   │           Lifetime: until killed/destroyed
│   │           Replication: ALL CLIENTS (relevant set)
│   │
│   └── AHUD
│           Lifetime: one map/level
│           Replication: NONE (local only)
```

---

## Each Class in Detail

### UGameInstance — The Application Singleton

`UGameInstance` persists for the **entire application lifetime** — it survives level loads, seamless travel, and map transitions. There is exactly one instance.

**Put here:** Player profile data, save game references, online subsystem handles, global audio settings, analytics session state.

**Do NOT put here:** Match-specific data (that's GameState), per-player stats (that's PlayerState), or anything that should reset between levels.

```cpp
UCLASS()
class MYGAME_API UMyGameInstance : public UGameInstance
{
    GENERATED_BODY()

public:
    // WHY here and not GameState: Profile data must survive level transitions.
    // GameState is destroyed when a new map loads. GameInstance is not.
    UPROPERTY(BlueprintReadWrite, Category = "Player")
    FString PlayerDisplayName;

    UPROPERTY()
    TObjectPtr<USaveGame> ActiveSaveGame;

    // Called once when the application starts — good for one-time init
    virtual void Init() override;

    // Called when traveling to a new map — persist data across the transition
    virtual void OnWorldChanged(UWorld* OldWorld, UWorld* NewWorld) override;
};
```

### AGameModeBase — The Server-Side Referee

The GameMode **only exists on the server** (or in standalone play). Clients never have a GameMode instance. It controls the rules of the game: who spawns, where they spawn, when the match starts/ends.

**Put here:** Spawn logic, match flow control, player join/leave handling, win/loss conditions, cheat detection.

**Do NOT put here:** Data that clients need to see — the GameMode is invisible to them.

```cpp
UCLASS()
class MYGAME_API AMyGameMode : public AGameModeBase
{
    GENERATED_BODY()

public:
    AMyGameMode()
    {
        // WHY set these in the constructor: The engine reads these defaults
        // before any player connects. This is the authoritative source for
        // "which classes does this game use?"
        DefaultPawnClass = AMyCharacter::StaticClass();
        PlayerControllerClass = AMyPlayerController::StaticClass();
        PlayerStateClass = AMyPlayerState::StaticClass();
        GameStateClass = AMyGameState::StaticClass();
    }

    // Called when a new player joins — customize spawn point selection
    virtual AActor* ChoosePlayerStart_Implementation(AController* Player) override
    {
        // WHY override this: The default picks a random PlayerStart.
        // Most games need team-based spawning, spawn protection zones,
        // or distance-from-enemy checks.
        TArray<AActor*> PlayerStarts;
        UGameplayStatics::GetAllActorsOfClass(
            GetWorld(), APlayerStart::StaticClass(), PlayerStarts
        );

        // Example: pick the start farthest from existing players
        return FindFarthestSpawnFromEnemies(PlayerStarts, Player);
    }

    // Called when a player dies — handle respawn timing
    virtual void HandlePlayerDeath(APlayerController* DeadPlayer)
    {
        // WHY a method on GameMode: Death/respawn is a RULE, not a player action.
        // The server decides when and where the player respawns.
        FTimerHandle RespawnTimer;
        GetWorldTimerManager().SetTimer(
            RespawnTimer,
            [this, DeadPlayer]()
            {
                RestartPlayer(DeadPlayer);
            },
            RespawnDelay,
            false  // not looping
        );
    }

protected:
    UPROPERTY(EditDefaultsOnly, Category = "Rules")
    float RespawnDelay = 3.0f;
};
```

#### AGameMode vs AGameModeBase

`AGameModeBase` is the lightweight base. `AGameMode` (extends `AGameModeBase`) adds match state management — a state machine for `WaitingToStart → InProgress → WaitingPostMatch → LeavingMap`. Use `AGameMode` if your game has distinct match phases (arena shooters, battle royale). Use `AGameModeBase` for everything else (open world, RPG, puzzle).

### AGameStateBase — The Replicated Scoreboard

GameState is the companion to GameMode. While GameMode is server-only, GameState **replicates to all clients**. Anything clients need to know about the match — score, time remaining, current phase — belongs here.

```cpp
UCLASS()
class MYGAME_API AMyGameState : public AGameStateBase
{
    GENERATED_BODY()

public:
    // Replicated: all clients automatically receive updates to this value
    UPROPERTY(Replicated, BlueprintReadOnly, Category = "Match")
    int32 TeamAScore;

    UPROPERTY(Replicated, BlueprintReadOnly, Category = "Match")
    int32 TeamBScore;

    // ReplicatedUsing: triggers a callback on clients when the value changes
    // WHY OnRep: Clients need to react to phase changes (show "Match Starting"
    // UI, play a sound, enable/disable input). OnRep is the notification.
    UPROPERTY(ReplicatedUsing = OnRep_MatchPhase, BlueprintReadOnly, Category = "Match")
    EMatchPhase CurrentPhase;

    // WHY a multicast event: UI widgets can bind to this delegate to update
    // without polling the phase every frame.
    UPROPERTY(BlueprintAssignable, Category = "Match")
    FOnMatchPhaseChanged OnMatchPhaseChanged;

protected:
    // REQUIRED: Register replicated properties with the engine
    virtual void GetLifetimeReplicatedProps(
        TArray<FLifetimeProperty>& OutLifetimeProps) const override
    {
        Super::GetLifetimeReplicatedProps(OutLifetimeProps);

        // WHY DOREPLIFETIME: This macro tells the replication system which
        // properties to sync. Without it, UPROPERTY(Replicated) is ignored.
        DOREPLIFETIME(AMyGameState, TeamAScore);
        DOREPLIFETIME(AMyGameState, TeamBScore);
        DOREPLIFETIME(AMyGameState, CurrentPhase);
    }

private:
    UFUNCTION()
    void OnRep_MatchPhase()
    {
        OnMatchPhaseChanged.Broadcast(CurrentPhase);
    }
};
```

### APlayerController — The Player's Brain

The PlayerController is the bridge between the human player and their Pawn. It **persists across respawns** — when the Pawn dies, the PlayerController lives on and can possess a new Pawn.

**Put here:** Input handling (Enhanced Input binding), UI/HUD management, camera control that isn't tied to the Pawn, pause menu logic.

**Do NOT put here:** Physical movement (that's the Pawn), per-player stats visible to others (that's PlayerState).

```cpp
UCLASS()
class MYGAME_API AMyPlayerController : public APlayerController
{
    GENERATED_BODY()

public:
    // WHY manage UI here: The controller persists across death/respawn.
    // If UI lived on the Pawn, it would be destroyed with the Pawn.
    void ShowGameOverScreen();
    void TogglePauseMenu();

protected:
    virtual void BeginPlay() override
    {
        Super::BeginPlay();

        // Only create UI on the local client — the server doesn't need widgets
        if (IsLocalController())
        {
            CreateHUDWidget();
        }
    }

    // Called when this controller possesses a new Pawn
    virtual void OnPossess(APawn* InPawn) override
    {
        Super::OnPossess(InPawn);
        // WHY here: Rebind any Pawn-dependent UI (health bar, ammo counter)
        // to the new Pawn's components.
        BindHUDToPawn(InPawn);
    }
};
```

### APlayerState — Per-Player Replicated Data

PlayerState holds data about a specific player that **all clients can see**: display name, team, score, kills, ping. It's replicated to everyone, not just the owning client.

**Put here:** Player name, team assignment, individual score/kills, cosmetic loadout.

**Do NOT put here:** Input state (Controller), physical position (Pawn), or match-wide data (GameState).

```cpp
UCLASS()
class MYGAME_API AMyPlayerState : public APlayerState
{
    GENERATED_BODY()

public:
    UPROPERTY(Replicated, BlueprintReadOnly, Category = "Player")
    ETeam Team;

    UPROPERTY(Replicated, BlueprintReadOnly, Category = "Stats")
    int32 Kills;

    UPROPERTY(Replicated, BlueprintReadOnly, Category = "Stats")
    int32 Deaths;

    // Server-only function to add a kill
    // WHY Server authority: Only the server should modify stats to prevent cheating.
    void AddKill()
    {
        if (HasAuthority())
        {
            Kills++;
        }
    }

protected:
    virtual void GetLifetimeReplicatedProps(
        TArray<FLifetimeProperty>& OutLifetimeProps) const override
    {
        Super::GetLifetimeReplicatedProps(OutLifetimeProps);
        DOREPLIFETIME(AMyPlayerState, Team);
        DOREPLIFETIME(AMyPlayerState, Kills);
        DOREPLIFETIME(AMyPlayerState, Deaths);
    }
};
```

### APawn / ACharacter — The Physical Body

The Pawn is the physical representation of a player (or AI) in the world. `ACharacter` extends `APawn` with `UCharacterMovementComponent` — a battle-tested movement system supporting walking, jumping, falling, swimming, flying, crouching, and networked prediction out of the box.

**Put here:** Movement logic, collision responses, mesh/animation, abilities tied to the physical body.

**Do NOT put here:** Game rules (GameMode), input binding (Controller), persistent player identity (PlayerState).

```cpp
UCLASS()
class MYGAME_API AMyCharacter : public ACharacter
{
    GENERATED_BODY()

public:
    AMyCharacter()
    {
        // WHY use CharacterMovementComponent defaults: They handle networked
        // movement prediction, reconciliation, and smoothing automatically.
        // Overriding these without understanding replication causes desync.
        GetCharacterMovement()->MaxWalkSpeed = 600.f;
        GetCharacterMovement()->JumpZVelocity = 420.f;
        GetCharacterMovement()->AirControl = 0.2f;
    }

    // Called from PlayerController's input binding (Enhanced Input)
    void HandleMove(const FInputActionValue& Value)
    {
        FVector2D Input = Value.Get<FVector2D>();

        // WHY use controller rotation, not actor rotation: The controller's
        // rotation represents where the player is LOOKING (camera direction).
        // Movement should be relative to the camera, not the character mesh.
        const FRotator Rotation = GetControlRotation();
        const FRotator YawRotation(0, Rotation.Yaw, 0);

        const FVector ForwardDir = FRotationMatrix(YawRotation).GetUnitAxis(EAxis::X);
        const FVector RightDir = FRotationMatrix(YawRotation).GetUnitAxis(EAxis::Y);

        AddMovementInput(ForwardDir, Input.Y);
        AddMovementInput(RightDir, Input.X);
    }
};
```

---

## Decision Table: Where Does This Logic Go?

| Logic | Class | Replication | Why |
|-------|-------|-------------|-----|
| Match rules (win/lose, scoring formula) | `AGameModeBase` | Server only | Server authority prevents cheating |
| Match state (score, timer, phase) | `AGameStateBase` | All clients | Everyone sees the same state |
| Per-player stats (kills, team, name) | `APlayerState` | All clients | All players see each other's stats |
| Input processing | `APlayerController` | Owning client | Persists across death/respawn |
| UI widget management | `APlayerController` / `AHUD` | Local only | Only the local player needs widgets |
| Physical movement, collision | `APawn` / `ACharacter` | All clients (relevant) | The body in the world |
| Abilities, buffs, cooldowns | GAS (on Pawn) | Server + owning client | Data-driven, replicated |
| Persistent data (saves, settings) | `UGameInstance` | None (local) | Survives level transitions |
| Spawn location selection | `AGameModeBase` | Server only | Server decides where players appear |
| Camera control | `APlayerController` or Pawn | Owning client | Depends on whether camera survives death |

---

## Common Mistakes

1. **Putting game rules in the Pawn.** When the Pawn dies, the rules die with it. Win conditions, scoring, and spawn logic belong in GameMode.

2. **Trying to access GameMode on clients.** `GetWorld()->GetAuthGameMode()` returns `nullptr` on clients. Use GameState for any data clients need.

3. **Forgetting `GetLifetimeReplicatedProps`.** Marking a property `Replicated` without registering it via `DOREPLIFETIME` means it silently never replicates.

4. **Storing persistent data in GameState.** GameState is destroyed on level transition. Use `UGameInstance` for data that must survive map changes.

5. **Creating UI on the server.** Always guard widget creation with `IsLocalController()`. The dedicated server has no viewport and will crash or waste memory creating invisible widgets.

6. **Skipping `Super::` calls.** Nearly every overridden framework function (BeginPlay, OnPossess, HandleStartingNewPlayer) requires calling the parent implementation. Skipping it breaks engine functionality silently.

---

## Practical Example: Putting It All Together

A simple team deathmatch setup showing where each piece of logic lives:

```
UMyGameInstance
  └── Stores player profile, matchmaking preferences

AMyGameMode (server only)
  ├── Sets DefaultPawnClass, PlayerControllerClass
  ├── HandleStartingNewPlayer() → assigns team via PlayerState
  ├── HandlePlayerDeath() → awards kill to attacker's PlayerState
  └── CheckWinCondition() → reads kills from all PlayerStates

AMyGameState (replicated to all)
  ├── TeamAScore, TeamBScore (replicated)
  ├── CurrentPhase: WaitingForPlayers → InProgress → PostMatch
  └── MatchTimeRemaining (replicated)

AMyPlayerController (per-player)
  ├── Enhanced Input bindings
  ├── HUD widget management
  └── Pause menu, scoreboard toggle

AMyPlayerState (per-player, replicated to all)
  ├── Team assignment
  ├── Kills, Deaths, Assists
  └── Display name, cosmetic loadout ID

AMyCharacter (physical body)
  ├── CharacterMovementComponent (walk, jump, crouch)
  ├── Health component (damage, death notification → GameMode)
  └── Weapon component (fire, reload, ammo)
```
