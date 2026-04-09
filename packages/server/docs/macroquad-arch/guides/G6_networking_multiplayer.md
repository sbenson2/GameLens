# G6 — Networking & Multiplayer

> **Category:** guide · **Engine:** Macroquad 0.4 · **Related:** [E1 Architecture Overview](../architecture/E1_architecture_overview.md) · [G1 Getting Started](G1_getting_started.md) · [G2 WASM & egui](G2_wasm_and_egui.md) · [R3 Ecosystem](../reference/R3_ecosystem_common_crates.md)

---

## Overview

Macroquad itself has no built-in networking. Multiplayer support comes from companion crates and the broader Rust ecosystem. This guide covers the main approaches: `quad-net` for low-level WebSocket/HTTP, Nakama for a managed game server, and raw Rust networking crates for custom solutions. All approaches support both native and WASM targets — a key Macroquad strength.

---

## Approach 1: quad-net (Low-Level WebSockets & HTTP)

`quad-net` is the miniquad/macroquad companion crate for networking. It provides a cross-platform (native + WASM) abstraction over WebSockets and HTTP requests.

### Cargo Setup

```toml
[dependencies]
macroquad = "0.4"
quad-net = "0.5"
```

### WebSocket Client

```rust
use macroquad::prelude::*;
use quad_net::web_socket::WebSocket;

#[macroquad::main("Multiplayer Demo")]
async fn main() {
    // Connect to a WebSocket server
    let mut ws = WebSocket::connect("ws://localhost:8080/game").unwrap();

    loop {
        // Send a message (non-blocking)
        if is_key_pressed(KeyCode::Space) {
            let msg = format!("{{\"action\": \"jump\", \"player\": \"me\"}}");
            ws.send_text(&msg);
        }

        // Receive messages (non-blocking — returns None if nothing available)
        while let Some(msg) = ws.try_recv() {
            match msg {
                quad_net::web_socket::Message::Text(text) => {
                    info!("Received: {}", text);
                    // Parse and apply game state update
                }
                quad_net::web_socket::Message::Binary(data) => {
                    info!("Received {} bytes", data.len());
                    // Deserialize binary game state
                }
            }
        }

        // Game loop continues regardless of network state
        clear_background(BLACK);
        draw_text("Multiplayer Demo", 20.0, 40.0, 30.0, WHITE);
        next_frame().await;
    }
}
```

### HTTP Requests

```rust
use quad_net::http_request::{HttpRequest, Method};

async fn fetch_leaderboard() -> Option<String> {
    let request = HttpRequest::new("https://api.example.com/leaderboard")
        .method(Method::Get)
        .header("Authorization", "Bearer token123");

    match request.send().await {
        Ok(response) => Some(response.text()),
        Err(e) => {
            warn!("HTTP error: {:?}", e);
            None
        }
    }
}
```

### quad-net Limitations

- The crates.io version has had issues with binary WebSocket messages. Check GitHub for the latest fixes or pin to a git dependency if needed.
- No built-in reconnection logic — implement your own retry with exponential backoff.
- No UDP support (WebSockets are TCP). For real-time games needing UDP, use a different approach for native builds.

---

## Approach 2: Nakama (Managed Game Server)

Nakama is an open-source game server (by Heroic Labs) with Rust client support. The Fish Game demo by Macroquad's author demonstrates this integration. Nakama handles matchmaking, real-time multiplayer, leaderboards, authentication, and storage.

### Architecture

```
┌─────────────┐  WebSocket   ┌──────────────┐
│  Macroquad   │◄───────────►│   Nakama      │
│  Client      │              │   Server      │
│  (WASM/      │              │  (Docker or   │
│   Native)    │              │   Heroic Cloud)│
└─────────────┘              └──────────────┘
```

### Cargo Setup

```toml
[dependencies]
macroquad = "0.4"
nakama-rs = "0.3"  # Check latest version
```

### Basic Nakama Integration

