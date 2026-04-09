# Save System and Persistence

> **Category:** guide · **Engine:** Ren'Py · **Related:** [Python Integration](python-integration.md), [Screenplay Scripting](../architecture/screenplay-scripting.md), [Distribution and Localization](../reference/distribution-and-localization.md)

Ren'Py's save system handles most persistence automatically, but game developers need to understand what gets saved, how to use persistent data across playthroughs, how to migrate saves between game versions, and how to control rollback. This guide covers all layers of Ren'Py's persistence model.

---

## Three Layers of Persistence

| Layer | Scope | Survives save/load? | Survives quit/relaunch? | Survives new playthrough? |
|-------|-------|---------------------|------------------------|--------------------------|
| `default` variables | Current playthrough | Yes | Yes (in save file) | No (reset each playthrough) |
| `persistent` | All playthroughs | N/A (not tied to saves) | Yes | Yes |
| `MultiPersistent` | Across separate games | N/A | Yes | Yes |

---

## Layer 1: Game Variables (`default`)

Variables declared with `default` are saved automatically when the player saves and restored when they load. This is the primary mechanism for tracking in-game state.

### Declaring game variables

```renpy
# CORRECT — use 'default' for all mutable game state
default player_name = "Player"
default chapter = 1
default relationship = 0
default inventory = []
default flags = {}
default player_hp = 100

# WRONG — 'define' is for constants, NOT saved/loaded
define player_hp = 100  # will NOT persist across save/load

# WRONG — plain Python globals are invisible to the save system
python:
    global_score = 0  # lost when player loads a save
```

### What gets saved

Ren'Py saves the state of all variables that have been modified since game start. Specifically:

- All variables set via `$`, `default`, or `python:` blocks after `label start`
- The current statement position and return stack
- Image display state (which images are shown, their positions)
- Screen state and screen variable values
- Music/sound playback state
- Transform and animation state

### What does NOT get saved

- Objects that can't be pickled: file handles, sockets, generators, iterators
- Variables that were never modified after initialization
- Classes defined outside `init python:` blocks (may fail to unpickle)
- Side effects: files written to disk, network requests, print output

### Making custom classes save-compatible

```renpy
# CORRECT — define classes in 'init python' so they exist before saves load
init python:
    class QuestLog:
        def __init__(self):
            self.quests = []
            self.completed = set()

        def add(self, quest_id, description):
            self.quests.append({"id": quest_id, "desc": description})

        def complete(self, quest_id):
            self.completed.add(quest_id)

default quest_log = QuestLog()

# WRONG — class defined in a regular python block won't unpickle on load
python:
    class QuestLog:  # only exists at runtime, not at init
        pass
```

---

## Layer 2: Persistent Data

Persistent data survives across all playthroughs, saves, and game restarts. Use it for unlocks, achievements, settings, and meta-progression.

### Basic usage

```renpy
# Persistent fields default to None if never set
# Use 'default persistent.X' to set an initial value
default persistent.endings_seen = set()
default persistent.gallery_unlocked = False
default persistent.play_count = 0
default persistent.best_time = None

# Reading persistent data
label start:
    $ persistent.play_count += 1

    if persistent.endings_seen and "true_ending" in persistent.endings_seen:
        "Welcome back, completionist."

# Setting persistent data
label true_ending:
    $ persistent.endings_seen.add("true_ending")
    "Congratulations! You've reached the true ending."
```

### Where persistent data is stored

Persistent data is saved to the player's system:
- **Windows:** `%APPDATA%/RenPy/<game_name>/persistent`
- **macOS:** `~/Library/RenPy/<game_name>/persistent`
- **Linux:** `~/.renpy/<game_name>/persistent`

### Clearing persistent data

```renpy
# Clear all persistent data (except double-underscore fields)
$ persistent._clear()

# Clear with progress flag (resets progress-related fields)
$ persistent._clear(progress=True)

# Check if a field was explicitly set (vs just being None)
if persistent._hasattr("endings_seen"):
    "You have save data from a previous playthrough."

# Manually save persistent data to disk (normally automatic on quit)
$ renpy.save_persistent()
```

### Custom merge logic

When persistent data files from multiple sources need to merge (e.g., cloud saves syncing), Ren'Py merges by taking the most recently updated value. For collections, register custom merge functions:

