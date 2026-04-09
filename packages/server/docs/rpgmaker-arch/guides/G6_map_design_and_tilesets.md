# G6 — Map Design and Tileset Management in RPG Maker MZ

> **Category:** guide · **Engine:** RPG Maker · **Related:** [E1 Architecture Overview](../architecture/E1_architecture_overview.md) · [G2 Event System Mastery](G2_event_system_mastery.md) · [R1 Database Configuration](../reference/R1_database_configuration.md)

---

Maps are the foundational content unit in RPG Maker MZ. Every area the player explores is a tile-based map built from **tilesets** (the visual palette) and populated with **events** (interactive objects and NPCs). This guide covers tileset structure, the map editor, regions, terrain tags, and parallax mapping techniques.

---

## Tileset Architecture

RPG Maker MZ tilesets are organized into **tabs A through E**, each serving a different purpose. Understanding this structure is essential for building maps that render correctly.

### Tab A — Autotiles (A1–A5)

Autotiles are special tiles that automatically connect to adjacent tiles of the same type, creating smooth borders for terrain like water, grass, and walls.

```
┌───────────────────────────────────────────────────┐
│  Tab A — Autotile Categories                       │
│                                                   │
│  A1 — Animated tiles (water, lava, waterfalls)    │
│       · 3-frame animation cycle                   │
│       · Always animates on the map                │
│                                                   │
│  A2 — Ground tiles (grass, dirt, sand, stone)     │
│       · Standard autotile borders                 │
│       · Most common terrain type                  │
│                                                   │
│  A3 — Building/wall exterior tiles                │
│       · Roof edges and wall surfaces              │
│       · Auto-connects for building shapes         │
│                                                   │
│  A4 — Wall-top tiles                              │
│       · Special passability: walkable on top,     │
│         impassable from the side                  │
│       · Used for cliffs and elevated terrain      │
│                                                   │
│  A5 — Normal tiles (non-autotile)                 │
│       · Standard single tiles placed in Tab A     │
│       · No auto-connection behavior               │
└───────────────────────────────────────────────────┘
```

### Tabs B–E — Standard Tiles

Tabs B through E hold regular (non-autotile) decorative and structural tiles. These are placed individually with no auto-connection logic.

| Tab | Typical Use | Tile IDs |
|-----|------------|----------|
| B | Buildings, fences, furniture (lower layer) | 0–255 |
| C | Decorations, objects (upper layer) | 256–511 |
| D | Additional objects, overlays | 512–767 |
| E | Extra tiles (often user-added) | 768–1023 |

**Layer ordering:** Tab A tiles draw first (ground layer), then B–E tiles stack on top in order. This layering determines what appears above or below the player character.

### Tileset Image Specifications

| Slot | Image Size | Tile Size | Notes |
|------|-----------|-----------|-------|
| A1 | 768×576 px | 48×48 px | 16 animated autotiles (2×3 frames each) |
| A2 | 768×576 px | 48×48 px | 16 ground autotiles |
| A3 | 768×384 px | 48×48 px | 16 wall autotiles |
| A4 | 768×720 px | 48×48 px | Wall-top autotiles |
| A5 | 384×768 px | 48×48 px | 128 normal tiles |
| B–E | 768×768 px each | 48×48 px | 256 tiles per tab |

---

## Map Editor Basics

### Creating a Map

In the map tree (left panel), right-click to create a new map. Key properties:

- **Display Name** — shown to the player (if using a map name display plugin)
- **Tileset** — which tileset palette this map uses
- **Width / Height** — map dimensions in tiles (max 256×256)
- **Scroll Type** — loop horizontally, vertically, both, or none
- **Encounter settings** — random battle configuration

### Drawing Layers

The map editor provides **two tile layers** plus an event layer:

```
┌─────────────────────────┐
│   Event Layer (top)     │  ← NPCs, treasure, doors
├─────────────────────────┤
│   Tile Layer 2 (B–E)   │  ← Decorations on top of ground
├─────────────────────────┤
│   Tile Layer 1 (A)     │  ← Ground, water, walls
└─────────────────────────┘
```

