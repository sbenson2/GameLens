# G8 — Excalibur UI & HUD Systems

> **Category:** guide · **Engine:** Excalibur · **Related:** [E1 Architecture Overview](../architecture/E1_architecture_overview.md) · [G1 Actors & Entities](G1_actors_and_entities.md) · [G2 Scene Management](G2_scene_management.md) · [G4 Input Handling](G4_input_handling.md) · [G5 Sprites & Animation](G5_sprites_and_animation.md)

---

## Overview

Excalibur offers two complementary UI approaches for building HUDs, menus, and interactive screens:

1. **In-Canvas UI** — `ScreenElement` and `Label` actors that render directly on the game canvas. Fast, integrated with the game loop, best for real-time HUDs (scores, health bars, timers). These actors use screen coordinates (fixed position) rather than world coordinates.

2. **HTML/CSS Overlays** — HTML elements positioned over the canvas using the DOM. Powerful for complex menus, dialogs, and inventory systems. Can integrate frameworks (React, Vue, Svelte) for sophisticated UI state management. Recommended for most menu systems.

This guide covers both approaches, practical patterns for HUDs and menus, and when to use each.

---

## ScreenElement Basics

`ScreenElement` extends `Actor` but uses screen coordinates instead of world coordinates. It stays fixed on screen regardless of camera position—ideal for HUD elements.

### Creating a ScreenElement

```typescript
import { ScreenElement, Engine, ex } from 'excalibur';

// ScreenElement at screen position (50, 50) with width/height
const scoreDisplay = new ScreenElement({
  x: 50,           // screen x, not world x
  y: 50,           // screen y, not world y
  width: 200,
  height: 40
});

// Add to scene like any actor
scene.add(scoreDisplay);

// ScreenElement also supports all Actor properties:
scoreDisplay.scale = new ex.Vector(1.2, 1.2);
scoreDisplay.rotation = 0.1;
scoreDisplay.opacity = 0.9;
```

Key difference from regular Actors:
- **Regular Actor**: `pos` is in world coordinates; moves with camera.
- **ScreenElement**: `x` and `y` are in screen/viewport coordinates; always stays at the same screen position.

### Graphics on ScreenElements

Assign graphics like any actor. Images and sprites render in their anchor position:

```typescript
const healthBarBg = new ScreenElement({
  x: 10,
  y: 10,
  width: 200,
  height: 20
});

// Draw a rectangle background
healthBarBg.graphics.add(
  new ex.Graphics.Rectangle({
    width: 200,
    height: 20,
    color: ex.Color.Black
  })
);

scene.add(healthBarBg);
```

---

## Labels & Text

The `Label` actor is the simplest way to render text on screen. It extends `Actor` so you can treat it like any other actor, but it displays text instead of a sprite.

### Basic Label

```typescript
import { Label, Font, ex } from 'excalibur';

const scoreLabel = new Label({
  text: 'Score: 0',
  pos: ex.vec(50, 50),
  font: new Font({
    family: 'Arial, sans-serif',
    size: 24,
    unit: 'px',
    color: ex.Color.White,
    textAlign: 'left',      // 'left' | 'center' | 'right'
    baseAlign: 'middle'     // 'top' | 'middle' | 'bottom'
  })
});

scene.add(scoreLabel);
```

### Font Properties

The `Font` class controls text rendering:

| Property | Purpose | Example |
|----------|---------|---------|
| `family` | Font stack (CSS-style) | `'Arial, sans-serif'` |
| `size` | Font size | `24` |
| `unit` | Size unit | `'px'` (default) or `'em'` |
| `color` | Text color | `ex.Color.White` |
| `textAlign` | Horizontal alignment | `'left'` \| `'center'` \| `'right'` |
| `baseAlign` | Vertical alignment | `'top'` \| `'middle'` \| `'bottom'` |
| `bold` | Bold text | `true` \| `false` |
| `italic` | Italic text | `true` \| `false` |
| `shadow` | Drop shadow | `{ offset: ex.vec(2, 2), color: ex.Color.Black }` |

### Dynamic Text Updates

Update label text each frame for scores, timers, and resource counts:

```typescript
class ScoreManager {
  private score = 0;
  private scoreLabel!: Label;

  constructor(scene: Scene) {
    this.scoreLabel = new Label({
      text: `Score: ${this.score}`,
      pos: ex.vec(50, 50),
      font: new Font({ size: 28, color: ex.Color.White })
    });
    scene.add(this.scoreLabel);
  }

  addPoints(amount: number): void {
    this.score += amount;
    // Update text immediately
    this.scoreLabel.text = `Score: ${this.score}`;
  }
}
```

### SpriteFont (Bitmap Fonts)

For games with a specific art style, use `SpriteFont` — a bitmap-based font rendered from a sprite sheet. This is more performant than system fonts when text updates frequently:

```typescript
import { SpriteFont } from 'excalibur';

// Create a SpriteFont from a character map image
const pixelFont = new SpriteFont({
  image: fontSheetImage,      // ImageSource
  baseWidth: 8,               // width of each character in pixels
  baseHeight: 16,
  caseInsensitive: true,
  colors: {
    // map character ranges to sprite positions
    A: { x: 0, y: 0 },
    B: { x: 8, y: 0 },
    // ... etc
  }
});

// Use SpriteFont text
const pixelLabel = new Label({
  text: 'GAME OVER',
  font: pixelFont,
  pos: ex.vec(400, 300)
});
```

SpriteFont is ideal when:
- Text updates every frame (scores, timers, unit counts).
- You want pixel-art consistency with the game art style.
- You need exact control over character appearance.

---

## Building a Basic HUD

A complete HUD combines ScreenElements and Labels for score, health, ammo, and other stats.

```typescript
class HUD extends ScreenElement {
  private scoreLabel!: Label;
  private healthLabel!: Label;
  private ammoLabel!: Label;
  private healthBar!: ScreenElement;

  onInitialize(engine: Engine): void {
    // Score in top-left
    this.scoreLabel = new Label({
      text: 'Score: 0',
      pos: ex.vec(20, 20),
      font: new Font({
        size: 20,
        color: ex.Color.White,
        family: 'monospace'
      })
    });
    engine.currentScene.add(this.scoreLabel);

    // Health bar background (dark)
    const healthBgBar = new ScreenElement({
      x: 20,
      y: 60,
      width: 200,
      height: 20
    });
    healthBgBar.graphics.add(
      new ex.Graphics.Rectangle({
        width: 200,
        height: 20,
        color: ex.Color.DarkGray
      })
    );
    engine.currentScene.add(healthBgBar);

    // Health bar foreground (green/red, animates)
    this.healthBar = new ScreenElement({
      x: 20,
      y: 60,
      width: 200,  // Will shrink as health decreases
      height: 20
    });
    this.healthBar.graphics.add(
      new ex.Graphics.Rectangle({
        width: 200,
        height: 20,
        color: ex.Color.Green
      })
    );
    engine.currentScene.add(this.healthBar);

    // Health text label
    this.healthLabel = new Label({
      text: 'Health: 100/100',
      pos: ex.vec(230, 65),
      font: new Font({
        size: 14,
        color: ex.Color.White,
        baseAlign: 'middle'
      })
    });
    engine.currentScene.add(this.healthLabel);

    // Ammo counter top-right
    this.ammoLabel = new Label({
      text: 'Ammo: 30',
      pos: ex.vec(engine.drawWidth - 150, 20),
      font: new Font({
        size: 20,
        color: ex.Color.Yellow,
        textAlign: 'right'
      })
    });
    engine.currentScene.add(this.ammoLabel);
  }

  updateHealth(current: number, max: number): void {
    const percent = current / max;
    // Shrink bar width based on health percentage
    this.healthBar.width = 200 * percent;

    // Change color thresholds: green → yellow → red
    let color = ex.Color.Green;
    if (percent < 0.33) color = ex.Color.Red;
    else if (percent < 0.66) color = ex.Color.Yellow;

    this.healthBar.graphics.clear();
    this.healthBar.graphics.add(
      new ex.Graphics.Rectangle({
        width: 200 * percent,
        height: 20,
        color: color
      })
    );

    this.healthLabel.text = `Health: ${current}/${max}`;
  }

  updateScore(score: number): void {
    this.scoreLabel.text = `Score: ${score}`;
  }

  updateAmmo(ammo: number): void {
    this.ammoLabel.text = `Ammo: ${ammo}`;
  }
}
```

