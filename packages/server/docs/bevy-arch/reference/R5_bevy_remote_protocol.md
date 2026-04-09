# R5 — Bevy Remote Protocol (BRP)

> **Category:** reference · **Engine:** Bevy 0.18 · **Related:** [E6 Testing & Debugging](../architecture/E6_testing_and_debugging.md) · [G6 Editor Tools](../guides/G6_editor_tools_workflow.md) · [bevy-arch-rules](../bevy-arch-rules.md)

---

## Overview

The Bevy Remote Protocol (BRP) enables remote inspection and manipulation of a running Bevy application over HTTP using JSON-RPC 2.0. Add `RemotePlugin` + `RemoteHttpPlugin` and any external tool — a custom editor, AI coding assistant, or debug dashboard — can query entities, modify components, spawn/despawn, and trigger events in real time.

BRP is transport-agnostic by design (TCP, WebSockets, HTTP, IPC are all possible), but the built-in `RemoteHttpPlugin` uses HTTP on port **15702** by default.

---

## Quick Setup

```toml
# Cargo.toml — no extra crates needed, it's in bevy itself
[dependencies]
bevy = { version = "0.18", features = ["default"] }
```

```rust
use bevy::prelude::*;
use bevy::remote::{http::RemoteHttpPlugin, RemotePlugin};

fn main() {
    App::new()
        .add_plugins(DefaultPlugins)
        .add_plugins(RemotePlugin::default())
        .add_plugins(RemoteHttpPlugin::default())
        .add_systems(Startup, setup)
        .run();
}

fn setup(mut commands: Commands) {
    commands.spawn((
        Name::new("Player"),
        Transform::from_xyz(0.0, 1.0, 0.0),
    ));
}
```

The app now accepts JSON-RPC POST requests at `http://localhost:15702/`.

> **Note:** `RemoteHttpPlugin` is not available on WASM targets.

---

## Built-in Methods

BRP ships with a comprehensive set of world-manipulation verbs. All component/resource types are referenced by their **fully-qualified Rust type path** (via `TypePath::type_path()`).

### Entity Methods

| Method | Purpose |
|--------|---------|
| `world.spawn_entity` | Create a new entity with components |
| `world.despawn_entity` | Remove an entity |
| `world.get_components` | Read component values from an entity |
| `world.insert_components` | Add/overwrite components on an entity |
| `world.remove_components` | Delete components from an entity |
| `world.mutate_components` | Modify individual fields of a component |
| `world.reparent_entities` | Change entity parent in the hierarchy |
| `world.list_components` | Enumerate all registered component types |

### Query Methods

| Method | Purpose |
|--------|---------|
| `world.query` | Search entities by component filters |

### Resource Methods

| Method | Purpose |
|--------|---------|
| `world.get_resources` | Read resource values |
| `world.insert_resources` | Add/overwrite resources |
| `world.remove_resources` | Delete resources |
| `world.mutate_resources` | Modify individual fields of a resource |
| `world.list_resources` | Enumerate registered resource types |

### Other Methods

| Method | Purpose |
|--------|---------|
| `world.trigger_event` | Fire an event into the ECS |
| `registry.schema` | Retrieve type reflection schema |
| `rpc.discover` | List all available RPC methods |

### Watch Variants

Append `+watch` to streaming-capable methods for real-time updates:

- `world.get_components+watch` — stream component value changes
- `world.list_components+watch` — stream component additions/removals

---

## Request / Response Format

BRP uses **JSON-RPC 2.0**. Every request needs a `method`, an `id`, and optional `params`.

### Querying an Entity's Transform

**Request:**
```json
{
    "method": "world.get_components",
    "id": 0,
    "params": {
        "entity": 4294967298,
        "components": [
            "bevy_transform::components::transform::Transform"
        ]
    }
}
```

**Response:**
```json
{
    "jsonrpc": "2.0",
    "id": 0,
    "result": {
        "bevy_transform::components::transform::Transform": {
            "translation": { "x": 0.0, "y": 0.5, "z": 0.0 },
            "rotation": { "x": 0.0, "y": 0.0, "z": 0.0, "w": 1.0 },
            "scale": { "x": 1.0, "y": 1.0, "z": 1.0 }
        }
    }
}
```

