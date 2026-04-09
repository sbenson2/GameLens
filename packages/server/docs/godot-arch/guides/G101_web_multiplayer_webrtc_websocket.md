# G101 — Web-Compatible Multiplayer: WebRTC & WebSocket

> **Category:** guide · **Engine:** Godot 4.x · **Related:** [G13 Networking & Multiplayer](./G13_networking_and_multiplayer.md) · [G27 Dedicated Servers & Advanced Networking](./G27_dedicated_servers_advanced_networking.md) · [G22 Mobile & Web Export](./G22_mobile_and_web_export.md) · [G86 Multiplayer Security & Authority](./G86_multiplayer_security_and_authority.md) · [G43 Rollback Netcode](./G43_rollback_netcode.md)

Godot's default `ENetMultiplayerPeer` uses raw UDP sockets, which browsers cannot create. If your game targets web exports (HTML5/WASM), you need browser-compatible transport: **WebSocket** for simple client-server architectures, or **WebRTC** for peer-to-peer with low latency. This guide covers both approaches with complete GDScript and C# examples, signaling server setup, and hybrid architectures that work across desktop and web simultaneously.

---

## Table of Contents

1. [Why Web Multiplayer Needs Different Transport](#1-why-web-multiplayer-needs-different-transport)
2. [WebSocket vs. WebRTC — When to Use Which](#2-websocket-vs-webrtc--when-to-use-which)
3. [WebSocket Multiplayer](#3-websocket-multiplayer)
4. [WebRTC Multiplayer](#4-webrtc-multiplayer)
5. [Building a Signaling Server](#5-building-a-signaling-server)
6. [Hybrid Architecture: Desktop + Web](#6-hybrid-architecture-desktop--web)
7. [HTTPS and WSS for Production](#7-https-and-wss-for-production)
8. [Lobby and Matchmaking Patterns](#8-lobby-and-matchmaking-patterns)
9. [Performance Considerations](#9-performance-considerations)
10. [Debugging Web Multiplayer](#10-debugging-web-multiplayer)
11. [Deployment Checklist](#11-deployment-checklist)

---

## 1. Why Web Multiplayer Needs Different Transport

Browsers enforce strict networking restrictions:

- **No raw UDP/TCP sockets.** `ENetMultiplayerPeer` will not work in HTML5 exports.
- **WebSocket** (RFC 6455) provides reliable, ordered, TCP-based messaging over HTTP(S) — supported by all browsers.
- **WebRTC** (Web Real-Time Communication) provides peer-to-peer UDP-like channels with optional reliability — lower latency, but requires a signaling step.

Godot provides built-in classes for both:

| Class | Transport | Topology | Reliability |
|---|---|---|---|
| `WebSocketMultiplayerPeer` | WebSocket (TCP) | Client-Server | Always reliable, ordered |
| `WebRTCMultiplayerPeer` | WebRTC (DTLS/SCTP) | Peer-to-Peer | Configurable per channel |
| `ENetMultiplayerPeer` | ENet (UDP) | Client-Server / P2P | Configurable — **desktop only** |

---

## 2. WebSocket vs. WebRTC — When to Use Which

### Choose WebSocket When:

- Your game uses authoritative server architecture (server validates all game state).
- Latency tolerance is moderate (turn-based, strategy, social games, co-op).
- You want the simplest deployment (single server process, standard HTTPS hosting).
- You need to support older browsers or restrictive corporate networks.

### Choose WebRTC When:

- You need low-latency peer-to-peer communication (action games, fighting games).
- You want to reduce server costs by keeping game traffic off the server after connection.
- Your game already uses Godot's `MultiplayerAPI` with RPC and you want P2P topology.
- You can tolerate additional connection setup complexity (signaling, STUN/TURN).

### Choose Hybrid When:

- Desktop players use ENet for best performance, web players use WebSocket or WebRTC.
- A relay server bridges different transport types.

---

## 3. WebSocket Multiplayer

### Server — GDScript

```gdscript
extends Node

var peer := WebSocketMultiplayerPeer.new()

func _ready() -> void:
    # Start WebSocket server on port 9080
    var error := peer.create_server(9080)
    if error != OK:
        push_error("Failed to start WebSocket server: %s" % error_string(error))
        return

    multiplayer.multiplayer_peer = peer
    multiplayer.peer_connected.connect(_on_peer_connected)
    multiplayer.peer_disconnected.connect(_on_peer_disconnected)
    print("WebSocket server listening on ws://localhost:9080")

func _on_peer_connected(id: int) -> void:
    print("Player %d connected" % id)

func _on_peer_disconnected(id: int) -> void:
    print("Player %d disconnected" % id)

# Standard Godot multiplayer RPC works normally
@rpc("any_peer", "reliable")
func submit_input(input_data: Dictionary) -> void:
    var sender := multiplayer.get_remote_sender_id()
    print("Input from %d: %s" % [sender, input_data])
    # Broadcast to all peers
    update_game_state.rpc(compute_new_state(input_data))

@rpc("authority", "reliable")
func update_game_state(state: Dictionary) -> void:
    apply_state(state)
```

### Client — GDScript

```gdscript
extends Node

var peer := WebSocketMultiplayerPeer.new()

func connect_to_server(address: String = "ws://localhost:9080") -> void:
    var error := peer.create_client(address)
    if error != OK:
        push_error("Failed to connect: %s" % error_string(error))
        return

    multiplayer.multiplayer_peer = peer
    multiplayer.connected_to_server.connect(_on_connected)
    multiplayer.connection_failed.connect(_on_connection_failed)
    multiplayer.server_disconnected.connect(_on_server_disconnected)

func _on_connected() -> void:
    print("Connected to server! My ID: %d" % multiplayer.get_unique_id())

func _on_connection_failed() -> void:
    push_error("Connection failed")

func _on_server_disconnected() -> void:
    print("Server disconnected")
```

### Server — C#

```csharp
using Godot;

public partial class WebSocketServer : Node
{
    private WebSocketMultiplayerPeer _peer = new();

    public override void _Ready()
    {
        var error = _peer.CreateServer(9080);
        if (error != Error.Ok)
        {
            GD.PushError($"Failed to start server: {error}");
            return;
        }

        Multiplayer.MultiplayerPeer = _peer;
        Multiplayer.PeerConnected += id => GD.Print($"Player {id} connected");
        Multiplayer.PeerDisconnected += id => GD.Print($"Player {id} disconnected");
        GD.Print("WebSocket server listening on ws://localhost:9080");
    }

    [Rpc(MultiplayerApi.RpcMode.AnyPeer, CallLocal = false,
         TransferMode = MultiplayerPeer.TransferModeEnum.Reliable)]
    public void SubmitInput(Godot.Collections.Dictionary inputData)
    {
        var sender = Multiplayer.GetRemoteSenderId();
        GD.Print($"Input from {sender}: {inputData}");
    }
}
```

### Client — C#

```csharp
using Godot;

public partial class WebSocketClient : Node
{
    private WebSocketMultiplayerPeer _peer = new();

    public void ConnectToServer(string address = "ws://localhost:9080")
    {
        var error = _peer.CreateClient(address);
        if (error != Error.Ok)
        {
            GD.PushError($"Failed to connect: {error}");
            return;
        }

        Multiplayer.MultiplayerPeer = _peer;
        Multiplayer.ConnectedToServer += () =>
            GD.Print($"Connected! ID: {Multiplayer.GetUniqueId()}");
        Multiplayer.ConnectionFailed += () =>
            GD.PushError("Connection failed");
    }
}
```

---

## 4. WebRTC Multiplayer

WebRTC requires a **signaling** step: peers exchange connection info (SDP offers/answers and ICE candidates) through an external channel before the direct P2P connection is established.

### Core Flow

1. Peers connect to a **signaling server** (typically via WebSocket).
2. Each peer creates a `WebRTCPeerConnection` and generates an SDP offer.
3. The signaling server relays offers/answers and ICE candidates between peers.
4. Once ICE negotiation completes, peers have a direct connection.
5. The signaling server can be disconnected — P2P traffic flows directly.

### WebRTC Peer Setup — GDScript

```gdscript
extends Node

var rtc_peer := WebRTCMultiplayerPeer.new()
var signaling_ws := WebSocketPeer.new()

# STUN servers help peers discover their public IP for NAT traversal
const STUN_SERVERS: Dictionary = {
    "iceServers": [
        { "urls": ["stun:stun.l.google.com:19302"] }
    ]
}

func _ready() -> void:
    # Connect to signaling server
    signaling_ws.connect_to_url("ws://localhost:9081/signaling")

func _process(_delta: float) -> void:
    signaling_ws.poll()
    if signaling_ws.get_ready_state() == WebSocketPeer.STATE_OPEN:
        while signaling_ws.get_available_packet_count() > 0:
            var msg := signaling_ws.get_packet().get_string_from_utf8()
            _handle_signaling_message(JSON.parse_string(msg))

func join_mesh(my_id: int, peer_ids: Array[int]) -> void:
    # Initialize the WebRTC mesh with our ID
    rtc_peer.create_mesh(my_id)
    multiplayer.multiplayer_peer = rtc_peer

    for peer_id in peer_ids:
        if peer_id != my_id:
            _create_peer_connection(peer_id)

func _create_peer_connection(peer_id: int) -> WebRTCPeerConnection:
    var connection := WebRTCPeerConnection.new()
    connection.initialize(STUN_SERVERS)

    connection.session_description_created.connect(
        func(type: String, sdp: String) -> void:
            connection.set_local_description(type, sdp)
            _send_signaling({
                "type": type,
                "sdp": sdp,
                "target": peer_id
            })
    )

    connection.ice_candidate_created.connect(
        func(media: String, index: int, candidate_name: String) -> void:
            _send_signaling({
                "type": "ice",
                "media": media,
                "index": index,
                "candidate": candidate_name,
                "target": peer_id
            })
    )

    rtc_peer.add_peer(connection, peer_id)
    return connection

func _send_signaling(data: Dictionary) -> void:
    signaling_ws.send_text(JSON.stringify(data))

func _handle_signaling_message(data: Dictionary) -> void:
    var from: int = data.get("from", 0)
    match data.get("type", ""):
        "offer":
            var conn := _create_peer_connection(from)
            conn.set_remote_description("offer", data["sdp"])
        "answer":
            if rtc_peer.has_peer(from):
                rtc_peer.get_peer(from)["connection"].set_remote_description(
                    "answer", data["sdp"]
                )
        "ice":
            if rtc_peer.has_peer(from):
                rtc_peer.get_peer(from)["connection"].add_ice_candidate(
                    data["media"], data["index"], data["candidate"]
                )
```

### WebRTC Peer Setup — C#

```csharp
using Godot;
using Godot.Collections;

public partial class WebRtcManager : Node
{
    private WebRtcMultiplayerPeer _rtcPeer = new();
    private WebSocketPeer _signalingWs = new();

    private readonly Dictionary _stunServers = new()
    {
        ["iceServers"] = new Godot.Collections.Array
        {
            new Dictionary { ["urls"] = new Godot.Collections.Array { "stun:stun.l.google.com:19302" } }
        }
    };

    public override void _Ready()
    {
        _signalingWs.ConnectToUrl("ws://localhost:9081/signaling");
    }

    public override void _Process(double delta)
    {
        _signalingWs.Poll();
        if (_signalingWs.GetReadyState() == WebSocketPeer.State.Open)
        {
            while (_signalingWs.GetAvailablePacketCount() > 0)
            {
                var msg = _signalingWs.GetPacket().GetStringFromUtf8();
                var data = Json.ParseString(msg).AsGodotDictionary();
                HandleSignalingMessage(data);
            }
        }
    }

    public void JoinMesh(int myId, int[] peerIds)
    {
        _rtcPeer.CreateMesh(myId);
        Multiplayer.MultiplayerPeer = _rtcPeer;

        foreach (var peerId in peerIds)
        {
            if (peerId != myId)
                CreatePeerConnection(peerId);
        }
    }

    private WebRtcPeerConnection CreatePeerConnection(int peerId)
    {
        var connection = new WebRtcPeerConnection();
        connection.Initialize(_stunServers);

        connection.SessionDescriptionCreated += (type, sdp) =>
        {
            connection.SetLocalDescription(type, sdp);
            SendSignaling(new Dictionary
            {
                ["type"] = type, ["sdp"] = sdp, ["target"] = peerId
            });
        };

        connection.IceCandidateCreated += (media, index, name) =>
        {
            SendSignaling(new Dictionary
            {
                ["type"] = "ice", ["media"] = media,
                ["index"] = index, ["candidate"] = name,
                ["target"] = peerId
            });
        };

        _rtcPeer.AddPeer(connection, peerId);
        return connection;
    }

    private void SendSignaling(Dictionary data)
    {
        _signalingWs.SendText(Json.Stringify(data));
    }

    private void HandleSignalingMessage(Dictionary data)
    {
        // Handle offer, answer, and ICE candidates — same logic as GDScript
    }
}
```

---

## 5. Building a Signaling Server

The signaling server only relays connection metadata — it never touches game traffic. A minimal Node.js implementation:

### Node.js WebSocket Signaling Server

```javascript
// signaling_server.js — run with: node signaling_server.js
import { WebSocketServer } from "ws";

const wss = new WebSocketServer({ port: 9081 });
const clients = new Map(); // id -> ws
let nextId = 1;

wss.on("connection", (ws) => {
    const id = nextId++;
    clients.set(id, ws);

    // Tell the new peer their ID and who else is connected
    ws.send(JSON.stringify({
        type: "init",
        id: id,
        peers: [...clients.keys()].filter(k => k !== id)
    }));

    // Notify existing peers
    for (const [otherId, otherWs] of clients) {
        if (otherId !== id) {
            otherWs.send(JSON.stringify({ type: "peer_joined", id: id }));
        }
    }

    ws.on("message", (raw) => {
        const data = JSON.parse(raw);
        const target = clients.get(data.target);
        if (target) {
            data.from = id;
            target.send(JSON.stringify(data));
        }
    });

    ws.on("close", () => {
        clients.delete(id);
        for (const [, otherWs] of clients) {
            otherWs.send(JSON.stringify({ type: "peer_left", id: id }));
        }
    });
});

console.log("Signaling server running on ws://localhost:9081");
```

### GDScript Signaling Server (for prototyping)

You can also run a signaling server inside Godot itself using `TCPServer` + `WebSocketPeer`, which is useful for local testing:

```gdscript
extends Node

var tcp_server := TCPServer.new()
var peers: Dictionary[int, WebSocketPeer] = {}
var next_id: int = 1

func _ready() -> void:
    tcp_server.listen(9081)
    print("Signaling server on port 9081")

func _process(_delta: float) -> void:
    if tcp_server.is_connection_available():
        var conn := tcp_server.take_connection()
        var ws := WebSocketPeer.new()
        ws.accept_stream(conn)
        var id := next_id
        next_id += 1
        peers[id] = ws
        # Send init message after handshake completes

    for id in peers.keys():
        var ws: WebSocketPeer = peers[id]
        ws.poll()
        if ws.get_ready_state() == WebSocketPeer.STATE_CLOSED:
            peers.erase(id)
            _broadcast({"type": "peer_left", "id": id})
            continue
        while ws.get_available_packet_count() > 0:
            var msg := JSON.parse_string(ws.get_packet().get_string_from_utf8())
            msg["from"] = id
            var target_ws: WebSocketPeer = peers.get(msg["target"])
            if target_ws:
                target_ws.send_text(JSON.stringify(msg))

func _broadcast(data: Dictionary) -> void:
    var text := JSON.stringify(data)
    for ws: WebSocketPeer in peers.values():
        if ws.get_ready_state() == WebSocketPeer.STATE_OPEN:
            ws.send_text(text)
```

---

## 6. Hybrid Architecture: Desktop + Web

For games that run on both desktop and web, use a relay server that accepts multiple transport types:

```gdscript
extends Node

func create_multiplayer_peer(is_server: bool, port: int = 9080) -> MultiplayerPeer:
    if OS.has_feature("web"):
        # Web export — must use WebSocket
        var ws_peer := WebSocketMultiplayerPeer.new()
        if is_server:
            push_error("Cannot run server in web export")
        else:
            ws_peer.create_client("wss://yourserver.com:%d" % port)
        return ws_peer
    else:
        # Desktop — use ENet for best performance
        var enet_peer := ENetMultiplayerPeer.new()
        if is_server:
            enet_peer.create_server(port)
        else:
            enet_peer.create_client("yourserver.com", port)
        return enet_peer
```

### Bridge Server Pattern

For mixing ENet desktop clients with WebSocket web clients, run a bridge server that translates between protocols:

```
Desktop Client (ENet) ──→ Bridge Server ←── Web Client (WebSocket)
                              │
                         Game Logic
                         (authoritative)
```

The bridge server accepts both `ENetMultiplayerPeer` and `WebSocketMultiplayerPeer` connections, assigns unified peer IDs, and forwards RPCs between them using a shared `SceneMultiplayer` instance.

---

## 7. HTTPS and WSS for Production

Browsers require **Secure WebSocket (WSS)** when the page is served over HTTPS.

### Options

1. **TLS termination at reverse proxy** (recommended): Use nginx or Caddy to handle TLS and proxy to your Godot/Node.js server on localhost.

```nginx
# nginx configuration
server {
    listen 443 ssl;
    server_name game.example.com;

    ssl_certificate /etc/letsencrypt/live/game.example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/game.example.com/privkey.pem;

    location /ws {
        proxy_pass http://127.0.0.1:9080;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_read_timeout 86400;
    }
}
```

2. **Direct TLS in Godot** (testing only): Pass a `TLSOptions` object when creating the server.

### TURN Servers for WebRTC

If peers are behind strict NATs or firewalls, STUN alone won't work. Deploy a TURN server (e.g., coturn) for reliable connectivity:

```gdscript
const ICE_CONFIG: Dictionary = {
    "iceServers": [
        { "urls": ["stun:stun.l.google.com:19302"] },
        {
            "urls": ["turn:turn.example.com:3478"],
            "username": "user",
            "credential": "pass"
        }
    ]
}
```

---

## 8. Lobby and Matchmaking Patterns

### Simple WebSocket Lobby

```gdscript
extends Node

var lobby_ws := WebSocketPeer.new()

enum LobbyState { DISCONNECTED, IN_LOBBY, IN_GAME }
var state: LobbyState = LobbyState.DISCONNECTED

func join_lobby(player_name: String) -> void:
    lobby_ws.connect_to_url("wss://game.example.com/lobby")
    state = LobbyState.IN_LOBBY

func _process(_delta: float) -> void:
    lobby_ws.poll()
    while lobby_ws.get_available_packet_count() > 0:
        var msg := JSON.parse_string(lobby_ws.get_packet().get_string_from_utf8())
        match msg.get("type", ""):
            "room_list":
                _update_room_list(msg["rooms"])
            "game_start":
                # Received game server address — switch to game connection
                _connect_to_game_server(msg["address"], msg["token"])
                state = LobbyState.IN_GAME

func _connect_to_game_server(address: String, token: String) -> void:
    # Close lobby connection, open game connection
    lobby_ws.close()
    var game_peer := WebSocketMultiplayerPeer.new()
    game_peer.create_client(address)
    multiplayer.multiplayer_peer = game_peer
```

---

## 9. Performance Considerations

### WebSocket Limitations

- **Head-of-line blocking:** TCP guarantees order, so one dropped packet stalls all subsequent data. Not ideal for real-time position updates.
- **Mitigation:** Send position updates as unreliable RPCs over WebRTC, or accept ~50ms additional latency and interpolate aggressively.

### WebRTC Channel Configuration

```gdscript
# Create unreliable channel for position updates (UDP-like behavior)
var unreliable_channel := connection.create_data_channel(
    "game_state",
    {
        "ordered": false,
        "maxRetransmits": 0  # No retransmission — drop stale packets
    }
)

# Create reliable channel for chat and important events
var reliable_channel := connection.create_data_channel(
    "events",
    {
        "ordered": true,
        "negotiated": true,
        "id": 1
    }
)
```

### Bandwidth Tips

- Use `var_to_bytes()` / `bytes_to_var()` for compact serialization.
- Send delta updates, not full state, for position data.
- Compress packets with `PackedByteArray.compress()` for large payloads.
- Target 20–30 state updates/second for action games over WebSocket; up to 60 over WebRTC unreliable channels.

---

## 10. Debugging Web Multiplayer

### Browser Developer Tools

- **Network tab:** Filter by "WS" to see WebSocket frames in real time.
- **Console:** Godot's `print()` outputs to the browser console in web exports.
- **`chrome://webrtc-internals`:** Shows all WebRTC connections, ICE candidates, DTLS state, and bandwidth stats.

### Godot-Side Debugging

```gdscript
# Monitor WebSocket state
func _process(_delta: float) -> void:
    var state := signaling_ws.get_ready_state()
    match state:
        WebSocketPeer.STATE_CONNECTING:
            pass  # Still connecting
        WebSocketPeer.STATE_OPEN:
            pass  # Connected
        WebSocketPeer.STATE_CLOSING:
            print("WebSocket closing...")
        WebSocketPeer.STATE_CLOSED:
            var code := signaling_ws.get_close_code()
            var reason := signaling_ws.get_close_reason()
            print("Closed: %d %s" % [code, reason])
```

### Common Issues

| Problem | Cause | Fix |
|---|---|---|
| "Mixed content blocked" | HTTP page + WSS, or HTTPS page + WS | Match protocol: HTTPS ↔ WSS |
| WebRTC never connects | Missing TURN server behind NAT | Add TURN server to ICE config |
| High latency spikes | WebSocket TCP head-of-line blocking | Switch to WebRTC unreliable channels |
| Connection drops after 60s | Proxy timeout | Set `proxy_read_timeout` higher in nginx |

---

## 11. Deployment Checklist

- [ ] **Protocol:** WebSocket for client-server, WebRTC for P2P — or both
- [ ] **TLS:** WSS via reverse proxy (nginx/Caddy) with Let's Encrypt
- [ ] **CORS:** Not needed for WebSocket, but verify if your signaling uses HTTP endpoints
- [ ] **STUN/TURN:** Deploy coturn if using WebRTC with players behind corporate NAT
- [ ] **Reconnection:** Handle `server_disconnected` signal and implement exponential backoff
- [ ] **Bandwidth:** Profile with browser Network tab; compress large payloads
- [ ] **Testing:** Test in actual browser (not Godot editor) — web export networking only works in browser context
- [ ] **Fallback:** If WebRTC fails, fall back to WebSocket relay
- [ ] **Headless server:** Run game server with `--headless` flag for dedicated hosting
