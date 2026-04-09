# G13 — Phaser 3 Tweens, Chains & Timelines

> **Category:** guide · **Engine:** Phaser · **Related:** [G4 Sprites & Animation](G4_sprites_and_animation.md) · [G10 Camera Systems](G10_camera_systems.md) · [G7 UI & HUD](G7_ui_and_hud.md)

---

## Overview

Tweens smoothly interpolate object properties over time — position, scale, rotation, alpha, tint, or any numeric value. Phaser 3's tween system (extensively reworked in v3.60+) provides single tweens, **TweenChains** (sequenced tweens replacing the deprecated `Timeline` class), stagger helpers for group animations, and a rich library of easing functions.

This guide covers the full tween API, chaining, staggering, custom easing, common game patterns (screen shake, floating pickups, UI entrances), and performance best practices.

> **Version note:** `TweenChain` replaced `Phaser.Tweens.Timeline` in Phaser 3.60. If you're on an older version, use `this.tweens.timeline()` instead of `this.tweens.chain()`. The current stable release is **v3.90.0 "Tsugumi"**.

---

## Basic Tweens

Create a tween with `this.tweens.add()`. The tween targets one or more game objects and interpolates the specified properties.

```typescript
class GameScene extends Phaser.Scene {
  create(): void {
    const gem = this.add.sprite(400, 300, 'gem');

    // Float the gem up and down forever
    this.tweens.add({
      targets: gem,
      y: gem.y - 20,       // Destination value
      duration: 800,        // Milliseconds
      ease: 'Sine.easeInOut',
      yoyo: true,           // Return to starting value
      repeat: -1,           // -1 = infinite
    });
  }
}
```

### Key Config Properties

| Property | Type | Description |
|----------|------|-------------|
| `targets` | object or array | Game object(s) to tween |
| `duration` | number | Time in ms (default: 1000) |
| `delay` | number | Wait before starting (ms) |
| `ease` | string or function | Easing curve (default: `'Power0'` / linear) |
| `yoyo` | boolean | Play in reverse after completing |
| `repeat` | number | Times to repeat (-1 = infinite) |
| `repeatDelay` | number | Delay between repeats (ms) |
| `hold` | number | Hold at end value before yoyo (ms) |
| `flipX` / `flipY` | boolean | Flip sprite on each yoyo/repeat |
| `persist` | boolean | Keep tween alive after completion (default: false) |

### Tweening Multiple Properties

Specify multiple properties in the same config. Each can have its own duration, ease, and delay:

```typescript
this.tweens.add({
  targets: enemy,
  x: 600,
  y: { value: 200, duration: 1500, ease: 'Bounce.easeOut' },
  alpha: { value: 0.5, duration: 500, delay: 1000 },
  scale: 1.5,
  duration: 1000,  // Default duration for properties without their own
  ease: 'Power2',
});
```

### Tweening From a Value

By default, tweens animate **to** a value. Use `from` for the opposite:

```typescript
// Fade in: start at alpha 0, animate to current alpha (1)
this.tweens.add({
  targets: sprite,
  alpha: { from: 0, to: 1 },
  duration: 500,
});
```

---

## Easing Functions

Phaser ships ~30 easing functions. The most commonly used:

| Ease | Character | Good for |
|------|-----------|----------|
| `'Linear'` | Constant speed | Progress bars, timers |
| `'Power2'` / `'Quad.easeOut'` | Gentle deceleration | UI slides, movement |
| `'Power3'` / `'Cubic.easeOut'` | Stronger deceleration | Camera pans |
| `'Back.easeOut'` | Overshoots then settles | Bouncy UI pop-ins |
| `'Bounce.easeOut'` | Bounces at destination | Items landing |
| `'Elastic.easeOut'` | Spring-like wobble | Notifications, badges |
| `'Sine.easeInOut'` | Smooth symmetric curve | Hovering, breathing |
| `'Stepped'` | Discrete jumps | Retro/pixel movement |

You can also provide a custom easing function:

```typescript
this.tweens.add({
  targets: sprite,
  y: 100,
  duration: 1000,
  // Custom ease: receives progress (0–1), returns modified value (0–1)
  ease: (t: number): number => {
    // Example: "ease in" with a snap at the end
    return t < 0.9 ? t * t : 1;
  },
});
```

---

## Tween Events & Callbacks

Tweens fire callbacks at key lifecycle points:

```typescript
this.tweens.add({
  targets: player,
  x: 600,
  duration: 1000,

  onStart: (tween, targets) => {
    // Fires when the tween begins (after any delay)
    console.log('Tween started');
  },

  onUpdate: (tween, target, key, current, previous, targets) => {
    // Fires on every frame while the tween is active
    // 'key' is the property name, 'current' is the new value
  },

  onYoyo: (tween, target) => {
    // Fires when yoyo begins (reversal point)
  },

  onRepeat: (tween, target) => {
    // Fires each time the tween repeats
  },

  onComplete: (tween, targets) => {
    // Fires when the tween finishes all repeats
    targets[0].destroy();
  },
});
```