```rust
use macroquad::prelude::*;

// Simplified — actual Nakama client setup varies by crate version
struct NetworkState {
    connected: bool,
    player_states: Vec<PlayerState>,
    local_player_id: Option<String>,
}

#[derive(Clone, Debug)]
struct PlayerState {
    id: String,
    x: f32,
    y: f32,
}

impl NetworkState {
    fn new() -> Self {
        Self {
            connected: false,
            player_states: Vec::new(),
            local_player_id: None,
        }
    }

    fn send_position(&self, x: f32, y: f32) {
        // Serialize and send via Nakama match data
        // nakama_client.send_match_state(match_id, op_code, data);
    }

    fn process_incoming(&mut self) {
        // Poll Nakama for incoming match state
        // Update player_states from received data
    }
}

#[macroquad::main("Nakama Multiplayer")]
async fn main() {
    let mut net = NetworkState::new();
    let mut local_x = 400.0_f32;
    let mut local_y = 300.0_f32;

    loop {
        // Local input
        let speed = 200.0 * get_frame_time();
        if is_key_down(KeyCode::W) { local_y -= speed; }
        if is_key_down(KeyCode::S) { local_y += speed; }
        if is_key_down(KeyCode::A) { local_x -= speed; }
        if is_key_down(KeyCode::D) { local_x += speed; }

        // Network sync
        net.send_position(local_x, local_y);
        net.process_incoming();

        // Render all players
        clear_background(DARKBLUE);
        draw_circle(local_x, local_y, 20.0, GREEN);

        for player in &net.player_states {
            if Some(&player.id) != net.local_player_id.as_ref() {
                draw_circle(player.x, player.y, 20.0, RED);
            }
        }

        next_frame().await;
    }
}
```

### Fish Game Reference

