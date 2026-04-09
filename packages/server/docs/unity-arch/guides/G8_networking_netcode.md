# G8 — Networking with Netcode for GameObjects

> **Category:** guide · **Engine:** Unity 6 (6000.x, Netcode for GameObjects 2.x) · **Related:** [Architecture Overview](../architecture/E1_architecture_overview.md) · [G1 Scene Management](G1_scene_management.md) · [G6 Save/Load](G6_save_load_system.md) · [Unity Rules](../unity-arch-rules.md)

Netcode for GameObjects (NGO) is Unity's official high-level networking library for multiplayer games built on the GameObject/MonoBehaviour workflow. It sits on top of Unity Transport (UTP) and provides NetworkVariables, RPCs, object spawning, and scene synchronization out of the box. This guide covers the full architecture from NetworkManager setup through synchronized gameplay, authority models, and production optimization patterns.

---

## Why Netcode for GameObjects?

Before NGO, Unity developers relied on the deprecated UNet or third-party libraries (Mirror, Photon, Fish-Networking). NGO provides:

- **First-party support** — maintained by Unity, integrated with Multiplayer Services (Relay, Lobby, Matchmaker)
- **Host/client topology** — one player acts as host (server + client), avoiding the need for dedicated servers during development
- **Transport-agnostic** — UTP by default, but any `NetworkTransport` implementation works (WebSocket, Steam, etc.)
- **NetworkVariable system** — automatic state synchronization with delta compression
- **RPCs with attributes** — type-safe remote calls with `[Rpc]` attributes (replacing legacy `[ServerRpc]`/`[ClientRpc]` in NGO 2.x)
- **Scene management** — synchronized scene loading across all connected clients

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────┐
│               NetworkManager (singleton)              │
│                                                       │
│  ┌─────────────┐  ┌────────────────┐  ┌───────────┐ │
│  │  Transport   │  │ Scene Manager  │  │ Spawning  │ │
│  │  (UTP/relay) │  │ (sync scenes)  │  │  System   │ │
│  └──────┬──────┘  └───────┬────────┘  └─────┬─────┘ │
│         │                 │                  │       │
│         ▼                 ▼                  ▼       │
│  ┌─────────────────────────────────────────────────┐ │
│  │           NetworkObject (per GameObject)         │ │
│  │  ┌─────────────────────────────────────────┐    │ │
│  │  │  NetworkBehaviour(s)                     │    │ │
│  │  │    ├── NetworkVariables (state sync)     │    │ │
│  │  │    ├── RPCs (event messaging)            │    │ │
│  │  │    └── Ownership / Authority checks      │    │ │
│  │  └─────────────────────────────────────────┘    │ │
│  └─────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────┘
```

### Key Concepts

| Concept | Role |
|---------|------|
| **NetworkManager** | Singleton that bootstraps networking: starts host/server/client, manages transport, handles spawning |
| **NetworkObject** | Component on any GameObject that should exist across the network — assigns a unique `NetworkObjectId` |
| **NetworkBehaviour** | Base class (like MonoBehaviour) for networked scripts — gives access to `IsOwner`, `IsServer`, `IsClient`, RPCs, and NetworkVariables |
| **Ownership** | Each NetworkObject has an owner (a connected client). The server owns objects by default. Ownership determines who can write to owner-writable NetworkVariables |
| **Authority** | Determines who can send certain RPCs and write state. Server-authoritative by default |

---

## Setting Up NetworkManager

```csharp
// WHY a scene-based singleton: NetworkManager must persist across scenes
// and exist before any NetworkObject spawns. Place it in your bootstrap scene.
using Unity.Netcode;
using Unity.Netcode.Transports.UTP;

public class GameBootstrap : MonoBehaviour
{
    void Start()
    {
        // WHY we configure transport before starting: The transport must
        // be configured (IP, port, relay allocation) before calling
        // StartHost/StartServer/StartClient.
        var transport = NetworkManager.Singleton
            .GetComponent<UnityTransport>();
        transport.SetConnectionData("127.0.0.1", 7777);
    }

