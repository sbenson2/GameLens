# UI and HUD

> **Category:** guide · **Engine:** Kaplay · **Related:** [Scenes and Navigation](G2_scenes_and_navigation.md), [Components and Game Objects](G1_components_and_game_objects.md), [Architecture Overview](../architecture/E1_architecture_overview.md)

Kaplay builds UI from the same game objects and components used for everything else — there is no separate UI system. Text labels, health bars, buttons, and menus are all composed from `add()` calls with the right combination of components. The `fixed()` component locks objects to screen space (ignoring the camera), and `stay()` preserves objects across scene transitions. This guide covers text rendering, fixed HUD elements, interactive buttons, health bars, menus, dialog boxes, and HTML overlay integration.

---

## Text Rendering

### The `text()` Component

Attach `text()` to a game object to render a string. The text component accepts content and optional styling:

```typescript
import kaplay from "kaplay";

const k = kaplay();
k.loadFont("pixel", "/fonts/pixel.ttf");

k.scene("main", () => {
  // Basic text label
  k.add([
    k.text("Hello, World!", { size: 32 }),
    k.pos(20, 20),
  ]);

  // Styled text with a custom font
  k.add([
    k.text("Score: 0", {
      size: 24,
      font: "pixel",
    }),
    k.pos(20, 60),
    k.color(255, 255, 0),
  ]);
});

k.go("main");
```

### `TextCompOpt` Properties

| Property | Type | Description |
|---|---|---|
| `size` | `number` | Font size in pixels |
| `font` | `string` | Font name (loaded via `loadFont()` or `loadBitmapFont()`) |
| `width` | `number` | Max width before wrapping |
| `align` | `"left" \| "center" \| "right"` | Text alignment within the width |
| `lineSpacing` | `number` | Extra spacing between lines |
| `letterSpacing` | `number` | Extra spacing between characters |
| `transform` | `(idx, ch) => CharTransformFunc` | Per-character transform for effects |

### Dynamic Text Updates

Text content is updated by modifying the `.text` property on the game object:

```typescript
const scoreLabel = k.add([
  k.text("Score: 0", { size: 24 }),
  k.pos(20, 20),
  k.fixed(),
]);

let score = 0;

function addScore(points: number) {
  score += points;
  scoreLabel.text = `Score: ${score}`;
}
```

### Per-Character Effects

The `transform` option in `text()` enables per-character styling — wave effects, rainbow coloring, typewriter reveals:

```typescript
k.add([
  k.text("WAVE TEXT", {
    size: 48,
    transform: (idx: number, ch: string) => ({
      pos: k.vec2(0, Math.sin(k.time() * 4 + idx) * 6),
      color: k.hsl2rgb((k.time() * 0.2 + idx * 0.1) % 1, 0.8, 0.6),
    }),
  }),
  k.pos(k.center()),
  k.anchor("center"),
  k.fixed(),
]);
```

---

## Fixed HUD Elements — The `fixed()` Component

By default, game objects move with the camera. UI elements need to stay in place on screen. The `fixed()` component makes a game object ignore the camera transform and render on top of the game world:

```typescript
// This label stays at (20, 20) on screen regardless of camera position
const hud = k.add([
  k.text("HP: 100", { size: 20 }),
  k.pos(20, 20),
  k.fixed(),  // Ignores camera — stays on screen
]);
```

**Rule of thumb:** Any game object that is part of the HUD or an overlay menu should have `fixed()`.

---

## Persisting UI Across Scenes — The `stay()` Component

When you call `k.go("nextScene")`, all game objects in the current scene are destroyed. Add `stay()` to any object that should survive the transition:

```typescript
// Global HUD that persists across all scenes
const globalHud = k.add([
  k.text("Coins: 0", { size: 18 }),
  k.pos(20, 20),
  k.fixed(),
  k.stay(),  // Survives scene transitions
]);
```

Combine `fixed()` + `stay()` for persistent HUD elements like score counters, minimap overlays, or notification toasts.

