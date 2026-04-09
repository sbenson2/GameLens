# G4 — Animation and Sprites

> **Category:** guide · **Engine:** HaxeFlixel · **Related:** [Architecture Overview](../architecture/E1_architecture_overview.md) · [Getting Started](G1_getting_started.md) · [Cross-Compilation](../reference/R1_cross_compilation.md) · [HaxeFlixel Rules](../haxeflixel-arch-rules.md)

HaxeFlixel's sprite system is built around `FlxSprite` and its `FlxAnimationController`. This guide covers loading sprites, setting up animations from sprite sheets and texture atlases, controlling playback, and common patterns for character animation in 2D games.

---

## FlxSprite Basics

Every visible game object in HaxeFlixel extends `FlxSprite`. A sprite wraps a graphic (static or animated), a position, velocity, acceleration, collision bounds, and a built-in animation controller.

### Static Sprite

```haxe
import flixel.FlxSprite;

class PlayState extends FlxState {
    override public function create():Void {
        super.create();

        var coin = new FlxSprite(100, 200);
        coin.loadGraphic("assets/images/coin.png");
        add(coin);
    }
}
```

### Inline Colored Rectangle (No Image)

Useful for prototyping:

```haxe
var block = new FlxSprite(50, 50);
block.makeGraphic(32, 32, FlxColor.RED);
add(block);
```

---

## Sprite Sheet Animation

The most common approach: a single image containing all animation frames in a grid. Each frame has the same dimensions.

### Loading an Animated Sprite Sheet

```haxe
var player = new FlxSprite(100, 100);

// Load a sprite sheet: 6 columns × 4 rows, each frame 32×32 pixels
player.loadGraphic("assets/images/player_sheet.png", true, 32, 32);
```

The `true` parameter tells HaxeFlixel this is an animated graphic. The engine divides the image into a grid of frames based on the width and height you specify. Frames are numbered left-to-right, top-to-bottom, starting at 0.

### Adding Animations

Use the `animation` controller (a `FlxAnimationController`) to define named animations:

```haxe
// animation.add(name, frames, frameRate, looped)
player.animation.add("idle",  [0, 1, 2, 3],         8,  true);
player.animation.add("run",   [4, 5, 6, 7, 8, 9],   12, true);
player.animation.add("jump",  [10, 11],              10, false);
player.animation.add("death", [12, 13, 14, 15, 16],  8,  false);

// Play an animation
player.animation.play("idle");
```

Parameters:

- **name** — string identifier you use to play the animation
- **frames** — array of frame indices from the sprite sheet
- **frameRate** — playback speed in frames per second (default: 30)
- **looped** — whether the animation repeats (default: true)

---

## Texture Atlas Animation

For complex characters with many animations or non-uniform frame sizes, a texture atlas (sprite atlas) packs frames into a single image with a data file describing each frame's position. Tools like TexturePacker, Free Texture Packer, or Shoebox generate these.

### Loading an Atlas

```haxe
var character = new FlxSprite(100, 100);

// Load from a Sparrow/Starling XML atlas
character.frames = FlxAtlasFrames.fromSparrow(
    "assets/images/character.png",
    "assets/images/character.xml"
);
```

HaxeFlixel supports several atlas formats via `FlxAtlasFrames`:

| Method | Format | Tool |
|---|---|---|
| `fromSparrow()` | Sparrow/Starling XML | TexturePacker, Shoebox |
| `fromTexturePackerJson()` | JSON Hash/Array | TexturePacker |
| `fromLibGDX()` | libGDX .atlas | libGDX TexturePacker |
| `fromSpriteSheetPacker()` | Simple text format | SpriteSheetPacker |

### Adding Animations from an Atlas

With an atlas, frames have string names rather than numeric indices. Use `addByPrefix` to match frame names:

```haxe
// Frame names in the atlas: "walk0000.png", "walk0001.png", ...
character.animation.addByPrefix("walk", "walk", 12, true);

// Frame names: "attack_slash0000.png", "attack_slash0001.png", ...
character.animation.addByPrefix("attack", "attack_slash", 15, false);

// Idle: "idle0000.png" through "idle0005.png"
character.animation.addByPrefix("idle", "idle", 8, true);

character.animation.play("idle");
```

`addByPrefix` finds all frames whose names start with the given prefix, sorts them numerically, and creates the animation.

### Selecting Specific Frames with addByIndices

When you need only certain frames from a prefix-matched set:

```haxe
// Use only frames 0, 2, 4, 6 from the "run" prefix
character.animation.addByIndices("run_slow", "run", [0, 2, 4, 6], "", 8, true);
```

The fourth parameter is a postfix appended after the index (usually empty string).

---

## Animation Playback Control

### Basic Playback

