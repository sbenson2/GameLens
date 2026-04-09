# G113 — NavigationServer3D & 3D Pathfinding

> **Category:** guide · **Engine:** Godot 4.x · **Related:** [G14 Navigation & Pathfinding (2D)](./G14_navigation_and_pathfinding.md) · [G5 Physics & Collision](./G5_physics_and_collision.md) · [G25 AI Behavior Trees](./G25_ai_behavior_trees.md) · [G24 Terrain & Open World](./G24_terrain_and_open_world.md) · [G41 Godot 4.4–4.6 Features](./G41_godot_44_to_46_features.md)

Complete guide to 3D navigation in Godot 4.4+. Covers NavigationServer3D architecture, NavigationRegion3D setup, NavigationMesh baking, NavigationAgent3D for pathfinding and avoidance, NavigationObstacle3D, runtime navmesh modification, navigation layers, async map synchronization (4.4+), and performance optimization for large 3D worlds. All examples use GDScript and C#.

---

## Table of Contents

1. [NavigationServer3D Architecture](#1-navigationserver3d-architecture)
2. [NavigationRegion3D & Mesh Baking](#2-navigationregion3d--mesh-baking)
3. [NavigationMesh Configuration](#3-navigationmesh-configuration)
4. [NavigationAgent3D — Pathfinding](#4-navigationagent3d--pathfinding)
5. [NavigationAgent3D — Avoidance (RVO)](#5-navigationagent3d--avoidance-rvo)
6. [NavigationObstacle3D](#6-navigationobstacle3d)
7. [Navigation Layers & Cost](#7-navigation-layers--cost)
8. [Runtime NavMesh Modification](#8-runtime-navmesh-modification)
9. [Async Map Synchronization (4.4+)](#9-async-map-synchronization-44)
10. [Direct NavigationServer3D API](#10-direct-navigationserver3d-api)
11. [Large World Navigation](#11-large-world-navigation)
12. [Integration with AI Systems](#12-integration-with-ai-systems)
13. [Debug Visualization](#13-debug-visualization)
14. [Performance Optimization](#14-performance-optimization)
15. [Common Mistakes & Fixes](#15-common-mistakes--fixes)

---

## 1. NavigationServer3D Architecture

Godot's 3D navigation runs on a dedicated **NavigationServer3D** singleton, separate from the physics engine. The server manages:

```
NavigationServer3D
├── Maps (one per world/scenario, created automatically)
│   ├── Regions (NavigationRegion3D nodes → navmesh data)
│   ├── Links (NavigationLink3D → connect disjoint regions)
│   ├── Agents (NavigationAgent3D → pathfinding + avoidance)
│   └── Obstacles (NavigationObstacle3D → dynamic blockers)
```

**Key concepts:**
- **Map** — A navigation world. Each Godot `World3D` gets one map automatically. Agents, regions, and obstacles register to a map.
- **Region** — A baked navigation mesh covering part of the world. Multiple regions can overlap; the server merges them.
- **Agent** — An entity that queries paths and participates in RVO avoidance.
- **Link** — A one-way or two-way connection between two points on different navmesh regions (jump points, teleporters, ladders).
- **Obstacle** — A dynamic shape that agents avoid (does NOT carve the navmesh).

---

## 2. NavigationRegion3D & Mesh Baking

### Basic Setup (Editor)

1. Add a `NavigationRegion3D` as a child of your level geometry.
2. Create a new `NavigationMesh` resource on the region's `navigation_mesh` property.
3. Configure agent parameters (radius, height) on the NavigationMesh.
4. Click **Bake NavMesh** in the editor toolbar.

### GDScript — Runtime Baking

```gdscript
func bake_navigation() -> void:
    var region := NavigationRegion3D.new()
    add_child(region)

    var navmesh := NavigationMesh.new()

    # Agent parameters — must match the characters that will use this mesh
    navmesh.agent_radius = 0.5
    navmesh.agent_height = 1.8
    navmesh.agent_max_climb = 0.3    # Max step height
    navmesh.agent_max_slope = 45.0   # Max walkable slope in degrees

    # Geometry parsing
    navmesh.geometry_parsed_geometry_type = NavigationMesh.PARSED_GEOMETRY_STATIC_COLLIDERS
    navmesh.geometry_source_geometry_mode = NavigationMesh.SOURCE_GEOMETRY_ROOT_NODE_CHILDREN

    region.navigation_mesh = navmesh
    region.bake_navigation_mesh()  # Synchronous bake

    # Listen for completion
    region.bake_finished.connect(_on_bake_finished)

func _on_bake_finished() -> void:
    print("NavMesh baking complete")
```

### C#

```csharp
public void BakeNavigation()
{
    var region = new NavigationRegion3D();
    AddChild(region);

    var navmesh = new NavigationMesh();
    navmesh.AgentRadius = 0.5f;
    navmesh.AgentHeight = 1.8f;
    navmesh.AgentMaxClimb = 0.3f;
    navmesh.AgentMaxSlope = 45.0f;
    navmesh.GeometryParsedGeometryType = NavigationMesh.ParsedGeometryType.StaticColliders;
    navmesh.GeometrySourceGeometryMode = NavigationMesh.SourceGeometryMode.RootNodeChildren;

    region.NavigationMesh = navmesh;
    region.BakeNavigationMesh();
    region.BakeFinished += OnBakeFinished;
}

private void OnBakeFinished()
{
    GD.Print("NavMesh baking complete");
}
```

### Async Baking (Background Thread)

For large meshes, use the NavigationServer3D API directly to bake in a background thread without blocking the main thread:

```gdscript
func bake_async() -> void:
    var navmesh := NavigationMesh.new()
    navmesh.agent_radius = 0.5
    navmesh.agent_height = 1.8

    var source_geometry := NavigationMeshSourceGeometryData3D.new()

    # Parse geometry from the scene tree
    NavigationServer3D.parse_source_geometry_data(
        navmesh, source_geometry, get_node("/root/Level")
    )

    # Bake asynchronously — does not block the main thread
    NavigationServer3D.bake_from_source_geometry_data_async(
        navmesh, source_geometry
    )

    # Poll or await completion, then assign to a region
    # The navmesh is modified in-place when baking completes
```

---

## 3. NavigationMesh Configuration

### Parsed Geometry Types

| Mode | What It Reads | Use Case |
|------|---------------|----------|
| `PARSED_GEOMETRY_MESH_INSTANCES` | Visual meshes (MeshInstance3D) | When collision shapes don't match walkable surfaces |
| `PARSED_GEOMETRY_STATIC_COLLIDERS` | Static physics bodies | Most games — collision shapes define walkable area |
| `PARSED_GEOMETRY_BOTH` | Meshes + colliders | When you need both visual and physics data |

### Source Geometry Mode

| Mode | Description |
|------|-------------|
| `SOURCE_GEOMETRY_ROOT_NODE_CHILDREN` | Parse all children of the region's parent |
| `SOURCE_GEOMETRY_GROUPS_WITH_CHILDREN` | Only parse nodes in a specific group |
| `SOURCE_GEOMETRY_GROUPS_EXPLICIT` | Only parse nodes explicitly in the group (no children) |

### Cell Size and Detail

```gdscript
navmesh.cell_size = 0.25       # XZ grid resolution (smaller = more accurate, slower)
navmesh.cell_height = 0.2      # Y resolution
navmesh.region_min_size = 8.0  # Discard navmesh islands smaller than this (in cells)
navmesh.edge_max_length = 0.0  # Max polygon edge length (0 = no limit)
navmesh.edge_max_error = 1.3   # How much polygon edges can deviate from source geometry
navmesh.detail_sample_distance = 6.0  # Detail mesh sampling distance
navmesh.detail_sample_max_error = 1.0 # Detail mesh max height error
```

**Rule of thumb:** `cell_size` should be roughly 1/4 to 1/2 of the smallest agent radius. A 0.5m agent works well with `cell_size = 0.15` to `0.25`.

---

## 4. NavigationAgent3D — Pathfinding

NavigationAgent3D is a helper node that wraps NavigationServer3D path queries and provides path-following behavior.

### GDScript

```gdscript
extends CharacterBody3D

@export var movement_speed: float = 4.0
@onready var nav_agent: NavigationAgent3D = $NavigationAgent3D

func _ready() -> void:
    # Wait one frame for navigation map to sync
    await get_tree().physics_frame

    nav_agent.path_desired_distance = 0.5   # How close to a waypoint before advancing
    nav_agent.target_desired_distance = 0.5 # How close to target to consider "arrived"
    nav_agent.path_max_distance = 2.0       # Recompute path if agent drifts this far off

    # Signal when velocity is computed (used with avoidance)
    nav_agent.velocity_computed.connect(_on_velocity_computed)

func set_target(target_pos: Vector3) -> void:
    nav_agent.target_position = target_pos

func _physics_process(delta: float) -> void:
    if nav_agent.is_navigation_finished():
        return

    var next_pos: Vector3 = nav_agent.get_next_path_position()
    var direction: Vector3 = global_position.direction_to(next_pos)

    velocity = direction * movement_speed
    move_and_slide()

func _on_velocity_computed(safe_velocity: Vector3) -> void:
    velocity = safe_velocity
    move_and_slide()
```

### C#

```csharp
using Godot;

public partial class NavEnemy : CharacterBody3D
{
    [Export] public float MovementSpeed { get; set; } = 4.0f;
    private NavigationAgent3D _navAgent;

    public override void _Ready()
    {
        _navAgent = GetNode<NavigationAgent3D>("NavigationAgent3D");
        _navAgent.PathDesiredDistance = 0.5f;
        _navAgent.TargetDesiredDistance = 0.5f;
        _navAgent.PathMaxDistance = 2.0f;
        _navAgent.VelocityComputed += OnVelocityComputed;
    }

    public void SetTarget(Vector3 targetPos)
    {
        _navAgent.TargetPosition = targetPos;
    }

    public override void _PhysicsProcess(double delta)
    {
        if (_navAgent.IsNavigationFinished())
            return;

        Vector3 nextPos = _navAgent.GetNextPathPosition();
        Vector3 direction = GlobalPosition.DirectionTo(nextPos);
        Velocity = direction * MovementSpeed;
        MoveAndSlide();
    }

    private void OnVelocityComputed(Vector3 safeVelocity)
    {
        Velocity = safeVelocity;
        MoveAndSlide();
    }
}
```

### Key Agent Properties

| Property | Default | Description |
|----------|---------|-------------|
| `target_position` | — | Destination to navigate toward |
| `path_desired_distance` | 1.0 | Waypoint arrival distance |
| `target_desired_distance` | 1.0 | Final target arrival distance |
| `path_max_distance` | 3.0 | Max drift before path requery |
| `navigation_layers` | 1 | Bitmask for which navmesh layers to use |
| `path_postprocessing` | CORRIDORFUNNEL | Smoothing: `CORRIDORFUNNEL` (smooth) or `EDGECENTERED` (waypoint-based) |

---

## 5. NavigationAgent3D — Avoidance (RVO)

The avoidance system uses **Reciprocal Velocity Obstacles (RVO)** to compute "safe velocities" that steer agents around each other without explicit collision.

### Enabling Avoidance

```gdscript
nav_agent.avoidance_enabled = true
nav_agent.radius = 0.5                # Agent collision radius for avoidance
nav_agent.height = 1.8                # Avoidance cylinder height
nav_agent.max_speed = 5.0             # Maximum speed (avoidance clamps to this)
nav_agent.neighbor_distance = 10.0    # How far to look for other agents
nav_agent.max_neighbors = 10          # Max agents to consider
nav_agent.time_horizon_agents = 1.0   # Look-ahead time for agent avoidance
nav_agent.time_horizon_obstacles = 0.5 # Look-ahead time for obstacle avoidance
nav_agent.avoidance_priority = 0.5    # 0.0 = highest priority, 1.0 = lowest
```

### Avoidance-Aware Movement

When avoidance is enabled, don't apply velocity directly. Instead, set the agent's velocity and wait for the computed safe velocity:

```gdscript
func _physics_process(delta: float) -> void:
    if nav_agent.is_navigation_finished():
        return

    var next_pos := nav_agent.get_next_path_position()
    var direction := global_position.direction_to(next_pos)
    var desired_velocity := direction * movement_speed

    # Submit desired velocity to avoidance system
    nav_agent.velocity = desired_velocity
    # Actual movement happens in _on_velocity_computed callback

func _on_velocity_computed(safe_velocity: Vector3) -> void:
    velocity = safe_velocity
    move_and_slide()
```

### Avoidance Layers and Masks

Agents can be placed on avoidance layers and set to only avoid agents on specific masks. This lets you create groups (e.g., friendly units ignore each other but avoid enemies):

```gdscript
# Friendly NPCs — layer 1
friendly_agent.avoidance_layers = 1
friendly_agent.avoidance_mask = 2  # Only avoid enemies

# Enemy NPCs — layer 2
enemy_agent.avoidance_layers = 2
enemy_agent.avoidance_mask = 1  # Only avoid friendlies
```

---

## 6. NavigationObstacle3D

Obstacles are dynamic shapes that agents avoid using RVO. They do **not** carve the navmesh — they participate in the avoidance simulation.

```gdscript
var obstacle := NavigationObstacle3D.new()
obstacle.radius = 1.0            # Avoidance radius
obstacle.height = 2.0            # Avoidance height
obstacle.avoidance_enabled = true
obstacle.avoidance_layers = 1    # Which layers this obstacle blocks

# For static obstacles that should affect pathfinding, define vertices:
obstacle.vertices = PackedVector3Array([
    Vector3(-1, 0, -1),
    Vector3( 1, 0, -1),
    Vector3( 1, 0,  1),
    Vector3(-1, 0,  1),
])
# When vertices are set and affect_navigation_mesh = true, the obstacle
# acts as a navmesh cutout (requires a navmesh rebake to take effect).
obstacle.affect_navigation_mesh = true
```

```csharp
var obstacle = new NavigationObstacle3D();
obstacle.Radius = 1.0f;
obstacle.Height = 2.0f;
obstacle.AvoidanceEnabled = true;
obstacle.AvoidanceLayers = 1;
```

**Important distinction:** `radius` + RVO avoidance = runtime soft avoidance (agents steer around). `vertices` + `affect_navigation_mesh` = hard navmesh cutout (requires rebake, blocks pathfinding).

---

## 7. Navigation Layers & Cost

Navigation layers control which regions agents can traverse. Each `NavigationRegion3D` has a `navigation_layers` bitmask, and each `NavigationAgent3D` has a matching bitmask.

```gdscript
# Ground walkable by everyone — layer 1
ground_region.navigation_layers = 1

# Water — layer 2 (only amphibious units)
water_region.navigation_layers = 2

# Restricted area — layer 3 (only authorized NPCs)
restricted_region.navigation_layers = 4  # Bit 3

# Agent that can walk ground + water
amphibious_agent.navigation_layers = 3  # Bits 1 + 2

# Agent that can only walk ground
land_agent.navigation_layers = 1  # Bit 1 only
```

### Travel Cost

Each region has an `enter_cost` and `travel_cost` that influence pathfinding:

```gdscript
# Swamp region — expensive to traverse
swamp_region.enter_cost = 2.0   # One-time penalty to enter this region
swamp_region.travel_cost = 3.0  # Multiplier on distance traveled within

# Road region — cheap to traverse
road_region.enter_cost = 0.0
road_region.travel_cost = 0.5   # Effectively halves the path cost
```

Agents will prefer low-cost routes. A longer road path may be chosen over a shorter swamp path if the total cost is lower.

---

## 8. Runtime NavMesh Modification

### NavigationLink3D — Connecting Disjoint Regions

Links bridge gaps between navmesh regions (jump pads, ladders, teleporters):

```gdscript
var link := NavigationLink3D.new()
link.start_position = Vector3(0, 0, 0)    # Local space
link.end_position = Vector3(0, 5, 3)      # Where the link leads
link.bidirectional = false                  # One-way (jump up only)
link.navigation_layers = 1
link.enter_cost = 1.0
link.travel_cost = 1.0
add_child(link)
```

### Dynamic Region Enable/Disable

Toggle regions at runtime for doors, bridges, destructible terrain:

```gdscript
func open_door() -> void:
    $DoorNavRegion.enabled = true   # Agents can now path through
    # Map updates on the next navigation sync frame

func close_door() -> void:
    $DoorNavRegion.enabled = false  # Agents will route around
```

### Rebaking at Runtime

For procedural levels or destructible environments:

```gdscript
func rebuild_navmesh_for_chunk(chunk: Node3D) -> void:
    var region: NavigationRegion3D = chunk.get_node("NavRegion")
    region.bake_navigation_mesh()
    # bake_finished signal fires when complete
```

---

## 9. Async Map Synchronization (4.4+)

Godot 4.4 introduced **asynchronous navigation map synchronization**, moving the map update from the main thread to a background thread. This reduces framerate hitches when regions are added, removed, or modified.

The async sync is automatic — no code changes required. The server queues map updates and processes them in a background thread. Agents receive updated paths on the next physics frame after sync completes.

**What this means in practice:**
- Adding/removing `NavigationRegion3D` nodes no longer causes frame spikes.
- Runtime navmesh rebaking is smoother.
- There may be a 1-frame delay between a region change and agents recognizing the new topology.

To check if a map is currently syncing:

```gdscript
var map_rid := get_world_3d().navigation_map
var is_syncing := not NavigationServer3D.map_get_use_async(map_rid)
```

---

## 10. Direct NavigationServer3D API

For advanced use cases (custom agent systems, server-authoritative multiplayer), bypass the helper nodes and use the server API directly:

```gdscript
func _ready() -> void:
    var map_rid := get_world_3d().navigation_map

    # Query a path directly
    var path: PackedVector3Array = NavigationServer3D.map_get_path(
        map_rid,
        global_position,           # Start
        target_position,           # End
        true,                      # Optimize (corridor funnel)
        1                          # Navigation layers bitmask
    )

    for point in path:
        print(point)

func create_server_agent() -> RID:
    var map_rid := get_world_3d().navigation_map

    # Create an agent directly on the server
    var agent_rid := NavigationServer3D.agent_create()
    NavigationServer3D.agent_set_map(agent_rid, map_rid)
    NavigationServer3D.agent_set_radius(agent_rid, 0.5)
    NavigationServer3D.agent_set_height(agent_rid, 1.8)
    NavigationServer3D.agent_set_max_speed(agent_rid, 5.0)
    NavigationServer3D.agent_set_avoidance_enabled(agent_rid, true)

    # Set avoidance callback
    NavigationServer3D.agent_set_avoidance_callback(
        agent_rid, Callable(self, "_on_agent_velocity_computed")
    )

    return agent_rid

func _on_agent_velocity_computed(safe_velocity: Vector3) -> void:
    velocity = safe_velocity
```

### C#

```csharp
public void QueryPath(Vector3 start, Vector3 end)
{
    var mapRid = GetWorld3D().NavigationMap;
    Vector3[] path = NavigationServer3D.MapGetPath(
        mapRid, start, end, true, 1
    );

    foreach (Vector3 point in path)
        GD.Print(point);
}
```

---

## 11. Large World Navigation

### Multi-Region Approach

For large open worlds, split the navmesh into chunks. Each chunk gets its own `NavigationRegion3D`. The server automatically merges overlapping edges.

```gdscript
const CHUNK_SIZE := 64.0
const OVERLAP := 2.0  # Overlap ensures edge merging

func create_chunk_region(chunk_x: int, chunk_z: int) -> NavigationRegion3D:
    var region := NavigationRegion3D.new()
    region.position = Vector3(chunk_x * CHUNK_SIZE, 0, chunk_z * CHUNK_SIZE)

    var navmesh := NavigationMesh.new()
    navmesh.agent_radius = 0.5
    navmesh.agent_height = 1.8

    # Filter baking to this chunk's area plus overlap
    navmesh.filter_baking_aabb = AABB(
        Vector3(-OVERLAP, -10, -OVERLAP),
        Vector3(CHUNK_SIZE + OVERLAP * 2, 100, CHUNK_SIZE + OVERLAP * 2)
    )

    region.navigation_mesh = navmesh
    return region
```

### LOD for Navigation

Only bake and load navigation for chunks near the player:

```gdscript
var loaded_nav_chunks: Dictionary[Vector2i, NavigationRegion3D] = {}

func update_nav_chunks(player_pos: Vector3) -> void:
    var player_chunk := Vector2i(
        int(player_pos.x / CHUNK_SIZE),
        int(player_pos.z / CHUNK_SIZE)
    )

    # Load chunks in a 3×3 grid around the player
    for x in range(player_chunk.x - 1, player_chunk.x + 2):
        for z in range(player_chunk.y - 1, player_chunk.y + 2):
            var key := Vector2i(x, z)
            if key not in loaded_nav_chunks:
                var region := create_chunk_region(x, z)
                add_child(region)
                region.bake_navigation_mesh()
                loaded_nav_chunks[key] = region

    # Unload distant chunks
    for key in loaded_nav_chunks.keys():
        if abs(key.x - player_chunk.x) > 2 or abs(key.y - player_chunk.y) > 2:
            loaded_nav_chunks[key].queue_free()
            loaded_nav_chunks.erase(key)
```

---

## 12. Integration with AI Systems

### With State Machines (see G2)

```gdscript
# In the Chase state:
func enter(enemy: CharacterBody3D) -> void:
    var nav_agent: NavigationAgent3D = enemy.get_node("NavigationAgent3D")
    nav_agent.target_position = player.global_position

func physics_update(enemy: CharacterBody3D, delta: float) -> State:
    var nav_agent: NavigationAgent3D = enemy.get_node("NavigationAgent3D")

    if nav_agent.is_navigation_finished():
        return attack_state

    # Update target periodically (not every frame — expensive)
    if Engine.get_physics_frames() % 15 == 0:
        nav_agent.target_position = player.global_position

    var next_pos := nav_agent.get_next_path_position()
    var direction := enemy.global_position.direction_to(next_pos)
    enemy.velocity = direction * chase_speed
    enemy.move_and_slide()
    return self
```

### With Behavior Trees (see G25)

```gdscript
# Behavior tree action: NavigateTo
func tick(blackboard: Dictionary) -> int:
    var agent: NavigationAgent3D = blackboard["nav_agent"]
    var target: Vector3 = blackboard["target_position"]

    agent.target_position = target

    if agent.is_navigation_finished():
        return SUCCESS

    if not agent.is_target_reachable():
        return FAILURE

    var next := agent.get_next_path_position()
    var dir := blackboard["owner"].global_position.direction_to(next)
    blackboard["owner"].velocity = dir * blackboard["speed"]
    blackboard["owner"].move_and_slide()
    return RUNNING
```

---

## 13. Debug Visualization

### Editor Debug

In **Project Settings → Debug → Navigation**, enable:
- **Enable Navigation Debug** — shows navmesh polygons
- **Enable Edge Connections Debug** — shows merged edges between regions
- **Enable Agent Debug** — shows agent radius and avoidance radius

### Runtime Debug Drawing

```gdscript
func _process(_delta: float) -> void:
    if OS.is_debug_build():
        # Draw the current path
        var path := nav_agent.get_current_navigation_path()
        for i in range(path.size() - 1):
            DebugDraw3D.draw_line(path[i], path[i + 1], Color.YELLOW)

        # Draw target
        DebugDraw3D.draw_sphere(nav_agent.target_position, 0.3, Color.RED)
```

> **Note:** `DebugDraw3D` is not built-in. Use the popular [debug-draw-3d](https://github.com/DmitriySalnikov/godot_debug_draw_3d) addon, or draw with `ImmediateMesh` for a dependency-free solution.

---

## 14. Performance Optimization

### Baking Performance

| Parameter | Impact | Recommendation |
|-----------|--------|----------------|
| `cell_size` | Smaller = exponentially more cells | 0.15–0.3 for most games |
| `cell_height` | Smaller = more vertical detail | 0.1–0.25 |
| `region_min_size` | Larger = removes more tiny islands | 8–20 |
| Geometry type | `STATIC_COLLIDERS` is faster than `MESH_INSTANCES` | Use colliders when possible |

### Runtime Performance

1. **Don't query paths every frame.** Update `target_position` every 10–30 physics frames, or only when the target moves significantly.
2. **Limit avoidance neighbors.** `max_neighbors = 5` is enough for most games. More neighbors = more RVO computation.
3. **Use navigation layers** to exclude unnecessary regions from path queries.
4. **Stagger agent updates.** If you have 100 agents, update 10 per frame:

```gdscript
var all_agents: Array[NavigationAgent3D] = []
var update_index: int = 0
const AGENTS_PER_FRAME: int = 10

func _physics_process(_delta: float) -> void:
    for i in range(AGENTS_PER_FRAME):
        var idx := (update_index + i) % all_agents.size()
        all_agents[idx].target_position = player.global_position
    update_index = (update_index + AGENTS_PER_FRAME) % all_agents.size()
```

5. **Pre-bake navmeshes.** Save baked `NavigationMesh` resources as `.tres` files and load them at runtime instead of re-baking.

---

## 15. Common Mistakes & Fixes

| Mistake | Symptom | Fix |
|---------|---------|-----|
| Agent not pathing | `is_target_reachable()` returns false | Ensure target is on the navmesh. Check navigation layers match. |
| Agent walks through walls | Path clips through geometry | Increase `agent_radius` on the NavigationMesh and rebake |
| Path not updating after region change | Agent follows old path | Region changes take effect after the next map sync (1 physics frame). Call `nav_agent.target_position` again to requery. |
| Avoidance not working | Agents walk through each other | Enable `avoidance_enabled`, connect `velocity_computed` signal, set velocity via the agent (not directly on the body) |
| Bake produces no mesh | NavigationRegion3D has empty navmesh | Check `geometry_parsed_geometry_type` matches your scene (e.g., switch from `STATIC_COLLIDERS` to `MESH_INSTANCES` if you have no collision shapes) |
| Frame spike on region add/remove | Stutter when loading chunks | Godot 4.4+ async map sync helps. Also pre-bake navmeshes and load from disk. |
| Agents jitter near obstacles | Velocity oscillates | Reduce `time_horizon_agents`, increase `path_desired_distance`, or lower `max_speed` |
| Agent floats above ground | Y position doesn't match navmesh | NavigationAgent3D only computes XZ movement. Apply gravity separately via `CharacterBody3D.move_and_slide()`. |
