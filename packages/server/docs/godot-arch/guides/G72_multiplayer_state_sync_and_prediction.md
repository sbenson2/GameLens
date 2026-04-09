# G72 — Multiplayer State Synchronization & Client Prediction

> **Category:** Guide · **Engine:** Godot 4.4+ · **Language:** GDScript / C#
> **Related:** [G13 Networking & Multiplayer](./G13_networking_and_multiplayer.md) · [G27 Dedicated Servers & Advanced Networking](./G27_dedicated_servers_advanced_networking.md) · [G43 Rollback Netcode](./G43_rollback_netcode.md) · [G64 Character Controller Patterns](./G64_character_controller_patterns.md)

---

## What This Guide Covers

Godot 4.x provides `MultiplayerSynchronizer` and `MultiplayerSpawner` as high-level replication nodes, but using them effectively — especially for responsive gameplay over real networks with latency — requires understanding authority models, synchronization strategies, client-side prediction, and reconciliation. This guide covers practical patterns for building multiplayer games that feel responsive at 50–200ms ping.

**Use this guide when:** you're building an action game or real-time multiplayer experience and need smooth movement, authoritative server state, client prediction, or efficient property replication.

**G13** covers basic multiplayer setup (ENet, WebSocket, RPC). **G27** covers dedicated server architecture. **G43** covers rollback netcode for fighting/precision games. This guide sits between G13 and G43 — it covers the state synchronization layer that most real-time multiplayer games need.

---

## Table of Contents