**Drawing modes:**
- **Pencil** — Place individual tiles
- **Rectangle** — Fill a rectangular area
- **Ellipse** — Draw circular/oval fills
- **Flood fill** — Fill connected same-type tiles
- **Shadow pen** — Add shadow effects to walls

### Passability

Tile passability (whether the player can walk on a tile) is configured in the **Database → Tilesets** editor, not on individual map tiles. Each tile gets a passability mark:

- **○** (circle) — Passable from all directions
- **×** (cross) — Impassable from all directions
- **☆** (star) — Always passable, drawn above the player (treetops, bridges)
- **Directional arrows** — Passable only from specific directions (one-way paths)

A4 wall-top tiles have special passability: passable when approached from above, impassable from the sides, creating natural cliff edges.

---

## Terrain Tags

Terrain tags are numeric labels (0–7) assigned to individual tiles in the Database → Tilesets editor. They don't affect rendering — instead, game events and plugins read them to trigger context-specific behavior.

### Common Uses

| Tag | Example Use |
|-----|------------|
| 0 | Default (no special behavior) |
| 1 | Grass — play footstep sound, spawn grass particles |
| 2 | Water — slow movement, splash sound, fishing allowed |
| 3 | Sand — different footstep sound, slightly slow |
| 4 | Wood/indoor floor — interior footstep sound |
| 5 | Snow — slow movement, snow particles |
| 6 | Damage floor — apply damage per step |
| 7 | Custom (plugin-defined behavior) |

### Reading Terrain Tags in Events

Use the **Script** command or a plugin to read the terrain tag under the player:

```javascript
// Get terrain tag at player's position
const x = $gamePlayer.x;
const y = $gamePlayer.y;
const tag = $gameMap.terrainTag(x, y);

if (tag === 2) {
    // Player is on water tile
    $gamePlayer._moveSpeed = 3; // Slow down
}
```

With plugins like **VisuStella's Events & Movement Core**, you can bind events to terrain tags declaratively without scripting.

---

## Regions

Regions are an invisible overlay (IDs 1–255) painted on the map in the editor's **Region** drawing mode. They act as spatial markers for gameplay logic.

```
┌─────────────────────────────────────────┐
│  Map with Region Overlay                 │
│                                         │
│  ┌───┬───┬───┬───┬───┐                 │
│  │   │ 1 │ 1 │ 1 │   │  Region 1:      │
│  ├───┼───┼───┼───┼───┤  "Safe zone"     │
│  │   │   │   │   │   │                  │
│  ├───┼───┼───┼───┼───┤                 │
│  │ 2 │ 2 │   │ 3 │ 3 │  Region 2: Boss │
│  │ 2 │ 2 │   │ 3 │ 3 │  Region 3: Shop │
│  └───┴───┴───┴───┴───┘                 │
└─────────────────────────────────────────┘
```

### Common Uses

- **Encounter zones** — Different enemy groups per region
- **Damage floors** — Apply damage when walking in a region
- **Event triggers** — Plugins can trigger events when the player enters a region
- **Restrict movement** — Block NPCs or vehicles from entering certain areas
- **Camera zones** — Trigger camera changes when entering a region

### Region Conditions in Events

```javascript
// Check if player is in region 2
if ($gameMap.regionId($gamePlayer.x, $gamePlayer.y) === 2) {
    // Trigger boss encounter
}
```

Many plugins (VisuStella, Yanfly) let you use region-based triggers without writing scripts — just set a plugin parameter like `Region 5 = Block Player Movement`.

---

## Parallax Mapping

Standard tile-based maps are limited to the grid. **Parallax mapping** replaces the tile layer with a full-size image, allowing hand-drawn or photo-realistic environments that break free of the 48×48 grid.

### How It Works

```
┌─────────────────────────────────────┐
│  Parallax Map Layers                │
│                                     │
│  ┌───────────────────────┐ ← Events layer (NPCs, objects)
│  │  Transparent map      │
│  │  (no tiles drawn)     │
│  ├───────────────────────┤ ← Parallax image (the actual visuals)
│  │  Your custom image    │
│  │  (drawn in Photoshop, │
│  │   Aseprite, etc.)     │
│  └───────────────────────┘
└─────────────────────────────────────┘
```

