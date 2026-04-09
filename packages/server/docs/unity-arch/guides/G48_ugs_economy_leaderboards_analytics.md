# G48 — Unity Gaming Services: Economy, Leaderboards & Analytics

> **Category:** guide · **Engine:** Unity 6 (6000.x, UGS SDK 3.x+) · **Related:** [G36 LiveOps: Remote Config & Cloud Save](G36_liveops_remote_config_cloud_save.md) · [G29 Multiplayer Services](G29_multiplayer_services.md) · [G6 Save/Load System](G6_save_load_system.md) · [Unity Rules](../unity-arch-rules.md)

Unity Gaming Services (UGS) provides managed backend services for live games. This guide covers three complementary services not covered by G36 (Remote Config / Cloud Save / Cloud Code) or G29 (Multiplayer): **Economy** (virtual currencies, inventory, purchases), **Leaderboards** (ranked player scores), and **Analytics** (custom event tracking and player insights). Together with the services in G36, they form the full UGS LiveOps stack for free-to-play and live-service games.

---

## Architecture Overview

```
Unity Client                          Unity Gaming Services Cloud
┌────────────────────┐               ┌──────────────────────────────────────┐
│  Game Logic         │               │                                      │
│                     │               │  Economy Service                     │
│  ┌───────────────┐  │── Balance ───│  ┌──────────────────────────────┐    │
│  │ EconomyService │  │   & Purchase │  │ Currencies · Inventory Items  │    │
│  │ .Instance      │  │              │  │ Virtual Purchases · IAP       │    │
│  └───────────────┘  │              │  │ Player Balances · Instances   │    │
│                     │              │  └──────────────────────────────┘    │
│  ┌───────────────┐  │── Score ─────│                                      │
│  │ Leaderboards   │  │   Submit     │  Leaderboards Service               │
│  │ Service        │  │   & Query    │  ┌──────────────────────────────┐    │
│  │ .Instance      │  │              │  │ Leaderboard Configs · Tiers   │    │
│  └───────────────┘  │              │  │ Scores · Ranks · Bucketed     │    │
│                     │              │  └──────────────────────────────┘    │
│  ┌───────────────┐  │── Events ────│                                      │
│  │ Analytics       │  │   (batched   │  Analytics Service                  │
│  │ Service        │  │    every 60s) │  ┌──────────────────────────────┐    │
│  │ .Instance      │  │              │  │ Standard Events · Custom      │    │
│  └───────────────┘  │              │  │ Funnels · Data Export         │    │
│                     │              │  └──────────────────────────────┘    │
│  ┌───────────────┐  │              │                                      │
│  │ Authentication │  │── Sign In ──│  Authentication Service              │
│  │ Service        │  │              │  (Required by all UGS services)      │
│  └───────────────┘  │              │                                      │
└────────────────────┘               └──────────────────────────────────────┘
```

### When to Use Each Service

| Need | Service | Example |
|------|---------|---------|
| Virtual currency (gold, gems) | Economy | Award 100 gold for completing a quest |
| Player inventory | Economy | Track which skins, weapons, items a player owns |
| In-app purchases | Economy + IAP | Buy a "Starter Pack" with real money |
| Ranked competition | Leaderboards | Weekly high-score board for an endless runner |
| Player behavior tracking | Analytics | Track how many players reach level 5 |
| A/B testing signals | Analytics + Remote Config | Measure conversion rate of two shop layouts |

---

## Prerequisites

All three services require UGS project setup and player authentication:

```csharp
using Unity.Services.Core;
using Unity.Services.Authentication;

public class UGSBootstrap : MonoBehaviour
{
    async void Start()
    {
        // WHY: UnityServices.InitializeAsync() must be called before accessing
        // any UGS service. It loads configuration and establishes connectivity.
        await UnityServices.InitializeAsync();

        // WHY: Economy, Leaderboards, and Analytics all require an authenticated
        // player. Anonymous auth is the fastest path for development/testing.
        if (!AuthenticationService.Instance.IsSignedIn)
        {
            await AuthenticationService.Instance.SignInAnonymouslyAsync();
        }

        Debug.Log($"Player ID: {AuthenticationService.Instance.PlayerId}");
    }
}
```

