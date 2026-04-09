# Tilemaps and Level Design

> **Category:** guide · **Engine:** Phaser · **Related:** [Scene Lifecycle](G1_scene_lifecycle.md), [Physics Systems](G2_physics_systems.md), [Architecture Overview](../architecture/E1_architecture_overview.md)

Phaser has deep, built-in tilemap support. It reads JSON maps exported from the Tiled editor (or from Phaser Editor 2D), handles multiple layers and tilesets, provides per-tile collision, and supports orthogonal, isometric, hexagonal, and staggered map orientations (since v3.50). This guide covers the full workflow from loading a Tiled map to rendering layers, enabling collisions, and working with object layers.

---

## Tiled Editor Setup

Before loading a tilemap in Phaser, the map must be exported correctly from Tiled:

1. **Tile layer format:** Set to CSV or Base64 (uncompressed). Phaser cannot read compressed tile data (zlib, gzip, zstd).
2. **Embed tilesets:** When adding a tileset, check "Embed in Map" so tile data is included in the JSON file. (Alternatively, use `this.load.tilemapTiledJSON()` and load external tileset images separately.)
3. **Export format:** File → Export As → **JSON map files (*.json)**.

**File structure example:**

```
assets/
  maps/
    level1.json        # Tiled JSON export
  tilesets/
    terrain.png        # tileset image referenced in the map
    decorations.png
```

---

## Loading Tilemap Assets

Load the JSON map and its tileset images in the scene's `preload`:

```typescript
class LevelScene extends Phaser.Scene {
  preload(): void {
    // The tilemap JSON
    this.load.tilemapTiledJSON('level1', 'assets/maps/level1.json');

    // Tileset images — the key must match the tileset name in Tiled
    this.load.image('terrain', 'assets/tilesets/terrain.png');
    this.load.image('decorations', 'assets/tilesets/decorations.png');
  }
}
```

For spritesheets used as tilesets (e.g., with margin/spacing), use `this.load.spritesheet()` instead.

---

## Creating the Tilemap

In `create`, build the tilemap, attach tileset images, and create layers:

```typescript
create(): void {
  // 1. Create the tilemap from the loaded JSON
  const map = this.make.tilemap({ key: 'level1' });

  // 2. Link tileset images to the tilemap
  //    arg1: name of the tileset in Tiled
  //    arg2: Phaser cache key from preload
  const terrainTiles = map.addTilesetImage('terrain', 'terrain');
  const decoTiles = map.addTilesetImage('decorations', 'decorations');

  // 3. Create layers — order determines render depth
  //    arg1: layer name in Tiled
  //    arg2: tileset(s) used by this layer
  const bgLayer = map.createLayer('Background', [terrainTiles!, decoTiles!]);
  const groundLayer = map.createLayer('Ground', terrainTiles!);
  const foregroundLayer = map.createLayer('Foreground', decoTiles!);
}
```

**Key points:**

- `addTilesetImage` returns `null` if the tileset name does not match the Tiled file — use the exact name from Tiled's tileset panel.
- `createLayer` returns `null` if the layer name does not match. Layer names are case-sensitive.
- A layer can use multiple tilesets — pass an array.
- Since Phaser 3.50, there is a single `TilemapLayer` class (the old `StaticTilemapLayer` / `DynamicTilemapLayer` split was removed).

---

## Tilemap Collision

### Collision by Tile Index

Mark specific tile indices as collidable, then enable physics overlap between the layer and game objects:

```typescript
// Mark tile indices 1 through 25 as collidable
groundLayer?.setCollision([1, 2, 3, 4, 5, 6, 7, 8, 9, 10,
  11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25]);

// Or use a range
groundLayer?.setCollisionBetween(1, 25);

// Exclude specific indices
groundLayer?.setCollisionByExclusion([-1, 0]); // everything except empty tiles
```

### Collision by Tiled Property

The cleanest approach: set a custom boolean property on tiles in Tiled (e.g., `collides: true`), then use it in Phaser:

```typescript
groundLayer?.setCollisionByProperty({ collides: true });
```

This avoids hardcoding tile IDs and survives tileset changes.

### Connecting to Arcade Physics

```typescript
// Enable collision between player sprite and the ground layer
this.physics.add.collider(player, groundLayer!);

// With a callback
this.physics.add.collider(player, groundLayer!, (obj1, obj2) => {
  // obj2 is the Tile that was hit
  const tile = obj2 as Phaser.Tilemaps.Tile;
  if (tile.properties.hazard) {
    this.playerHit();
  }
});
```

### Debug Rendering

Visualize which tiles are collidable during development:

```typescript
const debugGraphics = this.add.graphics().setAlpha(0.5);
groundLayer?.renderDebug(debugGraphics, {
  tileColor: null,                                   // non-colliding tiles
  collidingTileColor: new Phaser.Display.Color(243, 134, 48), // colliding
  faceColor: new Phaser.Display.Color(40, 39, 37),   // collision edges
});
```

---

## Object Layers

Tiled object layers store spawn points, triggers, and other non-tile data. Phaser can read them:

```typescript
// Get objects from a layer named "Spawns"
const spawns = map.getObjectLayer('Spawns')?.objects ?? [];

for (const obj of spawns) {
  if (obj.name === 'PlayerSpawn') {
    this.player = this.physics.add.sprite(obj.x!, obj.y!, 'hero');
  }
  if (obj.name === 'EnemySpawn') {
    this.spawnEnemy(obj.x!, obj.y!, obj.properties);
  }
}
```

