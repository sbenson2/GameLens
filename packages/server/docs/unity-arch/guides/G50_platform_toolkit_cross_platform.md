# G50 — Platform Toolkit: Cross-Platform Achievements, Saves & Accounts

> **Category:** guide · **Engine:** Unity 6.3+ (com.unity.platformtoolkit 1.0+) · **Related:** [G6 Save/Load System](G6_save_load_system.md) · [G21 Build Profiles & Cross-Platform](G21_build_profiles_cross_platform.md) · [G36 LiveOps](G36_liveops_remote_config_cloud_save.md) · [Unity Rules](../unity-arch-rules.md)

Platform Toolkit is Unity's official cross-platform abstraction layer, introduced in Unity 6.3 (December 2025). It provides a single async C# API for **achievements**, **save data**, and **account management** that works across Xbox, PlayStation, Nintendo Switch 2, Steam, and more — eliminating the need to write separate platform-specific integration code for each storefront or console SDK.

---

## Why Platform Toolkit?

Before Platform Toolkit, shipping a multiplatform game meant writing separate integration code for each platform:

| Feature | Without Platform Toolkit | With Platform Toolkit |
|---------|--------------------------|----------------------|
| Achievements | Steamworks API, PlayStation NP Trophy, Xbox XGameSave, Nintendo Switch NOS | `IAchievementSystem.Unlock()` |
| Save Data | SteamRemoteStorage, PS SaveData, Xbox Connected Storage, Switch SaveData | `ISavingSystem.OpenSaveWritable()` |
| Accounts | Steam User, PSN Account, Xbox Live, Nintendo Account | `IAccount` via `PlatformToolkit` |
| Certification | Platform-specific code paths, #ifdef blocks | One code path, platform packages handle specifics |

### Supported Platforms (Unity 6.3+)

| Platform | Package | Status |
|----------|---------|--------|
| Steam | `com.unity.platformtoolkit.steam` | 1.0+ (released with 6.3) |
| PlayStation | `com.unity.platformtoolkit.psn` | Available to registered PS developers |
| Xbox | `com.unity.platformtoolkit.gdk` | Available to registered Xbox developers |
| Nintendo Switch 2 | `com.unity.platformtoolkit.nswitch2` | Available to registered Nintendo developers |

> **Note:** Console platform packages require developer registration with each platform holder. Steam is the only publicly available package.

---

## Architecture Overview

```
Your Game Code (Platform-Agnostic)
┌──────────────────────────────────────────────────┐
│                                                    │
│  PlatformToolkit.Capabilities  (feature checks)   │
│         │                                          │
│  ┌──────▼─────┐  ┌─────────────┐  ┌───────────┐  │
│  │ IAccount    │  │ IAchievement│  │ ISaving   │  │
│  │ System      │  │ System      │  │ System    │  │
│  └──────┬─────┘  └──────┬──────┘  └─────┬─────┘  │
│         │               │               │         │
└─────────┼───────────────┼───────────────┼─────────┘
          │               │               │
          ▼               ▼               ▼
┌──────────────────────────────────────────────────┐
│  Platform Implementation Package                   │
│  (com.unity.platformtoolkit.steam, .psn, .gdk)    │
│                                                    │
│  Translates unified API → native platform SDK      │
│  (Steamworks, PSN, GDK, NOS, etc.)               │
└──────────────────────────────────────────────────┘
          │
          ▼
┌──────────────────────────────────────────────────┐
│  Native Platform SDK                               │
│  (Steam Client, PS System Software, Xbox OS, etc.) │
└──────────────────────────────────────────────────┘
```

### Key Design Principles

- **Async-first** — All operations return `Awaitable` or `Task` for non-blocking workflows
- **Capability checks** — Query `PlatformToolkit.Capabilities` before using any feature; not all platforms support all features
- **Interface-based** — Game code depends on `IAccount`, `IAchievementSystem`, `ISavingSystem` — never on platform-specific types
- **Account-scoped** — Achievements and saves are accessed _through_ an account, supporting local multiplayer with multiple signed-in users