**Required packages** (install via Package Manager or `manifest.json`):

| Package | ID | Min Version |
|---------|-----|------------|
| Core | `com.unity.services.core` | 1.12+ |
| Authentication | `com.unity.services.authentication` | 3.3+ |
| Economy | `com.unity.services.economy` | 3.4+ |
| Leaderboards | `com.unity.services.leaderboards` | 2.0+ |
| Analytics | `com.unity.services.analytics` | 5.1+ |

---

## Economy

### Core Concepts

| Concept | Description |
|---------|-------------|
| **Currency** | Virtual money (gold, gems, energy). Has an ID, initial balance, and optional max balance. |
| **Inventory Item** | Anything a player can own (sword, skin, potion). Defined once, instanced per player. |
| **Virtual Purchase** | Trade currencies/items for other currencies/items. Server-validated. |
| **Real Money Purchase** | Trade real money (via Apple/Google IAP) for currencies/items. Receipt-validated server-side. |
| **Player Balance** | A player's current amount of a specific currency. |
| **Player Inventory** | The set of item instances a player currently owns. |

### Configuration (Dashboard)

Define your economy in the **UGS Dashboard** (dashboard.unity3d.com):

1. **Currencies** — Create entries like `GOLD` (initial: 500, max: 999999) and `GEMS` (initial: 0)
2. **Inventory Items** — Create entries like `SWORD_BASIC`, `SHIELD_IRON` with custom JSON data
3. **Virtual Purchases** — Define "Buy Iron Shield" = costs 200 GOLD, rewards 1 SHIELD_IRON
4. **Real Money Purchases** — Link Apple/Google Product IDs to economy rewards

### Reading Player Balances

```csharp
using Unity.Services.Economy;
using Unity.Services.Economy.Model;
using System.Collections.Generic;

public class EconomyManager : MonoBehaviour
{
    // WHY: GetBalancesAsync() fetches ALL currency balances for the authenticated
    // player from the server. The result is paginated — use HasNext for large sets.
    public async void FetchBalances()
    {
        try
        {
            GetBalancesResult result =
                await EconomyService.Instance.PlayerBalances.GetBalancesAsync();

            // WHY: Balances is a List<PlayerBalance>, each with CurrencyId and Balance.
            foreach (PlayerBalance balance in result.Balances)
            {
                Debug.Log($"{balance.CurrencyId}: {balance.Balance}");
            }
        }
        catch (EconomyException e)
        {
            // WHY: EconomyException contains a Reason enum for programmatic handling
            // (e.g., EconomyExceptionReason.UnprocessableTransaction for insufficient funds).
            Debug.LogError($"Economy error ({e.Reason}): {e.Message}");
        }
    }
}
```

### Modifying Balances

```csharp
// WHY: IncrementBalanceAsync adds to the current balance server-side.
// Use this for rewards (quest completion, ad watching, daily login).
// The server enforces max-balance limits configured in the dashboard.
PlayerBalance updated = await EconomyService.Instance.PlayerBalances
    .IncrementBalanceAsync("GOLD", 100);
Debug.Log($"New gold balance: {updated.Balance}");

// WHY: DecrementBalanceAsync subtracts. Returns EconomyException if balance
// would go negative — the server prevents negative balances automatically.
PlayerBalance spent = await EconomyService.Instance.PlayerBalances
    .DecrementBalanceAsync("GOLD", 50);

// WHY: SetBalanceAsync is an admin/cheat tool — use sparingly in production.
// Useful for development testing or "reset currency" flows.
PlayerBalance reset = await EconomyService.Instance.PlayerBalances
    .SetBalanceAsync("GEMS", 0);
```

