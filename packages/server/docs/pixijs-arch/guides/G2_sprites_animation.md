# G2 — PixiJS v8 Sprites & Animation

> **Category:** guide · **Engine:** PixiJS · **Related:** [E1 Architecture Overview](../architecture/E1_architecture_overview.md) · [G1 Asset Loading](G1_asset_loading.md)

---

## Overview

PixiJS is a rendering engine, not a game engine — it gives you fast, flexible sprite rendering without prescribing how your game should work. Sprites and AnimatedSprites are the visual building blocks of any PixiJS game. Understanding how to create, position, transform, and animate them is foundational to everything else.

This guide covers Sprites, Containers, AnimatedSprites, spritesheet workflows, tinting, blending, and practical patterns for game rendering.

---

## Sprites: The Basic Visual Unit

A `Sprite` displays a single `Texture` on screen. It's the workhorse of 2D rendering.

### Creating a Sprite

```typescript
import { Application, Assets, Sprite } from 'pixi.js';

const app = new Application();
await app.init({ background: '#1a1a2e', resizeTo: window });
document.body.appendChild(app.canvas);

// Load texture first (see G1 Asset Loading)
await Assets.load('assets/hero.png');

// Create from alias
const hero = Sprite.from('assets/hero.png');
hero.x = 400;
hero.y = 300;
app.stage.addChild(hero);
```

### Anchor Point

The anchor determines the sprite's origin for positioning and rotation. Default is `(0, 0)` (top-left corner).

```typescript
// Center origin — most common for game objects
hero.anchor.set(0.5);

// Bottom-center — good for platformer characters (feet at position)
hero.anchor.set(0.5, 1);

// Top-left (default) — good for UI elements and tiles
hero.anchor.set(0, 0);
```

**Why this matters:** When you set `hero.x = 400`, the anchor point is what sits at `(400, y)`. A centered anchor means the sprite's center is at that position. A bottom-center anchor means the sprite's feet are at that position — which is what you want for a character standing on a platform.

### Transform Properties

```typescript
// Position
hero.x = 400;
hero.y = 300;
hero.position.set(400, 300);  // shorthand

// Scale
hero.scale.set(2);           // 2x in both axes
hero.scale.x = -1;           // flip horizontally (mirror)
hero.scale.set(0.5, 1.5);   // different x/y scale

// Rotation (radians)
hero.rotation = Math.PI / 4;  // 45 degrees

// Alpha (transparency)
hero.alpha = 0.5;  // 50% transparent

// Visibility
hero.visible = false;  // hidden but still in scene graph

// Tint (multiply color)
hero.tint = 0xff0000;  // red tint (damage flash)
hero.tint = 0xffffff;  // no tint (original colors)

// Blend mode
hero.blendMode = 'add';  // additive blending (glowing effects)
```

### Z-Order (Draw Order)

PixiJS draws children in the order they were added. Later children render on top.

```typescript
// Manual ordering via addChild sequence
app.stage.addChild(background);  // drawn first (bottom)
app.stage.addChild(enemies);     // middle
app.stage.addChild(player);      // drawn last (top)

// Reorder at runtime
app.stage.setChildIndex(player, 0);  // send to back

// Sort by a property (e.g., y-position for top-down games)
app.stage.sortChildren();
// Requires setting `zIndex` on each child:
player.zIndex = player.y;
enemy.zIndex = enemy.y;

// Enable zIndex sorting on the container
app.stage.sortableChildren = true;
```

---

## Containers: Grouping Sprites

A `Container` groups display objects together. Moving, scaling, or rotating the container affects all its children. Containers are how you build scene graphs, entity hierarchies, and layers.

```typescript
import { Container, Sprite } from 'pixi.js';

// A game entity composed of multiple sprites
const playerGroup = new Container();
playerGroup.x = 400;
playerGroup.y = 300;

const body = Sprite.from('hero-body');
body.anchor.set(0.5);
playerGroup.addChild(body);

const weapon = Sprite.from('sword');
weapon.anchor.set(0, 0.5);
weapon.x = 16;  // offset relative to the container
playerGroup.addChild(weapon);

app.stage.addChild(playerGroup);

// Moving the group moves both sprites together
playerGroup.x += 10;
```

### Layer Pattern

Use containers as rendering layers:

