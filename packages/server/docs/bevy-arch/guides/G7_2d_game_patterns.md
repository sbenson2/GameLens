# G7 — 2D Game Development Patterns

> **Category:** guide · **Engine:** Bevy 0.18 · **Related:** [E1 ECS Fundamentals](../architecture/E1_ecs_fundamentals.md) · [E2 Rendering & Cameras](../architecture/E2_rendering_cameras.md) · [G2 Physics (Avian)](G2_physics_avian.md) · [R2 Community Plugins](../reference/R2_community_plugins_ecosystem.md)

---

## Overview

Bevy is a general-purpose engine, but 2D games are one of its strongest use cases. This guide covers practical patterns for building 2D games in Bevy 0.18: sprite rendering, sprite sheets and animation, tilemaps, 2D cameras, pixel-perfect rendering, and common 2D project architecture.

---

## Sprites and Sprite Sheets

### Basic Sprite

```rust
use bevy::prelude::*;

fn spawn_player(mut commands: Commands, asset_server: Res<AssetServer>) {
    commands.spawn((
        Sprite::from_image(asset_server.load("player.png")),
        Transform::from_xyz(0.0, 0.0, 0.0),
        Player,
    ));
}
```

Bevy 0.18 uses the `Sprite` component directly. The old `SpriteBundle` pattern from pre-0.15 is gone — Required Components handle `Transform`, `Visibility`, etc. automatically.

### Sprite Sheet Animation

For sprite sheet animation, use `TextureAtlas` to define a grid layout and animate by cycling the atlas index:

```rust
use bevy::prelude::*;

#[derive(Component)]
struct AnimationConfig {
    first_frame: usize,
    last_frame: usize,
    fps: f32,
    timer: Timer,
}

impl AnimationConfig {
    fn new(first: usize, last: usize, fps: f32) -> Self {
        Self {
            first_frame: first,
            last_frame: last,
            fps,
            timer: Timer::from_seconds(1.0 / fps, TimerMode::Repeating),
        }
    }
}

fn spawn_animated_sprite(
    mut commands: Commands,
    asset_server: Res<AssetServer>,
    mut texture_atlas_layouts: ResMut<Assets<TextureAtlasLayout>>,
) {
    let texture = asset_server.load("characters/hero_spritesheet.png");

    // Define the grid: 6 columns, 4 rows, each frame is 32x32 pixels
    let layout = TextureAtlasLayout::from_grid(UVec2::splat(32), 6, 4, None, None);
    let layout_handle = texture_atlas_layouts.add(layout);

    commands.spawn((
        Sprite {
            image: texture,
            texture_atlas: Some(TextureAtlas {
                layout: layout_handle,
                index: 0,
            }),
            ..default()
        },
        AnimationConfig::new(0, 5, 10.0), // frames 0-5 at 10 FPS
        Player,
    ));
}

fn animate_sprites(time: Res<Time>, mut query: Query<(&mut AnimationConfig, &mut Sprite)>) {
    for (mut config, mut sprite) in &mut query {
        config.timer.tick(time.delta());

        if config.timer.just_finished() {
            if let Some(atlas) = &mut sprite.texture_atlas {
                atlas.index = if atlas.index >= config.last_frame {
                    config.first_frame
                } else {
                    atlas.index + 1
                };
            }
        }
    }
}
```

### Sprite Ordering (Z-Layers)

Bevy sorts 2D sprites by the `Transform`'s Z value. A common pattern uses constants for layer management:

```rust
mod z_layer {
    pub const BACKGROUND: f32 = 0.0;
    pub const TILEMAP: f32 = 1.0;
    pub const ITEMS: f32 = 10.0;
    pub const CHARACTERS: f32 = 20.0;
    pub const PROJECTILES: f32 = 25.0;
    pub const PARTICLES: f32 = 30.0;
    pub const UI_WORLD: f32 = 50.0;
}

fn spawn_item(mut commands: Commands, asset_server: Res<AssetServer>) {
    commands.spawn((
        Sprite::from_image(asset_server.load("coin.png")),
        Transform::from_xyz(100.0, 50.0, z_layer::ITEMS),
        Item,
    ));
}
```

For characters that walk up/down, you can dynamically set Z based on Y position to get depth sorting:

```rust
fn y_sort(mut query: Query<&mut Transform, With<YSorted>>) {
    for mut transform in &mut query {
        // Higher Y (further up screen) = lower Z (drawn behind)
        transform.translation.z = z_layer::CHARACTERS - transform.translation.y * 0.001;
    }
}
```

---

## Tilemaps

Bevy does not include built-in tilemap support. The ecosystem provides several excellent crates.

