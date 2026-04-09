# E1 — Phaser 3 Architecture Overview

> **Category:** explanation · **Engine:** Phaser · **Related:** [G1 Scene Lifecycle](../guides/G1_scene_lifecycle.md) · [G2 Physics Systems](../guides/G2_physics_systems.md)

---

## Core Philosophy: Scenes, Game Objects, and Config-Driven Design

Phaser 3 is the most widely-used open-source 2D web game framework. Its architecture rests on three pillars:

1. **Scene Graph** — the organizational backbone. Your game is a collection of `Scene` instances, each with its own lifecycle, physics world, cameras, and game objects. Scenes can run in parallel (e.g., a game world scene + a HUD scene stacked on top).
2. **Game Objects** — the visible/interactive things in your game. Sprites, images, text, tilemaps, particles, groups — everything you see or interact with is a Game Object added to a Scene.
3. **Config-driven bootstrap** — Phaser is initialized via a single configuration object passed to `new Phaser.Game(config)`. Physics, rendering, scenes, scaling — all declared up front.

This is fundamentally different from engines like Godot (node trees) or ECS frameworks (entities + components + systems). In Phaser, **scenes ARE the containers**, **game objects ARE the entities**, and **events + the update loop ARE the logic layer**.

---

## The Game Config: How Phaser Boots

Everything starts with a `Phaser.Types.Core.GameConfig` object:

```typescript
import Phaser from 'phaser';
import { BootScene } from './scenes/BootScene';
import { GameScene } from './scenes/GameScene';
import { HUDScene } from './scenes/HUDScene';

const config: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,            // WebGL with Canvas fallback
  width: 800,
  height: 600,
  parent: 'game-container',     // DOM element ID
  physics: {
    default: 'arcade',          // 'arcade' | 'matter' | 'impact'
    arcade: {
      gravity: { x: 0, y: 300 },
      debug: false,
    },
  },
  scale: {
    mode: Phaser.Scale.FIT,     // responsive scaling
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
  scene: [BootScene, GameScene, HUDScene],
};

const game = new Phaser.Game(config);
```

### Key Config Decisions

| Option | Guidance |
|--------|----------|
| `type` | Use `Phaser.AUTO` — it picks WebGL when available, falls back to Canvas. Only force `Phaser.CANVAS` for specific compatibility needs. |
| `physics.default` | **Arcade** for most 2D games (AABB collision, fast). **Matter.js** for complex shapes, joints, and realistic physics. Arcade is ~10x faster. |
| `scale.mode` | `FIT` for fixed-aspect games, `RESIZE` for fluid layouts. Mobile games almost always want `FIT` + `CENTER_BOTH`. |
| `scene` | Array order matters — the first scene starts automatically. Others must be started explicitly. |

---

## Scene Lifecycle: The Heart of Phaser

Every Phaser game is organized into scenes. A scene is a class extending `Phaser.Scene`:

```typescript
export class GameScene extends Phaser.Scene {
  private player!: Phaser.Physics.Arcade.Sprite;
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;

  constructor() {
    super({ key: 'GameScene' });
  }

  // 1. Called first — receive data from scene.start('GameScene', data)
  init(data: { level: number }): void {
    this.data.set('level', data.level);
  }

  // 2. Queue asset loads — nothing is available yet
  preload(): void {
    this.load.spritesheet('player', 'assets/player.png', {
      frameWidth: 32,
      frameHeight: 48,
    });
    this.load.tilemapTiledJSON('level1', 'assets/level1.json');
    this.load.audio('bgm', ['assets/bgm.ogg', 'assets/bgm.mp3']);
  }

  // 3. Assets loaded — set up game objects, physics, input
  create(): void {
    // Tilemap
    const map = this.make.tilemap({ key: 'level1' });
    const tileset = map.addTilesetImage('tiles', 'tiles-image');
    const groundLayer = map.createLayer('Ground', tileset!);
    groundLayer?.setCollisionByProperty({ collides: true });

    // Player
    this.player = this.physics.add.sprite(100, 200, 'player');
    this.player.setCollideWorldBounds(true);

    // Collision: player vs tilemap
    if (groundLayer) {
      this.physics.add.collider(this.player, groundLayer);
    }

    // Input
    this.cursors = this.input.keyboard!.createCursorKeys();

    // Audio
    this.sound.play('bgm', { loop: true, volume: 0.5 });

    // Launch HUD as a parallel scene
    this.scene.launch('HUDScene');
  }

  // 4. Called every frame (~60fps) — game logic goes here
  update(time: number, delta: number): void {
    if (this.cursors.left.isDown) {
      this.player.setVelocityX(-160);
    } else if (this.cursors.right.isDown) {
      this.player.setVelocityX(160);
    } else {
      this.player.setVelocityX(0);
    }

    if (this.cursors.up.isDown && this.player.body?.touching.down) {
      this.player.setVelocityY(-330);
    }
  }
}
```

