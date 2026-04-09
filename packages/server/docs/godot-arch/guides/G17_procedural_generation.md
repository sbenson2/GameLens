# G17 — Procedural Generation Patterns

> **Category:** Guide · **Engine:** Godot 4.4+ · **Language:** GDScript / C#  
> **Related:** [G7 Tilemap & Terrain](./G7_tilemap_and_terrain.md) · [G14 Navigation & Pathfinding](./G14_navigation_and_pathfinding.md) · [G5 Physics & Collision](./G5_physics_and_collision.md) · [G16 GDExtension](./G16_gdextension_native_code.md)

---

## What This Guide Covers

Procedural generation (PCG) creates game content algorithmically rather than by hand — dungeons, terrain, loot tables, enemy placement, and world layouts. Done well, it delivers infinite replayability. Done poorly, it produces bland sameness.

This guide covers the core PCG algorithms used in game development, implemented in Godot 4.4+ with typed GDScript and C# equivalents. Topics include noise-based terrain, dungeon generation (BSP, random walk, cellular automata), Wave Function Collapse (WFC), seeded randomization, chunk-based infinite worlds, and integration with Godot's TileMap and NavigationServer systems.

**This is NOT a math textbook.** Every algorithm is presented as a practical, copy-and-adapt pattern with tuning parameters.

---

## Table of Contents

