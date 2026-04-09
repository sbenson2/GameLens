# G19 — Custom Resources & Plugin Development

> **Category:** Guide · **Engine:** Godot 4.x · **Language:** GDScript / C#  
> **Related:** [E1 Architecture Overview](../architecture/E1_architecture_overview.md) · [G11 Save/Load Systems](./G11_save_load_systems.md) · [G3 Signal Architecture](./G3_signal_architecture.md) · [G1 Scene Composition](./G1_scene_composition.md)

---

## What This Guide Covers

Custom Resources and Editor Plugins are two of Godot's most powerful — and underused — systems. Custom Resources let you define serializable data types that the editor can inspect, save, and share, replacing ad-hoc dictionaries and JSON files with typed, validated objects. Editor Plugins let you extend the Godot editor itself — custom inspectors, docks, import pipelines, gizmos, and even main screen panels — all without rebuilding the engine.

This guide covers data-driven design with custom Resources, the `@export` annotation system for editor integration, resource sharing vs. `local_to_scene` isolation, security considerations, and the complete EditorPlugin lifecycle including custom docks, inspector plugins, and distribution via the AssetLib.

**Use Custom Resources when:** you need designer-editable data (item stats, enemy configs, dialogue entries, level parameters) that is type-safe, serializable, and hot-reloadable in the editor.

**Use Editor Plugins when:** you need custom editor tooling — level editors, data import wizards, custom gizmos for spatial nodes, or workflow automation that lives inside the Godot editor.

---

## Table of Contents

