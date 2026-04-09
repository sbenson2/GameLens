# G27 — Dedicated Servers & Advanced Networking

> **Category:** Guide · **Engine:** Godot 4.4+ · **Language:** GDScript / C#  
> **Related:** [G13 Networking & Multiplayer](./G13_networking_and_multiplayer.md) · [G18 Performance Profiling](./G18_performance_profiling.md) · [G20 CI/CD & Export Pipelines](./G20_cicd_and_export_pipelines.md) · [G23 Advanced Physics](./G23_advanced_physics.md)

---

## What This Guide Covers

G13 covers Godot's high-level multiplayer API — RPCs, MultiplayerSynchronizer, and the authoritative server pattern. This guide goes deeper: running Godot as a headless dedicated server, WebRTC for peer-to-peer across NATs, WebSocket for browser clients, relay server architecture, matchmaking, anti-cheat patterns, and deploying game servers to cloud infrastructure.

**Use this guide when:** you need always-on game servers (survival games, MMOs, competitive multiplayer), browser clients connecting to native servers, peer-to-peer without port forwarding, or cloud-hosted game server infrastructure.

**Don't need this if:** your game is local multiplayer, LAN-only, or uses simple host-and-join where one player acts as server. G13 covers those patterns.

---

## Table of Contents

1. [Networking Architecture Decisions](#1-networking-architecture-decisions)
2. [Headless Dedicated Server](#2-headless-dedicated-server)
3. [Server-Only and Client-Only Code Separation](#3-server-only-and-client-only-code-separation)
4. [ENet Deep Dive](#4-enet-deep-dive)
5. [WebSocket Transport](#5-websocket-transport)
6. [WebRTC Peer-to-Peer](#6-webrtc-peer-to-peer)
7. [Signaling Server for WebRTC](#7-signaling-server-for-webrtc)
8. [Relay Server Architecture](#8-relay-server-architecture)
9. [Matchmaking](#9-matchmaking)
10. [Authentication & Security](#10-authentication--security)
11. [Anti-Cheat Patterns](#11-anti-cheat-patterns)
12. [Cloud Deployment](#12-cloud-deployment)
13. [Scaling & Load Balancing](#13-scaling--load-balancing)
14. [Monitoring & Diagnostics](#14-monitoring--diagnostics)
15. [Common Mistakes & Fixes](#15-common-mistakes--fixes)

---

## 1. Networking Architecture Decisions

| Architecture | Topology | Best For | Latency | Server Cost |
|---|---|---|---|---|
| **Listen server** | One player hosts | Coop, small matches | Low (for host) | Free |
| **Dedicated server** | Always-on server process | Competitive, persistent worlds | Consistent | $ per instance |
| **P2P (ENet mesh)** | All peers connected | Fighting games, small lobbies | Lowest between peers | Free |
| **P2P (WebRTC)** | NAT-traversed P2P | Browser games, cross-platform P2P | Low | Signaling only |
| **Relay server** | All traffic through server | When P2P fails, anti-cheat needed | Higher | $ per instance |

### Decision Tree

```
Need persistent game world? → Dedicated server
Need browser support? → WebSocket (client) + Dedicated server
Need P2P without port forwarding? → WebRTC
Competitive / anti-cheat critical? → Dedicated server (authoritative)
Small lobby, trust players? → Listen server or ENet mesh
```

---

## 2. Headless Dedicated Server

Godot can run without a display, making it suitable for headless server deployment.

### Export as Dedicated Server

In Godot 4.4+, create a dedicated server export preset:

1. **Project → Export → Add Preset → Linux/Server** (or your target OS)
2. In the export preset, enable **"Dedicated Server"** under Features
3. This strips rendering, audio, and input systems — smaller binary, lower resource usage

### Command-Line Launch

```bash
# Run the exported server binary
./my_game_server --headless --server-port=7777 --max-players=16

# Or run from the editor for development:
godot --headless --path /path/to/project -- --server
```

### Server Entry Point

```gdscript
# main.gd (Autoload — your game's entry point)
extends Node

const DEFAULT_PORT: int = 7777
const MAX_PLAYERS: int = 16

func _ready() -> void:
    if _is_server_mode():
        _start_server()
    else:
        _start_client_menu()

func _is_server_mode() -> bool:
    return OS.has_feature("dedicated_server") or "--server" in OS.get_cmdline_args()

func _start_server() -> void:
    print("[Server] Starting on port %d (max %d players)" % [DEFAULT_PORT, MAX_PLAYERS])
    
    var peer := ENetMultiplayerPeer.new()
    var error := peer.create_server(DEFAULT_PORT, MAX_PLAYERS)
    if error != OK:
        push_error("Failed to create server: %s" % error_string(error))
        get_tree().quit(1)
        return
    
    multiplayer.multiplayer_peer = peer
    multiplayer.peer_connected.connect(_on_peer_connected)
    multiplayer.peer_disconnected.connect(_on_peer_disconnected)
    
    # Load the server-side world
    var world := preload("res://scenes/world.tscn").instantiate()
    add_child(world)
    
    print("[Server] Ready. Waiting for connections...")

func _on_peer_connected(id: int) -> void:
    print("[Server] Peer connected: %d (total: %d)" % [
        id, multiplayer.get_peers().size()
    ])

func _on_peer_disconnected(id: int) -> void:
    print("[Server] Peer disconnected: %d" % id)
    # Clean up player entity
    PlayerManager.remove_player(id)
```

### Server Configuration via Command Line

```gdscript
# Parse command-line arguments for server config
class_name ServerConfig

static func parse() -> Dictionary:
    var config := {
        "port": 7777,
        "max_players": 16,
        "tick_rate": 20,
        "map": "default",
    }
    
    var args := OS.get_cmdline_user_args()  # args after "--"
    for arg in args:
        if arg.begins_with("--"):
            var parts := arg.substr(2).split("=", true, 1)
            var key := parts[0].replace("-", "_")
            var value := parts[1] if parts.size() > 1 else "true"
            match key:
                "port": config.port = int(value)
                "max_players": config.max_players = int(value)
                "tick_rate": config.tick_rate = int(value)
                "map": config.map = value
    
    return config
```

---

## 3. Server-Only and Client-Only Code Separation

### Feature Tags

Godot's export feature tags let you conditionally include code:

```gdscript
# Runs only on the dedicated server export
if OS.has_feature("dedicated_server"):
    _init_server_systems()

# Runs only on client exports
if not OS.has_feature("dedicated_server"):
    _init_rendering()
    _init_audio()
```

### Scene Stripping

Use `@export` groups to mark nodes as server-only or client-only:

```gdscript
# server_only_node.gd — attach to nodes that shouldn't exist on clients
class_name ServerOnlyNode
extends Node

func _ready() -> void:
    if not multiplayer.is_server():
        queue_free()
```

```gdscript
# client_only_node.gd — attach to rendering/audio nodes
class_name ClientOnlyNode
extends Node

func _ready() -> void:
    if OS.has_feature("dedicated_server"):
        queue_free()
```

### Server Tick Loop

Dedicated servers often run a fixed-rate game loop independent of rendering:

```gdscript
# server_tick.gd
class_name ServerTick
extends Node

@export var tick_rate: int = 20  # ticks per second
var tick_interval: float:
    get: return 1.0 / tick_rate

var _tick_accumulator: float = 0.0
var current_tick: int = 0

signal server_tick(tick: int, delta: float)

func _process(delta: float) -> void:
    _tick_accumulator += delta
    while _tick_accumulator >= tick_interval:
        _tick_accumulator -= tick_interval
        current_tick += 1
        server_tick.emit(current_tick, tick_interval)
```

---

## 4. ENet Deep Dive

ENet (G13) is Godot's default transport. Here are advanced configurations for dedicated servers.

### Channel Configuration

```gdscript
var peer := ENetMultiplayerPeer.new()
peer.create_server(port, max_players)

# Access the underlying ENet host for advanced config
var host: ENetConnection = peer.host

# Set bandwidth limits (bytes/sec, 0 = unlimited)
host.bandwidth_limit(0, 0)  # incoming, outgoing

# Set compression
host.compress(ENetConnection.COMPRESS_RANGE_CODER)
```

### Transfer Modes Per-Channel

```gdscript
# Reliable ordered (default) — chat, state changes
multiplayer.multiplayer_peer.transfer_mode = MultiplayerPeer.TRANSFER_MODE_RELIABLE

# Unreliable — position updates (latest wins, no need for ordering)
multiplayer.multiplayer_peer.transfer_mode = MultiplayerPeer.TRANSFER_MODE_UNRELIABLE

# Unreliable ordered — inputs (drop old, keep latest ordered)
multiplayer.multiplayer_peer.transfer_mode = MultiplayerPeer.TRANSFER_MODE_UNRELIABLE_ORDERED
```

### Connection Quality Monitoring

```gdscript
# Monitor connection quality per peer
func get_peer_stats(peer_id: int) -> Dictionary:
    var enet_peer := multiplayer.multiplayer_peer
    if enet_peer is ENetMultiplayerPeer:
        # Access individual ENet peer connection
        var connection: ENetPacketPeer = enet_peer.get_peer(peer_id)
        if connection:
            return {
                "round_trip_time": connection.get_statistic(
                    ENetPacketPeer.PEER_ROUND_TRIP_TIME),
                "packet_loss": connection.get_statistic(
                    ENetPacketPeer.PEER_PACKET_LOSS),
                "packets_sent": connection.get_statistic(
                    ENetPacketPeer.PEER_PACKETS_SENT),
            }
    return {}
```

### Timeout Configuration

```gdscript
# Configure timeouts to detect disconnected players faster
func configure_peer_timeout(peer_id: int) -> void:
    var enet_peer := multiplayer.multiplayer_peer as ENetMultiplayerPeer
    if enet_peer:
        var connection := enet_peer.get_peer(peer_id)
        if connection:
            # timeout_limit, timeout_minimum_ms, timeout_maximum_ms
            connection.set_timeout(32, 2000, 10000)
            # Peer will be disconnected if no response within 10s
```

---

## 5. WebSocket Transport

WebSocket allows browser-based clients to connect to your dedicated server. This is essential for web exports (G22).

### Server: Accept WebSocket Clients

```gdscript
# websocket_server.gd
func _start_websocket_server(port: int) -> void:
    var peer := WebSocketMultiplayerPeer.new()
    
    # Optional: configure supported protocols
    peer.supported_protocols = PackedStringArray(["my-game-v1"])
    
    var error := peer.create_server(port)
    if error != OK:
        push_error("WebSocket server failed: %s" % error_string(error))
        return
    
    multiplayer.multiplayer_peer = peer
    print("[Server] WebSocket listening on port %d" % port)
```

### Client: Connect via WebSocket

```gdscript
# websocket_client.gd
func connect_to_server(address: String, port: int) -> void:
    var peer := WebSocketMultiplayerPeer.new()
    
    # Use wss:// for production (TLS)
    var url := "ws://%s:%d" % [address, port]
    var error := peer.create_client(url)
    if error != OK:
        push_error("WebSocket connection failed: %s" % error_string(error))
        return
    
    multiplayer.multiplayer_peer = peer
```

### Dual Transport: ENet + WebSocket

Run both transports on the same server to support native and browser clients:

```gdscript
# dual_server.gd
# Note: Godot's SceneMultiplayer only supports one peer at a time.
# For dual transport, use a proxy approach:

func _start_dual_server() -> void:
    # Primary: ENet for native clients
    var enet_peer := ENetMultiplayerPeer.new()
    enet_peer.create_server(7777, 32)
    multiplayer.multiplayer_peer = enet_peer
    
    # Secondary: WebSocket for browser clients — use a relay/bridge
    # Option 1: Run a separate Godot process for WebSocket
    # Option 2: Use an external WebSocket-to-ENet bridge
    # Option 3: Use a dedicated WebSocket server that forwards to ENet
    
    print("[Server] ENet on 7777, WebSocket bridge needed for web clients")
```

**Recommended approach for dual transport:** Run a lightweight WebSocket relay (Node.js, Go, or Rust) that bridges WebSocket clients to your ENet server. This avoids the complexity of multiple Godot multiplayer peers in one process.

---

## 6. WebRTC Peer-to-Peer

WebRTC enables direct peer-to-peer connections that traverse NATs — no port forwarding needed. Ideal for browser-to-browser or cross-platform P2P games.

### How WebRTC Connection Works

```
Player A                    Signaling Server                    Player B
   |                              |                                |
   |-- Create Offer ------------->|                                |
   |                              |-- Forward Offer -------------->|
   |                              |                                |
   |                              |<------------ Create Answer ----|
   |<--- Forward Answer ----------|                                |
   |                              |                                |
   |-- ICE Candidates ----------->|-- Forward ICE ---------------->|
   |<--- Forward ICE -------------|<------------ ICE Candidates ---|
   |                              |                                |
   |<=============== Direct P2P Connection Established ==========>|
```

### WebRTC Multiplayer Peer

```gdscript
# webrtc_game.gd
extends Node

var rtc_peer := WebRTCMultiplayerPeer.new()
var _signaling: WebSocketPeer  # connection to signaling server

func host_game() -> void:
    rtc_peer.create_server()
    multiplayer.multiplayer_peer = rtc_peer
    _connect_to_signaling("ws://signal.example.com:9090")

func join_game() -> void:
    rtc_peer.create_client(2)  # our peer ID
    multiplayer.multiplayer_peer = rtc_peer
    _connect_to_signaling("ws://signal.example.com:9090")

func _connect_to_signaling(url: String) -> void:
    _signaling = WebSocketPeer.new()
    _signaling.connect_to_url(url)

func _process(_delta: float) -> void:
    if _signaling:
        _signaling.poll()
        while _signaling.get_available_packet_count() > 0:
            var msg := _signaling.get_packet().get_string_from_utf8()
            _handle_signaling_message(JSON.parse_string(msg))

func _handle_signaling_message(msg: Dictionary) -> void:
    match msg.type:
        "offer":
            var conn := _get_or_create_connection(msg.from)
            conn.set_remote_description("offer", msg.sdp)
        "answer":
            var conn := _get_or_create_connection(msg.from)
            conn.set_remote_description("answer", msg.sdp)
        "ice_candidate":
            var conn := _get_or_create_connection(msg.from)
            conn.add_ice_candidate(msg.media, msg.index, msg.name)

func _get_or_create_connection(peer_id: int) -> WebRTCPeerConnection:
    if rtc_peer.has_peer(peer_id):
        return rtc_peer.get_peer(peer_id).connection
    
    var conn := WebRTCPeerConnection.new()
    conn.initialize({
        "iceServers": [
            {"urls": ["stun:stun.l.google.com:19302"]},
            # Add TURN server for restrictive NATs:
            # {"urls": ["turn:turn.example.com:3478"],
            #  "username": "user", "credential": "pass"}
        ]
    })
    
    conn.session_description_created.connect(
        _on_session_description.bind(peer_id))
    conn.ice_candidate_created.connect(
        _on_ice_candidate.bind(peer_id))
    
    rtc_peer.add_peer(conn, peer_id)
    return conn

func _on_session_description(type: String, sdp: String, peer_id: int) -> void:
    var conn := rtc_peer.get_peer(peer_id).connection
    conn.set_local_description(type, sdp)
    _send_signaling({"type": type, "sdp": sdp, "to": peer_id})

func _on_ice_candidate(media: String, index: int, name: String, 
        peer_id: int) -> void:
    _send_signaling({
        "type": "ice_candidate",
        "media": media, "index": index, "name": name,
        "to": peer_id
    })

func _send_signaling(msg: Dictionary) -> void:
    _signaling.send_text(JSON.stringify(msg))
```

### STUN vs TURN

| Service | Purpose | Cost | Success Rate |
|---|---|---|---|
| **STUN** | Discovers your public IP, enables direct P2P | Free (Google, Twilio) | ~80% of NATs |
| **TURN** | Relays traffic when direct P2P fails | $ (bandwidth costs) | ~100% |

Always configure at least one STUN server. Add a TURN server as fallback for restrictive corporate/mobile NATs. Services like Twilio, Cloudflare, or self-hosted coturn provide TURN.

---

## 7. Signaling Server for WebRTC

The signaling server only brokers the initial connection — it doesn't relay game data. A minimal implementation:

### Node.js Signaling Server

```javascript
// signaling_server.js
const WebSocket = require('ws');
const wss = new WebSocket.Server({ port: 9090 });

const lobbies = new Map();

wss.on('connection', (ws) => {
    let peerId = null;
    let lobbyId = null;
    
    ws.on('message', (data) => {
        const msg = JSON.parse(data);
        
        switch (msg.type) {
            case 'join':
                peerId = msg.peer_id;
                lobbyId = msg.lobby_id;
                if (!lobbies.has(lobbyId)) {
                    lobbies.set(lobbyId, new Map());
                }
                const lobby = lobbies.get(lobbyId);
                
                // Notify existing peers
                for (const [id, peer] of lobby) {
                    peer.send(JSON.stringify({
                        type: 'peer_joined', peer_id: peerId
                    }));
                    ws.send(JSON.stringify({
                        type: 'peer_joined', peer_id: id
                    }));
                }
                lobby.set(peerId, ws);
                break;
            
            case 'offer':
            case 'answer':
            case 'ice_candidate':
                // Forward to target peer
                const targetLobby = lobbies.get(lobbyId);
                if (targetLobby && targetLobby.has(msg.to)) {
                    msg.from = peerId;
                    targetLobby.get(msg.to).send(JSON.stringify(msg));
                }
                break;
        }
    });
    
    ws.on('close', () => {
        if (lobbyId && lobbies.has(lobbyId)) {
            const lobby = lobbies.get(lobbyId);
            lobby.delete(peerId);
            for (const [, peer] of lobby) {
                peer.send(JSON.stringify({
                    type: 'peer_left', peer_id: peerId
                }));
            }
            if (lobby.size === 0) lobbies.delete(lobbyId);
        }
    });
});

console.log('Signaling server on ws://localhost:9090');
```

This is ~50 lines and handles thousands of concurrent connections. Deploy on any cheap VPS.

---

## 8. Relay Server Architecture

When direct P2P isn't possible or you need server authority, a relay forwards all traffic:

```gdscript
# relay_server.gd
# The relay is itself a Godot dedicated server that forwards packets
# between clients. Clients think they're talking to each other.

extends Node

var _connections: Dictionary = {}  # peer_id → ENetPacketPeer

func _ready() -> void:
    var peer := ENetMultiplayerPeer.new()
    peer.create_server(7777, 64)
    multiplayer.multiplayer_peer = peer
    
    multiplayer.peer_connected.connect(_on_connected)
    multiplayer.peer_disconnected.connect(_on_disconnected)

func _on_connected(id: int) -> void:
    _connections[id] = id
    # Notify other peers
    for peer_id in _connections:
        if peer_id != id:
            rpc_id(peer_id, &"_relay_peer_connected", id)
            rpc_id(id, &"_relay_peer_connected", peer_id)

@rpc("any_peer", "reliable")
func relay_message(target_id: int, data: PackedByteArray) -> void:
    var sender := multiplayer.get_remote_sender_id()
    if _connections.has(target_id):
        rpc_id(target_id, &"_receive_relayed", sender, data)

@rpc("authority", "reliable")
func _receive_relayed(_from_id: int, _data: PackedByteArray) -> void:
    pass  # Client-side implementation
```

---

## 9. Matchmaking

### Simple Lobby-Based Matchmaking

```gdscript
# matchmaking_server.gd (runs alongside or inside dedicated server)
class_name MatchmakingServer

var _waiting_players: Array[int] = []
var _matches: Dictionary = {}  # match_id → Array[int]
const MATCH_SIZE: int = 4

func add_player(peer_id: int, preferences: Dictionary) -> void:
    _waiting_players.append(peer_id)
    _try_create_match()

func _try_create_match() -> void:
    if _waiting_players.size() >= MATCH_SIZE:
        var match_id := _generate_match_id()
        var players := _waiting_players.slice(0, MATCH_SIZE)
        _waiting_players = _waiting_players.slice(MATCH_SIZE)
        
        _matches[match_id] = players
        
        # Notify all matched players
        for peer_id in players:
            rpc_id(peer_id, &"_on_match_found", match_id, players)

func _generate_match_id() -> String:
    return "%d_%d" % [Time.get_unix_time_from_system(), randi()]
```

### Skill-Based Matchmaking

```gdscript
class_name SkillMatchmaker

var _queue: Array[Dictionary] = []  # {peer_id, elo, queue_time}
const ELO_RANGE_BASE: float = 100.0
const ELO_RANGE_GROWTH: float = 50.0  # per 30s waiting
const MATCH_SIZE: int = 2

func add_player(peer_id: int, elo: float) -> void:
    _queue.append({
        "peer_id": peer_id,
        "elo": elo,
        "queue_time": Time.get_unix_time_from_system()
    })

func tick() -> void:
    var now := Time.get_unix_time_from_system()
    
    # Sort by ELO for efficient matching
    _queue.sort_custom(func(a, b): return a.elo < b.elo)
    
    var matched: Array[int] = []  # indices to remove
    
    for i in range(_queue.size()):
        if i in matched:
            continue
        var player_a := _queue[i]
        var wait_time := now - player_a.queue_time
        var elo_range := ELO_RANGE_BASE + (wait_time / 30.0) * ELO_RANGE_GROWTH
        
        for j in range(i + 1, _queue.size()):
            if j in matched:
                continue
            var player_b := _queue[j]
            if absf(player_a.elo - player_b.elo) <= elo_range:
                # Match found
                _create_match([player_a.peer_id, player_b.peer_id])
                matched.append(i)
                matched.append(j)
                break
    
    # Remove matched players (reverse order to preserve indices)
    matched.sort()
    matched.reverse()
    for idx in matched:
        _queue.remove_at(idx)
```

---

## 10. Authentication & Security

### Token-Based Authentication

```gdscript
# Client sends auth token when connecting
# Server validates before allowing gameplay

# client_auth.gd
func _connect_to_server(address: String, port: int, auth_token: String) -> void:
    var peer := ENetMultiplayerPeer.new()
    peer.create_client(address, port)
    multiplayer.multiplayer_peer = peer
    
    # Send auth token immediately after connecting
    multiplayer.peer_connected.connect(func(_id):
        rpc_id(1, &"authenticate", auth_token)
    )

# server_auth.gd
var _authenticated_peers: Dictionary = {}  # peer_id → player_data
var _pending_auth: Dictionary = {}  # peer_id → timeout

@rpc("any_peer", "reliable")
func authenticate(token: String) -> void:
    var peer_id := multiplayer.get_remote_sender_id()
    
    # Validate token against your auth service
    var player_data := await _validate_token(token)
    if player_data.is_empty():
        print("[Auth] Peer %d failed authentication" % peer_id)
        multiplayer.multiplayer_peer.disconnect_peer(peer_id)
        return
    
    _authenticated_peers[peer_id] = player_data
    _pending_auth.erase(peer_id)
    print("[Auth] Peer %d authenticated as %s" % [peer_id, player_data.name])
    
    # Now allow the player to join gameplay
    _spawn_player(peer_id, player_data)

func _on_peer_connected(id: int) -> void:
    # Start auth timeout — disconnect if not authenticated within 10s
    _pending_auth[id] = Time.get_unix_time_from_system()

func _process(_delta: float) -> void:
    var now := Time.get_unix_time_from_system()
    for peer_id in _pending_auth.keys():
        if now - _pending_auth[peer_id] > 10.0:
            print("[Auth] Peer %d auth timeout" % peer_id)
            multiplayer.multiplayer_peer.disconnect_peer(peer_id)
            _pending_auth.erase(peer_id)
```

---

## 11. Anti-Cheat Patterns

### Server-Authoritative Validation

The golden rule: **never trust the client.**

```gdscript
# BAD — client tells server where they are
@rpc("any_peer", "reliable")
func update_position(pos: Vector2) -> void:
    player.position = pos  # Client can teleport anywhere!

# GOOD — client sends input, server simulates
@rpc("any_peer", "unreliable")
func send_input(input: Dictionary) -> void:
    var peer_id := multiplayer.get_remote_sender_id()
    var player := _get_player(peer_id)
    if not player:
        return
    
    # Validate input values are within expected ranges
    var move_dir: Vector2 = input.get("direction", Vector2.ZERO)
    if move_dir.length() > 1.1:  # small tolerance for float precision
        move_dir = move_dir.normalized()
    
    # Server applies the input
    player.server_apply_input(move_dir, input.get("actions", []))
```

### Rate Limiting RPCs

```gdscript
# Prevent RPC spam / flooding
var _rpc_timestamps: Dictionary = {}  # peer_id → {rpc_name → [timestamps]}
const RPC_LIMITS: Dictionary = {
    "send_input": {"max_per_second": 66, "burst": 10},
    "send_chat": {"max_per_second": 2, "burst": 5},
    "use_item": {"max_per_second": 5, "burst": 3},
}

func check_rate_limit(peer_id: int, rpc_name: String) -> bool:
    if not RPC_LIMITS.has(rpc_name):
        return true
    
    var limits := RPC_LIMITS[rpc_name] as Dictionary
    var now := Time.get_ticks_msec() / 1000.0
    
    if not _rpc_timestamps.has(peer_id):
        _rpc_timestamps[peer_id] = {}
    if not _rpc_timestamps[peer_id].has(rpc_name):
        _rpc_timestamps[peer_id][rpc_name] = []
    
    var timestamps: Array = _rpc_timestamps[peer_id][rpc_name]
    
    # Remove timestamps older than 1 second
    while timestamps.size() > 0 and now - timestamps[0] > 1.0:
        timestamps.pop_front()
    
    if timestamps.size() >= limits.max_per_second:
        return false  # Rate limited
    
    timestamps.append(now)
    return true
```

### Movement Validation

```gdscript
# Server-side movement validation
func validate_movement(player: PlayerEntity, new_pos: Vector2, 
        delta: float) -> Vector2:
    var max_distance := player.max_speed * delta * 1.2  # 20% tolerance
    var actual_distance := player.position.distance_to(new_pos)
    
    if actual_distance > max_distance:
        # Player moved too far — either lag or cheat
        push_warning("[AntiCheat] Player %d moved %.1f (max %.1f)" % [
            player.peer_id, actual_distance, max_distance
        ])
        # Clamp to maximum allowed distance
        var direction := player.position.direction_to(new_pos)
        return player.position + direction * max_distance
    
    return new_pos
```

---

## 12. Cloud Deployment

### Docker Container

```dockerfile
# Dockerfile for Godot dedicated server
FROM ubuntu:22.04 AS base

RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Copy the exported server binary
COPY build/linux/my_game_server /app/server
COPY build/linux/my_game_server.pck /app/server.pck

WORKDIR /app
EXPOSE 7777/udp

ENTRYPOINT ["/app/server", "--headless"]
CMD ["--", "--port=7777", "--max-players=16"]
```

### Docker Compose for Development

```yaml
# docker-compose.yml
version: '3.8'
services:
  game-server:
    build: .
    ports:
      - "7777:7777/udp"
    environment:
      - MAX_PLAYERS=16
      - TICK_RATE=20
    restart: unless-stopped
    
  signaling:
    image: node:20-slim
    working_dir: /app
    volumes:
      - ./signaling:/app
    ports:
      - "9090:9090"
    command: node signaling_server.js
```

### Cloud Platform Options

| Platform | Pros | Cons | Best For |
|---|---|---|---|
| **AWS GameLift** | Auto-scaling, matchmaking built-in | Complex setup, AWS lock-in | Large-scale competitive games |
| **Google Cloud Run** | Container-based, scale to zero | No UDP support (WebSocket only) | Web-based games |
| **Hetzner/Vultr VPS** | Cheap, full control, UDP support | Manual scaling | Indie games, small communities |
| **Agones (Kubernetes)** | Open-source game server orchestration | Complex K8s setup | Medium-large studios |
| **Rivet.gg** | Game server hosting, simple API | Newer service | Indie-friendly, quick start |

---

## 13. Scaling & Load Balancing

### Multiple Server Instances

```gdscript
# master_server.gd — routes players to game server instances
class_name MasterServer

var _server_instances: Array[Dictionary] = []
# Each: {address, port, current_players, max_players, map, region}

func get_best_server(region: String, map: String) -> Dictionary:
    var candidates := _server_instances.filter(func(s):
        return s.region == region and s.map == map \
            and s.current_players < s.max_players
    )
    
    if candidates.is_empty():
        return _spawn_new_server(region, map)
    
    # Pick server with most players (fill before spreading)
    candidates.sort_custom(func(a, b): 
        return a.current_players > b.current_players)
    return candidates[0]
```

### Health Reporting

```gdscript
# Each game server reports health to master server
func _report_health() -> void:
    var health := {
        "instance_id": _instance_id,
        "current_players": multiplayer.get_peers().size(),
        "max_players": MAX_PLAYERS,
        "cpu_usage": Performance.get_monitor(Performance.TIME_PROCESS),
        "memory_mb": Performance.get_monitor(
            Performance.MEMORY_STATIC) / 1048576.0,
        "tick_rate_actual": _measure_actual_tick_rate(),
        "uptime_seconds": Time.get_ticks_msec() / 1000.0,
    }
    # POST to master server API
    _http_request.request(
        MASTER_SERVER_URL + "/health",
        ["Content-Type: application/json"],
        HTTPClient.METHOD_POST,
        JSON.stringify(health)
    )
```

---

## 14. Monitoring & Diagnostics

### Server Performance Logging

```gdscript
# server_monitor.gd
class_name ServerMonitor
extends Node

var _log_interval: float = 30.0  # log every 30 seconds
var _timer: float = 0.0

func _process(delta: float) -> void:
    _timer += delta
    if _timer >= _log_interval:
        _timer = 0.0
        _log_stats()

func _log_stats() -> void:
    var stats := {
        "timestamp": Time.get_datetime_string_from_system(),
        "players": multiplayer.get_peers().size(),
        "fps": Performance.get_monitor(Performance.TIME_FPS),
        "process_time_ms": Performance.get_monitor(
            Performance.TIME_PROCESS) * 1000.0,
        "physics_time_ms": Performance.get_monitor(
            Performance.TIME_PHYSICS_PROCESS) * 1000.0,
        "static_memory_mb": Performance.get_monitor(
            Performance.MEMORY_STATIC) / 1048576.0,
        "objects": Performance.get_monitor(Performance.OBJECT_COUNT),
        "nodes": Performance.get_monitor(Performance.OBJECT_NODE_COUNT),
    }
    
    # Log to stdout (captured by Docker/cloud logging)
    print("[Monitor] %s" % JSON.stringify(stats))
```

### Per-Player Network Stats

```gdscript
# Broadcast network stats to each client for their HUD
func _broadcast_net_stats() -> void:
    for peer_id in multiplayer.get_peers():
        var stats := get_peer_stats(peer_id)
        rpc_id(peer_id, &"_receive_net_stats", stats)

# Client-side HUD display
@rpc("authority", "unreliable")
func _receive_net_stats(stats: Dictionary) -> void:
    net_stats_label.text = "Ping: %dms | Loss: %.1f%%" % [
        stats.get("round_trip_time", 0) / 2,  # RTT → one-way
        stats.get("packet_loss", 0) * 100.0
    ]
```

---

## 15. Common Mistakes & Fixes

| Mistake | Problem | Fix |
|---|---|---|
| Running full rendering on dedicated server | Wasted CPU/GPU, requires display | Export with "Dedicated Server" feature; use `--headless` |
| Not validating client input on server | Clients can cheat freely | Always validate input server-side; never trust position/state from clients |
| No auth timeout | Unauthenticated connections consume slots | Disconnect peers that don't authenticate within 10s |
| Using TCP for real-time game state | High latency, head-of-line blocking | Use ENet (UDP) with `TRANSFER_MODE_UNRELIABLE` for position/state |
| Not handling reconnection | Disconnected player loses all state | Implement session tokens; allow reconnect within timeout window |
| Forgetting TURN servers for WebRTC | ~20% of players can't connect | Always configure a TURN fallback alongside STUN |
| No rate limiting on RPCs | Clients can flood the server | Track per-peer RPC rates; disconnect abusers |
| Syncing too much data | Bandwidth spikes, lag | Only sync what changed; use delta compression |
| Not staggering player spawns | Server overloaded on match start | Spawn players in batches over 1-2 seconds |
| Ignoring clock sync | Client timestamps drift from server | Implement server clock sync; use server tick as authority |

---

## C# Equivalents

### Headless Server Entry in C#

```csharp
using Godot;

public partial class Main : Node
{
    private const int DefaultPort = 7777;
    private const int MaxPlayers = 16;
    
    public override void _Ready()
    {
        if (IsServerMode())
            StartServer();
        else
            StartClientMenu();
    }
    
    private bool IsServerMode()
    {
        return OS.HasFeature("dedicated_server") 
            || OS.GetCmdlineArgs().Contains("--server");
    }
    
    private void StartServer()
    {
        GD.Print($"[Server] Starting on port {DefaultPort}");
        
        var peer = new ENetMultiplayerPeer();
        var error = peer.CreateServer(DefaultPort, MaxPlayers);
        if (error != Error.Ok)
        {
            GD.PushError($"Server failed: {error}");
            GetTree().Quit(1);
            return;
        }
        
        Multiplayer.MultiplayerPeer = peer;
        Multiplayer.PeerConnected += OnPeerConnected;
        Multiplayer.PeerDisconnected += OnPeerDisconnected;
        
        var world = GD.Load<PackedScene>("res://scenes/world.tscn")
            .Instantiate();
        AddChild(world);
        
        GD.Print("[Server] Ready.");
    }
    
    private void OnPeerConnected(long id) =>
        GD.Print($"[Server] Peer connected: {id}");
    
    private void OnPeerDisconnected(long id) =>
        GD.Print($"[Server] Peer disconnected: {id}");
    
    private void StartClientMenu() { /* Load main menu scene */ }
}
```

### WebSocket Client in C#

```csharp
using Godot;

public partial class NetworkClient : Node
{
    public void ConnectWebSocket(string address, int port)
    {
        var peer = new WebSocketMultiplayerPeer();
        var url = $"ws://{address}:{port}";
        var error = peer.CreateClient(url);
        
        if (error != Error.Ok)
        {
            GD.PushError($"WebSocket failed: {error}");
            return;
        }
        
        Multiplayer.MultiplayerPeer = peer;
    }
    
    public void ConnectENet(string address, int port)
    {
        var peer = new ENetMultiplayerPeer();
        var error = peer.CreateClient(address, port);
        
        if (error != Error.Ok)
        {
            GD.PushError($"ENet failed: {error}");
            return;
        }
        
        Multiplayer.MultiplayerPeer = peer;
    }
}
```
