# Variables and Data Management

> **Category:** guide · **Engine:** Ren'Py · **Related:** [screenplay-scripting](../architecture/screenplay-scripting.md), [choices-and-branching](choices-and-branching.md), [save-system-and-persistence](save-system-and-persistence.md), [python-integration](python-integration.md)

A comprehensive guide to how Ren'Py stores, saves, and persists data — covering `define` vs `default`, the store namespace, persistent data, screen actions for variables, and patterns for managing complex game state like affinity systems and inventories.

---

## define vs default

These two statements look similar but behave fundamentally differently. Confusing them is the most common variable-related bug in Ren'Py projects.

### define — Constants (Not Saved)

`define` creates a variable that is **not included in save files** and **should not be changed at runtime**. Use it for character definitions, configuration, and fixed data.

#### Ren'Py script

```renpy
# Character objects — never change during gameplay
define e = Character("Eileen", color="#c8ffc8")
define mc = Character("[player_name]", color="#ffffff")

# Fixed configuration
define MAX_AFFINITY = 100
define CHAPTER_COUNT = 5

# Data tables — tuples/frozensets for immutability
define ENDINGS = {
    "good": "You saved everyone.",
    "neutral": "Life goes on.",
    "bad": "The world crumbled.",
}
```

**What happens if you change a `define`d variable?** Ren'Py treats it as constant — changes won't persist across save/load cycles, and Ren'Py may optimize away your mutation. If a value needs to change, use `default` instead.

### default — Mutable State (Saved)

`default` creates a variable that **is included in save files** and is expected to change during gameplay. Ren'Py initializes it only if it hasn't been set yet (e.g., at new game start or when loading a save from before the variable existed).

#### Ren'Py script

```renpy
# Player-driven state
default player_name = "Alex"
default affinity_eileen = 0
default current_chapter = 1
default visited_locations = []
default inventory = {}
default has_key = False

# Flags for tracking story progress
default met_eileen = False
default chose_diplomacy = False
default endings_seen = set()
```

### Side-by-Side Comparison

| Aspect | `define` | `default` |
|--------|----------|-----------|
| **Saved in save files?** | No | Yes |
| **Should change at runtime?** | No | Yes |
| **Initialization** | Every game start | Only if not already set |
| **Use for** | Characters, config, constants | Flags, scores, inventory, choices |
| **Python equivalent** | Module-level constant | Instance variable |

### Rule of Thumb

> If the player's choices can change it → `default`.
> If it's the same every playthrough → `define`.

---

## The Store Namespace

All `define` and `default` variables live in a single flat namespace called the **store**. Variable names must be unique across both — you cannot have a `define x` and a `default x`.

### Accessing Store Variables

#### Ren'Py script

```renpy
label start:
    # Direct access — works in Ren'Py script context
    "Eileen's affinity is [affinity_eileen]."

    # In Python blocks, access directly (they share the store)
    $ total = affinity_eileen + affinity_mark
```

#### Python (in init or python blocks)

```python
# In a python block, store variables are globals
$ inventory["sword"] = True
$ affinity_eileen += 5
$ affinity_eileen = min(affinity_eileen, MAX_AFFINITY)  # clamp to constant
```

### Named Stores (Namespacing)

For large projects, Ren'Py supports named stores to avoid name collisions. This is useful when multiple systems (combat, dialogue, inventory) have variables with common names like `level` or `count`.

#### Ren'Py script

```renpy
# Declare variables in a named store
default combat.player_hp = 100
default combat.enemy_hp = 50
default combat.turn = 0

default economy.gold = 0
default economy.prices = {"potion": 10, "sword": 50}

# Access with dot notation
label shop:
    if economy.gold >= economy.prices["potion"]:
        $ economy.gold -= economy.prices["potion"]
        $ inventory.append("potion")
        "You bought a potion!"
    else:
        "You can't afford that."
```

#### Python (in init python blocks)

```python
init python in combat:
    # Variables defined here live in store.combat
    def calculate_damage(attacker_str, defender_def):
        base = max(1, attacker_str - defender_def)
        return base

# Call from Ren'Py script:
# $ dmg = combat.calculate_damage(player_str, enemy_def)
```

---

## Persistent Data

Persistent data survives across **all playthroughs and save files**. It's stored separately from save data and is shared across every run of the game. Use it for unlock tracking, settings, and achievements.

### Basic Usage

#### Ren'Py script

```renpy
# Set a default — runs once per install (not per playthrough)
default persistent.best_ending_seen = False
default persistent.total_playthroughs = 0
default persistent.unlocked_gallery = set()
default persistent.preferred_language = "en"

label after_ending:
    # Update persistent data
    $ persistent.total_playthroughs += 1

    if ending == "good" and not persistent.best_ending_seen:
        $ persistent.best_ending_seen = True
        "Achievement Unlocked: Best Ending!"

    $ persistent.unlocked_gallery.add(ending)
```

### Persistent Properties

- **Auto-None:** Accessing an undefined persistent field returns `None` instead of raising an error. This makes version migration safer.
- **Saved on exit:** All persistent data is saved when Ren'Py terminates or when you call `renpy.save_persistent()`.
- **Not tied to saves:** Deleting a save file does not affect persistent data.

### Checking Persistent State for New Game+ Features

#### Ren'Py script

