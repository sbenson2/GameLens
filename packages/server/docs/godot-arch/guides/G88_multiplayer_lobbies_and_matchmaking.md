# G88 — Multiplayer Lobbies and Matchmaking

> **Category:** guide · **Engine:** Godot 4.x · **Related:** [G13 Networking & Multiplayer](./G13_networking_and_multiplayer.md) · [G27 Dedicated Servers & Advanced Networking](./G27_dedicated_servers_advanced_networking.md) · [G72 Multiplayer State Sync & Prediction](./G72_multiplayer_state_sync_and_prediction.md) · [G86 Multiplayer Security & Authority](./G86_multiplayer_security_and_authority.md)

---

## What This Guide Covers

Building the **pre-game multiplayer experience** — lobby creation, player discovery, matchmaking, session lifecycle, and the handoff from lobby into gameplay. Godot's high-level multiplayer API handles RPC and state sync once players are connected, but the lobby layer that gets players *into* a session requires deliberate architecture.

**Use this guide when:** you need players to create/join rooms, implement skill-based or region-based matchmaking, handle host migration, or integrate with platform lobby services (Steam, Epic, etc.).

**G13** covers networking fundamentals. **G27** covers dedicated server architecture. **G86** covers authority and anti-cheat. This guide sits between them — connecting players before gameplay begins and managing session lifecycle.

---

## Table of Contents

