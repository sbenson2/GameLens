# NVL Mode and Text Formatting

> **Category:** guide · **Engine:** Ren'Py · **Related:** [character-and-dialogue.md](character-and-dialogue.md), [architecture/screenplay-scripting.md](../architecture/screenplay-scripting.md), [gui-customization.md](gui-customization.md)

Ren'Py supports two dialogue presentation modes: ADV (one line at a time in a textbox) and NVL (multiple lines filling the screen, like a novel page). This guide covers NVL mode setup, switching between modes, page management, click-to-continue indicators, and the full text tag system for formatting dialogue.

---

## NVL Mode Basics

NVL-style presentation shows multiple lines of dialogue on screen simultaneously, in a full-screen window. It suits narrative-heavy visual novels, epistolary formats, and internal monologue sequences.

### Declaring NVL Characters

Add `kind=nvl` to character definitions:

```renpy
# NVL characters
define narrator = nvl_narrator
define s = Character('Sylvie', kind=nvl, color="#c8ffc8")
define m = Character('Me', kind=nvl, color="#c8c8ff")

# ADV characters (normal, for comparison)
define e = Character('Eileen', color="#c8ffc8")
```

`nvl_narrator` is a built-in character that displays narration in NVL mode without a speaker name.

### Character Name Styles

NVL supports several formatting conventions for how names appear alongside dialogue:

```renpy
# Style 1: Name displayed separately (default)
define s = Character('Sylvie', kind=nvl, color="#c8ffc8")
# Output: "Sylvie" in color, then dialogue below

# Style 2: Name embedded in dialogue
define s = Character(None, kind=nvl,
    what_prefix='Sylvie: "', what_suffix='"')
# Output: Sylvie: "Hello there."

# Style 3: Anonymous quotes
define s = Character(None, kind=nvl,
    what_prefix='"', what_suffix='"')
# Output: "Hello there."  (with color tinting)

# Style 4: Color-tinted anonymous
define s = Character(None, kind=nvl,
    what_prefix='"', what_suffix='"',
    what_color="#c8ffc8")
```

---

## Page Management

NVL mode accumulates dialogue on screen until you explicitly clear it. Without page breaks, text overflows.

### `nvl clear` Statement

Insert after each logical page:

```renpy
label start:
    "I'll ask her..."
    m "Um... will you be my artist for a visual novel?"

    nvl clear

    "Silence."
    s "Sure, but what is a visual novel?"

    nvl clear
```

### `{clear}` Text Tag (Monologue Mode)

Inside a single block of NVL narration, use the `{clear}` text tag for page breaks without ending the say statement:

```renpy
label monologue:
    """
    The rain hadn't stopped for three days.

    I watched it from the window, wondering if she'd come.
    {clear}
    She did come, eventually.

    But by then the rain had stopped, and I wasn't waiting anymore.
    {clear}
    """
```

### `config.nvl_list_length`

Limit how many dialogue entries stay on screen (acts like a scrolling window):

```renpy
init python:
    config.nvl_list_length = 6  # show last 6 entries
```

Setting this to `None` (default) keeps all entries until an explicit `nvl clear`.

---

## Switching Between ADV and NVL

Games often use NVL for narration and ADV for direct dialogue. You can mix modes freely.

### Per-Character Switching

Simply declare some characters as `kind=nvl` and others without it. When an NVL character speaks, the NVL window appears; when an ADV character speaks, it switches back.

**Important:** Always `nvl clear` before switching from NVL to ADV characters, or leftover NVL text will persist behind the ADV window.

```renpy
define narrator = nvl_narrator
define e = Character('Eileen')  # ADV mode

label chapter_start:
    "The festival grounds were emptying out."
    "Only the paper lanterns still swayed."

    nvl clear

    e "Hey, are you coming? We'll miss the last train."
```

### Window Show/Hide Control

