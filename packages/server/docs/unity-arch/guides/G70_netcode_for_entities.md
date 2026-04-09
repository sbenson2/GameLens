# G70 — Netcode for Entities: ECS Multiplayer Networking

> **Category:** guide · **Engine:** Unity 6 (6000.x, Netcode for Entities 1.4+) · **Related:** [G8 Networking (Netcode for GameObjects)](G8_networking_netcode.md) · [G13 ECS/DOTS](G13_ecs_dots.md) · [G52 ECS Core Integration](G52_ecs_core_integration_64.md) · [G42 Burst Compiler & Jobs](G42_burst_compiler_jobs_system.md)

Netcode for Entities is Unity's multiplayer framework built on the Entity Component System (ECS). It provides server-authoritative networking with client-side prediction, using **ghost snapshots** for state synchronization and **RPCs** for one-shot messages. Unlike Netcode for GameObjects (NGO), everything runs through ECS systems — data is in components, logic is in `ISystem`, and the Burst compiler optimizes serialization and prediction.

> **When to use which:** Choose **Netcode for GameObjects** (G8) for typical multiplayer games using MonoBehaviour workflows. Choose **Netcode for Entities** when your game already uses ECS/DOTS, needs high entity counts (1000+ synchronized entities), or requires deterministic simulation. NFE has a steeper learning curve but higher performance ceiling.

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                    Server World                              │
│  ┌────────────┐  ┌───────────────┐  ┌───────────────────┐  │
│  │  Simulation │  │  Ghost Send   │  │  RPC Processing   │  │
│  │  Systems    │  │  System       │  │  System           │  │
│  │  (ISystem)  │  │  (snapshots)  │  │  (commands)       │  │
│  └──────┬─────┘  └──────┬────────┘  └────────┬──────────┘  │
│         │               │                     │             │
│         ▼               ▼                     ▼             │
│  ┌─────────────────────────────────────────────────────┐    │
│  │              Unity Transport (UTP)                   │    │
│  └─────────────────────┬───────────────────────────────┘    │
└────────────────────────┼────────────────────────────────────┘
                         │  Network (UDP)
┌────────────────────────┼────────────────────────────────────┐
│                    Client World                              │
│  ┌─────────────────────┴───────────────────────────────┐    │
│  │              Unity Transport (UTP)                   │    │
│  └──────┬──────────────┬───────────────────┬───────────┘    │
│         │              │                   │                │
│  ┌──────▼─────┐  ┌─────▼──────────┐  ┌────▼────────────┐  │
│  │  Ghost     │  │  Prediction    │  │  Interpolation  │  │
│  │  Receive   │  │  Systems       │  │  Systems        │  │
│  │  System    │  │  (rollback)    │  │  (smoothing)    │  │
│  └────────────┘  └────────────────┘  └─────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

### Key Concepts

| Concept | Description |
|---|---|
| **Ghost** | A networked entity — server replicates its state to clients via snapshots |
| **Ghost Snapshot** | Serialized component data sent unreliably with delta compression |
| **Ghost Field** | A component field marked `[GhostField]` for automatic serialization |
| **RPC** | Reliable one-shot message (unlike ghosts which sync continuously) |
| **Prediction** | Client simulates ahead using local input, server corrects via rollback |
| **Interpolation** | Non-predicted entities smoothly blend between received snapshots |
| **Thin Client** | A simulated client (no rendering) for testing and load generation |

---

## Package Setup

```
Required packages (Unity Package Manager):
├── com.unity.netcode         — Netcode for Entities (1.4+)
├── com.unity.entities        — Unity ECS (1.3+)
├── com.unity.transport       — Unity Transport Protocol
├── com.unity.entities.graphics — ECS rendering (if visualizing ghosts)
└── com.unity.burst           — Burst compiler (required for serialization)
```

Install via Package Manager or `manifest.json`:

```json
{
  "dependencies": {
    "com.unity.netcode": "1.4.1",
    "com.unity.entities": "1.3.5",
    "com.unity.transport": "2.4.0"
  }
}
```

---

## Ghost Components: Defining Networked Data

A **ghost** is an entity with at least one component containing `[GhostField]` attributes. The Netcode source generator creates serialization code at compile time — no runtime reflection.

### Basic Ghost Component

