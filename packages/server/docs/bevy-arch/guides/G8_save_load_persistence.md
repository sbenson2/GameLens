# G8 — Save/Load Systems & Game Persistence

> **Category:** guide · **Engine:** Bevy 0.18 · **Related:** [E4 Scenes & Serialization](../architecture/E4_scenes_animation_serialization.md) · [E1 ECS Fundamentals](../architecture/E1_ecs_fundamentals.md) · [R2 Community Plugins](../reference/R2_community_plugins_ecosystem.md) · [bevy-arch-rules](../bevy-arch-rules.md)

---

## Overview

Saving and loading game state is one of the most common — and most error-prone — systems in game development. Bevy provides `DynamicScene` as a foundation (see [E4](../architecture/E4_scenes_animation_serialization.md)), but real-world save systems need more: selective serialization, resource persistence, save file versioning, and migration strategies.

This guide covers practical patterns for building production-quality save/load systems in Bevy 0.18, from simple approaches to full-featured third-party frameworks.

---

## Strategy: What to Save

Not everything in the ECS should be serialized. A good save system captures the **minimum state** needed to reconstruct the game.

### Save These

- Player stats, inventory, position, quest progress
- World state: unlocked areas, placed items, NPC dialogue flags
- Game settings persisted across sessions
- Custom `Resource` types holding progression data

### Skip These

- Rendering components (`Mesh`, `Handle<Image>`, `Camera`)
- Physics state that can be re-derived (velocities, collider shapes)
- UI components
- Transient gameplay state (particle effects, screen shake timers)

### The Marker Pattern

Tag saveable entities with a marker component to separate save-worthy data from ephemeral runtime state:

```rust
use bevy::prelude::*;

/// Marker: this entity should be included in save files.
#[derive(Component, Reflect, Default)]
#[reflect(Component)]
struct Saveable;

/// Player data worth persisting.
#[derive(Component, Reflect, Default)]
#[reflect(Component)]
struct PlayerData {
    name: String,
    health: i32,
    gold: u32,
    position: Vec3,
}

/// Transient — NOT saved. Re-created on load.
#[derive(Component)]
struct AnimationState {
    current_clip: Handle<AnimationClip>,
}
```

---

## Approach 1: Built-in DynamicScene (Simple Games)

For small games with limited state, Bevy's built-in `DynamicScene` is sufficient. This approach requires no extra dependencies.

### Saving

```rust
use bevy::prelude::*;
use std::fs;

fn save_game(world: &World) {
    let scene = DynamicSceneBuilder::from_world(world)
        .allow::<PlayerData>()
        .allow::<Transform>()
        .allow::<Saveable>()
        .extract_entities(
            world.iter_entities()
                .filter(|e| e.contains::<Saveable>())
                .map(|e| e.id()),
        )
        .build();

    let type_registry = world.resource::<AppTypeRegistry>().read();
    let serialized = scene
        .serialize(&type_registry)
        .expect("Serialization failed");

    // Write to the OS-appropriate save directory
    let save_dir = dirs::data_dir()
        .unwrap_or_default()
        .join("my_game/saves");
    fs::create_dir_all(&save_dir).ok();
    fs::write(save_dir.join("save_01.scn.ron"), serialized.to_string())
        .expect("Failed to write save file");
}
```

### Loading

```rust
fn load_game(mut commands: Commands, asset_server: Res<AssetServer>) {
    commands.spawn(DynamicSceneRoot(
        asset_server.load("saves/save_01.scn.ron"),
    ));
}

fn on_save_loaded(mut events: EventReader<SceneInstanceReady>) {
    for event in events.read() {
        info!("Save file loaded, root entity: {:?}", event.parent);
    }
}
```

### Limitations

- `DynamicScene` serializes entities and components only — **not** `Resource` types by default.
- Entity IDs are unstable across save/load cycles. Use a custom ID component for cross-reference.
- No built-in versioning or migration support.

---

## Approach 2: Custom Serde-Based System (Medium Complexity)