```renpy
init python:
    if persistent.endings_seen is None:
        persistent.endings_seen = set()

    def merge_endings(old, new, current):
        """Merge ending sets from multiple save sources."""
        current.update(old)
        current.update(new)
        return current

    renpy.register_persistent("endings_seen", merge_endings)
```

---

## Layer 3: Multi-Game Persistence

Share data between separate Ren'Py games (e.g., a sequel detecting the first game's completion):

```renpy
# In Game 1 (e.g., "My VN Part 1"):
define mp = MultiPersistent("myfranchise.example.com")

label true_ending:
    $ mp.part1_ending = "true"
    $ mp.player_name = player_name
    $ mp.save()  # MUST call save() explicitly
    "Your journey continues in Part 2..."

# In Game 2 (e.g., "My VN Part 2"):
define mp = MultiPersistent("myfranchise.example.com")

label start:
    if mp.part1_ending == "true":
        $ player_name = mp.player_name or "Player"
        "[player_name], welcome back. We remember your choices."
    else:
        "Welcome to Part 2."
```

The `MultiPersistent` identifier (here `"myfranchise.example.com"`) must match exactly between games. Use a domain-style string to avoid collisions.

---

## Save/Load API

### Saving programmatically

```renpy
# Save to a specific slot
$ renpy.save("1-1", extra_info="Chapter 1 — The Beginning")

# Save with custom JSON metadata
python:
    renpy.save("1-1",
        extra_info="Chapter 1",
        extra_json={
            "chapter": chapter,
            "playtime_hours": playtime / 3600,
        }
    )
```

### Loading programmatically

```renpy
# Check if a save exists before loading
if renpy.can_load("1-1"):
    $ renpy.load("1-1")  # never returns — restores full game state
```

### Querying save metadata

```renpy
python:
    # List all save slots
    slots = renpy.list_slots()

    # Get metadata for a slot
    meta = renpy.slot_json("1-1")
    if meta:
        save_name = meta.get("_save_name", "Untitled")
        game_version = meta.get("_version", "unknown")
        timestamp = meta.get("_ctime", 0)
        runtime = meta.get("_game_runtime", 0)

    # Get the most recent save
    latest = renpy.newest_slot()

    # Get save screenshot (returns a displayable)
    screenshot = renpy.slot_screenshot("1-1")

    # Delete a save
    renpy.unlink_save("1-1")

    # Copy / rename saves
    renpy.copy_save("1-1", "backup-1")
    renpy.rename_save("old-slot", "new-slot")
```

### Adding custom JSON callbacks

```renpy
init python:
    def add_chapter_to_save_json(d):
        """Add chapter number to every save's JSON metadata."""
        d["chapter"] = store.chapter
        d["location"] = store.current_location

    config.save_json_callbacks.append(add_chapter_to_save_json)
```

---

## Save Migration (`after_load`)

When you update your game between versions, old saves may reference variables or classes that have changed. The `after_load` label runs every time a save is loaded, allowing you to migrate data.

### Basic migration

```renpy
label after_load:
    # Migrate from v1.0 to v1.1: renamed variable
    if not hasattr(store, 'player_hp'):
        $ player_hp = getattr(store, 'hp', 100)

    # Migrate from v1.1 to v1.2: inventory changed from list to dict
    if isinstance(inventory, list):
        python:
            old_inventory = inventory
            inventory = {}
            for item in old_inventory:
                inventory[item] = inventory.get(item, 0) + 1

    # Migrate from v1.2 to v1.3: new variable added
    if not hasattr(store, 'quest_log'):
        $ quest_log = QuestLog()

    # IMPORTANT: block rollback after migration to prevent reverting changes
    $ renpy.block_rollback()

    return
```

### Version-based migration

```renpy
# Track save version for cleaner migrations
default save_version = 1

label after_load:
    if save_version < 2:
        # v1 → v2: add stamina system
        $ player_stamina = 100
        $ max_stamina = 100
        $ save_version = 2

    if save_version < 3:
        # v2 → v3: restructure relationship system
        python:
            if isinstance(relationship, int):
                relationship = {"eileen": relationship, "bob": 0}
        $ save_version = 3

    $ renpy.block_rollback()
    return
```

