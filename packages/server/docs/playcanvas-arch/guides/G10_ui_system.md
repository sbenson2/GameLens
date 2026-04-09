# UI System

> **Category:** guide · **Engine:** PlayCanvas · **Related:** [G1_scripting_system.md](G1_scripting_system.md), [G6_input_handling.md](G6_input_handling.md), [E1_architecture_overview.md](../architecture/E1_architecture_overview.md)

PlayCanvas provides a built-in entity-component UI system for building game interfaces — HUDs, menus, dialogs, and in-world displays. The system is built on two core components: **Screen** (the rendering container) and **Element** (individual UI pieces like text, images, and buttons). This guide covers setup, layout, input handling, and performance patterns.

---

## Core Concepts

The PlayCanvas UI system uses the same entity hierarchy as 3D objects, but with specialized components:

```
Screen Entity (ScreenComponent)
  └── Panel Entity (Element: group)
        ├── Title Entity (Element: text)
        ├── Icon Entity (Element: image)
        └── Button Entity (Element: image + ButtonComponent)
              └── Label Entity (Element: text)
```

Every UI element is an Entity with an **Element component**. The root of any UI tree is an Entity with a **Screen component**.

---

## Screen Component

The Screen component defines the coordinate space and rendering mode for all child UI elements.

### Screen Space (2D Overlay)

Renders UI flat on top of the camera — the standard choice for HUDs and menus.

```typescript
const screenEntity = new pc.Entity("UI Screen");
screenEntity.addComponent("screen", {
  screenSpace: true,
  referenceResolution: new pc.Vec2(1920, 1080),
  scaleMode: pc.SCALEMODE_BLEND,
  scaleBlend: 0.5,
});
app.root.addChild(screenEntity);
```

**Properties:**

| Property | Type | Description |
|----------|------|-------------|
| `screenSpace` | boolean | `true` = 2D overlay, `false` = world-space |
| `referenceResolution` | Vec2 | Baseline resolution for scaling calculations |
| `scaleMode` | enum | `SCALEMODE_NONE` (fixed pixels) or `SCALEMODE_BLEND` (responsive) |
| `scaleBlend` | number | 0 = scale by width only, 1 = height only, 0.5 = balanced |

### World Space (3D UI)

When `screenSpace: false`, the Screen entity uses the standard transform hierarchy. UI elements appear as geometry in the 3D world — useful for in-game signs, floating health bars, or VR interfaces.

```typescript
const worldScreen = new pc.Entity("World UI");
worldScreen.addComponent("screen", {
  screenSpace: false,
  referenceResolution: new pc.Vec2(400, 300),
});
worldScreen.setLocalScale(0.01, 0.01, 0.01); // scale down to world units
worldScreen.setPosition(0, 3, 0); // float above a character
app.root.addChild(worldScreen);
```

### Responsive Scaling

The `SCALEMODE_BLEND` mode scales content relative to the reference resolution. When the actual screen is larger, UI scales up; when smaller, it scales down. The `scaleBlend` value controls the blend between horizontal and vertical scaling:

- **0** — scale based on width ratio only (good for wide landscape games)
- **1** — scale based on height ratio only (good for portrait mobile games)
- **0.5** — balanced (recommended default for cross-device games)

---

## Element Component

The Element component is the building block of all UI content. It has three types.

### Text Element

Renders a text string with font, size, color, and alignment options.

```typescript
const label = new pc.Entity("Score Label");
label.addComponent("element", {
  type: pc.ELEMENTTYPE_TEXT,
  anchor: new pc.Vec4(0.5, 1, 0.5, 1),   // top-center
  pivot: new pc.Vec2(0.5, 1),             // anchor from top-center of element
  text: "Score: 0",
  fontAsset: fontAsset,
  fontSize: 48,
  color: new pc.Color(1, 1, 1),
  outlineColor: new pc.Color(0, 0, 0),
  outlineThickness: 0.3,
  width: 300,
  height: 60,
});
screenEntity.addChild(label);
```

**Key text properties:**

