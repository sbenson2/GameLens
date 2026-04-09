# G10 — Procedural Generation Patterns

> **Category:** guide · **Engine:** Bevy 0.18 · **Related:** [E1 ECS Fundamentals](../architecture/E1_ecs_fundamentals.md) · [G7 2D Game Patterns](G7_2d_game_patterns.md) · [E8 Performance Optimization](../architecture/E8_performance_optimization.md) · [R2 Community Plugins](../reference/R2_community_plugins_ecosystem.md) · [bevy-arch-rules](../bevy-arch-rules.md)

---

## Overview

Procedural generation (procgen) creates game content algorithmically — terrain, dungeons, item stats, enemy placement, whole worlds. In Bevy, procgen meshes well with ECS: you generate data in systems, spawn entities from that data, and let the renderer handle the rest.

This guide covers noise-based terrain, tilemap generation, Wave Function Collapse, chunk streaming, and Bevy-specific patterns for integrating procgen into your game loop. All examples target **Bevy 0.18**.

---

## Noise-Based Terrain

The `noise` crate provides Perlin, Simplex, Worley, and other noise functions. Layer multiple octaves to create natural-looking heightmaps.

### Cargo Dependencies

```toml
[dependencies]
bevy = "0.18"
noise = "0.9"          # Perlin, Simplex, Worley, etc.
# Optional alternatives:
# noisy_bevy = "0.9"   # Bevy-native noise (glam + WGSL integration)
# bracket-noise = "0.8" # Part of bracket-lib, roguelike-focused
```

### Heightmap Generation

```rust
use bevy::prelude::*;
use noise::{NoiseFn, Perlin, Fbm};

/// Marker component for generated terrain
#[derive(Component)]
struct TerrainChunk {
    chunk_x: i32,
    chunk_z: i32,
}

/// Configuration resource — tweak without recompiling
#[derive(Resource)]
struct TerrainConfig {
    seed: u32,
    chunk_size: u32,      // tiles per chunk edge
    tile_size: f32,       // world units per tile
    height_scale: f32,
    octaves: usize,
    frequency: f64,
    lacunarity: f64,
    persistence: f64,
}

impl Default for TerrainConfig {
    fn default() -> Self {
        Self {
            seed: 42,
            chunk_size: 64,
            tile_size: 1.0,
            height_scale: 20.0,
            octaves: 6,
            frequency: 0.01,
            lacunarity: 2.0,    // Each octave doubles in frequency
            persistence: 0.5,   // Each octave halves in amplitude
        }
    }
}

fn generate_heightmap(config: &TerrainConfig, chunk_x: i32, chunk_z: i32) -> Vec<Vec<f32>> {
    // Fbm (Fractal Brownian Motion) layers multiple noise octaves automatically
    let fbm = Fbm::<Perlin>::new(config.seed)
        .set_octaves(config.octaves)
        .set_frequency(config.frequency)
        .set_lacunarity(config.lacunarity)
        .set_persistence(config.persistence);

    let size = config.chunk_size as usize;
    let offset_x = chunk_x as f64 * size as f64;
    let offset_z = chunk_z as f64 * size as f64;

    (0..size)
        .map(|z| {
            (0..size)
                .map(|x| {
                    let nx = offset_x + x as f64;
                    let nz = offset_z + z as f64;
                    // noise returns [-1, 1], remap to [0, 1] then scale
                    let raw = fbm.get([nx, nz]);
                    ((raw + 1.0) * 0.5 * config.height_scale as f64) as f32
                })
                .collect()
        })
        .collect()
}
```

### Spawning 3D Terrain Meshes

