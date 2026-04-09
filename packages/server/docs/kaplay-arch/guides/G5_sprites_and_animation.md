# G5 — Kaplay Sprites and Animation

> **Category:** guide · **Engine:** Kaplay · **Related:** [E1 Architecture Overview](../architecture/E1_architecture_overview.md) · [G1 Components & Game Objects](G1_components_and_game_objects.md) · [G2 Scenes & Navigation](G2_scenes_and_navigation.md)

---

## Overview

Kaplay handles sprites through two key functions: `loadSprite()` to load and slice spritesheets, and the `sprite()` component to attach and animate them on game objects. Animations are defined during loading as named frame ranges and played back at runtime with control over speed, looping, and ping-pong direction. Kaplay also supports sprite atlases for packing many sprites into a single image.

This guide covers loading sprites, spritesheets, atlases, the sprite component API, animation playback, events, and common patterns.

---

## Loading Sprites

### Single-Image Sprite

For a sprite with a single frame, pass a name and file path:

```typescript
import kaplay from 'kaplay';

const k = kaplay();

// Load a single-frame sprite
k.loadSprite('bean', 'sprites/bean.png');
```

### Spritesheet with Animations

For spritesheets containing multiple frames in a grid, provide `sliceX` and `sliceY` to tell Kaplay how to divide the image, then define named animations as frame ranges:

```typescript
// A 4x2 spritesheet (8 frames total)
k.loadSprite('hero', 'sprites/hero.png', {
  sliceX: 4,       // 4 columns
  sliceY: 2,       // 2 rows
  anims: {
    idle:  { from: 0, to: 3, speed: 6, loop: true },
    run:   { from: 4, to: 7, speed: 10, loop: true },
  },
});
```

Frame indices are counted left-to-right, top-to-bottom starting at `0`. So in a 4×2 grid, row 1 is frames 0–3 and row 2 is frames 4–7.

**Animation definition options:**

| Property   | Type      | Description                                      |
|------------|-----------|--------------------------------------------------|
| `from`     | `number`  | Start frame index (inclusive)                     |
| `to`       | `number`  | End frame index (inclusive)                       |
| `speed`    | `number`  | Frames per second (default: 10)                   |
| `loop`     | `boolean` | Repeat when finished (default: false)             |
| `pingpong` | `boolean` | Reverse direction on reaching the end frame       |

A single-frame "animation" is valid — set `from` and `to` to the same value:

```typescript
anims: {
  hurt: { from: 3, to: 3 },  // single frame, useful for state display
}
```

### Sprite Atlases

When many different sprites live in a single image (packed atlas), use `loadSpriteAtlas()`. Each entry specifies its pixel region and optional animation data:

```typescript
k.loadSpriteAtlas('sprites/atlas.png', {
  hero: {
    x: 0,
    y: 0,
    width: 128,
    height: 32,
    sliceX: 4,
    anims: {
      idle: { from: 0, to: 3, speed: 6, loop: true },
    },
  },
  coin: {
    x: 0,
    y: 32,
    width: 64,
    height: 16,
    sliceX: 4,
    anims: {
      spin: { from: 0, to: 3, speed: 12, loop: true },
    },
  },
});
```

You can also load atlas data from a separate JSON file:

```typescript
k.loadSpriteAtlas('sprites/atlas.png', 'sprites/atlas.json');
```

---

## The `sprite()` Component

Attach a loaded sprite to a game object using the `sprite()` component:

```typescript
const player = k.add([
  k.sprite('hero'),
  k.pos(100, 200),
  k.area(),
  k.body(),
]);
```

### Component Options

Pass a second argument to configure the initial state:

```typescript
const player = k.add([
  k.sprite('hero', {
    frame: 0,         // starting frame index
    anim: 'idle',     // auto-play this animation on creation
    flipX: false,     // mirror horizontally
    flipY: false,     // mirror vertically
    animSpeed: 1,     // global speed multiplier
  }),
  k.pos(100, 200),
]);
```

### Key Properties

| Property    | Type      | Description                                         |
|-------------|-----------|-----------------------------------------------------|
| `frame`     | `number`  | Current frame index (read/write across entire sheet) |
| `animFrame` | `number`  | Current frame relative to the active animation       |
| `animSpeed` | `number`  | Speed multiplier — 2 plays at double speed           |
| `flipX`     | `boolean` | Horizontal mirror                                    |
| `flipY`     | `boolean` | Vertical mirror                                      |
| `width`     | `number`  | Display width of the sprite                          |
| `height`    | `number`  | Display height of the sprite                         |

### Key Methods