For games that need to save `Resource` types or want more control, build a custom system with `serde` and `ron`.

### Cargo Dependencies

```toml
[dependencies]
bevy = "0.18"
serde = { version = "1", features = ["derive"] }
ron = "0.8"
```

### Define a Save File Struct

```rust
use bevy::prelude::*;
use serde::{Serialize, Deserialize};

/// Version-stamped save file — the entire persisted state.
#[derive(Serialize, Deserialize)]
struct SaveFile {
    version: u32,
    player: PlayerSave,
    world_flags: WorldFlags,
    playtime_seconds: f64,
}

#[derive(Serialize, Deserialize)]
struct PlayerSave {
    name: String,
    health: i32,
    gold: u32,
    position: [f32; 3],
    inventory: Vec<String>,
}

#[derive(Resource, Serialize, Deserialize, Default)]
struct WorldFlags {
    boss_defeated: bool,
    doors_unlocked: Vec<String>,
    quests_completed: Vec<String>,
}
```

### Save System

```rust
fn save_game_custom(
    player_query: Query<(&PlayerData, &Transform), With<Saveable>>,
    world_flags: Res<WorldFlags>,
    time: Res<Time>,
) {
    let Ok((player, transform)) = player_query.single() else {
        warn!("No saveable player found");
        return;
    };

    let save = SaveFile {
        version: 1,
        player: PlayerSave {
            name: player.name.clone(),
            health: player.health,
            gold: player.gold,
            position: transform.translation.to_array(),
            inventory: vec![], // populate from inventory component
        },
        world_flags: WorldFlags {
            boss_defeated: world_flags.boss_defeated,
            doors_unlocked: world_flags.doors_unlocked.clone(),
            quests_completed: world_flags.quests_completed.clone(),
        },
        playtime_seconds: time.elapsed_secs_f64(),
    };

    let serialized = ron::ser::to_string_pretty(&save, ron::ser::PrettyConfig::default())
        .expect("Serialization failed");

    let save_path = dirs::data_dir()
        .unwrap_or_default()
        .join("my_game/saves/slot_1.ron");
    std::fs::create_dir_all(save_path.parent().unwrap()).ok();
    std::fs::write(&save_path, serialized)
        .expect("Failed to write save");

    info!("Game saved to {:?}", save_path);
}
```

### Load System

```rust
fn load_game_custom(mut commands: Commands) {
    let save_path = dirs::data_dir()
        .unwrap_or_default()
        .join("my_game/saves/slot_1.ron");

    let data = match std::fs::read_to_string(&save_path) {
        Ok(d) => d,
        Err(e) => {
            warn!("No save file found: {e}");
            return;
        }
    };

    let save: SaveFile = match ron::from_str(&data) {
        Ok(s) => s,
        Err(e) => {
            error!("Corrupt save file: {e}");
            return;
        }
    };

    // Apply version migrations if needed
    let save = migrate_save(save);

    // Restore world flags as a resource
    commands.insert_resource(save.world_flags);

    // Spawn player entity from save data
    let pos = save.player.position;
    commands.spawn((
        Saveable,
        PlayerData {
            name: save.player.name,
            health: save.player.health,
            gold: save.player.gold,
            position: Vec3::from_array(pos),
        },
        Transform::from_translation(Vec3::from_array(pos)),
    ));

    info!("Game loaded from {:?}", save_path);
}
```

### Save File Versioning

Always version your save files. When the schema changes, write migration functions:

```rust
fn migrate_save(mut save: SaveFile) -> SaveFile {
    // v0 → v1: added quests_completed field
    if save.version == 0 {
        save.world_flags.quests_completed = vec![];
        save.version = 1;
    }
    // v1 → v2: future migration
    save
}
```

> **Rust gotcha — `#[serde(default)]`:** Adding a new field to a serialized struct breaks old saves unless you annotate it with `#[serde(default)]`. Use this liberally for forward compatibility.

---

