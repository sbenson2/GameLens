# ATL: Animation and Transformation Language

> **Category:** guide · **Engine:** Ren'Py · **Related:** [Screenplay Scripting](../architecture/screenplay-scripting.md), [Audio and Transitions](audio-and-transitions.md), [GUI Customization](gui-customization.md)

ATL is Ren'Py's built-in language for animating and positioning displayables — images, characters, UI elements, and anything else on screen. It handles position, rotation, zoom, opacity, and timing without writing Python. This guide covers the syntax, common patterns, and how ATL interacts with Python code.

## Where ATL Lives

ATL blocks appear in three places:

1. **`transform` statements** — reusable named transforms, defined at the top level of `.rpy` files.
2. **Inline `at` clauses** — applied to `show` and `scene` statements.
3. **`image` statements** — embedded animation when defining an image.

```renpy
# 1. Named transform
transform slide_in_left:
    xpos -0.5
    linear 0.5 xpos 0.0

# 2. Inline use
show eileen happy at slide_in_left

# 3. Image-embedded ATL
image logo animated:
    "logo_frame1.png"
    pause 0.3
    "logo_frame2.png"
    pause 0.3
    repeat
```

## Core Transform Properties

ATL can set any transform property. The most common:

| Property | Type | What it controls |
|----------|------|-----------------|
| `xpos`, `ypos` | float/int | Position (0.0–1.0 = fraction of screen, or pixels) |
| `xanchor`, `yanchor` | float/int | Anchor point within the displayable |
| `xalign`, `yalign` | float | Shorthand — sets both pos and anchor to the same value |
| `alpha` | float | Opacity (0.0 = invisible, 1.0 = fully visible) |
| `zoom` | float | Uniform scale (1.0 = original size) |
| `xzoom`, `yzoom` | float | Independent horizontal/vertical scale |
| `rotate` | float | Clockwise rotation in degrees |
| `crop` | tuple | Crop region `(x, y, width, height)` |

Setting a property without a warper applies it **instantly**:

```renpy
transform center_fade_in:
    xalign 0.5
    yalign 0.5
    alpha 0.0
```

## Warpers (Timing Functions)

Warpers interpolate a property from its current value to a target over a duration. Ren'Py includes several built-in warpers:

| Warper | Behavior |
|--------|----------|
| `linear` | Constant speed from start to end |
| `ease` | Slow start and end, fast middle (cosine curve) |
| `easein` | Slow start, fast end |
| `easeout` | Fast start, slow end |
| `pause` | Hold current state for the given duration |

Syntax: `warper duration property value [property value ...]`

```renpy
transform entrance:
    xpos -300          # Start off-screen left (instant)
    alpha 0.0
    ease 1.0 xpos 200 alpha 1.0   # Ease in over 1 second
```

Multiple properties on the same warper line animate simultaneously with the same timing.

## Sequential and Parallel Blocks

By default, ATL statements execute **sequentially** — each line waits for the previous one to finish.

```renpy
transform sequential_demo:
    linear 0.5 xpos 300    # First: move right
    linear 0.5 ypos 400    # Then: move down
    linear 0.5 alpha 0.0   # Then: fade out
```

Use `parallel` to run multiple animations **at the same time**:

```renpy
transform entrance_with_fade:
    parallel:
        linear 1.0 xpos 400
    parallel:
        ease 0.5 alpha 1.0
```

Each `parallel` block runs independently. The overall block finishes when the **longest** parallel completes.

> **Important:** Only one parallel block should control horizontal position, and only one should control vertical position. If two blocks both set `xpos`, the result is undefined.

## Repeat and Looping

`repeat` at the end of a block restarts it indefinitely. `repeat N` repeats N times total.

```renpy
# Pulsing glow effect
transform pulse:
    alpha 1.0
    ease 0.8 alpha 0.4
    ease 0.8 alpha 1.0
    repeat

# Bob up and down 3 times, then stop
transform bob_three:
    yoffset 0
    ease 0.4 yoffset -10
    ease 0.4 yoffset 0
    repeat 3
```