### Lifecycle Flow

```
init(data) → preload() → create() → update(time, delta)  ← repeats every frame
                                          ↓
                              scene.start('OtherScene')
                              scene.launch('Overlay')
                              scene.pause() / scene.resume()
                              scene.stop()
```

### Multi-Scene Architecture

Phaser's killer feature is **parallel scenes**. Common patterns:

- **Game + HUD:** `GameScene` handles gameplay, `HUDScene` renders UI on a separate camera. Communicate via events.
- **Boot → Preload → Menu → Game:** Sequential scene chain for loading flow.
- **Pause overlay:** Launch a `PauseScene` on top of a paused `GameScene`.

```typescript
// In GameScene — launch HUD alongside
this.scene.launch('HUDScene');

// Send data between scenes via events
this.events.emit('score-changed', this.score);

// In HUDScene — listen
this.scene.get('GameScene').events.on('score-changed', (score: number) => {
  this.scoreText.setText(`Score: ${score}`);
});
```

---

## Recommended Project Structure

```
src/
├── main.ts              # Game config + new Phaser.Game(config)
├── scenes/
│   ├── BootScene.ts     # Minimal — loads loading bar assets
│   ├── PreloadScene.ts  # Heavy asset loading with progress bar
│   ├── MenuScene.ts     # Title screen, settings
│   ├── GameScene.ts     # Main gameplay
│   └── HUDScene.ts      # UI overlay (parallel scene)
├── objects/
│   ├── Player.ts        # extends Phaser.Physics.Arcade.Sprite
│   ├── Enemy.ts         # extends Phaser.Physics.Arcade.Sprite
│   └── Pickup.ts        # extends Phaser.Physics.Arcade.Image
├── managers/
│   ├── AudioManager.ts  # Sound pooling, music crossfades
│   └── InputManager.ts  # Unified keyboard/gamepad/touch input
├── data/
│   └── levels.json      # Level data, enemy spawns
└── utils/
    └── constants.ts     # Physics values, tile sizes, keys
public/
├── assets/
│   ├── sprites/         # Spritesheets, atlases
│   ├── tilemaps/        # Tiled .json exports
│   ├── audio/           # .ogg + .mp3 (provide both for compatibility)
│   └── fonts/           # Bitmap fonts
└── index.html
```

---

## Rendering Architecture

Phaser 3 uses a **dual renderer**:

- **WebGL renderer** — default when hardware supports it. Batched sprite rendering, shader effects, render textures, blend modes. This is what makes Phaser fast.
- **Canvas renderer** — automatic fallback. Fewer visual features but broader compatibility.

You rarely interact with the renderer directly. Key concepts:

- **Cameras:** Each scene has a default camera. Use `this.cameras.main.startFollow(player)` for scrolling. Add secondary cameras for minimaps or split-screen.
- **Depth sorting:** Game objects have a `depth` property (z-index equivalent). Higher depth renders on top.
- **Texture Atlases:** For production, pack sprites into atlases (TexturePacker, free-tex-packer) — one draw call instead of many. Phaser loads atlas JSON + spritesheet natively.

