# Ren'Py Layered Images

> **Category:** reference · **Engine:** Ren'Py · **Related:** [image-and-layering-system](../architecture/image-and-layering-system.md), [atl-animation-transforms](../guides/atl-animation-transforms.md), [gui-customization](../guides/gui-customization.md)

Layered images compose character sprites from interchangeable parts — base body, outfit, hairstyle, expression — without requiring a static image for every combination. A character with 4 outfits, 4 hairstyles, and 6 expressions would need 96 pre-rendered images; layered images build them dynamically at runtime.

---

## The layeredimage Statement

The `layeredimage` statement declares a composite image built from layers. It replaces the older `LiveComposite` and `ConditionSwitch` patterns with cleaner syntax.

```renpy
layeredimage eileen:

    always:
        "eileen_base"

    group outfit:
        attribute casual default:
            "eileen_casual"
        attribute formal:
            "eileen_formal"
        attribute sporty:
            "eileen_sporty"

    group expression:
        attribute happy default:
            "eileen_happy"
        attribute sad:
            "eileen_sad"
        attribute angry:
            "eileen_angry"
```

This creates an image named `eileen` that can be shown with any combination of attributes:

```renpy
show eileen casual happy
show eileen formal angry
show eileen sporty  # uses default expression (happy)
```

---

## Core Statements Inside layeredimage

### always — Permanent Layers

Layers that are always displayed, regardless of attributes. Typically used for the base body or background.

```renpy
layeredimage eileen:
    always:
        "eileen_base"

    always:
        "eileen_shadow"
        at Transform(alpha=0.3)
```

Multiple `always` blocks are allowed. They render in declaration order (first = back, last = front).

### group — Mutually Exclusive Attributes

A `group` declares a set of attributes where only one can be active at a time. Showing a new attribute from the same group replaces the previous one.

```renpy
group expression:
    attribute happy default:
        "eileen_happy"
    attribute sad:
        "eileen_sad"
```

- `default` marks which attribute is used when none from this group is specified.
- Group names are for organization — they don't appear in the `show` statement.

### attribute — Individual Layer Options

Attributes are the names you use in `show` statements. They can exist inside a group (mutually exclusive) or at the top level (independent, can stack).

```renpy
layeredimage eileen:
    always:
        "eileen_base"

    # Independent attribute — can be shown alongside any group attribute
    attribute glasses:
        "eileen_glasses"

    group expression:
        attribute happy default:
            "eileen_happy"
        attribute sad:
            "eileen_sad"
```

```renpy
show eileen happy glasses    # base + happy + glasses
show eileen sad glasses      # base + sad + glasses
show eileen sad              # base + sad, no glasses
```

### if — Conditional Layers

Display a layer based on a Python expression. Evaluated every interaction.

```renpy
layeredimage eileen:
    always:
        "eileen_base"

    if wounded:
        "eileen_bandage"

    group expression:
        attribute happy default:
            "eileen_happy"
```

The `if` statement can include `elif` and `else`:

```renpy
    if health < 25:
        "eileen_critical"
    elif health < 50:
        "eileen_hurt"
    else:
        "eileen_healthy"
```

---

## The auto Keyword

The `auto` keyword tells Ren'Py to scan its image directory and automatically add attributes for any images that match the group's naming pattern.

```renpy
layeredimage eileen:
    always:
        "eileen_base"

    group expression auto:
        attribute happy default
```

With `auto`, Ren'Py looks for images named `eileen_<attribute>` and adds them as attributes of the group. If you have `eileen_happy.png`, `eileen_sad.png`, and `eileen_angry.png` in your images directory, all three become available without explicit declaration.

You can still explicitly declare attributes alongside `auto` — explicit declarations take priority. This is useful for setting `default` or overriding a specific attribute's transform.

### auto at the Top Level

```renpy
layeredimage eileen:
    always:
        "eileen_base"

    group outfit auto
    group expression auto:
        attribute happy default
```

---

## Transforms and Positioning

Every layer can have a transform applied with `at`, and position offsets with `pos`, `xpos`, `ypos`, etc.

```renpy
layeredimage eileen:
    always:
        "eileen_base"

    group expression:
        attribute happy default:
            "eileen_happy"
            pos (100, 50)

        attribute sad:
            "eileen_sad"
            at Transform(alpha=0.9)
```

### Common Transform Properties

```renpy
    attribute blush:
        "eileen_blush"
        at Transform(alpha=0.6)    # semi-transparent overlay
        pos (120, 80)              # offset from top-left of layeredimage
```

---

## Attribute Conditions with when

