# G53 — Data-Driven Design & Game Databases

> **Category:** Guide · **Engine:** Godot 4.4+ · **Language:** GDScript / C#
> **Related:** [G19 Custom Resources & Plugins](./G19_custom_resources_and_plugins.md) · [G11 Save/Load Systems](./G11_save_load_systems.md) · [G32 Inventory & Crafting Systems](./G32_inventory_and_crafting_systems.md) · [G51 Entity-Component Patterns](./G51_entity_component_patterns.md)

---

## What This Guide Covers

Hard-coding game values — enemy HP, item stats, drop rates, XP curves — directly in scripts makes balancing a nightmare. Every tweak requires opening code, editing a constant, and retesting. Data-driven design moves these values into external data files (Resources, JSON, CSV) that designers can edit without touching code.

This guide covers building item/entity databases with custom Resources, when to use Resources vs JSON vs CSV, loading and validating data at runtime, editor-friendly workflows for designers, importing spreadsheet data into Godot, building a central data registry (AutoLoad), and patterns for hot-reloading data during development.

**Use this guide when:** your game has many items, enemies, abilities, recipes, dialogue entries, or any content where the *structure* is the same but the *values* differ. If you find yourself duplicating scripts that differ only in exported numbers, you need data-driven design.

---

## Table of Contents

