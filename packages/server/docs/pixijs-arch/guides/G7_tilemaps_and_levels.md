# Tilemaps and Level Design

> **Category:** guide · **Engine:** PixiJS · **Related:** [Asset Loading](G1_asset_loading.md), [Sprites and Animation](G2_sprites_animation.md), [Architecture Overview](../architecture/E1_architecture_overview.md)

PixiJS is a rendering engine, not a full game framework, so it has no built-in tilemap system. Instead, you use the official `@pixi/tilemap` package for GPU-accelerated tile rendering, or build a lightweight tile renderer yourself with Sprites or Graphics. This guide covers both approaches, integration with the Tiled map editor, collision strategies, and performance considerations for large maps.

---

## @pixi/tilemap Package

The [`@pixi/tilemap`](https://github.com/pixijs-userland/tilemap) package provides `Tilemap` and `CompositeTilemap` classes optimized for batch-rendering thousands of tiles in a single draw call using a custom shader.

### Installation

```bash
npm install @pixi/tilemap
```

### Basic Usage

```typescript
import { Application, Assets } from 'pixi.js';
import { CompositeTilemap } from '@pixi/tilemap';

const app = new Application();
await app.init({ width: 800, height: 600 });
document.body.appendChild(app.canvas);

// Load the tileset spritesheet
await Assets.load('assets/tileset.json'); // spritesheet JSON + PNG

// Create the tilemap
const tilemap = new CompositeTilemap();
app.stage.addChild(tilemap);

// Place tiles — each call specifies a texture frame and position
// tile(texture, x, y, options?)
tilemap.tile('grass', 0, 0);
tilemap.tile('grass', 32, 0);
tilemap.tile('stone', 64, 0);
tilemap.tile('water', 0, 32);
```

### CompositeTilemap vs Tilemap

- **Tilemap** — a single tilemap layer bound to a fixed set of tile textures (limited by GPU texture units). Fast but constrained.
- **CompositeTilemap** — a lazy composite that internally creates multiple `Tilemap` layers as needed when you use tile textures beyond the per-layer limit. Use this by default; it handles the texture unit limit automatically.

```typescript
// CompositeTilemap manages layering internally
const tilemap = new CompositeTilemap();

// You can freely mix textures from different spritesheets
tilemap.tile('terrain_grass', 0, 0);
tilemap.tile('decoration_flower', 0, 0); // different spritesheet — auto-layered
```

### Clearing and Rebuilding

To update the tilemap (e.g., loading a new level), clear it and re-add tiles:

```typescript
function loadLevel(tilemap: CompositeTilemap, levelData: number[][], tileSize: number): void {
  tilemap.clear(); // remove all existing tiles

  for (let row = 0; row < levelData.length; row++) {
    for (let col = 0; col < levelData[row].length; col++) {
      const tileId = levelData[row][col];
      if (tileId === 0) continue; // skip empty tiles

      const frameName = `tile_${tileId}`;
      tilemap.tile(frameName, col * tileSize, row * tileSize);
    }
  }
}
```

---

## Loading Tiled Editor Maps

PixiJS has no built-in Tiled JSON parser, but the format is straightforward to process manually. Export your map from Tiled as JSON, load it, and iterate over layers and tile data.

### Tiled JSON Structure

A Tiled JSON map contains `layers` (each with a `data` array of tile GIDs), `tilesets` (image sources and first GID), and map dimensions. The tile GID in the data array maps to a tileset frame.

### Manual Tiled Loader

```typescript
import { Assets } from 'pixi.js';
import { CompositeTilemap } from '@pixi/tilemap';

interface TiledLayer {
  name: string;
  type: string;
  data?: number[];
  width: number;
  height: number;
  visible: boolean;
  objects?: TiledObject[];
}

interface TiledObject {
  name: string;
  type: string;
  x: number;
  y: number;
  width: number;
  height: number;
  properties?: Array<{ name: string; value: unknown }>;
}

interface TiledMap {
  width: number;
  height: number;
  tilewidth: number;
  tileheight: number;
  layers: TiledLayer[];
  tilesets: Array<{ firstgid: number; name: string; tilecount: number; columns: number }>;
}

async function loadTiledMap(mapPath: string): Promise<TiledMap> {
  const response = await fetch(mapPath);
  return response.json() as Promise<TiledMap>;
}

function renderTileLayer(
  tilemap: CompositeTilemap,
  layer: TiledLayer,
  mapData: TiledMap,
  tileFramePrefix: string,
): void {
  if (!layer.data || !layer.visible) return;

  const { tilewidth, tileheight } = mapData;

  for (let i = 0; i < layer.data.length; i++) {
    const gid = layer.data[i];
    if (gid === 0) continue; // empty tile

    const col = i % layer.width;
    const row = Math.floor(i / layer.width);

    // Convert GID to a frame name in your spritesheet
    // Subtract firstgid to get the local tile index
    const localId = gid - mapData.tilesets[0].firstgid;
    const frameName = `${tileFramePrefix}_${localId}`;

    tilemap.tile(frameName, col * tilewidth, row * tileheight);
  }
}

// Usage
const mapData = await loadTiledMap('assets/maps/level1.json');
await Assets.load('assets/tileset.json');

const tilemap = new CompositeTilemap();
app.stage.addChild(tilemap);

for (const layer of mapData.layers) {
  if (layer.type === 'tilelayer') {
    renderTileLayer(tilemap, layer, mapData, 'terrain');
  }
}
```

### Extracting Object Layers

Tiled object layers store spawn points, triggers, and other metadata. Parse them separately:

```typescript
function extractObjects(mapData: TiledMap): TiledObject[] {
  const objects: TiledObject[] = [];
  for (const layer of mapData.layers) {
    if (layer.type === 'objectgroup' && layer.objects) {
      objects.push(...layer.objects);
    }
  }
  return objects;
}

// Place game entities from object data
const objects = extractObjects(mapData);
for (const obj of objects) {
  if (obj.type === 'player_spawn') {
    createPlayer(obj.x, obj.y);
  } else if (obj.type === 'enemy') {
    const enemyType = obj.properties?.find(p => p.name === 'enemyType')?.value as string;
    createEnemy(obj.x, obj.y, enemyType);
  }
}
```

---

## Manual Tile Rendering (No Plugin)

For simple tile layouts or when you want full control, render tiles as individual Sprites from a spritesheet. This is less performant than `@pixi/tilemap` for large maps but works without any extra dependency.

```typescript
import { Container, Sprite, Spritesheet } from 'pixi.js';

function renderSimpleTilemap(
  spritesheet: Spritesheet,
  data: number[][],
  tileSize: number,
): Container {
  const container = new Container();

  for (let row = 0; row < data.length; row++) {
    for (let col = 0; col < data[row].length; col++) {
      const id = data[row][col];
      if (id === 0) continue;

      const frameName = `tile_${id}`;
      if (!spritesheet.textures[frameName]) continue;

      const sprite = new Sprite(spritesheet.textures[frameName]);
      sprite.x = col * tileSize;
      sprite.y = row * tileSize;
      container.addChild(sprite);
    }
  }

  return container;
}
```

**Trade-offs:**

- Simple to set up — no additional package needed.
- Each tile is a separate display object — performance degrades past ~5,000 visible tiles.
- Use `@pixi/tilemap` for maps larger than ~50×50 tiles.

---

## Collision and Physics

PixiJS has no built-in physics. Collisions for tilemaps are typically handled with a separate library or simple grid-based checks.

### Grid-Based Collision

The most common approach for tile-based games: maintain a 2D collision grid derived from the tile data.

```typescript
class TileCollisionGrid {
  private grid: boolean[][];
  private tileSize: number;

  constructor(mapData: TiledMap, collisionLayerName: string) {
    this.tileSize = mapData.tilewidth;
    const layer = mapData.layers.find(l => l.name === collisionLayerName);

    this.grid = [];
    if (layer?.data) {
      for (let row = 0; row < layer.height; row++) {
        this.grid[row] = [];
        for (let col = 0; col < layer.width; col++) {
          // Any non-zero tile in the collision layer is solid
          this.grid[row][col] = layer.data[row * layer.width + col] !== 0;
        }
      }
    }
  }

  isSolid(worldX: number, worldY: number): boolean {
    const col = Math.floor(worldX / this.tileSize);
    const row = Math.floor(worldY / this.tileSize);
    if (row < 0 || row >= this.grid.length) return true; // out of bounds = solid
    if (col < 0 || col >= this.grid[0].length) return true;
    return this.grid[row][col];
  }

  isSolidTile(col: number, row: number): boolean {
    if (row < 0 || row >= this.grid.length) return true;
    if (col < 0 || col >= this.grid[0].length) return true;
    return this.grid[row][col];
  }
}
```

### Integration with matter.js

For full rigid-body physics, pair PixiJS with [matter.js](https://brm.io/matter-js/) and create static bodies from solid tiles:

```typescript
import Matter from 'matter-js';

function createTileBodies(
  engine: Matter.Engine,
  collisionGrid: TileCollisionGrid,
  mapWidth: number,
  mapHeight: number,
  tileSize: number,
): void {
  for (let row = 0; row < mapHeight; row++) {
    for (let col = 0; col < mapWidth; col++) {
      if (collisionGrid.isSolidTile(col, row)) {
        const body = Matter.Bodies.rectangle(
          col * tileSize + tileSize / 2,
          row * tileSize + tileSize / 2,
          tileSize,
          tileSize,
          { isStatic: true },
        );
        Matter.Composite.add(engine.world, body);
      }
    }
  }
}
```

---

## Camera Scrolling

PixiJS uses Container transforms for camera-like scrolling. Move the tilemap container to follow the player:

```typescript
function updateCamera(
  tilemapContainer: Container,
  playerX: number,
  playerY: number,
  screenWidth: number,
  screenHeight: number,
  mapWidthPx: number,
  mapHeightPx: number,
): void {
  // Center the camera on the player
  let camX = screenWidth / 2 - playerX;
  let camY = screenHeight / 2 - playerY;

  // Clamp to map boundaries
  camX = Math.min(0, Math.max(screenWidth - mapWidthPx, camX));
  camY = Math.min(0, Math.max(screenHeight - mapHeightPx, camY));

  tilemapContainer.x = camX;
  tilemapContainer.y = camY;
}
```

For smooth scrolling, use linear interpolation (lerp):

```typescript
tilemapContainer.x += (targetX - tilemapContainer.x) * 0.08;
tilemapContainer.y += (targetY - tilemapContainer.y) * 0.08;
```

---

## Performance Tips

- **Use `@pixi/tilemap`** for maps with more than a few hundred tiles — it batches everything into one or two draw calls.
- **Texture atlases:** Pack tileset images into a single spritesheet to minimize texture switches.
- **Only render visible tiles:** For very large maps (thousands of tiles wide), build your own culling: track which tiles fall within the camera viewport and only add those to the tilemap.
- **Avoid per-frame rebuilds:** Only call `tilemap.clear()` and re-add tiles when the level changes — not every frame.
- **Tile animation:** `@pixi/tilemap` supports animated tiles via `animX`/`animY` parameters. This shifts UV coordinates on the GPU rather than swapping textures.
- **32-bit index:** For maps exceeding 16,000 tiles per layer, enable `settings.use32bitIndex = true` in `@pixi/tilemap` settings.

---

## Cross-Framework Comparison

| Concept              | PixiJS                             | Phaser                          | Kaplay                        | Excalibur                     |
|----------------------|------------------------------------|---------------------------------|-------------------------------|-------------------------------|
| Tilemap support      | `@pixi/tilemap` (separate package) | Built-in `Tilemap` class        | `addLevel()` built-in         | Built-in `TileMap` class      |
| Tiled JSON import    | Manual parsing required            | `tilemapTiledJSON()` built-in   | Manual or community plugin    | Built-in Tiled resource       |
| Tile collision       | Manual grid or physics lib         | `setCollisionByProperty()`      | `body()` component on tiles   | `Tile.solid` property         |
| Object layers        | Manual JSON parsing                | `getObjectLayer()` built-in     | Not built-in                  | Not built-in                  |
| Map orientations     | Orthogonal (plugin limitation)     | Ortho, Iso, Hex, Staggered     | Orthogonal only               | Orthogonal only               |
| Dynamic tile changes | `clear()` + re-add                 | `putTileAt()`, `removeTileAt()` | Level rebuilding              | Tile manipulation methods     |
