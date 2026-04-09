# Ren'Py — AI Rules

Engine-specific rules for projects using Ren'Py 8+. These supplement the engine-agnostic rules in `docs/core/ai-workflow/gamedev-rules.md`.

---

## Architecture Context

### Tech Stack

- **Engine:** Ren'Py 8.x (visual novel engine, latest stable 8.5.2)
- **Languages:** Ren'Py script language (primary) + Python 3 (extensibility)
- **Renderer:** OpenGL / DirectX via SDL2 (automatic)
- **Audio:** Built-in (OGG Vorbis preferred, supports MP3, WAV, OPUS)
- **Distribution:** Built-in launcher builds for Windows, macOS, Linux, Android, iOS, Web
- **Key Tools:**
  - Ren'Py Launcher (project management, build, distribute)
  - Ren'Py SDK (includes editor integration for VS Code, Atom)
  - Live2D Cubism (character animation, optional)

### Core Concepts

Ren'Py uses a **screenplay-like scripting language** for narrative flow, with full Python available for game logic. The engine handles:
- Dialogue display, text effects, and history
- Character definitions with portraits/expressions
- Branching narratives (menus, conditions, variables)
- Save/load/rollback (automatic — developers rarely need to manage it)
- Screen-based UI (menus, HUDs, inventories)
- Transitions, transforms, and animations

### Project Structure Conventions

```
game/
├── script.rpy           # Main story script (or split into chapters)
├── characters.rpy       # Character definitions
├── screens.rpy          # Custom screens (UI)
├── options.rpy          # Game config (title, version, build options)
├── gui.rpy              # GUI configuration (colors, fonts, sizes)
├── gui/                 # GUI images (buttons, frames, sliders)
├── images/              # Character sprites, backgrounds, CGs
│   ├── bg/              # Backgrounds
│   ├── char/            # Character sprites
│   └── cg/              # Full-screen CG art
├── audio/
│   ├── music/           # BGM (OGG preferred)
│   ├── sfx/             # Sound effects
│   └── voice/           # Voice lines (optional)
├── fonts/               # Custom TTF/OTF fonts
└── tl/                  # Translations (auto-generated structure)
    └── spanish/         # Example: Spanish translation
```

---

## Code Generation Rules

### Script Basics: Labels, Dialogue, Narration

```renpy
# CORRECT — labels define entry points; 'jump' and 'call' navigate between them
label start:
    # Narration (no character prefix)
    "The sun was setting over the old campus."

    # Dialogue (character prefix)
    e "Hello! Welcome to our story."

    # Jump to another label (no return)
    jump chapter_1

label chapter_1:
    "Chapter 1 begins..."
    return


# WRONG — putting dialogue outside a label
"This text has no label context."  # will cause errors
```

### Character Definitions

```renpy
# CORRECT — define characters in a dedicated file
define e = Character("Eileen", color="#c8ffc8")
define mc = Character("[player_name]", color="#ffffff")  # interpolated name

# With side image (shown next to dialogue box)
define e = Character("Eileen", color="#c8ffc8",
    image="eileen")  # links to images named 'eileen happy', etc.

# Narrator customization
define narrator = Character(None, kind=nvl)  # NVL-mode narrator

# WRONG — hardcoding character names in dialogue
"Eileen" "Hello!"  # doesn't create a proper Character object
```

### Image Display: show, scene, hide

```renpy
# CORRECT — use 'scene' for backgrounds, 'show' for characters
label chapter_1:
    scene bg park          # clears screen, shows background
    with dissolve          # transition

    show eileen happy      # shows character sprite
    e "What a beautiful day!"

    show eileen sad        # replaces the 'eileen' image (same tag)
    e "But it's going to rain..."

    hide eileen
    with fade

# Image naming convention — Ren'Py auto-resolves:
# images/bg park.png        → 'bg park'
# images/eileen happy.png   → 'eileen happy'
# images/eileen sad.png     → 'eileen sad'

# WRONG — manually managing image layers
$ renpy.show("eileen", at_list=[center])  # overly complex for simple cases
```

### Branching: Menus and Conditions

```renpy
# CORRECT — menu statement for player choices
label choice_point:
    menu:
        "What should we do?"  # optional caption

        "Go to the park":
            $ relationship += 1
            jump park_scene

        "Stay home":
            jump home_scene

        "Read a book" if has_book:  # conditional choice
            jump reading_scene


# CORRECT — if/elif/else for conditional flow
if relationship >= 10:
    jump good_ending
elif relationship >= 5:
    jump neutral_ending
else:
    jump bad_ending

# WRONG — using Python if statements for simple branching
$ result = "good" if relationship >= 10 else "bad"  # works but less readable
```

### Python Integration

