# G2 — Heaps 2D Scene Graph and Rendering

> **Category:** guide · **Engine:** Heaps · **Related:** [Architecture Overview](../architecture/E1_architecture_overview.md) · [Getting Started](G1_getting_started.md) · [Heaps Rules](../heaps-arch-rules.md)

Heaps organizes all 2D rendering through a **scene graph** — a tree of `h2d.Object` nodes rooted in an `h2d.Scene`. Every visible element (sprites, text, animations, UI) is a node in this tree. Understanding the scene graph is the foundation for building any 2D game in Heaps.

---

## The Object Tree

Every 2D object in Heaps inherits from `h2d.Object`. Objects form a parent-child tree:

```
h2d.Scene (s2d)                 ← root of the 2D scene
├── h2d.Bitmap (background)     ← static background image
├── h2d.Object (gameWorld)      ← container for game entities
│   ├── h2d.Anim (player)      ← animated sprite
│   ├── h2d.Bitmap (enemy)     ← static sprite
│   └── h2d.Object (effects)   ← sub-container for particles
│       └── h2d.Bitmap (spark)
└── h2d.Object (uiLayer)       ← container for HUD
    ├── h2d.Text (score)
    └── h2d.Interactive (button)
```

### Parent-Child Relationships

When you add a child to a parent, the child inherits the parent's transform (position, rotation, scale, alpha). Moving the parent moves all children with it.

```haxe
// Creating the hierarchy
var gameWorld = new h2d.Object(s2d); // added to the scene root
gameWorld.x = 100;
gameWorld.y = 50;

var player = new h2d.Bitmap(playerTile, gameWorld); // child of gameWorld
player.x = 20;  // relative to gameWorld, so screen position is (120, 50)
player.y = 0;
```

### Removing and Reparenting

```haxe
// Remove from scene (does not destroy — can re-add later)
player.remove();

// Reparent: move player from gameWorld to uiLayer
uiLayer.addChild(player);

// Destroy completely (removes and invalidates)
player.remove();
player = null;
```

---

## Core Drawable Types

### h2d.Bitmap — Static Images

`Bitmap` is the simplest drawable. It renders a single `h2d.Tile` (a rectangular region of a texture):

```haxe
// Load a tile from an image file
var tile = hxd.Res.sprites.player_idle.toTile();

// Create a bitmap and add it to the scene
var sprite = new h2d.Bitmap(tile, s2d);
sprite.x = 200;
sprite.y = 150;

// Flip horizontally (for facing direction)
sprite.scaleX = -1;

// Center the pivot point (origin defaults to top-left)
tile.dx = -Std.int(tile.width / 2);
tile.dy = -Std.int(tile.height / 2);
```

**Performance note:** Each `Bitmap` is a separate draw call. For many small sprites (bullets, particles), use `h2d.SpriteBatch` or `h2d.TileGroup` instead — these batch draws into a single call.

### h2d.Anim — Sprite Animation

`Anim` plays a sequence of tiles at a fixed frame rate:

```haxe
// Create an array of tiles from a sprite sheet
var tiles = hxd.Res.sprites.player_run.toTile().split(8); // 8 frames in a row

var anim = new h2d.Anim(tiles, 12, s2d); // 12 frames per second
anim.x = 200;
anim.y = 150;
anim.loop = true; // default is true

// Control playback
anim.pause = true;
anim.currentFrame = 0;
anim.speed = 8; // change FPS dynamically

// Callback when animation finishes (non-looping)
anim.onAnimEnd = function() {
    trace("Animation finished");
};
```

### Splitting Sprite Sheets

`Tile.split()` divides a tile into a grid of sub-tiles:

```haxe
var sheet = hxd.Res.sprites.character.toTile();

// split(numColumns) — assumes square frames matching tile height
var frames = sheet.split(8); // 8 columns, frame width = sheet.width / 8

// For non-square grids, use gridFlatten or manual sub()
// sub(x, y, width, height) extracts a specific region
var frame3 = sheet.sub(64 * 2, 0, 64, 64); // third 64x64 frame
```