---

## Interactive Buttons

Kaplay does not have a built-in `Button` widget, but you can build buttons from `area()` + event handlers:

```typescript
function createButton(label: string, position: [number, number], onClick: () => void) {
  const btn = k.add([
    k.rect(160, 48, { radius: 8 }),
    k.pos(...position),
    k.anchor("center"),
    k.area(),
    k.color(80, 80, 200),
    k.outline(2, k.rgb(255, 255, 255)),
    k.fixed(),
    "button",
  ]);

  // Text child
  btn.add([
    k.text(label, { size: 20 }),
    k.anchor("center"),
    k.color(255, 255, 255),
  ]);

  // Hover effects
  btn.onHoverUpdate(() => {
    btn.color = k.rgb(100, 100, 240);
    k.setCursor("pointer");
  });

  btn.onHoverEnd(() => {
    btn.color = k.rgb(80, 80, 200);
    k.setCursor("default");
  });

  btn.onClick(onClick);

  return btn;
}

// Usage
createButton("Play", [400, 300], () => k.go("game"));
createButton("Options", [400, 370], () => k.go("options"));
```

### Virtual Buttons with `setButton()`

For mobile/touch input, Kaplay provides `setButton()` to map touch areas to virtual button names used by the input system:

```typescript
k.setButton("jump", {
  keyboard: ["space", "up"],
  gamepad: ["south"],
});
```

---

## Health Bars

A health bar is typically a colored rectangle that scales with the current HP value:

```typescript
function createHealthBar(maxHp: number, position: [number, number]) {
  const barWidth = 200;
  const barHeight = 20;

  // Background (dark)
  const bg = k.add([
    k.rect(barWidth, barHeight),
    k.pos(...position),
    k.color(40, 40, 40),
    k.fixed(),
    k.z(99),
  ]);

  // Foreground (green fill)
  const fill = k.add([
    k.rect(barWidth, barHeight),
    k.pos(...position),
    k.color(0, 200, 50),
    k.fixed(),
    k.z(100),
  ]);

  return {
    set(currentHp: number) {
      const ratio = Math.max(0, Math.min(1, currentHp / maxHp));
      fill.width = barWidth * ratio;

      // Color shift: green → yellow → red
      if (ratio > 0.5) fill.color = k.rgb(0, 200, 50);
      else if (ratio > 0.25) fill.color = k.rgb(230, 180, 0);
      else fill.color = k.rgb(220, 30, 30);
    },
  };
}

// Usage
const hpBar = createHealthBar(100, [20, 50]);
hpBar.set(75); // update when damaged
```

---

## Dialog Boxes and Typewriter Text

A common RPG pattern — text that reveals character by character:

```typescript
function showDialog(speaker: string, message: string) {
  const box = k.add([
    k.rect(k.width() - 40, 120, { radius: 8 }),
    k.pos(20, k.height() - 140),
    k.color(0, 0, 0),
    k.opacity(0.85),
    k.fixed(),
    k.z(200),
  ]);

  const nameLabel = box.add([
    k.text(speaker, { size: 18 }),
    k.pos(16, 12),
    k.color(255, 220, 100),
  ]);

  const msgLabel = box.add([
    k.text("", { size: 16, width: k.width() - 80 }),
    k.pos(16, 40),
    k.color(255, 255, 255),
  ]);

  let charIndex = 0;

  const typewriter = k.onUpdate(() => {
    if (charIndex <= message.length) {
      msgLabel.text = message.slice(0, charIndex);
      charIndex++;
    }
  });

  // Click to dismiss when done (or skip to end)
  box.onClick(() => {
    if (charIndex <= message.length) {
      msgLabel.text = message;
      charIndex = message.length + 1;
    } else {
      typewriter.cancel();
      k.destroy(box);
    }
  });

  return box;
}
```

---

## HTML Overlay UI

