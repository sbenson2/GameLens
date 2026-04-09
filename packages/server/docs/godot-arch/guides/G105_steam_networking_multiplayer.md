# G105 — Steam Networking for Multiplayer

> **Category:** guide · **Engine:** Godot 4.4+ · **Related:** [G13 Networking & Multiplayer](./G13_networking_and_multiplayer.md) · [G42 Platform Integration & Steamworks](./G42_platform_integration_and_steamworks.md) · [G27 Dedicated Servers & Advanced Networking](./G27_dedicated_servers_advanced_networking.md) · [G72 Multiplayer State Sync & Prediction](./G72_multiplayer_state_sync_and_prediction.md) · [G86 Multiplayer Security & Authority](./G86_multiplayer_security_and_authority.md) · [G88 Multiplayer Lobbies & Matchmaking](./G88_multiplayer_lobbies_and_matchmaking.md)

Most indie multiplayer games ship on Steam, and Steam provides a production-grade networking layer — **Steam Networking Sockets** — that handles NAT traversal, relay fallback, and encrypted connections without you running relay infrastructure. This guide covers integrating Steam Networking Sockets with Godot 4's high-level multiplayer API using GodotSteam and the Steam Multiplayer Peer extension, implementing lobby-based matchmaking, and building a complete P2P multiplayer flow from lobby creation to gameplay.

---

## Table of Contents

