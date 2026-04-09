# G1 — Getting Started with Bevy

> **Category:** guide · **Engine:** Bevy 0.18 · **Related:** [E1 ECS Fundamentals](../architecture/E1_ecs_fundamentals.md) · [bevy-arch-rules](../bevy-arch-rules.md)

---

## Prerequisites

- **Rust toolchain:** Install via [rustup.rs](https://rustup.rs). Bevy 0.18 requires Rust 1.84+.
- **System dependencies:** On Linux, install dev packages for graphics/audio (see [Bevy Linux Dependencies](https://github.com/bevyengine/bevy/blob/main/docs/linux_dependencies.md)).
- **IDE:** VS Code with rust-analyzer, or RustRover/IntelliJ with Rust plugin.

---

## Create a New Project

```bash
cargo new my_game
cd my_game
```

Add Bevy to `Cargo.toml`:

```toml
[dependencies]
bevy = "0.18"

# Faster compile times during development (optional but strongly recommended)
[profile.dev]
opt-level = 1

[profile.dev.package."*"]
opt-level = 3
```

### Feature Collections (New in 0.18)

Bevy 0.18 introduced cargo feature collections for leaner builds:

```toml
# 2D game only — skip 3D rendering, PBR, etc.
bevy = { version = "0.18", default-features = false, features = ["2d"] }

# 3D game
bevy = { version = "0.18", default-features = false, features = ["3d"] }

# UI-heavy app
bevy = { version = "0.18", default-features = false, features = ["ui"] }
```

### Enable Fast Compiles

Create `.cargo/config.toml` in your project root:

```toml
# Use the nightly linker for faster link times (optional)
# [target.x86_64-unknown-linux-gnu]
# linker = "clang"
# rustflags = ["-C", "link-arg=-fuse-ld=lld"]

# Enable dynamic linking for dev builds (much faster iteration)
[features]
default = ["bevy/dynamic_linking"]
```

Or run with dynamic linking directly:

```bash
cargo run --features bevy/dynamic_linking
```

---

## Minimal App

```rust
use bevy::prelude::*;

fn main() {
    App::new()
        .add_plugins(DefaultPlugins)
        .add_systems(Startup, setup)
        .add_systems(Update, greet_system)
        .run();
}

#[derive(Component)]
struct Person;

#[derive(Component)]
struct Name(String);

fn setup(mut commands: Commands) {
    commands.spawn((Person, Name("Alice".to_string())));
    commands.spawn((Person, Name("Bob".to_string())));
}

fn greet_system(query: Query<&Name, With<Person>>) {
    for name in &query {
        println!("Hello, {}!", name.0);
    }
}
```

Run it:

```bash
cargo run
```

---

## Adding a 2D Game Window with a Sprite

```rust
use bevy::prelude::*;

fn main() {
    App::new()
        .add_plugins(DefaultPlugins.set(WindowPlugin {
            primary_window: Some(Window {
                title: "My Game".to_string(),
                resolution: (800.0, 600.0).into(),
                ..default()
            }),
            ..default()
        }))
        .add_systems(Startup, setup)
        .add_systems(Update, move_player)
        .run();
}

#[derive(Component)]
struct Player;

fn setup(mut commands: Commands, asset_server: Res<AssetServer>) {
    // Camera is required to see anything
    commands.spawn(Camera2d);

    // Spawn a sprite
    commands.spawn((
        Sprite::from_image(asset_server.load("player.png")),
        Transform::from_xyz(0.0, 0.0, 0.0),
        Player,
    ));
}

fn move_player(
    keyboard: Res<ButtonInput<KeyCode>>,
    mut query: Query<&mut Transform, With<Player>>,
    time: Res<Time>,
) {
    let speed = 200.0;
    for mut transform in &mut query {
        if keyboard.pressed(KeyCode::ArrowLeft) {
            transform.translation.x -= speed * time.delta_secs();
        }
        if keyboard.pressed(KeyCode::ArrowRight) {
            transform.translation.x += speed * time.delta_secs();
        }
        if keyboard.pressed(KeyCode::ArrowUp) {
            transform.translation.y += speed * time.delta_secs();
        }
        if keyboard.pressed(KeyCode::ArrowDown) {
            transform.translation.y -= speed * time.delta_secs();
        }
    }
}
```

Place your `player.png` in an `assets/` folder at the project root.

---

## Input Handling

Bevy provides `ButtonInput<T>` for keyboard, mouse, and gamepad:

```rust
fn input_system(
    keyboard: Res<ButtonInput<KeyCode>>,
    mouse: Res<ButtonInput<MouseButton>>,
) {
    // Continuous hold
    if keyboard.pressed(KeyCode::Space) {
        println!("Space held");
    }

    // Just pressed this frame
    if keyboard.just_pressed(KeyCode::Enter) {
        println!("Enter pressed!");
    }

    // Just released this frame
    if mouse.just_released(MouseButton::Left) {
        println!("Left click released");
    }
}
```

### Gamepad Input

```rust
fn gamepad_system(gamepads: Query<&Gamepad>) {
    for gamepad in &gamepads {
        if gamepad.just_pressed(GamepadButton::South) {
            println!("A/Cross pressed!");
        }

        let left_stick_x = gamepad.get(GamepadAxis::LeftStickX).unwrap_or(0.0);
        if left_stick_x.abs() > 0.1 {
            println!("Left stick X: {}", left_stick_x);
        }
    }
}
```

---

## Audio

```rust
fn setup_audio(mut commands: Commands, asset_server: Res<AssetServer>) {
    // Background music — spawning an AudioPlayer entity starts playback
    commands.spawn((
        AudioPlayer::new(asset_server.load("music.ogg")),
        PlaybackSettings::LOOP,
    ));
}

fn play_sfx(mut commands: Commands, asset_server: Res<AssetServer>) {
    // One-shot sound effect
    commands.spawn((
        AudioPlayer::new(asset_server.load("explosion.ogg")),
        PlaybackSettings::DESPAWN, // Despawn entity when done
    ));
}
```

---

## Asset Loading

Bevy loads assets asynchronously. The `AssetServer` returns a `Handle<T>` immediately; the asset loads in the background.

```rust
fn setup(mut commands: Commands, asset_server: Res<AssetServer>) {
    let texture: Handle<Image> = asset_server.load("textures/hero.png");
    let font: Handle<Font> = asset_server.load("fonts/main.ttf");
    let scene: Handle<Scene> = asset_server.load("models/level.glb#Scene0");

    // Assets go in the `assets/` directory at project root
    // Subdirectories become the load path
}
```

---

## Common Plugins Ecosystem

Bevy's modular design encourages community plugins. Key crates for game dev (as of Bevy 0.18):

| Crate | Purpose |
|-------|---------|
| `avian2d` / `avian3d` | Physics (Bevy-native, replaced bevy_rapier for many) |
| `bevy_rapier2d` / `bevy_rapier3d` | Rapier physics integration |
| `bevy_egui` | egui immediate-mode UI |
| `bevy_ecs_ldtk` | LDtk level editor integration |
| `bevy_ecs_tilemap` | Tilemap rendering |
| `bevy_asset_loader` | Structured asset loading with states |
| `bevy_kira_audio` | Advanced audio via Kira |
| `leafwing-input-manager` | Action-based input mapping |
| `bevy_hanabi` | GPU particle system |
| `bevy_mod_picking` | Mouse picking / raycasting |

Add them alongside Bevy in your `Cargo.toml` — check each crate's docs for the compatible Bevy version.

---

## Project Structure Convention

```
my_game/
├── assets/              # Textures, audio, fonts, scenes, levels
│   ├── textures/
│   ├── audio/
│   └── fonts/
├── src/
│   ├── main.rs          # App setup, plugin registration
│   ├── player.rs        # Player components + systems (as a Plugin)
│   ├── enemies.rs       # Enemy components + systems
│   ├── ui.rs            # UI components + systems
│   ├── physics.rs       # Physics setup + systems
│   └── states.rs        # Game states (Menu, Playing, etc.)
├── Cargo.toml
└── .cargo/
    └── config.toml      # Fast compile settings
```

### Organizing with Plugins

Bevy encourages grouping related components + systems into **Plugins**:

```rust
// player.rs
pub struct PlayerPlugin;

impl Plugin for PlayerPlugin {
    fn build(&self, app: &mut App) {
        app.add_systems(Startup, spawn_player)
           .add_systems(Update, (move_player, animate_player));
    }
}

// main.rs
fn main() {
    App::new()
        .add_plugins(DefaultPlugins)
        .add_plugins(PlayerPlugin)
        .run();
}
```

---

## WASM / Web Builds

Bevy supports WebAssembly out of the box:

```bash
# Install the WASM target
rustup target add wasm32-unknown-unknown

# Install wasm-bindgen CLI
cargo install wasm-bindgen-cli

# Build for web
cargo build --release --target wasm32-unknown-unknown

# Generate JS bindings
wasm-bindgen --out-dir ./web --target web \
    target/wasm32-unknown-unknown/release/my_game.wasm
```

Create a minimal `index.html` to load the WASM binary, or use `trunk` for a smoother workflow:

```bash
cargo install trunk
trunk serve  # Auto-rebuilds and serves at localhost:8080
```

---

## Common Pitfalls

1. **Forgetting a Camera:** Nothing renders without a `Camera2d` or `Camera3d` entity.
2. **Missing `assets/` folder:** Assets must be in `assets/` at the crate root (not `src/`).
3. **Borrow checker with queries:** You cannot have two `Query` params that access the same component mutably. Use `ParamSet` to resolve conflicts.
4. **Commands are deferred:** Spawned entities aren't queryable until the next system run.
5. **Long initial compile:** First build downloads and compiles all dependencies. Use dynamic linking during dev.
6. **Plugin version mismatch:** Community plugins must match your Bevy version exactly. Check compatibility before adding.