### bevy_ecs_tilemap

The most ECS-native tilemap crate — each tile is its own entity, enabling per-tile components and queries.

```toml
[dependencies]
bevy = "0.18"
bevy_ecs_tilemap = "0.18"  # Match Bevy version
```

```rust
use bevy::prelude::*;
use bevy_ecs_tilemap::prelude::*;

fn setup_tilemap(
    mut commands: Commands,
    asset_server: Res<AssetServer>,
) {
    let texture_handle = asset_server.load("tiles/terrain.png");

    let map_size = TilemapSize { x: 64, y: 64 };
    let tile_size = TilemapTileSize { x: 16.0, y: 16.0 };
    let grid_size = tile_size.into();

    let tilemap_entity = commands.spawn_empty().id();
    let mut tile_storage = TileStorage::empty(map_size);

    // Fill the map with grass tiles
    for x in 0..map_size.x {
        for y in 0..map_size.y {
            let tile_pos = TilePos { x, y };
            let tile_entity = commands
                .spawn(TileBundle {
                    position: tile_pos,
                    tilemap_id: TilemapId(tilemap_entity),
                    texture_index: TileTextureIndex(0), // grass tile index
                    ..default()
                })
                .id();
            tile_storage.set(&tile_pos, tile_entity);
        }
    }

    commands.entity(tilemap_entity).insert(TilemapBundle {
        grid_size,
        map_type: TilemapType::Square,
        size: map_size,
        storage: tile_storage,
        texture: TilemapTexture::Single(texture_handle),
        tile_size,
        transform: Transform::from_xyz(0.0, 0.0, z_layer::TILEMAP),
        ..default()
    });
}
```

### bevy_ecs_tiled (Tiled Map Editor Integration)

For level design with the Tiled editor:

```toml
[dependencies]
bevy_ecs_tiled = "0.6"  # Check latest for Bevy 0.18 compat
```

```rust
use bevy::prelude::*;
use bevy_ecs_tiled::prelude::*;

fn load_level(mut commands: Commands, asset_server: Res<AssetServer>) {
    commands.spawn(TiledMapBundle {
        tiled_map: asset_server.load("levels/level_01.tmx"),
        ..default()
    });
}
```

### LDtk Integration

For LDtk level editor workflows:

```toml
[dependencies]
bevy_ecs_ldtk = "0.11"  # Check latest for Bevy 0.18 compat
```

---

## 2D Camera Patterns

### Basic Camera with Smooth Follow

```rust
use bevy::prelude::*;

fn spawn_camera(mut commands: Commands) {
    commands.spawn((
        Camera2d,
        Transform::from_xyz(0.0, 0.0, 999.0),
        GameCamera,
    ));
}

fn camera_follow(
    time: Res<Time>,
    player: Query<&Transform, (With<Player>, Without<GameCamera>)>,
    mut camera: Query<&mut Transform, With<GameCamera>>,
) {
    let Ok(player_transform) = player.single() else { return };
    let Ok(mut camera_transform) = camera.single_mut() else { return };

    let target = player_transform.translation.truncate();
    let current = camera_transform.translation.truncate();

    // Smooth exponential follow
    let smoothing = 5.0;
    let new_pos = current.lerp(target, 1.0 - (-smoothing * time.delta_secs()).exp());

    camera_transform.translation.x = new_pos.x;
    camera_transform.translation.y = new_pos.y;
}
```

### Camera Bounds (Clamping to Level)

```rust
#[derive(Resource)]
struct LevelBounds {
    min: Vec2,
    max: Vec2,
}

fn clamp_camera(
    bounds: Res<LevelBounds>,
    mut camera: Query<(&mut Transform, &OrthographicProjection), With<GameCamera>>,
) {
    let Ok((mut transform, projection)) = camera.single_mut() else { return };

    let half_width = projection.area.width() / 2.0;
    let half_height = projection.area.height() / 2.0;

    transform.translation.x = transform.translation.x
        .clamp(bounds.min.x + half_width, bounds.max.x - half_width);
    transform.translation.y = transform.translation.y
        .clamp(bounds.min.y + half_height, bounds.max.y - half_height);
}
```

### Pixel-Perfect Rendering

For pixel art games, prevent sub-pixel rendering artifacts:

```rust
fn setup_pixel_camera(mut commands: Commands) {
    commands.spawn((
        Camera2d,
        // Use nearest-neighbor sampling globally for crisp pixels
        Msaa::Off,
    ));
}

// In your asset loading, set image sampler to nearest:
fn configure_default_sampler(mut images: ResMut<Assets<Image>>) {
    // Or configure per-image via ImageSamplerDescriptor::nearest()
}
```

