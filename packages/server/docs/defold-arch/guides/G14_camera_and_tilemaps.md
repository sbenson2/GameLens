# Camera Systems & Tilemaps

> **Category:** guide · **Engine:** Defold · **Related:** [E1 Architecture Overview](../architecture/E1_architecture_overview.md), [G2 Game Objects & Collections](G2_game_objects_and_collections.md), [G9 Render Pipeline & Materials](G9_render_pipeline_and_materials.md)

Defold's camera component controls what the player sees, and tilemaps provide an efficient way to build tile-based levels. This guide covers the built-in camera component, orthographic projection for 2D games, the defold-orthographic library, and the tilemap component API.

## Camera Component Basics

A camera in Defold is a component attached to a game object. It generates a view matrix (where you're looking from) and a projection matrix (how the 3D-to-2D mapping works), which the render script uses to draw the scene.

### Adding a Camera

1. Create or select a game object in your collection.
2. Right-click > **Add Component** > **Camera**.
3. Configure the camera properties in the Properties panel.

### Camera Properties

| Property | Type | Description |
|----------|------|-------------|
| `fov` | number | Field of view in radians (perspective projection only). Default: 0.7854 (~45 degrees). |
| `near_z` | number | Near clipping plane. Default: -1. |
| `far_z` | number | Far clipping plane. Default: 1. |
| `orthographic_projection` | boolean | Use orthographic projection instead of perspective. Default: false. |
| `orthographic_zoom` | number | Zoom level for orthographic projection. >1 = zoom in, <1 = zoom out. Default: 1. |

### Activating a Camera

A camera must be acquired before it affects rendering:

```lua
function init(self)
    -- Acquire the camera so its matrices are sent to the render script
    msg.post("#camera", "acquire_camera_focus")
end

function final(self)
    msg.post("#camera", "release_camera_focus")
end
```

Only one camera should have focus at a time. If multiple cameras acquire focus, the last one wins.

## Orthographic Projection for 2D Games

For 2D games, orthographic projection maps the world directly to screen coordinates without perspective distortion. This is what you want for platformers, top-down games, RPGs, and most tile-based games.

### Setting Up Orthographic Projection

1. Add a camera component to a game object.
2. Set `orthographic_projection` to `true`.
3. Set `near_z` to `-1` and `far_z` to `1` (the defaults work for 2D).
4. Adjust `orthographic_zoom` to control how much of the world is visible.

### Render Script Integration

The camera sends its projection and view matrices to the render script. In your render script, use them instead of a manually constructed projection:

```lua
-- In your render script's update()
function update(self)
    -- Clear
    render.set_depth_mask(true)
    render.clear({ [render.BUFFER_COLOR_BIT] = self.clear_color,
                   [render.BUFFER_DEPTH_BIT] = 1 })

    -- Draw the game world using the camera's matrices
    render.set_viewport(0, 0, render.get_window_width(), render.get_window_height())
    render.set_view(self.camera_view)           -- set by camera component
    render.set_projection(self.camera_projection) -- set by camera component

    render.set_depth_mask(false)
    render.disable_state(render.STATE_DEPTH_TEST)
    render.enable_state(render.STATE_BLEND)
    render.set_blend_func(render.BLEND_SRC_ALPHA, render.BLEND_ONE_MINUS_SRC_ALPHA)

    render.draw(self.tile_pred)    -- tilemap predicate
    render.draw(self.sprite_pred)  -- sprite predicate
end
```

## Following a Game Object

The camera sees the world from the position of its parent game object. To follow a player, you have two options:

### Option 1: Parent the Camera

Make the camera's game object a child of the player in the collection editor. The camera automatically moves with the player. This is instant following with no smoothing.

### Option 2: Script-Based Following with Smoothing

Attach the camera to its own game object and update its position in a script:

```lua
-- camera_controller.script
go.property("target", msg.url())   -- URL of the object to follow
go.property("lerp_speed", 5)       -- smoothing factor
go.property("offset", vmath.vector3(0, 50, 0))  -- look-ahead offset

function init(self)
    msg.post("#camera", "acquire_camera_focus")
    self.position = go.get_position()
end

function update(self, dt)
    local target_pos = go.get_position(self.target)
    local goal = target_pos + self.offset
    -- Smooth follow using lerp
    self.position = vmath.lerp(self.lerp_speed * dt, self.position, goal)
    go.set_position(self.position)
end

function final(self)
    msg.post("#camera", "release_camera_focus")
end
```

### Camera Bounds Clamping

To prevent the camera from showing areas outside the level, clamp the position:

```lua
go.property("bounds_min", vmath.vector3(0, 0, 0))
go.property("bounds_max", vmath.vector3(3200, 1800, 0))

function update(self, dt)
    local target_pos = go.get_position(self.target)
    local goal = target_pos + self.offset
    self.position = vmath.lerp(self.lerp_speed * dt, self.position, goal)

    -- Clamp to level bounds (accounting for half-screen offset)
    local hw = 480  -- half the viewport width in world units
    local hh = 320  -- half the viewport height in world units
    self.position.x = math.max(self.bounds_min.x + hw,
                      math.min(self.bounds_max.x - hw, self.position.x))
    self.position.y = math.max(self.bounds_min.y + hh,
                      math.min(self.bounds_max.y - hh, self.position.y))

    go.set_position(self.position)
end
```

## Defold-Orthographic Library

For production 2D games, the community **defold-orthographic** library (by britzl) adds features the built-in camera lacks: screen-to-world conversion, world-to-screen conversion, screen shake, deadzone following, multi-camera support, and bounds.

### Installation

Add as a dependency in `game.project`:

```
[project]
dependencies = https://github.com/britzl/defold-orthographic/archive/master.zip
```

### Key API

```lua
local camera = require("orthographic.camera")

-- Convert screen coordinates to world coordinates (essential for mouse/touch input)
local world_pos = camera.screen_to_world(camera_id, vmath.vector3(action.x, action.y, 0))

-- Convert world coordinates to screen coordinates
local screen_pos = camera.world_to_screen(camera_id, world_pos)

-- Get the visible world bounds
local bounds = camera.get_bounds(camera_id)
-- bounds.x, bounds.y = bottom-left; bounds.w, bounds.z = width, height

-- Screen shake
camera.shake(camera_id, 0.5, 5, hash("both"))  -- duration, intensity, direction

-- Follow with deadzone
camera.follow(camera_id, target_url, { lerp = 0.9 })
camera.deadzone(camera_id, 100, 50, 100, 50)  -- left, top, right, bottom margins
```

### When to Use defold-orthographic vs. Built-in

| Feature | Built-in Camera | defold-orthographic |
|---------|----------------|---------------------|
| Basic view/projection | Yes | Yes |
| Screen-to-world conversion | Manual math required | `camera.screen_to_world()` |
| Smooth follow | Write your own script | `camera.follow()` with lerp |
| Deadzone | Write your own script | `camera.deadzone()` |
| Screen shake | Write your own script | `camera.shake()` |
| Bounds clamping | Write your own script | `camera.bounds()` |

For anything beyond a static camera, defold-orthographic saves significant boilerplate.

## Tilemap Component

Tilemaps are components that render tile-based levels efficiently using a tile source (atlas of equally-sized tiles).

### Creating a Tilemap

1. **Create a Tile Source:** Right-click in Assets > **New** > **Tile Source**. Set the image (a grid spritesheet) and tile dimensions.
2. **Create a Tilemap:** Right-click on a game object > **Add Component** > **Tilemap**. Assign the tile source.
3. **Add Layers:** In the tilemap editor, add one or more layers (e.g., "ground", "walls", "decoration").
4. **Paint Tiles:** Select a tile from the palette and paint it onto the grid.

### Tilemap Properties

| Property | Description |
|----------|-------------|
| Tile Source | The tile source resource used by this tilemap. |
| Material | The material used for rendering (default works for most cases). |
| Blend Mode | How tiles blend with the background. |

### Runtime Tilemap API

Read and modify tiles at runtime using the `tilemap` module:

```lua
-- Get the tile at position (x, y) on a layer
-- Tile coordinates start at (1, 1) for the tile at origin
local tile = tilemap.get_tile("#tilemap", "ground", x, y)

-- Set a tile (tile index refers to the position in the tile source, 1-based)
tilemap.set_tile("#tilemap", "ground", x, y, 77)

-- Clear a tile (set to 0)
tilemap.set_tile("#tilemap", "ground", x, y, 0)

-- Get the bounds of the tilemap (min/max tile coordinates)
local x, y, w, h = tilemap.get_bounds("#tilemap")
-- x, y = minimum tile coordinates
-- w, h = dimensions in tiles
```

### Coordinate Conversion

Tile coordinates are 1-based integers. To convert world coordinates to tile coordinates:

```lua
local TILE_SIZE = 32  -- must match your tile source

function world_to_tile(world_x, world_y)
    -- Tiles are 1-based, and tile (1,1) starts at world origin
    local tx = math.floor(world_x / TILE_SIZE) + 1
    local ty = math.floor(world_y / TILE_SIZE) + 1
    return tx, ty
end

function tile_to_world(tx, ty)
    -- Returns the world position of the tile's bottom-left corner
    local wx = (tx - 1) * TILE_SIZE
    local wy = (ty - 1) * TILE_SIZE
    return wx, wy
end
```

### Dynamic Level Generation

Generate or modify levels at runtime using `tilemap.set_tile()`:

```lua
function init(self)
    -- Generate a simple ground layer
    local width = 40
    local height = 3

    for x = 1, width do
        for y = 1, height do
            if y == height then
                tilemap.set_tile("#tilemap", "ground", x, y, 1)  -- grass top
            else
                tilemap.set_tile("#tilemap", "ground", x, y, 2)  -- dirt fill
            end
        end
    end
end
```

### Tilemap Collision

Tilemaps can have collision shapes defined in the tile source:

1. Open the tile source in the editor.
2. Select a tile and click **Collision** in the toolbar.
3. Draw collision shapes on tiles that should be solid.
4. The engine auto-generates collision geometry from painted tiles.

Collision events arrive as standard physics messages (`collision_response`, `contact_point_response`) — the tilemap component's collision object participates in the physics world like any other.

### Performance Tips for Tilemaps

1. **Minimize layer count.** Each layer is a separate draw call. Combine visual-only layers when possible.
2. **Use tile source atlases efficiently.** One tile source = one texture = one draw call per layer.
3. **Don't call `tilemap.set_tile()` every frame.** Modify tiles only when the level changes (player digs a block, door opens, etc.).
4. **Keep tilemap bounds reasonable.** Very large tilemaps (>1000x1000) consume memory for the full grid even if most tiles are empty. For infinite/very large worlds, use multiple collection proxies with smaller tilemaps.

## Combining Camera and Tilemaps

A typical 2D level setup:

```
level.collection
├── camera (game object)
│   ├── camera (component, orthographic)
│   └── camera_controller.script
├── player (game object)
│   ├── player.script
│   └── sprite
└── level (game object)
    └── tilemap (component)
```

The camera follows the player, the tilemap renders the level, and collision shapes from the tile source handle solid ground and walls. The render script draws the tilemap predicate first (background), then sprites on top.

### Z-Order with Tilemaps

Tilemap layers render at the z-position of their parent game object, with layers ordered by their position in the tilemap component. To interleave sprites between tilemap layers:

1. Set the tilemap game object at z = 0.
2. Tilemap layers render in order (background first, foreground last).
3. Set sprite game objects between layers using z-position (e.g., z = 0.1 for objects that should appear above the ground layer but below a foreground layer).
4. The render script draws everything in z-order within each predicate.
