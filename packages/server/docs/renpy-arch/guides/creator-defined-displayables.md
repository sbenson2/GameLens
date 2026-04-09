# Creator-Defined Displayables (CDD)

> **Category:** guide · **Engine:** Ren'Py · **Related:** [python-integration](python-integration.md), [screen-language-and-actions](screen-language-and-actions.md), [atl-animation-transforms](atl-animation-transforms.md)

Creator-Defined Displayables let you bypass Ren'Py's built-in images, transforms, and screen language to render arbitrary visuals with Python code. They're the escape hatch for custom gameplay: minigames, procedural effects, data visualizations, and anything that needs per-frame control.

---

## When to Use a CDD

CDDs are powerful but complex. Use them when:

- You need **per-frame rendering logic** that ATL and screen language can't express (particle systems, procedural animation, pixel-level effects).
- You're building an **interactive minigame** that needs direct input handling (click targets, dragging, keyboard control).
- You need to **compose child displayables dynamically** — placing images at runtime-computed positions.

Don't use a CDD for simple layout, UI widgets, or animations that ATL can handle. Screen language is far easier to maintain.

---

## Basic Structure

A CDD is a Python class that subclasses `renpy.Displayable` and overrides `render()`:

```renpy
init python:

    class PulsingCircle(renpy.Displayable):
        """A circle that pulses in size over time."""

        def __init__(self, color="#ff4444", max_radius=50, **kwargs):
            super(PulsingCircle, self).__init__(**kwargs)
            self.color = color
            self.max_radius = max_radius

        def render(self, width, height, st, at):
            # st = time since first shown, at = time since last animation tick
            import math
            radius = int(self.max_radius * (0.5 + 0.5 * math.sin(st * 3)))
            radius = max(radius, 5)
            size = self.max_radius * 2

            # Create a render canvas
            r = renpy.Render(size, size)

            # Use a canvas to draw directly
            canvas = r.canvas()
            canvas.circle(self.color, (size // 2, size // 2), radius)

            # Request redraw on the next frame
            renpy.redraw(self, 0)

            return r

        def visit(self):
            # Return a list of child displayables (none here)
            return []
```

### Using It in Script

```renpy
screen pulsing_demo():
    add PulsingCircle(color="#44aaff", max_radius=40) align (0.5, 0.5)

label start:
    show screen pulsing_demo
    "A blue circle pulses on screen."
    hide screen pulsing_demo
```

---

## The Core Methods

### `render(self, width, height, st, at)`

Called every time Ren'Py needs to draw this displayable. Must return a `renpy.Render` object.

| Parameter | Meaning |
|-----------|---------|
| `width` | Maximum width available (from parent layout) |
| `height` | Maximum height available |
| `st` | **Shown time** — seconds since this displayable was first shown |
| `at` | **Animation time** — seconds since the animation started (resets on interaction) |

**Critical rules:**
- Always return a `renpy.Render`. Never return `None`.
- Call `renpy.redraw(self, delay)` if you need to animate. `delay=0` means "next frame."
- Do **not** store `Render` objects on `self` — they are not pickleable and will break save/load.

### `event(self, ev, x, y, st)`

Called when a pygame event occurs. Return a non-`None` value to end the current interaction with that value as the result. Return `None` to pass the event along.

```renpy
init python:

    class ClickTarget(renpy.Displayable):
        """A target that returns True when clicked inside the radius."""

        def __init__(self, radius=30, **kwargs):
            super(ClickTarget, self).__init__(**kwargs)
            self.radius = radius

        def render(self, width, height, st, at):
            size = self.radius * 2
            r = renpy.Render(size, size)
            canvas = r.canvas()
            canvas.circle("#ff0000", (self.radius, self.radius), self.radius)
            return r

        def event(self, ev, x, y, st):
            import pygame
            import math
            if ev.type == pygame.MOUSEBUTTONDOWN and ev.button == 1:
                # x, y are relative to this displayable's top-left
                dist = math.sqrt((x - self.radius)**2 + (y - self.radius)**2)
                if dist <= self.radius:
                    return True
            return None

        def visit(self):
            return []
```

### `visit(self)`

Return a list of all child displayables so Ren'Py can predict and preload images. If your CDD contains no children, return `[]`. If it wraps other displayables, return them:

```python
def visit(self):
    return [self.background, self.foreground]
```

Failing to implement `visit()` correctly can cause image prediction failures — the player might see loading hitches when your CDD first appears.

### `per_interact(self)`

Called once at the start of each interaction (before the first `render`). Useful for resetting per-interaction state:

```python
def per_interact(self):
    self.clicks_this_interaction = 0
```

---

## Composing Child Displayables

CDDs can render other Ren'Py displayables (images, text, other CDDs) at arbitrary positions:

