# G11 — Save & Load Systems
> **Category:** Guide · **Engine:** Godot 4.4+ · **Language:** GDScript  
> **Related:** [E1 Architecture Overview](../architecture/E1_architecture_overview.md) · [G1 Scene Composition](./G1_scene_composition.md) · [G3 Signal Architecture](./G3_signal_architecture.md) · [G9 UI & Control Systems](./G9_ui_control_systems.md)

---

## What This Guide Covers

Save/load is one of the most frequently asked-about systems in Godot — and one of the easiest to get wrong. The core challenge: Godot's node tree is a living runtime structure, not a simple data container. You can't just "serialize the tree." You need to decide what to save, how to serialize it, where to store it, and how to reconstruct the game state on load.

This guide covers save data architecture, JSON serialization (the Godot community standard), Resource-based saves, binary serialization, the Saveable interface pattern, saving/loading complex types (Vector2, Color, Arrays, nested objects), scene reconstruction, multiple save slots, autosave, save file versioning and migration, cloud save foundations, settings persistence, and common pitfalls. All code targets Godot 4.4+ with typed GDScript.

For engine-agnostic serialization theory and patterns, see the MonoGame save/load reference. For UI integration (save slot screens, confirmation dialogs), see [G9 UI & Control Systems](./G9_ui_control_systems.md).

---

## Save Architecture — What to Save

### The Golden Rule

> **Save DATA, not NODES.** Your save file should contain the minimum information needed to reconstruct game state — not a dump of the scene tree.

```
┌──────────────────────────────────────────────────────────┐
│  Save Architecture                                       │
│                                                          │
│  Runtime Game State                                      │
│  ├── Player (position, health, inventory, stats)         │
│  ├── Enemies (position, health, AI state, loot table)    │
│  ├── World (modified tiles, opened doors, triggered events)│
│  ├── Quests (active, completed, objectives)              │
│  └── Meta (play time, save timestamp, screenshot)        │
│                                                          │
│       ↓ serialize()                ↑ deserialize()       │
│                                                          │
│  Save File (JSON / Resource / Binary)                    │
│  └── user://saves/slot_1.json                            │
└──────────────────────────────────────────────────────────┘
```

### What to Save vs What NOT to Save

| ✅ Save | ❌ Don't Save |
|---------|--------------|
| Player position, health, inventory | Node references (they change every load) |
| Quest progress, flags, counters | Tween states, animation positions |
| Modified world state (broken tiles, opened chests) | Unmodified default state (save a delta) |
| Settings/preferences | Cached computations |
| Current scene path | Entire scene tree |
| Enemy positions if persistent | Enemy positions if they respawn |
| Timestamps, play time, save metadata | Process IDs, frame counts |

---

## Saveable Interface — The Contract Pattern

Define a consistent interface that any node can implement to participate in saving:

```gdscript
## saveable.gd — Base class or interface
class_name Saveable
extends Node

## Return a Dictionary of data to save.
## Keys should be strings. Values must be JSON-safe
## (or convertible via _to_json_safe).
func save_data() -> Dictionary:
    push_warning("Saveable.save_data() not implemented on %s" % name)
    return {}

## Restore state from a previously-saved Dictionary.
func load_data(data: Dictionary) -> void:
    push_warning("Saveable.load_data() not implemented on %s" % name)
```

### Using Groups for Auto-Discovery

Add all saveable nodes to the `"saveable"` group (in the editor or in code):

```gdscript
## player.gd
extends CharacterBody2D

func _ready() -> void:
    add_to_group("saveable")

func save_data() -> Dictionary:
    return {
        "scene_path": scene_file_path,
        "position_x": global_position.x,
        "position_y": global_position.y,
        "health": health,
        "max_health": max_health,
        "inventory": inventory.serialize(),
        "facing": "left" if sprite.flip_h else "right",
    }

func load_data(data: Dictionary) -> void:
    global_position = Vector2(data.get("position_x", 0.0), data.get("position_y", 0.0))
    health = data.get("health", max_health)
    max_health = data.get("max_health", 100)
    inventory.deserialize(data.get("inventory", {}))
    sprite.flip_h = data.get("facing", "right") == "left"
```

```gdscript
## enemy.gd
extends CharacterBody2D

@export var enemy_id: StringName = &""  # Unique identifier for this enemy instance

func _ready() -> void:
    add_to_group("saveable")
    if enemy_id.is_empty():
        enemy_id = StringName(str(name, "_", get_instance_id()))

func save_data() -> Dictionary:
    return {
        "id": String(enemy_id),
        "scene_path": scene_file_path,
        "position_x": global_position.x,
        "position_y": global_position.y,
        "health": health,
        "is_dead": is_dead,
        "ai_state": state_machine.current_state.name if state_machine else "",
    }

func load_data(data: Dictionary) -> void:
    global_position = Vector2(data.get("position_x", 0.0), data.get("position_y", 0.0))
    health = data.get("health", max_health)
    if data.get("is_dead", false):
        die(silent = true)  # Skip death animation/sound on load
```

---

## JSON Save System — The Community Standard

JSON is the most common save format in Godot because it's human-readable, debuggable, and has built-in `JSON.stringify()`/`JSON.parse_string()` support.

### SaveManager Autoload

