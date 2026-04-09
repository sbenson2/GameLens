# G91 — Multi-Window Games & DisplayServer

> **Category:** guide · **Engine:** Godot 4.x · **Related:** [G63 SubViewport Techniques](./G63_subviewport_techniques.md) · [G9 UI Control Systems](./G9_ui_control_systems.md) · [G78 Pixel Perfect 2D](./G78_pixel_perfect_2d_and_camera.md) · [G89 Platform-Specific Optimization](./G89_platform_specific_optimization.md)

Godot 4 introduced first-class multi-window support through the `Window` node and the `DisplayServer` singleton. Unlike Godot 3's limited `Popup` system, Godot 4 windows are full viewports that can render independent scenes, share worlds with the main window, or act as utility panels — and they can be positioned across multiple monitors. This guide covers the architecture, practical patterns, and platform-specific considerations for multi-window games and tools.

---

## Table of Contents

1. [Architecture: Window, Viewport, and DisplayServer](#1-architecture-window-viewport-and-displayserver)
2. [Creating Windows via the Scene Tree](#2-creating-windows-via-the-scene-tree)
3. [Creating Windows via DisplayServer](#3-creating-windows-via-displayserver)
4. [Embedded vs. Native Windows](#4-embedded-vs-native-windows)
5. [Sharing a World Between Windows](#5-sharing-a-world-between-windows)
6. [Multi-Monitor Positioning](#6-multi-monitor-positioning)
7. [Input Routing Across Windows](#7-input-routing-across-windows)
8. [Practical Pattern: Inventory in a Separate Window](#8-practical-pattern-inventory-in-a-separate-window)
9. [Practical Pattern: Mini-Map Window](#9-practical-pattern-mini-map-window)
10. [C# Examples](#10-c-examples)
11. [Platform Considerations](#11-platform-considerations)
12. [Performance Tips](#12-performance-tips)
13. [Common Mistakes](#13-common-mistakes)

---

## 1. Architecture: Window, Viewport, and DisplayServer

Godot 4's display architecture has three layers:

```
DisplayServer          ← Low-level OS window management (singleton)
  └── Window           ← A Viewport that owns an OS-level window
        └── Viewport   ← Rendering surface with its own World2D/World3D
```

**Key relationships:**

- `Window` extends `Viewport`. Every window is a viewport with its own rendering context.
- The main window is the root `Window` of the `SceneTree` — you access it via `get_tree().root`.
- Additional `Window` nodes in the scene tree create native OS windows by default.
- `DisplayServer` is the low-level singleton that manages window handles, monitor enumeration, and OS-level operations.

---

## 2. Creating Windows via the Scene Tree

The simplest approach is adding a `Window` node as a child of any node in your scene tree.

### GDScript

```gdscript
# multi_window_manager.gd
extends Node

@onready var second_window: Window = $SecondWindow

func _ready() -> void:
    # Configure before the window becomes visible
    second_window.title = "Debug Panel"
    second_window.size = Vector2i(400, 300)
    second_window.position = Vector2i(100, 100)
    second_window.visible = true

    # React to the user closing the window
    second_window.close_requested.connect(_on_second_window_close)

func _on_second_window_close() -> void:
    # Hide instead of freeing — cheaper to re-show later
    second_window.visible = false
```

### Creating a Window at Runtime

```gdscript
func open_stats_window() -> void:
    var win := Window.new()
    win.title = "Player Stats"
    win.size = Vector2i(320, 240)
    win.unresizable = false
    win.close_requested.connect(win.queue_free)

    # Add content — a packed scene works best
    var stats_ui := preload("res://ui/stats_panel.tscn").instantiate()
    win.add_child(stats_ui)

    # Add to tree — this triggers the OS window creation
    add_child(win)
```

---

## 3. Creating Windows via DisplayServer

For lower-level control, use `DisplayServer` directly. This is useful when you need window handles for platform interop or when you're not using the scene tree.

### GDScript

```gdscript
func create_low_level_window() -> int:
    # Returns a window ID (int) — 0 is always the main window
    var window_id := DisplayServer.create_sub_window(
        DisplayServer.WINDOW_FLAG_RESIZE_DISABLED,  # flags
        Rect2i(200, 200, 640, 480)                  # position + size
    )

    DisplayServer.window_set_title("Auxiliary View", window_id)

    # To render into this window, assign a Viewport via a SubViewport
    # or use a Window node that references this ID.
    return window_id
```

> **When to use each approach:** Scene-tree `Window` nodes are simpler and integrate with the node lifecycle (signals, `_process`, etc.). `DisplayServer` is for edge cases like headless sub-windows, platform-specific hacks, or when you need the raw window ID for native code.

---

## 4. Embedded vs. Native Windows

A `Window` node has two modes controlled by the `embedded` property (or the project setting `display/window/subwindows/embed_subwindows`):

| Mode | Behavior | Use Case |
|------|----------|----------|
| **Embedded** (`true`) | Rendered inside the parent window as a `Control`-like panel. Cannot leave the main window bounds. | Popups, tooltips, modal dialogs |
| **Native** (`false`) | Creates a real OS window. Can be moved independently, placed on another monitor. | Multi-window games, debug panels, second-screen experiences |

### GDScript — Toggling Mode

```gdscript
# Force a window to be a native OS window
func make_native(win: Window) -> void:
    # This must be set before the window is added to the tree,
    # or you must toggle visibility to re-create the OS window.
    win.embedded = false
```

> **Project setting:** `display/window/subwindows/embed_subwindows` controls the default for all `Window` nodes. Set it to `false` for multi-window games.

---

## 5. Sharing a World Between Windows

By default, each `Window` (being a `Viewport`) creates its own `World3D` and `World2D`. To render the same game world from a different camera angle in a second window, share the world:

### GDScript

```gdscript
# second_camera_window.gd
extends Window

## The main viewport whose world we want to share.
@export var source_viewport: Viewport

func _ready() -> void:
    # Share the 3D world so both windows see the same scene
    world_3d = source_viewport.world_3d
    # Optionally share 2D as well
    world_2d = source_viewport.world_2d
    own_world_3d = false

    # Add a camera to this window for an independent viewpoint
    var cam := Camera3D.new()
    cam.position = Vector3(0, 20, 0)
    cam.rotation_degrees = Vector3(-90, 0, 0)  # Top-down view
    cam.current = true
    add_child(cam)
```

This is the foundation for second-screen experiences: a spectator camera, a top-down mini-map, a rear-view mirror, or a dungeon-master view in a co-op game.

---

## 6. Multi-Monitor Positioning

`DisplayServer` provides monitor enumeration and geometry, letting you place windows on specific screens.

### GDScript

```gdscript
func place_on_monitor(win: Window, monitor_index: int) -> void:
    var screen_count := DisplayServer.get_screen_count()
    if monitor_index >= screen_count:
        push_warning("Monitor %d not found (have %d)" % [monitor_index, screen_count])
        return

    var screen_pos := DisplayServer.screen_get_position(monitor_index)
    var screen_size := DisplayServer.screen_get_size(monitor_index)
    var screen_usable := DisplayServer.screen_get_usable_rect(monitor_index)

    # Center the window on the target monitor's usable area
    var win_size := win.size
    var centered := screen_usable.position + (screen_usable.size - win_size) / 2
    win.position = centered

func list_monitors() -> void:
    for i in DisplayServer.get_screen_count():
        var pos := DisplayServer.screen_get_position(i)
        var size := DisplayServer.screen_get_size(i)
        var dpi := DisplayServer.screen_get_dpi(i)
        var scale := DisplayServer.screen_get_scale(i)
        print("Monitor %d: %s at %s — DPI %d, scale %.1f" % [i, size, pos, dpi, scale])
```

---

## 7. Input Routing Across Windows

Each `Window` receives its own input events. The `InputEvent` is delivered to the window that has OS focus. Key things to know:

- `Input.is_action_pressed()` works globally — it reflects the state regardless of which window received the event.
- `_input()` and `_unhandled_input()` on nodes only fire for the window they belong to.
- `Window.has_focus()` tells you which window is active.

### GDScript — Cross-Window Communication

```gdscript
# Use signals or a global autoload to relay input across windows.

# In an autoload (e.g., GameInput):
signal global_action(action_name: StringName, pressed: bool)

func _unhandled_input(event: InputEvent) -> void:
    # This runs in the main window's context.
    if event.is_action_pressed("pause"):
        global_action.emit("pause", true)
```

---

## 8. Practical Pattern: Inventory in a Separate Window

A common multi-window pattern: the game runs in the main window, and the inventory is a draggable native window.

### GDScript

```gdscript
# inventory_window.gd
extends Window

@onready var grid: GridContainer = $MarginContainer/GridContainer

func _ready() -> void:
    title = "Inventory"
    size = Vector2i(300, 400)
    close_requested.connect(func(): visible = false)
    always_on_top = true  # Keep above the game window
    # Embedded = false is set in the inspector or project settings

func refresh(items: Array[Dictionary]) -> void:
    # Clear and rebuild the grid
    for child in grid.get_children():
        child.queue_free()

    for item in items:
        var slot := preload("res://ui/inventory_slot.tscn").instantiate()
        slot.setup(item)
        grid.add_child(slot)
```

---

## 9. Practical Pattern: Mini-Map Window

Render a top-down view of the game world in a second window by sharing the `World3D`.

### GDScript

```gdscript
# minimap_window.gd
extends Window

@export var main_camera: Camera3D

var _overhead_camera: Camera3D

func _ready() -> void:
    title = "Mini-Map"
    size = Vector2i(256, 256)
    unresizable = true
    always_on_top = true

    # Share the main viewport's world
    world_3d = get_tree().root.world_3d
    own_world_3d = false

    # Create an overhead camera
    _overhead_camera = Camera3D.new()
    _overhead_camera.projection = Camera3D.PROJECTION_ORTHOGONAL
    _overhead_camera.size = 50.0  # Ortho size in world units
    _overhead_camera.current = true
    add_child(_overhead_camera)

func _process(_delta: float) -> void:
    if main_camera:
        # Follow the player's XZ position from above
        _overhead_camera.global_position = Vector3(
            main_camera.global_position.x,
            40.0,
            main_camera.global_position.z
        )
        _overhead_camera.rotation_degrees = Vector3(-90, 0, 0)
```

---

## 10. C# Examples

### Creating and Configuring a Window

```csharp
using Godot;

public partial class MultiWindowManager : Node
{
    private Window _debugWindow;

    public override void _Ready()
    {
        _debugWindow = new Window
        {
            Title = "Debug Panel",
            Size = new Vector2I(400, 300),
            Position = new Vector2I(100, 100),
            Unresizable = false,
            AlwaysOnTop = true,
        };

        _debugWindow.CloseRequested += () => _debugWindow.Visible = false;

        var content = GD.Load<PackedScene>("res://ui/debug_panel.tscn").Instantiate();
        _debugWindow.AddChild(content);
        AddChild(_debugWindow);
    }
}
```

### Multi-Monitor Placement in C#

```csharp
using Godot;

public partial class MonitorHelper : Node
{
    public static void PlaceOnMonitor(Window window, int monitorIndex)
    {
        int screenCount = DisplayServer.GetScreenCount();
        if (monitorIndex >= screenCount)
        {
            GD.PushWarning($"Monitor {monitorIndex} not found (have {screenCount})");
            return;
        }

        Rect2I usable = DisplayServer.ScreenGetUsableRect(monitorIndex);
        Vector2I centered = usable.Position + (usable.Size - window.Size) / 2;
        window.Position = centered;
    }

    public static void ListMonitors()
    {
        for (int i = 0; i < DisplayServer.GetScreenCount(); i++)
        {
            Vector2I pos = DisplayServer.ScreenGetPosition(i);
            Vector2I size = DisplayServer.ScreenGetSize(i);
            int dpi = DisplayServer.ScreenGetDpi(i);
            GD.Print($"Monitor {i}: {size} at {pos} — DPI {dpi}");
        }
    }
}
```

---

## 11. Platform Considerations

| Platform | Multi-Window Support | Notes |
|----------|---------------------|-------|
| **Windows** | Full | Multiple native windows work reliably. DPI-aware via `DisplayServer.screen_get_scale()`. |
| **macOS** | Full | Spaces/Mission Control can separate windows. Use `always_on_top` carefully. |
| **Linux/X11** | Full | Window manager may override positioning. Wayland has stricter rules — `Window.position` may be ignored. |
| **Linux/Wayland** | Partial | Positioning is compositor-controlled. `DisplayServer.window_set_position()` may be silently ignored. |
| **Web (HTML5)** | None | Browsers restrict `window.open()`. All windows are embedded automatically. |
| **Mobile** | None | Single-window only. `Window` nodes are always embedded. |

> **Fallback strategy:** Check `DisplayServer.has_feature(DisplayServer.FEATURE_SUBWINDOWS)` at startup. If `false`, switch `Window` nodes to embedded mode and dock them inside the main UI.

```gdscript
func _ready() -> void:
    if not DisplayServer.has_feature(DisplayServer.FEATURE_SUBWINDOWS):
        # Platform doesn't support multiple OS windows
        second_window.embedded = true
```

---

## 12. Performance Tips

1. **Disable rendering on hidden windows.** Set `Window.visible = false` to stop the viewport from rendering. Godot skips rendering for invisible viewports.
2. **Lower the update rate for auxiliary windows.** Use `Window.content_scale_factor` or reduce `Viewport.render_target_update_mode` to `ONCE` or `DISABLED` for windows that don't need 60fps.
3. **Share worlds instead of duplicating scenes.** Sharing `World3D` means one physics simulation and one set of mesh data. A separate camera is cheap; a separate world is expensive.
4. **Limit window count.** Each native window has OS overhead (compositor, input polling). Two to four windows is practical; beyond that, consider embedded viewports instead.

---

## 13. Common Mistakes

| Mistake | Fix |
|---------|-----|
| Window appears inside the main window instead of as a native window | Set project setting `display/window/subwindows/embed_subwindows` to `false`, or set `Window.embedded = false` before adding to tree |
| Window content is blank | Ensure you added child nodes (a scene or Camera) to the `Window`. A viewport with no content renders nothing. |
| Clicking the second window pauses the game | Check `Window.gui_disable_input` isn't set, and ensure your `_process` logic doesn't depend on `Window.has_focus()` for the main window |
| `Window.position` ignored on Linux | Likely running Wayland — compositor controls positioning. Use embedded mode or accept compositor placement. |
| Input actions fire twice | If both windows have nodes listening to the same action, both fire. Use `Window.has_focus()` to guard, or route through a global autoload. |
| Second window has different DPI scaling | Set `Window.content_scale_factor` to match `DisplayServer.screen_get_scale()` for the target monitor |
