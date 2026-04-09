# G110 — Scene Replication with MultiplayerSynchronizer & MultiplayerSpawner

> **Category:** guide · **Engine:** Godot 4.x · **Related:** [G13 Networking & Multiplayer](./G13_networking_and_multiplayer.md) · [G27 Dedicated Servers & Advanced Networking](./G27_dedicated_servers_advanced_networking.md) · [G72 Multiplayer State Sync & Prediction](./G72_multiplayer_state_sync_and_prediction.md) · [G86 Multiplayer Security & Authority](./G86_multiplayer_security_and_authority.md) · [G88 Multiplayer Lobbies & Matchmaking](./G88_multiplayer_lobbies_and_matchmaking.md)

A deep-dive into Godot 4's high-level scene replication system — the `MultiplayerSynchronizer`, `MultiplayerSpawner`, and `SceneReplicationConfig` nodes that handle property syncing and dynamic node spawning across peers without manual RPC plumbing.

---

## What This Guide Covers

Godot 4 introduced a declarative scene replication system that sits on top of the lower-level `MultiplayerPeer` and RPC APIs. Instead of writing `rpc()` calls for every property update, you place `MultiplayerSynchronizer` and `MultiplayerSpawner` nodes in your scene tree, configure which properties to replicate, and the engine handles serialization, authority, and network delivery.

This guide covers the full API surface of these nodes, practical patterns for different game types, authority models, delta compression, visibility filtering, mid-game joins, and the gotchas that trip up most developers.

**Use this guide when:** you're building a multiplayer game and want to use Godot's built-in replication nodes rather than rolling everything with raw RPCs.

**Don't use this for:** rollback netcode (see [G43](./G43_rollback_netcode.md)), lockstep simulation (see [G97](./G97_deterministic_simulation_and_lockstep.md)), or understanding the low-level `MultiplayerPeer` API (see [G13](./G13_networking_and_multiplayer.md)).

---

## Table of Contents