| Property | Description |
|----------|-------------|
| `text` | The displayed string |
| `fontAsset` | Reference to a font asset (bitmap or MSDF) |
| `fontSize` | Size in pixels (relative to reference resolution) |
| `color` | Text fill color |
| `outlineColor` / `outlineThickness` | Text outline for readability over game scenes |
| `shadowColor` / `shadowOffset` | Drop shadow |
| `spacing` | Letter spacing |
| `lineHeight` | Line height multiplier |
| `wrapLines` | Enable word wrapping |
| `autoWidth` / `autoHeight` | Resize element to fit text |
| `alignment` | Vec2: x = horizontal (0 left, 0.5 center, 1 right), y = vertical |

### Image Element

Renders a sprite or texture — backgrounds, icons, health bars.

```typescript
const healthBar = new pc.Entity("Health Bar");
healthBar.addComponent("element", {
  type: pc.ELEMENTTYPE_IMAGE,
  anchor: new pc.Vec4(0, 0, 0, 0),    // bottom-left
  pivot: new pc.Vec2(0, 0),
  width: 200,
  height: 24,
  color: new pc.Color(0.2, 0.8, 0.2), // green tint
  textureAsset: barTextureAsset,
  rect: new pc.Vec4(0, 0, 1, 1),      // full texture UV rect
  opacity: 0.9,
});
screenEntity.addChild(healthBar);
```

To animate a fill bar (health, stamina, loading), adjust the `width` or use the `rect` property to reveal a portion of the texture.

### Group Element

An invisible container for organizing and layouting child elements. No visual output — purely structural.

```typescript
const panel = new pc.Entity("HUD Panel");
panel.addComponent("element", {
  type: pc.ELEMENTTYPE_GROUP,
  anchor: new pc.Vec4(0, 0, 1, 1), // stretch to fill parent
  pivot: new pc.Vec2(0.5, 0.5),
  width: 0,
  height: 0,
});
screenEntity.addChild(panel);
```

---

## Anchoring and Pivots

Anchoring controls where an element is positioned relative to its parent. Pivots control the element's own origin point.

### Anchor (Vec4)

The anchor is defined as `(left, bottom, right, top)` in normalized coordinates (0–1):

| Pattern | Anchor | Behavior |
|---------|--------|----------|
| Top-left corner | `(0, 1, 0, 1)` | Fixed to top-left |
| Center | `(0.5, 0.5, 0.5, 0.5)` | Fixed to center |
| Full stretch | `(0, 0, 1, 1)` | Stretches with parent |
| Bottom bar | `(0, 0, 1, 0)` | Stretches horizontally, pinned to bottom |
| Right side | `(1, 0, 1, 1)` | Stretches vertically, pinned to right |

When left≠right or bottom≠top, the element stretches along that axis. The `margin` property then controls the inset from the anchor edges.

### Pivot (Vec2)

The pivot is the element's own origin point (0–1 per axis). Common values:

| Pivot | Meaning |
|-------|---------|
| `(0, 0)` | Bottom-left corner |
| `(0.5, 0.5)` | Center (default) |
| `(0.5, 1)` | Top-center |
| `(1, 0)` | Bottom-right corner |

---

## Layout Groups

PlayCanvas provides `LayoutGroup` and `LayoutChild` components for automatic arrangement of child elements — useful for inventories, lists, and grids.

```typescript
const inventoryGrid = new pc.Entity("Inventory");
inventoryGrid.addComponent("element", {
  type: pc.ELEMENTTYPE_GROUP,
  anchor: new pc.Vec4(0.5, 0.5, 0.5, 0.5),
  pivot: new pc.Vec2(0.5, 0.5),
  width: 400,
  height: 400,
});

inventoryGrid.addComponent("layoutgroup", {
  orientation: pc.ORIENTATION_HORIZONTAL,
  reverseX: false,
  reverseY: false,
  alignment: new pc.Vec2(0, 1),
  padding: new pc.Vec4(8, 8, 8, 8), // left, bottom, right, top
  spacing: new pc.Vec2(4, 4),
  widthFitting: pc.FITTING_NONE,
  heightFitting: pc.FITTING_NONE,
  wrap: true, // wrap to next row
});
screenEntity.addChild(inventoryGrid);
```

