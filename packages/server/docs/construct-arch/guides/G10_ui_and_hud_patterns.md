# G10 — UI and HUD Patterns

> **Category:** guide · **Engine:** Construct · **Related:** [E1 Architecture Overview](../architecture/E1_architecture_overview.md) · [G1 Event Sheet Patterns](G1_event_sheet_patterns.md) · [G5 Animation and Timeline](G5_animation_and_timeline.md) · [R1 Behaviors and Effects](../reference/R1_behaviors_and_effects.md)

---

## Overview

Every game needs a heads-up display (HUD) — health bars, score counters, inventory icons, dialogue boxes. Construct 3 handles UI through its layer system, but getting it right requires understanding parallax, global layouts, anchor behaviors, and text rendering options. This guide covers the patterns that keep UI clean, responsive, and maintainable across layouts.

---

## Layer-Based HUD Architecture

Construct 3 renders objects on **layers** within **layouts**. The key to a stable HUD is separating game-world layers from UI layers.

### Recommended Layer Stack

```
Layer 4: "UI_Overlay"     ← Parallax 0,0  (notifications, popups, fade effects)
Layer 3: "UI_HUD"         ← Parallax 0,0  (health, score, minimap)
Layer 2: "Game_Foreground" ← Parallax 100,100 (particles, effects above player)
Layer 1: "Game_Main"       ← Parallax 100,100 (player, enemies, items)
Layer 0: "Background"      ← Parallax 50,50  (parallax scrolling background)
```

### Why Parallax 0,0 Matters

Setting a layer's **Parallax** to `0%, 0%` pins it to the viewport — it won't scroll when the camera moves. This is essential for HUD elements. Without it, your health bar scrolls off-screen when the player moves.

To set parallax: select the layer in the **Layers** panel → set **Parallax X** and **Parallax Y** to `0`.

### Layer Properties for UI

| Property | Recommended Value | Why |
|----------|------------------|-----|
| **Parallax** | 0%, 0% | Pins layer to viewport |
| **Transparent** | Yes | Don't obscure game layers with a background fill |
| **Force own texture** | Yes (for complex UI) | Reduces draw calls when UI has many overlapping elements |
| **Scale rate** | 0 | Prevents UI from scaling with zoom — keeps icons pixel-perfect |

Setting **Scale rate** to `0` is particularly important if your game uses camera zoom. Without it, HUD elements grow and shrink with the game world.

---

## Global UI: One Layout, Every Level

The most maintainable approach is a **dedicated UI layout** that persists across all game levels. This avoids duplicating HUD objects in every layout.

### Pattern: Global UI via Layout Include

1. **Create a layout** called `UI_Global` containing all HUD objects (health bar, score text, minimap).
2. **Create an event sheet** called `ES_UI` with all HUD logic.
3. In every game layout's event sheet, use **Include** → `ES_UI`.
4. On the `UI_Global` layout, mark HUD objects as **Global** (right-click object → set Global).

When an object is marked **Global**, it persists across layout changes. Combined with an included event sheet, your HUD travels with the player automatically.

### When Global Objects Work

- Health bars, score counters, lives displays — always visible.
- Persistent inventory overlays.
- Debug info during development.

### When Global Objects Don't Work

- Menus that replace the game screen entirely (title screen, pause menu, game over).
- Context-sensitive UI that only appears in certain layouts.

For these, use **layout-specific UI** on dedicated layers within those layouts.

---

## Text Rendering Options

Construct 3 offers three text rendering approaches. Each has trade-offs:

| Object | Best For | Limitations |
|--------|----------|-------------|
| **Text** | Dynamic content (scores, dialogue, debug) | Uses system fonts — rendering varies by platform; limited styling |
| **SpriteFont** | Pixel-perfect game fonts, retro aesthetics | Fixed character set; no easy resizing; must create font image manually |
| **DrawingCanvas** | Fully custom text rendering, charts, graphs | Requires JavaScript scripting; more complex setup |

### Text Object Best Practices

- Set **Font** to a web-safe font (Arial, Verdana) or embed a web font for consistency across platforms.
- Enable **Word wrap** for dialogue boxes.
- Use `set text` action with expressions: `"HP: " & Player.Health & "/" & Player.MaxHealth`
- For numbers that change frequently (score, timer), update only **On value changed** — not every tick.

### SpriteFont Setup

1. Create a sprite sheet image with characters arranged in a grid.
2. Set the **Character width**, **Character height**, and **Character set** string.
3. The character set string defines the order: `"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789 !?.,"`
4. Each character occupies a fixed cell in the grid — no variable-width support by default.

SpriteFonts are ideal for games with a pixel-art aesthetic where system fonts look out of place.

---

## Health Bars and Progress Indicators

### Pattern: Sprite-Based Health Bar

Use two **Sprite** objects — one for the bar background, one for the fill:

```
Object: HealthBar_BG     (full-width bar, dark color)
Object: HealthBar_Fill   (same size, bright color)
```

**Event logic:**

```
Every tick:
  → Set HealthBar_Fill width to (Player.Health / Player.MaxHealth) * HealthBar_BG.Width
  → Set HealthBar_Fill position to HealthBar_BG.X, HealthBar_BG.Y
```

For smooth transitions, use the **Tween** behavior on `HealthBar_Fill` to animate width changes.

### Pattern: 9-Patch for Scalable UI Panels

The **9-patch** object stretches an image while preserving its corners and borders. Use it for:

- Dialogue boxes that resize based on text length.
- Inventory panels that expand with more items.
- Tooltip backgrounds.

Set the **Left**, **Right**, **Top**, and **Bottom** margins in the 9-patch properties to define which areas stretch and which remain fixed.

---

## Anchor Behavior for Responsive Layout

The **Anchor** behavior pins objects to viewport edges. This is critical for UI that must work across different screen sizes and aspect ratios.

### Applying Anchors

1. Add the **Anchor** behavior to your UI object.
2. Set edge bindings:
   - **Left edge** → `Window left` (pins to left side)
   - **Right edge** → `Window right` (pins to right side)
   - **Top edge** → `Window top` (pins to top)
   - **Bottom edge** → `Window bottom` (pins to bottom)

### Common Anchor Configurations

| UI Element | Left | Right | Top | Bottom |
|-----------|------|-------|-----|--------|
| Score (top-left) | Window left | None | Window top | None |
| Health bar (top-center) | None | None | Window top | None |
| Minimap (bottom-right) | None | Window right | None | Window bottom |
| Full-width banner | Window left | Window right | Window top | None |

For centered elements, skip the Anchor behavior and position them using expressions:

```
Set X to ViewportWidth("Game_Main") / 2
Set Y to ViewportHeight("Game_Main") / 2
```

---

## Dialogue and Notification Systems

### Pattern: Typewriter Text Effect

Display text character-by-character for dialogue:

```
Instance variable: fullText = ""
Instance variable: displayIndex = 0
Instance variable: charDelay = 0.03  (seconds per character)

On dialogue start:
  → Set fullText to "Welcome to the dungeon, adventurer."
  → Set displayIndex to 0
  → Set DialogueText text to ""

Every charDelay seconds:
  → Add 1 to displayIndex
  → Set DialogueText text to mid(fullText, 0, displayIndex)

displayIndex ≥ len(fullText):
  → (Dialogue complete — wait for input)
```

### Pattern: Toast Notification Queue

For non-blocking notifications ("Item acquired!", "Achievement unlocked!"):

1. Create a **Sprite** + **Text** combo on the `UI_Overlay` layer.
2. On trigger, spawn the notification at a fixed position (e.g., top-center).
3. Apply **Tween** behavior: fade in → hold → fade out → destroy.
4. Use an **instance variable** `spawnOrder` to offset multiple simultaneous toasts vertically.

---

## Input Indicators in UI

Show contextual prompts based on the active input device:

```
Gamepad: Is using gamepad
  → Set ButtonPrompt animation to "gamepad"
  → Set ButtonPrompt frame based on button index

Else (keyboard/mouse):
  → Set ButtonPrompt animation to "keyboard"
  → Set ButtonPrompt frame based on key
```

Maintain a **SpriteSheet** with frames for keyboard keys (WASD, Space, Esc) and gamepad buttons (A, B, X, Y, bumpers). Switch the displayed frame based on the last input type detected.

---

## Performance Tips

- **Minimize text updates.** Only set text when the value actually changes — use `Compare instance variable` or `Trigger once` to gate updates.
- **Use "Force own texture"** on complex UI layers to batch draw calls.
- **Avoid spawning/destroying UI objects every tick.** Create them once; toggle visibility.
- **SpriteFont is cheaper than Text** for static labels — Text objects invoke the browser's text layout engine.
- **Limit Tween count.** Running 20+ simultaneous tweens on UI elements can cause frame drops on mobile. Queue animations instead of running them all at once.

---

## Troubleshooting

| Problem | Cause | Fix |
|---------|-------|-----|
| HUD scrolls with camera | Parallax not set to 0,0 | Set layer Parallax to 0%, 0% |
| HUD scales when zooming | Scale rate not set to 0 | Set layer Scale rate to 0 |
| UI elements misaligned on mobile | No Anchor behavior | Add Anchor behavior; bind edges to viewport |
| Text looks blurry | Viewport scaling with non-integer factor | Enable "Pixel rounding" in project properties or use SpriteFont |
| Global objects appear on wrong layer | Layer name mismatch between layouts | Ensure all layouts have a layer with the same name and properties |
| 9-patch corners stretched | Margins set incorrectly | Adjust Left/Right/Top/Bottom margins to match the unstretched corner size |
