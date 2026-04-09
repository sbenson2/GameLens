# G100 — Advanced Editor Plugin Development

> **Category:** guide · **Engine:** Godot 4.x · **Related:** [G35 Editor Tool Scripts](./G35_editor_tool_scripts.md) · [G95 Custom Import Plugins & Asset Pipelines](./G95_custom_import_plugins_and_asset_pipelines.md) · [G19 Custom Resources & Plugins](./G19_custom_resources_and_plugins.md) · [G41 Godot 4.4–4.6 Features](./G41_godot_44_to_46_features.md)

Godot's editor is built on the same UI framework as your game, which means you can extend it with custom docks, inspector widgets, bottom panels, main screen plugins, toolbar buttons, and context menu entries — all from GDScript or C#. This guide goes beyond basic `@tool` scripts (covered in G35) and import plugins (G95) to cover the full `EditorPlugin` API for building production-quality editor extensions.

---

## Table of Contents

1. [Plugin Architecture Overview](#1-plugin-architecture-overview)
2. [Setting Up a Plugin Project](#2-setting-up-a-plugin-project)
3. [Custom Editor Docks](#3-custom-editor-docks)
4. [Inspector Plugins](#4-inspector-plugins)
5. [Bottom Panel Plugins](#5-bottom-panel-plugins)
6. [Main Screen Plugins](#6-main-screen-plugins)
7. [Toolbar Buttons & Menu Items](#7-toolbar-buttons--menu-items)
8. [Context Menu Extensions](#8-context-menu-extensions)
9. [EditorSettings & Persistent State](#9-editorsettings--persistent-state)
10. [Undo/Redo Integration](#10-undoredo-integration)
11. [Packaging & Distribution](#11-packaging--distribution)
12. [Common Pitfalls & Best Practices](#12-common-pitfalls--best-practices)

---

## 1. Plugin Architecture Overview

Every editor extension in Godot 4.x is registered through an `EditorPlugin` subclass. This class provides lifecycle hooks (`_enter_tree()` / `_exit_tree()`), access to the editor interface (`EditorInterface`), and methods to inject UI into every part of the editor.

### What an EditorPlugin Can Do

| Extension Point | Method | Use Case |
|---|---|---|
| Custom dock | `add_control_to_dock()` | Tool panels, asset browsers, data editors |
| Inspector widget | `add_inspector_plugin()` | Custom property editors, inline previews |
| Bottom panel | `add_control_to_bottom_panel()` | Output logs, animation editors, debug views |
| Main screen | `_has_main_screen()` + `_make_visible()` | Full-tab editors (like 2D/3D/Script) |
| Toolbar button | `add_tool_menu_item()` | Quick actions, code generators |
| Context menu | `add_context_menu_plugin()` (4.4+) | Right-click actions in FileSystem/Scene |

### Key Rule

Every `@tool` script that extends `EditorPlugin` **must** be declared in a `plugin.cfg` file. Without it, Godot will not recognize or load the plugin.

---

## 2. Setting Up a Plugin Project

### Directory Structure

```
res://addons/my_plugin/
├── plugin.cfg
├── my_plugin.gd          # Main EditorPlugin script (GDScript)
├── my_plugin.cs           # Alternative C# version
├── dock_scene.tscn        # Optional: dock UI as a scene
├── inspector_plugin.gd    # Optional: inspector extension
└── icons/
    └── my_icon.svg
```

### plugin.cfg

```ini
[plugin]

name="My Custom Plugin"
description="A production-quality editor extension."
author="Your Name"
version="1.0.0"
script="my_plugin.gd"
```

### Minimal Plugin — GDScript

```gdscript
@tool
extends EditorPlugin

func _enter_tree() -> void:
    # Plugin activated — register everything here
    print("My Plugin activated")

func _exit_tree() -> void:
    # Plugin deactivated — clean up EVERYTHING here
    # Failing to clean up causes memory leaks and editor crashes
    print("My Plugin deactivated")
```

### Minimal Plugin — C#

```csharp
#if TOOLS
using Godot;

[Tool]
public partial class MyPlugin : EditorPlugin
{
    public override void _EnterTree()
    {
        GD.Print("My Plugin activated");
    }

    public override void _ExitTree()
    {
        GD.Print("My Plugin deactivated");
    }
}
#endif
```

> **Important:** C# editor plugins must be wrapped in `#if TOOLS` / `#endif` so they are excluded from exported builds.

---

## 3. Custom Editor Docks

Docks appear in the left or right panels alongside the Scene tree, Inspector, and FileSystem.

### GDScript — Dock from Code

```gdscript
@tool
extends EditorPlugin

var dock: Control

func _enter_tree() -> void:
    dock = VBoxContainer.new()
    dock.name = "MyDock"

    var label := Label.new()
    label.text = "Hello from My Plugin"
    dock.add_child(label)

    var button := Button.new()
    button.text = "Do Something"
    button.pressed.connect(_on_button_pressed)
    dock.add_child(button)

    # DOCK_SLOT_LEFT_UL, DOCK_SLOT_LEFT_BL, DOCK_SLOT_RIGHT_UL, etc.
    add_control_to_dock(DOCK_SLOT_LEFT_BL, dock)

func _exit_tree() -> void:
    # CRITICAL: always remove and free dock controls
    remove_control_from_docks(dock)
    dock.queue_free()

func _on_button_pressed() -> void:
    # Access currently selected nodes
    var selection := EditorInterface.get_selection()
    var nodes := selection.get_selected_nodes()
    for node in nodes:
        print("Selected: ", node.name)
```

### GDScript — Dock from Scene

For complex UIs, design your dock in the editor as a `.tscn` file:

```gdscript
@tool
extends EditorPlugin

var dock_instance: Control

func _enter_tree() -> void:
    dock_instance = preload("res://addons/my_plugin/dock_scene.tscn").instantiate()
    add_control_to_dock(DOCK_SLOT_RIGHT_UL, dock_instance)

func _exit_tree() -> void:
    remove_control_from_docks(dock_instance)
    dock_instance.queue_free()
```

### C# — Custom Dock

```csharp
#if TOOLS
using Godot;

[Tool]
public partial class MyPlugin : EditorPlugin
{
    private Control _dock;

    public override void _EnterTree()
    {
        _dock = new VBoxContainer { Name = "MyDock" };

        var label = new Label { Text = "Hello from C# Plugin" };
        _dock.AddChild(label);

        var button = new Button { Text = "Do Something" };
        button.Pressed += OnButtonPressed;
        _dock.AddChild(button);

        AddControlToDock(DockSlot.LeftBl, _dock);
    }

    public override void _ExitTree()
    {
        RemoveControlFromDocks(_dock);
        _dock.QueueFree();
    }

    private void OnButtonPressed()
    {
        var selection = EditorInterface.Singleton.GetSelection();
        foreach (var node in selection.GetSelectedNodes())
        {
            GD.Print($"Selected: {node.Name}");
        }
    }
}
#endif
```

---

## 4. Inspector Plugins

Inspector plugins let you replace or augment how properties are displayed in the Inspector dock.

### Architecture

1. Your `EditorPlugin` registers an `EditorInspectorPlugin` subclass.
2. The inspector plugin implements `_can_handle()` to declare which object types it applies to.
3. It uses `_parse_begin()`, `_parse_property()`, or `_parse_end()` to inject custom controls.

### GDScript — Custom Property Editor

```gdscript
# inspector_plugin.gd
@tool
extends EditorInspectorPlugin

func _can_handle(object: Object) -> bool:
    # Only handle nodes with a specific script or class
    return object is CharacterBody3D

func _parse_property(
    object: Object,
    type: Variant.Type,
    name: String,
    hint_type: PropertyHint,
    hint_string: String,
    usage_flags: int,
    wide: bool
) -> bool:
    if name == "velocity":
        # Add a custom control ABOVE the default property editor
        var label := Label.new()
        label.text = "Speed: %.1f" % object.velocity.length()
        label.add_theme_color_override("font_color", Color.YELLOW)
        add_custom_control(label)
        return false  # false = also show the default editor
        # return true = REPLACE the default editor entirely
    return false

func _parse_begin(object: Object) -> void:
    # Add controls at the TOP of the inspector
    var header := Label.new()
    header.text = "=== Character Inspector ==="
    add_custom_control(header)

func _parse_end() -> void:
    # Add controls at the BOTTOM of the inspector
    var footer := Button.new()
    footer.text = "Reset to Defaults"
    add_custom_control(footer)
```

### Registration in EditorPlugin

```gdscript
@tool
extends EditorPlugin

var inspector_plugin: EditorInspectorPlugin

func _enter_tree() -> void:
    inspector_plugin = preload("res://addons/my_plugin/inspector_plugin.gd").new()
    add_inspector_plugin(inspector_plugin)

func _exit_tree() -> void:
    remove_inspector_plugin(inspector_plugin)
```

### C# — Inspector Plugin

```csharp
#if TOOLS
using Godot;

[Tool]
public partial class CharacterInspector : EditorInspectorPlugin
{
    public override bool _CanHandle(GodotObject @object)
    {
        return @object is CharacterBody3D;
    }

    public override bool _ParseProperty(
        GodotObject @object, Variant.Type type, string name,
        PropertyHint hintType, string hintString,
        PropertyUsageFlags usageFlags, bool wide)
    {
        if (name == "velocity" && @object is CharacterBody3D body)
        {
            var label = new Label
            {
                Text = $"Speed: {body.Velocity.Length():F1}"
            };
            AddCustomControl(label);
            return false;
        }
        return false;
    }
}

[Tool]
public partial class MyPlugin : EditorPlugin
{
    private CharacterInspector _inspector;

    public override void _EnterTree()
    {
        _inspector = new CharacterInspector();
        AddInspectorPlugin(_inspector);
    }

    public override void _ExitTree()
    {
        RemoveInspectorPlugin(_inspector);
    }
}
#endif
```

---

## 5. Bottom Panel Plugins

Bottom panels appear alongside the Output, Debugger, and Audio tabs at the bottom of the editor.

### GDScript

```gdscript
@tool
extends EditorPlugin

var panel: Control
var panel_button: Button

func _enter_tree() -> void:
    panel = preload("res://addons/my_plugin/bottom_panel.tscn").instantiate()
    # add_control_to_bottom_panel() returns the tab button so you can reference it
    panel_button = add_control_to_bottom_panel(panel, "My Panel")

func _exit_tree() -> void:
    remove_control_from_bottom_panel(panel)
    panel.queue_free()
```

### C#

```csharp
#if TOOLS
using Godot;

[Tool]
public partial class MyPlugin : EditorPlugin
{
    private Control _panel;

    public override void _EnterTree()
    {
        _panel = GD.Load<PackedScene>(
            "res://addons/my_plugin/bottom_panel.tscn"
        ).Instantiate<Control>();
        AddControlToBottomPanel(_panel, "My Panel");
    }

    public override void _ExitTree()
    {
        RemoveControlFromBottomPanel(_panel);
        _panel.QueueFree();
    }
}
#endif
```

### When to Use Bottom Panels vs. Docks

- **Docks:** Always visible, good for reference panels, tree browsers, property lists.
- **Bottom panels:** Hidden until clicked, good for output, logs, large editors that need horizontal space.

---

## 6. Main Screen Plugins

Main screen plugins add a new tab alongside 2D, 3D, Script, and AssetLib. Use these for full-featured editors like level designers, dialogue editors, or visual scripting tools.

### GDScript

```gdscript
@tool
extends EditorPlugin

var main_screen: Control

func _enter_tree() -> void:
    main_screen = preload("res://addons/my_plugin/main_screen.tscn").instantiate()
    # The main screen is added to the editor's main viewport
    EditorInterface.get_editor_main_screen().add_child(main_screen)
    _make_visible(false)

func _exit_tree() -> void:
    if main_screen:
        main_screen.queue_free()

func _has_main_screen() -> bool:
    return true

func _make_visible(visible: bool) -> void:
    if main_screen:
        main_screen.visible = visible

func _get_plugin_name() -> String:
    return "My Editor"

func _get_plugin_icon() -> Texture2D:
    return EditorInterface.get_editor_theme().get_icon("Node", "EditorIcons")
```

### C#

```csharp
#if TOOLS
using Godot;

[Tool]
public partial class MyPlugin : EditorPlugin
{
    private Control _mainScreen;

    public override void _EnterTree()
    {
        _mainScreen = GD.Load<PackedScene>(
            "res://addons/my_plugin/main_screen.tscn"
        ).Instantiate<Control>();
        EditorInterface.Singleton.GetEditorMainScreen().AddChild(_mainScreen);
        _MakeVisible(false);
    }

    public override void _ExitTree()
    {
        _mainScreen?.QueueFree();
    }

    public override bool _HasMainScreen() => true;

    public override void _MakeVisible(bool visible)
    {
        if (_mainScreen != null)
            _mainScreen.Visible = visible;
    }

    public override string _GetPluginName() => "My Editor";

    public override Texture2D _GetPluginIcon()
    {
        return EditorInterface.Singleton.GetEditorTheme()
            .GetIcon("Node", "EditorIcons");
    }
}
#endif
```

---

## 7. Toolbar Buttons & Menu Items

### Adding a Tool Menu Item

```gdscript
@tool
extends EditorPlugin

func _enter_tree() -> void:
    add_tool_menu_item("Generate Level Data", _on_generate)

func _exit_tree() -> void:
    remove_tool_menu_item("Generate Level Data")

func _on_generate() -> void:
    print("Generating level data...")
```

### Adding a Toolbar Button (via _build)

For a persistent toolbar button, override `_forward_canvas_gui_input()` or add a button to the container toolbar:

```gdscript
@tool
extends EditorPlugin

var toolbar_button: Button

func _enter_tree() -> void:
    toolbar_button = Button.new()
    toolbar_button.text = "My Action"
    toolbar_button.pressed.connect(_on_toolbar_pressed)
    add_control_to_container(CONTAINER_TOOLBAR, toolbar_button)

func _exit_tree() -> void:
    remove_control_from_container(CONTAINER_TOOLBAR, toolbar_button)
    toolbar_button.queue_free()

func _on_toolbar_pressed() -> void:
    EditorInterface.get_resource_filesystem().scan()
```

---

## 8. Context Menu Extensions

Godot 4.4 introduced `add_context_menu_plugin()` for adding right-click options to the FileSystem dock and Scene tree.

### GDScript (4.4+)

```gdscript
@tool
extends EditorPlugin

var context_plugin: EditorContextMenuPlugin

func _enter_tree() -> void:
    context_plugin = preload(
        "res://addons/my_plugin/context_menu_plugin.gd"
    ).new()
    add_context_menu_plugin(CONTEXT_SLOT_SCENE_TREE, context_plugin)

func _exit_tree() -> void:
    remove_context_menu_plugin(context_plugin)
```

```gdscript
# context_menu_plugin.gd
@tool
extends EditorContextMenuPlugin

func _popup_menu(paths: PackedStringArray) -> void:
    # paths contains the selected node paths (scene tree) or file paths (filesystem)
    if paths.size() > 0:
        add_menu_item(
            _on_custom_action,
            "My Custom Action",
            EditorInterface.get_editor_theme().get_icon("ActionCopy", "EditorIcons")
        )

func _on_custom_action() -> void:
    print("Custom context action triggered!")
```

---

## 9. EditorSettings & Persistent State

Plugins often need to persist configuration between sessions. Use `EditorSettings` or a ConfigFile in the plugin directory.

### Using ConfigFile

```gdscript
@tool
extends EditorPlugin

const CONFIG_PATH := "res://addons/my_plugin/config.cfg"
var config := ConfigFile.new()

func _enter_tree() -> void:
    config.load(CONFIG_PATH)
    var last_used: String = config.get_value("state", "last_tab", "default")
    print("Restored tab: ", last_used)

func save_state(key: String, value: Variant) -> void:
    config.set_value("state", key, value)
    config.save(CONFIG_PATH)
```

### Using EditorSettings (User-Global)

```gdscript
func _enter_tree() -> void:
    var settings := EditorInterface.get_editor_settings()
    # Plugin settings live under "addons/my_plugin/"
    if not settings.has_setting("addons/my_plugin/auto_refresh"):
        settings.set_setting("addons/my_plugin/auto_refresh", true)
        settings.set_initial_value("addons/my_plugin/auto_refresh", true)
```

---

## 10. Undo/Redo Integration

Any plugin that modifies the scene or resources should integrate with the `EditorUndoRedoManager` to support Ctrl+Z.

### GDScript

```gdscript
@tool
extends EditorPlugin

func randomize_position(node: Node3D) -> void:
    var undo_redo := get_undo_redo()
    undo_redo.create_action("Randomize Position")
    undo_redo.add_do_property(node, "position", Vector3(
        randf_range(-10, 10),
        0,
        randf_range(-10, 10)
    ))
    undo_redo.add_undo_property(node, "position", node.position)
    undo_redo.commit_action()
```

### C#

```csharp
#if TOOLS
private void RandomizePosition(Node3D node)
{
    var undoRedo = GetUndoRedo();
    undoRedo.CreateAction("Randomize Position");
    var newPos = new Vector3(
        GD.RandRange(-10, 10), 0, GD.RandRange(-10, 10)
    );
    undoRedo.AddDoProperty(node, "position", newPos);
    undoRedo.AddUndoProperty(node, "position", node.Position);
    undoRedo.CommitAction();
}
#endif
```

---

## 11. Packaging & Distribution

### As an addon (manual install)

1. Zip the `addons/my_plugin/` folder.
2. Users extract it into their project's `addons/` directory.
3. They enable it in **Project → Project Settings → Plugins**.

### Via the Godot Asset Library

1. Create a repository with the `addons/my_plugin/` structure at the root.
2. Submit to [godotengine.org/asset-library](https://godotengine.org/asset-library).
3. Include a `LICENSE` file and clear `README.md`.

### Testing Your Plugin

```gdscript
# Run from EditorScript (Script → Run) to test plugin logic without full activation
@tool
extends EditorScript

func _run() -> void:
    print("Testing plugin logic...")
    var result := my_computation()
    assert(result == expected_value, "Test failed!")
```

---

## 12. Common Pitfalls & Best Practices

### Memory Leaks — The #1 Problem

Every control added in `_enter_tree()` must be removed **and freed** in `_exit_tree()`. The editor does not automatically clean up plugin UI:

```gdscript
# BAD — leaks memory every time the plugin is toggled
func _exit_tree() -> void:
    remove_control_from_docks(dock)
    # Missing dock.queue_free()!

# GOOD — clean removal
func _exit_tree() -> void:
    remove_control_from_docks(dock)
    dock.queue_free()
```

### Null Checks on Deactivation

If your plugin can be toggled while the editor is running, guard against null references:

```gdscript
func _exit_tree() -> void:
    if dock and is_instance_valid(dock):
        remove_control_from_docks(dock)
        dock.queue_free()
    if inspector_plugin:
        remove_inspector_plugin(inspector_plugin)
```

### @tool is Mandatory

Your main plugin script **must** have `@tool` at the top. Without it, the script will not execute in the editor and Godot will silently fail to load the plugin.

### Avoid Blocking the Editor

Long operations (file I/O, network requests, asset processing) should use `await` or `WorkerThreadPool` to avoid freezing the editor:

```gdscript
func _on_process_button() -> void:
    var task_id := WorkerThreadPool.add_task(_heavy_work)
    await get_tree().create_timer(0.1).timeout
    # Poll or use signal to know when done
```

### Editor Theme Colors

Use the editor theme rather than hardcoded colors so your plugin looks correct in all themes (light, dark, custom):

```gdscript
var color: Color = EditorInterface.get_editor_theme().get_color(
    "accent_color", "Editor"
)
var icon: Texture2D = EditorInterface.get_editor_theme().get_icon(
    "Node", "EditorIcons"
)
```

---

## Quick Reference

| Task | Method |
|---|---|
| Add dock | `add_control_to_dock(slot, control)` |
| Remove dock | `remove_control_from_docks(control)` then `queue_free()` |
| Add inspector plugin | `add_inspector_plugin(plugin)` |
| Add bottom panel | `add_control_to_bottom_panel(control, title)` |
| Add main screen | Override `_has_main_screen()`, `_make_visible()`, `_get_plugin_name()` |
| Add toolbar button | `add_control_to_container(CONTAINER_TOOLBAR, control)` |
| Add tool menu item | `add_tool_menu_item(name, callable)` |
| Add context menu (4.4+) | `add_context_menu_plugin(slot, plugin)` |
| Access selected nodes | `EditorInterface.get_selection().get_selected_nodes()` |
| Access filesystem | `EditorInterface.get_resource_filesystem()` |
| Undo/Redo | `get_undo_redo().create_action()` ... `.commit_action()` |
