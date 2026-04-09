# Tilemaps, Tile Sets & the Layer System

> **Category:** guide · **Engine:** GameMaker · **Related:** [G2 Rooms and Cameras](G2_rooms_and_cameras.md) · [R2 Surfaces and Shaders](../reference/R2_surfaces_and_shaders.md)

Tiles are GameMaker's most efficient rendering primitive. They have no events, no collision masks, and no per-instance overhead — just textured quads drawn in bulk by the GPU. Any static or semi-static visual (floors, walls, decoration, backgrounds) should be a tilemap, not a grid of objects.

---

## Tile Set Setup

A tile set is created from a single sprite asset. The sprite is sliced into a uniform grid of tiles.

### Creating a Tile Set

1. Create a sprite with your tiles laid out in a grid (e.g., 16×16 px per tile)
2. Right-click in the Asset Browser → **Create Tile Set**
3. Assign the sprite and set the tile width/height
4. Optionally configure **output border** (1–2 px padding prevents bleeding at subpixel positions) and **separation** (gap between tiles in the source sprite)

### Tile Set Editors

GameMaker's tile set asset has three sub-editors, each building on the raw grid:

| Editor | Purpose |
|--------|---------|
| **Auto Tiles** | Define tile groups that automatically connect to neighbors (walls, terrain borders) |
| **Animated Tiles** | Define tile frame sequences for water, lava, torches, etc. |
| **Brush Builder** | Combine multiple tiles into reusable multi-tile brushes for the room editor |

---

## Auto Tiling

Auto tiling is the highest-leverage tile set feature. You define which tiles represent corner, edge, and interior variants, and GameMaker selects the right tile at paint time based on neighboring tiles.

### Two Modes

| Mode | Tile Count | Best For |
|------|-----------|----------|
| **16-tile** | 16 variants | Top-down terrain, simple walls |
| **47-tile** (full blob) | 47 variants | Platformer terrain, complex borders that need inner-corner handling |

### Setting Up Auto Tiles

1. Open the tile set → **Auto Tile** tab
2. Click **Add** to create a new auto-tile library
3. Click each slot in the template and select the matching tile from your sprite
4. Once all slots are filled, select the auto-tile brush in the Room Editor's tile tool

When painting, GameMaker looks at the 8 neighbors (or 4 for 16-tile mode) and picks the variant that matches. Editing one tile automatically updates its neighbors.

### Design Tips

- **Consistent palette:** All 16 or 47 tiles must use the same color/texture palette or the seams will be visible.
- **Test with irregular shapes:** Paint L-shapes, single-tile islands, and diagonal lines to verify every variant looks correct.
- **Multiple auto-tile sets:** A single tile set can have several auto-tile libraries — one for grass-to-dirt, another for water-to-land, etc.

---

## Animated Tiles

Tile animations play automatically at the room level with no GML or object logic needed.

### Setup

1. Open the tile set → **Animated Tiles** tab
2. Click **Add** to create a new animation
3. Select the frames (tiles) in order from the tile grid
4. Set the frame speed (frames per second)

### Constraints

- Frame count must be a **power of two** (2, 4, 8, 16, etc.). GameMaker requires this for its internal cycling.
- All animated tiles in the same tile set share the same speed setting — if you need different speeds, use separate tile sets on different layers.
- Animated tiles are very efficient — they swap tile indices internally with no per-tile CPU cost.

---

## Brush Builder

The Brush Builder lets you create multi-tile stamps for fast level painting.

1. Open the tile set → **Brush Builder** tab
2. Select tiles from the grid on the left and "paint" them onto the brush canvas on the right
3. Name the brush and save

Brushes appear in the Room Editor's tile palette alongside individual tiles. They are purely an editor convenience — at runtime, each cell is an independent tile.

---

## Room Layers

Rooms in GameMaker use a layer stack. Layers render back-to-front (bottom of the list draws first).

### Layer Types

| Layer Type | Contents | Depth Sorting |
|-----------|----------|---------------|
| **Background** | Color fill or tiled image | Always behind everything |
| **Tile Map** | Tile grid from a tile set | Manual depth via layer order |
| **Instance** | Game objects (player, enemies, pickups) | By layer, or per-instance depth |
| **Asset** | Sprites and sequences placed visually (no instance, no events) | Manual depth via layer order |
| **Effect** | Post-processing on everything below (blur, color grading, etc.) | Applied to layers beneath |
| **Filter** | Post-processing on the layer directly below | Applied to one layer |

### Organizing Layers

A typical 2D game layer stack (top to bottom):

