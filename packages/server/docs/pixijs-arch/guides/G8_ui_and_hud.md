# G8 — PixiJS v8 UI & HUD Systems

> **Category:** guide · **Engine:** PixiJS · **Related:** [E1 Architecture Overview](../architecture/E1_architecture_overview.md) · [G2 Sprites & Animation](G2_sprites_animation.md) · [G4 Input Handling](G4_input_handling.md)

---

## Overview

PixiJS is a rendering engine, not a full game engine, so UI is built from low-level primitives (Text, Graphics, Container) or the optional `@pixi/ui` library. Unlike Phaser, which includes built-in UI components and systems, PixiJS gives you the building blocks and leaves architectural decisions to you. This guide covers the full spectrum: rendering text dynamically, building HUD overlays from scratch, integrating the `@pixi/ui` component library, and optimizing UI performance in data-heavy scenarios.

The key distinction: PixiJS UI is composition over inheritance. You build menus, dialogs, and interactive elements by layering Containers, Sprites, Text, and Graphics objects, then wiring them together with event handlers and state management.

---

## Text Rendering

PixiJS provides three text classes, each with different tradeoffs between flexibility and performance:

| Class | Best For | Pros | Cons |
|-------|----------|------|------|
| `Text` | Dynamic text, score/health displays | Flexible styling, Unicode support, crisp at any size | Slower rendering, redraws every frame by default |
| `BitmapText` | Static or frequently-updated displays | Fast (pre-rendered glyphs), minimal memory | Requires bitmap font file (generated with tools like msdf-bmfont), limited styling |
| `HTMLText` | Rich text with markup | Supports `<b>`, `<i>`, `<br>`, emoji | Slower than `Text`, larger memory footprint |

### Text Class and TextStyle

`Text` is the most common choice for HUDs. It supports TrueType/OpenType fonts and dynamic styling:

```typescript
import { Text, TextStyle } from 'pixi.js';

// WHY separate TextStyle: Styles are reused across many Text objects.
// Creating one TextStyle and sharing it saves memory and CPU.
const hudStyle = new TextStyle({
  fontFamily: 'Arial, sans-serif',
  fontSize: 24,
  fontWeight: 'bold',
  fill: 0xffffff,           // white
  stroke: 0x000000,         // black outline
  strokeThickness: 2,
  align: 'center',
  // WHY lineHeight: Prevents text cutoff when using line breaks
  lineHeight: 28,
});

// Create score display
const scoreText = new Text({
  text: 'Score: 0',
  style: hudStyle,
});

scoreText.position.set(20, 20);
app.stage.addChild(scoreText);

// WHY update .text instead of creating new Text objects:
// Creating a new Text object every frame causes garbage collection pressure.
// Mutating .text is cheap — PixiJS detects the change and re-renders next frame.
let score = 0;
function updateScore(delta: number): void {
  score += delta;
  scoreText.text = `Score: ${score}`;  // efficient update
}
```

### Font Loading with Assets

Always load fonts before using them to ensure consistent rendering across browsers:

```typescript
import { Assets, Text, TextStyle } from 'pixi.js';

async function initFonts(): Promise<void> {
  // WHY Assets.add() for fonts: Centralized asset management ensures fonts
  // are loaded before rendering. Prevents invisible text if font isn't ready.
  await Assets.add({ alias: 'comic-sans', src: 'fonts/comic-sans.ttf' });
  await Assets.load('comic-sans');
}

async function setupHUD(): Promise<void> {
  await initFonts();

  const titleStyle = new TextStyle({
    fontFamily: 'comic-sans',  // Now safe to use
    fontSize: 48,
    fill: 0xffaa00,
  });

  const title = new Text({ text: 'Game Over', style: titleStyle });
  app.stage.addChild(title);
}

// Call before any game logic
await setupHUD();
```

### BitmapText for Performance-Critical Displays

For HUDs that update every frame (damage numbers, FPS counter), `BitmapText` is far faster:

```typescript
import { BitmapText, BitmapFont } from 'pixi.js';

// WHY BitmapFont.from(): Generates a bitmap font on the fly if you don't have
// a pre-generated font file. Useful for prototyping. For shipping, pre-generate
// with msdf-bmfont and use the .fnt file.
await BitmapFont.from('Arial', { fontFamily: 'Arial', fontSize: 24 });

// Create floating damage numbers
const damageText = new BitmapText({
  text: '-25',
  style: { fontName: 'Arial', fontSize: 24, fill: 0xff0000 },
});

damageText.position.set(100, 100);
app.stage.addChild(damageText);

// Update with zero allocation overhead
app.ticker.add((time) => {
  damageText.text = Math.floor(currentDamage).toString();
});
```

---

## Building a Basic HUD

A HUD is a fixed-position overlay that sits on top of the game world. The pattern is simple: create a Container, set `eventMode = 'none'` to skip hit testing, and position it at a fixed screen location.

```typescript
import { Container, Text, Graphics, TextStyle } from 'pixi.js';

class HUD {
  private container: Container;
  private scoreText: Text;
  private healthBar: Graphics;
  private healthBg: Graphics;

  constructor(app: Application) {
    // WHY Container as the HUD root: Groups all UI elements so they move together.
    // Setting eventMode = 'none' means the HUD doesn't block input to game objects beneath.
    this.container = new Container();
    this.container.eventMode = 'none';  // Transparent to input; children can override
    app.stage.addChild(this.container);

    // Score display (top-left)
    const scoreStyle = new TextStyle({
      fontFamily: 'Arial',
      fontSize: 20,
      fill: 0xffffff,
    });
    this.scoreText = new Text({ text: 'Score: 0', style: scoreStyle });
    this.scoreText.position.set(20, 20);
    this.container.addChild(this.scoreText);

    // Health bar (top-right)
    // WHY Graphics for the health bar: Drawn procedurally, scales perfectly,
    // easier to animate than sprite-based bars.
    this.healthBg = new Graphics();
    this.healthBg.rect(0, 0, 200, 20);
    this.healthBg.fill(0x333333);  // dark gray background
    this.healthBg.position.set(app.screen.width - 220, 20);
    this.container.addChild(this.healthBg);

    this.healthBar = new Graphics();
    this.healthBar.position.set(app.screen.width - 220, 20);
    this.container.addChild(this.healthBar);

    // Minimap concept (bottom-right)
    // WHY a simple circle for minimap: Demonstrates that UI can be any shape.
    // For real minimaps, render a small scene to a RenderTexture (see performance section).
    const minimapBg = new Graphics();
    minimapBg.circle(0, 0, 80);
    minimapBg.fill(0x1a1a2e);
    minimapBg.stroke({ color: 0x00ff00, width: 2 });
    minimapBg.position.set(app.screen.width - 100, app.screen.height - 100);
    this.container.addChild(minimapBg);
  }

  updateScore(value: number): void {
    this.scoreText.text = `Score: ${value}`;
  }

  updateHealth(current: number, max: number): void {
    const healthPercent = Math.max(0, Math.min(1, current / max));
    const barWidth = 200;

    // WHY clear() before redraw: Graphics doesn't auto-clear.
    // Calling clear() removes the old shapes so we don't draw on top of ourselves.
    this.healthBar.clear();
    this.healthBar.rect(0, 0, barWidth * healthPercent, 20);

    // Color-code the health bar
    const color = healthPercent > 0.5 ? 0x00ff00 : healthPercent > 0.25 ? 0xffff00 : 0xff0000;
    this.healthBar.fill(color);
  }
}

// Usage
const hud = new HUD(app);
app.ticker.add(() => {
  hud.updateScore(gameState.score);
  hud.updateHealth(gameState.health, 100);
});
```

---

## Health Bars and Progress Bars

Progress bars are a core HUD element. This example shows a flexible, reusable progress bar using Graphics:

```typescript
import { Graphics, Container } from 'pixi.js';

class ProgressBar extends Container {
  private background: Graphics;
  private fill: Graphics;
  private width: number;
  private height: number;
  private value: number = 1;

  constructor(width: number = 100, height: number = 20) {
    super();
    this.width = width;
    this.height = height;

    // Background (hollow rectangle)
    this.background = new Graphics();
    this.background.rect(0, 0, width, height);
    this.background.fill(0x333333);
    this.background.stroke({ color: 0x666666, width: 1 });
    this.addChild(this.background);

    // Fill (dynamically sized)
    this.fill = new Graphics();
    this.addChild(this.fill);

    this.draw();
  }

  // WHY separate setValue(): Allows animation libraries (gsap, tween)
  // to smoothly interpolate the bar fill over time.
  setValue(value: number): void {
    this.value = Math.max(0, Math.min(1, value));
    this.draw();
  }

  private draw(): void {
    this.fill.clear();

    const fillWidth = this.width * this.value;

    // Color-code: green → yellow → red
    let color = 0x00ff00;  // healthy (full)
    if (this.value < 0.5) color = 0xffff00;   // warning
    if (this.value < 0.25) color = 0xff0000;  // critical

    this.fill.rect(0, 0, fillWidth, this.height);
    this.fill.fill(color);

    // Optional: Add a highlight for depth
    this.fill.rect(0, 0, fillWidth, this.height * 0.5);
    this.fill.fill(color + 0x444444);  // lighter shade on top
  }
}

// Usage
const healthBar = new ProgressBar(200, 20);
healthBar.position.set(50, 50);
app.stage.addChild(healthBar);

// Animate bar depletion
app.ticker.add(() => {
  const healthPercent = gameState.health / 100;
  healthBar.setValue(healthPercent);
});
```

---

## The @pixi/ui Library

For rapid prototyping or feature-rich UIs, the `@pixi/ui` library provides pre-built components: buttons, scrollbars, checkboxes, sliders, input fields, and more. Install via npm:

```bash
npm install @pixi/ui
```

### Key Components

| Component | Purpose | Example |
|-----------|---------|---------|
| `Button` | Simple button with visual feedback | Play, Cancel, OK |
| `FancyButton` | Button with advanced states (hover, press, disabled) | UI-heavy games |
| `ProgressBar` | Pre-built progress bar | Health, experience, loading |
| `ScrollBox` | Scrollable container for long lists | Inventory, chat |
| `List` | Selectable list (radio buttons) | Menu options, difficulty picker |
| `Input` | Text input field | Name entry, chat input |
| `CheckBox` | Checkbox | Settings (sound on/off) |
| `Slider` | Slider for numeric values | Volume, brightness |
| `Select` | Dropdown selector | Resolution, language |

### FancyButton with Hover and Press States

The most useful component for interactive UIs:

```typescript
import { FancyButton } from '@pixi/ui';
import { Texture } from 'pixi.js';

// Prepare button textures (or use solid colors for prototyping)
const normalTexture = Texture.WHITE;    // solid white for demo
const hoverTexture = Texture.WHITE;     // same, tinted by FancyButton
const pressTexture = Texture.WHITE;     // same, tinted

const playButton = new FancyButton({
  defaultView: normalTexture,
  hoverView: hoverTexture,
  pressedView: pressTexture,

  // Tinting applied to the views
  defaultTint: 0xcccccc,
  hoverTint: 0xeeeeee,
  pressedTint: 0x888888,
  disabledTint: 0x555555,

  // Text label
  text: {
    text: 'Play',
    style: {
      fontSize: 20,
      fill: 0x000000,
    },
  },

  scale: 1,
  width: 120,
  height: 50,
});

playButton.position.set(100, 100);
playButton.onPress.connect(() => startGame());

app.stage.addChild(playButton);
```

### ProgressBar from @pixi/ui

Pre-built progress bar with fewer lines than a custom Graphics version:

```typescript
import { ProgressBar } from '@pixi/ui';

const healthBar = new ProgressBar({
  background: 0x333333,
  fill: 0x00ff00,
  width: 200,
  height: 20,
});

healthBar.value = 0.75;  // Set to 75%
healthBar.position.set(50, 50);
app.stage.addChild(healthBar);

// Animate
app.ticker.add(() => {
  healthBar.value = gameState.health / 100;
});
```

### ScrollBox for Long Lists

Useful for inventory screens, chat logs, or leaderboards:

```typescript
import { ScrollBox, Text } from '@pixi/ui';

const scrollBox = new ScrollBox({
  width: 300,
  height: 400,
  elementsMargin: 4,
});

// Add items
for (let i = 0; i < 50; i++) {
  const item = new Text({
    text: `Item ${i + 1}`,
    style: { fontSize: 16, fill: 0xffffff },
  });
  scrollBox.addChild(item);
}

scrollBox.position.set(100, 100);
app.stage.addChild(scrollBox);
```

