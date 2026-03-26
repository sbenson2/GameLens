# G14 — Navigation & Pathfinding

> **Category:** Guide · **Engine:** Godot 4.4+ · **Language:** GDScript
> **Related:** [G5 Physics & Collision](./G5_physics_and_collision.md) · [G7 TileMap & Terrain](./G7_tilemap_and_terrain.md) · [G4 Input Handling](./G4_input_handling.md) · [G2 State Machine](./G2_state_machine.md) · [Pathfinding Theory](../../core/concepts/pathfinding-theory.md) · [AI Theory](../../core/concepts/ai-theory.md)

---

## What This Guide Covers

Navigation and pathfinding determine how entities move through your game world intelligently. This guide covers Godot's built-in NavigationServer2D system, AStarGrid2D for tile-based games, manual A* with AStar2D for custom graphs, steering behaviors for smooth movement, obstacle avoidance, flow fields for many-unit pathfinding, and integration with state machines, tilemaps, and AI systems.

If you're coming from Unity: `NavMeshAgent` → `NavigationAgent2D`, `NavMesh.CalculatePath` → `NavigationServer2D.map_get_path()`, `NavMeshObstacle` → `NavigationObstacle2D`. Godot's system is more explicit — you define navigation regions, not baked meshes.

If you're coming from MonoGame: You likely rolled your own A* on a grid. Godot provides AStarGrid2D (grid-based) AND NavigationServer2D (polygon-based) out of the box. Use AStarGrid2D for tile games, NavigationServer2D for free-form worlds.

---

## Table of Contents

