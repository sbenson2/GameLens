# Rollback System

> **Category:** architecture · **Engine:** Ren'Py · **Related:** [Save System and Persistence](../guides/save-system-and-persistence.md), [Store and Namespace System](store-and-namespace-system.md), [Engine Lifecycle](engine-lifecycle.md)

Ren'Py's rollback system lets players rewind the game to earlier states, functioning like an undo/redo system. It is one of Ren'Py's most distinctive features and fundamentally shapes how the engine manages state. Understanding rollback is essential for writing code that behaves correctly when players scroll back through dialogue.

---

## How Rollback Works

Conceptually, Ren'Py takes a snapshot of the game state at the start of every statement that interacts with the player (dialogue lines, menus, `pause`, any call to `ui.interact()`). When the player rolls back, the engine restores the most recent snapshot and re-executes from that point.

In practice, rollback does not literally copy every object each statement. Instead it uses **copy-on-write** semantics through Ren'Py's revertable container types, making snapshots lightweight.

### What gets captured

Rollback captures two categories of state:

| Category | Examples |
|----------|----------|
| **Internal state** | Current statement pointer, return stack, images/displayables shown, active screens and their variables |
| **Python state** | Variables in the store that have changed since `init` finished, plus all objects reachable from those variables (if they are revertable types) |

### What does NOT get captured

- Variables set during `init` blocks (those are constants)
- Objects that aren't revertable types (standard Python `list`, `dict`, `set` created in pure-Python modules)
- External side effects (files written, network requests, OS state)
- Instances of classes inheriting from `NoRollback`

---

## Revertable Types

Inside Ren'Py script, the built-in `list`, `dict`, `set`, and `object` types are silently replaced with revertable equivalents (`RevertableList`, `RevertableDict`, `RevertableSet`, `RevertableObject`). These types record mutations so the rollback system can undo them.

```renpy
# This list is actually a RevertableList — rollback-safe
default inventory = ["sword", "shield"]

# Adding an item is tracked automatically
$ inventory.append("potion")
# If the player rolls back past this line, "potion" is removed
```

### When revertability breaks

Data created in **pure Python modules** (imported `.py` files) uses standard Python types, not revertable ones. Changes to those objects are invisible to rollback.

```python
# my_module.py — standard Python, NOT revertable
class GameState:
    def __init__(self):
        self.score = 0  # changes here won't roll back

    # FIX: inherit from renpy.python.RevertableObject instead,
    # or store score as a Ren'Py default variable
```

**Rule of thumb:** keep mutable game state in Ren'Py `default` variables or in classes that inherit from `renpy.python.RevertableObject`. Use pure Python modules for stateless utilities.

---

## Variable Change Detection

Rollback tracks **variable reassignment in the store**, not deep mutations to arbitrary objects. This has a critical implication:

```renpy
default player = {"hp": 100, "mp": 50}

# SAFE — player is a RevertableDict, append/update is tracked
$ player["hp"] -= 10

# SAFE — reassigning a store variable is always detected
$ player = {"hp": 90, "mp": 50}
```

However, if you store a non-revertable object in a variable, mutations to that object's internal state may not roll back even though the variable itself is tracked:

```renpy
init python:
    import my_module
    # StandardPythonClass uses regular list internally
    class StandardPythonClass:
        def __init__(self):
            self.data = []  # plain list, NOT RevertableList

default obj = StandardPythonClass()
$ obj.data.append("item")  # This mutation may NOT roll back correctly
```

---

## Controlling Rollback

### Blocking rollback

`renpy.block_rollback()` prevents the player from rolling back past the current point. Use this after irreversible events like timed minigame results or one-time animations.

```renpy
label minigame_result:
    # Player completed a timed challenge — don't let them redo it
    $ renpy.block_rollback()
    if won_minigame:
        "Congratulations! You won the prize!"
    else:
        "Better luck next time."
```

### Fixed rollback

`renpy.fix_rollback()` allows the player to scroll back and re-read text, but **prevents changing choices**. This is a middle ground: the player can review what happened without altering the story.