Each child entity needs a `LayoutChild` component to participate in the layout:

```typescript
const slot = new pc.Entity("Slot");
slot.addComponent("element", {
  type: pc.ELEMENTTYPE_IMAGE,
  width: 64,
  height: 64,
  textureAsset: slotTexture,
});
slot.addComponent("layoutchild", {
  excludeFromLayout: false,
});
inventoryGrid.addChild(slot);
```

---

## Buttons and Input Handling

### Button Component

The `ButtonComponent` adds hover/press/inactive visual feedback to an Element:

```typescript
const btn = new pc.Entity("Play Button");
btn.addComponent("element", {
  type: pc.ELEMENTTYPE_IMAGE,
  anchor: new pc.Vec4(0.5, 0.5, 0.5, 0.5),
  pivot: new pc.Vec2(0.5, 0.5),
  width: 200,
  height: 60,
  useInput: true, // REQUIRED for input events
  textureAsset: buttonTexture,
});

btn.addComponent("button", {
  active: true,
  transitionMode: pc.BUTTON_TRANSITION_MODE_TINT,
  hoverTint: new pc.Color(0.9, 0.9, 0.9),
  pressedTint: new pc.Color(0.7, 0.7, 0.7),
  inactiveTint: new pc.Color(0.5, 0.5, 0.5),
  fadeDuration: 0.1,
});
screenEntity.addChild(btn);
```

**Transition modes:**

| Mode | Description |
|------|-------------|
| `BUTTON_TRANSITION_MODE_TINT` | Multiplies element color by state tint |
| `BUTTON_TRANSITION_MODE_SPRITE_CHANGE` | Swaps sprite per state (hover, pressed, inactive) |

### Event Handling

Enable `useInput: true` on the Element component, then listen for events:

```typescript
// Via ButtonComponent (recommended for buttons)
btn.button.on("click", () => {
  console.log("Play clicked!");
  startGame();
});

btn.button.on("hoverstart", () => {
  // Play hover sound
});

btn.button.on("hoverend", () => {
  // Stop hover effect
});

// Via ElementComponent (works on any element, not just buttons)
btn.element.on("click", (event: pc.ElementMouseEvent) => {
  console.log("Clicked at", event.x, event.y);
});

btn.element.on("mouseenter", (event: pc.ElementMouseEvent) => {
  // Hover start
});

btn.element.on("mouseleave", (event: pc.ElementMouseEvent) => {
  // Hover end
});

// Touch events
btn.element.on("touchstart", (event: pc.ElementTouchEvent) => {
  // Touch began
});

btn.element.on("touchend", (event: pc.ElementTouchEvent) => {
  // Touch ended
});
```

**Important:** The `useInput` property must be `true` on the Element component for any input events to fire. This is a common gotcha.

---

## Common UI Patterns for Games

### HUD with Score and Health