```typescript
const backgroundLayer = new Container();
const gameLayer = new Container();
const uiLayer = new Container();

app.stage.addChild(backgroundLayer);
app.stage.addChild(gameLayer);
app.stage.addChild(uiLayer);

// Background sprites go to the background layer
backgroundLayer.addChild(sky);
backgroundLayer.addChild(mountains);

// Game objects go to the game layer
gameLayer.addChild(player);
gameLayer.addChild(enemies);

// UI always renders on top
uiLayer.addChild(scoreText);
uiLayer.addChild(healthBar);

// Scroll the game world without moving UI
gameLayer.x = -cameraX;
gameLayer.y = -cameraY;
// uiLayer stays fixed
```

---

## AnimatedSprite: Frame-by-Frame Animation

`AnimatedSprite` displays a sequence of textures in order, creating frame-based animation.

### From a Spritesheet Atlas

The most common and efficient approach — load a spritesheet JSON and extract animation frames:

```typescript
import { Assets, AnimatedSprite, Spritesheet } from 'pixi.js';

// Load the spritesheet atlas (JSON + PNG pair)
await Assets.load('assets/hero-atlas.json');

// The spritesheet auto-registers individual frame textures.
// Access animation frame arrays by naming convention in the atlas.
// If your atlas has frames named "hero-run-01", "hero-run-02", etc:
const runFrames = [];
for (let i = 1; i <= 6; i++) {
  const frameName = `hero-run-${String(i).padStart(2, '0')}`;
  runFrames.push(Texture.from(frameName));
}

const hero = new AnimatedSprite(runFrames);
hero.anchor.set(0.5);
hero.animationSpeed = 0.15;  // frames per tick (0.15 ≈ 9fps at 60fps game)
hero.play();
app.stage.addChild(hero);
```

### From a Spritesheet with Named Animations

If your spritesheet JSON defines animations (e.g., exported from Aseprite or TexturePacker with animation tags):

```typescript
import { Assets, AnimatedSprite, Spritesheet } from 'pixi.js';

// Load the atlas
const sheet = await Assets.load<Spritesheet>('assets/hero-atlas.json');

// Access named animations from the spritesheet
// The `animations` property is a Record<string, Texture[]>
const idleTextures = sheet.animations['hero-idle'];  // array of Texture
const runTextures = sheet.animations['hero-run'];
const jumpTextures = sheet.animations['hero-jump'];

// Create an AnimatedSprite with the idle animation
const hero = new AnimatedSprite(idleTextures);
hero.anchor.set(0.5);
hero.animationSpeed = 0.12;
hero.play();
app.stage.addChild(hero);

// Switch animation at runtime
function setAnimation(textures: Texture[]): void {
  if (hero.textures === textures) return;  // avoid restart if same
  hero.textures = textures;
  hero.play();
}
```

### AnimatedSprite Properties and Methods

```typescript
const anim = new AnimatedSprite(frames);

// Playback control
anim.play();                  // start from current frame
anim.stop();                  // pause on current frame
anim.gotoAndPlay(3);          // jump to frame 3 and play
anim.gotoAndStop(0);          // jump to frame 0 and stop

// Speed and looping
anim.animationSpeed = 0.2;   // frames advanced per app tick (higher = faster)
anim.loop = true;             // default: true
anim.loop = false;            // play once and stop on last frame

// Current state
anim.currentFrame;            // current frame index (read-only)
anim.totalFrames;             // total number of frames
anim.playing;                 // boolean: is it currently playing?

// Callbacks
anim.onComplete = () => {
  // Fires when loop=false and animation reaches the last frame
  console.log('Attack animation finished');
};

anim.onFrameChange = (currentFrame: number) => {
  // Fires every time the frame changes
  if (currentFrame === 3) {
    // Spawn hitbox on the "impact" frame of an attack
    spawnHitbox();
  }
};

anim.onLoop = () => {
  // Fires each time a looping animation restarts
};
```

### Understanding animationSpeed

`animationSpeed` is the number of frames advanced per application tick (not per second). At 60fps:

| animationSpeed | Effective FPS | Feel |
|---------------|---------------|------|
| 0.05 | ~3 fps | Very slow, dramatic |
| 0.1 | ~6 fps | Slow, deliberate |
| 0.15 | ~9 fps | Standard pixel art |
| 0.2 | ~12 fps | Smooth retro |
| 0.33 | ~20 fps | Smooth modern |
| 0.5 | ~30 fps | Half-speed playback |
| 1.0 | 60 fps | One frame per tick |

---

## Tiling Sprites

For repeating textures (backgrounds, water, ground):

