# Minigame Integration with Creator-Defined Displayables

> **Category:** guide · **Engine:** Ren'Py · **Related:** [python-integration](python-integration.md), [screen-language-and-actions](screen-language-and-actions.md), [architecture/screenplay-scripting](../architecture/screenplay-scripting.md)

How to build interactive minigames inside Ren'Py using Creator-Defined
Displayables (CDDs). CDDs give you a low-level render/event loop — similar to
a pygame game loop — while staying fully integrated with Ren'Py's rollback,
save/load, and screen systems.

---

## When to Use a CDD

Use a CDD when your minigame needs:

- Custom per-frame rendering (particle effects, real-time movement)
- Raw input handling (mouse drag, continuous keyboard input)
- Game logic that runs every frame, not just on clicks

If your minigame is purely choice-based or grid/card-based, Ren'Py screens
with `imagebutton` and `screen language` are simpler and sufficient.

---

## Anatomy of a Creator-Defined Displayable

A CDD is a Python class that subclasses `renpy.Displayable` and overrides
three key methods:

| Method | Purpose |
|--------|---------|
| `render(width, height, st, at)` | Draw the displayable. Called each frame (or when redraw is requested). |
| `event(ev, x, y, st)` | Handle pygame-style events (mouse, keyboard). Return a value to end the interaction. |
| `per_interact()` | Called at the start of each interaction. Use to reset state or trigger initial redraws. |

### Minimal CDD skeleton

```python
init python:

    class PongMinigame(renpy.Displayable):

        def __init__(self, **kwargs):
            super(PongMinigame, self).__init__(**kwargs)
            self.ball_x = 400.0
            self.ball_y = 300.0
            self.ball_dx = 3.0
            self.ball_dy = 2.0
            self.paddle_y = 250.0
            self.old_st = None

        def render(self, width, height, st, at):
            # Calculate delta time
            if self.old_st is None:
                dt = 0.0
            else:
                dt = st - self.old_st
            self.old_st = st

            # Update ball position
            self.ball_x += self.ball_dx * dt * 60
            self.ball_y += self.ball_dy * dt * 60

            # Bounce off walls
            if self.ball_y < 0 or self.ball_y > height - 16:
                self.ball_dy = -self.ball_dy

            # Create a render canvas
            r = renpy.Render(width, height)

            # Draw ball — use a child displayable (Solid)
            ball = renpy.render(Solid("#fff", xysize=(16, 16)), width, height, st, at)
            r.blit(ball, (int(self.ball_x), int(self.ball_y)))

            # Draw paddle
            paddle = renpy.render(Solid("#0cf", xysize=(16, 80)), width, height, st, at)
            r.blit(paddle, (32, int(self.paddle_y)))

            # Request next frame
            renpy.redraw(self, 0)

            return r

        def event(self, ev, x, y, st):
            import pygame

            # Move paddle with mouse
            if ev.type == pygame.MOUSEMOTION:
                self.paddle_y = y - 40

            # Right edge = lose
            if self.ball_x > 780:
                return "lose"

            # Left edge bounce (paddle collision)
            if self.ball_x < 48 and abs(self.ball_y - self.paddle_y) < 48:
                self.ball_dx = abs(self.ball_dx)

            # Escape key to quit minigame
            if ev.type == pygame.KEYDOWN and ev.key == pygame.K_ESCAPE:
                return "quit"

            return None  # Continue interaction

        def per_interact(self):
            renpy.redraw(self, 0)
```

---

## Showing a CDD in Script

Use a `screen` to display the CDD, then call it from your Ren'Py script with
`call screen`. The return value from `event()` is available as `_return`.

```renpy
screen pong_screen():
    # Full-screen CDD
    add PongMinigame()

label play_pong:
    "Let's play a quick game of Pong!"

    call screen pong_screen

    if _return == "lose":
        "You lost! Better luck next time."
    elif _return == "quit":
        "You quit the minigame."
    else:
        "Nice job!"
```

---

## Delta Time and Frame-Rate Independence

Ren'Py passes `st` (show time — seconds since the displayable was first
shown) to both `render()` and `event()`. Compute delta time from successive
`st` values, not from a wall clock.

```python
def render(self, width, height, st, at):
    if self.old_st is None:
        dt = 0.0
    else:
        dt = st - self.old_st
    self.old_st = st

    # Use dt for movement — frame-rate independent
    self.player_x += self.speed * dt
```

> **Warning:** Don't use `time.time()` or `time.perf_counter()`. Those aren't
> affected by Ren'Py's time manipulation (rollback, skip, pause), so your
> minigame will desync with the rest of the engine.

