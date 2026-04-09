# R1 — Excalibur.js v0.32 API Quick Reference

> **Category:** reference · **Engine:** Excalibur · **Related:** [E1 Architecture Overview](../architecture/E1_architecture_overview.md) · [G1 Actors & Entities](../guides/G1_actors_and_entities.md) · [G2 Scene Management](../guides/G2_scene_management.md)

---

## Engine Setup

```typescript
import {
  Engine, DisplayMode, Color, Physics, CollisionType, Vector,
  Scene, Actor, Label, Timer, Loader, ImageSource, Sound,
  SpriteSheet, Animation, Input, Keys
} from 'excalibur';

const game = new Engine({
  width: 800,
  height: 600,
  displayMode: DisplayMode.FitScreen,   // FitScreen, FitContainer, Fixed, FillScreen
  backgroundColor: Color.fromHex('#1a1a2e'),
  fixedUpdateFps: 60,                    // physics tick rate
  maxFps: 60,                            // render cap
  antialiasing: false,                   // false for pixel art
  pixelRatio: 1,                         // override device pixel ratio
  suppressPlayButton: true,              // skip "click to play" screen
});

// Register scenes
game.addScene('menu', new MenuScene());
game.addScene('game', new GameScene());

// Start with loader
game.start(loader).then(() => {
  game.goToScene('menu');
});
```

### DisplayMode Options

| Mode | Behavior |
|------|----------|
| `DisplayMode.Fixed` | Exact pixel dimensions, no scaling |
| `DisplayMode.FitScreen` | Scale to fit viewport, maintain aspect ratio |
| `DisplayMode.FitContainer` | Scale to fit parent DOM element |
| `DisplayMode.FillScreen` | Stretch to fill viewport (may distort) |

---

## Resource Loading

```typescript
import { ImageSource, Sound, Loader, SpriteSheet } from 'excalibur';

// Define resources
const Resources = {
  HeroSheet: new ImageSource('images/hero.png'),
  EnemySheet: new ImageSource('images/enemy.png'),
  Background: new ImageSource('images/bg.png'),
  CoinSfx: new Sound('audio/coin.wav'),
  Music: new Sound('audio/bgm.ogg'),
  TilesetImage: new ImageSource('images/tileset.png'),
} as const;

// Create a loader with all resources
const loader = new Loader();
for (const resource of Object.values(Resources)) {
  loader.addResource(resource);
}

// Loader customization
loader.backgroundColor = '#1a1a2e';
loader.logo = 'images/logo.png';          // custom loading logo
loader.logoWidth = 200;
loader.playButtonText = 'START';

// Start engine with loader
game.start(loader);
```

### SpriteSheet from ImageSource

```typescript
const heroSheet = SpriteSheet.fromImageSource({
  image: Resources.HeroSheet,
  grid: {
    rows: 4,
    columns: 8,
    spriteWidth: 32,
    spriteHeight: 32,
  },
  spacing: {
    margin: { x: 0, y: 0 },       // margin around entire sheet
    originOffset: { x: 0, y: 0 },  // offset per sprite
  },
});

// Get a single sprite
const idleSprite = heroSheet.getSprite(0, 0);  // col, row

// Create animation from sheet
const walkAnim = Animation.fromSpriteSheet(
  heroSheet,
  [0, 1, 2, 3, 4, 5, 6, 7],     // frame indices (left-to-right, top-to-bottom)
  80,                              // frame duration in ms
);
```

---

## Scenes

```typescript
import { Scene, Engine, Actor, vec } from 'excalibur';

class GameScene extends Scene {
  // Called once when the scene is first created
  onInitialize(engine: Engine): void {
    const player = new Player();
    this.add(player);

    const platform = new Platform(vec(400, 500), 600, 40);
    this.add(platform);
  }

  // Called every time the scene is entered
  onActivate(context: SceneActivationContext): void {
    // context.data contains transition data
    console.log('Entering game scene', context.data);
  }

  // Called when the scene is exited
  onDeactivate(): void {
    // cleanup if needed
  }

  // Called every frame
  onPreUpdate(engine: Engine, delta: number): void {
    // runs before actor updates
  }

  onPostUpdate(engine: Engine, delta: number): void {
    // runs after actor updates
  }
}

// Scene transitions
game.goToScene('game');
game.goToScene('game', { sceneActivationData: { level: 3 } });
```

---

## Actors