---

## Interactive Buttons

Beyond @pixi/ui, you may want to build custom buttons for specific game aesthetics. This pattern composes a Sprite, Text, and pointer events:

```typescript
import { Container, Sprite, Text, TextStyle, FederatedPointerEvent } from 'pixi.js';
import { Texture } from 'pixi.js';

class CustomButton extends Container {
  private sprite: Sprite;
  private label: Text;
  private onClickCallback: (() => void) | null = null;

  constructor(
    texture: Texture,
    labelText: string,
    width: number = 100,
    height: number = 50,
  ) {
    super();

    // WHY eventMode = 'static': Enables pointer event dispatching on this button.
    this.eventMode = 'static';
    this.cursor = 'pointer';

    // Sprite background
    this.sprite = new Sprite(texture);
    this.sprite.width = width;
    this.sprite.height = height;
    this.addChild(this.sprite);

    // Text label (centered)
    const labelStyle = new TextStyle({
      fontFamily: 'Arial',
      fontSize: 18,
      fill: 0xffffff,
    });
    this.label = new Text({ text: labelText, style: labelStyle });
    this.label.anchor.set(0.5);
    this.label.position.set(width / 2, height / 2);
    this.addChild(this.label);

    // Pointer event handlers
    this.on('pointerover', this.onHover.bind(this));
    this.on('pointerout', this.onUnhover.bind(this));
    this.on('pointerdown', this.onPress.bind(this));
    this.on('pointerup', this.onRelease.bind(this));
    this.on('pointertap', this.onClick.bind(this));
  }

  private onHover(): void {
    // WHY tint: Non-destructive way to change sprite color without replacing texture.
    // tint is a multiplication: 0xffffff = no change, 0xaaaaaa = darkened.
    this.sprite.tint = 0xdddddd;
    this.scale.set(1.05);
  }

  private onUnhover(): void {
    this.sprite.tint = 0xffffff;
    this.scale.set(1);
  }

  private onPress(): void {
    // WHY visual feedback on press: Immediate feedback confirms the click registered.
    this.sprite.tint = 0x888888;
    this.scale.set(0.95);
  }

  private onRelease(): void {
    this.sprite.tint = 0xdddddd;
    this.scale.set(1.05);
  }

  private onClick(): void {
    if (this.onClickCallback) {
      this.onClickCallback();
    }
  }

  setClickHandler(callback: () => void): void {
    this.onClickCallback = callback;
  }

  setEnabled(enabled: boolean): void {
    this.eventMode = enabled ? 'static' : 'none';
    this.sprite.tint = enabled ? 0xffffff : 0x666666;
    this.alpha = enabled ? 1 : 0.5;
  }
}

// Usage
const startButton = new CustomButton(buttonTexture, 'Start', 120, 50);
startButton.position.set(app.screen.width / 2 - 60, 300);
startButton.setClickHandler(() => startGame());
app.stage.addChild(startButton);
```

---

## Dialog and Menu Systems

Dialogs and menus are modal overlays that block input to the game beneath. Implement this by:

1. Creating a semi-transparent background that covers the screen
2. Adding the dialog/menu on top
3. Setting `hitArea` and `eventMode = 'static'` on the background to intercept all input

