# G10 — Excalibur.js Mobile Support & Deployment

> **Category:** guide · **Engine:** Excalibur · **Related:** [E1 Architecture Overview](../architecture/E1_architecture_overview.md) · [G2 Scene Management](G2_scene_management.md) · [G4 Input Handling](G4_input_handling.md)

---

## Overview

Excalibur.js is a TypeScript-first 2D game engine that runs in the browser. Since Excalibur games are standard web applications, they can be deployed as static sites, PWAs, or wrapped into native apps using tools like Capacitor or Tauri. Excalibur provides a robust `DisplayMode` system for responsive scaling and automatic HiDPI support.

This guide covers display modes, mobile input handling, performance tuning, and deployment strategies.

---

## Display Modes

Excalibur's display modes control how the game canvas scales relative to the browser window or a container element. Set the mode when constructing the engine:

```typescript
import { Engine, DisplayMode } from 'excalibur';

const game = new Engine({
  width: 800,
  height: 600,
  displayMode: DisplayMode.FitScreen
});

game.start();
```

### Available Modes

| Mode | Behavior | Letterboxing? |
|------|----------|---------------|
| `DisplayMode.Fixed` | Canvas stays at exact width/height. No scaling. | No — fixed size |
| `DisplayMode.FitScreen` | Scales canvas to fill the screen while preserving aspect ratio. | Yes — bars on shorter axis |
| `DisplayMode.FitContainer` | Scales canvas to fill its parent HTML element while preserving aspect ratio. | Yes — bars on shorter axis |
| `DisplayMode.FitScreenAndFill` | Like FitScreen but allows drawing into the letterbox area. | No — extra area is drawable |
| `DisplayMode.FitContainerAndFill` | Like FitContainer but allows drawing into the overflow area. | No — extra area is drawable |
| `DisplayMode.FillScreen` | Stretches canvas to fill screen. Aspect ratio is not preserved. | No — may distort |
| `DisplayMode.FillContainer` | Stretches canvas to fill parent element. Aspect ratio is not preserved. | No — may distort |

### FitScreen vs FitScreenAndFill

`FitScreen` is the most common choice — it preserves your intended aspect ratio with black bars. `FitScreenAndFill` is useful when you want the entire screen covered (no bars) but can tolerate some content being outside the "safe zone":

```typescript
const game = new Engine({
  width: 800,
  height: 600,
  displayMode: DisplayMode.FitScreenAndFill
});

game.start().then(() => {
  // The content area is the 800x600 region guaranteed visible
  const safeArea = game.screen.contentArea;
  console.log('Safe area:', safeArea.width, safeArea.height);

  // The full drawable area may be larger
  const viewport = game.screen.viewport;
  console.log('Viewport:', viewport.width, viewport.height);
});
```

> **Rule of thumb:** Place critical UI (score, health, buttons) inside `screen.contentArea`. Background or decorative elements can extend into the full viewport.

### FitContainer for Embedded Games

When embedding your game in a larger webpage (not fullscreen), use `FitContainer`:

```typescript
const game = new Engine({
  width: 800,
  height: 600,
  displayMode: DisplayMode.FitContainer,
  canvasElementId: 'game-canvas'
});
```

```html
<div id="game-wrapper" style="width: 100%; max-width: 960px; aspect-ratio: 4/3;">
  <canvas id="game-canvas"></canvas>
</div>
```

---

## Screen, Viewport, and Resolution

Excalibur distinguishes between **viewport** (CSS pixels on screen) and **resolution** (logical game pixels):

```typescript
const game = new Engine({
  width: 400,   // resolution width — 400 logical pixels
  height: 300,  // resolution height — 300 logical pixels
  displayMode: DisplayMode.FitScreen
});

// After start:
// game.screen.resolution → { width: 400, height: 300 }
// game.screen.viewport   → { width: 1200, height: 900 } (depends on screen)
```

