# G32 — Inventory & Crafting Systems

> **Category:** Guide · **Engine:** Godot 4.4+ · **Language:** GDScript / C#
> **Related:** [G19 Custom Resources & Plugins](./G19_custom_resources_and_plugins.md) · [G11 Save/Load Systems](./G11_save_load_systems.md) · [G9 UI & Control Systems](./G9_ui_control_systems.md) · [G3 Signal Architecture](./G3_signal_architecture.md)

---

## What This Guide Covers

Inventory and crafting systems appear in nearly every game genre — from RPG equipment screens to survival-game resource management to puzzle-game item collections. Getting the data model right determines whether your system is flexible, serializable, and testable. Getting the UI right determines whether players enjoy interacting with it.

This guide covers the data architecture (Resources vs Dictionaries), slot-based and grid-based inventory models, item stacking and weight/capacity limits, drag-and-drop UI, equipment and stat systems, crafting recipes, and save/load integration. All code targets Godot 4.4+ with fully typed GDScript and C# equivalents.

---

## Table of Contents

1. [Architecture Decisions](#1-architecture-decisions)
2. [Item Data Model](#2-item-data-model)
3. [Inventory Container](#3-inventory-container)
4. [Slot-Based Inventory](#4-slot-based-inventory)
5. [Grid-Based Inventory](#5-grid-based-inventory)
6. [Stacking, Weight & Capacity](#6-stacking-weight--capacity)
7. [Inventory UI](#7-inventory-ui)
8. [Drag & Drop](#8-drag--drop)
9. [Equipment & Stats](#9-equipment--stats)
10. [Crafting System](#10-crafting-system)
11. [Loot Tables](#11-loot-tables)
12. [Save/Load Integration](#12-saveload-integration)
13. [Performance at Scale](#13-performance-at-scale)
14. [Common Mistakes](#14-common-mistakes)

---

## 1. Architecture Decisions

### Resources vs Dictionaries

| Approach | Best For | Trade-offs |
|----------|----------|------------|
| **Custom Resources** | Games where items have consistent schemas (RPGs, action games) | Type-safe, inspector-editable, version-controlled. Harder to add arbitrary properties at runtime |
| **Dictionaries** | Crafting-heavy or modding-friendly games where items vary wildly | Flexible schema, easy to extend. No type checking, easy to introduce typos |
| **Hybrid** | Most production games | Resource for item definitions (static data), Dictionary for instance data (durability, enchantments) |

**Recommendation:** Start with Resources. Move to hybrid if you need per-instance mutable state beyond what Resources track cleanly.

### Signal-Driven vs Polling

Always use signals. Inventory changes are discrete events (item added, removed, moved). Polling the inventory every frame to update UI wastes cycles and misses the exact moment of change.

---

## 2. Item Data Model

### Item Definition Resource

```gdscript
# item_data.gd
class_name ItemData
extends Resource

## Unique identifier — use for lookups, save/load, crafting recipes
@export var id: StringName = &""

## Display
@export var display_name: String = ""
@export var description: String = ""
@export var icon: Texture2D

## Categorization
@export_enum("Consumable", "Equipment", "Material", "Quest", "Key") var category: String = "Material"

## Stacking
@export var max_stack: int = 1
@export var is_stackable: bool:
    get: return max_stack > 1

## Weight / value
@export var weight: float = 0.0
@export var sell_value: int = 0

## Equipment specifics (only relevant if category == "Equipment")
@export_enum("None", "Head", "Chest", "Legs", "Feet", "Weapon", "Shield", "Ring", "Amulet") var equip_slot: String = "None"
@export var stat_modifiers: Dictionary = {}  # {"attack": 5, "defense": 3}

## Optional: scene to spawn in world
@export var world_scene: PackedScene
```

### C# Equivalent

```csharp
using Godot;
using Godot.Collections;

[GlobalClass]
public partial class ItemData : Resource
{
    [Export] public StringName Id { get; set; } = "";
    [Export] public string DisplayName { get; set; } = "";
    [Export] public string Description { get; set; } = "";
    [Export] public Texture2D Icon { get; set; }
    [Export] public string Category { get; set; } = "Material";
    [Export] public int MaxStack { get; set; } = 1;
    [Export] public float Weight { get; set; } = 0f;
    [Export] public int SellValue { get; set; } = 0;
    [Export] public string EquipSlot { get; set; } = "None";
    [Export] public Dictionary StatModifiers { get; set; } = new();
    [Export] public PackedScene WorldScene { get; set; }

    public bool IsStackable => MaxStack > 1;
}
```

### Item Instance (Runtime State)

For items that have mutable state (durability, enchantments, ammo count):

```gdscript
# item_instance.gd
class_name ItemInstance
extends RefCounted

var data: ItemData
var quantity: int = 1
var instance_properties: Dictionary = {}  # durability, enchantments, etc.

func _init(item_data: ItemData, qty: int = 1) -> void:
    data = item_data
    quantity = qty

## Convenience accessors
var id: StringName:
    get: return data.id

var display_name: String:
    get: return data.display_name

func get_durability() -> float:
    return instance_properties.get("durability", 1.0)

func set_durability(value: float) -> void:
    instance_properties["durability"] = clampf(value, 0.0, 1.0)

func is_broken() -> bool:
    return instance_properties.has("durability") and get_durability() <= 0.0

func serialize() -> Dictionary:
    return {
        "id": data.id,
        "quantity": quantity,
        "properties": instance_properties.duplicate()
    }

static func deserialize(save_data: Dictionary, item_db: ItemDatabase) -> ItemInstance:
    var item_data: ItemData = item_db.get_item(save_data["id"])
    if item_data == null:
        return null
    var instance := ItemInstance.new(item_data, save_data.get("quantity", 1))
    instance.instance_properties = save_data.get("properties", {})
    return instance
```

---

## 3. Inventory Container

The core inventory is a data container with signals — no UI. This separation is critical for testability and multiplayer.

```gdscript
# inventory.gd
class_name Inventory
extends RefCounted

signal item_added(slot_index: int, item: ItemInstance)
signal item_removed(slot_index: int, item: ItemInstance)
signal item_changed(slot_index: int, item: ItemInstance)
signal inventory_full

var slots: Array[ItemInstance]
var capacity: int

func _init(slot_count: int = 20) -> void:
    capacity = slot_count
    slots = []
    slots.resize(slot_count)
    # All slots start null (empty)

## --- Core Operations ---

func add_item(item_data: ItemData, quantity: int = 1) -> int:
    """Add items. Returns the number of items that could NOT be added (overflow)."""
    var remaining: int = quantity

    # First pass: try to stack into existing slots
    if item_data.max_stack > 1:
        for i in slots.size():
            if remaining <= 0:
                break
            if slots[i] != null and slots[i].data == item_data:
                var space: int = item_data.max_stack - slots[i].quantity
                var to_add: int = mini(remaining, space)
                if to_add > 0:
                    slots[i].quantity += to_add
                    remaining -= to_add
                    item_changed.emit(i, slots[i])

    # Second pass: place in empty slots
    while remaining > 0:
        var empty_slot: int = _find_empty_slot()
        if empty_slot == -1:
            inventory_full.emit()
            return remaining  # Could not fit all items
        var stack_size: int = mini(remaining, item_data.max_stack)
        slots[empty_slot] = ItemInstance.new(item_data, stack_size)
        remaining -= stack_size
        item_added.emit(empty_slot, slots[empty_slot])

    return 0


func remove_item_at(slot_index: int, quantity: int = 1) -> ItemInstance:
    """Remove quantity from a slot. Returns the removed ItemInstance (or null)."""
    if slot_index < 0 or slot_index >= slots.size():
        return null
    var item: ItemInstance = slots[slot_index]
    if item == null:
        return null

    var removed_qty: int = mini(quantity, item.quantity)
    var removed := ItemInstance.new(item.data, removed_qty)
    removed.instance_properties = item.instance_properties.duplicate()

    item.quantity -= removed_qty
    if item.quantity <= 0:
        slots[slot_index] = null
        item_removed.emit(slot_index, removed)
    else:
        item_changed.emit(slot_index, item)

    return removed


func swap_slots(from: int, to: int) -> void:
    """Swap two slot contents."""
    var temp: ItemInstance = slots[from]
    slots[from] = slots[to]
    slots[to] = temp
    item_changed.emit(from, slots[from])
    item_changed.emit(to, slots[to])


func get_item_at(slot_index: int) -> ItemInstance:
    if slot_index < 0 or slot_index >= slots.size():
        return null
    return slots[slot_index]


func has_item(item_id: StringName, quantity: int = 1) -> bool:
    """Check if inventory contains at least `quantity` of an item."""
    var total: int = 0
    for slot in slots:
        if slot != null and slot.data.id == item_id:
            total += slot.quantity
            if total >= quantity:
                return true
    return false


func count_item(item_id: StringName) -> int:
    var total: int = 0
    for slot in slots:
        if slot != null and slot.data.id == item_id:
            total += slot.quantity
    return total


func consume_item(item_id: StringName, quantity: int = 1) -> bool:
    """Remove quantity of an item across all slots. Returns false if not enough."""
    if not has_item(item_id, quantity):
        return false
    var remaining: int = quantity
    for i in slots.size():
        if remaining <= 0:
            break
        if slots[i] != null and slots[i].data.id == item_id:
            var to_remove: int = mini(remaining, slots[i].quantity)
            remove_item_at(i, to_remove)
            remaining -= to_remove
    return true


## --- Query Helpers ---

func get_total_weight() -> float:
    var total: float = 0.0
    for slot in slots:
        if slot != null:
            total += slot.data.weight * slot.quantity
    return total


func get_items_by_category(category: String) -> Array[ItemInstance]:
    var result: Array[ItemInstance] = []
    for slot in slots:
        if slot != null and slot.data.category == category:
            result.append(slot)
    return result


func is_full() -> bool:
    return _find_empty_slot() == -1


func _find_empty_slot() -> int:
    for i in slots.size():
        if slots[i] == null:
            return i
    return -1
```

---

## 4. Slot-Based Inventory

The simplest model: a fixed array of slots, each holding one item stack. This is what the `Inventory` class above implements. Works for most RPGs, action games, and adventure games.

### Item Database (Registry)

```gdscript
# item_database.gd
class_name ItemDatabase
extends Node

## Autoload this as "ItemDB"

var _items: Dictionary = {}  # StringName → ItemData

func _ready() -> void:
    _load_items_from_directory("res://data/items/")

func _load_items_from_directory(path: String) -> void:
    var dir := DirAccess.open(path)
    if dir == null:
        push_warning("ItemDatabase: Could not open %s" % path)
        return
    dir.list_dir_begin()
    var file_name: String = dir.get_next()
    while file_name != "":
        if file_name.ends_with(".tres") or file_name.ends_with(".res"):
            var item: ItemData = load(path.path_join(file_name)) as ItemData
            if item and item.id != &"":
                _items[item.id] = item
        file_name = dir.get_next()
    dir.list_dir_end()
    print("ItemDatabase: Loaded %d items" % _items.size())

func get_item(id: StringName) -> ItemData:
    return _items.get(id)

func get_all_items() -> Array[ItemData]:
    var result: Array[ItemData] = []
    for item: ItemData in _items.values():
        result.append(item)
    return result
```

---

## 5. Grid-Based Inventory

For games like Resident Evil 4 or Escape from Tarkov where items occupy multiple cells:

```gdscript
# grid_inventory.gd
class_name GridInventory
extends RefCounted

signal item_placed(item: ItemInstance, grid_pos: Vector2i)
signal item_removed(item: ItemInstance, grid_pos: Vector2i)

var width: int
var height: int
var _grid: Array  # 2D array of ItemInstance references (or null)
var _items: Array[ItemInstance] = []  # All unique items in the grid

func _init(w: int = 10, h: int = 6) -> void:
    width = w
    height = h
    _grid = []
    for y in height:
        var row: Array = []
        row.resize(width)
        _grid.append(row)


func can_place(item: ItemInstance, pos: Vector2i) -> bool:
    """Check if item fits at position. Item shape stored in instance_properties."""
    var shape: Array = _get_shape(item)
    for offset: Vector2i in shape:
        var cell: Vector2i = pos + offset
        if cell.x < 0 or cell.x >= width or cell.y < 0 or cell.y >= height:
            return false
        if _grid[cell.y][cell.x] != null:
            return false
    return true


func place_item(item: ItemInstance, pos: Vector2i) -> bool:
    if not can_place(item, pos):
        return false
    var shape: Array = _get_shape(item)
    for offset: Vector2i in shape:
        var cell: Vector2i = pos + offset
        _grid[cell.y][cell.x] = item
    item.instance_properties["grid_pos"] = pos
    _items.append(item)
    item_placed.emit(item, pos)
    return true


func remove_item(item: ItemInstance) -> bool:
    if item not in _items:
        return false
    var pos: Vector2i = item.instance_properties.get("grid_pos", Vector2i.ZERO)
    var shape: Array = _get_shape(item)
    for offset: Vector2i in shape:
        var cell: Vector2i = pos + offset
        if cell.x >= 0 and cell.x < width and cell.y >= 0 and cell.y < height:
            if _grid[cell.y][cell.x] == item:
                _grid[cell.y][cell.x] = null
    _items.erase(item)
    item_removed.emit(item, pos)
    return true


func find_first_fit(item: ItemInstance) -> Vector2i:
    """Auto-find a position for the item. Returns (-1, -1) if none."""
    for y in height:
        for x in width:
            if can_place(item, Vector2i(x, y)):
                return Vector2i(x, y)
    return Vector2i(-1, -1)


func _get_shape(item: ItemInstance) -> Array:
    """Item shape as array of Vector2i offsets. Default: 1x1."""
    return item.instance_properties.get("shape", [Vector2i.ZERO])
```

### Defining Item Shapes

```gdscript
# In item data or when creating instances:
# L-shaped item (3 cells):
item.instance_properties["shape"] = [
    Vector2i(0, 0), Vector2i(0, 1), Vector2i(1, 1)
]

# 2x3 rifle:
item.instance_properties["shape"] = [
    Vector2i(0, 0), Vector2i(1, 0), Vector2i(2, 0),
    Vector2i(0, 1), Vector2i(1, 1), Vector2i(2, 1)
]
```

---

## 6. Stacking, Weight & Capacity

### Weight Limit System

```gdscript
# Extend Inventory with weight awareness:
class_name WeightedInventory
extends Inventory

var max_weight: float = 50.0

signal overweight(current: float, maximum: float)

func add_item(item_data: ItemData, quantity: int = 1) -> int:
    var added_weight: float = item_data.weight * quantity
    var current: float = get_total_weight()
    if current + added_weight > max_weight:
        # Calculate how many we CAN add
        var affordable: int = floori((max_weight - current) / maxf(item_data.weight, 0.001))
        if affordable <= 0:
            overweight.emit(current, max_weight)
            return quantity
        var overflow: int = super.add_item(item_data, affordable)
        overweight.emit(get_total_weight(), max_weight)
        return quantity - affordable + overflow
    return super.add_item(item_data, quantity)
```

### Stack Splitting

```gdscript
func split_stack(slot_index: int, split_quantity: int) -> int:
    """Split a stack — moves split_quantity to a new slot. Returns the new slot index or -1."""
    var item: ItemInstance = slots[slot_index]
    if item == null or item.quantity <= split_quantity:
        return -1
    var empty: int = _find_empty_slot()
    if empty == -1:
        return -1

    item.quantity -= split_quantity
    slots[empty] = ItemInstance.new(item.data, split_quantity)
    slots[empty].instance_properties = item.instance_properties.duplicate()
    item_changed.emit(slot_index, item)
    item_added.emit(empty, slots[empty])
    return empty
```

---

## 7. Inventory UI

### Slot UI Component

```gdscript
# inventory_slot_ui.gd
class_name InventorySlotUI
extends PanelContainer

signal slot_clicked(slot_index: int, button: MouseButton)
signal slot_hovered(slot_index: int)

@onready var icon_rect: TextureRect = %IconRect
@onready var quantity_label: Label = %QuantityLabel
@onready var highlight: Panel = %Highlight

var slot_index: int = -1

func update_display(item: ItemInstance) -> void:
    if item == null:
        icon_rect.texture = null
        quantity_label.text = ""
        return
    icon_rect.texture = item.data.icon
    quantity_label.text = str(item.quantity) if item.quantity > 1 else ""
    quantity_label.visible = item.quantity > 1


func set_highlighted(is_highlighted: bool) -> void:
    highlight.visible = is_highlighted


func _gui_input(event: InputEvent) -> void:
    if event is InputEventMouseButton:
        var mb: InputEventMouseButton = event
        if mb.pressed:
            slot_clicked.emit(slot_index, mb.button_index)
    if event is InputEventMouseMotion:
        slot_hovered.emit(slot_index)
```

### Inventory Panel (Grid of Slots)

```gdscript
# inventory_panel_ui.gd
class_name InventoryPanelUI
extends Control

@export var slot_scene: PackedScene
@export var columns: int = 5

@onready var grid: GridContainer = %SlotGrid
@onready var tooltip: Control = %Tooltip
@onready var tooltip_name: Label = %TooltipName
@onready var tooltip_desc: RichTextLabel = %TooltipDesc

var inventory: Inventory
var _slot_uis: Array[InventorySlotUI] = []

func bind_inventory(inv: Inventory) -> void:
    inventory = inv
    _rebuild_slots()
    inventory.item_added.connect(_on_slot_updated)
    inventory.item_removed.connect(_on_slot_updated)
    inventory.item_changed.connect(_on_slot_updated)


func _rebuild_slots() -> void:
    for child in grid.get_children():
        child.queue_free()
    _slot_uis.clear()
    grid.columns = columns

    for i in inventory.capacity:
        var slot_ui: InventorySlotUI = slot_scene.instantiate() as InventorySlotUI
        slot_ui.slot_index = i
        slot_ui.update_display(inventory.get_item_at(i))
        slot_ui.slot_clicked.connect(_on_slot_clicked)
        slot_ui.slot_hovered.connect(_on_slot_hovered)
        grid.add_child(slot_ui)
        _slot_uis.append(slot_ui)


func _on_slot_updated(slot_index: int, _item: ItemInstance) -> void:
    if slot_index >= 0 and slot_index < _slot_uis.size():
        _slot_uis[slot_index].update_display(inventory.get_item_at(slot_index))


func _on_slot_clicked(slot_index: int, button: MouseButton) -> void:
    if button == MOUSE_BUTTON_LEFT:
        pass  # Handle selection or drag start
    elif button == MOUSE_BUTTON_RIGHT:
        _try_use_item(slot_index)


func _on_slot_hovered(slot_index: int) -> void:
    var item: ItemInstance = inventory.get_item_at(slot_index)
    if item != null:
        tooltip_name.text = item.display_name
        tooltip_desc.text = item.data.description
        tooltip.visible = true
        tooltip.global_position = get_global_mouse_position() + Vector2(16, 16)
    else:
        tooltip.visible = false


func _try_use_item(slot_index: int) -> void:
    var item: ItemInstance = inventory.get_item_at(slot_index)
    if item == null:
        return
    match item.data.category:
        "Consumable":
            # Apply effect, then remove
            inventory.remove_item_at(slot_index, 1)
        "Equipment":
            # Equip it (see Equipment section)
            pass
```

---

## 8. Drag & Drop

Godot's built-in drag-and-drop system works well for inventory:

```gdscript
# In InventorySlotUI — add drag support:

func _get_drag_data(_at_position: Vector2) -> Variant:
    var item: ItemInstance = get_parent().get_parent().inventory.get_item_at(slot_index)
    if item == null:
        return null

    # Visual preview while dragging
    var preview := TextureRect.new()
    preview.texture = item.data.icon
    preview.custom_minimum_size = Vector2(48, 48)
    preview.modulate.a = 0.7
    set_drag_preview(preview)

    return {"source_slot": slot_index, "item": item}


func _can_drop_data(_at_position: Vector2, data: Variant) -> bool:
    return data is Dictionary and data.has("source_slot")


func _drop_data(_at_position: Vector2, data: Variant) -> void:
    if not (data is Dictionary):
        return
    var source_slot: int = data["source_slot"]
    var panel: InventoryPanelUI = get_parent().get_parent()
    var inv: Inventory = panel.inventory

    var source_item: ItemInstance = inv.get_item_at(source_slot)
    var target_item: ItemInstance = inv.get_item_at(slot_index)

    if source_slot == slot_index:
        return  # Dropped on self

    # Same item type — try to merge stacks
    if target_item != null and source_item != null and target_item.data == source_item.data:
        if target_item.data.max_stack > 1:
            var space: int = target_item.data.max_stack - target_item.quantity
            var to_move: int = mini(source_item.quantity, space)
            if to_move > 0:
                target_item.quantity += to_move
                source_item.quantity -= to_move
                if source_item.quantity <= 0:
                    inv.slots[source_slot] = null
                inv.item_changed.emit(slot_index, target_item)
                inv.item_changed.emit(source_slot, inv.get_item_at(source_slot))
                return

    # Otherwise swap
    inv.swap_slots(source_slot, slot_index)
```

---

## 9. Equipment & Stats

```gdscript
# equipment_system.gd
class_name EquipmentSystem
extends RefCounted

signal equipment_changed(slot_name: String, old_item: ItemInstance, new_item: ItemInstance)

## Slot name → equipped ItemInstance
var equipped: Dictionary = {}
var _valid_slots: Array[String] = [
    "Head", "Chest", "Legs", "Feet", "Weapon", "Shield", "Ring", "Amulet"
]

func equip(item: ItemInstance) -> ItemInstance:
    """Equip an item, returning the previously equipped item (or null)."""
    if item == null or item.data.equip_slot == "None":
        return null
    var slot_name: String = item.data.equip_slot
    if slot_name not in _valid_slots:
        return null

    var old_item: ItemInstance = equipped.get(slot_name)
    equipped[slot_name] = item
    equipment_changed.emit(slot_name, old_item, item)
    return old_item


func unequip(slot_name: String) -> ItemInstance:
    var item: ItemInstance = equipped.get(slot_name)
    if item != null:
        equipped.erase(slot_name)
        equipment_changed.emit(slot_name, item, null)
    return item


func get_total_stats() -> Dictionary:
    """Aggregate all stat modifiers from equipped items."""
    var totals: Dictionary = {}
    for item: ItemInstance in equipped.values():
        if item == null:
            continue
        for stat: String in item.data.stat_modifiers:
            totals[stat] = totals.get(stat, 0) + item.data.stat_modifiers[stat]
    return totals


func get_stat(stat_name: String) -> int:
    var total: int = 0
    for item: ItemInstance in equipped.values():
        if item != null:
            total += item.data.stat_modifiers.get(stat_name, 0)
    return total
```

---

## 10. Crafting System

### Recipe Resource

```gdscript
# crafting_recipe.gd
class_name CraftingRecipe
extends Resource

@export var id: StringName = &""
@export var display_name: String = ""
@export var description: String = ""

## Inputs: Array of {item_id: StringName, quantity: int}
@export var ingredients: Array[Dictionary] = []

## Outputs: Array of {item_id: StringName, quantity: int}
@export var results: Array[Dictionary] = []

## Optional: required crafting station
@export var required_station: StringName = &""

## Optional: time to craft (0 = instant)
@export var craft_time: float = 0.0

## Optional: required player skill level
@export var required_skill_level: int = 0
```

### Crafting Manager

```gdscript
# crafting_manager.gd
class_name CraftingManager
extends RefCounted

signal craft_started(recipe: CraftingRecipe)
signal craft_completed(recipe: CraftingRecipe)
signal craft_failed(recipe: CraftingRecipe, reason: String)

var _recipes: Array[CraftingRecipe] = []
var item_db: ItemDatabase

func _init(database: ItemDatabase) -> void:
    item_db = database

func register_recipe(recipe: CraftingRecipe) -> void:
    _recipes.append(recipe)

func load_recipes_from_directory(path: String) -> void:
    var dir := DirAccess.open(path)
    if dir == null:
        return
    dir.list_dir_begin()
    var file_name: String = dir.get_next()
    while file_name != "":
        if file_name.ends_with(".tres"):
            var recipe: CraftingRecipe = load(path.path_join(file_name)) as CraftingRecipe
            if recipe:
                _recipes.append(recipe)
        file_name = dir.get_next()
    dir.list_dir_end()


func can_craft(recipe: CraftingRecipe, inventory: Inventory) -> bool:
    for ingredient: Dictionary in recipe.ingredients:
        var item_id: StringName = ingredient["item_id"]
        var qty: int = ingredient["quantity"]
        if not inventory.has_item(item_id, qty):
            return false
    return true


func get_available_recipes(inventory: Inventory, station: StringName = &"") -> Array[CraftingRecipe]:
    var available: Array[CraftingRecipe] = []
    for recipe in _recipes:
        if station != &"" and recipe.required_station != &"" and recipe.required_station != station:
            continue
        if can_craft(recipe, inventory):
            available.append(recipe)
    return available


func get_all_known_recipes(station: StringName = &"") -> Array[CraftingRecipe]:
    """All recipes (regardless of whether player has materials)."""
    if station == &"":
        return _recipes.duplicate()
    return _recipes.filter(
        func(r: CraftingRecipe) -> bool:
            return r.required_station == &"" or r.required_station == station
    )


func craft(recipe: CraftingRecipe, inventory: Inventory) -> bool:
    if not can_craft(recipe, inventory):
        craft_failed.emit(recipe, "Missing ingredients")
        return false

    craft_started.emit(recipe)

    # Consume ingredients
    for ingredient: Dictionary in recipe.ingredients:
        inventory.consume_item(ingredient["item_id"], ingredient["quantity"])

    # Add results
    for result: Dictionary in recipe.results:
        var item_data: ItemData = item_db.get_item(result["item_id"])
        if item_data:
            var overflow: int = inventory.add_item(item_data, result["quantity"])
            if overflow > 0:
                # Items didn't fit — could drop on ground or warn player
                push_warning("Crafting overflow: %d x %s couldn't fit" % [overflow, result["item_id"]])

    craft_completed.emit(recipe)
    return true
```

---

## 11. Loot Tables

```gdscript
# loot_table.gd
class_name LootTable
extends Resource

@export var entries: Array[Dictionary] = []
# Each entry: {item_id: StringName, weight: float, min_qty: int, max_qty: int}

@export var guaranteed_drops: Array[Dictionary] = []
# Always drop these: {item_id: StringName, quantity: int}

@export var roll_count: int = 1
# How many times to roll the weighted table

func roll() -> Array[Dictionary]:
    """Returns array of {item_id, quantity} results."""
    var results: Array[Dictionary] = []

    # Guaranteed drops
    for drop: Dictionary in guaranteed_drops:
        results.append(drop.duplicate())

    # Weighted random rolls
    var total_weight: float = 0.0
    for entry: Dictionary in entries:
        total_weight += entry.get("weight", 1.0)

    for _roll in roll_count:
        var r: float = randf() * total_weight
        var cumulative: float = 0.0
        for entry: Dictionary in entries:
            cumulative += entry.get("weight", 1.0)
            if r <= cumulative:
                var qty: int = randi_range(
                    entry.get("min_qty", 1),
                    entry.get("max_qty", 1)
                )
                results.append({
                    "item_id": entry["item_id"],
                    "quantity": qty
                })
                break

    return results
```

---

## 12. Save/Load Integration

```gdscript
# Extend Inventory with serialization (compatible with G11 save/load patterns):

func serialize() -> Dictionary:
    var slot_data: Array[Dictionary] = []
    for item in slots:
        if item != null:
            slot_data.append(item.serialize())
        else:
            slot_data.append({})
    return {
        "capacity": capacity,
        "slots": slot_data
    }

static func deserialize(data: Dictionary, item_db: ItemDatabase) -> Inventory:
    var inv := Inventory.new(data.get("capacity", 20))
    var slot_data: Array = data.get("slots", [])
    for i in slot_data.size():
        if i >= inv.slots.size():
            break
        var entry: Dictionary = slot_data[i]
        if entry.is_empty() or not entry.has("id"):
            continue
        inv.slots[i] = ItemInstance.deserialize(entry, item_db)
        if inv.slots[i] != null:
            inv.item_added.emit(i, inv.slots[i])
    return inv
```

### Integration with G11 Save System

```gdscript
# In your save manager:
func save_game() -> void:
    var save_data: Dictionary = {
        "player_inventory": player.inventory.serialize(),
        "player_equipment": _serialize_equipment(player.equipment),
        # ... other save data
    }
    # Write to file per G11 patterns

func load_game(save_data: Dictionary) -> void:
    player.inventory = Inventory.deserialize(
        save_data["player_inventory"], ItemDB
    )
```

---

## 13. Performance at Scale

| Scenario | Concern | Solution |
|----------|---------|----------|
| 100+ items, UI open | Rebuilding all slot UIs every change | Only update the changed slot (signal provides `slot_index`) |
| Searching inventory frequently | Linear scan per `has_item()` call | Add a `_count_cache: Dictionary` (id → total qty), update on add/remove |
| Multiplayer inventory sync | Sending full inventory each change | Send deltas: `{action: "add", slot: 5, item_id: "sword", qty: 1}` |
| 1000+ item definitions loaded | Memory for all Resources | Lazy-load: only load Resources when first referenced |
| Grid inventory with large items | `can_place` checks every cell | Pre-compute occupied cell set, check intersection instead of iterating grid |

---

## 14. Common Mistakes

| Mistake | Fix |
|---------|-----|
| Putting UI logic in the Inventory class | Keep `Inventory` as pure data + signals. UI observes via signals |
| Modifying `ItemData` resources at runtime | Resources are shared. Changing `item_data.weight` changes it for ALL instances. Use `instance_properties` for mutable state |
| Not handling stack overflow on add | `add_item()` must return overflow count. Caller decides: drop on ground, reject, or show warning |
| Comparing items by reference | Two `ItemData` resources with the same `id` may be different objects. Compare by `id`, not `==` on the Resource |
| Forgetting to save `instance_properties` | Serialize the whole `ItemInstance`, not just the `ItemData` id + quantity |
| Using `get_children()` to find inventory UI slots | Store slot references in an array during `_rebuild_slots()`. `get_children()` is slow and order-sensitive |
| Not emitting signals on deserialization | After loading, emit `item_added` for each non-null slot so UI can initialize |

---

## Further Reading

- [G19 — Custom Resources & Plugins](./G19_custom_resources_and_plugins.md) — deep dive on Resource patterns
- [G11 — Save/Load Systems](./G11_save_load_systems.md) — serialization strategies
- [G9 — UI & Control Systems](./G9_ui_control_systems.md) — Control node patterns
- [G3 — Signal Architecture](./G3_signal_architecture.md) — signal best practices
- [Godot 4.4 Resources Tutorial](https://docs.godotengine.org/en/4.4/tutorials/scripting/resources.html)
