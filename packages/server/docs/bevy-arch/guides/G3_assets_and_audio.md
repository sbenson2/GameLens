# G3 — Asset Loading & Audio

> **Category:** guide · **Engine:** Bevy 0.18 · **Related:** [E1 ECS Fundamentals](../architecture/E1_ecs_fundamentals.md) · [G1 Getting Started](G1_getting_started.md) · [bevy-arch-rules](../bevy-arch-rules.md)

---

## Overview

Bevy's asset system is asynchronous and handle-based. You never load a file synchronously — instead, you get a `Handle<T>` immediately and the data streams in on a background thread. This guide covers the `AssetServer`, typed handles, asset events, and the built-in audio system.

---

## The AssetServer

`AssetServer` is Bevy's central resource for loading files from the `assets/` directory (relative to your project root, or the executable for release builds).

```rust
use bevy::prelude::*;

fn setup(mut commands: Commands, asset_server: Res<AssetServer>) {
    // Load a texture — returns a Handle<Image> immediately
    let texture: Handle<Image> = asset_server.load("textures/player.png");

    // Load a scene file
    let scene: Handle<Scene> = asset_server.load("scenes/level1.glb#Scene0");

    // Spawn a sprite with the texture handle
    commands.spawn(Sprite {
        image: texture,
        ..default()
    });
}
```

**Key points about handles:**

- `Handle<T>` is cheap to clone — it's internally an `Arc` with an asset ID. Clone freely.
- The actual data loads asynchronously. The first frame after `load()`, the asset may not be ready.
- Loading the same path twice returns the same handle (assets are deduplicated).
- Handles keep assets alive. When all handles to an asset are dropped, the asset is eventually unloaded.

### Checking Load State

```rust
fn check_loaded(
    asset_server: Res<AssetServer>,
    texture: Res<MyTextureHandle>, // your stored handle
) {
    match asset_server.load_state(&texture.0) {
        LoadState::Loaded => { /* ready to use */ }
        LoadState::Loading => { /* still in progress */ }
        LoadState::Failed(_) => { /* handle error */ }
        _ => {}
    }
}
```

### Asset Events

React to asset lifecycle changes through `AssetEvent<T>`:

```rust
fn on_image_loaded(mut events: EventReader<AssetEvent<Image>>) {
    for event in events.read() {
        match event {
            AssetEvent::Added { id } => {
                // A new image finished loading
            }
            AssetEvent::Modified { id } => {
                // Hot-reloaded (in dev builds)
            }
            AssetEvent::Removed { id } => {
                // Asset was unloaded
            }
            _ => {}
        }
    }
}
```

---

## Organized Loading with bevy_asset_loader

For anything beyond a simple prototype, manually tracking many `Handle<T>` values gets tedious. The `bevy_asset_loader` crate provides a derive macro to declaratively define asset collections that load during a state transition.

```toml
# Cargo.toml
[dependencies]
bevy_asset_loader = "0.22" # check crates.io for Bevy 0.18 compat
```

```rust
use bevy::prelude::*;
use bevy_asset_loader::prelude::*;

#[derive(AssetCollection, Resource)]
struct GameAssets {
    #[asset(path = "textures/player.png")]
    player: Handle<Image>,

    #[asset(path = "textures/enemy.png")]
    enemy: Handle<Image>,

    #[asset(path = "audio/bgm.ogg")]
    music: Handle<AudioSource>,

    // Load all .png files in a folder
    #[asset(path = "textures/tiles", collection(typed))]
    tiles: Vec<Handle<Image>>,
}

fn main() {
    App::new()
        .add_plugins(DefaultPlugins)
        .init_state::<GameState>()
        .add_loading_state(
            LoadingState::new(GameState::Loading)
                .continue_to_state(GameState::Playing)
                .load_collection::<GameAssets>()
        )
        .add_systems(OnEnter(GameState::Playing), setup_game)
        .run();
}

fn setup_game(mut commands: Commands, assets: Res<GameAssets>) {
    // All assets are guaranteed loaded here
    commands.spawn(Sprite {
        image: assets.player.clone(),
        ..default()
    });
}
```

**Why use this pattern?** It guarantees all assets are loaded before you enter gameplay, prevents "pop-in", and gives you a natural place to show a loading screen.

---

## Audio

Bevy includes a built-in audio system based on the `rodio` crate. It supports OGG Vorbis, WAV, MP3, and FLAC formats.

### Playing a Sound

Audio playback uses three core concepts:

- **`AudioSource`** — the asset type holding decoded audio data
- **`AudioPlayer`** — a component you spawn to start playback
- **`AudioSink`** — a component Bevy adds to the entity once playback begins, used to control volume, pause, and stop

```rust
fn setup_audio(mut commands: Commands, asset_server: Res<AssetServer>) {
    // Play background music
    commands.spawn((
        AudioPlayer::new(asset_server.load("audio/bgm.ogg")),
        PlaybackSettings::LOOP,
    ));

    // Play a one-shot sound effect
    commands.spawn(AudioPlayer::new(
        asset_server.load("audio/explosion.ogg"),
    ));
    // One-shot sounds use PlaybackSettings::ONCE (the default)
}
```

### Controlling Playback

Once audio starts playing, Bevy inserts an `AudioSink` component on the entity. Query for it to control playback at runtime:

```rust
fn control_music(
    music_query: Query<&AudioSink, With<BackgroundMusic>>,
    keyboard: Res<ButtonInput<KeyCode>>,
) {
    if let Ok(sink) = music_query.get_single() {
        // Pause / resume
        if keyboard.just_pressed(KeyCode::KeyP) {
            sink.toggle();
        }

        // Volume: 0.0 (silent) to 1.0 (full)
        if keyboard.just_pressed(KeyCode::ArrowUp) {
            sink.set_volume(sink.volume() + 0.1);
        }
        if keyboard.just_pressed(KeyCode::ArrowDown) {
            sink.set_volume((sink.volume() - 0.1).max(0.0));
        }
    }
}
```

### PlaybackSettings Reference

```rust
// Common configurations:
PlaybackSettings::ONCE       // Play once, then stop (default)
PlaybackSettings::LOOP       // Loop forever
PlaybackSettings::DESPAWN    // Play once, then despawn the entity
PlaybackSettings::REMOVE     // Play once, then remove audio components

// Custom settings
PlaybackSettings {
    mode: PlaybackMode::Loop,
    volume: Volume::new(0.5),   // half volume
    speed: 1.0,                 // playback speed multiplier
    paused: false,
    ..default()
}
```

### Spatial Audio

Bevy supports 3D spatial audio. Add a `SpatialListener` to the camera (or player) and a `Transform` to audio sources:

```rust
fn setup_spatial(mut commands: Commands, asset_server: Res<AssetServer>) {
    // Listener (usually on the camera or player)
    commands.spawn((
        Camera3d::default(),
        SpatialListener::new(5.0), // gap between virtual ears
    ));

    // Spatial sound source — positioned in world space
    commands.spawn((
        AudioPlayer::new(asset_server.load("audio/waterfall.ogg")),
        PlaybackSettings::LOOP,
        Transform::from_xyz(10.0, 0.0, 0.0),
    ));
}
```

---

## Common Patterns

### Loading Screen with Progress

```rust
fn loading_screen(
    asset_server: Res<AssetServer>,
    assets: Option<Res<GameAssets>>, // not yet inserted during loading
) {
    // bevy_asset_loader provides progress tracking:
    // use iyes_progress crate for a progress bar
}
```

### Sound Effect Pool

For frequently played sounds (footsteps, hits), pre-load handles and reuse them:

```rust
#[derive(Resource)]
struct SfxLibrary {
    hit: Handle<AudioSource>,
    footstep: Handle<AudioSource>,
    jump: Handle<AudioSource>,
}

fn play_sfx(mut commands: Commands, sfx: Res<SfxLibrary>) {
    commands.spawn((
        AudioPlayer::new(sfx.hit.clone()),
        PlaybackSettings::DESPAWN, // auto-cleanup after playing
    ));
}
```

### Hot Reloading in Development

Bevy's asset server supports hot reloading in debug builds. Edit an asset file and it updates live — no restart needed. This works for images, audio, scenes, and custom asset types.

```rust
// Enabled by default in dev builds when using AssetPlugin::default()
// Disable in release: AssetPlugin { mode: AssetMode::Processed, .. }
```

---

## Supported Audio Formats

| Format | Extension | Notes |
|--------|-----------|-------|
| OGG Vorbis | `.ogg` | Recommended — good quality, small files, wide support |
| WAV | `.wav` | Uncompressed — fast to load, large files |
| MP3 | `.mp3` | Supported but OGG preferred for games |
| FLAC | `.flac` | Lossless — large files, niche use |

**Recommendation:** Use `.ogg` for both music and sound effects. It offers the best balance of quality, file size, and decode performance for games.
