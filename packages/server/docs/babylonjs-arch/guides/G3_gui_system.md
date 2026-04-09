# Babylon.js GUI System — 2D/3D UI for Games

> **Category:** guide · **Engine:** Babylon.js v7+ · **Related:** [E1_architecture_overview](../architecture/E1_architecture_overview.md), [G1_physics_havok](G1_physics_havok.md)

Babylon.js ships a full UI toolkit via the `@babylonjs/gui` package. It renders UI elements onto a dynamic texture, supporting both fullscreen HUD overlays and in-world UI attached to 3D meshes. This guide covers everything needed to build game UI: HUDs, menus, health bars, in-world labels, and interactive panels.

---

## Installation

```bash
npm install @babylonjs/gui
```

```typescript
import * as GUI from '@babylonjs/gui';
// Or import individual classes:
import { AdvancedDynamicTexture, Button, TextBlock, StackPanel } from '@babylonjs/gui';
```

---

## AdvancedDynamicTexture — The Foundation

All GUI controls live on an `AdvancedDynamicTexture` (ADT). Two creation modes exist:

### Fullscreen Mode (HUD / Menus)

Covers the entire screen. Intercepts pointer events. Rescales automatically with the viewport.

```typescript
const ui = GUI.AdvancedDynamicTexture.CreateFullscreenUI("gameUI");

// Only ONE fullscreen ADT per scene is allowed.
// Second parameter controls foreground (true, default) vs background (false).
const bgUI = GUI.AdvancedDynamicTexture.CreateFullscreenUI("bgUI", true, scene);
```

### Texture Mode (In-World UI)

Renders GUI onto a mesh surface — useful for in-game screens, billboards, or interactive panels.

```typescript
const plane = BABYLON.MeshBuilder.CreatePlane("uiPlane", { size: 2 }, scene);

// Resolution: 1024×1024 pixels on the texture
// Fourth param (false) disables pointer move events for performance
const worldUI = GUI.AdvancedDynamicTexture.CreateForMesh(plane, 1024, 1024, false);
```

---

## Controls Reference

### TextBlock — Display Text

```typescript
const title = new GUI.TextBlock("title", "GAME OVER");
title.color = "white";
title.fontSize = 48;
title.fontFamily = "Courier New";
title.textHorizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_CENTER;
title.textWrapping = true;        // Wrap long text
title.resizeToFit = true;         // Auto-size to content
title.outlineWidth = 2;           // Text outline for readability
title.outlineColor = "black";
ui.addControl(title);
```

### Button — Interactive

Four factory methods for common patterns:

```typescript
// Text + image button
const btn = GUI.Button.CreateImageButton("play", "PLAY", "/ui/play-icon.png");
btn.width = "200px";
btn.height = "60px";
btn.color = "white";
btn.background = "#4CAF50";
btn.cornerRadius = 8;

// Click handler
btn.onPointerClickObservable.add(() => {
  startGame();
});

// Customize hover/press animations
btn.pointerEnterAnimation = () => { btn.background = "#66BB6A"; };
btn.pointerOutAnimation = () => { btn.background = "#4CAF50"; };
btn.pointerDownAnimation = () => { btn.scaleX = 0.95; btn.scaleY = 0.95; };
btn.pointerUpAnimation = () => { btn.scaleX = 1; btn.scaleY = 1; };

ui.addControl(btn);

// Other button types:
// GUI.Button.CreateSimpleButton("btn", "Click Me");
// GUI.Button.CreateImageOnlyButton("btn", "/ui/icon.png");
```

### Image — Display Sprites/Icons

```typescript
const healthIcon = new GUI.Image("heart", "/ui/heart.png");
healthIcon.width = "32px";
healthIcon.height = "32px";
healthIcon.stretch = GUI.Image.STRETCH_UNIFORM; // Maintain aspect ratio

// Sprite sheet support via source rectangle
healthIcon.sourceLeft = 0;
healthIcon.sourceTop = 0;
healthIcon.sourceWidth = 64;
healthIcon.sourceHeight = 64;
```

### Slider — Numeric Input

```typescript
const volumeSlider = new GUI.Slider("volume");
volumeSlider.minimum = 0;
volumeSlider.maximum = 100;
volumeSlider.value = 75;
volumeSlider.width = "200px";
volumeSlider.height = "20px";
volumeSlider.color = "#FF9800";
volumeSlider.background = "#333";

volumeSlider.onValueChangedObservable.add((value) => {
  audioEngine.setGlobalVolume(value / 100);
});
```

### InputText — Text Entry

