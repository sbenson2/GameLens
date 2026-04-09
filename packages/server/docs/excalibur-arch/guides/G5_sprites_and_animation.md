# Sprites and Animation

> **Category:** guide · **Engine:** Excalibur · **Related:** [Actors and Entities](G1_actors_and_entities.md), [Architecture Overview](../architecture/E1_architecture_overview.md)

Excalibur's graphics pipeline is built around `ImageSource` (loading), `Sprite` (a view into an image), `SpriteSheet` (a grid of sprites), and `Animation` (a sequence of frames). All graphics must be loaded before use — Excalibur's resource loader handles this asynchronously.

## Loading Images

All images start as an `ImageSource`. Add them to a `Loader` and await loading before the game starts:

```typescript
import { ImageSource, Loader } from 'excalibur';

const heroSheet = new ImageSource('./assets/hero-spritesheet.png');
const backgroundImg = new ImageSource('./assets/background.png');

const loader = new Loader([heroSheet, backgroundImg]);

const game = new ex.Engine({ width: 800, height: 600 });
await game.start(loader);
```

## Sprites

A `Sprite` is a rectangular view into an `ImageSource`. For a single-image sprite, use the convenience method:

```typescript
// Entire image as a sprite
const bgSprite = backgroundImg.toSprite();

// Sprite from a sub-region of the image
const headSprite = new ex.Sprite({
  image: heroSheet,
  sourceView: {
    x: 0,
    y: 0,
    width: 32,
    height: 32
  }
});

// Scale the output size independently of the source
const largeHead = new ex.Sprite({
  image: heroSheet,
  sourceView: { x: 0, y: 0, width: 32, height: 32 },
  destSize: { width: 64, height: 64 }
});
```

### Assigning Sprites to Actors

Actors display graphics through their `graphics` component:

```typescript
const player = new ex.Actor({
  pos: ex.vec(100, 100),
  width: 32,
  height: 32
});

player.graphics.use(headSprite);
scene.add(player);
```

## Sprite Sheets

A `SpriteSheet` slices a single image into an ordered collection of sprites. Use `fromImageSource` for uniform grids:

```typescript
const spriteSheet = ex.SpriteSheet.fromImageSource({
  image: heroSheet,
  grid: {
    rows: 4,
    columns: 8,
    spriteWidth: 32,
    spriteHeight: 32
  }
});
```

### Grids with Spacing

Many sprite sheets have padding or margins between frames. Specify `spacing` to handle this:

```typescript
const paddedSheet = ex.SpriteSheet.fromImageSource({
  image: heroSheet,
  grid: {
    rows: 4,
    columns: 14,
    spriteWidth: 42,
    spriteHeight: 60
  },
  spacing: {
    originOffset: { x: 11, y: 2 },  // top-left starting pixel
    margin: { x: 23, y: 5 }         // gap between sprites
  }
});
```

### Sparse / Non-Uniform Sprite Sheets

For sprite sheets where frames have different sizes or irregular layout, define each frame's source rectangle explicitly:

```typescript
const irregularSheet = ex.SpriteSheet.fromImageSourceWithSourceViews({
  image: heroSheet,
  sourceViews: [
    { x: 0, y: 0, width: 32, height: 48 },    // idle frame
    { x: 32, y: 0, width: 40, height: 48 },    // wide attack frame
    { x: 72, y: 0, width: 32, height: 48 },    // return frame
    { x: 104, y: 0, width: 64, height: 64 }    // large special frame
  ]
});
```

### Retrieving Individual Sprites

```typescript
// By grid coordinates (column, row) — 0-indexed
const walkFrame = spriteSheet.getSprite(2, 1);

// Standalone copy (independent of the sheet's shared image)
const uiIcon = spriteSheet.getSpriteAsStandalone(0, 3);
```

## Animations

An `Animation` is a timed sequence of sprites. The easiest way to create one is from a `SpriteSheet`:

### From a Sprite Sheet (Index-Based)

Frame indices follow **row-major order** — left to right, top to bottom. Index 0 is top-left:

```typescript
// Walk animation: frames 0, 1, 2, 3 at 100ms per frame, looping
const walkAnim = ex.Animation.fromSpriteSheet(
  spriteSheet,
  [0, 1, 2, 3],       // frame indices (row-major)
  100,                 // duration per frame in ms
  ex.AnimationStrategy.Loop
);
```

### From a Sprite Sheet (Coordinate-Based)

When frames are scattered or in columns, specify (x, y) positions instead of flat indices:

```typescript
const attackAnim = ex.Animation.fromSpriteSheetCoordinates(
  spriteSheet,
  [
    { x: 0, y: 2, duration: 80 },   // column 0, row 2
    { x: 1, y: 2, duration: 80 },
    { x: 2, y: 2, duration: 120 },  // hold the impact frame longer
    { x: 3, y: 2, duration: 80 }
  ],
  ex.AnimationStrategy.Freeze       // stop on last frame
);
```

### Manual Frame Construction

For full control, build frames by hand:

```typescript
const customAnim = new ex.Animation({
  frames: [
    { graphic: spriteSheet.getSprite(0, 0)!, duration: 200 },
    { graphic: spriteSheet.getSprite(1, 0)!, duration: 100 },
    { graphic: spriteSheet.getSprite(2, 0)!, duration: 150 },
    { graphic: spriteSheet.getSprite(3, 0)!, duration: 100 }
  ],
  strategy: ex.AnimationStrategy.PingPong
});
```

## Animation Strategies

Excalibur provides four playback strategies:

| Strategy | Behavior |
|---|---|
| `Loop` | Plays through all frames, then restarts from frame 0. Default. |
| `Freeze` | Plays once and stops on the last frame. Good for death animations. |
| `End` | Plays once and then displays nothing (graphic becomes invisible). |
| `PingPong` | Plays forward to the last frame, then backwards to the first, repeating. Smooth for idle/breathing animations. |

```typescript
// One-shot explosion that disappears after playing
const explosionAnim = ex.Animation.fromSpriteSheet(
  explosionSheet,
  [0, 1, 2, 3, 4, 5, 6, 7],
  50,
  ex.AnimationStrategy.End
);
```

## Using Animations on Actors

Assign animations through the actor's graphics component. Use `graphics.add()` to register named animations and switch between them:

```typescript
class Hero extends ex.Actor {
  private walkAnim!: ex.Animation;
  private idleAnim!: ex.Animation;
  private attackAnim!: ex.Animation;

  onInitialize(): void {
    const sheet = ex.SpriteSheet.fromImageSource({
      image: heroSheet,
      grid: { rows: 4, columns: 8, spriteWidth: 32, spriteHeight: 32 }
    });

    this.idleAnim = ex.Animation.fromSpriteSheet(
      sheet, [0, 1, 2, 3], 200, ex.AnimationStrategy.Loop
    );
    this.walkAnim = ex.Animation.fromSpriteSheet(
      sheet, [8, 9, 10, 11, 12, 13], 100, ex.AnimationStrategy.Loop
    );
    this.attackAnim = ex.Animation.fromSpriteSheet(
      sheet, [16, 17, 18, 19], 80, ex.AnimationStrategy.Freeze
    );

    // Register with names
    this.graphics.add('idle', this.idleAnim);
    this.graphics.add('walk', this.walkAnim);
    this.graphics.add('attack', this.attackAnim);

    // Start with idle
    this.graphics.use('idle');
  }

  onPreUpdate(engine: ex.Engine): void {
    if (engine.input.keyboard.isHeld(ex.Keys.Right)) {
      this.graphics.use('walk');
      this.vel.x = 150;
    } else {
      this.graphics.use('idle');
      this.vel.x = 0;
    }
  }
}
```

## Animation Events

Animations emit events you can listen to for game logic:

```typescript
// Fires every time the animation loops back to frame 0
walkAnim.events.on('loop', () => {
  playFootstepSound();
});

// Fires on each frame change
attackAnim.events.on('frame', (event) => {
  // event contains the new frame index
  if (event.frameIndex === 2) {
    // Frame 2 is the impact frame — check for hits
    checkAttackHitbox();
  }
});

// Fires when a non-looping animation finishes
attackAnim.events.on('end', () => {
  player.graphics.use('idle');
});
```

## Flipping and Tinting

```typescript
// Flip sprites horizontally (e.g., facing left vs right)
player.graphics.flipHorizontal = true;

// Flip vertically
player.graphics.flipVertical = true;

// Apply a color tint to a sprite
const hitSprite = spriteSheet.getSprite(0, 0)!;
hitSprite.tint = ex.Color.Red;  // flash red on damage
```

## Aseprite Integration

Excalibur has an official plugin for [Aseprite](https://www.aseprite.org/) sprite sheets. It reads `.aseprite` files or exported JSON and automatically creates animations with correct frame durations and tags:

```typescript
import { AsepriteResource } from '@excaliburjs/plugin-aseprite';

const heroAseprite = new AsepriteResource('./assets/hero.aseprite');
const loader = new Loader([heroAseprite]);

await game.start(loader);

// Get a named animation from an Aseprite tag
const walkAnim = heroAseprite.getAnimation('walk');
const idleAnim = heroAseprite.getAnimation('idle');

player.graphics.add('walk', walkAnim);
player.graphics.add('idle', idleAnim);
```

This is the recommended workflow for artists using Aseprite — frame timings, tags, and layers are preserved automatically.

## Best Practices

1. **Use `SpriteSheet.fromImageSource` for uniform grids** — it's faster and less error-prone than manually defining source views.
2. **Name your animations** with `graphics.add('name', anim)` and switch with `graphics.use('name')` for clean state management.
3. **Match frame durations to gameplay** — hold impact or anticipation frames longer to improve game feel.
4. **Use `PingPong` for ambient motion** — idle breathing, water bobbing, etc. look smoother without a visible loop restart.
5. **Listen for `end` events** on one-shot animations to transition back to idle or trigger cleanup.
6. **Prefer Aseprite plugin** when your artist uses Aseprite — it eliminates manual frame index bookkeeping.
7. **Keep sprite sheets as power-of-two textures** (256×256, 512×512, etc.) for GPU efficiency, though Excalibur handles non-POT textures fine.