1. [Architecture Decision: Which System?](#1--architecture-decision-which-system)
2. [NavigationServer2D Fundamentals](#2--navigationserver2d-fundamentals)
3. [NavigationRegion2D Setup](#3--navigationregion2d-setup)
4. [NavigationAgent2D](#4--navigationagent2d)
5. [Navigation from TileMapLayer](#5--navigation-from-tilemaplayer)
6. [NavigationObstacle2D](#6--navigationobstacle2d)
7. [Runtime Navigation Modification](#7--runtime-navigation-modification)
8. [AStarGrid2D for Tile Games](#8--astargrid2d-for-tile-games)
9. [AStar2D for Custom Graphs](#9--astar2d-for-custom-graphs)
10. [Steering Behaviors](#10--steering-behaviors)
11. [Obstacle Avoidance](#11--obstacle-avoidance)
12. [Flow Fields](#12--flow-fields)
13. [Hierarchical Pathfinding](#13--hierarchical-pathfinding)
14. [Path Smoothing & Following](#14--path-smoothing--following)
15. [Navigation Layers & Cost](#15--navigation-layers--cost)
16. [Group & Formation Movement](#16--group--formation-movement)
17. [State Machine Integration](#17--state-machine-integration)
18. [Debug Visualization](#18--debug-visualization)
19. [Performance Optimization](#19--performance-optimization)
20. [Common Mistakes & Fixes](#20--common-mistakes--fixes)
21. [Tuning Reference Tables](#21--tuning-reference-tables)

---

## 1 — Architecture Decision: Which System?

Godot offers three pathfinding approaches. Choose based on your world type:

```
Does your world use a tile grid?
├─ YES → Is movement locked to the grid?
│   ├─ YES → AStarGrid2D (§8)
│   └─ NO  → NavigationServer2D with TileMapLayer nav (§5)
└─ NO  → Is your world hand-placed polygons/shapes?
    ├─ YES → NavigationServer2D + NavigationRegion2D (§3)
    └─ NO  → AStar2D with custom graph (§9)

How many units path simultaneously?
├─ 1–20  → Individual A* paths (any system)
├─ 20–100 → NavigationServer2D (threaded, optimized)
└─ 100+  → Flow fields (§12) or hierarchical (§13)
```

| System | Best For | Pathfinding | Avoidance | Threading |
|--------|----------|-------------|-----------|-----------|
| **NavigationServer2D** | Free-form worlds, mixed terrain | Polygon navmesh | Built-in RVO | ✅ Async |
| **AStarGrid2D** | Tile-based games, grid movement | Grid A* | Manual | ❌ Sync |
| **AStar2D** | Custom graphs, waypoints, platforms | Arbitrary graph A* | Manual | ❌ Sync |
| **Flow Fields** | Many units, single target | Precomputed field | Implicit | ❌ Sync |

> **Rule of thumb:** Start with NavigationServer2D unless you have a specific reason not to. It handles 90% of cases, supports async queries, and has built-in avoidance.

---

## 2 — NavigationServer2D Fundamentals

Godot's navigation is server-based — a singleton manages all navigation data, separate from the scene tree. This matters for understanding how updates propagate.

### Core Concepts

```
NavigationServer2D (singleton)
├── Map (navigation world — usually one per game world)
│   ├── Region (walkable area — NavigationRegion2D nodes)
│   │   └── NavigationPolygon (defines walkable polygons)
│   ├── Link (connections between disconnected regions)
│   │   └── NavigationLink2D (bridges, teleporters, ladders)
│   ├── Obstacle (dynamic blockers)
│   │   └── NavigationObstacle2D (moving entities, doors)
│   └── Agent (pathfinding entities)
│       └── NavigationAgent2D (enemies, NPCs, allies)
```

### Server Lifecycle

The NavigationServer2D processes updates in a deferred batch — not immediately when you add/modify regions:

```gdscript
# Navigation changes are NOT instant
# They apply after the next physics frame
NavigationServer2D.map_force_update(map_rid)  # Force immediate sync (expensive)
```

### Getting the Default Map

```gdscript
# Every World2D has a default navigation map
var map_rid: RID = get_world_2d().navigation_map

# Or get it from the NavigationServer2D directly
var map_rid2: RID = NavigationServer2D.get_maps()[0]

# Query a path directly (without NavigationAgent2D)
var path: PackedVector2Array = NavigationServer2D.map_get_path(
    map_rid,
    global_position,   # from
    target_position,   # to
    true                # optimize (string-pulling)
)
```

---

## 3 — NavigationRegion2D Setup

NavigationRegion2D defines walkable areas using NavigationPolygon resources.

### Basic Setup (Scene Tree)

```
World (Node2D)
├── NavigationRegion2D          ← Walkable area
│   └── NavigationPolygon       ← Resource defining polygons
├── TileMapLayer                ← Visual terrain
├── Player (CharacterBody2D)
│   └── NavigationAgent2D       ← Path following
└── Enemy (CharacterBody2D)
    └── NavigationAgent2D
```

### Creating NavigationPolygon in Code

```gdscript
class_name NavSetup
extends Node2D

@export var walkable_rect: Rect2 = Rect2(0, 0, 1920, 1080)
@export var margin: float = 8.0

var nav_region: NavigationRegion2D

func _ready() -> void:
    nav_region = NavigationRegion2D.new()
    add_child(nav_region)
    
    var nav_poly := NavigationPolygon.new()
    
    # Define outer boundary (walkable area)
    var outline := PackedVector2Array([
        walkable_rect.position,
        Vector2(walkable_rect.end.x, walkable_rect.position.y),
        walkable_rect.end,
        Vector2(walkable_rect.position.x, walkable_rect.end.y),
    ])
    nav_poly.add_outline(outline)
    
    # Cut holes for obstacles (must be CLOCKWISE — opposite of outer)
    var pillar_pos := Vector2(500, 400)
    var pillar_size := Vector2(64, 64)
    var hole := PackedVector2Array([
        pillar_pos,
        Vector2(pillar_pos.x, pillar_pos.y + pillar_size.y),
        pillar_pos + pillar_size,
        Vector2(pillar_pos.x + pillar_size.x, pillar_pos.y),
    ])
    nav_poly.add_outline(hole)
    
    # Bake the polygon (generates internal triangulation)
    nav_poly.make_polygons_from_outlines()
    nav_region.navigation_polygon = nav_poly
```

### Multiple Regions (Connected Automatically)

NavigationServer2D automatically merges overlapping regions on the same navigation layer. Use this for modular level design:

```gdscript
# Room A and Room B overlap at the doorway
# NavigationServer2D automatically connects them — no manual linking needed

# Regions merge when:
# - They share the same navigation_layers bitmask
# - Their edges are within edge_connection_margin (default 1.0)
# Adjust the merge margin:
NavigationServer2D.map_set_edge_connection_margin(map_rid, 2.0)
```

---

## 4 — NavigationAgent2D

NavigationAgent2D is the primary way to make entities follow navigation paths.

### Basic Enemy Following Player

```gdscript
class_name NavEnemy
extends CharacterBody2D

@export var speed: float = 150.0
@export var arrival_distance: float = 10.0

@onready var nav_agent: NavigationAgent2D = $NavigationAgent2D
@onready var target: Node2D = get_tree().get_first_node_in_group("player")

func _ready() -> void:
    # Wait for navigation map to sync (CRITICAL — first frame has no nav data)
    await get_tree().physics_frame
    
    nav_agent.path_desired_distance = 4.0
    nav_agent.target_desired_distance = arrival_distance
    nav_agent.max_speed = speed
    
    # Connect signals
    nav_agent.velocity_computed.connect(_on_velocity_computed)
    nav_agent.navigation_finished.connect(_on_navigation_finished)
    
    # Start path updates
    _update_path()

func _physics_process(_delta: float) -> void:
    if nav_agent.is_navigation_finished():
        return
    
    var next_pos: Vector2 = nav_agent.get_next_path_position()
    var direction: Vector2 = global_position.direction_to(next_pos)
    
    # Use avoidance (feeds into velocity_computed signal)
    nav_agent.velocity = direction * speed

func _on_velocity_computed(safe_velocity: Vector2) -> void:
    velocity = safe_velocity
    move_and_slide()

func _on_navigation_finished() -> void:
    velocity = Vector2.ZERO

func _update_path() -> void:
    if is_instance_valid(target):
        nav_agent.target_position = target.global_position
    
    # Schedule next path update (don't recalculate every frame)
    get_tree().create_timer(0.25).timeout.connect(_update_path)
```

### NavigationAgent2D Properties Reference

```gdscript
# Path following
nav_agent.path_desired_distance = 4.0     # How close to waypoint before advancing
nav_agent.target_desired_distance = 10.0   # How close to target = "arrived"
nav_agent.path_max_distance = 50.0         # Max deviation before repath

# Avoidance (RVO)
nav_agent.avoidance_enabled = true
nav_agent.radius = 16.0                    # Avoidance radius (NOT collision)
nav_agent.max_speed = 200.0                # For avoidance velocity clamping
nav_agent.neighbor_distance = 500.0        # How far to look for neighbors
nav_agent.max_neighbors = 10               # Max neighbors to consider
nav_agent.time_horizon_agents = 1.0        # Prediction time for agent avoidance
nav_agent.time_horizon_obstacles = 0.0     # Prediction time for obstacle avoidance

# Path quality
nav_agent.path_postprocessing = NavigationPathQueryParameters2D.PATH_POSTPROCESSING_CORRIDORFUNNEL
# CORRIDORFUNNEL = string-pulled smooth path (default, best for most cases)
# EDGECENTERED = path through edge midpoints (for grid-like movement)
```

### Path Update Strategies

Don't recalculate paths every frame — it's wasteful:

```gdscript
class_name PathUpdateManager
extends Node

## Manages path recalculation timing for navigation agents

enum Strategy {
    TIMER,         ## Fixed interval (simplest)
    DISTANCE,      ## Repath when target moves far enough
    ADAPTIVE,      ## Adjust interval based on distance to target
}

@export var strategy: Strategy = Strategy.ADAPTIVE
@export var min_interval: float = 0.1
@export var max_interval: float = 1.0
@export var repath_distance: float = 64.0  ## For DISTANCE strategy

var _agent: NavigationAgent2D
var _target: Node2D
var _last_target_pos: Vector2
var _timer: float = 0.0

func setup(agent: NavigationAgent2D, target: Node2D) -> void:
    _agent = agent
    _target = target
    _last_target_pos = target.global_position

func _physics_process(delta: float) -> void:
    if not is_instance_valid(_target) or not is_instance_valid(_agent):
        return
    
    _timer -= delta
    
    match strategy:
        Strategy.TIMER:
            if _timer <= 0.0:
                _repath()
                _timer = min_interval
        
        Strategy.DISTANCE:
            var moved: float = _target.global_position.distance_to(_last_target_pos)
            if moved > repath_distance:
                _repath()
        
        Strategy.ADAPTIVE:
            if _timer <= 0.0:
                _repath()
                var dist: float = _agent.get_owner().global_position.distance_to(
                    _target.global_position
                )
                # Close = frequent updates, far = rare updates
                var t: float = clampf(dist / 500.0, 0.0, 1.0)
                _timer = lerpf(min_interval, max_interval, t)

func _repath() -> void:
    _agent.target_position = _target.global_position
    _last_target_pos = _target.global_position
```

---

## 5 — Navigation from TileMapLayer

The most common setup: generate navigation polygons from your tilemap.

### TileSet Navigation Layer Setup

```gdscript
# In the TileSet editor:
# 1. Add a Navigation Layer (TileSet → Navigation Layers → Add Element)
# 2. For each walkable tile, paint a navigation polygon in the tile's Navigation tab
# 3. Non-walkable tiles (walls, pits) have NO navigation polygon

# The TileMapLayer automatically creates a NavigationRegion2D internally
# when tiles with navigation polygons are placed
```

### Programmatic Navigation from TileMap

```gdscript
class_name TileNavBuilder
extends Node2D

## Builds navigation from TileMapLayer tile data

@export var tile_map: TileMapLayer
@export var walkable_terrain_set: int = 0
@export var cell_size: Vector2i = Vector2i(16, 16)

var nav_region: NavigationRegion2D

func _ready() -> void:
    nav_region = NavigationRegion2D.new()
    add_child(nav_region)
    build_navigation()

func build_navigation() -> void:
    var nav_poly := NavigationPolygon.new()
    var used_cells: Array[Vector2i] = tile_map.get_used_cells()
    
    for cell in used_cells:
        var tile_data: TileData = tile_map.get_cell_tile_data(cell)
        if tile_data == null:
            continue
        
        # Check if tile has navigation polygon on layer 0
        var nav_count: int = tile_data.get_navigation_polygon(0) != null if 1 else 0
        if nav_count == 0:
            continue
        
        # Add tile's walkable area as an outline
        var world_pos: Vector2 = tile_map.map_to_local(cell) - Vector2(cell_size) / 2.0
        var outline := PackedVector2Array([
            world_pos,
            world_pos + Vector2(cell_size.x, 0),
            world_pos + Vector2(cell_size),
            world_pos + Vector2(0, cell_size.y),
        ])
        nav_poly.add_outline(outline)
    
    nav_poly.make_polygons_from_outlines()
    nav_region.navigation_polygon = nav_poly

func rebuild_cell(cell: Vector2i) -> void:
    # For dynamic terrain changes, rebuild the entire nav
    # (Godot doesn't support partial navmesh updates yet)
    build_navigation()
```

### Combining TileMap Nav with Custom Regions

```gdscript
# TileMapLayer handles base terrain navigation automatically
# Add NavigationRegion2D nodes for:
# - Non-tile areas (open spaces between tile sections)
# - Temporary walkable zones (bridges that extend, doors that open)
# - Indoor areas within building tiles

# All regions on the same navigation layer merge automatically
```

---

## 6 — NavigationObstacle2D

Dynamic obstacles that carve holes in the navigation mesh at runtime.

### Moving Obstacle (NPC, Patrol)

```gdscript
class_name NavObstacleEntity
extends CharacterBody2D

## Entity that other navigation agents avoid

@onready var obstacle: NavigationObstacle2D = $NavigationObstacle2D

func _ready() -> void:
    obstacle.avoidance_enabled = true
    obstacle.radius = 24.0  # Avoidance radius
    
    # IMPORTANT: Set velocity for prediction
    # Other agents use this to predict where the obstacle will be
    obstacle.velocity = Vector2.ZERO

func _physics_process(_delta: float) -> void:
    # Update obstacle velocity so agents can predict movement
    obstacle.velocity = velocity
```

### Static Obstacle (Pushable Crate, Closed Door)

```gdscript
class_name DoorObstacle
extends StaticBody2D

## Door that blocks navigation when closed

@onready var obstacle: NavigationObstacle2D = $NavigationObstacle2D
@onready var anim: AnimationPlayer = $AnimationPlayer

var _is_open: bool = false

# Define the obstacle shape as vertices (clockwise convex polygon)
var _closed_vertices := PackedVector2Array([
    Vector2(-24, -4),
    Vector2(24, -4),
    Vector2(24, 4),
    Vector2(-24, 4),
])

func _ready() -> void:
    obstacle.avoidance_enabled = false  # Static — use carving, not RVO
    obstacle.vertices = _closed_vertices

func open() -> void:
    if _is_open:
        return
    _is_open = true
    
    # Remove navigation obstacle (makes area walkable)
    obstacle.vertices = PackedVector2Array()
    anim.play("open")
    
    # Force nav map update for immediate path recalculation
    var map_rid: RID = get_world_2d().navigation_map
    NavigationServer2D.map_force_update(map_rid)

func close() -> void:
    if not _is_open:
        return
    _is_open = false
    obstacle.vertices = _closed_vertices
    anim.play("close")
    NavigationServer2D.map_force_update(map_rid)
```

---

## 7 — Runtime Navigation Modification

Dynamically add, remove, or modify navigation regions during gameplay.

### Adding Temporary Walkable Area (Bridge Extends)

```gdscript
class_name ExtendableBridge
extends Node2D

@export var bridge_length: float = 128.0
@export var bridge_width: float = 32.0
@export var extend_speed: float = 64.0

var nav_region: NavigationRegion2D
var _current_length: float = 0.0
var _extending: bool = false

func _ready() -> void:
    nav_region = NavigationRegion2D.new()
    add_child(nav_region)
    nav_region.enabled = false  # Start retracted

func extend() -> void:
    _extending = true
    nav_region.enabled = true

func _physics_process(delta: float) -> void:
    if not _extending:
        return
    
    _current_length = minf(_current_length + extend_speed * delta, bridge_length)
    _update_nav_polygon()
    
    if _current_length >= bridge_length:
        _extending = false

func _update_nav_polygon() -> void:
    var nav_poly := NavigationPolygon.new()
    var half_w: float = bridge_width / 2.0
    
    var outline := PackedVector2Array([
        Vector2(0, -half_w),
        Vector2(_current_length, -half_w),
        Vector2(_current_length, half_w),
        Vector2(0, half_w),
    ])
    nav_poly.add_outline(outline)
    nav_poly.make_polygons_from_outlines()
    nav_region.navigation_polygon = nav_poly
```

### NavigationLink2D (Teleporters, Jump Points, Ladders)

```gdscript
class_name NavLink
extends NavigationLink2D

## Connects two disconnected navigation regions

@export var link_type: StringName = &"walk"  # walk, jump, teleport, ladder
@export var bidirectional_link: bool = true
@export var travel_cost_multiplier: float = 1.0

func _ready() -> void:
    bidirectional = bidirectional_link
    
    # Agents can check the link type to choose appropriate animation
    # Store in enter_cost or use navigation_layers to differentiate
    enter_cost = travel_cost_multiplier
    
    # Set link endpoints (relative to this node's position)
    # Usually set in the editor, but can be set in code:
    start_position = Vector2(-64, 0)  # Left side
    end_position = Vector2(64, -96)   # Right side (higher — jump up)

## Example: Agent checks link type to play correct animation
static func get_link_type(agent: NavigationAgent2D) -> StringName:
    # Check if current path segment is a navigation link
    var details: Dictionary = agent.get_current_navigation_path_owner_details()
    if details.get("type", "") == "link":
        var link_rid: RID = details.get("rid", RID())
        # You'd need to track link RID → type mapping
        # or use navigation_layers to encode link types
        pass
    return &"walk"
```

---

## 8 — AStarGrid2D for Tile Games

AStarGrid2D is purpose-built for grid-based pathfinding. Simpler, faster, and more controllable than NavigationServer2D for tile games.

### Basic Setup

```gdscript
class_name GridPathfinder
extends Node

## A* pathfinding on a 2D tile grid

var astar: AStarGrid2D

@export var grid_size: Vector2i = Vector2i(64, 64)
@export var cell_size: Vector2i = Vector2i(16, 16)
@export var diagonal_mode: AStarGrid2D.DiagonalMode = AStarGrid2D.DIAGONAL_MODE_ONLY_IF_NO_OBSTACLES

func _ready() -> void:
    astar = AStarGrid2D.new()
    astar.region = Rect2i(Vector2i.ZERO, grid_size)
    astar.cell_size = Vector2(cell_size)
    astar.default_compute_heuristic = AStarGrid2D.HEURISTIC_OCTILE
    astar.default_estimate_heuristic = AStarGrid2D.HEURISTIC_OCTILE
    astar.diagonal_mode = diagonal_mode
    astar.update()  # MUST call after configuration

func set_solid(cell: Vector2i, solid: bool) -> void:
    if astar.is_in_boundsv(cell):
        astar.set_point_solid(cell, solid)

func set_weight(cell: Vector2i, weight: float) -> void:
    ## Higher weight = less desirable to path through
    if astar.is_in_boundsv(cell):
        astar.set_point_weight_scale(cell, weight)

func get_path_cells(from_cell: Vector2i, to_cell: Vector2i) -> PackedVector2Array:
    ## Returns path in WORLD coordinates
    if not astar.is_in_boundsv(from_cell) or not astar.is_in_boundsv(to_cell):
        return PackedVector2Array()
    if astar.is_point_solid(from_cell) or astar.is_point_solid(to_cell):
        return PackedVector2Array()
    return astar.get_point_path(from_cell, to_cell)

func get_id_path(from_cell: Vector2i, to_cell: Vector2i) -> Array[Vector2i]:
    ## Returns path as grid cell coordinates
    if not astar.is_in_boundsv(from_cell) or not astar.is_in_boundsv(to_cell):
        return []
    if astar.is_point_solid(from_cell) or astar.is_point_solid(to_cell):
        return []
    return astar.get_id_path(from_cell, to_cell)

func world_to_cell(world_pos: Vector2) -> Vector2i:
    return Vector2i(
        floori(world_pos.x / cell_size.x),
        floori(world_pos.y / cell_size.y)
    )

func cell_to_world(cell: Vector2i) -> Vector2:
    return Vector2(cell * cell_size) + Vector2(cell_size) / 2.0
```

### Building from TileMapLayer

```gdscript
class_name TileGridPathfinder
extends Node

## Builds AStarGrid2D from TileMapLayer collision/custom data

@export var tile_map: TileMapLayer
@export var wall_custom_data: StringName = &"is_wall"
@export var movement_cost_data: StringName = &"movement_cost"

var pathfinder: GridPathfinder

func _ready() -> void:
    pathfinder = GridPathfinder.new()
    add_child(pathfinder)
    
    # Size grid to match tilemap bounds
    var used_rect: Rect2i = tile_map.get_used_rect()
    pathfinder.grid_size = used_rect.size
    pathfinder.cell_size = Vector2i(tile_map.tile_set.tile_size)
    pathfinder._ready()  # Reinitialize with new size
    
    # Mark solid/weighted cells
    for cell in tile_map.get_used_cells():
        var tile_data: TileData = tile_map.get_cell_tile_data(cell)
        if tile_data == null:
            pathfinder.set_solid(cell - used_rect.position, true)
            continue
        
        # Check wall custom data
        var is_wall: bool = tile_data.get_custom_data(wall_custom_data) as bool
        if is_wall:
            pathfinder.set_solid(cell - used_rect.position, true)
            continue
        
        # Apply movement cost weight
        var cost: float = tile_data.get_custom_data(movement_cost_data) as float
        if cost > 0.0:
            pathfinder.set_weight(cell - used_rect.position, cost)

func update_cell(cell: Vector2i) -> void:
    ## Call when terrain changes (destructible walls, etc.)
    var used_rect: Rect2i = tile_map.get_used_rect()
    var local_cell: Vector2i = cell - used_rect.position
    
    var tile_data: TileData = tile_map.get_cell_tile_data(cell)
    if tile_data == null:
        pathfinder.set_solid(local_cell, true)
    else:
        var is_wall: bool = tile_data.get_custom_data(wall_custom_data) as bool
        pathfinder.set_solid(local_cell, is_wall)
```

### Grid Movement with Path Following

```gdscript
class_name GridMover
extends CharacterBody2D

## Follows AStarGrid2D paths with smooth grid-cell movement

@export var move_speed: float = 100.0
@export var pathfinder_path: NodePath

@onready var pathfinder: TileGridPathfinder = get_node(pathfinder_path)

var _path: Array[Vector2i] = []
var _path_index: int = 0
var _moving: bool = false

signal arrived
signal path_blocked

func move_to_cell(target_cell: Vector2i) -> void:
    var from_cell: Vector2i = pathfinder.pathfinder.world_to_cell(global_position)
    var id_path: Array[Vector2i] = pathfinder.pathfinder.get_id_path(from_cell, target_cell)
    
    if id_path.is_empty():
        path_blocked.emit()
        return
    
    _path = id_path
    _path_index = 1  # Skip current cell
    _moving = true

func _physics_process(delta: float) -> void:
    if not _moving or _path_index >= _path.size():
        if _moving:
            _moving = false
            velocity = Vector2.ZERO
            arrived.emit()
        return
    
    var target_world: Vector2 = pathfinder.pathfinder.cell_to_world(_path[_path_index])
    var to_target: Vector2 = target_world - global_position
    
    if to_target.length() < 2.0:
        # Snap to cell center and advance
        global_position = target_world
        _path_index += 1
        return
    
    velocity = to_target.normalized() * move_speed
    move_and_slide()
```

---

## 9 — AStar2D for Custom Graphs

AStar2D handles arbitrary graph topologies — waypoint networks, platform connections, room graphs.

### Waypoint Network

```gdscript
class_name WaypointGraph
extends Node2D

## Manual waypoint-based pathfinding for non-grid worlds

var astar: AStar2D
var _point_count: int = 0
var _position_to_id: Dictionary = {}  # Vector2 → int

func _ready() -> void:
    astar = AStar2D.new()

func add_waypoint(pos: Vector2, weight: float = 1.0) -> int:
    var id: int = _point_count
    _point_count += 1
    astar.add_point(id, pos, weight)
    _position_to_id[pos] = id
    return id

func connect_waypoints(id_a: int, id_b: int, bidirectional: bool = true) -> void:
    astar.connect_points(id_a, id_b, bidirectional)

func get_path_positions(from: Vector2, to: Vector2) -> PackedVector2Array:
    var from_id: int = astar.get_closest_point(from)
    var to_id: int = astar.get_closest_point(to)
    return astar.get_point_path(from_id, to_id)

func get_nearest_waypoint(pos: Vector2) -> Vector2:
    var id: int = astar.get_closest_point(pos)
    return astar.get_point_position(id)

## Build from scene — add Marker2D children as waypoints
func build_from_markers() -> void:
    # Phase 1: Add all points
    var markers: Array[Marker2D] = []
    for child in get_children():
        if child is Marker2D:
            markers.append(child as Marker2D)
            add_waypoint(child.global_position)
    
    # Phase 2: Auto-connect points within line-of-sight
    var space: PhysicsDirectSpaceState2D = get_world_2d().direct_space_state
    for i in range(markers.size()):
        for j in range(i + 1, markers.size()):
            var query := PhysicsRayQueryParameters2D.create(
                markers[i].global_position,
                markers[j].global_position,
                1  # Collision layer for walls
            )
            var result: Dictionary = space.intersect_ray(query)
            if result.is_empty():
                # Line of sight clear — connect
                connect_waypoints(i, j)
```

### Platformer Jump Graph

```gdscript
class_name PlatformGraph
extends Node2D

## Pathfinding for platformers — nodes are platform edges, connections are jumps/walks

var astar: AStar2D
var _id_counter: int = 0

# Connection metadata — what movement type is needed
var _connection_types: Dictionary = {}  # "id_a-id_b" → StringName

func add_platform_edge(pos: Vector2) -> int:
    var id: int = _id_counter
    _id_counter += 1
    astar.add_point(id, pos)
    return id

func connect_walk(id_a: int, id_b: int) -> void:
    astar.connect_points(id_a, id_b)
    _connection_types["%d-%d" % [id_a, id_b]] = &"walk"
    _connection_types["%d-%d" % [id_b, id_a]] = &"walk"

func connect_jump(id_from: int, id_to: int, bidirectional: bool = false) -> void:
    astar.connect_points(id_from, id_to, bidirectional)
    _connection_types["%d-%d" % [id_from, id_to]] = &"jump"
    if bidirectional:
        _connection_types["%d-%d" % [id_to, id_from]] = &"jump"

func connect_fall(id_from: int, id_to: int) -> void:
    ## One-way — can fall down but not jump back up
    astar.connect_points(id_from, id_to, false)
    _connection_types["%d-%d" % [id_from, id_to]] = &"fall"

func get_connection_type(id_a: int, id_b: int) -> StringName:
    return _connection_types.get("%d-%d" % [id_a, id_b], &"walk")

func get_path_with_types(from: Vector2, to: Vector2) -> Array[Dictionary]:
    ## Returns [{position: Vector2, action: StringName}, ...]
    var from_id: int = astar.get_closest_point(from)
    var to_id: int = astar.get_closest_point(to)
    var id_path: PackedInt64Array = astar.get_id_path(from_id, to_id)
    
    var result: Array[Dictionary] = []
    for i in range(id_path.size()):
        var action: StringName = &"start"
        if i > 0:
            action = get_connection_type(id_path[i - 1], id_path[i])
        result.append({
            "position": astar.get_point_position(id_path[i]),
            "action": action,
        })
    return result
```

---

## 10 — Steering Behaviors

Steering behaviors produce smooth, natural movement by combining simple forces. Use ON TOP of pathfinding — steering follows the path, pathfinding chooses the path.

### Core Steering System

```gdscript
class_name SteeringAgent
extends CharacterBody2D

## Composable steering behaviors for smooth AI movement

@export var max_speed: float = 200.0
@export var max_force: float = 400.0  ## Limits acceleration per frame
@export var mass: float = 1.0
@export var arrive_radius: float = 100.0  ## Start slowing down
@export var arrive_stop: float = 10.0     ## Close enough to stop

var _steering_force: Vector2 = Vector2.ZERO

func _physics_process(delta: float) -> void:
    # Apply accumulated steering force
    var acceleration: Vector2 = _steering_force / mass
    velocity += acceleration * delta
    velocity = velocity.limit_length(max_speed)
    
    if velocity.length() > 1.0:
        move_and_slide()
    
    _steering_force = Vector2.ZERO

## --- Behaviors ---

func seek(target: Vector2) -> Vector2:
    var desired: Vector2 = (target - global_position).normalized() * max_speed
    var steer: Vector2 = (desired - velocity).limit_length(max_force)
    return steer

func flee(threat: Vector2) -> Vector2:
    return -seek(threat)

func arrive(target: Vector2) -> Vector2:
    var to_target: Vector2 = target - global_position
    var dist: float = to_target.length()
    
    if dist < arrive_stop:
        velocity = Vector2.ZERO
        return Vector2.ZERO
    
    # Slow down within arrive_radius
    var desired_speed: float = max_speed
    if dist < arrive_radius:
        desired_speed = max_speed * (dist / arrive_radius)
    
    var desired: Vector2 = to_target.normalized() * desired_speed
    return (desired - velocity).limit_length(max_force)

func pursue(target: Node2D) -> Vector2:
    ## Seek where the target WILL be, not where it IS
    if not is_instance_valid(target):
        return Vector2.ZERO
    
    var target_vel: Vector2 = Vector2.ZERO
    if target is CharacterBody2D:
        target_vel = (target as CharacterBody2D).velocity
    
    var dist: float = global_position.distance_to(target.global_position)
    var prediction_time: float = dist / max_speed
    var future_pos: Vector2 = target.global_position + target_vel * prediction_time
    
    return seek(future_pos)

func evade(threat: Node2D) -> Vector2:
    return -pursue(threat)

func wander(wander_radius: float = 50.0, wander_distance: float = 80.0, jitter: float = 20.0) -> Vector2:
    ## Gentle random wandering
    var wander_target := Vector2(
        randf_range(-1.0, 1.0) * jitter,
        randf_range(-1.0, 1.0) * jitter
    )
    wander_target = wander_target.normalized() * wander_radius
    
    var forward: Vector2 = velocity.normalized() if velocity.length() > 1.0 else Vector2.RIGHT
    var wander_point: Vector2 = global_position + forward * wander_distance + wander_target
    
    return seek(wander_point)

## --- Combination ---

func add_force(force: Vector2, weight: float = 1.0) -> void:
    _steering_force += force * weight
```

### Path Following with Steering

```gdscript
class_name SteeringPathFollower
extends SteeringAgent

## Follows a navigation path using steering behaviors for smooth movement

var _path: PackedVector2Array
var _path_index: int = 0
var _path_look_ahead: float = 32.0  ## How far ahead on the path to target

func set_path(path: PackedVector2Array) -> void:
    _path = path
    _path_index = 0

func follow_path() -> Vector2:
    if _path.is_empty() or _path_index >= _path.size():
        return Vector2.ZERO
    
    var target: Vector2 = _path[_path_index]
    
    # Advance to next waypoint when close enough
    if global_position.distance_to(target) < _path_look_ahead:
        _path_index += 1
        if _path_index >= _path.size():
            return arrive(target)
        target = _path[_path_index]
    
    # Arrive at final waypoint, seek intermediate ones
    if _path_index >= _path.size() - 1:
        return arrive(target)
    return seek(target)

func _physics_process(delta: float) -> void:
    add_force(follow_path())
    super._physics_process(delta)
```

---

## 11 — Obstacle Avoidance

### RVO Avoidance (Built into NavigationAgent2D)

NavigationAgent2D has Reciprocal Velocity Obstacle (RVO) avoidance built in:

```gdscript
# Enable on NavigationAgent2D
nav_agent.avoidance_enabled = true
nav_agent.radius = 16.0        # Must be >= collision shape radius
nav_agent.max_speed = 200.0     # MUST match your actual max speed
nav_agent.neighbor_distance = 500.0
nav_agent.max_neighbors = 10
nav_agent.time_horizon_agents = 1.0

# CRITICAL: Use the velocity_computed signal, not direct movement
nav_agent.velocity_computed.connect(func(safe_vel: Vector2) -> void:
    velocity = safe_vel
    move_and_slide()
)

# Set desired velocity each frame — avoidance modifies it
nav_agent.velocity = desired_direction * max_speed
```

### Raycast Avoidance (Manual, for Steering)

```gdscript
class_name RaycastAvoidance
extends Node2D

## Obstacle avoidance using raycasts — for steering-based movement

@export var ray_count: int = 5
@export var ray_length: float = 80.0
@export var ray_spread: float = PI / 3.0  ## Total spread angle
@export var avoidance_force: float = 300.0
@export var collision_mask: int = 1

func get_avoidance_force(forward: Vector2) -> Vector2:
    if forward.length() < 0.1:
        return Vector2.ZERO
    
    var space: PhysicsDirectSpaceState2D = get_world_2d().direct_space_state
    var total_force := Vector2.ZERO
    var base_angle: float = forward.angle()
    
    for i in range(ray_count):
        # Spread rays in a fan from -spread/2 to +spread/2
        var t: float = float(i) / float(ray_count - 1) if ray_count > 1 else 0.5
        var angle: float = base_angle + lerpf(-ray_spread / 2.0, ray_spread / 2.0, t)
        var ray_dir := Vector2.from_angle(angle)
        
        var query := PhysicsRayQueryParameters2D.create(
            global_position,
            global_position + ray_dir * ray_length,
            collision_mask
        )
        query.exclude = [get_parent().get_rid()] if get_parent() is PhysicsBody2D else []
        
        var result: Dictionary = space.intersect_ray(query)
        if result.is_empty():
            continue
        
        # Force perpendicular to the ray, scaled by proximity
        var hit_dist: float = global_position.distance_to(result.position)
        var urgency: float = 1.0 - (hit_dist / ray_length)
        var avoid_dir: Vector2 = (result.normal).normalized()
        total_force += avoid_dir * urgency * avoidance_force
    
    return total_force
```

### Context-Based Steering (Advanced)

```gdscript
class_name ContextSteering
extends Node2D

## Context-based steering — interest/danger maps for multi-concern movement
## Better than weighted steering for complex environments

@export var ray_count: int = 16
@export var ray_length: float = 100.0
@export var collision_mask: int = 1

var interest: PackedFloat32Array  ## How desirable each direction is
var danger: PackedFloat32Array    ## How dangerous each direction is

func _ready() -> void:
    interest = PackedFloat32Array()
    interest.resize(ray_count)
    danger = PackedFloat32Array()
    danger.resize(ray_count)

func get_direction(target: Vector2, threats: Array[Vector2] = []) -> Vector2:
    # Reset maps
    interest.fill(0.0)
    danger.fill(0.0)
    
    # Fill interest — desire to move toward target
    var to_target: Vector2 = (target - global_position).normalized()
    for i in range(ray_count):
        var angle: float = TAU * float(i) / float(ray_count)
        var ray_dir := Vector2.from_angle(angle)
        interest[i] = maxf(0.0, ray_dir.dot(to_target))
    
    # Fill danger — obstacles and threats
    var space: PhysicsDirectSpaceState2D = get_world_2d().direct_space_state
    for i in range(ray_count):
        var angle: float = TAU * float(i) / float(ray_count)
        var ray_dir := Vector2.from_angle(angle)
        
        # Raycast for physical obstacles
        var query := PhysicsRayQueryParameters2D.create(
            global_position,
            global_position + ray_dir * ray_length,
            collision_mask
        )
        var result: Dictionary = space.intersect_ray(query)
        if not result.is_empty():
            var proximity: float = 1.0 - (global_position.distance_to(result.position) / ray_length)
            danger[i] = maxf(danger[i], proximity)
        
        # Threat entities
        for threat_pos in threats:
            var to_threat: Vector2 = (threat_pos - global_position).normalized()
            var dot: float = ray_dir.dot(to_threat)
            var dist: float = global_position.distance_to(threat_pos)
            if dot > 0.5 and dist < ray_length:
                danger[i] = maxf(danger[i], dot * (1.0 - dist / ray_length))
    
    # Combine: interest minus danger
    var chosen_dir := Vector2.ZERO
    for i in range(ray_count):
        var weight: float = maxf(0.0, interest[i] - danger[i])
        var angle: float = TAU * float(i) / float(ray_count)
        chosen_dir += Vector2.from_angle(angle) * weight
    
    return chosen_dir.normalized() if chosen_dir.length() > 0.01 else Vector2.ZERO
```

---

## 12 — Flow Fields

Flow fields precompute a direction vector for every cell, pointing toward a single target. Ideal for many units heading to the same destination (TD enemies, crowd movement).

### Flow Field Generator

```gdscript
class_name FlowField
extends RefCounted

## Precomputed direction field — all cells point toward target

var grid_size: Vector2i
var cell_size: Vector2i
var cost_field: PackedInt32Array       ## Movement cost per cell (0 = impassable)
var integration_field: PackedInt32Array ## Distance to target
var flow_directions: Array[Vector2]    ## Direction per cell

const IMPASSABLE: int = 255
const MAX_COST: int = 65535

func _init(size: Vector2i, cell: Vector2i) -> void:
    grid_size = size
    cell_size = cell
    var total: int = size.x * size.y
    cost_field = PackedInt32Array()
    cost_field.resize(total)
    cost_field.fill(1)  # Default cost = 1
    integration_field = PackedInt32Array()
    integration_field.resize(total)
    flow_directions = []
    flow_directions.resize(total)

func set_cost(cell: Vector2i, cost: int) -> void:
    if _in_bounds(cell):
        cost_field[_index(cell)] = cost

func set_impassable(cell: Vector2i) -> void:
    set_cost(cell, IMPASSABLE)

func generate(target_cell: Vector2i) -> void:
    _build_integration_field(target_cell)
    _build_flow_field()

func get_direction(world_pos: Vector2) -> Vector2:
    var cell: Vector2i = Vector2i(
        floori(world_pos.x / cell_size.x),
        floori(world_pos.y / cell_size.y)
    )
    if not _in_bounds(cell):
        return Vector2.ZERO
    return flow_directions[_index(cell)]

## --- Internal ---

func _build_integration_field(target: Vector2i) -> void:
    integration_field.fill(MAX_COST)
    integration_field[_index(target)] = 0
    
    var open: Array[Vector2i] = [target]
    var neighbors := [
        Vector2i(1, 0), Vector2i(-1, 0),
        Vector2i(0, 1), Vector2i(0, -1),
    ]
    
    while not open.is_empty():
        var current: Vector2i = open.pop_front()
        var current_cost: int = integration_field[_index(current)]
        
        for offset in neighbors:
            var neighbor: Vector2i = current + offset
            if not _in_bounds(neighbor):
                continue
            
            var cell_cost: int = cost_field[_index(neighbor)]
            if cell_cost == IMPASSABLE:
                continue
            
            var new_cost: int = current_cost + cell_cost
            if new_cost < integration_field[_index(neighbor)]:
                integration_field[_index(neighbor)] = new_cost
                open.append(neighbor)

func _build_flow_field() -> void:
    var neighbors := [
        Vector2i(1, 0), Vector2i(-1, 0),
        Vector2i(0, 1), Vector2i(0, -1),
        Vector2i(1, 1), Vector2i(-1, 1),
        Vector2i(1, -1), Vector2i(-1, -1),
    ]
    
    for y in range(grid_size.y):
        for x in range(grid_size.x):
            var cell := Vector2i(x, y)
            var idx: int = _index(cell)
            
            if cost_field[idx] == IMPASSABLE:
                flow_directions[idx] = Vector2.ZERO
                continue
            
            var best_cost: int = integration_field[idx]
            var best_dir := Vector2.ZERO
            
            for offset in neighbors:
                var neighbor: Vector2i = cell + offset
                if not _in_bounds(neighbor):
                    continue
                var neighbor_cost: int = integration_field[_index(neighbor)]
                if neighbor_cost < best_cost:
                    best_cost = neighbor_cost
                    best_dir = Vector2(offset)
            
            flow_directions[idx] = best_dir.normalized()

func _index(cell: Vector2i) -> int:
    return cell.y * grid_size.x + cell.x

func _in_bounds(cell: Vector2i) -> bool:
    return cell.x >= 0 and cell.x < grid_size.x and cell.y >= 0 and cell.y < grid_size.y
```

### Tower Defense Path with Flow Field

```gdscript
class_name TDFlowFieldManager
extends Node

## Regenerates flow field when towers are placed/removed

@export var grid_size: Vector2i = Vector2i(40, 30)
@export var cell_size: Vector2i = Vector2i(16, 16)
@export var goal_cell: Vector2i = Vector2i(39, 15)

var flow_field: FlowField

signal flow_updated

func _ready() -> void:
    flow_field = FlowField.new(grid_size, cell_size)
    flow_field.generate(goal_cell)

func place_tower(cell: Vector2i) -> void:
    flow_field.set_impassable(cell)
    flow_field.generate(goal_cell)
    flow_updated.emit()

func remove_tower(cell: Vector2i) -> void:
    flow_field.set_cost(cell, 1)
    flow_field.generate(goal_cell)
    flow_updated.emit()

func can_place_tower(cell: Vector2i) -> bool:
    ## Check if placing a tower would block all paths to goal
    flow_field.set_impassable(cell)
    flow_field.generate(goal_cell)
    
    # Check if any spawn point can still reach the goal
    # (You'd check your spawn cells here)
    var spawn_cell := Vector2i(0, 15)
    var reachable: bool = flow_field.get_direction(
        Vector2(spawn_cell * cell_size)
    ).length() > 0.01
    
    if not reachable:
        # Revert — can't place tower here
        flow_field.set_cost(cell, 1)
        flow_field.generate(goal_cell)
    
    return reachable
```

### Flow Field Enemy Movement

```gdscript
class_name FlowFieldEnemy
extends CharacterBody2D

@export var speed: float = 100.0
@export var flow_manager_path: NodePath

@onready var flow_manager: TDFlowFieldManager = get_node(flow_manager_path)

func _physics_process(_delta: float) -> void:
    var direction: Vector2 = flow_manager.flow_field.get_direction(global_position)
    if direction.length() < 0.01:
        # At goal or stuck
        return
    velocity = direction * speed
    move_and_slide()
```

---

## 13 — Hierarchical Pathfinding

For large worlds, pathfind at a coarse level first (chunk → chunk), then refine within chunks.

### Two-Level Hierarchical A*

```gdscript
class_name HierarchicalPathfinder
extends Node

## Coarse chunk-level path + fine cell-level path within chunks

@export var chunk_size: Vector2i = Vector2i(16, 16)  ## Cells per chunk
@export var cell_size: Vector2i = Vector2i(16, 16)

var _chunks: Dictionary = {}  ## Vector2i → ChunkData
var _chunk_graph: AStar2D     ## Coarse graph connecting chunks
var _chunk_id_map: Dictionary = {}  ## Vector2i → int

class ChunkData:
    var position: Vector2i  ## Chunk coordinate
    var astar: AStarGrid2D  ## Local pathfinding within this chunk
    var border_cells: Array[Vector2i] = []  ## Cells on chunk borders (entry/exit)
    var walkable: bool = true  ## Is this chunk traversable at all?
    
    func _init(pos: Vector2i, chunk_sz: Vector2i, cell_sz: Vector2i) -> void:
        position = pos
        astar = AStarGrid2D.new()
        astar.region = Rect2i(Vector2i.ZERO, chunk_sz)
        astar.cell_size = Vector2(cell_sz)
        astar.diagonal_mode = AStarGrid2D.DIAGONAL_MODE_ONLY_IF_NO_OBSTACLES
        astar.update()

func _ready() -> void:
    _chunk_graph = AStar2D.new()

func add_chunk(chunk_pos: Vector2i) -> void:
    var chunk := ChunkData.new(chunk_pos, chunk_size, cell_size)
    _chunks[chunk_pos] = chunk
    
    var id: int = _chunk_id_map.size()
    _chunk_id_map[chunk_pos] = id
    _chunk_graph.add_point(id, Vector2(chunk_pos) * Vector2(chunk_size * cell_size))

func connect_chunks(a: Vector2i, b: Vector2i) -> void:
    if _chunk_id_map.has(a) and _chunk_id_map.has(b):
        _chunk_graph.connect_points(_chunk_id_map[a], _chunk_id_map[b])

func find_path(from_world: Vector2, to_world: Vector2) -> PackedVector2Array:
    var from_chunk: Vector2i = _world_to_chunk(from_world)
    var to_chunk: Vector2i = _world_to_chunk(to_world)
    
    # Same chunk — just use local A*
    if from_chunk == to_chunk and _chunks.has(from_chunk):
        return _find_local_path(from_chunk, from_world, to_world)
    
    # Different chunks — coarse path first
    if not _chunk_id_map.has(from_chunk) or not _chunk_id_map.has(to_chunk):
        return PackedVector2Array()
    
    var chunk_path: PackedInt64Array = _chunk_graph.get_id_path(
        _chunk_id_map[from_chunk],
        _chunk_id_map[to_chunk]
    )
    
    if chunk_path.is_empty():
        return PackedVector2Array()
    
    # Refine: find detailed path through each chunk
    var full_path := PackedVector2Array()
    var current_pos: Vector2 = from_world
    
    for i in range(chunk_path.size()):
        var chunk_id: int = chunk_path[i]
        var chunk_pos: Vector2i = _id_to_chunk(chunk_id)
        
        var target: Vector2
        if i < chunk_path.size() - 1:
            # Target = border between this chunk and the next
            var next_chunk: Vector2i = _id_to_chunk(chunk_path[i + 1])
            target = _get_border_point(chunk_pos, next_chunk)
        else:
            target = to_world
        
        var local: PackedVector2Array = _find_local_path(chunk_pos, current_pos, target)
        full_path.append_array(local)
        if not local.is_empty():
            current_pos = local[local.size() - 1]
    
    return full_path

func _world_to_chunk(world_pos: Vector2) -> Vector2i:
    return Vector2i(
        floori(world_pos.x / float(chunk_size.x * cell_size.x)),
        floori(world_pos.y / float(chunk_size.y * cell_size.y))
    )

func _id_to_chunk(id: int) -> Vector2i:
    for chunk_pos: Vector2i in _chunk_id_map:
        if _chunk_id_map[chunk_pos] == id:
            return chunk_pos
    return Vector2i.ZERO

func _find_local_path(chunk_pos: Vector2i, from: Vector2, to: Vector2) -> PackedVector2Array:
    if not _chunks.has(chunk_pos):
        return PackedVector2Array()
    var chunk: ChunkData = _chunks[chunk_pos]
    var offset := Vector2(chunk_pos * chunk_size * cell_size)
    var local_from := Vector2i((from - offset) / Vector2(cell_size))
    var local_to := Vector2i((to - offset) / Vector2(cell_size))
    local_from = local_from.clamp(Vector2i.ZERO, chunk_size - Vector2i.ONE)
    local_to = local_to.clamp(Vector2i.ZERO, chunk_size - Vector2i.ONE)
    return chunk.astar.get_point_path(local_from, local_to)

func _get_border_point(from_chunk: Vector2i, to_chunk: Vector2i) -> Vector2:
    var diff: Vector2i = to_chunk - from_chunk
    var border := Vector2(from_chunk * chunk_size * cell_size)
    if diff.x > 0:
        border.x += chunk_size.x * cell_size.x
    elif diff.x < 0:
        border.x -= 1.0
    if diff.y > 0:
        border.y += chunk_size.y * cell_size.y
    elif diff.y < 0:
        border.y -= 1.0
    border += Vector2(chunk_size * cell_size) / 2.0 * Vector2(absi(diff.y), absi(diff.x))
    return border
```

---

## 14 — Path Smoothing & Following

### String Pulling (Funnel Algorithm)

NavigationServer2D applies string pulling automatically when `optimize` is true. For AStarGrid2D paths, smooth manually:

```gdscript
class_name PathSmoother
extends RefCounted

## Smooths grid paths by removing unnecessary waypoints via line-of-sight

static func smooth(
    path: PackedVector2Array,
    space: PhysicsDirectSpaceState2D,
    collision_mask: int = 1
) -> PackedVector2Array:
    if path.size() <= 2:
        return path
    
    var smoothed := PackedVector2Array()
    smoothed.append(path[0])
    
    var current_index: int = 0
    
    while current_index < path.size() - 1:
        # Find the farthest visible point
        var farthest: int = current_index + 1
        
        for check in range(path.size() - 1, current_index, -1):
            if check == farthest:
                break
            
            var query := PhysicsRayQueryParameters2D.create(
                path[current_index],
                path[check],
                collision_mask
            )
            var result: Dictionary = space.intersect_ray(query)
            if result.is_empty():
                farthest = check
                break
        
        smoothed.append(path[farthest])
        current_index = farthest
    
    return smoothed
```

### Catmull-Rom Path Interpolation

```gdscript
class_name PathInterpolator
extends RefCounted

## Smooth path with Catmull-Rom spline interpolation

static func interpolate(
    path: PackedVector2Array,
    points_per_segment: int = 5
) -> PackedVector2Array:
    if path.size() < 2:
        return path
    
    var result := PackedVector2Array()
    
    for i in range(path.size() - 1):
        var p0: Vector2 = path[maxi(i - 1, 0)]
        var p1: Vector2 = path[i]
        var p2: Vector2 = path[mini(i + 1, path.size() - 1)]
        var p3: Vector2 = path[mini(i + 2, path.size() - 1)]
        
        for j in range(points_per_segment):
            var t: float = float(j) / float(points_per_segment)
            result.append(_catmull_rom(p0, p1, p2, p3, t))
    
    result.append(path[path.size() - 1])
    return result

static func _catmull_rom(p0: Vector2, p1: Vector2, p2: Vector2, p3: Vector2, t: float) -> Vector2:
    var t2: float = t * t
    var t3: float = t2 * t
    return 0.5 * (
        (2.0 * p1) +
        (-p0 + p2) * t +
        (2.0 * p0 - 5.0 * p1 + 4.0 * p2 - p3) * t2 +
        (-p0 + 3.0 * p1 - 3.0 * p2 + p3) * t3
    )
```

### Smooth Path Follower with Lookahead

```gdscript
class_name SmoothPathFollower
extends CharacterBody2D

## Follows a path with lookahead for smooth cornering

@export var speed: float = 150.0
@export var lookahead_distance: float = 40.0
@export var smoothing: float = 8.0  ## Higher = snappier turning

var _path: PackedVector2Array
var _path_progress: float = 0.0  ## Current position along path (0.0 to total_length)
var _total_length: float = 0.0
var _segment_lengths: PackedFloat32Array

signal path_completed

func set_path(path: PackedVector2Array) -> void:
    _path = path
    _path_progress = 0.0
    _calculate_lengths()

func _calculate_lengths() -> void:
    _segment_lengths = PackedFloat32Array()
    _total_length = 0.0
    for i in range(1, _path.size()):
        var length: float = _path[i - 1].distance_to(_path[i])
        _segment_lengths.append(length)
        _total_length += length

func _physics_process(delta: float) -> void:
    if _path.is_empty() or _path_progress >= _total_length:
        if not _path.is_empty():
            _path = PackedVector2Array()
            path_completed.emit()
        return
    
    # Advance progress
    _path_progress += speed * delta
    
    # Get lookahead point
    var target: Vector2 = _get_point_at_distance(
        minf(_path_progress + lookahead_distance, _total_length)
    )
    
    # Smooth steering toward lookahead
    var desired: Vector2 = (target - global_position).normalized() * speed
    velocity = velocity.lerp(desired, 1.0 - exp(-smoothing * delta))
    move_and_slide()

func _get_point_at_distance(dist: float) -> Vector2:
    var accumulated: float = 0.0
    for i in range(_segment_lengths.size()):
        if accumulated + _segment_lengths[i] >= dist:
            var t: float = (dist - accumulated) / _segment_lengths[i]
            return _path[i].lerp(_path[i + 1], t)
        accumulated += _segment_lengths[i]
    return _path[_path.size() - 1]
```

---

## 15 — Navigation Layers & Cost

Navigation layers control which agents can use which regions — essential for mixed unit types.

### Layer Architecture

```gdscript
# Recommended navigation layer setup:
# Layer 1: Ground units (default)
# Layer 2: Flying units (ignore walls, water)
# Layer 3: Water units (only water tiles)
# Layer 4: Large units (wider paths)
# Layer 5: Player only (shortcuts, secret paths)

class_name NavLayers
extends Node

const GROUND: int = 1       # Bit 0
const FLYING: int = 2       # Bit 1
const WATER: int = 4        # Bit 2
const LARGE: int = 8        # Bit 3
const PLAYER: int = 16      # Bit 4

## Apply to NavigationAgent2D
static func setup_agent(agent: NavigationAgent2D, layers: int) -> void:
    agent.navigation_layers = layers

## Apply to NavigationRegion2D
static func setup_region(region: NavigationRegion2D, layers: int) -> void:
    region.navigation_layers = layers
```

### Travel Cost by Terrain Type

```gdscript
class_name TerrainNavSetup
extends Node

## Sets up navigation regions with different travel costs per terrain type

@export var ground_region: NavigationRegion2D  ## Cost 1.0 (default)
@export var mud_region: NavigationRegion2D     ## Cost 3.0 (slow)
@export var road_region: NavigationRegion2D    ## Cost 0.5 (fast)
@export var forest_region: NavigationRegion2D  ## Cost 2.0 (medium)

func _ready() -> void:
    # enter_cost = additional cost to enter this region
    # travel_cost = multiplier on distance traveled within
    ground_region.enter_cost = 0.0
    ground_region.travel_cost = 1.0
    
    mud_region.enter_cost = 0.0
    mud_region.travel_cost = 3.0  # 3× slower to cross
    
    road_region.enter_cost = 0.0
    road_region.travel_cost = 0.5  # 2× faster
    
    forest_region.enter_cost = 1.0  # Extra cost to enter (bushwhacking)
    forest_region.travel_cost = 2.0

## AI can choose: short through mud (slow) or long around on road (fast)
## NavigationServer2D automatically picks lowest total cost
```

---

## 16 — Group & Formation Movement

### Formation Controller

```gdscript
class_name FormationController
extends Node2D

## Manages a group of units moving in formation

enum FormationType { LINE, COLUMN, WEDGE, CIRCLE, CUSTOM }

@export var formation: FormationType = FormationType.WEDGE
@export var spacing: float = 32.0

var units: Array[CharacterBody2D] = []
var _target: Vector2
var _formation_facing: Vector2 = Vector2.RIGHT

func add_unit(unit: CharacterBody2D) -> void:
    units.append(unit)

func remove_unit(unit: CharacterBody2D) -> void:
    units.erase(unit)

func move_to(target: Vector2) -> void:
    _target = target
    _formation_facing = (target - global_position).normalized()
    _assign_formation_positions()

func _assign_formation_positions() -> void:
    var positions: Array[Vector2] = _get_formation_offsets()
    
    for i in range(mini(units.size(), positions.size())):
        var world_pos: Vector2 = _target + positions[i].rotated(_formation_facing.angle())
        
        # Assign position to unit's NavigationAgent2D
        var agent: NavigationAgent2D = units[i].get_node_or_null("NavigationAgent2D")
        if agent:
            agent.target_position = world_pos

func _get_formation_offsets() -> Array[Vector2]:
    var offsets: Array[Vector2] = []
    var count: int = units.size()
    
    match formation:
        FormationType.LINE:
            # Horizontal line perpendicular to facing
            for i in range(count):
                var x: float = (float(i) - float(count - 1) / 2.0) * spacing
                offsets.append(Vector2(0, x))
        
        FormationType.COLUMN:
            # Single file behind leader
            for i in range(count):
                offsets.append(Vector2(-float(i) * spacing, 0))
        
        FormationType.WEDGE:
            # V-shape with leader at front
            offsets.append(Vector2.ZERO)  # Leader
            for i in range(1, count):
                var row: int = ceili(float(i) / 2.0)
                var side: float = 1.0 if i % 2 == 1 else -1.0
                offsets.append(Vector2(
                    -float(row) * spacing,
                    side * float(row) * spacing * 0.7
                ))
        
        FormationType.CIRCLE:
            for i in range(count):
                var angle: float = TAU * float(i) / float(count)
                var radius: float = spacing * float(count) / TAU
                offsets.append(Vector2.from_angle(angle) * radius)
    
    return offsets
```

### Crowd Flow (Simple Boid-like)

```gdscript
class_name CrowdManager
extends Node

## Simple group cohesion for many units — lighter than full formations

@export var separation_distance: float = 24.0
@export var separation_weight: float = 1.5
@export var cohesion_weight: float = 0.3
@export var alignment_weight: float = 0.5

var agents: Array[SteeringAgent] = []

func register(agent: SteeringAgent) -> void:
    agents.append(agent)

func unregister(agent: SteeringAgent) -> void:
    agents.erase(agent)

func get_crowd_force(agent: SteeringAgent) -> Vector2:
    var separation := Vector2.ZERO
    var avg_position := Vector2.ZERO
    var avg_velocity := Vector2.ZERO
    var neighbor_count: int = 0
    
    for other in agents:
        if other == agent or not is_instance_valid(other):
            continue
        
        var dist: float = agent.global_position.distance_to(other.global_position)
        if dist > separation_distance * 3.0:
            continue
        
        neighbor_count += 1
        avg_position += other.global_position
        avg_velocity += other.velocity
        
        # Separation — push away from close neighbors
        if dist < separation_distance and dist > 0.1:
            var away: Vector2 = (agent.global_position - other.global_position).normalized()
            separation += away / dist  # Stronger when closer
    
    if neighbor_count == 0:
        return Vector2.ZERO
    
    avg_position /= float(neighbor_count)
    avg_velocity /= float(neighbor_count)
    
    # Cohesion — steer toward group center
    var cohesion: Vector2 = (avg_position - agent.global_position).normalized()
    
    # Alignment — match group velocity
    var alignment: Vector2 = (avg_velocity - agent.velocity).normalized()
    
    return (
        separation * separation_weight +
        cohesion * cohesion_weight +
        alignment * alignment_weight
    )
```

---

## 17 — State Machine Integration

Connecting navigation with the state machine pattern from G2:

### AI States with Navigation

```gdscript
class_name EnemyAI
extends CharacterBody2D

## Enemy with state-driven navigation behavior

@onready var nav_agent: NavigationAgent2D = $NavigationAgent2D
@onready var detection_area: Area2D = $DetectionArea
@onready var attack_range: Area2D = $AttackRange

var state: StringName = &"idle"
var target: Node2D = null
var patrol_points: Array[Vector2] = []
var patrol_index: int = 0
var _repath_timer: float = 0.0

func _ready() -> void:
    await get_tree().physics_frame
    nav_agent.velocity_computed.connect(_on_velocity_computed)
    detection_area.body_entered.connect(_on_detected)
    detection_area.body_exited.connect(_on_lost)

func _physics_process(delta: float) -> void:
    match state:
        &"idle":
            _state_idle(delta)
        &"patrol":
            _state_patrol(delta)
        &"chase":
            _state_chase(delta)
        &"attack":
            _state_attack(delta)
        &"return":
            _state_return(delta)

func _state_idle(_delta: float) -> void:
    velocity = Vector2.ZERO
    if not patrol_points.is_empty():
        _transition(&"patrol")

func _state_patrol(_delta: float) -> void:
    if nav_agent.is_navigation_finished():
        patrol_index = (patrol_index + 1) % patrol_points.size()
        nav_agent.target_position = patrol_points[patrol_index]
    
    _move_along_path()

func _state_chase(delta: float) -> void:
    if not is_instance_valid(target):
        _transition(&"return")
        return
    
    # Check attack range
    if global_position.distance_to(target.global_position) < 40.0:
        _transition(&"attack")
        return
    
    # Repath periodically
    _repath_timer -= delta
    if _repath_timer <= 0.0:
        nav_agent.target_position = target.global_position
        _repath_timer = 0.2  # 5 Hz repath rate
    
    _move_along_path()

func _state_attack(_delta: float) -> void:
    velocity = Vector2.ZERO
    # Attack logic here — when done, transition back to chase
    if not is_instance_valid(target):
        _transition(&"return")

func _state_return(_delta: float) -> void:
    if nav_agent.is_navigation_finished():
        _transition(&"idle")
        return
    _move_along_path()

func _move_along_path() -> void:
    if nav_agent.is_navigation_finished():
        return
    var next: Vector2 = nav_agent.get_next_path_position()
    var direction: Vector2 = global_position.direction_to(next)
    nav_agent.velocity = direction * 120.0

func _on_velocity_computed(safe_velocity: Vector2) -> void:
    velocity = safe_velocity
    move_and_slide()

func _on_detected(body: Node2D) -> void:
    if body.is_in_group("player"):
        target = body
        _transition(&"chase")

func _on_lost(body: Node2D) -> void:
    if body == target:
        _transition(&"return")
        nav_agent.target_position = patrol_points[patrol_index] if not patrol_points.is_empty() else global_position

func _transition(new_state: StringName) -> void:
    state = new_state
    match new_state:
        &"return":
            if not patrol_points.is_empty():
                nav_agent.target_position = patrol_points[patrol_index]
```

---

## 18 — Debug Visualization

### Navigation Debug Overlay

```gdscript
class_name NavDebugOverlay
extends Node2D

## Draws navigation debug information — paths, agents, obstacles

@export var show_paths: bool = true
@export var show_agent_radius: bool = true
@export var show_grid_costs: bool = false
@export var grid_pathfinder: GridPathfinder  ## Optional: for AStarGrid2D visualization

func _process(_delta: float) -> void:
    if not OS.is_debug_build():
        set_process(false)
        return
    queue_redraw()

func _draw() -> void:
    if show_paths:
        _draw_agent_paths()
    if show_agent_radius:
        _draw_agent_radii()
    if show_grid_costs and grid_pathfinder:
        _draw_grid_costs()

func _draw_agent_paths() -> void:
    for agent: NavigationAgent2D in _get_all_agents():
        var path: PackedVector2Array = agent.get_current_navigation_path()
        if path.size() < 2:
            continue
        
        var owner_pos: Vector2 = agent.get_owner().global_position
        
        # Draw path line
        for i in range(path.size() - 1):
            var from_local: Vector2 = path[i] - global_position
            var to_local: Vector2 = path[i + 1] - global_position
            draw_line(from_local, to_local, Color.CYAN, 1.5)
        
        # Draw target
        var target_local: Vector2 = agent.target_position - global_position
        draw_circle(target_local, 4.0, Color.RED)

func _draw_agent_radii() -> void:
    for agent: NavigationAgent2D in _get_all_agents():
        if not agent.avoidance_enabled:
            continue
        var pos: Vector2 = agent.get_owner().global_position - global_position
        draw_arc(pos, agent.radius, 0, TAU, 32, Color(0.0, 1.0, 0.0, 0.3), 1.0)

func _draw_grid_costs() -> void:
    if grid_pathfinder == null:
        return
    var astar: AStarGrid2D = grid_pathfinder.astar
    var cell_sz: Vector2 = Vector2(grid_pathfinder.cell_size)
    
    for y in range(grid_pathfinder.grid_size.y):
        for x in range(grid_pathfinder.grid_size.x):
            var cell := Vector2i(x, y)
            if astar.is_point_solid(cell):
                var rect_pos: Vector2 = Vector2(cell) * cell_sz - global_position
                draw_rect(Rect2(rect_pos, cell_sz), Color(1, 0, 0, 0.2))
            else:
                var weight: float = astar.get_point_weight_scale(cell)
                if weight > 1.0:
                    var rect_pos: Vector2 = Vector2(cell) * cell_sz - global_position
                    var intensity: float = clampf((weight - 1.0) / 4.0, 0.0, 1.0)
                    draw_rect(Rect2(rect_pos, cell_sz), Color(1, 1, 0, intensity * 0.3))

func _get_all_agents() -> Array[NavigationAgent2D]:
    var agents: Array[NavigationAgent2D] = []
    for node in get_tree().get_nodes_in_group("nav_agents"):
        var agent: NavigationAgent2D = node.get_node_or_null("NavigationAgent2D")
        if agent:
            agents.append(agent)
    return agents
```

### Godot Built-in Navigation Debug

```gdscript
# Project Settings → Debug → Navigation:
# - Enable Edge Connections: Shows how regions connect
# - Enable Edge Lines: Shows navigation polygon outlines
# - Enable Geometry Face Color: Fills walkable areas
# - Enable Agent Paths: Shows agent current paths
# - Edge Connection Color / Geometry Face Color: Customizable

# These are ONLY visible in the editor and debug builds
# No code needed — just toggle in Project Settings

# For runtime debug toggle:
func toggle_nav_debug() -> void:
    NavigationServer2D.set_debug_enabled(
        not NavigationServer2D.get_debug_enabled()
    )
```

---

## 19 — Performance Optimization

### Path Query Batching

```gdscript
class_name PathRequestQueue
extends Node

## Batches path requests across frames to prevent spikes

@export var max_paths_per_frame: int = 3

var _queue: Array[Dictionary] = []

func request_path(
    agent: NavigationAgent2D,
    target: Vector2,
    callback: Callable
) -> void:
    _queue.append({
        "agent": agent,
        "target": target,
        "callback": callback,
    })

func _physics_process(_delta: float) -> void:
    var processed: int = 0
    while not _queue.is_empty() and processed < max_paths_per_frame:
        var request: Dictionary = _queue.pop_front()
        var agent: NavigationAgent2D = request.agent
        if not is_instance_valid(agent):
            continue
        
        agent.target_position = request.target
        
        # Get the computed path and deliver via callback
        var path: PackedVector2Array = agent.get_current_navigation_path()
        (request.callback as Callable).call(path)
        processed += 1
```

### Distance-Based LOD for Navigation

```gdscript
class_name NavLOD
extends Node

## Reduces navigation frequency for distant/offscreen agents

@export var player: Node2D
@export var high_freq_distance: float = 300.0   ## Full update rate
@export var medium_freq_distance: float = 600.0  ## Half update rate
@export var low_freq_distance: float = 1200.0    ## Quarter update rate

func get_update_interval(agent_pos: Vector2) -> float:
    if not is_instance_valid(player):
        return 1.0
    
    var dist: float = agent_pos.distance_to(player.global_position)
    
    if dist < high_freq_distance:
        return 0.1   # 10 Hz — close combat, player can see movement quality
    elif dist < medium_freq_distance:
        return 0.25  # 4 Hz — nearby, still noticeable
    elif dist < low_freq_distance:
        return 0.5   # 2 Hz — distant, path quality barely visible
    else:
        return 1.0   # 1 Hz — very far, minimal processing

func should_use_avoidance(agent_pos: Vector2) -> bool:
    ## Disable avoidance for distant agents — biggest perf win
    if not is_instance_valid(player):
        return false
    return agent_pos.distance_to(player.global_position) < medium_freq_distance
```

### Performance Budget Reference

| System | Budget (60fps) | Notes |
|--------|---------------|-------|
| NavigationServer2D path query | ~0.1ms per path | Async available, use it |
| AStarGrid2D (64×64 grid) | ~0.05ms per path | Very fast for grids |
| AStarGrid2D (256×256 grid) | ~0.5ms per path | Consider hierarchical |
| Flow field generation (64×64) | ~0.3ms | Regenerate only when terrain changes |
| Flow field generation (256×256) | ~5ms | Spread across frames |
| RVO avoidance (50 agents) | ~0.5ms total | Scales linearly |
| RVO avoidance (200 agents) | ~2ms total | Consider disabling for distant |
| Context steering (16 rays) | ~0.1ms per agent | Includes raycasts |
| Path smoothing (raycast) | ~0.2ms per path | Depends on path length |

---

## 20 — Common Mistakes & Fixes

### ❌ Querying navigation on the first frame

```gdscript
# WRONG — navigation map isn't synced yet on _ready
func _ready() -> void:
    nav_agent.target_position = target.global_position
    # Path will be empty!

# RIGHT — wait one physics frame
func _ready() -> void:
    await get_tree().physics_frame
    nav_agent.target_position = target.global_position
```

### ❌ Recalculating paths every frame

```gdscript
# WRONG — expensive and unnecessary
func _physics_process(_delta: float) -> void:
    nav_agent.target_position = target.global_position  # Every frame!

# RIGHT — repath on a timer or when target moves significantly
var _repath_timer: float = 0.0
func _physics_process(delta: float) -> void:
    _repath_timer -= delta
    if _repath_timer <= 0.0:
        nav_agent.target_position = target.global_position
        _repath_timer = 0.25
```

### ❌ Moving with position instead of velocity (breaks avoidance)

```gdscript
# WRONG — bypasses RVO avoidance entirely
func _physics_process(_delta: float) -> void:
    var next: Vector2 = nav_agent.get_next_path_position()
    global_position = global_position.move_toward(next, speed * _delta)

# RIGHT — set velocity, let avoidance compute safe velocity
func _physics_process(_delta: float) -> void:
    var next: Vector2 = nav_agent.get_next_path_position()
    nav_agent.velocity = global_position.direction_to(next) * speed
    # Movement happens in _on_velocity_computed callback
```

### ❌ Mismatched avoidance radius and collision shape

```gdscript
# WRONG — avoidance radius smaller than collision = agents clip into each other
nav_agent.radius = 8.0   # Avoidance thinks agent is small
# But collision shape radius is 16.0

# RIGHT — avoidance radius >= collision radius
nav_agent.radius = 18.0  # Slightly larger than collision (16.0)
```

### ❌ Not calling `astar.update()` after configuration

```gdscript
# WRONG — grid isn't built
var astar := AStarGrid2D.new()
astar.region = Rect2i(Vector2i.ZERO, Vector2i(64, 64))
astar.cell_size = Vector2(16, 16)
# Forgot astar.update()!
var path = astar.get_point_path(Vector2i.ZERO, Vector2i(10, 10))  # Empty!

# RIGHT — always call update() after setup or region change
astar.update()
var path = astar.get_point_path(Vector2i.ZERO, Vector2i(10, 10))  # Works
```

### ❌ Navigation link endpoints not on the navmesh

```gdscript
# WRONG — link endpoints float in space, agents can't reach them
# NavigationLink2D start/end must be ON or very close to a NavigationRegion2D

# RIGHT — ensure endpoints overlap with navigation polygons
# Use the editor to snap link endpoints to navigation region edges
# Or verify programmatically:
func _ready() -> void:
    var map_rid: RID = get_world_2d().navigation_map
    var closest: Vector2 = NavigationServer2D.map_get_closest_point(
        map_rid, start_position
    )
    if closest.distance_to(start_position) > 16.0:
        push_warning("NavLink start point is far from navmesh!")
```

### ❌ Forgetting to handle unreachable targets

```gdscript
# WRONG — assumes path always exists
func chase(target_pos: Vector2) -> void:
    nav_agent.target_position = target_pos
    # What if target is in an unwalkable area?

# RIGHT — check if navigation is possible
func chase(target_pos: Vector2) -> void:
    nav_agent.target_position = target_pos
    
    # Wait a frame for path computation
    await get_tree().physics_frame
    
    if nav_agent.is_navigation_finished() and \
       global_position.distance_to(target_pos) > nav_agent.target_desired_distance:
        # Can't reach target — fall back to direct approach or give up
        _transition(&"return")
```

---

## 21 — Tuning Reference Tables

### Path Update Frequency by Genre

| Genre | Repath Rate | Avoidance | Notes |
|-------|------------|-----------|-------|
| **Platformer** | 0.5s or event-based | Off | Usually waypoint graph, not navmesh |
| **Top-down action** | 0.2s | On (16 radius) | Fast-paced, needs responsive paths |
| **Tower Defense** | On tower change only | Off (flow field) | Flow field regeneration, not per-agent |
| **RTS** | 0.25s (selected), 0.5s (idle) | On (formation) | Group-aware, formation-preserving |
| **Stealth** | 0.1s (alert), 1.0s (patrol) | On | Alert state needs fast response |
| **RPG** | 0.5s (combat), 1.0s (explore) | On (12 radius) | Context-dependent update rate |
| **Puzzle** | On move command only | Off | Turn-based, no continuous pathing |

### Navigation System Selection

| World Type | Recommended System | Reason |
|-----------|-------------------|--------|
| Tile grid, grid movement | AStarGrid2D | Native grid support, fast |
| Tile grid, free movement | NavigationServer2D + TileMap nav | Polygon paths for smooth movement |
| Hand-placed levels | NavigationServer2D + NavigationRegion2D | Polygon navmesh, editor-friendly |
| Platformer | AStar2D (custom graph) | Jump/fall connections |
| Open world (chunks) | Hierarchical + NavigationServer2D | Coarse then fine |
| TD with mazing | Flow field | Many units, single target, tower changes |
| Indoor/outdoor mix | Multiple NavigationRegion2D + links | Regions per room, links for doors |

### Steering Behavior Weights by Game Type

| Game Type | Seek | Arrive | Separation | Cohesion | Alignment |
|-----------|------|--------|------------|----------|-----------|
| **Action RPG enemies** | 1.0 | 0.8 | 1.5 | 0.2 | 0.3 |
| **RTS units** | 0.8 | 0.6 | 1.2 | 0.8 | 0.8 |
| **Crowd simulation** | 0.3 | 0.5 | 2.0 | 1.0 | 0.8 |
| **Boss minions** | 1.2 | 0.0 | 0.5 | 0.0 | 0.0 |
| **Flock/swarm** | 0.5 | 0.0 | 1.0 | 1.5 | 1.5 |
| **Escort NPC** | 0.0 | 1.0 | 1.0 | 0.0 | 0.0 |

### Agent Count Performance Targets

| Agent Count | System | Budget @ 60fps | Notes |
|-------------|--------|-----------------|-------|
| 1–20 | NavigationServer2D | <1ms total | Use avoidance freely |
| 20–50 | NavigationServer2D | <2ms total | Stagger repath intervals |
| 50–100 | NavigationServer2D + LOD | <3ms total | Disable avoidance for distant |
| 100–500 | Flow field + steering | <4ms total | No per-agent pathfinding |
| 500+ | Flow field + spatial hash | <5ms total | Minimal per-agent logic |

---

## Related Guides

- [G2 State Machine](./G2_state_machine.md) — FSM patterns for AI states (idle → patrol → chase → attack)
- [G3 Signal Architecture](./G3_signal_architecture.md) — Signal bus for nav events (path_blocked, arrived)
- [G5 Physics & Collision](./G5_physics_and_collision.md) — Collision layers, raycasting for line-of-sight
- [G7 TileMap & Terrain](./G7_tilemap_and_terrain.md) — TileMapLayer navigation setup, AStarGrid2D integration
- [G13 Networking & Multiplayer](./G13_networking_and_multiplayer.md) — Syncing AI movement in multiplayer
- [Pathfinding Theory](../../core/concepts/pathfinding-theory.md) — Engine-agnostic A*, JPS, flow fields
- [AI Theory](../../core/concepts/ai-theory.md) — Behavior trees, GOAP, steering foundations
- [G1 Scene Composition](./G1_scene_composition.md) — Composing navigation-aware entities
- [godot-rules.md](../godot-rules.md) — Godot 4.4+ coding standards
