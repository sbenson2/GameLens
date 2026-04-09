# Choices, Branching & Variables

> **Category:** guide · **Engine:** Ren'Py · **Related:** [screenplay-scripting](../architecture/screenplay-scripting.md), [python-integration](python-integration.md), [save-system-and-persistence](save-system-and-persistence.md)

The `menu` statement is the core mechanic for player agency in Ren'Py visual
novels. This guide covers basic choices, conditional branching, variable tracking,
affinity/point systems, and advanced patterns like menu sets and nested decisions.

---

## Basic Choices

A `menu` block presents the player with labeled options. Each option leads to an
indented code block that executes when selected.

### Ren'Py script

```renpy
label morning:
    "You wake up to the sound of birds outside."
    
    menu:
        "What do you do?"
        
        "Go for a run":
            "You lace up your shoes and head out into the cool morning air."
            jump park_scene
        
        "Stay in bed":
            "You pull the blanket over your head. Five more minutes..."
            jump late_morning
        
        "Check your phone":
            "Three missed calls. That can't be good."
            jump phone_scene
```

The quoted string before the choices (`"What do you do?"`) is the **menu caption**
— it displays as narration above the choice buttons. It's optional but recommended
for context.

### How control flows

After the player picks an option and its block executes, control continues to the
next statement **after** the menu — unless a `jump` or `call` redirects it. This
means you can have choices that modify state but don't branch:

```renpy
menu:
    "Pick a snack for the road."
    
    "Apple":
        $ snack = "apple"
    
    "Granola bar":
        $ snack = "granola_bar"

"You pocket the [snack] and head out."  # continues here regardless of choice
```

---

## Variables and State Tracking

Use `default` to declare variables at the top of your script. These are
automatically saved/loaded and rollback-safe.

```renpy
# Declare at top of script — outside any label
default affection_kai = 0
default affection_robin = 0
default has_key = False
default player_path = ""
```

**Important:** Always use `default`, not `define`, for values that change during
gameplay. `define` is for constants (character objects, config values). `default`
ensures proper save/load and rollback behavior.

### Modifying variables from choices

Use the `$` prefix for single-line Python statements inside Ren'Py script:

```renpy
menu:
    "Kai looks nervous. What do you say?"
    
    "You've got this.":
        $ affection_kai += 2
        kai "Thanks... that means a lot."
    
    "Don't mess it up.":
        $ affection_kai -= 1
        kai "Gee, thanks for the confidence."
    
    "Say nothing.":
        "You give Kai a small nod."
        $ affection_kai += 1
```

---

## Conditional Choices

Append an `if` clause after a choice string to show it only when a condition is
true. If the condition is false, the choice **does not appear at all** by default.

```renpy
default has_lockpick = False
default strength = 5

label locked_door:
    "The door is locked."
    
    menu:
        "Force it open" if strength >= 8:
            "You slam your shoulder into the door. It gives way."
            jump room_inside
        
        "Pick the lock" if has_lockpick:
            "You kneel down and work the lockpick. Click."
            jump room_inside
        
        "Look for another way":
            "You search for a window or back entrance."
            jump find_alternate
```

### Showing disabled choices (greyed out)

By default, failing conditions hide the choice entirely. To show unavailable
choices as greyed-out (so players know they exist), set in your config:

```renpy
# In options.rpy or a Python block
define config.menu_include_disabled = True
```

With this enabled, choices whose conditions are false appear but cannot be
selected — useful for signaling to players that other paths exist.

### Complex conditions

Conditions can use any Python expression. For readability, wrap multi-line
conditions in parentheses:

```renpy
menu:
    "Negotiate peace" if (
            diplomacy_skill >= 7
            and faction_trust >= 5
            and not war_declared):
        "Against all odds, you broker a ceasefire."
    
    "Fight":
        "You draw your weapon."
```

---

## Affinity / Point Systems

A common pattern tracks relationship points per character and branches based on
accumulated values.

### Setup

```renpy
default affection_kai = 0
default affection_robin = 0
default affection_sage = 0
default chosen_partner = ""
```

### Accumulating points through choices

```renpy
label festival:
    "The festival is in full swing. Who do you spend time with?"
    
    menu:
        "Find Kai at the archery booth":
            $ affection_kai += 3
            "Kai grins when they see you approaching."
        
        "Join Robin at the fortune teller's tent":
            $ affection_robin += 3
            "Robin waves you over excitedly."
        
        "Sit with Sage by the bonfire":
            $ affection_sage += 3
            "Sage shifts over to make room for you."
```

### Branching on accumulated points