---

## Physics Systems Comparison

| Feature | Arcade | Matter.js |
|---------|--------|-----------|
| Collision shapes | AABB (rectangles) | Convex polygons, circles, compound |
| Performance | Very fast | Moderate |
| Gravity | Global or per-body | Global or per-body |
| Joints/constraints | No | Yes |
| Sensors/triggers | Overlap detection | Sensor bodies |
| Best for | Platformers, top-down, most 2D games | Physics puzzles, ragdolls, chains |

---

## Asset Loading Strategy

Phaser's `Loader` is scene-scoped. Best practice:

1. **BootScene** — loads only the loading bar spritesheet/font (tiny, instant).
2. **PreloadScene** — loads everything else with a progress bar. Use `this.load.on('progress', callback)` for UI updates.
3. **Lazy loading** — for large games, load level-specific assets in that level's `preload()`. The texture cache is global, so assets loaded in any scene persist.

```typescript
// PreloadScene — show loading progress
preload(): void {
  const bar = this.add.graphics();
  this.load.on('progress', (value: number) => {
    bar.clear();
    bar.fillStyle(0xffffff, 1);
    bar.fillRect(100, 290, 600 * value, 20);
  });

  // Queue all major assets
  this.load.atlas('characters', 'assets/characters.png', 'assets/characters.json');
  this.load.tilemapTiledJSON('world', 'assets/world.json');
  this.load.audio('sfx-jump', 'assets/jump.ogg');
}
```

---

## Input Handling

Phaser supports keyboard, mouse/touch, and gamepad:

```typescript
// Keyboard — cursor keys shortcut
const cursors = this.input.keyboard!.createCursorKeys();

// Keyboard — custom keys
const wasd = this.input.keyboard!.addKeys('W,A,S,D') as {
  W: Phaser.Input.Keyboard.Key;
  A: Phaser.Input.Keyboard.Key;
  S: Phaser.Input.Keyboard.Key;
  D: Phaser.Input.Keyboard.Key;
};

// Pointer (mouse + touch unified)
this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
  this.player.moveTo(pointer.worldX, pointer.worldY);
});

// Gamepad
this.input.gamepad?.on('connected', (pad: Phaser.Input.Gamepad.Gamepad) => {
  // pad.axes, pad.buttons available
});
```

---

## Mobile and Deployment

### Mobile Considerations

- Use `scale.mode: Phaser.Scale.FIT` for consistent aspect ratio across devices.
- Provide both `.ogg` and `.mp3` audio formats (iOS requires user interaction before audio plays).
- Audio context unlock: Phaser handles this automatically on first user interaction.
- Touch input works through the same pointer API as mouse — no separate handling needed.
- Test on real devices — mobile GPU and memory limits differ significantly from desktop.

### Deployment Options

- **Static hosting** (Netlify, Vercel, GitHub Pages) — build with Vite/webpack, deploy the `dist/` folder.
- **PWA** — add a service worker and manifest for offline play. Phaser Vite templates include PWA config.
- **Native wrapper** — use Capacitor (Ionic) or Electron for app store distribution. Point `webDir` to your build output.
- **Itch.io / Game Jams** — zip the build folder and upload directly.

---

## Key Takeaways for AI Code Generation

1. **Always extend `Phaser.Scene`** for scenes and `Phaser.Physics.Arcade.Sprite` (or `.Image`) for game objects. Do not use plain classes.
2. **Never load assets outside of `preload()`** — the loader only works correctly during this lifecycle phase.
3. **Use TypeScript** — Phaser's type definitions are excellent and catch common mistakes (wrong texture keys, missing physics bodies).
4. **Prefer Arcade physics** unless the game explicitly needs complex shapes or joints.
5. **Use scene events for cross-scene communication** — do not store global mutable state.
6. **Provide .ogg + .mp3** for every audio file — this covers all browsers.
7. **Reference the official examples** at `phaser.io/examples` — Phaser has 1700+ runnable examples covering nearly every API.
