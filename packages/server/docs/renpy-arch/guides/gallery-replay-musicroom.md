# Gallery, Replay, and Music Room Systems

> **Category:** guide · **Engine:** Ren'Py · **Related:** [screen-language-and-actions.md](screen-language-and-actions.md), [../architecture/screenplay-scripting.md](../architecture/screenplay-scripting.md), [save-system-and-persistence.md](save-system-and-persistence.md)

How to implement unlockable CG galleries, scene replay systems, and music rooms in Ren'Py — covering the built-in `Gallery`, `MusicRoom`, and `Replay` APIs, screen integration, and common customisation patterns.

---

## Gallery (CG Viewer)

Ren'Py's `Gallery` class manages unlockable images organised hierarchically: a gallery contains **buttons**, each button contains one or more **images**, and each image has **unlock conditions**.

### Basic Setup

Define the gallery in an `init python` block so it exists before any screen renders:

```renpy
init python:

    g = Gallery()

    # Configuration
    g.locked_button = "gui/gallery_locked.png"   # shown for locked buttons
    g.navigation = True                           # on-screen prev/next arrows
    g.transition = dissolve                       # transition between images

    # --- Button: always unlocked (title art) ---
    g.button("title_art")
    g.image("cg title_screen")

    # --- Button: unlocks when the player has seen the image ---
    g.button("sunset_scene")
    g.unlock_image("cg sunset")                   # shorthand for image() + unlock()

    # --- Button: multiple images, shown as a slideshow ---
    g.button("beach_sequence")
    g.unlock_image("cg beach_day")
    g.unlock_image("cg beach_night")

    # --- Button: conditional unlock (requires a flag) ---
    g.button("true_ending")
    g.condition("persistent.true_end_seen")       # Python expression
    g.image("cg true_ending_1")
    g.image("cg true_ending_2")
```

**How unlock tracking works:** `g.unlock_image("cg sunset")` unlocks when the player has *seen* the displayable `"cg sunset"` during normal gameplay. Ren'Py tracks seen images automatically via its internal rollback log — no manual flag-setting needed.

`g.condition(expr)` adds an arbitrary Python condition. Multiple conditions on the same button are AND-ed together.

### Key Gallery Properties

| Property | Default | Purpose |
|----------|---------|---------|
| `locked_button` | `None` | Displayable shown for locked buttons |
| `navigation` | `True` | Show on-screen forward/back arrows |
| `span_buttons` | `False` | Allow Next/Previous to cross button boundaries |
| `slideshow_delay` | `0` | Seconds between auto-advance (0 = off) |
| `enter_transition` | `None` | Transition when first image appears |
| `intra_transition` | `None` | Transition between images in same button |
| `exit_transition` | `None` | Transition when returning to gallery screen |
| `unlocked_advance` | `True` | Skip locked images when advancing |

### Gallery Actions for Screens

Use these in `textbutton` or `imagebutton` actions:

```renpy
screen gallery_screen():
    tag menu

    grid 3 3:
        for name in ["title_art", "sunset_scene", "beach_sequence",
                      "true_ending", "bonus_1", "bonus_2",
                      "bonus_3", "bonus_4", "bonus_5"]:
            add g.make_button(
                name,
                unlocked="gui/gallery_%s.png" % name,
                locked="gui/gallery_locked.png",
                hover_border="gui/gallery_hover.png",
            )

    textbutton "Return" action Return()
```

`g.make_button(name, unlocked, locked, ...)` returns a displayable that is sensitive when unlocked, insensitive when locked. Clicking it triggers `Gallery.Action(name)` internally, displaying the associated images.

**Manual button wiring** (if you want full layout control):

```renpy
screen gallery_screen():
    tag menu
    vbox:
        textbutton "Sunset Scene" action g.Action("sunset_scene")
        textbutton "Beach Sequence" action g.Action("beach_sequence")
        textbutton "Return" action Return()
```

### Applying Transforms

Use `g.transform()` right after `g.image()` or `g.unlock_image()` to apply a pan, zoom, or custom ATL transform:

```renpy
init python:
    # Slow horizontal pan for a wide CG
    def slowpan(trans, st, at):
        trans.xanchor = st / 10.0  # scroll over 10 seconds
        return 0

    g.button("panorama")
    g.unlock_image("cg wide_landscape")
    g.transform(slowpan)
```

---

## Music Room

`MusicRoom` provides an unlockable jukebox — tracks unlock as the player hears them during the game.

### Setup

```renpy
init python:

    mr = MusicRoom(fadeout=1.0, fadein=0.5)

    # Always available
    mr.add("audio/main_theme.ogg", always_unlocked=True)

    # Unlock after the player hears them in-game
    mr.add("audio/tension.ogg")
    mr.add("audio/credits_song.ogg")
    mr.add("audio/secret_track.ogg")
```

### Music Room Screen

```renpy
screen music_room():
    tag menu

    vbox:
        # Track buttons — insensitive when locked, selected when playing
        for track in ["audio/main_theme.ogg", "audio/tension.ogg",
                       "audio/credits_song.ogg", "audio/secret_track.ogg"]:
            $ label = track.split("/")[-1].replace(".ogg", "").replace("_", " ").title()
            textbutton label action mr.Play(track)

        null height 20

        hbox:
            textbutton "Previous" action mr.Previous()
            textbutton "Next" action mr.Next()
            textbutton "Stop" action mr.Stop()

        hbox:
            textbutton "Loop" action mr.ToggleLoop()
            textbutton "Shuffle" action mr.ToggleShuffle()

    # Start playing the first unlocked track on screen entry
    on "replace" action mr.Play()
    on "show" action mr.Play()

    textbutton "Return" action Return()
```

