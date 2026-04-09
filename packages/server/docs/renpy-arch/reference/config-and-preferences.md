# Configuration & Preferences Reference

> **Category:** reference · **Engine:** Ren'Py · **Related:** [gui-customization](../guides/gui-customization.md), [save-system-and-persistence](../guides/save-system-and-persistence.md), [distribution-and-localization](distribution-and-localization.md)

Ren'Py's behavior is controlled by two systems: **config variables** (developer settings, set once in `options.rpy`) and **preference variables** (player-facing settings that persist across sessions). Understanding the boundary between them is key to building a polished visual novel.

---

## Config Variables (`config.*`)

Config variables are set in `options.rpy` (or any `init` block) and **cannot be changed after init**. They define the structure and behavior of your game.

### Project Identity

```renpy
# options.rpy — set these for every project
define config.name = "My Visual Novel"
define config.version = "1.2.0"

# Save directory name (unique per game — players lose saves if you change this)
define config.save_directory = "MyVisualNovel-1234"

# Window title (can include version)
define config.window_title = "My Visual Novel v1.2"
```

### Display & Window

```renpy
# Base resolution — Ren'Py scales to fit the player's screen
define config.screen_width = 1920
define config.screen_height = 1080

# Allow window resizing
define config.allow_resize = True

# Enable OpenGL 2 renderer (default on modern Ren'Py 8+)
define config.gl2 = True

# Framerate cap (0 = uncapped, 60 is typical)
define config.framerate = 60
```

### Text & Dialogue

```renpy
# Default text speed (characters per second, 0 = instant)
define config.default_text_cps = 40

# Allow players to dismiss transitions by clicking
define config.allow_skipping = True

# How long "slow" text pause markers ({p}) wait
define config.default_afm_time = 15

# Enable auto-forward mode toggle
define config.default_afm_enable = True
```

### Rollback & History

```renpy
# Number of rollback steps to keep (affects memory)
define config.rollback_length = 128

# Enable dialogue history screen
define config.has_dialogue_history = True

# Maximum history entries shown
define config.history_length = 250
```

### Image & Performance

```renpy
# Image cache size in MB — increase for image-heavy games
define config.image_cache_size_mb = 300

# Predict images N interactions ahead
define config.predict_statements = 32

# Enable image prediction (preloading)
define config.predict_images = True
```

### Save System

```renpy
# Number of save slots
define config.has_quicksave = True
define config.quicksave_slots = 10

# Auto-save on these events
define config.has_autosave = True
define config.autosave_frequency = 200  # Every N interactions

# Screenshots in save files
define config.save_screenshot = True
```

### Developer Mode

```renpy
# Enable developer tools (console, variable viewer, image load log)
define config.developer = True  # Set to False for release builds

# Enable console (~) in developer mode
define config.console = True
```

---

## Preference Variables (`preferences.*`)

Preference variables are **player-controlled** and persist in `persistent` storage. Set their defaults with `default`, not `define`:

### Audio

```renpy
# Volume defaults (0.0 to 1.0)
default preferences.music_volume = 0.8
default preferences.sfm_volume = 0.8
default preferences.voice_volume = 0.8

# Master volume — if supported, scales all channels
default preferences.main_volume = 1.0

# Mute toggles
default preferences.music_mute = False
default preferences.sfx_mute = False
```

### Display

```renpy
# Fullscreen vs windowed
default preferences.fullscreen = False

# Text display speed (characters per second, overrides config.default_text_cps)
default preferences.text_cps = 40

# Auto-forward time (seconds to wait after text finishes)
default preferences.afm_time = 15

# Skip mode — "seen" (only read text) or "all" (everything)
default preferences.skip_unseen = False

# Continue skipping after choices
default preferences.skip_after_choices = False
```

### Accessibility

```renpy
# Self-voicing mode (screen reader)
default preferences.self_voicing = False

# Font transform for readability
default preferences.font_transform = None  # or "opendyslexic"

# High contrast mode
default preferences.high_contrast = False

# Font scaling (Ren'Py 8+)
default preferences.font_size = 1.0  # Multiplier
```

---

## Accessing Config and Preferences in Code

### Reading Values

```renpy
# In a label
label check_settings:
    if preferences.fullscreen:
        "You're in fullscreen mode."
    else:
        "You're in windowed mode."

    "Text speed is [preferences.text_cps] characters per second."
```

```renpy
# In Python
init python:
    def get_cache_info():
        return "Cache: {} MB".format(config.image_cache_size_mb)
```

### Setting Preferences in Screens

Preferences are typically controlled through the preferences screen using actions:

```renpy
screen preferences():
    vbox:
        # Volume slider
        label "Music Volume"
        bar value Preference("music volume")

        # Fullscreen toggle
        textbutton "Fullscreen" action Preference("display", "fullscreen")
        textbutton "Windowed" action Preference("display", "window")

        # Text speed slider
        label "Text Speed"
        bar value Preference("text speed")

        # Skip mode
        textbutton "Skip Unseen" action Preference("skip", "toggle")
```

The `Preference()` action is the recommended way to wire up UI controls — it handles persistence automatically.

---

## Custom Config Variables

You can define your own config-like variables for game-specific settings:

```renpy
# In options.rpy — developer-side config
define myconfig.enable_commentary = True
define myconfig.debug_hitboxes = False
define myconfig.max_party_size = 4
```

For player-facing custom settings that should persist, use `persistent`:

```renpy
# Default for a custom persistent setting
default persistent.colorblind_mode = False

screen accessibility_options():
    vbox:
        textbutton "Colorblind Mode: {}" .format("ON" if persistent.colorblind_mode else "OFF"):
            action ToggleVariable("persistent.colorblind_mode")
```

---

## Common Pitfalls

**Changing `config.save_directory` after release** loses all player saves. Choose a unique, stable name before your first public build and never change it.

**Setting `config.developer = True` in a release build** gives players access to the console, variable viewer, and image loading tools. Always gate this:

```renpy
define config.developer = False  # or use build-time flags
```

**Forgetting `default` for preferences** — using `define` for a preference makes it a constant. The player can change it in the UI, but it resets every launch. Use `default` so the value persists.

**`config.framerate` too low for ATL animations** — if you set framerate to 30 but your ATL animation expects 60fps timing, motion will appear choppy. Match your animation design to your framerate cap.

**Image cache too small for large backgrounds** — if players see loading hitches during scene transitions, increase `config.image_cache_size_mb`. Monitor with `config.developer = True` and the image load log.
