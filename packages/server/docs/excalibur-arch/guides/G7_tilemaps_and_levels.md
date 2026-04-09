# Tilemaps and Level Design

> **Category:** guide · **Engine:** Excalibur · **Related:** [Actors and Entities](G1_actors_and_entities.md), [Physics and Collisions](G3_physics_and_collisions.md), [Architecture Overview](../architecture/E1_architecture_overview.md)

Excalibur provides a built-in `TileMap` class for rendering grid-based levels — platformers, RPGs, top-down worlds, and strategy maps. Individual tiles can hold multiple layered graphics and act as solid colliders. For visual map editing, the official `@excaliburjs/plugin-tiled` plugin imports maps from the Tiled editor. This guide covers programmatic tilemap creation, the Tiled plugin workflow, isometric maps, collision setup, and common level design patterns.

---

## Programmatic TileMap

### Creating a TileMap

Construct a `TileMap` by specifying grid dimensions, tile size, and an optional position:

```typescript
import { Engine, TileMap, vec } from "excalibur";

const game = new Engine({ width: 800, height: 600 });

const tilemap = new TileMap({
  pos: vec(0, 0),       // world position of the top-left corner
  rows: 20,             // number of rows
  columns: 25,          // number of columns
  tileWidth: 32,        // pixel width of each tile
  tileHeight: 32,       // pixel height of each tile
});

game.add(tilemap);
```

### Accessing Tiles

Tiles are stored in a flat array but accessed by column (x) and row (y) using zero-based indexing:

```typescript
// Get the tile at column 5, row 3
const tile = tilemap.getTile(5, 3);

// Get all tiles as a flat array
const allTiles = tilemap.tiles;
```

### Adding Graphics to Tiles

Each tile can display one or more graphics. Graphics are layered in the order they are added — the last graphic draws on top:

```typescript
import { ImageSource, SpriteSheet } from "excalibur";

const tilesetImage = new ImageSource("./images/tileset.png");
const spriteSheet = SpriteSheet.fromImageSource({
  image: tilesetImage,
  grid: { rows: 10, columns: 10, spriteWidth: 32, spriteHeight: 32 },
});

// After loading, assign sprites to tiles
for (let row = 0; row < tilemap.rows; row++) {
  for (let col = 0; col < tilemap.columns; col++) {
    const tile = tilemap.getTile(col, row);
    const sprite = spriteSheet.getSprite(col % 10, row % 10);
    if (sprite) {
      tile.addGraphic(sprite);
    }
  }
}
```

### Multiple Graphic Layers

Stack graphics on a single tile for layered effects — a ground tile below a decoration:

```typescript
const grassSprite = spriteSheet.getSprite(0, 0);
const flowerSprite = spriteSheet.getSprite(3, 2);

const tile = tilemap.getTile(4, 6);
if (grassSprite) tile.addGraphic(grassSprite);   // bottom layer
if (flowerSprite) tile.addGraphic(flowerSprite);  // drawn on top
```

Remove or clear graphics:

```typescript
tile.removeGraphic(flowerSprite);
tile.clearGraphics();
```

---

## Solid Tiles and Collision

Mark tiles as solid to make them act as fixed colliders. Actors with physics bodies will collide with solid tiles automatically:

```typescript
// Mark individual tiles as solid
const wallTile = tilemap.getTile(3, 0);
wallTile.solid = true;

// Build a floor: set the bottom row solid
for (let col = 0; col < tilemap.columns; col++) {
  const floorTile = tilemap.getTile(col, tilemap.rows - 1);
  floorTile.solid = true;
  const floorSprite = spriteSheet.getSprite(1, 0);
  if (floorSprite) floorTile.addGraphic(floorSprite);
}
```

When `tile.solid = true` and no custom collider is assigned, Excalibur uses the tile's bounding rectangle as the collision shape. For custom collision shapes, assign a collider directly:

```typescript
import { Shape } from "excalibur";

// Slope collider on a tile
tile.solid = true;
tile.addCollider(Shape.Polygon([
  vec(0, 32),
  vec(32, 32),
  vec(32, 0),
]));
```

---

## The Tiled Plugin

