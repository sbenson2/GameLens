# G78 — Gum Hot Reload & Editor Workflow

> **Category:** guide · **Engine:** MonoGame · **Related:** [G5 UI Framework](./G5_ui_framework.md) · [G50 Hot Reload & Live Editing](./G50_hot_reload_live_editing.md) · [G55 Settings & Options Menu](./G55_settings_options_menu.md) · [G8 Content Pipeline](./G8_content_pipeline.md)

How to use the Gum visual editor and GumCLI alongside your MonoGame project for rapid UI iteration. Covers the editor-to-code roundtrip, hot reload setup, NineSlice tiling, and production workflow patterns that keep your UI design loop under two seconds.

---

## Why an Editor Workflow Matters

G5 covers Gum's code-only API — building layouts in C# with `ContainerRuntime`, Forms controls, and the layout system. That approach works, but complex UIs (inventory grids, dialogue trees, settings screens) iterate faster when you can see changes visually before writing code.

The Gum Tool is a standalone WYSIWYG editor that produces XML project files (`.gumx`). Your MonoGame game loads these files at runtime, and with hot reload enabled, any change you save in the editor appears in the running game within a frame or two — no recompilation needed.

```
Gum Tool (.gumx XML)  ──►  File save  ──►  Game detects change  ──►  UI rebuilds live
       ▲                                              │
       └──────────── iterate visually ◄───────────────┘
```

---

## Setting Up the Gum Tool

### Installation

