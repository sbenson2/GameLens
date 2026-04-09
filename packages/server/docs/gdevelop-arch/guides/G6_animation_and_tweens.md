# Animation and Tween System

> **Category:** guide · **Engine:** GDevelop · **Related:** [G1_events_and_behaviors](G1_events_and_behaviors.md), [G5_ui_and_hud](G5_ui_and_hud.md), [R1_extensions_and_custom_behaviors](../reference/R1_extensions_and_custom_behaviors.md)

GDevelop provides two main ways to animate objects: **sprite animations** (frame-by-frame) and the **Tween behavior** (smooth interpolation of properties over time). Sprite animations handle character walk cycles and visual effects, while tweens handle movement, fading, scaling, and other smooth transitions. This guide covers both systems and how to combine them effectively.

---

## Sprite Animations

Any Sprite object can have multiple named **animations**, each containing a sequence of frames. Animations are managed in the object editor and controlled at runtime through events.

### Key Concepts

- **Animation name** — a string identifier (e.g., `"Idle"`, `"Run"`, `"Jump"`). GDevelop uses names, not numeric indices.
- **Frame** — a single image within an animation. Numbered starting from 0.
- **Speed** — frames per second. Set per-animation in the editor; overridable via events.
- **Loop** — whether the animation restarts when it reaches the last frame. Toggled per-animation.

### Common Animation Actions

| Action | What It Does |
|--------|-------------|
| Change the animation | Switch to a named animation (e.g., `"Run"`) |
| Pause the animation | Freeze on the current frame |
| Resume the animation | Continue playing from where it was paused |
| Change animation speed scale | Multiply the base speed (1 = normal, 0.5 = half, 2 = double) |

### Common Animation Conditions

| Condition | What It Checks |
|-----------|---------------|
| Current animation name is | Whether the object is playing a specific animation |
| Animation is finished | True once a non-looping animation plays its last frame |
| Current frame is | Whether the current frame number equals a value |

### Animation State Machine Pattern

Most games need a simple state machine to prevent animation conflicts. Here's the standard event-sheet pattern:

```
Condition: Player is moving AND is on floor
  → Change animation of Player to "Run"

Condition: Player is NOT moving AND is on floor
  → Change animation of Player to "Idle"

Condition: Player is jumping (Y velocity < 0)
  → Change animation of Player to "Jump"

Condition: Player is falling (Y velocity > 0) AND is NOT on floor
  → Change animation of Player to "Fall"

Condition: Player animation "Attack" is finished
  → Change animation of Player to "Idle"
```

**Important:** Put more specific conditions (Attack, Jump) above generic ones (Idle, Run) in your event sheet. GDevelop processes events top-to-bottom, so the last matching action wins.

---

## The Tween Behavior

The **Tween** behavior smoothly interpolates object properties over a specified duration. Each tween is identified by a **unique string name** (e.g., `"fadeIn"`, `"slideRight"`). This name lets you check on, pause, resume, or stop a specific tween.

### Adding the Tween Behavior

1. Select an object in the Scene editor.
2. Open the **Behaviors** tab → **Add a behavior**.
3. Choose **Tween** from the list.

Once added, the object gains access to all tween actions and conditions.

### What You Can Tween

| Property | Action Name | Notes |
|----------|------------|-------|
| **Position (X)** | Tween object X position | Moves horizontally to a target X |
| **Position (Y)** | Tween object Y position | Moves vertically to a target Y |
| **Position (X,Y)** | Tween object position | Moves to target X,Y simultaneously |
| **Angle** | Tween object angle | Rotates to a target angle in degrees |
| **Width** | Tween object width | Resizes width |
| **Height** | Tween object height | Resizes height |
| **Scale X** | Tween object X scale | Stretches/squashes horizontally (1 = normal) |
| **Scale Y** | Tween object Y scale | Stretches/squashes vertically (1 = normal) |
| **Opacity** | Tween object opacity | 0 = invisible, 255 = fully opaque |
| **Color** | Tween object color | Transitions between two RGB colour values |
| **Object variable** | Tween object variable | Animates any numeric variable on the object |
| **Effect parameter** | Tween effect property | Animates a parameter of an applied shader/effect |

### Easing Functions

Easing controls the acceleration curve of the tween. GDevelop provides a comprehensive set:

| Category | Easing Names | Behaviour |
|----------|-------------|-----------|
| **Linear** | `linear` | Constant speed — no acceleration |
| **Quad** | `easeInQuad`, `easeOutQuad`, `easeInOutQuad` | Gentle acceleration/deceleration |
| **Cubic** | `easeInCubic`, `easeOutCubic`, `easeInOutCubic` | Stronger curve than Quad |
| **Quart/Quint** | `easeInQuart` … `easeInOutQuint` | Progressively more dramatic |
| **Sine** | `easeInSine`, `easeOutSine`, `easeInOutSine` | Smooth, natural motion |
| **Expo** | `easeInExpo`, `easeOutExpo`, `easeInOutExpo` | Starts/ends extremely fast |
| **Circ** | `easeInCirc`, `easeOutCirc`, `easeInOutCirc` | Circular curve |
| **Back** | `easeInBack`, `easeOutBack`, `easeInOutBack` | Overshoots the target, then snaps back |
| **Bounce** | `easeOutBounce`, `bounce`, `bouncePast` | Bouncing ball effect |
| **Elastic** | `elastic` | Spring-like oscillation |

**Choosing an easing:** `easeOutQuad` or `easeOutCubic` are safe defaults for most UI motion. Use `easeOutBack` for playful button pops. Use `easeInOutSine` for camera pans and slow reveals. Reserve `elastic` and `bounce` for game-feel effects that benefit from exaggeration.

### Tween Conditions

| Condition | Use For |
|-----------|---------|
| **Tween exists** | Check if a named tween has been started |
| **Tween is playing** | True while the tween is actively interpolating |
| **Tween has finished** | Fires once when the tween reaches its target — ideal for chaining |

### Chaining Tweens

GDevelop tweens don't have built-in sequencing, but chaining is straightforward with the "has finished" condition:

```
Condition: Tween "slideIn" has finished on DialogBox
  → Tween opacity of DialogBox: identifier "fadeContent", to 255,
    easing easeOutQuad, duration 300ms

Condition: Tween "fadeContent" has finished on DialogBox
  → (enable input, show buttons, etc.)
```

### Destroying Tween Objects

When you destroy an object, its tweens are automatically cleaned up. However, if you restart a tween with the same identifier while one is playing, the old tween is replaced — this is safe and intentional.

---

## Common Patterns

### Juicy Button (Scale Bounce on Hover)

```
Condition: Cursor is on Button
  → Tween X scale of Button: "hoverScale", to 1.1,
    easing easeOutBack, duration 200ms
  → Tween Y scale of Button: "hoverScaleY", to 1.1,
    easing easeOutBack, duration 200ms

Condition: Cursor is NOT on Button
  → Tween X scale of Button: "hoverScale", to 1.0,
    easing easeOutQuad, duration 150ms
  → Tween Y scale of Button: "hoverScaleY", to 1.0,
    easing easeOutQuad, duration 150ms
```

### Screen-Shake via Tween

Rather than manipulating the camera layer manually, tween a container object or the layer's camera position:

```
Action: Tween camera X of layer "Game": "shakeX",
  to CameraX("Game") + RandomInRange(-8, 8),
  easing easeOutQuad, duration 80ms

Condition: Tween "shakeX" has finished
  → Tween camera X of layer "Game": "shakeReturn",
    to original_camera_x, easing easeOutSine, duration 60ms
```

### Fade-In a Scene

```
At the beginning of the scene:
  → Set opacity of ScreenFade to 255 (black overlay, full opacity)
  → Tween opacity of ScreenFade: "fadeIn", to 0,
    easing easeOutQuad, duration 500ms

Condition: Tween "fadeIn" has finished on ScreenFade
  → Delete ScreenFade (or hide it)
```

### Animating a Health Bar

Use a variable tween to smooth the health display:

```
Condition: HealthBar.displayedHP ≠ Player.hp
  → Tween variable "displayedHP" of HealthBar: "hpSmooth",
    to Player.hp, easing easeOutCubic, duration 400ms

Always:
  → Set width of HealthBarFill to
    HealthBar.displayedHP / Player.maxHP * HealthBar.maxWidth
```

---

## Performance Notes

1. **Tweens are lightweight.** Running dozens of simultaneous tweens (e.g., a particle-like floating coins effect) is fine. The overhead is minimal compared to frame-based sprite animations.
2. **Avoid tweening every frame.** Don't start a new tween every frame in an "Always" event — check whether the tween already exists or has finished first.
3. **Sprite animations with many large frames** increase memory usage. Use spritesheets and keep frame dimensions consistent within an animation.
4. **Pause tweens when off-screen** if you have many objects with active tweens scrolled off camera. Use the "Object is on screen" condition to gate tween starts.

---

## Quick Reference

| I want to… | Use |
|------------|-----|
| Play a walk cycle | Sprite animation (`Change animation to "Walk"`) |
| Slide a menu panel in | Tween X position |
| Flash an object red on hit | Tween color (white → red → white) |
| Make a coin float up and fade | Tween Y position + Tween opacity simultaneously |
| Smoothly rotate a compass needle | Tween angle with `easeInOutSine` |
| Animate a number counting up | Tween object variable |
| Create a breathing/pulsing effect | Two tweens on scale that restart each other in a loop |