1. [Custom Resources — Core Concepts](#1-custom-resources--core-concepts)
2. [Defining a Custom Resource](#2-defining-a-custom-resource)
3. [The @export Annotation System](#3-the-export-annotation-system)
4. [Resource Sharing and local_to_scene](#4-resource-sharing-and-local_to_scene)
5. [Nested and Composed Resources](#5-nested-and-composed-resources)
6. [Resource-Based Data Architecture](#6-resource-based-data-architecture)
7. [Security: Script Injection in Resources](#7-security-script-injection-in-resources)
8. [Editor Plugins — Fundamentals](#8-editor-plugins--fundamentals)
9. [Custom Inspector Plugins](#9-custom-inspector-plugins)
10. [Custom Dock Panels](#10-custom-dock-panels)
11. [Import Plugins](#11-import-plugins)
12. [Distributing Plugins via AssetLib](#12-distributing-plugins-via-assetlib)

---

## 1. Custom Resources — Core Concepts

A `Resource` in Godot is any object that can be serialized to disk and loaded back. Built-in examples include `Texture2D`, `AudioStream`, `PackedScene`, `Theme`, and `SpriteFrames`. Custom Resources extend this system with your own data types.

### Why Not Just Use Dictionaries or JSON?

| Approach | Type Safety | Editor UI | Hot Reload | Serialization |
|----------|------------|-----------|------------|---------------|
| Dictionary | None | None | Manual | Manual |
| JSON file | None | None | Manual | Manual |
| Custom Resource | Full | Automatic | Automatic | Automatic |

Resources integrate with the Inspector, the FileSystem dock, undo/redo, and the save system — for free.

### How Resources Work in Memory

Godot loads resources **statically**: no matter how many nodes reference `res://items/sword.tres`, the engine loads it into memory once. All references point to the same instance.

```
# Three nodes loading the same resource → one memory allocation
var item_a := preload("res://items/sword.tres")  # loads from disk
var item_b := preload("res://items/sword.tres")  # returns cached ref
# item_a == item_b → true (same object)
```

This is efficient but has a critical implication: **mutating a shared resource affects every node that references it**. If an enemy's HP resource is shared, damaging one enemy damages them all.

---

## 2. Defining a Custom Resource

### GDScript

```gdscript
# item_data.gd
class_name ItemData
extends Resource

## The item's display name shown in inventory UI.
@export var display_name: String = ""

## Base damage value before modifiers.
@export_range(0, 999, 1) var damage: int = 0

## Weight in kilograms — affects carry capacity.
@export_range(0.0, 100.0, 0.1) var weight: float = 0.0

## Item rarity tier for loot table weighting.
@export_enum("Common", "Uncommon", "Rare", "Epic", "Legendary") var rarity: int = 0

## Optional icon displayed in the inventory grid.
@export var icon: Texture2D

## Flavor text shown on hover.
@export_multiline var description: String = ""
```

### C#

```csharp
// ItemData.cs
using Godot;

[GlobalClass]  // Makes this visible in Godot's "New Resource" dialog
public partial class ItemData : Resource
{
    [Export] public string DisplayName { get; set; } = "";
    [Export(PropertyHint.Range, "0,999,1")] public int Damage { get; set; }
    [Export(PropertyHint.Range, "0,100,0.1")] public float Weight { get; set; }
    [Export(PropertyHint.Enum, "Common,Uncommon,Rare,Epic,Legendary")]
    public int Rarity { get; set; }
    [Export] public Texture2D Icon { get; set; }
    [Export(PropertyHint.MultilineText)] public string Description { get; set; } = "";
}
```

### Creating Instances in the Editor

1. Right-click in the FileSystem dock → **New Resource**
2. Search for `ItemData` (your `class_name`)
3. Click **Create** → opens the Inspector with all exported properties
4. Edit values → **Ctrl+S** to save as `.tres` (text) or `.res` (binary)

> **Convention:** Use `.tres` during development (diffable, mergeable) and `.res` for shipping (smaller, faster to load).

---

## 3. The @export Annotation System

Godot 4.x provides specialized `@export` variants that generate appropriate editor controls:

| Annotation | Editor Control | Example |
|-----------|---------------|---------|
| `@export` | Default for type | `@export var hp: int = 100` |
| `@export_range(min, max, step)` | Slider | `@export_range(0, 100, 5) var hp: int` |
| `@export_enum(...)` | Dropdown | `@export_enum("Fire", "Ice") var element: int` |
| `@export_file("*.json")` | File picker (filtered) | `@export_file("*.json") var config_path: String` |
| `@export_dir` | Directory picker | `@export_dir var save_dir: String` |
| `@export_multiline` | Multi-line text box | `@export_multiline var lore: String` |
| `@export_color_no_alpha` | Color picker (no alpha) | `@export_color_no_alpha var tint: Color` |
| `@export_node_path(type)` | Node picker (filtered) | `@export_node_path("Sprite2D") var sprite` |
| `@export_flags(...)` | Bitflag checkboxes | `@export_flags("Fire", "Ice") var elements: int` |
| `@export_group(name)` | Inspector group header | `@export_group("Combat")` |
| `@export_subgroup(name)` | Inspector subgroup | `@export_subgroup("Melee")` |
| `@export_category(name)` | Inspector category | `@export_category("Stats")` |
| `@export_storage` | Saved but hidden in inspector | `@export_storage var _cache: int` |

### Grouping Properties

```gdscript
@export_category("Character Stats")

@export_group("Offense")
@export_range(1, 100) var attack: int = 10
@export_range(1, 100) var magic: int = 5

@export_group("Defense")
@export_range(1, 100) var armor: int = 8
@export_range(0.0, 1.0, 0.05) var dodge_chance: float = 0.1

@export_group("")  # Ends grouping
@export var character_name: String = ""
```

---

## 4. Resource Sharing and local_to_scene

### The Sharing Problem

By default, exported resources are **shared references**:

```gdscript
# enemy.gd
@export var stats: EnemyStats  # Same .tres file → same object in memory
```

If `enemy_a.stats.hp -= 10`, then `enemy_b.stats.hp` also decreases by 10 — they point to the same object.

### Solution: local_to_scene

Enable **Resource → Local to Scene** in the Inspector, or set it in code:

```gdscript
# enemy_stats.gd
class_name EnemyStats
extends Resource

func _init() -> void:
    resource_local_to_scene = true  # Each scene instance gets a unique copy

@export var max_hp: int = 100
var current_hp: int = 100
```

When `resource_local_to_scene = true`, Godot automatically duplicates the resource for each scene instance. The `_setup_local_to_scene()` virtual method is called after duplication — use it to initialize runtime state:

```gdscript
func _setup_local_to_scene() -> void:
    current_hp = max_hp
```

### Solution: Explicit Duplication

For more control, duplicate at runtime:

```gdscript
func _ready() -> void:
    stats = stats.duplicate()  # Deep-copy so mutations are instance-local
    stats.current_hp = stats.max_hp
```

---

## 5. Nested and Composed Resources

Resources can contain other resources, enabling complex data hierarchies:

```gdscript
# weapon_data.gd
class_name WeaponData
extends Resource

@export var item: ItemData  # Nested resource
@export var attack_pattern: AttackPattern
@export var enchantments: Array[EnchantmentData] = []
```

### Typed Arrays of Resources

```gdscript
# inventory.gd
class_name Inventory
extends Resource

@export var slots: Array[ItemData] = []
@export var max_slots: int = 20

func add_item(item: ItemData) -> bool:
    if slots.size() >= max_slots:
        return false
    slots.append(item)
    emit_changed()  # Notify the editor/save system
    return true
```

> **Key pattern:** Call `emit_changed()` after mutations so the editor and save system know the resource was modified.

---

## 6. Resource-Based Data Architecture

### Pattern: Config Database

Instead of scattering magic numbers across scripts, centralize configuration in resources:

```gdscript
# game_config.gd — a singleton resource loaded at startup
class_name GameConfig
extends Resource

@export_group("Player Defaults")
@export var starting_hp: int = 100
@export var move_speed: float = 200.0
@export var jump_force: float = 400.0

@export_group("Economy")
@export_range(0.5, 2.0, 0.1) var gold_multiplier: float = 1.0
@export var shop_restock_seconds: float = 300.0
```

```gdscript
# autoload: Global.gd
var config: GameConfig = preload("res://data/game_config.tres")
```

Designers edit `game_config.tres` in the Inspector — no code changes, no recompile.

### Pattern: Data Registry

```gdscript
# item_registry.gd — autoload that indexes all items by ID
extends Node

var _items: Dictionary = {}  # id → ItemData

func _ready() -> void:
    # Load all .tres files from the items directory
    var dir := DirAccess.open("res://data/items/")
    if dir:
        dir.list_dir_begin()
        var file_name := dir.get_next()
        while file_name != "":
            if file_name.ends_with(".tres"):
                var item: ItemData = load("res://data/items/" + file_name)
                if item:
                    _items[item.display_name.to_lower()] = item
            file_name = dir.get_next()

func get_item(id: String) -> ItemData:
    return _items.get(id.to_lower())
```

---

## 7. Security: Script Injection in Resources

`.tres` files can embed GDScript that executes on load. This is safe for internal project resources but **dangerous for user-generated content**:

```
# Malicious .tres file could contain:
[ext_resource type="Script" path="res://malicious.gd"]
```

### Mitigations

- **Never load `.tres` from untrusted sources** (downloaded files, user mods)
- For user data, use **JSON** or a custom binary format instead
- If you must load external resources, use `ResourceLoader.load()` with `ResourceFormatLoader` that strips script references
- For save files, consider `ConfigFile` or raw `FileAccess` with JSON serialization

See [G11 Save/Load Systems](./G11_save_load_systems.md) for safe serialization patterns.

---

## 8. Editor Plugins — Fundamentals

### Plugin File Structure

```
project/
└── addons/
    └── my_plugin/
        ├── plugin.cfg          # Metadata (required)
        ├── my_plugin.gd        # Main EditorPlugin script
        ├── my_dock.tscn        # Custom dock scene (optional)
        ├── my_inspector.gd     # Inspector plugin (optional)
        └── icon.svg            # Plugin icon (optional)
```

### plugin.cfg

```ini
[plugin]

name="My Custom Plugin"
description="Adds a custom level editing dock."
author="Your Name"
version="1.0.0"
script="my_plugin.gd"
```

### Main Plugin Script

```gdscript
# my_plugin.gd
@tool  # REQUIRED — runs in the editor
extends EditorPlugin

var dock: Control

func _enter_tree() -> void:
    # Called when the plugin is activated
    dock = preload("res://addons/my_plugin/my_dock.tscn").instantiate()
    add_control_to_dock(DOCK_SLOT_RIGHT_UL, dock)

func _exit_tree() -> void:
    # Called when the plugin is deactivated — clean up everything
    remove_control_from_docks(dock)
    if dock:
        dock.queue_free()
```

### Enabling Your Plugin

**Project → Project Settings → Plugins** → Toggle your plugin to **Active**.

> **Critical:** Always use `@tool` on your EditorPlugin script. Without it, the editor won't execute your code.

---

## 9. Custom Inspector Plugins

Override how specific resource types appear in the Inspector:

```gdscript
# my_inspector_plugin.gd
@tool
extends EditorInspectorPlugin

func _can_handle(object: Object) -> bool:
    return object is ItemData

func _parse_begin(object: Object) -> void:
    # Add a custom control at the top of the Inspector for ItemData
    var label := Label.new()
    label.text = "✦ Item Data Editor"
    label.add_theme_font_size_override("font_size", 18)
    add_custom_control(label)

func _parse_property(object: Object, type: Variant.Type,
        name: String, hint_type: PropertyHint,
        hint_string: String, usage_flags: int, wide: bool) -> bool:
    # Return true to hide the default property editor
    # Return false to keep the default and optionally add controls above it
    if name == "rarity":
        var color_picker := preload("res://addons/my_plugin/rarity_editor.tscn").instantiate()
        add_custom_control(color_picker)
        return true  # Replace default editor
    return false
```

Register it from your main plugin:

```gdscript
# my_plugin.gd
var inspector_plugin: EditorInspectorPlugin

func _enter_tree() -> void:
    inspector_plugin = preload("res://addons/my_plugin/my_inspector_plugin.gd").new()
    add_inspector_plugin(inspector_plugin)

func _exit_tree() -> void:
    remove_inspector_plugin(inspector_plugin)
```

---

## 10. Custom Dock Panels

Build full editor tool panels as scenes:

```gdscript
# level_editor_dock.gd
@tool
extends Control

@onready var item_list: ItemList = %ItemList
@onready var spawn_button: Button = %SpawnButton

func _ready() -> void:
    spawn_button.pressed.connect(_on_spawn_pressed)
    _populate_items()

func _populate_items() -> void:
    item_list.clear()
    var dir := DirAccess.open("res://data/items/")
    if dir:
        dir.list_dir_begin()
        var file := dir.get_next()
        while file != "":
            if file.ends_with(".tres"):
                item_list.add_item(file.get_basename())
            file = dir.get_next()

func _on_spawn_pressed() -> void:
    var selected := item_list.get_selected_items()
    if selected.is_empty():
        return
    var item_name := item_list.get_item_text(selected[0])
    # Use EditorInterface to interact with the current scene
    var edited_scene := EditorInterface.get_edited_scene_root()
    if edited_scene:
        var marker := Marker2D.new()
        marker.name = item_name + "_Spawn"
        edited_scene.add_child(marker)
        marker.owner = edited_scene  # Required for scene serialization
```

---

## 11. Import Plugins

Create custom importers for non-standard file formats:

```gdscript
# csv_item_importer.gd
@tool
extends EditorImportPlugin

func _get_importer_name() -> String:
    return "my_plugin.csv_item_importer"

func _get_visible_name() -> String:
    return "CSV Item Data"

func _get_recognized_extensions() -> PackedStringArray:
    return ["csv"]

func _get_save_extension() -> String:
    return "tres"

func _get_resource_type() -> String:
    return "Resource"

func _get_import_order() -> int:
    return 0

func _get_preset_count() -> int:
    return 1

func _get_preset_name(preset_index: int) -> String:
    return "Default"

func _get_import_options(_path: String, _preset_index: int) -> Array[Dictionary]:
    return [{"name": "delimiter", "default_value": ","}]

func _import(source_file: String, save_path: String,
        options: Dictionary, _platform_variants: Array[String],
        _gen_files: Array[String]) -> Error:
    var file := FileAccess.open(source_file, FileAccess.READ)
    if not file:
        return ERR_FILE_CANT_OPEN

    var items: Array[ItemData] = []
    var header := file.get_csv_line(options["delimiter"])

    while not file.eof_reached():
        var line := file.get_csv_line(options["delimiter"])
        if line.size() >= 3:
            var item := ItemData.new()
            item.display_name = line[0]
            item.damage = int(line[1])
            item.weight = float(line[2])
            items.append(item)

    # Save as a resource array
    var registry := ItemRegistry.new()
    registry.items = items
    return ResourceSaver.save(registry, save_path + "." + _get_save_extension())
```

---

## 12. Distributing Plugins via AssetLib

### Preparing for Distribution

1. **Structure:** Keep everything under `addons/your_plugin_name/`
2. **License:** Include a `LICENSE` file (MIT is common for Godot plugins)
3. **Documentation:** Add a `README.md` with setup instructions
4. **Icon:** Provide a 128×128 `icon.png` or `icon.svg`
5. **Version:** Update `plugin.cfg` version before each release

### Publishing to Godot AssetLib

1. Host your plugin on GitHub or GitLab
2. Go to [godotengine.org/asset-library](https://godotengine.org/asset-library/asset)
3. Click **Submit Asset** → fill in metadata
4. The download URL should point to a `.zip` of your repo

### Plugin Testing Checklist

- [ ] Plugin activates and deactivates cleanly (no orphaned nodes)
- [ ] `_exit_tree()` frees every control added in `_enter_tree()`
- [ ] Works after editor restart
- [ ] No errors in the Output panel on activation
- [ ] `@tool` annotation present on all editor-running scripts
- [ ] Tested on the minimum supported Godot version

---

## Cheat Sheet

```
# Quick Custom Resource
class_name MyData extends Resource
@export var value: int = 0

# Quick Plugin
@tool extends EditorPlugin
func _enter_tree(): pass   # Setup
func _exit_tree(): pass     # Cleanup

# Load resource
var data: MyData = preload("res://data/my_data.tres")

# Duplicate to avoid shared mutation
var local_copy := data.duplicate()

# Safe user data — use JSON, not .tres
var json_string := JSON.stringify({"hp": 100})
FileAccess.open("user://save.json", FileAccess.WRITE).store_string(json_string)
```

---

## Common Mistakes

| Mistake | Fix |
|---------|-----|
| Mutating shared resource, affecting all instances | Use `local_to_scene = true` or `duplicate()` |
| Forgetting `@tool` on plugin scripts | Add `@tool` to every script that runs in the editor |
| Not cleaning up in `_exit_tree()` | Free every node/control you added |
| Loading `.tres` from untrusted sources | Use JSON for user-generated content |
| Missing `class_name` on resource script | Add `class_name` so the editor can find it |
| Missing `[GlobalClass]` in C# resources | Add the attribute so the editor recognizes the type |
| Not calling `emit_changed()` after mutation | Call it so the editor and save system react |
| Forgetting `owner = edited_scene` for plugin-spawned nodes | Set `.owner` or the node won't be saved with the scene |
