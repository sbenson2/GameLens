# G2 — HaxeFlixel Tilemaps, Level Design, and Pathfinding

> **Category:** guide · **Engine:** HaxeFlixel · **Related:** [Architecture Overview](../architecture/E1_architecture_overview.md) · [Getting Started](G1_getting_started.md) · [Cross-Compilation](../reference/R1_cross_compilation.md)

HaxeFlixel provides a robust tilemap system with built-in collision, integration with external editors (Tiled, Ogmo), and grid-based pathfinding. This guide covers creating and loading tilemaps, editor integration, collision configuration, and using the pathfinding API.

---

## FlxTilemap Basics

`FlxTilemap` is a specialized `FlxObject` that renders a grid of tiles from a tileset image. Each cell in the grid holds an integer index pointing to a tile in the tileset.

### Creating a Tilemap from CSV

The simplest approach — a CSV file where each number corresponds to a tile index:

```
0,0,1,1,1,0,0
0,0,0,0,0,0,0
1,0,0,0,0,0,1
1,1,1,1,1,1,1
```

```haxe
var tilemap = new FlxTilemap();
tilemap.loadMapFromCSV(
    "assets/data/level1.csv",       // CSV map data
    "assets/images/tiles.png",       // tileset image
    16, 16                           // tile width, tile height
);
add(tilemap);

// Collision happens automatically:
FlxG.collide(player, tilemap);
```

### Creating a Tilemap from an Array

For procedurally generated levels:

```haxe
var mapData:Array<Int> = [
    1, 1, 1, 1, 1,
    1, 0, 0, 0, 1,
    1, 0, 0, 0, 1,
    1, 1, 1, 1, 1
];

var tilemap = new FlxTilemap();
tilemap.loadMapFromArray(
    mapData,
    5, 4,                            // columns, rows
    "assets/images/tiles.png",
    16, 16                           // tile width, tile height
);
add(tilemap);
```

---

## Tile Collision Types

By default, tile index `0` is empty (no collision) and all other tiles have `ANY` collision (solid from all sides). You can fine-tune this:

```haxe
// Make tiles 1-3 solid, tile 4 a one-way platform
tilemap.setTileProperties(1, FlxObject.ANY);           // solid all sides
tilemap.setTileProperties(2, FlxObject.ANY);
tilemap.setTileProperties(3, FlxObject.ANY);
tilemap.setTileProperties(4, FlxObject.CEILING);       // solid only from above

// Make a range of tiles non-solid (decorative)
tilemap.setTileProperties(5, FlxObject.NONE, null, 10); // tiles 5-14 = no collision
```

### Collision Direction Flags

| Flag | Meaning |
|------|---------|
| `FlxObject.NONE` | No collision (walkable) |
| `FlxObject.ANY` | Solid from all directions |
| `FlxObject.UP` | Solid when approached from above |
| `FlxObject.DOWN` | Solid when approached from below |
| `FlxObject.LEFT` | Solid when approached from left |
| `FlxObject.RIGHT` | Solid when approached from right |
| `FlxObject.CEILING` | Alias for `UP` — one-way platforms |
| `FlxObject.WALL` | `LEFT | RIGHT` |

Combine flags with bitwise OR: `FlxObject.LEFT | FlxObject.RIGHT` blocks horizontal movement.

### Collision Callbacks on Tiles

```haxe
// Trigger a callback when the player touches spike tiles (index 7)
tilemap.setTileProperties(7, FlxObject.ANY, onSpikeHit);

function onSpikeHit(tile:FlxObject, player:FlxObject):Void {
    cast(player, Player).takeDamage(1);
}
```

---

## Tiled Map Editor Integration

