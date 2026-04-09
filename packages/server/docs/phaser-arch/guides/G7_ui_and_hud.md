# UI and HUD Systems

> **Category:** guide · **Engine:** Phaser · **Related:** [Scene Lifecycle](G1_scene_lifecycle.md), [Sprites and Animation](G4_sprites_and_animation.md), [Architecture Overview](../architecture/E1_architecture_overview.md)

Phaser provides three complementary approaches for building game UI: canvas-rendered game objects (Text, BitmapText, Containers), HTML DOM elements overlaid on the canvas, and the community rexUI plugin for pre-built widget layouts. This guide covers all three approaches and common HUD patterns like health bars, score displays, dialog boxes, and menus.

---

## Canvas-Based UI (Game Objects)

The most common approach: use Phaser's built-in game objects for HUD elements. They render on the canvas alongside your game, respond to cameras, and integrate with the scene graph.

### Text

Standard text uses the browser's Canvas 2D text rendering. It supports web fonts but re-rasterizes every time the string changes, which can be expensive for rapidly updating text (e.g., timers).

```typescript
class HudScene extends Phaser.Scene {
  private scoreText!: Phaser.GameObjects.Text;

  create(): void {
    // Basic text — positioned in screen space via setScrollFactor
    this.scoreText = this.add.text(16, 16, 'Score: 0', {
      fontFamily: 'Arial',
      fontSize: '24px',
      color: '#ffffff',
      stroke: '#000000',
      strokeThickness: 4,
    });

    // Fix to screen so it doesn't scroll with the camera
    this.scoreText.setScrollFactor(0);

    // Set a high depth so it renders above game objects
    this.scoreText.setDepth(100);
  }

  updateScore(value: number): void {
    this.scoreText.setText(`Score: ${value}`);
  }
}
```

### BitmapText

For text that updates frequently (score counters, damage numbers, timers), BitmapText is significantly faster because glyphs are pre-rendered in a texture atlas. No re-rasterization on each change.

```typescript
preload(): void {
  // Load a bitmap font — requires an XML/JSON font file and a texture
  this.load.bitmapFont('pixelfont', 'assets/fonts/pixel.png', 'assets/fonts/pixel.xml');
}

create(): void {
  // BitmapText renders from a pre-built glyph atlas — very fast updates
  const timer = this.add.bitmapText(400, 16, 'pixelfont', '00:00', 32);
  timer.setScrollFactor(0);
  timer.setDepth(100);

  // Align center (BitmapText origin defaults to top-left)
  timer.setOrigin(0.5, 0);
}
```

**When to use which:**

- **Text:** Prototyping, any text that rarely changes, or when you need web font support.
- **BitmapText:** Score counters, timers, damage numbers — anything that updates multiple times per second.

### Containers for Composite UI

`Phaser.GameObjects.Container` groups multiple game objects under a single transform. Use containers for compound UI elements like labeled buttons or stat panels.

```typescript
create(): void {
  // A button built from a background image and centered text
  const bg = this.add.rectangle(0, 0, 200, 50, 0x333333, 0.8)
    .setStrokeStyle(2, 0xffffff);
  const label = this.add.text(0, 0, 'Start Game', {
    fontFamily: 'Arial',
    fontSize: '20px',
    color: '#ffffff',
  }).setOrigin(0.5);

  const button = this.add.container(400, 300, [bg, label]);
  button.setSize(200, 50); // required for input hit area
  button.setInteractive();
  button.setScrollFactor(0);
  button.setDepth(100);

  button.on('pointerover', () => bg.setFillStyle(0x555555));
  button.on('pointerout', () => bg.setFillStyle(0x333333));
  button.on('pointerdown', () => this.scene.start('GameScene'));
}
```

**Container limitations:**

- Nested containers work but can be tricky with input hit areas.
- Containers do not clip children — overflow is visible. For scrollable panels, use a camera or mask.
- Each child's position is relative to the container origin.

---

## Health Bars and Progress Indicators

Health bars are one of the most common HUD elements. Build them with Graphics objects for full control over shape and color.

