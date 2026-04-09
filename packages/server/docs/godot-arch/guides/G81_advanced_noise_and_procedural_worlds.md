# G81 — Advanced Noise and Procedural World Generation

> **Category:** guide · **Engine:** Godot 4.x · **Related:** [G17 Procedural Generation](./G17_procedural_generation.md) · [G24 Terrain & Open World](./G24_terrain_and_open_world.md) · [G62 Procedural Mesh Generation](./G62_procedural_mesh_generation.md) · [G7 TileMap & Terrain](./G7_tilemap_and_terrain.md)

Godot ships `FastNoiseLite` — a built-in noise generator supporting Simplex, Perlin, Cellular (Worley), and Value noise with fractal layering. Combined with chunk-based loading and biome mapping, it's enough to build infinite worlds, cave systems, island generators, and terrain heightmaps without any addons. This guide goes deep on noise configuration, biome blending, chunk streaming, and practical recipes for 2D and 3D worlds.

---

## Table of Contents

1. [FastNoiseLite Overview](#1-fastnoiselite-overview)
2. [Noise Types and When to Use Each](#2-noise-types-and-when-to-use-each)
3. [Fractal Settings Explained](#3-fractal-settings-explained)
4. [Domain Warp for Organic Shapes](#4-domain-warp-for-organic-shapes)
5. [Biome Mapping with Multiple Noise Layers](#5-biome-mapping-with-multiple-noise-layers)
6. [2D TileMap World Generation](#6-2d-tilemap-world-generation)
7. [3D Heightmap Terrain](#7-3d-heightmap-terrain)
8. [Chunk-Based Infinite Worlds](#8-chunk-based-infinite-worlds)
9. [Cave and Dungeon Generation](#9-cave-and-dungeon-generation)
10. [Seeded Determinism](#10-seeded-determinism)
11. [Performance and Threading](#11-performance-and-threading)
12. [Common Mistakes](#12-common-mistakes)

---

## 1. FastNoiseLite Overview

`FastNoiseLite` is a `Resource` — you can create it in code or in the Inspector as an exported property. It wraps the [FastNoiseLite C library](https://github.com/Auburn/FastNoiseLite), giving you hardware-fast noise without GDExtension.

### GDScript — Basic setup

```gdscript
var noise := FastNoiseLite.new()
noise.noise_type = FastNoiseLite.TYPE_SIMPLEX_SMOOTH
noise.seed = 42
noise.frequency = 0.02  # Lower = larger features

# Sample a single point
var value: float = noise.get_noise_2d(x, y)  # Returns -1.0 to 1.0
```

### C#

```csharp
var noise = new FastNoiseLite();
noise.NoiseType = FastNoiseLite.NoiseTypeEnum.SimplexSmooth;
noise.Seed = 42;
noise.Frequency = 0.02f;

float value = noise.GetNoise2D(x, y); // Returns -1.0 to 1.0
```

### Key properties

| Property | Effect |
|----------|--------|
| `noise_type` | Algorithm: Simplex, SimplexSmooth, Perlin, Value, ValueCubic, Cellular |
| `seed` | Determines the entire noise field — same seed = same world |
| `frequency` | Scale of features. 0.01 = continent-scale, 0.1 = room-scale |
| `offset` | Shifts the noise sample space (useful for scrolling or chunk offsets) |

---

## 2. Noise Types and When to Use Each

| Type | Character | Best for |
|------|-----------|----------|
| **SimplexSmooth** | Smooth, organic gradients | Terrain heightmaps, temperature maps, cloud density |
| **Perlin** | Classic, slightly grid-aligned | Traditional terrain, backward compatibility |
| **Cellular** | Cell/Voronoi patterns | Biome boundaries, cracked earth, crystal caves, rivers |
| **Value** | Blocky, low-frequency | Retro terrain, chunky pixel art worlds |
| **ValueCubic** | Smoother Value noise | When you want Value but less aliasing |

**Recommendation:** Default to `SimplexSmooth` for most organic generation. Use `Cellular` for structure boundaries. Use `Value` only for intentionally blocky aesthetics.

---

## 3. Fractal Settings Explained

Fractal layering stacks multiple noise samples ("octaves") at different frequencies to add detail.

### GDScript

```gdscript
noise.fractal_type = FastNoiseLite.FRACTAL_FBM  # Fractal Brownian Motion
noise.fractal_octaves = 5      # Number of layers (more = more detail, slower)
noise.fractal_lacunarity = 2.0 # Frequency multiplier per octave
noise.fractal_gain = 0.5       # Amplitude multiplier per octave
```

### C#

```csharp
noise.FractalType = FastNoiseLite.FractalTypeEnum.Fbm;
noise.FractalOctaves = 5;
noise.FractalLacunarity = 2.0f;
noise.FractalGain = 0.5f;
```

### Fractal types

| Type | Behavior | Use case |
|------|----------|----------|
| `FBM` | Adds octaves together | General terrain, clouds |
| `RIDGED` | Absolute value creates ridges | Mountain ranges, river valleys |
| `PING_PONG` | Oscillating folds | Alien terrain, abstract patterns |

### Tuning guide

- **Octaves 3–4:** Fast, good for distant LOD or tile-based 2D.
- **Octaves 5–6:** Detailed terrain for 3D heightmaps.
- **Octaves 7+:** Diminishing returns. Profile before going higher.
- **Lacunarity 2.0** and **Gain 0.5** are the standard starting point.
- Lower gain = smoother. Higher gain = more high-frequency detail.

---

## 4. Domain Warp for Organic Shapes

Domain warp distorts the input coordinates before sampling, creating swirled, organic patterns — great for coastlines, cave walls, and biome boundaries.

### GDScript

```gdscript
noise.domain_warp_enabled = true
noise.domain_warp_type = FastNoiseLite.DOMAIN_WARP_SIMPLEX_REDUCED
noise.domain_warp_amplitude = 50.0  # How far coordinates are displaced
noise.domain_warp_frequency = 0.01

## To sample with warp applied:
## First warp the coordinate, then sample at the warped position.
var pos := Vector2(x, y)
# FastNoiseLite applies warp internally when you call get_noise_2d
var value: float = noise.get_noise_2d(pos.x, pos.y)
```

### C#

```csharp
noise.DomainWarpEnabled = true;
noise.DomainWarpType = FastNoiseLite.DomainWarpTypeEnum.SimplexReduced;
noise.DomainWarpAmplitude = 50.0f;
noise.DomainWarpFrequency = 0.01f;

float value = noise.GetNoise2D(x, y);
```

**Tip:** Domain warp amplitude controls "swirl intensity." Start at 30–80 for natural coastlines. Values above 200 create surreal, impossible landscapes.

---

## 5. Biome Mapping with Multiple Noise Layers

Real-world biomes depend on temperature and moisture. Use two independent noise generators to create a 2D lookup.

### GDScript

```gdscript
## BiomeMapper.gd
extends Node

enum Biome { OCEAN, BEACH, GRASSLAND, FOREST, DESERT, TUNDRA, MOUNTAIN }

var height_noise := FastNoiseLite.new()
var moisture_noise := FastNoiseLite.new()
var temperature_noise := FastNoiseLite.new()

func _ready() -> void:
    # Height — large features
    height_noise.noise_type = FastNoiseLite.TYPE_SIMPLEX_SMOOTH
    height_noise.seed = 1000
    height_noise.frequency = 0.008
    height_noise.fractal_octaves = 5

    # Moisture — medium features, different seed
    moisture_noise.noise_type = FastNoiseLite.TYPE_SIMPLEX_SMOOTH
    moisture_noise.seed = 2000
    moisture_noise.frequency = 0.012
    moisture_noise.fractal_octaves = 4

    # Temperature — very large features (climate zones)
    temperature_noise.noise_type = FastNoiseLite.TYPE_SIMPLEX_SMOOTH
    temperature_noise.seed = 3000
    temperature_noise.frequency = 0.004
    temperature_noise.fractal_octaves = 3

## Returns biome for a world-space coordinate.
func get_biome(world_x: float, world_y: float) -> Biome:
    var h := (height_noise.get_noise_2d(world_x, world_y) + 1.0) / 2.0   # 0–1
    var m := (moisture_noise.get_noise_2d(world_x, world_y) + 1.0) / 2.0
    var t := (temperature_noise.get_noise_2d(world_x, world_y) + 1.0) / 2.0

    # Height thresholds
    if h < 0.3:
        return Biome.OCEAN
    if h < 0.35:
        return Biome.BEACH

    # Temperature + moisture grid
    if h > 0.75:
        return Biome.MOUNTAIN
    if t < 0.3:
        return Biome.TUNDRA
    if m < 0.3:
        return Biome.DESERT
    if m > 0.6:
        return Biome.FOREST
    return Biome.GRASSLAND
```

### C#

```csharp
using Godot;

public partial class BiomeMapper : Node
{
    public enum Biome { Ocean, Beach, Grassland, Forest, Desert, Tundra, Mountain }

    private FastNoiseLite _heightNoise = new();
    private FastNoiseLite _moistureNoise = new();
    private FastNoiseLite _temperatureNoise = new();

    public override void _Ready()
    {
        _heightNoise.NoiseType = FastNoiseLite.NoiseTypeEnum.SimplexSmooth;
        _heightNoise.Seed = 1000;
        _heightNoise.Frequency = 0.008f;
        _heightNoise.FractalOctaves = 5;

        _moistureNoise.NoiseType = FastNoiseLite.NoiseTypeEnum.SimplexSmooth;
        _moistureNoise.Seed = 2000;
        _moistureNoise.Frequency = 0.012f;
        _moistureNoise.FractalOctaves = 4;

        _temperatureNoise.NoiseType = FastNoiseLite.NoiseTypeEnum.SimplexSmooth;
        _temperatureNoise.Seed = 3000;
        _temperatureNoise.Frequency = 0.004f;
        _temperatureNoise.FractalOctaves = 3;
    }

    public Biome GetBiome(float worldX, float worldY)
    {
        float h = (_heightNoise.GetNoise2D(worldX, worldY) + 1f) / 2f;
        float m = (_moistureNoise.GetNoise2D(worldX, worldY) + 1f) / 2f;
        float t = (_temperatureNoise.GetNoise2D(worldX, worldY) + 1f) / 2f;

        if (h < 0.3f) return Biome.Ocean;
        if (h < 0.35f) return Biome.Beach;
        if (h > 0.75f) return Biome.Mountain;
        if (t < 0.3f) return Biome.Tundra;
        if (m < 0.3f) return Biome.Desert;
        if (m > 0.6f) return Biome.Forest;
        return Biome.Grassland;
    }
}
```

---

## 6. 2D TileMap World Generation

Generate an infinite 2D world by filling TileMap cells from noise.

### GDScript

```gdscript
## WorldGenerator2D.gd — attach to a TileMapLayer node
extends TileMapLayer

const CHUNK_SIZE := 16  # Tiles per chunk side
const RENDER_DISTANCE := 3  # Chunks around the player

@export var height_noise: FastNoiseLite
@export var tile_size: int = 16

var _generated_chunks: Dictionary[Vector2i, bool] = {}

func update_chunks(player_pos: Vector2) -> void:
    var player_chunk := Vector2i(
        floori(player_pos.x / (CHUNK_SIZE * tile_size)),
        floori(player_pos.y / (CHUNK_SIZE * tile_size))
    )

    for cx in range(player_chunk.x - RENDER_DISTANCE, player_chunk.x + RENDER_DISTANCE + 1):
        for cy in range(player_chunk.y - RENDER_DISTANCE, player_chunk.y + RENDER_DISTANCE + 1):
            var chunk_key := Vector2i(cx, cy)
            if chunk_key in _generated_chunks:
                continue
            _generate_chunk(chunk_key)
            _generated_chunks[chunk_key] = true

func _generate_chunk(chunk: Vector2i) -> void:
    var origin := chunk * CHUNK_SIZE
    for lx in CHUNK_SIZE:
        for ly in CHUNK_SIZE:
            var tx := origin.x + lx
            var ty := origin.y + ly
            var h := (height_noise.get_noise_2d(float(tx), float(ty)) + 1.0) / 2.0
            var atlas_coords := _height_to_tile(h)
            set_cell(Vector2i(tx, ty), 0, atlas_coords)

func _height_to_tile(h: float) -> Vector2i:
    if h < 0.3:
        return Vector2i(0, 0)  # Water
    if h < 0.35:
        return Vector2i(1, 0)  # Sand
    if h < 0.6:
        return Vector2i(2, 0)  # Grass
    if h < 0.75:
        return Vector2i(3, 0)  # Forest
    return Vector2i(4, 0)      # Mountain
```

---

## 7. 3D Heightmap Terrain

Use noise to generate a mesh via `SurfaceTool` or `ArrayMesh`.

### GDScript

```gdscript
## TerrainChunk3D.gd
extends MeshInstance3D

const SIZE := 64       # Vertices per side
const SCALE := 1.0     # World units per vertex
const HEIGHT_SCALE := 20.0

func generate(noise: FastNoiseLite, chunk_offset: Vector2) -> void:
    var st := SurfaceTool.new()
    st.begin(Mesh.PRIMITIVE_TRIANGLES)

    # Generate vertices
    var heights: Array[Array] = []
    for z in SIZE:
        var row: Array[float] = []
        for x in SIZE:
            var world_x := chunk_offset.x + x * SCALE
            var world_z := chunk_offset.y + z * SCALE
            var h := noise.get_noise_2d(world_x, world_z) * HEIGHT_SCALE
            row.append(h)
        heights.append(row)

    # Build triangles
    for z in SIZE - 1:
        for x in SIZE - 1:
            var v00 := Vector3(x * SCALE, heights[z][x], z * SCALE)
            var v10 := Vector3((x + 1) * SCALE, heights[z][x + 1], z * SCALE)
            var v01 := Vector3(x * SCALE, heights[z + 1][x], (z + 1) * SCALE)
            var v11 := Vector3((x + 1) * SCALE, heights[z + 1][x + 1], (z + 1) * SCALE)

            # Triangle 1
            st.add_vertex(v00)
            st.add_vertex(v10)
            st.add_vertex(v01)

            # Triangle 2
            st.add_vertex(v10)
            st.add_vertex(v11)
            st.add_vertex(v01)

    st.generate_normals()
    mesh = st.commit()
```

### C#

```csharp
using Godot;

public partial class TerrainChunk3D : MeshInstance3D
{
    private const int Size = 64;
    private const float Scale = 1.0f;
    private const float HeightScale = 20.0f;

    public void Generate(FastNoiseLite noise, Vector2 chunkOffset)
    {
        var st = new SurfaceTool();
        st.Begin(Mesh.PrimitiveType.Triangles);

        float[,] heights = new float[Size, Size];
        for (int z = 0; z < Size; z++)
        {
            for (int x = 0; x < Size; x++)
            {
                float wx = chunkOffset.X + x * Scale;
                float wz = chunkOffset.Y + z * Scale;
                heights[z, x] = noise.GetNoise2D(wx, wz) * HeightScale;
            }
        }

        for (int z = 0; z < Size - 1; z++)
        {
            for (int x = 0; x < Size - 1; x++)
            {
                var v00 = new Vector3(x * Scale, heights[z, x], z * Scale);
                var v10 = new Vector3((x + 1) * Scale, heights[z, x + 1], z * Scale);
                var v01 = new Vector3(x * Scale, heights[z + 1, x], (z + 1) * Scale);
                var v11 = new Vector3((x + 1) * Scale, heights[z + 1, x + 1], (z + 1) * Scale);

                st.AddVertex(v00); st.AddVertex(v10); st.AddVertex(v01);
                st.AddVertex(v10); st.AddVertex(v11); st.AddVertex(v01);
            }
        }

        st.GenerateNormals();
        Mesh = st.Commit();
    }
}
```

---

## 8. Chunk-Based Infinite Worlds

The pattern: track which chunks are loaded, generate new ones as the player moves, and free distant ones.

### GDScript

```gdscript
## ChunkManager.gd
extends Node3D

const CHUNK_WORLD_SIZE := 64.0  # World units per chunk side
const LOAD_RADIUS := 4
const UNLOAD_RADIUS := 6

@export var noise: FastNoiseLite

var _loaded_chunks: Dictionary[Vector2i, MeshInstance3D] = {}

func _process(_delta: float) -> void:
    var player_pos := _get_player_xz()
    var player_chunk := Vector2i(
        floori(player_pos.x / CHUNK_WORLD_SIZE),
        floori(player_pos.y / CHUNK_WORLD_SIZE)
    )
    _load_nearby(player_chunk)
    _unload_distant(player_chunk)

func _load_nearby(center: Vector2i) -> void:
    for cx in range(center.x - LOAD_RADIUS, center.x + LOAD_RADIUS + 1):
        for cz in range(center.y - LOAD_RADIUS, center.y + LOAD_RADIUS + 1):
            var key := Vector2i(cx, cz)
            if key in _loaded_chunks:
                continue
            var chunk := TerrainChunk3D.new()
            chunk.position = Vector3(cx * CHUNK_WORLD_SIZE, 0.0, cz * CHUNK_WORLD_SIZE)
            chunk.generate(noise, Vector2(cx * CHUNK_WORLD_SIZE, cz * CHUNK_WORLD_SIZE))
            add_child(chunk)
            _loaded_chunks[key] = chunk

func _unload_distant(center: Vector2i) -> void:
    var to_remove: Array[Vector2i] = []
    for key in _loaded_chunks:
        if absi(key.x - center.x) > UNLOAD_RADIUS or absi(key.y - center.y) > UNLOAD_RADIUS:
            to_remove.append(key)
    for key in to_remove:
        _loaded_chunks[key].queue_free()
        _loaded_chunks.erase(key)

func _get_player_xz() -> Vector2:
    # Replace with your player reference
    var player := get_tree().get_first_node_in_group("player")
    if player:
        return Vector2(player.global_position.x, player.global_position.z)
    return Vector2.ZERO
```

**Threading:** For smoother loading, generate chunks on a `WorkerThreadPool` thread and add the mesh to the scene tree on the main thread. See [G34 Threading & Async](./G34_threading_and_async.md).

---

## 9. Cave and Dungeon Generation

Use 3D noise with a threshold to carve cave networks.

### GDScript

```gdscript
## CaveGenerator.gd — creates a voxel-style boolean grid
const CAVE_SIZE := Vector3i(128, 64, 128)
const THRESHOLD := 0.0  # Values above this = solid, below = air

var cave_noise := FastNoiseLite.new()

func _ready() -> void:
    cave_noise.noise_type = FastNoiseLite.TYPE_SIMPLEX_SMOOTH
    cave_noise.seed = randi()
    cave_noise.frequency = 0.05
    cave_noise.fractal_type = FastNoiseLite.FRACTAL_FBM
    cave_noise.fractal_octaves = 3

func is_solid(x: int, y: int, z: int) -> bool:
    var value := cave_noise.get_noise_3d(float(x), float(y), float(z))
    # Add vertical bias — caves more likely near surface, solid deeper
    var depth_bias := lerpf(-0.3, 0.3, float(y) / float(CAVE_SIZE.y))
    return (value + depth_bias) > THRESHOLD

func generate_cave_map() -> Array:
    var grid: Array = []
    for y in CAVE_SIZE.y:
        var layer: Array = []
        for z in CAVE_SIZE.z:
            var row: Array[bool] = []
            for x in CAVE_SIZE.x:
                row.append(is_solid(x, y, z))
            layer.append(row)
        grid.append(layer)
    return grid
```

### Marching-cubes or greedy meshing

Convert the boolean grid to a mesh using marching cubes (for smooth caves) or greedy meshing (for Minecraft-style). See [G62 Procedural Mesh Generation](./G62_procedural_mesh_generation.md) for meshing techniques.

---

## 10. Seeded Determinism

Noise is deterministic for a given seed — `get_noise_2d(x, y)` always returns the same value for the same seed and coordinates. This enables:

- **Reproducible worlds:** Players can share seeds.
- **Chunk-independent generation:** Any chunk can be generated in any order with the same result.
- **Multiplayer consistency:** All clients with the same seed generate identical terrain.

### Rules for determinism

1. Always set `seed` explicitly — `FastNoiseLite.new()` starts with seed 0.
2. Do **not** use `randf()` or `randi()` for world generation unless you control the `RandomNumberGenerator` seed separately.
3. If you layer multiple noise generators, give each a distinct seed (e.g., `base_seed + 1000`, `base_seed + 2000`).

### GDScript — Seedable world

```gdscript
var world_seed: int = 0

func setup_noise(base_seed: int) -> void:
    world_seed = base_seed
    height_noise.seed = base_seed
    moisture_noise.seed = base_seed + 1000
    temperature_noise.seed = base_seed + 2000
    cave_noise.seed = base_seed + 3000
```

---

## 11. Performance and Threading

| Scenario | Tip |
|----------|-----|
| Generating a 256×256 heightmap | ~2ms on modern hardware — fine on main thread |
| Generating 16 chunks per frame | Use `WorkerThreadPool.add_task()` — one chunk per task |
| Noise sampling in `_process()` | Cache results. Don't resample static terrain every frame |
| Very high octave count (7+) | Diminishing visual returns. Profile with the Godot Profiler |
| 3D noise for caves | 3D sampling is ~3× slower than 2D. Reduce resolution or use LOD |

### GDScript — Threaded chunk generation

```gdscript
func _generate_chunk_threaded(chunk_key: Vector2i) -> void:
    WorkerThreadPool.add_task(_generate_chunk_task.bind(chunk_key))

func _generate_chunk_task(chunk_key: Vector2i) -> void:
    var mesh_data := _build_chunk_mesh(chunk_key)  # Pure data, no scene tree access
    # Return to main thread to add to scene
    call_deferred("_add_chunk_to_scene", chunk_key, mesh_data)

func _add_chunk_to_scene(chunk_key: Vector2i, mesh_data: ArrayMesh) -> void:
    var instance := MeshInstance3D.new()
    instance.mesh = mesh_data
    instance.position = Vector3(
        chunk_key.x * CHUNK_WORLD_SIZE, 0.0, chunk_key.y * CHUNK_WORLD_SIZE
    )
    add_child(instance)
    _loaded_chunks[chunk_key] = instance
```

---

## 12. Common Mistakes

| Mistake | Why it's bad | Fix |
|---------|-------------|-----|
| Using raw noise values (-1 to 1) as tile indices | Negative values crash or produce wrong tiles | Remap to 0–1 with `(value + 1.0) / 2.0` |
| Same seed for all noise layers | Height, moisture, and temperature are identical | Offset seeds by a constant per layer |
| Generating all chunks at startup | Long load times, high memory | Stream chunks based on player position |
| Sampling far from origin (>10M units) | Float precision degrades, noise becomes blocky | Use chunk-relative coordinates, offset the noise origin |
| Frequency too high for tile resolution | Noise features smaller than one tile = visual noise | Match frequency to tile density: `frequency ≈ 1.0 / features_in_tiles` |
| Not caching noise results | Resampling the same coordinate in multiple systems | Generate once into a heightmap array, share across systems |