```typescript
import { TilingSprite, Assets } from 'pixi.js';

await Assets.load('assets/grass-tile.png');

const ground = new TilingSprite({
  texture: 'assets/grass-tile.png',
  width: app.screen.width,
  height: 64,
});
ground.y = app.screen.height - 64;
app.stage.addChild(ground);

// Scroll the tiling for a parallax effect
app.ticker.add((ticker) => {
  ground.tilePosition.x -= 2 * ticker.deltaTime;
});
```

### Parallax Scrolling with Multiple Layers

```typescript
const farBg = new TilingSprite({
  texture: 'assets/sky.png',
  width: app.screen.width,
  height: app.screen.height,
});

const midBg = new TilingSprite({
  texture: 'assets/mountains.png',
  width: app.screen.width,
  height: 200,
});
midBg.y = app.screen.height - 264;

const nearBg = new TilingSprite({
  texture: 'assets/trees.png',
  width: app.screen.width,
  height: 128,
});
nearBg.y = app.screen.height - 192;

app.stage.addChild(farBg, midBg, nearBg);

app.ticker.add((ticker) => {
  const dt = ticker.deltaTime;
  farBg.tilePosition.x -= 0.5 * dt;   // slowest
  midBg.tilePosition.x -= 1.5 * dt;   // medium
  nearBg.tilePosition.x -= 3.0 * dt;  // fastest (closest)
});
```

---

## The Ticker: Game Loop Integration

PixiJS does not have a built-in `update()` lifecycle like Phaser or Excalibur. You use the `Ticker` for per-frame logic:

```typescript
// Add a function to run every frame
app.ticker.add((ticker) => {
  const dt = ticker.deltaTime;  // frame time multiplier (1.0 at 60fps)

  // Move the player
  hero.x += velocityX * dt;
  hero.y += velocityY * dt;

  // Update animation state
  if (velocityX > 0) {
    setAnimation(runTextures);
    hero.scale.x = 1;           // face right
  } else if (velocityX < 0) {
    setAnimation(runTextures);
    hero.scale.x = -1;          // face left (flip)
  } else {
    setAnimation(idleTextures);
  }
});
```

### deltaTime vs elapsedMS

```typescript
app.ticker.add((ticker) => {
  // deltaTime: frame time as a ratio of target frame time
  // At 60fps target: 1.0 means a perfect frame, 2.0 means a frame took twice as long
  const dt = ticker.deltaTime;

  // elapsedMS: actual milliseconds since last frame
  const ms = ticker.elapsedMS;

  // Use deltaTime for consistent physics regardless of frame rate
  hero.x += speed * dt;
});
```

---

## Practical Patterns

### State Machine for Character Animation

```typescript
type AnimState = 'idle' | 'run' | 'jump' | 'fall' | 'attack';

class PlayerRenderer {
  private sprite: AnimatedSprite;
  private animations: Record<AnimState, Texture[]>;
  private currentState: AnimState = 'idle';

  constructor(sheet: Spritesheet) {
    this.animations = {
      idle: sheet.animations['hero-idle'],
      run: sheet.animations['hero-run'],
      jump: sheet.animations['hero-jump'],
      fall: sheet.animations['hero-fall'],
      attack: sheet.animations['hero-attack'],
    };

    this.sprite = new AnimatedSprite(this.animations.idle);
    this.sprite.anchor.set(0.5);
    this.sprite.animationSpeed = 0.15;
    this.sprite.play();
  }

  setState(state: AnimState): void {
    if (state === this.currentState) return;
    this.currentState = state;

    this.sprite.textures = this.animations[state];
    this.sprite.animationSpeed = state === 'attack' ? 0.25 : 0.15;
    this.sprite.loop = state !== 'attack';
    this.sprite.play();
  }

  get displayObject(): AnimatedSprite {
    return this.sprite;
  }
}
```

### Damage Flash Effect

```typescript
function flashDamage(sprite: Sprite, duration = 200): void {
  sprite.tint = 0xff0000;  // red tint

  setTimeout(() => {
    sprite.tint = 0xffffff;  // restore original
  }, duration);
}

// Or with a ticker for more control (no setTimeout)
function flashDamageTicker(sprite: Sprite, app: Application): void {
  sprite.tint = 0xff0000;
  let elapsed = 0;

  const flash = (ticker: Ticker) => {
    elapsed += ticker.elapsedMS;
    // Blink: alternate between red and white every 50ms
    sprite.tint = Math.floor(elapsed / 50) % 2 === 0 ? 0xff0000 : 0xffffff;

    if (elapsed > 300) {
      sprite.tint = 0xffffff;
      app.ticker.remove(flash);
    }
  };

  app.ticker.add(flash);
}
```

