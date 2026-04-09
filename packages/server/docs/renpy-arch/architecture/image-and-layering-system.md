# Image and Layering System

> **Category:** architecture · **Engine:** Ren'Py · **Related:** [screenplay-scripting.md](screenplay-scripting.md), [../guides/gui-customization.md](../guides/gui-customization.md), [../guides/atl-animation-transforms.md](../guides/atl-animation-transforms.md)

How Ren'Py organises, composes, and displays images — from basic `image` statements to the layered image system and dynamic displayables. Understanding this architecture is essential for character sprites with outfits, expressions, and accessories that would otherwise require hundreds of pre-rendered combinations.

---

## Image Fundamentals

### Defining Images

In Ren'Py, images are referenced by a **tag** (the first word) and optional **attributes** (subsequent words):

```renpy
# Simple image definitions
image eileen happy = "eileen_happy.png"
image eileen sad = "eileen_sad.png"
image bg park = "backgrounds/park.jpg"
```

When you `show eileen happy`, Ren'Py looks up the image with tag `eileen` and attribute `happy`. Showing `eileen sad` later replaces the previous `eileen` image because they share the same tag.

### Automatic Image Definition

Ren'Py can auto-detect images from the `images/` directory. A file named `eileen happy.png` or `eileen_happy.png` automatically becomes the image `eileen happy` — no explicit `image` statement required. This is controlled by `config.automatic_images`.

---

## Displayables for Image Composition

Ren'Py provides several displayable types for composing images from parts at runtime.

### Composite

Layers multiple displayables at fixed positions within a given size:

```renpy
image eileen custom = Composite(
    (300, 600),
    (0, 0), "eileen_body.png",
    (0, 0), "eileen_clothes.png",
    (50, 50), "eileen_expression_happy.png"
)
```

Displayables are drawn back-to-front (last listed = closest to viewer). `Composite` is the modern name; `LiveComposite` is a deprecated alias that still works.

### ConditionSwitch

Displays different images based on Python conditions, re-evaluated each interaction:

```renpy
image jill = ConditionSwitch(
    "jill_mood == 'drunk'", "jill_drunk.png",
    "jill_mood == 'angry'", "jill_angry.png",
    "True", "jill_neutral.png"
)
```

The first true condition wins. Set `predict_all=True` if all variants should be preloaded to avoid pop-in during transitions.

### DynamicDisplayable

For images that change continuously (timers, health bars, procedural effects):

```python
def countdown_display(st, at):
    remaining = max(0, 10.0 - st)
    return Text(f"{remaining:.1f}"), 0.1  # redraw every 0.1s

image countdown = DynamicDisplayable(countdown_display)
```

The function receives `st` (time since first shown) and `at` (time since last animation change) and returns `(displayable, redraw_delay)`. Return `None` as the delay to stop updating.

### Fixed, Crop, HBox, VBox

- **`Fixed(*children)`** — overlays children using their position properties; fills the screen by default.
- **`Crop((x, y, w, h), child)`** — shows only a rectangular region of a child displayable.
- **`HBox` / `VBox`** — arrange children horizontally or vertically (useful for UI, less so for character sprites).

---

## Layered Image System