```typescript
function createHUD(app: pc.Application, fontAsset: pc.Asset): pc.Entity {
  const screen = new pc.Entity("HUD");
  screen.addComponent("screen", {
    screenSpace: true,
    referenceResolution: new pc.Vec2(1920, 1080),
    scaleMode: pc.SCALEMODE_BLEND,
    scaleBlend: 0.5,
  });

  // Score — top right
  const score = new pc.Entity("Score");
  score.addComponent("element", {
    type: pc.ELEMENTTYPE_TEXT,
    anchor: new pc.Vec4(1, 1, 1, 1),
    pivot: new pc.Vec2(1, 1),
    text: "0",
    fontAsset: fontAsset,
    fontSize: 64,
    color: new pc.Color(1, 1, 1),
    outlineColor: new pc.Color(0, 0, 0),
    outlineThickness: 0.4,
    width: 200,
    height: 80,
    margin: new pc.Vec4(0, 0, -20, -10), // inset from edge
  });
  screen.addChild(score);

  // Health bar — bottom left
  const healthBg = new pc.Entity("Health BG");
  healthBg.addComponent("element", {
    type: pc.ELEMENTTYPE_IMAGE,
    anchor: new pc.Vec4(0, 0, 0, 0),
    pivot: new pc.Vec2(0, 0),
    width: 300,
    height: 30,
    color: new pc.Color(0.2, 0.2, 0.2),
    margin: new pc.Vec4(20, 20, 0, 0),
  });

  const healthFill = new pc.Entity("Health Fill");
  healthFill.addComponent("element", {
    type: pc.ELEMENTTYPE_IMAGE,
    anchor: new pc.Vec4(0, 0, 1, 1), // stretch inside parent
    pivot: new pc.Vec2(0, 0),
    margin: new pc.Vec4(2, 2, 2, 2),
    color: new pc.Color(0.1, 0.85, 0.2),
  });
  healthBg.addChild(healthFill);
  screen.addChild(healthBg);

  app.root.addChild(screen);
  return screen;
}

// Update health: scale the fill element
function setHealth(healthFill: pc.Entity, percent: number): void {
  // Clamp 0–1 and adjust width anchor
  const p = pc.math.clamp(percent, 0, 1);
  const anchor = healthFill.element!.anchor;
  healthFill.element!.anchor = new pc.Vec4(anchor.x, anchor.y, p, anchor.w);
}
```

### Pause Menu Overlay

```typescript
function createPauseMenu(
  screen: pc.Entity,
  fontAsset: pc.Asset,
  onResume: () => void,
  onQuit: () => void
): pc.Entity {
  // Semi-transparent overlay
  const overlay = new pc.Entity("Pause Overlay");
  overlay.addComponent("element", {
    type: pc.ELEMENTTYPE_IMAGE,
    anchor: new pc.Vec4(0, 0, 1, 1),
    pivot: new pc.Vec2(0.5, 0.5),
    color: new pc.Color(0, 0, 0),
    opacity: 0.6,
    useInput: true, // blocks clicks to game
  });

  // "PAUSED" title
  const title = new pc.Entity("Title");
  title.addComponent("element", {
    type: pc.ELEMENTTYPE_TEXT,
    anchor: new pc.Vec4(0.5, 0.65, 0.5, 0.65),
    pivot: new pc.Vec2(0.5, 0.5),
    text: "PAUSED",
    fontAsset: fontAsset,
    fontSize: 72,
    color: new pc.Color(1, 1, 1),
    width: 400,
    height: 100,
  });
  overlay.addChild(title);

  // Resume button
  const resumeBtn = createButton(overlay, "Resume", fontAsset, 0.5, onResume);
  // Quit button
  const quitBtn = createButton(overlay, "Quit", fontAsset, 0.35, onQuit);

  overlay.enabled = false; // hidden by default
  screen.addChild(overlay);
  return overlay;
}
```

---

## Performance Considerations

### Draw Call Batching

Each visible UI element with a unique material generates a draw call. To minimize draw calls:

- **Use sprite atlases** — pack multiple UI images into one texture so elements share a material.
- **Minimize font assets** — each font is a separate texture. Use 1–2 fonts maximum.
- **Group elements by texture** — elements sharing the same texture batch automatically.

### Render Order

UI elements render in hierarchy order (depth-first). Use entity ordering within the Screen hierarchy to control z-layering rather than adding multiple Screen entities.

### MSDF Fonts

Use MSDF (Multi-channel Signed Distance Field) fonts for crisp text at any size. PlayCanvas supports MSDF natively — convert fonts with the `msdf-atlas-gen` tool or via the PlayCanvas Editor font import.

### Mobile Considerations

- Set touch target sizes to at least 44×44 px (at reference resolution) for comfortable tapping.
- Test `scaleBlend` values on both landscape and portrait orientations.
- Keep total UI element count under 200 for smooth performance on mid-range mobile devices.
- Disable `useInput` on decorative elements that don't need interaction — input raycasting has a per-element cost.