```csharp
using Unity.Entities;
using Unity.NetCode;
using Unity.Mathematics;

/// <summary>
/// A synchronized health component. The server owns the authoritative value;
/// clients receive updates via ghost snapshots.
///
/// [GhostField] marks fields for automatic serialization.
/// Fields WITHOUT [GhostField] are local-only (not sent over the network).
/// </summary>
public struct Health : IComponentData
{
    // Synchronized — sent to all clients
    [GhostField]
    public int Current;

    [GhostField]
    public int Max;

    // NOT synchronized — exists only on this machine
    // Useful for client-side visual state, timers, etc.
    public float LastDamageTime;
}
```

### GhostField Options

```csharp
using Unity.Entities;
using Unity.NetCode;
using Unity.Mathematics;

/// <summary>
/// Demonstrates GhostField options for fine-tuned synchronization.
/// </summary>
public struct MovementState : IComponentData
{
    // Quantization: float → int conversion for bandwidth savings
    // Value of 1000 means 3 decimal places of precision
    // (e.g., 1.234f is stored as 1234 and reconstructed on receive)
    [GhostField(Quantization = 1000)]
    public float3 Position;

    // Smoothing: how clients handle corrections between snapshots
    // Interpolate — blend between last two snapshots (smooth, slight delay)
    // InterpolateAndExtrapolate — also predicts forward (less delay, potential overshoot)
    [GhostField(Quantization = 1000, Smoothing = SmoothingAction.Interpolate)]
    public float3 Velocity;

    // Rotation with interpolation for smooth visual rotation
    [GhostField(Quantization = 1000, Smoothing = SmoothingAction.InterpolateAndExtrapolate)]
    public quaternion Rotation;

    // MaxSmoothingDistance: if the correction is larger than this,
    // snap instead of interpolating (prevents weird slow slides after teleport)
    [GhostField(Quantization = 100, MaxSmoothingDistance = 10f)]
    public float3 AimDirection;

    // SendData=false: field exists in the struct but is never serialized
    // Useful for local bookkeeping that shares the component layout
    [GhostField(SendData = false)]
    public int LocalPredictionTick;
}
```

### GhostComponent Attribute (Component-Level Settings)

```csharp
using Unity.Entities;
using Unity.NetCode;
using Unity.Mathematics;

/// <summary>
/// Component-level networking configuration via [GhostComponent].
///
/// PrefabType: which ghost types include this component
///   - All (default), Server, InterpolatedClient, PredictedClient, AllPredicted
///
/// SendTypeOptimization: which clients receive this data
///   - AllClients, OnlyInterpolatedClients, OnlyPredictedClients
///
/// SendDataForChildEntity: whether child entities get this component's data
/// </summary>
[GhostComponent(
    PrefabType = GhostPrefabType.All,
    SendTypeOptimization = GhostSendType.OnlyPredictedClients,
    SendDataForChildEntity = false
)]
public struct PlayerInput : IComponentData
{
    [GhostField]
    public float3 MoveDirection;

    [GhostField]
    public bool FirePressed;
}
```

### SendToOwner Control

```csharp
using Unity.Entities;
using Unity.NetCode;

/// <summary>
/// Controls whether the owning client receives this component's data.
///
/// SendToOwner options:
///   SendToOwner — only the owning client gets this data
///   SendToNonOwner — everyone EXCEPT the owner (avoid redundant self-data)
///   All — everyone gets it (default)
/// </summary>
[GhostComponent(SendToOwner = SendToOwner.SendToNonOwner)]
public struct VisualEffectState : IComponentData
{
    [GhostField]
    public int CurrentAnimation;

    [GhostField]
    public float AnimationProgress;
}
```

---

## Dynamic Buffers (Synchronized Lists)

Ghost synchronization also works with `IBufferElementData` for variable-length data:

```csharp
using Unity.Entities;
using Unity.NetCode;
using Unity.Mathematics;

/// <summary>
/// Synchronized inventory buffer — each element is a slot.
/// The server manages the authoritative list; clients receive updates.
/// </summary>
public struct InventorySlot : IBufferElementData
{
    [GhostField]
    public int ItemId;

    [GhostField(Quantization = 100)]
    public float Durability;

    [GhostField]
    public int StackCount;

    // Local-only — not sent
    [GhostField(SendData = false)]
    public bool IsNew;
}
```

---

## Input Handling with IInputComponentData

Netcode for Entities has a dedicated input system that buffers inputs per tick for prediction and server reconciliation:

