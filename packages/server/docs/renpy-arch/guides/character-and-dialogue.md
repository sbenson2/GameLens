# Character Definition & Dialogue System

> **Category:** guide · **Engine:** Ren'Py · **Related:** [screenplay-scripting](../architecture/screenplay-scripting.md), [gui-customization](gui-customization.md), [screen-language-and-actions](screen-language-and-actions.md)

Ren'Py's dialogue system is the backbone of every visual novel. Characters are first-class objects that control how text is displayed — including name, color, voice, portraits, and presentation style. This guide covers character definition, the ADV and NVL dialogue modes, text tags, side images, and narrator patterns.

## Defining Characters

Characters are created with the `Character()` constructor, typically in a `define` statement so they're available throughout your game:

```renpy
define e = Character("Eileen", color="#c8ffc8")
define l = Character("Lucy", color="#ffc8c8")
define narrator = Character(None)  # No name shown — for narration
```

### Character Parameters

The `Character()` constructor accepts many parameters. Here are the most commonly used:

```renpy
define e = Character(
    "Eileen",              # Display name
    color="#c8ffc8",       # Name text color
    who_color="#c8ffc8",   # Same as color (alternative name)
    what_color="#ffffff",  # Dialogue text color
    what_prefix='"',       # Text added before each line
    what_suffix='"',       # Text added after each line
    who_prefix="",         # Text added before the name
    who_suffix="",         # Text added after the name
    image="eileen",        # Image tag for automatic image display
    voice_tag="eileen",    # Tag for voice file auto-selection
    kind=adv,              # Base character kind (adv or nvl)
    callback=None,         # Function called on each interaction
    screen="say",          # Which screen to use for dialogue display
)
```

### Dynamic Names

Character names can be dynamic — useful for player-named characters:

```renpy
default player_name = "Player"

# Use a Python expression for the name
define mc = Character("[player_name]")

label start:
    $ player_name = renpy.input("What's your name?")
    $ player_name = player_name.strip() or "Player"

    mc "Hi, my name is [player_name]!"  # Name updates everywhere
```

You can also use a callable:

```renpy
init python:
    def get_title():
        if store.reputation > 50:
            return "Commander " + store.player_name
        return store.player_name

define mc = Character(get_title)
```

## Writing Dialogue

### Basic Say Statements

In Ren'Py script, dialogue uses this syntax:

```renpy
# Character says something
e "Hello, world!"

# Narration (no character)
"The room was quiet."

# Explicit narrator
narrator "The room was quiet."

# Multi-line dialogue (triple quotes)
e """
This is a longer passage of dialogue
that spans multiple lines in the script.

It appears as a single dialogue block.
"""
```

### Dialogue with Expressions

Character sprites can change automatically with dialogue:

```renpy
# If the character has image="eileen", Ren'Py looks for matching images
define e = Character("Eileen", image="eileen")

label start:
    show eileen happy  # Show the initial expression

    e happy "I'm so glad to see you!"     # Changes to eileen happy
    e sad "But I have bad news..."         # Changes to eileen sad
    e angry "Someone stole my cake!"       # Changes to eileen angry
```

The attribute (like `happy`, `sad`, `angry`) is placed between the character name and the dialogue string. Ren'Py automatically executes a `show` statement for the matching image tag + attribute.

## ADV Mode vs NVL Mode

Ren'Py supports two fundamental dialogue presentation styles.

### ADV Mode (Default)

ADV (adventure) mode shows one line of dialogue at a time in a window at the bottom of the screen. This is the default for all characters:

```renpy
define e = Character("Eileen", color="#c8ffc8")
# kind=adv is the default, so this is equivalent to:
define e = Character("Eileen", color="#c8ffc8", kind=adv)

label start:
    e "This line appears by itself."
    e "When the player clicks, this replaces the previous line."
```

### NVL Mode

NVL (novel) mode displays multiple lines on screen at once, filling the screen like a page of a novel. Characters must be explicitly declared as NVL:

```renpy
define e_nvl = Character("Eileen", kind=nvl, color="#c8ffc8")
define l_nvl = Character("Lucy", kind=nvl, color="#ffc8c8")
define nvl_narrator = nvl_character  # Built-in NVL narrator

label start:
    e_nvl "This line stays on screen."
    l_nvl "This line appears below the first."
    e_nvl "And this below that."

    nvl clear  # Clear the NVL page — start fresh

    e_nvl "A new page begins."
```

### Key NVL Concepts

- **`nvl clear`** — Clears all text from the NVL window. Use it at natural breaks (scene changes, topic shifts).
- **`nvl_character`** — A pre-defined NVL narrator character. Use it or define your own with `kind=nvl` and `None` as the name.
- **Menu in NVL** — Menus inside NVL mode show choices within the NVL window:

```renpy
label choice_point:
    e_nvl "What do you think?"

    menu:
        "I agree.":
            e_nvl "Great!"
        "I disagree.":
            e_nvl "Oh, that's too bad."

    nvl clear
```

### Switching Between ADV and NVL

You can switch modes mid-game by using characters of different kinds:

```renpy
define e = Character("Eileen", color="#c8ffc8")              # ADV
define e_nvl = Character("Eileen", kind=nvl, color="#c8ffc8") # NVL

label start:
    e "This is ADV mode — one line at a time."

    nvl clear
    e_nvl "Now we're in NVL mode."
    e_nvl "Multiple lines accumulate."
    nvl clear

    e "Back to ADV mode."
```

**Design tip:** Switching modes can feel jarring. Many games use NVL for inner monologue or narrative passages and ADV for dialogue between characters.

## Text Tags

Text tags modify how individual parts of dialogue text are rendered. They use curly braces:

```renpy
e "This is {b}bold{/b} and this is {i}italic{/i}."
e "This is {color=#ff0000}red text{/color}."
e "This is {size=+10}bigger{/size} text."
```

### Common Text Tags

| Tag | Effect | Example |
|-----|--------|---------|
| `{b}...{/b}` | Bold | `{b}important{/b}` |
| `{i}...{/i}` | Italic | `{i}emphasis{/i}` |
| `{u}...{/u}` | Underline | `{u}underlined{/u}` |
| `{s}...{/s}` | Strikethrough | `{s}deleted{/s}` |
| `{color=X}...{/color}` | Text color | `{color=#ff0}gold{/color}` |
| `{size=X}...{/size}` | Font size (absolute or relative) | `{size=+5}bigger{/size}` |
| `{font=X}...{/font}` | Font face | `{font=comic.ttf}fun{/font}` |
| `{a=URL}...{/a}` | Hyperlink | `{a=https://...}link{/a}` |
| `{image=X}` | Inline image | `{image=heart.png}` |
| `{w}` | Wait for click (mid-line) | `Hello...{w} World!` |
| `{p}` | Wait for click, then new paragraph | `First para.{p}Second.` |
| `{nw}` | No-wait: auto-advance | `Loading...{nw}` |
| `{fast}` | Skip slow text before this point | `{fast}Already shown.` |
| `{cps=X}` | Characters per second | `{cps=5}S-l-o-w...{/cps}` |
| `{k=X}` | Kerning adjustment | `{k=-.5}Tight{/k}` |
| `{rb}...{/rb}` | Ruby text (bottom) | For Japanese ruby annotations |
| `{rt}...{/rt}` | Ruby text (top) | For furigana |

### Escaping Curly Braces

To display a literal `{` in dialogue, double it:

```renpy
e "Use {{b}} for bold in Ren'Py."
# Displays: Use {b} for bold in Ren'Py.
```

### Text Tag Interpolation

Ren'Py substitutes `[variable]` expressions inside text strings:

```renpy
default gold = 100

e "You have [gold] gold pieces."
e "That's [gold * 2] if we double it."
e "Your name is [player_name!t]."  # !t applies title case
```

Format specifiers use `!` syntax:

| Specifier | Effect |
|-----------|--------|
| `!t` | Title Case |
| `!u` | UPPER CASE |
| `!l` | lower case |
| `!q` | Quote (escapes `[` and `{`) |
| `!r` | Raw repr() |

## Side Images

Side images are small character portraits shown alongside dialogue — typically in the lower-left corner of the dialogue window:

```renpy
# Method 1: Automatic via image tag
# If you define images named "side eileen happy", "side eileen sad", etc.,
# and the character has image="eileen", Ren'Py shows matching side images
define e = Character("Eileen", image="eileen")

image side eileen happy = "side_eileen_happy.png"
image side eileen sad = "side_eileen_sad.png"

label start:
    e happy "I'm happy!"   # Shows "side eileen happy" in dialogue window
    e sad "I'm sad..."     # Shows "side eileen sad"
```

```renpy
# Method 2: Explicit side image in the say screen
# In screens.rpy, the default say screen includes:
# if who is not None:
#     add SideImage() xalign 0.0 yalign 1.0
```

### Transforming Side Images

You can scale or reposition side images using the `side_image` screen or ATL transforms:

```renpy
image side eileen happy = Transform("eileen_happy.png", zoom=0.5, crop=(0, 0, 200, 300))
```

## Narration Patterns

### Silent Narrator

```renpy
# No character name is shown
"The wind howled through the empty corridor."
```

### Named Narrator

```renpy
define narrator = Character(None, what_italic=True)

label start:
    "Everything is in italics now."
```

### Thought Bubbles

```renpy
define mc_thought = Character(None, what_prefix="(", what_suffix=")", what_italic=True)

label start:
    mc_thought "I wonder if she noticed..."
```

### Character-Attributed Narration

```renpy
# The character speaks, but it feels like inner narration
define e_inner = Character(
    "Eileen",
    what_italic=True,
    what_color="#aaaaaa",
)

e_inner "I can't believe this is happening."
```

## Voice and Audio with Characters

Characters can be linked to voice files for automatic voice playback:

```renpy
define e = Character("Eileen", voice_tag="eileen")

label start:
    voice "eileen_001.ogg"
    e "This line has voice acting."

    voice "eileen_002.ogg"
    e "So does this one."
```

### Auto-Voice

If your voice files follow a naming convention, Ren'Py can auto-select them:

```renpy
init python:
    config.auto_voice = "voice/{id}.ogg"
    # {id} is replaced with the dialogue's unique identifier
    # (based on filename + line number)
```

## Callbacks

Characters support a `callback` parameter for custom behavior each time they speak:

```renpy
init python:
    def typing_sound(event, interact=True, **kwargs):
        if event == "show":
            renpy.sound.play("typing.ogg", loop=True)
        elif event == "slow_done" or event == "end":
            renpy.sound.stop()

define e = Character("Eileen", callback=typing_sound)
```

Callback events:

| Event | When |
|-------|------|
| `"begin"` | Before the dialogue is shown |
| `"show"` | When the dialogue window appears |
| `"slow_done"` | When slow text finishes displaying |
| `"end"` | When the player clicks past the dialogue |

## Character Groups and Inheritance

For games with many characters sharing properties, use a base character:

```renpy
# Base character with shared settings
define base = Character(None, what_prefix='"', what_suffix='"')

# Individual characters inherit from base
define e = Character("Eileen", kind=base, color="#c8ffc8")
define l = Character("Lucy", kind=base, color="#ffc8c8")
define k = Character("Kate", kind=base, color="#c8c8ff")
```

The `kind` parameter creates a prototype chain — the new character inherits all properties from the base, overriding only what you specify. This keeps your character definitions DRY.

## Common Pitfalls

**Forgetting `nvl clear` in NVL mode.** Without it, text accumulates indefinitely and eventually overflows the screen. Clear at scene changes, topic shifts, or after 4-6 lines.

**Mixing ADV and NVL without clearing.** When switching from NVL to ADV characters, always `nvl clear` first, or stale NVL text may linger behind the ADV window.

**Using `$` assignments for character-affecting variables without `default`.** Variables that affect character display (like `player_name`) should use `default`, not bare `$` assignment, so they're properly saved and rolled back.

**Text tag nesting order.** Close tags in reverse order: `{b}{i}text{/i}{/b}` not `{b}{i}text{/b}{/i}`. Incorrect nesting can produce garbled output.

**Auto-voice `{id}` collisions.** If you copy-paste dialogue between labels, the auto-generated voice IDs may conflict. Use `voice` statements explicitly for safety, or verify IDs with `renpy.get_voice_id()`.