### h2d.Text — Text Rendering

```haxe
// Use the default font (embedded bitmap font)
var tf = new h2d.Text(hxd.res.DefaultFont.get(), s2d);
tf.text = "Score: 0";
tf.x = 10;
tf.y = 10;
tf.textColor = 0xFFFFFF;

// Custom font (load a .fnt bitmap font via resources)
var customFont = hxd.Res.fonts.pixel.toFont();
var label = new h2d.Text(customFont, s2d);
label.text = "GAME OVER";
label.textAlign = Center;
```

### h2d.Graphics — Procedural Shapes

`Graphics` draws vector shapes — useful for debug visualizations, UI backgrounds, and prototyping:

```haxe
var g = new h2d.Graphics(s2d);

// Filled rectangle
g.beginFill(0xFF0000, 0.5); // red, 50% alpha
g.drawRect(10, 10, 200, 100);
g.endFill();

// Outlined circle
g.lineStyle(2, 0x00FF00); // 2px green line
g.drawCircle(150, 150, 50);

// Custom polygon
g.beginFill(0x0000FF);
g.moveTo(0, 0);
g.lineTo(50, 100);
g.lineTo(100, 0);
g.endFill();

// Clear and redraw each frame (for dynamic shapes)
g.clear();
```

---

## Layers and Draw Order

By default, children are drawn in the order they were added (first added = drawn first = appears behind later siblings). Heaps provides two ways to control draw order.

### Option 1: h2d.Layers

`h2d.Layers` is an `Object` subclass that assigns children to numbered layers. Lower layer numbers are drawn first (further back). `h2d.Scene` extends `Layers`, so you can use layer management directly on `s2d`:

```haxe
// Define layer constants for clarity
static inline var LAYER_BG     = 0;
static inline var LAYER_WORLD  = 1;
static inline var LAYER_FX     = 2;
static inline var LAYER_UI     = 3;

// Add objects to specific layers
s2d.add(background, LAYER_BG);
s2d.add(player,     LAYER_WORLD);
s2d.add(particles,  LAYER_FX);
s2d.add(hud,        LAYER_UI);

// Move an existing object to a different layer
s2d.add(player, LAYER_UI); // moves player above everything except UI peers
```

Within the same layer, objects are drawn in insertion order. Use `s2d.under(obj)` to move an object behind its siblings within the same layer.

### Option 2: Manual ysort

For top-down or isometric games where entities should overlap based on their Y position:

```haxe
// In your update loop, sort the world container's children by Y
gameWorld.ysort(0); // sorts all children at layer 0 by their y property
```

`ysort` is available on any `h2d.Layers` (including `h2d.Scene`). It sorts children within a given layer by their `y` coordinate, so objects lower on screen appear in front.

---

## Interactivity: h2d.Interactive

Heaps objects do not handle mouse/touch events directly. Instead, you create an `h2d.Interactive` area and attach it to the object:

```haxe
var player = new h2d.Bitmap(playerTile, s2d);

// Create a clickable area matching the sprite size
var inter = new h2d.Interactive(playerTile.width, playerTile.height, player);

inter.onOver = function(e) {
    player.alpha = 0.8;  // hover effect
};
inter.onOut = function(e) {
    player.alpha = 1.0;
};
inter.onClick = function(e) {
    trace("Player clicked at " + e.relX + ", " + e.relY);
};

// For UI buttons, combine with a background graphic
inter.backgroundColor = 0x80000000; // semi-transparent, useful for debugging hit areas
```

### Common Interactive Events

