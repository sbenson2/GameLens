# HaxeFlixel — AI Rules

Engine-specific rules for projects using HaxeFlixel. These supplement the engine-agnostic rules in `docs/core/ai-workflow/gamedev-rules.md`.

---

## Architecture Context

### Tech Stack

- **Framework:** HaxeFlixel (cross-platform 2D game framework)
- **Language:** Haxe (compiles to C++, JavaScript, C#, Java, and more)
- **Rendering Layer:** OpenFL → Lime → SDL2 (native) or HTML5 Canvas/WebGL (web)
- **Build System:** Haxelib (package manager) + Lime (build tool)
- **Platforms:** Windows, macOS, Linux (C++ via hxcpp), HTML5 (JavaScript), Android (NDK), iOS (hxcpp + Xcode), Flash (legacy)
- **Key Libraries:**
  - OpenFL (display list API, Flash-like)
  - Lime (low-level multimedia layer)
  - flixel-addons (extra utilities, effects, plugins)
  - flixel-ui (UI widgets and controls)
  - flixel-demos (official example collection)

### What HaxeFlixel Is (and Is Not)

HaxeFlixel is a **free, cross-platform 2D game framework** written in Haxe. It provides a sprite-based game loop, physics, tilemaps, collision detection, cameras, UI, and state management. Games compile to native C++ executables (via hxcpp + SDL2) for desktop and mobile, and to JavaScript for web — all from a single Haxe codebase.

HaxeFlixel is NOT a game engine with an editor. It is a code-only framework inspired by the original AS3 Flixel (by Adam "Atomic" Saltsman). You write Haxe code, run `lime test <target>`, and get a compiled binary.

### Cross-Compilation Model

This is the key differentiator of HaxeFlixel. The Haxe compiler translates Haxe source code to target-specific output:

```
Haxe Source (.hx files)
    │
    ├──► hxcpp ──► C++ ──► Native Binary (Windows/macOS/Linux/iOS/Android)
    │                       └── Uses SDL2 for windowing, input, audio
    │
    ├──► JavaScript ──► HTML5 (Canvas or WebGL)
    │
    └──► (Legacy) ──► Flash SWF
```

**No virtual machine** is involved for native targets — Haxe compiles to C++, which is compiled by the platform's native toolchain (MSVC, GCC, Clang, NDK, Xcode). This gives near-native performance.

**Compiler conditionals** allow platform-specific code:

```haxe
#if html5
    // Web-specific code
#elseif cpp
    // Native-specific code
#end
```

### Project Structure Conventions

```
{ProjectName}/
├── source/                 # Haxe source code
│   ├── Main.hx             # Entry point (creates FlxGame)
│   ├── PlayState.hx        # Primary game state
│   ├── MenuState.hx        # Menu state
│   ├── entities/           # Game objects (extend FlxSprite)
│   │   ├── Player.hx
│   │   └── Enemy.hx
│   └── ui/                 # UI elements
├── assets/                 # Game assets
│   ├── images/
│   ├── sounds/
│   ├── music/
│   └── data/               # Tilemaps (Tiled/Ogmo), config files
├── Project.xml             # Lime project config (targets, libraries, assets)
├── export/                 # Build output (auto-generated per target)
└── .haxelib/               # Local library cache (optional)
```

---

## Core Class Hierarchy

Understanding HaxeFlixel's class hierarchy is essential:

```
FlxBasic (base — update + draw)
  └── FlxObject (position, velocity, collision, physics)
      └── FlxSprite (graphics, animation, rendering)
          └── FlxTilemap (tile-based maps)
      └── FlxTypedGroup<T> (container for objects)
          └── FlxGroup (FlxTypedGroup<FlxBasic>)
              └── FlxState (game state — extends FlxGroup)
                  └── FlxSubState (overlay state)
```

- **FlxBasic**: Has `update()` and `draw()`, can be `kill()`ed, `revive()`d, and `exists`/`alive`/`active` flags.
- **FlxObject**: Adds position (`x`, `y`), `velocity`, `acceleration`, `drag`, `maxVelocity`, `width`, `height`, collision detection.
- **FlxSprite**: Adds texture rendering, animation, scaling, alpha, blend modes.
- **FlxGroup**: Container that iterates `update()` and `draw()` on all members. Also used for collision groups.
- **FlxState**: A full game state (level, menu, etc.) — is itself a group you add objects to.

---

## HaxeFlixel-Specific Code Rules

### Entry Point Pattern

Every HaxeFlixel game starts with a `Main` class that creates `FlxGame`:

```haxe
package;

import flixel.FlxGame;
import openfl.display.Sprite;

class Main extends Sprite {
    public function new() {
        super();
        addChild(new FlxGame(320, 240, PlayState, 60, 60, true));
        // Args: gameWidth, gameHeight, initialState, updateFramerate, drawFramerate, skipSplash
    }
}
```

### State Management

States are the scenes of your game. Switch between them with `FlxG.switchState`:

```haxe
class PlayState extends FlxState {
    override public function create():Void {
        super.create();
        // Initialize objects, add them to this state
        var player = new FlxSprite(100, 100);
        player.makeGraphic(16, 16, FlxColor.BLUE);
        add(player);
    }

    override public function update(elapsed:Float):Void {
        super.update(elapsed);  // MUST call super.update — updates all added objects
        // Game logic here
    }
}

// Switching states:
FlxG.switchState(new MenuState());
```

**Always call `super.create()` and `super.update(elapsed)`**. Forgetting `super.update()` means none of the objects added to the state will update or collide.

### Sprites and Animation

```haxe
var player = new FlxSprite(x, y);
player.loadGraphic("assets/images/player.png", true, 16, 16);  // animated spritesheet
player.animation.add("walk", [0, 1, 2, 3], 10, true);          // name, frames, fps, loop
player.animation.add("idle", [0], 1, false);
player.animation.play("idle");
add(player);
```

### Collision Detection

HaxeFlixel provides two collision functions:

```haxe
// Overlap check (no separation):
FlxG.overlap(player, coinGroup, collectCoin);

// Collide (separates objects physically):
FlxG.collide(player, wallTilemap);
FlxG.collide(enemyGroup, wallTilemap);

// Callback signature:
function collectCoin(player:FlxSprite, coin:FlxSprite):Void {
    coin.kill();
    score++;
}
```

Use `FlxG.collide` for solid objects, `FlxG.overlap` for triggers/pickups. Both work with individual objects, groups, and tilemaps.

### Object Pooling with Groups

HaxeFlixel encourages object pooling via `FlxGroup.recycle()`:

```haxe
var bullets = new FlxTypedGroup<Bullet>(20);  // max 20
add(bullets);

// Fire a bullet:
var bullet = bullets.recycle(Bullet);  // reuses dead bullet or creates new
bullet.launch(x, y, angle);
```

This avoids GC pressure on native targets and allocation overhead on web.

### Tilemaps

```haxe
var tilemap = new FlxTilemap();
tilemap.loadMapFromCSV("assets/data/level.csv", "assets/images/tiles.png", 16, 16);
add(tilemap);

// Collision with tilemap:
FlxG.collide(player, tilemap);
```

HaxeFlixel supports CSV tilemaps and integrates with Tiled Map Editor (via flixel-addons `FlxOgmoLoader` or `FlxTiledMap`).

### Camera

The default camera follows nothing. To follow the player:

```haxe
FlxG.camera.follow(player, TOPDOWN, 0.1);  // target, style, lerp
FlxG.camera.setScrollBoundsRect(0, 0, levelWidth, levelHeight);
```

For HUD elements that shouldn't scroll, create a separate camera:

```haxe
var hudCam = new FlxCamera(0, 0, FlxG.width, FlxG.height);
hudCam.bgColor = FlxColor.TRANSPARENT;
FlxG.cameras.add(hudCam, false);  // false = not a default draw target
scoreText.cameras = [hudCam];     // assign HUD elements to this camera
```

### FlxG Global Utilities

`FlxG` is the global static class with essential utilities:

- `FlxG.keys` / `FlxG.mouse` / `FlxG.gamepads` — input
- `FlxG.sound` — audio playback
- `FlxG.camera` / `FlxG.cameras` — camera management
- `FlxG.random` — seeded random number generator
- `FlxG.switchState()` — state transitions
- `FlxG.overlap()` / `FlxG.collide()` — collision
- `FlxG.elapsed` — frame delta time
- `FlxG.timeScale` — time dilation

---

## Build and Run

```bash
# Install Haxe and HaxeFlixel:
haxelib install lime
haxelib install openfl
haxelib install flixel
haxelib run lime setup

# Create a new project:
flixel tpl -n "MyGame"

# Run targets:
lime test html5          # Web browser
lime test windows        # Native Windows
lime test mac            # Native macOS
lime test linux          # Native Linux
lime test android        # Android APK
lime test ios            # iOS (requires Xcode)

# Debug mode:
lime test html5 -debug
```

---

## Common Mistakes to Catch

- Forgetting to call `super.update(elapsed)` in FlxState (objects won't update or collide)
- Forgetting to call `super.create()` in FlxState
- Not calling `add(object)` — objects that aren't added to the state won't render or update
- Using `new FlxSprite()` without `makeGraphic()` or `loadGraphic()` — invisible sprite
- Calling `FlxG.switchState()` inside `create()` before adding objects (state transitions should happen in `update()`)
- Not setting tilemap collision types (tiles default to `NONE`)
- Assuming Flash-like display list — HaxeFlixel does NOT use OpenFL's display list for game objects
- Using `Std.int()` instead of `Std.int()` or `Math.floor()` for tile coordinate math
- Forgetting to handle `elapsed` for frame-rate-independent movement
- Not using `kill()` / `revive()` pattern for recyclable objects (creating/destroying objects causes GC pauses)
- Platform-specific code without compiler conditionals (`#if html5` / `#if cpp`)