### Simple Health Bar

```typescript
class HealthBar {
  private bar: Phaser.GameObjects.Graphics;
  private maxHP: number;
  private currentHP: number;
  private x: number;
  private y: number;
  private width: number;
  private height: number;

  constructor(scene: Phaser.Scene, x: number, y: number, maxHP: number) {
    this.bar = scene.add.graphics();
    this.bar.setScrollFactor(0);
    this.bar.setDepth(100);
    this.x = x;
    this.y = y;
    this.width = 200;
    this.height = 20;
    this.maxHP = maxHP;
    this.currentHP = maxHP;
    this.draw();
  }

  setHP(value: number): void {
    this.currentHP = Phaser.Math.Clamp(value, 0, this.maxHP);
    this.draw();
  }

  private draw(): void {
    this.bar.clear();

    // Background
    this.bar.fillStyle(0x222222, 0.8);
    this.bar.fillRect(this.x, this.y, this.width, this.height);

    // Health fill — color shifts from green to red
    const ratio = this.currentHP / this.maxHP;
    const color = ratio > 0.5 ? 0x00ff00 : ratio > 0.25 ? 0xffaa00 : 0xff0000;
    this.bar.fillStyle(color, 1);
    this.bar.fillRect(this.x, this.y, this.width * ratio, this.height);

    // Border
    this.bar.lineStyle(2, 0xffffff, 1);
    this.bar.strokeRect(this.x, this.y, this.width, this.height);
  }

  destroy(): void {
    this.bar.destroy();
  }
}
```

### Entity Health Bar (Follows a Sprite)

For health bars above enemies or NPCs, position them relative to the game object rather than fixed on screen:

```typescript
class EnemyHealthBar {
  private bar: Phaser.GameObjects.Graphics;
  private target: Phaser.GameObjects.Sprite;
  private maxHP: number;
  private currentHP: number;

  constructor(scene: Phaser.Scene, target: Phaser.GameObjects.Sprite, maxHP: number) {
    this.bar = scene.add.graphics();
    this.bar.setDepth(target.depth + 1);
    this.target = target;
    this.maxHP = maxHP;
    this.currentHP = maxHP;
  }

  update(): void {
    // Call this from the scene's update() loop
    this.bar.clear();
    const width = 40;
    const height = 4;
    const x = this.target.x - width / 2;
    const y = this.target.y - this.target.displayHeight / 2 - 8;

    // Background
    this.bar.fillStyle(0x000000, 0.6);
    this.bar.fillRect(x, y, width, height);

    // Fill
    const ratio = this.currentHP / this.maxHP;
    this.bar.fillStyle(ratio > 0.5 ? 0x00ff00 : 0xff0000, 1);
    this.bar.fillRect(x, y, width * ratio, height);
  }
}
```

---

## DOM Element UI

Phaser can host HTML elements on top of the canvas. This is useful for complex UI that benefits from standard HTML/CSS: text inputs, styled menus, or forms.

### Enabling DOM Elements

The game config must enable the DOM container:

```typescript
const config: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  width: 800,
  height: 600,
  dom: {
    createContainer: true, // required — creates a div over the canvas
  },
  scene: [GameScene, UIScene],
};
```

### Creating DOM Elements

```typescript
create(): void {
  // Create from an HTML string
  const nameInput = this.add.dom(400, 300).createFromHTML(`
    <div style="background: rgba(0,0,0,0.8); padding: 20px; border-radius: 8px;">
      <input type="text" id="playerName" placeholder="Enter name"
        style="font-size: 18px; padding: 8px; width: 200px;" />
      <button id="submitBtn"
        style="font-size: 18px; padding: 8px 16px; margin-left: 8px; cursor: pointer;">
        OK
      </button>
    </div>
  `);

  // Listen for native DOM events via addListener
  nameInput.addListener('click');
  nameInput.on('click', (event: Event) => {
    const target = event.target as HTMLElement;
    if (target.id === 'submitBtn') {
      const input = document.getElementById('playerName') as HTMLInputElement;
      console.log('Player name:', input.value);
      nameInput.destroy();
    }
  });
}
```