```typescript
import {
  Actor, Engine, vec, CollisionType, Color, Shape
} from 'excalibur';

class Player extends Actor {
  constructor() {
    super({
      pos: vec(100, 200),
      width: 32,
      height: 32,
      color: Color.Blue,                 // default color (if no graphic)
      collisionType: CollisionType.Active,
      anchor: vec(0.5, 0.5),            // center origin
      z: 10,                             // draw order
    });
  }

  onInitialize(engine: Engine): void {
    // Called once — set up graphics, events, children
    this.graphics.use(heroSheet.getSprite(0, 0));
  }

  onPreUpdate(engine: Engine, delta: number): void {
    // Called every frame — handle input and logic here
  }

  onPostUpdate(engine: Engine, delta: number): void {
    // After physics and collision resolution
  }

  onCollisionStart(self, other, side, contact): void {
    // Called when collision begins
  }

  onCollisionEnd(self, other, side, lastContact): void {
    // Called when collision ends
  }
}
```

### Actor Common Properties

```typescript
const actor = new Actor({ /* ... */ });

// Position and movement
actor.pos = vec(100, 200);
actor.vel = vec(200, 0);               // velocity (pixels/sec)
actor.acc = vec(0, 500);               // acceleration
actor.rotation = Math.PI / 4;          // radians
actor.angularVelocity = 0.5;           // rad/sec
actor.scale = vec(2, 2);               // visual scale

// Collision
actor.collisionType = CollisionType.Active;   // moves and collides
// CollisionType.Fixed   — collides but doesn't move (platforms)
// CollisionType.Passive — triggers events but no physical response
// CollisionType.PreventCollision — no collisions at all

// Visibility & lifecycle
actor.graphics.opacity = 0.5;
actor.graphics.visible = false;
actor.active = false;                  // skip update
actor.kill();                          // remove from scene
actor.isKilled();                      // check if dead

// Children (nested actors)
actor.addChild(childActor);
actor.removeChild(childActor);
actor.children;                        // list of children
```

### Graphics on Actors

```typescript
// Use a sprite
actor.graphics.use(sprite);

// Use an animation
actor.graphics.use(walkAnim);

// Add named graphics and switch between them
actor.graphics.add('idle', idleSprite);
actor.graphics.add('walk', walkAnim);
actor.graphics.add('jump', jumpSprite);
actor.graphics.show('walk');

// Flip graphics
actor.graphics.flipHorizontal = true;
actor.graphics.flipVertical = false;

// Offset graphics from actor origin
actor.graphics.offset = vec(0, -5);
```

---

## Actions (Scripted Behavior)

```typescript
// Actions are chained on actor.actions
// They execute in sequence by default

// Movement
actor.actions.moveTo(vec(300, 200), 200);    // target pos, speed (px/s)
actor.actions.moveBy(vec(100, 0), 200);      // offset, speed

// Rotation
actor.actions.rotateTo(Math.PI, 1000);       // target angle, duration (ms)
actor.actions.rotateBy(Math.PI / 2, 500);    // offset angle, duration

// Scaling
actor.actions.scaleTo(vec(2, 2), vec(0.5, 0.5));  // target, speed
actor.actions.scaleBy(vec(1, 1), 0.5);             // offset, speed

// Fading
actor.actions.fade(0, 1000);                 // target opacity, duration (ms)

// Delay
actor.actions.delay(500);                    // wait 500ms before next action

// Custom callback in chain
actor.actions.callMethod(() => {
  console.log('Reached destination!');
});

// Repeat / Loop
actor.actions.repeatForever((ctx) => {
  ctx.moveTo(vec(0, 200), 100);
  ctx.moveTo(vec(400, 200), 100);
});

actor.actions.repeat((ctx) => {
  ctx.rotateTo(Math.PI * 2, 1000);
}, 3);  // repeat 3 times

// Stop all actions
actor.actions.clearActions();
```

---

## Input

### Keyboard

```typescript
// In onPreUpdate or onPostUpdate
onPreUpdate(engine: Engine, delta: number): void {
  // Held down (continuous)
  if (engine.input.keyboard.isHeld(Keys.Left)) {
    this.vel.x = -200;
  }
  if (engine.input.keyboard.isHeld(Keys.Right)) {
    this.vel.x = 200;
  }

  // Just pressed (single frame)
  if (engine.input.keyboard.wasPressed(Keys.Space)) {
    this.vel.y = -400;  // jump
  }

  // Just released
  if (engine.input.keyboard.wasReleased(Keys.Shift)) {
    // stop sprinting
  }
}

// Event-based (in onInitialize)
engine.input.keyboard.on('press', (evt) => {
  if (evt.key === Keys.Escape) {
    engine.goToScene('pause');
  }
});
```

### Pointer (Mouse / Touch)

