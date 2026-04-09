# G4 — Phaser Sprites & Animation

> **Category:** guide · **Engine:** Phaser · **Related:** [E1 Architecture Overview](../architecture/E1_architecture_overview.md) · [G1 Scene Lifecycle](G1_scene_lifecycle.md) · [G2 Physics Systems](G2_physics_systems.md) · [G3 Input Handling](G3_input_handling.md)

---

## Overview

Phaser 3 provides two complementary animation systems. **Frame-based animation** (sprite sheet / atlas) cycles through pre-drawn frames — used for character walk cycles, attack sequences, explosions, and anything requiring hand-drawn or pixel-art animation. **Tween animation** smoothly interpolates object properties (position, scale, rotation, alpha) over time — used for UI transitions, floating pickups, screen shake, and procedural effects.

This guide covers loading sprite sheets and atlases, creating and playing frame animations, controlling playback, animation events, tweens, easing functions, animation chaining, and practical patterns for common game scenarios.

---

## Loading Sprite Sheets

A sprite sheet is a single image containing multiple frames arranged in a grid. Load it in your scene's `preload()` method by specifying frame dimensions:

```typescript
class GameScene extends Phaser.Scene {
  preload(): void {
    // Uniform grid sprite sheet — all frames are the same size
    this.load.spritesheet('player', 'assets/player.png', {
      frameWidth: 32,
      frameHeight: 48,
      // Optional: startFrame, endFrame, margin, spacing
    });

    // Specify spacing/margin if the sheet has gaps between frames
    this.load.spritesheet('explosion', 'assets/explosion.png', {
      frameWidth: 64,
      frameHeight: 64,
      spacing: 2,  // Pixels between frames
      margin: 1,   // Pixels around the edge
    });
  }
}
```

Phaser numbers frames **left-to-right, top-to-bottom, starting at 0**. A 4-column × 3-row sheet has frames 0–11.

---

## Loading Texture Atlases

A texture atlas packs irregularly sized sprites into a single image with a companion JSON (or XML) file mapping names to regions. Atlases are more memory-efficient than sprite sheets because they eliminate wasted transparent space.

```typescript
preload(): void {
  // JSON hash or JSON array atlas
  this.load.atlas(
    'characters',                   // Key
    'assets/characters.png',        // Image
    'assets/characters.json'        // Atlas data
  );

  // Multi-atlas (multiple pages)
  this.load.multiatlas(
    'gameAssets',
    'assets/game-assets.json',
    'assets/'
  );
}
```

Atlas JSON typically contains entries like:

```json
{
  "frames": {
    "hero_idle_0": { "frame": { "x": 0, "y": 0, "w": 32, "h": 48 } },
    "hero_idle_1": { "frame": { "x": 32, "y": 0, "w": 32, "h": 48 } },
    "hero_run_0":  { "frame": { "x": 64, "y": 0, "w": 32, "h": 48 } }
  }
}
```

