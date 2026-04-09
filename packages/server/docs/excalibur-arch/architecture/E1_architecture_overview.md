# E1 — Excalibur.js Architecture Overview

> **Category:** explanation · **Engine:** Excalibur · **Related:** [G1 Actors & Entities](../guides/G1_actors_and_entities.md) · [G2 Scene Management](../guides/G2_scene_management.md)

---

## Core Philosophy: Engine, Scenes, Actors, and ECS

Excalibur.js is a TypeScript-first 2D game engine for the web. It was designed from the ground up in TypeScript, making it feel familiar to developers coming from C#, Java, or other strongly-typed languages.

The architecture rests on three pillars:

1. **Engine → Scene → Actor hierarchy** — a clear, class-based object graph. The `Engine` manages the game loop and contains `Scene` instances. Each `Scene` contains `Actor` instances (the visible, interactive things in your game).
2. **Built-in ECS underpinning** — beneath the friendly Actor API, Excalibur uses a full Entity Component System. Each Scene contains an ECS World with EntityManager, QueryManager, and SystemManager. You can use Actors (batteries-included) or drop down to raw Entities when you need custom behavior.
3. **Resource Loader** — a first-class asset loading system with progress tracking, designed for clean separation between loading and gameplay.

This is fundamentally different from Kaplay (functional, no classes) or Phaser (config-driven, separate physics plugins). In Excalibur, **classes ARE the structure**, **Actors ARE the primary game objects**, and **the ECS IS the engine's backbone**.

---

## Engine Setup: The Entry Point

Everything starts with creating an `Engine` instance:

```typescript
import { Engine, DisplayMode, Physics, CollisionType, Vector, Color } from 'excalibur';
import { GameScene } from './scenes/GameScene';
import { MenuScene } from './scenes/MenuScene';
import { loader } from './resources';

const game = new Engine({
  width: 800,
  height: 600,
  displayMode: DisplayMode.FitScreen,     // responsive scaling
  backgroundColor: Color.fromHex('#1a1a2e'),
  fixedUpdateFps: 60,                      // physics tick rate
  maxFps: 60,                              // render cap
  antialiasing: false,                     // pixel-perfect for pixel art
  pixelRatio: 1,                           // override device pixel ratio
});

// Register scenes
game.addScene('menu', new MenuScene());
game.addScene('game', new GameScene());

// Start with the loader and initial scene
game.start(loader).then(() => {
  game.goToScene('menu');
});
```

### Key Config Decisions

| Option | Guidance |
|--------|----------|
| `displayMode` | `FitScreen` for most games. `FitContainer` to fill a specific DOM element. `Fixed` for exact pixel control. |
| `antialiasing` | Set `false` for pixel art games. Disables texture filtering. |
| `fixedUpdateFps` | Physics runs at this rate regardless of render FPS. 60 is a good default. |
| `backgroundColor` | Scene-level background color. Set here for the default, override per-scene. |

---

## Scene Lifecycle: Organizing Game States

Scenes manage groups of actors and define lifecycle hooks:

```typescript
import { Scene, Engine, SceneActivationContext, Actor, vec } from 'excalibur';
import { Player } from '../actors/Player';
import { LevelLoader } from '../levels/LevelLoader';

export class GameScene extends Scene {
  private player!: Player;
  private level: number = 1;

  // Called once — first time the scene is used
  onInitialize(engine: Engine): void {
    this.player = new Player(vec(100, 300));
    this.add(this.player);

    // Add level geometry, enemies, pickups
    LevelLoader.load(this, this.level);
  }

  // Called every time the scene becomes active
  onActivate(context: SceneActivationContext<{ level: number }>): void {
    if (context.data?.level) {
      this.level = context.data.level;
      // Rebuild level
      this.clear();
      this.onInitialize(this.engine);
    }
  }

  // Called every time the scene is left
  onDeactivate(): void {
    // Cleanup, save state, etc.
  }

  // Called every frame
  onPreUpdate(engine: Engine, delta: number): void {
    // Scene-level update logic (e.g., check win conditions)
    if (this.player.pos.x > 5000) {
      engine.goToScene('game', { level: this.level + 1 });
    }
  }
}
```

