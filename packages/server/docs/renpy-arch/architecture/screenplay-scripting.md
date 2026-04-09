# Screenplay Scripting Architecture

> **Category:** architecture · **Engine:** Ren'Py · **Related:** [renpy-arch-rules.md](../renpy-arch-rules.md), [guides/python-integration.md](../guides/python-integration.md)

How Ren'Py's screenplay scripting language works under the hood — execution model, statement types, control flow, and how the engine turns `.rpy` files into a running visual novel.

---

## Execution Model

Ren'Py scripts (`.rpy` files) are compiled to `.rpyc` bytecode at startup. The engine maintains a **statement pointer** that advances through the compiled script. Every statement is a node in an abstract syntax tree (AST); the pointer walks this tree, executing one node at a time.

### Key Runtime Properties

- **Deterministic replay:** Ren'Py can replay any sequence of interactions to reconstruct game state. This is how rollback and save/load work — the engine doesn't serialize your full Python state; it re-executes the script up to the saved point.
- **Rollback-safe by design:** The scripting language itself is side-effect-free (dialogue, show, hide, play). Python blocks can break rollback if they have external side effects (file I/O, network).
- **Single-threaded:** All script execution is synchronous. Animations and transitions run in the renderer, not in your script.

### Compilation Order

1. All `.rpy` files are sorted by filename, then parsed.
2. `init` blocks run in priority order (low → high), then top-to-bottom within a file at the same priority.
3. `define` and `default` statements execute during init.
4. After init, the engine jumps to `label start` and begins the game.

---

## Statement Reference

### Labels — Named Entry Points

Labels are the fundamental unit of navigation. Every scene, chapter, or branch point should be a label.

```renpy
label start:
    "The game begins here."

label chapter_1:
    "Chapter 1 content."
    return

label chapter_1_bad_ending:
    "A tragic conclusion."
    return
```

**Naming conventions:**
- Use `snake_case` for all labels.
- Prefix chapter labels: `chapter_1`, `chapter_2_intro`.
- Prefix endings: `ending_good`, `ending_bad_lonely`.
- Prefix shared utility labels: `util_check_inventory`, `util_fade_to_black`.

**Sublebels** (dot notation) scope a label under its parent, useful for internal structure:

```renpy
label chapter_1:
    "The journey begins."
    jump .combat

label .combat:
    "You draw your sword."
    # .combat is shorthand for chapter_1.combat
```

### Navigation: jump vs. call

```renpy
# jump — transfers control, no return
jump chapter_2           # unconditional
jump expression target   # dynamic: target is a variable holding a label name

# call — transfers control, returns to the calling point
call flashback_scene
"We're back from the flashback."  # execution resumes here

# call with arguments (Ren'Py 7.4+)
call battle_scene(enemy="dragon", difficulty=3)

label battle_scene(enemy, difficulty=1):
    "[enemy] attacks with difficulty [difficulty]!"
    return
```