1. [Seeded Randomization — The Foundation](#1-seeded-randomization--the-foundation)
2. [Noise-Based Terrain with FastNoiseLite](#2-noise-based-terrain-with-fastnoiselite)
3. [BSP (Binary Space Partitioning) Dungeons](#3-bsp-binary-space-partitioning-dungeons)
4. [Random Walk (Drunkard's Walk) Caves](#4-random-walk-drunkards-walk-caves)
5. [Cellular Automata Smoothing](#5-cellular-automata-smoothing)
6. [Wave Function Collapse (WFC)](#6-wave-function-collapse-wfc)
7. [Loot and Encounter Tables](#7-loot-and-encounter-tables)
8. [Chunk-Based Infinite Worlds](#8-chunk-based-infinite-worlds)
9. [Integration with TileMapLayer](#9-integration-with-tilemaplayer)
10. [Navigation Mesh Generation](#10-navigation-mesh-generation)
11. [Performance Considerations](#11-performance-considerations)
12. [Common Mistakes](#12-common-mistakes)
13. [Algorithm Selection Guide](#13-algorithm-selection-guide)

---

## 1. Seeded Randomization — The Foundation

Every PCG system must be deterministic. Given the same seed, the same world generates. This enables multiplayer sync, bug reproduction, and share codes.

### GDScript

```gdscript
class_name SeededRNG
extends RefCounted
## Wraps RandomNumberGenerator with convenience methods for PCG.

var rng: RandomNumberGenerator

func _init(seed_value: int = 0) -> void:
    rng = RandomNumberGenerator.new()
    if seed_value == 0:
        rng.randomize()  # True random
    else:
        rng.seed = seed_value

## Returns a random int in [min_val, max_val] (inclusive).
func rand_int(min_val: int, max_val: int) -> int:
    return rng.randi_range(min_val, max_val)

## Returns a random float in [min_val, max_val].
func rand_float(min_val: float, max_val: float) -> float:
    return rng.randf_range(min_val, max_val)

## Picks a random element from an array.
func pick(array: Array) -> Variant:
    return array[rng.randi_range(0, array.size() - 1)]

## Weighted random pick. weights[i] corresponds to items[i].
func weighted_pick(items: Array, weights: Array[float]) -> Variant:
    var total: float = 0.0
    for w: float in weights:
        total += w
    var roll: float = rng.randf() * total
    var cumulative: float = 0.0
    for i: int in range(items.size()):
        cumulative += weights[i]
        if roll <= cumulative:
            return items[i]
    return items[-1]

## Shuffles an array in place (Fisher-Yates).
func shuffle(array: Array) -> void:
    for i: int in range(array.size() - 1, 0, -1):
        var j: int = rng.randi_range(0, i)
        var temp: Variant = array[i]
        array[i] = array[j]
        array[j] = temp
```

### C#

```csharp
using Godot;

public partial class SeededRng : RefCounted
{
    private RandomNumberGenerator _rng = new();

    public SeededRng(ulong seed = 0)
    {
        if (seed == 0) _rng.Randomize();
        else _rng.Seed = seed;
    }

    public int RandInt(int min, int max) => _rng.RandiRange(min, max);
    public float RandFloat(float min, float max) => _rng.RandfRange(min, max);

    public T Pick<T>(T[] items) => items[_rng.RandiRange(0, items.Length - 1)];
}
```

**Critical rule**: Never use `randi()` or `randf()` without a dedicated `RandomNumberGenerator` instance. The global random state is shared and non-deterministic.

---

## 2. Noise-Based Terrain with FastNoiseLite

Godot 4.4+ includes `FastNoiseLite`, a high-performance noise generator supporting Simplex, Perlin, Cellular (Voronoi), and Value noise types.

### Height Map Terrain

```gdscript
class_name NoiseTerrainGenerator
extends Node
## Generates a 2D height map using layered noise.

@export var map_width: int = 128
@export var map_height: int = 128
@export var seed_value: int = 42

## Noise configuration
@export_group("Noise Settings")
@export var frequency: float = 0.02
@export var octaves: int = 4
@export var lacunarity: float = 2.0
@export var gain: float = 0.5

## Height thresholds for tile assignment
@export_group("Thresholds")
@export var deep_water: float = -0.3
@export var shallow_water: float = -0.1
@export var sand: float = 0.0
@export var grass: float = 0.3
@export var mountain: float = 0.6

var noise: FastNoiseLite
var height_map: Array[Array]  # 2D array of floats

func generate() -> Array[Array]:
    _setup_noise()
    height_map = []
    height_map.resize(map_height)

    for y: int in range(map_height):
        var row: Array[float] = []
        row.resize(map_width)
        for x: int in range(map_width):
            row[x] = noise.get_noise_2d(float(x), float(y))
        height_map[y] = row

    return height_map

func get_tile_type(height: float) -> StringName:
    if height < deep_water:
        return &"deep_water"
    elif height < shallow_water:
        return &"shallow_water"
    elif height < sand:
        return &"sand"
    elif height < grass:
        return &"grass"
    elif height < mountain:
        return &"mountain"
    else:
        return &"snow"

func _setup_noise() -> void:
    noise = FastNoiseLite.new()
    noise.seed = seed_value
    noise.noise_type = FastNoiseLite.TYPE_SIMPLEX_SMOOTH
    noise.frequency = frequency
    noise.fractal_octaves = octaves
    noise.fractal_lacunarity = lacunarity
    noise.fractal_gain = gain
```

### Biome Blending with Multiple Noise Layers

```gdscript
## Use separate noise instances for temperature and moisture.
## The combination determines the biome.
var temperature_noise: FastNoiseLite
var moisture_noise: FastNoiseLite

func get_biome(x: int, y: int) -> StringName:
    var temp: float = temperature_noise.get_noise_2d(float(x), float(y))
    var moist: float = moisture_noise.get_noise_2d(float(x), float(y))

    # Simple biome matrix
    if temp < -0.2:
        return &"tundra" if moist < 0.0 else &"snow_forest"
    elif temp < 0.2:
        return &"desert" if moist < -0.2 else &"grassland" if moist < 0.2 else &"forest"
    else:
        return &"savanna" if moist < 0.0 else &"tropical_forest"
```

### Noise Tuning Reference

| Parameter | Effect | Low Value | High Value |
|-----------|--------|-----------|------------|
| `frequency` | Feature size | Large, smooth features | Small, detailed features |
| `fractal_octaves` | Detail layers | Smooth, blobby | Detailed, organic |
| `fractal_lacunarity` | Frequency multiplier per octave | Similar scale layers | Rapidly varying detail |
| `fractal_gain` | Amplitude multiplier per octave | Subtle detail | Noisy, rough |
| `seed` | Deterministic variation | — | — |

---

## 3. BSP (Binary Space Partitioning) Dungeons

BSP splits a rectangle recursively into rooms, then connects them with corridors. This produces traditional roguelike dungeons with rectangular rooms.

```gdscript
class_name BSPDungeon
extends RefCounted
## Binary Space Partitioning dungeon generator.

const MIN_ROOM_SIZE: int = 6
const ROOM_PADDING: int = 2

var rng: SeededRNG
var rooms: Array[Rect2i] = []
var corridors: Array[Array] = []  # Array of Vector2i arrays

func generate(width: int, height: int, seed_value: int) -> Dictionary:
    rng = SeededRNG.new(seed_value)
    rooms.clear()
    corridors.clear()

    var root: Rect2i = Rect2i(0, 0, width, height)
    _split(root, 0)
    _connect_rooms()

    return {"rooms": rooms, "corridors": corridors}

func _split(rect: Rect2i, depth: int) -> void:
    # Stop splitting if too small or deep enough
    if depth > 5 or rect.size.x < MIN_ROOM_SIZE * 2 or rect.size.y < MIN_ROOM_SIZE * 2:
        _carve_room(rect)
        return

    # Decide split direction based on aspect ratio
    var split_horizontal: bool
    if rect.size.x > rect.size.y * 1.25:
        split_horizontal = false  # Split vertically (too wide)
    elif rect.size.y > rect.size.x * 1.25:
        split_horizontal = true   # Split horizontally (too tall)
    else:
        split_horizontal = rng.rand_int(0, 1) == 0

    if split_horizontal:
        var split_y: int = rng.rand_int(
            rect.position.y + MIN_ROOM_SIZE,
            rect.position.y + rect.size.y - MIN_ROOM_SIZE
        )
        _split(Rect2i(rect.position, Vector2i(rect.size.x, split_y - rect.position.y)), depth + 1)
        _split(Rect2i(Vector2i(rect.position.x, split_y), Vector2i(rect.size.x, rect.end.y - split_y)), depth + 1)
    else:
        var split_x: int = rng.rand_int(
            rect.position.x + MIN_ROOM_SIZE,
            rect.position.x + rect.size.x - MIN_ROOM_SIZE
        )
        _split(Rect2i(rect.position, Vector2i(split_x - rect.position.x, rect.size.y)), depth + 1)
        _split(Rect2i(Vector2i(split_x, rect.position.y), Vector2i(rect.end.x - split_x, rect.size.y)), depth + 1)

func _carve_room(partition: Rect2i) -> void:
    # Shrink the partition with padding to create the actual room
    var room := Rect2i(
        partition.position + Vector2i(ROOM_PADDING, ROOM_PADDING),
        partition.size - Vector2i(ROOM_PADDING * 2, ROOM_PADDING * 2)
    )
    if room.size.x >= MIN_ROOM_SIZE and room.size.y >= MIN_ROOM_SIZE:
        rooms.append(room)

func _connect_rooms() -> void:
    # Connect each room to the next with an L-shaped corridor
    for i: int in range(rooms.size() - 1):
        var center_a: Vector2i = rooms[i].position + rooms[i].size / 2
        var center_b: Vector2i = rooms[i + 1].position + rooms[i + 1].size / 2
        var corridor: Array[Vector2i] = []

        # Horizontal then vertical (or vice versa, randomly)
        if rng.rand_int(0, 1) == 0:
            _add_horizontal(corridor, center_a.x, center_b.x, center_a.y)
            _add_vertical(corridor, center_a.y, center_b.y, center_b.x)
        else:
            _add_vertical(corridor, center_a.y, center_b.y, center_a.x)
            _add_horizontal(corridor, center_a.x, center_b.x, center_b.y)

        corridors.append(corridor)

func _add_horizontal(corridor: Array[Vector2i], x1: int, x2: int, y: int) -> void:
    for x: int in range(mini(x1, x2), maxi(x1, x2) + 1):
        corridor.append(Vector2i(x, y))

func _add_vertical(corridor: Array[Vector2i], y1: int, y2: int, x: int) -> void:
    for y: int in range(mini(y1, y2), maxi(y1, y2) + 1):
        corridor.append(Vector2i(x, y))
```

---

## 4. Random Walk (Drunkard's Walk) Caves

The drunkard's walk algorithm creates organic, cave-like spaces by randomly wandering and carving out floor tiles. Simple to implement, produces natural-looking results.

```gdscript
class_name DrunkardWalk
extends RefCounted
## Random-walk cave generator.

@export var walk_length: int = 5000
@export var map_size: Vector2i = Vector2i(80, 60)

var rng: SeededRNG
var floor_tiles: Dictionary = {}  # Vector2i → true

## Directions: up, down, left, right
const DIRECTIONS: Array[Vector2i] = [
    Vector2i.UP, Vector2i.DOWN, Vector2i.LEFT, Vector2i.RIGHT
]

func generate(seed_value: int) -> Dictionary:
    rng = SeededRNG.new(seed_value)
    floor_tiles.clear()

    var position: Vector2i = map_size / 2  # Start at center
    floor_tiles[position] = true

    for step: int in range(walk_length):
        var direction: Vector2i = rng.pick(DIRECTIONS)
        position += direction

        # Clamp to map bounds (with 1-tile border)
        position.x = clampi(position.x, 1, map_size.x - 2)
        position.y = clampi(position.y, 1, map_size.y - 2)
        floor_tiles[position] = true

    return floor_tiles

## Variant: multiple walkers from different starting points
func generate_multi_walker(seed_value: int, walker_count: int = 4) -> Dictionary:
    rng = SeededRNG.new(seed_value)
    floor_tiles.clear()

    for w: int in range(walker_count):
        var position: Vector2i = Vector2i(
            rng.rand_int(map_size.x / 4, map_size.x * 3 / 4),
            rng.rand_int(map_size.y / 4, map_size.y * 3 / 4)
        )
        var steps_per_walker: int = walk_length / walker_count

        for step: int in range(steps_per_walker):
            var direction: Vector2i = rng.pick(DIRECTIONS)
            position += direction
            position.x = clampi(position.x, 1, map_size.x - 2)
            position.y = clampi(position.y, 1, map_size.y - 2)
            floor_tiles[position] = true

    return floor_tiles
```

---

## 5. Cellular Automata Smoothing

Cellular automata smooth jagged cave outputs into organic shapes. Start with random noise, then repeatedly apply neighbor-count rules.

```gdscript
class_name CellularAutomata
extends RefCounted
## Cellular automata for cave smoothing.
## Classic 4-5 rule: a cell becomes wall if it has ≥5 wall neighbors
## (including itself), or if it has ≤1 wall neighbors.

var width: int
var height: int

func generate(w: int, h: int, fill_chance: float, iterations: int, seed_value: int) -> Array:
    width = w
    height = h
    var rng := RandomNumberGenerator.new()
    rng.seed = seed_value

    # Initialize with random fill
    var grid: Array = []
    grid.resize(height)
    for y: int in range(height):
        var row: Array[int] = []
        row.resize(width)
        for x: int in range(width):
            # Border cells are always walls
            if x == 0 or x == width - 1 or y == 0 or y == height - 1:
                row[x] = 1  # Wall
            else:
                row[x] = 1 if rng.randf() < fill_chance else 0
        grid[y] = row

    # Run automata iterations
    for i: int in range(iterations):
        grid = _step(grid)

    return grid

func _step(grid: Array) -> Array:
    var new_grid: Array = []
    new_grid.resize(height)

    for y: int in range(height):
        var row: Array[int] = []
        row.resize(width)
        for x: int in range(width):
            var wall_count: int = _count_wall_neighbors(grid, x, y)
            # 4-5 rule: become wall if ≥5 neighbors are walls
            row[x] = 1 if wall_count >= 5 else 0
        new_grid[y] = row

    return new_grid

func _count_wall_neighbors(grid: Array, cx: int, cy: int) -> int:
    var count: int = 0
    for dy: int in range(-1, 2):
        for dx: int in range(-1, 2):
            var nx: int = cx + dx
            var ny: int = cy + dy
            if nx < 0 or nx >= width or ny < 0 or ny >= height:
                count += 1  # Out-of-bounds counts as wall
            else:
                count += grid[ny][nx]
    return count
```

### Combining Drunkard's Walk + Cellular Automata

```gdscript
# 1. Generate raw cave with drunkard's walk
var walker := DrunkardWalk.new()
walker.walk_length = 8000
var floor_tiles: Dictionary = walker.generate(my_seed)

# 2. Convert to grid
var grid: Array = _dict_to_grid(floor_tiles, 80, 60)

# 3. Smooth with cellular automata
var ca := CellularAutomata.new()
for i: int in range(3):
    grid = ca._step(grid)

# Result: organic caves with smooth walls
```

---

## 6. Wave Function Collapse (WFC)

WFC generates complex patterns from a small set of tile rules. Each cell starts with all tiles possible, then collapses one-by-one, propagating constraints to neighbors. It excels at generating cities, interior layouts, and stylized terrain.

### Simplified 2D WFC

```gdscript
class_name SimpleWFC
extends RefCounted
## Simplified Wave Function Collapse for 2D tile grids.
## Each tile defines which tiles can be adjacent in each direction.

## Adjacency rules: tile_name → { "up": [...], "down": [...], "left": [...], "right": [...] }
var rules: Dictionary = {}
var grid_width: int
var grid_height: int
var cells: Array  # Array of Arrays (possible tile sets per cell)
var rng: SeededRNG

func setup(w: int, h: int, tile_rules: Dictionary, seed_value: int) -> void:
    grid_width = w
    grid_height = h
    rules = tile_rules
    rng = SeededRNG.new(seed_value)

    # Initialize: every cell can be any tile
    var all_tiles: Array = rules.keys()
    cells = []
    cells.resize(w * h)
    for i: int in range(cells.size()):
        cells[i] = all_tiles.duplicate()

func solve() -> Array[StringName]:
    while true:
        # Find cell with lowest entropy (fewest possibilities > 1)
        var min_idx: int = _find_min_entropy()
        if min_idx == -1:
            break  # All cells collapsed

        if cells[min_idx].is_empty():
            push_error("WFC contradiction at index %d" % min_idx)
            return []  # Contradiction — unsolvable with current rules

        # Collapse: pick one tile randomly
        var chosen: StringName = rng.pick(cells[min_idx])
        cells[min_idx] = [chosen]

        # Propagate constraints
        _propagate(min_idx)

    # Extract result
    var result: Array[StringName] = []
    result.resize(cells.size())
    for i: int in range(cells.size()):
        result[i] = cells[i][0] if cells[i].size() > 0 else &"error"
    return result

func _find_min_entropy() -> int:
    var min_entropy: int = 999
    var min_idx: int = -1
    for i: int in range(cells.size()):
        var size: int = cells[i].size()
        if size > 1 and size < min_entropy:
            min_entropy = size
            min_idx = i
    return min_idx

func _propagate(start_idx: int) -> void:
    var stack: Array[int] = [start_idx]

    while not stack.is_empty():
        var idx: int = stack.pop_back()
        var x: int = idx % grid_width
        var y: int = idx / grid_width
        var current_tiles: Array = cells[idx]

        # Check each neighbor
        var neighbors: Array[Dictionary] = [
            {"dx": 0, "dy": -1, "dir": "up", "opp": "down"},
            {"dx": 0, "dy": 1, "dir": "down", "opp": "up"},
            {"dx": -1, "dy": 0, "dir": "left", "opp": "right"},
            {"dx": 1, "dy": 0, "dir": "right", "opp": "left"},
        ]

        for n: Dictionary in neighbors:
            var nx: int = x + n["dx"]
            var ny: int = y + n["dy"]
            if nx < 0 or nx >= grid_width or ny < 0 or ny >= grid_height:
                continue

            var n_idx: int = ny * grid_width + nx
            var allowed: Array[StringName] = []

            # Collect all tiles allowed in direction from current possibilities
            for tile: StringName in current_tiles:
                if rules.has(tile) and rules[tile].has(n["dir"]):
                    for adj_tile: StringName in rules[tile][n["dir"]]:
                        if not allowed.has(adj_tile):
                            allowed.append(adj_tile)

            # Reduce neighbor's possibilities
            var old_size: int = cells[n_idx].size()
            cells[n_idx] = cells[n_idx].filter(func(t: StringName) -> bool: return t in allowed)

            # If we reduced possibilities, propagate from neighbor too
            if cells[n_idx].size() < old_size:
                stack.append(n_idx)
```

### Defining WFC Tile Rules

```gdscript
# Example: simple terrain tiles
var terrain_rules: Dictionary = {
    &"grass": {
        "up": [&"grass", &"forest", &"path"],
        "down": [&"grass", &"forest", &"path"],
        "left": [&"grass", &"forest", &"path"],
        "right": [&"grass", &"forest", &"path"],
    },
    &"water": {
        "up": [&"water", &"sand"],
        "down": [&"water", &"sand"],
        "left": [&"water", &"sand"],
        "right": [&"water", &"sand"],
    },
    &"sand": {
        "up": [&"sand", &"water", &"grass"],
        "down": [&"sand", &"water", &"grass"],
        "left": [&"sand", &"water", &"grass"],
        "right": [&"sand", &"water", &"grass"],
    },
    &"forest": {
        "up": [&"forest", &"grass"],
        "down": [&"forest", &"grass"],
        "left": [&"forest", &"grass"],
        "right": [&"forest", &"grass"],
    },
    &"path": {
        "up": [&"path", &"grass"],
        "down": [&"path", &"grass"],
        "left": [&"path", &"grass"],
        "right": [&"path", &"grass"],
    },
}

var wfc := SimpleWFC.new()
wfc.setup(20, 20, terrain_rules, 12345)
var result: Array[StringName] = wfc.solve()
```

---

## 7. Loot and Encounter Tables

### Weighted Loot Table

```gdscript
class_name LootTable
extends Resource
## Weighted loot table with rarity tiers.

@export var entries: Array[LootEntry] = []

func roll(rng: SeededRNG, count: int = 1) -> Array[StringName]:
    var results: Array[StringName] = []
    var items: Array = []
    var weights: Array[float] = []

    for entry: LootEntry in entries:
        items.append(entry.item_id)
        weights.append(entry.weight)

    for i: int in range(count):
        results.append(rng.weighted_pick(items, weights))

    return results

class LootEntry extends Resource:
    @export var item_id: StringName = &""
    @export var weight: float = 1.0
    @export_enum("Common", "Uncommon", "Rare", "Epic", "Legendary") var rarity: int = 0
```

### Encounter Scaling

```gdscript
## Scale encounter difficulty based on player progress.
func generate_encounter(floor_depth: int, rng: SeededRNG) -> Dictionary:
    var enemy_count: int = rng.rand_int(1, 2 + floor_depth / 3)
    var enemy_level: int = floor_depth + rng.rand_int(-1, 1)
    var has_elite: bool = rng.rand_float(0.0, 1.0) < (floor_depth * 0.05)

    return {
        "enemy_count": enemy_count,
        "enemy_level": clampi(enemy_level, 1, 99),
        "has_elite": has_elite,
    }
```

---

## 8. Chunk-Based Infinite Worlds

For infinite or very large worlds, generate terrain in chunks loaded around the player's position.

```gdscript
class_name ChunkManager
extends Node2D
## Manages infinite-world chunks around the player.

const CHUNK_SIZE: int = 16         # Tiles per chunk axis
const TILE_SIZE: int = 16          # Pixels per tile
const LOAD_RADIUS: int = 3         # Chunks around player to keep loaded
const UNLOAD_RADIUS: int = 5       # Distance to unload

var loaded_chunks: Dictionary = {} # Vector2i → ChunkData
var noise_gen: NoiseTerrainGenerator
var world_seed: int

func _ready() -> void:
    noise_gen = NoiseTerrainGenerator.new()
    world_seed = 42

func _process(_delta: float) -> void:
    var player_chunk: Vector2i = _world_to_chunk(get_viewport().get_camera_2d().global_position)
    _load_chunks_around(player_chunk)
    _unload_distant_chunks(player_chunk)

func _world_to_chunk(world_pos: Vector2) -> Vector2i:
    return Vector2i(
        floori(world_pos.x / (CHUNK_SIZE * TILE_SIZE)),
        floori(world_pos.y / (CHUNK_SIZE * TILE_SIZE))
    )

func _load_chunks_around(center: Vector2i) -> void:
    for dy: int in range(-LOAD_RADIUS, LOAD_RADIUS + 1):
        for dx: int in range(-LOAD_RADIUS, LOAD_RADIUS + 1):
            var chunk_coord: Vector2i = center + Vector2i(dx, dy)
            if not loaded_chunks.has(chunk_coord):
                _generate_chunk(chunk_coord)

func _generate_chunk(coord: Vector2i) -> void:
    # Use chunk coordinates as part of the seed for deterministic generation
    var chunk_seed: int = hash(Vector2i(coord.x ^ world_seed, coord.y ^ (world_seed >> 16)))
    var chunk := ChunkData.new()

    # Generate tiles using noise (coordinates are world-space)
    for ly: int in range(CHUNK_SIZE):
        for lx: int in range(CHUNK_SIZE):
            var world_x: int = coord.x * CHUNK_SIZE + lx
            var world_y: int = coord.y * CHUNK_SIZE + ly
            var height: float = noise_gen.noise.get_noise_2d(float(world_x), float(world_y))
            chunk.tiles[Vector2i(lx, ly)] = noise_gen.get_tile_type(height)

    loaded_chunks[coord] = chunk

func _unload_distant_chunks(center: Vector2i) -> void:
    var to_unload: Array[Vector2i] = []
    for coord: Vector2i in loaded_chunks:
        var dist: int = absi(coord.x - center.x) + absi(coord.y - center.y)
        if dist > UNLOAD_RADIUS:
            to_unload.append(coord)

    for coord: Vector2i in to_unload:
        loaded_chunks.erase(coord)

class ChunkData extends RefCounted:
    var tiles: Dictionary = {}  # Vector2i → StringName
```

---

## 9. Integration with TileMapLayer

Godot 4.4+ uses `TileMapLayer` (replacing the old multi-layer `TileMap` node). Here's how to push PCG output into the tilemap:

```gdscript
class_name DungeonRenderer
extends Node2D
## Renders a generated dungeon onto TileMapLayer nodes.

@export var floor_layer: TileMapLayer
@export var wall_layer: TileMapLayer

## Atlas coordinates in your TileSet
const FLOOR_ATLAS: Vector2i = Vector2i(0, 0)
const WALL_ATLAS: Vector2i = Vector2i(1, 0)
const CORRIDOR_ATLAS: Vector2i = Vector2i(2, 0)
const SOURCE_ID: int = 0  # TileSet source index

func render_bsp(dungeon: Dictionary) -> void:
    floor_layer.clear()
    wall_layer.clear()

    # Fill everything with walls first
    # (only fill the area we need)
    var bounds: Rect2i = _calculate_bounds(dungeon)
    for y: int in range(bounds.position.y - 1, bounds.end.y + 1):
        for x: int in range(bounds.position.x - 1, bounds.end.x + 1):
            wall_layer.set_cell(Vector2i(x, y), SOURCE_ID, WALL_ATLAS)

    # Carve rooms
    for room: Rect2i in dungeon["rooms"]:
        for y: int in range(room.position.y, room.end.y):
            for x: int in range(room.position.x, room.end.x):
                wall_layer.erase_cell(Vector2i(x, y))
                floor_layer.set_cell(Vector2i(x, y), SOURCE_ID, FLOOR_ATLAS)

    # Carve corridors
    for corridor: Array in dungeon["corridors"]:
        for cell: Vector2i in corridor:
            wall_layer.erase_cell(cell)
            floor_layer.set_cell(cell, SOURCE_ID, CORRIDOR_ATLAS)

func _calculate_bounds(dungeon: Dictionary) -> Rect2i:
    var min_pos: Vector2i = Vector2i(999999, 999999)
    var max_pos: Vector2i = Vector2i(-999999, -999999)
    for room: Rect2i in dungeon["rooms"]:
        min_pos = min_pos.min(room.position)
        max_pos = max_pos.max(room.end)
    return Rect2i(min_pos, max_pos - min_pos)
```

---

## 10. Navigation Mesh Generation

After generating a dungeon, bake a navigation mesh so AI agents can pathfind through it. See [G14 Navigation & Pathfinding](./G14_navigation_and_pathfinding.md) for full navigation details.

```gdscript
## After rendering tiles, bake the navigation region.
@export var nav_region: NavigationRegion2D

func bake_navigation() -> void:
    # NavigationRegion2D with a NavigationPolygon resource
    # The polygon source geometry is parsed from the TileMapLayer's
    # navigation layers (configured in the TileSet editor).
    var nav_poly: NavigationPolygon = nav_region.navigation_polygon
    nav_poly.clear()

    # Parse geometry from TileMapLayers that have navigation polygons defined
    NavigationServer2D.parse_source_geometry_data(
        nav_poly,
        NavigationMeshSourceGeometryData2D.new(),
        nav_region
    )

    # Bake asynchronously (won't freeze the game)
    NavigationServer2D.bake_from_source_geometry_data_async(
        nav_poly,
        NavigationMeshSourceGeometryData2D.new()
    )

    await NavigationServer2D.navigation_mesh_changed
    print("Navigation mesh baked with %d polygons" % nav_poly.get_polygon_count())
```

---

## 11. Performance Considerations

| Technique | Map Size Limit (GDScript) | Optimization Path |
|-----------|--------------------------|-------------------|
| Noise terrain | ~512×512 smooth | Use `Image` + shader for larger |
| BSP dungeon | ~200×200 fast | Rarely a bottleneck |
| Drunkard's walk | ~100×100 per walker | Multiple short walkers > one long walker |
| Cellular automata | ~256×256 per step | Move to C# or GDExtension for 1024+ |
| WFC | ~50×50 per solve | Constraint propagation is O(n²) worst case |
| Chunk loading | Infinite | Generate off main thread |

### Threading Large Generations

```gdscript
## Generate a dungeon off the main thread to avoid frame hitches.
func generate_async(seed_value: int) -> void:
    var task_id: int = WorkerThreadPool.add_task(
        func() -> void:
            var bsp := BSPDungeon.new()
            var result: Dictionary = bsp.generate(100, 80, seed_value)
            # Must use call_deferred to touch the scene tree
            call_deferred("_on_generation_complete", result)
    )

func _on_generation_complete(dungeon: Dictionary) -> void:
    render_bsp(dungeon)
    bake_navigation()
```

---

## 12. Common Mistakes

### Using Global Random State
`randi()` and `randf()` use a shared global RNG. Two systems calling these will interfere with each other's sequences. Always use a dedicated `RandomNumberGenerator` instance per system.

### Not Validating Connectivity
BSP and cellular automata can produce disconnected regions. After generation, flood-fill from the spawn point and discard or connect unreachable areas.

### Generating on the Main Thread
Any generation that takes >16ms will cause a visible frame hitch. Use `WorkerThreadPool` for anything larger than a small room.

### Forgetting Seed Persistence
If you want players to share worlds (e.g., "Seed: 12345"), save the seed in your save file. If you want runs to be unique, use `rng.randomize()` and store the generated seed.

### Over-Parameterizing
Exposing every tuning knob to designers leads to confusion. Start with presets ("cave", "dungeon", "overworld") and only expose the 2-3 parameters that matter most.

---

## 13. Algorithm Selection Guide

| Game Type | Recommended Algorithm | Why |
|-----------|----------------------|-----|
| Roguelike dungeon | BSP + cellular automata smoothing | Rectangular rooms with organic corridors |
| Cave explorer | Drunkard's walk + cellular automata | Organic, natural cave shapes |
| Overworld map | FastNoiseLite (multi-layer) | Smooth, biome-scale features |
| City / interior layout | Wave Function Collapse | Follows tile adjacency rules precisely |
| Infinite runner | Chunk-based noise | Seamless, deterministic, streamable |
| Card/loot game | Weighted tables | Simple, tunable, designer-friendly |
| Metroidvania | BSP + hand-placed prefab rooms | Structure with authored content |

### Decision Flowchart

```
Need PCG? → What kind?
├── Terrain / overworld → FastNoiseLite (Section 2)
├── Dungeon rooms → BSP (Section 3) or WFC (Section 6)
├── Organic caves → Drunkard's Walk + Cellular Automata (Sections 4-5)
├── Tile-rule patterns → WFC (Section 6)
├── Loot / encounters → Weighted tables (Section 7)
└── Infinite world → Chunk manager + any of the above (Section 8)
```
