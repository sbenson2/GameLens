# R3 — Raylib GUI and Tooling Reference

> **Category:** reference · **Engine:** Raylib · **Related:** [Architecture Overview](../architecture/E1_architecture_overview.md) · [Getting Started](../guides/G1_getting_started.md) · [Language Bindings](R1_language_bindings.md) · [Raylib Rules](../raylib-arch-rules.md)

---

## raygui: Immediate-Mode GUI for Raylib

**raygui** is raylib's companion GUI library — a single-header, immediate-mode GUI designed for tools development. It follows the same philosophy as raylib: simple C API, zero dependencies beyond raylib, no retained state to manage.

Current stable version: **raygui 4.0** (API-breaking redesign from 3.x). Version 5.0 is in development targeting March 2026 with expanded control support.

### How Immediate-Mode GUI Works

Unlike retained-mode GUIs (Qt, GTK, WinForms) where you create widget objects and manage their lifecycle, immediate-mode GUIs are called every frame inside your draw loop. The function both renders the control and returns its state:

```c
#include "raylib.h"

#define RAYGUI_IMPLEMENTATION
#include "raygui.h"

int main(void) {
    InitWindow(800, 600, "raygui demo");
    SetTargetFPS(60);

    bool showMessageBox = false;
    float sliderValue = 50.0f;
    bool checkboxChecked = false;
    int dropdownActive = 0;
    bool dropdownEditMode = false;

    while (!WindowShouldClose()) {
        BeginDrawing();
        ClearBackground(RAYWHITE);

        // Button returns true on click — no callbacks needed
        if (GuiButton((Rectangle){ 24, 24, 120, 30 }, "Show Message")) {
            showMessageBox = true;
        }

        // Slider modifies value directly via pointer
        GuiSliderBar(
            (Rectangle){ 24, 70, 200, 20 },
            "Min", "Max",
            &sliderValue, 0.0f, 100.0f
        );

        // Checkbox toggles boolean
        GuiCheckBox(
            (Rectangle){ 24, 110, 20, 20 },
            "Enable feature",
            &checkboxChecked
        );

        // DropdownBox needs edit-mode toggle
        if (GuiDropdownBox(
            (Rectangle){ 24, 150, 150, 30 },
            "Option A;Option B;Option C",
            &dropdownActive,
            dropdownEditMode
        )) {
            dropdownEditMode = !dropdownEditMode;
        }

        // Message box overlay
        if (showMessageBox) {
            int result = GuiMessageBox(
                (Rectangle){ 200, 150, 300, 150 },
                "Confirm", "Are you sure?", "Yes;No"
            );
            if (result >= 0) showMessageBox = false;
        }

        EndDrawing();
    }

    CloseWindow();
    return 0;
}
```

### Complete Control Inventory

raygui provides **25+ controls** organized into three tiers:

**Basic Controls:**

| Control | Function | Returns/Modifies |
|---------|----------|-----------------|
| Label | `GuiLabel()` | Displays static text |
| Button | `GuiButton()` | `true` on click |
| LabelButton | `GuiLabelButton()` | Clickable text label |
| Toggle | `GuiToggle()` | Toggles `bool*` |
| ToggleGroup | `GuiToggleGroup()` | Active index (`int*`) |
| ToggleSlider | `GuiToggleSlider()` | Slider-style toggle |
| CheckBox | `GuiCheckBox()` | Toggles `bool*` |
| ComboBox | `GuiComboBox()` | Active index (`int*`) |
| DropdownBox | `GuiDropdownBox()` | Active index, needs edit mode |
| TextBox | `GuiTextBox()` | Edits `char*` buffer |
| ValueBox | `GuiValueBox()` | Edits `int*` |
| Spinner | `GuiSpinner()` | Increments/decrements `int*` |
| Slider | `GuiSlider()` | Modifies `float*` |
| SliderBar | `GuiSliderBar()` | Modifies `float*` (filled bar) |
| ProgressBar | `GuiProgressBar()` | Displays `float` progress |
| StatusBar | `GuiStatusBar()` | Displays status text |
| DummyRec | `GuiDummyRec()` | Placeholder rectangle |
| Grid | `GuiGrid()` | Returns clicked cell |

**Container/Separator Controls:**

| Control | Function | Purpose |
|---------|----------|---------|
| WindowBox | `GuiWindowBox()` | Draggable window with close button |
| GroupBox | `GuiGroupBox()` | Labeled group border |
| Line | `GuiLine()` | Horizontal separator |
| Panel | `GuiPanel()` | Background panel |
| ScrollPanel | `GuiScrollPanel()` | Scrollable content area |
| TabBar | `GuiTabBar()` | Tab navigation |

**Advanced Controls:**

| Control | Function | Purpose |
|---------|----------|---------|
| ListView | `GuiListView()` | Scrollable item list |
| ColorPicker | `GuiColorPicker()` | Full color selection |
| MessageBox | `GuiMessageBox()` | Modal dialog with buttons |
| TextInputBox | `GuiTextInputBox()` | Modal text input dialog |

### Version 5.0 Upcoming Features

raygui 5.0 (targeting March 2026) adds:

- Support for up to **32 controls** (expanded from current set)
- `guiControlExclusiveMode` / `guiControlExclusiveRec` — exclusive input focus for specific controls
- `GuiValueBoxFloat()` — floating-point value editing
- New `GuiDropdownBox()` properties: `DROPDOWN_ARROW_HIDDEN`, `DROPDOWN_ROLL_UP`
- Enhanced `GuiListView()` properties
- `GuiLoadIconsFromMemory()` — load icon sets from memory buffers
- Multiple new built-in icons