```typescript
// Global pointer events
engine.input.pointers.primary.on('down', (evt) => {
  console.log(evt.worldPos.x, evt.worldPos.y);
});

engine.input.pointers.primary.on('move', (evt) => {
  crosshair.pos = evt.worldPos;
});

// Actor-level pointer events (actor must have a collider)
actor.on('pointerdown', (evt) => {
  actor.kill();
});

actor.on('pointerenter', () => {
  actor.color = Color.Red;
});

actor.on('pointerleave', () => {
  actor.color = Color.Blue;
});

// Drag
actor.on('pointerdragstart', (evt) => { });
actor.on('pointerdragmove', (evt) => {
  actor.pos = evt.worldPos;
});
actor.on('pointerdragend', (evt) => { });
```

### Gamepad

```typescript
// Check for connected gamepads
engine.input.gamepads.enabled = true;

engine.input.gamepads.on('connect', (evt) => {
  const pad = evt.gamepad;
  pad.on('button', (buttonEvt) => {
    if (buttonEvt.button === Buttons.Face1) {
      player.jump();
    }
  });
});

// In update — read sticks
const pad = engine.input.gamepads.at(0);
if (pad) {
  const leftX = pad.getAxes(Axes.LeftStickX);
  const leftY = pad.getAxes(Axes.LeftStickY);
  player.vel = vec(leftX * 200, leftY * 200);
}
```

---

## Physics & Collisions

```typescript
import { Physics, CollisionType, vec, CompositeCollider, Shape } from 'excalibur';

// Global gravity
Physics.gravity = vec(0, 800);         // pixels/sec²

// Player with physics
class Player extends Actor {
  constructor() {
    super({
      pos: vec(100, 200),
      collisionType: CollisionType.Active,
      collider: Shape.Box(32, 32),       // simple box collider
    });
  }
}

// Platform (static)
class Platform extends Actor {
  constructor(pos: Vector, width: number, height: number) {
    super({
      pos,
      width,
      height,
      color: Color.Gray,
      collisionType: CollisionType.Fixed,  // immovable
    });
  }
}

// Custom collider shapes
const complexActor = new Actor({
  pos: vec(400, 300),
  collisionType: CollisionType.Active,
  collider: new CompositeCollider([
    Shape.Box(30, 50, vec(0.5, 0.5)),
    Shape.Circle(15, vec(0, -25)),        // head circle
  ]),
});

// Collision events on actor
actor.on('collisionstart', (evt) => {
  console.log('Hit:', evt.other.name);
  console.log('Side:', evt.side);          // Top, Bottom, Left, Right
  console.log('Contact:', evt.contact);
});

actor.on('collisionend', (evt) => {
  console.log('Separated from:', evt.other.name);
});

// Collision groups for filtering
import { CollisionGroup, CollisionGroupManager } from 'excalibur';

const PlayerGroup = CollisionGroupManager.create('player');
const EnemyGroup = CollisionGroupManager.create('enemy');
const BulletGroup = CollisionGroupManager.create('bullet');

// Bullets hit enemies but not the player
bullet.body.group = CollisionGroup.collidesWith([EnemyGroup]);
```

---

## Camera

```typescript
// Access the camera
const camera = game.currentScene.camera;

// Follow an actor
camera.strategy.lockToActor(player);

// Smooth follow with elasticity
camera.strategy.elasticToActor(player, 0.1, 0.1);

// Lock to actor on a specific axis
camera.strategy.lockToActorAxis(player, Axis.X);

// Camera bounds (don't scroll past these)
camera.strategy.limitCameraBounds(
  new BoundingBox(0, 0, 3200, 600)
);

// Zoom
camera.zoom = 2;

// Camera shake
camera.shake(5, 5, 500);   // x magnitude, y magnitude, duration ms

// Camera position (manual control)
camera.pos = vec(400, 300);

// Smooth pan
camera.move(vec(600, 300), 1000);  // target, duration ms
```

---

## Audio

```typescript
import { Sound } from 'excalibur';

// Play a loaded sound
Resources.CoinSfx.play(0.8);          // volume 0..1

// Background music
const music = Resources.Music;
music.loop = true;
music.volume = 0.3;
music.play();

// Control playback
music.pause();
music.stop();
music.seek(0);                         // restart from beginning
music.isPlaying();                     // check state

// Instance-based playback (multiple simultaneous)
const instance = Resources.CoinSfx.play();
instance.volume = 0.5;
instance.loop = false;
```

---

## Timers & Events