### Lifecycle Flow

```
onInitialize(engine)    ← once, first activation
    ↓
onActivate(context)     ← every time scene becomes active
    ↓
onPreUpdate / onPostUpdate  ← every frame
    ↓
onDeactivate()          ← when leaving the scene
```

### Scene Transitions

```typescript
// Navigate between scenes with data
game.goToScene('game', { level: 2 });
game.goToScene('gameover', { score: 1500 });

// Access passed data in onActivate
onActivate(context: SceneActivationContext<{ score: number }>): void {
  const score = context.data?.score ?? 0;
}
```

---

## Actors: The Primary Game Object

Actors are the recommended way to represent things in your game. They come with position, velocity, graphics, collision, and actions built in:

```typescript
import {
  Actor, Engine, vec, CollisionType, Color, Input,
  SpriteSheet, Animation, AnimationStrategy
} from 'excalibur';
import { Resources } from '../resources';

export class Player extends Actor {
  private speed = 200;

  constructor(pos: ex.Vector) {
    super({
      pos,
      width: 32,
      height: 48,
      collisionType: CollisionType.Active,  // moves and collides
      color: Color.Blue,                     // fallback if no sprite
    });
  }

  onInitialize(engine: Engine): void {
    // Set up sprite from loaded resource
    const spriteSheet = SpriteSheet.fromImageSource({
      image: Resources.playerImage,
      grid: { rows: 2, columns: 4, spriteWidth: 32, spriteHeight: 48 },
    });

    const idleAnim = Animation.fromSpriteSheet(
      spriteSheet, [0, 1, 2, 3], 150, AnimationStrategy.Loop
    );
    const runAnim = Animation.fromSpriteSheet(
      spriteSheet, [4, 5, 6, 7], 100, AnimationStrategy.Loop
    );

    this.graphics.add('idle', idleAnim);
    this.graphics.add('run', runAnim);
    this.graphics.use('idle');
  }

  onPreUpdate(engine: Engine, delta: number): void {
    // Input handling
    this.vel.x = 0;

    if (engine.input.keyboard.isHeld(Input.Keys.Left)) {
      this.vel.x = -this.speed;
      this.graphics.use('run');
      this.graphics.flipHorizontal = true;
    } else if (engine.input.keyboard.isHeld(Input.Keys.Right)) {
      this.vel.x = this.speed;
      this.graphics.use('run');
      this.graphics.flipHorizontal = false;
    } else {
      this.graphics.use('idle');
    }

    if (engine.input.keyboard.wasPressed(Input.Keys.Space)) {
      if (this.vel.y === 0) {  // simple grounded check
        this.vel.y = -400;
      }
    }
  }
}
```

### Actor vs Entity: When to Use Which

| Use Case | Use Actor | Use Entity |
|----------|-----------|------------|
| Visible game object (player, enemy, pickup) | Yes | — |
| Needs position, graphics, collision | Yes (built in) | Manually add components |
| Custom ECS system with minimal overhead | — | Yes |
| Particle or data-only object | — | Yes |
| Most games | Yes | Only when needed |

**Start with Actors.** Only drop to raw Entities if you need fine-grained ECS control or have a performance-critical system with thousands of homogeneous objects.

---

## Entity Component System (ECS)

Beneath Actor, Excalibur exposes a full ECS:

```typescript
import { Entity, Component, System, SystemType, Query, World } from 'excalibur';

// Define a component — pure data
class HealthComponent extends Component {
  type = 'health';
  constructor(public current: number, public max: number) {
    super();
  }
}

// Define a system — pure logic
class HealthSystem extends System {
  systemType = SystemType.Update;
  query: Query;

  constructor(world: World) {
    super();
    this.query = world.query([HealthComponent]);
  }

  update(delta: number): void {
    for (const entity of this.query.entities) {
      const health = entity.get(HealthComponent)!;
      if (health.current <= 0) {
        entity.kill();
      }
    }
  }
}

// Register system in a scene
class GameScene extends Scene {
  onInitialize(): void {
    this.world.add(new HealthSystem(this.world));
  }
}
```

