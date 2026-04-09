# G05 — UI System

> **Category:** Guide · **Engine:** Stride · **Related:** [G01 Getting Started](./G01_getting_started.md) · [G03 Code-Only Development](./G03_code_only_development.md) · [Stride Architecture Rules](../stride-arch-rules.md)

Stride includes a built-in UI framework with layout panels, controls, input handling, and both editor-based and code-only workflows. The system supports screen-space (HUD) and world-space (billboarded/3D) UI, resolution-independent layout via virtual resolution, and a familiar panel-based hierarchy similar to WPF/XAML. This guide covers the full UI stack — from creating pages in the editor to building entire interfaces in code.

---

## Table of Contents

1. [Architecture Overview](#1--architecture-overview)
2. [UI Assets: UIPage and UILibrary](#2--ui-assets-uipage-and-uilibrary)
3. [UIComponent Setup](#3--uicomponent-setup)
4. [Layout Panels](#4--layout-panels)
5. [Controls](#5--controls)
6. [Accessing UI Elements from Scripts](#6--accessing-ui-elements-from-scripts)
7. [Building UI Entirely in Code](#7--building-ui-entirely-in-code)
8. [Input and Event Handling](#8--input-and-event-handling)
9. [Styling and Theming](#9--styling-and-theming)
10. [World-Space UI](#10--world-space-ui)
11. [Resolution Independence](#11--resolution-independence)
12. [Performance Considerations](#12--performance-considerations)
13. [Common Pitfalls](#13--common-pitfalls)

---

## 1 — Architecture Overview

Stride's UI system is built on three layers:

- **UI Assets** (`UIPage`, `UILibrary`) — design-time definitions of UI hierarchies, created in Game Studio or code.
- **UIComponent** — an entity component that attaches a `UIPage` to a scene entity, controlling render mode (screen-space or world-space), virtual resolution, and interaction settings.
- **UI Elements** — the controls and panels that form the visual tree: `Button`, `TextBlock`, `Grid`, `StackPanel`, `ScrollViewer`, etc.

The rendering pipeline draws UI elements after the 3D scene pass (for screen-space UI) or within the scene (for world-space UI).

### Comparison with MonoGame

| Aspect | Stride | MonoGame/FNA |
|--------|--------|-------------|
| Built-in UI | Yes — full framework | None — build your own or use a library |
| Layout engine | Panel-based (Grid, StackPanel, Canvas) | N/A |
| Editor support | Visual UI editor in Game Studio | N/A |
| World-space UI | Built-in billboard/3D modes | Manual implementation |
| Data binding | Limited — manual property updates | N/A |

## 2 — UI Assets: UIPage and UILibrary

### UIPage

A `UIPage` is a self-contained UI screen — a main menu, HUD overlay, settings panel, etc. Each `UIPage` has a single root element (typically a panel) that contains the full hierarchy.

- Created in Game Studio via **Asset → Add asset → UI → UI Page**
- Contains a visual tree of UI elements
- Assigned to a `UIComponent` on an entity
- Runtime type: `Stride.UI.UIPage`

### UILibrary

A `UILibrary` is a reusable collection of UI element templates (like prefabs for UI). Use libraries for elements that appear in multiple pages — health bars, dialog boxes, inventory slots.

- Created in Game Studio via **Asset → Add asset → UI → UI Library**
- Contains named root elements that can be instantiated at runtime
- Runtime type: `Stride.UI.UILibrary`

```csharp
// Instantiate a UI element from a library at runtime
public UILibrary SharedUILibrary { get; set; } // Set in editor

public override void Start()
{
    // Get a named element from the library — returns a deep copy
    var healthBar = SharedUILibrary.InstantiateElement<Grid>("HealthBar");
    // Add to current page
    var rootPanel = Entity.Get<UIComponent>().Page.RootElement as Panel;
    rootPanel.Children.Add(healthBar);
}
```

## 3 — UIComponent Setup

Attach a `UIComponent` to any entity to display UI. The component has several key properties:

| Property | Type | Description |
|----------|------|-------------|
| `Page` | `UIPage` | The UI page to display |
| `Resolution` | `Vector3` | Virtual resolution in pixels (e.g., 1920×1080) |
| `IsFullScreen` | `bool` | When true, renders as screen-space overlay |
| `IsBillboard` | `bool` | When true, UI always faces the camera (world-space) |
| `IsFixedSize` | `bool` | When true, UI size is in world units, not screen-relative |
| `RenderGroup` | `RenderGroup` | Controls render ordering |

### Screen-Space HUD Setup

```csharp
public override void Start()
{
    var uiComponent = Entity.GetOrCreate<UIComponent>();
    uiComponent.Page = myUIPage; // Assign your UIPage asset
    uiComponent.Resolution = new Vector3(1920, 1080, 1000);
    uiComponent.IsFullScreen = true;
}
```

### World-Space UI (e.g., Floating Health Bar)

```csharp
var uiComponent = Entity.GetOrCreate<UIComponent>();
uiComponent.Page = healthBarPage;
uiComponent.IsFullScreen = false;
uiComponent.IsBillboard = true;  // Face camera
uiComponent.IsFixedSize = false; // Scale with distance
uiComponent.Resolution = new Vector3(200, 40, 500);
```

## 4 — Layout Panels

Stride provides several panel types for arranging child elements:

### StackPanel

Arranges children in a single row or column.

```csharp
var panel = new StackPanel
{
    Orientation = Orientation.Vertical,
    HorizontalAlignment = HorizontalAlignment.Center,
    VerticalAlignment = VerticalAlignment.Center
};
panel.Children.Add(titleText);
panel.Children.Add(startButton);
panel.Children.Add(optionsButton);
panel.Children.Add(quitButton);
```

### Grid

Arranges children in rows and columns with configurable sizing.

```csharp
var grid = new Grid();

// Define columns: 200px fixed, remaining space, 100px fixed
grid.ColumnDefinitions.Add(new StripDefinition(StripType.Fixed, 200));
grid.ColumnDefinitions.Add(new StripDefinition(StripType.Star, 1));
grid.ColumnDefinitions.Add(new StripDefinition(StripType.Fixed, 100));

// Define rows
grid.RowDefinitions.Add(new StripDefinition(StripType.Auto));  // Size to content
grid.RowDefinitions.Add(new StripDefinition(StripType.Star, 1)); // Fill remaining

// Position children in cells
var label = new TextBlock { Text = "Name:" };
label.SetGridColumn(0);
label.SetGridRow(0);
grid.Children.Add(label);

var inputField = new EditText();
inputField.SetGridColumn(1);
inputField.SetGridRow(0);
grid.Children.Add(inputField);
```

### Canvas

Positions children at absolute coordinates — useful for minimap overlays, drag-and-drop, or freeform layouts.

```csharp
var canvas = new Canvas();

var icon = new ImageElement { Source = iconSprite };
icon.SetCanvasAbsolutePosition(new Vector3(50, 50, 0));
canvas.Children.Add(icon);
```

### UniformGrid

A simplified grid where all cells are equal size.

```csharp
var inventoryGrid = new UniformGrid
{
    Columns = 8,
    Rows = 4
};
// Add 32 inventory slot elements
for (int i = 0; i < 32; i++)
{
    inventoryGrid.Children.Add(CreateInventorySlot(i));
}
```

### ScrollViewer

Wraps a single child and provides scrollable viewport — essential for lists, text logs, or content taller than the screen.

```csharp
var scrollViewer = new ScrollViewer
{
    ScrollMode = ScrollingMode.Vertical
};
scrollViewer.Content = longContentPanel;
```

## 5 — Controls

### TextBlock (Read-Only Text)

```csharp
var title = new TextBlock
{
    Text = "Game Title",
    Font = myFont,            // SpriteFont asset
    TextSize = 36,
    TextColor = Color.White,
    HorizontalAlignment = HorizontalAlignment.Center
};
```

### Button

Buttons can contain any UI element as their `Content`:

```csharp
var button = new Button
{
    Content = new TextBlock
    {
        Text = "Start Game",
        Font = myFont,
        TextSize = 24,
        TextColor = Color.White
    },
    Padding = new Thickness(20, 10, 20, 10),
    BackgroundColor = new Color(40, 40, 80),
    HorizontalAlignment = HorizontalAlignment.Center
};
button.Click += (sender, args) =>
{
    // Handle button click
    StartGame();
};
```

### EditText (Text Input)

```csharp
var input = new EditText
{
    Font = myFont,
    TextSize = 18,
    MaxLength = 20,
    Text = "",
    MinimumWidth = 300
};
input.TextChanged += (sender, args) =>
{
    playerName = input.Text;
};
```

### ImageElement

```csharp
var portrait = new ImageElement
{
    Source = new SpriteFromTexture { Texture = portraitTexture },
    StretchType = StretchType.Uniform, // Preserve aspect ratio
    Width = 128,
    Height = 128
};
```

### Slider

```csharp
var volumeSlider = new Slider
{
    Minimum = 0,
    Maximum = 100,
    Value = 75,
    Orientation = Orientation.Horizontal,
    Width = 300
};
volumeSlider.ValueChanged += (sender, args) =>
{
    SetVolume(volumeSlider.Value / 100f);
};
```

### ToggleButton

```csharp
var fullscreenToggle = new ToggleButton
{
    Content = new TextBlock { Text = "Fullscreen", Font = myFont },
    IsChecked = false
};
fullscreenToggle.Click += (sender, args) =>
{
    ToggleFullscreen(fullscreenToggle.IsChecked ?? false);
};
```

## 6 — Accessing UI Elements from Scripts

When building UI in the Game Studio editor, access elements by name from scripts:

```csharp
public class MainMenuUI : SyncScript
{
    public override void Start()
    {
        // Get the root element from the UIComponent's page
        var page = Entity.Get<UIComponent>().Page;

        // Find elements by type and name
        var startBtn = page.RootElement.FindVisualChildOfType<Button>("StartButton");
        var quitBtn = page.RootElement.FindVisualChildOfType<Button>("QuitButton");
        var titleText = page.RootElement.FindVisualChildOfType<TextBlock>("TitleText");

        // Wire up events
        startBtn.Click += (s, e) => StartGame();
        quitBtn.Click += (s, e) => QuitGame();

        // Update text dynamically
        titleText.Text = "Welcome, Player!";
    }

    public override void Update() { }
}
```

### FindVisualChildOfType Behavior

- Searches the visual tree recursively by type and name
- Returns `null` if not found — always null-check
- Name matching is case-sensitive
- For editor-created UI, element names are set in the UI editor's property panel

## 7 — Building UI Entirely in Code

For code-only projects (no Game Studio), build the entire UI programmatically:

```csharp
public class CodeOnlyUI : SyncScript
{
    public SpriteFont Font { get; set; }

    private TextBlock scoreText;

    public override void Start()
    {
        scoreText = new TextBlock
        {
            Text = "Score: 0",
            Font = Font,
            TextSize = 24,
            TextColor = Color.White
        };

        var pauseButton = new Button
        {
            Content = new TextBlock
            {
                Text = "Pause",
                Font = Font,
                TextSize = 18
            },
            BackgroundColor = new Color(60, 60, 60),
            Padding = new Thickness(15, 8)
        };
        pauseButton.Click += (s, e) => TogglePause();

        var hudPanel = new StackPanel
        {
            Orientation = Orientation.Horizontal,
            HorizontalAlignment = HorizontalAlignment.Stretch,
            VerticalAlignment = VerticalAlignment.Top,
            Margin = new Thickness(20, 10)
        };
        hudPanel.Children.Add(scoreText);
        hudPanel.Children.Add(pauseButton);

        // Create the UIPage and assign to component
        var page = new UIPage { RootElement = hudPanel };
        var uiComponent = Entity.GetOrCreate<UIComponent>();
        uiComponent.Page = page;
        uiComponent.Resolution = new Vector3(1920, 1080, 1000);
        uiComponent.IsFullScreen = true;
    }

    public override void Update()
    {
        // Update score display each frame
        scoreText.Text = $"Score: {GetCurrentScore()}";
    }

    private int GetCurrentScore() => /* game logic */ 0;
    private void TogglePause() => /* pause logic */ { };
}
```

## 8 — Input and Event Handling

### Routed Events

Stride UI uses a routed event model (similar to WPF). Events bubble up from the source element through the visual tree:

```csharp
// Direct handler on the button
button.Click += OnButtonClick;

// Or handle at a parent level — catches clicks from all child buttons
parentPanel.Click += (sender, args) =>
{
    if (args.Source is Button clickedButton)
    {
        HandleAnyButtonClick(clickedButton.Name);
    }
};
```

### Touch and Mouse Events

All interactive elements support:

| Event | Fires When |
|-------|------------|
| `TouchDown` | Pointer pressed on element |
| `TouchUp` | Pointer released |
| `TouchMove` | Pointer moved while pressed |
| `TouchEnter` | Pointer enters element bounds |
| `TouchLeave` | Pointer leaves element bounds |
| `Click` | Complete press-release cycle |

```csharp
element.TouchEnter += (s, e) => element.BackgroundColor = hoverColor;
element.TouchLeave += (s, e) => element.BackgroundColor = normalColor;
```

### Keyboard Focus

```csharp
// Set keyboard focus to a text input
editText.SetFocus();

// Check if element has focus
if (editText.IsFocused)
{
    // Handle focused state
}
```

## 9 — Styling and Theming

Stride does not have a CSS-like style system, but you can implement consistent theming through helper methods:

```csharp
public static class UITheme
{
    public static Color PrimaryColor => new Color(65, 105, 225);
    public static Color BackgroundColor => new Color(30, 30, 40);
    public static Color TextColor => Color.White;
    public static float DefaultTextSize => 20f;

    public static Button CreateStyledButton(string text, SpriteFont font)
    {
        return new Button
        {
            Content = new TextBlock
            {
                Text = text,
                Font = font,
                TextSize = DefaultTextSize,
                TextColor = TextColor
            },
            BackgroundColor = PrimaryColor,
            Padding = new Thickness(20, 10),
            Margin = new Thickness(0, 5),
            HorizontalAlignment = HorizontalAlignment.Stretch
        };
    }

    public static TextBlock CreateHeader(string text, SpriteFont font)
    {
        return new TextBlock
        {
            Text = text,
            Font = font,
            TextSize = 32,
            TextColor = TextColor,
            HorizontalAlignment = HorizontalAlignment.Center,
            Margin = new Thickness(0, 0, 0, 20)
        };
    }
}
```

## 10 — World-Space UI

World-space UI attaches to entities in the 3D scene — health bars over characters, interaction prompts, signs, computer screens in-game.

```csharp
public class FloatingHealthBar : SyncScript
{
    public float MaxHealth { get; set; } = 100f;
    public float CurrentHealth { get; set; } = 100f;

    private ImageElement fillBar;

    public override void Start()
    {
        var background = new ImageElement
        {
            Source = /* dark bar sprite */,
            Width = 200,
            Height = 20
        };

        fillBar = new ImageElement
        {
            Source = /* green bar sprite */,
            Width = 200,
            Height = 20,
            HorizontalAlignment = HorizontalAlignment.Left
        };

        var canvas = new Canvas();
        canvas.Children.Add(background);
        canvas.Children.Add(fillBar);

        var page = new UIPage { RootElement = canvas };
        var ui = Entity.GetOrCreate<UIComponent>();
        ui.Page = page;
        ui.IsFullScreen = false;
        ui.IsBillboard = true;
        ui.Resolution = new Vector3(200, 20, 500);
    }

    public override void Update()
    {
        float ratio = CurrentHealth / MaxHealth;
        fillBar.Width = 200 * ratio;
    }
}
```

## 11 — Resolution Independence

Stride's virtual resolution system scales UI to any display resolution:

```csharp
// Set virtual resolution on the UIComponent
uiComponent.Resolution = new Vector3(1920, 1080, 1000);
// The Z component sets the depth range for 3D UI element ordering
```

Design all layout dimensions against the virtual resolution (e.g., 1920×1080). Stride scales the entire UI tree to match the actual window size, maintaining aspect ratio.

For elements that should adapt to different aspect ratios, use relative sizing:

```csharp
// Use Star sizing in grids for proportional layouts
grid.ColumnDefinitions.Add(new StripDefinition(StripType.Star, 1)); // 25%
grid.ColumnDefinitions.Add(new StripDefinition(StripType.Star, 3)); // 75%

// Use alignment and margin for responsive positioning
element.HorizontalAlignment = HorizontalAlignment.Stretch;
element.Margin = new Thickness(20); // 20px virtual margin on all sides
```

## 12 — Performance Considerations

- **Minimize tree depth.** Deep nesting of panels increases layout computation. Flatten where possible.
- **Avoid per-frame element creation.** Create UI elements once in `Start()`, update properties (text, color, visibility) in `Update()`.
- **Use `Visibility` instead of add/remove.** Toggle `element.Visibility = Visibility.Collapsed` rather than adding/removing from the tree.
- **Batch text updates.** Changing `TextBlock.Text` triggers layout recalculation. Batch text changes when updating multiple elements simultaneously.
- **World-space UI draws per-entity.** Each entity with a `UIComponent` is a separate draw call. For many floating health bars, consider a single screen-space overlay that positions elements to match world positions.

## 13 — Common Pitfalls

### Pitfall 1: UIComponent Without a Page

**Problem:** Entity has a `UIComponent` but nothing renders.
**Solution:** Assign a `UIPage` to the `Page` property. A `UIComponent` without a page is a no-op.

### Pitfall 2: FindVisualChildOfType Returns Null

**Problem:** `FindVisualChildOfType<Button>("MyButton")` returns null even though the button exists in the editor.
**Solution:** Check the element name in the UI editor (not the entity name). Names are case-sensitive. Also ensure the UI page is fully loaded before querying — access elements in `Start()`, not in the constructor.

### Pitfall 3: Click Events Not Firing

**Problem:** Button click handlers never execute.
**Solution:** Ensure `CanBeHitByUser = true` on the element (default for Button, but may need explicit setting on custom elements). For world-space UI, verify the entity has proper collision/raycast setup for UI interaction.

### Pitfall 4: Text Not Visible

**Problem:** `TextBlock` is added but text is invisible.
**Solution:** Ensure you have assigned a `SpriteFont` asset to the `Font` property. Without a font, text cannot render. Also check that `TextColor` is not transparent or the same as the background.

### Pitfall 5: Virtual Resolution Mismatch

**Problem:** UI elements appear too small or too large on different displays.
**Solution:** Set the `Resolution` property on `UIComponent` consistently. All child element dimensions are in virtual pixels relative to this resolution. A 100×50 button at 1920×1080 virtual resolution occupies roughly 5% of screen width regardless of actual display resolution.
