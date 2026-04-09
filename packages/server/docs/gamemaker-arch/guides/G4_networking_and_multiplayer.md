# G4 — Networking and Multiplayer in GameMaker

> **Category:** guide · **Engine:** GameMaker · **Related:** [E1 Architecture Overview](../architecture/E1_architecture_overview.md) · [R1 GML Data Structures](../reference/R1_gml_data_structures.md)

---

## Networking in GameMaker: Two Paths

GameMaker provides two fundamentally different approaches to multiplayer:

1. **Low-level networking** — TCP/UDP sockets, buffers, and async events. Full control, any topology, any platform.
2. **Rollback multiplayer** — A built-in deterministic rollback netcode system for GX.games (up to 4 players). Simpler setup, stricter constraints.

Choose based on your needs: low-level for custom server architectures, dedicated servers, or Steam networking; rollback for fast-paced peer-to-peer games on GX.games.

---

## Low-Level Networking

### Creating a Server

```gml
// Create Event of obj_server
port = 6510;
max_clients = 4;
server = network_create_server(network_socket_tcp, port, max_clients);

if (server < 0) {
    show_debug_message("Failed to create server on port " + string(port));
}

// Track connected clients
client_sockets = ds_list_create();
```

`network_create_server()` returns a socket ID on success, or a negative value on failure. The protocol can be `network_socket_tcp` (reliable, ordered) or `network_socket_udp` (fast, unordered).

### Connecting as a Client

```gml
// Create Event of obj_client
socket = network_create_socket(network_socket_tcp);
network_connect(socket, "192.168.1.100", 6510);
```

For non-blocking connections, use `network_connect_raw_async()` — the result arrives in the Async Networking event instead of blocking the game.

### The Async Networking Event

All network activity flows through the **Async Networking** event. The engine populates `async_load` (a DS Map) with details about what happened:

```gml
// Async - Networking event
var _type = async_load[? "type"];
var _id   = async_load[? "id"];

switch (_type) {
    case network_type_connect:
        // A client connected to our server
        var _socket = async_load[? "socket"];
        ds_list_add(client_sockets, _socket);
        show_debug_message("Client connected: " + string(_socket));
        break;

    case network_type_disconnect:
        // A client disconnected
        var _socket = async_load[? "socket"];
        var _idx = ds_list_find_index(client_sockets, _socket);
        if (_idx >= 0) ds_list_delete(client_sockets, _idx);
        break;

    case network_type_data:
        // Data received — read from the buffer
        var _buffer = async_load[? "buffer"];
        var _msg_id = buffer_read(_buffer, buffer_u8);
        handle_message(_id, _msg_id, _buffer);
        break;
}
```

### Sending Data with Buffers

GameMaker sends raw bytes. You must pack data into buffers, which gives you full control over packet size:

```gml
/// @desc Send player position to server
function send_position(_socket, _x, _y) {
    var _buf = buffer_create(16, buffer_fixed, 1);

    // Message header: 1 byte for message type
    buffer_write(_buf, buffer_u8, MSG_PLAYER_POS);

    // Payload: position as 32-bit floats (4 bytes each)
    buffer_write(_buf, buffer_f32, _x);
    buffer_write(_buf, buffer_f32, _y);

    network_send_packet(_socket, _buf, buffer_tell(_buf));
    buffer_delete(_buf);
}
```

**Buffer types for different needs:**

| Type | Use Case |
|------|----------|
| `buffer_fixed` | Known-size packets (positions, inputs) |
| `buffer_grow` | Variable-length packets (chat, entity lists) |
| `buffer_wrap` | Ring buffers for streaming data |

**Data types for packing:**

| Type | Size | Range / Use |
|------|------|-------------|
| `buffer_u8` | 1 byte | Message IDs, small integers (0–255) |
| `buffer_u16` | 2 bytes | Entity IDs, medium integers (0–65535) |
| `buffer_s16` | 2 bytes | Signed positions (-32768 to 32767) |
| `buffer_f32` | 4 bytes | Floating-point positions, velocities |
| `buffer_string` | Variable | Chat messages, names |

### Reliable Message Protocol Pattern

TCP is reliable but can have latency. UDP is fast but packets can be lost or arrive out of order. A common pattern is to use both:

```gml
// Use TCP for important state changes
function send_reliable(_socket, _buf) {
    network_send_packet(_socket, _buf, buffer_tell(_buf));
}

// Use UDP for frequent updates that can tolerate loss
function send_unreliable(_socket, _ip, _port, _buf) {
    network_send_udp(_socket, _ip, _port, _buf, buffer_tell(_buf));
}
```

### Architecture: Message ID Pattern

Define a consistent message protocol using enums:

```gml
enum MSG {
    PLAYER_JOIN,        // Client → Server: request to join
    PLAYER_ACCEPT,      // Server → Client: join accepted, assign player ID
    PLAYER_POS,         // Both: position update
    PLAYER_INPUT,       // Client → Server: input state
    GAME_STATE,         // Server → Client: full world snapshot
    PLAYER_DISCONNECT,  // Both: player left
    CHAT_MESSAGE        // Both: chat text
}
```

