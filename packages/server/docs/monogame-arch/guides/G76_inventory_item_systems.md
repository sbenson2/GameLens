# G76 — Inventory & Item Systems

> **Category:** Guide · **Engine:** MonoGame · **Related:** [G64 Combat & Damage Systems](./G64_combat_damage_systems.md) · [G65 Economy & Shop Systems](./G65_economy_shop_systems.md) · [G69 Save/Load Serialization](./G69_save_load_serialization.md) · [G62 Narrative Systems](./G62_narrative_systems.md) · [G5 UI Framework](./G5_ui_framework.md)

Inventory systems are a core gameplay feature in RPGs, survival games, looters, and many other genres. This guide covers data-driven item definitions, slot-based inventory containers with stacking, equipment systems, and how to integrate inventory with the Arch ECS architecture used throughout this documentation set. The focus is on flexible, serialization-friendly designs that work with the save/load patterns from G69.

---

## Table of Contents

1. [Architecture Overview](#1--architecture-overview)
2. [Item Definition Database](#2--item-definition-database)
3. [Item Instance vs Definition](#3--item-instance-vs-definition)
4. [Slot-Based Inventory Container](#4--slot-based-inventory-container)
5. [Item Stacking](#5--item-stacking)
6. [Equipment Slots](#6--equipment-slots)
7. [ECS Integration with Arch](#7--ecs-integration-with-arch)
8. [Inventory UI Patterns](#8--inventory-ui-patterns)
9. [Drag-and-Drop & Slot Swapping](#9--drag-and-drop--slot-swapping)
10. [Persistence & Serialization](#10--persistence--serialization)
11. [Loot Tables & Item Generation](#11--loot-tables--item-generation)
12. [Common Pitfalls](#12--common-pitfalls)

---

## 1 — Architecture Overview

A well-structured inventory separates three concerns:

- **Item definitions** — static, read-only templates loaded from data files (JSON, YAML, or embedded resources). These describe *what* an item is: name, icon, max stack size, category, base stats.
- **Item instances** — runtime objects that reference a definition but carry instance-specific state: current stack count, durability, enchantments, unique ID.
- **Inventory containers** — slot arrays that hold item instances, enforce capacity limits, and provide add/remove/transfer operations.

```
┌─────────────────┐     ┌──────────────────┐     ┌────────────────┐
│  ItemDatabase    │────▶│  ItemDefinition   │◀────│  ItemInstance   │
│  (singleton)     │     │  (read-only)      │     │  (runtime)      │
└─────────────────┘     └──────────────────┘     └────────────────┘
                                                         │
                                                         ▼
                                                  ┌────────────────┐
                                                  │  InventorySlot  │
                                                  │  (container)    │
                                                  └────────────────┘
```

## 2 — Item Definition Database

Item definitions are the source of truth for all item properties. Load them once at startup and reference by ID.

```csharp
public enum ItemCategory
{
    Consumable,
    Equipment,
    Material,
    Quest,
    Currency
}

public enum EquipSlotType
{
    None,
    Head,
    Chest,
    Legs,
    Feet,
    MainHand,
    OffHand,
    Accessory
}

/// <summary>
/// Read-only item template. Loaded from data files, never modified at runtime.
/// </summary>
public sealed class ItemDefinition
{
    public string Id { get; init; } = string.Empty;
    public string Name { get; init; } = string.Empty;
    public string Description { get; init; } = string.Empty;
    public string IconAsset { get; init; } = string.Empty;
    public ItemCategory Category { get; init; }
    public EquipSlotType EquipSlot { get; init; } = EquipSlotType.None;
    public int MaxStackSize { get; init; } = 1;
    public bool IsConsumable { get; init; }
    public float Weight { get; init; }
    public int BaseValue { get; init; }

    // Stat modifiers when equipped (flat values — multiply in your stat system)
    public Dictionary<string, float> StatModifiers { get; init; } = new();
}
```

### Loading from JSON

```csharp
public sealed class ItemDatabase
{
    private readonly Dictionary<string, ItemDefinition> _items = new();

    public void LoadFromJson(string jsonContent)
    {
        var definitions = JsonSerializer.Deserialize<List<ItemDefinition>>(jsonContent,
            new JsonSerializerOptions { PropertyNameCaseInsensitive = true });

        foreach (var def in definitions ?? Enumerable.Empty<ItemDefinition>())
        {
            if (string.IsNullOrEmpty(def.Id))
                throw new InvalidDataException("Item definition missing Id field");

            _items[def.Id] = def;
        }
    }

    public ItemDefinition Get(string id)
    {
        if (_items.TryGetValue(id, out var def))
            return def;

        throw new KeyNotFoundException($"No item definition with id '{id}'");
    }

    public bool TryGet(string id, out ItemDefinition? definition)
        => _items.TryGetValue(id, out definition);

    public IEnumerable<ItemDefinition> GetByCategory(ItemCategory category)
        => _items.Values.Where(d => d.Category == category);
}
```

### Example JSON data file

```json
[
  {
    "id": "health_potion",
    "name": "Health Potion",
    "description": "Restores 50 HP.",
    "iconAsset": "items/health_potion",
    "category": "Consumable",
    "maxStackSize": 20,
    "isConsumable": true,
    "weight": 0.5,
    "baseValue": 25
  },
  {
    "id": "iron_sword",
    "name": "Iron Sword",
    "description": "A sturdy blade.",
    "iconAsset": "items/iron_sword",
    "category": "Equipment",
    "equipSlot": "MainHand",
    "maxStackSize": 1,
    "weight": 3.0,
    "baseValue": 120,
    "statModifiers": { "attack": 15, "speed": -1 }
  }
]
```

## 3 — Item Instance vs Definition

Definitions are shared templates. Instances carry runtime state and reference their definition by ID, which keeps serialization compact.

```csharp
/// <summary>
/// A runtime item. References a definition by ID and carries instance-specific state.
/// </summary>
public sealed class ItemInstance
{
    public Guid UniqueId { get; init; } = Guid.NewGuid();
    public string DefinitionId { get; init; } = string.Empty;
    public int StackCount { get; set; } = 1;
    public int Durability { get; set; } = -1; // -1 = indestructible

    // Optional: per-instance modifiers (enchantments, random rolls)
    public Dictionary<string, float> BonusModifiers { get; init; } = new();

    /// <summary>
    /// Resolve the definition from the database. Cache the result per frame if needed.
    /// </summary>
    public ItemDefinition GetDefinition(ItemDatabase db) => db.Get(DefinitionId);
}
```

**Why separate?** A player might carry 200 iron ore. Instead of 200 full objects, you have one `ItemInstance` with `StackCount = 200` pointing to a single `ItemDefinition`. Serialization writes only `{ "definitionId": "iron_ore", "stackCount": 200 }`.

## 4 — Slot-Based Inventory Container

The inventory is an array of nullable slots. Each slot holds at most one `ItemInstance` (which may represent a stack).

```csharp
public sealed class Inventory
{
    private readonly ItemInstance?[] _slots;
    private readonly ItemDatabase _db;

    public int Capacity => _slots.Length;

    public Inventory(int capacity, ItemDatabase db)
    {
        _slots = new ItemInstance?[capacity];
        _db = db;
    }

    public ItemInstance? GetSlot(int index) => _slots[index];

    /// <summary>
    /// Attempts to add an item to the inventory. Returns the leftover count
    /// that could not fit (0 = everything added successfully).
    /// </summary>
    public int TryAdd(string definitionId, int count = 1)
    {
        var def = _db.Get(definitionId);
        int remaining = count;

        // Phase 1: fill existing stacks of the same item
        for (int i = 0; i < _slots.Length && remaining > 0; i++)
        {
            var slot = _slots[i];
            if (slot == null || slot.DefinitionId != definitionId) continue;

            int spaceInSlot = def.MaxStackSize - slot.StackCount;
            if (spaceInSlot <= 0) continue;

            int toAdd = Math.Min(remaining, spaceInSlot);
            slot.StackCount += toAdd;
            remaining -= toAdd;
        }

        // Phase 2: place in empty slots
        for (int i = 0; i < _slots.Length && remaining > 0; i++)
        {
            if (_slots[i] != null) continue;

            int toAdd = Math.Min(remaining, def.MaxStackSize);
            _slots[i] = new ItemInstance
            {
                DefinitionId = definitionId,
                StackCount = toAdd
            };
            remaining -= toAdd;
        }

        return remaining; // 0 means fully added
    }

    /// <summary>
    /// Removes up to 'count' items of the given definition. Returns actual removed count.
    /// </summary>
    public int Remove(string definitionId, int count = 1)
    {
        int toRemove = count;

        for (int i = _slots.Length - 1; i >= 0 && toRemove > 0; i--)
        {
            var slot = _slots[i];
            if (slot == null || slot.DefinitionId != definitionId) continue;

            int removed = Math.Min(toRemove, slot.StackCount);
            slot.StackCount -= removed;
            toRemove -= removed;

            if (slot.StackCount <= 0)
                _slots[i] = null;
        }

        return count - toRemove;
    }

    /// <summary>
    /// Total count of a specific item across all slots.
    /// </summary>
    public int CountOf(string definitionId)
    {
        int total = 0;
        foreach (var slot in _slots)
        {
            if (slot?.DefinitionId == definitionId)
                total += slot.StackCount;
        }
        return total;
    }

    public bool HasSpace(string definitionId, int count = 1)
    {
        var def = _db.Get(definitionId);
        int available = 0;

        foreach (var slot in _slots)
        {
            if (slot == null)
                available += def.MaxStackSize;
            else if (slot.DefinitionId == definitionId)
                available += def.MaxStackSize - slot.StackCount;

            if (available >= count) return true;
        }

        return available >= count;
    }
}
```

## 5 — Item Stacking

Stacking rules are driven by `ItemDefinition.MaxStackSize`:

- `MaxStackSize = 1` — unique items (equipment, quest items). Each occupies its own slot.
- `MaxStackSize > 1` — stackable items (potions, materials, ammo). Multiple units share one slot up to the cap.

### Splitting Stacks

```csharp
/// <summary>
/// Split a stack in the given slot, moving 'splitCount' items to 'targetSlot'.
/// Returns false if the operation is invalid.
/// </summary>
public bool SplitStack(int sourceSlot, int targetSlot, int splitCount)
{
    var source = _slots[sourceSlot];
    if (source == null || splitCount <= 0 || splitCount >= source.StackCount)
        return false;

    if (_slots[targetSlot] != null)
        return false; // Target must be empty for a split

    _slots[targetSlot] = new ItemInstance
    {
        DefinitionId = source.DefinitionId,
        StackCount = splitCount
    };
    source.StackCount -= splitCount;
    return true;
}
```

### Merging Stacks

```csharp
/// <summary>
/// Merge source slot into target slot (same item type). Overflow stays in source.
/// </summary>
public bool MergeStacks(int sourceSlot, int targetSlot)
{
    var source = _slots[sourceSlot];
    var target = _slots[targetSlot];
    if (source == null || target == null) return false;
    if (source.DefinitionId != target.DefinitionId) return false;

    var def = _db.Get(source.DefinitionId);
    int space = def.MaxStackSize - target.StackCount;
    int transfer = Math.Min(space, source.StackCount);

    target.StackCount += transfer;
    source.StackCount -= transfer;

    if (source.StackCount <= 0)
        _slots[sourceSlot] = null;

    return true;
}
```

## 6 — Equipment Slots

Equipment is a specialized inventory where slots are keyed by body part rather than integer index.

```csharp
public sealed class EquipmentLoadout
{
    private readonly Dictionary<EquipSlotType, ItemInstance?> _equipped = new();
    private readonly ItemDatabase _db;

    public EquipmentLoadout(ItemDatabase db)
    {
        _db = db;
        // Initialize all slots as empty
        foreach (EquipSlotType slot in Enum.GetValues<EquipSlotType>())
        {
            if (slot != EquipSlotType.None)
                _equipped[slot] = null;
        }
    }

    /// <summary>
    /// Equip an item, returning the previously equipped item (or null).
    /// </summary>
    public ItemInstance? Equip(ItemInstance item)
    {
        var def = item.GetDefinition(_db);
        if (def.EquipSlot == EquipSlotType.None)
            throw new InvalidOperationException($"Item '{def.Id}' is not equippable");

        var previous = _equipped[def.EquipSlot];
        _equipped[def.EquipSlot] = item;
        return previous; // Caller puts this back in inventory
    }

    public ItemInstance? Unequip(EquipSlotType slot)
    {
        var previous = _equipped[slot];
        _equipped[slot] = null;
        return previous;
    }

    /// <summary>
    /// Aggregate all stat modifiers from equipped items.
    /// </summary>
    public Dictionary<string, float> GetTotalStatModifiers()
    {
        var totals = new Dictionary<string, float>();

        foreach (var item in _equipped.Values)
        {
            if (item == null) continue;
            var def = item.GetDefinition(_db);

            foreach (var (stat, value) in def.StatModifiers)
            {
                totals.TryGetValue(stat, out float current);
                totals[stat] = current + value;
            }

            // Also add per-instance bonus modifiers (enchantments)
            foreach (var (stat, value) in item.BonusModifiers)
            {
                totals.TryGetValue(stat, out float current);
                totals[stat] = current + value;
            }
        }

        return totals;
    }
}
```

## 7 — ECS Integration with Arch

When using the Arch ECS (common in MonoGame projects), inventory becomes a component on the entity.

```csharp
// Components — pure data structs
public struct InventoryComponent
{
    public Inventory Bag;
    public EquipmentLoadout Equipment;
}

public struct LootableComponent
{
    public Inventory Contents;
    public bool HasBeenLooted;
}

// Systems — stateless logic
public class InventoryPickupSystem
{
    private readonly QueryDescription _playerQuery = new QueryDescription()
        .WithAll<InventoryComponent, PositionComponent>();

    private readonly QueryDescription _lootQuery = new QueryDescription()
        .WithAll<LootableComponent, PositionComponent>();

    private readonly float _pickupRadius = 32f;

    public void Update(World world, bool pickupPressed)
    {
        if (!pickupPressed) return;

        world.Query(in _playerQuery, (ref InventoryComponent inv, ref PositionComponent playerPos) =>
        {
            world.Query(in _lootQuery, (Entity lootEntity, ref LootableComponent loot, ref PositionComponent lootPos) =>
            {
                if (loot.HasBeenLooted) return;
                if (Vector2.Distance(playerPos.Position, lootPos.Position) > _pickupRadius) return;

                // Transfer all items from loot container to player inventory
                for (int i = 0; i < loot.Contents.Capacity; i++)
                {
                    var item = loot.Contents.GetSlot(i);
                    if (item == null) continue;

                    int leftover = inv.Bag.TryAdd(item.DefinitionId, item.StackCount);
                    if (leftover > 0)
                    {
                        // Inventory full — leave remainder
                        item.StackCount = leftover;
                        return;
                    }
                }

                loot.HasBeenLooted = true;
            });
        });
    }
}
```

## 8 — Inventory UI Patterns

The UI layer reads inventory state but does not modify it directly. All mutations go through `Inventory` methods, keeping the model as the single source of truth.

```csharp
/// <summary>
/// Renders the inventory grid. Does NOT own or mutate inventory state.
/// Raises events that the game handles (e.g., UseItem, SwapSlots).
/// </summary>
public class InventoryRenderer
{
    private readonly Inventory _inventory;
    private readonly ItemDatabase _db;
    private readonly Texture2D _slotBackground;
    private readonly SpriteFont _font;
    private readonly int _columns;
    private readonly int _slotSize;
    private readonly Vector2 _origin;

    public InventoryRenderer(Inventory inventory, ItemDatabase db,
        Texture2D slotBg, SpriteFont font,
        Vector2 origin, int columns = 8, int slotSize = 48)
    {
        _inventory = inventory;
        _db = db;
        _slotBackground = slotBg;
        _font = font;
        _origin = origin;
        _columns = columns;
        _slotSize = slotSize;
    }

    public void Draw(SpriteBatch sb)
    {
        for (int i = 0; i < _inventory.Capacity; i++)
        {
            int col = i % _columns;
            int row = i / _columns;
            var pos = _origin + new Vector2(col * _slotSize, row * _slotSize);

            // Draw slot background
            sb.Draw(_slotBackground, pos, Color.White);

            var item = _inventory.GetSlot(i);
            if (item == null) continue;

            var def = item.GetDefinition(_db);

            // Draw item icon (assumes icon loaded as Texture2D keyed by def.IconAsset)
            // iconTexture = contentManager.Load<Texture2D>(def.IconAsset);
            // sb.Draw(iconTexture, pos, Color.White);

            // Draw stack count in bottom-right if stackable
            if (item.StackCount > 1)
            {
                var countText = item.StackCount.ToString();
                var textPos = pos + new Vector2(_slotSize - _font.MeasureString(countText).X - 2, _slotSize - 16);
                sb.DrawString(_font, countText, textPos, Color.White);
            }
        }
    }

    /// <summary>
    /// Returns which slot index the mouse is hovering over, or -1 if none.
    /// </summary>
    public int GetHoveredSlot(Point mousePosition)
    {
        var relative = mousePosition.ToVector2() - _origin;
        if (relative.X < 0 || relative.Y < 0) return -1;

        int col = (int)(relative.X / _slotSize);
        int row = (int)(relative.Y / _slotSize);
        if (col >= _columns) return -1;

        int index = row * _columns + col;
        return index < _inventory.Capacity ? index : -1;
    }
}
```

## 9 — Drag-and-Drop & Slot Swapping

```csharp
public sealed class InventoryInteraction
{
    private int _dragSourceSlot = -1;
    private readonly Inventory _inventory;

    public InventoryInteraction(Inventory inventory)
    {
        _inventory = inventory;
    }

    public void OnSlotPressed(int slotIndex)
    {
        if (_inventory.GetSlot(slotIndex) != null)
            _dragSourceSlot = slotIndex;
    }

    public void OnSlotReleased(int targetSlot)
    {
        if (_dragSourceSlot < 0 || _dragSourceSlot == targetSlot)
        {
            _dragSourceSlot = -1;
            return;
        }

        var source = _inventory.GetSlot(_dragSourceSlot);
        var target = _inventory.GetSlot(targetSlot);

        if (source != null && target != null &&
            source.DefinitionId == target.DefinitionId)
        {
            // Same item type — try to merge stacks
            _inventory.MergeStacks(_dragSourceSlot, targetSlot);
        }
        else
        {
            // Different items or empty target — swap slots
            _inventory.SwapSlots(_dragSourceSlot, targetSlot);
        }

        _dragSourceSlot = -1;
    }
}
```

Add `SwapSlots` to the `Inventory` class:

```csharp
public void SwapSlots(int a, int b)
{
    (_slots[a], _slots[b]) = (_slots[b], _slots[a]);
}
```

## 10 — Persistence & Serialization

Keep serialization lean by storing only instance data. Definitions are reloaded from the database on load.

```csharp
public sealed class InventorySaveData
{
    public List<SlotSaveData?> Slots { get; init; } = new();

    public sealed class SlotSaveData
    {
        public string DefinitionId { get; init; } = string.Empty;
        public int StackCount { get; init; }
        public int Durability { get; init; }
        public Dictionary<string, float>? BonusModifiers { get; init; }
    }
}

// Extension methods for save/load
public static class InventoryPersistence
{
    public static InventorySaveData ToSaveData(this Inventory inventory)
    {
        var data = new InventorySaveData();
        for (int i = 0; i < inventory.Capacity; i++)
        {
            var item = inventory.GetSlot(i);
            data.Slots.Add(item == null ? null : new InventorySaveData.SlotSaveData
            {
                DefinitionId = item.DefinitionId,
                StackCount = item.StackCount,
                Durability = item.Durability,
                BonusModifiers = item.BonusModifiers.Count > 0 ? item.BonusModifiers : null
            });
        }
        return data;
    }

    public static void LoadFromSaveData(this Inventory inventory, InventorySaveData data)
    {
        for (int i = 0; i < Math.Min(data.Slots.Count, inventory.Capacity); i++)
        {
            var slot = data.Slots[i];
            if (slot == null) continue;

            // Use direct slot assignment (add a SetSlot method to Inventory)
            inventory.SetSlot(i, new ItemInstance
            {
                DefinitionId = slot.DefinitionId,
                StackCount = slot.StackCount,
                Durability = slot.Durability,
                BonusModifiers = slot.BonusModifiers ?? new()
            });
        }
    }
}
```

## 11 — Loot Tables & Item Generation

A weighted loot table for procedural item drops. Integrates with the economy system from G65.

```csharp
public sealed class LootEntry
{
    public string ItemId { get; init; } = string.Empty;
    public int MinCount { get; init; } = 1;
    public int MaxCount { get; init; } = 1;
    public float Weight { get; init; } = 1.0f;
}

public sealed class LootTable
{
    public List<LootEntry> Entries { get; init; } = new();
    public int MinDrops { get; init; } = 1;
    public int MaxDrops { get; init; } = 3;

    public List<(string itemId, int count)> Roll(Random rng)
    {
        var results = new List<(string, int)>();
        int dropCount = rng.Next(MinDrops, MaxDrops + 1);
        float totalWeight = Entries.Sum(e => e.Weight);

        for (int d = 0; d < dropCount; d++)
        {
            float roll = (float)(rng.NextDouble() * totalWeight);
            float cumulative = 0;

            foreach (var entry in Entries)
            {
                cumulative += entry.Weight;
                if (roll <= cumulative)
                {
                    int count = rng.Next(entry.MinCount, entry.MaxCount + 1);
                    results.Add((entry.ItemId, count));
                    break;
                }
            }
        }

        return results;
    }
}
```

## 12 — Common Pitfalls

**Mutating definitions at runtime.** Item definitions should be immutable (`init` properties). If you need per-instance variation, put it on `ItemInstance.BonusModifiers`, not on the shared definition.

**Serializing Texture2D references.** Never put textures or other GPU resources into your item data. Store asset paths as strings and resolve them through `ContentManager` at load time.

**Forgetting overflow on add.** Always check the return value of `TryAdd`. If the inventory is full, you need to handle the overflow — drop on ground, reject the pickup, or notify the player.

**Stack corruption on transfer between containers.** When moving items between two inventories (player → chest), remove from source first, attempt add to target, and re-add to source if the target is full. Never leave items in both containers simultaneously.

**No unique IDs on instances.** If you need to track specific items (quest objectives, trading history), assign a `Guid` to each instance. Stack-only items can share an ID per stack, but equipment should always have unique IDs.