---

## Health Bars & Progress Bars

Progress bars animate in response to gameplay events. Animate width changes smoothly to create visual feedback:

```typescript
class AnimatedHealthBar extends ScreenElement {
  private targetWidth = 200;
  private currentWidth = 200;
  private animationSpeed = 200;  // pixels per second

  onInitialize(engine: Engine): void {
    this.graphics.add(
      new ex.Graphics.Rectangle({
        width: this.currentWidth,
        height: 20,
        color: ex.Color.Green
      })
    );
  }

  onPreUpdate(engine: Engine, delta: number): void {
    // Smoothly animate to target width
    const diff = this.targetWidth - this.currentWidth;
    if (Math.abs(diff) > 0.5) {
      const step = Math.sign(diff) * this.animationSpeed * (delta / 1000);
      this.currentWidth += step;
    } else {
      this.currentWidth = this.targetWidth;
    }

    // Redraw with current width
    this.graphics.clear();

    // Determine color based on health percentage
    const healthPercent = this.currentWidth / 200;
    let color = ex.Color.Green;
    if (healthPercent < 0.33) color = ex.Color.Red;
    else if (healthPercent < 0.66) color = ex.Color.Yellow;

    this.graphics.add(
      new ex.Graphics.Rectangle({
        width: this.currentWidth,
        height: 20,
        color: color
      })
    );
  }

  setHealth(current: number, max: number): void {
    // Calculate target width (0–200 pixels)
    this.targetWidth = (current / max) * 200;
  }
}
```

---

## Interactive UI Elements

ScreenElements support pointer events (mouse + touch). Use these to build clickable buttons and interactive HUD elements.

### Pointer Events on Actors

```typescript
import { PointerScope } from 'excalibur';

class Button extends ScreenElement {
  private isHovered = false;

  onInitialize(engine: Engine): void {
    // Draw button background
    this.graphics.add(
      new ex.Graphics.Rectangle({
        width: this.width,
        height: this.height,
        color: ex.Color.Blue
      })
    );

    // Listen for pointer events
    this.on('pointerenter', () => {
      this.isHovered = true;
      this.scale = new ex.Vector(1.1, 1.1);  // Grow on hover
    });

    this.on('pointerleave', () => {
      this.isHovered = false;
      this.scale = new ex.Vector(1.0, 1.0);  // Shrink back
    });

    // pointerdown fires on click/touch start
    this.on('pointerdown', () => {
      console.log('Button pressed!');
      this.scale = new ex.Vector(0.95, 0.95);  // Shrink on click
    });

    // pointerup fires on click/touch release
    this.on('pointerup', () => {
      console.log('Button released!');
      this.onButtonClicked();
    });
  }

  private onButtonClicked(): void {
    // Execute button action
  }
}

// Add button to scene
const startButton = new Button({
  x: 400,
  y: 500,
  width: 120,
  height: 40
});
scene.add(startButton);
```

### Important: PointerScope

By default, Excalibur captures all pointer input at the canvas level. To avoid consuming all mouse events, set `PointerScope.Canvas` on the engine:

```typescript
const game = new Engine({
  width: 800,
  height: 600,
  pointerScope: ex.PointerScope.Canvas  // Events only fire on canvas
});
```

Without this, clicks on your game canvas won't reach other DOM elements (like HTML buttons or form inputs).

### Building a Button Component