```haxe
// Play from the beginning
player.animation.play("run");

// Play, but don't restart if already playing this animation
player.animation.play("run", false);

// Force restart from frame 0
player.animation.play("run", true);

// Play in reverse
player.animation.play("run", true, true);
```

### Checking State

```haxe
// Current animation name
var name = player.animation.name;  // "run"

// Is any animation playing?
if (player.animation.finished) {
    player.animation.play("idle");
}

// Current frame index (within the current animation)
var frame = player.animation.frameIndex;

// Current frame index (global, across all frames in the sprite sheet)
var globalFrame = player.animation.curAnim.curFrame;
```

### Animation Callbacks

React to animation events:

```haxe
// Called when a non-looping animation finishes
player.animation.finishCallback = function(name:String) {
    if (name == "death") {
        // Remove player, show game over
        player.kill();
    }
    if (name == "attack") {
        player.animation.play("idle");
    }
};

// Called every frame of the animation
player.animation.frameCallback = function(name:String, frameNumber:Int, frameIndex:Int) {
    if (name == "attack" && frameNumber == 3) {
        // Spawn hitbox on the "impact" frame
        spawnAttackHitbox(player.x, player.y);
    }
};
```

---

## Common Character Animation Pattern

A typical player character switches animations based on movement state. Here is a complete pattern:

```haxe
class Player extends FlxSprite {
    static inline var SPEED:Float = 200;
    static inline var GRAVITY:Float = 800;
    static inline var JUMP_FORCE:Float = -350;

    var isOnGround:Bool = false;

    public function new(x:Float, y:Float) {
        super(x, y);

        // Load sprite sheet
        loadGraphic("assets/images/player.png", true, 32, 48);

        // Define animations
        animation.add("idle",   [0, 1, 2, 3],           6,  true);
        animation.add("run",    [4, 5, 6, 7, 8, 9],     12, true);
        animation.add("jump",   [10, 11],                10, false);
        animation.add("fall",   [12],                    1,  false);
        animation.add("land",   [13, 14],                12, false);
        animation.add("attack", [15, 16, 17, 18, 19],   15, false);

        animation.play("idle");

        // Physics
        acceleration.y = GRAVITY;
        maxVelocity.set(SPEED, 600);
        drag.x = SPEED * 4;  // stop quickly when no input
    }

    override public function update(elapsed:Float):Void {
        handleInput();
        updateAnimation();
        super.update(elapsed);
    }

    function handleInput():Void {
        acceleration.x = 0;

        if (FlxG.keys.pressed.LEFT) {
            acceleration.x = -SPEED * 4;
            flipX = true;  // mirror sprite horizontally
        } else if (FlxG.keys.pressed.RIGHT) {
            acceleration.x = SPEED * 4;
            flipX = false;
        }

        if (FlxG.keys.justPressed.SPACE && isOnGround) {
            velocity.y = JUMP_FORCE;
            isOnGround = false;
        }
    }

    function updateAnimation():Void {
        // Don't interrupt attack animation
        if (animation.name == "attack" && !animation.finished)
            return;

        if (!isOnGround) {
            if (velocity.y < 0)
                animation.play("jump", false);
            else
                animation.play("fall", false);
        } else if (Math.abs(velocity.x) > 10) {
            animation.play("run", false);
        } else {
            animation.play("idle", false);
        }
    }
}
```

Key details in this pattern:

- `flipX = true` mirrors the sprite horizontally for left-facing movement without needing separate left/right animations.
- The second parameter `false` in `animation.play("run", false)` prevents restarting the animation if it is already playing — this avoids the "stuck on frame 0" jitter.
- Attack animations are prioritized by checking if they are still playing before switching.

---

## Performance Tips

**Sprite sheet vs. atlas:** For characters with uniform frame sizes, sprite sheets are simpler and slightly faster to load. Use atlases when frames vary in size or when packing many characters into one texture.

**FlxSpriteGroup:** For composite objects (a character with separately animated weapon, armor, effects), use `FlxSpriteGroup` to move and transform them together while keeping each part as its own `FlxSprite` with independent animations.

**Object pooling with FlxGroup:** For bullets, particles, and other frequently spawned/despawned objects, use `FlxGroup.recycle()` instead of creating new sprites. HaxeFlixel's recycling system reuses dead sprites from the group:

```haxe
var bullets = new FlxTypedGroup<Bullet>(50);  // pool of 50

function shoot():Void {
    var bullet = bullets.recycle(Bullet);  // reuse a dead bullet or create new
    bullet.fire(player.x, player.y);
}
```

**Texture memory:** HaxeFlixel caches loaded graphics. If you load the same sprite sheet path from multiple `FlxSprite` instances, they share the same GPU texture. You do not need to manage a texture cache manually.