The `when` clause (Ren'Py 8+) controls when an attribute or layer appears based on other attributes. This replaces the older `if_any`, `if_all`, and `if_not` properties.

```renpy
layeredimage eileen:
    always:
        "eileen_base"

    group expression:
        attribute happy default:
            "eileen_happy"
        attribute angry:
            "eileen_angry"

    # Only show tears when sad expression is active
    attribute tears:
        "eileen_tears"
        when "sad"

    # Show sweat when angry AND in sporty outfit
    attribute sweat:
        "eileen_sweat"
        when "angry" and "sporty"
```

---

## Programmatic Attribute Control with adjust_attributes

The `adjust_attributes` callback lets you dynamically modify attributes at show-time — adding, removing, or replacing attributes based on game logic.

```renpy
init python:
    def eileen_adjust(attributes):
        # If wounded, force a specific expression
        if wounded and "happy" in attributes:
            attributes = tuple(
                a for a in attributes if a != "happy"
            ) + ("sad",)
        return attributes

layeredimage eileen:
    adjust_attributes eileen_adjust

    always:
        "eileen_base"

    group expression:
        attribute happy default:
            "eileen_happy"
        attribute sad:
            "eileen_sad"
```

---

## Defining Layered Images in Python

For highly dynamic setups (procedurally generated characters, mod support), you can define layered images entirely in Python:

```renpy
init python:
    import renpy.store as store

    layeredimage = renpy.display.image.LayeredImage(
        attributes=[
            renpy.display.image.Attribute(
                group=None,
                attribute="base",
                image="eileen_base",
                default=True,
            ),
            renpy.display.image.Attribute(
                group="expression",
                attribute="happy",
                image="eileen_happy",
                default=True,
            ),
            renpy.display.image.Attribute(
                group="expression",
                attribute="sad",
                image="eileen_sad",
            ),
        ],
    )

    renpy.image("eileen", layeredimage)
```

---

## Migration from LiveComposite / ConditionSwitch

Layered images (introduced in Ren'Py 7) replace the older `LiveComposite` and `ConditionSwitch` patterns. Here's how common patterns translate:

### LiveComposite → layeredimage

```renpy
# OLD — LiveComposite
image eileen composite = LiveComposite(
    (300, 500),
    (0, 0), "eileen_base.png",
    (0, 0), "eileen_happy.png",
)

# NEW — layeredimage
layeredimage eileen:
    always:
        "eileen_base"
    group expression:
        attribute happy default:
            "eileen_happy"
```

### ConditionSwitch → if statement

```renpy
# OLD — ConditionSwitch
image eileen health = ConditionSwitch(
    "player_hp < 25", "eileen_critical.png",
    "player_hp < 50", "eileen_hurt.png",
    "True", "eileen_healthy.png",
)

# NEW — layeredimage with if
layeredimage eileen:
    always:
        "eileen_base"
    if player_hp < 25:
        "eileen_critical"
    elif player_hp < 50:
        "eileen_hurt"
    else:
        "eileen_healthy"
```

---

## File Organization for Layered Sprites

Organize sprite parts in a directory structure that mirrors your layeredimage groups:

```
images/
└── eileen/
    ├── base.png
    ├── outfit/
    │   ├── casual.png
    │   ├── formal.png
    │   └── sporty.png
    ├── expression/
    │   ├── happy.png
    │   ├── sad.png
    │   └── angry.png
    └── accessories/
        ├── glasses.png
        └── hat.png
```

Then in your Ren'Py image definitions:

```renpy
# Map directory images to Ren'Py image names
image eileen_base = "images/eileen/base.png"
image eileen_casual = "images/eileen/outfit/casual.png"
image eileen_happy = "images/eileen/expression/happy.png"
# ... etc.
```

Or use Ren'Py's auto-image-naming: place files in `images/` with underscored names (`eileen_happy.png`), and Ren'Py registers them automatically as `eileen happy`.

---

## Performance Notes

- Layered images are **composited at display time**, not precomputed. For most visual novels this is negligible, but if you have 10+ layers with transforms, consider using `cache=True` on the `layeredimage` for static combinations.
- The `auto` keyword adds startup time proportional to the number of registered images. For large image sets, explicit attribute declarations are faster to parse.
- **Image prediction** works with layered images — Ren'Py will preload layers it expects to show next.

---

## Common Pitfalls

1. **Forgetting `default` on a group** — if no attribute in a group has `default`, showing the character without specifying that group shows nothing for those layers.

2. **Attribute name collisions** — attribute names must be unique across all groups in a layeredimage. You can't have `happy` in both an `expression` group and a `mood` group.

3. **Layer ordering** — layers render in declaration order. Put base/body layers first, expressions in the middle, and accessories/overlays last.

4. **Not using `auto` image naming** — manually declaring 50 attributes when consistent filenames would let `auto` handle it is a common time sink.

5. **Showing attributes from the wrong image** — `show eileen happy` only works if `eileen` is a layeredimage with a `happy` attribute. If you also have a static `image eileen happy`, the static one takes priority.
