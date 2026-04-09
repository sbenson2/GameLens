# R1 — PixiJS v8 API Quick Reference

> **Category:** reference · **Engine:** PixiJS · **Related:** [E1 Architecture Overview](../architecture/E1_architecture_overview.md) · [G1 Asset Loading](../guides/G1_asset_loading.md) · [G2 Sprites & Animation](../guides/G2_sprites_animation.md)

---

## Application Setup

```typescript
import { Application } from 'pixi.js';

const app = new Application();

// WHY async init: v8 requires async initialization for
// WebGPU/WebGL auto-detection and renderer setup.
await app.init({
  width: 800,
  height: 600,
  backgroundColor: 0x1a1a2e,
  resolution: window.devicePixelRatio || 1,
  autoDensity: true,          // CSS size matches logical size
  antialias: true,            // smooth edges (disable for pixel art)
  resizeTo: window,           // auto-resize to window or HTMLElement
  preference: 'webgl',        // 'webgl', 'webgpu', or undefined for auto
});

document.getElementById('game')!.appendChild(app.canvas);

// Game loop
app.ticker.add((ticker) => {
  // ticker.deltaTime — frame delta (1.0 at 60fps)
  // ticker.elapsedMS  — milliseconds since last frame
  player.x += speed * ticker.deltaTime;
});

// Control the ticker
app.ticker.stop();
app.ticker.start();
app.ticker.maxFPS = 60;       // cap framerate
app.ticker.minFPS = 30;       // minimum delta calculation threshold
```

---

## Asset Loading

```typescript
import { Assets, Spritesheet, Texture } from 'pixi.js';

// Single asset
const texture = await Assets.load<Texture>('assets/hero.png');

// Multiple assets
const textures = await Assets.load<Record<string, Texture>>([
  'assets/hero.png',
  'assets/enemy.png',
  'assets/background.png',
]);

// Spritesheet (TexturePacker / Aseprite JSON)
const sheet = await Assets.load<Spritesheet>('assets/sprites.json');
// Access frames: sheet.textures['frame-name.png']

// Asset bundles (group related assets)
Assets.addBundle('level1', {
  background: 'assets/levels/bg1.png',
  tileset: 'assets/levels/tiles1.png',
  music: 'assets/audio/level1.mp3',
});
await Assets.loadBundle('level1');

// Background loading with progress
Assets.addBundle('level2', { /* ... */ });
const progress = Assets.backgroundLoadBundle('level2');
// Check later: await Assets.loadBundle('level2');  // instant if already loaded

// Unload to free memory
await Assets.unload('assets/hero.png');
await Assets.unloadBundle('level1');
```

---

## Display Objects

### Container (parent for grouping)

```typescript
import { Container } from 'pixi.js';

const group = new Container();
app.stage.addChild(group);

group.addChild(sprite1, sprite2);
group.removeChild(sprite1);
group.removeChildren();              // remove all
group.sortableChildren = true;       // enable zIndex sorting
group.sortChildren();                // manual sort trigger

// Container transforms apply to all children
group.position.set(100, 50);
group.scale.set(2);
group.rotation = 0.5;               // radians
group.alpha = 0.8;
group.visible = false;

// Hierarchy
group.parent;                        // parent container
group.children;                      // child array
group.getChildAt(0);
group.getChildByLabel('player');     // find by label
sprite.label = 'player';            // set label for lookup
```

### Sprite

```typescript
import { Sprite, Texture } from 'pixi.js';

const sprite = new Sprite(texture);
// Or from loaded assets:
const sprite = Sprite.from('assets/hero.png');

// Transform
sprite.position.set(100, 200);     // or sprite.x = 100; sprite.y = 200;
sprite.anchor.set(0.5);            // origin point (0-1), default is 0,0 (top-left)
sprite.scale.set(2, 2);
sprite.rotation = Math.PI / 4;     // radians
sprite.angle = 45;                 // degrees (convenience)

// Appearance
sprite.alpha = 0.8;
sprite.tint = 0xff0000;            // color multiply
sprite.blendMode = 'add';          // 'normal', 'add', 'multiply', 'screen'
sprite.visible = false;
sprite.zIndex = 10;                // requires parent.sortableChildren = true

// Dimensions
sprite.width;                      // scaled width
sprite.height;                     // scaled height
sprite.getBounds();                // { x, y, width, height } in world space

// Texture swap
sprite.texture = Texture.from('other-image.png');

// Cleanup
sprite.destroy();                  // remove + free resources
sprite.destroy({ children: true }); // also destroy children
```