| Event | Trigger |
|-------|---------|
| `onClick` | Mouse click or touch tap |
| `onOver` / `onOut` | Mouse enters/leaves the area |
| `onPush` / `onRelease` | Mouse button down/up |
| `onMove` | Mouse moves within the area |
| `onWheel` | Scroll wheel |
| `onKeyDown` / `onKeyUp` | Keyboard (when interactive has focus) |
| `onFocus` / `onFocusLost` | Focus gained/lost |

---

## Camera: h2d.Camera

Heaps provides `h2d.Camera` for viewport control — scrolling, zooming, and following targets:

```haxe
// The scene has a default camera at s2d.camera
var cam = s2d.camera;

// Follow the player with smooth interpolation
override function update(dt:Float) {
    // Lerp camera toward player position
    cam.x += (player.x - cam.x - s2d.width * 0.5) * 0.1;
    cam.y += (player.y - cam.y - s2d.height * 0.5) * 0.1;
}

// Zoom
cam.scaleX = 2.0;
cam.scaleY = 2.0;

// Clamp camera to level bounds
cam.x = Math.max(0, Math.min(cam.x, levelWidth - s2d.width));
cam.y = Math.max(0, Math.min(cam.y, levelHeight - s2d.height));
```

For multiple cameras (e.g., split-screen), create additional `h2d.Scene` instances or use `h2d.Camera` viewports.

---

## SpriteBatch: High-Performance Rendering

When you need to draw hundreds or thousands of sprites (particles, bullets, tilemaps), `h2d.SpriteBatch` batches them into a single draw call:

```haxe
var batch = new h2d.SpriteBatch(atlas, s2d);
batch.hasRotationScale = true; // enable per-element rotation/scale

// Add elements (lightweight — no scene graph overhead)
var elem = batch.add(tile);
elem.x = 100;
elem.y = 200;
elem.r = 1.0; elem.g = 0.5; elem.b = 0.0; // per-element color tint
elem.scale = 0.5;

// Remove an element
elem.remove();

// For tilemaps, h2d.TileGroup is similar but optimized for static layouts
var tileGroup = new h2d.TileGroup(atlas, s2d);
tileGroup.add(grassTile.x, grassTile.y, grassTile);
// Call tileGroup.clear() and re-add if the tilemap changes
```

### When to Use Each

| Approach | Best For | Draw Calls |
|----------|----------|------------|
| `h2d.Bitmap` | Few individual sprites (< 50) | 1 per bitmap |
| `h2d.SpriteBatch` | Many dynamic sprites (particles, bullets) | 1 total |
| `h2d.TileGroup` | Static or rarely-changing tile layouts | 1 total |

---

## Practical Pattern: Game Scene Structure

A common structure for a 2D game in Heaps:

```haxe
class GameScene extends hxd.App {
    var world:h2d.Layers;
    var ui:h2d.Object;

    static inline var LAYER_BG      = 0;
    static inline var LAYER_ENTITIES = 1;
    static inline var LAYER_FX      = 2;

    override function init() {
        // World container with layers — camera affects this
        world = new h2d.Layers(s2d);

        // UI container — added after world, so drawn on top
        ui = new h2d.Object(s2d);

        // Background (layer 0)
        var bg = new h2d.Bitmap(hxd.Res.bg.toTile(), world);
        world.add(bg, LAYER_BG);

        // Player (layer 1)
        var playerTiles = hxd.Res.player_run.toTile().split(8);
        var player = new h2d.Anim(playerTiles, 12);
        world.add(player, LAYER_ENTITIES);

        // HUD text (not affected by camera)
        var score = new h2d.Text(hxd.res.DefaultFont.get(), ui);
        score.text = "Score: 0";
    }

    override function update(dt:Float) {
        // Update game logic
        // Y-sort entities for top-down overlap
        world.ysort(LAYER_ENTITIES);
    }
}
```

This pattern separates the game world (which scrolls with the camera) from the UI (which stays fixed on screen). Layers within the world control depth ordering, and `ysort` handles dynamic overlap for top-down or isometric games.