```renpy
menu:
    "Save the village":
        $ path = "hero"
    "Walk away":
        $ path = "loner"

# Lock in the choice — player can re-read but not re-choose
$ renpy.fix_rollback()
```

Check whether the game is currently in fixed rollback state with `renpy.in_fixed_rollback()`:

```renpy
# Useful in screens to grey out locked choices
if renpy.in_fixed_rollback():
    text "Choice locked" color "#888"
```

### Disabling rollback entirely

```renpy
init python:
    config.rollback_enabled = False    # disable rollback globally
    config.hard_rollback_limit = 0     # also block Shift+R developer rollback
```

Most developers should avoid disabling rollback entirely — players expect it. Use `block_rollback()` or `fix_rollback()` for specific moments instead.

---

## The NoRollback Class

For objects that should never participate in rollback (caches, analytics trackers, hardware handles), inherit from `NoRollback`:

```renpy
init python:
    class AnalyticsTracker(NoRollback):
        def __init__(self):
            self.events = []  # never rolled back

        def track(self, event_name):
            self.events.append(event_name)

default tracker = AnalyticsTracker()
```

Objects reachable **only** through a `NoRollback` instance are also excluded from rollback. If the same object is reachable through another path (a regular store variable), it still participates in rollback through that path.

---

## Rollback and Screens

Screen variables (`SetScreenVariable`, `ScreenVariableValue`) participate in rollback. When the player rolls back past the point where a screen was shown, the screen and its state are restored.

```renpy
screen inventory_screen():
    default selected_slot = 0  # rolled back along with game state

    vbox:
        for i, item in enumerate(inventory):
            textbutton item action SetScreenVariable("selected_slot", i)
```

Be careful with screens that trigger side effects (playing sounds, writing files) — those side effects are **not** undone by rollback.

---

## Rollback and Save/Load Interaction

Rollback state is saved as part of the save file. When a player loads a save, they can still roll back through the history that existed at save time (up to the configured limit).

| Config variable | Purpose | Default |
|----------------|---------|---------|
| `config.rollback_length` | Max interaction steps stored for rollback | 128 |
| `config.hard_rollback_limit` | Absolute max (including developer Shift+R) | 256 |
| `config.rollback_side` | Which side of the screen triggers rollback on touch | `"disable"` |

---

## Common Pitfalls

**Pitfall 1: Mutating non-revertable objects.** If you import a Python class that uses plain `list` or `dict`, mutations won't undo on rollback. Inherit from `RevertableObject` or store state in `default` variables.

**Pitfall 2: Side effects in rollback.** Code that writes files, sends network requests, or plays one-shot SFX will not be undone. Guard with `not renpy.in_rollback()` or use `renpy.block_rollback()`.

```renpy
# Only write the achievement file on first pass, not on rollback replay
if not renpy.in_rollback():
    $ write_achievement("first_ending")
```

**Pitfall 3: Overusing block_rollback.** Players rely on rollback to re-read text and correct misclicks. Block it only for truly irreversible moments like minigame outcomes.

**Pitfall 4: Large objects in the store.** Every revertable object reachable from the store is snapshot-tracked. Storing huge data structures (full map grids, image pixel data) in store variables can slow down rollback and bloat save files. Keep large, read-only data in `define` or `NoRollback` objects.

---

## Summary

| Concept | Function / Type | When to use |
|---------|----------------|-------------|
| Allow rollback (default) | — | Normal dialogue and choices |
| Block rollback | `renpy.block_rollback()` | After irreversible events (minigames, timers) |
| Fix rollback (read-only) | `renpy.fix_rollback()` | Let player re-read but not re-choose |
| Check fixed state | `renpy.in_fixed_rollback()` | Grey out locked UI elements |
| Check rollback replay | `renpy.in_rollback()` | Guard side effects |
| Exclude from rollback | Inherit `NoRollback` | Caches, analytics, hardware handles |
| Revertable containers | `RevertableList`, `RevertableDict`, `RevertableSet` | Automatic in Ren'Py script; use explicitly in `.py` modules |
