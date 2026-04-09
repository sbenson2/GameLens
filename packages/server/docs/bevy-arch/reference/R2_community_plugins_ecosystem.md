# R2 — Community Plugins Ecosystem

> **Category:** reference · **Engine:** Bevy 0.18 · **Related:** [R1 Plugins & WASM](R1_plugins_and_wasm.md) · [E1 ECS Fundamentals](../architecture/E1_ecs_fundamentals.md) · [bevy-arch-rules](../bevy-arch-rules.md)

---

## Overview

Bevy's plugin system makes it trivial to drop in community crates. This reference covers the most widely-used plugins as of Bevy 0.18 (January 2026), organized by domain. Always check each crate's README for the exact Bevy version compatibility table before adding it to your project.

> **Version pinning matters.** Bevy releases breaking changes roughly every 3 months. Most ecosystem crates publish a new major version within days of each Bevy release. Pin your `bevy` version in `Cargo.toml` and match plugin versions accordingly.

---

## Physics

### Avian (formerly bevy_xpbd)

The recommended physics solution for Bevy. Provides 2D and 3D rigid-body dynamics, colliders, joints, and spatial queries.

```toml
[dependencies]
avian2d = "0.6"   # For 2D games
# OR
avian3d = "0.6"   # For 3D games
```

See [G2 — Physics with Avian](../guides/G2_physics_avian.md) for a full guide.

### bevy_rapier (Rapier integration)

The official Dimforge plugin wrapping the Rapier physics engine. A mature alternative to Avian with a larger existing codebase.

```toml
[dependencies]
bevy_rapier2d = "0.28"   # 2D
# OR
bevy_rapier3d = "0.28"   # 3D
```