```rust
fn spawn_terrain_chunk(
    commands: &mut Commands,
    meshes: &mut ResMut<Assets<Mesh>>,
    materials: &mut ResMut<Assets<StandardMaterial>>,
    config: &TerrainConfig,
    chunk_x: i32,
    chunk_z: i32,
) {
    let heightmap = generate_heightmap(config, chunk_x, chunk_z);
    let size = config.chunk_size as usize;

    // Build a mesh from the heightmap
    let mut positions = Vec::new();
    let mut normals = Vec::new();
    let mut uvs = Vec::new();
    let mut indices = Vec::new();

    for z in 0..size {
        for x in 0..size {
            let px = x as f32 * config.tile_size;
            let py = heightmap[z][x];
            let pz = z as f32 * config.tile_size;
            positions.push([px, py, pz]);
            uvs.push([x as f32 / size as f32, z as f32 / size as f32]);

            // Simple normal estimation from neighbors
            let left = if x > 0 { heightmap[z][x - 1] } else { py };
            let right = if x < size - 1 { heightmap[z][x + 1] } else { py };
            let up = if z > 0 { heightmap[z - 1][x] } else { py };
            let down = if z < size - 1 { heightmap[z + 1][x] } else { py };
            let normal = Vec3::new(left - right, 2.0 * config.tile_size, up - down).normalize();
            normals.push(normal.to_array());
        }
    }

    // Triangle indices (two triangles per grid cell)
    for z in 0..(size - 1) as u32 {
        for x in 0..(size - 1) as u32 {
            let i = z * size as u32 + x;
            indices.extend_from_slice(&[i, i + size as u32, i + 1]);
            indices.extend_from_slice(&[i + 1, i + size as u32, i + size as u32 + 1]);
        }
    }

    let mut mesh = Mesh::new(
        bevy::render::mesh::PrimitiveTopology::TriangleList,
        bevy::render::render_asset::RenderAssetUsages::RENDER_WORLD,
    );
    mesh.insert_attribute(Mesh::ATTRIBUTE_POSITION, positions);
    mesh.insert_attribute(Mesh::ATTRIBUTE_NORMAL, normals);
    mesh.insert_attribute(Mesh::ATTRIBUTE_UV_0, uvs);
    mesh.insert_indices(bevy::render::mesh::Indices::U32(indices));

    let world_x = chunk_x as f32 * config.chunk_size as f32 * config.tile_size;
    let world_z = chunk_z as f32 * config.chunk_size as f32 * config.tile_size;

    commands.spawn((
        Mesh3d(meshes.add(mesh)),
        MeshMaterial3d(materials.add(StandardMaterial {
            base_color: Color::srgb(0.3, 0.6, 0.2),
            perceptual_roughness: 0.9,
            ..default()
        })),
        Transform::from_xyz(world_x, 0.0, world_z),
        TerrainChunk { chunk_x, chunk_z },
    ));
}
```

---

## 2D Tilemap Generation

For 2D games, combine noise with tile thresholds to generate biome maps. The `bevy_ecs_tilemap` crate provides efficient tilemap rendering.

```toml
[dependencies]
bevy = "0.18"
bevy_ecs_tilemap = "0.16"  # Check crates.io for 0.18 compatibility
noise = "0.9"
```

### Biome Assignment

```rust
#[derive(Clone, Copy, PartialEq)]
enum Biome {
    DeepWater,
    ShallowWater,
    Sand,
    Grass,
    Forest,
    Mountain,
    Snow,
}

fn height_to_biome(height: f32) -> Biome {
    match height {
        h if h < 0.15 => Biome::DeepWater,
        h if h < 0.25 => Biome::ShallowWater,
        h if h < 0.30 => Biome::Sand,
        h if h < 0.55 => Biome::Grass,
        h if h < 0.70 => Biome::Forest,
        h if h < 0.85 => Biome::Mountain,
        _ => Biome::Snow,
    }
}

fn biome_to_tile_index(biome: Biome) -> u32 {
    match biome {
        Biome::DeepWater   => 0,
        Biome::ShallowWater => 1,
        Biome::Sand         => 2,
        Biome::Grass        => 3,
        Biome::Forest       => 4,
        Biome::Mountain     => 5,
        Biome::Snow         => 6,
    }
}
```

### Multi-Layer Noise

Real-world terrain uses multiple noise layers combined:

```rust
use noise::{NoiseFn, Perlin};

fn generate_biome_map(seed: u32, width: usize, height: usize) -> Vec<Vec<Biome>> {
    // Layer 1: Continental shape (low frequency, high amplitude)
    let continental = Perlin::new(seed);
    // Layer 2: Local variation (medium frequency)
    let local = Perlin::new(seed.wrapping_add(1));
    // Layer 3: Moisture (different seed, affects biome selection)
    let moisture = Perlin::new(seed.wrapping_add(100));

    (0..height)
        .map(|y| {
            (0..width)
                .map(|x| {
                    let nx = x as f64 * 0.005;  // Very low freq
                    let ny = y as f64 * 0.005;

                    let c = (continental.get([nx, ny]) + 1.0) * 0.5;
                    let l = (local.get([nx * 4.0, ny * 4.0]) + 1.0) * 0.5 * 0.3;
                    let elevation = (c + l).clamp(0.0, 1.0) as f32;

                    height_to_biome(elevation)
                })
                .collect()
        })
        .collect()
}
```