```gdscript
## save_manager.gd — Autoload named "SaveManager"
extends Node

const SAVE_DIR: String = "user://saves/"
const SAVE_EXTENSION: String = ".json"
const MAX_SLOTS: int = 5
const CURRENT_VERSION: int = 2  # Increment when save format changes

signal save_completed(slot: int)
signal load_completed(slot: int)
signal save_error(slot: int, error: String)


func _ready() -> void:
    # Ensure save directory exists
    DirAccess.make_dir_recursive_absolute(SAVE_DIR)


## ── Saving ──────────────────────────────────────────────

func save_game(slot: int) -> bool:
    var save_data: Dictionary = _collect_save_data()
    
    # Add metadata
    save_data["meta"] = {
        "version": CURRENT_VERSION,
        "timestamp": Time.get_unix_time_from_system(),
        "datetime": Time.get_datetime_string_from_system(),
        "scene": get_tree().current_scene.scene_file_path,
        "play_time": GameManager.play_time if GameManager else 0.0,
    }
    
    var path: String = _slot_path(slot)
    var json_string: String = JSON.stringify(save_data, "\t")  # Pretty-print
    
    var file := FileAccess.open(path, FileAccess.WRITE)
    if file == null:
        var err: String = "Failed to open save file: %s" % error_string(FileAccess.get_open_error())
        push_error(err)
        save_error.emit(slot, err)
        return false
    
    file.store_string(json_string)
    file.close()
    
    save_completed.emit(slot)
    print("Game saved to slot %d" % slot)
    return true


## ── Loading ─────────────────────────────────────────────

func load_game(slot: int) -> bool:
    var path: String = _slot_path(slot)
    
    if not FileAccess.file_exists(path):
        save_error.emit(slot, "Save file not found")
        return false
    
    var file := FileAccess.open(path, FileAccess.READ)
    if file == null:
        save_error.emit(slot, "Failed to open save file")
        return false
    
    var json_string: String = file.get_as_text()
    file.close()
    
    var json := JSON.new()
    var parse_result: Error = json.parse(json_string)
    if parse_result != OK:
        save_error.emit(slot, "JSON parse error at line %d: %s" % [
            json.get_error_line(), json.get_error_message()
        ])
        return false
    
    var save_data: Dictionary = json.data
    
    # Version migration
    save_data = _migrate_save(save_data)
    
    # Load the saved scene first
    var scene_path: String = save_data.get("meta", {}).get("scene", "")
    if scene_path.is_empty():
        save_error.emit(slot, "No scene path in save data")
        return false
    
    # Change scene and wait for it to load
    get_tree().change_scene_to_file(scene_path)
    await get_tree().tree_changed
    # Wait one frame for all _ready() calls to complete
    await get_tree().process_frame
    
    # Apply saved data to all saveable nodes
    _apply_save_data(save_data)
    
    load_completed.emit(slot)
    print("Game loaded from slot %d" % slot)
    return true


## ── Slot Management ─────────────────────────────────────

func slot_exists(slot: int) -> bool:
    return FileAccess.file_exists(_slot_path(slot))


func get_slot_info(slot: int) -> Dictionary:
    """Returns metadata for a save slot (for the slot selection UI)."""
    if not slot_exists(slot):
        return {}
    
    var file := FileAccess.open(_slot_path(slot), FileAccess.READ)
    if file == null:
        return {}
    
    var json := JSON.new()
    if json.parse(file.get_as_text()) != OK:
        return {}
    
    return json.data.get("meta", {})


func delete_slot(slot: int) -> void:
    var path: String = _slot_path(slot)
    if FileAccess.file_exists(path):
        DirAccess.remove_absolute(path)


func get_all_slot_info() -> Array[Dictionary]:
    """Returns metadata for all slots (for save/load screen)."""
    var slots: Array[Dictionary] = []
    for i in MAX_SLOTS:
        slots.append(get_slot_info(i))
    return slots


## ── Internal ────────────────────────────────────────────

func _slot_path(slot: int) -> String:
    return SAVE_DIR + "save_%d%s" % [slot, SAVE_EXTENSION]


func _collect_save_data() -> Dictionary:
    var data: Dictionary = {}
    var saveables: Array[Node] = []
    get_tree().current_scene.get_tree().get_nodes_in_group("saveable").assign_to(saveables)
    
    for node in get_tree().get_nodes_in_group("saveable"):
        if node.has_method("save_data"):
            var node_data: Dictionary = node.save_data()
            # Use a unique key per node (node path or custom ID)
            var key: String = _get_save_key(node)
            data[key] = node_data
    
    return data


func _apply_save_data(save_data: Dictionary) -> void:
    for node in get_tree().get_nodes_in_group("saveable"):
        if node.has_method("load_data"):
            var key: String = _get_save_key(node)
            if save_data.has(key):
                node.load_data(save_data[key])


func _get_save_key(node: Node) -> String:
    # Prefer a custom save_id if the node defines one
    if "save_id" in node:
        return str(node.save_id)
    if "enemy_id" in node:
        return str(node.enemy_id)
    # Fallback to node path (stable if scene tree doesn't change)
    return str(node.get_path())
```

---

## Serializing Complex Types

JSON only supports strings, numbers, booleans, arrays, and dictionaries. Godot types like `Vector2`, `Color`, `Resource` need manual conversion.

### Type Conversion Helpers

```gdscript
## save_helpers.gd — Static utility class
class_name SaveHelpers

## ── Vector2 ─────────────────────────────────────────────

static func vec2_to_dict(v: Vector2) -> Dictionary:
    return {"x": v.x, "y": v.y}

static func dict_to_vec2(d: Dictionary) -> Vector2:
    return Vector2(d.get("x", 0.0), d.get("y", 0.0))

## ── Vector2i ────────────────────────────────────────────

static func vec2i_to_dict(v: Vector2i) -> Dictionary:
    return {"x": v.x, "y": v.y}

static func dict_to_vec2i(d: Dictionary) -> Vector2i:
    return Vector2i(d.get("x", 0), d.get("y", 0))

## ── Color ───────────────────────────────────────────────

static func color_to_dict(c: Color) -> Dictionary:
    return {"r": c.r, "g": c.g, "b": c.b, "a": c.a}

static func dict_to_color(d: Dictionary) -> Color:
    return Color(d.get("r", 1.0), d.get("g", 1.0), d.get("b", 1.0), d.get("a", 1.0))

## ── Rect2 ───────────────────────────────────────────────

static func rect2_to_dict(r: Rect2) -> Dictionary:
    return {
        "x": r.position.x, "y": r.position.y,
        "w": r.size.x, "h": r.size.y,
    }

static func dict_to_rect2(d: Dictionary) -> Rect2:
    return Rect2(d.get("x", 0.0), d.get("y", 0.0), d.get("w", 0.0), d.get("h", 0.0))

## ── Transform2D ─────────────────────────────────────────

static func transform2d_to_dict(t: Transform2D) -> Dictionary:
    return {
        "xx": t.x.x, "xy": t.x.y,
        "yx": t.y.x, "yy": t.y.y,
        "ox": t.origin.x, "oy": t.origin.y,
    }

static func dict_to_transform2d(d: Dictionary) -> Transform2D:
    return Transform2D(
        Vector2(d.get("xx", 1.0), d.get("xy", 0.0)),
        Vector2(d.get("yx", 0.0), d.get("yy", 1.0)),
        Vector2(d.get("ox", 0.0), d.get("oy", 0.0)),
    )

## ── Generic typed array ─────────────────────────────────

static func typed_array_to_json(arr: Array, converter: Callable) -> Array:
    var result: Array = []
    for item in arr:
        result.append(converter.call(item))
    return result

static func json_to_typed_array(arr: Array, converter: Callable) -> Array:
    var result: Array = []
    for item in arr:
        result.append(converter.call(item))
    return result
```