### Referencing Existing HTML

You can also reference an element already in your page's HTML:

```typescript
// In your HTML: <div id="inventory-panel" style="display:none;">...</div>
create(): void {
  const panel = this.add.dom(400, 300).createFromCache('inventory-panel');
  // Or reference by existing element:
  // const el = document.getElementById('inventory-panel')!;
  // const panel = this.add.dom(400, 300, el);
}
```

**DOM element caveats:**

- DOM elements sit on top of the canvas — they cannot be rendered behind game objects.
- `setInteractive()` does not work; use `addListener()` for native events.
- Nesting inside Phaser Containers works only one level deep.
- Phaser handles positioning and depth, but CSS styling is fully in your control.
- Mobile keyboard pop-up when using `<input>` may resize the viewport — test thoroughly.

---

## Dedicated HUD Scene (Overlay Pattern)

The recommended pattern for UI is a separate scene rendered on top of the game scene. This keeps HUD logic isolated from gameplay and prevents camera movement from affecting UI positions.

```typescript
class GameScene extends Phaser.Scene {
  constructor() { super('GameScene'); }

  create(): void {
    // Launch the HUD as a parallel scene rendered above this one
    this.scene.launch('HudScene');

    // Send data to the HUD via events
    this.events.on('scoreChanged', (score: number) => {
      this.scene.get('HudScene').events.emit('updateScore', score);
    });
  }
}

class HudScene extends Phaser.Scene {
  private scoreText!: Phaser.GameObjects.BitmapText;

  constructor() { super('HudScene'); }

  create(): void {
    this.scoreText = this.add.bitmapText(16, 16, 'pixelfont', 'Score: 0', 24);

    // Listen for updates from the game scene
    const gameScene = this.scene.get('GameScene');
    gameScene.events.on('scoreChanged', (score: number) => {
      this.scoreText.setText(`Score: ${score}`);
    });

    // Clean up listener when HUD scene shuts down
    this.events.on('shutdown', () => {
      gameScene.events.off('scoreChanged');
    });
  }
}
```

**Why a separate scene?**

- The HUD scene has its own camera — no `setScrollFactor(0)` needed.
- HUD elements won't interfere with game physics or input priority.
- You can pause the game scene without pausing the HUD (for pause menus).
- Clean separation of concerns: game logic in one scene, display logic in another.

---

## rexUI Plugin

