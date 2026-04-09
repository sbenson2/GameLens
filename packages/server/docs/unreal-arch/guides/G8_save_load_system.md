# Save / Load System

> **Category:** guide · **Engine:** Unreal Engine 5.x · **Related:** [G1 Gameplay Framework](G1_gameplay_framework.md), [G5 Networking & Replication](G5_networking_replication.md)

Unreal Engine provides a built-in save system through the `USaveGame` class and `UGameplayStatics` helper functions. This guide covers the USaveGame architecture, synchronous and asynchronous saving, slot management, versioning, and production patterns for shipping robust save systems.

## Architecture Overview

```
USaveGame (your subclass)         ← Data container (UPROPERTY fields)
       │
UGameplayStatics                  ← Save/Load API (sync + async)
       │
ISaveGameSystem                   ← Platform abstraction (PC files, console storage)
       │
Disk / Cloud / Platform Storage   ← Physical storage
```

**Key design principle:** `USaveGame` is a plain UObject — it holds data, not logic. Your game systems read from and write to it, but the save object itself should not reference Actors, Worlds, or other gameplay objects.

## Basic USaveGame Setup

### 1. Define Your Save Game Class

```cpp
#pragma once

#include "CoreMinimal.h"
#include "GameFramework/SaveGame.h"
#include "MyProjectSaveGame.generated.h"

UCLASS()
class MYGAME_API UMyProjectSaveGame : public USaveGame
{
    GENERATED_BODY()

public:
    // --- Player State ---

    UPROPERTY(SaveGame)
    FString PlayerName;

    UPROPERTY(SaveGame)
    FVector PlayerLocation;

    UPROPERTY(SaveGame)
    FRotator PlayerRotation;

    UPROPERTY(SaveGame)
    float PlayerHealth;

    UPROPERTY(SaveGame)
    int32 PlayerLevel;

    // --- World State ---

    UPROPERTY(SaveGame)
    TArray<FString> CompletedQuests;

    UPROPERTY(SaveGame)
    TMap<FName, bool> UnlockedDoors;

    // --- Versioning ---
    // Always include a version number. When you add/remove/rename
    // fields in a future update, you can migrate old saves gracefully
    // instead of corrupting them.
    UPROPERTY(SaveGame)
    int32 SaveVersion = 1;

    // --- Metadata ---
    // Store when the save was created so the UI can show
    // "Last played: 2 days ago" without reading the file timestamp
    UPROPERTY(SaveGame)
    FDateTime SaveTimestamp;
};
```

> **Why `UPROPERTY(SaveGame)`?** The `SaveGame` specifier marks the property for UE's tagged serialization system. Only properties with this flag are written to disk. This is intentional — you may have transient runtime fields that shouldn't persist.

### 2. Synchronous Save and Load

Synchronous operations are simplest but block the game thread. Suitable for small save files or saves triggered while paused.

```cpp
#include "Kismet/GameplayStatics.h"
#include "MyProjectSaveGame.h"

void UMySaveSubsystem::SaveGame()
{
    // CreateSaveGameObject constructs a new USaveGame instance.
    // We populate it with current game state, then write to disk.
    UMyProjectSaveGame* SaveData = Cast<UMyProjectSaveGame>(
        UGameplayStatics::CreateSaveGameObject(
            UMyProjectSaveGame::StaticClass()));

    if (!SaveData) return;

    // Populate from current game state
    if (AMyPlayerCharacter* Player = GetPlayerCharacter())
    {
        SaveData->PlayerName = Player->GetPlayerName();
        SaveData->PlayerLocation = Player->GetActorLocation();
        SaveData->PlayerRotation = Player->GetActorRotation();
        SaveData->PlayerHealth = Player->GetHealth();
        SaveData->PlayerLevel = Player->GetLevel();
    }

    SaveData->SaveTimestamp = FDateTime::Now();

    // SaveGameToSlot serializes the object and writes it to disk.
    // Slot name is a string identifier (like a filename without extension).
    // User index 0 = local player (relevant for split-screen).
    bool bSuccess = UGameplayStatics::SaveGameToSlot(
        SaveData,
        TEXT("Slot_01"),  // Slot name
        0                 // User index
    );

    UE_LOG(LogSave, Log, TEXT("Save %s"),
        bSuccess ? TEXT("succeeded") : TEXT("FAILED"));
}

void UMySaveSubsystem::LoadGame()
{
    // DoesSaveGameExist is a cheap check — always verify before
    // attempting to load to avoid error spam in logs
    if (!UGameplayStatics::DoesSaveGameExist(TEXT("Slot_01"), 0))
    {
        UE_LOG(LogSave, Warning, TEXT("No save found in Slot_01"));
        return;
    }

    UMyProjectSaveGame* SaveData = Cast<UMyProjectSaveGame>(
        UGameplayStatics::LoadGameFromSlot(TEXT("Slot_01"), 0));

    if (!SaveData)
    {
        UE_LOG(LogSave, Error, TEXT("Failed to load save data"));
        return;
    }

    // Apply loaded state to game systems
    if (AMyPlayerCharacter* Player = GetPlayerCharacter())
    {
        Player->SetActorLocation(SaveData->PlayerLocation);
        Player->SetActorRotation(SaveData->PlayerRotation);
        Player->SetHealth(SaveData->PlayerHealth);
        Player->SetLevel(SaveData->PlayerLevel);
    }
}
```

