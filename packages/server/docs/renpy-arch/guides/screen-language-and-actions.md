# Screen Language and Actions

> **Category:** guide · **Engine:** Ren'Py · **Related:** [gui-customization](gui-customization.md), [screenplay-scripting](../architecture/screenplay-scripting.md), [python-integration](python-integration.md)

Ren'Py's screen language is a mostly-declarative DSL for building user interfaces — menus, HUDs, inventories, minigames, and every overlay the player sees. This guide covers the screen language in depth: declaration, displayables, layout containers, actions, the `use` statement, and patterns for building real game UI.

---

## Declaring a Screen

A `screen` statement defines a reusable UI element. Screens live at the top-level of `.rpy` files (like `label` — never nested inside a label).

```renpy
screen stats_overlay():
    # screen body — contains displayables
    frame:
        xalign 1.0
        yalign 0.0
        vbox:
            text "HP: [player_hp]"
            text "Gold: [gold]"
```

### Parameters

Screens accept parameters just like functions:

```renpy
screen character_card(char, show_stats=True):
    frame:
        vbox:
            text char.name size 28
            if show_stats:
                text "STR: [char.strength]"
                text "DEX: [char.dexterity]"
```

### Showing vs Calling

There are two ways to display a screen, and the distinction matters:

| Method | Syntax | Behavior | Use for |
|--------|--------|----------|---------|
| **show** | `show screen stats_overlay` | Displays alongside the game; does not pause | HUDs, notifications, persistent overlays |
| **call** | `call screen inventory_screen` | Pauses the game and waits for the screen to return a value | Menus, dialogues, shops, any UI that needs player input |
| **hide** | `hide screen stats_overlay` | Removes a shown screen | Cleanup |

```renpy
# Show — non-blocking overlay
label start:
    show screen stats_overlay
    "The stats HUD is now visible while dialogue continues."

# Call — blocking interaction
label open_shop:
    $ result = _return  # after call screen, _return holds the value
    call screen shop_screen
    if _return == "bought_sword":
        "You purchased a sword!"
```

---

## Layout Containers

Containers arrange child displayables. The most common:

### vbox / hbox — Linear Layout

```renpy
screen menu_buttons():
    vbox:
        spacing 10          # 10px between children
        xalign 0.5          # center the whole column
        textbutton "New Game" action Start()
        textbutton "Load"    action ShowMenu("load")
        textbutton "Quit"    action Quit(confirm=True)
```

`hbox` works the same but arranges children horizontally.

### frame — Windowed Container

Draws a background behind its children (uses the GUI frame image by default):

```renpy
screen tooltip_box(message):
    frame:
        xpadding 20
        ypadding 10
        xalign 0.5
        yalign 0.8
        text message size 20
```

### grid — Row/Column Layout

Fixed grid with a set number of columns and rows. Every cell must be filled:

```renpy
screen inventory_grid():
    grid 4 3:  # 4 columns, 3 rows = 12 cells
        spacing 5
        for item in inventory[:12]:
            frame:
                xsize 80
                ysize 80
                textbutton item.name action Return(("use", item))
        # Pad remaining cells if inventory < 12
        for i in range(12 - len(inventory[:12])):
            null width 80 height 80
```

### fixed — Absolute Positioning

Children are positioned freely using `xpos`, `ypos`, `xalign`, `yalign`, or the `at` transform:

```renpy
screen world_map():
    fixed:
        add "images/map_bg.png"
        # Place hotspots at specific coordinates
        imagebutton:
            xpos 120 ypos 340
            idle "icons/town_idle.png"
            hover "icons/town_hover.png"
            action Jump("town_scene")
```

### viewport / vpgrid — Scrollable Areas

For content that exceeds the screen area:

```renpy
screen long_list():
    viewport:
        scrollbars "vertical"
        mousewheel True
        draggable True
        vbox:
            for entry in journal_entries:
                text entry
```

`vpgrid` combines viewport scrolling with a grid layout — ideal for large inventories.

---

## Interactive Displayables

### textbutton

The workhorse of Ren'Py UI. Takes a text label and an action:

```renpy
textbutton "Save Game" action FileSave(1, confirm=True)
textbutton "Toggle Sound" action ToggleVariable("sound_enabled", True, False)
```

### imagebutton

Uses images for idle, hover, selected, and insensitive states:

```renpy
imagebutton:
    idle "btn_play_idle.png"
    hover "btn_play_hover.png"
    selected_idle "btn_play_selected.png"
    insensitive "btn_play_grey.png"
    action Start()
```

The `auto` shortcut loads images by naming convention:

```renpy
# Expects: btn_play_idle.png, btn_play_hover.png, etc.
imagebutton auto "btn_play_%s.png" action Start()
```

### bar / vbar

Adjustable value display (volume sliders, health bars):

```renpy
screen settings():
    vbox:
        text "Music Volume"
        bar value Preference("music volume")

        text "Text Speed"
        bar value Preference("text speed")

        text "Player HP"
        bar value StaticValue(player_hp, 100) xsize 300
```

For a read-only bar (no interaction), use `bar value StaticValue(current, max)`.

### input

Text entry field:

```renpy
screen name_input():
    vbox:
        xalign 0.5
        yalign 0.5
        text "Enter your name:"
        input:
            default "Player"
            length 20
            allow "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz "
```

When used inside a `call screen`, the entered text is returned via `_return`.

---

## Actions Reference

Actions define what happens when a button is clicked. They also control button sensitivity (greyed out if the action is unavailable) and selection state (highlighted if active).

### Navigation

```renpy
action Start()                    # Start a new game
action Start("chapter_2")        # Start from a specific label
action Jump("shop_label")        # Jump to label (in-game)
action Call("minigame_label")    # Call label, return after
action Return("sword")           # End call screen, return a value
action ShowMenu("preferences")  # Open a game menu screen
action MainMenu(confirm=True)   # Return to main menu
```

### Data Manipulation

```renpy
action SetVariable("gold", 100)                       # Set global variable
action SetScreenVariable("selected_tab", "weapons")   # Set screen-local variable
action ToggleVariable("fullscreen", True, False)       # Toggle boolean
action IncrementVariable("page", 1)                    # Add to variable
action ToggleSetMembership(equipped_set, "shield")     # Add/remove from set
```

### File Operations

```renpy
action FileSave(slot, confirm=True)    # Save to slot
action FileLoad(slot, confirm=True)    # Load from slot
action FileDelete(slot, confirm=True)  # Delete save
action QuickSave()                      # Quick save
action QuickLoad()                      # Quick load
action FilePage("auto")                 # Switch to auto-save page
```

### Audio

```renpy
action Play("music", "bgm_battle.ogg")   # Play music
action Stop("music", fadeout=1.0)         # Stop with fade
action SetMixer("music", 0.5)            # Set volume
action ToggleMute("music")               # Mute toggle
```

### Utility

```renpy
action Function(my_python_func, arg1, arg2)   # Call a Python function
action Confirm("Are you sure?", yes=Jump("reset"), no=None)
action Notify("Item acquired!")               # Flash notification
action OpenURL("https://example.com")         # Open browser
action NullAction()                            # Do nothing (keep button active)
action [SetVariable("x", 1), Jump("next")]   # Chain multiple actions (list)
```

---

## The use Statement

`use` includes another screen's layout inside the current screen — Ren'Py's composition mechanism:

```renpy
screen item_slot(item):
    frame:
        xsize 64
        ysize 64
        if item:
            imagebutton:
                idle item.icon
                action Return(("select", item))
                tooltip item.description
        else:
            null  # empty slot

screen inventory():
    grid 5 4:
        spacing 4
        for i in range(20):
            use item_slot(inventory_items[i] if i < len(inventory_items) else None)
```

### Scope rules with use

- If the `use`d screen has **parentheses** in the definition: it gets its own scope (parameters are passed explicitly).
- If the `use`d screen has **no parentheses**: it shares the calling screen's scope (reads and writes the same variables).

```renpy
# Separate scope — explicit parameters
screen child_screen(value):
    text "[value]"

screen parent():
    use child_screen("hello")

# Shared scope — no parentheses in definition
screen shared_child:
    text "[message]"  # reads 'message' from parent's scope

screen parent():
    default message = "shared"
    use shared_child
```