| Method                        | Description                                             |
|-------------------------------|---------------------------------------------------------|
| `play(name, opts?)`          | Start a named animation                                  |
| `stop()`                     | Halt the current animation                               |
| `numFrames()`                | Total frames in the spritesheet                          |
| `getCurAnim()`               | Returns current animation metadata (name, timer, etc.)   |
| `hasAnim(name)`              | Check if a named animation exists                        |
| `getAnim(name)`              | Get the animation configuration object                   |

---

## Playing Animations

### Basic Playback

```typescript
// Start an animation by name
player.play('run');

// Stop animation (freezes on current frame)
player.stop();
```

### Playback Options

Override animation defaults per call:

```typescript
player.play('run', {
  speed: 15,        // override FPS for this playback
  loop: false,      // play once even if the anim was defined as looping
  pingpong: true,   // bounce back and forth
});
```

### Checking Animation State

```typescript
const current = player.getCurAnim();
if (current) {
  console.log(current.name);  // 'run'
}

// Guard before switching
if (!player.getCurAnim() || player.getCurAnim()?.name !== 'run') {
  player.play('run');
}
```

---

## Animation Events

React to animation lifecycle with `onAnimStart` and `onAnimEnd`:

```typescript
// Fires when any animation begins
player.onAnimStart((animName) => {
  console.log(`Started: ${animName}`);
});

// Fires when a non-looping animation finishes
player.onAnimEnd((animName) => {
  if (animName === 'attack') {
    player.play('idle');
  }
});
```

Both methods return a `KEventController` — call `.cancel()` to unsubscribe:

```typescript
const controller = player.onAnimEnd((anim) => {
  if (anim === 'death') {
    player.destroy();
    controller.cancel();
  }
});
```

---

## Common Patterns

### Direction-Based Sprite Flipping

Flip the sprite horizontally based on movement direction instead of loading separate left/right sheets:

```typescript
k.onKeyDown('left', () => {
  player.move(-200, 0);
  player.flipX = true;
  if (player.getCurAnim()?.name !== 'run') player.play('run');
});

k.onKeyDown('right', () => {
  player.move(200, 0);
  player.flipX = false;
  if (player.getCurAnim()?.name !== 'run') player.play('run');
});

k.onKeyRelease(['left', 'right'], () => {
  player.play('idle');
});
```

### State-Driven Animation

Use a finite state machine to keep animation logic clean:

```typescript
type PlayerState = 'idle' | 'run' | 'jump' | 'fall';
let state: PlayerState = 'idle';

function setState(newState: PlayerState) {
  if (state === newState) return;
  state = newState;
  player.play(state);
}

k.onUpdate(() => {
  if (!player.isGrounded()) {
    setState(player.vel.y < 0 ? 'jump' : 'fall');
  } else if (k.isKeyDown('left') || k.isKeyDown('right')) {
    setState('run');
  } else {
    setState('idle');
  }
});
```

### One-Shot Attack Animation

Play an attack animation once, then return to the previous state:

```typescript
function attack() {
  const prev = player.getCurAnim()?.name ?? 'idle';
  player.play('attack', { loop: false });
  player.onAnimEnd((anim) => {
    if (anim === 'attack') {
      player.play(prev);
    }
  });
}

k.onKeyPress('space', () => {
  attack();
});
```

---

## Browser and Mobile Notes

- **Format support:** PNG is the safest bet for spritesheets. WebP offers smaller files but check target browser support.
- **Atlas packing:** Use tools like TexturePacker or free-tex-packer to build optimized atlases, reducing HTTP requests and GPU texture swaps.
- **Mobile performance:** Keep spritesheets as power-of-two sizes (e.g., 512×512, 1024×1024) for optimal GPU memory usage. Avoid individual image loads per frame — always use sheets or atlases.
- **High-DPI displays:** Kaplay scales the canvas to fit. If sprites look blurry on retina screens, provide 2× resolution assets and adjust the game object's `scale` component accordingly.

---

## Cross-Framework Comparison

| Concept             | Kaplay                     | Phaser                          | Excalibur                    |
|---------------------|----------------------------|---------------------------------|------------------------------|
| Load spritesheet    | `loadSprite()` + sliceX/Y  | `this.load.spritesheet()`       | `SpriteSheet.fromImageSource()` |
| Sprite component    | `sprite()` component       | `this.add.sprite()`             | `actor.graphics.use()`       |
| Define animation    | `anims` in loadSprite opts | `this.anims.create()`           | `Animation.fromSpriteSheet()` |
| Play animation      | `obj.play('name')`         | `sprite.play('name')`           | `actor.graphics.use(anim)`   |
| Animation events    | `onAnimStart/onAnimEnd`    | `on('animationcomplete')`       | `animation.events.on()`      |
| Flip sprite         | `flipX` / `flipY` props   | `setFlipX()` / `setFlipY()`    | `actor.graphics.flipHorizontal` |