```typescript
import { Container, Graphics, Text, TextStyle } from 'pixi.js';

class PauseMenu {
  private overlay: Graphics;
  private menuContainer: Container;
  private app: Application;

  constructor(app: Application) {
    this.app = app;

    // Semi-transparent background that blocks input
    // WHY hitArea = app.screen: Ensures the overlay captures clicks even outside the menu.
    this.overlay = new Graphics();
    this.overlay.rect(0, 0, app.screen.width, app.screen.height);
    this.overlay.fill({ color: 0x000000, alpha: 0.6 });
    this.overlay.eventMode = 'static';
    this.overlay.hitArea = app.screen;
    this.overlay.on('pointertap', this.onOverlayClick.bind(this));
    app.stage.addChild(this.overlay);

    // Menu container (centered)
    this.menuContainer = new Container();
    this.menuContainer.position.set(
      app.screen.width / 2 - 150,
      app.screen.height / 2 - 150,
    );
    app.stage.addChild(this.menuContainer);

    // Menu background
    const menuBg = new Graphics();
    menuBg.rect(0, 0, 300, 300);
    menuBg.fill(0x2a2a3e);
    menuBg.stroke({ color: 0x00ff00, width: 3 });
    this.menuContainer.addChild(menuBg);

    // Title
    const titleStyle = new TextStyle({
      fontFamily: 'Arial',
      fontSize: 32,
      fill: 0xffffff,
    });
    const title = new Text({ text: 'PAUSED', style: titleStyle });
    title.anchor.set(0.5);
    title.position.set(150, 40);
    this.menuContainer.addChild(title);

    // Resume button
    const resumeBtn = new CustomButton(Texture.WHITE, 'Resume', 200, 50);
    resumeBtn.position.set(50, 120);
    resumeBtn.setClickHandler(() => this.hide());
    this.menuContainer.addChild(resumeBtn);

    // Quit button
    const quitBtn = new CustomButton(Texture.WHITE, 'Quit', 200, 50);
    quitBtn.position.set(50, 200);
    quitBtn.setClickHandler(() => goToMainMenu());
    this.menuContainer.addChild(quitBtn);

    this.hide();
  }

  show(): void {
    this.overlay.visible = true;
    this.menuContainer.visible = true;
    this.app.ticker.stop();  // Pause game loop
  }

  hide(): void {
    this.overlay.visible = false;
    this.menuContainer.visible = false;
    this.app.ticker.start();  // Resume game loop
  }

  private onOverlayClick(): void {
    // Clicking outside the menu also closes it (common UX pattern)
    this.hide();
  }
}

// Usage
const pauseMenu = new PauseMenu(app);

document.addEventListener('keydown', (e) => {
  if (e.code === 'Escape') {
    pauseMenu.show();
  }
});
```

---

## Responsive UI

Games run at many screen sizes. Responsive UI adapts to window resize and device orientation. PixiJS Application has built-in `resizeTo` support; wire your UI to reposition when the screen changes:

```typescript
import { Application } from 'pixi.js';

class ResponsiveHUD {
  private hud: Container;
  private app: Application;

  constructor(app: Application) {
    this.app = app;
    this.hud = new Container();
    app.stage.addChild(this.hud);

    // WHY reposition on resize: Window can be resized or device can rotate.
    // Listening to the resize event keeps UI anchored to screen edges.
    window.addEventListener('resize', () => this.reposition());
    this.reposition();
  }

  private reposition(): void {
    const { width, height } = this.app.screen;

    // Score in top-left
    const scoreText = this.hud.getChildAt(0);
    scoreText.position.set(20, 20);

    // Health bar in top-right
    const healthBar = this.hud.getChildAt(1);
    healthBar.position.set(width - 220, 20);

    // Minimap in bottom-right
    const minimap = this.hud.getChildAt(2);
    minimap.position.set(width - 120, height - 120);

    // Pause button in top-center
    const pauseBtn = this.hud.getChildAt(3);
    pauseBtn.position.set(width / 2 - 30, 20);
  }
}
```

For more complex responsive layouts (e.g., scaling elements based on screen width), consider a responsive grid system or use CSS Media Queries if your game is in an HTML container.

---

## Performance Tips

UI can become a bottleneck if not optimized. Here are key strategies:

### Use BitmapText for Frequent Updates

Text that changes every frame (FPS counter, damage numbers) should be BitmapText:

```typescript
import { BitmapText, BitmapFont } from 'pixi.js';

let frameCount = 0;
const fpsText = new BitmapText({
  text: 'FPS: 60',
  style: { fontName: 'Arial', fontSize: 16, fill: 0x00ff00 },
});

app.ticker.add(() => {
  frameCount++;
  if (frameCount % 10 === 0) {
    // Only update every 10 frames to smooth out FPS display
    const fps = Math.round(app.ticker.FPS);
    fpsText.text = `FPS: ${fps}`;
  }
});
```

### Cache Static UI to RenderTexture