### Inventory Serialization Example

```gdscript
## inventory.gd
class_name Inventory
extends RefCounted

var slots: Array[Dictionary] = []  # {item_id: String, count: int, metadata: Dictionary}
var max_slots: int = 20

func serialize() -> Dictionary:
    return {
        "max_slots": max_slots,
        "slots": slots.duplicate(true),  # Deep copy
    }

func deserialize(data: Dictionary) -> void:
    max_slots = data.get("max_slots", 20)
    slots.clear()
    for slot_data: Dictionary in data.get("slots", []):
        slots.append({
            "item_id": slot_data.get("item_id", ""),
            "count": slot_data.get("count", 0),
            "metadata": slot_data.get("metadata", {}),
        })
```

### Quest System Serialization

```gdscript
## quest_manager.gd — Autoload
extends Node

var active_quests: Dictionary = {}    # quest_id → {objectives: {...}, started_at: float}
var completed_quests: Array[String] = []
var quest_flags: Dictionary = {}       # arbitrary key → value flags

func _ready() -> void:
    add_to_group("saveable")

func save_data() -> Dictionary:
    return {
        "active_quests": active_quests.duplicate(true),
        "completed_quests": completed_quests.duplicate(),
        "quest_flags": quest_flags.duplicate(true),
    }

func load_data(data: Dictionary) -> void:
    active_quests = data.get("active_quests", {})
    completed_quests.assign(data.get("completed_quests", []))
    quest_flags = data.get("quest_flags", {})
```

---

## Resource-Based Saves — Godot-Native Approach

Instead of JSON, use Godot's built-in `Resource` serialization with `ResourceSaver`/`ResourceLoader`. This handles Godot types natively (Vector2, Color, etc.) without manual conversion.

```gdscript
## save_data_resource.gd
class_name SaveDataResource
extends Resource

@export var player_position: Vector2
@export var player_health: int = 100
@export var player_inventory: Array[Dictionary] = []
@export var current_scene: String = ""
@export var quest_data: Dictionary = {}
@export var world_flags: Dictionary = {}
@export var play_time: float = 0.0
@export var save_version: int = 1
@export var save_timestamp: String = ""
```

### Saving with Resources

```gdscript
## resource_save_manager.gd
extends Node

const SAVE_DIR: String = "user://saves/"

func save_game(slot: int) -> bool:
    DirAccess.make_dir_recursive_absolute(SAVE_DIR)
    
    var save_res := SaveDataResource.new()
    save_res.player_position = player.global_position
    save_res.player_health = player.health
    save_res.player_inventory = player.inventory.serialize_array()
    save_res.current_scene = get_tree().current_scene.scene_file_path
    save_res.play_time = GameManager.play_time
    save_res.save_version = 2
    save_res.save_timestamp = Time.get_datetime_string_from_system()
    
    # Collect all saveable data
    for node in get_tree().get_nodes_in_group("saveable"):
        if node.has_method("save_data"):
            save_res.world_flags[str(node.get_path())] = node.save_data()
    
    var path: String = SAVE_DIR + "save_%d.tres" % slot
    var error: Error = ResourceSaver.save(save_res, path)
    return error == OK


func load_game(slot: int) -> bool:
    var path: String = SAVE_DIR + "save_%d.tres" % slot
    if not ResourceLoader.exists(path):
        return false
    
    var save_res: SaveDataResource = ResourceLoader.load(path) as SaveDataResource
    if save_res == null:
        return false
    
    get_tree().change_scene_to_file(save_res.current_scene)
    await get_tree().process_frame
    
    player.global_position = save_res.player_position
    player.health = save_res.player_health
    # ... restore other state
    
    return true
```

### JSON vs Resource Saves — Decision Guide

| Factor | JSON | Resource (.tres) |
|--------|------|-------------------|
| **Human readable** | ✅ Excellent | ⚠️ Readable but verbose |
| **Godot types** | ❌ Manual conversion needed | ✅ Native (Vector2, Color, etc.) |
| **Cross-version** | ✅ Stable format | ⚠️ Can break across Godot versions |
| **Security** | ✅ Data only | ⚠️ `.tres` can contain code (see warning) |
| **File size** | Compact | Larger (Godot metadata) |
| **Portability** | ✅ Any language can read | ❌ Godot only |
| **Debugging** | Easy (any text editor) | Possible (text .tres) |
| **Recommended for** | Most games | Quick prototyping, jam games |

> **⚠️ SECURITY WARNING:** Never use `ResourceLoader.load()` on untrusted save files (e.g., files shared by players, downloaded saves, modding). Godot `.tres` files can contain embedded GDScript code that executes on load. For user-facing save files, **always use JSON** or binary serialization.

---

## Binary Serialization — Compact & Fast

For large save files (open world, many entities), binary serialization is more compact and faster than JSON:

```gdscript
## binary_save.gd
class_name BinarySaveSystem
extends RefCounted

const MAGIC: int = 0x47445356  # "GDSV" — identifies our save format
const VERSION: int = 2


static func save_to_file(data: Dictionary, path: String) -> bool:
    var file := FileAccess.open(path, FileAccess.WRITE)
    if file == null:
        return false
    
    # Header
    file.store_32(MAGIC)
    file.store_16(VERSION)
    
    # Serialize data to bytes via Variant
    var bytes: PackedByteArray = var_to_bytes(data)
    
    # Optional: compress
    var compressed: PackedByteArray = bytes.compress(FileAccess.COMPRESSION_ZSTD)
    
    # Store size + compressed data
    file.store_64(bytes.size())       # Uncompressed size (for decompression)
    file.store_64(compressed.size())  # Compressed size
    file.store_buffer(compressed)
    
    file.close()
    return true


static func load_from_file(path: String) -> Dictionary:
    if not FileAccess.file_exists(path):
        return {}
    
    var file := FileAccess.open(path, FileAccess.READ)
    if file == null:
        return {}
    
    # Validate header
    var magic: int = file.get_32()
    if magic != MAGIC:
        push_error("Invalid save file format")
        return {}
    
    var version: int = file.get_16()
    
    # Read compressed data
    var uncompressed_size: int = file.get_64()
    var compressed_size: int = file.get_64()
    var compressed: PackedByteArray = file.get_buffer(compressed_size)
    
    file.close()
    
    # Decompress
    var bytes: PackedByteArray = compressed.decompress(
        uncompressed_size, FileAccess.COMPRESSION_ZSTD
    )
    
    # Deserialize
    var data: Variant = bytes_to_var(bytes)
    if data is Dictionary:
        return data
    
    return {}
```

> **⚠️ SECURITY WARNING:** `bytes_to_var()` can instantiate arbitrary objects. For untrusted data, use `bytes_to_var_with_objects(false)` (Godot 4.4+) or stick with JSON. Binary saves are best for single-player games where the save files are local only.

---

## Save File Versioning & Migration

Save formats inevitably change. Add a version number and migrate old saves forward:

```gdscript
## In save_manager.gd:

func _migrate_save(data: Dictionary) -> Dictionary:
    var version: int = data.get("meta", {}).get("version", 1)
    
    # Apply migrations sequentially
    if version < 2:
        data = _migrate_v1_to_v2(data)
    # if version < 3:
    #     data = _migrate_v2_to_v3(data)
    
    return data


func _migrate_v1_to_v2(data: Dictionary) -> Dictionary:
    print("Migrating save from v1 to v2...")
    
    # Example: v2 added max_health field (didn't exist in v1)
    for key: String in data:
        if key == "meta":
            continue
        var node_data: Dictionary = data[key]
        if node_data.has("health") and not node_data.has("max_health"):
            node_data["max_health"] = 100  # Default value
    
    # Example: v2 renamed "coins" to "gold" in inventory
    for key: String in data:
        if key == "meta":
            continue
        var node_data: Dictionary = data[key]
        if node_data.has("coins"):
            node_data["gold"] = node_data["coins"]
            node_data.erase("coins")
    
    # Update version
    if data.has("meta"):
        data["meta"]["version"] = 2
    
    return data
```

### Migration Best Practices

1. **Always increment `CURRENT_VERSION`** when the save format changes
2. **Never skip versions** — migrate 1→2→3, not 1→3
3. **Add defaults for new fields** — old saves won't have them
4. **Never remove data** in migrations — rename or restructure instead
5. **Test migrations** with actual old save files
6. **Log migrations** so players know their save was updated

---

## Autosave System

```gdscript
## autosave.gd — Attach to a scene or add to SaveManager
extends Node

@export var autosave_interval: float = 300.0  # 5 minutes
@export var autosave_slot: int = 99            # Dedicated autosave slot
@export var autosave_on_scene_change: bool = true

var _timer: float = 0.0
var _enabled: bool = true


func _ready() -> void:
    if autosave_on_scene_change:
        get_tree().tree_changed.connect(_on_tree_changed)


func _process(delta: float) -> void:
    if not _enabled:
        return
    
    _timer += delta
    if _timer >= autosave_interval:
        _timer = 0.0
        _do_autosave()


func _do_autosave() -> void:
    # Don't autosave during cutscenes, menus, or combat
    if GameManager and GameManager.is_in_cutscene:
        return
    if get_tree().paused:
        return
    
    print("Autosaving...")
    SaveManager.save_game(autosave_slot)


func _on_tree_changed() -> void:
    # Autosave when entering a new area/scene
    _do_autosave()


func enable() -> void:
    _enabled = true
    _timer = 0.0

func disable() -> void:
    _enabled = false
```

---

## Saving World State — Modified Tiles & Objects

Games often need to save changes to the world: broken tiles, opened chests, collected items, unlocked doors.

### Delta-Based World Saving

Instead of saving every tile, save only what changed from the default state:

```gdscript
## world_state_manager.gd — Autoload named "WorldState"
extends Node

## Per-scene dictionary of modifications
## { scene_path: { "tiles": {...}, "objects": {...}, "flags": {...} } }
var _world_data: Dictionary = {}


func _ready() -> void:
    add_to_group("saveable")


## ── Tile Modifications ──────────────────────────────────

func set_tile_modified(scene: String, layer: String,
                       coords: Vector2i, new_source_id: int,
                       new_atlas_coords: Vector2i) -> void:
    _ensure_scene(scene)
    var key: String = "%s_%d_%d" % [layer, coords.x, coords.y]
    _world_data[scene]["tiles"][key] = {
        "source_id": new_source_id,
        "atlas_x": new_atlas_coords.x,
        "atlas_y": new_atlas_coords.y,
    }


func set_tile_removed(scene: String, layer: String, coords: Vector2i) -> void:
    _ensure_scene(scene)
    var key: String = "%s_%d_%d" % [layer, coords.x, coords.y]
    _world_data[scene]["tiles"][key] = {"removed": true}


## ── Object State ────────────────────────────────────────

func set_object_state(scene: String, object_id: String, state: Dictionary) -> void:
    _ensure_scene(scene)
    _world_data[scene]["objects"][object_id] = state


func get_object_state(scene: String, object_id: String) -> Dictionary:
    if not _world_data.has(scene):
        return {}
    return _world_data[scene].get("objects", {}).get(object_id, {})


## ── Scene Flags ─────────────────────────────────────────

func set_flag(scene: String, flag: String, value: Variant) -> void:
    _ensure_scene(scene)
    _world_data[scene]["flags"][flag] = value


func get_flag(scene: String, flag: String, default: Variant = null) -> Variant:
    if not _world_data.has(scene):
        return default
    return _world_data[scene].get("flags", {}).get(flag, default)


## ── Save/Load ───────────────────────────────────────────

func save_data() -> Dictionary:
    return {"world_data": _world_data.duplicate(true)}


func load_data(data: Dictionary) -> void:
    _world_data = data.get("world_data", {})


## ── Apply to Scene ──────────────────────────────────────

func apply_to_current_scene() -> void:
    """Call this in the scene's _ready() to restore world modifications."""
    var scene_path: String = get_tree().current_scene.scene_file_path
    if not _world_data.has(scene_path):
        return
    
    var scene_data: Dictionary = _world_data[scene_path]
    
    # Restore tile modifications
    for key: String in scene_data.get("tiles", {}):
        var parts: PackedStringArray = key.split("_")
        if parts.size() < 3:
            continue
        var layer_name: String = parts[0]
        var coords := Vector2i(int(parts[1]), int(parts[2]))
        var tile_data: Dictionary = scene_data["tiles"][key]
        
        var tilemap: TileMapLayer = _find_tilemap_layer(layer_name)
        if tilemap == null:
            continue
        
        if tile_data.get("removed", false):
            tilemap.erase_cell(coords)
        else:
            tilemap.set_cell(
                coords,
                tile_data.get("source_id", 0),
                Vector2i(tile_data.get("atlas_x", 0), tile_data.get("atlas_y", 0)),
            )


func _ensure_scene(scene: String) -> void:
    if not _world_data.has(scene):
        _world_data[scene] = {"tiles": {}, "objects": {}, "flags": {}}


func _find_tilemap_layer(layer_name: String) -> TileMapLayer:
    for node in get_tree().get_nodes_in_group("tilemap_layer"):
        if node.name == layer_name:
            return node as TileMapLayer
    return null
```

### Using World State in Scenes

```gdscript
## chest.gd — Openable chest that remembers its state
extends StaticBody2D

@export var chest_id: String = "chest_01"
var opened: bool = false

func _ready() -> void:
    # Check if this chest was already opened
    var state: Dictionary = WorldState.get_object_state(
        get_tree().current_scene.scene_file_path, chest_id
    )
    if state.get("opened", false):
        opened = true
        $Sprite2D.frame = 1  # Show opened sprite
        $InteractArea.queue_free()  # Remove interact prompt

func open() -> void:
    if opened:
        return
    opened = true
    $Sprite2D.frame = 1
    $AnimationPlayer.play("open")
    # Spawn loot...
    
    # Record state for save
    WorldState.set_object_state(
        get_tree().current_scene.scene_file_path,
        chest_id,
        {"opened": true}
    )
```

---

## Scene Reconstruction — Spawned Entities

The hardest save/load problem: nodes that were dynamically spawned at runtime (enemies, dropped items, player-placed objects) don't exist in the default scene. You need to recreate them on load.

```gdscript
## In save_manager.gd, add spawned entity tracking:

var _spawned_entities: Array[Dictionary] = []


## Call when spawning any persistent entity at runtime
func register_spawned(scene_path: String, save_data: Dictionary,
                      parent_path: NodePath = NodePath("")) -> void:
    _spawned_entities.append({
        "scene_path": scene_path,
        "save_data": save_data,
        "parent_path": str(parent_path),
    })


func _collect_save_data() -> Dictionary:
    var data: Dictionary = {}
    
    # ... existing saveable group collection ...
    
    # Add spawned entities
    data["_spawned_entities"] = []
    for node in get_tree().get_nodes_in_group("spawned_entity"):
        if node.has_method("save_data"):
            var entity_data: Dictionary = node.save_data()
            entity_data["_scene_path"] = node.scene_file_path
            entity_data["_parent_path"] = str(node.get_parent().get_path())
            (data["_spawned_entities"] as Array).append(entity_data)
    
    return data


func _apply_save_data(save_data: Dictionary) -> void:
    # First, recreate spawned entities
    for entity_data: Dictionary in save_data.get("_spawned_entities", []):
        var scene_path: String = entity_data.get("_scene_path", "")
        var parent_path: String = entity_data.get("_parent_path", "")
        
        if scene_path.is_empty():
            continue
        
        var scene: PackedScene = load(scene_path)
        if scene == null:
            push_warning("Failed to load spawned entity scene: %s" % scene_path)
            continue
        
        var instance: Node = scene.instantiate()
        
        # Find parent or default to current scene
        var parent: Node = get_tree().current_scene
        if not parent_path.is_empty():
            var found: Node = get_tree().current_scene.get_node_or_null(parent_path)
            if found:
                parent = found
        
        parent.add_child(instance)
        instance.add_to_group("spawned_entity")
        
        if instance.has_method("load_data"):
            instance.load_data(entity_data)
    
    # Then apply data to existing saveable nodes
    for node in get_tree().get_nodes_in_group("saveable"):
        if node.has_method("load_data"):
            var key: String = _get_save_key(node)
            if save_data.has(key):
                node.load_data(save_data[key])
```

### Dropped Item Example

```gdscript
## dropped_item.gd — Items dropped by enemies or players
extends Area2D

@export var item_id: String = ""
@export var count: int = 1

func _ready() -> void:
    add_to_group("saveable")
    add_to_group("spawned_entity")

func save_data() -> Dictionary:
    return {
        "item_id": item_id,
        "count": count,
        "position_x": global_position.x,
        "position_y": global_position.y,
    }

func load_data(data: Dictionary) -> void:
    item_id = data.get("item_id", "")
    count = data.get("count", 1)
    global_position = Vector2(
        data.get("position_x", 0.0),
        data.get("position_y", 0.0),
    )
    _update_sprite()  # Set the correct item icon
```