    // Call from UI buttons
    public void StartAsHost()  => NetworkManager.Singleton.StartHost();
    public void StartAsClient() => NetworkManager.Singleton.StartClient();
    public void StartAsServer() => NetworkManager.Singleton.StartServer();
}
```

### Required Components on the NetworkManager GameObject

1. **NetworkManager** — the core singleton
2. **UnityTransport** (or other transport) — handles raw packet I/O
3. **Network Prefab List** — register every prefab that will be spawned over the network

> **Common mistake:** Forgetting to add a spawnable prefab to the NetworkManager's prefab list causes a silent spawn failure on clients.

---

## NetworkVariables — Automatic State Sync

NetworkVariables automatically replicate values from the server to all clients. They are the right choice for **persistent state** — values that should always be current on every machine.

```csharp
using Unity.Netcode;

public class PlayerHealth : NetworkBehaviour
{
    // WHY NetworkVariable<int> instead of a plain field: Plain fields
    // are local only. NetworkVariable replicates changes from server
    // to all clients automatically, with delta compression and
    // configurable write permissions.
    public NetworkVariable<int> Health = new NetworkVariable<int>(
        value: 100,
        // WHY Server read/write: Only the server should modify health
        // to prevent cheating. Clients read the replicated value.
        readPerm: NetworkVariableReadPermission.Everyone,
        writePerm: NetworkVariableWritePermission.Server
    );

    public override void OnNetworkSpawn()
    {
        // WHY subscribe in OnNetworkSpawn: This fires after the
        // NetworkObject is fully initialized on the network, ensuring
        // the variable is ready. Subscribing in Awake() would be too early.
        Health.OnValueChanged += OnHealthChanged;
    }

    public override void OnNetworkDespawn()
    {
        Health.OnValueChanged -= OnHealthChanged;
    }

    private void OnHealthChanged(int oldValue, int newValue)
    {
        // WHY react to changes rather than polling: This callback fires
        // only when the value actually changes, avoiding per-frame checks
        // and ensuring UI updates are immediate.
        Debug.Log($"Health changed: {oldValue} → {newValue}");
        // Update health bar UI here
    }
}
```

### When to Use NetworkVariables vs RPCs

| Use Case | Mechanism | Why |
|----------|-----------|-----|
| HP, position, score, inventory | **NetworkVariable** | Persistent state — late-joining clients need the current value |
| "Play explosion FX", "Show damage number" | **RPC** | Transient event — only meaningful at the moment it fires |
| Chat message | **RPC** | One-shot delivery, not persistent state |
| Ammo count | **NetworkVariable** | Must be correct for all clients at all times |

> **Rule of thumb:** If a late-joining client needs this information, use a NetworkVariable. If it's fire-and-forget, use an RPC.

---

## RPCs — Remote Procedure Calls

NGO 2.x uses the unified `[Rpc]` attribute with `SendTo` targets, replacing the older `[ServerRpc]`/`[ClientRpc]` pattern.

```csharp
using Unity.Netcode;

public class PlayerCombat : NetworkBehaviour
{
    // WHY [Rpc(SendTo.Server)]: The client sends intent ("I want to attack")
    // to the server. The server validates and applies damage. This prevents
    // clients from directly modifying game state (anti-cheat pattern).
    [Rpc(SendTo.Server)]
    public void RequestAttackRpc(ulong targetNetworkObjectId)
    {
        // WHY validate on server: Never trust client input. The client
        // could send a fake target ID or attack from across the map.
        if (!IsServer) return;

        // Validate attack range, cooldown, line of sight...
        if (NetworkManager.SpawnManager.SpawnedObjects
            .TryGetValue(targetNetworkObjectId, out var targetObj))
        {
            var health = targetObj.GetComponent<PlayerHealth>();
            if (health != null)
            {
                health.Health.Value -= 25;

                // WHY notify all clients after server validates: Clients
                // need to play hit effects, but only after the server
                // confirms the hit was legitimate.
                PlayHitEffectRpc(targetNetworkObjectId);
            }
        }
    }