### Player Inventory

```csharp
using Unity.Services.Economy;
using Unity.Services.Economy.Model;

// WHY: GetInventoryAsync returns all item instances the player owns.
// Each PlayersInventoryItem has a unique InstanceId (server-generated)
// and the InventoryItemId matching your dashboard definition.
GetInventoryResult inventory =
    await EconomyService.Instance.PlayerInventory.GetInventoryAsync();

foreach (PlayersInventoryItem item in inventory.PlayersInventoryItems)
{
    Debug.Log($"Item: {item.InventoryItemId}, Instance: {item.PlayersInventoryItemId}");

    // WHY: InstanceData contains custom JSON you attached at creation time.
    // Use it for per-instance state like durability, enchantment level, etc.
    if (item.InstanceData != null)
    {
        Debug.Log($"  Data: {item.InstanceData}");
    }
}

// WHY: AddInventoryItemAsync creates a new instance of an item for the player.
// Pass optional instanceData for per-instance customization.
PlayersInventoryItem newItem = await EconomyService.Instance.PlayerInventory
    .AddInventoryItemAsync("SWORD_BASIC");
```

### Virtual Purchases (Server-Validated)

```csharp
// WHY: MakeVirtualPurchaseAsync is the recommended way to exchange currencies/items.
// The server atomically validates the player can afford the purchase, deducts costs,
// and grants rewards — preventing exploits like double-spending.
MakeVirtualPurchaseResult result = await EconomyService.Instance.Purchases
    .MakeVirtualPurchaseAsync("BUY_IRON_SHIELD");

// WHY: The result contains both what was spent and what was received,
// so the UI can show a confirmation without extra server calls.
Debug.Log($"Currencies spent: {result.Costs.Currency.Count}");
Debug.Log($"Items received: {result.Rewards.Inventory.Count}");
```

### Real Money Purchases (IAP Integration)

```csharp
using UnityEngine.Purchasing; // Unity IAP package

// WHY: For real-money purchases, the flow is:
// 1. Player initiates purchase via Unity IAP → platform store dialog
// 2. Store returns a receipt string
// 3. Pass receipt to Economy for server-side validation and reward granting
// This prevents receipt forgery — Economy validates with Apple/Google servers directly.

public async void OnPurchaseComplete(Product product)
{
    try
    {
        RedeemAppleAppStorePurchaseResult result =
            await EconomyService.Instance.Purchases
                .RedeemAppleAppStorePurchaseAsync(new RedeemAppleAppStorePurchaseArgs(
                    // WHY: The real-money purchase ID matches what you configured
                    // in the UGS dashboard, linking the store product to economy rewards.
                    "STARTER_PACK",
                    product.receipt
                ));

        Debug.Log("Purchase validated and rewards granted!");
    }
    catch (EconomyException e)
    {
        Debug.LogError($"Purchase validation failed: {e.Message}");
    }
}
```

### Listening for Balance Changes

```csharp
void OnEnable()
{
    // WHY: BalanceUpdated fires whenever any SDK call changes a currency balance.
    // Subscribe once and update your UI reactively — avoids polling.
    EconomyService.Instance.PlayerBalances.BalanceUpdated += OnBalanceUpdated;
}

void OnDisable()
{
    EconomyService.Instance.PlayerBalances.BalanceUpdated -= OnBalanceUpdated;
}

void OnBalanceUpdated(string currencyId)
{
    // WHY: The event only tells you WHICH currency changed, not the new value.
    // Fetch the updated balance if you need the exact number.
    Debug.Log($"Currency updated: {currencyId}");
}
```

---

## Leaderboards

### Core Concepts

| Concept | Description |
|---------|-------------|
| **Leaderboard** | A named, sorted list of player scores. Created in the UGS dashboard. |
| **Score** | A numeric value submitted by a player. Supports `asc` (time trials) or `desc` (high scores) sorting. |
| **Tier** | Optional bucketing — auto-assigns players to Bronze/Silver/Gold based on score thresholds. |
| **Version** | Leaderboards can reset on a schedule (daily/weekly/monthly) and archive previous versions. |
| **Metadata** | Optional JSON attached to a score entry (e.g., the ship used, the level reached). |