```renpy
init python:
    config.window_hide_transition = dissolve
    config.window_show_transition = dissolve
    config.empty_window = nvl_show_core

label dramatic_scene:
    window hide
    scene bg meadow
    with fade
    window show

    "The meadow stretched endlessly before us."
```

### NVL-Mode Menus

Choices can render in NVL style:

```renpy
# Per-menu override
menu (nvl=True):
    "Accept her offer.":
        jump accept
    "Decline politely.":
        jump decline

# Or make NVL menus the default
define menu = nvl_menu
```

---

## Click-to-Continue (CTC) Indicators

CTC indicators show the player that more text is coming (mid-page) or that the page is complete (end of page).

### Configuration

```renpy
init python:
    # CTC for mid-page lines (player clicks to see next line)
    # Use the character's ctc parameter:
    # define s = Character('Sylvie', kind=nvl, ctc="ctc_arrow")

    # CTC for end-of-page (just before nvl clear)
    config.nvl_page_ctc = "ctc_page_end"
    config.nvl_page_ctc_position = "nestled"  # or "fixed"
```

`"nestled"` places the CTC immediately after the last character. `"fixed"` places it at a fixed screen position.

### Custom CTC Displayable

```renpy
image ctc_arrow:
    "images/ui/ctc_arrow.png"
    xalign 1.0 yalign 1.0
    linear 0.5 alpha 0.3
    linear 0.5 alpha 1.0
    repeat

image ctc_page_end:
    "images/ui/page_turn.png"
    xalign 0.98 yalign 0.95
    linear 0.8 rotate 10
    linear 0.8 rotate -10
    repeat
```

---

## Text Tags Reference

Text tags control formatting, timing, and flow within dialogue strings. They work in both ADV and NVL mode.

### Formatting Tags

