# Phaser 3 — AI Rules

Engine-specific rules for projects using Phaser 3. These supplement the engine-agnostic rules in `docs/core/ai-workflow/gamedev-rules.md`.

---

## Architecture Context

### Tech Stack

- **Framework:** Phaser 3 (HTML5 2D game framework, v3.80+)
- **Language:** TypeScript (preferred) or JavaScript
- **Renderer:** WebGL with Canvas fallback (automatic)
- **Physics:** Arcade (default, AABB) or Matter.js (complex shapes)
- **Build:** Vite (recommended), webpack, or Parcel
- **Key Libraries:**
  - Tiled (tilemap editor, exports JSON)
  - TexturePacker / free-tex-packer (sprite atlas generation)
  - Capacitor (mobile native wrapper)

### Project Structure Conventions

```
src/
├── main.ts              # GameConfig + new Phaser.Game(config)
├── scenes/              # Each scene extends Phaser.Scene
├── objects/             # Game object classes (extend Arcade.Sprite, etc.)
├── managers/            # Audio, input, state managers
├── data/                # Level data, constants
└── utils/               # Helper functions
public/
└── assets/              # Sprites, tilemaps, audio, fonts
```

---

## Code Generation Rules

### Scenes: Always Extend Phaser.Scene

```typescript
// CORRECT — extend Phaser.Scene with a unique key
export class GameScene extends Phaser.Scene {
  constructor() {
    super({ key: 'GameScene' });
  }
  preload(): void { /* load assets */ }
  create(): void { /* set up objects */ }
  update(time: number, delta: number): void { /* game logic */ }
}

// WRONG — do not use plain objects or functions for scenes
const scene = { preload() {}, create() {}, update() {} };
```

### Asset Loading: Only in preload()

```typescript
// CORRECT — load in preload(), use in create()
preload(): void {
  this.load.spritesheet('player', 'assets/player.png', { frameWidth: 32, frameHeight: 48 });
}
create(): void {
  this.player = this.physics.add.sprite(100, 200, 'player');
}

// WRONG — do not call this.load outside of preload()
create(): void {
  this.load.image('bg', 'assets/bg.png'); // will not work as expected
}
```

### Physics: Prefer Arcade

- Default to Arcade physics for platformers, top-down games, shooters.
- Only use Matter.js when the game needs complex polygon collisions, joints, or constraints.
- Always set `collideWorldBounds(true)` on player sprites unless the game requires screen-wrapping.

### Audio: Provide Dual Formats

```typescript
// CORRECT — provide OGG + MP3 for cross-browser support
this.load.audio('bgm', ['assets/bgm.ogg', 'assets/bgm.mp3']);

// WRONG — single format may not work on all browsers
this.load.audio('bgm', 'assets/bgm.ogg'); // fails on Safari
```

### Cross-Scene Communication: Use Events

```typescript
// CORRECT — scene events for decoupled communication
this.events.emit('score-changed', this.score);
this.scene.get('HUDScene').events.on('score-changed', callback);

// WRONG — global mutable state or direct scene references
window.gameScore = 100;  // never do this
```

### TypeScript: Use Phaser's Types

```typescript
// CORRECT — use Phaser's type definitions
private player!: Phaser.Physics.Arcade.Sprite;
private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;

// WRONG — untyped or using 'any'
private player: any;
```

### Game Objects: Extend Phaser Classes

```typescript
// CORRECT — extend for custom game objects
export class Player extends Phaser.Physics.Arcade.Sprite {
  private speed: number = 200;
  constructor(scene: Phaser.Scene, x: number, y: number) {
    super(scene, x, y, 'player');
    scene.add.existing(this);
    scene.physics.add.existing(this);
  }
}

// WRONG — plain objects with manual rendering
const player = { x: 100, y: 200, sprite: 'player' };
```

---

## Common Pitfalls

1. **Forgetting `scene.add.existing()` and `scene.physics.add.existing()`** when creating game objects via constructor (instead of `this.physics.add.sprite()`).
2. **Not handling the audio context lock** — Phaser handles this automatically, but test on mobile. First user interaction unlocks audio.
3. **Loading too many assets in one scene** — split loading across Boot → Preload → Game scenes.
4. **Using `this.scene.start()` when you want `this.scene.launch()`** — `start` stops the current scene; `launch` runs both in parallel.
5. **Hardcoding physics values** — extract gravity, speed, jump force to constants for easy tuning.