### Promise-Based Completion

Tweens return a reference you can await via the `completeDelay` or by listening for the complete event on the tween itself:

```typescript
async function animateSequence(scene: Phaser.Scene, sprite: Phaser.GameObjects.Sprite): Promise<void> {
  // Create a tween and wait for it to complete
  await new Promise<void>((resolve) => {
    scene.tweens.add({
      targets: sprite,
      x: 400,
      duration: 500,
      onComplete: () => resolve(),
    });
  });

  // This runs after the tween completes
  sprite.setTint(0x00ff00);
}
```

---

## TweenChains (Sequenced Animations)

A `TweenChain` plays multiple tweens in order. When one completes, the next starts. This replaced the deprecated `Timeline` class in Phaser 3.60+.

```typescript
class CutsceneScene extends Phaser.Scene {
  create(): void {
    const hero = this.add.sprite(100, 300, 'hero');
    const villain = this.add.sprite(700, 300, 'villain');

    // Chain: hero walks right → villain shakes → both fade out
    this.tweens.chain({
      tweens: [
        {
          targets: hero,
          x: 500,
          duration: 1500,
          ease: 'Power2',
        },
        {
          targets: villain,
          x: { from: 695, to: 705 },  // Shake effect
          duration: 50,
          yoyo: true,
          repeat: 5,
        },
        {
          targets: [hero, villain],
          alpha: 0,
          duration: 800,
        },
      ],
      onComplete: () => {
        // Entire chain finished — transition to next scene
        this.scene.start('GameOverScene');
      },
    });
  }
}
```

### Chain Config Options

| Property | Description |
|----------|-------------|
| `tweens` | Array of tween configs, played in order |
| `loop` | Number of times to replay the full chain (-1 = infinite) |
| `loopDelay` | Delay between loops (ms) |
| `onComplete` | Callback when the entire chain finishes |
| `onLoop` | Callback when the chain loops |
| `persist` | Keep the chain alive after completion |

### Overlapping Tweens in a Chain

Use negative `delay` on a tween config to make it start before the previous tween finishes:

```typescript
this.tweens.chain({
  tweens: [
    { targets: spriteA, x: 400, duration: 1000 },
    {
      targets: spriteB,
      x: 400,
      duration: 1000,
      delay: -500,  // Start 500ms before the previous tween ends
    },
  ],
});
```

---

## Stagger (Group Animations)

The `stagger` helper offsets the start time of tweens across multiple targets — perfect for menu items, grid reveals, and wave effects.

```typescript
class MenuScene extends Phaser.Scene {
  create(): void {
    const buttons: Phaser.GameObjects.Text[] = [];

    const labels = ['New Game', 'Continue', 'Options', 'Quit'];
    labels.forEach((label, i) => {
      const btn = this.add.text(400, 200 + i * 60, label, {
        fontSize: '28px',
        color: '#ffffff',
      }).setOrigin(0.5).setAlpha(0);
      buttons.push(btn);
    });

    // Stagger: each button fades in 150ms after the previous one
    this.tweens.add({
      targets: buttons,
      alpha: 1,
      y: '-=20',           // Relative: move up 20px from starting position
      duration: 400,
      ease: 'Back.easeOut',
      delay: this.tweens.stagger(150),  // 0ms, 150ms, 300ms, 450ms
    });
  }
}
```

### Stagger Variants

```typescript
// Linear stagger: fixed delay between each target
this.tweens.stagger(100);                    // 0, 100, 200, 300 ...

// Range stagger: spread delays evenly between start and end values
this.tweens.stagger([0, 1000]);              // e.g. 4 targets → 0, 333, 666, 1000

// Stagger from center outward
this.tweens.stagger(100, { from: 'center' });

// Stagger from last to first
this.tweens.stagger(100, { from: 'last' });

// Stagger from a specific index
this.tweens.stagger(100, { from: 2 });

// Grid stagger: for 2D grid layouts (requires grid config)
this.tweens.stagger(100, {
  grid: { width: 8, height: 6 },
  from: 'center',
});
```

---

## Common Game Patterns

### Screen Shake

```typescript
function shakeCamera(scene: Phaser.Scene, intensity: number = 5, duration: number = 200): void {
  // Camera has a built-in shake — prefer this over a tween:
  scene.cameras.main.shake(duration, intensity / 1000);
}

// If you need more control, tween the camera's scroll offset:
function customShake(scene: Phaser.Scene): void {
  const cam = scene.cameras.main;
  const originX = cam.scrollX;
  const originY = cam.scrollY;

  scene.tweens.add({
    targets: cam,
    scrollX: { from: originX - 4, to: originX + 4 },
    scrollY: { from: originY - 2, to: originY + 2 },
    duration: 40,
    yoyo: true,
    repeat: 4,
    ease: 'Sine.easeInOut',
    onComplete: () => {
      cam.scrollX = originX;
      cam.scrollY = originY;
    },
  });
}
```