### Submitting Scores

```csharp
using Unity.Services.Leaderboards;
using Unity.Services.Leaderboards.Models;

// WHY: AddPlayerScoreAsync submits a score for the currently authenticated player.
// If the player already has a score, the server applies the leaderboard's update policy:
//   - "KeepBest" (default) — only stores the score if it's higher/lower than existing
//   - "Always" — always overwrites the previous score
LeaderboardEntry entry = await LeaderboardsService.Instance
    .AddPlayerScoreAsync("weekly_highscore", 12500);

Debug.Log($"Rank: {entry.Rank}, Score: {entry.Score}");
```

### Submitting Scores with Metadata

```csharp
// WHY: Metadata lets you attach context to a score entry.
// This is useful for showing HOW a player achieved their score
// (what character they used, what level they reached, etc.)
var options = new AddPlayerScoreOptions
{
    Metadata = new Dictionary<string, string>
    {
        { "character", "Knight" },
        { "level", "Volcanic Lair" }
    }
};

LeaderboardEntry entry = await LeaderboardsService.Instance
    .AddPlayerScoreAsync("weekly_highscore", 15000, options);
```

### Querying Top Scores

```csharp
// WHY: GetScoresAsync returns the top scores for a leaderboard.
// Default is top 10; use Offset and Limit for pagination.
var options = new GetScoresOptions { Offset = 0, Limit = 25 };

LeaderboardScoresPage page = await LeaderboardsService.Instance
    .GetScoresAsync("weekly_highscore", options);

foreach (LeaderboardEntry entry in page.Results)
{
    // WHY: Each entry has PlayerId, PlayerName (if set via Authentication),
    // Rank (0-based), Score, Tier (if configured), and optional Metadata.
    Debug.Log($"#{entry.Rank + 1}: {entry.PlayerId} — {entry.Score}");
}
```

### Getting Scores Around the Current Player

```csharp
// WHY: GetPlayerRangeAsync returns the current player's score plus
// neighbors above and below. This is the "you are here" view that
// most competitive games show — the player sees their rank in context.
var options = new GetPlayerRangeOptions { RangeLimit = 5 };

LeaderboardScoresPage page = await LeaderboardsService.Instance
    .GetPlayerRangeAsync("weekly_highscore", options);

// WHY: RangeLimit = 5 returns up to 5 entries above and 5 below the player,
// plus the player's own entry, for a maximum of 11 entries total.
foreach (LeaderboardEntry entry in page.Results)
{
    Debug.Log($"#{entry.Rank + 1}: {entry.Score}");
}
```

### Getting the Current Player's Score

```csharp
// WHY: GetPlayerScoreAsync returns just the current player's entry.
// Use this for "Your Best" displays without fetching the full board.
try
{
    LeaderboardEntry myScore = await LeaderboardsService.Instance
        .GetPlayerScoreAsync("weekly_highscore");

    Debug.Log($"My rank: #{myScore.Rank + 1}, Score: {myScore.Score}");
}
catch (LeaderboardsException e) when (e.Reason == LeaderboardsExceptionReason.EntryNotFound)
{
    // WHY: This exception means the player hasn't submitted a score yet.
    // Handle gracefully — show "No score yet" in the UI.
    Debug.Log("No score submitted yet.");
}
```

### Leaderboard Versioning (Seasonal Resets)

Configure in the UGS Dashboard under each leaderboard:

| Setting | Value | Effect |
|---------|-------|--------|
| Reset Schedule | Daily / Weekly / Monthly | Scores reset on schedule; previous version archived |
| Version Retention | 1–10 | How many past versions to keep for historical queries |