    // WHY [Rpc(SendTo.Everyone)]: All clients (including the server) should
    // play the visual/audio feedback for a confirmed hit.
    [Rpc(SendTo.Everyone)]
    private void PlayHitEffectRpc(ulong targetId)
    {
        // Spawn particle effect, play sound, screen shake...
    }
}
```

### RPC Send Targets (NGO 2.x)

| Target | Sends To | Typical Use |
|--------|----------|-------------|
| `SendTo.Server` | Server/host only | Client → Server input/requests |
| `SendTo.Everyone` | All connected clients + server | Broadcast events (explosions, announcements) |
| `SendTo.ClientsAndHost` | All clients + host (not dedicated server) | Chat messages |
| `SendTo.Owner` | The owning client only | Personal notifications |
| `SendTo.NotOwner` | Everyone except the owner | "Other player did X" effects |
| `SendTo.NotServer` | All clients, not the server | Client-only visual effects |
| `SendTo.NotMe` | Everyone except the sender | Relay to others |

---

## Object Spawning

Only the **server** can spawn NetworkObjects. Clients request spawns via RPCs.

```csharp
public class ProjectileSpawner : NetworkBehaviour
{
    [SerializeField] private GameObject projectilePrefab;

    [Rpc(SendTo.Server)]
    public void RequestFireRpc(Vector3 origin, Vector3 direction)
    {
        // WHY instantiate then spawn: Instantiate creates the local
        // GameObject; Spawn() registers it with the network, triggering
        // automatic replication to all clients.
        var projectile = Instantiate(
            projectilePrefab, origin, Quaternion.LookRotation(direction));

        var netObj = projectile.GetComponent<NetworkObject>();
        netObj.Spawn();

        // WHY server sets velocity: The server is authoritative over
        // physics. Clients will receive the spawned object with
        // replicated transform data.
        projectile.GetComponent<Rigidbody>()
            .linearVelocity = direction.normalized * 20f;
    }
}
```

### Spawn Checklist

1. Prefab has a `NetworkObject` component
2. Prefab is in the NetworkManager's **Network Prefab List**
3. Only call `Spawn()` on the server
4. For player-owned objects, use `SpawnAsPlayerObject(clientId)`
5. Call `Despawn()` (not `Destroy`) to cleanly remove networked objects

---

## Synchronized Scene Loading

```csharp
// WHY use NetworkManager.SceneManager: Direct SceneManager.LoadScene()
// is local-only. NetworkManager.SceneManager.LoadScene() loads the
// scene on the server AND synchronizes it to all connected clients,
// including late joiners.
NetworkManager.Singleton.SceneManager.LoadScene(
    "GameLevel_01",
    UnityEngine.SceneManagement.LoadSceneMode.Single
);
```

Subscribe to scene events for loading screens:

```csharp
NetworkManager.Singleton.SceneManager.OnLoadEventCompleted +=
    (sceneName, loadMode, clientsCompleted, clientsTimedOut) =>
    {
        // WHY check clientsTimedOut: Some clients may have slow
        // connections. Handle stragglers gracefully rather than
        // assuming everyone loaded instantly.
        if (clientsTimedOut.Count > 0)
            Debug.LogWarning($"{clientsTimedOut.Count} clients timed out loading {sceneName}");
    };
```

---

## Connection Management

```csharp
public class ConnectionManager : NetworkBehaviour
{
    void Start()
    {
        var nm = NetworkManager.Singleton;

        // WHY approval callback: Gives the server a chance to reject
        // connections (wrong version, server full, banned player)
        // before the client fully joins.
        nm.ConnectionApprovalCallback = ApproveConnection;

        nm.OnClientConnectedCallback += OnClientConnected;
        nm.OnClientDisconnectCallback += OnClientDisconnected;
    }

    private void ApproveConnection(
        NetworkManager.ConnectionApprovalRequest request,
        NetworkManager.ConnectionApprovalResponse response)
    {
        // WHY deserialize payload: Clients can send connection data
        // (e.g., version string, auth token) for the server to validate.
        string version = System.Text.Encoding.UTF8
            .GetString(request.Payload);

        response.Approved = version == Application.version;
        response.Reason = response.Approved ? "" : "Version mismatch";

        // WHY set spawn position: Prevents all players from spawning
        // at the origin. Use spawn points or a queue system.
        response.Position = GetNextSpawnPoint();
        response.Rotation = Quaternion.identity;
        response.CreatePlayerObject = true;
    }

