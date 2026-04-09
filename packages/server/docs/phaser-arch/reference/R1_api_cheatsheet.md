# R1 — Phaser 3 API Quick Reference

> **Category:** reference · **Engine:** Phaser · **Related:** [E1 Architecture Overview](../architecture/E1_architecture_overview.md) · [G1 Scene Lifecycle](../guides/G1_scene_lifecycle.md) · [G4 Sprites & Animation](../guides/G4_sprites_and_animation.md)

---

## Game Configuration

```typescript
const config: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,              // AUTO, WEBGL, or CANVAS
  width: 800,
  height: 600,
  parent: 'game-container',       // DOM element ID
  backgroundColor: '#000000',
  physics: {
    default: 'arcade',            // 'arcade', 'matter', or 'impact'
    arcade: { gravity: { x: 0, y: 300 }, debug: false }
  },
  scale: {
    mode: Phaser.Scale.FIT,       // FIT, ENVELOP, RESIZE, NONE
    autoCenter: Phaser.Scale.CENTER_BOTH
  },
  scene: [BootScene, GameScene, UIScene]
};

const game = new Phaser.Game(config);
```

---

## Scene Lifecycle

```typescript
class GameScene extends Phaser.Scene {
  constructor() {
    super({ key: 'GameScene' });
  }

  init(data: object): void { }       // First — receives transition data
  preload(): void { }                // Second — queue asset loading
  create(data: object): void { }     // Third — build game objects
  update(time: number, delta: number): void { }  // Every frame
}
```

### Scene Manager (from within a Scene)

| Method | What it does |
|--------|-------------|
| `this.scene.start('Key', data?)` | Stop this scene, start target |
| `this.scene.launch('Key', data?)` | Start target, keep this running |
| `this.scene.switch('Key')` | Sleep this, wake/start target |
| `this.scene.restart(data?)` | Stop + restart this scene |
| `this.scene.pause()` / `.resume()` | Pause updates (still renders) |
| `this.scene.sleep()` / `.wake()` | Pause updates + rendering |
| `this.scene.stop()` | Fully shut down this scene |
| `this.scene.run('Key')` | Smart resume: wakes, restarts, or starts as needed |
| `this.scene.get('Key')` | Get reference to another scene instance |
| `this.scene.bringToTop('Key')` | Move scene to front of render order |
| `this.scene.sendToBack('Key')` | Move scene to back of render order |

### Cross-Scene Data

```typescript
// Global registry — persists across all scenes
this.registry.set('score', 100);
this.registry.get('score');  // 100

// Listen for changes from any scene
this.registry.events.on('changedata-score', (parent, value) => { });

// Pass data during transition
this.scene.start('GameOver', { score: 100, level: 3 });
// Received in target scene's init(data) and create(data)
```

---

## Asset Loading (in preload)

```typescript
// Images
this.load.image('logo', 'assets/logo.png');
this.load.spritesheet('player', 'assets/player.png', {
  frameWidth: 32, frameHeight: 48
});
this.load.atlas('ui', 'assets/ui.png', 'assets/ui.json');

// Audio
this.load.audio('bgm', ['assets/music.ogg', 'assets/music.mp3']);

// Tilemaps
this.load.tilemapTiledJSON('level1', 'assets/level1.json');
this.load.image('tiles', 'assets/tileset.png');

// Bitmap fonts
this.load.bitmapFont('pixelFont', 'assets/font.png', 'assets/font.xml');

// JSON data
this.load.json('enemyData', 'assets/enemies.json');

// Loading progress
this.load.on('progress', (value: number) => { /* 0..1 */ });
this.load.on('complete', () => { /* all assets ready */ });
```

---

## Game Objects (in create/update)

### Sprites & Images

```typescript
// Static image (no animation)
const bg = this.add.image(400, 300, 'background');

// Sprite (supports animation)
const player = this.add.sprite(100, 450, 'player');

// Common properties
player.setPosition(x, y);
player.setScale(2);                // uniform scale
player.setScale(2, 1.5);           // non-uniform
player.setOrigin(0.5, 1);          // anchor point (0-1)
player.setAlpha(0.8);              // transparency
player.setTint(0xff0000);          // color multiply
player.setAngle(45);               // degrees
player.setRotation(Math.PI / 4);   // radians
player.setFlipX(true);             // horizontal mirror
player.setDepth(10);               // z-order (higher = on top)
player.setVisible(false);
player.setActive(false);           // excludes from update
player.destroy();                  // remove from scene
```

### Animations

