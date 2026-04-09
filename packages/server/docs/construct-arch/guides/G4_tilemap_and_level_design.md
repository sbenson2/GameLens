# G4 — Tilemap and Level Design in Construct 3

> **Category:** guide · **Engine:** Construct · **Related:** [E1 Architecture Overview](../architecture/E1_architecture_overview.md) · [G1 Event Sheet Patterns](G1_event_sheet_patterns.md) · [R1 Behaviors and Effects](../reference/R1_behaviors_and_effects.md)

---

## How Tilemaps Work in Construct 3

The **Tilemap** object is Construct 3's built-in tool for painting grid-based levels. Instead of placing individual Sprite objects for every floor tile and wall, you paint tiles from a single spritesheet onto a grid. This is faster to design, far more memory-efficient, and gives you built-in collision support.

A Tilemap object holds a single **tileset image** (a spritesheet where every tile is the same size) and a **tile data grid** that records which tile index sits at each cell. The engine renders the entire grid as a single object, which is drastically cheaper than hundreds of individual sprites.

---

## Setting Up a Tilemap

### 1. Prepare Your Tileset

Create a spritesheet where every tile occupies the same rectangular cell. Common sizes are 16×16, 32×32, or 64×64 pixels. Tiles are numbered left-to-right, top-to-bottom starting at index 0:

```
[0 ][1 ][2 ][3 ]
[4 ][5 ][6 ][7 ]
[8 ][9 ][10][11]
```

**Tip:** Include a blank (transparent) tile at index 0. Construct uses tile index `-1` to mean "no tile," but having a visually empty tile at 0 is handy for cleared areas.

### 2. Add the Tilemap Object

1. Right-click the **Layout View** → **Insert New Object** → **Tilemap**.
2. In the object's image editor, import your tileset spritesheet.
3. Set the **Tile Width** and **Tile Height** to match your tile size.

### 3. Configure the Layout Grid

Go to **Layout Properties** and set `Snap to → Grid` with the same tile dimensions. This ensures everything aligns when you paint in the editor.

### 4. Paint with the Tilemap Bar

Open **View → Bars → Tilemap Bar** (or press **T** when a Tilemap is selected). The bar shows your tileset — click a tile to select it, then click or drag in the Layout View to paint.

The Tilemap Bar tools:

| Tool | Shortcut | What It Does |
|------|----------|--------------|
| **Pencil** | B | Paint one tile at a time |
| **Rectangle** | R | Fill a rectangular region |
| **Erase** | E | Remove tiles (set to -1) |
| **Tile Picker** | (click existing tile) | Select a tile from the layout |
| **Flip/Rotate** | Toolbar buttons | Mirror or rotate the selected tile before painting |

---

## Auto-Tiling with Brushes

Manually painting corner pieces, edge tiles, and transitions is tedious. Construct 3's **Tilemap Brush Editor** automates this with pattern-based brushes.

### Creating an Auto-Tile Brush

1. Open the **Tilemap Bar** → click the **brush icon** → **New Auto-Tile Brush**.
2. In the Brush Editor, you'll see a template grid. Assign tiles from your tileset to each position: corners, edges, inner corners, and center fill.
3. Once configured, select your brush and paint normally — Construct automatically picks the correct corner, edge, or center tile based on neighboring tiles.

### Patch Brushes

**Patch brushes** are simpler — they stamp a fixed rectangular pattern of tiles. Useful for placing a pre-built feature (a door, a window, a decorative cluster) in one click.

1. Tilemap Bar → brush icon → **New Patch Brush**.
2. Define the tile arrangement in the grid.
3. Click to stamp the patch anywhere in the layout.

### When to Use Which

- **Auto-tile brushes** for terrain, walls, water, paths — anything where edges need to connect properly.
- **Patch brushes** for multi-tile decorations, pre-built structures, or furniture.
- **Manual pencil** for fine-tuning individual tiles after a brush pass.

---

## Tilemap Collisions

The Tilemap object has a built-in collision system that is separate from regular Sprite collisions.

### Setting Up Collision

1. In the Tilemap's image editor, each tile can be marked as **collidable** or **non-collidable** (the collision polygon is auto-generated from the tile image, or you can set it manually).
2. In your event sheet, use the **Tilemap** conditions for overlap detection:

```
Condition: Sprite "Player" → Is overlapping → Tilemap
Action:    (handle collision — stop movement, take damage, etc.)
```

3. For platformer physics, add the **Solid** behavior to the Tilemap. The Platform behavior on the player will automatically respect tilemap collision shapes.

### Per-Tile Collision Control

Not every tile needs collision. In the tileset editor, you can configure collision polygons on a per-tile basis:

- **Solid tiles** (walls, floors): full-cell collision polygon.
- **Slope tiles**: diagonal collision polygon for ramps and hills.
- **Passthrough tiles**: decorative tiles with no collision polygon.
- **One-way tiles**: combined with Platform behavior's "fall through" options.