```renpy
label chapter_3_partner:
    # Determine who has the highest affection
    python:
        scores = {
            "kai": affection_kai,
            "robin": affection_robin,
            "sage": affection_sage,
        }
        chosen_partner = max(scores, key=scores.get)
    
    if chosen_partner == "kai":
        "Kai steps forward. \"I'm coming with you.\""
    elif chosen_partner == "robin":
        "Robin catches up to you. \"You're not leaving without me.\""
    else:
        "Sage appears at your side. \"Let's go.\""
```

---

## Menu Sets (Exhaustive Choices)

A `set` clause tracks which choices the player has already picked, hiding them on
revisit. This is perfect for "explore all options" conversations.

```renpy
default talked_about = set()

label tavern_talk:
    "The innkeeper leans on the counter."
    
    menu talk_menu(set talked_about):
        "Ask about the missing merchant":
            "The innkeeper lowers their voice. \"Left three nights ago. Never came back.\""
            jump talk_menu
        
        "Ask about the road north":
            "\"Bandits. Wolves. Take your pick.\""
            jump talk_menu
        
        "Ask about local rumors":
            "\"They say the old tower lights up at midnight.\""
            jump talk_menu
        
        "Leave":
            "You thank the innkeeper and step outside."
```

How this works:

1. The `set talked_about` clause passes a set variable to the menu.
2. Each time the player picks an option, its caption string is added to the set.
3. On revisit (via `jump talk_menu`), already-picked options are hidden.
4. When only "Leave" remains (or the player picks it), the conversation ends.

**Note:** The set stores the choice's **display string**, so changing the string
text will reset tracking for that choice.

---

## Nested Menus

Menus can be nested inside choice blocks for follow-up decisions:

```renpy
label shop:
    "Welcome to the potion shop!"
    
    menu:
        "Browse healing potions":
            menu:
                "Small potion (10 gold)" if gold >= 10:
                    $ gold -= 10
                    $ inventory.append("small_potion")
                    "You buy a small healing potion."
                
                "Large potion (25 gold)" if gold >= 25:
                    $ gold -= 25
                    $ inventory.append("large_potion")
                    "You buy a large healing potion."
                
                "Never mind":
                    pass
        
        "Browse weapons":
            jump weapon_shop
        
        "Leave":
            "You exit the shop."
```

Keep nesting shallow (2 levels max) — deep nesting makes scripts hard to follow.
For complex shop systems, use `call`/`return` with separate labels instead.

---

## Boolean Flags for Story Branches

For binary story events, boolean flags are cleaner than point values:

```renpy
default saved_the_cat = False
default told_the_truth = False
default visited_ruins = False

# Set flags from choices
label crossroads:
    menu:
        "Save the stray cat":
            $ saved_the_cat = True
            "You scoop up the shivering kitten."
        
        "Keep walking":
            "You hurry past. There's no time."

# Check flags later
label ending:
    if saved_the_cat and told_the_truth:
        jump good_ending
    elif saved_the_cat or told_the_truth:
        jump neutral_ending
    else:
        jump bad_ending
```

---

## Python Integration for Complex Logic

For decision logic that exceeds simple if/else, use a `python` block:

```renpy
label determine_ending:
    python:
        # Weighted scoring system
        score = 0
        score += affection_kai * 2 if chosen_partner == "kai" else affection_kai
        score += 10 if saved_the_cat else 0
        score += 5 if told_the_truth else -5
        score += visited_ruins * 3  # bool * int works in Python
        
        if score >= 20:
            ending = "perfect"
        elif score >= 10:
            ending = "good"
        elif score >= 0:
            ending = "neutral"
        else:
            ending = "bad"
    
    jump expression "ending_" + ending  # dynamic jump: ending_perfect, ending_good, etc.
```

The `jump expression` syntax evaluates a Python expression to determine the label
name at runtime — powerful for data-driven branching.

---

## Common Pitfalls

**Using `define` instead of `default` for mutable state:**
`define` values are not saved, not rollback-safe, and reset on load. Always use
`default` for anything that changes during gameplay.

**Forgetting the fallback choice:**
If all conditional choices fail and there's no unconditional option, the menu is
skipped entirely — the player gets no choice at all. Always include at least one
unconditional option as a fallback.

**Rollback and `$` statements:**
Ren'Py's rollback system automatically undoes `$` variable changes when the player
rolls back. This works correctly with `default` variables. If you use Python
objects with side effects (file I/O, network calls), wrap them in
`renpy.block_rollback()`.

**String-based set tracking:**
Menu sets track choices by their display string. If you localize your game (change
strings for different languages), the set won't recognize previously-picked
translations. Use a separate tracking variable for localized games:

```renpy
default _asked_merchant = False

label tavern:
    menu:
        "Ask about the merchant" if not _asked_merchant:
            $ _asked_merchant = True
            "..."
```