```csharp
using Unity.Entities;
using Unity.NetCode;
using Unity.Mathematics;

/// <summary>
/// Player input component — sent from client to server each tick.
/// IInputComponentData automatically handles:
///   - Input buffering for prediction rollback
///   - Reliable delivery to the server
///   - Tick alignment between client and server
/// </summary>
public struct PlayerInputData : IInputComponentData
{
    // Movement input (normalized direction from player's controller)
    [GhostField]
    public float2 Move;

    // Action buttons — packed as simple flags
    [GhostField]
    public bool Jump;

    [GhostField]
    public bool Fire;

    [GhostField]
    public bool Interact;
}
```

### Input Collection System

```csharp
using Unity.Entities;
using Unity.NetCode;
using Unity.Mathematics;
using UnityEngine;

/// <summary>
/// Runs on the client to collect input from Unity's Input System
/// and write it into the ECS input component each tick.
///
/// [UpdateInGroup(GhostInputSystemGroup)] ensures this runs at
/// the correct point in the Netcode tick — after transport receive,
/// before prediction simulation.
/// </summary>
[UpdateInGroup(typeof(GhostInputSystemGroup))]
public partial struct PlayerInputCollectionSystem : ISystem
{
    public void OnUpdate(ref SystemState state)
    {
        // Only collect input on the client (not the server)
        // The server receives input via the network automatically
        foreach (var input in
            SystemAPI.Query<RefRW<PlayerInputData>>()
                .WithAll<GhostOwnerIsLocal>())
        {
            // Read from Unity's Input System (or legacy Input)
            var moveInput = new float2(
                Input.GetAxisRaw("Horizontal"),
                Input.GetAxisRaw("Vertical")
            );

            input.ValueRW.Move = moveInput;
            input.ValueRW.Jump = Input.GetKey(KeyCode.Space);
            input.ValueRW.Fire = Input.GetMouseButton(0);
            input.ValueRW.Interact = Input.GetKey(KeyCode.E);
        }
    }
}
```

---

## RPCs: One-Shot Messages

RPCs are for events that don't fit continuous synchronization — chat messages, game state transitions, ability activations. They're sent reliably (unlike ghost snapshots).

### Defining an RPC

```csharp
using Unity.Entities;
using Unity.NetCode;
using Unity.Collections;
using Unity.Burst;

/// <summary>
/// RPC sent from client to server to request joining the game.
/// IRpcCommand structs are automatically handled by the Netcode RPC system.
///
/// The struct is serialized, sent over the network, and deserialized
/// as an entity with the RPC component — an ISystem processes it.
/// </summary>
public struct GoInGameRpc : IRpcCommand
{
    // Player's chosen display name (FixedString for Burst compatibility)
    public FixedString64Bytes PlayerName;
}

/// <summary>
/// RPC sent from server to all clients when a player scores.
/// </summary>
public struct ScoreUpdateRpc : IRpcCommand
{
    public int ScoringPlayerId;
    public int NewScore;
    public FixedString32Bytes ScorerName;
}
```

### Sending an RPC

```csharp
using Unity.Entities;
using Unity.NetCode;
using Unity.Collections;

/// <summary>
/// System that sends the GoInGame RPC when the client connects.
/// Runs once — after sending, the RPC entity is consumed and destroyed.
/// </summary>
[WorldSystemFilter(WorldSystemFilterFlags.ClientSimulation)]
public partial struct GoInGameClientSystem : ISystem
{
    public void OnUpdate(ref SystemState state)
    {
        var ecb = new EntityCommandBuffer(Allocator.Temp);

        // Find connections that haven't gone in-game yet
        foreach (var (connection, entity) in
            SystemAPI.Query<RefRO<NetworkId>>()
                .WithNone<NetworkStreamInGame>()
                .WithEntityAccess())
        {
            // Mark this connection as in-game (prevents re-sending)
            ecb.AddComponent<NetworkStreamInGame>(entity);

            // Create an RPC entity — the Netcode transport sends it automatically
            var rpcEntity = ecb.CreateEntity();
            ecb.AddComponent(rpcEntity, new GoInGameRpc
            {
                PlayerName = "Player"
            });
            // SendRpcCommandRequest tells Netcode which connection to send on
            ecb.AddComponent(rpcEntity, new SendRpcCommandRequest
            {
                TargetConnection = entity
            });
        }

        ecb.Playback(state.EntityManager);
        ecb.Dispose();
    }
}
```

