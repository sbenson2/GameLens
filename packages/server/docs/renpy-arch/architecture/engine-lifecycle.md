# Engine Lifecycle & Phases

> **Category:** architecture · **Engine:** Ren'Py · **Related:** [screenplay-scripting](screenplay-scripting.md), [save-system-and-persistence](../guides/save-system-and-persistence.md), [variables-and-data-management](../guides/variables-and-data-management.md)

Ren'Py follows a well-defined lifecycle from launch to quit. Understanding these phases helps you know *when* your code runs, *what state is available*, and *why certain patterns work the way they do*. This document covers the complete boot sequence, the interaction model, rollback architecture, and shutdown behavior.

## Phase Overview

A Ren'Py game moves through these phases in order:

1. **Early/Parse Phase** — Source files are read and parsed.
2. **Init Phase** — `init` blocks execute by priority.
3. **Splashscreen** — Optional `splashscreen` label runs.
4. **Main Menu** — The main menu context executes.
5. **In-Game Phase** — The game runs from the `start` label (or a loaded save).
6. **Quit** — Cleanup and exit.

## Phase 1: Early/Parse Phase

When Ren'Py starts, it reads every `.rpy` and `_ren.py` file in the `game/` directory. During this phase:

- **Ren'Py script** is parsed into an internal AST (abstract syntax tree). Syntax errors are caught here.
- **`define` and `default` statements** are noted but not yet executed.
- **Python in `init` blocks** is noted but not yet executed.
- Files are processed in **Unicode sort order** by filename, which matters if you rely on load order between files (you generally shouldn't).

```renpy
# This is parsed during the early phase, but the Python
# code inside won't run until the init phase
init python:
    MY_CONSTANT = 42
```

**`_ren.py` files** (Ren'Py 8+) are Python modules that Ren'Py loads alongside `.rpy` files. They allow you to write pure Python in standard `.py` syntax while still participating in Ren'Py's init system:

```python
# game/utilities_ren.py
# The _ren.py suffix tells Ren'Py to load this file
"""renpy
init python:
"""

def clamp(value, low, high):
    return max(low, min(high, value))
```

## Phase 2: Init Phase

After parsing, Ren'Py executes initialization code sorted by **init priority**. Lower numbers run first:

| Priority Range | Convention |
|---------------|------------|
| -999 to -100 | Libraries, frameworks, mods |
| -99 to 99 | Game code (default is 0) |
| 100 to 999 | Libraries that need game code to exist first |

```renpy
# Runs at priority 0 (default)
init:
    $ my_var = 10

# Runs before the above (priority -10)
init -10 python:
    import json

# Runs after both (priority 50)
init 50:
    $ derived_var = my_var * 2
```

### What Happens During Init

- `define` statements execute — creating `Character` objects, `Transform` objects, and named values.
- `default` statements are **registered** (they set their values when the game starts, not during init).
- `image` statements declare images.
- `init python` and `init` blocks execute their code.
- `style` statements configure GUI styles.
- **No game state exists yet.** You cannot show images, play audio, or interact with the player.

```renpy
# define runs during init — creates the Character
define e = Character("Eileen", color="#c8ffc8")

# default is registered during init but VALUE is set when game starts
default mood = "happy"

# image declarations
image eileen happy = "eileen_happy.png"
```

### `define` vs `default`

This distinction is critical for understanding the lifecycle:

- **`define`** — Evaluated once during init. The value is constant for the entire session. Not saved, not rolled back. Use for characters, transforms, configuration.
- **`default`** — Value is set at game start (not init). Saved with the game. Rolled back. Use for any variable the player's choices can change.

## Phase 3: Splashscreen

After init completes, the display is initialized and the presplash (if any) is removed. Ren'Py then looks for a `splashscreen` label:

```renpy
label splashscreen:
    scene black
    with Pause(1)

    show text "My Studio Logo" with dissolve
    with Pause(2)

    hide text with dissolve
    with Pause(1)

    return  # Returns to the main menu
```

The splashscreen runs in its own context. After it returns, Ren'Py proceeds to the main menu. If no `splashscreen` label exists, this phase is skipped.

## Phase 4: Main Menu

The main menu runs in its own **context** (an independent execution environment with its own call stack). The main menu screen is defined in `screens.rpy` and typically provides Start, Load, Preferences, and Quit options.

```renpy
# The main_menu label controls what happens when the main menu appears
label main_menu:
    # Usually you don't define this — Ren'Py shows the main menu screen
    # But if you do, returning from it starts the game at label start
    return
```

When the player clicks **Start**, Ren'Py calls the `Start()` action, which:

1. Leaves the main menu context.
2. Sets all `default` variables to their initial values.
3. Jumps to the `start` label.

When the player **loads a game**, Ren'Py:

1. Deserializes the saved state (using Python's `pickle` module).
2. Restores all variables, the statement pointer, and display state.
3. Enters the in-game phase at the exact point where the save was made.

## Phase 5: In-Game Phase

This is where your visual novel runs. Ren'Py executes statements sequentially, starting at `label start`:

```renpy
label start:
    scene bg room
    show eileen happy

    e "Welcome to my game!"

    menu:
        "Go to the park":
            jump park
        "Stay home":
            jump home
```

### The Interaction Model

Ren'Py's runtime is built around a concept called **interactions**. An interaction is any point where Ren'Py waits for the player — displaying dialogue, showing a menu, waiting for a click, or running a screen with input.

Each interaction follows this cycle:

1. **Setup** — Ren'Py prepares what to display (dialogue text, character name, images, screens).
2. **Render** — The display is drawn and shown to the player.
3. **Wait** — Ren'Py waits for player input (click, keypress, choice).
4. **Process** — The input is handled, and execution continues to the next statement.
5. **Checkpoint** — Rollback state is saved (at the start of each interacting statement).

Callbacks registered with `config.interact_callbacks` fire at the start of each interaction (step 1), allowing you to run custom logic every time the player is about to see something new.

### The Rollback System

Rollback is one of Ren'Py's most distinctive features — the player can scroll the mouse wheel up (or press Page Up) to rewind the game to earlier states.

**How it works internally:**

- At each **checkpoint** (the start of each statement that interacts with the player), Ren'Py snapshots the game state.
- Snapshots use Python's `pickle` module to serialize all game variables, the call stack, and displayed images.
- Rolling back restores a previous snapshot, effectively "undoing" everything since that checkpoint.
- Ren'Py keeps a configurable number of checkpoints in memory (default: 100).

**What gets rolled back:**

- All Python variables in the store (the default namespace).
- The current statement pointer and call stack.
- Images and displayables being shown.
- Screen state.
- Audio state (which tracks are playing).

**What does NOT get rolled back:**

- Variables marked with `define` (they're constants, not game state).
- Files written to disk.
- Persistent data (`persistent.*` variables).
- Side effects in Python C extensions.

```renpy
# Rollback-safe code
default score = 0

label quiz:
    "What is 2 + 2?"
    menu:
        "4":
            $ score += 1  # This will be rolled back if the player rewinds
            "Correct!"
        "5":
            "Wrong!"
```

**Controlling rollback:**

```renpy
# Disable rollback past this point (e.g., after a critical choice)
$ renpy.block_rollback()

# Mark a statement as a checkpoint manually
$ renpy.checkpoint()

# Prevent specific variables from being rolled back
init python:
    renpy.norollback_list = ["system_timer", "analytics"]
```

### Contexts

Ren'Py uses **contexts** to manage nested execution environments. The main use cases:

- **Main menu context** — Separate from the game; returning from it starts the game.
- **Game context** — Where `label start` and your story execute.
- **Call context** — When you `call` a label, a new frame is pushed; `return` pops it.
- **Menu context** — The in-game menu (save/load/preferences) runs in an overlay context.

```renpy
label start:
    call introduction  # Pushes a new call frame
    "Back in the main flow."

label introduction:
    "This is the introduction."
    return  # Pops back to the caller
```

## Phase 6: Quit

When the player quits (via the quit button, `Quit()` action, or `renpy.quit()`):

1. `config.quit_callbacks` are called — use these for cleanup (closing network connections, flushing logs).
2. The `quit` label is jumped to, if it exists.
3. Pygame/SDL are shut down.
4. The Python process exits.

```renpy
label quit:
    # Optional: show a confirmation or save before quitting
    # Reaching the end of this label (or returning) completes the quit
    return
```

## Configuration Hooks by Phase

| Phase | Configuration | Purpose |
|-------|--------------|---------|
| Early | `config.early_init` | Runs before init blocks |
| Init | `init python` blocks | Setup game data, imports |
| Post-Init | `config.after_load_callbacks` | Runs after game load or init |
| Interaction | `config.interact_callbacks` | Fires each interaction |
| Overlay | `config.overlay_functions` | Add persistent screen overlays |
| Quit | `config.quit_callbacks` | Cleanup before exit |

## Lifecycle Diagram

```
Launch
  │
  ├─ Parse Phase ─── Read .rpy / _ren.py files, build AST
  │
  ├─ Init Phase ──── Execute init blocks (priority order)
  │                   Register default values
  │                   Define characters, images, styles
  │
  ├─ Splashscreen ── Optional: label splashscreen → return
  │
  ├─ Main Menu ───── Show main menu screen (own context)
  │   │
  │   ├─ Start ───── Set defaults → jump to label start
  │   │
  │   └─ Load ────── Deserialize save → resume at saved point
  │
  ├─ In-Game ─────── Execute statements sequentially
  │   │               Interaction loop: setup → render → wait → process
  │   │               Rollback checkpoints at each interaction
  │   │
  │   ├─ Menus ───── Choice menus, in-game settings (nested contexts)
  │   │
  │   └─ Save ────── Pickle game state → write to disk
  │
  └─ Quit ─────────── Callbacks → optional quit label → exit
```

## Common Patterns

### Running Code at Game Start (Not Init)

If you need code to run when the game starts but not during init:

```renpy
label start:
    # This runs every time a new game begins
    $ initialize_analytics()
    $ renpy.random.seed()  # Re-seed the RNG

    "Welcome to the game!"
```

### Migrating Saves Across Versions

When you update your game and old saves might be incompatible:

```renpy
init python:
    config.after_load_callbacks.append(migrate_save)

    def migrate_save():
        # Check version and update variables
        if not hasattr(store, 'chapter'):
            store.chapter = 1
        if not hasattr(store, 'inventory'):
            store.inventory = []
```

### Phase-Aware Debug Logging

```renpy
init python:
    import datetime

    def log_interaction():
        if config.developer:
            current = renpy.get_filename_line()
            print(f"[{datetime.datetime.now():%H:%M:%S}] Interaction at {current}")

    config.interact_callbacks.append(log_interaction)
```
