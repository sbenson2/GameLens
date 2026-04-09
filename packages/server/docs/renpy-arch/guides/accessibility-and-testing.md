# Accessibility & Testing

> **Category:** guide · **Engine:** Ren'Py · **Related:** [screenplay-scripting](../architecture/screenplay-scripting.md), [gui-customization](gui-customization.md), [screen-language-and-actions](screen-language-and-actions.md)

Ren'Py has built-in accessibility features that make visual novels playable for vision-impaired, motor-impaired, and hearing-impaired players — often with zero extra code. This guide covers self-voicing, alt text, accessibility configuration, and the full suite of developer/testing tools.

---

## Self-Voicing Mode

Ren'Py includes a text-to-speech (TTS) system that reads dialogue, menu choices, and UI elements aloud. Players enable it without touching game code.

**Player controls:**

- **`v`** — Toggle self-voicing on/off
- **`Shift+A`** — Open the accessibility menu (voicing, font size, high contrast)
- **`Shift+C`** — Toggle clipboard mode (copies spoken text to clipboard for use with external screen readers)
- **Arrow keys** — Navigate focusable UI elements when self-voicing is active

**How it works:** When self-voicing is active and a displayable is focused, Ren'Py reads its text aloud. When nothing is focused, it reads visible on-screen text — typically dialogue. The system uses platform TTS services:

- **Windows:** Microsoft Speech API (configure via Text to Speech control panel)
- **macOS:** The `say` command (configure via System Settings → Accessibility → Spoken Content)
- **Linux:** `espeak` (must be installed: `sudo apt install espeak`)
- **Mobile/Web:** Platform built-in TTS

No extra code is needed for basic self-voicing to work. Dialogue, character names, and menu choices are read automatically.

---

## Alt Text for Custom Displayables

When your screens use images, icons, or visual indicators that convey meaning, add `alt` text so self-voicing can describe them:

```renpy
# Alt text on a screen element
screen status_bar():
    bar value health:
        alt "Health bar at [value] percent"

    imagebutton auto "save_%s.png":
        action ShowMenu("save")
        alt "Save game"
```

### Alt Text on Characters

Customize how character dialogue is announced:

```renpy
# The character's name prefixes the dialogue in TTS
define narrator = Character(None, what_alt="[text]")
define e = Character("Eileen", what_alt="Eileen says, [text]")

# Internal monologue with different TTS framing
define thought = Character(None, what_italic=True,
    what_alt="I think, [text]")
```

### Descriptive Text (Visual Scene Descriptions)

Use the `alt` statement to add narration that only plays during self-voicing — it does not appear on screen for sighted players:

```renpy
label start:
    scene bg park
    alt "A sunny park with green trees and a wooden bench."

    show eileen happy at center
    alt "Eileen stands in the center, smiling."

    e "What a beautiful day!"
```

The `alt` text is read by TTS when self-voicing is enabled but is completely invisible otherwise. Use it to describe scene transitions, character expressions, and visual storytelling beats.

### Descriptive Text Character

For more control, define a dedicated character for accessibility descriptions:

```renpy
define config.descriptive_text_character = Character(
    "Description",
    what_italic=True
)
```

---

## Accessibility Configuration

These `config` variables tune TTS behavior. Set them in `options.rpy` or an init block:

```renpy
init python:
    # Select a specific TTS voice (platform-dependent)
    # On Windows: voice name from Speech settings
    # On macOS: voice name from 'say -v ?' output
    config.tts_voice = None  # None = system default

    # Pronunciation substitutions — fix mispronounced words
    config.tts_substitutions = [
        ("Eileen", "Eye-leen"),
        ("RPG", "R P G"),
        ("HP", "health points"),
    ]
```

### High Contrast and Font Scaling

The built-in accessibility menu (`Shift+A`) lets players:

- Increase font size
- Enable high-contrast text (white on black background)
- Enable self-voicing or clipboard mode

These work automatically with standard Ren'Py screens. If you build custom screens, test them with these modes enabled to ensure readability.

---

## Accessibility Best Practices

**Do:**