---

## Resource Loading

Excalibur has a dedicated `Loader` that shows a progress screen:

```typescript
import { ImageSource, Sound, Loader } from 'excalibur';

// resources.ts — declare all assets
export const Resources = {
  playerImage: new ImageSource('/assets/player.png'),
  tilesetImage: new ImageSource('/assets/tileset.png'),
  bgm: new Sound('/assets/bgm.mp3'),
  jumpSfx: new Sound('/assets/jump.wav'),
};

// Create a loader with all resources
export const loader = new Loader();
for (const resource of Object.values(Resources)) {
  loader.addResource(resource);
}

// Customize the loading screen
loader.backgroundColor = '#1a1a2e';
loader.loadingBarColor = Color.White;
loader.suppressPlayButton = true;  // skip "click to play" (handle audio unlock yourself)
```

### Resource Types

| Type | Class | Usage |
|------|-------|-------|
| Images | `ImageSource` | Sprites, spritesheets, tilesets |
| Sounds | `Sound` | Music, SFX (MP3, OGG, WAV) |
| Fonts | `FontSource` | Custom fonts for labels |
| JSON | `JsonResource` | Level data, dialogue, config |

---

## Collision and Physics

Excalibur uses SAT (Separating Axis Theorem) for collision detection — more precise than Phaser's Arcade AABB, but still fast:

```typescript
import { Actor, CollisionType, vec, CollisionStartEvent } from 'excalibur';

// Collision types determine behavior
const player = new Actor({
  pos: vec(100, 300),
  width: 32,
  height: 48,
  collisionType: CollisionType.Active,   // moves, responds to collisions
});

const platform = new Actor({
  pos: vec(400, 500),
  width: 800,
  height: 32,
  collisionType: CollisionType.Fixed,    // immovable, others bounce off
});

const coin = new Actor({
  pos: vec(300, 400),
  width: 16,
  height: 16,
  collisionType: CollisionType.Passive,  // detects overlaps, no physics response
});

// Collision events
player.on('collisionstart', (evt: CollisionStartEvent) => {
  if (evt.other.hasTag('coin')) {
    evt.other.kill();
    score++;
  }
});

// Global gravity
Physics.gravity = vec(0, 800);
```

### Collision Type Reference

| Type | Moves | Responds to collisions | Use for |
|------|-------|----------------------|---------|
| `Active` | Yes | Yes | Players, enemies, projectiles |
| `Fixed` | No | Yes (others bounce off) | Platforms, walls, terrain |
| `Passive` | Can move | Detects but no physics response | Triggers, pickups, sensors |
| `PreventCollision` | Yes | No detection at all | Background objects, decorations |

---

## Input Handling

Excalibur provides typed input access through the Engine:

```typescript
onPreUpdate(engine: Engine, delta: number): void {
  // Keyboard
  if (engine.input.keyboard.isHeld(Input.Keys.Left)) { /* ... */ }
  if (engine.input.keyboard.wasPressed(Input.Keys.Space)) { /* ... */ }
  if (engine.input.keyboard.wasReleased(Input.Keys.Shift)) { /* ... */ }

  // Pointer (mouse + touch unified)
  if (engine.input.pointers.primary.lastWorldPos) {
    const mousePos = engine.input.pointers.primary.lastWorldPos;
  }

  // Gamepad
  const pad = engine.input.gamepads.at(0);
  if (pad) {
    const leftStickX = pad.getAxes(Input.Axes.LeftStickX);
    if (pad.wasButtonPressed(Input.Buttons.Face1)) { /* jump */ }
  }
}

// Event-based input on actors
player.on('pointerdown', () => { /* clicked on this actor */ });
```

---

## Recommended Project Structure

