# Style Properties and Theming

> **Category:** reference · **Engine:** Ren'Py · **Related:** [GUI Customization](../guides/gui-customization.md), [Screen Language and Actions](../guides/screen-language-and-actions.md), [Config and Preferences](config-and-preferences.md)

Ren'Py's style system controls how every displayable looks — text size, button backgrounds, window padding, colors, and more. Styles cascade through inheritance, respond to interaction states, and can be customized via `style` statements in script or `gui.rpy`. This reference covers the property categories, state prefixes, the style inspector, and practical theming patterns.

## Style Basics

A style is a named collection of properties. Every displayable has a style (often inferred from its type). You customize styles with `style` statements in your script files:

```renpy
style my_button:
    idle_background Frame("button_idle.png", 10, 10)
    hover_background Frame("button_hover.png", 10, 10)
    padding (20, 10, 20, 10)

style my_button_text:
    font "DejaVuSans.ttf"
    size 24
    idle_color "#cccccc"
    hover_color "#ffffff"
```

### Style Inheritance

Styles inherit from a parent. If a property isn't set, the parent's value is used:

```renpy
style fancy_button is button:
    # Inherits everything from 'button', overrides background
    background Frame("fancy_bg.png", 12, 12)
```

The default inheritance chain for common displayables:

- `button` → `default`
- `label_text` → `default`
- `say_dialogue` → `default`
- `choice_button` → `button`

## Style Inspector (Shift+I)

The fastest way to find which style controls a displayable:

1. Run your game in developer mode (`config.developer = True`).
2. Hover the mouse over any UI element.
3. Press **Shift+I**.
4. Ren'Py shows a list of displayables under the cursor with their style names.

Once you know the style name (e.g., `say_dialogue`), add a `style` statement to customize it.

## Property Categories

### Position Properties

Control where a displayable is placed within its container.

| Property | Type | Description |
|----------|------|-------------|
| `xpos` | int or float | Horizontal position. Integer = pixels, float = fraction (0.0–1.0). |
| `ypos` | int or float | Vertical position. |
| `xanchor` | int or float | Horizontal anchor point on the displayable itself. |
| `yanchor` | int or float | Vertical anchor point. |
| `xalign` | float | Shorthand — sets both `xpos` and `xanchor` to the same value. |
| `yalign` | float | Shorthand — sets both `ypos` and `yanchor`. |
| `xoffset` | int | Pixel offset added after positioning. |
| `yoffset` | int | Pixel offset added after positioning. |

```renpy
style centered_text:
    xalign 0.5
    yalign 0.5

style nudged_right:
    xalign 0.5
    xoffset 20  # 20 pixels right of center
```

### Size Properties

| Property | Type | Description |
|----------|------|-------------|
| `xminimum` | int | Minimum width in pixels. |
| `yminimum` | int | Minimum height. |
| `xmaximum` | int | Maximum width. |
| `ymaximum` | int | Maximum height. |
| `xfill` | bool | Expand to fill available width. |
| `yfill` | bool | Expand to fill available height. |
| `xsize` | int | Sets both `xminimum` and `xmaximum`. |
| `ysize` | int | Sets both `yminimum` and `ymaximum`. |

### Text Properties

| Property | Type | Description |
|----------|------|-------------|
| `font` | string | Path to a `.ttf` or `.otf` font file. |
| `size` | int | Font size in pixels. |
| `color` | color | Text color (hex `"#rrggbb"` or `"#rrggbbaa"`). |
| `bold` | bool | Bold rendering. |
| `italic` | bool | Italic rendering. |
| `underline` | bool | Underline rendering. |
| `strikethrough` | bool | Strikethrough rendering. |
| `text_align` | float | Alignment of text lines (0.0 = left, 0.5 = center, 1.0 = right). |
| `line_spacing` | int | Extra pixels between lines. |
| `kerning` | float | Extra spacing between characters. |
| `outlines` | list | List of `(size, color, xoffset, yoffset)` tuples for text outlines. |
| `antialias` | bool | Whether to antialias text (default `True`). |

```renpy
style say_dialogue:
    font "fonts/OpenSans-Regular.ttf"
    size 28
    color "#e0e0e0"
    outlines [(2, "#000000", 0, 0)]
    line_spacing 4
```

### Window Properties

Control backgrounds and padding for `window`, `frame`, and `button` displayables.

| Property | Type | Description |
|----------|------|-------------|
| `background` | displayable | Background image/color. Often a `Frame()` for 9-slice scaling. |
| `foreground` | displayable | Drawn on top of children. |
| `left_padding` | int | Space between background's left edge and content. |
| `right_padding` | int | Space on the right. |
| `top_padding` | int | Space on the top. |
| `bottom_padding` | int | Space on the bottom. |
| `padding` | tuple | Shorthand `(left, top, right, bottom)`. |
| `left_margin` | int | Space outside the background's left edge. |
| `margin` | tuple | Shorthand `(left, top, right, bottom)`. |

