# G9 — PixiJS v8 Mobile Support & Deployment

> **Category:** guide · **Engine:** PixiJS · **Related:** [E1 Architecture Overview](../architecture/E1_architecture_overview.md) · [G1 Asset Loading](G1_asset_loading.md) · [G4 Input Handling](G4_input_handling.md)

---

## Overview

PixiJS is a rendering engine, not a full game framework, so mobile support and deployment require you to assemble several pieces yourself: canvas scaling, touch input normalization, performance tuning, and a packaging strategy. The upside is total control — you pick exactly the scaling behavior, resolution strategy, and deployment target that fits your game.

This guide covers the ResizePlugin for responsive canvas sizing, device-pixel-ratio handling, touch/pointer input on mobile, performance optimization for constrained hardware, PWA packaging, and native app wrapping with Capacitor and Tauri.

---

## Responsive Canvas Scaling

### The ResizePlugin

PixiJS v8's `ResizePlugin` ships with `Application` by default. When you set `resizeTo`, the renderer automatically resizes to match a target element or the window:

```typescript
import { Application } from 'pixi.js';

const app = new Application();

// WHY async init: PixiJS v8 requires async initialization
// for renderer auto-detection (WebGPU vs WebGL).
await app.init({
  width: 800,
  height: 600,
  resizeTo: window, // or document.getElementById('game-container')
});

document.body.appendChild(app.canvas);
```

The plugin throttles resize events through `requestAnimationFrame` to avoid layout thrashing. You can also trigger resizes manually:

```typescript
// WHY manual resize: useful after programmatic layout changes
// (e.g., toggling a sidebar) that don't fire window resize events.
app.resize();

// Cancel a pending resize if you need to batch layout changes.
app.cancelResize();
```

### Fixed-Ratio Scaling (Letterboxing)

For most games, you want a fixed design resolution that scales proportionally. PixiJS doesn't include a built-in scale manager like Phaser's, so you build one with a root Container:

```typescript
import { Application, Container } from 'pixi.js';

const DESIGN_WIDTH = 800;
const DESIGN_HEIGHT = 600;
const DESIGN_RATIO = DESIGN_WIDTH / DESIGN_HEIGHT;

const app = new Application();
await app.init({
  resizeTo: window,
  backgroundColor: 0x000000,
});

// WHY a root container: all game content lives inside this container,
// which gets scaled uniformly. The app's stage stays at screen size
// for letterbox bars or UI overlays.
const gameContainer = new Container();
app.stage.addChild(gameContainer);

function resize(): void {
  const screenWidth = app.screen.width;
  const screenHeight = app.screen.height;
  const screenRatio = screenWidth / screenHeight;

  let scale: number;
  let offsetX = 0;
  let offsetY = 0;

  if (screenRatio > DESIGN_RATIO) {
    // Screen is wider than design — height is the constraint.
    scale = screenHeight / DESIGN_HEIGHT;
    offsetX = (screenWidth - DESIGN_WIDTH * scale) / 2;
  } else {
    // Screen is taller than design — width is the constraint.
    scale = screenWidth / DESIGN_WIDTH;
    offsetY = (screenHeight - DESIGN_HEIGHT * scale) / 2;
  }

  gameContainer.scale.set(scale);
  gameContainer.position.set(offsetX, offsetY);
}

// Run on init and on every resize.
resize();
window.addEventListener('resize', resize);
```

This produces letterbox bars (black space) on the non-constraining axis. For a "fill and crop" approach, swap the comparison: use the larger scale factor instead of the smaller one.

### Resolution and Device Pixel Ratio

High-DPI screens (Retina, modern phones) have a `devicePixelRatio` greater than 1. By default, PixiJS renders at 1:1 CSS pixels. To get crisp rendering on HiDPI displays:

```typescript
await app.init({
  width: 800,
  height: 600,
  resolution: window.devicePixelRatio || 1,
  autoDensity: true, // WHY: keeps CSS size matching logical size
                      // while rendering at native pixel density.
});
```

**Trade-off:** Higher resolution means more pixels to fill. On a 3x device, that's 9x the fill rate. For performance-constrained mobile games, cap the resolution:

```typescript
// WHY cap at 2: most players can't perceive the difference between
// 2x and 3x, but 3x costs 2.25x more GPU fill than 2x.
const resolution = Math.min(window.devicePixelRatio || 1, 2);

await app.init({
  resolution,
  autoDensity: true,
});
```

---

## Mobile Touch Input

PixiJS v8 uses a unified pointer event system. For mobile compatibility, always prefer pointer events over mouse events — they work identically for mouse, touch, and pen input.

### Event Modes

Every display object that should receive input needs an `eventMode`:

| Mode | Description | Use Case |
|------|-------------|----------|
| `'static'` | Receives events, performs hit testing | Buttons, interactive sprites |
| `'dynamic'` | Like static, plus fires events during idle pointer states | Draggable objects, continuous tracking |
| `'passive'` | No hit testing, no events | Non-interactive decorations |
| `'none'` | Completely ignored by the event system | Background layers |

```typescript
import { Sprite } from 'pixi.js';

const button = new Sprite(texture);
button.eventMode = 'static';
button.cursor = 'pointer';

// WHY pointerdown instead of touchstart: pointer events unify
// mouse, touch, and pen. One handler covers all devices.
button.on('pointerdown', (event) => {
  console.log('Pressed at', event.global.x, event.global.y);
});

button.on('pointerup', () => {
  console.log('Released');
});
```

### Multi-Touch

PixiJS supports multi-touch natively. Each touch point generates its own event with a unique `pointerId`:

```typescript
const touches = new Map<number, { x: number; y: number }>();

gameContainer.eventMode = 'static';

gameContainer.on('pointerdown', (e) => {
  touches.set(e.pointerId, { x: e.global.x, y: e.global.y });
});

gameContainer.on('pointermove', (e) => {
  if (touches.has(e.pointerId)) {
    touches.set(e.pointerId, { x: e.global.x, y: e.global.y });
  }
});

gameContainer.on('pointerup', (e) => {
  touches.delete(e.pointerId);
});

// WHY pointerupoutside: on mobile, a finger can start on a sprite
// and lift outside it. Without this, touches "stick."
gameContainer.on('pointerupoutside', (e) => {
  touches.delete(e.pointerId);
});
```

### Global Pointer Tracking

In v8, `pointermove` only fires when the pointer is over a display object. For gestures that track movement anywhere on the canvas (camera panning, joystick controls), use `globalpointermove`:

```typescript
// WHY globalpointermove: unlike pointermove, this fires on every
// pointer movement regardless of what's under the cursor.
app.stage.eventMode = 'static';
app.stage.on('globalpointermove', (e) => {
  virtualJoystick.update(e.global.x, e.global.y);
});
```

---

## Performance Optimization for Mobile

### Renderer Settings

Disable features you don't need to reduce GPU overhead:

```typescript
await app.init({
  antialias: false,        // WHY: saves fill rate on mobile GPUs
  backgroundAlpha: 1,      // WHY: opaque backgrounds avoid alpha blending cost
  resolution: Math.min(window.devicePixelRatio, 2),
  autoDensity: true,
  preference: 'webgl',     // WHY: WebGL is mature and stable on mobile;
                            // WebGPU mobile support is still inconsistent.
});
```

### Texture Optimization

Spritesheets are critical on mobile — they reduce draw calls by batching sprites that share a texture atlas:

```typescript
import { Assets, Sprite, Spritesheet } from 'pixi.js';

// WHY spritesheets: PixiJS can batch up to 16 textures per draw call
// (hardware-dependent). Fewer textures = fewer draw calls = better FPS.
const sheet = await Assets.load<Spritesheet>('assets/game-sprites.json');
const hero = new Sprite(sheet.textures['hero-idle.png']);
```

For multi-resolution support, generate spritesheets at multiple scales and use PixiJS's resolution suffix convention:

```
assets/
  game-sprites.json       ← 1x (default)
  game-sprites@0.5x.json  ← 0.5x for low-end devices
```

PixiJS automatically doubles the visual size of `@0.5x` assets, so positions and sizes remain consistent.

### Text Performance

Text rendering is expensive on mobile. Reduce cost with these strategies:

```typescript
import { Text, BitmapText, TextStyle } from 'pixi.js';

// WHY lower text resolution: Text objects re-rasterize on every change.
// Halving resolution saves significant memory on mobile.
const scoreText = new Text({
  text: 'Score: 0',
  style: new TextStyle({ fontSize: 24, fill: 0xffffff }),
});
scoreText.resolution = 1; // Force 1x even on HiDPI screens

// WHY BitmapText for frequently-updated displays:
// Pre-rendered glyphs skip the rasterization step entirely.
const fpsText = new BitmapText({
  text: '60',
  style: { fontFamily: 'GameFont', fontSize: 16 },
});
```

### Memory Management

Mobile devices have limited VRAM. Destroy textures you're done with, and stagger destruction to avoid frame hitches:

```typescript
// WHY staggered destruction: destroying many textures in one frame
// causes a GC pause. Spreading it across frames keeps the game smooth.
function destroyTexturesGradually(textures: Texture[], intervalMs = 50): void {
  textures.forEach((texture, i) => {
    setTimeout(() => texture.destroy(true), i * intervalMs);
  });
}
```