```typescript
import { Timer } from 'excalibur';

// Scene-level timer
const spawnTimer = new Timer({
  fcn: () => spawnEnemy(),
  interval: 2000,                      // ms
  repeats: true,                       // loop forever
  numberOfRepeats: -1,                 // infinite
});
scene.add(spawnTimer);
spawnTimer.start();

// One-shot timer
const delayTimer = new Timer({
  fcn: () => showBoss(),
  interval: 5000,
  repeats: false,
});
scene.add(delayTimer);
delayTimer.start();

// Timer control
spawnTimer.pause();
spawnTimer.unpause();
spawnTimer.cancel();
spawnTimer.reset();

// Custom events
import { EventEmitter } from 'excalibur';

class GameEvents extends EventEmitter {
  // Type-safe events
}

// Actor events
actor.on('kill', () => { });
actor.on('initialize', () => { });
actor.on('preupdate', (evt) => { });
actor.on('postupdate', (evt) => { });
```

---

## Text & UI

```typescript
import { Label, Font, FontUnit, TextAlign, Color, Actor, vec } from 'excalibur';

// Label (extends Actor — has position, actions, etc.)
const scoreLabel = new Label({
  text: 'Score: 0',
  pos: vec(10, 30),
  font: new Font({
    family: 'Arial',
    size: 24,
    unit: FontUnit.Px,
    color: Color.White,
    textAlign: TextAlign.Left,
    shadow: {
      offset: vec(2, 2),
      color: Color.Black,
      blur: 4,
    },
  }),
});
scene.add(scoreLabel);

// Update text
scoreLabel.text = `Score: ${score}`;

// UI fixed to screen (add to ScreenElement)
import { ScreenElement } from 'excalibur';

class HUD extends ScreenElement {
  onInitialize(): void {
    // ScreenElement is fixed to screen space (like Kaplay's fixed())
    this.graphics.use(heartSprite);
    this.pos = vec(20, 20);
  }
}
```

---

## TileMaps

```typescript
import { TileMap, vec } from 'excalibur';

// Create a tilemap
const tilemap = new TileMap({
  pos: vec(0, 0),
  tileWidth: 32,
  tileHeight: 32,
  columns: 50,
  rows: 20,
});

// Set tile graphics
for (let i = 0; i < tilemap.tiles.length; i++) {
  const tile = tilemap.tiles[i];
  tile.addGraphic(tilesetSheet.getSprite(tileIndex, 0));

  // Make solid tiles collidable
  if (isSolid(tileIndex)) {
    tile.solid = true;
  }
}

scene.add(tilemap);

// Tiled integration (with @excaliburjs/plugin-tiled)
import { TiledResource } from '@excaliburjs/plugin-tiled';

const tiledMap = new TiledResource('maps/level1.tmx');
loader.addResource(tiledMap);

// After loading
tiledMap.addToScene(scene);
```

---

## Useful Utilities

```typescript
import {
  vec, Vector, Color, Random, clamp, range,
  BoundingBox, Ray, Side
} from 'excalibur';

// Vectors
vec(100, 200);                           // shorthand for new Vector(100, 200)
Vector.Zero;                             // (0, 0)
Vector.Up;                               // (0, -1)
Vector.Down;                             // (0, 1)
Vector.Left;                             // (-1, 0)
Vector.Right;                            // (1, 0)

const a = vec(100, 200);
const b = vec(300, 400);
a.distance(b);                           // distance between
a.normalize();                           // unit vector
a.scale(2);                              // multiply by scalar
a.add(b);                                // vector addition
a.sub(b);                                // vector subtraction
a.dot(b);                                // dot product
a.cross(b);                              // cross product (scalar in 2D)

// Random (seeded)
const rng = new Random(12345);           // seed for reproducibility
rng.integer(0, 100);                     // random int
rng.floating(0, 1);                      // random float
rng.pickOne(['a', 'b', 'c']);            // random element
rng.shuffle(['a', 'b', 'c']);            // shuffle array
rng.bool();                              // random boolean
rng.d6();                                // dice roll 1..6

// Colors
Color.Red;
Color.Blue;
Color.Transparent;
Color.fromRGB(255, 128, 0);
Color.fromHex('#ff8800');
color.lighten(0.2);                      // lighter shade
color.darken(0.2);                       // darker shade

// Math
clamp(value, min, max);                  // constrain to range

// Bounding box
const bb = new BoundingBox(0, 0, 100, 100);
bb.contains(vec(50, 50));                // point inside?
bb.overlaps(otherBB);                    // intersection test

// Debug
engine.showDebug(true);                  // show colliders, FPS, etc.
engine.debug.entity.showId = true;       // show entity IDs
engine.debug.collider.showGeometry = true;
```