```renpy
init python:

    class FloatingLabel(renpy.Displayable):
        """Shows a child displayable bobbing up and down."""

        def __init__(self, child, amplitude=10, speed=2.0, **kwargs):
            super(FloatingLabel, self).__init__(**kwargs)
            self.child = renpy.displayable(child)  # Wrap string → displayable
            self.amplitude = amplitude
            self.speed = speed

        def render(self, width, height, st, at):
            import math

            # Render the child first to get its size
            child_render = renpy.render(self.child, width, height, st, at)
            cw, ch = child_render.get_size()

            # Compute vertical offset
            offset_y = self.amplitude * math.sin(st * self.speed)

            # Create our render, sized to fit child + movement range
            total_height = ch + self.amplitude * 2
            r = renpy.Render(cw, int(total_height))
            r.blit(child_render, (0, self.amplitude + offset_y))

            renpy.redraw(self, 0)
            return r

        def visit(self):
            return [self.child]
```

Usage:

```renpy
screen floating_title():
    add FloatingLabel("My Game Title", amplitude=15, speed=1.5):
        align (0.5, 0.3)
```

---

## Save/Load Compatibility

CDDs must be **pickleable** because Ren'Py serializes the game state on save. This means:

- **Do not** store `Render` objects, pygame Surfaces, or file handles on `self`.
- **Do not** store lambdas or nested functions as attributes.
- Transient state (animation progress, cached renders) should be recomputed from `st`/`at` in `render()`.
- If you must store complex state, ensure all objects have `__getstate__`/`__setstate__` or use only basic Python types.

```python
# BAD — Render stored on self breaks saves
def render(self, width, height, st, at):
    self.cached_render = renpy.Render(100, 100)  # NOT pickleable!
    return self.cached_render

# GOOD — Render is a local variable, recomputed each call
def render(self, width, height, st, at):
    r = renpy.Render(100, 100)
    return r
```

---

## Performance Tips

- **Call `renpy.redraw(self, 0)` only when animating.** Static CDDs that don't change after initial render should not request redraws — this saves CPU.
- **Cache child renders within a single `render()` call** using local variables, not `self` attributes.
- **Minimize Python work in `render()`.** This runs every frame during animation. Precompute lookup tables in `__init__`.
- **Use `renpy.render()` for children** instead of manually creating surfaces — this lets Ren'Py handle caching and prediction.
- **Profile with `renpy.profile_screen`** on Ren'Py 8+ to find slow displayables.

---

## Complete Example: Simple Minigame

A click-the-targets minigame using a CDD:

```renpy
init python:

    import pygame
    import math
    import random

    class ClickGame(renpy.Displayable):
        """Click circles before they disappear. Returns the score."""

        def __init__(self, duration=10.0, **kwargs):
            super(ClickGame, self).__init__(**kwargs)
            self.duration = duration
            self.score = 0
            self.targets = []
            self.game_width = 600
            self.game_height = 400

        def per_interact(self):
            if not self.targets:
                self._spawn_target()

        def _spawn_target(self):
            x = random.randint(30, self.game_width - 30)
            y = random.randint(30, self.game_height - 30)
            self.targets.append({"x": x, "y": y, "radius": 25})

        def render(self, width, height, st, at):
            r = renpy.Render(self.game_width, self.game_height)
            canvas = r.canvas()

            # Background
            canvas.rect("#1a1a2e", (0, 0, self.game_width, self.game_height))

            # Draw targets
            for t in self.targets:
                canvas.circle("#ff6b6b", (t["x"], t["y"]), t["radius"])

            # Timer bar
            remaining = max(0, 1.0 - st / self.duration)
            bar_width = int(self.game_width * remaining)
            canvas.rect("#4ecdc4", (0, 0, bar_width, 8))

            # End condition
            if st >= self.duration:
                return r  # Let event handle the return

            renpy.redraw(self, 0)
            return r

        def event(self, ev, x, y, st):
            if st >= self.duration:
                return self.score

            if ev.type == pygame.MOUSEBUTTONDOWN and ev.button == 1:
                hit = False
                for t in self.targets[:]:
                    dist = math.sqrt((x - t["x"])**2 + (y - t["y"])**2)
                    if dist <= t["radius"]:
                        self.targets.remove(t)
                        self.score += 1
                        hit = True
                if hit:
                    self._spawn_target()
                    renpy.restart_interaction()

            return None

        def visit(self):
            return []


label minigame_start:
    "Click the red circles! You have 10 seconds."

    $ result = renpy.call_screen("_click_game")

    "You scored [result] points!"


screen _click_game():
    add ClickGame(duration=10.0) align (0.5, 0.5)
```

This pattern — a CDD that returns a value via `event()`, invoked with `renpy.call_screen()` — is the standard way to embed interactive gameplay within a Ren'Py visual novel.