### AnimatedSprite

```typescript
import { AnimatedSprite, Spritesheet } from 'pixi.js';

const sheet = await Assets.load<Spritesheet>('assets/sprites.json');

// From spritesheet animation (defined in JSON)
const anim = new AnimatedSprite(sheet.animations['walk']);

// Or from individual textures
const anim = new AnimatedSprite([
  Texture.from('frame1.png'),
  Texture.from('frame2.png'),
  Texture.from('frame3.png'),
]);

anim.animationSpeed = 0.15;       // frames per tick (0.1 = slow, 0.5 = fast)
anim.loop = true;
anim.play();
anim.stop();
anim.gotoAndPlay(3);              // jump to frame index and play
anim.gotoAndStop(0);              // jump to frame and stop

anim.onComplete = () => { };      // fires when non-looping animation ends
anim.onFrameChange = (frame: number) => { };
```

### TilingSprite

```typescript
import { TilingSprite } from 'pixi.js';

// Repeating background
const bg = new TilingSprite({
  texture: Texture.from('grass.png'),
  width: 800,
  height: 600,
});

// Scroll the tiling (parallax effect)
app.ticker.add((ticker) => {
  bg.tilePosition.x -= 1 * ticker.deltaTime;
});

bg.tileScale.set(2);             // scale the tile pattern
```

---

## Graphics (shapes, lines, fills)

```typescript
import { Graphics } from 'pixi.js';

const gfx = new Graphics();

// Filled shapes
gfx.rect(10, 10, 200, 100);              // x, y, width, height
gfx.fill({ color: 0xff0000, alpha: 0.8 });

gfx.circle(400, 300, 50);                // x, y, radius
gfx.fill(0x00ff00);

gfx.roundRect(10, 10, 200, 100, 16);     // with corner radius
gfx.fill(0x0000ff);

gfx.ellipse(400, 300, 80, 50);           // x, y, halfWidth, halfHeight
gfx.fill(0xffff00);

// Stroked shapes
gfx.rect(300, 10, 100, 50);
gfx.stroke({ color: 0xffffff, width: 2 });

// Lines and paths
gfx.moveTo(0, 0);
gfx.lineTo(100, 100);
gfx.lineTo(200, 50);
gfx.stroke({ color: 0xffd700, width: 3 });

// Polygon
gfx.poly([0, 0, 100, 0, 50, 80]);        // flat array of x,y pairs
gfx.fill(0xff00ff);

// Clear everything
gfx.clear();

app.stage.addChild(gfx);
```

---

## Text

```typescript
import { Text, TextStyle, BitmapText } from 'pixi.js';

// Standard text
const style = new TextStyle({
  fontFamily: 'Arial, Helvetica, sans-serif',
  fontSize: 24,
  fontWeight: 'bold',
  fill: 0xffffff,
  stroke: { color: 0x000000, width: 2 },
  dropShadow: {
    color: 0x000000,
    blur: 4,
    distance: 3,
    angle: Math.PI / 4,
  },
  wordWrap: true,
  wordWrapWidth: 400,
  align: 'center',                // 'left', 'center', 'right'
});

const text = new Text({ text: 'Hello World', style });
text.text = 'Updated!';          // change text content
text.resolution = 2;             // override for crisp text on HiDPI

// Bitmap text (pre-rendered, faster updates)
const bmpText = new BitmapText({
  text: 'Score: 0',
  style: { fontFamily: 'GameFont', fontSize: 16 },
});
```

---

## Events / Interaction

```typescript
// Make any display object interactive
sprite.eventMode = 'static';      // 'static', 'dynamic', 'passive', 'none'
sprite.cursor = 'pointer';        // CSS cursor on hover

// Pointer events (work for mouse + touch + pen)
sprite.on('pointerdown', (e) => { });
sprite.on('pointerup', (e) => { });
sprite.on('pointerupoutside', (e) => { });
sprite.on('pointermove', (e) => { });
sprite.on('pointerover', (e) => { });
sprite.on('pointerout', (e) => { });
sprite.on('pointertap', (e) => { });   // quick press + release

// Touch-specific (if you need to distinguish)
sprite.on('touchstart', (e) => { });
sprite.on('touchend', (e) => { });
sprite.on('touchmove', (e) => { });

// Global move (fires even when not over a display object)
app.stage.eventMode = 'static';
app.stage.on('globalpointermove', (e) => {
  console.log(e.global.x, e.global.y);
});

// Event data
sprite.on('pointerdown', (e) => {
  e.global.x;      // position in world space
  e.global.y;
  e.pointerId;     // unique ID for multi-touch
  e.button;        // mouse button (0=left, 1=middle, 2=right)
});

// Hit area override
import { Rectangle, Circle } from 'pixi.js';
sprite.hitArea = new Rectangle(0, 0, 50, 50);
sprite.hitArea = new Circle(25, 25, 25);

// Remove listener
const handler = () => { };
sprite.on('pointerdown', handler);
sprite.off('pointerdown', handler);
```