```renpy
label start:
    if persistent.best_ending_seen:
        "Welcome back. A new path has opened..."
        $ show_secret_route = True
    else:
        "Welcome to the story."
        $ show_secret_route = False

    # Conditional menu choices based on past playthroughs
    menu:
        "Begin the journey":
            jump chapter_1
        "Secret route" if persistent.best_ending_seen:
            jump secret_chapter
```

### Resetting Persistent Data

```renpy
# Reset all persistent data
$ persistent._clear()

# Reset specific fields
$ persistent.total_playthroughs = 0

# Custom reset that preserves settings
init python:
    def reset_progress():
        """Reset gameplay unlocks but keep player preferences."""
        persistent.best_ending_seen = False
        persistent.unlocked_gallery = set()
        # Don't reset: persistent.preferred_language, persistent.text_speed
```

---

## Screen Actions for Variables

Ren'Py's screen language provides actions to modify variables directly from UI elements, without writing Python blocks.

### SetVariable / ToggleVariable

```renpy
screen settings_menu():
    vbox:
        # Toggle a boolean flag
        textbutton "Show hints: [show_hints]":
            action ToggleVariable("show_hints")

        # Set to a specific value
        textbutton "Easy mode":
            action SetVariable("difficulty", "easy")
        textbutton "Hard mode":
            action SetVariable("difficulty", "hard")

        # Works with persistent via dot notation
        textbutton "Fullscreen: [persistent.fullscreen]":
            action [ToggleVariable("persistent.fullscreen"),
                    Function(renpy.set_physical_size, None)]
```

### SetField / ToggleField (for Object Attributes)

```renpy
# When the variable is an attribute of an object (not a store name)
default player = Player(name="Alex", hp=100)

screen player_hud():
    textbutton "Heal":
        action SetField(player, "hp", 100)
        sensitive (player.hp < 100)
```

### Action Chaining

Multiple actions can execute from a single button press using a list:

```renpy
screen shop_item(item_name, price):
    textbutton "Buy [item_name] ($[price])":
        action [
            SetVariable("economy_gold", economy_gold - price),
            Function(inventory.append, item_name),
            Notify("Purchased " + item_name + "!"),
        ]
        sensitive (economy_gold >= price)
```

---

## Common Patterns

### Affinity / Relationship Points

```renpy
default affinity = {"eileen": 0, "mark": 0, "sara": 0}

# Helper function for clamped affinity changes
init python:
    def change_affinity(character, amount, cap=100):
        """Change affinity with clamping to [-cap, cap]."""
        current = affinity.get(character, 0)
        affinity[character] = max(-cap, min(cap, current + amount))

label park_scene:
    menu:
        "Help Eileen with her painting":
            $ change_affinity("eileen", 5)
            e "Thank you! That means a lot."
        "Challenge Mark to a race":
            $ change_affinity("mark", 3)
            m "You're on!"
```

### Inventory System

```renpy
default inventory = []

init python:
    def has_item(item):
        return item in inventory

    def add_item(item):
        if item not in inventory:
            inventory.append(item)
            renpy.notify(f"Obtained: {item}")

    def remove_item(item):
        if item in inventory:
            inventory.remove(item)

label find_key:
    $ add_item("rusty_key")

label locked_door:
    if has_item("rusty_key"):
        $ remove_item("rusty_key")
        "The key fits. The door creaks open."
        jump secret_room
    else:
        "The door is locked. You need a key."
```

### Tracking Visited Labels

```renpy
default visited_labels = set()

init python:
    def mark_visited(label_name):
        visited_labels.add(label_name)

    def has_visited(label_name):
        return label_name in visited_labels

label cafe:
    $ mark_visited("cafe")
    if has_visited("park"):
        "You recall the conversation you had in the park."
    "The coffee here is excellent."
```

**Note:** Ren'Py also has a built-in `renpy.seen_label(label_name)` function that tracks whether a label was ever reached across all playthroughs (uses persistent storage internally). Use it when you want cross-playthrough tracking without managing it yourself.

---

## Variable Lifecycle and Save Compatibility

When you add new `default` variables to a game after players already have save files, Ren'Py handles this gracefully:

1. **New `default` variable added:** On load, Ren'Py sees the variable isn't in the save data and initializes it to the default value. Safe.
2. **`default` variable removed:** The orphaned data in the save file is ignored. Safe, but consider using `define config.lint` to catch references.
3. **`default` renamed:** Old saves still have the old name. Write a migration in `after_load`:

```renpy
init python:
    config.after_load_callbacks.append(migrate_saves)

    def migrate_saves():
        # Rename old variable to new name
        if hasattr(store, "old_variable_name"):
            store.new_variable_name = store.old_variable_name
            del store.old_variable_name
```

---

## Common Pitfalls

1. **Using `define` for mutable state** — the value won't save/load correctly. Use `default`.
2. **Mutable default values shared across saves** — `default inventory = []` is fine because Ren'Py creates a new list per game. But `define SHARED_LIST = []` and then mutating it will affect all references.
3. **Name collision between `define` and `default`** — both share the store namespace. A `define x = 1` and `default x = 2` will conflict silently.
4. **Forgetting `persistent.` prefix** — `$ best_ending = True` only exists in the current save; `$ persistent.best_ending = True` survives across all saves.
5. **Not setting persistent defaults** — always use `default persistent.x = value` so new installs have a defined initial state instead of `None`.
6. **Modifying `define`d containers** — `define ITEMS = ["a", "b"]` then `$ ITEMS.append("c")` appears to work but breaks on save/load because `define`d values aren't tracked.