```typescript
const nameInput = new GUI.InputText("name", "Player 1");
nameInput.width = "250px";
nameInput.height = "40px";
nameInput.color = "white";
nameInput.background = "#222";
nameInput.focusedBackground = "#333";
nameInput.maxWidth = "300px";
nameInput.autoStretchWidth = false;

nameInput.onTextChangedObservable.add((ev) => {
  playerName = ev.text;
});
```

Note: On mobile, `InputText` falls back to the browser `prompt()` dialog.

### Checkbox & RadioButton

```typescript
// Checkbox
const muteCheck = new GUI.Checkbox("mute");
muteCheck.width = "20px";
muteCheck.height = "20px";
muteCheck.isChecked = false;
muteCheck.color = "green";
muteCheck.onIsCheckedChangedObservable.add((checked) => {
  toggleMute(checked);
});

// Radio buttons (grouped by .group property)
const easyRadio = new GUI.RadioButton("easy");
easyRadio.group = "difficulty";
easyRadio.width = "20px";
easyRadio.height = "20px";
easyRadio.isChecked = true;
```

---

## Containers — Layout

### StackPanel

Arranges children vertically or horizontally. Children must have explicit pixel dimensions in the flow direction.

```typescript
const panel = new GUI.StackPanel("menu");
panel.isVertical = true;
panel.width = "300px";
panel.horizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_CENTER;
panel.verticalAlignment = GUI.Control.VERTICAL_ALIGNMENT_CENTER;

// Add buttons to the vertical stack
panel.addControl(playButton);    // needs height in px
panel.addControl(optionsButton);
panel.addControl(quitButton);

ui.addControl(panel);
```

### Grid — Table Layout

```typescript
const grid = new GUI.Grid("hud");

// Define columns: 200px fixed | 1fr stretch | 200px fixed
grid.addColumnDefinition(200, true);   // true = pixel value
grid.addColumnDefinition(1);           // fraction (stretches)
grid.addColumnDefinition(200, true);

// Define rows
grid.addRowDefinition(60, true);       // top bar
grid.addRowDefinition(1);              // main area
grid.addRowDefinition(80, true);       // bottom bar

// Place controls: (control, row, column)
grid.addControl(healthBar, 0, 0);      // top-left
grid.addControl(minimap, 0, 2);        // top-right
grid.addControl(actionBar, 2, 1);      // bottom-center

ui.addControl(grid);
```

### ScrollViewer — Scrollable Content

```typescript
const scroller = new GUI.ScrollViewer("inventory");
scroller.width = "400px";
scroller.height = "300px";
scroller.barColor = "#666";
scroller.barSize = 15;
scroller.thickness = 0;    // no border

// Performance: freeze controls if content doesn't animate
scroller.freezeControls = true;
// Spatial subdivision for large item lists
scroller.setBucketSizes(100, 40);

const inventoryGrid = new GUI.Grid("items");
// ... populate grid with item slots
scroller.addControl(inventoryGrid);

ui.addControl(scroller);
```

### Rectangle — Styled Container

```typescript
const tooltip = new GUI.Rectangle("tooltip");
tooltip.width = "200px";
tooltip.height = "80px";
tooltip.cornerRadius = 6;
tooltip.thickness = 1;
tooltip.color = "#888";
tooltip.background = "rgba(0, 0, 0, 0.85)";

const tooltipText = new GUI.TextBlock("ttText", "Sword of Flames\n+10 Attack");
tooltipText.color = "white";
tooltipText.fontSize = 14;
tooltip.addControl(tooltipText);
```

---

## Linking UI to 3D Objects

Attach fullscreen UI controls to mesh world positions — essential for health bars, name tags, and damage numbers.

```typescript
// ONLY works in fullscreen mode
const nameLabel = new GUI.TextBlock("name", "Enemy Boss");
nameLabel.color = "red";
nameLabel.fontSize = 16;
nameLabel.resizeToFit = true;

// Link to mesh — label follows the enemy in screen space
nameLabel.linkWithMesh(enemyMesh);
nameLabel.linkOffsetY = -50;  // pixels above the mesh center

ui.addControl(nameLabel);
```

### Non-Overlapping Labels

When multiple labels cluster together (e.g., in an RTS):

```typescript
label1.overlapGroup = 1;
label2.overlapGroup = 1;
label3.overlapGroup = 1;

// Call after adding all controls
ui.moveToNonOverlappedPosition();
```

---

## Adaptive Scaling

For responsive UI across screen resolutions:

```typescript
const ui = GUI.AdvancedDynamicTexture.CreateFullscreenUI("gameUI");

// Design at 1920px wide — controls scale proportionally on other resolutions
ui.idealWidth = 1920;

// Or use both dimensions (smaller wins):
ui.idealWidth = 1920;
ui.idealHeight = 1080;
ui.useSmallestIdeal = true;

// Optional: render at the ideal resolution (crisper on low-DPI, blurrier on high-DPI)
ui.renderAtIdealSize = true;
```

All pixel values in controls now scale relative to the ideal dimensions.

---

## Reusable Styles

```typescript
const style = ui.createStyle();
style.fontSize = 18;
style.fontFamily = "Segoe UI";
style.fontWeight = "bold";

const label1 = new GUI.TextBlock("l1", "Score");
label1.style = style;

const label2 = new GUI.TextBlock("l2", "Health");
label2.style = style;
```

---

## Event Handling

All controls support the Observable pattern:

```typescript
control.onPointerClickObservable.add((eventData) => { /* click/tap */ });
control.onPointerDownObservable.add((coords) => { /* press */ });
control.onPointerUpObservable.add((coords) => { /* release */ });
control.onPointerEnterObservable.add(() => { /* hover start */ });
control.onPointerOutObservable.add(() => { /* hover end */ });
control.onPointerMoveObservable.add((coords) => { /* drag */ });
```

**Important:** Set `control.isPointerBlocker = true` on controls that need to catch all pointer events and prevent click-through to the 3D scene.

### Keyboard Focus (InputText)

```typescript
input.onFocusObservable.add(() => { /* disable WASD movement */ });
input.onBlurObservable.add(() => { /* re-enable WASD movement */ });
input.onFocusSelectAll = true; // Select all text on focus
```

---

## Game UI Patterns

### Health Bar

```typescript
function createHealthBar(maxHP: number): GUI.Rectangle {
  const container = new GUI.Rectangle("hpContainer");
  container.width = "200px";
  container.height = "20px";
  container.background = "#333";
  container.thickness = 0;

  const fill = new GUI.Rectangle("hpFill");
  fill.width = "100%";
  fill.height = "100%";
  fill.background = "#4CAF50";
  fill.horizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_LEFT;
  container.addControl(fill);

  const text = new GUI.TextBlock("hpText", `${maxHP}/${maxHP}`);
  text.color = "white";
  text.fontSize = 12;
  container.addControl(text);

  // Update function
  (container as any).setHP = (current: number) => {
    const pct = Math.max(0, current / maxHP);
    fill.width = `${pct * 100}%`;
    fill.background = pct > 0.5 ? "#4CAF50" : pct > 0.25 ? "#FF9800" : "#F44336";
    text.text = `${current}/${maxHP}`;
  };

  return container;
}
```

### Floating Damage Number

```typescript
function showDamageNumber(mesh: BABYLON.AbstractMesh, damage: number): void {
  const dmgText = new GUI.TextBlock("dmg", `-${damage}`);
  dmgText.color = "red";
  dmgText.fontSize = 24;
  dmgText.fontWeight = "bold";
  dmgText.outlineWidth = 2;
  dmgText.outlineColor = "black";
  dmgText.resizeToFit = true;
  dmgText.linkWithMesh(mesh);
  dmgText.linkOffsetY = -30;
  ui.addControl(dmgText);

  // Animate upward and fade out
  let elapsed = 0;
  const observer = scene.onBeforeRenderObservable.add(() => {
    elapsed += scene.getEngine().getDeltaTime();
    dmgText.linkOffsetY -= 1;
    dmgText.alpha = Math.max(0, 1 - elapsed / 1000);
    if (elapsed > 1000) {
      ui.removeControl(dmgText);
      scene.onBeforeRenderObservable.remove(observer);
    }
  });
}
```

---

## Performance Tips

1. **Bitmap cache** — Enable `control.useBitmapCache = true` for complex or rarely-changing controls (e.g., minimap background). Skips per-frame canvas redraws.

2. **Invalidate rect optimization** — Enabled by default. Only redraws the dirty region of the ADT. Disable only if you see rendering artifacts: `ui.useInvalidateRectOptimization = false`.

3. **Freeze ScrollViewer content** — For inventory grids with 100+ slots, `scroller.freezeControls = true` plus `setBucketSizes()` skips layout for offscreen items.

4. **Disable pointer events on texture mode** when not needed — pass `false` as the fourth arg to `CreateForMesh()`.

5. **Limit fullscreen ADTs** — Only one is allowed, but even complex UIs should use a single ADT with containers, not multiple.

6. **Control count** — Aim for <500 total controls on screen. Beyond that, consider canvas-based rendering or HTML overlay.

7. **Avoid per-frame control creation** — Pool damage numbers, labels, and tooltips instead of creating/destroying each frame.