1. [Authority Models](#1-authority-models)
2. [MultiplayerSynchronizer Deep Dive](#2-multiplayersynchronizer-deep-dive)
3. [MultiplayerSpawner Patterns](#3-multiplayerspawner-patterns)
4. [Client-Side Prediction](#4-client-side-prediction)
5. [Server Reconciliation](#5-server-reconciliation)
6. [Entity Interpolation](#6-entity-interpolation)
7. [Input Synchronization](#7-input-synchronization)
8. [Visibility and Interest Management](#8-visibility-and-interest-management)
9. [Delta Compression and Bandwidth](#9-delta-compression-and-bandwidth)
10. [Common Architectures](#10-common-architectures)
11. [Debugging Multiplayer State](#11-debugging-multiplayer-state)
12. [Common Mistakes](#12-common-mistakes)
13. [C# Examples](#13-c-examples)

---

## 1. Authority Models

Every multiplayer game must answer: **who owns the truth for each piece of state?**

### Server-Authoritative (Recommended)

The server is the single source of truth. Clients send inputs, the server simulates, and clients receive results.

```
Client A ──[inputs]──▶ Server ──[state]──▶ Client A
Client B ──[inputs]──▶ Server ──[state]──▶ Client B
```

**Pros:** Cheat-resistant, consistent state across all clients.
**Cons:** Latency between input and visible result; requires prediction for responsiveness.

### Client-Authoritative (Simple but Exploitable)

Each client owns its own character state and broadcasts it directly.

```
Client A ──[my position]──▶ Server ──[relay]──▶ Client B
```

**Pros:** Zero-latency for local player, simple to implement.
**Cons:** Trivially exploitable (teleport hacks, speed hacks). Only suitable for cooperative or trusted environments.

### Hybrid Authority

Different systems have different authority. The server owns gameplay-critical state (health, scoring, item pickups), but clients own cosmetic or less-critical state (animation blend, camera angle).

```gdscript
# Common hybrid pattern in Godot:
# - Server: authority over CharacterBody3D position
# - Client: authority over input node (transfers authority)
# - Server: authority over health, inventory
# - Client: authority over visual-only nodes (particles, camera)
```

### Setting Authority in Godot

```gdscript
# Transfer authority of the input node to the owning peer
func _ready() -> void:
    # Called on all peers. $InputSync is a child node.
    $InputSync.set_multiplayer_authority(str(name).to_int())
    # The character body itself stays server-authoritative (default: peer 1)
```

---

## 2. MultiplayerSynchronizer Deep Dive

`MultiplayerSynchronizer` replicates properties from the authority peer to all other peers automatically.

### Configuration

```
CharacterBody3D (name = "1" for peer 1)
├── MultiplayerSynchronizer
│   └── Replication Config:
│       ├── position → Always (replicate every interval)
│       ├── velocity → Always
│       ├── rotation.y → Always
│       ├── health → On Change (only when value changes)
│       └── player_name → On Change
├── CollisionShape3D
├── MeshInstance3D
└── InputSynchronizer (separate node, authority = owning peer)
    └── MultiplayerSynchronizer
        └── Replication Config:
            ├── input_direction → Always
            └── jump_pressed → Always
```

### Replication Modes

| Mode | When Sent | Best For |
|------|-----------|----------|
| **Always** | Every replication interval | Position, velocity, rotation — anything that changes continuously |
| **On Change** | Only when the value differs | Health, score, state enums, names — infrequent updates |

### Replication Interval

```gdscript
# Default is ~0.0 (every physics frame). Increase to reduce bandwidth:
$MultiplayerSynchronizer.replication_interval = 0.05  # 20 updates/sec
```

**Guidelines:**
- **Fast-paced shooter:** 0.03–0.05s (20–33 Hz)
- **MOBA/RTS:** 0.05–0.1s (10–20 Hz)
- **Turn-based with real-time elements:** 0.1–0.2s (5–10 Hz)

### Spawn Synchronization

Properties set before `_ready()` completes are included in the spawn packet. Set initial state early:

```gdscript
func _ready() -> void:
    if multiplayer.is_server():
        health = max_health
        position = spawn_points[peer_id]
        # These values are sent to all peers in the spawn message
```

---

## 3. MultiplayerSpawner Patterns

`MultiplayerSpawner` handles automatic scene replication — when the server adds a node, clients instantiate the matching scene.

### Setup

```
World (Node3D)
├── MultiplayerSpawner
│   ├── spawn_path: "../Players"
│   └── auto_spawn_list: [res://scenes/player.tscn, res://scenes/projectile.tscn]
└── Players (Node3D)
    └── (spawned characters appear here)
```

### Server-Side Spawning

```gdscript
# On server only
func spawn_player(peer_id: int) -> void:
    var player: CharacterBody3D = preload("res://scenes/player.tscn").instantiate()
    player.name = str(peer_id)  # Name must be unique
    $Players.add_child(player)
    # MultiplayerSpawner automatically replicates to all clients

func spawn_projectile(origin: Vector3, direction: Vector3) -> void:
    var proj: Node3D = preload("res://scenes/projectile.tscn").instantiate()
    proj.name = "proj_%d" % _next_proj_id
    _next_proj_id += 1
    proj.position = origin
    proj.direction = direction
    $Projectiles.add_child(proj)
```

### Custom Spawn Functions

For complex spawn data that doesn't fit in synchronized properties:

```gdscript
func _ready() -> void:
    $MultiplayerSpawner.spawn_function = _custom_spawn

func _custom_spawn(data: Variant) -> Node:
    var info: Dictionary = data as Dictionary
    var scene: PackedScene = load(info["scene_path"])
    var node: Node3D = scene.instantiate()
    node.name = info["name"]
    node.position = info["position"]
    node.set_meta("team", info["team"])
    return node
```

---

## 4. Client-Side Prediction

The core problem: if the server is authoritative and latency is 100ms round-trip, the player's character won't move until 100ms after pressing a key. Client-side prediction solves this.

### How It Works

1. Client presses a movement key
2. Client **immediately** simulates the movement locally (prediction)
3. Client sends the input to the server with a **sequence number**
4. Server processes the input, calculates authoritative state
5. Server sends state back with the sequence number
6. Client compares predicted state to server state and corrects if needed

### Implementation Pattern

```gdscript
class_name PredictedCharacter
extends CharacterBody3D

# Input buffer for reconciliation
var _input_history: Array[Dictionary] = []
var _input_sequence: int = 0

# Server-confirmed state
var _server_position: Vector3
var _server_sequence: int = -1

@export var speed: float = 5.0

func _physics_process(delta: float) -> void:
    if is_multiplayer_authority():
        _process_local_player(delta)
    else:
        _process_remote_player(delta)

func _process_local_player(delta: float) -> void:
    # 1. Capture input
    var input_dir := Input.get_vector("move_left", "move_right", "move_up", "move_down")
    _input_sequence += 1
    
    # 2. Store input for later reconciliation
    _input_history.append({
        "sequence": _input_sequence,
        "direction": input_dir,
        "delta": delta,
    })
    
    # 3. Predict locally (apply movement immediately)
    velocity = Vector3(input_dir.x, 0, input_dir.y) * speed
    move_and_slide()
    
    # 4. Send input to server
    _send_input_to_server.rpc_id(1, _input_sequence, input_dir, delta)
    
    # 5. Trim old history (keep last 1 second worth)
    while _input_history.size() > 60:
        _input_history.pop_front()

@rpc("any_peer", "unreliable_ordered", "call_remote")
func _send_input_to_server(sequence: int, direction: Vector2, delta: float) -> void:
    if not multiplayer.is_server():
        return
    
    var sender_id: int = multiplayer.get_remote_sender_id()
    # Server applies the input authoritatively
    velocity = Vector3(direction.x, 0, direction.y) * speed
    move_and_slide()
    
    # Send authoritative state back to the client
    _receive_server_state.rpc_id(sender_id, sequence, position)

@rpc("authority", "unreliable_ordered", "call_remote")
func _receive_server_state(sequence: int, server_pos: Vector3) -> void:
    _server_position = server_pos
    _server_sequence = sequence
    _reconcile()
```

---

## 5. Server Reconciliation

When the client receives server state, it checks whether its prediction was correct. If not, it "replays" unacknowledged inputs on top of the server state.

```gdscript
func _reconcile() -> void:
    # Remove inputs the server has already processed
    while _input_history.size() > 0 and _input_history[0]["sequence"] <= _server_sequence:
        _input_history.pop_front()
    
    # Check prediction error
    var error: float = position.distance_to(_server_position)
    
    if error < 0.1:
        # Prediction was close enough — no correction needed
        return
    
    if error > 5.0:
        # Huge desync — snap to server position (teleport)
        position = _server_position
        return
    
    # Moderate error — replay unacknowledged inputs from server state
    position = _server_position
    for input_record in _input_history:
        var dir: Vector2 = input_record["direction"]
        velocity = Vector3(dir.x, 0, dir.y) * speed
        move_and_slide()
```

### Smoothing Corrections

Snapping to the corrected position looks jarring. Smooth it:

```gdscript
var _visual_position: Vector3
var _correction_offset: Vector3

func _reconcile() -> void:
    # ... (same logic as above)
    
    # Instead of snapping, calculate offset and smooth it
    var old_position := position
    position = _server_position
    # Replay inputs...
    for input_record in _input_history:
        var dir: Vector2 = input_record["direction"]
        velocity = Vector3(dir.x, 0, dir.y) * speed
        move_and_slide()
    
    _correction_offset = old_position - position

func _process(delta: float) -> void:
    # Smoothly reduce the correction offset
    _correction_offset = _correction_offset.lerp(Vector3.ZERO, 10.0 * delta)
    
    # Visual node position = physics position + remaining correction
    $Model.position = _correction_offset
```

---

## 6. Entity Interpolation

For **other players** (entities you don't control), you receive position updates at the replication rate (e.g., 20 Hz) but need to render at 60 Hz. Interpolation fills the gaps.

### Snapshot Buffer

```gdscript
class_name InterpolatedRemote
extends Node3D

## Stores recent state snapshots from the server
var _snapshots: Array[Dictionary] = []
var _interpolation_delay: float = 0.1  # 100ms delay for smooth playback

func receive_state(timestamp: float, pos: Vector3, rot: float) -> void:
    _snapshots.append({
        "time": timestamp,
        "position": pos,
        "rotation": rot,
    })
    # Keep last 1 second of snapshots
    while _snapshots.size() > 30:
        _snapshots.pop_front()

func _process(delta: float) -> void:
    if _snapshots.size() < 2:
        return
    
    # Render in the past by interpolation_delay
    var render_time: float = _get_server_time() - _interpolation_delay
    
    # Find the two snapshots that bracket render_time
    var from: Dictionary = _snapshots[0]
    var to: Dictionary = _snapshots[1]
    
    for i in range(_snapshots.size() - 1):
        if _snapshots[i + 1]["time"] >= render_time:
            from = _snapshots[i]
            to = _snapshots[i + 1]
            break
    
    # Interpolate between snapshots
    var time_range: float = to["time"] - from["time"]
    if time_range <= 0.0:
        return
    
    var t: float = clampf((render_time - from["time"]) / time_range, 0.0, 1.0)
    position = from["position"].lerp(to["position"], t)
    rotation.y = lerp_angle(from["rotation"], to["rotation"], t)

func _get_server_time() -> float:
    # In practice, sync this with the server's clock
    return Time.get_unix_time_from_system()
```

### Why Render in the Past?

By rendering other players' state 100ms behind "now," you always have two snapshots to interpolate between. Without this delay, you'd need to **extrapolate** (guess future positions), which causes rubber-banding when predictions are wrong.

---

## 7. Input Synchronization

### Dedicated Input Node Pattern

Separate input capture from character logic. Give each player's input node authority to the owning peer:

```gdscript
# input_sync.gd — attached to InputSync node
class_name InputSync
extends Node

@export var input_direction: Vector2 = Vector2.ZERO
@export var jump_pressed: bool = false
@export var shoot_pressed: bool = false

func _physics_process(_delta: float) -> void:
    if not is_multiplayer_authority():
        return  # Only the owning peer captures input
    
    input_direction = Input.get_vector("move_left", "move_right", "move_up", "move_down")
    jump_pressed = Input.is_action_just_pressed("jump")
    shoot_pressed = Input.is_action_just_pressed("shoot")
```

The `MultiplayerSynchronizer` on this node replicates `input_direction`, `jump_pressed`, and `shoot_pressed` to the server. The server reads these values to drive the character:

```gdscript
# player.gd — CharacterBody3D, server-authoritative
func _physics_process(delta: float) -> void:
    if not multiplayer.is_server():
        return
    
    var input: InputSync = $InputSync
    velocity.x = input.input_direction.x * speed
    velocity.z = input.input_direction.y * speed
    
    if input.jump_pressed and is_on_floor():
        velocity.y = jump_force
    
    velocity.y -= gravity * delta
    move_and_slide()
```

### Input Reliability

| Channel | Use For |
|---------|---------|
| `unreliable_ordered` | Movement input — latest value matters, not every value |
| `reliable` | One-shot actions (use item, interact, chat message) |

---

## 8. Visibility and Interest Management

Don't send state for entities the player can't see or doesn't care about.

### MultiplayerSynchronizer Visibility

```gdscript
func _ready() -> void:
    # Filter visibility per-peer
    $MultiplayerSynchronizer.add_visibility_filter(_visibility_check)

func _visibility_check(peer_id: int) -> bool:
    var peer_player := _get_player_by_id(peer_id)
    if not peer_player:
        return false
    
    # Only sync if within 50 meters
    return global_position.distance_to(peer_player.global_position) < 50.0
```

### Per-Peer Visibility

```gdscript
# Explicitly control visibility per peer
$MultiplayerSynchronizer.set_visibility_for(peer_id, false)  # Hide from this peer

# After the peer moves into range:
$MultiplayerSynchronizer.set_visibility_for(peer_id, true)

# Force a visibility re-evaluation
$MultiplayerSynchronizer.update_visibility(peer_id)
```

### Area-Based Interest Zones

```gdscript
# Use Area3D nodes as interest zones
func _on_interest_zone_body_entered(body: Node3D) -> void:
    if body.has_node("MultiplayerSynchronizer"):
        body.get_node("MultiplayerSynchronizer").set_visibility_for(
            multiplayer.get_unique_id(), true)
```

---

## 9. Delta Compression and Bandwidth

### Bandwidth Budget

| Game Type | Budget Per Client | Update Rate |
|-----------|-------------------|-------------|
| Fast-paced shooter | 20–40 KB/s | 20–30 Hz |
| MOBA | 10–20 KB/s | 10–20 Hz |
| MMO (visible area) | 30–60 KB/s | 5–15 Hz |

### Reducing Bandwidth

```gdscript
# 1. Use On Change mode for infrequent properties
# 2. Reduce replication interval where acceptable
$MultiplayerSynchronizer.replication_interval = 0.05  # 20 Hz instead of 60

# 3. Quantize values before sync
# Instead of syncing full Vector3 (12 bytes), sync compressed:
var _sync_position: Vector3i  # 12 bytes as ints, but you control precision

func _physics_process(_delta: float) -> void:
    if multiplayer.is_server():
        # Quantize to centimeter precision
        _sync_position = Vector3i(
            roundi(position.x * 100),
            roundi(position.y * 100),
            roundi(position.z * 100)
        )

# 4. Use visibility filtering (Section 8) to skip irrelevant entities
```

### Godot 4.6 Delta Patching

Godot 4.6 introduced delta patching for exports, which reduces update download sizes. For runtime multiplayer, the `MultiplayerSynchronizer` already uses delta encoding internally — it only sends properties that changed since the last acknowledged update.

---

## 10. Common Architectures

### Architecture A: Simple Co-op (Client-Authoritative)

```
Host (Server + Client)
├── Owns world state
├── Owns own character (authoritative)
└── Trusts peer character state

Peer (Client)
├── Owns own character (authoritative)
└── Receives world state from host
```

**Best for:** Co-op games, local network games, trusted environments. **Implementation:** Default `MultiplayerSynchronizer` with per-peer authority.

### Architecture B: Competitive Action (Server-Authoritative + Prediction)

```
Dedicated Server
├── Owns ALL game state
├── Receives inputs from all clients
├── Simulates authoritatively
└── Sends state to clients

Clients
├── Send input to server
├── Predict local character (Section 4)
├── Interpolate remote characters (Section 6)
└── Reconcile on server correction (Section 5)
```

**Best for:** Competitive FPS, battle royale, fighting games over networks.

### Architecture C: MMO-Lite (Server-Authoritative + Interest Management)

```
Server
├── Full world simulation
├── Interest management (Section 8)
├── Only sends relevant state per client
└── Handles hundreds of entities

Clients
├── Only know about nearby entities
├── Interpolate all remote entities
└── Minimal prediction (movement only)
```

**Best for:** Open-world multiplayer, MMO-lite games with many players.

---

## 11. Debugging Multiplayer State

### Built-In Multiplayer Debugger

Godot's editor includes a multiplayer profiler (Debugger → Multiplayer):

- **Replication graph** — which properties are syncing and how often
- **Bandwidth usage** — bytes/sec per peer
- **RPC calls** — frequency and size

### Debug Overlay

```gdscript
# Add to your player scene for development
func _process(_delta: float) -> void:
    if not OS.is_debug_build():
        return
    
    $DebugLabel.text = "Auth: %d | Pos: %s | Vel: %s | Ping: %dms" % [
        get_multiplayer_authority(),
        str(position).substr(0, 20),
        str(velocity).substr(0, 20),
        _get_ping_ms(),
    ]

# Visualize prediction error
func _draw_prediction_debug() -> void:
    if _server_position != Vector3.ZERO:
        DebugDraw3D.draw_sphere(_server_position, 0.2, Color.RED)    # Server
        DebugDraw3D.draw_sphere(position, 0.2, Color.GREEN)          # Predicted
```

### Simulating Latency

Test with artificial latency to catch issues before deployment:

```gdscript
# Add artificial delay to RPCs for testing
var _artificial_latency_ms: int = 100

func _send_with_latency(callable: Callable) -> void:
    if _artificial_latency_ms > 0 and OS.is_debug_build():
        await get_tree().create_timer(
            float(_artificial_latency_ms) / 1000.0).timeout
    callable.call()
```

---

## 12. Common Mistakes

### Everyone Moves Everyone

**Cause:** `_physics_process` moves the character on all peers, not just the authority.

**Fix:** Guard simulation with authority checks:

```gdscript
func _physics_process(delta: float) -> void:
    if not multiplayer.is_server():
        return  # Only server simulates
```

### Desync After Alt-Tab

**Cause:** Client delta time spikes when the window loses focus, causing a burst of inputs.

**Fix:** Cap delta time for physics inputs:

```gdscript
var clamped_delta: float = minf(delta, 0.05)  # Cap at 50ms
```

### RPC Spam Crashes Server

**Cause:** Sending RPCs every frame without rate limiting.

**Fix:** Use `MultiplayerSynchronizer` for continuous state (it handles rate limiting). Reserve RPCs for one-shot events.

### Authority Not Transferred

**Cause:** Forgetting to call `set_multiplayer_authority()` on the input node.

**Fix:** Always transfer authority in `_ready()` for peer-owned nodes:

```gdscript
func _ready() -> void:
    $InputSync.set_multiplayer_authority(name.to_int())
```

---

## 13. C# Examples

### Server-Authoritative Character

```csharp
using Godot;

public partial class NetworkedPlayer : CharacterBody3D
{
    [Export] public float Speed { get; set; } = 5.0f;
    [Export] public float JumpForce { get; set; } = 8.0f;
    [Export] public float Gravity { get; set; } = 20.0f;

    public override void _Ready()
    {
        // Transfer input authority to the owning peer
        GetNode("InputSync").SetMultiplayerAuthority(Name.ToString().ToInt());
    }

    public override void _PhysicsProcess(double delta)
    {
        if (!Multiplayer.IsServer()) return;

        var input = GetNode<InputSync>("InputSync");
        var vel = Velocity;

        vel.X = input.InputDirection.X * Speed;
        vel.Z = input.InputDirection.Y * Speed;

        if (input.JumpPressed && IsOnFloor())
            vel.Y = JumpForce;

        vel.Y -= Gravity * (float)delta;
        Velocity = vel;
        MoveAndSlide();
    }
}
```

### Input Synchronizer

```csharp
using Godot;

public partial class InputSync : Node
{
    [Export] public Vector2 InputDirection { get; set; }
    [Export] public bool JumpPressed { get; set; }

    public override void _PhysicsProcess(double delta)
    {
        if (!IsMultiplayerAuthority()) return;

        InputDirection = Input.GetVector(
            "move_left", "move_right", "move_up", "move_down");
        JumpPressed = Input.IsActionJustPressed("jump");
    }
}
```

---

## Next Steps

- **[G13 Networking & Multiplayer](./G13_networking_and_multiplayer.md)** — ENet/WebSocket setup, basic RPC
- **[G27 Dedicated Servers](./G27_dedicated_servers_advanced_networking.md)** — Headless server deployment, scaling
- **[G43 Rollback Netcode](./G43_rollback_netcode.md)** — Deterministic rollback for fighting/precision games
- **[G66 Analytics & Telemetry](./G66_analytics_and_player_telemetry.md)** — Track network stats in production