1. [Why Steam Networking Instead of Raw ENet](#1-why-steam-networking-instead-of-raw-enet)
2. [Architecture Overview](#2-architecture-overview)
3. [Installing GodotSteam](#3-installing-godotsteam)
4. [Steam Multiplayer Peer Setup](#4-steam-multiplayer-peer-setup)
5. [Lobby Creation and Discovery](#5-lobby-creation-and-discovery)
6. [Joining a Lobby and Starting the Session](#6-joining-a-lobby-and-starting-the-session)
7. [Using Godot's High-Level Multiplayer API](#7-using-godots-high-level-multiplayer-api)
8. [P2P Connection Flow](#8-p2p-connection-flow)
9. [Handling Disconnections and Reconnection](#9-handling-disconnections-and-reconnection)
10. [Steam Relay and NAT Traversal](#10-steam-relay-and-nat-traversal)
11. [Voice Chat via Steam](#11-voice-chat-via-steam)
12. [Testing Without Multiple Steam Accounts](#12-testing-without-multiple-steam-accounts)
13. [Production Checklist](#13-production-checklist)
14. [Common Mistakes](#14-common-mistakes)

---

## 1. Why Steam Networking Instead of Raw ENet

Godot's default `ENetMultiplayerPeer` works well for LAN and direct-connect scenarios, but has significant limitations for shipping a Steam game:

| Feature | ENet (Default) | Steam Networking Sockets |
|---------|---------------|------------------------|
| NAT Traversal | ❌ Manual port forwarding | ✅ Automatic (ICE + STUN + relay) |
| Relay Fallback | ❌ None | ✅ Valve relay servers (free) |
| Encryption | ❌ None by default | ✅ Built-in encryption |
| Identity | ❌ IP-based | ✅ Steam ID-based |
| Matchmaking | ❌ Build your own | ✅ Steam Lobby API |
| Anti-cheat Identity | ❌ Spoofable | ✅ Tied to Steam account |
| Infrastructure Cost | ❌ You host relay/TURN | ✅ Free via Valve |

For a Steam-published game with online multiplayer, Steam Networking Sockets eliminates the need for relay server infrastructure entirely.

---

## 2. Architecture Overview

```
Player A (Host)                    Player B (Client)
┌──────────────┐                  ┌──────────────┐
│ GodotSteam   │                  │ GodotSteam   │
│ + SteamMulti │◄────────────────►│ + SteamMulti │
│   playerPeer │   Steam Network  │   playerPeer │
└──────┬───────┘   Sockets (P2P)  └──────┬───────┘
       │                                  │
       ▼                                  ▼
 Godot MultiplayerAPI              Godot MultiplayerAPI
 (RPCs, sync, authority)           (RPCs, sync, authority)
```

The key insight: **Steam Multiplayer Peer** is a drop-in replacement for `ENetMultiplayerPeer`. It implements the `MultiplayerPeer` interface, so all of Godot's `@rpc`, `MultiplayerSynchronizer`, and `MultiplayerSpawner` systems work unchanged.

---

## 3. Installing GodotSteam

GodotSteam wraps the Steamworks SDK as a GDExtension. Install via one of these methods:

### Method A: Asset Library (Simplest)

1. Open Godot → AssetLib tab → Search "GodotSteam".
2. Download and install the GDExtension version (not the module version).
3. Restart the editor.

### Method B: GitHub Release

1. Download the latest GDExtension release from [github.com/GodotSteam/GodotSteam](https://github.com/GodotSteam/GodotSteam).
2. Extract the `addons/godotsteam/` folder into your project's `addons/` directory.
3. Ensure the `.gdextension` file and platform binaries are present.

### Steam Multiplayer Peer (Companion Extension)

For lobby-based P2P with Godot's high-level multiplayer, also install the **Steam Multiplayer Peer** extension:

1. Download from [github.com/expressobits/steam-multiplayer-peer](https://github.com/expressobits/steam-multiplayer-peer) or the Godot Asset Library.
2. Place in `addons/steam_multiplayer_peer/`.

### Verify Installation

```gdscript
func _ready() -> void:
    if Engine.has_singleton("Steam"):
        print("GodotSteam loaded successfully")
        var steam: Object = Engine.get_singleton("Steam")
        var init_result: Dictionary = steam.steamInit(false)
        print("Steam Init: ", init_result)
    else:
        push_error("GodotSteam not found — check addon installation")
```

---

## 4. Steam Multiplayer Peer Setup

The `SteamMultiplayerPeer` class replaces `ENetMultiplayerPeer` in your multiplayer setup:

### Creating a Host

```gdscript
extends Node

var steam: Object
var peer: SteamMultiplayerPeer

func _ready() -> void:
    steam = Engine.get_singleton("Steam")
    steam.steamInit(false)

func host_game() -> void:
    peer = SteamMultiplayerPeer.new()

    # Create as host — this sets multiplayer.get_unique_id() to 1
    peer.create_host(0)  # 0 = no connection limit override

    multiplayer.multiplayer_peer = peer

    # Connect standard multiplayer signals
    multiplayer.peer_connected.connect(_on_peer_connected)
    multiplayer.peer_disconnected.connect(_on_peer_disconnected)

    print("Hosting game as Steam ID: ", steam.getSteamID())

func _on_peer_connected(id: int) -> void:
    print("Player connected: ", id)

func _on_peer_disconnected(id: int) -> void:
    print("Player disconnected: ", id)
```

### Joining a Host

```gdscript
func join_game(host_steam_id: int) -> void:
    peer = SteamMultiplayerPeer.new()

    # Connect to the host's Steam ID
    peer.create_client(host_steam_id, 0)

    multiplayer.multiplayer_peer = peer
    print("Joining game hosted by Steam ID: ", host_steam_id)
```

### C# Equivalent

```csharp
using Godot;

public partial class NetworkManager : Node
{
    private GodotObject _steam;
    private SteamMultiplayerPeer _peer;

    public override void _Ready()
    {
        _steam = Engine.GetSingleton("Steam");
        _steam.Call("steamInit", false);
    }

    public void HostGame()
    {
        _peer = new SteamMultiplayerPeer();
        _peer.CreateHost(0);
        Multiplayer.MultiplayerPeer = _peer;

        Multiplayer.PeerConnected += OnPeerConnected;
        Multiplayer.PeerDisconnected += OnPeerDisconnected;

        GD.Print($"Hosting as Steam ID: {_steam.Call("getSteamID")}");
    }

    public void JoinGame(long hostSteamId)
    {
        _peer = new SteamMultiplayerPeer();
        _peer.CreateClient(hostSteamId, 0);
        Multiplayer.MultiplayerPeer = _peer;
    }

    private void OnPeerConnected(long id) => GD.Print($"Player connected: {id}");
    private void OnPeerDisconnected(long id) => GD.Print($"Player disconnected: {id}");
}
```

---

## 5. Lobby Creation and Discovery

Steam Lobbies provide matchmaking without a dedicated server. The host creates a lobby, and clients discover it through search or friend invites.

### Creating a Lobby

```gdscript
var steam: Object
var current_lobby_id: int = 0

func _ready() -> void:
    steam = Engine.get_singleton("Steam")
    steam.steamInit(false)

    # Connect lobby signals
    steam.lobby_created.connect(_on_lobby_created)
    steam.lobby_joined.connect(_on_lobby_joined)
    steam.lobby_match_list.connect(_on_lobby_match_list)

func create_lobby(max_players: int = 4) -> void:
    # Lobby types:
    # 0 = Private (invite only)
    # 1 = Friends Only
    # 2 = Public
    # 3 = Invisible (for matchmaking backends)
    steam.createLobby(2, max_players)  # Public, 4 players

func _on_lobby_created(result: int, lobby_id: int) -> void:
    if result == 1:  # k_EResultOK
        current_lobby_id = lobby_id
        print("Lobby created: ", lobby_id)

        # Set lobby metadata for search/filtering
        steam.setLobbyData(lobby_id, "game_mode", "deathmatch")
        steam.setLobbyData(lobby_id, "map", "arena_01")
        steam.setLobbyData(lobby_id, "version", "1.2.0")

        # Host the multiplayer session
        host_game()
    else:
        push_error("Failed to create lobby: ", result)
```

### Searching for Lobbies

```gdscript
func find_lobbies() -> void:
    # Add search filters before requesting the list
    steam.addRequestLobbyListStringFilter(
        "game_mode", "deathmatch", 0  # 0 = Equal
    )
    steam.addRequestLobbyListStringFilter(
        "version", "1.2.0", 0
    )
    # Limit results
    steam.addRequestLobbyListResultCountFilter(20)

    # Request the lobby list (async — result comes via signal)
    steam.requestLobbyList()

func _on_lobby_match_list(lobbies: Array) -> void:
    print("Found %d lobbies" % lobbies.size())
    for lobby_id: int in lobbies:
        var host_name: String = steam.getLobbyData(lobby_id, "host_name")
        var map_name: String = steam.getLobbyData(lobby_id, "map")
        var player_count: int = steam.getNumLobbyMembers(lobby_id)
        var max_players: int = steam.getLobbyMemberLimit(lobby_id)
        print("  Lobby %d: %s on %s (%d/%d)" % [
            lobby_id, host_name, map_name, player_count, max_players
        ])
```

### C# Lobby Creation

```csharp
private long _currentLobbyId = 0;

public override void _Ready()
{
    _steam = Engine.GetSingleton("Steam");
    _steam.Call("steamInit", false);

    _steam.Connect("lobby_created", new Callable(this, nameof(OnLobbyCreated)));
    _steam.Connect("lobby_joined", new Callable(this, nameof(OnLobbyJoined)));
}

public void CreateLobby(int maxPlayers = 4)
{
    _steam.Call("createLobby", 2, maxPlayers); // Public lobby
}

private void OnLobbyCreated(int result, long lobbyId)
{
    if (result == 1) // k_EResultOK
    {
        _currentLobbyId = lobbyId;
        _steam.Call("setLobbyData", lobbyId, "game_mode", "deathmatch");
        _steam.Call("setLobbyData", lobbyId, "version", "1.2.0");
        HostGame();
    }
}
```

---

## 6. Joining a Lobby and Starting the Session

### Joining via Lobby ID

```gdscript
func join_lobby(lobby_id: int) -> void:
    steam.joinLobby(lobby_id)

func _on_lobby_joined(lobby_id: int, _permissions: int, _locked: bool, result: int) -> void:
    if result == 1:  # k_EResultOK
        current_lobby_id = lobby_id
        print("Joined lobby: ", lobby_id)

        # Get the host's Steam ID to connect the multiplayer peer
        var host_steam_id: int = steam.getLobbyOwner(lobby_id)
        join_game(host_steam_id)
    else:
        push_error("Failed to join lobby: ", result)
```

### Joining via Steam Friend Invite

Steam handles the invite UI. You receive the invite via a callback:

```gdscript
func _ready() -> void:
    # ... other setup ...
    steam.join_requested.connect(_on_join_requested)

func _on_join_requested(lobby_id: int, _friend_id: int) -> void:
    # Player clicked "Join Game" from Steam friends list or overlay
    join_lobby(lobby_id)
```

### Starting the Game

Once all players are in the lobby, the host signals game start:

```gdscript
# Host sets lobby data to signal game start
func start_game() -> void:
    if multiplayer.is_server():
        steam.setLobbyData(current_lobby_id, "game_started", "true")
        # Close the lobby so no new players join mid-game
        steam.setLobbyJoinable(current_lobby_id, false)

        # All peers are already connected via SteamMultiplayerPeer
        # Use RPC to tell everyone to load the game scene
        load_game_scene.rpc("res://levels/arena_01.tscn")

@rpc("authority", "call_local", "reliable")
func load_game_scene(scene_path: String) -> void:
    get_tree().change_scene_to_file(scene_path)
```

---

## 7. Using Godot's High-Level Multiplayer API

Because `SteamMultiplayerPeer` implements `MultiplayerPeer`, all standard Godot multiplayer patterns work:

### RPCs

```gdscript
# Player sends input to the server
@rpc("any_peer", "reliable")
func server_receive_input(input_vector: Vector2) -> void:
    var sender_id := multiplayer.get_remote_sender_id()
    # Process input for this player...

# Server broadcasts game state
@rpc("authority", "unreliable_ordered")
func client_receive_state(positions: Dictionary) -> void:
    # Update player positions from server state
    for player_id: int in positions:
        _update_player_position(player_id, positions[player_id])
```

### MultiplayerSynchronizer

```gdscript
# player.tscn — add MultiplayerSynchronizer as child of player node
# Configure in editor:
#   - Replication: position, rotation, animation_state
#   - Authority: set to the owning peer
```

### MultiplayerSpawner

```gdscript
# level.tscn — add MultiplayerSpawner
# Configure spawn path and spawnable scenes in the editor
# When the server calls add_child(), the spawner replicates to all peers

func spawn_player(peer_id: int) -> void:
    if not multiplayer.is_server():
        return
    var player := preload("res://features/player/player.tscn").instantiate()
    player.name = str(peer_id)
    # Set authority so the owning player controls this node
    player.set_multiplayer_authority(peer_id)
    $Players.add_child(player, true)
```

---

## 8. P2P Connection Flow

The complete connection flow for a lobby-based P2P game:

```
1. Host creates lobby          → steam.createLobby()
2. Host creates multiplayer    → SteamMultiplayerPeer.create_host()
3. Client finds/joins lobby    → steam.joinLobby(lobby_id)
4. Client creates peer         → SteamMultiplayerPeer.create_client(host_steam_id)
5. Steam establishes P2P       → NAT punch or relay (automatic)
6. Godot fires peer_connected  → Both sides handle connection
7. Host sends game state       → RPCs / MultiplayerSynchronizer
8. Game runs                   → Standard Godot multiplayer
9. Player disconnects          → peer_disconnected signal
10. Host closes lobby          → steam.setLobbyJoinable(false)
```

### The Steam Callback Loop

Steam requires you to call `run_callbacks()` every frame to process async events:

```gdscript
func _process(_delta: float) -> void:
    if Engine.has_singleton("Steam"):
        Engine.get_singleton("Steam").run_callbacks()
```

**This is critical.** Without it, lobby creation, join events, and P2P connections will never fire.

---

## 9. Handling Disconnections and Reconnection

### Detecting Disconnection

```gdscript
func _on_peer_disconnected(id: int) -> void:
    print("Player %d disconnected" % id)

    if multiplayer.is_server():
        # Server: remove the player and notify others
        _remove_player(id)
        player_left.rpc(id)
    else:
        if id == 1:
            # The host disconnected — session is over
            _return_to_menu("Host disconnected")
```

### Host Migration (Advanced)

Steam lobbies support transferring ownership. If the host disconnects, you can promote another player:

```gdscript
func _on_host_disconnected() -> void:
    # Steam automatically assigns a new lobby owner
    var new_owner: int = steam.getLobbyOwner(current_lobby_id)
    var my_steam_id: int = steam.getSteamID()

    if new_owner == my_steam_id:
        print("I am the new host — migrating session")
        _become_host()
    else:
        print("New host is Steam ID: ", new_owner)
        # Reconnect multiplayer peer to new host
        join_game(new_owner)
```

Host migration is complex and not required for most indie games. A simpler approach is to end the session and have players re-lobby.

---

## 10. Steam Relay and NAT Traversal

Steam Networking Sockets handle NAT traversal automatically:

1. **Direct connection** — tried first via ICE/STUN.
2. **Steam relay** — if direct fails, traffic routes through Valve's relay servers (SDR — Steam Datagram Relay).
3. **No player action needed** — this is transparent to your code.

### Checking Connection Quality

```gdscript
func _get_connection_info(steam_id: int) -> void:
    # GodotSteam exposes connection status
    var info: Dictionary = steam.getConnectionInfo(steam_id)
    if info.has("ping"):
        print("Ping to %d: %dms" % [steam_id, info["ping"]])
    if info.has("relay"):
        print("Using relay: ", info["relay"])
```

### Relay Server Regions

Valve operates relay servers worldwide. You don't configure this — Steam routes traffic to the nearest relay automatically. Typical relay overhead is 5–20ms additional latency compared to direct connection.

---

## 11. Voice Chat via Steam

Steam provides a built-in voice API that handles capture, encoding, and transmission:

```gdscript
func start_voice_recording() -> void:
    steam.startVoiceRecording()

func stop_voice_recording() -> void:
    steam.stopVoiceRecording()

func _process(_delta: float) -> void:
    steam.run_callbacks()

    # Check for available voice data
    var available: Dictionary = steam.getAvailableVoice()
    if available.get("result", 0) == 1:  # Voice data available
        var voice_data: Dictionary = steam.getVoice()
        if voice_data.get("result", 0) == 1:
            var buffer: PackedByteArray = voice_data["buffer"]
            # Send voice data to other players via unreliable RPC
            send_voice_data.rpc(buffer)

@rpc("any_peer", "unreliable")
func send_voice_data(data: PackedByteArray) -> void:
    # Decompress and play the voice data
    var pcm: Dictionary = steam.decompressVoice(data, data.size(), 48000)
    if pcm.get("result", 0) == 1:
        _play_voice_audio(pcm["buffer"])
```

**Note:** Steam voice is functional but basic. For production voice chat with echo cancellation and noise suppression, consider dedicated solutions like Vivox or Agora integrated via GDExtension.

---

## 12. Testing Without Multiple Steam Accounts

### Steam's "Spacewar" App ID

During development, use app ID `480` (Valve's test app, "Spacewar"). This lets you test multiplayer without a registered Steam app:

```gdscript
# Create a steam_appid.txt file in your project root
# Contents: 480
```

### Testing with Multiple Instances

1. **Same machine, multiple accounts:** Use Steam's "Add a Non-Steam Game" or Steam Family Sharing on a second account.
2. **Same machine, same account (limited):** Some Steam Multiplayer Peer features allow local testing by running two instances, but lobby discovery won't work.
3. **Two machines, two accounts:** Most reliable method. Use Steam's Remote Play Together invite for testing.

### Offline Testing Fallback

For rapid iteration without Steam, maintain an ENet fallback:

```gdscript
var use_steam: bool = Engine.has_singleton("Steam")

func host_game() -> void:
    if use_steam:
        peer = SteamMultiplayerPeer.new()
        peer.create_host(0)
    else:
        var enet_peer := ENetMultiplayerPeer.new()
        enet_peer.create_server(7777)
        peer = enet_peer

    multiplayer.multiplayer_peer = peer
```

```csharp
private bool _useSteam = Engine.HasSingleton("Steam");

public void HostGame()
{
    MultiplayerPeer peer;
    if (_useSteam)
    {
        var steamPeer = new SteamMultiplayerPeer();
        steamPeer.CreateHost(0);
        peer = steamPeer;
    }
    else
    {
        var enetPeer = new ENetMultiplayerPeer();
        enetPeer.CreateServer(7777);
        peer = enetPeer;
    }
    Multiplayer.MultiplayerPeer = peer;
}
```

---

## 13. Production Checklist

Before shipping your Steam multiplayer game:

- [ ] Replace app ID `480` with your registered Steam app ID
- [ ] Remove `steam_appid.txt` from release builds (Steam client provides the app ID)
- [ ] Set lobby data `version` field and reject mismatched clients
- [ ] Handle `Steam.run_callbacks()` every frame (or every physics frame)
- [ ] Test with Steam overlay active (some games break when the overlay hooks input)
- [ ] Implement graceful lobby leave on quit (`steam.leaveLobby(lobby_id)`)
- [ ] Test on both direct connection and relay (throttle your network to force relay)
- [ ] Verify GodotSteam version matches your Steamworks SDK version
- [ ] Test with Steam Deck (controller-only flow, overlay behavior)
- [ ] Ship both x86_64 and (optionally) ARM builds for Steam Deck

---

## 14. Common Mistakes

### Forgetting `run_callbacks()`

Without calling `steam.run_callbacks()` every frame, no async Steam events fire. Lobbies won't create, connections won't establish, and voice won't work. This is the #1 cause of "Steam multiplayer does nothing."

### Using the wrong GodotSteam version

GodotSteam versions are tied to specific Steamworks SDK versions and Godot versions. A GodotSteam build for Godot 4.3 won't load in Godot 4.5. Always match versions.

### Not closing lobbies on game start

If you don't call `steam.setLobbyJoinable(false)` when the game starts, new players can join the lobby mid-match and find themselves in a broken state.

### Hardcoding peer ID 1 as host

In Steam Multiplayer Peer, the host's multiplayer peer ID is 1 (standard Godot convention). But the host's **Steam ID** is different. Don't confuse the two — use `multiplayer.get_unique_id()` for Godot multiplayer logic, and `steam.getSteamID()` for Steam API calls.

### Skipping the ENet fallback

Without an ENet fallback, you can't test multiplayer without two Steam accounts running simultaneously. Maintain the fallback for development velocity.

### Not testing relay connections

Direct P2P works on your LAN. Ship day, players behind strict NATs use relay. If you never tested relay, you may discover latency-sensitive code breaks at 50ms+ round-trip. Throttle your network during testing to simulate relay conditions.