### Object Pool for Particles/Projectiles

```typescript
class SpritePool {
  private pool: Sprite[] = [];
  private active: Set<Sprite> = new Set();
  private texture: string;
  private parent: Container;

  constructor(texture: string, parent: Container, initialSize = 20) {
    this.texture = texture;
    this.parent = parent;

    for (let i = 0; i < initialSize; i++) {
      this.pool.push(this.createSprite());
    }
  }

  private createSprite(): Sprite {
    const sprite = Sprite.from(this.texture);
    sprite.anchor.set(0.5);
    sprite.visible = false;
    this.parent.addChild(sprite);
    return sprite;
  }

  get(x: number, y: number): Sprite {
    const sprite = this.pool.pop() ?? this.createSprite();
    sprite.x = x;
    sprite.y = y;
    sprite.visible = true;
    sprite.alpha = 1;
    sprite.rotation = 0;
    sprite.scale.set(1);
    this.active.add(sprite);
    return sprite;
  }

  release(sprite: Sprite): void {
    sprite.visible = false;
    this.active.delete(sprite);
    this.pool.push(sprite);
  }

  get activeCount(): number {
    return this.active.size;
  }
}
```

---

## Performance Best Practices

1. **Use texture atlases** — one atlas = one draw call. Individual images = one draw call each. This is the single biggest optimization in PixiJS.
2. **Pool sprites instead of creating/destroying** — GC pressure from frequent `new Sprite()` and `destroy()` causes frame drops.
3. **Use `visible = false` over `removeChild`** — toggling visibility is cheaper than modifying the scene graph.
4. **Set `interactiveChildren = false` on containers** that don't need hit testing — it skips the hit-test traversal.
5. **Minimize tint changes** — changing tint breaks batching. Group same-tinted sprites together.
6. **Use `TilingSprite` for repeating textures** — much cheaper than creating many small sprites in a grid.
7. **Batch static content with `RenderTexture`** — if a background is composed of many static sprites, render them once to a RenderTexture and display that single texture.

---

## Comparison: Sprites and Animation Across Frameworks

| Concept | PixiJS v8 | Phaser 3 | Kaplay | Excalibur |
|---------|-----------|----------|--------|-----------|
| Sprite class | `Sprite` | `Phaser.GameObjects.Sprite` | `add([sprite()])` | `Actor` with `graphics.use()` |
| Animated sprite | `AnimatedSprite` | `sprite.anims.play()` | `obj.play()` | `Animation` + `graphics.use()` |
| Spritesheet | Load JSON atlas → named textures | `this.load.spritesheet()` → `anims.create()` | `loadSpriteAtlas()` | `SpriteSheet.fromImageSource()` |
| Animation speed | `animationSpeed` (frames/tick) | `frameRate` (fps) | Built-in frame timing | Duration per frame (ms) |
| Playback control | `play()`, `stop()`, `gotoAndPlay()` | `anims.play()`, `anims.stop()` | `play()`, `stop()` | `graphics.use(name)` |
| Looping | `loop` boolean | Per-animation `repeat` count | Per-animation config | `AnimationStrategy` enum |
| Containers | `Container` (scene graph) | `Group` / `Container` | None (flat list) | Scene's entity list |
| Tiling | `TilingSprite` | `TileSprite` | None built-in | None built-in |
| Draw order | `addChild` order + `zIndex` | Depth system | `z()` component | `z` property on Actor |

---

## Key Takeaways

1. **Sprites display textures, AnimatedSprites cycle through texture arrays** — this is all PixiJS gives you; game logic is yours to write.
2. **Set anchors intentionally** — `anchor.set(0.5)` for game objects (centered), `anchor.set(0.5, 1)` for platformer characters (feet).
3. **Use Containers for grouping and layering** — they are the scene graph. Separate background, game, and UI layers with containers.
4. **Load spritesheet atlases, not individual images** — atlases batch into single draw calls, which is the biggest performance win.
5. **`animationSpeed` is frames-per-tick, not fps** — at 60fps, `0.15` gives you roughly 9fps animation.
6. **Use the Ticker for per-frame logic** — PixiJS has no `update()` method. `app.ticker.add()` is your game loop.
7. **Pool sprites for frequently created/destroyed objects** — bullets, particles, and effects should come from a pool, not `new Sprite()`.
