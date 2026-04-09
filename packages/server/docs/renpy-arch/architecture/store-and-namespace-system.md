# Ren'Py Store and Namespace System

> **Category:** architecture · **Engine:** Ren'Py · **Related:** [screenplay-scripting](screenplay-scripting.md), [python-integration](../guides/python-integration.md), [variables-and-data-management](../guides/variables-and-data-management.md)

How Ren'Py organizes Python variables into stores, how the default store interacts with save/load and rollback, and how named stores let you create module-like namespaces in your game.

---

## What Is a Store?

A **store** is a Python namespace where Ren'Py keeps game variables. Every variable you declare with `define`, `default`, or set with a `$` one-liner lives in a store. The default store is the one you use most — it's the implicit namespace for all script-level variables.

From Python, the default store is accessible as `renpy.store` or via `import store`.

```renpy
# These all live in the default store
define protagonist_name = "Alex"
default affection = 0

label start:
    $ affection += 1
    "Hello, [protagonist_name]! Affection is now [affection]."
```

---

## define vs. default vs. $ Assignment

These three ways of creating variables have critically different behaviors with respect to save/load and rollback.

### define — Constant-Like, Init-Time Only

```renpy
define e = Character("Eileen", color="#c8ffc8")
define MAX_HEALTH = 100
```

- Executes during **init phase** (before `label start`).
- The variable is treated as **constant** — Ren'Py does not save it, does not roll it back, and does not include it in save files.
- If you change a `define`d variable at runtime, the change persists for the session but is *not* saved. On load, the value reverts to the `define`d value.
- **Use for:** Character objects, configuration constants, colors, style settings — anything that doesn't change during gameplay.

### default — Save-Aware, Runtime Variable

```renpy
default player_health = 100
default inventory = []
default flags = {"met_eileen": False, "found_key": False}
```

- Executes **after init but before `label start`**, and only if the variable does not already exist (i.e., not already loaded from a save file).
- The variable **participates in save/load and rollback**. Ren'Py tracks changes and can undo them on rollback.
- If the player loads a save, `default` is skipped for variables that were already saved — the saved value wins.
- **Use for:** All gameplay state — health, flags, inventory, relationship points, anything that changes during play.

### $ Assignment — Inline Python, Runtime Only

```renpy
label some_scene:
    $ current_mood = "happy"
    $ player_health -= 10
```

- Executes when the script pointer reaches that line.
- Participates in **rollback** (Ren'Py records the change and can undo it).
- If you `$`-assign a variable that was never `default`ed, it will still be saved, but Ren'Py won't know its initial value — loading a save from before that point may produce `NameError`.
- **Use for:** Changing existing variables mid-script. Always `default` a variable before `$`-assigning it.

### Decision Table

| Declaration | Runs When | Saved? | Rollback? | Use Case |
|-------------|-----------|--------|-----------|----------|
| `define` | Init phase | No | No | Constants, Characters, config |
| `default` | Pre-start (if not in save) | Yes | Yes | All gameplay state |
| `$ x = ...` | Script reaches it | Yes (if defaulted) | Yes | Mid-script changes |

---

## Named Stores — Module-Like Organization

As your game grows, you may want to group related variables together. Named stores provide namespacing without creating actual Python modules.

### Declaring Variables in a Named Store

```renpy
# Prefix the variable name with the store name
define combat.MAX_DAMAGE = 50
default combat.player_hp = 100
default combat.enemy_hp = 80
```

This creates a store called `combat`. You access its variables with the dot prefix:

```renpy
label fight:
    $ combat.player_hp -= 15
    if combat.player_hp <= 0:
        jump game_over
```

### Python Block in Named Store

```renpy
init python in combat:
    # Everything in this block lives in store.combat
    MAX_DAMAGE = 50

    def calculate_damage(base, modifier):
        return min(base * modifier, MAX_DAMAGE)
```

From Ren'Py script, you access these as `combat.calculate_damage(10, 1.5)`. From a Python block, you can also use `import store.combat`.

### Named Store Behavior

- Named stores participate in **save, load, and rollback** exactly like the default store.
- `define` in a named store is still constant (not saved). `default` in a named store is still save-aware.
- Named stores are **created on first use** — you don't need to declare them ahead of time.
- You cannot nest stores deeper than one level (no `combat.magic.spells` — use `combat_magic` instead).

---

## How Stores Interact with Save/Load

Understanding what gets saved is critical for avoiding bugs.

### What Ren'Py Saves

1. All variables in the default store and named stores that have **changed from their initial values** (the values at the end of the init phase).
2. The current script position (which label and which line).
3. The rollback log (for undo support).

### What Ren'Py Does NOT Save

1. `define`d variables (they're reconstituted from `define` statements on load).
2. Variables in Python modules you `import`ed normally (not in a store).
3. Variables in `renpy.` namespace (those are engine internals).

### The Serialization Constraint

Ren'Py uses Python's `pickle` to serialize store variables. This means every value in your store must be picklable:

```renpy
# GOOD — all picklable types
default score = 0
default inventory = ["sword", "potion"]
default flags = {"met_npc": True}

# BAD — lambda is not picklable, will crash on save
default damage_fn = lambda x: x * 2
```

**Fix for non-picklable values:** Use `define` (not saved) or store a plain data representation and reconstruct the object when needed.

---

## Rollback and Stores

Ren'Py's rollback system records every change to store variables. When the player hits "rollback" (or scrolls the mouse wheel back), Ren'Py undoes those changes in reverse order.

### Rollback-Safe Patterns

```renpy
# SAFE — simple value changes are auto-tracked
default coins = 10
label shop:
    $ coins -= 5  # rollback will restore coins to 10
```

### Rollback-Breaking Patterns

```renpy
# DANGEROUS — mutating a list in-place
default inventory = []
label find_item:
    $ inventory.append("key")
    # Rollback MAY not undo this correctly in all cases
```

Ren'Py wraps common containers (`list`, `dict`, `set`) to track mutations, so the above usually works. But complex nested mutations or custom objects may not rollback cleanly. When in doubt, replace rather than mutate:

```renpy
# SAFER — replace the list entirely
$ inventory = inventory + ["key"]
```

---

## Accessing Stores from Python

### From a python block (default store):

```renpy
init python:
    # Direct access — you're already in the default store
    my_var = 42
```

### From a `python in` block (named store):

```renpy
init python in utils:
    import store  # access the default store

    def double_score():
        store.score *= 2
```

### From an external `.py` module:

```python
# my_module.py — imported via init python
import renpy.store as store

def reset_game():
    store.player_hp = store.MAX_HP
    store.inventory = []
```

**Caution:** External `.py` modules are not rollback-aware. Changes they make to the store will persist but rollback may not undo them. Prefer Ren'Py script or `python in` blocks for state changes.

---

## Common Pitfalls

1. **Using `define` for gameplay state** — the value won't be saved. Player loads a save and their progress is gone. Use `default` for anything that changes during play.

2. **Forgetting to `default` before `$`-assigning** — works fine until the player loads a save from before that variable existed, then gets a `NameError`.

3. **Storing non-picklable objects** — lambdas, open file handles, database connections, and most C-extension objects can't be pickled. Use `define` for non-picklable constants, or store plain data and reconstruct.

4. **Naming collisions across stores** — `default score = 0` and `default combat.score = 0` are different variables. Be consistent about which store owns what.

5. **Modifying stores from external Python** — changes are saved but not rollback-aware. If rollback matters, make the change from Ren'Py script.

6. **Mutable default values** — `default inventory = []` is fine in Ren'Py (unlike Python function defaults), because `default` only runs once. But be aware that all code paths share the same list instance.
