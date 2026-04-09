# G76 — Distributed Authority Networking

> **Category:** guide · **Engine:** Unity 6.0+ (6000.0+) · **Related:** [G8 Networking & Netcode](G8_networking_netcode.md) · [G29 Multiplayer Services](G29_multiplayer_services.md) · [G70 Netcode for Entities](G70_netcode_for_entities.md) · [Unity Rules](../unity-arch-rules.md)

Traditional Unity multiplayer uses a **client-server** topology where one authoritative server (or host) owns all game state. This is robust but introduces latency for client-owned actions and requires dedicated server infrastructure. Unity's **Distributed Authority** mode, available in Netcode for GameObjects 2.0+, offers an alternative: clients share authority over networked objects, with a lightweight cloud relay coordinating ownership rather than simulating game state. This dramatically reduces perceived latency for player-owned objects and simplifies infrastructure for session-based games.

---

## When to Use Distributed Authority

| Use Case | Distributed Authority | Client-Server |
|---|---|---|
| Co-op / party games (2–10 players) | Excellent | Good |
| Competitive PvP (anti-cheat critical) | Poor — clients are trusted | Excellent |
| Physics-heavy shared simulations | Tricky — ownership handoff needed | Better (single authority) |
| Mobile / WebGL (no dedicated servers) | Excellent — no server binary needed | Requires relay or host |
| Large player counts (50+) | Not recommended | Required |
| Turn-based / async multiplayer | Good | Good |

**Rule of thumb:** If you trust your players (co-op, casual, social) and want low-latency ownership of player objects, distributed authority is a strong fit. If you need anti-cheat guarantees or a single source of truth for competitive play, stick with client-server.

---

## Architecture

```
┌─────────┐       ┌─────────────────┐       ┌─────────┐
│ Client A │◄─────►│  Unity Relay /   │◄─────►│ Client B │
│ (owns    │       │  Cloud Service   │       │ (owns    │
│  Player  │       │  (forwarding     │       │  Player  │
│  A, NPC  │       │   only — no      │       │  B, item │
│  group)  │       │   game logic)    │       │  chest)  │
└─────────┘       └─────────────────┘       └─────────┘
```

Key differences from client-server:

1. **No authoritative server** — the relay forwards packets but does not run game logic.
2. **Distributed ownership** — each client has authority over the objects it spawns. Other clients see replicated state.
3. **Session owner** — one client is promoted to "session owner" (similar to host migration). The session owner handles spawning of non-player objects and tie-breaking.
4. **Client-to-client RPCs** — RPCs can target specific clients (routed through the relay, not direct P2P).

---

## Setup

### Prerequisites

| Package | Minimum Version | Purpose |
|---|---|---|
| `com.unity.netcode.gameobjects` | 2.0.0+ | Networking framework |
| `com.unity.services.multiplayer` | Latest | Session management, relay |
| `com.unity.services.authentication` | Latest | Player identity |
| Unity Cloud project | Linked | Required for relay services |

### NetworkManager Configuration

1. Add an empty GameObject named `NetworkManager`.
2. Attach the **NetworkManager** component.
3. Under **Network Settings**, set **Network Topology** to **Distributed Authority**.
4. Under **Network Transport**, select **DistributedAuthorityTransport**.

---

## Connection Manager

The connection flow uses Unity Gaming Services (UGS) for authentication and session management:

```csharp
using System;
using System.Threading.Tasks;
using Unity.Netcode;
using Unity.Services.Authentication;
using Unity.Services.Core;
using Unity.Services.Multiplayer;
using UnityEngine;

/// <summary>
/// WHY: This script handles the full connection lifecycle for
/// distributed authority games: authenticate → create/join session → play.
/// Attach to the same GameObject as NetworkManager.
/// </summary>
public class ConnectionManager : MonoBehaviour
{
    [SerializeField] private string _sessionName = "my-game-session";
    [SerializeField] private int _maxPlayers = 10;

    private ISession _session;
    private NetworkManager _networkManager;
    private ConnectionState _state = ConnectionState.Disconnected;

    private enum ConnectionState { Disconnected, Connecting, Connected }

    private async void Awake()
    {
        _networkManager = GetComponent<NetworkManager>();

        // WHY: Subscribe to connection events BEFORE initializing services.
        // OnClientConnectedCallback fires when THIS client is fully connected
        // and ready to spawn NetworkObjects.
        _networkManager.OnClientConnectedCallback += OnClientConnected;

        // WHY: OnSessionOwnerPromoted fires when a client becomes the
        // session owner (equivalent to "host" in client-server).
        // The session owner handles non-player spawning and tie-breaking.
        _networkManager.OnSessionOwnerPromoted += OnSessionOwnerPromoted;

        // WHY: InitializeAsync sets up UGS core services (auth, relay, etc.).
        // Must be called before any UGS API.
        await UnityServices.InitializeAsync();
    }

    /// <summary>
    /// WHY: Call this from a UI button or auto-connect on scene load.
    /// CreateOrJoinSessionAsync either creates a new session or joins
    /// an existing one with the same name — no separate host/client flow.
    /// </summary>
    public async Task ConnectAsync(string profileName = "default")
    {
        if (_state != ConnectionState.Disconnected) return;
        _state = ConnectionState.Connecting;

        try
        {
            // WHY: SwitchProfile allows multiple players on the same device
            // (useful for testing). In production, use a single profile.
            AuthenticationService.Instance.SwitchProfile(profileName);
            await AuthenticationService.Instance.SignInAnonymouslyAsync();

            // WHY: WithDistributedAuthorityNetwork() configures the session
            // to use distributed authority topology instead of client-server.
            // This is the KEY call that makes everything work differently.
            var options = new SessionOptions
            {
                Name = _sessionName,
                MaxPlayers = _maxPlayers
            }.WithDistributedAuthorityNetwork();

            // WHY: CreateOrJoinSessionAsync is idempotent — the first caller
            // creates the session, subsequent callers join it. No need for
            // separate "Create" and "Join" code paths.
            _session = await MultiplayerService.Instance
                .CreateOrJoinSessionAsync(_sessionName, options);

            _state = ConnectionState.Connected;
        }
        catch (Exception e)
        {
            _state = ConnectionState.Disconnected;
            Debug.LogException(e);
        }
    }

    private void OnClientConnected(ulong clientId)
    {
        if (_networkManager.LocalClientId == clientId)
        {
            // WHY: Only spawn objects AFTER this callback. Spawning before
            // the client is fully connected causes silent failures.
            Debug.Log($"Client-{clientId} connected. Ready to spawn.");
        }
    }

    private void OnSessionOwnerPromoted(ulong newOwnerId)
    {
        // WHY: Session owner promotion happens automatically when the
        // previous owner disconnects. Use this to reassign NPC ownership
        // or trigger "host migration" logic.
        if (_networkManager.LocalClient.IsSessionOwner)
        {
            Debug.Log("This client is now the session owner.");
        }
    }

    private void OnDestroy()
    {
        _session?.LeaveAsync();
    }
}
```

---

## Player Controller with Distributed Authority

In distributed authority, each client has **authority** over the objects it spawns. The `HasAuthority` check replaces the client-server `IsOwner` pattern:

```csharp
using Unity.Netcode;
using Unity.Netcode.Components;
using UnityEngine;

/// <summary>
/// WHY: Extends NetworkTransform so position/rotation are automatically
/// replicated to other clients. In distributed authority, the spawning
/// client has authority — no server needed to validate movement.
/// </summary>
public class PlayerController : NetworkTransform
{
    [SerializeField] private float _speed = 10f;

    private void Update()
    {
        // WHY: IsSpawned checks the object is registered with Netcode.
        // HasAuthority checks THIS client owns the object.
        // Both must be true before applying local input.
        if (!IsSpawned || !HasAuthority)
            return;

        // WHY: Standard Unity input — works the same as single-player.
        // The NetworkTransform component automatically replicates
        // the resulting position changes to all other clients.
        var motion = new Vector3(
            Input.GetAxis("Horizontal"),
            0f,
            Input.GetAxis("Vertical")
        );

        if (motion.sqrMagnitude > 0.01f)
        {
            transform.position += motion.normalized * _speed * Time.deltaTime;
        }
    }
}
```

---

## RPCs in Distributed Authority

Netcode for GameObjects 2.0+ uses a unified `[Rpc]` attribute that replaces the older `[ServerRpc]` and `[ClientRpc]` attributes. In distributed authority, client-to-client RPCs are supported (routed through the relay):

```csharp
using Unity.Netcode;
using UnityEngine;

public class ChatSystem : NetworkBehaviour
{
    // WHY: SendTo.Everyone broadcasts to all connected clients.
    // In distributed authority there's no "server" — the relay
    // forwards the message to every other client.
    [Rpc(SendTo.Everyone)]
    public void SendChatMessageRpc(string message, RpcParams rpcParams = default)
    {
        // WHY: rpcParams.Receive.SenderClientId tells us WHO sent the
        // message, so we can display the correct player name.
        ulong senderId = rpcParams.Receive.SenderClientId;
        Debug.Log($"[Chat] Player {senderId}: {message}");
    }

    // WHY: SendTo.SpecifiedInParams allows targeting a specific client.
    // Useful for private messages, trade requests, etc.
    [Rpc(SendTo.SpecifiedInParams)]
    public void SendPrivateMessageRpc(string message, RpcParams rpcParams = default)
    {
        Debug.Log($"[DM] {message}");
    }

    public void SendDirectMessage(ulong targetClientId, string text)
    {
        // WHY: Build RpcParams to target a specific client.
        // The relay routes it — no direct P2P connection needed.
        SendPrivateMessageRpc(text, RpcTarget.Single(targetClientId,
            RpcTargetUse.Temp));
    }
}
```

### RPC Targets Reference

| Target | Distributed Authority Behavior |
|---|---|
| `SendTo.Everyone` | Relay broadcasts to all clients |
| `SendTo.Owner` | Sends to the client that owns (has authority over) the object |
| `SendTo.NotOwner` | Sends to all clients except the owner |
| `SendTo.SpecifiedInParams` | Sends to a specific client via `RpcTarget` |
| `SendTo.Authority` | Sends to the client with authority (same as Owner in DA mode) |

