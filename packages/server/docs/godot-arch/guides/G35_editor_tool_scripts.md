# G35 — Editor Tool Scripts & Plugin Development

> **Category:** Guide · **Engine:** Godot 4.4+ · **Language:** GDScript / C#
> **Related:** [G19 Custom Resources & Plugins](./G19_custom_resources_and_plugins.md) · [G16 GDExtension](./G16_gdextension_native_code.md) · [E1 Architecture Overview](../architecture/E1_architecture_overview.md)

---

## What This Guide Covers

Godot's editor is built on the same node/scene system as the game runtime, which means you can extend it with the same tools you already know. The `@tool` annotation makes scripts run in the editor, `EditorPlugin` lets you add docks/inspectors/gizmos, and custom `EditorScript` enables one-shot batch operations.

This guide covers `@tool` scripts (when and how to use them safely), building full editor plugins with custom inspectors and docks, creating editor gizmos for visual debugging, and packaging plugins for the Asset Library.

**G19** covers custom `Resource` types and basic plugin scaffolding. This guide goes deeper into editor-side tooling — the interactive, visual, and workflow-enhancing side of plugin development.

---

## Table of Contents

1. [@tool Scripts — Running Code in the Editor](#1-tool-scripts--running-code-in-the-editor)
2. [Safety: What Runs and When](#2-safety-what-runs-and-when)
3. [EditorPlugin Fundamentals](#3-editorplugin-fundamentals)
4. [Custom Inspector Properties](#4-custom-inspector-properties)
5. [Custom Bottom Panel / Dock](#5-custom-bottom-panel--dock)
6. [Editor Gizmos](#6-editor-gizmos)
7. [EditorScript for Batch Operations](#7-editorscript-for-batch-operations)
8. [Exporting and Distributing Plugins](#8-exporting-and-distributing-plugins)
9. [C# Plugin Development](#9-c-plugin-development)
10. [Common Mistakes](#10-common-mistakes)

---

## 1. @tool Scripts — Running Code in the Editor

Add `@tool` at the very top of a GDScript file to make it execute in the editor.

```gdscript
@tool
extends Sprite2D

@export var wave_amplitude: float = 10.0
@export var wave_speed: float = 2.0

func _process(delta: float) -> void:
    position.y = wave_amplitude * sin(Time.get_ticks_msec() / 1000.0 * wave_speed)
```

This sprite now oscillates in the editor viewport — useful for previewing animation, verifying placement, or building level-design tools.

### When to Use @tool

- **Preview visual effects** in the viewport (particles, shaders, procedural meshes)
- **Validate exported properties** in real time (e.g., clamping values, updating dependent properties)
- **Build level editors** — let designers click and place with immediate feedback
- **Auto-generate child nodes** when a property changes

### When NOT to Use @tool

- For game logic that has no editor benefit — it adds risk for no gain
- For scripts that modify files on disk — accidental data loss in the editor
- For scripts with heavy `_process()` — slows down the editor

---

## 2. Safety: What Runs and When

When a script is marked `@tool`, **all** its lifecycle callbacks run in the editor — `_ready()`, `_process()`, `_enter_tree()`, etc. This is powerful but dangerous.

### Guard with Engine.is_editor_hint()

```gdscript
@tool
extends CharacterBody3D

func _process(delta: float) -> void:
    if Engine.is_editor_hint():
        # Editor-only: update visual preview
        _update_preview()
        return

    # Runtime-only: actual game logic
    _handle_input(delta)
    move_and_slide()
```

### Guard with @export Setter

```gdscript
@tool
extends Node3D

@export var radius: float = 1.0:
    set(value):
        radius = clampf(value, 0.1, 100.0)
        _rebuild_mesh()  # Safe in editor — only runs on property change

var _mesh_instance: MeshInstance3D

func _rebuild_mesh() -> void:
    if not is_inside_tree():
        return  # Called before _ready() — bail
    if not _mesh_instance:
        _mesh_instance = MeshInstance3D.new()
        add_child(_mesh_instance)
    var sphere := SphereMesh.new()
    sphere.radius = radius
    sphere.height = radius * 2.0
    _mesh_instance.mesh = sphere
```

### The _ready() Trap

`_ready()` runs every time the scene is opened in the editor. If it creates child nodes, you'll get duplicates each time.

```gdscript
@tool
extends Node2D

func _ready() -> void:
    # ⚠ BAD: Creates new children every time scene opens
    # var label := Label.new()
    # add_child(label)

    # ✅ GOOD: Only create if missing
    if not has_node("GeneratedLabel"):
        var label := Label.new()
        label.name = "GeneratedLabel"
        add_child(label)
        label.owner = get_tree().edited_scene_root  # Makes it saveable
```

Setting `owner` to the edited scene root is critical — without it, dynamically created nodes won't be saved with the scene.

---

## 3. EditorPlugin Fundamentals

An `EditorPlugin` is a script in `addons/<plugin_name>/` that registers editor extensions.

### File Structure

```
addons/my_tool/
├── plugin.cfg              # Plugin metadata
├── my_tool_plugin.gd       # Main plugin script
├── inspector/
│   └── custom_inspector.gd # Custom inspector widget
├── dock/
│   └── tool_dock.tscn      # Custom dock UI
│   └── tool_dock.gd
└── icon.svg                # Plugin icon
```

### plugin.cfg

```ini
[plugin]

name="My Level Tool"
description="Visual level editing helpers"
author="Your Name"
version="1.0.0"
script="my_tool_plugin.gd"
```

### Main Plugin Script

```gdscript
@tool
extends EditorPlugin

var _dock: Control
var _inspector_plugin: EditorInspectorPlugin

func _enter_tree() -> void:
    # Add a dock to the bottom panel
    _dock = preload("res://addons/my_tool/dock/tool_dock.tscn").instantiate()
    add_control_to_bottom_panel(_dock, "Level Tool")

    # Register a custom inspector
    _inspector_plugin = preload("res://addons/my_tool/inspector/custom_inspector.gd").new()
    add_inspector_plugin(_inspector_plugin)

func _exit_tree() -> void:
    remove_control_from_bottom_panel(_dock)
    _dock.queue_free()
    remove_inspector_plugin(_inspector_plugin)
```

### Enabling the Plugin

Go to **Project → Project Settings → Plugins** and toggle your plugin on. Godot calls `_enter_tree()` immediately.

---

## 4. Custom Inspector Properties

`EditorInspectorPlugin` lets you replace or augment the default inspector for specific node types.

```gdscript
# inspector/custom_inspector.gd
@tool
extends EditorInspectorPlugin

func _can_handle(object: Object) -> bool:
    # Only activate for nodes with our custom script
    return object is MyCustomNode

func _parse_begin(object: Object) -> void:
    # Add a button at the top of the inspector
    var button := Button.new()
    button.text = "Generate Mesh"
    button.pressed.connect(_on_generate_pressed.bind(object))
    add_custom_control(button)

func _parse_property(object: Object, type: Variant.Type, name: String,
        hint_type: PropertyHint, hint_string: String,
        usage_flags: int, wide: bool) -> bool:
    if name == "custom_color":
        # Replace the default editor for this property
        var color_prop := MyColorProperty.new()
        add_property_editor(name, color_prop)
        return true  # We handled it — skip default
    return false  # Let default handle it

func _on_generate_pressed(object: Object) -> void:
    if object is MyCustomNode:
        object.generate_mesh()
```

### Custom EditorProperty

```gdscript
# inspector/my_color_property.gd
@tool
extends EditorProperty

var _picker: ColorPickerButton

func _init() -> void:
    _picker = ColorPickerButton.new()
    _picker.color_changed.connect(_on_color_changed)
    add_child(_picker)
    add_focusable(_picker)

func _update_property() -> void:
    var current: Color = get_edited_object().get(get_edited_property())
    _picker.color = current

func _on_color_changed(color: Color) -> void:
    emit_changed(get_edited_property(), color)
```

---

## 5. Custom Bottom Panel / Dock

```gdscript
# dock/tool_dock.gd
@tool
extends VBoxContainer

@onready var _node_list: ItemList = %NodeList
@onready var _refresh_btn: Button = %RefreshButton

func _ready() -> void:
    _refresh_btn.pressed.connect(_refresh)

func _refresh() -> void:
    _node_list.clear()
    # Access the editor interface to get the current scene
    var edited_root := EditorInterface.get_edited_scene_root()
    if edited_root == null:
        return
    _collect_nodes(edited_root)

func _collect_nodes(node: Node) -> void:
    _node_list.add_item(node.name + " (" + node.get_class() + ")")
    for child in node.get_children():
        _collect_nodes(child)
```

### Dock Positions

```gdscript
# In your plugin's _enter_tree():
add_control_to_dock(DOCK_SLOT_LEFT_UL, _dock)   # Upper-left
add_control_to_dock(DOCK_SLOT_RIGHT_BL, _dock)  # Bottom-right
add_control_to_bottom_panel(_dock, "My Panel")   # Bottom panel tab
```

---

## 6. Editor Gizmos

Gizmos draw visual handles and shapes in the 3D viewport for your custom nodes.

```gdscript
# Register in plugin _enter_tree():
func _enter_tree() -> void:
    _gizmo_plugin = MyGizmoPlugin.new()
    add_node_3d_gizmo_plugin(_gizmo_plugin)
```

```gdscript
# gizmo/my_gizmo_plugin.gd
@tool
extends EditorNode3DGizmoPlugin

func _get_gizmo_name() -> String:
    return "MyZoneGizmo"

func _has_gizmo(node: Node3D) -> bool:
    return node is ZoneNode

func _init() -> void:
    create_material("main", Color(0.2, 0.8, 0.2, 0.5))
    create_handle_material("handles")

func _redraw(gizmo: EditorNode3DGizmo) -> void:
    gizmo.clear()
    var node: ZoneNode = gizmo.get_node_3d() as ZoneNode
    if node == null:
        return

    # Draw a wireframe box showing the zone bounds
    var lines := PackedVector3Array()
    var size: Vector3 = node.zone_size
    var half := size / 2.0

    # Bottom face
    lines.append(Vector3(-half.x, -half.y, -half.z))
    lines.append(Vector3(half.x, -half.y, -half.z))
    lines.append(Vector3(half.x, -half.y, -half.z))
    lines.append(Vector3(half.x, -half.y, half.z))
    lines.append(Vector3(half.x, -half.y, half.z))
    lines.append(Vector3(-half.x, -half.y, half.z))
    lines.append(Vector3(-half.x, -half.y, half.z))
    lines.append(Vector3(-half.x, -half.y, -half.z))
    # ... (top face and verticals similarly)

    gizmo.add_lines(lines, get_material("main", gizmo))

    # Add a draggable handle at the +X face
    var handles := PackedVector3Array([Vector3(half.x, 0, 0)])
    gizmo.add_handles(handles, get_material("handles", gizmo), [0])

func _get_handle_name(gizmo: EditorNode3DGizmo, handle_id: int, secondary: bool) -> String:
    return "Size X"

func _get_handle_value(gizmo: EditorNode3DGizmo, handle_id: int, secondary: bool) -> Variant:
    var node: ZoneNode = gizmo.get_node_3d() as ZoneNode
    return node.zone_size.x

func _set_handle(gizmo: EditorNode3DGizmo, handle_id: int, secondary: bool,
        camera: Camera3D, screen_pos: Vector2) -> void:
    var node: ZoneNode = gizmo.get_node_3d() as ZoneNode
    # Project screen position to 3D and update the property
    var ray_origin := camera.project_ray_origin(screen_pos)
    var ray_dir := camera.project_ray_normal(screen_pos)
    # Simplified — intersect with the X plane
    var t := -ray_origin.x / ray_dir.x if ray_dir.x != 0 else 0.0
    node.zone_size.x = maxf(0.1, abs(ray_origin.x + ray_dir.x * t) * 2.0)
    _redraw(gizmo)
```

---

## 7. EditorScript for Batch Operations

`EditorScript` runs once from **File → Run** (or Ctrl+Shift+X) — perfect for one-shot batch operations.

```gdscript
# tools/rename_nodes.gd
@tool
extends EditorScript

func _run() -> void:
    var root := get_editor_interface().get_edited_scene_root()
    if root == null:
        printerr("No scene open!")
        return

    var count := 0
    _rename_recursive(root, count)
    print("Renamed %d nodes" % count)

func _rename_recursive(node: Node, count: int) -> void:
    if node is Sprite2D and not node.name.begins_with("spr_"):
        var old_name := node.name
        node.name = "spr_" + old_name.to_snake_case()
        count += 1
        print("  %s → %s" % [old_name, node.name])

    for child in node.get_children():
        _rename_recursive(child, count)
```

---

## 8. Exporting and Distributing Plugins

### Asset Library Structure

```
addons/my_tool/
├── plugin.cfg
├── LICENSE
├── README.md        # Displayed on Asset Library page
├── icon.svg         # 128×128 recommended
├── *.gd             # Plugin scripts
└── ...
```

### Tips for Distribution

- **Use `@tool` only where needed** — mark only the scripts that must run in the editor.
- **Clean up in `_exit_tree()`** — remove all docks, inspectors, gizmos, and menu items.
- **Namespace your nodes and resources** — prefix with your plugin name to avoid collisions.
- **Test disable/enable cycles** — toggle your plugin off and on repeatedly; nothing should leak.
- **Support undo** — use `EditorUndoRedoManager` for any operation that modifies the scene.

### Using EditorUndoRedoManager

```gdscript
@tool
extends EditorPlugin

func _some_editor_action(node: Node, new_value: Variant) -> void:
    var undo_redo := get_undo_redo()
    undo_redo.create_action("Change property")
    undo_redo.add_do_property(node, "my_property", new_value)
    undo_redo.add_undo_property(node, "my_property", node.my_property)
    undo_redo.commit_action()
```

---

## 9. C# Plugin Development

C# editor plugins follow the same pattern but use attributes and partial classes.

```csharp
// addons/my_tool/MyToolPlugin.cs
#if TOOLS
using Godot;

[Tool]
public partial class MyToolPlugin : EditorPlugin
{
    private Control _dock;

    public override void _EnterTree()
    {
        _dock = GD.Load<PackedScene>("res://addons/my_tool/dock/tool_dock.tscn")
            .Instantiate<Control>();
        AddControlToBottomPanel(_dock, "My Tool");
    }

    public override void _ExitTree()
    {
        RemoveControlFromBottomPanel(_dock);
        _dock.QueueFree();
    }
}
#endif
```

```csharp
// A tool script in C#
#if TOOLS
using Godot;

[Tool]
public partial class PreviewSprite : Sprite2D
{
    [Export] public float WaveAmplitude { get; set; } = 10f;

    public override void _Process(double delta)
    {
        if (Engine.IsEditorHint())
        {
            Position = new Vector2(Position.X,
                WaveAmplitude * Mathf.Sin(Time.GetTicksMsec() / 1000f));
        }
    }
}
#endif
```

**Note:** Wrap C# editor code in `#if TOOLS` to ensure it is stripped from export builds.

---

## 10. Common Mistakes

| Mistake | Why It Breaks | Fix |
|---------|--------------|-----|
| No `Engine.is_editor_hint()` guard | Game logic runs in the editor — physics, input, etc. | Guard runtime code; keep editor code separate |
| Creating children in `_ready()` without checking | Duplicates every time the scene is opened | Check `has_node()` first |
| Missing `node.owner = edited_scene_root` | Dynamically created nodes vanish on save | Always set owner for saveable nodes |
| Not cleaning up in `_exit_tree()` | Docks, inspectors, gizmos linger after disable | Remove everything you added |
| Heavy `_process()` in `@tool` script | Editor becomes sluggish | Use `_process()` sparingly; prefer property setters |
| Forgetting `#if TOOLS` in C# | Editor code ships in export builds | Wrap all editor-only classes |
| Not supporting undo/redo | Users can't Ctrl+Z plugin actions | Use `EditorUndoRedoManager` for scene modifications |
| Using `get_tree()` in `_init()` | Node isn't in tree yet — returns null | Use `_ready()` or `_enter_tree()` instead |