For complex UI (inventories, settings menus, chat boxes), you may prefer standard HTML/CSS rendered on top of the Kaplay canvas. The canvas is just a `<canvas>` element — overlay a `<div>` using CSS `position: absolute`:

```html
<div id="game-container" style="position: relative;">
  <canvas id="game"></canvas>
  <div id="ui-overlay" style="position: absolute; top: 0; left: 0; pointer-events: none;">
    <div id="inventory" style="pointer-events: auto; display: none;">
      <!-- HTML inventory UI -->
    </div>
  </div>
</div>
```

```typescript
// Toggle HTML inventory from Kaplay
k.onKeyPress("i", () => {
  const inv = document.getElementById("inventory")!;
  inv.style.display = inv.style.display === "none" ? "block" : "none";
});
```

**When to use HTML overlay vs. Kaplay game objects:**

| Approach | Pros | Cons |
|---|---|---|
| Kaplay game objects | Consistent look, pixel-perfect, animatable | Tedious for complex forms/lists |
| HTML overlay | Full CSS styling, scrollable, accessible | Separate from game render loop, styling mismatch |

---

## Z-Ordering for UI Layers

Use the `z()` component to control draw order. Higher `z` values render on top:

```typescript
// Game world objects default to z(0)
k.add([k.sprite("player"), k.pos(100, 100)]);

// HUD sits above the game world
k.add([k.text("Score: 0"), k.pos(20, 20), k.fixed(), k.z(100)]);

// Modal dialogs sit above the HUD
k.add([k.rect(400, 300), k.pos(200, 100), k.fixed(), k.z(200)]);
```

**Recommended z-layer ranges:**

| Layer | Z Range | Examples |
|---|---|---|
| Background | -100 to -1 | Parallax layers, sky |
| Game world | 0 to 99 | Players, enemies, items |
| HUD | 100 to 199 | Score, health bar, minimap |
| Overlays | 200 to 299 | Dialog boxes, menus |
| System | 300+ | Fade transitions, notifications |

---

## Best Practices

### Centralize HUD in a Factory

Create a `createHUD()` function that spawns all HUD elements and returns an object with update methods. This keeps scene code clean and makes the HUD testable:

```typescript
function createHUD() {
  const score = k.add([k.text("0", { size: 24 }), k.pos(20, 20), k.fixed(), k.z(100)]);
  const hp = createHealthBar(100, [20, 50]);

  return {
    setScore: (v: number) => { score.text = String(v); },
    setHp: (v: number) => hp.set(v),
  };
}
```

### Use `fixed()` on Everything UI

Forgetting `fixed()` is the most common HUD bug — elements drift off-screen when the camera moves.

### Avoid Deep Nesting

Kaplay's parent-child system works, but deeply nested UI trees get hard to manage. Keep nesting to 2-3 levels max (e.g., dialog box → name label + message label).

### Mobile Touch Targets

On mobile, buttons should be at least 44×44 CSS pixels. Increase `area()` hitbox padding if visual elements are smaller:

```typescript
k.add([
  k.rect(32, 32),
  k.area({ shape: new k.Rect(k.vec2(-6, -6), 44, 44) }), // padded hitbox
  k.fixed(),
]);
```

---

## Cross-Framework Comparison

| Concept | Kaplay | Phaser | Excalibur | PixiJS |
|---|---|---|---|---|
| Text rendering | `text()` component | `this.add.text()` | `new Label()` | `new Text()` |
| Fixed to screen | `fixed()` component | `setScrollFactor(0)` | `actor.anchor = ...` + `ScreenElement` | Add to non-camera container |
| Persist across scenes | `stay()` component | Add to persistent scene | Manual across scenes | Manual |
| Button interaction | `area()` + `onClick()` | `setInteractive()` + `on('pointerdown')` | `ScreenElement` + `on('pointerup')` | `eventMode = 'static'` + `on('pointerdown')` |
| Draw order | `z()` component | `setDepth()` | `z` property | Container child order |