Access custom Tiled properties on objects:

```typescript
// Tiled properties are in obj.properties as an array of { name, value }
function getTiledProperty(obj: Phaser.Types.Tilemaps.TiledObject, name: string): unknown {
  const prop = (obj.properties as Array<{ name: string; value: unknown }>)
    ?.find(p => p.name === name);
  return prop?.value;
}

const enemyType = getTiledProperty(obj, 'enemyType') as string;
```

---

## Dynamic Tile Manipulation

Tiles can be read and modified at runtime — useful for breakable blocks, secret passages, or procedural changes:

```typescript
// Get a tile at world coordinates
const tile = groundLayer?.getTileAtWorldXY(pointer.worldX, pointer.worldY);
if (tile) {
  // Remove the tile (set to -1)
  groundLayer?.removeTileAtWorldXY(pointer.worldX, pointer.worldY);
}

// Place a tile at grid coordinates
groundLayer?.putTileAt(42, 10, 5); // tileIndex 42 at column 10, row 5

// Replace one tile type with another across the entire layer
groundLayer?.replaceByIndex(5, 12); // replace all index-5 tiles with index-12
```

---

## Camera and Layer Scrolling

Tilemaps work with Phaser's camera system. Set the camera to follow the player, and configure world bounds to match the map size:

```typescript
// Camera follows the player
this.cameras.main.startFollow(player, true, 0.08, 0.08);

// Limit camera to map boundaries
this.cameras.main.setBounds(0, 0, map.widthInPixels, map.heightInPixels);

// Limit physics world to map boundaries
this.physics.world.setBounds(0, 0, map.widthInPixels, map.heightInPixels);
player.setCollideWorldBounds(true);
```

### Parallax Scrolling

Use `setScrollFactor` on background layers for a depth effect:

```typescript
bgLayer?.setScrollFactor(0.5, 0.5);   // scrolls at half speed — parallax
groundLayer?.setScrollFactor(1, 1);     // scrolls with camera (default)
foregroundLayer?.setScrollFactor(1.1, 1.1); // slight foreground parallax
```

---

## Isometric, Hexagonal, and Staggered Maps

Since Phaser 3.50, all four Tiled orientations are supported. Set the orientation in Tiled when creating the map — Phaser detects it automatically from the JSON.

```typescript
// No special code needed — orientation is read from the map data
const map = this.make.tilemap({ key: 'iso-level' });
const tiles = map.addTilesetImage('iso-terrain', 'iso-terrain');
const layer = map.createLayer('Ground', tiles!);
```

For isometric maps, use `tileToWorldXY` and `worldToTileXY` for coordinate conversion — these respect the orientation automatically.

---

## Performance Tips

- **Layer count:** Fewer layers render faster. Combine decorative layers where possible.
- **Culling:** Phaser automatically culls off-screen tiles. For very large maps (hundreds of tiles wide), this keeps performance steady.
- **Avoid per-frame tile lookups:** Cache tile references instead of calling `getTileAtWorldXY` every frame.
- **Tileset image size:** Keep tileset images as power-of-two dimensions (256, 512, 1024) for optimal GPU handling.
- **Blank tiles:** Use tile index `-1` or `0` for empty spaces — Phaser skips rendering these.

---

## Common Patterns

### Breakable Blocks

```typescript
this.physics.add.collider(player, groundLayer!, (_player, tile) => {
  const t = tile as Phaser.Tilemaps.Tile;
  if (t.properties.breakable && player.body!.blocked.up) {
    groundLayer?.removeTileAt(t.x, t.y);
    this.spawnParticles(t.pixelX, t.pixelY);
  }
});
```

### One-Way Platforms

```typescript
// Mark platform tiles with a custom property in Tiled: oneWay = true
groundLayer?.forEachTile((tile) => {
  if (tile.properties.oneWay) {
    tile.collideDown = false;
    tile.collideLeft = false;
    tile.collideRight = false;
    // Only collideUp remains true
  }
});
```

### Level Transitions

```typescript
const exits = map.getObjectLayer('Exits')?.objects ?? [];
for (const exit of exits) {
  const zone = this.add.zone(exit.x!, exit.y!, exit.width!, exit.height!);
  this.physics.world.enable(zone, Phaser.Physics.Arcade.STATIC_BODY);
  this.physics.add.overlap(player, zone, () => {
    const target = getTiledProperty(exit, 'targetScene') as string;
    this.scene.start(target);
  });
}
```

---

## Cross-Framework Comparison

| Concept              | Phaser                          | Kaplay                    | Excalibur                   | PixiJS                     |
|----------------------|---------------------------------|---------------------------|-----------------------------|----------------------------|
| Tilemap format       | Tiled JSON (built-in)           | Tiled JSON via plugin     | Tiled JSON (built-in)       | No built-in (use pixi-tilemap) |
| Create tilemap       | `this.make.tilemap()`           | `k.addLevel()`            | `TileMap` class             | Manual or pixi-tilemap     |
| Tile collision       | `setCollisionByProperty()`      | Level symbols + `body()`  | `Tile.solid`                | Manual (no physics)        |
| Object layers        | `getObjectLayer()`              | Not built-in              | Not built-in                | Not built-in               |
| Map orientations     | Ortho, Iso, Hex, Staggered     | Orthogonal only           | Orthogonal only             | Depends on plugin          |