---

## Style and Theming System

raygui includes a default style loaded automatically at runtime. Custom styles can be created and applied for consistent visual identity across tools.

### Loading Custom Styles

```c
// Load a style file (exported from rGuiStyler)
GuiLoadStyle("jungle.rgs");

// Reset to default style
GuiLoadStyleDefault();
```

### Style Properties

Every control's appearance is defined by a set of properties across three states: **NORMAL**, **FOCUSED**, **PRESSED**, and **DISABLED**. Properties include:

- `BORDER_COLOR_NORMAL`, `BASE_COLOR_NORMAL`, `TEXT_COLOR_NORMAL`
- `BORDER_WIDTH`, `TEXT_PADDING`, `TEXT_ALIGNMENT`
- Font size and spacing via `GuiSetFont()` and `GuiSetStyle()`

```c
// Set global text size
GuiSetStyle(DEFAULT, TEXT_SIZE, 20);

// Set button-specific border width
GuiSetStyle(BUTTON, BORDER_WIDTH, 2);

// Set a custom font for all controls
Font customFont = LoadFont("myfont.ttf");
GuiSetFont(customFont);
```

### Built-in Icon System

raygui includes a built-in set of **1-bit pixel icons** (256 icons, 16×16 pixels each). Use them in label text with the `#nnn#` syntax:

```c
// Show icon 5 (FILE_OPEN) before text
GuiButton((Rectangle){ 24, 24, 150, 30 }, "#005#Open File");

// Icon only, no text
GuiButton((Rectangle){ 24, 64, 30, 30 }, "#005#");
```

---

## Companion Tools

Three official tools are built with raygui itself, demonstrating its capabilities:

### rGuiStyler — Visual Style Editor

Creates `.rgs` style files that customize every control's colors, borders, fonts, and spacing. Export styles as code or binary for runtime loading.

- **Use case:** Create branded themes for your game's debug tools or level editors
- **Output:** `.rgs` binary style files loadable with `GuiLoadStyle()`

### rGuiIcons — Icon Editor

Edit the built-in 1-bit icon set or create entirely custom icon collections.

- **Use case:** Replace default icons with game-specific iconography
- **Output:** Icon data loadable at runtime

### rGuiLayout — Visual Layout Editor

Drag-and-drop placement of raygui controls. Exports a `.rgl` layout file and/or C source code for the layout.

- **Use case:** Rapid prototyping of tool interfaces without manual coordinate math
- **Output:** C code with all `Gui*()` calls and coordinates pre-generated

---

## Integration Pattern: Single-Header Include

raygui follows raylib's single-header pattern. Include it in exactly one `.c` file with the implementation flag:

```c
// In ONE .c file only:
#define RAYGUI_IMPLEMENTATION
#include "raygui.h"

// In all other files that need raygui declarations:
#include "raygui.h"
```

**Build note:** raygui depends on raylib — it uses raylib's drawing functions internally. Always link raylib when using raygui.

---

## Common Patterns for Game Dev Tools

### In-Game Debug Panel

```c
void DrawDebugPanel(GameState *state) {
    // Semi-transparent background
    GuiPanel((Rectangle){ 10, 10, 250, 300 }, "Debug");

    GuiLabel((Rectangle){ 20, 40, 230, 20 },
        TextFormat("FPS: %d", GetFPS()));

    GuiSliderBar(
        (Rectangle){ 20, 70, 200, 16 },
        "Speed", NULL,
        &state->gameSpeed, 0.1f, 3.0f
    );

    GuiCheckBox(
        (Rectangle){ 20, 100, 16, 16 },
        "Show Hitboxes",
        &state->showHitboxes
    );

    GuiCheckBox(
        (Rectangle){ 20, 130, 16, 16 },
        "God Mode",
        &state->godMode
    );

    if (GuiButton((Rectangle){ 20, 170, 120, 30 }, "Reset Level")) {
        ResetLevel(state);
    }
}
```

### Level Editor Toolbar

```c
void DrawEditorToolbar(EditorState *editor) {
    // Tool selection as toggle group
    editor->activeTool = GuiToggleGroup(
        (Rectangle){ 10, 10, 40, 40 },
        "#022#;#023#;#024#;#025#",  // Icon-only buttons
        editor->activeTool
    );

    // Brush size slider
    GuiSliderBar(
        (Rectangle){ 200, 15, 150, 20 },
        "Size", NULL,
        &editor->brushSize, 1.0f, 16.0f
    );

    // Layer dropdown
    if (GuiDropdownBox(
        (Rectangle){ 400, 10, 120, 30 },
        "BG;FG;Collision;Events",
        &editor->activeLayer,
        editor->layerDropdownOpen
    )) {
        editor->layerDropdownOpen = !editor->layerDropdownOpen;
    }
}
```

---

## Alternatives: Other GUI Options for Raylib

If raygui's immediate-mode approach doesn't fit your needs:

| Library | Style | Language | Notes |
|---------|-------|----------|-------|
| **raygui** | Immediate-mode | C | Official companion, simplest integration |
| **raylib-nuklear** | Immediate-mode | C | More widgets, more complex API |
| **Clay** | Layout-focused | C | Declarative layout system, integrates with raylib renderer |

For most game dev tooling (debug panels, level editors, asset browsers), raygui's simplicity is the right choice. Consider alternatives only if you need complex widget nesting, docking, or rich text editing.