```typescript
type ButtonCallback = () => void;

class UIButton extends ScreenElement {
  private callback: ButtonCallback;
  private label!: Label;
  private normalColor: ex.Color;
  private hoverColor: ex.Color;

  constructor(config: {
    x: number;
    y: number;
    width: number;
    height: number;
    text: string;
    callback: ButtonCallback;
  }) {
    super({ x: config.x, y: config.y, width: config.width, height: config.height });
    this.callback = config.callback;
    this.normalColor = ex.Color.Blue;
    this.hoverColor = ex.Color.Cyan;

    // Create label
    this.label = new Label({
      text: config.text,
      font: new Font({
        size: 16,
        color: ex.Color.White
      })
    });
  }

  onInitialize(engine: Engine): void {
    // Draw button background
    this.redraw(this.normalColor);

    // Center label on button
    this.label.pos = ex.vec(
      this.x + this.width / 2,
      this.y + this.height / 2
    );
    this.label.graphics.anchor = new ex.Vector(0.5, 0.5);
    engine.currentScene.add(this.label);

    this.on('pointerenter', () => this.redraw(this.hoverColor));
    this.on('pointerleave', () => this.redraw(this.normalColor));

    this.on('pointerup', () => {
      this.callback();
    });
  }

  private redraw(color: ex.Color): void {
    this.graphics.clear();
    this.graphics.add(
      new ex.Graphics.Rectangle({
        width: this.width,
        height: this.height,
        color: color,
        strokeColor: ex.Color.White,
        lineWidth: 2
      })
    );
  }
}
```

---

## HTML/CSS UI Overlay

For complex menus, dialogs, and inventory systems, render HTML elements over the canvas. This is the recommended approach for:
- Pause menus with multiple buttons
- Settings dialogs
- Inventory or shop UIs
- Large text areas or form inputs
- Animations via CSS or framework libraries

### Basic Pattern

```typescript
// game.ts
const game = new Engine({
  width: 800,
  height: 600
});

// Create HTML overlay container
const uiContainer = document.createElement('div');
uiContainer.id = 'game-ui';
document.body.appendChild(uiContainer);

// Position absolutely over the canvas
uiContainer.style.cssText = `
  position: absolute;
  top: 0;
  left: 0;
  width: ${game.drawWidth}px;
  height: ${game.drawHeight}px;
  pointer-events: auto;
  z-index: 100;
`;

// Create pause menu
const pauseMenu = document.createElement('div');
pauseMenu.innerHTML = `
  <div style="
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    background: black;
    padding: 40px;
    border: 2px solid white;
    text-align: center;
  ">
    <h2 style="color: white; margin: 0 0 20px 0">PAUSED</h2>
    <button id="resume-btn" style="
      padding: 10px 20px;
      font-size: 16px;
      margin: 10px;
    ">Resume</button>
    <button id="quit-btn" style="
      padding: 10px 20px;
      font-size: 16px;
      margin: 10px;
    ">Quit</button>
  </div>
`;
pauseMenu.style.display = 'none';
uiContainer.appendChild(pauseMenu);

// Handle pause state
let isPaused = false;

document.getElementById('resume-btn')?.addEventListener('click', () => {
  isPaused = false;
  pauseMenu.style.display = 'none';
  game.resume();
});

document.getElementById('quit-btn')?.addEventListener('click', () => {
  // Handle quit
});

game.input.keyboard.on('press', (event) => {
  if (event.key === Keys.Escape) {
    isPaused = !isPaused;
    pauseMenu.style.display = isPaused ? 'block' : 'none';
    if (isPaused) game.pause();
  }
});
```

### Syncing Game State to HTML

Update HTML UI when game state changes:

```typescript
class GameManager {
  private htmlScore: HTMLElement;
  private htmlHealth: HTMLElement;

  constructor() {
    this.htmlScore = document.getElementById('score')!;
    this.htmlHealth = document.getElementById('health')!;
  }

  updateScore(score: number): void {
    this.htmlScore.textContent = `Score: ${score}`;
  }

  updateHealth(current: number, max: number): void {
    this.htmlHealth.style.width = `${(current / max) * 100}%`;
  }
}
```

---

## Dialog & Menu Systems

Combine HTML overlays with in-canvas elements for rich menu systems. Use a state machine to manage menu transitions:

```typescript
type MenuState = 'hidden' | 'main' | 'settings' | 'inventory';

class MenuManager {
  private currentState: MenuState = 'hidden';
  private mainMenu!: HTMLElement;
  private settingsMenu!: HTMLElement;
  private inventoryMenu!: HTMLElement;

  constructor(private game: Engine) {
    this.createMenus();
    this.attachEventListeners();
  }

  private createMenus(): void {
    const container = document.getElementById('game-ui')!;

    this.mainMenu = document.createElement('div');
    this.mainMenu.innerHTML = `
      <div class="menu">
        <h2>Main Menu</h2>
        <button id="continue-btn">Continue</button>
        <button id="settings-btn">Settings</button>
        <button id="quit-btn">Quit Game</button>
      </div>
    `;
    this.mainMenu.style.display = 'none';
    container.appendChild(this.mainMenu);

    this.settingsMenu = document.createElement('div');
    this.settingsMenu.innerHTML = `
      <div class="menu">
        <h2>Settings</h2>
        <label>
          <input type="range" id="volume" min="0" max="100" value="70">
          Volume
        </label>
        <button id="back-btn">Back</button>
      </div>
    `;
    this.settingsMenu.style.display = 'none';
    container.appendChild(this.settingsMenu);
  }

  private attachEventListeners(): void {
    document.getElementById('continue-btn')?.addEventListener('click', () => {
      this.setState('hidden');
      this.game.resume();
    });

    document.getElementById('settings-btn')?.addEventListener('click', () => {
      this.setState('settings');
    });

    document.getElementById('back-btn')?.addEventListener('click', () => {
      this.setState('main');
    });
  }

  setState(newState: MenuState): void {
    // Hide all menus
    this.mainMenu.style.display = 'none';
    this.settingsMenu.style.display = 'none';

    this.currentState = newState;

    // Show the new state's menu
    switch (newState) {
      case 'main':
        this.mainMenu.style.display = 'block';
        break;
      case 'settings':
        this.settingsMenu.style.display = 'block';
        break;
      case 'hidden':
        // All menus hidden
        break;
    }
  }
}
```

---

## Responsive UI

Handle window resizing and different screen sizes. Excalibur provides `DisplayMode` options for scaling and a `resize` event for responsive layout:

```typescript
const game = new Engine({
  width: 1280,
  height: 720,
  displayMode: ex.DisplayMode.FitContainer  // Fit canvas to parent
});

game.screen.events.on('resize', (event) => {
  console.log(`Screen resized to ${event.resolution.width}x${event.resolution.height}`);

  // Reposition HUD elements
  repositionHUD(event.resolution);
});

function repositionHUD(resolution: ex.Vector): void {
  // Move UI elements that depend on screen size
  scoreLabel.x = 20;
  scoreLabel.y = 20;

  ammoLabel.x = resolution.width - 150;
  ammoLabel.y = 20;
}
```

### Display Mode Options

| Mode | Behavior |
|------|----------|
| `Fixed` | Canvas is fixed size; no scaling |
| `FillContainer` | Canvas fills parent; may distort aspect ratio |
| `FitContainer` | Canvas fits in parent; maintains aspect ratio with letterbox/pillarbox |
| `FitScreen` | Canvas fits viewport; maintains aspect ratio |

---

## Cross-Framework Comparison

| Framework | Built-in UI | Notes |
|-----------|------------|-------|
| **Excalibur** | ScreenElement + Label | Simple overlay, good for HUDs; use HTML for complex menus |
| **Phaser 3** | Text + Graphics | Integrated scene graphs; Phaser.UI components available |
| **PixiJS** | @pixi/ui plugin | Requires separate plugin; strong for performance |
| **Kaplay** | add.text() + scenes | Built-in text and button primitives; fast iteration |

Excalibur's approach separates concerns: simple HUD via canvas, complex menus via HTML. This keeps frame rendering fast while leveraging HTML/CSS for UI flexibility.

---

## Best Practices

1. **Use ScreenElement for HUDs** — Position at screen coordinates; updates stay fast.
2. **Use Label for real-time stats** — Prefer SpriteFont if text updates every frame.
3. **Use HTML overlays for menus** — Pause, settings, inventory. Leverage CSS and frameworks.
4. **Manage PointerScope** — Set `PointerScope.Canvas` so clicks reach HTML buttons.
5. **Animate bar widths, not scale** — Smoother visual feedback for health/progress.
6. **Listen for resize events** — Reposition UI when window size changes.
7. **Separate HUD from game state** — Keep a UI manager that subscribes to game events.
8. **Test on mobile** — Touch events work automatically but finger size matters; make buttons at least 40×40px.
