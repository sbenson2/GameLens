# Inventory and RPG Mechanics

> **Category:** guide · **Engine:** Ren'Py · **Related:** [Variables and Data Management](variables-and-data-management.md), [Screen Language and Actions](screen-language-and-actions.md), [Python Integration](python-integration.md), [Save System and Persistence](save-system-and-persistence.md)

Many visual novels incorporate light RPG elements: inventories, character stats, currency, equipment, and skill checks. Ren'Py's `default` variable system, Python integration, and screen language make these systems straightforward to build. This guide shows how to implement them in a save/load and rollback-safe way.

---

## Foundational Rule: Use `default` for All Mutable State

Every piece of RPG state — HP, inventory, gold, equipped items — must be declared with `default` so Ren'Py tracks it for save/load and rollback. Never use `define` (constants only) or bare Python globals for mutable game state.

```renpy
# CORRECT — all RPG state as default variables
default player_hp = 100
default player_max_hp = 100
default player_mp = 50
default player_gold = 0
default player_level = 1
default player_xp = 0
default inventory = []
default equipped = {"weapon": None, "armor": None, "accessory": None}

# WRONG — define is for constants
define player_hp = 100  # will NOT save/load or rollback
```

---

## Simple Inventory (List-Based)

The simplest inventory is a list of item name strings. This works well for visual novels with a handful of collectible items.

```renpy
default inventory = []

label find_key:
    "You found a rusty key on the ground."
    $ inventory.append("rusty_key")
    "Added Rusty Key to your inventory."

label locked_door:
    if "rusty_key" in inventory:
        "You use the rusty key to unlock the door."
        $ inventory.remove("rusty_key")
        jump beyond_door
    else:
        "The door is locked. You need a key."
        jump hallway
```

### Preventing duplicates

```renpy
# Helper function to add items safely
init python:
    def add_item(item_name):
        if item_name not in inventory:
            inventory.append(item_name)
            renpy.notify(f"Obtained: {item_name}")

label pickup_gem:
    $ add_item("blue_gem")
```

---

## Structured Inventory (Class-Based)

For games with item quantities, descriptions, categories, and stacking, define an Item class and manage inventory as a list of objects.

```renpy
init python:
    class Item:
        """Represents an item type. Defined once in init, referenced by inventory."""
        def __init__(self, id, name, description, category="misc",
                     stackable=True, max_stack=99, icon=None):
            self.id = id
            self.name = name
            self.description = description
            self.category = category
            self.stackable = stackable
            self.max_stack = max_stack
            self.icon = icon  # image tag, e.g., "item_potion"

    class InventorySlot:
        """A slot holding an item reference and a quantity."""
        def __init__(self, item, quantity=1):
            self.item = item
            self.quantity = quantity

    # --- Item database (constants — use define-like pattern) ---
    ITEMS = {}

    def register_item(**kwargs):
        item = Item(**kwargs)
        ITEMS[item.id] = item
        return item

    register_item(id="potion", name="Potion", description="Restores 30 HP.",
                  category="consumable", icon="item_potion")
    register_item(id="ether", name="Ether", description="Restores 20 MP.",
                  category="consumable", icon="item_ether")
    register_item(id="iron_sword", name="Iron Sword",
                  description="A sturdy blade. +10 ATK.",
                  category="weapon", stackable=False)
    register_item(id="rusty_key", name="Rusty Key",
                  description="Opens a specific door.",
                  category="key", stackable=False)

    # --- Inventory operations ---
    def inv_add(item_id, qty=1):
        """Add qty of an item to the inventory."""
        item = ITEMS[item_id]
        for slot in inventory:
            if slot.item.id == item_id and item.stackable:
                slot.quantity = min(slot.quantity + qty, item.max_stack)
                return
        inventory.append(InventorySlot(item, qty))

    def inv_remove(item_id, qty=1):
        """Remove qty of an item. Returns True if successful."""
        for slot in inventory:
            if slot.item.id == item_id:
                if slot.quantity >= qty:
                    slot.quantity -= qty
                    if slot.quantity <= 0:
                        inventory.remove(slot)
                    return True
        return False

    def inv_has(item_id, qty=1):
        """Check if player has at least qty of an item."""
        for slot in inventory:
            if slot.item.id == item_id and slot.quantity >= qty:
                return True
        return False

    def inv_count(item_id):
        """Return the quantity of an item in inventory."""
        for slot in inventory:
            if slot.item.id == item_id:
                return slot.quantity
        return 0

# Inventory is a list of InventorySlot objects
default inventory = []
```