### MusicRoom Actions Reference

| Action | Behaviour |
|--------|-----------|
| `mr.Play(filename)` | Play specific track (insensitive if locked) |
| `mr.Play()` | Play first unlocked track |
| `mr.Next()` / `mr.Previous()` | Navigate unlocked tracks |
| `mr.RandomPlay()` | Play a random unlocked track |
| `mr.Stop()` | Stop playback |
| `mr.TogglePlay()` | Toggle play/stop |
| `mr.TogglePause()` | Toggle pause/resume |
| `mr.ToggleLoop()` | Toggle loop mode |
| `mr.ToggleShuffle()` | Toggle shuffle mode |
| `mr.ToggleSingleTrack()` | Toggle single-track repeat |

**Checking unlock status in code:** `mr.is_unlocked("audio/tension.ogg")` returns `True`/`False`.

---

## Scene Replay

The Replay system lets players re-watch labelled sequences from the extras menu without affecting their save game.

### Marking Replayable Scenes

End each replayable scene with `$ renpy.end_replay()`. During normal play this is a no-op; during replay it returns the player to the replay menu.

```renpy
label confession_scene:
    scene bg park_night
    show character_a happy at left
    show character_b nervous at right

    a "I need to tell you something."
    b "What is it?"
    a "I really like you."

    # Replay boundary — must be BEFORE the scene transitions elsewhere
    $ renpy.end_replay()

    # Normal game continues here (skipped during replay)
    jump chapter_3
```

### Replay Screen Integration

```renpy
screen replay_screen():
    tag menu

    vbox:
        textbutton "Confession Scene" action Replay("confession_scene")
        textbutton "Final Battle" action Replay("final_battle")
        textbutton "Secret Ending" action Replay("secret_ending", locked=True)

    textbutton "Return" action Return()
```

**Unlock behaviour:** By default, `Replay(label)` is insensitive until the player has *reached* that label in a playthrough. Pass `locked=False` to make it always available, or `locked=True` to always lock it (useful for debug or conditional unlocking).

### Passing State into Replays

Replays start with a blank store. If the scene reads variables (e.g., character name), pass them via `scope`:

```renpy
textbutton "Confession" action Replay("confession_scene", scope={"player_name": "Alex"})
```

### Detecting Replay Mode

The store variable `_in_replay` is set to the label name during replay, or `None` otherwise:

```renpy
label some_scene:
    if _in_replay:
        "( Replaying this scene )"
    # ... scene content ...
```

**Important constraints during replay:** Saving and loading are disabled. The game returns to the calling screen when `renpy.end_replay()` is reached or the player clicks "Return" in the game menu.

---

## Putting It All Together: Extras Menu

A common pattern combines all three systems behind a single "Extras" menu accessible from the main menu:

```renpy
screen extras_menu():
    tag menu

    vbox:
        textbutton "CG Gallery" action ShowMenu("gallery_screen")
        textbutton "Scene Replay" action ShowMenu("replay_screen")
        textbutton "Music Room" action ShowMenu("music_room")
        textbutton "Return" action Return()

screen navigation():
    # Add to your main menu navigation
    vbox:
        # ... existing buttons ...
        textbutton "Extras" action ShowMenu("extras_menu")
```

### Achievement-Style Unlock Tracking

Ren'Py has no built-in achievement class, but `persistent` variables combined with Gallery conditions give you the same result:

```renpy
init python:

    # Define achievements as persistent flags
    if persistent.achievements is None:
        persistent.achievements = {}

    def unlock_achievement(name):
        if name not in persistent.achievements:
            persistent.achievements[name] = True
            renpy.notify("Achievement unlocked: %s" % name)

# In-game usage:
label true_ending:
    "You found the true ending!"
    $ unlock_achievement("True Ending")

# In gallery setup:
init python:
    g.button("true_ending_cg")
    g.condition("persistent.achievements.get('True Ending', False)")
    g.image("cg true_ending")
```

### Completion Percentage

```renpy
init python:
    def gallery_completion():
        """Returns (unlocked, total) counts."""
        # Gallery buttons are tracked internally — count via make_button sensitivity
        total = 0
        unlocked = 0
        for name in gallery_button_names:
            total += 1
            # A button is 'unlocked' if its conditions pass
            if g.make_button(name, "x", "y").is_sensitive():
                unlocked += 1
        return unlocked, total
```

A simpler approach: track a `persistent.cg_seen` set and add to it whenever a CG is shown:

```renpy
init python:
    if persistent.cgs_seen is None:
        persistent.cgs_seen = set()
    ALL_CGS = {"sunset", "beach_day", "beach_night", "true_ending_1", "true_ending_2"}

label show_cg(cg_name):
    $ persistent.cgs_seen.add(cg_name)
    show expression "cg " + cg_name
    return

screen gallery_screen():
    # ...
    text "Gallery: %d/%d" % (len(persistent.cgs_seen & ALL_CGS), len(ALL_CGS))
```

---

## Common Pitfalls

- **Forgetting `renpy.end_replay()`:** Without it, replays run past the intended scene boundary into the next label. Always place it before any `jump` or `return` that leaves the scene.
- **Unlock conditions referencing non-persistent data:** Gallery and replay unlock checks run at screen display time. Use `persistent.*` for anything that must survive across sessions.
- **Music room tracks not unlocking:** Tracks only unlock when played via `renpy.music.play()` during normal gameplay. Background music set in `define config.main_menu_music` does not count.
- **Gallery buttons showing as locked after clearing persistent data:** `persistent._seen_images` is what Gallery checks internally. Clearing all persistent data resets unlock progress.
