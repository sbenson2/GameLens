# G29 — Unity Gaming Services: Multiplayer (Lobby, Relay, Matchmaker, Vivox)

> **Category:** guide · **Engine:** Unity 6 (6000.x) · **Related:** [G8 Networking & Netcode](G8_networking_netcode.md) · [G6 Save/Load System](G6_save_load_system.md) · [G16 Performance & Memory](G16_performance_optimization_memory.md) · [Unity Rules](../unity-arch-rules.md)

Unity Gaming Services (UGS) provides managed backend infrastructure for multiplayer games. This guide covers the **Multiplayer Services SDK** — a unified package (Unity 6+) that consolidates **Lobby**, **Relay**, and **Matchmaker** under a single API, plus **Vivox** for voice chat. These services handle the "getting players together" layer so your game can focus on gameplay via Netcode for GameObjects or Netcode for Entities.

---

## Architecture Overview

```
Player A (Host)                    Unity Gaming Services                 Player B (Client)
┌─────────────┐                   ┌─────────────────────┐              ┌─────────────┐
│ Game Client  │──── Create ──────│  Lobby Service       │──── Join ───│ Game Client  │
│              │     Lobby        │  (REST, WebSocket)   │    Lobby    │              │
│              │                  └─────────────────────┘              │              │
│              │                                                       │              │
│              │──── Allocate ────┌─────────────────────┐              │              │
│              │     Relay        │  Relay Service       │──── Join ───│              │
│              │                  │  (UDP, DTLS)         │    Relay    │              │
│              │                  └─────────────────────┘              │              │
│              │                                                       │              │
│              │◄══════════════ Netcode Game Traffic ═══════════════►│              │
│              │            (routed through Relay server)              │              │
│              │                                                       │              │
│              │──── Connect ─────┌─────────────────────┐──── Connect─│              │
│              │     Vivox        │  Vivox Voice/Text    │    Vivox    │              │
└─────────────┘                   └─────────────────────┘              └─────────────┘
```

### Why Use UGS Instead of Raw Netcode?

| Concern | Raw Netcode | UGS + Netcode |
|---------|-------------|---------------|
| NAT traversal | Player must port-forward | Relay handles it (no port forwarding) |
| Player discovery | You build a lobby server | Lobby service (managed, scalable) |
| Matchmaking | You build a matchmaker | Matchmaker service (rule-based) |
| Voice chat | Third-party integration | Vivox (built-in, free tier) |
| IP privacy | Host IP visible to clients | Relay anonymizes all connections |

---

## Prerequisites

### 1. Unity Dashboard Setup

Before using any UGS service, you need a **Unity Cloud project**:

1. Go to [cloud.unity.com](https://cloud.unity.com)
2. Create or select a project
3. Enable services: **Lobby**, **Relay**, **Matchmaker**, **Vivox**
4. Copy your **Project ID** and **Environment** name

### 2. Install Packages

For **Unity 6+**, use the unified Multiplayer Services SDK:

```
Window → Package Manager → Unity Registry → Multiplayer Services
```

This single package replaces the individual `com.unity.services.lobby`, `com.unity.services.relay`, and `com.unity.services.matchmaker` packages. Also install:

- `com.unity.services.vivox` — voice and text chat
- `com.unity.netcode.gameobjects` — game networking layer
- `com.unity.services.authentication` — required for all UGS services

### 3. Initialize Services

```csharp
using Unity.Services.Core;
using Unity.Services.Authentication;
using UnityEngine;

public class ServicesBootstrap : MonoBehaviour
{
    async void Start()
    {
        // WHY: All UGS services require initialization and authentication.
        // UnityServices.InitializeAsync() sets up the SDK, then you sign in.
        // Anonymous auth creates a persistent player ID without requiring
        // an account — perfect for development and casual games.
        try
        {
            await UnityServices.InitializeAsync();

            if (!AuthenticationService.Instance.IsSignedIn)
            {
                await AuthenticationService.Instance.SignInAnonymouslyAsync();
                Debug.Log($"Signed in as: {AuthenticationService.Instance.PlayerId}");
            }
        }
        catch (ServicesInitializationException e)
        {
            Debug.LogError($"UGS init failed: {e.Message}");
        }
    }
}
```

---

## Lobby Service

Lobbies let players discover and join game sessions before the real-time connection begins. Think of them as "waiting rooms" with shared metadata.

### Create a Lobby

```csharp
using Unity.Services.Lobbies;
using Unity.Services.Lobbies.Models;
using System.Collections.Generic;
using UnityEngine;

public class LobbyManager : MonoBehaviour
{
    private Lobby _currentLobby;
    private float _heartbeatTimer;
    private const float HeartbeatInterval = 15f; // seconds

    public async void CreateLobby(string lobbyName, int maxPlayers)
    {
        try
        {
            // WHY: CreateLobbyOptions lets you attach metadata that other
            // players see when browsing lobbies — game mode, map, skill level.
            var options = new CreateLobbyOptions
            {
                IsPrivate = false, // true = join by code only (invite-only)
                Data = new Dictionary<string, DataObject>
                {
                    // WHY: Lobby data uses string keys with DataObject values.
                    // Visibility controls who can see the data:
                    // - Member: only lobby members
                    // - Public: anyone browsing lobbies
                    ["GameMode"] = new DataObject(
                        visibility: DataObject.VisibilityOptions.Public,
                        value: "Deathmatch"),
                    ["Map"] = new DataObject(
                        visibility: DataObject.VisibilityOptions.Public,
                        value: "Arena_01"),
                    // Store the Relay join code so clients can connect
                    ["RelayJoinCode"] = new DataObject(
                        visibility: DataObject.VisibilityOptions.Member,
                        value: "")
                }
            };

            _currentLobby = await LobbyService.Instance.CreateLobbyAsync(
                lobbyName, maxPlayers, options);

            Debug.Log($"Lobby created: {_currentLobby.Id} " +
                      $"(Code: {_currentLobby.LobbyCode})");
        }
        catch (LobbyServiceException e)
        {
            Debug.LogError($"Lobby creation failed: {e.Message}");
        }
    }

    void Update()
    {
        // WHY: The host must send heartbeats every 30 seconds or the
        // lobby auto-deletes. Sending every 15s gives safety margin.
        if (_currentLobby == null || !IsHost()) return;

        _heartbeatTimer -= Time.deltaTime;
        if (_heartbeatTimer <= 0f)
        {
            _heartbeatTimer = HeartbeatInterval;
            LobbyService.Instance.SendHeartbeatPingAsync(_currentLobby.Id);
        }
    }

    private bool IsHost()
    {
        return _currentLobby.HostId ==
               Unity.Services.Authentication.AuthenticationService.Instance.PlayerId;
    }
}
```

### Browse and Join Lobbies

```csharp
using Unity.Services.Lobbies;
using Unity.Services.Lobbies.Models;
using System.Collections.Generic;
using UnityEngine;

public class LobbyBrowser : MonoBehaviour
{
    public async void BrowseLobbies()
    {
        try
        {
            // WHY: QueryLobbiesOptions lets you filter and sort lobbies
            // server-side, reducing bandwidth and giving players relevant results.
            var options = new QueryLobbiesOptions
            {
                Count = 20, // max results per page
                Filters = new List<QueryFilter>
                {
                    // Only show lobbies with available slots
                    new QueryFilter(
                        field: QueryFilter.FieldOptions.AvailableSlots,
                        op: QueryFilter.OpOptions.GT,
                        value: "0"),
                    // Filter by game mode
                    new QueryFilter(
                        field: QueryFilter.FieldOptions.S1, // custom string field 1
                        op: QueryFilter.OpOptions.EQ,
                        value: "Deathmatch")
                },
                Order = new List<QueryOrder>
                {
                    // Show newest lobbies first
                    new QueryOrder(asc: false, field: QueryOrder.FieldOptions.Created)
                }
            };

            var response = await LobbyService.Instance.QueryLobbiesAsync(options);

            foreach (var lobby in response.Results)
            {
                Debug.Log($"[{lobby.Players.Count}/{lobby.MaxPlayers}] " +
                          $"{lobby.Name} — {lobby.Data["Map"].Value}");
            }
        }
        catch (LobbyServiceException e)
        {
            Debug.LogError($"Lobby query failed: {e.Message}");
        }
    }

    public async void JoinByCode(string lobbyCode)
    {
        // WHY: Join by code is used for private/invite-only lobbies.
        // The host shares the 6-character code out-of-band (Discord, text, etc.).
        try
        {
            var lobby = await LobbyService.Instance.JoinLobbyByCodeAsync(lobbyCode);
            Debug.Log($"Joined lobby: {lobby.Name}");
        }
        catch (LobbyServiceException e)
        {
            Debug.LogError($"Join failed: {e.Message}");
        }
    }
}
```

---

## Relay Service

Relay provides **NAT-traversal-free** connections between players. The host allocates a Relay server, shares a join code, and all game traffic routes through Unity's infrastructure — no port forwarding, no exposed IPs.

### Host: Allocate Relay + Start Netcode

```csharp
using Unity.Services.Relay;
using Unity.Services.Relay.Models;
using Unity.Netcode;
using Unity.Netcode.Transports.UTP;
using Unity.Networking.Transport.Relay;
using UnityEngine;

public class RelayManager : MonoBehaviour
{
    /// <summary>
    /// Host allocates a Relay server and starts Netcode as the host.
    /// Returns the join code that clients need to connect.
    /// </summary>
    public async System.Threading.Tasks.Task<string> StartHostWithRelay(int maxConnections)
    {
        try
        {
            // WHY: Allocation creates a Relay server slot for your session.
            // maxConnections = number of OTHER players (not counting host).
            Allocation allocation = await RelayService.Instance
                .CreateAllocationAsync(maxConnections);

            // WHY: The join code is a short string that clients use to find
            // this specific Relay allocation. Share it via the Lobby service.
            string joinCode = await RelayService.Instance
                .GetJoinCodeAsync(allocation.AllocationId);

            Debug.Log($"Relay allocated. Join code: {joinCode}");

            // Configure Netcode's transport to use this Relay allocation
            var transport = NetworkManager.Singleton
                .GetComponent<UnityTransport>();

            // WHY: SetRelayServerData configures the transport with the
            // Relay server's address, ports, and encryption keys.
            // The allocation contains all the connection info needed.
            var relayServerData = new RelayServerData(allocation, "dtls");
            transport.SetRelayServerData(relayServerData);

            // Start Netcode as host (server + client in one process)
            NetworkManager.Singleton.StartHost();

            return joinCode;
        }
        catch (RelayServiceException e)
        {
            Debug.LogError($"Relay allocation failed: {e.Message}");
            return null;
        }
    }
}
```

### Client: Join Relay + Start Netcode

```csharp
using Unity.Services.Relay;
using Unity.Services.Relay.Models;
using Unity.Netcode;
using Unity.Netcode.Transports.UTP;
using Unity.Networking.Transport.Relay;
using UnityEngine;

public class RelayClient : MonoBehaviour
{
    /// <summary>
    /// Client joins an existing Relay session using a join code
    /// and starts Netcode as a client.
    /// </summary>
    public async void JoinWithRelay(string joinCode)
    {
        try
        {
            // WHY: JoinAllocation connects this client to the same Relay
            // server the host allocated. The join code maps to the allocation.
            JoinAllocation joinAllocation = await RelayService.Instance
                .JoinAllocationAsync(joinCode);

            var transport = NetworkManager.Singleton
                .GetComponent<UnityTransport>();

            // WHY: "dtls" = Datagram Transport Layer Security.
            // This encrypts all game traffic through the Relay.
            var relayServerData = new RelayServerData(joinAllocation, "dtls");
            transport.SetRelayServerData(relayServerData);

            NetworkManager.Singleton.StartClient();

            Debug.Log("Connected to Relay as client");
        }
        catch (RelayServiceException e)
        {
            Debug.LogError($"Relay join failed: {e.Message}");
        }
    }
}
```

---

## Putting It Together: Lobby + Relay Flow

The standard flow connects Lobby (player discovery) with Relay (networking):

```csharp
using Unity.Services.Lobbies;
using Unity.Services.Lobbies.Models;
using System.Collections.Generic;
using UnityEngine;

public class MultiplayerOrchestrator : MonoBehaviour
{
    [SerializeField] private RelayManager _relayManager;
    [SerializeField] private LobbyManager _lobbyManager;

    /// <summary>
    /// Full host flow: Create lobby → Allocate Relay → Store join code in lobby
    /// </summary>
    public async void HostGame(string gameName, int maxPlayers)
    {
        // Step 1: Create the lobby (visible to other players immediately)
        await _lobbyManager.CreateLobby(gameName, maxPlayers);

        // Step 2: Allocate Relay and start Netcode host
        string joinCode = await _relayManager.StartHostWithRelay(maxPlayers - 1);

        if (joinCode == null) return;

        // Step 3: Store the Relay join code in the lobby so clients can find it
        // WHY: The Relay join code is how clients connect to your game session.
        // Storing it as lobby data means clients get it automatically when
        // they join the lobby — no separate communication channel needed.
        var updateOptions = new UpdateLobbyOptions
        {
            Data = new Dictionary<string, DataObject>
            {
                ["RelayJoinCode"] = new DataObject(
                    visibility: DataObject.VisibilityOptions.Member,
                    value: joinCode)
            }
        };

        await LobbyService.Instance.UpdateLobbyAsync(
            _lobbyManager.CurrentLobbyId, updateOptions);

        Debug.Log("Hosting — lobby created, Relay allocated, ready for players!");
    }
}
```

---

## Vivox Voice & Text Chat

Vivox provides managed voice and text chat. It's free up to 5,000 peak concurrent users.

```csharp
using Unity.Services.Vivox;
using UnityEngine;

public class VoiceChatManager : MonoBehaviour
{
    /// <summary>
    /// Initialize Vivox and join a voice channel tied to the lobby.
    /// </summary>
    public async void JoinVoiceChannel(string channelName)
    {
        try
        {
            // WHY: Vivox initializes separately from other UGS services.
            // Call this after UnityServices.InitializeAsync() and sign-in.
            await VivoxService.Instance.InitializeAsync();

            // WHY: LoginAsync creates a Vivox session for this player.
            // It uses the UGS authentication token — no separate Vivox account.
            await VivoxService.Instance.LoginAsync();

            // Join a positional voice channel (3D spatial audio)
            // WHY: Positional audio means nearby players are louder —
            // immersive for open-world or arena games. Use non-positional
            // for team voice comms or lobby chat.
            await VivoxService.Instance.JoinGroupChannelAsync(
                channelName,
                ChatCapability.AudioOnly);

            Debug.Log($"Joined voice channel: {channelName}");
        }
        catch (System.Exception e)
        {
            Debug.LogError($"Vivox error: {e.Message}");
        }
    }

    public async void LeaveVoiceChannel(string channelName)
    {
        await VivoxService.Instance.LeaveChannelAsync(channelName);
        Debug.Log("Left voice channel");
    }

    void OnDestroy()
    {
        // WHY: Always log out when the player leaves to free the connection.
        if (VivoxService.Instance.IsLoggedIn)
        {
            VivoxService.Instance.LogoutAsync();
        }
    }
}
```

---

## Matchmaker Service (Advanced)

For automatic matchmaking (instead of manual lobby browsing), use the Matchmaker service:

```csharp
// Matchmaker is configured in the Unity Cloud Dashboard:
// 1. Define Queues (e.g., "Ranked", "Casual")
// 2. Define Match Rules (team size, skill range, region)
// 3. Configure backfill and timeout settings
//
// Client-side flow:
// 1. Player submits a ticket: MatchmakerService.Instance.CreateTicketAsync(...)
// 2. Matchmaker finds compatible players based on your rules
// 3. Player polls for match assignment: MatchmakerService.Instance.GetTicketAsync(...)
// 4. On match found: receive a Multiplay server allocation or Relay join code
//
// WHY: Use Matchmaker when you need skill-based, region-aware, or role-based
// matching. Use Lobby for casual join-by-browse or friend-invite flows.
// Many games use BOTH — Matchmaker for ranked, Lobby for custom games.
```

---

## Pricing & Limits (as of 2025)

| Service | Free Tier | Notes |
|---------|-----------|-------|
| Lobby | 100 req/s per project | Generous for most indie games |
| Relay | 50 CCU | Paid plans for higher CCU |
| Matchmaker | 50 CCU | Requires Multiplay or Relay for sessions |
| Vivox | 5,000 PCU | Audio + text included |
| Authentication | Unlimited | Anonymous + platform sign-in |

> **CCU** = Concurrent Connected Users. **PCU** = Peak Concurrent Users.

---

## Error Handling & Resilience

```csharp
using Unity.Services.Lobbies;
using UnityEngine;

public static class MultiplayerErrorHandler
{
    // WHY: UGS services are cloud-hosted — network errors, rate limits,
    // and service outages are realities of production multiplayer.
    // Always wrap UGS calls in try/catch and handle gracefully.

    public static void HandleLobbyError(LobbyServiceException e)
    {
        switch (e.Reason)
        {
            case LobbyExceptionReason.LobbyNotFound:
                Debug.LogWarning("Lobby no longer exists — returning to browser");
                // Navigate back to lobby browser
                break;

            case LobbyExceptionReason.LobbyFull:
                Debug.LogWarning("Lobby is full — try another");
                break;

            case LobbyExceptionReason.RateLimited:
                Debug.LogWarning("Rate limited — wait before retrying");
                // Implement exponential backoff
                break;

            default:
                Debug.LogError($"Lobby error: {e.Reason} — {e.Message}");
                break;
        }
    }
}
```

---

## Summary

The UGS Multiplayer stack handles the hard infrastructure problems of online games: player discovery (Lobby), NAT traversal (Relay), skill-based matching (Matchmaker), and voice chat (Vivox). In Unity 6, these are unified under the Multiplayer Services SDK. Use Lobby + Relay for most indie multiplayer games, add Matchmaker for ranked play, and Vivox for voice. Always initialize UGS services in a bootstrap scene, handle errors gracefully, and send lobby heartbeats to keep sessions alive.
