# G5 — Networking & Multiplayer

> **Category:** guide · **Engine:** Bevy 0.18 · **Related:** [E1 ECS Fundamentals](../architecture/E1_ecs_fundamentals.md) · [R2 Community Plugins](../reference/R2_community_plugins_ecosystem.md) · [R1 Plugins & WASM](../reference/R1_plugins_and_wasm.md) · [bevy-arch-rules](../bevy-arch-rules.md)

---

## Overview

Bevy does not include a built-in networking layer. Multiplayer is handled through community crates that integrate deeply with the ECS. The two dominant options as of Bevy 0.18 are **Lightyear** (full-featured, prediction/rollback) and **Bevy Replicon** (high-level replication API). Both follow a server-authoritative model and replicate ECS state across the network.

This guide covers architecture decisions, crate setup, and common patterns for adding multiplayer to a Bevy game.

---

## Choosing a Networking Crate

| Feature | Lightyear | Bevy Replicon |
|---------|-----------|---------------|
| Server-authoritative | Yes | Yes |
| Component replication | Yes | Yes |
| Client-side prediction | Built-in rollback | Via `bevy_replicon_snap` addon |
| Snapshot interpolation | Built-in | Via addon |
| Input buffering | Tick-aligned, automatic | Manual |
| WebTransport / WASM | Yes | Depends on transport backend |
| Complexity | Higher — more config, more power | Lower — simpler API |
| Best for | Fast-paced action, shooters, fighting games | Turn-based, strategy, co-op, simpler needs |

**Rule of thumb:** If you need client-side prediction with rollback (FPS, action games), start with Lightyear. If you need straightforward state replication (co-op, turn-based), start with Bevy Replicon.

---

## Lightyear Setup

### Cargo Dependencies

```toml
# Cargo.toml — check crates.io for the exact version matching Bevy 0.18
[dependencies]
bevy = "0.18"
lightyear = { version = "0.24", features = ["webtransport"] }
```