    private void OnClientConnected(ulong clientId)
    {
        Debug.Log($"Client {clientId} connected");
    }

    private void OnClientDisconnected(ulong clientId)
    {
        // WHY cleanup on disconnect: Release resources, update
        // player list, handle in-progress interactions gracefully.
        Debug.Log($"Client {clientId} disconnected");
    }
}
```

---

## Integration with Unity Gaming Services

For production multiplayer, NGO works with Unity's backend services:

| Service | Purpose |
|---------|---------|
| **Relay** | NAT punch-through so players can connect without port forwarding or dedicated servers |
| **Lobby** | Create, list, and join game lobbies with metadata |
| **Matchmaker** | Skill-based or rule-based matchmaking with dedicated server allocation |

```csharp
// WHY Relay: Most home networks use NAT, making direct connections
// impossible. Relay acts as a transparent middleman, routing traffic
// between players without requiring port forwarding.
using Unity.Services.Relay;
using Unity.Services.Relay.Models;

async Task StartHostWithRelay(int maxPlayers)
{
    // Allocate a relay server for this session
    Allocation allocation = await RelayService.Instance
        .CreateAllocationAsync(maxPlayers);

    // Get join code to share with other players (via Lobby)
    string joinCode = await RelayService.Instance
        .GetJoinCodeAsync(allocation.AllocationId);

    // Configure transport to use relay
    var transport = NetworkManager.Singleton
        .GetComponent<UnityTransport>();
    transport.SetRelayServerData(allocation.ToRelayServerData("dtls"));

    NetworkManager.Singleton.StartHost();
}
```

---

## Common Pitfalls and Solutions

### 1. "Object not in prefab list"

Every networked prefab must be registered in the NetworkManager's prefab list. Use **NetworkPrefabsList** ScriptableObject assets to manage large prefab collections across multiple scenes.

### 2. Writing to NetworkVariables from clients

By default, only the server can write. If a client needs to modify a value, either:
- Send an RPC to the server asking it to change the value
- Set `writePerm: NetworkVariableWritePermission.Owner` (for owner-writable state like input direction)

### 3. RPCs before spawn

NetworkBehaviours cannot send RPCs until `OnNetworkSpawn()` has been called. Attempting to send an RPC in `Awake()` or `Start()` will fail silently.

### 4. Large NetworkVariable payloads

NetworkVariables are optimized for small, frequently-changing values (int, float, Vector3). For large data (inventories, level data), use RPCs with byte arrays or custom serialization.

### 5. Physics desynchronization

By default, each client runs its own physics. For authoritative physics:
- Run physics on the server only
- Replicate `Rigidbody` state via NetworkVariables or `NetworkRigidbody` component
- Use client-side prediction for responsive movement

---

## Production Checklist

- [ ] All networked prefabs registered in NetworkManager prefab list
- [ ] Server validates all client RPCs (never trust client input)
- [ ] NetworkVariables use appropriate read/write permissions
- [ ] Connection approval callback validates version and auth
- [ ] Scene loading uses `NetworkManager.SceneManager`, not `SceneManager` directly
- [ ] Relay configured for non-LAN deployments
- [ ] Graceful disconnect handling (cleanup, rejoin support)
- [ ] Bandwidth profiled with the Multiplayer Tools package
- [ ] Late-joining clients receive correct state (test by joining mid-game)
- [ ] Build and test with actual network conditions (latency simulation in UTP)

---

## Further Reading

- [Netcode for GameObjects Documentation](https://docs-multiplayer.unity3d.com/netcode/current/about/)
- [RPC vs NetworkVariable](https://docs.unity3d.com/Packages/com.unity.netcode.gameobjects@2.6/manual/learn/rpcvnetvar.html)
- [Unity Multiplayer Networking E-Book](https://unity.com/blog/multiplayer-networking-ebook)
- [Unity Gaming Services — Relay](https://docs.unity.com/relay/)
