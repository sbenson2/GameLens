# G09 — Networking & Multiplayer in Stride

> **Category:** guide · **Engine:** Stride · **Related:** [G01 Getting Started](./G01_getting_started.md) · [G03 Code-Only Development](./G03_code_only_development.md) · [G02 Bepu Physics](./G02_bepu_physics.md)

How to implement multiplayer networking in a Stride game. Covers architecture choices, Stride's built-in networking primitives, integration with LiteNetLib and other C# networking libraries, state synchronization patterns, and practical examples for authoritative server and client-side prediction.

---

## Stride's Networking Landscape

Stride does not ship a full multiplayer framework out of the box. Unlike Unity (with Netcode for GameObjects) or Unreal (with built-in replication), Stride provides low-level building blocks and expects developers to integrate a networking library.

This is actually an advantage for experienced developers — you pick the networking library and architecture that fits your game rather than fighting an opinionated framework.

### Your Options

| Approach | Best For | Complexity |
|---|---|---|
| **LiteNetLib** (recommended) | Action games, real-time sync | Medium |
| **Riptide Networking** | Simpler real-time games | Low-Medium |
| **Raw UDP/TCP via System.Net** | Full control, custom protocol | High |
| **ASP.NET SignalR** | Turn-based, lobby systems | Low |
| **Steam Networking Sockets** | Steam-published games | Medium |

LiteNetLib is the most common choice in the Stride community due to its lightweight footprint, reliable UDP support, and active maintenance.

---

## Architecture: Client-Server vs Peer-to-Peer

### Authoritative Server (Recommended)

The server owns the game state. Clients send inputs; the server simulates and broadcasts results.

```
Client A  ──[inputs]──►  Server  ──[state]──►  Client A
Client B  ──[inputs]──►  Server  ──[state]──►  Client B
```

Use this for competitive games, games where cheating matters, or games with more than 2 players. The server can be a headless Stride instance (no rendering) or a separate console application.

### Peer-to-Peer (Lockstep)

All peers simulate the same game state. Each peer broadcasts its inputs to all others; simulation advances only when all inputs are received.

```
Client A  ──[inputs]──►  Client B
Client B  ──[inputs]──►  Client A
Both simulate locally
```

Use this for turn-based games, fighting games, or RTS games where deterministic simulation is feasible. Bepu Physics in Stride is deterministic with fixed timesteps, making lockstep viable for physics-heavy games.

---

## Setting Up LiteNetLib

### Installation

```bash
dotnet add package LiteNetLib
```

### Server Script

Create a Stride `AsyncScript` that runs the server loop:

```csharp
using LiteNetLib;
using LiteNetLib.Utils;
using Stride.Engine;

public class GameServer : AsyncScript
{
    private NetManager _server;
    private EventBasedNetListener _listener;

    public int Port { get; set; } = 9050;

    public override async Task Execute()
    {
        _listener = new EventBasedNetListener();
        _server = new NetManager(_listener);

        _listener.ConnectionRequestEvent += request =>
        {
            // Accept all connections (add auth logic here)
            request.AcceptIfKey("my_game_key");
        };

        _listener.PeerConnectedEvent += peer =>
        {
            Log.Info($"Client connected: {peer.Address}");
        };

        _listener.NetworkReceiveEvent += (peer, reader, channel, deliveryMethod) =>
        {
            // Process incoming player input
            ProcessClientInput(peer, reader);
            reader.Recycle();
        };

        _server.Start(Port);
        Log.Info($"Server started on port {Port}");

        // Poll for events every frame
        while (Game.IsRunning)
        {
            _server.PollEvents();
            await Script.NextFrame();
        }

        _server.Stop();
    }

    private void ProcessClientInput(NetPeer peer, NetPacketReader reader)
    {
        var inputType = reader.GetByte();
        // Deserialize and apply input to server simulation
    }
}
```

### Client Script

```csharp
using LiteNetLib;
using LiteNetLib.Utils;
using Stride.Engine;

public class GameClient : AsyncScript
{
    private NetManager _client;
    private EventBasedNetListener _listener;
    private NetPeer _serverPeer;

    public string ServerAddress { get; set; } = "localhost";
    public int ServerPort { get; set; } = 9050;

    public override async Task Execute()
    {
        _listener = new EventBasedNetListener();
        _client = new NetManager(_listener);

        _listener.PeerConnectedEvent += peer =>
        {
            _serverPeer = peer;
            Log.Info("Connected to server");
        };

        _listener.NetworkReceiveEvent += (peer, reader, channel, deliveryMethod) =>
        {
            // Process server state updates
            ApplyServerState(reader);
            reader.Recycle();
        };

        _client.Start();
        _client.Connect(ServerAddress, ServerPort, "my_game_key");

        while (Game.IsRunning)
        {
            _client.PollEvents();
            await Script.NextFrame();
        }

        _client.Stop();
    }

    public void SendInput(byte inputType, NetDataWriter data)
    {
        _serverPeer?.Send(data, DeliveryMethod.ReliableOrdered);
    }

    private void ApplyServerState(NetPacketReader reader)
    {
        // Deserialize and apply world state from server
    }
}
```

---

## Message Serialization

Use `NetDataWriter` / `NetPacketReader` from LiteNetLib for efficient binary serialization. Define message types with a byte header:

```csharp
public enum MessageType : byte
{
    PlayerInput = 1,
    WorldState = 2,
    PlayerJoined = 3,
    PlayerLeft = 4,
    ChatMessage = 5,
}

// Sending a player input message
public static void WritePlayerInput(NetDataWriter writer, Vector3 moveDir, bool jump)
{
    writer.Put((byte)MessageType.PlayerInput);
    writer.Put(moveDir.X);
    writer.Put(moveDir.Y);
    writer.Put(moveDir.Z);
    writer.Put(jump);
}

// Reading a player input message
public static (Vector3 moveDir, bool jump) ReadPlayerInput(NetPacketReader reader)
{
    // MessageType byte already consumed by dispatcher
    var x = reader.GetFloat();
    var y = reader.GetFloat();
    var z = reader.GetFloat();
    var jump = reader.GetBool();
    return (new Vector3(x, y, z), jump);
}
```

### Delivery Methods

LiteNetLib supports multiple delivery methods — choose based on the data type:

| Data | Delivery Method | Why |
|---|---|---|
| Player input | `ReliableOrdered` | Every input must arrive, in order |
| Position snapshots | `Unreliable` | Old positions are useless; latest wins |
| Chat messages | `ReliableOrdered` | Must arrive, order matters |
| Health/damage events | `ReliableUnordered` | Must arrive, order doesn't matter |
| Ping/keepalive | `Unreliable` | Loss is acceptable |

---

## State Synchronization Patterns

### Snapshot Interpolation

The server sends full world state snapshots at a fixed rate (e.g., 20 Hz). Clients buffer two snapshots and interpolate between them, producing smooth motion at any client framerate.

```csharp
public class NetworkInterpolator : SyncScript
{
    private readonly Queue<(float time, Vector3 position, Quaternion rotation)> _buffer = new();
    private const float InterpolationDelay = 0.1f; // 100ms buffer

    public void AddSnapshot(float serverTime, Vector3 pos, Quaternion rot)
    {
        _buffer.Enqueue((serverTime, pos, rot));

        // Keep buffer bounded
        while (_buffer.Count > 30)
            _buffer.Dequeue();
    }

    public override void Update()
    {
        // Render time is behind server time by InterpolationDelay
        var renderTime = GetCurrentServerTime() - InterpolationDelay;

        // Find the two snapshots that bracket renderTime
        // Interpolate position and rotation between them
        // Apply to Entity.Transform
    }
}
```

### Client-Side Prediction

For the local player, waiting for the server adds unacceptable latency. Instead, predict locally and reconcile with the server:

1. **Client** applies input immediately to its local player entity.
2. **Client** sends the input (with a sequence number) to the server.
3. **Server** simulates the input and sends back the authoritative position with the sequence number.
4. **Client** compares its predicted position at that sequence number with the server's result. If they differ beyond a threshold, snap or smoothly correct.

```csharp
// Simplified prediction reconciliation
if (Vector3.Distance(predictedPosition, serverPosition) > 0.01f)
{
    // Rewind to server state and re-simulate pending inputs
    Entity.Transform.Position = serverPosition;
    foreach (var pendingInput in unacknowledgedInputs)
    {
        ApplyInput(pendingInput);
    }
}
```

---

## Headless Server

For dedicated servers, run Stride without rendering:

```csharp
using Stride.Engine;

var game = new Game();
// Disable graphics
game.GraphicsDeviceManager.PreferredGraphicsProfile = new[] { GraphicsProfile.Level_9_1 };

game.Run(start: (Scene rootScene) =>
{
    // Server-only setup: physics, networking, AI
    // No cameras, no rendering, no audio
    var serverEntity = new Entity("Server");
    serverEntity.Add(new GameServer { Port = 9050 });
    rootScene.Entities.Add(serverEntity);
});
```

For a true headless server (no GPU at all), create a standalone console app that references `Stride.Engine` but not `Stride.Graphics`. Run the game loop manually with physics and networking only.

---

## Common Pitfalls

**Sending too much data** — Don't synchronize every entity property every frame. Use delta compression: only send values that changed since the last acknowledged snapshot. Quantize floats (e.g., positions to millimeter precision) to reduce bandwidth.

**Forgetting to handle disconnection** — Players will disconnect mid-game. Clean up their entities, notify other players, and handle reconnection gracefully. LiteNetLib's `PeerDisconnectedEvent` fires on both clean and timeout disconnections.

**Physics desync in lockstep** — Even with deterministic physics, floating-point differences across CPU architectures can cause divergence over time. Use periodic state checksums and resync if they drift.

**Blocking the game loop** — Never call blocking network operations (like DNS resolution or synchronous HTTP) in `Update()` or `Execute()`. Use `async` in `AsyncScript` for anything that might block.

**Not accounting for latency in gameplay design** — Network latency is a game design problem, not just a technical one. Design mechanics that feel good at 50-150ms of latency. Avoid instant-hit weapons without lag compensation; use projectiles or generous hit windows.

---

## Testing Multiplayer Locally

Run multiple instances of your game on the same machine:

1. Build the project: `dotnet build`
2. Start the server instance: `dotnet run -- --server`
3. Start client instances in separate terminals: `dotnet run -- --client`

Use [Clumsy](https://jagt.github.io/clumsy/) (Windows) or `tc` (Linux) to simulate latency and packet loss:

```bash
# Linux: add 100ms latency and 5% packet loss on loopback
sudo tc qdisc add dev lo root netem delay 100ms loss 5%

# Remove when done
sudo tc qdisc del dev lo root
```

---

## Checklist

- [ ] Chose networking architecture (client-server vs peer-to-peer)
- [ ] Integrated networking library (LiteNetLib recommended)
- [ ] Defined message protocol with byte-level serialization
- [ ] Implemented snapshot interpolation for remote entities
- [ ] Implemented client-side prediction for local player
- [ ] Tested with simulated latency and packet loss
- [ ] Handled disconnection and reconnection gracefully
- [ ] Profiled bandwidth usage under peak player count

---
