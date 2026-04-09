# G9 — Phaser 3 Mobile Support & Deployment

> **Category:** guide · **Engine:** Phaser · **Related:** [E1 Architecture Overview](../architecture/E1_architecture_overview.md) · [G1 Scene Lifecycle](G1_scene_lifecycle.md) · [G3 Input Handling](G3_input_handling.md)

---

## Overview

Shipping a Phaser game means getting it running smoothly across desktop browsers, mobile browsers, and optionally native app stores. Phaser 3's built-in Scale Manager handles canvas sizing and aspect ratio. Deployment paths range from static web hosting and PWAs to native wrappers like Capacitor and Cordova.

This guide covers responsive scaling, touch optimization, performance tuning for mobile, PWA setup, and native app packaging.

---

## Scale Manager Configuration

The Scale Manager controls how the game canvas fits its container. Configure it in your `Phaser.Types.Core.GameConfig`:

```typescript
const config: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
    parent: 'game-container',
    width: 800,
    height: 600,
    min: {
      width: 320,
      height: 240
    },
    max: {
      width: 1600,
      height: 1200
    }
  },
  scene: [BootScene, GameScene]
};

const game = new Phaser.Game(config);
```

### Scale Modes

| Mode | Behavior | Best For |
|------|----------|----------|
| `Phaser.Scale.FIT` | Fits canvas inside parent, preserving aspect ratio. May leave empty space (letterboxing). | Most games — predictable layout |
| `Phaser.Scale.ENVELOP` | Covers entire parent, preserving aspect ratio. Canvas may extend beyond parent bounds. | Full-bleed visuals where edge cropping is acceptable |
| `Phaser.Scale.RESIZE` | Resizes canvas to fill all parent space. Changes the game resolution. | Fluid UIs, map editors, strategy games |
| `Phaser.Scale.NONE` | No scaling. Canvas stays at configured width/height. | Pixel-art games at fixed resolution |

### Responding to Resize Events

When the Scale Manager resizes the canvas, it emits a `resize` event. Use this to reposition UI elements:

```typescript
export class GameScene extends Phaser.Scene {
  create(): void {
    // Reposition elements when the window resizes
    this.scale.on('resize', this.handleResize, this);
  }

  private handleResize(gameSize: Phaser.Structs.Size): void {
    const { width, height } = gameSize;

    // Reposition a score label to top-right
    this.scoreText?.setPosition(width - 20, 20);

    // Re-center a title
    this.titleText?.setPosition(width / 2, height / 2);

    // Update camera bounds if using a tilemap
    this.cameras.main.setBounds(0, 0, this.map.widthInPixels, this.map.heightInPixels);
  }

  destroy(): void {
    this.scale.off('resize', this.handleResize, this);
  }
}
```

### Fullscreen Support

```typescript
// Toggle fullscreen on button click
this.fullscreenBtn.on('pointerup', () => {
  if (this.scale.isFullscreen) {
    this.scale.stopFullscreen();
  } else {
    // 'resize' expands the game when entering fullscreen
    this.scale.startFullscreen();
  }
});
```

> **Note:** Fullscreen must be triggered by a user gesture (click/tap). You cannot call `startFullscreen()` during `create()` or on a timer.

---

## Mobile Touch Optimization

Phaser maps touch events to pointer events automatically. A single finger tap is `pointer1`, two fingers gives `pointer1` and `pointer2`, etc.

### Enable Multi-Touch

```typescript
const config: Phaser.Types.Core.GameConfig = {
  input: {
    activePointers: 3 // Support up to 3 simultaneous touches
  }
};
```

### Virtual Joystick Pattern

For mobile games needing directional input, use a virtual joystick. The `rexvirtualjoystickplugin` from Rex Plugins is widely used, or roll your own:

```typescript
export class TouchControls extends Phaser.Scene {
  private joystickBase!: Phaser.GameObjects.Arc;
  private joystickThumb!: Phaser.GameObjects.Arc;
  private dragStartX = 0;
  private dragStartY = 0;

  create(): void {
    const centerX = 120;
    const centerY = this.scale.height - 120;

    this.joystickBase = this.add.circle(centerX, centerY, 60, 0x888888, 0.5);
    this.joystickThumb = this.add.circle(centerX, centerY, 30, 0xffffff, 0.8);

    this.joystickBase.setInteractive();
    this.joystickBase.setScrollFactor(0); // Fixed to camera
    this.joystickThumb.setScrollFactor(0);

    this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      if (pointer.x < this.scale.width / 2) {
        this.dragStartX = pointer.x;
        this.dragStartY = pointer.y;
      }
    });

    this.input.on('pointermove', (pointer: Phaser.Input.Pointer) => {
      if (pointer.isDown && pointer.x < this.scale.width / 2) {
        const dx = pointer.x - this.dragStartX;
        const dy = pointer.y - this.dragStartY;
        const distance = Math.min(50, Math.sqrt(dx * dx + dy * dy));
        const angle = Math.atan2(dy, dx);

        this.joystickThumb.setPosition(
          centerX + Math.cos(angle) * distance,
          centerY + Math.sin(angle) * distance
        );
      }
    });
  }
}
```

### Safe Area Insets

Modern phones have notches and rounded corners. Account for safe areas:

```css
/* In your HTML wrapper */
#game-container {
  padding-top: env(safe-area-inset-top);
  padding-bottom: env(safe-area-inset-bottom);
  padding-left: env(safe-area-inset-left);
  padding-right: env(safe-area-inset-right);
}
```

Then configure Phaser's parent to be `game-container` so the Scale Manager respects these insets.

---

## Mobile Performance

### Renderer Selection

```typescript
const config: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO, // Prefers WebGL, falls back to Canvas
  // Force Canvas for very low-end devices:
  // type: Phaser.CANVAS,
  render: {
    pixelArt: true,        // Disables anti-aliasing — sharper pixels, faster rendering
    antialias: false,
    powerPreference: 'high-performance' // Hint to use discrete GPU if available
  }
};
```

### Key Optimization Strategies

1. **Reduce draw calls** — Use texture atlases instead of individual images. A single atlas with 100 sprites = 1 draw call instead of 100.

2. **Object pooling** — Reuse game objects instead of creating/destroying them:
   ```typescript
   // Create a pool of bullets
   this.bulletPool = this.physics.add.group({
     classType: Bullet,
     maxSize: 30,
     runChildUpdate: true
   });

   // Get from pool instead of creating new
   const bullet = this.bulletPool.get(x, y) as Bullet;
   if (bullet) {
     bullet.fire(direction);
   }
   ```

3. **Limit physics bodies** — Disable physics on off-screen objects. Use `body.enable = false` for inactive entities.

4. **Target resolution** — On mobile, rendering at 720p or lower and scaling up via the Scale Manager is often indistinguishable from native resolution but significantly faster.

5. **Reduce canvas size** — For action games on mobile, a 400×700 canvas scaled up via CSS performs dramatically better than a 1080×1920 canvas.

---

## Deployment: Static Web Hosting

The simplest deployment is a static build. Phaser games are client-side only.

### Build with Vite

```bash
npm create vite@latest my-phaser-game -- --template vanilla-ts
cd my-phaser-game
npm install phaser
npm run build
# Output in dist/ — deploy this folder
```

### Recommended Hosts

- **itch.io** — Upload a zip of your `dist/` folder. Great for game jams and indie distribution.
- **Vercel / Netlify / Cloudflare Pages** — Connect your git repo for automatic deploys on push.
- **GitHub Pages** — Free hosting for public repos. Set the build output to `docs/` or use a GitHub Action.

---

## Deployment: Progressive Web App (PWA)

A PWA lets players install your game to their home screen and play offline.

### Manifest File

Create `public/manifest.json`:

```json
{
  "name": "My Phaser Game",
  "short_name": "PhaserGame",
  "start_url": "/",
  "display": "fullscreen",
  "orientation": "landscape",
  "background_color": "#000000",
  "theme_color": "#1a1a2e",
  "icons": [
    { "src": "/icon-192.png", "sizes": "192x192", "type": "image/png" },
    { "src": "/icon-512.png", "sizes": "512x512", "type": "image/png" }
  ]
}
```