> **Note:** There are no direct connections between clients. All RPCs route through the relay, which adds ~1 relay hop of latency. For latency-critical gameplay, keep RPCs small and infrequent.

---

## Ownership & Authority Transfer

In distributed authority, the spawning client automatically gets authority. To transfer authority (e.g., picking up an item another client dropped):

```csharp
using Unity.Netcode;
using UnityEngine;

public class PickupItem : NetworkBehaviour
{
    /// <summary>
    /// WHY: When a player picks up an item, they need authority over it
    /// to control its position (e.g., attaching to hand). In distributed
    /// authority, any client can request ownership of non-player objects.
    /// </summary>
    public void OnPickedUpBy(ulong newOwnerClientId)
    {
        if (!HasAuthority)
        {
            // WHY: ChangeOwnership transfers authority to another client.
            // Only the current authority holder can call this.
            // The session owner can also force ownership changes.
            NetworkObject.ChangeOwnership(newOwnerClientId);
        }
    }

    public override void OnOwnershipChanged(
        ulong previousOwnerId, ulong newOwnerId)
    {
        // WHY: Called on ALL clients when ownership changes.
        // Use this to update visuals (highlight, particle effect)
        // or re-parent the object in the scene hierarchy.
        Debug.Log($"Item ownership: {previousOwnerId} → {newOwnerId}");

        if (HasAuthority)
        {
            // WHY: The new owner might need to snap the item to their
            // hand position or enable physics interactions.
            EnableLocalPhysics();
        }
    }

    private void EnableLocalPhysics()
    {
        var rb = GetComponent<Rigidbody>();
        if (rb != null) rb.isKinematic = false;
    }
}
```

---

## Testing Locally

Distributed authority requires Unity Gaming Services, but you can test locally using **Multiplayer Play Mode** (Window → Multiplayer Play Mode):

1. Enable Multiplayer Play Mode in the editor.
2. Add 1–3 virtual players.
3. Each virtual player runs as a separate process with its own UGS profile.
4. Press Play — all instances connect to the same session automatically.

For CI or automated testing, use ParrelSync or multiple editor instances with different UGS profile names.

---

## Session Owner Responsibilities

The session owner (first client, or promoted after disconnect) has special duties:

```csharp
using Unity.Netcode;
using UnityEngine;

public class SessionOwnerManager : NetworkBehaviour
{
    [SerializeField] private GameObject _npcPrefab;

    // WHY: Only the session owner should spawn shared objects (NPCs,
    // world items, environmental hazards). Other clients will see
    // them replicated automatically.
    public void SpawnSharedNPC(Vector3 position)
    {
        if (!NetworkManager.Singleton.LocalClient.IsSessionOwner)
        {
            Debug.LogWarning("Only the session owner can spawn shared NPCs.");
            return;
        }

        var npc = Instantiate(_npcPrefab, position, Quaternion.identity);
        npc.GetComponent<NetworkObject>().Spawn();

        // WHY: The session owner has authority over this NPC.
        // If the session owner disconnects, the new session owner
        // inherits authority over all session-owned objects.
    }
}
```

---

## Common Pitfalls

| Pitfall | Solution |
|---|---|
| Spawning before `OnClientConnectedCallback` | Always wait for the callback before calling `Spawn()` |
| Using `IsOwner` instead of `HasAuthority` | In distributed authority, `HasAuthority` is the correct check |
| Assuming server-side validation exists | There is no server — validate on the authority client or use session owner as arbiter |
| Large RPC payloads causing latency | Keep RPCs small; use `NetworkVariable` for continuous state sync |
| Forgetting to link Unity Cloud project | Distributed authority requires UGS relay — project must be linked in Project Settings → Services |
| Treating session owner as a server | The session owner is just another client with extra responsibilities — it still has latency to other clients |

---

## Distributed Authority vs. Client-Server Quick Reference

| Aspect | Distributed Authority | Client-Server |
|---|---|---|
| **Authority model** | Client that spawns object owns it | Server/host owns everything |
| **Latency for local player** | Near-zero (local authority) | 1 RTT (server validates) |
| **Infrastructure** | Unity Relay (no game server) | Dedicated server or host |
| **Anti-cheat** | Client-trusted (weak) | Server-authoritative (strong) |
| **Session management** | `CreateOrJoinSessionAsync` | Manual host/join flow |
| **RPC routing** | Via relay (client↔relay↔client) | Via server (client↔server↔client) |
| **Max recommended players** | ~10–20 | 64+ with dedicated server |
| **Cost** | UGS relay pricing | Server hosting + relay |

---

## Version History

| Version | Change |
|---|---|
| Netcode for GameObjects 2.0 | Distributed Authority topology introduced |
| Netcode for GameObjects 2.4 | Unified `[Rpc]` attribute replacing `[ServerRpc]`/`[ClientRpc]` |
| Netcode for GameObjects 2.7 | Improved session owner promotion, WebGL quickstart |
| Netcode for GameObjects 2.9 | Stability and performance improvements for distributed authority |