---

## Runtime Tilemap Manipulation

Construct 3 lets you read and modify the tilemap from event sheets or JavaScript at runtime — essential for destructible terrain, procedural generation, or in-game level editors.

### Key Expressions and Actions

| Expression / Action | Purpose |
|---------------------|---------|
| `Tilemap.TileAt(x, y)` | Get the tile index at a layout position (returns -1 if empty) |
| `Tilemap.TileAtCell(col, row)` | Get tile index by grid cell coordinates |
| **Set tile at** action | Place a tile at a position programmatically |
| **Erase tile at** action | Remove a tile at a position |
| `Tilemap.MapWidth` | Total width of the tilemap in pixels |
| `Tilemap.MapHeight` | Total height of the tilemap in pixels |
| `Tilemap.MapWidthCells` | Number of tile columns |
| `Tilemap.MapHeightCells` | Number of tile rows |

### Example: Destructible Blocks

```
Event: Player → On collision with Tilemap
  Sub-event: Keyboard → Space is down
  Condition: Tilemap.TileAt(Player.X, Player.Y + 32) = 5   // tile 5 = breakable block
  Action:    Tilemap → Erase tile at (Player.X, Player.Y + 32)
  Action:    Spawn object "spr_debris" at (Player.X, Player.Y + 32)
  Action:    Audio → Play "sfx_break"
```

### Example: Procedural Generation

```
Event: System → On start of layout
  Action: System → For "col" from 0 to Tilemap.MapWidthCells - 1
    Sub-event: System → For "row" from 0 to Tilemap.MapHeightCells - 1
      Condition: random(1) < 0.3
      Action: Tilemap → Set tile at cell (loopindex("col"), loopindex("row")) to choose(1, 2, 3)
```

---

## Tilemap Scrolling and Parallax

### Camera Scrolling

For levels larger than the viewport, Construct's **ScrollTo** behavior (attached to the player or a camera controller object) automatically scrolls the view. The Tilemap only renders tiles visible on screen, so large maps are efficient.

### Parallax with Multiple Tilemaps

For parallax backgrounds:

1. Create multiple Tilemap objects on different **layers**.
2. Set each layer's **Parallax** property (e.g., background layer at 50,50 scrolls at half speed).
3. Paint each Tilemap with appropriate tiles for that depth layer.

This creates depth without additional performance cost — Construct's layer-based parallax is built into the rendering pipeline.

---

## Level Design Workflow

A practical workflow for building levels with tilemaps:

### 1. Block Out First

Start with a minimal tileset: one solid tile, one empty tile, one hazard tile. Paint the level layout focusing on gameplay flow — jump distances, platform spacing, enemy placement zones. Test the layout with placeholder art.

### 2. Tile Art Pass

Replace placeholder tiles with final art. Use auto-tile brushes for terrain edges. Add decoration tiles on a separate Tilemap layer in front of or behind the gameplay layer.

### 3. Collision Audit

Walk through the level testing every surface. Check for:

- Tiles that should be solid but aren't (missing collision polygon).
- Visual seams between tiles (sub-pixel gaps — fix by ensuring tiles overlap by 1px at edges, or use "Pixel rounding" in project settings).
- Slopes that feel too steep or cause jitter (adjust collision polygon angles).

### 4. Polish Layer

Add a foreground Tilemap layer for elements that render in front of the player (overhanging vines, cave ceilings). Set this layer's Z-order above the player's layer.

---

## Performance Notes

- **Tilemap vs. Sprites:** A single Tilemap with 1,000 tiles is vastly cheaper than 1,000 individual Sprite objects. Always prefer Tilemap for repetitive grid-based elements.
- **Tile count limits:** Construct handles tilemaps with tens of thousands of cells efficiently. The rendering only draws what's on screen.
- **Multiple small tilemaps vs. one large one:** For very large worlds, consider splitting into room-sized tilemaps and loading/unloading them as the player moves. This keeps memory bounded.
- **Collision complexity:** Simple rectangular collision polygons are cheapest. Complex per-tile collision shapes (many vertices) add overhead — keep slope polygons to 3-4 vertices.

---

## Quick Reference

| Task | How |
|------|-----|
| Open Tilemap Bar | View → Bars → Tilemap Bar (or select Tilemap + press T) |
| Paint tiles | Select tile in bar → click/drag in Layout View |
| Create auto-tile brush | Tilemap Bar → brush icon → New Auto-Tile Brush |
| Read tile at position | `Tilemap.TileAt(x, y)` expression |
| Place tile at runtime | Tilemap → Set tile at action |
| Erase tile at runtime | Tilemap → Erase tile at action |
| Make tilemap solid | Add Solid behavior to Tilemap object |
| Add parallax | Set layer Parallax property (e.g., 50, 50 for half-speed) |