The layered image system (introduced in Ren'Py 7) is the recommended way to handle characters with combinatorial appearance variations — expressions, outfits, hairstyles, accessories — without creating separate files for every combination.

### Core Concept

Instead of pre-rendering `eileen_casual_happy`, `eileen_casual_sad`, `eileen_formal_happy`, etc., you define **layers** that stack based on which attributes are active:

```renpy
layeredimage eileen:
    always:
        "eileen_base"

    group outfit:
        attribute casual default:
            "eileen_casual"
        attribute formal:
            "eileen_formal"

    group expression:
        attribute happy default:
            "eileen_happy"
        attribute sad:
            "eileen_sad"
        attribute angry:
            "eileen_angry"
```

Now `show eileen formal angry` draws the base, then the formal outfit layer, then the angry expression layer — from only 6 source images instead of 6+ pre-rendered combinations.

### Layer Types

**always** — Shown regardless of attributes. Use for the unchanging base body, shadows, or outlines:

```renpy
always:
    "eileen_base"
```

**attribute** — Shown when the named attribute is active:

```renpy
attribute glasses:
    "eileen_glasses"
```

**group** — Declares mutually exclusive attributes. Only one member of a group can be active at a time:

```renpy
group expression:
    attribute happy default
    attribute sad
```

The `default` keyword means `happy` is shown when no other group member is explicitly requested.

### Auto-Discovery

The `auto` keyword on a group tells Ren'Py to scan for images matching the naming pattern:

```renpy
layeredimage eileen:
    always:
        "eileen_base"

    group expression auto:
        attribute happy default
        # Ren'Py auto-discovers eileen_expression_sad, eileen_expression_angry, etc.
```

Image names are constructed as: `{layeredimage name}_{group name}_{attribute name}`, with spaces replaced by underscores.

### The `image_format` Property

Map auto-discovered names to a folder structure:

```renpy
layeredimage eileen:
    image_format "sprites/eileen/{image}.png"

    group expression auto:
        attribute happy default
```

The `{image}` placeholder is replaced with the constructed image name.

### Conditional Layers with `when`

Control layer visibility based on which attributes are currently active:

```renpy
attribute hair_ribbon when not hat:
    "eileen_ribbon"
```

Supported operators: `and`, `or`, `not`, plus parentheses for grouping. The `when` expression operates on attribute names, not Python variables.

### Conditional Layers with `if`

For conditions based on Python variables (not attributes), use `if` blocks inside `always`:

```renpy
always:
    if eileen_injured:
        "eileen_bandage"
    elif eileen_tired:
        "eileen_eyebags"
```

The `if` condition is evaluated at runtime, unlike the rest of the `layeredimage` block which executes at init.

### Groups with Variants

Variants let a single attribute produce layers at different depths:

```renpy
layeredimage eileen:
    always:
        "eileen_base"

    group arms variant behind:
        attribute crossed:
            "eileen_arms_crossed_behind"

    group expression:
        attribute happy default:
            "eileen_happy"

    group arms variant infront:
        attribute crossed:
            "eileen_arms_crossed_infront"
```

The `behind` variant layer draws below the expression; the `infront` variant draws above it. Both activate on `show eileen crossed happy`.

### Multiple (Non-Exclusive) Groups

Use the special group name `multiple` to allow combining attributes:

```renpy
group accessories multiple:
    attribute glasses:
        "eileen_glasses"
    attribute earrings:
        "eileen_earrings"
    attribute hat:
        "eileen_hat"
```

Now `show eileen glasses hat` displays both — unlike a normal group where attributes are mutually exclusive.

---

## LayeredImageProxy

Reuse a layered image with a different transform — useful for side images in dialogue:

```python
image side eileen = LayeredImageProxy("eileen",
    Transform(crop=(0, 0, 200, 200), zoom=0.5))
```

The proxy accepts the same attributes as the original layered image.

---

## Attribute Pipeline

When you write `show eileen formal angry`, attributes go through several stages:

1. **Explicit attributes** — `formal` and `angry` from the `show` statement.
2. **`config.adjust_attributes`** — a per-tag callback that can add, remove, or replace attributes programmatically.
3. **`config.default_attribute_callbacks`** — conditionally adds attributes based on game state.
4. **Group defaults** — any `default` attribute is added if no other member of its group is active.
5. **`attribute_function`** — final per-layeredimage callback for last-minute modifications.
6. **Rendering** — each layer checks if its conditions are met and draws accordingly.

### Example: Dynamic Colour Variants

```python
init python:
    def adjust_eileen(names):
        atts = set(names[1:])
        if "ribbon" in atts:
            atts.discard("ribbon")
            atts.add(f"ribbon_{ribbon_color}")  # ribbon_color is a global
        return (names[0], *atts)

    config.adjust_attributes["eileen"] = adjust_eileen
```

---

## Practical Architecture Decisions

### When to Use Layered Images vs. Composite

| | Layered Image | Composite / ConditionSwitch |
|---|---|---|
| **Best for** | Characters with combinatorial variants driven by `show` attributes | One-off composed images or conditions based on Python variables |
| **Defined** | `layeredimage` block (init time) | `image` statement or Python (init time) |
| **Controlled by** | Attributes in `show` statements | Python variables |
| **Auto-discovery** | Yes (`auto` keyword) | No |
| **Mutual exclusion** | Built-in via groups | Manual logic |

### File Organisation

```
images/
├── eileen/
│   ├── base.png
│   ├── expression/
│   │   ├── happy.png
│   │   ├── sad.png
│   │   └── angry.png
│   └── outfit/
│       ├── casual.png
│       └── formal.png
└── backgrounds/
    └── park.jpg
```

Pair with `image_format "images/eileen/{image}.png"` and consistent underscore naming.

### Performance Notes

- Ren'Py automatically crops transparent pixels from layered image components — manual cropping rarely helps.
- Setting `predict_all` on a `ConditionSwitch` or `layeredimage` preloads all variants into memory. Only enable this for frequently-used characters.
- Keep layered image source PNGs at the target resolution. Ren'Py scales at load time, but oversized sources waste memory.