```typescript
// Define animation (usually in create)
this.anims.create({
  key: 'walk',
  frames: this.anims.generateFrameNumbers('player', { start: 0, end: 7 }),
  frameRate: 10,
  repeat: -1                       // -1 = loop forever
});

// From a texture atlas
this.anims.create({
  key: 'explode',
  frames: this.anims.generateFrameNames('atlas', {
    prefix: 'explosion_', start: 0, end: 15, zeroPad: 2, suffix: '.png'
  }),
  frameRate: 24,
  repeat: 0
});

// Play on a sprite
player.play('walk');
player.anims.pause();
player.anims.resume();
player.anims.stop();
player.anims.restart();

// Events
player.on('animationcomplete', (anim: Phaser.Animations.Animation) => { });
player.on('animationcomplete-explode', () => { /* specific anim */ });
```

### Text

```typescript
const text = this.add.text(10, 10, 'Score: 0', {
  fontFamily: 'Arial',
  fontSize: '24px',
  color: '#ffffff',
  stroke: '#000000',
  strokeThickness: 2,
  shadow: { offsetX: 2, offsetY: 2, color: '#000', blur: 4, fill: true }
});
text.setText('Score: 100');

// Bitmap text (faster rendering)
const bmpText = this.add.bitmapText(10, 10, 'pixelFont', 'SCORE', 16);
```

### Graphics (shapes, lines, fills)

```typescript
const gfx = this.add.graphics();

gfx.fillStyle(0xff0000, 0.8);               // color, alpha
gfx.fillRect(10, 10, 200, 100);             // x, y, w, h
gfx.fillCircle(400, 300, 50);               // x, y, radius
gfx.fillRoundedRect(10, 10, 200, 100, 16);  // with corner radius

gfx.lineStyle(2, 0x00ff00);                 // thickness, color
gfx.strokeRect(10, 10, 200, 100);
gfx.lineBetween(0, 0, 800, 600);            // x1, y1, x2, y2

gfx.clear();                                // erase everything
```

### Groups

```typescript
// Static group (no physics)
const stars = this.add.group();

// Physics group
const enemies = this.physics.add.group({
  key: 'enemy',
  repeat: 5,                    // creates 6 total (1 + 5 repeats)
  setXY: { x: 100, y: 0, stepX: 80 }
});

// Operations on all children
enemies.children.iterate((child: Phaser.GameObjects.Sprite) => {
  child.setTint(0xff0000);
});

enemies.getLength();
enemies.getFirst(true);        // first active member
```

---

## Physics (Arcade)

```typescript
// Enable on a game object
this.physics.add.existing(player);

// Or create with physics directly
const player = this.physics.add.sprite(100, 450, 'player');

// Body properties
player.body!.setVelocity(200, -300);
player.body!.setVelocityX(200);
player.body!.setBounce(0.5);
player.body!.setGravityY(600);
player.body!.setCollideWorldBounds(true);
player.body!.setDrag(100);
player.body!.setMaxVelocity(400, 600);
player.body!.setSize(20, 30);              // hitbox size
player.body!.setOffset(6, 18);             // hitbox offset from sprite origin
player.body!.setImmovable(true);           // won't be pushed by collisions

// Collisions & overlaps
this.physics.add.collider(player, platforms);       // bounce off
this.physics.add.collider(player, enemies, onHit);  // bounce + callback
this.physics.add.overlap(player, coins, collect);    // no bounce, just callback

function collect(player: Phaser.GameObjects.Sprite, coin: Phaser.GameObjects.Sprite): void {
  coin.destroy();
}

// World bounds
this.physics.world.setBounds(0, 0, 1600, 600);
```

---

## Input

### Keyboard

```typescript
// Cursor keys (up, down, left, right + shift, space)
const cursors = this.input.keyboard!.createCursorKeys();

if (cursors.left.isDown) player.setVelocityX(-160);
if (cursors.up.isDown && player.body!.touching.down) player.setVelocityY(-330);

// Specific keys
const keyW = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.W);
if (Phaser.Input.Keyboard.JustDown(keyW)) { /* fires once per press */ }

// Key combo
this.input.keyboard!.createCombo('IDDQD', { resetOnMatch: true });
this.input.keyboard!.on('keycombomatch', () => { console.log('cheat!'); });
```

### Pointer (Mouse / Touch)

```typescript
// Basic click/tap
this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
  console.log(pointer.x, pointer.y, pointer.button);
});

// On a specific game object
sprite.setInteractive();           // required to receive input
sprite.on('pointerdown', () => { });
sprite.on('pointerover', () => { });
sprite.on('pointerout', () => { });

// Drag
sprite.setInteractive({ draggable: true });
this.input.on('drag', (pointer, obj, dragX, dragY) => {
  obj.setPosition(dragX, dragY);
});
```

---

## Tweens

