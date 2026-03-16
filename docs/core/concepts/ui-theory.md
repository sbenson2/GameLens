# UI Architecture -- Theory & Concepts

This document covers engine-agnostic UI architecture theory for games. For engine-specific implementations, see the relevant engine module.

---

## UI Rendering Modes

### Immediate Mode

UI is rebuilt every frame from code. No persistent state. Simple for debug overlays and prototypes.

```
if button("Start Game"):
    start_game()
slider("Volume", volume_ref, 0, 100)
```

### Retained Mode

UI elements are created once and persist in a tree. State changes update properties. Better for complex menus, data-heavy screens, and performance.

```
button = create_button("Start Game")
button.on_click = start_game
root.add_child(button)
```

Most production game UIs use retained mode.

---

## Layout System

### Position Units

- **Pixels from edge** -- absolute offset from a parent edge (left, top, right, bottom)
- **Percentage** -- fraction of parent dimension
- **Pixels from center** -- offset from parent center
- **Relative to children** -- auto-size to fit content

### Size Units

- **Absolute** -- fixed pixel size
- **Relative to container** -- percentage of parent
- **Auto (fit children)** -- shrink-wrap around content with optional padding
- **Ratio** -- proportional sharing of remaining space

### Stacking / Flow

Children can be arranged automatically:

- **Vertical stack** -- top to bottom
- **Horizontal stack** -- left to right
- **Grid** -- rows and columns
- **Wrap** -- flow to next row/column when space runs out

**Stack spacing:** Gap between children in a stack layout.

### Anchoring

Control how an element positions itself relative to its parent:

- **Top-left anchor** -- element grows down and right
- **Center anchor** -- element is centered in parent
- **Stretch** -- element fills parent with optional margins

---

## Common Controls

| Control | Purpose |
|---------|---------|
| **Button** | Click to trigger action |
| **Label** | Display text |
| **TextBox** | Text input |
| **Slider** | Numeric value within range |
| **CheckBox** | Boolean toggle |
| **ListBox** | Scrollable list of items |
| **ComboBox** | Dropdown selection |
| **ScrollViewer** | Scrollable container for overflow content |
| **TreeView** | Hierarchical expandable list |

---

## Screen Management

Organize UI into screens (main menu, options, inventory) that can be shown/hidden:

```
abstract class UIScreen:
    root: container
    show(): build layout, add to root
    hide(): remove from root
    abstract build_layout(root)
```

A screen manager tracks the active screen and handles transitions.

---

## Theming and Styling

### Visual States

Controls have built-in visual states:
- **Normal** -- default appearance
- **Hover** -- mouse is over the control
- **Pressed** -- actively being clicked
- **Focused** -- selected via keyboard/gamepad navigation
- **Disabled** -- cannot be interacted with

Each state can modify colors, borders, scale, and other visual properties.

### Consistent Theming

Define colors, fonts, and sizes centrally. Apply them across all controls for visual consistency. Support theme switching (e.g., dark mode).

---

## Gamepad and Keyboard Navigation

For console games and accessibility:

- **Focus system** -- track which control is currently focused
- **Tab order** -- controls are navigated in order (usually matching visual layout)
- **D-pad / arrow keys** -- move focus between controls
- **Confirm button** -- activate the focused control

The UI framework should handle focus traversal automatically based on the visual tree.

---

## Touch Input

On mobile platforms:
- Touch events map to mouse events (tap = click, drag = scroll)
- Increase hit areas for touch targets (minimum 44x44 points recommended)
- Support swipe gestures for scrolling and page navigation

---

## Data Binding

Connect UI elements to game data so changes propagate automatically:

- **One-way binding** -- data changes update the UI (health bar reflects HP)
- **Two-way binding** -- UI changes update data and vice versa (settings sliders)

### Pattern

```
// Bind a slider to a volume setting
slider.value = settings.sfx_volume
slider.on_value_changed = (v) => settings.sfx_volume = v
// When settings change externally, update slider
settings.on_changed("sfx_volume", (v) => slider.value = v)
```

---

## Performance Tips

- Set elements invisible when off-screen (skip both layout and render)
- Minimize layout recalculation -- avoid changing layout properties every frame
- Use texture atlases for UI sprites to minimize draw calls
- Cache expensive text measurements
- Prefer retained mode for persistent UI; use immediate mode only for transient debug overlays

---

## Framework Selection Guide

| Need | Approach |
|------|----------|
| Full game UI (menus, inventory, HUD) | Retained-mode UI framework |
| Rapid prototyping, dev tools | Immediate-mode or lightweight framework |
| Simple HUD (health bar, score) | Direct rendering (custom draw calls) |

---

*Implementation examples are available in engine-specific modules.*