---

## Wave Function Collapse (WFC)

WFC generates tile layouts that respect adjacency constraints — every placed tile is compatible with its neighbors. Great for dungeons, city blocks, and indoor spaces.

```toml
[dependencies]
bevy = "0.18"
bevy_procedural_tilemaps = "0.4"  # WFC for Bevy (check crates.io for 0.18 compat)
```

### Manual WFC Concepts

If you prefer implementing WFC yourself or using a lighter approach:

```rust
use std::collections::HashSet;

#[derive(Clone)]
struct WfcCell {
    /// Set of tile IDs still possible at this position
    possibilities: HashSet<u32>,
    /// Becomes Some when collapsed to a single tile
    collapsed: Option<u32>,
}

impl WfcCell {
    fn entropy(&self) -> usize {
        self.possibilities.len()
    }

    fn collapse(&mut self, rng: &mut impl rand::Rng) {
        // Pick a random tile from remaining possibilities
        let choices: Vec<u32> = self.possibilities.iter().copied().collect();
        let pick = choices[rng.gen_range(0..choices.len())];
        self.possibilities = HashSet::from([pick]);
        self.collapsed = Some(pick);
    }
}

/// Core WFC loop:
/// 1. Find the uncollapsed cell with lowest entropy
/// 2. Collapse it (pick a random valid tile)
/// 3. Propagate constraints to neighbors
/// 4. Repeat until all cells are collapsed (or contradiction)
fn wfc_step(grid: &mut Vec<Vec<WfcCell>>, adjacency_rules: &AdjacencyRules) -> bool {
    // Find minimum entropy cell
    let mut min_entropy = usize::MAX;
    let mut min_pos = None;

    for (y, row) in grid.iter().enumerate() {
        for (x, cell) in row.iter().enumerate() {
            if cell.collapsed.is_none() && cell.entropy() < min_entropy {
                min_entropy = cell.entropy();
                min_pos = Some((x, y));
            }
        }
    }

    match min_pos {
        None => true,  // All collapsed — done!
        Some((x, y)) => {
            if min_entropy == 0 {
                return false; // Contradiction — no valid tiles
            }
            grid[y][x].collapse(&mut rand::thread_rng());
            propagate(grid, x, y, adjacency_rules);
            false // Not done yet
        }
    }
}
```

---

## Chunk Streaming (Infinite Worlds)

For open-world games, generate chunks around the player and despawn distant ones.

```rust
use bevy::prelude::*;
use std::collections::HashSet;

#[derive(Resource, Default)]
struct LoadedChunks {
    chunks: HashSet<(i32, i32)>,
}

/// Runs every frame — checks if player moved to a new chunk region
fn stream_chunks(
    mut commands: Commands,
    mut meshes: ResMut<Assets<Mesh>>,
    mut materials: ResMut<Assets<StandardMaterial>>,
    config: Res<TerrainConfig>,
    mut loaded: ResMut<LoadedChunks>,
    player: Query<&Transform, With<Player>>,
    chunks: Query<(Entity, &TerrainChunk)>,
) {
    let Ok(player_tf) = player.get_single() else { return };

    let chunk_world_size = config.chunk_size as f32 * config.tile_size;
    let player_chunk_x = (player_tf.translation.x / chunk_world_size).floor() as i32;
    let player_chunk_z = (player_tf.translation.z / chunk_world_size).floor() as i32;

    let view_distance = 3; // Chunks in each direction

    // Determine which chunks should be loaded
    let mut desired = HashSet::new();
    for dz in -view_distance..=view_distance {
        for dx in -view_distance..=view_distance {
            desired.insert((player_chunk_x + dx, player_chunk_z + dz));
        }
    }

    // Spawn new chunks
    for &(cx, cz) in &desired {
        if !loaded.chunks.contains(&(cx, cz)) {
            spawn_terrain_chunk(
                &mut commands, &mut meshes, &mut materials,
                &config, cx, cz,
            );
            loaded.chunks.insert((cx, cz));
        }
    }

    // Despawn distant chunks
    for (entity, chunk) in chunks.iter() {
        let key = (chunk.chunk_x, chunk.chunk_z);
        if !desired.contains(&key) {
            commands.entity(entity).despawn();
            loaded.chunks.remove(&key);
        }
    }
}
```