For integer scaling, consider the `bevy_pixel_camera` crate or manually set the `OrthographicProjection` scale to integer multiples.

---

## Common 2D Game Architecture

### Plugin-Per-Feature Pattern

```rust
// main.rs
fn main() {
    App::new()
        .add_plugins(DefaultPlugins.set(ImagePlugin::default_nearest())) // Pixel art!
        .add_plugins((
            PlayerPlugin,
            EnemyPlugin,
            TilemapPlugin,
            CameraPlugin,
            CombatPlugin,
            UiPlugin,
        ))
        .run();
}

// player.rs
pub struct PlayerPlugin;

impl Plugin for PlayerPlugin {
    fn build(&self, app: &mut App) {
        app
            .add_systems(OnEnter(GameState::Playing), spawn_player)
            .add_systems(Update, (
                player_movement,
                animate_sprites,
                y_sort,
            ).run_if(in_state(GameState::Playing)));
    }
}
```

### State Machine for Game Flow

```rust
#[derive(States, Default, Debug, Clone, PartialEq, Eq, Hash)]
enum GameState {
    #[default]
    MainMenu,
    Loading,
    Playing,
    Paused,
    GameOver,
}

// Cleanup entities when leaving a state
#[derive(Component)]
struct CleanupOnExit(GameState);

fn cleanup_system(
    mut commands: Commands,
    query: Query<(Entity, &CleanupOnExit)>,
    state: Res<State<GameState>>,
) {
    for (entity, cleanup) in &query {
        if cleanup.0 == **state {
            commands.entity(entity).despawn_recursive();
        }
    }
}
```

### 2D Collision (Without Full Physics)

For simple 2D games that don't need a physics engine, use AABB checks:

```rust
#[derive(Component)]
struct Collider {
    half_size: Vec2,
}

fn check_collisions(
    players: Query<(&Transform, &Collider), With<Player>>,
    items: Query<(Entity, &Transform, &Collider), With<Collectible>>,
    mut commands: Commands,
) {
    for (player_tf, player_col) in &players {
        for (item_entity, item_tf, item_col) in &items {
            let distance = (player_tf.translation.truncate() - item_tf.translation.truncate()).abs();
            let overlap = player_col.half_size + item_col.half_size;

            if distance.x < overlap.x && distance.y < overlap.y {
                commands.entity(item_entity).despawn();
                // Trigger collection event, play sound, etc.
            }
        }
    }
}
```

For more complex physics, see [G2 Physics (Avian)](G2_physics_avian.md) — `avian2d` provides full 2D rigid body simulation.

---

## Cargo Dependencies

Minimal 2D game setup:

```toml
[dependencies]
bevy = "0.18"

# Optional — pick what you need:
# bevy_ecs_tilemap = "0.18"       # Tilemaps
# bevy_ecs_ldtk = "0.11"          # LDtk level editor
# bevy_ecs_tiled = "0.6"          # Tiled editor
# avian2d = "0.3"                 # 2D physics
# leafwing-input-manager = "0.17" # Action-based input
# bevy_asset_loader = "0.22"      # Structured asset loading
# bevy_hanabi = "0.15"            # GPU particles
```

---

## Common Pitfalls

1. **Sprite flicker on sub-pixel positions:** Use `ImagePlugin::default_nearest()` in `DefaultPlugins` and round positions to integers for pixel art.
2. **Z-fighting between sprites:** Always explicitly set Z values. Avoid leaving sprites at `z = 0.0` — use the layer constants pattern.
3. **Large tilemaps and performance:** `bevy_ecs_tilemap` handles GPU batching efficiently, but avoid spawning tile entities you don't need to query. Use the `TileStorage` for tile lookups instead of ECS queries when possible.
4. **Animation timer precision:** Use `TimerMode::Repeating` and `timer.just_finished()` rather than manual delta accumulation to avoid frame-timing drift.
5. **Camera jitter:** Apply camera follow in `PostUpdate` or use a fixed timestep to avoid visual jitter from movement/camera desync.

---

## Further Reading

- [E2 Rendering & Cameras](../architecture/E2_rendering_cameras.md) — Detailed rendering pipeline
- [G2 Physics (Avian)](G2_physics_avian.md) — 2D and 3D physics
- [G3 Assets & Audio](G3_assets_and_audio.md) — Loading textures, sounds
- [E3 Input & States](../architecture/E3_input_and_states.md) — Input handling and state machines
- [R2 Community Plugins](../reference/R2_community_plugins_ecosystem.md) — Full ecosystem overview
