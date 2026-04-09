# Tilemaps and Level Design

> **Category:** guide · **Engine:** Kaplay · **Related:** [Components and Game Objects](G1_components_and_game_objects.md), [Physics and Collisions](G4_physics_and_collisions.md), [Architecture Overview](../architecture/E1_architecture_overview.md)

Kaplay provides `addLevel()` for building tile-based levels from ASCII string maps. Each character maps to a factory function that returns a component list, making level design readable and quick to iterate. For larger or more complex maps, you can import JSON data from the Tiled map editor. This guide covers both approaches, collision setup, pathfinding, dynamic tiles, and performance tips.

---

## addLevel() — ASCII Map Levels

The core level-design API. Define your map as an array of strings where each character represents a tile type, then configure `tileWidth`, `tileHeight`, and a `tiles` object mapping characters to component arrays.

### Basic Example

```typescript
import kaplay from 'kaplay';

const k = kaplay({
  width: 640,
  height: 480,
});

k.loadSprite('floor', 'assets/floor.png');
k.loadSprite('coin', 'assets/coin.png');
k.loadSprite('spike', 'assets/spike.png');
k.loadSprite('player', 'assets/player.png');

k.scene('game', () => {
  // Define the level layout — each character is one tile
  const level = k.addLevel([
    '                ',
    '        $       ',
    '    =====       ',
    '   $        $   ',
    '  ====   ====   ',
    '                ',
    ' ^    ^ ^    ^  ',
    '================',
  ], {
    tileWidth: 32,
    tileHeight: 32,
    tiles: {
      '=': () => [
        k.sprite('floor'),
        k.area(),
        k.body({ isStatic: true }),
        // Tag for collision filtering
        'platform',
      ],
      '$': () => [
        k.sprite('coin'),
        k.area(),
        // Tag to identify coins in collision handlers
        'coin',
      ],
      '^': () => [
        k.sprite('spike'),
        k.area(),
        'danger',
      ],
    },
  });

  // Spawn the player at a specific tile position
  const player = k.add([
    k.sprite('player'),
    k.pos(level.tile2Pos(1, 6)), // convert tile coords to world coords
    k.area(),
    k.body(),
    'player',
  ]);

  // Coin collection
  k.onCollide('player', 'coin', (p, coin) => {
    k.destroy(coin);
  });

  // Hazard collision
  k.onCollide('player', 'danger', () => {
    k.go('game'); // restart
  });
});

k.go('game');
```

### LevelOpt Configuration

The options object passed to `addLevel()` accepts:

- **`tileWidth`** — width of each tile in pixels.
- **`tileHeight`** — height of each tile in pixels.
- **`tiles`** — object mapping single characters to factory functions. Each factory returns an array of components (and optional tags as strings).
- **`wildcardTile`** — an optional fallback factory for any character not listed in `tiles`. Useful for debugging unrecognized characters.

```typescript
const level = k.addLevel(mapData, {
  tileWidth: 32,
  tileHeight: 32,
  tiles: {
    '=': () => [k.sprite('floor'), k.area(), k.body({ isStatic: true })],
    '$': () => [k.sprite('coin'), k.area(), 'coin'],
  },
  // Any character not in tiles{} gets a debug placeholder
  wildcardTile: (char: string) => [
    k.rect(32, 32),
    k.color(255, 0, 255),
    k.area(),
    `unknown-${char}`,
  ],
});
```

### Level Object Methods

`addLevel()` returns a level game object with useful methods:

```typescript
const level = k.addLevel(/* ... */);

// Convert tile coordinates to world pixel position
const worldPos = level.tile2Pos(5, 3); // { x: 160, y: 96 } for 32px tiles

// Convert world position to tile coordinates
const tilePos = level.pos2Tile(k.vec2(160, 96)); // { x: 5, y: 3 }

// Get the game object at a specific tile position
const tileObj = level.getAt(k.vec2(5, 3));

// Spawn a new object at a tile position within the level
level.spawn('$', k.vec2(10, 2)); // place a coin at tile (10, 2)

// Destroy the object at a tile position
level.destroy(k.vec2(10, 2));
```

---

## Tile Component

Adding the `tile()` component to game objects gives them tile-aware behavior: snapping to grid positions, participating in level queries, and supporting pathfinding.

```typescript
tiles: {
  '#': () => [
    k.sprite('wall'),
    k.area(),
    k.body({ isStatic: true }),
    k.tile({ isObstacle: true }), // marks this tile as a pathfinding obstacle
  ],
  '.': () => [
    k.sprite('ground'),
    k.area(),
    k.tile({ isObstacle: false }),
  ],
}
```

The `tile()` component accepts:

- **`isObstacle`** — whether this tile blocks pathfinding (default: `false`).
- **`cost`** — movement cost for weighted pathfinding (default: `0`). Higher values make the pathfinder prefer other routes.
- **`edges`** — array of allowed movement directions. By default all four cardinal directions are available.