### Using `config.after_load_callbacks`

For migrations that need to run from Python (not Ren'Py script):

```renpy
init python:
    def migrate_saves():
        if not hasattr(store, 'achievements'):
            store.achievements = set()

    config.after_load_callbacks.append(migrate_saves)
```

---

## Rollback Control

Ren'Py lets players scroll back through dialogue and undo choices. Sometimes you need to restrict this.

### Block rollback entirely

```renpy
label point_of_no_return:
    "This choice is final."
    menu:
        "Accept":
            $ renpy.block_rollback()
            "There's no going back now."
            jump final_chapter
```

### Fix rollback (view-only)

Players can scroll back to review text but can't change choices:

```renpy
label critical_decision:
    menu:
        "Save the village":
            $ decision = "save"
        "Flee":
            $ decision = "flee"

    $ renpy.fix_rollback()
    # Player can scroll back to read, but the choice is locked
```

### Retain data after load

When a screen modifies variables, `retain_after_load` ensures those modifications survive if the player saves and loads during the interaction:

```renpy
screen character_creator():
    vbox:
        text "Strength: [strength]"
        hbox:
            textbutton "+" action SetVariable("strength", strength + 1)
            textbutton "-" action SetVariable("strength", max(1, strength - 1))
        textbutton "Done" action Return()

label create_character:
    $ strength = 10
    $ renpy.retain_after_load()
    call screen character_creator
    "Your strength is [strength]."
```

---

## Common Patterns

### New Game Plus

```renpy
label true_ending:
    $ persistent.endings_seen.add("true")
    $ persistent.ng_plus_stats = {
        "level": player_level,
        "gold": gold // 2,  # carry over half gold
    }
    "The End. Start a New Game+ from the main menu."

screen main_menu():
    vbox:
        textbutton "New Game" action Start()
        if persistent.ng_plus_stats:
            textbutton "New Game+" action Start("ng_plus_start")
        textbutton "Load" action ShowMenu("load")

label ng_plus_start:
    $ player_level = persistent.ng_plus_stats.get("level", 1)
    $ gold = persistent.ng_plus_stats.get("gold", 0)
    "Starting New Game+ at level [player_level]..."
    jump chapter_1
```

### Achievement system

```renpy
default persistent.achievements = set()

init python:
    def unlock_achievement(name):
        if name not in persistent.achievements:
            persistent.achievements.add(name)
            renpy.notify("Achievement unlocked: " + name)

# In game:
label beat_boss:
    $ unlock_achievement("dragon_slayer")

# In gallery/achievements screen:
screen achievements():
    vbox:
        for ach in ["dragon_slayer", "speed_run", "true_ending"]:
            if ach in persistent.achievements:
                text "[ach] — Unlocked!" color "#0f0"
            else:
                text "[ach] — Locked" color "#888"
```

### Auto-save on chapter transitions

```renpy
init python:
    def auto_save_chapter():
        renpy.take_screenshot()
        renpy.save("auto-chapter",
            extra_info="Chapter " + str(store.chapter))

label chapter_2:
    $ chapter = 2
    $ auto_save_chapter()
    "Chapter 2: The Journey Continues"
```

---

## Common Pitfalls

1. **Using `define` for game state** — `define` creates constants. They are not saved. Always use `default` for variables that change during gameplay.
2. **Forgetting `renpy.block_rollback()` in `after_load`** — without it, a player rolling back can revert your migration, causing data inconsistency.
3. **Storing unpicklable objects** — file handles, database connections, generators, and lambda functions can't be saved. Keep saved state as plain data (strings, ints, lists, dicts, sets).
4. **Not calling `mp.save()` for MultiPersistent** — unlike regular persistent data, `MultiPersistent` requires an explicit `save()` call.
5. **Adding new `default` variables without `after_load` migration** — old saves won't have the variable. Access it via `getattr(store, 'var', fallback)` in `after_load` or it will be `None`.
6. **Modifying persistent collections without re-assignment** — Ren'Py detects changes by assignment. Mutating a list in-place (`persistent.items.append(x)`) works, but if you're having issues with saves not updating, try re-assigning: `persistent.items = persistent.items + [x]`.
7. **Testing save/load too late** — test saves from the start of development. Adding or restructuring variables later creates migration headaches.
