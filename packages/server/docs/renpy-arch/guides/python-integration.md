# Python Integration in Ren'Py

> **Category:** guide · **Engine:** Ren'Py · **Related:** [architecture/screenplay-scripting.md](../architecture/screenplay-scripting.md), [renpy-arch-rules.md](../renpy-arch-rules.md)

How to use Python within Ren'Py projects — from single-line expressions to full class hierarchies, custom screens backed by Python logic, and third-party library integration.

---

## Python Entry Points

Ren'Py provides several ways to write Python code, each with different timing and scope:

### 1. Single-Line Python (`$`)

Runs inline during script execution. Use for simple assignments, function calls, and one-liners.

```renpy
label start:
    $ player_name = renpy.input("What's your name?", default="Player")
    $ player_name = player_name.strip() or "Player"
    $ score += 10
    $ inventory.append("rusty_sword")
```

### 2. Multi-Line Python Block (`python:`)

Runs at the current point in the script. Use for logic that requires multiple statements.

```renpy
label combat:
    python:
        import random
        damage = random.randint(5, 15) + player.attack
        damage = max(1, damage - enemy.defense)
        enemy.hp -= damage
        combat_log = f"{player.name} deals {damage} damage!"
        if enemy.hp <= 0:
            victory = True

    if victory:
        "[combat_log] The enemy falls!"
        jump victory_scene
    else:
        "[combat_log] The enemy still stands."
```

### 3. Init-Time Python (`init python:`)

Runs **once** during game initialization, before `label start`. Use for class definitions, function declarations, and setup that must exist before the game begins.

```renpy
init python:
    class Item:
        def __init__(self, name, description, value=0, consumable=False):
            self.name = name
            self.description = description
            self.value = value
            self.consumable = consumable

        def __repr__(self):
            return f"Item({self.name})"

    class Inventory:
        def __init__(self, capacity=20):
            self.items = []
            self.capacity = capacity

        def add(self, item):
            if len(self.items) >= self.capacity:
                return False
            self.items.append(item)
            return True

        def remove(self, item_name):
            for i, item in enumerate(self.items):
                if item.name == item_name:
                    return self.items.pop(i)
            return None

        def has(self, item_name):
            return any(i.name == item_name for i in self.items)

# Now use 'default' to create instances that get saved properly
default inventory = Inventory(capacity=20)
```

### 4. Init Priority

Control execution order when init blocks depend on each other:

```renpy
# Lower priority runs first
init -10 python:
    # Runs early — define base classes
    class GameEntity:
        pass

init python:
    # Default priority (0) — define subclasses
    class Character(GameEntity):
        def __init__(self, name, hp=100):
            self.name = name
            self.hp = hp

init 10 python:
    # Runs later — set up instances that depend on classes above
    ALL_ITEMS = {
        "potion": Item("Health Potion", "Restores 50 HP", value=25, consumable=True),
        "sword": Item("Iron Sword", "A sturdy blade", value=100),
    }
```

---

## Variables: define vs. default vs. $

This is the most common source of bugs in Ren'Py projects. Understanding the distinction is critical.

### `define` — Constants (Not Saved)

```renpy
# Characters, config values, transforms — things that NEVER change at runtime
define e = Character("Eileen", color="#c8ffc8")
define MAX_HP = 100
define DIFFICULTY_LEVELS = ["Easy", "Normal", "Hard"]
```

`define` values are set once during init and are **not included in save files**. If you mutate a `define`d list or object, the change is lost on load.

### `default` — Mutable State (Saved)

```renpy
# Game variables that change during play and must persist across save/load
default player_hp = 100
default gold = 0
default inventory = Inventory()
default flags = {"met_eileen": False, "found_key": False}
default chapter = 1
```

`default` sets the initial value at init time. When the player saves, these variables are serialized. When they load, the variables are restored to their saved values.

### Runtime Assignment (`$`)

```renpy
label battle:
    $ player_hp -= 10          # modifies saved state
    $ flags["found_key"] = True  # modifies saved dict
```

Variables assigned with `$` inside labels are stored in the **Ren'Py store** (a special Python namespace). They participate in save/load automatically if they were declared with `default`.

### Common Mistake: define with Mutable State

```renpy
# WRONG — define is for constants. This list won't be saved correctly.
define inventory = ["sword", "potion"]

# CORRECT — default for mutable game state
default inventory = ["sword", "potion"]
```

---

## Custom Classes and Save Compatibility

Ren'Py serializes `default` variables using Python's pickle. Custom classes work, but require care:

### Reloadable Classes

When you modify a class in `init python` between game versions, existing save files still expect the old class shape. Handle this with `after_load`:

```renpy
init python:
    class PlayerStats:
        def __init__(self):
            self.hp = 100
            self.mp = 50
            self.stamina = 75  # NEW in v1.2

default player_stats = PlayerStats()

label after_load:
    # Migration: add stamina to saves from v1.0/v1.1
    python:
        if not hasattr(player_stats, "stamina"):
            player_stats.stamina = 75
    return
```

### Using `__getstate__` / `__setstate__`

For full control over serialization:

```renpy
init python:
    class GameState:
        VERSION = 3

        def __init__(self):
            self.hp = 100
            self.flags = {}
            self.version = self.VERSION

        def __getstate__(self):
            # Called on save — return dict to pickle
            state = self.__dict__.copy()
            state["version"] = self.VERSION
            return state

        def __setstate__(self, state):
            # Called on load — migrate old saves
            self.__dict__.update(state)
            if state.get("version", 1) < 2:
                self.flags.setdefault("tutorial_complete", False)
            if state.get("version", 1) < 3:
                self.hp = min(self.hp, 100)  # cap HP retroactively
            self.version = self.VERSION
```

