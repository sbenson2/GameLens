# G36 — LiveOps: Remote Config, Cloud Save & Cloud Code

> **Category:** guide · **Engine:** Unity 6 (6000.x) · **Related:** [G29 Multiplayer Services](G29_multiplayer_services.md) · [G6 Save/Load System](G6_save_load_system.md) · [G14 ScriptableObject Architecture](G14_scriptable_object_architecture.md) · [Unity Rules](../unity-arch-rules.md)

Unity Gaming Services (UGS) includes a suite of **LiveOps** services that let you tune, persist, and extend your game without shipping client updates. This guide covers **Remote Config** (feature flags & live tuning), **Cloud Save** (server-side player data), and **Cloud Code** (server-authoritative logic). Together they form the backbone of a live-service game.

---

## Architecture Overview

```
Unity Client                         Unity Gaming Services (UGS Cloud)
┌──────────────────┐                ┌──────────────────────────────────┐
│  Game Logic       │                │                                  │
│  ┌──────────────┐ │── Fetch ──────│  Remote Config                   │
│  │ RemoteConfig  │ │  settings     │  (Key-Value pairs, Game          │
│  │ Service       │ │               │   Overrides, Audience rules)     │
│  └──────────────┘ │                │                                  │
│                    │                │                                  │
│  ┌──────────────┐ │── Save/Load ──│  Cloud Save                      │
│  │ CloudSave     │ │  player data  │  (Player Data, Custom Data,      │
│  │ Service       │ │               │   Files, Private Player Data)    │
│  └──────────────┘ │                │                                  │
│                    │                │                                  │
│  ┌──────────────┐ │── Run ────────│  Cloud Code                      │
│  │ CloudCode     │ │  server logic │  (Scripts & Modules, can access  │
│  │ Service       │ │               │   Cloud Save, Remote Config,     │
│  └──────────────┘ │                │   Economy, Leaderboards)         │
│                    │                │                                  │
│  ┌──────────────┐ │                │                                  │
│  │ Authentication│ │── Sign In ────│  Authentication Service          │
│  │ Service       │ │               │  (Anonymous, Platform, Custom)   │
│  └──────────────┘ │                │                                  │
└──────────────────┘                └──────────────────────────────────┘
```

### When to Use LiveOps Services

| Need | Service | Example |
|------|---------|---------|
| Tune balance without update | Remote Config | Change enemy HP, XP curves, drop rates |
| Feature flags / kill switch | Remote Config | Enable/disable holiday event, A/B test UI |
| Persist player progress | Cloud Save | Inventory, settings, quest state |
| Cheat-proof economy | Cloud Code + Cloud Save | Award currency server-side only |
| Seasonal events | Remote Config + Cloud Code | Time-limited content with server validation |

---

## Prerequisites

All UGS LiveOps services share the same initialization pattern:

### 1. Install Packages

```
# Unity Package Manager — install via name or the Services window
com.unity.services.core            # Required — UGS bootstrap
com.unity.services.authentication  # Required — player identity
com.unity.services.cloudcode       # Optional — server-side scripts
com.unity.services.cloudsave       # Optional — player persistence
com.unity.remote-config-runtime    # Optional — live tuning
```

### 2. Dashboard Setup