---

## Installation

Install via Package Manager or `manifest.json`:

```json
{
  "dependencies": {
    "com.unity.platformtoolkit": "1.0.1",
    "com.unity.platformtoolkit.steam": "1.0.1"
  }
}
```

> **Important:** Install the core package _and_ at least one platform package. The core package provides interfaces; platform packages provide implementations.

---

## Accounts

The account system provides access to platform-level user accounts. Many platform features (achievements, saves) are scoped to a specific account.

### Capability Check Pattern

```csharp
using Unity.PlatformToolkit;

// WHY: Not all platforms have account systems. Desktop/mobile may not require
// sign-in, while consoles always do. Check capabilities before accessing.
if (PlatformToolkit.Capabilities.AccountAchievements)
{
    // Achievements are available on this platform
}

if (PlatformToolkit.Capabilities.AccountSaving)
{
    // Save data system is available on this platform
}
```

### Getting an Account

```csharp
using Unity.PlatformToolkit;

// WHY: On consoles, the OS provides the signed-in user account.
// On Steam, the account is the logged-in Steam user.
// The Platform Toolkit abstracts this — you get an IAccount regardless of platform.

// For single-player games, get the primary account:
IAccount account = PlatformToolkit.PrimaryAccount;

// WHY: PrimaryAccount may be null if no user is signed in (rare on Steam,
// possible on consoles if the user signs out mid-game). Always null-check.
if (account == null)
{
    Debug.LogWarning("No platform account available.");
    return;
}
```

### Multi-User Support (Local Multiplayer)

```csharp
// WHY: On consoles, multiple users can be signed in simultaneously
// for local multiplayer. Each user has their own account, achievements,
// and save data. Platform Toolkit exposes all signed-in accounts.

// Access all signed-in accounts:
IReadOnlyList<IAccount> accounts = PlatformToolkit.Accounts;

foreach (IAccount account in accounts)
{
    // WHY: Each account has a unique ID and display name.
    // Use the ID for internal tracking; display name for UI.
    Debug.Log($"Player: {account.DisplayName}");
}
```

---

## Achievements

### Configuration (Achievement Editor)

Define achievements in Unity's built-in editor:

```
// Window → Platform Toolkit → Achievement Editor
//
// WHY: The Achievement Editor lets you define achievements once in Unity.
// Each achievement has:
//   - Unique ID (string) — must match the ID configured on each platform's dashboard
//   - Type: "Single" (unlocked once) or "Progressive" (tracks numeric progress)
//   - Display name, description, icon (for editor reference; platforms use their own)
//
// You also import achievement data from platform dashboards to keep IDs in sync.
```

### Unlocking Achievements

```csharp
using Unity.PlatformToolkit;

public class AchievementManager : MonoBehaviour
{
    // WHY: Cache the achievement system from the account to avoid repeated async calls.
    private IAchievementSystem _achievementSystem;

    public async void Initialize()
    {
        IAccount account = PlatformToolkit.PrimaryAccount;
        if (account == null) return;

        // WHY: GetAchievementSystem() is async because some platforms need to
        // fetch achievement state from the network on first access.
        if (PlatformToolkit.Capabilities.AccountAchievements)
        {
            try
            {
                _achievementSystem = await account.GetAchievementSystem();
            }
            catch (InvalidAccountException e)
            {
                // WHY: Thrown if the account signed out between the null check and
                // this call. Rare but possible on consoles. Handle gracefully.
                Debug.LogWarning($"Account unavailable: {e.Message}");
            }
        }
    }

    // --- Single unlock (one-time achievements) ---
    public void UnlockFirstEgg()
    {
        // WHY: Unlock() is fire-and-forget. The platform SDK handles persistence
        // and the notification popup (toast/banner). If already unlocked, this is a no-op.
        _achievementSystem?.Unlock("FIRST_EGG");
    }

    // --- Progressive unlock (tracked achievements) ---
    public void UpdateEggCount(int totalEggs)
    {
        // WHY: UpdateProgress() sets the current progress value toward a goal.
        // The platform determines when to trigger the unlock (e.g., at 30/30).
        // Pass the TOTAL accumulated value, not an increment.
        _achievementSystem?.UpdateProgress("THIRTY_EGGS", totalEggs);
    }
}
```

