# Tilemaps and Level Design

> **Category:** guide · **Engine:** Pygame · **Related:** [Game Loop and State](../architecture/game-loop-and-state.md), [Surfaces and Drawing](../reference/surfaces-and-drawing.md), [Sprites and Collision](sprites-and-collision.md)

Use the Tiled map editor with pytmx and pyscroll to build, load, and render tile-based levels in Pygame. This guide covers the full pipeline: authoring maps in Tiled, loading them at runtime, rendering with camera scrolling, and reading object/property data for gameplay logic.

---

## Dependencies

```bash
pip install pytmx pyscroll
```

- **pytmx** — loads `.tmx` (Tiled XML) map files, converts tile images to Pygame surfaces automatically via `convert()` / `convert_alpha()`.
- **pyscroll** — buffered tilemap renderer with built-in camera scrolling and layered sprite rendering.
- **Tiled** — free map editor (https://www.mapeditor.org). Export as `.tmx` (XML) or `.json`.

---

## Tiled Map Setup

### Recommended Tiled settings

| Setting | Recommendation |
|---------|---------------|
| Tile size | 16x16 or 32x32 px (powers of 2 for clean scaling) |
| Map orientation | Orthogonal (top-down or side-scroll) |
| Tile render order | Right Down (default) |
| Export format | TMX (XML) — pytmx's native format |

### Layer conventions

Organize Tiled layers so the loader can distinguish visual layers from data layers:

```
Layers (bottom to top):
  ground          ← tile layer: base terrain
  decoration      ← tile layer: trees, rocks, non-blocking detail
  collision       ← tile layer: invisible blocking tiles (set 'collision' property)
  objects         ← object layer: spawn points, triggers, NPCs
  above_player    ← tile layer: rooftops, bridges (drawn on top of sprites)
```

### Custom properties in Tiled

Assign properties to individual tiles, objects, or layers in Tiled's Properties panel. pytmx reads these as Python dicts:

- **Tile property:** `collision: true` on blocking tiles
- **Object property:** `type: spawn`, `enemy_type: slime`, `hp: 50`
- **Layer property:** `z_index: 5`, `parallax: 0.5`

---

## Loading Maps with pytmx

```python
from pytmx.util_pygame import load_pygame

# load_pygame auto-converts all tile surfaces to display format
# This is equivalent to calling convert_alpha() on every tile image
tmx_data = load_pygame("assets/maps/level_01.tmx")

# Map dimensions
map_width = tmx_data.width       # in tiles
map_height = tmx_data.height     # in tiles
tile_width = tmx_data.tilewidth  # px per tile
tile_height = tmx_data.tileheight

# Full map size in pixels
pixel_width = map_width * tile_width
pixel_height = map_height * tile_height
```

### Iterating tile layers

```python
# Get a specific tile image at (x, y) on a layer index
image = tmx_data.get_tile_image(x, y, layer_index)
# Returns a pygame.Surface or None if the cell is empty

# Iterate all visible tile layers
for layer in tmx_data.visible_layers:
    if hasattr(layer, 'data'):  # TiledTileLayer
        for x, y, surface in layer.tiles():
            if surface:
                screen.blit(surface, (x * tile_width, y * tile_height))
```

### Reading tile properties

```python
# Properties for a tile at a specific position and layer
props = tmx_data.get_tile_properties(x, y, layer_index)
# Returns dict or None: {'collision': True, 'damage': 10}

# Check if a tile blocks movement
if props and props.get('collision'):
    # solid tile — block player
    pass
```

### Reading object layers

```python
# Iterate objects (spawn points, triggers, NPCs)
for obj in tmx_data.objects:
    # Common attributes
    print(obj.name)       # e.g. "player_spawn"
    print(obj.type)       # e.g. "spawn" (set in Tiled)
    print(obj.x, obj.y)   # pixel position
    print(obj.width, obj.height)

    # Custom properties
    if obj.type == "enemy":
        enemy_type = obj.properties.get("enemy_type", "slime")
        hp = obj.properties.get("hp", 50)

    # Polygon/polyline objects have .points
    if hasattr(obj, 'points'):
        for point in obj.points:
            print(point)  # (x, y) tuples
```

---

## Rendering with pyscroll (Camera Scrolling)

pyscroll provides a `BufferedRenderer` that efficiently caches and renders visible tiles, plus a `PyscrollGroup` that acts as a camera-aware sprite group.

```python
import pygame
import pyscroll
from pytmx.util_pygame import load_pygame

# --- Setup ---
pygame.init()
screen = pygame.display.set_mode((800, 600))
clock = pygame.time.Clock()

# Load the TMX map
tmx_data = load_pygame("assets/maps/level_01.tmx")

# Create a pyscroll data source from the TMX data
map_data = pyscroll.TiledMapData(tmx_data)

# Create the buffered renderer
# clamp_camera=True prevents the camera from showing areas outside the map
map_layer = pyscroll.BufferedRenderer(
    map_data,
    screen.get_size(),
    clamp_camera=True
)
# Zoom level (1.0 = native, 2.0 = 2x zoom)
map_layer.zoom = 2.0

# Create a sprite group that uses the map layer for rendering
group = pyscroll.PyscrollGroup(
    map_layer=map_layer,
    default_layer=2  # layer index where sprites are drawn
)
```

### Player sprite with world-coordinate positioning

```python
class Player(pygame.sprite.Sprite):
    def __init__(self, pos):
        super().__init__()
        self.image = pygame.image.load("player.png").convert_alpha()
        self.rect = self.image.get_rect(center=pos)
        self.speed = 200  # pixels/sec
        # feet rect for precise collision
        self._old_position = list(self.rect.center)

    def update(self, dt):
        keys = pygame.key.get_pressed()
        dx = (keys[pygame.K_RIGHT] - keys[pygame.K_LEFT]) * self.speed * dt
        dy = (keys[pygame.K_DOWN] - keys[pygame.K_UP]) * self.speed * dt
        self._old_position = list(self.rect.center)
        self.rect.x += dx
        self.rect.y += dy

    def revert_position(self):
        """Snap back if collision detected."""
        self.rect.center = self._old_position

# Spawn player at the "player_spawn" object position
spawn = None
for obj in tmx_data.objects:
    if obj.name == "player_spawn":
        spawn = (obj.x, obj.y)
        break

player = Player(spawn or (100, 100))
group.add(player)
```

### Game loop with camera following

```python
running = True
while running:
    dt = clock.tick(60) / 1000.0

    for event in pygame.event.get():
        if event.type == pygame.QUIT:
            running = False

    group.update(dt)

    # Center camera on player
    group.center(player.rect.center)

    # Draw map + sprites (handles layered rendering automatically)
    group.draw(screen)
    pygame.display.flip()

pygame.quit()
```

---

## Manual Rendering (Without pyscroll)

If you don't need camera scrolling or prefer full control:

```python
def render_map(screen, tmx_data, camera_offset=(0, 0)):
    """Render all visible tile layers with a camera offset."""
    tw = tmx_data.tilewidth
    th = tmx_data.tileheight
    ox, oy = camera_offset

    for layer in tmx_data.visible_layers:
        if not hasattr(layer, 'data'):
            continue  # skip object layers

        for x, y, surface in layer.tiles():
            if surface:
                screen.blit(surface, (x * tw - ox, y * th - oy))
```

### Optimized rendering: only draw visible tiles

```python
def render_visible(screen, tmx_data, camera_rect):
    """Only render tiles within the camera viewport."""
    tw = tmx_data.tilewidth
    th = tmx_data.tileheight

    # Calculate visible tile range
    start_x = max(0, camera_rect.left // tw)
    start_y = max(0, camera_rect.top // th)
    end_x = min(tmx_data.width, camera_rect.right // tw + 1)
    end_y = min(tmx_data.height, camera_rect.bottom // th + 1)

    for layer in tmx_data.visible_layers:
        if not hasattr(layer, 'data'):
            continue

        for x in range(start_x, end_x):
            for y in range(start_y, end_y):
                image = tmx_data.get_tile_image(x, y, layer)
                if image:
                    screen.blit(
                        image,
                        (x * tw - camera_rect.x,
                         y * th - camera_rect.y)
                    )
```

---

## Collision from Tile Properties

Build a collision map from Tiled properties instead of hardcoding:

```python
def build_collision_rects(tmx_data, layer_name="collision"):
    """Build a list of pygame.Rect for all tiles with collision=True."""
    rects = []
    tw = tmx_data.tilewidth
    th = tmx_data.tileheight

    # Find the collision layer by name
    layer_index = None
    for i, layer in enumerate(tmx_data.layers):
        if layer.name == layer_name:
            layer_index = i
            break

    if layer_index is None:
        return rects

    for x in range(tmx_data.width):
        for y in range(tmx_data.height):
            props = tmx_data.get_tile_properties(x, y, layer_index)
            if props and props.get("collision"):
                rects.append(pygame.Rect(x * tw, y * th, tw, th))

    return rects

# Usage: check player against collision rects
collision_rects = build_collision_rects(tmx_data)

def check_collisions(player, collision_rects):
    for rect in collision_rects:
        if player.rect.colliderect(rect):
            player.revert_position()
            break
```

---

## Spawning Entities from Object Layers

Use Tiled objects to define spawn points, triggers, and interactive areas:

```python
def spawn_entities(tmx_data, sprite_groups):
    """Read object layer and spawn game entities."""
    for obj in tmx_data.objects:
        pos = (obj.x, obj.y)

        if obj.type == "enemy":
            enemy_type = obj.properties.get("enemy_type", "slime")
            hp = obj.properties.get("hp", 50)
            enemy = Enemy(pos, enemy_type, hp)
            sprite_groups["enemies"].add(enemy)

        elif obj.type == "collectible":
            item = Collectible(pos, obj.name)
            sprite_groups["items"].add(item)

        elif obj.type == "trigger":
            # Rectangle trigger zone
            trigger = TriggerZone(
                pygame.Rect(obj.x, obj.y, obj.width, obj.height),
                action=obj.properties.get("action", "none")
            )
            sprite_groups["triggers"].add(trigger)
```

---

## Performance Tips

1. **Always use `load_pygame()`** (not raw `TiledMap`) — it pre-converts all tile surfaces to display format.
2. **Use pyscroll for scrolling maps** — its `BufferedRenderer` caches tile layers to a single surface, avoiding thousands of individual `blit()` calls per frame.
3. **Minimize collision rect count** — merge adjacent blocking tiles into larger rectangles (axis-aligned bounding boxes) for fewer collision checks.
4. **Pre-bake static decoration layers** — if a layer never changes, render it once to a surface and blit that instead.
5. **Keep tileset images as spritesheets** — Tiled's tileset format loads more efficiently than individual tile images.
6. **Cull off-screen tiles** — if rendering manually, only draw tiles visible in the camera viewport (see `render_visible` above).