---

## Filters & Effects

```typescript
import { BlurFilter, ColorMatrixFilter, DisplacementFilter } from 'pixi.js';

// Blur
const blur = new BlurFilter({ strength: 8 });
sprite.filters = [blur];

// Color adjustments
const colorMatrix = new ColorMatrixFilter();
colorMatrix.brightness(1.5, false);
colorMatrix.saturate(0.5, false);
colorMatrix.greyscale(0.5, false);
colorMatrix.hue(90, false);
sprite.filters = [colorMatrix];

// Stack multiple filters
sprite.filters = [blur, colorMatrix];

// Remove filters
sprite.filters = [];
```

---

## Masks

```typescript
import { Graphics, Sprite } from 'pixi.js';

// Shape mask
const maskGraphics = new Graphics();
maskGraphics.circle(200, 200, 100);
maskGraphics.fill(0xffffff);
sprite.mask = maskGraphics;

// Sprite mask (alpha-based)
const maskSprite = Sprite.from('mask-image.png');
sprite.mask = maskSprite;

// Remove mask
sprite.mask = null;
```

---

## Render Textures

```typescript
import { RenderTexture, Sprite } from 'pixi.js';

// Create a render texture (off-screen canvas)
const rt = RenderTexture.create({ width: 256, height: 256 });

// Render objects into it
app.renderer.render({ container: someContainer, target: rt });

// Use as a regular texture
const snapshot = new Sprite(rt);
app.stage.addChild(snapshot);

// Resize
rt.resize(512, 512);

// Cleanup
rt.destroy(true);
```

---

## CacheAsTexture (Performance)

```typescript
// Cache a complex container as a single texture
// Dramatically reduces draw calls for static content.
container.cacheAsTexture(true);

// Force re-render the cached texture after changes
container.updateCacheTexture();

// Disable caching
container.cacheAsTexture(false);
```

---

## Common Patterns

### Game Loop with Fixed Timestep

```typescript
const STEP = 1000 / 60;  // 60 updates per second
let accumulator = 0;

app.ticker.add((ticker) => {
  accumulator += ticker.elapsedMS;

  while (accumulator >= STEP) {
    fixedUpdate(STEP / 1000);  // physics, game logic
    accumulator -= STEP;
  }

  render(accumulator / STEP);   // interpolated rendering
});
```

### Object Pool

```typescript
class Pool<T extends Container> {
  private inactive: T[] = [];

  constructor(private factory: () => T) {}

  get(): T {
    return this.inactive.pop() ?? this.factory();
  }

  release(obj: T): void {
    obj.visible = false;
    this.inactive.push(obj);
  }
}

const bulletPool = new Pool(() => {
  const b = new Sprite(Texture.from('bullet.png'));
  b.anchor.set(0.5);
  return b;
});
```

### Screen Shake

```typescript
function screenShake(
  container: Container,
  intensity = 5,
  durationMs = 200
): void {
  const originalX = container.x;
  const originalY = container.y;
  const startTime = performance.now();

  const shaker = (ticker: { elapsedMS: number }) => {
    const elapsed = performance.now() - startTime;
    if (elapsed >= durationMs) {
      container.position.set(originalX, originalY);
      app.ticker.remove(shaker);
      return;
    }
    const decay = 1 - elapsed / durationMs;
    container.x = originalX + (Math.random() - 0.5) * intensity * 2 * decay;
    container.y = originalY + (Math.random() - 0.5) * intensity * 2 * decay;
  };

  app.ticker.add(shaker);
}
```

---

## Cleanup & Destruction

```typescript
// Destroy a single display object
sprite.destroy();                          // removes from parent
sprite.destroy({ children: true });        // also destroys children
sprite.destroy({ texture: true });         // also destroys its texture
sprite.destroy({ children: true, texture: true }); // both

// Destroy textures / assets
texture.destroy(true);                     // true = destroy base texture too
await Assets.unload('asset-key');          // unload from cache

// Full application teardown
app.destroy(true);                         // true = remove canvas from DOM
// After destroy, the Application instance is no longer usable.
```