## Approach 3: Third-Party Frameworks (Production Games)

For larger games, community crates handle the boilerplate:

### bevy_save (v2.0 — supports Bevy 0.16)

Full-featured: snapshots, rollback (undo/redo), type filtering, version migration. **Check compatibility** — may lag behind Bevy 0.18.

```toml
[dependencies]
bevy_save = "2.0"
```

Key concepts:

- `Snapshot` — a serializable capture of world state
- `Pipeline` — combines `Backend` (storage) + `Format` (serializer)
- `world.save(&pathway)` / `world.load(&pathway)` — one-line save/load
- `world.checkpoint()` / `world.rollback()` — undo/redo for editors

### moonshine_save

Lightweight, selective saving using a `Save` marker component. Entities without `Save` are ignored.

### bevy_atomic_save

Focuses on atomicity — saves either fully succeed or fully fail. Good for games where partial saves would corrupt state.

> **Version warning:** Third-party crates often lag 1–2 releases behind Bevy. Always check the crate's Bevy version support on crates.io before adding a dependency.

---

## Best Practices

### Save Directory Location

Use `dirs` crate for platform-appropriate save directories:

```rust
// Linux:   ~/.local/share/my_game/saves/
// macOS:   ~/Library/Application Support/my_game/saves/
// Windows: C:\Users\<user>\AppData\Roaming\my_game\saves\
let save_dir = dirs::data_dir().unwrap().join("my_game/saves");
```

```toml
[dependencies]
dirs = "5"
```

### Atomic Writes

Never write directly to the save file — a crash mid-write corrupts it:

```rust
use std::fs;

fn atomic_save(path: &std::path::Path, data: &str) -> std::io::Result<()> {
    let tmp = path.with_extension("tmp");
    fs::write(&tmp, data)?;
    fs::rename(&tmp, path)?; // Atomic on most filesystems
    Ok(())
}
```

### Save Slot UI Pattern

```rust
#[derive(Resource)]
struct SaveSlots {
    slots: Vec<Option<SaveMetadata>>,
}

#[derive(Serialize, Deserialize, Clone)]
struct SaveMetadata {
    slot_index: usize,
    timestamp: String,
    playtime_seconds: f64,
    chapter: String,
    /// Optional: small screenshot encoded as base64
    thumbnail: Option<String>,
}
```

### Autosave

```rust
use bevy::prelude::*;

#[derive(Resource)]
struct AutosaveTimer(Timer);

fn autosave_system(
    time: Res<Time>,
    mut timer: ResMut<AutosaveTimer>,
    // ... other save dependencies
) {
    timer.0.tick(time.delta());
    if timer.0.just_finished() {
        // Trigger save (call your save function here)
        info!("Autosaving...");
    }
}

// In app setup:
// app.insert_resource(AutosaveTimer(Timer::from_seconds(300.0, TimerMode::Repeating)));
```

---

## Common Pitfalls

| Pitfall | Solution |
|---------|----------|
| Forgetting `register_type::<T>()` | Component silently missing from save. Register ALL reflected types. |
| Entity ID instability | Use a `SaveId(u64)` component as a stable cross-session identifier. |
| Saving rendering state | Filter out `Handle<T>`, mesh/material components. Reconstruct on load. |
| No versioning | Always include a `version` field. Old saves WILL break without migration. |
| Non-atomic writes | Use tmp file + rename pattern to prevent corruption. |
| Blocking I/O on main thread | For large saves, use `AsyncComputeTaskPool` to serialize off-thread. |

---

## Further Reading

- [E4 — Scenes & Serialization](../architecture/E4_scenes_animation_serialization.md) — DynamicScene fundamentals
- [bevy_save on crates.io](https://crates.io/crates/bevy_save)
- [moonshine_save on GitHub](https://github.com/Zeenobit/moonshine_save)
- [Bevy scene example](https://github.com/bevyengine/bevy/blob/main/examples/scene/scene.rs)
- [RON format specification](https://github.com/ron-rs/ron)
