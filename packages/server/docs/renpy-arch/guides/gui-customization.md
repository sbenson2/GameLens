# GUI Customization & Screen Language

> **Category:** guide · **Engine:** Ren'Py · **Related:** [screenplay-scripting](../architecture/screenplay-scripting.md), [python-integration](python-integration.md)

Ren'Py's UI system is built on the **screen language** — a declarative DSL for composing interactive interfaces. Every menu, dialogue box, settings panel, and HUD in a Ren'Py game is a screen. Customization happens at three levels: editing `gui.rpy` variables, modifying `screens.rpy` layouts, or building entirely new screens from scratch.

---

## The Three Customization Tiers

### Tier 1: gui.rpy Variables (Easiest)

`gui.rpy` exposes variables that control colors, fonts, sizes, and spacing across all default screens. Changes here cascade globally.

```renpy
## -- gui.rpy --

# Window and dialogue box
define gui.text_color = '#ffffff'
define gui.text_font = "fonts/OpenSans-Regular.ttf"
define gui.text_size = 28
define gui.name_text_size = 36

# Dialogue window
define gui.textbox_height = 278
define gui.textbox_yalign = 1.0

# Navigation buttons (main menu, game menu)
define gui.button_text_font = "fonts/OpenSans-Bold.ttf"
define gui.button_text_size = 24
define gui.button_text_idle_color = '#aaaaaa'
define gui.button_text_hover_color = '#ffffff'
define gui.button_text_selected_color = '#ffffff'

# Choice menus
define gui.choice_button_text_idle_color = '#cccccc'
define gui.choice_button_text_hover_color = '#ffffff'

# Window icon and title
define config.window_title = "My Visual Novel"
define config.window_icon = "gui/window_icon.png"
```

### Tier 2: Modifying screens.rpy (Intermediate)

The default `screens.rpy` defines ~20 screens. You can edit individual screens to change layout, add elements, or restyle:

```renpy
## Customize the say screen (dialogue display)
screen say(who, what):
    style_prefix "say"

    window:
        id "window"

        if who is not None:
            window:
                id "namebox"
                style "namebox"
                text who id "who"

        text what id "what"

    # Add a custom portrait area
    if who is not None:
        add SideImage() xalign 0.0 yalign 1.0
```

### Tier 3: Custom Screens from Scratch (Advanced)

For unique mechanics — inventory systems, minigames, stat screens — write new screens:

```renpy
screen stats_screen():
    tag menu
    modal True

    frame:
        xalign 0.5
        yalign 0.5
        xsize 600
        ysize 400
        padding (30, 30, 30, 30)

        vbox:
            spacing 10
            text "Character Stats" size 32 color "#ffcc00"
            null height 10

            hbox:
                spacing 20
                text "Strength:"
                bar value StaticValue(player_str, 100) xsize 200

            hbox:
                spacing 20
                text "Intelligence:"
                bar value StaticValue(player_int, 100) xsize 200

            null height 20
            textbutton "Close" action Return() xalign 0.5
```

---

## Core Displayables

### Layout Containers

```renpy
# Vertical box — children stack top to bottom
vbox:
    spacing 10  # pixels between children
    text "Line 1"
    text "Line 2"

# Horizontal box — children flow left to right
hbox:
    spacing 15
    textbutton "A" action NullAction()
    textbutton "B" action NullAction()

# Grid — fixed rows × columns
grid 3 2:  # 3 columns, 2 rows
    spacing 5
    # must have exactly 6 children
    text "1"
    text "2"
    text "3"
    text "4"
    text "5"
    text "6"

# Fixed — absolute positioning of children
fixed:
    text "Top-left" xpos 10 ypos 10
    text "Centered" xalign 0.5 yalign 0.5

# Frame — styled container with background
frame:
    background "#333333aa"
    padding (20, 20, 20, 20)
    xsize 400
    vbox:
        text "Content here"
```

### Interactive Elements

```renpy
# Text button
textbutton "Start Game" action Start()

# Image button (different images per state)
imagebutton:
    idle "gui/btn_idle.png"
    hover "gui/btn_hover.png"
    selected_idle "gui/btn_selected.png"
    action Show("settings_screen")

# Bar (for settings like volume)
bar:
    value Preference("music volume")
    xsize 300

# Vertical bar
vbar:
    value ScreenVariableValue("scroll_pos", 1.0)
    ysize 200

# Input field
input:
    default ""
    length 20
    pixel_width 300
```

### Scrollable Content

```renpy
# Viewport with scrollbar
viewport:
    scrollbars "vertical"
    mousewheel True
    xsize 500
    ysize 400

    vbox:
        for i in range(50):
            text "Item [i]"

# Viewport with draggable scrolling
viewport:
    draggable True
    mousewheel True
    edgescroll (100, 500)  # edge pixels, speed
    xsize 800
    ysize 600

    # Large content area
    add "world_map.png"
```

---

## Screen Actions

Actions define what happens when the player interacts with buttons and other elements.

### Navigation Actions