### Querying Entities with Filters

```json
{
    "method": "world.query",
    "id": 1,
    "params": {
        "data": {
            "components": [
                "bevy_transform::components::transform::Transform"
            ],
            "option": "all",
            "has": []
        },
        "filter": {
            "with": [],
            "without": []
        },
        "strict": false
    }
}
```

### Spawning an Entity

```json
{
    "method": "world.spawn_entity",
    "id": 2,
    "params": {
        "components": {
            "bevy_core::name::Name": "RemoteEntity",
            "bevy_transform::components::transform::Transform": {
                "translation": { "x": 5.0, "y": 0.0, "z": 0.0 },
                "rotation": { "x": 0.0, "y": 0.0, "z": 0.0, "w": 1.0 },
                "scale": { "x": 1.0, "y": 1.0, "z": 1.0 }
            }
        }
    }
}
```

### Error Response

```json
{
    "jsonrpc": "2.0",
    "id": 0,
    "error": {
        "code": -32602,
        "message": "Missing \"entity\" field",
        "data": {}
    }
}
```

---

## Testing with curl

```bash
# Query all entities with a Name component
curl -X POST http://localhost:15702 \
  -H "Content-Type: application/json" \
  -d '{
    "method": "world.query",
    "id": 0,
    "params": {
      "data": {
        "components": ["bevy_core::name::Name"]
      }
    }
  }'

# Spawn an entity remotely
curl -X POST http://localhost:15702 \
  -H "Content-Type: application/json" \
  -d '{
    "method": "world.spawn_entity",
    "id": 1,
    "params": {
      "components": {
        "bevy_core::name::Name": "DebugCube"
      }
    }
  }'

# Discover all available methods
curl -X POST http://localhost:15702 \
  -H "Content-Type: application/json" \
  -d '{"method": "rpc.discover", "id": 99}'
```

---

## Custom Methods

Extend BRP with your own RPC methods during plugin setup:

```rust
use bevy::remote::{BrpResult, RemotePlugin};
use serde_json::Value;

App::new()
    .add_plugins(DefaultPlugins)
    .add_plugins(
        RemotePlugin::default()
            .with_method("game/get_score", get_score_handler)
    )
    .add_plugins(RemoteHttpPlugin::default())
    .run();

fn get_score_handler(
    In(params): In<Option<Value>>,
    score: Res<GameScore>,
) -> BrpResult {
    Ok(serde_json::json!({
        "score": score.current,
        "high_score": score.best
    }))
}
```

Custom handlers receive optional JSON params and have full access to ECS system parameters.

---

## Practical Use Cases

### Live Editor / Inspector

The primary motivation for BRP — external tools can browse the entity hierarchy, inspect component values, and tweak properties in real time without recompiling.

### AI-Assisted Development

The `bevy_brp_mcp` crate bridges BRP to the Model Context Protocol, letting AI coding assistants (Claude, etc.) inspect and manipulate a live Bevy game. Add it alongside `RemotePlugin`:

```toml
[dependencies]
bevy_brp_mcp = "0.19"  # check crates.io for latest
```

### Debug Dashboards

Build a web UI that polls `world.query` to display entity counts, component distributions, or performance metrics from a running game.

### Automated Testing

Integration tests can spawn a Bevy app with BRP enabled, then use HTTP requests to verify game state programmatically.

---

## Security Considerations

BRP has **no built-in authentication or authorization**. In development this is fine, but for any networked deployment:

- Bind to `127.0.0.1` only (the default) — never expose to `0.0.0.0` in production
- Use a reverse proxy with auth if remote access is needed
- BRP copies all requested data between client and server — be mindful of data volume with frequent polling
- Side-effect requests (`spawn`, `insert`, `mutate`) are processed in order; read-only requests may resolve out of order

---

## Ownership Gotcha

BRP communicates via serialized JSON, so all components you want to inspect or modify must derive `Reflect`. Custom components need:

```rust
#[derive(Component, Reflect, Default)]
#[reflect(Component)]
struct Health {
    current: f32,
    max: f32,
}
```

Without `#[reflect(Component)]`, BRP cannot serialize or deserialize the component. This is a common stumbling block — you'll get a "component not found in registry" error if reflection is missing.