### Using the structured inventory in script

```renpy
label shop:
    "Welcome to the potion shop!"
    menu:
        "Buy Potion (10 gold)" if player_gold >= 10:
            $ player_gold -= 10
            $ inv_add("potion")
            "You bought a Potion."
        "Buy Ether (15 gold)" if player_gold >= 15:
            $ player_gold -= 15
            $ inv_add("ether")
            "You bought an Ether."
        "Leave":
            pass

label use_potion:
    if inv_has("potion"):
        $ inv_remove("potion")
        $ player_hp = min(player_hp + 30, player_max_hp)
        "You drink the potion and recover 30 HP."
    else:
        "You don't have any potions."
```

---

## Inventory Screen

Display the inventory using Ren'Py's screen language. The screen reads directly from the `inventory` variable.

```renpy
screen inventory_screen():
    tag menu
    modal True

    frame:
        xalign 0.5 yalign 0.5
        xsize 600 ysize 450
        vbox:
            spacing 5
            text "Inventory" size 28 xalign 0.5

            if not inventory:
                text "Your inventory is empty." italic True xalign 0.5

            viewport:
                scrollbars "vertical"
                mousewheel True
                xfill True
                ysize 340
                vbox:
                    spacing 4
                    for slot in inventory:
                        hbox:
                            spacing 10
                            if slot.item.icon:
                                add slot.item.icon xsize 32 ysize 32
                            vbox:
                                text slot.item.name size 20
                                text slot.item.description size 14 color "#aaa"
                            if slot.item.stackable and slot.quantity > 1:
                                text "x[slot.quantity]" size 18 yalign 0.5

            textbutton "Close" action Return() xalign 0.5
```

Open the inventory from dialogue or a persistent HUD button:

```renpy
label corridor:
    "You walk down the dimly lit corridor."
    menu:
        "Check inventory":
            call screen inventory_screen
        "Continue":
            pass
```

---

## Character Stats

### Simple stat block

```renpy
default stats = {
    "str": 10,
    "dex": 8,
    "int": 12,
    "cha": 7
}

default player_hp = 100
default player_max_hp = 100
default player_mp = 50
default player_max_mp = 50
```

### Stat checks in dialogue

```renpy
label persuade_guard:
    if stats["cha"] >= 10:
        "Your silver tongue convinces the guard to step aside."
        jump inner_sanctum
    elif stats["str"] >= 14:
        "You flex menacingly. The guard reconsiders."
        jump inner_sanctum
    else:
        "The guard won't budge."
        jump town_square
```

### Leveling up

```renpy
init python:
    def xp_for_level(level):
        """XP required to reach the next level (simple quadratic curve)."""
        return level * level * 50

    def grant_xp(amount):
        """Add XP and handle level-ups."""
        global player_xp, player_level, player_max_hp, player_max_mp, player_hp, player_mp
        player_xp += amount
        while player_xp >= xp_for_level(player_level):
            player_xp -= xp_for_level(player_level)
            player_level += 1
            player_max_hp += 10
            player_max_mp += 5
            player_hp = player_max_hp  # full heal on level up
            player_mp = player_max_mp
            renpy.notify(f"Level Up! Now level {player_level}!")

label victory:
    "You defeated the slime!"
    $ grant_xp(25)
    $ player_gold += 5
```

---

## Equipment System

```renpy
init python:
    EQUIPMENT_STATS = {
        "iron_sword":   {"atk": 10},
        "steel_sword":  {"atk": 18},
        "leather_armor": {"def": 5},
        "iron_armor":   {"def": 12},
    }

    def equip(slot, item_id):
        """Equip an item to a slot. Returns the previously equipped item or None."""
        global equipped
        if not inv_has(item_id):
            return None
        old = equipped.get(slot)
        # Return old item to inventory
        if old is not None:
            inv_add(old)
        # Remove new item from inventory and equip it
        inv_remove(item_id)
        equipped[slot] = item_id
        return old

    def get_total_stat(stat_name):
        """Sum a stat across all equipped items + base stats."""
        total = stats.get(stat_name, 0)
        for slot, item_id in equipped.items():
            if item_id and item_id in EQUIPMENT_STATS:
                total += EQUIPMENT_STATS[item_id].get(stat_name, 0)
        return total

default equipped = {"weapon": None, "armor": None, "accessory": None}
```