1. [Why Data-Driven?](#1-why-data-driven)
2. [Custom Resources as Data Containers](#2-custom-resources-as-data-containers)
3. [Building an Item Database](#3-building-an-item-database)
4. [The Data Registry Pattern](#4-the-data-registry-pattern)
5. [JSON for External / Moddable Data](#5-json-for-external--moddable-data)
6. [CSV Import Workflows](#6-csv-import-workflows)
7. [Data Validation](#7-data-validation)
8. [Editor Workflows for Designers](#8-editor-workflows-for-designers)
9. [Balancing Tables and Curves](#9-balancing-tables-and-curves)
10. [C# Examples](#10-c-examples)
11. [Choosing the Right Format](#11-choosing-the-right-format)
12. [Common Pitfalls](#12-common-pitfalls)

---

## 1. Why Data-Driven?

Consider an RPG with 200 items. Without data-driven design:

```
res://items/
  ├── wooden_sword.gd   (extends BaseItem, hp=5, damage=10, ...)
  ├── iron_sword.gd     (extends BaseItem, hp=8, damage=18, ...)
  ├── fire_sword.gd     (extends BaseItem, hp=8, damage=15, fire=10, ...)
  └── ... 197 more scripts
```

With data-driven design:

```
res://data/items/
  ├── wooden_sword.tres   (ItemData resource: damage=10)
  ├── iron_sword.tres     (ItemData resource: damage=18)
  ├── fire_sword.tres     (ItemData resource: damage=15, element=FIRE)
  └── ...
```

One script (`item_data.gd`) defines the structure. Hundreds of `.tres` files define the content. Designers edit data in the Inspector without ever opening a script.

---

## 2. Custom Resources as Data Containers

### Defining a Data Resource

```gdscript
# item_data.gd
class_name ItemData
extends Resource

enum ItemType { WEAPON, ARMOR, CONSUMABLE, KEY_ITEM, MATERIAL }
enum Rarity { COMMON, UNCOMMON, RARE, EPIC, LEGENDARY }

@export var id: StringName = &""
@export var display_name: String = ""
@export_multiline var description: String = ""
@export var icon: Texture2D
@export var item_type: ItemType = ItemType.MATERIAL
@export var rarity: Rarity = Rarity.COMMON

@export_group("Stats")
@export var damage: float = 0.0
@export var defense: float = 0.0
@export var hp_bonus: float = 0.0

@export_group("Economy")
@export var buy_price: int = 0
@export var sell_price: int = 0
@export var max_stack: int = 1

@export_group("Behavior")
@export var is_consumable: bool = false
@export var use_effect: Resource  ## Points to an effect script/resource.
```

### Creating Data in the Editor

1. Right-click in the FileSystem dock → **New Resource**
2. Search for `ItemData`
3. Fill in properties in the Inspector
4. Save as `res://data/items/iron_sword.tres`

The `@export_group` annotations create collapsible sections in the Inspector, keeping large data resources organized.

### Referencing Other Resources

Resources can reference other resources, creating relational data:

```gdscript
# recipe_data.gd
class_name RecipeData
extends Resource

@export var result_item: ItemData
@export var result_count: int = 1
@export var ingredients: Array[IngredientEntry] = []
@export var required_station: StringName = &"workbench"
@export var craft_time: float = 1.0

# ingredient_entry.gd
class_name IngredientEntry
extends Resource

@export var item: ItemData
@export var count: int = 1
```

---

## 3. Building an Item Database

For small projects, you can `preload` individual resources. For larger games, you need a database that can look up items by ID.

### File-System-Based Database

```gdscript
# item_database.gd — AutoLoad
extends Node

## All items, keyed by their StringName id.
var _items: Dictionary = {}  # StringName → ItemData

const DATA_PATH := "res://data/items/"

func _ready() -> void:
	_load_all_items()

func _load_all_items() -> void:
	var dir := DirAccess.open(DATA_PATH)
	if dir == null:
		push_error("ItemDatabase: Cannot open %s" % DATA_PATH)
		return
	
	dir.list_dir_begin()
	var file_name := dir.get_next()
	while file_name != "":
		if file_name.ends_with(".tres") or file_name.ends_with(".res"):
			var item: ItemData = load(DATA_PATH + file_name)
			if item and item.id != &"":
				_items[item.id] = item
			elif item:
				push_warning("ItemDatabase: Item in %s has empty id" % file_name)
		file_name = dir.get_next()
	
	print("ItemDatabase: Loaded %d items" % _items.size())

func get_item(id: StringName) -> ItemData:
	if _items.has(id):
		return _items[id]
	push_warning("ItemDatabase: Unknown item '%s'" % id)
	return null

func get_items_by_type(type: ItemData.ItemType) -> Array[ItemData]:
	var result: Array[ItemData] = []
	for item: ItemData in _items.values():
		if item.item_type == type:
			result.append(item)
	return result

func get_all_ids() -> Array[StringName]:
	return _items.keys()
```

### Usage Anywhere in Your Game

```gdscript
# In an inventory system, shop, crafting UI, etc.
var sword: ItemData = ItemDatabase.get_item(&"iron_sword")
print(sword.display_name)  # "Iron Sword"
print(sword.damage)        # 18.0
```

---

## 4. The Data Registry Pattern

For games with multiple data types (items, enemies, abilities, recipes), a central registry avoids duplicating the loading pattern:

```gdscript
# data_registry.gd — AutoLoad
extends Node

var items: Dictionary = {}       # StringName → ItemData
var enemies: Dictionary = {}     # StringName → EnemyData
var abilities: Dictionary = {}   # StringName → AbilityData
var recipes: Dictionary = {}     # StringName → RecipeData

const PATHS := {
	"items": "res://data/items/",
	"enemies": "res://data/enemies/",
	"abilities": "res://data/abilities/",
	"recipes": "res://data/recipes/",
}

func _ready() -> void:
	items = _load_directory(PATHS["items"])
	enemies = _load_directory(PATHS["enemies"])
	abilities = _load_directory(PATHS["abilities"])
	recipes = _load_directory(PATHS["recipes"])

func _load_directory(path: String) -> Dictionary:
	var result: Dictionary = {}
	var dir := DirAccess.open(path)
	if dir == null:
		push_warning("DataRegistry: Cannot open %s" % path)
		return result
	
	dir.list_dir_begin()
	var file_name := dir.get_next()
	while file_name != "":
		if file_name.ends_with(".tres"):
			var resource: Resource = load(path + file_name)
			if resource and "id" in resource and resource.id != &"":
				result[resource.id] = resource
		file_name = dir.get_next()
	return result
```

---

## 5. JSON for External / Moddable Data

When you want data that players can mod, or data generated by external tools, JSON is the right choice:

```gdscript
# json_data_loader.gd
class_name JsonDataLoader

## Load a JSON file and return parsed data.
static func load_json(path: String) -> Variant:
	if not FileAccess.file_exists(path):
		push_error("JsonDataLoader: File not found: %s" % path)
		return null
	
	var file := FileAccess.open(path, FileAccess.READ)
	var text := file.get_as_text()
	file.close()
	
	var json := JSON.new()
	var error := json.parse(text)
	if error != OK:
		push_error("JsonDataLoader: Parse error in %s at line %d: %s" % [
			path, json.get_error_line(), json.get_error_message()
		])
		return null
	
	return json.data
```

### Example: Loading Enemy Wave Data from JSON

```json
{
  "waves": [
    {
      "wave_number": 1,
      "enemies": [
        { "type": "slime", "count": 5, "delay": 0.5 },
        { "type": "bat", "count": 2, "delay": 1.0 }
      ],
      "time_limit": 30.0
    },
    {
      "wave_number": 2,
      "enemies": [
        { "type": "slime", "count": 8, "delay": 0.3 },
        { "type": "skeleton", "count": 3, "delay": 0.8 }
      ],
      "time_limit": 45.0
    }
  ]
}
```

```gdscript
func load_wave_config() -> Array:
	var data: Dictionary = JsonDataLoader.load_json("res://data/waves.json")
	if data == null:
		return []
	return data.get("waves", [])
```

### When to Use JSON vs Resources

| Factor                  | Resources (.tres)         | JSON (.json)              |
|-------------------------|---------------------------|---------------------------|
| Editor integration      | Full Inspector support    | No built-in editor        |
| Type safety             | Strong (exports)          | Weak (manual validation)  |
| Godot type support      | Vector2, Color, NodePath  | Strings/numbers only      |
| Modding support         | Harder (binary possible)  | Easy (plain text)         |
| External tool export    | Requires conversion       | Native export from sheets |
| Load performance        | Fast (native serializer)  | Slower (parse step)       |

**Rule of thumb:** Use Resources for core game data edited in the Godot editor. Use JSON for data imported from external tools or exposed to modders.

---

## 6. CSV Import Workflows

Many designers balance games in spreadsheets. Here's how to bring that data into Godot:

### Runtime CSV Parser

```gdscript
# csv_loader.gd
class_name CsvLoader

## Parse a CSV file into an array of dictionaries.
## First row is treated as headers (keys).
static func load_csv(path: String, delimiter: String = ",") -> Array[Dictionary]:
	var results: Array[Dictionary] = []
	
	if not FileAccess.file_exists(path):
		push_error("CsvLoader: File not found: %s" % path)
		return results
	
	var file := FileAccess.open(path, FileAccess.READ)
	
	# First line = headers.
	var headers: PackedStringArray = file.get_csv_line(delimiter)
	
	while not file.eof_reached():
		var values: PackedStringArray = file.get_csv_line(delimiter)
		if values.size() == 0 or (values.size() == 1 and values[0] == ""):
			continue
		
		var entry: Dictionary = {}
		for i in mini(headers.size(), values.size()):
			entry[headers[i].strip_edges()] = values[i].strip_edges()
		results.append(entry)
	
	file.close()
	return results
```

### Example: Importing Enemy Stats from CSV

CSV file (`enemies.csv`):

```
id,name,hp,damage,speed,xp_reward
slime,Green Slime,30,5,60,10
bat,Cave Bat,15,8,120,15
skeleton,Skeleton Warrior,80,15,50,30
```

```gdscript
func import_enemies_from_csv() -> void:
	var rows := CsvLoader.load_csv("res://data/enemies.csv")
	for row: Dictionary in rows:
		var enemy := EnemyData.new()
		enemy.id = StringName(row["id"])
		enemy.display_name = row["name"]
		enemy.max_hp = float(row["hp"])
		enemy.base_damage = float(row["damage"])
		enemy.move_speed = float(row["speed"])
		enemy.xp_reward = int(row["xp_reward"])
		# Save as .tres for future loads.
		ResourceSaver.save(enemy, "res://data/enemies/%s.tres" % row["id"])
```

### Editor Import Plugin (for automatic CSV → Resource conversion)

For a production workflow, write an `EditorImportPlugin` that automatically converts CSV files when they change. See the [Godot docs on import plugins](https://docs.godotengine.org/en/stable/tutorials/plugins/editor/import_plugins.html) for the full API.

---

## 7. Data Validation

Bad data causes hard-to-trace bugs. Validate early:

```gdscript
# data_validator.gd — run in _ready() of your registry or via an editor tool
class_name DataValidator

static func validate_items(items: Dictionary) -> int:
	var error_count := 0
	
	for id: StringName in items:
		var item: ItemData = items[id]
		
		# Required fields.
		if item.display_name.is_empty():
			push_warning("Validation: Item '%s' has no display_name" % id)
			error_count += 1
		
		# Logical checks.
		if item.sell_price > item.buy_price and item.buy_price > 0:
			push_warning("Validation: Item '%s' sells for more than it costs (exploit!)" % id)
			error_count += 1
		
		if item.is_consumable and item.use_effect == null:
			push_warning("Validation: Consumable '%s' has no use_effect" % id)
			error_count += 1
		
		if item.max_stack < 1:
			push_warning("Validation: Item '%s' has max_stack < 1" % id)
			error_count += 1
	
	if error_count == 0:
		print("DataValidator: All %d items passed validation" % items.size())
	else:
		push_warning("DataValidator: %d issues found in %d items" % [error_count, items.size()])
	
	return error_count
```

Run validation in debug builds only:

```gdscript
func _ready() -> void:
	_load_all_data()
	if OS.is_debug_build():
		DataValidator.validate_items(items)
```

---

## 8. Editor Workflows for Designers

### Resources-as-Sheets Plugin

The community plugin **Edit Resources as Table** (available in the Asset Library) lets you view all `.tres` files of a given type in a spreadsheet-like table directly in the editor. This is invaluable for bulk-editing item stats, enemy HP, price values, and so on without clicking through individual files.

### @export Hints for Better UX

```gdscript
## Range slider in the Inspector.
@export_range(0, 100, 1) var drop_chance: float = 10.0

## File picker filtered to .png files.
@export_file("*.png") var icon_path: String

## Dropdown from an enum.
@export var rarity: Rarity = Rarity.COMMON

## Color picker.
@export var rarity_color: Color = Color.WHITE

## Multi-line text area.
@export_multiline var description: String = ""

## Flags (bitfield checkboxes).
@export_flags("Fire", "Ice", "Lightning", "Poison") var element_flags: int = 0
```

---

## 9. Balancing Tables and Curves

### XP / Level Curves with Godot's Curve Resource

```gdscript
## In a LevelData resource or AutoLoad:
@export var xp_curve: Curve  ## Define the curve in the editor.

func xp_required_for_level(level: int) -> int:
	## Sample the curve (0.0 to 1.0) and scale to your max XP.
	var t: float = float(level) / float(max_level)
	return int(xp_curve.sample(t) * max_xp_at_cap)
```

### Damage Scaling Formula

```gdscript
## Common RPG damage formula:
## final = base_atk × (atk / (atk + def)) × random_variance
static func calculate_damage(attacker_atk: float, defender_def: float, base: float) -> float:
	var ratio := attacker_atk / (attacker_atk + defender_def)
	var variance := randf_range(0.9, 1.1)
	return base * ratio * variance
```

### Loot Drop Tables

```gdscript
# loot_table.gd
class_name LootTable
extends Resource

@export var entries: Array[LootEntry] = []

func roll() -> Array[ItemData]:
	var drops: Array[ItemData] = []
	for entry: LootEntry in entries:
		if randf() * 100.0 <= entry.drop_chance:
			drops.append(entry.item)
	return drops

# loot_entry.gd
class_name LootEntry
extends Resource

@export var item: ItemData
@export_range(0.0, 100.0) var drop_chance: float = 50.0
@export var min_count: int = 1
@export var max_count: int = 1
```

---

## 10. C# Examples

### ItemData

```csharp
using Godot;

[GlobalClass]
public partial class ItemData : Resource
{
    public enum ItemType { Weapon, Armor, Consumable, KeyItem, Material }
    public enum Rarity { Common, Uncommon, Rare, Epic, Legendary }

    [Export] public StringName Id { get; set; }
    [Export] public string DisplayName { get; set; } = "";
    [Export(PropertyHint.MultilineText)] public string Description { get; set; } = "";
    [Export] public Texture2D Icon { get; set; }
    [Export] public ItemType Type { get; set; } = ItemType.Material;
    [Export] public Rarity ItemRarity { get; set; } = Rarity.Common;

    [ExportGroup("Stats")]
    [Export] public float Damage { get; set; }
    [Export] public float Defense { get; set; }

    [ExportGroup("Economy")]
    [Export] public int BuyPrice { get; set; }
    [Export] public int SellPrice { get; set; }
    [Export] public int MaxStack { get; set; } = 1;
}
```

### Database Loader

```csharp
using Godot;
using System.Collections.Generic;

public partial class ItemDatabase : Node
{
    private Dictionary<StringName, ItemData> _items = new();
    private const string DataPath = "res://data/items/";

    public override void _Ready()
    {
        var dir = DirAccess.Open(DataPath);
        if (dir == null) return;

        dir.ListDirBegin();
        string fileName = dir.GetNext();
        while (fileName != "")
        {
            if (fileName.EndsWith(".tres"))
            {
                var item = GD.Load<ItemData>(DataPath + fileName);
                if (item?.Id != null)
                    _items[item.Id] = item;
            }
            fileName = dir.GetNext();
        }
        GD.Print($"ItemDatabase: Loaded {_items.Count} items");
    }

    public ItemData GetItem(StringName id) =>
        _items.TryGetValue(id, out var item) ? item : null;
}
```

---

## 11. Choosing the Right Format

| Scenario                                  | Recommended Format |
|-------------------------------------------|--------------------|
| Core game data (items, enemies, skills)   | Custom Resources   |
| Level/wave definitions                    | JSON or Resources  |
| Spreadsheet-balanced stats                | CSV → Resources    |
| Moddable content (user-created items)     | JSON               |
| Localization strings                      | CSV (or Godot's built-in Translation) |
| Config / settings                         | ConfigFile or JSON  |
| Complex relational data                   | Resources referencing Resources |

---

## 12. Common Pitfalls

### Resource sharing (unintended mutation)

**Problem:** Two enemies reference the same `ItemData` resource. One modifies it at runtime, and both change.
**Solution:** Resources are shared by default. Call `resource.duplicate()` before modifying at runtime, or mark the resource as `local_to_scene = true`.

### String IDs vs integer IDs

**Problem:** Using plain `String` for IDs invites typos (`"irn_sword"` vs `"iron_sword"`).
**Solution:** Use `StringName` (interned strings, fast comparison) and validate all IDs at load time. Define ID constants if your dataset is small enough:

```gdscript
class_name Items
const IRON_SWORD := &"iron_sword"
const WOODEN_SHIELD := &"wooden_shield"
```

### Loading order dependencies

**Problem:** RecipeData references ItemData, but ItemData hasn't loaded yet.
**Solution:** Godot's `load()` / `preload()` handles Resource dependencies automatically for `.tres` files. For JSON, load in the correct order (items before recipes) or use a two-pass approach (load all, then resolve references).

### Massive data directories are slow to scan

**Problem:** 10,000 `.tres` files in one directory slows down `DirAccess.list_dir_begin()`.
**Solution:** Organize into subdirectories (`items/weapons/`, `items/armor/`), or build a manifest file listing all resources and load from that instead of scanning the filesystem.