### Damage Flash

```typescript
function flashDamage(
  scene: Phaser.Scene,
  target: Phaser.GameObjects.Sprite,
): void {
  // Flash white by tinting, then restore
  target.setTintFill(0xffffff);

  scene.tweens.add({
    targets: target,
    alpha: { from: 0.6, to: 1 },
    duration: 80,
    yoyo: true,
    repeat: 2,
    onComplete: () => {
      target.clearTint();
      target.setAlpha(1);
    },
  });
}
```

### Floating Pickup / Coin

```typescript
function createFloatingPickup(
  scene: Phaser.Scene,
  x: number,
  y: number,
  texture: string,
): Phaser.GameObjects.Sprite {
  const pickup = scene.add.sprite(x, y, texture);

  // Gentle float + subtle scale pulse
  scene.tweens.add({
    targets: pickup,
    y: y - 8,
    duration: 1200,
    ease: 'Sine.easeInOut',
    yoyo: true,
    repeat: -1,
  });

  scene.tweens.add({
    targets: pickup,
    scaleX: 1.05,
    scaleY: 0.95,
    duration: 800,
    ease: 'Sine.easeInOut',
    yoyo: true,
    repeat: -1,
  });

  return pickup;
}
```

### Score Pop-Up Text

```typescript
function showScorePopup(
  scene: Phaser.Scene,
  x: number,
  y: number,
  value: number,
): void {
  const text = scene.add.text(x, y, `+${value}`, {
    fontSize: '24px',
    color: '#ffdd00',
    fontStyle: 'bold',
  }).setOrigin(0.5);

  scene.tweens.add({
    targets: text,
    y: y - 60,
    alpha: 0,
    scale: 1.5,
    duration: 800,
    ease: 'Power2',
    onComplete: () => text.destroy(),
  });
}
```

---

## Controlling Tweens

```typescript
const tween = this.tweens.add({
  targets: sprite,
  x: 600,
  duration: 2000,
  paused: true,   // Start paused — useful for trigger-based animations
});

// Manual control
tween.play();           // Start or resume
tween.pause();          // Freeze at current position
tween.resume();         // Continue from paused state
tween.stop();           // Stop and jump to end value
tween.remove();         // Remove from the tween manager entirely
tween.restart();        // Play from the beginning
tween.seek(0.5);        // Jump to 50% progress (0–1)

// Change speed during playback
tween.timeScale = 2;    // Double speed
tween.timeScale = 0.5;  // Half speed
```

### Killing All Tweens on a Target

When a game object is about to be destroyed or reused, kill its active tweens to prevent errors:

```typescript
// Remove all tweens targeting this sprite
this.tweens.killTweensOf(sprite);

// Then safely destroy the sprite
sprite.destroy();
```

---

## Performance Tips

1. **Avoid creating tweens every frame.** Create tweens in response to events (collision, button press), not in `update()`.

2. **Set `persist: false` (the default).** Completed tweens are automatically cleaned up. Only set `persist: true` if you plan to restart the tween later.

3. **Use `killTweensOf()` on destroy.** Orphaned tweens targeting destroyed objects cause silent errors and waste CPU.

4. **Prefer built-in camera effects** (`shake`, `fade`, `flash`, `pan`, `zoom`) over manually tweening camera properties — they handle edge cases and cleanup automatically.

5. **Keep tween counts reasonable.** Hundreds of simultaneous tweens can impact frame rate on mobile. For large groups, consider a single `update()` loop instead.

6. **Use `timeScale` for slow-motion.** Set `this.tweens.timeScale` for scene-wide slow-mo, or individual `tween.timeScale` for per-tween speed changes.

---

## Migration: Timeline → TweenChain

If upgrading from Phaser <3.60, replace `timeline()` calls with `chain()`:

```typescript
// OLD (deprecated — pre-3.60)
this.tweens.timeline({
  tweens: [
    { targets: a, x: 100, duration: 500, offset: 0 },
    { targets: b, x: 200, duration: 500, offset: 500 },
  ],
});

// NEW (3.60+)
this.tweens.chain({
  tweens: [
    { targets: a, x: 100, duration: 500 },
    { targets: b, x: 200, duration: 500 },
  ],
});
```

Key differences: `chain()` uses sequential ordering by default (no `offset` needed), supports negative `delay` for overlaps, and returns a `TweenChain` object with the same control methods as a `Tween`.