[Tiled](https://www.mapeditor.org/) is the most popular external editor for HaxeFlixel. Integration uses the `flixel-addons` library.

### Setup

1. Install flixel-addons: `haxelib install flixel-addons`
2. Add to `Project.xml`: `<haxelib name="flixel-addons" />`
3. Create your map in Tiled and export as `.tmx`

### Loading a Tiled Map

```haxe
import flixel.addons.editors.tiled.TiledMap;
import flixel.addons.editors.tiled.TiledTileLayer;
import flixel.addons.editors.tiled.TiledObjectLayer;

class Level {
    public var walls:FlxTilemap;
    public var background:FlxTilemap;
    public var coins:FlxTypedGroup<Coin>;

    public function new(mapPath:String) {
        var tiledMap = new TiledMap(mapPath);

        // Load tile layers
        walls = loadTileLayer(tiledMap, "walls");
        background = loadTileLayer(tiledMap, "background");

        // Load object layers (spawn points, collectibles, etc.)
        coins = new FlxTypedGroup<Coin>();
        loadObjectLayer(tiledMap, "objects");
    }

    function loadTileLayer(map:TiledMap, layerName:String):FlxTilemap {
        var layer = cast(map.getLayer(layerName), TiledTileLayer);
        var tilemap = new FlxTilemap();
        tilemap.loadMapFromArray(
            layer.tileArray,
            map.width, map.height,
            "assets/images/tileset.png",
            map.tileWidth, map.tileHeight
        );
        return tilemap;
    }

    function loadObjectLayer(map:TiledMap, layerName:String):Void {
        var layer = cast(map.getLayer(layerName), TiledObjectLayer);
        for (obj in layer.objects) {
            switch (obj.type) {
                case "coin":
                    coins.add(new Coin(obj.x, obj.y));
                case "spawn":
                    // Store spawn point coordinates
                    spawnX = obj.x;
                    spawnY = obj.y;
            }
        }
    }
}
```

### Using the Level in a State

```haxe
class PlayState extends FlxState {
    var level:Level;
    var player:Player;

    override public function create():Void {
        super.create();
        level = new Level("assets/data/level1.tmx");

        add(level.background);
        add(level.walls);
        add(level.coins);

        player = new Player(level.spawnX, level.spawnY);
        add(player);
    }

    override public function update(elapsed:Float):Void {
        super.update(elapsed);
        FlxG.collide(player, level.walls);
        FlxG.overlap(player, level.coins, collectCoin);
    }

    function collectCoin(player:FlxObject, coin:FlxObject):Void {
        coin.kill();
    }
}
```

---

## Ogmo Editor Integration

[Ogmo](https://ogmo-editor-3.github.io/) is another free editor with good HaxeFlixel support via `flixel-addons`:

```haxe
import flixel.addons.editors.ogmo.FlxOgmo3Loader;

var loader = new FlxOgmo3Loader("assets/data/project.ogmo", "assets/data/level1.json");

// Load a tile layer
var tilemap = new FlxTilemap();
loader.loadTilemap(tilemap, "walls", "assets/images/tileset.png");
add(tilemap);

// Load entity layer (spawns objects via callback)
loader.loadEntities(function(entity) {
    switch (entity.name) {
        case "player":
            player = new Player(entity.x, entity.y);
            add(player);
        case "enemy":
            enemies.add(new Enemy(entity.x, entity.y));
    }
}, "entities");
```

---

## Grid-Based Pathfinding

HaxeFlixel includes A* pathfinding built into `FlxTilemap`. The pathfinder treats any tile with collision flags as impassable.

### Basic Pathfinding

```haxe
// Find a path from point A to point B through the tilemap
var path = tilemap.findPath(
    FlxPoint.get(enemy.x + enemy.width / 2, enemy.y + enemy.height / 2),  // start
    FlxPoint.get(player.x + player.width / 2, player.y + player.height / 2) // end
);

if (path != null) {
    // Assign the path to the enemy — it will follow automatically
    enemy.path = new FlxPath(path);
    enemy.path.start(null, 100);  // speed = 100 pixels/sec
}
```

### Path Configuration

```haxe
var path = new FlxPath(points);
path.start(null, speed);

// Movement modes
path.autoCenter = true;        // center object on each node (default)
path.immovable = false;        // set true to not move the object (manual control)

// Path behavior at the end
path.onComplete = function(path) {
    trace("Reached destination!");
};
```

### Diagonal Pathfinding

By default, `findPath` uses 4-directional movement (cardinal only). For diagonal movement:

```haxe
// Use the diagonal pathfinder policy
var path = tilemap.findPath(
    start, end,
    WIDE               // simplification: NONE, LINE, RAY_STEP, RAY, WIDE
);
```

### Custom Pathfinding

For advanced behavior, extend `FlxPathfinder` and override neighbor/distance functions:

```haxe
class WeightedPathfinder extends FlxPathfinder {
    override function getDistance(from:FlxPoint, to:FlxPoint):Float {
        // Custom cost — e.g., terrain types have different movement costs
        var tileIndex = tilemap.getTileIndexByCoords(to);
        return switch (tilemap.getTileByIndex(tileIndex)) {
            case 10: 3.0;  // swamp tile — expensive to cross
            case 11: 1.5;  // sand tile — moderate cost
            default: 1.0;  // normal terrain
        };
    }
}

// Use the custom pathfinder
tilemap.pathfinder = new WeightedPathfinder();
var path = tilemap.findPath(start, end);
```

---

## Object Pooling with Tilemaps

For games with many collectibles or destructible tiles, combine object pooling with tilemap data:

```haxe
// Convert tile data into pooled game objects
var coins = new FlxTypedGroup<Coin>(50); // max pool size

for (y in 0...tilemap.heightInTiles) {
    for (x in 0...tilemap.widthInTiles) {
        if (tilemap.getTile(x, y) == COIN_TILE) {
            var coin = coins.recycle(Coin);
            coin.reset(x * tilemap.tileWidth, y * tilemap.tileHeight);
            tilemap.setTile(x, y, 0); // clear the tile from the map
        }
    }
}
add(coins);
```

---

## Runtime Tile Manipulation

Change tiles dynamically for destructible environments, doors, or triggers:

```haxe
// Replace a single tile
tilemap.setTile(tileX, tileY, newTileIndex);

// Convert world coordinates to tile coordinates
var tileX = Std.int(worldX / tilemap.tileWidth);
var tileY = Std.int(worldY / tilemap.tileHeight);

// Get the tile index at world coordinates
var index = tilemap.getTileByIndex(tilemap.getTileIndexByCoords(FlxPoint.get(worldX, worldY)));

// Destroy a block when hit from below (breakable bricks)
function onBlockHit(tile:FlxObject, player:FlxObject):Void {
    var tx = Std.int(tile.x / 16);
    var ty = Std.int(tile.y / 16);
    tilemap.setTile(tx, ty, 0);          // remove the tile
    spawnParticles(tile.x, tile.y);       // visual effect
}
```

---

## Performance Tips

1. **Use `FlxTilemap` over many `FlxSprite`s** — tilemaps are batched into a single draw call regardless of size.
2. **Split large tilemaps into layers** — only collide the player against the collision layer, not decorative layers.
3. **Limit pathfinding calls** — A* on a large grid is expensive. Cache paths and only recalculate when the target moves significantly.
4. **Use `setTileProperties` ranges** — setting properties for a range (`setTileProperties(5, NONE, null, 10)`) is more efficient than per-tile calls.
5. **Pool objects from object layers** — use `FlxTypedGroup.recycle()` for coins, enemies, and bullets spawned from Tiled/Ogmo data.

---

## Common Mistakes

- Loading a CSV without matching tile dimensions (mismatch between tileset image and tile size parameters)
- Forgetting `setTileProperties` — all non-zero tiles default to `ANY` collision, which may block movement through decorative tiles
- Using `FlxG.overlap` instead of `FlxG.collide` for solid walls (overlap detects but doesn't separate)
- Not calling `super.update(elapsed)` after adding tilemap and pathfinding logic (objects and paths won't advance)
- Passing world coordinates to `setTile` instead of tile coordinates (divide by tile size first)
- Assuming Tiled tile indices start at 0 — Tiled uses 1-based indices; HaxeFlixel's loader adjusts for this, but manual parsing may not
