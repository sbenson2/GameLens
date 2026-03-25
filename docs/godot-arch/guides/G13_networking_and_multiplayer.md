# G13 — Networking & Multiplayer

> **Engine:** Godot 4.4+ · **Level:** Intermediate–Advanced · **Typed GDScript**
>
> Godot's high-level multiplayer API (`MultiplayerSynchronizer`, `MultiplayerSpawner`, `SceneMultiplayer`) abstracts ENet/WebSocket/WebRTC behind a unified peer system. This guide covers authoritative server architecture, state synchronization, client prediction, and practical patterns for lobby-based and real-time multiplayer games.

---

## Table of Contents

1. [Multiplayer Architecture Overview](#1-multiplayer-architecture-overview)
2. [Setting Up the Peer Network](#2-setting-up-the-peer-network)
3. [RPCs — Remote Procedure Calls](#3-rpcs--remote-procedure-calls)
4. [MultiplayerSpawner — Dynamic Object Replication](#4-multiplayerspawner--dynamic-object-replication)
5. [MultiplayerSynchronizer — State Replication](#5-multiplayersynchronizer--state-replication)
6. [Authoritative Server Pattern](#6-authoritative-server-pattern)
7. [Lobby & Connection Management](#7-lobby--connection-management)
8. [Client-Side Prediction & Reconciliation](#8-client-side-prediction--reconciliation)
9. [Interpolation & Extrapolation](#9-interpolation--extrapolation)
10. [Lag Compensation — Server Rewind](#10-lag-compensation--server-rewind)
11. [Network Optimization](#11-network-optimization)
12. [Chat & Non-Gameplay Messaging](#12-chat--non-gameplay-messaging)
13. [WebSocket & WebRTC Transport](#13-websocket--webrtc-transport)
14. [Testing & Debugging](#14-testing--debugging)
15. [Common Mistakes](#15-common-mistakes)
16. [Tuning Reference](#16-tuning-reference)

---

## 1. Multiplayer Architecture Overview

### Execution Flow

```
Client Input → Send to Server → Server Validates → Server Updates World
    ↓                                                      ↓
Predict Locally                                   Broadcast State
    ↓                                                      ↓
Receive Server State ← ← ← ← ← ← ← ← ← ← ← All Clients
    ↓
Reconcile Prediction
    ↓
Interpolate Visuals
```

### Peer Model

Godot uses a **peer ID** system. Every connected client gets a unique integer ID:

| Peer ID | Meaning |
|---------|---------|
| `1` | Always the server/host |
| `2+` | Clients, assigned by server in connection order |
| `0` | Invalid / not connected |

```gdscript
# Check identity anywhere
var my_id: int = multiplayer.get_unique_id()
var is_server: bool = multiplayer.is_server()
```

### Authority Model

Each node has a **multiplayer authority** — the peer that "owns" it:

```gdscript
# Set authority (server does this for all peers)
node.set_multiplayer_authority(peer_id)

# Check authority
if node.is_multiplayer_authority():
    # This peer controls this node
    pass
```

**Default authority is `1` (server).** For player characters, the server sets authority to the owning client so they can send input.

---

## 2. Setting Up the Peer Network

### ENet (Default — UDP, Reliable + Unreliable)

```gdscript
# network_manager.gd — Autoload
class_name NetworkManager
extends Node

signal player_connected(peer_id: int)
signal player_disconnected(peer_id: int)
signal connection_succeeded
signal connection_failed

const DEFAULT_PORT: int = 7000
const MAX_CLIENTS: int = 8

var peer: ENetMultiplayerPeer = ENetMultiplayerPeer.new()

func host_game(port: int = DEFAULT_PORT) -> Error:
    var error: Error = peer.create_server(port, MAX_CLIENTS)
    if error != OK:
        push_error("Failed to create server: %s" % error_string(error))
        return error

    multiplayer.multiplayer_peer = peer
    _connect_signals()
    print("Server started on port %d" % port)
    return OK


func join_game(address: String, port: int = DEFAULT_PORT) -> Error:
    var error: Error = peer.create_client(address, port)
    if error != OK:
        push_error("Failed to create client: %s" % error_string(error))
        return error

    multiplayer.multiplayer_peer = peer
    _connect_signals()
    return OK


func disconnect_game() -> void:
    multiplayer.multiplayer_peer = null
    peer = ENetMultiplayerPeer.new()


func _connect_signals() -> void:
    multiplayer.peer_connected.connect(_on_peer_connected)
    multiplayer.peer_disconnected.connect(_on_peer_disconnected)
    multiplayer.connected_to_server.connect(_on_connected_to_server)
    multiplayer.connection_failed.connect(_on_connection_failed)
    multiplayer.server_disconnected.connect(_on_server_disconnected)


func _on_peer_connected(id: int) -> void:
    print("Peer connected: %d" % id)
    player_connected.emit(id)


func _on_peer_disconnected(id: int) -> void:
    print("Peer disconnected: %d" % id)
    player_disconnected.emit(id)


func _on_connected_to_server() -> void:
    print("Connected to server as peer %d" % multiplayer.get_unique_id())
    connection_succeeded.emit()


func _on_connection_failed() -> void:
    push_warning("Connection to server failed")
    multiplayer.multiplayer_peer = null
    connection_failed.emit()


func _on_server_disconnected() -> void:
    push_warning("Server disconnected")
    multiplayer.multiplayer_peer = null
```

### Connection Timeout Configuration

```gdscript
func host_game(port: int = DEFAULT_PORT) -> Error:
    var error: Error = peer.create_server(port, MAX_CLIENTS)
    if error != OK:
        return error

    # ENet channel and bandwidth configuration
    peer.host.compress(ENetConnection.COMPRESS_RANGE_CODER)

    multiplayer.multiplayer_peer = peer
    _connect_signals()
    return OK
```

---

## 3. RPCs — Remote Procedure Calls

### RPC Annotations

```gdscript
# Called on server only — clients request actions
@rpc("any_peer", "call_remote", "reliable")
func request_action(action_data: Dictionary) -> void:
    var sender_id: int = multiplayer.get_remote_sender_id()
    # Server validates and processes
    if _validate_action(sender_id, action_data):
        _execute_action(sender_id, action_data)


# Called on all clients — server broadcasts results
@rpc("authority", "call_local", "reliable")
func apply_action_result(result: Dictionary) -> void:
    # All peers (including server) apply the result
    _apply_result(result)


# Unreliable for high-frequency data (position, rotation)
@rpc("authority", "call_remote", "unreliable")
func sync_position(pos: Vector2) -> void:
    position = pos


# Unreliable ordered — latest data wins, old packets dropped
@rpc("authority", "call_remote", "unreliable_ordered")
func sync_state(state: Dictionary) -> void:
    _apply_state(state)
```

### RPC Annotation Reference

| Parameter | Options | Default | Use |
|-----------|---------|---------|-----|
| **Call mode** | `"authority"`, `"any_peer"` | `"authority"` | Who can call this RPC |
| **Transfer** | `"reliable"`, `"unreliable"`, `"unreliable_ordered"` | `"reliable"` | Delivery guarantee |
| **Scope** | `"call_remote"`, `"call_local"` | `"call_remote"` | Whether caller also executes |
| **Channel** | `0`–`255` | `0` | ENet channel for ordering |

### Calling RPCs

```gdscript
# Call on all remote peers
action.rpc()

# Call on a specific peer
action.rpc_id(target_peer_id)

# Call on server only (peer 1)
request_action.rpc_id(1, {"type": "attack", "target": enemy_id})
```

### RPC Validation Pattern

**Never trust the client.** Always validate on the server:

```gdscript
@rpc("any_peer", "call_remote", "reliable")
func request_move(target_pos: Vector2) -> void:
    var sender: int = multiplayer.get_remote_sender_id()

    # Validate: does this peer own this character?
    if not _is_owner(sender):
        push_warning("Peer %d tried to move a character they don't own" % sender)
        return

    # Validate: is the move distance reasonable?
    var player_node: CharacterBody2D = _get_player_node(sender)
    if player_node == null:
        return

    var distance: float = player_node.position.distance_to(target_pos)
    if distance > MAX_MOVE_DISTANCE:
        push_warning("Peer %d requested suspicious move (%.1f units)" % [sender, distance])
        return

    # Server approves and broadcasts
    player_node.position = target_pos
    sync_position.rpc(target_pos)
```

---

## 4. MultiplayerSpawner — Dynamic Object Replication

The `MultiplayerSpawner` automatically replicates `add_child()` calls across peers.

### Scene Tree Setup

```
World (Node2D)
├── MultiplayerSpawner       ← watches SpawnRoot
├── SpawnRoot (Node2D)       ← spawned nodes appear here
├── Players (Node2D)         ← separate spawner for players
│   └── MultiplayerSpawner
└── Environment (Node2D)     ← static, no spawner needed
```

### Spawner Configuration

```gdscript
# game_manager.gd
@onready var player_spawner: MultiplayerSpawner = $Players/MultiplayerSpawner
@onready var projectile_spawner: MultiplayerSpawner = $SpawnRoot/MultiplayerSpawner


func _ready() -> void:
    # Register scenes the spawner is allowed to replicate
    player_spawner.add_spawnable_scene("res://scenes/player.tscn")
    projectile_spawner.add_spawnable_scene("res://scenes/bullet.tscn")
    projectile_spawner.add_spawnable_scene("res://scenes/rocket.tscn")

    # Custom spawn function for player initialization
    player_spawner.spawn_function = _custom_spawn_player


func spawn_player(peer_id: int) -> void:
    if not multiplayer.is_server():
        return

    # Only the server spawns — MultiplayerSpawner replicates to clients
    var player: CharacterBody2D = preload("res://scenes/player.tscn").instantiate()
    player.name = str(peer_id)
    player.set_multiplayer_authority(peer_id)
    $Players.add_child(player, true)  # force_readable_name


func _custom_spawn_player(data: Variant) -> Node:
    # Custom spawn function runs on ALL peers (server + clients)
    # data is passed from spawn() call
    var peer_id: int = data as int
    var player: CharacterBody2D = preload("res://scenes/player.tscn").instantiate()
    player.name = str(peer_id)
    player.set_multiplayer_authority(peer_id)
    return player
```

### Spawn with Custom Data

```gdscript
# Server-side: spawn with data payload
func spawn_item(item_id: String, pos: Vector2) -> void:
    if not multiplayer.is_server():
        return

    # The spawner's spawn_function receives this data on all peers
    var item: Node2D = preload("res://scenes/item.tscn").instantiate()
    item.position = pos
    item.set_meta("item_id", item_id)
    $SpawnRoot.add_child(item, true)
```

**Key rule:** Only the **server** adds children to a spawner's path. Clients adding children to a spawned path causes desync.

---

## 5. MultiplayerSynchronizer — State Replication

The `MultiplayerSynchronizer` automatically replicates property changes from the authority to all other peers.

### Scene Setup — Player.tscn

```
Player (CharacterBody2D)
├── MultiplayerSynchronizer
├── Sprite2D
├── CollisionShape2D
└── AnimationPlayer
```

### Synchronizer Configuration

```gdscript
# player.gd
class_name NetworkPlayer
extends CharacterBody2D

# Synced properties (configured in MultiplayerSynchronizer's replication config)
@export var synced_position: Vector2 = Vector2.ZERO
@export var synced_velocity: Vector2 = Vector2.ZERO
@export var synced_animation: StringName = &"idle"
@export var synced_facing: float = 1.0  # 1.0 or -1.0
@export var health: int = 100

const SPEED: float = 200.0


func _ready() -> void:
    # Only the authority processes input
    if is_multiplayer_authority():
        $Camera2D.make_current()


func _physics_process(delta: float) -> void:
    if is_multiplayer_authority():
        _process_input(delta)
    else:
        _apply_synced_state(delta)


func _process_input(delta: float) -> void:
    var input_dir: Vector2 = Input.get_vector("move_left", "move_right", "move_up", "move_down")
    velocity = input_dir * SPEED
    move_and_slide()

    # Update synced properties — MultiplayerSynchronizer handles replication
    synced_position = position
    synced_velocity = velocity
    synced_animation = _get_animation_name(input_dir)
    if input_dir.x != 0.0:
        synced_facing = signf(input_dir.x)


func _apply_synced_state(_delta: float) -> void:
    # Remote players interpolate toward synced position (see §9)
    position = position.lerp(synced_position, 0.5)
    $Sprite2D.scale.x = synced_facing
    $AnimationPlayer.play(synced_animation)


func _get_animation_name(input_dir: Vector2) -> StringName:
    if input_dir.length() > 0.1:
        return &"run"
    return &"idle"
```

### Replication Configuration (Editor)

In the `MultiplayerSynchronizer` inspector, add replication properties:

| Property Path | Sync Mode | Notes |
|---------------|-----------|-------|
| `:synced_position` | Always | High-frequency, use delta or unreliable |
| `:synced_velocity` | Always | For extrapolation |
| `:synced_animation` | On Change | String, low-frequency |
| `:synced_facing` | On Change | Only changes on direction flip |
| `:health` | On Change | Integer, reliable |

### Programmatic Replication Config

```gdscript
func _setup_synchronizer() -> void:
    var sync: MultiplayerSynchronizer = $MultiplayerSynchronizer

    # Visibility — only sync to peers who can see this player
    sync.visibility_update_mode = MultiplayerSynchronizer.VISIBILITY_PROCESS_PHYSICS
    sync.public_visibility = false  # Manual visibility control

    # Set which peers receive updates
    for peer_id: int in multiplayer.get_peers():
        var distance: float = _get_distance_to_peer(peer_id)
        sync.set_visibility_for(peer_id, distance < RELEVANCE_RADIUS)
```

---

## 6. Authoritative Server Pattern

### Architecture

The server is the **single source of truth**. Clients send input; the server simulates and broadcasts results.

```gdscript
# server_game.gd — Runs on server only
class_name ServerGame
extends Node

var player_states: Dictionary = {}  # peer_id → PlayerState
var tick: int = 0

const TICK_RATE: float = 1.0 / 20.0  # 20 ticks/sec
var tick_accumulator: float = 0.0


class PlayerState:
    var position: Vector2 = Vector2.ZERO
    var velocity: Vector2 = Vector2.ZERO
    var health: int = 100
    var last_input_tick: int = 0


func _physics_process(delta: float) -> void:
    if not multiplayer.is_server():
        return

    tick_accumulator += delta
    while tick_accumulator >= TICK_RATE:
        _server_tick()
        tick_accumulator -= TICK_RATE


func _server_tick() -> void:
    tick += 1

    # Process all pending inputs
    for peer_id: int in player_states:
        var state: PlayerState = player_states[peer_id]
        _simulate_player(state)

    # Broadcast world state to all clients
    var snapshot: Dictionary = _build_snapshot()
    _broadcast_snapshot.rpc(snapshot)


func _simulate_player(state: PlayerState) -> void:
    # Apply physics, collision, game rules
    var player_node: CharacterBody2D = _get_player_node_for(state)
    if player_node:
        player_node.velocity = state.velocity
        player_node.move_and_slide()
        state.position = player_node.position


@rpc("any_peer", "call_remote", "unreliable_ordered")
func receive_input(input: Dictionary) -> void:
    var sender: int = multiplayer.get_remote_sender_id()
    if sender not in player_states:
        return

    # Validate input magnitude
    var dir: Vector2 = Vector2(
        input.get("x", 0.0) as float,
        input.get("y", 0.0) as float
    )
    if dir.length() > 1.1:  # Small tolerance for float precision
        dir = dir.normalized()

    player_states[sender].velocity = dir * PLAYER_SPEED
    player_states[sender].last_input_tick = input.get("tick", 0) as int


func _build_snapshot() -> Dictionary:
    var snapshot: Dictionary = {"tick": tick, "players": {}}
    for peer_id: int in player_states:
        var state: PlayerState = player_states[peer_id]
        snapshot["players"][peer_id] = {
            "pos": state.position,
            "vel": state.velocity,
            "hp": state.health,
        }
    return snapshot


@rpc("authority", "call_remote", "unreliable_ordered")
func _broadcast_snapshot(snapshot: Dictionary) -> void:
    pass  # Clients override this
```

### Client Input Sender

```gdscript
# client_input.gd — Runs on owning client
class_name ClientInput
extends Node

var local_tick: int = 0
var input_history: Array[Dictionary] = []

const MAX_HISTORY: int = 128


func _physics_process(_delta: float) -> void:
    if not is_multiplayer_authority():
        return

    local_tick += 1

    var input: Dictionary = {
        "x": Input.get_axis("move_left", "move_right"),
        "y": Input.get_axis("move_up", "move_down"),
        "tick": local_tick,
    }

    # Store for reconciliation
    input_history.append(input)
    if input_history.size() > MAX_HISTORY:
        input_history.pop_front()

    # Send to server
    _send_input.rpc_id(1, input)


@rpc("any_peer", "call_remote", "unreliable_ordered")
func _send_input(input: Dictionary) -> void:
    # Redirects to server's receive_input
    get_parent().receive_input.rpc_id(1, input)
```

---

## 7. Lobby & Connection Management

### Lobby with Player Info Exchange

```gdscript
# lobby_manager.gd — Autoload
class_name LobbyManager
extends Node

signal lobby_updated(players: Dictionary)
signal game_starting

var players: Dictionary = {}  # peer_id → PlayerInfo

const MAX_PLAYERS: int = 4


class PlayerInfo:
    var display_name: String = ""
    var color: Color = Color.WHITE
    var ready: bool = false

    func to_dict() -> Dictionary:
        return {"name": display_name, "color": color.to_html(), "ready": ready}

    static func from_dict(data: Dictionary) -> PlayerInfo:
        var info := PlayerInfo.new()
        info.display_name = data.get("name", "Unknown") as String
        info.color = Color.from_string(data.get("color", "#ffffff") as String, Color.WHITE)
        info.ready = data.get("ready", false) as bool
        return info


func _ready() -> void:
    multiplayer.peer_connected.connect(_on_peer_connected)
    multiplayer.peer_disconnected.connect(_on_peer_disconnected)
    multiplayer.connected_to_server.connect(_on_connected)


func _on_connected() -> void:
    # Send our info to the server
    var my_info := PlayerInfo.new()
    my_info.display_name = PlayerSettings.player_name
    my_info.color = PlayerSettings.player_color
    _register_player.rpc_id(1, multiplayer.get_unique_id(), my_info.to_dict())


func _on_peer_connected(id: int) -> void:
    if multiplayer.is_server():
        # Send existing player list to the new peer
        for existing_id: int in players:
            var info: PlayerInfo = players[existing_id]
            _register_player.rpc_id(id, existing_id, info.to_dict())


func _on_peer_disconnected(id: int) -> void:
    players.erase(id)
    _remove_player.rpc(id)
    lobby_updated.emit(players)


@rpc("any_peer", "call_local", "reliable")
func _register_player(id: int, data: Dictionary) -> void:
    if multiplayer.is_server():
        if players.size() >= MAX_PLAYERS:
            push_warning("Lobby full, rejecting peer %d" % id)
            return
        # Server re-broadcasts to all peers
        _register_player.rpc(id, data)

    players[id] = PlayerInfo.from_dict(data)
    lobby_updated.emit(players)


@rpc("authority", "call_local", "reliable")
func _remove_player(id: int) -> void:
    players.erase(id)
    lobby_updated.emit(players)


@rpc("any_peer", "call_remote", "reliable")
func set_ready(is_ready: bool) -> void:
    var sender: int = multiplayer.get_remote_sender_id()
    if sender in players:
        players[sender].ready = is_ready
        _sync_ready.rpc(sender, is_ready)
        _check_all_ready()


@rpc("authority", "call_local", "reliable")
func _sync_ready(peer_id: int, is_ready: bool) -> void:
    if peer_id in players:
        players[peer_id].ready = is_ready
        lobby_updated.emit(players)


func _check_all_ready() -> void:
    if not multiplayer.is_server():
        return
    if players.size() < 2:
        return

    for id: int in players:
        if not players[id].ready:
            return

    # All ready — start game
    _start_game.rpc()


@rpc("authority", "call_local", "reliable")
func _start_game() -> void:
    game_starting.emit()
```

### Reconnection Handler

```gdscript
# reconnect_manager.gd
class_name ReconnectManager
extends Node

var reconnect_timer: Timer
var reconnect_attempts: int = 0

const MAX_ATTEMPTS: int = 5
const RECONNECT_DELAY: float = 2.0
const BACKOFF_MULTIPLIER: float = 1.5

var _last_address: String = ""
var _last_port: int = 0


func _ready() -> void:
    reconnect_timer = Timer.new()
    reconnect_timer.one_shot = true
    reconnect_timer.timeout.connect(_attempt_reconnect)
    add_child(reconnect_timer)

    multiplayer.server_disconnected.connect(_on_server_lost)


func _on_server_lost() -> void:
    reconnect_attempts = 0
    _attempt_reconnect()


func _attempt_reconnect() -> void:
    reconnect_attempts += 1
    if reconnect_attempts > MAX_ATTEMPTS:
        push_warning("Max reconnect attempts reached")
        return

    var error: Error = NetworkManager.join_game(_last_address, _last_port)
    if error != OK:
        var delay: float = RECONNECT_DELAY * pow(BACKOFF_MULTIPLIER, reconnect_attempts - 1)
        reconnect_timer.start(delay)


func store_connection(address: String, port: int) -> void:
    _last_address = address
    _last_port = port
```

---

## 8. Client-Side Prediction & Reconciliation

Prediction lets the client move immediately while waiting for server confirmation. Reconciliation corrects drift when the server's result differs.

```gdscript
# predicted_player.gd — Attach to the local player
class_name PredictedPlayer
extends CharacterBody2D

const SPEED: float = 200.0
const RECONCILIATION_THRESHOLD: float = 3.0  # pixels

var input_history: Array[InputSnapshot] = []
var local_tick: int = 0
var last_server_tick: int = 0


class InputSnapshot:
    var tick: int
    var direction: Vector2
    var predicted_position: Vector2


func _physics_process(delta: float) -> void:
    if not is_multiplayer_authority():
        return

    local_tick += 1

    # 1. Capture input
    var dir: Vector2 = Input.get_vector("move_left", "move_right", "move_up", "move_down")

    # 2. Predict locally (move immediately)
    velocity = dir * SPEED
    move_and_slide()

    # 3. Store prediction
    var snapshot := InputSnapshot.new()
    snapshot.tick = local_tick
    snapshot.direction = dir
    snapshot.predicted_position = position
    input_history.append(snapshot)

    # 4. Send input to server
    _send_input_to_server.rpc_id(1, {
        "tick": local_tick,
        "dir_x": dir.x,
        "dir_y": dir.y,
    })

    # Trim old history
    while input_history.size() > 128:
        input_history.pop_front()


func receive_server_state(server_tick: int, server_pos: Vector2) -> void:
    """Called when server snapshot arrives."""
    last_server_tick = server_tick

    # Find the matching prediction
    var match_idx: int = -1
    for i: int in input_history.size():
        if input_history[i].tick == server_tick:
            match_idx = i
            break

    if match_idx == -1:
        # No matching prediction — snap to server
        position = server_pos
        return

    # Check prediction error
    var predicted_pos: Vector2 = input_history[match_idx].predicted_position
    var error: float = predicted_pos.distance_to(server_pos)

    if error > RECONCILIATION_THRESHOLD:
        # Reconcile: reset to server position, replay inputs
        position = server_pos

        # Replay all inputs AFTER the corrected tick
        for i: int in range(match_idx + 1, input_history.size()):
            var snapshot: InputSnapshot = input_history[i]
            velocity = snapshot.direction * SPEED
            move_and_slide()
            snapshot.predicted_position = position  # Update predictions

    # Discard acknowledged inputs
    input_history = input_history.slice(match_idx + 1)


@rpc("any_peer", "call_remote", "unreliable_ordered")
func _send_input_to_server(input: Dictionary) -> void:
    pass  # Server handles this in its receive_input
```

---

## 9. Interpolation & Extrapolation

Remote players should never snap between network updates. Interpolate for smooth visuals.

### Interpolation Buffer

```gdscript
# network_interpolation.gd — Attach to remote player visuals
class_name NetworkInterpolation
extends Node2D

const BUFFER_TIME_MS: float = 100.0  # 100ms interpolation delay

var state_buffer: Array[StateSnapshot] = []


class StateSnapshot:
    var timestamp: float  # server time in ms
    var position: Vector2
    var rotation: float
    var animation: StringName


func receive_state(server_time: float, pos: Vector2, rot: float, anim: StringName) -> void:
    var snapshot := StateSnapshot.new()
    snapshot.timestamp = server_time
    snapshot.position = pos
    snapshot.rotation = rot
    snapshot.animation = anim
    state_buffer.append(snapshot)

    # Keep buffer manageable
    while state_buffer.size() > 20:
        state_buffer.pop_front()


func _process(_delta: float) -> void:
    if state_buffer.size() < 2:
        return

    # Render time = current time - buffer delay
    var render_time: float = _get_current_server_time() - BUFFER_TIME_MS

    # Find two snapshots to interpolate between
    var idx: int = -1
    for i: int in range(state_buffer.size() - 1):
        if state_buffer[i].timestamp <= render_time and state_buffer[i + 1].timestamp >= render_time:
            idx = i
            break

    if idx == -1:
        # No valid pair — extrapolate from latest if needed
        if state_buffer.back().timestamp < render_time:
            _extrapolate(render_time)
        return

    var a: StateSnapshot = state_buffer[idx]
    var b: StateSnapshot = state_buffer[idx + 1]

    # Calculate interpolation factor
    var range_ms: float = b.timestamp - a.timestamp
    var t: float = 0.0
    if range_ms > 0.001:
        t = clampf((render_time - a.timestamp) / range_ms, 0.0, 1.0)

    # Apply interpolated state
    position = a.position.lerp(b.position, t)
    rotation = lerp_angle(a.rotation, b.rotation, t)

    # Animation uses nearest snapshot (no blending)
    if t < 0.5:
        _play_animation(a.animation)
    else:
        _play_animation(b.animation)

    # Remove consumed snapshots (keep one before render_time)
    while state_buffer.size() > 2 and state_buffer[1].timestamp < render_time:
        state_buffer.pop_front()


func _extrapolate(render_time: float) -> void:
    """Limited extrapolation when server updates are late."""
    if state_buffer.size() < 2:
        return

    var a: StateSnapshot = state_buffer[-2]
    var b: StateSnapshot = state_buffer[-1]
    var dt: float = b.timestamp - a.timestamp

    if dt < 0.001:
        return

    var velocity: Vector2 = (b.position - a.position) / dt
    var overshoot: float = render_time - b.timestamp

    # Cap extrapolation to prevent rubber-banding
    overshoot = minf(overshoot, BUFFER_TIME_MS * 2.0)
    position = b.position + velocity * overshoot


func _play_animation(anim: StringName) -> void:
    var anim_player: AnimationPlayer = get_node_or_null("AnimationPlayer")
    if anim_player and anim_player.current_animation != anim:
        anim_player.play(anim)


func _get_current_server_time() -> float:
    # Implement clock sync (see §10 or use a simple offset)
    return Time.get_ticks_msec() + _server_time_offset

var _server_time_offset: float = 0.0
```

---

## 10. Lag Compensation — Server Rewind

For hit detection in fast-paced games, the server must rewind other players to where the shooter *saw* them.

```gdscript
# lag_compensation.gd — Server-side
class_name LagCompensation
extends Node

const MAX_REWIND_MS: float = 300.0  # Max rewind window
const HISTORY_DURATION_MS: float = 1000.0

# peer_id → Array of PositionRecord
var position_history: Dictionary = {}


class PositionRecord:
    var timestamp: float
    var position: Vector2
    var collision_shape: RectangleShape2D  # Simplified hitbox


func record_positions(server_time: float) -> void:
    """Call every server tick to record all player positions."""
    for peer_id: int in _get_all_player_ids():
        if peer_id not in position_history:
            position_history[peer_id] = [] as Array[PositionRecord]

        var record := PositionRecord.new()
        record.timestamp = server_time
        record.position = _get_player_position(peer_id)
        record.collision_shape = _get_player_hitbox(peer_id)

        var history: Array = position_history[peer_id]
        history.append(record)

        # Prune old records
        while history.size() > 0 and server_time - history[0].timestamp > HISTORY_DURATION_MS:
            history.pop_front()


func check_hit(
    shooter_id: int,
    shoot_origin: Vector2,
    shoot_dir: Vector2,
    target_id: int,
    client_timestamp: float,
) -> bool:
    """Server-side hit check with rewind."""
    if target_id not in position_history:
        return false

    var history: Array = position_history[target_id]
    if history.is_empty():
        return false

    # Clamp rewind to maximum allowed
    var server_time: float = Time.get_ticks_msec()
    var rewind_ms: float = server_time - client_timestamp
    rewind_ms = clampf(rewind_ms, 0.0, MAX_REWIND_MS)
    var rewind_time: float = server_time - rewind_ms

    # Find the two records bracketing the rewind time
    var rewound_pos: Vector2 = _interpolate_position(history, rewind_time)

    # Raycast against rewound position
    var ray_end: Vector2 = shoot_origin + shoot_dir * 1000.0
    return _ray_intersects_rect(shoot_origin, ray_end, rewound_pos, Vector2(32, 48))


func _interpolate_position(history: Array, target_time: float) -> Vector2:
    if history.size() == 1:
        return history[0].position

    for i: int in range(history.size() - 1):
        var a: PositionRecord = history[i]
        var b: PositionRecord = history[i + 1]

        if a.timestamp <= target_time and b.timestamp >= target_time:
            var range_t: float = b.timestamp - a.timestamp
            if range_t < 0.001:
                return a.position
            var t: float = (target_time - a.timestamp) / range_t
            return a.position.lerp(b.position, t)

    # Past the end — return latest
    return history.back().position


func _ray_intersects_rect(
    ray_start: Vector2,
    ray_end: Vector2,
    rect_center: Vector2,
    rect_size: Vector2,
) -> bool:
    var rect := Rect2(rect_center - rect_size * 0.5, rect_size)
    # Simplified AABB vs line segment test
    return rect.intersects(Rect2(
        Vector2(minf(ray_start.x, ray_end.x), minf(ray_start.y, ray_end.y)),
        Vector2(absf(ray_end.x - ray_start.x), absf(ray_end.y - ray_start.y)),
    ))


func _get_all_player_ids() -> Array[int]:
    return []  # Override with actual player tracking

func _get_player_position(_peer_id: int) -> Vector2:
    return Vector2.ZERO  # Override

func _get_player_hitbox(_peer_id: int) -> RectangleShape2D:
    return RectangleShape2D.new()  # Override
```

---

## 11. Network Optimization

### Delta Compression

Send only what changed since the last acknowledged state:

```gdscript
# delta_sync.gd
class_name DeltaSync
extends Node

var last_sent_state: Dictionary = {}


func build_delta(current_state: Dictionary) -> Dictionary:
    var delta: Dictionary = {}

    for key: String in current_state:
        if key not in last_sent_state or last_sent_state[key] != current_state[key]:
            delta[key] = current_state[key]

    last_sent_state = current_state.duplicate()
    return delta


func apply_delta(base_state: Dictionary, delta: Dictionary) -> Dictionary:
    var result: Dictionary = base_state.duplicate()
    result.merge(delta, true)
    return result
```

### Interest Management — Visibility Culling

Only sync entities near each player:

```gdscript
# interest_manager.gd — Server-side
class_name InterestManager
extends Node

const RELEVANCE_RADIUS: float = 800.0  # pixels
const UPDATE_INTERVAL: float = 0.5     # seconds

var _timer: float = 0.0


func _physics_process(delta: float) -> void:
    if not multiplayer.is_server():
        return

    _timer += delta
    if _timer < UPDATE_INTERVAL:
        return
    _timer = 0.0

    _update_visibility()


func _update_visibility() -> void:
    var players: Array[Node] = get_tree().get_nodes_in_group("network_players")
    var syncable_entities: Array[Node] = get_tree().get_nodes_in_group("network_synced")

    for entity: Node in syncable_entities:
        var sync: MultiplayerSynchronizer = entity.get_node_or_null("MultiplayerSynchronizer")
        if sync == null:
            continue

        for player: Node in players:
            var peer_id: int = player.name.to_int()
            var distance: float = (entity as Node2D).position.distance_to(
                (player as Node2D).position
            )
            sync.set_visibility_for(peer_id, distance < RELEVANCE_RADIUS)
```

### Bandwidth Budgeting

```gdscript
# bandwidth_monitor.gd — Debug tool
class_name BandwidthMonitor
extends Node

var bytes_sent: int = 0
var bytes_received: int = 0
var _last_reset: float = 0.0


func _process(delta: float) -> void:
    _last_reset += delta
    if _last_reset >= 1.0:
        var sent_kbps: float = (bytes_sent * 8.0) / 1000.0
        var recv_kbps: float = (bytes_received * 8.0) / 1000.0
        print("Network: ↑ %.1f kbps | ↓ %.1f kbps" % [sent_kbps, recv_kbps])
        bytes_sent = 0
        bytes_received = 0
        _last_reset = 0.0
```

### Quantization — Reduce Precision for Bandwidth

```gdscript
# network_utils.gd
class_name NetworkUtils


## Pack a Vector2 position into 2 × 16-bit integers (±32767 range).
static func pack_position(pos: Vector2) -> int:
    var x: int = clampi(roundi(pos.x), -32767, 32767)
    var y: int = clampi(roundi(pos.y), -32767, 32767)
    return (x + 32767) | ((y + 32767) << 16)


static func unpack_position(packed: int) -> Vector2:
    var x: int = (packed & 0xFFFF) - 32767
    var y: int = ((packed >> 16) & 0xFFFF) - 32767
    return Vector2(x, y)


## Pack a rotation (0–2π) into a single byte.
static func pack_rotation(rad: float) -> int:
    return clampi(roundi((fposmod(rad, TAU) / TAU) * 255.0), 0, 255)


static func unpack_rotation(packed: int) -> float:
    return (packed / 255.0) * TAU
```

---

## 12. Chat & Non-Gameplay Messaging

```gdscript
# chat_manager.gd — Autoload
class_name ChatManager
extends Node

signal message_received(sender_name: String, text: String)

const MAX_MESSAGE_LENGTH: int = 256
const RATE_LIMIT_MS: int = 500

var _last_message_time: Dictionary = {}  # peer_id → timestamp


@rpc("any_peer", "call_remote", "reliable")
func send_chat(text: String) -> void:
    var sender: int = multiplayer.get_remote_sender_id()
    if sender == 0:
        sender = multiplayer.get_unique_id()

    # Server-side validation
    if multiplayer.is_server():
        # Rate limit
        var now: int = Time.get_ticks_msec()
        if sender in _last_message_time:
            if now - _last_message_time[sender] < RATE_LIMIT_MS:
                return
        _last_message_time[sender] = now

        # Length limit
        if text.length() > MAX_MESSAGE_LENGTH:
            text = text.left(MAX_MESSAGE_LENGTH)

        # Sanitize (strip BBCode if using RichTextLabel)
        text = text.replace("[", "(").replace("]", ")")

        # Broadcast to all
        _deliver_chat.rpc(sender, text)


@rpc("authority", "call_local", "reliable")
func _deliver_chat(sender_id: int, text: String) -> void:
    var sender_name: String = "Unknown"
    if sender_id in LobbyManager.players:
        sender_name = LobbyManager.players[sender_id].display_name

    message_received.emit(sender_name, text)
```

---

## 13. WebSocket & WebRTC Transport

### WebSocket (For Web Export)

```gdscript
# websocket_network.gd
class_name WebSocketNetwork
extends Node

var peer: WebSocketMultiplayerPeer = WebSocketMultiplayerPeer.new()


func host_websocket(port: int = 8080) -> Error:
    var error: Error = peer.create_server(port)
    if error != OK:
        return error

    multiplayer.multiplayer_peer = peer
    return OK


func join_websocket(url: String) -> Error:
    # url format: "ws://address:port" or "wss://address:port"
    var error: Error = peer.create_client(url)
    if error != OK:
        return error

    multiplayer.multiplayer_peer = peer
    return OK
```

### WebRTC (Peer-to-Peer via Signaling Server)

```gdscript
# webrtc_network.gd
class_name WebRTCNetwork
extends Node

var rtc_peer: WebRTCMultiplayerPeer = WebRTCMultiplayerPeer.new()


func create_mesh(my_id: int) -> Error:
    return rtc_peer.create_mesh(my_id)


func add_remote_peer(remote_id: int) -> void:
    var connection: WebRTCPeerConnection = WebRTCPeerConnection.new()

    # Configure STUN/TURN servers for NAT traversal
    connection.initialize({
        "iceServers": [
            {"urls": ["stun:stun.l.google.com:19302"]},
        ]
    })

    rtc_peer.add_peer(connection, remote_id)
    multiplayer.multiplayer_peer = rtc_peer
```

### Transport Decision Table

| Transport | Use Case | Pros | Cons |
|-----------|----------|------|------|
| **ENet** | Desktop/mobile games | Fast, reliable + unreliable, built-in | No web support |
| **WebSocket** | Web games, simple lobbies | Web compatible, firewall-friendly | TCP only (no unreliable), higher latency |
| **WebRTC** | P2P web games, voice chat | True P2P, web compatible, data channels | Complex setup (needs signaling server) |

**Recommendation:** Use ENet for desktop games. Use WebSocket for web export. WebRTC only if you need P2P topology or voice/video.

---

## 14. Testing & Debugging

### Local Multi-Instance Testing

Run multiple instances from the same project:

```gdscript
# debug_launcher.gd — Editor tool script
@tool
extends EditorPlugin

func _enter_tree() -> void:
    add_tool_menu_item("Launch Client", _launch_client)


func _launch_client() -> void:
    # Launch another instance as a client
    var executable: String = OS.get_executable_path()
    var args: PackedStringArray = PackedStringArray([
        "--path", ProjectSettings.globalize_path("res://"),
        "--",  # Custom args separator
        "--client",
        "--connect=127.0.0.1",
    ])
    OS.create_process(executable, args)
```

### Handling Command-Line Args

```gdscript
# main.gd
func _ready() -> void:
    var args: PackedStringArray = OS.get_cmdline_user_args()
    var is_client: bool = false
    var address: String = "127.0.0.1"

    for arg: String in args:
        if arg == "--client":
            is_client = true
        elif arg.begins_with("--connect="):
            address = arg.get_slice("=", 1)
        elif arg == "--server":
            NetworkManager.host_game()
            return

    if is_client:
        NetworkManager.join_game(address)
    else:
        # Default: show host/join UI
        _show_main_menu()
```

### Network Debug Overlay

```gdscript
# network_debug_overlay.gd
class_name NetworkDebugOverlay
extends CanvasLayer

@onready var label: RichTextLabel = $RichTextLabel

var _ping_samples: Array[float] = []
const MAX_SAMPLES: int = 30


func _process(_delta: float) -> void:
    if not visible:
        return

    var lines: PackedStringArray = PackedStringArray()
    lines.append("[b]Network Debug[/b]")
    lines.append("Peer ID: %d" % multiplayer.get_unique_id())
    lines.append("Is Server: %s" % str(multiplayer.is_server()))
    lines.append("Connected Peers: %d" % multiplayer.get_peers().size())

    if multiplayer.multiplayer_peer is ENetMultiplayerPeer:
        var enet: ENetMultiplayerPeer = multiplayer.multiplayer_peer as ENetMultiplayerPeer
        var host: ENetConnection = enet.host
        if host:
            lines.append("Avg RTT: %.0f ms" % _get_avg_rtt(host))

    label.text = "\n".join(lines)


func _get_avg_rtt(host: ENetConnection) -> float:
    # ENet tracks RTT per peer
    var total: float = 0.0
    var count: int = 0
    for peer_info: Dictionary in host.get_peers():
        if peer_info.get("state") == ENetPacketPeer.STATE_CONNECTED:
            total += peer_info.get("round_trip_time", 0.0) as float
            count += 1
    if count == 0:
        return 0.0
    return total / count


func _input(event: InputEvent) -> void:
    if event.is_action_pressed("toggle_net_debug"):
        visible = not visible
```

### Simulating Latency & Packet Loss (Development)

```gdscript
# lag_simulator.gd — Wrap around real network calls during development
class_name LagSimulator
extends Node

@export var simulated_latency_ms: float = 100.0
@export var simulated_jitter_ms: float = 20.0
@export var simulated_packet_loss: float = 0.05  # 5%

var _delayed_packets: Array[Dictionary] = []


func send_delayed(callable: Callable, data: Variant) -> void:
    # Simulate packet loss
    if randf() < simulated_packet_loss:
        return

    var delay: float = simulated_latency_ms + randf_range(-simulated_jitter_ms, simulated_jitter_ms)
    delay = maxf(delay, 0.0)

    _delayed_packets.append({
        "callable": callable,
        "data": data,
        "deliver_at": Time.get_ticks_msec() + delay,
    })


func _process(_delta: float) -> void:
    var now: float = Time.get_ticks_msec()
    var delivered: Array[int] = []

    for i: int in _delayed_packets.size():
        if _delayed_packets[i]["deliver_at"] <= now:
            _delayed_packets[i]["callable"].call(_delayed_packets[i]["data"])
            delivered.append(i)

    # Remove delivered (reverse order to preserve indices)
    delivered.reverse()
    for idx: int in delivered:
        _delayed_packets.remove_at(idx)
```

---

## 15. Common Mistakes

### ❌ Mistake 1: Running Game Logic on the Client

```gdscript
# WRONG — Client decides damage
func _on_attack_hit(target: Node) -> void:
    target.health -= 10  # Client-side modification = hackable
```

```gdscript
# RIGHT — Client requests, server decides
func _on_attack_hit(target: Node) -> void:
    request_damage.rpc_id(1, target.get_path(), 10)

@rpc("any_peer", "call_remote", "reliable")
func request_damage(target_path: NodePath, amount: int) -> void:
    if not multiplayer.is_server():
        return
    # Validate range, cooldown, line-of-sight, etc.
    var target: Node = get_node_or_null(target_path)
    if target and _validate_attack(multiplayer.get_remote_sender_id(), target):
        target.take_damage(amount)
```

### ❌ Mistake 2: Using `reliable` for Everything

Position updates at 20Hz using `reliable` causes congestion under packet loss — the reliable channel queues retransmits, adding latency to ALL subsequent messages on that channel.

```gdscript
# WRONG — reliable for position
@rpc("authority", "call_remote", "reliable")
func sync_pos(pos: Vector2) -> void: ...

# RIGHT — unreliable_ordered for position (latest wins, old dropped)
@rpc("authority", "call_remote", "unreliable_ordered")
func sync_pos(pos: Vector2) -> void: ...
```

**Rule:** Use `reliable` for state changes (damage, death, inventory, chat). Use `unreliable_ordered` for continuous streams (position, velocity, rotation).

### ❌ Mistake 3: Forgetting `set_multiplayer_authority()`

```gdscript
# WRONG — All players controlled by server (peer 1)
func spawn_player(peer_id: int) -> void:
    var player: Node = player_scene.instantiate()
    $Players.add_child(player)

# RIGHT — Each player controlled by their own client
func spawn_player(peer_id: int) -> void:
    var player: Node = player_scene.instantiate()
    player.name = str(peer_id)
    player.set_multiplayer_authority(peer_id)
    $Players.add_child(player)
```

### ❌ Mistake 4: Not Handling Disconnects Gracefully

```gdscript
# WRONG — Player node stays forever after disconnect
func _on_peer_disconnected(id: int) -> void:
    pass

# RIGHT — Clean up
func _on_peer_disconnected(id: int) -> void:
    var player: Node = $Players.get_node_or_null(str(id))
    if player:
        player.queue_free()
    LobbyManager.players.erase(id)
```

### ❌ Mistake 5: Syncing Everything

```gdscript
# WRONG — Syncing the full sprite, collision, all children
# MultiplayerSynchronizer replicating :position, :rotation, :scale,
# :modulate, :visible, :z_index, :collision_layer...

# RIGHT — Sync minimal authoritative state, derive the rest locally
# Only sync: position, velocity, animation name, facing direction
# Let each client derive sprite flip, particles, sounds from those inputs
```

### ❌ Mistake 6: Testing Only on Localhost

Localhost has 0ms latency and 0% packet loss. Real networks have 50-200ms RTT and 1-5% loss. Always test with the lag simulator (§14) before shipping.

### ❌ Mistake 7: Using Node Paths in RPCs

```gdscript
# FRAGILE — Node paths can differ between server and client
request_action.rpc_id(1, get_node("/root/World/Enemies/Goblin3").get_path())

# ROBUST — Use unique IDs or peer IDs
request_action.rpc_id(1, target_entity_id)
```

---

## 16. Tuning Reference

### Tick Rate by Game Type

| Game Type | Server Tick Rate | Client Send Rate | Notes |
|-----------|-----------------|-----------------|-------|
| Turn-based | On event | On event | No tick loop needed |
| Co-op PvE | 10–15 Hz | 10–15 Hz | Forgiving, fewer entities |
| Action RPG | 15–20 Hz | 15–20 Hz | Position + animation sync |
| Competitive FPS | 30–60 Hz | 30 Hz | Lag compensation critical |
| Fighting game | 60 Hz (lockstep) | 60 Hz | Rollback preferred over client-server |
| RTS | 10 Hz (lockstep) | On input | Deterministic simulation |

### Interpolation Buffer by Connection Quality

| Connection | Buffer Delay | Notes |
|------------|-------------|-------|
| LAN (<10ms) | 30–50ms | Minimal, near-instant feel |
| Good broadband (20-60ms) | 80–120ms | Standard default |
| WiFi/Mobile (60-150ms) | 150–200ms | Visible but playable |
| Poor connection (>200ms) | 250ms+ | Noticeable, consider action queue |

### Bandwidth Budget per Player

| Data Type | Frequency | Size (bytes) | kbps @ 20Hz |
|-----------|-----------|-------------|-------------|
| Position (quantized) | Every tick | 4 | 0.64 |
| Velocity (quantized) | Every tick | 4 | 0.64 |
| Rotation (1 byte) | Every tick | 1 | 0.16 |
| Animation state | On change | ~12 | ~0.5 |
| Health | On change | 2 | ~0.1 |
| **Total per entity** | | | **~2 kbps** |

For a 16-player game syncing all players: ~32 kbps outbound per client ≈ 512 kbps total server outbound. Well within typical limits.

### ENet Channel Allocation

| Channel | Use | Transfer Mode |
|---------|-----|--------------|
| 0 | Position/velocity sync | Unreliable ordered |
| 1 | Game state (health, score, inventory) | Reliable |
| 2 | Chat messages | Reliable |
| 3 | Voice data (if implemented) | Unreliable |

---

## Related Guides

- [G3 — Signal Architecture](G3_signal_architecture.md) — local event wiring, used alongside RPCs
- [G5 — Physics & Collision](G5_physics_and_collision.md) — collision layers for multiplayer hitboxes
- [G11 — Save/Load Systems](G11_save_load_systems.md) — persist player/world data between sessions
- [G2 — State Machine](G2_state_machine.md) — character states that sync over the network
- [Networking Theory](../../core/concepts/networking-theory.md) — engine-agnostic networking foundations
