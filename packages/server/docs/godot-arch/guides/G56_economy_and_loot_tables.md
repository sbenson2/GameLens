# G56 — Economy & Loot Table Systems

> **Category:** Guide · **Engine:** Godot 4.4+ · **Language:** GDScript / C#
> **Related:** [G32 Inventory & Crafting Systems](./G32_inventory_and_crafting_systems.md) · [G53 Data-Driven Design](./G53_data_driven_design.md) · [G19 Custom Resources & Plugins](./G19_custom_resources_and_plugins.md) · [G3 Signal Architecture](./G3_signal_architecture.md) · [G11 Save/Load Systems](./G11_save_load_systems.md)

---

## What This Guide Covers

Every game with items, rewards, or currency needs an economy — a system that controls how value enters the game (faucets), how it leaves (sinks), and how items are distributed to players. Loot tables are the mechanism that turns "enemy dies" or "chest opens" into specific items with controlled probabilities.

This guide covers building a CurrencyManager with multi-currency support, weighted loot tables using custom Resources, rarity tiers and pity systems, shop systems with buy/sell pricing, economy sinks and inflation control, drop table composition (nested/chained tables), save/load integration, and designer-friendly workflows for balancing.

**Use this guide when:** your game has any form of currency, item drops, shops, rewards, gacha mechanics, or resource gathering. The patterns here scale from a simple coin-and-shop system to a full RPG economy with multiple currencies and complex drop tables.

---

## Table of Contents

