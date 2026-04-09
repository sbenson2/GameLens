# G1 — Getting Started with HaxeFlixel

> **Category:** guide · **Engine:** HaxeFlixel · **Related:** [E1 Architecture Overview](../architecture/E1_architecture_overview.md) · [HaxeFlixel Rules](../haxeflixel-arch-rules.md)

This guide walks through installing HaxeFlixel, creating a project, and building a minimal working game that compiles to both native desktop and web from a single codebase.

---

## Prerequisites

HaxeFlixel requires the **Haxe** programming language toolchain. You do not need to know Haxe in advance — the syntax will be familiar if you've used Java, C#, TypeScript, or ActionScript.

### Step 1: Install Haxe

Download from [haxe.org](https://haxe.org/download/) or use a package manager:

```bash
# macOS (Homebrew)
brew install haxe

# Windows (Chocolatey)
choco install haxe

# Linux (APT)
sudo add-apt-repository ppa:haxe/releases -y
sudo apt update
sudo apt install haxe -y

# After install, initialize haxelib:
haxelib setup
```

Verify with `haxe --version` (you need Haxe 4.2+ for current HaxeFlixel).

### Step 2: Install HaxeFlixel and Dependencies

HaxeFlixel is distributed through **haxelib**, Haxe's package manager:

```bash
# Install the core libraries
haxelib install lime
haxelib install openfl
haxelib install flixel

# Optional but recommended add-ons
haxelib install flixel-addons    # Extra utilities (Tiled loader, effects, etc.)
haxelib install flixel-ui        # UI widgets (buttons, dropdowns, text input)
haxelib install flixel-demos     # 80+ official example projects

# Set up Lime (platform toolchains)
haxelib run lime setup

# Install the flixel project tools
haxelib install flixel-tools
haxelib run flixel-tools setup
```

The `lime setup` step configures native compilation toolchains. On Windows, it may prompt you to install Visual Studio Build Tools. On macOS, you need Xcode command line tools (`xcode-select --install`).

### Step 3: Set Up Your Editor

Recommended editors with Haxe support:

| Editor | Plugin | Notes |
|--------|--------|-------|
| **VS Code** | Haxe Extension Pack | Best free option: autocomplete, debugging, go-to-definition |
| **IntelliJ IDEA** | Haxe Plugin | Full IDE features, refactoring |
| **HaxeDevelop** | Built-in | Windows-only, Flash Develop successor |
| **Sublime Text** | Haxe Bundle | Lightweight alternative |

For VS Code, install the **Haxe Extension Pack** (includes `vshaxe`, `lime-vscode-extension`).

---

## Creating Your First Project

### Generate from Template

```bash
flixel tpl -n "MyFirstGame"
cd MyFirstGame
```

This creates a project with the standard structure:

```
MyFirstGame/
├── source/
│   ├── Main.hx              # Entry point
│   └── PlayState.hx         # Initial game state
├── assets/
│   ├── images/
│   ├── sounds/
│   └── data/
├── Project.xml               # Build configuration
└── export/                    # Build outputs (auto-generated)
```

### Understanding Main.hx

```haxe
package;

import flixel.FlxGame;
import openfl.display.Sprite;

class Main extends Sprite {
    public function new() {
        super();
        addChild(new FlxGame(640, 480, PlayState));
    }
}
```

`Main` extends OpenFL's `Sprite` (the native entry point) and creates a `FlxGame` instance. The arguments are: game width, game height, and the initial `FlxState` class. HaxeFlixel handles the game loop, rendering, and platform lifecycle from here.

### Understanding PlayState.hx

```haxe
package;

import flixel.FlxState;

class PlayState extends FlxState {
    override public function create():Void {
        super.create();
        // Called once when this state is loaded
    }

    override public function update(elapsed:Float):Void {
        super.update(elapsed);
        // Called every frame — game logic goes here
    }
}
```

This is where your game lives. `create()` runs once for initialization; `update(elapsed)` runs every frame with the delta time in seconds.

---

## Building a Minimal Game

Let's make a player that moves with arrow keys and collects coins. Replace `PlayState.hx`:

```haxe
package;

import flixel.FlxG;
import flixel.FlxSprite;
import flixel.FlxState;
import flixel.group.FlxGroup;
import flixel.text.FlxText;
import flixel.util.FlxColor;

class PlayState extends FlxState {
    var player:FlxSprite;
    var coins:FlxTypedGroup<FlxSprite>;
    var scoreText:FlxText;
    var score:Int = 0;

    override public function create():Void {
        super.create();

        // Create the player (blue square)
        player = new FlxSprite(300, 220);
        player.makeGraphic(16, 16, FlxColor.BLUE);
        player.drag.x = 400;
        player.drag.y = 400;
        add(player);

        // Create some coins (yellow squares)
        coins = new FlxTypedGroup<FlxSprite>();
        for (i in 0...10) {
            var coin = new FlxSprite(FlxG.random.int(20, 600), FlxG.random.int(20, 440));
            coin.makeGraphic(8, 8, FlxColor.YELLOW);
            coins.add(coin);
        }
        add(coins);

        // Score display
        scoreText = new FlxText(10, 10, 200, "Score: 0", 16);
        add(scoreText);
    }

    override public function update(elapsed:Float):Void {
        super.update(elapsed);

        // Movement
        var speed:Float = 200;
        if (FlxG.keys.anyPressed([LEFT, A]))  player.velocity.x = -speed;
        else if (FlxG.keys.anyPressed([RIGHT, D])) player.velocity.x = speed;

        if (FlxG.keys.anyPressed([UP, W]))    player.velocity.y = -speed;
        else if (FlxG.keys.anyPressed([DOWN, S]))  player.velocity.y = speed;

        // Keep player on screen
        player.x = Math.max(0, Math.min(player.x, FlxG.width - player.width));
        player.y = Math.max(0, Math.min(player.y, FlxG.height - player.height));

        // Check coin collection
        FlxG.overlap(player, coins, collectCoin);
    }

    function collectCoin(player:FlxSprite, coin:FlxSprite):Void {
        coin.kill();
        score++;
        scoreText.text = "Score: " + score;

        if (coins.countLiving() == 0) {
            scoreText.text = "You win! Score: " + score;
        }
    }
}
```

### Run It

```bash
# Test in browser (fastest iteration)
lime test html5

# Test as native desktop binary
lime test windows     # or: mac, linux

# Debug mode (enables FlxG.debugger overlay with F2)
lime test html5 -debug
```

The first native build takes longer because hxcpp compiles the C++ output. Subsequent builds are incremental and much faster.

---

## Understanding the Cross-Compilation Model

The same `PlayState.hx` code you wrote above compiles to completely different outputs depending on the target:

```
source/PlayState.hx
    │
    ├─ lime test html5 ──────► Haxe → JavaScript → runs in browser (Canvas/WebGL)
    │
    ├─ lime test windows ────► Haxe → C++ → MSVC → native .exe (uses SDL2)
    │
    ├─ lime test mac ────────► Haxe → C++ → Clang → native .app (uses SDL2)
    │
    ├─ lime test linux ──────► Haxe → C++ → GCC → native binary (uses SDL2)
    │
    ├─ lime test android ────► Haxe → C++ → Android NDK → .apk
    │
    └─ lime test ios ────────► Haxe → C++ → Xcode → .ipa
```

**No virtual machine** is involved for native targets. The Haxe compiler emits C++ source, which is then compiled by the platform's native toolchain. This means your game runs at native speed on desktop and mobile.

For HTML5, Haxe compiles to JavaScript that runs in the browser. OpenFL automatically adapts rendering to use Canvas 2D or WebGL depending on browser capabilities.

### HashLink Alternative

HashLink (HL) is a fast VM designed specifically for Haxe. It offers faster compilation than C++ with near-native runtime performance — useful during development:

```bash
lime test hl          # Run via HashLink VM (fast compile, good performance)
```

HashLink can also compile to C code (`hlc` target) for distribution, giving native performance with faster development builds.

---

## Project Configuration (Project.xml)

The `Project.xml` file controls build settings, asset paths, libraries, and target-specific options:

```xml
<?xml version="1.0" encoding="utf-8"?>
<project>
    <!-- Application metadata -->
    <app title="MyFirstGame" file="MyFirstGame"
         main="Main" version="0.0.1" company="DevName" />

    <!-- Window settings -->
    <window width="640" height="480" fps="60"
            background="#000000" hardware="true" />

    <!-- Source code location -->
    <source path="source" />

    <!-- Asset directories -->
    <assets path="assets/images" rename="images" />
    <assets path="assets/sounds" rename="sounds" include="*.wav|*.ogg" />
    <assets path="assets/music" rename="music" include="*.ogg" />
    <assets path="assets/data" rename="data" />

    <!-- Libraries -->
    <haxelib name="flixel" />
    <haxelib name="flixel-addons" />  <!-- optional -->

    <!-- Target-specific settings -->
    <section if="html5">
        <window width="0" height="0" />  <!-- fullscreen in browser -->
    </section>

    <section if="desktop">
        <window resizable="true" />
    </section>
</project>
```

---

## Adding Assets

### Images

Place PNG files in `assets/images/` and load them in code:

```haxe
var sprite = new FlxSprite(100, 100);
sprite.loadGraphic("assets/images/player.png");     // Static image
add(sprite);

// Animated spritesheet (16x16 frames in a horizontal strip):
sprite.loadGraphic("assets/images/player_walk.png", true, 16, 16);
sprite.animation.add("walk", [0, 1, 2, 3], 10, true);  // name, frames, fps, loop
sprite.animation.play("walk");
```

### Audio

```haxe
// Sound effect (short, loaded into memory)
FlxG.sound.play("assets/sounds/coin.wav");

// Background music (streamed)
FlxG.sound.playMusic("assets/music/theme.ogg", 0.7);  // path, volume
```

Use OGG for music (smaller files, streamed). Use WAV for short sound effects. MP3 works as a web fallback but OGG is preferred for all targets.

### Tilemaps (with Tiled Editor)

For level design, use [Tiled Map Editor](https://www.mapeditor.org/) to create `.tmx` files, then load with flixel-addons:

```haxe
import flixel.addons.editors.tiled.TiledMap;

var tiledMap = new TiledMap("assets/data/level1.tmx");
// Process layers, create FlxTilemap instances from tile data
```

---

## Common First-Project Mistakes

1. **Forgetting `super.update(elapsed)`** — Your objects won't move, animate, or collide. Always call it.
2. **Forgetting `super.create()`** — State initialization won't complete properly.
3. **Not calling `add()`** — Objects exist in memory but won't render or receive updates until added to the state.
4. **Wrong asset paths** — Paths are relative to the project root and must match `Project.xml` asset declarations.
5. **No `makeGraphic()` or `loadGraphic()`** — A bare `new FlxSprite()` is invisible (zero-size, no texture).
6. **Ignoring `elapsed` for movement** — Multiply speed by `elapsed` for frame-rate-independent motion: `player.x += speed * elapsed`.

---

## Next Steps

Once comfortable with the basics:

- **Tilemaps** — Use Tiled Editor + `FlxTilemap` for level design
- **Cameras** — `FlxG.camera.follow(player)` for scrolling worlds
- **SubStates** — `openSubState(new PauseState())` for pause menus
- **Object pooling** — `FlxTypedGroup.recycle()` for bullets, particles, enemies
- **Shaders** — Custom GLSL fragment shaders via `FlxSprite.shader`
- **flixel-addons** — Pathfinding, FSM, particle effects, screen transitions
- **Publishing** — `lime build html5 -release` or `lime build windows -release` for distribution builds

---

## Further Reading

- [Official HaxeFlixel Documentation](https://haxeflixel.com/documentation/)
- [HaxeFlixel Tutorial Series](https://haxeflixel.com/documentation/tutorial/)
- [HaxeFlixel Demos (80+ examples)](https://haxeflixel.com/demos/)
- [Haxe Language Manual](https://haxe.org/manual/introduction.html)
- [OpenFL Documentation](https://www.openfl.org/documentation/)