- Test your entire game with self-voicing enabled (`v` key) — listen for missing descriptions, garbled text, or silent screens.
- Add `alt` text to all imagebuttons, bars, and custom displayables that convey information.
- Use `alt` statements before or after `show`/`scene` commands to describe visual changes.
- Provide keyboard navigation for all interactive elements (Ren'Py does this by default for standard screens).
- Include TTS pronunciation fixes for character names and game-specific terms.

**Don't:**

- Rely solely on color to convey meaning (e.g., red = bad, green = good). Add text labels.
- Use rapid flashing or strobing effects without a toggle.
- Make critical gameplay information visible only in images with no text equivalent.
- Override keyboard focus behavior in custom screens unless you maintain full arrow-key navigation.

---

## Developer Mode & Debug Tools

Enable developer mode to access Ren'Py's debugging toolkit:

```renpy
# In options.rpy — disable before release!
define config.developer = True
```

### Keyboard Shortcuts (Developer Mode)

| Shortcut | Tool | Purpose |
|----------|------|---------|
| `Shift+D` | Developer Menu | Central access to all dev tools |
| `Shift+O` | Debug Console | Run Ren'Py script and Python interactively |
| `Shift+R` | Script Reload | Hot-reload scripts without restarting |
| `Shift+I` | Style Inspector | Show displayable hierarchy under cursor |
| `Shift+E` | Editor Jump | Open current script line in your editor |
| `>` | Fast Skip | Skip to next menu/interaction instantly |
| `Shift+Alt+V` | Voice Debug | Show TTS text on screen (for testing alt text) |

### Debug Console (`Shift+O`)

The console lets you inspect and modify game state at runtime:

```
# Jump to a specific label
>>> jump chapter_2

# Check a variable's value
>>> affection
42

# Modify state on the fly
>>> affection = 100

# Watch an expression (displays in corner)
>>> watch affection
>>> watch len(inventory)

# Unwatch
>>> unwatch affection

# View the call/return stack
>>> stack

# Save and load within the console
>>> save test_slot
>>> load test_slot
```

### Style Inspector (`Shift+I`)

Hover over any element and press `Shift+I` to see its displayable type, style name, and rendered dimensions. Click a style name to view the full inheritance chain — invaluable for debugging GUI customization issues.

---

## Lint (Script Checking)

Run lint from the Ren'Py Launcher ("Check Script (Lint)") or the command line:

```bash
# From terminal
./renpy.sh my_project lint

# On Windows
renpy.exe my_project lint
```

Lint checks for:

- Undefined labels, images, and characters
- Unreachable code paths
- Missing image files referenced in `show`/`scene` statements
- Obsolete or incorrect syntax
- Statistics: total dialogue words, image count, defined characters

**Run lint before every release.** It catches bugs that playtesting can miss, like a `jump` to a label that was renamed.

---

## Warp-to-Line (Skip to Any Point)

Test a specific scene without playing through the entire game:

```bash
# Jump directly to line 458 of script.rpy
./renpy.sh my_project --warp script.rpy:458
```

The warp system traces the path from `start` to the target line and initializes variables as if the game had been played normally. Define an `after_warp` label to set up anything the automatic trace misses:

```renpy
label after_warp:
    # Ensure variables exist after warping
    if not hasattr(store, 'affection'):
        $ affection = 0
    if not hasattr(store, 'inventory'):
        $ inventory = []
    return
```

---

## Automated Testing

### Test Cases (testcase statement)

Ren'Py supports automated test scripts that simulate player actions:

```renpy
# game/test_playthrough.rpy
testcase full_playthrough:
    # Click through dialogue
    "click"
    "click"
    "click"
    # Select a menu choice by text
    "choice" "Go to the park"
    "click"
    "click"
    # Select by index (1-based)
    "choice" 1
    "click"
```

Run test cases from the command line:

```bash
./renpy.sh my_project --test full_playthrough
```

### CI/CD with Lint

Add lint to your CI pipeline to catch script errors on every commit:

```yaml
# .github/workflows/lint.yml
name: Ren'Py Lint
on: [push, pull_request]
jobs:
  lint:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Lint Ren'Py Project
        uses: stscoundrel/renpy-lint-action@v1
        with:
          sdk-version: "8.3.0"
          project-dir: "."
```

### Manual Testing Strategy

Automated tests catch syntax and path errors, but visual novels need human testing too. A practical testing checklist:

1. **Lint pass** — Zero errors before any playtest.
2. **Fast-skip full paths** — Use `>` to race through every branch. Watch for crashes, not content.
3. **Variable spot-checks** — Use the debug console (`Shift+O`) to verify key variables at decision points.
4. **Self-voicing playthrough** — Play at least one path entirely with `v` enabled. Listen for missing alt text or confusing announcements.
5. **Save/load at every scene transition** — Verify saves restore correctly. Ren'Py handles this automatically, but custom Python state can break it.
6. **Platform builds** — Test the actual distributed build (from "Build Distributions" in the Launcher) on each target OS.