---

## Rendering Child Displayables

CDDs can render any Ren'Py displayable — images, Text, Solid, or even other
CDDs. Use `renpy.render()` to get a child's `Render` object, then `blit` it
onto your canvas.

```python
def render(self, width, height, st, at):
    r = renpy.Render(width, height)

    # Render a Ren'Py image
    bg = renpy.render(Image("minigame_bg.png"), width, height, st, at)
    r.blit(bg, (0, 0))

    # Render text with Ren'Py's Text displayable
    score_text = renpy.render(
        Text("Score: %d" % self.score, size=32, color="#fff"),
        width, height, st, at
    )
    r.blit(score_text, (20, 20))

    renpy.redraw(self, 0)
    return r
```

### Declaring children for prediction

Override `visit()` to return a list of child displayables. This lets Ren'Py
predict and pre-load images used by the minigame, avoiding hitches.

```python
def visit(self):
    return [
        Image("minigame_bg.png"),
        Image("player_sprite.png"),
        Image("enemy_sprite.png"),
    ]
```

---

## Handling Input

The `event()` method receives standard pygame events. Common patterns:

### Mouse clicks

```python
def event(self, ev, x, y, st):
    import pygame

    if ev.type == pygame.MOUSEBUTTONDOWN and ev.button == 1:
        # x, y are relative to the displayable's position
        self.handle_click(x, y)

    return None
```

### Keyboard — continuous movement

For smooth movement, track key state rather than relying on KEYDOWN events.

```python
def __init__(self, **kwargs):
    super().__init__(**kwargs)
    self.keys_held = set()

def event(self, ev, x, y, st):
    import pygame

    if ev.type == pygame.KEYDOWN:
        self.keys_held.add(ev.key)
    elif ev.type == pygame.KEYUP:
        self.keys_held.discard(ev.key)

    renpy.redraw(self, 0)
    return None

def render(self, width, height, st, at):
    import pygame

    dt = ...  # compute as above

    if pygame.K_LEFT in self.keys_held:
        self.player_x -= self.speed * dt
    if pygame.K_RIGHT in self.keys_held:
        self.player_x += self.speed * dt

    # ... draw ...
```

---

## Save/Load and Rollback Compatibility

CDDs participate in Ren'Py's save system automatically **if their `__init__`
arguments and instance variables are pickle-safe**. Follow these rules:

1. **Store all game state as simple types** — ints, floats, strings, lists,
   dicts. Avoid storing pygame surfaces or file handles.
2. **Don't cache non-picklable objects.** Re-create render-only objects (like
   `Solid` or `Image`) inside `render()`, not in `__init__`.
3. **Reset transient state in `per_interact()`** — things like `old_st` that
   shouldn't survive a load.

```python
def per_interact(self):
    self.old_st = None          # Reset delta-time tracking after load/rollback
    renpy.redraw(self, 0)
```

---

## Integrating with Ren'Py Variables

The minigame can read and write Ren'Py store variables directly using the
`store` module. This lets results flow back into the visual novel.

```python
def event(self, ev, x, y, st):
    import store
    import pygame

    if self.game_over:
        store.minigame_score = self.score   # Accessible as "minigame_score" in script
        return "done"

    return None
```

```renpy
label after_minigame:
    "Your final score was [minigame_score]."

    if minigame_score >= 100:
        "Amazing! You unlocked the secret ending."
        $ unlock_ending("secret")
```

---

## Performance Tips for CDDs

- **Call `renpy.redraw(self, 0)` only when needed.** For a paused state or
  menu overlay, skip the redraw to save CPU.
- **Minimize child displayable creation.** Create `Text` or `Solid` objects
  once in `__init__` if their content doesn't change, rather than
  re-creating them every frame.
- **Use `renpy.render()` caching.** Ren'Py caches renders of static
  displayables internally. If your background image doesn't change, just
  re-blit the same render.
- **Limit redraw rate for low-action minigames.** Pass a delay to
  `renpy.redraw(self, 1.0/30)` for a 30 FPS cap when 60 FPS isn't needed.

---

## Alternative: Renpygame Framework

For complex minigames that already have a pygame codebase, the third-party
[Renpygame](https://github.com/DRincs-Productions/Renpygame) library wraps
a pygame game loop so it runs inside Ren'Py. It's useful for porting existing
pygame prototypes, but for new minigames built from scratch, a CDD gives
tighter integration with Ren'Py's save, rollback, and screen systems.