```
┌─ UI (Instance layer — HUD objects)
├─ Effect_Vignette (Effect layer)
├─ Foreground_Tiles (Tile Map — decorations that overlap the player)
├─ Instances (Instance layer — player, enemies, NPCs)
├─ Midground_Tiles (Tile Map — main terrain)
├─ Background_Tiles (Tile Map — distant walls, floors)
├─ Parallax_Far (Background layer — slow-scrolling sky)
└─ Parallax_Near (Background layer — medium-scrolling clouds)
```

---

## GML Tilemap Functions

All tilemap operations work on a **tile map element ID**, obtained from a layer.

### Getting the Tile Map ID

```gml
// By layer name (most common)
var _tilemap = layer_tilemap_get_id("Midground_Tiles");

// Create a new tilemap on an existing layer at runtime
var _layer = layer_create(100); // depth 100
var _tilemap = layer_tilemap_create(_layer, 0, 0, ts_Terrain, 64, 48);
// ts_Terrain = tile set asset, 64 columns, 48 rows
```

### Reading Tiles

```gml
// By cell coordinates (column, row)
var _tiledata = tilemap_get(_tilemap, _col, _row);

// By pixel position (room coordinates)
var _tiledata = tilemap_get_at_pixel(_tilemap, mouse_x, mouse_y);

// Extract tile index from tile data
var _index = tile_get_index(_tiledata);
if (_index == 0) {
    // Cell is empty (index 0 = no tile)
}
```

### Writing Tiles

```gml
// Set a cell to tile index 5
tilemap_set(_tilemap, 5, _col, _row);

// Set by pixel position
tilemap_set_at_pixel(_tilemap, 5, _px, _py);

// Clear a cell
tilemap_set(_tilemap, 0, _col, _row);
```

### Tile Data Bitfield

A tile data value encodes more than the index — it includes transform flags:

```gml
var _data = tilemap_get(_tilemap, _col, _row);
var _index  = tile_get_index(_data);
var _flipx  = tile_get_mirror(_data);  // horizontal flip
var _flipy  = tile_get_flip(_data);    // vertical flip
var _rotate = tile_get_rotate(_data);  // 90° rotation

// Create new tile data with transforms
var _new = tile_set_mirror(tile_set_flip(5, true), true);
// Tile index 5, flipped both axes
tilemap_set(_tilemap, _new, _col, _row);
```

This is powerful for procedural level generation — a single tile index with 4 transform flags gives you up to 8 visual variants from one tile.

### Collision with Tilemaps

Tiles have no built-in collision. The standard pattern is to use a dedicated **collision tile map** — a separate tile map layer where filled cells mean "solid" and empty cells mean "passable."

```gml
/// In a collision script or Step event
var _tilemap = layer_tilemap_get_id("Collision");
var _tile = tilemap_get_at_pixel(_tilemap, bbox_right, bbox_bottom);
if (tile_get_index(_tile) != 0) {
    // Hit a solid tile — resolve collision
}
```

For more precise collision, check all four bbox corners (or use a sweep along the movement vector). Many developers use a **collision function** like this:

```gml
/// @function tile_meeting(tilemap, x, y, bbox)
/// @description Returns true if the bbox at (x, y) overlaps any non-empty tile
function tile_meeting(_tilemap, _x, _y, _inst) {
    var _left   = _x + _inst.bbox_left   - _inst.x;
    var _top    = _y + _inst.bbox_top    - _inst.y;
    var _right  = _x + _inst.bbox_right  - _inst.x;
    var _bottom = _y + _inst.bbox_bottom - _inst.y;

    // Check all four corners
    if (tile_get_index(tilemap_get_at_pixel(_tilemap, _left,  _top))    != 0) return true;
    if (tile_get_index(tilemap_get_at_pixel(_tilemap, _right, _top))    != 0) return true;
    if (tile_get_index(tilemap_get_at_pixel(_tilemap, _left,  _bottom)) != 0) return true;
    if (tile_get_index(tilemap_get_at_pixel(_tilemap, _right, _bottom)) != 0) return true;

    return false;
}
```

---

## Performance Best Practices

1. **Use tiles, not objects, for static visuals.** A room with 5,000 tile cells runs smoothly. A room with 5,000 object instances does not.
2. **Keep tile sets to power-of-two sprite dimensions** (256×256, 512×512, etc.) for optimal GPU texture packing.
3. **Minimize tile map layers.** Each tile map layer is one draw call. Three layers (background, midground, foreground) is typical; ten layers will hurt batching.
4. **Animated tiles are cheaper than object-based animations** but costlier than static tiles. Use them for small repeating effects (water shimmer), not large animated surfaces.
5. **Output border padding** of 1–2 px in the tile set editor prevents edge bleeding at non-integer camera positions or when scaling.