For most games, designing levels in a visual editor is far more productive than placing tiles in code. The `@excaliburjs/plugin-tiled` plugin imports maps created with the [Tiled Map Editor](https://www.mapeditor.org/).

### Installation

```bash
npm install @excaliburjs/plugin-tiled
```

### Basic Usage

```typescript
import { Engine, Loader } from "excalibur";
import { TiledResource } from "@excaliburjs/plugin-tiled";

const game = new Engine({ width: 800, height: 600 });

// Create the Tiled resource pointing to your .tmx or .tmj file
const tiledMap = new TiledResource("./maps/level1.tmx");

// Load via the Excalibur Loader
const loader = new Loader([tiledMap]);

await game.start(loader);

// Add all layers, objects, and colliders to the current scene
tiledMap.addToScene(game.currentScene);
```

### Supported Formats

| Format | Extension | Notes |
|---|---|---|
| Tiled Map (XML) | `.tmx` | Traditional format |
| Tiled Map (JSON) | `.tmj` | Smaller file size, easier to parse |
| Tileset (XML) | `.tsx` | External tileset definitions |
| Tileset (JSON) | `.tsj` | JSON variant |
| Template | `.tx`, `.tj` | Object templates |

### Supported Map Types

| Type | Supported |
|---|---|
| Orthogonal | Yes |
| Isometric | Yes |
| Hexagonal | Not yet |
| Isometric Staggered | Not yet |
| Infinite (chunked) | Yes — merged into a single TileMap |

### Marking Layers Solid

In the Tiled editor, add a custom boolean property `solid = true` on a tile layer. The plugin treats any tile with a non-zero GID in that layer as a solid collision rectangle:

```
Tiled Editor → Layer Properties → Add Property
  Name: solid
  Type: bool
  Value: true
```

This is the recommended approach for platformer floors, walls, and obstacles.

### Accessing Tiled Objects

Tiled object layers let you place spawn points, triggers, and other game entities. Access them after loading:

```typescript
// Get objects from a named object layer
const objectLayer = tiledMap.getObjectLayers("spawns");
for (const obj of objectLayer) {
  // obj contains x, y, width, height, name, type, and custom properties
  if (obj.name === "player-start") {
    player.pos = vec(obj.x, obj.y);
  }
}
```

---

## Isometric TileMaps

Excalibur supports isometric tilemaps natively with the `IsometricMap` class:

```typescript
import { IsometricMap, vec } from "excalibur";

const isoMap = new IsometricMap({
  pos: vec(200, 100),
  tileWidth: 64,
  tileHeight: 32,
  columns: 10,
  rows: 10,
});

game.add(isoMap);

// Access tiles the same way
const tile = isoMap.getTile(3, 4);
// Tile coordinates are in isometric grid space
```

The Tiled plugin also supports isometric maps — export from Tiled as isometric and the plugin handles the coordinate transformation.

---

## LDtk Plugin

Excalibur also has an official plugin for [LDtk](https://ldtk.io/), another popular level editor:

```bash
npm install @excaliburjs/plugin-ldtk
```

```typescript
import { LdtkResource } from "@excaliburjs/plugin-ldtk";

const ldtkMap = new LdtkResource("./maps/world.ldtk");
const loader = new Loader([ldtkMap]);
await game.start(loader);
ldtkMap.addToScene(game.currentScene);
```

---

## Common Patterns

### Procedural Level Generation

Generate tile data from an algorithm — cellular automata, noise functions, or random walks:

```typescript
function generateCaveMap(tilemap: TileMap, spriteSheet: SpriteSheet): void {
  const grid: boolean[][] = [];

  // Initialize random fill (45% walls)
  for (let row = 0; row < tilemap.rows; row++) {
    grid[row] = [];
    for (let col = 0; col < tilemap.columns; col++) {
      grid[row][col] = Math.random() < 0.45;
    }
  }

  // Cellular automata smoothing (4 iterations)
  for (let i = 0; i < 4; i++) {
    const next = grid.map((r) => [...r]);
    for (let row = 1; row < tilemap.rows - 1; row++) {
      for (let col = 1; col < tilemap.columns - 1; col++) {
        let neighbors = 0;
        for (let dr = -1; dr <= 1; dr++) {
          for (let dc = -1; dc <= 1; dc++) {
            if (grid[row + dr][col + dc]) neighbors++;
          }
        }
        next[row][col] = neighbors >= 5;
      }
    }
    grid.splice(0, grid.length, ...next);
  }

  // Apply to tilemap
  for (let row = 0; row < tilemap.rows; row++) {
    for (let col = 0; col < tilemap.columns; col++) {
      const tile = tilemap.getTile(col, row);
      if (grid[row][col]) {
        tile.solid = true;
        const wallSprite = spriteSheet.getSprite(1, 0);
        if (wallSprite) tile.addGraphic(wallSprite);
      } else {
        const floorSprite = spriteSheet.getSprite(0, 0);
        if (floorSprite) tile.addGraphic(floorSprite);
      }
    }
  }
}
```

### Camera Following with Tilemap Bounds

Constrain the camera so it never shows empty space beyond the map:

```typescript
import { Engine, Actor, BoundingBox } from "excalibur";

const mapWidth = tilemap.columns * tilemap.tileWidth;
const mapHeight = tilemap.rows * tilemap.tileHeight;

// Set camera strategy to follow the player
game.currentScene.camera.strategy.lockToActor(player);

// Clamp camera to map bounds
game.currentScene.camera.strategy.limitCameraBounds(
  new BoundingBox(0, 0, mapWidth, mapHeight)
);
```

### Loading Multiple Levels

Use scenes to manage level transitions:

```typescript
import { Scene, Engine, Loader } from "excalibur";
import { TiledResource } from "@excaliburjs/plugin-tiled";

class Level extends Scene {
  private tiledMap: TiledResource;

  constructor(mapPath: string) {
    super();
    this.tiledMap = new TiledResource(mapPath);
  }

  getResources(): TiledResource[] {
    return [this.tiledMap];
  }

  onActivate(): void {
    this.tiledMap.addToScene(this);
  }

  onDeactivate(): void {
    this.clear(); // remove all entities
  }
}

// Register levels
const level1 = new Level("./maps/level1.tmx");
const level2 = new Level("./maps/level2.tmx");

game.addScene("level1", level1);
game.addScene("level2", level2);

// Preload all level resources
const allResources = [
  ...level1.getResources(),
  ...level2.getResources(),
];
const loader = new Loader(allResources);
await game.start(loader);

game.goToScene("level1");
```

### Tile-Based Pathfinding

Query the tilemap to build a walkability grid for A* or similar algorithms:

```typescript
function isWalkable(col: number, row: number): boolean {
  if (col < 0 || col >= tilemap.columns || row < 0 || row >= tilemap.rows) {
    return false;
  }
  return !tilemap.getTile(col, row).solid;
}

// Build a grid for your pathfinding library
const walkGrid: boolean[][] = [];
for (let row = 0; row < tilemap.rows; row++) {
  walkGrid[row] = [];
  for (let col = 0; col < tilemap.columns; col++) {
    walkGrid[row][col] = isWalkable(col, row);
  }
}
```

---

## Performance Notes

- **Tile count:** TileMaps render efficiently through batched draw calls. Maps of 100×100 tiles or more are fine on desktop. On mobile, keep visible tile counts reasonable (< 5,000 visible at once).
- **Off-screen culling:** Excalibur automatically culls tiles outside the camera viewport — only visible tiles are drawn each frame.
- **Collision optimization:** Solid tiles use a spatial hash internally, so collision checks are O(1) per actor, not O(n) per tile.
- **Tiled plugin loading:** `.tmj` (JSON) files parse faster than `.tmx` (XML). Prefer JSON export from Tiled for production builds.
- **Infinite maps:** Tiled's infinite/chunked maps are merged into a single TileMap by the plugin. Very large infinite maps may use significant memory — constrain map size or implement chunk streaming manually.

---

## Cross-Framework Comparison

| Concept | Excalibur | Phaser | Kaplay | PixiJS |
|---|---|---|---|---|
| TileMap class | `TileMap` (built-in) | `Tilemap` (built-in) | `addLevel()` helper | No built-in (use libraries) |
| Create map | `new TileMap({ rows, columns, ... })` | `this.make.tilemap()` | `k.addLevel(layout, opts)` | Manual sprite grid |
| Tile access | `tilemap.getTile(col, row)` | `tilemap.getTileAt(x, y)` | Level string layout | N/A |
| Solid collision | `tile.solid = true` | `setCollision()` / `setCollisionByProperty()` | Component-based tags | Manual colliders |
| Graphics | `tile.addGraphic(sprite)` | Auto from tileset | Auto from symbol map | Manual sprite placement |
| Tiled editor support | `@excaliburjs/plugin-tiled` | Built-in Tiled loader | Community plugins | Community plugins |
| LDtk support | `@excaliburjs/plugin-ldtk` | Community plugins | Not built-in | Community plugins |
| Isometric | `IsometricMap` class | Built-in isometric | Not built-in | Manual |
| Camera clamping | `limitCameraBounds()` | `camera.setBounds()` | `k.camPos()` manual | Manual viewport logic |