---

## Screens Backed by Python

Ren'Py's screen language can call Python functions and reference Python objects directly.

### Data-Driven Screens

```renpy
init python:
    class Quest:
        def __init__(self, title, description, complete=False):
            self.title = title
            self.description = description
            self.complete = complete

default active_quests = [
    Quest("Find the Key", "Search the old ruins for a golden key."),
    Quest("Talk to Elder", "Visit the village elder for advice."),
]

screen quest_log():
    tag menu
    modal True

    frame:
        xalign 0.5 yalign 0.5
        xsize 600 ysize 400

        vbox:
            text "Quest Log" size 30 xalign 0.5
            null height 15

            viewport:
                scrollbars "vertical"
                mousewheel True
                xfill True
                ysize 300

                vbox:
                    for quest in active_quests:
                        hbox:
                            spacing 10
                            if quest.complete:
                                text "{s}[quest.title]{/s}" color "#888"
                            else:
                                text "[quest.title]" color "#fff"
                            text "[quest.description]" size 14 color "#aaa"
                        null height 5

            null height 15
            textbutton "Close" action Return() xalign 0.5
```

### Screen Actions Calling Python

Use `Function()` to call Python from screen buttons:

```renpy
init python:
    def use_item(item):
        if item.consumable:
            if item.name == "Health Potion":
                store.player_hp = min(100, store.player_hp + 50)
            inventory.remove(item.name)
            renpy.notify(f"Used {item.name}!")
        else:
            renpy.notify(f"Can't use {item.name}.")

screen inventory_screen():
    tag menu

    frame:
        xalign 0.5 yalign 0.5
        vbox:
            text "Inventory" size 28
            null height 10
            for item in inventory.items:
                hbox:
                    text "[item.name]" min_width 200
                    textbutton "Use" action Function(use_item, item)
            null height 10
            textbutton "Close" action Return()
```

**Important:** When modifying Ren'Py store variables from Python functions, reference them via `store.variable_name` (e.g., `store.player_hp`), not just the bare name, to ensure the store is updated correctly.

---

## Third-Party Libraries

You can use any pure-Python library in Ren'Py. Libraries with C extensions require building against Ren'Py's bundled Python.

### Safe to Use Directly

- `json`, `csv`, `math`, `random`, `collections`, `itertools` — all stdlib
- `dataclasses` (Python 3.7+, available in Ren'Py 8)

### Importing Libraries

```renpy
init python:
    import json
    import os

    def load_dialogue_data(filename):
        """Load external JSON dialogue trees."""
        path = renpy.loader.transfn(filename)
        with open(path, "r", encoding="utf-8") as f:
            return json.load(f)

    # Use renpy.loader.transfn() to resolve paths relative to game/ directory
```

### Caveats

- **Avoid file I/O in rollback-sensitive code.** File operations don't roll back. Use `renpy.not_infinite_loop(100)` in loops that do I/O.
- **Don't use threads.** Ren'Py's main loop is single-threaded. Background threads can corrupt game state.
- **Avoid global mutable state outside the Ren'Py store.** Plain Python globals don't participate in save/load or rollback. Always use `default` for game state.

---

## Rollback and Python

Ren'Py's rollback system replays the script from a checkpoint. Pure Ren'Py statements are always rollback-safe. Python code can break rollback if it has side effects.

### Rollback-Safe Patterns

```renpy
# Safe — store variable modifications are tracked
$ score += 10
$ flags["found_gem"] = True

# Safe — Ren'Py's RNG is rollback-aware
python:
    damage = renpy.random.randint(5, 15)  # use renpy.random, not random
```

### Rollback-Unsafe Patterns

```renpy
python:
    # UNSAFE — file I/O is not rolled back
    with open("log.txt", "a") as f:
        f.write("Player reached chapter 2\n")

    # UNSAFE — stdlib random is not rollback-aware
    import random
    x = random.randint(1, 10)  # may give different result on rollback
```

### Protecting Unsafe Code

```renpy
python:
    # Mark variables that should NOT roll back
    # Useful for caches, analytics, debug counters
    pass

init python:
    # norollback keyword prevents rollback for specific variables
    pass

# In Ren'Py 8, use renpy.random instead of random for rollback safety
$ result = renpy.random.choice(["heads", "tails"])
```

---

## Debugging Python in Ren'Py

### Developer Console (Shift+O)

The in-game console is a full Python REPL with access to the Ren'Py store:

```
>>> player_hp
85
>>> player_hp = 100
>>> inventory.items
[Item(Health Potion), Item(Iron Sword)]
>>> renpy.jump("chapter_3")
```

### Logging

```renpy
init python:
    import logging
    logger = logging.getLogger("mygame")
    logger.setLevel(logging.DEBUG)

    # Logs appear in log.txt in the game directory
    handler = logging.FileHandler(
        os.path.join(config.basedir, "game", "debug.log")
    )
    logger.addHandler(handler)

# Usage in game
python:
    logger.debug(f"Player HP: {player_hp}, Gold: {gold}")
    logger.info(f"Entering chapter {chapter}")
```

### Common Python Errors

| Error | Cause | Fix |
|-------|-------|-----|
| `NameError: name 'x' is not defined` | Variable used before `default` or `$` assignment | Add `default x = ...` |
| `AttributeError` after loading old save | Class changed between versions | Add migration in `label after_load` |
| `Different result on rollback` | Using `random` instead of `renpy.random` | Switch to `renpy.random` |
| `store.x` vs `x` confusion | Python function can't see store directly | Use `store.x` in `init python` functions |