A resolution of 400×300 on a 1200×900 viewport means each game pixel covers a 3×3 block of screen pixels. This is ideal for pixel-art games where you want crisp, chunky pixels.

### HiDPI / Retina Support

Excalibur automatically detects HiDPI displays and scales the internal canvas resolution to prevent blurry graphics. You can override this:

```typescript
const game = new Engine({
  width: 800,
  height: 600,
  pixelRatio: 2, // Force 2x rendering (for crisp visuals on Retina)
  suppressHiDPIScaling: false // Default — let Excalibur handle DPR
});
```

> **Performance note:** Higher `pixelRatio` means more pixels to render. On low-end mobile devices, consider setting `pixelRatio: 1` to improve frame rate.

---

## Mobile Input

Excalibur's pointer system handles both mouse and touch transparently. A finger tap fires the same `pointerdown` / `pointerup` events as a mouse click.

### Pointer Events on Actors

```typescript
import { Actor, Color, vec } from 'excalibur';

class Button extends Actor {
  constructor() {
    super({
      pos: vec(400, 500),
      width: 120,
      height: 50,
      color: Color.Blue
    });
  }

  onInitialize(): void {
    // Works for both mouse click and finger tap
    this.on('pointerdown', () => {
      console.log('Button pressed!');
      this.color = Color.Green;
    });

    this.on('pointerup', () => {
      this.color = Color.Blue;
    });
  }
}
```

### Handling Swipe Gestures

Excalibur doesn't have built-in gesture recognition, but you can implement swipes with pointer tracking:

```typescript
import { Scene, vec, Vector } from 'excalibur';

class GameScene extends Scene {
  private pointerStart: Vector = vec(0, 0);
  private readonly SWIPE_THRESHOLD = 50; // Minimum distance for a swipe

  onInitialize(): void {
    this.input.pointers.on('down', (evt) => {
      this.pointerStart = vec(evt.screenPos.x, evt.screenPos.y);
    });

    this.input.pointers.on('up', (evt) => {
      const delta = vec(
        evt.screenPos.x - this.pointerStart.x,
        evt.screenPos.y - this.pointerStart.y
      );

      if (delta.distance() < this.SWIPE_THRESHOLD) return;

      // Determine swipe direction
      if (Math.abs(delta.x) > Math.abs(delta.y)) {
        if (delta.x > 0) this.onSwipe('right');
        else this.onSwipe('left');
      } else {
        if (delta.y > 0) this.onSwipe('down');
        else this.onSwipe('up');
      }
    });
  }

  private onSwipe(direction: string): void {
    console.log(`Swiped ${direction}`);
  }
}
```

### Touch-Friendly Hit Areas

On mobile, fingers are less precise than mouse cursors. Ensure interactive actors have generous hit areas:

```typescript
class SmallCoin extends Actor {
  onInitialize(): void {
    // Visual is 16x16, but hit area is 48x48 for fat-finger friendliness
    this.graphics.use(coinSprite); // 16x16 sprite

    // Expand the pointer detection area
    this.pointer.useColliderShape = false;
    this.pointer.useGraphicsBounds = false;
  }
}
```

---

## Performance on Mobile

### Reduce Resolution

Rendering at full device resolution is expensive on mobile. Use a lower logical resolution:

```typescript
const game = new Engine({
  width: 480,
  height: 320,
  displayMode: DisplayMode.FitScreen,
  pixelRatio: 1 // Don't multiply by device DPR
});
```

### Actor Management

- **Kill off-screen actors** — Use `actor.kill()` for entities that leave the play area and won't return.
- **Use `isOffScreen`** — Check `actor.isOffScreen` before running expensive update logic.
- **Limit active actors** — Mobile GPUs handle fewer draw calls. Keep active actor counts under a few hundred.

### Texture Considerations

- Keep sprite sheets under 2048×2048 for broad mobile WebGL compatibility.
- Prefer power-of-two dimensions for textures (256, 512, 1024, 2048).
- Use compressed PNG over uncompressed formats.