## Events

ATL blocks can respond to events using the `on` statement. Common events:

| Event | When it fires |
|-------|--------------|
| `show` | Displayable is first shown |
| `hide` | Displayable is hidden (via `hide` statement) |
| `replace` | Displayable replaces another with the same tag |
| `replaced` | This displayable is being replaced by another |
| `hover` | Mouse enters a button/imagebutton |
| `idle` | Mouse leaves a button/imagebutton |

```renpy
transform character_anim:
    on show:
        alpha 0.0
        linear 0.3 alpha 1.0
    on hide:
        linear 0.3 alpha 0.0
    on replace:
        # Cross-fade when changing expression
        alpha 0.5
        linear 0.2 alpha 1.0
```

## Composing Transforms

Apply multiple transforms with comma separation:

```renpy
show eileen happy at center, slow_fade_in
```

Transforms are applied left-to-right. Later transforms override properties set by earlier ones.

You can also nest transforms using `contains`:

```renpy
transform framed_bounce:
    contains:
        "frame.png"
    contains:
        "character.png"
        yoffset 0
        ease 0.3 yoffset -20
        ease 0.3 yoffset 0
        repeat
```

## Frame-Based Animation

ATL can flip through images for sprite-sheet style animation:

```renpy
image flame:
    "flame_01.png"
    pause 0.08
    "flame_02.png"
    pause 0.08
    "flame_03.png"
    pause 0.08
    "flame_04.png"
    pause 0.08
    repeat
```

Each image name is a displayable. `pause` holds the current frame. `repeat` loops the sequence.

## Using ATL from Python

You can create ATL transforms in Python using `Transform` and `renpy.atl`:

```python
# In a python block or .rpy init python
init python:
    def shake_transform(intensity=10, duration=0.5):
        """Create a screen-shake transform dynamically."""
        return Transform(
            child=None,  # Applied to whatever it wraps
            xoffset=0,
            yoffset=0,
        )
```

More commonly, you call ATL transforms from Python with `renpy.show()`:

```python
# Show a character with a named ATL transform
$ renpy.show("eileen happy", at_list=[slide_in_left])
```

Or trigger transforms dynamically:

```renpy
# In Ren'Py script
$ my_alpha = 0.5
show eileen happy:
    alpha my_alpha  # Python variable used in ATL
```

## Practical Patterns

### Character Entrance (Visual Novel)

```renpy
transform enter_left:
    xalign -0.2
    alpha 0.0
    easein 0.4 xalign 0.2 alpha 1.0

transform enter_right:
    xalign 1.2
    alpha 0.0
    easein 0.4 xalign 0.8 alpha 1.0

label start:
    show alice at enter_left
    show bob at enter_right
    alice "We meet again."
```

### Attention Shake

```renpy
transform attention_shake:
    xoffset 0
    linear 0.04 xoffset 8
    linear 0.04 xoffset -8
    linear 0.04 xoffset 6
    linear 0.04 xoffset -6
    linear 0.04 xoffset 3
    linear 0.04 xoffset -3
    linear 0.04 xoffset 0
```

### Breathing Idle Animation

```renpy
transform breathing:
    zoom 1.0
    ease 2.5 zoom 1.015
    ease 2.5 zoom 1.0
    repeat
```

### Choice Button Hover Effect

```renpy
transform choice_hover:
    on idle:
        linear 0.2 xoffset 0
    on hover:
        linear 0.2 xoffset 10
```

## Common Mistakes

**Forgetting that ATL is sequential by default** — If you write two property changes on separate lines without a warper, the second one executes instantly after the first. Use `parallel` when you need simultaneous animation.

**Conflicting parallel blocks** — Two parallel blocks both setting `xpos` will fight each other. Each axis should be controlled by at most one block.

**Missing `repeat`** — Animation plays once and stops. Add `repeat` for looping, or `repeat N` for a fixed number of cycles.

**Using `pause` vs warper duration** — `pause 1.0` holds the current state for 1 second. `linear 1.0 xpos 300` animates over 1 second. They're different tools for different jobs.