The [Fish Game](https://macroquad.rs/articles/fish-tutorial/) is the canonical Macroquad multiplayer example. Key architecture decisions:

- **Relayed synchronization**: Each player simulates local physics and sends state to all peers via Nakama.
- **Host authority**: One player is designated "host" and resolves conflicts (item spawns, scoring).
- **State snapshots**: Players send full position/velocity snapshots, not inputs. Simpler but uses more bandwidth.

---

## Approach 3: Custom Networking with Rust Crates

For more control, use Rust networking crates directly. These work in native builds; WASM support varies.

### Option A: naia (Real-Time Game Networking)

`naia` is a cross-platform networking engine designed for games, supporting both native and WASM.

```toml
[dependencies]
naia-client = "0.22"  # Check latest
naia-shared = "0.22"
```

Key features: UDP with reliability layers, client prediction, entity replication, bandwidth optimization.

### Option B: matchbox (Peer-to-Peer via WebRTC)

`matchbox` enables P2P connections through WebRTC, which works in browsers (WASM) and native.

```toml
[dependencies]
matchbox_socket = "0.10"
```

Good for: small-scale P2P games (2–8 players), lobby-based games, avoiding dedicated servers.

### Option C: Raw TCP/UDP (Native Only)

For server-authoritative games where WASM is not required:

```rust
use std::net::UdpSocket;

fn start_client() -> UdpSocket {
    let socket = UdpSocket::bind("0.0.0.0:0").expect("Failed to bind socket");
    socket.set_nonblocking(true).expect("Failed to set non-blocking");
    socket.connect("127.0.0.1:9000").expect("Failed to connect");
    socket
}
```

---

## Network Architecture Patterns

### Client-Server (Authoritative)

Best for competitive games. Server owns the game state; clients send inputs and receive state updates.

```
Client A  ──input──►  Server  ──state──►  Client A
Client B  ──input──►  Server  ──state──►  Client B
```

Use `naia` or a custom server with `tokio` for this pattern.

### Relayed (via Nakama or WebSocket Server)

Simpler to implement. A relay server forwards messages between clients. One client may act as logical "host."

```
Client A  ──state──►  Relay  ──state──►  Client B
Client B  ──state──►  Relay  ──state──►  Client A
```

This is how Fish Game works. Good for cooperative or casual games.

### Peer-to-Peer (via matchbox/WebRTC)

No dedicated server needed (beyond a signaling server for initial connection). Each peer sends state directly.

```
Client A  ◄──state──►  Client B
```

Best for 2-player games or small lobbies.

---

## Serialization

Efficient serialization is critical for networked games. Common choices in the Rust ecosystem:

```toml
[dependencies]
# Fast binary serialization — great for game state
bincode = "1.3"
serde = { version = "1.0", features = ["derive"] }

# Or MessagePack for a balance of speed and cross-language compat
rmp-serde = "1.3"
```

```rust
use serde::{Serialize, Deserialize};

#[derive(Serialize, Deserialize)]
struct GamePacket {
    tick: u64,
    player_id: u32,
    x: f32,
    y: f32,
    vx: f32,
    vy: f32,
    actions: Vec<Action>,
}

fn serialize_packet(packet: &GamePacket) -> Vec<u8> {
    bincode::serialize(packet).expect("Serialization failed")
}

fn deserialize_packet(data: &[u8]) -> Option<GamePacket> {
    bincode::deserialize(data).ok()
}
```

---

## Integrating with Macroquad's Game Loop

Macroquad's async game loop plays well with non-blocking networking. The key pattern: **never block the game loop**.

```rust
#[macroquad::main("Net Game")]
async fn main() {
    let mut net = NetworkClient::connect("ws://server:8080").await;
    let mut game = GameState::new();

    loop {
        let dt = get_frame_time();

        // 1. Process all pending network messages (non-blocking)
        while let Some(msg) = net.try_recv() {
            game.apply_remote_update(msg);
        }

        // 2. Process local input
        let input = gather_input();
        game.apply_local_input(&input);

        // 3. Send local state/input to server
        net.send(game.local_snapshot());

        // 4. Render
        clear_background(BLACK);
        game.draw();

        next_frame().await;
    }
}
```

### Rust Ownership Gotcha

When storing network connections alongside game state, you may hit borrow checker issues. A common solution is to separate network I/O from game state:

```rust
struct Game {
    state: GameState,         // Mutable game data
    net_outbox: Vec<Packet>,  // Queued outgoing messages
}

// Network send/recv happens outside the Game struct
// to avoid borrowing conflicts
fn network_tick(game: &mut Game, ws: &mut WebSocket) {
    // Drain outbox
    for packet in game.net_outbox.drain(..) {
        ws.send_binary(&serialize(&packet));
    }

    // Fill inbox
    while let Some(msg) = ws.try_recv() {
        game.state.apply(deserialize(&msg));
    }
}
```

---

## WASM Networking Considerations

- **WebSockets only**: Browsers cannot use raw TCP/UDP. All WASM networking must go through WebSockets or WebRTC.
- **CORS**: Your WebSocket/HTTP server must allow connections from the domain serving the WASM build.
- **Binary messages**: Prefer binary WebSocket frames over JSON text for performance. Verify your `quad-net` version handles binary correctly (see limitations above).
- **matchbox** works in WASM via WebRTC data channels — the best option for P2P in browsers.

---

## Cargo Dependencies Summary

```toml
[dependencies]
macroquad = "0.4"

# Pick ONE networking approach:
# quad-net = "0.5"           # Simple WebSocket/HTTP (native + WASM)
# nakama-rs = "0.3"          # Managed game server
# naia-client = "0.22"       # Real-time game networking
# matchbox_socket = "0.10"   # P2P via WebRTC

# Serialization (recommended for any approach):
serde = { version = "1.0", features = ["derive"] }
bincode = "1.3"
```

---

## Common Pitfalls

1. **Blocking the game loop:** Never use blocking I/O (`std::net` without `set_nonblocking`). Macroquad's loop must keep rendering even when waiting for network data.
2. **quad-net binary messages:** The crates.io release may not handle binary frames correctly on all platforms. Test thoroughly or use a git dependency.
3. **State synchronization drift:** Without a shared clock or tick counter, clients will desync. Include a tick/sequence number in every packet.
4. **WASM + UDP:** Not possible. If you need low-latency unreliable transport in the browser, use WebRTC data channels (via matchbox).
5. **Serialization size:** `serde_json` is convenient for debugging but 3-5x larger than `bincode`. Switch to binary for production.

---

## Further Reading

- [Fish Game Tutorial](https://macroquad.rs/articles/fish-tutorial/) — Full multiplayer example with Nakama
- [G2 WASM & egui](G2_wasm_and_egui.md) — WASM deployment details
- [R3 Ecosystem & Common Crates](../reference/R3_ecosystem_common_crates.md) — More crate recommendations
- [awesome-quads](https://github.com/ozkriff/awesome-quads) — Curated Macroquad resources