---

## Deployment: Static Hosting

Excalibur games are standard web apps. Build and deploy the output folder:

```bash
# Using Vite (recommended)
npm create vite@latest my-excalibur-game -- --template vanilla-ts
cd my-excalibur-game
npm install excalibur
npm run build
# Deploy dist/ to any static host
```

### Hosting Options

- **itch.io** — Zip your `dist/` folder and upload. Ideal for game jams.
- **Vercel / Netlify / Cloudflare Pages** — Git-push deploys with zero config.
- **GitHub Pages** — Free for public repos.

---

## Deployment: Native Apps

### Capacitor (iOS + Android)

Capacitor wraps your web game in a native WebView. The Excalibur team provides a Capacitor template:

```bash
npm install @capacitor/core @capacitor/cli
npx cap init "My Game" com.example.mygame
npm run build
npx cap add android
npx cap add ios
npx cap sync
```

- Touch events map directly — no extra configuration needed.
- Use Capacitor plugins for native features (haptics, status bar, splash screen).
- Test on real devices — Android WebView performance varies significantly by manufacturer.

### Tauri v2 (Desktop + Mobile)

Tauri v2 supports both desktop and mobile targets with a smaller binary than Electron:

```bash
npm install @tauri-apps/cli
npx tauri init
npx tauri android init
npx tauri ios init
npm run build
npx tauri android build
```

> **Note:** Tauri mobile support is newer than Capacitor. It produces smaller binaries but has a smaller plugin ecosystem as of 2025.

---

## PWA Setup

Add a web app manifest and service worker to make your game installable:

### manifest.json

```json
{
  "name": "My Excalibur Game",
  "short_name": "ExGame",
  "start_url": "/",
  "display": "fullscreen",
  "orientation": "landscape",
  "background_color": "#000000",
  "theme_color": "#2d2d2d",
  "icons": [
    { "src": "/icon-192.png", "sizes": "192x192", "type": "image/png" },
    { "src": "/icon-512.png", "sizes": "512x512", "type": "image/png" }
  ]
}
```

### Service Worker (basic cache-first)

```javascript
const CACHE = 'excalibur-game-v1';
const PRECACHE = ['/', '/index.html', '/assets/sprites.png'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(PRECACHE)));
});

self.addEventListener('fetch', (e) => {
  e.respondWith(
    caches.match(e.request).then((r) => r || fetch(e.request))
  );
});
```

---

## Deployment Checklist

Before shipping a mobile Excalibur game:

- [ ] Choose an appropriate `DisplayMode` and test orientation changes
- [ ] Verify `screen.contentArea` contains all critical UI when using `AndFill` modes
- [ ] Test touch interactions on real devices — tap, swipe, multi-touch
- [ ] Ensure audio starts after a user gesture (browser autoplay policy)
- [ ] Profile frame rate on a mid-range Android phone
- [ ] Keep texture dimensions ≤ 2048×2048
- [ ] If using Capacitor: test native build on both iOS and Android
- [ ] Run Lighthouse audit for PWA score if deploying as installable web app

---

## Framework Comparison: Display Modes

| Feature | Excalibur | Phaser | Kaplay | PixiJS |
|---------|-----------|--------|--------|--------|
| Fit with letterbox | `DisplayMode.FitScreen` | `Scale.FIT` | `letterbox: true` | Manual |
| Fit + draw into bars | `FitScreenAndFill` | N/A (custom) | N/A | Manual |
| Stretch to fill | `DisplayMode.FillScreen` | `Scale.RESIZE` | `letterbox: false` | `renderer.resize()` |
| Container-aware | `FitContainer` variants | `parent` config | N/A | Custom container logic |
| Safe content area API | `screen.contentArea` | Resize event | N/A | N/A |
| Auto HiDPI | Yes (default) | Yes (default) | Yes | Yes |