**Rule of thumb:** Use `jump` for forward story progression (you won't come back). Use `call` for reusable scenes like battles, minigames, or flashbacks.

### Dialogue and Narration

```renpy
# Narration — no character prefix
"The rain pattered against the window."

# Dialogue — character object prefix
e "I've been waiting for you."

# Dialogue with text tags (inline formatting)
e "This is {b}bold{/b}, {i}italic{/i}, and {color=#ff0}yellow{/color}."

# Dialogue with interpolation — square brackets
"Your name is [player_name]. You have [gold] gold."

# Multi-line dialogue (triple-quoted or continuation)
e """
    This is a long speech that spans
    multiple lines in the script file.
    Ren'Py joins them automatically.
    """

# NVL mode — full-screen text (novel style)
define narrator_nvl = Character(None, kind=nvl)
label nvl_scene:
    narrator_nvl "Paragraph one of the novel section."
    narrator_nvl "Paragraph two follows."
    nvl clear  # clears the NVL page
```

### Menus — Player Choices

```renpy
menu:
    "What do you want to do?"  # optional caption (displayed as narration)

    "Explore the forest":
        $ courage += 1
        jump forest_path

    "Return to town":
        jump town_path

    "Open inventory" if len(inventory) > 0:
        call screen inventory_screen
        jump expression _return  # _return holds the screen's Return() value
```

**Menu best practices:**
- Keep choices to 2-4 options. More than 5 overwhelms players.
- Use `if` conditions to hide unavailable choices (don't show greyed-out options unless you specifically design for it).
- Always set a variable or jump after each choice — dangling menu branches cause logic errors.

### Conditional Flow

```renpy
# if / elif / else — evaluated at runtime
if relationship >= 10:
    "She smiles warmly."
elif relationship >= 5:
    "She nods politely."
else:
    "She looks away."

# Conditional with menu choices
menu:
    "Confess your feelings" if relationship >= 8:
        jump confession
    "Talk about the weather":
        jump small_talk
```

### Loops (Ren'Py 7.5+)

```renpy
# while loop — useful for repeated gameplay sections
label training_loop:
    $ rounds = 0
    while rounds < 3:
        call training_round
        $ rounds += 1
    "Training complete!"

# for loop (Ren'Py 8+)
label show_inventory:
    for item in inventory:
        "[item.name] — [item.description]"
```

---

## Image Layer System

Ren'Py manages images in a layer stack. The default layers (bottom to top) are:

| Layer | Purpose | Managed by |
|-------|---------|------------|
| `master` | Backgrounds and character sprites | `scene`, `show`, `hide` |
| `transient` | Temporary UI elements | Cleared each interaction |
| `screens` | Screen language UI | `show screen`, `call screen` |
| `overlay` | Developer overlay, FPS counter | Config |

### Image Tags and Attributes

When you `show eileen happy`, `eileen` is the **tag** and `happy` is the **attribute**. Only one image per tag is shown at a time — `show eileen sad` automatically replaces `show eileen happy`.

```renpy
# Auto-resolution: Ren'Py looks for files matching the tag + attributes
# images/eileen happy.png  → show eileen happy
# images/eileen/happy.png  → also works (directory-based)

# Manual image definition (when auto-resolve isn't enough)
image eileen happy = "characters/eileen_smile_v2.png"
image eileen angry = Composite(
    (300, 400),
    (0, 0), "eileen_base.png",
    (50, 30), "eileen_angry_face.png"
)
```

### Transitions

Transitions animate the change between image states:

```renpy
scene bg park
with dissolve              # 0.5s cross-fade

show eileen happy
with move                  # slide from previous position

# Compound transition
with Fade(0.5, 0.0, 0.5)  # fade out 0.5s, hold 0s, fade in 0.5s

# Predefined useful transitions
# dissolve, fade, pixellate, move, ease,
# zoomin, zoominout, vpunch, hpunch, blinds, squares
```

---

## Variable Scoping

Understanding `define`, `default`, and Python variables is critical for correct save/load behavior.

| Keyword | When it runs | Mutable? | Saved? | Use for |
|---------|-------------|----------|--------|---------|
| `define` | Init time | No (constant) | No | Character objects, config, transforms |
| `default` | Init time (sets initial value) | Yes | Yes | Game state: HP, flags, inventory |
| `$ x = ...` | Runtime | Yes | Yes (if in store) | Changing game state during play |

```renpy
# CORRECT usage
define e = Character("Eileen", color="#c8ffc8")   # constant — never changes
default relationship = 0                           # mutable — saved with game

label start:
    $ relationship += 1   # modifies saved state
```

**The golden rule:** If a variable changes during gameplay and should persist across save/load, declare it with `default`. If it's a constant configuration value, use `define`.

---

## File Organization for Large Projects

For visual novels with 50,000+ words, split scripts by chapter:

```
game/
├── script.rpy           # Only contains 'label start' and top-level routing
├── characters.rpy       # All define Character() statements
├── variables.rpy        # All default statements
├── chapter_01.rpy       # label chapter_1, label chapter_1_choice, etc.
├── chapter_02.rpy
├── chapter_03.rpy
├── endings.rpy          # All ending labels
├── screens.rpy          # Custom screens
├── minigames.rpy        # Reusable call-able game mechanics
└── utils.rpy            # init python helper functions
```

Ren'Py processes **all** `.rpy` files in the `game/` directory regardless of filename — filenames affect only compilation order (alphabetical) and developer organization.

---

## Debugging Script Flow

```renpy
# Developer console — press Shift+O in-game
# Jump to any label, inspect variables, test expressions

# Warp to label — launch with --warp flag
# $ renpy.sh MyProject --warp chapter_3

# Lint — catch common errors before shipping
# Ren'Py Launcher → "Check Script (Lint)"
# Reports: unreachable labels, undefined images, missing files
```
