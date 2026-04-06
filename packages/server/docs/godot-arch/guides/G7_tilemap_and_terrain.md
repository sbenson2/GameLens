# G7 — TileMap & Terrain Systems

> **Engine:** Godot 4.4+ · **Level:** Intermediate → Advanced
> **Typed GDScript throughout** — all examples use static typing for AI code generation safety.

A complete guide to building tile-based worlds in Godot using the modern `TileMapLayer` node (Godot 4.3+), `TileSet` resources, terrain auto-tiling, procedural generation, and runtime manipulation. Covers platformers, top-down RPGs, strategy games, and roguelikes.

---

## Table of Contents

1. [Architecture Overview](#1-architecture-overview)
2. [TileSet Resource Configuration](#2-tileset-resource-configuration)
3. [TileMapLayer Fundamentals](#3-tilemaplayer-fundamentals)
4. [Multi-Layer Architecture](#4-multi-layer-architecture)
5. [Terrain System & Auto-Tiling](#5-terrain-system--auto-tiling)
6. [Custom Data Layers](#6-custom-data-layers)
7. [Physics & Collision Tiles](#7-physics--collision-tiles)
8. [Navigation Tiles](#8-navigation-tiles)
9. [Runtime Tile Manipulation](#9-runtime-tile-manipulation)
10. [Procedural Generation](#10-procedural-generation)
11. [Chunk-Based Infinite Worlds](#11-chunk-based-infinite-worlds)
12. [Animated Tiles](#12-animated-tiles)
13. [Isometric & Hex Tilemaps](#13-isometric--hex-tilemaps)
14. [Y-Sorting & Depth](#14-y-sorting--depth)
15. [Fog of War on Tilemaps](#15-fog-of-war-on-tilemaps)
16. [Destructible Terrain](#16-destructible-terrain)
17. [Pathfinding Integration](#17-pathfinding-integration)
18. [Performance Optimization](#18-performance-optimization)
19. [Common Mistakes & Troubleshooting](#19-common-mistakes--troubleshooting)
20. [Tuning Reference Tables](#20-tuning-reference-tables)

---

## 1. Architecture Overview

### TileMap Pipeline

```
TileSet Resource (shared, .tres)
├── Atlas Sources (sprite sheets)
│   ├── Tiles (individual cells)
│   │   ├── Physics layers (collision shapes)
│   │   ├── Navigation layers (nav polygons)
│   │   ├── Custom data layers (metadata)
│   │   └── Animation frames
│   └── Terrain Sets (auto-tile rules)
│
└── TileMapLayer Nodes (per-layer instances)
    ├── Ground Layer (z_index: 0)
    ├── Walls Layer (z_index: 1)
    ├── Decoration Layer (z_index: 2)
    └── Collision Layer (invisible, physics only)
```

### Godot 4.3+ Migration: TileMap → TileMapLayer

Godot 4.3 deprecated the monolithic `TileMap` node in favor of individual `TileMapLayer` nodes. Each layer is now a separate node in the scene tree.

| Old (TileMap) | New (TileMapLayer) |
|---|---|
| `TileMap` with `layer` param | Individual `TileMapLayer` nodes |
| `set_cell(layer, coords, ...)` | `set_cell(coords, ...)` |
| `get_cell_source_id(layer, coords)` | `get_cell_source_id(coords)` |
| Layers managed by index | Layers managed as sibling nodes |
| Single collision body | Per-layer collision bodies |
| One node does everything | Composition via node tree |

**Why the change matters:**
- Each layer can have its own `z_index`, `modulate`, `visibility`, and `y_sort_enabled`
- Layers can be independently enabled/disabled (toggle decoration visibility)
- Better for composition — attach scripts to individual layers
- Per-layer physics bodies = cleaner collision setup
- Standard Godot pattern: use the node tree, not internal indices

> ⚠️ **Never use the deprecated `TileMap` node.** All code in this guide uses `TileMapLayer`.

---

## 2. TileSet Resource Configuration

### Creating a TileSet in Code

```gdscript
class_name TileSetBuilder
extends RefCounted
## Programmatic TileSet creation for procedural or modded content.

static func create_tileset(
    atlas_path: String,
    tile_size: Vector2i = Vector2i(16, 16)
) -> TileSet:
    var tileset := TileSet.new()
    tileset.tile_size = tile_size

    # Add atlas source from sprite sheet
    var atlas := TileSetAtlasSource.new()
    atlas.texture = load(atlas_path) as Texture2D
    atlas.texture_region_size = tile_size

    # Calculate grid dimensions
    var tex_size: Vector2i = Vector2i(atlas.texture.get_size())
    var cols: int = tex_size.x / tile_size.x
    var rows: int = tex_size.y / tile_size.y

    # Create tiles for each cell in the atlas
    for y: int in range(rows):
        for x: int in range(cols):
            var coords := Vector2i(x, y)
            atlas.create_tile(coords)

    var source_id: int = tileset.add_source(atlas)
    print("TileSet created: source_id=%d, %dx%d tiles" % [source_id, cols, rows])
    return tileset
```

### TileSet with Physics and Custom Data

```gdscript
static func create_game_tileset(atlas_path: String) -> TileSet:
    var tileset := TileSet.new()
    tileset.tile_size = Vector2i(16, 16)

    # --- Physics layers ---
    # Layer 0: World collision (walls, floors)
    tileset.add_physics_layer()
    tileset.set_physics_layer_collision_layer(0, 1)   # Collision layer 1
    tileset.set_physics_layer_collision_mask(0, 0)     # Static — no mask needed

    # Layer 1: Platforms (one-way)
    tileset.add_physics_layer()
    tileset.set_physics_layer_collision_layer(1, 4)    # Collision layer 3

    # --- Navigation layers ---
    tileset.add_navigation_layer()
    tileset.set_navigation_layer_layers(0, 1)

    # --- Custom data layers ---
    # 0: tile_type (enum as string)
    tileset.add_custom_data_layer()
    tileset.set_custom_data_layer_name(0, "tile_type")
    tileset.set_custom_data_layer_type(0, TYPE_STRING)

    # 1: movement_cost (for pathfinding)
    tileset.add_custom_data_layer()
    tileset.set_custom_data_layer_name(1, "movement_cost")
    tileset.set_custom_data_layer_type(1, TYPE_FLOAT)

    # 2: destructible (can be broken)
    tileset.add_custom_data_layer()
    tileset.set_custom_data_layer_name(2, "destructible")
    tileset.set_custom_data_layer_type(2, TYPE_BOOL)

    # 3: damage (hazard tiles)
    tileset.add_custom_data_layer()
    tileset.set_custom_data_layer_name(3, "damage")
    tileset.set_custom_data_layer_type(3, TYPE_INT)

    return tileset
```

### Atlas Source Organization

Recommended sprite sheet layout for a 16×16 tileset:

```
Row 0: Ground tiles (grass, dirt, stone, sand, water)
Row 1: Wall tiles (brick, wood, metal, ice)
Row 2: Platform tiles (wood platform, stone ledge, cloud)
Row 3: Decoration (flowers, mushrooms, signs, torches)
Row 4: Hazards (spikes, lava, poison, electric)
Row 5: Interactive (doors, chests, switches, breakable)
Row 6-7: Terrain auto-tile variants (16+ tiles per terrain)
```

> **Tip:** Keep terrain tiles in contiguous rectangular regions within the atlas — the Terrain editor expects them grouped together.

---

## 3. TileMapLayer Fundamentals

### Basic Setup

```gdscript
class_name GameLevel
extends Node2D
## Manages a tile-based game level with multiple layers.

@export var tile_set: TileSet

@onready var ground_layer: TileMapLayer = $GroundLayer
@onready var walls_layer: TileMapLayer = $WallsLayer
@onready var decoration_layer: TileMapLayer = $DecorationLayer

func _ready() -> void:
    # All layers share the same TileSet resource
    ground_layer.tile_set = tile_set
    walls_layer.tile_set = tile_set
    decoration_layer.tile_set = tile_set
```

### Placing and Reading Tiles

```gdscript
## Place a tile from atlas source 0, at atlas coords (2, 0), no alternative
func place_ground(cell: Vector2i) -> void:
    ground_layer.set_cell(cell, 0, Vector2i(2, 0))

## Read what tile is at a position
func get_tile_info(cell: Vector2i) -> Dictionary:
    var source_id: int = ground_layer.get_cell_source_id(cell)
    if source_id == -1:
        return {"empty": true}

    var atlas_coords: Vector2i = ground_layer.get_cell_atlas_coords(cell)
    var alt_id: int = ground_layer.get_cell_alternative_tile(cell)

    return {
        "source_id": source_id,
        "atlas_coords": atlas_coords,
        "alternative": alt_id,
        "empty": false
    }

## Erase a tile
func erase_tile(cell: Vector2i) -> void:
    ground_layer.erase_cell(cell)

## Convert world position to tile coordinates
func world_to_tile(world_pos: Vector2) -> Vector2i:
    return ground_layer.local_to_map(ground_layer.to_local(world_pos))

## Convert tile coordinates to world center position
func tile_to_world(cell: Vector2i) -> Vector2:
    return ground_layer.to_global(ground_layer.map_to_local(cell))
```

### Coordinate Conversion Pipeline

```
World Space (pixels)
    ↓ to_local()
Local Space (relative to TileMapLayer)
    ↓ local_to_map()
Map Space (tile coordinates, Vector2i)

Map Space (tile coordinates)
    ↓ map_to_local()
Local Space (center of tile)
    ↓ to_global()
World Space (pixels)
```

> **Critical:** `local_to_map()` and `map_to_local()` work in the TileMapLayer's **local** coordinate space. If the TileMapLayer has a transform (position, rotation, scale), you must convert to/from local space first.

### Iterating Over Tiles

```gdscript
## Get all non-empty cells in a layer
func get_all_ground_tiles() -> Array[Vector2i]:
    return ground_layer.get_used_cells()

## Get cells matching a specific tile
func find_tiles_by_atlas(
    layer: TileMapLayer,
    source_id: int,
    atlas_coords: Vector2i
) -> Array[Vector2i]:
    return layer.get_used_cells_by_id(source_id, atlas_coords)

## Get the bounding rectangle of used tiles
func get_level_bounds() -> Rect2i:
    return ground_layer.get_used_rect()

## Iterate with bounds check
func process_visible_tiles(viewport_rect: Rect2) -> void:
    var top_left: Vector2i = world_to_tile(viewport_rect.position)
    var bottom_right: Vector2i = world_to_tile(viewport_rect.end)

    # Add 1-tile margin for partially visible tiles
    top_left -= Vector2i.ONE
    bottom_right += Vector2i.ONE

    for y: int in range(top_left.y, bottom_right.y + 1):
        for x: int in range(top_left.x, bottom_right.x + 1):
            var cell := Vector2i(x, y)
            var source: int = ground_layer.get_cell_source_id(cell)
            if source != -1:
                _process_tile(cell, source)

func _process_tile(_cell: Vector2i, _source: int) -> void:
    pass  # Override in subclass
```

---

## 4. Multi-Layer Architecture

### Recommended Layer Setup

```
Level (Node2D)
├── BackgroundLayer (TileMapLayer)  — z_index: -2, parallax backdrop tiles
├── GroundLayer (TileMapLayer)      — z_index: 0, walkable terrain
├── WallsLayer (TileMapLayer)       — z_index: 1, solid obstacles
├── DecorationBehind (TileMapLayer) — z_index: -1, behind-player decorations
├── Entities (Node2D)               — z_index: 0, player + enemies + items
├── DecorationFront (TileMapLayer)  — z_index: 2, in-front decorations (vines, fences)
├── HazardLayer (TileMapLayer)      — z_index: 0, damage zones (spikes, lava)
└── MetaLayer (TileMapLayer)        — visible: false, spawn points + triggers
```

### Layer Manager

```gdscript
class_name TileLayerManager
extends Node2D
## Manages multiple TileMapLayers with convenience methods.

enum Layer {
    BACKGROUND,
    GROUND,
    WALLS,
    DECORATION_BEHIND,
    DECORATION_FRONT,
    HAZARD,
    META
}

## Map enum → TileMapLayer node names
const LAYER_NAMES: Dictionary = {
    Layer.BACKGROUND: "BackgroundLayer",
    Layer.GROUND: "GroundLayer",
    Layer.WALLS: "WallsLayer",
    Layer.DECORATION_BEHIND: "DecorationBehind",
    Layer.DECORATION_FRONT: "DecorationFront",
    Layer.HAZARD: "HazardLayer",
    Layer.META: "MetaLayer"
}

var _layers: Dictionary = {}  # Layer → TileMapLayer

func _ready() -> void:
    for layer_id: Layer in LAYER_NAMES:
        var node_name: String = LAYER_NAMES[layer_id]
        var node: TileMapLayer = get_node_or_null(node_name) as TileMapLayer
        if node:
            _layers[layer_id] = node
        else:
            push_warning("TileLayerManager: missing layer node '%s'" % node_name)

func get_layer(layer: Layer) -> TileMapLayer:
    return _layers.get(layer) as TileMapLayer

## Place a tile on a specific layer
func place_tile(
    layer: Layer,
    cell: Vector2i,
    source_id: int,
    atlas_coords: Vector2i,
    alternative: int = 0
) -> void:
    var tilemap: TileMapLayer = get_layer(layer)
    if tilemap:
        tilemap.set_cell(cell, source_id, atlas_coords, alternative)

## Check if any layer has a solid tile at this position
func is_solid(cell: Vector2i) -> bool:
    var walls: TileMapLayer = get_layer(Layer.WALLS)
    if walls and walls.get_cell_source_id(cell) != -1:
        return true
    var ground: TileMapLayer = get_layer(Layer.GROUND)
    if ground:
        var data: TileData = ground.get_cell_tile_data(cell)
        if data and data.get_custom_data("tile_type") == "solid":
            return true
    return false

## Get spawn points from the meta layer
func get_spawn_points(spawn_atlas_coords: Vector2i) -> Array[Vector2i]:
    var meta: TileMapLayer = get_layer(Layer.META)
    if not meta:
        return []
    return meta.get_used_cells_by_id(0, spawn_atlas_coords)

## Toggle decoration visibility (useful for debug or performance)
func set_decorations_visible(visible: bool) -> void:
    var behind: TileMapLayer = get_layer(Layer.DECORATION_BEHIND)
    var front: TileMapLayer = get_layer(Layer.DECORATION_FRONT)
    if behind:
        behind.visible = visible
    if front:
        front.visible = visible
```

### When to Use Multiple Layers vs One Layer

| Scenario | Recommendation |
|---|---|
| Ground + walls (different collision) | Separate layers |
| Grass + flowers (same collision) | Same layer, different tiles |
| Behind-player + in-front decorations | Separate layers (different z_index) |
| Invisible spawn/trigger markers | Separate meta layer (visible=false) |
| Hazard tiles that overlap ground | Separate layer (overlay) |
| Alternative ground textures | Same layer, alternative tiles |

**Rule of thumb:** Use separate layers when tiles need different **physics**, **z_index**, **visibility**, or **runtime behavior**. Use the same layer when tiles just differ visually.

---

## 5. Terrain System & Auto-Tiling

### How Terrain Works

Godot's terrain system automatically selects the correct tile variant based on neighboring tiles. Each tile's edges and corners are tagged with a terrain ID, and the engine matches the best tile for each cell.

```
Terrain Peering Bits (3×3 grid):
┌───────┬───────┬───────┐
│ TL    │  T    │  TR   │  Corner and edge bits
├───────┼───────┼───────┤  determine which tile
│  L    │ CENTER│  R    │  variant to use
├───────┼───────┼───────┤
│ BL    │  B    │  BR   │
└───────┴───────┴───────┘

Match modes:
- Match Corners and Sides (3×3 minimal) → 47 tiles for full coverage
- Match Corners (2×2) → 16 tiles
- Match Sides → 16 tiles
```

### Setting Up Terrain in Code

```gdscript
class_name TerrainSetup
extends RefCounted
## Programmatic terrain configuration.

static func setup_terrain(tileset: TileSet) -> void:
    # Create a terrain set (group of related terrains)
    tileset.add_terrain_set(0)
    tileset.set_terrain_set_mode(0, TileSet.TERRAIN_MODE_MATCH_CORNERS_AND_SIDES)

    # Terrain 0: Grass (green)
    tileset.add_terrain(0, 0)
    tileset.set_terrain_name(0, 0, "Grass")
    tileset.set_terrain_color(0, 0, Color.GREEN)

    # Terrain 1: Dirt (brown)
    tileset.add_terrain(0, 1)
    tileset.set_terrain_name(0, 1, "Dirt")
    tileset.set_terrain_color(0, 1, Color.SADDLE_BROWN)

    # Terrain 2: Water (blue)
    tileset.add_terrain(0, 2)
    tileset.set_terrain_name(0, 2, "Water")
    tileset.set_terrain_color(0, 2, Color.DODGER_BLUE)

    # Terrain 3: Stone (gray)
    tileset.add_terrain(0, 3)
    tileset.set_terrain_name(0, 3, "Stone")
    tileset.set_terrain_color(0, 3, Color.GRAY)
```

### Painting Terrain at Runtime

```gdscript
class_name TerrainPainter
extends Node2D
## Runtime terrain painting with auto-tile resolution.

@export var layer: TileMapLayer
@export var terrain_set: int = 0

## Paint a single cell with a terrain, then update neighbors
func paint_terrain_cell(cell: Vector2i, terrain_id: int) -> void:
    # set_cells_terrain_connect updates the target AND neighbors
    layer.set_cells_terrain_connect([cell], terrain_set, terrain_id)

## Paint a region of cells (more efficient than one-by-one)
func paint_terrain_region(cells: Array[Vector2i], terrain_id: int) -> void:
    layer.set_cells_terrain_connect(cells, terrain_set, terrain_id)

## Paint without affecting neighbors (useful for borders)
func paint_terrain_isolated(cells: Array[Vector2i], terrain_id: int) -> void:
    layer.set_cells_terrain_path(cells, terrain_set, terrain_id)

## Erase terrain and update neighbors
func erase_terrain_cell(cell: Vector2i) -> void:
    layer.set_cells_terrain_connect([cell], terrain_set, -1)

## Fill a rectangular region
func fill_terrain_rect(rect: Rect2i, terrain_id: int) -> void:
    var cells: Array[Vector2i] = []
    for y: int in range(rect.position.y, rect.end.y):
        for x: int in range(rect.position.x, rect.end.x):
            cells.append(Vector2i(x, y))
    layer.set_cells_terrain_connect(cells, terrain_set, terrain_id)
```

### Terrain Auto-Tile Lookup

```gdscript
## Get the terrain ID at a cell
func get_terrain_at(cell: Vector2i) -> int:
    var data: TileData = layer.get_cell_tile_data(cell)
    if not data:
        return -1
    return data.terrain

## Get the terrain set ID at a cell
func get_terrain_set_at(cell: Vector2i) -> int:
    var data: TileData = layer.get_cell_tile_data(cell)
    if not data:
        return -1
    return data.terrain_set

## Check if a cell has a specific terrain
func is_terrain(cell: Vector2i, terrain_id: int) -> bool:
    return get_terrain_at(cell) == terrain_id

## Get all cells with a specific terrain
func find_terrain_cells(terrain_id: int) -> Array[Vector2i]:
    var result: Array[Vector2i] = []
    for cell: Vector2i in layer.get_used_cells():
        if get_terrain_at(cell) == terrain_id:
            result.append(cell)
    return result
```

### Minimum Tile Counts for Full Terrain Coverage

| Mode | Minimum Tiles | Full Coverage | Notes |
|---|---|---|---|
| Match Sides | 5 | 16 | Simplest, square-ish transitions |
| Match Corners | 5 | 16 | Good for top-down RPGs |
| Match Corners+Sides | 13 | 47 | Best quality, most work |

> **Practical tip:** Start with 13 tiles for corners+sides. The engine gracefully handles missing variants by using the closest match. Add the remaining 34 tiles later for polished edges.

---

## 6. Custom Data Layers

### Defining Metadata

Custom data layers attach arbitrary data to individual tiles — movement cost, damage, sound effects, etc.

```gdscript
class_name TileMetadata
extends RefCounted
## Read tile metadata from custom data layers.

## Get movement cost for pathfinding
static func get_movement_cost(layer: TileMapLayer, cell: Vector2i) -> float:
    var data: TileData = layer.get_cell_tile_data(cell)
    if not data:
        return INF  # Impassable if no tile
    var cost: float = data.get_custom_data("movement_cost")
    return cost if cost > 0.0 else 1.0  # Default to 1.0

## Check if tile is destructible
static func is_destructible(layer: TileMapLayer, cell: Vector2i) -> bool:
    var data: TileData = layer.get_cell_tile_data(cell)
    if not data:
        return false
    return data.get_custom_data("destructible") as bool

## Get hazard damage (0 = safe)
static func get_hazard_damage(layer: TileMapLayer, cell: Vector2i) -> int:
    var data: TileData = layer.get_cell_tile_data(cell)
    if not data:
        return 0
    return data.get_custom_data("damage") as int

## Get tile type as string
static func get_tile_type(layer: TileMapLayer, cell: Vector2i) -> String:
    var data: TileData = layer.get_cell_tile_data(cell)
    if not data:
        return ""
    return data.get_custom_data("tile_type") as String
```

### Using Custom Data for Game Logic

```gdscript
class_name TileInteraction
extends Node2D
## Process tile interactions for the player character.

@export var ground_layer: TileMapLayer
@export var hazard_layer: TileMapLayer

var _damage_timer: float = 0.0
const HAZARD_TICK_INTERVAL: float = 0.5

## Called by the character controller each physics frame
func check_tile_effects(world_pos: Vector2, delta: float) -> Dictionary:
    var cell: Vector2i = ground_layer.local_to_map(
        ground_layer.to_local(world_pos)
    )
    var result: Dictionary = {
        "movement_multiplier": 1.0,
        "damage": 0,
        "sound": "",
        "particles": ""
    }

    # Ground effects
    var tile_type: String = TileMetadata.get_tile_type(ground_layer, cell)
    match tile_type:
        "ice":
            result["movement_multiplier"] = 1.5  # Faster but slippery
            result["sound"] = "footstep_ice"
        "mud":
            result["movement_multiplier"] = 0.5  # Slow down
            result["sound"] = "footstep_mud"
            result["particles"] = "mud_splash"
        "sand":
            result["movement_multiplier"] = 0.7
            result["sound"] = "footstep_sand"
        "water_shallow":
            result["movement_multiplier"] = 0.6
            result["sound"] = "footstep_water"
            result["particles"] = "water_ripple"

    # Hazard damage (ticking)
    var hazard_dmg: int = TileMetadata.get_hazard_damage(hazard_layer, cell)
    if hazard_dmg > 0:
        _damage_timer += delta
        if _damage_timer >= HAZARD_TICK_INTERVAL:
            _damage_timer -= HAZARD_TICK_INTERVAL
            result["damage"] = hazard_dmg
    else:
        _damage_timer = 0.0

    return result
```

---

## 7. Physics & Collision Tiles

### Physics Layer Setup

Each physics layer in the TileSet maps to collision shapes on tiles. Different layers can have different collision layers/masks.

```gdscript
class_name TilePhysicsSetup
extends RefCounted

## Standard physics layer configuration
static func configure_physics(tileset: TileSet) -> void:
    # Layer 0: World collision (walls, floors)
    # → Collision layer 1 (world)
    tileset.add_physics_layer()
    tileset.set_physics_layer_collision_layer(0, 1)
    tileset.set_physics_layer_collision_mask(0, 0)

    # Layer 1: One-way platforms
    # → Collision layer 4 (platforms)
    tileset.add_physics_layer()
    tileset.set_physics_layer_collision_layer(1, 4)
    tileset.set_physics_layer_collision_mask(1, 0)

    # Layer 2: Hazard areas (triggers, no solid collision)
    # → Collision layer 16 (triggers)
    tileset.add_physics_layer()
    tileset.set_physics_layer_collision_layer(2, 16)
    tileset.set_physics_layer_collision_mask(2, 0)
```

### One-Way Platforms

In the TileSet editor, enable **one_way_collision** on the physics layer for platform tiles. In code:

```gdscript
## Check one-way platform setup via TileData
func is_one_way_platform(layer: TileMapLayer, cell: Vector2i) -> bool:
    var data: TileData = layer.get_cell_tile_data(cell)
    if not data:
        return false
    # Physics layer 1 = platforms (from our setup)
    return data.get_collision_polygons_count(1) > 0
```

### Runtime Collision Queries Against Tiles

```gdscript
## Check if a world position is inside a solid tile
func is_world_pos_solid(world_pos: Vector2) -> bool:
    var cell: Vector2i = walls_layer.local_to_map(
        walls_layer.to_local(world_pos)
    )
    return walls_layer.get_cell_source_id(cell) != -1

## Raycast against tilemap collision
func tile_raycast(from: Vector2, to: Vector2) -> Dictionary:
    var space: PhysicsDirectSpaceState2D = get_world_2d().direct_space_state
    var query := PhysicsRayQueryParameters2D.create(from, to)
    query.collision_mask = 1  # World collision layer
    return space.intersect_ray(query)
```

---

## 8. Navigation Tiles

### Navigation Layer Setup

Navigation layers in the TileSet define which tiles are walkable and how the navigation mesh is built.

```gdscript
class_name TileNavSetup
extends RefCounted

static func configure_navigation(tileset: TileSet) -> void:
    # Navigation layer 0: Ground movement
    tileset.add_navigation_layer()
    tileset.set_navigation_layer_layers(0, 1)

    # Navigation layer 1: Flying movement (ignores walls)
    tileset.add_navigation_layer()
    tileset.set_navigation_layer_layers(1, 2)
```

### Building Navigation from Tiles

```gdscript
class_name TileNavBuilder
extends Node2D
## Builds navigation regions from tilemap data.

@export var ground_layer: TileMapLayer
@export var walls_layer: TileMapLayer

@onready var nav_region: NavigationRegion2D = $NavigationRegion2D

## Bake navigation mesh from tile data
func build_navigation() -> void:
    var nav_poly := NavigationPolygon.new()
    var tile_size: Vector2 = Vector2(ground_layer.tile_set.tile_size)

    # Collect walkable cells
    for cell: Vector2i in ground_layer.get_used_cells():
        # Skip cells that have walls on top
        if walls_layer.get_cell_source_id(cell) != -1:
            continue

        # Skip cells with high movement cost (impassable)
        if TileMetadata.get_movement_cost(ground_layer, cell) >= 100.0:
            continue

        # Add a polygon for this tile
        var local_pos: Vector2 = ground_layer.map_to_local(cell)
        var half: Vector2 = tile_size / 2.0
        var vertices := PackedVector2Array([
            local_pos + Vector2(-half.x, -half.y),
            local_pos + Vector2(half.x, -half.y),
            local_pos + Vector2(half.x, half.y),
            local_pos + Vector2(-half.x, half.y)
        ])
        nav_poly.add_outline(vertices)

    nav_poly.make_polygons_from_outlines()
    nav_region.navigation_polygon = nav_poly
    print("Navigation built: %d walkable tiles" % ground_layer.get_used_cells().size())
```

> **Note:** For most games, using TileMapLayer's built-in navigation polygons (set per tile in the TileSet editor) with `NavigationRegion2D` baking is simpler than manual polygon creation. The code above is for cases where you need custom walkability logic beyond what tile-level nav polygons provide.

---

## 9. Runtime Tile Manipulation

### Tile Modification System

```gdscript
class_name TileModifier
extends Node2D
## Handles runtime tile changes: digging, building, damage.

signal tile_changed(cell: Vector2i, layer_name: String)
signal tile_destroyed(cell: Vector2i, old_type: String)

@export var ground_layer: TileMapLayer
@export var walls_layer: TileMapLayer

## History for undo support
var _change_history: Array[Dictionary] = []
var _max_history: int = 100

## Replace a tile and record the change
func modify_tile(
    layer: TileMapLayer,
    cell: Vector2i,
    new_source: int,
    new_atlas: Vector2i,
    record_history: bool = true
) -> void:
    if record_history:
        _record_change(layer, cell)

    layer.set_cell(cell, new_source, new_atlas)
    tile_changed.emit(cell, layer.name)

## Destroy a tile (erase it)
func destroy_tile(layer: TileMapLayer, cell: Vector2i) -> void:
    var old_type: String = TileMetadata.get_tile_type(layer, cell)
    _record_change(layer, cell)
    layer.erase_cell(cell)
    tile_destroyed.emit(cell, old_type)

## Undo the last tile change
func undo_last_change() -> bool:
    if _change_history.is_empty():
        return false
    var change: Dictionary = _change_history.pop_back()
    var layer: TileMapLayer = change["layer"]
    var cell: Vector2i = change["cell"]
    if change["was_empty"]:
        layer.erase_cell(cell)
    else:
        layer.set_cell(
            cell,
            change["source_id"],
            change["atlas_coords"],
            change["alternative"]
        )
    return true

func _record_change(layer: TileMapLayer, cell: Vector2i) -> void:
    var source: int = layer.get_cell_source_id(cell)
    var change: Dictionary = {
        "layer": layer,
        "cell": cell,
        "was_empty": source == -1,
        "source_id": source,
        "atlas_coords": layer.get_cell_atlas_coords(cell),
        "alternative": layer.get_cell_alternative_tile(cell)
    }
    _change_history.append(change)
    if _change_history.size() > _max_history:
        _change_history.pop_front()
```

### Batch Tile Operations

```gdscript
class_name TileBatchOps
extends RefCounted
## Efficient bulk tile operations.

## Fill a rectangle with a single tile
static func fill_rect(
    layer: TileMapLayer,
    rect: Rect2i,
    source_id: int,
    atlas_coords: Vector2i
) -> void:
    for y: int in range(rect.position.y, rect.end.y):
        for x: int in range(rect.position.x, rect.end.x):
            layer.set_cell(Vector2i(x, y), source_id, atlas_coords)

## Clear a rectangular region
static func clear_rect(layer: TileMapLayer, rect: Rect2i) -> void:
    for y: int in range(rect.position.y, rect.end.y):
        for x: int in range(rect.position.x, rect.end.x):
            layer.erase_cell(Vector2i(x, y))

## Copy a region from one layer/position to another
static func copy_region(
    src_layer: TileMapLayer,
    src_rect: Rect2i,
    dst_layer: TileMapLayer,
    dst_offset: Vector2i
) -> void:
    for y: int in range(src_rect.size.y):
        for x: int in range(src_rect.size.x):
            var src_cell := Vector2i(
                src_rect.position.x + x,
                src_rect.position.y + y
            )
            var dst_cell: Vector2i = dst_offset + Vector2i(x, y)
            var source: int = src_layer.get_cell_source_id(src_cell)
            if source != -1:
                dst_layer.set_cell(
                    dst_cell,
                    source,
                    src_layer.get_cell_atlas_coords(src_cell),
                    src_layer.get_cell_alternative_tile(src_cell)
                )

## Replace all instances of one tile with another
static func replace_tile(
    layer: TileMapLayer,
    old_atlas: Vector2i,
    new_atlas: Vector2i,
    source_id: int = 0
) -> int:
    var cells: Array[Vector2i] = layer.get_used_cells_by_id(source_id, old_atlas)
    for cell: Vector2i in cells:
        var alt: int = layer.get_cell_alternative_tile(cell)
        layer.set_cell(cell, source_id, new_atlas, alt)
    return cells.size()
```

---

## 10. Procedural Generation

### BSP Dungeon Generator

```gdscript
class_name BSPDungeon
extends RefCounted
## Binary Space Partitioning dungeon generator.

const MIN_ROOM_SIZE: int = 5
const MAX_ROOM_SIZE: int = 12
const CORRIDOR_WIDTH: int = 2

var _rooms: Array[Rect2i] = []
var _corridors: Array[Array] = []  # Array of [Vector2i, Vector2i] pairs
var _rng: RandomNumberGenerator = RandomNumberGenerator.new()

func generate(
    width: int,
    height: int,
    max_depth: int = 5,
    seed_value: int = -1
) -> Dictionary:
    _rooms.clear()
    _corridors.clear()

    if seed_value >= 0:
        _rng.seed = seed_value
    else:
        _rng.randomize()

    # Start BSP partitioning
    var root := Rect2i(1, 1, width - 2, height - 2)
    _split(root, 0, max_depth)

    return {
        "rooms": _rooms.duplicate(),
        "corridors": _corridors.duplicate(),
        "width": width,
        "height": height
    }

func _split(area: Rect2i, depth: int, max_depth: int) -> void:
    if depth >= max_depth or (area.size.x <= MAX_ROOM_SIZE * 2 and area.size.y <= MAX_ROOM_SIZE * 2):
        # Leaf node — create a room
        var room_w: int = _rng.randi_range(MIN_ROOM_SIZE, mini(MAX_ROOM_SIZE, area.size.x - 2))
        var room_h: int = _rng.randi_range(MIN_ROOM_SIZE, mini(MAX_ROOM_SIZE, area.size.y - 2))
        var room_x: int = area.position.x + _rng.randi_range(1, area.size.x - room_w - 1)
        var room_y: int = area.position.y + _rng.randi_range(1, area.size.y - room_h - 1)
        _rooms.append(Rect2i(room_x, room_y, room_w, room_h))
        return

    # Decide split direction
    var split_h: bool
    if area.size.x > area.size.y * 1.25:
        split_h = false  # Split vertically (left/right)
    elif area.size.y > area.size.x * 1.25:
        split_h = true   # Split horizontally (top/bottom)
    else:
        split_h = _rng.randf() > 0.5

    if split_h:
        var split_y: int = area.position.y + _rng.randi_range(
            area.size.y / 3, area.size.y * 2 / 3
        )
        var top := Rect2i(area.position.x, area.position.y, area.size.x, split_y - area.position.y)
        var bottom := Rect2i(area.position.x, split_y, area.size.x, area.end.y - split_y)
        _split(top, depth + 1, max_depth)
        _split(bottom, depth + 1, max_depth)
    else:
        var split_x: int = area.position.x + _rng.randi_range(
            area.size.x / 3, area.size.x * 2 / 3
        )
        var left := Rect2i(area.position.x, area.position.y, split_x - area.position.x, area.size.y)
        var right := Rect2i(split_x, area.position.y, area.end.x - split_x, area.size.y)
        _split(left, depth + 1, max_depth)
        _split(right, depth + 1, max_depth)

    # Connect the two most recent rooms
    if _rooms.size() >= 2:
        _connect_rooms(_rooms[-2], _rooms[-1])

func _connect_rooms(a: Rect2i, b: Rect2i) -> void:
    var center_a := Vector2i(a.position.x + a.size.x / 2, a.position.y + a.size.y / 2)
    var center_b := Vector2i(b.position.x + b.size.x / 2, b.position.y + b.size.y / 2)
    _corridors.append([center_a, center_b])

## Apply the generated dungeon to TileMapLayers
func apply_to_tilemap(
    ground_layer: TileMapLayer,
    walls_layer: TileMapLayer,
    floor_atlas: Vector2i,
    wall_atlas: Vector2i,
    dungeon: Dictionary,
    source_id: int = 0
) -> void:
    var width: int = dungeon["width"]
    var height: int = dungeon["height"]

    # Fill everything with walls first
    TileBatchOps.fill_rect(
        walls_layer, Rect2i(0, 0, width, height), source_id, wall_atlas
    )

    # Carve rooms
    for room: Rect2i in dungeon["rooms"]:
        for y: int in range(room.position.y, room.end.y):
            for x: int in range(room.position.x, room.end.x):
                var cell := Vector2i(x, y)
                walls_layer.erase_cell(cell)
                ground_layer.set_cell(cell, source_id, floor_atlas)

    # Carve corridors (L-shaped)
    for corridor: Array in dungeon["corridors"]:
        var start: Vector2i = corridor[0]
        var end_pos: Vector2i = corridor[1]
        _carve_corridor(
            ground_layer, walls_layer, start, end_pos,
            floor_atlas, source_id
        )

func _carve_corridor(
    ground: TileMapLayer,
    walls: TileMapLayer,
    from: Vector2i,
    to: Vector2i,
    floor_atlas: Vector2i,
    source_id: int
) -> void:
    var current: Vector2i = from
    # Horizontal first
    var step_x: int = 1 if to.x > from.x else -1
    while current.x != to.x:
        _carve_cell(ground, walls, current, floor_atlas, source_id)
        current.x += step_x
    # Then vertical
    var step_y: int = 1 if to.y > from.y else -1
    while current.y != to.y:
        _carve_cell(ground, walls, current, floor_atlas, source_id)
        current.y += step_y
    _carve_cell(ground, walls, current, floor_atlas, source_id)

func _carve_cell(
    ground: TileMapLayer,
    walls: TileMapLayer,
    cell: Vector2i,
    floor_atlas: Vector2i,
    source_id: int
) -> void:
    # Carve a CORRIDOR_WIDTH-wide path
    for dy: int in range(CORRIDOR_WIDTH):
        for dx: int in range(CORRIDOR_WIDTH):
            var c := Vector2i(cell.x + dx, cell.y + dy)
            walls.erase_cell(c)
            ground.set_cell(c, source_id, floor_atlas)
```

### Cellular Automata Cave Generator

```gdscript
class_name CaveGenerator
extends RefCounted
## Generates organic cave systems using cellular automata.

var _grid: Array[Array] = []  # Array[Array[bool]] — true = wall
var _width: int
var _height: int
var _rng := RandomNumberGenerator.new()

func generate(
    width: int,
    height: int,
    fill_chance: float = 0.45,
    iterations: int = 5,
    seed_value: int = -1
) -> Array[Array]:
    _width = width
    _height = height

    if seed_value >= 0:
        _rng.seed = seed_value
    else:
        _rng.randomize()

    # Initialize random fill
    _grid.clear()
    for y: int in range(height):
        var row: Array[bool] = []
        row.resize(width)
        for x: int in range(width):
            # Border cells are always walls
            if x == 0 or y == 0 or x == width - 1 or y == height - 1:
                row[x] = true
            else:
                row[x] = _rng.randf() < fill_chance
        _grid.append(row)

    # Run cellular automata iterations
    for i: int in range(iterations):
        _step()

    # Remove small isolated regions
    _flood_fill_cleanup(50)  # Remove regions smaller than 50 cells

    return _grid

func _step() -> void:
    var new_grid: Array[Array] = []
    for y: int in range(_height):
        var row: Array[bool] = []
        row.resize(_width)
        for x: int in range(_width):
            var neighbors: int = _count_wall_neighbors(x, y)
            # B5678/S45678 rule — good for caves
            if _grid[y][x]:
                row[x] = neighbors >= 4  # Survive with 4+ wall neighbors
            else:
                row[x] = neighbors >= 5  # Born with 5+ wall neighbors
        new_grid.append(row)
    _grid = new_grid

func _count_wall_neighbors(cx: int, cy: int) -> int:
    var count: int = 0
    for dy: int in range(-1, 2):
        for dx: int in range(-1, 2):
            if dx == 0 and dy == 0:
                continue
            var nx: int = cx + dx
            var ny: int = cy + dy
            if nx < 0 or ny < 0 or nx >= _width or ny >= _height:
                count += 1  # Out of bounds counts as wall
            elif _grid[ny][nx]:
                count += 1
    return count

func _flood_fill_cleanup(min_region_size: int) -> void:
    var visited: Array[Array] = []
    for y: int in range(_height):
        var row: Array[bool] = []
        row.resize(_width)
        row.fill(false)
        visited.append(row)

    for y: int in range(_height):
        for x: int in range(_width):
            if not visited[y][x] and not _grid[y][x]:
                var region: Array[Vector2i] = _flood_fill(x, y, visited)
                if region.size() < min_region_size:
                    # Fill in small open regions
                    for cell: Vector2i in region:
                        _grid[cell.y][cell.x] = true

func _flood_fill(start_x: int, start_y: int, visited: Array[Array]) -> Array[Vector2i]:
    var region: Array[Vector2i] = []
    var stack: Array[Vector2i] = [Vector2i(start_x, start_y)]

    while not stack.is_empty():
        var cell: Vector2i = stack.pop_back()
        if cell.x < 0 or cell.y < 0 or cell.x >= _width or cell.y >= _height:
            continue
        if visited[cell.y][cell.x] or _grid[cell.y][cell.x]:
            continue
        visited[cell.y][cell.x] = true
        region.append(cell)
        stack.append(Vector2i(cell.x + 1, cell.y))
        stack.append(Vector2i(cell.x - 1, cell.y))
        stack.append(Vector2i(cell.x, cell.y + 1))
        stack.append(Vector2i(cell.x, cell.y - 1))

    return region

## Apply cave to tilemap
func apply_to_tilemap(
    ground: TileMapLayer,
    walls: TileMapLayer,
    floor_atlas: Vector2i,
    wall_atlas: Vector2i,
    source_id: int = 0
) -> void:
    for y: int in range(_height):
        for x: int in range(_width):
            var cell := Vector2i(x, y)
            if _grid[y][x]:
                walls.set_cell(cell, source_id, wall_atlas)
            else:
                ground.set_cell(cell, source_id, floor_atlas)
```

### Wave Function Collapse (Simplified)

```gdscript
class_name SimpleWFC
extends RefCounted
## Simplified Wave Function Collapse for constrained tile placement.
## Uses adjacency rules to generate valid tile arrangements.

## Adjacency rules: tile_id → { direction → [allowed_neighbor_ids] }
## Directions: 0=right, 1=down, 2=left, 3=up
var _rules: Dictionary = {}
var _tile_weights: Dictionary = {}  # tile_id → float weight
var _grid: Array[Array] = []  # Array[Array[Array[int]]] — possibilities per cell
var _width: int
var _height: int
var _rng := RandomNumberGenerator.new()

func add_rule(
    tile_id: int,
    direction: int,
    allowed_neighbors: Array[int]
) -> void:
    if tile_id not in _rules:
        _rules[tile_id] = {}
    _rules[tile_id][direction] = allowed_neighbors

func set_weight(tile_id: int, weight: float) -> void:
    _tile_weights[tile_id] = weight

func generate(width: int, height: int, seed_value: int = -1) -> Array[Array]:
    _width = width
    _height = height

    if seed_value >= 0:
        _rng.seed = seed_value
    else:
        _rng.randomize()

    # Initialize — every cell can be any tile
    var all_tiles: Array[int] = []
    for tile_id: int in _rules:
        all_tiles.append(tile_id)

    _grid.clear()
    for y: int in range(height):
        var row: Array[Array] = []
        for x: int in range(width):
            row.append(all_tiles.duplicate())
        _grid.append(row)

    # Collapse loop
    while true:
        var cell: Vector2i = _find_lowest_entropy()
        if cell == Vector2i(-1, -1):
            break  # All cells collapsed

        _collapse(cell)
        _propagate(cell)

    # Convert to result grid
    var result: Array[Array] = []
    for y: int in range(height):
        var row: Array[int] = []
        for x: int in range(width):
            var options: Array = _grid[y][x]
            row.append(options[0] if not options.is_empty() else -1)
        result.append(row)
    return result

func _find_lowest_entropy() -> Vector2i:
    var min_entropy: int = 999
    var candidates: Array[Vector2i] = []

    for y: int in range(_height):
        for x: int in range(_width):
            var count: int = _grid[y][x].size()
            if count <= 1:
                continue  # Already collapsed
            if count < min_entropy:
                min_entropy = count
                candidates = [Vector2i(x, y)]
            elif count == min_entropy:
                candidates.append(Vector2i(x, y))

    if candidates.is_empty():
        return Vector2i(-1, -1)
    return candidates[_rng.randi() % candidates.size()]

func _collapse(cell: Vector2i) -> void:
    var options: Array = _grid[cell.y][cell.x]
    if options.is_empty():
        return

    # Weighted random selection
    var total_weight: float = 0.0
    for tile_id: int in options:
        total_weight += _tile_weights.get(tile_id, 1.0)

    var roll: float = _rng.randf() * total_weight
    var cumulative: float = 0.0
    for tile_id: int in options:
        cumulative += _tile_weights.get(tile_id, 1.0)
        if roll <= cumulative:
            _grid[cell.y][cell.x] = [tile_id]
            return

    _grid[cell.y][cell.x] = [options[0]]

func _propagate(start: Vector2i) -> void:
    var stack: Array[Vector2i] = [start]
    var directions: Array[Vector2i] = [
        Vector2i(1, 0), Vector2i(0, 1),
        Vector2i(-1, 0), Vector2i(0, -1)
    ]

    while not stack.is_empty():
        var cell: Vector2i = stack.pop_back()
        var current_options: Array = _grid[cell.y][cell.x]

        for dir_idx: int in range(4):
            var dir: Vector2i = directions[dir_idx]
            var neighbor: Vector2i = cell + dir
            if neighbor.x < 0 or neighbor.y < 0:
                continue
            if neighbor.x >= _width or neighbor.y >= _height:
                continue

            var neighbor_options: Array = _grid[neighbor.y][neighbor.x]
            var allowed: Array[int] = []

            # Collect all tiles allowed by any current option
            for tile_id: int in current_options:
                if tile_id in _rules and dir_idx in _rules[tile_id]:
                    for allowed_id: int in _rules[tile_id][dir_idx]:
                        if allowed_id in neighbor_options and allowed_id not in allowed:
                            allowed.append(allowed_id)

            # If neighbor's options were reduced, propagate
            if allowed.size() < neighbor_options.size():
                _grid[neighbor.y][neighbor.x] = allowed
                if not allowed.is_empty():
                    stack.append(neighbor)
```

---

## 11. Chunk-Based Infinite Worlds

### Chunk Manager

```gdscript
class_name ChunkManager
extends Node2D
## Loads and unloads tile chunks around the camera for infinite worlds.

signal chunk_loaded(chunk_coords: Vector2i)
signal chunk_unloaded(chunk_coords: Vector2i)

@export var ground_layer: TileMapLayer
@export var walls_layer: TileMapLayer
@export var chunk_size: int = 32          ## Tiles per chunk side
@export var load_radius: int = 3          ## Chunks to load around camera
@export var unload_radius: int = 5        ## Chunks to unload beyond this
@export var chunks_per_frame: int = 1     ## Max chunk load/unload per frame

var _loaded_chunks: Dictionary = {}  # Vector2i → bool
var _chunk_generator: ChunkGenerator
var _load_queue: Array[Vector2i] = []
var _unload_queue: Array[Vector2i] = []

func _ready() -> void:
    _chunk_generator = ChunkGenerator.new()

func _process(_delta: float) -> void:
    var camera: Camera2D = get_viewport().get_camera_2d()
    if not camera:
        return

    var camera_chunk: Vector2i = _world_to_chunk(camera.global_position)
    _update_load_queue(camera_chunk)
    _update_unload_queue(camera_chunk)
    _process_queues()

func _world_to_chunk(world_pos: Vector2) -> Vector2i:
    var tile_size: Vector2 = Vector2(ground_layer.tile_set.tile_size)
    return Vector2i(
        floori(world_pos.x / (chunk_size * tile_size.x)),
        floori(world_pos.y / (chunk_size * tile_size.y))
    )

func _update_load_queue(center: Vector2i) -> void:
    for y: int in range(center.y - load_radius, center.y + load_radius + 1):
        for x: int in range(center.x - load_radius, center.x + load_radius + 1):
            var chunk := Vector2i(x, y)
            if chunk not in _loaded_chunks and chunk not in _load_queue:
                _load_queue.append(chunk)

    # Sort by distance to camera (load closest first)
    _load_queue.sort_custom(func(a: Vector2i, b: Vector2i) -> bool:
        return a.distance_squared_to(center) < b.distance_squared_to(center)
    )

func _update_unload_queue(center: Vector2i) -> void:
    for chunk: Vector2i in _loaded_chunks:
        var dist: float = chunk.distance_to(center)
        if dist > unload_radius and chunk not in _unload_queue:
            _unload_queue.append(chunk)

func _process_queues() -> void:
    var processed: int = 0

    # Load chunks
    while not _load_queue.is_empty() and processed < chunks_per_frame:
        var chunk: Vector2i = _load_queue.pop_front()
        _load_chunk(chunk)
        processed += 1

    # Unload chunks (can be more aggressive)
    while not _unload_queue.is_empty() and processed < chunks_per_frame * 2:
        var chunk: Vector2i = _unload_queue.pop_front()
        _unload_chunk(chunk)
        processed += 1

func _load_chunk(chunk_coords: Vector2i) -> void:
    var tile_offset := Vector2i(
        chunk_coords.x * chunk_size,
        chunk_coords.y * chunk_size
    )

    # Generate chunk data (could be from noise, saved file, etc.)
    var data: Dictionary = _chunk_generator.generate_chunk(
        chunk_coords, chunk_size
    )

    # Apply ground tiles
    for local_cell: Vector2i in data.get("ground", []):
        var tile_data: Dictionary = data["ground_data"][local_cell]
        ground_layer.set_cell(
            tile_offset + local_cell,
            tile_data["source"],
            tile_data["atlas"]
        )

    # Apply wall tiles
    for local_cell: Vector2i in data.get("walls", []):
        var tile_data: Dictionary = data["walls_data"][local_cell]
        walls_layer.set_cell(
            tile_offset + local_cell,
            tile_data["source"],
            tile_data["atlas"]
        )

    _loaded_chunks[chunk_coords] = true
    chunk_loaded.emit(chunk_coords)

func _unload_chunk(chunk_coords: Vector2i) -> void:
    var tile_offset := Vector2i(
        chunk_coords.x * chunk_size,
        chunk_coords.y * chunk_size
    )

    # Erase all tiles in chunk area
    for y: int in range(chunk_size):
        for x: int in range(chunk_size):
            var cell: Vector2i = tile_offset + Vector2i(x, y)
            ground_layer.erase_cell(cell)
            walls_layer.erase_cell(cell)

    _loaded_chunks.erase(chunk_coords)
    chunk_unloaded.emit(chunk_coords)
```

### Noise-Based Chunk Generator

```gdscript
class_name ChunkGenerator
extends RefCounted
## Generates chunk tile data using noise functions.

var _terrain_noise := FastNoiseLite.new()
var _cave_noise := FastNoiseLite.new()
var _detail_noise := FastNoiseLite.new()

func _init() -> void:
    _terrain_noise.noise_type = FastNoiseLite.TYPE_SIMPLEX_SMOOTH
    _terrain_noise.frequency = 0.02
    _terrain_noise.fractal_octaves = 4

    _cave_noise.noise_type = FastNoiseLite.TYPE_SIMPLEX_SMOOTH
    _cave_noise.frequency = 0.05
    _cave_noise.fractal_octaves = 2

    _detail_noise.noise_type = FastNoiseLite.TYPE_SIMPLEX_SMOOTH
    _detail_noise.frequency = 0.1

func set_seed(seed_value: int) -> void:
    _terrain_noise.seed = seed_value
    _cave_noise.seed = seed_value + 1
    _detail_noise.seed = seed_value + 2

func generate_chunk(chunk_coords: Vector2i, chunk_size: int) -> Dictionary:
    var ground: Array[Vector2i] = []
    var ground_data: Dictionary = {}
    var walls: Array[Vector2i] = []
    var walls_data: Dictionary = {}

    var world_offset := Vector2i(
        chunk_coords.x * chunk_size,
        chunk_coords.y * chunk_size
    )

    for y: int in range(chunk_size):
        for x: int in range(chunk_size):
            var world_x: int = world_offset.x + x
            var world_y: int = world_offset.y + y
            var local := Vector2i(x, y)

            var height: float = _terrain_noise.get_noise_2d(
                float(world_x), float(world_y)
            )
            var cave: float = _cave_noise.get_noise_2d(
                float(world_x), float(world_y)
            )

            if cave > 0.3:
                # Cave / empty space
                continue
            elif height > 0.2:
                # Stone
                walls.append(local)
                walls_data[local] = {
                    "source": 0,
                    "atlas": Vector2i(2, 1)  # Stone wall
                }
            elif height > -0.1:
                # Grass ground
                ground.append(local)
                ground_data[local] = {
                    "source": 0,
                    "atlas": Vector2i(0, 0)  # Grass
                }
            elif height > -0.3:
                # Dirt ground
                ground.append(local)
                ground_data[local] = {
                    "source": 0,
                    "atlas": Vector2i(1, 0)  # Dirt
                }
            else:
                # Water (could be a separate layer)
                ground.append(local)
                ground_data[local] = {
                    "source": 0,
                    "atlas": Vector2i(4, 0)  # Water
                }

    return {
        "ground": ground,
        "ground_data": ground_data,
        "walls": walls,
        "walls_data": walls_data
    }
```

---

## 12. Animated Tiles

### Animation Setup

Animated tiles are configured per-tile in the TileSet. Each tile can have multiple animation frames with configurable duration.

```gdscript
class_name AnimatedTileSetup
extends RefCounted

## Configure an animated water tile programmatically
static func setup_water_animation(
    atlas: TileSetAtlasSource,
    start_coords: Vector2i,
    frame_count: int = 4,
    frame_duration: float = 0.2
) -> void:
    # Ensure the tile has animation columns configured
    atlas.set_tile_animation_columns(start_coords, frame_count)
    atlas.set_tile_animation_frames_count(start_coords, frame_count)

    for i: int in range(frame_count):
        atlas.set_tile_animation_frame_duration(start_coords, i, frame_duration)

    # Optional: randomize animation start per tile instance
    atlas.set_tile_animation_mode(
        start_coords,
        TileSetAtlasSource.TILE_ANIMATION_MODE_DEFAULT
    )
```

### Speed Modifiers at Runtime

```gdscript
## Adjust animation speed based on game state (e.g., time slow-down)
func set_tilemap_animation_speed(layer: TileMapLayer, speed_scale: float) -> void:
    # TileMapLayer doesn't have a direct animation speed property,
    # but you can use the animation_speed_scale on the TileSet source
    var tileset: TileSet = layer.tile_set
    if not tileset:
        return

    for source_idx: int in range(tileset.get_source_count()):
        var source_id: int = tileset.get_source_id(source_idx)
        var source: TileSetSource = tileset.get_source(source_id)
        if source is TileSetAtlasSource:
            var atlas: TileSetAtlasSource = source as TileSetAtlasSource
            # Adjust frame durations proportionally
            _adjust_frame_durations(atlas, speed_scale)

func _adjust_frame_durations(
    atlas: TileSetAtlasSource,
    speed_scale: float
) -> void:
    # Store original durations and adjust
    # In practice, cache originals in a Dictionary on first call
    pass  # Implementation depends on your tile setup
```

> **Tip:** For water and lava, use 4-6 frames at 0.15-0.25s per frame. For torches and sparks, use 3-4 frames at 0.08-0.12s. The `RANDOM_START_TIMES` animation mode prevents all water tiles from animating in sync, which looks more natural.

---

## 13. Isometric & Hex Tilemaps

### Isometric Setup

```gdscript
class_name IsometricLevel
extends Node2D
## Isometric tilemap configuration.

@export var iso_layer: TileMapLayer

func _ready() -> void:
    # The TileSet must be configured for isometric:
    # tile_shape = TILE_SHAPE_ISOMETRIC
    # tile_layout = TILE_LAYOUT_STACKED or TILE_LAYOUT_DIAMOND_RIGHT/DOWN
    # tile_size = Vector2i(64, 32) — standard 2:1 isometric ratio
    pass

## Convert screen position to isometric tile coords
func screen_to_iso(screen_pos: Vector2) -> Vector2i:
    var local_pos: Vector2 = iso_layer.to_local(screen_pos)
    return iso_layer.local_to_map(local_pos)

## Get the world center of an isometric tile
func iso_to_screen(cell: Vector2i) -> Vector2:
    return iso_layer.to_global(iso_layer.map_to_local(cell))

## Get neighbors in isometric grid
func get_iso_neighbors(cell: Vector2i) -> Array[Vector2i]:
    # For isometric, the 4 cardinal neighbors depend on tile layout
    # With stacked layout, neighbors are the same as square grid
    return [
        cell + Vector2i(1, 0),
        cell + Vector2i(-1, 0),
        cell + Vector2i(0, 1),
        cell + Vector2i(0, -1)
    ]
```

### Hexagonal Setup

```gdscript
class_name HexLevel
extends Node2D
## Hexagonal tilemap for strategy games.

@export var hex_layer: TileMapLayer

## Hex TileSet configuration:
## tile_shape = TILE_SHAPE_HEXAGON
## tile_layout = TILE_LAYOUT_STACKED (flat-top) or TILE_OFFSET_AXIS (pointy-top)
## tile_size = Vector2i(72, 64) — adjust to your hex sprite size

## Get the 6 hex neighbors
func get_hex_neighbors(cell: Vector2i) -> Array[Vector2i]:
    return hex_layer.get_surrounding_cells(cell)

## Hex distance (cube coordinates)
func hex_distance(a: Vector2i, b: Vector2i) -> int:
    # Convert offset to cube coordinates for distance calculation
    var ac: Vector3i = _offset_to_cube(a)
    var bc: Vector3i = _offset_to_cube(b)
    return (absi(ac.x - bc.x) + absi(ac.y - bc.y) + absi(ac.z - bc.z)) / 2

func _offset_to_cube(hex: Vector2i) -> Vector3i:
    # For even-q offset (flat-top hex, even columns offset down)
    var q: int = hex.x
    var r: int = hex.y - (hex.x + (hex.x & 1)) / 2
    var s: int = -q - r
    return Vector3i(q, r, s)

## Get all cells within a hex radius
func get_hex_ring(center: Vector2i, radius: int) -> Array[Vector2i]:
    var cells: Array[Vector2i] = []
    if radius == 0:
        cells.append(center)
        return cells

    for r: int in range(radius + 1):
        for cell: Vector2i in _hex_ring_at_radius(center, r):
            cells.append(cell)
    return cells

func _hex_ring_at_radius(center: Vector2i, radius: int) -> Array[Vector2i]:
    if radius == 0:
        return [center]
    var results: Array[Vector2i] = []
    # Walk around the ring using neighbor stepping
    var current: Vector2i = center
    # Move to starting position (radius steps in one direction)
    for i: int in range(radius):
        var neighbors: Array[Vector2i] = get_hex_neighbors(current)
        if neighbors.size() > 4:
            current = neighbors[4]  # Move "south-west"
    # Walk each of the 6 edges
    var directions: Array[int] = [0, 1, 2, 3, 4, 5]
    for dir: int in directions:
        for i: int in range(radius):
            results.append(current)
            var neighbors: Array[Vector2i] = get_hex_neighbors(current)
            if dir < neighbors.size():
                current = neighbors[dir]
    return results

## Hex-based area of effect
func get_hex_area(center: Vector2i, radius: int) -> Array[Vector2i]:
    var cells: Array[Vector2i] = []
    for cell: Vector2i in hex_layer.get_used_cells():
        if hex_distance(center, cell) <= radius:
            cells.append(cell)
    return cells
```

---

## 14. Y-Sorting & Depth

### Y-Sort with TileMapLayer

```gdscript
class_name YSortTileSetup
extends Node2D
## Configure Y-sorting for top-down games with tall objects.

## Scene tree setup for Y-sorting:
##
## Level (Node2D)
## ├── GroundLayer (TileMapLayer) — y_sort_enabled: false (flat, below everything)
## ├── YSortRoot (Node2D, y_sort_enabled: true)
## │   ├── WallsLayer (TileMapLayer, y_sort_enabled: true)
## │   ├── Player (CharacterBody2D)
## │   ├── Enemies (Node2D)
## │   └── Props (Node2D)
## └── OverlayLayer (TileMapLayer) — always above (tree canopy, roofs)

@export var walls_layer: TileMapLayer

func _ready() -> void:
    # Enable y-sorting on the walls layer
    walls_layer.y_sort_enabled = true

    # IMPORTANT: Set y_sort_origin on tiles in the TileSet editor
    # This determines the "feet" of tall objects (trees, buildings)
    # Default is the center of the tile — for tall tiles, set it
    # to the bottom edge so objects sort by their base
```

### Per-Tile Y-Sort Origin

```
Standard 16×16 tile:
┌────────────┐
│            │  y_sort_origin = 0 (default, center)
│     ●      │  Player walks BEHIND this tile
│            │  when player.y < tile.y
└────────────┘

Tall 16×32 tile (tree):
┌────────────┐
│   🌳       │
│            │  y_sort_origin should be at the BASE (bottom)
│            │  Set to +16 (half the height past center)
│     ●      │  Now sorts by the tree's feet, not its canopy
└────────────┘
```

> **In the TileSet editor:** Select a tile → Inspector → Rendering → Y Sort Origin. Set this to the pixel offset from the tile center where the object's "feet" are. For 16×32 tiles, this is typically +8 to +16.

---

## 15. Fog of War on Tilemaps

### Tile-Based Fog of War

```gdscript
class_name TileFogOfWar
extends Node2D
## Tile-based fog of war using a dedicated TileMapLayer.

enum FogState { HIDDEN, EXPLORED, VISIBLE }

@export var fog_layer: TileMapLayer
@export var ground_layer: TileMapLayer
@export var vision_radius: int = 5

## Atlas coords for fog tiles
@export var fog_hidden_atlas: Vector2i = Vector2i(0, 0)   ## Fully black
@export var fog_explored_atlas: Vector2i = Vector2i(1, 0)  ## Semi-transparent
## Visible = no fog tile (erased)

var _fog_state: Dictionary = {}  # Vector2i → FogState
var _source_id: int = 0

func _ready() -> void:
    # Initialize all ground tiles as hidden
    for cell: Vector2i in ground_layer.get_used_cells():
        _fog_state[cell] = FogState.HIDDEN
        fog_layer.set_cell(cell, _source_id, fog_hidden_atlas)

## Update fog based on viewer positions
func update_fog(viewers: Array[Vector2]) -> void:
    # First: mark all currently visible as explored
    for cell: Vector2i in _fog_state:
        if _fog_state[cell] == FogState.VISIBLE:
            _fog_state[cell] = FogState.EXPLORED
            fog_layer.set_cell(cell, _source_id, fog_explored_atlas)

    # Then: reveal around each viewer
    for viewer_pos: Vector2 in viewers:
        var center: Vector2i = ground_layer.local_to_map(
            ground_layer.to_local(viewer_pos)
        )
        _reveal_around(center)

func _reveal_around(center: Vector2i) -> void:
    for dy: int in range(-vision_radius, vision_radius + 1):
        for dx: int in range(-vision_radius, vision_radius + 1):
            var cell := Vector2i(center.x + dx, center.y + dy)

            # Circular radius check
            if cell.distance_to(center) > vision_radius:
                continue

            # Only reveal cells that have ground
            if cell not in _fog_state:
                continue

            # Line-of-sight check (optional, for walls blocking vision)
            if not _has_line_of_sight(center, cell):
                continue

            _fog_state[cell] = FogState.VISIBLE
            fog_layer.erase_cell(cell)  # Remove fog tile = visible

func _has_line_of_sight(from: Vector2i, to: Vector2i) -> bool:
    # Bresenham's line algorithm to check for wall tiles
    var dx: int = absi(to.x - from.x)
    var dy: int = -absi(to.y - from.y)
    var sx: int = 1 if from.x < to.x else -1
    var sy: int = 1 if from.y < to.y else -1
    var err: int = dx + dy
    var current: Vector2i = from

    while current != to:
        # Check if there's a wall blocking sight
        if current != from:
            var tile_type: String = TileMetadata.get_tile_type(
                ground_layer, current
            )
            if tile_type == "wall" or tile_type == "solid":
                return false

        var e2: int = 2 * err
        if e2 >= dy:
            err += dy
            current.x += sx
        if e2 <= dx:
            err += dx
            current.y += sy

    return true

## Check if a cell is currently visible
func is_visible(cell: Vector2i) -> bool:
    return _fog_state.get(cell, FogState.HIDDEN) == FogState.VISIBLE

## Check if a cell has been explored
func is_explored(cell: Vector2i) -> bool:
    var state: int = _fog_state.get(cell, FogState.HIDDEN)
    return state == FogState.EXPLORED or state == FogState.VISIBLE
```

---

## 16. Destructible Terrain

### Destructible Tile System

```gdscript
class_name DestructibleTerrain
extends Node2D
## Handles tile destruction with health, debris, and respawn.

signal tile_damaged(cell: Vector2i, remaining_hp: int)
signal tile_destroyed(cell: Vector2i)

@export var walls_layer: TileMapLayer
@export var ground_layer: TileMapLayer
@export var debris_scene: PackedScene

var _tile_health: Dictionary = {}  # Vector2i → int
var _original_tiles: Dictionary = {}  # Vector2i → {source, atlas, alt}
var _respawn_timers: Dictionary = {}  # Vector2i → float

const DEFAULT_HEALTH: int = 3

func _ready() -> void:
    # Initialize health for all destructible tiles
    for cell: Vector2i in walls_layer.get_used_cells():
        if TileMetadata.is_destructible(walls_layer, cell):
            var data: TileData = walls_layer.get_cell_tile_data(cell)
            # Use custom data for per-tile health, or default
            _tile_health[cell] = DEFAULT_HEALTH
            _original_tiles[cell] = {
                "source": walls_layer.get_cell_source_id(cell),
                "atlas": walls_layer.get_cell_atlas_coords(cell),
                "alt": walls_layer.get_cell_alternative_tile(cell)
            }

func _process(delta: float) -> void:
    # Process respawn timers
    var to_respawn: Array[Vector2i] = []
    for cell: Vector2i in _respawn_timers:
        _respawn_timers[cell] -= delta
        if _respawn_timers[cell] <= 0.0:
            to_respawn.append(cell)

    for cell: Vector2i in to_respawn:
        _respawn_tile(cell)
        _respawn_timers.erase(cell)

## Deal damage to a tile. Returns true if destroyed.
func damage_tile(cell: Vector2i, damage: int = 1) -> bool:
    if cell not in _tile_health:
        return false

    _tile_health[cell] -= damage
    tile_damaged.emit(cell, _tile_health[cell])

    if _tile_health[cell] <= 0:
        _destroy_tile(cell)
        return true

    # Visual damage feedback — swap to cracked variant
    _show_damage_state(cell)
    return false

func _destroy_tile(cell: Vector2i) -> void:
    # Spawn debris particles
    if debris_scene:
        var debris: Node2D = debris_scene.instantiate() as Node2D
        debris.global_position = walls_layer.to_global(
            walls_layer.map_to_local(cell)
        )
        get_tree().current_scene.add_child(debris)

    # Remove the wall tile, optionally reveal ground underneath
    walls_layer.erase_cell(cell)
    tile_destroyed.emit(cell)

    # Optional: set respawn timer
    _respawn_timers[cell] = 10.0  # Respawn after 10 seconds

func _show_damage_state(cell: Vector2i) -> void:
    var max_hp: int = DEFAULT_HEALTH
    var current: int = _tile_health[cell]
    var damage_ratio: float = 1.0 - (float(current) / float(max_hp))

    # Modulate the tile color based on damage
    # Note: TileMapLayer.set_cell doesn't support per-cell modulate,
    # so we use alternative tiles or overlay sprites
    if damage_ratio > 0.66:
        # Heavily damaged — use cracked variant (alternative tile 2)
        var orig: Dictionary = _original_tiles[cell]
        walls_layer.set_cell(cell, orig["source"], orig["atlas"], 2)
    elif damage_ratio > 0.33:
        # Moderately damaged — use slight crack variant (alternative tile 1)
        var orig: Dictionary = _original_tiles[cell]
        walls_layer.set_cell(cell, orig["source"], orig["atlas"], 1)

func _respawn_tile(cell: Vector2i) -> void:
    if cell in _original_tiles:
        var orig: Dictionary = _original_tiles[cell]
        walls_layer.set_cell(cell, orig["source"], orig["atlas"], orig["alt"])
        _tile_health[cell] = DEFAULT_HEALTH

## Damage all tiles in an explosion radius
func explosion_damage(
    center: Vector2, radius: float, damage: int
) -> Array[Vector2i]:
    var destroyed: Array[Vector2i] = []
    var center_cell: Vector2i = walls_layer.local_to_map(
        walls_layer.to_local(center)
    )
    var tile_radius: int = ceili(radius / walls_layer.tile_set.tile_size.x)

    for dy: int in range(-tile_radius, tile_radius + 1):
        for dx: int in range(-tile_radius, tile_radius + 1):
            var cell := Vector2i(center_cell.x + dx, center_cell.y + dy)
            var world_pos: Vector2 = walls_layer.to_global(
                walls_layer.map_to_local(cell)
            )

            if center.distance_to(world_pos) <= radius:
                # Distance-based damage falloff
                var dist_ratio: float = center.distance_to(world_pos) / radius
                var scaled_damage: int = ceili(damage * (1.0 - dist_ratio))
                if damage_tile(cell, scaled_damage):
                    destroyed.append(cell)

    return destroyed
```

---

## 17. Pathfinding Integration

### A* Pathfinding on Tilemaps

```gdscript
class_name TilePathfinder
extends Node2D
## A* pathfinding integrated with tilemap data.

@export var ground_layer: TileMapLayer
@export var walls_layer: TileMapLayer
@export var allow_diagonal: bool = true

var _astar: AStarGrid2D

func _ready() -> void:
    build_pathfinding_grid()

func build_pathfinding_grid() -> void:
    _astar = AStarGrid2D.new()

    var used_rect: Rect2i = ground_layer.get_used_rect()
    _astar.region = used_rect
    _astar.cell_size = Vector2(ground_layer.tile_set.tile_size)
    _astar.diagonal_mode = (
        AStarGrid2D.DIAGONAL_MODE_AT_LEAST_ONE_WALKABLE
        if allow_diagonal
        else AStarGrid2D.DIAGONAL_MODE_NEVER
    )
    _astar.default_compute_heuristic = AStarGrid2D.HEURISTIC_MANHATTAN
    _astar.default_estimate_heuristic = AStarGrid2D.HEURISTIC_MANHATTAN
    _astar.update()

    # Mark walls as solid
    for cell: Vector2i in walls_layer.get_used_cells():
        if _astar.is_in_bounds(cell.x, cell.y):
            _astar.set_point_solid(cell, true)

    # Set movement costs from custom data
    for cell: Vector2i in ground_layer.get_used_cells():
        if _astar.is_in_bounds(cell.x, cell.y):
            var cost: float = TileMetadata.get_movement_cost(
                ground_layer, cell
            )
            if cost >= 100.0:
                _astar.set_point_solid(cell, true)
            else:
                _astar.set_point_weight_scale(cell, cost)

## Find a path between two tile coordinates
func find_path(from: Vector2i, to: Vector2i) -> PackedVector2Array:
    if not _astar:
        return PackedVector2Array()
    return _astar.get_point_path(from, to)

## Find path using world positions
func find_path_world(from: Vector2, to: Vector2) -> PackedVector2Array:
    var from_cell: Vector2i = ground_layer.local_to_map(
        ground_layer.to_local(from)
    )
    var to_cell: Vector2i = ground_layer.local_to_map(
        ground_layer.to_local(to)
    )
    var path: PackedVector2Array = find_path(from_cell, to_cell)

    # Convert tile path to world positions
    var world_path := PackedVector2Array()
    for point: Vector2 in path:
        # AStarGrid2D returns positions in cell_size units
        # Convert back to world space via map_to_local
        var cell := Vector2i(roundi(point.x / _astar.cell_size.x),
                             roundi(point.y / _astar.cell_size.y))
        world_path.append(
            ground_layer.to_global(ground_layer.map_to_local(cell))
        )
    return world_path

## Check if a cell is walkable
func is_walkable(cell: Vector2i) -> bool:
    if not _astar or not _astar.is_in_bounds(cell.x, cell.y):
        return false
    return not _astar.is_point_solid(cell)

## Update a single cell (after tile changes)
func update_cell(cell: Vector2i) -> void:
    if not _astar or not _astar.is_in_bounds(cell.x, cell.y):
        return

    var is_wall: bool = walls_layer.get_cell_source_id(cell) != -1
    if is_wall:
        _astar.set_point_solid(cell, true)
    else:
        var cost: float = TileMetadata.get_movement_cost(ground_layer, cell)
        _astar.set_point_solid(cell, cost >= 100.0)
        if cost < 100.0:
            _astar.set_point_weight_scale(cell, cost)

## Update multiple cells efficiently (after batch changes)
func update_cells(cells: Array[Vector2i]) -> void:
    for cell: Vector2i in cells:
        update_cell(cell)
```

---

## 18. Performance Optimization

### Performance Guidelines

| Operation | Cost | Notes |
|---|---|---|
| `set_cell()` | Low | But triggers internal quadrant rebuild |
| `erase_cell()` | Low | Same as set_cell |
| `get_cell_source_id()` | Very Low | Hash lookup |
| `get_cell_tile_data()` | Very Low | Hash lookup |
| `get_used_cells()` | Medium | Allocates array, O(n) cells |
| `get_used_cells_by_id()` | Medium-High | Scans all cells |
| `local_to_map()` / `map_to_local()` | Very Low | Pure math |
| `set_cells_terrain_connect()` | High | Updates target + all neighbors |
| Terrain painting (large area) | Very High | O(n²) neighbor updates |

### Batch Cell Updates

```gdscript
## WRONG — triggers quadrant rebuild after EACH set_cell
func slow_fill(layer: TileMapLayer, cells: Array[Vector2i]) -> void:
    for cell: Vector2i in cells:
        layer.set_cell(cell, 0, Vector2i(0, 0))
    # Each set_cell triggers internal update

## BETTER — use terrain connect for grouped updates
func fast_terrain_fill(
    layer: TileMapLayer,
    cells: Array[Vector2i],
    terrain_set: int,
    terrain_id: int
) -> void:
    # set_cells_terrain_connect handles all cells in one batch
    layer.set_cells_terrain_connect(cells, terrain_set, terrain_id)
```

### Reducing Draw Calls

```gdscript
## TileMapLayer uses quadrant-based rendering
## Each quadrant = one draw call. Default quadrant size = 16 tiles.
##
## Tune quadrant size based on your game:
## - Large open worlds: increase to 32 (fewer draw calls)
## - Frequently changing tiles: decrease to 8 (smaller rebuild area)
## - Default (16): good balance for most games

func configure_performance(layer: TileMapLayer) -> void:
    layer.rendering_quadrant_size = 16  # Default

    # For layers that never change (background):
    # Higher quadrant size = fewer draw calls
    # layer.rendering_quadrant_size = 32

    # For layers with frequent runtime changes (destructible):
    # Lower quadrant size = smaller area to rebuild
    # layer.rendering_quadrant_size = 8
```

### Culling Strategy

```gdscript
class_name TilePerformanceMonitor
extends Node
## Monitor tile rendering performance.

@export var layers: Array[TileMapLayer] = []

var _visible_tile_count: int = 0

func _process(_delta: float) -> void:
    if Engine.get_frames_drawn() % 60 != 0:
        return  # Only check once per second

    _visible_tile_count = 0
    var viewport: Rect2 = get_viewport().get_visible_rect()
    var camera: Camera2D = get_viewport().get_camera_2d()
    if not camera:
        return

    var transform: Transform2D = camera.get_canvas_transform().affine_inverse()
    var visible_rect := Rect2(
        transform * viewport.position,
        transform * viewport.size
    )

    for layer: TileMapLayer in layers:
        var top_left: Vector2i = layer.local_to_map(
            layer.to_local(visible_rect.position)
        )
        var bottom_right: Vector2i = layer.local_to_map(
            layer.to_local(visible_rect.end)
        )
        var area: int = (bottom_right.x - top_left.x + 1) * (bottom_right.y - top_left.y + 1)
        _visible_tile_count += area

    if _visible_tile_count > 10000:
        push_warning("TilePerf: %d tiles visible — consider chunking or reducing layers" % _visible_tile_count)
```

### Memory Optimization

| Technique | Impact | When to Use |
|---|---|---|
| Share TileSet across layers | High | Always (default behavior) |
| Use `rendering_quadrant_size` | Medium | Large worlds |
| Chunk loading/unloading | Very High | Infinite/large worlds |
| Disable invisible layers | Low | Debug layers left enabled |
| Use Alternative Tiles instead of extra sources | Low | Reduces source lookups |
| Merge decoration into fewer layers | Medium | >5 visual layers |

---

## 19. Common Mistakes & Troubleshooting

### ❌ Using Deprecated TileMap Instead of TileMapLayer

```gdscript
## WRONG — TileMap is deprecated in Godot 4.3+
var tilemap: TileMap
tilemap.set_cell(0, Vector2i(5, 3), 0, Vector2i(0, 0))

## RIGHT — Use TileMapLayer (one node per layer)
var layer: TileMapLayer
layer.set_cell(Vector2i(5, 3), 0, Vector2i(0, 0))
```

### ❌ Forgetting Coordinate Space Conversion

```gdscript
## WRONG — global_position is world space, local_to_map expects local space
func bad_world_to_tile(world_pos: Vector2) -> Vector2i:
    return layer.local_to_map(world_pos)  # Breaks if layer has any transform!

## RIGHT — convert to local first
func good_world_to_tile(world_pos: Vector2) -> Vector2i:
    return layer.local_to_map(layer.to_local(world_pos))
```

### ❌ Checking Source ID -1 Without Null Guard on TileData

```gdscript
## WRONG — get_cell_tile_data returns null for empty cells
func bad_check(cell: Vector2i) -> String:
    var data: TileData = layer.get_cell_tile_data(cell)
    return data.get_custom_data("type")  # Crashes on empty cell!

## RIGHT — null check first
func good_check(cell: Vector2i) -> String:
    var data: TileData = layer.get_cell_tile_data(cell)
    if not data:
        return ""
    return data.get_custom_data("type") as String
```

### ❌ Terrain Paint Not Updating Neighbors

```gdscript
## WRONG — set_cell with terrain atlas coords doesn't auto-tile
layer.set_cell(cell, 0, terrain_atlas_coords)  # Places exact tile, no neighbor update

## RIGHT — use terrain connect methods
layer.set_cells_terrain_connect([cell], terrain_set, terrain_id)
```

### ❌ Y-Sort Origin Not Set for Tall Tiles

**Symptom:** Player walks behind short tiles but in front of tall tiles (trees, buildings) when they should be behind them.

**Fix:** In the TileSet editor, set **Y Sort Origin** for each tall tile to the pixel offset of the object's base. For a 16×32 tile, set Y Sort Origin to `+8` or `+16`.

### ❌ Physics Shapes Not Showing in Game

**Checklist:**
1. TileSet has a physics layer added (`Add Element` under Physics Layers)
2. The tile has a collision polygon drawn on that physics layer
3. The TileMapLayer is in the scene tree (not orphaned)
4. The layer's collision layer/mask doesn't conflict with the querying body
5. `use_kinematic_bodies` is `false` (default) unless you need kinematic tiles
6. Check with **Debug → Visible Collision Shapes** in the editor

### ❌ Navigation Not Working After Tile Changes

```gdscript
## After modifying tiles at runtime, you must rebake navigation
## Method 1: Full rebake (simple but expensive)
NavigationServer2D.bake_from_source_geometry_data(
    nav_region.get_navigation_map(),
    NavigationMeshSourceGeometryData2D.new()
)

## Method 2: Update the pathfinder grid (for AStarGrid2D)
pathfinder.update_cell(changed_cell)  # See §17
```

---

## 20. Tuning Reference Tables

### Tile Size by Game Type

| Game Type | Recommended Tile Size | Notes |
|---|---|---|
| Platformer (retro) | 16×16 | Classic feel, crisp pixels |
| Platformer (modern) | 32×32 or 48×48 | More detail per tile |
| Top-down RPG | 16×16 or 32×32 | 16 for retro, 32 for detailed |
| Strategy / Tactics | 32×32 or 64×64 | Larger = easier to click |
| Isometric | 64×32 | Standard 2:1 ratio |
| Hex strategy | 72×64 or 96×80 | Depends on hex art |

### Chunk Size by World Scale

| World Scale | Chunk Size (tiles) | Load Radius | Notes |
|---|---|---|---|
| Small level (<100×100) | No chunking needed | — | Load everything |
| Medium (~500×500) | 32×32 | 2-3 | Smooth scrolling |
| Large (~2000×2000) | 32×32 or 64×64 | 3-5 | Balance memory vs load time |
| Infinite | 32×32 | 3-4 | Unload aggressively |

### Terrain Tile Count Requirements

| Terrain Mode | Min Tiles | Full Coverage | Quality |
|---|---|---|---|
| Match Sides Only | 5 | 16 | Blocky, fast to create |
| Match Corners Only | 5 | 16 | Good for top-down |
| Corners + Sides | 13 | 47 | Best transitions |
| Two-terrain blend | 13+13 | 47+47 | Per terrain pair |

### Procedural Generation Algorithm Selection

| Algorithm | Best For | Complexity | Output Character |
|---|---|---|---|
| BSP | Dungeons, buildings | Medium | Rectangular rooms + corridors |
| Cellular Automata | Caves, organic terrain | Low | Organic, blob-like |
| Perlin/Simplex Noise | Overworld, height maps | Low | Natural, continuous |
| Drunkard's Walk | Simple dungeon | Very Low | Winding passages |
| Wave Function Collapse | Constrained tiling | High | Pattern-consistent |
| Poisson Disk | Object placement | Medium | Evenly-spaced points |
| Voronoi | Biome regions, room shapes | Medium | Irregular polygons |

### Layer Count Budget

| Game Type | Recommended Layers | Notes |
|---|---|---|
| Simple platformer | 2-3 | Ground, walls, decoration |
| RPG overworld | 3-5 | Ground, objects, roof, collision, meta |
| Strategy game | 3-4 | Terrain, units, fog, UI overlay |
| Roguelike dungeon | 2-3 | Floor, walls, items/spawns (meta) |

---

## Related Guides

- **[G1 Scene Composition](G1_scene_composition.md)** — Component patterns for tile-based entities
- **[G5 Physics & Collision](G5_physics_and_collision.md)** — Collision layers, raycasting against tiles
- **[G6 Camera Systems](G6_camera_systems.md)** — Auto-limits from TileMapLayer, small-room centering
- **[G2 State Machine](G2_state_machine.md)** — State machines for tile-based game logic
- **[G4 Input Handling](G4_input_handling.md)** — Grid-based movement input patterns
- **[G3 Signal Architecture](G3_signal_architecture.md)** — Signals for tile change events
- **[E1 Architecture Overview](../architecture/E1_architecture_overview.md)** — Node tree philosophy
- **[E2 GDScript vs C#](../architecture/E2_gdscript_vs_csharp.md)** — Language choice for tile-heavy games

---

*Last updated: 2026-03-22 · Godot 4.4+ · Typed GDScript*