```renpy
style say_window:
    background Frame("gui/textbox.png", 20, 20, 20, 20)
    padding (30, 10, 30, 10)
    yalign 1.0
    yoffset -20
```

### Box (Layout) Properties

For `hbox` and `vbox` containers.

| Property | Type | Description |
|----------|------|-------------|
| `spacing` | int | Pixels between children. |
| `first_spacing` | int | Spacing before the first child (overrides `spacing`). |
| `box_reverse` | bool | Reverse order of children. |
| `box_wrap` | bool | Wrap children to next line when they overflow. |

## State Prefixes

Buttons and other interactive displayables have multiple states. Prefix any property with a state name to customize that state:

| Prefix | When Active |
|--------|-------------|
| `idle_` | Not focused, not selected. |
| `hover_` | Mouse is over the displayable. |
| `selected_` | Represents a currently-chosen value. |
| `selected_idle_` | Selected but not focused. |
| `selected_hover_` | Selected and focused. |
| `insensitive_` | Cannot be interacted with (greyed out). |

Setting a property without a prefix sets the default for all states. A prefixed value overrides the default.

```renpy
style choice_button:
    # Default background for all states
    background Frame("choice_idle.png", 10, 10)
    # Override just the hover state
    hover_background Frame("choice_hover.png", 10, 10)
    # Greyed-out look for unavailable choices
    insensitive_background Frame("choice_grey.png", 10, 10)

style choice_button_text:
    size 24
    idle_color "#aaaaaa"
    hover_color "#ffffff"
    insensitive_color "#555555"
```

## The `gui` Namespace

Ren'Py's default GUI uses variables in `gui.rpy` that feed into styles. Changing these variables is the easiest way to theme your game:

```renpy
# gui.rpy — change these for a quick retheme
define gui.text_font = "fonts/MyFont.ttf"
define gui.text_size = 26
define gui.text_color = "#d0d0d0"

define gui.accent_color = "#cc6600"
define gui.idle_color = "#888888"
define gui.hover_color = "#ffffff"
define gui.selected_color = "#cc6600"
define gui.insensitive_color = "#4444447f"

define gui.textbox_height = 185
define gui.name_text_size = 30
define gui.dialogue_text_size = 26

define gui.button_text_font = "fonts/MyFont-Bold.ttf"
define gui.button_text_size = 24
```

These variables are referenced by the default style definitions in `screens.rpy`. Change the variables, and the styles update automatically.

## Style Preferences (Player-Adjustable Styles)

Let players customize appearance through the Preferences screen:

```renpy
init python:
    # Register a style preference: "large" or "regular" text
    renpy.register_style_preference(
        "text_size", "large", style.say_dialogue, "size", 34
    )
    renpy.register_style_preference(
        "text_size", "regular", style.say_dialogue, "size", 26
    )

# In a screen, let the player toggle it:
screen preferences():
    vbox:
        label "Text Size"
        textbutton "Regular" action StylePreference("text_size", "regular")
        textbutton "Large" action StylePreference("text_size", "large")
```

## Theming Patterns

### Dark Theme / Light Theme Toggle

```renpy
# Define two sets of gui variables
default persistent.dark_mode = True

init python:
    if persistent.dark_mode:
        gui.text_color = "#d0d0d0"
        gui.accent_color = "#cc6600"
    else:
        gui.text_color = "#333333"
        gui.accent_color = "#0066cc"
```

### Consistent Button Styling

Create a base button style and inherit from it:

```renpy
style game_button is button:
    xsize 300
    ysize 60
    idle_background Frame("gui/button_idle.png", 10, 10)
    hover_background Frame("gui/button_hover.png", 10, 10)
    hover_sound "audio/ui_hover.ogg"
    activate_sound "audio/ui_click.ogg"

style game_button_text is button_text:
    xalign 0.5
    idle_color gui.idle_color
    hover_color gui.hover_color
```

### Using `Frame()` for Scalable Backgrounds

`Frame()` applies 9-slice scaling so backgrounds stretch without distorting corners:

```renpy
# Frame(image, left, top, right, bottom)
# The border values define the non-stretched regions in pixels
style say_window:
    background Frame("gui/textbox.png", 20, 20, 20, 20)
```

If `right` and `bottom` are omitted, they default to the same values as `left` and `top`:

```renpy
# Equivalent shorthand
background Frame("gui/textbox.png", 20, 20)
```

## Common Pitfalls

- **Forgetting the `_text` suffix.** Button text styles use the button's style name plus `_text` — e.g., `choice_button` controls the button container, `choice_button_text` controls the text inside it.
- **Overriding `gui.rpy` in the wrong place.** Put customizations in `gui.rpy` or in an `init` block that runs after `gui.rpy` (use `init offset = 1` or place in a separate file that loads later).
- **Not using `Frame()`.** Assigning a raw image as a background won't scale properly — always wrap resizable backgrounds in `Frame()`.
- **Missing state prefixes.** If your button looks fine idle but wrong on hover, you probably set the base property but not the `hover_` variant (or vice versa).