Download the Gum Tool from the [official releases](https://github.com/vchelaru/Gum/releases) or install via the GumCLI (see below). The editor runs on Windows natively and on Linux/macOS via Wine or .NET.

### Project Structure

A Gum project produces this file tree alongside your MonoGame content:

```
Content/
├── GumProject.gumx          # root project file
├── Screens/
│   ├── MainMenuScreen.gusx   # screen definitions
│   └── HudScreen.gusx
├── Components/
│   ├── HealthBar.gucx        # reusable components
│   └── InventorySlot.gucx
├── Standards/                # base types (Text, Sprite, NineSlice, etc.)
└── FontCache/                # generated bitmap fonts
```

### Loading a Gum Project in MonoGame

```csharp
protected override void Initialize()
{
    // Initialize with default visuals (V3 is current)
    GumService.Default.Initialize(this, DefaultVisualsVersion.V3);

    // Load the Gum project — all screens, components, and standards
    GumService.Default.Initialize(this, "Content/GumProject.gumx");

    base.Initialize();
}
```

Once loaded, screens and components defined in the editor are available by name:

```csharp
// Show a screen defined in the Gum Tool
var mainMenu = GumService.Default.GetScreen("MainMenuScreen");
mainMenu.AddToRoot();
```

---

## Hot Reload Setup

Hot reload watches your Gum project files on disk and reloads the UI when any `.gusx`, `.gucx`, or `.gumx` file changes. This is the core of the fast iteration loop.

### Enabling Hot Reload

Add a single line after initialization:

```csharp
protected override void Initialize()
{
    GumService.Default.Initialize(this, "Content/GumProject.gumx");

    // Enable live editing — watches Gum project files for changes
    GumService.Default.EnableLiveEditing();

    base.Initialize();
}
```

When `EnableLiveEditing()` is active:

1. A `FileSystemWatcher` monitors the Gum project directory
2. On file change, the affected screen or component XML is re-parsed
3. The visual tree rebuilds with new layout properties, text, colors, and sizes
4. State changes (hover, pressed, disabled) are preserved across reloads

### Workflow

1. Run your MonoGame game in Debug mode
2. Open the same Gum project in the Gum Tool
3. Edit a screen — move elements, change colors, adjust spacing
4. Save in the Gum Tool (Ctrl+S)
5. The running game updates within one frame

### What Hot Reload Handles

| Reloads Correctly | Requires Game Restart |
|---|---|
| Position, size, layout changes | Adding new screens (need re-registration) |
| Color, alpha, visibility | Font changes (bitmap fonts cached at startup) |
| Text content changes | New texture files (content pipeline rebuild) |
| Stacking and spacing | Code-behind event handlers |
| State animations | New custom runtime types |
| NineSlice border sizes | |

### Performance Consideration

Hot reload is designed for development only. In release builds, skip `EnableLiveEditing()` to avoid the `FileSystemWatcher` overhead:

```csharp
#if DEBUG
    GumService.Default.EnableLiveEditing();
#endif
```

---

## GumCLI

GumCLI is a command-line tool (introduced March 2026) for automating Gum project tasks outside the visual editor.

### Installation

```bash
dotnet tool install --global GumCLI
```

### Common Commands

```bash
# Validate a Gum project (check for missing references, broken paths)
gumcli validate --project Content/GumProject.gumx

# Export a screen to PNG (for documentation or asset pipelines)
gumcli export --screen MainMenuScreen --output ./screenshots/

# List all components and their dependencies
gumcli list --project Content/GumProject.gumx --type components
```

GumCLI is useful in CI pipelines for catching broken UI references before they reach a build.

---

## NineSlice Tiling

NineSlice rendering divides a texture into nine regions (four corners, four edges, center) so the element can resize without distorting its borders. Gum's `NineSliceRuntime` supports this natively.

### Basic NineSlice Setup

```csharp
var panel = new NineSliceRuntime();
panel.SourceFile = "Content/UI/panel_bg.png";

// Define the border insets (pixels from each edge)
panel.TextureLeft = 12;
panel.TextureTop = 12;
panel.TextureWidth = 100;  // source texture region width
panel.TextureHeight = 100;

// The panel can now resize freely — corners stay crisp
panel.Width = 400;
panel.Height = 300;
panel.AddToRoot();
```

### Middle Tiling (March 2026)

By default, NineSlice stretches the edges and center to fill the available space. The March 2026 update added **middle tiling** — the edges and center repeat (tile) instead of stretching, which looks better for patterns like brick borders, dotted frames, or textured backgrounds.

In the Gum Tool, select a NineSlice element and set the **Texture Treatment** to **Tile** for edges and/or center regions.

In code:

```csharp
var panel = new NineSliceRuntime();
panel.SourceFile = "Content/UI/brick_border.png";

// Enable tiling for the center and edge regions
// instead of the default stretch behavior
panel.TextureAddressMode = TextureAddressMode.Wrap;
```

**When to tile vs. stretch:**

| Use Case | Mode |
|---|---|
| Solid color panels, gradients | Stretch (default) |
| Patterned borders (bricks, chains) | Tile |
| Textured backgrounds (parchment, wood) | Tile |
| Simple rounded rectangles | Stretch |

---

## Editor-to-Code Roundtrip Patterns

### Pattern 1: Editor Layout, Code Behavior

Define all visual layout in the Gum Tool. Attach behavior in code by looking up named elements:

```csharp
// Load the screen from the Gum project
var screen = GumService.Default.GetScreen("MainMenuScreen");
screen.AddToRoot();

// Find named elements and attach behavior
var playButton = screen.GetGraphicalUiElementByName("PlayButton");
var playForms = new Button(playButton); // wrap in Forms control
playForms.Click += (s, e) => StartGame();

var volumeSlider = screen.GetGraphicalUiElementByName("VolumeSlider");
var sliderForms = new Slider(volumeSlider);
sliderForms.ValueChanged += (s, e) => SetVolume(sliderForms.Value / 100f);
```

**Advantages:** Designers can rearrange the layout without touching code. Hot reload works for all visual changes.

### Pattern 2: Component Library in Editor, Assembly in Code

Build reusable components (buttons, cards, list items) in the Gum Tool. Assemble them programmatically for dynamic content:

```csharp
// Inventory grid — layout defined in editor, populated in code
var grid = GumService.Default.GetScreen("InventoryGrid");
var slotTemplate = GumService.Default.GetComponent("InventorySlot");

foreach (var item in player.Inventory)
{
    var slot = slotTemplate.Clone();
    slot.SetProperty("ItemName", item.Name);
    slot.SetProperty("IconTexture", item.IconPath);
    grid.Children.Add(slot);
}
```

### Pattern 3: States for Animation in Editor

Define visual states (Idle, Hovered, Pressed, Disabled) in the Gum Tool with interpolation settings. The Forms controls automatically transition between states. Hot reload lets you tweak easing curves and durations without recompiling.

---

## Production Checklist

Before shipping, ensure your Gum workflow is release-ready:

- [ ] Remove `EnableLiveEditing()` from release builds (use `#if DEBUG`)
- [ ] Run `gumcli validate` in your CI pipeline to catch broken references
- [ ] Embed Gum XML files via the content pipeline or copy them to the output directory
- [ ] Test on all target platforms — font rendering may vary between Windows and Linux
- [ ] Profile UI draw calls — complex Gum screens can generate many texture swaps; pack sprites into atlases (see G5 §7)
- [ ] Ensure NineSlice textures are power-of-two if using tiling mode on older GPUs

---

## Common Pitfalls

**"Hot reload isn't detecting changes"** — Ensure the Gum project path passed to `Initialize` matches the directory being watched. Relative paths resolve from the game's working directory, which can differ between IDE debug and standalone runs.

**"Elements disappear after hot reload"** — Code-created children added to editor-defined containers are cleared on reload. Store dynamic children in a separate code-managed container that you re-populate after reload events.

**"Gum project won't load on Linux"** — Gum XML uses Windows path separators internally. The loader normalizes these automatically on modern versions, but check your Gum NuGet is at least `2026.1.x`.

---