1. [Architecture Overview](#1-architecture-overview)
2. [MultiplayerSynchronizer — Property Replication](#2-multiplayersynchronizer--property-replication)
3. [SceneReplicationConfig — Defining What Syncs](#3-scenereplicationconfig--defining-what-syncs)
4. [MultiplayerSpawner — Dynamic Node Replication](#4-multiplayerspawner--dynamic-node-replication)
5. [Authority Models](#5-authority-models)
6. [Replication Modes — Sync vs. Spawn vs. Watch](#6-replication-modes--sync-vs-spawn-vs-watch)
7. [Visibility and Interest Management](#7-visibility-and-interest-management)
8. [Delta Compression and Bandwidth](#8-delta-compression-and-bandwidth)
9. [Mid-Game Joins and Reconnection](#9-mid-game-joins-and-reconnection)
10. [Complete Example — Co-op Action Game](#10-complete-example--co-op-action-game)
11. [Complete Example — Authoritative Server](#11-complete-example--authoritative-server)
12. [Debugging Replication](#12-debugging-replication)
13. [Common Mistakes](#13-common-mistakes)

---

## 1. Architecture Overview

### The Replication Stack

```
┌─────────────────────────────────────────┐
│  Your Game Code (scripts, nodes)        │
├─────────────────────────────────────────┤
│  MultiplayerSynchronizer (property sync)│
│  MultiplayerSpawner (node spawning)     │
├─────────────────────────────────────────┤
│  SceneMultiplayer (orchestration)        │
├─────────────────────────────────────────┤
│  MultiplayerPeer (ENet / WebSocket /    │
│  Steam / WebRTC)                        │
├─────────────────────────────────────────┤
│  Network Transport (UDP / TCP / etc.)   │
└─────────────────────────────────────────┘
```

**Key concepts:**

- **Authority:** Each replicated node has exactly one authority peer (default: server, peer ID 1). Only the authority's values are replicated to others.
- **Synchronizer:** Reads property values from the authority's node and pushes them to all other peers at a configured interval.
- **Spawner:** When the authority adds a child node to a watched path, the spawner replicates the `add_child` across all peers. When the node is removed, peers remove it too.
- **SceneReplicationConfig:** A resource that lists which properties to sync, at what rate, and in what mode.

---

## 2. MultiplayerSynchronizer — Property Replication

### Basic Setup

Place a `MultiplayerSynchronizer` as a child of the node whose properties you want to replicate.

**Scene tree:**

```
Player (CharacterBody3D)         ← set_multiplayer_authority(peer_id)
├── CollisionShape3D
├── MeshInstance3D
├── MultiplayerSynchronizer      ← syncs properties of Player
│   └── (SceneReplicationConfig) ← configured in Inspector
└── PlayerScript.gd
```

### Configuring in the Inspector

1. Select the `MultiplayerSynchronizer` node
2. In the Inspector, find **Replication Config**
3. Click **Add Property** → select the parent node → choose properties like `position`, `rotation`, `velocity`
4. For each property, set the **replication mode**: `Always`, `On Change`, or `Never`

### Configuring via Code (GDScript)

```gdscript
extends CharacterBody3D

func _ready() -> void:
    var sync := $MultiplayerSynchronizer as MultiplayerSynchronizer

    # Configure replication programmatically
    var config := SceneReplicationConfig.new()

    # Sync position every frame
    config.add_property(^":position")
    config.property_set_replication_mode(
        ^":position",
        SceneReplicationConfig.REPLICATION_MODE_ALWAYS
    )

    # Sync rotation only when it changes
    config.add_property(^":rotation")
    config.property_set_replication_mode(
        ^":rotation",
        SceneReplicationConfig.REPLICATION_MODE_ON_CHANGE
    )

    # Sync a custom property
    config.add_property(^":health")
    config.property_set_replication_mode(
        ^":health",
        SceneReplicationConfig.REPLICATION_MODE_ON_CHANGE
    )

    sync.replication_config = config

    # Set replication interval (seconds between sync frames)
    sync.replication_interval = 0.05  # 20 ticks/second
```

### Configuring via Code (C#)

```csharp
using Godot;

public partial class Player : CharacterBody3D
{
    public int Health { get; set; } = 100;

    public override void _Ready()
    {
        var sync = GetNode<MultiplayerSynchronizer>("MultiplayerSynchronizer");
        var config = new SceneReplicationConfig();

        config.AddProperty(":position");
        config.PropertySetReplicationMode(
            ":position",
            SceneReplicationConfig.ReplicationMode.Always
        );

        config.AddProperty(":rotation");
        config.PropertySetReplicationMode(
            ":rotation",
            SceneReplicationConfig.ReplicationMode.OnChange
        );

        config.AddProperty(":Health");
        config.PropertySetReplicationMode(
            ":Health",
            SceneReplicationConfig.ReplicationMode.OnChange
        );

        sync.ReplicationConfig = config;
        sync.ReplicationInterval = 0.05;
    }
}
```

### Replication Interval

`replication_interval` controls how often (in seconds) the synchronizer sends updates. Lower values mean smoother replication but higher bandwidth:

| Interval | Ticks/sec | Use case |
|----------|-----------|----------|
| 0.016 | ~60 | Fast-paced shooters (high bandwidth) |
| 0.033 | ~30 | Action games (balanced) |
| 0.05 | 20 | Co-op, RPGs (default, good starting point) |
| 0.1 | 10 | Turn-based, slow-paced games |

---

## 3. SceneReplicationConfig — Defining What Syncs

### Property Paths

Properties are identified by `NodePath` relative to the synchronizer's **root node** (its parent by default, or set via `root_path`).

```gdscript
# Sync a property on the parent node
config.add_property(^":position")

# Sync a property on a child node
config.add_property(^"Weapon:ammo_count")

# Sync a nested property
config.add_property(^":transform:origin")
```

### Replication Modes

| Mode | Behavior | When to Use |
|------|----------|-------------|
| `REPLICATION_MODE_ALWAYS` | Sends every replication tick, even if unchanged | Position, rotation — things that change almost every frame |
| `REPLICATION_MODE_ON_CHANGE` | Sends only when the value differs from last sent | Health, ammo, state enums — discrete values |
| `REPLICATION_MODE_NEVER` | Registered but never sent automatically | Properties you sync manually via RPC |

### Spawn Mode

Each property also has a **spawn** flag. When `true`, the property value is included in the initial replication data when a new peer joins or a node is spawned. This is critical for mid-game joins.

```gdscript
config.add_property(^":position")
config.property_set_spawn(^":position", true)

config.add_property(^":player_name")
config.property_set_spawn(^":player_name", true)
config.property_set_replication_mode(
    ^":player_name",
    SceneReplicationConfig.REPLICATION_MODE_NEVER  # Only sent on spawn
)
```

---

## 4. MultiplayerSpawner — Dynamic Node Replication

### The Problem

When the authority calls `add_child()` to create a new node (a projectile, an enemy, a dropped item), other peers don't see it. You need to replicate the spawn.

### Basic Setup

```
World (Node3D)
├── MultiplayerSpawner       ← watches spawn_path for new children
├── Players/                 ← spawn_path = "Players"
│   ├── Player_1
│   └── Player_2
└── Projectiles/
    └── (dynamically spawned)
```

**Inspector configuration:**

1. Set **Spawn Path** to the node where children will be added (e.g., `../Players`)
2. Add **Auto Spawn List** entries — the scenes that are allowed to be spawned
3. Set **Spawn Limit** to prevent abuse (0 = unlimited)

### Spawning Nodes (GDScript)

```gdscript
# On the authority (server) — spawn a projectile
func fire_projectile(origin: Vector3, direction: Vector3) -> void:
    if not is_multiplayer_authority():
        return

    var bullet := preload("res://scenes/bullet.tscn").instantiate()
    bullet.position = origin
    bullet.direction = direction
    # The MultiplayerSpawner automatically replicates this add_child
    $Projectiles.add_child(bullet, true)  # true = force readable name
```

### Spawning Nodes (C#)

```csharp
public void FireProjectile(Vector3 origin, Vector3 direction)
{
    if (!IsMultiplayerAuthority())
        return;

    var bulletScene = GD.Load<PackedScene>("res://scenes/bullet.tscn");
    var bullet = bulletScene.Instantiate<Bullet>();
    bullet.Position = origin;
    bullet.Direction = direction;
    GetNode("Projectiles").AddChild(bullet, forceReadableName: true);
}
```

### Auto Spawn List vs. Custom Spawn Function

**Auto Spawn List** (Inspector) — List `PackedScene` resources that the spawner is allowed to instantiate. When the authority adds a child that matches one of these scenes, peers instantiate the same scene.

**Custom Spawn Function** — For cases where the spawned node needs configuration beyond what the scene provides:

```gdscript
# In the node that owns the MultiplayerSpawner
func _ready() -> void:
    var spawner := $MultiplayerSpawner as MultiplayerSpawner
    spawner.spawn_function = _custom_spawn

# Called on all peers when a spawn is replicated
func _custom_spawn(data: Variant) -> Node:
    var info: Dictionary = data
    var scene_path: String = info["scene"]
    var scene := load(scene_path) as PackedScene
    var node := scene.instantiate()

    # Apply spawn-time configuration
    if node.has_method("initialize"):
        node.initialize(info.get("config", {}))

    return node
```

```csharp
public override void _Ready()
{
    var spawner = GetNode<MultiplayerSpawner>("MultiplayerSpawner");
    spawner.SpawnFunction = new Callable(this, MethodName.CustomSpawn);
}

private Node CustomSpawn(Variant data)
{
    var info = data.AsGodotDictionary();
    var scenePath = info["scene"].AsString();
    var scene = GD.Load<PackedScene>(scenePath);
    var node = scene.Instantiate();
    return node;
}
```

### Spawn Limit

Set `spawn_limit` to cap how many nodes any single peer can spawn. This is a security measure — without it, a malicious client (in a peer-to-peer setup) could flood the game with spawned nodes.

```gdscript
spawner.spawn_limit = 50  # Max 50 spawned nodes from this spawner
```

---

## 5. Authority Models

### Server Authority (Default)

The server (peer ID 1) owns all replicated nodes by default. Clients send input to the server; the server updates game state and replicates it back.

```gdscript
# Server-authoritative player setup
func _ready() -> void:
    # Server owns all players, controls their state
    set_multiplayer_authority(1)
```

### Client Authority (Per-Player)

Each player owns their own character. The owning client updates position/rotation directly; the synchronizer replicates to other peers.

```gdscript
# In player setup — the controlling peer owns this node
func setup(peer_id: int) -> void:
    set_multiplayer_authority(peer_id)

    # Only process input if we're the authority
    set_process(is_multiplayer_authority())
    set_physics_process(is_multiplayer_authority())
```

```csharp
public void Setup(int peerId)
{
    SetMultiplayerAuthority(peerId);
    SetProcess(IsMultiplayerAuthority());
    SetPhysicsProcess(IsMultiplayerAuthority());
}
```

### Mixed Authority

Different nodes can have different authorities. Common pattern:

- **Player movement:** client-authoritative (responsive)
- **Health/inventory:** server-authoritative (cheat-resistant)
- **Projectiles:** server-authoritative (authoritative hit detection)

```gdscript
# Player node — client authority for movement
set_multiplayer_authority(owning_peer_id)

# Health component — server authority for security
$HealthComponent.set_multiplayer_authority(1)

# Each component has its own MultiplayerSynchronizer
# with appropriate authority settings
```

---

## 6. Replication Modes — Sync vs. Spawn vs. Watch

### Understanding the Three Behaviors

| Feature | MultiplayerSynchronizer | MultiplayerSpawner | Manual RPC |
|---------|------------------------|--------------------|-----------| 
| **What it does** | Continuous property sync | One-time node creation/deletion | Explicit function calls |
| **Direction** | Authority → all peers | Authority → all peers | Any peer → any peer |
| **When to use** | Frequently changing state | Dynamic node lifecycle | Events, actions, chat |
| **Bandwidth** | Proportional to sync rate | One-time per spawn | Per-call |

### Combining All Three

A typical multiplayer game uses all three mechanisms:

```gdscript
# Synchronizer handles continuous state
# (position, rotation, animation state)

# Spawner handles dynamic entities
# (projectiles, pickups, enemies)

# RPCs handle discrete events
@rpc("any_peer", "reliable")
func request_action(action_id: int) -> void:
    if multiplayer.is_server():
        # Server validates and applies
        _apply_action(action_id)

@rpc("authority", "reliable")
func apply_damage(amount: int) -> void:
    health -= amount
    if health <= 0:
        die()
```

---

## 7. Visibility and Interest Management

### The Problem

In a large game world, every player doesn't need to know about every entity. Sending a distant player's position wastes bandwidth.

### MultiplayerSynchronizer Visibility

```gdscript
# Set visibility update function
func _ready() -> void:
    var sync := $MultiplayerSynchronizer as MultiplayerSynchronizer
    sync.set_visibility_for(peer_id, false)  # Hide from specific peer

    # Or use a visibility callback for dynamic filtering
    sync.visibility_update_mode = MultiplayerSynchronizer.VISIBILITY_PROCESS_PHYSICS
    sync.add_visibility_filter(self._check_visibility)

# Called each replication tick for each peer
func _check_visibility(peer_id: int) -> bool:
    # Only replicate to peers within 50 meters
    var peer_pos := _get_peer_position(peer_id)
    var my_pos := global_position
    return my_pos.distance_to(peer_pos) < 50.0
```

```csharp
public override void _Ready()
{
    var sync = GetNode<MultiplayerSynchronizer>("MultiplayerSynchronizer");
    sync.VisibilityUpdateMode =
        MultiplayerSynchronizer.VisibilityUpdateModeEnum.ProcessPhysics;
    sync.AddVisibilityFilter(new Callable(this, MethodName.CheckVisibility));
}

private bool CheckVisibility(int peerId)
{
    var peerPos = GetPeerPosition(peerId);
    return GlobalPosition.DistanceTo(peerPos) < 50.0f;
}
```

### Visibility Changed Signal

React when a synchronizer becomes visible or hidden to a peer:

```gdscript
sync.visibility_changed.connect(_on_visibility_changed)

func _on_visibility_changed(for_peer: int) -> void:
    # A peer's visibility status for this node changed
    var is_visible := sync.get_visibility_for(for_peer)
    if not is_visible:
        # Peer can no longer see this entity — stop sending detailed state
        pass
```

---

## 8. Delta Compression and Bandwidth

### How Godot Compresses Sync Data

The `MultiplayerSynchronizer` uses **delta compression** by default. Only properties that changed since the last successful sync are sent. For `REPLICATION_MODE_ALWAYS` properties, the value is always sent regardless.

### Measuring Bandwidth

```gdscript
# Get replication stats (available on authority)
func _process(delta: float) -> void:
    if multiplayer.is_server():
        var scene_mp := multiplayer.multiplayer_peer as ENetMultiplayerPeer
        if scene_mp:
            # ENet exposes transfer stats
            prints("Outbound bandwidth:", scene_mp.get_peer(1))
```

### Bandwidth Optimization Tips

1. **Use `ON_CHANGE` for discrete values** — Health, ammo, state enums don't need every-tick sync.
2. **Increase replication_interval** — 20 Hz is fine for most games; only fast-paced shooters need 60 Hz.
3. **Use visibility filters** — Don't replicate entities the player can't see.
4. **Quantize positions** — For 2D games, `Vector2i` uses less bandwidth than `Vector2`.
5. **Separate fast and slow properties** — Use two synchronizers: one at 20 Hz for position, one at 2 Hz for stats.

```gdscript
# Two synchronizers on the same node — different rates
# $SyncPosition — replication_interval = 0.05 (20 Hz)
#   Syncs: position, rotation, velocity
# $SyncStats — replication_interval = 0.5 (2 Hz)
#   Syncs: health, stamina, buffs
```

---

## 9. Mid-Game Joins and Reconnection

### The Challenge

When a player joins an ongoing game, they need to receive the current state of all replicated nodes — positions, health values, and which dynamic nodes exist.

### How It Works

1. **Existing MultiplayerSynchronizer nodes** send their current property values (properties with `spawn = true`) to the new peer.
2. **MultiplayerSpawner** replays all active spawned nodes for the new peer — instantiating them with their current state.
3. **The game loop resumes** — subsequent sync ticks keep the new peer updated.

### Ensuring Correct State on Join

Mark all state-defining properties with `spawn = true`:

```gdscript
var config := SceneReplicationConfig.new()

# These properties define the node's current state
for prop in [^":position", ^":rotation", ^":health", ^":team_id", ^":player_name"]:
    config.add_property(prop)
    config.property_set_spawn(prop, true)

# position changes every frame; team_id rarely changes
config.property_set_replication_mode(^":position",
    SceneReplicationConfig.REPLICATION_MODE_ALWAYS)
config.property_set_replication_mode(^":team_id",
    SceneReplicationConfig.REPLICATION_MODE_ON_CHANGE)
config.property_set_replication_mode(^":player_name",
    SceneReplicationConfig.REPLICATION_MODE_NEVER)  # Only sent once on spawn
```

### Handling Peer Disconnect/Reconnect

```gdscript
func _ready() -> void:
    multiplayer.peer_disconnected.connect(_on_peer_disconnected)
    multiplayer.peer_connected.connect(_on_peer_connected)

func _on_peer_disconnected(id: int) -> void:
    # Remove their player node — spawner replicates removal to all peers
    if multiplayer.is_server():
        var player_node := players_container.get_node_or_null(str(id))
        if player_node:
            player_node.queue_free()

func _on_peer_connected(id: int) -> void:
    if multiplayer.is_server():
        # Spawn a new player for the joining peer
        _spawn_player(id)
        # Existing synced state is automatically sent — no manual work needed
```

---

## 10. Complete Example — Co-op Action Game

### Network Manager (GDScript)

```gdscript
# network_manager.gd — Autoload singleton
extends Node

const PORT := 9999
const MAX_PLAYERS := 4

signal player_joined(peer_id: int)
signal player_left(peer_id: int)

func host_game() -> Error:
    var peer := ENetMultiplayerPeer.new()
    var err := peer.create_server(PORT, MAX_PLAYERS)
    if err != OK:
        return err
    multiplayer.multiplayer_peer = peer
    multiplayer.peer_connected.connect(_on_peer_connected)
    multiplayer.peer_disconnected.connect(_on_peer_disconnected)
    player_joined.emit(1)  # Host is peer 1
    return OK

func join_game(address: String) -> Error:
    var peer := ENetMultiplayerPeer.new()
    var err := peer.create_client(address, PORT)
    if err != OK:
        return err
    multiplayer.multiplayer_peer = peer
    return OK

func _on_peer_connected(id: int) -> void:
    player_joined.emit(id)

func _on_peer_disconnected(id: int) -> void:
    player_left.emit(id)
```

### Network Manager (C#)

```csharp
// NetworkManager.cs — Autoload singleton
using Godot;

public partial class NetworkManager : Node
{
    private const int Port = 9999;
    private const int MaxPlayers = 4;

    [Signal] public delegate void PlayerJoinedEventHandler(int peerId);
    [Signal] public delegate void PlayerLeftEventHandler(int peerId);

    public Error HostGame()
    {
        var peer = new ENetMultiplayerPeer();
        var err = peer.CreateServer(Port, MaxPlayers);
        if (err != Error.Ok) return err;

        Multiplayer.MultiplayerPeer = peer;
        Multiplayer.PeerConnected += OnPeerConnected;
        Multiplayer.PeerDisconnected += OnPeerDisconnected;
        EmitSignal(SignalName.PlayerJoined, 1);
        return Error.Ok;
    }

    public Error JoinGame(string address)
    {
        var peer = new ENetMultiplayerPeer();
        var err = peer.CreateClient(address, Port);
        if (err != Error.Ok) return err;

        Multiplayer.MultiplayerPeer = peer;
        return Error.Ok;
    }

    private void OnPeerConnected(long id) => EmitSignal(SignalName.PlayerJoined, (int)id);
    private void OnPeerDisconnected(long id) => EmitSignal(SignalName.PlayerLeft, (int)id);
}
```

### Player Scene (player.tscn)

```
Player (CharacterBody3D)
├── CollisionShape3D
├── MeshInstance3D
├── AnimationPlayer
├── MultiplayerSynchronizer
│   └── replication_config:
│       position → Always, spawn=true
│       rotation → OnChange, spawn=true
│       health → OnChange, spawn=true
│       animation_state → OnChange, spawn=true
└── Player.gd
```

### Player Script (GDScript)

```gdscript
# player.gd
extends CharacterBody3D

@export var speed := 5.0
@export var jump_force := 8.0

## Replicated properties
var health := 100
var animation_state := &"idle"

func setup(peer_id: int) -> void:
    set_multiplayer_authority(peer_id)
    name = str(peer_id)

    # Only the owning peer processes input
    set_physics_process(is_multiplayer_authority())

func _physics_process(delta: float) -> void:
    if not is_multiplayer_authority():
        return

    # Gather input
    var input_dir := Input.get_vector(&"move_left", &"move_right",
                                       &"move_forward", &"move_back")
    var direction := (transform.basis * Vector3(input_dir.x, 0, input_dir.y)).normalized()

    if direction != Vector3.ZERO:
        velocity.x = direction.x * speed
        velocity.z = direction.z * speed
        animation_state = &"run"
    else:
        velocity.x = move_toward(velocity.x, 0, speed)
        velocity.z = move_toward(velocity.z, 0, speed)
        animation_state = &"idle"

    if not is_on_floor():
        velocity += get_gravity() * delta
    elif Input.is_action_just_pressed(&"jump"):
        velocity.y = jump_force
        animation_state = &"jump"

    move_and_slide()

## Server-authoritative damage — any peer can request, server validates
@rpc("any_peer", "reliable", "call_local")
func take_damage(amount: int) -> void:
    if not multiplayer.is_server():
        return
    health = maxi(health - amount, 0)
    if health <= 0:
        _die.rpc()

@rpc("authority", "reliable", "call_local")
func _die() -> void:
    animation_state = &"death"
    set_physics_process(false)
```

### World Scene with Spawner

```gdscript
# world.gd
extends Node3D

@onready var spawner := $MultiplayerSpawner as MultiplayerSpawner
@onready var players := $Players as Node3D

var player_scene := preload("res://scenes/player.tscn")

func _ready() -> void:
    # Spawner watches the Players node for new children
    spawner.spawn_path = players.get_path()

    NetworkManager.player_joined.connect(_on_player_joined)
    NetworkManager.player_left.connect(_on_player_left)

    # If we're the server, spawn our own player
    if multiplayer.is_server():
        _spawn_player(1)

func _on_player_joined(peer_id: int) -> void:
    if multiplayer.is_server():
        _spawn_player(peer_id)

func _on_player_left(peer_id: int) -> void:
    if multiplayer.is_server():
        var player := players.get_node_or_null(str(peer_id))
        if player:
            player.queue_free()

func _spawn_player(peer_id: int) -> void:
    var player := player_scene.instantiate() as CharacterBody3D
    player.setup(peer_id)
    players.add_child(player, true)
```

---

## 11. Complete Example — Authoritative Server

For competitive games, the server should validate all actions:

```gdscript
# server_authoritative_player.gd
extends CharacterBody3D

## Input is sent to server via RPC; server simulates and syncs result
var health := 100

func setup(peer_id: int) -> void:
    name = str(peer_id)
    # Server owns all players
    set_multiplayer_authority(1)

func _physics_process(delta: float) -> void:
    # Only the server runs physics
    if not multiplayer.is_server():
        return
    move_and_slide()

## Client sends input to server
@rpc("any_peer", "unreliable_ordered")
func send_input(input_dir: Vector2, jump: bool) -> void:
    if not multiplayer.is_server():
        return

    # Validate the RPC came from the owning peer
    var sender := multiplayer.get_remote_sender_id()
    if str(sender) != name:
        return  # Reject input from wrong peer

    var direction := (transform.basis * Vector3(input_dir.x, 0, input_dir.y)).normalized()
    velocity.x = direction.x * 5.0
    velocity.z = direction.z * 5.0
    if jump and is_on_floor():
        velocity.y = 8.0
```

On the client side:

```gdscript
# client_input.gd — attached to local player only
extends Node

@export var player_path: NodePath

func _physics_process(_delta: float) -> void:
    var player := get_node(player_path)
    var input_dir := Input.get_vector(&"move_left", &"move_right",
                                       &"move_forward", &"move_back")
    var jump := Input.is_action_just_pressed(&"jump")

    # Send input to server at physics rate
    player.send_input.rpc_id(1, input_dir, jump)
```

---

## 12. Debugging Replication

### Visual Debugging

Enable the **Multiplayer Debugger** in the Godot editor: **Debugger → Multiplayer** tab. This shows:

- Active synchronizers and their sync rate
- Bandwidth per synchronizer
- Authority assignments
- Spawned nodes

### Common Debug Techniques

```gdscript
# Print sync state for debugging
func _process(_delta: float) -> void:
    if OS.is_debug_build():
        var sync := $MultiplayerSynchronizer
        prints(
            "Auth:", get_multiplayer_authority(),
            "IsAuth:", is_multiplayer_authority(),
            "Pos:", position.snapped(Vector3.ONE * 0.1)
        )
```

### Running Multiple Instances Locally

Launch multiple editor instances to test multiplayer locally:

1. **Editor → Run → Unique Main Run Instance** (ensures separate data dirs)
2. Or use the **Multiplayer Run** launch configuration (Godot 4.4+) which spawns N instances

---

## 13. Common Mistakes

### Not Setting Authority

```gdscript
# BAD — authority defaults to server (1); client input is ignored
var player = player_scene.instantiate()
players.add_child(player)

# GOOD — set authority to the owning peer
player.set_multiplayer_authority(peer_id)
```

### Syncing Too Many Properties

Only sync what other peers actually need. Don't sync internal state like `_cached_direction`, temporary variables, or UI-only data.

### Forgetting spawn = true

If a property isn't marked with `spawn = true`, mid-game joiners won't receive its initial value. They'll see the default until the next sync tick updates it — causing a visible pop.

### Processing Input on Non-Authority Peers

```gdscript
# BAD — all peers run input, causing fighting between local and replicated state
func _physics_process(delta: float) -> void:
    var input = Input.get_vector(...)
    velocity = input * speed
    move_and_slide()

# GOOD — only authority processes input
func _physics_process(delta: float) -> void:
    if not is_multiplayer_authority():
        return
    var input = Input.get_vector(...)
    velocity = input * speed
    move_and_slide()
```

### Using the Wrong RPC Channel for Input

```gdscript
# BAD — reliable input causes head-of-line blocking and latency spikes
@rpc("any_peer", "reliable")
func send_input(dir: Vector2) -> void: ...

# GOOD — unreliable_ordered drops stale packets, keeping input fresh
@rpc("any_peer", "unreliable_ordered")
func send_input(dir: Vector2) -> void: ...
```

### Not Adding Scenes to the Auto Spawn List

If a scene isn't in the `MultiplayerSpawner`'s auto spawn list (or you haven't set a custom spawn function), `add_child()` on the authority won't replicate to peers. There's no error — the node just silently doesn't appear on other clients.

---

## Summary

| Component | Purpose | Key Setting |
|-----------|---------|-------------|
| `MultiplayerSynchronizer` | Continuous property replication | `replication_interval`, `replication_config` |
| `MultiplayerSpawner` | Dynamic node creation/deletion | `spawn_path`, auto spawn list |
| `SceneReplicationConfig` | Which properties, what mode | `ALWAYS` / `ON_CHANGE` / `NEVER`, `spawn` flag |
| `set_multiplayer_authority()` | Who controls a node | Peer ID (1 = server) |
| Visibility filters | Interest management | `add_visibility_filter()` |