```
src/
├── main.ts               # Engine config, scene registration, game.start()
├── resources.ts           # All ImageSource, Sound, etc. declarations + Loader
├── scenes/
│   ├── MenuScene.ts       # extends Scene — title screen
│   ├── GameScene.ts       # extends Scene — main gameplay
│   └── GameOverScene.ts   # extends Scene — results
├── actors/
│   ├── Player.ts          # extends Actor — player character
│   ├── Enemy.ts           # extends Actor — enemy types
│   └── Pickup.ts          # extends Actor — coins, powerups
├── components/            # Custom ECS components (extends Component)
│   └── HealthComponent.ts
├── systems/               # Custom ECS systems (extends System)
│   └── HealthSystem.ts
├── levels/
│   └── LevelLoader.ts    # Tilemap parsing, actor spawning
└── utils/
    └── constants.ts       # Physics values, speeds
public/
├── assets/
│   ├── sprites/
│   ├── audio/
│   └── maps/
└── index.html
```

---

## Comparison with Other Web Frameworks

| Aspect | Excalibur | Phaser | Kaplay |
|--------|-----------|--------|--------|
| Language | TypeScript-first | JS with TS definitions | JS/TS |
| API style | Class-based (extends Actor, Scene) | Class-based (extends Scene) | Functional (add, onKeyPress) |
| Object model | Actor → Entity + Components | Game Objects (Sprite, Image, etc.) | Component arrays + tags |
| Physics | Built-in SAT (polygon collision) | Arcade (AABB) or Matter.js plugin | Built-in arcade |
| Scene model | Persistent, lifecycle hooks | Persistent, parallel scenes | Stateless functions |
| ECS access | Full ECS exposed alongside Actor API | None (custom architecture) | ECS-inspired, no raw access |
| Maturity | v0.32 (pre-1.0, active development) | v3.90 (stable, production-ready) | v3001 (stable fork of Kaboom) |
| Best for | TypeScript projects, clean architecture | Large production games, broad ecosystem | Rapid prototyping, learning |

---

## Mobile and Deployment

### Mobile Considerations

- Use `DisplayMode.FitScreen` or `FitContainer` for responsive layout.
- Pointer input works for both mouse and touch — no separate touch handling needed.
- Test audio playback — browsers require user interaction before playing sounds. Set `loader.suppressPlayButton = false` to show the built-in play button, or handle the gesture yourself.
- Excalibur targets the latest 2 versions of major browsers (Chrome, Firefox, Safari, Edge) including mobile variants.

### Deployment

- **Vite/Webpack** — standard bundler setup. The Excalibur CLI (`npx create-excalibur`) scaffolds a Vite project.
- **Static hosting** — build to `dist/`, deploy to Netlify, Vercel, GitHub Pages.
- **Itch.io** — zip the build output. Excalibur games are lightweight.
- **Electron/Capacitor** — wrap for desktop or mobile app stores.

---

## Key Takeaways for AI Code Generation

1. **Always extend `Actor`** for game objects and `Scene` for game states. Use the class-based patterns — they are Excalibur's strength.
2. **Use `CollisionType` correctly** — `Active` for things that move and collide, `Fixed` for immovable platforms, `Passive` for triggers/pickups.
3. **Load resources through the `Loader`** — declare `ImageSource` and `Sound` instances, add them to a `Loader`, pass the loader to `game.start(loader)`.
4. **Convert `ImageSource` to `Sprite` before drawing** — `ImageSource` is the raw loaded file; call `.toSprite()` or use `SpriteSheet.fromImageSource()` to create drawable graphics.
5. **Use `onInitialize` for one-time setup, `onActivate` for per-entry setup** — `onInitialize` runs once per scene lifetime; `onActivate` runs every time you navigate to the scene.
6. **Input is accessed through `engine.input`** — keyboard, pointer, and gamepad are all available as typed properties.
7. **Drop to ECS only when needed** — Actors handle 90% of use cases. Use raw Entities and custom Systems for high-performance scenarios or novel behavior patterns.
8. **Excalibur is pre-1.0** — minor API changes may occur between versions. Pin your version in `package.json` and check the changelog when upgrading.