1. [Architecture Overview](#1-architecture-overview)
2. [CurrencyManager](#2-currencymanager)
3. [Loot Table Design](#3-loot-table-design)
4. [Weighted Random Selection](#4-weighted-random-selection)
5. [Rarity Tiers and Pity Systems](#5-rarity-tiers-and-pity-systems)
6. [Nested and Chained Tables](#6-nested-and-chained-tables)
7. [Shop Systems](#7-shop-systems)
8. [Economy Balance — Faucets and Sinks](#8-economy-balance--faucets-and-sinks)
9. [Save/Load Integration](#9-saveload-integration)
10. [C# Examples](#10-c-examples)
11. [Designer Workflow](#11-designer-workflow)

---

## 1. Architecture Overview

```
CurrencyManager (AutoLoad)
├── Wallet: Dictionary[StringName, int]
├── Signals: currency_changed, transaction_completed
├── Methods: add, spend, can_afford, transfer
│
LootTableRegistry (AutoLoad)
├── Tables loaded from Resources at startup
├── roll(table_id) → Array[ItemDrop]
│
ShopManager
├── References LootTableRegistry for stock
├── CurrencyManager for transactions
├── Buy/sell price calculations
│
Economy listeners
├── Enemy death → LootTableRegistry.roll()
├── Quest reward → CurrencyManager.add()
├── Repair/crafting → CurrencyManager.spend()
```

---

## 2. CurrencyManager

```gdscript
## autoload: CurrencyManager
extends Node

signal currency_changed(currency: StringName, old_amount: int, new_amount: int)
signal transaction_completed(currency: StringName, amount: int, reason: StringName)

## Main wallet — supports multiple currency types
var _wallet: Dictionary[StringName, int] = {}


func _ready() -> void:
	# Initialize default currencies
	_wallet[&"gold"] = 0
	_wallet[&"gems"] = 0


## Get current balance for a currency
func get_balance(currency: StringName) -> int:
	return _wallet.get(currency, 0)


## Add currency (faucet). Returns new balance.
func add(currency: StringName, amount: int, reason: StringName = &"unknown") -> int:
	assert(amount >= 0, "Use spend() for removing currency")
	var old := get_balance(currency)
	_wallet[currency] = old + amount
	currency_changed.emit(currency, old, _wallet[currency])
	transaction_completed.emit(currency, amount, reason)
	return _wallet[currency]


## Remove currency (sink). Returns true if successful.
func spend(currency: StringName, amount: int, reason: StringName = &"unknown") -> bool:
	assert(amount >= 0, "Use add() for adding currency")
	if not can_afford(currency, amount):
		return false
	var old := get_balance(currency)
	_wallet[currency] = old - amount
	currency_changed.emit(currency, old, _wallet[currency])
	transaction_completed.emit(currency, -amount, reason)
	return true


## Check if player can afford a cost
func can_afford(currency: StringName, amount: int) -> bool:
	return get_balance(currency) >= amount


## Atomic multi-currency transaction (all-or-nothing)
func spend_multi(costs: Dictionary[StringName, int], reason: StringName = &"purchase") -> bool:
	# Check all costs first
	for curr: StringName in costs:
		if not can_afford(curr, costs[curr]):
			return false
	# Deduct all
	for curr: StringName in costs:
		spend(curr, costs[curr], reason)
	return true


## For save/load
func get_save_data() -> Dictionary:
	return _wallet.duplicate()


func load_save_data(data: Dictionary) -> void:
	for key: StringName in data:
		_wallet[key] = data[key]
```

### Why `int` instead of `float`?

Floating-point math causes rounding errors that accumulate over time. An economy running on floats will eventually show `99.99999` gold instead of `100`. Use integers for all currency amounts. If you need fractional values (e.g., 2.5× multiplier), apply the multiplier then round, keeping storage as int. For very large economies, Godot's int is 64-bit, supporting values up to 9.2 quintillion.

---

## 3. Loot Table Design

A loot table is a list of possible drops, each with a weight that determines relative probability. Model them as Resources for editor-friendly workflows.

### LootEntry Resource

```gdscript
class_name LootEntry
extends Resource

@export var item_id: StringName = &""
@export var weight: float = 1.0  ## Relative probability (not a percentage)
@export var min_quantity: int = 1
@export var max_quantity: int = 1
@export var rarity: StringName = &"common"

## Optional: conditions for this entry to be eligible
@export var min_player_level: int = 0
@export var required_flag: StringName = &""  ## e.g., &"boss_defeated"
```

### LootTable Resource

```gdscript
class_name LootTable
extends Resource

@export var table_id: StringName = &""
@export var entries: Array[LootEntry] = []
@export var guaranteed_drops: Array[LootEntry] = []  ## Always drop these
@export var roll_count: int = 1  ## How many times to roll this table
@export var allow_duplicates: bool = true

## Optional nested tables
@export var sub_tables: Array[LootTable] = []
```

---

## 4. Weighted Random Selection

The core algorithm: sum all eligible weights, pick a random point in that range, walk the list until the running total exceeds the pick.

```gdscript
class_name LootRoller
extends RefCounted

## Roll a loot table and return an array of dropped items
static func roll(table: LootTable, context: Dictionary = {}) -> Array[Dictionary]:
	var drops: Array[Dictionary] = []

	# Guaranteed drops first
	for entry: LootEntry in table.guaranteed_drops:
		if _is_eligible(entry, context):
			drops.append(_make_drop(entry))

	# Weighted rolls
	var eligible := _get_eligible_entries(table.entries, context)
	for i: int in table.roll_count:
		var picked := _weighted_pick(eligible)
		if picked:
			drops.append(_make_drop(picked))
			if not table.allow_duplicates:
				eligible.erase(picked)

	# Recurse into sub-tables
	for sub: LootTable in table.sub_tables:
		drops.append_array(roll(sub, context))

	return drops


static func _weighted_pick(entries: Array[LootEntry]) -> LootEntry:
	if entries.is_empty():
		return null

	var total_weight: float = 0.0
	for entry: LootEntry in entries:
		total_weight += entry.weight

	var roll_value: float = randf() * total_weight
	var running: float = 0.0
	for entry: LootEntry in entries:
		running += entry.weight
		if roll_value <= running:
			return entry

	return entries[-1]  # Fallback (floating-point edge case)


static func _is_eligible(entry: LootEntry, context: Dictionary) -> bool:
	if entry.min_player_level > 0:
		var player_level: int = context.get("player_level", 1)
		if player_level < entry.min_player_level:
			return false
	if entry.required_flag != &"":
		var flags: Array = context.get("flags", [])
		if entry.required_flag not in flags:
			return false
	return true


static func _get_eligible_entries(entries: Array[LootEntry], context: Dictionary) -> Array[LootEntry]:
	var result: Array[LootEntry] = []
	for entry: LootEntry in entries:
		if _is_eligible(entry, context):
			result.append(entry)
	return result


static func _make_drop(entry: LootEntry) -> Dictionary:
	return {
		"item_id": entry.item_id,
		"quantity": randi_range(entry.min_quantity, entry.max_quantity),
		"rarity": entry.rarity,
	}
```

### How Weights Work

Weights are **relative**, not percentages. If you have three entries with weights 10, 5, and 5, their probabilities are 50%, 25%, and 25% (10/20, 5/20, 5/20). This makes balancing intuitive — doubling a weight doubles its relative chance.

| Entry | Weight | Probability |
|---|---|---|
| Iron Sword | 10 | 50% |
| Health Potion | 5 | 25% |
| Rare Gem | 5 | 25% |

---

## 5. Rarity Tiers and Pity Systems

### Rarity Tier Resource

```gdscript
class_name RarityTier
extends Resource

@export var tier_name: StringName = &"common"
@export var base_weight: float = 100.0
@export var color: Color = Color.WHITE  ## For UI display
@export var particle_effect: PackedScene  ## Drop VFX

## Standard tiers (example weights)
## Common: 100, Uncommon: 40, Rare: 15, Epic: 5, Legendary: 1
```

### Pity System

A pity system guarantees rare drops after a streak of bad luck. Track consecutive rolls without a rare drop and boost the weight progressively.

```gdscript
class_name PityTracker
extends RefCounted

## Pity thresholds: after N rolls without this rarity, guarantee it
var _counters: Dictionary[StringName, int] = {}  ## rarity → rolls_since_last

const PITY_THRESHOLDS: Dictionary[StringName, int] = {
	&"rare": 20,
	&"epic": 50,
	&"legendary": 100,
}

const PITY_WEIGHT_BOOST: float = 1000.0  ## Overwhelm other weights


func record_drop(rarity: StringName) -> void:
	# Reset counter for this rarity and all lower rarities
	_counters[rarity] = 0


func record_miss(rarity: StringName) -> void:
	_counters[rarity] = _counters.get(rarity, 0) + 1


func get_weight_modifier(rarity: StringName) -> float:
	var count: int = _counters.get(rarity, 0)
	var threshold: int = PITY_THRESHOLDS.get(rarity, 999)
	if count >= threshold:
		return PITY_WEIGHT_BOOST
	# Soft pity: gradually increase after 75% of threshold
	var soft_start := int(threshold * 0.75)
	if count >= soft_start:
		var progress := float(count - soft_start) / float(threshold - soft_start)
		return 1.0 + progress * 10.0  # Up to 11× boost
	return 1.0
```

---

## 6. Nested and Chained Tables

Complex loot systems compose tables rather than putting everything in one flat list.

### Pattern: Tiered Table Composition

```
Boss Loot Table (roll_count: 3)
├── guaranteed_drops: [XP Orb ×100]
├── entries:
│   ├── Gold Pouch (weight: 20)
│   └── Health Flask (weight: 15)
├── sub_tables:
│   ├── Equipment Table (roll_count: 1)
│   │   ├── Iron Armor (weight: 10)
│   │   ├── Steel Sword (weight: 8)
│   │   └── Enchanted Ring (weight: 2)
│   └── Rare Bonus Table (roll_count: 1)
│       ├── Legendary Scroll (weight: 1)
│       └── Nothing (weight: 19)  ## 95% chance of no bonus
```

The "Nothing" entry is a deliberate pattern — it controls the probability of getting anything from that sub-table at all.

### Conditional Tables

Use the context dictionary to swap tables based on game state:

```gdscript
func get_loot_table_for_enemy(enemy: Enemy) -> LootTable:
	var base_table := enemy.loot_table
	# World event active? Swap in special table
	if GameState.is_event_active(&"harvest_festival"):
		return enemy.event_loot_table if enemy.event_loot_table else base_table
	# Difficulty modifier
	if GameState.difficulty == &"hard":
		return enemy.hard_mode_loot_table if enemy.hard_mode_loot_table else base_table
	return base_table
```

---

## 7. Shop Systems

```gdscript
class_name ShopSystem
extends RefCounted

signal purchase_completed(item_id: StringName, quantity: int, total_cost: int)
signal sale_completed(item_id: StringName, quantity: int, total_earned: int)

## Buy/sell ratio: sell price = buy price × this
const SELL_RATIO: float = 0.4  # Player gets 40% of buy price when selling


static func get_buy_price(item: ItemData, quantity: int = 1) -> int:
	return item.base_price * quantity


static func get_sell_price(item: ItemData, quantity: int = 1) -> int:
	return int(item.base_price * SELL_RATIO) * quantity


func buy(item: ItemData, quantity: int = 1) -> bool:
	var cost := get_buy_price(item, quantity)
	if CurrencyManager.spend(&"gold", cost, &"shop_buy"):
		InventoryManager.add_item(item.item_id, quantity)
		purchase_completed.emit(item.item_id, quantity, cost)
		return true
	return false


func sell(item_id: StringName, quantity: int = 1) -> bool:
	var item := ItemDatabase.get_item(item_id)
	if not item:
		return false
	if not InventoryManager.has_item(item_id, quantity):
		return false
	var earned := get_sell_price(item, quantity)
	InventoryManager.remove_item(item_id, quantity)
	CurrencyManager.add(&"gold", earned, &"shop_sell")
	sale_completed.emit(item_id, quantity, earned)
	return true
```

### Dynamic Pricing (Optional)

```gdscript
## Supply/demand pricing — price rises if player buys a lot, drops if they sell
class_name DynamicPricing
extends RefCounted

var _supply_modifier: Dictionary[StringName, float] = {}  ## item_id → modifier

const PRICE_INCREASE_PER_BUY: float = 0.05  ## +5% per purchase
const PRICE_DECREASE_PER_SELL: float = 0.03  ## -3% per sale
const MIN_MODIFIER: float = 0.5
const MAX_MODIFIER: float = 2.0
const DECAY_RATE: float = 0.01  ## Prices drift back to normal over time


func get_modifier(item_id: StringName) -> float:
	return _supply_modifier.get(item_id, 1.0)


func record_buy(item_id: StringName) -> void:
	var current := get_modifier(item_id)
	_supply_modifier[item_id] = clampf(current + PRICE_INCREASE_PER_BUY, MIN_MODIFIER, MAX_MODIFIER)


func record_sell(item_id: StringName) -> void:
	var current := get_modifier(item_id)
	_supply_modifier[item_id] = clampf(current - PRICE_DECREASE_PER_SELL, MIN_MODIFIER, MAX_MODIFIER)


## Call periodically (e.g., each in-game day) to decay prices toward 1.0
func decay_all() -> void:
	for item_id: StringName in _supply_modifier:
		_supply_modifier[item_id] = move_toward(_supply_modifier[item_id], 1.0, DECAY_RATE)
```

---

## 8. Economy Balance — Faucets and Sinks

A healthy economy requires balance between **faucets** (sources of currency/items) and **sinks** (removal of currency/items).

### Common Faucets

| Faucet | Notes |
|---|---|
| Enemy drops | Primary income source for action games |
| Quest rewards | Controlled, one-time payouts |
| Resource gathering | Renewable but time-gated |
| Daily login bonuses | Predictable, schedule-driven |
| Selling items | Converts items back to currency |

### Common Sinks

| Sink | Notes |
|---|---|
| Shop purchases | Direct currency drain |
| Repair costs | Recurring, scales with gear quality |
| Crafting material costs | Destroys items to create new ones |
| Fast travel fees | Convenience tax |
| Death penalties | Small % gold loss, or gear durability hit |
| Consumables | Single-use items keep demand flowing |
| Upgrades / enchanting | Gold + materials, high-end currency sink |

### Tracking Economy Health

```gdscript
## autoload: EconomyTracker (debug/analytics)
extends Node

var _faucet_totals: Dictionary[StringName, int] = {}
var _sink_totals: Dictionary[StringName, int] = {}


func _ready() -> void:
	CurrencyManager.transaction_completed.connect(_on_transaction)


func _on_transaction(currency: StringName, amount: int, reason: StringName) -> void:
	if amount > 0:
		_faucet_totals[reason] = _faucet_totals.get(reason, 0) + amount
	else:
		_sink_totals[reason] = _sink_totals.get(reason, 0) + abs(amount)


func print_report() -> void:
	print("=== Economy Report ===")
	print("Faucets:")
	for reason: StringName in _faucet_totals:
		print("  %s: %d" % [reason, _faucet_totals[reason]])
	print("Sinks:")
	for reason: StringName in _sink_totals:
		print("  %s: %d" % [reason, _sink_totals[reason]])
	var total_in: int = 0
	var total_out: int = 0
	for v: int in _faucet_totals.values():
		total_in += v
	for v: int in _sink_totals.values():
		total_out += v
	print("Net flow: %d (in: %d, out: %d)" % [total_in - total_out, total_in, total_out])
```

---

## 9. Save/Load Integration

```gdscript
## In your save system:
func save_economy() -> Dictionary:
	return {
		"wallet": CurrencyManager.get_save_data(),
		"pity_counters": pity_tracker.get_save_data(),
		"dynamic_pricing": dynamic_pricing.get_save_data(),
		"economy_stats": economy_tracker.get_save_data(),
	}

func load_economy(data: Dictionary) -> void:
	CurrencyManager.load_save_data(data.get("wallet", {}))
	pity_tracker.load_save_data(data.get("pity_counters", {}))
	dynamic_pricing.load_save_data(data.get("dynamic_pricing", {}))
```

---

## 10. C# Examples

### CurrencyManager (C#)

```csharp
using Godot;
using System.Collections.Generic;

public partial class CurrencyManager : Node
{
    [Signal] public delegate void CurrencyChangedEventHandler(
        StringName currency, int oldAmount, int newAmount);

    private readonly Dictionary<StringName, int> _wallet = new()
    {
        ["gold"] = 0,
        ["gems"] = 0,
    };

    public int GetBalance(StringName currency) =>
        _wallet.TryGetValue(currency, out var amount) ? amount : 0;

    public bool CanAfford(StringName currency, int amount) =>
        GetBalance(currency) >= amount;

    public int Add(StringName currency, int amount, StringName reason = default)
    {
        var old = GetBalance(currency);
        _wallet[currency] = old + amount;
        EmitSignal(SignalName.CurrencyChanged, currency, old, _wallet[currency]);
        return _wallet[currency];
    }

    public bool Spend(StringName currency, int amount, StringName reason = default)
    {
        if (!CanAfford(currency, amount)) return false;
        var old = GetBalance(currency);
        _wallet[currency] = old - amount;
        EmitSignal(SignalName.CurrencyChanged, currency, old, _wallet[currency]);
        return true;
    }
}
```

### Weighted Pick (C#)

```csharp
using Godot;
using System.Collections.Generic;

public static class LootRoller
{
    public static LootEntry WeightedPick(List<LootEntry> entries)
    {
        float totalWeight = 0f;
        foreach (var e in entries)
            totalWeight += e.Weight;

        float roll = GD.Randf() * totalWeight;
        float running = 0f;
        foreach (var e in entries)
        {
            running += e.Weight;
            if (roll <= running)
                return e;
        }
        return entries[^1];
    }
}
```

---

## 11. Designer Workflow

### Setting Up Loot Tables in the Editor

1. Create `LootEntry` resources as `.tres` files: `res://data/loot/entries/iron_sword.tres`
2. Create `LootTable` resources that reference entries: `res://data/loot/tables/goblin_drops.tres`
3. Assign tables to enemy scenes via `@export var loot_table: LootTable`
4. Use the Inspector to add/remove entries and adjust weights visually

### Balancing Spreadsheet Workflow

For large games, maintain a spreadsheet externally and import it:

```gdscript
## Import CSV loot table: item_id, weight, min_qty, max_qty, rarity
static func import_from_csv(csv_path: String) -> LootTable:
	var table := LootTable.new()
	var file := FileAccess.open(csv_path, FileAccess.READ)
	file.get_csv_line()  # Skip header

	while not file.eof_reached():
		var row := file.get_csv_line()
		if row.size() < 5:
			continue
		var entry := LootEntry.new()
		entry.item_id = StringName(row[0])
		entry.weight = row[1].to_float()
		entry.min_quantity = row[2].to_int()
		entry.max_quantity = row[3].to_int()
		entry.rarity = StringName(row[4])
		table.entries.append(entry)

	return table
```

---

## Common Pitfalls

| Pitfall | Fix |
|---|---|
| Float currency causes `99.999` gold | Use `int` for all currency amounts |
| No "nothing" entry in rare table → always drops rare item | Add explicit empty entries with high weight |
| Economy inflates over time | Track faucet/sink ratio; add sinks proportional to faucets |
| Sell price ≥ buy price → infinite money | Always enforce `sell_ratio < 1.0` |
| Loot table weights don't sum to 100 | They don't need to — weights are relative, not percentages |
| Pity counter not saved | Serialize pity state alongside inventory |
| Multiplayer loot duplication | Roll loot on server only; replicate results to clients |