### Retry Pattern for Network Failures

```csharp
// WHY: Achievement unlocks can fail silently if the network is down.
// Platform Toolkit recommends implementing retry logic at natural checkpoints
// (returning to main menu, completing a level) rather than polling.

public void OnReturnToMainMenu()
{
    // WHY: Re-unlock achievements the player has already earned locally.
    // If the platform already registered the unlock, this is a no-op.
    // If the previous attempt failed, this retries the submission.
    if (_localState.HasCompletedTutorial)
    {
        _achievementSystem?.Unlock("TUTORIAL_COMPLETE");
    }

    if (_localState.TotalEggs >= 30)
    {
        _achievementSystem?.UpdateProgress("THIRTY_EGGS", _localState.TotalEggs);
    }
}
```

---

## Save Data

Platform Toolkit provides two save data APIs:

| API | Use Case | Data Format |
|-----|----------|-------------|
| **ISavingSystem** (file-based) | Complex saves with multiple files per slot | Raw `byte[]` per file |
| **DataStore** (key-value) | Simple saves with named typed values | int, float, string, bool |

### DataStore API (Simple Key-Value Saves)

```csharp
using Unity.PlatformToolkit;

public class SimpleSaveManager : MonoBehaviour
{
    public async void SaveGame(IAccount account)
    {
        // WHY: DataStore provides a key-value interface that handles serialization
        // internally. No need to manage byte arrays or JSON yourself.
        // Ideal for games with simple save state (scores, settings, progress flags).
        ISavingSystem savingSystem = await account.GetSavingSystem();

        DataStore dataStore = DataStore.Create();

        // WHY: SetInt/SetString/SetFloat store typed values by key.
        // Keys are strings; values are the four supported primitive types.
        dataStore.SetInt("player_level", 15);
        dataStore.SetString("player_name", "DragonSlayer");
        dataStore.SetFloat("play_time_hours", 42.5f);
        dataStore.SetInt("gold", 12500);

        // WHY: Save() writes the DataStore to the platform's save system.
        // On Steam, this writes to Steam Cloud. On consoles, to system save storage.
        // The slot name ("save-slot-1") acts as a unique identifier.
        await dataStore.Save(savingSystem, "save-slot-1");
    }

    public async void LoadGame(IAccount account)
    {
        ISavingSystem savingSystem = await account.GetSavingSystem();

        // WHY: DataStore.Load() reads from the platform's save system.
        // Returns the stored DataStore, or throws if the save doesn't exist.
        DataStore dataStore = await DataStore.Load(savingSystem, "save-slot-1");

        int level = dataStore.GetInt("player_level");
        string name = dataStore.GetString("player_name");
        float playTime = dataStore.GetFloat("play_time_hours");

        Debug.Log($"Loaded: {name}, Level {level}, {playTime:F1}h played");
    }
}
```

### File-Based API (Complex Saves)

