# Audio System & Transitions

> **Category:** guide · **Engine:** Ren'Py · **Related:** [screenplay-scripting](../architecture/screenplay-scripting.md), [gui-customization](gui-customization.md)

Ren'Py provides a channel-based audio system for music, sound effects, and voice, plus a rich transition system (including the Animation and Transformation Language) for visual effects between scenes. Both systems are deeply integrated with the scripting layer and participate in rollback.

## Audio Channels

Ren'Py has three built-in audio channels, each with its own volume slider in preferences:

| Channel | Purpose | Default Behavior |
|---------|---------|-----------------|
| `music` | Background music | Loops, fades between tracks |
| `sound` | Sound effects | Plays once, no loop |
| `voice` | Character voice lines | Plays once, auto-stops on next voice line or interaction |

### Playing Music

```renpy
# Start BGM with a 1-second crossfade from the current track
play music "audio/bgm_forest.ogg" fadeout 1.0 fadein 1.0

# Queue a track to play after the current one finishes
queue music "audio/bgm_battle.ogg"

# Stop music with a 2-second fadeout
stop music fadeout 2.0
```

Music loops by default. To play a track once:

```renpy
play music "audio/bgm_credits.ogg" noloop
```

### Intro-to-Loop Pattern

Many game soundtracks have a one-shot intro followed by a looping body. Ren'Py handles this natively:

```renpy
play music ["audio/bgm_boss_intro.ogg", "audio/bgm_boss_loop.ogg"]
```

The first file plays once, then the second loops indefinitely.

### Sound Effects

```renpy
play sound "audio/sfx_door_open.ogg"

# Play without waiting for completion
play sound "audio/sfx_explosion.ogg"

# Layered: play on a custom channel
define config.auto_channels = {"ambient": {"mixer": "sfx", "file_prefix": "audio/ambient_"}}

play ambient "rain.ogg"  # plays audio/ambient_rain.ogg
```

### Voice

```renpy
voice "audio/voice/ch1_line042.ogg"
e "Welcome to the forest."
```

The voice line auto-stops when the player advances dialogue. Ren'Py also supports automatic voice mapping via `config.auto_voice`:

```renpy
define config.auto_voice = "audio/voice/{id}.ogg"
```

This maps each `say` statement to a voice file based on its dialogue identifier, eliminating the need for explicit `voice` statements.

### Custom Channels

Register additional channels for layered audio (ambient, UI sounds, etc.):

```python
init python:
    renpy.music.register_channel("ambient", mixer="sfx", loop=True)
    renpy.music.register_channel("ui", mixer="sfx", loop=False)
```

Then use them like built-in channels:

```renpy
play ambient "audio/ambient_forest.ogg" fadein 2.0
play ui "audio/ui_click.ogg"
```

### Volume Control

Ren'Py exposes three mixer volumes (music, sfx, voice) in preferences. You can also set per-channel volume in script:

```python
$ renpy.music.set_volume(0.5, channel="ambient")
```

Or adjust from a screen using `SetMixer`:

```renpy
screen preferences():
    bar value MixerValue("music")
    bar value MixerValue("sfx")
    bar value MixerValue("voice")
```

### Audio Formats

Ren'Py supports Opus, Ogg Vorbis, MP3, and WAV. **Ogg Vorbis** is recommended for music and sound effects — it's well-compressed, loops cleanly, and avoids MP3 licensing concerns. WAV is suitable for very short UI clicks where decode latency matters.

## Transitions

Transitions control how Ren'Py moves from one visual state to another — changing scenes, showing/hiding characters, or swapping backgrounds.

### Built-in Transitions

```renpy
# Dissolve (crossfade) over 0.5 seconds
scene bg_castle with dissolve

# Fade to black and back
scene bg_night with fade

# Slide direction
show eileen happy at right with moveinright

# Pixellate
scene bg_dream with pixellate

# Iris (circular wipe)
scene bg_cave with irisin

# No transition (instant cut)
scene bg_office with None
```

Common built-ins: `dissolve`, `fade`, `pixellate`, `vpunch`, `hpunch`, `irisin`, `irisout`, `wipeleft`, `wiperight`, `wipeup`, `wipedown`, `moveinleft`, `moveinright`, `moveoutleft`, `moveoutright`, `zoomin`, `zoomout`, `zoominout`.

### Custom Dissolves and Fades