### 3. Asynchronous Save and Load

For larger save files or auto-saving during gameplay, async operations prevent frame hitches:

```cpp
void UMySaveSubsystem::AsyncSaveGame()
{
    UMyProjectSaveGame* SaveData = Cast<UMyProjectSaveGame>(
        UGameplayStatics::CreateSaveGameObject(
            UMyProjectSaveGame::StaticClass()));

    if (!SaveData) return;

    PopulateSaveData(SaveData); // Your data-gathering function

    // Set up a delegate to be notified when the save completes.
    // The async version serializes on a background thread,
    // keeping the game thread free for rendering and gameplay.
    FAsyncSaveGameToSlotDelegate OnSaved;
    OnSaved.BindUObject(this, &UMySaveSubsystem::OnAsyncSaveComplete);

    UGameplayStatics::AsyncSaveGameToSlot(
        SaveData,
        TEXT("Slot_01"),
        0,
        OnSaved
    );

    // Show a "Saving..." indicator to the player
    ShowSaveIndicator(true);
}

void UMySaveSubsystem::OnAsyncSaveComplete(
    const FString& SlotName, const int32 UserIndex, bool bSuccess)
{
    ShowSaveIndicator(false);

    if (!bSuccess)
    {
        UE_LOG(LogSave, Error, TEXT("Async save to %s failed!"), *SlotName);
        // Consider retrying or notifying the player
    }
}

void UMySaveSubsystem::AsyncLoadGame()
{
    FAsyncLoadGameFromSlotDelegate OnLoaded;
    OnLoaded.BindUObject(this, &UMySaveSubsystem::OnAsyncLoadComplete);

    UGameplayStatics::AsyncLoadGameFromSlot(
        TEXT("Slot_01"),
        0,
        OnLoaded
    );
}

void UMySaveSubsystem::OnAsyncLoadComplete(
    const FString& SlotName, const int32 UserIndex,
    USaveGame* LoadedData)
{
    UMyProjectSaveGame* SaveData = Cast<UMyProjectSaveGame>(LoadedData);
    if (!SaveData)
    {
        UE_LOG(LogSave, Error, TEXT("Async load returned null"));
        return;
    }

    ApplyLoadedData(SaveData);
}
```

**When to use which:**

| Scenario | Recommended API |
|----------|----------------|
| Small save, player paused | `SaveGameToSlot` (sync) |
| Auto-save during gameplay | `AsyncSaveGameToSlot` |
| Loading from main menu | `LoadGameFromSlot` (sync, behind loading screen) |
| Loading during gameplay | `AsyncLoadGameFromSlot` |

## GameInstance Subsystem Pattern

The recommended place to manage save/load logic is a **GameInstance Subsystem**. Subsystems are engine-managed singletons that persist across level transitions and are automatically created/destroyed.

```cpp
#pragma once

#include "Subsystems/GameInstanceSubsystem.h"
#include "MySaveSubsystem.generated.h"

// GameInstance Subsystems persist for the lifetime of the game session.
// They survive level transitions, making them ideal for save management.
// Unlike a custom singleton, they participate in UE's lifecycle properly.
UCLASS()
class MYGAME_API UMySaveSubsystem : public UGameInstanceSubsystem
{
    GENERATED_BODY()

public:
    virtual void Initialize(FSubsystemCollectionBase& Collection) override;
    virtual void Deinitialize() override;

    UFUNCTION(BlueprintCallable, Category = "Save")
    void SaveToSlot(const FString& SlotName);

    UFUNCTION(BlueprintCallable, Category = "Save")
    void LoadFromSlot(const FString& SlotName);

    UFUNCTION(BlueprintCallable, Category = "Save")
    TArray<FString> GetAllSaveSlots() const;

    // Cache the current save data in memory for fast reads.
    // Systems query this instead of loading from disk every time.
    UPROPERTY()
    UMyProjectSaveGame* CurrentSaveData;
};
```

**Why a subsystem?** Manual singletons or static references are error-prone in UE (GC can collect them, level transitions reset them). Subsystems are engine-owned and lifecycle-safe.

## Slot Management

### Multiple Save Slots

```cpp
TArray<FString> UMySaveSubsystem::GetAllSaveSlots() const
{
    TArray<FString> Slots;

    // Check a fixed number of slots.
    // For dynamic slot counts, store a manifest file listing
    // active slots, or scan the save directory.
    for (int32 i = 0; i < MaxSlots; ++i)
    {
        FString SlotName = FString::Printf(TEXT("Save_%02d"), i);
        if (UGameplayStatics::DoesSaveGameExist(SlotName, 0))
        {
            Slots.Add(SlotName);
        }
    }

    return Slots;
}
```

### Backup Slot Pattern