1. [Lobby Architecture Overview](#1-lobby-architecture-overview)
2. [In-Engine Lobby with ENet](#2-in-engine-lobby-with-enet)
3. [WebSocket Lobby for Web Exports](#3-websocket-lobby-for-web-exports)
4. [Lobby State Machine](#4-lobby-state-machine)
5. [Player Session Management](#5-player-session-management)
6. [Matchmaking Patterns](#6-matchmaking-patterns)
7. [Steam Lobby Integration](#7-steam-lobby-integration)
8. [Host Migration](#8-host-migration)
9. [Relay Servers and NAT Traversal](#9-relay-servers-and-nat-traversal)
10. [Security Considerations](#10-security-considerations)
11. [Common Mistakes](#11-common-mistakes)

---

## 1. Lobby Architecture Overview

### Three Common Architectures

| Architecture | Pros | Cons | Best For |
|---|---|---|---|
| **Player-hosted (P2P)** | No server cost, low latency for host | NAT issues, host advantage, no persistence | Local/casual games, game jams |
| **Dedicated lobby server** | Reliable, authoritative matchmaking | Ongoing server cost, more infrastructure | Competitive games, persistent sessions |
| **Platform relay** (Steam, Epic) | NAT traversal solved, trusted identity | Platform lock-in, API constraints | Steam/Epic releases |

### Separation of Concerns

```
┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│  Lobby Layer │ ──► │  Handoff     │ ──► │  Game Layer  │
│  (discovery, │     │  (transfer   │     │  (gameplay,  │
│   matching,  │     │   players,   │     │   state sync │
│   readying)  │     │   load map)  │     │   RPCs)      │
└──────────────┘     └──────────────┘     └──────────────┘
```

Keep the lobby as a distinct scene/state — never mix lobby management logic with gameplay code.

---

## 2. In-Engine Lobby with ENet

### Lobby Server (GDScript)

```gdscript
# lobby_server.gd — Runs on the host
extends Node

signal player_joined(peer_id: int, player_info: Dictionary)
signal player_left(peer_id: int)
signal all_players_ready

const MAX_PLAYERS: int = 8
const DEFAULT_PORT: int = 7350

## Tracks connected players: { peer_id: { name, ready, team, ... } }
var players: Dictionary[int, Dictionary] = {}
var _lobby_open: bool = true

func host_lobby(port: int = DEFAULT_PORT) -> Error:
	var peer := ENetMultiplayerPeer.new()
	# server_relay = true means the host forwards packets between clients
	# Set false only if clients connect directly to each other
	peer.server_relay = true
	var err := peer.create_server(port, MAX_PLAYERS)
	if err != OK:
		push_error("Failed to create lobby server: %s" % error_string(err))
		return err

	multiplayer.multiplayer_peer = peer
	multiplayer.peer_connected.connect(_on_peer_connected)
	multiplayer.peer_disconnected.connect(_on_peer_disconnected)

	# Register the host as player 1
	_register_player(1, {"name": "Host", "ready": false, "team": 0})
	return OK


func close_lobby() -> void:
	_lobby_open = false


func _on_peer_connected(peer_id: int) -> void:
	if not _lobby_open:
		# Reject late joiners — forcibly disconnect
		multiplayer.multiplayer_peer.disconnect_peer(peer_id)
		return
	# Client will call register_player via RPC


func _on_peer_disconnected(peer_id: int) -> void:
	if players.has(peer_id):
		players.erase(peer_id)
		player_left.emit(peer_id)
		_broadcast_player_list.rpc()


## Called by the joining client to register their info
@rpc("any_peer", "reliable")
func register_player(info: Dictionary) -> void:
	var sender_id := multiplayer.get_remote_sender_id()
	if players.size() >= MAX_PLAYERS:
		_reject_player.rpc_id(sender_id, "Lobby is full")
		return
	# Sanitize — only accept expected keys
	var clean_info: Dictionary[String, Variant] = {
		"name": str(info.get("name", "Player")).substr(0, 32),
		"ready": false,
		"team": 0,
	}
	_register_player(sender_id, clean_info)


func _register_player(peer_id: int, info: Dictionary) -> void:
	players[peer_id] = info
	player_joined.emit(peer_id, info)
	_broadcast_player_list.rpc()


@rpc("any_peer", "reliable")
func set_ready(is_ready: bool) -> void:
	var sender_id := multiplayer.get_remote_sender_id()
	if players.has(sender_id):
		players[sender_id]["ready"] = is_ready
		_broadcast_player_list.rpc()
		_check_all_ready()


func _check_all_ready() -> void:
	if players.size() < 2:
		return
	for info: Dictionary in players.values():
		if not info.get("ready", false):
			return
	all_players_ready.emit()


@rpc("authority", "reliable", "call_local")
func _broadcast_player_list() -> void:
	# Override on clients to update the UI
	pass


@rpc("authority", "reliable")
func _reject_player(reason: String) -> void:
	# Override on clients to show rejection message
	pass
```

### Lobby Client (GDScript)

```gdscript
# lobby_client.gd — Runs on joining clients
extends Node

var my_info: Dictionary = {"name": "Player"}

func join_lobby(address: String, port: int = 7350) -> Error:
	var peer := ENetMultiplayerPeer.new()
	var err := peer.create_client(address, port)
	if err != OK:
		push_error("Failed to join lobby: %s" % error_string(err))
		return err

	multiplayer.multiplayer_peer = peer
	multiplayer.connected_to_server.connect(_on_connected)
	multiplayer.connection_failed.connect(_on_connection_failed)
	multiplayer.server_disconnected.connect(_on_server_disconnected)
	return OK


func _on_connected() -> void:
	# Register ourselves with the host
	register_player.rpc_id(1, my_info)


func _on_connection_failed() -> void:
	push_warning("Connection to lobby failed")
	multiplayer.multiplayer_peer = null


func _on_server_disconnected() -> void:
	push_warning("Lost connection to lobby host")
	multiplayer.multiplayer_peer = null
```

### C# Equivalent (Server)

```csharp
using Godot;
using System.Collections.Generic;
using System.Linq;

public partial class LobbyServer : Node
{
    [Signal] public delegate void PlayerJoinedEventHandler(long peerId, Godot.Collections.Dictionary info);
    [Signal] public delegate void AllPlayersReadyEventHandler();

    private const int MaxPlayers = 8;
    private const int DefaultPort = 7350;

    // peerId -> player info
    private readonly Dictionary<long, Godot.Collections.Dictionary> _players = new();
    private bool _lobbyOpen = true;

    public Error HostLobby(int port = DefaultPort)
    {
        var peer = new ENetMultiplayerPeer();
        peer.ServerRelay = true;
        var err = peer.CreateServer(port, MaxPlayers);
        if (err != Error.Ok)
        {
            GD.PushError($"Failed to create lobby: {err}");
            return err;
        }

        Multiplayer.MultiplayerPeer = peer;
        Multiplayer.PeerConnected += OnPeerConnected;
        Multiplayer.PeerDisconnected += OnPeerDisconnected;

        RegisterHost();
        return Error.Ok;
    }

    private void RegisterHost()
    {
        var info = new Godot.Collections.Dictionary
        {
            ["name"] = "Host",
            ["ready"] = false,
            ["team"] = 0
        };
        _players[1] = info;
    }

    private void OnPeerConnected(long peerId)
    {
        if (!_lobbyOpen)
        {
            Multiplayer.MultiplayerPeer.DisconnectPeer((int)peerId);
        }
    }

    private void OnPeerDisconnected(long peerId)
    {
        _players.Remove(peerId);
    }

    [Rpc(MultiplayerApi.RpcMode.AnyPeer, TransferMode = MultiplayerPeer.TransferModeEnum.Reliable)]
    public void RegisterPlayer(Godot.Collections.Dictionary info)
    {
        long senderId = Multiplayer.GetRemoteSenderId();
        if (_players.Count >= MaxPlayers) return;

        var cleanInfo = new Godot.Collections.Dictionary
        {
            ["name"] = ((string)(info.GetValueOrDefault("name", "Player"))).Substr(0, 32),
            ["ready"] = false,
            ["team"] = 0
        };
        _players[senderId] = cleanInfo;
    }

    [Rpc(MultiplayerApi.RpcMode.AnyPeer, TransferMode = MultiplayerPeer.TransferModeEnum.Reliable)]
    public void SetReady(bool isReady)
    {
        long senderId = Multiplayer.GetRemoteSenderId();
        if (_players.TryGetValue(senderId, out var info))
        {
            info["ready"] = isReady;
            CheckAllReady();
        }
    }

    private void CheckAllReady()
    {
        if (_players.Count < 2) return;
        bool allReady = _players.Values.All(p => (bool)p["ready"]);
        if (allReady) EmitSignal(SignalName.AllPlayersReady);
    }
}
```

---

## 3. WebSocket Lobby for Web Exports

ENet does not work in web exports. Use `WebSocketMultiplayerPeer` instead.

```gdscript
# web_lobby.gd — WebSocket-based lobby for HTML5 builds
extends Node

func host_lobby_ws(port: int = 7351) -> Error:
	var peer := WebSocketMultiplayerPeer.new()
	var err := peer.create_server(port)
	if err != OK:
		return err
	multiplayer.multiplayer_peer = peer
	return OK


func join_lobby_ws(url: String) -> Error:
	# url format: "ws://example.com:7351" or "wss://..." for TLS
	var peer := WebSocketMultiplayerPeer.new()
	var err := peer.create_client(url)
	if err != OK:
		return err
	multiplayer.multiplayer_peer = peer
	return OK
```

```csharp
public Error HostLobbyWebSocket(int port = 7351)
{
    var peer = new WebSocketMultiplayerPeer();
    var err = peer.CreateServer(port);
    if (err != Error.Ok) return err;
    Multiplayer.MultiplayerPeer = peer;
    return Error.Ok;
}

public Error JoinLobbyWebSocket(string url)
{
    var peer = new WebSocketMultiplayerPeer();
    var err = peer.CreateClient(url);
    if (err != Error.Ok) return err;
    Multiplayer.MultiplayerPeer = peer;
    return Error.Ok;
}
```

**Key difference:** WebSocket lobbies need an externally reachable server (no P2P NAT traversal). Deploy a lightweight relay or use a cloud WebSocket service.

---

## 4. Lobby State Machine

Model the lobby as an explicit state machine to prevent race conditions.

```gdscript
# lobby_state.gd
class_name LobbyState extends RefCounted

enum State {
	DISCONNECTED,   ## Not connected to any lobby
	CONNECTING,     ## Connection in progress
	IN_LOBBY,       ## Connected, waiting in lobby
	READYING,       ## All slots filled, ready-check phase
	LOADING,        ## Map/assets loading before gameplay
	IN_GAME,        ## Handed off to gameplay scene
}

var current: State = State.DISCONNECTED

## Validates whether a transition is legal
func can_transition(to: State) -> bool:
	match current:
		State.DISCONNECTED:
			return to == State.CONNECTING
		State.CONNECTING:
			return to in [State.IN_LOBBY, State.DISCONNECTED]
		State.IN_LOBBY:
			return to in [State.READYING, State.DISCONNECTED]
		State.READYING:
			return to in [State.LOADING, State.IN_LOBBY, State.DISCONNECTED]
		State.LOADING:
			return to in [State.IN_GAME, State.DISCONNECTED]
		State.IN_GAME:
			return to == State.DISCONNECTED
	return false


func transition(to: State) -> bool:
	if can_transition(to):
		current = to
		return true
	push_warning("Invalid lobby transition: %s -> %s" % [
		State.keys()[current], State.keys()[to]
	])
	return false
```

---

## 5. Player Session Management

### Session Tokens

Assign a unique session token per player so you can track reconnections.

```gdscript
# session_manager.gd
extends Node

## Maps session_token -> { peer_id, player_data, disconnect_time }
var sessions: Dictionary[String, Dictionary] = {}
const RECONNECT_WINDOW_SEC: float = 30.0

func create_session(peer_id: int, player_name: String) -> String:
	var token := _generate_token()
	sessions[token] = {
		"peer_id": peer_id,
		"name": player_name,
		"disconnect_time": -1.0,
	}
	return token


func handle_reconnect(token: String, new_peer_id: int) -> bool:
	if not sessions.has(token):
		return false
	var session: Dictionary = sessions[token]
	var disconnect_time: float = session.get("disconnect_time", -1.0)
	if disconnect_time > 0.0:
		var elapsed := Time.get_unix_time_from_system() - disconnect_time
		if elapsed > RECONNECT_WINDOW_SEC:
			sessions.erase(token)
			return false  # Too late — session expired
	session["peer_id"] = new_peer_id
	session["disconnect_time"] = -1.0
	return true


func mark_disconnected(peer_id: int) -> void:
	for token: String in sessions:
		if sessions[token].get("peer_id") == peer_id:
			sessions[token]["disconnect_time"] = Time.get_unix_time_from_system()
			break


func _generate_token() -> String:
	var bytes := PackedByteArray()
	bytes.resize(16)
	for i: int in bytes.size():
		bytes[i] = randi_range(0, 255)
	return bytes.hex_encode()
```

---

## 6. Matchmaking Patterns

### Simple Skill-Based Matchmaking

```gdscript
# matchmaker.gd — Server-side matchmaking queue
class_name Matchmaker extends RefCounted

const MATCH_SIZE: int = 4
const MAX_SKILL_GAP: float = 200.0
const SKILL_GAP_EXPANSION_RATE: float = 50.0  # Widens per second

## { peer_id: { skill_rating, queue_time, ... } }
var queue: Dictionary[int, Dictionary] = {}

func add_to_queue(peer_id: int, skill_rating: float) -> void:
	queue[peer_id] = {
		"skill": skill_rating,
		"queue_time": Time.get_ticks_msec(),
	}


func remove_from_queue(peer_id: int) -> void:
	queue.erase(peer_id)


## Call periodically (e.g., every 1-2 seconds) to attempt forming matches
func try_form_match() -> Array[int]:
	if queue.size() < MATCH_SIZE:
		return []

	# Sort players by skill
	var sorted_ids: Array[int] = []
	sorted_ids.assign(queue.keys())
	sorted_ids.sort_custom(func(a: int, b: int) -> bool:
		return queue[a]["skill"] < queue[b]["skill"]
	)

	# Sliding window — find the tightest group of MATCH_SIZE players
	var best_group: Array[int] = []
	var best_spread: float = INF

	for i: int in range(sorted_ids.size() - MATCH_SIZE + 1):
		var group: Array[int] = sorted_ids.slice(i, i + MATCH_SIZE)
		var low: float = queue[group[0]]["skill"]
		var high: float = queue[group[-1]]["skill"]
		var spread: float = high - low

		# Allow wider gaps for players who've waited longer
		var oldest_wait_ms: float = 0.0
		for pid: int in group:
			var wait: float = Time.get_ticks_msec() - queue[pid]["queue_time"]
			oldest_wait_ms = maxf(oldest_wait_ms, wait)
		var allowed_gap: float = MAX_SKILL_GAP + (oldest_wait_ms / 1000.0) * SKILL_GAP_EXPANSION_RATE

		if spread <= allowed_gap and spread < best_spread:
			best_spread = spread
			best_group = group

	if best_group.size() == MATCH_SIZE:
		for pid: int in best_group:
			queue.erase(pid)
		return best_group

	return []
```

### Region-Based Matchmaking

Add a `region` field to the queue entry and filter matches to same-region first, then expand after a timeout.

---

## 7. Steam Lobby Integration

If shipping on Steam, use Steamworks lobbies instead of rolling your own discovery layer.

```gdscript
# steam_lobby.gd — Requires GodotSteam plugin
extends Node

var current_lobby_id: int = 0

func create_steam_lobby(max_members: int = 8) -> void:
	Steam.createLobby(Steam.LOBBY_TYPE_PUBLIC, max_members)
	# Wait for lobby_created callback
	Steam.lobby_created.connect(_on_lobby_created)


func _on_lobby_created(result: int, lobby_id: int) -> void:
	if result != Steam.RESULT_OK:
		push_error("Steam lobby creation failed: %d" % result)
		return
	current_lobby_id = lobby_id
	# Set lobby metadata for discovery
	Steam.setLobbyData(lobby_id, "game_mode", "deathmatch")
	Steam.setLobbyData(lobby_id, "map", "arena_01")
	Steam.setLobbyData(lobby_id, "version", "1.0.0")  # Filter by game version


func find_lobbies(game_mode: String) -> void:
	# Add search filters before requesting the lobby list
	Steam.addRequestLobbyListStringFilter("game_mode", game_mode, Steam.LOBBY_COMPARISON_EQUAL)
	Steam.addRequestLobbyListStringFilter("version", "1.0.0", Steam.LOBBY_COMPARISON_EQUAL)
	Steam.addRequestLobbyListResultCountFilter(20)
	Steam.requestLobbyList()
	Steam.lobby_match_list.connect(_on_lobby_list)


func _on_lobby_list(lobbies: Array) -> void:
	for lobby_id: int in lobbies:
		var name: String = Steam.getLobbyData(lobby_id, "name")
		var mode: String = Steam.getLobbyData(lobby_id, "game_mode")
		var member_count: int = Steam.getNumLobbyMembers(lobby_id)
		var max_members: int = Steam.getLobbyMemberLimit(lobby_id)
		print("Lobby: %s | Mode: %s | Players: %d/%d" % [name, mode, member_count, max_members])


func join_steam_lobby(lobby_id: int) -> void:
	Steam.joinLobby(lobby_id)
```

```csharp
// C# with Steamworks.NET or Facepunch.Steamworks
using Steamworks;

public partial class SteamLobbyManager : Node
{
    private Lobby? _currentLobby;

    public async void CreateLobby(int maxMembers = 8)
    {
        var lobby = await SteamMatchmaking.CreateLobbyAsync(maxMembers);
        if (lobby.HasValue)
        {
            _currentLobby = lobby.Value;
            _currentLobby.Value.SetData("game_mode", "deathmatch");
            _currentLobby.Value.SetData("version", "1.0.0");
        }
    }

    public async void FindLobbies()
    {
        var lobbies = await SteamMatchmaking.LobbyList
            .WithKeyValue("version", "1.0.0")
            .RequestAsync();

        if (lobbies == null) return;
        foreach (var lobby in lobbies)
        {
            GD.Print($"Lobby: {lobby.Id} | Members: {lobby.MemberCount}/{lobby.MaxMembers}");
        }
    }
}
```

### Handoff: Steam Lobby → ENet Gameplay

Once all players are in the Steam lobby and ready, the host starts an ENet server and shares the connection info via lobby data:

```gdscript
func start_game_from_lobby() -> void:
	# Host starts ENet server
	var peer := ENetMultiplayerPeer.new()
	peer.create_server(7350, Steam.getNumLobbyMembers(current_lobby_id))
	multiplayer.multiplayer_peer = peer

	# Share connection info via Steam lobby metadata
	# For P2P over Steam relay, share the host's Steam ID instead of IP
	Steam.setLobbyData(current_lobby_id, "host_steam_id", str(Steam.getSteamID()))
	Steam.setLobbyData(current_lobby_id, "state", "in_game")
```

---

## 8. Host Migration

When the lobby host disconnects in a P2P setup, promote another player.

```gdscript
# host_migration.gd
extends Node

## Deterministic: lowest peer_id becomes new host
func elect_new_host(remaining_peers: Array[int]) -> int:
	if remaining_peers.is_empty():
		return -1
	remaining_peers.sort()
	return remaining_peers[0]


func handle_host_disconnect(old_host_id: int) -> void:
	var remaining: Array[int] = []
	for pid: int in multiplayer.get_peers():
		if pid != old_host_id:
			remaining.append(pid)
	remaining.append(multiplayer.get_unique_id())  # Include self

	var new_host := elect_new_host(remaining)
	if new_host == multiplayer.get_unique_id():
		_become_host()
	else:
		_wait_for_new_host(new_host)


func _become_host() -> void:
	# Create a new ENet server and wait for others to reconnect
	print("I am the new host. Starting server...")
	var peer := ENetMultiplayerPeer.new()
	peer.create_server(7350)
	multiplayer.multiplayer_peer = peer


func _wait_for_new_host(host_peer_id: int) -> void:
	# In practice: wait for a signal or timeout, then connect to new host
	print("Waiting for peer %d to become host..." % host_peer_id)
```

> **Caveat:** Host migration is complex and rarely seamless. For competitive games, prefer a dedicated server model (see G27).

---

## 9. Relay Servers and NAT Traversal

### The NAT Problem

Most players are behind NAT routers. Direct P2P connections fail unless at least one side has an open port or you use:

- **STUN** — Discovers your public IP/port. Works for ~80% of NAT types.
- **TURN** — Relay server as fallback when direct connection fails.
- **Platform relay** — Steam Networking Sockets, Epic relay, etc.

### Godot's Built-In Relay

`ENetMultiplayerPeer.server_relay = true` (the default) means all traffic routes through the host. This is a simple relay model but gives the host a latency advantage.

### External Relay Pattern

For a fair experience, route traffic through a neutral relay server:

```
Client A ──► Relay Server ◄── Client B
                  │
                  ▼
             Client C
```

Deploy a lightweight relay using Godot's headless mode or a custom WebSocket/UDP relay.

---

## 10. Security Considerations

| Threat | Mitigation |
|---|---|
| Lobby flooding (DoS) | Rate-limit join attempts per IP; require platform auth |
| Spoofed player info | Server validates and sanitizes all player data |
| Session token theft | Use HTTPS/WSS for token exchange; expire tokens quickly |
| Fake ready signals | Only the authority (server) tracks ready state |
| Version mismatch | Include game version in lobby metadata; reject mismatched clients |

See **G86** for in-depth multiplayer security patterns.

---

## 11. Common Mistakes

| Mistake | Why It Breaks | Fix |
|---|---|---|
| Mixing lobby and gameplay scenes | State leaks, signals fire in wrong context | Separate lobby and game into distinct scene trees |
| Not sanitizing player names | XSS in UI, injection in RPC strings | Clamp length, strip special characters server-side |
| No reconnection window | Momentary disconnects boot players permanently | Track session tokens, allow reconnect within a timeout |
| Trusting the client's ready state | Clients can skip ready and force game start | Only the server decides when to transition to gameplay |
| Hardcoding port numbers | Firewalls block common ports | Let players configure ports or use platform relay |
| Starting gameplay before all clients confirm scene loaded | Desync on first frame | Wait for `"loaded"` RPC from every peer before unpausing |
