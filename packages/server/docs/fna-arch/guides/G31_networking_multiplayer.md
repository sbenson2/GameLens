# G31 — Networking & Multiplayer

> **Category:** guide · **Engine:** FNA · **Related:** [G05 Input Handling](./G05_input_handling.md) · [G11 ECS MoonTools](./G11_ecs_moontools.md) · [G26 Steam Storefront Integration](./G26_steam_storefront_integration.md) · [FNA Architecture Rules](../fna-arch-rules.md)

Patterns for adding networking and multiplayer to FNA games. Covers library selection, client-server architecture, peer-to-peer via Steam, state synchronization, and integration with FNA's fixed-timestep game loop.

---

## Table of Contents

1. [Networking in FNA: The Landscape](#1--networking-in-fna-the-landscape)
2. [Library Selection](#2--library-selection)
3. [Architecture: Client-Server vs Peer-to-Peer](#3--architecture-client-server-vs-peer-to-peer)
4. [Integrating with the FNA Game Loop](#4--integrating-with-the-fna-game-loop)
5. [LiteNetLib: UDP Networking](#5--litenetlib-udp-networking)
6. [Steamworks Peer-to-Peer](#6--steamworks-peer-to-peer)
7. [State Synchronization Patterns](#7--state-synchronization-patterns)
8. [Serialization](#8--serialization)
9. [Lag Compensation and Prediction](#9--lag-compensation-and-prediction)
10. [Common Pitfalls](#10--common-pitfalls)
11. [FNA vs MonoGame: Networking Differences](#11--fna-vs-monogame-networking-differences)

---

## 1 — Networking in FNA: The Landscape

FNA (like XNA before it) has **no built-in networking API.** XNA's original `Net` namespace (which used Xbox LIVE) was never reimplemented in FNA because it was Xbox-specific and the service no longer exists.

This is fine — game networking libraries in .NET are mature and framework-agnostic. You pick a transport library, wire it into your game loop, and handle state synchronization yourself. FNA's deterministic fixed-timestep loop (60 FPS `Update` by default) is actually ideal for networked gameplay.

---

## 2 — Library Selection

| Library | Type | NAT Traversal | Best For |
|---------|------|---------------|----------|
| **LiteNetLib** | Reliable UDP | Manual (STUN) | Indie games, custom servers |
| **Steamworks.NET** + SteamNetworkingSockets | Relay UDP | Steam relay servers | Steam-published games |
| **RiptideNetworking** | Reliable UDP | Manual | Simple client-server games |
| **ENet-CSharp** | Reliable UDP | Manual | Performance-critical games |
| **System.Net.Sockets** | Raw TCP/UDP | None | Learning, LAN-only |

### Recommended Approach

For most FNA games shipping on Steam:

- Use **Steamworks.NET** for matchmaking, lobbies, and NAT-traversed peer-to-peer via Steam's relay network
- Use **LiteNetLib** as the transport layer if you need dedicated servers or non-Steam platforms
- Use both together: LiteNetLib for the protocol, Steamworks for relay and matchmaking

### NuGet Installation

```bash
# LiteNetLib — lightweight reliable UDP
dotnet add package LiteNetLib

# Steamworks.NET — C# wrapper for the Steamworks SDK
dotnet add package Steamworks.NET

# RiptideNetworking — simpler API, good for prototypes
dotnet add package RiptideNetworking
```

**Note for NativeAOT builds (see G23):** Verify that your chosen networking library works under NativeAOT. LiteNetLib is pure C# and works. Steamworks.NET uses P/Invoke to native Steamworks libraries — this works under NativeAOT but you must ensure the native `steam_api64.dll`/`libsteam_api.so` is in the output directory.

---

## 3 — Architecture: Client-Server vs Peer-to-Peer

### Client-Server (Authoritative)

One machine (or dedicated process) is the authority on game state. Clients send inputs; the server simulates and sends back results.

```
Client A  ──input──>  Server  ──state──>  Client A
Client B  ──input──>  Server  ──state──>  Client B
```

**Pros:** Cheat-resistant, deterministic, scales to many players.
**Cons:** Requires a server (can be player-hosted), adds latency.

### Peer-to-Peer (Lockstep or Rollback)

All peers run the same simulation. Each peer sends inputs to all others.

```
Peer A  <──input──>  Peer B
Peer A  <──input──>  Peer C
```

**Pros:** No server needed, low-latency for 2-4 players.
**Cons:** All peers must run same logic (determinism required), harder to prevent cheating.

### Recommendation for FNA Games

- **2-4 player co-op/versus:** Peer-to-peer via Steam relay (SteamNetworkingSockets)
- **4+ players or competitive:** Client-server with player-hosted or dedicated server
- **MMO-style:** Dedicated server (out of scope for this guide)

---

## 4 — Integrating with the FNA Game Loop

FNA's `Game` class runs a fixed-timestep loop by default (`IsFixedTimeStep = true`, 60 FPS). Network code must integrate without blocking this loop.

### Network Update Placement

```csharp
public class Game1 : Game
{
    private NetworkManager _network;

    protected override void Update(GameTime gameTime)
    {
        // 1. Poll network — receive all pending messages
        _network.Poll();

        // 2. Read local input
        var input = ReadLocalInput();

        // 3. Send local input to remote peers/server
        _network.SendInput(input);

        // 4. Apply all inputs (local + received remote) to game state
        _gameState.Update(input, _network.GetRemoteInputs());

        base.Update(gameTime);
    }

    protected override void Draw(GameTime gameTime)
    {
        // Render from the latest confirmed game state
        _renderer.Draw(_gameState);
        base.Draw(gameTime);
    }
}
```

### Critical Rule: Never Block Update()

Network I/O (connecting, sending, receiving) must be non-blocking. All recommended libraries (LiteNetLib, Steamworks) provide poll-based APIs that process received packets without blocking. Never call `socket.Receive()` with a timeout inside `Update()`.

---

## 5 — LiteNetLib: UDP Networking

LiteNetLib provides reliable and unreliable UDP channels, packet fragmentation, and connection management. It's pure C# with no native dependencies.

### Server Setup

```csharp
using LiteNetLib;
using LiteNetLib.Utils;

namespace MyGame.Network;

/// <summary>
/// Minimal LiteNetLib server. Runs inside the FNA game loop
/// (player-hosted) or as a standalone console app (dedicated).
/// </summary>
public class GameServer : INetEventListener
{
    private NetManager _server;
    private readonly Dictionary<int, NetPeer> _peers = new();

    public void Start(int port)
    {
        _server = new NetManager(this);
        _server.Start(port);
    }

    /// <summary>
    /// Call every frame from Update(). Processes all pending packets.
    /// </summary>
    public void Poll()
    {
        _server?.PollEvents();
    }

    public void SendToAll(NetDataWriter writer, DeliveryMethod method)
    {
        foreach (var peer in _peers.Values)
            peer.Send(writer, method);
    }

    // --- INetEventListener implementation ---

    public void OnConnectionRequest(ConnectionRequest request)
    {
        // Accept with a simple key check
        request.AcceptIfKey("MyGameKey_v1");
    }

    public void OnPeerConnected(NetPeer peer)
    {
        _peers[peer.Id] = peer;
        Console.WriteLine($"Player connected: {peer.Id}");
    }

    public void OnPeerDisconnected(NetPeer peer, DisconnectInfo info)
    {
        _peers.Remove(peer.Id);
        Console.WriteLine($"Player disconnected: {peer.Id} ({info.Reason})");
    }

    public void OnNetworkReceive(NetPeer peer, NetPacketReader reader,
        byte channel, DeliveryMethod deliveryMethod)
    {
        // Read the packet type byte, then dispatch
        byte packetType = reader.GetByte();
        switch (packetType)
        {
            case PacketTypes.PlayerInput:
                HandlePlayerInput(peer.Id, reader);
                break;
            // Add more packet types as needed
        }
        reader.Recycle();
    }

    public void OnNetworkError(IPEndPoint endPoint, System.Net.Sockets.SocketError error) { }
    public void OnNetworkReceiveUnconnected(IPEndPoint ep, NetPacketReader r, UnconnectedMessageType t) { }
    public void OnNetworkLatencyUpdate(NetPeer peer, int latency) { }

    private void HandlePlayerInput(int playerId, NetPacketReader reader)
    {
        // Deserialize input and apply to game state
        float moveX = reader.GetFloat();
        float moveY = reader.GetFloat();
        bool jump = reader.GetBool();
        // ... apply to authoritative game state
    }
}
```

### Client Setup

```csharp
public class GameClient : INetEventListener
{
    private NetManager _client;
    private NetPeer? _serverPeer;

    public bool IsConnected => _serverPeer?.ConnectionState == ConnectionState.Connected;

    public void Connect(string address, int port)
    {
        _client = new NetManager(this);
        _client.Start();
        _client.Connect(address, port, "MyGameKey_v1");
    }

    public void Poll() => _client?.PollEvents();

    public void SendInput(float moveX, float moveY, bool jump)
    {
        if (_serverPeer == null) return;

        var writer = new NetDataWriter();
        writer.Put(PacketTypes.PlayerInput);
        writer.Put(moveX);
        writer.Put(moveY);
        writer.Put(jump);

        // Input goes reliably ordered — every input matters
        _serverPeer.Send(writer, DeliveryMethod.ReliableOrdered);
    }

    public void OnPeerConnected(NetPeer peer) => _serverPeer = peer;
    public void OnPeerDisconnected(NetPeer peer, DisconnectInfo info) => _serverPeer = null;
    public void OnConnectionRequest(ConnectionRequest request) => request.Reject();

    public void OnNetworkReceive(NetPeer peer, NetPacketReader reader,
        byte channel, DeliveryMethod deliveryMethod)
    {
        byte packetType = reader.GetByte();
        switch (packetType)
        {
            case PacketTypes.WorldState:
                HandleWorldState(reader);
                break;
        }
        reader.Recycle();
    }

    public void OnNetworkError(IPEndPoint ep, System.Net.Sockets.SocketError err) { }
    public void OnNetworkReceiveUnconnected(IPEndPoint ep, NetPacketReader r, UnconnectedMessageType t) { }
    public void OnNetworkLatencyUpdate(NetPeer peer, int latency) { }

    private void HandleWorldState(NetPacketReader reader)
    {
        // Deserialize world state snapshot and update local view
    }
}
```

### Packet Type Constants

```csharp
public static class PacketTypes
{
    public const byte PlayerInput = 1;
    public const byte WorldState = 2;
    public const byte PlayerJoined = 3;
    public const byte PlayerLeft = 4;
    public const byte ChatMessage = 5;
}
```

---

## 6 — Steamworks Peer-to-Peer

If your game ships on Steam, SteamNetworkingSockets provides NAT traversal via Valve's relay network — no port forwarding needed.

```csharp
using Steamworks;

namespace MyGame.Network;

/// <summary>
/// Steam lobby-based P2P networking.
/// Players join a Steam lobby, then exchange game data
/// via SteamNetworkingMessages (relay-backed UDP).
/// </summary>
public class SteamP2PManager
{
    private CSteamID _lobbyId;

    /// <summary>
    /// Create a Steam lobby and become the host.
    /// </summary>
    public void CreateLobby(int maxPlayers)
    {
        SteamMatchmaking.CreateLobby(ELobbyType.k_ELobbyTypeFriendsOnly,
            maxPlayers);
        // Handle result in a Callback<LobbyCreated_t>
    }

    /// <summary>
    /// Join an existing lobby by Steam ID.
    /// </summary>
    public void JoinLobby(CSteamID lobbyId)
    {
        SteamMatchmaking.JoinLobby(lobbyId);
    }

    /// <summary>
    /// Send a packet to a specific peer via Steam relay.
    /// Uses unreliable delivery for position updates,
    /// reliable for important events.
    /// </summary>
    public void SendToPeer(CSteamID target, byte[] data, bool reliable)
    {
        int sendFlags = reliable
            ? Constants.k_nSteamNetworkingSend_Reliable
            : Constants.k_nSteamNetworkingSend_Unreliable;

        SteamNetworkingMessages.SendMessageToUser(
            ref new SteamNetworkingIdentity { SetSteamID(target) },
            data, (uint)data.Length,
            sendFlags, 0);
    }

    /// <summary>
    /// Poll for incoming messages. Call every frame.
    /// </summary>
    public void Poll()
    {
        SteamAPI.RunCallbacks();

        IntPtr[] messages = new IntPtr[64];
        int count = SteamNetworkingMessages.ReceiveMessagesOnChannel(
            0, messages, 64);

        for (int i = 0; i < count; i++)
        {
            // Process each received message
            // SteamNetworkingMessage_t contains sender, data, size
        }
    }
}
```

**Important:** Call `SteamAPI.Init()` before creating the FNA `Game` instance. Call `SteamAPI.RunCallbacks()` every frame in `Update()`. See G26 for full Steam integration patterns.

---

## 7 — State Synchronization Patterns

### Snapshot Interpolation (Client-Server)

The server sends full or delta world state snapshots at a fixed rate (e.g., 20 Hz). Clients buffer two snapshots and interpolate between them for smooth rendering.

```csharp
/// <summary>
/// Buffers server snapshots and interpolates between the two most
/// recent ones for smooth rendering between network ticks.
/// </summary>
public class SnapshotInterpolator
{
    private WorldSnapshot? _previous;
    private WorldSnapshot? _current;
    private float _t; // Interpolation factor (0 to 1)
    private readonly float _snapshotInterval; // e.g., 1/20 = 50ms

    public SnapshotInterpolator(float serverTickRate)
    {
        _snapshotInterval = 1f / serverTickRate;
    }

    public void PushSnapshot(WorldSnapshot snapshot)
    {
        _previous = _current;
        _current = snapshot;
        _t = 0;
    }

    public void Update(float deltaTime)
    {
        _t += deltaTime / _snapshotInterval;
        _t = Math.Min(_t, 1f);
    }

    /// <summary>
    /// Get the interpolated position for an entity.
    /// Call this in Draw(), not Update().
    /// </summary>
    public Vector2 GetPosition(int entityId)
    {
        if (_previous == null || _current == null)
            return _current?.GetPosition(entityId) ?? Vector2.Zero;

        var prev = _previous.GetPosition(entityId);
        var curr = _current.GetPosition(entityId);
        return Vector2.Lerp(prev, curr, _t);
    }
}
```

### Input Forwarding (Peer-to-Peer)

Each peer sends their input to all other peers. All peers run the same deterministic simulation.

```csharp
/// <summary>
/// Collects inputs from all peers for a given frame,
/// then advances the simulation once all inputs are received.
/// </summary>
public class InputForwarder
{
    private readonly Dictionary<int, PlayerInput> _pendingInputs = new();
    private readonly int _playerCount;

    public InputForwarder(int playerCount)
    {
        _playerCount = playerCount;
    }

    public void ReceiveInput(int playerId, PlayerInput input)
    {
        _pendingInputs[playerId] = input;
    }

    /// <summary>
    /// Returns true when all players' inputs for the current
    /// frame have been received and the simulation can advance.
    /// </summary>
    public bool IsFrameReady()
    {
        return _pendingInputs.Count >= _playerCount;
    }

    public Dictionary<int, PlayerInput> ConsumeFrame()
    {
        var frame = new Dictionary<int, PlayerInput>(_pendingInputs);
        _pendingInputs.Clear();
        return frame;
    }
}
```

---

## 8 — Serialization

Network packets should be compact. Avoid JSON or XML over the wire — use binary serialization.

### LiteNetLib's NetDataWriter/Reader

```csharp
// Writing a compact player state (14 bytes instead of ~100 with JSON)
var writer = new NetDataWriter();
writer.Put(PacketTypes.WorldState);
writer.Put(player.X);        // 4 bytes (float)
writer.Put(player.Y);        // 4 bytes (float)
writer.Put(player.Health);   // 2 bytes (short)
writer.Put(player.Facing);   // 1 byte (byte: 0=left, 1=right)
writer.Put(player.AnimFrame); // 1 byte
```

### Delta Compression

Only send what changed since the last snapshot. For position updates, this means sending only entities that moved:

```csharp
public byte[] BuildDeltaSnapshot(WorldSnapshot previous, WorldSnapshot current)
{
    var writer = new NetDataWriter();
    writer.Put(PacketTypes.WorldState);

    int changeCount = 0;
    var countPos = writer.Length;
    writer.Put((ushort)0); // Placeholder for change count

    foreach (var entity in current.Entities)
    {
        if (!previous.HasEntity(entity.Id) ||
            previous.GetPosition(entity.Id) != entity.Position)
        {
            writer.Put(entity.Id);
            writer.Put(entity.Position.X);
            writer.Put(entity.Position.Y);
            changeCount++;
        }
    }

    // Patch the change count
    BitConverter.GetBytes((ushort)changeCount).CopyTo(
        writer.Data, countPos);

    return writer.CopyData();
}
```

---

## 9 — Lag Compensation and Prediction

### Client-Side Prediction

The client applies local input immediately (predicting the result) without waiting for server confirmation. When the server's authoritative state arrives, the client corrects any misprediction.

```csharp
/// <summary>
/// Client-side prediction buffer. Stores predicted states
/// so they can be reconciled with server authority.
/// </summary>
public class PredictionBuffer
{
    private readonly Queue<PredictedFrame> _buffer = new();

    public void RecordPrediction(uint tick, PlayerInput input,
        Vector2 predictedPosition)
    {
        _buffer.Enqueue(new PredictedFrame
        {
            Tick = tick,
            Input = input,
            PredictedPosition = predictedPosition
        });
    }

    /// <summary>
    /// Reconcile with server state. If the server position
    /// differs from our prediction at that tick, re-simulate
    /// from the server's authoritative position.
    /// </summary>
    public Vector2 Reconcile(uint serverTick,
        Vector2 serverPosition, float threshold = 0.5f)
    {
        // Discard predictions older than the server tick
        while (_buffer.Count > 0 && _buffer.Peek().Tick <= serverTick)
        {
            var frame = _buffer.Dequeue();
            if (frame.Tick == serverTick)
            {
                float error = Vector2.Distance(
                    frame.PredictedPosition, serverPosition);

                if (error > threshold)
                {
                    // Misprediction — snap to server position
                    // and re-apply buffered inputs
                    return ReplayFrom(serverPosition);
                }
            }
        }

        return serverPosition; // No correction needed
    }

    private Vector2 ReplayFrom(Vector2 startPosition)
    {
        // Re-simulate all buffered inputs from the corrected position
        var pos = startPosition;
        foreach (var frame in _buffer)
        {
            pos = SimulateMovement(pos, frame.Input);
        }
        return pos;
    }

    private Vector2 SimulateMovement(Vector2 pos, PlayerInput input)
    {
        // Must match the server's simulation exactly
        return pos + new Vector2(input.MoveX, input.MoveY) * 3f;
    }
}

public struct PredictedFrame
{
    public uint Tick;
    public PlayerInput Input;
    public Vector2 PredictedPosition;
}
```

---

## 10 — Common Pitfalls

**Allocating in the network loop** — Creating `new byte[]` or `new NetDataWriter()` every frame generates GC pressure. Pool writers and buffers. LiteNetLib's `NetDataWriter` can be reset and reused with `.Reset()`.

**Sending too much data** — Position updates for all entities every frame at 60 Hz will saturate bandwidth. Send at 20-30 Hz and interpolate on the client (see section 7).

**Mixing reliable and unreliable incorrectly** — Position updates should be unreliable (latest state wins; old ones are irrelevant). Game events (damage, item pickup, chat) should be reliable ordered.

**Forgetting to handle disconnects** — Players will disconnect mid-game. Handle `OnPeerDisconnected` gracefully: pause the game, remove the player, or wait for reconnection.

**Not accounting for tick rate vs frame rate** — Your game may render at 60+ FPS but send network updates at 20 Hz. Decouple the network tick from the render frame. The FNA fixed timestep helps here — `Update()` runs at a stable rate.

**Testing only on localhost** — LAN has ~0ms latency. Real games have 50-200ms. Use network condition simulation tools (e.g., `clumsy` on Windows, `tc` on Linux) to test with artificial latency and packet loss.

---

## 11 — FNA vs MonoGame: Networking Differences

| Aspect | FNA | MonoGame |
|--------|-----|----------|
| Built-in networking | None | None |
| Library compatibility | Any .NET networking lib | Same |
| NativeAOT networking | LiteNetLib works; Steamworks needs native libs | N/A (no NativeAOT path) |
| Fixed timestep | Default on (ideal for netcode) | Default on (same) |
| Platform considerations | Desktop + consoles via NativeAOT | Desktop + mobile |

There is no practical difference between FNA and MonoGame for networking. Both use external .NET libraries. The only FNA-specific consideration is NativeAOT compatibility for console builds — ensure your networking library is pure C# or that its native dependencies are available for the target platform.