Then decode in your handler:

```gml
/// @desc Route incoming messages to handlers
function handle_message(_sender, _msg_id, _buffer) {
    switch (_msg_id) {
        case MSG.PLAYER_JOIN:
            handle_player_join(_sender, _buffer);
            break;
        case MSG.PLAYER_POS:
            handle_player_pos(_sender, _buffer);
            break;
        case MSG.PLAYER_INPUT:
            handle_player_input(_sender, _buffer);
            break;
        // ... etc
    }
}
```

---

## HTTP Requests

For leaderboards, analytics, or web API integration, use the HTTP functions:

```gml
// GET request — response arrives in Async HTTP event
http_get("https://api.example.com/leaderboard?game=mygame");

// POST request with JSON body
var _map = ds_map_create();
ds_map_add(_map, "player", global.player_name);
ds_map_add(_map, "score", global.score);
var _json = json_encode(_map);
ds_map_destroy(_map);

http_request(
    "https://api.example.com/scores",
    "POST",
    ds_map_create(),  // headers
    _json
);
```

Handle responses in the **Async HTTP** event:

```gml
// Async - HTTP event
var _status = async_load[? "status"];
if (_status == 0) {
    var _result = async_load[? "result"];
    var _data = json_parse(_result);
    // Process response
}
```

---

## Rollback Multiplayer (GX.games)

GameMaker's built-in rollback system handles synchronization automatically. The engine synchronizes **inputs**, not game state — each client runs the same simulation deterministically.

### Setup

```gml
// Create Event of obj_game_controller
rollback_define_player(obj_player);

// Try to join an existing game first
var _joined = rollback_join_game();

// If no game found, host one (2 players required to start)
if (!_joined) {
    rollback_create_game(2);
}
```

### Player Object Requirements

Player objects in rollback must follow strict rules:

```gml
// Create Event of obj_player
// Only variables declared here are synchronized
x = 0;
y = 0;
facing = 0;
speed_h = 0;
speed_v = 0;
hp = 100;

// Do NOT use randomize() — the engine handles deterministic RNG
// Do NOT reference ds_lists, arrays of instances, or global variables
```

### Reading Input

```gml
// Step Event of obj_player
var _input = rollback_get_input();

// _input is a struct with the keys you registered
var _h = _input.right - _input.left;
var _v = _input.down - _input.up;
var _fire = _input.fire;

speed_h = _h * 4;
speed_v = _v * 4;
x += speed_h;
y += speed_v;

if (_fire) {
    // Spawn projectiles through rollback-managed creation
    instance_create_depth(x, y, depth - 1, obj_bullet);
}
```

### Rollback Constraints (Critical)

The rollback system imposes strict constraints to ensure deterministic simulation:

1. **No random without rollback RNG** — Use `rollback_use_random()` for seeded random values. Never use `randomize()`.
2. **No external state** — Don't read from `global` variables, files, or network calls during gameplay logic.
3. **No floating-point accumulation** — Small float errors compound across rollback frames. Use integers or fixed-point where possible.
4. **Managed instances only** — All gameplay-relevant instances must be created through the rollback system. Non-managed instances (particles, UI) are fine but won't be rolled back.
5. **No async operations in gameplay** — HTTP calls, file reads, and alarms that affect game state will desync.

### Rollback Events

```gml
// Rollback Event — fires when the system detects a desync and rewinds
// Use this to re-sync visual-only elements (particles, sounds)

// Rollback Start — game has started, all players connected
// Rollback End — game has ended
```

---

## Choosing the Right Approach

| Factor | Low-Level Sockets | Rollback |
|--------|-------------------|----------|
| **Platform** | All platforms | GX.games only |
| **Max players** | Unlimited (your server) | 4 |
| **Server costs** | You host | GX.games provides |
| **Latency handling** | You implement | Automatic rollback |
| **Complexity** | High — you build everything | Low — engine handles sync |
| **Game types** | MMO, co-op, turn-based, any | Fast-paced competitive |
| **Steam integration** | Via Steamworks extension | Not applicable |

### Steam Networking

For Steam-based multiplayer, use the **Steamworks** extension (not built-in networking). Steam provides NAT punchthrough, relay servers, and lobby management. The Steamworks extension wraps the Steam Networking API:

```gml
// Steamworks extension pattern (requires extension from marketplace)
// Create a lobby
steam_lobby_create(steam_lobby_type_public, max_players);

// In the Steam Lobby Joined async event, exchange data via lobby
steam_lobby_set_data("player_name", global.player_name);
```

---

## Common Pitfalls

1. **Forgetting to delete buffers** — Every `buffer_create()` needs a matching `buffer_delete()`. Leaked buffers accumulate memory.
2. **Not handling disconnects** — Always clean up player data when `network_type_disconnect` fires. Test by pulling the network cable.
3. **Sending too much data** — Send deltas (what changed), not full state. For positions, send only when the player moves.
4. **Ignoring endianness** — GameMaker buffers are little-endian. If your server is in another language, match the byte order.
5. **Blocking the game loop** — `network_connect()` blocks. Prefer `network_connect_raw_async()` for responsive UIs during connection.