```csharp
using Unity.PlatformToolkit;

public class ComplexSaveManager : MonoBehaviour
{
    // WHY: The file-based API gives you full control over save structure.
    // Use it when your save data has multiple components (world state, inventory,
    // quest log) that you serialize separately.

    public async void SaveGame(IAccount account)
    {
        ISavingSystem savingSystem = await account.GetSavingSystem();

        byte[] characterData = SerializeCharacter();
        byte[] worldData = SerializeWorld();
        byte[] inventoryData = SerializeInventory();

        try
        {
            // WHY: OpenSaveWritable() creates an atomic write transaction.
            // All WriteFile() calls are staged; nothing is persisted until Commit().
            // If the game crashes between WriteFile() calls, no partial save is written.
            await using ISaveWritable saveWritable =
                await savingSystem.OpenSaveWritable("save-slot-1");

            await saveWritable.WriteFile("character", characterData);
            await saveWritable.WriteFile("world", worldData);
            await saveWritable.WriteFile("inventory", inventoryData);

            // WHY: Commit() atomically writes all staged files to platform storage.
            // If you forget to call Commit(), the save is discarded on dispose.
            await saveWritable.Commit();

            Debug.Log("Game saved successfully.");
        }
        catch (NotEnoughSpaceException)
        {
            // WHY: Console save storage has platform-specific size limits.
            // Prompt the player to free space via system settings.
            ShowStorageFullDialog();
        }
        catch (IOException e)
        {
            Debug.LogError($"Save failed: {e.Message}");
            ShowSaveErrorDialog();
        }
    }

    public async void LoadGame(IAccount account)
    {
        ISavingSystem savingSystem = await account.GetSavingSystem();

        // WHY: Check existence before opening — avoids exceptions on first launch.
        if (!await savingSystem.SaveExists("save-slot-1"))
        {
            Debug.Log("No save file found. Starting new game.");
            return;
        }

        try
        {
            // WHY: OpenSaveReadable() opens a read-only view of the save.
            // The 'await using' pattern ensures proper cleanup of platform resources.
            await using ISaveReadable saveReadable =
                await savingSystem.OpenSaveReadable("save-slot-1");

            byte[] characterData = await saveReadable.ReadFile("character");
            byte[] worldData = await saveReadable.ReadFile("world");
            byte[] inventoryData = await saveReadable.ReadFile("inventory");

            DeserializeCharacter(characterData);
            DeserializeWorld(worldData);
            DeserializeInventory(inventoryData);

            Debug.Log("Game loaded successfully.");
        }
        catch (CorruptedSaveException)
        {
            // WHY: Platform Toolkit detects corrupted saves (checksum mismatch).
            // Offer to delete the save and start fresh — don't silently lose progress.
            ShowCorruptedSaveDialog();
        }
    }
}
```

### Deleting Saves

```csharp
// WHY: Always confirm with the player before deleting. Platform certification
// requirements typically mandate a confirmation dialog for destructive actions.
public async void DeleteSave(IAccount account, string slotName)
{
    ISavingSystem savingSystem = await account.GetSavingSystem();

    if (await savingSystem.SaveExists(slotName))
    {
        await savingSystem.DeleteSave(slotName);
        Debug.Log($"Save '{slotName}' deleted.");
    }
}
```

---

## Platform-Specific Considerations

### Steam

```csharp
// WHY: On Steam, save data is stored via Steam Cloud.
// Ensure Steam Cloud is enabled in the Steamworks App Admin panel.
// Platform Toolkit automatically uses SteamRemoteStorage under the hood.

// Steam-specific: achievements are tied to the Steam User and persist
// even if the game is uninstalled. No special handling needed.
```

### Consoles (PlayStation, Xbox, Nintendo Switch)

Key differences from PC:

| Concern | Console Behavior | Code Impact |
|---------|-----------------|-------------|
| **Account sign-out** | User can sign out mid-game via system UI | Catch `InvalidAccountException` on every account operation |
| **Storage limits** | Platform-specific save size quotas | Handle `NotEnoughSpaceException` |
| **Multiple users** | Local multiplayer = multiple accounts | Iterate `PlatformToolkit.Accounts`, not just `PrimaryAccount` |
| **Certification** | Platform holders test achievement/save behavior | Use retry patterns; never silently swallow save errors |
| **Suspend/resume** | Console may suspend your game | Re-validate account state on resume |

---

## Platform Toolkit vs. UGS Cloud Save

| Feature | Platform Toolkit Save | UGS Cloud Save (G36) |
|---------|----------------------|----------------------|
| **Scope** | Platform-native (Steam Cloud, console system saves) | Unity's own cloud backend |
| **Offline** | Works offline (syncs when online) | Requires internet |
| **Console cert** | Meets platform certification requirements | Supplementary — not a substitute for platform saves |
| **Cross-platform sync** | No (each platform has its own saves) | Yes (unified across all platforms) |
| **Use case** | Primary save system for console/PC | Cloud backup, cross-device sync, server-side data |

