# R1 — Kaplay v3001 API Quick Reference

> **Category:** reference · **Engine:** Kaplay · **Related:** [E1 Architecture Overview](../architecture/E1_architecture_overview.md) · [G1 Components & Game Objects](../guides/G1_components_and_game_objects.md) · [G2 Scenes & Navigation](../guides/G2_scenes_and_navigation.md)

---

## Initialization

```typescript
import kaplay from 'kaplay';

const k = kaplay({
  width: 800,
  height: 600,
  background: [0, 0, 0],         // RGB or CSS color string
  canvas: document.querySelector('#game') as HTMLCanvasElement,
  scale: 1,                       // pixel scale multiplier
  crisp: true,                    // pixel-perfect (no anti-aliasing)
  stretch: true,                  // stretch canvas to container
  letterbox: true,                // letterbox when aspect ratio differs
  debug: true,                    // show colliders, FPS counter
  buttons: {                      // unified input bindings
    jump: { keyboard: ['space', 'up'], gamepad: ['south'] },
    fire: { keyboard: ['x'], mouse: 'left', gamepad: ['west'] },
  },
});
```

---

## Asset Loading

```typescript
// Images / Sprites
loadSprite('player', 'sprites/player.png');

// Spritesheet with slice config
loadSprite('hero', 'sprites/hero.png', {
  sliceX: 8,                     // columns in sheet
  sliceY: 4,                     // rows in sheet
  anims: {
    idle: { from: 0, to: 3, loop: true, speed: 8 },
    run:  { from: 8, to: 15, loop: true, speed: 12 },
    jump: { from: 16, to: 19, loop: false, speed: 10 },
  },
});

// Aseprite support
loadAseprite('character', 'sprites/character.png', 'sprites/character.json');

// Sounds
loadSound('bgm', 'audio/music.ogg');
loadSound('coin', 'audio/coin.wav');

// Fonts
loadFont('pixelfont', 'fonts/pixel.ttf');
loadBitmapFont('bmpfont', 'fonts/font.png', 12, 12);

// Custom data
loadJSON('levels', 'data/levels.json');

// Loading screen
loadProgress((progress: number) => {
  // progress is 0..1
});
```

---

## Game Objects & Components

### Creating Objects

```typescript
// add() takes an array of components and returns a game object
const player = add([
  sprite('hero'),                // render a sprite
  pos(100, 200),                 // position
  area(),                        // collision detection
  body(),                        // physics (gravity, jumping)
  health(3),                     // hit points
  anchor('center'),              // origin point for rendering
  scale(2),                      // visual scale
  rotate(0),                     // rotation in degrees
  opacity(1),                    // transparency (0..1)
  z(10),                         // draw order (higher = on top)
  color(255, 255, 255),          // color tint (RGB)
  'player',                      // tag (string)
  'friendly',                    // multiple tags allowed
  { speed: 200 },                // custom data
]);

// Destroy
player.destroy();

// Check existence
player.exists();
```

### Common Components Reference

| Component | Purpose | Key Properties/Methods |
|-----------|---------|----------------------|
| `pos(x, y)` | Position | `.pos`, `.move(x, y)`, `.moveTo(vec, speed)` |
| `sprite(name)` | Render sprite | `.play(anim)`, `.stop()`, `.frame`, `.flipX`, `.flipY` |
| `area()` | Collision | `.onCollide()`, `.onCollideUpdate()`, `.onCollideEnd()`, `.isColliding()` |
| `body()` | Physics | `.jump(force)`, `.isGrounded()`, `.gravityScale`, `.vel` |
| `health(hp)` | Hit points | `.hp()`, `.hurt(n)`, `.heal(n)`, `.onDeath()`, `.onHurt()` |
| `anchor(point)` | Origin | `'center'`, `'topleft'`, `'botright'`, `vec2(0.5, 1)` |
| `scale(x, y?)` | Scale | `.scaleTo(x, y)` |
| `rotate(deg)` | Rotation | `.angle` |
| `opacity(val)` | Transparency | `.opacity` (0..1) |
| `color(r, g, b)` | Tint | `.color` |
| `z(index)` | Draw order | Higher draws on top |
| `fixed()` | Ignore camera | Stays in screen space (for UI) |
| `stay()` | Persist across scenes | Object survives `go()` transitions |
| `timer()` | Timers on object | `.wait(secs, fn)`, `.loop(secs, fn)`, `.tween()` |
| `offscreen()` | Offscreen detection | `.onExitScreen()`, `.onEnterScreen()` |
| `rect(w, h)` | Rectangle shape | Renders a filled rect |
| `circle(radius)` | Circle shape | Renders a filled circle |
| `text(str, opts)` | Text rendering | `.text`, `.textSize`, `.font` |
| `outline(width)` | Outline stroke | Adds border to shapes |
| `lifespan(secs)` | Auto-destroy | Removes after N seconds |
| `state(init, list)` | State machine | `.enterState()`, `.onStateEnter()`, `.onStateUpdate()` |
| `patrol()` | AI movement | Set waypoints for automatic patrol |
| `double()` | Double-jump | Enables `doubleJump()` |
| `sentry()` | Vision detection | `.onObjectSpotted()` |