### CacheAsTexture for Complex Containers

If you have a Container with many children that rarely changes (e.g., a static background assembled from tiles), cache it as a texture to render it in a single draw call:

```typescript
// WHY cacheAsTexture: converts the entire container subtree into
// a single texture. Dramatically reduces draw calls for static content.
staticBackground.cacheAsTexture(true);

// When the content changes, update the cache:
staticBackground.updateCacheTexture();
```

---

## Deployment Strategies

### Static Web Hosting

The simplest deployment. Bundle with Vite, webpack, or Rollup and serve as static files:

```bash
# Vite example
npm create vite@latest my-game -- --template vanilla-ts
cd my-game
npm install pixi.js
npm run build
# Deploy dist/ to any static host (Netlify, Vercel, GitHub Pages, S3)
```

### Progressive Web App (PWA)

Making a PixiJS game installable requires three things: HTTPS, a Web App Manifest, and a Service Worker.

**manifest.json:**
```json
{
  "name": "My PixiJS Game",
  "short_name": "MyGame",
  "start_url": "/",
  "display": "fullscreen",
  "orientation": "landscape",
  "background_color": "#000000",
  "theme_color": "#000000",
  "icons": [
    { "src": "/icon-192.png", "sizes": "192x192", "type": "image/png" },
    { "src": "/icon-512.png", "sizes": "512x512", "type": "image/png" }
  ]
}
```

**Service Worker (sw.js):**
```javascript
const CACHE_NAME = 'game-cache-v1';
const ASSETS = [
  '/',
  '/index.html',
  '/assets/game-sprites.json',
  '/assets/game-sprites.png',
  // ... all game assets
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS))
  );
});

self.addEventListener('fetch', (event) => {
  event.respondWith(
    caches.match(event.request).then((cached) => cached || fetch(event.request))
  );
});
```

**Register in your entry point:**
```typescript
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/sw.js');
}
```

### Native Wrapping with Capacitor

Capacitor wraps your web app in a native WebView for iOS and Android app stores:

```bash
npm install @capacitor/core @capacitor/cli
npx cap init "My Game" com.example.mygame --web-dir dist
npm run build
npx cap add android
npx cap add ios
npx cap sync
npx cap open android  # Opens Android Studio
npx cap open ios      # Opens Xcode
```

**Key considerations for Capacitor:**
- Performance depends on the device's WebView (generally good on modern devices)
- Access native APIs (haptics, filesystem, notifications) via Capacitor plugins
- iOS WKWebView performs well; Android WebView varies by device/version

### Native Wrapping with Tauri

Tauri produces smaller binaries than Capacitor/Electron by using the OS's native webview. Tauri 2.x supports iOS and Android alongside desktop:

```bash
npm create tauri-app@latest -- --template vanilla-ts
cd my-game
npm install pixi.js
npm run tauri dev       # Desktop development
npm run tauri ios dev   # iOS development (requires Xcode)
npm run tauri android dev  # Android development (requires Android Studio)
```

**Tauri vs Capacitor trade-offs:**

| Factor | Capacitor | Tauri |
|--------|-----------|-------|
| Bundle size | ~15-40 MB | ~3-10 MB |
| Mobile support | Mature (iOS + Android) | Stable since Tauri 2.x |
| Native API access | Plugin ecosystem | Rust-based plugins |
| WebView | Chromium (Android), WKWebView (iOS) | System webview |
| Desktop | Via Electron (separate) | Built-in (Windows, macOS, Linux) |

---

## Mobile Checklist

Before shipping a PixiJS game to mobile, verify these items:

1. **Scaling** — ResizePlugin or custom scaler handles orientation changes and notch/safe-area insets
2. **Resolution** — `devicePixelRatio` capped at 2x for performance; `autoDensity: true` set
3. **Input** — All interactions use pointer events (not mouse events); `pointerupoutside` handled
4. **Performance** — Spritesheets used; antialias disabled; text resolution reduced; unused textures destroyed
5. **Audio** — Sound initialized on first user gesture (required by all mobile browsers)
6. **Viewport** — `<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no">` set
7. **Touch prevention** — `touch-action: none` on the canvas to prevent browser gestures (pull-to-refresh, pinch-zoom)
8. **Fullscreen** — Fullscreen API requested on first interaction for immersive experience

```css
/* WHY touch-action none: prevents the browser from intercepting
   touch gestures meant for the game (scroll, zoom, back-swipe). */
canvas {
  touch-action: none;
  -webkit-touch-callout: none;
  -webkit-user-select: none;
  user-select: none;
}
```

```html
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover">
```