```csharp
// WHY: GetVersionScoresAsync lets you query a previous leaderboard version.
// Useful for "Last Week's Champions" displays.
var versionOptions = new GetVersionScoresOptions { Offset = 0, Limit = 10 };

LeaderboardVersionScoresPage lastWeek = await LeaderboardsService.Instance
    .GetVersionScoresAsync("weekly_highscore", "previous_version_id", versionOptions);
```

---

## Analytics

### Core Concepts

| Concept | Description |
|---------|-------------|
| **Standard Event** | Pre-defined events Unity tracks automatically (session start/end, first open, IAP). |
| **Custom Event** | Events you define for your game's specific metrics. |
| **Event Parameters** | Key-value data attached to events. Standard parameters (userID, platform) are auto-populated. |
| **Data Export** | Raw event data export for external BI tools. Available in the UGS dashboard. |
| **Funnels** | Conversion analysis (e.g., % of players who complete onboarding). |

### Recording Custom Events

```csharp
using Unity.Services.Analytics;

// WHY: AnalyticsService.Instance is the entry point for all event recording.
// Events are batched locally and uploaded every 60 seconds automatically.
// The SDK auto-populates: userID, sessionID, eventTimestamp, platform.

// --- Simple event (no parameters) ---
// WHY: Use CustomEvent for lightweight tracking where the event name alone
// carries enough information (e.g., "tutorial_started").
AnalyticsService.Instance.RecordEvent("tutorial_started");

// --- Event with parameters ---
// WHY: Use the Event base class approach for type-safe, reusable event definitions.
// This prevents typos in parameter names across your codebase.
var levelComplete = new CustomEvent("level_complete")
{
    { "level_index", 5 },
    { "time_seconds", 142.3f },
    { "deaths", 3 },
    { "used_hint", false }
};
AnalyticsService.Instance.RecordEvent(levelComplete);
```

### Creating Reusable Event Classes

```csharp
using Unity.Services.Analytics;

// WHY: Subclassing Event gives you type safety and a single source of truth
// for event schema. If the dashboard expects "level_index" as an int,
// this class enforces that at compile time — no runtime validation errors.
public class LevelCompleteEvent : Event
{
    public LevelCompleteEvent() : base("level_complete") { }

    public int LevelIndex
    {
        set { SetParameter("level_index", value); }
    }

    public float TimeSeconds
    {
        set { SetParameter("time_seconds", value); }
    }

    public int Deaths
    {
        set { SetParameter("deaths", value); }
    }

    public bool UsedHint
    {
        set { SetParameter("used_hint", value); }
    }
}

// Usage:
var evt = new LevelCompleteEvent
{
    LevelIndex = 5,
    TimeSeconds = 142.3f,
    Deaths = 3,
    UsedHint = false
};
AnalyticsService.Instance.RecordEvent(evt);
```

### Consent & GDPR

```csharp
// WHY: Analytics requires explicit user consent in GDPR/CCPA regions.
// Call CheckForRequiredConsents() on first launch to determine
// whether consent dialogs are needed.

var consentIdentifiers = await AnalyticsService.Instance
    .CheckForRequiredConsents();

if (consentIdentifiers.Count > 0)
{
    // WHY: Show your own consent UI, then call ProvideOptInConsent()
    // or ProvideOptOutConsent() based on the player's choice.
    // Events are NOT sent until consent is provided.
    foreach (var consent in consentIdentifiers)
    {
        if (PlayerGaveConsent(consent))
        {
            AnalyticsService.Instance.ProvideOptInConsent(consent, true);
        }
        else
        {
            AnalyticsService.Instance.ProvideOptInConsent(consent, false);
        }
    }
}
```

### Flushing Events Manually

```csharp
// WHY: Events batch automatically every 60 seconds.
// Call Flush() before critical moments (app pause, level end)
// to ensure no events are lost if the player kills the app.
AnalyticsService.Instance.Flush();
```

---

## Combining Services: Practical Example