### Async Generation

For heavy procgen (complex noise, WFC, pathfinding), avoid blocking the main thread:

```rust
use bevy::tasks::{AsyncComputeTaskPool, Task};

#[derive(Component)]
struct GeneratingChunk(Task<ChunkData>);

struct ChunkData {
    chunk_x: i32,
    chunk_z: i32,
    heightmap: Vec<Vec<f32>>,
}

fn start_chunk_generation(
    mut commands: Commands,
    config: Res<TerrainConfig>,
    // ... chunk detection logic
) {
    let pool = AsyncComputeTaskPool::get();
    let seed = config.seed;
    let chunk_size = config.chunk_size;

    // Spawn async task — runs on a thread pool, not the main thread
    let task = pool.spawn(async move {
        // This closure captures owned data only (Rust ownership enforced!)
        // You cannot accidentally reference main-world ECS data here.
        let config = TerrainConfig { seed, chunk_size, ..Default::default() };
        let heightmap = generate_heightmap(&config, 0, 0);
        ChunkData { chunk_x: 0, chunk_z: 0, heightmap }
    });

    commands.spawn(GeneratingChunk(task));
}

fn poll_chunk_tasks(
    mut commands: Commands,
    mut tasks: Query<(Entity, &mut GeneratingChunk)>,
    mut meshes: ResMut<Assets<Mesh>>,
    // ...
) {
    for (entity, mut gen) in tasks.iter_mut() {
        if let Some(data) = bevy::tasks::block_on(futures_lite::future::poll_once(&mut gen.0)) {
            // Task finished — spawn the mesh from the generated data
            // ... build mesh from data.heightmap ...
            commands.entity(entity).despawn();
        }
    }
}
```

**Rust ownership note:** The async task closure can only capture `Send + 'static` data. This means you can't accidentally pass `&World` or `Res<T>` into the task — the compiler prevents data races at compile time. Extract the values you need into owned variables before spawning the task.

---

## Seeded Randomness

Always use seeded RNG for reproducible worlds:

```rust
use bevy::prelude::*;
use rand::SeedableRng;
use rand_chacha::ChaCha8Rng;

#[derive(Resource)]
struct WorldRng(ChaCha8Rng);

fn setup_rng(mut commands: Commands) {
    // Same seed = same world, every time
    commands.insert_resource(WorldRng(ChaCha8Rng::seed_from_u64(12345)));
}
```

```toml
[dependencies]
rand = "0.8"
rand_chacha = "0.3"  # Deterministic across platforms
```

---

## Community Crates for Procgen

| Crate | Purpose | Bevy 0.18 compat |
|-------|---------|-----------------|
| `noise` | Perlin, Simplex, Worley, Fbm noise | Engine-agnostic (always works) |
| `noisy_bevy` | Bevy-native noise with glam + WGSL support | Check crates.io |
| `bevy_ecs_tilemap` | Efficient 2D tilemap rendering | Check crates.io |
| `bevy_procedural_tilemaps` | WFC tilemap generation | Updated for 0.18 |
| `bevy_generative` | Real-time procgen (maps, textures, terrain) | Check crates.io |
| `bracket-noise` | Roguelike-focused noise (part of bracket-lib) | Engine-agnostic |

**Always check crates.io for Bevy 0.18 compatibility** before adding a dependency. Community crates typically update within weeks of a Bevy release, but there can be gaps.

---

## Common Pitfalls

### Generating Too Much Per Frame
Never generate an entire world in a single system run. Use chunk streaming + async tasks to spread the work across frames.

### Floating Point Determinism
Noise is deterministic for the same seed, but floating-point math can produce slightly different results across platforms (x86 vs ARM). If cross-platform determinism matters (e.g., multiplayer shared worlds), use fixed-point arithmetic or validate with integration tests.

### Forgetting to Despawn
In chunk-streaming systems, failing to despawn distant chunks is a memory leak. Always track loaded chunks in a `HashSet` and clean up.

### Mesh Updates
If you need to modify terrain after generation (digging, explosions), you must update the mesh asset. Get the `Handle<Mesh>`, look it up in `Assets<Mesh>`, modify vertices, and call `mesh.compute_normals()` to recalculate lighting.