### Equipment screen

```renpy
screen equipment_screen():
    tag menu
    modal True
    frame:
        xalign 0.5 yalign 0.5
        xsize 500 ysize 350
        vbox:
            spacing 8
            text "Equipment" size 28 xalign 0.5
            null height 10
            for slot_name in ["weapon", "armor", "accessory"]:
                hbox:
                    spacing 10
                    text "[slot_name]:" size 18 min_width 120
                    if equipped[slot_name]:
                        $ item_name = ITEMS[equipped[slot_name]].name
                        text "[item_name]" size 18
                    else:
                        text "(empty)" size 18 color "#888"
            null height 10
            text "ATK: [get_total_stat('atk')]  DEF: [get_total_stat('def')]" size 18
            null height 10
            textbutton "Close" action Return() xalign 0.5
```

---

## Currency and Shops

```renpy
default player_gold = 100

init python:
    SHOP_STOCK = {
        "potion": 10,
        "ether": 15,
        "iron_sword": 80,
    }

screen shop_screen():
    tag menu
    modal True
    frame:
        xalign 0.5 yalign 0.5
        xsize 500 ysize 400
        vbox:
            spacing 5
            text "Shop — Gold: [player_gold]" size 24 xalign 0.5
            null height 10
            for item_id, price in SHOP_STOCK.items():
                $ item = ITEMS[item_id]
                hbox:
                    spacing 10
                    text "[item.name]" size 18 min_width 200
                    text "[price]g" size 18 min_width 60
                    if player_gold >= price:
                        textbutton "Buy" action [
                            Function(inv_add, item_id),
                            SetVariable("player_gold", player_gold - price),
                            renpy.notify(f"Bought {item.name}!")
                        ]
                    else:
                        text "Can't afford" size 16 color "#888"
            null height 10
            textbutton "Leave" action Return() xalign 0.5
```

---

## Rollback and Save Safety

All the patterns above use `default` variables and Ren'Py's built-in container types, so they automatically participate in save/load and rollback. Key reminders:

- `inventory` is a `RevertableList` because it was declared with `default`. Appending and removing items rolls back correctly.
- `equipped` is a `RevertableDict`. Swapping equipment rolls back correctly.
- `stats` is a `RevertableDict`. Stat changes roll back correctly.
- The `ITEMS` dictionary and `Item` class instances are created in `init python`, so they are constants — not saved or rolled back (this is correct behavior).
- Helper functions (`inv_add`, `inv_remove`, `grant_xp`) modify store variables via `global`, which Ren'Py tracks for rollback.

See [Rollback System](../architecture/rollback-system.md) for details on how revertable types work.

---

## Persistent Unlocks Across Playthroughs

Use `persistent` for meta-progression that survives across separate playthroughs (unlocked gallery images, achievement flags, New Game+ bonuses):

```renpy
default persistent.achievements = set()
default persistent.ng_plus = False

label ending_a:
    $ persistent.achievements.add("ending_a")
    "Congratulations — Ending A achieved!"

label new_game:
    if persistent.ng_plus:
        $ player_gold = 500  # bonus starting gold
        "Welcome back, adventurer. Here's some gold for your trouble."
    else:
        $ player_gold = 50
```

---

## Common Pitfalls

**Pitfall 1: Using plain Python classes without `default`.** If you create a `PlayerStats` class and assign it in a `python` block instead of `default`, it won't save or rollback properly.

**Pitfall 2: Modifying the ITEMS database at runtime.** `ITEMS` is initialized in `init` — it's a constant registry. Don't add items to it during gameplay. Add items to the `inventory` list instead.

**Pitfall 3: Forgetting `global` in helper functions.** Ren'Py functions that modify store variables need `global` declarations, or the changes won't be tracked.

**Pitfall 4: Overly complex class hierarchies.** Ren'Py's revertable types work best with simple data. Deep inheritance chains or classes with `__slots__` can cause rollback issues. Keep RPG data structures flat and dictionary-like.