### Basic Setup

1. **Create your map image** in an external editor. Size it to match the map dimensions: `width_tiles × 48` by `height_tiles × 48` pixels (e.g., a 20×15 map = 960×720 px image).
2. **Save the image** to `img/parallaxes/` in your project folder.
3. **In Map Properties**, set the **Parallax Background** to your image.
4. **Enable scrolling** — check "Loop Horizontally" and/or "Loop Vertically" if your image tiles, or leave unchecked for a fixed background that scrolls with the player.
5. **Draw invisible collision** — on the actual tile layer, place impassable tiles (like an all-black tileset) where walls and obstacles are, but set the map's tile layer to show nothing visible. The player still collides with these tiles.

### Parallax Mapping Plugins

For more control, plugins extend the basic system:

- **VisuStella Visual Parallaxes** — Multiple parallax layers per map, each with independent scroll speed, opacity, and blend mode. Eliminates the one-parallax-per-map limitation.
- **Realtime Parallax Map Builder** (Sang Hendrix) — Visual drag-and-drop editor for composing parallax maps directly in RPG Maker, with layer management.
- **Dynamic Parallax Map** (Slayer2) — Enables parallax techniques on large maps by loading image sections dynamically, avoiding the memory cost of giant images.

### Parallax Tips

**Mind the file size.** A 100×100 tile map at 48px per tile produces a 4800×4800 image — that's a large PNG. Use JPEG for photographic backgrounds or compress PNGs aggressively.

**Draw passability separately.** Create a transparent "collision map" with passable/impassable tiles placed on the actual tile layer. The player interacts with this invisible grid while the parallax image provides the visuals.

**Use regions for precision.** Where tile-based collision feels too coarse, use regions with a movement restriction plugin to create more accurate passability boundaries.

---

## Map Design Best Practices

**Keep maps small and focused.** A 30×30 tile map with dense content is better than a 100×100 empty field. Players notice empty space.

**Use A4 wall-tops for natural elevation.** Cliffs and plateaus look best when A4 tiles handle the "walkable top, impassable side" logic automatically.

**Layer B–E tiles for depth.** Place a tree trunk on layer B and the canopy (star passability) on a higher layer so the player walks behind the canopy.

**Test passability by walking.** The editor's passability display is helpful but imperfect — always playtest to catch gaps where players can walk through walls.

**Consistent tileset assignment.** Don't spread related areas across different tilesets if they share visual themes. Each map can only use one tileset, so plan your tileset allocation across the game.

**Group events near points of interest.** Players expect interactive objects near visible landmarks — don't hide events on featureless tiles.

---

## Common Pitfalls

**Wrong autotile slot.** Placing an A2 image in the A3 slot (or vice versa) causes distorted auto-connections. Match the image format to the correct slot.

**Forgetting passability on new tilesets.** Custom tilesets default to all-passable. Configure passability in Database → Tilesets before using them on maps, or players walk through everything.

**Oversized parallax images.** Very large parallax PNGs can cause memory issues on mobile and web exports. Keep maps reasonable or use a dynamic loading plugin.

**Terrain tags set to 0.** Tag 0 is the default. If you forget to tag tiles, all your terrain-tag-based logic silently does nothing. Start custom tags at 1.

**Region paint over autotiles.** Regions are a separate layer and don't interfere with tile visuals, but forgetting to paint regions on newly added map areas is a common oversight when expanding maps.

---

## Next Steps

- **[G2 Event System Mastery](G2_event_system_mastery.md)** — Populate your maps with interactive events
- **[G1 Plugin Development](G1_plugin_development.md)** — Extend map behavior with custom plugins
- **[R1 Database Configuration](../reference/R1_database_configuration.md)** — Tileset and map property settings in the database
- **[R3 Rendering Pipeline](../reference/R3_rendering_pipeline.md)** — How tiles and parallax layers are composited
