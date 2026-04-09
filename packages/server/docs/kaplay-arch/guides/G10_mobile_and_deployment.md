# G10 — Kaplay Mobile Support & Deployment

> **Category:** guide · **Engine:** Kaplay · **Related:** [E1 Architecture Overview](../architecture/E1_architecture_overview.md) · [G2 Scenes and Navigation](G2_scenes_and_navigation.md) · [G3 Input Handling](G3_input_handling.md)

---

## Overview

Kaplay (successor to Kaboom.js) is a beginner-friendly 2D game library that runs in the browser. Its simplicity extends to deployment — Kaplay games are standard JavaScript/TypeScript web apps that can be hosted anywhere. Kaplay provides built-in letterbox scaling and automatic touch-to-mouse mapping, making mobile support straightforward.

This guide covers responsive canvas configuration, touch input, mobile optimization, and deployment paths.

---

## Canvas Scaling with Letterbox

Kaplay's primary scaling mechanism is the `letterbox` option. When enabled, the canvas maintains its aspect ratio and scales to fit the window, with black bars filling any remaining space.

### Basic Letterbox Setup

```typescript
import kaplay from 'kaplay';

const k = kaplay({
  width: 800,
  height: 600,
  letterbox: true,    // Maintain aspect ratio, add bars as needed
  background: [0, 0, 0] // Bar color (black)
});
```

### Without Letterbox (Stretch)

If `letterbox` is `false` (the default), the canvas stretches to fill its container, which may distort your game:

```typescript
const k = kaplay({
  width: 800,
  height: 600,
  letterbox: false // Canvas stretches — aspect ratio NOT preserved
});
```

> **Recommendation:** Always use `letterbox: true` for games with fixed-ratio layouts (platformers, puzzle games, most 2D games). Only disable it for games that genuinely need to adapt to any aspect ratio.

### Pixel Art Games

For pixel-art games, combine a small canvas with letterboxing for crisp, scaled-up pixels:

```typescript
const k = kaplay({
  width: 320,
  height: 240,
  letterbox: true,
  crisp: true // Nearest-neighbor scaling — no blurry upscale
});
```

### Fullscreen

```typescript
// Toggle fullscreen on a button press
k.onKeyPress('f', () => {
  k.setFullscreen(!k.isFullscreen());
});

// Or via a touch-friendly UI button
const fsBtn = k.add([
  k.rect(80, 40),
  k.pos(k.width() - 100, 20),
  k.color(100, 100, 100),
  k.area(),
  'fullscreen-btn'
]);

fsBtn.onClick(() => {
  k.setFullscreen(!k.isFullscreen());
});
```

> **Note:** `setFullscreen()` must be called from a user gesture (click/tap). It will not work if called automatically on page load.

---

## Touch Input

Kaplay automatically translates touch events into mouse events. A finger tap triggers the same `onClick`, `onMousePress`, and pointer events as a mouse click. No extra configuration is needed for basic tap interactions.

### Detecting Touch vs Mouse

```typescript
// onTouchStart, onTouchMove, onTouchEnd are available for touch-specific logic
k.onTouchStart((pos, touch) => {
  console.log('Touch started at', pos);
});

k.onTouchMove((pos, touch) => {
  // Use for drag/swipe gestures
});

k.onTouchEnd((pos, touch) => {
  console.log('Touch ended at', pos);
});
```

### Virtual D-Pad for Mobile

Kaplay doesn't include a built-in virtual joystick, but the component system makes it easy to build one:

```typescript
function addVirtualDPad() {
  const btnSize = 60;
  const padding = 10;
  const baseX = 80;
  const baseY = k.height() - 140;

  const directions = [
    { label: '↑', x: baseX, y: baseY - btnSize - padding, dir: k.vec2(0, -1) },
    { label: '↓', x: baseX, y: baseY + btnSize + padding, dir: k.vec2(0, 1) },
    { label: '←', x: baseX - btnSize - padding, y: baseY, dir: k.vec2(-1, 0) },
    { label: '→', x: baseX + btnSize + padding, y: baseY, dir: k.vec2(1, 0) },
  ];

  const buttons = directions.map(({ label, x, y, dir }) => {
    const btn = k.add([
      k.rect(btnSize, btnSize, { radius: 8 }),
      k.pos(x, y),
      k.anchor('center'),
      k.color(255, 255, 255),
      k.opacity(0.4),
      k.area(),
      k.fixed(), // Fixed to camera — doesn't scroll with the world
      { direction: dir }
    ]);

    btn.onClick(() => {
      // Emit a custom event or directly move the player
      k.get('player')[0]?.move(dir.scale(200));
    });

    return btn;
  });

  return buttons;
}
```

### Action Buttons

For jump/attack buttons on the right side of the screen:

```typescript
function addActionButton(label: string, x: number, y: number, action: () => void) {
  const btn = k.add([
    k.circle(35),
    k.pos(x, y),
    k.anchor('center'),
    k.color(200, 60, 60),
    k.opacity(0.5),
    k.area(),
    k.fixed()
  ]);

  btn.onClick(action);

  // Add label
  k.add([
    k.text(label, { size: 16 }),
    k.pos(x, y),
    k.anchor('center'),
    k.color(255, 255, 255),
    k.fixed()
  ]);

  return btn;
}

// Usage
addActionButton('A', k.width() - 80, k.height() - 100, () => {
  // Jump
  const player = k.get('player')[0];
  if (player?.isGrounded()) {
    player.jump(400);
  }
});
```

---

## Detecting Mobile

Serve different controls based on device:

```typescript
function isMobile(): boolean {
  return /Android|iPhone|iPad|iPod/i.test(navigator.userAgent)
    || ('ontouchstart' in window);
}

k.scene('game', () => {
  // ... set up game objects ...

  if (isMobile()) {
    addVirtualDPad();
    addActionButton('Jump', k.width() - 80, k.height() - 100, jumpAction);
  }
  // Desktop players use keyboard — no extra UI needed
});
```

---

## Performance on Mobile

### Keep the Canvas Small

Kaplay's letterbox mode scales a small canvas to fill the screen. This is a performance win — render fewer pixels, let the browser scale up:

```typescript
const k = kaplay({
  width: 480,     // Render at 480x270
  height: 270,
  letterbox: true // Browser scales to screen size
});
```

### Object Count

- Kaplay's ECS-like system is lightweight, but mobile GPUs have limited draw call budgets.
- Aim for fewer than 200-300 active game objects with sprites on screen at once.
- Use `destroy()` on objects that leave the play area.

### Texture Guidelines

- Keep sprite sheets under 2048×2048 pixels for broad WebGL compatibility.
- Prefer PNG with indexed color for pixel art (smaller file size).
- Load assets in a dedicated loading scene to avoid frame drops during gameplay.

### Audio on Mobile

Mobile browsers block audio until a user gesture occurs:

```typescript
k.scene('title', () => {
  k.add([
    k.text('Tap to Start', { size: 24 }),
    k.pos(k.center()),
    k.anchor('center')
  ]);

  k.onClick(() => {
    // This click is the user gesture that unlocks audio
    k.play('bgm', { loop: true, volume: 0.5 });
    k.go('game');
  });
});
```

---

## Deployment: Static Hosting

### Build with Vite

Kaplay games are typically bundled with Vite:

```bash
# Using the Kaplay CLI (if available)
npx create-kaplay my-game
cd my-game
npm install
npm run build
# Output in dist/ — deploy this folder
```

Or manually:

```bash
npm create vite@latest my-kaplay-game -- --template vanilla-ts
cd my-kaplay-game
npm install kaplay
npm run build
```

### Without a Bundler

Kaplay can be loaded via CDN for quick prototyping:

```html
<!DOCTYPE html>
<html>
<head>
  <script src="https://unpkg.com/kaplay@latest/dist/kaplay.js"></script>
</head>
<body>
  <script>
    const k = kaplay({ width: 800, height: 600, letterbox: true });
    k.add([k.text('Hello Kaplay!'), k.pos(k.center()), k.anchor('center')]);
  </script>
</body>
</html>
```

> **Note:** The CDN approach is fine for game jams and prototypes. Use a bundler for production games to enable tree-shaking and minification.

### Hosting Options

- **itch.io** — Upload a zip of your build output. Most popular for indie web games.
- **Vercel / Netlify / Cloudflare Pages** — Zero-config deploys from git.
- **GitHub Pages** — Free for public repos.
- **Newgrounds** — Upload HTML5 games for a built-in audience.

---

## Deployment: Desktop with Neutralinojs

The Kaplay community provides a Neutralinojs template for desktop builds:

```bash
# Clone the template
npx degit kaplayjs/kaplay-neutralino-template my-desktop-game
cd my-desktop-game
npm install
npm run dev     # Dev mode
npm run build   # Production build
```

Neutralinojs produces lightweight desktop apps (a few MB) compared to Electron (100+ MB).

---

## Deployment: Native Mobile with Capacitor

For app store distribution, wrap your Kaplay game with Capacitor:

```bash
npm install @capacitor/core @capacitor/cli
npx cap init "My Kaplay Game" com.example.kaplaygame
npm run build
npx cap add android
npx cap add ios
npx cap sync
npx cap open android  # Opens in Android Studio
```

Touch events work automatically — Kaplay's mouse/touch unification means your game code doesn't change.

---

## PWA Setup

Make your Kaplay game installable as a PWA:

### manifest.json

```json
{
  "name": "My Kaplay Game",
  "short_name": "KaplayGame",
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

```javascript
const CACHE = 'kaplay-game-v1';
const URLS = ['/', '/index.html', '/assets/sprites.png', '/assets/audio/bgm.mp3'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(URLS)));
});

self.addEventListener('fetch', (e) => {
  e.respondWith(caches.match(e.request).then((r) => r || fetch(e.request)));
});
```

---

## Deployment Checklist

Before shipping a mobile Kaplay game:

- [ ] Enable `letterbox: true` and test on multiple aspect ratios (16:9, 4:3, 21:9)
- [ ] Add virtual controls for touch devices (D-pad, action buttons)
- [ ] Verify audio plays after first user tap (autoplay policy)
- [ ] Test on at least one real Android and one iOS device
- [ ] Keep canvas dimensions reasonable (480×270 to 800×600 for mobile)
- [ ] Ensure sprite sheets are ≤ 2048×2048
- [ ] Use a loading scene for asset-heavy games
- [ ] If wrapping with Capacitor: test native builds on real devices

---

## Framework Comparison: Mobile Readiness

| Feature | Kaplay | Phaser | Excalibur | PixiJS |
|---------|--------|--------|-----------|--------|
| Touch → mouse mapping | Automatic | Automatic (pointer system) | Automatic (pointer system) | Manual |
| Built-in letterbox | `letterbox: true` | `Scale.FIT` | `DisplayMode.FitScreen` | Manual |
| Pixel-art crisp scaling | `crisp: true` | `pixelArt: true` | `pixelRatio` + low res | `SCALE_MODES.NEAREST` |
| Fullscreen API | `setFullscreen()` | `scale.startFullscreen()` | `screen.goFullScreen()` | Manual |
| Virtual controls | Build your own | Plugins available | Build your own | Build your own |
| Desktop wrapper | Neutralinojs template | Electron / Tauri | Tauri / Capacitor | Electron / Tauri |
| Mobile wrapper | Capacitor | Capacitor / Cordova | Capacitor / Tauri v2 | Capacitor |