### Querying Game Objects

```typescript
// Get all objects with a tag
const enemies = get('enemy');

// Get all objects (no filter)
const everything = get('*');

// Destroy all with tag
destroyAll('bullet');

// Loop over tagged objects
get('enemy').forEach((e) => {
  e.move(-100, 0);
});
```

---

## Scenes

```typescript
// Define a scene
scene('game', (levelNum: number) => {
  // Scene setup — runs each time you enter
  const player = add([
    sprite('hero'),
    pos(100, 200),
    area(),
    body(),
    'player',
  ]);

  // Scene-level events
  onKeyPress('r', () => go('game', levelNum));
});

scene('gameover', (score: number) => {
  add([
    text(`Game Over! Score: ${score}`),
    pos(width() / 2, height() / 2),
    anchor('center'),
  ]);
  onKeyPress('space', () => go('game', 1));
});

// Start a scene (with optional data)
go('game', 1);
```

---

## Input

### Keyboard

```typescript
// Key state (poll in update)
onKeyDown('left', () => {
  player.move(-200, 0);
});

onKeyDown('right', () => {
  player.move(200, 0);
});

// Single press (fires once per key-down)
onKeyPress('space', () => {
  player.jump(400);
});

// Key release
onKeyRelease('space', () => {
  // released
});

// Check key state imperatively
if (isKeyDown('left')) { /* ... */ }
if (isKeyPressed('space')) { /* ... */ }
if (isKeyReleased('x')) { /* ... */ }
```

### Unified Button Bindings

```typescript
// Uses buttons defined in kaplay() config
onButtonPress('jump', () => {
  player.jump(400);
});

onButtonDown('fire', () => {
  shoot();
});
```

### Mouse / Touch

```typescript
// Global click/tap
onClick(() => {
  addExplosion(mousePos());
});

// Click on a specific object (requires area() component)
player.onClick(() => {
  player.hurt(1);
});

// Mouse position
const mpos = mousePos();       // world coordinates
const wpos = toWorld(mousePos()); // if camera moved

// Hover events (requires area())
player.onHover(() => { player.color = rgb(255, 0, 0); });
player.onHoverEnd(() => { player.color = rgb(255, 255, 255); });

// Drag (manual via onMouseDown + onMouseMove)
```

### Gamepad

```typescript
onGamepadButtonPress('south', () => {
  player.jump(400);
});

onGamepadStick('left', (stick: Vec2) => {
  player.move(stick.x * 200, stick.y * 200);
});
```

---

## Physics & Collisions

```typescript
// Gravity (set globally)
setGravity(1600);

// Game object with physics
const player = add([
  sprite('hero'),
  pos(100, 200),
  area(),                        // required for collisions
  body(),                        // affected by gravity, can jump
]);

// Static body (platforms, walls)
const platform = add([
  rect(400, 40),
  pos(200, 500),
  area(),
  body({ isStatic: true }),      // won't move or fall
  color(100, 100, 100),
]);

// Collision callbacks
player.onCollide('enemy', (enemy) => {
  // called once when collision starts
  player.hurt(1);
  destroy(enemy);
});

player.onCollideUpdate('lava', () => {
  // called every frame while overlapping
  player.hurt(0.1);
});

player.onCollideEnd('water', () => {
  // called when collision ends
});

// Jump
onKeyPress('space', () => {
  if (player.isGrounded()) {
    player.jump(600);
  }
});

// Custom velocity
player.vel = vec2(200, -400);
```

---

## Camera

```typescript
// Follow a game object
camPos(player.pos);              // set camera center

// Smooth follow in update
onUpdate(() => {
  camPos(lerp(camPos(), player.pos, 0.1));
});

// Camera zoom
camScale(vec2(2, 2));            // 2x zoom

// Camera rotation
camRot(45);                      // degrees

// Screen shake
shake(8);                        // intensity
```

---

## Audio

```typescript
// Play sound effect
play('coin');

// With options
play('coin', {
  volume: 0.5,
  speed: 1.2,                   // playback speed / pitch
  detune: 200,                  // detune in cents
  loop: false,
});

// Background music
const music = play('bgm', {
  volume: 0.3,
  loop: true,
});

// Control playback
music.paused = true;
music.paused = false;
music.stop();

// Global volume
volume(0.5);                    // master volume 0..1
```