For complex static UI (backgrounds, frames, borders that don't animate), render once to a texture and reuse:

```typescript
import { RenderTexture, Container, Sprite } from 'pixi.js';

// Create complex static UI
const staticUI = new Container();
const bg = new Graphics();
bg.rect(0, 0, 300, 200);
bg.fill(0x2a2a3e);
staticUI.addChild(bg);

// ... add many decorative elements ...

// Render to a texture (caching)
const uiTexture = RenderTexture.create({ width: 300, height: 200 });
app.renderer.render(staticUI, { renderTexture: uiTexture });

// Now use the cached texture instead of redrawing
const cachedUI = new Sprite(uiTexture);
cachedUI.position.set(50, 50);
app.stage.addChild(cachedUI);

// Remove the original complex container (no longer needed)
app.stage.removeChild(staticUI);
```

### Minimize Draw Calls

Each unique texture, shader, or blend mode triggers a draw call. Batch related elements:

```typescript
// GOOD: One container with 10 sprites using the same texture
const batch = new Container();
for (let i = 0; i < 10; i++) {
  const sprite = new Sprite(commonTexture);
  sprite.position.set(i * 50, 0);
  batch.addChild(sprite);
}

// BAD: 10 separate textures or shaders trigger 10 draw calls
for (let i = 0; i < 10; i++) {
  const sprite = new Sprite(differentTextures[i]);
  app.stage.addChild(sprite);  // each on separate draw call
}
```

### Visibility Over Removal

Instead of repeatedly adding/removing UI elements (which reallocates memory), toggle visibility:

```typescript
// GOOD: Reuse same Text object
const tooltip = new Text({ text: '', style: tooltipStyle });
tooltip.visible = false;
app.stage.addChild(tooltip);

function showTooltip(text: string): void {
  tooltip.text = text;
  tooltip.visible = true;
}

function hideTooltip(): void {
  tooltip.visible = false;
}

// BAD: Allocates new Text every time
function showTooltipBad(text: string): void {
  const newTooltip = new Text({ text, style: tooltipStyle });
  app.stage.addChild(newTooltip);
  // ...later remove it...
}
```

---

## Cross-Framework Comparison

How PixiJS UI compares to other popular 2D frameworks:

| Feature | PixiJS | Phaser | Kaplay | Excalibur |
|---------|--------|--------|--------|-----------|
| Built-in UI components | No (optional @pixi/ui) | Yes (UI Plugin) | Yes (add() + ui()) | Yes (ScreenElement) |
| Text rendering | `Text` class | Game Object | `text()` | Built-in |
| Progress bars | Manual or @pixi/ui | Tween-based shapes | Built-in | Built-in |
| Buttons | Manual or @pixi/ui | Built-in `setInteractive()` | Built-in `onClick()` | Built-in `ScreenElement` |
| Dialog/modals | Manual (compose) | Manual (compose) | Manual (compose) | Manual (compose) |
| Responsive sizing | Manual | Manual | Manual | Manual (via properties) |
| Performance (cached UI) | RenderTexture | N/A | N/A | N/A |
| Customization level | Maximal | Moderate | Moderate | Moderate |

**Summary:** PixiJS gives you maximum flexibility at the cost of building more yourself. Phaser, Kaplay, and Excalibur come with more opinionated UI systems. For custom game aesthetics or when you need pixel-perfect control, PixiJS is unbeatable. For rapid prototyping, the @pixi/ui library brings it closer to Phaser's convenience.

---

## Key Takeaways

1. **Choose the right Text class.** Use `Text` for most HUDs, `BitmapText` for high-frequency updates, and `HTMLText` only when you need rich markup.
2. **Layer UI in Containers.** Build menus and HUDs by composing Containers, Sprites, and Graphics. A single Container as the HUD root makes positioning trivial.
3. **Set eventMode intentionally.** Use `'static'` for interactive elements, `'none'` for the HUD background (unless it's clickable), and `'passive'` on container groups.
4. **Cache static UI.** For complex, unchanging UI (borders, frames, backgrounds), render once to a RenderTexture and display as a sprite.
5. **Use @pixi/ui for rapid iteration.** Components like `FancyButton`, `ProgressBar`, and `ScrollBox` save time. For polished games, build custom buttons to match your art style.
6. **Handle resize reactively.** Listen for window resize and reposition anchored UI elements (score in corner, minimap at edge).
7. **Profile and optimize.** Use `app.ticker.FPS` to monitor performance. Excessive Text objects, multiple RenderTexture renders per frame, or unculled UI can tank frame rates.