1. Go to [cloud.unity.com](https://cloud.unity.com) and link your project.
2. Enable each service under **LiveOps** in the dashboard.
3. For Remote Config: create keys and Game Overrides in the web UI.
4. For Cloud Code: upload C# modules or JS scripts via the dashboard or CLI.

### 3. Shared Initialization (Unity 6+)

```csharp
using Unity.Services.Authentication;
using Unity.Services.Core;
using UnityEngine;

/// <summary>
/// Initialize UGS once at startup. All LiveOps services depend on this.
/// Call this before accessing any UGS service instance.
/// </summary>
public class UGSBootstrap : MonoBehaviour
{
    public static bool IsReady { get; private set; }

    private async void Awake()
    {
        try
        {
            // InitializeAsync sets up all installed UGS SDKs in one call.
            await UnityServices.InitializeAsync();

            // Anonymous sign-in creates a persistent player ID automatically.
            // For production, link to platform accounts (Steam, Apple, Google, etc.)
            if (!AuthenticationService.Instance.IsSignedIn)
            {
                await AuthenticationService.Instance.SignInAnonymouslyAsync();
            }

            Debug.Log($"UGS ready — Player ID: {AuthenticationService.Instance.PlayerId}");
            IsReady = true;
        }
        catch (AuthenticationException ex)
        {
            // AuthenticationException: invalid credentials, network issues, etc.
            Debug.LogError($"UGS auth failed: {ex.Message}");
        }
        catch (RequestFailedException ex)
        {
            // RequestFailedException: service outage, rate limiting, etc.
            Debug.LogError($"UGS init failed: {ex.Message}");
        }
    }
}
```

> **Tip:** Place `UGSBootstrap` on a persistent GameObject (DontDestroyOnLoad) and use `IsReady` or an event to gate downstream systems.

---

## Remote Config

Remote Config stores **key-value settings** in the cloud. You define keys in the dashboard, and the client fetches the latest values at runtime. Game Overrides let you change values for specific audiences without touching the defaults.

### Core Concepts

| Concept | Description |
|---------|-------------|
| **Setting** | A key-value pair (string, int, float, bool, JSON) |
| **Game Override** | A rule that changes settings for a targeted audience |
| **Audience** | A filter based on attributes you send at fetch time (e.g., `platform`, `isBeta`) |
| **Config Type** | Namespace for grouping settings (default: `settings`) |

### Fetching Config Values

```csharp
using Unity.Services.RemoteConfig;
using UnityEngine;

/// <summary>
/// Fetch and apply Remote Config settings. Call after UGS initialization.
/// </summary>
public class GameConfig : MonoBehaviour
{
    // Attribute structs sent with each fetch — UGS evaluates
    // Game Overrides against these to decide which values to return.
    // Empty structs are valid if you don't need audience targeting.
    private struct UserAttributes { }

    // App-level attributes (e.g., version, platform) for targeting.
    private struct AppAttributes
    {
        public string appVersion;
        public string platform;
    }

    // Cached values — updated on each successful fetch
    public float EnemyHealthMultiplier { get; private set; } = 1.0f;
    public bool HolidayEventEnabled { get; private set; } = false;
    public int DailyRewardGems { get; private set; } = 10;

    private async void Start()
    {
        // Subscribe to the fetch-completed event to process results.
        RemoteConfigService.Instance.FetchCompleted += OnFetchCompleted;

        // FetchConfigsAsync sends attributes and returns when the server responds.
        // The SDK caches results locally for offline fallback.
        await RemoteConfigService.Instance.FetchConfigsAsync(
            new UserAttributes(),
            new AppAttributes
            {
                appVersion = Application.version,
                platform = Application.platform.ToString()
            }
        );
    }

    private void OnFetchCompleted(ConfigResponse response)
    {
        // response.requestOrigin tells you where values came from:
        // Default (cache/fallback), Remote (fresh from server)
        Debug.Log($"Remote Config fetched from: {response.requestOrigin}");

        // GetFloat / GetBool / GetInt / GetString / GetJson —
        // second parameter is the fallback if the key doesn't exist.
        EnemyHealthMultiplier = RemoteConfigService.Instance.appConfig
            .GetFloat("enemy_health_multiplier", 1.0f);

        HolidayEventEnabled = RemoteConfigService.Instance.appConfig
            .GetBool("holiday_event_enabled", false);

        DailyRewardGems = RemoteConfigService.Instance.appConfig
            .GetInt("daily_reward_gems", 10);
    }

    private void OnDestroy()
    {
        RemoteConfigService.Instance.FetchCompleted -= OnFetchCompleted;
    }
}
```

### Best Practices

- **Always provide fallback values** — the second parameter in `GetFloat()` etc. is your safety net for offline play or missing keys.
- **Fetch early, apply safely** — fetch in a loading screen so gameplay doesn't hitch. Never fetch mid-frame.
- **Use Game Overrides for A/B tests** — create two audiences (e.g., `group == "A"` vs `group == "B"`) and override a single key. Measure results with Analytics.
- **Don't store secrets** — Remote Config values are readable by the client. Use Cloud Code for server-authoritative logic.
- **Version your keys** — prefix keys with a version (e.g., `v2_drop_rate`) so old clients ignore new keys gracefully.

---

## Cloud Save

Cloud Save persists **player-specific data** to the cloud. It supports structured key-value Player Data, file uploads, and Private Player Data (accessible only from Cloud Code for anti-cheat).

### Data Types

| Type | Access | Use Case |
|------|--------|----------|
| **Player Data** | Client read/write | Settings, preferences, non-sensitive progress |
| **Private Player Data** | Cloud Code only | Currency, premium items, anti-cheat state |
| **Files** | Client read/write | Screenshots, replays, large blobs (up to 5 MB) |
| **Custom Data** | Cloud Code only | Cross-player data, leaderboard snapshots |

### Saving and Loading Player Data

```csharp
using System;
using System.Collections.Generic;
using Unity.Services.CloudSave;
using Unity.Services.CloudSave.Models;
using UnityEngine;

/// <summary>
/// Cloud Save wrapper — save/load player data as key-value pairs.
/// Values are serialized as JSON, so complex objects work too.
/// </summary>
public class CloudSaveManager : MonoBehaviour
{
    // Save arbitrary data — keys are strings, values are serialized to JSON.
    public async void SavePlayerData(string key, object value)
    {
        try
        {
            var data = new Dictionary<string, object> { { key, value } };

            // SaveAsync merges with existing data — it won't delete other keys.
            await CloudSaveService.Instance.Data.Player.SaveAsync(data);
            Debug.Log($"Cloud Save: saved key '{key}'");
        }
        catch (CloudSaveValidationException ex)
        {
            // Validation errors: key too long, value too large, etc.
            Debug.LogError($"Cloud Save validation error: {ex.Message}");
        }
        catch (CloudSaveRateLimitedException ex)
        {
            // Rate limited — back off and retry.
            Debug.LogWarning($"Cloud Save rate limited. Retry after {ex.RetryAfter}s");
        }
    }

    // Load specific keys — returns only the keys you ask for.
    public async void LoadPlayerData(string key)
    {
        try
        {
            // LoadAsync with a key set returns only those keys.
            // Omit the HashSet to load ALL player data (use sparingly).
            var results = await CloudSaveService.Instance.Data.Player.LoadAsync(
                new HashSet<string> { key }
            );

            if (results.TryGetValue(key, out Item item))
            {
                // item.Value is a SaveItem — use GetAs<T>() to deserialize.
                Debug.Log($"Cloud Save: loaded '{key}' = {item.Value.GetAs<string>()}");
            }
        }
        catch (CloudSaveValidationException ex)
        {
            Debug.LogError($"Cloud Save load error: {ex.Message}");
        }
    }

    // Delete a specific key from the player's cloud data.
    public async void DeletePlayerData(string key)
    {
        try
        {
            await CloudSaveService.Instance.Data.Player.DeleteAsync(key);
            Debug.Log($"Cloud Save: deleted key '{key}'");
        }
        catch (CloudSaveValidationException ex)
        {
            Debug.LogError($"Cloud Save delete error: {ex.Message}");
        }
    }
}
```

### Saving Complex Objects

```csharp
// Cloud Save serializes objects to JSON, so structs and classes work directly.
[Serializable]
public struct PlayerProgress
{
    public int level;
    public float playTime;
    public string[] unlockedAchievements;
}

// Usage:
var progress = new PlayerProgress
{
    level = 12,
    playTime = 3600f,
    unlockedAchievements = new[] { "first_blood", "speed_run" }
};

// This serializes to JSON and stores under the "progress" key.
await CloudSaveService.Instance.Data.Player.SaveAsync(
    new Dictionary<string, object> { { "progress", progress } }
);
```

### Best Practices

- **Batch saves** — save multiple keys in one `SaveAsync` call to reduce API calls and avoid rate limits.
- **Use Private Player Data for currency** — if a value must never be tampered with (gems, coins), store it as Private Player Data and modify it only through Cloud Code.
- **Handle offline gracefully** — Cloud Save has no built-in offline cache. Combine with local `PlayerPrefs` or a JSON file as a write-ahead log, then sync when connectivity returns.
- **Mind the limits** — Player Data: 200 keys max, each value up to 200 KB. Files: up to 5 MB per file, 20 files per player. Check the [quota docs](https://docs.unity.com/en-us/cloud-save) for current limits.

---

## Cloud Code

Cloud Code runs **server-authoritative C# modules or JavaScript scripts** on UGS infrastructure. It can access other UGS services (Cloud Save, Economy, Leaderboards) without exposing their admin APIs to the client.

### When to Use Cloud Code

- **Anti-cheat**: award currency, validate purchases, or grant items server-side.
- **Complex server logic**: matchmaking tie-breakers, seasonal event logic, cross-player interactions.
- **Scheduled jobs**: daily reward resets, leaderboard snapshots (via Cloud Code Triggers).

### Calling a Cloud Code Module from the Client

```csharp
using System.Collections.Generic;
using Unity.Services.CloudCode;
using Unity.Services.CloudCode.GeneratedBindings;
using UnityEngine;

/// <summary>
/// Call a Cloud Code module function from the Unity client.
/// The module must already be deployed via the UGS dashboard or CLI.
/// </summary>
public class CloudCodeCaller : MonoBehaviour
{
    public async void ClaimDailyReward()
    {
        try
        {
            // CallModuleEndpointAsync<T> invokes a specific function
            // in a deployed C# module. The generic type is the return type.
            var result = await CloudCodeService.Instance
                .CallModuleEndpointAsync<DailyRewardResult>(
                    "DailyRewards",          // Module name (as deployed)
                    "ClaimReward",           // Function name within the module
                    new Dictionary<string, object>  // Parameters (optional)
                    {
                        { "timezone", System.TimeZoneInfo.Local.Id }
                    }
                );

            Debug.Log($"Claimed {result.GemsAwarded} gems! Streak: {result.Streak}");
        }
        catch (CloudCodeException ex)
        {
            // CloudCodeException includes server-side error details.
            Debug.LogError($"Cloud Code error: {ex.Message}");
        }
    }
}

// Matches the JSON structure returned by the Cloud Code module.
[System.Serializable]
public class DailyRewardResult
{
    public int GemsAwarded;
    public int Streak;
}
```

### Server-Side C# Module Example (deployed to UGS)

```csharp
// This code runs on UGS servers, NOT in the Unity client.
// Deploy via the UGS CLI: ugs cloud-code modules deploy
using Microsoft.Extensions.DependencyInjection;
using Unity.Services.CloudCode.Core;
using Unity.Services.CloudCode.Apis;
using Unity.Services.CloudSave.Model;

namespace DailyRewards
{
    public class DailyRewardModule
    {
        [CloudCodeFunction("ClaimReward")]
        public async Task<DailyRewardResult> ClaimReward(
            IExecutionContext context,          // UGS provides player ID, project ID, etc.
            IGameApiClient gameApiClient,       // Access other UGS services server-side
            string timezone = "UTC")
        {
            // Read the player's last claim date from Cloud Save (Private Player Data).
            // Server-side access bypasses client restrictions — secure by design.
            var savedData = await gameApiClient.CloudSaveData
                .GetItemsAsync(context, context.PlayerId,
                    new List<string> { "last_claim", "streak" });

            // ... reward logic, streak calculation, etc.

            return new DailyRewardResult { GemsAwarded = 50, Streak = 3 };
        }
    }

    public class DailyRewardResult
    {
        public int GemsAwarded { get; set; }
        public int Streak { get; set; }
    }
}
```

---

## Combining Services: A LiveOps Pattern

A typical live-service game wires these three services together:

```
 1. App launches → UGSBootstrap initializes + authenticates
 2. Loading screen → GameConfig fetches Remote Config
     → "holiday_event_enabled" == true?
         → Show holiday UI, load holiday assets
 3. Main menu → CloudSaveManager loads player progress
     → Populate inventory, settings, last session state
 4. Player claims daily reward → CloudCodeCaller.ClaimDailyReward()
     → Server validates streak, awards gems via Private Player Data
     → Client reads updated gem count from Cloud Save
 5. Player changes settings → CloudSaveManager saves preferences
 6. You (the developer) change "enemy_health_multiplier" in the dashboard
     → Next time any player loads, they get the new value — no update required
```

---

## Error Handling Patterns

All UGS services throw similar exception hierarchies. Handle them consistently:

```csharp
try
{
    // Any UGS call...
}
catch (CloudSaveRateLimitedException ex)
{
    // Back off — ex.RetryAfter gives seconds to wait.
    await Task.Delay(TimeSpan.FromSeconds(ex.RetryAfter));
    // Retry the operation
}
catch (CloudSaveValidationException ex)
{
    // Bad input — log and fix your request.
    Debug.LogError($"Validation: {ex.Message}");
}
catch (CloudSaveException ex)
{
    // General service error — may be transient.
    Debug.LogError($"Cloud Save: {ex.Message}");
}
catch (RequestFailedException ex)
{
    // Catch-all for any UGS request failure (network, auth, etc.)
    Debug.LogError($"UGS request failed: {ex.Message}");
}
```

---

## Quick Reference

| Service | Package | Key Class | Dashboard Section |
|---------|---------|-----------|-------------------|
| Remote Config | `com.unity.remote-config-runtime` | `RemoteConfigService.Instance` | LiveOps → Remote Config |
| Cloud Save | `com.unity.services.cloudsave` | `CloudSaveService.Instance.Data` | LiveOps → Cloud Save |
| Cloud Code | `com.unity.services.cloudcode` | `CloudCodeService.Instance` | LiveOps → Cloud Code |
| Authentication | `com.unity.services.authentication` | `AuthenticationService.Instance` | Player Authentication |

---

## See Also

- [G29 Multiplayer Services](G29_multiplayer_services.md) — Lobby, Relay, Matchmaker, Vivox
- [G6 Save/Load System](G6_save_load_system.md) — Local save patterns (offline-first)
- [G14 ScriptableObject Architecture](G14_scriptable_object_architecture.md) — Config-driven design that pairs well with Remote Config
- [Unity Remote Config docs](https://docs.unity.com/en-us/remote-config)
- [Unity Cloud Save docs](https://docs.unity.com/en-us/cloud-save)
- [Unity Cloud Code docs](https://docs.unity.com/en-us/cloud-code)