> **Tip:** Use [TexturePacker](https://www.codeandweb.com/texturepacker) or [Free Texture Packer](https://free-tex-packer.com/) to generate atlas images and JSON from loose sprite files.

---

## Creating Frame Animations

Animations are created on the **global AnimationManager** (`this.anims`), making them available to any sprite in any scene. Create them once — typically in a boot scene or the first scene's `create()` method.

### From a Sprite Sheet

```typescript
create(): void {
  // generateFrameNumbers() picks frames by index from a spritesheet
  this.anims.create({
    key: 'player-idle',
    frames: this.anims.generateFrameNumbers('player', {
      start: 0,
      end: 3,
    }),
    frameRate: 8,
    repeat: -1,  // -1 = loop forever, 0 = play once
  });

  this.anims.create({
    key: 'player-run',
    frames: this.anims.generateFrameNumbers('player', {
      start: 4,
      end: 9,
    }),
    frameRate: 12,
    repeat: -1,
  });

  this.anims.create({
    key: 'player-jump',
    frames: this.anims.generateFrameNumbers('player', {
      frames: [10, 11, 12],  // Specific frame indices
    }),
    frameRate: 10,
    repeat: 0,  // Play once
  });
}
```

### From a Texture Atlas

```typescript
create(): void {
  // generateFrameNames() picks frames by name from an atlas
  this.anims.create({
    key: 'hero-idle',
    frames: this.anims.generateFrameNames('characters', {
      prefix: 'hero_idle_',
      start: 0,
      end: 5,
      zeroPad: 0,  // No zero-padding: hero_idle_0, hero_idle_1, ...
    }),
    frameRate: 8,
    repeat: -1,
  });

  this.anims.create({
    key: 'hero-run',
    frames: this.anims.generateFrameNames('characters', {
      prefix: 'hero_run_',
      start: 0,
      end: 7,
      zeroPad: 4,  // Zero-padded: hero_run_0001, hero_run_0002, ...
      suffix: '',
    }),
    frameRate: 12,
    repeat: -1,
  });
}
```

---

## Playing Animations on Sprites

```typescript
create(): void {
  // Create a sprite and play an animation
  const player = this.add.sprite(400, 300, 'player');
  player.play('player-idle');

  // Or with a physics body
  const physicsPlayer = this.physics.add.sprite(400, 300, 'player');
  physicsPlayer.play('player-idle');

  // Play with config overrides
  player.play({
    key: 'player-run',
    frameRate: 16,       // Override the animation's default rate
    repeat: 3,           // Override repeat count
    delay: 500,          // Delay before starting (ms)
    startFrame: 2,       // Start from frame index 2
  });
}
```

### Controlling Playback

```typescript
// Stop the current animation
player.stop();

// Pause / resume
player.anims.pause();
player.anims.resume();

// Set playback speed (1 = normal, 0.5 = half, 2 = double)
player.anims.timeScale = 0.5;

// Reverse playback direction
player.anims.setRepeat(-1);
player.anims.reverse();
player.anims.play();  // Now plays backward

// Jump to a specific frame
player.anims.setCurrentFrame(
  player.anims.currentAnim!.frames[3]
);

// Check which animation is playing
const currentKey = player.anims.currentAnim?.key;
const isPlaying = player.anims.isPlaying;
```

### Preventing Animation Restart

By default, calling `play()` with the same key restarts the animation. Use `playIfNotPlaying` or check first:

```typescript
// Only start the animation if it's not already playing
player.play('player-run', true);  // 2nd arg = ignoreIfPlaying

// Or use the dedicated method (Phaser 3.50+)
player.playAfterDelay('player-run', 200);
```

---

## Animation Events

Phaser fires events on both the sprite's `AnimationState` and the global `AnimationManager`.

### Per-Sprite Events

```typescript
// Fires when the animation completes (non-looping) or is stopped
player.on(Phaser.Animations.Events.ANIMATION_COMPLETE, (anim: Phaser.Animations.Animation) => {
  if (anim.key === 'player-attack') {
    player.play('player-idle');
  }
});

// Shorthand for a specific animation key
player.on(`${Phaser.Animations.Events.ANIMATION_COMPLETE_KEY}player-jump`, () => {
  // Jump animation finished — transition to fall or idle
  player.play('player-idle');
});

// Fires on each frame change
player.on(Phaser.Animations.Events.ANIMATION_UPDATE, (
  anim: Phaser.Animations.Animation,
  frame: Phaser.Animations.AnimationFrame
) => {
  // Useful for syncing sound effects to specific frames
  if (anim.key === 'player-run' && frame.index === 2) {
    this.sound.play('footstep');
  }
});

// Fires when a looping animation completes one full cycle
player.on(Phaser.Animations.Events.ANIMATION_REPEAT, () => {
  // Track how many loops have played
});
```

### Global Events

```typescript
// Listen for any animation starting on any sprite
this.anims.on(Phaser.Animations.Events.ANIMATION_START, (
  anim: Phaser.Animations.Animation,
  frame: Phaser.Animations.AnimationFrame,
  gameObject: Phaser.GameObjects.Sprite
) => {
  console.log(`${gameObject.name} started playing ${anim.key}`);
});
```

---

## Animation Chaining

Queue the next animation to play automatically when the current one finishes:

```typescript
// Chain a single animation
player.play('player-attack');
player.chain('player-idle');
// After attack finishes → idle starts automatically

// Chain multiple in sequence
player.play('player-charge');
player.chain(['player-attack', 'player-idle']);
// charge → attack → idle

// Chain a looping animation after a one-shot
player.play('player-land');  // plays once
player.chain('player-idle'); // then loops idle
```

> **Note:** `chain()` replaces any previously queued chain. Call it before or during the current animation.

---

## Tweens

Tweens animate any numeric property on any object over time. They are complementary to frame animations — use tweens for motion, scale, rotation, and opacity effects.

### Basic Tween

```typescript
create(): void {
  const coin = this.add.sprite(400, 300, 'coin');
  coin.play('coin-spin');

  // Float the coin up and down
  this.tweens.add({
    targets: coin,
    y: coin.y - 20,        // Animate to this value
    duration: 800,          // Milliseconds
    ease: 'Sine.easeInOut', // Easing function
    yoyo: true,             // Return to start value
    repeat: -1,             // Loop forever
  });
}
```

### Common Tween Properties

```typescript
this.tweens.add({
  targets: sprite,          // Single object or array of objects
  x: 500,                   // Absolute target value
  y: '+=100',               // Relative: current + 100
  alpha: 0,                 // Fade out
  scale: 2,                 // Uniform scale (sets scaleX and scaleY)
  scaleX: 1.5,              // Non-uniform scale
  angle: 360,               // Rotation in degrees
  duration: 1000,           // Time in ms
  delay: 200,               // Delay before starting
  ease: 'Power2',           // Easing (see below)
  yoyo: false,              // Reverse after reaching target
  repeat: 0,                // 0 = once, -1 = forever
  repeatDelay: 100,         // Delay between repeats
  hold: 500,                // Hold at target before yoyo/repeat
  flipX: true,              // Flip horizontally at yoyo
  onStart: () => {},        // Callback when tween starts
  onUpdate: () => {},       // Callback each frame
  onComplete: () => {},     // Callback when tween finishes
  onYoyo: () => {},         // Callback at yoyo point
});
```

### Common Easing Functions

| Ease | Effect |
|------|--------|
| `'Linear'` | Constant speed |
| `'Sine.easeInOut'` | Gentle acceleration/deceleration (floating, breathing) |
| `'Power2'` / `'Quad.easeOut'` | Smooth deceleration (UI slides) |
| `'Power3'` / `'Cubic.easeIn'` | Dramatic acceleration (falls, swoops) |
| `'Back.easeOut'` | Overshoots then settles (bouncy UI) |
| `'Bounce.easeOut'` | Bouncing ball effect |
| `'Elastic.easeOut'` | Spring-like wobble |

### Tween Chains (Timeline)

Create a sequence of tweens that play one after another:

```typescript
const timeline = this.tweens.chain({
  targets: enemy,
  tweens: [
    { x: 600, duration: 500, ease: 'Power2' },
    { y: 200, duration: 300, ease: 'Sine.easeIn' },
    {
      alpha: 0,
      scale: 0.5,
      duration: 400,
      ease: 'Power3',
      onComplete: () => enemy.destroy(),
    },
  ],
});
```

---

## Practical Patterns

### State-Based Animation Controller

Manage animation transitions cleanly based on player state:

```typescript
type PlayerState = 'idle' | 'run' | 'jump' | 'fall' | 'attack';

class Player extends Phaser.Physics.Arcade.Sprite {
  private currentState: PlayerState = 'idle';

  constructor(scene: Phaser.Scene, x: number, y: number) {
    super(scene, x, y, 'player');
    scene.add.existing(this);
    scene.physics.add.existing(this);
    this.play('player-idle');
  }

  setState(newState: PlayerState): void {
    if (newState === this.currentState) return;
    this.currentState = newState;

    switch (newState) {
      case 'idle':
        this.play('player-idle');
        break;
      case 'run':
        this.play('player-run');
        break;
      case 'jump':
        this.play('player-jump');
        this.chain('player-fall'); // auto-transition to fall
        break;
      case 'fall':
        this.play('player-fall');
        break;
      case 'attack':
        this.play('player-attack');
        this.chain('player-idle');
        break;
    }
  }

  update(cursors: Phaser.Types.Input.Keyboard.CursorKeys): void {
    const body = this.body as Phaser.Physics.Arcade.Body;
    const onGround = body.blocked.down;

    if (!onGround && body.velocity.y > 0) {
      this.setState('fall');
    } else if (!onGround && body.velocity.y < 0) {
      this.setState('jump');
    } else if (cursors.left.isDown || cursors.right.isDown) {
      this.setState('run');
      this.setFlipX(cursors.left.isDown);
    } else if (onGround) {
      this.setState('idle');
    }
  }
}
```

### Sprite Flash on Damage

Combine a tween with tint to flash a sprite white when hit:

```typescript
function flashDamage(sprite: Phaser.GameObjects.Sprite, scene: Phaser.Scene): void {
  sprite.setTintFill(0xffffff); // Flash white

  scene.time.delayedCall(80, () => {
    sprite.clearTint();
  });

  // Or use a tween for a pulsing flash effect:
  scene.tweens.add({
    targets: sprite,
    alpha: 0.3,
    duration: 60,
    yoyo: true,
    repeat: 3,
    onComplete: () => {
      sprite.setAlpha(1);
    },
  });
}
```

### Animated Coin Pickup with Tween

Combine frame animation (spinning coin) with a tween (fly toward UI score counter):

```typescript
function collectCoin(
  coin: Phaser.GameObjects.Sprite,
  scene: Phaser.Scene,
  scorePos: { x: number; y: number }
): void {
  // Disable physics so it doesn't interfere
  (coin.body as Phaser.Physics.Arcade.Body).enable = false;

  // Fly toward the score counter while fading
  scene.tweens.add({
    targets: coin,
    x: scorePos.x,
    y: scorePos.y,
    scale: 0.3,
    alpha: 0,
    duration: 600,
    ease: 'Power2',
    onComplete: () => {
      coin.destroy();
      updateScore(10);
    },
  });
}
```

### Explosion with One-Shot Animation

Create, play, and auto-destroy:

```typescript
function spawnExplosion(scene: Phaser.Scene, x: number, y: number): void {
  const explosion = scene.add.sprite(x, y, 'explosion');
  explosion.play('explode'); // Non-looping animation

  explosion.on(Phaser.Animations.Events.ANIMATION_COMPLETE, () => {
    explosion.destroy();
  });
}
```

---

## Framework Comparison

| Concept | Phaser 3 | PixiJS | Kaplay | Excalibur |
|---------|----------|--------|--------|-----------|
| Frame animation | Global AnimationManager + Sprite.play() | AnimatedSprite with array of textures | `sprite()` component with `play()` | `Animation` class on `Actor.graphics` |
| Sprite sheets | `load.spritesheet()` with frameWidth/Height | `Spritesheet.parse()` from BaseTexture | `loadSpriteAtlas()` | `SpriteSheet.fromImageSource()` |
| Atlases | `load.atlas()` with JSON | `Assets.load()` with spritesheet JSON | `loadSpriteAtlas()` | `SpriteSheet` + `ImageSource` |
| Animation events | ANIMATION_COMPLETE, ANIMATION_UPDATE | `onComplete`, `onFrameChange` | `onAnimEnd()` | `animation.events.on('end')` |
| Chaining | `sprite.chain()` | Manual via onComplete | Manual via `onAnimEnd()` | Manual via events |
| Tweens | Built-in TweenManager | No built-in (use gsap or custom) | `tween()` function | `ActionContext` or `Actor.actions` |
| Timelines | `tweens.chain()` | Third-party | Sequential tweens | `ActionSequence` |

---

## Performance Tips

1. **Use texture atlases over individual images.** Fewer texture swaps = fewer draw calls. A single atlas with 100 sprites draws faster than 100 individual textures.
2. **Keep sprite sheets as power-of-two dimensions** (256, 512, 1024, 2048) for best GPU compatibility, though Phaser's WebGL renderer handles non-POT textures.
3. **Limit active tweens.** Each tween has per-frame overhead. For large numbers of similar effects (particle-like), use a Particle Emitter instead.
4. **Avoid creating animations in `update()`.** Create all animations once in `create()` or a boot scene. The AnimationManager deduplicates by key, but the creation call itself is wasted work.
5. **Use `ignoreIfPlaying`** (`sprite.play('key', true)`) to avoid restarting animations needlessly in update loops.
6. **Pool sprites** for frequently spawned/destroyed objects (bullets, particles, pickups) using `Phaser.GameObjects.Group` with `maxSize` and `createCallback`.

---

## Next Steps

- **[G1 Scene Lifecycle](G1_scene_lifecycle.md)** — How scenes load, create, and update
- **[G2 Physics Systems](G2_physics_systems.md)** — Arcade and Matter.js physics
- **[G3 Input Handling](G3_input_handling.md)** — Keyboard, pointer, and gamepad input
- **[E1 Architecture Overview](../architecture/E1_architecture_overview.md)** — Phaser's engine architecture