> **Version note (Bevy 0.18):** Lightyear tracks Bevy releases closely. Always verify the compatible version on [crates.io/crates/lightyear](https://crates.io/crates/lightyear) before pinning.

### Architecture Concepts

Lightyear uses a **shared crate** pattern — you define your protocol (components, messages, inputs) once, then import it into both client and server binaries.

```
my_game/
├── shared/       # Protocol definitions, shared systems
│   └── lib.rs
├── client/       # Client binary
│   └── main.rs
├── server/       # Server binary
│   └── main.rs
└── Cargo.toml    # Workspace
```

### Defining a Protocol

The protocol tells Lightyear which types travel over the network.

```rust
// shared/lib.rs
use bevy::prelude::*;
use lightyear::prelude::*;

// Components that get replicated
#[derive(Component, Serialize, Deserialize, Clone, Debug, PartialEq)]
pub struct PlayerPosition(pub Vec2);

// Player inputs — tick-aligned and buffered automatically
#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
pub struct PlayerInput {
    pub direction: Vec2,
}

// Network messages for one-off events
#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
pub struct ChatMessage {
    pub text: String,
}
```

### Server Setup

```rust
// server/main.rs
use bevy::prelude::*;
use lightyear::prelude::server::*;

fn main() {
    App::new()
        .add_plugins(DefaultPlugins)
        .add_plugins(ServerPlugins::new(server_config()))
        .add_systems(Update, handle_connections)
        .add_systems(FixedUpdate, move_players)
        .run();
}

fn server_config() -> ServerConfig {
    // Configure transport, tick rate, etc.
    // See Lightyear docs for full ServerConfig options
    ServerConfig::default()
}

// The server moves entities — clients see the result via replication
fn move_players(
    mut query: Query<(&mut PlayerPosition, &PlayerInput)>,
    time: Res<Time>,
) {
    for (mut pos, input) in &mut query {
        pos.0 += input.direction * 200.0 * time.delta_secs();
    }
}
```

### Client-Side Prediction

Lightyear's killer feature: the client runs the same movement systems locally for instant feedback, then reconciles with the server's authoritative state.

```rust
// When enabling prediction, the client re-simulates from the last
// confirmed server state through all buffered inputs on rollback.
// This is a one-line configuration in Lightyear's protocol setup.
```

**Ownership gotcha:** Rollback requires components to be `Clone`. Bevy's `Transform` is `Clone`, but watch out for custom components that hold `Handle<T>` or other non-Clone types — you'll need wrapper types or manual rollback logic.

---

## Bevy Replicon Setup

### Cargo Dependencies

```toml
# Cargo.toml — check crates.io for the exact version matching Bevy 0.18
[dependencies]
bevy = "0.18"
bevy_replicon = "0.30"            # verify against Bevy 0.18 compatibility
bevy_replicon_renet = "0.30"      # transport layer using renet
```

### Marking Components for Replication

```rust
use bevy::prelude::*;
use bevy_replicon::prelude::*;

fn main() {
    App::new()
        .add_plugins((DefaultPlugins, RepliconPlugins))
        // Register which components replicate over the network
        .replicate::<PlayerPosition>()
        .replicate::<PlayerColor>()
        .add_systems(Startup, spawn_players)
        .run();
}

#[derive(Component, Serialize, Deserialize)]
struct PlayerPosition(Vec2);

#[derive(Component, Serialize, Deserialize)]
struct PlayerColor(Color);
```

### Entity Replication

For an entity to replicate to clients, it must have the `Replicated` marker component:

```rust
fn spawn_player(mut commands: Commands) {
    commands.spawn((
        PlayerPosition(Vec2::ZERO),
        PlayerColor(Color::srgb(0.0, 0.8, 0.2)),
        Replicated,  // This entity will be synced to all connected clients
    ));
}
```

### Network Events

Replicon uses `EntityEvent` for RPC-like communication:

```rust
// Define a network event
#[derive(Event, Serialize, Deserialize)]
struct DamageEvent {
    amount: f32,
}

// On the server, send to specific clients using ToClients / FromClient
```

### Visibility

Replicon supports per-entity, per-client visibility — useful for fog-of-war or instanced areas:

```rust
// Only replicate entities that a specific client should see
// Uses a layer-based visibility system via AppVisibilityExt
```

---

## Common Multiplayer Patterns

### Lobby Architecture

```
1. Client connects → server assigns ClientId
2. Client sends "JoinLobby" message
3. Server tracks lobby state, broadcasts player list
4. Host starts game → server transitions to gameplay state
5. Server spawns replicated entities for all players
```

### Authority Model

**Server-authoritative** (recommended for competitive games):
- Clients send inputs only — never modify game state directly
- Server processes inputs, updates world, replicates result
- Prevents most cheating; adds input latency (mitigated by prediction)

**Client-authoritative** (acceptable for co-op / casual):
- Each client owns their entities and sends state updates
- Simpler to implement; vulnerable to cheating
- Replicon supports this via ownership markers

### Tick Rate vs Frame Rate

Both crates decouple network tick rate from render frame rate:

```rust
// Bevy's FixedUpdate schedule runs at a fixed timestep (e.g., 60 Hz)
// Network simulation systems should live in FixedUpdate
// Rendering interpolates between ticks for smooth visuals
app.insert_resource(Time::<Fixed>::from_hz(60.0));
```

**Rust ownership tip:** Network-replicated components are mutated by the networking layer on the client. If your systems also write to them, you'll get conflicting writes. Use the `Predicted` / `Interpolated` marker pattern (Lightyear) or check authority before writing.

---

## WASM / Web Multiplayer

Both Lightyear and Replicon can target WASM, but with caveats:

- **WebTransport** (Lightyear): Modern, UDP-like transport over QUIC. Supported in Chrome/Edge. Best for real-time games.
- **WebSocket** (Replicon via renet): Broader browser support but TCP-only. Fine for turn-based or low-frequency updates.
- Raw UDP/QUIC is **not available** in WASM — you must use one of the above.

```toml
# Enable WASM transport in Lightyear
lightyear = { version = "0.24", features = ["webtransport"] }
```

---

## Debugging Multiplayer

- **Simulated latency/jitter:** Both crates support artificial delay for testing. Always test at 100ms+ RTT.
- **Headless server:** Run the server without rendering (`MinimalPlugins` instead of `DefaultPlugins`) for dedicated server builds.
- **Logging:** Enable `RUST_LOG=lightyear=debug` or `RUST_LOG=bevy_replicon=debug` for packet-level traces.
- **Determinism:** If using rollback (Lightyear), ensure game logic is deterministic — avoid `rand` without seeded RNG, avoid system ordering ambiguity.

---

## Quick Decision Guide

| Scenario | Recommendation |
|----------|---------------|
| 2-player co-op platformer | Bevy Replicon — simple replication, no prediction needed |
| 4-player arena shooter | Lightyear — prediction + rollback essential |
| MMO prototype | Lightyear with visibility — scale via interest management |
| Turn-based strategy | Bevy Replicon — event-based messaging, minimal bandwidth |
| Browser-playable multiplayer | Lightyear with WebTransport or Replicon with WebSocket |

---

## Further Reading

- [Lightyear GitHub](https://github.com/cBournhonesque/lightyear) — examples, book, API docs
- [Bevy Replicon GitHub](https://github.com/simgine/bevy_replicon) — README, examples, changelog
- [Bevy Multiplayer Discussion](https://github.com/bevyengine/bevy/discussions/4388) — community recommendations
- [Bevygap](https://www.metabrew.com/article/bevygap-bevy-multiplayer-with-edgegap-and-lightyear) — autoscaling Bevy servers with Edgegap