```renpy
# Single-line Python
$ score += 10
$ player_name = renpy.input("What's your name?", default="Player")

# Multi-line Python block
python:
    import random
    enemy_hp = random.randint(50, 100)
    inventory = ["sword", "potion"]

    def calculate_damage(attack, defense):
        return max(1, attack - defense)

# Init-time Python (runs before game starts, use for classes/functions)
init python:
    class Character:
        def __init__(self, name, hp=100):
            self.name = name
            self.hp = hp
            self.alive = True

        def take_damage(self, amount):
            self.hp -= amount
            if self.hp <= 0:
                self.alive = False

# CORRECT — default for declaring game variables (survives save/load)
default player_hp = 100
default inventory = []
default flags = {}

# WRONG — using 'define' for mutable game state (define = constant)
define player_hp = 100  # won't be saved/loaded correctly
```

### Screens: Custom UI

```renpy
# CORRECT — screen language for UI elements
screen inventory_screen():
    tag menu  # only one 'menu'-tagged screen at a time

    frame:
        xalign 0.5
        yalign 0.5
        vbox:
            text "Inventory" size 36
            null height 20
            for item in inventory:
                textbutton item action Notify("Used " + item)
            null height 20
            textbutton "Close" action Return()

# Show the screen
label show_inventory:
    call screen inventory_screen

# CORRECT — screen actions (built-in action library)
screen main_menu():
    vbox:
        textbutton "Start" action Start()
        textbutton "Load" action ShowMenu("load")
        textbutton "Preferences" action ShowMenu("preferences")
        textbutton "Quit" action Quit(confirm=True)

# WRONG — using Python callbacks when built-in actions exist
textbutton "Start" action Function(renpy.run, renpy.restart_interaction)
```

### Transitions and Transforms

```renpy
# Built-in transitions
with dissolve         # cross-fade (0.5s default)
with fade             # fade to black, then to new image
with None             # instant change (suppress auto-transition)

# Custom transition
define slow_dissolve = Dissolve(1.5)

# Transforms — position, animation, effects
show eileen happy at center        # built-in position
show eileen happy at right          # built-in position

# Custom transform
transform bounce:
    yoffset 0
    ease 0.3 yoffset -20
    ease 0.3 yoffset 0
    repeat

show eileen happy at center, bounce  # combine position + animation

# ATL (Animation and Transformation Language) — Ren'Py's animation system
transform heartbeat:
    zoom 1.0
    ease 0.15 zoom 1.1
    ease 0.15 zoom 1.0
    pause 0.5
    repeat
```

### Audio

```renpy
# CORRECT — music and sound effects
play music "audio/music/theme.ogg" fadein 1.0
play music "audio/music/battle.ogg" fadeout 0.5 fadein 1.0

play sound "audio/sfx/click.ogg"

# Named audio channels
play music "theme.ogg"       # 'music' channel — loops by default
play sound "explosion.ogg"   # 'sound' channel — plays once
queue music "next_track.ogg" # queues after current track finishes

# Voice (auto-advances with dialogue)
voice "audio/voice/eileen_001.ogg"
e "This line has voice acting."

# Stop
stop music fadeout 1.0

# WRONG — using Python for simple audio playback
$ renpy.music.play("theme.ogg")  # works but verbose for simple cases
```

### Save/Load and Persistent Data

```renpy
# 'default' variables are saved automatically with the game
default player_name = ""
default chapter = 1

# 'persistent' data survives across playthroughs (achievements, unlocks)
if persistent.has_beaten_game:
    # Show secret option on main menu
    pass

# Setting persistent data
$ persistent.has_beaten_game = True

# WRONG — using plain Python globals (won't save/load)
python:
    global_score = 0  # lost on save/load
```

---

## Distribution

Ren'Py's launcher builds platform-specific packages:

- **Windows:** self-extracting `.exe` with embedded Python
- **macOS:** `.dmg` app bundle
- **Linux:** `.tar.bz2` with shell launcher
- **Android:** `.apk` (requires Java SDK setup)
- **iOS:** Xcode project (requires Mac)
- **Web/HTML5:** beta support via Emscripten

Use `options.rpy` to configure build settings:

```renpy
define build.name = "MyVisualNovel"
define config.version = "1.0"
define build.classify("game/**.rpy", None)       # exclude source scripts
define build.classify("game/**.rpyc", "archive")  # include compiled only
```

---

## Common Pitfalls

1. **Using `define` for mutable state** — `define` is for constants (character defs, config). Use `default` for variables that change during gameplay and must be saved.
2. **Forgetting image naming conventions** — Ren'Py resolves `show eileen happy` to a file named `eileen happy.png` (or with underscores: `eileen_happy.png`). If images don't show, check the filename matches.
3. **Not using `tag` on overlay screens** — without `tag menu`, multiple screens can stack and overlap unexpectedly.
4. **Overusing Python when Ren'Py script suffices** — the script language handles 90% of visual novel logic more concisely than raw Python. Reserve `python:` blocks for game mechanics.
5. **Ignoring rollback compatibility** — if Python code has side effects (file I/O, network), wrap in `renpy.not_infinite_loop()` or use `norollback` to prevent issues when the player rolls back.
6. **Large uncompressed images** — backgrounds should be JPEG (quality 95); character sprites PNG with transparency. Use `config.gl2 = True` for GPU-accelerated rendering.
7. **Not testing save/load early** — add/remove variables between versions causes save compatibility issues. Use `define config.save_json = True` and write migration code in `after_load` labels.