A common pattern combines all three services for a "level complete" flow:

```csharp
public class LevelCompleteHandler : MonoBehaviour
{
    public async void OnLevelComplete(int levelIndex, float timeSec, int deaths)
    {
        // --- 1. Grant currency reward ---
        // WHY: Economy server validates and prevents exploits (e.g., calling this
        // multiple times). Consider using Cloud Code (G36) for complex reward logic.
        int goldReward = CalculateGoldReward(levelIndex, deaths);
        await EconomyService.Instance.PlayerBalances
            .IncrementBalanceAsync("GOLD", goldReward);

        // --- 2. Submit score to leaderboard ---
        // WHY: Use time-based score (lower is better) with ascending sort,
        // or point-based score with descending sort. Dashboard config matters.
        await LeaderboardsService.Instance
            .AddPlayerScoreAsync("speedrun_times", timeSec);

        // --- 3. Track analytics event ---
        // WHY: Analytics events are fire-and-forget with no await.
        // They batch locally — no network latency impact on gameplay.
        var evt = new LevelCompleteEvent
        {
            LevelIndex = levelIndex,
            TimeSeconds = timeSec,
            Deaths = deaths,
            UsedHint = false
        };
        AnalyticsService.Instance.RecordEvent(evt);

        Debug.Log($"Level {levelIndex} complete! +{goldReward} gold");
    }

    int CalculateGoldReward(int level, int deaths)
    {
        // WHY: Base reward scales with level, death penalty encourages skill.
        // Consider moving this to Cloud Code (G36) so you can tune without client updates.
        int baseReward = 50 + (level * 10);
        int penalty = deaths * 5;
        return Mathf.Max(baseReward - penalty, 10);
    }
}
```

---

## Error Handling Best Practices

```csharp
// WHY: All UGS services throw service-specific exceptions with Reason enums.
// Catch them specifically for graceful degradation — don't let a leaderboard
// outage crash your game.

try
{
    await EconomyService.Instance.Purchases
        .MakeVirtualPurchaseAsync("BUY_IRON_SHIELD");
}
catch (EconomyException e) when (e.Reason == EconomyExceptionReason.UnprocessableTransaction)
{
    // WHY: Player can't afford the purchase — show "Not enough gold" UI.
    ShowInsufficientFundsDialog();
}
catch (EconomyException e)
{
    // WHY: Other economy errors (network, server, rate limit).
    // Log and show generic error — don't expose internals to players.
    Debug.LogError($"Economy error: {e.Reason} — {e.Message}");
    ShowGenericErrorDialog();
}
```

---

## Production Checklist

| Area | Check |
|------|-------|
| **Auth** | Replace anonymous auth with platform sign-in (Apple, Google, Steam) before launch |
| **Economy** | Test max-balance limits, negative-balance prevention, and concurrent purchase race conditions |
| **Economy** | Enable receipt validation for all real-money purchases (Apple + Google) |
| **Leaderboards** | Set appropriate reset schedule and version retention |
| **Leaderboards** | Test with > 1000 entries to verify pagination works |
| **Analytics** | Implement GDPR/CCPA consent flow before launch |
| **Analytics** | Validate custom events appear in dashboard Data Explorer within 24 hours |
| **All** | Handle `RequestFailedException` for network outages — game should remain playable offline |
| **All** | Use Cloud Code (G36) for server-authoritative logic that combines multiple services |

---

## Breadcrumbs

- **Economy + Cloud Code** → See [G36 LiveOps](G36_liveops_remote_config_cloud_save.md) for server-side logic that combines Economy with Remote Config
- **Leaderboards + Multiplayer** → See [G29 Multiplayer Services](G29_multiplayer_services.md) for Lobby/Relay alongside competitive features
- **Save/Load** → See [G6 Save/Load System](G6_save_load_system.md) for local persistence that complements Cloud Save
- **Performance** → See [G16 Performance & Memory](G16_performance_optimization_memory.md) for batching network calls