```typescript
// Basic tween
this.tweens.add({
  targets: sprite,
  x: 600,
  alpha: 0.5,
  duration: 1000,
  ease: 'Sine.easeInOut',
  delay: 200,
  repeat: 2,                    // play 3 total times
  yoyo: true,                   // reverse after each play
  hold: 500,                    // pause at end before yoyo
  onComplete: () => { },
  onUpdate: (tween, target) => { }
});

// Chain multiple tweens in sequence
this.tweens.chain({
  targets: sprite,
  tweens: [
    { y: 100, duration: 500, ease: 'Bounce.easeOut' },
    { x: 600, duration: 1000, ease: 'Cubic.easeInOut' },
    { alpha: 0, duration: 300 }
  ]
});

// Common easing functions:
// Linear, Quad, Cubic, Quart, Quint, Sine, Expo, Circ,
// Elastic, Back, Bounce — each with .easeIn, .easeOut, .easeInOut

// Tween control
const tween = this.tweens.add({ /* ... */ });
tween.pause();
tween.resume();
tween.stop();
tween.restart();
tween.seek(500);               // jump to 500ms
tween.destroy();
```

---

## Camera

```typescript
const cam = this.cameras.main;

cam.startFollow(player, true, 0.1, 0.1);  // smooth follow
cam.stopFollow();
cam.setBounds(0, 0, 3200, 600);           // don't scroll past these
cam.setZoom(1.5);
cam.setScroll(x, y);
cam.pan(400, 300, 1000, 'Sine.easeInOut');
cam.shake(200, 0.01);                     // duration, intensity
cam.flash(500, 255, 255, 255);            // duration, r, g, b
cam.fade(1000, 0, 0, 0);                  // fade to black

// Camera effects callback
cam.once('camerafadeoutcomplete', () => {
  this.scene.start('NextScene');
});
```

---

## Tilemaps

```typescript
// Create from Tiled JSON
const map = this.make.tilemap({ key: 'level1' });
const tileset = map.addTilesetImage('tileset-name', 'tiles');  // Tiled name, Phaser key
const ground = map.createLayer('Ground', tileset!, 0, 0)!;
const decor = map.createLayer('Decoration', tileset!, 0, 0)!;

// Collision by property (set in Tiled)
ground.setCollisionByProperty({ collides: true });

// Or by tile index
ground.setCollision([1, 2, 3, 10, 11, 12]);

// Physics collision
this.physics.add.collider(player, ground);

// Object layer (spawn points, triggers)
const objects = map.getObjectLayer('Spawns')!;
objects.objects.forEach((obj) => {
  if (obj.name === 'player-start') {
    player.setPosition(obj.x!, obj.y!);
  }
});
```

---

## Audio

```typescript
// Background music
const music = this.sound.add('bgm', { loop: true, volume: 0.5 });
music.play();
music.pause();
music.resume();
music.stop();

// Sound effects
const sfx = this.sound.add('explosion', { volume: 0.8 });
sfx.play();

// One-liner for quick SFX
this.sound.play('coin', { volume: 0.6, rate: 1.2 });

// Global controls
this.sound.pauseAll();
this.sound.resumeAll();
this.sound.setVolume(0.5);     // master volume
```

---

## Timers & Events

```typescript
// Delayed call
this.time.delayedCall(2000, () => {
  console.log('2 seconds later');
});

// Repeating timer
this.time.addEvent({
  delay: 1000,
  callback: spawnEnemy,
  callbackScope: this,
  loop: true                   // or repeat: 5 for finite count
});

// Custom events (scene-level)
this.events.emit('player-died', { score: 100 });
this.events.on('player-died', (data) => { });

// Global events (cross-scene)
this.game.events.emit('achievement', { id: 'first-kill' });
this.game.events.on('achievement', (data) => { });
```

---

## Useful Utilities

```typescript
// Random
Phaser.Math.Between(1, 100);                     // integer
Phaser.Math.FloatBetween(0, 1);                   // float
Phaser.Utils.Array.GetRandom(enemies.getChildren()); // random array element
Phaser.Utils.Array.Shuffle(items);                // in-place shuffle

// Distance & angle
Phaser.Math.Distance.Between(x1, y1, x2, y2);
Phaser.Math.Angle.Between(x1, y1, x2, y2);       // radians

// Clamping & interpolation
Phaser.Math.Clamp(value, min, max);
Phaser.Math.Linear(a, b, t);                      // lerp

// Object pooling (reuse destroyed objects)
const pool = this.add.group({ maxSize: 20, classType: Bullet });
const bullet = pool.get(x, y, 'bullet');           // reuses inactive member
if (bullet) { bullet.setActive(true).setVisible(true); }
```