For complex widget layouts (scrollable panels, dialog boxes, text input, sliders, number bars, grids), the community-maintained [rexUI plugin](https://rexrainbow.github.io/phaser3-rex-notes/docs/site/ui-overview/) provides pre-built, configurable components.

### Installation

```bash
npm install phaser3-rex-plugins
```

### Plugin Registration

```typescript
import UIPlugin from 'phaser3-rex-plugins/templates/ui/ui-plugin.js';

const config: Phaser.Types.Core.GameConfig = {
  // ...
  plugins: {
    scene: [
      {
        key: 'rexUI',
        plugin: UIPlugin,
        mapping: 'rexUI',
      },
    ],
  },
};
```

### Dialog Example

```typescript
create(): void {
  const dialog = (this as any).rexUI.add.dialog({
    x: 400,
    y: 300,
    background: this.rexUI.add.roundRectangle(0, 0, 100, 100, 20, 0x1a1a2e),
    title: this.add.text(0, 0, 'Game Over', { fontSize: '24px' }),
    content: this.add.text(0, 0, 'Your score: 1500', { fontSize: '18px' }),
    actions: [
      this.createButton('Retry'),
      this.createButton('Menu'),
    ],
    space: {
      title: 15,
      content: 25,
      action: 15,
      left: 20, right: 20, top: 20, bottom: 20,
    },
    align: { actions: 'center' },
  }).layout().popUp(500);

  dialog.on('button.click', (button: any, _groupName: string, index: number) => {
    if (index === 0) this.scene.restart();
    if (index === 1) this.scene.start('MenuScene');
  });
}

private createButton(text: string): Phaser.GameObjects.Container {
  const bg = (this as any).rexUI.add.roundRectangle(0, 0, 100, 40, 10, 0x4a4e69);
  const label = this.add.text(0, 0, text, { fontSize: '16px' }).setOrigin(0.5);
  return this.add.container(0, 0, [bg, label]).setSize(100, 40);
}
```

### Available rexUI Components

The plugin includes (among others): Dialog, Sizer, OverlapSizer, GridSizer, Label, Buttons, GridButtons, Slider, NumberBar, ScrollablePanel, TextBox, TextArea, Toast, Tabs, Pages, Menu, DropDownList, and ColorPicker.

---

## Mobile and Touch Considerations

- **Touch targets:** Make interactive UI elements at least 44×44 pixels for comfortable tapping on mobile.
- **Safe areas:** On notched devices, offset HUD elements from screen edges. Read `this.scale.displaySize` and account for safe area insets.
- **Text scaling:** Use `this.scale.on('resize', callback)` to reposition or rescale UI when orientation changes.
- **DOM inputs:** Mobile keyboards push up the viewport. Consider using `this.scale.refresh()` or listening to `resize` events to re-center your DOM UI after the keyboard appears.
- **Virtual joysticks:** For mobile controls, rexUI provides a VirtualJoystick plugin, or build one with Phaser's pointer tracking via `scene.input.on('pointermove')`.

---

## Common Patterns

### Minimap

Render a second camera with a small viewport showing the full level:

```typescript
create(): void {
  const map = this.make.tilemap({ key: 'level' });
  // ... create layers ...

  // Minimap camera in the top-right corner
  const minimap = this.cameras.add(
    this.scale.width - 160, 8, 150, 100
  ).setName('minimap');

  minimap.setZoom(0.1);
  minimap.setBackgroundColor(0x000000);
  minimap.centerOn(map.widthInPixels / 2, map.heightInPixels / 2);

  // The HUD scene's elements won't appear in the minimap camera
  // because they belong to a different scene
}
```

### Floating Damage Numbers

```typescript
showDamage(x: number, y: number, amount: number): void {
  const text = this.add.bitmapText(x, y, 'pixelfont', `-${amount}`, 16)
    .setOrigin(0.5)
    .setTint(0xff4444);

  this.tweens.add({
    targets: text,
    y: y - 40,
    alpha: 0,
    duration: 800,
    ease: 'Power2',
    onComplete: () => text.destroy(),
  });
}
```

### Pause Menu

```typescript
// In GameScene
togglePause(): void {
  if (this.scene.isPaused('GameScene')) {
    this.scene.resume('GameScene');
    this.scene.stop('PauseMenu');
  } else {
    this.scene.pause('GameScene');
    this.scene.launch('PauseMenu');
  }
}
```

---

## Cross-Framework Comparison

| Concept            | Phaser                              | Kaplay                        | Excalibur                     | PixiJS                          |
|--------------------|-------------------------------------|-------------------------------|-------------------------------|---------------------------------|
| Text rendering     | Text, BitmapText                    | `k.add([text()])`             | `Label` actor                 | `PIXI.Text`, `PIXI.BitmapText` |
| Buttons            | Container + setInteractive          | Built-in onClick component    | `ScreenElement` subclass      | Sprite/Container + events       |
| Health bars        | Graphics (manual draw)              | Custom draw or rect()         | Graphics or custom Actor      | Graphics (manual draw)          |
| HTML overlay       | DOMElement (built-in)               | Not built-in                  | Not built-in (use raw DOM)    | Not built-in (use raw DOM)      |
| UI plugin          | rexUI (community)                   | Not needed (simple API)       | Not available                 | Not available                   |
| Screen-fixed UI    | `setScrollFactor(0)` or HUD scene   | `fixed()` component           | `ScreenElement` class         | Add to a non-scrolling layer    |
| Dialog / modal     | rexUI Dialog or Container           | Manual with `add()`           | Manual ScreenElement          | Manual Container                |