```renpy
# Show / hide screens
textbutton "Settings" action ShowMenu("preferences")
textbutton "Back" action Return()

# Jump to a script label (ends current interaction)
textbutton "New Game" action Start()
textbutton "Continue" action Start("chapter_2")

# Show overlay screen
textbutton "Map" action Show("map_screen")
textbutton "Close Map" action Hide("map_screen")
```

### Data Actions

```renpy
# Set a variable
textbutton "Easy" action SetVariable("difficulty", "easy")

# Toggle a boolean
textbutton "Fullscreen" action ToggleVariable("fullscreen_mode")

# Preferences (built-in settings)
textbutton "Mute" action Preference("all mute", "toggle")
bar value Preference("text speed")

# Screen-local variables
default selected_tab = "stats"
textbutton "Stats" action SetScreenVariable("selected_tab", "stats")
textbutton "Items" action SetScreenVariable("selected_tab", "items")
```

### Audio Actions

```renpy
# Play sound effect on click
textbutton "Attack!" action [Play("sound", "sfx/sword.ogg"), Function(do_attack)]

# Multiple actions — use a list
textbutton "Accept" action [
    SetVariable("agreed", True),
    Play("sound", "sfx/confirm.ogg"),
    Return(True)
]
```

### Conditional Sensitivity

```renpy
# Disable button when condition is false
textbutton "Use Potion" action Function(use_potion) sensitive (potion_count > 0)

# Hide element conditionally
if has_key:
    textbutton "Unlock Door" action Jump("unlock_scene")
```

---

## Screen Composition with `use`

Break complex screens into reusable pieces:

```renpy
screen header_bar(title):
    frame:
        xfill True
        ysize 60
        background "#222222"
        text title xalign 0.5 yalign 0.5 size 28

screen inventory_screen():
    tag menu
    use header_bar("Inventory")

    viewport:
        ypos 60
        scrollbars "vertical"
        mousewheel True
        xfill True
        yfill True

        vbox:
            spacing 5
            for item in inventory:
                use inventory_slot(item)

screen inventory_slot(item):
    hbox:
        spacing 10
        add item.icon xsize 48 ysize 48
        vbox:
            text item.name size 22
            text item.description size 16 color "#aaaaaa"
        textbutton "Use" action Function(item.use) xalign 1.0
```

---

## Tags and Modal Screens

### Tags — prevent stacking

```renpy
# Only one "menu" tagged screen at a time
screen inventory_screen():
    tag menu
    # ...

screen settings_screen():
    tag menu  # showing this auto-hides inventory_screen
    # ...
```

### Modal — block background interaction

```renpy
screen confirm_dialog(message, yes_action, no_action):
    modal True  # clicks can't reach anything behind this screen
    zorder 200  # ensure it renders on top

    frame:
        xalign 0.5
        yalign 0.5
        xsize 500
        padding (30, 30, 30, 30)

        vbox:
            spacing 20
            text message xalign 0.5
            hbox:
                xalign 0.5
                spacing 40
                textbutton "Yes" action yes_action
                textbutton "No" action no_action
```

---

## Styling Screens

### Style Properties

```renpy
# Inline styles
text "Hello" color "#ff0000" size 24 bold True italic False

# Named styles in gui.rpy or screens.rpy
style custom_button:
    background "#444444"
    hover_background "#666666"
    padding (15, 8, 15, 8)

style custom_button_text:
    color "#ffffff"
    hover_color "#ffcc00"
    size 20

# Apply with style_prefix
screen my_screen():
    style_prefix "custom"
    vbox:
        textbutton "Option A" action NullAction()
        textbutton "Option B" action NullAction()
```

### Transforms on Screen Elements

```renpy
transform slide_in_left:
    xoffset -500
    ease 0.5 xoffset 0

screen notification(msg):
    frame at slide_in_left:
        xalign 0.0
        yalign 0.0
        padding (20, 10, 20, 10)
        text msg
    timer 3.0 action Hide("notification")
```

---

## Important Rules

1. **Screens must be side-effect-free.** Ren'Py re-evaluates screens multiple times (for prediction, rendering). Never put state-changing Python code directly in a screen body — use actions instead.

2. **Use `default` for screen variables, not `$`.** Screen-scoped defaults survive re-evaluation:
   ```renpy
   screen my_screen():
       default page = 1          # CORRECT
       # $ page = 1              # WRONG — resets every evaluation
   ```

3. **`tag menu` on game-menu screens.** Without it, opening settings while inventory is open shows both stacked.

4. **Test with `Shift+I` (screen inspector).** In developer mode, this tool shows the screen tree, styles, and positions — invaluable for debugging layout issues.

---

## Common Pitfalls

1. **Forgetting `modal True` on popups** — the player can click through to the game behind the popup, causing unexpected state changes.
2. **Nested `call screen` without returns** — each `call screen` adds to the call stack. Use `show screen` for overlays that don't need a return value.
3. **Heavy Python in screen bodies** — list comprehensions and function calls run every screen update (~60 times/second). Cache expensive computations outside the screen.
4. **Ignoring `style_prefix`** — manually styling every element creates unmaintainable screens. Use `style_prefix` to apply consistent themes.
5. **Not testing with keyboard navigation** — many players use keyboard or gamepad. Ensure your custom screens have proper focus order.