| Tag | Effect | Example |
|-----|--------|---------|
| `{b}...{/b}` | **Bold** | `"This is {b}important{/b}."` |
| `{i}...{/i}` | *Italic* | `"She said it {i}softly{/i}."` |
| `{u}...{/u}` | Underline | `"{u}Warning:{/u} danger ahead."` |
| `{s}...{/s}` | ~~Strikethrough~~ | `"That's {s}wrong{/s} right."` |
| `{plain}...{/plain}` | Removes bold/italic/underline/strike | `"{b}Bold {plain}not bold{/plain}{/b}"` |
| `{color=#hex}...{/color}` | Text color (supports #rgb, #rrggbb, #rrggbbaa) | `"{color=#f00}Red alert!{/color}"` |
| `{alpha=value}...{/alpha}` | Opacity (0.0–1.0, or +/-, or *) | `"{alpha=0.5}whisper{/alpha}"` |
| `{size=N}...{/size}` | Font size (absolute, +/-, or *multiplier) | `"{size=+10}BIG{/size} normal"` |
| `{font=file}...{/font}` | Change font | `"{font=hand.ttf}handwritten{/font}"` |
| `{k=N}...{/k}` | Kerning (pixel adjustment) | `"{k=-.5}Tight{/k}"` |
| `{outlinecolor=#hex}...{/outlinecolor}` | Change outline color | `"{outlinecolor=#000}outlined{/outlinecolor}"` |

### Spacing and Layout Tags

| Tag | Effect | Example |
|-----|--------|---------|
| `{space=N}` | Horizontal space (pixels) | `"Before{space=40}After"` |
| `{vspace=N}` | Vertical space (pixels) | `"Line 1{vspace=20}Line 2"` |

### Timing and Flow Tags

These tags control *how* text appears during typewriter-style display:

| Tag | Effect | Example |
|-----|--------|---------|
| `{p}` | Paragraph break — waits for click, then continues | `"Page 1.{p}Page 2."` |
| `{p=N}` | Auto-advance after N seconds | `"Wait...{p=2.0}Done."` |
| `{w}` | Wait for click, then continue on same line | `"Ready?{w} Go!"` |
| `{w=N}` | Wait N seconds, then continue | `"3...{w=1.0}2...{w=1.0}1..."` |
| `{nw}` | No-wait — dismiss immediately after displaying | `"Quick flash!{nw}"` |
| `{fast}` | Skip typewriter for preceding text — instant display | `"Previously:{fast} new text types out"` |
| `{done}` | Mark end of visible text (rest is hidden) | `"Visible{done}hidden"` |
| `{cps=N}...{/cps}` | Characters per second (absolute) | `"{cps=5}S-l-o-w{/cps}"` |
| `{cps=*N}...{/cps}` | CPS multiplier | `"{cps=*3}fast fast fast{/cps}"` |

### Interactive Tags

| Tag | Effect | Example |
|-----|--------|---------|
| `{a=URL}...{/a}` | Hyperlink (web URL) | `"{a=https://renpy.org}Ren'Py{/a}"` |
| `{a=jump:label}...{/a}` | Hyperlink that jumps to a label | `"{a=jump:ch2}Chapter 2{/a}"` |
| `{a=call:label}...{/a}` | Hyperlink that calls a label | `"{a=call:glossary}glossary{/a}"` |
| `{a=show:screen}...{/a}` | Hyperlink that shows a screen | `"{a=show:inventory}check items{/a}"` |
| `{image=file}` | Inline image | `"I love you! {image=heart.png}"` |

### Ruby Text (Furigana)

For CJK readings or annotations above base text:

```renpy
# Tag syntax
"東{rt}とう{/rt}京{rt}きょう{/rt}"

# Base text wrapper (for styling)
"{rb}東京{/rb}{rt}Tokyo{/rt}"

# Lenticular bracket shorthand
"【東京｜とうきょう】"
```

### Accessibility Tags

| Tag | Effect |
|-----|--------|
| `{alt}...{/alt}` | Text-to-speech only (not displayed visually) |
| `{noalt}...{/noalt}` | Excluded from text-to-speech |
| `{#identifier}` | Translation identifier (ignored at runtime) |

---

## Paged Rollback

By default, rollback in NVL mode goes line-by-line. Enable page-level rollback for a more book-like feel:

```renpy
init python:
    config.nvl_paged_rollback = True
```

With this enabled, pressing rollback returns to the previous `nvl clear` point rather than the previous individual line.

---

## NVL Screen Customization

The NVL window is rendered by the `nvl` screen defined in `screens.rpy`. Override it for custom layouts:

```renpy
screen nvl(dialogue, items=None):
    window:
        style "nvl_window"

        has vbox:
            spacing gui.nvl_spacing

        # Render each dialogue entry
        for d in dialogue:
            frame:
                style "nvl_entry"

                if d.who is not None:
                    text d.who:
                        id "who"

                text d.what:
                    id "what"

        # Render menu choices if present
        if items:
            vbox:
                for i in items:
                    textbutton i.caption:
                        action i.action
                        style "nvl_button"

    add SideImage() xalign 0.0 yalign 1.0
```

The `dialogue` parameter is a list of objects with `.who` (speaker name or `None`) and `.what` (dialogue text) attributes.

---

## Common Pitfalls

**Forgetting `nvl clear` before ADV.** If NVL text is on screen when an ADV character speaks, it looks broken. Always clear before mode switches.

**Text overflow.** Without `nvl clear` or `config.nvl_list_length`, long scenes push text off the bottom of the screen. Test your longest scenes.

**`{p}` vs `{w}` confusion.** `{p}` creates a visual paragraph break (newline). `{w}` pauses in-place without a break. Both wait for a click by default; both accept a time parameter for auto-advance.

**`{fast}` placement.** `{fast}` makes everything *before* it display instantly. Place it where you want the typewriter effect to begin, not where you want it to end.

**CTC in NVL vs ADV.** The character's `ctc` parameter handles mid-dialogue CTC. For end-of-page CTC in NVL, use `config.nvl_page_ctc` — they're separate settings.
