# G74 — Multiplayer State Synchronization


> **Category:** Guide · **Related:** [G9 Networking](./G9_networking.md) · [G15 Game Loop](./G15_game_loop.md) · [G69 Save/Load & Serialization](./G69_save_load_serialization.md) · [G71 Spatial Partitioning](./G71_spatial_partitioning.md)

> **Stack:** MonoGame · Arch ECS · LiteNetLib · C#

State synchronization is the hard problem of multiplayer games. You have 60 physics simulations running in parallel — one on the server, dozens on clients. They disagree. The server is truth. The client must predict smoothly and reconcile when wrong. This guide covers the architecture and patterns used by production multiplayer games.

---

## Table of Contents

1. [Design Philosophy](#1--design-philosophy)
2. [Network Architecture Components](#2--network-architecture-components)
3. [State Snapshot System](#3--state-snapshot-system)
4. [Client-Side Prediction](#4--client-side-prediction)
5. [Server Reconciliation](#5--server-reconciliation)
6. [Entity Interpolation](#6--entity-interpolation)
7. [Lag Compensation](#7--lag-compensation)
8. [Interest Management](#8--interest-management)
9. [Bandwidth Optimization](#9--bandwidth-optimization)
10. [Clock Synchronization](#10--clock-synchronization)
11. [Networked Physics](#11--networked-physics)
12. [ECS Replication Pipeline](#12--ecs-replication-pipeline)
13. [Common Pitfalls](#13--common-pitfalls)
14. [Testing & Debugging](#14--testing--debugging)

---

## 1 — Design Philosophy

### Authority Models

The architecture hinges on **authority** — which simulation is correct?

| Model | Server Role | Client Role | Best For |
|-------|-----------|-----------|----------|
| **Server-Authoritative** | Owns all entity state, simulates all physics | Predicts own character, receives updates for others | Competitive PvP, physics-critical |
| **Peer-to-Peer** | Each peer owns their avatar and nearby entities | Simulates their owner, replicates to others | Cooperative games, smaller player counts |
| **Hybrid** | Server validates critical state; clients simulate rest | Predicts movement, server reconciles shots/hits | Most modern games — balances responsiveness + fairness |

**Recommendation:** Start with **server-authoritative** for a 2D game. It's simpler to reason about, prevents cheating, and scales to many players. If latency becomes painful, implement client-side prediction + server reconciliation.

### Why Server Authority Wins

1. **Single source of truth** — No consensus overhead, no rollback cascade
2. **Cheat prevention** — Players can't modify their score or position locally and have it stick
3. **Determinism not required** — The server can use non-deterministic physics (float errors matter less)
4. **Scales** — Adding players doesn't add O(n²) sync overhead

### The Latency Problem

On a 100ms round-trip, the player sees their character move after 100ms delay. Unplayable. Solution: **client-side prediction** — simulate the player's own input immediately, tell the server, let the server correct you.

---

## 2 — Network Architecture Components

### 2.1 Core Components

```csharp
using Arch.Core;
using Arch.Core.Extensions;

// Every networked entity needs a unique identifier across server and clients
public record struct NetworkId(uint Id);

// Who owns this entity? Players own their avatar; server owns NPCs and shared objects
public record struct NetworkOwner(int PlayerId);

// Should this entity be replicated to this client? Used for interest culling
public record struct ReplicationScope(HashSet<int> VisibleToPlayers);

// How important is this entity? Affects update frequency (see bandwidth optimization)
public record struct ReplicationPriority(float Weight = 1f);

// Track if this component changed since last sync
public record struct Dirty(bool IsDirty = false);

// The tick number when this state was established
public record struct ServerTick(uint Tick);

// Position, velocity, and other replicated properties
public record struct Position(Vector2 Value);
public record struct Velocity(Vector2 Value);
public record struct Rotation(float Radians);
public record struct InputState(byte Buttons, Vector2 Stick); // Quantized for bandwidth
```

### 2.2 Authority and Ownership

```csharp
// Marks an entity as locally owned (by the player running this client)
public record struct LocallyOwned;

// Marks an entity as owned by the server (not predicted locally)
public record struct ServerOwned;

// For client-side prediction: we simulate this locally and expect server corrections
public record struct PredictedLocally;

// What was the last input we sent for this entity?
public record struct LastInputSent(InputState Input, uint Tick);

// What was the last server state we received for this entity?
public record struct LastServerState(Position Pos, Velocity Vel, uint Tick);
```

---

## 3 — State Snapshot System

A **snapshot** captures the world state at a single server tick. Sending the entire world is expensive. Instead, snapshots contain only changed entities.

### 3.1 Snapshot Structure

```csharp
public struct GameSnapshot
{
    public uint Tick;
    public float ServerTime;
    public List<EntitySnapshot> Entities; // Only entities visible to this player
}

public struct EntitySnapshot
{
    public uint NetworkId;
    public Position Position;
    public Velocity Velocity;
    public Rotation Rotation;
    public InputState LastInput;     // What did the server see for this entity's input?
    public ushort ChangeMask;        // Bit flags: which components changed?
}
```

### 3.2 Change Detection via Dirty Flags

```csharp
// In your move system, mark components as dirty when they change
[Query]
[MethodImpl(MethodImplOptions.AggressiveInlining)]
public static void ApplyInputToEntity(
    in Entity entity,
    ref Position position,
    ref Velocity velocity,
    in InputState input,
    in Dirty dirty)
{
    // Old position
    var oldPos = position.Value;
    
    // Apply input
    position.Value += input.Stick * 200f * DeltaTime; // simplified
    
    // Mark as dirty if it changed (only send if changed)
    if (Math.Abs((oldPos - position.Value).LengthSquared()) > 0.01f)
    {
        // The Dirty component is marked, but we can't modify it in a read-only query.
        // Use a separate "mark dirty" system that runs after movement.
        entity.Set(new Dirty(true));
    }
}

// Separate system that detects changes and sets Dirty flag
[Query]
[MethodImpl(MethodImplOptions.AggressiveInlining)]
public static void DetectChanges(
    in Entity entity,
    in Position pos,
    in Velocity vel)
{
    // Compare against cached LastServerState
    if (entity.TryGet<LastServerState>(out var last))
    {
        bool changed = !ApproxEqual(pos.Value, last.Pos.Value, 0.1f) ||
                       !ApproxEqual(vel.Value, last.Vel.Value, 0.1f);
        if (changed)
            entity.Set(new Dirty(true));
    }
}

private static bool ApproxEqual(Vector2 a, Vector2 b, float tolerance) =>
    Vector2.DistanceSquared(a, b) < tolerance * tolerance;
```

### 3.3 Snapshot Ring Buffer

Keep a history of snapshots for server-side rewind (used in lag compensation). A ring buffer of 32 snapshots at 60 Hz is ~500ms of history — enough for most latencies.

```csharp
public class SnapshotBuffer
{
    private readonly GameSnapshot[] _snapshots;
    private int _writeIndex;
    public uint LatestTick { get; private set; }

    public SnapshotBuffer(int capacity = 32)
    {
        _snapshots = new GameSnapshot[capacity];
    }

    public void AddSnapshot(GameSnapshot snapshot)
    {
        _snapshots[_writeIndex] = snapshot;
        _writeIndex = (_writeIndex + 1) % _snapshots.Length;
        LatestTick = snapshot.Tick;
    }

    // Get a snapshot from history (or null if too old)
    public GameSnapshot? GetSnapshot(uint tick)
    {
        // Find snapshot with this tick
        foreach (var snap in _snapshots)
        {
            if (snap.Tick == tick) return snap;
        }
        return null;
    }
}
```

---

## 4 — Client-Side Prediction

The player presses a button. The client immediately simulates the result. Meanwhile, it tells the server. When the server responds, the client checks: did the server agree? If yes, great. If no, correct course.

### 4.1 Input Buffering and Command Pattern

```csharp
// Represent an input as a command — we can replay these
public record struct InputCommand
{
    public uint LocalTick;          // Tick on the client when input was generated
    public uint ServerTick;         // What server tick was this input relative to?
    public InputState Input;
    public bool Acknowledged;       // Has the server acknowledged this input?
}

public class PredictionEngine
{
    private readonly List<InputCommand> _pendingInputs = new();
    private uint _predictedTick;
    private World _predictedWorld;
    
    public void BufferInput(InputState input, uint predictedTick, uint serverTick)
    {
        _pendingInputs.Add(new InputCommand
        {
            LocalTick = predictedTick,
            ServerTick = serverTick,
            Input = input,
            Acknowledged = false
        });
    }

    // Simulate the world forward using buffered inputs
    public void Predict(float deltaTime)
    {
        // Apply the oldest unacknowledged input
        if (_pendingInputs.Count > 0)
        {
            var cmd = _pendingInputs[0];
            if (!cmd.Acknowledged)
            {
                // Simulate one step with this input
                // (Your move system applies the input)
                _predictedWorld.Query().
                    // Apply movement
            }
        }
    }

    // Server acknowledged this input; remove it from pending
    public void AcknowledgeInput(uint localTick)
    {
        _pendingInputs.RemoveAll(cmd => cmd.LocalTick <= localTick);
    }
}
```

### 4.2 Sending Inputs to Server

```csharp
public class InputSender
{
    private readonly GameClient _client;
    private uint _sentInputTick;
    
    public void SendInput(InputState input, uint clientTick, uint serverTick)
    {
        var writer = new NetDataWriter();
        writer.Put((byte)ClientPacketType.PlayerInput);
        writer.Put(clientTick);          // So server can ACK this exact input
        writer.Put(serverTick);          // What server tick is this relative to?
        writer.Put(input.Buttons);
        writer.Put(input.Stick.X);
        writer.Put(input.Stick.Y);
        
        _client.Send(writer, DeliveryMethod.Unreliable); // Don't care if one is lost
        _sentInputTick = clientTick;
    }
}
```

---

## 5 — Server Reconciliation

When the server responds with a state snapshot, the client compares its prediction to the server's truth. If they disagree, rewind and resimulate.

### 5.1 Reconciliation on State Mismatch

```csharp
public class ReconciliationEngine
{
    private readonly World _predictedWorld;
    private readonly PredictionEngine _predictor;
    private uint _lastReconciliedTick;

    public void OnServerSnapshot(GameSnapshot snapshot)
    {
        // 1. Find the entity in predicted world
        // 2. Compare position, velocity to what server says
        // 3. If mismatch > threshold, rewind and resimulate

        foreach (var entitySnap in snapshot.Entities)
        {
            var entity = FindEntityByNetworkId(entitySnap.NetworkId);
            if (!entity.IsAlive) continue;

            if (!entity.TryGet<Position>(out var predPos)) continue;
            if (!entity.TryGet<Velocity>(out var predVel)) continue;

            // Check mismatch
            float posDist = Vector2.Distance(predPos.Value, entitySnap.Position.Value);
            float velDist = Vector2.Distance(predVel.Value, entitySnap.Velocity.Value);

            const float POS_THRESHOLD = 5f;  // pixels
            const float VEL_THRESHOLD = 10f; // pixels/sec

            if (posDist > POS_THRESHOLD || velDist > VEL_THRESHOLD)
            {
                // Mismatch! Rewind to the snapshot and resimulate
                Rewind(snapshot.Tick);
                Resimulate(snapshot.Tick);
            }

            _lastReconciliedTick = snapshot.Tick;
        }
    }

    private void Rewind(uint toTick)
    {
        // Restore all entity states to what they were at toTick
        // This requires keeping a history of positions, velocities, etc.
        foreach (var entity in _worldHistory[toTick])
        {
            entity.Set(entity.GetComponent<Position>());
            entity.Set(entity.GetComponent<Velocity>());
            // ... etc
        }
    }

    private void Resimulate(uint fromTick)
    {
        // Replay all buffered inputs from fromTick onward
        var inputs = _predictor._pendingInputs
            .Where(cmd => cmd.ServerTick >= fromTick)
            .OrderBy(cmd => cmd.ServerTick)
            .ToList();

        foreach (var cmd in inputs)
        {
            // Run one move step with this input
            // _world.Query()...ApplyInput()
        }
    }
}
```

### 5.2 World State History

To rewind, you need history. A simple approach:

```csharp
public class WorldStateHistory
{
    private readonly Dictionary<uint, Dictionary<uint, EntityState>> _history = new();
    private uint _oldestTick;

    public void RecordState(uint tick, World world)
    {
        if (!_history.ContainsKey(tick))
            _history[tick] = new();

        var states = _history[tick];
        
        // Snapshot all networked entities
        world.Query<in NetworkId, in Position, in Velocity>()
            .Run((in NetworkId id, in Position pos, in Velocity vel) =>
            {
                states[id.Id] = new EntityState 
                { 
                    Position = pos.Value, 
                    Velocity = vel.Value 
                };
            });

        // Prune history older than 500ms
        var cutoff = tick - 30; // at 60 Hz
        foreach (var oldTick in _history.Keys.Where(t => t < cutoff).ToList())
            _history.Remove(oldTick);
    }

    public EntityState? GetEntityState(uint tick, uint networkId)
    {
        if (_history.TryGetValue(tick, out var states) &&
            states.TryGetValue(networkId, out var state))
            return state;
        return null;
    }
}

public record struct EntityState
{
    public Vector2 Position;
    public Vector2 Velocity;
}
```

---

## 6 — Entity Interpolation

Remote players' positions update in discrete snapshots (e.g., every 100ms). Rendering them at snapshot positions looks jittery. **Interpolation** smooths between snapshots.

### 6.1 Interpolation Buffer

```csharp
public record struct InterpolationTarget
{
    public Vector2 TargetPosition;
    public float TargetRotation;
    public uint TargetTick;
    public float InterpolationAlpha;  // 0..1 between frames
}

// On client, when receiving a server snapshot, queue the position as an interpolation target
public void QueueInterpolation(GameSnapshot snapshot)
{
    foreach (var entitySnap in snapshot.Entities)
    {
        var entity = FindEntityByNetworkId(entitySnap.NetworkId);
        if (!entity.IsAlive) continue;

        // Don't interpolate the locally owned player
        if (entity.Has<LocallyOwned>())
            continue;

        entity.Set(new InterpolationTarget
        {
            TargetPosition = entitySnap.Position.Value,
            TargetRotation = entitySnap.Rotation.Radians,
            TargetTick = snapshot.Tick,
            InterpolationAlpha = 0f
        });
    }
}

// Every frame, advance interpolation alpha and blend between current and target
[Query]
public static void InterpolatePositions(
    ref Position position,
    ref Rotation rotation,
    ref InterpolationTarget target,
    in Entity entity)
{
    // Advance alpha (assuming snapshots arrive ~100ms apart, display ticks ~16ms)
    target.InterpolationAlpha += DeltaTime / 0.1f; // 100ms snapshot interval
    target.InterpolationAlpha = Math.Min(target.InterpolationAlpha, 1f);

    // Blend from current to target
    position.Value = Vector2.Lerp(position.Value, target.TargetPosition, target.InterpolationAlpha);
    rotation.Radians = Lerp(rotation.Radians, target.TargetRotation, target.InterpolationAlpha);

    // When we hit 100% interpolation, wait for next snapshot
    if (target.InterpolationAlpha >= 1f)
    {
        target.InterpolationAlpha = 0f;
        // Next snapshot will update TargetPosition
    }
}

private static float Lerp(float a, float b, float t) => a + (b - a) * t;
```

---

## 7 — Lag Compensation

Server receives input from a high-latency player. By the time the input arrives, 100ms have passed. The server has already moved other players. Should the slow player's action (e.g., a shot) be evaluated at the **send time** or the **receive time**?

### 7.1 Server-Side Rewind

For fair hit detection, rewind to when the client sent the input, check if they hit anything, then fast-forward back to now.

```csharp
public class LagCompensationEngine
{
    private readonly SnapshotBuffer _snapshotHistory;
    private uint _currentTick;

    public bool WasHitAt(
        uint shooterNetworkId,
        Vector2 shotOrigin,
        Vector2 shotDirection,
        uint inputTick,      // When the client sent the shot
        uint currentTick)    // What tick is it now?
    {
        // How old is this input?
        int latencyTicks = (int)(currentTick - inputTick);
        if (latencyTicks < 0 || latencyTicks > 120) // > 2s is probably fake
            return false;

        // Get snapshot from when input was sent
        var snapshot = _snapshotHistory.GetSnapshot(inputTick);
        if (snapshot == null) return false;

        // Find targets in that historical snapshot
        foreach (var targetSnap in snapshot.Entities)
        {
            if (targetSnap.NetworkId == shooterNetworkId) continue; // Can't hit self

            // Get the entity's position at the time of the shot
            float distance = Vector2.Distance(shotOrigin, targetSnap.Position.Value);
            if (distance > 1000f) continue; // Out of range

            // Simple raycast check
            if (IsInLineOfFire(shotOrigin, shotDirection, targetSnap.Position.Value))
                return true;
        }

        return false;
    }

    private bool IsInLineOfFire(Vector2 origin, Vector2 direction, Vector2 targetPos)
    {
        // Project target onto ray
        Vector2 toTarget = targetPos - origin;
        float proj = Vector2.Dot(toTarget, direction);
        if (proj < 0f) return false; // Behind the shooter

        // Distance from ray to target
        Vector2 closest = origin + direction * proj;
        float dist = Vector2.Distance(closest, targetPos);
        return dist < 20f; // Hit radius
    }
}
```

### 7.2 Alternate: Advantage and Disadvantage

Lag compensation is fair but feels strange to high-latency players. **Alternative:** give the advantage to **low-latency** players. They shoot and see the hit instantly. High-latency players suffer but don't feel ripped off. This is the design choice for competitive games like CS:GO (sort of — they use a hybrid).

---

## 8 — Interest Management

A 64-player game can't replicate all 64 entities to all 64 clients. Instead, only send entities that are **relevant** to each client.

### 8.1 Area of Interest (AoI)

```csharp
// Use spatial partitioning (see G71) to find nearby entities
public class InterestManager
{
    private readonly SpatialGrid _grid;

    public HashSet<uint> GetVisibleNetworkIds(Vector2 playerPos, float areaRadius = 2000f)
    {
        var visible = new HashSet<uint>();
        var nearby = _grid.QueryCircle(playerPos, areaRadius);
        
        foreach (var entity in nearby)
        {
            if (entity.TryGet<NetworkId>(out var id))
                visible.Add(id.Id);
        }
        
        return visible;
    }

    // When building snapshots, only include entities in the AoI
    public void FilterSnapshotForPlayer(
        GameSnapshot snapshot,
        int playerId,
        Vector2 playerPos,
        float areaRadius)
    {
        var visibleIds = GetVisibleNetworkIds(playerPos, areaRadius);
        
        snapshot.Entities = snapshot.Entities
            .Where(e => visibleIds.Contains(e.NetworkId))
            .ToList();
    }
}
```

### 8.2 Dynamic Interest Set Changes

When entities enter/exit the AoI:

```csharp
public class RelevanceTracker
{
    private readonly Dictionary<int, HashSet<uint>> _playerVisibility = new();

    public void UpdateRelevance(int playerId, Vector2 playerPos, float areaRadius)
    {
        var visibleNow = GetVisibleNetworkIds(playerPos, areaRadius);
        
        if (!_playerVisibility.ContainsKey(playerId))
            _playerVisibility[playerId] = new();
        
        var wasBefore = _playerVisibility[playerId];
        
        // What entered?
        var entered = visibleNow.Except(wasBefore);
        // What left?
        var left = wasBefore.Except(visibleNow);
        
        // Send "entity appeared" / "entity disappeared" events
        foreach (var id in entered)
            BroadcastEvent(playerId, new EntitySpawned { NetworkId = id });
        
        foreach (var id in left)
            BroadcastEvent(playerId, new EntityDespawned { NetworkId = id });
        
        _playerVisibility[playerId] = visibleNow;
    }
}
```

---

## 9 — Bandwidth Optimization

Sending full snapshots to 32 players every frame explodes bandwidth. Optimizations are crucial.

### 9.1 Quantization

Store floats as integers. Reduces from 4 bytes to 2 bytes per coordinate.

```csharp
public class QuantizationHelper
{
    private const float POSITION_SCALE = 0.1f;  // 1 unit of float = 10cm
    private const float ROTATION_SCALE = 0.01f; // Sub-degree precision

    public static short QuantizePosition(float value)
    {
        return (short)(value / POSITION_SCALE);
    }

    public static float DequantizePosition(short value)
    {
        return value * POSITION_SCALE;
    }

    public static byte QuantizeRotation(float radians)
    {
        // 0..255 maps to 0..2π
        return (byte)((radians / MathF.PI / 2f) * 255f);
    }

    public static float DequantizeRotation(byte value)
    {
        return (value / 255f) * MathF.PI * 2f;
    }

    // Quantize input stick (typically -1..1 on X and Y)
    public static byte QuantizeStick(Vector2 stick)
    {
        byte x = (byte)((stick.X + 1f) * 127.5f); // 0..255
        byte y = (byte)((stick.Y + 1f) * 127.5f);
        return (byte)((x << 4) | y); // Pack into single byte (loses precision but OK for input)
    }
}
```

### 9.2 Variable-Rate Updates

High-priority entities (nearby enemies) update frequently. Low-priority entities (distant NPCs) update rarely.

```csharp
public class UpdateScheduler
{
    private readonly Dictionary<uint, uint> _lastUpdateTick = new();

    public bool ShouldUpdateEntity(uint networkId, Vector2 entityPos, Vector2 playerPos, uint currentTick)
    {
        float distance = Vector2.Distance(entityPos, playerPos);
        
        // Update frequency based on distance
        int updateFrequency = distance switch
        {
            < 500f  => 1,    // Every tick
            < 1000f => 2,    // Every other tick
            < 2000f => 4,    // Every 4 ticks
            _       => 0     // Don't update
        };

        if (updateFrequency == 0) return false;

        if (!_lastUpdateTick.ContainsKey(networkId))
            _lastUpdateTick[networkId] = currentTick;

        int ticksSince = (int)(currentTick - _lastUpdateTick[networkId]);
        if (ticksSince >= updateFrequency)
        {
            _lastUpdateTick[networkId] = currentTick;
            return true;
        }

        return false;
    }
}
```

### 9.3 Priority Accumulator

Instead of a fixed update rate, accumulate priority. When it exceeds a threshold, send an update.

```csharp
public record struct PriorityAccumulator
{
    public float Accumulated;
    public uint LastUpdateTick;
}

[Query]
public static void AccumulatePriority(
    ref PriorityAccumulator accum,
    in ReplicationPriority priority,
    in Position position,
    in Vector2 playerPos) // Passed as a parameter to the system
{
    float distance = Vector2.Distance(position.Value, playerPos);
    float distanceFactor = 1f / (1f + distance / 500f); // Closer = higher priority
    
    accum.Accumulated += priority.Weight * distanceFactor;
    
    const float THRESHOLD = 1.0f;
    if (accum.Accumulated >= THRESHOLD)
    {
        // Send update and reset
        accum.Accumulated = 0f;
        accum.LastUpdateTick = CurrentTick;
    }
}
```

---

## 10 — Clock Synchronization

Clients and server have different clocks. Without synchronization, timestamps don't match. Use NTP-lite to estimate server time and round-trip delay.

### 10.1 RTT Estimation

```csharp
public class ClockSync
{
    private uint _pendingPingTick;
    private float _estimatedRtt;
    private float _estimatedOneWayDelay;
    public uint ServerTime { get; private set; }

    public void SendPing(uint clientTick)
    {
        var writer = new NetDataWriter();
        writer.Put((byte)ClientPacketType.Ping);
        writer.Put(clientTick);
        _client.Send(writer, DeliveryMethod.Unreliable);
        _pendingPingTick = clientTick;
    }

    public void OnPong(uint clientTick, uint serverTick)
    {
        // How long did the round trip take?
        uint elapsedTicks = clientTick - _pendingPingTick;
        _estimatedRtt = elapsedTicks / 60f; // Convert to seconds at 60 Hz

        // One-way delay is half the round trip
        _estimatedOneWayDelay = _estimatedRtt / 2f;

        // Update our estimate of server time
        // Server sent `serverTick` when their time was ServerTime.
        // We received it `_estimatedOneWayDelay` seconds later.
        // So their time is now `ServerTime + _estimatedOneWayDelay`.
        ServerTime = serverTick + (uint)(_estimatedOneWayDelay * 60f);
    }

    public uint GetLocalTickAtServerTime(uint targetServerTick)
    {
        // Given a server tick, when will that happen locally (accounting for delay)?
        return (uint)(targetServerTick + _estimatedOneWayDelay * 60f);
    }
}
```

### 10.2 Client-Side Tick Counting

```csharp
public class ClientGameLoop
{
    private uint _clientTick;
    private uint _serverTick;
    private readonly ClockSync _clockSync;

    public void Update(float deltaTime)
    {
        _clientTick++;
        
        // Use server's time for snapshot timing
        _serverTick = _clockSync.ServerTime;

        // Periodically ping to refresh RTT estimate
        if (_clientTick % 600 == 0) // Every 10 seconds at 60 Hz
            _clockSync.SendPing(_clientTick);
    }
}
```

---

## 11 — Networked Physics

Physics replication is tricky. Two choices:

### 11.1 Non-Deterministic (Server-Authoritative)

The server runs physics. Clients just interpolate positions. Simple, fair, but clients see slightly old data.

```csharp
// Server-side: simulate everything
[Query]
public static void ServerPhysicsStep(
    ref Position position,
    ref Velocity velocity,
    in Mass mass,
    in ServerOwned _)
{
    // Apply gravity
    velocity.Value.Y += 980f * DeltaTime;
    
    // Collision detection and response (simplified)
    if (position.Value.Y > 600f) // Ground
    {
        position.Value.Y = 600f;
        velocity.Value.Y = 0f;
    }
    
    // Update position
    position.Value += velocity.Value * DeltaTime;
}

// Client-side: don't simulate owned physics, just interpolate
// (Owned by server, so we only render what server sends us)
```

### 11.2 Deterministic (Peer-Authoritative)

Clients and server run identical physics. Both simulate, but server's result is truth. Requires:
- **Deterministic floating-point math** (hard!)
- **Same input handling** (every client applies the same gravity, friction, etc.)
- **Replay on mismatch** (if prediction diverges, resimulate)

```csharp
// Deterministic integration using Fixed32 (from FixedMath.Net) instead of float
using FixedMath;

[Query]
public static void DeterministicPhysicsStep(
    ref Position position,
    ref Velocity velocity,
    in Mass mass)
{
    const Fixed32 GRAVITY = (Fixed32)980f;
    
    // All operations use Fixed32 to ensure determinism
    velocity.Value.Y += GRAVITY * DeltaTime;
    position.Value += velocity.Value * DeltaTime;
}
```

**Reality check:** Deterministic physics is hard. Use server-authoritative physics first. Only go deterministic if latency matters so much that interpolation isn't enough.

---

## 12 — ECS Replication Pipeline

How do Arch ECS components flow from server to clients?

### 12.1 Marking Components for Replication

```csharp
// Tag a component as replicated
[AttributeUsage(AttributeTargets.Struct)]
public class ReplicatedAttribute : Attribute { }

[Replicated]
public record struct Position(Vector2 Value);

[Replicated]
public record struct Velocity(Vector2 Value);

// This one is NOT replicated (local-only)
public record struct DebugColor(Vector4 Color);
```

### 12.2 Serialization and Deserialization

```csharp
public static class ComponentSerializer
{
    public static void SerializeEntity(
        Entity entity,
        NetDataWriter writer,
        uint changeMask)
    {
        // Only serialize components whose bit is set in changeMask
        if ((changeMask & (1 << 0)) != 0 && entity.TryGet<Position>(out var pos))
        {
            writer.Put(QuantizePosition(pos.Value.X));
            writer.Put(QuantizePosition(pos.Value.Y));
        }

        if ((changeMask & (1 << 1)) != 0 && entity.TryGet<Velocity>(out var vel))
        {
            writer.Put(QuantizePosition(vel.Value.X));
            writer.Put(QuantizePosition(vel.Value.Y));
        }
    }

    public static void DeserializeEntity(
        Entity entity,
        NetPacketReader reader,
        uint changeMask)
    {
        if ((changeMask & (1 << 0)) != 0)
        {
            var x = DequantizePosition(reader.GetShort());
            var y = DequantizePosition(reader.GetShort());
            entity.Set(new Position(new Vector2(x, y)));
        }

        if ((changeMask & (1 << 1)) != 0)
        {
            var x = DequantizePosition(reader.GetShort());
            var y = DequantizePosition(reader.GetShort());
            entity.Set(new Velocity(new Vector2(x, y)));
        }
    }
}
```

### 12.3 Snapshot Building Pipeline

```csharp
public class SnapshotBuilder
{
    public GameSnapshot BuildSnapshot(
        World world,
        uint tick,
        int viewingPlayerId,
        Vector2 viewerPos,
        float areaRadius)
    {
        var snapshot = new GameSnapshot
        {
            Tick = tick,
            ServerTime = tick / 60f,
            Entities = new List<EntitySnapshot>()
        };

        // Find all networked entities in AoI
        var visibleIds = _interestManager.GetVisibleNetworkIds(viewerPos, areaRadius);

        world.Query<in NetworkId, in Position, in Velocity, in Rotation>()
            .Run((in NetworkId id, in Position pos, in Velocity vel, in Rotation rot) =>
            {
                if (!visibleIds.Contains(id.Id)) return;

                // Compute change mask (which components changed since last send?)
                uint changeMask = ComputeChangeMask(id.Id);

                snapshot.Entities.Add(new EntitySnapshot
                {
                    NetworkId = id.Id,
                    Position = pos,
                    Velocity = vel,
                    Rotation = rot,
                    ChangeMask = (ushort)changeMask
                });
            });

        return snapshot;
    }

    private uint ComputeChangeMask(uint networkId)
    {
        if (!_lastSentState.TryGetValue(networkId, out var last))
            return 0xFFFF; // First send, send everything

        // Check which components changed
        uint mask = 0;
        // (This requires comparing against last sent state)
        // For simplicity, we send all in this example
        return 0xFFFF;
    }
}
```

---

## 13 — Common Pitfalls

### 13.1 Floating-Point Determinism

Floats aren't deterministic across platforms and compiler optimizations. `a + b + c` might not equal `(a + b) + c`.

**Solution:** Use fixed-point math (via `FixedMath.NET`) or quantize early and often.

### 13.2 Entity Spawn Order

Two clients spawn entities in different orders. Network IDs diverge. Disaster.

**Solution:** Server assigns all network IDs. Clients never spawn entities with their own IDs — they wait for server authority.

### 13.3 Feedback Loops from Reconciliation

Client predicts A → Server says B → Client reconciles to B → Client re-predicts C → Server says D... The corrections never settle.

**Solution:** 
- Don't resimulate too aggressively. Only if mismatch > threshold.
- Use **gating**: don't send the next input until the last one is acknowledged.
- Increase confidence in your prediction; don't correct on every tiny delta.

### 13.4 Bandwidth Spikes on Player Join

New player joins. Server sends full world state. Everyone's bandwidth spikes. Disconnections cascade.

**Solution:** 
- Cap snapshot size per player. Spread large states across multiple packets.
- Use progressive loading: send visible entities first, then distant ones.
- Don't send historical snapshots — new players only see current state.

### 13.5 Cheating via Input Manipulation

Client says "I shot at position X" but they could say any position.

**Solution:** 
- Never trust client input for critical events.
- Server validates: does the input make sense? Is position within expected range from last known position?
- For shots: server-side lag compensation handles this. Client can't cheat the timestamp.

---

## 14 — Testing & Debugging

### 14.1 Simulating Latency and Packet Loss

```csharp
public class NetworkSimulator : INetEventListener
{
    private readonly GameServer _actualServer;
    private readonly Random _random = new();
    private int _latencyMs = 50;
    private float _packetLossRate = 0.05f; // 5% loss

    public void OnNetworkReceive(NetPeer peer, NetPacketReader reader,
        byte channelNumber, DeliveryMethod deliveryMethod)
    {
        // Simulate packet loss
        if (_random.NextSingle() < _packetLossRate)
            return; // Drop packet

        // Simulate latency by queuing delivery
        var delayed = new DelayedPacket
        {
            Reader = reader,
            DeliveryTime = DateTime.UtcNow.AddMilliseconds(_latencyMs),
            Peer = peer,
            ChannelNumber = channelNumber,
            DeliveryMethod = deliveryMethod
        };
        _delayedPackets.Enqueue(delayed);
    }

    public void Update()
    {
        var now = DateTime.UtcNow;
        while (_delayedPackets.Count > 0)
        {
            var packet = _delayedPackets.Peek();
            if (packet.DeliveryTime <= now)
            {
                _delayedPackets.Dequeue();
                _actualServer.OnNetworkReceive(packet.Peer, packet.Reader,
                    packet.ChannelNumber, packet.DeliveryMethod);
            }
            else
                break;
        }
    }
}
```

### 14.2 Network Visualization Overlay

```csharp
public class NetworkDebugOverlay
{
    private readonly SpriteBatch _batch;

    public void Draw(GraphicsDevice device, Vector2 cameraPos)
    {
        _batch.Begin();
        
        var y = 10f;
        _batch.DrawString(_font, $"Ping: {_client.Ping}ms", new Vector2(10, y), Color.White);
        y += 20;
        
        _batch.DrawString(_font, $"Server Tick: {_client.ServerTick}", new Vector2(10, y), Color.White);
        y += 20;
        
        _batch.DrawString(_font, 
            $"Predicted Entities: {_predictedWorld.EntityCount}", 
            new Vector2(10, y), Color.Yellow);
        y += 20;

        // Draw reconciliation errors in red for this frame
        foreach (var error in _reconciliationErrors)
        {
            var worldPos = error.Position + cameraPos;
            _batch.Draw(_pixelTexture, worldPos, null, Color.Red * 0.5f, 0f,
                Vector2.Zero, new Vector2(20), SpriteEffects.None, 0f);
        }
        
        _batch.End();
    }
}
```

### 14.3 Determinism Verification

```csharp
public class DeterminismChecker
{
    public void VerifyReplayedStateMatches(World original, World replayed, uint tick)
    {
        var query = original.QueryDescription.WithAll<Position, Velocity>();
        
        original.Query(query)
            .Run((in Entity entity, in Position pos, in Velocity vel) =>
            {
                if (replayed.TryGetEntity(entity.Id, out var replayedEnt) &&
                    replayedEnt.TryGet<Position>(out var replayedPos) &&
                    replayedEnt.TryGet<Velocity>(out var replayedVel))
                {
                    if (!ApproxEqual(pos.Value, replayedPos.Value, 0.01f))
                    {
                        Console.WriteLine($"DIVERGENCE at tick {tick}: " +
                            $"original={pos.Value}, replayed={replayedPos.Value}");
                    }
                }
            });
    }

    private bool ApproxEqual(Vector2 a, Vector2 b, float tolerance) =>
        Vector2.DistanceSquared(a, b) < tolerance * tolerance;
}
```

---

## Further Reading

- **Networking Gems** — "An Introduction to Multiplayer Game Programming" (GDC talks)
- **Gaffer on Games** — Glenn Fiedler's articles on determinism, lag compensation, and prediction
- **Overwatch Gameplay Architecture** — GDC 2016 talk on client prediction and reconciliation
- **Quake III Networking Model** — Historical reference; still relevant
- [G9 Networking](./G9_networking.md) — LiteNetLib integration
- [G71 Spatial Partitioning](./G71_spatial_partitioning.md) — For interest management (AoI)
- [G69 Save/Load & Serialization](./G69_save_load_serialization.md) — Component serialization patterns