**When to pick Rapier vs Avian:**
- **Rapier:** More battle-tested, broader feature set (CCD, articulated bodies), larger community of examples
- **Avian:** Tighter Bevy integration (uses Bevy's own `Transform`), simpler API, actively maintained by Bevy community member

---

## Input

### leafwing-input-manager

Action-based input mapping — define logical actions, bind them to keys/buttons/axes, rebind at runtime.

```toml
[dependencies]
leafwing-input-manager = "0.16"
```

```rust
use bevy::prelude::*;
use leafwing_input_manager::prelude::*;

#[derive(Actionlike, PartialEq, Eq, Hash, Clone, Copy, Debug, Reflect)]
enum PlayerAction {
    Jump,
    Move,
    Attack,
}

fn setup(mut commands: Commands) {
    commands.spawn((
        InputManagerBundle::with_map(
            InputMap::default()
                .with(PlayerAction::Jump, KeyCode::Space)
                .with(PlayerAction::Jump, GamepadButtonType::South)
                .with(PlayerAction::Move, DualAxis::left_stick())
                .with(PlayerAction::Attack, MouseButton::Left),
        ),
    ));
}

fn handle_input(query: Query<&ActionState<PlayerAction>>) {
    for action_state in &query {
        if action_state.just_pressed(&PlayerAction::Jump) {
            println!("Jump!");
        }
    }
}
```

---

## UI & Debug

### bevy_egui

Integrates the [egui](https://github.com/emilk/egui) immediate-mode UI library. Great for debug panels, editors, and tools — not intended for final game UI.

```toml
[dependencies]
bevy_egui = "0.37"
```

```rust
use bevy::prelude::*;
use bevy_egui::{egui, EguiContexts, EguiPlugin};

fn main() {
    App::new()
        .add_plugins(DefaultPlugins)
        .add_plugins(EguiPlugin)
        .add_systems(Update, debug_ui)
        .run();
}

fn debug_ui(mut contexts: EguiContexts) {
    egui::Window::new("Debug").show(contexts.ctx_mut(), |ui| {
        ui.label("Hello from egui!");
        if ui.button("Click me").clicked() {
            println!("Clicked");
        }
    });
}
```

### bevy-inspector-egui

Entity inspector built on bevy_egui. Lets you view and edit component values at runtime — indispensable during development.

```toml
[dependencies]
bevy-inspector-egui = "0.30"
```

---

## VFX & Particles

### bevy_hanabi

GPU particle system. Spawn millions of particles with compute-shader-driven simulation.

```toml
[dependencies]
bevy_hanabi = "0.16"
```

```rust
use bevy::prelude::*;
use bevy_hanabi::prelude::*;

fn spawn_particles(mut commands: Commands, mut effects: ResMut<Assets<EffectAsset>>) {
    let mut gradient = Gradient::new();
    gradient.add_key(0.0, Vec4::new(1.0, 0.5, 0.0, 1.0)); // orange
    gradient.add_key(1.0, Vec4::new(1.0, 0.0, 0.0, 0.0)); // fade to transparent red

    let spawner = Spawner::rate(50.0.into()); // 50 particles per second

    let effect = effects.add(
        EffectAsset::new(1024, spawner, Module::default())
            .with_name("fire")
            .init(SetPositionSphereModifier {
                center: Vec3::ZERO.into(),
                radius: 0.1.into(),
                dimension: ShapeDimension::Volume,
            })
            .init(SetVelocitySphereModifier {
                center: Vec3::ZERO.into(),
                speed: 2.0.into(),
            })
            .render(ColorOverLifetimeModifier { gradient }),
    );

    commands.spawn(ParticleEffectBundle {
        effect: ParticleEffect::new(effect),
        ..default()
    });
}
```

---

## Asset Loading

### bevy_asset_loader

Declarative asset loading with loading states. Eliminates boilerplate `Handle<T>` management.

```toml
[dependencies]
bevy_asset_loader = "0.23"
```

```rust
use bevy::prelude::*;
use bevy_asset_loader::prelude::*;

#[derive(Clone, Eq, PartialEq, Debug, Hash, Default, States)]
enum GameState {
    #[default]
    Loading,
    Playing,
}

#[derive(AssetCollection, Resource)]
struct GameAssets {
    #[asset(path = "textures/player.png")]
    player_texture: Handle<Image>,

    #[asset(path = "audio/music.ogg")]
    background_music: Handle<AudioSource>,

    #[asset(paths("levels/1.ron", "levels/2.ron"), collection(typed))]
    levels: Vec<Handle<DynamicScene>>,
}

fn main() {
    App::new()
        .add_plugins(DefaultPlugins)
        .init_state::<GameState>()
        .add_loading_state(
            LoadingState::new(GameState::Loading)
                .continue_to_state(GameState::Playing)
                .load_collection::<GameAssets>(),
        )
        .run();
}
```

---

## Networking & Multiplayer

### bevy_replicon

Server-authoritative entity replication. The leading networking solution for Bevy multiplayer games.

```toml
[dependencies]
bevy_replicon = "0.38"
bevy_replicon_renet2 = "0.10"  # Transport backend (renet2)
```

**Architecture:** One Bevy app acts as authoritative server; clients connect and receive replicated component state. Components flow server → client only. Client input is sent via events/triggers.

```rust
use bevy::prelude::*;
use bevy_replicon::prelude::*;

#[derive(Component, Serialize, Deserialize)]
struct PlayerPosition(Vec3);

fn setup_replication(app: &mut App) {
    app.add_plugins(RepliconPlugins)
        .replicate::<PlayerPosition>();  // Mark for server→client replication
}
```

**Transport backends** (pick one):
- `bevy_replicon_renet2` — UDP-based (renet2), good for action games
- `bevy_replicon_quinnet` — QUIC-based, good for WebTransport/WASM

---

## Tilemaps

### bevy_ecs_tilemap

High-performance tilemap rendering using ECS. Supports isometric, hexagonal, and square grids.

```toml
[dependencies]
bevy_ecs_tilemap = "0.16"
```

---

## Audio

### bevy_kira_audio

Wraps the Kira audio library for more advanced audio control than Bevy's built-in audio — cross-fading, spatial audio, audio buses.

```toml
[dependencies]
bevy_kira_audio = "0.23"
```

---

## Plugin Compatibility Quick Reference (Bevy 0.18)

| Plugin | Crate Version | Domain |
|--------|--------------|--------|
| avian2d / avian3d | 0.6 | Physics |
| bevy_rapier2d / 3d | 0.28 | Physics |
| leafwing-input-manager | 0.16 | Input |
| bevy_egui | 0.37 | UI/Debug |
| bevy-inspector-egui | 0.30 | UI/Debug |
| bevy_hanabi | 0.16 | Particles |
| bevy_asset_loader | 0.23 | Asset management |
| bevy_replicon | 0.38 | Networking |
| bevy_ecs_tilemap | 0.16 | Tilemaps |
| bevy_kira_audio | 0.23 | Audio |

> **Note:** Version numbers are approximate for the Bevy 0.18 release window. Always verify on [crates.io](https://crates.io) or the plugin's GitHub releases page before adding to your project.

---

## Finding More Plugins

- **[Bevy Assets](https://bevy.org/assets/)** — Official community plugin registry
- **[awesome-bevy](https://github.com/d-bucur/awesome-bevy)** — Curated list on GitHub
- **[This Week in Bevy](https://thisweekinbevy.com/)** — Weekly newsletter tracking new crates and updates