---

## Multiple Save Slots — UI Integration

```
Node Tree:
  SaveLoadScreen: Control
  ├── VBoxContainer
  │   ├── SaveSlot0: PanelContainer
  │   │   ├── HBoxContainer
  │   │   │   ├── SlotLabel: Label
  │   │   │   ├── DateLabel: Label
  │   │   │   └── PlayTimeLabel: Label
  │   │   └── HBoxContainer
  │   │       ├── SaveButton: Button
  │   │       ├── LoadButton: Button
  │   │       └── DeleteButton: Button
  │   ├── SaveSlot1: PanelContainer ...
  │   ├── SaveSlot2: PanelContainer ...
  │   └── AutosaveSlot: PanelContainer (load only)
  └── ConfirmDialog: ConfirmationDialog
```

```gdscript
## save_load_screen.gd
extends Control

const SLOT_SCENE: PackedScene = preload("res://ui/save_slot.tscn")

@onready var _slot_container: VBoxContainer = $VBoxContainer
@onready var _confirm_dialog: ConfirmationDialog = $ConfirmDialog

var _pending_action: Callable
var _mode: StringName = &"save"  # "save" or "load"


func open(mode: StringName) -> void:
    _mode = mode
    _refresh_slots()
    show()


func _refresh_slots() -> void:
    # Clear existing
    for child in _slot_container.get_children():
        child.queue_free()
    
    # Create slot UI for each save
    for slot: int in SaveManager.MAX_SLOTS:
        var info: Dictionary = SaveManager.get_slot_info(slot)
        var slot_ui := SLOT_SCENE.instantiate()
        _slot_container.add_child(slot_ui)
        
        if info.is_empty():
            slot_ui.setup_empty(slot, _mode)
        else:
            slot_ui.setup_filled(slot, _mode, info)
        
        slot_ui.action_requested.connect(_on_slot_action)
    
    # Autosave slot (load only)
    if _mode == &"load" and SaveManager.slot_exists(99):
        var auto_info: Dictionary = SaveManager.get_slot_info(99)
        var auto_ui := SLOT_SCENE.instantiate()
        _slot_container.add_child(auto_ui)
        auto_ui.setup_filled(99, &"load", auto_info)
        auto_ui.set_label("Autosave")
        auto_ui.action_requested.connect(_on_slot_action)


func _on_slot_action(slot: int, action: StringName) -> void:
    match action:
        &"save":
            if SaveManager.slot_exists(slot):
                _pending_action = func() -> void: _do_save(slot)
                _confirm_dialog.dialog_text = "Overwrite save in slot %d?" % slot
                _confirm_dialog.popup_centered()
            else:
                _do_save(slot)
        
        &"load":
            _pending_action = func() -> void: _do_load(slot)
            _confirm_dialog.dialog_text = "Load save from slot %d?\nUnsaved progress will be lost." % slot
            _confirm_dialog.popup_centered()
        
        &"delete":
            _pending_action = func() -> void: _do_delete(slot)
            _confirm_dialog.dialog_text = "Delete save in slot %d?\nThis cannot be undone." % slot
            _confirm_dialog.popup_centered()


func _on_confirm_dialog_confirmed() -> void:
    if _pending_action:
        _pending_action.call()
        _pending_action = Callable()


func _do_save(slot: int) -> void:
    SaveManager.save_game(slot)
    _refresh_slots()

func _do_load(slot: int) -> void:
    hide()
    SaveManager.load_game(slot)

func _do_delete(slot: int) -> void:
    SaveManager.delete_slot(slot)
    _refresh_slots()
```

---

## Settings Persistence — Separate from Game Saves