### Service Worker

Create `public/sw.js` to cache game assets for offline play:

```javascript
const CACHE_NAME = 'phaser-game-v1';
const ASSETS = [
  '/',
  '/index.html',
  '/assets/atlas.png',
  '/assets/atlas.json',
  '/assets/audio/bgm.mp3'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS))
  );
});

self.addEventListener('fetch', (event) => {
  event.respondWith(
    caches.match(event.request).then((response) => {
      return response || fetch(event.request);
    })
  );
});
```

Register it in your `index.html`:

```html
<script>
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js');
  }
</script>
```

> **Tip:** Use `display: "fullscreen"` and `orientation: "landscape"` (or `"portrait"`) in your manifest to lock orientation on mobile.

---

## Deployment: Native Apps with Capacitor

Capacitor wraps your web game in a native shell for iOS and Android app stores.

### Setup

```bash
npm install @capacitor/core @capacitor/cli
npx cap init "My Game" com.example.mygame

# Build your Phaser game first
npm run build

# Add platforms
npx cap add android
npx cap add ios

# Sync web assets into native projects
npx cap sync
```

### Key Considerations

- **No service workers** — Capacitor's native shell does not enable service workers. Asset caching is handled natively.
- **Touch events work natively** — Phaser's pointer system maps directly to native touch.
- **Use Capacitor plugins** for native features like haptic feedback, status bar control, and in-app purchases.
- **Performance** — Native WebView performance varies. Test on real devices early. Android's WebView has improved significantly but older devices may struggle.

### Alternative: Cordova

Cordova is the predecessor to Capacitor and still works, but Capacitor is recommended for new projects. It has better TypeScript support, a more modern plugin ecosystem, and easier native project management.

---

## Orientation Locking

For games that only work in one orientation:

```typescript
const config: Phaser.Types.Core.GameConfig = {
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
    orientation: {
      forceOrientation: true,
      orientation: Phaser.Scale.Orientation.LANDSCAPE
    }
  }
};
```

Alternatively, use the Screen Orientation API:

```typescript
// In create(), after a user gesture
screen.orientation?.lock('landscape').catch(() => {
  // Lock not supported — show a "rotate your device" overlay instead
  this.showRotatePrompt();
});
```

---

## Deployment Checklist

Before shipping a mobile Phaser game:

- [ ] Test on at least 2 real Android devices and 1 iOS device (Safari WebView)
- [ ] Verify touch controls work without a mouse/keyboard fallback
- [ ] Confirm the Scale Manager handles orientation changes without breaking layout
- [ ] Check audio playback — mobile browsers require a user gesture before playing audio
- [ ] Audit texture sizes — keep individual textures under 2048×2048 for broad compatibility
- [ ] Run a Lighthouse audit on the hosted build for PWA compliance
- [ ] Minimize initial bundle size — lazy-load heavy assets in a loading scene
- [ ] Test with "Low Power Mode" on iOS (throttles performance significantly)

---

## Framework Comparison: Scaling Approaches

| Feature | Phaser | PixiJS | Kaplay | Excalibur |
|---------|--------|--------|--------|-----------|
| Built-in Scale Manager | Yes — `Phaser.Scale` | No — manual `renderer.resize()` | Yes — `letterbox: true` | Yes — `DisplayMode` enum |
| Aspect ratio modes | FIT, ENVELOP, RESIZE, NONE | Manual calculation | Letterbox or stretch | FitScreen, FitContainer, +Fill variants |
| Fullscreen API | `scale.startFullscreen()` | Manual `requestFullscreen()` | `setFullscreen()` | `screen.goFullScreen()` |
| Orientation lock | Config-level + Screen API | Screen API only | Screen API only | Screen API only |
| Auto HiDPI | Yes (DPR-aware) | Yes (DPR-aware) | Yes | Yes (pixelRatio option) |