---

## Screen Variables (default / SetScreenVariable)

Screen-local variables are declared with `default` inside the screen and modified with `SetScreenVariable`:

```renpy
screen tabbed_menu():
    default current_tab = "items"

    hbox:
        textbutton "Items"  action SetScreenVariable("current_tab", "items")
        textbutton "Skills" action SetScreenVariable("current_tab", "skills")
        textbutton "Map"    action SetScreenVariable("current_tab", "map")

    if current_tab == "items":
        use items_panel
    elif current_tab == "skills":
        use skills_panel
    elif current_tab == "map":
        use map_panel
```

Screen variables are local to the screen instance — they don't pollute the global store and reset when the screen is hidden and reshown.

---

## Tooltips

Any displayable can carry a `tooltip` property. Use the `GetTooltip()` function to display it:

```renpy
screen skill_tree():
    vbox:
        for skill in skills:
            textbutton skill.name:
                action Return(("learn", skill))
                tooltip skill.description

    # Display tooltip at bottom of screen
    $ tt = GetTooltip()
    if tt:
        frame:
            xalign 0.5
            yalign 1.0
            text tt size 18
```

---

## Conditional and Looping Displayables

Screen language supports `if`/`elif`/`else` and `for` directly:

```renpy
screen quest_log():
    vbox:
        text "Active Quests" size 28
        for quest in active_quests:
            hbox:
                if quest.completed:
                    text "{s}" + quest.name + "{/s}"  # strikethrough
                else:
                    text quest.name
                text " — " + quest.description
        if not active_quests:
            text "No active quests." italic True
```

---

## Common Screen Patterns

### Confirmation Dialog

```renpy
screen confirm_dialog(message, yes_action, no_action=None):
    modal True  # blocks interaction with screens underneath
    zorder 200

    frame:
        xalign 0.5
        yalign 0.5
        vbox:
            text message xalign 0.5
            null height 20
            hbox:
                spacing 40
                xalign 0.5
                textbutton "Yes" action yes_action
                textbutton "No"  action (no_action if no_action else Hide("confirm_dialog"))
```

### Notification Toast

```renpy
screen notify(message):
    zorder 200
    timer 2.5 action Hide("notify")

    frame:
        xalign 0.5
        yalign 0.0
        yoffset 30
        text message size 20

    transform:
        alpha 0.0
        linear 0.3 alpha 1.0
        pause 1.8
        linear 0.4 alpha 0.0
```

### Quick Menu (During Dialogue)

```renpy
screen quick_menu():
    zorder 100
    hbox:
        xalign 0.5
        yalign 1.0
        yoffset -10
        spacing 20
        textbutton "Back"    action Rollback()
        textbutton "Skip"    action Skip()
        textbutton "Auto"    action Preference("auto-forward", "toggle")
        textbutton "Save"    action ShowMenu("save")
        textbutton "Prefs"   action ShowMenu("preferences")
```

---

## Screen vs Python Screens

For complex procedural UI, you can write screens in pure Python using `renpy.ui` — but this is rarely needed and harder to maintain:

```renpy
# Ren'Py screen language (preferred)
screen simple():
    text "Hello World"

# Python equivalent (avoid unless you need dynamic displayable construction)
init python:
    def show_simple():
        ui.text("Hello World")
```

Stick to screen language for 95% of cases. Use `init python` classes for game logic, and screen language to display it.

---

## Quick Reference

| Task | Syntax |
|------|--------|
| Declare a screen | `screen name(params):` |
| Show (non-blocking) | `show screen name` |
| Call (blocking) | `call screen name` / access `_return` |
| Hide | `hide screen name` |
| Compose screens | `use other_screen(args)` |
| Screen-local variable | `default var = value` inside screen |
| Modify screen variable | `action SetScreenVariable("var", value)` |
| Chain actions | `action [Action1(), Action2()]` |
| Modal overlay | `modal True` on screen |
| Timed auto-hide | `timer 2.0 action Hide("screen_name")` |
| Tooltip | `tooltip "text"` on displayable, `GetTooltip()` to read |
