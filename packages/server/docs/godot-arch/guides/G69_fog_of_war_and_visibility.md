# G69 — Fog of War and Visibility Systems

> **Category:** Guide · **Engine:** Godot 4.4+ · **Language:** GDScript / C#
> **Related:** [G12 Shaders & Visual Effects](./G12_shaders_and_visual_effects.md) · [G40 2D Lighting & Shadows](./G40_2d_lighting_and_shadows.md) · [G7 Tilemap & Terrain](./G7_tilemap_and_terrain.md) · [G14 Navigation & Pathfinding](./G14_navigation_and_pathfinding.md)

---

## Table of Contents

1. [Fog of War Concepts](#fog-of-war-concepts)
2. [Tile-Based Fog of War (2D)](#tile-based-fog-of-war-2d)
3. [Shader-Based Fog of War](#shader-based-fog-of-war)
4. [Shadow Casting & Line of Sight](#shadow-casting--line-of-sight)
5. [3D Fog of War](#3d-fog-of-war)
6. [Vision Source Component](#vision-source-component)
7. [Performance Optimization](#performance-optimization)
8. [Hiding Game Objects](#hiding-game-objects)
9. [Multiplayer Fog of War](#multiplayer-fog-of-war)
10. [Common Mistakes](#common-mistakes)

---

## What This Guide Covers

Fog of War (FoW) hides information from players until their units explore the map. Essential in RTS, strategy, and roguelike games, fog creates tension and forces players to make decisions with incomplete information.

This guide covers three major approaches: **tile-based grids, GPU shaders, and 3D projection**. Each has trade-offs in visual quality, performance, and implementation complexity. You'll learn to integrate vision sources, handle explored-vs-visible states, block vision with walls, and optimize for large maps.

---

## Fog of War Concepts

### Three States

Every cell or region in your map has a **visibility state**:

1. **Unexplored (Black)** — Player has never seen this area. Render as completely opaque fog, no information visible.
2. **Explored (Grey)** — Player saw it before, but it's not visible now. Render last known state with a darker overlay. Units/objects may have moved.
3. **Visible (Clear)** — Player can see it right now. Render in full color; update unit positions, animations in real-time.

### Vision Sources

Visibility is determined by **vision sources**: units, buildings, watchtowers, abilities, etc. Each source has:
- **Position** (world or grid)
- **Vision radius** (how far it can see)
- **Vision shape** (circle, cone for directional, or custom)
- **Team/faction** (only reveals to allies)

Vision sources are typically checked every 0.1–0.5 seconds (not every frame) to save CPU.

### Use Cases

- **RTS games** (StarCraft, Age of Empires): Fog reveals enemy base locations; hidden units surprise players
- **Roguelikes** (Binding of Isaac, Hades): Fog adds exploration mystery
- **Tactical RPGs** (XCOM, Fire Emblem): LOS blocking by walls creates cover strategy
- **Top-down Strategy** (Civilization, Crusader Kings): Unexplored regions are blank; explored shows terrain

---

## Tile-Based Fog of War (2D)

The classic grid approach tracks visibility per cell. Simple, performant, and works great for isometric and top-down games.

### Core Manager

**GDScript:**
```gdscript
# FogOfWarManager.gd — Autoload singleton
extends Node

const UNEXPLORED = 0
const EXPLORED = 1
const VISIBLE = 2

var map_width: int = 50
var map_height: int = 50
var fog_grid: Array[Array]  # 2D array of states
var explored_grid: Array[Array]  # Permanent record of explored cells

func _ready() -> void:
	initialize_fog(map_width, map_height)

func initialize_fog(width: int, height: int) -> void:
	map_width = width
	map_height = height
	fog_grid = []
	explored_grid = []
	
	for x in range(width):
		var row_fog: Array = []
		var row_explored: Array = []
		for y in range(height):
			row_fog.append(UNEXPLORED)
			row_explored.append(UNEXPLORED)
		fog_grid.append(row_fog)
		explored_grid.append(row_explored)

func update_visibility(vision_sources: Array) -> void:
	# Reset current visibility to explored state
	for x in range(map_width):
		for y in range(map_height):
			if explored_grid[x][y] == VISIBLE:
				fog_grid[x][y] = EXPLORED
			else:
				fog_grid[x][y] = explored_grid[x][y]
	
	# Apply each vision source
	for source in vision_sources:
		reveal_from_source(source.grid_pos, source.vision_radius, source.team)

func reveal_from_source(center: Vector2i, radius: int, team: int) -> void:
	for x in range(max(0, center.x - radius), min(map_width, center.x + radius + 1)):
		for y in range(max(0, center.y - radius), min(map_height, center.y + radius + 1)):
			var dist = center.distance_to(Vector2i(x, y))
			if dist <= radius:
				fog_grid[x][y] = VISIBLE
				explored_grid[x][y] = max(explored_grid[x][y], EXPLORED)

func get_state(grid_pos: Vector2i) -> int:
	if grid_pos.x < 0 or grid_pos.x >= map_width or grid_pos.y < 0 or grid_pos.y >= map_height:
		return UNEXPLORED
	return fog_grid[grid_pos.x][grid_pos.y]

func is_visible(grid_pos: Vector2i) -> bool:
	return get_state(grid_pos) == VISIBLE
```

**C#:**
```csharp
// FogOfWarManager.cs — Autoload singleton
using Godot;

public class FogOfWarManager : Node
{
    public const int UNEXPLORED = 0;
    public const int EXPLORED = 1;
    public const int VISIBLE = 2;

    private int mapWidth = 50;
    private int mapHeight = 50;
    private int[][] fogGrid;
    private int[][] exploredGrid;

    public override void _Ready()
    {
        InitializeFog(mapWidth, mapHeight);
    }

    public void InitializeFog(int width, int height)
    {
        mapWidth = width;
        mapHeight = height;
        fogGrid = new int[width][];
        exploredGrid = new int[width][];

        for (int x = 0; x < width; x++)
        {
            fogGrid[x] = new int[height];
            exploredGrid[x] = new int[height];
            for (int y = 0; y < height; y++)
            {
                fogGrid[x][y] = UNEXPLORED;
                exploredGrid[x][y] = UNEXPLORED;
            }
        }
    }

    public void UpdateVisibility(Node[] visionSources)
    {
        // Reset current visibility to explored state
        for (int x = 0; x < mapWidth; x++)
        {
            for (int y = 0; y < mapHeight; y++)
            {
                if (exploredGrid[x][y] == VISIBLE)
                    fogGrid[x][y] = EXPLORED;
                else
                    fogGrid[x][y] = exploredGrid[x][y];
            }
        }

        // Apply each vision source
        foreach (var source in visionSources)
        {
            if (source is VisionSource vs)
                RevealFromSource(vs.GridPos, vs.VisionRadius, vs.Team);
        }
    }

    private void RevealFromSource(Vector2I center, int radius, int team)
    {
        for (int x = Mathf.Max(0, center.X - radius); x < Mathf.Min(mapWidth, center.X + radius + 1); x++)
        {
            for (int y = Mathf.Max(0, center.Y - radius); y < Mathf.Min(mapHeight, center.Y + radius + 1); y++)
            {
                float dist = center.DistanceTo(new Vector2I(x, y));
                if (dist <= radius)
                {
                    fogGrid[x][y] = VISIBLE;
                    exploredGrid[x][y] = Mathf.Max(exploredGrid[x][y], EXPLORED);
                }
            }
        }
    }

    public int GetState(Vector2I gridPos)
    {
        if (gridPos.X < 0 || gridPos.X >= mapWidth || gridPos.Y < 0 || gridPos.Y >= mapHeight)
            return UNEXPLORED;
        return fogGrid[gridPos.X][gridPos.Y];
    }

    public bool IsVisible(Vector2I gridPos) => GetState(gridPos) == VISIBLE;
}
```

### Rendering Fog Overlay

Use a TileMapLayer or TextureRect to render the fog state:

**GDScript (TileMapLayer approach):**
```gdscript
extends TileMapLayer

@onready var fog_manager = FogOfWarManager

func _process(_delta: float) -> void:
	update_fog_visuals()

func update_fog_visuals() -> void:
	for x in range(fog_manager.map_width):
		for y in range(fog_manager.map_height):
			var state = fog_manager.get_state(Vector2i(x, y))
			var tile_id = 0
			match state:
				FogOfWarManager.UNEXPLORED:
					tile_id = 0  # Black fog tile
				FogOfWarManager.EXPLORED:
					tile_id = 1  # Grey fog tile
				FogOfWarManager.VISIBLE:
					tile_id = -1  # Clear (no fog)
			set_cell(Vector2i(x, y), 0, Vector2i(tile_id, 0))
```

### Optimization: Dirty Flags

Only recalculate when vision sources move:

**GDScript:**
```gdscript
var vision_sources: Array = []
var needs_update: bool = true
var update_timer: float = 0.1

func _process(delta: float) -> void:
	update_timer -= delta
	if update_timer <= 0:
		if needs_update:
			fog_manager.update_visibility(vision_sources)
			needs_update = false
		update_timer = 0.1

func register_vision_source(source: Node) -> void:
	vision_sources.append(source)
	needs_update = true

func on_unit_moved(unit: Node) -> void:
	# Called when a unit's position changes
	needs_update = true
```

---

## Shader-Based Fog of War

For smooth, GPU-accelerated fog with soft edges, use a SubViewport as a fog texture.

### Setup

1. Create a **SubViewport** (512×512) with a **Camera2D** rendering the fog map
2. Vision sources are **Sprite2D** nodes with white circles, rendered to the viewport
3. Main scene applies a **shader** that samples the fog texture

**GDScript (Fog Manager with SubViewport):**
```gdscript
extends Node2D

@onready var fog_viewport: SubViewport = $FogViewport
@onready var fog_texture: Texture2D = fog_viewport.get_texture()
@onready var explored_viewport: SubViewport = $ExploredViewport

func _ready() -> void:
	fog_viewport.size = Vector2i(512, 512)
	explored_viewport.size = Vector2i(512, 512)

func add_vision_source(position: Vector2, radius: float) -> Node2D:
	# Create a Sprite2D in the fog_viewport with a radial gradient
	var sprite = Sprite2D.new()
	sprite.texture = create_radial_gradient(radius)
	sprite.global_position = position
	fog_viewport.add_child(sprite)
	return sprite

func create_radial_gradient(radius: float) -> Image:
	# Create a white circle with soft edges
	var image = Image.create(int(radius * 2), int(radius * 2), false, Image.FORMAT_RGBA8)
	var center = Vector2(radius, radius)
	
	for x in range(int(radius * 2)):
		for y in range(int(radius * 2)):
			var dist = center.distance_to(Vector2(x, y))
			var alpha = max(0.0, 1.0 - (dist / radius))
			image.set_pixel(x, y, Color(1, 1, 1, alpha))
	
	return ImageTexture.create_from_image(image)
```

### Fog Shader

**Godot Shader (.gdshader):**
```glsl
shader_type canvas_item;

uniform sampler2D fog_texture;
uniform vec3 fog_color = vec3(0.0, 0.0, 0.0);
uniform vec3 explored_color = vec3(0.3, 0.3, 0.3);

void fragment() {
	// Sample fog map (0 = hidden, 1 = visible)
	float fog_sample = texture(fog_texture, UV).r;
	
	// Interpolate between fully visible and fully fogged
	vec3 final_color = mix(COLOR.rgb, fog_color, 1.0 - fog_sample);
	
	// Optional: desaturate explored areas
	if (fog_sample < 0.5) {
		final_color = mix(final_color, explored_color, 0.7);
	}
	
	COLOR = vec4(final_color, COLOR.a);
}
```

### Explored Texture (Never Goes Dark)

Accumulate explored cells into a separate texture that only increases:

**GDScript:**
```gdscript
func update_explored_map() -> void:
	# Blend current fog onto explored map (taking maximum)
	# This prevents explored areas from going back to black
	var fog_image = fog_viewport.get_texture().get_image()
	var explored_image = explored_viewport.get_texture().get_image()
	
	for x in range(fog_image.get_width()):
		for y in range(fog_image.get_height()):
			var fog_alpha = fog_image.get_pixel(x, y).a
			var explored_alpha = explored_image.get_pixel(x, y).a
			explored_image.set_pixel(x, y, Color(1, 1, 1, max(fog_alpha, explored_alpha)))
	
	explored_viewport.get_texture().set_image(explored_image)
```

---

## Shadow Casting & Line of Sight

Walls and obstacles block vision. Use raycasting or a shadow casting algorithm.

### Raycasting Approach

**GDScript:**
```gdscript
func get_visible_cells_raycasting(source_pos: Vector2i, radius: int, tilemap: TileMap) -> Array:
	var visible: Array = []
	var num_rays = 32 + (radius * 4)  # More rays for larger radius
	
	for ray in range(num_rays):
		var angle = (ray / float(num_rays)) * TAU
		var direction = Vector2(cos(angle), sin(angle))
		
		for dist in range(1, radius + 1):
			var check_pos = source_pos + (direction * dist).round()
			
			# Stop casting this ray if we hit a wall
			if tilemap.get_cell_source_id(0, check_pos) != -1:
				break
			
			visible.append(check_pos)
	
	return visible
```

### Efficient Shadow Casting (Octant-Based)

For performance, use a recursive octant algorithm. This is complex but highly optimized:

**GDScript (Simplified):**
```gdscript
func cast_shadows(source: Vector2i, max_radius: int, grid: Array) -> Array:
	var visible = []
	visible.append(source)
	
	# Cast shadows in 8 octants
	for i in range(8):
		_cast_octant(source, 1, 1.0, i, max_radius, grid, visible)
	
	return visible

func _cast_octant(origin: Vector2i, row: int, slope: float, octant: int, max_radius: int, grid: Array, visible: Array) -> void:
	if row > max_radius:
		return
	
	# This is a simplified version; full implementation requires careful octant math
	var next_slope = slope
	for col in range(row, max_radius + 1):
		var cell = _get_octant_cell(origin, row, col, octant)
		
		if is_blocked(cell, grid):
			next_slope += 1.0 / col
		else:
			visible.append(cell)
```

---

## 3D Fog of War

For 3D strategy games, render fog from a top-down orthographic view.

**GDScript (3D):**
```gdscript
extends Node3D

@onready var fog_viewport: SubViewport = $FogViewport
@onready var fog_camera: Camera3D = $FogViewport/Camera3D
@onready var fog_texture: Texture2D = fog_viewport.get_texture()

func _ready() -> void:
	fog_camera.projection = Camera3D.PROJECTION_ORTHOGONAL
	fog_camera.size = 100.0
	fog_camera.global_position = Vector3(50, 50, 50)  # Top-down view

func add_light_vision_source(position: Vector3, radius: float) -> OmniLight3D:
	# Use a light as a vision source in the fog viewport
	var light = OmniLight3D.new()
	light.omni_range = radius
	light.energy_multiplier = 1.0
	light.global_position = position
	fog_viewport.add_child(light)
	return light
```

---

## Vision Source Component

A reusable **VisionSource** node that registers with the fog system:

**GDScript:**
```gdscript
# VisionSource.gd
extends Node

@export var vision_radius: int = 10
@export var vision_shape: String = "circle"  # "circle" or "cone"
@export var vision_direction: float = 0.0  # For cone shape
@export var team: int = 0

@onready var parent = get_parent()
var grid_pos: Vector2i

func _ready() -> void:
	FogOfWarManager.register_vision_source(self)

func _process(_delta: float) -> void:
	# Update grid position from parent's world position
	grid_pos = (parent.global_position / 16).round()  # Assuming 16x16 tiles

func get_visible_cells() -> Array:
	if vision_shape == "circle":
		return _get_circle_cells()
	elif vision_shape == "cone":
		return _get_cone_cells()
	return []

func _get_circle_cells() -> Array:
	var cells = []
	for x in range(-vision_radius, vision_radius + 1):
		for y in range(-vision_radius, vision_radius + 1):
			if Vector2(x, y).length() <= vision_radius:
				cells.append(grid_pos + Vector2i(x, y))
	return cells

func _get_cone_cells() -> Array:
	var cells = []
	var cone_angle = PI / 4  # 45 degree cone
	
	for dist in range(1, vision_radius + 1):
		for angle in range(-int(cone_angle), int(cone_angle) + 1):
			var rad = vision_direction + (angle * PI / 180.0)
			var pos = grid_pos + (Vector2(cos(rad), sin(rad)) * dist).round()
			cells.append(pos)
	
	return cells

func _exit_tree() -> void:
	FogOfWarManager.unregister_vision_source(self)
```

**C#:**
```csharp
// VisionSource.cs
using Godot;

public class VisionSource : Node
{
    [Export] public int VisionRadius { get; set; } = 10;
    [Export] public string VisionShape { get; set; } = "circle";
    [Export] public float VisionDirection { get; set; } = 0.0f;
    [Export] public int Team { get; set; } = 0;

    private Node Parent;
    public Vector2I GridPos { get; private set; }

    public override void _Ready()
    {
        Parent = GetParent();
        FogOfWarManager.RegisterVisionSource(this);
    }

    public override void _Process(double delta)
    {
        GridPos = (Parent.GlobalPosition / 16).Round();
    }

    public Vector2I[] GetVisibleCells()
    {
        return VisionShape == "circle" ? GetCircleCells() : GetConeCells();
    }

    private Vector2I[] GetCircleCells()
    {
        var cells = new System.Collections.Generic.List<Vector2I>();
        for (int x = -VisionRadius; x <= VisionRadius; x++)
        {
            for (int y = -VisionRadius; y <= VisionRadius; y++)
            {
                if (new Vector2(x, y).Length() <= VisionRadius)
                    cells.Add(GridPos + new Vector2I(x, y));
            }
        }
        return cells.ToArray();
    }

    private Vector2I[] GetConeCells()
    {
        var cells = new System.Collections.Generic.List<Vector2I>();
        float coneAngle = Mathf.Pi / 4;

        for (int dist = 1; dist <= VisionRadius; dist++)
        {
            for (int angle = -(int)coneAngle; angle <= (int)coneAngle; angle++)
            {
                float rad = VisionDirection + (angle * Mathf.Pi / 180.0f);
                var pos = GridPos + ((new Vector2(Mathf.Cos(rad), Mathf.Sin(rad)) * dist).Round());
                cells.Add(pos);
            }
        }
        return cells.ToArray();
    }

    public override void _ExitTree() => FogOfWarManager.UnregisterVisionSource(this);
}
```

---

## Performance Optimization

### Update Frequency

Don't update every frame. Typical RTS games update every 0.1–0.5 seconds:

```gdscript
var update_timer: float = 0.1

func _process(delta: float) -> void:
	update_timer -= delta
	if update_timer <= 0:
		FogOfWarManager.update_visibility(vision_sources)
		update_timer = 0.1  # Next update in 100ms
```

### Spatial Hashing

For many vision sources, organize them spatially to avoid checking all pairs:

```gdscript
var spatial_hash: Dictionary = {}
var cell_size: int = 32

func hash_position(pos: Vector2i) -> Vector2i:
	return pos / cell_size

func register_vision_source(source: Node) -> void:
	var hash_key = hash_position(source.grid_pos)
	if hash_key not in spatial_hash:
		spatial_hash[hash_key] = []
	spatial_hash[hash_key].append(source)
```

### GPU Compute (Large Maps)

Use a compute shader to update 1000+ cells in parallel on the GPU. This requires a more advanced setup with `RenderingDevice`.

### LOD: Reduce Resolution for Distant Areas

Fog updates can be less frequent for chunks far from the player:

```gdscript
func should_update_chunk(chunk_pos: Vector2i, player_pos: Vector2i) -> bool:
	var dist = chunk_pos.distance_to(player_pos)
	if dist < 3:
		return true  # Always update nearby chunks
	elif dist < 6:
		return get_tree().get_frame() % 2 == 0  # Every 2nd frame
	else:
		return get_tree().get_frame() % 10 == 0  # Every 10th frame
```

---

## Hiding Game Objects

Fog visibility affects more than just rendering—it controls what players can interact with.

### Hide Enemies in Fog

**GDScript:**
```gdscript
extends CharacterBody2D

@export var team: int = 0

func _process(_delta: float) -> void:
	var grid_pos = (global_position / 16).round()
	var state = FogOfWarManager.get_state(grid_pos)
	
	# Hide in unexplored; show in explored/visible but desaturate explored
	match state:
		FogOfWarManager.UNEXPLORED:
			visible = false
		FogOfWarManager.EXPLORED:
			visible = true
			modulate = Color.GRAY
		FogOfWarManager.VISIBLE:
			visible = true
			modulate = Color.WHITE
```

### Minimap Integration

Reveal minimap only for visible cells:

```gdscript
func update_minimap() -> void:
	for x in range(map_width):
		for y in range(map_height):
			var state = FogOfWarManager.get_state(Vector2i(x, y))
			var color = Color.BLACK
			if state == FogOfWarManager.EXPLORED:
				color = Color.GRAY
			elif state == FogOfWarManager.VISIBLE:
				color = Color.WHITE
			minimap.set_pixel(x, y, color)
```

### Target & Ability Restrictions

Disable targeting enemies in fog:

```gdscript
func can_target(enemy: Node2D) -> bool:
	var grid_pos = (enemy.global_position / 16).round()
	return FogOfWarManager.is_visible(grid_pos)
```

### Audio Occlusion

Muffle or mute sounds in unexplored areas:

```gdscript
func _process(_delta: float) -> void:
	var state = FogOfWarManager.get_state(global_position)
	if state == FogOfWarManager.UNEXPLORED:
		$AudioStreamPlayer.volume_db = -80  # Mute
	elif state == FogOfWarManager.EXPLORED:
		$AudioStreamPlayer.volume_db = -10  # Quiet
	else:
		$AudioStreamPlayer.volume_db = 0  # Normal
```

---

## Multiplayer Fog of War

Each team sees only what their units can see. Anti-cheat depends on server authority.

**GDScript (Client-side tracking):**
```gdscript
var team: int = 0
var team_fog_managers: Dictionary = {}  # One FoW per team

func initialize_team_fog(num_teams: int) -> void:
	for t in range(num_teams):
		var manager = FogOfWarManager.new()
		manager.initialize_fog(map_width, map_height)
		team_fog_managers[t] = manager

func update_team_visibility(team: int, vision_sources: Array) -> void:
	team_fog_managers[team].update_visibility(vision_sources)

func get_visible_for_team(team: int, grid_pos: Vector2i) -> bool:
	return team_fog_managers[team].is_visible(grid_pos)
```

**Server Anti-Cheat:**
- Server tracks all unit positions and fog for all teams
- Only send entity data for units visible to the requesting client
- Never send position of hidden enemy units

---

## Common Mistakes

1. **Updating Fog Every Frame** — Causes lag on large maps. Update every 0.1–0.5s instead.

2. **Not Caching Vision Calculations** — Recalculating visibility for the same positions wastes CPU. Cache results between updates.

3. **Forgetting to Hide Audio/Particles** — Units in fog should be silent, or particles should be invisible. Otherwise, players know where hidden enemies are.

4. **Sharp Fog Edges** — Instant on/off looks wrong. Use soft gradients with blur transitions (shader-based approach).

5. **Vision Bleeding Through Walls** — Raycasting is essential for tactical depth. Circular vision without LOS breaks game balance.

6. **Not Tracking Explored State** — If explored areas go dark when units move away, the map feels disorienting. Maintain a permanent "explored" layer.

7. **Overly Aggressive Performance Optimization** — Don't sacrifice gameplay for frame rate. A correct FoW at 60fps beats a broken one at 120fps.

8. **Multiplayer: Trusting Client Vision** — Always validate on the server before allowing target selection or attacks. Client can lie.

9. **Not Integrating with AI** — Enemies in fog should not pathfind toward hidden units or react to them. Use fog state to gate AI behaviors.

10. **Fog vs. Game Rules Misalignment** — If you can cast a spell on a unit in fog, your fog is broken. FoW must gate all player actions, not just visuals.

---

## Summary

Fog of War is a pillar of strategy games. The **tile-based approach** is simple and fast; the **shader approach** looks smooth and scales to large maps; **line-of-sight** adds tactical depth. Update every 0.1–0.5 seconds, hide objects based on fog state, and always validate on the server in multiplayer.

For most games, start with tile-based FOW and a FogOfWarManager autoload. Add shaders for visual polish. Optimize only when profiling shows it's needed.