---

## Timers & Events

```typescript
// Wait (seconds)
wait(2, () => {
  spawnEnemy();
});

// Loop (seconds)
loop(1, () => {
  spawnEnemy();
});

// Object-level timers (requires timer() component)
player.wait(3, () => {
  player.heal(1);
});

player.loop(0.5, () => {
  shoot();
});

// Tween
tween(
  player.pos.x,                  // start value
  600,                           // end value
  1.0,                           // duration (seconds)
  (val) => player.pos.x = val,  // setter
  easings.easeOutBounce,         // easing function
);

// Per-frame update
onUpdate(() => {
  // runs every frame for all objects
});

// Per-frame update for tagged objects
onUpdate('enemy', (enemy) => {
  enemy.move(-100, 0);
});

// Per-frame draw (custom rendering)
onDraw(() => {
  drawLine({
    p1: vec2(0, 0),
    p2: mousePos(),
    color: rgb(255, 0, 0),
    width: 2,
  });
});
```

---

## Text & UI

```typescript
// Basic text
add([
  text('Hello World!', {
    size: 24,
    font: 'pixelfont',
    width: 300,                  // wrap width
    align: 'center',
  }),
  pos(400, 300),
  anchor('center'),
  color(255, 255, 255),
]);

// UI overlay (fixed to screen)
const scoreLabel = add([
  text('Score: 0', { size: 20 }),
  pos(10, 10),
  fixed(),                       // won't scroll with camera
  z(100),                        // always on top
]);

// Update text
scoreLabel.text = `Score: ${score}`;
```

---

## Levels (ASCII Maps)

```typescript
const level = addLevel([
  '=          =',
  '=   @   $  =',
  '= ===  === =',
  '=          =',
  '=============',
], {
  tileWidth: 32,
  tileHeight: 32,
  tiles: {
    '=': () => [
      rect(32, 32),
      area(),
      body({ isStatic: true }),
      color(100, 100, 100),
      'wall',
    ],
    '@': () => [
      sprite('hero'),
      area(),
      body(),
      'player',
    ],
    '$': () => [
      sprite('coin'),
      area(),
      'coin',
    ],
  },
});
```

---

## Drawing Primitives

```typescript
// In onDraw() or as one-off calls
drawRect({
  pos: vec2(100, 100),
  width: 200,
  height: 100,
  color: rgb(255, 0, 0),
  fill: true,
  outline: { color: rgb(0, 0, 0), width: 2 },
});

drawCircle({
  pos: vec2(400, 300),
  radius: 50,
  color: rgb(0, 255, 0),
});

drawLine({
  p1: vec2(0, 0),
  p2: vec2(800, 600),
  color: rgb(255, 255, 0),
  width: 3,
});

drawText({
  text: 'Debug info',
  pos: vec2(10, 580),
  size: 14,
  color: rgb(255, 255, 255),
});
```

---

## State Machine (Component)

```typescript
const enemy = add([
  sprite('enemy'),
  pos(400, 300),
  area(),
  state('idle', ['idle', 'patrol', 'chase', 'attack']),
  'enemy',
]);

enemy.onStateEnter('idle', () => {
  enemy.play('idle');
});

enemy.onStateUpdate('patrol', () => {
  enemy.move(100, 0);
});

enemy.onStateEnter('chase', () => {
  enemy.play('run');
});

// Transition
enemy.enterState('patrol');

// Check current state
if (enemy.state === 'chase') { /* ... */ }
```

---

## Useful Utilities

```typescript
// Random
rand(0, 100);                    // random float 0..100
randi(0, 10);                    // random integer 0..10
choose(['a', 'b', 'c']);         // random array element
chance(0.5);                     // 50% chance → true/false

// Vectors
vec2(100, 200);                  // create vector
vec2(100, 200).dist(vec2(0, 0)); // distance between points
vec2(100, 200).angle(vec2(0, 0));// angle to target
vec2(1, 0).scale(200);           // scale vector length
dir(45);                         // unit vector from angle (degrees)

// Math
lerp(0, 100, 0.5);              // linear interpolation → 50
map(0.5, 0, 1, 100, 200);       // remap range → 150
clamp(150, 0, 100);             // clamp to range → 100
wave(-1, 1, time());            // sine wave oscillation

// Screen dimensions
width();                         // canvas width
height();                        // canvas height
center();                        // center position vec2

// Time
time();                          // seconds since game start
dt();                            // delta time (seconds per frame)

// Debug
debug.log('message');            // on-screen debug text
debug.inspect = true;            // show component inspector
debug.paused = true;             // pause game
```