> **Best practice:** Use Platform Toolkit as your primary save system (meets cert requirements), and optionally sync key data to UGS Cloud Save for cross-platform progression.

---

## Complete Example: Game Bootstrap

```csharp
using Unity.PlatformToolkit;
using UnityEngine;

public class GameBootstrap : MonoBehaviour
{
    private IAccount _account;
    private IAchievementSystem _achievements;
    private ISavingSystem _saving;

    async void Start()
    {
        // WHY: Platform Toolkit doesn't require explicit initialization like UGS.
        // The platform package registers itself automatically on supported platforms.

        _account = PlatformToolkit.PrimaryAccount;

        if (_account == null)
        {
            Debug.LogError("No platform account. Cannot access saves or achievements.");
            // WHY: On consoles this typically means the user signed out.
            // Show a "Please sign in" dialog and wait for account restoration.
            return;
        }

        // WHY: Cache subsystems once at startup. Each Get*System() call
        // may involve async platform SDK initialization.
        if (PlatformToolkit.Capabilities.AccountAchievements)
        {
            _achievements = await _account.GetAchievementSystem();
        }

        if (PlatformToolkit.Capabilities.AccountSaving)
        {
            _saving = await _account.GetSavingSystem();
        }

        // Load the player's save if one exists
        if (_saving != null && await _saving.SaveExists("autosave"))
        {
            DataStore data = await DataStore.Load(_saving, "autosave");
            ApplySaveData(data);
        }
    }

    public void OnTutorialComplete()
    {
        _achievements?.Unlock("TUTORIAL_COMPLETE");
    }

    public async void OnLevelComplete(int level)
    {
        _achievements?.UpdateProgress("LEVELS_COMPLETED", level);

        if (_saving != null)
        {
            DataStore data = DataStore.Create();
            data.SetInt("current_level", level);
            data.SetFloat("play_time", Time.realtimeSinceStartup);
            await data.Save(_saving, "autosave");
        }
    }

    void ApplySaveData(DataStore data)
    {
        int level = data.GetInt("current_level");
        Debug.Log($"Resuming from level {level}");
    }
}
```

---

## Production Checklist

| Area | Check |
|------|-------|
| **Capabilities** | Always check `PlatformToolkit.Capabilities` before accessing any subsystem |
| **Account null** | Handle `PrimaryAccount == null` and `InvalidAccountException` throughout |
| **Achievements** | Implement retry logic at natural checkpoints (menu, level end) |
| **Achievements** | Match achievement IDs exactly between Unity editor and each platform dashboard |
| **Saves** | Always call `Commit()` on `ISaveWritable` — forgetting it loses the save silently |
| **Saves** | Handle `NotEnoughSpaceException` and `CorruptedSaveException` with player-facing UI |
| **Saves** | Test save/load cycle on every target platform before submission |
| **Console cert** | Test account sign-out/sign-in during active gameplay on each console |
| **Console cert** | Test suspend/resume behavior — re-validate account on wake |
| **Multi-user** | If supporting local multiplayer, use `PlatformToolkit.Accounts` (not just `PrimaryAccount`) |

---

## Breadcrumbs

- **Local Save/Load patterns** → See [G6 Save/Load System](G6_save_load_system.md) for serialization strategies to pair with Platform Toolkit's byte[] API
- **Cloud Save (cross-platform sync)** → See [G36 LiveOps](G36_liveops_remote_config_cloud_save.md) for UGS Cloud Save as a complement
- **Build Profiles** → See [G21 Build Profiles & Cross-Platform](G21_build_profiles_cross_platform.md) for managing platform-specific build settings
- **Mobile** → See [G24 Mobile Development](G24_mobile_development.md) — Platform Toolkit doesn't yet cover mobile; use UGS for mobile save/achievements