```renpy
define slow_dissolve = Dissolve(1.5)
define dramatic_fade = Fade(0.5, 1.0, 0.5)  # fade-out, hold black, fade-in

scene bg_ruins with slow_dissolve
scene bg_throne with dramatic_fade
```

### Image Dissolve (Custom Wipe Patterns)

Use a grayscale image as a mask to control dissolve order:

```renpy
define curtain_close = ImageDissolve("images/masks/curtain.png", 1.5)
scene bg_theater with curtain_close
```

Lighter pixels in the mask dissolve first; darker pixels dissolve last.

## ATL (Animation and Transformation Language)

ATL is Ren'Py's declarative animation system. It handles movement, scaling, rotation, transparency, and more — all with automatic interpolation.

### Basic Transforms

```renpy
transform slide_in_left:
    xalign 0.0 alpha 0.0
    linear 0.5 xalign 0.3 alpha 1.0

show eileen happy at slide_in_left
```

### ATL Properties

Key properties you can animate:

| Property | Description |
|----------|-------------|
| `xpos`, `ypos` | Pixel position |
| `xalign`, `yalign` | Relative position (0.0 = left/top, 1.0 = right/bottom) |
| `xanchor`, `yanchor` | Anchor point on the image |
| `zoom` | Uniform scale (1.0 = normal) |
| `xzoom`, `yzoom` | Axis-specific scale |
| `rotate` | Rotation in degrees |
| `alpha` | Opacity (0.0 = invisible, 1.0 = opaque) |
| `crop` | Crop rectangle `(x, y, w, h)` |

### Interpolation Warps

```renpy
transform bounce_in:
    yalign -0.5
    easein 0.3 yalign 1.0   # ease in (decelerate)
    easeout 0.1 yalign 0.95  # small bounce
    easein 0.1 yalign 1.0
```

Available warps: `linear`, `ease`, `easein`, `easeout`, `easein_back`, `easeout_back`, `easein_bounce`, `easeout_bounce`, `easein_elastic`, `easeout_elastic`.

### Looping and Sequencing

```renpy
transform breathing:
    zoom 1.0
    ease 2.0 zoom 1.02
    ease 2.0 zoom 1.0
    repeat  # loops forever

transform flash_then_idle:
    alpha 0.0
    linear 0.1 alpha 1.0
    pause 0.05
    linear 0.1 alpha 0.0
    pause 0.05
    linear 0.1 alpha 1.0
    # no repeat — stops after one flash cycle
```

### Combining Transforms

Use `at` with multiple transforms or the `contains` block:

```renpy
# Apply multiple transforms
show eileen happy at center, breathing

# Complex composite
transform floating_character:
    contains:
        "eileen happy"
        xalign 0.5 yalign 0.5
    ease 3.0 yoffset -20
    ease 3.0 yoffset 0
    repeat
```

### Parallel Animation

```renpy
transform spin_and_fade:
    parallel:
        linear 1.0 rotate 360
        repeat
    parallel:
        linear 3.0 alpha 0.0
```

### Python-Driven ATL

For dynamic animation, call ATL transforms from Python or use `Function`:

```renpy
transform dynamic_shake(intensity=10):
    xoffset 0 yoffset 0
    function shake_func
    repeat

init python:
    def shake_func(trans, st, at):
        import random
        trans.xoffset = random.randint(-10, 10)
        trans.yoffset = random.randint(-10, 10)
        return 0.03  # call again in 0.03 seconds
```

## Audio + Transition Synchronization

Coordinate audio and visuals for impactful scenes:

```renpy
label explosion_scene:
    play sound "audio/sfx_explosion.ogg"
    show bg_destroyed with vpunch
    with Dissolve(0.3)
    play music "audio/bgm_aftermath.ogg" fadein 2.0
    scene bg_ruins with slow_dissolve
```

## Common Pitfalls

**Forgetting fadeout on music changes.** Without `fadeout`, switching tracks creates a jarring hard cut. Always specify `fadeout` when changing BGM.

**Layering too many channels without mixer assignment.** Custom channels default to the `sfx` mixer. If you want independent volume control, assign them to a custom mixer and expose it in preferences.

**ATL transforms and rollback.** ATL animations reset correctly on rollback because Ren'Py tracks the visual state at each interaction point. However, animations triggered by Python `Function` blocks may not replay identically if they use randomness — seed your RNG with `st` (shown time) for deterministic rollback.

**Large uncompressed audio files.** WAV files for music consume excessive memory. Use Ogg Vorbis for anything longer than a few seconds.