Always write a backup before overwriting a save. This protects against corruption from crashes during write:

```cpp
void UMySaveSubsystem::SafeSaveToSlot(const FString& SlotName)
{
    FString BackupSlot = SlotName + TEXT("_backup");

    // Step 1: Copy current save to backup
    if (UGameplayStatics::DoesSaveGameExist(SlotName, 0))
    {
        USaveGame* Existing = UGameplayStatics::LoadGameFromSlot(
            SlotName, 0);
        if (Existing)
        {
            UGameplayStatics::SaveGameToSlot(Existing, BackupSlot, 0);
        }
    }

    // Step 2: Write the new save to the primary slot
    PopulateSaveData(CurrentSaveData);
    UGameplayStatics::SaveGameToSlot(CurrentSaveData, SlotName, 0);
}

USaveGame* UMySaveSubsystem::SafeLoadFromSlot(const FString& SlotName)
{
    // Try primary slot first
    if (UGameplayStatics::DoesSaveGameExist(SlotName, 0))
    {
        USaveGame* Data = UGameplayStatics::LoadGameFromSlot(SlotName, 0);
        if (Data) return Data;
    }

    // Fall back to backup if primary is missing or corrupt
    FString BackupSlot = SlotName + TEXT("_backup");
    if (UGameplayStatics::DoesSaveGameExist(BackupSlot, 0))
    {
        UE_LOG(LogSave, Warning,
            TEXT("Primary save corrupt, loading backup"));
        return UGameplayStatics::LoadGameFromSlot(BackupSlot, 0);
    }

    return nullptr; // No save found
}
```

## Save Versioning and Migration

As your game evolves, save format changes. Version numbers let you migrate old saves forward.

```cpp
void UMySaveSubsystem::MigrateSaveData(UMyProjectSaveGame* SaveData)
{
    // Version 1 → 2: PlayerLevel was added
    if (SaveData->SaveVersion < 2)
    {
        SaveData->PlayerLevel = 1; // Default for old saves
        UE_LOG(LogSave, Log, TEXT("Migrated save from v1 → v2"));
    }

    // Version 2 → 3: CompletedQuests changed from FName to FString
    if (SaveData->SaveVersion < 3)
    {
        // Perform any data conversion here
        UE_LOG(LogSave, Log, TEXT("Migrated save from v2 → v3"));
    }

    // Update to current version
    SaveData->SaveVersion = CurrentSaveVersion;
}
```

**Best practices for versioning:**
- Never remove UPROPERTY fields — mark them deprecated and ignore them in code
- Always bump `SaveVersion` when changing the save structure
- Run migration immediately after loading, before any gameplay code reads the data
- Log migration steps for debugging

## Chunked Saves for Open-World Games

For large open worlds, a single monolithic save file becomes a bottleneck. Split state across multiple slot files:

```
Save_PlayerState      ← Character stats, inventory, abilities
Save_WorldState       ← Quest progress, NPC states, global flags
Save_RegionA          ← Actors and objects in Region A
Save_RegionB          ← Actors and objects in Region B
Save_Settings         ← Player preferences (separate from game state)
```

Load only what's needed: when the player enters Region B, async-load `Save_RegionB` while `Save_RegionA` can be unloaded from memory.

## Multiplayer Considerations

| Data Type | Who Saves | Pattern |
|-----------|-----------|---------|
| Shared world state (quests, economy) | **Server only** | `AGameMode` triggers save; clients send changes via RPCs |
| Per-player state (inventory, stats) | **Server per-player** | Server writes one slot per player; clients never write shared state |
| Client preferences (keybinds, UI) | **Client local** | `ULocalPlayerSaveGame` — never sent to server |

> **Critical rule:** Clients must never directly write shared save data. All shared state changes flow through the server via RPCs to prevent desync and cheating.

## Common Pitfalls

| Pitfall | Solution |
|---------|----------|
| Frame hitch on auto-save | Use `AsyncSaveGameToSlot` |
| Save corruption on crash | Use the backup slot pattern |
| Old saves crash on load | Add `SaveVersion` and migration logic |
| Giant save files | Split into chunked slots by subsystem/region |
| GC collects save data | Keep a `UPROPERTY()` reference in a subsystem |
| Saving object references | Serialize identifiers (FName/FGuid), not UObject pointers |
| Platform cert failures | Test save/load on target platform early; respect platform storage APIs |

## Further Reading

- [Epic: Saving and Loading Your Game](https://dev.epicgames.com/documentation/en-us/unreal-engine/saving-and-loading-your-game-in-unreal-engine)
- [Epic: Async Save to Slot API](https://dev.epicgames.com/documentation/en-us/unreal-engine/API/Runtime/Engine/UAsyncActionHandleSaveGame/AsyncSaveGameToSlot)
- [GD Tactics: Save and Load with C++](https://gdtactics.com/save-and-load-game-data-in-unreal-engine-5-using-cpp)
- [GD Tactics: Async Save/Load](https://gdtactics.com/how-to-save-and-load-asynchronously-in-unreal-engine-5-using-cpp)