---

## Pathfinding

Kaplay has built-in grid-based pathfinding that works with `addLevel()`. Add the `agent()` component to any game object that needs to navigate the tile grid.

```typescript
const enemy = k.add([
  k.sprite('enemy'),
  k.pos(level.tile2Pos(2, 2)),
  k.area(),
  k.body(),
  k.agent({ speed: 100, allowDiagonals: false }),
  'enemy',
]);

// Navigate to a tile position — the agent pathfinds automatically
enemy.setTarget(level.tile2Pos(10, 5));

// Check if the agent has reached its target
enemy.onNavigationEnded(() => {
  // Pick a new target or idle
});
```

**Pathfinding notes:**

- Pathfinding uses tiles marked with `tile({ isObstacle: true })` as blockers.
- The `cost` field on tiles allows weighted pathfinding (e.g., swamp tiles cost more).
- For large maps, pathfinding performance depends on grid size — keep grids under ~200×200 for smooth results.
- Tiles need `center` anchoring to align properly with pathfinding grids (a known consideration as of Kaplay v4000).

---

## Tiled Editor Integration

For complex levels, use the [Tiled](https://www.mapeditor.org/) map editor and load the exported JSON into Kaplay. The approach requires a manual loader since Kaplay doesn't have built-in Tiled JSON parsing.

### Loading a Tiled JSON Map

```typescript
// Load the Tiled JSON map data
const mapData = await (await fetch('assets/maps/level1.json')).json();

const TILE_WIDTH = mapData.tilewidth;
const TILE_HEIGHT = mapData.tileheight;

// Load tileset image as a spritesheet
k.loadSpriteAtlas('assets/tilesets/terrain.png', {
  terrain: {
    x: 0, y: 0,
    width: 512, // full tileset image width
    height: 512,
    sliceX: 16, // number of columns in the tileset
    sliceY: 16,
  },
});

// Render tile layers
for (const layer of mapData.layers) {
  if (layer.type === 'tilelayer' && layer.visible) {
    renderTiledLayer(layer, mapData);
  }
  if (layer.type === 'objectgroup') {
    spawnObjects(layer.objects);
  }
}

function renderTiledLayer(
  layer: { data: number[]; width: number; height: number; name: string },
  map: { tilewidth: number; tileheight: number; tilesets: Array<{ firstgid: number }> },
): void {
  const firstGid = map.tilesets[0].firstgid;

  for (let i = 0; i < layer.data.length; i++) {
    const gid = layer.data[i];
    if (gid === 0) continue; // empty tile

    const col = i % layer.width;
    const row = Math.floor(i / layer.width);
    const localId = gid - firstGid;

    const components: any[] = [
      k.sprite('terrain', { frame: localId }),
      k.pos(col * map.tilewidth, row * map.tileheight),
    ];

    // Add collision for specific layers
    if (layer.name === 'Collision' || layer.name === 'Ground') {
      components.push(k.area(), k.body({ isStatic: true }), 'solid');
    }

    k.add(components);
  }
}

function spawnObjects(objects: Array<{ name: string; type: string; x: number; y: number }>): void {
  for (const obj of objects) {
    if (obj.type === 'player_spawn') {
      k.add([
        k.sprite('player'),
        k.pos(obj.x, obj.y),
        k.area(),
        k.body(),
        'player',
      ]);
    }
  }
}
```

### Tiled Workflow Tips

1. **Layer naming:** Use consistent layer names like "Ground", "Collision", "Foreground", "Spawns" so your loader can assign components by layer.
2. **Tile properties:** Set custom properties on tiles in Tiled (e.g., `solid: true`, `hazard: true`) and read them from the tileset data to drive component assignment.
3. **Export format:** Always export as JSON (not TMX XML) for easy parsing in JavaScript.
4. **Tile layer format:** Use CSV encoding (not Base64 compressed) for maximum compatibility.

---

## Dynamic Level Manipulation

Modify levels at runtime for breakable blocks, doors, or procedural changes.

### Destroying and Spawning Tiles

```typescript
// Remove a tile when the player hits it from below
k.onCollide('player', 'breakable', (player, block) => {
  if (player.pos.y > block.pos.y) {
    // Player is below the block — break it
    k.destroy(block);
    // Spawn particles or a pickup
    k.add([
      k.sprite('debris'),
      k.pos(block.pos),
      k.lifespan(0.5),
    ]);
  }
});

// Open a door by removing wall tiles
function openDoor(level: ReturnType<typeof k.addLevel>, doorCol: number, doorRow: number): void {
  level.destroy(k.vec2(doorCol, doorRow));
  level.destroy(k.vec2(doorCol, doorRow + 1)); // door is 2 tiles tall
}
```

### Procedural Level Generation

Generate level strings programmatically:

```typescript
function generateLevel(width: number, height: number): string[] {
  const rows: string[] = [];

  for (let y = 0; y < height; y++) {
    let row = '';
    for (let x = 0; x < width; x++) {
      if (y === 0 || y === height - 1 || x === 0 || x === width - 1) {
        row += '#'; // walls
      } else if (y === height - 2) {
        row += '='; // floor
      } else if (Math.random() < 0.05) {
        row += '$'; // random coins
      } else {
        row += ' '; // empty space
      }
    }
    rows.push(row);
  }

  return rows;
}

const mapStrings = generateLevel(20, 15);
const level = k.addLevel(mapStrings, {
  tileWidth: 32,
  tileHeight: 32,
  tiles: { /* ... */ },
});
```

---

## Camera and Scrolling

Set the camera to follow the player and clamp to the level boundaries:

```typescript
const player = k.add([
  k.sprite('player'),
  k.pos(64, 64),
  k.area(),
  k.body(),
]);

// Camera follows the player with smoothing
player.onUpdate(() => {
  k.camPos(player.pos);
});

// Or with lerp for smoother following
player.onUpdate(() => {
  const target = player.pos;
  const current = k.camPos();
  k.camPos(current.lerp(target, 0.1));
});

// Clamp camera to level bounds
const mapWidthPx = mapStrings[0].length * 32;
const mapHeightPx = mapStrings.length * 32;

player.onUpdate(() => {
  const halfW = k.width() / 2;
  const halfH = k.height() / 2;
  const cx = Math.max(halfW, Math.min(mapWidthPx - halfW, player.pos.x));
  const cy = Math.max(halfH, Math.min(mapHeightPx - halfH, player.pos.y));
  k.camPos(k.vec2(cx, cy));
});
```

---

## Performance Tips

- **Limit active objects:** Each tile created by `addLevel()` is a full game object with components. For very large maps (200×200+), this can be expensive. Consider only spawning tiles within the camera viewport.
- **Static bodies:** Always use `body({ isStatic: true })` for terrain tiles. Static bodies are cheaper than dynamic ones.
- **Minimize component count:** Only add `area()` and `body()` to tiles that need collision. Decorative tiles need only `sprite()` and `pos()`.
- **Chunk loading:** For very large worlds, split the map into chunks and load/unload them as the camera moves.
- **Reuse sprites:** Use the same sprite key across identical tiles — Kaplay batches draws for identical textures.

---

## Common Patterns

### One-Way Platforms

```typescript
tiles: {
  '-': () => [
    k.sprite('platform'),
    k.area(),
    k.body({ isStatic: true }),
    'one-way',
  ],
}

// Only collide when the player is falling onto the platform from above
k.onCollideUpdate('player', 'one-way', (player, platform) => {
  if (player.pos.y + player.height > platform.pos.y + 4) {
    // Player is inside or below the platform — don't collide
    platform.unuse('body');
  }
});
```

### Moving Platforms

```typescript
const platform = k.add([
  k.sprite('platform'),
  k.pos(200, 300),
  k.area(),
  k.body({ isStatic: true }),
  'moving-platform',
]);

let direction = 1;
platform.onUpdate(() => {
  platform.pos.x += direction * 60 * k.dt();
  if (platform.pos.x > 400) direction = -1;
  if (platform.pos.x < 200) direction = 1;
});
```

### Level Transitions

```typescript
tiles: {
  'D': () => [
    k.sprite('door'),
    k.area(),
    'door',
  ],
}

k.onCollide('player', 'door', () => {
  // Transition to the next level
  k.go('game', { level: currentLevel + 1 });
});
```

---

## Cross-Framework Comparison

| Concept              | Kaplay                          | Phaser                          | Excalibur                     | PixiJS                          |
|----------------------|---------------------------------|---------------------------------|-------------------------------|---------------------------------|
| Tilemap creation     | `addLevel()` with ASCII maps    | `this.make.tilemap()` from JSON | `TileMap` class               | `@pixi/tilemap` or manual       |
| Tiled JSON import    | Manual loader or community lib  | `tilemapTiledJSON()` built-in   | Built-in Tiled resource       | Manual parsing required          |
| Tile collision       | `area()` + `body()` components  | `setCollisionByProperty()`      | `Tile.solid` property         | Manual grid or physics lib       |
| Pathfinding          | Built-in `agent()` component    | Navmesh plugin (community)      | Not built-in                  | Not built-in                     |
| Dynamic tile changes | `level.spawn()` / `destroy()`   | `putTileAt()` / `removeTileAt()`| Tile manipulation methods     | `tilemap.clear()` + re-add      |
| Map orientations     | Orthogonal only                 | Ortho, Iso, Hex, Staggered     | Orthogonal only               | Orthogonal (plugin)              |
| Object layers        | Not built-in                    | `getObjectLayer()` built-in     | Not built-in                  | Manual JSON parsing              |