### Receiving an RPC

```csharp
using Unity.Entities;
using Unity.NetCode;
using Unity.Collections;

/// <summary>
/// Server system that processes incoming GoInGame RPCs.
/// When a client sends GoInGameRpc, the server spawns their player entity.
/// </summary>
[WorldSystemFilter(WorldSystemFilterFlags.ServerSimulation)]
public partial struct GoInGameServerSystem : ISystem
{
    public void OnUpdate(ref SystemState state)
    {
        var ecb = new EntityCommandBuffer(Allocator.Temp);

        // Query for received RPCs — each arrives as an entity with the RPC component
        // ReceiveRpcCommandRequest contains the source connection entity
        foreach (var (rpc, source, entity) in
            SystemAPI.Query<RefRO<GoInGameRpc>, RefRO<ReceiveRpcCommandRequest>>()
                .WithEntityAccess())
        {
            // Mark the connection as in-game on the server side
            ecb.AddComponent<NetworkStreamInGame>(source.ValueRO.SourceConnection);

            // Spawn the player ghost (prefab must be registered as a ghost)
            // The ghost system will automatically replicate it to all clients
            // ... spawn logic here ...

            // Destroy the RPC entity — it's been processed
            ecb.DestroyEntity(entity);
        }

        ecb.Playback(state.EntityManager);
        ecb.Dispose();
    }
}
```

---

## RPCs vs Ghosts: When to Use Each

| Scenario | Use Ghost | Use RPC |
|---|---|---|
| Player position / movement | ✅ Continuous sync | ❌ |
| Health bar updates | ✅ Continuous sync | ❌ |
| Chat messages | ❌ | ✅ One-shot reliable |
| "Game Over" notification | ❌ | ✅ One-shot reliable |
| Ability activation (with cooldown state) | ✅ Ghost for cooldown | ✅ RPC for trigger |
| Leaderboard scores | Either works | ✅ RPC if infrequent |

**Key difference:** Ghost data is sent **unreliably** with delta compression and eventual consistency. RPCs are sent **reliably** — guaranteed delivery but no compression. Use ghosts for state that changes every tick, RPCs for events.

---

## Ghost Variants

Customize how built-in components (like `LocalTransform`) are synchronized without modifying the original:

```csharp
using Unity.Entities;
using Unity.NetCode;
using Unity.Mathematics;
using Unity.Transforms;

/// <summary>
/// Custom variant for 2D games — only syncs X/Y position and Z rotation.
/// Saves bandwidth by skipping Z position and XY rotation.
/// Apply this variant to 2D ghost prefabs via DefaultVariantSystem.
/// </summary>
[GhostComponentVariation(typeof(LocalTransform), "Transform - 2D")]
[GhostComponent(
    PrefabType = GhostPrefabType.All,
    SendTypeOptimization = GhostSendType.AllClients
)]
public struct Transform2DVariant
{
    [GhostField(
        Quantization = 1000,
        Smoothing = SmoothingAction.InterpolateAndExtrapolate,
        SubType = GhostFieldSubType.Translation2D
    )]
    public float3 Position;

    [GhostField(
        Quantization = 1000,
        Smoothing = SmoothingAction.InterpolateAndExtrapolate,
        SubType = GhostFieldSubType.Rotation2D
    )]
    public quaternion Rotation;
}

/// <summary>
/// Register the 2D variant as the default for LocalTransform.
/// This applies to all ghost prefabs unless overridden per-prefab.
/// </summary>
sealed partial class DefaultVariantSystem : DefaultVariantSystemBase
{
    protected override void RegisterDefaultVariants(
        Dictionary<ComponentType, Rule> defaultVariants)
    {
        defaultVariants.Add(
            typeof(LocalTransform),
            Rule.OnlyParents(typeof(Transform2DVariant))
        );
    }
}
```

---

## Ghost Optimization

### Relevancy (Interest Management)

Not every client needs every ghost. Use ghost relevancy to limit which ghosts are sent to which connections:

```csharp
using Unity.Entities;
using Unity.NetCode;
using Unity.Mathematics;

/// <summary>
/// Only sends ghosts within a radius of each player.
/// Reduces bandwidth for large open-world games.
/// Runs on the server to filter ghost snapshots per connection.
/// </summary>
[WorldSystemFilter(WorldSystemFilterFlags.ServerSimulation)]
[UpdateInGroup(typeof(GhostSimulationSystemGroup))]
public partial struct GhostRelevancySystem : ISystem
{
    public void OnUpdate(ref SystemState state)
    {
        // Access the relevancy set — server uses this to decide what to send
        var ghostRelevancy = SystemAPI.GetSingletonRW<GhostRelevancy>();

        // Set the mode — entities not in the set are NOT sent
        ghostRelevancy.ValueRW.GhostRelevancyMode = GhostRelevancyMode.SetIsRelevant;

        // Clear previous frame's set
        ghostRelevancy.ValueRW.DefaultRelevancyQuery = default;

        // Add relevant ghosts per connection
        // (simplified — real implementation queries spatial data)
        // ghostRelevancy.ValueRW.RelevantGhostForConnection.Add(
        //     new RelevantGhostForConnection(connectionId, ghostId));
    }
}
```

### Importance Scaling

Prioritize which ghosts get bandwidth when the network is constrained:

```csharp
using Unity.Entities;
using Unity.NetCode;

/// <summary>
/// Tag component to mark high-priority ghosts (players, bosses).
/// The GhostSendSystem uses importance to decide send order
/// when bandwidth is limited.
/// </summary>
public struct HighPriorityGhost : IComponentData { }
```

Configure importance scaling in the ghost authoring component in the Inspector — higher values mean the ghost gets sent more frequently when bandwidth is limited.

---

## World Setup: Server, Client, and Thin Clients

Netcode for Entities creates separate ECS Worlds for server and client:

```
Runtime Worlds
──────────────────────────
Server World       — runs simulation, owns authoritative state
Client World       — runs prediction, renders, collects input
Thin Client World  — simulated client (no rendering) for load testing
```

Systems use `[WorldSystemFilter]` to target specific worlds:

```csharp
// Only runs on the server
[WorldSystemFilter(WorldSystemFilterFlags.ServerSimulation)]
public partial struct ServerOnlySystem : ISystem { ... }

// Only runs on the client
[WorldSystemFilter(WorldSystemFilterFlags.ClientSimulation)]
public partial struct ClientOnlySystem : ISystem { ... }

// Runs on both (prediction systems, shared gameplay logic)
[WorldSystemFilter(WorldSystemFilterFlags.ClientSimulation |
                   WorldSystemFilterFlags.ServerSimulation)]
public partial struct SharedGameplaySystem : ISystem { ... }
```

---

## Host Migration (Experimental)

As of Netcode for Entities 1.4+ (Unity 6), **host migration** is available as an experimental feature. This allows a client to take over as host when the original host disconnects — critical for peer-to-peer games without dedicated servers.

> **Status:** Experimental package. API may change. Not recommended for production without extensive testing.

---

## Common Pitfalls

1. **Forgetting `GoInGame` RPC** — Clients must send a `GoInGame` RPC before the server starts synchronizing ghosts. Without it, the client connects but sees nothing.

2. **Ghost prefab not registered** — Ghost prefabs must be in a SubScene and have a `GhostAuthoringComponent`. Prefabs spawned from code need `GhostPrefabCollectionComponent`.

3. **Prediction vs. Interpolation confusion** — Predicted ghosts run simulation locally (responsive but complex). Interpolated ghosts just blend snapshots (simple but delayed). Player-controlled entities should be predicted; other players can be interpolated.

4. **Burst compatibility** — All synchronized components must be unmanaged (`struct`, no reference types). `FixedString` instead of `string`, `NativeArray` instead of `List<T>`.

5. **System ordering** — Input collection must run in `GhostInputSystemGroup`. Prediction systems must run in `PredictedSimulationSystemGroup`. Getting the order wrong causes jitter or desync.

6. **Quantization too low** — Quantization of 1 on a float gives integer precision. For positions, use 100–1000. For rotations, use 1000+. Too-low quantization causes visible snapping.

---

## Performance Comparison: NGO vs NFE

| Metric | Netcode for GameObjects | Netcode for Entities |
|---|---|---|
| Max synchronized entities | ~200–500 | 1000–10,000+ |
| Serialization | Reflection-based | Source-generated + Burst |
| Memory layout | Scattered (heap) | Contiguous (chunks) |
| Prediction model | NetworkTransform | Full rollback + resim |
| Learning curve | Moderate | Steep (requires ECS knowledge) |
| Best for | Typical multiplayer games | Large-scale / competitive / simulation |