Settings should save independently from game saves (they're global, not per-slot):

```gdscript
## settings_manager.gd — Autoload named "Settings"
extends Node

const SETTINGS_PATH: String = "user://settings.cfg"

var _config := ConfigFile.new()

## Default values
var master_volume: float = 0.8
var music_volume: float = 0.7
var sfx_volume: float = 1.0
var fullscreen: bool = false
var vsync: bool = true
var screen_shake: bool = true
var language: String = "en"


func _ready() -> void:
    load_settings()
    apply_settings()


func save_settings() -> void:
    _config.set_value("audio", "master_volume", master_volume)
    _config.set_value("audio", "music_volume", music_volume)
    _config.set_value("audio", "sfx_volume", sfx_volume)
    _config.set_value("video", "fullscreen", fullscreen)
    _config.set_value("video", "vsync", vsync)
    _config.set_value("gameplay", "screen_shake", screen_shake)
    _config.set_value("gameplay", "language", language)
    _config.save(SETTINGS_PATH)


func load_settings() -> void:
    if _config.load(SETTINGS_PATH) != OK:
        return  # Use defaults
    master_volume = _config.get_value("audio", "master_volume", 0.8)
    music_volume = _config.get_value("audio", "music_volume", 0.7)
    sfx_volume = _config.get_value("audio", "sfx_volume", 1.0)
    fullscreen = _config.get_value("video", "fullscreen", false)
    vsync = _config.get_value("video", "vsync", true)
    screen_shake = _config.get_value("gameplay", "screen_shake", true)
    language = _config.get_value("gameplay", "language", "en")


func apply_settings() -> void:
    # Audio
    _apply_bus_volume("Master", master_volume)
    _apply_bus_volume("Music", music_volume)
    _apply_bus_volume("SFX", sfx_volume)
    
    # Video
    if fullscreen:
        DisplayServer.window_set_mode(DisplayServer.WINDOW_MODE_FULLSCREEN)
    else:
        DisplayServer.window_set_mode(DisplayServer.WINDOW_MODE_WINDOWED)
    DisplayServer.window_set_vsync_mode(
        DisplayServer.VSYNC_ENABLED if vsync else DisplayServer.VSYNC_DISABLED
    )


func _apply_bus_volume(bus_name: String, linear: float) -> void:
    var idx: int = AudioServer.get_bus_index(bus_name)
    if idx < 0:
        return
    AudioServer.set_bus_mute(idx, linear <= 0.0)
    if linear > 0.0:
        AudioServer.set_bus_volume_db(idx, linear_to_db(linear))
```

---

## Save File Location & Platform Considerations

### `user://` Path by Platform

| Platform | `user://` maps to |
|----------|--------------------|
| **Windows** | `%APPDATA%\Godot\app_userdata\<project_name>\` |
| **macOS** | `~/Library/Application Support/Godot/app_userdata/<project_name>/` |
| **Linux** | `~/.local/share/godot/app_userdata/<project_name>/` |
| **Android** | Internal app storage (not user-accessible) |
| **iOS** | App `Documents/` directory |
| **Web** | IndexedDB (virtual filesystem) |

> **Tip:** Set `application/config/use_custom_user_dir` and `application/config/custom_user_dir_name` in Project Settings to use a cleaner path like `~/.local/share/<your_game>/` instead of the nested Godot path.

### File Access Patterns

```gdscript
## Check if a directory exists
func _ensure_dir(path: String) -> void:
    DirAccess.make_dir_recursive_absolute(path)

## List all save files
func list_saves() -> PackedStringArray:
    var saves: PackedStringArray = []
    var dir := DirAccess.open(SAVE_DIR)
    if dir == null:
        return saves
    dir.list_dir_begin()
    var file_name: String = dir.get_next()
    while not file_name.is_empty():
        if file_name.ends_with(SAVE_EXTENSION):
            saves.append(file_name)
        file_name = dir.get_next()
    dir.list_dir_end()
    return saves

## Get file modification time (for sorting saves by date)
func get_save_modified_time(path: String) -> int:
    return FileAccess.get_modified_time(path)
```

---

## Save Data Encryption — Preventing Cheating

For competitive or achievement-critical games, encrypt save data:

```gdscript
## encrypted_save.gd
class_name EncryptedSave
extends RefCounted

## ⚠️ In a real game, use a unique key and don't ship it in source
const ENCRYPTION_KEY: String = "your-unique-game-key-change-this"


static func save_encrypted(data: Dictionary, path: String) -> bool:
    var json_string: String = JSON.stringify(data)
    var file := FileAccess.open_encrypted_with_pass(path, FileAccess.WRITE, ENCRYPTION_KEY)
    if file == null:
        push_error("Failed to open encrypted file: %s" % error_string(FileAccess.get_open_error()))
        return false
    file.store_string(json_string)
    file.close()
    return true


static func load_encrypted(path: String) -> Dictionary:
    if not FileAccess.file_exists(path):
        return {}
    var file := FileAccess.open_encrypted_with_pass(path, FileAccess.READ, ENCRYPTION_KEY)
    if file == null:
        push_error("Failed to open encrypted file (wrong key or corrupt)")
        return {}
    var json_string: String = file.get_as_text()
    file.close()
    
    var json := JSON.new()
    if json.parse(json_string) != OK:
        return {}
    return json.data
```

> **Limitation:** Encryption prevents casual hex-editing but not determined modders. Godot exports can be decompiled to find the key. For online games, validate save data server-side.

---

## Screenshot Thumbnails for Save Slots

Capture a thumbnail when saving for a richer save/load UI:

```gdscript
## In save_manager.gd:

func save_game_with_screenshot(slot: int) -> bool:
    # Capture screenshot
    var screenshot: Image = get_viewport().get_texture().get_image()
    
    # Resize to thumbnail (160x90 for 16:9)
    screenshot.resize(160, 90, Image.INTERPOLATE_BILINEAR)
    
    # Save thumbnail as PNG
    var thumb_path: String = SAVE_DIR + "save_%d_thumb.png" % slot
    screenshot.save_png(thumb_path)
    
    # Save game data (with thumbnail path in metadata)
    return save_game(slot)
```

---

## Common Mistakes & Fixes

### 1. Saving Node References Instead of Data

```gdscript
## ❌ Wrong: Node references are invalid after load
func save_data() -> Dictionary:
    return {"target": target_node}  # Can't serialize a Node!

## ✅ Right: Save an identifier, resolve on load
func save_data() -> Dictionary:
    return {"target_path": str(target_node.get_path())}

func load_data(data: Dictionary) -> void:
    var path: String = data.get("target_path", "")
    if not path.is_empty():
        target_node = get_node_or_null(path)
```

### 2. Loading Before the Scene is Ready

```gdscript
## ❌ Wrong: Apply data immediately after change_scene_to_file
get_tree().change_scene_to_file(scene_path)
_apply_save_data(data)  # Scene isn't loaded yet!

## ✅ Right: Wait for the scene tree to settle
get_tree().change_scene_to_file(scene_path)
await get_tree().tree_changed
await get_tree().process_frame  # All _ready() calls complete
_apply_save_data(data)
```

### 3. Not Handling Missing Keys (Old Save Files)

```gdscript
## ❌ Wrong: Crashes if "gold" key doesn't exist in old save
func load_data(data: Dictionary) -> void:
    gold = data["gold"]  # KeyError on old saves!

## ✅ Right: Always use .get() with defaults
func load_data(data: Dictionary) -> void:
    gold = data.get("gold", 0)
    gems = data.get("gems", 0)  # New field, old saves return default
```

### 4. Saving Every Frame / On Every Change

```gdscript
## ❌ Wrong: Save on every coin pickup (disk I/O spam)
func _on_coin_collected() -> void:
    coins += 1
    SaveManager.save_game(0)  # Writes entire save file!

## ✅ Right: Batch saves at natural breakpoints
## - Entering a new room/area
## - Opening a save point (bonfire, typewriter)
## - Autosave timer (every 5 minutes)
## - Before a boss fight
```

### 5. Using NodePath as Save Key (Breaks if Tree Changes)

```gdscript
## ❌ Fragile: NodePath changes if you rearrange the scene tree
var key = str(node.get_path())  # "/root/Level/Enemies/Goblin"

## ✅ Robust: Use a stable unique ID
@export var save_id: StringName = &"goblin_cave_01"
# Or generate from scene + position:
var key = "%s_%d_%d" % [scene_file_path, spawn_x, spawn_y]
```

### 6. Forgetting to Save Autoload State

```gdscript
## ❌ Wrong: Only saving nodes in the current scene
## Autoloads (QuestManager, WorldState, PlayerStats) are NOT in the scene tree!

## ✅ Right: Also add Autoloads to the "saveable" group
## In quest_manager.gd _ready():
func _ready() -> void:
    add_to_group("saveable")
```

### 7. Race Condition on Load — Signals Fire Before Data Applied

```gdscript
## ❌ Wrong: _ready() emits signals that depend on loaded data
func _ready() -> void:
    health_changed.emit(health)  # Emits with DEFAULT health, not loaded!

## ✅ Right: Defer initial signal emission
func _ready() -> void:
    # Don't emit here — load_data will set health and emit
    pass

func load_data(data: Dictionary) -> void:
    health = data.get("health", max_health)
    health_changed.emit(health)  # Now emits with correct loaded value
```

---

## Performance Considerations

| Concern | Recommendation |
|---------|---------------|
| **Save file size** | JSON: 100KB–1MB typical. Compress large saves (>500KB) with `PackedByteArray.compress()`. |
| **Save frequency** | Max once per 30 seconds for autosave. Manual saves can be instant. |
| **Serialization time** | JSON.stringify is fast for <1MB. For larger data, consider binary or threaded saves. |
| **Threaded saves** | For large worlds, serialize in a background thread to avoid frame hitches. |
| **Delta saves** | Save only what changed from defaults. A 1000-tile map with 5 broken tiles = 5 entries, not 1000. |
| **Lazy loading** | For huge worlds, load only the current chunk's data. Don't deserialize the entire save. |

### Threaded Save (Prevent Hitches)

```gdscript
func save_game_threaded(slot: int) -> void:
    # Collect data on main thread (node access is NOT thread-safe)
    var save_data: Dictionary = _collect_save_data()
    save_data["meta"] = _build_metadata()
    
    # Write to disk on background thread
    var thread := Thread.new()
    thread.start(func() -> void:
        var json: String = JSON.stringify(save_data, "\t")
        var file := FileAccess.open(_slot_path(slot), FileAccess.WRITE)
        if file:
            file.store_string(json)
            file.close()
        # Signal completion on main thread
        call_deferred("_on_save_thread_complete", slot, thread)
    )

func _on_save_thread_complete(slot: int, thread: Thread) -> void:
    thread.wait_to_finish()
    save_completed.emit(slot)
```

---

## Tuning Reference Tables

### Save Frequency by Game Type

| Game Type | Save Strategy | Autosave Interval |
|-----------|--------------|-------------------|
| Roguelike | Save on floor transition, delete on death | Per floor |
| Platformer | Save at checkpoints/save points | 5–10 min |
| RPG | Manual save + autosave on area change | 3–5 min |
| Strategy | Manual save + autosave on turn end | Every turn |
| Survival | Autosave on sleep/rest | 5 min |
| Visual Novel | Save at every choice point | Per choice |
| Puzzle | Save on level complete | Per puzzle |

### Save File Sizes by Game Complexity

| Game Type | Typical Save Size | Notes |
|-----------|------------------|-------|
| Simple (platformer, puzzle) | 1–10 KB | Player state + level progress |
| Medium (RPG, adventure) | 10–100 KB | Inventory, quests, world flags |
| Complex (open world, sandbox) | 100 KB–1 MB | Modified terrain, many entities |
| Very large (Minecraft-like) | 1–50 MB | Chunk data, consider binary+compression |

### Serialization Format Comparison

| Format | Speed | Size | Readability | Security | Godot Types | Recommended For |
|--------|-------|------|-------------|----------|-------------|-----------------|
| JSON | Fast | Medium | ✅ Excellent | ✅ Data only | ❌ Manual | Most games |
| Resource (.tres) | Fast | Large | ⚠️ OK | ❌ Can execute code | ✅ Native | Prototyping |
| Binary (var_to_bytes) | Fastest | Small | ❌ None | ❌ Can instantiate objects | ✅ Native | Large worlds |
| Binary + Zstd | Fast | Smallest | ❌ None | ❌ | ✅ Native | Very large saves |
| Encrypted JSON | Slower | Medium | ❌ Encrypted | ✅ Best | ❌ Manual | Competitive games |

---

## Godot 3→4 Migration Reference

| Godot 3 | Godot 4 | Notes |
|---------|---------|-------|
| `File.new()` | `FileAccess.open()` | Static factory instead of `new()` |
| `file.open(path, File.WRITE)` | `FileAccess.open(path, FileAccess.WRITE)` | Same pattern, different class |
| `file.store_string()` | `file.store_string()` | Unchanged |
| `file.get_as_text()` | `file.get_as_text()` | Unchanged |
| `JSON.parse(string)` | `var json = JSON.new(); json.parse(string)` | Instance method, not static |
| `parse_json(string)` | `JSON.new().parse(string); json.data` | Helper function removed |
| `to_json(dict)` | `JSON.stringify(dict)` | Static method now |
| `File.file_exists()` | `FileAccess.file_exists()` | Static method |
| `Directory.new()` | `DirAccess.open()` | Static factory |
| `dir.make_dir_recursive()` | `DirAccess.make_dir_recursive_absolute()` | Static method |
| `file.open_encrypted_with_pass()` | `FileAccess.open_encrypted_with_pass()` | Static factory |
| `yield()` | `await` | Used in threaded/deferred save patterns |

---

## Related Guides

- [G1 Scene Composition](./G1_scene_composition.md) — Scene tree structure that saves reference
- [G3 Signal Architecture](./G3_signal_architecture.md) — Signal bus for save/load events
- [G7 TileMap & Terrain](./G7_tilemap_and_terrain.md) — Saving modified tile data
- [G9 UI & Control Systems](./G9_ui_control_systems.md) — Save slot UI, settings screen, confirmation dialogs
- [G10 Audio Systems](./G10_audio_systems.md) — Audio settings persistence
